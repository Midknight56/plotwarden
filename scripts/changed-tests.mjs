// Run the tests that cover a changed file. No network, no model turn, no edit.
//
//   node scripts/changed-tests.mjs [--list] [--git] [--root <dir>] [path ...]
//
// Paths come from the arguments, or from standard input (the save hook sends
// JSON or a plain path), or from the working tree with --git. A path maps to
// every test file that imports it, directly or through other files. A missing,
// unknown or untested path runs a small fixed gate instead. --list prints the
// test files and runs nothing. Exit 2 when the folder is missing.
//
// Each run that runs tests (or finds none) appends one line to
// .local/hook-log.jsonl: time, event, path, tests, passed, failed, exit. The
// event name comes from standard input, or is "direct" when it holds nothing.
// No session ID and no absolute path is written (spec 06 Z20).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveImport, scanSource, walkSourceFiles } from "./lib/imports.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const GATE = ["tests/unit/limits.test.ts", "tests/unit/site.test.ts"];
const EXTRA = { "scripts/oracle.py": ["tests/oracle/compare.test.ts"] };
const TEST_FILE = /^tests\/.*\.test\.ts$/;
const STDIN_WAIT_MS = 1000;
const LOG_FILE = "hook-log.jsonl";
const EVENT_NAME = /^[A-Za-z0-9._-]{1,64}$/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", ".mts", "/index.ts", "/index.tsx"];

function parseArgs(argv) {
  const options = { list: false, git: false, root: resolve(here, ".."), paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list") options.list = true;
    else if (arg === "--git") options.git = true;
    else if (arg === "--root" && argv[i + 1] !== undefined) {
      options.root = resolve(argv[i + 1]);
      i += 1;
    } else options.paths.push(arg);
  }
  return options;
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((done) => {
    let data = "";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      process.stdin.destroy();
      done(data);
    };
    const timer = setTimeout(finish, STDIN_WAIT_MS);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
  });
}

/** The saved path in what the hook sent: JSON with a known key, or a plain path. */
function pathFromInput(text) {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const nested = data.tool_input ?? {};
      for (const value of [data.path, data.file, data.filePath, data.file_path, nested.file_path, nested.path, nested.filePath]) {
        if (typeof value === "string" && value !== "") return value;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  return trimmed.split(/\r?\n/)[0].trim().replace(/^["']|["']$/g, "");
}

/** The event name in what the hook sent: "direct" for nothing, "unknown" for no usable name. */
function eventFromInput(text) {
  const trimmed = text.trim();
  if (trimmed === "") return "direct";
  if (!trimmed.startsWith("{")) return "unknown";
  try {
    const data = JSON.parse(trimmed);
    for (const value of [data.hook_event_name, data.event, data.eventName, data.trigger]) {
      if (typeof value === "string" && EVENT_NAME.test(value)) return value;
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

/** Passed and failed counts from the runner's summary line, or null when it printed none. */
function countsFrom(output) {
  const line = output
    .replace(ANSI, "")
    .split(/\r?\n/)
    .find((l) => /^\s*Tests\s+\d+\s+(failed|passed)/.test(l));
  if (line === undefined) return { passed: null, failed: null };
  const passed = /(\d+)\s+passed/.exec(line);
  const failed = /(\d+)\s+failed/.exec(line);
  return { passed: passed ? Number(passed[1]) : 0, failed: failed ? Number(failed[1]) : 0 };
}

/** Append one line to the hook log. A write error warns and changes nothing else. */
function writeLog(root, entry) {
  try {
    const dir = join(root, ".local");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, LOG_FILE), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    console.error("changed-tests: the hook log could not be written");
  }
}

function gitPaths(root) {
  const run = spawnSync("git", ["status", "--porcelain", "-uall"], { cwd: root, encoding: "utf8" });
  if (run.status !== 0) return [];
  const paths = [];
  for (const line of run.stdout.split("\n")) {
    if (line.length < 4) continue;
    const flags = line.slice(0, 2);
    if (flags.includes("D")) continue;
    let name = line.slice(3);
    if (name.includes(" -> ")) name = name.split(" -> ").pop();
    paths.push(name.replace(/^"|"$/g, ""));
  }
  return paths;
}

/** A path inside the folder, written with forward slashes, or undefined. */
function inside(root, input) {
  const slashed = input.replace(/\\/g, "/");
  let rel = slashed;
  if (isAbsolute(input)) {
    rel = relative(root, input).replace(/\\/g, "/");
    if (rel.startsWith("..") || isAbsolute(rel)) return undefined;
  }
  rel = rel.replace(/^\.\//, "");
  const full = join(root, rel);
  return existsSync(full) && statSync(full).isFile() ? rel : undefined;
}

function importers(root) {
  const files = walkSourceFiles(root);
  const known = new Set(files);
  const reverse = new Map();
  for (const file of files) {
    const { imports } = scanSource(readFileSync(join(root, file), "utf8"));
    for (const spec of imports) {
      const resolved = resolveImport(file, spec);
      if (resolved.kind !== "relative") continue;
      const target = EXTENSIONS.map((ext) => resolved.target + ext).find((candidate) => known.has(candidate));
      if (target === undefined) continue;
      if (!reverse.has(target)) reverse.set(target, new Set());
      reverse.get(target).add(file);
    }
  }
  return { reverse, known };
}

function testsFor(root, changed) {
  const { reverse } = importers(root);
  const tests = new Set();
  const seen = new Set();
  const queue = [...changed];
  for (const extra of changed.flatMap((p) => EXTRA[p] ?? [])) if (existsSync(join(root, extra))) tests.add(extra);
  while (queue.length > 0) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    if (TEST_FILE.test(next)) tests.add(next);
    for (const importer of reverse.get(next) ?? []) queue.push(importer);
  }
  return [...tests].sort();
}

function runnerPath(root) {
  const candidates = [
    process.env.PLOTWARDEN_TEST_RUNNER,
    join(root, "node_modules", "vitest", "vitest.mjs"),
    join(here, "..", "node_modules", "vitest", "vitest.mjs"),
  ];
  return candidates.find((c) => c !== undefined && c !== "" && existsSync(c));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { root } = options;
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`changed-tests: folder not found: ${root}`);
    return 2;
  }

  const input = await readStdin();
  const event = eventFromInput(input);
  let given = options.paths;
  let fromInput;
  if (given.length === 0 && !options.git) {
    fromInput = pathFromInput(input);
    if (fromInput !== undefined) given = [fromInput];
  }
  if (given.length === 0 && options.git) given = gitPaths(root);

  const changed = given.map((p) => inside(root, p)).filter((p) => p !== undefined);
  let tests = changed.length > 0 ? testsFor(root, changed) : [];
  if (tests.length === 0) tests = GATE.filter((file) => existsSync(join(root, file)));

  if (options.list) {
    for (const file of tests) console.log(file);
    return 0;
  }
  const entry = (exit, ran, counts) => ({
    time: new Date().toISOString(),
    event,
    path: !options.git && given.length === 1 && changed.length === 1 ? changed[0] : null,
    tests: ran,
    passed: counts.passed,
    failed: counts.failed,
    exit,
  });
  const none = { passed: null, failed: null };
  if (tests.length === 0) {
    console.log("changed-tests: no tests to run");
    writeLog(root, entry(0, [], none));
    return 0;
  }
  const runner = runnerPath(root);
  if (runner === undefined) {
    console.error("changed-tests: vitest is not installed. Run npm ci.");
    writeLog(root, entry(2, [], none));
    return 2;
  }
  console.log(`changed-tests: running ${tests.length} file${tests.length === 1 ? "" : "s"}`);
  for (const file of tests) console.log(`  ${file}`);
  const run = spawnSync(process.execPath, [runner, "run", ...tests], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  const exit = run.status ?? 1;
  writeLog(root, entry(exit, tests, countsFrom(`${run.stdout ?? ""}\n${run.stderr ?? ""}`)));
  return exit;
}

process.exitCode = await main();

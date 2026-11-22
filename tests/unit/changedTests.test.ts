// Support for the save hook and the stop hook (00-contracts R25.3): map a saved
// file to the tests that cover it, and run them. No network, no model turn.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "changed-tests.mjs");

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const FILES: Record<string, string> = {
  "template/src/a.ts": "export const a = 1;\n",
  "template/src/b.ts": 'import { a } from "./a";\nexport const b = a + 1;\n',
  "template/src/c.ts": "export const c = 3;\n",
  "tests/helpers/h.ts": "export const h = 1;\n",
  "tests/unit/a.test.ts": 'import { a } from "../../template/src/a";\nexport const t = a;\n',
  "tests/unit/b.test.ts": 'import { b } from "../../template/src/b";\nexport const t = b;\n',
  "tests/unit/other.test.ts": 'import { h } from "../helpers/h";\nexport const t = h;\n',
  "tests/unit/limits.test.ts": "export const t = 1;\n",
  "tests/unit/site.test.ts": "export const t = 1;\n",
  "tests/oracle/compare.test.ts": "export const t = 1;\n",
  "scripts/oracle.py": "print(1)\n",
  "docs/readme.md": "# Notes\n",
};

const GATE = ["tests/unit/limits.test.ts", "tests/unit/site.test.ts"];

function tree(): string {
  const dir = mkdtempSync(join(tmpdir(), "pw-changed-"));
  made.push(dir);
  for (const [path, text] of Object.entries(FILES)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return dir;
}

function list(root: string, args: string[], input?: string) {
  const run = spawnSync(process.execPath, [SCRIPT, "--list", "--root", root, ...args], {
    encoding: "utf8",
    input: input ?? "",
  });
  return {
    status: run.status,
    files: run.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== ""),
    err: run.stderr,
  };
}

describe("a saved path maps to its tests", () => {
  const root = tree();

  it("finds the test that imports a file, and the tests that reach it through another file", () => {
    expect(list(root, ["template/src/a.ts"]).files).toEqual(["tests/unit/a.test.ts", "tests/unit/b.test.ts"]);
    expect(list(root, ["template/src/b.ts"]).files).toEqual(["tests/unit/b.test.ts"]);
  });

  it("returns a test file as itself", () => {
    expect(list(root, ["tests/unit/a.test.ts"]).files).toEqual(["tests/unit/a.test.ts"]);
  });

  it("finds the tests that use a helper", () => {
    expect(list(root, ["tests/helpers/h.ts"]).files).toEqual(["tests/unit/other.test.ts"]);
  });

  it("maps the oracle script to its comparison test", () => {
    expect(list(root, ["scripts/oracle.py"]).files).toEqual(["tests/oracle/compare.test.ts"]);
  });

  it("joins several paths without repeats, in order", () => {
    const result = list(root, ["template/src/b.ts", "template/src/a.ts", "tests/unit/b.test.ts"]);
    expect(result.files).toEqual(["tests/unit/a.test.ts", "tests/unit/b.test.ts"]);
  });

  it("accepts a path with back slashes or an absolute path inside the folder", () => {
    expect(list(root, ["template\\src\\b.ts"]).files).toEqual(["tests/unit/b.test.ts"]);
    expect(list(root, [join(root, "template", "src", "b.ts")]).files).toEqual(["tests/unit/b.test.ts"]);
  });

  it("runs the small gate for a source file no test reaches", () => {
    expect(list(root, ["template/src/c.ts"]).files).toEqual(GATE);
  });
});

describe("the save hook reads the path from standard input", () => {
  const root = tree();

  it("reads JSON with a path, a file or a filePath", () => {
    for (const key of ["path", "file", "filePath", "file_path"]) {
      const result = list(root, [], JSON.stringify({ [key]: "template/src/b.ts" }));
      expect(result.files, key).toEqual(["tests/unit/b.test.ts"]);
    }
  });

  it("reads a path inside a tool input", () => {
    const result = list(root, [], JSON.stringify({ tool_input: { file_path: join(root, "template", "src", "b.ts") } }));
    expect(result.files).toEqual(["tests/unit/b.test.ts"]);
  });

  it("reads a plain path", () => {
    expect(list(root, [], "template/src/b.ts\n").files).toEqual(["tests/unit/b.test.ts"]);
  });

  it("prefers a path given as an argument", () => {
    expect(list(root, ["template/src/a.ts"], JSON.stringify({ path: "template/src/b.ts" })).files).toEqual([
      "tests/unit/a.test.ts",
      "tests/unit/b.test.ts",
    ]);
  });
});

describe("an unknown or missing path runs the small fixed gate", () => {
  const root = tree();

  it.each([
    ["no input at all", [], ""],
    ["empty JSON", [], "{}"],
    ["text that is not JSON or a path to a file", [], "this is not a file\n"],
    ["a path that does not exist", ["template/src/missing.ts"], ""],
    ["a file that is not code", ["docs/readme.md"], ""],
    ["a path outside the folder", [join(tmpdir(), "elsewhere.ts")], ""],
  ] as [string, string[], string][])("%s", (_name, args, input) => {
    const result = list(root, args, input);
    expect(result.status).toBe(0);
    expect(result.files).toEqual(GATE);
  });

  it("does not wait forever for standard input that never closes", async () => {
    const started = Date.now();
    const child = spawn(process.execPath, [SCRIPT, "--list", "--root", root], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => void (out += String(d)));
    const code = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve(-1);
      }, 6000);
      child.on("close", (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(out.split("\n").filter((l) => l.trim() !== "")).toEqual(GATE);
  });

  it("exits 2 when the folder is missing", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--list", "--root", join(tmpdir(), "pw-nowhere-xyz")], { encoding: "utf8" });
    expect(run.status).toBe(2);
  });
});

describe("the working tree mode", () => {
  it("lists tests that exist in this repository", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--list", "--git"], { cwd: ROOT, encoding: "utf8" });
    expect(run.status).toBe(0);
    const files = run.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^tests\/.+\.test\.ts$/);
  });
});

describe("running", () => {
  it("runs the tests it found and passes on their exit code", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "tests/unit/limits.test.ts"], { cwd: ROOT, encoding: "utf8" });
    expect(run.stdout + run.stderr).toContain("limits.test.ts");
    expect(run.stdout + run.stderr).toMatch(/Tests\s+\d+ passed/);
    expect(run.status).toBe(0);
  });

  it("passes the file list to the runner and returns the runner's exit code", () => {
    const root = tree();
    const runner = join(root, "fake-runner.mjs");
    writeFileSync(runner, 'console.log("ARGS " + process.argv.slice(2).join(" "));\nprocess.exit(3);\n');
    const run = spawnSync(process.execPath, [SCRIPT, "--root", root, "template/src/a.ts"], {
      encoding: "utf8",
      env: { ...process.env, PLOTWARDEN_TEST_RUNNER: runner },
    });
    expect(run.status).toBe(3);
    expect(run.stdout).toContain("ARGS run tests/unit/a.test.ts tests/unit/b.test.ts");
  });

  it("runs from the folder it was given", () => {
    const root = tree();
    const runner = join(root, "where.mjs");
    writeFileSync(runner, 'console.log("CWD " + process.cwd());\n');
    const run = spawnSync(process.execPath, [SCRIPT, "--root", root, "template/src/a.ts"], {
      encoding: "utf8",
      env: { ...process.env, PLOTWARDEN_TEST_RUNNER: runner },
    });
    expect(run.status).toBe(0);
    const reported = /CWD (.+)/.exec(run.stdout)?.[1]?.trim() ?? "";
    expect(reported.replace(/\\/g, "/").toLowerCase()).toBe(root.replace(/\\/g, "/").toLowerCase());
  });
});

// The hook log (06 Z20): every run of the script that runs tests appends one line.
const LOG_KEYS = ["event", "exit", "failed", "passed", "path", "tests", "time"];

function fakeRunner(root: string, summary: string, code: number): string {
  const runner = join(root, "fake-runner.mjs");
  writeFileSync(runner, `console.log(${JSON.stringify(summary)});\nprocess.exit(${code});\n`);
  return runner;
}

function runLogged(root: string, args: string[], input: string, runner?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (runner !== undefined) env.PLOTWARDEN_TEST_RUNNER = runner;
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8", input, env });
}

function logLines(root: string): string[] {
  const file = join(root, ".local", "hook-log.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((l) => l !== "");
}

describe("the hook log", () => {
  it("appends one line for a file save event, with the fields and nothing else", () => {
    const root = tree();
    const runner = fakeRunner(root, "      Tests  2 passed (2)", 0);
    const before = Date.now();
    const input = JSON.stringify({
      hook_event_name: "PostFileSave",
      session_id: "sess-7f3a",
      account: "someone@example.test",
      file_path: "template/src/b.ts",
    });
    const run = runLogged(root, [], input, runner);
    const after = Date.now();
    expect(run.status).toBe(0);
    const lines = logLines(root);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? "");
    expect(Object.keys(entry).sort()).toEqual(LOG_KEYS);
    expect(entry.event).toBe("PostFileSave");
    expect(entry.path).toBe("template/src/b.ts");
    expect(entry.tests).toEqual(["tests/unit/b.test.ts"]);
    expect(entry.passed).toBe(2);
    expect(entry.failed).toBe(0);
    expect(entry.exit).toBe(0);
    expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(entry.time)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(entry.time)).toBeLessThanOrEqual(after + 1000);
    const first = lines[0] ?? "";
    expect(first).not.toContain("sess-7f3a");
    expect(first).not.toContain("example.test");
    expect(first.toLowerCase()).not.toContain("session");
    expect(first.toLowerCase()).not.toContain("account");

    runLogged(root, [], input, runner);
    expect(logLines(root)).toHaveLength(2);
  });

  it("appends one line for a run with --git, and reads the event name from standard input", () => {
    const root = tree();
    const runner = fakeRunner(root, "      Tests  2 passed (2)", 0);
    const run = runLogged(root, ["--git"], JSON.stringify({ hook_event_name: "Stop" }), runner);
    expect(run.status).toBe(0);
    const lines = logLines(root);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? "");
    expect(Object.keys(entry).sort()).toEqual(LOG_KEYS);
    expect(entry.event).toBe("Stop");
    expect(entry.path).toBeNull();
    expect(entry.tests).toEqual(GATE);
    expect(entry.exit).toBe(0);
  });

  it("says direct when nothing is on standard input", () => {
    const root = tree();
    const runner = fakeRunner(root, "      Tests  2 passed (2)", 0);
    runLogged(root, ["template/src/b.ts"], "", runner);
    runLogged(root, ["--git"], "", runner);
    const entries = logLines(root).map((l) => JSON.parse(l));
    expect(entries.map((e) => e.event)).toEqual(["direct", "direct"]);
    expect(entries[0].path).toBe("template/src/b.ts");
    expect(entries[1].path).toBeNull();
  });

  it("says unknown when standard input has no usable event name", () => {
    const root = tree();
    const runner = fakeRunner(root, "      Tests  2 passed (2)", 0);
    runLogged(root, [], "template/src/b.ts\n", runner);
    runLogged(root, [], JSON.stringify({ file_path: "template/src/b.ts" }), runner);
    runLogged(root, [], JSON.stringify({ hook_event_name: join(root, "secret", "name") }), runner);
    const entries = logLines(root).map((l) => JSON.parse(l));
    expect(entries.map((e) => e.event)).toEqual(["unknown", "unknown", "unknown"]);
    expect(entries[0].path).toBe("template/src/b.ts");
  });

  it("logs the exit code and the failed count of a failing test file", () => {
    const base = join(ROOT, ".local");
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, "hook-fail-"));
    made.push(root);
    mkdirSync(join(root, "tests", "unit"), { recursive: true });
    writeFileSync(
      join(root, "tests", "unit", "bad.test.ts"),
      'import { expect, it } from "vitest";\nit("is wrong on purpose", () => {\n  expect(1 + 1).toBe(3);\n});\n',
    );
    const run = runLogged(root, [], JSON.stringify({ hook_event_name: "PostFileSave", file_path: "tests/unit/bad.test.ts" }));
    expect(run.status).not.toBe(0);
    const lines = logLines(root);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? "");
    expect(entry.exit).toBe(run.status);
    expect(entry.exit).not.toBe(0);
    expect(entry.failed).toBe(1);
    expect(entry.passed).toBe(0);
    expect(entry.tests).toEqual(["tests/unit/bad.test.ts"]);
    expect(entry.path).toBe("tests/unit/bad.test.ts");
    expect(run.stdout + run.stderr).toContain("bad.test.ts");
  });

  it("logs the exit code and counts of a runner that fails some tests", () => {
    const root = tree();
    const runner = fakeRunner(root, "      Tests  1 failed | 4 passed (5)", 1);
    const run = runLogged(root, ["template/src/a.ts"], "", runner);
    expect(run.status).toBe(1);
    const entry = JSON.parse(logLines(root)[0] ?? "");
    expect(entry).toMatchObject({ exit: 1, failed: 1, passed: 4 });
  });

  it("writes null counts when the runner prints no summary, and still writes a line when no test is found", () => {
    const root = tree();
    runLogged(root, ["template/src/a.ts"], "", fakeRunner(root, "no summary here", 3));
    const entry = JSON.parse(logLines(root)[0] ?? "");
    expect(entry).toMatchObject({ exit: 3, passed: null, failed: null });

    const empty = mkdtempSync(join(tmpdir(), "pw-changed-"));
    made.push(empty);
    const run = runLogged(empty, [], "");
    expect(run.status).toBe(0);
    expect(JSON.parse(logLines(empty)[0] ?? "")).toMatchObject({ event: "direct", tests: [], passed: null, failed: null, exit: 0 });
  });

  it("holds no home folder path, no folder path and no path outside the folder", () => {
    const root = tree();
    const runner = fakeRunner(root, "      Tests  2 passed (2)", 0);
    runLogged(root, [join(root, "template", "src", "b.ts")], "", runner);
    runLogged(root, [], JSON.stringify({ hook_event_name: "PostFileSave", path: join(root, "template", "src", "b.ts") }), runner);
    runLogged(root, [], JSON.stringify({ hook_event_name: "PostFileSave", path: join(tmpdir(), "elsewhere.ts") }), runner);
    runLogged(root, [], JSON.stringify({ hook_event_name: "PostFileSave", path: join(homedir(), "notes.ts") }), runner);
    runLogged(root, [], join(root, "template", "src", "missing.ts") + "\n", runner);
    const lines = logLines(root);
    expect(lines).toHaveLength(5);
    const entries = lines.map((l) => JSON.parse(l));
    expect(entries.map((e) => e.path)).toEqual(["template/src/b.ts", "template/src/b.ts", null, null, null]);
    const slashed = (text: string) => text.replace(/\\/g, "/").toLowerCase();
    const forbidden = [homedir(), tmpdir(), root].map(slashed);
    for (const line of lines) {
      const text = slashed(JSON.stringify(JSON.parse(line)));
      for (const bad of forbidden) expect(text, bad).not.toContain(bad);
      expect(text).not.toMatch(/[a-z]:\//);
      expect(text).not.toContain("/users/");
    }
  });

  it("writes no line for --list, which runs no test", () => {
    const root = tree();
    list(root, ["template/src/a.ts"]);
    expect(logLines(root)).toEqual([]);
  });
});

// The review-desk-drift power (spec 06, task 6.35, Z24). The checker runs as a child process, from a copy of the power
// folder, as an installed power would run. Temporary folders stand in for the register and for the Review Desk.
// Every expected value is typed here. Hashes are worked out with node:crypto, not read from the script.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProof } from "../helpers/proofLog";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const POWER = "review-desk-drift";
const SKILL = "compare-desk-copy";

/** The eight pairs: path in the register, path in the Desk copy under vendor/exchange. */
const PAIRS: [string, string][] = [
  ["template/src/exchange/schema.ts", "exchange/schema.ts"],
  ["template/src/exchange/packet.ts", "exchange/packet.ts"],
  ["template/src/exchange/compare.ts", "exchange/compare.ts"],
  ["template/src/exchange/slip.ts", "exchange/slip.ts"],
  ["template/src/calendar.ts", "calendar.ts"],
  ["template/src/limits.ts", "limits.ts"],
  ["template/src/types.ts", "types.ts"],
  ["tests/fixtures/exchange-vectors.json", "vectors.json"],
];
const LIMITS_SOURCE = "template/src/limits.ts";
const LIMITS_DESK = "vendor/exchange/limits.ts";

const sha = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const bodyOf = (to: string): string => (to.endsWith(".json") ? `{"file":"${to}","value":1}\n` : `// ${to}\nexport const value = 1;\n`);

let work: string;
let installed: string;
let script: string;
let n = 0;

interface Project {
  register: string;
  desk: string;
}

function put(file: string, text: string | Buffer): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A register and a Desk whose eight files all match the Desk's saved record. */
function makeProject(): Project {
  n += 1;
  const register = join(work, `p${n}`, "register");
  const desk = join(work, `p${n}`, "desk");
  put(join(register, "scripts", "lib", "exchange-files.json"), `${JSON.stringify(PAIRS, null, 2)}\n`);
  const entries = [];
  for (const [from, to] of PAIRS) {
    const text = bodyOf(to);
    put(join(register, from), text);
    put(join(desk, "vendor", "exchange", to), text);
    entries.push({ path: to, sourcePath: from, bytes: Buffer.byteLength(text), sha256: sha(text) });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  put(join(desk, "vendor", "exchange", "provenance.json"), `${JSON.stringify({ format: "plot.exchange.vendor.v1", files: entries }, null, 2)}\n`);
  put(join(register, "README.md"), "The register.\n");
  put(join(desk, "package.json"), '{"name":"desk"}\n');
  return { register, desk };
}

function readProvenance(p: Project): { files: { path: string; sourcePath: string; bytes: number; sha256: string }[] } & Record<string, unknown> {
  return JSON.parse(readFileSync(join(p.desk, "vendor", "exchange", "provenance.json"), "utf8"));
}
function writeProvenance(p: Project, value: unknown): void {
  put(join(p.desk, "vendor", "exchange", "provenance.json"), `${JSON.stringify(value, null, 2)}\n`);
}

/** Every file under a folder with its hash, to show that a run changed nothing. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const next = rel === "" ? name : `${rel}/${name}`;
      if (statSync(full).isDirectory()) visit(full, next);
      else out[next] = sha(readFileSync(full));
    }
  };
  visit(dir, "");
  return out;
}
const snapshotOf = (p: Project) => ({ register: snapshot(p.register), desk: snapshot(p.desk), outside: snapshot(dirname(p.register)) });

function run(args: string[]) {
  const out = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { code: out.status, stdout: out.stdout, stderr: out.stderr, lines: out.stdout.split("\n").filter((l) => l !== "") };
}
const check = (p: Project) => run(["--register", p.register, "--desk", p.desk]);

/** Change one byte and keep the size. */
function flipByte(file: string): void {
  const text = readFileSync(file, "utf8");
  expect(text).toContain("value = 1");
  writeFileSync(file, text.replace("value = 1", "value = 2"));
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "review-desk-drift-"));
  installed = join(work, "installed");
  for (const name of ["plot-checks", POWER]) {
    const from = join(REPO, "powers", name);
    if (existsSync(from)) cpSync(from, join(installed, name), { recursive: true });
  }
  script = join(installed, POWER, "skills", SKILL, "scripts", "compare.mjs");
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("the power is found in a copied installation folder", () => {
  /** The installed powers whose keywords hold the word. */
  const powersFor = (keyword: string): string[] =>
    readdirSync(installed)
      .filter((name) => {
        const file = join(installed, name, "plugin.json");
        return existsSync(file) && (JSON.parse(readFileSync(file, "utf8")).keywords as string[]).includes(keyword);
      })
      .sort();

  it("the keyword Review Desk copy leads to compare-desk-copy and its bundled script", () => {
    expect(powersFor("Review Desk copy")).toEqual([POWER]);
    expect(existsSync(join(installed, POWER, "skills", SKILL, "SKILL.md"))).toBe(true);
    expect(existsSync(join(installed, POWER, "skills", SKILL, "scripts", "compare.mjs"))).toBe(true);
  });

  it("plugin.json has the name, description and keywords of the design, and the other fields of plot-checks", () => {
    const mine = JSON.parse(readFileSync(join(installed, POWER, "plugin.json"), "utf8"));
    const first = JSON.parse(readFileSync(join(installed, "plot-checks", "plugin.json"), "utf8"));
    expect(mine).toEqual({
      $schema: first.$schema,
      name: POWER,
      version: first.version,
      description: "Compare the committee file rules in Plotwarden and Review Desk and report which files differ.",
      author: first.author,
      keywords: ["Review Desk copy", "committee file rules", "return slip rules"],
      license: first.license,
    });
    expect(first.license).toBe("MIT");
    expect(existsSync(join(installed, POWER, "mcp.json"))).toBe(false);
  });

  it("the skill header names the skill and says when to use it", () => {
    const text = readFileSync(join(installed, POWER, "skills", SKILL, "SKILL.md"), "utf8");
    expect(text.startsWith("---\n")).toBe(true);
    expect(text).toContain(`\nname: ${SKILL}\n`);
    expect(text).toContain(
      "\ndescription: Use when someone asks whether the Review Desk copy of the committee file rules matches the current Plotwarden register.\n",
    );
    expect(text).toContain("scripts/compare.mjs");
    expect(text).toContain("--register");
    expect(text).toContain("--desk");
  });
});

describe("the one list of eight file pairs", () => {
  const listFile = join(REPO, "scripts", "lib", "exchange-files.json");

  it("scripts/lib/exchange-files.json holds the eight pairs, in the order the exporter wrote them", () => {
    expect(existsSync(listFile) ? JSON.parse(readFileSync(listFile, "utf8")) : null).toEqual(PAIRS);
  });

  it("the exporter reads that list and holds none of its own", () => {
    const text = readFileSync(join(REPO, "scripts", "export-exchange.mjs"), "utf8");
    expect(text).toContain("exchange-files.json");
    expect(text).not.toContain("template/src/calendar.ts");
    expect(text).not.toContain("tests/fixtures/exchange-vectors.json");
  });

  it("the exporter still writes the eight files of the list, with the same source paths", () => {
    const dest = join(work, "exported");
    const out = spawnSync(process.execPath, [join(REPO, "scripts", "export-exchange.mjs"), dest], { cwd: REPO, encoding: "utf8" });
    expect(out.status, out.stderr).toBe(0);
    const provenance = JSON.parse(readFileSync(join(dest, "provenance.json"), "utf8"));
    expect(provenance.files.map((f: { sourcePath: string; path: string }) => [f.sourcePath, f.path])).toEqual(
      [...PAIRS].sort((a, b) => (a[1] < b[1] ? -1 : 1)),
    );
  });
});

describe("the checker matches both sides against the saved record", () => {
  it("all eight files match despite an unrelated edit in both projects: both counts 8/8, exit 0", () => {
    const p = makeProject();
    put(join(p.register, "README.md"), "A different readme.\n");
    put(join(p.register, "package.json"), '{"version":"9.9.9"}\n');
    put(join(p.desk, "package.json"), '{"name":"desk","version":"2.0.0"}\n');
    const out = check(p);
    expect(out.lines).toEqual(["Desk matches 8/8", "Register matches 8/8"]);
    expect(out.code).toBe(0);
    expect(out.stderr).toBe("");
  });

  it("one register byte changed with the size kept: Desk 8/8, register 7/8, the exact path, exit 1", () => {
    const p = makeProject();
    flipByte(join(p.register, LIMITS_SOURCE));
    const size = Buffer.byteLength(bodyOf("limits.ts"));
    const out = check(p);
    expect(out.lines).toEqual(["Desk matches 8/8", "Register matches 7/8", `Register differs ${LIMITS_SOURCE} (${size} bytes, expected ${size})`]);
    expect(out.code).toBe(1);
  });

  it("a register file that grew says both byte counts", () => {
    const p = makeProject();
    const file = join(p.register, LIMITS_SOURCE);
    writeFileSync(file, `${readFileSync(file, "utf8")}export function checkRecordRoom() {}\n`);
    const before = Buffer.byteLength(bodyOf("limits.ts"));
    const after = before + Buffer.byteLength("export function checkRecordRoom() {}\n");
    const out = check(p);
    expect(out.lines).toEqual(["Desk matches 8/8", "Register matches 7/8", `Register differs ${LIMITS_SOURCE} (${after} bytes, expected ${before})`]);
    expect(out.code).toBe(1);
  });

  it("one Desk byte changed: the Desk alone is flagged. Then the same change in the register flags both sides. Exit 1 both times", () => {
    const p = makeProject();
    const size = Buffer.byteLength(bodyOf("limits.ts"));
    flipByte(join(p.desk, LIMITS_DESK));
    const first = check(p);
    expect(first.lines).toEqual(["Desk matches 7/8", "Register matches 8/8", `Desk differs ${LIMITS_DESK} (${size} bytes, expected ${size})`]);
    expect(first.code).toBe(1);

    flipByte(join(p.register, LIMITS_SOURCE));
    expect(readFileSync(join(p.register, LIMITS_SOURCE))).toEqual(readFileSync(join(p.desk, LIMITS_DESK)));
    const second = check(p);
    expect(second.lines).toEqual([
      "Desk matches 7/8",
      "Register matches 7/8",
      `Desk differs ${LIMITS_DESK} (${size} bytes, expected ${size})`,
      `Register differs ${LIMITS_SOURCE} (${size} bytes, expected ${size})`,
    ]);
    expect(second.code).toBe(1);
  });

  it("never writes to either folder, on a match or on a difference", () => {
    const p = makeProject();
    const clean = snapshotOf(p);
    expect(check(p).code).toBe(0);
    expect(snapshotOf(p)).toEqual(clean);
    flipByte(join(p.register, LIMITS_SOURCE));
    const changed = snapshotOf(p);
    expect(check(p).code).toBe(1);
    expect(snapshotOf(p)).toEqual(changed);
  });

  it("uses node built ins only and holds no call that writes", () => {
    const text = readFileSync(join(REPO, "powers", POWER, "skills", SKILL, "scripts", "compare.mjs"), "utf8");
    const imports = [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec.startsWith("node:"), spec).toBe(true);
    expect(text).not.toMatch(/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|rename|renameSync|unlink|unlinkSync|copyFile|copyFileSync|createWriteStream|fetch)\b/);
  });
});

describe("bad input exits 2, names the input, prints no count and changes nothing", () => {
  interface Case {
    name: string;
    spoil: (p: Project) => void;
    says: RegExp;
  }
  const cases: Case[] = [
    { name: "a register file is missing", spoil: (p) => rmSync(join(p.register, LIMITS_SOURCE)), says: /template\/src\/limits\.ts.*missing/i },
    { name: "a Desk file is missing", spoil: (p) => rmSync(join(p.desk, LIMITS_DESK)), says: /vendor\/exchange\/limits\.ts.*missing/i },
    { name: "the Desk record is missing", spoil: (p) => rmSync(join(p.desk, "vendor", "exchange", "provenance.json")), says: /provenance\.json.*missing/i },
    { name: "the Desk record is not JSON", spoil: (p) => put(join(p.desk, "vendor", "exchange", "provenance.json"), "{ not json"), says: /provenance\.json.*not valid JSON/i },
    { name: "the register has no list of pairs", spoil: (p) => rmSync(join(p.register, "scripts", "lib", "exchange-files.json")), says: /exchange-files\.json.*missing/i },
    {
      name: "the Desk record lists a file twice",
      spoil: (p) => {
        const rec = readProvenance(p);
        rec.files.push({ ...rec.files[0]! });
        writeProvenance(p, rec);
      },
      says: /calendar\.ts.*twice/i,
    },
    {
      name: "the Desk record lists a file that is not one of the eight",
      spoil: (p) => {
        const rec = readProvenance(p);
        rec.files.push({ path: "extra.ts", sourcePath: "template/src/extra.ts", bytes: 1, sha256: sha("x") });
        writeProvenance(p, rec);
      },
      says: /extra\.ts.*not one of the eight/i,
    },
    {
      name: "the Desk record leaves one of the eight out",
      spoil: (p) => {
        const rec = readProvenance(p);
        rec.files = rec.files.filter((f) => f.path !== "types.ts");
        writeProvenance(p, rec);
      },
      says: /types\.ts.*missing/i,
    },
    {
      name: "a Desk record path goes outside the folder",
      spoil: (p) => {
        const rec = readProvenance(p);
        rec.files[0]!.path = "../../outside.ts";
        writeProvenance(p, rec);
      },
      says: /\.\.\/\.\.\/outside\.ts.*outside the folder/i,
    },
    {
      name: "a Desk record source path is an absolute path",
      spoil: (p) => {
        const rec = readProvenance(p);
        rec.files[1]!.sourcePath = resolve(p.register, "..", "secret.ts");
        writeProvenance(p, rec);
      },
      says: /secret\.ts.*outside the folder/i,
    },
    {
      name: "the register list holds a path outside the folder",
      spoil: (p) => {
        const list = PAIRS.map(([from, to]) => [from === LIMITS_SOURCE ? "../limits.ts" : from, to]);
        put(join(p.register, "scripts", "lib", "exchange-files.json"), `${JSON.stringify(list)}\n`);
      },
      says: /\.\.\/limits\.ts.*outside the folder/i,
    },
  ];

  it.each(cases)("$name", ({ spoil, says }) => {
    const p = makeProject();
    put(join(dirname(p.register), "outside.ts"), "export const outside = 1;\n");
    put(join(dirname(p.register), "secret.ts"), "export const secret = 1;\n");
    spoil(p);
    const before = snapshotOf(p);
    const out = check(p);
    expect(out.code, out.stdout).toBe(2);
    expect(out.stderr).toMatch(says);
    expect(out.stdout).toBe("");
    expect(snapshotOf(p)).toEqual(before);
  });

  it.each([
    ["no arguments", [] as string[]],
    ["no --desk", ["--register", "somewhere"]],
    ["no --register", ["--desk", "somewhere"]],
    ["an argument it does not know", ["--register", "a", "--desk", "b", "--fix"]],
  ])("%s", (_name, args) => {
    const out = run(args);
    expect(out.code).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).toMatch(/--register/);
  });

  it("a folder that does not exist", () => {
    const p = makeProject();
    const out = run(["--register", join(p.register, "none"), "--desk", p.desk]);
    expect(out.code).toBe(2);
    expect(out.stderr).toMatch(/none.*(?:missing|not a folder)/i);
    expect(out.stdout).toBe("");
  });
});

describe("the proof check accepts only a recorded skill call, then the script call, then its output", () => {
  const SCRIPT = "C:\\Users\\someone\\.kiro\\powers\\installed\\review-desk-drift\\skills\\compare-desk-copy\\scripts\\compare.mjs";
  const skill = { action: "readSkill", powerName: POWER, skillName: SKILL };
  const call = { tool: "shell", command: `node "${SCRIPT}" --register ./plotwarden --desk ./plotwarden-review-desk` };
  const output = { output: "Desk matches 8/8\nRegister matches 7/8\nRegister differs template/src/limits.ts (4530 bytes, expected 4162)\n" };
  const claim = { role: "assistant", text: "Desk matches 8/8. Register matches 7/8. The check passed." };

  it("refuses a chat reply that claims success and holds neither tool call", () => {
    const verdict = checkProof([claim]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.length).toBe(2);
  });

  it("refuses a claim that comes after the calls but is not their output", () => {
    expect(checkProof([skill, call, claim]).ok).toBe(false);
  });

  it("refuses a skill read with no script call", () => {
    expect(checkProof([skill, claim]).ok).toBe(false);
  });

  it("refuses a script call and its output with no skill read", () => {
    expect(checkProof([call, output]).ok).toBe(false);
  });

  it("refuses the script call before the skill read", () => {
    expect(checkProof([call, output, skill]).ok).toBe(false);
  });

  it("refuses a skill read of another power or another skill", () => {
    expect(checkProof([{ ...skill, powerName: "plot-checks" }, call, output]).ok).toBe(false);
    expect(checkProof([{ ...skill, skillName: "review-adapter" }, call, output]).ok).toBe(false);
  });

  it("refuses a command that runs another script or leaves out a folder", () => {
    expect(checkProof([skill, { command: "node ./compare.mjs --register a --desk b" }, output]).ok).toBe(false);
    expect(checkProof([skill, { command: `node ${SCRIPT} --register a` }, output]).ok).toBe(false);
  });

  it("refuses output that lacks one of the two match lines", () => {
    expect(checkProof([skill, call, { output: "Desk matches 8/8\n" }]).ok).toBe(false);
  });

  it("accepts the skill read, the script call and the output, nested in a transcript", () => {
    const transcript = { messages: [claim, { toolUses: [skill] }, { toolUses: [call], results: [output] }, claim] };
    expect(checkProof(transcript)).toEqual({ ok: true, reasons: [] });
  });

  it("accepts the output on the same record as the command", () => {
    expect(checkProof([skill, { ...call, ...output }]).ok).toBe(true);
  });
});

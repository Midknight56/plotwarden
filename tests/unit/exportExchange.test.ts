// X9: the pinned copy of the exchange module (spec 05, task 5.11). The script runs as a child process,
// as the Desk task will run it. Counts come from hand-totals.md section 6.7. Hashes are worked out here
// with node:crypto, not read from the script.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadVectors, vectorFailures } from "../helpers/exchangeVectors";
import type { ExchangeModule } from "../helpers/exchangeVectors";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "export-exchange.mjs");
const WORK = join(REPO, ".local", `exchange-test-${randomBytes(4).toString("hex")}`);

/** What the plan says is copied, by its path in the repository and its path in the copy. */
const PURE: [string, string][] = [
  ["template/src/exchange/schema.ts", "exchange/schema.ts"],
  ["template/src/exchange/packet.ts", "exchange/packet.ts"],
  ["template/src/exchange/compare.ts", "exchange/compare.ts"],
  ["template/src/exchange/slip.ts", "exchange/slip.ts"],
  ["template/src/calendar.ts", "calendar.ts"],
  ["template/src/limits.ts", "limits.ts"],
  ["template/src/types.ts", "types.ts"],
];
const VECTORS: [string, string] = ["tests/fixtures/exchange-vectors.json", "vectors.json"];

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const read = (path: string): Buffer => readFileSync(path);

function run(args: string[], cwd = REPO) {
  const out = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { code: out.status, stdout: out.stdout, stderr: out.stderr };
}

/** Every file under a folder, as sorted paths with forward slashes. */
function list(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(dir, full).replace(/\\/g, "/"));
    }
  };
  if (existsSync(dir)) visit(dir);
  return out.sort();
}

let n = 0;
let dest: string;
beforeEach(() => {
  n += 1;
  dest = join(WORK, `copy-${n}`);
});
afterAll(() => rmSync(WORK, { recursive: true, force: true }));

/** A copy of just the files the script reads, with no git folder, so a test can spoil one. */
function fakeRoot(): string {
  const root = join(WORK, `root-${n}`);
  for (const [from] of [...PURE, VECTORS]) {
    mkdirSync(dirname(join(root, from)), { recursive: true });
    cpSync(join(REPO, from), join(root, from));
  }
  cpSync(join(REPO, "package.json"), join(root, "package.json"));
  cpSync(join(REPO, "LICENSE"), join(root, "LICENSE"));
  return root;
}

describe("the files it writes (hand totals 6.7)", () => {
  it("writes 9 files: the 4 exchange files, the 3 pure files they import, vectors.json and provenance.json", () => {
    const out = run([dest]);
    expect(out.code, out.stderr).toBe(0);
    expect(list(dest)).toEqual(
      ["calendar.ts", "exchange/compare.ts", "exchange/packet.ts", "exchange/schema.ts", "exchange/slip.ts", "limits.ts", "provenance.json", "types.ts", "vectors.json"],
    );
  });

  it("copies each file byte for byte, so every relative import stays valid", () => {
    expect(run([dest]).code).toBe(0);
    for (const [from, to] of [...PURE, VECTORS]) {
      expect(read(join(dest, to)).equals(read(join(REPO, from))), to).toBe(true);
    }
  });

  it("accepts --to as well as a plain folder", () => {
    const out = run(["--to", dest]);
    expect(out.code, out.stderr).toBe(0);
    expect(list(dest)).toHaveLength(9);
  });

  it("has no import that leaves the folder, and only zod from outside", () => {
    expect(run([dest]).code).toBe(0);
    for (const file of list(dest).filter((f) => f.endsWith(".ts"))) {
      const text = read(join(dest, file)).toString("utf8");
      for (const m of text.matchAll(/from\s+"([^"]+)"/g)) {
        const spec = m[1] as string;
        if (!spec.startsWith(".")) {
          expect(spec, file).toBe("zod");
          continue;
        }
        const target = resolve(dirname(join(dest, file)), `${spec}.ts`);
        expect(target.startsWith(dest), `${file} -> ${spec}`).toBe(true);
        expect(existsSync(target), `${file} -> ${spec}`).toBe(true);
      }
    }
  });
});

describe("provenance.json (X9.3)", () => {
  function provenance() {
    expect(run([dest]).code).toBe(0);
    return JSON.parse(read(join(dest, "provenance.json")).toString("utf8")) as {
      format: string;
      sourceRepo: string;
      gitRevision: string;
      uncommittedFiles: string[];
      licence: string;
      requires: Record<string, string>;
      files: { path: string; sourcePath: string; bytes: number; sha256: string }[];
    };
  }
  const git = (...args: string[]) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" }).stdout.trim();

  it("names the format, the repository, the revision, the licence and the one package it needs", () => {
    const p = provenance();
    expect(p.format).toBe("plot.exchange.vendor.v1");
    expect(p.sourceRepo).toBe(git("remote", "get-url", "origin"));
    expect(p.sourceRepo).not.toContain("@");
    expect(p.gitRevision).toBe(git("rev-parse", "HEAD"));
    expect(p.gitRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(p.licence).toBe("MIT");
    expect(p.requires).toEqual({ zod: "4.6.7" });
  });

  it("lists 7 files and vectors.json, 8 entries, sorted by path, and not itself", () => {
    const p = provenance();
    expect(p.files).toHaveLength(8);
    expect(p.files.map((f) => f.path)).toEqual(["calendar.ts", "exchange/compare.ts", "exchange/packet.ts", "exchange/schema.ts", "exchange/slip.ts", "limits.ts", "types.ts", "vectors.json"]);
    expect(p.files.map((f) => f.path)).not.toContain("provenance.json");
  });

  it("gives each file its source path, its byte length and the SHA 256 of its bytes", () => {
    const p = provenance();
    for (const file of p.files) {
      const source = [...PURE, VECTORS].find(([, to]) => to === file.path);
      expect(file.sourcePath, file.path).toBe(source?.[0]);
      const bytes = read(join(dest, file.path));
      expect(file.bytes, file.path).toBe(bytes.length);
      expect(file.sha256, file.path).toBe(sha(bytes));
      expect(file.sha256).toBe(sha(read(join(REPO, file.sourcePath))));
    }
  });

  it("says which listed files had changes that were not committed, and no others", () => {
    const p = provenance();
    const dirty = [...PURE, VECTORS]
      .map(([from]) => from)
      .filter((from) => git("status", "--porcelain", "--", from) !== "")
      .sort();
    expect(p.uncommittedFiles).toEqual(dirty);
  });

  it("holds no time stamp, so a repeat run gives the same bytes", () => {
    expect(run([dest]).code).toBe(0);
    const first = read(join(dest, "provenance.json"));
    expect(run([dest]).code).toBe(0);
    expect(read(join(dest, "provenance.json")).equals(first)).toBe(true);
    expect(first.toString("utf8")).not.toMatch(/\d{4}-\d{2}-\d{2}T|"(?:time|date|created|generated)/i);
  });

  it("is written with LF line endings and no byte order mark", () => {
    expect(run([dest]).code).toBe(0);
    const bytes = read(join(dest, "provenance.json"));
    expect(bytes.includes(13)).toBe(false);
    expect(bytes[0]).not.toBe(0xef);
    expect(bytes.at(-1)).toBe(10);
  });
});

describe("what it prints", () => {
  it("prints each file with its hash and then ok", () => {
    const out = run([dest]);
    expect(out.code).toBe(0);
    for (const [, to] of [...PURE, VECTORS]) {
      expect(out.stdout).toContain(`${sha(read(join(dest, to)))}  ${to}`);
    }
    expect(out.stdout.trim().split("\n").at(-1)).toBe("export-exchange: ok");
  });
});

describe("the folder it writes to (X9.4)", () => {
  it("refuses a folder that holds files it did not write, and changes nothing", () => {
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "notes.txt"), "mine");
    const out = run([dest]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("notes.txt");
    expect(list(dest)).toEqual(["notes.txt"]);
  });

  it("accepts an empty folder that exists", () => {
    mkdirSync(dest, { recursive: true });
    expect(run([dest]).code).toBe(0);
    expect(list(dest)).toHaveLength(9);
  });

  it("replaces an earlier export, restoring a file that was edited and removing one that is no longer listed", () => {
    expect(run([dest]).code).toBe(0);
    const original = read(join(dest, "limits.ts"));
    writeFileSync(join(dest, "limits.ts"), "// edited\n");
    writeFileSync(join(dest, "exchange", "old.ts"), "export {};\n");
    const p = JSON.parse(read(join(dest, "provenance.json")).toString("utf8")) as { files: unknown[] };
    p.files.push({ path: "exchange/old.ts", sourcePath: "template/src/exchange/old.ts", bytes: 11, sha256: "0".repeat(64) });
    writeFileSync(join(dest, "provenance.json"), `${JSON.stringify(p, null, 2)}\n`);
    expect(run([dest]).code).toBe(0);
    expect(read(join(dest, "limits.ts")).equals(original)).toBe(true);
    expect(existsSync(join(dest, "exchange", "old.ts"))).toBe(false);
    expect(list(dest)).toHaveLength(9);
  });

  it("refuses a folder that is a file", () => {
    mkdirSync(WORK, { recursive: true });
    writeFileSync(dest, "x");
    expect(run([dest]).code).toBe(1);
  });
});

describe("the check on what the exchange imports (X9.2)", () => {
  /** Add a line to a file of a copy of the repository, then run the script on that copy. */
  function spoil(file: string, add: string) {
    const root = fakeRoot();
    const path = join(root, file);
    writeFileSync(path, `${read(path).toString("utf8")}${add}\n`);
    return run([dest, "--root", root]);
  }

  it("refuses an exchange file that imports a file that is not listed, naming both, and writes nothing", () => {
    const out = spoil("template/src/exchange/slip.ts", 'import "../events";');
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("template/src/exchange/slip.ts");
    expect(out.stderr).toContain("template/src/events");
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a listed pure file that imports a file that is not listed", () => {
    const out = spoil("template/src/limits.ts", 'import "./site";');
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("template/src/limits.ts");
    expect(out.stderr).toContain("template/src/site");
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses an import from outside the template and a package other than zod", () => {
    const outside = spoil("template/src/exchange/compare.ts", 'import "../../../tests/helpers/site";');
    expect(outside.code).toBe(1);
    expect(outside.stderr).toContain("tests/helpers/site");
    n += 1;
    dest = join(WORK, `copy-${n}`);
    const pkg = spoil("template/src/exchange/packet.ts", 'import "react";');
    expect(pkg.code).toBe(1);
    expect(pkg.stderr).toContain("react");
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a file with a carriage return and a file with a byte order mark", () => {
    const crlf = spoil("template/src/exchange/schema.ts", "// a line\r");
    expect(crlf.code).toBe(1);
    expect(crlf.stderr).toContain("template/src/exchange/schema.ts");
    n += 1;
    dest = join(WORK, `copy-${n}`);
    const root = fakeRoot();
    const path = join(root, "template/src/types.ts");
    writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), read(path)]));
    const bom = run([dest, "--root", root]);
    expect(bom.code).toBe(1);
    expect(bom.stderr).toContain("template/src/types.ts");
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a root that is not a git checkout, because the revision would be made up", () => {
    const out = run([dest, "--root", fakeRoot()]);
    expect(out.code).toBe(1);
    expect(out.stderr).toMatch(/git/i);
    expect(existsSync(dest)).toBe(false);
  });
});

describe("how it is run", () => {
  it("says how to use it, and exits 2, when no folder is given", () => {
    const out = run([]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("export-exchange");
    expect(out.stderr).toMatch(/folder/i);
  });
});

describe("the copy works alone (X9.5)", () => {
  it("passes every shared vector when it is imported from the copy, not from template/src", async () => {
    expect(run([dest]).code).toBe(0);
    const load = async (file: string) => (await import(/* @vite-ignore */ pathToFileURL(join(dest, file)).href)) as Record<string, unknown>;
    const mod = { ...(await load("exchange/schema.ts")), ...(await load("exchange/compare.ts")), ...(await load("exchange/slip.ts")) } as unknown as ExchangeModule;
    expect(typeof mod.parsePacket).toBe("function");
    expect(vectorFailures(mod, loadVectors(join(dest, "vectors.json")))).toEqual([]);
  });
});

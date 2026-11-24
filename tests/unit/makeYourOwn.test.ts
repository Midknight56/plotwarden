// The guide docs/make-your-own.md is followed as written (spec 06, task 6.34, Z23.6 and Z23.12).
// B6: "Use it in another repository" listed `template/` alone, and the build of the copy failed at the font file that
// `register.css` imports from a folder above `template/`. B13: step 2 of the walk through left out the plot width and
// height, so "Apply layout" never showed. The test reads the lists out of the guide itself and does what they say, so
// it fails when the guide and the code part ways, in either direction.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { COPY } from "../../template/src/ui/copy";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDE = readFileSync(join(REPO, "docs", "make-your-own.md"), "utf8");
const WORK = join(REPO, ".local", `guide-test-${randomBytes(4).toString("hex")}`);

/** The text of one second level section of the guide, without its heading. */
function section(heading: string): string {
  const start = GUIDE.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`The guide has no section "${heading}"`);
  const from = start + heading.length + 5;
  const next = GUIDE.indexOf("\n## ", from);
  return GUIDE.slice(from, next < 0 ? undefined : next);
}

/** One numbered item of a list: from its number to the next number at the start of a line. */
function item(text: string, n: number): string {
  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.startsWith(`${n}. `));
  if (first < 0) throw new Error(`No item ${n}`);
  const rest = lines.slice(first + 1);
  const last = rest.findIndex((l) => /^\d+\. /.test(l));
  return [lines[first] as string, ...(last < 0 ? rest : rest.slice(0, last))].join("\n");
}

describe("the copy list of 'Use it in another repository' (Z23.6, B6)", () => {
  const other = section("Use it in another repository");
  const step = item(other, 1);
  const folders = [...step.matchAll(/`([A-Za-z0-9_.-]+)\//g)].map((m) => m[1] as string);

  afterAll(() => {
    if (WORK.startsWith(join(REPO, ".local")) && existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  });

  it("names every folder that the template needs, and says they sit side by side", () => {
    expect([...new Set(folders)].sort()).toEqual(["fonts", "template"]);
    expect(step).toMatch(/side by side|next to each other|same folder/i);
    expect(step).toContain("register.css");
  });

  it("builds the generated app from a copy of exactly the folders that the guide lists", () => {
    // The copy sits inside this checkout only so that `node_modules` is found. It holds nothing but the listed folders.
    for (const name of new Set(folders)) cpSync(join(REPO, name), join(WORK, name), { recursive: true });
    const made = spawnSync(process.execPath, [join(REPO, "scripts", "create-app.mjs"), "--kind", "market", "--out", join(WORK, "market"), "--template", join(WORK, "template")], { cwd: REPO, encoding: "utf8" });
    expect(made.status, made.stdout + made.stderr).toBe(0);
    const built = spawnSync(process.execPath, [join(REPO, "node_modules", "vite", "bin", "vite.js"), "build", "--config", join(WORK, "market", "vite.config.ts")], { cwd: REPO, encoding: "utf8" });
    expect(built.status, built.stdout + built.stderr).toBe(0);
    expect(existsSync(join(WORK, "market", "dist", "index.html"))).toBe(true);
  }, 240_000);
});

describe("step 2 of the walk through names every field that the map setup needs (Z23.12, B13)", () => {
  const step = item(section("3. Walk through the rule"), 2);
  const fields = new Map([...step.matchAll(/(?:^|[:,]\s*|\band\s+)([A-Z][A-Za-z ]*?) `([^`]*)`/g)].map((m) => [m[1] as string, m[2] as string]));

  it("gives a value to each field of the map setup that starts empty, with the labels of the screen", () => {
    for (const key of ["sectionName", "firstNumber", "digits", "rows", "columns", "plotWidth", "plotHeight"]) {
      const label = COPY[key];
      expect(label, key).toBeDefined();
      expect(fields.has(label as string), `${label} has no value in step 2`).toBe(true);
    }
  });

  it("gives the width and the height whole numbers from 1 to 10,000", () => {
    for (const label of ["Plot width", "Plot height"]) {
      const value = fields.get(label);
      expect(value, label).toMatch(/^\d{1,5}$/);
      expect(Number(value)).toBeGreaterThanOrEqual(1);
      expect(Number(value)).toBeLessThanOrEqual(10_000);
    }
  });

  it("still names the six fields it named before", () => {
    expect(Object.fromEntries([...fields].filter(([k]) => ["Section name", "Prefix", "First number", "Digits", "Rows", "Columns"].includes(k)))).toEqual({
      "Section name": "Row A",
      Prefix: "S",
      "First number": "1",
      Digits: "1",
      Rows: "1",
      Columns: "4",
    });
  });
});

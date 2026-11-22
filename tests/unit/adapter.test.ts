// T01: a market adapter runs on the same shell, and the template cannot import
// an app. Also the import reader and the import direction check.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { defineRegister, type RegisterAdapter } from "../../template/src/adapter";
import { applyCore, emptyCoreState, makeStoredEvent, type CoreEvent, type DraftEvent, type StoredEvent } from "../../template/src/events";
import { createSite, mintId } from "../../template/src/site";
import type { CoreState, Site } from "../../template/src/types";
import { resolveImport, scanSource } from "../../scripts/lib/imports.mjs";
import { marketAdapter, type MarketCommand } from "../helpers/marketAdapter";
import { FIXED_NOW } from "../helpers/clock";
import { fid, SITE_ID } from "../helpers/site";

const ON = "2026-04-20";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function siteOfKind(kind: string): Site {
  const result = createSite({
    id: SITE_ID,
    lineageId: mintId(),
    siteKey: mintId(),
    kind,
    title: "Stall Row",
    zone: "Europe/London",
    createdAt: FIXED_NOW,
  });
  if (!result.ok) throw new Error("site");
  return result.value;
}

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("T01 the shell runs a market adapter", () => {
  it("defines a register for the market kind", () => {
    const register = must(defineRegister(marketAdapter));
    expect(register.kind).toBe("market");
    expect(register.adapter).toBe(marketAdapter);
  });

  it("creates state, runs a core command and a market command, and replays them", () => {
    const register = must(defineRegister(marketAdapter));
    const site = siteOfKind("market");
    let state: CoreState = register.initialState(site);
    expect(state).toEqual(emptyCoreState(site.id));

    const stored: StoredEvent[] = [];
    const commit = (drafts: DraftEvent<CoreEvent>[]) => {
      for (const draft of drafts) {
        state = applyCore(state, draft.event);
        stored.push(
          makeStoredEvent(draft, {
            eventId: fid(`ev:${stored.length + 1}`),
            siteId: site.id,
            seq: stored.length + 1,
            opId: fid(`op:${stored.length + 1}`),
            recordedAt: FIXED_NOW,
          }),
        );
      }
    };

    commit(
      must(
        register.run(
          state,
          { type: "add_plot", plotId: fid("plot:S1"), code: "S1", spaces: [{ spaceId: fid("space:S1") }] },
          ON,
        ),
      ),
    );
    commit(must(register.run(state, { type: "confirm_empty", spaceIds: [fid("space:S1")] }, ON)));
    commit(
      must(
        register.run(
          state,
          { type: "reserve_stall", claimId: fid("claim:S1"), spaceId: fid("space:S1"), trader: "Rosa Pennywhistle", start: ON },
          ON,
        ),
      ),
    );

    expect(state.claims[fid("claim:S1")]).toMatchObject({ mode: "held", ref: "Rosa Pennywhistle" });
    const replayed = must(register.replay(site, stored));
    expect(replayed).toEqual(state);
  });

  it("refuses a command it does not list, before it calls decide", () => {
    const decide = vi.fn(marketAdapter.decide);
    const register = must(defineRegister({ ...marketAdapter, decide }));
    const result = register.run(emptyCoreState(SITE_ID), { type: "make_tea" } as unknown as MarketCommand, ON);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_command");
    expect(decide).not.toHaveBeenCalled();
  });

  it("returns field errors from validate, before it calls decide", () => {
    const decide = vi.fn(marketAdapter.decide);
    const register = must(defineRegister({ ...marketAdapter, decide }));
    const result = register.run(
      emptyCoreState(SITE_ID),
      { type: "reserve_stall", claimId: "c", spaceId: "s", trader: " ", start: ON },
      ON,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_input");
      expect(result.error.fields).toEqual([{ field: "trader", code: "required" }]);
    }
    expect(decide).not.toHaveBeenCalled();
  });

  it("opens only a site of its own kind", () => {
    const register = must(defineRegister(marketAdapter));
    expect(register.accepts(siteOfKind("market")).ok).toBe(true);
    const wrong = register.accepts(siteOfKind("allotment"));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe("wrong_kind");
  });

  it("treats the kind as an opaque name: any kind behaves the same", () => {
    const results = ["churchyard", "allotment", "market", "zebra"].map((kind) => {
      const register = must(defineRegister({ ...marketAdapter, kind }));
      const state = register.initialState(siteOfKind(kind));
      const run = register.run(
        state,
        { type: "add_plot", plotId: fid("plot:K"), code: "K1", spaces: [{ spaceId: fid("space:K") }] },
        ON,
      );
      return JSON.stringify(run);
    });
    expect(new Set(results).size).toBe(1);
  });
});

describe("T01 an adapter must be complete", () => {
  const BAD: [string, Partial<RegisterAdapter<CoreState, MarketCommand, CoreEvent>>, string][] = [
    ["an empty kind", { kind: "  " }, "kind"],
    ["a zero version", { version: 0 }, "version"],
    ["a fractional version", { version: 1.5 }, "version"],
    ["a space range with min above max", { spacesPerPlot: { min: 3, max: 2 } }, "spacesPerPlot"],
    ["a space range under 1", { spacesPerPlot: { min: 0, max: 1 } }, "spacesPerPlot"],
    ["a space range over 12", { spacesPerPlot: { min: 1, max: 13 } }, "spacesPerPlot"],
    ["no commands", { commands: [] }, "commands"],
    ["no decide", { decide: undefined as never }, "decide"],
    ["no apply", { apply: undefined as never }, "apply"],
    ["no validate", { validate: undefined as never }, "validate"],
    ["no project", { project: undefined as never }, "project"],
    ["no initial state", { initialState: undefined as never }, "initialState"],
    ["no review facts", { reviewFacts: undefined as never }, "reviewFacts"],
  ];

  it.each(BAD)("refuses %s", (_name, patch, field) => {
    const result = defineRegister({ ...marketAdapter, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_adapter");
      expect(result.error.fields?.map((f) => f.field)).toContain(field);
    }
  });

  it("reports every problem at once", () => {
    const result = defineRegister({ ...marketAdapter, kind: "", version: 0, commands: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields?.map((f) => f.field).sort()).toEqual(["commands", "kind", "version"]);
  });
});

describe("T01 the import reader", () => {
  it("finds every form of import in order", () => {
    const source = [
      'import a from "x";',
      "import { b } from 'y';",
      'import * as c from "z";',
      'import "side";',
      'import type { T } from "t";',
      'export { q } from "e";',
      'export * from "f";',
      'export type { R } from "g";',
      'const m = await import("dyn");',
      'const r = require("req");',
    ].join("\n");
    expect(scanSource(source).imports).toEqual(["x", "y", "z", "side", "t", "e", "f", "g", "dyn", "req"]);
  });

  it("reads an import that spans several lines", () => {
    const source = 'import {\n  one,\n  two,\n} from "multi";\nexport const x = 1;';
    expect(scanSource(source).imports).toEqual(["multi"]);
  });

  it("ignores imports in comments and strings", () => {
    const source = [
      '// import x from "no1";',
      '/* import y from "no2"; */',
      "const s = 'import z from \"no3\"';",
      'const t = `import w from "no4"`;',
      'import real from "yes";',
    ].join("\n");
    expect(scanSource(source).imports).toEqual(["yes"]);
  });

  it("is not fooled by a regex literal or by division", () => {
    const source = ['const re = /["\'`]/g;', "const q = a / b / c;", 'import after from "after";'].join("\n");
    expect(scanSource(source).imports).toEqual(["after"]);
  });

  it("does not take export lists or import.meta for imports", () => {
    const source = 'export { a, b };\nexport const c = 1;\nexport default function f() {}\nconst u = import.meta.url;\nconst k = "str";';
    expect(scanSource(source).imports).toEqual([]);
  });

  it("blanks comments in the code it returns and keeps strings", () => {
    const { code } = scanSource('// churchyard\nconst a = "market"; /* allotment */ const b = 2;');
    expect(code).not.toContain("churchyard");
    expect(code).not.toContain("allotment");
    expect(code).toContain('"market"');
    expect(code.split("\n")).toHaveLength(2);
  });

  it("resolves relative and bare specifiers", () => {
    expect(resolveImport("template/src/ui/Shell.tsx", "../adapter")).toEqual({ kind: "relative", target: "template/src/adapter" });
    expect(resolveImport("template/src/plot.ts", "../../apps/a/src/x")).toEqual({ kind: "relative", target: "apps/a/src/x" });
    expect(resolveImport("a.ts", "zod")).toEqual({ kind: "bare", pkg: "zod" });
    expect(resolveImport("a.ts", "zod/v4")).toEqual({ kind: "bare", pkg: "zod" });
    expect(resolveImport("a.ts", "@scope/pkg/deep")).toEqual({ kind: "bare", pkg: "@scope/pkg" });
    expect(resolveImport("a.ts", "node:fs")).toEqual({ kind: "bare", pkg: "node:fs" });
  });
});

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pw-imports-"));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return dir;
}

function check(root: string) {
  const run = spawnSync(process.execPath, [join(ROOT, "scripts", "check-imports.mjs"), "--root", root], {
    encoding: "utf8",
  });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

const CLEAN = {
  "template/src/types.ts": "export type Uuid = string;\n",
  "template/src/calendar.ts": "export type LocalDate = string;\n",
  "template/src/limits.ts": 'import type { Uuid } from "./types";\nexport const x: Uuid = "";\n',
  "template/src/map/geometry.ts": 'import type { Uuid } from "../types";\nimport { z } from "zod";\nexport const g = z.string();\nexport type G = Uuid;\n',
  "template/src/data/db.ts": 'import type { Uuid } from "../types";\nimport Papa from "papaparse";\nexport const d = [Papa, indexedDB] as unknown as Uuid;\n',
  "template/src/output/privacy.ts": 'import { z } from "zod";\nimport type { LocalDate } from "../calendar";\nimport { x } from "../limits";\nimport type { G } from "../map/geometry";\nexport const p = [z, x] as unknown as [LocalDate, G];\n',
  "template/src/exchange/schema.ts": 'import { z } from "zod";\nimport { p } from "../output/privacy";\nexport const s = [z, p];\n',
  "template/src/ui/Shell.tsx": 'import React from "react";\nimport { x } from "../limits";\nimport { d } from "../data/db";\nimport { p } from "../output/privacy";\nexport const S = [React, x, d, p];\n',
  "apps/a/src/main.tsx": 'import { x } from "../../../template/src/limits";\nimport { y } from "./other";\nexport const m = [x, y];\n',
  "apps/a/src/other.ts": "export const y = 1;\n",
  "site/src/main.tsx": 'import { h } from "./Home";\nexport const m = h;\n',
  "site/src/Home.tsx": "export const h = 1;\n",
  "tests/unit/a.test.ts": 'import { x } from "../../template/src/limits";\nimport { m } from "../../apps/a/src/main";\nexport const t = [x, m];\n',
  "scripts/tool.mjs": 'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n',
};

describe("T01 import direction check", () => {
  it("passes a clean tree", () => {
    const run = check(tree(CLEAN));
    expect(run.out).not.toMatch(/->/);
    expect(run.status).toBe(0);
  });

  it("passes this repository", () => {
    const run = check(ROOT);
    expect(run.out).not.toMatch(/->/);
    expect(run.status).toBe(0);
  });

  const VIOLATIONS: [string, Record<string, string>, string, string, string][] = [
    ["the template importing an app", { "template/src/plot.ts": 'import { a } from "../../apps/church/src/adapter";\nexport const p = a;\n' }, "template/src/plot.ts", "apps/church/src/adapter", "template-no-outside"],
    ["template ui importing the site", { "template/src/ui/Shell.tsx": 'import { m } from "../../../site/src/main";\nexport const S = m;\n' }, "template/src/ui/Shell.tsx", "site/src/main", "template-no-outside"],
    ["the template importing a test helper", { "template/src/plot.ts": 'import { s } from "../../tests/helpers/site";\nexport const p = s;\n' }, "template/src/plot.ts", "tests/helpers/site", "template-no-outside"],
    ["the template importing a script", { "template/src/data/db.ts": 'import { r } from "../../../scripts/tool";\nexport const d = r;\n' }, "template/src/data/db.ts", "scripts/tool", "template-no-outside"],
    ["a dynamic import of an app", { "template/src/plot.ts": 'export const load = () => import("../../apps/a/src/main");\n' }, "template/src/plot.ts", "apps/a/src/main", "template-no-outside"],
    ["an export from an app", { "template/src/plot.ts": 'export * from "../../apps/a/src/main";\n' }, "template/src/plot.ts", "apps/a/src/main", "template-no-outside"],
    ["a pure file importing React", { "template/src/types.ts": 'import React from "react";\nexport const t = React;\n' }, "template/src/types.ts", "react", "pure-layer"],
    ["a pure file importing a package other than zod", { "template/src/types.ts": 'import Papa from "papaparse";\nexport const t = Papa;\n' }, "template/src/types.ts", "papaparse", "pure-layer"],
    ["a pure file importing the data layer", { "template/src/status.ts": 'import { d } from "./data/db";\nexport const s = d;\n' }, "template/src/status.ts", "template/src/data/db", "pure-layer"],
    ["a pure file importing the ui", { "template/src/status.ts": 'import { S } from "./ui/Shell";\nexport const s = S;\n' }, "template/src/status.ts", "template/src/ui/Shell", "pure-layer"],
    ["a pure file importing output", { "template/src/status.ts": 'import { p } from "./output/privacy";\nexport const s = p;\n' }, "template/src/status.ts", "template/src/output/privacy", "pure-layer"],
    ["a pure map file importing the data layer", { "template/src/map/geometry.ts": 'import { d } from "../data/db";\nexport const g = d;\n' }, "template/src/map/geometry.ts", "template/src/data/db", "pure-layer"],
    ["a pure file using IndexedDB", { "template/src/calendar.ts": 'export const open = () => indexedDB.open("x");\n' }, "template/src/calendar.ts", "indexedDB", "pure-layer"],
    ["a pure file naming an IDB type", { "template/src/calendar.ts": "export type D = IDBDatabase;\n" }, "template/src/calendar.ts", "IDBDatabase", "pure-layer"],
    ["the data layer importing React", { "template/src/data/db.ts": 'import React from "react";\nexport const d = React;\n' }, "template/src/data/db.ts", "react", "data-layer"],
    ["the data layer importing the ui", { "template/src/data/db.ts": 'import { c } from "../ui/copy";\nexport const d = c;\n' }, "template/src/data/db.ts", "template/src/ui/copy", "data-layer"],
    ["the data layer importing output", { "template/src/data/db.ts": 'import { p } from "../output/privacy";\nexport const d = p;\n' }, "template/src/data/db.ts", "template/src/output/privacy", "data-layer"],
    ["output importing a private record module", { "template/src/output/privacy.ts": 'import type { Site } from "../types";\nexport type P = Site;\n' }, "template/src/output/privacy.ts", "template/src/types", "public-layer"],
    ["output importing the site module", { "template/src/output/privacy.ts": 'import { mintId } from "../site";\nexport const p = mintId;\n' }, "template/src/output/privacy.ts", "template/src/site", "public-layer"],
    ["output importing the data layer", { "template/src/output/privacy.ts": 'import { d } from "../data/db";\nexport const p = d;\n' }, "template/src/output/privacy.ts", "template/src/data/db", "public-layer"],
    ["output importing React", { "template/src/output/privacy.ts": 'import React from "react";\nexport const p = React;\n' }, "template/src/output/privacy.ts", "react", "public-layer"],
    ["exchange importing events", { "template/src/exchange/schema.ts": 'import { applyCore } from "../events";\nexport const s = applyCore;\n' }, "template/src/exchange/schema.ts", "template/src/events", "public-layer"],
    ["an app importing another app", { "apps/a/src/main.tsx": 'import { z } from "../../b/src/z";\nexport const m = z;\n', "apps/b/src/z.ts": "export const z = 1;\n" }, "apps/a/src/main.tsx", "apps/b/src/z", "app-layer"],
    ["an app importing the site", { "apps/a/src/main.tsx": 'import { h } from "../../../site/src/Home";\nexport const m = h;\n' }, "apps/a/src/main.tsx", "site/src/Home", "app-layer"],
    ["an example importing an app", { "examples/m/src/main.tsx": 'import { x } from "../../../apps/a/src/main";\nexport const m = x;\n', "apps/a/src/main.tsx": "export const x = 1;\n" }, "examples/m/src/main.tsx", "apps/a/src/main", "app-layer"],
    ["an example importing another example", { "examples/m/src/main.tsx": 'import { z } from "../../n/src/z";\nexport const m = z;\n', "examples/n/src/z.ts": "export const z = 1;\n" }, "examples/m/src/main.tsx", "examples/n/src/z", "app-layer"],
    ["the site importing an app", { "site/src/main.tsx": 'import { m } from "../../apps/a/src/main";\nexport const x = m;\n' }, "site/src/main.tsx", "apps/a/src/main", "site-layer"],
    ["the site importing the template", { "site/src/main.tsx": 'import { x } from "../../template/src/limits";\nexport const m = x;\n' }, "site/src/main.tsx", "template/src/limits", "site-layer"],
    ["a test importing the Desk by path", { "tests/unit/b.test.ts": 'import { D } from "../../../plotwarden-review-desk/src/Desk";\nexport const t = D;\n' }, "tests/unit/b.test.ts", "plotwarden-review-desk/src/Desk", "no-desk"],
    ["an app importing the Desk by package name", { "apps/a/src/main.tsx": 'import { D } from "plotwarden-review-desk";\nexport const m = D;\n' }, "apps/a/src/main.tsx", "plotwarden-review-desk", "no-desk"],
    ["template code comparing kind with a string", { "template/src/rules.ts": 'export const f = (site: { kind: string }) => site.kind === "market";\n' }, "template/src/rules.ts", 'kind === "', "no-kind-word"],
    ["template code comparing a string with kind", { "template/src/rules.ts": 'export const f = (site: { kind: string }) => "x" !== site.kind;\n' }, "template/src/rules.ts", "!== site.kind", "no-kind-word"],
    ["the word churchyard in template code", { "template/src/rules.ts": 'export const w = "churchyard";\n' }, "template/src/rules.ts", "churchyard", "no-kind-word"],
    ["the word Allotment in template code", { "template/src/rules.ts": "export const Allotment = 1;\n" }, "template/src/rules.ts", "Allotment", "no-kind-word"],
    ["the word market in template ui code", { "template/src/ui/Shell.tsx": 'export const m = "market";\n' }, "template/src/ui/Shell.tsx", "market", "no-kind-word"],
  ];

  it.each(VIOLATIONS)("fails on %s", (_name, files, file, target, rule) => {
    const run = check(tree({ ...CLEAN, ...files }));
    expect(run.status).toBe(1);
    expect(run.out).toContain(file);
    expect(run.out).toContain(target);
    expect(run.out).toContain(rule);
  });

  it("lets an example import the template and its own files", () => {
    const run = check(
      tree({
        ...CLEAN,
        "examples/m/src/main.tsx": 'import { x } from "../../../template/src/limits";\nimport { y } from "./other";\nexport const m = [x, y];\n',
        "examples/m/src/other.ts": "export const y = 1;\n",
      }),
    );
    expect(run.out).not.toMatch(/->/);
    expect(run.status).toBe(0);
  });

  it("does not fail on words in comments or on longer words", () => {
    const run = check(
      tree({
        ...CLEAN,
        "template/src/rules.ts": '// churchyard, allotment and market are app words\n/* kind === "market" */\nexport const w = "marketing";\nexport const k = (a: { kind: string }, b: { kind: string }) => a.kind === b.kind;\n',
      }),
    );
    expect(run.out).not.toMatch(/->/);
    expect(run.status).toBe(0);
  });

  it("does not fail on an empty check or a typeof check of kind", () => {
    const run = check(
      tree({
        ...CLEAN,
        "template/src/rules.ts":
          'export const a = (kind: string) => kind === "";\nexport const b = (x: { kind: unknown }) => typeof x.kind !== "string";\nexport const c = (kind: string) => kind !== \'\';\n',
      }),
    );
    expect(run.out).not.toMatch(/->/);
    expect(run.status).toBe(0);
  });

  it("does not fail on an import that is only in a comment or a string", () => {
    const run = check(
      tree({
        ...CLEAN,
        "template/src/types.ts": '// import React from "react";\nexport const s = \'import x from "../../apps/a/src/main"\';\n',
      }),
    );
    expect(run.status).toBe(0);
  });

  it("names every violation, not just the first", () => {
    const run = check(
      tree({
        ...CLEAN,
        "template/src/plot.ts": 'import { a } from "../../apps/a/src/main";\nexport const p = a;\n',
        "template/src/types.ts": 'import React from "react";\nexport const t = React;\n',
      }),
    );
    expect(run.status).toBe(1);
    expect(run.out).toContain("template/src/plot.ts");
    expect(run.out).toContain("template/src/types.ts");
  });

  it("exits 2 when the root is missing", () => {
    const run = check(join(tmpdir(), "pw-no-such-folder-xyz"));
    expect(run.status).toBe(2);
  });
});

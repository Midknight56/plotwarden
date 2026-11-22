// T34 (spec 06, task 6.9): the third use recipe. `npm run create:app -- --kind market --out <folder>` writes a
// register app into a folder that does not exist yet, refuses one that does, changes nothing under template/
// or apps/, and the generated app keeps the width rule: a trader who needs 240 cm reserves a 250 cm stall and
// is refused a 200 cm stall. Requirements Z8 and R14.5, R14.7, R14.8.
import { IDBFactory } from "fake-indexeddb";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { marketRegister } from "../../examples/market/src/adapter";
import { MARKET_COPY } from "../../examples/market/src/copy";
import type { MarketCommand, MarketState } from "../../examples/market/src/types";
import { exportBackup, restoreBackup, verifyBackup } from "../../template/src/data/backup";
import { openRegisterDb } from "../../template/src/data/db";
import { commit, listSites, readEvents, saveNewSite } from "../../template/src/data/transaction";
import { createSite, mintId } from "../../template/src/site";
import { fill } from "../../template/src/ui/copy";
import { FIXED_NOW, fixedClock } from "../helpers/clock";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "create-app.mjs");
const WORK = join(REPO, ".local", `scaffold-test-${randomBytes(4).toString("hex")}`);

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Every file under a folder, as sorted paths with forward slashes. */
function list(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name === "dist") continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(dir, full).replace(/\\/g, "/"));
    }
  };
  if (existsSync(dir)) visit(dir);
  return out.sort();
}

/** The path and SHA 256 of every file under each folder: an independent view of the source tree. */
function hashTree(folders: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const folder of folders) for (const rel of list(join(REPO, folder))) out[`${folder}/${rel}`] = sha(readFileSync(join(REPO, folder, rel)));
  return out;
}

const TREES = ["template", "apps", "examples", "tests/helpers"];

function run(args: string[], cwd = REPO) {
  const out = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { code: out.status, stdout: out.stdout, stderr: out.stderr };
}

const FILES = [
  "fixture.json",
  "index.html",
  "package.json",
  "src/Stalls.tsx",
  "src/adapter.ts",
  "src/copy.ts",
  "src/fields.ts",
  "src/main.tsx",
  "src/rules.ts",
  "src/theme.css",
  "src/types.ts",
  "vite.config.ts",
];

afterAll(() => {
  // Remove only the folder this file made, and only if it is where it should be.
  if (WORK.startsWith(join(REPO, ".local")) && existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
});

describe("the generator refuses before it writes anything", () => {
  it("refuses a folder that exists and is not empty, names it, exits 2, and changes nothing", () => {
    const folder = join(WORK, "full");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "keep.txt"), "keep");
    const before = hashTree(["template"]);
    const out = run(["--kind", "market", "--out", folder]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain(folder);
    expect(list(folder)).toEqual(["keep.txt"]);
    expect(readFileSync(join(folder, "keep.txt"), "utf8")).toBe("keep");
    expect(hashTree(["template"])).toEqual(before);
  });

  it("refuses a folder that exists and is empty", () => {
    const folder = join(WORK, "empty");
    mkdirSync(folder, { recursive: true });
    const out = run(["--kind", "market", "--out", folder]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain(folder);
    expect(list(folder)).toEqual([]);
  });

  it("refuses a path that is a file", () => {
    const file = join(WORK, "a-file");
    mkdirSync(WORK, { recursive: true });
    writeFileSync(file, "x");
    const out = run(["--kind", "market", "--out", file]);
    expect(out.code).toBe(2);
    expect(readFileSync(file, "utf8")).toBe("x");
  });

  it("refuses the repository itself and the template folder", () => {
    for (const target of [REPO, join(REPO, "template"), join(REPO, "apps")]) {
      const before = hashTree(["template", "apps"]);
      const out = run(["--kind", "market", "--out", target]);
      expect(out.code, target).toBe(2);
      expect(hashTree(["template", "apps"])).toEqual(before);
    }
  });

  const bad: [string, string[]][] = [
    ["no arguments", []],
    ["no kind", ["--out", "x"]],
    ["no out", ["--kind", "market"]],
    ["an out with no value", ["--kind", "market", "--out"]],
    ["a kind with no value", ["--out", "x", "--kind"]],
    ["an unknown kind", ["--kind", "garden", "--out", "x"]],
    ["an unknown flag", ["--kind", "market", "--out", "x", "--force"]],
    ["a repeated flag", ["--kind", "market", "--out", "x", "--out", "y"]],
    ["a stray word", ["--kind", "market", "--out", "x", "now"]],
    ["a template folder that does not exist", ["--kind", "market", "--out", "x", "--template", "nowhere-at-all"]],
  ];
  it.each(bad)("exits 2 and creates nothing for %s", (_name, args) => {
    const cwd = join(WORK, "cwd");
    mkdirSync(cwd, { recursive: true });
    const out = run(args, cwd);
    expect(out.code).toBe(2);
    expect(out.stderr.trim().length).toBeGreaterThan(10);
    expect(list(cwd)).toEqual([]);
    expect(existsSync(join(cwd, "x"))).toBe(false);
  });
});

describe("the generator writes the market app into a new folder", () => {
  const near = join(REPO, ".local", `market-${randomBytes(3).toString("hex")}`);
  const deep = join(WORK, "deep", "market");
  const trees = hashTree(TREES);

  afterAll(() => {
    if (near.startsWith(join(REPO, ".local")) && existsSync(near)) rmSync(near, { recursive: true, force: true });
  });

  it("writes exactly the listed files, with LF line ends, no byte order mark and UTF 8", () => {
    const out = run(["--kind", "market", "--out", near]);
    expect(out.code, out.stderr).toBe(0);
    expect(list(near)).toEqual([...FILES].sort());
    for (const file of FILES) {
      const bytes = readFileSync(join(near, file));
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), `${file} has a byte order mark`).toBe(false);
      expect(bytes.includes(0x0d), `${file} has a carriage return`).toBe(false);
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes), file).not.toThrow();
    }
    expect(out.stdout).toContain(near);
  });

  it("copies the source of examples/market byte for byte when the folder is two levels below the repository", () => {
    for (const file of FILES) expect(readFileSync(join(near, file), "utf8"), file).toBe(readFileSync(join(REPO, "examples", "market", file), "utf8"));
  });

  it("changes only the path to the template when the folder is deeper, and creates the parents", () => {
    const out = run(["--kind", "market", "--out", deep]);
    expect(out.code, out.stderr).toBe(0);
    expect(list(deep)).toEqual([...FILES].sort());
    const source = readFileSync(join(REPO, "examples", "market", "src", "adapter.ts"), "utf8");
    const made = readFileSync(join(deep, "src", "adapter.ts"), "utf8");
    // examples/market/src is three levels below the repository. WORK/deep/market/src is five levels below WORK, and WORK is two below.
    const up = relative(join(deep, "src"), join(REPO, "template")).replace(/\\/g, "/");
    expect(up.startsWith("../")).toBe(true);
    expect(made).toBe(source.split("../../../template/").join(`${up}/`));
    expect(made).toContain(`from "${up}/src/adapter"`);
    // Files that do not name the template stay as they are.
    for (const file of ["src/copy.ts", "src/theme.css", "fixture.json", "index.html"]) expect(readFileSync(join(deep, file), "utf8"), file).toBe(readFileSync(join(REPO, "examples", "market", file), "utf8"));
  });

  it("accepts the template folder by name, and gives the same files as the default", () => {
    const out = join(WORK, "named", "market");
    const done = run(["--kind", "market", "--out", out, "--template", join(REPO, "template")]);
    expect(done.code, done.stderr).toBe(0);
    const again = join(WORK, "named2", "market");
    expect(run(["--kind", "market", "--out", again]).code).toBe(0);
    for (const file of FILES) expect(readFileSync(join(out, file), "utf8"), file).toBe(readFileSync(join(again, file), "utf8"));
  });

  it("leaves every file of the template, the two apps, the example and the helpers as it was", () => {
    expect(hashTree(TREES)).toEqual(trees);
  });

  it("builds with Vite, and the built page opens the register", () => {
    const built = spawnSync(process.execPath, [join(REPO, "node_modules", "vite", "bin", "vite.js"), "build", "--config", join(near, "vite.config.ts")], { cwd: REPO, encoding: "utf8" });
    expect(built.status, built.stdout + built.stderr).toBe(0);
    const html = readFileSync(join(near, "dist", "index.html"), "utf8");
    expect(html).toContain('<div id="root">');
    expect(/<script[^>]+src="\.\/assets\/[^"]+\.js"/.test(html)).toBe(true);
    expect(/https?:\/\//.test(html)).toBe(false);
  }, 180_000);
});

describe("the width rule, in the generated app", () => {
  const ON = "2026-04-20";

  async function generated() {
    const out = join(WORK, "rule", "market");
    if (!existsSync(out)) expect(run(["--kind", "market", "--out", out]).code).toBe(0);
    // The copy's own source files, loaded where they are.
    const adapter = (await import(/* @vite-ignore */ pathToFileURL(join(out, "src", "adapter.ts")).href)) as typeof import("../../examples/market/src/adapter");
    const copy = (await import(/* @vite-ignore */ pathToFileURL(join(out, "src", "copy.ts")).href)) as typeof import("../../examples/market/src/copy");
    return { register: adapter.marketRegister(), adapter: adapter.marketAdapter, copy: copy.MARKET_COPY };
  }

  /** Stalls S1 (200 cm), S2 (250 cm), S3 (no frontage), checked and empty. */
  function build(register: ReturnType<typeof marketRegister>) {
    const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind: "market", title: "Stall Row", zone: "Europe/London", createdAt: FIXED_NOW });
    if (!made.ok) throw new Error("site");
    let state = register.initialState(made.value);
    const events: { command: MarketCommand; drafts: ReturnType<typeof register.run> }[] = [];
    const step = (command: MarketCommand) => {
      const result = register.run(state, command, ON);
      if (!result.ok) throw new Error(`setup refused ${command.type}: ${JSON.stringify(result.error)}`);
      for (const draft of result.value) state = register.adapter.apply(state, draft.event);
      events.push({ command, drafts: result });
    };
    const plot = (code: string) => ({ plotId: `plot-${code}`, code, sectionId: "row-a", spaces: [{ spaceId: `space-${code}` }] });
    step({ type: "layout_apply", sections: [{ sectionId: "row-a", name: "Row A" }], plots: [plot("S1"), plot("S2"), plot("S3")] });
    step({ type: "confirm_empty", spaceIds: ["space-S1", "space-S2", "space-S3"] });
    step({ type: "set_frontage", plotId: "plot-S1", frontageCm: 200 });
    step({ type: "set_frontage", plotId: "plot-S2", frontageCm: 250 });
    return { site: made.value, state, events };
  }

  const reserve = (plot: string, needed: number, n = 1): MarketCommand => ({ type: "reserve_stall", reservationId: `res-${n}`, claimId: `claim-${n}`, plotId: `plot-${plot}`, trader: "Rosa Pennywhistle", neededCm: needed, start: "2026-04-01" });

  it("lets a trader who needs 240 cm reserve a 250 cm stall", async () => {
    const { register } = await generated();
    const { state } = build(register);
    const done = register.run(state, reserve("S2", 240), ON);
    expect(done.ok).toBe(true);
  });

  it("lets a trader whose need equals the frontage reserve it", async () => {
    const { register } = await generated();
    const { state } = build(register);
    expect(register.run(state, reserve("S2", 250), ON).ok).toBe(true);
    expect(register.run(state, reserve("S1", 200), ON).ok).toBe(true);
  });

  it("refuses 240 cm on a 200 cm stall, names both widths, and leaves the register as it was", async () => {
    const { register, copy } = await generated();
    const { state } = build(register);
    const before = JSON.stringify(state);
    const refused = register.run(state, reserve("S1", 240), ON);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("stall_too_narrow");
    expect(refused.error.detail).toMatchObject({ needed: 240, frontage: 200, code: "S1" });
    const words = fill(copy["stall_too_narrow"] as string, { needed: 240, frontage: 200 });
    expect(words).toBe("A 240 cm stand does not fit a 200 cm stall.");
    expect(JSON.stringify(state)).toBe(before);
    expect(Object.keys(state.reservations)).toEqual([]);
  });

  it("refuses a stall with no frontage, with its own words, and never reads it as wide enough", async () => {
    const { register, copy } = await generated();
    const { state } = build(register);
    const refused = register.run(state, reserve("S3", 1), ON);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("frontage_unknown");
      expect(fill(copy["frontage_unknown"] as string, { code: "S3" })).toBe("Set the frontage of S3 first.");
    }
  });

  it("refuses a need that is not a whole number of cm from 1 to 10,000 and a frontage that is not", async () => {
    const { register } = await generated();
    const { state } = build(register);
    for (const needed of [0, -5, 1.5, 10_001, Number.NaN]) {
      const out = register.run(state, reserve("S2", needed), ON);
      expect(out.ok, `need ${needed}`).toBe(false);
      if (!out.ok) expect(out.error.fields?.[0]).toMatchObject({ field: "neededCm" });
    }
    for (const frontageCm of [0, 1.5, 10_001]) {
      const out = register.run(state, { type: "set_frontage", plotId: "plot-S1", frontageCm }, ON);
      expect(out.ok, `frontage ${frontageCm}`).toBe(false);
    }
    expect(register.run(state, { type: "set_frontage", plotId: "plot-S1", frontageCm: 10_000 }, ON).ok).toBe(true);
    expect(register.run(state, { type: "set_frontage", plotId: "plot-S1", frontageCm: 1 }, ON).ok).toBe(true);
  });

  it("saves a reservation, backs it up, restores it as a new register and replays to the same state", async () => {
    const { register } = await generated();
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("storage");
    const db = opened.value;
    const { site, state: base, events } = build(register);
    await saveNewSite(db, site);
    let revision = 0;
    let state: MarketState = register.initialState(site);
    for (const step of [...events.map((e) => e.command), reserve("S2", 240)]) {
      const decided = register.run(state, step, ON);
      if (!decided.ok) throw new Error("step");
      const done = await commit(db, { siteId: site.id, expectedRevision: revision, opId: mintId(), commands: [step], events: decided.value, now: fixedClock(FIXED_NOW) });
      if (!done.ok) throw new Error(`commit ${JSON.stringify(done.error)}`);
      revision = done.revision;
      state = decided.value.reduce((s, d) => register.adapter.apply(s, d.event), state);
    }
    expect(Object.keys(state.reservations)).toHaveLength(1);
    expect(Object.keys(base.reservations)).toHaveLength(0);

    const backup = await exportBackup(db, site.id, "2026-04-20T09:30:00.000+00:00");
    if (!backup.ok) throw new Error("backup");
    const verified = await verifyBackup(backup.value.bytes, { kind: "market" });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const restored = await restoreBackup(db, verified.value, { mode: "new", newId: mintId });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const sites = await listSites(db);
    const copy = sites.find((s) => s.id !== site.id && s.kind === "market");
    expect(copy?.title).toBe("Stall Row");
    const replayed = register.replay(copy as NonNullable<typeof copy>, await readEvents(db, (copy as NonNullable<typeof copy>).id));
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(Object.values(replayed.value.reservations).map((r) => [r.trader, r.neededCm])).toEqual([["Rosa Pennywhistle", 240]]);
  });

  it("holds a copy catalog with the plan's words for the rule", async () => {
    const { copy } = await generated();
    expect(copy).toEqual(MARKET_COPY);
  });
});

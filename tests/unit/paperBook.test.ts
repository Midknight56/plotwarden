// T07 and the 200 record proof. Requirements P17.
// Every expected number is read from tests/fixtures/expected/hand-totals.md section 3,
// worked by hand before any code. None is copied from program output.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, readCsvBytes } from "../../template/src/data/csv";
import { canCommit, chooseConflict, commitImport, fixRow } from "../../template/src/data/importBatch";
import type { StagedImport } from "../../template/src/data/importBatch";
import { siteTotalsAt } from "../../template/src/status";
import { mintId } from "../../template/src/site";
import { PaperEnv, stageCsvText } from "../helpers/paperAdapter";
import type { PaperCommand, PaperEvent, PaperState } from "../helpers/paperAdapter";

const ON = "2026-04-20";
type Staged = StagedImport<PaperState, PaperCommand, PaperEvent>;

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const GOOD = fixture("paper-200.csv");
const BAD = fixture("paper-200-bad.csv");

// ---- Hand totals, read from the file ------------------------------------------------

const HAND = readFileSync(new URL("../fixtures/expected/hand-totals.md", import.meta.url), "utf8");

/** The cells of one table row in a numbered section of the hand totals, for example ("3.1", "Errors"). */
function handRow(section: string, label: string): string[] {
  const start = HAND.indexOf(`### ${section} `);
  if (start < 0) throw new Error(`hand totals have no section ${section}`);
  const next = HAND.indexOf("\n### ", start + 4);
  const body = HAND.slice(start, next < 0 ? undefined : next);
  for (const line of body.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells[1] === label) return cells.slice(1, -1);
  }
  throw new Error(`hand totals ${section} have no row ${label}`);
}
/** The first whole number in a cell, so "1 (row for R117)" is 1. */
const hand = (section: string, label: string, column = 1): number => Number((/\d+/.exec(handRow(section, label)[column] ?? "") ?? ["NaN"])[0]);

// ---- Helpers ---------------------------------------------------------------------------

async function bookWithGrid(): Promise<PaperEnv> {
  const env = await PaperEnv.create("Paper Book");
  await env.applyGrid();
  return env;
}

async function commitStaged(env: PaperEnv, staged: Staged) {
  const result = await commitImport(env.db, staged, { opId: mintId() });
  if (result.ok) {
    env.state = await env.reload();
    env.revision = result.revision;
  }
  return result;
}

function summary(env: PaperEnv) {
  const burials = Object.values(env.state.burials);
  const totals = siteTotalsAt(env.state.core, ON);
  return {
    burials: burials.length,
    placed: burials.filter((b) => b.spaceId !== undefined).length,
    unplaced: burials.filter((b) => b.spaceId === undefined).length,
    takenPlots: totals.plots.byPrimary.taken,
    uncheckedPlots: totals.plots.needsChecking,
    freePlots: totals.freePlots,
    uncheckedCodes: Object.values(env.state.core.plots)
      .filter((p) => p.spaces.some((s) => !s.checked))
      .map((p) => p.code)
      .sort(),
  };
}

describe("the fixture files", () => {
  it("are 200 rows of invented data with the one blank source ref", () => {
    const good = parseCsv(GOOD);
    const bad = parseCsv(BAD);
    if (!good.ok || !bad.ok) throw new Error("csv");
    expect(good.value.headings).toEqual(["Source ref", "Name", "Section", "Plot", "Burial date", "Page"]);
    expect(good.value.rows.length).toBe(hand("3.1", "Rows read"));
    expect(bad.value.rows.length).toBe(200);
    expect(good.value.rows.map((r) => r[0])).toEqual(Array.from({ length: 200 }, (_, i) => `R${String(i + 1).padStart(3, "0")}`));
    expect(bad.value.rows.filter((r) => r[0] === "").length).toBe(1);
    expect(bad.value.rows[116]?.[0]).toBe("");
    expect(bad.value.rows[115]?.[0]).toBe("R116");
    expect(bad.value.rows[117]?.[0]).toBe("R118");
    // R199 and R200 have no location. The 198 before them each have their own.
    expect(good.value.rows.slice(198).map((r) => [r[0], r[2], r[3]])).toEqual([["R199", "", ""], ["R200", "", ""]]);
    expect(new Set(good.value.rows.slice(0, 198).map((r) => r[3])).size).toBe(198);
  });

  it("read from bytes the same as from text", () => {
    const bytes = new Uint8Array(readFileSync(new URL("../fixtures/paper-200.csv", import.meta.url)));
    const text = readCsvBytes(bytes);
    expect(text.ok && text.value).toBe(GOOD);
  });
});

describe("the generated grid", () => {
  it("is C001 to C200, one space each, all unchecked", async () => {
    const env = await bookWithGrid();
    const codes = Object.values(env.state.core.plots).map((p) => p.code);
    expect(codes.length).toBe(200);
    expect(codes[0]).toBe("C001");
    expect(codes[199]).toBe("C200");
    expect(Object.values(env.state.core.plots).every((p) => p.spaces.length === 1 && !p.spaces[0]?.checked)).toBe(true);
    expect(summary(env)).toMatchObject({ takenPlots: 0, uncheckedPlots: 200, freePlots: 0 });
  });
});

describe("the first attempt, with R117 missing its source ref (hand totals 3.1)", () => {
  it("reads 200 rows, with one error, 197 ready and 2 to place later", async () => {
    const env = await bookWithGrid();
    const staged = stageCsvText(env, BAD);
    expect(staged.rows.length).toBe(hand("3.1", "Rows read"));
    expect(staged.counts.errors).toBe(hand("3.1", "Errors"));
    expect(staged.counts.ready).toBe(hand("3.1", "Ready to place"));
    expect(staged.counts.unplaced).toBe(hand("3.1", "Location to confirm"));
    expect(staged.counts).toEqual({ ready: 197, unchanged: 0, unplaced: 2, conflicts: 0, errors: 1, leftOut: 0 });
  });

  it("names the row: it is the one between R116 and R118, with its plot and name", async () => {
    const env = await bookWithGrid();
    const staged = stageCsvText(env, BAD);
    const row = staged.rows.find((r) => r.status === "error");
    expect(row?.rowNumber).toBe(117);
    expect(staged.rows[115]?.sourceRef).toBe("R116");
    expect(staged.rows[117]?.sourceRef).toBe("R118");
    expect(row?.cells["plot"]).toBe("C117");
    expect(row?.cells["name"]).toBe("Quill Fernhollow");
    expect(row?.errors).toEqual([{ row: 117, field: "sourceRef", heading: "Source ref", value: "", code: "required", fix: "enter_value" }]);
  });

  it("writes 0 records and does not change the revision", async () => {
    const env = await bookWithGrid();
    const staged = stageCsvText(env, BAD);
    const events = await env.eventCount();
    const revision = env.revision;
    expect(canCommit(staged)).toBe(false);
    const result = await commitImport(env.db, staged, { opId: mintId() });
    expect(result).toMatchObject({ ok: false, code: "import_has_errors" });
    expect(await env.eventCount()).toBe(events);
    expect(env.revision - revision).toBe(hand("3.1", "Revision change"));
    expect(summary(env).burials).toBe(hand("3.1", "Records written"));
  });
});

describe("the corrected import (hand totals 3.2)", () => {
  async function corrected() {
    const env = await bookWithGrid();
    const staged = stageCsvText(env, BAD);
    const row = staged.rows[116];
    const fixed = fixRow(staged, 117, { ...(row?.cells as Record<string, string>), sourceRef: "R117" });
    return { env, fixed };
  }

  it("counts 198 ready and 2 to place, and can be committed", async () => {
    const { fixed } = await corrected();
    expect(fixed.counts).toEqual({ ready: 198, unchanged: 0, unplaced: 2, conflicts: 0, errors: 0, leftOut: 0 });
    expect(canCommit(fixed)).toBe(true);
  });

  it("writes exactly 200 records in one revision", async () => {
    const { env, fixed } = await corrected();
    const revisionBefore = env.revision;
    const result = await commitStaged(env, fixed);
    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(result.ok && result.written).toBe(hand("3.2", "Records written"));
    expect(env.revision - revisionBefore).toBe(hand("3.2", "Revision change"));
    const s = summary(env);
    expect(s.burials).toBe(hand("3.2", "Records written"));
    expect(s.placed).toBe(hand("3.2", "Placed burials"));
    expect(s.unplaced).toBe(hand("3.2", "Unplaced burials"));
    expect(s.takenPlots).toBe(hand("3.2", "Taken plots"));
    expect(s.uncheckedPlots).toBe(hand("3.2", "Unchecked plots"));
    expect(s.freePlots).toBe(hand("3.2", "Free plots headline"));
    expect(s.uncheckedCodes).toEqual(["C199", "C200"]);
  });

  it("keeps the source ref, exactly as typed, with each record", async () => {
    const { env, fixed } = await corrected();
    await commitStaged(env, fixed);
    const refs = Object.values(env.state.burials).map((b) => b.sourceRef).sort();
    expect(refs).toEqual(Array.from({ length: 200 }, (_, i) => `R${String(i + 1).padStart(3, "0")}`));
    expect(Object.values(env.state.burials).find((b) => b.sourceRef === "R117")?.name).toBe("Quill Fernhollow");
  });

  it("keeps two people with one name apart", async () => {
    const { env, fixed } = await corrected();
    await commitStaged(env, fixed);
    const namesakes = Object.values(env.state.burials).filter((b) => b.name === "Mirel Quillmoss");
    expect(namesakes.map((b) => b.sourceRef).sort()).toEqual(["R050", "R150"]);
    expect(new Set(namesakes.map((b) => b.burialId)).size).toBe(2);
    expect(new Set(namesakes.map((b) => b.spaceId)).size).toBe(2);
  });

  it("previews 200 rows within 2 seconds and commits within 3 seconds", async () => {
    const env = await bookWithGrid();
    const previewStart = performance.now();
    const staged = stageCsvText(env, GOOD);
    const preview = performance.now() - previewStart;
    const commitStart = performance.now();
    const result = await commitStaged(env, staged);
    const written = performance.now() - commitStart;
    expect(result.ok).toBe(true);
    expect(preview).toBeLessThan(2000);
    expect(written).toBeLessThan(3000);
  });
});

describe("repeating the file (hand totals 3.3)", () => {
  async function imported() {
    const env = await bookWithGrid();
    const staged = stageCsvText(env, GOOD);
    const result = await commitStaged(env, staged);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return env;
  }

  it("the same file again: 0 new, 200 unchanged, 0 conflicts, 0 writes", async () => {
    const env = await imported();
    const again = stageCsvText(env, GOOD);
    expect(again.counts.ready + again.counts.unplaced).toBe(hand("3.3", "Same file again", 1));
    expect(again.counts.unchanged).toBe(hand("3.3", "Same file again", 2));
    expect(again.counts.conflicts).toBe(hand("3.3", "Same file again", 3));
    expect(again.writes).toBe(hand("3.3", "Same file again", 4));
    expect(again.drafts).toEqual([]);
    const events = await env.eventCount();
    expect(await commitImport(env.db, again, { opId: mintId() })).toMatchObject({ ok: false, code: "nothing_to_import" });
    expect(await env.eventCount()).toBe(events);
  });

  it("the same file with rows reversed: 0 new, 200 unchanged, 0 writes", async () => {
    const env = await imported();
    const lines = GOOD.trimEnd().split("\n");
    const reversed = [lines[0], ...lines.slice(1).reverse()].join("\n") + "\n";
    const again = stageCsvText(env, reversed);
    expect(again.counts.ready + again.counts.unplaced).toBe(hand("3.3", "Same file, rows reversed", 1));
    expect(again.counts.unchanged).toBe(hand("3.3", "Same file, rows reversed", 2));
    expect(again.counts.conflicts).toBe(hand("3.3", "Same file, rows reversed", 3));
    expect(again.writes).toBe(hand("3.3", "Same file, rows reversed", 4));
  });

  it("R117 changed: 199 unchanged, 1 conflict and 0 writes until the keeper chooses", async () => {
    const env = await imported();
    const changed = GOOD.replace("Quill Fernhollow", "Quill Fernhollow Jr");
    const staged = stageCsvText(env, changed);
    expect(staged.counts.ready + staged.counts.unplaced).toBe(hand("3.3", "R117 row changed", 1));
    expect(staged.counts.unchanged).toBe(hand("3.3", "R117 row changed", 2));
    expect(staged.counts.conflicts).toBe(hand("3.3", "R117 row changed", 3));
    expect(staged.writes).toBe(0);
    expect(staged.rows.find((r) => r.status === "conflict")?.sourceRef).toBe("R117");
    const events = await env.eventCount();
    expect(await commitImport(env.db, staged, { opId: mintId() })).toMatchObject({ ok: false, code: "import_has_conflicts" });
    expect(await env.eventCount()).toBe(events);

    const kept = chooseConflict(staged, 117, "keep_current");
    expect(kept.counts.unchanged).toBe(200);
    expect(canCommit(kept)).toBe(false);

    const corrected = chooseConflict(staged, 117, "record_correction");
    expect(await commitStaged(env, corrected)).toMatchObject({ ok: true, written: 1 });
    expect(Object.values(env.state.burials).find((b) => b.sourceRef === "R117")?.name).toBe("Quill Fernhollow Jr");
    expect(Object.keys(env.state.burials).length).toBe(200);
  });
});

describe("placing R199 on C199 (hand totals 3.4)", () => {
  const placed = GOOD.replace("R199,Sorrel Larkspur,,,unknown,P20", "R199,Sorrel Larkspur,Paper,C199,unknown,P20");

  async function before() {
    const env = await bookWithGrid();
    await commitStaged(env, stageCsvText(env, GOOD));
    return env;
  }

  it("goes from 198 placed, 2 unplaced and 2 unchecked plots to 199, 1 and 1", async () => {
    const env = await before();
    const start = summary(env);
    expect(start.placed).toBe(hand("3.4", "Placed", 1));
    expect(start.unplaced).toBe(hand("3.4", "Unplaced", 1));
    expect(start.uncheckedPlots).toBe(hand("3.4", "Unchecked plots", 1));
    expect(start.takenPlots).toBe(hand("3.4", "Taken plots", 1));

    const staged = stageCsvText(env, placed);
    expect(staged.rows.find((r) => r.status === "conflict")?.sourceRef).toBe("R199");
    expect(staged.counts).toMatchObject({ unchanged: 199, conflicts: 1 });
    const chosen = chooseConflict(staged, 199, "record_correction");
    expect(chosen.counts).toMatchObject({ ready: 1, conflicts: 0, unchanged: 199 });
    const result = await commitStaged(env, chosen);
    expect(result).toMatchObject({ ok: true, written: 1 });

    const end = summary(env);
    expect(end.placed).toBe(hand("3.4", "Placed", 2));
    expect(end.unplaced).toBe(hand("3.4", "Unplaced", 2));
    expect(end.uncheckedPlots).toBe(hand("3.4", "Unchecked plots", 2));
    expect(end.takenPlots).toBe(hand("3.4", "Taken plots", 2));
    expect(end.uncheckedCodes).toEqual(["C200"]);
    expect(end.burials).toBe(200);
  });

  it("is the same through the command the adapter exposes, and that marks only C199 checked", async () => {
    const env = await before();
    const burial = Object.values(env.state.burials).find((b) => b.sourceRef === "R199");
    if (burial === undefined) throw new Error("no R199");
    const c199 = Object.values(env.state.core.plots).find((p) => p.code === "C199");
    const space = c199?.spaces[0]?.spaceId as string;
    const dispatched = await env.dispatch([
      {
        type: "correct_burial",
        burialId: burial.burialId,
        claimId: mintId(),
        plotId: c199?.plotId as string,
        spaceId: space,
        sourceRef: "R199",
        name: burial.name,
        dateText: burial.dateText,
        page: burial.page,
        normalized: burial.normalized,
      },
    ]);
    expect(dispatched.result.ok).toBe(true);
    const end = summary(env);
    expect(end).toMatchObject({ placed: 199, unplaced: 1, uncheckedPlots: 1, takenPlots: 199, uncheckedCodes: ["C200"] });
  });
});

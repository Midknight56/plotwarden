// T15 stones, readings and the keeper's approval (spec 03, C3, C4, C7).
// The reading keeps its line breaks, an unclear mark survives a reload, the review fact is
// central, and a name reaches the family file only by a deliberate approval.
import { beforeEach, describe, expect, it } from "vitest";
import { approvalStatus } from "../../apps/churchyard-register/src/rules";
import { churchReviewFacts } from "../../apps/churchyard-register/src/review";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { INSCRIPTION_WORD, APPROVED_NAME, OTHER_OCCUPANT } from "../helpers/privacyCanaries";
import { ChurchEnv, id, layoutYewWalk, plotId, spaceId } from "../helpers/churchEnv";

type Bury = Extract<ChurchCommand, { type: "record_burial" }>;

const bury = (ref: string, code: string, name: string | undefined, over: Partial<Bury> = {}, space = 1): Bury => ({
  type: "record_burial",
  burialId: id(`burial:${ref}`),
  sourceRef: ref,
  ...(name === undefined ? { nameUnknown: true } : { recordedName: name }),
  date: { p: "day", y: 1889, m: 6, d: 2 },
  dateText: "2 June 1889",
  plotId: plotId(code),
  spaceId: spaceId(code, space),
  claimId: id(`claim:${ref}`),
  ...over,
});

const INSCRIPTION = `IN LOVING MEMORY\nMIREL QUILLMOSS\r\n  OF ${INSCRIPTION_WORD}\n\nREST  IN  PEACE\n`;
const A = id("burial:LF-07A");

const reading = (over: Partial<Extract<ChurchCommand, { type: "save_reading" }>> = {}): ChurchCommand => ({
  type: "save_reading",
  memorialId: id("memorial:A"),
  burialId: A,
  reading: INSCRIPTION,
  unclear: false,
  ...over,
});

let env: ChurchEnv;

beforeEach(async () => {
  env = await ChurchEnv.create();
  await layoutYewWalk(env);
  await env.must([bury("LF-07A", "Y07", APPROVED_NAME), bury("LF-07B", "Y07", OTHER_OCCUPANT, { date: { p: "year", y: 1921 }, dateText: "1921" }, 2)]);
});

async function snapshot() {
  return { state: JSON.stringify(env.state), revision: env.revision, events: (await env.events()).length };
}

describe("T15 the reading keeps its wording (C3.1)", () => {
  it("stores every line break, space and capital exactly, and a reload gives the same text", async () => {
    await env.must([reading()]);
    expect(env.state.memorials[id("memorial:A")]?.reading).toBe(INSCRIPTION);
    expect((await env.reload()).memorials[id("memorial:A")]?.reading).toBe(INSCRIPTION);
    const stored = (await env.events()).find((e) => e.type === "reading_saved");
    expect(JSON.stringify(stored?.payload)).toContain("REST  IN  PEACE");
  });

  it("accepts 4,000 characters and refuses 4,001, naming the field", async () => {
    await env.must([reading({ reading: "x".repeat(4000) })]);
    const before = await snapshot();
    const out = await env.dispatch([reading({ reading: "x".repeat(4001) })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields?.[0]).toEqual({ field: "reading", code: "over_limit" });
    expect(await snapshot()).toEqual(before);
  });

  it("replaces the wording under the same memorial, keeps the first save in history, and allows one memorial per burial", async () => {
    await env.must([reading()]);
    await env.must([reading({ reading: "IN LOVING MEMORY\nMIREL", unclear: true })]);
    expect(env.state.memorials[id("memorial:A")]?.reading).toBe("IN LOVING MEMORY\nMIREL");
    expect((await env.events()).filter((e) => e.type === "reading_saved")).toHaveLength(2);
    const before = await snapshot();
    const other = await env.dispatch([reading({ memorialId: id("memorial:B") })]);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("memorial_exists");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a reading for a burial that does not exist", async () => {
    const before = await snapshot();
    const out = await env.dispatch([reading({ burialId: id("burial:none") })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_such_burial");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T15 an unclear reading is remembered and raises a check (C3.2, C3.3, C7)", () => {
  it("keeps the 'Unclear letters' mark after a reload", async () => {
    await env.must([reading({ unclear: true })]);
    expect(env.state.memorials[id("memorial:A")]?.unclear).toBe(true);
    expect((await env.reload()).memorials[id("memorial:A")]?.unclear).toBe(true);
  });

  it("raises one reading_unclear fact with a neutral label, and no fact for a clear reading", async () => {
    await env.must([reading({ unclear: true })]);
    const facts = churchReviewFacts(env.state, "2026-04-20");
    expect(facts).toEqual([{ rule: "reading_unclear", subjectId: id("memorial:A"), label: "Record 1" }]);
    const text = JSON.stringify(facts);
    for (const secret of [INSCRIPTION_WORD, APPROVED_NAME, OTHER_OCCUPANT, "LF-07A", "MIREL"]) expect(text).not.toContain(secret);
    await env.must([reading({ unclear: false })]);
    expect(churchReviewFacts(env.state, "2026-04-20")).toEqual([]);
  });

  it("'Review reading' clears the mark and leaves the earlier mark in history", async () => {
    await env.must([reading({ unclear: true })]);
    await env.must([{ type: "settle_reading", memorialId: id("memorial:A") }]);
    expect(env.state.memorials[id("memorial:A")]).toMatchObject({ unclear: false, reading: INSCRIPTION });
    const types = (await env.events()).map((e) => e.type);
    expect(types.filter((t) => t === "reading_saved")).toHaveLength(1);
    expect(types).toContain("reading_settled");
    expect(churchReviewFacts(env.state, "2026-04-20")).toEqual([]);
    const again = await env.dispatch([{ type: "settle_reading", memorialId: id("memorial:none") }]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("no_such_memorial");
  });

  it("raises placement_missing for an unplaced burial and drops it once the burial is placed", async () => {
    await env.must([bury("LF-H1", "Y01", "Perrin Gladwyn", { plotId: undefined, spaceId: undefined, claimId: undefined, date: { p: "year", y: 1790 }, dateText: "1790" })]);
    await env.must([reading({ unclear: true })]);
    const facts = churchReviewFacts(env.state, "2026-04-20");
    expect(facts.map((f) => f.rule).sort()).toEqual(["placement_missing", "reading_unclear"]);
    expect(facts.map((f) => f.label).sort()).toEqual(["Record 1", "Record 2"]);
    expect(JSON.stringify(facts)).not.toContain("Perrin");
    await env.must([{ type: "confirm_empty", spaceIds: [spaceId("Y03")] }]);
    await env.must([{ type: "place_burial", burialId: id("burial:LF-H1"), plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: id("claim:p") }]);
    expect(churchReviewFacts(env.state, "2026-04-20").map((f) => f.rule)).toEqual(["reading_unclear"]);
  });
});

describe("T15 stone photos are private references (C3.4, C3.5)", () => {
  const photo = (): ChurchCommand => ({
    type: "add_photo",
    photoId: id("photo:1"),
    plotId: plotId("Y07"),
    blobId: id("blob:1"),
    imageType: "png",
    width: 10,
    height: 10,
    bytes: 100,
    caption: { text: "Front of the stone" },
  });

  it("links a photo of the same plot by its ID only", async () => {
    await env.must([reading(), photo()]);
    await env.must([{ type: "link_stone_photo", memorialId: id("memorial:A"), photoId: id("photo:1") }]);
    expect(env.state.memorials[id("memorial:A")]?.photoIds).toEqual([id("photo:1")]);
    expect(JSON.stringify(env.state.memorials)).not.toMatch(/\.(png|jpg|jpeg|webp)/);
  });

  it("refuses a photo that does not exist or belongs to another plot", async () => {
    await env.must([reading(), { ...photo(), plotId: plotId("Y01") } as ChurchCommand]);
    const before = await snapshot();
    const wrongPlot = await env.dispatch([{ type: "link_stone_photo", memorialId: id("memorial:A"), photoId: id("photo:1") }]);
    const missing = await env.dispatch([{ type: "link_stone_photo", memorialId: id("memorial:A"), photoId: id("photo:none") }]);
    for (const out of [wrongPlot, missing]) {
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("no_such_photo");
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe("T15 approving a burial for the family file (C4)", () => {
  const approve = (ref: string, over: Partial<Extract<ChurchCommand, { type: "approve_burial" }>> = {}): ChurchCommand => ({
    type: "approve_burial",
    burialId: id(`burial:${ref}`),
    includeYear: false,
    ...over,
  });
  const correct = (over: Partial<Extract<ChurchCommand, { type: "correct_burial" }>>) =>
    env.eventIdOf("burial_recorded", A).then((original): ChurchCommand => ({ type: "correct_burial", burialId: A, correctsEventId: original, reason: "Checked the stone", correctionRef: "page 3", ...over }));

  it("starts with no approval, and approves one burial without approving the other occupant", async () => {
    expect(approvalStatus(env.state, A)).toBe("none");
    await env.must([approve("LF-07A")]);
    expect(approvalStatus(env.state, A)).toBe("approved");
    expect(approvalStatus(env.state, id("burial:LF-07B"))).toBe("none");
    expect(env.state.approvals[A]).toMatchObject({ name: APPROVED_NAME, includeYear: false });
    expect(await env.reload()).toEqual(env.state);
  });

  it("shows the name the keeper chose for visitors", async () => {
    await env.must([approve("LF-07A", { name: "Mirel Quillmoss, beloved" })]);
    expect(env.state.approvals[A]?.name).toBe("Mirel Quillmoss, beloved");
  });

  it("refuses a burial with 'Name unknown', one that does not exist, and a year when there is none", async () => {
    await env.must([bury("LF-05", "Y05", undefined, { date: { p: "unknown" }, dateText: "" })]);
    const before = await snapshot();
    const unknown = await env.dispatch([approve("LF-05")]);
    const none = await env.dispatch([approve("none")]);
    const noYear = await env.dispatch([approve("LF-05", { includeYear: true, name: "Someone" })]);
    for (const out of [unknown, none, noYear]) expect(out.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("approval_needs_name");
    if (!none.ok) expect(none.error.code).toBe("no_such_burial");
    expect(await snapshot()).toEqual(before);
  });

  it("returns to review when the name changes, and is approved again only when the keeper approves again", async () => {
    await env.must([approve("LF-07A")]);
    await env.must([await correct({ recordedName: "Mirel Quillmoss Jr" })]);
    expect(approvalStatus(env.state, A)).toBe("review");
    expect(env.state.approvals[A]).toBeDefined();
    await env.must([approve("LF-07A")]);
    expect(approvalStatus(env.state, A)).toBe("approved");
    expect(env.state.approvals[A]?.name).toBe("Mirel Quillmoss Jr");
  });

  it("returns to review when the unknown flag is set, and when the shown year changes only if the year was approved", async () => {
    await env.must([approve("LF-07A", { includeYear: true })]);
    await env.must([await correct({ date: { p: "day", y: 1890, m: 6, d: 2 }, dateText: "2 June 1890", claimId: id("claim:newstart"), claimEventId: await env.eventIdOf("claim_added", id("claim:LF-07A")) })]);
    expect(approvalStatus(env.state, A)).toBe("review");

    const second = id("burial:LF-07B");
    await env.must([approve("LF-07B")]);
    expect(approvalStatus(env.state, second)).toBe("approved");
    const original = await env.eventIdOf("burial_recorded", second);
    await env.must([{ type: "correct_burial", burialId: second, correctsEventId: original, date: { p: "year", y: 1922 }, dateText: "1922", reason: "r", correctionRef: "p" }]);
    expect(approvalStatus(env.state, second)).toBe("approved");
  });

  it("returns to review when the burial is moved, and drops out when it is voided or the approval is withdrawn", async () => {
    await env.must([approve("LF-07A")]);
    await env.must([{ type: "confirm_empty", spaceIds: [spaceId("Y03")] }]);
    const original = await env.eventIdOf("burial_recorded", A);
    const claimEvent = await env.eventIdOf("claim_added", id("claim:LF-07A"));
    await env.must([{ type: "move_burial", burialId: A, spaceId: spaceId("Y03"), claimId: id("claim:moved"), correctsEventId: original, claimEventId: claimEvent, reason: "r", correctionRef: "p" }]);
    expect(approvalStatus(env.state, A)).toBe("review");
    await env.must([approve("LF-07A")]);
    expect(approvalStatus(env.state, A)).toBe("approved");
    await env.must([{ type: "withdraw_approval", burialId: A }]);
    expect(approvalStatus(env.state, A)).toBe("none");
    await env.must([approve("LF-07A")]);
    const moved = await env.eventIdOf("burial_moved", A);
    const claimMoved = await env.eventIdOf("claim_added", id("claim:moved"));
    await env.must([{ type: "void_burial", burialId: A, correctsEventId: moved, claimEventId: claimMoved, reason: "Entered twice", correctionRef: "p" }]);
    expect(approvalStatus(env.state, A)).toBe("none");
  });
});

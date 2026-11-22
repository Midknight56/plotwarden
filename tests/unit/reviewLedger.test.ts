// T24: the review ledger in the base state (spec 05, X1, X6.1, X6.2). Keys are random and kept,
// a version rises only when a fingerprint changes, a key comes back when a check reopens, receipts
// change nothing but the receipt list, and replaying the events gives the same ledger.
// Expected values come from hand-totals.md section 6.4.
import { beforeAll, describe, expect, it } from "vitest";
import { BASE_COMMAND_TYPES, applyBase, decideBase, emptyBase, isBaseCommand } from "../../template/src/base";
import type { BaseCommand, BaseState } from "../../template/src/base";
import { makeStoredEvent, replay } from "../../template/src/events";
import type { StoredEvent } from "../../template/src/events";
import { DEFAULT_ALIAS, REVIEW_COMMAND_TYPES, fingerprint, openIssuesNow, planReviewKeys } from "../../template/src/review";
import type { KeySource, KeyPlan } from "../../template/src/review";
import { SITE_ID, fid } from "../helpers/site";

const CTX = { spacesPerPlot: { min: 1, max: 1 } };
const ON = "2026-04-20";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A mint that counts, so a test can say how many keys were made. */
function counter(): { mint: () => string; made: () => number } {
  let n = 0;
  return { mint: () => `0badc0de-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`, made: () => n };
}

const offer = fid("offer:b03");
const charge = fid("charge:b02");
const burial = fid("burial:h1");
const reading = fid("memorial:y07");

const src = (rule: string, subjectId: string, fp = "a"): KeySource => ({ rule, subjectId, fingerprint: fp });

/** Run the plan's `prepare_review` through the base rules and give the new state. */
function store(state: BaseState, plan: KeyPlan): BaseState {
  if (!plan.changed) return state;
  const command: BaseCommand = { type: "prepare_review", subjects: plan.subjects, ...(plan.alias === undefined ? {} : { alias: plan.alias }) };
  const decided = decideBase(state, command, ON, CTX);
  if (!decided.ok) throw new Error(`refused: ${JSON.stringify(decided.error)}`);
  return decided.value.reduce((s, d) => applyBase(s, d.event) as BaseState, state);
}

const fresh = (): BaseState => emptyBase(SITE_ID);

describe("the command names", () => {
  it("keeps the 16 base names and adds two review names", () => {
    expect(BASE_COMMAND_TYPES.length).toBe(16);
    expect([...REVIEW_COMMAND_TYPES]).toEqual(["prepare_review", "receive_review"]);
    expect(isBaseCommand({ type: "prepare_review" })).toBe(true);
    expect(isBaseCommand({ type: "receive_review" })).toBe(true);
    expect(isBaseCommand({ type: "record_burial" })).toBe(false);
  });

  it("starts with an empty ledger and no site name", () => {
    expect(fresh().review).toEqual({ subjects: {}, received: {} });
  });
});

describe("the fingerprint", () => {
  it("is 14 hex digits and the same every time", () => {
    expect(fingerprint(["a", "b"])).toMatch(/^[0-9a-f]{14}$/);
    expect(fingerprint(["a", "b"])).toBe(fingerprint(["a", "b"]));
  });

  it("changes with any part, with their order and with where a part ends", () => {
    const base = fingerprint(["ab", "c"]);
    expect(fingerprint(["ab", "d"])).not.toBe(base);
    expect(fingerprint(["c", "ab"])).not.toBe(base);
    expect(fingerprint(["a", "bc"])).not.toBe(base);
    expect(fingerprint([])).not.toBe(fingerprint([""]));
  });

  it("gives different digests to different long readings", () => {
    const a = "Here lies\nMirel".repeat(100);
    expect(fingerprint([a])).not.toBe(fingerprint([`${a}.`]));
  });
});

describe("planning keys (X1, hand totals 6.4)", () => {
  it("mints a key for each new subject and issue, labels them Record 1 and Record 2 in source order, and starts at version 1", () => {
    const { mint, made } = counter();
    const plan = planReviewKeys(fresh().review, [src("offer_late", offer), src("fee_late", charge)], { mint });
    expect(plan.changed).toBe(true);
    expect(plan.issues.map((i) => [i.rule, i.label, i.factVersion])).toEqual([
      ["offer_late", "Record 1", 1],
      ["fee_late", "Record 2", 1],
    ]);
    expect(made()).toBe(4);
    const keys = plan.issues.flatMap((i) => [i.subjectKey, i.issueKey]);
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(key).toMatch(UUID);
  });

  it("never gives a key that equals a private ID", () => {
    const sources = [src("offer_late", offer), src("fee_late", charge)];
    const plan = planReviewKeys(fresh().review, sources, { mint: () => globalThis.crypto.randomUUID() });
    const privateIds = new Set([offer, charge]);
    for (const issue of plan.issues) {
      expect(privateIds.has(issue.subjectKey)).toBe(false);
      expect(privateIds.has(issue.issueKey)).toBe(false);
    }
  });

  it("stores each subject once, with its fingerprint, and the plan lists the checks in source order", () => {
    const { mint } = counter();
    const plan = planReviewKeys(fresh().review, [src("fee_late", charge, "fp1"), src("offer_late", offer, "fp2")], { mint });
    expect(plan.issues.map((i) => i.subjectId)).toEqual([charge, offer]);
    expect(plan.subjects.map((s) => s.subjectId)).toEqual([charge, offer]);
    expect(plan.subjects[0]?.issues[0]).toMatchObject({ rule: "fee_late", factVersion: 1, fingerprint: "fp1" });
  });

  it("gives one subject key to two rules on one subject", () => {
    const { mint } = counter();
    const plan = planReviewKeys(fresh().review, [src("offer_late", offer), src("fee_late", offer)], { mint });
    expect(plan.subjects).toHaveLength(1);
    expect(plan.issues[0]?.subjectKey).toBe(plan.issues[1]?.subjectKey);
    expect(plan.issues[0]?.issueKey).not.toBe(plan.issues[1]?.issueKey);
    expect(plan.issues.map((i) => i.label)).toEqual(["Record 1", "Record 1"]);
  });

  it("changes nothing and mints nothing when the same checks come again (step B)", () => {
    const first = counter();
    const sources = [src("fee_late", charge)];
    const state = store(fresh(), planReviewKeys(fresh().review, sources, { mint: first.mint }));
    const second = counter();
    const again = planReviewKeys(state.review, sources, { mint: second.mint });
    expect(again.changed).toBe(false);
    expect(again.subjects).toEqual([]);
    expect(second.made()).toBe(0);
    expect(again.issues.map((i) => i.issueKey)).toEqual(planReviewKeys(state.review, sources, { mint: second.mint }).issues.map((i) => i.issueKey));
  });

  it("keeps the first subject's label and numbers the next subject 2 (steps A and C)", () => {
    const { mint } = counter();
    const a = store(fresh(), planReviewKeys(fresh().review, [src("fee_late", charge)], { mint }));
    const plan = planReviewKeys(a.review, [src("offer_late", offer), src("fee_late", charge)], { mint });
    expect(plan.issues.map((i) => [i.rule, i.label, i.factVersion])).toEqual([
      ["offer_late", "Record 2", 1],
      ["fee_late", "Record 1", 1],
    ]);
    expect(plan.subjects.map((s) => s.subjectId)).toEqual([offer]);
  });

  it("raises the version by one, and only for the check whose fingerprint changed (step F)", () => {
    const { mint } = counter();
    const s0 = store(fresh(), planReviewKeys(fresh().review, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 3000")], { mint }));
    const before = planReviewKeys(s0.review, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 3000")], { mint });
    const plan = planReviewKeys(s0.review, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 2000")], { mint });
    expect(plan.changed).toBe(true);
    expect(plan.issues.map((i) => i.factVersion)).toEqual([1, 2]);
    expect(plan.issues[1]?.issueKey).toBe(before.issues[1]?.issueKey);
    expect(plan.subjects.map((s) => s.subjectId)).toEqual([charge]);
    const s1 = store(s0, plan);
    expect(planReviewKeys(s1.review, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 2000")], { mint }).changed).toBe(false);
  });

  it("gives a check that closes and opens again its old key and version (steps D and E)", () => {
    const { mint, made } = counter();
    const both = [src("offer_late", offer), src("fee_late", charge)];
    const s0 = store(fresh(), planReviewKeys(fresh().review, both, { mint }));
    const keyOfOffer = planReviewKeys(s0.review, both, { mint }).issues[0]?.issueKey;
    const closed = planReviewKeys(s0.review, [src("fee_late", charge)], { mint });
    expect(closed.changed).toBe(false);
    expect(closed.issues).toHaveLength(1);
    const madeBefore = made();
    const reopened = planReviewKeys(s0.review, both, { mint });
    expect(reopened.changed).toBe(false);
    expect(made()).toBe(madeBefore);
    expect(reopened.issues[0]).toMatchObject({ issueKey: keyOfOffer, factVersion: 1 });
  });

  it("raises the version when a check reopens with other source fields", () => {
    const { mint } = counter();
    const s0 = store(fresh(), planReviewKeys(fresh().review, [src("reading_unclear", reading, "old words")], { mint }));
    const plan = planReviewKeys(s0.review, [src("reading_unclear", reading, "new words")], { mint });
    expect(plan.issues[0]?.factVersion).toBe(2);
  });

  it("uses a label the keeper approved for a new subject and for a stored one", () => {
    const { mint } = counter();
    const plan = planReviewKeys(fresh().review, [src("fee_late", charge)], { mint, labels: { [charge]: "Bed by the shed" } });
    expect(plan.issues[0]?.label).toBe("Bed by the shed");
    const s0 = store(fresh(), plan);
    expect(planReviewKeys(s0.review, [src("fee_late", charge)], { mint }).changed).toBe(false);
    const renamed = planReviewKeys(s0.review, [src("fee_late", charge)], { mint, labels: { [charge]: "Shed bed" } });
    expect(renamed.changed).toBe(true);
    expect(renamed.issues[0]?.label).toBe("Shed bed");
    expect(renamed.subjects[0]?.label).toBe("Shed bed");
    expect(renamed.subjects[0]?.issues[0]?.issueKey).toBe(plan.issues[0]?.issueKey);
  });

  it("stores a site name only when it differs from what is stored, with Site 1 as the unstored default", () => {
    const { mint } = counter();
    expect(DEFAULT_ALIAS).toBe("Site 1");
    expect(planReviewKeys(fresh().review, [], { mint })).toMatchObject({ changed: false, issues: [] });
    expect(planReviewKeys(fresh().review, [], { mint, alias: "Site 1" }).changed).toBe(false);
    const named = planReviewKeys(fresh().review, [], { mint, alias: "Lower plots" });
    expect(named).toMatchObject({ changed: true, alias: "Lower plots" });
    const s0 = store(fresh(), named);
    expect(s0.review.alias).toBe("Lower plots");
    expect(planReviewKeys(s0.review, [], { mint, alias: "Lower plots" }).changed).toBe(false);
    expect(planReviewKeys(s0.review, [], { mint, alias: "Upper plots" }).alias).toBe("Upper plots");
    expect(planReviewKeys(s0.review, [], { mint, alias: "Site 1" }).alias).toBe("Site 1");
  });

  it("changes nothing in the ledger it is given", () => {
    const { mint } = counter();
    const review = store(fresh(), planReviewKeys(fresh().review, [src("fee_late", charge)], { mint })).review;
    const before = JSON.stringify(review);
    planReviewKeys(review, [src("fee_late", charge, "other"), src("offer_late", offer)], { mint });
    expect(JSON.stringify(review)).toBe(before);
  });
});

describe("the checks open now (X5.5)", () => {
  const { mint } = counter();
  let stored: BaseState["review"];
  beforeAll(() => {
    stored = store(fresh(), planReviewKeys(fresh().review, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 3000")], { mint })).review;
  });

  it("gives each stored check its stored version", () => {
    const open = openIssuesNow(stored, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 3000")]);
    expect(open.map((o) => [o.subjectId, o.rule, o.factVersion])).toEqual([[offer, "offer_late", 1], [charge, "fee_late", 1]]);
  });

  it("gives the version the next plan would give when the fingerprint changed, without storing it", () => {
    const open = openIssuesNow(stored, [src("fee_late", charge, "balance 2000")]);
    expect(open.map((o) => o.factVersion)).toEqual([2]);
    expect(stored.subjects[charge]?.issues["fee_late"]?.factVersion).toBe(1);
  });

  it("leaves out a source that has no key yet and mints nothing", () => {
    expect(openIssuesNow(stored, [src("reading_unclear", reading)])).toEqual([]);
    expect(openIssuesNow(stored, [])).toEqual([]);
  });

  it("agrees with a plan on every key", () => {
    const sources = [src("offer_late", offer, "o"), src("fee_late", charge, "balance 2000")];
    const plan = planReviewKeys(stored, sources, { mint });
    const open = openIssuesNow(stored, sources);
    expect(open.map((o) => [o.issueKey, o.factVersion])).toEqual(plan.issues.map((i) => [i.issueKey, i.factVersion]));
  });
});

describe("prepare_review (X1.4)", () => {
  const subject = (id: string, over: Partial<{ subjectKey: string; issueKey: string; factVersion: number; label: string }> = {}) => ({
    subjectId: id,
    subjectKey: over.subjectKey ?? "0badc0de-0000-4000-8000-00000000000a",
    label: over.label ?? "Record 1",
    issues: [{ rule: "fee_late", issueKey: over.issueKey ?? "0badc0de-0000-4000-8000-00000000000b", factVersion: over.factVersion ?? 1, fingerprint: "x" }],
  });
  const run = (state: BaseState, command: BaseCommand) => decideBase(state, command, ON, CTX);

  it("appends one review_prepared event and stores the subject", () => {
    const decided = run(fresh(), { type: "prepare_review", subjects: [subject(charge)] });
    expect(decided.ok).toBe(true);
    if (decided.ok) {
      expect(decided.value.map((d) => d.event.type)).toEqual(["review_prepared"]);
      const next = decided.value.reduce((s, d) => applyBase(s, d.event) as BaseState, fresh());
      expect(next.review.subjects[charge]).toEqual({
        subjectKey: "0badc0de-0000-4000-8000-00000000000a",
        label: "Record 1",
        issues: { fee_late: { issueKey: "0badc0de-0000-4000-8000-00000000000b", factVersion: 1, fingerprint: "x" } },
      });
    }
  });

  it("refuses a command with no site name and no subject", () => {
    const decided = run(fresh(), { type: "prepare_review", subjects: [] });
    expect(decided).toMatchObject({ ok: false, error: { code: "nothing_to_prepare" } });
  });

  it("refuses a key that is not a UUID, a version below 1, a label over 40 and a site name over 40, naming the field", () => {
    const fields = (command: BaseCommand) => {
      const decided = run(fresh(), command);
      return decided.ok ? [] : (decided.error.fields ?? []).map((f) => f.field);
    };
    expect(fields({ type: "prepare_review", subjects: [subject(charge, { subjectKey: "key-1" })] })).toContain("subjects.0.subjectKey");
    expect(fields({ type: "prepare_review", subjects: [subject(charge, { issueKey: "key-2" })] })).toContain("subjects.0.issues.0.issueKey");
    expect(fields({ type: "prepare_review", subjects: [subject(charge, { factVersion: 0 })] })).toContain("subjects.0.issues.0.factVersion");
    expect(fields({ type: "prepare_review", subjects: [subject(charge, { label: "x".repeat(41) })] })).toContain("subjects.0.label");
    expect(fields({ type: "prepare_review", alias: "x".repeat(41), subjects: [] })).toContain("alias");
    expect(run(fresh(), { type: "prepare_review", alias: "x".repeat(40), subjects: [] }).ok).toBe(true);
  });

  it("refuses a key that another subject or rule already holds", () => {
    const s0 = store(fresh(), {
      issues: [],
      changed: true,
      subjects: [subject(charge)],
    });
    const clash = run(s0, { type: "prepare_review", subjects: [subject(offer)] });
    expect(clash).toMatchObject({ ok: false, error: { code: "duplicate_id" } });
    const same = run(s0, { type: "prepare_review", subjects: [subject(charge, { factVersion: 2 })] });
    expect(same.ok).toBe(true);
  });
});

describe("receive_review (X6)", () => {
  const A1 = "ac700000-0000-4000-8000-000000000001";
  const A2 = "ac700000-0000-4000-8000-000000000002";
  const A3 = "ac700000-0000-4000-8000-000000000003";
  const { mint } = counter();
  const ready = (): { state: BaseState; keys: string[] } => {
    const plan = planReviewKeys(fresh().review, [src("placement_missing", burial), src("reading_unclear", reading)], { mint });
    return { state: store(fresh(), plan), keys: plan.issues.map((i) => i.issueKey) };
  };
  const decision = (actionId: string, issueKey: string, over: Record<string, unknown> = {}) => ({ actionId, issueKey, factVersion: 1, disposition: "checked" as const, reviewedOn: "2026-04-21", ...over });
  const receive = (state: BaseState, decisions: ReturnType<typeof decision>[]) => decideBase(state, { type: "receive_review", decisions }, ON, CTX);
  const applyAll = (state: BaseState, drafts: { event: { type: string } }[]) => drafts.reduce((s, d) => applyBase(s, d.event) as BaseState, state);

  it("appends one review_received event for each new action ID and stores it", () => {
    const { state, keys } = ready();
    const decided = receive(state, [decision(A1, keys[0] as string), decision(A2, keys[1] as string, { disposition: "needs_keeper" })]);
    expect(decided.ok).toBe(true);
    if (decided.ok) {
      expect(decided.value.map((d) => d.event.type)).toEqual(["review_received", "review_received"]);
      const next = applyAll(state, decided.value);
      expect(Object.keys(next.review.received).sort()).toEqual([A1, A2]);
      expect(next.review.received[A2]).toEqual({ issueKey: keys[1], factVersion: 1, disposition: "needs_keeper", reviewedOn: "2026-04-21" });
    }
  });

  it("records only the new ones when some were received, and refuses when none is new (X5.6)", () => {
    const { state, keys } = ready();
    const first = receive(state, [decision(A1, keys[0] as string)]);
    const after = applyAll(state, first.ok ? first.value : []);
    const mixed = receive(after, [decision(A1, keys[0] as string), decision(A2, keys[1] as string)]);
    expect(mixed.ok && mixed.value.map((d) => d.event)).toMatchObject([{ type: "review_received", actionId: A2 }]);
    expect(receive(after, [decision(A1, keys[0] as string)])).toMatchObject({ ok: false, error: { code: "already_received" } });
  });

  it("refuses an issue key the ledger does not hold", () => {
    const { state } = ready();
    expect(receive(state, [decision(A1, "0badc0de-0000-4000-8000-0000000000ff")])).toMatchObject({ ok: false, error: { code: "no_such_issue" } });
  });

  it("refuses a repeated action ID in one command, a bad disposition, a bad date and a version below 1", () => {
    const { state, keys } = ready();
    const k = keys[0] as string;
    expect(receive(state, [decision(A1, k), decision(A1, k)])).toMatchObject({ ok: false, error: { code: "duplicate_id" } });
    const fields = (d: ReturnType<typeof decision>) => {
      const got = receive(state, [d]);
      return got.ok ? [] : (got.error.fields ?? []).map((f) => f.field);
    };
    expect(fields(decision(A3, k, { disposition: "ignored" }))).toContain("decisions.0.disposition");
    expect(fields(decision(A3, k, { reviewedOn: "2026-02-30" }))).toContain("decisions.0.reviewedOn");
    expect(fields(decision(A3, k, { factVersion: 0 }))).toContain("decisions.0.factVersion");
    expect(fields(decision("nope", k))).toContain("decisions.0.actionId");
  });

  it("changes nothing but the receipt list (INV_SLIP_READ_ONLY, hand totals 6.5)", () => {
    const base = fresh();
    const withPlot = applyBase(base, { type: "plot_added", plotId: fid("plot:Y03"), code: "Y03", spaces: [{ spaceId: fid("space:Y03"), label: "1" }] } as never) as BaseState;
    const withClaim = applyBase(withPlot, { type: "claim_added", claim: { claimId: fid("claim:1"), spaceId: fid("space:Y03"), mode: "taken", endable: false, sourceRef: "LF-01" } } as never) as BaseState;
    const plan = planReviewKeys(withClaim.review, [src("placement_missing", burial)], { mint });
    const prepared = store(withClaim, plan);
    const decided = receive(prepared, [decision(A1, plan.issues[0]?.issueKey as string)]);
    const next = applyAll(prepared, decided.ok ? decided.value : []);
    expect(next.core).toBe(prepared.core);
    expect(next.map).toBe(prepared.map);
    expect(next.notes).toBe(prepared.notes);
    expect({ ...next, review: null }).toEqual({ ...prepared, review: null });
    expect(next.review.subjects).toEqual(prepared.review.subjects);
    expect(Object.keys(next.review.received)).toEqual([A1]);
  });
});

describe("replay (X1.5)", () => {
  it("gives the same ledger from the stored events as step by step", () => {
    const { mint } = counter();
    let state = fresh();
    const stored: StoredEvent[] = [];
    const add = (command: BaseCommand) => {
      const decided = decideBase(state, command, ON, CTX);
      if (!decided.ok) throw new Error(JSON.stringify(decided.error));
      for (const draft of decided.value) {
        state = applyBase(state, draft.event) as BaseState;
        stored.push(
          makeStoredEvent(draft, { eventId: fid(`event:${stored.length + 1}`), siteId: SITE_ID, seq: stored.length + 1, opId: fid(`op:${stored.length + 1}`), recordedAt: "2026-04-20T09:30:00.000Z" }),
        );
      }
    };
    const plan1 = planReviewKeys(state.review, [src("offer_late", offer, "o"), src("fee_late", charge, "balance 3000")], { mint, alias: "Lower plots" });
    add({ type: "prepare_review", alias: plan1.alias, subjects: plan1.subjects });
    const plan2 = planReviewKeys(state.review, [src("fee_late", charge, "balance 2000")], { mint });
    add({ type: "prepare_review", subjects: plan2.subjects });
    add({ type: "receive_review", decisions: [{ actionId: "ac700000-0000-4000-8000-000000000001", issueKey: plan1.issues[0]?.issueKey as string, factVersion: 1, disposition: "checked", reviewedOn: "2026-04-21" }] });
    const replayed = replay<BaseState, { type: string }>((s, e) => applyBase(s, e) ?? s, fresh(), stored);
    expect(replayed.ok && replayed.value).toEqual(state);
    expect(state.review.alias).toBe("Lower plots");
    expect(state.review.subjects[charge]?.issues["fee_late"]?.factVersion).toBe(2);
    expect(Object.keys(state.review.received)).toHaveLength(1);
  });
});

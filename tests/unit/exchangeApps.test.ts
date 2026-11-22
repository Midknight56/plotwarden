// T24: the two registers raise their checks for the committee (spec 05, X2, X1, hand totals 6.2 to 6.5).
// Lantern Fold gives one unclear reading and one unplaced burial. Thimble Beds gives the late fee, and in the
// late offer branch the late offer too. Keys and versions are worked through real commits in a fake database.
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseState } from "../../template/src/base";
import { buildPacket, encodePacket } from "../../template/src/exchange/packet";
import type { ReviewPacket, Rule } from "../../template/src/exchange/schema";
import { scanForCanaries } from "../../template/src/output/privacy";
import { DEFAULT_ALIAS, openIssuesNow, planReviewKeys } from "../../template/src/review";
import type { KeyPlan, KeySource } from "../../template/src/review";
import { allotReviewFacts, allotReviewSupport } from "../../apps/allotment-register/src/review";
import { churchReviewFacts, churchReviewSupport } from "../../apps/churchyard-register/src/review";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { REVIEW_CANARIES as GARDEN_CANARIES, APPLICANTS, CONTACTS, NEW_HOLDER, RECEIPT_REF, TENANTS } from "../helpers/gardenCanaries";
import { GardenEnv, id as gid } from "../helpers/gardenEnv";
import { ChurchEnv, id as cid, plotId, spaceId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";
import { APPROVED_NAME, CONTACT, INSCRIPTION_WORD, LIVING_HOLDERS, OTHER_OCCUPANT, REVIEW_CANARIES as CHURCH_CANARIES } from "../helpers/privacyCanaries";
import { SEASON_2026, app, buildThimble, chargeId, claim, tenancy } from "../helpers/thimbleBeds";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ON = "2026-04-20";
const mint = (): string => globalThis.crypto.randomUUID();

interface Exporter {
  state: BaseState;
  revision: number;
  siteKey: string;
  lineageId: string;
  kind: string;
  must(commands: never[], on?: string): Promise<void>;
}

/** What the screen does: plan, store the keys if they changed, then build the packet at the new revision. */
async function exportNow(
  env: Exporter,
  support: { sources(state: never, asOf: string): (KeySource & { label: string })[] },
  asOf: string,
  options: { alias?: string; labels?: Record<string, string> } = {},
): Promise<{ plan: KeyPlan; packet: ReviewPacket; text: string; committed: boolean }> {
  const plan = planReviewKeys(env.state.review, support.sources(env.state as never, asOf), { mint, ...options });
  if (plan.changed) {
    await env.must([{ type: "prepare_review", subjects: plan.subjects, ...(plan.alias === undefined ? {} : { alias: plan.alias }) }] as never[]);
  }
  const built = buildPacket({
    siteKind: env.kind,
    siteKey: env.siteKey,
    lineageId: env.lineageId,
    siteAlias: env.state.review.alias ?? DEFAULT_ALIAS,
    revision: env.revision,
    asOf,
    issues: plan.issues.map((i) => ({ issueKey: i.issueKey, subjectKey: i.subjectKey, label: i.label, rule: i.rule as Rule, factVersion: i.factVersion })),
  });
  if (!built.ok) throw new Error(`packet refused: ${JSON.stringify(built.fields)}`);
  const encoded = encodePacket(built.packet);
  if (!encoded.ok) throw new Error("packet too big");
  return { plan, packet: built.packet, text: encoded.text, committed: plan.changed };
}

const church = (env: ChurchEnv): Exporter => ({
  get state() {
    return env.state;
  },
  get revision() {
    return env.revision;
  },
  siteKey: env.site.siteKey,
  lineageId: env.site.lineageId,
  kind: env.site.kind,
  must: (commands, on) => env.must(commands as unknown as ChurchCommand[], on),
});

const garden = (env: GardenEnv): Exporter => ({
  get state() {
    return env.state;
  },
  get revision() {
    return env.revision;
  },
  siteKey: env.site.siteKey,
  lineageId: env.site.lineageId,
  kind: env.site.kind,
  must: (commands, on) => env.must(commands as unknown as AllotCommand[], on),
});

describe("Lantern Fold (hand totals 1, 4.6 and 6.2)", () => {
  let env: ChurchEnv;
  const burialH1 = cid("burial:LF-H1");
  const memorial = cid("memorial:Y07");
  const INSCRIPTION = `IN LOVING MEMORY\nMIREL QUILLMOSS\nOF ${INSCRIPTION_WORD}\n`;
  const saveReading = (over: Partial<Extract<ChurchCommand, { type: "save_reading" }>> = {}): ChurchCommand => ({
    type: "save_reading",
    memorialId: memorial,
    burialId: cid("burial:LF-07A"),
    reading: INSCRIPTION,
    unclear: true,
    ...over,
  });

  beforeEach(async () => {
    env = await ChurchEnv.create();
    await buildFold(env, { geometry: true });
    await env.must([saveReading()]);
  });

  const sources = () => churchReviewSupport.sources(env.state, ON);

  it("raises the unplaced burial first and the unclear reading second, as the same facts the app already raises", () => {
    expect(sources().map((s) => [s.rule, s.subjectId])).toEqual([
      ["placement_missing", burialH1],
      ["reading_unclear", memorial],
    ]);
    expect(sources().map(({ fingerprint: _f, ...fact }) => fact)).toEqual(churchReviewFacts(env.state, ON));
    for (const source of sources()) expect(source.fingerprint).toMatch(/^[0-9a-f]{14}$/);
  });

  it("gives the same sources after a reload", async () => {
    expect(churchReviewSupport.sources(await env.reload(), ON)).toEqual(sources());
  });

  it("ignores the date, because neither rule depends on it", () => {
    expect(churchReviewSupport.sources(env.state, "2030-01-01")).toEqual(sources());
  });

  it("gives two issues with default labels, version 1 and their actions, and commits once (hand totals 6.2)", async () => {
    const before = env.revision;
    const made = await exportNow(church(env), churchReviewSupport, ON);
    expect(made.committed).toBe(true);
    expect(env.revision).toBe(before + 1);
    expect(made.packet.revision).toBe(before + 1);
    expect(made.packet.siteAlias).toBe("Site 1");
    expect(made.plan.issues.map((i) => [i.label, i.rule, i.factVersion])).toEqual([
      ["Record 1", "placement_missing", 1],
      ["Record 2", "reading_unclear", 1],
    ]);
    expect(made.packet.issues.map((i) => i.action).sort()).toEqual(["check_location", "read_stone_again"]);
    expect(made.packet.issues).toHaveLength(2);
  });

  it("exports the same bytes again on the same date and commits nothing", async () => {
    const first = await exportNow(church(env), churchReviewSupport, ON);
    const revision = env.revision;
    const second = await exportNow(church(env), churchReviewSupport, ON);
    expect(second.committed).toBe(false);
    expect(env.revision).toBe(revision);
    expect(second.text).toBe(first.text);
  });

  it("holds none of the Lantern Fold canaries, the plot codes or the site title in the packet bytes", async () => {
    const made = await exportNow(church(env), churchReviewSupport, ON);
    const canaries = [...CHURCH_CANARIES, "Perrin Gladwyn", "LF-H1", "LF-07A", "Lantern Fold", "Y07", "Y03", INSCRIPTION_WORD];
    expect(scanForCanaries(made.text, canaries)).toEqual([]);
    expect(scanForCanaries(JSON.parse(made.text), canaries)).toEqual([]);
  });

  it("uses fresh random keys that are not private IDs, and no two exports of two registers share one", async () => {
    const made = await exportNow(church(env), churchReviewSupport, ON);
    const keys = made.packet.issues.flatMap((i) => [i.issueKey, i.subjectKey]);
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) {
      expect(key).toMatch(UUID);
      expect([burialH1, memorial, cid("burial:LF-07A"), env.site.id, env.site.lineageId, env.site.siteKey]).not.toContain(key);
    }
    const other = await ChurchEnv.create("Another fold");
    await buildFold(other, { geometry: true });
    await other.must([saveReading()]);
    const again = await exportNow(church(other), churchReviewSupport, ON);
    expect(again.packet.issues.some((i) => keys.includes(i.issueKey) || keys.includes(i.subjectKey))).toBe(false);
  });

  it("keeps the ledger through a reload, with the same keys and the stored site name", async () => {
    const made = await exportNow(church(env), churchReviewSupport, ON, { alias: "Lower churchyard" });
    const reloaded = await env.reload();
    expect(reloaded.review).toEqual(env.state.review);
    expect(reloaded.review.alias).toBe("Lower churchyard");
    const plan = planReviewKeys(reloaded.review, churchReviewSupport.sources(reloaded, ON), { mint });
    expect(plan.changed).toBe(false);
    expect(plan.issues.map((i) => i.issueKey).sort()).toEqual(made.packet.issues.map((i) => i.issueKey).sort());
  });

  it("raises the reading to version 2 with the same key when its words change, and leaves the placement at 1", async () => {
    const first = await exportNow(church(env), churchReviewSupport, ON);
    await env.must([saveReading({ reading: `${INSCRIPTION}AND HIS WIFE\n` })]);
    const second = await exportNow(church(env), churchReviewSupport, ON);
    const byRule = (p: ReviewPacket, rule: string) => p.issues.find((i) => i.rule === rule);
    expect(byRule(second.packet, "reading_unclear")?.issueKey).toBe(byRule(first.packet, "reading_unclear")?.issueKey);
    expect(byRule(second.packet, "reading_unclear")?.factVersion).toBe(2);
    expect(byRule(second.packet, "placement_missing")?.factVersion).toBe(1);
    expect(second.committed).toBe(true);
  });

  it("raises the version when the page ref changes, and not when the reading stays and the mark stays", async () => {
    await exportNow(church(env), churchReviewSupport, ON);
    await env.must([saveReading({ pageRef: "book 3 page 9" })]);
    const plan = planReviewKeys(env.state.review, sources(), { mint });
    expect(plan.issues.find((i) => i.rule === "reading_unclear")?.factVersion).toBe(2);
  });

  it("raises the placement to version 2 when the burial's name is corrected", async () => {
    await exportNow(church(env), churchReviewSupport, ON);
    await env.must([
      {
        type: "correct_burial",
        burialId: burialH1,
        recordedName: "Perrin Gladwin",
        correctsEventId: await env.eventIdOf("burial_recorded", burialH1),
        reason: "Spelling",
        correctionRef: "LF-H1 note",
      },
    ]);
    const plan = planReviewKeys(env.state.review, sources(), { mint });
    expect(plan.issues.find((i) => i.rule === "placement_missing")?.factVersion).toBe(2);
    expect(plan.issues.find((i) => i.rule === "reading_unclear")?.factVersion).toBe(1);
  });

  it("does not raise any version for a change the committee does not depend on", async () => {
    await exportNow(church(env), churchReviewSupport, ON);
    await env.must([{ type: "set_public", siteName: "Lantern Fold", gateName: "Lantern Gate" }]);
    await env.must([{ type: "approve_burial", burialId: cid("burial:LF-07A"), includeYear: false }]);
    expect(planReviewKeys(env.state.review, sources(), { mint }).changed).toBe(false);
  });

  it("drops the placement check once the burial is placed in Y03, keeps its key stored and leaves one issue (hand totals 4.6)", async () => {
    const first = await exportNow(church(env), churchReviewSupport, ON);
    await env.must([{ type: "place_burial", burialId: burialH1, plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: cid("claim:LF-H1") }]);
    const second = await exportNow(church(env), churchReviewSupport, ON);
    expect(second.committed).toBe(false);
    expect(second.packet.issues.map((i) => i.rule)).toEqual(["reading_unclear"]);
    const placement = first.packet.issues.find((i) => i.rule === "placement_missing");
    expect(Object.values(env.state.review.subjects).some((s) => s.issues["placement_missing"]?.issueKey === placement?.issueKey)).toBe(true);
  });

  it("drops the reading check when the reading is settled", async () => {
    await env.must([{ type: "settle_reading", memorialId: memorial }]);
    expect(sources().map((s) => s.rule)).toEqual(["placement_missing"]);
  });

  it("names the open checks for a slip with the version the next export would give", async () => {
    const first = await exportNow(church(env), churchReviewSupport, ON);
    await env.must([saveReading({ reading: `${INSCRIPTION}AND HIS WIFE\n` })]);
    const open = openIssuesNow(env.state.review, sources());
    const reading = first.packet.issues.find((i) => i.rule === "reading_unclear");
    const placement = first.packet.issues.find((i) => i.rule === "placement_missing");
    expect(open.find((o) => o.issueKey === reading?.issueKey)?.factVersion).toBe(2);
    expect(open.find((o) => o.issueKey === placement?.issueKey)?.factVersion).toBe(1);
  });

  describe("private words and record routes", () => {
    it("lists every name, contact, source ref and line of a reading, and no word of two letters or fewer", () => {
      const words = churchReviewSupport.privateStrings(env.state);
      for (const secret of [APPROVED_NAME, OTHER_OCCUPANT, "Perrin Gladwyn", ...LIVING_HOLDERS, CONTACT, "LF-H1", "LF-07A", "LF-R1", "MIREL QUILLMOSS", `OF ${INSCRIPTION_WORD}`]) {
        expect(words, secret).toContain(secret);
      }
      expect(words.filter((w) => w.trim().length < 3)).toEqual([]);
      expect(new Set(words).size).toBe(words.length);
    });

    it("sends an unplaced burial to the unplaced list, and a placed one and a reading to the burial", async () => {
      expect(churchReviewSupport.link(env.state, { rule: "placement_missing", subjectId: burialH1 })).toBe("unplaced");
      expect(churchReviewSupport.link(env.state, { rule: "reading_unclear", subjectId: memorial })).toBe(`burial/${cid("burial:LF-07A")}`);
      await env.must([{ type: "place_burial", burialId: burialH1, plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: cid("claim:LF-H1") }]);
      expect(churchReviewSupport.link(env.state, { rule: "placement_missing", subjectId: burialH1 })).toBe(`burial/${burialH1}`);
    });

    it("gives no route for a subject it does not know", () => {
      expect(churchReviewSupport.link(env.state, { rule: "placement_missing", subjectId: "nope" })).toBeUndefined();
      expect(churchReviewSupport.link(env.state, { rule: "offer_late", subjectId: burialH1 })).toBeUndefined();
    });
  });
});

describe("Thimble Beds (hand totals 5.6, 6.3 and 6.4)", () => {
  let env: GardenEnv;
  const OFFER = (replyBy = "2026-04-18"): AllotCommand => ({
    type: "make_offer",
    offerId: gid("offer:b03"),
    applicationId: app("tavi"),
    spaceId: gid("space:B03:1"),
    claimId: claim("hold:b03"),
    replyBy,
  });
  const offerId = gid("offer:b03");
  const b02Charge = chargeId("B02:2025");

  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildThimble(env);
  });

  const sources = (asOf: string) => allotReviewSupport.sources(env.state, asOf);

  it("starts with the late fee on B02 alone, the same fact the app already raises", () => {
    expect(sources(ON).map((s) => [s.rule, s.subjectId])).toEqual([["fee_late", b02Charge]]);
    expect(sources(ON).map(({ fingerprint: _f, ...fact }) => fact)).toEqual(allotReviewFacts(env.state, ON));
    expect(sources("2025-06-30")).toEqual([]);
  });

  it("gives the late offer then the late fee in the late offer branch, two issues at the review date and one on the reply date", async () => {
    await env.must([OFFER()], "2026-04-04");
    expect(sources(ON).map((s) => s.rule)).toEqual(["offer_late", "fee_late"]);
    expect(sources("2026-04-18").map((s) => s.rule)).toEqual(["fee_late"]);
    expect(sources("2026-04-19").map((s) => s.rule)).toEqual(["offer_late", "fee_late"]);
  });

  it("writes a packet with the two issues, their actions, and no name, contact, amount or plot code (hand totals 6.3)", async () => {
    await env.must([OFFER()], "2026-04-04");
    const made = await exportNow(garden(env), allotReviewSupport, ON);
    expect(made.plan.issues.map((i) => [i.label, i.rule, i.factVersion])).toEqual([
      ["Record 1", "offer_late", 1],
      ["Record 2", "fee_late", 1],
    ]);
    expect(made.packet.issues.map((i) => i.action).sort()).toEqual(["check_payment", "check_reply"]);
    const canaries = [...GARDEN_CANARIES, "B02", "B03", "Thimble Beds", "3600", "3000", "1200", "2400"];
    // The keys are random hex, so a short code such as B02 or a number such as 3600 can occur inside one by chance.
    // The keys are not words, so they are taken out before the words are looked for.
    expect(scanForCanaries(made.text.replace(UUID_ANYWHERE, ""), canaries)).toEqual([]);
    expect(made.packet.siteKind).toBe("allotment");
  });

  it("follows hand totals 6.4 step by step: keys kept, a version raised once, three commits in all", async () => {
    await env.must([OFFER()], "2026-04-04");
    const garden_ = garden(env);
    const commits: boolean[] = [];
    const keyOf = (p: ReviewPacket, rule: string) => p.issues.find((i) => i.rule === rule);

    const a = await exportNow(garden_, allotReviewSupport, "2026-04-18");
    commits.push(a.committed);
    expect(a.packet.issues.map((i) => [i.rule, i.factVersion])).toEqual([["fee_late", 1]]);
    const feeKey = keyOf(a.packet, "fee_late")?.issueKey;

    const b = await exportNow(garden_, allotReviewSupport, "2026-04-18");
    commits.push(b.committed);
    expect(b.text).toBe(a.text);

    const c = await exportNow(garden_, allotReviewSupport, ON);
    commits.push(c.committed);
    expect(c.plan.issues.map((i) => [i.rule, i.label, i.factVersion])).toEqual([
      ["offer_late", "Record 2", 1],
      ["fee_late", "Record 1", 1],
    ]);
    expect(keyOf(c.packet, "fee_late")?.issueKey).toBe(feeKey);
    const offerKey = keyOf(c.packet, "offer_late")?.issueKey;

    const d = await exportNow(garden_, allotReviewSupport, "2026-04-18");
    commits.push(d.committed);
    expect(d.packet.issues.map((i) => i.rule)).toEqual(["fee_late"]);

    const e = await exportNow(garden_, allotReviewSupport, ON);
    commits.push(e.committed);
    expect(keyOf(e.packet, "offer_late")).toMatchObject({ issueKey: offerKey, factVersion: 1 });

    await env.must([{ type: "record_receipt", receiptId: gid("r:part"), chargeId: b02Charge, amount: 1000 }], "2026-04-21");
    const f = await exportNow(garden_, allotReviewSupport, "2026-04-22");
    commits.push(f.committed);
    expect(keyOf(f.packet, "fee_late")).toMatchObject({ issueKey: feeKey, factVersion: 2 });
    expect(keyOf(f.packet, "offer_late")).toMatchObject({ issueKey: offerKey, factVersion: 1 });

    await env.must([{ type: "record_receipt", receiptId: gid("r:rest"), chargeId: b02Charge, amount: 2000 }], "2026-04-23");
    const g = await exportNow(garden_, allotReviewSupport, "2026-04-24");
    commits.push(g.committed);
    expect(g.packet.issues.map((i) => i.rule)).toEqual(["offer_late"]);

    expect(commits).toEqual([true, false, true, false, false, true, false]);
    expect(commits.filter(Boolean)).toHaveLength(3);
    expect(Object.keys(env.state.review.subjects)).toHaveLength(2);
  });

  it("keeps the ledger through a reload", async () => {
    await env.must([OFFER()], "2026-04-04");
    await exportNow(garden(env), allotReviewSupport, ON);
    const reloaded = await env.reload();
    expect(reloaded.review).toEqual(env.state.review);
    expect(planReviewKeys(reloaded.review, allotReviewSupport.sources(reloaded, ON), { mint }).changed).toBe(false);
  });

  it("does not raise a version for a change the committee does not depend on", async () => {
    await env.must([OFFER()], "2026-04-04");
    await exportNow(garden(env), allotReviewSupport, ON);
    await env.must([{ type: "add_applicant", applicationId: app("wren"), personId: gid("person:Wren"), name: "Wren Thistledown", joinedOn: "2026-02-01" }], "2026-04-20");
    await env.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
    await env.must([{ type: "apply_charges", seasonId: SEASON_2026.seasonId, items: [{ chargeId: chargeId("B01:2026"), tenancyId: tenancy("B01") }] }], "2026-04-10");
    expect(planReviewKeys(env.state.review, sources(ON), { mint }).changed).toBe(false);
  });

  it("names the open checks with the version the next export would give", async () => {
    await env.must([OFFER()], "2026-04-04");
    const first = await exportNow(garden(env), allotReviewSupport, ON);
    await env.must([{ type: "record_receipt", receiptId: gid("r:part"), chargeId: b02Charge, amount: 1000 }], "2026-04-21");
    const open = openIssuesNow(env.state.review, sources("2026-04-22"));
    const fee = first.packet.issues.find((i) => i.rule === "fee_late");
    const late = first.packet.issues.find((i) => i.rule === "offer_late");
    expect(open.find((o) => o.issueKey === fee?.issueKey)?.factVersion).toBe(2);
    expect(open.find((o) => o.issueKey === late?.issueKey)?.factVersion).toBe(1);
  });

  describe("private words and record routes", () => {
    it("lists every applicant, holder, contact and reference, and no word of two letters or fewer", async () => {
      await env.must([{ type: "add_applicant", applicationId: app("wren"), personId: gid("person:Wren"), name: "Wren Thistledown", contact: "wren@example.invalid", joinedOn: "2026-02-01" }], "2026-04-20");
      await env.must([{ type: "record_receipt", receiptId: gid("r:ref"), chargeId: b02Charge, amount: 500, ref: RECEIPT_REF }], "2026-04-21");
      const words = allotReviewSupport.privateStrings(env.state);
      for (const secret of [...APPLICANTS, ...TENANTS, ...CONTACTS, "TB-T1", "TB-T2", "Wren Thistledown", "wren@example.invalid", RECEIPT_REF]) {
        expect(words, secret).toContain(secret);
      }
      expect(words).not.toContain(NEW_HOLDER);
      expect(words.filter((w) => w.trim().length < 3)).toEqual([]);
      expect(new Set(words).size).toBe(words.length);
    });

    it("sends a late offer to the offers and a late fee to the payments", () => {
      expect(allotReviewSupport.link(env.state, { rule: "offer_late", subjectId: offerId })).toBe("offer");
      expect(allotReviewSupport.link(env.state, { rule: "fee_late", subjectId: b02Charge })).toBe("payments");
    });

    it("gives no route for a rule it does not own", () => {
      expect(allotReviewSupport.link(env.state, { rule: "placement_missing", subjectId: b02Charge })).toBeUndefined();
    });
  });
});

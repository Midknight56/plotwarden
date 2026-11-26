// T24: the steps behind the Exchange screen (spec 05, X4, X5, X6). Planning an export checks every typed
// word, commits nothing, and builds the exact packet. Reading a slip works out the open checks as at today
// and changes nothing. Expected values come from hand-totals.md sections 6.2 and 6.5.
import { beforeEach, describe, expect, it } from "vitest";
import { applyBase, emptyBase } from "../../template/src/base";
import type { BaseState } from "../../template/src/base";
import { buildSlip, encodeSlip } from "../../template/src/exchange/slip";
import type { SlipInput } from "../../template/src/exchange/slip";
import { scanForCanaries } from "../../template/src/output/privacy";
import { COPY } from "../../template/src/ui/copy";
import { checksAt, fileHolds, planExchange, readSlipFor } from "../../template/src/ui/exchangeFlow";
import type { ExchangeAdapter, ExchangePlan, PlanInput } from "../../template/src/ui/exchangeFlow";
import { allotAdapter } from "../../apps/allotment-register/src/adapter";
import { churchAdapter } from "../../apps/churchyard-register/src/adapter";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { GardenEnv, id as gid } from "../helpers/gardenEnv";
import { ChurchEnv, id as cid, plotId, spaceId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";
import { APPROVED_NAME, INSCRIPTION_WORD, OTHER_OCCUPANT } from "../helpers/privacyCanaries";
import { SITE_ID } from "../helpers/site";
import { app, buildThimble, chargeId, claim } from "../helpers/thimbleBeds";

const ON = "2026-04-20";
const mint = (): string => globalThis.crypto.randomUUID();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));

describe("planning an export from Lantern Fold", () => {
  let env: ChurchEnv;
  const burialH1 = cid("burial:LF-H1");
  const memorial = cid("memorial:Y07");
  const saveReading = (reading: string): ChurchCommand => ({
    type: "save_reading",
    memorialId: memorial,
    burialId: cid("burial:LF-07A"),
    reading,
    unclear: true,
  });

  beforeEach(async () => {
    env = await ChurchEnv.create();
    await buildFold(env, { geometry: true });
    await env.must([saveReading(`IN LOVING MEMORY\nOF ${INSCRIPTION_WORD}\n`)]);
  });

  const plan = (over: Partial<PlanInput> = {}) =>
    planExchange({ site: env.site, state: env.state, revision: env.revision, adapter: churchAdapter as unknown as ExchangeAdapter, asOf: ON, alias: "Site 1", labels: {}, mint, ...over });
  const must = (over: Partial<PlanInput> = {}): ExchangePlan => {
    const got = plan(over);
    if (!got.ok) throw new Error(`refused: ${JSON.stringify(got)}`);
    return got.plan;
  };

  it("plans the two checks with a prepare_review command and a packet one revision on (hand totals 6.2)", () => {
    const made = must();
    expect(made.basedOn).toBe(env.revision);
    expect(made.packetRevision).toBe(env.revision + 1);
    expect(made.packet.revision).toBe(env.revision + 1);
    expect(made.command?.type).toBe("prepare_review");
    expect(made.command?.subjects.map((s) => s.subjectId).sort()).toEqual([burialH1, memorial].sort());
    expect(made.packet.siteKind).toBe("churchyard");
    expect(made.packet.siteKey).toBe(env.site.siteKey);
    expect(made.packet.lineageId).toBe(env.site.lineageId);
    expect(made.packet.siteAlias).toBe("Site 1");
    expect(made.preview.count).toBe(2);
    expect(made.preview.rows.map((r) => r.label).sort()).toEqual(["Record 1", "Record 2"]);
    expect(made.issues.map((i) => i.subjectId)).toEqual([burialH1, memorial]);
    expect(made.opId).toMatch(UUID);
    expect(made.text).toContain('"format":"plot.review.v1"');
  });

  it("commits nothing and changes nothing it is given", async () => {
    const before = JSON.stringify(env.state);
    const revision = env.revision;
    const events = (await env.events()).length;
    must();
    expect(JSON.stringify(env.state)).toBe(before);
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
  });

  it("has no command and the same revision once the ledger holds everything, and the same text", async () => {
    const first = must();
    await env.must([first.command as never as ChurchCommand]);
    const again = must();
    expect(again.command).toBeUndefined();
    expect(again.packetRevision).toBe(env.revision);
    expect(again.packet.revision).toBe(env.revision);
    expect(again.text).toBe(must().text);
    expect(again.packet.issues.map((i) => i.issueKey).sort()).toEqual(first.packet.issues.map((i) => i.issueKey).sort());
  });

  it("trims the typed site name and stores it only when it differs from the stored one", async () => {
    const named = must({ alias: "  Lower churchyard  " });
    expect(named.packet.siteAlias).toBe("Lower churchyard");
    expect(named.command?.alias).toBe("Lower churchyard");
    await env.must([named.command as never as ChurchCommand]);
    const again = must({ alias: "Lower churchyard" });
    expect(again.command).toBeUndefined();
    const other = must({ alias: "Upper churchyard" });
    expect(other.command?.alias).toBe("Upper churchyard");
    expect(other.command?.subjects).toEqual([]);
  });

  it("uses a typed label for a subject, and keeps the default when the typed label is empty", () => {
    const made = must({ labels: { [burialH1]: "Bed by the yew", [memorial]: "" } });
    expect(made.issues.find((i) => i.subjectId === burialH1)?.label).toBe("Bed by the yew");
    expect(made.issues.find((i) => i.subjectId === memorial)?.label).toBe("Record 2");
    expect(made.packet.issues.map((i) => i.label).sort()).toEqual(["Bed by the yew", "Record 2"]);
  });

  describe("refusing what a committee file must not hold (X3.4)", () => {
    const fields = (over: Partial<PlanInput>) => {
      const got = plan(over);
      return got.ok ? [] : got.code === "invalid" ? got.fields : [{ field: got.code, code: got.code }];
    };

    it("refuses the private site title and a person's name as the site name, naming the field", () => {
      expect(fields({ alias: "Lantern Fold" })).toEqual([{ field: "alias", code: "private_string" }]);
      expect(fields({ alias: `${APPROVED_NAME} churchyard` })).toEqual([{ field: "alias", code: "private_string" }]);
    });

    it("refuses an empty site name and one over 40 characters", () => {
      expect(fields({ alias: "   " })).toEqual([{ field: "alias", code: "required" }]);
      expect(fields({ alias: "x".repeat(41) })).toEqual([{ field: "alias", code: "over_limit" }]);
      expect(plan({ alias: "x".repeat(40) }).ok).toBe(true);
    });

    it("refuses a label that holds a name, a source ref, a line of the inscription, an amount or a contact", () => {
      const label = (text: string) => fields({ labels: { [burialH1]: text } });
      expect(label(OTHER_OCCUPANT)).toEqual([{ field: `label:${burialH1}`, code: "private_string" }]);
      expect(label("Perrin Gladwyn plot")).toEqual([{ field: `label:${burialH1}`, code: "private_string" }]);
      expect(label("LF-H1")).toEqual([{ field: `label:${burialH1}`, code: "private_string" }]);
      expect(label(`OF ${INSCRIPTION_WORD}`)).toEqual([{ field: `label:${burialH1}`, code: "private_string" }]);
      expect(label("£5 owed")).toEqual([{ field: `label:${burialH1}`, code: "looks_like_amount" }]);
      expect(label("a@b.example")).toEqual([{ field: `label:${burialH1}`, code: "looks_like_contact" }]);
      expect(label("x".repeat(41))).toEqual([{ field: `label:${burialH1}`, code: "over_limit" }]);
    });

    // Review finding 4 (R16.2, R16.3): one word of a name, or of the private site title, is private too.
    it("refuses a label or a site name that holds one word of a person's name or of the site title", () => {
      const label = (text: string) => fields({ labels: { [burialH1]: text } });
      const bad = [{ field: `label:${burialH1}`, code: "private_string" }];
      expect(label("Gladwyn grave")).toEqual(bad);
      expect(label("by Perrin")).toEqual(bad);
      expect(label("Odalys bed")).toEqual(bad);
      expect(label("Quillmoss")).toEqual(bad);
      expect(fields({ alias: "Lantern churchyard" })).toEqual([{ field: "alias", code: "private_string" }]);
    });

    it("still accepts neutral words that no name holds", () => {
      expect(fields({ alias: "Lower churchyard", labels: { [burialH1]: "Bed by the yew", [memorial]: "Stone near the path" } })).toEqual([]);
    });

    it("reports every bad field at once, in the order alias then labels", () => {
      const got = fields({ alias: "Lantern Fold", labels: { [burialH1]: "£5", [memorial]: "Mirel Quillmoss" } });
      expect(got.map((f) => f.field)).toEqual(["alias", `label:${burialH1}`, `label:${memorial}`]);
    });

    it("ignores a label typed for a subject that has no check", () => {
      expect(plan({ labels: { [cid("burial:LF-01")]: "Mirel Quillmoss" } }).ok).toBe(true);
    });

    it("refuses a date that is not a date", () => {
      expect(fields({ asOf: "2026-02-30" })).toEqual([{ field: "asOf", code: "invalid_date" }]);
    });
  });

  it("holds none of the canaries in the file text", () => {
    const made = must({ alias: "Lower churchyard", labels: { [burialH1]: "Near the gate" } });
    const canaries = [APPROVED_NAME, OTHER_OCCUPANT, "Perrin Gladwyn", "Odalys Fennimore", "Wren Ashgrove", INSCRIPTION_WORD, "LF-H1", "Lantern Fold", "Y03"];
    expect(scanForCanaries(made.text, canaries)).toEqual([]);
  });

  describe("a register with no checks", () => {
    it("plans an empty packet at the same revision once every check is closed", async () => {
      await env.must([{ type: "place_burial", burialId: burialH1, plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: cid("claim:LF-H1") }]);
      await env.must([{ type: "settle_reading", memorialId: memorial }]);
      const made = must();
      expect(made.packet.issues).toEqual([]);
      expect(made.preview.count).toBe(0);
      expect(made.command).toBeUndefined();
      expect(made.packetRevision).toBe(env.revision);
    });

    it("refuses a register with no revision yet, with its own code", () => {
      const empty = churchAdapter.initialState(env.site);
      const got = planExchange({ site: env.site, state: empty, revision: 0, adapter: churchAdapter as unknown as ExchangeAdapter, asOf: ON, alias: "Site 1", labels: {}, mint });
      expect(got).toEqual({ ok: false, code: "empty_register" });
    });

    it("refuses it even when a different site name is typed, because nothing has been recorded", () => {
      const empty = churchAdapter.initialState(env.site);
      const got = planExchange({ site: env.site, state: empty, revision: 0, adapter: churchAdapter as unknown as ExchangeAdapter, asOf: ON, alias: "Lower churchyard", labels: {}, mint });
      expect(got).toEqual({ ok: false, code: "empty_register" });
    });
  });

  it("works for an adapter with no review support, with a check that never raises its version", () => {
    const shim: ExchangeAdapter = { reviewFacts: () => [{ rule: "fee_late", subjectId: "some-fee", label: "Record 1" }] };
    const state: BaseState = emptyBase(SITE_ID);
    const first = planExchange({ site: env.site, state, revision: 3, adapter: shim, asOf: ON, alias: "Site 1", labels: {}, mint });
    expect(first.ok && first.plan.packet.issues.map((i) => i.rule)).toEqual(["fee_late"]);
    expect(first.ok && first.plan.command?.subjects[0]?.issues[0]?.fingerprint).toBe("");
  });
});

describe("reading a return slip in Lantern Fold (hand totals 6.5)", () => {
  let env: ChurchEnv;
  const burialH1 = cid("burial:LF-H1");
  const memorial = cid("memorial:Y07");
  const saveReading = (reading: string): ChurchCommand => ({ type: "save_reading", memorialId: memorial, burialId: cid("burial:LF-07A"), reading, unclear: true });
  const adapter = churchAdapter as unknown as ExchangeAdapter;
  let placementKey: string;
  let readingKey: string;
  const A = (n: number) => `ac700000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

  beforeEach(async () => {
    env = await ChurchEnv.create();
    await buildFold(env, { geometry: true });
    await env.must([saveReading("IN LOVING MEMORY\n")]);
    const made = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter, asOf: ON, alias: "Site 1", labels: {}, mint });
    if (!made.ok || made.plan.command === undefined) throw new Error("no plan");
    await env.must([made.plan.command as never as ChurchCommand]);
    placementKey = made.plan.issues.find((i) => i.rule === "placement_missing")?.issueKey as string;
    readingKey = made.plan.issues.find((i) => i.rule === "reading_unclear")?.issueKey as string;
  });

  const slipBytes = (decisions: SlipInput["decisions"], over: Partial<SlipInput> = {}): Uint8Array => {
    const built = buildSlip({ siteKey: env.site.siteKey, lineageId: env.site.lineageId, packetRevision: env.revision, packetAsOf: ON, decisions, ...over });
    if (!built.ok) throw new Error(JSON.stringify(built.fields));
    const text = encodeSlip(built.slip);
    return bytes(text.ok ? text.text : "");
  };
  const decision = (n: number, issueKey: string, over: Partial<SlipInput["decisions"][number]> = {}) => ({
    actionId: A(n),
    issueKey,
    factVersion: 1,
    disposition: "checked" as const,
    reviewedOn: "2026-04-21",
    ...over,
  });
  const read = (data: Uint8Array) => readSlipFor({ bytes: data, site: env.site, state: env.state, adapter, today: ON });

  it("reads two current decisions as ready, with their labels, rules and record routes", () => {
    const got = read(slipBytes([decision(1, placementKey), decision(2, readingKey, { disposition: "needs_keeper" })]));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.rows.map((r) => r.status)).toEqual(["ready", "ready"]);
      expect(got.counts).toEqual({ ready: 2, changed: 0, closed: 0, received: 0 });
      expect(got.rows.map((r) => [r.label, r.rule, r.link])).toEqual([
        ["Record 1", "placement_missing", "unplaced"],
        ["Record 2", "reading_unclear", `burial/${cid("burial:LF-07A")}`],
      ]);
      expect(got.receipt?.type).toBe("receive_review");
      expect(got.receipt?.decisions.map((d) => [d.actionId, d.disposition])).toEqual([[A(1), "checked"], [A(2), "needs_keeper"]]);
    }
  });

  it("reads the same kept bytes again after the reading is reviewed: ready first, then closed, with no receipt for it (X14.4)", async () => {
    const data = slipBytes([decision(1, placementKey), decision(2, readingKey)]);
    const before = read(data);
    expect(before.ok && before.rows.map((r) => r.status)).toEqual(["ready", "ready"]);
    expect(before.ok && before.receipt?.decisions.map((d) => d.actionId)).toEqual([A(1), A(2)]);

    await env.must([{ type: "settle_reading", memorialId: memorial }]);
    const after = read(data);
    expect(after.ok && after.rows.map((r) => r.status)).toEqual(["ready", "closed"]);
    expect(after.ok && after.counts).toEqual({ ready: 1, changed: 0, closed: 1, received: 0 });
    if (after.ok) {
      expect(after.receipt?.decisions.map((d) => d.actionId)).toEqual([A(1)]);
      expect(after.rows[1]?.label).toBe("Record 2");
    }
  });

  it("reads and writes nothing: the same state, the same revision, the same events (X5.6)", async () => {
    const state = JSON.stringify(env.state);
    const revision = env.revision;
    const events = (await env.events()).length;
    const data = slipBytes([decision(1, placementKey)]);
    const first = read(data);
    const second = read(data);
    expect(second).toEqual(first);
    expect(JSON.stringify(env.state)).toBe(state);
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
  });

  it("reads received after the receipts are stored, and offers no receipt then", async () => {
    const data = slipBytes([decision(1, placementKey), decision(2, readingKey)]);
    const first = read(data);
    if (!first.ok || first.receipt === undefined) throw new Error("not ready");
    await env.must([first.receipt as never as ChurchCommand]);
    const after = read(data);
    expect(after.ok && after.rows.map((r) => r.status)).toEqual(["received", "received"]);
    expect(after.ok && after.counts).toEqual({ ready: 0, changed: 0, closed: 0, received: 2 });
    expect(after.ok && after.receipt).toBeUndefined();
  });

  it("reads a reading whose words changed as changed, and the placement as still ready", async () => {
    const data = slipBytes([decision(3, placementKey), decision(4, readingKey)]);
    await env.must([saveReading("IN LOVING MEMORY\nAND HIS WIFE\n")]);
    const got = read(data);
    expect(got.ok && got.rows.map((r) => r.status)).toEqual(["ready", "changed"]);
    expect(got.ok && got.counts).toEqual({ ready: 1, changed: 1, closed: 0, received: 0 });
    if (got.ok) expect(got.receipt?.decisions.map((d) => d.actionId)).toEqual([A(3)]);
  });

  it("reads a placement as closed once the burial is placed, keeps its record route, and then offers no receipt for it", async () => {
    const data = slipBytes([decision(3, placementKey), decision(4, readingKey)]);
    await env.must([saveReading("IN LOVING MEMORY\nAND HIS WIFE\n")]);
    await env.must([{ type: "place_burial", burialId: burialH1, plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: cid("claim:LF-H1") }]);
    const got = read(data);
    expect(got.ok && got.rows.map((r) => r.status)).toEqual(["closed", "changed"]);
    expect(got.ok && got.counts).toEqual({ ready: 0, changed: 1, closed: 1, received: 0 });
    if (got.ok) {
      expect(got.rows[0]?.link).toBe(`burial/${burialH1}`);
      expect(got.receipt).toBeUndefined();
    }
  });

  it("reads a decision for an issue key the register never made as closed, with no label and no route", () => {
    const got = read(slipBytes([decision(5, "0badc0de-0000-4000-8000-0000000000ff")]));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.rows[0]?.status).toBe("closed");
      expect(got.rows[0]?.label).toBeUndefined();
      expect(got.rows[0]?.link).toBeUndefined();
    }
  });

  it("refuses a slip for another site key, with no rows and no receipt", () => {
    const got = read(slipBytes([decision(1, placementKey)], { siteKey: "5a5a5a5a-0000-4000-8000-0000000000aa" }));
    expect(got).toEqual({ ok: false, code: "other_register" });
  });

  it("refuses a slip for another lineage", () => {
    expect(read(slipBytes([decision(1, placementKey)], { lineageId: "11e11e11-0000-4000-8000-0000000000aa" }))).toEqual({ ok: false, code: "other_register" });
  });

  it("says what a file is when it is not a slip", () => {
    const made = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter, asOf: ON, alias: "Site 1", labels: {}, mint });
    expect(read(bytes(made.ok ? made.plan.text : ""))).toEqual({ ok: false, code: "not_slip", found: "review" });
    expect(read(new Uint8Array([0x50, 0x4b, 3, 4]))).toEqual({ ok: false, code: "wrong_file", found: "backup" });
    expect(read(bytes({ format: "plot.family.v1" }))).toEqual({ ok: false, code: "wrong_file", found: "visitor" });
    expect(read(bytes("hello"))).toEqual({ ok: false, code: "not_json" });
    expect(read(bytes({ format: "plot.slip.v2" }))).toEqual({ ok: false, code: "newer_version" });
    expect(read(bytes({ format: "nope" }))).toEqual({ ok: false, code: "unknown_format" });
    expect(read(bytes({ format: "plot.slip.v1", note: "x" }))).toEqual({ ok: false, code: "invalid" });
  });

  it("keeps the slip it read, for the screen to show its dates", () => {
    const got = read(slipBytes([decision(1, placementKey)]));
    expect(got.ok && got.slip.decisions[0]?.reviewedOn).toBe("2026-04-21");
    expect(got.ok && got.slip.packetAsOf).toBe(ON);
  });
});

describe("reading a return slip in Thimble Beds", () => {
  it("gives the offers and payments routes and the version after a part payment", async () => {
    const env = await GardenEnv.create();
    await buildThimble(env);
    await env.must([{ type: "make_offer", offerId: gid("offer:b03"), applicationId: app("tavi"), spaceId: gid("space:B03:1"), claimId: claim("hold:b03"), replyBy: "2026-04-18" } as AllotCommand], "2026-04-04");
    const adapter = allotAdapter as unknown as ExchangeAdapter;
    const made = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter, asOf: ON, alias: "Site 2", labels: {}, mint });
    if (!made.ok || made.plan.command === undefined) throw new Error("no plan");
    await env.must([made.plan.command as never as AllotCommand]);
    const offerKey = made.plan.issues.find((i) => i.rule === "offer_late")?.issueKey as string;
    const feeKey = made.plan.issues.find((i) => i.rule === "fee_late")?.issueKey as string;
    const built = buildSlip({
      siteKey: env.site.siteKey,
      lineageId: env.site.lineageId,
      packetRevision: env.revision,
      packetAsOf: ON,
      decisions: [
        { actionId: "ac700000-0000-4000-8000-000000000001", issueKey: offerKey, factVersion: 1, disposition: "checked", reviewedOn: "2026-04-21" },
        { actionId: "ac700000-0000-4000-8000-000000000002", issueKey: feeKey, factVersion: 1, disposition: "needs_keeper", reviewedOn: "2026-04-21" },
      ],
    });
    if (!built.ok) throw new Error("slip");
    const data = bytes(encodeSlip(built.slip).ok ? JSON.stringify(built.slip) : "");
    const first = readSlipFor({ bytes: data, site: env.site, state: env.state, adapter, today: ON });
    expect(first.ok && first.rows.map((r) => [r.status, r.link])).toEqual([["ready", "offer"], ["ready", `payments/${chargeId("B02:2025")}`]]);
    await env.must([{ type: "record_receipt", receiptId: gid("r:part"), chargeId: chargeId("B02:2025"), amount: 1000 }], ON);
    const second = readSlipFor({ bytes: data, site: env.site, state: env.state, adapter, today: ON });
    expect(second.ok && second.rows.map((r) => r.status)).toEqual(["ready", "changed"]);
    const canaries = ["Tavi Bramblequill", "Ada Stonecrop", "36.00", "30.00"];
    expect(scanForCanaries(JSON.stringify(second.ok ? second.rows : []), canaries)).toEqual([]);
  });

  it("reads the open checks as at the later of today and the date of the review file (X5.5)", async () => {
    const env = await GardenEnv.create();
    await buildThimble(env);
    await env.must([{ type: "make_offer", offerId: gid("offer:b03"), applicationId: app("tavi"), spaceId: gid("space:B03:1"), claimId: claim("hold:b03"), replyBy: "2026-04-20" } as AllotCommand], "2026-04-20");
    const adapter = allotAdapter as unknown as ExchangeAdapter;
    // The review file was made for 2026-04-21, when the offer is late. Today in the register is still 2026-04-20.
    const made = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter, asOf: "2026-04-21", alias: "Site 2", labels: {}, mint });
    if (!made.ok || made.plan.command === undefined) throw new Error("no plan");
    await env.must([made.plan.command as never as AllotCommand]);
    const offerKey = made.plan.issues.find((i) => i.rule === "offer_late")?.issueKey as string;
    const slipFor = (packetAsOf: string) => {
      const built = buildSlip({
        siteKey: env.site.siteKey,
        lineageId: env.site.lineageId,
        packetRevision: env.revision,
        packetAsOf,
        decisions: [{ actionId: "ac700000-0000-4000-8000-000000000001", issueKey: offerKey, factVersion: 1, disposition: "checked", reviewedOn: "2026-04-22" }],
      });
      if (!built.ok) throw new Error("slip");
      return bytes(JSON.stringify(built.slip));
    };
    const early = readSlipFor({ bytes: slipFor("2026-04-21"), site: env.site, state: env.state, adapter, today: "2026-04-20" });
    expect(early.ok && early.rows.map((r) => r.status)).toEqual(["ready"]);
    // A slip that says it was made for an earlier date does not make the offer late, so it reads as closed.
    const earlier = readSlipFor({ bytes: slipFor("2026-04-20"), site: env.site, state: env.state, adapter, today: "2026-04-20" });
    expect(earlier.ok && earlier.rows.map((r) => r.status)).toEqual(["closed"]);
    // Today after the review date is read as today.
    const later = readSlipFor({ bytes: slipFor("2026-04-21"), site: env.site, state: env.state, adapter, today: "2026-05-01" });
    expect(later.ok && later.rows.map((r) => r.status)).toEqual(["ready"]);
  });
});

describe("labels in Thimble Beds hold no word of a person's name (R16.2, review finding 4)", () => {
  it("refuses one word of a holder or applicant name, and a single word name", async () => {
    const env = await GardenEnv.create();
    await buildThimble(env);
    await env.must([{ type: "add_applicant", applicationId: app("thorne"), personId: gid("person:Thorne"), name: "Thorne", joinedOn: "2026-02-01" } as AllotCommand], "2026-02-01");
    await env.must([{ type: "make_offer", offerId: gid("offer:b03"), applicationId: app("tavi"), spaceId: gid("space:B03:1"), claimId: claim("hold:b03"), replyBy: "2026-04-18" } as AllotCommand], "2026-04-04");
    const adapter = allotAdapter as unknown as ExchangeAdapter;
    const offer = gid("offer:b03");
    const result = (text: string, alias = "Site 2") => {
      const got = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter, asOf: ON, alias, labels: { [offer]: text }, mint });
      return got.ok ? [] : got.code === "invalid" ? got.fields : [{ field: got.code, code: got.code }];
    };
    const bad = [{ field: `label:${offer}`, code: "private_string" }];
    expect(result("Bramblequill bed")).toEqual(bad);
    expect(result("Stonecrop plot")).toEqual(bad);
    expect(result("Thorne bed")).toEqual(bad);
    expect(result("Marlo")).toEqual(bad);
    expect(result("Row by the hut", "Thimble gardens")).toEqual([{ field: "alias", code: "private_string" }]);
    expect(result("Bed by the hut")).toEqual([]);
  });
});

describe("the checks the screen lists (X4.1)", () => {
  let env: ChurchEnv;
  const adapter = churchAdapter as unknown as ExchangeAdapter;
  beforeEach(async () => {
    env = await ChurchEnv.create();
    await buildFold(env, { geometry: true });
    await env.must([{ type: "save_reading", memorialId: cid("memorial:Y07"), burialId: cid("burial:LF-07A"), reading: "IN LOVING MEMORY\n", unclear: true }]);
  });

  it("lists one row for each subject with its default label, in source order, and names its rules", () => {
    expect(checksAt(adapter, env.state, ON)).toEqual([
      { subjectId: cid("burial:LF-H1"), label: "Record 1", rules: ["placement_missing"] },
      { subjectId: cid("memorial:Y07"), label: "Record 2", rules: ["reading_unclear"] },
    ]);
  });

  it("lists one row for a subject with two rules, and none for a date that is not a date", () => {
    const shim: ExchangeAdapter = {
      reviewFacts: () => [
        { rule: "offer_late", subjectId: "same", label: "Record 1" },
        { rule: "fee_late", subjectId: "same", label: "Record 1" },
      ],
    };
    expect(checksAt(shim, env.state, ON)).toEqual([{ subjectId: "same", label: "Record 1", rules: ["offer_late", "fee_late"] }]);
    expect(checksAt(adapter, env.state, "2026-02-30")).toEqual([]);
  });

  it("gives the stored label once the ledger holds it, and changes nothing it is given", async () => {
    const made = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter, asOf: ON, alias: "Site 1", labels: { [cid("burial:LF-H1")]: "Bed by the yew" }, mint });
    if (!made.ok || made.plan.command === undefined) throw new Error("no plan");
    await env.must([made.plan.command as never as ChurchCommand]);
    const before = JSON.stringify(env.state);
    expect(checksAt(adapter, env.state, ON).map((c) => c.label)).toEqual(["Bed by the yew", "Record 2"]);
    expect(JSON.stringify(env.state)).toBe(before);
  });
});

describe("the state it reads", () => {
  it("is the base state the shell gives it", () => {
    const state: BaseState = applyBase(emptyBase(SITE_ID), { type: "north_set", degrees: 10 } as never) as BaseState;
    expect(state.review).toEqual({ subjects: {}, received: {} });
  });
});

describe("the preview says in plain words what the file holds (X13)", () => {
  const words = (keys: string[]): string[] => keys.map((key) => COPY[key] ?? `missing ${key}`);

  it("gives one plain line for each kind of field of a real preview, in a fixed order", async () => {
    const env = await ChurchEnv.create();
    await buildFold(env, { geometry: true });
    const made = planExchange({ site: env.site, state: env.state, revision: env.revision, adapter: churchAdapter as unknown as ExchangeAdapter, asOf: ON, alias: "Site 1", labels: {}, mint });
    if (!made.ok) throw new Error("no plan");
    expect(words(fileHolds(made.plan.preview))).toEqual([
      "The site name you typed",
      "The review date",
      "The file format, the kind of register and its revision number",
      "Random keys and a version number. They hold no name and let your slip find its record.",
      "For each check: your label, the reason and what to do",
    ]);
  });

  it("covers every field of the file, so no field is left without a line of its own", () => {
    const fields = {
      siteFields: ["format", "siteKind", "siteKey", "lineageId", "siteAlias", "revision", "asOf", "issues"],
      issueFields: ["issueKey", "subjectKey", "label", "rule", "factVersion", "action"],
    };
    expect(fileHolds(fields)).not.toContain("holdsMore");
    // Each field alone brings its own line.
    for (const field of [...fields.siteFields, ...fields.issueFields]) {
      const alone = fileHolds({ siteFields: [field], issueFields: [] });
      expect(alone.length, field).toBe(1);
      expect(alone, field).not.toContain("holdsMore");
    }
  });

  it("adds More fields. when a field has no line of its own, so the list cannot hide one", () => {
    const got = fileHolds({ siteFields: ["siteAlias", "somethingNew"], issueFields: ["label"] });
    expect(words(got)).toEqual(["The site name you typed", "For each check: your label, the reason and what to do", "More fields. Choose Show field names to see them."]);
  });

  it("holds the same lines for the same fields in any order, and each line once", () => {
    const a = fileHolds({ siteFields: ["asOf", "siteAlias", "issues"], issueFields: ["action", "label"] });
    const b = fileHolds({ siteFields: ["issues", "siteAlias", "asOf"], issueFields: ["label", "action"] });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("says nothing for a file with no field", () => {
    expect(fileHolds({ siteFields: [], issueFields: [] })).toEqual([]);
  });
});

// Property sets for the garden rules (spec 04, task 4.13). Each set runs at least 1,000 generated cases from a
// recorded seed. Each set also shows that it catches a deliberate defect: a state made by hand that breaks the rule.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { spaceStateAt } from "../../template/src/status";
import { allotRegister } from "../../apps/allotment-register/src/adapter";
import { chargeSummary, tenancyBalance } from "../../apps/allotment-register/src/fees";
import { buildAvailabilityFile } from "../../apps/allotment-register/src/projection";
import { emptyAllot, queueView, tenanciesCovering } from "../../apps/allotment-register/src/rules";
import type { AllotCommand, AllotState } from "../../apps/allotment-register/src/types";
import { runProperty } from "../helpers/property";
import { RUNS, SEEDS } from "./seeds";

const register = allotRegister();

function step(state: AllotState, command: AllotCommand, on: string): AllotState | undefined {
  const decided = register.run(state, command, on);
  if (!decided.ok) return undefined;
  return decided.value.reduce((s, d) => register.adapter.apply(s, d.event), state);
}

function must(state: AllotState, command: AllotCommand, on: string): AllotState {
  const next = step(state, command, on);
  if (next === undefined) throw new Error(`refused ${command.type} in the set up`);
  return next;
}

const day = (offset: number): string => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

function garden(plots: number, geometry = false): AllotState {
  let state = emptyAllot("site-prop", "GBP");
  const box = (i: number): [number, number][] => [[1000 + i * 900, 1000], [1800 + i * 900, 1000], [1800 + i * 900, 1800], [1000 + i * 900, 1800]];
  state = must(
    state,
    {
      type: "layout_apply",
      sections: [{ sectionId: "sec", name: "Row" }],
      plots: Array.from({ length: plots }, (_, i) => ({ plotId: `pl${i}`, code: `P${i + 1}`, sectionId: "sec", spaces: [{ spaceId: `sp${i}` }], ...(geometry ? { footprint: box(i) } : {}) })),
      ...(geometry ? { gate: { name: "Gate", at: [500, 500] as [number, number] }, paths: [{ pathId: "path", name: "Walk", points: [[600, 600], [9000, 600]] as [number, number][] }] } : {}),
    },
    "2026-01-01",
  );
  return must(state, { type: "confirm_empty", spaceIds: Array.from({ length: plots }, (_, i) => `sp${i}`) }, "2026-01-01");
}

describe("INV_ONE_TENURE: at any date a plot has at most one tenancy (A3.2)", () => {
  type Op = { op: "record"; plot: number; person: number; start: number; end?: number } | { op: "end"; at: number; on: number } | { op: "hand"; at: number; on: number; person: number };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.integer({ min: 0, max: 30 }).chain((start) =>
      fc.record({
        op: fc.constant("record" as const),
        plot: fc.integer({ min: 0, max: 1 }),
        person: fc.integer({ min: 0, max: 3 }),
        start: fc.constant(start),
        end: fc.option(fc.integer({ min: start + 1, max: 50 }), { nil: undefined }),
      }),
    ),
    fc.record({ op: fc.constant("end" as const), at: fc.integer({ min: 0, max: 6 }), on: fc.integer({ min: 0, max: 50 }) }),
    fc.record({ op: fc.constant("hand" as const), at: fc.integer({ min: 0, max: 6 }), on: fc.integer({ min: 0, max: 50 }), person: fc.integer({ min: 0, max: 3 }) }),
  );

  /** Every violation of the rule in a state: two tenancies on one day, or a state that does not match the tenancies. */
  function violations(state: AllotState): string[] {
    const out: string[] = [];
    for (const plot of Object.values(state.core.plots)) {
      for (let d = 0; d <= 70; d++) {
        const covering = tenanciesCovering(state, plot.plotId, day(d));
        if (covering.length > 1) out.push(`${plot.code} has ${covering.length} tenancies on ${day(d)}`);
        const taken = spaceStateAt(state.core, plot.spaces[0]?.spaceId as string, day(d))?.state === "taken";
        if (taken !== (covering.length === 1)) out.push(`${plot.code} on ${day(d)}: taken ${taken}, covered ${covering.length}`);
      }
    }
    return out;
  }

  it(`holds for ${RUNS} generated runs of commands, whatever the register refuses`, () => {
    const { cases } = runProperty(
      "INV_ONE_TENURE",
      fc.array(opArb, { maxLength: 14 }),
      (ops) => {
        let state = garden(2);
        let made = 0;
        for (const [n, op] of ops.entries()) {
          let next: AllotState | undefined;
          if (op.op === "record") {
            next = step(state, { type: "record_tenancy", tenancyId: `t${made}`, claimId: `c${made}`, personId: `p${op.person}`, holderName: `Holder ${op.person}`, spaceId: `sp${op.plot}`, start: day(op.start), ...(op.end === undefined ? {} : { endExclusive: day(op.end) }) }, day(op.start));
            if (next !== undefined) made += 1;
          } else if (op.op === "end") {
            next = step(state, { type: "end_tenancy", tenancyId: `t${op.at}` }, day(op.on));
          } else {
            next = step(state, { type: "hand_over", tenancyId: `t${op.at}`, newTenancyId: `h${n}`, claimId: `hc${n}`, personId: `p${op.person}`, holderName: `Holder ${op.person}` }, day(op.on));
          }
          if (next !== undefined) state = next;
          expect(violations(state)).toEqual([]);
        }
      },
      { seed: SEEDS.INV_ONE_TENURE },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("catches a state with two tenancies on one day", () => {
    let state = garden(1);
    state = must(state, { type: "record_tenancy", tenancyId: "a", claimId: "ca", personId: "p0", holderName: "A", spaceId: "sp0", start: day(0) }, day(0));
    const bad = { ...state, tenancies: { ...state.tenancies, b: { ...(state.tenancies["a"] as NonNullable<(typeof state.tenancies)["a"]>), tenancyId: "b", personId: "p1" } } };
    expect(violations(bad).length).toBeGreaterThan(0);
  });
});

describe("INV_SEQ_FIXED and INV_QUEUE_ORDER: a sequence never changes and the order is the total order (A1)", () => {
  type Op = { op: "add"; date: number } | { op: "withdraw"; at: number } | { op: "correct"; at: number; date: number } | { op: "offer"; at: number } | { op: "decline"; at: number } | { op: "release"; at: number };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ op: fc.constant("add" as const), date: fc.integer({ min: 0, max: 4 }) }),
    fc.record({ op: fc.constant("withdraw" as const), at: fc.integer({ min: 0, max: 5 }) }),
    fc.record({ op: fc.constant("correct" as const), at: fc.integer({ min: 0, max: 5 }), date: fc.integer({ min: 0, max: 4 }) }),
    fc.record({ op: fc.constant("offer" as const), at: fc.integer({ min: 0, max: 5 }) }),
    fc.record({ op: fc.constant("decline" as const), at: fc.integer({ min: 0, max: 5 }) }),
    fc.record({ op: fc.constant("release" as const), at: fc.integer({ min: 0, max: 5 }) }),
  );

  /** The queue as the rule says it, worked here from the applications and not from queueView. */
  function expectedOrder(state: AllotState): string[] {
    return Object.values(state.applications)
      .filter((a) => a.state === "waiting" || a.state === "offered")
      .sort((a, b) => (a.joinedOn !== b.joinedOn ? (a.joinedOn < b.joinedOn ? -1 : 1) : a.sequence !== b.sequence ? a.sequence - b.sequence : a.applicationId < b.applicationId ? -1 : 1))
      .map((a) => a.applicationId);
  }

  it(`holds for ${RUNS} generated runs: sequences never change, and the order is date, sequence, ID`, () => {
    const { cases } = runProperty(
      "INV_SEQ_FIXED",
      fc.array(opArb, { maxLength: 14 }),
      (ops) => {
        let state = garden(4);
        let added = 0;
        const sequences = new Map<string, number>();
        const ids: string[] = [];
        for (const [n, op] of ops.entries()) {
          const target = (at: number): string | undefined => ids[at % Math.max(1, ids.length)];
          const today = day(10 + n);
          let next: AllotState | undefined;
          if (op.op === "add") {
            // Application IDs sort in the reverse of the order they are added, so only the sequence breaks a tie.
            const id = `app-${String(99 - added).padStart(2, "0")}`;
            next = step(state, { type: "add_applicant", applicationId: id, personId: `person-${added}`, name: `Person ${added}`, joinedOn: day(op.date) }, today);
            if (next !== undefined) {
              ids.push(id);
              added += 1;
            }
          } else {
            const id = target(op.at);
            if (id === undefined) continue;
            if (op.op === "withdraw") next = step(state, { type: "withdraw_applicant", applicationId: id, reason: "Gone" }, today);
            else if (op.op === "correct") next = step(state, { type: "correct_joined_on", applicationId: id, joinedOn: day(op.date), correctsEventId: "e", reason: "Page" }, today);
            else if (op.op === "offer") {
              const everyone = Object.fromEntries(ids.map((x) => [x, "Passed over"]));
              next = step(state, { type: "make_offer", offerId: `offer-${n}`, applicationId: id, spaceId: `sp${n % 4}`, claimId: `hold-${n}`, replyBy: day(11 + n), skipReasons: everyone }, today);
            } else {
              const open = Object.values(state.offers).find((o) => o.applicationId === id && o.state === "open");
              if (open === undefined) continue;
              next = op.op === "decline" ? step(state, { type: "decline_offer", offerId: open.offerId, choice: "keep_place" }, today) : step(state, { type: "release_offer", offerId: open.offerId }, day(40 + n));
            }
          }
          if (next !== undefined) state = next;
          for (const a of Object.values(state.applications)) {
            const before = sequences.get(a.applicationId);
            if (before !== undefined) expect(a.sequence, a.applicationId).toBe(before);
            sequences.set(a.applicationId, a.sequence);
          }
          expect(queueView(state).map((r) => r.applicationId)).toEqual(expectedOrder(state));
          expect(queueView(state).map((r) => r.position)).toEqual(queueView(state).map((_r, i) => i + 1));
        }
      },
      { seed: SEEDS.INV_SEQ_FIXED },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("catches an order that follows the application ID", () => {
    let state = garden(2);
    state = must(state, { type: "add_applicant", applicationId: "app-b", personId: "p1", name: "One", joinedOn: day(1) }, day(1));
    state = must(state, { type: "add_applicant", applicationId: "app-a", personId: "p2", name: "Two", joinedOn: day(1) }, day(1));
    expect(queueView(state).map((r) => r.applicationId)).toEqual(expectedOrder(state));
    expect(["app-a", "app-b"]).not.toEqual(expectedOrder(state));
  });
});

describe("INV_BALANCE: a charge never owes less than nothing or more than it was (A4)", () => {
  type Op = { op: "receive"; charge: number; amount: number; date: number } | { op: "reverse"; at: number; date: number } | { op: "reverseCharge"; charge: number; date: number };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ op: fc.constant("receive" as const), charge: fc.integer({ min: 0, max: 1 }), amount: fc.integer({ min: 1, max: 4 }).map((n) => n * 1000), date: fc.integer({ min: 0, max: 20 }) }),
    fc.record({ op: fc.constant("reverse" as const), at: fc.integer({ min: 0, max: 8 }), date: fc.integer({ min: 0, max: 30 }) }),
    fc.record({ op: fc.constant("reverseCharge" as const), charge: fc.integer({ min: 0, max: 1 }), date: fc.integer({ min: 0, max: 30 }) }),
  );

  function base(): AllotState {
    let state = garden(2);
    for (const i of [0, 1]) state = must(state, { type: "record_tenancy", tenancyId: `ten${i}`, claimId: `tc${i}`, personId: `holder${i}`, holderName: `Holder ${i}`, spaceId: `sp${i}`, start: "2020-01-01" }, "2026-01-01");
    state = must(state, { type: "new_season", seasonId: "season", name: "Season", start: "2026-01-01", endExclusive: "2027-01-01", dueOn: day(15), standardFee: 3000 }, "2026-01-01");
    return must(state, { type: "apply_charges", seasonId: "season", items: [0, 1].map((i) => ({ chargeId: `charge${i}`, tenancyId: `ten${i}` })) }, "2026-01-01");
  }

  function violations(state: AllotState): string[] {
    const out: string[] = [];
    for (const charge of Object.values(state.ledger).filter((e) => e.type === "charge")) {
      for (let d = 0; d <= 50; d++) {
        const s = chargeSummary(state, charge.entryId, day(d));
        if (s === undefined || s.status === "reversed") continue;
        if (s.balance < 0 || s.balance > s.charged) out.push(`${charge.entryId} on ${day(d)}: balance ${s.balance} of ${s.charged}`);
      }
    }
    return out;
  }

  it(`holds for ${RUNS} generated runs of receipts and reversals on any dates, and a tenancy balance is the sum of its charges`, () => {
    const start = base();
    const { cases } = runProperty(
      "INV_BALANCE",
      fc.array(opArb, { maxLength: 12 }),
      (ops) => {
        let state = start;
        const accepted: string[] = [];
        for (const [n, op] of ops.entries()) {
          let next: AllotState | undefined;
          if (op.op === "receive") {
            next = step(state, { type: "record_receipt", receiptId: `r${n}`, chargeId: `charge${op.charge}`, amount: op.amount }, day(op.date));
            if (next !== undefined) accepted.push(`r${n}`);
          } else if (op.op === "reverse") {
            const target = accepted[op.at];
            next = target === undefined ? undefined : step(state, { type: "reverse_entry", reversalId: `v${n}`, entryId: target, reason: "Test" }, day(op.date));
          } else {
            next = step(state, { type: "reverse_entry", reversalId: `v${n}`, entryId: `charge${op.charge}`, reason: "Test" }, day(op.date));
          }
          if (next !== undefined) state = next;
          expect(violations(state)).toEqual([]);
        }
        for (const i of [0, 1]) {
          const sum = Object.values(state.ledger)
            .filter((e) => e.type === "charge" && e.tenancyId === `ten${i}`)
            .reduce((n, e) => {
              const s = chargeSummary(state, e.entryId, day(50));
              return n + (s === undefined || s.status === "reversed" ? 0 : s.balance);
            }, 0);
          expect(tenancyBalance(state, `ten${i}`, day(50))).toBe(sum);
        }
      },
      { seed: SEEDS.INV_BALANCE_GARDEN },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("catches an overpaid charge", () => {
    const state = base();
    const bad = { ...state, ledger: { ...state.ledger, over: { entryId: "over", tenancyId: "ten0", seasonId: "season", type: "receipt" as const, minorUnits: 4000, on: day(2), chargeId: "charge0" } } };
    expect(violations(bad).length).toBeGreaterThan(0);
  });
});

describe("INV_ONE_OPEN_OFFER: at most one open offer per plot and per application (A2)", () => {
  type Op = { op: "offer"; app: number; plot: number } | { op: "accept"; at: number } | { op: "decline"; at: number; leave: boolean } | { op: "release"; at: number };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ op: fc.constant("offer" as const), app: fc.integer({ min: 0, max: 3 }), plot: fc.integer({ min: 0, max: 2 }) }),
    fc.record({ op: fc.constant("accept" as const), at: fc.integer({ min: 0, max: 7 }) }),
    fc.record({ op: fc.constant("decline" as const), at: fc.integer({ min: 0, max: 7 }), leave: fc.boolean() }),
    fc.record({ op: fc.constant("release" as const), at: fc.integer({ min: 0, max: 7 }) }),
  );

  function violations(state: AllotState): string[] {
    const out: string[] = [];
    const open = Object.values(state.offers).filter((o) => o.state === "open");
    for (const key of new Set(open.map((o) => o.plotId))) if (open.filter((o) => o.plotId === key).length > 1) out.push(`two open offers on ${key}`);
    for (const key of new Set(open.map((o) => o.applicationId))) if (open.filter((o) => o.applicationId === key).length > 1) out.push(`two open offers for ${key}`);
    for (const a of Object.values(state.applications)) if ((a.state === "offered") !== open.some((o) => o.applicationId === a.applicationId)) out.push(`${a.applicationId} has state ${a.state}`);
    for (const t of Object.values(state.tenancies)) if (Object.values(state.tenancies).filter((u) => u.plotId === t.plotId && u.fromOffer !== undefined && t.fromOffer !== undefined && u.start === t.start).length > 1) out.push("two tenancies from offers on one day");
    return out;
  }

  it(`holds for ${RUNS} generated runs of offers, accepts, declines and releases`, () => {
    let start = garden(3);
    for (let i = 0; i < 4; i++) start = must(start, { type: "add_applicant", applicationId: `app${i}`, personId: `person${i}`, name: `Person ${i}`, joinedOn: "2026-01-10" }, "2026-01-10");
    const everyone = Object.fromEntries([0, 1, 2, 3].map((i) => [`app${i}`, "Passed over"]));
    const { cases } = runProperty(
      "INV_ONE_OPEN_OFFER",
      fc.array(opArb, { maxLength: 12 }),
      (ops) => {
        let state = start;
        const offers: string[] = [];
        for (const [n, op] of ops.entries()) {
          const on = day(20 + n);
          let next: AllotState | undefined;
          if (op.op === "offer") {
            next = step(state, { type: "make_offer", offerId: `o${n}`, applicationId: `app${op.app}`, spaceId: `sp${op.plot}`, claimId: `h${n}`, replyBy: day(21 + n), skipReasons: everyone }, on);
            if (next !== undefined) offers.push(`o${n}`);
          } else {
            const target = offers[op.at % Math.max(1, offers.length)];
            if (target === undefined) continue;
            if (op.op === "accept") next = step(state, { type: "accept_offer", offerId: target, tenancyId: `ten${n}`, claimId: `tc${n}` }, on);
            else if (op.op === "decline") next = step(state, { type: "decline_offer", offerId: target, choice: op.leave ? "leave_list" : "keep_place" }, on);
            else next = step(state, { type: "release_offer", offerId: target }, day(60 + n));
          }
          if (next !== undefined) state = next;
          expect(violations(state)).toEqual([]);
        }
      },
      { seed: SEEDS.INV_ONE_OPEN_OFFER },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("catches two open offers on one plot", () => {
    let state = garden(1);
    state = must(state, { type: "add_applicant", applicationId: "a1", personId: "p1", name: "One", joinedOn: day(1) }, day(1));
    state = must(state, { type: "make_offer", offerId: "o1", applicationId: "a1", spaceId: "sp0", claimId: "h1" }, day(2));
    const offer = state.offers["o1"] as NonNullable<(typeof state.offers)["o1"]>;
    const bad = { ...state, offers: { ...state.offers, o2: { ...offer, offerId: "o2", applicationId: "a2" } } };
    expect(violations(bad).length).toBeGreaterThan(0);
  });
});

describe("INV_NO_LIVING_PUBLIC: private edits never change the availability file (A6)", () => {
  type Op = { op: "applicant"; date: number } | { op: "withdraw"; at: number } | { op: "season" } | { op: "charge" } | { op: "receipt"; amount: number } | { op: "reverse" };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ op: fc.constant("applicant" as const), date: fc.integer({ min: 0, max: 8 }) }),
    fc.record({ op: fc.constant("withdraw" as const), at: fc.integer({ min: 0, max: 5 }) }),
    fc.constant({ op: "season" as const }),
    fc.constant({ op: "charge" as const }),
    fc.record({ op: fc.constant("receipt" as const), amount: fc.integer({ min: 1, max: 3 }).map((n) => n * 1000) }),
    fc.constant({ op: "reverse" as const }),
  );

  const build = (state: AllotState) => {
    let k = 0;
    return buildAvailabilityFile(state, { asOf: "2026-04-20", revision: 1, newPublicId: () => `x${++k}` });
  };

  it(`holds for ${RUNS} generated runs: the file is the same, and no private name is in it`, () => {
    let start = garden(3, true);
    start = must(start, { type: "record_tenancy", tenancyId: "ten0", claimId: "tc0", personId: "holder", holderName: "Zorb Holdington", contact: "zorb.holdington@example.invalid", spaceId: "sp0", start: "2025-04-01" }, "2026-01-01");
    start = must(start, { type: "set_public", siteName: "Test Beds", gateName: "Gate", instructions: "Ask at the hut.", pathNames: { path: "Walk" }, sectionNames: { sec: "Row" }, listed: ["pl1", "pl2"] }, "2026-01-01");
    const reference = build(start);
    expect(reference.ok).toBe(true);
    const { cases } = runProperty(
      "INV_NO_LIVING_PUBLIC",
      fc.array(opArb, { maxLength: 10 }),
      (ops) => {
        let state = start;
        const applicants: string[] = [];
        let season = false;
        let charged = false;
        const receipts: string[] = [];
        for (const [n, op] of ops.entries()) {
          const on = "2026-02-01";
          let next: AllotState | undefined;
          if (op.op === "applicant") {
            next = step(state, { type: "add_applicant", applicationId: `app${n}`, personId: `person${n}`, name: `Qxz${n} Applicant${n}`, contact: `qxz${n}@example.invalid`, joinedOn: day(op.date) }, on);
            if (next !== undefined) applicants.push(`app${n}`);
          } else if (op.op === "withdraw") {
            const id = applicants[op.at % Math.max(1, applicants.length)];
            next = id === undefined ? undefined : step(state, { type: "withdraw_applicant", applicationId: id, reason: "Gone" }, on);
          } else if (op.op === "season") {
            next = step(state, { type: "new_season", seasonId: "s1", name: "Season One", start: "2026-01-01", endExclusive: "2027-01-01", standardFee: 4000 }, on);
            if (next !== undefined) season = true;
          } else if (op.op === "charge") {
            next = season ? step(state, { type: "apply_charges", seasonId: "s1", items: [{ chargeId: "c1", tenancyId: "ten0" }] }, on) : undefined;
            if (next !== undefined) charged = true;
          } else if (op.op === "receipt") {
            next = charged ? step(state, { type: "record_receipt", receiptId: `r${n}`, chargeId: "c1", amount: op.amount }, on) : undefined;
            if (next !== undefined) receipts.push(`r${n}`);
          } else {
            const target = receipts.pop();
            next = target === undefined ? undefined : step(state, { type: "reverse_entry", reversalId: `v${n}`, entryId: target, reason: "Test" }, on);
          }
          if (next !== undefined) state = next;
        }
        // The preview counts what stays private, so it changes with a private edit. The file does not.
        const out = build(state);
        expect(out.ok && reference.ok ? out.file : undefined).toEqual(reference.ok ? reference.file : null);
        const bytes = JSON.stringify(out.ok ? out.file : out);
        for (const word of ["Qxz", "qxz", "Zorb", "zorb", "Applicant", "4000", "example.invalid"]) expect(bytes).not.toContain(word);
      },
      { seed: SEEDS.INV_NO_LIVING_PUBLIC_GARDEN },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("catches a file that carries a name", () => {
    const state = garden(1, true);
    const ok = build(must(state, { type: "set_public", siteName: "Test Beds", gateName: "Gate", listed: ["pl0"] }, "2026-01-01"));
    expect(ok.ok).toBe(true);
    const leaked = build(must(state, { type: "set_public", siteName: "Zorb Holdington Beds", gateName: "Gate", listed: ["pl0"] }, "2026-01-01"));
    expect(JSON.stringify(leaked)).toContain("Zorb");
  });
});

// T21 (history) and T09 (replay): events are append only, replay equals the
// stored state, corrections stay visible, and a revision can be viewed as saved.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCore,
  batches,
  canonicalJson,
  checkSequence,
  effectiveEvents,
  emptyCoreState,
  eventsAtRevision,
  hashBatch,
  historyOf,
  makeStoredEvent,
  monthTotals,
  replay,
  revisionOf,
  storedToEvent,
  supersededEventIds,
  viewEvents,
  type CoreEvent,
  type DraftEvent,
  type StoredEvent,
} from "../../template/src/events";
import type { CoreState } from "../../template/src/types";
import { burial, claimAdded, confirmed, fid, plotAdded, SITE_ID, space } from "../helpers/site";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

describe("T21 canonical JSON", () => {
  it("sorts keys at every depth and writes no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("gives the same text for any key order", () => {
    expect(canonicalJson({ x: 1, y: [1, 2], z: { p: 1, q: 2 } })).toBe(
      canonicalJson({ z: { q: 2, p: 1 }, y: [1, 2], x: 1 }),
    );
  });

  it("drops undefined properties and escapes strings like JSON", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson({ k: 'a"b\n' })).toBe('{"k":"a\\"b\\n"}');
  });

  it("refuses a nonfinite number at any depth", () => {
    expect(canonicalJson({ a: 1 })).toBe('{"a":1}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/finite/);
    expect(() => canonicalJson({ a: [1, { b: Number.POSITIVE_INFINITY }] })).toThrow(/finite/);
  });

  it("hashes the canonical text with SHA 256", async () => {
    const commands = { b: 2, a: [1, { y: 1, x: 2 }] };
    const expected = createHash("sha256").update('{"a":[1,{"x":2,"y":1}],"b":2}').digest("hex");
    expect(await hashBatch(commands)).toBe(expected);
    expect(await hashBatch({ a: [1, { x: 2, y: 1 }], b: 2 })).toBe(expected);
    expect(await hashBatch({ a: [1, { x: 2, y: 2 }], b: 2 })).not.toBe(expected);
  });
});

function draft(event: CoreEvent, extra: Partial<DraftEvent<CoreEvent>> = {}): DraftEvent<CoreEvent> {
  return { event, entityIds: [], payloadVersion: 1, ...extra };
}

describe("T21 stored events", () => {
  it("moves everything but the type into the payload", () => {
    const event = plotAdded("Y07", 2);
    const stored = makeStoredEvent(draft(event, { effectiveOn: "2026-03-10", sourceRef: "book 1" }), {
      eventId: fid("e"),
      siteId: SITE_ID,
      seq: 1,
      opId: fid("op"),
      recordedAt: "2026-03-10T09:00:00.000+00:00",
    });
    expect(stored.type).toBe("plot_added");
    expect(stored.payload).toEqual({
      plotId: fid("plot:Y07"),
      code: "Y07",
      spaces: [
        { spaceId: space("Y07", 1), label: "1" },
        { spaceId: space("Y07", 2), label: "2" },
      ],
    });
    expect(stored.effectiveOn).toBe("2026-03-10");
    expect(stored.sourceRef).toBe("book 1");
    expect(stored.payloadVersion).toBe(1);
    expect(storedToEvent(stored)).toEqual(event);
  });

  it("leaves out optional fields that are not set", () => {
    const stored = makeStoredEvent(draft(confirmed(space("Y07"))), {
      eventId: fid("e2"),
      siteId: SITE_ID,
      seq: 2,
      opId: fid("op"),
      recordedAt: "2026-03-10T09:00:00.000+00:00",
    });
    expect(Object.keys(stored).sort()).toEqual(
      ["entityIds", "eventId", "opId", "payload", "payloadVersion", "recordedAt", "seq", "siteId", "type"].sort(),
    );
  });
});

interface Item {
  event: CoreEvent;
  opId: string;
  effectiveOn?: string;
  corrects?: string;
}

function build(items: Item[]): StoredEvent[] {
  return items.map((item, index) => {
    const extra: Partial<DraftEvent<CoreEvent>> = {};
    if (item.effectiveOn !== undefined) extra.effectiveOn = item.effectiveOn;
    if (item.corrects !== undefined) extra.corrects = item.corrects;
    return makeStoredEvent(draft(item.event, extra), {
      eventId: fid(`event:${index + 1}`),
      siteId: SITE_ID,
      seq: index + 1,
      opId: fid(`op:${item.opId}`),
      recordedAt: `2026-04-0${(index % 9) + 1}T10:00:00.000+00:00`,
    });
  });
}

// Four batches. The fourth corrects the burial recorded in the third.
const SCENARIO: Item[] = [
  { event: plotAdded("Y07", 2), opId: "A", effectiveOn: "2026-03-10" },
  { event: confirmed(space("Y07", 1)), opId: "A", effectiveOn: "2026-03-10" },
  { event: claimAdded("hold:Y07", space("Y07", 1), "held", { start: "2026-03-12" }), opId: "B", effectiveOn: "2026-03-12" },
  { event: burial("b1", space("Y07", 2), { sourceRef: "book 1 p4" }), opId: "C", effectiveOn: "2026-03-20" },
  {
    event: { type: "claim_voided", claimId: "b1", reason: "Wrong plot" },
    opId: "D",
    effectiveOn: "2026-04-02",
    corrects: fid("event:4"),
  },
  { event: burial("b1b", space("Y07", 2), { sourceRef: "book 1 p4" }), opId: "D", effectiveOn: "2026-04-02" },
];

// Built before each test that needs it, so a missing function fails each test by name.
let events: StoredEvent[] = [];
describe("T21 replay equals the stored state", () => {
  beforeEach(() => {
    events = build(SCENARIO);
  });

  function incremental(): CoreState {
    return events.map((e) => storedToEvent<CoreEvent>(e)).reduce(applyCore, emptyCoreState(SITE_ID));
  }

  it("builds the same state from the start and one event at a time", () => {
    const result = replay<CoreState, CoreEvent>(applyCore, emptyCoreState(SITE_ID), events);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(incremental());
  });

  it("builds the same state after the events are written and read back as JSON", () => {
    const reread = JSON.parse(JSON.stringify(events)) as StoredEvent[];
    const result = replay<CoreState, CoreEvent>(applyCore, emptyCoreState(SITE_ID), reread);
    expect(result.ok && result.value).toEqual(incremental());
  });

  it("never changes an event or an earlier state", () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(events)) as StoredEvent[]);
    const before = JSON.stringify(frozen);
    let state = deepFreeze(emptyCoreState(SITE_ID));
    for (const stored of frozen) {
      state = deepFreeze(applyCore(state, storedToEvent<CoreEvent>(stored)));
    }
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("shows the corrected claim as voided and keeps the replacement", () => {
    const result = replay<CoreState, CoreEvent>(applyCore, emptyCoreState(SITE_ID), events);
    if (!result.ok) throw new Error("replay failed");
    expect(result.value.claims["b1"]?.voided).toBe(true);
    expect(result.value.claims["b1b"]?.voided).toBeUndefined();
    expect(result.value.claims["b1"]?.sourceRef).toBe("book 1 p4");
  });

  it("refuses a gap, a repeat, a wrong start and a second site", () => {
    const gap = [events[0]!, events[2]!];
    const gapResult = checkSequence(gap);
    expect(gapResult.ok).toBe(false);
    if (!gapResult.ok) expect(gapResult.error.code).toBe("seq_gap");
    expect(checkSequence([events[0]!, events[0]!]).ok).toBe(false);
    expect(checkSequence(events.slice(1)).ok).toBe(false);
    const foreign = { ...events[1]!, siteId: fid("other-site") };
    const foreignResult = checkSequence([events[0]!, foreign]);
    expect(foreignResult.ok).toBe(false);
    if (!foreignResult.ok) expect(foreignResult.error.code).toBe("foreign_site");
    expect(checkSequence(events, SITE_ID).ok).toBe(true);
    expect(checkSequence(events, fid("another")).ok).toBe(false);
    expect(checkSequence([]).ok).toBe(true);
  });

  it("replay refuses a broken sequence and applies nothing", () => {
    const result = replay<CoreState, CoreEvent>(applyCore, emptyCoreState(SITE_ID), [events[0]!, events[2]!]);
    expect(result.ok).toBe(false);
  });
});

describe("T21 corrections stay visible", () => {
  beforeEach(() => {
    events = build(SCENARIO);
  });

  it("names the corrected event and lists the correction beside it", () => {
    const rows = historyOf(events);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    const original = rows.find((r) => r.eventId === fid("event:4"));
    expect(original?.correctedBy).toEqual([fid("event:5")]);
    const correction = rows.find((r) => r.eventId === fid("event:5"));
    expect(correction?.corrects).toBe(fid("event:4"));
    expect(correction?.type).toBe("claim_voided");
    expect(rows.find((r) => r.eventId === fid("event:3"))?.correctedBy).toEqual([]);
  });

  it("shows effective date and write order as separate fields", () => {
    const rows = historyOf(events);
    const original = rows.find((r) => r.eventId === fid("event:4"));
    expect(original?.effectiveOn).toBe("2026-03-20");
    expect(original?.seq).toBe(4);
    expect(original?.recordedAt).toMatch(/^2026-04-/);
  });

  it("lists superseded events and leaves them out of the effective list", () => {
    expect([...supersededEventIds(events)]).toEqual([fid("event:4")]);
    const effective = effectiveEvents(events).map((e) => e.seq);
    expect(effective).toEqual([1, 2, 3, 5, 6]);
  });

  it("builds month totals by event date and leaves out a corrected event", () => {
    // claim_added: event 3 on 12 March, event 4 on 20 March (corrected), event 6 on 2 April.
    expect(monthTotals(events, "claim_added")).toEqual({ "2026-03": 1, "2026-04": 1 });
    // The correction itself is counted under its own type, in its own month.
    expect(monthTotals(events, "claim_voided")).toEqual({ "2026-04": 1 });
  });

  it("counts every event when nothing is corrected", () => {
    expect(monthTotals(events.slice(0, 4), "claim_added")).toEqual({ "2026-03": 2 });
  });

  it("keeps events with no effective date in their own bucket", () => {
    const undated = build([{ event: plotAdded("Q1"), opId: "A" }]);
    expect(monthTotals(undated, "plot_added")).toEqual({ undated: 1 });
  });
});

describe("T21 revision views", () => {
  beforeEach(() => {
    events = build(SCENARIO);
  });

  it("groups events by operation, in write order", () => {
    expect(batches(events).map((b) => b.map((e) => e.seq))).toEqual([[1, 2], [3], [4], [5, 6]]);
    expect(revisionOf(events)).toBe(4);
    expect(revisionOf([])).toBe(0);
  });

  it("returns the first r batches", () => {
    expect(eventsAtRevision(events, 0)).toEqual([]);
    expect(eventsAtRevision(events, 1).map((e) => e.seq)).toEqual([1, 2]);
    expect(eventsAtRevision(events, 3).map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(eventsAtRevision(events, 99).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("says which basis a view uses and prints its revision", () => {
    const current = viewEvents(events, { mode: "current" });
    expect(current.basis).toBe("current_corrections");
    expect(current.revision).toBe(4);
    expect(current.events).toHaveLength(6);
    const snapshot = viewEvents(events, { mode: "snapshot", revision: 3 });
    expect(snapshot.basis).toBe("saved_snapshot");
    expect(snapshot.revision).toBe(3);
    expect(snapshot.events).toHaveLength(4);
  });

  it("shows the burial as it was saved, and the correction in the current view", () => {
    const saved = replay<CoreState, CoreEvent>(
      applyCore,
      emptyCoreState(SITE_ID),
      viewEvents(events, { mode: "snapshot", revision: 3 }).events,
    );
    const now = replay<CoreState, CoreEvent>(
      applyCore,
      emptyCoreState(SITE_ID),
      viewEvents(events, { mode: "current" }).events,
    );
    expect(saved.ok && saved.value.claims["b1"]?.voided).toBeUndefined();
    expect(now.ok && now.value.claims["b1"]?.voided).toBe(true);
  });
});

// Events, replay, corrections and revision views. Pure.
// Stored event bytes never change. A correction is a new event that names the
// event it corrects.
import type { LocalDate, IsoInstant } from "./calendar";
import { renamePlot } from "./plot";
import { err, ok } from "./types";
import type { Claim, CoreState, Plot, Result, Uuid } from "./types";

/** One committed event, as stored. Design D6. */
export interface StoredEvent {
  eventId: Uuid;
  siteId: Uuid;
  /** 1, 2, 3 and so on with no gap, equal to its position in replay. */
  seq: number;
  /** One per user intent. All events of a batch share it. */
  opId: Uuid;
  entityIds: string[];
  type: string;
  recordedAt: IsoInstant;
  effectiveOn?: LocalDate;
  payloadVersion: number;
  sourceRef?: string;
  /** The `eventId` of the event this one corrects. */
  corrects?: Uuid;
  payload: unknown;
}

/** What `decide` returns. `commit` adds the event ID, seq, operation and write time. */
export interface DraftEvent<E extends { type: string } = { type: string }> {
  event: E;
  entityIds: string[];
  effectiveOn?: LocalDate;
  sourceRef?: string;
  corrects?: Uuid;
  payloadVersion: number;
}

export type CoreEvent =
  | {
      type: "plot_added";
      plotId: Uuid;
      sectionId?: Uuid;
      code: string;
      spaces: { spaceId: Uuid; label: string }[];
    }
  | { type: "plot_renamed"; plotId: Uuid; code: string }
  | { type: "space_retired"; plotId: Uuid; spaceId: Uuid }
  | { type: "spaces_confirmed_empty"; spaceIds: Uuid[] }
  | { type: "claim_added"; claim: Claim }
  | { type: "claim_ended"; claimId: Uuid; endExclusive: LocalDate; reason?: string }
  | { type: "claim_voided"; claimId: Uuid; reason: string };

export const CORE_PAYLOAD_VERSION = 1;

const CORE_TYPES: ReadonlySet<string> = new Set([
  "plot_added",
  "plot_renamed",
  "space_retired",
  "spaces_confirmed_empty",
  "claim_added",
  "claim_ended",
  "claim_voided",
]);

export function isCoreEvent(event: { type: string }): event is CoreEvent {
  return CORE_TYPES.has(event.type);
}

export function emptyCoreState(siteId: Uuid): CoreState {
  return { siteId, plots: {}, claims: {} };
}

function corrupt(message: string): never {
  throw new Error(`Corrupt event: ${message}`);
}

function withSpacesChecked(plots: Record<Uuid, Plot>, spaceIds: ReadonlySet<Uuid>): Record<Uuid, Plot> {
  const next: Record<Uuid, Plot> = {};
  for (const [id, plot] of Object.entries(plots)) {
    next[id] = plot.spaces.some((s) => spaceIds.has(s.spaceId) && !s.checked)
      ? { ...plot, spaces: plot.spaces.map((s) => (spaceIds.has(s.spaceId) ? { ...s, checked: true } : s)) }
      : plot;
  }
  return next;
}

/** Apply one core event. Returns a new state and never edits the old one. */
export function applyCore(state: CoreState, event: CoreEvent): CoreState {
  switch (event.type) {
    case "plot_added": {
      const plot: Plot = {
        plotId: event.plotId,
        siteId: state.siteId,
        code: event.code,
        priorCodes: [],
        spaces: event.spaces.map((s) => ({ spaceId: s.spaceId, label: s.label, checked: false, retired: false })),
        archived: false,
      };
      if (event.sectionId !== undefined) plot.sectionId = event.sectionId;
      return { ...state, plots: { ...state.plots, [event.plotId]: plot } };
    }
    case "plot_renamed": {
      const plot = state.plots[event.plotId] ?? corrupt(`no plot ${event.plotId}`);
      const renamed = renamePlot(plot, event.code, []);
      if (!renamed.ok) corrupt(`bad rename ${event.code}`);
      return { ...state, plots: { ...state.plots, [event.plotId]: renamed.value } };
    }
    case "space_retired": {
      const plot = state.plots[event.plotId] ?? corrupt(`no plot ${event.plotId}`);
      const retired = {
        ...plot,
        spaces: plot.spaces.map((s) => (s.spaceId === event.spaceId ? { ...s, retired: true } : s)),
      };
      return { ...state, plots: { ...state.plots, [event.plotId]: retired } };
    }
    case "spaces_confirmed_empty":
      return { ...state, plots: withSpacesChecked(state.plots, new Set(event.spaceIds)) };
    case "claim_added": {
      const claims = { ...state.claims, [event.claim.claimId]: { ...event.claim } };
      const plots =
        event.claim.mode === "taken" ? withSpacesChecked(state.plots, new Set([event.claim.spaceId])) : state.plots;
      return { ...state, plots, claims };
    }
    case "claim_ended": {
      const claim = state.claims[event.claimId] ?? corrupt(`no claim ${event.claimId}`);
      const ended: Claim = { ...claim, endExclusive: event.endExclusive };
      if (event.reason !== undefined) ended.reason = event.reason;
      return { ...state, claims: { ...state.claims, [event.claimId]: ended } };
    }
    case "claim_voided": {
      const claim = state.claims[event.claimId] ?? corrupt(`no claim ${event.claimId}`);
      return { ...state, claims: { ...state.claims, [event.claimId]: { ...claim, voided: true } } };
    }
  }
}

function canon(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new RangeError("Cannot write a number that is not finite");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      const withJson = value as { toJSON?: () => unknown };
      if (typeof withJson.toJSON === "function") return canon(withJson.toJSON());
      if (Array.isArray(value)) return `[${value.map((item) => canon(item) ?? "null").join(",")}]`;
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(record).sort()) {
        const text = canon(record[key]);
        if (text !== undefined) parts.push(`${JSON.stringify(key)}:${text}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`Cannot write a ${typeof value} value`);
  }
}

/** JSON with sorted keys, no whitespace and no undefined values. */
export function canonicalJson(value: unknown): string {
  return canon(value) ?? "null";
}

/** SHA 256 of the canonical JSON of a command batch, as lower case hex. */
export async function hashBatch(commands: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(commands));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StoredMeta {
  eventId: Uuid;
  siteId: Uuid;
  seq: number;
  opId: Uuid;
  recordedAt: IsoInstant;
}

/** Turn a draft into a stored event. The event minus its type becomes the payload. */
export function makeStoredEvent(draft: DraftEvent, meta: StoredMeta): StoredEvent {
  const { type, ...payload } = draft.event;
  const stored: StoredEvent = {
    eventId: meta.eventId,
    siteId: meta.siteId,
    seq: meta.seq,
    opId: meta.opId,
    entityIds: [...draft.entityIds],
    type,
    recordedAt: meta.recordedAt,
    payloadVersion: draft.payloadVersion,
    payload: structuredClone(payload),
  };
  if (draft.effectiveOn !== undefined) stored.effectiveOn = draft.effectiveOn;
  if (draft.sourceRef !== undefined) stored.sourceRef = draft.sourceRef;
  if (draft.corrects !== undefined) stored.corrects = draft.corrects;
  return stored;
}

/** The inverse of `makeStoredEvent` for the event body. */
export function storedToEvent<E extends { type: string }>(stored: StoredEvent): E {
  return { type: stored.type, ...(stored.payload as Record<string, unknown>) } as unknown as E;
}

/** Events must run 1, 2, 3 with no gap and belong to one site. */
export function checkSequence(events: readonly StoredEvent[], siteId?: Uuid): Result<true> {
  const first = events[0];
  if (first === undefined) return ok(true);
  const expectedSite = siteId ?? first.siteId;
  for (const [index, event] of events.entries()) {
    if (event.siteId !== expectedSite) return err("foreign_site", { seq: event.seq, siteId: event.siteId });
    if (event.seq !== index + 1) return err("seq_gap", { expected: index + 1, got: event.seq });
  }
  return ok(true);
}

/** Fold stored events into a state. Refuses a broken sequence before applying any. */
export function replay<S, E extends { type: string }>(
  apply: (state: S, event: E) => S,
  initial: S,
  events: readonly StoredEvent[],
): Result<S> {
  const sequence = checkSequence(events);
  if (!sequence.ok) return sequence;
  let state = initial;
  for (const stored of events) state = apply(state, storedToEvent<E>(stored));
  return ok(state);
}

/** Group events into batches, one per operation, in write order. */
export function batches(events: readonly StoredEvent[]): StoredEvent[][] {
  const groups: StoredEvent[][] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last[0]?.opId === event.opId) last.push(event);
    else groups.push([event]);
  }
  return groups;
}

/** The revision is the number of committed batches. */
export function revisionOf(events: readonly StoredEvent[]): number {
  return batches(events).length;
}

/** The events of the first `revision` batches. */
export function eventsAtRevision(events: readonly StoredEvent[], revision: number): StoredEvent[] {
  return batches(events)
    .slice(0, Math.max(0, revision))
    .flat();
}

export type RevisionView = { mode: "current" } | { mode: "snapshot"; revision: number };

export interface ViewedEvents {
  basis: "current_corrections" | "saved_snapshot";
  revision: number;
  events: StoredEvent[];
}

/** The events a past report uses, and which basis it states. */
export function viewEvents(events: readonly StoredEvent[], view: RevisionView): ViewedEvents {
  const latest = revisionOf(events);
  if (view.mode === "current") {
    return { basis: "current_corrections", revision: latest, events: [...events] };
  }
  const revision = Math.min(Math.max(0, view.revision), latest);
  return { basis: "saved_snapshot", revision, events: eventsAtRevision(events, revision) };
}

/** IDs of events that a later event corrects. */
export function supersededEventIds(events: readonly StoredEvent[]): Set<Uuid> {
  const ids = new Set<Uuid>();
  for (const event of events) if (event.corrects !== undefined) ids.add(event.corrects);
  return ids;
}

/** Events not corrected by a later one. The corrections themselves stay. */
export function effectiveEvents(events: readonly StoredEvent[]): StoredEvent[] {
  const superseded = supersededEventIds(events);
  return events.filter((e) => !superseded.has(e.eventId));
}

export interface HistoryRow {
  eventId: Uuid;
  seq: number;
  type: string;
  effectiveOn?: LocalDate;
  recordedAt: IsoInstant;
  sourceRef?: string;
  corrects?: Uuid;
  correctedBy: Uuid[];
}

/** Every event in write order, with corrections linked both ways. */
export function historyOf(events: readonly StoredEvent[]): HistoryRow[] {
  const correctedBy = new Map<Uuid, Uuid[]>();
  for (const event of events) {
    if (event.corrects === undefined) continue;
    const list = correctedBy.get(event.corrects) ?? [];
    list.push(event.eventId);
    correctedBy.set(event.corrects, list);
  }
  return events.map((event) => {
    const row: HistoryRow = {
      eventId: event.eventId,
      seq: event.seq,
      type: event.type,
      recordedAt: event.recordedAt,
      correctedBy: correctedBy.get(event.eventId) ?? [],
    };
    if (event.effectiveOn !== undefined) row.effectiveOn = event.effectiveOn;
    if (event.sourceRef !== undefined) row.sourceRef = event.sourceRef;
    if (event.corrects !== undefined) row.corrects = event.corrects;
    return row;
  });
}

/** Count effective events of one type by the month of their effective date. */
export function monthTotals(events: readonly StoredEvent[], type: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const event of effectiveEvents(events)) {
    if (event.type !== type) continue;
    const month = event.effectiveOn === undefined ? "undated" : event.effectiveOn.slice(0, 7);
    totals[month] = (totals[month] ?? 0) + 1;
  }
  return totals;
}

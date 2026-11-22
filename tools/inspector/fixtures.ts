// The three invented fixtures of the plot inspector, built in memory by the real adapters. No database, no
// clock, no random value: the same call gives the same bytes. Their people, plots and payments were made for
// this project. Pure.
import { allotAdapter } from "../../apps/allotment-register/src/adapter";
import { thimbleBeds } from "../../apps/allotment-register/src/walkthrough";
import { churchAdapter } from "../../apps/churchyard-register/src/adapter";
import { lanternFold } from "../../apps/churchyard-register/src/walkthrough";
import { marketAdapter } from "../../examples/market/src/adapter";
import marketFixture from "../../examples/market/fixture.json";
import { defineRegister } from "../../template/src/adapter";
import type { Register, RegisterAdapter } from "../../template/src/adapter";
import type { BaseState } from "../../template/src/base";
import type { LocalDate } from "../../template/src/calendar";
import { makeStoredEvent } from "../../template/src/events";
import type { StoredEvent } from "../../template/src/events";
import { createSite } from "../../template/src/site";
import type { Site } from "../../template/src/types";

export const FIXTURE_IDS = ["lantern-fold", "thimble-beds", "market-stalls"] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

export const ADAPTER_IDS = ["churchyard", "allotment", "market"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

/** Each adapter is checked on its own fixture. */
export const FIXTURE_OF: Readonly<Record<AdapterId, FixtureId>> = {
  churchyard: "lantern-fold",
  allotment: "thimble-beds",
  market: "market-stalls",
};

/** The shell's view of an adapter: kind blind. */
export type AnyAdapter = RegisterAdapter<BaseState, { type: string; [field: string]: unknown }, { type: string }>;

export const ADAPTERS: Readonly<Record<AdapterId, AnyAdapter>> = {
  churchyard: churchAdapter as unknown as AnyAdapter,
  allotment: allotAdapter as unknown as AnyAdapter,
  market: marketAdapter as unknown as AnyAdapter,
};

/**
 * The invented private strings of each fixture, typed again here from hand totals sections 1 and 5 and the
 * market fixture. A test holds them equal to the strings of the test helpers.
 */
export const INSPECTOR_CANARIES: Readonly<Record<FixtureId, readonly string[]>> = {
  "lantern-fold": ["Torin Pellwick", "Odalys Fennimore", "Wren Ashgrove", "wren.ashgrove@example.invalid", "Hollowmere", "lantern-book-page-03.webp"],
  "thimble-beds": [
    "Tavi Bramblequill",
    "Olin Reedwhorl",
    "Marlo Fennick",
    "Ada Stonecrop",
    "Ilse Burrowby",
    "Hale Pennywort",
    "tavi.bramblequill@example.invalid",
    "olin.reedwhorl@example.invalid",
    "ada.stonecrop@example.invalid",
    "TB-RCPT-1",
    "36.00",
    "30.00",
    "12.00",
    "24.00",
    "GBP",
  ],
  "market-stalls": ["Rosa Pennywhistle", "Pim Cartwhistle"],
};

/** What a committee file must also never hold: the one name a family file may. */
export const COMMITTEE_EXTRA: Readonly<Record<FixtureId, readonly string[]>> = {
  "lantern-fold": ["Mirel Quillmoss"],
  "thimble-beds": [],
  "market-stalls": [],
};

const RECORDED_AT = "2026-04-20T09:30:00.000+00:00";
const COUNTER_BASE = 0x5000;

/** A fixed run of UUID shaped IDs. */
export function counter(start = COUNTER_BASE): () => string {
  let n = start;
  return () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
}

interface Batch {
  commands: { type: string; [field: string]: unknown }[];
  on: LocalDate;
}

export interface BuiltFixture {
  id: FixtureId;
  adapter: AnyAdapter;
  register: Register<BaseState, { type: string; [field: string]: unknown }, { type: string }>;
  site: Site;
  asOf: LocalDate;
  state: BaseState;
  events: StoredEvent[];
  /** One revision for each batch. */
  revision: number;
}

interface Market {
  site: { title: string; zone: string };
  asOf: string;
  stalls: { code: string; frontageCm?: number }[];
  traders: { name: string; neededCm: number; stall: string; start: string; expect?: string }[];
}

/** The market fixture as batches: the layout, the checks, the frontages, then the reservations that are allowed. */
function marketBatches(newId: () => string): Batch[] {
  const data = marketFixture as unknown as Market;
  const ids = new Map<string, string>();
  const id = (name: string): string => {
    let value = ids.get(name);
    if (value === undefined) {
      value = newId();
      ids.set(name, value);
    }
    return value;
  };
  const on = data.asOf;
  const section = id("section:row-a");
  const layout = {
    type: "layout_apply",
    sections: [{ sectionId: section, name: "Row A" }],
    plots: data.stalls.map((s) => ({ plotId: id(`plot:${s.code}`), code: s.code, sectionId: section, spaces: [{ spaceId: id(`space:${s.code}`) }] })),
  };
  return [
    { commands: [layout], on },
    { commands: [{ type: "confirm_empty", spaceIds: data.stalls.map((s) => id(`space:${s.code}`)) }], on },
    { commands: data.stalls.filter((s) => s.frontageCm !== undefined).map((s) => ({ type: "set_frontage", plotId: id(`plot:${s.code}`), frontageCm: s.frontageCm })), on },
    {
      commands: data.traders
        .filter((t) => t.expect === undefined)
        .map((t, i) => ({ type: "reserve_stall", reservationId: id(`reservation:${i}`), claimId: id(`claim:${i}`), plotId: id(`plot:${t.stall}`), trader: t.name, neededCm: t.neededCm, start: t.start })),
      on,
    },
  ];
}

interface Source {
  adapterId: AdapterId;
  title: string;
  zone: string;
  currency?: "GBP";
  asOf: LocalDate;
  batches(newId: () => string): Batch[];
}

function sourceOf(id: FixtureId): Source {
  switch (id) {
    case "lantern-fold":
      return { adapterId: "churchyard", title: lanternFold.siteTitle, zone: lanternFold.zone, asOf: lanternFold.today, batches: (n) => lanternFold.batches(n) };
    case "thimble-beds":
      return { adapterId: "allotment", title: thimbleBeds.siteTitle, zone: thimbleBeds.zone, currency: "GBP", asOf: thimbleBeds.today, batches: (n) => thimbleBeds.batches(n) };
    case "market-stalls": {
      const data = marketFixture as unknown as Market;
      return { adapterId: "market", title: data.site.title, zone: data.site.zone, asOf: data.asOf, batches: marketBatches };
    }
  }
}

/** Build a fixture by running its commands through an adapter. The adapter may be another one, to test it. */
export function buildFixture(id: FixtureId, adapterOverride?: AnyAdapter): BuiltFixture {
  const source = sourceOf(id);
  const adapter = adapterOverride ?? ADAPTERS[source.adapterId];
  const defined = defineRegister(adapter);
  if (!defined.ok) throw new Error(`The adapter of ${id} was refused: ${defined.error.code}`);
  const register = defined.value;
  const newId = counter();
  const made = createSite({
    id: newId(),
    lineageId: newId(),
    siteKey: newId(),
    kind: adapter.kind,
    workspace: "walkthrough",
    title: source.title,
    zone: source.zone,
    createdAt: RECORDED_AT,
    ...(source.currency === undefined ? {} : { currency: source.currency }),
  });
  if (!made.ok) throw new Error(`The site of ${id} was refused: ${made.error.code}`);
  const site = made.value;

  let state = register.initialState(site);
  const events: StoredEvent[] = [];
  let seq = 0;
  for (const batch of source.batches(newId)) {
    const opId = newId();
    for (const command of batch.commands) {
      const decided = register.run(state, command, batch.on);
      if (!decided.ok) throw new Error(`The fixture ${id} was refused at ${command.type}: ${decided.error.code}`);
      for (const draft of decided.value) {
        state = adapter.apply(state, draft.event);
        seq += 1;
        events.push(makeStoredEvent(draft, { eventId: newId(), siteId: site.id, seq, opId, recordedAt: RECORDED_AT }));
      }
    }
  }
  const revision = new Set(events.map((e) => e.opId)).size;
  return { id, adapter, register, site, asOf: source.asOf, state, events, revision };
}

const cache = new Map<FixtureId, BuiltFixture>();

/** The default build of a fixture, made once. */
export function fixture(id: FixtureId): BuiltFixture {
  let built = cache.get(id);
  if (built === undefined) {
    built = buildFixture(id);
    cache.set(id, built);
  }
  return built;
}

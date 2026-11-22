// The churchyard register in a fake database, for the unit tests. Test helper. The template never imports it.
// It decides each command on an evolving state, commits the batch in one transaction, and keeps the
// state in step. A refusal or a failed commit changes nothing and is returned, not thrown.
import { IDBFactory } from "fake-indexeddb";
import type { Register } from "../../template/src/adapter";
import type { LocalDate } from "../../template/src/calendar";
import { openRegisterDb } from "../../template/src/data/db";
import { keySourceOfDraft, uniqueKeysFor } from "../../template/src/data/importBatch";
import { commit, readEvents, saveNewSite } from "../../template/src/data/transaction";
import type { DraftEvent, StoredEvent } from "../../template/src/events";
import { createSite, mintId } from "../../template/src/site";
import type { DomainError, Site, Uuid } from "../../template/src/types";
import { churchAdapter, churchRegister } from "../../apps/churchyard-register/src/adapter";
import type { ChurchCommand, ChurchEvent, ChurchState } from "../../apps/churchyard-register/src/types";
import { FIXED_NOW, fixedClock } from "./clock";
import { fid } from "./site";

export type Dispatched = { ok: true; revision: number } | { ok: false; error: DomainError };

export class ChurchEnv {
  state: ChurchState;
  revision = 0;
  private constructor(
    readonly db: IDBDatabase,
    readonly site: Site,
    readonly register: Register<ChurchState, ChurchCommand, ChurchEvent>,
  ) {
    this.state = register.initialState(site);
  }

  static async create(title = "Lantern Fold"): Promise<ChurchEnv> {
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("could not open storage");
    const made = createSite({
      id: mintId(),
      lineageId: mintId(),
      siteKey: mintId(),
      kind: "churchyard",
      title,
      zone: "Europe/London",
      createdAt: FIXED_NOW,
    });
    if (!made.ok) throw new Error("could not make a site");
    const saved = await saveNewSite(opened.value, made.value);
    if (!saved.ok) throw new Error("could not save the site");
    return new ChurchEnv(opened.value, made.value, churchRegister());
  }

  /** Decide, commit and keep the state. Nothing changes on a refusal. */
  async dispatch(commands: ChurchCommand[], on: LocalDate = "2026-04-20", opId: Uuid = mintId()): Promise<Dispatched> {
    let state = this.state;
    const drafts: DraftEvent<ChurchEvent>[] = [];
    for (const command of commands) {
      const decided = this.register.run(state, command, on);
      if (!decided.ok) return { ok: false, error: decided.error };
      for (const d of decided.value) {
        drafts.push(d);
        state = churchAdapter.apply(state, d.event);
      }
    }
    const sectionNames = new Map(Object.values(state.map.sections).map((s) => [s.sectionId, s.name]));
    const result = await commit(this.db, {
      siteId: this.site.id,
      expectedRevision: this.revision,
      opId,
      commands,
      events: drafts as DraftEvent[],
      blobs: [],
      uniqueKeys: uniqueKeysFor(drafts.map((d) => keySourceOfDraft(d as DraftEvent)), sectionNames),
      now: fixedClock(FIXED_NOW),
    });
    if (!result.ok) return { ok: false, error: { code: result.error.code } };
    this.state = state;
    this.revision = result.revision;
    return { ok: true, revision: result.revision };
  }

  /** Dispatch and fail the test run if the register refuses. */
  async must(commands: ChurchCommand[], on?: LocalDate): Promise<void> {
    const out = await this.dispatch(commands, on);
    if (!out.ok) throw new Error(`refused: ${JSON.stringify(out.error)}`);
  }

  events(): Promise<StoredEvent[]> {
    return readEvents(this.db, this.site.id);
  }

  /** Replay the stored events into a state, as a reload would. */
  async reload(): Promise<ChurchState> {
    const replayed = this.register.replay(this.site, await this.events());
    if (!replayed.ok) throw new Error(`replay refused: ${JSON.stringify(replayed.error)}`);
    return replayed.value;
  }

  /** The ID of the stored event of a type that mentions an entity ID. */
  async eventIdOf(type: string, entityId: Uuid): Promise<Uuid> {
    const found = (await this.events()).find((e) => e.type === type && e.entityIds.includes(entityId));
    if (found === undefined) throw new Error(`no ${type} event for ${entityId}`);
    return found.eventId;
  }

  /** Take the state and revision from the database, after something else (an import) committed. */
  async sync(): Promise<void> {
    this.state = await this.reload();
    const events = await this.events();
    this.revision = new Set(events.map((e) => e.opId)).size;
  }
}

/** A stable ID for a fixture name. */
export const id = (name: string): Uuid => fid(name);

/** A plot with its spaces: plot ID, then one space ID per space. */
export const plotId = (code: string): Uuid => fid(`plot:${code}`);
export const spaceId = (code: string, n = 1): Uuid => fid(`space:${code}:${n}`);

/** Plot footprints for the 6 by 2 arrangement of Yew Walk: Y01 to Y06 south of the path, Y07 to Y12 north of it. */
function footprint(index: number): [number, number][] {
  const column = index % 6;
  const north = index >= 6;
  const x = 1000 + column * 1100;
  const y = north ? 2900 : 1200;
  return [
    [x, y],
    [x + 900, y],
    [x + 900, y + 1100],
    [x, y + 1100],
  ];
}

export const WALK_PATH_ID = fid("path:Yew Walk");

/**
 * Yew Walk: Y01 to Y12, Y07 with two spaces. With `geometry` it has footprints, a section outline,
 * the path named Yew Walk between the rows and a gate named "Main gate". Free, reserved and unusable
 * plots are confirmed empty by the caller. A burial checks its own space.
 */
export async function layoutYewWalk(
  env: ChurchEnv,
  options: { extra?: { code: string; spaces: number }[]; geometry?: boolean } = {},
): Promise<void> {
  const sectionId = fid("section:Yew Walk");
  const codes = Array.from({ length: 12 }, (_, i) => `Y${String(i + 1).padStart(2, "0")}`);
  const plots = [...codes.map((code) => ({ code, spaces: code === "Y07" ? 2 : 1 })), ...(options.extra ?? [])];
  const geometry = options.geometry === true;
  await env.must([
    {
      type: "layout_apply",
      sections: [
        geometry
          ? {
              sectionId,
              name: "Yew Walk",
              outline: [
                [600, 800],
                [7800, 800],
                [7800, 4400],
                [600, 4400],
              ],
            }
          : { sectionId, name: "Yew Walk" },
      ],
      plots: plots.map(({ code, spaces }, i) => ({
        plotId: plotId(code),
        code,
        sectionId,
        spaces: Array.from({ length: spaces }, (_, n) => ({ spaceId: spaceId(code, n + 1) })),
        ...(geometry && i < 12 ? { footprint: footprint(i) } : {}),
      })),
      ...(geometry
        ? {
            paths: [{ pathId: WALK_PATH_ID, name: "Yew Walk", points: [[700, 2600], [7600, 2600]] as [number, number][] }],
            gate: { name: "Main gate", at: [500, 2600] as [number, number] },
            north: 0,
          }
        : {}),
    },
  ]);
}

export async function confirmEmpty(env: ChurchEnv, codes: string[]): Promise<void> {
  await env.must([{ type: "confirm_empty", spaceIds: codes.map((c) => spaceId(c)) }]);
}

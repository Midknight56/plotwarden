// The allotment register in a fake database, for the unit tests. Test helper. The template never imports it.
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
import type { Currency, DomainError, Site, Uuid } from "../../template/src/types";
import { allotAdapter, allotRegister } from "../../apps/allotment-register/src/adapter";
import type { AllotCommand, AllotEvent, AllotState } from "../../apps/allotment-register/src/types";
import { FIXED_NOW, fixedClock } from "./clock";
import { fid } from "./site";

export type Dispatched = { ok: true; revision: number } | { ok: false; error: DomainError };

export class GardenEnv {
  state: AllotState;
  revision = 0;
  private constructor(
    readonly db: IDBDatabase,
    readonly site: Site,
    readonly register: Register<AllotState, AllotCommand, AllotEvent>,
  ) {
    this.state = register.initialState(site);
  }

  /** A garden in GBP unless another currency is given. `null` makes a garden with no currency. */
  static async create(title = "Thimble Beds", currency: Currency | null = "GBP"): Promise<GardenEnv> {
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("could not open storage");
    const made = createSite({
      id: mintId(),
      lineageId: mintId(),
      siteKey: mintId(),
      kind: "allotment",
      title,
      zone: "Europe/London",
      createdAt: FIXED_NOW,
      ...(currency === null ? {} : { currency }),
    });
    if (!made.ok) throw new Error("could not make a site");
    const saved = await saveNewSite(opened.value, made.value);
    if (!saved.ok) throw new Error("could not save the site");
    return new GardenEnv(opened.value, made.value, allotRegister());
  }

  /** Decide, commit and keep the state. Nothing changes on a refusal. */
  async dispatch(commands: AllotCommand[], on: LocalDate = "2026-04-20", opId: Uuid = mintId()): Promise<Dispatched> {
    let state = this.state;
    const drafts: DraftEvent<AllotEvent>[] = [];
    for (const command of commands) {
      const decided = this.register.run(state, command, on);
      if (!decided.ok) return { ok: false, error: decided.error };
      for (const d of decided.value) {
        drafts.push(d);
        state = allotAdapter.apply(state, d.event);
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
  async must(commands: AllotCommand[], on?: LocalDate): Promise<void> {
    const out = await this.dispatch(commands, on);
    if (!out.ok) throw new Error(`refused: ${JSON.stringify(out.error)}`);
  }

  events(): Promise<StoredEvent[]> {
    return readEvents(this.db, this.site.id);
  }

  /** Replay the stored events into a state, as a reload would. */
  async reload(): Promise<AllotState> {
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
export const plotId = (code: string): Uuid => fid(`plot:${code}`);
export const spaceId = (code: string): Uuid => fid(`space:${code}:1`);
export const sectionId = (name: string): Uuid => fid(`section:${name}`);

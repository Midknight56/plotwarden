// A practice register an app brings with it. It lives in the walkthrough workspace of the same
// database, so it never appears among the keeper's own registers, and a restart removes that one
// site and nothing else. Every batch is decided by the register and committed in one transaction at a
// fixed write time, so the practice register is the same every time.
import type { Register } from "../adapter";
import type { IsoInstant, LocalDate } from "../calendar";
import type { DraftEvent } from "../events";
import { createSite, mintId } from "../site";
import { err, ok } from "../types";
import type { Currency, Result, Site } from "../types";
import { keySourceOfDraft, uniqueKeysFor } from "./importBatch";
import { removeSite } from "./siteAdmin";
import { commit, listSites, saveNewSite } from "./transaction";

export interface Walkthrough {
  /** The title of the practice site. It is also how the site is found again. */
  siteTitle: string;
  zone: string;
  /** The currency of a practice garden. A churchyard names none. */
  currency?: Currency;
  /** The date the practice register is read at. */
  today: LocalDate;
  /** The fixed write time of every batch. */
  startedAt: IsoInstant;
  /** The commands, in batches. Each batch is one revision. IDs come from the argument. */
  batches(newId: () => string): { commands: { type: string; [field: string]: unknown }[]; on: LocalDate }[];
}

export interface SeedOptions {
  newId: () => string;
}

type AnyRegister = Register<{ core: { plots: Record<string, unknown> }; map: { sections: Record<string, { sectionId: string; name: string }> } }, { type: string }, { type: string }>;

async function findSite(db: IDBDatabase, register: { kind: string }, walkthrough: Walkthrough): Promise<Site | undefined> {
  const sites = await listSites(db);
  return sites.find((s) => s.workspace === "walkthrough" && s.kind === register.kind && s.title === walkthrough.siteTitle);
}

/** Open the practice register, building it first if it is not there. */
export async function seedWalkthrough(
  db: IDBDatabase,
  register: Register<never, never, never>,
  walkthrough: Walkthrough,
  options: SeedOptions,
): Promise<Result<Site>> {
  const existing = await findSite(db, register, walkthrough);
  if (existing !== undefined) return ok(existing);

  const reg = register as unknown as AnyRegister;
  const made = createSite({
    id: mintId(),
    lineageId: mintId(),
    siteKey: mintId(),
    kind: reg.kind,
    workspace: "walkthrough",
    title: walkthrough.siteTitle,
    zone: walkthrough.zone,
    createdAt: walkthrough.startedAt,
    ...(walkthrough.currency === undefined ? {} : { currency: walkthrough.currency }),
  });
  if (!made.ok) return made;
  const site = made.value;

  // Decide every batch first, so a refusal leaves nothing in the database.
  let state = reg.initialState(site);
  const planned: { commands: { type: string }[]; drafts: DraftEvent[] }[] = [];
  for (const batch of walkthrough.batches(options.newId)) {
    const drafts: DraftEvent[] = [];
    for (const command of batch.commands) {
      const decided = reg.run(state, command, batch.on);
      if (!decided.ok) return decided;
      for (const draft of decided.value) {
        drafts.push(draft);
        state = reg.adapter.apply(state, draft.event);
      }
    }
    planned.push({ commands: batch.commands, drafts });
  }

  const saved = await saveNewSite(db, site);
  if (!saved.ok) return saved;
  const fixed = new Date(walkthrough.startedAt);
  let revision = 0;
  let replayState = reg.initialState(site);
  for (const batch of planned) {
    for (const draft of batch.drafts) replayState = reg.adapter.apply(replayState, draft.event);
    const sectionNames = new Map(Object.values(replayState.map.sections).map((s) => [s.sectionId, s.name]));
    const result = await commit(db, {
      siteId: site.id,
      expectedRevision: revision,
      opId: options.newId(),
      commands: batch.commands,
      events: batch.drafts,
      blobs: [],
      uniqueKeys: uniqueKeysFor(batch.drafts.map(keySourceOfDraft), sectionNames),
      now: () => new Date(fixed.getTime()),
    });
    if (!result.ok) {
      // A failed commit leaves a half built practice site. Remove only that site.
      await removeSite(db, site.id, site.title);
      return err("seed_failed", { code: result.error.code });
    }
    revision = result.revision;
  }
  return ok(site);
}

/** Remove the practice register, only that one, and build it again. */
export async function restartWalkthrough(
  db: IDBDatabase,
  register: Register<never, never, never>,
  walkthrough: Walkthrough,
  options: SeedOptions,
): Promise<Result<Site>> {
  const existing = await findSite(db, register, walkthrough);
  if (existing !== undefined) {
    const removed = await removeSite(db, existing.id, existing.title);
    if (!removed.ok) return removed;
  }
  return seedWalkthrough(db, register, walkthrough, options);
}

// The conformance suite. It runs unchanged against every adapter: the two apps
// and the tiny market adapter. Spec 02 adds import and restore checks.
// Test helper. The template never imports it.
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { defineRegister, type Register, type RegisterAdapter } from "../../template/src/adapter";
import type { LocalDate } from "../../template/src/calendar";
import { openRegisterDb } from "../../template/src/data/db";
import { commit, listSites, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import type { DraftEvent } from "../../template/src/events";
import { scanForCanaries } from "../../template/src/output/privacy";
import { createSite, mintId, siteLibrary } from "../../template/src/site";
import type { Site } from "../../template/src/types";
import { FIXED_NOW, fixedClock } from "../helpers/clock";

export interface ConformanceCase<S, C extends { type: string }, E extends { type: string }> {
  name: string;
  adapter: RegisterAdapter<S, C, E>;
  /** Commands that build a small register, each with its effective date. They must all succeed. */
  script: { command: C; on: LocalDate }[];
  /** Commands that must be refused, with the error code. Each runs on the state the script builds. */
  refusals: { command: C; code: string }[];
  /** Private strings that must never appear in the visitor file. */
  canaries: string[];
  asOf: LocalDate;
  /** Parse the visitor projection with its closed schema. */
  parseVisitor(value: unknown): { ok: boolean };
  /** Another kind name, to test isolation. */
  otherKind: string;
}

export interface Check {
  name: string;
  run(): Promise<void>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function newSite(kind: string, title: string, workspace: "own" | "walkthrough" = "own"): Site {
  const made = createSite({
    id: mintId(),
    lineageId: mintId(),
    siteKey: mintId(),
    kind,
    workspace,
    title,
    zone: "Europe/London",
    createdAt: FIXED_NOW,
  });
  if (!made.ok) throw new Error(`The suite could not make a site: ${JSON.stringify(made.error)}`);
  return made.value;
}

async function openDb(): Promise<IDBDatabase> {
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error(`The suite could not open storage: ${JSON.stringify(opened.error)}`);
  return opened.value;
}

function registerOf<S, C extends { type: string }, E extends { type: string }>(
  c: ConformanceCase<S, C, E>,
): Register<S, C, E> {
  const defined = defineRegister(c.adapter);
  if (!defined.ok) throw new Error(`defineRegister refused the adapter: ${JSON.stringify(defined.error)}`);
  return defined.value;
}

/** Run the script through the register and the database, one commit per command. */
async function playScript<S, C extends { type: string }, E extends { type: string }>(
  c: ConformanceCase<S, C, E>,
  register: Register<S, C, E>,
  db: IDBDatabase,
  site: Site,
): Promise<{ state: S; revision: number }> {
  let state = register.initialState(site);
  let revision = 0;
  for (const step of c.script) {
    const decided = register.run(state, step.command, step.on);
    if (!decided.ok) throw new Error(`The script command ${step.command.type} was refused: ${JSON.stringify(decided.error)}`);
    const result = await commit(db, {
      siteId: site.id,
      expectedRevision: revision,
      opId: mintId(),
      commands: [step.command],
      events: decided.value,
      now: fixedClock(FIXED_NOW),
    });
    if (!result.ok) throw new Error(`The script commit failed: ${JSON.stringify(result.error)}`);
    revision = result.revision;
    state = decided.value.reduce((s, draft) => c.adapter.apply(s, draft.event), state);
  }
  return { state, revision };
}

function stateOnly<S, C extends { type: string }, E extends { type: string }>(
  c: ConformanceCase<S, C, E>,
  register: Register<S, C, E>,
  site: Site,
): S {
  let state = register.initialState(site);
  for (const step of c.script) {
    const decided = register.run(state, step.command, step.on);
    if (!decided.ok) throw new Error(`The script command ${step.command.type} was refused: ${JSON.stringify(decided.error)}`);
    state = decided.value.reduce((s, draft: DraftEvent<E>) => c.adapter.apply(s, draft.event), state);
  }
  return state;
}

/** The checks for one adapter, in a fixed order. */
export function conformanceChecks<S, C extends { type: string }, E extends { type: string }>(
  c: ConformanceCase<S, C, E>,
): Check[] {
  return [
    {
      name: "replays from the database to the state in memory",
      async run() {
        const register = registerOf(c);
        const db = await openDb();
        const site = newSite(c.adapter.kind, "Conformance");
        await saveNewSite(db, site);
        const { state, revision } = await playScript(c, register, db, site);
        const stored = await readEvents(db, site.id);
        const replayed = register.replay(site, stored);
        if (!replayed.ok) throw new Error(`replay refused: ${JSON.stringify(replayed.error)}`);
        expect(replayed.value).toEqual(state);
        expect((await readSite(db, site.id))?.revision).toBe(revision);
        db.close();
      },
    },
    {
      name: "refuses a command it does not list, or an invalid one, and changes nothing",
      async run() {
        const register = registerOf(c);
        const site = newSite(c.adapter.kind, "Conformance");
        const state = stateOnly(c, register, site);
        const before = JSON.stringify(state);
        for (const refusal of c.refusals) {
          const result = register.run(deepFreeze(structuredClone(state)), refusal.command, c.asOf);
          if (result.ok) throw new Error(`${refusal.command.type} should be refused with ${refusal.code}`);
          expect(result.error.code).toBe(refusal.code);
        }
        expect(JSON.stringify(state)).toBe(before);
      },
    },
    {
      name: "decide does not change the state it is given",
      async run() {
        const register = registerOf(c);
        const site = newSite(c.adapter.kind, "Conformance");
        let state = register.initialState(site);
        for (const step of c.script) {
          const frozen = deepFreeze(structuredClone(state));
          const before = JSON.stringify(frozen);
          const decided = register.run(frozen, step.command, step.on);
          expect(JSON.stringify(frozen)).toBe(before);
          if (!decided.ok) throw new Error(`The script command ${step.command.type} was refused`);
          state = decided.value.reduce((s, draft) => c.adapter.apply(s, draft.event), state);
        }
      },
    },
    {
      name: "gives the same answer to the same command",
      async run() {
        const register = registerOf(c);
        const site = newSite(c.adapter.kind, "Conformance");
        let state = register.initialState(site);
        for (const step of c.script) {
          const first = register.run(state, step.command, step.on);
          const second = register.run(state, step.command, step.on);
          expect(second).toEqual(first);
          if (!first.ok) throw new Error(`The script command ${step.command.type} was refused`);
          state = first.value.reduce((s, draft) => c.adapter.apply(s, draft.event), state);
        }
        for (const refusal of c.refusals) {
          expect(register.run(state, refusal.command, c.asOf)).toEqual(register.run(state, refusal.command, c.asOf));
        }
      },
    },
    {
      name: "keeps sites of another kind out of its library and refuses to open them",
      async run() {
        const register = registerOf(c);
        const db = await openDb();
        const own = newSite(c.adapter.kind, "Conformance");
        const other = newSite(c.otherKind, "Elsewhere");
        const practice = newSite(c.adapter.kind, "Practice", "walkthrough");
        for (const site of [own, other, practice]) await saveNewSite(db, site);
        const all = await listSites(db);
        expect(siteLibrary(all, { kind: c.adapter.kind, workspace: "own" }).map((s) => s.id)).toEqual([own.id]);
        expect(siteLibrary(all, { kind: c.otherKind, workspace: "own" }).map((s) => s.id)).toEqual([other.id]);
        expect(register.accepts(own).ok).toBe(true);
        const refused = register.accepts(other);
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.error.code).toBe("wrong_kind");
        db.close();
      },
    },
    {
      name: "a commit to one site never changes another site",
      async run() {
        const register = registerOf(c);
        const db = await openDb();
        const a = newSite(c.adapter.kind, "Site A");
        const b = newSite(c.adapter.kind, "Site B", "walkthrough");
        await saveNewSite(db, a);
        await saveNewSite(db, b);
        const before = JSON.stringify(await readSite(db, b.id));
        await playScript(c, register, db, a);
        expect(JSON.stringify(await readSite(db, b.id))).toBe(before);
        expect(await readEvents(db, b.id)).toEqual([]);
        expect((await readEvents(db, a.id)).length).toBeGreaterThan(0);
        db.close();
      },
    },
    {
      name: "builds a visitor file with a closed schema and no private string",
      async run() {
        const register = registerOf(c);
        const site = newSite(c.adapter.kind, "Conformance");
        const state = stateOnly(c, register, site);
        const file = c.adapter.project(state, "visitor", c.asOf);
        const parsed = c.parseVisitor(file);
        if (!parsed.ok) throw new Error(`The visitor file is not closed: ${JSON.stringify(parsed)}`);
        expect(scanForCanaries(file, c.canaries)).toEqual([]);
        expect(scanForCanaries(JSON.stringify(file), c.canaries)).toEqual([]);
      },
    },
    {
      name: "writes a repeated operation once",
      async run() {
        const register = registerOf(c);
        const db = await openDb();
        const site = newSite(c.adapter.kind, "Conformance");
        await saveNewSite(db, site);
        const first = c.script[0];
        if (first === undefined) throw new Error("The script is empty");
        const decided = register.run(register.initialState(site), first.command, first.on);
        if (!decided.ok) throw new Error("The first script command was refused");
        const batch = {
          siteId: site.id,
          expectedRevision: 0,
          opId: mintId(),
          commands: [first.command],
          events: decided.value,
          now: fixedClock(FIXED_NOW),
        };
        const [one, two] = await Promise.all([commit(db, batch), commit(db, batch)]);
        expect(one.ok && two.ok).toBe(true);
        expect([one, two].map((r) => r.ok && r.replayed).sort()).toEqual([false, true]);
        expect((await readEvents(db, site.id)).length).toBe(decided.value.length);
        expect((await readSite(db, site.id))?.revision).toBe(1);
        db.close();
      },
    },
    {
      name: "refuses a stale commit and writes nothing",
      async run() {
        const register = registerOf(c);
        const db = await openDb();
        const site = newSite(c.adapter.kind, "Conformance");
        await saveNewSite(db, site);
        const first = c.script[0];
        if (first === undefined) throw new Error("The script is empty");
        const decided = register.run(register.initialState(site), first.command, first.on);
        if (!decided.ok) throw new Error("The first script command was refused");
        const make = () => ({
          siteId: site.id,
          expectedRevision: 0,
          opId: mintId(),
          commands: [first.command],
          events: decided.value,
          now: fixedClock(FIXED_NOW),
        });
        expect((await commit(db, make())).ok).toBe(true);
        const stale = await commit(db, make());
        expect(stale).toMatchObject({ ok: false, error: { code: "stale_revision", current: 1 } });
        expect((await readEvents(db, site.id)).length).toBe(decided.value.length);
        db.close();
      },
    },
  ];
}

/** Register one test for each check, under the adapter's name. */
export function runConformance<S, C extends { type: string }, E extends { type: string }>(
  c: ConformanceCase<S, C, E>,
): void {
  describe(`conformance: ${c.name}`, () => {
    for (const check of conformanceChecks(c)) it(check.name, () => check.run());
  });
}

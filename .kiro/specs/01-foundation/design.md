# 01 Foundation: design

This design says how spec 01 builds what spec 00 fixed. Names in `code` are files or exports. Where this design adds detail to spec 00, it says so.

## G1 Files and what each owns

Every production file below has a test listed in `tasks.md`.

| File | Owns | Layer |
|---|---|---|
| `template/src/types.ts` | Private record types, `Result`, `DomainError`, `FieldError`, `CoreState`, `Claim`, `Plot`, `Space`, `Site` | pure |
| `template/src/limits.ts` | D12 constants, `checkLimit`, `checkText`, `checkCoordinate`, `checkGridSize` | pure |
| `template/src/calendar.ts` | `LocalDate`, `PartialDate`, parsing, ordering, periods, half open intervals, zones | pure |
| `template/src/money.ts` | Minor unit parse and format, one charge ledger, balance, fee status. Added by this spec. It is kind neutral and spec 04 builds season and tenancy rules on it | pure |
| `template/src/queue.ts` | Queue order `(joinedOn, sequence, applicationId)`, next eligible | pure |
| `template/src/plot.ts` | Code rules, plot and space creation, rename, retire, archive guard | pure |
| `template/src/site.ts` | `mintId`, site creation, library, kind check, protected fields | pure |
| `template/src/status.ts` | Space and plot state at a date, totals, `overlappingClaims` (every claim on a space that shares a day with a span) | pure |
| `template/src/events.ts` | Stored and draft events, core events, `applyCore`, replay, canonical JSON, corrections, month totals, revision views | pure |
| `template/src/commands.ts` | Core commands, `validateCore`, `decideCore` | pure |
| `template/src/search.ts` | Ranked search over plot and record entries, scoped to one site | pure |
| `template/src/adapter.ts` | `RegisterAdapter`, `defineRegister`, `Register` | pure |
| `template/src/data/db.ts` | Open, store names, `storage_unavailable`, version change handling | IndexedDB |
| `template/src/data/migrate.ts` | Migration list, upgrade runner, version record | IndexedDB |
| `template/src/data/transaction.ts` | `saveNewSite`, `commit`, `readSite`, `readEvents`, `broadcastRevision`, `onRevision` | IndexedDB |
| `template/src/data/drafts.ts` | Draft store and recovery file | IndexedDB |
| `template/src/output/privacy.ts` | Visitor types and closed schemas, canary scan, private string check | public |
| `template/src/ui/copy.ts` | Foundation error text and labels. No React | ui |
| `scripts/lib/imports.mjs`, `imports.d.mts` | Comment stripping and import reading shared by two scripts, and its type declaration | tooling |
| `scripts/check-imports.mjs` | Import direction and kind word rules | tooling |
| `scripts/changed-tests.mjs` | Maps a path to its tests, runs them | tooling |
| `scripts/oracle.py` | Independent fees, queue order and tenure. Standard library only | tooling |

`template/package.json` and `template/README.md` are metadata. `template/src/ui/copy.ts` is the only `ui` file in this spec and imports no React.

Test helpers (`tests/helpers/`): `clock.ts` (fixed clock), `site.ts` (fixture builders from the hand totals), `failStorage.ts` (storage failure injection), `privacyCanaries.ts` (canary list), `property.ts` (seeded property runner), `marketAdapter.ts` (the tiny market adapter). The template never imports any of them.

## G2 Core state and claims

```ts
interface Claim {
  claimId: Uuid; spaceId: Uuid;
  mode: "taken" | "held" | "unusable";
  start?: LocalDate;          // absent: from before any known date
  endExclusive?: LocalDate;   // absent: open
  endable: boolean;           // false for a burial
  ref?: string;               // the app's own record ID, opaque here
  sourceRef?: string; reason?: string; voided?: boolean;
}
interface CoreState { siteId: Uuid; plots: Record<Uuid, Plot>; claims: Record<Uuid, Claim> }
```

An app maps its words to claims: a burial is `taken` and not endable, a tenancy is `taken` and endable, a reservation or offer is `held` and endable, "Mark unusable" is `unusable`. The core states D2 invariants over claims:

| Invariant | Enforced by |
|---|---|
| `INV_ONE_BURIAL_PER_SPACE`, `INV_ONE_TENURE` | No two `taken` claims overlap |
| `INV_ONE_ACTIVE_RESERVATION` | No two `held` claims overlap |
| `INV_NO_INFERRED_VACANCY` | A space is Free only if it is checked, not retired and no claim covers it. Checking comes from `spaces_confirmed_empty` or a `taken` claim |
| `INV_ID_STABLE`, `INV_CODE_UNIQUE` | Plot and space IDs are never rewritten. `priorCodes` only grows |
| `INV_APPEND_ONLY` | `apply` never edits an event. A void is `claim_voided` with `corrects` |

Overlap is a dry run over every claim of the space, including claims that start after the new one. The error carries the other claim's `sourceRef`, `start` and `endExclusive`.

**Core commands**, each with an ID minted by the caller:

| Command | Events |
|---|---|
| `add_plot {plotId, code, sectionId?, spaces: [{spaceId, label?}]}` | `plot_added` |
| `rename_plot {plotId, code}` | `plot_renamed` |
| `retire_space {plotId, spaceId}` | `space_retired` |
| `confirm_empty {spaceIds}` | `spaces_confirmed_empty` |
| `add_claim {claimId, spaceId, mode, start?, endExclusive?, endable, ref?, sourceRef?, reason?, converts?}` | `claim_added`, preceded by `claim_ended` when `converts` is given |
| `end_claim {claimId, reason}` | `claim_ended` at the effective date |
| `return_to_use {claimId}` | `claim_ended` for an `unusable` claim |
| `void_claim {claimId, correctsEventId, reason}` | `claim_voided` with `corrects` |

`effectiveOn` is passed to `decideCore` and stamped on every draft event. `add_claim` with no `start` uses no start. A burial with a partial date passes the first day of its covered interval as `start` and never a made up day.

## G3 Events

`DraftEvent<E>` is what `decide` returns: `{ event: E, entityIds, effectiveOn, sourceRef?, corrects?, payloadVersion }`. `E` is a flat object with a `type`. `commit` turns a draft into a `StoredEvent` of D6: the event minus `type` becomes `payload`, and `commit` adds `eventId`, `siteId`, `seq`, `opId` and `recordedAt`. `storedToEvent` reverses it, so replay from the database equals replay in memory.

Revision `r` is the state after the first `r` batches in `seq` order. A batch is the run of events that share an `opId`. `eventsAtRevision(events, r)` returns them.

`canonicalJson` sorts keys at every depth, drops `undefined` properties, writes no whitespace and throws on `NaN` or infinity. The batch hash is SHA 256 of the canonical JSON of the `commands` value (the list of commands the user confirmed, with the IDs the caller minted and no write times), taken before the transaction opens, because an IndexedDB transaction closes if it waits on anything but its own requests.

## G4 Commit

```ts
commit(db, { siteId, expectedRevision, opId, commands, events: DraftEvent[],
             uniqueKeys?: {key, owner, label?}[], indexes?: IndexWrite[], blobs?: BlobWrite[],
             now?: () => Date, newId?: () => string }): Promise<CommitResult>
type CommitResult =
  | { ok: true; revision: number; eventIds: string[]; replayed: boolean }
  | { ok: false; error: { code: "stale_revision" | "op_conflict" | "key_taken" | "storage_abort"
                         | "quota" | "over_limit" | "site_missing" | "empty_batch"; key?: string; label?: string; current?: number } }
```

Steps follow D6. The site row is `Site & { lastSeq: number }`. `seq` for the batch is `lastSeq + 1` onward. A batch with no events is refused as `empty_batch`. `current` carries the stored revision on `stale_revision`, for "Open latest". The function resolves on `tx.oncomplete`. Any expected abort calls `tx.abort()` and resolves a typed error after `onabort`, so no later request runs. A synchronous throw from a store call (quota) is caught, the transaction is aborted and the result is `quota` or `storage_abort`. `broadcastRevision` posts `{siteId, revision}` on a `BroadcastChannel` named `plotwarden.revisions` only after success.

`IndexWrite` is `{ name, key, value }`, stored under `[siteId, name, key]`. `BlobWrite` is `{ id, type, bytes }`, stored under `[siteId, id]`. Both are written in the same transaction as the events.

`openRegisterDb(factory, options?)` takes the `IDBFactory`, so tests pass a fresh `fake-indexeddb` instance. It returns `storage_unavailable` (no IndexedDB, or the browser refuses), `upgrade_failed` (a migration threw) or `schema_too_new` (the stored schema is newer than this code). `options.onVersionChange` runs after the connection closes itself on a `versionchange` event. `transact(db, stores, mode, body)` in `data/db.ts` runs a body in one transaction and resolves only on the `complete` event, so `commit` and the draft functions share one rule for "saved".

## G5 Migrations and drafts

`migrations` is a list of `{ version, up(db, tx) }`. Version 1 creates the nine stores. `runUpgrade` runs every migration above the old version inside the `onupgradeneeded` transaction. Throwing inside it aborts the upgrade, so the database stays at its old version. A test passes a longer list to prove 1 to 2 keeps data and a failing 2 leaves 1. Fixtures for released schemas arrive with spec 02.

A draft is `{ draftId, siteId, kind, baseRevision, rawRows, mapping, currentRow, commands, pageImageNeedsReselect, savedAt }`. `buildRecoveryFile(draft)` returns `{ filename: "register-recovery.json", text }` where text is canonical JSON of `{ format: "plot.draft.v1", ... }`. It holds the draft fields and no filename from the user.

## G6 Dates

`PartialDate` has the wire form of D4. `parseDateEntry(text, { order? })` accepts, after trimming:

| Entry | Result |
|---|---|
| empty, `unknown`, `date unknown` (any case) | `unknown` |
| `1874`, `1874-03`, `1874-03-03` | year, month, day |
| `March 1874`, `Mar 1874`, `3 March 1874` (English month names, any case) | month, day |
| `3/4/2026`, `03.04.2026`, `3-4-2026` with `order` `dmy` or `mdy` | day |
| the same without `order` | `date_ambiguous` |
| a two digit year in a slash, dot or dash form, with or without `order` (checked first) | `date_year_needed` |
| an impossible date | `invalid_date` |

Display names for months live in `calendar.ts` as data. The words "Date unknown" and the formatted strings live in `copy.ts`.

`coveredInterval(v)` returns the first and last day, or none for `unknown`. `localDateOf(instant, zone)` uses `Intl.DateTimeFormat` with the zone. `writeTime(date)` returns UTC with `+00:00`. The test clock is a function that returns a fixed `Date`.

Day counts use UTC arithmetic on year, month and day numbers, so a daylight saving change cannot move a date. The fixture uses `Europe/London`: the clocks went forward at 01:00 UTC on 2026-03-29 and back at 01:00 UTC on 2026-10-25.

## G7 Money and queue

Money is an integer in minor units. `parseMoney("36.00", "GBP")` gives `3600`. A blank string gives `undefined` (unknown, not zero). More than two decimals, signs, separators, symbols or a value over 99,999,999 are refused. `formatMoney(3600, "GBP")` is `GBP 36.00`.

A ledger is `{ charge, receipts: [{ amount, reversed }] }`. `receive` refuses an amount above the open balance with `exceeds_balance` and `detail.balance`. `reverseReceipt` refuses a second reversal of one receipt. Status at date `t` follows D5: balance 0 is `paid`. Otherwise `t > dueOn` is `overdue`, else any applied receipt gives `part_paid`, else `due`. With no due date the status is never `overdue`.

`orderQueue` sorts by `joinedOn`, then `sequence`, then `applicationId` and never mutates its input. `nextEligible` returns the first entry that is not pending.

## G8 Search

`search(records, siteId, query)` drops every record of another site, then ranks hits: 1 exact current code, 2 exact prior code, 3 exact source ref, 4 name. Folding is NFC, lower case, accents removed for matching only. A name matches when every word of the query appears in the folded name. Hits keep the original spelling and carry `recordId`, `source` and `date` so two people with one name stay apart. Ties break by folded code, display text and record ID. An empty query returns nothing.

## G9 Privacy split

`privacy.ts` defines `FamilyFile` and `AvailabilityFile` as the exact shapes of D9, with Zod schemas built with `.strict()` at every object. It imports `zod` and nothing else. The test imports private types and assigns them to visitor types under `// @ts-expect-error`, so `npm run typecheck` fails if the types ever become compatible. `scanForCanaries(value, canaries)` serialises with canonical JSON, and also scans keys, and returns each canary found. `flagPrivateStrings(text, known)` reports known private strings in a public label.

Committee types (`plot.review.v1`, `plot.slip.v1`) belong to spec 05 and its `exchange/` files.

## G10 Adapter and shell

`defineRegister(adapter)` in the pure layer returns the kind neutral part of the shell: `initialState(site)`, `replay(site, storedEvents)`, `run(state, command, effectiveOn)` and `accepts(site)`. The React shell (spec 02) wraps it. `run` checks the command name, then `validate`, then `decide`. `accepts` compares `site.kind` with `adapter.kind` and never reads the value.

`project` output is checked by the audience schema in `output/privacy.ts`. The conformance suite calls both, because `adapter.ts` may not import `output/`.

## G11 Import direction check

`scripts/check-imports.mjs --root <dir>` reads every `.ts`, `.tsx`, `.mjs` file under `template/`, `apps/`, `site/`, and the Desk names anywhere in the repo. It strips comments and reads `import`, `export from`, dynamic `import()` and `require`. Rules, each reported as `file -> target: rule`:

| Rule | Applies to | Forbidden |
|---|---|---|
| `template-no-outside` | `template/**` | `apps/`, `site/`, `tests/`, `tools/`, the Desk |
| `pure-layer` | `template/src/*.ts`, `template/src/map/**` | Importing `data/`, `ui/`, `output/`, `exchange/`, `react`, `react-dom`, or any package except `zod`. Using `indexedDB` or an `IDB` name |
| `data-layer` | `template/src/data/**` | `react`, `ui/`, `output/`, `exchange/`, `apps/` |
| `public-layer` | `template/src/output/**`, `template/src/exchange/**` | Any core module except `calendar`, `limits` and `map/*`. Any package except `zod` |
| `app-layer` | `apps/<app>/src/**` | Another app, `site/`, the Desk |
| `site-layer` | `site/src/**` | Apps, the Desk |
| `no-kind-word` | `template/src/**` code | The words `churchyard`, `allotment`, `market`, or `kind` compared with a non empty string literal (an empty string and the names `typeof` returns are allowed) |
| `no-desk` | whole repository | Importing a path or package that names the review desk |

`template/src/ui/**` may import everything in `template/` and React, and nothing in `apps/` or `site/`. The `market` word rule reads code only, not comments.

## G12 Oracle protocol

`scripts/oracle.py` reads one JSON object on standard input and writes one on standard output.

```
in:  { "cases": [ { "id": "c1", "kind": "queue_order" | "fee" | "tenure", ... } ] }
out: { "results": [ { "id": "c1", "value": ... } ] }
```

| Kind | Input | Output |
|---|---|---|
| `queue_order` | `entries: [{applicationId, joinedOn, sequence, pending?}]` | `{ order: [ids], next: id or null }` |
| `fee` | `charge`, `steps: [{op:"receive", amount} or {op:"reverse", receipt: n}]`, `dueOn?`, `asOf` | `{ balance, status, refused: [step indexes] }` where `n` counts accepted receipts from 0 |
| `tenure` | `tenancies: [{id, start, endExclusive?}]`, `date` | `{ covering: [ids], overlaps: [[id, id]] }` |

The script uses `datetime.date` and integer arithmetic. It was written from the worked examples in `hand-totals.md` and the rules in 00 design D5, not from the TypeScript. `tests/oracle/compare.test.ts` first checks the hand worked values, then 1,000 generated cases of each kind with a recorded seed.

## G13 Scripts

| Script | Behaviour |
|---|---|
| `typecheck` | `tsc --noEmit -p tsconfig.json` |
| `test:unit` and the other three | `vitest run tests/unit`, `tests/properties`, `tests/conformance`, `tests/oracle` |
| `test:browser` | `playwright test --pass-with-no-tests`, headless, one worker, two sizes. No tests exist until spec 03 |
| `check:imports` | `node scripts/check-imports.mjs` |
| `check:changed` | typecheck, then `check-imports`, then `node scripts/changed-tests.mjs --git` |
| `lint` | `eslint .` |
| `dev`, `preview` | Vite on `127.0.0.1`, ports 4173 and 4174, `strictPort` |

`build:apps`, `assemble:site`, `create:app` and `build:inspector` are named in the plan and belong to specs 03, 04 and 06. Their scripts are added with the files they run.

`changed-tests.mjs` reads a saved path from standard input (JSON with `path`, `file` or `filePath`, or a plain path), or paths from arguments, or `--git` for the working tree. It builds an import graph of `.ts` files, finds the `*.test.ts` files that reach the changed file, and runs them with Vitest. With no usable path it runs a fixed gate of `tests/unit/limits.test.ts` and `tests/unit/site.test.ts`. `--list` prints the files and runs nothing. `--root <dir>` points it at another folder. It prints the files it runs, then runs Vitest from `node_modules`, or from the file named in `PLOTWARDEN_TEST_RUNNER` (used by its test). Standard input is read for at most one second.

## G14 Error text

Codes map to text in `copy.ts`. Text from D6 is exact: "This register changed in another tab.", "This change was already saved with different details. Open latest to check it.", "Code {code} is already in {section}.", "This plot is already taken.", "Changes are still in this tab. Download a recovery file.", "This browser could not save the register.", "Use a valid date.", "A plot with an open commitment cannot be archived.", "Amount exceeds the balance of {amount}.", "Saved on this device.", "Saving changes…". Braces are filled by `fill(template, values)`, which inserts each value once as plain text.

# 01 Foundation: requirements

This spec builds the shared plot foundation in `template/` and the root tooling. It implements the parts of spec 00 that need no map, no import, no app and no screen: identity, plot codes, status, dates, limits, events, the commit transaction, the privacy type split, the adapter contract and the checks that guard them. It may add detail to spec 00. It may not contradict it.

Each requirement names the spec 00 requirements it implements and the T IDs that test it. T IDs and test files follow the ownership table in `00-contracts/tasks.md`. Rows marked "support" are extra files this spec lists so that every production file has a test.

Terms are those of spec 00. **Claim** is the foundation word for a dated hold on one space: `taken` (a burial or a tenancy), `held` (a reservation or an open offer) or `unusable`. Apps decide which of their records raise which claim. The template never knows the app word.

---

## F1 Root tooling

Tests: none of its own. Each command below is run in the exit gate. Owner: 01-foundation.

1. When `npm run typecheck` runs, it shall check `template/`, `tests/` and the config files with TypeScript and emit nothing.
2. When `npm run test:unit`, `test:properties`, `test:conformance` or `test:oracle` runs, it shall run only the Vitest files in `tests/unit`, `tests/properties`, `tests/conformance` or `tests/oracle`.
3. When `npm run check:imports` or `node scripts/check-imports.mjs` runs, it shall exit 0 on a clean tree and exit 1 with the importing file and the forbidden target on a violation (R14.2).
4. When `npm run check:changed` runs, it shall run typecheck, the import check and the tests for files changed in the working tree, and use no network (R25.3).
5. When a Vite dev or preview server is configured, it shall bind `127.0.0.1` with a strict port. The development port is 4173 and the preview port is 4174.
6. When a package is added, it shall be pinned to an exact version. `@playwright/test` is pinned to 1.65.1. Browsers are not installed by any script.
7. When a text file is written, it shall be UTF-8 without a byte order mark and use LF line endings.

## F2 Types, identity and limits

Tests: T02, T32. Implements R1, R21, D12. Owner: 01-foundation.

1. When the register mints a private ID, it shall use a locally generated UUID that is not derived from a name, code, date or row position.
2. When any value in design section D12 is at its last legal value, `checkLimit` shall accept it. When it is one over, `checkLimit` shall reject it with the item name, the limit, the value and, when given, the plot code or row, and shall not change any state.
3. When a text value is measured against a character limit, the register shall count Unicode code points, not UTF-16 units.
4. When a coordinate is checked, the register shall accept only an integer from 0 to 10,000.
5. When a grid size is checked, the register shall accept 1 to 100 rows and 1 to 100 columns whose product fits in the remaining plot capacity, and reject any other size naming the item.

## F3 Dates and time

Tests: T21 (`calendar.test.ts`, `history.test.ts`). Implements R5, D5. Owner: 01-foundation.

1. When a date entry is parsed, the register shall store exactly one of `unknown`, `year`, `month` or `day` with the original text, and shall never fill a missing month or day.
2. When a date entry uses a day and month order such as `03/04/2026`, the register shall refuse it unless one order was chosen for the whole import, and shall refuse a two digit year. A refusal never guesses.
3. When a calendar date is checked, the register shall accept 29 February only in a leap year and reject every impossible date with the code `invalid_date`, shown as "Use a valid date."
4. When a partial date is sorted, the register shall order by earliest possible day, then day before month before year, then write order, with `unknown` last.
5. When a partial date is checked against a report period, the register shall answer `inside` only if every day it could mean is inside, `outside` if none is, and `incomplete` otherwise. `unknown` is always `incomplete`.
6. When an interval is half open `[start, endExclusive)`, the register shall treat the end day as outside it, and treat a missing start or end as unbounded.
7. When a write time is stored, the register shall store it in UTC with an offset. When an instant is shown as a local date, the register shall use the site zone, and a change of zone shall change only that display.
8. When days are counted across a daylight saving change, the register shall count calendar days, so a 23 hour or 25 hour day counts as one.

## F4 Sites and plots

Tests: T02, T16 (`plot.test.ts`). Implements R1, R2, R3, R11. Owner: 01-foundation.

1. When a site is created, the register shall bind it to one kind, one workspace (`own` or `walkthrough`), one lineage ID and one exchange key, all minted locally.
2. When a library lists sites, it shall list only sites of the asked kind and workspace, in a fixed order, so a garden never appears in the churchyard library and a walkthrough never appears among the keeper's own sites.
3. When a site of one kind is opened by a register of another kind, the register shall refuse it with the code `wrong_kind`.
4. When a protected field in design section D7 is edited, `checkProtectedEdit` shall refuse it and name the allowed route, or name no route where none exists. A currency edit is refused once a charge exists.
5. When a plot code is entered, the register shall accept 1 to 24 characters after trimming outer space, keep the case and leading zeros as typed, and compare the trimmed, case folded form for uniqueness against every current and prior code in the site.
6. When a plot is renamed, the register shall keep its plot ID and every space ID, add the old code to `priorCodes`, and keep that code reserved.
7. When a plot is created, the register shall give each space its own ID and accept the space count the adapter allows. A count outside the adapter range is refused.
8. When a space is active or referenced by any past claim, the register shall refuse to retire it. Only a checked space with no history may be retired.
9. When a plot with an open commitment is archived, the register shall refuse with "A plot with an open commitment cannot be archived."

## F5 Status and claims

Tests: T12. Implements R3, R8, R10, D8. Owner: 01-foundation.

1. When the state of a space is computed at a date, the register shall return Taken if a `taken` claim covers it, else Reserved if a `held` claim covers it, else Unusable if an `unusable` claim covers it, else Free. A voided claim covers nothing.
2. When a space is not checked, the register shall give it no physical state, and the plot shall be "Needs checking".
3. When a plot is summarised, the register shall give its primary mark in the order Taken, Reserved, Free, Unusable over its checked, non retired spaces, and the count of spaces in each state.
4. When site totals are computed, "Available spaces" shall count only checked free spaces and "Free plots" shall count only plots whose every active space is checked and free.
5. When a claim is added, the register shall check the whole timeline of that space, including later claims, and refuse an overlap with the code `space_taken` for two `taken` claims, `claim_overlap` otherwise, naming the other claim, its source ref and its dates.
6. When a `taken` claim is added to a space, the register shall mark only that space checked. When a `held` or `unusable` claim is added to an unchecked space, the register shall refuse it.
7. When a `taken` claim lands on a space held by an active `held` claim, the register shall refuse it unless the command names that held claim as converted, in which case the held claim ends on the start day in the same batch.
8. When a keeper ends a claim that cannot end (a burial), the register shall refuse it with the code `taken_needs_correction` and the route "Correct an entry". An ended claim needs a reason.
9. When "Confirm empty plots" runs, the register shall list exact space IDs and mark only those spaces checked, and refuse a space that is already checked. A space with any claim is already checked, so it is refused too.
10. When a generated layout creates spaces, they shall start unchecked and never count as free.

## F6 Events, commands and history

Tests: T21, T09 (replay). Implements R9, R10, D6. Owner: 01-foundation.

1. When `decideCore` runs, it shall return a typed error or an ordered list of draft events and perform no I/O and no random choice. Every ID it uses comes from the command.
2. When events are replayed from the start, the register shall produce a state deep equal to the state built one event at a time.
3. When a correction is recorded, it shall be a new event that names the corrected event in `corrects` and a reason. No earlier event changes.
4. When events are read in write order, their `seq` shall run 1, 2, 3 without a gap, and a gap or a second site shall be refused.
5. When month totals are built, they shall group effective events by `effectiveOn` and leave out any event that a later event corrects.
6. When a view is asked "as at revision r", the register shall replay the first r batches, and when asked "using current corrections" it shall replay all events. Both shall name their revision.
7. When values are hashed for an operation, the register shall serialise them as canonical JSON with sorted keys, no whitespace and no undefined values, and refuse a nonfinite number.

## F7 Local storage

Tests: T09. Implements R9, R21.3, D6. Owner: 01-foundation.

1. When the database opens, it shall hold the stores `sites, events, indexes, uniqueKeys, blobs, operations, drafts, imports, migrations` and record schema version 1 in `migrations`.
2. When storage is not available or refuses to open, the register shall return the code `storage_unavailable` and write nothing. When the stored schema is newer than the code it shall return `schema_too_new`, and when a migration throws it shall return `upgrade_failed`.
3. When a batch commits, one `readwrite` transaction over `sites, events, indexes, uniqueKeys, blobs, operations` shall compare the expected revision, reserve unique keys, write events, indexes and blobs, write the operation record and raise the revision by exactly one.
4. When the same operation ID arrives with the same batch hash, `commit` shall return the earlier result with `replayed: true` and write nothing. With a different hash it shall return `op_conflict` and write nothing.
5. When two commits use the same expected revision, one shall succeed and the other shall return `stale_revision` and write nothing.
6. When a unique key belongs to another entity, `commit` shall return `key_taken` naming the key and write nothing. A key owned by the same entity is accepted.
7. When a write fails or the transaction aborts, `commit` shall return `storage_abort`, or `quota` for a quota error, never report success, and leave every store as it was.
8. When `commit` reports success, it shall do so only after the transaction `complete` event, and only then notify other tabs of the new revision.
9. When a second connection holds an older schema version, the older connection shall close itself and call its handler, so the upgrade can proceed.
10. When an upgrade fails part way, the database shall stay at its old version with its old data.
11. When a batch would raise the event count over 100,000, `commit` shall return `over_limit` and write nothing.
12. When drafts are saved, they shall go to the `drafts` store, never change a revision or an event, and be listed, loaded and deleted by site. A recovery file shall be built from a draft with a fixed filename that holds no private value.

## F8 Privacy type split

Tests: T28 (types and canaries). Implements R15, R16, R22.2, D9. Owner: 01-foundation.

1. When visitor types are defined, they shall live in `template/src/output/privacy.ts`, which imports no private record type and no private module.
2. When a visitor object is parsed, the closed schema shall reject any unexpected key at every depth. A `plot.availability.v1` object shall have no person field.
3. When a private object is assigned to a visitor type, or a visitor object is assigned to a private type, the TypeScript check shall fail.
4. When bytes or objects are scanned for canaries, the scan shall report every canary found, in any key or value, at any depth.
5. When a public label or instruction is checked, the register shall flag a known private full name or contact string and offer no other change.

## F9 Adapter contract

Tests: T01. Implements R14, D1, D3. Owner: 01-foundation.

1. When `defineRegister(adapter)` runs with a valid adapter, it shall return a register that creates state, replays events, validates and decides commands, and opens only sites of the adapter kind.
2. When an adapter is invalid (empty kind, space range outside 1 to 12 or min above max, no commands, missing function), `defineRegister` shall refuse it with field errors.
3. When a command type is not in the adapter list, the register shall refuse it with `unknown_command` before it calls `decide`.
4. When a tiny market adapter runs on the unchanged template, it shall pass the same conformance suite as any adapter.
5. When any file under `template/` imports an app, `site/`, the Desk, a test helper, React from a pure file or IndexedDB from a pure file, `check-imports` shall fail with the file and the target.
6. When any file under `template/src` holds the words `churchyard`, `allotment` or `market` in code, or compares `kind` with a non empty string, `check-imports` shall fail. Comments are not code.
7. When `output/` or `exchange/` imports a core module other than `calendar`, `limits` or `map/*`, `check-imports` shall fail.

## F10 Independent checks

Tests: oracle comparison, properties, conformance. Implements R24. Owner: 01-foundation.

1. When fees, queue order or tenure at a date are tested, the expected values shall come from `scripts/oracle.py`, which uses only the Python standard library and is written from the worked examples in `tests/fixtures/expected/hand-totals.md`.
2. When the oracle disagrees with the TypeScript, `tests/oracle/compare.test.ts` shall fail naming the case.
3. When a property set runs, it shall run at least 1,000 generated cases with a recorded seed, and the test shall fail if fewer ran.
4. When a property fails, its seed shall be kept in `tests/properties/seeds.ts` beside the requirement it broke.
5. When the conformance suite runs, it shall test replay, kind isolation, closed projections, idempotent commit and stale commit against the adapter it is given. Import and restore are added to the suite by spec 02.

## F11 Copy for foundation errors

Tests: support (`tests/unit/foundationCopy.test.ts`). Implements R23.1, D6. Owner: 01-foundation.

1. When the foundation shows an error from design section D6, it shall use the exact text in that table, from `template/src/ui/copy.ts`.
2. When a catalog string is read, it shall contain no dash between words. The middle dot is the only separator.
3. When a catalog string has a brace value, the value shall be inserted as plain text, and a brace in the value shall not be read as a new field.
4. When a plot summary label is built, it shall read "Taken · 2 of 2 spaces used" for a plot with two spaces, both taken.

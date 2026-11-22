# 01 Foundation: tasks

Each task writes its test first, runs it and sees it fail on the missing behaviour, then writes the smallest complete code. A stub that compiles and throws "not implemented" counts as the skeleton. A missing module or a failed install does not count as red. Tick a task only when its tests pass and the adjacent tests still pass.

Run one test file with `npx vitest run <file>`. (`npm run test:unit -- <file>` also runs the rest of the folder, because the script already names `tests/unit`.)

Exit gate: `npm run typecheck`, `npm run test:unit`, `npm run test:properties`, `npm run test:conformance`, `npm run test:oracle` and `node scripts/check-imports.mjs` all exit 0.

## Tasks

- [x] 1.1 Root tooling. Files: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `.gitignore`, `.gitattributes`, `.editorconfig`, `THIRD_PARTY_NOTICES.md`, `template/package.json`, `template/README.md`. Requirements: F1. T IDs: none. Red command: none, because tooling has no behaviour to fail. It is proved by every command in tasks 1.2 to 1.17 running.
- [x] 1.2 Limits. Files: `template/src/types.ts`, `template/src/calendar.ts` (types only at this point), `template/src/limits.ts`. Requirements: F2. T IDs: T32. Red command: `npx vitest run tests/unit/limits.test.ts`. First red: the table is empty, so the last legal value of each D12 item is rejected.
- [x] 1.3 Calendar, partial and unknown dates, intervals, zones. Files: `template/src/calendar.ts`, `tests/helpers/clock.ts`. Requirements: F3. T IDs: T21. Red command: `npx vitest run tests/unit/calendar.test.ts`. First red: every function throws "not implemented", so `1874` cannot be read as a year, `03/04/26` is not refused and a day count across the clock change fails.
- [x] 1.4 Sites, plots, codes and protected fields. Files: `template/src/site.ts`, `template/src/plot.ts`. Requirements: F4. T IDs: T02, T16. Red commands: `npx vitest run tests/unit/site.test.ts tests/unit/plot.test.ts`. First red: no ID is minted, a garden is not kept out of the churchyard library, a rename keeps no prior code and a protected field edit is accepted.
- [x] 1.5 Events, replay, corrections and revision views. Files: `template/src/events.ts`, `tests/helpers/site.ts`. Requirements: F6.2 to F6.7. T IDs: T21, T09 (replay part). Red command: `npx vitest run tests/unit/history.test.ts`. First red: replay cannot build a state, a correction cannot be linked and a month total cannot leave out a corrected event.
- [x] 1.6 Status and claims. Files: `template/src/status.ts`. Requirements: F5.1 to F5.4. T IDs: T12. Red command: `npx vitest run tests/unit/status.test.ts`. First red: every state query throws, so no total matches `hand-totals.md`.
- [x] 1.7 Core commands. Files: `template/src/commands.ts`. Requirements: F4.6 to F4.8, F5.5 to F5.10, F6.1. T IDs: T12, T21 (backdated dry run). Red command: `npx vitest run tests/unit/commands.test.ts`. First red: no command returns events, so a second burial cannot be refused and "Mark free" on a burial cannot name its route.
- [x] 1.8 Search. Files: `template/src/search.ts`. Requirements: F4.5, F4.6, R2.4, R4.5, R6.2. T IDs: T16. Red command: `npx vitest run tests/unit/search.test.ts`. First red: search returns nothing, so a prior code, a namesake and the site scope cannot be checked.
- [x] 1.9 Queue and money. Files: `template/src/queue.ts`, `template/src/money.ts`. Requirements: F3.6 (intervals used by tenure), D5 fee status, R12.1. T IDs: inputs to the oracle (T17, T19, T20 belong to spec 04). Red commands: `npx vitest run tests/unit/money.test.ts tests/unit/orderQueue.test.ts`. First red: 36.00 less 12.00 does not leave 24.00, an overpayment is not refused and the queue has no order.
- [x] 1.10 Adapter contract and import direction. Files: `template/src/adapter.ts`, `scripts/lib/imports.mjs`, `scripts/lib/imports.d.mts`, `scripts/check-imports.mjs`, `tests/helpers/marketAdapter.ts`. Requirements: F9. T IDs: T01. Red command: `npx vitest run tests/unit/adapter.test.ts`. First red: `defineRegister` throws, so the market adapter cannot run on the shell, and a template file that imports an app or names a kind passes the check.
- [x] 1.11 Local database, migrations, commit, drafts. Files: `template/src/data/db.ts`, `template/src/data/migrate.ts`, `template/src/data/transaction.ts`, `template/src/data/drafts.ts`, `tests/helpers/failStorage.ts`. Requirements: F7. T IDs: T09. Red command: `npx vitest run tests/unit/storage.test.ts`. First red: nothing opens, so two commits on one revision, an injected abort and a repeated operation cannot be checked.
- [x] 1.12 Privacy type split. Files: `template/src/output/privacy.ts`, `tests/helpers/privacyCanaries.ts`. Requirements: F8. T IDs: T28 (types and canaries). Red command: `npx vitest run tests/unit/privacy.test.ts`. First red: the parsers throw, so an unknown key, a person field in an availability file and a canary cannot be checked. The compile time part (`@ts-expect-error`) is guarded by `npm run typecheck`.
- [x] 1.13 Foundation copy. Files: `template/src/ui/copy.ts`. Requirements: F11. T IDs: support. Red command: `npx vitest run tests/unit/foundationCopy.test.ts`. First red: the catalog is empty, so no D6 error text matches.
- [x] 1.14 Oracle harness. Files: `scripts/oracle.py`, `tests/oracle/compare.test.ts`, `tests/helpers/property.ts`, `tests/properties/seeds.ts`. Requirements: F10.1, F10.2. T IDs: oracle comparison for fees, queue order and tenure (their owner tests are T17, T19, T20 in spec 04). Red command: `npx vitest run tests/oracle/compare.test.ts`. First red: the stub oracle answers no case, so 3600 less 1200 less 2400 cannot be compared.
- [x] 1.15 Property tests. Files: `tests/properties/{history,queue,fees,privacy}.test.ts`. Requirements: F10.3, F10.4. T IDs: T21, T17, T20, T28 (property parts). Red command: none for the code, which already existed. Each file instead proves that its property catches a deliberate defect (a mutant that must fail) and that its generator reached the interesting cases.
- [x] 1.16 Conformance suite with a market adapter. Files: `tests/conformance/suite.ts`, `tests/conformance/adapter.test.ts`. Requirements: F9.4, F10.5. T IDs: T01, T34 (the unchanged template part only). Red command: `npx vitest run tests/conformance/adapter.test.ts`. First red: the suite has no checks, so no adapter is tested.
- [x] 1.17 Changed test scripts. Files: `scripts/changed-tests.mjs`, `tests/unit/changedTests.test.ts`. Requirements: F1.4, R25.3. T IDs: support. Red command: `npx vitest run tests/unit/changedTests.test.ts`. First red: the stub prints no test file for any path.
- [x] 1.18 Log. Files: `docs/kiro-log.md`. One row for each task above, with date, tool, spec and task, files, checks and results. T IDs: none.

## T ID coverage

| T ID | File | Task |
|---|---|---|
| T01 | `tests/unit/adapter.test.ts`, `tests/conformance/adapter.test.ts` | 1.10, 1.16 |
| T02 | `tests/unit/site.test.ts` | 1.4 |
| T09 | `tests/unit/storage.test.ts`, replay in `tests/unit/history.test.ts` | 1.5, 1.11 |
| T12 | `tests/unit/status.test.ts`, `tests/unit/commands.test.ts` | 1.6, 1.7 |
| T16 | `tests/unit/plot.test.ts`, `tests/unit/search.test.ts` | 1.4, 1.8 |
| T21 | `tests/unit/calendar.test.ts`, `tests/unit/history.test.ts` | 1.3, 1.5 |
| T28 (template part) | `tests/unit/privacy.test.ts`, `tests/properties/privacy.test.ts` | 1.12, 1.15 |
| T32 | `tests/unit/limits.test.ts` | 1.2 |
| Oracle | `tests/oracle/compare.test.ts` | 1.14 |
| Support | `tests/unit/money.test.ts`, `orderQueue.test.ts`, `foundationCopy.test.ts`, `changedTests.test.ts` | 1.9, 1.13, 1.17 |

T28 stays open in 06 for the full file and log scan. T34 stays open in 06 for the generator and the 240 cm rule.

## Left for later specs

- `npm run build:apps`, `assemble:site`, `create:app`, `build:inspector` and `check-release` scripts arrive with the files they run (specs 03, 04 and 06).
- The conformance suite gains import and restore checks in spec 02.
- Words for the error codes that spec 01 introduced beyond design D6 (for example `code_taken`, `space_unchecked`, `claim_overlap`, `wrong_kind`) go in the copy catalog with the screens that show them. `errorText` returns nothing for a code without an entry.
- `.kiro/steering/structure.md` lists the pure files without `money.ts`. The import check treats every file directly under `template/src` as pure, so `money.ts` is covered. Update the steering text in a change that is allowed to edit `.kiro/steering/`.

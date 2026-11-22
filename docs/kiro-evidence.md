# How Kiro built this

Kiro wrote the code and the tests of this repository, one spec task at a time, with the test first. This page says what Kiro was given, what it was told to do, and what the repository holds as proof. It claims only what the repository shows. `docs/kiro-log.md` has one row for each task, with the files, the first red result and the final green result.

The surface used was Kiro CLI. The log names it on every row. No other Kiro surface is claimed.

## Specs

Seven specs sit in `.kiro/specs/`, each with `requirements.md`, `design.md` and `tasks.md`:

| Spec | Covers |
|---|---|
| `00-contracts` | The rules that every part obeys: identity, plot codes, partial dates, events, queue order, fees, visitor and committee models, limits, local only. Each requirement has an ID (R1 and up) and names its tests (T01 to T36) |
| `01-foundation` | The template: calendar, status, events, search, queue, money, the adapter contract and the import check |
| `02-paper-and-map` | Local database, backup, CSV import, fast entry, photos, the map, the shared screens |
| `03-churchyard` | Burials, reservations, memorials, the family file, reports |
| `04-allotment` | Waiting list, offers, tenancies, fees, handovers, the availability file |
| `05-exchange` | The review file and the return slip |
| `06-access-and-release` | Preferences, practice registers, limits, the inspector and its power, the third use recipe, access and layout checks, the site, the offline cache, assembly and the release checks |

The Review Desk has its own spec, `review-desk`, in its own repository, with its own steering and one agent profile.

Each task row in a `tasks.md` names its files and its T IDs. A task is ticked only when its test passes. Unfinished work and untried parts are listed under "Not settled" in each tasks file.

## Steering

Six files in `.kiro/steering/` are read on every task:

| File | Rule it holds |
|---|---|
| `testing.md` | Tests first. Write the assertion, see it fail on the missing behaviour, write the smallest code, see it pass. A missing module or a failed install is not a red result. Never weaken a test. Expected totals come from `tests/fixtures/expected/hand-totals.md`, worked by hand before any code. Property tests run at least 1,000 cases with recorded seeds |
| `records.md` | Three models kept apart. Living people never appear in visitor output. Every change is an appended event. Never infer a date, a holder, consent or a merge |
| `structure.md` | Import direction, who owns which folder, exact versions only |
| `product.md` | What each part is for and the fixed product choices |
| `experience.md` | The layout numbers (16 px edge, 12 px gap, 44 px target, 12 px text), contrast, motion, keyboard and focus, and the rule on words |
| `evidence.md` | Claim only what was observed. Label how each result was produced |

The privacy rule in `records.md` is the one the tests check hardest. `tests/unit/privacy.test.ts` searches every public and committee file for invented private strings.

## Agent profiles

Two profiles are in `.kiro/agents/`:

- `register-builder`. It may read the repository and write to `template/`, `apps/`, `site/`, `tools/`, `scripts/`, `tests/`, `docs/`, `release/`, the specs and a short list of root files. It may run `npm run`, Vitest, `tsc` and Playwright tests. It is denied `git commit`, `push`, `reset`, `switch`, `checkout`, `branch` and `stash`, installing a browser, deleting a folder with `rm -rf` or `Remove-Item -Recurse`, `curl` and `Invoke-WebRequest`, web fetch and web search, and writing to `LICENSE` and to secrets. Its prompt says to name the files first, write the test first, see it fail on the missing behaviour and never weaken a test.
- `register-reviewer`. It can read, and call the three inspector tools. It cannot write a file or run a command.

The repository does not record which profile ran which task. The reviewer profile's use of the inspector tools through a real Kiro session was not tried (see spec 06, "Not settled").

## Hooks

Two command hooks are in `.kiro/hooks/`. Neither makes a model call:

| Hook | Trigger | Runs |
|---|---|---|
| `check-save.json` | After a `.ts` or `.tsx` file is saved | `node scripts/changed-tests.mjs`. It reads the saved path and runs the unit tests that import that file, directly or through other files. An unknown path runs a small fixed gate |
| `check-stop.json` | When a turn ends | `npm run check:changed`. It runs the type check, the import check and the tests of the files changed in the working tree |

What is shown: the two scripts exist and are tested (`tests/unit/changedTests.test.ts`, 23 cases), and `npm run check:changed` was run by hand (log row 1.17: 21 test files, 662 tests, all passed). What is not shown: this repository holds no record that either hook fired in a Kiro session.

## The inspector, an MCP server

`tools/inspector/` is a local server that speaks the Model Context Protocol on standard input and output. It has three tools, all on three invented in memory fixtures (`lantern-fold`, `thimble-beds`, `market-stalls`). It reads no file, opens no address and runs nothing from an argument:

| Tool | What it returns |
|---|---|
| `explain_plot` | The state of each space of a plot at a date, the counts and the ordered source events |
| `audit_projection` | The allowed key paths of a visitor or committee file, the counts, the canaries found, and whether a private only edit changes the output |
| `check_adapter` | Pass or fail on one fixed vector, with the mismatched field on a failure. For the market adapter it includes the width rule: a 240 cm stand fits a 250 cm stall and does not fit a 200 cm stall |

`npm run build:inspector` writes `dist/inspector/server.mjs`. `tests/unit/inspect.test.ts` (78 cases) starts that file as a process with an empty environment and talks to it over standard streams. `.kiro/settings/mcp.json` registers the server as `plot-inspector`. What is not shown: no tool was called from a real Kiro session.

## The power

`powers/plot-checks/` is a skills only power with one skill, `review-adapter`. It tells an agent to check a new adapter with the three inspector tools on the market fixture, and says the keeper's own records are never an input. It is not installed and was not activated, so no activation is claimed. The install command, after `npm run build:inspector`, is `kiro-cli powers install ./powers/plot-checks`.

## Tests that failed first

Each of these is in `docs/kiro-log.md`, with its task number.

1. **A real defect after a green run (task 1.11, T09, the local database).** All 47 new tests passed, and then the test runner reported two unhandled `AbortError` rejections. Writes queued before a failed write were not being listened to. The code was fixed so that every queued write is listened to, and the run ended with 48 of 48 and no unhandled error.
2. **Event IDs of a practice register (task 6.3, T30).** The first run of the new test failed 3 of 16. Two failures were real: two builds of a practice register from the same ID source gave different event IDs, because `commit` made its own random ones. `template/src/data/seed.ts` now passes its ID source on. One failure was a wrong count in the test, corrected from the plan and not from the output.
3. **A limit that nothing enforced (task 6.6, T32).** The new test failed 5 of 104. Three were expected codes that the test had wrong. Two were real: nothing enforced the 20,000 record limit of a site. Both apps now refuse the command that would make the 20,001st record, name the item and change nothing.
4. **Focus and the dialog (task 6.13, accessibility).** On the first run against the real screens 9 of 27 failed. Focus was lost after a register was created, and Tab left an open dialog. The shell now waits for the heading and focuses it, and the dialog wraps Tab. The ring colour was not changed to make a check pass.
5. **A reload offline showed the 404 page (task 6.18, T31).** The cache logic was written test first and failed 26 of 48 against a stub that throws "not implemented". In the browser, a reload of `/churchyard/#/r/<id>` with the network off then showed "Page not found", because the worker read the fragment as part of the address. A new case in `tests/unit/offline.test.ts` failed first ("expected undefined to deeply equal" the file route), then the worker was fixed and the case passed.
6. **A tan map in a printed sheet (task 6.20).** The browser spec printed the sample family file in print media and found a pixel colour that is not gray, the walks of the map. Two new unit cases in `tests/unit/visitor.test.ts` failed first, then the print rules of the two visitor files were given gray colours, and the browser spec passed.

## Property tests and the second model

`tests/properties/` holds seven files of property sets, with recorded seeds (`tests/properties/seeds.ts`), at least 1,000 cases each. The log shows how each was checked: a deliberate defect in the code (for example, the overpayment check removed, or the queue ordered by ID) made the set fail, and the defect was put back. `scripts/oracle.py` uses only the Python standard library and recomputes queue order, fees and tenure at a date from the written examples. `tests/oracle/` compares it with the TypeScript on 1,000 generated cases each.

## What this page does not show

- It does not show a comparison of Kiro with any other way of building this. None was run.
- It does not show how long anything took, or how many people used the result. No person has used the registers.
- It does not show which of Kiro's surfaces other than the command line were used. None is claimed.

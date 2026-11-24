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
| `testing.md` | Tests first. Write the assertion, see it fail on the missing behaviour, write the smallest code, see it pass. A missing module or a failed install is not a red result. Never weaken a test. Expected totals come from `tests/fixtures/expected/hand-totals.md`, worked out line by line before any code, not read from the code. Property tests run at least 1,000 cases with recorded seeds |
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

The repository does not record which profile ran which task. The reviewer profile itself was not used to call the inspector tools. The calls in "Live session record" came from the default agent of Kiro CLI.

## Hooks

Two command hooks are in `.kiro/hooks/`. Neither makes a model call:

| Hook | Trigger | Runs |
|---|---|---|
| `check-save.json` | After a `.ts` or `.tsx` file is saved | `node scripts/changed-tests.mjs`. It reads the saved path and runs the unit tests that import that file, directly or through other files. An unknown path runs a small fixed gate |
| `check-stop.json` | When a turn ends | `npm run check:changed`. It runs the type check, the import check and the tests of the files changed in the working tree |

What is shown: the two scripts exist and are tested (`tests/unit/changedTests.test.ts`, 32 cases), and `npm run check:changed` was run by hand (log row 1.17: 21 test files, 662 tests, all passed).

### What the hook log showed

Each run of `scripts/changed-tests.mjs` that runs tests appends one line to `.local/hook-log.jsonl` (spec 06 Z20). A line holds the time, the event name read from standard input, the saved path, the test files run, the pass and fail counts and the exit code. It holds no session ID, no account word and no path outside the repository. A run with nothing on standard input has the event `direct`, so a line with that event was not started by a hook. The file is not tracked, so these rows are a reading of it, not a file in the repository.

How the rows were produced: the agent saved `tests/unit/money.test.ts` with its file editing tool and did not run the script. The log file was read afterwards with a file read. Result: observed in the log. The hook output itself was not shown to the agent. The line is the only record.

| Step | Saved with | Time of line (UTC) | Event | Path | Passed | Failed | Exit |
|---|---|---|---|---|---|---|---|
| One expected value made wrong on purpose (`3600` to `3601`) | Editing tool | 2026-11-22 16:58:55 | `PostFileSave` | `tests/unit/money.test.ts` | 19 | 1 | 1 |
| Value put back | Editing tool | 2026-11-22 16:59:22 | `PostFileSave` | `tests/unit/money.test.ts` | 20 | 0 | 0 |
| Turn end | No save; the turn ended | 2026-11-22 17:01:05 | `Stop` | None (the changed files come from git) | 32 | 0 | 0 |

What this shows: `check-save` fired on a save made by the editing tool, ran the matching test file, and the log recorded a failing count and exit 1 for the wrong value and a clean line for the right one. A line for `tests/unit/changedTests.test.ts` with the same event, written earlier in the same session, was also seen. It was made by a save of that file and was not counted as a separate trial.

The turn end row was read from the log after that turn ended, and added then. It shows `check-stop` fired when the turn ended, ran the test file changed in that turn (`tests/unit/changedTests.test.ts`) and passed 32 of 32. The same log also holds lines with the event `direct`, from test runs started by hand. They are not hook runs. One machine and one session were used. The same script wrote the log and ran the tests, so the log shows what the script saw, not what Kiro sent beyond the event name.

## The inspector, an MCP server

`tools/inspector/` is a local server that speaks the Model Context Protocol on standard input and output. It has three tools, all on three invented in memory fixtures (`lantern-fold`, `thimble-beds`, `market-stalls`). It reads no file, opens no address and runs nothing from an argument:

| Tool | What it returns |
|---|---|
| `explain_plot` | The state of each space of a plot at a date, the counts and the ordered source events |
| `audit_projection` | The allowed key paths of a visitor or committee file, the counts, the canaries found, and whether a private only edit changes the output |
| `check_adapter` | Pass or fail on one fixed vector, with the mismatched field on a failure. For the market adapter it includes the width rule: a 240 cm stand fits a 250 cm stall and does not fit a 200 cm stall |

`npm run build:inspector` writes `dist/inspector/server.mjs`. `tests/unit/inspect.test.ts` (78 cases) starts that file as a process with an empty environment and talks to it over standard streams. `.kiro/settings/mcp.json` registers the server as `plot-inspector`. Its three tools were called from one Kiro CLI session, recorded in "Live session record" below.

## The power

`powers/plot-checks/` is a skills only power with one skill, `review-adapter`. It tells an agent to check a new adapter with the three inspector tools on the market fixture, and says the keeper's own records are never an input. The install command, after `npm run build:inspector`, is `kiro-cli powers install ./powers/plot-checks`. "Live session record" below says what was seen of the install and of the skill. No activation of the power is claimed.

## Tests that failed first

Each of these is in `docs/kiro-log.md`, with its task number.

1. **A real defect after a green run (task 1.11, T09, the local database).** All 47 new tests passed, and then the test runner reported two unhandled `AbortError` rejections. Writes queued before a failed write were not being listened to. The code was fixed so that every queued write is listened to, and the run ended with 48 of 48 and no unhandled error.
2. **Event IDs of a practice register (task 6.3, T30).** The first run of the new test failed 3 of 16. Two failures were real: two builds of a practice register from the same ID source gave different event IDs, because `commit` made its own random ones. `template/src/data/seed.ts` now passes its ID source on. One failure was a wrong count in the test, corrected from the plan and not from the output.
3. **A limit that nothing enforced (task 6.6, T32).** The new test failed 5 of 104. Three were expected codes that the test had wrong. Two were real: nothing enforced the 20,000 record limit of a site. Both apps now refuse the command that would make the 20,001st record, name the item and change nothing.
4. **Focus and the dialog (task 6.13, accessibility).** On the first run against the real screens 9 of 27 failed. Focus was lost after a register was created, and Tab left an open dialog. The shell now waits for the heading and focuses it, and the dialog wraps Tab. The ring colour was not changed to make a check pass.
5. **A reload offline showed the 404 page (task 6.18, T31).** The cache logic was written test first and failed 26 of 48 against a stub that throws "not implemented". In the browser, a reload of `/churchyard/#/r/<id>` with the network off then showed "Page not found", because the worker read the fragment as part of the address. A new case in `tests/unit/offline.test.ts` failed first ("expected undefined to deeply equal" the file route), then the worker was fixed and the case passed.
6. **A tan map in a printed sheet (task 6.20).** The browser spec printed the sample family file in print media and found a pixel colour that is not gray, the walks of the map. Two new unit cases in `tests/unit/visitor.test.ts` failed first, then the print rules of the two visitor files were given gray colours, and the browser spec passed.

7. **The banned word lists left the repository (task 6.24, Z19).** The scripts and tests that held lists of banned words were rewritten so that the lists live in a JSON file outside the repository, named by `PLOTWARDEN_BANNED_WORDS`. The new tests in `tests/unit/release.test.ts` use invented words written to a temporary file. Against a stub that throws "not implemented" and the old script, 33 of the 57 tests of the public text and `check:public` groups failed: the stub, the missing skip line, the ignored variable and the exempt files. One new test was then wrong: it scanned the test file itself with the placeholder list, and the placeholder words are in it. It was narrowed to the two scripts. After the code, `release.test.ts` passed 138 of 138. The first run with the real list found 40 findings. One of the words on the list is the word for the second list itself, so the spec text, the key names and the skip line could not use it, and the code was changed to name no list. The last findings were two words in the patterns of three copy tests, which were removed from those patterns. Those three tests no longer look for them. `check:public` with the list does, in every file.

8. **The visitor files and print in the new look (spec 07, tasks 7.23 to 7.29).** Two runs built this slice, and the first was stopped part way when the machine was turned off. Red in this run, each on its own, against the code of the last commit with the mends not yet written: the new unit cases failed 21 of 135 in `tests/unit/visitor.test.ts` (a stub `placeTab` that set the tab 8 px above its plot; no `namesToLegend`; one drawing; no print rules), and the new browser cases failed 9 of 9 on the old build (one drawing, a tab 64 px high in print, and the page 22 px in). One browser case was run again with the print rules taken out, and failed with "starts at the left edge of the title": expected within 1 px, received 22.2 px. The first run's red is not on record: no output of it is in the checkout. What can be shown is this. The tests that the first run wrote were run against an export of the last commit (`git archive`) and 30 of them failed there: 10 of 22 in `lookPrint.test.ts`, 3 of 34 in `lookTokens.test.ts` (the market values), and 9 and 8 in the two "in the look of" groups of `visitor.test.ts`. That shows they test something that was missing. It does not show that the first run saw them fail before it wrote the code. The browser cases of the first run (layout, release and market) were not run against the old code and have no red here. The table gives the rows of the final run.

   | Requirement | Command | Expected | Actual | Source | Result |
   |---|---|---|---|---|---|
   | L9.4 one legend | `npx vitest run tests/unit/visitor.test.ts` | the visitor drawing holds no sample and no row, a register print keeps its rows, each name once in the legend | 135 of 135 passed | `9f4dc27` and uncommitted changes | unit assertion |
   | L9.5, L9.6 the tab | the same, and `npx playwright test tests/browser/share-print.spec.ts` | the bottom edge of the tab within 2 px of the top of its plot, centred, or on the bottom edge when the top is blocked; clear of the walk band, the gate, the north arrow, names, plots and (for the whole map) other tabs | the unit cases passed on 5 plots with and without outlines, in both drawings. In the browser the gap read 0 to 0.01 px at 360, 1440, 1920 and in print, for the family file (top edge each time) and the plot seeker file (bottom edge at 360, top edge at the others) | the same | unit assertion and browser assertion |
   | L9.7 sizes | `npx playwright test tests/browser/share-print.spec.ts` | tab 20 to 26 px high, its code 13 to 15 px and bold, every word 11 to 15 px | tab 24.3, 23.97, 23.97 and 25.35 px high at 360, 1440, 1920 and print; code 14.17, 13.98, 13.98 and 14.79 px, weight 700; words 11.99 to 14.79 px over all four | the same | browser assertion |
   | L9.6 one code once | the same | each code shows once among the shown parts | 1 each, for the chosen plot and for the other plot of the seeker file | the same | browser assertion |
   | L10.4 printed layout | the same, print media at 794 px wide | left edges within 1 px, the date meets the right edge of the title row, the two columns share a top | all held for both files; the date and the title share a baseline within 1 px | the same | browser assertion |
   | Slice 4 gate | `npx playwright test` with the nine specs of the exit gate | exit 0 | the run that is kept: 524 passed, 10 skipped, 7.2 minutes. The run before it had 523 passed and 1 failed (`/visitor/family/` refresh: four font requests aborted by the reload while the machine was busy). That test alone passed 110 of 110 in five repeats. The first run of the gate had 8 failures, all in this slice's own pages: two `measureLayout` reads of text in a drawing that is not shown (the helper now skips a word that has no box), and `.plotg.on` counted in both drawings (now `:visible`) | the same | browser assertion |
   | L12 the Desk | `check:release`, `release.spec.ts` "is the preview the lock names" and "opens at full strength from its first frame" | the lock and the served preview agree; no animation, no transition, no opacity under one | `check-release: ok (all)`; both cases passed at both sizes. The lock names Desk revision `edeb3419030219c6c2af4fc98b72545309a593d0` | the same | browser assertion. The Desk's own tests ran in the Desk repository and are in `docs/kiro-log.md` |

   Not shown: a printed page (the browser makes a PDF and a picture in print media, and no dialog or paper was used); a frame between 340 and 600 px wide, where the narrow drawing is stretched up to 1.9 times (L9.8); a person using either file; a screen reader on the tab or the legend. The pictures are headless Chromium on one Windows machine.

## Property tests and the second model

`tests/properties/` holds seven files of property sets, with recorded seeds (`tests/properties/seeds.ts`), at least 1,000 cases each. The log shows how each was checked: a deliberate defect in the code (for example, the overpayment check removed, or the queue ordered by ID) made the set fail, and the defect was put back. `scripts/oracle.py` uses only the Python standard library and recomputes queue order, fees and tenure at a date from the written examples. `tests/oracle/` compares it with the TypeScript on 1,000 generated cases each.

## Live session record

One Kiro CLI session on 22 November 2026, in this checkout at revision `c643aaa`, with the changes of task 6.24 in the working tree and nothing committed. Each part says how its result was produced: a tool call, a command run, or a reading of files. No person other than the one who started the session took part.

### Hooks

`.kiro/hooks/check-save.json` runs `node scripts/changed-tests.mjs` after a save whose path matches `\.(ts|tsx)$`. `.kiro/hooks/check-stop.json` runs `npm run check:changed` when a turn ends.

**check-save, observed in the session.** The editing tool saved `tests/unit/release.test.ts` many times (its path matches). It also saved `scripts/check-public.mjs` and `scripts/lib/publicText.mjs` (`.mjs`, which the matcher does not cover) and `scripts/lib/publicText.d.mts` (it ends in `.mts`, which the matcher does not cover). The edits to `copy.test.ts`, `paperCopy.test.ts` and `siteCopy.test.ts`, and one batch edit of `release.test.ts`, were made by a shell command and not by a save of the editing tool. After every save of the editing tool, the result said only that the text was replaced or the file was created. None carried hook output: no `changed-tests: running` line, no test summary, no exit code. So no hook output was seen in this surface, and a run of `check-save` is not shown. That does not show that it did not run, because a hook may run and have its output kept from the agent.

The Kiro log files of the machine hold `ContextualHookInvoked` lines. They could not be tied to a save in this session, so they are not counted.

**check-stop, not observed.** The hook runs when the turn ends. This record was written before the turn ended, so nothing it printed, and no exit code of it, is in this record.

**The same commands run directly, as separate runs.** They are not the hook:

- The saved path sent as plain text on standard input, as the hook does it, to `node scripts/changed-tests.mjs`: exit 0, 1 test file run, 137 tests passed.
- `npm run check:changed`: exit 0. The type check was clean, `check-imports: ok`, 4 test files run, 469 tests passed.

### The inspector

`.kiro/settings/mcp.json` has `"disabled": false` for `plot-inspector`, and `dist/inspector/server.mjs` and `cli.mjs` exist. The three tools were offered to the session as tool calls and answered. The command line (`dist/inspector/cli.mjs`) was not needed and was not run. The review date is the fixed date of the fixtures, 2026-04-20. The `audience` argument takes `visitor` or `committee`. The family file is the visitor audience.

| Call | Arguments | Answer, in short |
|---|---|---|
| `explain_plot` | `fixtureId` `lantern-fold`, `plotCode` `Y07`, `asOf` `2026-04-20` | Primary state `taken`, `needsChecking` false. Counts: taken 2, free 0, reserved 0, unusable 0. Two spaces, each checked and taken. Eight source events, seq 8, 14, 27, 28, 29, 30, 39 and 40: `plot_added`, `shapes_set`, `claim_added`, `burial_recorded`, `claim_added`, `burial_recorded`, `reading_saved`, `note_added`. Hand totals say Y07 has 2 spaces and both are taken |
| `audit_projection` | `fixtureId` `lantern-fold`, `audience` `visitor` | Format `plot.family.v1`. 24 allowed key paths. The only key that holds a person is `burials[].name`. Counts: 1 burial, 1 plot, 1 path, 1 section. `canaryViolations` empty. `privateEditChangesOutput` false |
| `check_adapter` | `adapterId` `market`, `caseId` `width_rule` | `pass` true, `mismatches` empty |

### The power

- **Installed.** The list of installed powers in the Kiro user folder holds `plot-checks`. Its `plugin.json` and `skills/review-adapter/SKILL.md` have the same SHA-256 as the two files in `powers/plot-checks/`. The session did not install it, and what installed it is not recorded here. The sentences of the spec 06 tasks file and the log that said it was not installed were true when written and are now corrected.
- **Active in this session.** Not shown. No list of skills and no tool to start a skill was offered to the session, and `review-adapter` was not seen offered. What was done instead: `SKILL.md` was read, and its four steps were done by hand with the same tool calls. That is not the power starting itself.
- **What the four steps reported on the market example.**

| Step | Call | Answer |
|---|---|---|
| 1 | `check_adapter` `market` `width_rule` | Pass, no mismatch |
| 2 | `check_adapter` `market` `replay`, `refusal`, `visitor` | Each passes, no mismatch |
| 3 | `explain_plot` `market-stalls` `S2` `2026-04-20` | `reserved`, 1 space, checked. Events: `plot_added`, `spaces_confirmed_empty`, `frontage_set`, `claim_added`, `stall_reserved`. The frontage was set before the reservation |
| 4 | `audit_projection` `market-stalls` `visitor` | Format `plot.availability.v1`. 3 free plots, 0 paths, 1 section. `canaryViolations` empty. `privateEditChangesOutput` false. No allowed key names a person, a fee or a queue |
| 4 | `audit_projection` `market-stalls` `committee` | Format `plot.review.v1`. 0 issues. `canaryViolations` empty. `privateEditChangesOutput` false. Allowed keys: `asOf`, `format`, `issues`, `lineageId`, `revision`, `siteAlias`, `siteKey`, `siteKind` |

The `churchyard` and `allotment` adapters were not run in this session. A pass on these fixtures shows that the adapter keeps the rules on invented data. It does not show that a real register is safe.

## What this page does not show

- It does not show a comparison of Kiro with any other way of building this. None was run.
- It does not show how long anything took, or how many people used the result. No person has used the registers.
- It does not show which of Kiro's surfaces other than the command line were used. None is claimed.
- It does not show that the stop hook fired in a Kiro session, or that the power started itself. The save hook is shown by the hook log under "Hooks". See "Live session record".

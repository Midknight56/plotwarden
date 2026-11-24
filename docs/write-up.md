# How Plotwarden used Kiro: eight questions

This page answers eight questions about how Kiro was used to build Plotwarden. Each section says what was done and gives one effect that you can check in a file or in a row of the log.

Some facts come from the person who ran the sessions and not from a file in this repository: which profile ran which step, the Kiro Crew version, the run of a spec against a short prompt, and what was read on the live host. Each section says so where it uses one. A row of `docs/kiro-log.md` is named by the start of the text in its Spec and task column.


## Kiro IDE, CLI, Web, Crew

**Done.** Kiro CLI wrote and tested both repositories: this one, and the separate one that holds the Plotwarden Review Desk. The Tool column of every row of the log reads Kiro CLI. Kiro Crew 0.12.2 runs the Review Desk as an installed app. The Crew version comes from the person who ran it, and this repository holds no Crew log. The IDE and the web app were not used.

**Effect.** The two repositories were built apart and meet at one pinned copy. The Desk's new look was built and tested in the Desk repository (row "07-look 7.27, the Review Desk in its own repository"). This repository took it in as a copy of the Desk preview, held by [the lock file](../release/desk-preview.lock.json), which names the Desk version, its commit and the hash of each preview file. Assembly of the site stops, and writes nothing, if one byte of the preview differs.


## Custom agents

**Done.** `.kiro/agents/` holds two profiles. [`register-builder`](../.kiro/agents/register-builder.json) writes only in the folders of the project and may run npm scripts, Vitest, `tsc` and Playwright tests. It is denied `git commit`, `push`, `reset`, `switch`, `checkout`, `branch` and `stash`, installing a browser, `curl`, web fetch and web search. Its prompt says to name the files first, write the test first, see it fail on the missing behaviour and never weaken a test. [`register-reviewer`](../.kiro/agents/register-reviewer.json) is read only. It can read files and call the three inspector tools, and it cannot write a file or run a command. The Desk repository has a third profile, `desk-builder`, which is not in this repository.

Which profile ran which step comes from the person who ran the sessions. No file here records it, because the Tool column of the log names the surface and not the profile.

- `register-builder` ran the foundation, paper and map, churchyard, allotment, exchange (the register side), the repair after the review, access and release steps. It also ran the later tasks (map labels, hook proof, the full loop, the family map, the as at view, the paper book, first screens, true words and map setup) and spec 07, the look, in this repository.
- `register-reviewer` ran the review.
- `desk-builder` ran the repair of the Desk, and the Desk's new look in the Desk repository.
- The default agent ran the host step, the contracts, the Desk and the live session.

**Effect.** The review is the effect. The read only `register-reviewer` profile read the finished work and reported twelve findings, worst first. Its inspector tools were switched off on that run, so it read files and did not call `explain_plot`, `audit_projection` or `check_adapter`. Four of its findings are named here with the log row that repaired each one. Every repair began as a test that failed on the missing behaviour. The profile is in [the reviewer file](../.kiro/agents/register-reviewer.json).

1. A searched name was left in the address (finding 1). Row "07 repair: a search stays out of the address". The new churchyard test failed because the address held `?q=Quillmoss`. The search now lives in the history state and not in the address.
2. A burial with a year only or unknown date was refused on any space that was ever reserved or marked unusable (finding 2). Row "07 repair: slip, burial overlap, private names". A year only burial after a released reservation was refused as "space reserved", and 2 new tests failed.
3. The public name in a family file was not checked against living people (finding 3). Same row. An approved public name that held a holder, a contact or an unapproved name still built a file, and 2 of 3 new tests failed.
4. A slip whose fact version was above the open one read "Ready to check" (finding 7). Same row. A slip with fact version 99 read ready, and the new test failed. Two older checks, a shared vector and the property model, held that rule. The review found the rule wrong, so both were changed with it, and the log row says so.

The log holds repair rows for findings 1, 2, 3, 4, 5, 7 and 10 in this repository. Findings 6 and 8 concern the Desk. A Desk repair ran with `desk-builder` in the Desk repository, and this log does not say which findings it repaired.


## Agent hooks

**Done.** Two command hooks are in [`.kiro/hooks`](../.kiro/hooks). `check-save` runs `node scripts/changed-tests.mjs` after a `.ts` or `.tsx` file is saved. `check-stop` runs `npm run check:changed` when a turn ends. Neither makes a model call. Each run of the script appends one line to `.local/hook-log.jsonl`.

**Effect.** In a Kiro CLI session on 22 November 2026 the editing tool changed one expected value in `tests/unit/money.test.ts` on purpose, from 3600 to 3601. The hook log then held a `PostFileSave` line with 19 passed, 1 failed and exit 1. When the value was put back, the next line read 20 passed, 0 failed and exit 0. A `Stop` line at the end of the turn read 32 passed, 0 failed and exit 0. The rows are in [the hook log reading](kiro-evidence.md#what-the-hook-log-showed). This is a reading of the log file by the agent, not a browser assertion.


## Spec driven development

**Done.** Eight specs sit in [`.kiro/specs`](../.kiro/specs), numbered 00 to 07, each with `requirements.md`, `design.md` and `tasks.md`. A requirement names its tests, the design holds the invariant, and a task lists its files and is ticked only when its test passes. This page was also written spec first: requirement Z22 and task 6.30 of spec 06 came before the test that checks it.

Spec 07, the look, was built from a design handoff in slices, each slice with its tests first. The handoff is not in this repository, except four drawings kept byte for byte and listed in [the art origins](../assets/origins.md). Its log rows are:

- Values and two fonts: row "07-look 7.1 to 7.8". 11 of 24 token tests failed before any style changed.
- Buttons, fields, cards and the map drawing: row "07-look 7.9 to 7.14". 24 of 29 component tests failed before any style changed.
- Layouts and art, part one: row "07-look 7.15 to 7.19". 24 of 34 layout tests failed first.
- Layouts and art, part two: row "07-look 7.20 to 7.22". 41 of 43 screen tests failed first.
- The Review Desk's new look, built in the Desk repository: row "07-look 7.27, the Review Desk in its own repository".
- The family file, the plot seeker file and print: row "07-look 7.23 to 7.29". 21 of 135 visitor tests failed first. For slice 4 of spec 07 the red output of the first run is not on record, and the log row says so.

**Effect.** One feature was built twice from the same starting code with the same model: the field "Show the site as at" on the Site map and the Plot list of both registers, with a button "Back to today". The run was made by the person who runs the project on 23 November 2026, on a scratch copy that was never merged. Its record is row "02-paper-and-map 2.27 to 2.30 against a short prompt".

- The spec version is row "02-paper-and-map 2.27 to 2.30 the site as it was on a date". Its brief named the rules and the tests, and it wrote them into spec 02 first. It ran 23 minutes.
- The short version got one paragraph. It asked for the field, a start at today, an earlier date that shows each plot as it was, the button, and a report of what was tested. It ran 22 minutes with the default agent. It wrote unit tests first and saw them fail, wrote one browser test after the code, kept the old tests green, and still added its change to specs 01, 02 and 03.

Then the two browser test files of the spec version, `warden-family` and `secretary-season` as they were when the spec version was built (58 tests), were run on the short version. 54 passed and 4 failed. The 4 are the tests of the feature itself, at both sizes, and each stopped at its first check of it: on today's date the spec version shows no "Back to today" button, and the short version always shows it. The two versions also chose different words and keys: `asAt` against `on` in the address, and "Choose today or an earlier date." against "Use today or an earlier date." Both held that a burial known only by its year or month does not count as taken before it.

What it shows: the short prompt gave working code that kept the old tests green, but not the same product. The spec is where those choices were written down, so a test could hold them.


## Steering docs

**Done.** Six steering files are in [`.kiro/steering`](../.kiro/steering): `testing.md`, `records.md`, `structure.md`, `product.md`, `experience.md` and `evidence.md`. Four are always loaded. `structure.md` loads when a source file matches, and `evidence.md` loads when the work is about docs or results. `records.md` holds the rules that a partial date keeps its precision, that a blank amount is unknown, and that living people never appear in visitor output.

**Effect.** The short prompt in the comparison under Spec driven development said nothing about specs. The run still added its change to specs 01, 02 and 03, because the steering asks for a spec first. The rule that made the biggest difference in that run is in [`structure.md`](../.kiro/steering/structure.md): a production file is added only when its responsibility and its test are listed in the matching spec. This fact comes from the person who ran the comparison, and row "02-paper-and-map 2.27 to 2.30 against a short prompt" records it. Both versions also held that a burial known only by its year or month is not taken before it, which is the rule in `records.md`.


## MCP

**Done.** `tools/inspector/` is a local server that speaks the Model Context Protocol on standard input and output. It has three tools, `explain_plot`, `audit_projection` and `check_adapter`. They work on three invented in memory fixtures (`lantern-fold`, `thimble-beds` and `market-stalls`), read no file, open no address and run no command from an argument. [`.kiro/settings/mcp.json`](../.kiro/settings/mcp.json) registers it as `plot-inspector`. `npm run build:inspector` builds it, and `tests/unit/inspect.test.ts` starts the built file as a process and talks to it.

**Effect.** In one Kiro CLI session on 22 November 2026, `audit_projection` on `lantern-fold` for the visitor audience returned the format `plot.family.v1` with 24 allowed key paths. The only key that can hold a person is `burials[].name`. It found no canary string, and a change to private data alone did not change the output. `explain_plot` for plot Y07 on 2026-04-20 returned two spaces, both taken, which is what the hand worked totals say. One answer gave the whole list of allowed keys, so a reader could see at once that no other key names a person. The calls and answers are in [the live session record](kiro-evidence.md#live-session-record).


## Property based testing (PBT)

**Done.** `tests/properties/` holds seven files of property sets: allotment, exchange, fees, geometry, history, privacy and queue. Each set runs at least 1,000 generated cases from a seed written in [`seeds.ts`](../tests/properties/seeds.ts). They are ordinary test files with the `fast-check` library, written by Kiro CLI and run with Vitest. IDE test generation was not used. `scripts/oracle.py`, which uses only the Python standard library, recomputes queue order, fees and tenure, and `tests/oracle/` compares it with the TypeScript on 1,000 generated cases each. The sets check the invariants whose names start with `INV_` in `seeds.ts`, such as `INV_REPLAY`, `INV_QUEUE_ORDER`, `INV_BALANCE`, `INV_PUBLIC_CLOSED`, `INV_NO_LIVING_PUBLIC`, `INV_GEOM_OVERLAP`, `INV_ONE_TENURE` and `INV_EXCHANGE_CLOSED`. The last run recorded in the log passed 54 property tests in 7 files (row "07-look 7.23 to 7.29").

**Effect.** Every generated case passes on the code: `FAILING_SEEDS` in [`seeds.ts`](../tests/properties/seeds.ts) is empty. The exchange sets were checked with four deliberate defects in production code: the stale rule with `and` for `or`, the slip reader ignoring received actions, the issue shape left open, and the label check no longer folding case. Each of the four defects was caught by one property test, and each defect was put back and compared by hash. See row "05-exchange 5.14 property tests".


## Kiro powers

**Done.** [`powers/plot-checks/`](../powers/plot-checks) is a power with skills only and one skill, [`review-adapter`](../powers/plot-checks/skills/review-adapter/SKILL.md). It tells an agent to check an adapter in four steps with the three inspector tools on the invented market stall fixture. The power is installed on one machine, where its two files have the same SHA 256 as the two files here.

**Effect.** The four steps of the skill were done by hand, with the same tool calls, on `market-stalls` in one session, so no activation is claimed. `check_adapter` with `width_rule` passed with no mismatch. `explain_plot` for stall S2 on 2026-04-20 gave `reserved`, with the frontage set before the reservation. `audit_projection` for the visitor audience gave `plot.availability.v1`, 3 free plots, no key that names a person, a fee or a queue, and no canary. The answers are in [the power part of the evidence page](kiro-evidence.md#the-power).

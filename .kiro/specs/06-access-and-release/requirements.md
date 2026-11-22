# 06 Access and release: requirements

This spec covers what makes the two registers safe to put in front of a person: a full privacy scan, preferences, the practice registers, limits, the local inspector and its power, the third use recipe, the copy catalog, and the browser specs for entry, layout, access and recovery. It implements R22, R23, R24, R14.5 and R25.2 of spec 00 and may not contradict them.

It was built in two halves. Task 07b built the first half. Task 08 built the second: the hub and visitor landing pages in `site/`, the service worker and offline cache (T31), the release assembly and checks (T36), the browser specs `share-print.spec.ts` and `release.spec.ts`, and the public docs.

Terms. **Canary** is an invented private string that must never reach a public or committee file, a log, a key or a file name. **Fixture** is one of three invented in memory registers the inspector knows: `lantern-fold`, `thimble-beds`, `market-stalls`. **Resolved motion** is the motion the page runs after the system and the app setting are combined. **Practice register** is a walkthrough site in its own workspace.

Each requirement lists its T IDs and the requirements of spec 00 it implements. Expected values come from `tests/fixtures/expected/hand-totals.md` and from the plan's worked examples, never from program output.

---

## Z1 Full privacy scan

Tests: T28 (`tests/unit/privacy.test.ts`). Implements R15, R16, R22.2. Built now.

1. When a family file, an availability file, their printed documents, a review file and a return slip are built from Lantern Fold and Thimble Beds, the tests shall scan every byte of each for every canary of its fixture and find none. The approved name is allowed only in the family file.
2. When a visitor file or print document is built, its title, meta tags and file name shall hold only the kind, the public site title and a date. It shall hold no `generator` or `author` meta tag, no URL other than the SVG namespace, and no private value.
3. When the practice registers are seeded, the tests shall read every database name, store name, index name and primary key of the local database and every localStorage key, and find no canary and no private value in any of them.
4. When the data layer seeds, backs up, restores, builds a visitor file or builds a review file, it shall write nothing to `console`, and the tests shall record every call and find none.
5. When the source of `template/src` and `apps/*/src` is scanned, it shall hold no `console` call, no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, no `navigator.clipboard`, no `document.cookie`, and no `localStorage` key other than `plotwarden.settings`.
6. When a browser spec runs a flow, it shall record every request and every console message, and find no request beyond the app's own files and no canary in any message or address.
7. When a private backup is downloaded, its file name shall hold the kind and a date and no private value.

## Z2 Preferences

Tests: T29 (`tests/unit/preferences.test.ts`), browser `layout.spec.ts`, `entry-library.spec.ts`. Implements R23.3. Built now.

1. When the app setting is "Reduce motion", the page shall run no animation, whatever the system says. When the app setting is "Follow device motion", the page shall run no animation if the system asks for reduced motion and may animate otherwise. The app setting wins when it is set.
2. When motion is reduced, no animation, no transition and no smooth scroll shall run, and the mist shall be hidden. When contrast is high, the mist shall be hidden.
3. When a setting is saved, it shall be kept in one local storage key that holds only the three choices. When the stored value is missing, damaged or holds an unknown choice, the defaults shall apply for that choice.
4. When "Restart walkthrough" runs for one app, the settings, every own register and the practice register of the other app shall be unchanged. When one register is removed, every other register shall be unchanged.
5. When the system motion setting changes while the page is open, the page shall follow it at once if the app setting is "Follow device motion".

## Z3 Practice registers

Tests: T30 (`tests/unit/walkthrough.test.ts`), browser `entry-library.spec.ts`. Implements R24.1, R24.3. Built now.

1. When a practice register is built twice from the same ID source, its commands, events and write times shall be byte for byte equal. When it is built with two different ID sources, its codes, names, dates, counts and event types shall be equal.
2. When a practice register is restarted, its own store shall be rebuilt and no own register, no other practice register and no setting shall change.
3. When the practice registers are scanned, no text shall hold a placeholder word (`lorem`, `todo`, `tbd`, `xxx`, `placeholder`, `sample`, `undefined`, `null`, an unfilled `{brace}`), and every source ref and page ref shall be unique.
4. When the first screen of each app opens with no register, its title, prompt, one line for whom it is for, "Start a register", the practice choice and the note about invented places shall read exactly as the copy catalog says.
5. When a practice register is opened, its totals shall equal hand totals sections 1 and 2 and its first result line shall read exactly as the catalog says ("Mirel Quillmoss · Y07 · Yew Walk" and "B03 reserved for Tavi Bramblequill.").

## Z4 Offline cache

Tests: T31 (`tests/unit/offline.test.ts`). Implements R22.1, R22.3. Built in task 08.

1. When a keeper has loaded an app once and then goes offline, a fresh navigation to the app shall open it from a versioned cache of static files.
2. When a new version is published, the old and new shell files shall never mix. A page that is open shall say "A new version is ready. Save your work before reopening."
3. When the cache is read, it shall hold no record, no backup, no visitor file and no request that carried a private value.
4. When a downloaded visitor file is opened cold with the network off, it shall be readable and searchable.
5. When a page of the site is asked for with an address that has a fragment (`#/r/<id>`), the worker shall answer it as the page without the fragment, because a host never receives a fragment.
6. When a request has a query, a body method or a range, or is for another origin, a `blob:` address or a `data:` address, the worker shall leave it to the network and store nothing from it.

## Z5 Limits, the rest

Tests: T32 (`tests/unit/limits.test.ts`), browser `recovery.spec.ts`. Implements R21. Built now.

1. When a value of any D12 item that a command, a file or a store checks is at its last legal value, the register shall accept it. When it is one over, the register shall refuse it before commit, name the item and its code or row, and leave the saved counts and the revision as they were. This covers names, plot codes, source refs, notes, money, sections, spaces per churchyard plot, events per site, packet and slip sizes, issues, decisions, aliases and labels at the level of the command or the file, not only the constant.
2. When a 5,000 row CSV is previewed, nothing shall be written, and cancelling shall leave the revision and the counts unchanged.
3. When the reference machine runs a 200 row preview, a 200 row commit and a search over 2,000 plots, the tests shall time five warm runs and one cold run, and fail only if the worst value passes 2 s, 3 s and 200 ms.
4. When local storage refuses a write, the register shall say "This browser could not save the register.", keep what was typed, keep focus on a control that can retry, and never say "Saved on this device."

## Z6 The inspector

Tests: T33 (`tests/unit/inspect.test.ts`). Implements R25.2, R25.4. Built now.

1. When `explain_plot` is called with an enumerated `fixtureId`, an existing `plotCode` and a real `asOf` date, it shall return the state of each space, the counts, and the ordered source event refs, and the values shall equal hand totals sections 1 and 2.
2. When `audit_projection` is called with an enumerated `fixtureId` and an `audience` of `visitor` or `committee`, it shall build that output from the fixture, return the allowed key paths, the counts, and the canaries found, and report whether a private only edit changes the output.
3. When `check_adapter` is called with an enumerated `adapterId` and `caseId`, it shall run one fixed vector and return pass or fail with, on a failure, the mismatched field and the reason.
4. When any argument is unknown, missing, too long, not a string where a string is expected, or holds a path, a drive letter, a URL or a shell word, the tool shall return a typed error (`unknown_argument`, `missing_argument`, `bad_argument`, `unknown_fixture`, `unknown_plot`, `bad_date`, `unknown_audience`, `unknown_adapter`, `unknown_case`) and read nothing.
5. When the server runs, it shall speak the Model Context Protocol on standard input and output only, list exactly the three tools, open no file other than itself, open no socket, start no process and read no environment value.
6. When `npm run build:inspector` runs, it shall write `dist/inspector/server.mjs` and `dist/inspector/cli.mjs` as single files that import only Node built in modules.
7. When the repository is checked, `.kiro/settings/mcp.json` shall still name one server, `plot-inspector`, with `node dist/inspector/server.mjs`. Turning it on is a person's step. The agent cannot write that file.

## Z7 The power

Tests: T33 support (`tests/unit/inspect.test.ts`). Implements R25.5. Built now.

1. When the power folder is read, `powers/plot-checks/plugin.json` shall use the Agent Plugins schema URL, the name `plot-checks`, the version `1.0.0`, the author "Adrian Ferguson", the description "Check plot rules and visitor fields." and the keywords `plot register`, `visitor fields`, `market stall`.
2. When the skill is read, `powers/plot-checks/skills/review-adapter/SKILL.md` shall have a name and a description in its header, call each of the three inspector tools by name, name the market fixture, and say that the keeper's own records are never an input.
3. When the power folder is listed, it shall hold no `mcp.json`, so there is one inspector registration only.
4. The power is not installed by this task. The install command is reported.

## Z8 The third use recipe

Tests: T34 (`tests/unit/scaffold.test.ts`), `tests/conformance/market.test.ts`. Implements R14.5, R14.7, R14.8. Built now.

1. When `npm run create:app -- --kind market --out <folder>` runs and the folder does not exist, it shall write a register app there with `index.html`, `package.json`, `vite.config.ts`, `src/main.tsx`, `src/adapter.ts`, `src/fields.ts`, `src/rules.ts`, `src/types.ts`, `src/copy.ts`, `src/Stalls.tsx`, `src/theme.css` and `fixture.json`, from the source in `examples/market/`.
2. When the folder exists, whether empty or not, or the path is a file, the script shall refuse, name the path, exit with code 2 and write nothing.
3. When the script is given an unknown kind, a missing `--out`, or an unknown flag, it shall exit with code 2 and write nothing.
4. When the script runs, the files under `template/` shall be byte for byte the same before and after, and so shall every file of `apps/`.
5. When a trader needs 240 cm, the market register shall accept a 250 cm stall. When a trader needs 240 cm and the stall is 200 cm, it shall refuse with "A 240 cm stand does not fit a 200 cm stall." and write nothing. A stall with no frontage recorded shall be refused with its own message, never read as wide enough.
6. When the unchanged conformance suite runs on the market adapter, it shall pass every check, including import, replay, isolation, privacy and restore.
7. When the generated app is built with Vite, the build shall succeed.
8. `docs/make-your-own.md` shall give the exact commands, in plain words, and say what the generated app does not have yet.

## Z9 Copy catalog

Tests: T35 (`tests/unit/copy.test.ts`). Implements R23.1, R31.12. Built now.

1. When every catalog is merged (shared, exchange, church, garden, market), no value shall hold a dash between words. An en dash, an em dash, or a hyphen with a space on both sides is a fault. A hyphen inside a word is allowed.
2. When any UI source is scanned, every `button`, `a`, `input`, `select`, `textarea`, `dialog` and `svg` shall have an accessible name from a catalog key, a label, or `aria-hidden`.
3. When every catalog is scanned, no value shall name a provider, a tool that built the app, or an assistant, and none shall say "powered by" or "built with".
4. When the shell's states (loading, empty, error, success, stale, cancelled) are listed, each shall have a catalog key, and no screen shall hold a literal word of its own.
5. When `assets/origins.md` is read, every file in `assets/` shall be listed in it with its origin, and it shall say no real grave, person or place is shown.

## Z10 Release

Tests: T36 (`tests/unit/release.test.ts`), browser `release.spec.ts`. Implements R22. Built in task 08.

1. When the site is assembled, a wrong Desk preview digest shall stop it.
2. When a direct route is reloaded on the static build, it shall not be blank.
3. When an app build is scanned, it shall hold no billing endpoint and no remote asset.
4. When `assemble:site` runs, it shall read `release/desk-preview.lock.json` and never write it. The lock is written by `lock:desk` alone, and not replaced without `--replace`.
5. When a page of the built site is checked, exactly one content policy shall match it, and it shall name no outside origin and allow no inline or eval script. The two sample visitor files shall carry the policy that they hold for themselves.
6. When the site is checked, it shall hold fewer than 500 files and under 5 MiB, and no folder or file that a host would run.
7. When the release is checked, every route of both registers shall have a phone proof picture, every page of the site a phone and a desktop picture, and each shall be a picture as wide as its viewport.
8. When the repository is checked, public text shall hold no dash between words, no name of a model or its maker, no word about entering or winning and no local path, every shipped package shall have its row in the notices, and every link of the README and `docs/` shall resolve.

## Z11 Browser: entry and library

Tests: `tests/browser/entry-library.spec.ts`, both apps, both sizes. Implements R23.5, R24.3. Built now.

1. When each app opens at its own address, its first screen shall show the title, one main action, the practice choice, and no horizontal scroll.
2. When a keeper starts a register, closes it, reopens it, changes a setting, opens About and Help, restarts the practice register and removes exactly one register, only the chosen register shall change, and Back and refresh shall keep the page.
3. When the address holds an unknown route, the page shall say "Page not found" and "Open registers" shall work, with focus on the heading.
4. When a register is removed, the typed site name shall be required and focus shall return to a sensible control.

The hub at `/` and the direct entry directories are covered by `release.spec.ts` (Z16).

## Z12 Browser: layout

Tests: `tests/browser/layout.spec.ts`, both apps, both sizes. Implements R23.2, R23.4, R23.6. Built now.

1. When any route, dialog or error of either app is shown in its practice register, the layout measures (16 px edge, 12 px gap, 44 by 44 px target, 12 px text, contrast, no sideways scroll, no covered target) shall pass with no exclusion.
2. When the page is shown at 200 percent zoom, long strings (a 100 character site name and long notes) and both motion modes, the same measures shall pass for the routes chosen in design Z12.
3. When each route is measured, the spec shall save a proof picture of the top and the bottom in `docs/acceptance/layout/`.
4. When motion is reduced by the system or the app, the spec shall read the computed style of the animated parts and find no animation, no transition and no smooth scroll.

## Z13 Browser: accessibility

Tests: `tests/browser/accessibility.spec.ts`, both apps, both sizes. Implements R23, R31.12. Built now.

1. When axe runs on each route of each app, it shall find no serious and no critical violation.
2. When the main paths are done with the keyboard alone (start a register, find a burial, record a burial, offer a plot, open settings, back up, committee review), each shall complete.
3. When a dialog opens, focus shall move into it, Tab shall stay in it, Escape shall close it, and focus shall return to its trigger.
4. When validation fails, focus shall move to the first invalid field. When a route changes, focus shall move to the page heading.
5. Screen reader use by a person is not claimed. The spec states which parts are checked by a browser assertion.

## Z14 Browser: recovery

Tests: `tests/browser/recovery.spec.ts`, both apps, both sizes. Implements R9, R21.3, R26.7, R28.1. Built now.

1. When two tabs hold one register and one saves, the other shall say "This register changed in another tab." and offer "Open latest". The first tab's saved count shall not change.
2. When storage refuses a write, the page shall say "This browser could not save the register." and not "Saved on this device.", keep the typed values, and keep the record count as it was after a reload.
3. When an import is cancelled, the register shall hold no new record.
4. When an invalid archive is chosen, the page shall say "This backup is incomplete. Your register is safe." and the register shall be as it was.
5. When a record is saved and the page is refreshed, the record shall be there.
6. During every flow, no request shall leave the app's own origin.

## Z15 Browser: share and print

Tests: `tests/browser/share-print.spec.ts`, both sizes. Built in task 08.

1. When the private report of each register and the two visitor print documents are taken from the register's print frame, each shall make a PDF whose page boxes are A4 or US Letter, as the Settings paper says, with no sideways overflow, and no script, link, form or address in the document.
2. When those documents are drawn in print media in a browser with coloured text smoothing off, no more than 0.05 percent of their pixels shall be a colour that is not a gray.
3. When a visitor print document and its PDF are searched for the private canaries of its fixture, none shall be found. The staff documents shall hold the keeper's own names and figures.
4. When a visitor file is downloaded from a register and opened from disk with the network off, it shall be readable and searchable, and shall make no request. It shall print to A4 and to Letter, and its PDF shall hold no canary.
5. A page on paper is not claimed. The document is checked as the PDF that the browser makes.

## Z16 Browser: release

Tests: `tests/browser/release.spec.ts`, both sizes. Built in task 08.

1. When each direct entry (`/`, `/churchyard/`, `/allotments/`, `/review/`, `/visitor/family/`, `/visitor/seeker/` and the two sample files) is opened and refreshed, it shall be a page with a heading, make no request beyond the site, have no failed request, no missing picture and no console error, and ask for no login.
2. When a folder is asked for without its slash it shall go to the folder. When an address is not a page it shall be the 404 page with the status 404, and lead back to the start.
3. When the hub, its About route, the 404 page and each visitor page are measured, the layout measures shall pass at both sizes, and a proof picture of each shall be saved in `docs/acceptance/layout/site/`.
4. When the headers of each page are read, there shall be one policy, with no outside origin.
5. When the service worker is in charge, its cache shall hold exactly the files of its manifest. Every page shall open with the network off, a register started offline shall be kept, and the cache shall hold nothing from it. When a new version is published, the page shall say so and both caches shall stay while the old page is open.

## Z18 The public docs

Tests: `tests/browser/judge-guide.spec.ts`, `check:links`, `check:public`. Built in task 08.

1. When `docs/judge-guide.md` is followed, each step shall work on the built site. The spec runs the steps.
2. When the README is read, its criteria block shall have the heading and the five criterion names of the plan, a "Check it" link for each, and clear placeholders for the live site and the film.
3. When `docs/kiro-evidence.md` and `docs/verification.md` are read, each claim shall be one that the repository shows. A result that was not observed shall be named as not observed.

## Z17 What the first runs of the browser specs found

Tests: `layout.spec.ts`, `accessibility.spec.ts`, `recovery.spec.ts`, `tests/unit/{sheet,limits}.test.ts`, `tests/unit/walkthrough.test.ts`. Built now. These requirements were written after the specs found the faults, and each fault was fixed in the app with the check kept.

1. When the page is 180 px wide, as a phone at 200 percent zoom, the menu buttons shall wrap, the main action shall not be wider than its row, and the page shall not scroll sideways.
2. When a map sheet is under 300 px wide and a section name, a path name or the gate name has no clear place on the drawing, the sheet shall write that name under the drawing, one to a line, and make itself taller by those lines. It shall never drop the name and never draw it on a line, an outline or another label. From 320 px up, every name stays in place.
3. When a page changes and its heading is not drawn yet, as after a register is created, the shell shall wait for the heading and focus it, unless the keeper has already moved focus into the page. A change of the query alone, such as `?new=1` going away, shall not end the wait.
4. When a dialog is open, Tab from its last control shall go to its first control, and Shift+Tab from its first shall go to its last.
5. When a save fails, whether for a full store or a refusal, the control that had focus shall have it again once it is enabled, unless something else has taken focus. A full store shall offer "Download backup" and "Continue in this tab" on every screen.
6. When the main menu and the links of a register are both landmarks, they shall have different names.
7. When a site holds 20,000 domain records, archived and voided ones included, the churchyard and the garden shall refuse a command that makes one more, name the item, and change nothing. The market example does not enforce this limit yet.
8. When a practice register is built twice from one ID source, its event IDs shall be equal too. The write time stays one fixed time.
9. When the ring of a focused control is measured, its contrast shall be taken against what is behind the ring. A ring drawn after a gap of `outline-offset` is behind the element, not on its fill.
---

## Not claimed

- No real person has used these screens. The checks here are browser assertions, unit tests and one person's review of pictures. A screen reader was not used.
- Only headless Chromium on one Windows machine was used. Firefox, WebKit and a real phone were not.
- A browser print dialog is not a printed page. Print is checked by the document handed to a hidden frame.

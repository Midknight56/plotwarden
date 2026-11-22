# 06 Access and release: design

This design says how spec 06 builds Z1 to Z16. Names in `code` are files or exports. Where it adds detail to a contract, it says so. Parts marked **next task** are listed so the contract is fixed, and are not built in task 07b.

## Z-D1 Files and what each owns

Every production file has a test listed in `tasks.md`.

| File | Owns | Test |
|---|---|---|
| `template/src/preferences.ts` | `Settings`, `DEFAULT_SETTINGS`, `SETTINGS_KEY`, `parseSettings`, `serializeSettings`, `resolveMotion`, `themeAttributes`. Pure | T29 |
| `template/src/ui/shellContext.ts` | Re-exports `Settings` and `DEFAULT_SETTINGS` from `preferences.ts` | T29 |
| `template/src/ui/RegisterShell.tsx` | Reads the system motion setting with `matchMedia`, sets the page attributes from `themeAttributes` | `layout.spec.ts` |
| `template/src/ui/register.css` | One rule set for resolved motion (`data-motion="reduce"`) and one for high contrast | `layout.spec.ts` |
| `tools/inspector/fixtures.ts` | The three enumerated fixtures built in memory, their canaries, and the fixed vectors. Pure, no I/O | T33 |
| `tools/inspector/inspect.ts` | `TOOLS`, `callTool`, the typed errors and the argument checks. Pure | T33 |
| `tools/inspector/server.ts` | The Model Context Protocol server on standard streams. `handleLine`, `serve` | T33 |
| `tools/inspector/cli.ts` | A command line over the same `callTool`, for people | T33 |
| `tools/inspector/vite.config.ts` | The build of `dist/inspector/server.mjs` and `cli.mjs` | T33 |
| `powers/plot-checks/plugin.json`, `powers/plot-checks/skills/review-adapter/SKILL.md` | The skills only power | T33 |
| `examples/market/*` | The market stall register: source of the third use recipe | T34 |
| `scripts/create-app.mjs`, `scripts/lib/scaffold.mjs` | The generator: arguments, refusal, copy with rewritten import paths | T34 |
| `docs/make-your-own.md` | The guide | T34 |
| `scripts/check-imports.mjs` | Gains one rule: `examples/<name>/src` imports only `template/` and its own folder | T01 |
| `tests/unit/{preferences,walkthrough,copy,scaffold,inspect}.test.ts`, `tests/unit/{privacy,limits}.test.ts` (extended), `tests/conformance/market.test.ts` | The red tests | |
| `tests/browser/{entry-library,layout,accessibility,recovery}.spec.ts`, `tests/helpers/{axe,routes}.ts` | The browser specs and their helpers | |
| `site/*`, `scripts/{build-sw,assemble-site,check-release,check-public,check-links}.mjs`, `tests/unit/{offline,release}.test.ts`, `tests/browser/{share-print,release}.spec.ts` | **Next task** | T31, T36 |

`check-imports` limits `template/src/*.ts` (core) to other core files and `zod`, so `preferences.ts` imports nothing. `tools/` and `examples/` may import `template/` and `apps/`. `tools/inspector` never imports `tests/`.

## Z-D2 Preferences (Z2)

```ts
interface Settings { motion: "follow" | "reduce"; contrast: "standard" | "high"; paper: "A4" | "Letter" }
resolveMotion(settings, systemReduces: boolean): "reduce" | "allow"
// "reduce" when the app says reduce, or the app says follow and the system asks for reduced motion.
themeAttributes(settings, systemReduces): { motion: "reduce" | "allow"; contrast: "standard" | "high"; mist: boolean }
// mist is false when motion resolves to reduce or contrast is high.
parseSettings(raw: string | null): Settings   // any damage falls back per choice
```

"The app setting wins when set" is read this way: the app has two choices. "Reduce motion" is a choice made by the keeper, so it holds whatever the system says. "Follow device motion" hands the choice to the system. The app has no "Allow motion" choice, so the app never overrides a system request for less motion.

The shell sets `data-motion` to the resolved value (`reduce` or `allow`) and keeps `data-motion-setting` as the stored choice. `register.css` and both theme files select on `data-motion="reduce"`, so the media query is read once, in script, and the CSS has one source of truth. The page listens to `matchMedia("(prefers-reduced-motion: reduce)")` so a change takes effect at once. The CSS also keeps a `@media (prefers-reduced-motion: reduce)` rule for `data-motion-setting="follow"`, so a page whose script has not run still honours the system.

The single local storage key `plotwarden.settings` holds only the three choices.

## Z-D3 The inspector (Z6, Z7)

### Fixtures

`fixtures.ts` builds each fixture by running its commands through the real adapter in memory. No database, no clock, no random value.

| `fixtureId` | Register | Commands from | As of | Canaries |
|---|---|---|---|---|
| `lantern-fold` | churchyard | `lanternFold.batches` in `apps/churchyard-register/src/walkthrough.ts` | 2026-04-20 | Visitor canaries of hand totals 1 |
| `thimble-beds` | allotment | `thimbleBeds.batches` | 2026-04-20 | Availability canaries of hand totals 5.5 |
| `market-stalls` | market | `examples/market/fixture.json` | 2026-04-20 | The trader names in the fixture |

IDs come from a counter, so every run gives the same bytes. The invented canary strings are kept in `fixtures.ts`. `inspect.test.ts` compares them with `tests/helpers/privacyCanaries.ts` and `gardenCanaries.ts` so they cannot drift.

### Tools

All three return `{ ok: true, value }` or `{ ok: false, error: { code, argument? } }`. The MCP layer puts `JSON.stringify` of the value in one text block and sets `isError` on a typed error.

`explain_plot({ fixtureId, plotCode, asOf })` returns:

```ts
{ fixtureId, plotCode, asOf, primary, needsChecking,
  counts: { free, reserved, taken, unusable },
  spaces: [{ spaceId: "space 1", checked, state }],
  sources: [{ seq, type, effectiveOn }] }   // events that name the plot or one of its spaces, by seq
```

`sources` holds only the event type, the position and the effective date. No payload and no private ID leave the tool. The plot code is matched with the foundation's code rule, so a prior code finds its plot.

`audit_projection({ fixtureId, audience })` builds the visitor file (`plot.family.v1` for the churchyard, `plot.availability.v1` for the garden and the market) or the committee facts, and returns:

```ts
{ fixtureId, audience, format, allowedKeys: string[],   // sorted key paths, array indexes written as []
  counts: { items: number, ... }, canaryViolations: string[],
  privateEditChangesOutput: boolean }
```

`privateEditChangesOutput` is the Z6.2 check: the tool applies one private only command (`add_note` on a plot) to a copy of the fixture, builds the output again with the same counter IDs, and compares the two outputs. It must be `false`. For the committee audience the output is the review facts.

`check_adapter({ adapterId, caseId })` runs one vector. Adapters: `churchyard`, `allotment`, `market`. Cases:

| `caseId` | Check | Fields compared on a failure |
|---|---|---|
| `replay` | The fixture script, played with stored event shapes, replays to the state in memory | `state` |
| `refusal` | Each fixed bad command gives its expected code and leaves the state as it was | `code`, `state` |
| `visitor` | The visitor file parses with the closed schema and holds no canary | `schema`, `canary` |
| `width_rule` (market only) | 240 cm needed: 250 cm stall accepted, 200 cm stall refused with `stall_too_narrow` naming both widths | `code`, `needed`, `frontage` |

Refusal vectors are typed in `fixtures.ts` from the existing unit tests of each app and compared by `inspect.test.ts` with values it types itself.

### Argument checks

`callTool` accepts only an object. Every key must be one of the tool's keys (`unknown_argument`). Every key must be present (`missing_argument`) and a string of at most 64 characters (`bad_argument`). A value that holds `/`, `\`, `:`, `..`, `%`, a space, a control character or a shell metacharacter is `bad_argument` before any lookup. Then the value is looked up in the enumerated list (`unknown_fixture`, `unknown_adapter`, `unknown_case`, `unknown_audience`, `unknown_plot`). A date must be `YYYY-MM-DD` and a real calendar date (`bad_date`).

### Server

Newline delimited JSON-RPC 2.0 on standard input and output, as the Model Context Protocol stdio transport defines.

| Request | Answer |
|---|---|
| `initialize` | `protocolVersion` (the client's when supported, else the newest supported), `capabilities: { tools: {} }`, `serverInfo: { name: "plot-inspector", version }` |
| `notifications/initialized` | no answer |
| `ping` | `{}` |
| `tools/list` | the three tools with `inputSchema` (`additionalProperties: false`) |
| `tools/call` | the tool result |
| anything else | error `-32601` |
| a line that is not JSON | error `-32700`, id null |

Standard error carries nothing. The server reads no environment value, opens no file and no socket, and starts no process. `server.ts` imports only `./inspect` and Node's `node:readline` and `node:process`. `inspect.test.ts` scans `tools/inspector/*.ts` for any other `node:` import, `fetch`, `process.env` and `eval`.

### Build

`vite build --config tools/inspector/vite.config.ts`: SSR build, target `node24`, entries `server` and `cli`, output `dist/inspector/[name].mjs`, `ssr.noExternal: true` so zod and the template are inside the file. `npm run build:inspector` runs it. The only bare imports left in the output are `node:` modules. `dist/` is already ignored by git.

`.kiro/settings/mcp.json` is untouched. The reviewer profile already lists the three tools.

### The power

`plugin.json` follows the Agent Plugins format in use for Kiro powers: `$schema`, `name`, `version`, `description`, `author: { name }`, `keywords`, `license`. There is no `mcp.json` in the folder. The skill header holds `name: review-adapter` and a `description` that says when to use it. The body is a short method: build the market fixture with `check_adapter` case `width_rule`, call `explain_plot` on a stall, call `audit_projection` for the visitor audience, and read the three answers before approving an adapter. It says the keeper's own register is never an input.

Install command (reported, not run): `kiro-cli powers install ./powers/plot-checks`, after `npm run build:inspector`.

## Z-D4 The third use recipe (Z8)

### Source

`examples/market/` is real source that the root `tsconfig.json` typechecks and the tests run:

| File | Holds |
|---|---|
| `src/types.ts` | `MarketState` (extends `BaseState` with `frontage: Record<plotId, number>` and `reservations`), commands, events, `MARKET_KIND = "market"` |
| `src/fields.ts` | Fields and the `Stalls` sheet: `Stall code`, `Frontage cm` |
| `src/rules.ts` | `decideMarket`, `validateMarket`, `applyMarket`. The width rule |
| `src/adapter.ts` | `marketAdapter`, `marketRegister`, the `Stalls` importer, `marketRecords` |
| `src/copy.ts` | `MARKET_COPY` |
| `src/Stalls.tsx` | A panel in the plot screen (`plotExtras`): set the frontage, reserve for a trader |
| `src/main.tsx` | The entry: `RegisterShell` with the adapter |
| `src/theme.css` | Ink `#2B2118` on `#F6EFE3` |
| `fixture.json` | Four stalls S1 to S4 (frontages 200, 250, 300 and none yet) and two invented traders |
| `index.html`, `package.json`, `vite.config.ts` | Page, package and build |

The market register is a third kind. No file under `template/` names it. The shared rules never branch on it.

### The width rule

Frontage and need are whole centimetres from 1 to 10,000.

| Case | Result |
|---|---|
| need 240, frontage 250 | stall reserved |
| need 240, frontage 240 | stall reserved (equal fits) |
| need 240, frontage 200 | `stall_too_narrow` with `needed: 240`, `frontage: 200`, message "A 240 cm stand does not fit a 200 cm stall." |
| need 240, no frontage recorded | `frontage_unknown`, message "Set the frontage of {code} first." |
| need 0, 1.5 or 10,001 | `invalid_input` on `neededCm` |

A reservation is a `held` claim that can end, through the core `add_claim`, so the status, history, backup and restore rules apply with no change.

### The generator

`node scripts/create-app.mjs --kind market --out <folder> [--template <folder>]`. `npm run create:app -- --kind market --out <folder>` calls it.

1. Check the arguments. An unknown flag, a missing value, an unknown kind or no `--out` exits 2 with a sentence on standard error and writes nothing.
2. Check the destination with `existsSync`. Any existing path, a file, an empty folder or a full one, exits 2. This is stricter than R14.8, which refuses only a folder that is not empty. A new folder is easy to ask for and cannot hide a mistake.
3. Read every file of `examples/market/` (a fixed list, not a directory walk).
4. Rewrite the import prefix `../../../template/` to the relative path from the new `src` folder to the template folder, in forward slashes. The `vite.config.ts` `repo` path is rewritten the same way. No other byte changes.
5. Create the folder and write the files, UTF-8, LF, no byte order mark.
6. Print the folder and the next commands. Write nothing under `template/` or `apps/`.

When the folder is inside the checkout at depth two (`.local/market`), no path changes. For another repository, the guide says to copy `template/` beside the app and pass `--template`.

### Checks

`scaffold.test.ts` hashes every file of `template/`, `apps/` and `examples/` before and after each run. It generates into `.local/scaffold-test-<n>/market` and removes only that folder. It checks refusal for an existing empty folder, a full folder and a file; the five argument errors; the file list; LF and no byte order mark; that the generated `adapter.ts` equals the source one after the path rewrite; and that `vite build` of the generated app exits 0. `market.test.ts` runs `runConformance` on the market adapter from `examples/market` with an import sheet and a script.

## Z-D5 Privacy scan (Z1)

New describe blocks in `privacy.test.ts`. The data comes from the real code paths in a fake database: `seedWalkthrough` for both apps, `buildFamilyFile`, `buildFamilyHtml`, `buildFamilyPrint`, `buildAvailabilityFile`, `buildAvailabilityHtml`, `buildAvailabilityPrint`, `planExchange` for the packet, `buildSlip`, and `exportBackup`.

| Scan | Subject | Expected |
|---|---|---|
| Bytes | Each public file, as text and as UTF-8 bytes | No canary of its fixture |
| Head | `<title>` and every `<meta>` of each HTML file | Kind, public title, date only. No `generator`, no `author` |
| URLs | Every `http`, `https`, `//` and `data:` in each HTML file | Only the SVG namespace |
| File names | `visitorFileName`, `availabilityFileName`, `reviewFileName`, `slipFileName`, the backup name | Kind and date only |
| Storage | `db.name`, store names, index names, every primary key, every localStorage key written by `saveSettings` | No canary, no person name |
| Logs | A recorder around `console.*` during the flows | Zero calls |
| Source | `scanSource` over `template/src` and `apps/*/src` | No `console`, no network API, no clipboard, no cookie, one local storage key |

The source scan uses the scanner of `scripts/lib/imports.mjs`, which blanks comments, so words in comments do not count. Strings in code do count.

## Z-D6 Practice registers (Z3)

`walkthrough.test.ts` builds each practice register with a counting ID source and checks:

1. Same counter, two builds: `JSON.stringify` of all stored events is equal.
2. Two different counters: sorted plot codes, event type sequence, totals and write times are equal.
3. Isolation: one database with an own church register, an own garden register, and both practice registers. After restarting one practice register, every other row, event and setting is equal by value.
4. Placeholders: every string in every command of both walkthroughs is checked against the placeholder pattern. Every source ref and page ref is unique. The counts equal hand totals 1 and 2.
5. First screen words: the `libraryPrompt`, `libraryWho`, `startRegister`, `openWalkthrough`, `restartWalkthrough`, `walkthroughNote` and result keys, typed in the test from the plan.

## Z-D7 Limits (Z5)

Added to `limits.test.ts`, with the registers built through the real adapters in a fake database.

| Item | Where the limit bites | Test |
|---|---|---|
| `nameChars`, `sourceRefChars`, `noteChars`, `plotCodeChars` | Core commands and church and garden commands | 100 and 101, 24 and 25, 4,000 and 4,001 code points. After the refusal the event count and the revision are unchanged |
| `sectionsPerSite` | Layout apply | 100 sections, then a 101st |
| `spacesPerChurchyardPlot` | Church `add_plot` and the adapter range | A plot with 12 spaces, then one with 13 |
| `eventsPerSite` | `commit` | A site row set to 99,999 events: one more event is accepted, the next batch is refused with `over_limit` and the revision is unchanged |
| `moneyMinorUnits` | Garden charge | 99,999,999 accepted, 100,000,000 refused |
| `reviewPacketBytes`, `reviewIssues`, `slipDecisions`, `siteAliasChars`, `reviewLabelChars` | Exchange builders and readers | Last legal value accepted, one over refused. Some already have tests in `exchange.test.ts`. This file keeps one table that names each item once |
| `csvDataRows` | Staging | A 5,000 row file stages and writes nothing. Cancel leaves the revision |
| `domainRecordsPerSite` | Not enforced by any command | See "Not settled" in `tasks.md` |

Resource measurement: a 200 row paper import preview, its commit, and a search over a 2,000 plot register, each timed with `performance.now()`, one cold run then five warm runs. The test records the worst value and fails only if it passes 2 s, 3 s or 200 ms. The device and runtime are named in the log row.

## Z-D8 Copy catalog (Z9)

`copy.test.ts` imports `COPY`, `CHURCH_COPY`, `ALLOT_COPY`, `MARKET_COPY` and the exchange catalog.

- **Dashes.** A value fails when it holds an en dash, an em dash, a spaced hyphen or a double hyphen. A hyphen inside a word is allowed.
- **Names.** For each `.tsx` file under `template/src/ui`, `apps/*/src` and `examples/market/src`, the test reads each opening tag of `button`, `a`, `input`, `select`, `textarea`, `dialog`, `svg` and `img`. It accepts a tag that has a text child, an `aria-label`, an `aria-labelledby`, a `label` prop, `aria-hidden`, or is a component (`Button`, `ButtonLink`, `TextField` and the others) that the test lists with the prop that names it.
- **Provider words.** No catalog value holds "powered by", "built with", "generated by", "assistant", "chatbot", "language model", "artificial intelligence", or the name of the tool the app was built with.
- **States.** The status phases of `Status.tsx` and the loading, empty, error, success, stale and cancelled keys each have a catalog entry.
- **Artwork.** Every file in `assets/` is named in `assets/origins.md`, and the ledger says no real grave, person or place is shown.

## Z-D9 Browser specs (Z11 to Z14)

All run at 360 by 640 and 1920 by 1080, headless Chromium, one worker, against the church server (4176) and the garden server (4178) that `playwright.config.ts` already starts. No window opens. No `playwright install`. Every flow records requests with `trackRequests`.

### Helpers

`tests/helpers/routes.ts` opens a practice register and returns its site ID and a plot ID read from the plot list links, so a spec can go to `#/r/<site>/<area>` directly. `tests/helpers/axe.ts` runs `@axe-core/playwright` (4.14.0 exactly) with all rules, returns serious and critical violations, and prints the rule, the node and the fix text.

### Routes enumerated

Library level: `#/`, `#/new`, `#/restore`, `#/settings`, `#/help`, `#/about`, an unknown route.

Register level for both apps: home, `map`, `map/edit`, `map/trace`, `list`, `plot/<id>`, `add`, `add/one`, `add/fast`, `add/import`, `exchange`, `backup`, `restore`, `settings`, `help`. Church adds `burial`, `reserve`, `unplaced`, `family`, `report`. Garden adds its own routes (`waiting`, `offer`, `tenancy`, `handover`, `season`, `payments`, `seeker`, `report`), read from the app's route table in `main.tsx`, not typed again.

Dialogs and errors: the fix row dialog of the import review, the remove register confirmation, an empty form submit, a refused command, the stale revision notice, the storage failure notice, an invalid backup, and the unknown route.

### Layout (Z12)

Every route, dialog and error runs `measureLayout`. Then:

- **200 percent.** The viewport is halved in each direction and the device scale factor is 2, which gives the same CSS pixel width a 200 percent zoom gives. The routes marked in the spec (home, map, plot, add/one, settings, exchange, a dialog) are measured, plus no horizontal scroll on every route.
- **Long strings.** A site name of 100 characters and a plot note of 4,000 characters are entered, and the home, plot and library are measured.
- **Motion.** `page.emulateMedia({ reducedMotion })` for `reduce` and `no-preference`, and the app setting set to each choice. The computed `animation-name` of the mist, `transition-duration` of every button and `scroll-behavior` of the root are read.
- **Proof pictures.** Top and bottom of each route, saved by the spec under `docs/acceptance/layout/<app>/`. The old pictures of spec 05 stay and are re-taken by their own specs.

### Accessibility (Z13)

`axe` runs on each route with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice`. The spec fails on `serious` and `critical`. Moderate and minor findings are printed and kept in the log row, not hidden. The keyboard paths use `page.keyboard` only (Tab, Shift+Tab, Enter, Space, Arrow, Escape) after the first `goto`. A helper `tabTo(page, name)` presses Tab until the focused element has that accessible name, and fails after 200 presses.

### Recovery (Z14)

- **Two tabs.** Two pages in one context. Page A saves a record. Page B shows the stale notice. "Open latest" shows the record. The saved count in storage, read through the page, is one.
- **Quota.** An init script wraps `IDBObjectStore.prototype.put` and `add` to throw `QuotaExceededError` when a flag is set. The page shows the failure message, never "Saved on this device.", keeps the typed value, and after a reload the record count is as it was.
- **Cancelled import.** Stage the 200 row file, press "Cancel import", and the register holds no burial.
- **Invalid archive.** A file with a zip header and no manifest shows "This backup is incomplete. Your register is safe." and the register is unchanged.
- **Refresh after save.** Save a record, reload, find it.

### Entry (Z11)

The flows are those of Z11. Each ends with a read of the library list, to prove that exactly one card changed.

## Z-D10 Next task: site, offline cache, release

Contract only.

- `site/` holds the hub at `/`, `src/{main,Home,VisitorLanding}.tsx`, `visitor/{family,seeker}/index.html`, `public/{_headers,404.html}`, `src/sw.ts`. Hash routes for inner screens. Direct entry directories `/churchyard/`, `/allotments/`, `/visitor/family/`, `/visitor/seeker/`.
- The service worker caches versioned static files only (T31). It never caches a response to a request that carried a body or a query, never a `blob:` or `data:` URL, and never anything under a path for records.
- `scripts/assemble-site.mjs` composes `dist/site/` from `dist/apps/` and a Desk preview directory after checking the digest in `release/desk-preview.lock.json` (T36). `check-release.mjs` fails on a wrong digest, a missing file, a billing endpoint or a remote asset.
- `share-print.spec.ts` and `release.spec.ts` follow the plan section 8.

## Z-D12 Repairs the browser specs found (Z17)

| Fault found | Where it was fixed | Check kept |
|---|---|---|
| Menu row, main action and map names did not fit 180 px | `register.css` (menu wraps under 336 px), `apps/allotment-register/src/theme.css` (`min-width: min(14rem, 100%)`), `template/src/map/sheet.ts` (`captioned`, names written under the drawing under 300 px) | `layout.spec.ts` at 200 percent, `sheet.test.ts` at widths 148 to 280 |
| Focus lost after a register is created | `RegisterShell.tsx`: the heading wait is keyed on the path, not on the query | `accessibility.spec.ts` keyboard paths |
| Tab left a dialog | `Dialog.tsx`: Tab and Shift+Tab wrap | `accessibility.spec.ts` dialog test, 25 presses each way |
| A full store showed no way on | `Status.tsx`: default "Download backup" (opens the backup screen) and "Continue in this tab" (puts the notice away) | `recovery.spec.ts` full store |
| Focus fell to the page after a failed save | `RegisterShell.tsx`: `run` gives focus back to the control that had it, if nothing else took it | `recovery.spec.ts` focus test |
| Two landmarks named "Registers menu" | `copyScreens.ts` `registerLinks`, both app homes | axe, notes only (moderate) |
| No limit on domain records | `limits.ts` `checkRecordRoom`, `rules.ts` of both apps, `messages.ts`, `copyScreens.ts` | `limits.test.ts` |
| Event IDs of a practice register were random | `seed.ts` passes its ID source to `commit` | `walkthrough.test.ts` |
| Focus ring compared with the fill of the control, not with what is behind it | `tests/helpers/measureLayout.ts` `focusRingContrast` | `accessibility.spec.ts` ring test |

The last row changes a measurement, not the app. The ring sits 2 px outside the control, past an `outline-offset`, so the page behind it is its background. A ring that must also reach 3 to 1 against a mid green fill cannot be made, and WCAG 1.4.11 asks for the colours next to the indicator. The ring colour was not changed.
## Z-D11 Evidence

Each task row in `docs/kiro-log.md` names its red run and its green run. The log holds no local absolute path. Browser results say headless Chromium on one Windows machine. Results from a unit test, a browser assertion and a person's review of a picture are labelled apart. No claim about users, speed on other machines or other browsers is made.

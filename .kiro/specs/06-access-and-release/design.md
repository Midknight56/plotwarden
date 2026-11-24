# 06 Access and release: design

This design says how spec 06 builds Z1 to Z18. Names in `code` are files or exports. Where it adds detail to a contract, it says so. The release half (Z-D10) was built in task 08.

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
| `site/*`, `scripts/{build-sw,build-visitor,lock-desk,assemble-site,check-release,check-public,check-licenses,check-links}.mjs`, `tests/unit/{offline,release,siteCopy}.test.ts`, `tests/browser/{share-print,release,judge-guide}.spec.ts` | Built in task 08. See Z-D10 | T31, T36 |

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
- **Provider words.** No catalog value holds "powered by", "built with", "generated by", "assistant", "chatbot", "artificial intelligence", or the name of the tool the app was built with.
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

## Z-D10 The site, the offline cache, the release (built in task 08)

### Files

| File | Owns | Test |
|---|---|---|
| `site/index.html`, `site/visitor/{family,seeker}/index.html` | Three pages that share one script. `data-page` on the body says which. The two visitor pages say which sample file they link to in `data-file` | `siteCopy.test.ts` |
| `site/src/{main,Home,VisitorLanding}.tsx`, `site/src/site.css`, `site/src/copy.ts` | The hub, the visitor landing pages, their words (the one catalog of the site) and their look. Hash routes `#/about` and an unknown hash that says "Page not found". The site imports nothing outside `site/` | `siteCopy.test.ts`, `release.spec.ts` |
| `site/src/swCore.ts` | The service worker's logic, pure: `readManifest`, `routeFor`, `install`, `activate`, `respond`. Takes the cache and the fetch as arguments | T31 `offline.test.ts` |
| `site/src/sw.ts` | The worker. No export, so it runs as a plain script. It reads `self.__PLOTWARDEN_SHELL`, which assembly puts at its head | `release.spec.ts` |
| `site/src/swRegister.ts`, `site/src/registerMain.ts` | `watchForUpdate`, `showUpdateNotice`, `registerShell`, and the entry that assembly adds to each page of the site's own as `/sw-register.js` | T31, `release.spec.ts` |
| `site/public/_headers`, `site/public/404.html` | The headers for the host and the 404 page. Copied as they are | `release.test.ts`, `release.spec.ts` |
| `site/vite.config.ts` | The build into `dist/apps/hub`: the three pages, `sw.js` and `sw-register.js` with fixed names | `release.spec.ts` |
| `tools/site/visitorFiles.ts`, `scripts/build-visitor.mjs` | The two sample visitor files, made by the registers' own builders from `lantern-fold` and `thimble-beds`, with counter IDs. The script bundles the module with Vite and writes `visitor/<kind>/<file>` | T36 |
| `tools/site/siteServer.ts`, root `vite.config.ts` | Dev (4173): maps the site's addresses onto the source folders. Preview (4174): serves `dist/site` as a static host does, with `_headers`, the folder redirect and the 404 page. It refuses to start when `dist/site` is not assembled. A second host style, `PLOTWARDEN_HOST_STYLE=pretty`, answers as the live host does (see "The two host styles") and is served on port 4182. `previewHandler` is exported so a unit test drives it with no server | `release.spec.ts`, `hostStyle.test.ts` |
| `scripts/lib/{files,desk,site,siteScan,headers,inventory,publicText}.mjs`, `scripts/{lock-desk,assemble-site,build-sw,check-release,check-public,check-licenses,check-links}.mjs` | The release scripts. Each takes `--root`, so a test runs it on a small tree | T36 |
| `release/desk-preview.lock.json` | The Desk name, version, git revision, the SHA-256 of each preview file and the packages the preview bundles | T36 |
| `tests/browser/{release,share-print,judge-guide}.spec.ts`, `tests/helpers/siteOrigin.ts` | Browser specs on the assembled site | |

### The cache

One version has one cache, named `plotwarden-shell-<version>`. The version is the first 16 hex characters of the SHA-256 of `<path>\0<sha256 of file>\n` for every file of the site in path order, except `sw.js` and `_headers`. The manifest lists those files.

- `install(caches, fetchFile, manifest, origin)` fetches each file with `cache: "reload"` and keeps it only if the answer is a plain 200. One failure deletes the cache of that version and fails the install.
- A redirected answer is taken in one case. The file is a page (`x/index.html` or `name.html`), the answer is a 200 that is not opaque, its final address (`response.url`) is on `origin`, has no query, and its path is exactly the clean address: `x/` for `x/index.html`, `name` for `name.html`. A host that serves each file at its own address never redirects, so that case is as it was. Every other redirect fails the install: another path, another origin, a final status other than 200, a redirect of a file that is not a page (a script or a style has no clean address), or a final address that cannot be read. The final address is all a script can read of a redirect chain, so a chain that leaves the origin and comes back to the clean address is not told apart. The host here sends one hop.
- The stored copy of a redirected answer is a new `Response` with the same body, status, status text and every header (so the content type and the content policy stay), and `redirected` false. A browser refuses to answer a page from a response that is marked as redirected. Before this change `install` refused every such answer, so the worker did not install on the live host. An answer that did not redirect is stored as it came.
- `activate` deletes every other `plotwarden-shell-` cache and leaves a cache that is not ours.
- `respond` answers a plain GET of this origin with no query and no range, for a path in the manifest, from the cache of its own version. A folder path is its `index.html`. A folder without its slash is a 308 to the folder. The clean address `name` of a shell file `name.html` is answered from that file, but only when the last part of the path is not `index`: `x/index` is not the clean address of anything, and `name.htm` is not one either, so both go to the network. A fragment is ignored, because a host never receives one. Anything else goes to the network and is never stored. A page that is not held, asked for offline, is the stored 404 page with the status 404.
- The worker never calls `skipWaiting` or `clients.claim`. A new worker installs, and waits until the pages of the old one close. `watchForUpdate` tells the page once, and the page shows "A new version is ready. Save your work before reopening." first in the body, in the normal flow.
- Z4.3 reads "no visitor file". The cache holds the two sample visitor files of the site, because they are static files of the site, invented and the same for everyone. It never holds a file that a keeper made.

### The two host styles

The preview server answers in one of two styles. `PLOTWARDEN_HOST_STYLE` is read once when the server starts. Unset, empty or `plain` is the plain style (port 4174). `pretty` is the style of the live host (port 4182). Any other value stops the server with a sentence that names it. Everything below is the same in both styles: the headers of `_headers`, the folder redirect (`x` to `x/`), the folder served by its `index.html`, the 404 page with the status 404, `_headers` never served, and a path that holds `..` or a null byte answered with the 404 page.

In the pretty style, a request for a file that exists is answered like this, in this order:

| Request | Answer |
|---|---|
| `/index.html` or `x/index.html` | 308 to `/` or `x/`, keeping the query |
| `name.html` | 308 to `name`, keeping the query. `/404.html` goes to `/404` |
| `name`, where no file `name` and no folder `name` exist and `name.html` does | 200 with the file `name.html`. The headers are those that `_headers` gives the request path `name` |
| a folder, a file that is not a page, anything else | as in the plain style |

The headers of a clean address come from the address that was asked, as a host that matches `_headers` on the request path sends them. The live host was seen to do so on 22 Nov 2026. The clean address `/404` gets no policy rule of its own, because the rule in `_headers` names `/404.html`. For the same reason, in the pretty style an address that is answered with the 404 page gets the headers that match that address, not those of `/404.html`. In the plain style the 404 page gets the headers of `/404.html`. The 404 page holds its own policy in a meta tag (see "The policy"), so it has one in both styles.

The preview is started by `npm run preview:pretty` (`vite preview --host 127.0.0.1 --port 4182 --strictPort`), and `playwright.config.ts` sets the variable for that one server and builds nothing. Ports 4173 to 4181 are taken by the other servers.

### Assembly

`assemble-site.mjs` reads the lock, checks that every part of `dist/apps` is there, and checks the Desk preview folder against the lock (name, version and revision of the Desk checkout, and every file hash, with no file missing and none extra). Only then does it build `dist/site.tmp`: the hub at the root, `churchyard/`, `allotments/`, the preview at `review/`, the worker's script tag in the five pages of the site's own, the stamped worker. It swaps the folder in at the end. A refusal writes nothing. The Desk folder is `--desk`, then `PLOTWARDEN_DESK_PREVIEW`, then `../plotwarden-review-desk/dist/preview`. `lock-desk.mjs` is a separate command, and does not replace a lock without `--replace`.

### The policy

`_headers` has one content policy for each page and no rule that matches a page twice, because a host sends both and the browser enforces the stricter. Pages of the site: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (the print documents carry their own style), images from the site, `data:` and `blob:`, no object, no outside origin. The two sample visitor files get the policy that they hold for themselves, word for word. `check-release` compares them with the file's own meta tag.

The 404 page holds its own policy too. The live host matches each `_headers` rule on the address that was asked, not on the file that it sends (read with curl on 22 Nov 2026: `/no-such-page` answers 404 and `/404` answers 200, both with the 404 page and only the `/*` headers). So the rule for `/404.html` never reaches the 404 page there, and a rule that ends in `*`, such as `/visitor/family/family-map-*`, is the only kind that does. `site/public/404.html` therefore has a `<meta http-equiv="Content-Security-Policy">` tag, first in the head after the charset, with the same directives as the site policy of the `/` rule except `frame-ancestors`. A meta tag cannot set `frame-ancestors`, so the tag does not keep the page out of a frame. Only the `/404.html` rule does that, on a host that matches it, and the live host does not. The page has no form and no script, so a frame can do little with it. The rule for `/404.html` stays in `_headers` for a host that matches on the file. Header and tag then hold the same rules, and a browser enforces both without any change in effect. `check-release` reads the built 404 page, finds the tag, and fails when it is missing or is not the `/` policy without `frame-ancestors` (`csp`). The text of the tag is the only copy of the policy outside `_headers`. `release.test.ts` compares the source page with the `/` rule, and `check-release` compares the built page, so the two cannot drift.

The preview on port 4182 matches `_headers` on the request path for the 404 page as well. An unknown address gets the rules that match that address, as on the live host, and not the rules of `/404.html`. On port 4174 the 404 page keeps the headers of `/404.html`, as before.

### The release check

`check-release.mjs --part site` reads `dist/site`: size under 500 files and 5 MiB, no server code, every direct entry page present and not blank, every script and style a page names present, no remote address and no billing address in any page, script or style (a namespace, the error page that React names, a JSON schema identifier and an address in a comment are not requests), one policy per page, the worker's stamp equal to the files, the Desk copy equal to the lock. `--part inventory` reads `docs/acceptance/layout`: each route of both registers has its phone picture, each page of the site has a phone and a desktop picture, each file is a picture of the width it was taken at, and each page of the built site is in the inventory.

### Browser specs

`release.spec.ts`, `share-print.spec.ts` and `judge-guide.spec.ts` run at both sizes on `http://127.0.0.1:4174/`. The preview servers (4174 and 4182) are the webServers of `playwright.config.ts` that build nothing, so they do not race the other servers for `dist/apps`. The three offline checks of `release.spec.ts` (one worker and its cache, every page with the network off, a register worked with the network off) run once against each, so a host that redirects `.html` is tried as well as one that does not. The update test runs on 4174 only. It changes `dist/site/sw.js` for one test and restores it.

`share-print.spec.ts` takes each print document from the register's print frame, draws it in a clean page in print media, makes a PDF with the page size the document asks for, and reads the page boxes. For grayscale it draws in a second headless browser with `--disable-lcd-text`.
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
## Z-D13 Banned words outside the repository (Z19)

`scripts/lib/publicText.mjs` keeps the generic rules: dash, local path. It exports `compileBanned(lists)`, which checks that the lists are an object of lists of words and returns one whole word, case blind matcher for each list that holds a word, and `loadBannedWords(file)`, which reads a JSON file and calls it. `scanText(path, text, banned)` takes the compiled lists as an optional third argument, and reports each finding under the name of its list. With none, it runs the generic rules only.

`scripts/check-public.mjs` reads the file named by `PLOTWARDEN_BANNED_WORDS`. With the variable unset it prints one line, `check-public: the banned word lists were skipped, PLOTWARDEN_BANNED_WORDS is not set`, and runs every other check. With the variable set and a bad file it exits 2 and scans nothing, so a typo in the path cannot pass as a clean run.

The two scripts, which were skipped because they held the words, are scanned like any other file. The four tests that hold dashes and local paths as data stay let off those two rules, and are read for words. The tests write their own placeholder lists to a temporary file under `.local/`. The test process clears the variable before it starts a child, so the result does not depend on the shell that runs it.

## Z-D14 The hook log (Z20)

Only `scripts/changed-tests.mjs` changes. After the test run, `main` builds one object and appends `JSON.stringify(object) + "\n"` to `<root>/.local/hook-log.jsonl`, making the folder if needed. A write error prints one warning and does not change the exit code.

The runner is now started with its output piped, and the script copies that output to its own standard output and error, so the hook shows what it showed before. The counts come from the summary line `Tests  <n> failed | <n> passed (<n>)`, with either part optional. Without that line they are null, because a missing count is unknown, not zero. The child gets no standard input.

Standard input is read in every mode but `--list`. For `--git` it is read for the event name only, never for a path. Event names are checked against a short pattern so a path or a long text cannot pass through the event field. The saved path is the relative path from `inside()`, kept only when exactly one path was given and the run was not `--git`.

The test of the line with a failing file runs the real runner on a small root made under `.local/`, so the count comes from a real summary. The other cases use a fake runner that prints a summary. The time is checked between two readings of the clock around the run.

## Z-D15 First screens (Z21)

### Files

| File | Owns | Test |
|---|---|---|
| `site/src/copy.ts` | New keys: `jobLine`, `tryPractice`, `startOwn`, `churchyardMapLabel`, `allotmentMapLabel`. `churchyardOpen` and `allotmentOpen` are removed | `siteCopy.test.ts` |
| `site/src/Home.tsx` | The job line, and two register cards with a drawing and two links | `siteCopy.test.ts`, `release.spec.ts` |
| `site/src/practiceMaps.ts` | Generated. Two strings of SVG markup, `PRACTICE_MAPS.church` and `PRACTICE_MAPS.garden`. Never edited by hand | `siteCopy.test.ts` (freshness) |
| `site/src/site.css` | The sheet look for the two drawings, the card layout | `release.spec.ts` layout |
| `tools/site/practiceMaps.ts` | `buildPracticeMaps()`: runs the fixtures `lantern-fold` and `thimble-beds` through the real adapters, builds the sheet with `buildSheet` at 272 px, draws it with `SheetSvg` inside a stub shell value that holds only the plot shape, and returns the markup | `siteCopy.test.ts` |
| `scripts/build-practice-maps.mjs` | Bundles the tool as `build-visitor.mjs` does and writes `site/src/practiceMaps.ts`. `npm run build:maps` | `siteCopy.test.ts` |
| `template/src/ui/Library.tsx` | `usePracticeRegister()`, shared by the library button and the new `PracticeEntry` | `entry-library.spec.ts`, `release.spec.ts` |
| `template/src/ui/RegisterShell.tsx` | Route `#/practice` | `release.spec.ts` |
| `template/src/ui/copyScreens.ts` | `groupRecords`, `groupShare`, `groupSite`, `tryExample`, `openingPractice` | `copy.test.ts`, `paperCopy.test.ts` |
| `apps/*/src/{ChurchyardHome,AllotmentHome}.tsx` | The example button, the three groups, the plain counts | `warden-family.spec.ts`, `secretary-season.spec.ts`, `layout.spec.ts` |
| `apps/churchyard-register/src/walkthrough.ts` | `LANTERN_EXAMPLE = "Quillmoss"` | `warden-family.spec.ts` |
| `template/src/ui/register.css` | `.tally` (plain text) and `.group-heading` | `layout.spec.ts` |

### The drawings

The site may import nothing outside `site/` (`check-imports`, rule `site-layer`), and a runtime import of the registers would put their rules and their schema library into the hub script. So the drawing is made when the project is built, not when the page opens. `buildPracticeMaps` is the one place that joins the site and the registers. It lives in `tools/`, which may import both. The plots, their states and the gate come from the practice data through `plotSummaryAt`, as `plotRows` does for the register, so the hub drawing and the desk drawing cannot disagree about a plot. The sheet is built at 272 px. A card on a 360 px phone holds 284 px, and the 2 px frame takes 4, so the drawing keeps its own size and its text is never drawn under 12 px. A `viewBox` is added so a tool can read the scale. The frame has `overflow-x: auto`, so on a page narrower than the drawing, as at 200 percent zoom on a phone, the frame scrolls and the page does not. The drawing is never shrunk and never hidden.

`site/src/practiceMaps.ts` is committed. `siteCopy.test.ts` rebuilds the markup and compares, so a change to the sheet or to the practice data fails until `npm run build:maps` is run. The page sets the markup with `dangerouslySetInnerHTML` from that constant. The constant is code, not input, and holds no script.

### One press

`#/practice` is a library route. `PracticeEntry` calls `usePracticeRegister().open()` once on mount, shows "Opening register." while it runs, then calls `navigate("/r/<id>", { replace: true })`. An app with no `walkthrough` renders `NotFound`. A failure shows the storage notice and the link "Registers". The hub links are plain anchors, `churchyard/#/practice` and `allotments/#/practice`. A fragment is never sent to the host and the worker ignores it, so the link works offline.

On a phone the map sits under the search, as before. After one press the register home is open and the map is drawn on it. The map is one scroll away on a phone, and beside the search on a wide screen. The browser test reads the map after `scrollIntoViewIfNeeded` at 360 by 640 and checks it in the viewport at 1920 by 1080.

### The example button

The home screens read `open.site.workspace === "walkthrough"`. The button is `type="button"`, so it does not submit the form. It sets the field text and calls the same `go(text)` as Search, so the text stays in `history.state` and never in the address. The churchyard text is `LANTERN_EXAMPLE`. The garden text is the code of `free[0]`, the next free plot, so it follows the register: after B03 is offered, the button reads the code of the next one.

### Groups and counts

Each group is `<nav aria-labelledby="group-<name>">` over an `<h2 id="group-<name>" className="group-heading">`. The two old navigations named "Search this register" and "Links for this register" are gone, so no landmark repeats a name. The search form keeps the role `search`. The counts are one `<p className="tally">`: "2 free · 0 reserved · 3 taken · 1 unusable". It has no border and no fill, and it is not inside a navigation. The reports keep their `.counts` boxes, which are not on a desk.

## Z-D16 The write-up (Z22)

`docs/write-up.md` has one title, a short opening, and eight second level sections, each named for the question it answers: "Kiro IDE, CLI, Web, Crew", "Custom agents", "Agent hooks", "Spec driven development", "Steering docs", "MCP", "Property based testing (PBT)", "Kiro powers". Each section holds two paragraphs that start with a bold label: "Done." and "Effect." There is no "Not done." paragraph. The page answers what each heading asks, and stops. The effect names a file by a relative link, or a log row by the start of its "Spec and task" text in quotation marks after the word "row". The test reads the page as text with no markdown library: it takes the lines that start with `## `, the relative links of the form `](path)` and the quoted row names, and checks each against the files. A link that has a heading part is also checked against the headings of its target, made the way `check-links.mjs` makes them. The test for dates reads the first cell of each row of the log and compares it with the local date of the machine that runs the test, so a row dated after today fails the day it is written, and a row cannot be dated ahead.

## Z-D17 Repairs of the faults on the live site (Z23)

Files and what each owns.

- `apps/churchyard-register/src/familyForm.ts`: the family form without React. `fromState` (the form for a register as saved), `clearedForm` (the form after "Clear public details") and `saveCommands` (the commands that a save sends). `FamilySheet.tsx` uses them. A row in review is unticked, shows the current recorded name, and sends nothing unless the keeper changed it (Z23.1). A row that is approved and unchanged sends nothing.
- `apps/allotment-register/src/rules.ts`: `makeOffer` refuses `offer_before_joined` (Z23.3). `tenancyGroups(state, today)` splits tenancies into current, later and past (Z23.4).
- `apps/allotment-register/src/copy.ts`: `err_offer_before_joined`, `tenanciesLater`, `tenancyStarts`. `allotError` fills the date.
- `apps/allotment-register/src/Tenancy.tsx`: the group "Starts later". `SeekerSheet.tsx` and `FamilySheet.tsx`: Download and Print wait for saved changes (Z23.2), and clear resets the form (Z23.7).
- `apps/churchyard-register/src/ChurchyardHome.tsx`: the search box follows the search of the route when the route changes (Z23.8).
- `template/src/ui/ImportWizard.tsx`: a new separator drops the table that was read with the old one (Z23.5).
- `template/src/output/visitorHtml.ts`: the print buttons clear the filter for the length of the print and put it back, and "Print this location" starts disabled (Z23.9, Z23.10). One new word key, `chooseLocationFirst`, is in `FAMILY_WORD_KEYS`, `apps/churchyard-register/src/copy.ts` and `tests/helpers/familyWords.ts`.
- `template/src/data/transaction.ts` and `template/src/ui/RegisterShell.tsx`: `commit` notes the revision it wrote, per site, before it tells the channel. The channel also reaches the other channel objects of the same tab, so the shell used to hear its own save before its reload had finished. `heardFromOtherTab(message, known)` is true only when the revision is newer than what the shell holds and newer than any revision this tab wrote. The message on the channel does not change. Revisions rise by one and a commit checks the expected one, so a revision this tab wrote cannot also have come from another tab (Z23.11).
- `docs/make-your-own.md`: the copy list of "Use it in another repository" names `template/` and `fonts/`, and step 2 of the walk through names the plot width and height (Z23.6, Z23.12). `tests/unit/makeYourOwn.test.ts` reads those two parts of the guide and follows them.

Why the guide and not the template for Z23.6: `register.css` imports the font file by a path above `template/`, and the licences and the file list of the fonts belong to the repository root. Copying one more folder keeps one copy of each font.

Why the app is not changed for Z23.12: the plot width and height have no honest default, because they are in map units that the keeper chooses. An empty field with an error is the right start. The guide was the part that was wrong.

## Z-D11 Evidence

Each task row in `docs/kiro-log.md` names its red run and its green run. The log holds no local absolute path. Browser results say headless Chromium on one Windows machine. Results from a unit test, a browser assertion and a person's review of a picture are labelled apart. No claim about users, speed on other machines or other browsers is made.

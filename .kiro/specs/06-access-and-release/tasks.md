# 06 Access and release: tasks

Each task writes its test first, sees it fail on the missing behaviour (a stub that compiles and throws "not implemented", never a missing module), then writes the smallest complete code. A task is ticked only when its test passes. Expected values come from `tests/fixtures/expected/hand-totals.md` and the plan's worked examples. T IDs repeat the owner table in spec 00. Tasks marked **next task** are not built in 07b.

For the browser specs the screens already existed, so the first run is a run against real screens. It found faults, which are listed in design Z-D12 and were fixed in the app with each check kept.

- [x] 6.1 Spec 06: requirements, design, tasks. Files: `.kiro/specs/06-access-and-release/*`. T IDs: none.
- [x] 6.2 Preferences: resolved motion, high contrast, damaged storage, one device key, reset scope. Files: `template/src/preferences.ts`, `template/src/ui/shellContext.ts`, `template/src/ui/RegisterShell.tsx`, `template/src/ui/register.css`, `tests/unit/preferences.test.ts`. T IDs: T29. Z2.
- [x] 6.3 Practice registers: determinism, isolation, placeholders, first screen and result words. Files: `tests/unit/walkthrough.test.ts`, `template/src/data/seed.ts`. T IDs: T30. Z3.
- [x] 6.4 Copy catalog: dashes, names, provider words, states, artwork ledger. Files: `tests/unit/copy.test.ts`. T IDs: T35. Z9.
- [x] 6.5 Full privacy scan: bytes, head, urls, file names, storage, logs, source. Files: `tests/unit/privacy.test.ts`. T IDs: T28. Z1.
- [x] 6.6 Limits, the rest: commands and files at the last legal value and one over, domain records, 5,000 row preview and cancel, resource measurement. Files: `tests/unit/limits.test.ts`, `template/src/limits.ts`, `apps/*/src/rules.ts`, `template/src/ui/{messages,copyScreens}.ts`. T IDs: T32. Z5.
- [x] 6.7 The inspector: fixtures, three tools, typed errors, server, command line, build. Files: `tools/inspector/{fixtures,inspect,server,cli}.ts`, `tools/inspector/vite.config.ts`, `package.json` (`build:inspector`), `tests/unit/inspect.test.ts`. T IDs: T33. Z6.
- [x] 6.8 The power: `plugin.json`, the skill. Files: `powers/plot-checks/plugin.json`, `powers/plot-checks/skills/review-adapter/SKILL.md`, `tests/unit/inspect.test.ts`. T IDs: T33 support. Z7. Not installed: see "Not settled".
- [x] 6.9 The market example and the generator. Files: `examples/market/*`, `scripts/create-app.mjs`, `scripts/lib/scaffold.mjs`, `scripts/check-imports.mjs`, `package.json` (`create:app`, `market:*`), `tsconfig.json`, `playwright.config.ts`, `eslint.config.mjs`, `tests/unit/scaffold.test.ts`, `tests/unit/adapter.test.ts`, `tests/conformance/market.test.ts`. T IDs: T34, T01. Z8.
- [x] 6.10 The guide, and the browser spec that walks it. Files: `docs/make-your-own.md`, `tests/browser/market-example.spec.ts`. T IDs: T34 support. Z8.8.
- [x] 6.11 Browser: entry and library. Files: `tests/browser/entry-library.spec.ts`, `tests/helpers/routes.ts`. T IDs: browser. Z11.
- [x] 6.12 Browser: layout. Files: `tests/browser/layout.spec.ts`, `docs/acceptance/layout/routes/**`. T IDs: browser. Z12.
- [x] 6.13 Browser: accessibility. Files: `tests/browser/accessibility.spec.ts`, `tests/helpers/axe.ts`, `package.json` (`@axe-core/playwright` 4.14.0), `THIRD_PARTY_NOTICES.md`. T IDs: browser. Z13.
- [x] 6.14 Browser: recovery. Files: `tests/browser/recovery.spec.ts`. T IDs: browser. Z14.
- [x] 6.15 Fix what the browser specs found, in the app, with no check loosened. Files: `template/src/ui/{RegisterShell,Dialog,Status,register.css,copyScreens}.tsx`, `template/src/map/sheet.ts`, `apps/*/src/{AllotmentHome,ChurchyardHome}.tsx`, `apps/allotment-register/src/theme.css`, `tests/unit/sheet.test.ts`, `tests/helpers/measureLayout.ts`. T IDs: as found. Z17.
- [x] 6.16 Log, README and exit gate. Files: `docs/kiro-log.md`, `README.md`, this file. T IDs: none.
- [ ] 6.17 **Next task.** Hub, visitor landing pages, `site/`. Files: `site/*`. T IDs: none.
- [ ] 6.18 **Next task.** Service worker, versioned cache, update flow. Files: `site/src/sw.ts`, `scripts/build-sw.mjs`, `tests/unit/offline.test.ts`. T IDs: T31. Z4.
- [ ] 6.19 **Next task.** Assembly, release checks, freeze. Files: `scripts/{assemble-site,check-release,check-public,check-links}.mjs`, `release/desk-preview.lock.json`, `tests/unit/release.test.ts`. T IDs: T36. Z10.
- [ ] 6.20 **Next task.** Browser: share and print. Files: `tests/browser/share-print.spec.ts`. T IDs: browser. Z15.
- [ ] 6.21 **Next task.** Browser: release. Files: `tests/browser/release.spec.ts`. T IDs: browser. Z16.

## Not settled in spec 06

- **The inspector is built and not switched on.** `.kiro/settings/mcp.json` still has `"disabled": true` for `plot-inspector`, because the agent cannot write that folder. It is ready: `npm run build:inspector` writes `dist/inspector/server.mjs`, and a test starts that file as a process and talks to it. A person sets `"disabled": false`. No tool was called through a real Kiro session, so the reviewer profile's use of the three tools is untried.
- **The power is not installed.** The command to install it, from the root of this checkout after `npm run build:inspector`, is `kiro-cli powers install ./powers/plot-checks`. The folder format was taken from power folders already in use in the same format, and a test checks the file against the plan. No activation was observed, so there is no claim of one.
- **The browser specs ran only in headless Chromium on one Windows machine,** at two viewport sizes. Firefox, WebKit and a real phone were not tried. A viewport is not a phone.
- **200 percent zoom is made by halving the viewport and doubling the pixel density.** It is not a browser zoom or a text only zoom. Landscape, a software keyboard and long real names in other scripts were not tried. A name of 100 characters, with and without spaces, and a note of 4,000 characters were.
- **No person used a screen reader or the keyboard paths.** The keyboard paths are browser assertions. axe found no finding of any weight on any route, dialog or error that the spec visits, at either size. Two moderate findings were found first (two navigation landmarks with one name, and two report regions with one name) and were fixed in the app. That is what axe can find. It is not a review by a person.
- **The resource times are from fake IndexedDB in Node on one machine,** an AMD Ryzen 9 9950X with Node 24.19: worst of six runs 12.4 ms for a 200 row preview, 8.1 ms for its commit and 1.8 ms for a search over 2,000 plots. A real browser store was not timed, so the reference machine figures of R21.4 are met by this run and not by a recorded browser run.
- **The 100,000 event limit is tested by setting the stored counter,** not by writing 100,000 events. The domain record limit is tested on a state built with 19,999 and 20,000 records, not through a database.
- **The market example does not enforce the domain record limit,** has no practice register, no availability screen and no committee checks. The guide says so. The generated app was built and run only inside this checkout, and the dev server of a generated copy was not started by a test. The example's own build and preview were.
- **The hub, the visitor landing pages, the service worker, the cache, the assembly and the release checks are the next task.** The Z4, Z10, Z15 and Z16 requirements are contracts only. No page was printed.
- **Old proof pictures.** The full browser run re-took the pictures of the earlier specs in `docs/acceptance/layout/`. git shows many of them as changed. Which changes are real was not checked picture by picture, and they were not restored. The new pictures of every route are in `docs/acceptance/layout/routes/`, as small JPEG files: the phone size for every route, the desktop size for a chosen set.
- **`tests/helpers/measureLayout.ts` changed once,** in `focusRingContrast`: a ring drawn past an `outline-offset` is compared with what is behind the control, not with the control's own fill (design Z-D12). The ring colour, and every other measure, are as they were.

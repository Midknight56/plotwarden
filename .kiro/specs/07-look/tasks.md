# 07 Look: tasks

Each task writes its test first, sees it fail on the missing behaviour, then writes the smallest complete code. A task is ticked only when its test passes. Expected values are the floors of `requirements.md`, not the output of the code. The work is in four slices. Slices 1 and 2 are built.

For each held back value, the line names the slice and task that turns it on (design L-D3).

## Slice 1: values, fonts and the heading ring

- [x] 7.1 Spec 07: requirements, design, tasks. Files: `.kiro/specs/07-look/*`. T IDs: none.
- [x] 7.2 Values and contrast: the new names and defaults in `register.css`, the churchyard and allotment values, the start page fonts and sizes, token use in the existing rules, and the test that reads the stylesheets and measures each pair. Files: `template/src/ui/register.css`, `apps/churchyard-register/src/theme.css`, `apps/allotment-register/src/theme.css`, `site/src/site.css`, `tests/unit/lookTokens.test.ts`. L1.
- [x] 7.3 Fonts: ten woff2 files and two `@font-face` files, loaded by the shared screens, the churchyard theme and the start page, with the text and heading stacks. The offline list names each file because `shellOf` lists every file of the built site. Files: `fonts/atkinson.css`, `fonts/gelasio.css`, `fonts/*.woff2`, `package.json` and `package-lock.json` (`@fontsource/atkinson-hyperlegible-next` 5.3.0 and `@fontsource/gelasio` 5.3.0, exact, development), `scripts/lib/site.d.mts`, `tests/unit/fonts.test.ts`, `tests/browser/release.spec.ts` (the built site). L2.1 to L2.5, L2.7, L2.8.
- [x] 7.4 Notices and the licence check: two rows, the text of the Open Font License, the copy served by the site, and `check-licenses` counting the two font packages as shipped. Files: `THIRD_PARTY_NOTICES.md`, `site/public/font-licences.txt`, `scripts/check-licenses.mjs`, `tests/unit/release.test.ts`, `tests/unit/fonts.test.ts`. L2.6.
- [x] 7.5 The heading ring: no outline on an `h1` or `h2` with `tabindex="-1"` in the registers and on the start page. Focus still moves. Files: `template/src/ui/register.css`, `site/src/site.css`, `tests/browser/accessibility.spec.ts`. L3.
- [x] 7.6 Proof pictures wait for animations that end. Files: `tests/helpers/siteOrigin.ts`. L4.1.
- [x] 7.7 Retake the proof pictures that change. Files: `docs/acceptance/layout/**`. L4.2.
- [x] 7.8 Log row and ticks. Files: `docs/kiro-log.md`, this file. T IDs: none.

Held back in slice 1 (design L-D3):

- The churchyard night ground (`--ground`, `--on-ground`): task 7.16.
- The band heights `--band` of both themes: task 7.15, with the new art.
- `--focus-on-dark` in the header, index rows on the night ground, `.group-heading` capitals: tasks 7.16 and 7.17.
- `main` at 105rem and its side padding: task 7.18.
- `--row-ground`, `--turf`, `--stone-base`, `--kerb`, `--crop` as fills: tasks 7.12 and 7.13.
- `--action-hover`, `--action-pressed`, `--rule` and `--motion` as rules: task 7.9.
- The 3 px solid field error with a mark, the 24 px check box, the notice marks: tasks 7.10 and 7.11.
- The start page title size, stripe and doors: task 7.21.

## Slice 2: shared components and the map

- [x] 7.9 Button tiers, index rows, hover, pressed and the 120 ms colour transition, off for reduced motion and high contrast, and never on the start page. Also one copy of each font file on the whole site. Files: `template/src/ui/register.css`, both `theme.css`, `scripts/lib/site.mjs`, `scripts/lib/site.d.mts`, `tests/helpers/{cssRules,routes}.ts`, `tests/unit/{lookComponents,fonts}.test.ts`, `tests/browser/{layout,release}.spec.ts`. L5.1, L5.5 to L5.7, L2.4, L2.5.
- [x] 7.10 Fields, errors and check rows. Files: `template/src/ui/register.css`, `tests/unit/lookComponents.test.ts`, `tests/browser/layout.spec.ts`. L5.2, L5.3. No component changed: the error message and the check rows are drawn by CSS.
- [x] 7.11 Cards and notices: the allotment hatched strip, the saved tick and the error mark. Files: `register.css`, `apps/allotment-register/src/theme.css`, `tests/unit/lookComponents.test.ts`, `tests/browser/layout.spec.ts`. L5.4.
- [x] 7.12 The map drawing: state class on `.plot`, turf and base for arches, crop and furrow patterns for beds, the edge line of a path, and the map labels at 14 px. Files: `template/src/ui/SiteMap.tsx`, `template/src/map/{sheet,labels}.ts`, `tests/unit/{lookMap,sheet}.test.ts`, `tests/browser/paper-map.spec.ts`. L6.2, L6.3, L6.5, L6.7.
- [x] 7.13 The key swatches, the joined frame, the map rules in each theme, in high contrast and in print, and the practice maps of the start page. Files: `SiteMap.tsx`, `register.css`, `print.css`, both `theme.css`, `site/src/site.css`, `site/src/practiceMaps.ts`, `apps/churchyard-register/src/ChurchyardHome.tsx`, `tests/unit/{lookMap,siteCopy}.test.ts`. L6.1, L6.4, L6.6.
- [x] 7.14 Slice 2 proof pictures, log row. Files: `docs/acceptance/layout/**`, `docs/kiro-log.md`.

## Slice 3: layouts and art

- [ ] 7.15 The header rows, the band heights and the three art files, with `origins.md`. Files: `theme.css` files, `assets/*.svg`, `assets/origins.md`, `tests/unit/{churchAssets,gardenAssets}.test.ts`. L7.1 to L7.3.
- [ ] 7.16 The churchyard night ground with sheets under every block of text, and no night ground in high contrast. Files: `apps/churchyard-register/src/theme.css`, `ChurchyardHome.tsx`, `tests/unit/lookTokens.test.ts` (the held back test changes with it). L7.6.
- [ ] 7.17 The index column (`.link-group` in its own wrapper) and the ring on the night ground. Files: `ChurchyardHome.tsx`, `AllotmentHome.tsx`, `register.css`. L7.4.
- [ ] 7.18 Three desk columns, `main` widths. Files: `register.css`, both `theme.css`, `tests/unit/lookLayout.test.ts`, `layout.spec.ts`. L7.4, L7.5, L7.7.
- [ ] 7.19 The allotment desk card. Files: `AllotmentHome.tsx`, `theme.css`. L7.4.
- [ ] 7.20 Site map side panel and plot record columns. Files: `template/src/ui/{SiteMap,PlotDetails}.tsx`, `register.css`. L7.4, L7.5.
- [ ] 7.21 The start page. Files: `site/src/{Home.tsx,site.css}`, `tests/unit/siteCopy.test.ts`. L7.8.
- [ ] 7.22 Record a burial, make an offer, season fees, committee review and settings, one at a time, and the slice 3 proof pictures and log row. Files: the screens named, `docs/acceptance/layout/**`, `docs/kiro-log.md`. L7.5.

## Slice 4: visitor files, print, the market example and the Review Desk

- [ ] 7.23 The family file: tab, gate and walk, system fonts, still sealed. Files: `template/src/output/visitorHtml.ts`, `tests/unit/visitor.test.ts`. L9.
- [ ] 7.24 The plot seeker file, the same. Files: `template/src/output/availabilityHtml.ts`, `tests/unit/visitor.test.ts`. L9.
- [ ] 7.25 Print rules and the grayscale check. Files: `template/src/ui/print.css`, `tests/unit/lookPrint.test.ts`, `tests/browser/share-print.spec.ts`. L10.
- [ ] 7.26 The market example values. Files: `examples/market/src/theme.css`, `tests/unit/lookTokens.test.ts`, `tests/browser/market-example.spec.ts`. L11.
- [ ] 7.27 The Review Desk in its own repository, no entry fade, then `npm run lock:desk` here. Files: `release/desk-preview.lock.json`. L12.
- [ ] 7.28 Pictures at 360, 1440 and 1920 and a grayscale print. Files: `docs/acceptance/**`.
- [ ] 7.29 Evidence rows, log row, release notes. Files: `docs/kiro-evidence.md`, `docs/kiro-log.md`.

## Not settled in spec 07

- **The fonts are measured by file, not by glyph.** The `unicode-range` of each rule is the one the package declares, and the test checks that range. The browser spec checks that each family loads. No test opens the font files to list their glyphs.
- **The size limit counts the files of the site.** The ten files are 148,228 bytes. The built site holds each of them once, in the `assets/` folder of the hub, and the styles of the two apps point at that copy. The standalone app builds in `dist/apps/` keep their own copies, so each of them works alone.
- **The README and the mockups use two names for the churchyard lawn.** This spec uses `--row-ground`.
- **Control heights are 46 and 48 only in the two themes.** An app with no theme keeps 44.
- **No person has seen the new look.** The pictures are headless Chromium on one Windows machine. Nothing here was compared with the mockups by a person.

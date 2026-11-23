# 07 Look: design

This design says how spec 07 builds L1 to L14. Names in `code` are files, custom properties or classes. The look is built in four slices. Slice 1 is built. Slices 2 to 4 are written here and not yet built.

## L-D1 Decisions and where the handoff differs

- **The handoff is a reference.** Nothing of it is copied: not its files, markup, font links or support script. The values are typed into the real files.
- **Where the README and the mockups differ, the mockups win.** The one difference that touches a name: the mockup system page calls the churchyard lawn `--lawn`, and the README, the token file and the allotment block call the same thing `--row-ground`. This design uses `--row-ground` in both themes, because the shared map rule (`.sheet .section-outline`) reads one name.
- **Control heights.** The token file gives `--control-h: 46px` and `--field-h: 48px` as shared defaults, and says the defaults keep a themeless app as it is today. Today is 44. So `register.css` keeps 44 and 44, and each theme sets 46 and 48. The market example takes its own values in slice 4.
- **Fonts for every app.** An app with no theme still takes the text font, because the fonts load with the shared screens. Colour, corners and heights are unchanged for it.
- **Words.** The copy catalogs are the only source of words. The mockups were not read for text.
- **Spec folder.** The structure steering names specs 00 to 06. This spec is the seventh, `07-look`, with the same three files.

## L-D2 The pairs that are measured

`tests/unit/lookTokens.test.ts` reads `template/src/ui/register.css`, each `theme.css` and `site/src/site.css`. For each scope it takes the custom properties of `:root`, then (for high contrast) those of `html[data-contrast="high"]`, files in load order, resolves `var()` and measures. A pair is `[what, text or edge or ring, what it stands on, floor]`. The lists are in the test. In short:

| Scope | Text at 4.5 | Edges, rings and large marks at 3 |
|---|---|---|
| Shared | ink, muted, error on paper, field, soft, bad, good; main action text on its fill; text on the ground | ink edge on paper; focus on paper, field, soft; ok on good and field; action edge on paper |
| Churchyard | ivory `#FAF5E9` on `#232A5C`; `#C9CEE6` on `#232A5C`; ink on `#F2C96B`, `#F6D68F`, `#E3B24F`; ink on stone, gravel, row ground, turf, stone base, tab; muted and error on stone | `#8E96C4` on `#232A5C`; `#F2C96B` on `#232A5C`; `#FFD27A` on `#232A5C`; `#6B6557` on stone and paper; focus on stone and paper |
| Allotment | ink, muted on paper, stone, soft; white on `#2F6B4F`, `#1F4F38`, `#173B2A`; leaf on paper and stone; ink on tab, soil, bed soil, grass, band; error on stone and bad | `#6F8576` on paper and stone; focus on paper, soil, stone; ok on good; action edge on paper |
| Start page | ink, muted on paper and field; paper on ink | focus on paper and field; leaf and sky edges on field |
| High contrast | black on white, on gravel `#BBBBBB`, on stone, on tab; leaf `#1B312A` on white; white on black main action | `#0000CC` on white; black edge on white |

The ratio is `(L1 + 0.05) / (L2 + 0.05)` on relative luminance of the sRGB hex, as in the other asset tests.

## L-D3 Slice 1: values, fonts and the heading ring (built)

### Files and what each owns

| File | Owns | Test |
|---|---|---|
| `template/src/ui/register.css` | The new names with defaults, the font import, `--font-text` and `--font-heading` use, the `h1` size, heading ring rule, token use in existing rules | `lookTokens.test.ts`, `layout.spec.ts`, `accessibility.spec.ts` |
| `apps/churchyard-register/src/theme.css` | Churchyard values, `Gelasio` import and heading stack | `lookTokens.test.ts`, `churchAssets.test.ts`, `fonts.test.ts` |
| `apps/allotment-register/src/theme.css` | Allotment values, its own ink and paper | `lookTokens.test.ts`, `gardenAssets.test.ts` |
| `site/src/site.css` | Start page fonts, `h1` size, heading ring, the bed fill of the practice map | `lookTokens.test.ts`, `fonts.test.ts` |
| `fonts/atkinson.css`, `fonts/gelasio.css` | The `@font-face` rules. Each has a latin and a latin ext file for each weight | `fonts.test.ts` |
| `fonts/*.woff2` (ten files) | The font files, as published in the two npm packages | `fonts.test.ts` |
| `site/public/font-licences.txt` | The copyright lines and the Open Font License text, served by the built site | `fonts.test.ts` |
| `THIRD_PARTY_NOTICES.md`, `scripts/check-licenses.mjs` | The two rows and the licence text. The check treats the two font packages as shipped when `fonts/` exists | `fonts.test.ts`, `release.test.ts` |
| `tests/helpers/siteOrigin.ts` | `settleMotion`, called by `saveProof` | `release.spec.ts` |
| `docs/acceptance/layout/site/*.jpg` | The proof pictures that change | a look at each |

The fonts folder is `fonts/` and not `assets/`, because `copy.test.ts` requires every entry of `assets/` to be a drawing listed in `origins.md`.

### The new names in `register.css`

| Name | Default | Used by now |
|---|---|---|
| `--ok` | `#1F5B36` (`#000000` in high contrast) | `.notice.good` border |
| `--focus-on-dark` | `#FFD27A` | Slice 3 |
| `--rule` | `#D8CDB4` (`#000000` in high contrast) | Slice 2 |
| `--ground`, `--on-ground` | `var(--paper)`, `var(--ink)` | `html`, `body` |
| `--action`, `--action-ink`, `--action-edge` | `var(--ink)`, `var(--paper)`, `var(--ink)` | `.button.primary` |
| `--action-hover`, `--action-pressed` | `var(--ink)` | Slice 2 |
| `--radius-control`, `--radius-card` | `0` | `.button`, fields, `.card` |
| `--font-text`, `--font-heading` | Atkinson stack, `var(--font-text)` | `html`, headings, brand |
| `--control-h`, `--field-h` | `44px` | `.button`, fields |
| `--motion` | `120ms ease-out` | Slice 2 |

### Theme values

Churchyard (`theme.css`): `--sky #232A5C`, `--sky-ink #FAF5E9`, `--sky-muted #C9CEE6`, `--sky-line #8E96C4`, `--gravel #D9CDB0`, `--stone #FFFEF8`, `--tab #F2C96B`, `--soft-line #6B6557`, `--action #F2C96B`, `--action-ink var(--ink)`, `--action-hover #F6D68F`, `--action-pressed #E3B24F`, `--action-edge var(--ink)`, `--radius-control 2px`, `--radius-card 16px 16px 2px 2px`, `--control-h 46px`, `--field-h 48px`, `--font-heading "Gelasio", Georgia, "Times New Roman", serif`, `--row-ground #E3E9D3`, `--turf #CDD9B3`, `--stone-base #E2DDD0`, `--kerb #A99C7A`. In high contrast: gravel `#BBBBBB`, stone `#FFFFFF`, action black on white, row ground, turf and kerb none, stone base white.

Allotment (`theme.css`): `--paper #F7F5E8`, `--ink #1B312A`, `--muted #3E5A4E`, `--stone` and `--field #FFFEF6`, `--soft #E7EEDA`, `--good #DCEBD3`, `--bad #F6E3DC`, `--tab #BFE0EA`, `--sky #CFE7DF`, `--leaf #2F6B4F`, `--leaf-hover #1F4F38`, `--leaf-pressed #173B2A`, `--soil #EFE6CC`, `--grass #CFE0B8`, `--bedfill #E6D6B4`, `--soft-line #6F8576`, `--action var(--leaf)`, `--action-ink #FFFFFF`, `--radius-control 10px`, `--radius-card 14px`, `--control-h 46px`, `--field-h 48px`, `--row-ground #DCE8C4`, `--crop #A6C580`. The headings use the text font. The theme holds no `Georgia`, `arch-inner`, `gate-lantern` or `churchyard-margin`.

The text and heading weights are 400, 600 and 700. The allotment brand and its large figure were 800 and are now 700, because no 800 file loads.

### Held back, and the slice that turns it on

| Value | Why it waits | Turned on in |
|---|---|---|
| Churchyard `--ground: var(--sky)` and `--on-ground: var(--sky-ink)` | Text stands on the page ground with no sheet under it until the desks are sheets | Slice 3 (task 7.16) |
| `--focus-on-dark` use, ivory index rows, `.group-heading` capitals | Need the night ground and the index column | Slice 3 (7.16, 7.17) |
| `--band` 80 and 52 (churchyard), 64 and 48 (allotment) | The new art tiles are drawn for these heights | Slice 3 (7.15) |
| `main` width 105rem and side padding `clamp(16px, 2.8vw, 40px)` | One column at 1680 px makes lines too long until there are three columns | Slice 3 (7.18) |
| `--row-ground`, `--turf`, `--stone-base`, `--kerb`, `--crop` as fills | The drawing has no state class, no turf, no base, no edge line and no pattern | Slice 2 (7.12, 7.13) |
| `--action-hover`, `--action-pressed`, `--rule`, `--motion` as rules | Button states, row rules and transitions are components | Slice 2 (7.9) |
| Field error as 3 px solid with a mark, 24 px check box, notice marks | Need markup for the marks | Slice 2 (7.10, 7.11) |
| Start page title `clamp(40px, 3vw + 22px, 64px)`, stripe, doors | Layout and markup | Slice 3 (7.21) |

### Fonts

| Family | Weights | Files | Bytes |
|---|---|---|---|
| Atkinson Hyperlegible Next | 400, 600, 700 | latin and latin ext for each | 59,976 (37,500 latin and 22,476 latin ext) |
| Gelasio | 600, 700 | latin and latin ext for each | 88,252 (40,284 latin and 47,968 latin ext) |

The package files are under 150,000 bytes together (148,228 measured), so no subsetting was needed and no tool is pinned for it. The `unicode-range` of each rule is the one the package declares. The latin file covers U+0000 to U+00FF and U+2000 to U+206F (so `·`, `’`, `“`, `”` and `…`). The latin ext file covers U+0100 to U+02BA (so Latin Extended A).

Each build copies the files that its stylesheets name, with a content hash in the name. A file that two builds share has the same name and the same bytes, so the distinct total stays 148,228 and each app folder is under it. `@import` brings each family in once per build: Atkinson with `register.css` (both apps and the market example) and with `site.css`, Gelasio with the churchyard theme and with `site.css`. The allotment build holds no Gelasio.

`shellOf` in `scripts/lib/site.mjs` lists every file of the built site except `sw.js` and `_headers`, so each font file is in the offline list that `build-sw.mjs` stamps. `site/public/_headers` already allows `font-src 'self'`.

### The heading ring

`register.css` and `site.css` hold `h1[tabindex="-1"]:focus-visible, h2[tabindex="-1"]:focus-visible { outline: none; }` after the `:focus-visible` rule. `RegisterShell.tsx` and `ChurchyardHome.tsx` are unchanged and still move focus. The focus rule for links and controls is unchanged.

### The proof pictures

`settleMotion` in `tests/helpers/siteOrigin.ts` waits two frames, then until every animation with an end is finished. `saveProof` calls it before it takes a picture.

## L-D4 Slice 2: shared components and the map (not built)

Files: `template/src/ui/register.css`, both `theme.css` files, `template/src/ui/SiteMap.tsx` (`SheetSvg`, `MapKey`), `template/src/ui/MapKey` swatches, `site/src/site.css` practice map rules, `tests/unit/{sheet,visitor,lookComponents,lookMap}.test.ts`.

- Buttons: `.button` 46 high, outlined fill `--field`, hover `--soft`, pressed `--gravel` (churchyard) or `#D5E0C2` (allotment), `transition: background-color var(--motion), border-color var(--motion)`. `.button.primary:hover` uses `--action-hover`, `:active` uses `--action-pressed`. `.button.quiet` underline 1.5 px with offset 5 px. `.link-group .button` is an index row with a chevron from `::after` (`content: "\203A"`, hidden from a screen reader by being a pseudo element with no text).
- Fields: label 14 px bold, 6 px gaps, invalid border 3 px solid `--error`, a mark and the message. Check and radio box 24 px in a 44 px row.
- Notices: tick on `.notice.good`, mark on `.notice.error`, both drawn in CSS.
- Churchyard theme: `.card` gets the new look when the markup of slice 3 gives sheets; the card rule here changes only what the new classes need. Allotment `.card` gets an 8 px hatched strip in place of the green top edge.
- `.sheet-scroll` loses its bottom border and `.map-key` takes the frame, so the key joins the map.
- Map drawing (`SheetSvg`): each `.plot` gets its state as a class. A section outline is filled with `--row-ground`. An arch plot gets `<ellipse class="turf">` under it and `<rect class="base">` at its foot, behind the code (5 percent wider on each side, 27 percent of the plot height, at least 18 high). A taken arch plot is filled with `--stone` and its base with `--stone-base`. A bed gets `#crops` when taken and `#furrows` otherwise, defined in `<defs>`. A path gets a `<polyline class="path-edge">` under `.path`, 16 wide in `--kerb`. `MapKey` swatches carry the state class. The chosen plot keeps its two outlines and its tab.
- In high contrast, ground, turf, patterns, edge and stone fill are `none` or white, from the theme blocks of slice 1.
- The map labels stay at 12 px (`LABEL_SIZE`), so the label tests do not change.
- Specificity: the churchyard `svg.sheet .plot` fill changes to `none`, then `svg.sheet .plot.taken` is `--stone`, then `svg.sheet .plot.selected` is `--tab`, in that order.

## L-D5 Slice 3: layouts and art (not built)

Files: `apps/*/src/theme.css`, `template/src/ui/register.css`, `assets/{churchyard-margin,gate-lantern,garden-margin}.svg`, `assets/origins.md`, `apps/churchyard-register/src/ChurchyardHome.tsx`, `apps/allotment-register/src/AllotmentHome.tsx`, `template/src/ui/{SiteMap,PlotDetails,Offer,Payments,Exchange,Settings}.tsx`, `site/src/{Home.tsx,site.css}`, `tests/unit/{churchAssets,gardenAssets,lookLayout}.test.ts`.

- Header: `header.app` is a grid with rows `var(--band) auto`. The art row is `::before`, the brand is in row 2 column 1, the menu in row 2 column 2. Bands: churchyard 80 and 52, allotment 64 and 48. Row 2 on plain `--sky` in the churchyard with ivory brand and underlined menu links, on paper with a 1 px ink line in the allotment.
- Art: the three files are replaced in place with drawings made for this project and checked by the two asset tests. `origins.md` is updated in the same step.
- Night ground: `--ground: var(--sky)`, `--on-ground: var(--sky-ink)` in the churchyard theme, with sheets (`.card` and the sections that become sheets) under every block of text. `header.app :focus-visible` uses `--focus-on-dark`. High contrast drops the night ground.
- Desks: `.desk` and `.garden-desk` take three columns with flex bases 340, 520 and 220 and the weights 25, 40 and 16, built as three wrappers. The index (`.link-group`) is the third column. `main` is at most 105rem on desks and the site map and 90rem on forms and records.
- The allotment desk: `.hero`, `.main-action` and `.tally` are one card.
- Start page: stripe, bar, title at `clamp(40px, 3vw + 22px, 64px)`, two doors, the Review Desk card, the visitor sheets.
- Other screens, one at a time, the desk first: site map, plot record, record a burial, make an offer, season fees, committee review, settings.

## L-D6 Slice 4: visitor files, print, market and the Desk (not built)

- Visitor files: `template/src/output/{visitorHtml,availabilityHtml}.ts` carry the same tab, gate and walk in their own CSS and SVG strings. System fonts only: `Georgia` for headings and `system-ui` for text. No `@font-face`.
- Print: `template/src/ui/print.css` gets the rules of the design inside `@media print`, with the `html svg.sheet` prefix so they outrank the themes: no ground, turf or edge, walk `#DADADA`, the chosen plot and tab `#E6E6E6`, every other plot fill `#FFFFFF`. Not yet tried in a browser print. `share-print.spec.ts` gets a grayscale check.
- Market: `examples/market/src/theme.css` gets its few values (paper `#FBF6EE`, ink `#2A2320`, action `#8E3B2F`). The pairs join `lookTokens.test.ts`. This replaces the market values in its comment, `#2B2118` on `#F6EFE3`, so the comment and the test must change together.
- Review Desk: built in its own repository with the values of L12. The entry fade is removed there, and `npm run lock:desk` here pins the new preview.

## L-D7 Tests, by requirement

| Requirement | Test | Slice |
|---|---|---|
| L1 | `tests/unit/lookTokens.test.ts` | 1 |
| L2 | `tests/unit/fonts.test.ts`, `tests/unit/release.test.ts` (fonts), `tests/browser/release.spec.ts` (built site) | 1 |
| L3 | `tests/browser/accessibility.spec.ts` | 1 |
| L4 | `tests/browser/release.spec.ts` and a look at the retaken picture | 1 |
| L5, L6 | `tests/unit/{lookComponents,lookMap,sheet,visitor}.test.ts`, `layout.spec.ts` | 2 |
| L7, L8 | `tests/unit/{churchAssets,gardenAssets,lookLayout}.test.ts`, `layout.spec.ts` | 3 |
| L9 to L12 | `tests/unit/{visitor,privacy,lookPrint}.test.ts`, `share-print.spec.ts`, `market-example.spec.ts`, `release.spec.ts` | 4 |
| L13, L14 | `tests/unit/{copy,screenWords,siteCopy}.test.ts`, `check-public`, `check-release` | all |

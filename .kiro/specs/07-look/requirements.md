# 07 Look: requirements

This spec covers a new look for every Plotwarden screen: one set of design values, two self hosted fonts, shared components, the map, the page layouts, the start page, the visitor files, print, the market example and the Review Desk. It changes how things look and where they sit. It changes no word, no record, no rule of the contracts in spec 00 and no behaviour except where a requirement below says so.

The design was handed over as a folder of mockups (HTML references and pictures at 1440 wide), a token file and a README. That folder is a reference only. No file, markup, font link or support script of it is copied into this repository. Where the README and the mockups differ, the mockups were followed. Where the mockups name one value twice with two names, this spec says which name it uses (design L-D1).

The work is four slices. Each leaves the registers working and the checks passing.

| Slice | Name | Tasks |
|---|---|---|
| 1 | Values, fonts and the heading ring | 7.1 to 7.8 |
| 2 | Shared components and the map | 7.9 to 7.14 |
| 3 | Layouts and art | 7.15 to 7.22 |
| 4 | Visitor files, print, the market example and the Review Desk | 7.23 to 7.29 |

Terms. **Ground** is what the page stands on. **Sheet** is a card on the ground. **Main action** is the one filled button of a view. **Ring** is the focus outline. **Night ground** is the churchyard indigo `#232A5C` as a page ground. **Pair** is a text colour on its background, or a control edge or ring on what is behind it. **Large text** is 18.66 px bold or 24 px and more. **Held back** is a value that is written in the design but not yet turned on, because the markup it needs comes in a later slice.

Each requirement lists its tests and its slice. A pair is measured with the contrast formula of WCAG 2.1 on the hex values that the stylesheets declare, after every `var()` is resolved in the order the browser applies the files. Expected ratios are the floors below, not the output of the code.

---

## L1 Design values and contrast (slice 1)

Tests: `tests/unit/lookTokens.test.ts`, browser `layout.spec.ts`, `accessibility.spec.ts`. Implements R23.4 of spec 00 and the contrast rows of the experience steering.

1. The stylesheets shall declare the churchyard hexes `#22252C`, `#FAF5E9` and `#232A5C`, and the allotment hexes `#1B312A`, `#F7F5E8`, `#CFE7DF` and `#2F6B4F`, each as a value of a custom property and not only in a comment.
2. When a pair of the churchyard list, the allotment list or the shared list of design L-D2 is measured, normal text shall reach at least 4.5 to 1. Large text, a control edge and a focus ring shall reach at least 3 to 1.
3. When the page is in high contrast, the pairs of design L-D2 for high contrast shall reach the same floors, with paper `#FFFFFF`, ink `#000000` and the high contrast ring `#0000CC`.
4. When text or a ring stands on the night ground, ivory `#FAF5E9` text, `#C9CEE6` second text and the ring `#FFD27A` shall each reach their floor on `#232A5C`. This is measured now, although the night ground is held back (L1.7).
5. When an app has no theme, every new custom property shall have a default in `register.css` that gives the look of today: the same ground, ink, main action fill, corners and control height. Fonts are the one change a themeless app takes, because the fonts load for every app (L2).
6. The allotment theme shall not contain `Georgia`, `arch-inner`, `gate-lantern` or `churchyard-margin`, and the churchyard theme shall keep `.sheet .arch-inner`, `.sheet .path-line`, a `.sheet .path` stroke of 12 to 19, the `fold-drift` animation on `.mist`, `header.app::before` and `.brand` in grid row 2 (the asset tests of specs 03 and 04).
7. When a value needs markup, layout or art from a later slice, the stylesheet shall not turn it on in this slice, so that no text stands on a ground without a sheet under it. The held back values are named in design L-D3 and in the tasks of the slice that turns each on.
8. When a stylesheet is read, it shall name no remote address in `url()`, `@import` or `@font-face`.

## L2 Fonts (slice 1)

Tests: `tests/unit/fonts.test.ts`, browser `release.spec.ts`. Implements R22.1 of spec 00.

1. The registers, the start page and the Review Desk preview shall use Atkinson Hyperlegible Next at weights 400, 600 and 700 for text. The Churchyard Register, the start page and the Desk headings shall use Gelasio at weights 600 and 700. The Allotment Register headings shall use the text font.
2. The font files shall be woff2 only, in the repository under `assets/fonts/`, served from the same origin, each with `font-display: swap`. No stylesheet shall name a font host.
3. When the declared `unicode-range` of each family is read, it shall cover U+0020 to U+007E (Basic Latin), U+00A0 to U+00FF (Latin 1 Supplement), U+0100 to U+017F (Latin Extended A) and each of `·` U+00B7, `’` U+2019, `“` U+201C, `”` U+201D and `…` U+2026.
4. When the font files are measured, the files of the built site together shall be under 150,000 bytes. The measure is recorded in the evidence rows with the exact sum.
5. When the site is built and assembled, the built site shall hold each font file once, in the `assets/` folder of the hub. The styles of each app shall point at that copy, and each page shall still load the families that it used before. The offline list that `sw.js` carries shall name each font file once.
6. When the licences are checked, `THIRD_PARTY_NOTICES.md` shall hold a row for `@fontsource/atkinson-hyperlegible-next` and for `@fontsource/gelasio` at the pinned version with the licence the package states, and the text of the SIL Open Font License 1.1 with each copyright line. `scripts/check-licenses.mjs` shall fail when either row is missing.
7. When a visitor file or a printed document is built, it shall hold no `@font-face`, no `url(` and no font file. It uses system fonts only (L9).
8. When any page of the built site is opened with the network blocked except the site's own origin, no font shall be requested from another origin, and the page shall make zero requests to another origin.

## L3 No ring on a heading that script focuses (slice 1)

Tests: browser `accessibility.spec.ts`. Implements the keyboard and focus rules of the experience steering and R23.4 for the ring that stays.

1. When a page opens and script moves focus to an `h1` or `h2` with `tabindex="-1"`, the heading shall have focus and its computed `outline-style` shall be `none`.
2. When a person reaches a button, a link or a field with Tab, its ring shall still show: `outline-style` `solid`, width 3 px, with at least 3 to 1 against what is behind it.
3. When focus moves by script to a heading, the move shall still happen on every route that moves it today (`RegisterShell.tsx`, `ChurchyardHome.tsx`, the hub). No focus move is removed.

## L4 Proof pictures after the motion (slice 1)

Tests: browser `release.spec.ts` (the picture step), a look at the retaken pictures.

1. When a proof picture is taken, the step shall first wait until no animation that has an end is still running on the page. An animation that never ends (the band mist) is left out of that wait.
2. When the Review Desk entry picture is retaken, the Desk shall be drawn at full strength in it.

## L5 Shared components (slice 2)

Tests: `tests/unit/lookComponents.test.ts`, browser `layout.spec.ts`, `accessibility.spec.ts`. Implements R23.2 and R23.4.

1. Every interactive target shall be at least 44 by 44 px with at least 12 px between distinct targets, measured by `measureLayout` at 360 by 640 and 1920 by 1080. A button is 46 px high, a field 48 px, an index row 44 px, a check row 44 px. The box of a check box or a radio button is 24 px, drawn inside an input that is a 44 by 44 px target.
2. Body text and fields shall be 16 px, labels 14 px bold, nothing under 12 px.
3. When a field is invalid, its border shall be 3 px solid in the error colour, a mark and the message shall follow it, and focus shall move to the first invalid field.
4. When a notice reports a save, it shall carry a tick mark and the border `--ok`. When it reports an error, it shall carry a mark and the border `--error`. Both marks are hidden from a screen reader and never carry meaning alone.
5. A button shall have four tiers: main action (filled, one per view), outlined, quiet (underlined), and index row (a chevron, hidden from a screen reader). Hover and pressed shall change only background and border colour, in 120 ms. Each pair of fill and text, in each state, shall reach its floor.
6. When motion is reduced or contrast is high, no transition shall run.
7. Text of the hub shall not move: no animation and no transition.

## L6 The map (slice 2)

Tests: `tests/unit/sheet.test.ts`, `tests/unit/visitor.test.ts`, `tests/unit/lookMap.test.ts`, browser `layout.spec.ts` and `paper-map.spec.ts`. Implements the map requirements of spec 02 and the map key rules of the experience steering.

1. Each plot shall keep its shape for its state, never colour alone: free is an empty outline, reserved a slash, taken a solid centre dot, unusable a cross, needs checking a dotted outline. The word sits next to its symbol in the key, and the key sits directly under the map in one frame with it, with no gap between the two frames.
2. The drawing shall give each plot its state as a class (`free`, `reserved`, `taken`, `unusable`), and the key swatch shall carry the same class.
3. A section shall be filled with its row ground, an arch plot shall have a turf ellipse under it and, when its code is drawn, a base at its foot behind the code, a bed shall have the crop pattern when taken and the furrow pattern otherwise, and a path shall have an edge line under it. These fills repeat what the mark says and add nothing.
4. In high contrast and in print, the ground, turf, patterns, edge and stone fill shall be removed.
5. Names and codes on the map shall be 14 px, bold, in the shipped text font. No label shall overlap another label, a plot, a path line, the code tab, the north arrow, the gate mark, an outline or the frame, at 360 and at 1440 wide, in both registers and on the two practice maps of the start page. The width that the sheet reserves for a name or a code shall be at least the width that the browser draws, with the shipped font. `LABEL_SIZE` and `CHAR_WIDTH` come from a measure of that font in a browser.
6. Plots shall not be buttons. Every map selection has an equal list selection.
7. The chosen plot shall keep its two outlines and its code tab, with the tab fill in `--tab`.

## L7 Layouts and art (slice 3)

Tests: `tests/unit/churchAssets.test.ts`, `tests/unit/gardenAssets.test.ts`, `tests/unit/lookLayout.test.ts`, browser `layout.spec.ts`. Implements R23.2 and the art rules of specs 03 and 04.

1. The header shall be a grid whose first row holds the art and nothing else. The brand shall be in grid row 2, and the menu shall share that row. No word and no control shall stand on a picture.
2. The churchyard band shall be 80 px high (52 px under 37.4375rem) and the allotment band 64 px (48 px).
3. The three art files shall start with `<svg `, balance their tags, have a whole number view box, be under 9,000 characters and hold no `<text`, script, image, style or outside address. The garden file shall keep the ids `ridge` and `sprout`, a title, `aria-hidden="true"`, more than 10 `use` elements and none of the churchyard colours.
4. When a desk opens at 1920 by 1080, the job, the chosen plot with its map and the index shall stand in three columns that wrap in that order when narrow. At 360 by 640 they shall stack.
5. When any route is opened at 360 by 640, `scrollWidth` shall not exceed `clientWidth`, and every page shall keep an edge inset of 16 px.
6. The churchyard page shall stand on the night ground, and each block of text on it shall stand on a sheet or be ivory text that reaches its floor on `#232A5C`. In high contrast the page shall drop the night ground.
7. `main` shall be at most 105rem wide on the desks and the site map, and 90rem on forms and records.
8. The start page shall show the title, the line, two doors, the Review Desk card and the visitor sheets, with the words that the copy catalog holds.

## L8 Motion (slices 1 to 4)

Tests: `tests/browser/layout.spec.ts` (the motion cases), `tests/unit/preferences.test.ts`. Implements R23.3 and Z2 of spec 06.

1. When the app setting is "Reduce motion", or the system asks for it and the app setting follows the device, no animation, no transition and no smooth scroll shall run, and the mist shall be hidden.
2. When contrast is high, the mist shall be hidden.
3. The Review Desk shall draw at full strength with no entry fade.

## L9 Visitor files (slice 4)

Tests: `tests/unit/visitor.test.ts`, `tests/unit/privacy.test.ts`, browser `share-print.spec.ts`. Implements R15 and R22.

1. A visitor file shall stay one sealed file on system fonts, with the same content policy as today, no `@font-face`, no remote address, no image, one data block and one script.
2. The family file and the plot seeker file shall use the code tab, the gate and the walk of the new look, with the same fill, in the same colours, in a form that needs no file.
3. A visitor file shall hold no private canary, as today.

## L10 Print (slice 4)

Tests: `tests/unit/lookPrint.test.ts`, browser `share-print.spec.ts`. Implements the print rules of specs 03 and 04 and Z15 of spec 06.

1. When a register sheet is printed, text shall be black on white, the walk `#DADADA`, the chosen plot and its tab `#E6E6E6`, and no ground, turf, pattern or edge fill shall print.
2. When a printed page is checked in grayscale, every state shall still be told apart by its mark and its word.
3. The words shall never say that anything was printed.

## L11 The market example (slice 4)

Tests: `tests/conformance/market.test.ts`, `tests/unit/lookTokens.test.ts`, browser `market-example.spec.ts`. Implements T34.

1. The market example shall give its own values in `examples/market/src/theme.css` only, and the shared foundation shall need no change for them.
2. Its pairs shall reach their floors: ink `#2B2118` on paper `#F6EFE3`, and its main action fill with its text.

## L12 The Review Desk (slice 4)

Tests: the Desk repository's own tests, `release/desk-preview.lock.json`, browser `release.spec.ts`. Implements spec 05 and the lock of Z10 in spec 06.

1. The Desk shall be built in its own repository with its own values: ground `#F8F4EA`, sheet `#FFFDF8`, tint `#E3ECEA`, ink `#22252C`, second ink `#4D5560`, line `#8A8472`, brand `#2B5A5F`. Its pairs shall reach their floors.
2. The Desk shall size itself by the room the host gives it and shall leak no style into the host page.
3. When the Desk is changed, `npm run lock:desk` shall be run here and the lock shall match the preview.

## L13 The words (all slices)

Tests: `tests/unit/copy.test.ts`, `tests/unit/screenWords.test.ts`, `tests/unit/siteCopy.test.ts`. Implements R23.1 of spec 00.

1. No on screen word shall be added, changed or removed by this spec. The copy comes from the catalogs of the apps and `template/src/ui/copy.ts`, never from the mockups.
2. Marks that are added (chevron, tick, error mark, ring on a chip) shall be drawn by CSS or by an element hidden from a screen reader, and shall add no word.

## L14 Nothing from outside (all slices)

Tests: `scripts/check-public.mjs`, `scripts/check-release.mjs`, browser `layout.spec.ts` (`requests.external`). Implements R22.1.

1. No stylesheet, script or markup shall load a font, a picture or a script from another origin.
2. The browser specs shall record every request and find none to another origin.
3. The repository shall hold no file from the design handoff, no support script of it and no font link of it.

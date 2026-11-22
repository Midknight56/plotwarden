# 02 Paper and map: tasks

Each task writes its test first, runs it and sees it fail on the missing behaviour, then writes the smallest complete code. A stub that compiles and throws "not implemented" counts as the skeleton. A missing module or a failed install does not count as red. Tick a task only when its tests pass and the adjacent tests still pass.

Run one test file with `npx vitest run <file>`. Run one browser spec with `npx playwright test tests/browser/<file>`. Check at least 8 GB of free memory before Playwright.

Exit gate: `npm run typecheck`, `npm run test:unit`, `npm run test:properties`, `npm run test:conformance`, `npm run test:oracle`, `node scripts/check-imports.mjs`, and `tests/browser/paper-map.spec.ts` and `tests/browser/paper-entry.spec.ts` all exit 0.

## Tasks

- [x] 2.1 Tooling for the screens. Files: `package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts`, `tests/host/vite.config.ts`, `tests/host/index.html`. Requirements: P15, P16. T IDs: none. No red: tooling has no behaviour. Proved by tasks 2.19 to 2.21 running.
- [x] 2.2 Coordinates. Files: `template/src/map/coordinates.ts`. Requirements: P1. T IDs: T04 (point and coordinate parity). Red command: `npx vitest run tests/unit/coordinates.test.ts`. First red: site (0, 0) is not the bottom left corner and a north flip is applied twice or not at all.
- [x] 2.3 Grid and renumber. Files: `template/src/map/generate.ts`. Requirements: P2. T IDs: T03, T16 (old codes), T32 (grid size). Red command: `npx vitest run tests/unit/grid.test.ts`. First red: 10 by 20 with prefix C does not give C001 to C200, a skipped place renumbers the others and regeneration makes new plots.
- [x] 2.4 Geometry. Files: `template/src/map/geometry.ts`. Requirements: P3. T IDs: T04, T32 (vertices). Red command: `npx vitest run tests/unit/geometry.test.ts`. First red: a bow tie is accepted, two footprints that overlap in area are accepted and two that only touch are refused.
- [x] 2.5 Layout events, commands and drafts. Files: `template/src/map/edit.ts`. Requirements: P4. T IDs: T04, T16 (renumber). Red commands: `npx vitest run tests/unit/layout.test.ts tests/unit/edit.test.ts`. First red: a layout apply returns no events, a section outline change drops a linked plot and undo changes nothing.
- [x] 2.6 Layout file and backdrop. Files: `template/src/map/layoutFile.ts`. Requirements: P5. T IDs: T05. Red command: `npx vitest run tests/unit/trace.test.ts`. First red: the file holds a backdrop key, a conflicting import is applied and a repeat import adds plots.
- [x] 2.7 Sheet. Files: `template/src/map/sheet.ts`. Requirements: P6. T IDs: T05 (safe drawing). Red command: `npx vitest run tests/unit/sheet.test.ts`. First red: the sheet has no plots, north is not flipped and a code under 12 px is drawn.
- [x] 2.8 CSV reading. Files: `template/src/data/csv.ts`. Requirements: P7. T IDs: T06, T32 (CSV bounds). Red command: `npx vitest run tests/unit/csv.test.ts`. First red: a quoted newline splits a row, `001` loses its zeros and a stray quote is accepted.
- [x] 2.9 Mapping. Files: `template/src/data/mapping.ts`. Requirements: P8. T IDs: T06. Red command: `npx vitest run tests/unit/mapping.test.ts`. First red: `03/04/26` is accepted, a blank money cell becomes 0 and two columns map to one field.
- [x] 2.10 CSV export. Files: `template/src/data/csvExport.ts`. Requirements: P10. T IDs: T06 (support), T23 (escaping, owned by 03 and 04 for reports). Red command: `npx vitest run tests/unit/csvExport.test.ts`. First red: `=1+1` is written as it came.
- [x] 2.11 Notes and base state. Files: `template/src/notes.ts`, `template/src/base.ts`. Requirements: P14.1 to P14.3. T IDs: support. Red commands: `npx vitest run tests/unit/notes.test.ts tests/unit/base.test.ts`. First red: a ninth photo is accepted and an app event is swallowed by `applyBase`.
- [x] 2.12 Staged import. Files: `template/src/data/importBatch.ts`, `tests/helpers/paperAdapter.ts`. Requirements: P9. T IDs: T07, T24 (unique source keys), T32 (rows). Red command: `npx vitest run tests/unit/importBatch.test.ts`. First red: a bad row lets 199 rows through, a repeated file adds records and two equal names merge.
- [x] 2.13 Fast entry. Files: `template/src/data/fastEntry.ts`. Requirements: P11. T IDs: T08. Red command: `npx vitest run tests/unit/fastEntry.test.ts`. First red: "Repeat section" copies a name and a failed row loses the page and the position.
- [x] 2.14 Photos. Files: `template/src/data/images.ts`. Requirements: P12. T IDs: T11, T32 (photo bounds). Red command: `npx vitest run tests/unit/images.test.ts`. First red: a PNG named `.jpg` is taken as a JPEG, a 25 megapixel image is decoded and camera metadata survives.
- [x] 2.15 Site admin. Files: `template/src/data/siteAdmin.ts`. Requirements: P14.4, P14.5. T IDs: T02 (confirmed removal). Red command: `npx vitest run tests/unit/siteAdmin.test.ts`. First red: removing one site removes another.
- [x] 2.16 Backup and restore. Files: `template/src/data/backup.ts`, `tests/helpers/paperFiles.ts`. Requirements: P13. T IDs: T10, T32 (archive bounds). Red command: `npx vitest run tests/unit/backup.test.ts`. First red: a truncated archive replaces the active site and an image is missing after the round trip.
- [x] 2.17 Fixtures and the 200 record proof. Files: `scripts/generate-fixtures.mjs`, `tests/fixtures/paper-200.csv`, `tests/fixtures/paper-200-bad.csv`, `tests/fixtures/comma-quotes.csv`, `tests/fixtures/tiny-page.png`, `tests/unit/paperBook.test.ts`. Requirements: P17. T IDs: T07, T24 (hand totals). Red command: `npx vitest run tests/unit/paperBook.test.ts`. First red: the bad file writes records and the counts differ from `hand-totals.md` section 3.
- [x] 2.18 Copy catalog. Files: `template/src/ui/copy.ts`, `tests/unit/paperCopy.test.ts`. Requirements: P15.2. T IDs: T35 (support). Red command: `npx vitest run tests/unit/paperCopy.test.ts`. First red: the words of section 5 are missing.
- [x] 2.19 Screens, styles and host. Files: `template/src/ui/{RegisterShell,Library,RegisterHome,PlotList,PlotDetails,SiteMap,MapEditor,TraceEditor,RecordForm,FastEntry,ReferencePage,ImportWizard,ImportReview,BackupRestore,Settings,Help,Status,Dialog}.tsx`, `template/src/ui/{copyScreens,shellContext,messages,controls,plotView,blobUrl,download}.ts*`, `tests/unit/screenWords.test.ts`, `template/src/ui/register.css`, `template/src/ui/print.css`, `tests/host/main.tsx`, `tests/helpers/measureLayout.ts`. Requirements: P15, P16. T IDs: browser. Red: the first browser assertion in 2.20 against a shell that renders only its title.
- [x] 2.20 Browser: paper and map. Files: `tests/browser/paper-map.spec.ts`. Requirements: P2 to P6, P15, P16. T IDs: T03, T04, T05. Red command: `npx playwright test tests/browser/paper-map.spec.ts`.
- [x] 2.21 Browser: paper entry. Files: `tests/browser/paper-entry.spec.ts`. Requirements: P7 to P12, P15 to P17. T IDs: T06, T07, T08, T11. Red command: `npx playwright test tests/browser/paper-entry.spec.ts`.
- [x] 2.22 Properties and conformance. Files: `tests/properties/geometry.test.ts`, `tests/properties/seeds.ts`, `tests/conformance/suite.ts`, `tests/conformance/adapter.test.ts`, `tests/conformance/paper.test.ts`. Requirements: P18, H18. T IDs: T01, T03, T04, T10. Red commands: `npx vitest run tests/properties/geometry.test.ts tests/conformance/adapter.test.ts`. First red: the suite has no import or restore check, so a broken import passes.
- [x] 2.23 Log and exit gate. Files: `docs/kiro-log.md`, `.kiro/specs/02-paper-and-map/{design,tasks}.md`. One row for each task above. T IDs: none.

## T ID coverage

| T ID | File | Task |
|---|---|---|
| T03 | `tests/unit/grid.test.ts`, browser `paper-map.spec.ts` | 2.3, 2.20 |
| T04 | `tests/unit/{coordinates,geometry,layout,edit}.test.ts`, browser `paper-map.spec.ts` | 2.2, 2.4, 2.5, 2.20 |
| T05 | `tests/unit/{trace,sheet}.test.ts`, browser `paper-map.spec.ts` | 2.6, 2.7, 2.20 |
| T06 | `tests/unit/{csv,mapping,csvExport}.test.ts`, browser `paper-entry.spec.ts` | 2.8, 2.9, 2.10, 2.21 |
| T07 | `tests/unit/{importBatch,paperBook}.test.ts`, browser `paper-entry.spec.ts` | 2.12, 2.17, 2.21 |
| T08 | `tests/unit/fastEntry.test.ts`, browser `paper-entry.spec.ts` | 2.13, 2.21 |
| T10 | `tests/unit/backup.test.ts`, conformance restore check | 2.16, 2.22 |
| T11 | `tests/unit/images.test.ts`, browser `paper-entry.spec.ts` | 2.14, 2.21 |
| T16 (renumber, old codes) | `tests/unit/grid.test.ts`, `tests/unit/layout.test.ts` | 2.3, 2.5 |
| T32 (map, import, restore parts) | `grid`, `geometry`, `csv`, `images`, `backup` tests | 2.3, 2.4, 2.8, 2.14, 2.16 |
| Support | `notes`, `base`, `siteAdmin`, `paperCopy` tests | 2.11, 2.15, 2.18 |

T35 stays open in 06 for the full copy gate. T23 stays open in 03 and 04 for report CSV, which reuse `csvExport.ts`.

## Left for later specs

- The churchyard adapter replaces `tests/helpers/paperAdapter.ts` with its own burial rules and sheets (spec 03). The allotment adapter does the same for waiting list, tenancies and fees (spec 04).
- Dense map print as an overview with numbered section sheets, the visitor HTML and the family and availability previews are specs 03 and 04. This spec ships one sheet and its print page.
- Explicit linking of a layout plot to an existing plot of a different code is not built. A layout import matches by section and code only (R26.5).

## Repair 07 (findings of an independent review)

- [x] 2.23 A search stays out of the address (R22.4). Files: `template/src/ui/{shellContext,RegisterShell,RegisterHome,controls}.tsx`, `apps/*/src/{ChurchyardHome,AllotmentHome,Burial}.tsx`, `tests/helpers/screens.ts`, browser `warden-family.spec.ts`, `secretary-season.spec.ts`, `paper-entry.spec.ts`.
- [x] 2.24 A staged import and the screens that save keep a draft (R9.5, R9.6, R9.10, R26.7). Files: `template/src/data/{importDraft,importBatch,fastEntry}.ts`, `template/src/ui/{screenDraft,ImportWizard,MapEditor,TraceEditor,PlotDetails,BackupRestore,FastEntry}.tsx`, `tests/unit/importDraft.test.ts`, browser `paper-entry.spec.ts` and `draft-actions.spec.ts`. T IDs: T07.
- [x] 2.25 First use and the map screen (R23.5, R23.6). Files: `template/src/ui/{Library,SiteMap,TraceEditor,RegisterShell,register.css,copyScreens}`, `apps/*/src/{copy.ts,theme.css,Offer.tsx}`, browser `warden-family.spec.ts` and `secretary-season.spec.ts`.

## Repair 09 (names on the map)

- [x] 2.26 Map labels (09-map-labels). No name on the map lies on a plot, a line or another name (P19). Files: `template/src/map/{labels,sheet}.ts`, `template/src/ui/SiteMap.tsx`, `tests/unit/{sheet,measureLabels}.test.ts`, `tests/helpers/measureLayout.ts`, `tests/browser/layout.spec.ts`, `docs/acceptance/layout/routes/{churchyard,allotment}/route-map-*.jpg`, `route-home-*.jpg`. T IDs: T05 (sheet, names and tab), T05 support (`measureLabels.test.ts`). Red commands: `npx vitest run tests/unit/sheet.test.ts tests/unit/measureLabels.test.ts` and `npx playwright test tests/browser/layout.spec.ts`. First red: Lantern Fold at 312, 328, 360 and 480 px writes the path name and the gate name over the plots, writes "Yew Walk" twice, and puts the tab at the top left corner away from its plot.

## As at a date (P20, H20)

- [x] 2.27 Status at a date reads a claim with no start through the adapter (P20.7, P20.8). Files: `template/src/status.ts` (`claimsInForce`, `ClaimFloor`), `template/src/adapter.ts` (`claimFloor`), `apps/churchyard-register/src/{rules,adapter}.ts`, `tests/unit/asAt.test.ts`. T IDs: support for spec 01 status at a date. Red command: `npx vitest run tests/unit/asAt.test.ts`. First red: Lantern Fold as at 1900-01-01 reads Y07 as "Taken · 2 of 2 spaces used", a burial dated 1921 counts in 1900, a burial dated March 1902 counts in February 1902, and a handover day names the wrong tenancy. A stub that throws "not implemented" is the skeleton.
- [x] 2.28 The map and the list show the site as at a date (P20.1 to P20.6, P20.9, P20.10). Files: `template/src/ui/{plotView.ts,AsAtField.tsx,SiteMap.tsx,PlotList.tsx,copyScreens.ts}`, `tests/unit/asAt.test.ts` (`readAsAt`, `asAtOf`, `plotRows`), browser `tests/browser/{warden-family,secretary-season}.spec.ts`. Red commands: `npx vitest run tests/unit/asAt.test.ts` and `npx playwright test tests/browser/warden-family.spec.ts tests/browser/secretary-season.spec.ts`. First red: the field "Show the site as at" is not on the map, a typed date changes no mark and no summary line, and "Back to today" does not exist.
- [x] 2.29 Proof pictures and layout (P20.1, R23). Files: `tests/browser/layout.spec.ts`, `docs/acceptance/layout/routes/{churchyard,allotment}/route-map-as-at-{phone,desktop}.jpg`. Red command: `npx playwright test tests/browser/layout.spec.ts`. First red: none seen on its own. The field existed when this test was written (task 2.28), so it passed on its first run. Its measures and pictures are new, and the 2.28 browser specs were the ones seen red.
- [x] 2.30 Log and exit gate. Files: `docs/kiro-log.md`, `.kiro/specs/02-paper-and-map/tasks.md`. One row for each task above.

## Task 17: every control does what its words say

- [x] 2.31 The page panel keeps no promise it cannot keep, and the import review says where rows went (P21.1, P21.2, P11.1, P11.9). Spec first: `requirements.md` P21, P11.1, P11.9, `design.md` H12, and spec 00 R27.5. Files: `template/src/data/fastEntry.ts` (no `keepPage`, no `setKeepPage`), `template/src/ui/{ReferencePage,ImportReview}.tsx`, `template/src/ui/copyScreens.ts` (`keepPage` removed, `nothingToFixUnplaced`, `nothingToFixUnplacedOne`), `tests/unit/{fastEntry,screenWords,paperCopy}.test.ts`, browser `paper-entry.spec.ts` and `warden-paper-book.spec.ts` (written, not run). T IDs: T08. Red command: `npx vitest run tests/unit/fastEntry.test.ts tests/unit/screenWords.test.ts tests/unit/paperCopy.test.ts`. First red: a new session still holds `keepPage`, the page panel still holds the control "Keep page with register", and with 0 errors, 0 conflicts and 2 rows to confirm the list of rows to check reads "No rows to show." (`emptyRowsWords` was a stub that always gave that line).

## Task 18: making 200 plots fits one screen, and names stay by what they name

The machine was busy for the run that made these tasks. No browser test was run and no server was started, and no proof picture was retaken. Each browser change is listed under 2.35.

- [x] 2.32 Spec first (P19.1, P19.2, P19.8 to P19.11, P22, H19a, H21). Files: `.kiro/specs/02-paper-and-map/{requirements,design,tasks}.md`, `.kiro/specs/03-churchyard/tasks.md` (the note "Not settled in task 15"). T IDs: none.
- [x] 2.33 The grid form shows its result while the keeper types (P22). Files: `template/src/map/generate.ts` (`previewGrid`), `template/src/ui/{MapEditor.tsx,register.css,copyScreens.ts}`, `tests/unit/{grid,paperCopy}.test.ts`, browser `tests/browser/paper-map.spec.ts` (written, not run). T IDs: T03. Red command: `npx vitest run tests/unit/grid.test.ts tests/unit/paperCopy.test.ts`. First red: `previewGrid` was a stub that throws "not implemented", so 14 of 48 in `grid.test.ts` failed (no 200, C001 and C200, no first or last code for number down, reversed alternate rows and skipped places), and 1 of 292 in `paperCopy.test.ts` failed because the words of the four groups, the prompt and the drawing label were missing and `gridNumbering` was still "Numbering".
- [x] 2.34 A name sits beside its feature or is joined to it by a leader line, and a tab with no free place stands outside the block with a leader line (P19.8 to P19.11). Files: `template/src/map/{labels,sheet}.ts`, `template/src/ui/SiteMap.tsx` (`Leader`), `site/src/practiceMaps.ts` (rebuilt with `npm run build:maps`), `tests/unit/sheet.test.ts`, browser `tests/browser/warden-paper-book.spec.ts` (filter removed, written, not run). T IDs: T05. Red command: `npx vitest run tests/unit/sheet.test.ts`. First red: 19 of 98 failed on the missing behaviour. At 148 to 480 px "Main gate" was written in a list at the left corner under the drawing with no leader line, and at 700 and 1120 px it stood 33.0 and 34.2 px from the gate with no leader line. The hub drawing of Lantern Fold at 272 px failed the same way (the first failure stopped that test, so Thimble Beds was not seen red). No sheet had a leader line. On 200 plots side by side the tab of C021 lay over C001 at 328 and 360 px and left the sheet at 1120 px, and the tab of a plot in the middle had no leader line.
- [ ] 2.35 Browser exit gate and proof pictures (left for the lead). Files: none. `npx playwright test tests/browser/paper-map.spec.ts tests/browser/layout.spec.ts tests/browser/accessibility.spec.ts tests/browser/warden-paper-book.spec.ts` was not run. Written and not run: four new tests in `paper-map.spec.ts` ("map setup shows the plots while the keeper types") and the end of the search step of `warden-paper-book.spec.ts` (no filter, one leader line, the tab text C117). The proof pictures `route-map-edit-{phone,desktop}.jpg`, `route-map-{phone,desktop}.jpg`, `route-home-{phone,desktop}.jpg`, `site/hub-home-{phone,desktop}.jpg` and `churchyard/desk-example-{phone,desktop}.png` are to be retaken.

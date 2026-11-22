# 03 Churchyard: tasks

Each task writes its test first, sees it fail on the missing behaviour (a stub that compiles and throws "not implemented", never a missing module), then writes the smallest complete code. A task is ticked only when its test passes. Expected values come from `tests/fixtures/expected/hand-totals.md`. T IDs repeat the owner table in spec 00.

- [x] 3.1 Spec 03 and hand totals section 4 (worked before code). Files: `.kiro/specs/03-churchyard/*`, `tests/fixtures/expected/hand-totals.md`. T IDs: none.
- [x] 3.2 App scaffold and the fake database register for tests. Files: `apps/churchyard-register/{index.html,package.json,vite.config.ts}`, `apps/churchyard-register/src/types.ts`, `tests/helpers/churchEnv.ts`, `tests/helpers/lanternFold.ts`. T IDs: none (feeds T13).
- [x] 3.3 Burial rules: spaces, partial dates, unknown identity, unplaced to placed, corrections, source history. Files: `src/rules.ts`, `tests/unit/burial.test.ts`. T IDs: T13. C1.
- [x] 3.4 Reservation rules: holder kept apart from the deceased, requests, dated release and conversion. Files: `src/rules.ts`, `tests/unit/reservation.test.ts`. T IDs: T14. C2.
- [x] 3.5 Memorial and approval rules. Files: `src/rules.ts`, `src/review.ts`, `tests/unit/memorial.test.ts`. T IDs: T15. C3, C4, C7.
- [x] 3.6 Fields, adapter and import of the Burials sheet, and the conformance suite. Files: `src/fields.ts`, `src/adapter.ts`, `tests/unit/churchAdapter.test.ts`, `tests/conformance/church.test.ts`. T IDs: T01 (church run), T07 (church sheet). C1.
- [x] 3.7 History and period report data. Files: `src/history.ts`, `tests/unit/churchHistory.test.ts`. T IDs: T21 (church part). C6.
- [x] 3.8 Family file: projection, closed schema, public label check. Files: `src/projection.ts`, `tests/unit/visitor.test.ts` (family part). T IDs: T22 (family part). C4, C5.
- [x] 3.9 Family HTML and print, private report print, and the private report table and CSV (`src/history.ts`, `tests/unit/churchReport.test.ts`). Files: `template/src/output/{familyMap,visitorHtml,print}.ts`, `tests/unit/report.test.ts`, `tests/unit/visitor.test.ts` (HTML part). T IDs: T22 (family part), T23 (private and family print part). C5, C6.
- [x] 3.10 Copy catalog and error words. Files: `src/copy.ts`, `tests/unit/churchCopy.test.ts`. T IDs: T35 (church part). C9.
- [x] 3.11 Walkthrough and the shell extension points. Files: `src/walkthrough.ts`, `template/src/data/seed.ts`, `template/src/adapter.ts`, `template/src/ui/{shellContext,RegisterShell,Library,SiteMap,PlotDetails,ImportReview}.tsx`, `tests/unit/churchWalkthrough.test.ts`, `tests/unit/seed.test.ts`. T IDs: T30 (church part). C8.
- [x] 3.12 Art and the look. Files: `assets/{gate-lantern,churchyard-margin,plot-symbols}.svg`, `assets/origins.md`, `apps/churchyard-register/src/theme.css`, `tests/unit/churchAssets.test.ts`. T IDs: none (feeds browser). C10.
- [x] 3.13 Screens. Files: `src/{main,ChurchyardHome,Burial,Reservation,Memorial,Unplaced,FamilySheet,BurialReport}.tsx`, `src/intent.ts`, `tests/unit/churchScreens.test.ts`. T IDs: none (browser). C9.
- [x] 3.14 Browser: warden to family. Files: `playwright.config.ts`, `tests/browser/warden-family.spec.ts`, `docs/acceptance/layout/churchyard/*.png`. T IDs: browser `warden-family.spec.ts`. C1 to C10.
- [x] 3.15 Log and exit gate. Files: `docs/kiro-log.md`, this file. T IDs: none.

## Not settled in spec 03

- The plan lists "Use neutral outline" among the public map fields. Task 10 builds it as "Show other plots as plain outlines" (C5.10): footprints of the other plots with no code, state, ID or count.
- "Open source" opens the burial record, which shows its source ref and page text. A paper page photo is not linked to a burial. Photos are added with the shared controls on the plot screen.
- Stone photo linking is covered by unit tests. The browser spec does not add a photo.
- Print is checked by reading the document handed to a hidden frame. No page was printed and no print dialog was driven. A4 and Letter on paper, and the grayscale look on paper, are not observed.
- Only headless Chromium was run. Firefox, WebKit and a real phone were not.
- The mist is hidden, not only stopped, when motion is reduced or contrast is high. That follows the shared rule "no mist" for reduced motion.
- No real warden or family member used these screens. The words and the order of steps are untried by a person.
- A burial date typed on the form is entered at the precision chosen, in year first form. Free text such as "March 1874" is read only by the spreadsheet import.
- An approval returns to review when the name, the unknown flag, the plot or (if the year was approved) the year changes. A change to a date that leaves the year alone does not.
- Lantern Fold uses the shared practice register machinery in the same database, in the `walkthrough` workspace, not a second database. It is isolated by workspace and by site, and `restartWalkthrough` removes only that site.

## Repair 07 (findings of an independent review)

- [x] 3.16 A burial dated by a year or a month is checked for overlap from the earliest day that date could mean (R8.9). A family file checks the public name of each burial and any word of a living name (R15.10, R15.11). Files: `template/src/commands.ts` (`overlapFrom`), `apps/churchyard-register/src/{rules,projection}.ts`, `apps/allotment-register/src/projection.ts`, `template/src/output/privacy.ts`, `tests/unit/{burial,visitor}.test.ts`. T IDs: T13, T22.

## Task 10: the family map shows the way

- [x] 3.17 Plain outlines, two direction fields and a map with no label on a walk. Spec first (`requirements.md` C5.10 to C5.12, `design.md` K2, K5, K5a, K10). Files: `template/src/output/{privacy,familyMap,visitorHtml,print}.ts`, `apps/churchyard-register/src/{types,rules,projection,walkthrough,copy,FamilySheet}.ts(x)`, `tools/inspector/*` (no change expected), `tests/unit/{visitor,inspect,churchCopy}.test.ts`, `tests/properties/privacy.test.ts`. T IDs: T22. C5.10, C5.11, C5.12.
- [x] 3.18 Print proof: the A4 page of a family location, of the plot seeker sheet and of the private season report, saved as PDF and as a picture of page 1. Files: `tests/browser/share-print.spec.ts`, `docs/acceptance/print/*`. T IDs: browser `share-print.spec.ts`. C5.9, C5.12.
- [x] 3.19 Docs and log: `docs/privacy.md`, `docs/judge-guide.md` if a word changed, proof pictures, `docs/kiro-log.md`. T IDs: none.

## Not settled in task 10

- The one way in for the whole site travels in urials[].directions, as before, because task 10 allows exactly two new key paths. A file with no approved burial therefore carries no way in. A top level key for it needs a change to the contract.
- The gate and path names of Lantern Fold have no clear place on a drawing 320 px wide, so they are written under the map beside a sample of their mark. A wider drawing would be shrunk below 12 px text on a phone.
- A line to a burial has the limit of a note (4,000 characters), like the way in. No shorter limit was chosen.
- The A4 pictures of page 1 are the print document drawn in print media with the page margin, not pictures of the PDF. No PDF rasteriser is installed. No page was printed.
- 
pm run assemble:site refused on this machine: the sibling Desk checkout is at another commit than release/desk-preview.lock.json names, though its three file hashes match. dist/site was assembled by the same steps with the Desk files already in dist/site/review, after their hashes were compared with the lock. The lock was not touched.

## Task 15: the 200 record book on the real register

- [x] 3.20 Spec first (`requirements.md` C11, `design.md` K13, spec 02 P8.8 and P17.6). Files: `.kiro/specs/03-churchyard/*`, `.kiro/specs/02-paper-and-map/requirements.md`. T IDs: none.
- [x] 3.21 "Name" matches "Recorded name" with no choice by the keeper, through a field alias. Files: `template/src/adapter.ts` (`FieldDef.aliases`), `template/src/data/mapping.ts`, `apps/churchyard-register/src/fields.ts`, `tests/unit/mapping.test.ts`. T IDs: T06. C11.3. Red command: `npx vitest run tests/unit/mapping.test.ts`. First red: the Burials sheet leaves the heading "Name" unmatched.
- [x] 3.22 The practice book: one source for the fixture and the build, the link on the Import screen, the build step and the site inventory. Files: `scripts/lib/paperBook.mjs`, `scripts/generate-fixtures.mjs`, `scripts/lib/site.mjs`, `scripts/lib/siteScan.mjs`, `package.json` (`church:build`), `template/src/ui/{shellContext.ts,ImportWizard.tsx,copyScreens.ts}`, `apps/churchyard-register/src/main.tsx`, `tests/unit/{release,paperCopy}.test.ts`. T IDs: T36 (inventory). C11.1, C11.2. Red command: `npx vitest run tests/unit/release.test.ts`. First red: the assembled site has no `churchyard/practice-book.csv`.
- [x] 3.23 Browser: the 200 record book on the real register. Files: `tests/browser/warden-paper-book.spec.ts`, `docs/acceptance/layout/churchyard/paper-book-import-{phone,desktop}.png`. T IDs: browser. C11.4, C11.5. Red command: `npx playwright test tests/browser/warden-paper-book.spec.ts`.
- [x] 3.24 Guide, log and exit gate. Files: `docs/judge-guide.md`, `tests/browser/judge-guide.spec.ts`, `docs/kiro-log.md`, this file. T IDs: browser `judge-guide.spec.ts`.

## Not settled in task 15

- On the dense map of the 200 record book (200 plots side by side) the code tab of a plot in the middle of the grid has no free place, and the shared layout measure reports `label_on_plot` for it ("the text of the code tab lies over a plot shape"). Spec 02 H19 lets the cheapest place win when none is clear, so this is the existing design and not a new fault, but it breaks P19 on a real dense book. `warden-paper-book.spec.ts` filters that one rule, by name, at the end of its search step, and measures every other rule there. Task 18 (spec 02, P19.10, H19a) built the tab outside the grid with a leader line for the register map (`template/src/map/{sheet,labels}.ts`), and the filter was taken out of `warden-paper-book.spec.ts`. That spec was written and was not run in the run that changed it, so the exception is removed in the code and in the spec, and stays unproved in a browser until the lead runs it. The family map (`template/src/output/familyMap.ts`) keeps its own tab placement and is not changed.
- The practice book is written by `npm run church:build`. `npm run church:dev` serves the app without it, so the link on the Import screen finds no file there.
- Only the Churchyard Register offers a practice book. The Allotment Register has no invented waiting list file yet.
- Headless Chromium only. No real person tried the practice book, so the words of the guide steps and their order are untried by a person.

## Task 17: the words of a plot agree with the record and with the map

- [x] 3.25 A plot with a reservation and no burial says "No burials in this plot."; a released reservation says it was reserved; the line of Y07 agrees with the family map (C12). Spec first: `requirements.md` C12. Files: `apps/churchyard-register/src/{ChurchyardHome.tsx,Reservation.tsx,copy.ts,walkthrough.ts}` (`reservationLine`, `noBurialsInPlot`, `reservationWasReleased`; `releasedOn` removed), `tests/unit/{churchScreens,churchCopy,visitor,walkthrough}.test.ts`, browser `warden-family.spec.ts` (written, not run). T IDs: T22 (the line), T35 (church part). Red command: `npx vitest run tests/unit/churchScreens.test.ts tests/unit/churchCopy.test.ts tests/unit/walkthrough.test.ts`. First red: the plot screen drew "No reservations." under "Burials", a released reservation read "is reserved" (`reservationLine` was a stub that always said so), and the approved line of LF-07A was "Seventh stone along the walk, on the north side." The pictures `docs/acceptance/layout/churchyard/family-file-*.png` and the print pictures that hold the old line are retaken by the browser run.

## Not settled in task 17

- A released reservation still shows the reason as typed. A reason that ends in a full stop reads with two. The release form does not strip it.
- A plot with a reservation and no burial shows the reservation line in the same list as the burials under the heading "Burials". The heading was not changed.
- The plot screen words are checked by drawing `ChurchPlotExtras` to static markup with a fake register and shell. The browser spec was not given a new step for the plot screen. Only the family file line has a browser assertion.

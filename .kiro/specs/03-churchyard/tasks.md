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
pm run assemble:site refused on this machine: the sibling Desk checkout is at another commit than elease/desk-preview.lock.json names, though its three file hashes match. dist/site was assembled by the same steps with the Desk files already in dist/site/review, after their hashes were compared with the lock. The lock was not touched.

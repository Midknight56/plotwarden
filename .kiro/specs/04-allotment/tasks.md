# 04 Allotment: tasks

Each task writes its test first, sees it fail on the missing behaviour (a stub that compiles and throws "not implemented", never a missing module), then writes the smallest complete code. A task is ticked only when its test passes. Expected values come from `tests/fixtures/expected/hand-totals.md` sections 2 and 5. T IDs repeat the owner table in spec 00.

- [x] 4.1 Spec 04 and hand totals section 5 (worked before code). Files: `.kiro/specs/04-allotment/*`, `tests/fixtures/expected/hand-totals.md`. T IDs: none.
- [x] 4.2 App scaffold, state types and the fake database register for tests. Files: `apps/allotment-register/{index.html,package.json,vite.config.ts}`, `src/types.ts`, `tests/helpers/{gardenEnv,thimbleBeds,gardenCanaries}.ts`. T IDs: none (feeds T17 to T20). A1 to A4.
- [x] 4.3 Waiting list and queue: stable ties, one open request, withdraw, correction of the joined date. Files: `src/rules.ts`, `tests/unit/queue.test.ts`. T IDs: T17. A1.
- [x] 4.4 Offers: skip with reason, reply date, accept, decline, release, one open offer, atomic accept. Files: `src/rules.ts`, `tests/unit/offer.test.ts`. T IDs: T18. A2.
- [x] 4.5 Tenancy and handover: half open dates, same day handover, gap, overlap refused with both refs. Files: `src/rules.ts`, `tests/unit/tenancy.test.ts`. T IDs: T19. A3.
- [x] 4.6 Fees: integer pennies, season, charges, receipts, waiver, overpayment, reversal, currency fixed, a balance never moves. Files: `src/fees.ts`, `src/rules.ts`, `tests/unit/fees.test.ts`. T IDs: T20. A4.
- [x] 4.7 Fields, adapter, the Waiting list and Tenancies sheets, and the conformance suite. Files: `src/fields.ts`, `src/adapter.ts`, `tests/unit/allotAdapter.test.ts`, `tests/conformance/allotment.test.ts`. T IDs: T01 (allotment run), T07 (garden sheets). A8.
- [x] 4.8 Review facts. Files: `src/review.ts`, `tests/unit/gardenReview.test.ts`. T IDs: T24 support. A7.
- [x] 4.9 Season report data, table and CSV. Files: `src/fees.ts` (`seasonReport`, `reportTable`, `reportCsv`), `tests/unit/report.test.ts` (season part). T IDs: T23 (season report part). A5.
- [x] 4.10 Availability file: projection, closed schema, public label check, HTML page and print. Files: `src/projection.ts`, `template/src/output/{availabilityMap,availabilityHtml,print}.ts`, `tests/unit/visitor.test.ts` (availability part). T IDs: T22 (availability part). A6.
- [x] 4.11 Copy catalog and error words. Files: `src/copy.ts`, `tests/unit/gardenCopy.test.ts`. T IDs: T35 (allotment part). A10.
- [x] 4.12 Walkthrough Thimble Beds. Files: `src/walkthrough.ts`, `tests/unit/gardenWalkthrough.test.ts`. T IDs: T30 (allotment part). A9.
- [x] 4.13 Oracle comparison and property sets for the garden rules. Files: `tests/oracle/allotment.test.ts`, `tests/properties/allotment.test.ts`, `tests/properties/seeds.ts`. T IDs: oracle and property sets for T17, T19, T20. A1 to A4.
- [x] 4.14 Label placement on the shared sheet. Files: `template/src/map/{sheet,labels}.ts`, `tests/unit/{sheet,measureLabels}.test.ts`, `tests/helpers/measureLayout.ts`. T IDs: T05 support (drawing). A12.
- [x] 4.15 Art and the look. Files: `assets/garden-margin.svg`, `assets/origins.md`, `apps/allotment-register/src/theme.css`, `template/src/adapter.ts` (`plotShape` "bed"), `template/src/ui/SiteMap.tsx`, `tests/unit/gardenAssets.test.ts`. T IDs: none (feeds browser). A11.
- [x] 4.16 Screens. Files: `src/{main,AllotmentHome,WaitingList,Offer,Tenancy,Handover,Season,Payments,SeekerSheet,SeasonReport}.tsx`, `src/intent.ts`, `tests/unit/gardenScreens.test.ts`. T IDs: none (browser). A10.
- [x] 4.17 Browser: secretary season. Files: `playwright.config.ts`, `package.json` (`allot:*` scripts), `tests/browser/secretary-season.spec.ts`, `docs/acceptance/layout/allotment/*.png`. T IDs: browser `secretary-season.spec.ts`. A1 to A12. The browser run also changed `src/adapter.ts` (`labels`), `src/intent.ts`, `src/{Tenancy,Offer,WaitingList,Payments}.tsx`, and `tests/unit/allotAdapter.test.ts`.
- [x] 4.18 Log and exit gate. Files: `docs/kiro-log.md`, this file. T IDs: none.

## Not settled in spec 04

- Overdue release cannot be reached through the screens. A reply date must be on or after the offer date, and the walkthrough date is fixed, so no offer is overdue in the browser. "Release overdue offer" is covered only by the unit tests in `offer.test.ts`.
- No real garden secretary used these screens. The wording and the order of steps are untried by a person. Only headless Chromium on one Windows machine was used. No other browser and no phone.
- Print was checked by reading the document handed to a hidden frame, and the CSV by its file name. No page was printed on paper and no print dialog was driven. The CSV text itself is checked in `report.test.ts`, not in the browser.
- `gardenScreens.test.ts`, `gardenAssets.test.ts` and the five screens `Season`, `Payments`, `Handover`, `SeekerSheet` and `SeasonReport` were written after the code, not before. The screens test passed on its first run. A mutation check (a missing key, a hard coded title) made it fail, then it was reverted.
- `tests/unit/sheet.test.ts`: the existing test "labels a section above its outline" now uses a map with the section alone, because the shared fixture's path lies exactly on the outline edge. Its assertions (x 28, y 44) are unchanged. Later in the run the same file gained an outline distance check, and the bed plan in the walkthrough, `thimbleBeds.ts` and the `beds()` fixture moved the Sunny Row beds up by 200 and the two outlines away from the walk, so a label fits between them on a 360 px sheet. Nothing was loosened.
- Waiting list import: a row's join sequence is the counter when the import opens plus its Tie order, or its place in the file. A repeated place gives the row error `sequence_used`. The shared importer was not changed to reorder rows.
- There is no screen to change the currency of a garden. It is set when the register is made, and the walkthrough sets GBP.
- A plot that is chosen for the availability file but is not free when the file is made is left out of it, and the preview says so. A plot with a future tenancy is not counted free.
- The season report "Fees received" is net of reversals. A reversed charge is left out of the totals.
- The label rules are checked with a letter width of 7.4 px in unit tests and with the real text boxes in the browser. A sheet narrower than 360 px was checked only in unit tests (width 320).
- The seeker file offers a section choice only when two or more sections are listed. With one section listed the choice is not shown, and the browser spec checks that it is absent. The choice itself is covered in `visitor.test.ts` and was not driven in the browser.

## Task 17: the amount hint names no coin

- [x] 4.19 The amount hint reads "An amount with two decimal places, such as 12.00." (A13). Spec first: `requirements.md` A13. Files: `apps/allotment-register/src/copy.ts` (`hint_amount`), `tests/unit/gardenCopy.test.ts`, browser `secretary-season.spec.ts` (written, not run). T IDs: T35 (allotment part). Red command: `npx vitest run tests/unit/gardenCopy.test.ts`. First red: the hint read "A whole number of pence, such as 12.00.", which named a coin and described the typed amount wrongly.

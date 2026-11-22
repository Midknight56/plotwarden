# 04 Allotment: requirements

This spec builds the Allotment Register, the second app on the template. It implements the garden parts of the contracts in spec 00 and may not contradict them. Where a requirement says "the register", it means the Allotment Register running on the shared shell.

Terms. **Applicant** is a living person on the waiting list. **Application** is that person's one open request on a site. **Offer** is a dated hold of one free plot for one application, with an optional reply date. **Tenancy** is one holder's use of one plot over a half open span `[start, endExclusive)`. **Season** is a named span with a due date and a standard fee. **Charge** is the amount assessed for one tenancy in one season. **Receipt** is a payment already received elsewhere. **Reversal** undoes one receipt or one unpaid charge by its exact amount. **Availability file** is `plot.availability.v1`.

Each requirement lists its T IDs and the requirements of spec 00 it implements. The expected values come from `tests/fixtures/expected/hand-totals.md` sections 2 and 5.

---

## A1 Waiting list and queue order

Tests: T17. Implements R11.3, R12.

1. When an applicant is added, the register shall store the person, the joined date and a join sequence taken from a per site counter, and shall never change that sequence. A correction to the joined date needs a reason and names the original event. No command changes a sequence.
2. When eligible applicants are listed, the register shall order them by joined date, then join sequence, then application ID. The order is the same on reload, after a restore and after any display sort by name.
3. When two applicants share a joined date, the sequence alone decides. An application ID that sorts the other way never changes the order.
4. When a person already has an open request on this site, the register shall refuse a second one with "Already has an open request". Two different people with the same name are two applications.
5. When an applicant has an open offer, the register shall leave them out of "Next applicant" and show "Offer pending" as the reason.
6. When a waiting list is imported with equal joined dates and no "Tie order" column, the register shall give sequences in the order of the file, once. When a "Tie order" column is given, its number decides the place within the import. A row that is already in the register is "Already in register" and its sequence stays as it was.
7. When a keeper withdraws a request, the register shall require a reason, take the application out of the queue and keep it in history. An applicant with an open offer cannot be withdrawn until the offer is closed.
8. When the waiting list is shown, it shall show position, name, joined date and the reason for any skipped or pending entry. With no applicants it shall say "No one is waiting."

## A2 Offers

Tests: T18. Implements R9, R12.5 to R12.8, R13.1 to R13.3, R8.

1. When a keeper offers a free plot, the register shall hold that plot for one application with a held claim from the offer date, and write the offer, the claim and the application change in one batch. The offer is a local record. The register never contacts the applicant.
2. When the offer is made, the register shall compute every applicant ahead of the chosen one in queue order and record why each was passed over: "Offer pending", "Preference does not fit", or an exceptional skip. An exceptional skip needs a reason typed by the keeper, and the register refuses the offer without it.
3. When a plot or an application would hold two open offers, the register shall refuse the second one and write nothing.
4. When an offer is accepted, the register shall end the hold, start the tenancy on the accept date, take the application out of the queue and mark the plot Taken, in one batch. A second accept of the same offer is refused and holds exactly one tenancy.
5. When an offer is declined, the register shall require the keeper to choose "Keep place" or "Leave list", end the hold and keep the offer in history. Keeping the place restores the application to its old position. Leaving the list withdraws it.
6. When an offer is past its reply date, the register shall show "Reply overdue" and keep the offer and the queue place until the keeper releases it. A release keeps the queue place unless the keeper chooses to withdraw the request. An offer with no reply date is never overdue.
7. When a keeper records an offer, the register shall say "{plot} reserved for {name}." and "Tell the applicant yourself." A repeat press during saving does nothing, and a second press after the result does not offer again.
8. When an offer is made on a backdated day, the register shall check the whole timeline of the plot, including later tenancies, and refuse an overlap with both source refs named.

## A3 Tenancy and handover

Tests: T19. Implements R10, R13.4, R13.5, R8.1, R31.10.

1. When a tenancy is recorded by hand, for history or from a paper source, the register shall store the holder, the plot, the start date, an optional end date and the source ref, and mark the plot checked.
2. When tenancies would overlap on one plot at any date, the register shall refuse the change and name both source refs and dates. A tenancy ends at the start of its end date.
3. When a keeper ends a tenancy with no successor, the register shall end the span at the chosen date and the plot is Free from that date.
4. When a keeper hands a plot over on day D, the register shall end the outgoing tenancy at the start of D and start the incoming one on D, in one batch. Both names, both dates and the old balance are shown before the keeper confirms. The old balance stays with the old tenancy and is never moved.
5. When a handover leaves a gap, the plot is Free for the gap.
6. When a past season is opened, the register shall show its charges, receipts, reversals and balances tied to their own tenancy and holder, with no double counting through a change of holder.
7. When one holder has several plots, each has its own tenancy and its own fees.

## A4 Fees

Tests: T20. Implements R11.2, R13.6 to R13.13.

1. When money is entered, the register shall store whole minor units in the site currency (GBP, EUR, USD or CAD), at most 99,999,999 per entry. A blank amount is unknown, not zero.
2. When a season is set up, the register shall take a name, a start date, an end date after it, an optional due date and a standard fee greater than zero. The standard fee is for future charges only.
3. When the keeper applies season charges, the register shall write one charge per tenancy and season. A tenancy that is already charged is left alone and named. When every chosen tenancy is already charged, the register writes nothing and says so.
4. When a fee is zero, the register shall accept it only as a waiver with a reason.
5. When a receipt is recorded, the register shall check it against the open balance of its charge, refuse more than the balance with "Amount exceeds the balance of {amount}." and keep the input editable.
6. When GBP 36.00 is charged and GBP 12.00 then GBP 24.00 are received, the balance is 24.00 and then 0.00. The messages are "GBP 12.00 recorded. GBP 24.00 still due." and "Paid in full."
7. When a charge still has receipts applied, the register shall refuse to reverse it. When a receipt is reversed, the register shall restore exactly its amount, once.
8. When a fee status is shown for a date, it shall be "Due" on and before the due date, "Overdue" from the next day, "Part paid" with a positive balance below the charge, and "Paid" at zero.
9. When a garden has any charge, the register shall refuse any change of its currency.
10. When fees are recorded, the register shall add no tax, no proration and no arrears transfer, send no money and store no card or bank detail.

## A5 Season report

Tests: T23 (season report part). Implements R29.3, R20.7, R31.9, R31.10.

1. When the keeper chooses a season and an "As at" date, the register shall show "Plot handovers", "Waiting list order", "Fees charged", "Fees received" and "Balance due", with each charge, receipt, reversal and balance on its own tenancy row.
2. When a receipt was reversed, "Fees received" counts it net, and the row shows the reversal beside it.
3. When the report is printed or exported, it shall be built from a plain table model, repeat headings and totals, never cut a row, and say "Private". The CSV shall escape every cell that starts with `=`, `+`, `-`, `@`, tab or carriage return.
4. When a past season is chosen, the report shall use the tenancy and holder of that time, not today's holder.
5. When there are no charges, it shall say "No charges in this season."

## A6 Availability map for plot seekers

Tests: T22 (availability part). Implements R15.3, R15.6, R15.7, R15.9, R31.6, R31.7, R31.8, D9.

1. When the keeper builds an availability file, the register shall construct each field by hand from approved values: public site name, public gate name, public path names, public section names, public plot codes and visitor instructions. It lists only plots the keeper chose and that are free at the date. It has no person field of any kind, no fee, no queue position and no reason a plot is unavailable.
2. When a plot has an open offer, a tenancy, a hold, an unusable mark or an unchecked space at the date, the register shall leave it out of the free plots at once, even when the keeper chose it earlier.
3. When an availability preview, download or print is made, the register shall recompute every plot from the latest committed revision immediately before it writes. A preview made at an older revision says "Review public details again." and disables Download and Print.
4. When a public label holds a known applicant, tenant or contact string, the register shall flag the field before it builds the file.
5. When no plot is listed, the register shall still build the file and say "No free plots were listed on this date."
6. When the file is written as HTML, the register shall seal it with a Content Security Policy that allows only its own inline script and style, no network, no form. It works with script on (choose a section, show a location) and with script off (a plain list readable with browser Find). It shows "Available plots", "Choose section", "Show location", "Ask the secretary about this plot" and "As at {date}".
7. When the file is downloaded, its name holds the kind and the date only, and a warning says recipients can keep older copies.
8. When the file is printed, the register shall build a separate document from the visitor object alone, in A4 or US Letter, legible in grayscale.
9. When the public preview is shown, it lists the included fields and the excluded categories with their counts, and "Cancel" returns without writing a file.
10. A previously downloaded sheet keeps its own date.

## A7 Review facts

Tests: T24 support (spec 05 wraps them). Implements R17.3, R17.4.

1. When an offer is open and `asOf > replyBy`, the register shall raise `offer_late`. An offer with no reply date raises nothing. On the reply date itself nothing is raised.
2. When a charge has a positive balance and `asOf > dueOn`, the register shall raise `fee_late`. A charge with no due date raises nothing. On the due date nothing is raised.
3. A subject and a rule raise at most one fact. A label is "Record {n}" and holds no name, amount, contact or plot code.

## A8 Adapter, sheets and conformance

Tests: T01 (allotment run), T07 (Waiting list and Tenancies sheets). Implements R14, R7, R12.3.

1. When the app is built, the adapter shall satisfy the same conformance suite as the churchyard, paper and market adapters, unchanged.
2. When a Waiting list or Tenancies sheet is imported, each row shall be identified by `(siteId, sheet, sourceRef)`, shown in the same staged preview, and committed whole or not at all. The same file again adds nothing.
3. When a garden plot is created, the register shall give it exactly one space.
4. When a church command is sent to the Allotment Register, or a garden command to the Churchyard Register, the register shall refuse it as unknown.

## A9 Walkthrough

Tests: `tests/unit/gardenWalkthrough.test.ts` against hand totals sections 2 and 5. Implements R24.

1. When a keeper opens "Open Thimble Beds", the register shall make or open the walkthrough site in its own workspace, never in "My registers" and never sharing a store row with a register of the keeper's own.
2. When "Restart walkthrough" is chosen, the register shall delete and rebuild only the walkthrough site.
3. When the walkthrough is built, it shall match hand totals 2.1 and 5.2: six plots B01 to B06, three Taken, two Free, one Unusable, two applicants in order Tavi Bramblequill then Olin Reedwhorl, an older charge of GBP 30.00 on B02 that is overdue at 2026-04-20, and B03 with no charge.
4. When the register starts for the keeper's own data, it shall show no Thimble Beds record. "Start a register" never prefills.

## A10 Screens and words

Tests: `tests/unit/gardenCopy.test.ts`, `tests/unit/gardenScreens.test.ts`, browser `secretary-season.spec.ts`. Implements R23 and the Allotment Register table of the plan.

1. When the app opens, the first view shall name one job, "Offer the next free plot or start your register.", with one main action.
2. When a screen is chosen from the Allotment Register table of the plan, the register shall use only the words in `apps/allotment-register/src/copy.ts` and the shared catalog, with no dash between words.
3. When any screen shows at 360 by 640 or 1920 by 1080, it shall keep a 16 px edge, 12 px gaps, 44 by 44 px targets, 12 px text and no sideways scroll. Decoration never sits over a word or a control.
4. When an action is committing, the register shall show "Saving changes…" and ignore repeat presses. It says "Saved on this device." only after the transaction completes.
5. When a form is invalid, focus moves to the first invalid field. When a dialog closes, focus returns to its trigger.
6. Every action works by keyboard. A map selection has an equal list selection.

## A11 The look

Tests: `tests/unit/gardenAssets.test.ts`, browser measurements and screenshots. Implements R23.3, R23.4.

1. The app shall draw a garden plan sheet: garden ink `#1B312A` on `#F7F5E8`, a daylight band at the top, pale soil under the plan, grass paths, beds with a strip of hatching and a square peg that holds the plot code, and the same four state marks as the churchyard with their words.
2. The look shall not read as the churchyard: no indigo strip, no arches, no lantern, no mist. A first time visitor shall see a garden at a glance.
3. The art shall be one original SVG, `assets/garden-margin.svg`, recorded in `assets/origins.md`. It holds no text, script or address. It sits in a band of its own above the title and never under a word or a control.
4. When motion is reduced by the system or the app, nothing moves. High contrast removes the decoration.
5. The desk shall show the next free plot and the next applicant side by side with one main action, "Make an offer".

## A12 Map labels keep clear

Tests: `tests/unit/sheet.test.ts` (label placement), `tests/helpers/measureLayout.ts` and the browser specs. Implements R23.2, R26 for the shared sheet.

1. When the shared sheet places a gate label, a section label, a path label or a plot label, it shall keep the label's rectangle clear of every path line, of the code tab, of the north arrow, of the gate mark and of every other label, by at least 4 px, and inside the sheet by at least 8 px.
2. When no candidate place is clear, the sheet shall choose the place with the least overlap and never hide the label.
3. When a layout measurement runs on a screen with a sheet, it shall report any label that touches a path line, a tab, the north arrow or another label.

## A13 The amount hint names no coin

Tests: `tests/unit/gardenCopy.test.ts`. Implements R23, A4, A10. Task 17.

1. When a screen asks for an amount, its hint shall read "An amount with two decimal places, such as 12.00." The hint names no unit and no coin, because the currency is set once for the garden and the amount is typed in whole units with two decimals. An amount typed in other ways keeps the error "Enter an amount such as 12.00."

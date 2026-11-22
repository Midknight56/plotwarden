# 03 Churchyard: requirements

This spec builds the Churchyard Register, the first of the two apps on the template. It implements the churchyard parts of the contracts in spec 00 and may not contradict them. Where a requirement here says "the register", it means the Churchyard Register running on the shared shell.

Terms. **Burial** is the record of one deceased person in one space, or in no space while the location is unknown. **Reservation** is a dated hold on one space for a living **holder**. **Request** is a note that a living person wants the next free space. A request holds nothing. **Reading** is the wording on a stone. **Approval** is the keeper's choice to show one burial in a family file. **Family file** is `plot.family.v1`.

Each requirement lists its T IDs and the requirements of spec 00 it implements.

---

## C1 Recording a burial

Tests: T13. Implements R3, R5, R6, R7, R8.

1. When a warden records a burial in a space, the register shall write one burial, one `taken` claim that cannot end, and mark only that space checked.
2. When a burial targets a space that already holds a burial at an overlapping date, the register shall refuse it with "This plot is already taken.", name the other source ref in its detail, and leave the stored state unchanged.
3. When a plot has several spaces, the register shall give each burial its own space, never let one burial use two spaces, and refuse a burial when every space of the plot holds one.
4. When the burial date is year only, month and year, or unknown, the register shall store that precision and the original text, and shall start the claim on no day. When the date is a full day, the claim starts on that day.
5. When the warden chooses "Name unknown", the register shall store the burial with no recorded name and the unknown flag. When neither a name nor the flag is given, or both are given, the register shall refuse with a field error on "Recorded name".
6. When a burial is recorded with no space, the register shall store it as unplaced, write no claim, change no plot state, and list it under "Location to confirm".
7. When an unplaced burial is placed, the register shall keep its ID, source ref and date, add the claim for the chosen space, and refuse the placement if the space is taken, unchecked-and-reserved, or outside the site.
8. When a source ref is already used by a live burial in this site, the register shall refuse the new burial with "Source ref is already used."
9. When a keeper changes a burial's name, date or space, the register shall accept it only as a correction that names the original event, a source ref and a reason. "Move burial" voids the old claim and adds the new one. "Void incorrect record" voids the claim and keeps the burial in history.
10. When a correction would overlap another burial on the new space at any date, the register shall refuse it and show both source refs.
11. When two burials have the same recorded name, the register shall keep both and show source and date beside each. It shall offer "Possible name match" with "Keep separate" and "Link to existing person", and shall link only after the keeper chooses.

## C2 Reservations and requests

Tests: T14. Implements R4, R8.8, R10.

1. When a warden records a reservation, the register shall store the living holder as a person record separate from every burial, add one `held` claim from the start date, and refuse a space that is unchecked, retired, or already held or taken at an overlapping date.
2. When a reservation conflicts, the register shall refuse it and name the current reservation (source ref and dates) in its private detail.
3. When a warden records "Reserve for next applicant", the register shall store a request only. The request writes no claim. The space stays Free and no count of Reserved changes.
4. When a burial is recorded in a space held by a reservation without naming that reservation, the register shall refuse it with the reservation in its detail, and shall not convert it.
5. When the warden names the reservation, the register shall show it, then convert it: the held claim ends at the burial date and the burial claim starts on it, in one batch. The deceased may differ from the holder. The holder is never copied into the burial.
6. When a conversion has a date that is not inside the reservation, or a space that differs from the reservation's, the register shall refuse it.
7. When a reservation is released, the register shall require a date and a reason, end the claim on that date, keep the reservation and its reason in history, and leave the space Free from that date.
8. When a request is later given a space, the register shall turn it into a reservation with its own start date and keep the request in history.

## C3 Stones and readings

Tests: T15. Implements R17.2, R31.1, R15.5.

1. When a reading is saved, the register shall store its wording exactly as typed, including every line break, space and capital letter.
2. When a reading is marked "Unclear letters", the register shall keep that mark after a reload and raise the review fact `reading_unclear` for it.
3. When the keeper uses "Review reading", the register shall append an event that clears the mark. The earlier mark stays in history.
4. When a stone photo is linked, the register shall store only the private photo ID. Neither a file name nor an image byte goes into a reading.
5. When a reading, note, page ref or photo exists, the register shall treat it as private and keep it out of every visitor and committee object.

## C4 Approval for the family file

Tests: T15, T22. Implements R15.1, R15.5, R6.2, D7.

1. When a keeper chooses "Include this burial", the register shall store an approval with the name shown to visitors and whether the year is included. Approval needs a recorded name. A burial with "Name unknown" cannot be approved.
2. When an approved burial's name, unknown flag, shown year or place changes, the register shall mark the approval "Review again" and keep the burial out of the family file until the keeper approves it again.
3. When a burial is voided, the register shall drop its approval from the family file.
4. When a plot has several burials, the register shall give each its own approval, and the private preview shall show every unapproved co occupant as "withheld".

## C5 Family file

Tests: T22. Implements R15, R31.6, R31.7, R31.8, D9.

1. When the keeper builds a family file, the register shall construct each field from the approved values: public site name, public gate name, public path names, public section names, public plot codes, public directions, approved names and approved years.
2. When a living person, holder, contact, request, note, reading, page ref, photo or source ref exists, the register shall write none of them into the family object or its bytes. The family object has no person field apart from the approved deceased name.
3. When no burial is approved, the register shall still build the file and say "No names selected. You can still share the site map."
4. When a public label, section name, path name or directions text holds a known private full name or contact, the register shall flag the field and offer to clear it before the file is built.
5. When the file is built, the register shall mint fresh public IDs for the file and use no private UUID. Two files from one site shall share no ID.
6. When the file is built or printed, the register shall recompute approvals from the latest committed revision. A preview from an older revision shall say "Review public details again." and disable Print and Download.
7. When the family file is written as HTML, the register shall seal it with a Content Security Policy that allows only its own inline script and style, no network, no form and no remote font. It shall work with script on (search) and with script off (a plain list readable with browser Find).
8. When the file is downloaded, the register shall put the kind and the date in its filename and no private value, and warn that recipients can keep older copies.
9. When the family file is printed, the register shall build a separate print document from the family object alone, in A4 or US Letter, legible in grayscale.

## C6 Private report

Tests: T23. Implements R29, R5.3, R20.7.

1. When the keeper chooses a period, the register shall headline "Burial and reservation report" and "Private register report", show "Through {date}", and count burials, reservations made and reservations released by the event date, never by today's plot state.
2. When a burial date is partial, the register shall count it inside the period only if every day it could mean is inside, leave it out if none is, and otherwise count it under "Date incomplete".
3. When the report lists open spaces, the register shall count only checked free spaces and describe a free space in a part occupied grave explicitly, for example "Y07, space 2 is free. Space 1 holds a burial."
4. When a burial has no space, the register shall list it under "Location to confirm", apart from the counts of states.
5. When a period holds no events, the register shall say "No events in this period."
6. When the report is exported as CSV, the register shall escape every cell that starts with `=`, `+`, `-`, `@`, tab or carriage return.
7. When the report is printed, the register shall repeat the headings, scope and totals on each page and never cut a row in two.

## C7 Review facts

Tests: T15, T22. Implements R16, R17.1, R17.2.

1. When a burial has no space, the register shall raise `placement_missing` for it. When a reading is unclear, the register shall raise `reading_unclear` for it. Each subject and rule raises at most one fact.
2. When a fact is built, its label holds no person name, no inscription, no amount, no note and no private site title. Spec 05 wraps these facts in the review packet.

## C8 Walkthrough

Tests: hand totals section 1 and section 4. Implements R24.

1. When a keeper opens "Open Lantern Fold", the register shall make or open the walkthrough site in its own workspace. The walkthrough shall never appear in "My registers" and never share a store row with a register of the keeper's own.
2. When "Restart walkthrough" is chosen, the register shall delete and rebuild only the walkthrough site.
3. When the walkthrough is built, it shall match `tests/fixtures/expected/hand-totals.md` sections 1 and 4: Y01 to Y12, three free, two reserved, six taken, one unusable, thirteen spaces, eight burials of which one is unplaced, and the privacy canaries held in private fields.
4. When the register starts for the keeper's own data, it shall show no Lantern Fold record. The "Start a register" path shall never prefill.

## C9 Screens and words

Tests: browser `warden-family.spec.ts`, `tests/unit/churchCopy.test.ts`. Implements R23, section 5 of the plan.

1. When the app opens, the first view shall name one job, "Find a burial or start your register.", with one main action. Desktop shall show the verb, the search, the selected plot and the map side by side, with a top summary such as "Y07 · Yew Walk · Taken".
2. When a person chooses a screen from the Churchyard Register table of the plan, the register shall use only the words in `apps/churchyard-register/src/copy.ts` and the shared catalog, with no dash between words.
3. When any screen shows at 360 by 640 or 1920 by 1080, it shall keep a 16 px edge, 12 px gaps, 44 by 44 px targets, 12 px text and no sideways scroll. Decoration shall never sit over text or a control.
4. When an action is committing, the register shall show "Saving changes…" and ignore repeat presses. It shall say "Saved on this device." only after the transaction completes.
5. When a form is invalid, focus shall move to the first invalid field. When a dialog closes, focus shall return to its trigger.

## C10 The look

Tests: `tests/unit/churchAssets.test.ts`, browser measurements and screenshots. Implements R23.3, R23.4.

1. The app shall draw the churchyard field sheet: warm ivory paper with charcoal ink (`#22252C` on `#FAF5E9`), a dark indigo sky strip, one original gate lantern cutout and a low line of mist in the margin only.
2. Headstones shall be small engraved arches in rows, with open gravel walks between rows, named paths, the gate, a north arrow, the four state key directly below the sheet, and the selected plot with a dark double outline and its code on a paper tab.
3. The art shall be original SVG in the root `assets/` folder (`gate-lantern.svg`, `churchyard-margin.svg`, `plot-symbols.svg`) with `assets/origins.md` saying it was drawn for this project, and no external reference.
4. When motion is reduced by the system or the app, the mist shall not move. High contrast shall remove the mist.

# 00 Contracts: requirements

This spec fixes the shared contracts every later spec builds on: identity, records, dates, status, sources, queues, protected fields, the template and adapter boundary, the visitor and committee projections, the exchange files shared with the Review Desk repository, and limits. Later specs (01 to 06) implement these requirements and may add detail. They may not contradict them.

Terms. **Register** is either app built on the template. **Keeper** is the warden or secretary using it on their device. **Desk** is the Plotwarden Review Desk in its own repository. **Space** is one addressable place inside a plot. **Effective date** is the local calendar date a change applies to. **Write time** is the UTC instant it was saved.

Each requirement lists the T IDs that test it and the spec that owns the implementation.

---

## R1 Identity

Tests: T02, T03, T16. Owner: 01-foundation.

1. When the register creates a site, plot, space, section, person, burial, reservation, memorial, attachment, application, offer, tenancy, season, ledger entry or event, the register shall give it a locally generated UUID that is never derived from a name, code, date or row position.
2. When a keeper renames a plot, moves it on the map, changes its holder or changes the keeper of the register, the register shall keep the plot ID and every space ID unchanged.
3. When a keeper creates a site, the register shall bind it to exactly one app kind and never let a site of one kind open in another app.
4. When a library holds several sites, the register shall scope search, waiting lists, fees and reports to the open site by default.
5. When a visitor or committee file is built, the register shall mint its public or review identifiers separately and never write a private UUID into it.

## R2 Plot codes and aliases

Tests: T03, T16. Owner: 01-foundation, 02-paper-and-map.

1. When a keeper enters a plot code, the register shall accept 1 to 24 visible characters and keep the code exactly as typed for display, including case and leading zeros.
2. When the register checks code uniqueness within a site, the register shall compare the trimmed, case folded form and reject a code whose form equals any current code or any prior code in the same site.
3. When a plot is renamed, the register shall add the old code to `priorCodes`, keep it searchable, link it to the current code, and reserve it from reuse.
4. When a keeper searches, the register shall rank an exact current code first, then an exact prior code, then name matches, match names regardless of case and accents, and keep the original spelling on screen.
5. When a plot with records is archived, the register shall require every obligation on it to be closed first, show "A plot with an open commitment cannot be archived." otherwise, and keep its codes as a searchable location alias.

## R3 Plots with more than one space

Tests: T12, T13. Owner: 01-foundation, 03-churchyard.

1. When a warden sets churchyard plot capacity, the register shall accept a whole number of identified spaces from 1 to 12, each with its own ID and label.
2. When a garden or market plot is created, the register shall give it exactly one space.
3. When a burial is recorded, the register shall assign it to exactly one space, or to no space when the location is unknown.
4. When a burial targets a space that already holds a burial, the register shall refuse it with "This plot is already taken." and leave the stored state unchanged.
5. When a plot has spaces in different states, the register shall show the primary map mark in the order Taken, then Reserved, then Free, then Unusable, and show the counts, for example "Taken · 1 of 2 spaces used".
6. When any space in a plot is unchecked, the register shall flag the whole plot "Needs checking".
7. When the register counts "Available spaces", the register shall count only checked free spaces. When it counts "Free plots", the register shall count only plots whose spaces are all checked and all free.
8. When a space is active or referenced by any past event, the register shall refuse to remove it. Only a checked empty space with no history may be retired.

## R4 Plots with more than one person

Tests: T13, T14, T22. Owner: 03-churchyard, 04-allotment.

1. When a plot holds burials of several people and a living reservation holder, the register shall keep each as a separate record and never treat the holder as one of the deceased.
2. When a reservation is converted to a burial, the register shall show the reservation and ask which burial to record, and shall accept a deceased person different from the holder.
3. When a family file is prepared for a plot with several burials, the register shall list each burial with its own approval and show any withheld co occupant as "withheld" in the private preview only.
4. When a member holds several garden plots, the register shall allow one tenancy per plot and keep their fees per tenancy.
5. When two people have identical names, the register shall keep separate person records, separate requests and separate burials, and show source and date beside each name.

## R5 Unknown and partial dates

Tests: T13, T21, T06. Owner: 01-foundation, 03-churchyard.

1. When a burial date is entered, the register shall store exactly one of `unknown`, `year(y)`, `month(y,m)` or `day(y,m,d)` plus the original entry text, and never fill a missing month or day.
2. When a date is shown, the register shall show it at its stored precision ("1874", "March 1874", "3 March 1874", "Date unknown").
3. When a report covers a period, the register shall count a partial date in the period only if every day it could mean lies inside the period, leave it out if no day could, and otherwise count it under "Date incomplete".
4. When partial dates are sorted, the register shall order by earliest possible day, then finer precision first, then write order, with `unknown` last.
5. When an import holds a date like `03/04/26`, the register shall refuse to guess and require a year first format or one day and month order chosen for the whole import and shown in the preview.
6. When a calendar date is validated, the register shall accept leap days only in leap years and reject impossible dates with "Use a valid date."
7. When a site is created, the register shall store its local time zone. Effective dates shall be local calendar dates. Write times shall be UTC with an offset. Changing the zone later shall change only how write times are shown.

## R6 Unknown identity

Tests: T13, T16, T22. Owner: 03-churchyard.

1. When a burial has no known name, the register shall store it with the "Name unknown" flag and no recorded name, and show "Name unknown" with its plot code and source.
2. When a burial has "Name unknown", the register shall keep it findable by code and source ref, and never offer it for name publication in a family file.
3. When a living contact relates to a burial, the register shall never fill the deceased name from that contact.
4. When names look similar, the register shall offer "Possible name match" with "Keep separate" and "Link to existing person", and link only after an explicit keeper choice.

## R7 Source identity and stable source references

Tests: T06, T07, T13. Owner: 02-paper-and-map.

1. When a row is imported or entered, the register shall identify it by `(siteId, sheet, sourceRef)` and never by line number, filename, file order or a person's name.
2. When a row has no source ref, the register shall refuse to commit it and let the keeper build one from book, page and entry or from a stable spreadsheet column before commit.
3. When an imported row equals the stored row after normalization, the register shall mark it "Already in register" and write nothing for it.
4. When an imported row differs from the stored row with the same source key, the register shall show it under "Conflicts" with before and after values and require "Keep current" or "Record correction" before commit.
5. When the same file is imported again in any row order, the register shall create zero new records.
6. When a source ref is stored, the register shall keep its exact original text and keep it visible in history, reports and corrections.

## R8 Status and evidence

Tests: T12, T13, T14, T18, T19. Owner: 01-foundation.

1. When a space changes physical state, the register shall allow only: Free to Reserved (reservation or offer), Reserved to Free (explicit release or decline), Free or its own Reserved to Taken (burial or tenancy), Free to Unusable (with a reason), Unusable to Free (dated "Return to use"), and Taken to Free (garden tenancy end only).
2. When a warden presses "Mark free" on a space with a burial, the register shall refuse and offer "Correct an entry".
3. When a layout is generated or imported, the register shall mark every new space unchecked and never treat it as free.
4. When a keeper uses "Confirm empty plots", the register shall list the exact codes and require a positive action before marking them checked and free.
5. When a burial or tenancy is recorded, the register shall mark only its target space checked.
6. When a burial has no location, the register shall list it under "Location to confirm" apart from the four states and never give it coordinates from a name match.
7. When a plot list row asserts Taken or Reserved without matching domain evidence, the register shall keep it unchecked and "Needs checking".
8. When a reservation is released, the register shall require a date and a reason. When reservations conflict or a burial would exceed capacity, the register shall stop before commit. A queue request shall never count as a reservation.
9. When a burial has a year or a month and no full day, the register shall check overlap from the earliest day that date could mean, so a reservation that ended before that day does not refuse it. The stored claim and the stored date stay as entered. A burial with an unknown date has no earliest day and is checked against the whole timeline.

## R9 Events, operations and revisions

Tests: T09, T21. Owner: 01-foundation.

1. When a keeper confirms one intent, the register shall give it one operation ID and commit its events as one batch.
2. When the same operation ID arrives again with the same content, the register shall return the earlier result and write nothing.
3. When the same operation ID arrives with different content, the register shall refuse it and write nothing.
4. When a batch commits, the register shall compare the expected revision, reserve unique keys, write events and indexes and increment the revision by exactly one, all inside one IndexedDB readwrite transaction.
5. When the expected revision is stale, the register shall write nothing, show "This register changed in another tab." and offer "Keep my draft" and "Open latest".
6. When a transaction aborts, the register shall not show "Saved on this device." and shall keep the input in memory with "Download recovery file".
7. When events are replayed from the start, the register shall produce a state identical to the stored current state.
8. When a correction is recorded, the register shall append a new event naming the corrected event and a reason, and never change the stored bytes of an earlier event.
9. When a commit completes, the register shall notify other open tabs of the new revision. When a second tab holds an older schema version, the register shall ask it to close or reload.
10. When a screen that saves (import, map setup, trace, plot details, restore) shows a stale or a failed save, it shall offer the buttons of R9.5 and R9.6 inside that screen. A staged import shall keep its rows, its column choices, its left out rows and its fixed cells as a draft on the device, offer them again after a refresh, and check them again against the latest register when the keeper opens it.

## R10 Backdated changes

Tests: T13, T14, T19, T21. Owner: 01-foundation, 03-churchyard, 04-allotment.

1. When a backdated burial, reservation, offer or handover is entered, the register shall dry run the whole affected space or tenancy timeline, including later events.
2. When the dry run finds an overlap at any date, the register shall show both source refs and dates and require a correction to the conflicting record before commit.
3. When a report is printed as at a past date, the register shall say whether it uses current corrections or the original saved snapshot, and print the revision.
4. When a privacy approval is checked for any date, the register shall use the current approval.

## R11 Protected fields

Tests: T02, T12, T13, T17, T20. Owner: 01-foundation, 03-churchyard, 04-allotment.

1. When a keeper tries to change a protected field listed in design section D7, the register shall refuse the edit and name the allowed route, or no route where none exists.
2. When a garden site has any charge, the register shall refuse any change to its currency.
3. When an application is created, the register shall fix its join sequence and never change it, even when the display is sorted differently.
4. When a site is created, the register shall never change its kind, ID or lineage in ordinary operations.
5. When a burial is recorded, the register shall allow it to be moved or voided only through a correction naming the original and a reason.

## R12 Queue order and ties

Tests: T17, T18. Owner: 04-allotment.

1. When eligible applicants are listed, the register shall sort them by joined date, then join sequence, then application ID.
2. When applicants share a join date, the register shall keep the same order on reload, on reimport and after any display sort.
3. When a waiting list import has equal dates and no "Tie order" column, the register shall use the original file order once, store the resulting sequence, and never recompute it on a later import.
4. When an applicant has a pending offer, the register shall leave them out of the next eligible applicant.
5. When the next free plot is offered, the register shall choose the first eligible applicant whose recorded preference fits, show each skipped applicant and the reason, and require a reason and an event for any exceptional skip.
6. When a person already has an active request on a site's list, the register shall refuse a second one with "Already has an open request".
7. When an offer passes its reply date, the register shall show "Reply overdue" and keep the offer and queue place until a keeper releases it.
8. When an offer is declined, the register shall ask "Keep place" or "Leave list".

## R13 Offers, tenancy and fees

Tests: T18, T19, T20. Owner: 04-allotment.

1. When a keeper accepts an offer twice, the register shall hold exactly one tenancy for that plot and application.
2. When an offer is accepted, the register shall commit the tenancy, the queue exit and the plot status in one transaction.
3. When one space or one application would hold two open offers, the register shall refuse the second.
4. When a handover happens on day D, the register shall end the outgoing tenancy at the start of D, let the incoming one start on D, show both names, dates and the old balance first, and never move the old balance.
5. When tenancies would overlap on one plot at any date, the register shall refuse the change.
6. When money is entered, the register shall store integer minor units with the site currency (GBP, EUR, USD or CAD), at most 99,999,999 per entry.
7. When a receipt exceeds the open balance of its charge, the register shall refuse it with "Amount exceeds the balance of {amount}." and keep the input editable.
8. When a charge still has receipts applied, the register shall refuse to reverse it.
9. When a receipt is reversed, the register shall reverse its exact amount once.
10. When a season charge is applied twice to the same tenancy, the register shall keep one charge.
11. When a fee status is shown for a chosen date, the register shall show "Due" on and before the due date, "Overdue" from the next date, "Part paid" with a positive balance below the charge, and "Paid" at zero.
12. When a fee is zero, the register shall accept it only as an explicit waiver with a reason.
13. When fees are recorded, the register shall add no taxes, proration or arrears transfer, send no money, and treat a blank amount as unknown.

## R14 Template and adapter contract

Tests: T01, T34. Owner: 01-foundation, 06-access-and-release.

1. When an app is built, the register shall be created by `defineRegister(adapter)` with the adapter fields listed in design section D3.
2. When template code is built, the build shall fail if any file under `template/` imports from `apps/`, `site/`, the Desk, or a test helper, or if a pure template file imports React or IndexedDB.
3. When a shared template rule runs, it shall contain no branch on app kind.
4. When `decide(state, command, effectiveDate)` runs, the register shall return a typed error or an ordered event batch and perform no I/O.
5. When the market stall adapter runs against the unchanged template, the register shall pass the same conformance suite as the two apps.
6. When `stageImport` runs, the register shall write nothing to storage.
7. When the market stall recipe runs, a trader who needs 240 cm shall reserve a 250 cm stall and be refused a 200 cm stall with a message naming both widths, with no file under `template/` changed.
8. When `npm run create:app` targets a folder that exists and is not empty, it shall refuse and write nothing.

## R15 Visitor projections

Tests: T22, T23, T28. Owner: 03-churchyard, 04-allotment.

1. When a family file (`plot.family.v1`) is built, the register shall include only the fields in design section D9 and only burials the keeper approved, each with only the approved fields.
2. When no burial is approved, the register shall still offer the site map and say "No names selected. You can still share the site map."
3. When an availability file (`plot.availability.v1`) is built, the register shall contain no person field of any kind, no fee, no queue position and no reason an area is unavailable.
4. When a visitor file is parsed, the register shall reject any unexpected key at every depth.
5. When a burial's name or identity changes after approval, the register shall withdraw its name from visitor output until a keeper reviews it again.
6. When a visitor file or print is produced, the register shall recompute availability, approvals and field checks from the latest committed revision immediately before writing.
7. When a public label or instruction contains a known private full name or contact string, the register shall flag the field and offer a neutral alias before producing the file.
8. When the register prints a visitor sheet, the register shall build it from the visitor object alone in a separate document.
9. When an offer is recorded for a plot, the register shall drop that plot from any later availability file.
10. When a family file is built, the register shall check the public name of each approved burial. Unless it is the burial's recorded name itself, it shall hold no living person's name, no unapproved burial's name and no contact (an at sign, or seven or more digits). The burial's own recorded name is left out of this check. A failed check builds no file and names the field "names".
11. When a public label is checked against private names, the register shall also match any single word of at least three letters of a living person's name or an unapproved burial's name, and shall treat a single word name as a private name.

## R16 Committee projection

Tests: T24, T28. Owner: 05-exchange.

1. When a review file (`plot.review.v1`) is built, the register shall include only the fields in design section D10.
2. When a review file is built, the register shall include no person name, contact, amount, note, inscription, image, page ref or private site title.
3. When a keeper has not approved a site alias or label, the register shall use neutral defaults "Site 1" and "Record 2".
4. When a keeper previews the review file, the register shall show the exact outgoing fields and their count before download.
5. When a rule applies to a subject, the register shall emit at most one issue per subject and rule, with a stable random issue key and subject key.
6. When a relevant source field of an open issue changes, the register shall increase its fact version by one.
7. When the as of date changes, the register shall add or drop facts that depend on it, even at the same revision.
8. When a site name or a label for a review file is checked, the register shall refuse a word of at least three letters that is part of any person's name or of the private site title, as well as a whole private string. A word is matched as a whole word, ignoring case and accents.

## R17 Review rules

Tests: T24, T25. Owner: 05-exchange.

1. When a burial is recorded with no space, the register shall raise `placement_missing`.
2. When a memorial reading is marked "Unclear letters", the register shall raise `reading_unclear`.
3. When an offer is active and `asOf > replyBy`, the register shall raise `offer_late`. An offer with no reply date raises nothing.
4. When a charge has a positive balance and `asOf > dueOn`, the register shall raise `fee_late`. A charge with no due date raises nothing.

## R18 Return slips

Tests: T24, T25, T26. Owner: 05-exchange.

1. When a return slip (`plot.slip.v1`) is opened, the register shall look up each decision by the full tuple `(siteKey, lineageId, issueKey, factVersion)` and never by date alone.
2. When the slip's site key or lineage differs from the open site, the register shall refuse the whole slip and change nothing.
3. When a decision's fact version is not the same as the current fact (older or newer), the register shall show "Source has changed" for that row.
4. When a decision's issue is no longer open, the register shall show "Issue already closed" for that row.
5. When a decision's action ID was already received, the register shall show "Already received" and change nothing.
6. When a decision's fact version equals the current open fact, the register shall show "Ready to check". A fact version above the current one is never ready.
7. When a keeper presses "Record receipt", the register shall record receipt events only and never change occupancy, debt, inscription or any other canonical field.
8. When a keeper presses "Open matching record", the register shall open the normal staff form with the latest state.
9. When the same slip is opened twice, the register shall record nothing new the second time.

## R19 Desk handling of packets

Tests: T24, T25, T26, T27. Owner: 05-exchange and the Desk repository.

1. When the Desk inspects a file, the Desk shall accept only `plot.review.v1` of at most 2 MiB and 2,000 issues with unique issue keys and exact fields, and refuse a backup, a visitor file or an unknown version.
2. When an incoming packet has the same site and lineage as an open one, the Desk shall replace it only if revision and as of date are both not lower.
3. When either value is lower, the Desk shall offer only "View older copy" as a read only preview.
4. When two packets have the same revision and as of date but different content, the Desk shall show "These copies disagree at the same revision." and keep the current list.
5. When the same packet is opened again, the Desk shall show "This copy is already open." and change nothing.
6. When a packet has a different lineage, the Desk shall treat it as a separate source.
7. When an issue's fact version rises, the Desk shall reopen an item marked checked.
8. When an issue disappears, the Desk shall move it to history with its last version.
9. When an import fails, the Desk shall keep the previous list unchanged.
10. When the Desk marks an item, it shall accept only "Checked" or "Needs keeper" for the current fact version, with no free text.
11. When the Desk shows an item, it shall show the site alias with the code and reason so equal labels from two sites stay apart.

## R20 Files and wire formats

Tests: T05, T10, T22, T24. Owner: 01-foundation, 02-paper-and-map, 05-exchange.

1. When the register opens any file, the register shall decide its kind by its discriminator and structure, never by filename.
2. When a file has a newer version, the register shall write nothing and say "This file needs a newer version."
3. When a file has unknown enums, nonfinite coordinates, duplicate IDs, dangling references or an unsupported version, the register shall reject it before any write.
4. When money, dates or write times are serialized, the register shall write bounded integer minor units with currency, year first date strings and UTC write times with an offset.
5. When a private backup is restored, the register shall verify every entry's byte length and SHA 256 before switching the active site, and restore as a new register by default.
6. When a restore goes backwards or forks a lineage, the register shall rotate the site's exchange key and warn that old review files refer to the earlier copy.
7. When a CSV is exported, the register shall escape cells that start with `=`, `+`, `-`, `@`, tab or carriage return. Private backups keep the original string exactly.

## R21 Limits

Tests: T32, T06, T10, T11. Owner: 01-foundation, 02-paper-and-map.

1. When any value in design section D12 reaches its limit, the register shall accept it. When it is one over, the register shall reject it before commit, name the item and its code or row, and keep prior state.
2. When a CSV or paste exceeds a bound, the register shall stop reading at the first exceeded bound and offer splitting by source refs.
3. When storage quota is full, the register shall say "This browser could not save the register." and never report success.
4. When the register runs on the recorded reference machine, a 200 row preview shall appear within 2 s, its commit within 3 s, and a search result within 200 ms for 2,000 plots, measured as five warm runs and one cold run with the worst value reported.

## R22 Local only

Tests: T28, T31, T36. Owner: 06-access-and-release.

1. When any register, visitor file or Desk page runs, it shall make no network request beyond loading its own static files, and need no login.
2. When private data exists, the register shall keep it out of URLs, filenames, logs, localStorage keys, caches, image metadata and the clipboard by default.
3. When a visitor file is opened from disk with the network blocked, it shall be readable, searchable with script on and findable with browser Find with script off.
4. When a keeper searches a register, the register shall keep the search text in the browser history entry (`history.state`) and never in the address. An address that carries a `q` parameter shall not be read as a search. Back and a reload shall still find the search.

## R23 Words, layout and access

Tests: T29, T35. Owner: 06-access-and-release and each feature spec.

1. When any text is shown, the register shall use words from the copy catalog, with no dashes between words.
2. When any screen is shown at 360 by 640 or 1920 by 1080, the register shall keep a 16 px edge, a 12 px gap between targets, 44 by 44 px targets and at least 12 px text, with no horizontal page scroll.
3. When reduced motion is set by the system or the app, the register shall run no animation. The app setting wins when set.
4. When normal text is shown, the register shall meet a 4.5 to 1 contrast ratio, and 3 to 1 for meaningful graphics and focus rings.
5. When no register of the keeper's own exists, the first screen shall make "Start a register" the one main action, show the practice register as a plain choice, say in one line who the app is for and that records stay on this device, and show "Restart walkthrough" only after the walkthrough was started. On a phone the header and menu shall be compact and the app name shall show once.
6. When the site map is shown at 360 by 640, the map and its key shall come before the zoom controls and the map shall start in the upper half of the first screen. A plot chooser shall never show a blank choice. A zoom control that cannot act shall be disabled and the zoom level shall be said in words.

## R24 Proof data and independent totals

Tests: T30, T21, T07, T20. Owner: every spec.

1. When tests check Lantern Fold, Thimble Beds or the 200 record paper book, the tests shall compare with `tests/fixtures/expected/hand-totals.md`, written before code.
2. When fee, queue or tenure results are checked, the tests shall compare with `scripts/oracle.py`, written from the worked examples using the Python standard library only.
3. When a walkthrough is restarted, the register shall reset only that walkthrough's store.
4. When property tests run, each property set shall run at least 1,000 generated cases with a recorded seed, and keep any failing seed beside its requirement.

## R25 Kiro project setup

Tests: none in Vitest. Checked by `kiro-cli agent validate`. Owner: 00-contracts.

1. When the builder profile runs, it shall read and write inside this repository and run only the listed local test commands.
2. When the reviewer profile runs, it shall read files and call only the three plot inspector tools.
3. When a `.ts` or `.tsx` file is saved by the agent, the save hook shall run `node scripts/changed-tests.mjs`. When an agent turn ends, the stop hook shall run `npm run check:changed`. Neither shall use the network or a model turn.
4. When the inspector does not exist yet, its MCP entry shall stay disabled.
5. When the `plot-checks` skills power is added in spec 06, it shall call the existing inspector and the market fixture, with one inspector registration only.

## R26 Map and layout

Tests: T03, T04, T05. Owner: 02-paper-and-map.

1. When a grid is generated, the register shall preview the count and the first and last code, block apply on any code collision naming both sections, and create no extra plots when preview is reopened or Apply is retried.
2. When a polygon is saved, the register shall require at least three distinct points, positive area, no self intersection, and a fit inside its section and site. Footprints may touch but shall not overlap in area.
3. When a path crosses a plot interior, the register shall refuse it with "This path crosses {code}."
4. When an outline changes, the register shall never discard a linked plot. A linked plot moves only by an explicit "Move linked plot" with its identity kept.
5. When a `plot.layout.v1` file is imported into a new site, the register shall mint fresh IDs and mark every plot unchecked. Into an existing site, it shall match by section and code, block the whole batch on any conflict, and apply in one revision. Repeating the import shall add zero plots.
6. When a reference plan image is used, the register shall keep it private, lock its transform apart from plot geometry, and never put it in a visitor, review or layout file.
7. When a session holds unsaved rows, the register shall offer `plot.draft.v1`, which restores only to a draft preview and says when a page photo must be chosen again.

## R27 Import batches

Tests: T07, T08. Owner: 02-paper-and-map.

1. When a staged import is committed, the register shall commit every selected row or none.
2. When a keeper chooses "Leave row out", the register shall move the row to a visible left out list, revise the counts, and offer its source refs and reasons as a private download.
3. When a repeat aid is used in fast entry, the register shall never copy a person's name or a private note.

## R28 Backup, restore and photos

Tests: T10, T11. Owner: 02-paper-and-map.

1. When a backup is restored, the register shall stage it into a new store generation and switch the active pointer once, only after every entry is verified. A failure shall leave the current register as it was and say "This backup is incomplete. Your register is safe."
2. When "Restore this register" is chosen, the register shall require the same site, offer a backup of the current copy first, compare revision, site and date, and require the typed site name.
3. When a photo is stored, the register shall check its signature, size and dimensions before decoding, decode one at a time, strip metadata by re encoding, and keep the old attachment if a replacement fails.

## R29 Reports

Tests: T21, T23. Owner: 03-churchyard, 04-allotment.

1. When a private report covers a period, the register shall head it "Private register report", show "Through {date}", and build month totals for burials, new reservations and releases by event date, never by today's plot state.
2. When a correction changes a past event, the register shall rebuild the affected totals and keep the correction visible in history.
3. When a long report prints, the register shall repeat headings, scope and totals, never cut a row in two, and list unplaced and unknown items separately.

## R30 Desk agenda and host

Tests: T25, T26, T27. Owner: 05-exchange and the Desk repository.

1. When the Desk prints an agenda, it shall sort by overdue offers, then due fees, then unplaced burials, then unclear readings, then by site alias and label, and print "No open checks" with a date when the list is empty.
2. When any Desk action runs, it shall start no agent, chat, scheduled task or network request.
3. When the Desk host bundle is built, it shall mark React and ReactDOM external, export `DeskPage` as default, and release listeners on unmount.
## R31 Points added at the requirements review

Tests: as listed per line. Owner: as listed per line.

1. When an inscription is saved, the register shall store its wording exactly, including line breaks, and keep notes, page refs, photos and original filenames private. (T15, 03-churchyard)
2. When a site has no map, the register shall say "No map yet. Add a section or open the plot list." and still allow paper entry and search by code. (T04, 02-paper-and-map)
3. When plots are renumbered in bulk, the register shall list every old and new code before apply and reserve each old code as an alias. (T03, 02-paper-and-map)
4. When a CSV is read, the register shall accept UTF 8 with or without a byte order mark, comma or semicolon, quoted fields, doubled quotes, empty cells and newlines inside quotes, ask "Comma" or "Semicolon" with live previews when the separator is unclear, keep leading zeros and accents, and reject duplicate mapped headings with the row, heading, value and a suggested fix. (T06, 02-paper-and-map)
5. When a page photo is used during entry, the register shall never store it. It is held in memory and released when the page closes. (T08, T11, 02-paper-and-map, P11.9 and P21.1)
6. When a visitor HTML file is written, the register shall seal it with a Content Security Policy that allows only its own inline script and style, no remote asset, font, form or URL. (T22, T28, 03-churchyard and 04-allotment)
7. When a public preview is shown, the register shall list the included fields and the excluded categories with their counts, and "Cancel" shall return to the report without writing a file. (T22, 03-churchyard and 04-allotment)
8. When a visitor file is downloaded, the register shall put the kind and date in its filename, never a private value, and warn that recipients can keep older copies. (T22, T28, 03-churchyard and 04-allotment)
9. When a visitor sheet or report is printed, the register shall support A4 and US Letter in portrait or landscape, stay legible in grayscale at 100 percent, and split a dense map into an overview with a section index and numbered section sheets. (T23, 03-churchyard and 04-allotment)
10. When a garden report is chosen, the register shall keep every past season printable with its charges, receipts, reversals and balances tied to their own tenancy. (T19, T23, 04-allotment)
11. When an action is committing, the register shall show "Saving changes…" and ignore repeat presses. A completed import or offer shall show its result and guard against a second press. (T09, T18, 01-foundation)
12. When a dialog is open, Escape shall close the top dialog and return focus to its trigger. When validation fails, focus shall move to the first invalid field. (T35, 06-access-and-release and each feature spec)
13. When the Desk cannot save its workspace, it shall offer a return slip download and keep the current list. (T26, 05-exchange)
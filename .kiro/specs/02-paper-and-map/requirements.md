# 02 Paper and map: requirements

This spec builds how real paper and a real site get into a register: the map (generate, trace, import and print), the three ways to enter records (one record, fast entry beside a page photo, spreadsheet import), photos, private backup and restore, and the shared register shell and screens that the two app specs plug into. It implements parts of spec 00 and builds on spec 01. It may add detail to either. It may not contradict them.

Each requirement names the spec 00 requirements it implements and the T IDs that test it. T IDs and test files follow the ownership table in `00-contracts/tasks.md`. Rows marked "support" are extra files this spec lists so that every production file has a test.

Terms are those of specs 00 and 01. **Layout** is the drawn part of a register: sections, plot footprints, paths, gate and north. **Footprint** is a plot's polygon. **Backdrop** is a private reference plan image drawn under the layout while tracing. **Source row** is one row of a spreadsheet or one fast entry row. **Staged import** is the preview of a set of source rows. It writes nothing. **Base state** is the part of a register state the template owns: core state, layout and notes. An app state extends it.

---

## P1 Coordinates and the site transform

Tests: T04 (`coordinates.test.ts`). Implements R26, D12. Owner: 02-paper-and-map.

1. When a point is stored, the register shall accept only two integers from 0 to 10,000, east first and north second, with the origin at the south west corner.
2. When a point is drawn on a screen or sheet, the register shall flip north once, so that site point (0, 0) is the bottom left corner and (10,000, 10,000) is the top right corner of the full site.
3. When a screen point is turned back into a site point, the register shall round to the nearest integer, clamp nothing, and refuse a point outside 0 to 10,000.
4. When a point is rotated, the register shall rotate about a given origin, round to integers, and give the same answer for the same input.
5. When a backdrop transform is applied, the register shall map an image point to a site point by scale, then turn (counter clockwise degrees), then east and north offset, and shall never change any footprint.

## P2 Grid generation

Tests: T03 (`grid.test.ts`), T16 (renumber and old codes), T32 (grid size). Implements R26.1, R31.3, R2, R21. Owner: 02-paper-and-map.

1. When a grid is planned, the register shall take a prefix, first number, digits, rows, columns, cell size, spacing, numbering across or down, the corner numbering starts at, reverse alternate rows, rotation and skipped places, and return the plots in numbering order.
2. When a grid of 10 rows and 20 columns has prefix "C", first number 1 and 3 digits, the register shall produce 200 distinct codes from "C001" to "C200".
3. When a number needs more digits than the grid asks for, the register shall write the whole number and never cut it. A code longer than 24 characters is refused.
4. When "Reverse alternate rows" is set, the register shall number the second row, the fourth row and every second row after them in the opposite direction.
5. When places are skipped, the register shall keep the numbers of the other places unchanged and report each skipped place as a gap.
6. When a grid is rotated, the register shall rotate every corner about the grid origin and round it, so that two cells that shared an edge still share it. A plot that would leave 0 to 10,000 is refused and named by code.
7. When a grid size is checked, the register shall accept 1 to 100 rows and 1 to 100 columns whose product fits the remaining plot capacity (2,000 per site), and refuse any other size naming the item.
8. When a plan is previewed, the register shall report the count, the first code and the last code, and list `added`, `retained`, `moved`, `skipped` and `collisions`.
9. When a planned code already belongs to another section, the register shall report a collision naming both sections, and apply shall be blocked.
10. When a plan is made again after it was applied, it shall report zero added. A planned plot with the same section and code as a stored plot is retained, never added again.
11. When the same apply command is retried with the same operation ID, the register shall create no extra plots.
12. When plots are renumbered in bulk, the register shall list every old and new code before apply, reserve each old code as a prior code that stays searchable, keep every plot and space ID, and refuse the whole batch if any new code is taken.

## P3 Geometry

Tests: T04 (`geometry.test.ts`), T32 (vertices). Implements R26.2, R26.3, D12. Owner: 02-paper-and-map.

1. When a polygon is checked, the register shall require at least 3 points with no two adjacent points equal and no closing point repeated, at most 256 points, integer coordinates from 0 to 10,000, positive area, and no self crossing. Each failure has its own code.
2. When two footprints are compared, the register shall refuse an overlap in area. Footprints that only touch along an edge or at a corner are allowed. Two equal footprints overlap.
3. When a footprint is checked against its section outline, the register shall require it to lie inside the outline. Touching the outline is allowed.
4. When a path is checked, the register shall require at least 2 points, at most 256, no two adjacent points equal, and integer coordinates in range.
5. When a path crosses the inside of any footprint, the register shall refuse it and name that plot code. A path that only touches a footprint edge is allowed.
6. When a point is tested against footprints, the register shall name the footprint that holds it, and treat a point on a shared edge as held by neither.
7. When geometry is checked on integer input, the register shall use exact integer arithmetic for crossings and shall not depend on a tolerance.

## P4 Layout commands and drafts

Tests: T04 (`layout.test.ts`, `edit.test.ts`). Implements R26.2, R26.4, R31.2, R9, R10. Owner: 02-paper-and-map.

1. When a layout change is decided, the register shall return a typed error or an ordered batch of events, perform no I/O, and take every ID from the command.
2. When a layout apply holds new sections, new plots, explicit moves, paths, a gate and a north angle, the register shall return them as one batch, so one revision holds the whole change.
3. When a layout apply fails any check, the register shall return no event at all.
4. When a section outline changes, the register shall never drop a linked plot. If a plot of that section would fall outside the new outline, the register shall refuse the change and name those plot codes.
5. When a plot already exists, its footprint shall change only through an explicit move in the command. The plot ID and space IDs shall stay unchanged. A new plot command that names an existing plot ID is refused.
6. When a layout is replayed from events, the register shall give the same layout as applying the events one at a time, and a replay of a layout with `map` events shall keep `mapVersion` equal to the count of geometry events.
7. When a site has no section, no footprint and no path, the register shall treat it as "No map yet" and shall still allow plots with no footprint, records, and search by code.
8. When a drawing draft has points, the register shall allow add point, undo the last point, close the shape, and cancel the draft, and none of these shall write anything. Closing a draft with fewer than 3 points says "Add three points to close a shape."
9. When a gate is set, it shall hold a name and one point. When north is set, it shall hold whole degrees from 0 to 359.

## P5 Layout file and the backdrop

Tests: T05 (`trace.test.ts`). Implements R26.5, R26.6, R20. Owner: 02-paper-and-map.

1. When "Download site layout" is chosen, the register shall write a `plot.layout.v1` file with a closed list of fields: sections, plot codes, footprints, paths, gate and north. It shall hold no private ID, person, status, event, backdrop, blob ID or approval.
2. When a layout file is read, the register shall decide it is a layout file by its discriminator and structure, reject any unexpected key at every depth, reject nonfinite or out of range coordinates, duplicate section names, duplicate plot codes and dangling section references, and write nothing.
3. When a layout file has a newer version, the register shall write nothing and say "This file needs a newer version."
4. When a layout file is imported into a new site, the register shall mint fresh IDs and leave every plot unchecked.
5. When a layout file is imported into a site that has a layout, the register shall match sections by name and plots by section and code. A plot that matches with the same footprint is retained. A plot that matches with a different footprint, a code owned by another section, a different gate, a different north or a path of the same name with different points is a conflict. Any conflict blocks the whole batch.
6. When a layout import has no conflict, the register shall apply it as one revision, keep every unmatched existing plot, and a repeated import shall add zero plots.
7. When a backdrop is set, the register shall keep its image as a private blob and its transform apart from every footprint. Changing the transform, hiding, locking or removing the backdrop shall change no footprint and shall not raise `mapVersion`.
8. When the backdrop is locked, the register shall refuse transform changes and say so. Hiding and removing are still allowed.
9. When the backdrop transform is reset, the register shall return scale 100, offsets 0, turn 0 and opacity 50.
10. When a sheet is drawn for print or for a visitor, the register shall omit the backdrop.

## P6 The shared sheet

Tests: T05 support (`sheet.test.ts`). Implements the plan's map look, R26, R23. Owner: 02-paper-and-map.

1. When a sheet is built, the register shall build one model that the screen map and the print page both draw. It holds the plots, sections, paths, gate, north arrow, key, the selected plot and its code tab.
2. When a sheet is built for a pixel width, every coordinate in the model shall be in pixels with north flipped, so a drawn text size is the real text size. No drawn text is smaller than 12 px.
3. When plots are too small for a 12 px code, the register shall draw no per plot code. It shall draw the code of the selected plot on a tab in the margin of the sheet at 14 px.
4. When a plot is marked, the register shall use an open outline for Free, a slash for Reserved, a solid centre for Taken and a cross for Unusable. A plot that needs checking has a dotted outline and keeps its state symbol only if it has a checked state.
5. When a plot has no footprint, the sheet shall omit it and the plot list shall still hold it.
6. When the sheet has no footprint, section or path, it shall report `empty` so the screen shows "No map yet. Add a section or open the plot list."

## P7 CSV reading

Tests: T06 (`csv.test.ts`), T32 (CSV bounds). Implements R31.4, R21.2, R5.5. Owner: 02-paper-and-map.

1. When a CSV is read, the register shall accept UTF 8 with or without a byte order mark, comma or semicolon, quoted fields, doubled quotes, empty cells, CRLF, LF and CR line ends, and newlines inside quotes.
2. When a CSV has bytes that are not valid UTF 8, the register shall refuse it with "Choose a spreadsheet saved as CSV."
3. When a cell is read, the register shall keep its exact text, including leading zeros ("001"), accents and outer spaces. Trimming is for matching only.
4. When a quote is wrong (a quote inside an unquoted field, text after a closing quote, an unclosed quote), the register shall refuse the file with the row and the code.
5. When a row has a different number of cells from the heading row, the register shall report that row by number.
6. When the separator is unclear, the register shall answer `unclear` and give a live preview of the first rows for both separators. When it is clear, the register shall answer which one.
7. When the first bound is exceeded (5 MiB, 5,000 data rows, 40 columns, 4,000 characters in a cell), the register shall stop reading at once and refuse the file naming the item and the row. The value at the limit is accepted and one more is refused.
8. When a file is refused for size, the register shall offer splitting by source refs (the screen words are in P15).
9. When pasted text is read, the register shall treat it as a CSV with a tab or the chosen separator, with the same bounds.

## P8 Column mapping and cell parsing

Tests: T06 (`mapping.test.ts`). Implements R5.5, R7.2, R31.4. Owner: 02-paper-and-map.

1. When headings are matched to a sheet, the register shall normalise names for matching only (case, accents, spaces and punctuation) and suggest a register field for each heading it knows.
2. When two headings match one register field, or one register field is mapped from two columns, the register shall refuse with both columns named, the row, the heading, the value and a suggested fix.
3. When a required heading of the chosen sheet is not mapped, the register shall name it.
4. When rows are mapped, the register shall keep every cell's original text and report each bad cell with its row, heading, value, code and a suggested fix.
5. When a date cell is read, the register shall use the date parser of spec 01 with the order chosen for the whole import. `03/04/26` shall never be guessed. A year first date, a month and year, a year or `unknown` is accepted at its own precision.
6. When a money cell is blank, the register shall treat it as unknown and never zero.
7. When a column is set to "Ignore column", the register shall drop it from the mapped row.
8. When an app lists other headings for a field (an alias), the register shall use an alias only for a field that no exact heading took, and only for the first heading that matches. A heading is never matched to two fields and a field is never filled by two columns because of an alias. The keeper may still change any match.

## P9 Staged import

Tests: T07 (`importBatch.test.ts`, `paperBook.test.ts`). Implements R7, R27, R14.6, R24. Owner: 02-paper-and-map.

1. When rows are staged, the register shall write nothing to storage and shall report counts for ready, already in register, location to confirm, conflicts, errors and left out, which add up to the row count.
2. When a row is staged, the register shall identify it by its sheet and exact source ref, never by line number, file order, file name or a person's name.
3. When a row has no source ref, the register shall mark it an error, and the keeper may fix it by typing a ref or by building one from book, page and entry.
4. When two rows of one file have the same source ref, the register shall mark the later one an error naming the first.
5. When a row equals the stored row after normalisation, the register shall mark it "Already in register" and write nothing for it. When the same file is staged again in any row order, the count of new rows shall be zero.
6. When a row differs from the stored row with the same source ref, the register shall mark it a conflict with before and after values and require "Keep current" or "Record correction" before commit.
7. When rows have the same name and different source refs, the register shall stage them as separate records and shall merge nothing.
8. When a row with a blank location is staged, the register shall keep it as "Location to confirm" and shall never give it a plot from a name match.
9. When a row is staged, the register shall dry run its commands on the state left by the earlier selected rows, so a second claim on one space is an error on that row before commit.
10. When "Leave row out" is chosen, the register shall move the row to a left out list, revise the counts and re run the later rows. "Restore row" shall put it back. The source refs and reasons of left out rows shall be offered as a private download.
11. When any selected row is an error, or any conflict has no choice, the register shall refuse to commit, write nothing and leave the revision unchanged.
12. When a staged import is committed, the register shall write every selected row in one `commit`, one revision and one operation ID, with a unique key for each new source ref. A second press with the same operation ID shall return the earlier result.
13. When the commit fails (stale revision, key taken, quota or abort), the register shall write nothing, keep the staged rows and say which failure it was.
14. When the 200 record book is staged, the counts and the commit shall equal `tests/fixtures/expected/hand-totals.md` section 3.

## P10 CSV export

Tests: T06 support (`csvExport.test.ts`). Implements R20.7. Owner: 02-paper-and-map.

1. When a CSV is written, the register shall prefix a cell that starts with `=`, `+`, `-`, `@`, tab or carriage return with an apostrophe, quote any cell that holds a separator, quote, CR or LF, and double each quote.
2. When a CSV is written, the register shall use CRLF line ends and write a byte order mark so that accents open correctly.
3. When a private backup is written, the register shall keep every original string exactly. Only CSV export escapes.

## P11 Fast entry

Tests: T08 (`fastEntry.test.ts`). Implements R27.3, R31.5, R7. Owner: 02-paper-and-map.

1. When a session starts, the register shall hold the rows, the current row and the page view (page number, zoom, rotation).
2. When "Repeat section" or "Repeat page" is used, the register shall copy only the fields the adapter marks repeatable, and shall never copy a person's name, a note or a source ref.
3. When "Fill plot sequence" is used, the register shall take the plot of the row above, add one to its trailing number and keep its prefix and zero padding. A plot with no trailing number is refused.
4. When rectangular cells are pasted, the register shall fill rows from the current row and columns from the chosen column, add rows as needed up to 5,000, and refuse a paste that does not fit.
5. When rows are reviewed, the register shall use the same staging as an import, so one record, fast entry and import end at one review table with one set of checks.
6. When a row fails, the register shall keep every row, the page, the zoom, the rotation, the current row and the cell focus target unchanged, and report the first invalid field.
7. When a session is interrupted, the register shall make a draft that holds the raw rows, the mapping, the current row and the page number, and say whether the page photo must be chosen again. A recovery file restores to a draft preview only.
8. When a recovery file is read, the register shall check its discriminator `plot.draft.v1`, the kind and the site, refuse a newer version, and never apply any command.
9. When a page photo is used, the register shall never store it. It is held in memory and released when the page closes. Repair 17 (P21.1) took out the control "Keep page with register", because nothing stored the photo and the words promised it did.

## P12 Photos

Tests: T11 (`images.test.ts`), T32 (photo bounds). Implements R28.3, R21, R22.2, R31.5. Owner: 02-paper-and-map.

1. When a photo is chosen, the register shall decide its type from the file signature (JPEG, PNG or WebP), never from the name or declared type, and refuse anything else.
2. When a photo is checked before decoding, the register shall read its size from the header, accept at most 12 MiB and 24 megapixels, and refuse a larger file or image before any decode.
3. When a photo is normalised, the register shall decode one image at a time, apply the orientation, scale the longest edge to at most 2,400 px, re encode it, and keep no camera metadata, no original file name and no location.
4. When the re encoded bytes still hold metadata, the register shall strip it at the container level, and shall never store bytes that hold a metadata marker.
5. When a photo has a caption, the register shall store its description, or the choice "Description pending", and refuse a photo with neither.
6. When a replacement photo fails, the register shall keep the old photo unchanged.
7. When a record has 8 photos, the register shall refuse a ninth.
8. When storage has no room for a photo, the register shall say "There is not enough space for this photo." and keep the choice of a smaller image.

## P13 Backup and restore

Tests: T10 (`backup.test.ts`), T32 (archive bounds). Implements R20.5, R20.6, R28.1, R28.2, R21. Owner: 02-paper-and-map.

1. When a private backup is written, the register shall write a `.pkr.zip` that holds `manifest.json`, `site.json`, `events.json` and each blob as `images/<id>.<ext>`, and the manifest shall list every entry with its path, byte length and SHA 256.
2. When a file is opened, the register shall decide its kind by its discriminator and structure, never by file name, and shall say "This file is a visitor copy." for a visitor file and refuse a review file, a slip, a layout file and a draft file as backups.
3. When a backup is read, the register shall check, before any write: the size (128 MiB compressed), the entry count (5,000 attachments), the decoded total (160 MiB), the photo total (96 MiB), safe entry names, no repeated name, no entry outside the allowed list, every entry's byte length and SHA 256, the manifest structure, the version, the kind, the event sequence, the revision, duplicate event IDs and dangling blob references.
4. When a file has a newer version, the register shall write nothing and say "This file needs a newer version." When it has an older version, the register shall migrate it in memory with the migration list, and refuse it if a migration fails.
5. When any check fails, the register shall write nothing and say "This backup is incomplete. Your register is safe."
6. When "Restore as new register" is chosen, the register shall give the copy a new site ID, new event IDs and a new exchange key, keep every plot, space and record ID, and keep the lineage.
7. When "Restore this register" is chosen, the register shall require the same site ID and lineage as the open site, refuse a foreign site, require the typed site name, and show the revision, site and date of both copies first.
8. When a restore goes backwards or forks the lineage, the register shall rotate the site's exchange key and say that old review files refer to the earlier copy.
9. When the app kind differs from the backup's kind, the register shall refuse with "This file belongs to another kind of register."
10. When a restore is written, the register shall verify everything first, then write the site, events, blobs and unique keys in one transaction, so the old register stays in place until the new one is complete. A quota or storage failure shall leave the old register and every other register as they were and say "This browser could not save the register."
11. When a restore is written, the register shall rebuild the unique keys for plot codes, prior codes and source refs from the events.
12. When a backup is made before a replace, the register shall offer it first as a download and never claim it was saved anywhere else.

## P14 Base state, notes and site admin

Tests: support (`base.test.ts`, `notes.test.ts`, `siteAdmin.test.ts`). Implements R1, R9, R28, product choices. Owner: 02-paper-and-map.

1. When an app state extends the base state, the register shall apply core, layout and note events with one function, and shall leave an app event it does not know to the app.
2. When a note is added to a plot, the register shall store the text exactly, up to 4,000 characters, as an event with the plot ID, and keep notes private.
3. When a photo is added to a plot, the register shall store a blob reference, type, size, caption and an optional private source page, up to 8 per plot, as an event. A removed photo is a new event, and the earlier event stays.
4. When a register is removed from the device, the register shall remove that site's rows from every store in one transaction, touch no other site and no setting, and require a typed site name first.
5. When the local time zone of a site is changed, the register shall change only how write times are shown and shall not change a revision or an event.

## P15 Shell and screens

Tests: browser `paper-map.spec.ts` and `paper-entry.spec.ts`, with unit support in `paperCopy.test.ts`. Implements R23, R26, R27, R28, R31, plan section 5. Owner: 02-paper-and-map.

1. When an app starts the shell with its adapter, the shell shall show the library, create a site, open a register, and route by hash so that reload, Back and Forward keep the filter, the highlighted plot and the scroll position.
2. When a screen is shown, it shall use only words from the copy catalog. The words of section 5 of the plan for the shared screens, the common states and the recovery text shall be exact.
3. When the library has no site of the app kind, it shall say "No registers on this device."
4. When a site is created, the shell shall show "Add your map", "Enter records" and "Import spreadsheet". It shall never prefill a new personal site.
5. When a register is open, the home screen shall hold the search, the scope, the found count and the links to the map, the plot list, adding records and the backup.
6. When a search is run, the shell shall use the search of spec 01 over the open site only, keep the original spelling and show source and date beside a name.
7. When the map screen is shown, it shall draw the shared sheet, the north arrow, the gate, the paths and the fixed key directly below the map, and "Open plot list" shall be visible. The map shall carry no routing, distance or address.
8. When a plot is chosen on the map list or the plot list, both shall update the same selected plot. A click or tap on a drawn plot, also the chosen one, shall open that plot's own record, and a drag, a path, open ground or a point that could mean two plots shall change nothing. Each plot on the map shall be a button with an accessible name, one roving tab stop, arrow keys to move, and Enter or Space to open it. Back from the record shall return to the map with the chosen plot and the date. The plots keep their true size and place on the plan. They are let off the 44 px target size and 12 px gap only because the full size "Choose a plot" list and "Open plot" on the same page do the same thing (WCAG 2.2 2.5.8, Essential and Equivalent). Every other control, and that list, keeps both rules.
9. When the map editor is shown, it shall offer the grid form with live preview, apply, "Skip places", the layout file import and download, and the links to tracing.
10. When tracing is shown, it shall accept points from a drawing surface and from the keyboard form "East", "North", "Add point", show the last point and "Undo point" below the surface, and show every check message of the plan.
11. When a plot is opened, the details shall show its status per space, history, notes, photos, previous codes, "Rename plot", the physical status actions and "Correct an entry".
12. When "Add records" is chosen, the shell shall offer "One record", "Fast entry" and "Import spreadsheet", all ending at one review table.
13. When an import is reviewed, the shell shall show the six counts, a filter, rows in pages of 50, and the row actions "Fix row", "Keep current", "Record correction", "Leave row out" and "Restore row", "Download left out rows", "Import {count} records" and "Cancel import".
14. When a commit starts, the shell shall show "Saving changes…" and ignore repeat presses. It shall say "Saved on this device." only after the transaction completes, and keep the input and offer "Download recovery file" after a failure.
15. When backup and restore are shown, the shell shall use the words of the plan for "Back up this register", "Restore backup", "Restore as new register", "Restore this register" and "Type the site name", and shall show site, revision, record and image counts before replacement.
16. When settings are shown, they shall hold "Follow device motion", "Reduce motion", "Map contrast", "Print paper", "Local time zone", "Save settings" and "Remove register from this device", with removal guarded by a typed site name and "Only {site} will be removed."
17. When help is shown, it shall hold "Start from paper", "Make a map", "Share a visitor copy", "Keep a backup" and "Use the keyboard" with a link to the relevant screen, and say "Records stay in this browser until you choose to export them."
18. When a route is unknown, the shell shall say "Page not found" and offer "Open registers".
19. When a dialog is open, Escape shall close the top dialog and focus shall return to its trigger. When validation fails, focus shall move to the first invalid field.
20. When the shell holds no adapter for a sheet, it shall offer no import of that sheet.

## P16 Layout, access and print

Tests: browser `paper-map.spec.ts` and `paper-entry.spec.ts` (measurements on every screen this spec adds). Implements R23. Owner: 02-paper-and-map.

1. When any screen of this spec is shown at 360 by 640 or 1920 by 1080, every interactive target shall be at least 44 by 44 px, at least 12 px from every other target, and at least 16 px from the viewport sides and from every clipping edge, and all text shall be at least 12 px, with no horizontal page scroll.
2. When text is shown, normal text shall have a contrast of at least 4.5 to 1 and focus rings and meaningful graphics at least 3 to 1, in the standard and high contrast themes.
3. When reduced motion is set by the system or the app, the register shall run no animation and draw no mist. The app setting wins when set. High contrast shall remove the decorative mist.
4. When the map is printed, the print page shall hold the sheet, the key, "As at" the revision date and an index of every plot code with its previous codes, and shall hide the controls. The register shall never claim a page was printed.
5. When a result has an actionable next step, it shall sit beside the result in normal flow. No fixed bar and no decoration shall cover text.

## P17 Proof with the paper book

Tests: T07 (`paperBook.test.ts`) and the browser `paper-entry.spec.ts`. Implements R24. Owner: 02-paper-and-map.

1. When the 200 plot grid and the bad file (`paper-200-bad.csv`, R117 without a source ref) are staged, the register shall report 200 rows, 1 error, 197 ready, 2 location to confirm, and write 0 records.
2. When the source ref of R117 is corrected, the register shall import exactly 200 records in one revision, with 198 placed, 2 unplaced, 198 taken plots and 2 unchecked plots.
3. When the same file is staged again, in file order or reversed, the register shall report 0 new, 200 unchanged, 0 conflicts and 0 writes.
4. When R117 is changed, the register shall report 199 unchanged and 1 conflict, with 0 writes until the keeper chooses.
5. When R199 is placed on C199, the register shall report 199 placed, 1 unplaced and 1 unchecked plot.
6. When the Churchyard Register runs the same path (spec 03, C11), it shall give the same counts. The test app of `tests/host` and the real register share the import screen.

## P18 Conformance additions

Tests: T01, T10 (`tests/conformance/adapter.test.ts`). Implements F10.5, R14. Owner: 02-paper-and-map.

1. When the conformance suite runs an adapter that supplies a sample import, the suite shall check that staging writes nothing, that a commit writes one revision, and that a repeat of the same file gives zero new records.
2. When the conformance suite runs any adapter, the suite shall check that a backup round trip as a new register gives the same replayed state, and that a backup of another kind is refused.
3. When the suite runs a broken adapter or a broken import, it shall fail on the check it should.

---

## P19 Names on the sheet keep clear

Tests: T05 (`tests/unit/sheet.test.ts`, `tests/unit/measureLabels.test.ts`), browser `layout.spec.ts`. Implements R23, P6.2, P6.3, P16.1. Owner: 02-paper-and-map. Found in the pictures `docs/acceptance/layout/routes/churchyard/route-map-phone.jpg` and `route-home-phone.jpg`, where the walk name and the gate name lay on the stones.

1. When a sheet is built at any width from 300 to 1200 px, the register shall keep the name of the gate, of each section and of each path at least 2 px clear of every plot footprint, every line and every other name. A name that has no such place shall be written outside the block of the drawing with a leader line to its feature (P19.8), at that width and at every other width. A name shall never be drawn over a plot, a line or another name, and shall never be dropped.
2. When a name is placed, a place over a plot shall cost more than an outside place with a leader line, so that a clear place or an outside place is always chosen first.
3. When a name is placed, it shall keep 8 px from every path line, because a path is drawn as a strip 14 px wide. A path's own name keeps 4 px from its own line.
4. When a path has the same name as a section already written on the sheet, the register shall write that name once.
5. When a plot is selected, the code tab shall sit beside that plot and touch its box, shall cover no other plot, and no name shall lie over it. The tab shall be at 14 px. When the only place that touches is under the lowest plot, the sheet shall grow below the drawing to hold it.
6. When names are drawn, the text shall stay at 12 px.
7. When the map routes of both registers are measured in a browser at 360 by 640 and 1920 by 1080, the box of every name drawn as `svg` text (gate, section, path and tab) shall overlap no plot shape. The code of a plot inside its own plot is not a name in this sense.
8. When a name of the gate, a section or a path has no clear place beside its feature, the register shall write it outside the block of the drawing, directly under it, with a thin leader line that starts on the feature (the gate mark, a point of the section outline or a point of the path) and ends at the name. A name shall never be left in a list in a corner, far from what it names. Every name is therefore either within 24 px of its feature or joined to it by a leader line. Found in the pictures `docs/acceptance/layout/site/hub-home-desktop.jpg` and `docs/acceptance/layout/churchyard/desk-example-desktop.png`, where "Main gate", "Sunny Row" and "Grass Walk" stood in a list at the foot of the drawing. This replaces the captions of P19.1.
9. When a leader line is drawn for a name, it shall cross no plot, shall not run along the line of its own feature, and shall keep clear of every other name and every other leader line where a route exists. When no route is clear, the route that crosses least wins. The line is thin (1 px), has no arrowhead and ends in a small dot on the feature. It is not a path: it carries no name and is not a path line.
10. When no free place exists beside the selected plot (every place that touches it lies over another plot, the north arrow or the gate mark, or leaves the sheet), the code tab shall sit outside the block of the drawing, above it or below it, whichever leaves the shorter leader line, with a thin leader line from the tab to the plot. The tab shall then cover no plot. When a free place beside the plot exists, the tab shall sit there and have no leader line, as in P19.5.
11. When the 200 plot practice map is searched and a plot in the middle of the grid is found, the register shall draw its code tab by P19.10, so that the layout rule `label_on_plot` holds on that map and `tests/browser/warden-paper-book.spec.ts` filters no rule at its search step. Every layout rule is measured again there at 360 by 640 and 1920 by 1080.

---

## P20 The site as it was on a date

Tests: `tests/unit/asAt.test.ts`, browser `warden-family.spec.ts`, `secretary-season.spec.ts` and `layout.spec.ts`. Implements spec 01 status at a date, the records rule "never infer a date", R23. Owner: 02-paper-and-map.

Terms. **View date** is the day the Site map or the Plot list is drawn for. It is today unless the keeper typed an earlier day. A **past view** is a view whose date is before today.

1. When the Site map or the Plot list is shown, it shall hold a date field "Show the site as at" that starts at today. The field is a text field with the hint "Year, month, day, for example 2026-04-20". It is the only new control. It has an accessible name, a 44 px target and the usual layout measures.
2. When the keeper types a valid date before today, the register shall redraw the marks, the counts, the filtered list and every summary line from the claims in force on that date, using the claims as they stand with current corrections. No stored event changes and none is written.
3. When a past view is shown, the page shall carry a heading "As at {date}" under the page title and a button "Back to today". "Back to today" shall return the view to today, put today in the field and move focus to the field.
4. When the typed text is today, it shall show the view of today with no heading and no button. The text is valid when it is a real day written YYYY-MM-DD with a year from 1000 to 9999. A date after today, a text that is not a date and an empty field shall change nothing on the page, mark the field invalid and show its message beside it ("Use a valid date." or "Choose today or an earlier date."). Focus is never moved off the field by the message. While the keeper is still typing, a text shorter than ten characters shows no message. A message shows at ten characters, when the keeper leaves the field, and on Enter.
5. When a past view is shown, every form and every offer shall still use today. The map and the list shall hold no control that saves. A link from a past view to another screen shall not carry the date, so a plot screen, the map editor and every form read today.
6. When a past view is printed, the print page shall carry "As at {date}" with that date and the index of plot codes with the states of that date. Today's view carries today's date.
7. When a claim has no start, the register shall count it as in force on every date unless the adapter names an earliest day for it. For a past view the foundation shall ask the adapter, through one optional function `claimFloor(state, claim)`, for the earliest day a claim with no start could mean. The answer is used for that view only. It is never stored, never changes a claim and never applies to the view of today. A claim that has a start ignores the answer.
8. When the churchyard adapter is asked, it shall read the burial that the claim names. A burial with a year only date gives the first day of that year. A burial with a month gives the first day of that month. A burial with no date, and a claim that names no burial, give no day, so that claim counts on every date. The template holds no churchyard rule.
9. When the date is carried in the address, it shall be a query value `asAt` made of a date only. The address shall never hold a name, a search text or a `q` value. A date change adds one history entry and keeps in it any search text the current entry holds.
10. When the view date has changed, Back shall return to the earlier view date with the filter and the highlighted plot kept, and the field shall show that date.

## P21 Every control does what its words say

Tests: `tests/unit/fastEntry.test.ts`, `tests/unit/screenWords.test.ts`, `tests/unit/paperCopy.test.ts`, browser `paper-entry.spec.ts`. Implements R23, the product rule "never claim more than was done". Owner: 02-paper-and-map. Task 17.

1. When the page panel of Fast entry is shown with a photo, it shall say "Page stays on this device." and shall hold no control "Keep page with register". The photo is never stored, so a control that offers to keep it promises what nothing does. The session holds no keep flag, a draft says the photo must be chosen again whenever one was chosen, and closing the page always releases it.
2. When the review of an import has no row to check but some rows are marked "Location to confirm", the list "Rows to check" shall say "Nothing to fix before the import. {count} records will need a plot after it." with the real count ("1 record will need a plot after it." for one). With no such row it shall keep "No rows to show.". Every other filter shall keep "No rows to show." when it is empty.

## P22 Making 200 plots fits one screen

Tests: `tests/unit/grid.test.ts` (`previewGrid`, T03), `tests/unit/paperCopy.test.ts`, browser `paper-map.spec.ts`. Implements R23, R26, P2.8, P15.9. Owner: 02-paper-and-map. Task 18. Found in the picture `docs/acceptance/layout/routes/churchyard/route-map-edit-desktop.jpg`: sixteen full width fields in one column, so the form was 2,600 px tall at 1920 by 1080 and the keeper saw nothing of the result until a button was pressed.

1. When the Generate rows form is shown at 1024 px or wider, it shall be a grid of short fields in four named groups: "Name and codes" (section name, prefix, first number, digits), "Size" (rows, columns, plot width, plot height), "Position" (start east, start north, row spacing, column spacing, rotation) and "Numbering" (the three choices of order, "Reverse alternate rows" and "Skip places"). A preview panel shall stand beside the groups. The whole form and "Preview plots" shall lie within one 1920 by 1080 view when the page is at its top.
2. When the Generate rows form is shown under 1024 px, it shall stay one column in the same four groups, with the preview panel above "Preview plots".
3. When the keeper types in any field of the form, the preview panel shall update at once and save nothing. It shall say "{count} plots to add", "First {code}" and "Last {code}", and "{count} skipped" when places are skipped, and show a small drawing of the rows with the first and the last code marked. The count is the number of planned codes that no plot of the site holds, by current code or prior code. "First" and "Last" are the first and the last planned code in numbering order.
4. When the rows, the columns, the first number, the digits or the skipped places cannot be read, or the size is refused, the preview panel shall say "Enter rows and columns to see the plots." and draw nothing. It shall show no error: errors belong to "Preview plots", which keeps focusing the first invalid field. The preview needs no plot size, position or spacing, so 10 rows and 20 columns with prefix "C" give "200 plots to add", "First C001" and "Last C200" before any other field is filled.
5. When the preview is computed, `previewGrid` in `template/src/map/generate.ts` shall give the same count, first code and last code as `planGrid` for the same rows, columns, prefix, first number, digits, numbering, start row, start column, reverse alternate rows and skipped places. It shall be pure and take no size or position.
6. When a number field is shown in this form (first number, digits, rows, columns, plot width, plot height, start east, start north, row spacing, column spacing and rotation), it shall be at most 12 characters wide (`12ch` of content, plus its padding and border). Every field keeps a 44 px target, a visible label and its error beside it. At 360 by 640 nothing scrolls sideways.
7. When "Preview plots" is pressed, the details that the live preview does not hold (codes already in the register, plots that would move, codes in use by another section) and "Apply layout" shall appear below the form, under the heading "Review changes". The count, first code and last code are never written twice on the screen.

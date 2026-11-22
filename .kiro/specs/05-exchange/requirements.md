# 05 Exchange: requirements

This spec builds the register side of the committee review exchange: the closed `plot.review.v1` packet, the closed `plot.slip.v1` return slip, the shared comparison rules, the Exchange screen in both apps, and the pinned copy of the exchange module that the Review Desk repository vendors. It implements R16 to R19 and R30 of spec 00 and may not contradict them. The Desk itself is built in its own repository in the next task. Section X11 lists what that task must meet so it can be checked later.

Terms. **Keeper** is the warden or secretary. **Check** is one open issue of one rule on one subject. **Subject** is the burial, memorial, offer or charge a check is about. **Review key** is a random UUID minted on this device for a subject (`subjectKey`) or for a subject and rule (`issueKey`). **Fact version** is a whole number that rises when the source fields of a check change. **Fingerprint** is a private, short digest of those source fields. It is stored in the private register and never leaves it. **Ledger** is the keys, versions, label and site name the register has stored for the exchange. **Receipt** is the register's note that a decision from a return slip was seen. **Packet** is a `plot.review.v1` file. **Slip** is a `plot.slip.v1` file.

Each requirement lists its T IDs and the requirements of spec 00 it implements. Expected values come from `tests/fixtures/expected/hand-totals.md` section 6, worked before any exchange code.

---

## X1 Review keys and the ledger

Tests: T24. Implements R1.5, R9, R16.5, R16.6, R16.7.

1. When a subject first raises any rule in an export, the register shall mint a random `subjectKey` with `crypto.randomUUID`. When a subject and rule first open, the register shall mint a random `issueKey`. Neither key is derived from a private ID, a name, a code or a date, and neither equals any private ID of the register.
2. When a check closes and later opens again for the same subject and rule, the register shall reuse its `issueKey`.
3. When the source fields of an open or reopened check differ from the stored fingerprint, the register shall raise its `factVersion` by exactly one and store the new fingerprint. The first version is 1. A repeat export with no change shall change nothing.
4. When keys, versions, labels or the site name change, the register shall store them in one `prepare_review` command that appends one `review_prepared` event and raises the revision by exactly one. When nothing changed, the register shall commit nothing and the revision shall stay as it was.
5. When the register is replayed from its events, the ledger shall be identical to the stored one.
6. When two sites are exported, the register shall never reuse a key of one in the other by derivation. A site restored as a new register keeps its ledger and gets a new `siteKey`, so the pair `(siteKey, lineageId, issueKey)` is what identifies a check outside the register.
7. When a keeper has not approved a site name or a label, the register shall use "Site 1" for the site and "Record {n}" for each subject, where n counts the subjects in the ledger from 1 in the order they first appeared. A stored label stays with its subject.

## X2 Checks from the apps

Tests: T24. Implements R17.

1. When a burial is recorded with no space, the Churchyard Register shall raise `placement_missing` for it. When a memorial reading is marked "Unclear letters", it shall raise `reading_unclear` for that memorial. At most one check exists for a subject and a rule.
2. When an offer is open and `asOf > replyBy`, the Allotment Register shall raise `offer_late`. When a charge has a positive balance and `asOf > dueOn`, it shall raise `fee_late`. An offer with no reply date and a charge with no due date raise nothing. Nothing is raised on the reply date or the due date itself.
3. When an app builds the fingerprint of a check, it shall use only the fields that a committee check depends on: for a burial its source ref, recorded name, unknown name flag and date; for a memorial its reading and page ref; for an offer its reply date, plot and application; for a charge its amount, balance and due date.
4. When an app raises checks, it shall also give the private words a label must not hold (names, contacts, source refs, receipt refs) and the route of the record behind a check. These never go into a packet.
5. When the as of date changes, checks that depend on it shall appear or disappear even at the same revision.

## X3 The review packet

Tests: T24. Implements R16.1, R16.2, R16.3, R20.1 to R20.4.

1. When a packet is built, the register shall write exactly the fields of design D10 of spec 00: `format`, `siteKind`, `siteKey`, `lineageId`, `siteAlias`, `revision`, `asOf`, `issues`, and for each issue `issueKey`, `subjectKey`, `label`, `rule`, `factVersion`, `action`. The packet is constructed field by field from named inputs and never copied from a private object.
2. When a packet is parsed, the parser shall reject any other key at every depth, a wrong or newer `format`, a rule or action outside the fixed lists, an action that does not belong to the rule, a `factVersion` or `revision` below 1, a date that is not a real calendar date, a key that is not a UUID, two issues with one `issueKey`, and two issues with one `(subjectKey, rule)`.
3. When a packet is built or parsed, the register shall accept the last legal value and refuse one over: 2,000 issues, 40 characters in a site name and in a label, 2 MiB of bytes.
4. When a site name or label is typed, the register shall refuse an empty one, one over 40 characters, one that holds a known private string (name, contact, source ref, the private site title), one that looks like an amount (a currency sign or code, or a number with two decimals) and one that looks like a contact (an at sign or seven digits in a row). Nothing else is free text.
5. When a packet is written, the packet shall hold no person name, contact, amount, note, inscription, image, page ref, plot code or private site title, in any key or value.
6. When a packet is written, its issues shall be ordered by `issueKey` and its keys in a fixed order, so equal content gives equal bytes.
7. When a file is named, the name shall be `committee-review-{date}.json` for a packet and `committee-return-{date}.json` for a slip, with a date and no private value.

## X4 Choose, preview and download

Tests: browser `desk-return.spec.ts`; T24 for the plan. Implements R16.3, R16.4, R15.6 (as applied to review files), D6 stale preview.

1. When the keeper opens "Committee review", the register shall show "Choose a review date" (default today in the site zone), "Site name for committee", and "Review plot labels" with one text box per current check, then "Preview review file". One main action on the screen.
2. When the keeper presses "Preview review file", the register shall check each typed value and move focus to the first invalid one. On success it shall show the exact fields that will leave the device, the number of checks and a row for each check (label, reason, action, version), and nothing is written.
3. When the keeper changes any input after a preview, the register shall remove the preview and the download button until the preview is made again.
4. When the keeper presses "Download review file", the register shall recompute the checks from the latest revision. If the revision changed since the preview, it shall say "Review public details again." and remove the preview. Otherwise it shall commit `prepare_review` if the ledger changed, show "Saving changes…" while it commits, hand the file to the browser only after the transaction completes, and then say "Your copy is ready." A repeat press shall change nothing more.
5. When a commit fails, the register shall write no file, show the commit message and keep every typed value and focus on the Preview button.
6. When the register has no revision yet, the register shall say "Nothing has been recorded yet, so there is nothing to send." and offer no preview and no download. When a chosen date has no checks, it shall say "No open checks at this date." and still offer the preview.
7. When a packet has no checks, the register shall still offer the download, and the file shall hold an empty `issues` list.

## X5 The return slip

Tests: T24. Implements R18.

1. When a slip is built, it shall hold exactly `format`, `siteKey`, `lineageId`, `packetRevision`, `packetAsOf` and `decisions`, and for each decision `actionId`, `issueKey`, `factVersion`, `disposition` ("checked" or "needs_keeper") and `reviewedOn`. It shall carry at most 2,000 decisions, unique action IDs, and no text.
2. When the keeper presses "Open return slip" and chooses a file, the register shall decide its kind by its contents, never its name. A file that is not a slip gets its own plain message and nothing changes. A newer version gets "This file needs a newer version."
3. When a slip belongs to another register (its `siteKey` or `lineageId` differs from the open one), the register shall refuse the whole slip with "This slip belongs to another register." and change nothing.
4. When a slip is read, each decision shall be classified in this order: its `actionId` already received gives "Already received"; no open check has its `issueKey` gives "Issue already closed"; the open check has a higher `factVersion` gives "Source has changed"; otherwise "Ready to check". Date alone never identifies a row.
5. When a slip is read, the register shall compute the open checks as at the later of today in the site zone and the date of the review file the slip names (`packetAsOf`), with the current fact versions the next export would use, without writing anything. A review file made for a later date than today is a keeper's choice, and its checks are open as at that date.
6. When the same slip is opened twice, the second reading shall write nothing.

## X6 Receipts

Tests: T24; browser `desk-return.spec.ts`. Implements R18.7, R18.8, R18.9, INV_SLIP_READ_ONLY.

1. When the keeper presses "Record receipt", the register shall append one `review_received` event for each decision that is "Ready to check" and not yet received, in one `receive_review` command, and nothing else. It shall record no event for a row that is changed, closed or already received.
2. When receipts are recorded, occupancy, debt, inscription, placement, approvals and every other canonical field shall be exactly as before. Only the ledger's received list grows.
3. When every row is received, closed or changed, the register shall offer no "Record receipt" and shall say so.
4. When the keeper presses "Open matching record", the register shall open the normal staff screen of that record with the latest state. A decision never changes a record by itself. The keeper corrects a record only through the normal correction form.
5. When a row's check is unknown to the ledger, the register shall show "Issue already closed" and offer no record link.

## X7 Comparison

Tests: T24 (shared vectors). Implements R19.2 to R19.8 as pure rules the Desk reuses.

1. When two packets have a different `siteKey` or `lineageId`, they are different sources. Equal issue keys in them are different checks.
2. When two packets of one source have equal canonical bytes, they are "same".
3. When the incoming revision or as of date is lower than the current one, the result is "stale" and only a read only view is allowed.
4. When revision and as of date are equal and the content differs, the result is "conflict" and the current list stays.
5. Otherwise the result is "replace", with each issue classified by `issueKey` as new, still open (same fact version), changed (different fact version) or no longer flagged.

## X8 Words

Tests: `tests/unit/exchangeCopy.test.ts`, `tests/unit/screenWords.test.ts`. Implements R23.1.

1. The Exchange screen shall use these words exactly: "Committee review", "Choose a review date", "Site name for committee", "Review plot labels", "Preview review file", "Download review file", "Open return slip", "Review returned checks", "Open matching record", "Already received", "Source has changed". Row words are "Ready to check" and "Issue already closed". The receipt button is "Record receipt".
2. Every other word of the screen comes from `template/src/ui/copyExchange.ts`, with no dash between words, and no word of the screen is written in its markup.
3. The reasons are the four action words of the plan: "Check the location", "Read the stone again", "Check the reply", "Check the payment".

## X9 The pinned copy

Tests: `tests/unit/exportExchange.test.ts`. Implements D1 vendoring, R19 (Desk gets the same rules).

1. When `node scripts/export-exchange.mjs <folder>` runs, it shall copy byte for byte `template/src/exchange/{schema,packet,compare,slip}.ts` and exactly the pure files they import, keeping their relative folders so no import changes, and write `provenance.json` and `vectors.json`.
2. When the exchange files import a file that is not on the list, or import anything outside `template/`, the script shall write nothing and exit 1, naming the file.
3. `provenance.json` shall name the source repository, the git revision, whether the listed files had uncommitted changes, the licence, the one required package with its exact version, and for each file its path, source path, byte length and SHA 256. It holds no time stamp, so a repeat run gives the same bytes.
4. When the folder exists and holds files that the script did not write, the script shall refuse. When it holds an earlier export, the script shall replace it.
5. When `vectors.json` is run against the copied module, every vector shall give its expected result.

## X10 Layout and browser proof

Tests: browser `desk-return.spec.ts` at 360 by 640 and 1920 by 1080. Implements R23.2.

1. Every state of the Exchange screen shall pass the layout measurements: 16 px edge, 12 px gap, 44 by 44 px targets, 12 px text, no sideways scroll, contrast.
2. From each built app, the spec shall export a review file, read it from the downloaded bytes, open a prepared return slip, see current and stale rows reported correctly, record a receipt, reopen the slip and see "Already received", and confirm no record changed until the normal correction form was used.
3. The spec shall make no request outside the app's own origin.

## X11 What the Desk task must meet

The Desk is built in `plotwarden-review-desk`. It shall vendor the pinned copy with `node scripts/export-exchange.mjs <desk>/vendor/exchange`, import nothing from this repository, and meet these checks. Each is tested in the Desk repository.

- **T25 `tests/tools.test.ts`.** `inspectPacket(bytes)` uses `readExchangeFile` and accepts only `plot.review.v1` of at most 2 MiB and 2,000 issues, and refuses a backup, a visitor file, a slip and an unknown version, with no write. `comparePacket` uses `comparePackets`. `addPacket` commits one source, makes a same copy a no op, moves a vanished issue to history with its last version, reopens a checked item when its fact version rises, and keeps the previous list on a failed import. `markCheck` accepts only "Checked" or "Needs keeper" for the current fact version, with no free text, and refuses an old version against a newer packet. `makeSlip` uses `buildSlip` and the slip reads back with `readSlip`. `agenda` sorts overdue offers, due fees, unplaced burials, then unclear readings, then site alias and label, and prints "No open checks" with a date when empty. Items show the site alias with the code and reason.
- **T26 `tests/persistence.test.ts`.** Desk decisions survive a route remount, a reload, disable and enable. A stale tab cannot overwrite another tab's decision. A failed save keeps the list and offers the slip download. Removing a site confirms its site and issue counts first.
- **T27 `tests/manifest.test.ts`, `tests/provenance.test.ts`.** The manifest entry is `dist/host/index.mjs`. The bundle exports `DeskPage` as default and marks React and ReactDOM external. `check-provenance` recomputes the SHA 256 of every file under `vendor/exchange` and fails on any file not in `provenance.json`, any hash that differs, or an import outside `vendor/exchange`. The vendored `vectors.json` passes against the vendored module.
- **Browser and host.** The Desk accepts the review files exported by both built apps (Lantern Fold: one unclear reading, one unplaced burial; Thimble Beds: one late offer, one late fee), shows the two sites side by side without mixing equal labels, and produces slips that this register reads as in X5. No Desk action starts an agent, a scheduled task or a network request.

# Hand worked totals

Worked by hand from the written fixture descriptions before any code existed. Tests compare with these numbers. Never update a number here from program output. If a number here is wrong, fix it by hand with the reasoning, in its own change.

Assumptions made where the description is silent are marked **Assumed**. They are fixture choices, and the fixture files must follow them.

## 1 Lantern Fold (churchyard)

Section Yew Walk, plots Y01 to Y12. All spaces checked.

**Assumed:** Y07 has 2 spaces. Every other plot has 1 space.

| State | Plots | Count |
|---|---|---|
| Free | Y03, Y08, Y10 | 3 |
| Reserved | Y02, Y11 | 2 |
| Taken | Y01, Y04, Y05, Y06, Y07, Y09 | 6 |
| Unusable | Y12 | 1 |
| Total | | 12 |

Check: 3 + 2 + 6 + 1 = 12.

Spaces: 11 plots times 1 space, plus Y07 with 2 = 13 spaces.

| Count | Working | Value |
|---|---|---|
| Spaces | 11 + 2 | 13 |
| Free spaces (checked) | Y03, Y08, Y10 | 3 |
| Reserved spaces | Y02, Y11 | 2 |
| Taken spaces | 5 single plots + 2 in Y07 | 7 |
| Unusable spaces | Y12 | 1 |
| Check | 3 + 2 + 7 + 1 | 13 |
| Available spaces headline | checked free spaces | 3 |
| Free plots headline | plots with every space checked and free | 3 |
| Plots needing checking | none unchecked | 0 |
| Placed burials | 1 each in Y01, Y04, Y05, Y06, Y09, plus 2 in Y07 | 7 |
| Unplaced burials | one historical burial | 1 |
| All burials | 7 + 1 | 8 |
| Active reservations | Y02, Y11 | 2 |
| Living reservation holders | one per reservation | 2 |
| Y07 summary | both spaces hold a burial | "Taken · 2 of 2 spaces used" |
| Burials in the family file | only Mirel Quillmoss is approved | 1 |
| Burial rows withheld at Y07 in the private preview | the other Y07 occupant | 1 |
| Living people in the family file | none allowed | 0 |
| Review issues | `placement_missing` (unplaced burial) + `reading_unclear` (one Y07 reading) | 2 |

Search "Quillmoss": 1 result, "Mirel Quillmoss · Y07 · Yew Walk". Directions text exactly: "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07." Gate public name: "Lantern Gate".

Privacy canaries that must be absent from every visitor file byte and every review file byte: the other Y07 occupant's name, both living reservation holders' names, the invented contact, the private inscription word, the page image and its filename. Mirel Quillmoss's name must also be absent from the review file.

## 2 Thimble Beds (allotment)

Plots B01 to B06, one space each. Currency GBP.

### 2.1 Start

| State | Plots | Count |
|---|---|---|
| Taken | B01, B02, B04 | 3 |
| Free | B03, B05 | 2 |
| Unusable | B06 | 1 |
| Total | | 6 |

Check: 3 + 2 + 1 = 6.

**Assumed** fixed dates: both applicants joined 2026-01-10. Tavi Bramblequill has sequence n, Olin Reedwhorl sequence n + 1.

| Item | Value |
|---|---|
| Queue order | 1 Tavi Bramblequill, 2 Olin Reedwhorl |
| First eligible | Tavi Bramblequill |
| Next free plot | B03 (first free plot by code order, **assumed** rule for "next free") |
| Availability file plots | B03, B05 = 2 |
| People in the availability file | 0 |
| B03 charges at start | 0 |

Same date order is decided by sequence alone. Reload, reimport or a display sort by name must still give Tavi then Olin.

### 2.2 Offer and accept B03 (main branch)

**Assumed** dates: offer 2026-04-04 with reply by 2026-04-18. Accepted 2026-04-10.

After the offer, before accept:

| Item | Value |
|---|---|
| B03 state | Reserved |
| Free plots | B05 = 1 |
| Availability file plots | B05 = 1 |
| Next eligible applicant | Olin Reedwhorl (Tavi has a pending offer) |

After accept:

| Item | Value |
|---|---|
| States | Taken 4 (B01, B02, B03, B04), Free 1 (B05), Unusable 1 (B06) |
| Check | 4 + 1 + 1 = 6 |
| Tenancies on B03 | exactly 1, holder Tavi Bramblequill, start 2026-04-10, open end |
| Waiting list | Olin Reedwhorl only, position 1 |
| A second accept press | still 1 tenancy, revision rises once only |

### 2.3 Season fees on B03

**Assumed** season 2026: start 2026-04-01, end exclusive 2027-04-01, due 2026-06-30. Receipts on 2026-05-02 and 2026-06-01.

All money in pence.

| Step | Charge | Received total | Balance | Status |
|---|---|---|---|---|
| Assess GBP 36.00 | 3600 | 0 | 3600 | Due |
| Receive GBP 12.00 | 3600 | 1200 | 3600 minus 1200 = 2400 | Part paid |
| Receive GBP 24.00 | 3600 | 1200 + 2400 = 3600 | 3600 minus 3600 = 0 | Paid |

Messages: "GBP 12.00 recorded. GBP 24.00 still due." then "Paid in full."

Refusals:

| Attempt | Expected |
|---|---|
| Receive GBP 24.01 after the GBP 12.00 receipt | refused, "Amount exceeds the balance of GBP 24.00." Balance stays 2400 |
| Apply the season charge to B03 a second time | still 1 charge, balance unchanged |
| Reverse the GBP 36.00 charge while receipts remain | refused |
| Reverse the GBP 12.00 receipt after both receipts | balance 0 + 1200 = 1200, status Part paid. Re enter GBP 12.00, balance 0 |

### 2.4 Older charge on B02 (due date check)

**Assumed:** season 2025 charge on the current B02 tenancy, GBP 30.00 = 3000 pence, no receipts, due 2025-06-30.

| As at | Balance | Status | `fee_late` |
|---|---|---|---|
| 2025-06-30 | 3000 | Due (due today is due) | no |
| 2025-07-01 | 3000 | Overdue | yes |
| 2026-04-20 (fixed review date) | 3000 | Overdue | yes |

### 2.5 B02 handover (separate branch)

**Assumed:** handover day D = 2026-05-01.

| Item | Value |
|---|---|
| Outgoing tenancy end exclusive | 2026-05-01 |
| Incoming tenancy start | 2026-05-01 |
| Tenancies covering 2026-04-30 | 1, the outgoing one |
| Tenancies covering 2026-05-01 | 1, the incoming one |
| Outgoing tenancy balance after handover | 3000, unchanged |
| Incoming tenancy balance after handover | 0 |
| B02 state on 2026-05-01 | Taken |

Without a successor, ending on 2026-05-01 leaves B02 Free from 2026-05-01.

### 2.6 Late offer branch

Same as 2.2 but the offer is not accepted.

| As at | `offer_late` on B03 |
|---|---|
| 2026-04-18 (reply date) | no |
| 2026-04-19 | yes |
| 2026-04-20 (fixed review date) | yes |

Garden review file at 2026-04-20 in this branch: `offer_late` (B03) + `fee_late` (B02) = 2 issues. People, amounts and names in it: 0.

## 3 Paper book (independent site)

Generated section: 10 rows by 20 columns, prefix C, first number 1, 3 digits. Codes C001 to C200. 10 times 20 = 200 plots, 1 space each.

References R001 to R200, one row each. **Assumed:** R001 to R198 are placed at C001 to C198 in order (198 distinct known locations). R199 and R200 have blank locations. R117's source ref cell is blank in the bad file.

**Assumed:** every generated plot starts unchecked. A placed burial checks only its own space.

### 3.1 First attempt with the bad file

| Count | Value |
|---|---|
| Rows read | 200 |
| Errors | 1 (row for R117, missing source ref) |
| Ready to place | 197 (198 placed rows minus R117) |
| Location to confirm | 2 (R199, R200) |
| Records written | 0 (commit blocked while an error remains; atomic) |
| Revision change | 0 |

Check: 1 + 197 + 2 = 200.

### 3.2 Corrected import

| Count | Value |
|---|---|
| Records written | 200 |
| Placed burials | 198 |
| Unplaced burials | 2 |
| Taken plots | 198 |
| Unchecked plots | 2 (C199, C200) |
| Free plots headline | 0 |
| `placement_missing` issues | 2 |
| Revision change | 1 |

### 3.3 Repeat imports

| Case | New | Unchanged | Conflicts | Writes |
|---|---|---|---|---|
| Same file again | 0 | 200 | 0 | 0 |
| Same file, rows reversed | 0 | 200 | 0 | 0 |
| R117 row changed | 0 | 199 | 1 | 0 until the keeper chooses |

Check: 199 + 1 = 200.

### 3.4 Place R199 on C199

| Count | Before | After |
|---|---|---|
| Placed | 198 | 199 |
| Unplaced | 2 | 1 |
| Unchecked plots | 2 | 1 (C200) |
| Taken plots | 198 | 199 |
| `placement_missing` issues | 2 | 1 |

## 4 Lantern Fold fixture detail and period reports (added for spec 03, worked before the churchyard code)

Section 1 fixes the totals. This section fixes the dates and names the fixture needs for the period report and the family file. Everything here is **Assumed** and invented. The fixed review date is 2026-04-20.

### 4.1 Burials

| Source ref | Place | Name | Date as recorded |
|---|---|---|---|
| LF-01 | Y01 | Edda Thornwick | 1871 (year only) |
| LF-04 | Y04 | Harlan Mossgrove | March 1902 (month and year) |
| LF-05 | Y05 | Name unknown | Date unknown |
| LF-06 | Y06 | Ysolde Fenwick | 14 November 1938 |
| LF-07A | Y07 space 1 | Mirel Quillmoss | 2 June 1889 |
| LF-07B | Y07 space 2 | Torin Pellwick | 1921 (year only) |
| LF-09 | Y09 | Corwin Aldersey | 1955 (year only) |
| LF-H1 | no place | Perrin Gladwyn | 1790 (year only) |

Check: 7 placed (LF-01, 04, 05, 06, 07A, 07B, 09) plus 1 unplaced = 8, as in section 1.

Reservations: Y02 held by Odalys Fennimore from 2025-09-01 (LF-R1). Y11 held by Wren Ashgrove from 2026-02-14 (LF-R2). Y12 is unusable from 2026-01-05. Y03, Y08 and Y10 are confirmed empty.

### 4.2 Period A: from 1880-01-01 through 1950-12-31

| Source ref | Days it could mean | Result |
|---|---|---|
| LF-01 | 1871-01-01 to 1871-12-31, all before 1880 | outside |
| LF-04 | 1902-03-01 to 1902-03-31 | inside |
| LF-05 | any day | Date incomplete |
| LF-06 | 1938-11-14 | inside |
| LF-07A | 1889-06-02 | inside |
| LF-07B | 1921-01-01 to 1921-12-31 | inside |
| LF-09 | 1955, all after 1950 | outside |
| LF-H1 | 1790, all before 1880 | outside |

Burials inside 4. Date incomplete 1. Outside 3. Check: 4 + 1 + 3 = 8.

### 4.3 Period B: from 1938-06-01 through 1955-06-30

| Source ref | Days it could mean | Result |
|---|---|---|
| LF-01 | 1871 | outside |
| LF-04 | March 1902 | outside |
| LF-05 | any day | Date incomplete |
| LF-06 | 1938-11-14 | inside |
| LF-07A | 1889-06-02 | outside |
| LF-07B | 1921 | outside |
| LF-09 | 1955-01-01 to 1955-12-31, only the first half is inside | Date incomplete |
| LF-H1 | 1790 | outside |

Burials inside 1. Date incomplete 2. Outside 5. Check: 1 + 2 + 5 = 8.

### 4.4 Reservations in a period

| Period | Made | Released |
|---|---|---|
| 2025-09-01 to 2026-02-28 | 2 (LF-R1 on 2025-09-01, LF-R2 on 2026-02-14) | 0 |
| 2026-01-01 to 2026-12-31 | 1 (LF-R2) | 0 |
| 2025-01-01 to 2025-08-31 | 0 | 0 |

For 2025-01-01 to 2025-08-31 every dated burial is outside, so burials inside 0 and outside 7. LF-05 has no date at all, so Date incomplete is 1. Check: 0 + 1 + 7 = 8. Because LF-05 is always incomplete, "No events in this period." appears for Lantern Fold never, and is checked on an empty register: inside 0, incomplete 0, made 0, released 0.

If Y02 is released on 2026-03-01 with a reason, then period 2026-03-01 to 2026-03-31 has made 0 and released 1, and at 2026-04-20 the states are Free 4 (Y02, Y03, Y08, Y10), Reserved 1 (Y11), Taken 6, Unusable 1. Check: 4 + 1 + 6 + 1 = 12.

### 4.5 Family file

| Item | Value |
|---|---|
| Burials in the file with the name approved and the year not approved | 1, name "Mirel Quillmoss", no year |
| The same with the year approved | 1, year 1889 |
| Plots in the file | 1 (Y07) |
| Paths in the file | 1 (Yew Walk) |
| Gate name in the file | "Lantern Gate" |
| Rows withheld in the private preview | 1 (Torin Pellwick at Y07) |
| After the name is corrected to "Mirel Quillmoss Jr", burials in the file | 0 until approved again, preview says "Review again" |

### 4.6 Placing the unplaced burial

Place LF-H1 (Perrin Gladwyn) in Y03. Then: Taken plots 7, Free plots 2 (Y08, Y10), unplaced burials 0, `placement_missing` issues 0, `reading_unclear` issues 1. Check: 7 + 2 + 2 reserved + 1 unusable = 12.

### 4.7 Part occupied plot

A plot Z01 with two spaces and one burial in space 1: summary "Taken · 1 of 2 spaces used", available spaces 1, free plots 0. The report line reads "Z01, space 2 is free. Space 1 holds a burial."

## 5 Thimble Beds fixture detail, season report and availability (added for spec 04, worked before the allotment code)

Section 2 fixes the states, the queue and the fees. This section fixes the names, dates and layout the fixture needs, and the season report and the availability file. Everything here is **Assumed** and invented. The fixed review date is 2026-04-20. Money is in pence.

### 5.1 Layout, people and dates

Two sections. Sunny Row holds B01, B02, B03. Shady Row holds B04, B05, B06. One gate, "Main gate". One path, "Grass Walk", between the rows. Each plot has one space. Currency GBP, zone Europe/London.

| Source ref | Plot | Holder | From |
|---|---|---|---|
| TB-T1 | B01 | Marlo Fennick | 2024-04-01 |
| TB-T2 | B02 | Ada Stonecrop | 2025-04-01 |
| TB-T4 | B04 | Ilse Burrowby | 2023-04-01 |

B06 is Unusable from 2026-01-05 (reason "Subsidence"). B03 and B05 are confirmed empty. Applicants: Tavi Bramblequill (sequence 1) and Olin Reedwhorl (sequence 2), both joined 2026-01-10, no preferred section. The handover holder at B02 is Hale Pennywort.

Seasons. Season 2025: 2025-04-01 to 2026-04-01 (end exclusive), due 2025-06-30, standard fee 3000. Season 2026: 2026-04-01 to 2027-04-01, due 2026-06-30, standard fee 3600.

### 5.2 Counts at the start (2026-04-20)

| Item | Working | Value |
|---|---|---|
| Plots | 2 sections of 3 | 6 |
| Taken | B01, B02, B04 | 3 |
| Free | B03, B05 | 2 |
| Unusable | B06 | 1 |
| Check | 3 + 2 + 1 | 6 |
| Open tenancies | one per taken plot | 3 |
| Applicants waiting | Tavi, Olin | 2 |
| Next applicant | lowest sequence on the same date | Tavi Bramblequill |
| Next free plot | first free code | B03 |
| Charges | the Season 2025 charge on B02 only | 1 |
| Charge amount | | 3000 |
| Receipts | none | 0 |
| B02 balance at 2026-04-20 | 3000 charged, 0 received | 3000, Overdue |
| B03 charges | none | 0 |
| `fee_late` issues at 2026-04-20 | B02 | 1 |
| `offer_late` issues at 2026-04-20 | no offer yet | 0 |
| Review issues | 0 + 1 | 1 |

### 5.3 Queue scenarios used by the unit tests

Three applicants. A joined 2026-01-10, sequence 1, prefers Shady Row. B joined 2026-01-10, sequence 2, no preference. C joined 2026-01-12, sequence 3, prefers Sunny Row. Application IDs are chosen so the ID order is C, B, A, the reverse of the sequence order.

| Case | Expected |
|---|---|
| Queue order | A, B, C (date, then sequence, never ID) |
| Offer B03 (Sunny Row) with no skip reasons | next is A, but A prefers Shady Row. The first applicant whose preference fits is B. A is recorded as "Preference does not fit". Offer to B accepted. |
| Offer B03 to C | A and B are ahead. A does not fit. B fits, so B is an exceptional skip and needs a reason. Without a reason the offer is refused. With the reason it is recorded for B. |
| A has an open offer, then offer B05 (Shady Row) | A is "Offer pending". B is the first eligible and fits. |
| Same date import of D then E with no Tie order | D gets the lower sequence |
| Same date import of D then E with Tie order 2 and 1 | E gets the lower sequence |
| Decline with Keep place | the applicant is back at the same position |
| Decline with Leave list | the applicant is out of the queue |

### 5.4 Season report

Season 2025 as at 2026-05-02: one charge row, B02, holder Ada Stonecrop, charged 3000, received 0, reversed 0, balance 3000. Fees charged 3000. Fees received 0. Balance due 3000.

Season 2026 as at 2026-05-02, after the offer on B03 is accepted on 2026-04-20 and GBP 36.00 is charged, GBP 12.00 received on 2026-05-02 and GBP 24.00 received on 2026-06-01. Only the receipt of 2026-05-02 is counted as at 2026-05-02:

| Item | Working | Value |
|---|---|---|
| Rows | the B03 tenancy only | 1 |
| Charged | | 3600 |
| Received | 1200 | 1200 |
| Balance due | 3600 minus 1200 | 2400 |

Season 2026 as at 2026-06-30 with both receipts: received 1200 + 2400 = 3600, balance due 0. After the GBP 12.00 receipt is reversed: received 3600, reversed 1200, fees received net 2400, balance due 1200.

Plot handovers as at 2026-05-02 with the B02 handover on 2026-05-01: 1 (B02, Ada Stonecrop to Hale Pennywort). As at 2026-04-30: 0. Waiting list order as at 2026-05-02 after Tavi accepted: Olin Reedwhorl at position 1.

Season 2026 with no charges applied: "No charges in this season."

### 5.5 Availability file

| State | Listed by the keeper | Free plots in the file | Neutral ground |
|---|---|---|---|
| Start | B03, B05 | B03, B05 = 2 | B01, B02, B04, B06 = 4 |
| After the offer on B03 | B03, B05 | B05 = 1 | B01, B02, B03, B04, B06 = 5 |
| After the offer on B03 and B05 not listed | B03 | 0 | 6 |

Check: free plots plus neutral ground equals the six plots with a shape (2 + 4, 1 + 5, 0 + 6). Public words: site name "Thimble Beds", gate name "Thimble Gate", path "Grass Walk", sections "Sunny Row" and "Shady Row", instructions "Ask the secretary at the hut on Saturday morning. Say the plot code." Persons in the file: 0. Amounts in the file: 0. Queue positions in the file: 0.

Privacy canaries that must be absent from every availability file byte and every review file byte: Tavi Bramblequill, Olin Reedwhorl, Marlo Fennick, Ada Stonecrop, Ilse Burrowby, Hale Pennywort, their contacts, the amounts 36.00, 30.00, 12.00 and 24.00 as written and as 3600, 3000, 1200 and 2400, and the receipt reference "TB-RCPT-1".

### 5.6 Review facts

| As at | Case | Facts |
|---|---|---|
| 2026-04-20 | start state | `fee_late` on the B02 charge = 1 |
| 2026-04-20 | offer on B03 made 2026-04-04 with reply by 2026-04-18, not accepted | `offer_late` on B03 + `fee_late` on B02 = 2 |
| 2026-04-18 | same offer | `offer_late` 0, because the reply date itself is not late |
| 2026-06-30 | the B02 charge, due 2025-06-30, fully paid | 0 |
| any | an offer with no reply date | 0 |

## 6 Committee exchange (added for spec 05, worked before the exchange code)

Sections 1, 2, 4 and 5 fix the checks. This section fixes the packet, the keys, the versions and the slip readings. Everything here is **Assumed** and invented. The fixed review date is 2026-04-20. "Record n" is the neutral label a subject gets when it first appears, where n counts the subjects in the ledger from 1.

### 6.1 Sizes of the two files

| File | Top level fields | Fields in each issue or decision |
|---|---|---|
| Review packet `plot.review.v1` | format, siteKind, siteKey, lineageId, siteAlias, revision, asOf, issues = 8 | issueKey, subjectKey, label, rule, factVersion, action = 6 |
| Return slip `plot.slip.v1` | format, siteKey, lineageId, packetRevision, packetAsOf, decisions = 6 | actionId, issueKey, factVersion, disposition, reviewedOn = 5 |

A packet with 2 issues holds 8 + 2 times 6 = 20 values. A slip with 2 decisions holds 6 + 2 times 5 = 16 values.

Limits: 2,000 issues are accepted and 2,001 refused. A label or a site name of 40 characters is accepted and 41 refused. A packet of 2 MiB (2,097,152 bytes) is accepted and one byte more is refused.

Rule to action: `placement_missing` gives `check_location`, `reading_unclear` gives `read_stone_again`, `offer_late` gives `check_reply`, `fee_late` gives `check_payment`.

### 6.2 Lantern Fold at 2026-04-20

Section 1 gives 2 review issues. The church lists an unplaced burial first, then an unclear reading, so the first export gives:

| Label | Rule | Action | Fact version |
|---|---|---|---|
| Record 1 | `placement_missing` (LF-H1, the unplaced burial) | `check_location` | 1 |
| Record 2 | `reading_unclear` (the Y07 reading) | `read_stone_again` | 1 |

Check: 1 + 1 = 2 issues. The site name is "Site 1" because none was approved. Let R be the revision of the walkthrough before the export. The first export stores 2 new subjects, so it commits once and the packet revision is R + 1. A second export on the same date commits nothing, the revision stays R + 1 and the file has the same bytes.

Canaries absent from the packet bytes: Mirel Quillmoss, Torin Pellwick, Perrin Gladwyn, both living reservation holders, the invented contact, the private inscription word, "LF-H1", "LF-07A", "Lantern Fold", "Y07", "Y03". Total 0 found.

### 6.3 Thimble Beds

At 2026-04-20 in the start state (hand totals 5.6): 1 issue, `fee_late` on the B02 charge, label Record 1, action `check_payment`.

In the late offer branch (offer on B03 made 2026-04-04, reply by 2026-04-18, hand totals 2.6), a first export at 2026-04-20 gives 2 issues. The garden lists a late offer first, then a late fee:

| Label | Rule | Action | Fact version |
|---|---|---|---|
| Record 1 | `offer_late` (B03) | `check_reply` | 1 |
| Record 2 | `fee_late` (B02 charge) | `check_payment` | 1 |

Check: 1 + 1 = 2 issues, as hand totals 2.6. Canaries absent from the packet bytes: Tavi Bramblequill, Olin Reedwhorl, Marlo Fennick, Ada Stonecrop, Ilse Burrowby, Hale Pennywort, their contacts, 36.00, 30.00, 12.00, 24.00, 3600, 3000, 1200, 2400, "TB-RCPT-1", "B02", "B03", "Thimble Beds". Total 0 found.

### 6.4 Keys and versions over several exports (Thimble Beds, late offer branch)

| Step | As at | Issues in the file | Commits | Notes |
|---|---|---|---|---|
| A | 2026-04-18 | fee_late = 1 | 1 | New subject, label Record 1, version 1. Key F |
| B | 2026-04-18 again | fee_late = 1 | 0 | Same key F, same bytes, revision unchanged |
| C | 2026-04-20 | offer_late + fee_late = 2 | 1 | Offer is a new subject, label Record 2, key O, version 1. Fee keeps key F and version 1 |
| D | 2026-04-18 | fee_late = 1 | 0 | The offer is not late yet. Its key stays stored |
| E | 2026-04-20 | offer_late + fee_late = 2 | 0 | The offer reopens with key O and version 1 |
| F | 2026-04-22, after a receipt of 1000 pence on 2026-04-21 | offer_late + fee_late = 2 | 1 | The balance of the charge goes from 3000 to 2000, so fee_late has version 1 + 1 = 2. Key F is the same. The offer is still version 1 |
| G | 2026-04-24, after a receipt of 2000 pence on 2026-04-23 | offer_late = 1 | 0 | The charge is paid, so fee_late is no longer raised. Keys O and F stay stored |

Subjects stored after step C: 2. After G: still 2. Commits over A to G: 3 (A, C, F). Check: 1 + 0 + 1 + 0 + 0 + 1 + 0 = 3.

Lantern Fold: after the first export, the keeper corrects the Y07 reading's words (still unclear). Its fact version at the next export is 1 + 1 = 2, its key is unchanged, and placement_missing stays version 1. After LF-H1 is placed in Y03 (hand totals 4.6), the next export has 1 issue (reading_unclear) and the placement key stays stored.

### 6.5 Reading a slip in Lantern Fold

After the first export the two issues are I1 (placement) and I2 (reading). The slips below are made for the test, one decision each unless noted.

| Slip | Decisions | State of the register when it is read | Rows |
|---|---|---|---|
| S1 | D1 (I1, version 1, checked), D2 (I2, version 1, needs_keeper) | unchanged | Ready to check 2 |
| S1, after Record receipt | the same | 2 receipts stored | Already received 2, Ready 0. Record receipt is not offered |
| S2 | D3 (I1, version 1), D4 (I2, version 1), new action IDs | the Y07 reading's words changed, still unclear | D3 Ready to check, D4 Source has changed (open version 2). Ready 1, changed 1 |
| S2, after LF-H1 is placed in Y03 | the same | placement_missing closed | D3 Issue already closed, D4 Source has changed. Ready 0, closed 1, changed 1 |
| S3 | D5 with an issue key the register never made | any | Issue already closed |
| S4 | any decision, but its siteKey is another UUID | any | refused as a whole, 0 rows, "This slip belongs to another register." |

Record receipt on S1 writes 2 `review_received` events in one commit. The revision rises by 1. The record counts do not change: unplaced burials 1, plots Taken 6, reservations 2, readings unclear 1 (hand totals section 1 and 4). A second Record receipt on S1 writes 0 events.

### 6.6 Desk comparison vectors

Current packet C: source P, revision 5, asOf 2026-04-20, issues a (version 1) and b (version 1).

| Incoming | Result | New | Still open | Changed | No longer flagged |
|---|---|---|---|---|---|
| Same bytes | same | | | | |
| Revision 4, asOf 2026-04-20 | stale | | | | |
| Revision 6, asOf 2026-04-19 | stale | | | | |
| Revision 5, asOf 2026-04-20, only a (version 1) | conflict | | | | |
| Revision 6, asOf 2026-04-21, a (version 2) and c (version 1) | replace | c | none | a | b |
| Revision 6, asOf 2026-04-20, a, b and c all version 1 | replace | c | a, b | none | none |
| Source Q (another siteKey), same issue keys, revision 9 | different source | | | | |

Check: row 5 has 1 + 0 + 1 + 1 = 3 keys (a, b, c). Row 6 has 1 + 2 = 3 keys.

### 6.7 The pinned copy

Files copied: exchange schema, packet, compare, slip (4), calendar, limits, types (3) = 7 source files. Written with them: vectors.json and provenance.json = 9 files in all. `provenance.json` lists 7 source files and vectors.json = 8 entries and not itself. One required package: zod 4.6.7.

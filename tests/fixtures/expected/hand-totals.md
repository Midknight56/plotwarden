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

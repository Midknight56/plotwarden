---
inclusion: always
---

# Records and privacy

Full contract: `.kiro/specs/00-contracts/requirements.md` and `design.md`. This file is the short form.

## Three models, kept apart

| Model | Who sees it | Built how |
|---|---|---|
| Private register | The keeper on this device, private backup, private reports and CSV | Canonical events and derived indexes |
| Visitor (`plot.family.v1`, `plot.availability.v1`) | Families and plot seekers | Constructed field by field from explicit approvals. Closed schema that rejects unknown keys at every depth |
| Committee (`plot.review.v1`, `plot.slip.v1`) | The Review Desk | Safe issue facts only. Closed schema |

- A visitor or committee module never imports a private type. Never spread, copy or filter a private object into a public one.
- **Living people never appear in visitor output.** Not reservation holders, applicants, tenants, contacts or co holders. Garden visitor output has no person field at all.
- A deceased name reaches a family file only after the keeper approves that burial and that field. A material change to name or identity returns the approval to review. Approval always uses current consent.
- Committee files carry no person name, contact, amount, note, inscription, image or private site title.
- Private data never goes into URLs, filenames, logs, analytics, localStorage keys, caches, image metadata or the clipboard by default.

## Identity

- Every private ID is a locally generated UUID. A visible plot code is separate and can change. Prior codes stay searchable and reserved.
- A plot has one or more spaces, each with its own ID. One burial per space. A garden plot has exactly one space.
- Imported rows are identified by `(siteId, sheet, sourceRef)`. Never by line number, filename or a person's name.
- Names need not be unique. Similar names give suggestions, never merges.

## Change

- Every change is an appended event. Stored event bytes never change. Errors are fixed by a correction event that names the original and a reason.
- One user intent has one operation ID. A repeated operation returns the earlier result.
- A commit checks the expected revision inside one IndexedDB readwrite transaction and increments the revision once.
- Show "Saved on this device." only after the transaction completes.

## Never infer

- Never infer vacancy, placement, a date, a holder, consent or a merge from a missing or similar value.
- A partial date keeps its precision. "Year only" never becomes 1 January.
- Blank money is unknown, not zero.

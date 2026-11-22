---
inclusion: always
---

# Plotwarden product

Plotwarden keeps plot registers on the keeper's own device.

- **Churchyard Register.** A volunteer warden turns paper burial records and a site plan into searchable burials, explicit gaps, an approved family map and dated private reports.
- **Allotment Register.** A garden secretary offers the next free plot to the next eligible applicant, records the tenancy and the rent already received, and hands a plot on without losing its history.
- **Plotwarden Review Desk.** A separate committee app, built in its own repository, reads small review files from either register, prints one list of checks and returns a slip to each keeper. It never writes into a private register.
- **Template.** Both registers are built on one plot foundation in `template/`. A third use (a market stall register) proves the foundation needs no core edit for a new set of rules.

## Who uses it

| Person | Gets |
|---|---|
| Warden | Private register, map, reports, backup |
| Family visitor | One self contained visitor file or printed sheet with approved names only |
| Garden secretary | Waiting list, offers, tenancies, season fees, handovers, reports |
| Plot seeker | A dated map of free plots and how to ask the secretary |
| Committee reviewer | A list of open checks with no personal data, and a return slip |

## Fixed product choices

- Everything runs in the browser on the keeper's device. No login, no server, no sync, no analytics, no recognition service, no real payments, no network call at run time.
- The map is a location aid drawn in local coordinates. It carries no address, longitude, distance, route or legal boundary.
- Four physical states: Free, Reserved, Taken, Unusable. "Needs checking" and "Location to confirm" are separate from them.
- Visitor output is built field by field from what the keeper approved. A living person never appears in visitor output.
- Lantern Fold and Thimble Beds are invented walkthrough places. Their records were made for this project.

## Sources of truth

- Contracts and invariants: `.kiro/specs/00-contracts/`.
- Each later feature: `.kiro/specs/01-foundation` to `06-access-and-release`.
- Interface words: the copy catalog in each app and `template/src/ui/copy.ts`. Never invent new screen words without adding them to the catalog.

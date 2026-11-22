# 00 Contracts: tasks

Spec 00 writes contracts, fixtures of expected values and project setup. It writes no application code. Each later spec turns its T IDs into red then green tests.

## Tasks in this spec

- [x] 0.1 Write steering, agent profiles and hooks (R25). Validate both profiles with `kiro-cli agent validate`. T IDs: none (checked by the validator).
- [ ] 0.1a Create `.kiro/settings/mcp.json` with `plot-inspector` disabled, exactly as in D13. The agent cannot write `.kiro/settings/` (a fixed Kiro rule), so a person creates it. T IDs: none (feeds T33).
- [x] 0.2 Work the hand totals for Lantern Fold, Thimble Beds and the 200 record paper book in `tests/fixtures/expected/hand-totals.md` before any code (R24). Feeds T12, T07, T13, T17, T18, T20, T22, T24, T30.
- [x] 0.3 Fix identity, partial date, source key, queue tie and protected field contracts (R1 to R12, D2, D4, D5, D7). Feeds T02, T03, T06, T07, T12, T13, T14, T16, T17, T21.
- [x] 0.4 Fix the template and adapter contract and the import direction (R14, D1, D3). Feeds T01, T34.
- [x] 0.5 Fix the commit transaction, event identity and stale state text (R9, D6). Feeds T09, T18.
- [x] 0.6 Fix the closed visitor schemas and the committee packet and slip contracts shared with the Desk repository (R15 to R19, D9 to D11). Feeds T22, T24, T25, T26, T28.
- [x] 0.7 Fix the limits table (R21, D12). Feeds T32, T06, T10, T11.
- [x] 0.8 Review the requirements once against the plan sections on data, paper entry, screens, the Desk, layout, tests and Kiro setup. Add the uncovered points as R26 to R31. Feeds T03, T04, T05, T06, T07, T08, T09, T10, T11, T15, T18, T19, T21, T22, T23, T25, T26, T27, T28, T35.

## T ID ownership

Every T ID from the plan's test table is owned by exactly one later spec task. The owner writes the red assertion first.

| T ID | Test file | Owner spec | Requirements |
|---|---|---|---|
| T01 | `tests/unit/adapter.test.ts` | 01-foundation | R14 |
| T02 | `tests/unit/site.test.ts` | 01-foundation | R1, R11, R24.3 |
| T03 | `tests/unit/grid.test.ts` | 02-paper-and-map | R1, R2 |
| T04 | `tests/unit/geometry.test.ts` | 02-paper-and-map | R21, D12 |
| T05 | `tests/unit/trace.test.ts` | 02-paper-and-map | R1.2, R15, R20 |
| T06 | `tests/unit/csv.test.ts` | 02-paper-and-map | R5.5, R7, R21 |
| T07 | `tests/unit/importBatch.test.ts` | 02-paper-and-map | R7, R24 |
| T08 | `tests/unit/fastEntry.test.ts` | 02-paper-and-map | R7, R4.5 |
| T09 | `tests/unit/storage.test.ts` | 01-foundation | R9 |
| T10 | `tests/unit/backup.test.ts` | 02-paper-and-map | R20, R21 |
| T11 | `tests/unit/images.test.ts` | 02-paper-and-map | R21, R22.2 |
| T12 | `tests/unit/status.test.ts` | 01-foundation | R3, R8 |
| T13 | `tests/unit/burial.test.ts` | 03-churchyard | R3, R5, R6, R10, R11.5 |
| T14 | `tests/unit/reservation.test.ts` | 03-churchyard | R4, R8 |
| T15 | `tests/unit/memorial.test.ts` | 03-churchyard | R17.2, R15.5 |
| T16 | `tests/unit/search.test.ts` | 01-foundation | R2, R4.5, R6 |
| T17 | `tests/unit/queue.test.ts` | 04-allotment | R11.3, R12 |
| T18 | `tests/unit/offer.test.ts` | 04-allotment | R9, R12, R13.1 to R13.3 |
| T19 | `tests/unit/tenancy.test.ts` | 04-allotment | R10, R13.4, R13.5 |
| T20 | `tests/unit/fees.test.ts` | 04-allotment | R11.2, R13.6 to R13.12 |
| T21 | `tests/unit/history.test.ts` | 01-foundation | R5.3, R5.4, R9.7, R10 |
| T22 | `tests/unit/visitor.test.ts` | 03-churchyard (family), 04-allotment (availability) | R15 |
| T23 | `tests/unit/report.test.ts` | 03-churchyard (private and family print), 04-allotment (season report) | R15.8, R20.7 |
| T24 | `tests/unit/exchange.test.ts` | 05-exchange | R16 to R18, R20 |
| T25 | Desk `tests/tools.test.ts` | 05-exchange, built in the Desk repository | R19 |
| T26 | Desk `tests/persistence.test.ts` | 05-exchange, built in the Desk repository | R19 |
| T27 | Desk `tests/manifest.test.ts`, `tests/provenance.test.ts` | 05-exchange, built in the Desk repository | R19, D1 vendoring |
| T28 | `tests/unit/privacy.test.ts` | 01-foundation (types and canaries), 06-access-and-release (full file and log scan) | R15, R16, R22 |
| T29 | `tests/unit/preferences.test.ts` | 06-access-and-release | R23.3 |
| T30 | `tests/unit/walkthrough.test.ts` | 06-access-and-release | R24 |
| T31 | `tests/unit/offline.test.ts` | 06-access-and-release | R22 |
| T32 | `tests/unit/limits.test.ts` | 01-foundation | R21 |
| T33 | `tests/unit/inspect.test.ts` | 06-access-and-release | R25.2, R25.4 |
| T34 | `tests/unit/scaffold.test.ts` | 06-access-and-release | R14.5 |
| T35 | `tests/unit/copy.test.ts` | 06-access-and-release | R23.1 |
| T36 | `tests/unit/release.test.ts` | 06-access-and-release | R22 |

Each owner spec's `tasks.md` repeats its T IDs on its own task lines.

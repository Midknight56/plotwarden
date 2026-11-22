# 04 Allotment: design

This design says how spec 04 builds A1 to A12. Names in `code` are files or exports. Where it adds detail to a contract, it says so.

## G1 Files and what each owns

Every production file has a test listed in `tasks.md`.

| File | Owns | Layer |
|---|---|---|
| `apps/allotment-register/index.html`, `package.json`, `vite.config.ts` | The page, the package and the build of the app. Preview on 127.0.0.1 port 4178 (strict), dev on 4179 | app |
| `src/types.ts` | `AllotState`, records, commands, events | pure |
| `src/rules.ts` | `decideAllot`, `applyAllot`, `validateAllot`, `emptyAllot`, queue helpers (`queueView`, `offerPlan`) | pure |
| `src/fees.ts` | Ledger from entries (`ledgerOf`, `ledgerAt`), fee status, tenancy balance, season totals and the season report data | pure |
| `src/fields.ts` | Field list and the Waiting list and Tenancies sheets | pure |
| `src/adapter.ts` | `allotAdapter`, `waitingImporter`, `tenanciesImporter`, `allotRecords` (search names) | pure |
| `src/projection.ts` | `buildAvailabilityFile`, preview, public label checks | pure |
| `src/review.ts` | `offer_late` and `fee_late` facts | pure |
| `src/copy.ts` | The Allotment copy catalog, `allotError`, `availabilityWords` | pure |
| `src/walkthrough.ts` | Thimble Beds: IDs, commands, dates | pure |
| `src/intent.ts` | `useIntent`, `useAllot`, `printHtml` (one operation per intent, repeat press guard, focus) | ui |
| `src/{main,AllotmentHome,WaitingList,Offer,Tenancy,Handover,Season,Payments,SeekerSheet,SeasonReport}.tsx` | The app entry and its screens | ui |
| `src/theme.css` | The garden look | ui |
| `template/src/output/availabilityMap.ts` | `availabilityMapSvg`: the map of an availability file, drawn from its public geometry alone | output |
| `template/src/output/availabilityHtml.ts` | `buildAvailabilityHtml`, `availabilityFileName`, `AvailabilityWords`: the self contained seeker file | output |
| `template/src/output/print.ts` | `buildAvailabilityPrint` (new), beside the family and report prints | output |
| `template/src/map/sheet.ts` | Label placement (G12) | pure |
| `template/src/ui/SiteMap.tsx`, `register.css` | The `bed` plot shape and its hatching and peg | ui |
| `template/src/adapter.ts` | `ThemeTokens.plotShape` gains `"bed"` | pure |
| `assets/garden-margin.svg`, `assets/origins.md` | Original art | assets |
| `tests/helpers/{gardenEnv,thimbleBeds,gardenCanaries}.ts` | A fake database register for tests, the hand worked Thimble Beds expectations, the canaries | test only |

The app imports the template and its own folder only. The template imports no app.

## G2 State

```ts
interface AllotState extends BaseState {
  currency?: Currency;                         // from the site, or `currency_set` before any charge
  people: Record<Uuid, Person>;                // living people: applicants, holders. Private.
  applications: Record<Uuid, Application>;
  nextSequence: number;                        // the counter. Starts at 1.
  offers: Record<Uuid, Offer>;
  tenancies: Record<Uuid, Tenancy>;
  seasons: Record<Uuid, Season>;
  ledger: Record<Uuid, LedgerEntry>;           // charges, receipts, reversals
  pub: PublicSettings;
}
Application { applicationId; personId; joinedOn; sequence; preferredSectionId?; sourceRef?;
              state: "waiting" | "offered" | "housed" | "withdrawn"; offerId?; withdrawn?: { on; reason } }
Offer { offerId; applicationId; plotId; spaceId; claimId; offeredOn; replyBy?;
        state: "open" | "accepted" | "declined" | "released";
        skipped: { applicationId; kind: "pending" | "preference" | "exceptional"; reason? }[];
        closed?: { on; choice?: "keep_place" | "leave_list"; withdrew?: boolean; reason?: string }; tenancyId? }
Tenancy { tenancyId; personId; plotId; spaceId; claimId; start; endExclusive?; sourceRef?;
          fromOffer?; handoverFrom?: Uuid }
Season { seasonId; name; start; endExclusive; dueOn?; standardFee }
LedgerEntry { entryId; tenancyId; seasonId; type: "charge" | "receipt" | "reversal"; minorUnits; on: LocalDate;
              chargeId?: Uuid;           // for a receipt: the charge it pays
              reverses?: Uuid;           // for a reversal: the entry it undoes
              waiver?: string; ref?: string; reason?: string }
PublicSettings { siteName?; gateName?; instructions?; sectionNames; pathNames; plotCodes; listed: Record<Uuid, true> }
```

A tenancy writes one `taken` claim with `endable: true` and `ref` set to the tenancy ID. An open offer writes one `held` claim with `endable: true` and `ref` set to the offer ID. A person with an application is in `people`. An application's `state` is `offered` only while an offer is open.

## G3 Commands and events

| Command | Decides | Events (after the core ones) |
|---|---|---|
| `add_applicant` | A1.1, A1.4. The sequence is `command.sequence` when an import gives one (it must be new and above zero), else `nextSequence` | `applicant_added` with `sheet: "Waiting list"` and the source ref |
| `correct_joined_on` | A1.1: date, reason, original event | `joined_on_corrected` with `corrects` |
| `withdraw_applicant` | A1.7 | `applicant_withdrawn` |
| `make_offer` | A2.1 to A2.3, A2.8: claim `held` from the offer date, skips computed from the queue | core `claim_added`, `offer_made` |
| `accept_offer` | A2.4: the hold is converted into a tenancy claim on the accept date | core `claim_ended`, `claim_added`, `offer_accepted` |
| `decline_offer` | A2.5: the choice is required | core `claim_ended`, `offer_declined` |
| `release_offer` | A2.6: needs an overdue offer | core `claim_ended`, `offer_released` |
| `record_tenancy` | A3.1, A3.2 | core `claim_added`, `tenancy_started` with `sheet: "Tenancies"` |
| `end_tenancy` | A3.3 | core `claim_ended`, `tenancy_ended` |
| `hand_over` | A3.4 | core `claim_ended`, `claim_added`, `tenancy_ended`, `tenancy_started` |
| `set_currency` | A4.9: refused once any charge exists | `currency_set` |
| `new_season` | A4.2 | `season_added` |
| `apply_charges` | A4.3, A4.4 | one `charge_applied` per new tenancy |
| `record_receipt` | A4.5 | `receipt_recorded` |
| `reverse_entry` | A4.7 | `entry_reversed` |
| `set_public` | A6.1: names, instructions and the chosen plots | `public_set` |

`decideAllot` checks the field errors with `validateAllot`, then the state, then calls `decideCore` for the claim parts, then writes the allotment event last. IDs come from the command. Dates: a tenancy claim starts on a full day. An end date is the first day not covered.

A hold or a tenancy that ends on or before its own start is written as a zero length span: `endHold` writes `claim_ended` with `endExclusive` equal to the start, so a same day decline or accept needs no later date.

Error codes added by this spec: `open_request`, `no_such_application`, `no_such_person`, `not_waiting`, `offer_open`, `no_such_offer`, `offer_closed`, `skip_reason_required`, `bad_skip`, `choice_required`, `not_overdue`, `no_such_tenancy`, `tenancy_ended`, `bad_interval` (core), `sequence_used`, `no_currency`, `currency_fixed`, `no_such_season`, `season_exists`, `already_charged`, `waiver_reason_required`, `bad_amount`, `exceeds_balance` (detail `amount` holds the formatted balance), `no_such_entry`, `already_reversed`, `charge_has_receipts`, `charge_reversed`, `plot_not_free`, `no_such_plot`, `no_such_space`, `no_such_section`.

## G4 Queue

`queueView(state, asOf)` returns the waiting applications in the order of `orderQueue` from the template (`joinedOn`, `sequence`, `applicationId`), each with its position, its person and a `reason`: `"pending"` for an application with an open offer (it stays in the order and is never the next one), else none. `nextApplicant(state)` is `nextEligible`.

`offerPlan(state, plotId, applicationId)` returns, for a chosen plot and application, `skipped`: every application ahead of the chosen one in the order, each with a kind. `pending` when it has an open offer. `preference` when it has a preferred section that is not the plot's section. Otherwise `exceptional`. It also returns `firstFit`, the first eligible application whose preference fits. `make_offer` refuses with `skip_reason_required` when an exceptional skip has no reason in `skipReasons[applicationId]`. `make_offer` refuses with `not_waiting` when the chosen application is not waiting.

Sequences. `add_applicant` with no `sequence` takes `nextSequence`. An import gives `sequence = base + n`, where `base` is `nextSequence - 1` when the import opens and `n` is the row's Tie order, or the row's place in the file when it has none. A sequence already used is refused as `sequence_used`, so a mixed file with a repeated place is shown as a row error. `nextSequence` becomes one above the highest sequence stored.

## G5 Offers and tenancy

An offer writes a core `claim_added` (`held`, from the offer date, `ref` the offer ID). A second hold on the same plot fails in the core as `claim_overlap`, which the rule turns into `offer_open`. A second offer for the same application fails on its state.

Accept: `claim_ended` (via `converts`) then `claim_added` (`taken`, endable, start on the accept date, `ref` the tenancy ID). The accept date must not be before the offer date.

`endHold(state, claimId, on, reason)` ends a hold or tenancy claim at `on`, or at its own start when `on` is not after it. It never ends a claim before its start.

`hand_over` runs `endHold` for the outgoing claim at D, then adds the incoming claim from D, so the core dry run covers the whole timeline: a later tenancy that would overlap is refused with its source ref. A hand over needs the incoming holder: an existing person ID or a new one with a name and optional contact.

## G6 Fees

`fees.ts` builds a `ChargeLedger` (from `template/src/money.ts`) for a charge at a date: `charge` is the charge amount, and `receipts` are the receipt entries of that charge dated on or before the date, each `reversed` when a reversal dated on or before the date undoes it. `balanceOf`, `receive` and `feeStatusAt` come from the template, so the app and the oracle use one calculation of the balance. A reversed charge is out of every total.

`apply_charges` takes `{ seasonId, items: [{ chargeId, tenancyId, amount?, waiveReason? }] }`. The amount is the standard fee by default. A waiver is amount 0 with a reason. An item whose tenancy has a live charge in this season is skipped and named in the result error `already_charged` only when every item is skipped.

`record_receipt` refuses an amount above the balance at the receipt date with `exceeds_balance`. `reverse_entry` on a receipt writes a reversal of that receipt's exact amount once. On a charge it is refused while any receipt of it is live, else it voids the charge. Each reversal needs a reason.

A season charge is compared with the receipts of its own tenancy only. A handover never moves a balance: `tenancyBalance(state, tenancyId, asOf)` reads the entries of that tenancy.

## G7 Season report

`seasonReport(state, { seasonId, asOf, revision })` returns rows, one per live charge of the season on or before `asOf`: tenancy, plot code, holder, charged, received (gross), reversed, balance, status. It also returns totals (charged, received net, balance due), the plot handovers up to `asOf` and the waiting list order. `reportTable` turns it into a `ReportTable` for `buildReportPrint`, and `reportCsv` writes the private CSV with `toCsv`. The table says "Private" in its footer.

## G8 Availability file

`buildAvailabilityFile(state, { asOf, revision, newPublicId })` returns `{ ok: true, file, preview }` or the missing and flagged fields. Each field is written by hand:

- `siteTitle`: `pub.siteName`, required.
- `gate`: `pub.gateName` with the map gate point. A map with no gate gives `no_gate`.
- `paths`: each map path whose ID is in `pub.pathNames`.
- `sections`: each section holding a listed free plot, labelled `pub.sectionNames[id]` or "Section n".
- `freePlots`: each listed plot that is free at `asOf` (one checked space, no claim, not unusable), with its outline and the code `pub.plotCodes[plotId]` or its code.
- `neutralGround`: the outline of every other plot that has a shape.
- `instructions`: `pub.instructions`.

Public IDs are minted for the file. `flagPrivateStrings` runs on every public word with every person name and contact of the register. The file is parsed with `parseAvailability` before it is returned. A plot with an open offer has a held claim, so it is not free and drops out at once.

## G9 Output builders

`availabilityMapSvg(file, { width, label, plotIds?, selectedPlotId?, selectable? })` draws beds (a footprint with a strip of hatching and a square peg with the code), grass paths, the gate, section outlines, neutral ground in a plain outline, and the north arrow. Text is 12 px or more. Label places follow the same clear of lines rule as G12.

`buildAvailabilityHtml(file, words, theme)` writes one HTML string: a Content Security Policy (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'`), a heading with "As at {date}", a plain list of free plots that works with script off, a section chooser and "Show location" that work with script on, the instructions under "Ask the secretary about this plot", and the map. The embedded JSON is the availability object and escapes `<`, `>`, `&`, U+2028 and U+2029.

`buildAvailabilityPrint(file, words, { paper, orientation })` builds a second document from the same object: title, "As at", entrance, the list, instructions and the map. A dense map (more than 60 listed or neutral plots) splits like the family print.

## G10 Review facts

`allotReviewFacts(state, asOf)` returns `offer_late` for each open offer with `replyBy` and `asOf > replyBy`, and `fee_late` for each live charge with `dueOn` (the season's) and a positive balance at `asOf` and `asOf > dueOn`. The subject ID is the offer ID or the charge ID. Labels are `Record {n}`.

## G11 Adapter, sheets, walkthrough

`allotAdapter` is a `RegisterAdapter<AllotState, AllotCommand, AllotEvent>` with kind `allotment`, `usesCurrency: true`, `spacesPerPlot` 1 to 1, the sheets "Waiting list" (required: Source ref, Applicant, Joined date; optional: Contact details, Preferred section, Tie order) and "Tenancies" (required: Source ref, Plot, Plot holder, Tenancy begins; optional: Contact details, Tenancy ends), `project` (private: the state; visitor: the availability file when the settings allow, else `null`; committee: the review facts), and the theme `{ ink: "#1B312A", paper: "#F7F5E8", accent: "#2F6B4F", plotShape: "bed" }`.

`waitingImporter` locates a preferred section by `normalizeCode` of its name. A joined date must be exact. `tenanciesImporter` locates the plot by code and gives `record_tenancy`. A row that equals the stored row after normalising is "Already in register". A changed row is a conflict, as in the shared importer.

`thimbleBeds` (the walkthrough) builds the section 2.1 and 5.1 fixture through commands in six batches at 2026-04-20: the map, the checks, the tenancies, the seasons and the 2025 charge, the applicants and the public settings. IDs come from `newId`.

## G12 Label placement on the shared sheet

`buildSheet` places every label with `placeLabel`. A candidate is a rectangle (width from the text length at 7.2 px a letter, height 16 px). The obstacles are: every segment of every path (padded by half the stroke, 7 px, and 4 px clear), the tab rectangle, the north arrow box, the gate mark, every placed label, and every plot box for labels that are not a plot's own. A candidate must stay 8 px inside the sheet. Candidates for a gate label run right, left, above, below, then further out. A section label tries above left, above right, below left, inside top left, then shifts clear of the tab. A path label tries above and below the middle of each segment from the middle outward. A plot label keeps its place inside the plot. The first candidate with no overlap wins. When none is clear, the one with the least overlap wins. The sheet never drops a label.

`tests/helpers/measureLayout.ts` gains `measureSheetLabels(page)`: it reads each text of `svg.sheet`, its box, every `.path-line` polyline, the tab and the north arrow, and reports `label_on_line`, `label_on_tab` and `label_overlap` with 2 px tolerance.

## G13 Screens and routes

Routes under `#/r/<siteId>`: home (`app.home`), `waiting`, `offer`, `tenancy`, `handover`, `season`, `payments`, `seeker`, `report`, and the shared ones.

| Screen | File | Words (plan section 5, Allotment Register) |
|---|---|---|
| Secretary desk | `AllotmentHome.tsx` | "Allotment Register", "Next free plot", "Next applicant", "Make an offer", "Waiting list", "Current tenancies", "Season fees", "Make an availability map" |
| Waiting list | `WaitingList.tsx` | "Waiting list", "Add applicant", "Applicant", "Contact details", "Joined date", "Preferred section", "Position", "View request", "Withdraw request", "Reason", "Show history", "No one is waiting.", "Next eligible applicant", "Already has an open request" |
| Offer | `Offer.tsx` | "Choose a free plot", "Offer to", "Joined", "Reply by", "Why skip this applicant?", "Review offer", "Record offer", "Accept offer", "Decline offer", "Release overdue offer" |
| Tenancy and handover | `Tenancy.tsx`, `Handover.tsx` | "Plot holder", "Tenancy begins", "Tenancy ends", "Previous holder", "New holder", "Outstanding balance", "End tenancy", "Hand over plot", "Review handover", "Confirm handover" |
| Season setup | `Season.tsx` | "New season", "Season name", "Start date", "End date", "Due date", "Standard fee", "Select tenancies", "Preview charges", "Apply charges", "Waive fee", "Reason" |
| Fees and receipt | `Payments.tsx` | "Season fees", "Due", "Part paid", "Paid", "Overdue", "Amount charged", "Amount received", "Still due", "Payment date", "Receipt reference", "Record payment", "Reverse payment", "Show previous seasons" |
| Season report | `SeasonReport.tsx` | "Season report", "Season", "As at", "Plot handovers", "Waiting list order", "Fees charged", "Fees received", "Balance due", "Print private report", "Download private CSV" |
| Availability map | `SeekerSheet.tsx` | "Availability map", "Choose free plots", "Visitor instructions", "Preview as a visitor", "Download availability copy", "Print availability map" |
| Availability file | `availabilityHtml.ts` | "Available plots", "Choose section", "Show location", "Ask the secretary about this plot", "As at {date}" |

Every screen uses `useIntent` so a repeat press returns the same result, with one operation ID per intent held in a ref and cleared on success. A confirmation step ("Review offer", "Review handover", "Preview charges") shows what will change before the record button.

## G14 The look

`theme.css` is loaded by `main.tsx` only and styles the classes that already exist. It adds no element to the shared screens.

- Header: `header.app` is a grid. Row 1 is a 72 px daylight band (`#CFE7DF`) with no text. A sun disc and the margin art sit in that band (`assets/garden-margin.svg` as the `.mist` background, along its lower edge). The brand and the navigation sit in rows 2 and 3 on the paper colour.
- Motion: the art drifts slowly in one keyframe animation (`bed-drift`). The shared rules already stop it for reduced motion and high contrast.
- Sheet: `.sheet` is pale soil (`#EFE6CC`). Beds draw as footprints with a hatched north strip and a peg. `.sheet .path` is a wide grass strip with a dotted line. The gate, north arrow, selected double outline and paper tab come from the shared sheet.
- Cards are seed packets: a 6 px leaf green top edge, rounded corners. Buttons keep 44 px targets. Headings use a humanist sans stack, not the churchyard serif.
- Desk: two big cards side by side from 48 rem (the next free plot with its bed mark, the next applicant with the joined date and the reason), then the main action, then the plan sheet and key beside the waiting list. On a phone: one column, the job and the main action first.

## G15 Test plan

Unit tests follow `tasks.md`. Expected values come from `tests/fixtures/expected/hand-totals.md` sections 2 and 5, read by hand into `tests/helpers/thimbleBeds.ts`. The oracle test `tests/oracle/allotment.test.ts` drives the real commands with 1,000 generated cases each for queue order, fee steps and tenure at a date, and compares with `scripts/oracle.py`. Property sets (1,000 cases, recorded seeds) are in `tests/properties/allotment.test.ts`. Browser spec `tests/browser/secretary-season.spec.ts` runs the real app on `127.0.0.1:4178` at 360 by 640 and 1920 by 1080. `playwright.config.ts` starts the build beside the others and stops it. Every browser test logs every request and expects none outside the app origin. The downloaded availability file is opened in a fresh page context with the network blocked, and is scanned for every canary in `tests/helpers/gardenCanaries.ts`.

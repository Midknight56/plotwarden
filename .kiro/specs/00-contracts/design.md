# 00 Contracts: design

This design fixes the shapes, invariants and error text that later specs implement. Type names are TypeScript and Zod schema names to be created in spec 01. Field lists marked **closed** are exhaustive: a parser rejects any other key at that level and below.

## D1 Layers

```
apps/churchyard-register  apps/allotment-register   (.local/market in the scratch recipe)
            \                   /
             template/src/ui           React shell, receives adapter
             template/src/data         IndexedDB, Blob, CSV, backup
             template/src/output       visitor and private report builders
             template/src/exchange     plot.review.v1, plot.slip.v1
             template/src/{core}, map  pure: no React, no IndexedDB
                     |
             browser primitives
```

Allowed imports, checked by `scripts/check-imports.mjs`:

| From | May import |
|---|---|
| `template/src/*.ts`, `template/src/map/*` | each other, Zod |
| `template/src/data/*` | core, map, Zod, Papa Parse, fflate, browser IndexedDB and Blob |
| `template/src/output/*`, `template/src/exchange/*` | core public types, map geometry types, Zod. Never a private record type |
| `template/src/ui/*` | everything in `template/`, React |
| `apps/<app>/src/*` | `template/`, its own folder |
| `site/src/*` | its own folder. Links to app entry points only |

The Desk repository vendors `template/src/exchange/{schema,packet,compare,slip}.ts` and any listed pure type or limit files with hashes in `vendor/exchange/provenance.json`.

## D2 Invariants

Each invariant has a name used in tests and error logs.

| Name | Statement |
|---|---|
| `INV_ID_STABLE` | Plot, space, person and record IDs never change after creation. |
| `INV_ONE_KIND` | A site has one kind for its whole life. |
| `INV_CODE_UNIQUE` | Within a site, the normalized forms of all current codes and prior codes are pairwise distinct. |
| `INV_ONE_BURIAL_PER_SPACE` | At any effective date, a space holds at most one burial. |
| `INV_ONE_ACTIVE_RESERVATION` | At any effective date, a space has at most one active reservation. |
| `INV_ONE_OPEN_OFFER` | At most one open offer per space and per application. |
| `INV_ONE_TENURE` | At any date, a plot has at most one tenancy whose `[start, endExclusive)` contains it. |
| `INV_ONE_REQUEST` | At most one active application per person per site. |
| `INV_SEQ_FIXED` | An application's `sequence` never changes. |
| `INV_QUEUE_ORDER` | Eligible order is the total order `(joinedOn, sequence, applicationId)`. |
| `INV_NO_INFERRED_VACANCY` | A space is Free only after positive evidence: a confirm action, a release, a decline, a return to use or a tenancy end. |
| `INV_PARTIAL_DATE` | A stored date keeps its precision. No default month or day is ever filled. |
| `INV_SOURCE_KEY` | `(siteId, sheet, sourceRef)` maps to at most one live record. |
| `INV_APPEND_ONLY` | Stored event bytes never change. Corrections are new events with `corrects`. |
| `INV_REPLAY` | `fold(apply, events) == storedState` for every committed revision. |
| `INV_OP_ONCE` | An operation ID commits at most once. |
| `INV_REVISION` | Each committed batch raises the site revision by exactly one. |
| `INV_BALANCE` | For every charge, `0 <= charge - sum(applied receipts) <= charge`. |
| `INV_CURRENCY_FIXED` | A garden's currency never changes once a charge exists. |
| `INV_PUBLIC_CLOSED` | Visitor and review objects contain only the closed field lists in D9 and D10. |
| `INV_NO_LIVING_PUBLIC` | No living person's name, contact or role appears in any visitor object or file byte. |
| `INV_NO_PERSON_REVIEW` | No person name, contact, amount, note, inscription, image, page ref or private title appears in a review object. |
| `INV_SLIP_READ_ONLY` | Reading a slip never changes occupancy, debt, inscription, placement or any canonical field. |
| `INV_TEMPLATE_NEUTRAL` | No template file branches on app kind or imports an app. |

## D3 Template and adapter contract

```ts
interface RegisterAdapter<S, C extends { type: string }, E extends { type: string }> {
  kind: string;                         // "churchyard" | "allotment" | "market", opaque to the template
  version: number;                      // adapter payload version
  spacesPerPlot: { min: number; max: number }; // churchyard 1..12, allotment and market 1..1
  fields: FieldDef[];                   // record fields with labels, limits and parsers
  sheets: SheetDef[];                   // supported import sheets and their required headings
  commands: readonly C["type"][];       // allowed command names
  validate(command: C, state: S): FieldError[];
  decide(state: S, command: C, effectiveOn: LocalDate): Result<E[], DomainError>;
  apply(state: S, event: E): S;
  project(snapshot: S, audience: "private" | "visitor" | "committee", asOf: LocalDate): unknown; // checked by the audience schema
  reports: ReportBuilder<S>[];
  reviewFacts(snapshot: S, asOf: LocalDate): ReviewFact[];
  labels: CopyCatalog;
  theme: ThemeTokens;
}
```

- `defineRegister(adapter)` returns a shell with library, map, import, history, backup, restore, settings, help and exchange routes. It never inspects `kind` except to scope storage.
- `planMap(request, site)` returns `{ added, moved, retained, skipped, collisions }`. Applying keeps every linked plot ID.
- `stageImport(kind, columns, rows, source)` returns an ordered preview with counts `ready, unchanged, unplaced, errors, conflicts, leftOut` and writes nothing.
- `commit(siteId, expectedRevision, opId, batch)` is defined in D6.
- The conformance suite in `tests/conformance/adapter.test.ts` runs unchanged against every adapter: import, replay, kind isolation, closed projections, restore.

## D4 Records

Field lists follow the plan's stored records table. Additions settled here:

| Record | Settled detail |
|---|---|
| Plot | `spaces: Space[]` length 1..12 (churchyard) or exactly 1. `checked` is per space. Plot "Needs checking" is derived. |
| Space | `spaceId, label, checked, retired`. Label default "1", "2" and so on. |
| Burial | `nameUnknown: boolean`. If true, `recordedName` is absent. `dateValue: PartialDate`, `dateText: string`. `spaceId?` absent means unplaced. |
| Reservation | One holder `personId`. Other living people are private contacts on the person record and are never public. |
| Tenancy | One `personId` per tenancy. Joint tenants are not modelled. |
| Application | `sequence` is an integer from a per site counter, assigned when the application is first committed. |
| Review subject | `subjectKey` random UUID minted the first time a subject raises any rule. `issueKey` random UUID minted the first time `(subjectKey, rule)` opens, reused if it reopens. `factVersion` integer starting at 1. |
| Exchange identity | `siteKey` random UUID per site copy, separate from `siteId`. Rotated on "Restore as new register", on a restore that goes backwards, and on a lineage fork. |

`PartialDate` wire form: `{"p":"unknown"}`, `{"p":"year","y":1874}`, `{"p":"month","y":1874,"m":3}`, `{"p":"day","y":1874,"m":3,"d":3}`. Years 1000..9999.

## D5 Dates and periods

- `LocalDate` is `YYYY-MM-DD` in the site zone. Write times are ISO 8601 with offset, stored in UTC.
- A partial date covers the interval `[first day, last day]`. For a report period `[from, through]`: inside if covered interval is within the period, outside if disjoint, else "Date incomplete".
- Sort key: `(firstDay, precisionRank, seq)` with `day=0, month=1, year=2`, unknown after all known dates.
- Tenancies and offers use half open `[start, endExclusive)`. A handover on D sets the old `endExclusive = D` and the new `start = D`.
- Fee status at date `t` for a charge due `dueOn`: balance 0 is "Paid". Otherwise `t <= dueOn` is "Due" (or "Part paid" if any receipt applied), `t > dueOn` is "Overdue".
- Review rules use strict `asOf > replyBy` and `asOf > dueOn`.

## D6 Event identity, commit and stale state

```ts
interface StoredEvent {
  eventId: string;        // UUID, unique across the database
  siteId: string;
  seq: number;            // 1, 2, 3 ... contiguous per site, equals position in replay
  opId: string;           // UUID minted once per user intent, before the first attempt
  entityIds: string[];
  type: string;           // adapter event type
  recordedAt: string;     // UTC write time with offset
  effectiveOn?: LocalDate;
  payloadVersion: number;
  sourceRef?: string;
  corrects?: string;      // eventId of the corrected event
  payload: unknown;
}
```

**Event identity.** An event is identified by `eventId`. Its order is `(siteId, seq)`. Its intent is `opId`. All events of one batch share one `opId` and take consecutive `seq` values.

**Operation record.** The `operations` store keys `(siteId, opId)` to `{ batchHash, revision, eventIds }`. `batchHash` is SHA 256 over canonical JSON (sorted keys, no whitespace) of the command batch without generated IDs or write times.

**Commit transaction** `commit(siteId, expectedRevision, opId, batch)`, one IndexedDB `readwrite` transaction over `sites, events, indexes, uniqueKeys, blobs, operations`:

1. Read `operations[(siteId, opId)]`. If present with equal `batchHash`, return its stored result. If present with a different hash, abort with `op_conflict`.
2. Read the site. If `revision != expectedRevision`, abort with `stale_revision`.
3. Reserve unique keys (codes, prior codes, source keys). On a clash abort with `key_taken` naming the key.
4. Write events, indexes and changed blobs. Write the operation record.
5. Set `revision = expectedRevision + 1`.
6. Resolve only on the transaction `complete` event. Then broadcast the new revision to other tabs.

Any abort leaves every store unchanged.

**Error text on stale state.**

| Code | Text shown | Actions |
|---|---|---|
| `stale_revision` | "This register changed in another tab." | "Keep my draft", "Open latest". After reopening, recheck the target plot and any fee before the keeper confirms again |
| `op_conflict` | "This change was already saved with different details. Open latest to check it." | "Open latest" |
| `key_taken` | "Code {code} is already in {section}." or "This plot is already taken." | "Keep editing" |
| storage abort | "Changes are still in this tab. Download a recovery file." | "Try again", "Download recovery file" |
| quota | "This browser could not save the register." | "Download backup", "Continue in this tab" |
| stale preview (visitor or review) | "Review public details again." | Rebuild preview from the latest revision before Print or Download are enabled |
| stale slip row | "Source has changed" | "Open matching record" |

## D7 Protected fields

| Field | Protected from | Allowed route |
|---|---|---|
| Any ID, `site.kind`, `site.lineageId` | creation | None |
| Stored event bytes | commit | Correction event |
| `site.currency` | first charge | None |
| `application.sequence`, `application.joinedOn` | creation | `joinedOn` by correction event with reason. Sequence never |
| Burial `spaceId`, `dateValue`, name | commit | "Move burial" or "Void incorrect record" correction with source ref and reason |
| Prior plot codes | rename | None. They stay reserved |
| Space with any history | first event | None. Only an empty space with no history can be retired |
| Ledger entry amount | commit | Reversal of the exact amount, then a new entry |
| Charge with applied receipts | first receipt | Reverse receipts first |
| Public approval after a material name or identity change | the change | Keeper review in the family editor |

## D8 Status computation

For each checked, non retired space at date `t`: Taken if a burial or tenancy covers it, else Reserved if an active reservation or open offer covers it, else Unusable if marked, else Free. An unchecked space has no physical state and makes the plot "Needs checking". Plot primary mark is the first present of Taken, Reserved, Free, Unusable over its checked spaces.

## D9 Visitor projections (closed)

`plot.family.v1`:

```
{ format: "plot.family.v1", asOf: LocalDate, siteTitle, north: number,
  gate: { name, x, y },
  paths: [{ name, points: [[x,y]...] }],
  sections: [{ id, label, outline?: [[x,y]...] }],
  plots: [{ id, code, sectionId, outline?: [[x,y]...] }],
  burials: [{ id, name, year?: number, plotId, directions?, line? }],
  outlines?: [[[x,y]...]...] }     // only when the keeper ticked "Show other plots as plain outlines"
```

`plot.availability.v1`:

```
{ format: "plot.availability.v1", asOf: LocalDate, siteTitle, north: number,
  gate: { name, x, y },
  paths: [{ name, points }],
  sections: [{ id, label, outline? }],
  freePlots: [{ id, code, sectionId, outline? }],
  neutralGround: [{ outline }],
  instructions: string }
```

- Every `id` is a random public ID minted for that file. Two files from the same site share no IDs.
- `directions` is the one way in for the whole site. `line` is one optional line for one approved burial. A burial carries no other burial's line. `outlines` is a list of bare footprints with no code, state, ID or count.
- Every string comes from a keeper approved public field. `name` is the approved deceased display name. `year` appears only if approved for that burial.
- No other key exists. There is no person field in `plot.availability.v1`.
- Text is escaped. Embedded JSON escapes `<`, `>`, `&`, U+2028 and U+2029. The HTML carries a Content Security Policy that allows only its inline sealed script and style, no network, no forms.

## D10 Review packet `plot.review.v1` (closed)

```
{ format: "plot.review.v1",
  siteKind: string,
  siteKey: UUID, lineageId: UUID,
  siteAlias: string,                    // approved or "Site {n}", 1..40 chars
  revision: integer >= 1,
  asOf: LocalDate,
  issues: [{
    issueKey: UUID, subjectKey: UUID,
    label: string,                      // approved short neutral label or "Record {n}", 1..40 chars
    rule: "placement_missing" | "reading_unclear" | "offer_late" | "fee_late",
    factVersion: integer >= 1,
    action: "check_location" | "read_stone_again" | "check_reply" | "check_payment"
  }] }
```

- Rule to action is fixed: `placement_missing` to `check_location`, `reading_unclear` to `read_stone_again`, `offer_late` to `check_reply`, `fee_late` to `check_payment`.
- At most 2 MiB and 2,000 issues. Issue keys unique.
- Labels and aliases pass the private name and contact check before export.

## D11 Return slip `plot.slip.v1` (closed)

```
{ format: "plot.slip.v1",
  siteKey: UUID, lineageId: UUID,
  packetRevision: integer >= 1, packetAsOf: LocalDate,
  decisions: [{
    actionId: UUID, issueKey: UUID, factVersion: integer >= 1,
    disposition: "checked" | "needs_keeper",
    reviewedOn: LocalDate }] }
```

Reading a slip in the register, per decision:

| Condition, checked in this order | Row text |
|---|---|
| `actionId` already received | "Already received" |
| No issue with this `issueKey` is open | "Issue already closed" |
| Open issue has a different `factVersion` (lower or higher) | "Source has changed" |
| Otherwise (equal `factVersion`) | "Ready to check" |

A slip whose `siteKey` or `lineageId` differs from the open site is refused whole with "This slip belongs to another register." "Record receipt" appends one `review_received` event per new `actionId`. Nothing else changes.

Desk comparison of a current packet `C` and incoming `I` with the same `(siteKey, lineageId)`:

| Condition | Result |
|---|---|
| Same bytes after canonical JSON | same copy, no change |
| `I.revision < C.revision` or `I.asOf < C.asOf` | stale, read only "View older copy" |
| Same `(revision, asOf)`, different content | conflict, keep current |
| Otherwise | replace. Per issue: new, still open, changed (higher fact version), no longer flagged |

## D12 Limits

| Item | Last legal value |
|---|---|
| Plots per site | 2,000 |
| Sections per site | 100 |
| Spaces per churchyard plot | 12 |
| Domain records per site, archived included | 20,000 |
| Events per site | 100,000 |
| Grid rows, columns | 100 each, and rows times columns within remaining plot capacity |
| Vertices per polygon or path | 256 |
| Coordinates | integers 0 to 10,000, origin south west |
| CSV or paste | 5 MiB, 5,000 data rows, 40 columns, 4,000 characters per cell |
| Names and labels | 100 characters |
| Plot code | 24 characters |
| Source ref | 100 characters |
| Notes and inscriptions | 4,000 characters |
| Money per entry | 99,999,999 minor units |
| Photo | JPEG, PNG or WebP, 12 MiB, 24 megapixels, 8 per record, stored longest edge 2,400 px |
| Archive | one site, 128 MiB compressed, 160 MiB decoded, 5,000 attachment entries, 96 MiB photos per site |
| Review packet, slip | 2 MiB, 2,000 issues or decisions |
| Site alias, review label | 40 characters |

Constants live in `template/src/limits.ts` and tests import them from there.

## D13 Kiro setup

- Steering in `.kiro/steering/`. Profiles `register-builder` and `register-reviewer` load `file://.kiro/steering/**/*.md`.
- Hooks `check-save.json` (PostFileSave on `\.(ts|tsx)$`) and `check-stop.json` (Stop) run local scripts only.
- `.kiro/settings/mcp.json` registers `plot-inspector` (`node dist/inspector/server.mjs`) with `disabled: true` until spec 06 builds it.

# 05 Exchange: design

This design says how spec 05 builds X1 to X11. Names in `code` are files or exports. Where it adds detail to a contract, it says so.

## E1 Files and what each owns

Every production file has a test listed in `tasks.md`.

| File | Owns | Layer |
|---|---|---|
| `template/src/exchange/schema.ts` | Formats, rules, actions, `ReviewPacket`, `ReturnSlip`, closed Zod schemas, `parsePacket`, `parseSlip`, `readExchangeFile(bytes)`, `canonical` | exchange |
| `template/src/exchange/packet.ts` | `buildPacket`, `encodePacket`, `checkLabelText`, `previewPacket`, `reviewFileName` | exchange |
| `template/src/exchange/compare.ts` | `comparePackets`, `sourceKey`, `itemKey` | exchange |
| `template/src/exchange/slip.ts` | `buildSlip`, `encodeSlip`, `readSlip`, `slipFileName` | exchange |
| `template/src/review.ts` | Ledger state, `prepare_review` and `receive_review`, `planReviewKeys`, `openIssuesNow`, `fingerprint` | core, pure |
| `template/src/base.ts` | Routes the two review commands and events beside the core, layout and note ones | core, pure |
| `template/src/adapter.ts` | `ReviewSource`, `ReviewSupport`, the optional `review` member of the adapter | core, pure |
| `template/src/ui/exchangeFlow.ts` | `planExchange`, `readSlipFor`, `checksAt`: the steps between the screen and the pure rules. No React | ui |
| `template/src/ui/Exchange.tsx` | The Exchange screen | ui |
| `template/src/ui/copyExchange.ts` | The words of the screen | ui |
| `apps/churchyard-register/src/review.ts`, `apps/allotment-register/src/review.ts` | `churchReviewSupport`, `allotReviewSupport`: sources with fingerprints, private strings, record routes | app, pure |
| `scripts/export-exchange.mjs` | The pinned copy, `provenance.json`, `vectors.json` | script |
| `tests/fixtures/exchange-vectors.json` | Hand written shared vectors | fixture |

`check-imports` already limits `exchange/` to `calendar`, `limits`, `output/`, `exchange/`, `map/` and `zod`. The new exchange files import only `../calendar`, `../limits` and each other. `review.ts` is a core file, so it imports no exchange, data, ui or output file. It names rules as plain strings and never reads an app kind.

## E2 The pinned copy layout

The vendored folder mirrors `template/src` so every relative import stays valid and every file stays byte for byte equal:

```
<dest>/exchange/{schema,packet,compare,slip}.ts
<dest>/{calendar,limits,types}.ts          imports of the above, found by following imports
<dest>/provenance.json
<dest>/vectors.json
```

`types.ts` is in the list because `calendar.ts` and `limits.ts` import it. The script follows imports from the four exchange files and fails if the set it finds is not exactly the list it was told to copy. The Desk imports `vendor/exchange/exchange/schema` and so on. The Desk needs `zod` at the exact version in `provenance.json`.

## E3 Schema (`exchange/schema.ts`)

```ts
type Rule = "placement_missing" | "reading_unclear" | "offer_late" | "fee_late";
type Action = "check_location" | "read_stone_again" | "check_reply" | "check_payment";
ACTION_FOR_RULE: placement_missing to check_location, reading_unclear to read_stone_again,
                 offer_late to check_reply, fee_late to check_payment
```

`ReviewPacket` and `ReturnSlip` are exactly the shapes of D10 and D11 of spec 00. Schemas use `z.strictObject` at every object. After the shape passes, `parsePacket` checks the rules a shape cannot: unique `issueKey`, one issue per `(subjectKey, rule)`, and the action of the rule. The UUID check is a plain pattern (any version), because Zod's `uuid` checks version bits that fixtures do not need. `siteKind` is 1 to 32 characters of `a-z`, `0-9` and `_`, starting with a letter.

`parsePacket(value)` and `parseSlip(value)` return `{ ok: true, value }` or `{ ok: false, issues }` where each issue is `{ path, code, keys? }` as in `output/privacy.ts`. The extra codes are `duplicate_issue_key`, `duplicate_subject_rule`, `wrong_action`, `duplicate_action_id`.

`readExchangeFile(bytes)` decides what a file is, from its bytes:

| Input | Result |
|---|---|
| More than 2 MiB | `{ ok: false, code: "too_big" }` |
| Starts with `PK` | `{ ok: false, code: "wrong_file", found: "backup" }` |
| Not UTF 8 JSON | `{ ok: false, code: "not_json" }` |
| `format` is `plot.family.v1` or `plot.availability.v1` | `wrong_file`, `found: "visitor"` |
| `format` is `plot.layout.v1` or `plot.draft.v1` | `wrong_file`, `found: "other"` |
| `format` is `plot.review.v1` | parse as a packet, `{ ok: true, form: "review", packet }` |
| `format` is `plot.slip.v1` | parse as a slip, `{ ok: true, form: "slip", slip }` |
| `format` is `plot.review.v` or `plot.slip.v` followed by a number above 1 | `newer_version` |
| anything else | `unknown_format` |

A parse failure inside a known format gives `{ ok: false, code: "invalid", issues }`.

`canonical(value)` writes JSON with sorted keys and no spaces. It is the one place the exchange module writes JSON text. `canonicalPacket(packet)` is the same with the issues put in issue key order, so a packet whose sender listed its issues in another order is still the same copy. `readExchangeFile` names its result `form`, not `kind`, because `check-imports` reads `kind === "..."` in template code as a comparison with an app kind.

## E4 Packet (`exchange/packet.ts`)

`buildPacket(input)` takes `{ siteKind, siteKey, lineageId, siteAlias, revision, asOf, issues: { issueKey, subjectKey, label, rule, factVersion }[] }`. It derives `action` from the rule, orders issues by `issueKey`, writes each object key by key, then runs `parsePacket` on the result. It returns `{ ok: true, packet }` or `{ ok: false, fields }` with the first problem of each field.

`encodePacket(packet)` returns `{ ok: true, text, bytes }` or `too_big`. It is `canonical(packet)` and its UTF 8 length is checked against 2 MiB.

`checkLabelText(text, known)` returns `undefined` or one code, in this order: `required`, `over_limit` (more than 40 code points), `private_string` (a known string, case and accents folded, is inside the text), `looks_like_amount` (`/[£$€]|\b(GBP|EUR|USD|CAD)\b|\d+[.,]\d{2}\b/i`), `looks_like_contact` (`@` or seven digits in a row, spaces and dashes ignored). The same check serves the site name and each label.

`previewPacket(packet)` returns `{ siteFields, issueFields, count, rows, bytes }` for the screen. `siteFields` and `issueFields` are the exact key names of the packet, so the screen shows the real list.

## E5 Slip (`exchange/slip.ts`) and comparison (`exchange/compare.ts`)

`buildSlip(input)` writes and parses a slip as `buildPacket` does for a packet. `readSlip(slip, context)` with `context = { siteKey, lineageId, open: { issueKey, factVersion }[], received: readonly string[] }` returns `{ ok: false, code: "other_register" }` or `{ ok: true, rows, counts }`. A row is `{ actionId, issueKey, factVersion, disposition, reviewedOn, status }` with `status` one of `received`, `closed`, `changed`, `ready`, tested in that order (D11). A slip factVersion that is not equal to the open one reads as changed, whether lower or higher. Only an equal version reads as ready.

`comparePackets(current, incoming)` returns one of:

| Result | When |
|---|---|
| `{ relation: "different_source" }` | `siteKey` or `lineageId` differ |
| `{ relation: "same" }` | `canonical` bytes are equal |
| `{ relation: "stale" }` | `incoming.revision < current.revision` or `incoming.asOf < current.asOf` |
| `{ relation: "conflict" }` | same revision and as of date, different content |
| `{ relation: "replace", changes }` | otherwise. `changes` holds `new`, `stillOpen`, `changed`, `noLongerFlagged`, each a list of `issueKey`, split by `issueKey` and compared by `factVersion` |

`sourceKey(packet)` is `siteKey` and `lineageId` joined. `itemKey(packet, issue)` is `sourceKey` and `issueKey` joined. A restored copy keeps its issue keys but has a new `siteKey`, so two sites can share an `issueKey` and still have two item keys. This is the case T24 names.

## E6 The ledger (`review.ts`)

```ts
interface ReviewIssueRecord { issueKey: Uuid; factVersion: number; fingerprint: string }
interface ReviewSubject { subjectKey: Uuid; label: string; issues: Record<string, ReviewIssueRecord> }  // by rule
interface ReviewReceipt { issueKey: Uuid; factVersion: number; disposition: "checked" | "needs_keeper"; reviewedOn: LocalDate }
interface ReviewState { alias?: string; subjects: Record<Uuid, ReviewSubject>; received: Record<Uuid, ReviewReceipt> }  // by subject ID, by action ID
```

Base state gains `review: ReviewState`. `BASE_COMMAND_TYPES` keeps its 16 names. `REVIEW_COMMAND_TYPES` is `["prepare_review", "receive_review"]`. `isBaseCommand` accepts both lists. Both app adapters list the review commands in `commands`.

| Command | Event | Rules |
|---|---|---|
| `prepare_review { alias?, subjects[] }` | `review_prepared` | Needs a site name or a subject. Each key is a UUID. Each `factVersion` is a whole number from 1. A key already used by another subject or rule is `duplicate_id`. Labels and the name keep the 40 character limit. |
| `receive_review { decisions[] }` | one `review_received` per decision whose `actionId` is new | Refuses `already_received` when none is new. Refuses `no_such_issue` for an `issueKey` the ledger does not hold. Refuses a repeated `actionId` in one command. |

`applyReview` merges a `review_prepared` patch by subject ID and sets the name. It stores each receipt under its `actionId`. Nothing else in the base state is read or written.

`planReviewKeys(review, sources, { mint, labels?, alias? })` is pure and returns `{ issues, subjects, alias?, changed }`:

1. For each source in order, find the stored subject. A new subject gets `mint()` and the label `labels[subjectId]` if given, else `Record {n}` with n the number of stored subjects plus new ones so far plus one. A stored subject keeps its key and label unless `labels[subjectId]` differs.
2. Find the stored issue for the rule. A new one gets `mint()` and version 1. A stored one with the same fingerprint keeps its version. A stored one with another fingerprint gets version plus one and the new fingerprint.
3. A subject goes into the patch if it is new, its label changed, or any of its issues is new or changed. The name goes into the patch if it differs from the stored name, or from "Site 1" when none is stored.
4. `issues` lists the planned checks in source order with their keys, label and version. `changed` is true when the patch is not empty.

`openIssuesNow(review, sources)` returns `{ issueKey, factVersion }` for each source that has a stored issue, using the version the next plan would give (stored plus one when the fingerprint differs). It mints nothing. A source with no stored issue has no key anywhere, so no slip can name it.

`fingerprint(parts)` is a 53 bit string hash (cyrb53) of the parts joined with a unit separator, written as 14 hex digits. It is stored privately and never exported. A collision would only fail to raise a version.

## E7 App support (`apps/*/src/review.ts`)

`adapter.review?: ReviewSupport<S>` holds `sources(state, asOf)`, `privateStrings(state)` and `link(state, { rule, subjectId })`. `reviewFacts` is unchanged. `sources` is `reviewFacts` plus a fingerprint for each fact, so the two never disagree.

| App | Rule | Fingerprint parts | Route under the register |
|---|---|---|---|
| Churchyard | `placement_missing` | source ref, recorded name, unknown flag, date JSON | `unplaced` while unplaced, else `burial/{burialId}` |
| Churchyard | `reading_unclear` | reading, page ref | `burial/{burialId}` of the memorial |
| Allotment | `offer_late` | reply date, plot ID, application ID | `offer` |
| Allotment | `fee_late` | charge amount, balance, due date | `payments` |

`privateStrings` is every person display name and contact, every burial recorded name and source ref, every receipt ref and source ref. Words shorter than 3 characters are left out so "Y" does not flag everything. The screen adds the private site title.

## E8 The screen (`ui/Exchange.tsx`, `ui/exchangeFlow.ts`)

Route `#/r/{site}/exchange`, added to the shared register routes. Both app homes link to it with "Committee review".

`planExchange({ open, adapter, asOf, alias, labels, mint })` runs in this order and returns `{ ok: true, plan }` or `{ ok: false, fields }`:

1. Check the date, the name and every label with `checkLabelText` against `privateStrings` and the site title.
2. Take the sources at `asOf` (or the facts with an empty fingerprint when the adapter has no `review` support).
3. `planReviewKeys`. The packet revision is `open.revision` plus 1 when `changed`, else `open.revision`.
4. If that revision is 0, return `empty_register`. Otherwise `buildPacket`.

The plan holds the exact packet, the `prepare_review` command (or none), the revision it was made against and one operation ID minted for the intent.

States: idle, preview (plan shown), working ("Saving changes…" during the commit, repeat presses ignored), done ("Your copy is ready." and "Saved on this device." only after the commit completed, or without the second sentence when nothing needed committing), error (commit message, inputs kept).

"Open return slip" is a file input labelled with those words. `readSlipFor({ bytes, open, adapter, today })` reads the file, then `readSlip` with the received list and the open checks as at the later of `today` and the slip's `packetAsOf`, because a keeper may choose a review date after today. The screen shows "Review returned checks" with a row for each decision: the label, the reason, the status word, the decision ("Checked" or "Needs keeper") and the review date, with "Open matching record" when the ledger knows the check. "Record receipt" is a button below the list, shown only when a row is ready. After it, the same slip is read again from the new state.

Focus: after Preview, focus moves to the preview heading. After an invalid Preview, focus moves to the first invalid field. After a slip opens, focus moves to the "Review returned checks" heading. Browser Back keeps the route; the typed values are local to the screen.

Layout: one column on the phone. Buttons follow their form in normal flow. Rows are cards. Nothing is sticky.

## E9 The export script

`scripts/export-exchange.mjs <dest>` (or `--to <dest>`, `--root <repo>` for tests):

1. Resolve the repository root. Follow imports from the four exchange files with `scripts/lib/imports.mjs`. Every import must resolve inside `template/src` and into the list `{calendar, limits, types, exchange/*}`, plus `zod`. Anything else: exit 1 and name the file.
2. Check every listed file has no carriage return and no byte order mark.
3. Refuse a non empty `dest` that has no `provenance.json` written by this script.
4. Write the files with their source bytes, then `vectors.json` from `tests/fixtures/exchange-vectors.json`, then `provenance.json`.
5. `provenance.json`: `{ format: "plot.exchange.vendor.v1", sourceRepo, gitRevision, uncommittedFiles, licence, requires: { zod }, files: [{ path, sourcePath, bytes, sha256 }] }`. `vectors.json` is in `files`. `sourceRepo` is the `origin` remote with any credential removed, or the package name when there is no remote. No clock value.
6. Print each file with its hash, then "export-exchange: ok".

## E10 Vectors

`tests/fixtures/exchange-vectors.json`, written by hand from D10, D11 and X3 to X7, holds `packets` (value and expected result), `slips`, `compare` and `reading`. Each case has a name and the expected code. `tests/unit/exchange.test.ts` runs them against `template/src/exchange`. `tests/unit/exportExchange.test.ts` runs them against the copy in a temporary folder. The Desk repository runs them against its own copy.

## E11 Test files

| File | Covers |
|---|---|
| `tests/unit/exchange.test.ts` | T24: schema, packet, compare, slip, vectors, limits, no private words |
| `tests/unit/reviewLedger.test.ts` | T24: keys, versions, reuse, label, name, replay, receipts, read only slip |
| `tests/unit/exchangeApps.test.ts` | T24: Lantern Fold and Thimble Beds through sources, plan and packet |
| `tests/unit/exchangeFlow.test.ts` | T24: `planExchange`, `readSlipFor`, `checksAt` |
| `tests/unit/exchangeCopy.test.ts` | X8 |
| `tests/unit/exportExchange.test.ts` | X9 |
| `tests/helpers/exchangeVectors.ts` | One runner for the vectors |
| `tests/browser/desk-return.spec.ts` | X4, X5, X6, X10 in a browser, both apps, both sizes |

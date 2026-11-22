# Exchange format

Two small files pass between a register and the Review Desk. A register writes a **review file** with the checks that need a committee. The Desk reads it and, after the meeting, writes a **return slip** for the keeper. Both have a closed shape: a key that the schema does not list, at any depth, makes the file refused. The code is `template/src/exchange/`. The Desk repository holds a pinned copy, made by `scripts/export-exchange.mjs`, with the shared test vectors.

## Review file: `plot.review.v1`

File name: `committee-review-<date>.json`. At most 2 MiB and 2,000 checks.

| Key | Meaning |
|---|---|
| `format` | `plot.review.v1` |
| `siteKind` | The kind of register, for example `churchyard` or `allotment` |
| `siteKey` | A random key for this register, made for exchange. It is not the register's own ID |
| `lineageId` | The key that a restored copy keeps |
| `siteAlias` | A short name for the committee, up to 40 characters. It defaults to "Site 1" |
| `revision` | The register revision the file was made at |
| `asOf` | The date the checks are worked out for |
| `issues` | The list of checks |

Each check has exactly these keys:

| Key | Meaning |
|---|---|
| `issueKey` | A random key for this check |
| `subjectKey` | A random key for the record it is about |
| `label` | A short label, up to 40 characters. It defaults to "Record 1", "Record 2" and so on |
| `rule` | One of `placement_missing`, `reading_unclear`, `offer_late`, `fee_late` |
| `factVersion` | A whole number that goes up by one when a fact behind the check changes |
| `action` | The one action that goes with the rule: `check_location`, `read_stone_again`, `check_reply`, `check_payment` |

A register raises a check when: a burial has no space (`placement_missing`), a memorial reading is marked "Unclear letters" (`reading_unclear`), an offer is open and its reply date has passed (`offer_late`), or a charge has a balance and its due date has passed (`fee_late`). An offer or a charge with no date raises nothing. There is at most one check for each record and rule.

A review file holds no person name, contact, amount, note, inscription, image, page reference or private site title. The site alias and each label are checked before they are accepted: a whole private string, and any word of three letters or more that is part of a person's name or the private site title, is refused. The register previews the exact outgoing fields and their count before the keeper downloads the file.

## Return slip: `plot.slip.v1`

File name: `committee-return-<date>.json`. At most 2,000 decisions.

| Key | Meaning |
|---|---|
| `format` | `plot.slip.v1` |
| `siteKey`, `lineageId` | The register the slip is for |
| `packetRevision`, `packetAsOf` | The review file the decisions were made on |
| `decisions` | The list of decisions |

Each decision has `actionId` (a key, so the same decision is received once), `issueKey`, `factVersion`, `disposition` (`checked` or `needs_keeper`) and `reviewedOn` (a date). A slip holds no text.

## How a register reads a slip

- A slip for another `siteKey` or `lineageId` is refused whole, and nothing changes.
- Each decision is looked up by the whole of `(siteKey, lineageId, issueKey, factVersion)`, never by a date.
- A decision whose fact version is not the current one shows "Source has changed". One whose check is no longer open shows "Issue already closed". One whose action ID was received before shows "Already received". Only a decision at the current fact version shows "Ready to check". A fact version above the current one is never ready.
- "Record receipt" writes receipt events only. It never changes occupancy, debt, an inscription or any other record. A keeper corrects a record with the normal form.
- Opening the same slip twice records nothing the second time.

## How the Desk reads a review file

The Desk accepts only `plot.review.v1` within the size and count limits, with unique issue keys and exact keys. It refuses a backup, a visitor file, a newer version and any file that is not JSON, and says which kind of file it found. Two sites with the same issue key stay two sources. A restored copy of a register keeps its lineage and has a new site key. An older copy cannot replace a newer one. The Desk keeps its state in its own IndexedDB and never writes into a register.

## Where this is tested

| Test | What it covers |
|---|---|
| `tests/unit/exchange.test.ts`, `tests/fixtures/exchange-vectors.json` | Closed schemas, packet building, comparison, slip reading, the shared vectors |
| `tests/unit/exchangeApps.test.ts` | Which checks each register raises, on Lantern Fold and Thimble Beds |
| `tests/properties/exchange.test.ts` | Generated cases for the exchange rules |
| `tests/unit/exportExchange.test.ts` | The pinned copy, its hashes and the vectors against it |
| `tests/browser/desk-return.spec.ts` | The register side in a real browser |
| `tests/browser/judge-guide.spec.ts` | A review file from Lantern Fold opened in the Desk preview on the built site, one decision, a return slip |

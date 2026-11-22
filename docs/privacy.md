# Privacy

Records stay in the keeper's browser. The apps and the site make no request beyond their own files, run no analytics and ask for no login.

## Where data lives

| Data | Where | Who can read it |
|---|---|---|
| Registers (events, plots, people, notes, page photos) | IndexedDB of the browser, on this device | The keeper |
| Settings (motion, contrast, paper size) | One local storage key, `plotwarden.settings`, holding only those three choices | The keeper |
| The offline cache | The browser cache of static files of the site | Holds no record, no backup and no downloaded file |
| A backup, a visitor file, a review file, a return slip | A file that the keeper downloads | Whoever the keeper gives it to |

Nothing else is written. The source of `template/src` and `apps/*/src` is scanned by `tests/unit/privacy.test.ts` for a `console` call, a network API, the clipboard, cookies and any local storage key other than the one above.

## Three models, kept apart

- **Private register.** Everything. It is shown only to the keeper, in the register, in a private backup and in private reports.
- **Visitor files.** `plot.family.v1` and `plot.availability.v1`. Built field by field from what the keeper approved, and parsed by a closed schema that rejects any other key at every depth.
- **Committee files.** `plot.review.v1` and `plot.slip.v1`. Safe issue facts only, also closed.

Rules that follow:

- A living person never appears in visitor output. That includes reservation holders, applicants, tenants, contacts and co holders. The garden file has no person field at all.
- A deceased name reaches a family file only after the keeper approves that burial and that field. A material change to the name or identity returns the approval to review. Approval always uses current consent.
- A committee file holds no person name, contact, amount, note, inscription, image or private site title. A review label is checked against private strings before it is accepted.
- Private data never goes into an address, a file name, a log, an analytics call, a local storage key, a cache, image metadata or the clipboard. A search is kept out of the address bar.
- A file name holds the kind of file and a date. For example `family-map-2026-04-20.html`, `availability-map-2026-04-20.html`, `committee-review-2026-04-20.json` and `register-backup-2026-04-20.pkr.zip`.

## A visitor file

A visitor file is one HTML page. Its own content policy allows its inline style and script and nothing else: no network, no form, no remote font, no image but a data address. It has no `generator` or `author` tag. It carries a plain list of names, so browser Find works with script off. A downloaded copy keeps its own date, and the page warns that recipients can keep older copies.

## The site

`site/public/_headers` sets one content policy for each page. It names no outside origin. Scripts may come from the site only. Styles may be inline, because the print documents carry their own style. The two sample visitor files carry the same policy that they hold for themselves. `scripts/check-release.mjs` fails if a page has no policy, has two, or if one names an outside address.

The built site holds no analytics, no billing address, no remote font or script, and no server code (no `functions` folder, no `_worker.js`, no routes file). `tests/browser/release.spec.ts` records every request of each page and expects none outside the site, no failed request and no console error.

## Photos

Page photos are private. They are normalised on the device (type, size and dimensions are checked, camera metadata is removed, orientation is kept) and never go into a visitor or committee file.

## How this was checked, and what it does not show

- Canaries (invented private strings) were searched for in every byte of each family file, availability file, print document, review file and return slip, in database, store and index names, in local storage keys, in console output and in file names.
- Browser specs log every request and expect none outside the site's own address.
- This is testing on invented data. It is not a review by a privacy professional, and no real keeper has used the registers. See `docs/verification.md`.

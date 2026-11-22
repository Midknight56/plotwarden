# Architecture

Plotwarden is two registers on one foundation, a small static site that holds them, and a separate committee app. Everything runs in the browser. There is no server, no login and no sync.

## The parts

| Part | Where | What it is |
|---|---|---|
| Template | `template/` | The plot foundation: identity, plot codes, dates, status, events, local storage, files, screens and the adapter contract |
| Churchyard Register | `apps/churchyard-register/` | Burials, reservations, stone readings, a family map, private reports |
| Allotment Register | `apps/allotment-register/` | Waiting list, offers, tenancies, season fees, handovers, a map of free plots |
| Market stall example | `examples/market/` | A third use that proves the template needs no change for new rules. See `docs/make-your-own.md` |
| Site | `site/` | The hub, two sample visitor pages, a service worker. Static files only |
| Review Desk | its own repository | The committee app. The site holds a checked copy of its preview at `/review/` |
| Tools | `tools/` | A local inspector with three tools, and the servers and builders of the site |

## Layers and import direction

```
apps/*  ->  template/  ->  browser primitives (IndexedDB, Blob, DOM)
site/   ->  its own folder only
```

- An app imports the template. The template never imports an app, the site, the Desk or a test helper.
- The pure rules (`template/src/*.ts` and `template/src/map/`) import no React, no IndexedDB and no app.
- `template/src/data/` may use IndexedDB and Blob. It imports no React.
- `template/src/output/` and `template/src/exchange/` build the visitor and committee files. They import no private record type.
- `template/src/ui/` may use React. It receives its adapter as an argument. Only an app's `main.tsx` imports its own adapter.
- No shared rule branches on the kind of register. Kind specific rules live in the adapter.
- `node scripts/check-imports.mjs` enforces all of this and fails with the importing file and the forbidden target.

## Records

A register is a list of appended events. Stored event bytes never change. A mistake is fixed by a correction event that names the original and gives a reason. Every state, count and report is derived by replaying events, so a report for an earlier date is the same replay stopped earlier.

- Every private ID is a locally generated UUID. A visible plot code is separate and can change. Earlier codes stay searchable and reserved.
- A plot has one or more spaces. A churchyard plot may hold several burials, one in each space. A garden plot has exactly one space.
- A commit checks the expected revision inside one IndexedDB read and write transaction, and raises the revision once. A repeated operation ID returns the earlier result. "Saved on this device." appears only after the transaction completes.
- A partial date keeps its precision. Blank money is unknown, not zero.

## Three models

| Model | Who sees it | Built how |
|---|---|---|
| Private register | The keeper on this device | Events and derived indexes |
| Visitor (`plot.family.v1`, `plot.availability.v1`) | Families and people looking for a plot | Built field by field from what the keeper approved. Closed schema |
| Committee (`plot.review.v1`, `plot.slip.v1`) | The Review Desk | Safe issue facts only. Closed schema |

A visitor or committee module never imports a private type, and a private object is never spread or filtered into a public one. See `docs/privacy.md`.

## The site

`npm run build:apps` builds the two registers, the hub, the two sample visitor pages and the service worker into `dist/apps/`. `npm run assemble:site` composes `dist/site/`:

| Address | Comes from |
|---|---|
| `/` | The hub (`site/`) |
| `/churchyard/` | The Churchyard Register build |
| `/allotments/` | The Allotment Register build |
| `/visitor/family/`, `/visitor/seeker/` | The two sample pages, each with one sample visitor file |
| `/review/` | The Review Desk preview, copied only if it matches `release/desk-preview.lock.json` |

Inner screens use hash routes, such as `/churchyard/#/r/<id>/map`, so a refresh on a static host asks for a path that exists. `site/public/_headers` sets one strict content policy for each page, with no outside origin. `site/public/404.html` is the page for an address that is not there.

The sample visitor files are made by `scripts/build-visitor.mjs`, which runs the same builders that the registers use when a keeper downloads a file, on the invented fixtures.

## Offline

A versioned service worker (`site/src/sw.ts`, logic in `site/src/swCore.ts`) caches the static files of the site under one name per version. Assembly stamps the worker with the list of files and a version taken from their bytes. The worker:

- answers only a plain GET of its own origin, with no query and no range, for a path in its list. Anything else goes to the network and is never stored;
- adds nothing to the cache after install, so a record, a backup or a downloaded file has no way in;
- never skips waiting. A new version installs into a cache of its own and waits until the pages of the old version close, so files of two versions never mix. A page that is open says "A new version is ready. Save your work before reopening."

Register data lives in IndexedDB, not in the cache.

## The committee exchange

A register can write a review file (`plot.review.v1`) with the checks that need a committee. The Desk reads it, a reviewer marks each check, and the Desk writes a return slip (`plot.slip.v1`) for the keeper. The Desk never writes into a register. The Desk repository holds a pinned copy of `template/src/exchange/` made by `scripts/export-exchange.mjs`, and the main repository never imports the Desk. See `docs/exchange-format.md`.

## Release scripts

| Script | What it checks or does |
|---|---|
| `scripts/lock-desk.mjs` | Writes the Desk lock on a person's command, and never replaces one without `--replace` |
| `scripts/assemble-site.mjs` | Verifies the Desk preview against the lock, then composes `dist/site/`. Never writes the lock |
| `scripts/build-sw.mjs` | Stamps the worker with its version and file list |
| `scripts/check-public.mjs` | Public text has no dash between words and no local path. It also has none of the words in a list kept outside the repository, named by `PLOTWARDEN_BANNED_WORDS`. Without that variable it says the lists were skipped |
| `scripts/check-licenses.mjs` | Every shipped package has a row in `THIRD_PARTY_NOTICES.md` |
| `scripts/check-links.mjs` | Every link in the README and `docs/` resolves |
| `scripts/check-release.mjs` | The built site is a set of real pages, with no remote asset, no billing address, no server code, one policy per page, a matching worker version and Desk copy, and every route has its proof pictures |

No script deploys anything.

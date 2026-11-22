# Verification

What was tested, on what, with what result, and what was not. Each result says how it was produced: a unit test, a property test, a browser assertion, or a person looking at a picture. Nothing here is a claim about users, speed or any browser other than the one named.

## On what

- One Windows machine, Node 24.19.0, Playwright 1.65.1. Playwright lists Chromium 159.0.8154.6 for that release. The installed browser build was not read separately.
- Headless Chromium only, one worker, at 360 by 640 and at 1920 by 1080. No window was opened and no browser was installed by a script.
- Source revision for every row below: the working tree on top of commit `af7576b`, not committed.
- Fake IndexedDB in Node for unit tests, and the browser's own IndexedDB in browser specs.
- Every place and person is invented.

## Results of this release

Each command was run on its own, and its exit code was read.

| Requirement | Command | Expected | Actual | Result |
|---|---|---|---|---|
| All | `npm run typecheck` | exit 0 | exit 0 | pass |
| All | `npm run lint` | exit 0 | exit 0 | pass |
| All | `npm run test:unit` | all pass | 4,716 passed in 74 files | pass |
| T01 to T36 | `npm run test:properties` | all pass | 51 passed in 7 files | pass |
| T01, T34 | `npm run test:conformance` | all pass | 74 passed in 5 files | pass |
| T20 and others | `npm run test:oracle` | all pass | 24 passed in 2 files | pass |
| T33 | `npm run build:inspector` | exit 0 | exit 0 | pass |
| Structure | `node scripts/check-imports.mjs` | `check-imports: ok` | `check-imports: ok` | pass |
| Z10 | `npm run build:apps` | exit 0 | exit 0 | pass |
| Z10 | `npm run assemble:site -- --desk <preview>` | `assemble-site: ok` | ok, 25 files, 2,199,205 bytes | pass |
| Z10, Z16 | `npm run check:public` | `check-public: ok` | `check-public: ok, 379 files` | pass |
| Z10 | `npm run check:licenses` | `check-licenses: ok` | `check-licenses: ok, 9 shipped packages, each with its row` | pass |
| Z18 | `npm run check:links` | `check-links: ok` | `check-links: ok, 11 pages` | pass |
| Z10, Z16 | `npm run check:release` | `check-release: ok` | `check-release: ok (all)`, the site and the inventory | pass |
| Browser | `npx playwright test` | all pass | 382 passed in 3.9 minutes (191 at each size) | pass |

The browser run is every spec: the entry, layout, accessibility and recovery specs of spec 06, the paper, map, family, secretary and Desk return specs of the earlier specs, the market example, and the three specs of the site (`release`, `share-print`, `judge-guide`).

### Last checks

The four `check:` commands read this page and the README, so they were run after both were written. Their output is in the table above and in the row "6.23 release exit gate" of `docs/kiro-log.md`.

## What each new test failed on first

A test must fail on the missing behaviour before its code is written. The first run of each new test, against a compiled stub that throws "not implemented" or against the real screens, was:

| Test | First run | Why it failed | Then |
|---|---|---|---|
| `tests/unit/offline.test.ts` (T31) | 26 failed, 22 passed of 48 | Every cache and notice function threw "not implemented". The 22 that passed check the sample visitor files, which already existed, and the manifest refusals, which a throwing stub also satisfies | 48 of 48 |
| `tests/unit/offline.test.ts`, the fragment case | 1 failed of 49 | A page address with `#/r/<id>` gave no file. Found by the browser spec (see below) | 49 of 49 |
| `tests/unit/release.test.ts` (T36) | 124 failed, 3 skipped of 127 | Each script was a stub that exits 3, and the tests expect exit 0, 1 or 2 and named output | 127 of 127, then 128 of 128 after two cases were added for the addresses a bundle may hold and the paths a test may write |
| `tests/unit/siteCopy.test.ts` | 22 failed, 9 passed of 31 | The pages threw "not implemented". The 9 that passed read the catalog and the static pages | 31 of 31 |
| `tests/unit/visitor.test.ts`, two print cases | 2 failed | The print rules of the family and availability files left tan and green map colours | 66 of 66 |
| `tests/browser/release.spec.ts` | 17 failed, 18 passed (phone) | A `Permissions-Policy` header named `interest-cohort`, which Chromium does not know, so every page logged a warning. The worker showed the 404 page for a reload at a register address. Three locators of mine were wrong. The update test tried to intercept the worker's own update request, which the browser does not allow | 70 of 70 |
| `tests/browser/share-print.spec.ts` | 9 failed, 2 passed (phone) | The gray check read red and blue fringes that the screen's text smoothing puts on letters, so it now draws in a browser with that off. The garden report check named a word that the report does not hold. The printed sample family file left a tan map colour | 22 of 22 |
| `tests/browser/judge-guide.spec.ts` | 2 failed, 1 passed (phone) | Two controls of the guide were a link and a button, not what the first draft said. One was named "Print this location", not "Print location" | 6 of 6 |

## What was tested

- **Offline cache (T31, Z4).** The worker's logic with in memory caches: only a plain GET of its own origin for a listed path, no query, no range, no write method, no `blob:` or `data:` address, a fragment ignored; install all or nothing; a new version in its own cache beside the old one; activation removing only older shell caches; the old worker serving only old files while a new one waits; the stored 404 page offline; nothing added after install. In Chromium: one worker for the whole site, a cache that equals the manifest, every page opening with the network off, a register started offline and kept, the cache unchanged by it, and the update notice with both caches present.
- **Release (T36, Z10, Z16).** Assembly refuses a changed, missing or extra Desk preview file, another Desk name, version or revision, a missing lock and a missing app build, and writes nothing when it refuses. Assembly never writes the lock. The release check refuses a billing or remote address in a page, script or style, server code, two policies on one page, no policy, a worker version that no longer matches, a Desk copy that differs from the lock, more than 500 files, over 5 MiB, and a missing, empty, wrong width or unlisted picture. Each is a unit case on a small tree.
- **Direct entry and refresh.** Eight addresses (the hub, both registers, the Desk preview, both visitor pages and both sample files), opened and refreshed at both sizes: status 200, a heading, no request outside the site, no failed request, no missing picture, no console error, no login. A folder without its slash goes to the folder, and an unknown address is the 404 page with status 404.
- **Headers.** One content policy on each page, with no outside origin and no eval script, plus `nosniff` and `no-referrer`.
- **Layout.** The 16 px edge, 12 px gap, 44 px target, 12 px text, contrast and no sideways scroll of the shared helper, on the hub, its About and not found routes, both visitor pages and their About routes, both sample files, the 404 page and the entry page of each register. Kiro looked at the hub pictures at both sizes. No person reviewed them.
- **Share and print.** The private report of each register and the two visitor print documents, on A4 and on Letter: PDF page boxes of the right paper, no sideways overflow, no script, link, form or address, no pixel that is not gray (0.05 percent allowed), and no private canary in the text, the document or the PDF bytes. The two visitor files downloaded from the registers, opened from disk with the network off, searched, and printed to A4 and Letter.
- **The guide.** The steps of `docs/judge-guide.md`, run click for click.
- **Public text, notices and links.** `check:public`, `check:licenses` and `check:links` run on the real repository, and on small trees in `release.test.ts`.

## What was not tested

- **No real phone.** A 360 by 640 window is not a phone. No software keyboard, no rotation, no real touch.
- **No screen reader.** The accessibility checks are browser assertions and axe from the earlier specs. No person used a screen reader.
- **Chromium only.** No Firefox, no WebKit, no other Chromium build. The service worker was not tried in another browser.
- **No person used any of it.** No warden, secretary, family member, plot seeker or committee reviewer. No time, adoption or saving claim is made.
- **No paper.** Print is a PDF that the browser makes from the document. No print dialog was driven and no page was printed. Paper size is read from the PDF page boxes. Dense map sheets, repeated headings and page numbers were not measured in a browser.
- **No live host.** Nothing was deployed. The headers were read by the local preview server. Whether a real static host sends the same headers was not observed.
- **The worker's hand over.** The step where the old pages close and the new worker takes over is covered by unit tests with in memory fakes, and was not driven in a browser. The update itself was made by rewriting one file on disk for one test and restoring it.
- **Speed.** Nothing about the speed of the site was measured. The measures in `docs/kiro-log.md` for a 200 row import are from fake storage in Node.
- **The Review Desk's own checks.** Its unit and browser specs and its host test are in its own repository, and were not run here. The site holds a copy of its preview, pinned by `release/desk-preview.lock.json`. The preview was built about 30 seconds before the Desk's last commit, and was not rebuilt, so the lock does not show that the preview was built from that exact commit.
- **Browser quota and multiple tabs on a real device** were exercised only in headless Chromium.

## Where the evidence is kept

- Proof pictures: `docs/acceptance/layout/` (`routes/` for every route of both registers, `site/` for the hub, the visitor pages and the entry of each app). `npm run check:release` checks that each route has its picture, as wide as its viewport.
- The build record: `docs/kiro-log.md`, one row for each task.
- How each part was built: `docs/kiro-evidence.md`.

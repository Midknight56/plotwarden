# Plotwarden

Plotwarden keeps plot registers on the keeper's own device. There is no server, no login and no sync. Everything runs in the browser and is saved in that browser's own storage.

**Live site:** https://plotwarden.pages.dev

**Film:** https://youtu.be/wKHEp0O9Pww (2 min 33 s, spoken and captioned)

## Judging criteria at a glance

### In short

A warden can find a burial from a paper record and give a family a map. A garden secretary can offer an empty bed and record its rent. We used Kiro to build both registers from one template.

### Potential Impact

Wardens can enter a page beside its photograph or bring in a spreadsheet. Families can take a map home. Garden committees can keep the waiting order and see what each holder paid. Check it in the [guide to the two registers](docs/judge-guide.md).

### Technological Implementation

Kiro worked from written rules for plot spaces, waiting order and visitor details. A reload of a register page with the network off showed the not found page until a test about the address fragment failed first, and then the offline worker was fixed. Check it in the [Kiro build record](docs/kiro-evidence.md) and in the [answers to the eight Kiro questions](docs/write-up.md).

### Design

The entrance, row and plot code match on screen and on paper. A visitor can search by name or use the plot list. A secretary sees the next applicant beside the available bed. Check it in the [phone views and printed sheets](docs/verification.md), and the [proof pictures](docs/acceptance/layout).

### Innovation/Idea

A burial can stay in one place for generations. A garden plot can change hands every season. One template handles both histories and gives each visitor only the details the keeper selects. Check it in the two apps, [Churchyard Register](apps/churchyard-register) and [Allotment Register](apps/allotment-register), and in the [market stall guide](docs/make-your-own.md).

### Presentation

Follow a warden to a burial, watch a secretary offer a plot, then follow a committee check back to its source. Check it in the captioned film: https://youtu.be/wKHEp0O9Pww

## What it is

A plot register answers one plain question: what is in each plot, and what has been said about it? Plotwarden turns paper records and a site plan into a searchable list, a map drawn in local coordinates, and dated reports. It makes small files that others can read without seeing private records.

## Who it is for

| Person | What they get |
|---|---|
| A churchyard warden | A private register of burials, a map, reports and a backup |
| A family member | One file or printed sheet that shows only the names the warden approved |
| An allotment secretary | A waiting list, offers, tenancies, season fees and handovers |
| Someone looking for a plot | A dated map of free plots and how to ask the secretary |
| A committee reviewer | A list of open checks with no personal data, and a slip to send back |

## The two registers

Both are built on one shared foundation in `template/`. Each adds its own rules in an adapter.

- **Churchyard Register** (`apps/churchyard-register`). Search a burial by name or plot code. Record burials, reservations and stone readings. Approve names one by one for a family map. Print a private report for a date.
- **Allotment Register** (`apps/allotment-register`). See the next free plot and the next applicant. Offer a plot, record the tenancy and the rent received, hand a plot on, and make a map of free plots for people who are looking.

Each app opens with a practice register, so a new keeper can try every step before entering real records.

The Plotwarden Review Desk is a separate app in its own repository. It reads the small review files that either register makes, prints one list of checks, and returns a slip. It never writes into a register.

## How to run

You need Node 24 or later.

```
npm install
npm run church:dev     # Churchyard Register on http://127.0.0.1:4177/
npm run allot:dev      # Allotment Register on http://127.0.0.1:4179/
```

To build and look at a finished copy:

```
npm run church:build && npm run church:preview    # http://127.0.0.1:4176/
npm run allot:build && npm run allot:preview      # http://127.0.0.1:4178/
```

The servers listen on `127.0.0.1` only, on fixed ports. Stop one with Ctrl+C.

The whole site, the hub and both registers, runs from source with `npm run dev` on `http://127.0.0.1:4173/`.

## The site

The site is the hub, both registers, two sample visitor sheets and the Review Desk preview, as static files. To build it:

```
npm run build:apps
npm run lock:desk -- --desk <the dist/preview folder of the Review Desk checkout>    # once, on purpose
npm run assemble:site -- --desk <the dist/preview folder of the Review Desk checkout>
npm run preview                                                                       # http://127.0.0.1:4174/
```

`lock:desk` writes `release/desk-preview.lock.json`, which pins the Desk version, git revision and the hash of each preview file. `assemble:site` only reads it. It stops, and writes nothing, if the preview differs by one byte. `docs/judge-guide.md` is a two minute path through the result.

## Make your own register

`docs/make-your-own.md` makes a third register, a market stall register, from the same template, with no change to the template:

```
npm run create:app -- --kind market --out .local/market
npx vite --config .local/market/vite.config.ts     # http://127.0.0.1:4181/
```

The folder must not exist yet. The example it copies is `examples/market/`, which also runs on its own with `npm run market:dev` (4181) and `npm run market:build && npm run market:preview` (4180).

## Local inspector

`npm run build:inspector` writes `dist/inspector/server.mjs`, a small local server that speaks the Model Context Protocol on standard streams, and `dist/inspector/cli.mjs`, the same three tools on the command line. The tools (`explain_plot`, `audit_projection`, `check_adapter`) work on three invented in memory fixtures only. They read no file, open no address and run no command from an argument. `powers/plot-checks/` holds a skills only power that uses them to review an adapter. The inspector is registered in `.kiro/settings/mcp.json`. Switching it on is a step for a person.

## How to test

```
npm run typecheck
npm run test:unit
npm run test:properties
npm run test:conformance
npm run test:oracle
node scripts/check-imports.mjs
npm run test:browser
npm run check:public && npm run check:licenses && npm run check:links && npm run check:release
```

- The unit, property, conformance and oracle tests run in Vitest. Fees, queue order and tenure at a date are also checked against `scripts/oracle.py`, which uses only the Python standard library.
- The browser tests run headless with Playwright, one worker, at 360 by 640 and 1920 by 1080. They start their own servers on `127.0.0.1` and stop them. This repository does not install a browser, so a Chromium that Playwright can find must already be present. They cover both registers (entry, layout of every route and at 200 percent zoom, accessibility with axe and the keyboard alone, recovery from two tabs, a full store, a cancelled import and a broken backup) and the market example.
- `node scripts/check-imports.mjs` fails the build when a layer imports something it must not. For example, the template never imports an app.
- The browser specs of the site (`release`, `share-print`, `judge-guide`) need the assembled site, so run `npm run build:apps` and `npm run assemble:site` first. They cover direct entry and refresh on every page, the content policy, the offline cache, the two sample visitor files, and the print documents on A4 and Letter.
- `npm run check:public`, `check:licenses`, `check:links` and `check:release` check public text, notices, links, and the built site with its proof pictures.
- `check:public` always checks dashes and local paths. It also checks a list of banned words that is kept outside this repository, in a JSON file of lists of words. Set `PLOTWARDEN_BANNED_WORDS` to the path of that file. When the variable is not set, `check:public` prints one line to say the word lists were skipped and runs every other check.
- No test makes a network request.

## Privacy

Records stay in the keeper's browser. The app makes no network call while it runs, has no analytics and sends nothing anywhere. By design, private data is kept out of addresses, file names, logs and the clipboard. A file for a family or for people looking for a plot is built field by field from what the keeper approved, and a living person never appears in it. A file for the committee holds no name, contact, amount, note, inscription or image. A backup is a private file that holds everything, and the keeper decides where it goes.

## Layout of the repository

| Folder | Holds |
|---|---|
| `template/` | The shared foundation: records, dates, status, storage, files and screens |
| `apps/` | The two registers |
| `examples/` | The market stall example that the generator copies |
| `site/` | The hub, the two sample visitor pages and the service worker |
| `release/` | The lock that pins the Review Desk preview |
| `tools/`, `powers/` | The local inspector and its skills only power |
| `scripts/` | Import checks, the oracle, the export of the committee files and the app generator |
| `docs/` | The guides, the build log and the proof pictures. Start with `docs/judge-guide.md`, `docs/kiro-evidence.md`, `docs/verification.md` and `docs/make-your-own.md`. Also `docs/architecture.md`, `docs/privacy.md`, `docs/backup-format.md`, `docs/exchange-format.md` and `docs/rights.md` |
| `tests/` | Unit, property, conformance, oracle and browser tests |
| `.kiro/specs/` | The requirements, design and tasks of each part |

## Licence

MIT. See `LICENSE`. Notices for the packages this project uses are in `THIRD_PARTY_NOTICES.md`.

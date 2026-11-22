# 03 Churchyard: design

This design says how spec 03 builds C1 to C10. Names in `code` are files or exports. Where it adds detail to a contract, it says so.

## K1 Files and what each owns

Every production file has a test listed in `tasks.md`.

| File | Owns | Layer |
|---|---|---|
| `apps/churchyard-register/index.html`, `package.json`, `vite.config.ts` | The page, the package and the build of the app. The build uses the loopback address and strict ports 4176 (preview) | app |
| `apps/churchyard-register/src/types.ts` | `ChurchState`, records, commands, events | pure |
| `apps/churchyard-register/src/rules.ts` | `decideChurch`, `applyChurch`, `validateChurch`, `approvalStatus`, `possibleMatches` | pure |
| `apps/churchyard-register/src/fields.ts` | `FieldDef` list, the Burials sheet, the date entry rules | pure |
| `apps/churchyard-register/src/adapter.ts` | `churchAdapter`, `burialsImporter`, `churchRecords` (search names) | pure |
| `apps/churchyard-register/src/history.ts` | Period report data, unplaced list, open spaces, plot rows for the app | pure |
| `apps/churchyard-register/src/review.ts` | `reviewFacts` for `placement_missing` and `reading_unclear` | pure |
| `apps/churchyard-register/src/projection.ts` | `buildFamilyFile`, `previewFamily`, public label checks | pure |
| `apps/churchyard-register/src/copy.ts` | The Churchyard copy catalog and `churchError` | pure |
| `apps/churchyard-register/src/walkthrough.ts` | Lantern Fold: ids, commands, dates | pure |
| `apps/churchyard-register/src/{main,ChurchyardHome,Burial,Reservation,Memorial,Unplaced,FamilySheet,BurialReport}.tsx` | The app entry and its screens | ui |
| `apps/churchyard-register/src/theme.css` | The churchyard look | ui |
| `template/src/output/familyMap.ts` | `familyMapSvg`, `escapeHtml`, `jsonForScript`, `fillWords`: the public map drawn from a `FamilyFile` alone | output |
| `template/src/output/visitorHtml.ts` | `buildFamilyHtml`: the self contained visitor file from a `FamilyFile`, and `visitorFileName` | output |
| `template/src/output/print.ts` | `buildFamilyPrint` (from the visitor object alone) and `buildReportPrint` (from a plain table model) | output |
| `apps/churchyard-register/src/intent.ts` | `useIntent` (one operation per intent, repeat press guard, field errors, focus), `useChurch`, `printHtml` | ui |
| `template/src/data/seed.ts` | `seedWalkthrough`, `restartWalkthrough`: make or rebuild one walkthrough site | data |
| `template/src/ui/shellContext.ts`, `RegisterShell.tsx`, `Library.tsx`, `SiteMap.tsx` | Four small extension points: `RegisterApp.home`, `routes`, `plotExtras`, `walkthrough`, and `ThemeTokens.plotShape` | ui |
| `assets/{gate-lantern,churchyard-margin,plot-symbols}.svg`, `assets/origins.md` | Original art. `plot-symbols.svg` is the master drawing of the marks. The key draws the same marks in code, because an app may import only the template and its own folder | assets |
| `tests/helpers/churchEnv.ts`, `tests/helpers/lanternFold.ts` | A fake database register for the unit tests, and the hand worked Lantern Fold expectations | test only |

The app imports the template and its own folder only. The template imports no app. `check-imports.mjs` stays green.

## K2 State

```ts
interface ChurchState extends BaseState {
  people: Record<Uuid, { personId; displayName; contact? }>;        // living holders and requesters. Never deceased.
  burials: Record<Uuid, Burial>;
  reservations: Record<Uuid, Reservation>;
  requests: Record<Uuid, Request>;
  memorials: Record<Uuid, Memorial>;
  approvals: Record<Uuid, Approval>;                                // by burialId
  pub: PublicSettings;
  separate: Record<string, true>;                                   // "idA|idB" sorted, from "Keep separate"
}
Burial { burialId; sheet: "Burials"; sourceRef; recordedName?; nameUnknown; date: PartialDate; dateText;
         plotId?; spaceId?; claimId?; personKey?; voided?; correctionRefs: string[]; normalized }
Reservation { reservationId; plotId; spaceId; claimId; holderId; start; sourceRef?; fromRequest?;
              released?: { on; reason }; convertedTo?: Uuid }
Request { requestId; holderId; note?; on; reservationId? }
Memorial { memorialId; burialId; reading; unclear; pageRef?; photoIds: Uuid[] }
Approval { burialId; name; includeYear; line?; basis: { recordedName; year?; plotId; nameUnknown } ; withdrawn? }
PublicSettings { siteName?; gateName?; directions?; outlines?: boolean; sectionNames: Record<Uuid,string>; pathNames: Record<Uuid,string>; plotCodes: Record<Uuid,string> }
```

A burial writes one `taken` claim with `endable: false`, `ref` set to the burial ID and `sourceRef` set. A reservation writes one `held` claim with `endable: true`. A request writes no claim.

## K3 Commands and events

| Command | Decides | Events (after the core ones) |
|---|---|---|
| `record_burial` | C1.1 to C1.8, and C2.4 to C2.6 when it names `reservationId` | `burial_recorded` |
| `place_burial` | C1.7 | `burial_placed` |
| `correct_burial` | C1.9 name and date | `burial_corrected` with `corrects` |
| `move_burial` | C1.9, C1.10: voids the old claim, adds the new one | `burial_corrected` with `corrects`, core `claim_voided` |
| `void_burial` | C1.9 | `burial_voided` with `corrects`, core `claim_voided` |
| `add_space` | R3.1: 1 to 12 spaces per plot, new space unchecked | `space_added` |
| `record_reservation` | C2.1, C2.2 | `reservation_recorded` |
| `add_request` | C2.3 | `request_added` |
| `fulfil_request` | C2.8 | `reservation_recorded` with `fromRequest` |
| `release_reservation` | C2.7: reason required, the date is the effective date | core `claim_ended`, `reservation_released` |
| `save_reading`, `settle_reading`, `link_stone_photo` | C3 | `reading_saved`, `reading_settled`, `stone_photo_linked` |
| `approve_burial`, `withdraw_approval` | C4 | `burial_approved`, `approval_withdrawn` |
| `set_public` | C5.1 | `public_set` |
| `keep_separate`, `link_burials` | C1.11 | `kept_separate`, `burials_linked` |

`decideChurch` first checks the field errors with `validateChurch`, then refuses a space or plot that does not exist, then calls `decideCore` for the claim parts, then writes the church event last. IDs come from the command. A correction event sets `corrects` to the event ID given by the command. The screens read these IDs from the stored events with `findEventId` in `history.ts`.

Dates. A command carries `date: PartialDate` and `dateText`. `isValidPartial` accepts only the four wire forms with years 1000 to 9999 and real days. A day date gives the claim `start`. Year, month and unknown give no `start`.

Error codes added by this spec: `space_taken` (core), `space_reserved` (detail `reservationId`, `sourceRef`), `source_ref_used`, `name_and_unknown`, `bad_conversion` (core), `reservation_closed`, `request_closed`, `memorial_exists`, `no_such_burial`, `no_such_reservation`, `no_such_request`, `no_such_memorial`, `not_placed`, `already_placed`, `approval_needs_name`, `space_limit`, `no_such_photo`, `photo_linked`, `no_approval`.

## K4 Approval status

`approvalStatus(state, burialId)` returns `none`, `approved` or `review`. `approved` needs an approval that is not withdrawn, a live burial, equal `basis.recordedName`, `basis.nameUnknown` false, equal `basis.plotId`, and, when `includeYear`, an equal year. Any other case with an approval is `review`. The family file takes only `approved`.

## K5 Family file

`buildFamilyFile(state, { asOf, newPublicId })` returns `{ ok: true, file, preview }` or a list of flagged public fields. It reads `state.pub`, the approvals and the map. It builds every field by hand:

- `siteTitle`: `pub.siteName`. It is required and has no default.
- `gate`: `pub.gateName` with the map gate point. A map with no gate gives `no_gate`.
- `paths`: each map path whose ID is in `pub.pathNames`, with that public name.
- `sections`: each section holding an approved burial's plot, labelled `pub.sectionNames[id]` or, if unset, a neutral "Section n".
- `plots`: the plot of each approved burial, with its footprint outline and the code `pub.plotCodes[plotId]` or the plot's code.
- `burials`: the approved name, `year` only when `includeYear`, the plot's public ID, `directions` (the one way in for the whole site, from `pub.directions`) and `line` (the approval's own optional line for this burial, never another burial's).
- `outlines` (only when `pub.outlines` is true): the footprint of every plot that has one on the map and is not in `plots`, as bare point lists, sorted by their points (south to north, then west to east) so the order says nothing about a plot code. It holds no code, state, ID or count. It is built from the map shapes alone, so an edit to a note, a reading, a request, a holder or a burial in a plot not shown cannot change it.
- `north` from the map.

Each public ID is `newPublicId()`, a random 16 character token, never a private UUID. `previewFamily` lists the included burials, the withheld ones (count and "withheld" only, with no name) and the fields. Flagging uses `flagPrivateStrings` with every person name, contact, request note and holder name in the state. The built file is checked with `parseFamily` before it is returned.

`buildFamilyHtml(file)` writes one HTML string: a CSP meta (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:` with no network and no form), the map as inline SVG drawn from the public geometry, a plain `<ul>` of burials readable with script off, the entrance and directions, and an inline script that filters the list by a typed name or code. The embedded JSON escapes `<`, `>`, `&`, U+2028 and U+2029. The file ends with "As at {date}" and the print button. Its only data is the family object.

`buildFamilyPrint(file, { paper, orientation })` builds a second document from the same object: title, "As at", entrance, directions, the map sheet and an index of burials with plot codes. A4 or Letter by `@page size`. Grayscale: every mark has a word or a shape and no colour carries a meaning.

A dense public map (more than 60 plots in the file) splits: the print document draws an overview with a section index and then one numbered sheet per section.

### K5a The drawn map

`familyMapSvg` places every name with the rules of `template/src/map/labels.ts` (pure, no private type). It draws, in order: other plots as plain outlines, section outlines, walks (a band `WALK_BAND` px wide with a dotted line), the plots of the file as arches, the gate, the north arrow, then the tabs.

- A plot code is never written beside its plot. It is written on a tab (`rect.tab` and `text.tab-text`). `selectedPlotId` draws that tab. `selectable` draws a tab for every plot in the file inside a group, which the page hides by script until a plot is chosen and shows when script is off. `allTabs` draws every tab, for a print.
- Names (gate, section, path) are placed first, each in the first clear spot: inside the sheet, `WALK_BAND / 2 + 4` px from every walk, away from every plot and outline, the north arrow, the gate mark and every earlier name. A name with no clear spot is written under the drawing, one to a line, after a small sample of its mark (the gate square or a short walk). A path named like a drawn section is not written twice.
- Tabs are placed after the names, each in the first clear spot above, below or beside its own plot, against the same things and against every other tab.
- The page prints one location with the selected plot and its tab. Other plots of the file draw as thin outlines in that print. The print of the whole map shows every tab.
- Print colours: outlines, walks and tabs are gray. Nothing carries meaning by colour.

## K6 Private report

`periodReport(state, events, { from, through, asOf })` in `history.ts` returns:

```ts
{ from; through; asOf; revision; basis: "current_corrections";
  burials: { inside: Burial[]; incomplete: Burial[]; outside: number };
  reservationsMade: Reservation[]; reservationsReleased: Reservation[];
  openSpaces: { code; spaceLabel; line }[]; locationToConfirm: Burial[];
  empty: boolean }
```

Burials use `classifyInPeriod` on the burial's partial date. A voided burial is left out. A reservation is made on `start` and released on `released.on`. `empty` is true only when inside, incomplete, made and released are all 0. `reportTable` turns it into the plain table model that `buildReportPrint` and the screen take, and `reportCsv` writes the private CSV with `toCsv`, which escapes formula prefixes. The CSV and the print are built in the app and the template output layer: `template/src/output` may not import `template/src/data`.

## K7 Review facts

`reviewFacts(state, asOf)` returns `placement_missing` for each live unplaced burial and `reading_unclear` for each unclear memorial of a live burial. The subject ID is the burial or memorial ID. The label is `Record {n}` where n counts the facts in order. No name appears.

## K8 Adapter and import

`churchAdapter` is a `RegisterAdapter<ChurchState, ChurchCommand, ChurchEvent>` with kind `churchyard`, `spacesPerPlot` 1 to 12, the Burials sheet (required: Source ref, Recorded name or Name unknown; optional: Section, Plot, Space, Burial date, Page), `commands` including `BASE_COMMAND_TYPES`, `project` (private: the state; visitor: the family file when the settings allow, else `null`; committee: the review facts), the report builders and the theme `{ ink: "#22252C", paper: "#FAF5E9", accent: "#232A5C", plotShape: "arch" }`.

`burialsImporter` locates a plot by `normalizeCode` and an optional section. A blank Plot gives `unplaced`. A plot with several spaces needs the Space cell. A blank or `unknown` date is stored `unknown`. A date the reader cannot read exactly is a cell error with `choose_date_order` or `use_year_first`. A correction by import emits `correct_burial` with the source ref and the reason "Import correction". The row is the same source key `(siteId, "Burials", sourceRef)`.

## K9 Walkthrough and the shell

`RegisterApp` gains four optional members:

```ts
home?: ComponentType;                              // replaces RegisterHome
routes?: Record<string, ComponentType<{ arg?: string }>>;   // extra areas under #/r/<id>/<area>/<arg>
plotExtras?: ComponentType<{ plotId: string }>;    // shown inside PlotDetails
walkthrough?: Walkthrough;
```

```ts
interface Walkthrough { title: string; siteTitle: string; zone: string; today: LocalDate;
  batches(newId: () => string): { commands: AnyCommand[]; on: LocalDate }[]; }
```

`seedWalkthrough(db, register, walkthrough, now)` finds the site of workspace `walkthrough`, kind `churchyard` and the walkthrough's title, or makes it: it saves a new site and commits each batch in order with `register.run`, one revision per batch. `restartWalkthrough` calls `removeSite` for that site only and seeds again. The library shows "Open Lantern Fold" and "Restart walkthrough" when the app has a walkthrough. The walkthrough site has `workspace: "walkthrough"`, so `siteLibrary` never lists it under "My registers", and a removal or restart touches no other site.

`ThemeTokens.plotShape?: "arch"` makes `SheetSvg` draw each plot as an arch inside its footprint box.

## K10 Screens and routes

Routes under `#/r/<siteId>`: home (the app `home`), `burial/new`, `burial/<id>`, `reserve`, `unplaced`, `family`, `report`, and the shared ones. Search results use the app home. "Open burial" opens `burial/<id>`. "Show on map" opens `map?plot=<plotId>`.

| Screen | File | Words (plan section 5, Churchyard Register) |
|---|---|---|
| Warden desk | `ChurchyardHome.tsx` | "Find a burial", "Name or plot code", "Record a burial", "Reserve a space", "Unplaced burials", "Make a family map" |
| Burial record and stone | `Burial.tsx`, `Memorial.tsx` | "Recorded name", "Name unknown", "Burial date", "Exact date", "Month and year", "Year only", "Date unknown", "Section", "Plot", "Space", "Location unknown", "Source ref", "Save burial", "Words on stone", "Keep line breaks", "Reading status", "Clear", "Unclear letters", "Stone photo", "Add photo", "Compare photo and words", "Save reading" |
| Reservation | `Reservation.tsx` | "Reservation holder", "Contact details", "Start date", "Available spaces", "Record reservation", "Reserve for next applicant", "Release reservation", "Record burial in this space" |
| Unplaced | `Unplaced.tsx` | "Burials with no plot", "Open source", "Choose location", "Confirm placement", "Possible name match", "Keep separate", "Link to existing person" |
| Report | `BurialReport.tsx` | "Burial and reservation report", "From", "Through", "Burials", "Reservations made", "Reservations released", "Date incomplete", "Open spaces", "Location to confirm", "Print private report", "Download private CSV" |
| Family | `FamilySheet.tsx` | "Family map", "Public site name", "Public section name", "Public plot code", "Public directions" (the way in for the whole site), "Line to this burial", "Show other plots as plain outlines", "Include this burial", "Name shown to visitors", "Include year", "Preview as a visitor", "Download family copy", "Print family map" |
| Family file | `visitorHtml.ts` | "Find a burial", "Name or plot code", "Find", "Clear", "Show location", "Entrance", "Section", "Plot", "Directions", "Print this location", "Print site map", "As at {date}" |

Every screen uses `useRegister().run` so a repeat press returns the same promise, with one operation ID per intent held in a ref and cleared on success.

## K11 The look

`theme.css` is loaded by `main.tsx` only. It styles the shell classes that already exist. It adds no new element to the shared screens.

- Header: `header.app` becomes a grid. Its first row is a 64 px sky band (`#232A5C`) that holds no text. The lantern (`assets/gate-lantern.svg`) sits at the right edge of that band as a background image. The mist (`assets/churchyard-margin.svg`) is the `.mist` element, placed on the lower edge of the band only. Brand text and navigation sit in the second row on the paper colour, so ink on paper keeps 4.5 to 1 or more.
- Motion: the mist drifts with one keyframe animation. The shared rules already stop it for reduced motion and high contrast. `theme.css` adds a rule that stops it for the app setting as well.
- Sheet: `.sheet` plots draw as arches (`plotShape: "arch"`). `.sheet .path` is a wide, light, dotted stroke (a gravel walk) with its name on it. The gate, north arrow, selected double outline and paper tab come from the shared sheet.
- Key: `MapKey` stays directly below the sheet.
- The desk screen is a two column grid from 60 rem: the verb and search on the left, the selected plot and the map on the right. On a phone it is one column: the job, the search and the main action first.

## K12 Test plan

Unit tests follow `tasks.md`. The expected values come from `tests/fixtures/expected/hand-totals.md` sections 1 and 4, read by hand into `tests/helpers/lanternFold.ts`. Browser spec `tests/browser/warden-family.spec.ts` runs the real app on `127.0.0.1:4176` at 360 by 640 and 1920 by 1080. `playwright.config.ts` starts the app build beside the shared host and stops both. Every browser test logs every request and expects none outside the app origin. The downloaded family file is opened in a fresh page context with the network blocked, and is scanned for every canary in `tests/helpers/privacyCanaries.ts`.

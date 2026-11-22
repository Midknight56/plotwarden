# 02 Paper and map: design

This design says how spec 02 builds what specs 00 and 01 fixed. Names in `code` are files or exports. Where this design adds detail to a contract, it says so.

## H1 Files and what each owns

Every production file below has a test listed in `tasks.md`.

| File | Owns | Layer |
|---|---|---|
| `template/src/map/coordinates.ts` | `Point`, site to screen transform, rotate, backdrop transform math | pure |
| `template/src/map/generate.ts` | `GridSpec`, `planGrid`, `parseSkips`, `formatCode`, `planRenumber`, `gridCommand` | pure |
| `template/src/map/geometry.ts` | Polygon and path checks, area, overlap, containment, point in polygon | pure |
| `template/src/map/edit.ts` | `MapState`, map events, `applyMap`, `LayoutCommand`, `decideLayout`, shape drafts | pure |
| `template/src/map/layoutFile.ts` | `plot.layout.v1` build, parse, import plan | pure |
| `template/src/map/sheet.ts` | `buildSheet`, the model drawn by the screen and by print | pure |
| `template/src/notes.ts` | Plot note and photo events, apply and decide | pure |
| `template/src/base.ts` | `BaseState`, `applyBase`, `decideBase`, `BASE_COMMAND_TYPES`: core, layout and notes in one | pure |
| `template/src/data/csv.ts` | Strict CSV reader, separator detection, bounds | data |
| `template/src/data/mapping.ts` | Heading match, column mapping, per cell checks | data |
| `template/src/data/csvExport.ts` | Cell escaping and CSV text | data |
| `template/src/data/importBatch.ts` | `SheetImporter`, `stageImport`, row actions, `commitImport`, `uniqueKeysFor` | data |
| `template/src/data/importDraft.ts` | A staged import as a draft: table, column choices, left out rows, conflict choices and fixed cells, as plain text (repair 07) | data |
| `template/src/data/fastEntry.ts` | Fast entry session, repeat aids, paste, draft and recovery file reading | data |
| `template/src/data/images.ts` | Header guards, orientation, normalise, metadata scan and strip, captions | data |
| `template/src/data/backup.ts` | `.pkr.zip` write, verify, migrate, restore, file classification | data |
| `template/src/data/siteAdmin.ts` | Read blobs, remove one site, change the zone | data |
| `template/src/ui/RegisterShell.tsx` | Hash routes, storage, the loaded register, commit with status, settings, theme | ui |
| `template/src/ui/Library.tsx` | Library, new site | ui |
| `template/src/ui/RegisterHome.tsx` | Search and the links of a register | ui |
| `template/src/ui/PlotList.tsx` | Filters and the list | ui |
| `template/src/ui/PlotDetails.tsx` | One plot: spaces, history, notes, photos, rename, status actions | ui |
| `template/src/ui/SiteMap.tsx` | The sheet screen, key, plot chooser, zoom, print index | ui |
| `template/src/ui/AsAtField.tsx` | The date field "Show the site as at", the "As at {date}" heading and "Back to today" (H20) | ui |
| `template/src/ui/MapEditor.tsx` | Grid form, preview, apply, layout file | ui |
| `template/src/ui/TraceEditor.tsx` | Drawing surface, keyboard form, backdrop controls, revise tools | ui |
| `template/src/ui/RecordForm.tsx` | One record | ui |
| `template/src/ui/FastEntry.tsx` | Rows beside a page | ui |
| `template/src/ui/ReferencePage.tsx` | The pinned page photo and its controls | ui |
| `template/src/ui/ImportWizard.tsx` | Import steps: file or paste, separator, column match, date order | ui |
| `template/src/ui/screenDraft.tsx` | One draft for each screen that saves: keep, offer again, discard, recovery file (repair 07) | ui |
| `template/src/ui/ImportReview.tsx` | The shared review of an import and of typed rows: counts, row cards, Fix row, conflict choices | ui |
| `template/src/ui/BackupRestore.tsx` | Backup, restore, recovery | ui |
| `template/src/ui/Settings.tsx`, `Help.tsx` | Settings and help | ui |
| `template/src/ui/Status.tsx`, `Dialog.tsx` | Messages with actions, dialogs with focus return | ui |
| `template/src/ui/copy.ts`, `copyScreens.ts` | The foundation catalog and the words of section 5 of the plan, merged into `COPY` | ui |
| `template/src/ui/shellContext.ts` | `RegisterApp`, routes, settings, the shell and register contexts | ui |
| `template/src/ui/messages.ts` | Error and commit codes turned into catalog words | ui |
| `template/src/ui/controls.tsx` | Text, select, check and radio fields, notice, buttons | ui |
| `template/src/ui/plotView.ts` | Plot rows for the screens: code, section, state line | ui |
| `template/src/ui/blobUrl.ts`, `download.ts` | A stored picture as an address, and a file handed to the browser | ui |
| `template/src/ui/register.css`, `print.css` | Layout, themes, motion, print | ui |
| `scripts/generate-fixtures.mjs` | Writes the invented CSV and PNG fixtures | tooling |
| `tests/setup.ts`, `tests/helpers/paperKind.ts`, `tests/helpers/screens.ts`, `tests/host/*` | Test setup, the paper test adapter shared with the browser host, shared browser flows, the host page | test only |

Test helpers: `tests/helpers/paperAdapter.ts` (a tiny adapter of kind `paper` built on the base state, with a Burials sheet, standing in until the churchyard spec), `tests/helpers/measureLayout.ts` (browser measurements), `tests/helpers/paperFiles.ts` (fixture readers and the malformed archive builder), `tests/host/` (a dev host page, its Vite config and entry). Fixtures: `tests/fixtures/paper-200.csv`, `paper-200-bad.csv`, `comma-quotes.csv`, `tiny-page.png`. The template never imports a helper.

Dependencies added: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `fflate`, all exact. The CSV reader is written here and not taken from a package. Reason: the register needs to stop at the first exceeded bound, refuse a stray quote with its row, and keep every cell byte for byte, and a small state machine does that with no package to audit.

## H2 Coordinates

`Point` is `readonly [east, north]`, integers 0 to 10,000. `toScreen(p, view)` gives `[ (x - minX) * scale + padX, height - ((y - minY) * scale + padY) ]`, one flip of north. `fromScreen` inverts it and rounds. `rotatePoint(p, origin, degrees)` uses `Math.round` of the exact rotation, with `Math.cos` and `Math.sin` replaced by exact values at multiples of 90 so that quarter turns carry no error.

Backdrop transform: `{ scale, east, north, turn, opacity }`, scale in percent (1 to 1000), east and north in site units (integers, -10,000 to 10,000), turn 0 to 359 counter clockwise, opacity 0 to 100. Image local point `(u, v)` has u east and v north from the image's bottom left corner. Site point is `rotate(turn) (scale/100 * (u, v)) + (east, north)`. `backdropToSite` returns floats. The image is drawn with an SVG transform string from the same numbers, so what is drawn and what is computed agree. The transform never reads or writes a footprint.

## H3 Grid

```ts
interface GridSpec {
  prefix: string; firstNumber: number; digits: number;
  rows: number; columns: number;
  origin: Point;                 // south west corner of the unrotated grid
  cellWidth: number; cellHeight: number;
  columnSpacing: number; rowSpacing: number;
  numbering: "across" | "down";
  startRow: "north" | "south";   // the row numbered first
  startColumn: "west" | "east";  // the column numbered first
  reverseAlternate: boolean;     // second row (or column) runs the other way
  rotation: number;              // degrees about origin
  skip: { row: number; column: number }[]; // 1 based, counted from the start corner
}
```

Order. Rows and columns are counted from the start corner, so row 1 is the `startRow` side. With numbering across, plots are numbered along row 1 from the start column, then row 2, and so on. With numbering down, they are numbered down column 1, then column 2. With `reverseAlternate`, every second line runs the other way. A place's number is `firstNumber + index` where index counts every place including skipped ones, so a skipped place leaves a gap and the other numbers stay put.

Geometry. Cell (r, c) in site units, before rotation: west edge `origin.x + colIndex * (cellWidth + columnSpacing)`, south edge `origin.y + rowIndex * (cellHeight + rowSpacing)`, where `colIndex` and `rowIndex` count from the west and south sides whichever corner numbering starts at. Corners are computed from one function of the lattice corner so that two cells that share an edge compute the same float and round to the same integer. Rotation turns each exact corner about the origin before rounding. Any plot with a rounded corner outside 0 to 10,000 is refused, named by code.

`formatCode(prefix, n, digits)` is `prefix + String(n).padStart(digits, "0")`. A code over 24 characters is refused with `over_limit` on `plotCodeChars`.

`parseSkips(text, rows, columns)` reads items separated by comma or semicolon. An item is `rows/columns`, each a number, a range `a-b` or `*`. `10/20` is one place, `9-10/19-20` a block, `1/*` a whole row. It refuses a number outside the grid.

`planGrid(spec, existing)` returns `{ plots, count, first, last, added, retained, moved, skipped, collisions }`. `existing` is a list of `{ plotId, code, priorCodes, sectionId, sectionName, footprint? }` and the section being planned is `{ sectionId, name }`. A planned plot is retained when an existing plot has the same section and a code that equals it by `normalizeCode`, and its footprint is equal or missing. It is moved when the footprint differs (a proposal only). It collides when the code belongs to another section (current or prior). `gridCommand(plan, section, ids)` turns the added plots into a `layout_apply` command with IDs from the injected `newId`. A moved plot is never put in a command unless the caller passes it in `approvedMoves`.

`planRenumber(plots, { prefix, firstNumber, digits })` lists `{ plotId, from, to }` in current code order. `renumber_plots` applies the list one rename at a time on a copy of the state and refuses the whole batch on the first refusal, so no old code is ever reused.

## H4 Geometry

All tests use exact integer arithmetic on coordinates up to 10,000, so no cross product exceeds 2e8 and no tolerance is needed for crossing tests.

- `orient(a, b, c)` is the sign of the cross product.
- `segmentsRelation(p1, p2, q1, q2)` returns `none`, `touch` (they share points but do not cross), `cross` (a proper crossing at one interior point of both) or `overlap` (collinear and sharing a stretch).
- `checkPolygon(points)` order: count below 3, count above 256, bad coordinate, equal adjacent points (including last and first), zero area, then self crossing. Self crossing: any two non adjacent edges are not `none`, and adjacent edges are `overlap` only when they fold back on each other. A vertex that touches another edge is a self crossing.
- `polygonArea2` is twice the signed area, as an integer.
- Sub segments. For an edge of A, the points where it meets B's edges and B's vertices split it into sub segments. Each sub segment's midpoint is tested against B as `inside`, `outside` or `on`. A sub segment is `on` when its edge is collinear with a B edge (an exact test) and the midpoint is inside that B edge's extent. Otherwise inside and outside use the crossing number with the half open rule.
- `polygonsOverlap(a, b)`: true when any sub segment of A is inside B, any sub segment of B is inside A, or every sub segment of both is on the other's boundary (equal footprints). This is exact for simple polygons because two simple polygons whose interiors meet either have a boundary inside the other or are equal.
- `polygonInside(inner, outer)`: true when no sub segment of `inner` is outside `outer`.
- `pathCrossings(path, footprints)`: every footprint with a sub segment of a path edge inside it.
- `pointHolder(point, footprints)`: the footprint that holds the point strictly or at a corner of nobody else, and nothing for a point on an edge shared by two footprints.
- A bounding box test runs first so 2,000 footprints stay fast.

## H5 Map state, events and layout commands

```ts
interface MapState {
  sections: Record<Uuid, { sectionId: Uuid; name: string; displayOrder: number; outline?: Point[] }>;
  shapes: Record<Uuid, Point[]>;                 // plotId to footprint
  paths: Record<Uuid, { pathId: Uuid; name: string; points: Point[] }>;
  gate?: { name: string; at: Point };
  north: number;                                  // whole degrees, 0 is up
  mapVersion: number;                             // count of geometry events
  backdrop?: { blobId: Uuid; transform: BackdropTransform; locked: boolean; hidden: boolean };
}
```

Events: `section_added`, `section_changed`, `shapes_set`, `shape_moved`, `path_set`, `path_removed`, `gate_set`, `north_set`, `backdrop_set`, `backdrop_changed`, `backdrop_removed`. Every geometry event raises `mapVersion` by one. Backdrop events do not.

```ts
type LayoutCommand =
  | { type: "layout_apply"; sections?: SectionInput[]; plots?: NewLayoutPlot[]; moves?: { plotId; footprint }[];
      paths?: { pathId; name; points }[]; gate?: { name; at }; north?: number }
  | { type: "renumber_plots"; renames: { plotId; code }[] }
  | { type: "set_backdrop"; blobId; transform }
  | { type: "change_backdrop"; transform?; locked?; hidden? }
  | { type: "remove_backdrop" };
```

`decideLayout(state: { core, map }, command, effectiveOn, ctx)` is pure. For `layout_apply` it works on a working copy and runs in this order: sections (limit 100, names 1 to 100 characters, no duplicate name), outline checks, new plots (each through `decideCore` `add_plot` on the working copy, so code and limit rules are the core's), footprints (polygon check, inside the section outline if it has one, no overlap with any other footprint), moves (the plot must exist, same checks), paths (path check, no crossing of any footprint of the final set), gate, north. On the first failure it returns the error with no event. The error detail names the plot code or object.

A section outline change checks every existing plot of that section that has a footprint: a footprint outside the new outline refuses the change with `outline_excludes_plot` and the codes.

Core events in the batch come first for each plot, then map events, so replay gives the same state at each step. A command with an existing plot ID in `plots` is refused with `plot_exists`.

Drafts. `ShapeDraft` is `{ points: Point[] }`. `draftAdd`, `draftUndo`, `draftCancel` return new drafts and touch nothing else. `draftClose(draft, type)` runs the polygon or path check and returns a typed error with the plan's words as codes (`too_few_points`, `self_crossing`).

## H6 Layout file

`plot.layout.v1`:

```
{ format: "plot.layout.v1", north: int 0..359,
  gate?: { name, at: [x, y] },
  sections: [{ ref: string, name, outline?: [[x,y]...] }],
  plots: [{ section?: ref, code, footprint?: [[x,y]...] }],
  paths: [{ name, points: [[x,y]...] }] }
```

Closed at every level (Zod `.strict()`). `ref` is a label local to the file. `parseLayoutFile(text)` checks the discriminator first, then the version (`plot.layout.v2` and above say "This file needs a newer version."), then the structure. `buildLayoutFile(map, plots)` takes section, plot code and footprint data only and never reads the backdrop or any private field.

`planLayoutImport(file, current, ctx)` returns `{ added, retained, conflicts, command? }`. For a site with no sections, no plots and no gate (new) it adds everything with IDs from `newId`. Otherwise it matches sections by `normalizeCode` of the name, plots by section and code, paths by name. Conflicts are `footprint_differs`, `code_in_other_section`, `outline_differs`, `gate_differs`, `north_differs`, `path_differs`, each with the code or name. Any conflict returns no command. A repeat finds everything retained and returns no command (`nothing_to_add`).

## H7 Sheet

`buildSheet(input, options)` returns a model in pixels:

```ts
interface SheetModel {
  width: number; height: number; scale: number; empty: boolean;
  plots: { plotId; code; points: [number, number][]; mark: Mark; selected: boolean; label?: Label }[];
  sections: { sectionId; name; points?: [..][]; label: Label }[];
  paths: { pathId; name; points: [..][]; label: Label }[];
  gate?: { name; x; y; label: Label };
  north: { x; y; degrees };
  tab?: { code; x; y; width; height };
  key: { state: "free" | "reserved" | "taken" | "unusable" | "checking"; word: string }[];
  backdrop?: { blobId; transform: string; opacity: number };
}
```

Fit. The bounds of every footprint, outline, path and the gate, with a padding of 24 px plus label room, fit to `width` and the zoom. `height` follows the aspect with a floor. All font sizes are real pixels: 12 for section, path and gate labels, 14 for the tab. A plot code label is drawn only when the plot's width and height on the sheet are at least 40 px. The selected plot gets a double outline and its tab. The model has no backdrop when `options.backdrop` is false. The screen and the print page call the same function with different widths.

## H8 Notes and base state

`notes.ts` events: `note_added { noteId, plotId, text }`, `photo_added { photoId, plotId, blobId, imageType, width, height, bytes, caption: {text} | {pending: true}, pageRef? }`, `photo_removed { photoId }`. State `notes: Record<plotId, { notes: Note[]; photos: Photo[] }>` where a removed photo is marked `removed: true` and stays in the list. Commands `add_note`, `add_photo`, `remove_photo`. Limits: text 4,000, 8 live photos per plot.

`base.ts`:

```ts
interface BaseState { core: CoreState; map: MapState; notes: NotesState }
type BaseCommand = CoreCommand | LayoutCommand | NoteCommand;
type BaseEvent = CoreEvent | MapEvent | NoteEvent;
emptyBase(siteId); applyBase(state, event): BaseState | undefined; decideBase(state, command, on, ctx); validateBase(...)
```

An adapter state is `S extends BaseState`. `applyBase` returns undefined for an event it does not know, so the adapter can handle its own. `decideBase` for a command it does not know returns the code `unknown_command`.

## H9 CSV reading and writing

`readCsvBytes(bytes)` strips one BOM, decodes with `TextDecoder("utf-8", { fatal: true })` and returns text or `not_utf8`. `parseCsv(text, { separator })` is a state machine over code points with one pass:

- States: field start, in unquoted, in quoted, after quote. A quote at field start opens a quoted field. A quote inside an unquoted field is `stray_quote`. Any character other than separator or line end after a closing quote is `text_after_quote`. End of input inside quotes is `unclosed_quote`. A doubled quote inside quotes is one quote.
- Line ends: CRLF, LF and CR. A final line end adds no row. A line that is one empty field is a blank line and is skipped, and the row numbers still count the file's data rows in order.
- Bounds are checked as characters are read: bytes before decoding, cell characters (code points) as a cell grows, columns as a row grows, data rows as a row ends. The first exceeded bound stops the read with `{ item, limit, value, row }`.
- Every data row must have as many cells as the heading row, or the read stops with `row_width` and the row number.
- The result is `{ headings: string[], rows: string[][], separator }`.

`detectSeparator(text)` counts the two characters outside quotes in the first line. If only one occurs, it is chosen. If both occur, it parses the first 5 rows each way. If exactly one way gives equal widths of at least 2 for every row, it is chosen. Otherwise the answer is `unclear` and the screen shows `preview(text, sep)` for both. If neither occurs, the file has one column and comma is used.

`escapeCell(value)` and `toCsv(headings, rows)` follow P10. The BOM is written once at the start.

## H10 Mapping

`normaliseHeading(text)` is NFD, accents removed, lower case, with everything but letters and digits removed. `suggestMapping(headings, fields)` pairs a heading with a field whose normalised label equals it, with a short alias list for the common words (`reference` and `ref` for the source ref). `buildMapping(headings, fields, choice)` checks P8.2 and P8.3 and returns `{ columns: { index, fieldKey | undefined }[] }`. `applyMapping(table, mapping, fields, options)` returns `MappedRow[]` with `rowNumber` (the data row number from 1), `cells` keyed by field key with the exact original text, and `errors: CellError[]`.

```ts
interface CellError { row: number; field: string; heading: string; value: string; code: string; fix: string }
```

Cell checks by field type: `required` (blank), `over_limit` (`maxChars`, 4,000 for notes, in code points), `date` (`parseDateEntry` with the import's order, so `date_ambiguous`, `date_year_needed` and `invalid_date` are kept as codes), `money` (`parseMoney`, blank is unknown), `choice` (one of the listed choices). The `fix` is a code that the screen turns into words, for example `enter_value`, `use_year_first`, `choose_date_order`, `use_two_decimals`.

## H11 Staged import

```ts
interface SheetImporter<S, C extends { type: string }, X = unknown> {
  sheet: string;                                   // equals a SheetDef name
  sourceRefField: string;                          // field key
  prepare(state: S, options: ImportOptions): X;    // build lookups once
  existing(ctx: X): ReadonlyMap<string, { recordId: string; normalized: Record<string, string> }>;
  stageRow(cells: Record<string, string>, ctx: X): RowOutcome<C>;
  correct(args: { recordId; sourceRef; before; after; cells }, ctx: X): RowOutcome<C>;
}
type RowOutcome<C> =
  | { ok: true; placement: "placed" | "unplaced"; normalized: Record<string, string>; recordId: string; commands: C[] }
  | { ok: false; errors: CellError[] };
```

`stageImport({ register, importer, mappedRows, state, siteId, baseRevision, effectiveOn, options })` returns a `StagedImport`. For each row in file order: cell errors from mapping, then source ref presence, then duplicate in file, then `stageRow`, then comparison with `existing`: equal normalised cells give `unchanged`, different gives `conflict` with `before` and `after`, absent gives `ready` or `unplaced`. Equality compares normalised cells key by key, with the source ref compared by exact text. A row staged `ready` or `unplaced` or a conflict with the choice `record_correction` then dry runs its commands on the evolving state with `register.run`, and any refusal becomes a row error with the domain code and detail (`space_taken` names the other source ref). Rows are keyed by `rowNumber` only for display and by `(sheet, sourceRef)` for identity.

Row status: `ready`, `unchanged`, `unplaced`, `conflict`, `error`, `left_out`. Counts follow P9.1: a conflict with the choice `keep_current` counts as unchanged, one with `record_correction` counts as ready or unplaced by its placement, and an unresolved one counts as a conflict. A left out row counts only as left out. The sum of the six counts is the row count.

Actions return a new `StagedImport` after re running every row from the first changed one: `fixRow(staged, rowNumber, cells)`, `leaveOut(staged, rowNumber, reason)`, `restoreRow`, `chooseConflict(staged, rowNumber, choice)`. `leftOutCsv(staged)` writes the refs and reasons with `toCsv`. `buildSourceRef(book, page, entry)` joins non empty parts with `/` and refuses an empty result.

`canCommit(staged)` is true when no error and no unresolved conflict remain and at least one row writes. `commitImport(db, staged, { opId, now?, newId? })` builds the batch from the selected rows in file order and calls `commit` once with: `commands` (the commands, with IDs fixed at staging so a repeat hashes equally), `events` (the drafts of the dry run), `uniqueKeys` from `uniqueKeysFor`, and the site's `baseRevision` as `expectedRevision`. The drafts come from the final dry run, so what was previewed is what is written. A stale revision returns `stale_revision` and keeps the staged rows.

`uniqueKeysFor(drafts)`: `plot_added` gives `code:<normalised>` owned by the plot ID with the section name as label when known, `plot_renamed` gives the new code, and any event with a top level `sourceRef` and a payload string `sheet` gives `source:<sheet>:<exact ref>` owned by the first entity ID. It reads stored events the same way for restore.

## H12 Fast entry

`EntrySession { rows: EntryRow[]; currentRow: number; currentField?: string; page: { index: number; zoom: number; rotation: number }; keepPage: boolean; pageChosen: boolean }`. `EntryRow { rowId; cells; saved: boolean }`. Pure functions return a new session. `repeatSection` and `repeatPage` copy the fields the adapter marks `repeatable` (a new optional `FieldDef.repeatable`). `fillPlotSequence` uses a trailing digit run and keeps its width. `pasteCells(session, text, startField, fields)` reads tab separated text with the CSV reader (separator tab, quotes allowed). Zoom steps are 0.25 from 0.5 to 4, rotation steps 90.

`rowsToMapped(session, fields)` gives the `MappedRow[]` the importer takes, with `rowNumber` from 1 in screen order. `toDraft` and `fromDraft` use the `Draft` of spec 01. `parseDraftFile(text)` checks the discriminator, the version and the shape and never touches storage.

## H13 Images

Signatures: PNG `89 50 4E 47 0D 0A 1A 0A` and an `IHDR` chunk, JPEG `FF D8 FF` and a start of frame marker (`C0` to `CF` except `C4`, `C8`, `CC`), WebP `RIFF....WEBP` with a `VP8 `, `VP8L` or `VP8X` chunk. `inspectImage(bytes)` returns `{ imageType, width, height, orientation }` or an error: `unsupported_type`, `unreadable`, `over_limit` for `photoBytes` or `photoMegapixels`. It reads only headers. Orientation comes from the EXIF segment of a JPEG, 1 to 8, default 1.

`ImageCodec { decode(bytes, imageType, orientation): Promise<DecodedImage>; encode(image, imageType, width, height): Promise<Uint8Array> }`. `normalizeImage(bytes, codec)` inspects, decodes with the orientation applied, picks the output size by `fitLongEdge(width, height, 2400)` (swapped for orientations 5 to 8), encodes (JPEG stays JPEG, WebP stays WebP, PNG stays PNG), then runs `findMetadata` on the result and `stripMetadata` if anything is found. `findMetadata` knows: JPEG segments APP1 to APP15 other than the colour profile APP2 `ICC_PROFILE` (also dropped, as it can name a device), and COM; PNG chunks `tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME`, `iCCP`; WebP chunks `EXIF`, `XMP `, `ICCP`. `normalizeAll(files, codec)` awaits one file at a time. `browserCodec` uses `createImageBitmap` with `imageOrientation: "from-image"` and `OffscreenCanvas` when present, else a canvas element.

`attachPhoto(list, photo)` refuses at 8 live photos. `checkCaption` needs text or `pending`. `replacePhoto(old, newBytes, codec)` returns the old photo untouched on any error. The stored photo object holds no file name.

## H14 Backup and restore

Archive entries: `manifest.json`, `site.json`, `events.json`, `images/<blobId>.<jpg|png|webp>`. Manifest:

```
{ format: "plot.backup.v1", schemaVersion: 1, siteKind, siteId, lineageId, revision, createdAt,
  entries: [{ path, byteLength, sha256 }], counts: { events, images } }
```

`site.json` holds the `Site` row without `lastSeq`. `events.json` holds `StoredEvent[]`. Zip bytes come from `fflate.zipSync` with a fixed time so the same register gives the same bytes.

`verifyBackup(bytes, { kind, migrations })` order, stopping at the first failure:

1. Size over 128 MiB: `over_limit`.
2. `classifyFile` on the bytes: not a zip gives `wrong_file` with the file type found (`visitor`, `review`, `slip`, `layout`, `draft`, `csv`, `unknown`).
3. `unzipSync` with a `filter` that sees every central directory entry before inflating: counts entries, sums declared sizes, rejects a repeated name, an unsafe name (a drive letter, a leading slash, `..`, a backslash), and a name outside the allowed list, and refuses declared totals over 160 MiB decoded, 5,000 images or 96 MiB of images.
4. Parse the manifest. Newer `schemaVersion` or a `plot.backup.v2` or later format gives `newer_version`.
5. Every manifest entry exists, with the right byte length and SHA 256. An entry not in the manifest is refused.
6. Migrate with the migration list for older versions.
7. Parse `site.json` and `events.json` strictly. Check the site ID and kind against the manifest, the sequence 1..n, duplicate event IDs, the batch count equal to `revision`, and that every `blobId`, `blobIds` and `imageRefs` value in an event payload names an image entry.

Failures map to the codes `over_limit`, `wrong_file`, `newer_version`, `corrupt`, `wrong_kind`. `corrupt` covers every damage case and the screen shows "This backup is incomplete. Your register is safe."

`compareLineage(currentEvents, backupEvents)` returns `same`, `forward` (the current events are a prefix of the backup's), `backward` (the backup's are a prefix of the current ones, shorter) or `fork` (they differ at some `seq`), comparing event IDs.

`restoreBackup(db, verified, options)` modes:

- `new`: a new site ID, new event IDs (with `corrects` remapped), a new `siteKey`, every other field kept, and `forked` true when a site with the same lineage is already in the database.
- `replace`: needs `currentSiteId`, `typedTitle`. Refuses `foreign_site` unless the site ID and lineage both equal the backup's, and `title_mismatch` unless the typed name equals the stored title after trimming. The exchange key is rotated when the lineage comparison is `backward` or `fork`.

The write is one `readwrite` transaction over `sites, events, uniqueKeys, blobs, operations, indexes, drafts, imports`. For `replace` it deletes the old rows of that site first, in the same transaction. A failure or abort undoes all of it. This is the staged write: nothing is visible before `complete`, and the active register is the one the site row names. The operation record of the restore is not stored.

`classifyFile(bytes)` returns `backup` (zip signature with a manifest entry that has the backup discriminator), `zip`, `visitor` (text with a `plot.family.v1` or `plot.availability.v1` marker), `review`, `slip`, `layout`, `draft` (JSON with that `format`), `csv` or `unknown`. It never reads a file name.

## H15 Site admin

`readBlob(db, siteId, id)` and `readBlobs(db, siteId)`. `removeSite(db, siteId)` deletes every row with that `siteId` from every store, in one transaction, and returns counts. `setSiteZone(db, siteId, zone)` checks the zone and rewrites the site row, leaving `revision` and `lastSeq` alone.

## H16 Shell

`RegisterApp<S, C, E>` is what an app entry passes to `RegisterShell`:

```ts
interface RegisterApp<S extends BaseState, C extends { type: string }, E extends { type: string }> {
  adapter: RegisterAdapter<S, C, E>;
  title: string;
  importers: readonly SheetImporter<S, C, any>[];
  records(state: S): { plotId?: Uuid; name: SearchName }[];   // names to search; no plotId means "Location to confirm"
  factory?: IDBFactory;                                       // default: the browser's
  now?: () => Date;                                           // a fixed clock in tests
  newId?: () => string;
}
```

The adapter's `commands` list must hold `BASE_COMMAND_TYPES` and its `decide` must call `decideBase` for them. Words come from `COPY`. `adapter.labels` may replace a word by its key.

Routes (hash): `#/` library, `#/new`, `#/settings`, `#/help`, `#/r/<siteId>` home, `/map`, `/list`, `/plot/<plotId>`, `/map/edit`, `/map/trace`, `/add`, `/add/one`, `/add/fast`, `/add/import`, `/backup`, `/restore`, `/settings`, `/help`. The filter and the selected plot live in the hash query (`?state=`, `?plot=`) so that Back keeps them. The search text never goes in the address: it lives in `history.state` as `{ q }` beside `scrollY`. `navigate(to, { search })` pushes an entry with that state, a click on a link that must keep the search goes through `keepSearch`, and an address that carries `q` is not read as a search (R22.4). The query never holds a private value. Scroll position is saved in `history.state` on leave and restored on return.

`useLoaded(siteId)` opens the site row, reads the events, replays with `register.replay`, and holds `{ site, state, events, revision }`. `dispatch(commands, options)` runs each command with `register.run` on an evolving state, builds the drafts, calls `commit` with `uniqueKeysFor`, then updates the state, or maps the failure to `Status`. The operation ID of an intent is minted when the intent starts and reused for a retry. While a commit is in flight, `dispatch` returns the same promise for a repeat press.

The shell writes data attributes on `<html>`: `data-motion` (`follow` or `reduce`), `data-contrast` (`standard` or `high`), `data-theme-ink`, set as CSS variables from `adapter.theme`. Settings live in `localStorage` under the one key `plotwarden.settings` and hold only those three choices and the paper size.

## H17 Layout and style

`register.css` rules, all checked by `measureLayout`:

- The page has a 16 px side padding. Blocks stack with a 12 px gap. Every `a`, `button`, `input`, `select`, `textarea` and `summary` has `min-height: 44px` and `min-width: 44px`. Check boxes and radio buttons are 44 by 44 px. A block of links is a column. Text links in sentences are not used.
- Body text and inputs are 16 px, labels 14 px, nothing below 12 px. SVG text is drawn at real pixel size.
- Ink and paper come from the theme: ink `#22252C` on `#FAF5E9` for the churchyard, ink `#1B312A` on `#F7F5E8` for the garden, and the test host uses the churchyard colours. Muted text `#4A4D55` on that paper is 6.9 to 1. The focus ring is a 3 px outline in the ink colour with a 2 px offset. High contrast uses `#000000` on `#FFFFFF`.
- The mist is a decorative strip in the header margin, never over text. It is drawn only when motion is allowed and contrast is standard.
- Wide content (the sheet when zoomed) sits in a scroll region with a tab stop, a 16 px inset and no controls inside. The page itself never scrolls sideways.
- `print.css` hides the header, navigation, forms and buttons, shows the sheet, the key, the "As at" line and the code index, and sets the sheet to fit the page.

## H18 Test plan

Unit tests follow `tasks.md`. Property tests (1,000 cases each, recorded seeds) in `tests/properties/geometry.test.ts`: a generated grid has distinct codes and no overlapping footprints, rotation by 90 degrees keeps the plot count, `polygonsOverlap` is symmetric, a polygon never overlaps its own translate by its width, a shape that passes `checkPolygon` has positive area, and the CSV writer and reader round trip any text. Browser specs run headless Chromium, one worker, at 360 by 640 and 1920 by 1080. The host is built with Vite and served by `vite preview` on `127.0.0.1:4175` with a strict port, started and stopped by the Playwright config. Every browser test logs every request and expects none outside the host origin. `measureLayout` reports each failure with the element, its rectangle and the rule.

For the red step, each module first exists as a stub with its final exports that throw "not implemented". A browser spec is red when the host renders the stub shell and the first assertion on a real control fails.

## H19 Names on the sheet

Problem seen: a name had a place cost of zero only when it touched nothing, but a plot counted as a "soft" box that cost 5 plus a fifth of the overlap area. A label with no clear place was kept in place at 300 px and wider, so the path name and the gate name were drawn on the stones, and the tab of the selected plot sat at the top left corner, far from its plot.

`template/src/map/labels.ts`:

- `Scene.plots?: Box[]` is new. Each box is kept 2 px clear (`PLOT_GAP`). A place that overlaps one costs `PLOT_COST` (600) plus 20 for each square pixel, so it costs more than any line shortfall and more than `CAPTION_COST`. `Scene.soft` stays for the visitor maps, which do not use captions.
- `CAPTION_COST` is 1. A caption costs this much. A place that costs this much or more loses to the caption. Every term of `cost` gives at least 1 for any shortfall above 0.05 px, so only a clear place wins.
- `bestSpot` is unchanged: first clear place, else the cheapest.

`template/src/map/sheet.ts`:

- `place` writes a caption whenever the best place costs `CAPTION_COST` or more, at every width. `NARROW_SHEET` is removed.
- The scene for names holds the plot boxes in `plots`. Plot codes inside plots stay in `hard`.
- Section names keep `GATE_CLEAR` (8 px) from path lines, as the gate name already did, and 3 px from the outline of another section. A path keeps `OWN_LINE_CLEAR` (4 px) from its own line.
- A path whose name equals the name of a section that has an outline has no `label` in the model (`label` is optional on a path). The section label is the one written. The path still lists its name for a reader.
- The tab is placed before any name. `placeTab` tries the four sides of the selected plot box (above, below, left, right) in that order. Above and below it tries the middle, each end and a place 6 px in from each end. Left and right it tries the middle and each end. A place is clear when it touches the box on one side, overlaps no other plot box, the north arrow box, the gate mark or a path line (8 px), and lies inside the margin of the sheet. The first clear place wins. When none is clear the place with the least overlap wins. A place below the plot is clear even when it lies past the bottom edge, and the sheet grows by what it needs (`height` grows, `view` and every point stay where they were). The captions start below the lowest of the drawing and the tab.
- `spotsAlongTop` takes the heights above the edge to try. A section name tries 4 px and then 7 px above the top edge of its outline, because an outline that shares its top edge with the plots leaves a 4 px baseline only 1 px from them.
- `SheetSvg` writes `data-kind` on each `text`: `gate`, `section`, `path`, `plot` or `tab`. The tests use it to tell a name from the code of a plot inside its own plot. It holds no private value.

Tests: `sheet.test.ts` builds Lantern Fold and Thimble Beds at 312, 328, 360, 480 and 1120 px, and sweeps 300 to 1200 px, and measures every box with its own estimate of a letter (7.4 px at 12 px). `measureLabels.test.ts` holds the cost order and the browser rule `label_on_plot` on plain data. `layout.spec.ts` reads the real box of every `svg` text on the map and home routes and finds no overlap with a plot shape. Three older checks changed with P19, and each is named in `docs/kiro-log.md`: the exact place of a section name above an outline that shares its top edge with plots, the rule that every name stays in place from 320 px up, and the path name that was written twice.

## H20 The site as it was on a date

Problem. `plotSummaryAt` takes a date, but every screen passed today, and a burial dated by a year or a month stores a claim with no start (`claimStartOf` in `apps/churchyard-register/src/rules.ts`). `viewOf` in `template/src/status.ts` reads such a claim as in force on every date, so Y07 as at 1900 would show two spaces used although the second burial is of 1921.

Foundation (pure).

- `type ClaimFloor = (claim: Claim) => LocalDate | undefined` in `status.ts`.
- `claimsInForce(state, spaceId, date, floor?)` returns the claims on a space that are not voided and cover the date. A claim with a start uses its start. A claim with no start uses `floor(claim)` when `floor` is given and answers a day, and covers every date when it does not. The end is always the claim's own end. `viewOf` is built on it, so a state is read one way.
- `plotSummaryAt(state, plotId, date, floor?)` and `spaceStateAt(state, spaceId, date, floor?)` take the same optional last argument. `siteTotalsAt` is not changed.
- `RegisterAdapter.claimFloor?(state: S, claim: Claim): LocalDate | undefined` in `adapter.ts`. Absent means no claim has a floor. The template never reads `kind`.

Churchyard. `claimFloorOf(state, claim)` in `rules.ts` reads `state.burials[claim.ref]`. It returns `coveredInterval(burial.date)?.first`, which is the first day of the year or the month and nothing for an unknown date. The adapter lists it as `claimFloor`. A date correction voids the old claim and adds a new one (`correctBurial`), and the burial holds the current date, so the floor follows current corrections. The allotment adapter has no function: a tenancy always has a start.

Screens.

| File | Change |
|---|---|
| `template/src/ui/plotView.ts` | `plotRows(open, t, date?, floor?)`. `date` defaults to `open.today`. The floor is used only when `date` is before `open.today`. `readAsAt(text, today)` returns the date or a message key (`invalidDate` or `asAtLater`). `asAtOf(query, today)` reads `asAt` from the route and returns a date before today or nothing. `claimFloorOf(app, state)` wraps the adapter function for one state. |
| `template/src/ui/AsAtField.tsx` | New. `AsAtField` (the field, its message and "Back to today") and `AsAtHeading` (the "As at {date}" heading). On the map the heading sits above the sheet and the field sits below the key, so the sheet stays within 360 px of the top on a phone for the view of today (R23.6). On the plot list both sit under the links. It takes the view date, today and a `change(date | undefined)` callback, and keeps the typed text apart from the view date so a half typed date shows no message and moves nothing. The field sits in a form, so Enter shows the message at once. |
| `template/src/ui/SiteMap.tsx`, `PlotList.tsx` | Read `asAt` from the route, pass the date and the floor to `plotRows`, show `AsAtField`, and carry `asAt` on links to the other of the two screens and on their own filters and chooser. Links to a plot, the map editor and every form carry nothing. The print block writes the view date. |
| `template/src/ui/copyScreens.ts` | `showSiteAsAt`, `asAtHint`, `asAtLater`, `backToToday`. The heading uses the existing `asAt`. `invalidDate` is the foundation's. |

The view date lives in the hash query as `asAt` so that reload and Back keep it. A date change calls `navigate` with no `replace` and with the route's own search text, so each valid date is one history entry that keeps the search in `history.state`, Back returns to the earlier date, and the address never holds the search. `AsAtField` follows the address, so Back, Forward and "Back to today" change the text in the field. A typed date that is today removes `asAt`. A date change is one address change and writes nothing.

Tests (`tests/unit/asAt.test.ts`): Lantern Fold as at 1900-01-01 reads `Y07` as "Taken · 1 of 2 spaces used", as at 2026-04-20 as "Taken · 2 of 2 spaces used"; the year and the month rule with their first days and the day before; a burial with no date counts at every date; a garden where B02 was handed over on 2026-05-01 names the earlier tenancy on 2026-04-30 and the new one on 2026-05-01; `readAsAt` accepts today and an earlier day and refuses a later day, a text that is not a date and an empty text; a call with no floor reads a claim with no start as before. The browser specs type a date, read the summary line and the marks, press "Back to today", and read the address and the history entry for any name. `layout.spec.ts` measures a past view of the map route and keeps its picture.

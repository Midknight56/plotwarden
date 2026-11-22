// Lantern Fold: an invented churchyard for practice. Its people, plots, inscriptions and notes were made
// for this project. It is built from commands at a fixed date, in its own workspace, so it never touches a
// register of the keeper's own. The numbers match tests/fixtures/expected/hand-totals.md sections 1 and 4.
import type { Walkthrough } from "../../../template/src/data/seed";
import type { Point } from "../../../template/src/map/coordinates";

const TODAY = "2026-04-20";

const CODES = Array.from({ length: 12 }, (_, i) => `Y${String(i + 1).padStart(2, "0")}`);

/** Y01 to Y06 sit south of Yew Walk, Y07 to Y12 north of it. */
function footprint(index: number): Point[] {
  const x = 1000 + (index % 6) * 1100;
  const y = index >= 6 ? 2900 : 1200;
  return [
    [x, y],
    [x + 900, y],
    [x + 900, y + 1100],
    [x, y + 1100],
  ];
}

const INSCRIPTION = ["IN LOVING MEMORY", "MIREL QUILLMOSS", "OF HOLLOWMERE", "KEEPER OF THE LANTERN FOLD", "REST IN PEACE"].join("\n");

interface Burial {
  ref: string;
  code?: string;
  space?: number;
  name?: string;
  date: { p: "unknown" } | { p: "year"; y: number } | { p: "month"; y: number; m: number } | { p: "day"; y: number; m: number; d: number };
  dateText: string;
}

const BURIALS: Burial[] = [
  { ref: "LF-01", code: "Y01", name: "Edda Thornwick", date: { p: "year", y: 1871 }, dateText: "1871" },
  { ref: "LF-04", code: "Y04", name: "Harlan Mossgrove", date: { p: "month", y: 1902, m: 3 }, dateText: "March 1902" },
  { ref: "LF-05", code: "Y05", date: { p: "unknown" }, dateText: "" },
  { ref: "LF-06", code: "Y06", name: "Ysolde Fenwick", date: { p: "day", y: 1938, m: 11, d: 14 }, dateText: "14 November 1938" },
  { ref: "LF-07A", code: "Y07", space: 1, name: "Mirel Quillmoss", date: { p: "day", y: 1889, m: 6, d: 2 }, dateText: "2 June 1889" },
  { ref: "LF-07B", code: "Y07", space: 2, name: "Torin Pellwick", date: { p: "year", y: 1921 }, dateText: "1921" },
  { ref: "LF-09", code: "Y09", name: "Corwin Aldersey", date: { p: "year", y: 1955 }, dateText: "1955" },
  { ref: "LF-H1", name: "Perrin Gladwyn", date: { p: "year", y: 1790 }, dateText: "1790" },
];

/** The one search that the practice register offers to try. It finds the burial of Mirel Quillmoss in plot Y07. */
export const LANTERN_EXAMPLE = "Quillmoss";

export const lanternFold: Walkthrough = {
  siteTitle: "Lantern Fold",
  zone: "Europe/London",
  today: TODAY,
  startedAt: "2026-04-20T09:30:00.000Z",
  batches(newId) {
    const ids = new Map<string, string>();
    const id = (name: string): string => {
      let value = ids.get(name);
      if (value === undefined) {
        value = newId();
        ids.set(name, value);
      }
      return value;
    };
    const plot = (code: string): string => id(`plot:${code}`);
    const space = (code: string, n = 1): string => id(`space:${code}:${n}`);
    const section = id("section:yew");

    const layout = {
      type: "layout_apply",
      sections: [
        {
          sectionId: section,
          name: "Yew Walk",
          outline: [
            [600, 800],
            [7800, 800],
            [7800, 4400],
            [600, 4400],
          ],
        },
      ],
      plots: CODES.map((code, i) => ({
        plotId: plot(code),
        code,
        sectionId: section,
        spaces: Array.from({ length: code === "Y07" ? 2 : 1 }, (_, n) => ({ spaceId: space(code, n + 1) })),
        footprint: footprint(i),
      })),
      paths: [
        {
          pathId: id("path:yew"),
          name: "Yew Walk",
          points: [
            [700, 2600],
            [7600, 2600],
          ],
        },
      ],
      gate: { name: "Main gate", at: [500, 2600] },
      north: 0,
    };

    const empty = { type: "confirm_empty", spaceIds: ["Y02", "Y03", "Y08", "Y10", "Y11", "Y12"].map((code) => space(code)) };

    const burials = BURIALS.map((b) => ({
      type: "record_burial",
      burialId: id(`burial:${b.ref}`),
      sourceRef: b.ref,
      ...(b.name === undefined ? { nameUnknown: true } : { recordedName: b.name }),
      date: b.date,
      dateText: b.dateText,
      ...(b.code === undefined ? {} : { plotId: plot(b.code), spaceId: space(b.code, b.space ?? 1), claimId: id(`claim:${b.ref}`) }),
    }));

    const holds = [
      {
        type: "record_reservation",
        reservationId: id("reservation:1"),
        holderId: id("holder:1"),
        holderName: "Odalys Fennimore",
        spaceId: space("Y02"),
        claimId: id("claim:r1"),
        start: "2025-09-01",
        sourceRef: "LF-R1",
      },
      {
        type: "record_reservation",
        reservationId: id("reservation:2"),
        holderId: id("holder:2"),
        holderName: "Wren Ashgrove",
        contact: "wren.ashgrove@example.invalid",
        spaceId: space("Y11"),
        claimId: id("claim:r2"),
        start: "2026-02-14",
        sourceRef: "LF-R2",
      },
      { type: "add_claim", claimId: id("claim:y12"), spaceId: space("Y12"), mode: "unusable", start: "2026-01-05", endable: true, reason: "Ground unsafe" },
    ];

    const stone = [
      { type: "save_reading", memorialId: id("memorial:mirel"), burialId: id("burial:LF-07A"), reading: INSCRIPTION, unclear: true, pageRef: "Lantern book page 3" },
      { type: "add_note", noteId: id("note:y07"), plotId: plot("Y07"), text: "Photo of the register page: lantern-book-page-03.webp" },
    ];

    const family = [
      {
        type: "set_public",
        siteName: "Lantern Fold",
        gateName: "Lantern Gate",
        directions: "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.",
        outlines: true,
        sectionNames: { [section]: "Yew Walk" },
        pathNames: { [id("path:yew")]: "Yew Walk" },
      },
      { type: "approve_burial", burialId: id("burial:LF-07A"), includeYear: false, line: "Seventh stone along the walk, on the north side." },
    ];

    // One revision for the map, one for the checks, then one each for the burials, the holds, the stone and the family file.
    return [[layout], [empty], burials, holds, stone, family].map((commands) => ({ commands: commands as { type: string }[], on: TODAY }));
  },
};

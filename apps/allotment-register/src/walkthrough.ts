// Thimble Beds: an invented allotment site for practice. Its people, plots and payments were made for this
// project. It is built from commands at fixed dates, in its own workspace, so it never touches a register of
// the keeper's own. The numbers match tests/fixtures/expected/hand-totals.md sections 2.1 and 5.1 to 5.5.
import type { Walkthrough } from "../../../template/src/data/seed";
import type { Point } from "../../../template/src/map/coordinates";

const TODAY = "2026-04-20";

const CODES = ["B01", "B02", "B03", "B04", "B05", "B06"];

/** B01 to B03 sit in Sunny Row to the south of the grass walk, B04 to B06 in Shady Row to the north. */
function footprint(index: number): Point[] {
  const x = 1000 + (index % 3) * 1700;
  const y = index >= 3 ? 3300 : 900;
  return [
    [x, y],
    [x + 1500, y],
    [x + 1500, y + 1100],
    [x, y + 1100],
  ];
}

const TENANTS = [
  { ref: "TB-T1", code: "B01", name: "Marlo Fennick", from: "2024-04-01" },
  { ref: "TB-T2", code: "B02", name: "Ada Stonecrop", from: "2025-04-01", contact: "ada.stonecrop@example.invalid" },
  { ref: "TB-T4", code: "B04", name: "Ilse Burrowby", from: "2023-04-01" },
];

export const thimbleBeds: Walkthrough = {
  siteTitle: "Thimble Beds",
  zone: "Europe/London",
  currency: "GBP",
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
    const space = (code: string): string => id(`space:${code}`);
    const sunny = id("section:sunny");
    const shady = id("section:shady");

    const layout = {
      type: "layout_apply",
      sections: [
        {
          sectionId: sunny,
          name: "Sunny Row",
          outline: [
            [600, 600],
            [6200, 600],
            [6200, 2100],
            [600, 2100],
          ],
        },
        {
          sectionId: shady,
          name: "Shady Row",
          outline: [
            [600, 3200],
            [6200, 3200],
            [6200, 4600],
            [600, 4600],
          ],
        },
      ],
      plots: CODES.map((code, i) => ({ plotId: plot(code), code, sectionId: i < 3 ? sunny : shady, spaces: [{ spaceId: space(code) }], footprint: footprint(i) })),
      paths: [
        {
          pathId: id("path:walk"),
          name: "Grass Walk",
          points: [
            [700, 2650],
            [6100, 2650],
          ],
        },
      ],
      gate: { name: "Main gate", at: [500, 2650] },
      north: 0,
    };

    const checks = [
      { type: "confirm_empty", spaceIds: ["B03", "B05", "B06"].map(space) },
      { type: "add_claim", claimId: id("claim:B06"), spaceId: space("B06"), mode: "unusable", start: "2026-01-05", endable: true, reason: "Subsidence" },
    ];

    const tenancies = TENANTS.map((t) => ({
      type: "record_tenancy",
      tenancyId: id(`tenancy:${t.code}`),
      claimId: id(`claim:${t.code}`),
      personId: id(`person:${t.name}`),
      holderName: t.name,
      ...(t.contact === undefined ? {} : { contact: t.contact }),
      spaceId: space(t.code),
      start: t.from,
      sourceRef: t.ref,
    }));

    const season = [
      { type: "new_season", seasonId: id("season:2025"), name: "Season 2025", start: "2025-04-01", endExclusive: "2026-04-01", dueOn: "2025-06-30", standardFee: 3000 },
      { type: "apply_charges", seasonId: id("season:2025"), items: [{ chargeId: id("charge:B02:2025"), tenancyId: id("tenancy:B02") }] },
    ];

    // Olin's application is made first, so his ID sorts before Tavi's. Only the join sequence puts Tavi first.
    const olin = id("app:olin");
    const tavi = id("app:tavi");
    const applicants = [
      { type: "add_applicant", applicationId: tavi, personId: id("person:Tavi Bramblequill"), name: "Tavi Bramblequill", contact: "tavi.bramblequill@example.invalid", joinedOn: "2026-01-10" },
      { type: "add_applicant", applicationId: olin, personId: id("person:Olin Reedwhorl"), name: "Olin Reedwhorl", contact: "olin.reedwhorl@example.invalid", joinedOn: "2026-01-10" },
    ];

    const visitors = [
      {
        type: "set_public",
        siteName: "Thimble Beds",
        gateName: "Thimble Gate",
        instructions: "Ask the secretary at the hut on Saturday morning. Say the plot code.",
        sectionNames: { [sunny]: "Sunny Row", [shady]: "Shady Row" },
        pathNames: { [id("path:walk")]: "Grass Walk" },
        listed: ["B03", "B05"].map(plot),
      },
    ];

    // One revision each: the map, the checks, the holders, the season and its one charge, the applicants, the public words.
    const parts: [{ type: string; [field: string]: unknown }[], string][] = [
      [[layout], "2026-01-01"],
      [checks, "2026-01-05"],
      [tenancies, "2026-01-06"],
      [season, "2025-04-01"],
      [applicants, "2026-01-10"],
      [visitors, TODAY],
    ];
    return parts.map(([commands, on]) => ({ commands, on }));
  },
};

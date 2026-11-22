// Thimble Beds as hand-totals.md sections 2 and 5 describe it, built through commands.
// Test helper. The template never imports it. The production walkthrough is a separate builder,
// so the two can be compared with the hand worked numbers, not with each other.
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import { GardenEnv, id, plotId, sectionId, spaceId } from "./gardenEnv";
import { CONTACTS, NEW_HOLDER, TENANTS } from "./gardenCanaries";

export const ON = "2026-04-20";
export const CODES = ["B01", "B02", "B03", "B04", "B05", "B06"] as const;
export const SUNNY = "Sunny Row";
export const SHADY = "Shady Row";

export const person = (name: string) => id(`person:${name}`);
export const app = (name: string) => id(`app:${name}`);
export const tenancy = (code: string) => id(`tenancy:${code}`);
export const claim = (name: string) => id(`claim:${name}`);

/** Hand totals 5.1: the holders and when they began. */
export const TENANTS_AT_START = [
  { ref: "TB-T1", code: "B01", name: TENANTS[0], from: "2024-04-01" },
  { ref: "TB-T2", code: "B02", name: TENANTS[1], from: "2025-04-01" },
  { ref: "TB-T4", code: "B04", name: TENANTS[2], from: "2023-04-01" },
] as const;

export const SEASON_2025 = { seasonId: id("season:2025"), name: "Season 2025", start: "2025-04-01", endExclusive: "2026-04-01", dueOn: "2025-06-30", standardFee: 3000 };
export const SEASON_2026 = { seasonId: id("season:2026"), name: "Season 2026", start: "2026-04-01", endExclusive: "2027-04-01", dueOn: "2026-06-30", standardFee: 3600 };

function footprint(index: number): [number, number][] {
  const x = 1000 + (index % 3) * 1700;
  const y = index >= 3 ? 3300 : 900;
  return [
    [x, y],
    [x + 1500, y],
    [x + 1500, y + 1100],
    [x, y + 1100],
  ];
}

/** Two rows of three beds, a grass walk between them and a gate on the west edge. */
export async function layoutBeds(env: GardenEnv, options: { geometry?: boolean } = {}): Promise<void> {
  const geometry = options.geometry === true;
  const sections = [
    { name: SUNNY, outline: [[600, 600], [6200, 600], [6200, 2100], [600, 2100]] as [number, number][] },
    { name: SHADY, outline: [[600, 3200], [6200, 3200], [6200, 4600], [600, 4600]] as [number, number][] },
  ];
  await env.must([
    {
      type: "layout_apply",
      sections: sections.map((s) => (geometry ? { sectionId: sectionId(s.name), name: s.name, outline: s.outline } : { sectionId: sectionId(s.name), name: s.name })),
      plots: CODES.map((code, i) => ({
        plotId: plotId(code),
        code,
        sectionId: sectionId(i < 3 ? SUNNY : SHADY),
        spaces: [{ spaceId: spaceId(code) }],
        ...(geometry ? { footprint: footprint(i) } : {}),
      })),
      ...(geometry
        ? {
            paths: [{ pathId: id("path:Grass Walk"), name: "Grass Walk", points: [[700, 2650], [6100, 2650]] as [number, number][] }],
            gate: { name: "Main gate", at: [500, 2650] as [number, number] },
            north: 0,
          }
        : {}),
    },
  ]);
}

export function tenancyCommand(t: (typeof TENANTS_AT_START)[number]): AllotCommand {
  return {
    type: "record_tenancy",
    tenancyId: tenancy(t.code),
    claimId: claim(`tenancy:${t.code}`),
    personId: person(t.name),
    holderName: t.name,
    ...(t.name === TENANTS[1] ? { contact: CONTACTS[2] } : {}),
    spaceId: spaceId(t.code),
    start: t.from,
    sourceRef: t.ref,
  };
}

export const chargeId = (name: string) => id(`charge:${name}`);

const APPLICANTS_AT_START = (): AllotCommand[] => [
  { type: "add_applicant", applicationId: app("tavi"), personId: person("Tavi Bramblequill"), name: "Tavi Bramblequill", contact: CONTACTS[0], joinedOn: "2026-01-10" },
  { type: "add_applicant", applicationId: app("olin"), personId: person("Olin Reedwhorl"), name: "Olin Reedwhorl", contact: CONTACTS[1], joinedOn: "2026-01-10" },
];

/**
 * Hand totals 5.1 and 5.2 without tenancies or fees: the three taken plots are plain taken claims that can end,
 * so the offer rules can be tested before the tenancy and fee rules exist.
 */
export async function buildBeds(env: GardenEnv, options: { geometry?: boolean } = {}): Promise<void> {
  await layoutBeds(env, options);
  await env.must([{ type: "confirm_empty", spaceIds: ["B03", "B05", "B06"].map(spaceId) }], "2026-01-01");
  await env.must(
    TENANTS_AT_START.map((t): AllotCommand => ({ type: "add_claim", claimId: claim(`beds:${t.code}`), spaceId: spaceId(t.code), mode: "taken", start: t.from, endable: true, sourceRef: t.ref })),
    "2026-01-01",
  );
  await env.must([{ type: "add_claim", claimId: claim("unusable:B06"), spaceId: spaceId("B06"), mode: "unusable", start: "2026-01-05", endable: true, reason: "Subsidence" }], "2026-01-05");
  await env.must(APPLICANTS_AT_START(), "2026-01-10");
}

/** Hand totals 5.1: the beds, the three holders by tenancy and B06 unusable. No seasons and no applicants. */
export async function buildTenanted(env: GardenEnv, options: { geometry?: boolean } = {}): Promise<void> {
  await layoutBeds(env, options);
  await env.must([{ type: "confirm_empty", spaceIds: ["B03", "B05", "B06"].map(spaceId) }], "2026-01-01");
  await env.must(TENANTS_AT_START.map(tenancyCommand), "2026-01-01");
  await env.must([{ type: "add_claim", claimId: claim("unusable:B06"), spaceId: spaceId("B06"), mode: "unusable", start: "2026-01-05", endable: true, reason: "Subsidence" }], "2026-01-05");
}

/** Hand totals 5.1 and 5.2: the state at 2026-04-20 before any offer. */
export async function buildThimble(env: GardenEnv, options: { geometry?: boolean } = {}): Promise<void> {
  await buildTenanted(env, options);
  await env.must([{ type: "new_season", ...SEASON_2025 }], "2025-04-01");
  await env.must([{ type: "apply_charges", seasonId: SEASON_2025.seasonId, items: [{ chargeId: chargeId("B02:2025"), tenancyId: tenancy("B02") }] }], "2025-04-01");
  await env.must(APPLICANTS_AT_START(), "2026-01-10");
}
export { NEW_HOLDER };

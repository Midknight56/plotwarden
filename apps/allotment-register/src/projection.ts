// The availability file, built field by field from what the secretary approved. Pure.
// It reads the public settings, the chosen plots and the map. It never copies a private object: every field of
// the visitor object is written by hand from an approved value, and the result is parsed with the closed schema
// before it is returned. An applicant, a holder, a contact, a fee, a queue place, an offer and every private ID
// are left out. A plot appears only while it is free, so an offer takes it out of the file at once.
import type { LocalDate } from "../../../template/src/calendar";
import { flagPrivateStrings, parseAvailability } from "../../../template/src/output/privacy";
import type { AvailabilityFile, Point, PublicPath, PublicPlot, PublicSection } from "../../../template/src/output/privacy";
import type { Uuid } from "../../../template/src/types";
import type { AllotState } from "./types";

export interface AvailabilityPreview {
  revision: number;
  asOf: LocalDate;
  siteName: string;
  /** Listed plots that are free now, in code order, as the visitor will see them. */
  included: { plotId: Uuid; code: string; sectionLabel: string }[];
  /** Plots the secretary listed that are no longer free. They are left out of the file. */
  listedNotFree: { plotId: Uuid; code: string }[];
  neutralCount: number;
  noPlots: boolean;
  /** The public fields in the file. */
  fields: string[];
  /** What stays private, with counts. */
  excluded: { category: string; count: number }[];
}

export type AvailabilityBuild =
  | { ok: true; file: AvailabilityFile; preview: AvailabilityPreview }
  | { ok: false; missing: string[]; flagged: { field: string; matches: string[] }[] };

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";
const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

/** A private string worth guarding in a public label: a full name, an address or a number. */
function identifying(text: string): boolean {
  const t = text.trim();
  return t.includes("@") || /\d{5,}/.test(t) || t.split(/\s+/).length >= 2;
}

/**
 * The plots that are free at a date and from then on: every active space is checked and no claim
 * (tenancy, hold or unusable mark) covers a day from that date. A tenancy that starts later is not free.
 */
export function freePlotsAt(state: AllotState, asOf: LocalDate): { plotId: Uuid; code: string; sectionId?: Uuid }[] {
  const out: { plotId: Uuid; code: string; sectionId?: Uuid }[] = [];
  for (const plot of Object.values(state.core.plots)) {
    if (plot.archived) continue;
    const spaces = plot.spaces.filter((s) => !s.retired);
    if (spaces.length === 0) continue;
    const free = spaces.every((space) => {
      if (!space.checked) return false;
      return !Object.values(state.core.claims).some((claim) => {
        if (claim.spaceId !== space.spaceId || claim.voided === true) return false;
        if (claim.endExclusive === undefined) return true;
        if (claim.start !== undefined && claim.endExclusive <= claim.start) return false;
        return claim.endExclusive > asOf;
      });
    });
    if (!free) continue;
    const entry: { plotId: Uuid; code: string; sectionId?: Uuid } = { plotId: plot.plotId, code: plot.code };
    if (plot.sectionId !== undefined) entry.sectionId = plot.sectionId;
    out.push(entry);
  }
  return out.sort((a, b) => natural(a.code, b.code));
}

const toPoints = (points: readonly (readonly [number, number])[]): Point[] => points.map((p) => [p[0], p[1]]);

export function buildAvailabilityFile(
  state: AllotState,
  input: { asOf: LocalDate; revision: number; newPublicId: () => string },
): AvailabilityBuild {
  const pub = state.pub;
  const siteName = (pub.siteName ?? "").trim();
  const missing: string[] = [];
  if (siteName === "") missing.push("siteName");
  const gate = state.map.gate;
  if (gate === undefined) missing.push("gate");
  else if (blank(pub.gateName)) missing.push("gateName");

  const free = freePlotsAt(state, input.asOf);
  const freeIds = new Set(free.map((p) => p.plotId));
  const listedFree = free.filter((p) => pub.listed[p.plotId] === true);
  const listedNotFree = Object.keys(pub.listed)
    .filter((plotId) => state.core.plots[plotId] !== undefined && !freeIds.has(plotId))
    .map((plotId) => ({ plotId, code: (state.core.plots[plotId] as { code: string }).code }))
    .sort((a, b) => natural(a.code, b.code));

  // Private strings that must not appear in a public label.
  const known = new Set<string>();
  // Every applicant and holder is guarded by single words as well, so "Thorne gate" holds "Ada Thorne".
  const guarded = new Set<string>();
  for (const person of Object.values(state.people)) {
    for (const text of [person.displayName, person.contact ?? ""]) if (identifying(text)) known.add(text);
    if (person.displayName.trim() !== "") guarded.add(person.displayName);
  }

  // Public IDs belong to this one file.
  const sectionIds = new Map<string, string>();
  const sectionLabels = new Map<string, string>();
  const sectionFor = (plotSection: Uuid | undefined): { id: string; label: string } => {
    const key = plotSection ?? "none";
    let id = sectionIds.get(key);
    if (id === undefined) {
      id = input.newPublicId();
      sectionIds.set(key, id);
      sectionLabels.set(key, (key === "none" ? undefined : pub.sectionNames[key]) ?? `Section ${sectionIds.size}`);
    }
    return { id, label: sectionLabels.get(key) as string };
  };

  const freePlots: PublicPlot[] = [];
  const included: AvailabilityPreview["included"] = [];
  let aliasUsed = false;
  for (const entry of listedFree) {
    const section = sectionFor(entry.sectionId);
    const code = pub.plotCodes[entry.plotId] ?? entry.code;
    if (pub.plotCodes[entry.plotId] !== undefined) aliasUsed = true;
    const plot: PublicPlot = { id: input.newPublicId(), code, sectionId: section.id };
    const shape = state.map.shapes[entry.plotId];
    if (shape !== undefined) plot.outline = toPoints(shape);
    freePlots.push(plot);
    included.push({ plotId: entry.plotId, code, sectionLabel: section.label });
  }

  const sections: PublicSection[] = [...sectionIds.entries()].map(([key, id]) => ({ id, label: sectionLabels.get(key) as string }));
  const paths: PublicPath[] = Object.values(state.map.paths)
    .filter((p) => !blank(pub.pathNames[p.pathId]))
    .map((p) => ({ name: (pub.pathNames[p.pathId] as string).trim(), points: toPoints(p.points) }));
  const listedIds = new Set(listedFree.map((p) => p.plotId));
  const neutralGround = Object.values(state.core.plots)
    .filter((p) => !listedIds.has(p.plotId) && state.map.shapes[p.plotId] !== undefined)
    .sort((a, b) => natural(a.code, b.code))
    .map((p) => ({ outline: toPoints(state.map.shapes[p.plotId] as readonly (readonly [number, number])[]) }));

  // Flag any public words that hold a private name or contact.
  const flagged: { field: string; matches: string[] }[] = [];
  const check = (field: string, text: string | undefined) => {
    if (text === undefined || text === "") return;
    const matches = flagPrivateStrings(text, [...known], [...guarded]);
    if (matches.length > 0) flagged.push({ field, matches });
  };
  check("siteName", siteName);
  check("gateName", pub.gateName);
  check("instructions", pub.instructions);
  for (const section of sections) check("sectionNames", section.label);
  for (const p of paths) check("pathNames", p.name);
  for (const plot of freePlots) check("plotCodes", plot.code);
  const seen = new Set<string>();
  const unique = flagged.filter((f) => {
    const key = `${f.field}|${f.matches.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (missing.length > 0 || unique.length > 0) return { ok: false, missing, flagged: unique };

  const file: AvailabilityFile = {
    format: "plot.availability.v1",
    asOf: input.asOf,
    siteTitle: siteName,
    north: state.map.north,
    gate: { name: (pub.gateName as string).trim(), x: (gate as NonNullable<typeof gate>).at[0], y: (gate as NonNullable<typeof gate>).at[1] },
    paths,
    sections,
    freePlots,
    neutralGround,
    instructions: (pub.instructions ?? "").trim(),
  };
  if (!parseAvailability(file).ok) return { ok: false, missing: ["file"], flagged: [] };

  const fields = ["siteName", "gateName"];
  if (paths.length > 0) fields.push("pathNames");
  if (sections.length > 0) fields.push("sectionNames");
  if (aliasUsed) fields.push("plotCodes");
  if (!blank(pub.instructions)) fields.push("instructions");
  if (freePlots.length > 0) fields.push("freePlots");

  const preview: AvailabilityPreview = {
    revision: input.revision,
    asOf: input.asOf,
    siteName,
    included,
    listedNotFree,
    neutralCount: neutralGround.length,
    noPlots: freePlots.length === 0,
    fields,
    excluded: [
      { category: "people", count: Object.keys(state.people).length },
      { category: "applicants", count: Object.values(state.applications).filter((a) => a.state === "waiting" || a.state === "offered").length },
      { category: "tenancies", count: Object.keys(state.tenancies).length },
      { category: "charges", count: Object.values(state.ledger).filter((e) => e.type === "charge").length },
      { category: "offers", count: Object.values(state.offers).filter((o) => o.state === "open").length },
    ],
  };
  return { ok: true, file, preview };
}

/** A preview made at one revision is stale once the register has moved on. */
export function isStalePreview(preview: AvailabilityPreview, currentRevision: number): boolean {
  return preview.revision !== currentRevision;
}

/** The first plot in code order that is free at a date. This is the plot to offer next. */
export function nextFreePlot(state: AllotState, asOf: LocalDate): { plotId: Uuid; code: string; sectionId?: Uuid } | undefined {
  return freePlotsAt(state, asOf)[0];
}

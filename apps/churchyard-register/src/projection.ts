// The family file, built field by field from what the keeper approved. Pure.
// It reads the approvals, the public settings and the map. It never copies a private object: every
// field of the visitor object is written by hand from an approved value, and the result is parsed
// with the closed schema before it is returned. A living person, a contact, a request, a note, a reading,
// a photo, a source ref and every private ID are left out.
import type { LocalDate } from "../../../template/src/calendar";
import { flagPrivateStrings, flagWholeNames, looksLikeContact, parseFamily } from "../../../template/src/output/privacy";
import type { FamilyFile, Point, PublicBurial, PublicPath, PublicPlot, PublicSection } from "../../../template/src/output/privacy";
import { livePhotos } from "../../../template/src/notes";
import type { Uuid } from "../../../template/src/types";
import { approvalStatus } from "./rules";
import type { Burial, ChurchState } from "./types";

export interface FamilyPreview {
  revision: number;
  asOf: LocalDate;
  siteName: string;
  included: { burialId: string; name: string; year?: number; plotCode: string; sectionLabel: string }[];
  /** Burials that share a plot with an included burial and are not included. Their names are not shown. */
  withheld: { burialId: string; plotCode: string }[];
  /** Burials whose approval needs a second look. */
  needsReview: { burialId: string; plotCode: string }[];
  /** Approved burials that have no plot yet. They are left out. */
  notPlaced: number;
  noNames: boolean;
  /** The public fields in the file. */
  fields: string[];
  /** What stays private, with counts. */
  excluded: { category: string; count: number }[];
}

export type FamilyBuild =
  | { ok: true; file: FamilyFile; preview: FamilyPreview }
  | { ok: false; missing: string[]; flagged: { field: string; matches: string[] }[] };

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";

/** Lower case, accents removed, single spaces. For comparing names only. */
const foldName = (value: string): string => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

/** A private string worth guarding in a public label: a full name, an address or a number. */
function identifying(text: string): boolean {
  const t = text.trim();
  return t.includes("@") || /\d{5,}/.test(t) || t.split(/\s+/).length >= 2;
}

const plotCodeOf = (state: ChurchState, plotId: Uuid | undefined): string => (plotId === undefined ? "" : (state.core.plots[plotId]?.code ?? ""));

function toPoints(points: readonly (readonly [number, number])[]): Point[] {
  return points.map((p) => [p[0], p[1]]);
}

export function buildFamilyFile(
  state: ChurchState,
  input: { asOf: LocalDate; revision: number; newPublicId: () => string },
): FamilyBuild {
  const pub = state.pub;
  const siteName = (pub.siteName ?? "").trim();
  const missing: string[] = [];
  if (siteName === "") missing.push("siteName");
  const gate = state.map.gate;
  if (gate === undefined) missing.push("gate");
  else if (blank(pub.gateName)) missing.push("gateName");

  const live = Object.values(state.burials).filter((b) => b.voided !== true);
  const included: Burial[] = [];
  const needsReview: Burial[] = [];
  let notPlaced = 0;
  for (const burial of live) {
    const status = approvalStatus(state, burial.burialId);
    if (status === "review") needsReview.push(burial);
    else if (status === "approved") {
      if (burial.plotId === undefined) notPlaced += 1;
      else included.push(burial);
    }
  }
  const byCode = (a: Burial, b: Burial) => plotCodeOf(state, a.plotId).localeCompare(plotCodeOf(state, b.plotId), "en", { numeric: true }) || a.sourceRef.localeCompare(b.sourceRef, "en", { numeric: true });
  included.sort(byCode);

  // Private strings that must not appear in a public label. The recorded names of included burials are allowed.
  const shown = new Set(included.map((b) => b.recordedName ?? ""));
  const known = new Set<string>();
  // Names whose single words are guarded too: every living person, and every burial that is not shown.
  const guarded = new Set<string>();
  for (const person of Object.values(state.people)) {
    for (const text of [person.displayName, person.contact ?? ""]) if (identifying(text)) known.add(text);
    if (person.displayName.trim() !== "") guarded.add(person.displayName);
  }
  for (const request of Object.values(state.requests)) if (request.note !== undefined && identifying(request.note)) known.add(request.note);
  for (const burial of live) {
    if (burial.recordedName === undefined || shown.has(burial.recordedName)) continue;
    if (identifying(burial.recordedName)) known.add(burial.recordedName);
    guarded.add(burial.recordedName);
  }

  // Public IDs belong to this one file.
  const sectionIds = new Map<string, string>();
  const sectionLabels = new Map<string, string>();
  const plotIds = new Map<Uuid, string>();
  const sectionKey = (plotId: Uuid): string => state.core.plots[plotId]?.sectionId ?? "none";
  const sectionFor = (plotId: Uuid): { id: string; label: string } => {
    const key = sectionKey(plotId);
    let id = sectionIds.get(key);
    if (id === undefined) {
      id = input.newPublicId();
      sectionIds.set(key, id);
      sectionLabels.set(key, (key === "none" ? undefined : pub.sectionNames[key]) ?? `Section ${sectionIds.size}`);
    }
    return { id, label: sectionLabels.get(key) as string };
  };

  const plots: PublicPlot[] = [];
  const burials: PublicBurial[] = [];
  const previewIncluded: FamilyPreview["included"] = [];
  for (const burial of included) {
    const plotId = burial.plotId as Uuid;
    const approval = state.approvals[burial.burialId];
    if (approval === undefined) continue;
    let publicPlot = plotIds.get(plotId);
    const section = sectionFor(plotId);
    if (publicPlot === undefined) {
      publicPlot = input.newPublicId();
      plotIds.set(plotId, publicPlot);
      const plot: PublicPlot = { id: publicPlot, code: pub.plotCodes[plotId] ?? plotCodeOf(state, plotId), sectionId: section.id };
      const shape = state.map.shapes[plotId];
      if (shape !== undefined) plot.outline = toPoints(shape);
      plots.push(plot);
    }
    const row: PublicBurial = { id: input.newPublicId(), name: approval.name, plotId: publicPlot };
    const year = approval.includeYear ? approval.basis.year : undefined;
    if (year !== undefined) row.year = year;
    if (!blank(pub.directions)) row.directions = (pub.directions as string).trim();
    burials.push(row);
    const line: FamilyPreview["included"][number] = { burialId: burial.burialId, name: approval.name, plotCode: pub.plotCodes[plotId] ?? plotCodeOf(state, plotId), sectionLabel: section.label };
    if (year !== undefined) line.year = year;
    previewIncluded.push(line);
  }

  const sections: PublicSection[] = [...sectionIds.entries()].map(([key, id]) => ({ id, label: sectionLabels.get(key) as string }));
  const paths: PublicPath[] = Object.values(state.map.paths)
    .filter((p) => !blank(pub.pathNames[p.pathId]))
    .map((p) => ({ name: (pub.pathNames[p.pathId] as string).trim(), points: toPoints(p.points) }));

  // Flag any public words that hold a private name or contact.
  const flagged: { field: string; matches: string[] }[] = [];
  const check = (field: string, text: string | undefined) => {
    if (text === undefined || text === "") return;
    const matches = flagPrivateStrings(text, [...known], [...guarded]);
    if (matches.length > 0) flagged.push({ field, matches });
  };
  check("siteName", siteName);
  check("gateName", pub.gateName);
  check("directions", pub.directions);
  for (const [id, text] of Object.entries(pub.sectionNames)) if (sectionIds.has(id)) check("sectionNames", text);
  for (const p of paths) check("pathNames", p.name);
  for (const plot of plots) check("plotCodes", plot.code);

  // The public name of a burial is typed text. Unless it is the recorded name itself, it must hold no other
  // person's name and no contact. The burial's own recorded name is left out of the check.
  const nameMatches = new Set<string>();
  for (const burial of included) {
    const approval = state.approvals[burial.burialId];
    if (approval === undefined) continue;
    const own = foldName(burial.recordedName ?? "");
    if (foldName(approval.name) === own) continue;
    for (const m of flagPrivateStrings(approval.name, [...known].filter((k) => foldName(k) !== own))) nameMatches.add(m);
    for (const m of flagWholeNames(approval.name, [...guarded].filter((n) => foldName(n) !== own))) nameMatches.add(m);
    if (looksLikeContact(approval.name)) nameMatches.add(approval.name);
  }
  if (nameMatches.size > 0) flagged.push({ field: "names", matches: [...nameMatches] });
  if (missing.length > 0 || flagged.length > 0) return { ok: false, missing, flagged };

  const file: FamilyFile = {
    format: "plot.family.v1",
    asOf: input.asOf,
    siteTitle: siteName,
    north: state.map.north,
    gate: { name: (pub.gateName as string).trim(), x: (gate as NonNullable<typeof gate>).at[0], y: (gate as NonNullable<typeof gate>).at[1] },
    paths,
    sections,
    plots,
    burials,
  };
  if (!parseFamily(file).ok) return { ok: false, missing: ["file"], flagged: [] };

  const includedIds = new Set(included.map((b) => b.burialId));
  const reviewIds = new Set(needsReview.map((b) => b.burialId));
  const plotsInFile = new Set(plotIds.keys());
  const rest = live.filter((b) => !includedIds.has(b.burialId));
  const withheld = rest
    .filter((b) => b.plotId !== undefined && plotsInFile.has(b.plotId) && !reviewIds.has(b.burialId))
    .map((b) => ({ burialId: b.burialId, plotCode: plotCodeOf(state, b.plotId) }));
  const withheldIds = new Set(withheld.map((w) => w.burialId));
  const fields = ["siteName", "gateName"];
  if (paths.length > 0) fields.push("pathNames");
  if (sections.length > 0) fields.push("sectionNames");
  if (plots.length > 0) fields.push("plotCodes");
  if (!blank(pub.directions)) fields.push("directions");
  if (burials.length > 0) fields.push("names");
  if (burials.some((b) => b.year !== undefined)) fields.push("years");

  const photos = Object.keys(state.notes).reduce((sum, plotId) => sum + livePhotos(state.notes, plotId).length, 0);
  const notes = Object.values(state.notes).reduce((sum, n) => sum + n.notes.length, 0);
  const preview: FamilyPreview = {
    revision: input.revision,
    asOf: input.asOf,
    siteName,
    included: previewIncluded,
    withheld,
    needsReview: needsReview.map((b) => ({ burialId: b.burialId, plotCode: plotCodeOf(state, b.plotId) })),
    notPlaced,
    noNames: burials.length === 0,
    fields,
    excluded: [
      { category: "people", count: Object.keys(state.people).length },
      { category: "requests", count: Object.keys(state.requests).length },
      { category: "burials", count: rest.filter((b) => !withheldIds.has(b.burialId)).length },
      { category: "sourceRefs", count: live.length },
      { category: "readings", count: Object.keys(state.memorials).length },
      { category: "notes", count: notes },
      { category: "photos", count: photos },
    ],
  };
  return { ok: true, file, preview };
}

/** A preview made at one revision is stale once the register has moved on. */
export function isStalePreview(preview: FamilyPreview, currentRevision: number): boolean {
  return preview.revision !== currentRevision;
}

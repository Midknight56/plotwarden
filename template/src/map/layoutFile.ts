// The plot.layout.v1 file: build, read and plan an import. Pure.
// The file holds sections, plot codes, footprints, paths, a gate and north.
// It never holds a private ID, a person, a status, an event or the backdrop.
import { z } from "zod";
import { canonicalJson } from "../events";
import { COORDINATE_MAX, LIMITS } from "../limits";
import { normalizeCode } from "../plot";
import { err, ok } from "../types";
import type { Plot, Result, Uuid } from "../types";
import { checkPath, checkPolygon } from "./geometry";
import { isMapEmpty } from "./edit";
import type { LayoutCommand, LayoutState, NewLayoutPlot, SectionInput } from "./edit";

export const LAYOUT_FORMAT = "plot.layout.v1";
export const LAYOUT_FILENAME = "site-layout.json";

export type FilePoint = [number, number];

export interface LayoutFile {
  format: "plot.layout.v1";
  north: number;
  gate?: { name: string; at: FilePoint };
  sections: { ref: string; name: string; outline?: FilePoint[] }[];
  plots: { section?: string; code: string; footprint?: FilePoint[] }[];
  paths: { name: string; points: FilePoint[] }[];
}

export type ConflictRule =
  | "footprint_differs"
  | "code_in_other_section"
  | "outline_differs"
  | "gate_differs"
  | "north_differs"
  | "path_differs";

export interface LayoutConflict {
  rule: ConflictRule;
  code?: string;
  name?: string;
  section?: string;
}

export interface LayoutImportPlan {
  addedSections: number;
  addedPlots: number;
  addedPaths: number;
  retainedPlots: number;
  conflicts: LayoutConflict[];
  /** Absent when there is a conflict or nothing to add. */
  command?: LayoutCommand;
}

const codePoints = (s: string): number => [...s].length;
const text = (max: number) => z.string().min(1).refine((s) => s.trim() !== "" && codePoints(s) <= max, { message: "bad text" });
const coordinate = z.number().int().min(0).max(COORDINATE_MAX);
const point = z.tuple([coordinate, coordinate]);
const outline = z.array(point).min(3).max(LIMITS.polygonVertices);

const schema = z.strictObject({
  format: z.literal(LAYOUT_FORMAT),
  north: z.number().int().min(0).max(359),
  gate: z.strictObject({ name: text(LIMITS.nameChars), at: point }).optional(),
  sections: z.array(z.strictObject({ ref: text(40), name: text(LIMITS.nameChars), outline: outline.optional() })).max(LIMITS.sectionsPerSite),
  plots: z
    .array(z.strictObject({ section: text(40).optional(), code: text(LIMITS.plotCodeChars), footprint: outline.optional() }))
    .max(LIMITS.plotsPerSite),
  paths: z.array(z.strictObject({ name: text(LIMITS.nameChars), points: z.array(point).min(2).max(LIMITS.polygonVertices) })).max(1000),
});

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

/** Build the file from the map and the plot codes. It reads no private field. */
export function buildLayoutFile(state: LayoutState): LayoutFile {
  const sections = Object.values(state.map.sections).sort((a, b) => a.displayOrder - b.displayOrder);
  const refOf = new Map(sections.map((s, i) => [s.sectionId, `s${i + 1}`]));
  const orderOf = new Map(sections.map((s, i) => [s.sectionId, i]));

  const file: LayoutFile = {
    format: LAYOUT_FORMAT,
    north: state.map.north,
    sections: sections.map((s) => {
      const entry: LayoutFile["sections"][number] = { ref: refOf.get(s.sectionId) as string, name: s.name };
      if (s.outline !== undefined) entry.outline = s.outline.map((p) => [p[0], p[1]] as FilePoint);
      return entry;
    }),
    plots: Object.values(state.core.plots)
      .sort((a, b) => {
        const oa = a.sectionId === undefined ? -1 : (orderOf.get(a.sectionId) ?? -1);
        const ob = b.sectionId === undefined ? -1 : (orderOf.get(b.sectionId) ?? -1);
        return oa - ob || natural(a.code, b.code);
      })
      .map((p) => {
        const entry: LayoutFile["plots"][number] = { code: p.code };
        if (p.sectionId !== undefined && refOf.has(p.sectionId)) entry.section = refOf.get(p.sectionId) as string;
        const footprint = state.map.shapes[p.plotId];
        if (footprint !== undefined) entry.footprint = footprint.map((q) => [q[0], q[1]] as FilePoint);
        return entry;
      }),
    paths: Object.values(state.map.paths)
      .sort((a, b) => natural(a.name, b.name))
      .map((p) => ({ name: p.name, points: p.points.map((q) => [q[0], q[1]] as FilePoint) })),
  };
  if (state.map.gate !== undefined) file.gate = { name: state.map.gate.name, at: [state.map.gate.at[0], state.map.gate.at[1]] };
  return file;
}

export function layoutFileText(file: LayoutFile): string {
  return canonicalJson(file);
}

function bad(reason: string, extra?: Record<string, string | number | boolean | undefined>) {
  return err("bad_layout_file", { reason, ...extra });
}

/** Read a layout file. The format decides, never the file name. Nothing is written. */
export function parseLayoutFile(input: string): Result<LayoutFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return bad("not_json");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return err("wrong_file");
  const format = (raw as Record<string, unknown>)["format"];
  if (typeof format !== "string") return err("wrong_file");
  const version = /^plot\.layout\.v(\d+)$/.exec(format);
  if (version === null) return err("wrong_file");
  if (Number(version[1]) > 1) return err("newer_version");

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bad("structure", { path: issue === undefined ? undefined : issue.path.join(".") });
  }
  const file = parsed.data as LayoutFile;

  const refs = new Set<string>();
  const names = new Set<string>();
  for (const section of file.sections) {
    const name = normalizeCode(section.name);
    if (refs.has(section.ref)) return bad("duplicate_ref", { ref: section.ref });
    if (names.has(name)) return bad("duplicate_section", { name: section.name });
    refs.add(section.ref);
    names.add(name);
    if (section.outline !== undefined && !checkPolygon(section.outline).ok) return bad("bad_outline", { name: section.name });
  }
  const codes = new Set<string>();
  for (const plot of file.plots) {
    const code = normalizeCode(plot.code);
    if (codes.has(code)) return bad("duplicate_code", { code: plot.code });
    codes.add(code);
    if (plot.section !== undefined && !refs.has(plot.section)) return bad("dangling_section", { code: plot.code });
    if (plot.footprint !== undefined && !checkPolygon(plot.footprint).ok) return bad("bad_footprint", { code: plot.code });
  }
  const pathNames = new Set<string>();
  for (const path of file.paths) {
    const name = normalizeCode(path.name);
    if (pathNames.has(name)) return bad("duplicate_path", { name: path.name });
    pathNames.add(name);
    if (!checkPath(path.points).ok) return bad("bad_path", { name: path.name });
  }
  return ok(file);
}

function samePoints(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  return a.length === b.length && a.every((p, i) => p[0] === (b[i] as readonly [number, number])[0] && p[1] === (b[i] as readonly [number, number])[1]);
}

interface SectionRef {
  id: Uuid;
  name: string;
  existing: boolean;
}

/**
 * Plan an import. A new site (no plot, section, path or gate) takes everything
 * with fresh IDs. Otherwise sections match by name, plots by section and code,
 * and paths by name. Any conflict blocks the whole batch.
 */
export function planLayoutImport(file: LayoutFile, state: LayoutState, newId: () => Uuid, spaces = 1): LayoutImportPlan {
  const plan: LayoutImportPlan = { addedSections: 0, addedPlots: 0, addedPaths: 0, retainedPlots: 0, conflicts: [] };
  const fresh = isMapEmpty(state.map) && state.map.gate === undefined && Object.keys(state.core.plots).length === 0;

  const existingSections = new Map(Object.values(state.map.sections).map((s) => [normalizeCode(s.name), s]));
  const refs = new Map<string, SectionRef>();
  const sections: SectionInput[] = [];
  for (const fs of file.sections) {
    const existing = fresh ? undefined : existingSections.get(normalizeCode(fs.name));
    if (existing === undefined) {
      const sectionId = newId();
      const input: SectionInput = { sectionId, name: fs.name };
      if (fs.outline !== undefined) input.outline = fs.outline;
      sections.push(input);
      plan.addedSections += 1;
      refs.set(fs.ref, { id: sectionId, name: fs.name, existing: false });
      continue;
    }
    refs.set(fs.ref, { id: existing.sectionId, name: existing.name, existing: true });
    if (fs.outline === undefined) continue;
    if (existing.outline === undefined) sections.push({ sectionId: existing.sectionId, name: existing.name, outline: fs.outline });
    else if (!samePoints(existing.outline, fs.outline)) plan.conflicts.push({ rule: "outline_differs", name: existing.name });
  }

  const current = new Map<string, Plot>();
  const prior = new Map<string, Plot>();
  for (const plot of Object.values(state.core.plots)) {
    current.set(normalizeCode(plot.code), plot);
    for (const code of plot.priorCodes) if (!prior.has(normalizeCode(code))) prior.set(normalizeCode(code), plot);
  }

  const plots: NewLayoutPlot[] = [];
  for (const fp of file.plots) {
    const section = fp.section === undefined ? undefined : refs.get(fp.section);
    const key = normalizeCode(fp.code);
    const byCurrent = current.get(key);
    const owner = byCurrent ?? prior.get(key);
    if (owner === undefined) {
      const entry: NewLayoutPlot = { plotId: newId(), code: fp.code, spaces: Array.from({ length: spaces }, () => ({ spaceId: newId() })) };
      if (section !== undefined) entry.sectionId = section.id;
      if (fp.footprint !== undefined) entry.footprint = fp.footprint;
      plots.push(entry);
      plan.addedPlots += 1;
      continue;
    }
    const sameSection = section === undefined ? owner.sectionId === undefined : section.existing && section.id === owner.sectionId;
    if (byCurrent === undefined || !sameSection) {
      const conflict: LayoutConflict = { rule: "code_in_other_section", code: fp.code };
      const ownerSection = owner.sectionId === undefined ? undefined : state.map.sections[owner.sectionId]?.name;
      if (ownerSection !== undefined) conflict.section = ownerSection;
      plan.conflicts.push(conflict);
      continue;
    }
    const stored = state.map.shapes[owner.plotId];
    if (fp.footprint === undefined || (stored !== undefined && samePoints(stored, fp.footprint))) plan.retainedPlots += 1;
    else plan.conflicts.push({ rule: "footprint_differs", code: owner.code });
  }

  const paths: { pathId: Uuid; name: string; points: FilePoint[] }[] = [];
  const existingPaths = new Map(Object.values(state.map.paths).map((p) => [normalizeCode(p.name), p]));
  for (const fp of file.paths) {
    const existing = existingPaths.get(normalizeCode(fp.name));
    if (existing === undefined) {
      paths.push({ pathId: newId(), name: fp.name, points: fp.points });
      plan.addedPaths += 1;
    } else if (!samePoints(existing.points, fp.points)) {
      plan.conflicts.push({ rule: "path_differs", name: existing.name });
    }
  }

  let gate: { name: string; at: FilePoint } | undefined;
  if (file.gate !== undefined) {
    const existing = state.map.gate;
    if (existing === undefined) gate = file.gate;
    else if (existing.at[0] !== file.gate.at[0] || existing.at[1] !== file.gate.at[1] || normalizeCode(existing.name) !== normalizeCode(file.gate.name)) {
      plan.conflicts.push({ rule: "gate_differs", name: existing.name });
    }
  }

  let north: number | undefined;
  if (fresh) {
    if (file.north !== state.map.north) north = file.north;
  } else if (file.north !== state.map.north) {
    plan.conflicts.push({ rule: "north_differs" });
  }

  if (plan.conflicts.length > 0) return plan;
  if (sections.length + plots.length + paths.length === 0 && gate === undefined && north === undefined) return plan;
  const command: Extract<LayoutCommand, { type: "layout_apply" }> = { type: "layout_apply" };
  if (sections.length > 0) command.sections = sections;
  if (plots.length > 0) command.plots = plots;
  if (paths.length > 0) command.paths = paths;
  if (gate !== undefined) command.gate = gate;
  if (north !== undefined) command.north = north;
  plan.command = command;
  return plan;
}

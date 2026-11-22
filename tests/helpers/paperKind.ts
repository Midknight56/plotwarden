// A tiny adapter of kind "paper", built on the base state. It stands in for the
// churchyard adapter until spec 03. It has one sheet, Burials, and two commands.
// A burial with a plot is a taken claim that cannot end. One with no plot is unplaced.
// The unit tests and the browser host both use it, so it holds nothing for Node alone.
// Test helper. The template never imports it.
import type { RegisterAdapter } from "../../template/src/adapter";
import { defineRegister } from "../../template/src/adapter";
import type { Register } from "../../template/src/adapter";
import { BASE_COMMAND_TYPES, applyBase, decideBase, emptyBase, validateBase } from "../../template/src/base";
import type { BaseCommand, BaseEvent, BaseState } from "../../template/src/base";
import { parseDateEntry } from "../../template/src/calendar";
import type { LocalDate } from "../../template/src/calendar";
import { decideCore } from "../../template/src/commands";
import type { SheetImporter } from "../../template/src/data/importBatch";
import type { CellError } from "../../template/src/data/mapping";
import { CORE_PAYLOAD_VERSION } from "../../template/src/events";
import type { DraftEvent } from "../../template/src/events";
import { normalizeCode } from "../../template/src/plot";
import { err, ok } from "../../template/src/types";
import type { FieldError, Result, Uuid } from "../../template/src/types";
export const PAPER_KIND = "paper";
export const PAPER_CTX = { spacesPerPlot: { min: 1, max: 1 } };
export const BURIALS = "Burials";

export interface Burial {
  burialId: Uuid;
  sheet: typeof BURIALS;
  sourceRef: string;
  name: string;
  dateText: string;
  page: string;
  plotId?: Uuid;
  spaceId?: Uuid;
  claimId?: Uuid;
  normalized: Record<string, string>;
}

export interface PaperState extends BaseState {
  burials: Record<Uuid, Burial>;
}

type BurialFields = Omit<Burial, "sheet"> & { start?: LocalDate };

export type PaperCommand =
  | BaseCommand
  | ({ type: "record_burial" } & BurialFields)
  | ({ type: "correct_burial" } & BurialFields);

export type PaperEvent =
  | BaseEvent
  | ({ type: "burial_recorded" } & Burial)
  | ({ type: "burial_corrected" } & Burial);

function payloadOf(c: BurialFields): Burial {
  const b: Burial = {
    burialId: c.burialId,
    sheet: BURIALS,
    sourceRef: c.sourceRef,
    name: c.name,
    dateText: c.dateText,
    page: c.page,
    normalized: c.normalized,
  };
  if (c.plotId !== undefined) b.plotId = c.plotId;
  if (c.spaceId !== undefined) b.spaceId = c.spaceId;
  if (c.claimId !== undefined) b.claimId = c.claimId;
  return b;
}

function draft(event: PaperEvent, entityIds: string[], on: LocalDate, sourceRef?: string): DraftEvent<PaperEvent> {
  const d: DraftEvent<PaperEvent> = { event, entityIds, effectiveOn: on, payloadVersion: CORE_PAYLOAD_VERSION };
  if (sourceRef !== undefined) d.sourceRef = sourceRef;
  return d;
}

function placeDrafts(
  state: PaperState,
  c: BurialFields,
  on: LocalDate,
): Result<DraftEvent<PaperEvent>[]> {
  if (c.spaceId === undefined) return ok([]);
  if (c.claimId === undefined) return err("invalid_input", undefined, { fields: [{ field: "claimId", code: "required" }] });
  const claim: Parameters<typeof decideCore>[1] = {
    type: "add_claim",
    claimId: c.claimId,
    spaceId: c.spaceId,
    mode: "taken",
    endable: false,
    ref: c.burialId,
    sourceRef: c.sourceRef,
  };
  if (c.start !== undefined) claim.start = c.start;
  return decideCore(state.core, claim, on, PAPER_CTX);
}

export const paperAdapter: RegisterAdapter<PaperState, PaperCommand, PaperEvent> = {
  kind: PAPER_KIND,
  version: 1,
  spacesPerPlot: { min: 1, max: 1 },
  fields: [
    { key: "sourceRef", label: "Source ref", type: "text", maxChars: 100 },
    { key: "name", label: "Name", type: "text", maxChars: 100 },
    { key: "section", label: "Section", type: "text", maxChars: 100, repeat: "section" },
    { key: "plot", label: "Plot", type: "text", maxChars: 24 },
    { key: "burialDate", label: "Burial date", type: "date" },
    { key: "page", label: "Page", type: "text", maxChars: 100, repeat: "page" },
  ],
  sheets: [
    {
      name: BURIALS,
      required: ["Source ref", "Name"],
      optional: ["Section", "Plot", "Burial date", "Page"],
    },
  ],
  commands: [...BASE_COMMAND_TYPES, "record_burial", "correct_burial"],
  initialState: (site) => ({ ...emptyBase(site.id), burials: {} }),
  validate(command, state) {
    if (command.type === "record_burial" || command.type === "correct_burial") {
      const fields: FieldError[] = [];
      if (command.name.trim() === "") fields.push({ field: "name", code: "required" });
      if (command.sourceRef.trim() === "") fields.push({ field: "sourceRef", code: "required" });
      return fields;
    }
    return validateBase(command, state);
  },
  decide(state, command, on) {
    if (command.type === "record_burial") {
      if (state.burials[command.burialId] !== undefined) return err("duplicate_id", { id: command.burialId });
      const placed = placeDrafts(state, command, on);
      if (!placed.ok) return placed;
      const ids = [command.burialId, ...(command.plotId === undefined ? [] : [command.plotId]), ...(command.spaceId === undefined ? [] : [command.spaceId])];
      return ok([...placed.value, draft({ type: "burial_recorded", ...payloadOf(command) }, ids, on, command.sourceRef)]);
    }
    if (command.type === "correct_burial") {
      const before = state.burials[command.burialId];
      if (before === undefined) return err("no_such_burial", { burialId: command.burialId });
      let placed: DraftEvent<PaperEvent>[] = [];
      if (before.spaceId !== undefined && command.spaceId !== before.spaceId) {
        return err("taken_needs_correction", { burialId: command.burialId }, { route: "correct_entry" });
      }
      if (before.spaceId === undefined && command.spaceId !== undefined) {
        const r = placeDrafts(state, command, on);
        if (!r.ok) return r;
        placed = r.value;
      }
      const keep: BurialFields = before.spaceId !== undefined ? { ...command, claimId: before.claimId as Uuid } : command;
      return ok([...placed, draft({ type: "burial_corrected", ...payloadOf(keep) }, [command.burialId], on, command.sourceRef)]);
    }
    return decideBase(state, command, on, PAPER_CTX);
  },
  apply(state, event) {
    const base = applyBase(state, event);
    if (base !== undefined) return base;
    if (event.type === "burial_recorded" || event.type === "burial_corrected") {
      const { type: _type, ...burial } = event;
      return { ...state, burials: { ...state.burials, [burial.burialId]: burial } };
    }
    return state;
  },
  project: (snapshot, audience) => (audience === "private" ? snapshot : null),
  reports: [],
  reviewFacts: () => [],
  labels: {},
  theme: { ink: "#22252C", paper: "#FAF5E9" },
};

export function paperRegister(): Register<PaperState, PaperCommand, PaperEvent> {
  const r = defineRegister(paperAdapter);
  if (!r.ok) throw new Error(`paper adapter refused: ${JSON.stringify(r.error)}`);
  return r.value;
}

const collapse = (s: string | undefined): string => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");

export function normalizeBurialCells(cells: Record<string, string>): Record<string, string> {
  return {
    sourceRef: cells["sourceRef"] ?? "",
    name: collapse(cells["name"]),
    section: collapse(cells["section"]),
    plot: collapse(cells["plot"]),
    burialDate: collapse(cells["burialDate"]),
    page: collapse(cells["page"]),
  };
}

function dayStart(text: string, order: "dmy" | "mdy" | undefined): LocalDate | undefined {
  const parsed = parseDateEntry(text, order === undefined ? undefined : { order });
  if (!parsed.ok || parsed.value.value.p !== "day") return undefined;
  const v = parsed.value.value;
  return `${String(v.y).padStart(4, "0")}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
}

export const burialsImporter: SheetImporter<PaperState, PaperCommand> = {
  sheet: BURIALS,
  sourceRefField: "sourceRef",
  placementField: "plot",
  open(state, options) {
    const plotsByCode = new Map(Object.values(state.core.plots).map((p) => [normalizeCode(p.code), p]));
    const existing = new Map(Object.values(state.burials).map((b) => [b.sourceRef, { recordId: b.burialId, normalized: b.normalized }]));

    type Located =
      | { placement: "unplaced" }
      | { placement: "placed"; plotId: Uuid; spaceId: Uuid }
      | { error: Omit<CellError, "row"> };
    const locate = (cells: Record<string, string>): Located => {
      const plotText = collapse(cells["plot"]);
      if (plotText === "") return { placement: "unplaced" };
      const plot = plotsByCode.get(normalizeCode(plotText));
      if (plot === undefined) {
        return { error: { field: "plot", heading: "Plot", value: cells["plot"] ?? "", code: "unknown_plot", fix: "check_plot_code" } };
      }
      const sectionText = collapse(cells["section"]);
      const sectionName = plot.sectionId === undefined ? undefined : state.map.sections[plot.sectionId]?.name;
      if (sectionText !== "" && normalizeCode(sectionText) !== normalizeCode(sectionName ?? "")) {
        return { error: { field: "section", heading: "Section", value: cells["section"] ?? "", code: "wrong_section", fix: "check_section" } };
      }
      const space = plot.spaces.find((s) => !s.retired);
      if (space === undefined) {
        return { error: { field: "plot", heading: "Plot", value: cells["plot"] ?? "", code: "unknown_plot", fix: "check_plot_code" } };
      }
      return { placement: "placed", plotId: plot.plotId, spaceId: space.spaceId };
    };

    const build = (cells: Record<string, string>, burialId: Uuid, keepClaim?: Uuid) => {
      const located = locate(cells);
      if ("error" in located) return { ok: false as const, errors: [located.error] };
      const normalized = normalizeBurialCells(cells);
      const command: BurialFields = {
        burialId,
        sourceRef: cells["sourceRef"] ?? "",
        name: cells["name"] ?? "",
        dateText: cells["burialDate"] ?? "",
        page: cells["page"] ?? "",
        normalized,
      };
      if (located.placement === "placed") {
        command.plotId = located.plotId;
        command.spaceId = located.spaceId;
        command.claimId = keepClaim ?? options.newId();
        const start = dayStart(command.dateText, options.dateOrder);
        if (start !== undefined) command.start = start;
      }
      return { ok: true as const, placement: located.placement, normalized, command };
    };

    return {
      existing,
      stageRow(cells) {
        const burialId = options.newId();
        const built = build(cells, burialId);
        if (!built.ok) return built;
        return { ok: true, placement: built.placement, normalized: built.normalized, recordId: burialId, commands: [{ type: "record_burial", ...built.command }] };
      },
      correct(args) {
        const built = build(args.cells, args.recordId);
        if (!built.ok) return built;
        return {
          ok: true,
          placement: built.placement,
          normalized: built.normalized,
          recordId: args.recordId,
          commands: [{ type: "correct_burial", ...built.command }],
        };
      },
    };
  },
};

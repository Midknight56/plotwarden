// The churchyard adapter: the one object the template needs to run this register,
// the importer of the Burials sheet, and the names the search reads. Pure.
import { defineRegister } from "../../../template/src/adapter";
import type { Register, RegisterAdapter } from "../../../template/src/adapter";
import { BASE_COMMAND_TYPES } from "../../../template/src/base";
import { parseDateEntry } from "../../../template/src/calendar";
import type { DateOrder, PartialDate } from "../../../template/src/calendar";
import type { OpenImporter, SheetImporter } from "../../../template/src/data/importBatch";
import type { CellError } from "../../../template/src/data/mapping";
import type { StoredEvent } from "../../../template/src/events";
import { normalizeCode } from "../../../template/src/plot";
import type { SearchName } from "../../../template/src/search";
import type { Plot, Uuid } from "../../../template/src/types";
import { formatPartialDate } from "../../../template/src/ui/copy";
import { BURIAL_FIELDS, BURIALS_SHEET } from "./fields";
import { REVIEW_COMMAND_TYPES } from "../../../template/src/review";
import { CHURCH_COPY } from "./copy";
import { buildFamilyFile } from "./projection";
import { churchReviewFacts, churchReviewSupport } from "./review";
import { CHURCH_CTX, applyChurch, claimFloorOf, claimStartOf, decideChurch, emptyChurch, validateChurch } from "./rules";
import { BURIALS, CHURCH_COMMAND_TYPES, CHURCH_KIND } from "./types";
import type { Burial, ChurchCommand, ChurchEvent, ChurchState } from "./types";

export const churchAdapter: RegisterAdapter<ChurchState, ChurchCommand, ChurchEvent> = {
  kind: CHURCH_KIND,
  version: 1,
  spacesPerPlot: CHURCH_CTX.spacesPerPlot,
  fields: BURIAL_FIELDS,
  sheets: [BURIALS_SHEET],
  commands: [...BASE_COMMAND_TYPES, ...REVIEW_COMMAND_TYPES, ...CHURCH_COMMAND_TYPES],
  initialState: (site) => emptyChurch(site.id),
  validate: validateChurch,
  decide: decideChurch,
  apply: applyChurch,
  project(snapshot, audience, asOf) {
    if (audience === "private") return snapshot;
    if (audience === "committee") return churchReviewFacts(snapshot, asOf);
    // The visitor projection is pure, so its public IDs count up from 1. A downloaded file mints random ones.
    let n = 0;
    const built = buildFamilyFile(snapshot, { asOf, revision: 0, newPublicId: () => `p${++n}` });
    return built.ok ? built.file : null;
  },
  reports: [],
  reviewFacts: churchReviewFacts,
  claimFloor: claimFloorOf,
  review: churchReviewSupport,
  labels: CHURCH_COPY,
  theme: { ink: "#22252C", paper: "#FAF5E9", accent: "#232A5C", plotShape: "arch" },
};

export function churchRegister(): Register<ChurchState, ChurchCommand, ChurchEvent> {
  const made = defineRegister(churchAdapter);
  if (!made.ok) throw new Error(`The churchyard adapter was refused: ${JSON.stringify(made.error)}`);
  return made.value;
}

const collapse = (s: string | undefined): string => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const YES = /^(yes|y|true|1)$/i;

interface Where {
  plotId: Uuid;
  spaceId: Uuid;
  section: string;
  plot: string;
  space: string;
}

const activeSpaces = (plot: Plot) => plot.spaces.filter((s) => !s.retired);

/** The words that equal rows share, whichever way the burial came in. Built from where it is, not from the cells. */
function normalizedRow(v: { sourceRef: string; name: string; unknown: boolean; section: string; plot: string; space: string; dateText: string; page: string }): Record<string, string> {
  return {
    sourceRef: v.sourceRef,
    recordedName: collapse(v.name),
    nameUnknown: v.unknown ? "yes" : "",
    section: collapse(v.section),
    plot: collapse(v.plot),
    space: collapse(v.space),
    burialDate: collapse(v.dateText),
    page: collapse(v.page),
  };
}

function normalizedOf(state: ChurchState, b: Burial): Record<string, string> {
  const plot = b.plotId === undefined ? undefined : state.core.plots[b.plotId];
  const section = plot?.sectionId === undefined ? "" : (state.map.sections[plot.sectionId]?.name ?? "");
  const space = plot !== undefined && activeSpaces(plot).length > 1 ? (plot.spaces.find((s) => s.spaceId === b.spaceId)?.label ?? "") : "";
  return normalizedRow({ sourceRef: b.sourceRef, name: b.recordedName ?? "", unknown: b.nameUnknown, section, plot: plot?.code ?? "", space, dateText: b.dateText, page: b.page ?? "" });
}

const fault = (field: string, heading: string, value: string, code: string, fix: string): Omit<CellError, "row"> => ({ field, heading, value, code, fix });

function findEvent(events: readonly StoredEvent[], type: string, entityId: Uuid): StoredEvent | undefined {
  return events.find((e) => e.type === type && e.entityIds[0] === entityId);
}

export const burialsImporter: SheetImporter<ChurchState, ChurchCommand> = {
  sheet: BURIALS,
  sourceRefField: "sourceRef",
  placementField: "plot",
  open(state, options): OpenImporter<ChurchCommand> {
    const events = options.events ?? [];
    const plotsByCode = new Map<string, Plot>();
    for (const plot of Object.values(state.core.plots)) {
      plotsByCode.set(normalizeCode(plot.code), plot);
    }
    for (const plot of Object.values(state.core.plots)) {
      for (const prior of plot.priorCodes) if (!plotsByCode.has(normalizeCode(prior))) plotsByCode.set(normalizeCode(prior), plot);
    }
    const existing = new Map(
      Object.values(state.burials)
        .filter((b) => b.voided !== true)
        .map((b) => [b.sourceRef, { recordId: b.burialId, normalized: normalizedOf(state, b) }] as const),
    );

    type Located = { placement: "unplaced" } | { placement: "placed"; where: Where } | { error: Omit<CellError, "row"> };
    const locate = (cells: Record<string, string>): Located => {
      const plotText = collapse(cells["plot"]);
      if (plotText === "") return { placement: "unplaced" };
      const plot = plotsByCode.get(normalizeCode(plotText));
      if (plot === undefined) return { error: fault("plot", "Plot", cells["plot"] ?? "", "unknown_plot", "check_plot_code") };
      const sectionName = plot.sectionId === undefined ? "" : (state.map.sections[plot.sectionId]?.name ?? "");
      const sectionText = collapse(cells["section"]);
      if (sectionText !== "" && normalizeCode(sectionText) !== normalizeCode(sectionName)) {
        return { error: fault("section", "Section", cells["section"] ?? "", "wrong_section", "check_section") };
      }
      const spaces = activeSpaces(plot);
      const spaceText = collapse(cells["space"]);
      let space = spaces[0];
      if (spaceText !== "") {
        space = spaces.find((s) => normalizeCode(s.label) === normalizeCode(spaceText));
        if (space === undefined) return { error: fault("space", "Space", cells["space"] ?? "", "unknown_space", "choose_space") };
      } else if (spaces.length > 1) {
        return { error: fault("space", "Space", "", "space_needed", "choose_space") };
      }
      if (space === undefined) return { error: fault("plot", "Plot", cells["plot"] ?? "", "unknown_plot", "check_plot_code") };
      return { placement: "placed", where: { plotId: plot.plotId, spaceId: space.spaceId, section: sectionName, plot: plot.code, space: spaces.length > 1 ? space.label : "" } };
    };

    interface Built {
      ok: true;
      placement: "placed" | "unplaced";
      normalized: Record<string, string>;
      name?: string;
      unknown: boolean;
      date: PartialDate;
      dateText: string;
      page: string;
      where?: Where;
    }
    const build = (cells: Record<string, string>): Built | { ok: false; errors: Omit<CellError, "row">[] } => {
      const name = collapse(cells["recordedName"]);
      const unknown = YES.test(collapse(cells["nameUnknown"]));
      if (name !== "" && unknown) return { ok: false, errors: [fault("recordedName", "Recorded name", cells["recordedName"] ?? "", "name_and_unknown", "choose_one")] };
      if (name === "" && !unknown) return { ok: false, errors: [fault("recordedName", "Recorded name", "", "required", "enter_value")] };
      const order: DateOrder | undefined = options.dateOrder;
      const parsed = parseDateEntry(cells["burialDate"] ?? "", order === undefined ? undefined : { order });
      if (!parsed.ok) return { ok: false, errors: [fault("burialDate", "Burial date", cells["burialDate"] ?? "", parsed.error.code, "use_valid_date")] };
      const located = locate(cells);
      if ("error" in located) return { ok: false, errors: [located.error] };
      const where = located.placement === "placed" ? located.where : undefined;
      const dateText = collapse(cells["burialDate"]);
      const page = collapse(cells["page"]);
      const normalized = normalizedRow({
        sourceRef: cells["sourceRef"] ?? "",
        name,
        unknown,
        section: where?.section ?? "",
        plot: where?.plot ?? "",
        space: where?.space ?? "",
        dateText,
        page,
      });
      const built: Built = { ok: true, placement: located.placement, normalized, unknown, date: parsed.value.value, dateText, page };
      if (!unknown) built.name = name;
      if (where !== undefined) built.where = where;
      return built;
    };

    return {
      existing,
      stageRow(cells) {
        const built = build(cells);
        if (!built.ok) return built;
        const burialId = options.newId();
        const command: Extract<ChurchCommand, { type: "record_burial" }> = {
          type: "record_burial",
          burialId,
          sourceRef: cells["sourceRef"] ?? "",
          nameUnknown: built.unknown,
          date: built.date,
          dateText: built.dateText,
        };
        if (built.name !== undefined) command.recordedName = built.name;
        if (built.page !== "") command.page = built.page;
        if (built.where !== undefined) {
          command.plotId = built.where.plotId;
          command.spaceId = built.where.spaceId;
          command.claimId = options.newId();
        }
        return { ok: true, placement: built.placement, normalized: built.normalized, recordId: burialId, commands: [command] };
      },
      correct(args) {
        const built = build(args.cells);
        if (!built.ok) return built;
        const burial = state.burials[args.recordId];
        const original = findEvent(events, "burial_recorded", args.recordId);
        if (burial === undefined || original === undefined) {
          return { ok: false, errors: [fault("sourceRef", "Source ref", args.sourceRef, "original_missing", "open_latest")] };
        }
        const commands: ChurchCommand[] = [];
        const base = { burialId: args.recordId, correctsEventId: original.eventId, reason: "Import correction", correctionRef: args.sourceRef };
        const moved = built.where !== undefined && built.where.spaceId !== burial.spaceId;
        if (built.where === undefined && burial.spaceId !== undefined) {
          return { ok: false, errors: [fault("plot", "Plot", "", "cannot_unplace", "correct_entry")] };
        }
        const startChanges = burial.claimId !== undefined && !moved && claimStartOf(built.date) !== state.core.claims[burial.claimId]?.start;
        const identityChanges =
          built.unknown !== burial.nameUnknown || (built.name ?? "") !== (burial.recordedName ?? "") || built.dateText !== collapse(burial.dateText) || built.page !== collapse(burial.page ?? "");
        if (identityChanges) {
          const fix: Extract<ChurchCommand, { type: "correct_burial" }> = {
            type: "correct_burial",
            ...base,
            nameUnknown: built.unknown,
            date: built.date,
            dateText: built.dateText,
            page: built.page,
          };
          if (built.name !== undefined) fix.recordedName = built.name;
          if (startChanges && burial.claimId !== undefined) {
            const claimEvent = findEvent(events, "claim_added", burial.claimId);
            if (claimEvent === undefined) return { ok: false, errors: [fault("sourceRef", "Source ref", args.sourceRef, "original_missing", "open_latest")] };
            fix.claimId = options.newId();
            fix.claimEventId = claimEvent.eventId;
          }
          commands.push(fix);
        }
        if (moved && built.where !== undefined) {
          if (burial.spaceId === undefined) {
            commands.push({ type: "place_burial", burialId: args.recordId, plotId: built.where.plotId, spaceId: built.where.spaceId, claimId: options.newId() });
          } else {
            const claimEvent = burial.claimId === undefined ? undefined : findEvent(events, "claim_added", burial.claimId);
            if (claimEvent === undefined) return { ok: false, errors: [fault("sourceRef", "Source ref", args.sourceRef, "original_missing", "open_latest")] };
            commands.push({ type: "move_burial", ...base, spaceId: built.where.spaceId, claimId: options.newId(), claimEventId: claimEvent.eventId });
          }
        }
        return { ok: true, placement: built.placement, normalized: built.normalized, recordId: args.recordId, commands };
      },
    };
  },
};

/** The names the search reads. A burial with no plot is shown as "Location to confirm". */
export function churchRecords(state: ChurchState): { plotId?: Uuid; name: SearchName }[] {
  return Object.values(state.burials)
    .filter((b) => b.voided !== true)
    .map((b) => {
      const name: SearchName = {
        recordId: b.burialId,
        display: b.nameUnknown ? "Name unknown" : (b.recordedName ?? ""),
        sourceRef: b.sourceRef,
        source: b.sourceRef,
        date: formatPartialDate(b.date),
      };
      if (b.nameUnknown) name.nameUnknown = true;
      return b.plotId === undefined ? { name } : { plotId: b.plotId, name };
    });
}

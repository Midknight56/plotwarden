// The allotment adapter: the one object the template needs to run this register. Pure.
import { defineRegister } from "../../../template/src/adapter";
import type { Register, RegisterAdapter } from "../../../template/src/adapter";
import { BASE_COMMAND_TYPES } from "../../../template/src/base";
import { parseDateEntry } from "../../../template/src/calendar";
import type { DateOrder, LocalDate } from "../../../template/src/calendar";
import type { OpenImporter, SheetImporter } from "../../../template/src/data/importBatch";
import type { CellError } from "../../../template/src/data/mapping";
import { normalizeCode } from "../../../template/src/plot";
import type { SearchName } from "../../../template/src/search";
import type { Uuid } from "../../../template/src/types";
import { formatPartialDate } from "../../../template/src/ui/copy";
import { ALLOT_COPY } from "./copy";
import { ALL_FIELDS, TENANCIES_SHEET_DEF, WAITING_SHEET_DEF } from "./fields";
import { buildAvailabilityFile } from "./projection";
import { allotReviewFacts } from "./review";
import { ALLOT_CTX, applyAllot, decideAllot, emptyAllot, validateAllot } from "./rules";
import { ALLOT_COMMAND_TYPES, ALLOT_KIND, TENANCIES_SHEET, WAITING_SHEET } from "./types";
import type { AllotCommand, AllotEvent, AllotState } from "./types";

export const allotAdapter: RegisterAdapter<AllotState, AllotCommand, AllotEvent> = {
  kind: ALLOT_KIND,
  version: 1,
  usesCurrency: true,
  spacesPerPlot: ALLOT_CTX.spacesPerPlot,
  fields: ALL_FIELDS,
  sheets: [WAITING_SHEET_DEF, TENANCIES_SHEET_DEF],
  commands: [...BASE_COMMAND_TYPES, ...ALLOT_COMMAND_TYPES],
  initialState: (site) => emptyAllot(site.id, site.currency),
  validate: validateAllot,
  decide: decideAllot,
  apply: applyAllot,
  project(snapshot, audience, asOf) {
    if (audience === "private") return snapshot;
    if (audience === "committee") return allotReviewFacts(snapshot, asOf);
    // The visitor projection is pure, so its public IDs count up from 1. A downloaded file mints random ones.
    let n = 0;
    const built = buildAvailabilityFile(snapshot, { asOf, revision: 0, newPublicId: () => `p${++n}` });
    return built.ok ? built.file : null;
  },
  reports: [],
  reviewFacts: allotReviewFacts,
  labels: ALLOT_COPY,
  theme: { ink: "#1B312A", paper: "#F7F5E8", accent: "#2F6B4F", plotShape: "bed" },
};

export function allotRegister(): Register<AllotState, AllotCommand, AllotEvent> {
  const made = defineRegister(allotAdapter);
  if (!made.ok) throw new Error(`The allotment adapter was refused: ${JSON.stringify(made.error)}`);
  return made.value;
}

const collapse = (s: string | undefined): string => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const fold = (s: string): string => collapse(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const fault = (field: string, heading: string, value: string, code: string, fix: string): Omit<CellError, "row"> => ({ field, heading, value, code, fix });

/** A cell that must be one exact day. A year or a month is not enough for a joined date or a tenancy. */
function exactDay(text: string | undefined, order: DateOrder | undefined): { ok: true; date: LocalDate } | { ok: false; code: string } {
  const parsed = parseDateEntry(text ?? "", order === undefined ? undefined : { order });
  if (!parsed.ok) return { ok: false, code: parsed.error.code };
  const value = parsed.value.value;
  if (value.p !== "day") return { ok: false, code: "date_exact_needed" };
  const two = (n: number) => String(n).padStart(2, "0");
  return { ok: true, date: `${value.y}-${two(value.m)}-${two(value.d)}` };
}

export const waitingImporter: SheetImporter<AllotState, AllotCommand> = {
  sheet: WAITING_SHEET,
  sourceRefField: "sourceRef",
  placementField: "applicant",
  open(state, options): OpenImporter<AllotCommand> {
    const events = options.events ?? [];
    const sections = new Map<string, Uuid>();
    for (const s of Object.values(state.map.sections)) sections.set(normalizeCode(s.name), s.sectionId);
    const sectionName = (id: Uuid | undefined): string => (id === undefined ? "" : (state.map.sections[id]?.name ?? ""));

    const existing = new Map<string, { recordId: Uuid; normalized: Record<string, string> }>();
    for (const a of Object.values(state.applications)) {
      if (a.sourceRef === undefined) continue;
      const person = state.people[a.personId];
      existing.set(a.sourceRef, {
        recordId: a.applicationId,
        normalized: { sourceRef: a.sourceRef, applicant: collapse(person?.displayName), contact: collapse(person?.contact), joinedOn: a.joinedOn, preferredSection: collapse(sectionName(a.preferredSectionId)) },
      });
    }

    // Sequences for this import: the counter at the start plus the place in the file, or the Tie order.
    const base = state.nextSequence - 1;
    let place = 0;

    const build = (cells: Record<string, string>) => {
      place += 1;
      const errors: Omit<CellError, "row">[] = [];
      const applicant = collapse(cells["applicant"]);
      if (applicant === "") errors.push(fault("applicant", "Applicant", "", "required", "enter_value"));
      const day = exactDay(cells["joinedOn"], options.dateOrder);
      if (!day.ok) errors.push(fault("joinedOn", "Joined date", cells["joinedOn"] ?? "", day.code, "use_valid_date"));
      let tie: number | undefined;
      const tieText = collapse(cells["tieOrder"]);
      if (tieText !== "") {
        if (/^\d{1,6}$/.test(tieText) && Number(tieText) >= 1) tie = Number(tieText);
        else errors.push(fault("tieOrder", "Tie order", tieText, "bad_value", "enter_whole_number"));
      }
      let sectionId: Uuid | undefined;
      const sectionText = collapse(cells["preferredSection"]);
      if (sectionText !== "") {
        sectionId = sections.get(normalizeCode(sectionText));
        if (sectionId === undefined) errors.push(fault("preferredSection", "Preferred section", cells["preferredSection"] ?? "", "unknown_section", "check_section"));
      }
      if (errors.length > 0 || !day.ok) return { ok: false as const, errors };
      const normalized = {
        sourceRef: cells["sourceRef"] ?? "",
        applicant,
        contact: collapse(cells["contact"]),
        joinedOn: day.date,
        preferredSection: collapse(sectionName(sectionId)),
      };
      return { ok: true as const, applicant, day: day.date, tie, sectionId, normalized };
    };

    return {
      existing,
      stageRow(cells) {
        const built = build(cells);
        if (!built.ok) return built;
        const applicationId = options.newId();
        const command: Extract<AllotCommand, { type: "add_applicant" }> = {
          type: "add_applicant",
          applicationId,
          personId: options.newId(),
          name: built.applicant,
          joinedOn: built.day,
          sourceRef: cells["sourceRef"] ?? "",
          sequence: base + (built.tie ?? place),
        };
        const contact = collapse(cells["contact"]);
        if (contact !== "") command.contact = contact;
        if (built.sectionId !== undefined) command.preferredSectionId = built.sectionId;
        return { ok: true, placement: "placed", normalized: built.normalized, recordId: applicationId, commands: [command] };
      },
      correct(args) {
        const { before, after } = args;
        const same = (key: string): boolean => before[key] === after[key];
        const onlyDate = ["applicant", "contact", "preferredSection"].every(same) && before["joinedOn"] !== after["joinedOn"];
        if (!onlyDate) return { ok: false, errors: [fault("applicant", "Applicant", args.cells["applicant"] ?? "", "cannot_correct", "keep_current")] };
        const original = events.find((e) => e.type === "applicant_added" && e.entityIds[0] === args.recordId);
        if (original === undefined) return { ok: false, errors: [fault("sourceRef", "Source ref", args.sourceRef, "original_missing", "open_latest")] };
        const command: AllotCommand = { type: "correct_joined_on", applicationId: args.recordId, joinedOn: after["joinedOn"] as string, correctsEventId: original.eventId, reason: "Import correction" };
        return { ok: true, placement: "placed", normalized: after, recordId: args.recordId, commands: [command] };
      },
    };
  },
};

export const tenanciesImporter: SheetImporter<AllotState, AllotCommand> = {
  sheet: TENANCIES_SHEET,
  sourceRefField: "sourceRef",
  placementField: "plot",
  open(state, options): OpenImporter<AllotCommand> {
    const plotsByCode = new Map<string, { plotId: Uuid; code: string; spaceId: Uuid }>();
    for (const plot of Object.values(state.core.plots)) {
      const space = plot.spaces.find((s) => !s.retired);
      if (space === undefined) continue;
      plotsByCode.set(normalizeCode(plot.code), { plotId: plot.plotId, code: plot.code, spaceId: space.spaceId });
    }
    for (const plot of Object.values(state.core.plots)) {
      const space = plot.spaces.find((s) => !s.retired);
      if (space === undefined) continue;
      for (const prior of plot.priorCodes) if (!plotsByCode.has(normalizeCode(prior))) plotsByCode.set(normalizeCode(prior), { plotId: plot.plotId, code: plot.code, spaceId: space.spaceId });
    }

    const existing = new Map<string, { recordId: Uuid; normalized: Record<string, string> }>();
    for (const t of Object.values(state.tenancies)) {
      if (t.sourceRef === undefined) continue;
      const person = state.people[t.personId];
      existing.set(t.sourceRef, {
        recordId: t.tenancyId,
        normalized: {
          sourceRef: t.sourceRef,
          plot: state.core.plots[t.plotId]?.code ?? "",
          holder: collapse(person?.displayName),
          contact: collapse(person?.contact),
          start: t.start,
          end: t.endExclusive ?? "",
        },
      });
    }

    // One person for a holder named twice in this file with the same contact. Same name alone is never a match.
    const holders = new Map<string, Uuid>();

    return {
      existing,
      stageRow(cells) {
        const errors: Omit<CellError, "row">[] = [];
        const where = plotsByCode.get(normalizeCode(collapse(cells["plot"])));
        if (where === undefined) errors.push(fault("plot", "Plot", cells["plot"] ?? "", "unknown_plot", "check_plot_code"));
        const holder = collapse(cells["holder"]);
        if (holder === "") errors.push(fault("holder", "Plot holder", "", "required", "enter_value"));
        const start = exactDay(cells["start"], options.dateOrder);
        if (!start.ok) errors.push(fault("start", "Tenancy begins", cells["start"] ?? "", start.code, "use_valid_date"));
        const endText = collapse(cells["end"]);
        const end = endText === "" ? undefined : exactDay(endText, options.dateOrder);
        if (end !== undefined && !end.ok) errors.push(fault("end", "Tenancy ends", endText, end.code, "use_valid_date"));
        if (errors.length > 0 || where === undefined || !start.ok) return { ok: false, errors };
        const contact = collapse(cells["contact"]);
        const key = `${fold(holder)}|${contact}`;
        let personId = contact === "" ? undefined : holders.get(key);
        if (personId === undefined) {
          personId = options.newId();
          if (contact !== "") holders.set(key, personId);
        }
        const endDay = end !== undefined && end.ok ? end.date : "";
        const normalized = { sourceRef: cells["sourceRef"] ?? "", plot: where.code, holder, contact, start: start.date, end: endDay };
        const tenancyId = options.newId();
        const command: Extract<AllotCommand, { type: "record_tenancy" }> = {
          type: "record_tenancy",
          tenancyId,
          claimId: options.newId(),
          personId,
          holderName: holder,
          spaceId: where.spaceId,
          start: start.date,
          sourceRef: cells["sourceRef"] ?? "",
        };
        if (contact !== "") command.contact = contact;
        if (endDay !== "") command.endExclusive = endDay;
        return { ok: true, placement: "placed", normalized, recordId: tenancyId, commands: [command] };
      },
      correct(args) {
        return { ok: false, errors: [fault("sourceRef", "Source ref", args.sourceRef, "cannot_correct", "keep_current")] };
      },
    };
  },
};

/** The names the search reads: each holder at their plot, each applicant with no plot. */
export function allotRecords(state: AllotState): { plotId?: Uuid; name: SearchName }[] {
  const out: { plotId?: Uuid; name: SearchName }[] = [];
  for (const t of Object.values(state.tenancies)) {
    const name: SearchName = { recordId: t.tenancyId, display: state.people[t.personId]?.displayName ?? "", date: t.start };
    if (t.sourceRef !== undefined) {
      name.sourceRef = t.sourceRef;
      name.source = t.sourceRef;
    }
    out.push({ plotId: t.plotId, name });
  }
  for (const a of Object.values(state.applications)) {
    if (a.state === "withdrawn") continue;
    const name: SearchName = { recordId: a.applicationId, display: state.people[a.personId]?.displayName ?? "", date: formatPartialDate({ p: "day", y: Number(a.joinedOn.slice(0, 4)), m: Number(a.joinedOn.slice(5, 7)), d: Number(a.joinedOn.slice(8, 10)) }) };
    if (a.sourceRef !== undefined) {
      name.sourceRef = a.sourceRef;
      name.source = a.sourceRef;
    }
    out.push({ name });
  }
  return out;
}
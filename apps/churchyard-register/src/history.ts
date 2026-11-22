// History and the period report. Pure. A report counts by the date of each event, never by
// the state of a plot today. A partial burial date keeps its precision: it counts inside only if
// every day it could mean is inside, outside if none is, and otherwise as "Date incomplete".
import { classifyInPeriod, coveredInterval } from "../../../template/src/calendar";
import type { LocalDate } from "../../../template/src/calendar";
import { toCsv } from "../../../template/src/data/csvExport";
import { spaceStateAt } from "../../../template/src/status";
import type { StoredEvent } from "../../../template/src/events";
import type { PhysicalState } from "../../../template/src/types";
import type { ReportTable } from "../../../template/src/output/print";
import { formatPartialDate } from "../../../template/src/ui/copy";
import type { Burial, ChurchState, Reservation } from "./types";

export interface PeriodReport {
  from: LocalDate;
  through: LocalDate;
  asOf: LocalDate;
  revision: number;
  /** Corrections are applied: the report is built from the current state. */
  basis: "current_corrections";
  burials: { inside: Burial[]; incomplete: Burial[]; outside: number };
  reservationsMade: Reservation[];
  reservationsReleased: Reservation[];
  /** By "YYYY-MM". Burials count here only when the date is known to the month. */
  months: Record<string, { burials: number; made: number; released: number }>;
  empty: boolean;
}

export interface OpenSpace {
  plotId: string;
  code: string;
  spaceLabel: string;
  /** Labels of the spaces in the same plot that hold a burial. Empty when the whole plot is free. */
  occupied: string[];
}

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

const byDate = (a: Burial, b: Burial): number => {
  const first = (x: Burial) => coveredInterval(x.date)?.first ?? "9999-99-99";
  const fa = first(a);
  const fb = first(b);
  return fa === fb ? natural(a.sourceRef, b.sourceRef) : fa < fb ? -1 : 1;
};

export function periodReport(
  state: ChurchState,
  input: { from: LocalDate; through: LocalDate; asOf: LocalDate; revision: number },
): PeriodReport {
  const period = { from: input.from, through: input.through };
  const live = Object.values(state.burials).filter((b) => b.voided !== true);
  const inside: Burial[] = [];
  const incomplete: Burial[] = [];
  let outside = 0;
  const months: PeriodReport["months"] = {};
  const month = (key: string) => (months[key] ??= { burials: 0, made: 0, released: 0 });

  for (const burial of live) {
    const where = classifyInPeriod(burial.date, period);
    if (where === "inside") {
      inside.push(burial);
      if (burial.date.p === "day" || burial.date.p === "month") {
        month(`${burial.date.y}-${String(burial.date.m).padStart(2, "0")}`).burials += 1;
      }
    } else if (where === "incomplete") incomplete.push(burial);
    else outside += 1;
  }

  const within = (day: LocalDate): boolean => day >= input.from && day <= input.through;
  const reservations = Object.values(state.reservations);
  const made = reservations.filter((r) => within(r.start)).sort((a, b) => (a.start === b.start ? natural(a.sourceRef ?? "", b.sourceRef ?? "") : a.start < b.start ? -1 : 1));
  const released = reservations
    .filter((r) => r.released !== undefined && within(r.released.on))
    .sort((a, b) => ((a.released?.on ?? "") < (b.released?.on ?? "") ? -1 : 1));
  for (const r of made) month(r.start.slice(0, 7)).made += 1;
  for (const r of released) month((r.released?.on ?? "").slice(0, 7)).released += 1;

  return {
    from: input.from,
    through: input.through,
    asOf: input.asOf,
    revision: input.revision,
    basis: "current_corrections",
    burials: { inside: inside.sort(byDate), incomplete: incomplete.sort(byDate), outside },
    reservationsMade: made,
    reservationsReleased: released,
    months,
    empty: inside.length + incomplete.length + made.length + released.length === 0,
  };
}

/** Checked free spaces at a date. A free space in a part occupied plot names the spaces that hold a burial. */
export function openSpaces(state: ChurchState, asOf: LocalDate): OpenSpace[] {
  const out: OpenSpace[] = [];
  const plots = Object.values(state.core.plots).sort((a, b) => natural(a.code, b.code));
  for (const plot of plots) {
    const spaces = plot.spaces.filter((s) => !s.retired);
    const views = spaces.map((s) => ({ space: s, view: spaceStateAt(state.core, s.spaceId, asOf) }));
    const occupied = views.filter((v) => v.view?.state === "taken").map((v) => v.space.label);
    for (const { space, view } of views) {
      if (view?.checked === true && view.state === "free") out.push({ plotId: plot.plotId, code: plot.code, spaceLabel: space.label, occupied });
    }
  }
  return out;
}

/** Burials with no space, in source ref order. They are not part of the four states. */
export function unplacedBurials(state: ChurchState): Burial[] {
  return Object.values(state.burials)
    .filter((b) => b.voided !== true && b.spaceId === undefined)
    .sort((a, b) => natural(a.sourceRef, b.sourceRef));
}

export type Say = (key: string, values?: Record<string, string | number>) => string;

export interface PlotChoice {
  plotId: string;
  code: string;
  sectionId?: string;
  sectionName: string;
  spaces: { spaceId: string; label: string; checked: boolean; state?: PhysicalState }[];
  burials: Burial[];
  reservations: Reservation[];
}

/** The ID of the stored event of a type whose first entity is the given ID. */
export function findEventId(events: readonly StoredEvent[], type: string, entityId: string): string | undefined {
  return events.find((e) => e.type === type && e.entityIds[0] === entityId)?.eventId;
}

/** Every plot in code order, with its spaces, what each space is at the date, and what the plot holds. */
export function plotChoices(state: ChurchState, asOf: LocalDate): PlotChoice[] {
  const burials = Object.values(state.burials).filter((b) => b.voided !== true);
  const reservations = Object.values(state.reservations);
  return Object.values(state.core.plots)
    .filter((p) => !p.archived)
    .sort((a, b) => natural(a.code, b.code))
    .map((plot) => {
      const choice: PlotChoice = {
        plotId: plot.plotId,
        code: plot.code,
        sectionName: plot.sectionId === undefined ? "" : (state.map.sections[plot.sectionId]?.name ?? ""),
        spaces: plot.spaces
          .filter((s) => !s.retired)
          .map((s) => {
            const view = spaceStateAt(state.core, s.spaceId, asOf);
            const space: PlotChoice["spaces"][number] = { spaceId: s.spaceId, label: s.label, checked: s.checked };
            if (view?.state !== undefined) space.state = view.state;
            return space;
          }),
        burials: burials.filter((b) => b.plotId === plot.plotId),
        reservations: reservations.filter((r) => r.plotId === plot.plotId),
      };
      if (plot.sectionId !== undefined) choice.sectionId = plot.sectionId;
      return choice;
    });
}

const plotOf = (state: ChurchState, plotId: string | undefined) => (plotId === undefined ? undefined : state.core.plots[plotId]);
const labelOf = (state: ChurchState, plotId: string | undefined, spaceId: string | undefined): string =>
  plotOf(state, plotId)?.spaces.find((s) => s.spaceId === spaceId)?.label ?? "";

/** The one sentence for an open space. A free space in a part occupied plot says where the burials are. */
function openLine(state: ChurchState, open: OpenSpace, say: Say): string {
  const plot = state.core.plots[open.plotId];
  const several = (plot?.spaces.filter((s) => !s.retired).length ?? 1) > 1;
  if (!several) return say("openPlotFree", { code: open.code });
  const free = say("openSpaceFree", { code: open.code, space: open.spaceLabel });
  if (open.occupied.length === 0) return free;
  const holds = open.occupied.length === 1 ? say("holdsOne", { spaces: open.occupied[0] as string }) : say("holdsMany", { spaces: open.occupied.join(", ") });
  return `${free} ${holds}`;
}

interface Flat {
  part: string;
  columns: string[];
  rows: string[][];
  csv: string[][];
}

function parts(state: ChurchState, report: PeriodReport, say: Say): Flat[] {
  const name = (b: Burial): string => (b.nameUnknown ? say("nameUnknown") : (b.recordedName ?? ""));
  const burialRow = (b: Burial): string[] => [b.sourceRef, name(b), formatPartialDate(b.date), plotOf(state, b.plotId)?.code ?? ""];
  const burialCsv = (part: string, b: Burial): string[] => [part, b.sourceRef, name(b), formatPartialDate(b.date), plotOf(state, b.plotId)?.code ?? "", labelOf(state, b.plotId, b.spaceId), ""];
  const open = openSpaces(state, report.asOf);
  const unplaced = unplacedBurials(state);
  const inside = say("reportBurials");
  const incomplete = say("dateIncomplete");
  const made = say("reservationsMade");
  const released = say("reservationsReleased");
  const spaces = say("openSpaces");
  const lost = say("locationToConfirm");
  const ref = (r: { sourceRef?: string }): string => r.sourceRef ?? "";
  const code = (r: { plotId: string }): string => plotOf(state, r.plotId)?.code ?? "";
  return [
    { part: inside, columns: [say("sourceRefLabel"), say("nameHeading"), say("dateHeading"), say("plotLabel")], rows: report.burials.inside.map(burialRow), csv: report.burials.inside.map((b) => burialCsv(inside, b)) },
    { part: incomplete, columns: [say("sourceRefLabel"), say("nameHeading"), say("dateHeading"), say("plotLabel")], rows: report.burials.incomplete.map(burialRow), csv: report.burials.incomplete.map((b) => burialCsv(incomplete, b)) },
    {
      part: made,
      columns: [say("sourceRefLabel"), say("plotLabel"), say("spaceLabel"), say("startHeading")],
      rows: report.reservationsMade.map((r) => [ref(r), code(r), labelOf(state, r.plotId, r.spaceId), r.start]),
      csv: report.reservationsMade.map((r) => [made, ref(r), "", r.start, code(r), labelOf(state, r.plotId, r.spaceId), ""]),
    },
    {
      part: released,
      columns: [say("sourceRefLabel"), say("plotLabel"), say("spaceLabel"), say("releasedHeading"), say("reasonHeading")],
      rows: report.reservationsReleased.map((r) => [ref(r), code(r), labelOf(state, r.plotId, r.spaceId), r.released?.on ?? "", r.released?.reason ?? ""]),
      csv: report.reservationsReleased.map((r) => [released, ref(r), "", r.released?.on ?? "", code(r), labelOf(state, r.plotId, r.spaceId), r.released?.reason ?? ""]),
    },
    {
      part: spaces,
      columns: [spaces],
      rows: open.map((o) => [openLine(state, o, say)]),
      csv: open.map((o) => [spaces, "", "", "", o.code, o.spaceLabel, openLine(state, o, say)]),
    },
    {
      part: lost,
      columns: [say("sourceRefLabel"), say("nameHeading"), say("dateHeading")],
      rows: unplaced.map((b) => [b.sourceRef, name(b), formatPartialDate(b.date)]),
      csv: unplaced.map((b) => [lost, b.sourceRef, name(b), formatPartialDate(b.date), "", "", ""]),
    },
  ];
}

/** The private report as a plain table, for the screen, the print document and the CSV. */
export function reportTable(state: ChurchState, report: PeriodReport, say: Say): ReportTable {
  const flat = parts(state, report, say);
  const total = (i: number): string => String(flat[i]?.rows.length ?? 0);
  const sections: ReportTable["sections"] = flat.map((p, i) => ({
    heading: p.part,
    columns: p.columns,
    rows: p.rows,
    emptyText: i === 5 ? say("noUnplaced") : say("noEventsInPeriod"),
  }));
  const kept = report.empty ? sections.filter((s, i) => i === 0 || (i >= 4 && s.rows.length > 0)) : sections;
  return {
    title: say("reportHeading"),
    subtitle: say("privateRegisterReport"),
    scope: [say("reportFromLine", { date: report.from }), say("reportThroughLine", { date: report.through }), say("reportBasis", { date: report.asOf, revision: report.revision })],
    totals: [
      { label: say("reportBurials"), value: total(0) },
      { label: say("dateIncomplete"), value: total(1) },
      { label: say("reservationsMade"), value: total(2) },
      { label: say("reservationsReleased"), value: total(3) },
      { label: say("openSpaces"), value: total(4) },
    ],
    sections: kept,
    footer: say("reportPrivateFooter"),
  };
}

/** The private CSV. A cell that starts like a formula is escaped by `toCsv`. */
export function reportCsv(state: ChurchState, report: PeriodReport, say: Say): string {
  const headings = [say("partHeading"), say("sourceRefLabel"), say("nameHeading"), say("dateHeading"), say("plotLabel"), say("spaceLabel"), say("detailHeading")];
  return toCsv(headings, parts(state, report, say).flatMap((p) => p.csv));
}

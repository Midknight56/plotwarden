// The market stall adapter: the one object the template needs to run this register, the importer of the
// Stalls sheet, and the names the search reads. Pure. The shared template is used as it is.
import { defineRegister } from "../../../template/src/adapter";
import type { Register, RegisterAdapter } from "../../../template/src/adapter";
import { BASE_COMMAND_TYPES } from "../../../template/src/base";
import type { SheetImporter } from "../../../template/src/data/importBatch";
import type { CellError } from "../../../template/src/data/mapping";
import type { AvailabilityFile } from "../../../template/src/output/privacy";
import { normalizeCode } from "../../../template/src/plot";
import { REVIEW_COMMAND_TYPES } from "../../../template/src/review";
import type { SearchName } from "../../../template/src/search";
import { plotSummaryAt } from "../../../template/src/status";
import type { Uuid } from "../../../template/src/types";
import { MARKET_COPY } from "./copy";
import { STALL_FIELDS, STALLS_SHEET_DEF } from "./fields";
import { MARKET_CTX, applyMarket, decideMarket, emptyMarket, validateMarket } from "./rules";
import { MARKET_COMMAND_TYPES, MARKET_KIND, MAX_CM, MIN_CM, STALLS_SHEET } from "./types";
import type { MarketCommand, MarketEvent, MarketState } from "./types";

/**
 * The visitor file: the free stalls and nothing else. A trader, a width and a reservation never appear.
 * Public IDs count up from 1, so the same register gives the same file.
 */
function availabilityOf(state: MarketState, asOf: string): AvailabilityFile {
  let n = 0;
  const freePlots = Object.values(state.core.plots)
    .filter((plot) => {
      const summary = plotSummaryAt(state.core, plot.plotId, asOf);
      return summary !== undefined && summary.spaceCount > 0 && !summary.needsChecking && summary.counts.free === summary.spaceCount;
    })
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .map((plot) => ({ id: `p${++n}`, code: plot.code, sectionId: "stalls" }));
  return {
    format: "plot.availability.v1",
    asOf,
    siteTitle: "Market stalls",
    north: 0,
    gate: { name: "Market gate", x: 0, y: 0 },
    paths: [],
    sections: [{ id: "stalls", label: "Stalls" }],
    freePlots,
    neutralGround: [],
    instructions: "Ask at the market office about a stall.",
  };
}

export const marketAdapter: RegisterAdapter<MarketState, MarketCommand, MarketEvent> = {
  kind: MARKET_KIND,
  version: 1,
  spacesPerPlot: MARKET_CTX.spacesPerPlot,
  fields: STALL_FIELDS,
  sheets: [STALLS_SHEET_DEF],
  commands: [...BASE_COMMAND_TYPES, ...REVIEW_COMMAND_TYPES, ...MARKET_COMMAND_TYPES],
  initialState: (site) => emptyMarket(site.id),
  validate: validateMarket,
  decide: decideMarket,
  apply: applyMarket,
  project(snapshot, audience, asOf) {
    if (audience === "private") return snapshot;
    if (audience === "committee") return [];
    return availabilityOf(snapshot, asOf);
  },
  reports: [],
  reviewFacts: () => [],
  labels: MARKET_COPY,
  theme: { ink: "#2B2118", paper: "#F6EFE3", accent: "#8A4B1F" },
};

export function marketRegister(): Register<MarketState, MarketCommand, MarketEvent> {
  const made = defineRegister(marketAdapter);
  if (!made.ok) throw new Error(`The market adapter was refused: ${JSON.stringify(made.error)}`);
  return made.value;
}

const collapse = (s: string | undefined): string => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const fault = (field: string, heading: string, value: string, code: string, fix: string): Omit<CellError, "row"> => ({ field, heading, value, code, fix });

/** The Stalls sheet: one row sets the frontage of one stall. The stall code is the source ref. */
export const stallsImporter: SheetImporter<MarketState, MarketCommand> = {
  sheet: STALLS_SHEET,
  sourceRefField: "stallCode",
  placementField: "stallCode",
  open(state) {
    const plotsByCode = new Map(Object.values(state.core.plots).map((p) => [normalizeCode(p.code), p] as const));
    const existing = new Map(
      Object.values(state.core.plots)
        .filter((p) => state.frontage[p.plotId] !== undefined)
        .map((p) => [p.code, { recordId: p.plotId, normalized: { stallCode: p.code, frontage: String(state.frontage[p.plotId]) } }] as const),
    );
    const build = (cells: Record<string, string>) => {
      const code = collapse(cells["stallCode"]);
      const plot = plotsByCode.get(normalizeCode(code));
      if (plot === undefined) return { ok: false as const, errors: [fault("stallCode", "Stall code", cells["stallCode"] ?? "", "unknown_plot", "check_plot_code")] };
      const text = collapse(cells["frontage"]);
      const cm = /^\d+$/.test(text) ? Number(text) : Number.NaN;
      if (!Number.isInteger(cm) || cm < MIN_CM || cm > MAX_CM) {
        return { ok: false as const, errors: [fault("frontage", "Frontage cm", cells["frontage"] ?? "", "out_of_range", "enter_value")] };
      }
      return {
        ok: true as const,
        plot,
        cm,
        normalized: { stallCode: plot.code, frontage: String(cm) },
        command: { type: "set_frontage", plotId: plot.plotId, frontageCm: cm, sourceRef: collapse(cells["stallCode"]), sheet: STALLS_SHEET } as MarketCommand,
      };
    };
    return {
      existing,
      stageRow(cells) {
        const built = build(cells);
        if (!built.ok) return built;
        return { ok: true, placement: "placed", normalized: built.normalized, recordId: built.plot.plotId, commands: [built.command] };
      },
      correct(args) {
        const built = build(args.cells);
        if (!built.ok) return built;
        return { ok: true, placement: "placed", normalized: built.normalized, recordId: args.recordId, commands: [built.command] };
      },
    };
  },
};

/** The names the search reads: each trader, found at the stall they hold. */
export function marketRecords(state: MarketState): { plotId?: Uuid; name: SearchName }[] {
  return Object.values(state.reservations).map((r) => ({
    plotId: r.plotId,
    name: { recordId: r.reservationId, display: r.trader, source: "Reservation", date: r.start },
  }));
}

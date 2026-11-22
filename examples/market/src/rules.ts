// The rules of the market stall register. Pure. The width rule: a trader who needs a width reserves a
// stall only if the stall's frontage is at least that wide. A stall with no frontage recorded is never
// read as wide enough.
import { applyBase, decideBase, emptyBase, isBaseCommand, validateBase } from "../../../template/src/base";
import type { BaseCommand } from "../../../template/src/base";
import { isValidLocalDate } from "../../../template/src/calendar";
import type { LocalDate } from "../../../template/src/calendar";
import { decideCore } from "../../../template/src/commands";
import { CORE_PAYLOAD_VERSION } from "../../../template/src/events";
import type { DraftEvent } from "../../../template/src/events";
import { checkText } from "../../../template/src/limits";
import { err, ok } from "../../../template/src/types";
import type { FieldError, Result } from "../../../template/src/types";
import { MARKET_COMMAND_TYPES, MAX_CM, MIN_CM } from "./types";
import type { MarketCommand, MarketEvent, MarketState } from "./types";

/** A stall is one plot with one space. */
export const MARKET_CTX = { spacesPerPlot: { min: 1, max: 1 } };

const OWN: ReadonlySet<string> = new Set(MARKET_COMMAND_TYPES);

export function emptyMarket(siteId: string): MarketState {
  return { ...emptyBase(siteId), frontage: {}, reservations: {} };
}

const wholeCm = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value >= MIN_CM && value <= MAX_CM;

export function validateMarket(command: MarketCommand, state: MarketState): FieldError[] {
  if (isBaseCommand(command)) return validateBase(command as BaseCommand, state);
  const fields: FieldError[] = [];
  if (command.type === "set_frontage") {
    if (!wholeCm(command.frontageCm)) fields.push({ field: "frontageCm", code: "out_of_range" });
    return fields;
  }
  if (command.type === "reserve_stall") {
    if (typeof command.trader !== "string" || command.trader.trim() === "") fields.push({ field: "trader", code: "required" });
    else if (!checkText("nameChars", command.trader.trim()).ok) fields.push({ field: "trader", code: "over_limit" });
    if (!wholeCm(command.neededCm)) fields.push({ field: "neededCm", code: "out_of_range" });
    if (!isValidLocalDate(command.start)) fields.push({ field: "start", code: "invalid_date" });
  }
  return fields;
}

function draft(event: MarketEvent, entityIds: string[], on: LocalDate, sourceRef?: string): DraftEvent<MarketEvent> {
  const d: DraftEvent<MarketEvent> = { event, entityIds, effectiveOn: on, payloadVersion: CORE_PAYLOAD_VERSION };
  if (sourceRef !== undefined) d.sourceRef = sourceRef;
  return d;
}

export function decideMarket(state: MarketState, command: MarketCommand, on: LocalDate): Result<DraftEvent<MarketEvent>[]> {
  if (isBaseCommand(command)) return decideBase(state, command as BaseCommand, on, MARKET_CTX) as Result<DraftEvent<MarketEvent>[]>;
  if (!OWN.has(command.type)) return err("unknown_command", { type: command.type });

  if (command.type === "set_frontage") {
    if (state.core.plots[command.plotId] === undefined) return err("no_such_plot", { plotId: command.plotId });
    const event: MarketEvent = { type: "frontage_set", plotId: command.plotId, frontageCm: command.frontageCm };
    if (command.sheet !== undefined) event.sheet = command.sheet;
    return ok([draft(event, [command.plotId], on, command.sourceRef)]);
  }

  // reserve_stall
  const plot = state.core.plots[command.plotId];
  if (plot === undefined) return err("no_such_plot", { plotId: command.plotId });
  if (state.reservations[command.reservationId] !== undefined) return err("duplicate_id", { id: command.reservationId });
  const space = plot.spaces.find((s) => !s.retired);
  if (space === undefined) return err("no_such_space", { plotId: command.plotId });
  const frontage = state.frontage[command.plotId];
  if (frontage === undefined) return err("frontage_unknown", { code: plot.code });
  if (command.neededCm > frontage) return err("stall_too_narrow", { code: plot.code, needed: command.neededCm, frontage });

  // The hold is a core claim, so status, history, backup and restore treat it like any other.
  const claim = decideCore(
    state.core,
    { type: "add_claim", claimId: command.claimId, spaceId: space.spaceId, mode: "held", start: command.start, endable: true, ref: command.reservationId },
    on,
    MARKET_CTX,
  );
  if (!claim.ok) return claim;
  const reservation = {
    reservationId: command.reservationId,
    plotId: command.plotId,
    spaceId: space.spaceId,
    claimId: command.claimId,
    trader: command.trader.trim(),
    neededCm: command.neededCm,
    start: command.start,
  };
  return ok([...(claim.value as DraftEvent<MarketEvent>[]), draft({ type: "stall_reserved", reservation }, [command.reservationId, command.plotId, space.spaceId], on)]);
}

export function applyMarket(state: MarketState, event: MarketEvent): MarketState {
  const base = applyBase(state, event);
  if (base !== undefined) return base;
  switch (event.type) {
    case "frontage_set":
      return { ...state, frontage: { ...state.frontage, [event.plotId]: event.frontageCm } };
    case "stall_reserved":
      return { ...state, reservations: { ...state.reservations, [event.reservation.reservationId]: event.reservation } };
    default:
      return state;
  }
}

// The market stall register: its state, commands and events. A stall is a plot with one space. It has a
// frontage in whole centimetres. A trader needs a width, and a stall reserves only if it is wide enough.
// This is the third use. It adds one rule on top of the shared foundation and changes nothing in it.
import type { BaseCommand, BaseEvent, BaseState } from "../../../template/src/base";
import type { LocalDate } from "../../../template/src/calendar";
import type { Uuid } from "../../../template/src/types";

export const MARKET_KIND = "market";
export const STALLS_SHEET = "Stalls";

/** A stall and a trader are measured in whole centimetres, from 1 to 10,000. */
export const MIN_CM = 1;
export const MAX_CM = 10_000;

export interface StallReservation {
  reservationId: Uuid;
  plotId: Uuid;
  spaceId: Uuid;
  claimId: Uuid;
  /** The trader's name. Private. It never reaches a visitor file. */
  trader: string;
  neededCm: number;
  start: LocalDate;
}

export interface MarketState extends BaseState {
  /** Frontage in whole centimetres, by plot. A stall with no entry has no frontage recorded. */
  frontage: Record<Uuid, number>;
  reservations: Record<Uuid, StallReservation>;
}

export type MarketCommand =
  | BaseCommand
  | { type: "set_frontage"; plotId: Uuid; frontageCm: number; sourceRef?: string; sheet?: typeof STALLS_SHEET }
  | { type: "reserve_stall"; reservationId: Uuid; claimId: Uuid; plotId: Uuid; trader: string; neededCm: number; start: LocalDate };

export type MarketEvent =
  | BaseEvent
  | { type: "frontage_set"; plotId: Uuid; frontageCm: number; sheet?: typeof STALLS_SHEET }
  | { type: "stall_reserved"; reservation: StallReservation };

export const MARKET_COMMAND_TYPES = ["set_frontage", "reserve_stall"] as const;
export const MARKET_EVENT_TYPES = ["frontage_set", "stall_reserved"] as const;

// The churchyard state, commands and events. Pure: no React, no IndexedDB.
// A burial is the record of one deceased person. A living holder is a person record
// of its own and is never copied into a burial. Design K2 and K3.
import type { LocalDate, PartialDate } from "../../../template/src/calendar";
import type { BaseCommand, BaseEvent, BaseState } from "../../../template/src/base";
import type { Uuid } from "../../../template/src/types";

export const CHURCH_KIND = "churchyard";
export const BURIALS = "Burials";

export interface Person {
  personId: Uuid;
  displayName: string;
  contact?: string;
}

export interface Burial {
  burialId: Uuid;
  sheet: typeof BURIALS;
  /** The exact original text. */
  sourceRef: string;
  recordedName?: string;
  nameUnknown: boolean;
  date: PartialDate;
  /** The date as it was entered. */
  dateText: string;
  plotId?: Uuid;
  spaceId?: Uuid;
  claimId?: Uuid;
  /** Burials the keeper linked as one person share this key. */
  personKey?: Uuid;
  voided?: boolean;
  /** The source page, as entered. Private. */
  page?: string;
  /** Source refs of the corrections made to this burial, in order. */
  correctionRefs: string[];
}

export interface Reservation {
  reservationId: Uuid;
  plotId: Uuid;
  spaceId: Uuid;
  claimId: Uuid;
  holderId: Uuid;
  start: LocalDate;
  sourceRef?: string;
  fromRequest?: Uuid;
  released?: { on: LocalDate; reason: string };
  convertedTo?: Uuid;
}

/** A living person who wants the next free space. It holds nothing. */
export interface Request {
  requestId: Uuid;
  holderId: Uuid;
  note?: string;
  on: LocalDate;
  reservationId?: Uuid;
}

export interface Memorial {
  memorialId: Uuid;
  burialId: Uuid;
  /** The wording, exactly as typed. */
  reading: string;
  unclear: boolean;
  pageRef?: string;
  photoIds: Uuid[];
}

export interface Approval {
  burialId: Uuid;
  /** The name shown to visitors. */
  name: string;
  includeYear: boolean;
  /** What the keeper saw. A change to any of it returns the approval to review. */
  basis: { recordedName: string; nameUnknown: boolean; year?: number; plotId?: Uuid };
  withdrawn?: boolean;
}

export interface PublicSettings {
  siteName?: string;
  gateName?: string;
  directions?: string;
  sectionNames: Record<Uuid, string>;
  pathNames: Record<Uuid, string>;
  plotCodes: Record<Uuid, string>;
}

export interface ChurchState extends BaseState {
  people: Record<Uuid, Person>;
  burials: Record<Uuid, Burial>;
  reservations: Record<Uuid, Reservation>;
  requests: Record<Uuid, Request>;
  memorials: Record<Uuid, Memorial>;
  approvals: Record<Uuid, Approval>;
  pub: PublicSettings;
  /** "idA|idB", sorted, from "Keep separate". */
  separate: Record<string, true>;
}

export type ApprovalStatus = "none" | "approved" | "review";

interface Correction {
  /** The event this one corrects, from the stored events. */
  correctsEventId: Uuid;
  reason: string;
  /** The source of the correction, for example the page that shows the right value. */
  correctionRef: string;
}

export type ChurchCommand =
  | BaseCommand
  | {
      type: "record_burial";
      burialId: Uuid;
      sourceRef: string;
      recordedName?: string;
      nameUnknown?: boolean;
      date: PartialDate;
      dateText: string;
      plotId?: Uuid;
      spaceId?: Uuid;
      claimId?: Uuid;
      /** Name a reservation to convert it. A reserved space is otherwise refused. */
      reservationId?: Uuid;
      page?: string;
    }
  | { type: "place_burial"; burialId: Uuid; plotId: Uuid; spaceId: Uuid; claimId: Uuid; reservationId?: Uuid }
  | ({
      type: "correct_burial";
      burialId: Uuid;
      recordedName?: string;
      nameUnknown?: boolean;
      date?: PartialDate;
      dateText?: string;
      page?: string;
      /** Needed when the new date changes the day the claim starts. */
      claimId?: Uuid;
      claimEventId?: Uuid;
    } & Correction)
  | ({
      type: "move_burial";
      burialId: Uuid;
      spaceId: Uuid;
      claimId: Uuid;
      /** The event that added the old claim. */
      claimEventId: Uuid;
    } & Correction)
  | ({ type: "void_burial"; burialId: Uuid; claimEventId?: Uuid } & Correction)
  | { type: "add_space"; plotId: Uuid; spaceId: Uuid; label?: string }
  | {
      type: "record_reservation";
      reservationId: Uuid;
      holderId: Uuid;
      holderName: string;
      contact?: string;
      spaceId: Uuid;
      claimId: Uuid;
      start: LocalDate;
      sourceRef?: string;
    }
  | { type: "add_request"; requestId: Uuid; holderId: Uuid; holderName: string; contact?: string; note?: string }
  | { type: "fulfil_request"; requestId: Uuid; reservationId: Uuid; spaceId: Uuid; claimId: Uuid; start: LocalDate }
  | { type: "release_reservation"; reservationId: Uuid; reason: string }
  | {
      type: "save_reading";
      memorialId: Uuid;
      burialId: Uuid;
      reading: string;
      unclear: boolean;
      pageRef?: string;
    }
  | { type: "settle_reading"; memorialId: Uuid }
  | { type: "link_stone_photo"; memorialId: Uuid; photoId: Uuid }
  | { type: "approve_burial"; burialId: Uuid; name?: string; includeYear: boolean }
  | { type: "withdraw_approval"; burialId: Uuid }
  | {
      type: "set_public";
      siteName?: string;
      gateName?: string;
      directions?: string;
      sectionNames?: Record<Uuid, string>;
      pathNames?: Record<Uuid, string>;
      plotCodes?: Record<Uuid, string>;
    }
  | { type: "keep_separate"; burialId: Uuid; otherBurialId: Uuid }
  | { type: "link_burials"; burialId: Uuid; otherBurialId: Uuid; personKey: Uuid };

export const CHURCH_COMMAND_TYPES = [
  "record_burial",
  "place_burial",
  "correct_burial",
  "move_burial",
  "void_burial",
  "add_space",
  "record_reservation",
  "add_request",
  "fulfil_request",
  "release_reservation",
  "save_reading",
  "settle_reading",
  "link_stone_photo",
  "approve_burial",
  "withdraw_approval",
  "set_public",
  "keep_separate",
  "link_burials",
] as const;

export type ChurchEvent =
  | BaseEvent
  | ({ type: "burial_recorded"; reservationId?: Uuid } & Burial)
  | { type: "burial_placed"; burialId: Uuid; plotId: Uuid; spaceId: Uuid; claimId: Uuid; reservationId?: Uuid }
  | { type: "burial_corrected"; burialId: Uuid; recordedName?: string; nameUnknown: boolean; date: PartialDate; dateText: string; page?: string; claimId?: Uuid; correctionRef: string; reason: string }
  | { type: "burial_moved"; burialId: Uuid; plotId: Uuid; spaceId: Uuid; claimId: Uuid; correctionRef: string; reason: string }
  | { type: "burial_voided"; burialId: Uuid; correctionRef: string; reason: string }
  | { type: "space_added"; plotId: Uuid; spaceId: Uuid; label: string }
  | { type: "reservation_recorded"; reservation: Reservation; holder?: Person }
  | { type: "request_added"; request: Request; holder?: Person }
  | { type: "reservation_released"; reservationId: Uuid; on: LocalDate; reason: string }
  | { type: "reading_saved"; memorial: Memorial }
  | { type: "reading_settled"; memorialId: Uuid }
  | { type: "stone_photo_linked"; memorialId: Uuid; photoId: Uuid }
  | { type: "burial_approved"; approval: Approval }
  | { type: "approval_withdrawn"; burialId: Uuid }
  | { type: "public_set"; pub: Partial<PublicSettings> }
  | { type: "kept_separate"; key: string }
  | { type: "burials_linked"; burialIds: Uuid[]; personKey: Uuid };

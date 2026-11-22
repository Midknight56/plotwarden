// The allotment state, commands and events. Pure: no React, no IndexedDB.
// An applicant, a holder and a person with a receipt are living people, kept in `people` and never public.
// Money is a whole number of minor units. Design G2 and G3.
import type { LocalDate } from "../../../template/src/calendar";
import type { BaseCommand, BaseEvent, BaseState } from "../../../template/src/base";
import type { Currency, Uuid } from "../../../template/src/types";

export const ALLOT_KIND = "allotment";
export const WAITING_SHEET = "Waiting list";
export const TENANCIES_SHEET = "Tenancies";

export interface Person {
  personId: Uuid;
  displayName: string;
  contact?: string;
}

export type ApplicationState = "waiting" | "offered" | "housed" | "withdrawn";

export interface Application {
  applicationId: Uuid;
  personId: Uuid;
  joinedOn: LocalDate;
  /** Fixed when the application is first committed. Never recomputed. */
  sequence: number;
  preferredSectionId?: Uuid;
  sourceRef?: string;
  state: ApplicationState;
  offerId?: Uuid;
  withdrawn?: { on: LocalDate; reason: string };
}

export type SkipKind = "pending" | "preference" | "exceptional";

export interface Skip {
  applicationId: Uuid;
  kind: SkipKind;
  /** The keeper's reason. Present for an exceptional skip. */
  reason?: string;
}

export type OfferState = "open" | "accepted" | "declined" | "released";

export interface Offer {
  offerId: Uuid;
  applicationId: Uuid;
  plotId: Uuid;
  spaceId: Uuid;
  claimId: Uuid;
  offeredOn: LocalDate;
  replyBy?: LocalDate;
  state: OfferState;
  skipped: Skip[];
  closed?: { on: LocalDate; choice?: "keep_place" | "leave_list"; withdrew?: boolean; reason?: string };
  tenancyId?: Uuid;
}

export interface Tenancy {
  tenancyId: Uuid;
  personId: Uuid;
  plotId: Uuid;
  spaceId: Uuid;
  claimId: Uuid;
  start: LocalDate;
  /** The first day not covered. Absent means open. */
  endExclusive?: LocalDate;
  sourceRef?: string;
  fromOffer?: Uuid;
  /** The tenancy this one took over from on the same day or after a gap. */
  handoverFrom?: Uuid;
}

export interface Season {
  seasonId: Uuid;
  name: string;
  start: LocalDate;
  endExclusive: LocalDate;
  dueOn?: LocalDate;
  /** Minor units. Used for future charges only. */
  standardFee: number;
}

export type LedgerType = "charge" | "receipt" | "reversal";

export interface LedgerEntry {
  entryId: Uuid;
  tenancyId: Uuid;
  seasonId: Uuid;
  type: LedgerType;
  /** Minor units. A waiver is a charge of 0 with `waiver`. */
  minorUnits: number;
  /** The effective date: the day assessed, received or reversed. */
  on: LocalDate;
  /** For a receipt: the charge it pays. For a reversal: the charge of the entry it undoes. */
  chargeId?: Uuid;
  /** For a reversal: the entry it undoes. */
  reverses?: Uuid;
  waiver?: string;
  ref?: string;
  reason?: string;
}

export interface PublicSettings {
  siteName?: string;
  gateName?: string;
  instructions?: string;
  sectionNames: Record<Uuid, string>;
  pathNames: Record<Uuid, string>;
  plotCodes: Record<Uuid, string>;
  /** Free plots the keeper chose to list. A plot appears only while it is also free. */
  listed: Record<Uuid, true>;
}

export interface AllotState extends BaseState {
  currency?: Currency;
  people: Record<Uuid, Person>;
  applications: Record<Uuid, Application>;
  /** The next join sequence. Starts at 1. */
  nextSequence: number;
  offers: Record<Uuid, Offer>;
  tenancies: Record<Uuid, Tenancy>;
  seasons: Record<Uuid, Season>;
  ledger: Record<Uuid, LedgerEntry>;
  pub: PublicSettings;
}

export type AllotCommand =
  | BaseCommand
  | {
      type: "add_applicant";
      applicationId: Uuid;
      personId: Uuid;
      /** Needed for a new person. Ignored for a person who is already in the register. */
      name?: string;
      contact?: string;
      joinedOn: LocalDate;
      preferredSectionId?: Uuid;
      sourceRef?: string;
      /** From an import that gives a place in the file or a Tie order. Never from a screen. */
      sequence?: number;
    }
  | { type: "correct_joined_on"; applicationId: Uuid; joinedOn: LocalDate; correctsEventId: Uuid; reason: string }
  | { type: "withdraw_applicant"; applicationId: Uuid; reason: string }
  | {
      type: "make_offer";
      offerId: Uuid;
      applicationId: Uuid;
      spaceId: Uuid;
      claimId: Uuid;
      replyBy?: LocalDate;
      /** The reason for each exceptional skip, by application ID. */
      skipReasons?: Record<Uuid, string>;
    }
  | { type: "accept_offer"; offerId: Uuid; tenancyId: Uuid; claimId: Uuid }
  | { type: "decline_offer"; offerId: Uuid; choice?: "keep_place" | "leave_list"; reason?: string }
  | { type: "release_offer"; offerId: Uuid; withdraw?: boolean; reason?: string }
  | {
      type: "record_tenancy";
      tenancyId: Uuid;
      claimId: Uuid;
      personId: Uuid;
      holderName?: string;
      contact?: string;
      spaceId: Uuid;
      start: LocalDate;
      endExclusive?: LocalDate;
      sourceRef?: string;
    }
  | { type: "end_tenancy"; tenancyId: Uuid; reason?: string }
  | {
      type: "hand_over";
      tenancyId: Uuid;
      newTenancyId: Uuid;
      claimId: Uuid;
      personId: Uuid;
      holderName?: string;
      contact?: string;
      sourceRef?: string;
    }
  | { type: "set_currency"; currency: Currency }
  | { type: "new_season"; seasonId: Uuid; name: string; start: LocalDate; endExclusive: LocalDate; dueOn?: LocalDate; standardFee: number }
  | { type: "apply_charges"; seasonId: Uuid; items: { chargeId: Uuid; tenancyId: Uuid; amount?: number; waiveReason?: string }[] }
  | { type: "record_receipt"; receiptId: Uuid; chargeId: Uuid; amount: number; ref?: string }
  | { type: "reverse_entry"; reversalId: Uuid; entryId: Uuid; reason: string }
  | {
      type: "set_public";
      siteName?: string;
      gateName?: string;
      instructions?: string;
      sectionNames?: Record<Uuid, string>;
      pathNames?: Record<Uuid, string>;
      plotCodes?: Record<Uuid, string>;
      listed?: Uuid[];
    };

export const ALLOT_COMMAND_TYPES = [
  "add_applicant",
  "correct_joined_on",
  "withdraw_applicant",
  "make_offer",
  "accept_offer",
  "decline_offer",
  "release_offer",
  "record_tenancy",
  "end_tenancy",
  "hand_over",
  "set_currency",
  "new_season",
  "apply_charges",
  "record_receipt",
  "reverse_entry",
  "set_public",
] as const;

export type AllotEvent =
  | BaseEvent
  | { type: "applicant_added"; sheet: typeof WAITING_SHEET; application: Application; person?: Person }
  | { type: "joined_on_corrected"; applicationId: Uuid; joinedOn: LocalDate; reason: string }
  | { type: "applicant_withdrawn"; applicationId: Uuid; on: LocalDate; reason: string }
  | { type: "offer_made"; offer: Offer }
  | { type: "offer_accepted"; offerId: Uuid; on: LocalDate; tenancy: Tenancy }
  | { type: "offer_declined"; offerId: Uuid; on: LocalDate; choice: "keep_place" | "leave_list"; reason?: string }
  | { type: "offer_released"; offerId: Uuid; on: LocalDate; withdrew: boolean; reason?: string }
  | { type: "tenancy_started"; sheet: typeof TENANCIES_SHEET; tenancy: Tenancy; holder?: Person }
  | { type: "tenancy_ended"; tenancyId: Uuid; on: LocalDate; reason?: string }
  | { type: "currency_set"; currency: Currency }
  | { type: "season_added"; season: Season }
  | { type: "charge_applied"; entry: LedgerEntry }
  | { type: "receipt_recorded"; entry: LedgerEntry }
  | { type: "entry_reversed"; entry: LedgerEntry }
  | { type: "public_set"; pub: Partial<PublicSettings> };

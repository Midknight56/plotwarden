// Allotment rules: decide and apply. Pure: no I/O, no random choice. Every ID comes from the command.
// An application keeps its join sequence for ever. Offers, tenancies and fees follow in later tasks.
import { intervalCovers, intervalsOverlap, isValidLocalDate } from "../../../template/src/calendar";
import type { LocalDate } from "../../../template/src/calendar";
import { BASE_COMMAND_TYPES, applyBase, decideBase, emptyBase, validateBase } from "../../../template/src/base";
import type { BaseCommand } from "../../../template/src/base";
import { decideCore } from "../../../template/src/commands";
import type { CoreCommand } from "../../../template/src/commands";
import { CORE_PAYLOAD_VERSION, applyCore } from "../../../template/src/events";
import type { CoreEvent, DraftEvent } from "../../../template/src/events";
import { checkLimit, checkText } from "../../../template/src/limits";
import { formatMoney } from "../../../template/src/money";
import { orderQueue } from "../../../template/src/queue";
import { err, ok } from "../../../template/src/types";
import type { Currency, DomainError, FieldError, Plot, Result, Uuid } from "../../../template/src/types";
import { availableAt, chargeIdOf, hasAnyCharge, liveChargeOf, liveReceipts } from "./fees";
import { ALLOT_COMMAND_TYPES, TENANCIES_SHEET, WAITING_SHEET } from "./types";
import type { AllotCommand, AllotEvent, AllotState, Application, LedgerEntry, Offer, Person, PublicSettings, Season, Skip, Tenancy } from "./types";

export const ALLOT_CTX = { spacesPerPlot: { min: 1, max: 1 } };

type Own = Exclude<AllotCommand, BaseCommand>;
type Cmd<T extends Own["type"]> = Extract<Own, { type: T }>;
type Drafts = DraftEvent<AllotEvent>[];

const BASE_NAMES: ReadonlySet<string> = new Set(BASE_COMMAND_TYPES);
const OWN_NAMES: ReadonlySet<string> = new Set(ALLOT_COMMAND_TYPES);
const isBase = (type: string): boolean => BASE_NAMES.has(type);

export function emptyAllot(siteId: Uuid, currency?: Currency): AllotState {
  return {
    ...emptyBase(siteId),
    ...(currency === undefined ? {} : { currency }),
    people: {},
    applications: {},
    nextSequence: 1,
    offers: {},
    tenancies: {},
    seasons: {},
    ledger: {},
    pub: { sectionNames: {}, pathNames: {}, plotCodes: {}, listed: {} },
  };
}

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";

function dateField(field: string, value: string | undefined): FieldError[] {
  if (blank(value)) return [{ field, code: "required" }];
  return isValidLocalDate(value as string) ? [] : [{ field, code: "invalid_date" }];
}

function reasonFields(reason: string | undefined): FieldError[] {
  if (blank(reason)) return [{ field: "reason", code: "required" }];
  if (!checkText("noteChars", reason as string).ok) return [{ field: "reason", code: "over_limit" }];
  return [];
}

const CURRENCIES: readonly Currency[] = ["GBP", "EUR", "USD", "CAD"];

/** An amount of money: required, a whole number of minor units above zero, and within the limit. */
function amountFields(field: string, amount: number | undefined, requiredField: boolean): FieldError[] {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return requiredField || amount === undefined ? [{ field, code: "required" }] : [];
  if (!Number.isInteger(amount) || amount <= 0) return [{ field, code: "bad_amount" }];
  if (!checkLimit("moneyMinorUnits", amount).ok) return [{ field, code: "over_limit" }];
  return [];
}

/** A new holder needs a name. A person who is already in the register needs none. */
function holderFields(state: AllotState, personId: Uuid, name: string | undefined, contact: string | undefined): FieldError[] {
  const fields: FieldError[] = [];
  if (state.people[personId] === undefined) {
    if (blank(name)) fields.push({ field: "holder", code: "required" });
    else if (!checkText("nameChars", (name as string).trim()).ok) fields.push({ field: "holder", code: "over_limit" });
  }
  if (contact !== undefined && !checkText("noteChars", contact).ok) fields.push({ field: "contact", code: "over_limit" });
  return fields;
}

/** Shape checks that need no other record. Each error names its field. */
export function validateAllot(command: AllotCommand, state: AllotState): FieldError[] {
  if (isBase(command.type)) return validateBase(command as BaseCommand, state);
  const c = command as Own;
  const fields: FieldError[] = [];
  switch (c.type) {
    case "add_applicant": {
      if (state.people[c.personId] === undefined) {
        if (blank(c.name)) fields.push({ field: "applicant", code: "required" });
        else if (!checkText("nameChars", (c.name as string).trim()).ok) fields.push({ field: "applicant", code: "over_limit" });
      }
      if (c.contact !== undefined && !checkText("noteChars", c.contact).ok) fields.push({ field: "contact", code: "over_limit" });
      fields.push(...dateField("joinedOn", c.joinedOn));
      if (c.sourceRef !== undefined && !checkText("sourceRefChars", c.sourceRef).ok) fields.push({ field: "sourceRef", code: "over_limit" });
      if (c.sequence !== undefined && (!Number.isInteger(c.sequence) || c.sequence < 1)) fields.push({ field: "sequence", code: "bad_value" });
      return fields;
    }
    case "correct_joined_on":
      fields.push(...dateField("joinedOn", c.joinedOn), ...reasonFields(c.reason));
      if (blank(c.correctsEventId)) fields.push({ field: "correctsEventId", code: "required" });
      return fields;
    case "withdraw_applicant":
      return reasonFields(c.reason);
    case "make_offer":
      if (!blank(c.replyBy) && !isValidLocalDate(c.replyBy as string)) fields.push({ field: "replyBy", code: "invalid_date" });
      return fields;
    case "accept_offer":
      return fields;
    case "decline_offer":
      if (c.choice !== "keep_place" && c.choice !== "leave_list") fields.push({ field: "choice", code: "required" });
      if (c.reason !== undefined && !checkText("noteChars", c.reason).ok) fields.push({ field: "reason", code: "over_limit" });
      return fields;
    case "release_offer":
      if (c.withdraw === true) fields.push(...reasonFields(c.reason));
      else if (c.reason !== undefined && !checkText("noteChars", c.reason).ok) fields.push({ field: "reason", code: "over_limit" });
      return fields;
    case "record_tenancy": {
      fields.push(...holderFields(state, c.personId, c.holderName, c.contact), ...dateField("start", c.start));
      if (!blank(c.endExclusive)) {
        const end = dateField("end", c.endExclusive);
        fields.push(...end);
        if (end.length === 0 && isValidLocalDate(c.start) && (c.endExclusive as string) <= c.start) fields.push({ field: "end", code: "bad_interval" });
      }
      if (c.sourceRef !== undefined && !checkText("sourceRefChars", c.sourceRef).ok) fields.push({ field: "sourceRef", code: "over_limit" });
      return fields;
    }
    case "end_tenancy":
      if (c.reason !== undefined && !checkText("noteChars", c.reason).ok) fields.push({ field: "reason", code: "over_limit" });
      return fields;
    case "hand_over":
      fields.push(...holderFields(state, c.personId, c.holderName, c.contact));
      if (c.sourceRef !== undefined && !checkText("sourceRefChars", c.sourceRef).ok) fields.push({ field: "sourceRef", code: "over_limit" });
      return fields;
    case "set_currency":
      if (!CURRENCIES.includes(c.currency)) fields.push({ field: "currency", code: "bad_value" });
      return fields;
    case "new_season": {
      if (blank(c.name)) fields.push({ field: "seasonName", code: "required" });
      else if (!checkText("nameChars", c.name.trim()).ok) fields.push({ field: "seasonName", code: "over_limit" });
      fields.push(...dateField("start", c.start));
      const end = dateField("end", c.endExclusive);
      fields.push(...end);
      if (end.length === 0 && isValidLocalDate(c.start) && c.endExclusive <= c.start) fields.push({ field: "end", code: "bad_interval" });
      if (!blank(c.dueOn) && !isValidLocalDate(c.dueOn as string)) fields.push({ field: "due", code: "invalid_date" });
      fields.push(...amountFields("standardFee", c.standardFee, false));
      return fields;
    }
    case "apply_charges": {
      if (c.items.length === 0) fields.push({ field: "items", code: "required" });
      for (const item of c.items) {
        const waiver = !blank(item.waiveReason);
        if (waiver && item.amount !== undefined && item.amount !== 0) fields.push({ field: "standardFee", code: "bad_amount" });
        else if (!waiver && item.amount !== undefined) {
          if (item.amount === 0) fields.push({ field: "reason", code: "required" });
          else fields.push(...amountFields("standardFee", item.amount, false));
        }
        if (item.waiveReason !== undefined && !checkText("noteChars", item.waiveReason).ok) fields.push({ field: "reason", code: "over_limit" });
      }
      return fields;
    }
    case "record_receipt":
      fields.push(...amountFields("amount", c.amount, true));
      if (c.ref !== undefined && !checkText("sourceRefChars", c.ref).ok) fields.push({ field: "receiptRef", code: "over_limit" });
      return fields;
    case "reverse_entry":
      return reasonFields(c.reason);
    case "set_public": {
      const words: [string, string | undefined, "nameChars" | "noteChars"][] = [
        ["siteName", c.siteName, "nameChars"],
        ["gateName", c.gateName, "nameChars"],
        ["instructions", c.instructions, "noteChars"],
      ];
      for (const [field, value, limit] of words) if (value !== undefined && !checkText(limit, value.trim()).ok) fields.push({ field, code: "over_limit" });
      for (const map of [c.sectionNames, c.pathNames]) {
        for (const value of Object.values(map ?? {})) if (!checkText("nameChars", value.trim()).ok) fields.push({ field: "publicName", code: "over_limit" });
      }
      for (const value of Object.values(c.plotCodes ?? {})) if (!checkText("plotCodeChars", value.trim()).ok) fields.push({ field: "publicCode", code: "over_limit" });
      return fields;
    }
    default:
      throw new Error("not implemented");
  }
}

function draft(
  event: AllotEvent,
  entityIds: string[],
  on: LocalDate,
  extra?: { sourceRef?: string; corrects?: Uuid },
): DraftEvent<AllotEvent> {
  const out: DraftEvent<AllotEvent> = { event, entityIds, effectiveOn: on, payloadVersion: CORE_PAYLOAD_VERSION };
  if (extra?.sourceRef !== undefined) out.sourceRef = extra.sourceRef;
  if (extra?.corrects !== undefined) out.corrects = extra.corrects;
  return out;
}

export function decideAllot(state: AllotState, command: AllotCommand, on: LocalDate): Result<Drafts> {
  if (isBase(command.type)) return decideBase(state, command as BaseCommand, on, ALLOT_CTX) as Result<Drafts>;
  if (!OWN_NAMES.has(command.type)) return err("unknown_command", { type: command.type });
  const c = command as Own;
  switch (c.type) {
    case "add_applicant":
      return addApplicant(state, c, on);
    case "correct_joined_on":
      return correctJoinedOn(state, c, on);
    case "withdraw_applicant":
      return withdrawApplicant(state, c, on);
    case "make_offer":
      return makeOffer(state, c, on);
    case "accept_offer":
      return acceptOffer(state, c, on);
    case "decline_offer":
      return declineOffer(state, c, on);
    case "release_offer":
      return releaseOffer(state, c, on);
    case "record_tenancy":
      return recordTenancy(state, c, on);
    case "end_tenancy":
      return endTenancy(state, c, on);
    case "hand_over":
      return handOver(state, c, on);
    case "set_currency":
      return setCurrency(state, c, on);
    case "new_season":
      return newSeason(state, c, on);
    case "apply_charges":
      return applyCharges(state, c, on);
    case "record_receipt":
      return recordReceipt(state, c, on);
    case "reverse_entry":
      return reverseEntry(state, c, on);
    case "set_public":
      return setPublic(state, c, on);
    default:
      throw new Error("not implemented");
  }
}

const isOpen = (a: Application): boolean => a.state === "waiting" || a.state === "offered";

function addApplicant(state: AllotState, c: Cmd<"add_applicant">, on: LocalDate): Result<Drafts> {
  if (state.applications[c.applicationId] !== undefined) return err("duplicate_id", { id: c.applicationId });
  const known = state.people[c.personId];
  if (known !== undefined && Object.values(state.applications).some((a) => a.personId === c.personId && isOpen(a))) {
    return err("open_request", { personId: c.personId });
  }
  if (c.preferredSectionId !== undefined && state.map.sections[c.preferredSectionId] === undefined) {
    return err("no_such_section", { sectionId: c.preferredSectionId });
  }
  if (c.sequence !== undefined && Object.values(state.applications).some((a) => a.sequence === c.sequence)) {
    return err("sequence_used", { sequence: c.sequence });
  }
  const application: Application = {
    applicationId: c.applicationId,
    personId: c.personId,
    joinedOn: c.joinedOn,
    sequence: c.sequence ?? state.nextSequence,
    state: "waiting",
  };
  if (c.preferredSectionId !== undefined) application.preferredSectionId = c.preferredSectionId;
  if (!blank(c.sourceRef)) application.sourceRef = (c.sourceRef as string).trim();
  const event: AllotEvent = { type: "applicant_added", sheet: WAITING_SHEET, application };
  if (known === undefined) {
    const person: Person = { personId: c.personId, displayName: (c.name as string).trim() };
    if (!blank(c.contact)) person.contact = (c.contact as string).trim();
    event.person = person;
  }
  return ok([draft(event, [c.applicationId, c.personId], on, application.sourceRef === undefined ? undefined : { sourceRef: application.sourceRef })]);
}

function correctJoinedOn(state: AllotState, c: Cmd<"correct_joined_on">, on: LocalDate): Result<Drafts> {
  const application = state.applications[c.applicationId];
  if (application === undefined) return err("no_such_application", { applicationId: c.applicationId });
  if (!isOpen(application)) return err("not_waiting", { applicationId: c.applicationId });
  const event: AllotEvent = { type: "joined_on_corrected", applicationId: c.applicationId, joinedOn: c.joinedOn, reason: c.reason.trim() };
  return ok([draft(event, [c.applicationId], on, { corrects: c.correctsEventId })]);
}

function withdrawApplicant(state: AllotState, c: Cmd<"withdraw_applicant">, on: LocalDate): Result<Drafts> {
  const application = state.applications[c.applicationId];
  if (application === undefined) return err("no_such_application", { applicationId: c.applicationId });
  if (application.state === "offered") return err("offer_open", { applicationId: c.applicationId, offerId: application.offerId });
  if (application.state !== "waiting") return err("not_waiting", { applicationId: c.applicationId });
  return ok([draft({ type: "applicant_withdrawn", applicationId: c.applicationId, on, reason: c.reason.trim() }, [c.applicationId], on)]);
}

export function applyAllot(state: AllotState, event: AllotEvent): AllotState {
  const base = applyBase(state, event);
  if (base !== undefined) return base;
  const e = event as Exclude<AllotEvent, { type: "plot_added" }>;
  switch (e.type) {
    case "applicant_added": {
      const people = e.person === undefined ? state.people : { ...state.people, [e.person.personId]: e.person };
      return {
        ...state,
        people,
        applications: { ...state.applications, [e.application.applicationId]: e.application },
        nextSequence: Math.max(state.nextSequence, e.application.sequence + 1),
      };
    }
    case "joined_on_corrected": {
      const application = state.applications[e.applicationId];
      if (application === undefined) return state;
      return { ...state, applications: { ...state.applications, [e.applicationId]: { ...application, joinedOn: e.joinedOn } } };
    }
    case "applicant_withdrawn": {
      const application = state.applications[e.applicationId];
      if (application === undefined) return state;
      const next: Application = { ...application, state: "withdrawn", withdrawn: { on: e.on, reason: e.reason } };
      return { ...state, applications: { ...state.applications, [e.applicationId]: next } };
    }
    case "offer_made": {
      const application = state.applications[e.offer.applicationId];
      const applications = application === undefined ? state.applications : { ...state.applications, [application.applicationId]: { ...application, state: "offered" as const, offerId: e.offer.offerId } };
      return { ...state, applications, offers: { ...state.offers, [e.offer.offerId]: e.offer } };
    }
    case "offer_accepted": {
      const offer = state.offers[e.offerId];
      if (offer === undefined) return state;
      const application = state.applications[offer.applicationId];
      const applications = application === undefined ? state.applications : { ...state.applications, [application.applicationId]: { ...application, state: "housed" as const } };
      return {
        ...state,
        applications,
        offers: { ...state.offers, [e.offerId]: { ...offer, state: "accepted", closed: { on: e.on }, tenancyId: e.tenancy.tenancyId } },
        tenancies: { ...state.tenancies, [e.tenancy.tenancyId]: e.tenancy },
      };
    }
    case "offer_declined": {
      const offer = state.offers[e.offerId];
      if (offer === undefined) return state;
      const closed: NonNullable<Offer["closed"]> = { on: e.on, choice: e.choice };
      if (e.reason !== undefined) closed.reason = e.reason;
      return {
        ...state,
        applications: reopenApplication(state, offer, e.on, e.choice === "leave_list", e.reason ?? "Declined offer"),
        offers: { ...state.offers, [e.offerId]: { ...offer, state: "declined", closed } },
      };
    }
    case "currency_set":
      return { ...state, currency: e.currency };
    case "public_set": {
      const next = { ...state.pub, ...e.pub };
      for (const key of ["siteName", "gateName", "instructions"] as const) if (next[key] === "") delete next[key];
      return { ...state, pub: next };
    }
    case "season_added":
      return { ...state, seasons: { ...state.seasons, [e.season.seasonId]: e.season } };
    case "charge_applied":
    case "receipt_recorded":
    case "entry_reversed":
      return { ...state, ledger: { ...state.ledger, [e.entry.entryId]: e.entry } };
    case "tenancy_started": {
      const people = e.holder === undefined ? state.people : { ...state.people, [e.holder.personId]: e.holder };
      return { ...state, people, tenancies: { ...state.tenancies, [e.tenancy.tenancyId]: e.tenancy } };
    }
    case "tenancy_ended": {
      const tenancy = state.tenancies[e.tenancyId];
      if (tenancy === undefined) return state;
      return { ...state, tenancies: { ...state.tenancies, [e.tenancyId]: { ...tenancy, endExclusive: e.on } } };
    }
    case "offer_released": {
      const offer = state.offers[e.offerId];
      if (offer === undefined) return state;
      const closed: NonNullable<Offer["closed"]> = { on: e.on, withdrew: e.withdrew };
      if (e.reason !== undefined) closed.reason = e.reason;
      return {
        ...state,
        applications: reopenApplication(state, offer, e.on, e.withdrew, e.reason ?? "Offer released"),
        offers: { ...state.offers, [e.offerId]: { ...offer, state: "released", closed } },
      };
    }
    default:
      throw new Error("not implemented");
  }
}

export interface QueueRow {
  applicationId: Uuid;
  personId: Uuid;
  name: string;
  joinedOn: LocalDate;
  sequence: number;
  /** 1 for the first in the order. */
  position: number;
  /** Has an open offer: stays in the order and is never the next applicant. */
  pending: boolean;
  preferredSectionId?: Uuid;
}

/** The waiting list in order: joined date, then sequence, then application ID. Pending offers keep their place. */
export function queueView(state: AllotState): QueueRow[] {
  const entries = Object.values(state.applications)
    .filter(isOpen)
    .map((a) => ({ applicationId: a.applicationId, joinedOn: a.joinedOn, sequence: a.sequence, pending: a.state === "offered" }));
  return orderQueue(entries).map((entry, index) => {
    const application = state.applications[entry.applicationId] as Application;
    const row: QueueRow = {
      applicationId: entry.applicationId,
      personId: application.personId,
      name: state.people[application.personId]?.displayName ?? "",
      joinedOn: entry.joinedOn,
      sequence: entry.sequence,
      position: index + 1,
      pending: entry.pending,
    };
    if (application.preferredSectionId !== undefined) row.preferredSectionId = application.preferredSectionId;
    return row;
  });
}

/** The first applicant in order who has no open offer. */
export function nextApplicant(state: AllotState): QueueRow | undefined {
  return queueView(state).find((row) => !row.pending);
}

export interface OfferPlan {
  /** The first applicant in order who has no open offer and whose preference fits the plot. */
  firstFit?: QueueRow;
  /** Every applicant ahead of the chosen one, with why each is passed over. */
  skipped: Skip[];
}

/** Who is passed over when this plot is offered to this application. */
export function offerPlan(state: AllotState, plotId: Uuid, applicationId: Uuid): OfferPlan {
  const sectionId = state.core.plots[plotId]?.sectionId;
  const rows = queueView(state);
  const fits = (row: QueueRow): boolean => row.preferredSectionId === undefined || row.preferredSectionId === sectionId;
  const plan: OfferPlan = { skipped: [] };
  const firstFit = rows.find((row) => !row.pending && fits(row));
  if (firstFit !== undefined) plan.firstFit = firstFit;
  const index = rows.findIndex((row) => row.applicationId === applicationId);
  if (index > 0) {
    plan.skipped = rows.slice(0, index).map((row): Skip => ({ applicationId: row.applicationId, kind: row.pending ? "pending" : fits(row) ? "exceptional" : "preference" }));
  }
  return plan;
}

/** An open offer is overdue the day after its reply date. No reply date is never overdue. */
export function isOverdue(offer: Offer, asOf: LocalDate): boolean {
  return offer.state === "open" && offer.replyBy !== undefined && asOf > offer.replyBy;
}

/** Run a core command on a working copy and give back its drafts and the new core state. */
function core(state: AllotState, command: CoreCommand, on: LocalDate): Result<{ drafts: Drafts; next: AllotState }> {
  const decided = decideCore(state.core, command, on, ALLOT_CTX);
  if (!decided.ok) return decided;
  let working = state.core;
  for (const d of decided.value) working = applyCore(working, d.event as CoreEvent);
  return ok({ drafts: decided.value as unknown as Drafts, next: { ...state, core: working } });
}

function findPlotOfSpace(state: AllotState, spaceId: Uuid): Plot | undefined {
  return Object.values(state.core.plots).find((p) => p.spaces.some((s) => s.spaceId === spaceId && !s.retired));
}

/** Why a claim could not be added: the plot is not free, or another offer holds it. */
function refusedClaim(state: AllotState, error: DomainError, spaceId: Uuid): DomainError {
  if (error.code === "claim_overlap" || error.code === "space_taken" || error.code === "space_unchecked") {
    const holder = Object.values(state.offers).find((o) => o.state === "open" && o.claimId === error.detail?.["claimId"]);
    if (holder !== undefined) return { code: "offer_open", detail: { ...error.detail, offerId: holder.offerId } };
    return { code: "plot_not_free", detail: { ...error.detail, spaceId } };
  }
  return error;
}

/**
 * End a hold or a tenancy claim on a date. A claim that began on or after that date ends at its own start,
 * so it covers no day. A same day decline or hand over needs no later date.
 */
function endHold(state: AllotState, claimId: Uuid, on: LocalDate, reason: string): Result<{ drafts: Drafts; next: AllotState }> {
  const claim = state.core.claims[claimId];
  if (claim === undefined || claim.voided === true) return err("no_such_claim", { claimId });
  if (claim.endExclusive !== undefined && claim.endExclusive <= on) return err("already_ended", { claimId, endExclusive: claim.endExclusive });
  if (claim.start !== undefined && on <= claim.start) {
    const event: CoreEvent = { type: "claim_ended", claimId, endExclusive: claim.start, reason };
    const drafts = [draft(event as unknown as AllotEvent, [claimId, claim.spaceId], on)];
    return ok({ drafts, next: { ...state, core: applyCore(state.core, event) } });
  }
  return core(state, { type: "end_claim", claimId, reason }, on);
}

function makeOffer(state: AllotState, c: Cmd<"make_offer">, on: LocalDate): Result<Drafts> {
  if (state.offers[c.offerId] !== undefined) return err("duplicate_id", { id: c.offerId });
  const application = state.applications[c.applicationId];
  if (application === undefined) return err("no_such_application", { applicationId: c.applicationId });
  if (application.state === "offered") return err("offer_open", { applicationId: c.applicationId, offerId: application.offerId });
  if (application.state !== "waiting") return err("not_waiting", { applicationId: c.applicationId });
  const plot = findPlotOfSpace(state, c.spaceId);
  if (plot === undefined) return err("no_such_space", { spaceId: c.spaceId });
  if (!blank(c.replyBy) && (c.replyBy as string) < on) return err("invalid_input", undefined, { fields: [{ field: "replyBy", code: "bad_interval" }] });

  const plan = offerPlan(state, plot.plotId, c.applicationId);
  const skipped: Skip[] = [];
  for (const skip of plan.skipped) {
    if (skip.kind !== "exceptional") {
      skipped.push(skip);
      continue;
    }
    const reason = c.skipReasons?.[skip.applicationId];
    if (blank(reason)) {
      return err("skip_reason_required", { applicationId: skip.applicationId }, { fields: [{ field: `skipReason:${skip.applicationId}`, code: "required" }] });
    }
    skipped.push({ ...skip, reason: (reason as string).trim() });
  }

  const held = core(state, { type: "add_claim", claimId: c.claimId, spaceId: c.spaceId, mode: "held", start: on, endable: true, ref: c.offerId }, on);
  if (!held.ok) return { ok: false, error: refusedClaim(state, held.error, c.spaceId) };

  const offer: Offer = {
    offerId: c.offerId,
    applicationId: c.applicationId,
    plotId: plot.plotId,
    spaceId: c.spaceId,
    claimId: c.claimId,
    offeredOn: on,
    state: "open",
    skipped,
  };
  if (!blank(c.replyBy)) offer.replyBy = c.replyBy as string;
  return ok([...held.value.drafts, draft({ type: "offer_made", offer }, [c.offerId, c.applicationId, application.personId, plot.plotId, c.spaceId], on)]);
}

function openOffer(state: AllotState, offerId: Uuid): Result<Offer> {
  const offer = state.offers[offerId];
  if (offer === undefined) return err("no_such_offer", { offerId });
  if (offer.state !== "open") return err("offer_closed", { offerId, state: offer.state });
  return ok(offer);
}

function acceptOffer(state: AllotState, c: Cmd<"accept_offer">, on: LocalDate): Result<Drafts> {
  const found = openOffer(state, c.offerId);
  if (!found.ok) return found;
  const offer = found.value;
  if (on < offer.offeredOn) return err("invalid_input", undefined, { fields: [{ field: "start", code: "bad_interval" }] });
  if (state.tenancies[c.tenancyId] !== undefined) return err("duplicate_id", { id: c.tenancyId });
  const application = state.applications[offer.applicationId] as Application;
  const taken = core(state, { type: "add_claim", claimId: c.claimId, spaceId: offer.spaceId, mode: "taken", start: on, endable: true, ref: c.tenancyId, converts: offer.claimId }, on);
  if (!taken.ok) return { ok: false, error: refusedClaim(state, taken.error, offer.spaceId) };
  const tenancy: Tenancy = {
    tenancyId: c.tenancyId,
    personId: application.personId,
    plotId: offer.plotId,
    spaceId: offer.spaceId,
    claimId: c.claimId,
    start: on,
    fromOffer: offer.offerId,
  };
  const ids = [c.offerId, c.tenancyId, offer.applicationId, application.personId, offer.plotId, offer.spaceId];
  return ok([...taken.value.drafts, draft({ type: "offer_accepted", offerId: offer.offerId, on, tenancy }, ids, on)]);
}

function declineOffer(state: AllotState, c: Cmd<"decline_offer">, on: LocalDate): Result<Drafts> {
  const found = openOffer(state, c.offerId);
  if (!found.ok) return found;
  const offer = found.value;
  const ended = endHold(state, offer.claimId, on, "Declined");
  if (!ended.ok) return ended;
  const event: AllotEvent = { type: "offer_declined", offerId: offer.offerId, on, choice: c.choice as "keep_place" | "leave_list" };
  if (!blank(c.reason)) event.reason = (c.reason as string).trim();
  return ok([...ended.value.drafts, draft(event, [offer.offerId, offer.applicationId, offer.plotId, offer.spaceId], on)]);
}

function releaseOffer(state: AllotState, c: Cmd<"release_offer">, on: LocalDate): Result<Drafts> {
  const found = openOffer(state, c.offerId);
  if (!found.ok) return found;
  const offer = found.value;
  if (!isOverdue(offer, on)) return err("not_overdue", { offerId: offer.offerId, replyBy: offer.replyBy });
  const ended = endHold(state, offer.claimId, on, "Released");
  if (!ended.ok) return ended;
  const event: AllotEvent = { type: "offer_released", offerId: offer.offerId, on, withdrew: c.withdraw === true };
  if (!blank(c.reason)) event.reason = (c.reason as string).trim();
  return ok([...ended.value.drafts, draft(event, [offer.offerId, offer.applicationId, offer.plotId, offer.spaceId], on)]);
}

/** The application after its offer closes without a tenancy: back in the queue, or out of it. */
function reopenApplication(state: AllotState, offer: Offer, on: LocalDate, leave: boolean, reason: string): AllotState["applications"] {
  const application = state.applications[offer.applicationId];
  if (application === undefined) return state.applications;
  const { offerId: _offerId, ...rest } = application;
  const next: Application = leave ? { ...rest, state: "withdrawn", withdrawn: { on, reason } } : { ...rest, state: "waiting" };
  return { ...state.applications, [application.applicationId]: next };
}
/** The tenancies of a plot that cover a date. A span includes its first day and not its end day. */
export function tenanciesCovering(state: AllotState, plotId: Uuid, date: LocalDate): Tenancy[] {
  return Object.values(state.tenancies)
    .filter((t) => t.plotId === plotId && intervalCovers(spanOf(t), date))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

function spanOf(t: Tenancy): { start: LocalDate; endExclusive?: LocalDate } {
  return t.endExclusive === undefined ? { start: t.start } : { start: t.start, endExclusive: t.endExclusive };
}

/** A tenancy claim that ran into another: two tenancies share a day, or the plot is held or unusable then. */
function refusedTenancy(error: DomainError, spaceId: Uuid): DomainError {
  if (error.code === "space_taken") return { code: "tenancy_overlap", detail: { ...error.detail, spaceId } };
  if (error.code === "claim_overlap") return { code: "plot_not_free", detail: { ...error.detail, spaceId } };
  return error;
}

function holderPerson(state: AllotState, personId: Uuid, name: string | undefined, contact: string | undefined): Person | undefined {
  if (state.people[personId] !== undefined) return undefined;
  const person: Person = { personId, displayName: (name as string).trim() };
  if (!blank(contact)) person.contact = (contact as string).trim();
  return person;
}

function recordTenancy(state: AllotState, c: Cmd<"record_tenancy">, on: LocalDate): Result<Drafts> {
  if (state.tenancies[c.tenancyId] !== undefined) return err("duplicate_id", { id: c.tenancyId });
  const plot = findPlotOfSpace(state, c.spaceId);
  if (plot === undefined) return err("no_such_space", { spaceId: c.spaceId });
  const command: CoreCommand = { type: "add_claim", claimId: c.claimId, spaceId: c.spaceId, mode: "taken", start: c.start, endable: true, ref: c.tenancyId };
  if (!blank(c.endExclusive)) command.endExclusive = c.endExclusive as string;
  if (!blank(c.sourceRef)) command.sourceRef = (c.sourceRef as string).trim();
  const taken = core(state, command, on);
  if (!taken.ok) return { ok: false, error: refusedTenancy(taken.error, c.spaceId) };
  const tenancy: Tenancy = { tenancyId: c.tenancyId, personId: c.personId, plotId: plot.plotId, spaceId: c.spaceId, claimId: c.claimId, start: c.start };
  if (!blank(c.endExclusive)) tenancy.endExclusive = c.endExclusive as string;
  if (!blank(c.sourceRef)) tenancy.sourceRef = (c.sourceRef as string).trim();
  const event: AllotEvent = { type: "tenancy_started", sheet: TENANCIES_SHEET, tenancy };
  const holder = holderPerson(state, c.personId, c.holderName, c.contact);
  if (holder !== undefined) event.holder = holder;
  const extra = tenancy.sourceRef === undefined ? undefined : { sourceRef: tenancy.sourceRef };
  return ok([...taken.value.drafts, draft(event, [c.tenancyId, c.personId, plot.plotId, c.spaceId], on, extra)]);
}

/** The tenancy to close on a date: it must exist, still be open on that day and have begun by it. */
function closableTenancy(state: AllotState, tenancyId: Uuid, on: LocalDate): Result<Tenancy> {
  const tenancy = state.tenancies[tenancyId];
  if (tenancy === undefined) return err("no_such_tenancy", { tenancyId });
  if (tenancy.endExclusive !== undefined && tenancy.endExclusive <= on) return err("tenancy_ended", { tenancyId, endExclusive: tenancy.endExclusive });
  if (on < tenancy.start) return err("invalid_input", undefined, { fields: [{ field: "end", code: "bad_interval" }] });
  return ok(tenancy);
}

function endTenancy(state: AllotState, c: Cmd<"end_tenancy">, on: LocalDate): Result<Drafts> {
  const found = closableTenancy(state, c.tenancyId, on);
  if (!found.ok) return found;
  const tenancy = found.value;
  const ended = endHold(state, tenancy.claimId, on, blank(c.reason) ? "Tenancy ended" : (c.reason as string).trim());
  if (!ended.ok) return ended;
  const event: AllotEvent = { type: "tenancy_ended", tenancyId: tenancy.tenancyId, on };
  if (!blank(c.reason)) event.reason = (c.reason as string).trim();
  return ok([...ended.value.drafts, draft(event, [tenancy.tenancyId, tenancy.personId, tenancy.plotId, tenancy.spaceId], on)]);
}

function handOver(state: AllotState, c: Cmd<"hand_over">, on: LocalDate): Result<Drafts> {
  const found = closableTenancy(state, c.tenancyId, on);
  if (!found.ok) return found;
  const outgoing = found.value;
  if (state.tenancies[c.newTenancyId] !== undefined) return err("duplicate_id", { id: c.newTenancyId });
  const ended = endHold(state, outgoing.claimId, on, "Handed over");
  if (!ended.ok) return ended;
  const command: CoreCommand = { type: "add_claim", claimId: c.claimId, spaceId: outgoing.spaceId, mode: "taken", start: on, endable: true, ref: c.newTenancyId };
  if (!blank(c.sourceRef)) command.sourceRef = (c.sourceRef as string).trim();
  const taken = core(ended.value.next, command, on);
  if (!taken.ok) return { ok: false, error: refusedTenancy(taken.error, outgoing.spaceId) };
  const incoming: Tenancy = { tenancyId: c.newTenancyId, personId: c.personId, plotId: outgoing.plotId, spaceId: outgoing.spaceId, claimId: c.claimId, start: on, handoverFrom: outgoing.tenancyId };
  if (!blank(c.sourceRef)) incoming.sourceRef = (c.sourceRef as string).trim();
  const started: AllotEvent = { type: "tenancy_started", sheet: TENANCIES_SHEET, tenancy: incoming };
  const holder = holderPerson(state, c.personId, c.holderName, c.contact);
  if (holder !== undefined) started.holder = holder;
  const extra = incoming.sourceRef === undefined ? undefined : { sourceRef: incoming.sourceRef };
  return ok([
    ...ended.value.drafts,
    ...taken.value.drafts,
    draft({ type: "tenancy_ended", tenancyId: outgoing.tenancyId, on }, [outgoing.tenancyId, outgoing.personId, outgoing.plotId, outgoing.spaceId], on),
    draft(started, [c.newTenancyId, c.personId, outgoing.plotId, outgoing.spaceId], on, extra),
  ]);
}
function setCurrency(state: AllotState, c: Cmd<"set_currency">, on: LocalDate): Result<Drafts> {
  if (hasAnyCharge(state)) return err("currency_fixed", { currency: state.currency });
  return ok([draft({ type: "currency_set", currency: c.currency }, [], on)]);
}

const foldName = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

function newSeason(state: AllotState, c: Cmd<"new_season">, on: LocalDate): Result<Drafts> {
  if (state.currency === undefined) return err("no_currency");
  if (state.seasons[c.seasonId] !== undefined) return err("duplicate_id", { id: c.seasonId });
  if (Object.values(state.seasons).some((s) => foldName(s.name) === foldName(c.name))) return err("season_exists", { name: c.name.trim() });
  const season: Season = { seasonId: c.seasonId, name: c.name.trim(), start: c.start, endExclusive: c.endExclusive, standardFee: c.standardFee };
  if (!blank(c.dueOn)) season.dueOn = c.dueOn as string;
  return ok([draft({ type: "season_added", season }, [c.seasonId], on)]);
}

function applyCharges(state: AllotState, c: Cmd<"apply_charges">, on: LocalDate): Result<Drafts> {
  if (state.currency === undefined) return err("no_currency");
  const season = state.seasons[c.seasonId];
  if (season === undefined) return err("no_such_season", { seasonId: c.seasonId });
  const drafts: Drafts = [];
  const charged = new Set<Uuid>();
  let skipped = 0;
  for (const item of c.items) {
    const tenancy = state.tenancies[item.tenancyId];
    if (tenancy === undefined) return err("no_such_tenancy", { tenancyId: item.tenancyId });
    if (!intervalsOverlap(spanOf(tenancy), { start: season.start, endExclusive: season.endExclusive })) return err("not_in_season", { tenancyId: item.tenancyId, seasonId: season.seasonId });
    if (charged.has(item.tenancyId) || liveChargeOf(state, item.tenancyId, season.seasonId) !== undefined) {
      skipped += 1;
      continue;
    }
    if (state.ledger[item.chargeId] !== undefined) return err("duplicate_id", { id: item.chargeId });
    charged.add(item.tenancyId);
    const waiver = !blank(item.waiveReason);
    const entry: LedgerEntry = {
      entryId: item.chargeId,
      tenancyId: item.tenancyId,
      seasonId: season.seasonId,
      type: "charge",
      minorUnits: waiver ? 0 : (item.amount ?? season.standardFee),
      on,
    };
    if (waiver) entry.waiver = (item.waiveReason as string).trim();
    drafts.push(draft({ type: "charge_applied", entry }, [item.chargeId, item.tenancyId, season.seasonId, tenancy.personId], on));
  }
  if (drafts.length === 0) return err("already_charged", { count: skipped });
  return ok(drafts);
}

function recordReceipt(state: AllotState, c: Cmd<"record_receipt">, on: LocalDate): Result<Drafts> {
  if (state.ledger[c.receiptId] !== undefined) return err("duplicate_id", { id: c.receiptId });
  const charge = state.ledger[c.chargeId];
  if (charge === undefined || charge.type !== "charge") return err("no_such_entry", { entryId: c.chargeId });
  if (Object.values(state.ledger).some((e) => e.type === "reversal" && e.reverses === charge.entryId)) return err("charge_reversed", { entryId: charge.entryId });
  if (on < charge.on) return err("invalid_input", undefined, { fields: [{ field: "paymentDate", code: "bad_interval" }] });
  const available = availableAt(state, charge.entryId, on);
  if (c.amount > available) {
    const amount = formatMoney(Math.max(0, available), state.currency as Currency);
    return err("exceeds_balance", { amount, balance: Math.max(0, available) });
  }
  const entry: LedgerEntry = { entryId: c.receiptId, tenancyId: charge.tenancyId, seasonId: charge.seasonId, type: "receipt", minorUnits: c.amount, on, chargeId: charge.entryId };
  if (!blank(c.ref)) entry.ref = (c.ref as string).trim();
  return ok([draft({ type: "receipt_recorded", entry }, [c.receiptId, charge.entryId, charge.tenancyId], on)]);
}

function reverseEntry(state: AllotState, c: Cmd<"reverse_entry">, on: LocalDate): Result<Drafts> {
  if (state.ledger[c.reversalId] !== undefined) return err("duplicate_id", { id: c.reversalId });
  const target = state.ledger[c.entryId];
  if (target === undefined) return err("no_such_entry", { entryId: c.entryId });
  if (target.type === "reversal") return err("not_reversible", { entryId: c.entryId });
  if (Object.values(state.ledger).some((e) => e.type === "reversal" && e.reverses === target.entryId)) return err("already_reversed", { entryId: c.entryId });
  if (on < target.on) return err("invalid_input", undefined, { fields: [{ field: "reversalDate", code: "bad_interval" }] });
  if (target.type === "charge") {
    const reversedLater = Object.values(state.ledger).filter((e) => e.type === "reversal" && e.on > on).map((e) => e.reverses);
    const live = liveReceipts(state, target.entryId).concat(
      Object.values(state.ledger).filter((e) => e.type === "receipt" && e.chargeId === target.entryId && reversedLater.includes(e.entryId)),
    );
    if (live.length > 0) return err("charge_has_receipts", { entryId: c.entryId, count: live.length });
  }
  const entry: LedgerEntry = {
    entryId: c.reversalId,
    tenancyId: target.tenancyId,
    seasonId: target.seasonId,
    type: "reversal",
    minorUnits: target.minorUnits,
    on,
    chargeId: chargeIdOf(target),
    reverses: target.entryId,
    reason: c.reason.trim(),
  };
  return ok([draft({ type: "entry_reversed", entry }, [c.reversalId, target.entryId, target.tenancyId], on)]);
}
/** Keep the words that are not blank, trimmed. */
function cleanWords(words: Record<Uuid, string>): Record<Uuid, string> {
  return Object.fromEntries(Object.entries(words).map(([k, v]) => [k, v.trim()] as const).filter(([, v]) => v !== ""));
}

function setPublic(state: AllotState, c: Cmd<"set_public">, on: LocalDate): Result<Drafts> {
  const pub: Partial<PublicSettings> = {};
  if (c.siteName !== undefined) pub.siteName = c.siteName.trim();
  if (c.gateName !== undefined) pub.gateName = c.gateName.trim();
  if (c.instructions !== undefined) pub.instructions = c.instructions.trim();
  if (c.sectionNames !== undefined) {
    for (const id of Object.keys(c.sectionNames)) if (state.map.sections[id] === undefined) return err("no_such_section", { sectionId: id });
    pub.sectionNames = cleanWords(c.sectionNames);
  }
  if (c.pathNames !== undefined) {
    for (const id of Object.keys(c.pathNames)) if (state.map.paths[id] === undefined) return err("no_such_path", { pathId: id });
    pub.pathNames = cleanWords(c.pathNames);
  }
  if (c.plotCodes !== undefined) {
    for (const id of Object.keys(c.plotCodes)) if (state.core.plots[id] === undefined) return err("no_such_plot", { plotId: id });
    pub.plotCodes = cleanWords(c.plotCodes);
  }
  if (c.listed !== undefined) {
    for (const id of c.listed) if (state.core.plots[id] === undefined) return err("no_such_plot", { plotId: id });
    pub.listed = Object.fromEntries(c.listed.map((id) => [id, true as const]));
  }
  return ok([draft({ type: "public_set", pub }, [], on)]);
}
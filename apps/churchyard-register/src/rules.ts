// Churchyard rules: decide and apply. Pure: no I/O, no random choice. Every ID comes from the command.
// A burial is permanent. A name, date or space changes only by a correction that names the original.
import { coveredInterval, isValidLocalDate } from "../../../template/src/calendar";
import type { LocalDate, PartialDate } from "../../../template/src/calendar";
import { applyBase, decideBase, emptyBase, isBaseCommand, validateBase } from "../../../template/src/base";
import type { BaseCommand } from "../../../template/src/base";
import { decideCore } from "../../../template/src/commands";
import type { CoreCommand } from "../../../template/src/commands";
import { CORE_PAYLOAD_VERSION, applyCore } from "../../../template/src/events";
import type { CoreEvent, DraftEvent } from "../../../template/src/events";
import { LIMITS, checkRecordRoom, checkText } from "../../../template/src/limits";
import { err, ok } from "../../../template/src/types";
import type { DomainError, FieldError, Result, Uuid } from "../../../template/src/types";
import { CHURCH_COMMAND_TYPES } from "./types";
import type { ApprovalStatus, Approval, Burial, ChurchCommand, ChurchEvent, ChurchState, Memorial, Person, PublicSettings, Request, Reservation } from "./types";

export const CHURCH_CTX = { spacesPerPlot: { min: 1, max: LIMITS.spacesPerChurchyardPlot } };

type Own = Exclude<ChurchCommand, BaseCommand>;
type Cmd<T extends Own["type"]> = Extract<Own, { type: T }>;
type Drafts = DraftEvent<ChurchEvent>[];

const CHURCH_NAMES: ReadonlySet<string> = new Set(CHURCH_COMMAND_TYPES);
const isBase = (type: string): boolean => isBaseCommand({ type });

export function emptyChurch(siteId: Uuid): ChurchState {
  return {
    ...emptyBase(siteId),
    people: {},
    burials: {},
    reservations: {},
    requests: {},
    memorials: {},
    approvals: {},
    pub: { sectionNames: {}, pathNames: {}, plotCodes: {} },
    separate: {},
  };
}

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";

/** The four wire forms of design D4, with real days and years 1000 to 9999. */
export function isValidPartial(date: PartialDate): boolean {
  const two = (n: number) => String(n).padStart(2, "0");
  const yearOk = (y: unknown): y is number => Number.isInteger(y) && (y as number) >= 1000 && (y as number) <= 9999;
  switch (date.p) {
    case "unknown":
      return true;
    case "year":
      return yearOk(date.y);
    case "month":
      return yearOk(date.y) && Number.isInteger(date.m) && date.m >= 1 && date.m <= 12;
    case "day":
      return yearOk(date.y) && Number.isInteger(date.m) && Number.isInteger(date.d) && isValidLocalDate(`${date.y}-${two(date.m)}-${two(date.d)}`);
    default:
      return false;
  }
}

/** A claim starts only on a full day. A year, a month or no date gives no start. */
export function claimStartOf(date: PartialDate): LocalDate | undefined {
  if (date.p !== "day") return undefined;
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

const yearOf = (date: PartialDate): number | undefined => (date.p === "unknown" ? undefined : date.y);

function nameFields(name: string | undefined, unknown: boolean | undefined): FieldError[] {
  const has = !blank(name);
  if (has && unknown === true) return [{ field: "recordedName", code: "name_and_unknown" }];
  if (!has && unknown !== true) return [{ field: "recordedName", code: "required" }];
  if (has && !checkText("nameChars", (name as string).trim()).ok) return [{ field: "recordedName", code: "over_limit" }];
  return [];
}

function sourceFields(ref: string | undefined, field: string): FieldError[] {
  if (blank(ref)) return [{ field, code: "required" }];
  if (!checkText("sourceRefChars", ref as string).ok) return [{ field, code: "over_limit" }];
  return [];
}

function startField(start: string | undefined): FieldError[] {
  if (blank(start)) return [{ field: "start", code: "required" }];
  return isValidLocalDate(start as string) ? [] : [{ field: "start", code: "invalid_date" }];
}

function holderFields(name: string | undefined, contact: string | undefined): FieldError[] {
  const fields: FieldError[] = [];
  if (blank(name)) fields.push({ field: "holder", code: "required" });
  else if (!checkText("nameChars", (name as string).trim()).ok) fields.push({ field: "holder", code: "over_limit" });
  if (contact !== undefined && !checkText("noteChars", contact).ok) fields.push({ field: "contact", code: "over_limit" });
  return fields;
}

function reasonFields(reason: string | undefined): FieldError[] {
  if (blank(reason)) return [{ field: "reason", code: "required" }];
  if (!checkText("noteChars", reason as string).ok) return [{ field: "reason", code: "over_limit" }];
  return [];
}

/** Shape checks that need no state. Each error names its field. */
export function validateChurch(command: ChurchCommand, state: ChurchState): FieldError[] {
  if (isBase(command.type)) return validateBase(command as BaseCommand, state);
  const c = command as Own;
  const fields: FieldError[] = [];
  switch (c.type) {
    case "record_burial": {
      fields.push(...sourceFields(c.sourceRef, "sourceRef"), ...nameFields(c.recordedName, c.nameUnknown));
      if (!isValidPartial(c.date)) fields.push({ field: "burialDate", code: "invalid_date" });
      if (c.spaceId !== undefined && c.plotId === undefined) fields.push({ field: "plot", code: "required" });
      if (c.plotId !== undefined && c.spaceId === undefined) fields.push({ field: "space", code: "required" });
      if (c.spaceId !== undefined && c.claimId === undefined) fields.push({ field: "claimId", code: "required" });
      break;
    }
    case "correct_burial": {
      fields.push(...sourceFields(c.correctionRef, "correctionRef"), ...reasonFields(c.reason));
      if (blank(c.correctsEventId)) fields.push({ field: "correctsEventId", code: "required" });
      if (c.recordedName !== undefined || c.nameUnknown !== undefined) fields.push(...nameFields(c.recordedName, c.nameUnknown));
      if (c.date !== undefined && !isValidPartial(c.date)) fields.push({ field: "burialDate", code: "invalid_date" });
      break;
    }
    case "move_burial":
    case "void_burial": {
      fields.push(...sourceFields(c.correctionRef, "correctionRef"), ...reasonFields(c.reason));
      if (blank(c.correctsEventId)) fields.push({ field: "correctsEventId", code: "required" });
      break;
    }
    case "record_reservation": {
      fields.push(...holderFields(c.holderName, c.contact), ...startField(c.start));
      if (c.sourceRef !== undefined && !checkText("sourceRefChars", c.sourceRef).ok) fields.push({ field: "sourceRef", code: "over_limit" });
      break;
    }
    case "add_request": {
      fields.push(...holderFields(c.holderName, c.contact));
      if (c.note !== undefined && !checkText("noteChars", c.note).ok) fields.push({ field: "note", code: "over_limit" });
      break;
    }
    case "fulfil_request":
      fields.push(...startField(c.start));
      break;
    case "release_reservation":
      fields.push(...reasonFields(c.reason));
      break;
    case "save_reading":
      if (!/\S/.test(c.reading)) fields.push({ field: "reading", code: "required" });
      else if (!checkText("noteChars", c.reading).ok) fields.push({ field: "reading", code: "over_limit" });
      if (c.pageRef !== undefined && !checkText("sourceRefChars", c.pageRef).ok) fields.push({ field: "pageRef", code: "over_limit" });
      break;
    case "approve_burial":
      if (c.name !== undefined && c.name.trim() !== "" && !checkText("nameChars", c.name.trim()).ok) fields.push({ field: "shownName", code: "over_limit" });
      break;
    case "set_public": {
      const words: [string, string | undefined, "nameChars" | "noteChars"][] = [
        ["siteName", c.siteName, "nameChars"],
        ["gateName", c.gateName, "nameChars"],
        ["directions", c.directions, "noteChars"],
      ];
      for (const [field, value, limit] of words) if (value !== undefined && !checkText(limit, value.trim()).ok) fields.push({ field, code: "over_limit" });
      for (const map of [c.sectionNames, c.pathNames]) {
        for (const value of Object.values(map ?? {})) if (!checkText("nameChars", value.trim()).ok) fields.push({ field: "publicName", code: "over_limit" });
      }
      for (const value of Object.values(c.plotCodes ?? {})) if (!checkText("plotCodeChars", value.trim()).ok) fields.push({ field: "publicCode", code: "over_limit" });
      break;
    }
    case "settle_reading":
    case "link_stone_photo":
    case "withdraw_approval":
      break;
    case "add_space":
    case "keep_separate":
    case "link_burials":
    case "place_burial":
      break;
    default:
      throw new Error("not implemented");
  }
  return fields;
}

function draft(
  event: ChurchEvent,
  entityIds: string[],
  on: LocalDate,
  extra?: { sourceRef?: string; corrects?: Uuid },
): DraftEvent<ChurchEvent> {
  const out: DraftEvent<ChurchEvent> = { event, entityIds, effectiveOn: on, payloadVersion: CORE_PAYLOAD_VERSION };
  if (extra?.sourceRef !== undefined) out.sourceRef = extra.sourceRef;
  if (extra?.corrects !== undefined) out.corrects = extra.corrects;
  return out;
}

/** Run a core command on a working copy and give back its drafts and the new core state. */
function core(
  state: ChurchState,
  command: CoreCommand,
  on: LocalDate,
): Result<{ drafts: Drafts; next: ChurchState }> {
  const decided = decideCore(state.core, command, on, CHURCH_CTX);
  if (!decided.ok) return decided;
  let working = state.core;
  for (const d of decided.value) working = applyCore(working, d.event as CoreEvent);
  return ok({ drafts: decided.value as Drafts, next: { ...state, core: working } });
}

function findSpace(state: ChurchState, plotId: Uuid, spaceId: Uuid): Result<true> {
  const plot = state.core.plots[plotId];
  if (plot === undefined) return err("no_such_plot", { plotId });
  if (!plot.spaces.some((s) => s.spaceId === spaceId && !s.retired)) return err("no_such_space", { spaceId });
  return ok(true);
}

const liveBurial = (state: ChurchState, id: Uuid): Burial | undefined => {
  const b = state.burials[id];
  return b === undefined || b.voided === true ? undefined : b;
};

function takenClaim(burial: { burialId: Uuid; sourceRef: string; date: PartialDate }, spaceId: Uuid, claimId: Uuid): CoreCommand {
  const start = claimStartOf(burial.date);
  const command: CoreCommand = {
    type: "add_claim",
    claimId,
    spaceId,
    mode: "taken",
    endable: false,
    ref: burial.burialId,
    sourceRef: burial.sourceRef,
  };
  if (start !== undefined) command.start = start;
  else {
    // A year or a month gives no start. Its earliest possible day bounds the overlap check only.
    const first = coveredInterval(burial.date)?.first;
    if (first !== undefined) command.overlapFrom = first;
  }
  return command;
}

/**
 * The burial's claim on a space, as core drafts. A held space is refused unless the burial names
 * the reservation, so a reservation is never converted by accident.
 */
function burialClaim(
  state: ChurchState,
  burial: { burialId: Uuid; sourceRef: string; date: PartialDate },
  spaceId: Uuid,
  claimId: Uuid,
  reservationId: Uuid | undefined,
  on: LocalDate,
): Result<{ drafts: Drafts; next: ChurchState }> {
  const command = takenClaim(burial, spaceId, claimId);
  if (reservationId !== undefined) {
    const reservation = state.reservations[reservationId];
    if (reservation === undefined) return err("no_such_reservation", { reservationId });
    if (reservation.released !== undefined || reservation.convertedTo !== undefined || reservation.spaceId !== spaceId) {
      return err("bad_conversion", { reservationId });
    }
    (command as Extract<CoreCommand, { type: "add_claim" }>).converts = reservation.claimId;
  }
  const claimed = core(state, command, on);
  if (!claimed.ok && claimed.error.code === "claim_overlap") return { ok: false, error: namingReservation(state, claimed.error, "space_reserved") };
  return claimed;
}

/** Add the reservation that owns the blocking held claim to an error, under the given code. */
function namingReservation(state: ChurchState, error: DomainError, code: string): DomainError {
  const reservation = Object.values(state.reservations).find((r) => r.claimId === error.detail?.["claimId"]);
  if (reservation === undefined) return error;
  return { ...error, code, detail: { ...error.detail, reservationId: reservation.reservationId } };
}

/** The commands that make a new record of the register. */
const MAKES_RECORD: ReadonlySet<string> = new Set(["record_burial", "record_reservation", "add_request", "save_reading"]);

/** Every record the site holds, archived and voided included. */
function recordCount(state: ChurchState): number {
  return (
    Object.keys(state.people).length +
    Object.keys(state.burials).length +
    Object.keys(state.reservations).length +
    Object.keys(state.requests).length +
    Object.keys(state.memorials).length
  );
}

export function decideChurch(state: ChurchState, command: ChurchCommand, on: LocalDate): Result<Drafts> {
  if (isBase(command.type)) return decideBase(state, command as BaseCommand, on, CHURCH_CTX) as Result<Drafts>;
  if (!CHURCH_NAMES.has(command.type)) return err("unknown_command", { type: command.type });
  if (MAKES_RECORD.has(command.type)) {
    // D12: a site holds at most 20,000 records, voided ones included.
    const room = checkRecordRoom(recordCount(state));
    if (!room.ok) return room;
  }
  const c = command as Own;
  switch (c.type) {
    case "record_burial":
      return recordBurial(state, c, on);
    case "place_burial":
      return placeBurial(state, c, on);
    case "correct_burial":
      return correctBurial(state, c, on);
    case "move_burial":
      return moveBurial(state, c, on);
    case "void_burial":
      return voidBurial(state, c, on);
    case "add_space":
      return addSpace(state, c, on);
    case "keep_separate":
      return keepSeparate(state, c, on);
    case "link_burials":
      return linkBurials(state, c, on);
    case "record_reservation":
      return recordReservation(state, c, on);
    case "add_request":
      return addRequest(state, c, on);
    case "fulfil_request":
      return fulfilRequest(state, c, on);
    case "release_reservation":
      return releaseReservation(state, c, on);
    case "save_reading":
      return saveReading(state, c, on);
    case "settle_reading":
      return settleReading(state, c, on);
    case "link_stone_photo":
      return linkStonePhoto(state, c, on);
    case "approve_burial":
      return approveBurial(state, c, on);
    case "withdraw_approval":
      return withdrawApproval(state, c, on);
    case "set_public":
      return setPublic(state, c, on);
    default:
      throw new Error("not implemented");
  }
}

function saveReading(state: ChurchState, c: Cmd<"save_reading">, on: LocalDate): Result<Drafts> {
  const burial = liveBurial(state, c.burialId);
  if (burial === undefined) return err("no_such_burial", { burialId: c.burialId });
  const existing = Object.values(state.memorials).find((m) => m.burialId === c.burialId);
  if (existing !== undefined && existing.memorialId !== c.memorialId) return err("memorial_exists", { memorialId: existing.memorialId });
  if (existing === undefined && state.memorials[c.memorialId] !== undefined) return err("duplicate_id", { id: c.memorialId });
  const memorial: Memorial = { memorialId: c.memorialId, burialId: c.burialId, reading: c.reading, unclear: c.unclear, photoIds: existing?.photoIds ?? [] };
  if (!blank(c.pageRef)) memorial.pageRef = (c.pageRef as string).trim();
  const ids = [c.memorialId, c.burialId];
  if (burial.plotId !== undefined) ids.push(burial.plotId);
  return ok([draft({ type: "reading_saved", memorial }, ids, on)]);
}

function settleReading(state: ChurchState, c: Cmd<"settle_reading">, on: LocalDate): Result<Drafts> {
  const memorial = state.memorials[c.memorialId];
  if (memorial === undefined) return err("no_such_memorial", { memorialId: c.memorialId });
  return ok([draft({ type: "reading_settled", memorialId: c.memorialId }, [c.memorialId, memorial.burialId], on)]);
}

function linkStonePhoto(state: ChurchState, c: Cmd<"link_stone_photo">, on: LocalDate): Result<Drafts> {
  const memorial = state.memorials[c.memorialId];
  if (memorial === undefined) return err("no_such_memorial", { memorialId: c.memorialId });
  const plotId = state.burials[memorial.burialId]?.plotId;
  const photo = plotId === undefined ? undefined : state.notes[plotId]?.photos.find((p) => p.photoId === c.photoId && !p.removed);
  if (photo === undefined) return err("no_such_photo", { photoId: c.photoId });
  if (memorial.photoIds.includes(c.photoId)) return err("photo_linked", { photoId: c.photoId });
  return ok([draft({ type: "stone_photo_linked", memorialId: c.memorialId, photoId: c.photoId }, [c.memorialId, c.photoId], on)]);
}

function approveBurial(state: ChurchState, c: Cmd<"approve_burial">, on: LocalDate): Result<Drafts> {
  const burial = liveBurial(state, c.burialId);
  if (burial === undefined) return err("no_such_burial", { burialId: c.burialId });
  if (burial.nameUnknown || blank(burial.recordedName)) return err("approval_needs_name", { burialId: c.burialId });
  const year = yearOf(burial.date);
  if (c.includeYear && year === undefined) return err("invalid_input", undefined, { fields: [{ field: "includeYear", code: "no_year" }] });
  const recordedName = burial.recordedName as string;
  const basis: Approval["basis"] = { recordedName, nameUnknown: false };
  if (year !== undefined) basis.year = year;
  if (burial.plotId !== undefined) basis.plotId = burial.plotId;
  const approval: Approval = { burialId: c.burialId, name: blank(c.name) ? recordedName : (c.name as string).trim(), includeYear: c.includeYear, basis };
  return ok([draft({ type: "burial_approved", approval }, [c.burialId], on)]);
}

/** Keep the words that are not blank, trimmed. */
function cleanWords(words: Record<Uuid, string>): Record<Uuid, string> {
  return Object.fromEntries(Object.entries(words).map(([k, v]) => [k, v.trim()] as const).filter(([, v]) => v !== ""));
}

function setPublic(state: ChurchState, c: Cmd<"set_public">, on: LocalDate): Result<Drafts> {
  const pub: Partial<PublicSettings> = {};
  if (c.siteName !== undefined) pub.siteName = c.siteName.trim();
  if (c.gateName !== undefined) pub.gateName = c.gateName.trim();
  if (c.directions !== undefined) pub.directions = c.directions.trim();
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
  return ok([draft({ type: "public_set", pub }, [], on)]);
}

function withdrawApproval(state: ChurchState, c: Cmd<"withdraw_approval">, on: LocalDate): Result<Drafts> {
  if (state.approvals[c.burialId] === undefined) return err("no_approval", { burialId: c.burialId });
  return ok([draft({ type: "approval_withdrawn", burialId: c.burialId }, [c.burialId], on)]);
}

function holderEvent(state: ChurchState, holderId: Uuid, name: string, contact: string | undefined): Person | undefined {
  if (state.people[holderId] !== undefined) return undefined;
  const person: Person = { personId: holderId, displayName: name.trim() };
  if (!blank(contact)) person.contact = (contact as string).trim();
  return person;
}

function reserveSpace(
  state: ChurchState,
  input: { reservationId: Uuid; holderId: Uuid; spaceId: Uuid; claimId: Uuid; start: LocalDate; sourceRef?: string; fromRequest?: Uuid },
  holder: Person | undefined,
  on: LocalDate,
): Result<Drafts> {
  if (state.reservations[input.reservationId] !== undefined) return err("duplicate_id", { id: input.reservationId });
  const plot = Object.values(state.core.plots).find((p) => p.spaces.some((s) => s.spaceId === input.spaceId && !s.retired));
  if (plot === undefined) return err("no_such_space", { spaceId: input.spaceId });
  const command: CoreCommand = {
    type: "add_claim",
    claimId: input.claimId,
    spaceId: input.spaceId,
    mode: "held",
    start: input.start,
    endable: true,
    ref: input.reservationId,
  };
  if (input.sourceRef !== undefined) command.sourceRef = input.sourceRef;
  const claimed = core(state, command, on);
  if (!claimed.ok) {
    return claimed.error.code === "claim_overlap" ? { ok: false, error: namingReservation(state, claimed.error, "claim_overlap") } : claimed;
  }
  const reservation: Reservation = {
    reservationId: input.reservationId,
    plotId: plot.plotId,
    spaceId: input.spaceId,
    claimId: input.claimId,
    holderId: input.holderId,
    start: input.start,
  };
  if (input.sourceRef !== undefined) reservation.sourceRef = input.sourceRef;
  if (input.fromRequest !== undefined) reservation.fromRequest = input.fromRequest;
  const event: ChurchEvent = { type: "reservation_recorded", reservation };
  if (holder !== undefined) event.holder = holder;
  const ids = [input.reservationId, plot.plotId, input.spaceId, input.holderId];
  return ok([...claimed.value.drafts, draft(event, ids, on, input.sourceRef === undefined ? undefined : { sourceRef: input.sourceRef })]);
}

function recordReservation(state: ChurchState, c: Cmd<"record_reservation">, on: LocalDate): Result<Drafts> {
  return reserveSpace(state, c, holderEvent(state, c.holderId, c.holderName, c.contact), on);
}

function addRequest(state: ChurchState, c: Cmd<"add_request">, on: LocalDate): Result<Drafts> {
  if (state.requests[c.requestId] !== undefined) return err("duplicate_id", { id: c.requestId });
  const holder = holderEvent(state, c.holderId, c.holderName, c.contact);
  const request: Request = { requestId: c.requestId, holderId: c.holderId, on };
  if (!blank(c.note)) request.note = (c.note as string).trim();
  const event: ChurchEvent = { type: "request_added", request };
  if (holder !== undefined) event.holder = holder;
  return ok([draft(event, [c.requestId, c.holderId], on)]);
}

function fulfilRequest(state: ChurchState, c: Cmd<"fulfil_request">, on: LocalDate): Result<Drafts> {
  const request = state.requests[c.requestId];
  if (request === undefined) return err("no_such_request", { requestId: c.requestId });
  if (request.reservationId !== undefined) return err("request_closed", { requestId: c.requestId });
  return reserveSpace(state, { ...c, holderId: request.holderId, fromRequest: c.requestId }, undefined, on);
}

function releaseReservation(state: ChurchState, c: Cmd<"release_reservation">, on: LocalDate): Result<Drafts> {
  const reservation = state.reservations[c.reservationId];
  if (reservation === undefined) return err("no_such_reservation", { reservationId: c.reservationId });
  if (reservation.released !== undefined || reservation.convertedTo !== undefined) return err("reservation_closed", { reservationId: c.reservationId });
  const ended = core(state, { type: "end_claim", claimId: reservation.claimId, reason: c.reason }, on);
  if (!ended.ok) return ended;
  const event: ChurchEvent = { type: "reservation_released", reservationId: c.reservationId, on, reason: c.reason.trim() };
  return ok([...ended.value.drafts, draft(event, [c.reservationId, reservation.spaceId], on)]);
}

function recordBurial(state: ChurchState, c: Cmd<"record_burial">, on: LocalDate): Result<Drafts> {
  if (state.burials[c.burialId] !== undefined) return err("duplicate_id", { id: c.burialId });
  if (Object.values(state.burials).some((b) => b.voided !== true && b.sourceRef === c.sourceRef)) {
    return err("source_ref_used", { sourceRef: c.sourceRef });
  }
  const record: Burial = {
    burialId: c.burialId,
    sheet: "Burials",
    sourceRef: c.sourceRef,
    nameUnknown: c.nameUnknown === true,
    date: c.date,
    dateText: c.dateText,
    correctionRefs: [],
  };
  if (c.nameUnknown !== true && c.recordedName !== undefined) record.recordedName = c.recordedName.trim();
  if (!blank(c.page)) record.page = (c.page as string).trim();
  const drafts: Drafts = [];
  const entityIds: string[] = [c.burialId];
  if (c.plotId !== undefined && c.spaceId !== undefined && c.claimId !== undefined) {
    const found = findSpace(state, c.plotId, c.spaceId);
    if (!found.ok) return found;
    const claimed = burialClaim(state, record, c.spaceId, c.claimId, c.reservationId, on);
    if (!claimed.ok) return claimed;
    drafts.push(...claimed.value.drafts);
    record.plotId = c.plotId;
    record.spaceId = c.spaceId;
    record.claimId = c.claimId;
    entityIds.push(c.plotId, c.spaceId);
  } else if (c.reservationId !== undefined) {
    return err("bad_conversion", { reservationId: c.reservationId });
  }
  const event: ChurchEvent = { type: "burial_recorded", ...record };
  if (c.reservationId !== undefined) event.reservationId = c.reservationId;
  drafts.push(draft(event, entityIds, on, { sourceRef: c.sourceRef }));
  return ok(drafts);
}

function placeBurial(state: ChurchState, c: Cmd<"place_burial">, on: LocalDate): Result<Drafts> {
  const burial = liveBurial(state, c.burialId);
  if (burial === undefined) return err("no_such_burial", { burialId: c.burialId });
  if (burial.spaceId !== undefined) return err("already_placed", { burialId: c.burialId });
  const found = findSpace(state, c.plotId, c.spaceId);
  if (!found.ok) return found;
  const claimed = burialClaim(state, burial, c.spaceId, c.claimId, c.reservationId, on);
  if (!claimed.ok) return claimed;
  const event: ChurchEvent = { type: "burial_placed", burialId: c.burialId, plotId: c.plotId, spaceId: c.spaceId, claimId: c.claimId };
  if (c.reservationId !== undefined) event.reservationId = c.reservationId;
  return ok([...claimed.value.drafts, draft(event, [c.burialId, c.plotId, c.spaceId], on, { sourceRef: burial.sourceRef })]);
}

function correctBurial(state: ChurchState, c: Cmd<"correct_burial">, on: LocalDate): Result<Drafts> {
  const burial = liveBurial(state, c.burialId);
  if (burial === undefined) return err("no_such_burial", { burialId: c.burialId });
  const changesName = c.recordedName !== undefined || c.nameUnknown !== undefined;
  const nameUnknown = changesName ? c.nameUnknown === true : burial.nameUnknown;
  const recordedName = changesName ? (nameUnknown ? undefined : (c.recordedName as string).trim()) : burial.recordedName;
  const date = c.date ?? burial.date;
  const dateText = c.dateText ?? burial.dateText;
  const drafts: Drafts = [];
  let claimId = burial.claimId;
  if (burial.spaceId !== undefined && burial.claimId !== undefined && c.date !== undefined && claimStartOf(date) !== state.core.claims[burial.claimId]?.start) {
    if (c.claimId === undefined || c.claimEventId === undefined) {
      return err("invalid_input", undefined, { fields: [{ field: "claimId", code: "required" }] });
    }
    const voided = core(state, { type: "void_claim", claimId: burial.claimId, correctsEventId: c.claimEventId, reason: c.reason }, on);
    if (!voided.ok) return voided;
    const added = core(voided.value.next, takenClaim({ ...burial, date }, burial.spaceId, c.claimId), on);
    if (!added.ok) return added;
    drafts.push(...voided.value.drafts, ...added.value.drafts);
    claimId = c.claimId;
  }
  const event: ChurchEvent = { type: "burial_corrected", burialId: c.burialId, nameUnknown, date, dateText, correctionRef: c.correctionRef, reason: c.reason.trim() };
  if (recordedName !== undefined) event.recordedName = recordedName;
  if (claimId !== undefined && claimId !== burial.claimId) event.claimId = claimId;
  if (c.page !== undefined) event.page = c.page.trim();
  drafts.push(draft(event, [c.burialId], on, { sourceRef: c.correctionRef, corrects: c.correctsEventId }));
  return ok(drafts);
}

function moveBurial(state: ChurchState, c: Cmd<"move_burial">, on: LocalDate): Result<Drafts> {
  const burial = liveBurial(state, c.burialId);
  if (burial === undefined) return err("no_such_burial", { burialId: c.burialId });
  if (burial.spaceId === undefined || burial.claimId === undefined) return err("not_placed", { burialId: c.burialId });
  let plotId: Uuid | undefined;
  for (const plot of Object.values(state.core.plots)) {
    if (plot.spaces.some((s) => s.spaceId === c.spaceId && !s.retired)) plotId = plot.plotId;
  }
  if (plotId === undefined) return err("no_such_space", { spaceId: c.spaceId });
  const voided = core(state, { type: "void_claim", claimId: burial.claimId, correctsEventId: c.claimEventId, reason: c.reason }, on);
  if (!voided.ok) return voided;
  const added = core(voided.value.next, takenClaim(burial, c.spaceId, c.claimId), on);
  if (!added.ok) return added;
  const event: ChurchEvent = { type: "burial_moved", burialId: c.burialId, plotId, spaceId: c.spaceId, claimId: c.claimId, correctionRef: c.correctionRef, reason: c.reason.trim() };
  return ok([...voided.value.drafts, ...added.value.drafts, draft(event, [c.burialId, plotId, c.spaceId], on, { sourceRef: c.correctionRef, corrects: c.correctsEventId })]);
}

function voidBurial(state: ChurchState, c: Cmd<"void_burial">, on: LocalDate): Result<Drafts> {
  const burial = liveBurial(state, c.burialId);
  if (burial === undefined) return err("no_such_burial", { burialId: c.burialId });
  const drafts: Drafts = [];
  if (burial.claimId !== undefined) {
    if (c.claimEventId === undefined) return err("invalid_input", undefined, { fields: [{ field: "claimEventId", code: "required" }] });
    const voided = core(state, { type: "void_claim", claimId: burial.claimId, correctsEventId: c.claimEventId, reason: c.reason }, on);
    if (!voided.ok) return voided;
    drafts.push(...voided.value.drafts);
  }
  const event: ChurchEvent = { type: "burial_voided", burialId: c.burialId, correctionRef: c.correctionRef, reason: c.reason.trim() };
  drafts.push(draft(event, [c.burialId], on, { sourceRef: c.correctionRef, corrects: c.correctsEventId }));
  return ok(drafts);
}

function addSpace(state: ChurchState, c: Cmd<"add_space">, on: LocalDate): Result<Drafts> {
  const plot = state.core.plots[c.plotId];
  if (plot === undefined) return err("no_such_plot", { plotId: c.plotId });
  if (Object.values(state.core.plots).some((p) => p.spaces.some((s) => s.spaceId === c.spaceId))) return err("duplicate_id", { id: c.spaceId });
  const active = plot.spaces.filter((s) => !s.retired).length;
  if (active >= LIMITS.spacesPerChurchyardPlot) return err("space_limit", { plotId: c.plotId, limit: LIMITS.spacesPerChurchyardPlot });
  const label = blank(c.label) ? String(plot.spaces.length + 1) : (c.label as string).trim();
  return ok([draft({ type: "space_added", plotId: c.plotId, spaceId: c.spaceId, label }, [c.plotId, c.spaceId], on)]);
}

const pairKey = (a: Uuid, b: Uuid): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

function keepSeparate(state: ChurchState, c: Cmd<"keep_separate">, on: LocalDate): Result<Drafts> {
  for (const id of [c.burialId, c.otherBurialId]) if (liveBurial(state, id) === undefined) return err("no_such_burial", { burialId: id });
  return ok([draft({ type: "kept_separate", key: pairKey(c.burialId, c.otherBurialId) }, [c.burialId, c.otherBurialId], on)]);
}

function linkBurials(state: ChurchState, c: Cmd<"link_burials">, on: LocalDate): Result<Drafts> {
  for (const id of [c.burialId, c.otherBurialId]) if (liveBurial(state, id) === undefined) return err("no_such_burial", { burialId: id });
  return ok([draft({ type: "burials_linked", burialIds: [c.burialId, c.otherBurialId], personKey: c.personKey }, [c.burialId, c.otherBurialId], on)]);
}

function convertReservation(state: ChurchState, reservationId: Uuid | undefined, burialId: Uuid): ChurchState {
  const reservation = reservationId === undefined ? undefined : state.reservations[reservationId];
  if (reservationId === undefined || reservation === undefined) return state;
  return { ...state, reservations: { ...state.reservations, [reservationId]: { ...reservation, convertedTo: burialId } } };
}

export function applyChurch(state: ChurchState, event: ChurchEvent): ChurchState {
  const base = applyBase(state, event);
  if (base !== undefined) return base;
  const e = event as Exclude<ChurchEvent, { type: CoreEvent["type"] }>;
  switch (e.type) {
    case "burial_recorded": {
      const { type: _type, reservationId, ...burial } = e;
      return convertReservation({ ...state, burials: { ...state.burials, [burial.burialId]: burial } }, reservationId, burial.burialId);
    }
    case "burial_placed": {
      const burial = state.burials[e.burialId];
      if (burial === undefined) return state;
      const placed = { ...state, burials: { ...state.burials, [e.burialId]: { ...burial, plotId: e.plotId, spaceId: e.spaceId, claimId: e.claimId } } };
      return convertReservation(placed, e.reservationId, e.burialId);
    }
    case "burial_corrected": {
      const burial = state.burials[e.burialId];
      if (burial === undefined) return state;
      const next: Burial = { ...burial, nameUnknown: e.nameUnknown, date: e.date, dateText: e.dateText, correctionRefs: [...burial.correctionRefs, e.correctionRef] };
      if (e.recordedName === undefined) delete next.recordedName;
      else next.recordedName = e.recordedName;
      if (e.claimId !== undefined) next.claimId = e.claimId;
      if (e.page !== undefined) next.page = e.page;
      return { ...state, burials: { ...state.burials, [e.burialId]: next } };
    }
    case "burial_moved": {
      const burial = state.burials[e.burialId];
      if (burial === undefined) return state;
      return {
        ...state,
        burials: { ...state.burials, [e.burialId]: { ...burial, plotId: e.plotId, spaceId: e.spaceId, claimId: e.claimId, correctionRefs: [...burial.correctionRefs, e.correctionRef] } },
      };
    }
    case "burial_voided": {
      const burial = state.burials[e.burialId];
      if (burial === undefined) return state;
      return { ...state, burials: { ...state.burials, [e.burialId]: { ...burial, voided: true, correctionRefs: [...burial.correctionRefs, e.correctionRef] } } };
    }
    case "space_added": {
      const plot = state.core.plots[e.plotId];
      if (plot === undefined) return state;
      const spaces = [...plot.spaces, { spaceId: e.spaceId, label: e.label, checked: false, retired: false }];
      return { ...state, core: { ...state.core, plots: { ...state.core.plots, [e.plotId]: { ...plot, spaces } } } };
    }
    case "kept_separate":
      return { ...state, separate: { ...state.separate, [e.key]: true } };
    case "burials_linked": {
      const burials = { ...state.burials };
      for (const id of e.burialIds) {
        const burial = burials[id];
        if (burial !== undefined) burials[id] = { ...burial, personKey: e.personKey };
      }
      return { ...state, burials };
    }
    case "reservation_recorded": {
      const people = e.holder === undefined ? state.people : { ...state.people, [e.holder.personId]: e.holder };
      let requests = state.requests;
      const from = e.reservation.fromRequest;
      const request = from === undefined ? undefined : requests[from];
      if (from !== undefined && request !== undefined) requests = { ...requests, [from]: { ...request, reservationId: e.reservation.reservationId } };
      return { ...state, people, requests, reservations: { ...state.reservations, [e.reservation.reservationId]: e.reservation } };
    }
    case "request_added": {
      const people = e.holder === undefined ? state.people : { ...state.people, [e.holder.personId]: e.holder };
      return { ...state, people, requests: { ...state.requests, [e.request.requestId]: e.request } };
    }
    case "reservation_released": {
      const reservation = state.reservations[e.reservationId];
      if (reservation === undefined) return state;
      return { ...state, reservations: { ...state.reservations, [e.reservationId]: { ...reservation, released: { on: e.on, reason: e.reason } } } };
    }
    case "reading_saved":
      return { ...state, memorials: { ...state.memorials, [e.memorial.memorialId]: e.memorial } };
    case "reading_settled": {
      const memorial = state.memorials[e.memorialId];
      return memorial === undefined ? state : { ...state, memorials: { ...state.memorials, [e.memorialId]: { ...memorial, unclear: false } } };
    }
    case "stone_photo_linked": {
      const memorial = state.memorials[e.memorialId];
      if (memorial === undefined) return state;
      return { ...state, memorials: { ...state.memorials, [e.memorialId]: { ...memorial, photoIds: [...memorial.photoIds, e.photoId] } } };
    }
    case "burial_approved":
      return { ...state, approvals: { ...state.approvals, [e.approval.burialId]: e.approval } };
    case "public_set": {
      const next = { ...state.pub, ...e.pub };
      for (const key of ["siteName", "gateName", "directions"] as const) if (next[key] === "") delete next[key];
      return { ...state, pub: next };
    }
    case "approval_withdrawn": {
      const approval = state.approvals[e.burialId];
      return approval === undefined ? state : { ...state, approvals: { ...state.approvals, [e.burialId]: { ...approval, withdrawn: true } } };
    }
    default:
      throw new Error("not implemented");
  }
}

/** Lower case, accents removed, single spaces. For matching only. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Pairs of live burials with the same name once case, accents and spacing are ignored.
 * A pair the keeper kept separate or linked is left out. The register never merges them.
 */
export function possibleMatches(state: ChurchState): [Uuid, Uuid][] {
  const byName = new Map<string, Burial[]>();
  for (const burial of Object.values(state.burials)) {
    if (burial.voided === true || burial.nameUnknown || burial.recordedName === undefined) continue;
    const key = fold(burial.recordedName);
    byName.set(key, [...(byName.get(key) ?? []), burial]);
  }
  const pairs: [Uuid, Uuid][] = [];
  for (const group of byName.values()) {
    const sorted = [...group].sort((a, b) => (a.burialId < b.burialId ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i] as Burial;
        const b = sorted[j] as Burial;
        if (state.separate[pairKey(a.burialId, b.burialId)] === true) continue;
        if (a.personKey !== undefined && a.personKey === b.personKey) continue;
        pairs.push([a.burialId, b.burialId]);
      }
    }
  }
  return pairs.sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : 1));
}

/**
 * Whether the keeper's approval still holds. A material change to the name, the unknown flag, the
 * place, or the year when the year was approved, returns it to review. Voided or withdrawn is none.
 */
export function approvalStatus(state: ChurchState, burialId: Uuid): ApprovalStatus {
  const approval = state.approvals[burialId];
  const burial = state.burials[burialId];
  if (approval === undefined || approval.withdrawn === true || burial === undefined || burial.voided === true) return "none";
  const same =
    !burial.nameUnknown &&
    burial.recordedName === approval.basis.recordedName &&
    !approval.basis.nameUnknown &&
    burial.plotId === approval.basis.plotId &&
    (!approval.includeYear || yearOf(burial.date) === approval.basis.year);
  return same ? "approved" : "review";
}

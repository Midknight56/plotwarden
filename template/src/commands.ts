// Core commands and their decisions. Pure: no I/O, no random choice.
// Every ID a decision uses comes from the command.
import { intervalCovers, isValidLocalDate } from "./calendar";
import type { LocalDate } from "./calendar";
import { CORE_PAYLOAD_VERSION } from "./events";
import type { CoreEvent, DraftEvent } from "./events";
import { checkLimit, checkText } from "./limits";
import { findCodeOwner, newPlot, renamePlot, retireSpace, validateCode } from "./plot";
import { claimInterval, overlappingClaims } from "./status";
import { err, ok } from "./types";
import type { Claim, ClaimMode, CoreState, FieldError, Plot, Result, Space, Uuid } from "./types";

export type CoreCommand =
  | {
      type: "add_plot";
      plotId: Uuid;
      code: string;
      sectionId?: Uuid;
      spaces: { spaceId: Uuid; label?: string }[];
    }
  | { type: "rename_plot"; plotId: Uuid; code: string }
  | { type: "retire_space"; plotId: Uuid; spaceId: Uuid }
  | { type: "confirm_empty"; spaceIds: Uuid[] }
  | {
      type: "add_claim";
      claimId: Uuid;
      spaceId: Uuid;
      mode: ClaimMode;
      start?: LocalDate;
      endExclusive?: LocalDate;
      endable: boolean;
      ref?: string;
      sourceRef?: string;
      reason?: string;
      /**
       * The earliest day the claim could begin, when `start` is unknown (a burial dated by year only).
       * It is the lower bound of the overlap check and nothing else: it is never stored on the claim.
       */
      overlapFrom?: LocalDate;
      /** A held claim on this space that this claim takes over. */
      converts?: Uuid;
    }
  | { type: "end_claim"; claimId: Uuid; reason: string }
  | { type: "return_to_use"; claimId: Uuid }
  | { type: "void_claim"; claimId: Uuid; correctsEventId: Uuid; reason: string };

export const CORE_COMMAND_TYPES = [
  "add_plot",
  "rename_plot",
  "retire_space",
  "confirm_empty",
  "add_claim",
  "end_claim",
  "return_to_use",
  "void_claim",
] as const;

export interface CoreContext {
  spacesPerPlot: { min: number; max: number };
}

const MODES: readonly ClaimMode[] = ["taken", "held", "unusable"];

function required(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function codeFieldError(code: string): FieldError | undefined {
  const result = validateCode(code);
  return result.ok ? undefined : { field: "code", code: result.error.code };
}

/** Shape checks that need no state. Each error names its field. */
export function validateCore(command: CoreCommand, _state: CoreState): FieldError[] {
  const fields: FieldError[] = [];
  const push = (field: string, code: string) => fields.push({ field, code });

  switch (command.type) {
    case "add_plot":
    case "rename_plot": {
      const problem = codeFieldError(command.code);
      if (problem !== undefined) fields.push(problem);
      break;
    }
    case "confirm_empty":
      if (command.spaceIds.length === 0) push("spaceIds", "required");
      break;
    case "add_claim": {
      if (!MODES.includes(command.mode)) push("mode", "bad_mode");
      const startOk = command.start === undefined || isValidLocalDate(command.start);
      const endOk = command.endExclusive === undefined || isValidLocalDate(command.endExclusive);
      if (!startOk) push("start", "invalid_date");
      if (!endOk) push("endExclusive", "invalid_date");
      if (command.overlapFrom !== undefined && !isValidLocalDate(command.overlapFrom)) push("overlapFrom", "invalid_date");
      if (
        startOk &&
        endOk &&
        command.start !== undefined &&
        command.endExclusive !== undefined &&
        command.endExclusive <= command.start
      ) {
        push("endExclusive", "bad_interval");
      }
      if (command.sourceRef !== undefined && !checkText("sourceRefChars", command.sourceRef).ok) {
        push("sourceRef", "over_limit");
      }
      if (command.reason !== undefined && !checkText("noteChars", command.reason).ok) push("reason", "over_limit");
      if (command.mode === "unusable" && required(command.reason)) push("reason", "required");
      break;
    }
    case "end_claim":
      if (required(command.reason)) push("reason", "required");
      else if (!checkText("noteChars", command.reason).ok) push("reason", "over_limit");
      break;
    case "void_claim":
      if (required(command.correctsEventId)) push("correctsEventId", "required");
      if (required(command.reason)) push("reason", "required");
      else if (!checkText("noteChars", command.reason).ok) push("reason", "over_limit");
      break;
    case "retire_space":
    case "return_to_use":
      break;
  }
  return fields;
}

type Drafts = DraftEvent<CoreEvent>[];

function draft(
  event: CoreEvent,
  entityIds: string[],
  effectiveOn: LocalDate,
  extra?: { sourceRef?: string; corrects?: Uuid },
): DraftEvent<CoreEvent> {
  const result: DraftEvent<CoreEvent> = { event, entityIds, effectiveOn, payloadVersion: CORE_PAYLOAD_VERSION };
  if (extra?.sourceRef !== undefined) result.sourceRef = extra.sourceRef;
  if (extra?.corrects !== undefined) result.corrects = extra.corrects;
  return result;
}

function findSpace(state: CoreState, spaceId: Uuid): { plot: Plot; space: Space } | undefined {
  for (const plot of Object.values(state.plots)) {
    const space = plot.spaces.find((s) => s.spaceId === spaceId);
    if (space !== undefined) return { plot, space };
  }
  return undefined;
}

/**
 * Decide a core command at an effective date. Returns a typed error or an
 * ordered list of draft events. Reads only its arguments.
 */
export function decideCore(
  state: CoreState,
  command: CoreCommand,
  effectiveOn: LocalDate,
  ctx: CoreContext,
): Result<Drafts> {
  if (!isValidLocalDate(effectiveOn)) return err("invalid_date");
  if (!(CORE_COMMAND_TYPES as readonly string[]).includes(command.type)) {
    return err("unknown_command", { type: command.type });
  }
  const fields = validateCore(command, state);
  if (fields.length > 0) return err("invalid_input", undefined, { fields });

  switch (command.type) {
    case "add_plot":
      return decideAddPlot(state, command, effectiveOn, ctx);
    case "rename_plot":
      return decideRename(state, command, effectiveOn);
    case "retire_space":
      return decideRetire(state, command, effectiveOn);
    case "confirm_empty":
      return decideConfirm(state, command, effectiveOn);
    case "add_claim":
      return decideAddClaim(state, command, effectiveOn);
    case "end_claim":
      return decideEnd(state, command, effectiveOn);
    case "return_to_use":
      return decideReturn(state, command, effectiveOn);
    case "void_claim":
      return decideVoid(state, command, effectiveOn);
  }
}

type Cmd<T extends CoreCommand["type"]> = Extract<CoreCommand, { type: T }>;

function decideAddPlot(state: CoreState, command: Cmd<"add_plot">, on: LocalDate, ctx: CoreContext): Result<Drafts> {
  const input: Parameters<typeof newPlot>[0] = {
    plotId: command.plotId,
    siteId: state.siteId,
    code: command.code,
    spaces: command.spaces,
  };
  if (command.sectionId !== undefined) input.sectionId = command.sectionId;
  const created = newPlot(input, ctx.spacesPerPlot);
  if (!created.ok) return created;
  const plot = created.value;

  const plots = Object.values(state.plots);
  const owner = findCodeOwner(plots, plot.code);
  if (owner !== undefined) {
    return err("code_taken", {
      code: plot.code,
      plotId: owner.plotId,
      via: owner.via,
      sectionId: state.plots[owner.plotId]?.sectionId,
    });
  }
  if (state.plots[plot.plotId] !== undefined) return err("duplicate_id", { id: plot.plotId });
  const known = new Set(plots.flatMap((p) => p.spaces.map((s) => s.spaceId)));
  for (const space of plot.spaces) {
    if (known.has(space.spaceId)) return err("duplicate_id", { id: space.spaceId });
  }
  const limit = checkLimit("plotsPerSite", plots.length + 1, { ref: plot.code });
  if (!limit.ok) return limit;

  const event: CoreEvent = {
    type: "plot_added",
    plotId: plot.plotId,
    code: plot.code,
    spaces: plot.spaces.map((s) => ({ spaceId: s.spaceId, label: s.label })),
  };
  if (plot.sectionId !== undefined) event.sectionId = plot.sectionId;
  return ok([draft(event, [plot.plotId, ...plot.spaces.map((s) => s.spaceId)], on)]);
}

function decideRename(state: CoreState, command: Cmd<"rename_plot">, on: LocalDate): Result<Drafts> {
  const plot = state.plots[command.plotId];
  if (plot === undefined) return err("no_such_plot", { plotId: command.plotId });
  const renamed = renamePlot(plot, command.code, Object.values(state.plots));
  if (!renamed.ok) return renamed;
  return ok([draft({ type: "plot_renamed", plotId: plot.plotId, code: renamed.value.code }, [plot.plotId], on)]);
}

function decideRetire(state: CoreState, command: Cmd<"retire_space">, on: LocalDate): Result<Drafts> {
  const plot = state.plots[command.plotId];
  if (plot === undefined) return err("no_such_plot", { plotId: command.plotId });
  const hasHistory = Object.values(state.claims).some((c) => c.spaceId === command.spaceId);
  const retired = retireSpace(plot, command.spaceId, hasHistory);
  if (!retired.ok) return retired;
  return ok([
    draft({ type: "space_retired", plotId: plot.plotId, spaceId: command.spaceId }, [plot.plotId, command.spaceId], on),
  ]);
}

function decideConfirm(state: CoreState, command: Cmd<"confirm_empty">, on: LocalDate): Result<Drafts> {
  const seen = new Set<Uuid>();
  for (const spaceId of command.spaceIds) {
    if (seen.has(spaceId)) return err("duplicate_id", { id: spaceId });
    seen.add(spaceId);
    const found = findSpace(state, spaceId);
    if (found === undefined) return err("no_such_space", { spaceId });
    if (found.space.retired) return err("space_retired", { spaceId });
    // A space with any claim is already checked, so this refusal covers it too.
    if (found.space.checked) return err("already_checked", { spaceId });
  }
  return ok([draft({ type: "spaces_confirmed_empty", spaceIds: [...command.spaceIds] }, [...command.spaceIds], on)]);
}

function claimDetail(other: Claim) {
  return {
    claimId: other.claimId,
    mode: other.mode,
    sourceRef: other.sourceRef,
    start: other.start,
    endExclusive: other.endExclusive,
    ref: other.ref,
  };
}

function decideAddClaim(state: CoreState, command: Cmd<"add_claim">, on: LocalDate): Result<Drafts> {
  if (state.claims[command.claimId] !== undefined) return err("duplicate_id", { id: command.claimId });
  const found = findSpace(state, command.spaceId);
  if (found === undefined) return err("no_such_space", { spaceId: command.spaceId });
  if (found.space.retired) return err("space_retired", { spaceId: command.spaceId });
  if (command.mode !== "taken" && !found.space.checked) {
    return err("space_unchecked", { spaceId: command.spaceId });
  }

  if (command.converts !== undefined) {
    const held = state.claims[command.converts];
    const valid =
      command.mode === "taken" &&
      held !== undefined &&
      held.voided !== true &&
      held.mode === "held" &&
      held.endable &&
      held.spaceId === command.spaceId &&
      (command.start === undefined || intervalCovers(claimInterval(held), command.start));
    if (!valid) return err("bad_conversion", { claimId: command.converts });
    if (command.start === undefined) return err("start_required", { claimId: command.converts });
  }

  const span: { start?: LocalDate; endExclusive?: LocalDate } = {};
  // The stored claim keeps its own start. Only the overlap check may use the earliest possible day.
  const checkFrom = command.start ?? command.overlapFrom;
  if (checkFrom !== undefined) span.start = checkFrom;
  if (command.endExclusive !== undefined) span.endExclusive = command.endExclusive;
  const overlaps = overlappingClaims(state, command.spaceId, span, command.converts);
  if (overlaps.length > 0) {
    const blocker = overlaps.find((c) => command.mode === "taken" && c.mode === "taken") ?? overlaps[0]!;
    const code = command.mode === "taken" && blocker.mode === "taken" ? "space_taken" : "claim_overlap";
    return err(code, claimDetail(blocker));
  }

  const claim: Claim = {
    claimId: command.claimId,
    spaceId: command.spaceId,
    mode: command.mode,
    endable: command.endable,
  };
  if (command.start !== undefined) claim.start = command.start;
  if (command.endExclusive !== undefined) claim.endExclusive = command.endExclusive;
  if (command.ref !== undefined) claim.ref = command.ref;
  if (command.sourceRef !== undefined) claim.sourceRef = command.sourceRef;
  if (command.reason !== undefined) claim.reason = command.reason.trim();

  const extra = command.sourceRef === undefined ? undefined : { sourceRef: command.sourceRef };
  const entityIds = [command.claimId, command.spaceId];
  if (command.ref !== undefined) entityIds.push(command.ref);
  const drafts: Drafts = [];
  if (command.converts !== undefined && command.start !== undefined) {
    drafts.push(
      draft(
        { type: "claim_ended", claimId: command.converts, endExclusive: command.start, reason: "Converted" },
        [command.converts],
        on,
      ),
    );
  }
  drafts.push(draft({ type: "claim_added", claim }, entityIds, on, extra));
  return ok(drafts);
}

function liveClaim(state: CoreState, claimId: Uuid): Claim | undefined {
  const claim = state.claims[claimId];
  return claim === undefined || claim.voided === true ? undefined : claim;
}

function checkEndable(claim: Claim, on: LocalDate): Result<true> {
  if (claim.endExclusive !== undefined && claim.endExclusive <= on) {
    return err("already_ended", { claimId: claim.claimId, endExclusive: claim.endExclusive });
  }
  if (claim.start !== undefined && on <= claim.start) {
    return err("bad_interval", { claimId: claim.claimId, start: claim.start });
  }
  return ok(true);
}

function decideEnd(state: CoreState, command: Cmd<"end_claim">, on: LocalDate): Result<Drafts> {
  const claim = liveClaim(state, command.claimId);
  if (claim === undefined) return err("no_such_claim", { claimId: command.claimId });
  if (claim.mode === "unusable") return err("wrong_command", { claimId: claim.claimId }, { route: "return_to_use" });
  if (!claim.endable) return err("taken_needs_correction", { claimId: claim.claimId }, { route: "correct_entry" });
  const timing = checkEndable(claim, on);
  if (!timing.ok) return timing;
  return ok([
    draft(
      { type: "claim_ended", claimId: claim.claimId, endExclusive: on, reason: command.reason.trim() },
      [claim.claimId, claim.spaceId],
      on,
    ),
  ]);
}

function decideReturn(state: CoreState, command: Cmd<"return_to_use">, on: LocalDate): Result<Drafts> {
  const claim = liveClaim(state, command.claimId);
  if (claim === undefined) return err("no_such_claim", { claimId: command.claimId });
  if (claim.mode !== "unusable") return err("wrong_command", { claimId: claim.claimId }, { route: "end_claim" });
  const timing = checkEndable(claim, on);
  if (!timing.ok) return timing;
  return ok([
    draft({ type: "claim_ended", claimId: claim.claimId, endExclusive: on }, [claim.claimId, claim.spaceId], on),
  ]);
}

function decideVoid(state: CoreState, command: Cmd<"void_claim">, on: LocalDate): Result<Drafts> {
  const claim = state.claims[command.claimId];
  if (claim === undefined) return err("no_such_claim", { claimId: command.claimId });
  if (claim.voided === true) return err("already_voided", { claimId: command.claimId });
  return ok([
    draft(
      { type: "claim_voided", claimId: claim.claimId, reason: command.reason.trim() },
      [claim.claimId, claim.spaceId],
      on,
      { corrects: command.correctsEventId },
    ),
  ]);
}

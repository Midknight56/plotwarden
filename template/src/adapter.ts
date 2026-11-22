// The adapter contract and the kind neutral shell core. Pure.
// The template never reads the value of `kind`. It only compares it with the
// kind of a site, so an app may name its kind anything.
import type { LocalDate } from "./calendar";
import type { DraftEvent, StoredEvent } from "./events";
import { replay } from "./events";
import { LIMITS } from "./limits";
import { checkSiteKind } from "./site";
import { err, ok } from "./types";
import type { DomainError, FieldError, Result, Site } from "./types";

export type Audience = "private" | "visitor" | "committee";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "choice" | "money";
  required?: boolean;
  maxChars?: number;
  choices?: readonly string[];
  /** Fast entry may repeat this value from the row above, as a section or as a page. */
  repeat?: "section" | "page";
}

export interface SheetDef {
  name: string;
  required: readonly string[];
  optional?: readonly string[];
}

/** A check an adapter raises for the committee. Spec 05 adds the packet around it. */
export interface ReviewFact {
  rule: string;
  subjectId: string;
  label: string;
}

export interface ReportBuilder<S> {
  id: string;
  title: string;
  build(state: S, asOf: LocalDate): unknown;
}

export type CopyCatalog = Readonly<Record<string, string>>;

export interface ThemeTokens {
  ink: string;
  paper: string;
  accent?: string;
}

/** Design D3. An app supplies one of these. */
export interface RegisterAdapter<S, C extends { type: string }, E extends { type: string }> {
  kind: string;
  version: number;
  /** The new register form asks for a currency, as a garden does. */
  usesCurrency?: boolean;
  spacesPerPlot: { min: number; max: number };
  fields: FieldDef[];
  sheets: SheetDef[];
  commands: readonly C["type"][];
  initialState(site: Site): S;
  validate(command: C, state: S): FieldError[];
  decide(state: S, command: C, effectiveOn: LocalDate): Result<DraftEvent<E>[], DomainError>;
  apply(state: S, event: E): S;
  project(snapshot: S, audience: Audience, asOf: LocalDate): unknown;
  reports: ReportBuilder<S>[];
  reviewFacts(snapshot: S, asOf: LocalDate): ReviewFact[];
  labels: CopyCatalog;
  theme: ThemeTokens;
}

/** What the screens use. It holds no screen code and no storage code. */
export interface Register<S, C extends { type: string }, E extends { type: string }> {
  readonly kind: string;
  readonly adapter: RegisterAdapter<S, C, E>;
  /** A register opens only a site of its own kind. */
  accepts(site: Site): Result<true>;
  initialState(site: Site): S;
  replay(site: Site, events: readonly StoredEvent[]): Result<S>;
  /** Check the command name, then its fields, then decide. */
  run(state: S, command: C, effectiveOn: LocalDate): Result<DraftEvent<E>[]>;
}

const FUNCTIONS = ["initialState", "validate", "decide", "apply", "project", "reviewFacts"] as const;

function checkAdapter<S, C extends { type: string }, E extends { type: string }>(
  adapter: RegisterAdapter<S, C, E>,
): FieldError[] {
  const fields: FieldError[] = [];
  if (typeof adapter.kind !== "string" || adapter.kind.trim() === "") fields.push({ field: "kind", code: "required" });
  if (!Number.isInteger(adapter.version) || adapter.version < 1) fields.push({ field: "version", code: "bad_version" });
  const range = adapter.spacesPerPlot;
  const limit = LIMITS.spacesPerChurchyardPlot;
  if (
    range === undefined ||
    !Number.isInteger(range.min) ||
    !Number.isInteger(range.max) ||
    range.min < 1 ||
    range.max > limit ||
    range.min > range.max
  ) {
    fields.push({ field: "spacesPerPlot", code: "bad_range" });
  }
  if (!Array.isArray(adapter.commands) || adapter.commands.length === 0) {
    fields.push({ field: "commands", code: "required" });
  }
  for (const name of FUNCTIONS) {
    if (typeof adapter[name] !== "function") fields.push({ field: name, code: "required" });
  }
  return fields;
}

/** Build the kind neutral part of a register from an adapter, or say what is wrong with it. */
export function defineRegister<S, C extends { type: string }, E extends { type: string }>(
  adapter: RegisterAdapter<S, C, E>,
): Result<Register<S, C, E>> {
  const fields = checkAdapter(adapter);
  if (fields.length > 0) return err("invalid_adapter", undefined, { fields });

  const register: Register<S, C, E> = {
    kind: adapter.kind,
    adapter,
    accepts: (site) => checkSiteKind(site, adapter.kind),
    initialState: (site) => adapter.initialState(site),
    replay(site, events) {
      return replay<S, E>(adapter.apply, adapter.initialState(site), events);
    },
    run(state, command, effectiveOn) {
      if (!adapter.commands.includes(command.type)) return err("unknown_command", { type: command.type });
      const problems = adapter.validate(command, state);
      if (problems.length > 0) return err("invalid_input", undefined, { fields: problems });
      return adapter.decide(state, command, effectiveOn);
    },
  };
  return ok(register);
}

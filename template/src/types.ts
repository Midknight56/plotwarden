// Private record types and the shared result shapes. Pure.
// Visitor and committee modules never import this file.
import type { IsoInstant, LocalDate } from "./calendar";

/** A locally generated UUID. Never derived from a name, code, date or row. */
export type Uuid = string;

export type Currency = "GBP" | "EUR" | "USD" | "CAD";

export interface DomainError {
  /** A stable code. Text for a code lives in `ui/copy.ts`. */
  code: string;
  detail?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** The allowed route for a refused edit, for example "correct_entry". */
  route?: string;
  fields?: FieldError[];
}

export interface FieldError {
  field: string;
  code: string;
}

export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err(
  code: string,
  detail?: DomainError["detail"],
  extra?: Pick<DomainError, "route" | "fields">,
): { ok: false; error: DomainError } {
  const error: DomainError = { code };
  if (detail !== undefined) error.detail = detail;
  if (extra?.route !== undefined) error.route = extra.route;
  if (extra?.fields !== undefined) error.fields = extra.fields;
  return { ok: false, error };
}

export type PhysicalState = "free" | "reserved" | "taken" | "unusable";

export type SiteWorkspace = "own" | "walkthrough";

export interface Site {
  id: Uuid;
  lineageId: Uuid;
  /** Exchange identity. Separate from `id`. Rotates on a backwards restore or a fork. */
  siteKey: Uuid;
  /** Opaque to the template. Set once. */
  kind: string;
  workspace: SiteWorkspace;
  schemaVersion: number;
  title: string;
  locale: string;
  /** IANA zone, for example "Europe/London". */
  zone: string;
  createdAt: IsoInstant;
  revision: number;
  currency?: Currency;
}

export interface Space {
  spaceId: Uuid;
  label: string;
  checked: boolean;
  retired: boolean;
}

export interface Plot {
  plotId: Uuid;
  siteId: Uuid;
  sectionId?: Uuid;
  /** The visible code, as typed. */
  code: string;
  /** Earlier codes, as typed. They stay searchable and reserved. */
  priorCodes: string[];
  spaces: Space[];
  archived: boolean;
}

export type ClaimMode = "taken" | "held" | "unusable";

/**
 * A dated hold on one space. An app decides which of its records raise which
 * claim: a burial is taken and not endable, a tenancy is taken and endable,
 * a reservation or an open offer is held.
 */
export interface Claim {
  claimId: Uuid;
  spaceId: Uuid;
  mode: ClaimMode;
  /** First day covered. Absent means from before any known date. */
  start?: LocalDate;
  /** First day not covered. Absent means open. */
  endExclusive?: LocalDate;
  endable: boolean;
  /** The app's own record ID. Opaque here. */
  ref?: string;
  sourceRef?: string;
  reason?: string;
  voided?: boolean;
}

export interface CoreState {
  siteId: Uuid;
  plots: Record<Uuid, Plot>;
  claims: Record<Uuid, Claim>;
}

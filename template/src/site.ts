// Sites: identity, creation, library, kind check, protected fields. Pure.
import { isValidZone } from "./calendar";
import type { IsoInstant } from "./calendar";
import { checkText } from "./limits";
import { err, ok } from "./types";
import type { Currency, FieldError, Result, Site, SiteWorkspace, Uuid } from "./types";

export const SITE_SCHEMA_VERSION = 1;

const CURRENCIES: readonly Currency[] = ["GBP", "EUR", "USD", "CAD"];

export interface NewSite {
  id: Uuid;
  lineageId: Uuid;
  /** Exchange identity. Separate from `id`. */
  siteKey: Uuid;
  kind: string;
  workspace?: SiteWorkspace;
  title: string;
  locale?: string;
  zone: string;
  createdAt: IsoInstant;
  currency?: Currency;
}

/** Mint a private ID. Never derived from a name, code, date or row position. */
export function mintId(): Uuid {
  return globalThis.crypto.randomUUID();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID.test(s);
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Create a site record at revision 0, bound to one kind and one workspace. */
export function createSite(input: NewSite): Result<Site> {
  const fields: FieldError[] = [];
  for (const field of ["id", "lineageId", "siteKey"] as const) {
    if (!isUuid(input[field])) fields.push({ field, code: "bad_id" });
  }
  const kind = input.kind.trim();
  if (kind === "") fields.push({ field: "kind", code: "required" });
  else if (!checkText("nameChars", kind).ok) fields.push({ field: "kind", code: "over_limit" });

  const title = input.title.trim();
  if (title === "") fields.push({ field: "title", code: "required" });
  else if (!checkText("nameChars", title).ok) fields.push({ field: "title", code: "over_limit" });

  if (!isValidZone(input.zone)) fields.push({ field: "zone", code: "bad_zone" });
  if (!INSTANT.test(input.createdAt) || Number.isNaN(Date.parse(input.createdAt))) {
    fields.push({ field: "createdAt", code: "bad_time" });
  }
  if (input.currency !== undefined && !CURRENCIES.includes(input.currency)) {
    fields.push({ field: "currency", code: "bad_currency" });
  }
  if (fields.length > 0) return err("invalid_site", undefined, { fields });

  const site: Site = {
    id: input.id,
    lineageId: input.lineageId,
    siteKey: input.siteKey,
    kind,
    workspace: input.workspace ?? "own",
    schemaVersion: SITE_SCHEMA_VERSION,
    title,
    locale: input.locale ?? "en-GB",
    zone: input.zone,
    createdAt: input.createdAt,
    revision: 0,
  };
  if (input.currency !== undefined) site.currency = input.currency;
  return ok(site);
}

/** Sites of one kind and workspace, by title ignoring case, then by ID. */
export function siteLibrary(sites: readonly Site[], scope: { kind: string; workspace: SiteWorkspace }): Site[] {
  return sites
    .filter((s) => s.kind === scope.kind && s.workspace === scope.workspace)
    .sort((a, b) => {
      const ta = a.title.toLowerCase();
      const tb = b.title.toLowerCase();
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** A register opens only a site of its own kind. The kind value is opaque here. */
export function checkSiteKind(site: Site, appKind: string): Result<true> {
  if (site.kind === appKind) return ok(true);
  return err("wrong_kind", { siteKind: site.kind, appKind });
}

interface ProtectedRule {
  route?: string;
  /** When set, the field is protected only while this context flag is true. */
  onlyWhen?: "hasCharge";
}

/** Design D7. A missing `route` means there is no allowed route. */
const PROTECTED: Record<string, ProtectedRule> = {
  "site.id": {},
  "site.kind": {},
  "site.lineageId": {},
  "plot.id": {},
  "space.id": {},
  "event.bytes": { route: "correction_event" },
  "plot.priorCodes": {},
  "application.sequence": {},
  "application.joinedOn": { route: "correction_event" },
  "burial.spaceId": { route: "move_or_void_burial" },
  "burial.dateValue": { route: "move_or_void_burial" },
  "burial.name": { route: "move_or_void_burial" },
  "space.withHistory": {},
  "ledger.amount": { route: "reverse_then_new" },
  "charge.withReceipts": { route: "reverse_receipts_first" },
  "approval.afterMaterialChange": { route: "family_editor_review" },
  "site.currency": { onlyWhen: "hasCharge" },
};

/** Refuse an edit to a protected field and name the allowed route, if any. */
export function checkProtectedEdit(target: string, ctx?: { hasCharge?: boolean }): Result<true> {
  const rule = PROTECTED[target];
  if (rule === undefined) return ok(true);
  if (rule.onlyWhen === "hasCharge" && ctx?.hasCharge !== true) return ok(true);
  return err("protected_field", { field: target }, rule.route === undefined ? undefined : { route: rule.route });
}

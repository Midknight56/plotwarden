// T02: a site has one kind and one workspace, a library lists only its own
// kind, and protected fields refuse edits. Expected routes are typed here from
// 00-contracts design D7.
import { beforeAll, describe, expect, it } from "vitest";
import {
  SITE_SCHEMA_VERSION,
  checkProtectedEdit,
  checkSiteKind,
  createSite,
  isUuid,
  mintId,
  siteLibrary,
  type NewSite,
} from "../../template/src/site";
import type { Site } from "../../template/src/types";
import { FIXED_NOW } from "../helpers/clock";

function input(over: Partial<NewSite> = {}): NewSite {
  return {
    id: mintId(),
    lineageId: mintId(),
    siteKey: mintId(),
    kind: "churchyard",
    title: "Lantern Fold",
    zone: "Europe/London",
    createdAt: FIXED_NOW,
    ...over,
  };
}

function made(over: Partial<NewSite> = {}): Site {
  const result = createSite(input(over));
  if (!result.ok) throw new Error(`fixture site refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("T02 identity", () => {
  it("mints UUIDs that are unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(mintId());
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(isUuid(id)).toBe(true);
  });

  it("does not derive an ID from a name or a date", () => {
    const a = made({ id: mintId(), title: "Lantern Fold" });
    const b = made({ id: mintId(), title: "Lantern Fold" });
    expect(a.id).not.toBe(b.id);
    expect(a.id.toLowerCase()).not.toContain("lantern");
    expect(a.lineageId).not.toBe(a.id);
    expect(a.siteKey).not.toBe(a.id);
    expect(a.siteKey).not.toBe(a.lineageId);
  });

  it("recognises only real UUIDs", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(mintId().toUpperCase())).toBe(true);
  });
});

describe("T02 creating a site", () => {
  it("binds one kind and one workspace, starts at revision 0", () => {
    const site = made();
    expect(site.kind).toBe("churchyard");
    expect(site.workspace).toBe("own");
    expect(site.revision).toBe(0);
    expect(site.schemaVersion).toBe(SITE_SCHEMA_VERSION);
    expect(site.zone).toBe("Europe/London");
    expect(site.createdAt).toBe(FIXED_NOW);
  });

  it("keeps the garden currency when given", () => {
    expect(made({ kind: "allotment", currency: "GBP" }).currency).toBe("GBP");
    expect(made().currency).toBeUndefined();
  });

  it("names each bad field", () => {
    const result = createSite(
      input({ id: "x", kind: " ", title: "", zone: "Mars/Olympus", createdAt: "yesterday", currency: "XYZ" as never }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = Object.fromEntries((result.error.fields ?? []).map((f) => [f.field, f.code]));
      expect(fields).toEqual({
        id: "bad_id",
        kind: "required",
        title: "required",
        zone: "bad_zone",
        createdAt: "bad_time",
        currency: "bad_currency",
      });
    }
  });

  it("refuses a title over 100 characters", () => {
    const result = createSite(input({ title: "a".repeat(101) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields).toContainEqual({ field: "title", code: "over_limit" });
    expect(createSite(input({ title: "a".repeat(100) })).ok).toBe(true);
  });
});

describe("T02 library and kind isolation", () => {
  let church1: Site;
  let church2: Site;
  let garden: Site;
  let walkChurch: Site;
  let all: Site[];

  beforeAll(() => {
    church1 = made({ title: "Lantern Fold" });
    church2 = made({ title: "abbey Close" });
    garden = made({ kind: "allotment", title: "Thimble Beds", currency: "GBP" });
    walkChurch = made({ title: "Practice Yard", workspace: "walkthrough" });
    all = [garden, church1, walkChurch, church2];
  });

  it("lists a garden in the garden library and never in the churchyard library", () => {
    const churchLibrary = siteLibrary(all, { kind: "churchyard", workspace: "own" });
    expect(churchLibrary.map((s) => s.id)).not.toContain(garden.id);
    const gardenLibrary = siteLibrary(all, { kind: "allotment", workspace: "own" });
    expect(gardenLibrary.map((s) => s.id)).toEqual([garden.id]);
  });

  it("keeps a walkthrough site out of the keeper's own sites", () => {
    const own = siteLibrary(all, { kind: "churchyard", workspace: "own" });
    expect(own.map((s) => s.id)).not.toContain(walkChurch.id);
    const practice = siteLibrary(all, { kind: "churchyard", workspace: "walkthrough" });
    expect(practice.map((s) => s.id)).toEqual([walkChurch.id]);
  });

  it("orders by title ignoring case, then by ID, and does not change the input", () => {
    const own = siteLibrary(all, { kind: "churchyard", workspace: "own" });
    expect(own.map((s) => s.title)).toEqual(["abbey Close", "Lantern Fold"]);
    expect(all.map((s) => s.id)).toEqual([garden.id, church1.id, walkChurch.id, church2.id]);
    const same = [made({ title: "Same" }), made({ title: "Same" })];
    const ordered = siteLibrary(same, { kind: "churchyard", workspace: "own" }).map((s) => s.id);
    expect(ordered).toEqual([...same.map((s) => s.id)].sort());
  });

  it("refuses to open a site of one kind in a register of another", () => {
    const result = checkSiteKind(garden, "churchyard");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("wrong_kind");
      expect(result.error.detail).toMatchObject({ siteKind: "allotment", appKind: "churchyard" });
    }
    expect(checkSiteKind(garden, "allotment").ok).toBe(true);
  });
});

describe("T02 protected fields (design D7)", () => {
  // target, route that the refusal names, or undefined when there is none
  const REFUSED: [string, string | undefined][] = [
    ["site.id", undefined],
    ["site.kind", undefined],
    ["site.lineageId", undefined],
    ["plot.id", undefined],
    ["space.id", undefined],
    ["event.bytes", "correction_event"],
    ["plot.priorCodes", undefined],
    ["application.sequence", undefined],
    ["application.joinedOn", "correction_event"],
    ["burial.spaceId", "move_or_void_burial"],
    ["burial.dateValue", "move_or_void_burial"],
    ["burial.name", "move_or_void_burial"],
    ["space.withHistory", undefined],
    ["ledger.amount", "reverse_then_new"],
    ["charge.withReceipts", "reverse_receipts_first"],
    ["approval.afterMaterialChange", "family_editor_review"],
  ];

  it.each(REFUSED)("refuses %s and names its route", (target, route) => {
    const result = checkProtectedEdit(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("protected_field");
      expect(result.error.detail?.field).toBe(target);
      expect(result.error.route).toBe(route);
    }
  });

  it("refuses a currency change once a charge exists, with no route", () => {
    const result = checkProtectedEdit("site.currency", { hasCharge: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.route).toBeUndefined();
  });

  it("allows a currency change before any charge", () => {
    expect(checkProtectedEdit("site.currency", { hasCharge: false }).ok).toBe(true);
    expect(checkProtectedEdit("site.currency").ok).toBe(true);
  });

  it("allows ordinary fields", () => {
    for (const target of ["site.title", "site.zone", "plot.sectionId", "person.contact"]) {
      expect(checkProtectedEdit(target).ok, target).toBe(true);
    }
  });
});

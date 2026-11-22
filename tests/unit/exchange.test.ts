// T24: the committee exchange files (spec 05, X3, X5, X7). Closed, versioned packet and slip,
// the shared vectors, the limits, the label check, comparison and reading a slip.
// Expected values come from hand-totals.md section 6 and from tests/fixtures/exchange-vectors.json.
import { describe, expect, it } from "vitest";
import { comparePackets, itemKey, sourceKey } from "../../template/src/exchange/compare";
import { buildPacket, checkLabelText, encodePacket, previewPacket, reviewFileName } from "../../template/src/exchange/packet";
import type { PacketInput } from "../../template/src/exchange/packet";
import { ACTIONS, ACTION_FOR_RULE, DISPOSITIONS, REVIEW_FORMAT, RULES, SLIP_FORMAT, canonical, parsePacket, parseSlip, readExchangeFile } from "../../template/src/exchange/schema";
import type { ReviewPacket, Rule } from "../../template/src/exchange/schema";
import { buildSlip, encodeSlip, readSlip, slipFileName } from "../../template/src/exchange/slip";
import * as exchange from "../../template/src/exchange/compare";
import * as schema from "../../template/src/exchange/schema";
import * as slipModule from "../../template/src/exchange/slip";
import { checkCompareVector, checkParseVector, checkReadingVector, loadVectors, vectorFailures } from "../helpers/exchangeVectors";
import type { ExchangeModule } from "../helpers/exchangeVectors";

const vectors = loadVectors();
const MODULE: ExchangeModule = { ...schema, ...exchange, ...slipModule } as unknown as ExchangeModule;

const hex = (n: number): string => n.toString(16).padStart(12, "0");
const uuid = (prefix: string, n: number): string => `${prefix}-0000-4000-8000-${hex(n)}`;
const SITE = uuid("5a5a5a5a", 1);
const OTHER_SITE = uuid("5a5a5a5a", 2);
const LINEAGE = uuid("11e11e11", 1);
const issueKey = (n: number): string => uuid("15500000", n);
const subjectKey = (n: number): string => uuid("50b00000", n);
const actionId = (n: number): string => uuid("ac700000", n);

function input(over: Partial<PacketInput> = {}): PacketInput {
  return {
    siteKind: "churchyard",
    siteKey: SITE,
    lineageId: LINEAGE,
    siteAlias: "Site 1",
    revision: 5,
    asOf: "2026-04-20",
    issues: [
      { issueKey: issueKey(11), subjectKey: subjectKey(11), label: "Record 1", rule: "placement_missing", factVersion: 1 },
      { issueKey: issueKey(10), subjectKey: subjectKey(10), label: "Record 2", rule: "reading_unclear", factVersion: 1 },
    ],
    ...over,
  };
}

function packet(over: Partial<PacketInput> = {}): ReviewPacket {
  const built = buildPacket(input(over));
  if (!built.ok) throw new Error(`packet refused: ${JSON.stringify(built.fields)}`);
  return built.packet;
}

function manyIssues(count: number): PacketInput["issues"] {
  return Array.from({ length: count }, (_, i) => ({
    issueKey: issueKey(i + 1),
    subjectKey: subjectKey(i + 1),
    label: `Record ${i + 1}`,
    rule: "fee_late" as Rule,
    factVersion: 1,
  }));
}

const bytesOf = (value: unknown): Uint8Array => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));

describe("the fixed words of the contract (hand totals 6.1)", () => {
  it("has the two formats, the four rules and the four actions", () => {
    expect(REVIEW_FORMAT).toBe("plot.review.v1");
    expect(SLIP_FORMAT).toBe("plot.slip.v1");
    expect([...RULES]).toEqual(["placement_missing", "reading_unclear", "offer_late", "fee_late"]);
    expect([...ACTIONS]).toEqual(["check_location", "read_stone_again", "check_reply", "check_payment"]);
    expect([...DISPOSITIONS]).toEqual(["checked", "needs_keeper"]);
  });

  it("gives each rule its one action", () => {
    expect(ACTION_FOR_RULE).toEqual({
      placement_missing: "check_location",
      reading_unclear: "read_stone_again",
      offer_late: "check_reply",
      fee_late: "check_payment",
    });
  });
});

describe("the shared vectors", () => {
  it("holds every hand written case", () => {
    expect(vectors.format).toBe("plot.exchange.vectors.v1");
    expect(vectors.packets).toHaveLength(23);
    expect(vectors.slips).toHaveLength(9);
    expect(vectors.compare).toHaveLength(8);
    expect(vectors.reading).toHaveLength(8);
  });

  describe("packets", () => {
    it.each(vectors.packets.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
      expect(checkParseVector((x) => parsePacket(x), vector)).toBeUndefined();
    });
  });

  describe("slips", () => {
    it.each(vectors.slips.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
      expect(checkParseVector((x) => parseSlip(x), vector)).toBeUndefined();
    });
  });

  describe("comparison", () => {
    it.each(vectors.compare.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
      expect(checkCompareVector(MODULE, vector)).toBeUndefined();
    });
  });

  describe("reading a slip", () => {
    it.each(vectors.reading.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
      expect(checkReadingVector(MODULE, vector)).toBeUndefined();
    });
  });

  it("passes as a whole", () => {
    expect(vectorFailures(MODULE, vectors)).toEqual([]);
  });
});

describe("the limits (hand totals 6.1)", () => {
  it("accepts 2,000 issues and refuses 2,001", () => {
    expect(buildPacket(input({ issues: manyIssues(2000) })).ok).toBe(true);
    const over = buildPacket(input({ issues: manyIssues(2001) }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fields.map((f) => f.field)).toContain("issues");
  });

  it("parses 2,000 issues and refuses 2,001 in a file that is already written", () => {
    const ok = packet({ issues: manyIssues(2000) });
    expect(parsePacket(JSON.parse(JSON.stringify(ok))).ok).toBe(true);
    const tooMany = { ...JSON.parse(JSON.stringify(ok)), issues: manyIssues(2001).map((i) => ({ ...i, action: "check_payment" })) };
    expect(parsePacket(tooMany).ok).toBe(false);
  });

  it("accepts a site name and a label of 40 characters and refuses 41, counting code points", () => {
    const forty = "x".repeat(40);
    const withEmoji = "🌿".repeat(40);
    expect(buildPacket(input({ siteAlias: forty })).ok).toBe(true);
    expect(buildPacket(input({ siteAlias: withEmoji })).ok).toBe(true);
    const long = buildPacket(input({ siteAlias: `${forty}x` }));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.fields.map((f) => f.field)).toContain("siteAlias");
    const issue = (label: string) => [{ issueKey: issueKey(1), subjectKey: subjectKey(1), label, rule: "fee_late" as Rule, factVersion: 1 }];
    expect(buildPacket(input({ issues: issue(forty) })).ok).toBe(true);
    const longLabel = buildPacket(input({ issues: issue(`${forty}x`) }));
    expect(longLabel.ok).toBe(false);
    if (!longLabel.ok) expect(longLabel.fields.map((f) => f.field)).toContain("issues.0.label");
  });

  it("reads a file of exactly 2 MiB and refuses one byte more", () => {
    const text = JSON.stringify(packet());
    const limit = 2 * 1024 * 1024;
    const exact = new Uint8Array(limit).fill(0x20);
    exact.set(bytesOf(text));
    expect(readExchangeFile(exact).ok).toBe(true);
    const over = new Uint8Array(limit + 1).fill(0x20);
    over.set(bytesOf(text));
    const refused = readExchangeFile(over);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("too_big");
  });
});

describe("canonical JSON", () => {
  it("sorts keys at every depth, keeps array order and writes no spaces", () => {
    expect(canonical({ b: 1, a: { d: [2, 1], c: "x" } })).toBe('{"a":{"c":"x","d":[2,1]},"b":1}');
  });

  it("leaves out undefined values and escapes text as JSON does", () => {
    expect(canonical({ a: undefined, b: 'say "hi"\n' })).toBe('{"b":"say \\"hi\\"\\n"}');
  });
});

describe("telling files apart (X5.2)", () => {
  it("reads a packet and a slip from their bytes", () => {
    const p = readExchangeFile(bytesOf(packet()));
    expect(p.ok && p.form).toBe("review");
    const built = buildSlip({
      siteKey: SITE,
      lineageId: LINEAGE,
      packetRevision: 5,
      packetAsOf: "2026-04-20",
      decisions: [{ actionId: actionId(1), issueKey: issueKey(11), factVersion: 1, disposition: "checked", reviewedOn: "2026-04-21" }],
    });
    expect(built.ok).toBe(true);
    const s = readExchangeFile(bytesOf(built.ok ? built.slip : {}));
    expect(s.ok && s.form).toBe("slip");
  });

  it("accepts a leading byte order mark", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(packet())]);
    expect(readExchangeFile(withBom).ok).toBe(true);
  });

  it("names a backup, a visitor file, a layout file and a draft as the wrong kind of file", () => {
    const zip = readExchangeFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
    expect(zip).toMatchObject({ ok: false, code: "wrong_file", found: "backup" });
    for (const format of ["plot.family.v1", "plot.availability.v1"]) {
      expect(readExchangeFile(bytesOf({ format }))).toMatchObject({ ok: false, code: "wrong_file", found: "visitor" });
    }
    for (const format of ["plot.layout.v1", "plot.draft.v1"]) {
      expect(readExchangeFile(bytesOf({ format }))).toMatchObject({ ok: false, code: "wrong_file", found: "other" });
    }
  });

  it("says a newer version of either file needs a newer version", () => {
    expect(readExchangeFile(bytesOf({ format: "plot.review.v2" }))).toMatchObject({ ok: false, code: "newer_version" });
    expect(readExchangeFile(bytesOf({ format: "plot.slip.v12" }))).toMatchObject({ ok: false, code: "newer_version" });
  });

  it("refuses text that is not JSON, JSON that is not an object and a format it does not know", () => {
    expect(readExchangeFile(bytesOf("hello"))).toMatchObject({ ok: false, code: "not_json" });
    expect(readExchangeFile(new Uint8Array([0xff, 0xfe, 0x00]))).toMatchObject({ ok: false, code: "not_json" });
    expect(readExchangeFile(bytesOf("[]"))).toMatchObject({ ok: false, code: "unknown_format" });
    expect(readExchangeFile(bytesOf({ format: "hello" }))).toMatchObject({ ok: false, code: "unknown_format" });
    expect(readExchangeFile(bytesOf({}))).toMatchObject({ ok: false, code: "unknown_format" });
  });

  it("reports the problems of a packet that has the right format and the wrong shape", () => {
    const bad = { ...JSON.parse(JSON.stringify(packet())), note: "extra" };
    const got = readExchangeFile(bytesOf(bad));
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe("invalid");
      expect(got.issues?.[0]).toMatchObject({ code: "unrecognized_keys", path: "", keys: ["note"] });
    }
  });
});

describe("building a packet (X3.1, X3.6, hand totals 6.1)", () => {
  it("writes exactly the 8 top level fields and the 6 fields of each issue, in a fixed order", () => {
    const p = packet();
    expect(Object.keys(p)).toEqual(["format", "siteKind", "siteKey", "lineageId", "siteAlias", "revision", "asOf", "issues"]);
    for (const issue of p.issues) {
      expect(Object.keys(issue)).toEqual(["issueKey", "subjectKey", "label", "rule", "factVersion", "action"]);
    }
    expect(Object.keys(p).length + p.issues.length * 6).toBe(20);
  });

  it("derives each action from its rule", () => {
    const p = packet({
      issues: [
        { issueKey: issueKey(1), subjectKey: subjectKey(1), label: "Record 1", rule: "offer_late", factVersion: 1 },
        { issueKey: issueKey(2), subjectKey: subjectKey(2), label: "Record 2", rule: "fee_late", factVersion: 2 },
      ],
    });
    expect(p.issues.map((i) => i.action)).toEqual(["check_reply", "check_payment"]);
  });

  it("orders issues by issue key, so the same content gives the same bytes", () => {
    const a = packet();
    const b = packet({ issues: [...input().issues].reverse() });
    expect(a.issues.map((i) => i.issueKey)).toEqual([issueKey(10), issueKey(11)]);
    expect(encodePacket(a)).toEqual(encodePacket(b));
  });

  it("copies nothing the caller did not name", () => {
    const withExtra = input({
      issues: [{ issueKey: issueKey(1), subjectKey: subjectKey(1), label: "Record 1", rule: "fee_late", factVersion: 1, personName: "Ada Stonecrop", amount: 3000 } as never],
    });
    const built = buildPacket(withExtra);
    expect(built.ok).toBe(true);
    if (built.ok) {
      const text = JSON.stringify(built.packet);
      expect(text).not.toContain("Ada Stonecrop");
      expect(text).not.toContain("3000");
      expect(Object.keys(built.packet.issues[0] ?? {})).toHaveLength(6);
    }
  });

  it("refuses bad input and names the field of each problem", () => {
    const fields = (over: Partial<PacketInput>) => {
      const got = buildPacket(input(over));
      return got.ok ? [] : got.fields.map((f) => f.field);
    };
    expect(fields({ siteKey: "lantern-fold" })).toContain("siteKey");
    expect(fields({ lineageId: "x" })).toContain("lineageId");
    expect(fields({ revision: 0 })).toContain("revision");
    expect(fields({ asOf: "2026-02-30" })).toContain("asOf");
    expect(fields({ siteKind: "Churchyard" })).toContain("siteKind");
    expect(fields({ siteAlias: "" })).toContain("siteAlias");
    expect(fields({ issues: [{ issueKey: "nope", subjectKey: subjectKey(1), label: "Record 1", rule: "fee_late", factVersion: 1 }] })).toContain("issues.0.issueKey");
    expect(fields({ issues: [{ issueKey: issueKey(1), subjectKey: subjectKey(1), label: "Record 1", rule: "made_up" as Rule, factVersion: 1 }] })).toContain("issues.0.rule");
    expect(fields({ issues: [{ issueKey: issueKey(1), subjectKey: subjectKey(1), label: "Record 1", rule: "fee_late", factVersion: 0 }] })).toContain("issues.0.factVersion");
  });

  it("refuses two issues with one issue key or one subject and rule", () => {
    const one = input().issues[0] as PacketInput["issues"][number];
    const sameKey = buildPacket(input({ issues: [one, { ...one, subjectKey: subjectKey(99), rule: "reading_unclear" }] }));
    expect(sameKey.ok).toBe(false);
    if (!sameKey.ok) expect(sameKey.fields[0]).toEqual({ field: "issues.1.issueKey", code: "duplicate_issue_key" });
    const sameSubject = buildPacket(input({ issues: [one, { ...one, issueKey: issueKey(99) }] }));
    expect(sameSubject.ok).toBe(false);
    if (!sameSubject.ok) expect(sameSubject.fields[0]).toEqual({ field: "issues.1.rule", code: "duplicate_subject_rule" });
  });

  it("keeps two rules on one subject", () => {
    const built = buildPacket(
      input({
        issues: [
          { issueKey: issueKey(1), subjectKey: subjectKey(1), label: "Record 1", rule: "offer_late", factVersion: 1 },
          { issueKey: issueKey(2), subjectKey: subjectKey(1), label: "Record 1", rule: "fee_late", factVersion: 1 },
        ],
      }),
    );
    expect(built.ok).toBe(true);
  });

  it("builds a packet with no issues", () => {
    const p = packet({ issues: [] });
    expect(p.issues).toEqual([]);
  });

  it("round trips through its own bytes", () => {
    const p = packet();
    const text = encodePacket(p);
    expect(text.ok).toBe(true);
    if (text.ok) {
      const read = readExchangeFile(new TextEncoder().encode(text.text));
      expect(read.ok && read.form === "review" && read.packet).toEqual(p);
    }
  });
});

describe("encoding a packet", () => {
  it("writes canonical text and counts UTF 8 bytes, not characters", () => {
    const p = packet({ siteAlias: "Rècord é" });
    const text = encodePacket(p);
    expect(text.ok).toBe(true);
    if (text.ok) {
      expect(text.text).toBe(canonical(p));
      expect(text.bytes).toBe(new TextEncoder().encode(text.text).length);
      expect(text.bytes).toBeGreaterThan(text.text.length);
      expect(text.text).not.toMatch(/\s{2}|\n/);
    }
  });

  it("refuses text over 2 MiB", () => {
    const huge = { ...packet(), siteKind: "x".repeat(2 * 1024 * 1024 + 1) } as unknown as ReviewPacket;
    const got = encodePacket(huge);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe("too_big");
  });
});

describe("what a typed site name or label may hold (X3.4)", () => {
  const known = ["Mirel Quillmoss", "ada.stonecrop@example.invalid", "LF-07A"];

  it("accepts plain neutral words", () => {
    for (const text of ["Record 1", "Site 2", "North gate", "Plot by the yew", "Y07", "Row 3 bed 12", "x".repeat(40)]) {
      expect(checkLabelText(text, known), text).toBeUndefined();
    }
  });

  it("refuses an empty text and one of only spaces", () => {
    expect(checkLabelText("", known)).toBe("required");
    expect(checkLabelText("   ", known)).toBe("required");
  });

  it("refuses 41 characters", () => {
    expect(checkLabelText("x".repeat(41), known)).toBe("over_limit");
  });

  it("refuses a known private string, ignoring case and accents", () => {
    expect(checkLabelText("mirel QUILLMOSS", known)).toBe("private_string");
    expect(checkLabelText("Mirèl Quillmoss plot", known)).toBe("private_string");
    expect(checkLabelText("see LF-07A", known)).toBe("private_string");
    expect(checkLabelText("Quillmoss", known)).toBeUndefined();
  });

  it("ignores blank known strings", () => {
    expect(checkLabelText("Record 1", ["", "  "])).toBeUndefined();
  });

  // Review finding 4 (R16.2, R16.3): a word of a private name is private too.
  it("refuses one word of a private name when the names are given, ignoring case and accents", () => {
    const names = ["Ada Thorne", "Mirèl Quillmoss"];
    expect(checkLabelText("Thorne grave", [], 40, names)).toBe("private_string");
    expect(checkLabelText("ADA bed", [], 40, names)).toBe("private_string");
    expect(checkLabelText("by quillmoss yew", [], 40, names)).toBe("private_string");
    expect(checkLabelText("Mirel's plot", [], 40, names)).toBe("private_string");
    expect(checkLabelText("Mirel plot", [], 40, names)).toBe("private_string");
  });

  it("refuses a single word name as a whole word, and no longer word that only starts with it", () => {
    expect(checkLabelText("Thorne gate", [], 40, ["Thorne"])).toBe("private_string");
    expect(checkLabelText("Thornewood gate", [], 40, ["Thorne"])).toBeUndefined();
  });

  it("does not guard a word of fewer than three letters or a number inside a name", () => {
    expect(checkLabelText("Jo bed 12", [], 40, ["Jo Li 12"])).toBeUndefined();
    expect(checkLabelText("Row 12", [], 40, ["Ada 12 Thorne"])).toBeUndefined();
  });

  it("keeps the order of the problems: empty, too long, a private string, an amount, a contact", () => {
    expect(checkLabelText("", [], 40, ["Thorne"])).toBe("required");
    expect(checkLabelText("Thorne £5", [], 40, ["Thorne"])).toBe("private_string");
  });

  it("refuses what looks like an amount", () => {
    for (const text of ["GBP 36", "owes £5", "$20", "€4", "36.00", "12,50", "usd 9", "Cad 3"]) {
      expect(checkLabelText(text, known), text).toBe("looks_like_amount");
    }
  });

  it("refuses what looks like a contact", () => {
    for (const text of ["a@b.example", "07700 900123", "0770-090-0123", "(0770) 090 0123"]) {
      expect(checkLabelText(text, known), text).toBe("looks_like_contact");
    }
  });

  it("reports the first problem when there are several", () => {
    expect(checkLabelText(`${"x".repeat(41)} Mirel Quillmoss`, known)).toBe("over_limit");
    expect(checkLabelText("Mirel Quillmoss £5", known)).toBe("private_string");
    expect(checkLabelText("£5 a@b.example", known)).toBe("looks_like_amount");
  });
});

describe("the preview (X4.2) and file names (X3.7)", () => {
  it("lists the exact key names, the count, a row for each check and the byte count", () => {
    const p = packet();
    const preview = previewPacket(p);
    expect(preview.siteFields).toEqual(["format", "siteKind", "siteKey", "lineageId", "siteAlias", "revision", "asOf", "issues"]);
    expect(preview.issueFields).toEqual(["issueKey", "subjectKey", "label", "rule", "factVersion", "action"]);
    expect(preview.count).toBe(2);
    expect(preview.rows).toEqual([
      { label: "Record 2", rule: "reading_unclear", action: "read_stone_again", factVersion: 1 },
      { label: "Record 1", rule: "placement_missing", action: "check_location", factVersion: 1 },
    ]);
    const encoded = encodePacket(p);
    expect(encoded.ok && preview.bytes).toBe(encoded.bytes);
  });

  it("names a packet and a slip by kind and date alone", () => {
    expect(reviewFileName("2026-04-20")).toBe("committee-review-2026-04-20.json");
    expect(slipFileName("2026-04-20")).toBe("committee-return-2026-04-20.json");
  });
});

describe("comparing packets (X7, hand totals 6.6)", () => {
  it("is the same for the same packet", () => {
    expect(comparePackets(packet(), packet())).toEqual({ relation: "same" });
  });

  it("is stale when the revision or the date is lower, even if the other is higher", () => {
    expect(comparePackets(packet({ revision: 5 }), packet({ revision: 4 }))).toEqual({ relation: "stale" });
    expect(comparePackets(packet({ revision: 5 }), packet({ revision: 6, asOf: "2026-04-19" }))).toEqual({ relation: "stale" });
    expect(comparePackets(packet({ asOf: "2026-04-20" }), packet({ revision: 4, asOf: "2026-04-25" }))).toEqual({ relation: "stale" });
  });

  it("is a conflict at the same revision and date with other content", () => {
    expect(comparePackets(packet(), packet({ siteAlias: "Site 9" }))).toEqual({ relation: "conflict" });
  });

  it("replaces and sorts each check into one of four lists", () => {
    const current = packet();
    const incoming = packet({
      revision: 6,
      asOf: "2026-04-21",
      issues: [
        { issueKey: issueKey(11), subjectKey: subjectKey(11), label: "Record 1", rule: "placement_missing", factVersion: 2 },
        { issueKey: issueKey(12), subjectKey: subjectKey(12), label: "Record 3", rule: "reading_unclear", factVersion: 1 },
      ],
    });
    const got = comparePackets(current, incoming);
    expect(got.relation).toBe("replace");
    if (got.relation === "replace") {
      expect(got.changes.new).toEqual([issueKey(12)]);
      expect(got.changes.changed).toEqual([issueKey(11)]);
      expect(got.changes.noLongerFlagged).toEqual([issueKey(10)]);
      expect(got.changes.stillOpen).toEqual([]);
      expect(got.changes.new.length + got.changes.stillOpen.length + got.changes.changed.length + got.changes.noLongerFlagged.length).toBe(3);
    }
  });

  it("keeps a check still open when only its label changed", () => {
    const current = packet();
    const incoming = packet({ revision: 6, issues: input().issues.map((i) => ({ ...i, label: `${i.label} again` })) });
    const got = comparePackets(current, incoming);
    expect(got.relation).toBe("replace");
    if (got.relation === "replace") expect(got.changes.stillOpen.sort()).toEqual([issueKey(10), issueKey(11)]);
  });

  it("calls a lower fact version changed too, never silently still open", () => {
    const current = packet({ issues: [{ ...input().issues[0]!, factVersion: 3 }] });
    const incoming = packet({ revision: 6, issues: [{ ...input().issues[0]!, factVersion: 2 }] });
    const got = comparePackets(current, incoming);
    expect(got.relation === "replace" && got.changes.changed).toEqual([issueKey(11)]);
  });

  it("never conflates the same issue key in two sites (T24 first red)", () => {
    const a = packet();
    const b = packet({ siteKey: OTHER_SITE, revision: 9 });
    expect(comparePackets(a, b)).toEqual({ relation: "different_source" });
    expect(sourceKey(a)).not.toBe(sourceKey(b));
    const shared = a.issues[0] as ReviewPacket["issues"][number];
    expect(itemKey(a, shared)).not.toBe(itemKey(b, shared));
    expect(itemKey(a, shared)).toBe(itemKey(packet(), shared));
  });

  it("treats another lineage as another source", () => {
    expect(comparePackets(packet(), packet({ lineageId: uuid("11e11e11", 2) }))).toEqual({ relation: "different_source" });
  });

  it("never lets an older packet replace a newer one (T24 first red)", () => {
    const newer = packet({ revision: 8, asOf: "2026-05-01" });
    for (const older of [packet({ revision: 7, asOf: "2026-05-01" }), packet({ revision: 8, asOf: "2026-04-30" }), packet({ revision: 2, asOf: "2026-01-01" })]) {
      expect(comparePackets(newer, older).relation).toBe("stale");
    }
  });

  it("changes neither packet", () => {
    const current = packet();
    const incoming = packet({ revision: 6 });
    const before = [canonical(current), canonical(incoming)];
    comparePackets(current, incoming);
    expect([canonical(current), canonical(incoming)]).toEqual(before);
  });
});

describe("building a slip (X5.1, hand totals 6.1)", () => {
  const decision = (n: number) => ({ actionId: actionId(n), issueKey: issueKey(n), factVersion: 1, disposition: "checked" as const, reviewedOn: "2026-04-21" });
  const slipInput = (decisions = [decision(1), decision(2)]) => ({ siteKey: SITE, lineageId: LINEAGE, packetRevision: 5, packetAsOf: "2026-04-20", decisions });

  it("writes exactly the 6 top level fields and the 5 fields of each decision", () => {
    const built = buildSlip(slipInput());
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(Object.keys(built.slip)).toEqual(["format", "siteKey", "lineageId", "packetRevision", "packetAsOf", "decisions"]);
      for (const d of built.slip.decisions) expect(Object.keys(d)).toEqual(["actionId", "issueKey", "factVersion", "disposition", "reviewedOn"]);
      expect(Object.keys(built.slip).length + built.slip.decisions.length * 5).toBe(16);
    }
  });

  it("copies no text a caller adds to a decision", () => {
    const built = buildSlip(slipInput([{ ...decision(1), note: "Looked fine" } as never]));
    expect(built.ok && JSON.stringify(built.slip)).not.toContain("Looked fine");
  });

  it("accepts 2,000 decisions and refuses 2,001", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => decision(i + 1));
    expect(buildSlip(slipInput(many(2000))).ok).toBe(true);
    const over = buildSlip(slipInput(many(2001)));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fields.map((f) => f.field)).toContain("decisions");
  });

  it("refuses a repeated action ID and a bad date, naming the field", () => {
    const repeat = buildSlip(slipInput([decision(1), { ...decision(2), actionId: actionId(1) }]));
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.fields[0]).toEqual({ field: "decisions.1.actionId", code: "duplicate_action_id" });
    const date = buildSlip(slipInput([{ ...decision(1), reviewedOn: "2026-13-01" }]));
    expect(date.ok).toBe(false);
    if (!date.ok) expect(date.fields.map((f) => f.field)).toContain("decisions.0.reviewedOn");
  });

  it("keeps the order of the decisions and encodes as canonical text", () => {
    const built = buildSlip(slipInput([decision(2), decision(1)]));
    expect(built.ok && built.slip.decisions.map((d) => d.actionId)).toEqual([actionId(2), actionId(1)]);
    if (built.ok) {
      const encoded = encodeSlip(built.slip);
      expect(encoded.ok && encoded.text).toBe(canonical(built.slip));
      const read = readExchangeFile(new TextEncoder().encode(encoded.ok ? encoded.text : ""));
      expect(read.ok && read.form === "slip" && read.slip).toEqual(built.slip);
    }
  });
});

describe("reading a slip (X5.4, D11, hand totals 6.5)", () => {
  const decisions = (...specs: [number, number][]) =>
    specs.map(([n, version]) => ({ actionId: actionId(n), issueKey: issueKey(n), factVersion: version, disposition: "checked" as const, reviewedOn: "2026-04-21" }));
  const slip = (list: ReturnType<typeof decisions>, over: { siteKey?: string; lineageId?: string } = {}) => {
    const built = buildSlip({ siteKey: over.siteKey ?? SITE, lineageId: over.lineageId ?? LINEAGE, packetRevision: 5, packetAsOf: "2026-04-20", decisions: list });
    if (!built.ok) throw new Error(JSON.stringify(built.fields));
    return built.slip;
  };
  const context = (open: { issueKey: string; factVersion: number }[], received: string[] = []) => ({ siteKey: SITE, lineageId: LINEAGE, open, received });

  it("tests the four conditions in the order of D11", () => {
    // Received beats closed. Closed beats changed. Changed beats ready.
    const reading = readSlip(slip(decisions([1, 1], [2, 1], [3, 1], [4, 1])), context([{ issueKey: issueKey(1), factVersion: 1 }, { issueKey: issueKey(2), factVersion: 2 }, { issueKey: issueKey(4), factVersion: 1 }], [actionId(4), actionId(3)]));
    expect(reading.ok).toBe(true);
    if (reading.ok) {
      expect(reading.rows.map((r) => r.status)).toEqual(["ready", "changed", "received", "received"]);
      expect(reading.counts).toEqual({ ready: 1, changed: 1, closed: 0, received: 2 });
    }
  });

  it("calls a decision for an unknown issue key closed (hand totals 6.5, S3)", () => {
    const reading = readSlip(slip(decisions([9, 1])), context([{ issueKey: issueKey(1), factVersion: 1 }]));
    expect(reading.ok && reading.rows[0]?.status).toBe("closed");
  });

  it("keeps each row's decision and the slip's order", () => {
    const reading = readSlip(slip(decisions([2, 1], [1, 1])), context([{ issueKey: issueKey(1), factVersion: 1 }, { issueKey: issueKey(2), factVersion: 1 }]));
    expect(reading.ok && reading.rows.map((r) => [r.actionId, r.issueKey, r.disposition, r.reviewedOn])).toEqual([
      [actionId(2), issueKey(2), "checked", "2026-04-21"],
      [actionId(1), issueKey(1), "checked", "2026-04-21"],
    ]);
  });

  // Review finding 7, requirement R18.6: ready only when the versions are equal.
  it("calls a decision whose fact version is above the current one changed, never ready (R18.6)", () => {
    const reading = readSlip(slip(decisions([1, 99])), context([{ issueKey: issueKey(1), factVersion: 2 }]));
    expect(reading.ok && reading.rows.map((r) => r.status)).toEqual(["changed"]);
    expect(reading.ok && reading.counts).toEqual({ ready: 0, changed: 1, closed: 0, received: 0 });
  });

  it("refuses the whole slip for another site key or another lineage, with no rows", () => {
    const list = decisions([1, 1]);
    expect(readSlip(slip(list, { siteKey: OTHER_SITE }), context([{ issueKey: issueKey(1), factVersion: 1 }]))).toEqual({ ok: false, code: "other_register" });
    expect(readSlip(slip(list, { lineageId: uuid("11e11e11", 2) }), context([{ issueKey: issueKey(1), factVersion: 1 }]))).toEqual({ ok: false, code: "other_register" });
  });

  it("never identifies a row by date: the same decision on another date reads the same", () => {
    const a = slip(decisions([1, 1]));
    const b = { ...a, packetAsOf: "2025-01-01", decisions: a.decisions.map((d) => ({ ...d, reviewedOn: "2030-01-01" })) };
    const ctx = context([{ issueKey: issueKey(1), factVersion: 1 }]);
    const ra = readSlip(a, ctx);
    const rb = readSlip(b, ctx);
    expect(ra.ok && rb.ok && ra.rows[0]?.status === rb.rows[0]?.status).toBe(true);
  });

  it("changes nothing it is given and reads the same twice (X5.6, INV_SLIP_READ_ONLY)", () => {
    const s = slip(decisions([1, 1], [2, 1]));
    const ctx = context([{ issueKey: issueKey(1), factVersion: 1 }], [actionId(2)]);
    const before = JSON.stringify([s, ctx]);
    const first = readSlip(s, ctx);
    const second = readSlip(s, ctx);
    expect(JSON.stringify([s, ctx])).toBe(before);
    expect(second).toEqual(first);
    if (first.ok && second.ok) expect(first.rows[0]).not.toBe(s.decisions[0]);
  });
});

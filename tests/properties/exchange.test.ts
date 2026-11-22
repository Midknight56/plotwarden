// The committee exchange files (spec 05, T24): closed shapes, order free bytes, comparison
// that never replaces newer with older, slip rows read in the order of D11, and a label
// check that no known private string passes. 1,000 cases each, recorded seeds.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../../template/src/limits";
import { checkLabelText, buildPacket, encodePacket } from "../../template/src/exchange/packet";
import { comparePackets, itemKey } from "../../template/src/exchange/compare";
import { ACTION_FOR_RULE, RULES, canonicalPacket, readExchangeFile } from "../../template/src/exchange/schema";
import type { ReviewPacket, ReturnSlip } from "../../template/src/exchange/schema";
import { buildSlip, encodeSlip, readSlip } from "../../template/src/exchange/slip";
import { runProperty } from "../helpers/property";
import { SEEDS } from "./seeds";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const day = (n: number): string => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

const dateArb = fc.integer({ min: 0, max: 400 }).map(day);
const labelArb = fc.stringMatching(/^[A-Z][a-z]{2,9} [0-9]{1,3}$/);
const ruleArb = fc.constantFrom(...RULES);

const issueArb = fc.record({
  issueKey: fc.uuid(),
  subjectKey: fc.uuid(),
  label: labelArb,
  rule: ruleArb,
  factVersion: fc.integer({ min: 1, max: 50 }),
});

const inputArb = fc.record({
  siteKind: fc.constantFrom("churchyard", "allotment", "market"),
  siteKey: fc.uuid(),
  lineageId: fc.uuid(),
  siteAlias: labelArb,
  revision: fc.integer({ min: 1, max: 200 }),
  asOf: dateArb,
  issues: fc.uniqueArray(issueArb, { maxLength: 12, selector: (i) => i.issueKey }),
});

function packetOf(input: Parameters<typeof buildPacket>[0]): ReviewPacket {
  const built = buildPacket(input);
  if (!built.ok) throw new Error(`INV_EXCHANGE_CLOSED: a valid input was refused: ${JSON.stringify(built.fields)}`);
  return built.packet;
}

/** Put one key the schema does not know at a chosen depth of the parsed file. */
function withExtraKey(packet: ReviewPacket, where: "top" | "issue", name: string): unknown {
  const copy = JSON.parse(JSON.stringify(packet)) as { issues: Record<string, unknown>[] } & Record<string, unknown>;
  if (where === "issue" && copy.issues.length > 0) copy.issues[0]![name] = "x";
  else copy[name] = "x";
  return copy;
}

describe("INV_EXCHANGE_CLOSED: a packet is a closed, versioned shape", () => {
  it("reads back exactly what was written, in under the size limit, with the action of its rule", () => {
    const { cases } = runProperty(
      "INV_EXCHANGE_CLOSED",
      inputArb,
      (input) => {
        const packet = packetOf(input);
        const encoded = encodePacket(packet);
        if (!encoded.ok) throw new Error("INV_EXCHANGE_CLOSED: a small packet was too big");
        const read = readExchangeFile(bytes(encoded.text));
        if (!read.ok || read.form !== "review") throw new Error("INV_EXCHANGE_CLOSED: the written file did not read as a review file");
        expect(canonicalPacket(read.packet)).toBe(canonicalPacket(packet));
        for (const issue of read.packet.issues) expect(issue.action).toBe(ACTION_FOR_RULE[issue.rule]);
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_CLOSED },
    );
    expect(cases).toBeGreaterThanOrEqual(1000);
  });

  it("refuses any extra key at the top and inside an issue", () => {
    runProperty(
      "INV_EXCHANGE_CLOSED",
      fc.tuple(inputArb, fc.constantFrom("top", "issue"), fc.constantFrom("name", "contact", "amount", "note", "holder", "extra")),
      ([input, where, name]) => {
        const packet = packetOf(input);
        const read = readExchangeFile(bytes(JSON.stringify(withExtraKey(packet, where, name))));
        if (read.ok) throw new Error(`INV_EXCHANGE_CLOSED: key "${name}" at ${where} was accepted`);
        expect(read.code).toBe("invalid");
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_CLOSED + 1000 },
    );
  });

  it("refuses a later version and a packet over the issue count", () => {
    runProperty(
      "INV_EXCHANGE_CLOSED",
      fc.tuple(inputArb, fc.integer({ min: 2, max: 9 })),
      ([input, later]) => {
        const text = encodePacket(packetOf(input));
        if (!text.ok) throw new Error("too big");
        const changed = text.text.replace('"plot.review.v1"', `"plot.review.v${later}"`);
        const read = readExchangeFile(bytes(changed));
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.code).toBe("newer_version");
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_CLOSED + 2000 },
    );
    const many = Array.from({ length: LIMITS.reviewIssues + 1 }, (_, i) => ({
      issueKey: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      subjectKey: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      label: "Record 1",
      rule: "fee_late" as const,
      factVersion: 1,
    }));
    const built = buildPacket({
      siteKind: "allotment",
      siteKey: "20000000-0000-4000-8000-000000000001",
      lineageId: "20000000-0000-4000-8000-000000000002",
      siteAlias: "Site 1",
      revision: 1,
      asOf: "2026-04-21",
      issues: many,
    });
    expect(built.ok).toBe(false);
  });
});

describe("INV_EXCHANGE_ORDER: equal content is the same copy whichever way the issues are listed", () => {
  it("gives equal bytes and the relation same", () => {
    runProperty(
      "INV_EXCHANGE_ORDER",
      inputArb.chain((input) =>
        fc.shuffledSubarray(input.issues, { minLength: input.issues.length, maxLength: input.issues.length }).map((shuffled) => ({ input, shuffled })),
      ),
      ({ input, shuffled }) => {
        const a = packetOf(input);
        const b: ReviewPacket = { ...a, issues: shuffled.map((s) => ({ ...s, action: ACTION_FOR_RULE[s.rule] })) };
        expect(canonicalPacket(b)).toBe(canonicalPacket(a));
        expect(comparePackets(a, b)).toEqual({ relation: "same" });
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_ORDER },
    );
  });
});

describe("INV_EXCHANGE_COMPARE: older never replaces newer, and a source is its site key with its lineage", () => {
  const pairArb = fc.tuple(inputArb, fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 }), fc.uniqueArray(issueArb, { maxLength: 8, selector: (i) => i.issueKey })).map(
    ([input, dRevision, dDays, otherIssues]) => ({ input, dRevision, dDays, otherIssues }),
  );

  it("partitions a replacement, and refuses a decrease", () => {
    runProperty(
      "INV_EXCHANGE_COMPARE",
      pairArb,
      ({ input, dRevision, dDays, otherIssues }) => {
        const current = packetOf(input);
        const later = packetOf({ ...input, revision: input.revision + dRevision, asOf: new Date(Date.parse(input.asOf) + dDays * 86_400_000).toISOString().slice(0, 10), issues: otherIssues });
        const forward = comparePackets(current, later);
        if (forward.relation === "replace") {
          const { changes } = forward;
          expect(changes.new.length + changes.stillOpen.length + changes.changed.length).toBe(later.issues.length);
          expect(changes.stillOpen.length + changes.changed.length + changes.noLongerFlagged.length).toBe(current.issues.length);
          expect(new Set([...changes.new, ...changes.stillOpen, ...changes.changed]).size).toBe(later.issues.length);
        } else {
          // Only equal content or the same revision and date with other content may land here.
          expect(["same", "conflict"]).toContain(forward.relation);
        }
        // The other way round is never a replacement unless the pair is equal in both revision and date.
        const back = comparePackets(later, current);
        if (later.revision > current.revision || later.asOf > current.asOf) expect(back.relation).toBe("stale");
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_COMPARE },
    );
  });

  it("keeps two sources apart even when their issue keys are equal", () => {
    runProperty(
      "INV_EXCHANGE_COMPARE",
      fc.tuple(inputArb, fc.uuid(), fc.uuid()),
      ([input, otherSite, otherLineage]) => {
        fc.pre(otherSite !== input.siteKey || otherLineage !== input.lineageId);
        const a = packetOf(input);
        const b = packetOf({ ...input, siteKey: otherSite, lineageId: otherLineage });
        expect(comparePackets(a, b)).toEqual({ relation: "different_source" });
        for (const issue of a.issues) expect(itemKey(a, issue)).not.toBe(itemKey(b, issue));
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_COMPARE + 1000 },
    );
  });
});

describe("INV_EXCHANGE_SLIP: each row is read in the order received, closed, changed, ready", () => {
  const decisionArb = fc.record({
    actionId: fc.uuid(),
    issueKey: fc.uuid(),
    factVersion: fc.integer({ min: 1, max: 20 }),
    disposition: fc.constantFrom("checked" as const, "needs_keeper" as const),
    reviewedOn: dateArb,
  });
  const slipArb = fc
    .record({
      siteKey: fc.uuid(),
      lineageId: fc.uuid(),
      packetRevision: fc.integer({ min: 1, max: 200 }),
      packetAsOf: dateArb,
      decisions: fc.uniqueArray(decisionArb, { maxLength: 15, selector: (d) => d.actionId }),
    })
    .chain((slip) =>
      fc
        .record({
          // For each decision: is its issue open now, at which version, and was its action received.
          open: fc.array(fc.option(fc.integer({ min: 1, max: 22 }), { nil: undefined }), { minLength: slip.decisions.length, maxLength: slip.decisions.length }),
          received: fc.array(fc.boolean(), { minLength: slip.decisions.length, maxLength: slip.decisions.length }),
        })
        .map((rest) => ({ slip, ...rest })),
    );

  it("matches a hand written reading and counts every row once", () => {
    runProperty(
      "INV_EXCHANGE_SLIP",
      slipArb,
      ({ slip, open, received }) => {
        const built = buildSlip(slip);
        if (!built.ok) throw new Error(`INV_EXCHANGE_SLIP: a valid slip was refused: ${JSON.stringify(built.fields)}`);
        const encoded = encodeSlip(built.slip);
        if (!encoded.ok) throw new Error("too big");
        const again = readExchangeFile(bytes(encoded.text));
        if (!again.ok || again.form !== "slip") throw new Error("INV_EXCHANGE_SLIP: the slip did not read back as a slip");
        const slipRead: ReturnSlip = again.slip;

        const reading = readSlip(slipRead, {
          siteKey: slip.siteKey,
          lineageId: slip.lineageId,
          open: slip.decisions.flatMap((d, i) => (open[i] === undefined ? [] : [{ issueKey: d.issueKey, factVersion: open[i]! }])),
          received: slip.decisions.flatMap((d, i) => (received[i] ? [d.actionId] : [])),
        });
        if (!reading.ok) throw new Error("INV_EXCHANGE_SLIP: the right register was refused");
        expect(reading.rows).toHaveLength(slip.decisions.length);
        reading.rows.forEach((row, i) => {
          const want = received[i] ? "received" : open[i] === undefined ? "closed" : open[i]! === slip.decisions[i]!.factVersion ? "ready" : "changed";
          expect(row.status).toBe(want);
        });
        const total = reading.counts.ready + reading.counts.changed + reading.counts.closed + reading.counts.received;
        expect(total).toBe(slip.decisions.length);
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_SLIP },
    );
  });

  it("refuses a slip for another site key or lineage whole", () => {
    runProperty(
      "INV_EXCHANGE_SLIP",
      fc.tuple(slipArb, fc.uuid(), fc.uuid()),
      ([{ slip }, otherSite, otherLineage]) => {
        fc.pre(otherSite !== slip.siteKey || otherLineage !== slip.lineageId);
        const built = buildSlip(slip);
        if (!built.ok) throw new Error("a valid slip was refused");
        const reading = readSlip(built.slip, { siteKey: otherSite, lineageId: otherLineage, open: [], received: [] });
        expect(reading).toEqual({ ok: false, code: "other_register" });
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_SLIP + 1000 },
    );
  });

  it("refuses a repeated action id and any extra key", () => {
    runProperty(
      "INV_EXCHANGE_SLIP",
      fc.tuple(slipArb, fc.constantFrom("name", "note", "amount")),
      ([{ slip }, name]) => {
        fc.pre(slip.decisions.length > 0);
        const doubled = buildSlip({ ...slip, decisions: [...slip.decisions, slip.decisions[0]!] });
        expect(doubled.ok).toBe(false);
        const built = buildSlip(slip);
        if (!built.ok) throw new Error("a valid slip was refused");
        const read = readExchangeFile(bytes(JSON.stringify({ ...built.slip, [name]: "x" })));
        expect(read.ok).toBe(false);
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_SLIP + 2000 },
    );
  });
});

describe("INV_EXCHANGE_LABEL: a known private string never passes as a label", () => {
  const secretArb = fc.stringMatching(/^[A-Z][a-z]{3,10}$/);
  it("catches the string whatever its case, and inside a longer label", () => {
    runProperty(
      "INV_EXCHANGE_LABEL",
      fc.tuple(secretArb, fc.constantFrom("", "Plot ", "x "), fc.constantFrom("", " 7", " here"), fc.constantFrom("lower", "upper", "same")),
      ([secret, before, after, how]) => {
        const shown = how === "lower" ? secret.toLowerCase() : how === "upper" ? secret.toUpperCase() : secret;
        const text = `${before}${shown}${after}`.slice(0, LIMITS.reviewLabelChars);
        fc.pre(text.toLowerCase().includes(secret.toLowerCase()));
        expect(checkLabelText(text, [secret])).toBe("private_string");
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_LABEL },
    );
  });

  it("never lets an empty text, a long text, an amount or a contact through", () => {
    runProperty(
      "INV_EXCHANGE_LABEL",
      fc.tuple(fc.integer({ min: 41, max: 80 }), fc.integer({ min: 1, max: 999 }), fc.integer({ min: 0, max: 99 }), fc.stringMatching(/^[a-z]{2,8}$/)),
      ([long, pounds, pence, word]) => {
        expect(checkLabelText("", [])).toBe("required");
        expect(checkLabelText("   ", [])).toBe("required");
        expect(checkLabelText("a".repeat(long), [])).toBe("over_limit");
        expect(checkLabelText(`Rent £${pounds}.${String(pence).padStart(2, "0")}`, [])).toBe("looks_like_amount");
        expect(checkLabelText(`${word}@${word}.org`, [])).toBe("looks_like_contact");
        return true;
      },
      { seed: SEEDS.INV_EXCHANGE_LABEL + 1000 },
    );
  });
});

// The three tools of the plot inspector. Pure. Each one works on an invented fixture built in memory, chosen
// from a fixed list. A tool reads nothing from an argument: no path, no address, no record of a keeper. An
// argument that is not on its list is refused with a typed error that names the argument and never its value.
import { parseFamily, parseAvailability, scanForCanaries } from "../../template/src/output/privacy";
import { isValidLocalDate } from "../../template/src/calendar";
import type { LocalDate } from "../../template/src/calendar";
import { normalizeCode } from "../../template/src/plot";
import { plotSummaryAt, spaceStateAt } from "../../template/src/status";
import { planExchange } from "../../template/src/ui/exchangeFlow";
import type { ExchangeAdapter } from "../../template/src/ui/exchangeFlow";
import { ADAPTER_IDS, COMMITTEE_EXTRA, FIXTURE_IDS, FIXTURE_OF, INSPECTOR_CANARIES, buildFixture, counter, fixture } from "./fixtures";
import type { AdapterId, AnyAdapter, BuiltFixture, FixtureId } from "./fixtures";

export { INSPECTOR_CANARIES };
export type { FixtureId };

export const TOOL_NAMES = ["explain_plot", "audit_projection", "check_adapter"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolErrorCode =
  | "unknown_tool"
  | "bad_arguments"
  | "unknown_argument"
  | "missing_argument"
  | "bad_argument"
  | "unknown_fixture"
  | "unknown_plot"
  | "bad_date"
  | "unknown_audience"
  | "unknown_adapter"
  | "unknown_case";

export interface ToolError {
  code: ToolErrorCode;
  /** The name of the argument at fault, when there is one. Never its value. */
  argument?: string;
}

export type ToolResult = { ok: true; value: unknown } | { ok: false; error: ToolError };

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string; enum?: string[] }>;
    required: string[];
    additionalProperties: false;
  };
}

const AUDIENCES = ["visitor", "committee"] as const;
const CASES = ["replay", "refusal", "visitor", "width_rule"] as const;
const CASES_OF: Readonly<Record<AdapterId, readonly string[]>> = {
  churchyard: ["replay", "refusal", "visitor"],
  allotment: ["replay", "refusal", "visitor"],
  market: ["replay", "refusal", "visitor", "width_rule"],
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "explain_plot",
    description:
      "Explain one plot of an invented fixture at a date: the state of each space, the counts, and the events that name the plot, in order. Fixtures only. It never reads a file or a record of a keeper.",
    inputSchema: {
      type: "object",
      properties: {
        fixtureId: { type: "string", description: "The invented fixture to read.", enum: [...FIXTURE_IDS] },
        plotCode: { type: "string", description: "A plot code of that fixture, such as Y07, B03 or S2." },
        asOf: { type: "string", description: "The date to read the plot at, as YYYY-MM-DD." },
      },
      required: ["fixtureId", "plotCode", "asOf"],
      additionalProperties: false,
    },
  },
  {
    name: "audit_projection",
    description:
      "Build the visitor file or the committee file of an invented fixture, and report its allowed key paths, its counts, any private string found in it, and whether a private only edit changes it. Fixtures only.",
    inputSchema: {
      type: "object",
      properties: {
        fixtureId: { type: "string", description: "The invented fixture to build from.", enum: [...FIXTURE_IDS] },
        audience: { type: "string", description: "Whose file to build.", enum: [...AUDIENCES] },
      },
      required: ["fixtureId", "audience"],
      additionalProperties: false,
    },
  },
  {
    name: "check_adapter",
    description:
      "Run one fixed conformance vector on an adapter and report pass or fail, with the mismatched field and the reason. Adapters and cases are chosen from lists. It runs no command from an argument.",
    inputSchema: {
      type: "object",
      properties: {
        adapterId: { type: "string", description: "The adapter to check.", enum: [...ADAPTER_IDS] },
        caseId: { type: "string", description: "The vector to run. width_rule is for the market adapter only.", enum: [...CASES] },
      },
      required: ["adapterId", "caseId"],
      additionalProperties: false,
    },
  },
];

// ---- Arguments --------------------------------------------------------------------------------------------

const SHAPE = /^[A-Za-z0-9_.-]*$/;
const MAX_LENGTH = 64;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (code: ToolErrorCode, argument?: string): ToolResult => ({ ok: false, error: argument === undefined ? { code } : { code, argument } });
const done = (value: unknown): ToolResult => ({ ok: true, value });

/**
 * Check the shape of the arguments: an object, no argument that the tool does not have, none missing, each a
 * short text of letters, digits, dots, hyphens and underscores. A path, an address or a shell word is refused
 * here, before any lookup. Returns the texts, or the error.
 */
function readArguments(def: ToolDefinition, args: unknown): { ok: true; text: Record<string, string> } | { ok: false; result: ToolResult } {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return { ok: false, result: fail("bad_arguments") };
  const given = args as Record<string, unknown>;
  const known = Object.keys(def.inputSchema.properties);
  for (const key of Object.keys(given)) if (!known.includes(key)) return { ok: false, result: fail("unknown_argument", SHAPE.test(key) && key.length <= MAX_LENGTH ? key : "argument") };
  for (const key of def.inputSchema.required) if (!Object.hasOwn(given, key)) return { ok: false, result: fail("missing_argument", key) };
  const text: Record<string, string> = {};
  for (const key of known) {
    const value = given[key];
    if (typeof value !== "string" || value.length > MAX_LENGTH || !SHAPE.test(value)) return { ok: false, result: fail("bad_argument", key) };
    text[key] = value;
  }
  return { ok: true, text };
}

const isFixtureId = (v: string): v is FixtureId => (FIXTURE_IDS as readonly string[]).includes(v);
const isAdapterId = (v: string): v is AdapterId => (ADAPTER_IDS as readonly string[]).includes(v);

// ---- explain_plot -----------------------------------------------------------------------------------------

function explainPlot(fixtureId: string, plotCode: string, asOf: string): ToolResult {
  if (!isFixtureId(fixtureId)) return fail("unknown_fixture", "fixtureId");
  const fx = fixture(fixtureId);
  const wanted = normalizeCode(plotCode);
  const plot = Object.values(fx.state.core.plots).find((p) => normalizeCode(p.code) === wanted || p.priorCodes.some((c) => normalizeCode(c) === wanted));
  if (plot === undefined || wanted === "") return fail("unknown_plot", "plotCode");
  if (!DATE.test(asOf) || !isValidLocalDate(asOf)) return fail("bad_date", "asOf");
  const date: LocalDate = asOf;

  const summary = plotSummaryAt(fx.state.core, plot.plotId, date);
  if (summary === undefined) return fail("unknown_plot", "plotCode");
  const active = plot.spaces.filter((s) => !s.retired);
  const ids = new Set<string>([plot.plotId, ...plot.spaces.map((s) => s.spaceId)]);
  return done({
    fixtureId,
    plotCode: plot.code,
    asOf,
    primary: summary.primary ?? null,
    needsChecking: summary.needsChecking,
    counts: summary.counts,
    spaces: active.map((space, index) => {
      const view = spaceStateAt(fx.state.core, space.spaceId, date);
      return { spaceId: `space ${index + 1}`, checked: view?.checked ?? false, state: view?.state ?? null };
    }),
    sources: fx.events.filter((e) => e.entityIds.some((id) => ids.has(id))).map((e) => ({ seq: e.seq, type: e.type, effectiveOn: e.effectiveOn ?? "" })),
  });
}

// ---- audit_projection -------------------------------------------------------------------------------------

/** Every key path of a value. An array is written with `[]`. A list of points is one leaf. */
export function keyPaths(value: unknown, prefix = "", out = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    const path = `${prefix}[]`;
    for (const item of value) if (item !== null && typeof item === "object" && !Array.isArray(item)) keyPaths(item, path, out);
    return [...out].sort();
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      out.add(path);
      if (Array.isArray(item)) {
        for (const element of item) if (element !== null && typeof element === "object" && !Array.isArray(element)) keyPaths(element, `${path}[]`, out);
      } else if (item !== null && typeof item === "object") keyPaths(item, path, out);
    }
  }
  return [...out].sort();
}

interface Built {
  format: string;
  output: unknown;
  counts: Record<string, unknown>;
  canaries: readonly string[];
}

/** The visitor or committee file of a fixture state, built the way the register builds it. */
function projectionOf(fx: BuiltFixture, state: BuiltFixture["state"], audience: (typeof AUDIENCES)[number]): Built {
  if (audience === "visitor") {
    const output = fx.adapter.project(state, "visitor", fx.asOf) as { format?: string; burials?: unknown[]; plots?: unknown[]; paths?: unknown[]; sections?: unknown[]; freePlots?: unknown[] } | null;
    const file = output ?? {};
    const size = (list: unknown[] | undefined) => (list === undefined ? 0 : list.length);
    const counts: Record<string, unknown> =
      file.format === "plot.family.v1"
        ? { burials: size(file.burials), plots: size(file.plots), paths: size(file.paths), sections: size(file.sections) }
        : { freePlots: size(file.freePlots), paths: size(file.paths), sections: size(file.sections) };
    return { format: file.format ?? "none", output, counts, canaries: INSPECTOR_CANARIES[fx.id] };
  }
  const mint = counter(0x9000);
  const planned = planExchange({ site: fx.site, state, revision: fx.revision, adapter: fx.adapter as unknown as ExchangeAdapter, asOf: fx.asOf, alias: "Site 1", labels: {}, mint });
  if (!planned.ok) return { format: "none", output: null, counts: { issues: 0, rules: {} }, canaries: INSPECTOR_CANARIES[fx.id] };
  const rules: Record<string, number> = {};
  for (const issue of planned.plan.packet.issues) rules[issue.rule] = (rules[issue.rule] ?? 0) + 1;
  return {
    format: planned.plan.packet.format,
    output: planned.plan.packet,
    counts: { issues: planned.plan.packet.issues.length, rules },
    canaries: [...INSPECTOR_CANARIES[fx.id], ...COMMITTEE_EXTRA[fx.id]],
  };
}

function auditProjection(fixtureId: string, audience: string): ToolResult {
  if (!isFixtureId(fixtureId)) return fail("unknown_fixture", "fixtureId");
  if (!(AUDIENCES as readonly string[]).includes(audience)) return fail("unknown_audience", "audience");
  const kind = audience as (typeof AUDIENCES)[number];
  const fx = fixture(fixtureId);
  const built = projectionOf(fx, fx.state, kind);

  // A private only edit: a note on the first plot. The file must not change.
  const first = Object.values(fx.state.core.plots).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))[0];
  let changes = false;
  if (first !== undefined) {
    const edited = fx.register.run(fx.state, { type: "add_note", noteId: "00000000-0000-4000-8000-00000000f001", plotId: first.plotId, text: "A private note for the keeper only." }, fx.asOf);
    if (edited.ok) {
      const next = edited.value.reduce((s, d) => fx.adapter.apply(s, d.event), fx.state);
      changes = JSON.stringify(projectionOf(fx, next, kind).output) !== JSON.stringify(built.output);
    }
  }
  return done({
    fixtureId,
    audience: kind,
    format: built.format,
    allowedKeys: keyPaths(built.output),
    counts: built.counts,
    canaryViolations: scanForCanaries(built.output, built.canaries),
    privateEditChangesOutput: changes,
  });
}

// ---- check_adapter ------------------------------------------------------------------------------------------

export interface Mismatch {
  field: string;
  expected: string;
  actual: string;
  reason: string;
}

export interface CheckResult {
  adapterId: string;
  caseId: string;
  pass: boolean;
  mismatches: Mismatch[];
}

type Vector = (fx: BuiltFixture) => Mismatch[];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const replayVector: Vector = (fx) => {
  const replayed = fx.register.replay(fx.site, fx.events);
  if (!replayed.ok) return [{ field: "state", expected: "a state", actual: replayed.error.code, reason: "The stored events could not be replayed." }];
  if (!same(replayed.value, fx.state)) {
    return [{ field: "state", expected: "the state in memory", actual: "another state", reason: "Replaying the stored events gave another state than deciding and applying them." }];
  }
  return [];
};

interface Refusal {
  label: string;
  command: { type: string; [field: string]: unknown };
  code: string;
}

/** Commands each adapter must refuse, built from the ids of the fixture state. Codes are typed from the unit tests of each app. */
function refusalsOf(adapterId: AdapterId, fx: BuiltFixture): Refusal[] {
  const plot = (code: string) => Object.values(fx.state.core.plots).find((p) => p.code === code);
  const space = (code: string) => plot(code)?.spaces[0]?.spaceId ?? "no-such-space";
  const unknown: Refusal = { label: "a command that is not listed", command: { type: "make_tea" }, code: "unknown_command" };
  switch (adapterId) {
    case "churchyard":
      return [
        { label: "a burial in a space that holds a burial", command: { type: "record_burial", burialId: "00000000-0000-4000-8000-00000000e001", sourceRef: "LF-X1", recordedName: "Test Person", nameUnknown: false, date: { p: "year", y: 1900 }, dateText: "1900", plotId: plot("Y01")?.plotId, spaceId: space("Y01"), claimId: "00000000-0000-4000-8000-00000000e002" }, code: "space_taken" },
        { label: "a burial in a space that is held for a reservation", command: { type: "record_burial", burialId: "00000000-0000-4000-8000-00000000e003", sourceRef: "LF-X2", recordedName: "Test Person", nameUnknown: false, date: { p: "year", y: 1900 }, dateText: "1900", plotId: plot("Y02")?.plotId, spaceId: space("Y02"), claimId: "00000000-0000-4000-8000-00000000e004" }, code: "space_reserved" },
        unknown,
      ];
    case "allotment": {
      const application = Object.values((fx.state as unknown as { applications: Record<string, { applicationId: string }> }).applications)[0]?.applicationId;
      return [
        { label: "an offer of a plot that is taken", command: { type: "make_offer", offerId: "00000000-0000-4000-8000-00000000e011", applicationId: application, spaceId: space("B01"), claimId: "00000000-0000-4000-8000-00000000e012", replyBy: "2026-05-01" }, code: "plot_not_free" },
        { label: "an offer of a plot that is unusable", command: { type: "make_offer", offerId: "00000000-0000-4000-8000-00000000e013", applicationId: application, spaceId: space("B06"), claimId: "00000000-0000-4000-8000-00000000e014", replyBy: "2026-05-01" }, code: "plot_not_free" },
        unknown,
      ];
    }
    case "market":
      return [
        { label: "a trader who needs 240 cm on a 200 cm stall", command: { type: "reserve_stall", reservationId: "00000000-0000-4000-8000-00000000e021", claimId: "00000000-0000-4000-8000-00000000e022", plotId: plot("S1")?.plotId, trader: "Pim Cartwhistle", neededCm: 240, start: fx.asOf }, code: "stall_too_narrow" },
        { label: "a stall with no frontage", command: { type: "reserve_stall", reservationId: "00000000-0000-4000-8000-00000000e023", claimId: "00000000-0000-4000-8000-00000000e024", plotId: plot("S4")?.plotId, trader: "Pim Cartwhistle", neededCm: 100, start: fx.asOf }, code: "frontage_unknown" },
        { label: "a stall that is already reserved", command: { type: "reserve_stall", reservationId: "00000000-0000-4000-8000-00000000e025", claimId: "00000000-0000-4000-8000-00000000e026", plotId: plot("S2")?.plotId, trader: "Pim Cartwhistle", neededCm: 100, start: fx.asOf }, code: "claim_overlap" },
        unknown,
      ];
  }
}

const refusalVector =
  (adapterId: AdapterId): Vector =>
  (fx) => {
    const out: Mismatch[] = [];
    for (const refusal of refusalsOf(adapterId, fx)) {
      const before = JSON.stringify(fx.state);
      const result = fx.register.run(fx.state, refusal.command, fx.asOf);
      if (result.ok) out.push({ field: "code", expected: refusal.code, actual: "accepted", reason: `${refusal.label} was accepted.` });
      else if (result.error.code !== refusal.code) out.push({ field: "code", expected: refusal.code, actual: result.error.code, reason: `${refusal.label} was refused for another reason.` });
      if (JSON.stringify(fx.state) !== before) out.push({ field: "state", expected: "the state as it was", actual: "changed", reason: `Deciding ${refusal.label} changed the state it was given.` });
    }
    return out;
  };

const visitorVector: Vector = (fx) => {
  const file = fx.adapter.project(fx.state, "visitor", fx.asOf);
  const parsed = fx.id === "lantern-fold" ? parseFamily(file) : parseAvailability(file);
  const out: Mismatch[] = [];
  if (!parsed.ok) {
    const first = parsed.issues[0];
    out.push({ field: "schema", expected: "a closed visitor file", actual: first?.code ?? "invalid", reason: `The visitor file broke its schema at ${first?.path === "" ? "the top" : (first?.path ?? "the top")}.` });
  }
  const found = scanForCanaries(file, INSPECTOR_CANARIES[fx.id]);
  if (found.length > 0) out.push({ field: "canary", expected: "none", actual: `${found.length} found`, reason: "The visitor file holds a private string." });
  return out;
};

/** The width rule: 240 cm needed. A 300 cm stall takes it. A 200 cm stall does not, and the answer names both widths. */
const widthVector: Vector = (fx) => {
  const out: Mismatch[] = [];
  const plot = (code: string) => Object.values(fx.state.core.plots).find((p) => p.code === code);
  const reserve = (code: string, n: number) => ({ type: "reserve_stall", reservationId: `00000000-0000-4000-8000-00000000e1${n}`, claimId: `00000000-0000-4000-8000-00000000e2${n}`, plotId: plot(code)?.plotId, trader: "Test Trader", neededCm: 240, start: fx.asOf });
  const wide = fx.register.run(fx.state, reserve("S3", 1), fx.asOf);
  if (!wide.ok) out.push({ field: "code", expected: "accepted", actual: wide.error.code, reason: "A 240 cm need on a 300 cm stall was refused." });
  const narrow = fx.register.run(fx.state, reserve("S1", 2), fx.asOf);
  if (narrow.ok) out.push({ field: "code", expected: "stall_too_narrow", actual: "accepted", reason: "A 240 cm need on a 200 cm stall was accepted." });
  else if (narrow.error.code !== "stall_too_narrow") out.push({ field: "code", expected: "stall_too_narrow", actual: narrow.error.code, reason: "A 240 cm need on a 200 cm stall was refused for another reason." });
  else {
    const detail = narrow.error.detail ?? {};
    if (detail["needed"] !== 240) out.push({ field: "needed", expected: "240", actual: String(detail["needed"]), reason: "The refusal does not name the width the trader needs." });
    if (detail["frontage"] !== 200) out.push({ field: "frontage", expected: "200", actual: String(detail["frontage"]), reason: "The refusal does not name the width of the stall." });
  }
  return out;
};

/** Run one vector on an adapter. Another adapter may be given, to see that a break is reported. */
export function checkWith(adapterId: string, caseId: string, adapter?: unknown): CheckResult {
  if (!isAdapterId(adapterId)) return { adapterId, caseId, pass: false, mismatches: [{ field: "adapterId", expected: "a listed adapter", actual: "unknown", reason: "The adapter is not on the list." }] };
  const vectors: Record<string, Vector> = { replay: replayVector, refusal: refusalVector(adapterId), visitor: visitorVector, width_rule: widthVector };
  const vector = vectors[caseId];
  if (vector === undefined || !CASES_OF[adapterId].includes(caseId)) return { adapterId, caseId, pass: false, mismatches: [{ field: "caseId", expected: "a listed case", actual: "unknown", reason: "The case is not on the list for this adapter." }] };
  let fx: BuiltFixture;
  try {
    fx = adapter === undefined ? fixture(FIXTURE_OF[adapterId]) : buildFixture(FIXTURE_OF[adapterId], adapter as AnyAdapter);
  } catch (error) {
    return { adapterId, caseId, pass: false, mismatches: [{ field: "fixture", expected: "a fixture that builds", actual: "refused", reason: error instanceof Error ? error.message : "The fixture could not be built." }] };
  }
  const mismatches = vector(fx);
  return { adapterId, caseId, pass: mismatches.length === 0, mismatches };
}

// ---- The tools ---------------------------------------------------------------------------------------------

export function callTool(name: string, args: unknown): ToolResult {
  const def = TOOLS.find((t) => t.name === name);
  if (def === undefined) return fail("unknown_tool");
  const read = readArguments(def, args);
  if (!read.ok) return read.result;
  const a = read.text;
  switch (def.name) {
    case "explain_plot":
      return explainPlot(a["fixtureId"] as string, a["plotCode"] as string, a["asOf"] as string);
    case "audit_projection":
      return auditProjection(a["fixtureId"] as string, a["audience"] as string);
    case "check_adapter": {
      const adapterId = a["adapterId"] as string;
      const caseId = a["caseId"] as string;
      if (!isAdapterId(adapterId)) return fail("unknown_adapter", "adapterId");
      if (!CASES_OF[adapterId].includes(caseId)) return fail("unknown_case", "caseId");
      return done(checkWith(adapterId, caseId));
    }
  }
}

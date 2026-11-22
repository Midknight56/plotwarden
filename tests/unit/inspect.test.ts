// T33 (spec 06, tasks 6.7 and 6.8): the plot inspector. Three tools on three invented in memory fixtures,
// typed errors, no path, no network, no shell. Expected values are typed here from hand-totals.md sections 1,
// 2, 5 and 6 and from the closed schemas of design D9 and D10, not read from the inspector. The same file
// checks the skills only power and the one inspector entry of the Kiro settings. Requirements Z6 and Z7.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { marketAdapter } from "../../examples/market/src/adapter";
import type { MarketCommand, MarketEvent, MarketState } from "../../examples/market/src/types";
import { scanSource } from "../../scripts/lib/imports.mjs";
import { handleLine } from "../../tools/inspector/server";
import { TOOLS, TOOL_NAMES, callTool } from "../../tools/inspector/inspect";
import { runCli } from "../../tools/inspector/cli";
import { AVAILABILITY_CANARIES } from "../helpers/gardenCanaries";
import { PERSON_KEYS, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { INSPECTOR_CANARIES, checkWith } from "../../tools/inspector/inspect";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ON = "2026-04-20";

type Obj = Record<string, unknown>;
function value(name: string, args: unknown): Obj {
  const result = callTool(name, args);
  if (!result.ok) throw new Error(`${name} refused: ${JSON.stringify(result.error)}`);
  return result.value as Obj;
}
function refused(name: string, args: unknown) {
  const result = callTool(name, args);
  if (result.ok) throw new Error(`${name} accepted ${JSON.stringify(args)}`);
  return result.error;
}
const explain = (fixtureId: string, plotCode: string, asOf = ON) => value("explain_plot", { fixtureId, plotCode, asOf });
const audit = (fixtureId: string, audience: string) => value("audit_projection", { fixtureId, audience });

// ---- explain_plot -------------------------------------------------------------------------------------------

describe("explain_plot on Lantern Fold (hand totals section 1)", () => {
  const free = { free: 1, reserved: 0, taken: 0, unusable: 0 };
  const table: [string, string, Obj][] = [
    ["Y01", "taken", { free: 0, reserved: 0, taken: 1, unusable: 0 }],
    ["Y02", "reserved", { free: 0, reserved: 1, taken: 0, unusable: 0 }],
    ["Y03", "free", free],
    ["Y04", "taken", { free: 0, reserved: 0, taken: 1, unusable: 0 }],
    ["Y07", "taken", { free: 0, reserved: 0, taken: 2, unusable: 0 }],
    ["Y08", "free", free],
    ["Y10", "free", free],
    ["Y11", "reserved", { free: 0, reserved: 1, taken: 0, unusable: 0 }],
    ["Y12", "unusable", { free: 0, reserved: 0, taken: 0, unusable: 1 }],
  ];
  it.each(table)("%s is %s", (code, primary, counts) => {
    const out = explain("lantern-fold", code);
    expect(out["primary"]).toBe(primary);
    expect(out["counts"]).toEqual(counts);
    expect(out["needsChecking"]).toBe(false);
    expect(out["plotCode"]).toBe(code);
    expect(out["fixtureId"]).toBe("lantern-fold");
    expect(out["asOf"]).toBe(ON);
  });

  it("gives Y07 two spaces, both checked and taken, and one space to every other plot", () => {
    const y07 = explain("lantern-fold", "Y07")["spaces"] as Obj[];
    expect(y07).toHaveLength(2);
    expect(y07.map((s) => [s["checked"], s["state"]])).toEqual([[true, "taken"], [true, "taken"]]);
    expect(y07.map((s) => s["spaceId"])).toEqual(["space 1", "space 2"]);
    expect((explain("lantern-fold", "Y03")["spaces"] as Obj[]).length).toBe(1);
  });

  it("lists the source events in order, by position, type and date only", () => {
    const sources = explain("lantern-fold", "Y07")["sources"] as Obj[];
    const seqs = sources.map((s) => s["seq"] as number);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
    const types = sources.map((s) => s["type"]);
    expect(types.filter((t) => t === "plot_added")).toHaveLength(1);
    expect(types.filter((t) => t === "burial_recorded")).toHaveLength(2);
    expect(types.filter((t) => t === "claim_added")).toHaveLength(2);
    for (const source of sources) expect(Object.keys(source).sort()).toEqual(["effectiveOn", "seq", "type"]);
    // Y07 was drawn before anyone was buried in it.
    expect(types[0]).toBe("plot_added");
  });

  it("reads the plot as at a date: Y02 is held from 2025-09-01, so it is free on the day before and reserved on the day", () => {
    expect(explain("lantern-fold", "Y02", "2025-08-31")["primary"]).toBe("free");
    expect(explain("lantern-fold", "Y02", "2025-09-01")["primary"]).toBe("reserved");
  });

  it("finds a plot by its code in any case", () => {
    expect(explain("lantern-fold", "y07")["primary"]).toBe("taken");
    expect(explain("lantern-fold", "y07")["plotCode"]).toBe("Y07");
  });
});

describe("explain_plot on Thimble Beds (hand totals sections 2 and 5)", () => {
  const table: [string, string][] = [
    ["B01", "taken"],
    ["B02", "taken"],
    ["B03", "free"],
    ["B04", "taken"],
    ["B05", "free"],
    ["B06", "unusable"],
  ];
  it.each(table)("%s is %s", (code, primary) => {
    expect(explain("thimble-beds", code)["primary"]).toBe(primary);
  });

  it("holds a tenancy start for B02 as an event of the plot, and nothing for B03 beyond its drawing and its check", () => {
    const b02 = (explain("thimble-beds", "B02")["sources"] as Obj[]).map((s) => s["type"]);
    expect(b02).toContain("claim_added");
    const b03 = (explain("thimble-beds", "B03")["sources"] as Obj[]).map((s) => s["type"]);
    expect(b03).not.toContain("claim_added");
    expect(b03).toContain("plot_added");
  });
});

describe("explain_plot on the market stalls (examples/market/fixture.json)", () => {
  it("S2 is reserved for the trader who needs 240 cm, and S1, S3 and S4 are free", () => {
    expect(explain("market-stalls", "S2")["primary"]).toBe("reserved");
    for (const code of ["S1", "S3", "S4"]) expect(explain("market-stalls", code)["primary"]).toBe("free");
  });

  it("holds no trader name in its answer", () => {
    expect(JSON.stringify(explain("market-stalls", "S2"))).not.toContain("Pennywhistle");
  });
});

describe("explain_plot refuses with a typed error", () => {
  const ok = { fixtureId: "lantern-fold", plotCode: "Y07", asOf: ON };
  it("names an unknown fixture, an unknown plot and a bad date", () => {
    expect(refused("explain_plot", { ...ok, fixtureId: "river-bank" })).toEqual({ code: "unknown_fixture", argument: "fixtureId" });
    expect(refused("explain_plot", { ...ok, plotCode: "Z99" })).toEqual({ code: "unknown_plot", argument: "plotCode" });
    expect(refused("explain_plot", { ...ok, plotCode: "B03" })).toEqual({ code: "unknown_plot", argument: "plotCode" });
    for (const asOf of ["2026-02-30", "20260420", "2026-4-2", "tomorrow", "2026-13-01", "0000-00-00"]) {
      expect(refused("explain_plot", { ...ok, asOf }), asOf).toEqual({ code: "bad_date", argument: "asOf" });
    }
  });

  it("names a missing, an extra and a mistyped argument, in that order of checking", () => {
    expect(refused("explain_plot", { fixtureId: "lantern-fold", plotCode: "Y07" })).toEqual({ code: "missing_argument", argument: "asOf" });
    expect(refused("explain_plot", {})).toEqual({ code: "missing_argument", argument: "fixtureId" });
    expect(refused("explain_plot", { ...ok, path: "x" })).toEqual({ code: "unknown_argument", argument: "path" });
    expect(refused("explain_plot", { ...ok, plotCode: 7 })).toEqual({ code: "bad_argument", argument: "plotCode" });
    expect(refused("explain_plot", { ...ok, fixtureId: null })).toEqual({ code: "bad_argument", argument: "fixtureId" });
  });

  it("refuses anything that is not an object of arguments", () => {
    for (const args of [null, undefined, [], "x", 5, true]) expect(refused("explain_plot", args)).toEqual({ code: "bad_arguments" });
  });

  it("refuses an unknown tool", () => {
    expect(refused("read_file", { path: "README.md" })).toEqual({ code: "unknown_tool" });
    expect(refused("", {})).toEqual({ code: "unknown_tool" });
    expect(refused("__proto__", {})).toEqual({ code: "unknown_tool" });
  });
});

// ---- audit_projection --------------------------------------------------------------------------------------

/** The keys design D9 allows, by path. An array is written with []. */
const D9_FAMILY = new Set([
  "format", "asOf", "siteTitle", "north", "gate", "gate.name", "gate.x", "gate.y", "paths", "paths[].name", "paths[].points",
  "sections", "sections[].id", "sections[].label", "sections[].outline", "plots", "plots[].id", "plots[].code", "plots[].sectionId", "plots[].outline",
  "burials", "burials[].id", "burials[].name", "burials[].year", "burials[].plotId", "burials[].directions",
]);
const D9_AVAILABILITY = new Set([
  "format", "asOf", "siteTitle", "north", "gate", "gate.name", "gate.x", "gate.y", "paths", "paths[].name", "paths[].points",
  "sections", "sections[].id", "sections[].label", "sections[].outline", "freePlots", "freePlots[].id", "freePlots[].code", "freePlots[].sectionId", "freePlots[].outline",
  "neutralGround", "neutralGround[].outline", "instructions",
]);
/** The keys design D10 allows in a committee file. */
const D10_REVIEW = new Set(["format", "siteKind", "siteKey", "lineageId", "siteAlias", "revision", "asOf", "issues", "issues[].issueKey", "issues[].subjectKey", "issues[].label", "issues[].rule", "issues[].factVersion", "issues[].action"]);

describe("audit_projection of the visitor files", () => {
  it("Lantern Fold: a family file with one burial, Mirel Quillmoss, one plot Y07, and only keys of design D9", () => {
    const out = audit("lantern-fold", "visitor");
    expect(out["format"]).toBe("plot.family.v1");
    expect(out["counts"]).toMatchObject({ burials: 1, plots: 1, paths: 1 });
    const keys = out["allowedKeys"] as string[];
    expect(keys.filter((k) => !D9_FAMILY.has(k))).toEqual([]);
    for (const needed of ["format", "gate.name", "burials[].name", "burials[].directions", "plots[].code"]) expect(keys).toContain(needed);
    expect([...keys].sort()).toEqual(keys);
    expect(out["canaryViolations"]).toEqual([]);
    expect(out["privateEditChangesOutput"]).toBe(false);
  });

  it("Thimble Beds: an availability file with the two free plots B03 and B05, no person key, and only keys of design D9", () => {
    const out = audit("thimble-beds", "visitor");
    expect(out["format"]).toBe("plot.availability.v1");
    expect(out["counts"]).toMatchObject({ freePlots: 2 });
    const keys = out["allowedKeys"] as string[];
    expect(keys.filter((k) => !D9_AVAILABILITY.has(k))).toEqual([]);
    // `gate.name` and `paths[].name` are the public names of a gate and a path. No other key may name a person.
    const named = keys.filter((k) => k !== "gate.name" && k !== "paths[].name");
    for (const person of PERSON_KEYS) expect(named.some((k) => k.split(/[.[\]]+/).includes(person)), person).toBe(false);
    expect(out["canaryViolations"]).toEqual([]);
    expect(out["privateEditChangesOutput"]).toBe(false);
  });

  it("the market stalls: an availability file with the three free stalls and no trader", () => {
    const out = audit("market-stalls", "visitor");
    expect(out["format"]).toBe("plot.availability.v1");
    expect(out["counts"]).toMatchObject({ freePlots: 3 });
    expect((out["allowedKeys"] as string[]).filter((k) => !D9_AVAILABILITY.has(k))).toEqual([]);
    expect(out["canaryViolations"]).toEqual([]);
    expect(out["privateEditChangesOutput"]).toBe(false);
  });
});

describe("audit_projection of the committee files", () => {
  it("Lantern Fold: two checks, only keys of design D10", () => {
    const out = audit("lantern-fold", "committee");
    expect(out["format"]).toBe("plot.review.v1");
    expect(out["counts"]).toMatchObject({ issues: 2 });
    expect((out["counts"] as Obj)["rules"]).toEqual({ placement_missing: 1, reading_unclear: 1 });
    expect((out["allowedKeys"] as string[]).filter((k) => !D10_REVIEW.has(k))).toEqual([]);
    expect(out["canaryViolations"]).toEqual([]);
    expect(out["privateEditChangesOutput"]).toBe(false);
  });

  it("Thimble Beds: one check, the late fee on B02", () => {
    const out = audit("thimble-beds", "committee");
    expect(out["counts"]).toMatchObject({ issues: 1 });
    expect((out["counts"] as Obj)["rules"]).toEqual({ fee_late: 1 });
    expect(out["canaryViolations"]).toEqual([]);
  });

  it("the market stalls: no check at all, and still a closed file", () => {
    const out = audit("market-stalls", "committee");
    expect(out["counts"]).toMatchObject({ issues: 0 });
    expect((out["allowedKeys"] as string[]).filter((k) => !D10_REVIEW.has(k))).toEqual([]);
  });
});

describe("audit_projection refuses with a typed error", () => {
  it("names an unknown audience, including the private one, and an unknown fixture", () => {
    for (const audience of ["private", "family", "public", "", "Visitor"]) expect(refused("audit_projection", { fixtureId: "lantern-fold", audience }), audience).toEqual({ code: "unknown_audience", argument: "audience" });
    expect(refused("audit_projection", { fixtureId: "nowhere", audience: "visitor" })).toEqual({ code: "unknown_fixture", argument: "fixtureId" });
    expect(refused("audit_projection", { fixtureId: "lantern-fold" })).toEqual({ code: "missing_argument", argument: "audience" });
    expect(refused("audit_projection", { fixtureId: "lantern-fold", audience: "visitor", records: "all" })).toEqual({ code: "unknown_argument", argument: "records" });
  });
});

describe("the canaries of the inspector are the canaries of the tests", () => {
  it("hold exactly the invented strings of hand totals sections 1 and 5", () => {
    expect([...INSPECTOR_CANARIES["lantern-fold"]].sort()).toEqual([...VISITOR_CANARIES].sort());
    expect([...INSPECTOR_CANARIES["thimble-beds"]].sort()).toEqual([...AVAILABILITY_CANARIES].sort());
    expect(INSPECTOR_CANARIES["market-stalls"]).toEqual(["Rosa Pennywhistle", "Pim Cartwhistle"]);
  });
});

// ---- check_adapter -----------------------------------------------------------------------------------------

describe("check_adapter runs one fixed vector", () => {
  const cases: [string, string][] = [
    ["churchyard", "replay"],
    ["churchyard", "refusal"],
    ["churchyard", "visitor"],
    ["allotment", "replay"],
    ["allotment", "refusal"],
    ["allotment", "visitor"],
    ["market", "replay"],
    ["market", "refusal"],
    ["market", "visitor"],
    ["market", "width_rule"],
  ];
  it.each(cases)("%s %s passes with no mismatch", (adapterId, caseId) => {
    expect(value("check_adapter", { adapterId, caseId })).toEqual({ adapterId, caseId, pass: true, mismatches: [] });
  });

  it("refuses the width rule for an app that has none, and every unknown name", () => {
    expect(refused("check_adapter", { adapterId: "churchyard", caseId: "width_rule" })).toEqual({ code: "unknown_case", argument: "caseId" });
    expect(refused("check_adapter", { adapterId: "bakery", caseId: "replay" })).toEqual({ code: "unknown_adapter", argument: "adapterId" });
    expect(refused("check_adapter", { adapterId: "market", caseId: "all" })).toEqual({ code: "unknown_case", argument: "caseId" });
    expect(refused("check_adapter", { adapterId: "market" })).toEqual({ code: "missing_argument", argument: "caseId" });
    expect(refused("check_adapter", { adapterId: "market", caseId: "replay", command: "ls" })).toEqual({ code: "unknown_argument", argument: "command" });
  });

  it("reports the mismatched field and the reason when an adapter breaks the width rule", () => {
    const lax = {
      ...marketAdapter,
      decide(state: MarketState, command: MarketCommand, on: string) {
        if (command.type === "reserve_stall") return marketAdapter.decide(state, { ...command, neededCm: 1 }, on);
        return marketAdapter.decide(state, command, on);
      },
    };
    const out = checkWith("market", "width_rule", lax as unknown as typeof marketAdapter);
    expect(out.pass).toBe(false);
    expect(out.mismatches).toContainEqual({ field: "code", expected: "stall_too_narrow", actual: "accepted", reason: "A 240 cm need on a 200 cm stall was accepted." });
  });

  it("reports a broken replay and a leaking visitor file by field", () => {
    const hidden = {
      ...marketAdapter,
      apply(state: MarketState, event: MarketEvent) {
        const next = marketAdapter.apply(state, event);
        return event.type === "frontage_set" ? { ...next, siteId: `${Math.random()}` } : next;
      },
    };
    expect(checkWith("market", "replay", hidden as unknown as typeof marketAdapter)).toMatchObject({ pass: false, mismatches: [{ field: "state" }] });
    const leaky = {
      ...marketAdapter,
      project(state: MarketState, audience: "private" | "visitor" | "committee", asOf: string) {
        const file = marketAdapter.project(state, audience, asOf) as Obj;
        return audience === "visitor" ? { ...file, heldBy: "Rosa Pennywhistle" } : file;
      },
    };
    const out = checkWith("market", "visitor", leaky as unknown as typeof marketAdapter);
    expect(out.pass).toBe(false);
    expect(out.mismatches.map((m) => m.field).sort()).toEqual(["canary", "schema"]);
  });
});

// ---- no path, no network, no shell ---------------------------------------------------------------------------

describe("the tools read nothing from an argument", () => {
  const NASTY = [
    "../../etc/passwd",
    "..\\..\\secret.txt",
    "C:\\Users\\someone\\register.pkr.zip",
    "/etc/hosts",
    "file:///etc/hosts",
    "https://example.invalid/x",
    "lantern-fold; ls",
    "$(whoami)",
    "`id`",
    "a && b",
    "a | b",
    "x\u0000y",
    "x\ny",
    "lantern fold",
    "%2e%2e%2f",
    "a".repeat(65),
    "~/records",
  ];
  const calls: [string, (v: string) => Obj][] = [
    ["explain_plot fixtureId", (v) => ({ fixtureId: v, plotCode: "Y07", asOf: ON })],
    ["explain_plot plotCode", (v) => ({ fixtureId: "lantern-fold", plotCode: v, asOf: ON })],
    ["explain_plot asOf", (v) => ({ fixtureId: "lantern-fold", plotCode: "Y07", asOf: v })],
    ["audit_projection fixtureId", (v) => ({ fixtureId: v, audience: "visitor" })],
    ["audit_projection audience", (v) => ({ fixtureId: "lantern-fold", audience: v })],
    ["check_adapter adapterId", (v) => ({ adapterId: v, caseId: "replay" })],
    ["check_adapter caseId", (v) => ({ adapterId: "market", caseId: v })],
  ];
  for (const [label, make] of calls) {
    it(`${label}: every path, URL, drive, shell word and long text is refused as a bad argument`, () => {
      const tool = label.split(" ")[0] as string;
      for (const text of NASTY) {
        const error = refused(tool, make(text));
        expect(["bad_argument"], `${label} ${JSON.stringify(text)}`).toContain(error.code);
        expect(error.argument).toBe(label.split(" ")[1]);
        // The answer never repeats the value.
        expect(JSON.stringify(error)).not.toContain(text.slice(0, 8));
      }
    });
  }
});

describe("the source of the inspector has no way to the disk, the network or a shell", () => {
  const dir = join(ROOT, "tools", "inspector");
  // The build configuration runs at build time, not in the server, so it is listed apart.
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "vite.config.ts");

  it("lists the files of the plan", () => {
    expect(readdirSync(dir).sort()).toEqual(["cli.ts", "fixtures.ts", "inspect.ts", "server.ts", "vite.config.ts"]);
  });

  it("imports only its own files, the template, the apps, the example, zod and two Node modules", () => {
    const allowedNode = new Set(["node:readline", "node:process"]);
    const bad: string[] = [];
    for (const file of files) {
      const { imports } = scanSource(readFileSync(join(dir, file), "utf8"));
      for (const spec of imports) {
        const local = spec.startsWith("./") || /^\.\.\/\.\.\/(template|apps|examples)\//.test(spec);
        if (!local && spec !== "zod" && !allowedNode.has(spec)) bad.push(`${file}: ${spec}`);
        if (/^\.\.\/\.\.\/(tests|scripts|site)\//.test(spec)) bad.push(`${file}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("holds no file, process, environment, network, evaluation or dynamic import", () => {
    const patterns: [string, RegExp][] = [
      ["fs", /\bfs\b|readFile|writeFile|readdir|createReadStream/],
      ["child process", /child_process|\bspawn\b|\bexec(File|Sync)?\s*\(/],
      ["environment", /process\s*\.\s*env\b/],
      ["network", /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(net|http|https|dns|tls|dgram)/],
      ["evaluation", /\beval\s*\(|new\s+Function\s*\(/],
      ["dynamic import", /\bimport\s*\(|\brequire\s*\(/],
      ["clock or random", /Math\s*\.\s*random|Date\s*\.\s*now|new\s+Date\s*\(\s*\)|randomUUID/],
    ];
    const found: string[] = [];
    for (const file of files) {
      const { code } = scanSource(readFileSync(join(dir, file), "utf8"));
      for (const [name, pattern] of patterns) if (pattern.test(code)) found.push(`${file}: ${name}`);
    }
    expect(found).toEqual([]);
  });
});

// ---- the server -------------------------------------------------------------------------------------------

describe("the server speaks the Model Context Protocol, one JSON line at a time", () => {
  const send = (message: unknown) => {
    const answer = handleLine(JSON.stringify(message));
    return answer === undefined ? undefined : (JSON.parse(answer) as Obj);
  };

  it("answers initialize with its name, the tools capability and the client's own protocol version", () => {
    const out = send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    expect(out).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "plot-inspector" } } });
  });

  it("answers an unknown protocol version with the newest it knows", () => {
    const out = send({ jsonrpc: "2.0", id: "a", method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect((out?.["result"] as Obj)["protocolVersion"]).toBe("2025-06-18");
    expect(out?.["id"]).toBe("a");
  });

  it("says nothing to a notification", () => {
    expect(send({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();
    expect(send({ jsonrpc: "2.0", method: "notifications/cancelled", params: {} })).toBeUndefined();
  });

  it("answers ping with an empty result", () => {
    expect(send({ jsonrpc: "2.0", id: 2, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
  });

  it("lists exactly the three tools, each with a closed input schema", () => {
    const out = send({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const tools = (out?.["result"] as { tools: { name: string; description: string; inputSchema: Obj }[] }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["audit_projection", "check_adapter", "explain_plot"]);
    expect([...TOOL_NAMES].sort()).toEqual(["audit_projection", "check_adapter", "explain_plot"]);
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema["type"]).toBe("object");
      expect(tool.inputSchema["additionalProperties"]).toBe(false);
      expect((tool.inputSchema["required"] as string[]).sort()).toEqual(Object.keys(tool.inputSchema["properties"] as Obj).sort());
    }
    const explainTool = tools.find((t) => t.name === "explain_plot");
    expect(Object.keys((explainTool?.inputSchema["properties"] as Obj) ?? {}).sort()).toEqual(["asOf", "fixtureId", "plotCode"]);
    // A fixture, an adapter and a case are chosen from a list, never typed as a path.
    const fixtureEnum = ((explainTool?.inputSchema["properties"] as Obj)["fixtureId"] as { enum?: string[] }).enum;
    expect([...(fixtureEnum ?? [])].sort()).toEqual(["lantern-fold", "market-stalls", "thimble-beds"]);
  });

  it("calls a tool and returns its answer as one text block, with no error flag", () => {
    const out = send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "explain_plot", arguments: { fixtureId: "lantern-fold", plotCode: "Y07", asOf: ON } } });
    const result = out?.["result"] as { content: { type: string; text: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(value("explain_plot", { fixtureId: "lantern-fold", plotCode: "Y07", asOf: ON }));
  });

  it("returns a typed tool error as a result with the error flag, not as a protocol fault", () => {
    const out = send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "explain_plot", arguments: { fixtureId: "../../x", plotCode: "Y07", asOf: ON } } });
    const result = out?.["result"] as { content: { text: string }[]; isError: boolean };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({ error: { code: "bad_argument", argument: "fixtureId" } });
    expect(out).not.toHaveProperty("error");
  });

  it("returns a protocol fault for an unknown tool, a missing name, an unknown method, a bad line and a batch", () => {
    expect(send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "read_file", arguments: {} } })).toMatchObject({ id: 6, error: { code: -32602 } });
    expect(send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: {} })).toMatchObject({ id: 7, error: { code: -32602 } });
    expect(send({ jsonrpc: "2.0", id: 8, method: "resources/read", params: { uri: "file:///x" } })).toMatchObject({ id: 8, error: { code: -32601 } });
    expect(JSON.parse(handleLine("{not json") as string)).toMatchObject({ id: null, error: { code: -32700 } });
    expect(JSON.parse(handleLine("[]") as string)).toMatchObject({ id: null, error: { code: -32600 } });
    expect(JSON.parse(handleLine('{"jsonrpc":"2.0","id":9}') as string)).toMatchObject({ id: 9, error: { code: -32600 } });
    expect(handleLine("")).toBeUndefined();
  });

  it("keeps the id it was given, a number or a text", () => {
    expect(send({ jsonrpc: "2.0", id: 0, method: "ping" })?.["id"]).toBe(0);
    expect(send({ jsonrpc: "2.0", id: "x-1", method: "ping" })?.["id"]).toBe("x-1");
  });
});

describe("the command line gives the same answers, and never a shell", () => {
  it("runs a tool from a name and one JSON text", () => {
    const out = runCli(["explain_plot", JSON.stringify({ fixtureId: "thimble-beds", plotCode: "B03", asOf: ON })]);
    expect(out.code).toBe(0);
    expect(JSON.parse(out.out)).toEqual(value("explain_plot", { fixtureId: "thimble-beds", plotCode: "B03", asOf: ON }));
    expect(out.err).toBe("");
  });

  it("exits 1 with the typed error for a refused call, 2 for a bad command line", () => {
    const refusedCall = runCli(["explain_plot", JSON.stringify({ fixtureId: "x", plotCode: "Y07", asOf: ON })]);
    expect(refusedCall.code).toBe(1);
    expect(JSON.parse(refusedCall.out)).toEqual({ error: { code: "unknown_fixture", argument: "fixtureId" } });
    for (const argv of [[], ["explain_plot"], ["explain_plot", "{not json"], ["explain_plot", "{}", "extra"], ["nope", "{}"]]) {
      const out = runCli(argv);
      expect(out.code, JSON.stringify(argv)).toBe(2);
      expect(out.err.length).toBeGreaterThan(10);
    }
  });

  it("lists the tools", () => {
    const out = runCli(["--list"]);
    expect(out.code).toBe(0);
    expect(out.out.split("\n").filter(Boolean).sort()).toEqual(["audit_projection", "check_adapter", "explain_plot"]);
  });
});

// ---- the build, and the server as a process ------------------------------------------------------------------------

describe("the built server", () => {
  const dist = join(ROOT, "dist", "inspector");
  beforeAll(() => {
    const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
    const config = join(ROOT, "tools", "inspector", "vite.config.ts");
    // The same two builds as `npm run build:inspector`: the server, then the command line.
    execFileSync(process.execPath, [vite, "build", "--config", config], { cwd: ROOT, stdio: "pipe" });
    execFileSync(process.execPath, [vite, "build", "--config", config, "--mode", "cli"], { cwd: ROOT, stdio: "pipe" });
  }, 180_000);

  it("writes server.mjs and cli.mjs, each a single file", () => {
    expect(existsSync(join(dist, "server.mjs"))).toBe(true);
    expect(existsSync(join(dist, "cli.mjs"))).toBe(true);
    expect(readdirSync(dist).filter((f) => f.endsWith(".mjs") || f.endsWith(".js")).sort()).toEqual(["cli.mjs", "server.mjs"]);
  });

  it("imports only Node built in modules, and only the two it needs", () => {
    const specs = (file: string) => {
      const text = readFileSync(join(dist, file), "utf8");
      // Imports sit at the start of a line. A line that starts with import or export and names a module.
      const found = new Set<string>();
      for (const m of text.matchAll(/^(?:import|export)\b[^\n]*?\bfrom\s*["']([^"']+)["']\s*;?\s*$/gm)) found.add(m[1] as string);
      for (const m of text.matchAll(/^import\s*["']([^"']+)["']\s*;?\s*$/gm)) found.add(m[1] as string);
      return [...found].sort();
    };
    expect(specs("server.mjs")).toEqual(["node:process", "node:readline"]);
    expect(specs("cli.mjs")).toEqual(["node:process"]);
    for (const file of ["server.mjs", "cli.mjs"]) {
      const text = readFileSync(join(dist, file), "utf8");
      expect(/\bimport\s*\(|\brequire\s*\(/.test(text), `${file} has a dynamic import`).toBe(false);
      expect(/process\s*\.\s*env\b/.test(text), `${file} reads the environment`).toBe(false);
    }
  });

  it("answers over standard streams, line by line, and exits when its input closes", async () => {
    const child = spawn(process.execPath, [join(dist, "server.mjs")], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], env: {} });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
    const closed = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
    for (const message of [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "check_adapter", arguments: { adapterId: "market", caseId: "width_rule" } } },
    ]) child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.end();
    const code = await closed;
    expect(code).toBe(0);
    expect(err).toBe("");
    const lines = out.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Obj);
    expect(lines.map((l) => l["id"])).toEqual([1, 2, 3]);
    const call = (lines[2]?.["result"] as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(JSON.parse(call)).toEqual({ adapterId: "market", caseId: "width_rule", pass: true, mismatches: [] });
  }, 60_000);
});

// ---- the power and the settings ---------------------------------------------------------------------------------

describe("the power plot-checks", () => {
  const folder = join(ROOT, "powers", "plot-checks");
  const read = (p: string) => readFileSync(join(folder, p), "utf8");

  it("is plugin.json in the Agent Plugins format, with the name, version, author, description and keywords of the plan", () => {
    const plugin = JSON.parse(read("plugin.json")) as Obj;
    expect(plugin).toEqual({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "plot-checks",
      version: "1.0.0",
      description: "Check plot rules and visitor fields.",
      author: { name: "Adrian Ferguson" },
      keywords: ["plot register", "visitor fields", "market stall"],
      license: "MIT",
    });
  });

  it("holds the plugin file and one skill, and no second registration of the inspector", () => {
    const names = (dir: string): string[] =>
      readdirSync(join(folder, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? names(join(dir, e.name)).map((n) => `${e.name}/${n}`) : [e.name]));
    expect(names("").sort()).toEqual(["plugin.json", "skills/review-adapter/SKILL.md"]);
    expect(existsSync(join(folder, "mcp.json"))).toBe(false);
    expect(read("plugin.json")).not.toMatch(/mcpServers|inspector\/server/);
  });

  it("has a skill with a name and a description, that calls each tool, names the market fixture and the width rule, and says the keeper's records are never an input", () => {
    const skill = read("skills/review-adapter/SKILL.md");
    expect(skill.startsWith("---\n")).toBe(true);
    const header = skill.slice(4, skill.indexOf("\n---", 4));
    expect(header).toMatch(/^name: review-adapter$/m);
    expect(header).toMatch(/^description: .{40,}$/m);
    for (const tool of TOOL_NAMES) expect(skill).toContain(tool);
    expect(skill).toContain("market-stalls");
    expect(skill).toContain("width_rule");
    expect(skill).toMatch(/never an input/i);
    expect(skill).not.toMatch(/\r/);
  });

  it("uses no dash between words in the skill's own sentences", () => {
    const body = read("skills/review-adapter/SKILL.md").split("\n---\n").slice(1).join("\n").replace(/```[\s\S]*?```/g, "");
    expect(/[\u2013\u2014]/.test(body)).toBe(false);
    expect(/\w\s-\s\w/.test(body)).toBe(false);
  });
});

describe("the Kiro settings", () => {
  it("name one inspector server that runs the built file on standard streams", () => {
    const mcp = JSON.parse(readFileSync(join(ROOT, ".kiro", "settings", "mcp.json"), "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    expect(Object.keys(mcp.mcpServers)).toEqual(["plot-inspector"]);
    expect(mcp.mcpServers["plot-inspector"]).toMatchObject({ command: "node", args: ["dist/inspector/server.mjs"] });
  });

  it("let the reviewer profile call exactly the three tools", () => {
    const profile = JSON.parse(readFileSync(join(ROOT, ".kiro", "agents", "register-reviewer.json"), "utf8")) as { tools: string[] };
    expect(profile.tools.filter((t) => t.startsWith("@plot-inspector/")).sort()).toEqual(TOOL_NAMES.map((n) => `@plot-inspector/${n}`).sort());
  });
});

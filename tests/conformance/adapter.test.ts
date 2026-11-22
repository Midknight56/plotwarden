// T01 and T34 (the unchanged template part): the same conformance suite runs
// against a tiny market adapter. Import and restore checks are added to the
// suite by spec 02. The generator and the 240 cm rule are spec 06.
import { describe, expect, it } from "vitest";
import type { RegisterAdapter } from "../../template/src/adapter";
import type { CoreEvent } from "../../template/src/events";
import { parseAvailability, type AvailabilityFile } from "../../template/src/output/privacy";
import type { CoreState } from "../../template/src/types";
import { marketAdapter, type MarketCommand } from "../helpers/marketAdapter";
import { conformanceChecks, runConformance, type ConformanceCase } from "./suite";

const ON = "2026-04-20";
const space = (code: string) => `space-${code}`;
const plot = (code: string): MarketCommand => ({
  type: "add_plot",
  plotId: `plot-${code}`,
  code,
  spaces: [{ spaceId: space(code) }],
});

type Market = ConformanceCase<CoreState, MarketCommand, CoreEvent>;

const HOLDER = "Rosa Pennywhistle";

/** Three stalls: S1 reserved, S2 free and checked, S3 not checked yet. */
function marketCase(adapter: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = marketAdapter): Market {
  return {
    name: "market stalls",
    adapter,
    script: [
      { command: plot("S1"), on: ON },
      { command: plot("S2"), on: ON },
      { command: plot("S3"), on: ON },
      { command: { type: "confirm_empty", spaceIds: [space("S1"), space("S2")] }, on: ON },
      { command: { type: "reserve_stall", claimId: "claim-1", spaceId: space("S1"), trader: HOLDER, start: "2026-04-01" }, on: ON },
    ],
    refusals: [
      { command: { type: "reserve_stall", claimId: "claim-2", spaceId: space("S3"), trader: "Pim Cartwhistle", start: ON }, code: "space_unchecked" },
      { command: plot("s1"), code: "code_taken" },
      { command: { type: "reserve_stall", claimId: "claim-3", spaceId: space("S2"), trader: " ", start: ON }, code: "invalid_input" },
      { command: { type: "make_tea" } as unknown as MarketCommand, code: "unknown_command" },
    ],
    canaries: [HOLDER, "Pim Cartwhistle"],
    asOf: ON,
    parseVisitor: parseAvailability,
    otherKind: "allotment",
  };
}

const EXPECTED_CHECKS = [
  "replays from the database to the state in memory",
  "refuses a command it does not list, or an invalid one, and changes nothing",
  "decide does not change the state it is given",
  "gives the same answer to the same command",
  "keeps sites of another kind out of its library and refuses to open them",
  "a commit to one site never changes another site",
  "builds a visitor file with a closed schema and no private string",
  "writes a repeated operation once",
  "refuses a stale commit and writes nothing",
  "backs up and restores as a new register that replays to the same state",
  "refuses a backup of another kind or a broken file, and writes nothing",
];

describe("the suite has every check it promises", () => {
  it("lists the checks by name", () => {
    expect(conformanceChecks(marketCase()).map((c) => c.name)).toEqual(EXPECTED_CHECKS);
  });
});

// The same call that spec 03 and 04 make for the two apps.
runConformance(marketCase());

describe("the suite fails an adapter that breaks a rule", () => {
  async function failures(c: Market): Promise<string[]> {
    const failed: string[] = [];
    for (const check of conformanceChecks(c)) {
      try {
        await check.run();
      } catch {
        failed.push(check.name);
      }
    }
    return failed;
  }

  it("passes the market adapter on every check", async () => {
    expect(await failures(marketCase())).toEqual([]);
  });

  it("fails an apply that depends on hidden state, on replay", async () => {
    let calls = 0;
    const hidden: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
      ...marketAdapter,
      apply(state, event) {
        const next = marketAdapter.apply(state, event);
        calls += 1;
        return event.type === "plot_added" ? { ...next, siteId: `${next.siteId}-${calls}` } : next;
      },
    };
    expect(await failures(marketCase(hidden))).toContain("replays from the database to the state in memory");
  });

  it("fails a projection that leaks a holder or adds a key", async () => {
    const leaky: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
      ...marketAdapter,
      project(snapshot, audience, asOf) {
        const file = marketAdapter.project(snapshot, audience, asOf) as AvailabilityFile;
        return audience === "visitor" ? { ...file, heldBy: HOLDER } : file;
      },
    };
    expect(await failures(marketCase(leaky))).toContain("builds a visitor file with a closed schema and no private string");

    const quiet: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
      ...marketAdapter,
      project(snapshot, audience, asOf) {
        const file = marketAdapter.project(snapshot, audience, asOf) as AvailabilityFile;
        return audience === "visitor" ? { ...file, instructions: `Ask ${HOLDER}` } : file;
      },
    };
    expect(await failures(marketCase(quiet))).toContain("builds a visitor file with a closed schema and no private string");
  });

  it("fails a decide that changes the state it is given", async () => {
    const impure: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
      ...marketAdapter,
      decide(state, command, on) {
        (state as { siteId: string }).siteId = "changed";
        return marketAdapter.decide(state, command, on);
      },
    };
    expect(await failures(marketCase(impure))).toContain("decide does not change the state it is given");
  });

  it("fails a decide that gives a different answer each time", async () => {
    let n = 0;
    const random: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
      ...marketAdapter,
      decide(state, command, on) {
        const result = marketAdapter.decide(state, command, on);
        if (!result.ok) return result;
        n += 1;
        return { ok: true, value: result.value.map((d) => ({ ...d, entityIds: [...d.entityIds, `n${n}`] })) };
      },
    };
    expect(await failures(marketCase(random))).toContain("gives the same answer to the same command");
  });

  it("fails an adapter that accepts a command it should refuse", async () => {
    const lax: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
      ...marketAdapter,
      validate: () => [],
      decide(state, command, on) {
        return command.type === "reserve_stall" && command.trader.trim() === ""
          ? { ok: true, value: [] }
          : marketAdapter.decide(state, command, on);
      },
    };
    expect(await failures(marketCase(lax))).toContain("refuses a command it does not list, or an invalid one, and changes nothing");
  });
});

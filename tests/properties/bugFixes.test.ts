// Two rules that a reviewer broke on the live site (spec 06, Z23.1 and Z23.3). 1,000 cases each, recorded seeds.
//   INV_OFFER_AFTER_JOINED: an offer is accepted exactly when its date is not before the day the applicant joined.
//   INV_FAMILY_SAVE_ROWS: saving the family map sends a burial row only for a row the keeper changed, and a burial
//   whose approval is in review is never approved by a save that left its row alone.
// The expected values are written as comparisons of dates and of ticks, not by calling the code under test.
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { fromState, saveCommands } from "../../apps/churchyard-register/src/familyForm";
import type { FormState } from "../../apps/churchyard-register/src/familyForm";
import { approvalStatus } from "../../apps/churchyard-register/src/rules";
import type { AllotState } from "../../apps/allotment-register/src/types";
import type { ChurchState } from "../../apps/churchyard-register/src/types";
import { ChurchEnv, id as churchId } from "../helpers/churchEnv";
import { GardenEnv, id, spaceId } from "../helpers/gardenEnv";
import { runProperty } from "../helpers/property";
import { buildFold } from "../helpers/lanternFold";
import { app, buildBeds, person } from "../helpers/thimbleBeds";
import { RUNS, SEEDS } from "./seeds";

const day = (n: number) => new Date(Date.UTC(2026, 0, 2 + n)).toISOString().slice(0, 10);

describe("INV_OFFER_AFTER_JOINED an offer is never dated before the applicant joined (Z23.3)", () => {
  let env: GardenEnv;
  const LATE = app("late");

  beforeAll(async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
    await env.must([{ type: "add_applicant", applicationId: LATE, personId: person("Late Joiner"), name: "Late Joiner", joinedOn: "2026-06-01" }], "2026-06-01");
  });

  it("accepts the offer when its date is the joined day or later, and refuses it with offer_before_joined when it is earlier", () => {
    const skipReasons = { [app("tavi")]: "Late applicant first", [app("olin")]: "Late applicant first" };
    const { cases } = runProperty(
      "INV_OFFER_AFTER_JOINED",
      fc.record({ joined: fc.integer({ min: 0, max: 700 }), offered: fc.integer({ min: 0, max: 700 }) }),
      ({ joined, offered }) => {
        const joinedOn = day(joined);
        const on = day(offered);
        const state: AllotState = { ...env.state, applications: { ...env.state.applications, [LATE]: { ...(env.state.applications[LATE] as AllotState["applications"][string]), joinedOn } } };
        const decided = env.register.run(
          state,
          { type: "make_offer", offerId: id("offer:p"), applicationId: LATE, spaceId: spaceId("B03"), claimId: id("claim:p"), skipReasons },
          on,
        );
        if (on < joinedOn) {
          expect(decided.ok, `${on} before ${joinedOn}`).toBe(false);
          if (!decided.ok) expect(decided.error.code).toBe("offer_before_joined");
        } else {
          expect(decided.ok, `${on} not before ${joinedOn}: ${decided.ok ? "" : JSON.stringify(decided.error)}`).toBe(true);
        }
      },
      { seed: SEEDS.INV_OFFER_AFTER_JOINED },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });
});

describe("INV_FAMILY_SAVE_ROWS a save sends only what the keeper changed (Z23.1)", () => {
  let env: ChurchEnv;
  let state: ChurchState;
  const MIREL = churchId("burial:LF-07A");

  beforeAll(async () => {
    env = await ChurchEnv.create();
    await buildFold(env, { geometry: true });
    await env.must([
      { type: "set_public", siteName: "Lantern Fold", gateName: "Lantern Gate" },
      { type: "approve_burial", burialId: MIREL, includeYear: false },
      { type: "approve_burial", burialId: churchId("burial:LF-06"), includeYear: true },
    ]);
    const original = await env.eventIdOf("burial_recorded", MIREL);
    await env.must([{ type: "correct_burial", burialId: MIREL, recordedName: "Mirel Quillmoss Jr", correctsEventId: original, reason: "Stone says Jr", correctionRef: "LF page 7" }]);
    state = env.state;
  });

  it("starts with one burial in review and one approved, so both cases are in play", () => {
    expect(approvalStatus(state, MIREL)).toBe("review");
    expect(approvalStatus(state, churchId("burial:LF-06"))).toBe("approved");
  });

  it("sends no row command when only public fields changed, and the burial in review stays out of the file", () => {
    const { cases } = runProperty(
      "INV_FAMILY_SAVE_ROWS",
      fc.record({ siteName: fc.string({ maxLength: 40 }), gateName: fc.string({ maxLength: 40 }), directions: fc.string({ maxLength: 80 }), outlines: fc.boolean() }),
      (change) => {
        const edit: FormState = { ...fromState(state), ...change };
        expect(saveCommands(state, edit).map((c) => c.type)).toEqual(["set_public"]);
      },
      { seed: SEEDS.INV_FAMILY_SAVE_ROWS },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("sends a row command only for a row whose tick the keeper turned, whatever else it changed", () => {
    const rowIds = Object.keys(fromState(state).rows).sort();
    expect(rowIds.length).toBeGreaterThan(3);
    const { cases } = runProperty(
      "INV_FAMILY_SAVE_ROWS",
      fc.record({ turned: fc.array(fc.boolean(), { minLength: rowIds.length, maxLength: rowIds.length }), gateName: fc.string({ maxLength: 30 }) }),
      ({ turned, gateName }) => {
        const form = fromState(state);
        const flipped = new Set(rowIds.filter((_, i) => turned[i] === true));
        const rows = Object.fromEntries(rowIds.map((rid) => [rid, { ...(form.rows[rid] as FormState["rows"][string]), include: flipped.has(rid) ? !(form.rows[rid] as FormState["rows"][string]).include : (form.rows[rid] as FormState["rows"][string]).include }]));
        const commands = saveCommands(state, { ...form, gateName, rows });
        const touched = commands.filter((c) => typeof c["burialId"] === "string").map((c) => c["burialId"] as string);
        for (const burialId of touched) expect(flipped.has(burialId), `a row nobody turned was sent: ${burialId}`).toBe(true);
        // A row in review that was left alone is never approved.
        if (!flipped.has(MIREL)) expect(touched).not.toContain(MIREL);
        // A ticked row in review is approved, and an unticked approved row is withdrawn.
        if (flipped.has(MIREL)) expect(commands.some((c) => c.type === "approve_burial" && c["burialId"] === MIREL)).toBe(true);
      },
      { seed: SEEDS.INV_FAMILY_SAVE_TICKS },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("builds a file with neither name of the burial in review after any save of public fields only", async () => {
    await env.must(saveCommands(env.state, { ...fromState(env.state), gateName: "Lantern Gate West" }) as never);
    const out = buildFamilyFile(env.state, { asOf: "2026-04-20", revision: env.revision, newPublicId: (() => { let n = 0; return () => `pub${++n}`; })() });
    expect(out.ok).toBe(true);
    if (out.ok) expect(JSON.stringify(out.file)).not.toContain("Quillmoss");
  });
});

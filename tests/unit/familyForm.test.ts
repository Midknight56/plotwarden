// The family map form (spec 06, task 6.34, Z23.1 and Z23.7). A reviewer proved two faults on the live site.
// B1: after a name was corrected, saving the gate name approved the burial that was hidden by the filter, and the
// file held the old name. B7: after "Clear public details" the form still showed the old values.
// The form is pure, so these run on a register in a fake database. Expected values are the rules of C4.2 and C4.3:
// a material change returns an approval to review, and a name reaches a file only after the keeper approves it again.
import { beforeEach, describe, expect, it } from "vitest";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { clearedForm, fromState, saveCommands } from "../../apps/churchyard-register/src/familyForm";
import type { FormState } from "../../apps/churchyard-register/src/familyForm";
import { approvalStatus } from "../../apps/churchyard-register/src/rules";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { ChurchEnv, WALK_PATH_ID, id } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";
import { APPROVED_NAME } from "../helpers/privacyCanaries";

const SECTION = id("section:Yew Walk");
const MIREL = id("burial:LF-07A");
const NEW_NAME = "Mirel Quillmoss Jr";
const DIRECTIONS = "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.";

let env: ChurchEnv;
let n = 0;

const settings = (): ChurchCommand => ({
  type: "set_public",
  siteName: "Lantern Fold",
  gateName: "Lantern Gate",
  directions: DIRECTIONS,
  sectionNames: { [SECTION]: "Yew Walk" },
  pathNames: { [WALK_PATH_ID]: "Yew Walk" },
});

const file = () => {
  const out = buildFamilyFile(env.state, { asOf: "2026-04-20", revision: env.revision, newPublicId: () => `pub${++n}` });
  if (!out.ok) throw new Error(`not built: ${JSON.stringify(out)}`);
  return out;
};

/** What the keeper does in the screen: send the commands that a save sends. */
const save = (edit: FormState) => env.must(saveCommands(env.state, edit) as ChurchCommand[]);

async function correctName(): Promise<void> {
  const original = await env.eventIdOf("burial_recorded", MIREL);
  await env.must([{ type: "correct_burial", burialId: MIREL, recordedName: NEW_NAME, correctsEventId: original, reason: "Stone says Jr", correctionRef: "LF page 7" }]);
}

beforeEach(async () => {
  n = 0;
  env = await ChurchEnv.create();
  await buildFold(env, { geometry: true });
  await env.must([settings(), { type: "approve_burial", burialId: MIREL, includeYear: false }]);
});

describe("B1 a corrected burial stays withheld until the keeper reviews it (Z23.1)", () => {
  it("starts with the burial approved, so the correction is what puts it in review", async () => {
    expect(approvalStatus(env.state, MIREL)).toBe("approved");
    await correctName();
    expect(approvalStatus(env.state, MIREL)).toBe("review");
  });

  it("shows a row in review unticked, with the current recorded name as the name shown", async () => {
    await correctName();
    const row = fromState(env.state).rows[MIREL];
    expect(row).toEqual({ include: false, shown: NEW_NAME, year: false, line: "" });
  });

  it("sends only set_public when the keeper changes the gate name and nothing else, and the burial stays in review", async () => {
    await correctName();
    const edit = { ...fromState(env.state), gateName: "Lantern Gate North" };
    expect(saveCommands(env.state, edit).map((c) => c.type)).toEqual(["set_public"]);
    await save(edit);
    expect(env.state.pub.gateName).toBe("Lantern Gate North");
    expect(approvalStatus(env.state, MIREL)).toBe("review");
    const out = file();
    expect(out.file.burials).toHaveLength(0);
    expect(JSON.stringify(out.file)).not.toContain("Quillmoss");
    expect(out.preview.needsReview.map((r) => r.plotCode)).toEqual(["Y07"]);
  });

  it("sends no approval and no withdrawal for any row when nothing but a public field changed", async () => {
    await correctName();
    for (const change of [{ siteName: "Lantern Fold Church" }, { directions: "Use the north gate." }, { outlines: true }]) {
      const commands = saveCommands(env.state, { ...fromState(env.state), ...change });
      expect(commands.map((c) => c.type), JSON.stringify(change)).toEqual(["set_public"]);
    }
  });

  it("approves the burial again, with the new name, only when the keeper ticks it", async () => {
    await correctName();
    const edit = fromState(env.state);
    const ticked: FormState = { ...edit, rows: { ...edit.rows, [MIREL]: { ...(edit.rows[MIREL] as FormState["rows"][string]), include: true } } };
    const commands = saveCommands(env.state, ticked);
    expect(commands.map((c) => c.type)).toEqual(["set_public", "approve_burial"]);
    expect(commands[1]).toMatchObject({ burialId: MIREL, name: NEW_NAME, includeYear: false });
    await save(ticked);
    expect(approvalStatus(env.state, MIREL)).toBe("approved");
    expect(file().file.burials.map((b) => b.name)).toEqual([NEW_NAME]);
  });

  it("does not write the old approved name back when a row in review is ticked", async () => {
    await correctName();
    const edit = fromState(env.state);
    expect(edit.rows[MIREL]?.shown).not.toBe(APPROVED_NAME);
  });

  it("leaves an approved row that nobody changed alone, so a save never rewrites it", () => {
    const commands = saveCommands(env.state, fromState(env.state));
    expect(commands.map((c) => c.type)).toEqual(["set_public"]);
  });

  it("still withdraws an approved burial that the keeper unticks", async () => {
    const edit = fromState(env.state);
    const unticked: FormState = { ...edit, rows: { ...edit.rows, [MIREL]: { ...(edit.rows[MIREL] as FormState["rows"][string]), include: false } } };
    expect(saveCommands(env.state, unticked).map((c) => c.type)).toEqual(["set_public", "withdraw_approval"]);
    await save(unticked);
    expect(approvalStatus(env.state, MIREL)).toBe("none");
  });

  it("changes nothing about a burial in review by a save that leaves its row unticked, whatever else is saved", async () => {
    await correctName();
    const before = JSON.stringify(env.state.approvals);
    await save({ ...fromState(env.state), gateName: "Lantern Gate West", siteName: "Lantern Fold West" });
    expect(JSON.stringify(env.state.approvals)).toBe(before);
  });
});

describe("B7 the form after Clear public details (Z23.7)", () => {
  it("says what the saved register says once the clear has saved", async () => {
    const expected = clearedForm(env.state);
    await env.must([{ type: "set_public", siteName: "", gateName: "", directions: "", outlines: false, sectionNames: {}, pathNames: {}, plotCodes: {} }]);
    expect(expected).toEqual(fromState(env.state));
  });

  it("has empty public fields, no included path, and the approved rows as they were", async () => {
    const form = clearedForm(env.state);
    expect([form.siteName, form.gateName, form.directions, form.outlines]).toEqual(["", "", "", false]);
    expect(Object.values(form.sectionNames).every((v) => v === "")).toBe(true);
    expect(Object.values(form.includePath).every((v) => v === false)).toBe(true);
    expect(form.rows[MIREL]).toEqual({ include: true, shown: APPROVED_NAME, year: false, line: "" });
  });

  it("is not the form as it was before the clear", () => {
    expect(clearedForm(env.state)).not.toEqual(fromState(env.state));
  });
});

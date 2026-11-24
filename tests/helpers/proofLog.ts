// A check on a saved Kiro session record for the review-desk-drift power. It accepts a run only when the record
// holds, in this order: a skill read of compare-desk-copy from review-desk-drift, a command that runs the installed
// compare.mjs with --register and --desk, and the output of that command with both match lines. A chat reply that
// says the check passed holds none of these and is refused.
//
// The record is read as JSON of any shape. Every object in it is visited in document order, parents before
// children. A skill read is an object with `action` "readSkill", `powerName` and `skillName`. A command is an
// object with a text field that names the installed script path. Output is a text field named output, stdout or
// result, on the command object or on a later one.

export interface ProofVerdict {
  ok: boolean;
  reasons: string[];
}

const POWER = "review-desk-drift";
const SKILL = "compare-desk-copy";
const SCRIPT_PATH = `${POWER}/skills/${SKILL}/scripts/compare.mjs`;
const OUTPUT_KEYS = new Set(["output", "stdout", "result"]);

type Rec = Record<string, unknown>;

function flatten(node: unknown, into: Rec[]): Rec[] {
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, into);
  } else if (typeof node === "object" && node !== null) {
    into.push(node as Rec);
    for (const value of Object.values(node as Rec)) flatten(value, into);
  }
  return into;
}

const texts = (rec: Rec, only?: Set<string>): string[] =>
  Object.entries(rec)
    .filter(([key, value]) => typeof value === "string" && (only === undefined || only.has(key)))
    .map(([, value]) => String(value).replace(/\\/g, "/"));

export function checkProof(record: unknown): ProofVerdict {
  const recs = flatten(record, []);
  const reasons: string[] = [];

  const skillAt = recs.findIndex((r) => r.action === "readSkill" && r.powerName === POWER && r.skillName === SKILL);
  if (skillAt < 0) reasons.push(`no skill read of ${SKILL} from ${POWER}`);

  const callAt = recs.findIndex(
    (r, i) => i > skillAt && texts(r).some((t) => t.includes(SCRIPT_PATH) && t.includes("--register") && t.includes("--desk")),
  );
  if (callAt < 0) reasons.push(`no command that runs ${SCRIPT_PATH} with --register and --desk after the skill read`);

  const outputAt =
    callAt < 0
      ? -1
      : recs.findIndex(
          (r, i) => i >= callAt && texts(r, OUTPUT_KEYS).some((t) => /^Desk matches \d+\/8$/m.test(t) && /^Register matches \d+\/8$/m.test(t)),
        );
  if (callAt >= 0 && outputAt < 0) reasons.push("no output of the script with both match lines");

  return { ok: reasons.length === 0, reasons };
}

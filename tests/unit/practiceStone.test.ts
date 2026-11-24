// The worn stone beside the inscription in the practice churchyard. The picture is a file of the app's artwork,
// shown only on the keeper's burial screen of the practice register. It is never a record, so no family file,
// committee file or backup can hold it.
import { IDBFactory } from "fake-indexeddb";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openRegisterDb } from "../../template/src/data/db";
import { findMetadata, inspectImage } from "../../template/src/data/images";
import { seedWalkthrough } from "../../template/src/data/seed";
import { readEvents } from "../../template/src/data/transaction";
import { buildFamilyHtml } from "../../template/src/output/visitorHtml";
import { churchRegister } from "../../apps/churchyard-register/src/adapter";
import { CHURCH_COPY, familyWords } from "../../apps/churchyard-register/src/copy";
import { PRACTICE_STONE_URL, practiceStoneFor } from "../../apps/churchyard-register/src/practiceStone";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { churchReviewFacts } from "../../apps/churchyard-register/src/review";
import { lanternFold } from "../../apps/churchyard-register/src/walkthrough";

const ROOT = join(import.meta.dirname, "..", "..");
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("the picture file", () => {
  const asset = join(ROOT, "assets", "stone-face.webp");

  it("is kept in the app's artwork folder, byte for byte the picture made for the film", () => {
    expect(existsSync(asset)).toBe(true);
    expect(sha(readFileSync(asset))).toBe(sha(readFileSync(join(ROOT, "docs", "film", "stone-face.webp"))));
  });

  it("is a WebP picture that the register's own reader accepts, with no camera data in it", () => {
    const bytes = new Uint8Array(readFileSync(asset));
    const info = inspectImage(bytes);
    expect(info.ok).toBe(true);
    if (info.ok) {
      expect(info.value.imageType).toBe("webp");
      expect(info.value.width).toBeGreaterThan(0);
    }
    expect(findMetadata(bytes)).toEqual([]);
  });

  it("is listed in the artwork ledger with where it comes from and where it is used", () => {
    const ledger = readFileSync(join(ROOT, "assets", "origins.md"), "utf8");
    const row = ledger.split("\n").find((line) => line.startsWith("| `stone-face.webp` |"));
    expect(row).toBeDefined();
    expect(row).toMatch(/Blender/);
    expect(row).toMatch(/burial screen|Compare photo/i);
  });

  it("is reached by the app as a file, not as text inside the code", () => {
    expect(PRACTICE_STONE_URL).toMatch(/stone-face.*\.webp$/);
  });
});

describe("who is shown the picture", () => {
  it("is shown for the burial of Mirel Quillmoss in the practice register", () => {
    expect(practiceStoneFor("walkthrough", { sourceRef: "LF-07A" })).toBe(PRACTICE_STONE_URL);
  });

  it("is never shown in a register of the keeper's own, whatever its source refs", () => {
    expect(practiceStoneFor("own", { sourceRef: "LF-07A" })).toBeUndefined();
  });

  it("is not shown for any other burial of the practice register", () => {
    for (const ref of ["LF-01", "LF-07B", "LF-H1", "lf-07a", ""]) expect(practiceStoneFor("walkthrough", { sourceRef: ref }), ref).toBeUndefined();
  });
});

describe("the words that go with the picture", () => {
  it("are in the catalog, in plain words with no dash between words", () => {
    for (const key of ["practiceStonePhoto", "practiceStoneNote"] as const) {
      const text = (CHURCH_COPY as Record<string, string>)[key];
      expect(text, key).toBeTypeOf("string");
      expect(text, key).not.toMatch(/[\u2013\u2014]|\s-\s|\p{L}-\p{L}/u);
    }
    expect((CHURCH_COPY as Record<string, string>)["practiceStonePhoto"]).toMatch(/OF HOLLOWMERE/);
  });
});

describe("what leaves the device", () => {
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${(0x500000 + ++n).toString(16).padStart(12, "0")}`;

  async function fold() {
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("storage");
    const made = await seedWalkthrough(opened.value, churchRegister() as never, lanternFold, { newId });
    if (!made.ok) throw new Error("seed");
    const replayed = churchRegister().replay(made.value, await readEvents(opened.value, made.value.id));
    if (!replayed.ok) throw new Error("replay");
    return replayed.value;
  }

  it("keeps the family file free of the picture, its name and the inscription", async () => {
    const state = await fold();
    const built = buildFamilyFile(state, { asOf: "2026-04-20", revision: 1, newPublicId: (() => { let k = 0; return () => `w${++k}`; })() });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const text = JSON.stringify(built.file) + buildFamilyHtml(built.file, familyWords());
    for (const word of ["stone-face", ".webp", "<img", "HOLLOWMERE", "Hollowmere", "REST IN PEACE", "IN LOVING MEMORY"]) expect(text, word).not.toContain(word);
  });

  it("keeps the picture out of the stored records of the practice register", async () => {
    const state = await fold();
    expect(JSON.stringify(state)).not.toContain("stone-face");
  });

  it("raises two checks for the practice register, and one once the reading is reviewed", async () => {
    const state = await fold();
    expect(churchReviewFacts(state, "2026-04-20").map((f) => f.rule).sort()).toEqual(["placement_missing", "reading_unclear"]);
    const memorial = Object.values(state.memorials)[0];
    expect(memorial?.unclear).toBe(true);
    const settled = { ...state, memorials: Object.fromEntries(Object.entries(state.memorials).map(([id, m]) => [id, { ...m, unclear: false }])) };
    expect(churchReviewFacts(settled, "2026-04-20").map((f) => f.rule)).toEqual(["placement_missing"]);
  });
});

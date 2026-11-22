// T32 (foundation part): the last legal value is accepted and one more is
// refused, for every item in 00-contracts design D12.
// The expected numbers are typed here from the design table. They are not
// read from the production table.
import { describe, expect, it } from "vitest";
import {
  LIMITS,
  checkCoordinate,
  checkGridSize,
  checkLimit,
  checkText,
  type LimitItem,
  type TextItem,
} from "../../template/src/limits";

const MiB = 1024 * 1024;

const D12: Record<LimitItem, number> = {
  plotsPerSite: 2000,
  sectionsPerSite: 100,
  spacesPerChurchyardPlot: 12,
  domainRecordsPerSite: 20000,
  eventsPerSite: 100000,
  gridRows: 100,
  gridColumns: 100,
  polygonVertices: 256,
  csvBytes: 5 * MiB,
  csvDataRows: 5000,
  csvColumns: 40,
  csvCellChars: 4000,
  nameChars: 100,
  plotCodeChars: 24,
  sourceRefChars: 100,
  noteChars: 4000,
  moneyMinorUnits: 99_999_999,
  photoBytes: 12 * MiB,
  photoMegapixels: 24,
  photosPerRecord: 8,
  photoStoredLongEdge: 2400,
  archiveCompressedBytes: 128 * MiB,
  archiveDecodedBytes: 160 * MiB,
  archiveAttachmentEntries: 5000,
  archivePhotoBytesPerSite: 96 * MiB,
  reviewPacketBytes: 2 * MiB,
  reviewIssues: 2000,
  slipDecisions: 2000,
  siteAliasChars: 40,
  reviewLabelChars: 40,
};

const ITEMS = Object.keys(D12) as LimitItem[];

describe("T32 limits table", () => {
  it("holds exactly the D12 values", () => {
    expect({ ...LIMITS }).toEqual(D12);
  });

  it.each(ITEMS)("%s accepts its last legal value", (item) => {
    expect(checkLimit(item, D12[item]).ok).toBe(true);
  });

  it.each(ITEMS)("%s refuses one over, naming the item and the limit", (item) => {
    const result = checkLimit(item, D12[item] + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("over_limit");
      expect(result.error.detail?.item).toBe(item);
      expect(result.error.detail?.limit).toBe(D12[item]);
      expect(result.error.detail?.value).toBe(D12[item] + 1);
    }
  });

  it("names the plot code or the row in the error", () => {
    const byCode = checkLimit("sourceRefChars", 101, { ref: "Y07" });
    const byRow = checkLimit("csvCellChars", 4001, { row: 117 });
    expect(byCode.ok || byCode.error.detail?.ref).toBe("Y07");
    expect(byRow.ok || byRow.error.detail?.row).toBe(117);
  });

  it("refuses a value that is not a whole number or is negative", () => {
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = checkLimit("plotsPerSite", value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("bad_value");
    }
  });
});

describe("T32 text limits count code points", () => {
  const TEXT: [TextItem, number][] = [
    ["nameChars", 100],
    ["plotCodeChars", 24],
    ["sourceRefChars", 100],
    ["noteChars", 4000],
    ["csvCellChars", 4000],
    ["siteAliasChars", 40],
    ["reviewLabelChars", 40],
  ];

  it.each(TEXT)("%s accepts %i characters and refuses one more", (item, max) => {
    expect(checkText(item, "a".repeat(max)).ok).toBe(true);
    const over = checkText(item, "a".repeat(max + 1), { ref: "C007" });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.detail?.item).toBe(item);
      expect(over.error.detail?.ref).toBe("C007");
    }
  });

  it("counts an emoji as one character, not two", () => {
    expect(checkText("nameChars", "😀".repeat(100)).ok).toBe(true);
    expect(checkText("nameChars", "😀".repeat(101)).ok).toBe(false);
  });

  it("counts a combined accent as the characters it is typed with", () => {
    const decomposed = "e\u0301".repeat(50); // 100 code points
    expect(checkText("nameChars", decomposed).ok).toBe(true);
  });
});

describe("T32 coordinates", () => {
  it("accepts 0 and 10000", () => {
    expect(checkCoordinate(0).ok).toBe(true);
    expect(checkCoordinate(10000).ok).toBe(true);
  });

  it("refuses -1, 10001, fractions and nonfinite values", () => {
    for (const value of [-1, 10001, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkCoordinate(value).ok).toBe(false);
    }
  });
});

describe("T32 grid size", () => {
  it("accepts 100 rows by 20 columns on an empty site (2000 plots)", () => {
    expect(checkGridSize(100, 20, 0).ok).toBe(true);
  });

  it("accepts the 10 by 20 paper book grid", () => {
    expect(checkGridSize(10, 20, 0).ok).toBe(true);
  });

  it("refuses 100 by 21 because it passes 2000 plots", () => {
    const result = checkGridSize(100, 21, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail?.item).toBe("plotsPerSite");
  });

  it("counts the plots already in the site", () => {
    expect(checkGridSize(10, 20, 1800).ok).toBe(true);
    const result = checkGridSize(10, 20, 1801);
    expect(result.ok).toBe(false);
  });

  it("refuses 101 rows and 101 columns by name", () => {
    const rows = checkGridSize(101, 1, 0);
    const cols = checkGridSize(1, 101, 0);
    expect(rows.ok || rows.error.detail?.item).toBe("gridRows");
    expect(cols.ok || cols.error.detail?.item).toBe("gridColumns");
  });

  it("refuses zero rows or columns", () => {
    expect(checkGridSize(0, 5, 0).ok).toBe(false);
    expect(checkGridSize(5, 0, 0).ok).toBe(false);
  });
});

// ===================================================================================================
// Spec 06, task 6.6 (Z5): the limits at the level of a command, a file and a store. The last legal value is
// accepted and one over is refused before commit, naming the item, with the saved counts and the revision as
// they were. Values are typed from design D12 above, not read from the production table.
// ===================================================================================================
import { IDBFactory } from "fake-indexeddb";
import { allotRegister } from "../../apps/allotment-register/src/adapter";
import type { AllotCommand, AllotState } from "../../apps/allotment-register/src/types";
import { churchRegister } from "../../apps/churchyard-register/src/adapter";
import type { ChurchCommand, ChurchState } from "../../apps/churchyard-register/src/types";
import { openRegisterDb } from "../../template/src/data/db";
import { commit, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import type { SiteRow } from "../../template/src/data/transaction";
import { buildPacket, encodePacket } from "../../template/src/exchange/packet";
import { buildSlip, encodeSlip } from "../../template/src/exchange/slip";
import { search } from "../../template/src/search";
import type { SearchEntry } from "../../template/src/search";
import { createSite, mintId } from "../../template/src/site";
import type { Result, Site } from "../../template/src/types";
import { PaperEnv, stageCsvText } from "../helpers/paperAdapter";
import { FIXED_NOW, fixedClock } from "../helpers/clock";
import { failingDb, quotaError } from "../helpers/failStorage";

const ON = "2026-04-20";
const at = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) frozen(child);
  }
  return value;
}

function newSite(kind: string): Site {
  const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind, title: "Limit Test", zone: "Europe/London", createdAt: FIXED_NOW, ...(kind === "allotment" ? { currency: "GBP" as const } : {}) });
  if (!made.ok) throw new Error("site");
  return made.value;
}

const church = churchRegister();
const garden = allotRegister();

/** The error of a refused result, or a failure of the test when it was accepted. */
function refusal<T>(result: Result<T>): { code: string; detail: Record<string, unknown> | undefined; fields: { field: string; code: string }[] | undefined } {
  if (result.ok) throw new Error("accepted, but a refusal was expected");
  return { code: result.error.code, detail: result.error.detail as Record<string, unknown> | undefined, fields: result.error.fields };
}

/** A church register with one plot, two checked empty spaces and one section, built through its commands. */
function churchWithPlot(): { state: ChurchState; site: Site } {
  const site = newSite("churchyard");
  let state = church.initialState(site);
  const run = (command: ChurchCommand) => {
    const decided = church.run(state, command, ON);
    if (!decided.ok) throw new Error(`setup refused ${command.type}: ${JSON.stringify(decided.error)}`);
    for (const draft of decided.value) state = churchRegisterApply(state, draft.event as never);
  };
  run({ type: "layout_apply", sections: [{ sectionId: at(1), name: "Row" }], plots: [{ plotId: at(2), code: "P01", sectionId: at(1), spaces: [{ spaceId: at(3) }] }] } as ChurchCommand);
  run({ type: "confirm_empty", spaceIds: [at(3)] } as ChurchCommand);
  return { state, site };
}
const churchRegisterApply = (state: ChurchState, event: never): ChurchState => church.adapter.apply(state, event);

describe("T32 text limits at the command: 100, 24, 100 and 4,000 code points, then one more", () => {
  const { state } = churchWithPlot();
  frozen(state);
  const word = (n: number) => "é".repeat(n);

  it("accepts a plot code of 24 and refuses 25, naming the code", () => {
    const code = (n: number): ChurchCommand => ({ type: "add_plot", plotId: at(40), code: "A".repeat(n), spaces: [{ spaceId: at(41) }] }) as ChurchCommand;
    expect(church.run(state, code(24), ON).ok).toBe(true);
    // The check is made on the field, before the command is decided, and names the field.
    const over = refusal(church.run(state, code(25), ON));
    expect(over.code).toBe("invalid_input");
    expect(over.fields).toEqual([{ field: "code", code: "over_limit" }]);
  });

  it("accepts a section name of 100 and refuses 101", () => {
    const layout = (n: number): ChurchCommand => ({ type: "layout_apply", sections: [{ sectionId: at(50), name: word(n) }], plots: [] }) as ChurchCommand;
    expect(church.run(state, layout(100), ON).ok).toBe(true);
    const over = refusal(church.run(state, layout(101), ON));
    expect(over.code).toBe("invalid_input");
    expect(over.fields?.[0]?.code).toBe("over_limit");
  });

  it("accepts a source ref of 100 and refuses 101, on the field", () => {
    const claim = (n: number): ChurchCommand => ({ type: "add_claim", claimId: at(60), spaceId: at(3), mode: "taken", endable: false, sourceRef: word(n) }) as ChurchCommand;
    expect(church.run(state, claim(100), ON).ok).toBe(true);
    const over = refusal(church.run(state, claim(101), ON));
    expect(over.code).toBe("invalid_input");
    expect(over.fields).toEqual([{ field: "sourceRef", code: "over_limit" }]);
  });

  it("accepts a note of 4,000 and refuses 4,001, on the field", () => {
    const note = (n: number): ChurchCommand => ({ type: "add_note", noteId: at(70), plotId: at(2), text: word(n) }) as ChurchCommand;
    expect(church.run(state, note(4000), ON).ok).toBe(true);
    const over = refusal(church.run(state, note(4001), ON));
    expect(over.code).toBe("invalid_input");
    expect(over.fields).toEqual([{ field: "text", code: "over_limit" }]);
  });

  it("accepts a site title of 100 and refuses 101", () => {
    const make = (n: number) => createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind: "churchyard", title: word(n), zone: "Europe/London", createdAt: FIXED_NOW });
    expect(make(100).ok).toBe(true);
    const over = refusal(make(101));
    expect(over.fields).toEqual([{ field: "title", code: "over_limit" }]);
  });

  it("changes nothing it is given when it refuses", () => {
    const before = JSON.stringify(state);
    church.run(state, { type: "add_note", noteId: at(71), plotId: at(2), text: word(4001) } as ChurchCommand, ON);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("T32 sections, spaces and money at the command", () => {
  it("accepts the 100th section and refuses the 101st, naming the item", () => {
    const site = newSite("churchyard");
    const many = (n: number): ChurchCommand => ({ type: "layout_apply", sections: Array.from({ length: n }, (_, i) => ({ sectionId: at(1000 + i), name: `S${i}` })), plots: [] }) as ChurchCommand;
    const state = church.initialState(site);
    expect(church.run(state, many(100), ON).ok).toBe(true);
    const over = refusal(church.run(state, many(101), ON));
    expect(over.code).toBe("over_limit");
    expect(over.detail).toMatchObject({ item: "sectionsPerSite", limit: 100, value: 101 });
  });

  it("accepts a churchyard plot of 12 spaces and refuses a 13th, by add space and by a plot made with 13", () => {
    const state = church.initialState(newSite("churchyard"));
    const plot = (n: number): ChurchCommand => ({ type: "add_plot", plotId: at(80), code: "Y99", spaces: Array.from({ length: n }, (_, i) => ({ spaceId: at(81 + i) })) }) as ChurchCommand;
    expect(church.run(state, plot(12), ON).ok).toBe(true);
    expect(refusal(church.run(state, plot(13), ON)).code).toBe("bad_space_count");
    const grown = (n: number): ChurchState => {
      const made = church.run(state, plot(n), ON);
      if (!made.ok) throw new Error("setup");
      return made.value.reduce((s, d) => church.adapter.apply(s, d.event as never), state);
    };
    const add: ChurchCommand = { type: "add_space", plotId: at(80), spaceId: at(500) } as ChurchCommand;
    expect(church.run(grown(11), add, ON).ok).toBe(true);
    const over = refusal(church.run(grown(12), add, ON));
    expect(over.code).toBe("space_limit");
    expect(over.detail).toMatchObject({ limit: 12 });
  });

  it("accepts a fee of 99,999,999 minor units and refuses 100,000,000, on the field", () => {
    const state = garden.initialState(newSite("allotment"));
    const season = (fee: number): AllotCommand => ({ type: "new_season", seasonId: at(90), name: "Season", start: "2026-04-01", endExclusive: "2027-04-01", dueOn: "2026-06-30", standardFee: fee }) as AllotCommand;
    expect(garden.run(state, season(99_999_999), ON).ok).toBe(true);
    const over = refusal(garden.run(state, season(100_000_000), ON));
    expect(over.code).toBe("invalid_input");
    expect(over.fields?.[0]).toMatchObject({ code: "over_limit" });
  });
});

describe("T32 domain records per site: 20,000, archived and voided included", () => {
  const filler = (n: number): Record<string, unknown> => Object.fromEntries(Array.from({ length: n }, (_, i) => [at(100_000 + i), { burialId: at(100_000 + i), sheet: "Burials", sourceRef: `F${i}`, nameUnknown: true, date: { p: "unknown" }, dateText: "", voided: i % 2 === 0 }]));
  const burial = (): ChurchCommand => ({ type: "record_burial", burialId: at(5), sourceRef: "LAST", nameUnknown: true, date: { p: "unknown" }, dateText: "" }) as ChurchCommand;

  it("church: the 20,000th record is accepted and the 20,001st is refused, naming the item", () => {
    const base = church.initialState(newSite("churchyard"));
    const room = { ...base, burials: filler(19_999) } as unknown as ChurchState;
    expect(church.run(room, burial(), ON).ok).toBe(true);
    const full = { ...base, burials: filler(20_000) } as unknown as ChurchState;
    const over = refusal(church.run(full, burial(), ON));
    expect(over.code).toBe("over_limit");
    expect(over.detail).toMatchObject({ item: "domainRecordsPerSite", limit: 20_000, value: 20_001 });
  });

  it("garden: the same boundary for an applicant", () => {
    const apps = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [at(200_000 + i), { applicationId: at(200_000 + i), personId: at(300_000 + i), joinedOn: "2026-01-01", sequence: i + 1, state: "withdrawn" }]));
    const base = garden.initialState(newSite("allotment"));
    const applicant: AllotCommand = { type: "add_applicant", applicationId: at(6), personId: at(7), name: "Pim Cartwhistle", joinedOn: "2026-01-10" } as AllotCommand;
    const room = { ...base, applications: apps(19_999), nextSequence: 20_000 } as unknown as AllotState;
    expect(garden.run(room, applicant, ON).ok).toBe(true);
    const full = { ...base, applications: apps(20_000), nextSequence: 20_001 } as unknown as AllotState;
    const over = refusal(garden.run(full, applicant, ON));
    expect(over.code).toBe("over_limit");
    expect(over.detail).toMatchObject({ item: "domainRecordsPerSite", limit: 20_000, value: 20_001 });
  });
});

describe("T32 the words for a refused record", () => {
  it("names the item and the limit", async () => {
    const { errorMessage } = await import("../../template/src/ui/messages");
    const { COPY, fill } = await import("../../template/src/ui/copy");
    const t = (key: string, values: Record<string, string | number> = {}) => fill(COPY[key] ?? key, values);
    expect(errorMessage(t, { code: "over_limit", detail: { item: "domainRecordsPerSite", limit: 20000, value: 20001 } })).toBe("records is over the limit of 20000.");
  });
});

describe("T32 events per site: 100,000", () => {
  async function siteNear(count: number) {
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("storage");
    const db = opened.value;
    const site = newSite("churchyard");
    await saveNewSite(db, site);
    // Put the event counter near the limit without writing 100,000 events.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sites", "readwrite");
      const store = tx.objectStore("sites");
      const get = store.get(site.id);
      get.onsuccess = () => store.put({ ...(get.result as SiteRow), lastSeq: count });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return { db, site };
  }
  const input = (siteId: string, expectedRevision: number, n: number) => ({
    siteId,
    expectedRevision,
    opId: mintId(),
    commands: [{ type: "add_plot" }],
    events: Array.from({ length: n }, (_, i) => ({ event: { type: "note_added", noteId: at(i + 1), plotId: at(2), text: "x" }, entityIds: [at(i + 1)], effectiveOn: ON, payloadVersion: 1 })),
    now: fixedClock(FIXED_NOW),
  });

  it("accepts the batch that makes event 100,000 and refuses the next one, changing nothing", async () => {
    const { db, site } = await siteNear(99_999);
    const last = await commit(db, input(site.id, 0, 1) as never);
    expect(last.ok).toBe(true);
    const row = (await readSite(db, site.id)) as SiteRow;
    expect(row.lastSeq).toBe(100_000);
    const eventsBefore = (await readEvents(db, site.id)).length;
    const over = await commit(db, input(site.id, row.revision, 1) as never);
    expect(over).toEqual({ ok: false, error: { code: "over_limit" } });
    expect((await readSite(db, site.id))?.revision).toBe(row.revision);
    expect((await readEvents(db, site.id)).length).toBe(eventsBefore);
  });

  it("refuses a batch that would pass the limit as a whole, and writes none of it", async () => {
    const { db, site } = await siteNear(99_998);
    const over = await commit(db, input(site.id, 0, 3) as never);
    expect(over).toEqual({ ok: false, error: { code: "over_limit" } });
    expect(((await readSite(db, site.id)) as SiteRow).lastSeq).toBe(99_998);
  });
});

describe("T32 the committee files: size, issues, decisions, aliases and labels", () => {
  const issue = (i: number, label = "Record") => ({ issueKey: at(0x10000 + i), subjectKey: at(0x20000 + i), label, rule: "placement_missing" as const, factVersion: 1 });
  const packetInput = (issues: ReturnType<typeof issue>[], alias = "Site 1") => ({ siteKind: "churchyard", siteKey: at(1), lineageId: at(2), siteAlias: alias, revision: 1, asOf: ON, issues });

  it("accepts a label and an alias of 40 and refuses 41", () => {
    expect(buildPacket(packetInput([issue(1, "a".repeat(40))], "b".repeat(40))).ok).toBe(true);
    const label = buildPacket(packetInput([issue(1, "a".repeat(41))]));
    expect(label.ok).toBe(false);
    const alias = buildPacket(packetInput([issue(1)], "b".repeat(41)));
    expect(alias.ok).toBe(false);
  });

  it("accepts 2,000 issues and refuses 2,001", () => {
    expect(buildPacket(packetInput(Array.from({ length: 2000 }, (_, i) => issue(i)))).ok).toBe(true);
    expect(buildPacket(packetInput(Array.from({ length: 2001 }, (_, i) => issue(i)))).ok).toBe(false);
  });

  it("accepts a packet of exactly 2 MiB and refuses one byte more", () => {
    const base = buildPacket(packetInput([issue(1)]));
    if (!base.ok) throw new Error("packet");
    const size = (padding: number) => encodePacket({ ...base.packet, issues: [{ ...base.packet.issues[0]!, label: "a".repeat(padding) }] });
    const empty = size(0);
    if (!empty.ok) throw new Error("size");
    const exact = size(2 * 1024 * 1024 - empty.bytes);
    expect(exact).toMatchObject({ ok: true, bytes: 2 * 1024 * 1024 });
    expect(size(2 * 1024 * 1024 - empty.bytes + 1)).toMatchObject({ ok: false, code: "too_big" });
  });

  it("accepts 2,000 slip decisions and refuses 2,001, and holds a slip to 2 MiB", () => {
    const decision = (i: number) => ({ actionId: at(0x30000 + i), issueKey: at(0x10000 + i), factVersion: 1, disposition: "checked" as const, reviewedOn: ON });
    const slip = (n: number) => buildSlip({ siteKey: at(1), lineageId: at(2), packetRevision: 1, packetAsOf: ON, decisions: Array.from({ length: n }, (_, i) => decision(i)) });
    expect(slip(2000).ok).toBe(true);
    expect(slip(2001).ok).toBe(false);
    const built = slip(1);
    if (!built.ok) throw new Error("slip");
    const padded = (n: number) => encodeSlip({ ...built.slip, decisions: [{ ...built.slip.decisions[0]!, disposition: "checked", actionId: "a".repeat(n) }] });
    const base = padded(1);
    if (!base.ok) throw new Error("size");
    expect(padded(2 * 1024 * 1024 - base.bytes + 1)).toMatchObject({ ok: true, bytes: 2 * 1024 * 1024 });
    expect(padded(2 * 1024 * 1024 - base.bytes + 2)).toMatchObject({ ok: false, code: "too_big" });
  });
});

describe("T32 a preview of the most rows writes nothing, and cancelling leaves the register as it was", () => {
  const rows = (n: number): string => ["Source ref,Name,Section,Plot,Burial date,Page", ...Array.from({ length: n }, (_, i) => `R${String(i + 1).padStart(5, "0")},Name ${i + 1},,,${1800 + (i % 100)},P${(i % 90) + 1}`)].join("\n");

  it("stages 5,000 rows with no write, then discards them", async () => {
    const env = await PaperEnv.create();
    await env.applyGrid();
    const revision = env.revision;
    const events = await env.eventCount();
    const started = performance.now();
    const staged = stageCsvText(env, rows(5000));
    const seconds = (performance.now() - started) / 1000;
    expect(staged.rows).toHaveLength(5000);
    expect(staged.counts.ready + staged.counts.unplaced).toBe(5000);
    expect(seconds).toBeLessThan(10);
    // Cancel is dropping the staged object. Nothing was written.
    expect(await env.eventCount()).toBe(events);
    expect(((await readSite(env.db, env.site.id)) as SiteRow).revision).toBe(revision);
  });

  it("refuses 5,001 rows before it stages any", () => {
    return PaperEnv.create().then((env) => {
      expect(() => stageCsvText(env, rows(5001))).toThrow(/over_limit|csvDataRows/);
    });
  });
});

describe("T32 resource use on the reference machine: one cold run, five warm runs, the worst value kept", () => {
  const timed = async <T>(fn: () => Promise<T> | T): Promise<{ ms: number; value: T }> => {
    const started = performance.now();
    const value = await fn();
    return { ms: performance.now() - started, value };
  };
  const worst = async (fn: () => Promise<unknown> | unknown): Promise<number> => {
    const runs: number[] = [];
    for (let i = 0; i < 6; i++) runs.push((await timed(fn)).ms);
    return Math.max(...runs);
  };

  it("previews 200 rows within 2 s", async () => {
    const env = await PaperEnv.create();
    await env.applyGrid();
    const text = await import("node:fs").then((fs) => fs.readFileSync(new URL("../fixtures/paper-200.csv", import.meta.url), "utf8"));
    const ms = await worst(() => stageCsvText(env, text));
    process.stdout.write(`resource: 200 row preview, worst of six runs ${ms.toFixed(1)} ms (limit 2000)\n`);
    expect(ms).toBeLessThan(2000);
  });

  it("commits 200 rows within 3 s", async () => {
    const { commitImport } = await import("../../template/src/data/importBatch");
    const text = await import("node:fs").then((fs) => fs.readFileSync(new URL("../fixtures/paper-200.csv", import.meta.url), "utf8"));
    const runs: number[] = [];
    for (let i = 0; i < 6; i++) {
      const env = await PaperEnv.create();
      await env.applyGrid();
      const staged = stageCsvText(env, text);
      const started = performance.now();
      const done = await commitImport(env.db, staged, { opId: mintId() });
      runs.push(performance.now() - started);
      expect(done.ok).toBe(true);
    }
    process.stdout.write(`resource: 200 row commit, worst of six runs ${Math.max(...runs).toFixed(1)} ms (limit 3000)\n`);
    expect(Math.max(...runs)).toBeLessThan(3000);
  });

  it("searches 2,000 plots within 200 ms", async () => {
    const siteId = at(1);
    const entries: SearchEntry[] = Array.from({ length: 2000 }, (_, i) => ({
      siteId,
      plotId: at(10_000 + i),
      code: `C${String(i + 1).padStart(4, "0")}`,
      priorCodes: i % 7 === 0 ? [`OLD${i}`] : [],
      names: [{ recordId: at(50_000 + i), display: `Ysolde Fenwick ${i}`, sourceRef: `R${i}`, source: `Page ${i}`, date: "1901" }],
    }));
    const byName = await worst(() => search(entries, siteId, "Fenwick 1999"));
    const byCode = await worst(() => search(entries, siteId, "C1500"));
    process.stdout.write(`resource: search over 2000 plots, worst of six runs ${Math.max(byName, byCode).toFixed(1)} ms (limit 200)\n`);
    expect(byName).toBeLessThan(200);
    expect(byCode).toBeLessThan(200);
  });
});

describe("T32 a full local store never reports success", () => {
  it("says quota, writes nothing, and leaves the revision and the counts as they were", async () => {
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("storage");
    const db = opened.value;
    const site = newSite("churchyard");
    await saveNewSite(db, site);
    const bad = failingDb(db, { store: "events", method: "add", error: quotaError() });
    const refused = await commit(bad, {
      siteId: site.id,
      expectedRevision: 0,
      opId: mintId(),
      commands: [{ type: "add_note" }],
      events: [{ event: { type: "note_added", noteId: at(1), plotId: at(2), text: "x" }, entityIds: [at(1)], effectiveOn: ON, payloadVersion: 1 }],
      now: fixedClock(FIXED_NOW),
    } as never);
    expect(refused).toEqual({ ok: false, error: { code: "quota" } });
    expect(((await readSite(db, site.id)) as SiteRow).revision).toBe(0);
    expect(await readEvents(db, site.id)).toEqual([]);
  });
});

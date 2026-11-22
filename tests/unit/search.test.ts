// T16: search ranks an exact code first, then a prior code, then names; it
// keeps people apart, keeps the original spelling and stays inside one site.
import { describe, expect, it } from "vitest";
import { search, type SearchEntry } from "../../template/src/search";
import { fid } from "../helpers/site";

const SITE = fid("site:1");
const OTHER = fid("site:2");

function entry(code: string, over: Partial<SearchEntry> = {}): SearchEntry {
  return { siteId: SITE, plotId: fid(`plot:${code}`), code, priorCodes: [], names: [], ...over };
}

function name(recordId: string, display: string, extra: Record<string, unknown> = {}) {
  return { recordId: fid(recordId), display, ...extra };
}

describe("T16 codes", () => {
  it("finds an exact code, ignoring case and outer space, and keeps the stored spelling", () => {
    const hits = search([entry("Y07"), entry("Y08")], SITE, "  y07 ");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ rank: 1, via: "code", code: "Y07", plotId: fid("plot:Y07"), matchedText: "Y07" });
  });

  it("keeps leading zeros apart", () => {
    const hits = search([entry("007"), entry("7")], SITE, "007");
    expect(hits.map((h) => h.code)).toEqual(["007"]);
  });

  it("finds a plot by its previous code after a rename, and shows the current code", () => {
    const renamed = entry("Z01", { priorCodes: ["Y07"] });
    const hits = search([renamed], SITE, "y07");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ rank: 2, via: "priorCode", code: "Z01", plotId: renamed.plotId, matchedText: "Y07" });
    expect(search([renamed], SITE, "Z01")[0]).toMatchObject({ rank: 1, via: "code" });
  });

  it("ranks exact current code, then prior code, then source ref, then name", () => {
    const entries = [
      entry("A4", { names: [name("r:name", "Marr5 Fenn")] }),
      entry("A3", { names: [name("r:src", "Name unknown", { nameUnknown: true, sourceRef: "R5" })] }),
      entry("A2", { priorCodes: ["r5"] }),
      entry("A1", { code: "R5" }),
    ];
    const hits = search(entries, SITE, "r5");
    expect(hits.map((h) => [h.rank, h.via, h.code])).toEqual([
      [1, "code", "R5"],
      [2, "priorCode", "A2"],
      [3, "sourceRef", "A3"],
      [4, "name", "A4"],
    ]);
  });
});

describe("T16 names", () => {
  const entries = [
    entry("Y07", {
      names: [
        name("r:mirel", "Mirel Quillmoss", { source: "Register 1, p4", date: "March 1874" }),
        name("r:other", "Torin Pell", { source: "Register 1, p5", date: "1880" }),
      ],
    }),
    entry("Y04", { names: [name("r:jose", "José Álvarez", { source: "Register 2, p1", date: "1901" })] }),
  ];

  it("finds a name by one word and shows the plot code, source and date", () => {
    const hits = search(entries, SITE, "Quillmoss");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      rank: 4,
      via: "name",
      code: "Y07",
      display: "Mirel Quillmoss",
      source: "Register 1, p4",
      date: "March 1874",
      recordId: fid("r:mirel"),
    });
  });

  it("needs every word of the query", () => {
    expect(search(entries, SITE, "mirel quillmoss")).toHaveLength(1);
    expect(search(entries, SITE, "mirel pell")).toHaveLength(0);
  });

  it("ignores case and accents but returns the original spelling", () => {
    for (const query of ["jose alvarez", "JOSÉ", "alvarez", "Álvarez"]) {
      const hits = search(entries, SITE, query);
      expect(hits, query).toHaveLength(1);
      expect(hits[0]?.display).toBe("José Álvarez");
    }
    expect(search(entries, SITE, "josé")).toHaveLength(1);
  });

  it("keeps two people with the same name apart, each with its own record", () => {
    const twins = [
      entry("A1", { names: [name("r:a", "John Smith", { source: "Register 1, p2", date: "1850" })] }),
      entry("A2", { names: [name("r:b", "John Smith", { source: "Register 3, p9", date: "1902" })] }),
    ];
    const hits = search(twins, SITE, "john smith");
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.recordId)).toEqual([fid("r:a"), fid("r:b")]);
    expect(hits.map((h) => h.plotId)).toEqual([fid("plot:A1"), fid("plot:A2")]);
    expect(hits.map((h) => h.source)).toEqual(["Register 1, p2", "Register 3, p9"]);
  });

  it("never merges similar names", () => {
    const similar = [
      entry("A1", { names: [name("r:a", "Mirel Quillmoss")] }),
      entry("A2", { names: [name("r:b", "Merel Quilmoss")] }),
    ];
    expect(search(similar, SITE, "quillmoss").map((h) => h.recordId)).toEqual([fid("r:a")]);
  });

  it("does not search the words of an unknown name, but finds it by code and source ref", () => {
    const unknown = [entry("C117", { names: [name("r:u", "Name unknown", { nameUnknown: true, sourceRef: "R117" })] })];
    expect(search(unknown, SITE, "unknown")).toEqual([]);
    expect(search(unknown, SITE, "name")).toEqual([]);
    expect(search(unknown, SITE, "c117")[0]).toMatchObject({ via: "code" });
    expect(search(unknown, SITE, "r117")[0]).toMatchObject({ via: "sourceRef", recordId: fid("r:u"), code: "C117" });
  });
});

describe("T16 one site only", () => {
  it("never returns an entry of another site, by code, prior code, source ref or name", () => {
    const foreign = [
      entry("Y07", { siteId: OTHER, priorCodes: ["Q1"], names: [name("r:x", "Mirel Quillmoss", { sourceRef: "R1" })] }),
    ];
    for (const query of ["Y07", "Q1", "R1", "quillmoss"]) {
      expect(search(foreign, SITE, query), query).toEqual([]);
    }
    expect(search(foreign, OTHER, "Y07")).toHaveLength(1);
  });

  it("gives the same code in two sites two separate answers", () => {
    const both = [entry("Y07"), entry("Y07", { siteId: OTHER, plotId: fid("plot:other:Y07") })];
    expect(search(both, SITE, "Y07").map((h) => h.plotId)).toEqual([fid("plot:Y07")]);
    expect(search(both, OTHER, "Y07").map((h) => h.plotId)).toEqual([fid("plot:other:Y07")]);
  });
});

describe("T16 empty and limits", () => {
  it("returns nothing for an empty query or no match", () => {
    expect(search([entry("Y07")], SITE, "")).toEqual([]);
    expect(search([entry("Y07")], SITE, "   ")).toEqual([]);
    expect(search([entry("Y07")], SITE, "zzz")).toEqual([]);
    expect(search([], SITE, "Y07")).toEqual([]);
  });

  it("orders ties the same way every time", () => {
    const entries = [
      entry("B2", { names: [name("r:2", "Ann Fenn")] }),
      entry("B1", { names: [name("r:1", "Ann Fenn")] }),
      entry("A9", { names: [name("r:9", "Ann Fenn")] }),
    ];
    const first = search(entries, SITE, "fenn").map((h) => h.code);
    const second = search([...entries].reverse(), SITE, "fenn").map((h) => h.code);
    expect(first).toEqual(["A9", "B1", "B2"]);
    expect(second).toEqual(first);
  });

  it("stops at the limit", () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`P${i}`, { names: [name(`r:${i}`, "Ann Fenn")] }));
    expect(search(entries, SITE, "fenn", 3)).toHaveLength(3);
    expect(search(entries, SITE, "fenn")).toHaveLength(10);
  });

  it("does not change its input", () => {
    const entries = [entry("B2"), entry("B1")];
    const before = JSON.stringify(entries);
    search(entries, SITE, "b1");
    expect(JSON.stringify(entries)).toBe(before);
  });
});

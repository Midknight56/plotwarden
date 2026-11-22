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

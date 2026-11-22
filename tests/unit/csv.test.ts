// T06 (CSV reading) and the CSV bounds of T32. Requirements P7.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectSeparator, parseCsv, previewRows, readCsvBytes } from "../../template/src/data/csv";
import type { CsvTable } from "../../template/src/data/csv";
import { LIMITS } from "../../template/src/limits";

function table(text: string, separator?: "comma" | "semicolon" | "tab"): CsvTable {
  const r = parseCsv(text, separator === undefined ? undefined : { separator });
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.error)}`);
  return r.value;
}

function refused(text: string, separator?: "comma" | "semicolon" | "tab") {
  const r = parseCsv(text, separator === undefined ? undefined : { separator });
  if (r.ok) throw new Error("expected a refusal");
  return r.error;
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe("bytes", () => {
  it("reads UTF 8 with or without a byte order mark", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("a,b\n1,2\n")]);
    expect(readCsvBytes(withBom)).toEqual({ ok: true, value: "a,b\n1,2\n" });
    expect(readCsvBytes(bytes("a,b\n1,2\n"))).toEqual({ ok: true, value: "a,b\n1,2\n" });
  });

  it("keeps accents exactly", () => {
    expect(readCsvBytes(bytes("Zoë Ångström"))).toEqual({ ok: true, value: "Zoë Ångström" });
  });

  it("refuses bytes that are not UTF 8", () => {
    const r = readCsvBytes(new Uint8Array([0x61, 0xc3, 0x28, 0x62]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_utf8");
    expect(readCsvBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00])).ok).toBe(false);
  });

  it("accepts 5 MiB and refuses one byte more before decoding", () => {
    expect(readCsvBytes(new Uint8Array(LIMITS.csvBytes).fill(97)).ok).toBe(true);
    const over = readCsvBytes(new Uint8Array(LIMITS.csvBytes + 1).fill(97));
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.code).toBe("over_limit");
      expect(over.error.detail).toMatchObject({ item: "csvBytes", limit: LIMITS.csvBytes, value: LIMITS.csvBytes + 1 });
    }
  });
});

describe("reading rows", () => {
  it("reads comma, semicolon and tab", () => {
    expect(table("a,b\n1,2\n", "comma")).toEqual({ headings: ["a", "b"], rows: [["1", "2"]], separator: "comma" });
    expect(table("a;b\n1;2\n", "semicolon").rows).toEqual([["1", "2"]]);
    expect(table("a\tb\n1\t2\n", "tab").rows).toEqual([["1", "2"]]);
  });

  it("reads quoted fields, doubled quotes, and a newline inside quotes", () => {
    const t = table('Name,Note\n"Quillmoss, Mirel","Said ""hello"""\n"Two\nlines",x\n', "comma");
    expect(t.rows).toEqual([
      ["Quillmoss, Mirel", 'Said "hello"'],
      ["Two\nlines", "x"],
    ]);
  });

  it("keeps a CRLF inside quotes as it was", () => {
    expect(table('a,b\n"x\r\ny",1\n', "comma").rows).toEqual([["x\r\ny", "1"]]);
  });

  it("reads empty cells, including a trailing one", () => {
    expect(table("a,b,c\n1,,3\n,,\n4,5,\n", "comma").rows).toEqual([["1", "", "3"], ["", "", ""], ["4", "5", ""]]);
  });

  it("reads CRLF, LF and CR line ends, with or without a final one", () => {
    const expected = [["1", "2"], ["3", "4"]];
    expect(table("a,b\r\n1,2\r\n3,4\r\n", "comma").rows).toEqual(expected);
    expect(table("a,b\n1,2\n3,4", "comma").rows).toEqual(expected);
    expect(table("a,b\r1,2\r3,4\r", "comma").rows).toEqual(expected);
  });

  it("skips a blank line", () => {
    expect(table("a,b\n1,2\n\n3,4\n\n", "comma").rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("keeps leading zeros, outer spaces and accents exactly", () => {
    const t = table("Plot,Name\n001, Zoë  \n", "comma");
    expect(t.rows).toEqual([["001", " Zoë  "]]);
  });

  it("gives a heading row alone as no rows", () => {
    expect(table("a,b\n", "comma").rows).toEqual([]);
  });

  it("refuses an empty file", () => {
    expect(refused("", "comma").code).toBe("empty_file");
    expect(refused("\n\n", "comma").code).toBe("empty_file");
  });
});

describe("a wrong quote or a wrong width", () => {
  it("refuses a quote inside an unquoted cell, with its row", () => {
    const e = refused('a,b\n1,2\n3,x"y\n', "comma");
    expect(e.code).toBe("stray_quote");
    expect(e.detail?.["row"]).toBe(2);
  });

  it("refuses text after a closing quote", () => {
    const e = refused('a,b\n"1"x,2\n', "comma");
    expect(e.code).toBe("text_after_quote");
    expect(e.detail?.["row"]).toBe(1);
  });

  it("refuses a quote that never closes", () => {
    const e = refused('a,b\n1,2\n"3,4\n', "comma");
    expect(e.code).toBe("unclosed_quote");
    expect(e.detail?.["row"]).toBe(2);
  });

  it("numbers the heading row 0", () => {
    const e = refused('a"b,c\n1,2\n', "comma");
    expect(e.code).toBe("stray_quote");
    expect(e.detail?.["row"]).toBe(0);
  });

  it("names a row whose width differs from the heading row", () => {
    const e = refused("a,b,c\n1,2,3\n4,5\n", "comma");
    expect(e.code).toBe("row_width");
    expect(e.detail).toMatchObject({ row: 2, expected: 3, found: 2 });
  });
});

describe("the bounds", () => {
  it("accepts 5,000 data rows and refuses the 5,001st, naming it", () => {
    const rows = (n: number) => `a\n${Array.from({ length: n }, (_, i) => `r${i}`).join("\n")}\n`;
    expect(table(rows(LIMITS.csvDataRows), "comma").rows.length).toBe(5000);
    const e = refused(rows(LIMITS.csvDataRows + 1), "comma");
    expect(e.code).toBe("over_limit");
    expect(e.detail).toMatchObject({ item: "csvDataRows", limit: 5000, value: 5001, row: 5001 });
  });

  it("accepts 40 columns and refuses 41", () => {
    const wide = (n: number) => `${Array.from({ length: n }, (_, i) => `h${i}`).join(",")}\n${Array.from({ length: n }, () => "x").join(",")}\n`;
    expect(table(wide(LIMITS.csvColumns), "comma").headings.length).toBe(40);
    const e = refused(wide(LIMITS.csvColumns + 1), "comma");
    expect(e.detail).toMatchObject({ item: "csvColumns", limit: 40, value: 41 });
  });

  it("accepts a cell of 4,000 characters and refuses 4,001, naming the row", () => {
    const cell = (n: number) => `a\n${"x".repeat(n)}\n`;
    expect(table(cell(LIMITS.csvCellChars), "comma").rows[0]?.[0]?.length).toBe(4000);
    const e = refused(`a\nfine\n${"x".repeat(4001)}\n`, "comma");
    expect(e.code).toBe("over_limit");
    expect(e.detail).toMatchObject({ item: "csvCellChars", limit: 4000, value: 4001, row: 2 });
  });

  it("counts characters, not UTF 16 units", () => {
    const heads = "a\n";
    const emoji = "\u{1F33F}".repeat(4000);
    expect(table(`${heads}${emoji}\n`, "comma").rows[0]?.[0]).toBe(emoji);
    expect(refused(`${heads}${emoji}\u{1F33F}\n`, "comma").detail).toMatchObject({ item: "csvCellChars", value: 4001 });
  });

  it("accepts text of exactly 5 MiB and refuses one byte more", () => {
    // Header "a\n" is 2 bytes. 5,000 rows of 1,047 letters and a line end are 1,048 bytes each.
    // The last row is lengthened to reach 5 MiB (5,242,880 bytes) exactly.
    const row = (n: number) => `${"x".repeat(n)}\n`;
    const rows = Array.from({ length: 5000 }, () => row(1047));
    const total = 2 + 5000 * 1048;
    const extra = LIMITS.csvBytes - total;
    rows[4999] = row(1047 + extra);
    const text = `a\n${rows.join("")}`;
    expect(new TextEncoder().encode(text).length).toBe(LIMITS.csvBytes);
    expect(parseCsv(text, { separator: "comma" }).ok).toBe(true);
    const over = parseCsv(`${text}y`, { separator: "comma" });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detail).toMatchObject({ item: "csvBytes", limit: LIMITS.csvBytes });
  });

  it("stops at the first exceeded bound, not at a later problem", () => {
    const e = refused(`a\nok\n${"x".repeat(4001)}\n"unclosed\nq"x\n`, "comma");
    expect(e.code).toBe("over_limit");
    expect(e.detail?.["row"]).toBe(2);
  });
});

describe("the separator", () => {
  it("is comma or semicolon when only one is in the heading row", () => {
    expect(detectSeparator("a,b\n1,2\n")).toEqual({ separator: "comma" });
    expect(detectSeparator("a;b\n1;2,5\n")).toEqual({ separator: "semicolon" });
  });

  it("is tab for text pasted from a spreadsheet", () => {
    expect(detectSeparator("a\tb\n1\t2\n")).toEqual({ separator: "tab" });
  });

  it("is comma for a file with one column", () => {
    expect(detectSeparator("Name\nZoë\n")).toEqual({ separator: "comma" });
  });

  it("looks at the rows when both are in the heading row", () => {
    // Commas split the first row into 3 and the second into 2, so semicolons win.
    expect(detectSeparator("Name;Place, County;Page\nAnna;Leeds;7\n")).toEqual({ separator: "semicolon" });
    expect(detectSeparator("Name,Place;Alias,Page\nAnna,Leeds,7\n")).toEqual({ separator: "comma" });
  });

  it("is unclear when both fit, and gives a live preview of each", () => {
    const text = "Name;Place, County\nAnna;Leeds, West Yorkshire\n";
    const guess = detectSeparator(text);
    expect(guess.separator).toBe("unclear");
    expect(guess.previews?.comma[0]).toEqual(["Name;Place", " County"]);
    expect(guess.previews?.semicolon[0]).toEqual(["Name", "Place, County"]);
  });

  it("is an error to read an unclear file without a choice, and not once one is chosen", () => {
    const text = "Name;Place, County\nAnna;Leeds, West Yorkshire\n";
    const e = refused(text);
    expect(e.code).toBe("separator_unclear");
    expect(table(text, "semicolon").headings).toEqual(["Name", "Place, County"]);
    expect(table(text, "comma").headings).toEqual(["Name;Place", " County"]);
  });

  it("does not count a separator inside quotes", () => {
    expect(detectSeparator('"a;b",c\n1,2\n')).toEqual({ separator: "comma" });
  });

  it("previews the first rows and never fails", () => {
    expect(previewRows('a,b\n"x,y",2\n3,4\n', "comma", 2)).toEqual([["a", "b"], ["x,y", "2"]]);
    expect(previewRows('a,b\n"open,2\n', "comma", 3).length).toBeGreaterThan(0);
  });
});

describe("the comma and quote fixture", () => {
  const bytesOf = () => new Uint8Array(readFileSync(new URL("../fixtures/comma-quotes.csv", import.meta.url)));

  it("has a byte order mark that the reader removes", () => {
    expect([...bytesOf().slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = readCsvBytes(bytesOf());
    expect(text.ok && text.value.startsWith("Source ref")).toBe(true);
  });

  it("keeps commas, quotes, a newline, accents and leading zeros", () => {
    const text = readCsvBytes(bytesOf());
    if (!text.ok) throw new Error("unreadable");
    const t = table(text.value);
    expect(t.headings).toEqual(["Source ref", "Name", "Plot", "Notes"]);
    expect(t.rows).toEqual([
      ["R001", "Quillmoss, Mirel", "001", 'Said "hello" at the gate'],
      ["R002", "Zoë Ångström", "Y07", "Line one\nLine two"],
      ["R003", "", "", ""],
    ]);
  });
});

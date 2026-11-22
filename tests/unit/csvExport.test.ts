// T06 support and R20.7: a CSV cell that starts like a formula is escaped. Requirements P10.
import { describe, expect, it } from "vitest";
import type { FieldDef, SheetDef } from "../../template/src/adapter";
import { columnGuide, escapeCell, toCsv } from "../../template/src/data/csvExport";
import type { GuideWords } from "../../template/src/data/csvExport";
import { parseCsv, readCsvBytes } from "../../template/src/data/csv";

describe("escaping one cell", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+44 20", "'+44 20"],
    ["-5", "'-5"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tx", "'\tx"],
    ["=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\""],
  ])("prefixes %j", (value, expected) => {
    expect(escapeCell(value)).toBe(expected);
  });

  it("prefixes and quotes a cell that starts with a carriage return", () => {
    expect(escapeCell("\rx")).toBe("\"'\rx\"");
  });

  it("leaves ordinary text, leading zeros and accents alone", () => {
    expect(escapeCell("plain")).toBe("plain");
    expect(escapeCell("001")).toBe("001");
    expect(escapeCell("Zoë Ångström")).toBe("Zoë Ångström");
    expect(escapeCell("")).toBe("");
    expect(escapeCell(" =x")).toBe(" =x");
    expect(escapeCell("a=b")).toBe("a=b");
    expect(escapeCell("'=1+1")).toBe("'=1+1");
  });

  it("quotes a cell that holds a comma, a quote or a line end, and doubles each quote", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("one\ntwo")).toBe('"one\ntwo"');
    expect(escapeCell("one\r\ntwo")).toBe('"one\r\ntwo"');
  });
});

describe("writing a CSV", () => {
  it("starts with a byte order mark, uses CRLF and ends with a line end", () => {
    const text = toCsv(["Code", "Name"], [["C001", "Mirel"], ["C002", "Zoë"]]);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toBe("\uFEFFCode,Name\r\nC001,Mirel\r\nC002,Zoë\r\n");
  });

  it("escapes the headings and the cells", () => {
    const text = toCsv(["=A"], [["=B"], ["x,y"]]);
    expect(text).toBe("\uFEFF'=A\r\n'=B\r\n\"x,y\"\r\n");
  });

  it("reads back to the same values, except the escaped prefix", () => {
    const rows = [["001", 'Said "hello", then left'], ["R2", "Line one\nLine two"], ["R3", "=2+2"]];
    const text = toCsv(["Ref", "Note"], rows);
    const bytes = new TextEncoder().encode(text);
    const read = readCsvBytes(bytes);
    if (!read.ok) throw new Error("unreadable");
    const parsed = parseCsv(read.value, { separator: "comma" });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.value.headings).toEqual(["Ref", "Note"]);
    expect(parsed.value.rows).toEqual([["001", 'Said "hello", then left'], ["R2", "Line one\nLine two"], ["R3", "'=2+2"]]);
  });

  it("writes only the headings for no rows", () => {
    expect(toCsv(["A", "B"], [])).toBe("\uFEFFA,B\r\n");
  });
});

describe("the column guide", () => {
  const fields: FieldDef[] = [
    { key: "sourceRef", label: "Source ref", type: "text", maxChars: 100 },
    { key: "name", label: "Name", type: "text", maxChars: 100 },
    { key: "date", label: "Burial date", type: "date" },
    { key: "fee", label: "Fee", type: "money" },
    { key: "state", label: "Status", type: "choice", choices: ["Free", "Taken"] },
    { key: "spaces", label: "Spaces", type: "number" },
  ];
  const sheet: SheetDef = { name: "Burials", required: ["Source ref", "Name"], optional: ["Burial date", "Fee", "Status", "Spaces"] };
  const words: GuideWords = {
    heading: "Heading",
    needed: "Needed",
    format: "Format",
    yes: "Yes",
    no: "No",
    text: "Text up to {max} characters",
    date: "A year first date, a month and year, a year, or unknown",
    number: "A whole number",
    money: "An amount with up to two decimals. Blank means unknown.",
    choice: "One of: {choices}",
  };

  it("lists every heading of the sheet with whether it is needed and its format", () => {
    const text = columnGuide(sheet, fields, words);
    const read = parseCsv(text.slice(1), { separator: "comma" });
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.value.headings).toEqual(["Heading", "Needed", "Format"]);
    expect(read.value.rows).toEqual([
      ["Source ref", "Yes", "Text up to 100 characters"],
      ["Name", "Yes", "Text up to 100 characters"],
      ["Burial date", "No", "A year first date, a month and year, a year, or unknown"],
      ["Fee", "No", "An amount with up to two decimals. Blank means unknown."],
      ["Status", "No", "One of: Free, Taken"],
      ["Spaces", "No", "A whole number"],
    ]);
  });
});

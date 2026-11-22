// T06 (column mapping, per cell errors, no guessed date or zero). Requirements P8.
import { describe, expect, it } from "vitest";
import type { FieldDef, SheetDef } from "../../template/src/adapter";
import type { CsvTable } from "../../template/src/data/csv";
import { applyMapping, checkCells, checkMapping, fieldsForSheet, normaliseHeading, suggestMapping } from "../../template/src/data/mapping";
import type { Mapping } from "../../template/src/data/mapping";

const FIELDS: FieldDef[] = [
  { key: "sourceRef", label: "Source ref", type: "text", maxChars: 100 },
  { key: "name", label: "Name", type: "text", maxChars: 100 },
  { key: "section", label: "Section", type: "text" },
  { key: "plot", label: "Plot", type: "text", maxChars: 24 },
  { key: "burialDate", label: "Burial date", type: "date" },
  { key: "page", label: "Page", type: "text" },
  { key: "fee", label: "Fee", type: "money" },
  { key: "state", label: "Status", type: "choice", choices: ["Free", "Taken"] },
  { key: "spaces", label: "Spaces", type: "number" },
  { key: "unused", label: "Unused", type: "text" },
];

const SHEET: SheetDef = {
  name: "Burials",
  required: ["Source ref", "Name"],
  optional: ["Section", "Plot", "Burial date", "Page", "Fee", "Status", "Spaces"],
};

function table(headings: string[], rows: string[][]): CsvTable {
  return { headings, rows, separator: "comma" };
}

function mapped(headings: string[], keys: (string | undefined)[]): Mapping {
  return {
    columns: headings.map((heading, index) => {
      const key = keys[index];
      return key === undefined ? { index, heading } : { index, heading, fieldKey: key };
    }),
  };
}

describe("matching headings", () => {
  it("ignores case, accents, spaces and punctuation for matching only", () => {
    expect(normaliseHeading("Source Ref")).toBe("sourceref");
    expect(normaliseHeading("  SOURCE  ref. ")).toBe("sourceref");
    expect(normaliseHeading("Né-Name")).toBe("nename");
    expect(normaliseHeading("Zoë")).toBe("zoe");
  });

  it("lists the fields a sheet can fill, in sheet order", () => {
    expect(fieldsForSheet(SHEET, FIELDS).map((f) => f.key)).toEqual([
      "sourceRef",
      "name",
      "section",
      "plot",
      "burialDate",
      "page",
      "fee",
      "state",
      "spaces",
    ]);
  });

  it("suggests a field for each heading it knows, and none for the rest", () => {
    const m = suggestMapping(["Source ref", "NAME", "burial  date", "Mystery", "Reference"], fieldsForSheet(SHEET, FIELDS));
    expect(m.columns.map((c) => c.fieldKey)).toEqual(["sourceRef", "name", "burialDate", undefined, "sourceRef"]);
    expect(m.columns.map((c) => c.heading)).toEqual(["Source ref", "NAME", "burial  date", "Mystery", "Reference"]);
  });
});

describe("checking a mapping", () => {
  it("accepts a mapping that fills every required heading once", () => {
    const m = mapped(["Source ref", "Name", "Extra"], ["sourceRef", "name", undefined]);
    expect(checkMapping(m, SHEET, FIELDS).ok).toBe(true);
  });

  it("names a required heading that no column fills", () => {
    const r = checkMapping(mapped(["Name", "Plot"], ["name", "plot"]), SHEET, FIELDS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("missing_required_column");
      expect(r.error.detail?.["field"]).toBe("Source ref");
    }
  });

  it("refuses two columns for one field, with the row, heading, value and a fix", () => {
    const headings = ["Source ref", "Name", "Name "];
    const data = table(headings, [["R001", "Mirel", "Quillmoss"]]);
    const r = checkMapping(mapped(headings, ["sourceRef", "name", "name"]), SHEET, FIELDS, data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("duplicate_mapping");
      expect(r.error.detail).toMatchObject({ field: "Name", heading: "Name ", other: "Name", row: 1, value: "Quillmoss", fix: "ignore_one_column" });
    }
  });

  it("accepts the same two columns once one is ignored", () => {
    const headings = ["Source ref", "Name", "Name "];
    expect(checkMapping(mapped(headings, ["sourceRef", "name", undefined]), SHEET, FIELDS).ok).toBe(true);
  });

  it("refuses a column mapped to a field the sheet does not use", () => {
    const r = checkMapping(mapped(["Source ref", "Name", "Unused"], ["sourceRef", "name", "unused"]), SHEET, FIELDS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("unknown_field");
  });
});

describe("applying a mapping", () => {
  const headings = ["Source ref", "Name", "Plot", "Burial date", "Junk"];
  const m = mapped(headings, ["sourceRef", "name", "plot", "burialDate", undefined]);

  it("keeps the exact text of every mapped cell and drops an ignored column", () => {
    const r = applyMapping(table(headings, [["R001", " Zoë  ", "001", "March 1874", "x"]]), m, SHEET, FIELDS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([
        { rowNumber: 1, cells: { sourceRef: "R001", name: " Zoë  ", plot: "001", burialDate: "March 1874" }, errors: [] },
      ]);
    }
  });

  it("counts rows from 1", () => {
    const r = applyMapping(table(headings, [["R001", "A", "", "", ""], ["R002", "B", "", "", ""]]), m, SHEET, FIELDS);
    expect(r.ok && r.value.map((x) => x.rowNumber)).toEqual([1, 2]);
  });

  it("marks a blank required cell with its row, heading and a fix", () => {
    const r = applyMapping(table(headings, [["R001", "A", "", "", ""], ["", "B", "", "", ""]]), m, SHEET, FIELDS);
    if (!r.ok) throw new Error("refused");
    expect(r.value[0]?.errors).toEqual([]);
    expect(r.value[1]?.errors).toEqual([
      { row: 2, field: "sourceRef", heading: "Source ref", value: "", code: "required", fix: "enter_value" },
    ]);
  });

  it("never guesses a date: 03/04/26 needs a four digit year", () => {
    const r = applyMapping(table(headings, [["R1", "A", "", "03/04/26", ""]]), m, SHEET, FIELDS);
    if (!r.ok) throw new Error("refused");
    expect(r.value[0]?.errors[0]).toMatchObject({ field: "burialDate", value: "03/04/26", code: "date_year_needed", fix: "use_four_digit_year" });
    expect(r.value[0]?.cells["burialDate"]).toBe("03/04/26");
  });

  it("asks for a date order when the day and month could be either", () => {
    const rows = [["R1", "A", "", "03/04/2026", ""]];
    const without = applyMapping(table(headings, rows), m, SHEET, FIELDS);
    expect(without.ok && without.value[0]?.errors[0]).toMatchObject({ code: "date_ambiguous", fix: "choose_date_order" });
    const dmy = applyMapping(table(headings, rows), m, SHEET, FIELDS, { dateOrder: "dmy" });
    expect(dmy.ok && dmy.value[0]?.errors).toEqual([]);
    const mdy = applyMapping(table(headings, rows), m, SHEET, FIELDS, { dateOrder: "mdy" });
    expect(mdy.ok && mdy.value[0]?.errors).toEqual([]);
  });

  it("refuses an impossible date even with an order", () => {
    const r = applyMapping(table(headings, [["R1", "A", "", "31/02/2026", ""]]), m, SHEET, FIELDS, { dateOrder: "dmy" });
    expect(r.ok && r.value[0]?.errors[0]).toMatchObject({ code: "invalid_date", fix: "use_valid_date" });
  });

  it("accepts a date at each precision, and a blank or unknown one", () => {
    for (const value of ["1874", "1874-03", "1874-03-03", "March 1874", "3 March 1874", "unknown", "Date unknown", ""]) {
      const r = applyMapping(table(headings, [["R1", "A", "", value, ""]]), m, SHEET, FIELDS);
      expect(r.ok && r.value[0]?.errors, value).toEqual([]);
    }
  });

  it("marks text that is too long", () => {
    const r = applyMapping(table(headings, [["R1", "N".repeat(101), "", "", ""]]), m, SHEET, FIELDS);
    expect(r.ok && r.value[0]?.errors[0]).toMatchObject({ field: "name", code: "over_limit", fix: "shorten" });
    const ok100 = applyMapping(table(headings, [["R1", "N".repeat(100), "", "", ""]]), m, SHEET, FIELDS);
    expect(ok100.ok && ok100.value[0]?.errors).toEqual([]);
  });

  it("counts a plot code of 24 characters as good and 25 as too long", () => {
    const good = applyMapping(table(headings, [["R1", "A", "P".repeat(24), "", ""]]), m, SHEET, FIELDS);
    expect(good.ok && good.value[0]?.errors).toEqual([]);
    const bad = applyMapping(table(headings, [["R1", "A", "P".repeat(25), "", ""]]), m, SHEET, FIELDS);
    expect(bad.ok && bad.value[0]?.errors[0]?.code).toBe("over_limit");
  });

  it("treats blank money as unknown, and refuses a bad amount", () => {
    const h = ["Source ref", "Name", "Fee"];
    const mm = mapped(h, ["sourceRef", "name", "fee"]);
    const blank = applyMapping(table(h, [["R1", "A", ""]]), mm, SHEET, FIELDS);
    expect(blank.ok && blank.value[0]?.errors).toEqual([]);
    expect(blank.ok && blank.value[0]?.cells["fee"]).toBe("");
    for (const value of ["12.345", "£12", "-5", "1,000"]) {
      const r = applyMapping(table(h, [["R1", "A", value]]), mm, SHEET, FIELDS);
      expect(r.ok && r.value[0]?.errors[0], value).toMatchObject({ field: "fee", fix: "use_two_decimals" });
    }
    const good = applyMapping(table(h, [["R1", "A", "36.00"]]), mm, SHEET, FIELDS);
    expect(good.ok && good.value[0]?.errors).toEqual([]);
  });

  it("checks a choice and a number", () => {
    const h = ["Source ref", "Name", "Status", "Spaces"];
    const mm = mapped(h, ["sourceRef", "name", "state", "spaces"]);
    const good = applyMapping(table(h, [["R1", "A", "taken", "2"]]), mm, SHEET, FIELDS);
    expect(good.ok && good.value[0]?.errors).toEqual([]);
    const bad = applyMapping(table(h, [["R1", "A", "Half", "two"]]), mm, SHEET, FIELDS);
    if (!bad.ok) throw new Error("refused");
    expect(bad.value[0]?.errors.map((e) => [e.field, e.code, e.fix])).toEqual([
      ["state", "not_a_choice", "use_listed_choice"],
      ["spaces", "not_a_number", "use_digits"],
    ]);
  });

  it("refuses the whole mapping when a required heading is not filled", () => {
    const r = applyMapping(table(["Name"], [["A"]]), mapped(["Name"], ["name"]), SHEET, FIELDS);
    expect(r.ok).toBe(false);
  });

  it("refuses the whole mapping when two columns fill one field", () => {
    const h = ["Source ref", "Name", "Name 2"];
    const r = applyMapping(table(h, [["R1", "A", "B"]]), mapped(h, ["sourceRef", "name", "name"]), SHEET, FIELDS);
    expect(!r.ok && r.error.code).toBe("duplicate_mapping");
  });
});

describe("checking one row again after a fix", () => {
  const headings = { sourceRef: "Source ref", name: "Name", burialDate: "Burial date" };

  it("lists the same errors the table read gives, with the row number it is given", () => {
    const errors = checkCells(117, { sourceRef: "", name: "Quill Fernhollow", burialDate: "03/04/26" }, headings, SHEET, FIELDS);
    expect(errors).toEqual([
      { row: 117, field: "sourceRef", heading: "Source ref", value: "", code: "required", fix: "enter_value" },
      { row: 117, field: "burialDate", heading: "Burial date", value: "03/04/26", code: "date_year_needed", fix: "use_four_digit_year" },
    ]);
  });

  it("is clear once the cells are fixed", () => {
    expect(checkCells(117, { sourceRef: "R117", name: "Quill Fernhollow", burialDate: "1866-09" }, headings, SHEET, FIELDS)).toEqual([]);
  });

  it("applies the date order chosen for the whole import", () => {
    const cells = { sourceRef: "R1", name: "A", burialDate: "03/04/2026" };
    expect(checkCells(1, cells, headings, SHEET, FIELDS)[0]?.code).toBe("date_ambiguous");
    expect(checkCells(1, cells, headings, SHEET, FIELDS, { dateOrder: "dmy" })).toEqual([]);
  });
});

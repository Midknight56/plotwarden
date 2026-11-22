// The Stalls sheet: its fields and headings. Pure. The labels are the column headings of the guide.
import type { FieldDef, SheetDef } from "../../../template/src/adapter";
import { STALLS_SHEET } from "./types";

export const STALL_FIELDS: FieldDef[] = [
  { key: "stallCode", label: "Stall code", type: "text", required: true, maxChars: 24 },
  { key: "frontage", label: "Frontage cm", type: "number", required: true, maxChars: 5 },
];

export const STALLS_SHEET_DEF: SheetDef = {
  name: STALLS_SHEET,
  required: ["Stall code", "Frontage cm"],
};

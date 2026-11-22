// The Burials sheet: its fields and headings. Pure. The labels are the column headings of the guide.
import type { FieldDef, SheetDef } from "../../../template/src/adapter";
import { BURIALS } from "./types";

export const BURIAL_FIELDS: FieldDef[] = [
  { key: "sourceRef", label: "Source ref", type: "text", required: true, maxChars: 100 },
  { key: "recordedName", label: "Recorded name", type: "text", maxChars: 100, aliases: ["Name"] },
  { key: "nameUnknown", label: "Name unknown", type: "text", maxChars: 10 },
  { key: "section", label: "Section", type: "text", maxChars: 100, repeat: "section" },
  { key: "plot", label: "Plot", type: "text", maxChars: 24 },
  { key: "space", label: "Space", type: "text", maxChars: 100 },
  { key: "burialDate", label: "Burial date", type: "date" },
  { key: "page", label: "Page", type: "text", maxChars: 100, repeat: "page" },
];

export const BURIALS_SHEET: SheetDef = {
  name: BURIALS,
  required: ["Source ref"],
  optional: ["Recorded name", "Name unknown", "Section", "Plot", "Space", "Burial date", "Page"],
};

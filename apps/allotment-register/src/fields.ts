// The two sheets of the Allotment Register: their fields and headings. Pure. The labels are the column
// headings of the guide. Fields that two sheets share (the source ref, the contact) are listed once.
import type { FieldDef, SheetDef } from "../../../template/src/adapter";
import { TENANCIES_SHEET, WAITING_SHEET } from "./types";

export const ALL_FIELDS: FieldDef[] = [
  { key: "sourceRef", label: "Source ref", type: "text", required: true, maxChars: 100 },
  { key: "applicant", label: "Applicant", type: "text", maxChars: 100 },
  { key: "contact", label: "Contact details", type: "text", maxChars: 4000 },
  { key: "joinedOn", label: "Joined date", type: "date" },
  { key: "preferredSection", label: "Preferred section", type: "text", maxChars: 100, repeat: "section" },
  { key: "tieOrder", label: "Tie order", type: "number" },
  { key: "plot", label: "Plot", type: "text", maxChars: 24 },
  { key: "holder", label: "Plot holder", type: "text", maxChars: 100 },
  { key: "start", label: "Tenancy begins", type: "date" },
  { key: "end", label: "Tenancy ends", type: "date" },
];

export const WAITING_SHEET_DEF: SheetDef = {
  name: WAITING_SHEET,
  required: ["Source ref", "Applicant", "Joined date"],
  optional: ["Contact details", "Preferred section", "Tie order"],
};

export const TENANCIES_SHEET_DEF: SheetDef = {
  name: TENANCIES_SHEET,
  required: ["Source ref", "Plot", "Plot holder", "Tenancy begins"],
  optional: ["Contact details", "Tenancy ends"],
};
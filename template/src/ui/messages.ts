// Turn an error code into the words of the catalog. No React, no English here: keys only.
import type { CommitError } from "../data/transaction";
import type { DomainError } from "../types";
import { errorText, reasonText } from "./copy";

export type T = (key: string, values?: Readonly<Record<string, string | number>>) => string;

const ITEM_WORDS: Readonly<Record<string, string>> = {
  plotsPerSite: "limitPlots",
  sectionsPerSite: "limitSections",
  gridRows: "limitRows",
  gridColumns: "limitColumns",
  polygonVertices: "limitPoints",
  csvDataRows: "limitRows",
  csvColumns: "limitColumns",
  csvCellChars: "limitCharacters",
  csvBytes: "limitBytes",
  noteChars: "limitCharacters",
  nameChars: "limitCharacters",
  plotCodeChars: "limitCharacters",
  sourceRefChars: "limitCharacters",
  photoBytes: "limitBytes",
  photoMegapixels: "limitThings",
  photosPerRecord: "limitPhotos",
  archiveCompressedBytes: "limitBytes",
  archiveDecodedBytes: "limitBytes",
  archivePhotoBytesPerSite: "limitBytes",
  archiveAttachmentEntries: "limitEntries",
};

export interface MessageContext {
  /** The name of a section from its ID, for "Code {code} is already in {section}." */
  sectionName?: (id: string) => string | undefined;
  /** The section of the plot that owns a code, from that plot's ID. */
  plotSectionName?: (plotId: string) => string | undefined;
  /** What was being drawn, so "too few points" says three or two. */
  shape?: "polygon" | "path";
  /** The label of a field from its key. */
  fieldLabel?: (key: string) => string | undefined;
}

const text = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

function limitMessage(t: T, detail: DomainError["detail"]): string {
  const item = text(detail?.["item"]);
  const word = t(ITEM_WORDS[item] ?? "limitThings");
  const line = t("limitSentence", { item: word, limit: text(detail?.["limit"]) });
  const row = detail?.["row"];
  return row === undefined || row === "" ? line : `${line} ${t("limitRow", { row: text(row) })}`;
}

/** Words for an error from a command, a file or a check. */
export function errorMessage(t: T, error: DomainError, context: MessageContext = {}): string {
  const d = error.detail;
  switch (error.code) {
    case "over_limit":
      return limitMessage(t, d);
    case "code_taken": {
      const section = context.sectionName?.(text(d?.["sectionId"])) ?? context.plotSectionName?.(text(d?.["plotId"]));
      return section === undefined || section === ""
        ? t("conflictCodeNoSection", { code: text(d?.["code"]) })
        : t("keyTaken", { code: text(d?.["code"]), section });
    }
    case "path_crosses":
      return t("pathCrosses", { code: text(d?.["code"]) });
    case "overlap":
      return t("overlapsPlot", { code: text(d?.["code"]), other: text(d?.["other"]) });
    case "outside_section":
      return t("outsideSection", { code: text(d?.["code"]) });
    case "outline_excludes_plot":
      return t("outlineLeavesOut", { codes: text(d?.["codes"]) });
    case "self_crossing":
      return t("crossesItself");
    case "too_few_points":
      return t(context.shape === "path" ? "needTwoPoints" : "needThreePoints");
    case "not_distinct":
      return t("pointRepeated");
    case "zero_area":
      return t("notClosedShape");
    case "bad_coordinate":
      return t("pointOutOfRange");
    case "plot_exists":
      return t("plotExists", { code: text(d?.["code"]) });
    case "section_name_taken":
      return t("sectionNameTaken", { name: text(d?.["name"]) });
    case "out_of_bounds":
      return t("gridOutOfBounds", { code: text(d?.["code"]) });
    case "bad_skip":
      return t("badSkip", { item: text(d?.["item"]) });
    case "bad_value":
      return t("badNumber", { field: text(d?.["item"]) });
    case "backdrop_locked":
      return t("imageLocked");
    case "nothing_to_apply":
      return t("nothingNewToAdd");
    case "taken_needs_correction":
      return t("correctAnEntry");
    case "invalid_input": {
      const first = error.fields?.[0];
      if (first === undefined) return t("reason_invalid_input");
      const label = context.fieldLabel?.(first.field) ?? first.field;
      return first.code === "required" ? t("enterField", { field: label }) : t("checkField", { field: label, n: 1, reason: reasonText(first.code) });
    }
    default: {
      const known = errorText(error.code, Object.fromEntries(Object.entries(d ?? {}).map(([k, v]) => [k, text(v)])));
      return known ?? reasonText(error.code);
    }
  }
}

/** Words for a commit that did not complete. */
export function commitMessage(t: T, error: CommitError): string {
  switch (error.code) {
    case "stale_revision":
      return errorText("stale_revision") ?? "";
    case "op_conflict":
      return errorText("op_conflict") ?? "";
    case "key_taken": {
      const key = error.key ?? "";
      if (key.startsWith("source:")) return t("reason_duplicate_source_ref");
      const code = key.startsWith("code:") ? key.slice(5) : key;
      return error.label === undefined || error.label === ""
        ? t("conflictCodeNoSection", { code })
        : t("keyTaken", { code, section: error.label });
    }
    case "storage_abort":
      return errorText("storage_abort") ?? "";
    case "quota":
      return errorText("quota") ?? "";
    case "over_limit":
      return t("limitSentence", { item: t("limitThings"), limit: "100000" });
    case "site_missing":
      return t("siteOpenFailed");
    case "empty_batch":
      return t("nothingNewToAdd");
  }
  return t("reason_unknown");
}

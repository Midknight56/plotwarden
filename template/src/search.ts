// Ranked search over plot and record entries, scoped to one site. Pure.
// Folding for names ignores case and accents. The hit keeps the stored spelling.
import { normalizeCode } from "./plot";
import type { Uuid } from "./types";

export interface SearchName {
  recordId: Uuid;
  display: string;
  /** An unknown name is found by code and source ref, never by its words. */
  nameUnknown?: boolean;
  sourceRef?: string;
  /** Source and date, as shown beside the name. */
  source?: string;
  date?: string;
}

export interface SearchEntry {
  siteId: Uuid;
  plotId: Uuid;
  code: string;
  priorCodes: string[];
  names: SearchName[];
}

export interface SearchHit {
  /** 1 exact code, 2 exact prior code, 3 exact source ref, 4 name. */
  rank: 1 | 2 | 3 | 4;
  via: "code" | "priorCode" | "sourceRef" | "name";
  siteId: Uuid;
  plotId: Uuid;
  /** The current code of the plot. */
  code: string;
  /** The stored text that matched, in its original spelling. */
  matchedText: string;
  recordId?: Uuid;
  display?: string;
  source?: string;
  date?: string;
}

/** Lower case, accents removed, single spaces. For matching only. */
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function recordFields(name: SearchName): Pick<SearchHit, "recordId" | "display" | "source" | "date"> {
  const fields: Pick<SearchHit, "recordId" | "display" | "source" | "date"> = {
    recordId: name.recordId,
    display: name.display,
  };
  if (name.source !== undefined) fields.source = name.source;
  if (name.date !== undefined) fields.date = name.date;
  return fields;
}

/** Search one site. Another site's entries are never read. */
export function search(entries: readonly SearchEntry[], siteId: Uuid, query: string, limit?: number): SearchHit[] {
  const codeQuery = normalizeCode(query);
  const words = foldText(query).split(" ").filter((w) => w !== "");
  if (codeQuery === "") return [];
  const sourceQuery = foldText(query);

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    if (entry.siteId !== siteId) continue;
    const base = { siteId: entry.siteId, plotId: entry.plotId, code: entry.code };

    if (normalizeCode(entry.code) === codeQuery) {
      hits.push({ ...base, rank: 1, via: "code", matchedText: entry.code });
    }
    const prior = entry.priorCodes.find((p) => normalizeCode(p) === codeQuery);
    if (prior !== undefined && normalizeCode(entry.code) !== codeQuery) {
      hits.push({ ...base, rank: 2, via: "priorCode", matchedText: prior });
    }
    for (const name of entry.names) {
      if (name.sourceRef !== undefined && foldText(name.sourceRef) === sourceQuery) {
        hits.push({ ...base, rank: 3, via: "sourceRef", matchedText: name.sourceRef, ...recordFields(name) });
      }
      if (name.nameUnknown !== true) {
        const folded = foldText(name.display);
        if (words.every((w) => folded.includes(w))) {
          hits.push({ ...base, rank: 4, via: "name", matchedText: name.display, ...recordFields(name) });
        }
      }
    }
  }

  hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const ca = foldText(a.code);
    const cb = foldText(b.code);
    if (ca !== cb) return ca < cb ? -1 : 1;
    const da = foldText(a.display ?? "");
    const db = foldText(b.display ?? "");
    if (da !== db) return da < db ? -1 : 1;
    const ra = a.recordId ?? "";
    const rb = b.recordId ?? "";
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
  return limit === undefined ? hits : hits.slice(0, limit);
}

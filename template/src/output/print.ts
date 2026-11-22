// Print documents. Each one is a separate document built from its own object, never from the screen:
// the family print from the visitor object alone, the private report from a plain table model.
// Black, white and grays only, so a page stays legible in grayscale. No script.
import { WALK_BAND, escapeHtml, familyMapSvg, fillWords, plotsOfSection } from "./familyMap";
import { availabilityMapSvg, freePlotsOfSection } from "./availabilityMap";
import { checkAvailabilityWords } from "./availabilityHtml";
import type { AvailabilityWords } from "./availabilityHtml";
import type { AvailabilityFile, FamilyFile } from "./privacy";
import { checkWords } from "./visitorHtml";
import type { FamilyWords } from "./visitorHtml";

export interface PrintOptions {
  paper: "A4" | "Letter";
  orientation: "portrait" | "landscape";
}

export interface ReportTable {
  title: string;
  subtitle: string;
  scope: string[];
  totals: { label: string; value: string }[];
  sections: { heading: string; columns: string[]; rows: string[][]; emptyText: string }[];
  footer: string;
}

/** A map with more plots than this splits into an overview and numbered section sheets. */
export const DENSE_PLOT_LIMIT = 60;

const page = (o: PrintOptions): string => `@page{size:${o.paper} ${o.orientation};margin:12mm}`;

const BASE_CSS = `*{box-sizing:border-box}
html{background:#fff;color:#000;font:12pt/1.45 system-ui,"Segoe UI",Arial,sans-serif}
body{margin:0}
h1{font-size:22pt;margin:0 0 4pt}h2{font-size:15pt;margin:14pt 0 6pt}h3{font-size:12pt;margin:10pt 0 4pt}
p,ul,ol{margin:0 0 6pt}
ul.plain,ol.plain{list-style:none;padding:0}
table{width:100%;border-collapse:collapse;font-size:11pt}
th,td{border:1px solid #444;padding:4pt 6pt;text-align:left;vertical-align:top}
th{background:#ddd}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
.map{display:block;width:100%;max-width:170mm;height:auto;border:1.5px solid #000}
.map text{fill:#000}
.arch{fill:#fff;stroke:#000;stroke-width:2}
.arch-inner{fill:none;stroke:#444;stroke-width:1}
.section{fill:none;stroke:#888;stroke-width:1.5;stroke-dasharray:8 4}
.outline{fill:none;stroke:#666;stroke-width:1}
.walk,.walk-sample{fill:none;stroke:#bbb;stroke-width:${WALK_BAND};stroke-linecap:round}
.walk-line,.walk-line-sample{fill:none;stroke:#000;stroke-width:1.5;stroke-dasharray:1 6;stroke-linecap:round}
.section-sample{stroke:#888;stroke-width:1.5;stroke-dasharray:8 4}
.gate,.gate-sample{fill:#000;stroke:#000}
.north{fill:#000}
.sel-outer{fill:none;stroke:#fff;stroke-width:7}
.sel-inner{fill:none;stroke:#000;stroke-width:3}
.tab{fill:#ddd;stroke:#000;stroke-width:2}
.tab-text{font-weight:700}
.bed{fill:#fff;stroke:#000;stroke-width:2}
.hatch{fill:none;stroke:#444;stroke-width:1.25}
.peg{fill:#fff;stroke:#000;stroke-width:1.5}
.ground{fill:none;stroke:#888;stroke-width:1}
.sheet{break-inside:avoid}
.note{font-size:10pt;color:#444}`;

function document_(title: string, options: PrintOptions, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${page(options)}${BASE_CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function buildFamilyPrint(file: FamilyFile, words: FamilyWords, options: PrintOptions): string {
  checkWords(words);
  const asAt = fillWords(words.asAt, { date: file.asOf });
  const sectionLabel = (plotId: string): string => file.sections.find((s) => s.id === file.plots.find((p) => p.id === plotId)?.sectionId)?.label ?? "";
  const codeOf = (plotId: string): string => file.plots.find((p) => p.id === plotId)?.code ?? "";
  const directions = [...new Set(file.burials.map((b) => b.directions).filter((d): d is string => d !== undefined))];

  const head = `<header><h1>${escapeHtml(file.siteTitle)}</h1><p>${escapeHtml(words.pageTitle)} · ${escapeHtml(asAt)}</p></header>`;
  const entrance = `<section><h2>${escapeHtml(words.entrance)}</h2><p>${escapeHtml(file.gate.name)}</p>${
    directions.length === 0 ? "" : `<h3>${escapeHtml(words.directions)}</h3>${directions.map((d) => `<p>${escapeHtml(d)}</p>`).join("")}`
  }</section>`;
  const index =
    file.burials.length === 0
      ? `<section><p>${escapeHtml(words.noNames)}</p></section>`
      : `<section><h2>${escapeHtml(words.burials)}</h2><table><thead><tr><th>${escapeHtml(words.findBurial)}</th><th>${escapeHtml(words.plot)}</th><th>${escapeHtml(words.section)}</th></tr></thead><tbody>${file.burials
          .map((b) => `<tr><td>${escapeHtml(b.name)}${b.year === undefined ? "" : ` · ${b.year}`}${b.line === undefined ? "" : `<br><span class="note">${escapeHtml(b.line)}</span>`}</td><td>${escapeHtml(codeOf(b.plotId))}</td><td>${escapeHtml(sectionLabel(b.plotId))}</td></tr>`)
          .join("")}</tbody></table></section>`;

  const dense = file.plots.length > DENSE_PLOT_LIMIT;
  let maps: string;
  if (!dense) {
    maps = `<section class="sheet" data-sheet="overview"><h2>${escapeHtml(words.mapLabel)}</h2>${familyMapSvg(file, { width: 640, label: words.mapLabel, allTabs: true })}</section>`;
  } else {
    const sections = file.sections.filter((s) => plotsOfSection(file, s.id).length > 0);
    const total = sections.length;
    const overview = `<section class="sheet" data-sheet="overview" style="break-after:page"><h2>${escapeHtml(words.mapLabel)}</h2>${familyMapSvg(file, { width: 640, label: words.mapLabel, sectionBoxes: true })}<h3>${escapeHtml(words.sections)}</h3><ol class="plain">${sections
      .map((s, i) => `<li>${escapeHtml(s.label)} · ${escapeHtml(fillWords(words.sheet, { n: i + 1, total }))}</li>`)
      .join("")}</ol></section>`;
    const sheets = sections
      .map((s, i) => {
        const ids = new Set(plotsOfSection(file, s.id).map((p) => p.id));
        const last = i === sections.length - 1;
        return `<section class="sheet" data-sheet="section" style="${last ? "" : "break-after:page"}"><h2>${escapeHtml(s.label)}</h2><p>${escapeHtml(fillWords(words.sheet, { n: i + 1, total }))}</p>${familyMapSvg(file, { width: 640, label: s.label, plotIds: ids, context: false, allTabs: true })}</section>`;
      })
      .join("");
    maps = overview + sheets;
  }
  return document_(`${file.siteTitle} · ${words.pageTitle}`, options, `${head}${entrance}${index}${maps}`);
}

export function buildReportPrint(table: ReportTable, options: PrintOptions): string {
  const totals =
    table.totals.length === 0
      ? ""
      : `<table><tbody>${table.totals.map((t) => `<tr><th>${escapeHtml(t.label)}</th><td>${escapeHtml(t.value)}</td></tr>`).join("")}</tbody></table>`;
  const sections = table.sections
    .map((s) =>
      s.rows.length === 0
        ? `<section><h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.emptyText)}</p></section>`
        : `<section><h2>${escapeHtml(s.heading)}</h2><table><thead><tr>${s.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${s.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table></section>`,
    )
    .join("");
  const body = `<header><h1>${escapeHtml(table.title)}</h1><p>${escapeHtml(table.subtitle)}</p>${table.scope.map((s) => `<p>${escapeHtml(s)}</p>`).join("")}</header>${totals}${sections}<footer><p class="note">${escapeHtml(table.footer)}</p></footer>`;
  return document_(table.title, options, body);
}

/** The availability print: its own document, built from the availability object alone. */
export function buildAvailabilityPrint(file: AvailabilityFile, words: AvailabilityWords, options: PrintOptions): string {
  checkAvailabilityWords(words);
  const asAt = fillWords(words.asAt, { date: file.asOf });
  const sectionLabel = (sectionId: string): string => file.sections.find((s) => s.id === sectionId)?.label ?? "";

  const head = `<header><h1>${escapeHtml(file.siteTitle)}</h1><p>${escapeHtml(words.pageTitle)} · ${escapeHtml(asAt)}</p></header>`;
  const entrance = `<section><h2>${escapeHtml(words.entrance)}</h2><p>${escapeHtml(file.gate.name)}</p></section>`;
  const ask = `<section><h2>${escapeHtml(words.askSecretary)}</h2>${file.instructions === "" ? "" : `<p>${escapeHtml(file.instructions)}</p>`}</section>`;
  const index =
    file.freePlots.length === 0
      ? `<section><h2>${escapeHtml(words.availablePlots)}</h2><p>${escapeHtml(words.noPlots)}</p></section>`
      : `<section><h2>${escapeHtml(words.availablePlots)}</h2><table><thead><tr><th>${escapeHtml(words.plot)}</th><th>${escapeHtml(words.section)}</th></tr></thead><tbody>${file.freePlots
          .map((p) => `<tr><td>${escapeHtml(p.code)}</td><td>${escapeHtml(sectionLabel(p.sectionId))}</td></tr>`)
          .join("")}</tbody></table></section>`;

  const dense = file.freePlots.length + file.neutralGround.length > DENSE_PLOT_LIMIT;
  let maps: string;
  if (!dense) {
    maps = `<section class="sheet" data-sheet="overview"><h2>${escapeHtml(words.mapLabel)}</h2>${availabilityMapSvg(file, { width: 640, label: words.mapLabel })}</section>`;
  } else {
    const sections = file.sections.filter((s) => freePlotsOfSection(file, s.id).length > 0);
    const total = sections.length;
    const overview = `<section class="sheet" data-sheet="overview" style="break-after:page"><h2>${escapeHtml(words.mapLabel)}</h2>${availabilityMapSvg(file, { width: 640, label: words.mapLabel, labels: false, sectionBoxes: true })}<h3>${escapeHtml(words.sections)}</h3><ol class="plain">${sections
      .map((s, i) => `<li>${escapeHtml(s.label)} · ${escapeHtml(fillWords(words.sheet, { n: i + 1, total }))}</li>`)
      .join("")}</ol></section>`;
    const sheets = sections
      .map((s, i) => {
        const ids = new Set(freePlotsOfSection(file, s.id).map((p) => p.id));
        const last = i === sections.length - 1;
        return `<section class="sheet" data-sheet="section" style="${last ? "" : "break-after:page"}"><h2>${escapeHtml(s.label)}</h2><p>${escapeHtml(fillWords(words.sheet, { n: i + 1, total }))}</p>${availabilityMapSvg(file, { width: 640, label: s.label, plotIds: ids, context: false })}</section>`;
      })
      .join("");
    maps = overview + sheets;
  }
  return document_(`${file.siteTitle} · ${words.pageTitle}`, options, `${head}${entrance}${ask}${index}${maps}`);
}
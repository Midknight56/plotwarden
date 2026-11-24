// The map of a family file, drawn from its public geometry alone. Pure text: it builds SVG as a string.
// It imports only the visitor types and the label rules of `map/labels.ts`. Text is drawn at real pixel size, so a
// drawing that is shown at its own width keeps its sizes: every word 11 to 15 px, a tab 24 high with its code at
// 14 px bold. A page that shows the drawing wider than it was made would stretch them, so a visitor file holds two
// drawings, one made at 320 and one at 640, and shows the one that fits its frame (spec 07, L9.7). Colours come from
// the page that holds the drawing, by class name.
//
// What goes where (spec 03, C5.12 and spec 07, L9.4 to L9.6):
//  - A plot code is never written beside its plot. It is written on a tab, and a tab is drawn for the selected plot.
//  - A name (the gate, a path, a section) takes the first clear place: inside the drawing, off the walk band, off every
//    plot and outline, off the north arrow, the gate mark and every earlier name. A name with no clear place is written
//    under the drawing, beside a small sample of its mark, as the field sheet does. A visitor file sets `namesToLegend`:
//    its legend joins the bottom of the map and names the gate and each walk, so a name with no clear place is left to
//    the legend and the drawing writes no row and no sample under itself. A name with a clear place stays in the
//    drawing, so a site with more than one walk still shows which walk is which.
//  - A tab touches its plot. Its bottom edge meets the top of the plot's outline (within 2 px), centred on the plot.
//    It no longer stands off the plot. When that place would cover the walk band, the gate, the north arrow, a name,
//    another plot or the edge of the drawing, the tab touches the bottom edge of its plot instead, centred, and the
//    drawing grows to hold it. Only when neither place is clear does it take another place (`placeTab`). Tabs that all
//    show at once (a print of the whole map) also keep off every other tab.
import { CAPTION_COST, SHEET_MARGIN, TAB_HEIGHT, TAB_TEXT_SIZE, TAB_WALK_CLEAR, bestSpot, placeTab, spotsAlongLine, spotsAlongTop, spotsAround, tabWidth, textWidth } from "../map/labels";
import type { Box, Scene, Spot } from "../map/labels";
import type { FamilyFile, Point, PublicPlot } from "./privacy";

/** How wide a walk is drawn, in pixels. The page and the print draw `.walk` with this stroke. */
export const WALK_BAND = 12;

export interface MapOptions {
  /** The drawing width in CSS pixels. */
  width: number;
  /** The label of the drawing, for a screen reader. */
  label: string;
  /** Only these public plot IDs are drawn, and no plain outlines. All of them when absent. */
  plotIds?: ReadonlySet<string>;
  /** The plot whose tab is drawn, with a double outline. */
  selectedPlotId?: string;
  /** Draw the tab of every plot, for a print of the whole map. */
  allTabs?: boolean;
  /** Draw the gate, the paths, the section outlines and the north arrow. Default true. */
  context?: boolean;
  /** Draw a labelled box round the plots of each section. For a dense overview. */
  sectionBoxes?: boolean;
  /** Give each plot a group and a tab that a script can show. */
  selectable?: boolean;
  /**
   * Leave a name with no clear place to the legend that joins the map in a visitor file: write no row and no sample
   * under the drawing. Default false, as the register's own prints keep their rows.
   */
  namesToLegend?: boolean;
  /** Keep every tab off every other tab, for tabs that show together. Default: the same as `allTabs`. */
  tabsApart?: boolean;
  /** Which of the two drawings of a visitor file this is. Written as `data-view`, for the page to show one at a time. */
  view?: "narrow" | "wide";
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** JSON for a script block. It cannot close the block, and it is safe in every script parser. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * The legend that joins the bottom of the map in a visitor file: the gate, then each walk, each beside a sample of its
 * mark. The names are the public names of the file, never a catalog word. The marks are drawn by the page's own style.
 */
export function legendHtml(gateName: string, pathNames: readonly string[]): string {
  const walks = [...new Set(pathNames)].map((name) => `<li><span class="key-walk"></span>${escapeHtml(name)}</li>`).join("");
  return `<ul class="legend"><li><span class="key-gate"></span>${escapeHtml(gateName)}</li>${walks}</ul>`;
}

/** Put each value in once. A missing value throws, so a missing word never reaches a page. */
export function fillWords(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`No value for {${key}}`);
    return String(value);
  });
}

const num = (n: number): string => String(Math.round(n * 10) / 10);

function boundsOf(points: readonly Point[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/** The plots of a section, by public section ID. */
export function plotsOfSection(file: FamilyFile, sectionId: string): PublicPlot[] {
  return file.plots.filter((p) => p.sectionId === sectionId);
}

/** A small arch for one plot, drawn inside its box: a rounded top and a flat base. */
function arch(x0: number, y0: number, x1: number, y1: number): string {
  const r = (x1 - x0) / 2;
  return `M${num(x0)} ${num(y1)}L${num(x0)} ${num(y0 + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x1)} ${num(y0 + r)}L${num(x1)} ${num(y1)}Z`;
}

const PAD_X = 24;
/** The band at the top holds the north arrow and the tab of a plot in the top row. */
const PAD_TOP = 64;
const PAD_BOTTOM = 24;
const LABEL_SIZE = 12;
/** How far a name keeps from the middle of a walk: half the band and a margin. */
const NAME_CLEAR = WALK_BAND / 2 + 4;
/** The line height of a name written under the drawing, and where its text starts after the sample of its mark. */
const CAPTION_LINE = 18;
const CAPTION_TEXT_X = SHEET_MARGIN + 36;
/** How far the outline of a section is kept from, and how much that matters next to a walk. */
const OUTLINE_CLEAR = 3;
const OUTLINE_WEIGHT = 0.5;

interface Caption {
  mark: "gate" | "path" | "section";
  lines: string[];
}

/** Break a name into lines that fit a width. A word longer than a line stays whole and is the widest line. */
function wrap(text: string, limit: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && textWidth(next, LABEL_SIZE) > limit) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== "") lines.push(line);
  return lines.length === 0 ? [text] : lines;
}

export function familyMapSvg(file: FamilyFile, options: MapOptions): string {
  const context = options.context !== false;
  const plots = file.plots.filter((p) => options.plotIds === undefined || options.plotIds.has(p.id));
  const drawn = plots.filter((p) => p.outline !== undefined && p.outline.length >= 3);
  const plain = options.plotIds === undefined ? (file.outlines ?? []) : [];

  const cloud: Point[] = [];
  for (const p of drawn) cloud.push(...(p.outline as Point[]));
  for (const o of plain) cloud.push(...o);
  if (context) {
    cloud.push([file.gate.x, file.gate.y]);
    for (const path of file.paths) cloud.push(...path.points);
    for (const s of file.sections) if (s.outline !== undefined) cloud.push(...s.outline);
  }
  if (cloud.length === 0) return "";

  const width = options.width;
  const { minX, maxX, minY, maxY } = boundsOf(cloud);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  let scale = (width - 2 * PAD_X) / spanX;
  scale = Math.min(scale, (width * 1.5 - PAD_TOP - PAD_BOTTOM) / spanY);
  const height = Math.max(120, spanY * scale + PAD_TOP + PAD_BOTTOM);
  const X = (x: number): number => PAD_X + (x - minX) * scale;
  const Y = (y: number): number => PAD_TOP + (maxY - y) * scale;
  const pts = (points: readonly Point[]): string => points.map((p) => `${num(X(p[0]))},${num(Y(p[1]))}`).join(" ");
  const screen = (points: readonly Point[]): [number, number][] => points.map((p) => [X(p[0]), Y(p[1])]);

  // The plots as they are drawn, in screen pixels. An arch is at least 18 by 22 px.
  const arches = drawn.map((plot) => {
    const b = boundsOf(plot.outline as Point[]);
    const cx = (X(b.minX) + X(b.maxX)) / 2;
    const w = Math.max(18, (b.maxX - b.minX) * scale);
    const h = Math.max(22, (b.maxY - b.minY) * scale);
    const y1 = Y(b.minY);
    return { plot, cx, x0: cx - w / 2, x1: cx + w / 2, y0: y1 - h, y1 };
  });
  const plainBoxes: Box[] = plain.map((o) => {
    const b = boundsOf(o);
    return { x0: X(b.minX), y0: Y(b.maxY), x1: X(b.maxX), y1: Y(b.minY) };
  });
  const archBoxes: Box[] = arches.map((a) => ({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 }));
  const plotBoxes = [...plainBoxes, ...archBoxes];

  // Fixed things first, then the names, then the tabs, so each keeps clear of what came before it.
  const northAt = { x: width - 24, y: 26 };
  const hard: Scene["hard"] = [{ box: { x0: northAt.x - 14, y0: 8, x1: northAt.x + 14, y1: 56 }, gap: 4 }];
  const gx = X(file.gate.x);
  const gy = Y(file.gate.y);
  if (context) hard.push({ box: { x0: gx - 6, y0: gy - 6, x1: gx + 6, y1: gy + 6 }, gap: 4 });
  const walkLines = context ? file.paths.map((p) => screen(p.points)) : [];
  const walks = (): Scene["lines"] => walkLines.map((points) => ({ points, clear: NAME_CLEAR }));
  const outlinedSections = context ? file.sections.filter((s) => s.outline !== undefined) : [];
  const outlineLines = (except?: string): Scene["lines"] =>
    outlinedSections
      .filter((s) => s.id !== except)
      .map((s) => {
        const points = screen(s.outline as Point[]);
        return { points: points.length > 0 ? [...points, points[0] as [number, number]] : points, clear: OUTLINE_CLEAR, weight: OUTLINE_WEIGHT };
      });
  const sceneOf = (lines: Scene["lines"]): Scene => ({ width, height, hard, lines, soft: [], plots: plotBoxes });

  const captions: Caption[] = [];
  const named: { text: string; spot: Spot }[] = [];
  /** Place a name in the first clear spot, or write it under the drawing. */
  const place = (text: string, mark: Caption["mark"], spots: Spot[], lines: Scene["lines"]): void => {
    const best = bestSpot(text, LABEL_SIZE, spots, sceneOf(lines));
    if (best.cost >= CAPTION_COST) {
      if (options.namesToLegend !== true) captions.push({ mark, lines: wrap(text, width - CAPTION_TEXT_X - SHEET_MARGIN) });
      return;
    }
    hard.push({ box: best.box, gap: 2 });
    named.push({ text, spot: best.spot });
  };

  const boxRects: { x: number; y: number; width: number; height: number }[] = [];
  if (context) {
    place(file.gate.name, "gate", spotsAround(gx, gy), [...walks(), ...outlineLines()]);
    for (const section of outlinedSections) {
      const b = boundsOf(section.outline as Point[]);
      const box = { x: X(b.minX), y: Y(b.maxY), width: (b.maxX - b.minX) * scale, height: (b.maxY - b.minY) * scale };
      place(section.label, "section", spotsAlongTop(box, section.label, LABEL_SIZE, [4, 7]), [...walks(), ...outlineLines(section.id)]);
    }
    // A walk named like a section that is written on the map is not written twice.
    const written = new Set(outlinedSections.map((s) => s.label));
    for (const path of file.paths) {
      if (written.has(path.name)) continue;
      place(path.name, "path", spotsAlongLine(screen(path.points)), [...walks(), ...outlineLines()]);
    }
  }
  if (options.sectionBoxes === true) {
    for (const section of file.sections) {
      const members = arches.filter((a) => a.plot.sectionId === section.id);
      if (members.length === 0) continue;
      const x0 = Math.min(...members.map((m) => m.x0)) - 6;
      const x1 = Math.max(...members.map((m) => m.x1)) + 6;
      const y0 = Math.min(...members.map((m) => m.y0)) - 6;
      const y1 = Math.max(...members.map((m) => m.y1)) + 6;
      boxRects.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      place(section.label, "section", spotsAlongTop({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, section.label, LABEL_SIZE, [4, 7]), walks());
    }
  }

  // Tabs. The selected plot always has one. The others have one for a script to show, or for a print of the whole map.
  const selectedId = options.selectedPlotId;
  const showAll = options.allTabs === true;
  const tabbed = arches.filter((a) => a.plot.id === selectedId || showAll || options.selectable === true);
  const tabs = new Map<string, { x: number; y: number; width: number; height: number }>();
  const apart = options.tabsApart ?? showAll;
  const tabHard: Scene["hard"] = [...hard];
  const tabLines: Scene["lines"] = walkLines.map((points) => ({ points, clear: TAB_WALK_CLEAR }));
  for (const a of tabbed) {
    const own = archBoxes[arches.indexOf(a)] as Box;
    const spot = placeTab(own, tabWidth(a.plot.code), { width, height, hard: tabHard, lines: tabLines, soft: [], plots: plotBoxes.filter((b) => b !== own) });
    const { box } = spot;
    tabs.set(a.plot.id, { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: TAB_HEIGHT });
    if (apart) tabHard.push({ box, gap: 4 });
  }
  const tabEnd = Math.max(0, ...[...tabs.values()].map((t) => t.y + t.height + SHEET_MARGIN));
  const body = Math.max(height, tabEnd);

  // The names that found no clear place, one to a line under the drawing, each beside a sample of its mark.
  const captionRows = captions.reduce((sum, c) => sum + c.lines.length, 0);
  const total = captionRows === 0 ? body : body + SHEET_MARGIN + captionRows * CAPTION_LINE + SHEET_MARGIN;

  const out: string[] = [];
  out.push(
    `<svg class="map"${options.view === undefined ? "" : ` data-view="${options.view}"`} viewBox="0 0 ${num(width)} ${num(total)}" width="${num(width)}" height="${num(total)}" role="img" aria-label="${escapeHtml(options.label)}" font-family="system-ui, Arial, sans-serif">`,
  );

  for (const o of plain) out.push(`<polygon class="outline" points="${pts(o)}"/>`);
  if (context) {
    for (const section of outlinedSections) out.push(`<polygon class="section" points="${pts(section.outline as Point[])}"/>`);
    for (const path of file.paths) {
      out.push(`<polyline class="walk" points="${pts(path.points)}"/>`);
      out.push(`<polyline class="walk-line" points="${pts(path.points)}"/>`);
    }
  }
  if (options.sectionBoxes === true) {
    for (const r of boxRects) {
      out.push(`<rect class="section" x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}"/>`);
    }
  }

  for (const a of arches) {
    const { plot } = a;
    const selected = selectedId === plot.id;
    const group = options.selectable === true ? ` class="plotg" data-plot="${escapeHtml(plot.id)}"` : "";
    out.push(`<g${group}>`);
    out.push(`<path class="arch" d="${arch(a.x0, a.y0, a.x1, a.y1)}"/>`);
    out.push(`<path class="arch-inner" d="${arch(a.x0 + 3, a.y0 + 3, a.x1 - 3, a.y1 - 1)}"/>`);
    if (selected || options.selectable === true) {
      out.push(`<g${selected ? "" : ` class="selring"`}><path class="sel-outer" d="${arch(a.x0 - 3, a.y0 - 3, a.x1 + 3, a.y1 + 3)}"/><path class="sel-inner" d="${arch(a.x0 - 1, a.y0 - 1, a.x1 + 1, a.y1 + 1)}"/></g>`);
    }
    const tab = tabs.get(plot.id);
    if (tab !== undefined) {
      const shown = selected || showAll;
      out.push(
        `<g${shown ? "" : ` class="selbits"`}><rect class="tab" x="${num(tab.x)}" y="${num(tab.y)}" width="${num(tab.width)}" height="${num(tab.height)}"/><text class="tab-text" x="${num(tab.x + tab.width / 2)}" y="${num(tab.y + 17)}" font-size="${TAB_TEXT_SIZE}" text-anchor="middle">${escapeHtml(plot.code)}</text></g>`,
      );
    }
    out.push("</g>");
  }

  if (context) {
    out.push(`<rect class="gate" x="${num(gx - 6)}" y="${num(gy - 6)}" width="12" height="12"/>`);
    out.push(`<g class="north" transform="translate(${num(northAt.x)} ${num(northAt.y)}) rotate(${file.north})"><path d="M0 -14L6 8L0 3L-6 8Z"/></g>`);
    out.push(`<text x="${num(northAt.x)}" y="50" font-size="12" text-anchor="middle">N</text>`);
  }
  for (const { text, spot } of named) {
    out.push(`<text x="${num(spot.x)}" y="${num(spot.y)}" font-size="${LABEL_SIZE}" text-anchor="${spot.anchor}">${escapeHtml(text)}</text>`);
  }
  let row = 0;
  for (const caption of captions) {
    caption.lines.forEach((line, i) => {
      const baseline = body + SHEET_MARGIN + LABEL_SIZE + row * CAPTION_LINE;
      row += 1;
      if (i === 0) out.push(sample(caption.mark, baseline));
      out.push(`<text x="${CAPTION_TEXT_X}" y="${num(baseline)}" font-size="${LABEL_SIZE}">${escapeHtml(line)}</text>`);
    });
  }
  out.push("</svg>");
  return out.join("");
}

/** A small copy of the mark that a caption names, on the baseline of its first line. */
function sample(mark: Caption["mark"], baseline: number): string {
  const mid = baseline - 4;
  const x0 = SHEET_MARGIN;
  const x1 = SHEET_MARGIN + 24;
  if (mark === "gate") return `<rect class="gate-sample" x="${num(x0 + 6)}" y="${num(mid - 6)}" width="12" height="12"/>`;
  if (mark === "path") return `<polyline class="walk-sample" points="${num(x0 + 6)},${num(mid)} ${num(x1 - 6)},${num(mid)}"/><polyline class="walk-line-sample" points="${num(x0 + 6)},${num(mid)} ${num(x1 - 6)},${num(mid)}"/>`;
  return `<polyline class="section-sample" points="${num(x0)},${num(mid)} ${num(x1)},${num(mid)}"/>`;
}

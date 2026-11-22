// The map of a family file, drawn from its public geometry alone. Pure text: it builds SVG as a string.
// It imports only the visitor types. Text is drawn at real pixel size, so a drawing that is shown at its
// own width keeps 12 px labels. Colours come from the page that holds the drawing, by class name.
import type { FamilyFile, Point, PublicPlot } from "./privacy";

export interface MapOptions {
  /** The drawing width in CSS pixels. */
  width: number;
  /** The label of the drawing, for a screen reader. */
  label: string;
  /** Only these public plot IDs are drawn. All of them when absent. */
  plotIds?: ReadonlySet<string>;
  selectedPlotId?: string;
  /** Write each plot's code beside it. Default true. */
  labels?: boolean;
  /** Draw the gate, the paths, the section outlines and the north arrow. Default true. */
  context?: boolean;
  /** Draw a labelled box round the plots of each section. For a dense overview. */
  sectionBoxes?: boolean;
  /** Give each plot a group that a script can select. */
  selectable?: boolean;
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

export function familyMapSvg(file: FamilyFile, options: MapOptions): string {
  const context = options.context !== false;
  const labels = options.labels !== false;
  const plots = file.plots.filter((p) => options.plotIds === undefined || options.plotIds.has(p.id));
  const drawn = plots.filter((p) => p.outline !== undefined && p.outline.length >= 3);

  const cloud: Point[] = [];
  for (const p of drawn) cloud.push(...(p.outline as Point[]));
  if (context) {
    cloud.push([file.gate.x, file.gate.y]);
    for (const path of file.paths) cloud.push(...path.points);
    for (const s of file.sections) if (s.outline !== undefined) cloud.push(...s.outline);
  }
  if (cloud.length === 0) return "";

  const width = options.width;
  const pad = 36;
  const { minX, maxX, minY, maxY } = boundsOf(cloud);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  let scale = (width - 2 * pad) / spanX;
  scale = Math.min(scale, (width * 1.5 - 2 * pad) / spanY);
  const height = Math.max(120, spanY * scale + 2 * pad);
  const X = (x: number): number => pad + (x - minX) * scale;
  const Y = (y: number): number => pad + (maxY - y) * scale;
  const pts = (points: readonly Point[]): string => points.map((p) => `${num(X(p[0]))},${num(Y(p[1]))}`).join(" ");

  const out: string[] = [];
  out.push(
    `<svg class="map" viewBox="0 0 ${num(width)} ${num(height)}" width="${num(width)}" height="${num(height)}" role="img" aria-label="${escapeHtml(options.label)}" font-family="system-ui, Arial, sans-serif">`,
  );

  if (context) {
    for (const section of file.sections) {
      if (section.outline === undefined) continue;
      const box = boundsOf(section.outline);
      out.push(`<polygon class="section" points="${pts(section.outline)}"/>`);
      out.push(`<text class="small" x="${num(X(box.minX) + 4)}" y="${num(Y(box.maxY) - 6)}" font-size="12">${escapeHtml(section.label)}</text>`);
    }
    for (const path of file.paths) {
      out.push(`<polyline class="walk" points="${pts(path.points)}"/>`);
      out.push(`<polyline class="walk-line" points="${pts(path.points)}"/>`);
      const mid = path.points[Math.floor(path.points.length / 2)] as Point;
      out.push(`<text class="small" x="${num(X(mid[0]))}" y="${num(Y(mid[1]) - 12)}" font-size="12" text-anchor="middle">${escapeHtml(path.name)}</text>`);
    }
  }

  if (options.sectionBoxes === true) {
    for (const section of file.sections) {
      const members = drawn.filter((p) => p.sectionId === section.id);
      if (members.length === 0) continue;
      const box = boundsOf(members.flatMap((p) => p.outline as Point[]));
      out.push(`<rect class="section" x="${num(X(box.minX) - 6)}" y="${num(Y(box.maxY) - 6)}" width="${num((box.maxX - box.minX) * scale + 12)}" height="${num((box.maxY - box.minY) * scale + 12)}"/>`);
      out.push(`<text class="small" x="${num(X(box.minX) - 2)}" y="${num(Y(box.maxY) - 12)}" font-size="12">${escapeHtml(section.label)}</text>`);
    }
  }

  for (const plot of drawn) {
    const box = boundsOf(plot.outline as Point[]);
    const cx = (X(box.minX) + X(box.maxX)) / 2;
    const w = Math.max(18, (box.maxX - box.minX) * scale);
    const h = Math.max(22, (box.maxY - box.minY) * scale);
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y1 = Y(box.minY);
    const y0 = y1 - h;
    const selected = options.selectedPlotId === plot.id;
    const group = options.selectable === true ? ` class="plotg" data-plot="${escapeHtml(plot.id)}"` : "";
    out.push(`<g${group}>`);
    out.push(`<path class="arch" d="${arch(x0, y0, x1, y1)}"/>`);
    out.push(`<path class="arch-inner" d="${arch(x0 + 3, y0 + 3, x1 - 3, y1 - 1)}"/>`);
    if (labels) out.push(`<text x="${num(cx)}" y="${num(y1 + 14)}" font-size="12" text-anchor="middle">${escapeHtml(plot.code)}</text>`);
    if (selected || options.selectable === true) {
      const hidden = selected ? "" : ` class="selbits"`;
      out.push(`<g${hidden}><path class="sel-outer" d="${arch(x0 - 3, y0 - 3, x1 + 3, y1 + 3)}"/><path class="sel-inner" d="${arch(x0 - 1, y0 - 1, x1 + 1, y1 + 1)}"/>`);
      out.push(`<rect class="tab" x="${num(cx - 34)}" y="${num(y0 - 34)}" width="68" height="24"/><text class="tab-text" x="${num(cx)}" y="${num(y0 - 17)}" font-size="14" text-anchor="middle">${escapeHtml(plot.code)}</text></g>`);
    }
    out.push("</g>");
  }

  if (context) {
    const gx = X(file.gate.x);
    const gy = Y(file.gate.y);
    out.push(`<rect class="gate" x="${num(gx - 7)}" y="${num(gy - 7)}" width="14" height="14"/>`);
    out.push(`<text x="${num(gx)}" y="${num(gy + 26)}" font-size="12" text-anchor="middle">${escapeHtml(file.gate.name)}</text>`);
    out.push(`<g class="north" transform="translate(${num(width - 24)} 26) rotate(${file.north})"><path d="M0 -14L6 8L0 3L-6 8Z"/></g>`);
    out.push(`<text x="${num(width - 24)}" y="${num(height < 80 ? 70 : 50)}" font-size="12" text-anchor="middle">N</text>`);
  }
  out.push("</svg>");
  return out.join("");
}

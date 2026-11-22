// The map of an availability file, drawn from its public geometry alone. Pure text: it builds SVG as a string.
// It imports only the visitor types and the label placement. Beds are footprints with a strip of hatching and a
// square peg that holds the code. Other ground is a plain outline that says nothing about why it is not listed.
// Text is drawn at real pixel size, so a drawing shown at its own width keeps 12 px labels. Colours come from the
// page that holds the drawing, by class name.
import { bestSpot, spotsAlongLine, spotsAlongTop, spotsAround } from "../map/labels";
import type { Box, Scene } from "../map/labels";
import { escapeHtml } from "./familyMap";
import type { AvailabilityFile, Point, PublicPlot } from "./privacy";

export interface AvailabilityMapOptions {
  /** The drawing width in CSS pixels. */
  width: number;
  /** The label of the drawing, for a screen reader. */
  label: string;
  /** Only these public plot IDs are drawn, and no other ground. All of them when absent. */
  plotIds?: ReadonlySet<string>;
  selectedPlotId?: string;
  /** Write each plot's code on its peg. Default true. */
  labels?: boolean;
  /** Draw the gate, the paths, the section outlines, the other ground and the north arrow. Default true. */
  context?: boolean;
  /** Draw a labelled box round the plots of each section. For a dense overview. */
  sectionBoxes?: boolean;
  /** Give each plot a group that a script can select. */
  selectable?: boolean;
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
export function freePlotsOfSection(file: AvailabilityFile, sectionId: string): PublicPlot[] {
  return file.freePlots.filter((p) => p.sectionId === sectionId);
}

/** True when a footprint is a rectangle whose sides run along the two axes. */
function isRectangle(points: readonly Point[]): boolean {
  if (points.length !== 4) return false;
  const xs = new Set(points.map((p) => p[0]));
  const ys = new Set(points.map((p) => p[1]));
  return xs.size === 2 && ys.size === 2;
}

export function availabilityMapSvg(file: AvailabilityFile, options: AvailabilityMapOptions): string {
  const context = options.context !== false;
  const labels = options.labels !== false;
  const beds = file.freePlots.filter((p) => (options.plotIds === undefined || options.plotIds.has(p.id)) && p.outline !== undefined && p.outline.length >= 3);
  const ground = options.plotIds === undefined && context ? file.neutralGround : [];

  const cloud: Point[] = [];
  for (const p of beds) cloud.push(...(p.outline as Point[]));
  for (const g of ground) cloud.push(...g.outline);
  if (context) {
    cloud.push([file.gate.x, file.gate.y]);
    for (const path of file.paths) cloud.push(...path.points);
    for (const s of file.sections) if (s.outline !== undefined) cloud.push(...s.outline);
  }
  if (cloud.length === 0) return "";

  const width = options.width;
  const padX = 24;
  const padTop = 44;
  const padBottom = 28;
  const { minX, maxX, minY, maxY } = boundsOf(cloud);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  let scale = (width - 2 * padX) / spanX;
  scale = Math.min(scale, (width * 1.4 - padTop - padBottom) / spanY);
  const height = Math.max(120, spanY * scale + padTop + padBottom);
  const X = (x: number): number => padX + (x - minX) * scale;
  const Y = (y: number): number => padTop + (maxY - y) * scale;
  const pts = (points: readonly Point[]): string => points.map((p) => `${num(X(p[0]))},${num(Y(p[1]))}`).join(" ");
  const screen = (points: readonly Point[]): [number, number][] => points.map((p) => [X(p[0]), Y(p[1])]);

  // Fixed things first, so a label can keep clear of them.
  const hard: Scene["hard"] = [];
  const soft: Box[] = [];
  const north = { x: width - 24, y: 26 };
  hard.push({ box: { x0: north.x - 14, y0: north.y - 18, x1: north.x + 14, y1: north.y + 24 }, gap: 4 });
  const bedBoxes = beds.map((plot) => {
    const b = boundsOf(plot.outline as Point[]);
    return { plot, x0: X(b.minX), x1: X(b.maxX), y0: Y(b.maxY), y1: Y(b.minY), rect: isRectangle(plot.outline as Point[]) };
  });
  for (const b of bedBoxes) soft.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
  const lineSets = context ? file.paths.map((p) => screen(p.points)) : [];
  const keepOff = (clear: number): Scene["lines"] => lineSets.map((points) => ({ points, clear }));
  const scene = (lines: Scene["lines"]): Scene => ({ width, height, hard, lines, soft });
  const gx = X(file.gate.x);
  const gy = Y(file.gate.y);
  if (context) hard.push({ box: { x0: gx - 6, y0: gy - 6, x1: gx + 6, y1: gy + 6 }, gap: 4 });
  const place = (text: string, spots: ReturnType<typeof spotsAround>, lines: Scene["lines"]): { x: number; y: number; anchor: string } => {
    const best = bestSpot(text, 12, spots, scene(lines));
    hard.push({ box: best.box, gap: 2 });
    return { x: best.spot.x, y: best.spot.y, anchor: best.spot.anchor };
  };
  const textAt = (text: string, spot: { x: number; y: number; anchor: string }): string =>
    `<text x="${num(spot.x)}" y="${num(spot.y)}" font-size="12" text-anchor="${spot.anchor}">${escapeHtml(text)}</text>`;

  const out: string[] = [];
  out.push(
    `<svg class="map" viewBox="0 0 ${num(width)} ${num(height)}" width="${num(width)}" height="${num(height)}" role="img" aria-label="${escapeHtml(options.label)}" font-family="system-ui, Arial, sans-serif">`,
  );

  for (const g of ground) out.push(`<polygon class="ground" points="${pts(g.outline)}"/>`);

  if (context) {
    const gateSpot = place(file.gate.name, spotsAround(gx, gy), keepOff(8));
    for (const section of file.sections) {
      if (section.outline === undefined) continue;
      const b = boundsOf(section.outline);
      out.push(`<polygon class="section" points="${pts(section.outline)}"/>`);
      const box = { x: X(b.minX), y: Y(b.maxY), width: (b.maxX - b.minX) * scale, height: (b.maxY - b.minY) * scale };
      out.push(textAt(section.label, place(section.label, spotsAlongTop(box, section.label, 12), keepOff(8))));
    }
    file.paths.forEach((path, index) => {
      out.push(`<polyline class="walk" points="${pts(path.points)}"/>`);
      out.push(`<polyline class="walk-line" points="${pts(path.points)}"/>`);
      const own: Scene["lines"] = lineSets.map((points, i) => ({ points, clear: i === index ? 4 : 8 }));
      out.push(textAt(path.name, place(path.name, spotsAlongLine(screen(path.points)), own)));
    });
    out.push(`<rect class="gate" x="${num(gx - 6)}" y="${num(gy - 6)}" width="12" height="12"/>`);
    out.push(textAt(file.gate.name, gateSpot));
  }

  if (options.sectionBoxes === true) {
    for (const section of file.sections) {
      const members = bedBoxes.filter((b) => b.plot.sectionId === section.id);
      if (members.length === 0) continue;
      const x0 = Math.min(...members.map((m) => m.x0)) - 6;
      const x1 = Math.max(...members.map((m) => m.x1)) + 6;
      const y0 = Math.min(...members.map((m) => m.y0)) - 6;
      const y1 = Math.max(...members.map((m) => m.y1)) + 6;
      out.push(`<rect class="section" x="${num(x0)}" y="${num(y0)}" width="${num(x1 - x0)}" height="${num(y1 - y0)}"/>`);
      out.push(`<text x="${num(x0 + 2)}" y="${num(y0 - 6)}" font-size="12">${escapeHtml(section.label)}</text>`);
    }
  }

  for (const b of bedBoxes) {
    const { plot } = b;
    const selected = options.selectedPlotId === plot.id;
    const group = options.selectable === true ? ` class="plotg" data-plot="${escapeHtml(plot.id)}"` : "";
    out.push(`<g${group}>`);
    out.push(`<polygon class="bed" points="${pts(plot.outline as Point[])}"/>`);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    if (b.rect && w >= 24 && h >= 24) {
      const strokes: string[] = [];
      for (let x = b.x0 + 3; x + 8 <= b.x1 - 2; x += 6) strokes.push(`M${num(x)} ${num(b.y0 + 10)}L${num(x + 8)} ${num(b.y0 + 3)}`);
      out.push(`<path class="hatch" d="${strokes.join("")}"/>`);
    }
    if (labels) {
      const pegW = Math.max(30, [...plot.code].length * 7.4 + 10);
      const cx = (b.x0 + b.x1) / 2;
      if (w >= pegW + 6 && h >= 34) {
        const top = b.y1 - 22;
        out.push(`<rect class="peg" x="${num(cx - pegW / 2)}" y="${num(top)}" width="${num(pegW)}" height="18"/>`);
        out.push(`<text x="${num(cx)}" y="${num(top + 13.5)}" font-size="12" text-anchor="middle">${escapeHtml(plot.code)}</text>`);
      } else {
        out.push(`<text x="${num(cx)}" y="${num(b.y1 + 15)}" font-size="12" text-anchor="middle">${escapeHtml(plot.code)}</text>`);
      }
    }
    if (selected || options.selectable === true) {
      const cx = (b.x0 + b.x1) / 2;
      const hidden = selected ? "" : ` class="selbits"`;
      out.push(`<g${hidden}><polygon class="sel-outer" points="${pts(plot.outline as Point[])}"/><polygon class="sel-inner" points="${pts(plot.outline as Point[])}"/>`);
      const tabW = Math.max(48, [...plot.code].length * 9 + 16);
      out.push(`<rect class="tab" x="${num(cx - tabW / 2)}" y="${num(b.y0 - 34)}" width="${num(tabW)}" height="24"/><text class="tab-text" x="${num(cx)}" y="${num(b.y0 - 17)}" font-size="14" text-anchor="middle">${escapeHtml(plot.code)}</text></g>`);
    }
    out.push("</g>");
  }

  if (context) {
    out.push(`<g class="north" transform="translate(${num(north.x)} ${num(north.y)}) rotate(${file.north})"><path d="M0 -14L6 8L0 3L-6 8Z"/></g>`);
  }
  out.push("</svg>");
  return out.join("");
}

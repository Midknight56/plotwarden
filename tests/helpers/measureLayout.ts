// Layout measurements for the browser specs. Test helper. The template never imports it.
// It measures real rectangles in CSS pixels: the 16 px edge, the 12 px gap, the 44 by 44 px
// target, the 12 px text floor, no sideways scroll, the contrast of text and focus rings,
// and whether another element covers a target. Nothing is excluded to make a page pass.
import type { Page } from "@playwright/test";

export interface Violation {
  rule: string;
  element: string;
  detail: string;
}

export interface MeasureOptions {
  /** Skip the covered target test, which scrolls every target into view. */
  skipHitTest?: boolean;
}

/** Everything is measured inside the page, then sent back as plain data. */
export async function measureLayout(page: Page, options: MeasureOptions = {}): Promise<Violation[]> {
  // A colour change of 120 ms, as a button goes from disabled to ready, is over before anything is measured: a contrast
  // read half way is not the contrast of the page at rest. An animation with no end (the band mist) is left out, because
  // it would hold the wait for ever.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      const timing = a.effect?.getComputedTiming();
      return timing === undefined || timing.iterations === Infinity || a.playState === "finished" || a.playState === "idle";
    }),
  );
  const found = await page.evaluate((opts) => {
    const violations: { rule: string; element: string; detail: string }[] = [];
    const TOLERANCE = 0.5;
    const add = (rule: string, el: Element, detail: string) => {
      const id = el.id === "" ? "" : `#${el.id}`;
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      violations.push({ rule, element: `${el.tagName.toLowerCase()}${id} "${name}"`, detail });
    };

    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + TOLERANCE) {
      add("no_horizontal_scroll", document.documentElement, `scrollWidth ${document.documentElement.scrollWidth} is wider than ${vw}`);
    }

    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        if (p.tagName === "DIALOG" && !(p as HTMLDialogElement).open) return false;
        if (p.hasAttribute("inert")) return false;
        if (getComputedStyle(p).display === "none") return false;
      }
      return true;
    };

    // ---- Targets ------------------------------------------------------------------------
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"]';
    const anyDialogOpen = document.querySelector("dialog[open]") !== null;
    const targets = [...document.querySelectorAll(selector)].filter((el) => {
      if (!visible(el)) return false;
      const inDialog = el.closest("dialog") !== null;
      return anyDialogOpen ? inDialog : true;
    });

    interface Box {
      el: Element;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }
    const boxes: Box[] = targets.map((el) => {
      const r = el.getBoundingClientRect();
      const inDialog = el.closest("dialog") !== null;
      const dx = inDialog ? 0 : window.scrollX;
      const dy = inDialog ? 0 : window.scrollY;
      return { el, left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
    });

    for (const b of boxes) {
      const w = b.right - b.left;
      const h = b.bottom - b.top;
      if (w < 44 - TOLERANCE || h < 44 - TOLERANCE) add("target_size", b.el, `${w.toFixed(1)} by ${h.toFixed(1)} px`);
      if (b.left < 16 - TOLERANCE || b.right > vw - 16 + TOLERANCE) {
        add("edge_inset", b.el, `left ${b.left.toFixed(1)}, right edge ${(vw - b.right).toFixed(1)} px from the viewport`);
      }
      let clip: Element | null = b.el.parentElement;
      while (clip !== null && clip !== document.body && clip !== document.documentElement) {
        const s = getComputedStyle(clip);
        if (["auto", "scroll", "hidden", "clip"].includes(s.overflowX)) break;
        clip = clip.parentElement;
      }
      if (clip !== null && clip !== document.body && clip !== document.documentElement) {
        const cr = clip.getBoundingClientRect();
        const r = b.el.getBoundingClientRect();
        const bw = parseFloat(getComputedStyle(clip).borderLeftWidth) || 0;
        if (r.left - cr.left - bw < 16 - TOLERANCE || cr.right - r.right - bw < 16 - TOLERANCE) {
          add("clip_inset", b.el, `inside ${clip.tagName.toLowerCase()}: ${(r.left - cr.left).toFixed(1)} and ${(cr.right - r.right).toFixed(1)} px`);
        }
      }
    }

    for (let i = 0; i < boxes.length; i += 1) {
      const a = boxes[i] as Box;
      for (let j = i + 1; j < boxes.length; j += 1) {
        const c = boxes[j] as Box;
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
        const dx = Math.max(0, a.left - c.right, c.left - a.right);
        const dy = Math.max(0, a.top - c.bottom, c.top - a.bottom);
        const gap = Math.hypot(dx, dy);
        if (gap < 12 - TOLERANCE) {
          add("target_gap", a.el, `${gap.toFixed(1)} px from ${c.el.tagName.toLowerCase()} "${(c.el.textContent ?? "").trim().slice(0, 24)}"`);
        }
      }
    }

    // ---- Text size and contrast ------------------------------------------------------------
    const parse = (value: string): [number, number, number, number] | undefined => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (m === null) return undefined;
      const parts = (m[1] as string).split(/[ ,/]+/).filter(Boolean).map(Number);
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    };
    const lum = (c: [number, number, number, number]): number => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: [number, number, number, number], b: [number, number, number, number]): number => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const backgroundOf = (el: Element): [number, number, number, number] => {
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const c = parse(getComputedStyle(p).backgroundColor);
        if (c !== undefined && c[3] > 0.99) return c;
      }
      return [255, 255, 255, 1];
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const el = node.parentElement;
      if (text === "" || el === null || seen.has(el)) continue;
      if (["SCRIPT", "STYLE", "OPTION", "TITLE"].includes(el.tagName)) continue;
      if (!visible(el) && el.namespaceURI !== "http://www.w3.org/2000/svg") continue;
      if (el.closest("[hidden], [aria-hidden='true']") !== null) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      const svg = el.closest("svg");
      let scale = 1;
      if (svg !== null && svg.viewBox.baseVal.width > 0) scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const size = parseFloat(style.fontSize) * scale;
      if (size < 12 - 0.01) add("text_size", el, `${size.toFixed(2)} px: "${text.slice(0, 30)}"`);
      const colour = parse(el.namespaceURI === "http://www.w3.org/2000/svg" ? style.fill : style.color);
      if (colour !== undefined) {
        const bg = backgroundOf(el);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const need = large ? 3 : 4.5;
        const got = ratio(colour, bg);
        if (got < need) add("text_contrast", el, `${got.toFixed(2)} to 1, wanted ${need}: "${text.slice(0, 30)}"`);
      }
    }

    // ---- Is a target covered by something else? ------------------------------------------------
    if (opts.skipHitTest !== true) {
      for (const b of boxes) {
        (b.el as HTMLElement).scrollIntoView({ block: "center", inline: "nearest" });
        const r = b.el.getBoundingClientRect();
        const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
        const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
        const hit = document.elementFromPoint(x, y);
        const ok = hit !== null && (hit === b.el || b.el.contains(hit) || hit.contains(b.el) || hit.closest("label")?.contains(b.el) === true);
        if (!ok && r.top >= 0 && r.bottom <= window.innerHeight) {
          add("covered_target", b.el, `at ${Math.round(x)}, ${Math.round(y)} the top element is ${hit?.tagName.toLowerCase() ?? "nothing"}`);
        }
      }
      window.scrollTo(0, 0);
    }
    return violations;
  }, options);
  return [...found, ...(await measureSheetLabels(page))];
}

/** The ink of the focus ring against the page, for one focused element. 3 to 1 is the floor. */
export async function focusRingContrast(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (el === null) return 0;
    el.focus();
    const style = getComputedStyle(el);
    const parse = (value: string): number[] => (/rgba?\(([^)]+)\)/.exec(value)?.[1] ?? "0,0,0").split(/[ ,/]+/).filter(Boolean).map(Number);
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0] ?? 0) + 0.7152 * f(c[1] ?? 0) + 0.0722 * f(c[2] ?? 0);
    };
    let bg = [255, 255, 255];
    // The ring is drawn outside the element, past a gap of `outline-offset`. So it sits on what is behind the element,
    // not on the element's own fill. With no gap it touches the element, and its own fill counts.
    const gap = parseFloat(style.outlineOffset) > 0;
    for (let p: Element | null = gap ? el.parentElement : el; p !== null; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c.length < 4 || (c[3] ?? 1) > 0.99) {
        if (c.length >= 3 && getComputedStyle(p).backgroundColor !== "rgba(0, 0, 0, 0)") {
          bg = c;
          break;
        }
      }
    }
    if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) < 2) return 0;
    const a = lum(parse(style.outlineColor));
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, selector);
}

/** Every request that is not for the host's own files. There must be none. */
export function trackRequests(page: Page, origin = "http://127.0.0.1:4175/"): { external: string[]; all: string[] } {
  const log = { external: [] as string[], all: [] as string[] };
  page.on("request", (request) => {
    const url = request.url();
    log.all.push(url);
    if (!url.startsWith(origin) && !url.startsWith("blob:") && !url.startsWith("data:") && !url.startsWith("about:")) {
      log.external.push(url);
    }
  });
  return log;
}

// ---- Sheet labels ------------------------------------------------------------------------------------
// A label on a map must keep clear of the dots of a path, the paper tab, the north arrow, the gate mark and
// every other label, and stay inside the drawing. The page is read once into plain data (`readSheetScene`),
// and the data is checked here (`findLabelCollisions`), so the check can be tried without a browser.

export interface SceneBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SheetScene {
  /** The drawing itself, from its own corner. */
  frame: { width: number; height: number };
  /** `kind` is the `data-kind` of the text: gate, section, path, plot or tab. A plot code sits inside its own plot. */
  labels: { text: string; kind?: string; box: SceneBox }[];
  lines: { name: string; points: [number, number][] }[];
  /** The dashed outline of each section, closed. A section's own name sits just above its outline. */
  outlines?: { name: string; points: [number, number][] }[];
  /** The box of every plot shape. */
  plots?: SceneBox[];
  /** The text on the code tab. It is read apart from the labels, because it sits on the tab by design. */
  tabText?: SceneBox;
  tab?: SceneBox;
  north?: SceneBox;
  gate?: SceneBox;
}

/** Self contained: it runs inside the page and returns plain data. */
export function readSheetScene(): SheetScene[] {
  const scenes: SheetScene[] = [];
  for (const svg of document.querySelectorAll<SVGSVGElement>("svg.sheet")) {
    const origin = svg.getBoundingClientRect();
    if (origin.width === 0 || origin.height === 0 || getComputedStyle(svg).display === "none") continue;
    const rel = (el: Element): SceneBox => {
      const r = el.getBoundingClientRect();
      return { x0: r.left - origin.left, y0: r.top - origin.top, x1: r.right - origin.left, y1: r.bottom - origin.top };
    };
    const scene: SheetScene = { frame: { width: origin.width, height: origin.height }, labels: [], lines: [] };
    for (const text of svg.querySelectorAll<SVGTextElement>("text")) {
      if ((text.textContent ?? "").trim() === "") continue;
      if (text.classList.contains("tab-text")) {
        scene.tabText = rel(text);
        continue;
      }
      const kind = text.getAttribute("data-kind");
      scene.labels.push({ text: (text.textContent ?? "").trim(), ...(kind === null ? {} : { kind }), box: rel(text) });
    }
    scene.plots = [];
    for (const shape of svg.querySelectorAll("polygon.plot, path.plot")) scene.plots.push(rel(shape));
    for (const line of svg.querySelectorAll<SVGPolylineElement>("polyline.path-line")) {
      const points = (line.getAttribute("points") ?? "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number) as [number, number])
        .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      scene.lines.push({ name: line.nextElementSibling?.textContent?.trim() ?? "path", points });
    }
    scene.outlines = [];
    for (const outline of svg.querySelectorAll<SVGPolygonElement>("polygon.section-outline")) {
      const points = (outline.getAttribute("points") ?? "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number) as [number, number])
        .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (points.length > 0) points.push(points[0] as [number, number]);
      scene.outlines.push({ name: outline.nextElementSibling?.textContent?.trim() ?? "section", points });
    }
    const tab = svg.querySelector("rect.tab");
    if (tab !== null) scene.tab = rel(tab);
    const north = svg.querySelector("g.north");
    if (north !== null) scene.north = rel(north);
    const gate = svg.querySelector("rect.gate");
    if (gate !== null) scene.gate = rel(gate);
    scenes.push(scene);
  }
  return scenes;
}

const TOUCH = 1;

/** True when two boxes share area. Boxes that only meet along an edge do not overlap. */
const overlaps = (a: SceneBox, b: SceneBox): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** True when the outer box holds the inner one, to within a pixel of rounding. */
const holds = (outer: SceneBox, inner: SceneBox): boolean => inner.x0 >= outer.x0 - 1 && inner.x1 <= outer.x1 + 1 && inner.y0 >= outer.y0 - 1 && inner.y1 <= outer.y1 + 1;

function boxGap(a: SceneBox, b: SceneBox): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

function lineGap(box: SceneBox, points: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as readonly [number, number];
    const b = points[i + 1] as readonly [number, number];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let s = 0; s <= steps; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / steps;
      const y = a[1] + ((b[1] - a[1]) * s) / steps;
      best = Math.min(best, Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.y0 - y, 0, y - box.y1)));
    }
  }
  return best;
}

/** The rules: no label touches a path line, the tab, the north arrow, the gate mark or another label, or leaves the drawing. */
export function findLabelCollisions(scenes: readonly SheetScene[]): Violation[] {
  const out: Violation[] = [];
  const add = (rule: string, text: string, detail: string) => out.push({ rule, element: `sheet label "${text}"`, detail });
  for (const scene of scenes) {
    for (const { text, kind, box } of scene.labels) {
      if (box.x0 < -TOUCH || box.y0 < -TOUCH || box.x1 > scene.frame.width + TOUCH || box.y1 > scene.frame.height + TOUCH) {
        add("label_clipped", text, `box ${Math.round(box.x0)},${Math.round(box.y0)} to ${Math.round(box.x1)},${Math.round(box.y1)} leaves the drawing`);
      }
      for (const line of scene.lines) {
        const gap = lineGap(box, line.points);
        if (gap < TOUCH) add("label_on_line", text, `${gap.toFixed(1)} px from the line of ${line.name}`);
      }
      // A section name sits just above its own outline by design. Every other label keeps off every outline.
      for (const outline of scene.outlines ?? []) {
        if (outline.name === text) continue;
        const gap = lineGap(box, outline.points);
        if (gap < TOUCH) add("label_on_outline", text, `${gap.toFixed(1)} px from the outline of ${outline.name}`);
      }
      if (scene.tab !== undefined && boxGap(box, scene.tab) < TOUCH) add("label_on_tab", text, "touches the code tab");
      if (scene.north !== undefined && boxGap(box, scene.north) < TOUCH) add("label_on_north", text, "touches the north arrow");
      if (scene.gate !== undefined && boxGap(box, scene.gate) < TOUCH) add("label_on_gate", text, "touches the gate mark");
      // A name, or the code on the tab, never lies over a plot shape. The code of a plot sits inside its own plot and
      // only counts when it lies over a plot that does not hold it.
      for (const plot of scene.plots ?? []) {
        if (overlaps(box, plot) && !(kind === "plot" && holds(plot, box))) add("label_on_plot", text, "lies over a plot shape");
      }
    }
    if (scene.tabText !== undefined) {
      for (const plot of scene.plots ?? []) if (overlaps(scene.tabText, plot)) add("label_on_plot", "tab", "the text of the code tab lies over a plot shape");
    }
    for (let i = 0; i < scene.labels.length; i++) {
      for (let j = i + 1; j < scene.labels.length; j++) {
        const a = scene.labels[i] as SheetScene["labels"][number];
        const b = scene.labels[j] as SheetScene["labels"][number];
        if (boxGap(a.box, b.box) < TOUCH && a.box.x0 < b.box.x1 && b.box.x0 < a.box.x1 && a.box.y0 < b.box.y1 && b.box.y0 < a.box.y1) {
          add("label_overlap", a.text, `overlaps the label "${b.text}"`);
        }
      }
    }
  }
  return out;
}

/** Read every map on the page and report each label that touches a line, a tab, the north arrow, the gate or another label. */
export async function measureSheetLabels(page: Page): Promise<Violation[]> {
  return findLabelCollisions(await page.evaluate(readSheetScene));
}
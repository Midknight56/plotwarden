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
  return page.evaluate((opts) => {
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
    for (let p: Element | null = el; p !== null; p = p.parentElement) {
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

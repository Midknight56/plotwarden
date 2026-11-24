// Share and print, in a real browser, on the assembled site (spec 06, task 6.20, requirement Z15), at 360 by 640
// and at 1920 by 1080. It needs `npm run build:apps` and `npm run assemble:site` first.
//
// Two staff documents (the private register report of each app) and the two visitor print documents are taken
// from the registers as they hand them to the print frame, then drawn in a clean page, in print media, on A4 and
// on US Letter. Each is checked as a page: the paper size in the PDF the browser makes from it, no sideways
// overflow, black and grays only, no script, and the private words. The two visitor files are downloaded from the
// registers, opened cold from disk with the network off, searched, and printed to A4 and to Letter.
//
// A4 proof (task 10): the family location, the plot seeker sheet and the private season report are saved to
// docs/acceptance/print/ as the browser's own PDF and as a picture of page 1. The picture is the same document drawn
// in print media at the width of A4 with the 12 mm page margin, cut at the height of A4. It is not a picture of the PDF.
//
// What this does not show: a printed page. The browser makes a PDF from the document. No print dialog was driven
// and no paper was used.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium, expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { AVAILABILITY_CANARIES } from "../helpers/gardenCanaries";
import { CHURCH, GARDEN, openPractice, plotIdOf, settle, siteIdOf, storedEvents } from "../helpers/routes";
import { APPROVED_NAME, OTHER_OCCUPANT, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { FAMILY_FILE, SEEKER_FILE, SITE, trackFaults } from "../helpers/siteOrigin";
import { trackRequests } from "../helpers/measureLayout";

test.use({ baseURL: SITE });

const PAPERS = [
  { name: "A4", width: 595.28, height: 841.89, cssWidth: 794 },
  { name: "Letter", width: 612, height: 792, cssWidth: 816 },
] as const;
type Paper = (typeof PAPERS)[number];

let plainTextBrowser: Browser;
test.beforeAll(async () => {
  plainTextBrowser = await chromium.launch({ headless: true, args: ["--disable-lcd-text"] });
});
test.afterAll(async () => {
  await plainTextBrowser.close();
});

const PROOF_DIR = "docs/acceptance/print";
/** The height of an A4 page in CSS pixels at 96 per inch. */
const A4_HEIGHT = 1123;

/** Save a PDF and a picture of page 1 of the same document. The picture is drawn with the page margin of the document. */
async function saveProof(name: string, pdf: Buffer, doc: Page, padding = "12mm"): Promise<void> {
  mkdirSync(PROOF_DIR, { recursive: true });
  await doc.setViewportSize({ width: PAPERS[0].cssWidth, height: A4_HEIGHT });
  await doc.addStyleTag({ content: `body{padding:${padding}}` });
  const picture = await doc.screenshot({ clip: { x: 0, y: 0, width: PAPERS[0].cssWidth, height: A4_HEIGHT }, fullPage: true });
  writeFileSync(join(PROOF_DIR, `${name}.pdf`), pdf);
  writeFileSync(join(PROOF_DIR, `${name}-page-1.png`), picture);
}

const CHURCH_APP = { ...CHURCH, origin: `${SITE}churchyard/` };
const GARDEN_APP = { ...GARDEN, origin: `${SITE}allotments/` };

/** The paper the keeper chose in Settings, set before the page opens. */
async function choosePaper(context: BrowserContext, paper: Paper["name"]): Promise<void> {
  await context.addInitScript((value) => window.localStorage.setItem("plotwarden.settings", JSON.stringify({ motion: "follow", contrast: "standard", paper: value })), paper);
}

/** The document that a register hands to its print frame. */
async function printed(page: Page, button: string): Promise<string> {
  await page.locator("iframe[data-print-frame]").evaluateAll((frames) => frames.forEach((f) => f.remove()));
  await page.getByRole("button", { name: button, exact: true }).click();
  const html = await page.locator("iframe[data-print-frame]").first().getAttribute("srcdoc");
  expect(html, `${button} gave no document`).not.toBeNull();
  return html as string;
}

interface PdfFacts {
  pages: { width: number; height: number }[];
  bytes: Buffer;
}

/** The page sizes of a PDF, read from its page objects. */
function pdfFacts(bytes: Buffer): PdfFacts {
  const text = bytes.toString("latin1");
  const pages = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\]/g)].map((m) => ({ width: Number(m[1]), height: Number(m[2]) }));
  return { pages, bytes };
}

function expectPaper(facts: PdfFacts, paper: Paper, label: string): void {
  expect(facts.pages.length, `${label}: no page in the PDF`).toBeGreaterThan(0);
  for (const { width, height } of facts.pages) {
    const [short, long] = [Math.min(width, height), Math.max(width, height)];
    expect(Math.abs(short - paper.width), `${label}: width ${width}`).toBeLessThan(1.5);
    expect(Math.abs(long - paper.height), `${label}: height ${height}`).toBeLessThan(1.5);
  }
}

/** How many pixels of a picture are not a gray, and how many there are. Read in a clean page with a canvas. */
async function colourOf(helper: Page, png: Buffer): Promise<{ pixels: number; coloured: number; debug: string }> {
  return helper.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let coloured = 0;
    const seen = new Map<string, number>();
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] as number;
      const g = data[i + 1] as number;
      const b = data[i + 2] as number;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) {
        coloured += 1;
        const key = `${r},${g},${b}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        const px = (i / 4) % img.width, py = Math.floor(i / 4 / img.width);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
    }
    const debug = JSON.stringify([...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) + ` box ${minX},${minY},${maxX},${maxY}`;
    return { pixels: data.length / 4, coloured, debug };
  }, png.toString("base64"));
}

/** Draw a print document in a clean page, in print media, at the width of the paper. */
async function drawPrint(context: BrowserContext, html: string, paper: Paper): Promise<Page> {
  const doc = await context.newPage();
  await doc.setViewportSize({ width: paper.cssWidth, height: 1123 });
  await doc.setContent(html);
  await doc.emulateMedia({ media: "print" });
  return doc;
}

/** What a print document must be, on one paper. Words are checked by the caller. */
async function expectPrintPage(parent: BrowserContext, html: string, paper: Paper, label: string, proof?: string): Promise<{ text: string; facts: PdfFacts }> {
  // Drawn in a browser that has its coloured text smoothing off. With it on, the edges of every letter carry red and
  // blue fringes that the document did not paint, and a picture of the page could never be all gray.
  void parent;
  const context = await plainTextBrowser.newContext();
  const doc = await drawPrint(context, html, paper);
  const helper = await context.newPage();
  try {
    // One page of the browser's own PDF, made from the document with the paper the document asks for.
    const facts = pdfFacts(await doc.pdf({ preferCSSPageSize: true, printBackground: true }));
    expectPaper(facts, paper, label);
    // Nothing runs, nothing leaves, nothing wider than the paper.
    expect(html).not.toMatch(/<script|<link\b|<iframe|<form|<img\b/i);
    expect(html.replaceAll("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:\/\//i);
    expect(await doc.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${label}: sideways overflow`).toBe(true);
    // Black, white and grays only.
    const shot = await doc.screenshot({ fullPage: true });
    const colour = await colourOf(helper, shot);
    expect(colour.pixels).toBeGreaterThan(1000);
    expect(colour.coloured / colour.pixels, `${label}: ${colour.coloured} of ${colour.pixels} pixels are not gray ${colour.debug}`).toBeLessThan(0.0005);
    const text = await doc.evaluate(() => document.body.innerText);
    if (proof !== undefined && paper.name === "A4") await saveProof(proof, facts.bytes, doc);
    return { text, facts };
  } finally {
    await context.close();
  }
}

/** Choose every plot, save, and preview, so a print is possible. A register that already has them chosen is left as it is. */
async function previewPublic(page: Page, pick: RegExp): Promise<void> {
  for (const box of await page.getByLabel(pick).all()) await box.check();
  const save = page.getByRole("button", { name: "Save public details" });
  if (await save.isEnabled()) await save.click();
  await page.getByRole("button", { name: "Preview as a visitor", exact: true }).click();
  await expect(page.locator(".preview-frame")).toBeVisible();
}

for (const paper of PAPERS) {
  test.describe(`on ${paper.name}`, () => {
    test(`the private register report of the churchyard is a page, in grays, and holds the private names`, async ({ page, context }) => {
      await choosePaper(context, paper.name);
      const requests = trackRequests(page, SITE);
      const faults = trackFaults(page);
      const siteId = await (async () => {
        await openPractice(page, CHURCH_APP);
        return siteIdOf(page);
      })();
      await page.goto(`${SITE}churchyard/#/r/${siteId}/report`);
      await expect(page.getByRole("heading", { level: 1, name: /report/i })).toBeVisible();
      const html = await printed(page, "Print private report");
      expect(html).toContain("Private register report");
      expect(html).toMatch(new RegExp(`size:\\s*${paper.name}`, "i"));
      const { text } = await expectPrintPage(context, html, paper, `church report ${paper.name}`);
      // It is the keeper's own paper: it holds the names it should.
      expect(text).toContain(OTHER_OCCUPANT);
      expect(requests.external).toEqual([]);
      expect(faults.faults).toEqual([]);
    });

    test(`the family map print document is a page, in grays, with the approved name and no private word`, async ({ page, context }) => {
      await choosePaper(context, paper.name);
      const siteId = await (async () => {
        await openPractice(page, CHURCH_APP);
        return siteIdOf(page);
      })();
      await page.goto(`${SITE}churchyard/#/r/${siteId}/family`);
      await expect(page.getByRole("heading", { level: 1, name: "Family map" })).toBeVisible();
      await page.getByRole("button", { name: "Preview as a visitor" }).click();
      await expect(page.locator(".preview-frame")).toContainText(APPROVED_NAME);
      const html = await printed(page, "Print family map");
      expect(html).toMatch(new RegExp(`size:\\s*${paper.name}`, "i"));
      const { text, facts } = await expectPrintPage(context, html, paper, `family print ${paper.name}`);
      expect(text).toContain(APPROVED_NAME);
      expect(text).toContain("Lantern Gate");
      for (const secret of [...VISITOR_CANARIES, "LF-07A"]) {
        expect(text, secret).not.toContain(secret);
        expect(html, secret).not.toContain(secret);
        expect(facts.bytes.toString("latin1"), secret).not.toContain(secret);
      }
    });

    test(`the private season report of the garden is a page, in grays, and holds the secretary's own figures`, async ({ page, context }) => {
      await choosePaper(context, paper.name);
      const siteId = await (async () => {
        await openPractice(page, GARDEN_APP);
        return siteIdOf(page);
      })();
      await page.goto(`${SITE}allotments/#/r/${siteId}/report`);
      await expect(page.getByRole("heading", { level: 1, name: /report/i })).toBeVisible();
      const html = await printed(page, "Print private report");
      expect(html).toMatch(new RegExp(`size:\\s*${paper.name}`, "i"));
      const { text } = await expectPrintPage(context, html, paper, `garden report ${paper.name}`, "season-report-a4");
      expect(text).toContain("Season report");
      expect(text).toContain("Ada Stonecrop");
      expect(text).toContain("Tavi Bramblequill");
      expect(text).toContain("GBP 30.00");
    });

    test(`the plot seeker print document is a page, in grays, with free plots and no person, no rent and no payment`, async ({ page, context }) => {
      await choosePaper(context, paper.name);
      const siteId = await (async () => {
        await openPractice(page, GARDEN_APP);
        return siteIdOf(page);
      })();
      await page.goto(`${SITE}allotments/#/r/${siteId}/seeker`);
      await expect(page.getByRole("heading", { level: 1, name: /map|plots/i })).toBeVisible();
      await previewPublic(page, /^List this plot:/);
      const html = await printed(page, "Print availability map");
      expect(html).toMatch(new RegExp(`size:\\s*${paper.name}`, "i"));
      const { text, facts } = await expectPrintPage(context, html, paper, `seeker print ${paper.name}`, "seeker-sheet-a4");
      expect(text).toContain("Thimble Gate");
      expect(text).toContain("B03");
      for (const secret of AVAILABILITY_CANARIES) {
        expect(text, secret).not.toContain(secret);
        expect(html, secret).not.toContain(secret);
        expect(facts.bytes.toString("latin1"), secret).not.toContain(secret);
      }
    });
  });
}

test.describe("the two visitor files, shared and opened cold", () => {
  /** A file as the keeper downloads it from a register, saved to disk. */
  async function download(page: Page, button: string, testInfoPath: (name: string) => string): Promise<{ path: string; name: string; html: string }> {
    const [saved] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button, exact: true }).click()]);
    const path = testInfoPath(saved.suggestedFilename());
    await saved.saveAs(path);
    return { path, name: saved.suggestedFilename(), html: readFileSync(path, "utf8") };
  }

  async function openOffline(browser: Browser, path: string): Promise<{ context: BrowserContext; page: Page; requests: string[] }> {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(pathToFileURL(path).href);
    return { context, page, requests };
  }

  test("the family file, downloaded from the churchyard, opens from disk with the network off, searches, and prints to A4 and Letter", async ({ page, browser, context }, testInfo) => {
    const siteId = await (async () => {
      await openPractice(page, CHURCH_APP);
      return siteIdOf(page);
    })();
    await page.goto(`${SITE}churchyard/#/r/${siteId}/family`);
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    const file = await download(page, "Download family copy", (name) => testInfo.outputPath(name));
    expect(file.name).toBe("family-map-2026-04-20.html");
    for (const secret of VISITOR_CANARIES) expect(file.html, secret).not.toContain(secret);

    const cold = await openOffline(browser, file.path);
    await expect(cold.page.locator("h1")).toHaveText("Lantern Fold");
    await cold.page.getByLabel("Name or plot code").fill("Quillmoss");
    await cold.page.getByRole("button", { name: "Find", exact: true }).click();
    await expect(cold.page.locator("#list li:visible")).toContainText(APPROVED_NAME);
    await cold.page.getByRole("button", { name: "Show location" }).first().click();
    await expect(cold.page.locator("#selcode")).toHaveText("Y07");
    expect(cold.requests.filter((u) => !u.startsWith("file:") && !u.startsWith("data:") && !u.startsWith("about:"))).toEqual([]);

    // One location. The button marks the page and asks the browser to print. The print call is a stub here, so the
    // state of the page at that moment is read and no dialog opens.
    await cold.page.evaluate(() => {
      const mark = window as unknown as { __printed: string[] };
      mark.__printed = [];
      window.print = () => {
        mark.__printed.push(document.body.className);
      };
    });
    await cold.page.getByRole("button", { name: "Print this location", exact: true }).click();
    expect(await cold.page.evaluate(() => (window as unknown as { __printed: string[] }).__printed)).toEqual(["only-selected"]);
    await cold.page.evaluate(() => {
      document.body.className = "only-selected";
    });
    await cold.page.emulateMedia({ media: "print" });
    const location = await cold.page.evaluate(() => {
      // The page holds two drawings, one for a narrow frame and one for a wide frame. The one that is shown is read.
      const svg = [...document.querySelectorAll<SVGSVGElement>("svg.map")].find((s) => s.getClientRects().length > 0) as SVGSVGElement;
      const shown = (el: Element | null): boolean => el !== null && getComputedStyle(el).display !== "none";
      const rectOf = (el: Element) => el.getBoundingClientRect();
      const scale = rectOf(svg).width / svg.viewBox.baseVal.width;
      // A walk is drawn 12 px wide. The box of its line is widened by half of that, in the scale of the drawing.
      const bands = [...svg.querySelectorAll("polyline.walk")].map((w) => {
        const r = rectOf(w);
        return { name: "the walk", x0: r.left - 6 * scale, x1: r.right + 6 * scale, y0: r.top - 6 * scale, y1: r.bottom + 6 * scale };
      });
      const shapes = [...svg.querySelectorAll("polygon.outline, path.arch")].filter(shown).map((s) => {
        const r = rectOf(s);
        return { name: "a plot", x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
      });
      const texts = [...svg.querySelectorAll("text")]
        .filter((t) => shown(t) && (t.textContent ?? "").trim() !== "" && rectOf(t).width > 0)
        .map((t) => ({ name: (t.textContent ?? "").trim(), r: rectOf(t) }));
      const faults: string[] = [];
      const over = (a: { left: number; right: number; top: number; bottom: number }, b: { x0: number; x1: number; y0: number; y1: number }) => a.left < b.x1 && b.x0 < a.right && a.top < b.y1 && b.y0 < a.bottom;
      for (const t of texts) {
        for (const other of [...bands, ...shapes]) if (over(t.r, other)) faults.push(`${t.name} lies on ${other.name}`);
      }
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i];
          const b = texts[j];
          if (a !== undefined && b !== undefined && over(a.r, { x0: b.r.left, x1: b.r.right, y0: b.r.top, y1: b.r.bottom })) faults.push(`${a.name} lies on ${b.name}`);
        }
      }
      return {
        outlines: [...svg.querySelectorAll("polygon.outline")].filter(shown).length,
        selectedPlots: svg.querySelectorAll(".plotg.on").length,
        tabs: [...svg.querySelectorAll(".plotg.on .tab")].filter((tab) => rectOf(tab).width > 0).length,
        gate: shown(svg.querySelector("rect.gate")),
        walks: bands.length,
        listItems: [...document.querySelectorAll("#list li")].filter(shown).length,
        faults,
      };
    });
    expect(location).toEqual({ outlines: 11, selectedPlots: 1, tabs: 1, gate: true, walks: 1, listItems: 1, faults: [] });
    const locationPdf = await cold.page.pdf({ format: "A4", printBackground: true });
    for (const secret of VISITOR_CANARIES) expect(locationPdf.toString("latin1"), secret).not.toContain(secret);

    for (const paper of PAPERS) {
      const facts = pdfFacts(await cold.page.pdf({ format: paper.name }));
      expectPaper(facts, paper, `family file ${paper.name}`);
      for (const secret of VISITOR_CANARIES) expect(facts.bytes.toString("latin1"), secret).not.toContain(secret);
    }
    // The file sets its own page margin, 52 above and below and 60 at the sides, so the picture takes the same.
    await saveProof("family-location-a4", locationPdf, cold.page, "52px 60px");
    await cold.context.close();
    void context;
  });

  test("the plot seeker file, downloaded from the garden, opens from disk with the network off, and prints to A4 and Letter", async ({ page, browser }, testInfo) => {
    const siteId = await (async () => {
      await openPractice(page, GARDEN_APP);
      return siteIdOf(page);
    })();
    await page.goto(`${SITE}allotments/#/r/${siteId}/seeker`);
    await previewPublic(page, /^List this plot:/);
    const file = await download(page, "Download availability copy", (name) => testInfo.outputPath(name));
    expect(file.name).toBe("availability-map-2026-04-20.html");
    for (const secret of AVAILABILITY_CANARIES) expect(file.html, secret).not.toContain(secret);

    const cold = await openOffline(browser, file.path);
    await expect(cold.page.locator("h1")).toHaveText("Thimble Beds");
    await expect(cold.page.locator("#list li").first()).toBeVisible();
    await cold.page.getByRole("button", { name: "Show location" }).first().click();
    await expect(cold.page.locator("#sel")).toBeVisible();
    expect(cold.requests.filter((u) => !u.startsWith("file:") && !u.startsWith("data:") && !u.startsWith("about:"))).toEqual([]);

    await cold.page.emulateMedia({ media: "print" });
    for (const paper of PAPERS) {
      const facts = pdfFacts(await cold.page.pdf({ format: paper.name }));
      expectPaper(facts, paper, `seeker file ${paper.name}`);
      for (const secret of AVAILABILITY_CANARIES) expect(facts.bytes.toString("latin1"), secret).not.toContain(secret);
    }
    await cold.context.close();
  });

  test("a sample file from the site prints to A4 and Letter and is as readable in grays as in colour", async ({ page }) => {
    const plain = await plainTextBrowser.newContext({ baseURL: SITE });
    try {
      for (const [path, heading] of [
        ["visitor/family/family-map-2026-04-20.html", "Lantern Fold"],
        ["visitor/seeker/availability-map-2026-04-20.html", "Thimble Beds"],
      ] as const) {
        await page.goto(`/${path}`);
        await expect(page.locator("h1")).toHaveText(heading);
        await page.emulateMedia({ media: "print" });
        for (const paper of PAPERS) expectPaper(pdfFacts(await page.pdf({ format: paper.name })), paper, `${path} ${paper.name}`);
        await page.emulateMedia({ media: "screen" });

        const shown = await plain.newPage();
        const helper = await plain.newPage();
        await shown.goto(`/${path}`);
        await shown.emulateMedia({ media: "print" });
        const colour = await colourOf(helper, await shown.screenshot({ fullPage: true }));
        expect(colour.coloured / colour.pixels, `${path}: ${colour.coloured} of ${colour.pixels} pixels are not gray in print ${colour.debug}`).toBeLessThan(0.0005);
        await shown.close();
        await helper.close();
      }
    } finally {
      await plain.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The grayscale check (spec 07, task 7.25, L10.2). The site map of each register is drawn in print media on A4, the
// browser makes a PDF of it, and the drawing is turned into a grayscale picture. In that picture each plot state keeps
// its own shape mark, each mark and word is dark on white, and nothing is told by a colour.
//
// What this does and does not show. The headless browser has no viewer for a PDF, so the PDF cannot be turned into a
// picture here. The picture is the same page in print media at the width of A4, as the print documents above are. The
// PDF is checked for its paper size and for every colour operator it holds, which are the colours the browser sent to
// the printer. Neither is a printed page.
// ---------------------------------------------------------------------------------------------------------------------

/** What a reading of a picture asks for: the places to look at, and the boxes to count dark pixels in. */
interface Probe {
  points: { x: number; y: number }[];
  rects: { x: number; y: number; width: number; height: number }[];
}
interface Reading {
  /** The least luma, 0 to 255, in the 3 by 3 pixels round each point. */
  points: number[];
  /** For each box: the dark pixels (luma under 128), the pixel count, the least and the greatest luma, and the dark pixels as a string of 0 and 1. */
  rects: { dark: number; total: number; min: number; max: number; bits: string }[];
}

/** Read a picture in grayscale. Luma weights 0.2126, 0.7152 and 0.0722, as the contrast formula uses. */
async function grayReading(helper: Page, png: Buffer, probe: Probe): Promise<Reading> {
  return helper.evaluate(
    async ({ b64, probe }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx === null) throw new Error("no canvas");
      ctx.drawImage(img, 0, 0);
      const lumaOf = (x: number, y: number, w: number, h: number): number[] => {
        const px = Math.max(0, Math.floor(x));
        const py = Math.max(0, Math.floor(y));
        const pw = Math.max(1, Math.min(img.width - px, Math.ceil(w)));
        const ph = Math.max(1, Math.min(img.height - py, Math.ceil(h)));
        const data = ctx.getImageData(px, py, pw, ph).data;
        const out: number[] = [];
        for (let i = 0; i < data.length; i += 4) out.push(0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number));
        return out;
      };
      return {
        points: probe.points.map((p) => Math.min(...lumaOf(p.x - 1, p.y - 1, 3, 3))),
        rects: probe.rects.map((r) => {
          const luma = lumaOf(r.x, r.y, r.width, r.height);
          return { dark: luma.filter((v) => v < 128).length, total: luma.length, min: Math.min(...luma), max: Math.max(...luma), bits: luma.map((v) => (v < 128 ? "1" : "0")).join("") };
        }),
      };
    },
    { b64: png.toString("base64"), probe },
  );
}

/**
 * Every colour that the PDF sets, as the browser wrote it. A PDF content stream holds `r g b rg` for a fill and
 * `r g b RG` for a stroke. A colour is neutral when its three numbers are close. Streams are deflated, so each is inflated.
 */
function pdfColours(pdf: Buffer): { colours: number; notGray: string[] } {
  const text = pdf.toString("latin1");
  const notGray: string[] = [];
  let colours = 0;
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = (m.index as number) + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end === -1) continue;
    let content: string;
    try {
      content = inflateSync(pdf.subarray(start, end)).toString("latin1");
    } catch {
      continue;
    }
    for (const c of content.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (rg|RG)\b/g)) {
      colours += 1;
      const [r, g, b] = [Number(c[1]), Number(c[2]), Number(c[3])];
      // Neutral as the picture check takes it: the three numbers are within 24 of 255 of each other. The ink of the
      // registers, #22252C, is that near to black.
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24 / 255) notGray.push(c[0]);
    }
  }
  return { colours, notGray };
}

interface Stroke {
  points: { x: number; y: number }[];
}
interface PlotFact {
  state: string;
  needsChecking: boolean;
  selected: boolean;
  fill: string;
  box: { x: number; y: number; width: number; height: number };
  marks: { kind: "slash" | "dot" | "cross"; strokes: Stroke[] }[];
}
interface SheetFacts {
  plots: PlotFact[];
  walk: { stroke: string; count: number };
  tab: { fill: string; box: { x: number; y: number; width: number; height: number }; text: { x: number; y: number; width: number; height: number }; label: string } | undefined;
  selectedInner: Stroke | undefined;
  key: { state: string; checking: boolean; word: string; wordContrast: number; swatch: { x: number; y: number; width: number; height: number }; wordBox: { x: number; y: number; width: number; height: number }; marks: number; dash: string }[];
  title: { text: string; borderStyle: string; borderWidth: string; contrast: number; box: { x: number; y: number; width: number; height: number } };
  notGrayText: string[];
  notGrayGround: string[];
}

/** Read the site map as the page lays it out in print media. Positions are in the page, ready to look up in a full page picture. */
function readSheet(): SheetFacts {
  const sx = window.scrollX;
  const sy = window.scrollY;
  const box = (el: Element): { x: number; y: number; width: number; height: number } => {
    const r = el.getBoundingClientRect();
    return { x: r.left + sx, y: r.top + sy, width: r.width, height: r.height };
  };
  const along = (el: SVGGeometryElement, n: number): { x: number; y: number }[] => {
    const m = el.getScreenCTM() as DOMMatrix;
    const length = el.getTotalLength();
    return Array.from({ length: n }, (_v, i) => {
      const p = el.getPointAtLength((length * (i + 1)) / (n + 1));
      return { x: p.x * m.a + p.y * m.c + m.e + sx, y: p.x * m.b + p.y * m.d + m.f + sy };
    });
  };
  const centre = (el: Element): { x: number; y: number } => {
    const b = box(el);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const contrastOnWhite = (rgb: string): number => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
    if (m === null) return 0;
    const channel = (v: string): number => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 1.05 / (0.2126 * channel(m[1] as string) + 0.7152 * channel(m[2] as string) + 0.0722 * channel(m[3] as string) + 0.05);
  };
  const STATES = ["free", "reserved", "taken", "unusable"];
  const svg = document.querySelector("svg.sheet") as SVGSVGElement;
  const plots: PlotFact[] = [...svg.querySelectorAll(".plot")].map((el) => {
    const group = el.parentElement as Element;
    const marks = [...group.querySelectorAll(":scope > .mark")].map((m) => {
      if (m.tagName.toLowerCase() === "circle") return { kind: "dot" as const, strokes: [{ points: [centre(m)] }] };
      if (m.tagName.toLowerCase() === "g") return { kind: "cross" as const, strokes: [...m.querySelectorAll("line")].map((l) => ({ points: along(l as unknown as SVGGeometryElement, 3) })) };
      return { kind: "slash" as const, strokes: [{ points: along(m as unknown as SVGGeometryElement, 3) }] };
    });
    return {
      state: STATES.find((s) => el.classList.contains(s)) ?? "",
      needsChecking: el.classList.contains("checking"),
      selected: el.classList.contains("selected"),
      fill: getComputedStyle(el).fill,
      box: box(el),
      marks,
    };
  });
  const walkEls = [...svg.querySelectorAll(".path")];
  const tabEl = svg.querySelector(".tab");
  const tabText = svg.querySelector(".tab-text");
  const inner = svg.querySelector(".plot-selected-inner") as unknown as SVGGeometryElement | null;
  const key = [...document.querySelectorAll(".map-key li")].map((li) => {
    const sw = li.querySelector("svg.swatch") as SVGSVGElement;
    const shape = sw.querySelector(".plot") as Element;
    const word = li.querySelector("span") as Element;
    return {
      state: STATES.find((s) => shape.classList.contains(s)) ?? (shape.classList.contains("checking") ? "checking" : ""),
      checking: shape.classList.contains("checking"),
      word: (word.textContent ?? "").trim(),
      wordContrast: contrastOnWhite(getComputedStyle(word).color),
      swatch: box(sw),
      wordBox: box(word),
      marks: sw.querySelectorAll(".mark").length,
      dash: getComputedStyle(shape).strokeDasharray,
    };
  });
  const h1 = document.querySelector("main h1") as Element;
  const h1Style = getComputedStyle(h1);
  const notGrayText: string[] = [];
  const grayOf = (rgb: string, tolerance = 10): boolean => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
    return m !== null && Math.max(Number(m[1]), Number(m[2]), Number(m[3])) - Math.min(Number(m[1]), Number(m[2]), Number(m[3])) <= tolerance;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent === null || (node.textContent ?? "").trim() === "" || !parent.checkVisibility()) continue;
    if (["SCRIPT", "STYLE"].includes(parent.tagName)) continue;
    const style = getComputedStyle(parent);
    const colour = parent instanceof SVGElement ? style.fill : style.color;
    if (!grayOf(colour, 24) || contrastOnWhite(colour) < 7) notGrayText.push(`${parent.tagName.toLowerCase()}.${parent.className} "${(node.textContent ?? "").trim().slice(0, 20)}" is ${colour}`);
  }
  const notGrayGround: string[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!el.checkVisibility()) continue;
    const bg = getComputedStyle(el).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && !grayOf(bg)) notGrayGround.push(`${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className : ""} is ${bg}`);
  }
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  if (!grayOf(bodyBg) || bodyBg === "rgba(0, 0, 0, 0)") notGrayGround.push(`body is ${bodyBg}`);
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  if (!grayOf(htmlBg)) notGrayGround.push(`html is ${htmlBg}`);
  return {
    plots,
    walk: { stroke: walkEls.length === 0 ? "" : getComputedStyle(walkEls[0] as Element).stroke, count: walkEls.length },
    tab: tabEl === null || tabText === null ? undefined : { fill: getComputedStyle(tabEl).fill, box: box(tabEl), text: box(tabText), label: (tabText.textContent ?? "").trim() },
    selectedInner: inner === null ? undefined : { points: along(inner, 3) },
    key,
    title: { text: (h1.textContent ?? "").trim(), borderStyle: h1Style.borderBottomStyle, borderWidth: h1Style.borderBottomWidth, contrast: contrastOnWhite(h1Style.color), box: box(h1) },
    notGrayText,
    notGrayGround,
  };
}

const MAP_APPS = [
  { label: "churchyard", app: CHURCH_APP, chosen: "Y07", own: "Y" },
  { label: "allotment", app: GARDEN_APP, chosen: "B02", own: "B" },
] as const;

for (const contrast of ["standard", "high"] as const) {
  for (const { label, app, chosen } of MAP_APPS) {
    test(`the site map of the ${label} register prints on A4 in grays, with each state kept by its own mark (${contrast} contrast)`, async ({ page }) => {
      void page;
      // A browser with coloured text smoothing off, so that a gray picture can be all gray. The register is opened in it.
      const plain = await plainTextBrowser.newContext({ viewport: { width: PAPERS[0].cssWidth, height: A4_HEIGHT } });
      try {
        await plain.addInitScript((value) => window.localStorage.setItem("plotwarden.settings", JSON.stringify({ motion: "follow", contrast: value, paper: "A4" })), contrast);
        const shown = await plain.newPage();
        const helper = await plain.newPage();
        const requests = trackRequests(shown, SITE);
        await openPractice(shown, app);
        const siteId = siteIdOf(shown);
        const plotId = plotIdOf(await storedEvents(shown, siteId), chosen);
        await shown.goto(`${app.origin}#/r/${siteId}/map?plot=${plotId}`);
        await expect(shown.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
        await expect(shown.locator("svg.sheet .plot.selected")).toHaveCount(1);
        await expect(shown.locator(".map-key li")).toHaveCount(5);
        await shown.emulateMedia({ media: "print" });
        await settle(shown);

        // The PDF the browser makes from the page: A4, and every colour it sets is a gray.
        const pdf = await shown.pdf({ preferCSSPageSize: true, printBackground: true });
        expectPaper(pdfFacts(pdf), PAPERS[0], `${label} site map, ${contrast}`);
        const inPdf = pdfColours(pdf);
        expect(inPdf.colours, "the PDF sets colours").toBeGreaterThan(10);
        expect(inPdf.notGray, `${label} ${contrast}: colours in the PDF that are not gray`).toEqual([]);

        const facts = await shown.evaluate(readSheet);
        const picture = await shown.screenshot({ fullPage: true });

        // 1. Black, white and grays only, in the picture and in the styles.
        const colour = await colourOf(helper, picture);
        expect(colour.coloured / colour.pixels, `${label} ${contrast}: ${colour.coloured} of ${colour.pixels} pixels are not gray ${colour.debug}`).toBeLessThan(0.0005);
        expect(facts.notGrayText, "text that is not black or a dark gray").toEqual([]);
        expect(facts.notGrayGround, "grounds that are not white or gray").toEqual([]);

        // 2. The walk is #DADADA, every plot is white, the chosen plot and its tab are #E6E6E6.
        expect(facts.walk.count).toBeGreaterThan(0);
        expect(facts.walk.stroke).toBe("rgb(218, 218, 218)");
        const chosenPlots = facts.plots.filter((p) => p.selected);
        expect(chosenPlots, "one chosen plot").toHaveLength(1);
        expect(chosenPlots[0]?.fill).toBe("rgb(230, 230, 230)");
        for (const p of facts.plots.filter((q) => !q.selected)) expect(p.fill, `a plot of state ${p.state}`).toBe("rgb(255, 255, 255)");
        expect(facts.tab?.fill).toBe("rgb(230, 230, 230)");
        expect(facts.tab?.label).toBe(chosen);

        // 3. A double rule under the title, in a dark ink.
        expect(facts.title.borderStyle).toBe("double");
        expect(facts.title.borderWidth).toBe("3px");
        expect(facts.title.contrast).toBeGreaterThanOrEqual(7);

        // 4. Each state has its own shape mark and no other, and the mark is dark in the grayscale picture.
        const wanted = { free: [] as string[], reserved: ["slash"], taken: ["dot"], unusable: ["cross"] } as const;
        const probe: Probe = { points: [], rects: [] };
        const owners: string[] = [];
        for (const p of facts.plots) {
          if (p.state === "") continue;
          expect(p.marks.map((m) => m.kind), `a ${p.state} plot has its own mark and no other`).toEqual(wanted[p.state as keyof typeof wanted]);
          for (const m of p.marks) for (const s of m.strokes) for (const pt of s.points) {
            probe.points.push(pt);
            owners.push(`${p.state} ${m.kind}`);
          }
        }
        const present = new Set(facts.plots.map((p) => p.state).filter((s) => s !== ""));
        expect(present.has("taken"), "the practice register shows a taken plot").toBe(true);
        expect(present.size, `the states on the map: ${[...present].join(", ")}`).toBeGreaterThanOrEqual(2);
        // The chosen plot keeps its inner outline and its tab, both dark.
        const inner = facts.selectedInner?.points ?? [];
        expect(inner.length).toBe(3);
        const innerStart = probe.points.length;
        for (const pt of inner) probe.points.push(pt);
        // The key: one swatch and one word for each state, side by side, so none is left to a colour.
        const key = facts.key;
        expect(key.map((k) => k.state)).toEqual(["free", "reserved", "taken", "unusable", "checking"]);
        const swatchStart = probe.rects.length;
        for (const k of key) probe.rects.push(k.swatch);
        const wordStart = probe.rects.length;
        for (const k of key) probe.rects.push(k.wordBox);
        const tabStart = probe.rects.length;
        probe.rects.push(facts.tab?.text ?? { x: 0, y: 0, width: 1, height: 1 });
        const titleStart = probe.rects.length;
        probe.rects.push(facts.title.box);

        const read = await grayReading(helper, picture, probe);
        read.points.slice(0, innerStart).forEach((luma, i) => expect(luma, `${owners[i]} mark is dark at point ${i}`).toBeLessThan(110));
        read.points.slice(innerStart).forEach((luma, i) => expect(luma, `the inner outline of the chosen plot is dark at point ${i}`).toBeLessThan(110));

        // 5. In the key, the shapes are told apart with no colour at all: the dark pixels of each swatch differ from every other swatch.
        const bits = read.rects.slice(swatchStart, swatchStart + 5).map((r) => r.bits);
        const apart = (a: string, b: string): number => [...a].filter((ch, i) => ch !== b[i]).length;
        for (let i = 0; i < 5; i++) {
          expect(bits[i]?.includes("1"), `swatch ${key[i]?.state} has dark pixels`).toBe(true);
          for (let j = i + 1; j < 5; j++) {
            const d = apart(bits[i] as string, bits[j] as string);
            expect(d, `${key[i]?.state} and ${key[j]?.state} differ in ${d} pixels`).toBeGreaterThanOrEqual(6);
          }
        }
        // Each swatch holds the mark of its own state, in the page as well as in the picture.
        expect(key.map((k) => k.marks)).toEqual([0, 1, 1, 1, 0]);
        expect(key.find((k) => k.state === "checking")?.dash, "needs checking is a dotted outline").not.toBe("none");

        // 6. Each word beside its symbol is dark on white: dark pixels on a light ground.
        read.rects.slice(wordStart, wordStart + 5).forEach((r, i) => {
          expect(key[i]?.word, `the key word of ${key[i]?.state}`).not.toBe("");
          expect(r.dark, `the word "${key[i]?.word}" has dark pixels`).toBeGreaterThan(15);
          expect(r.max, `the word "${key[i]?.word}" stands on a light ground`).toBeGreaterThan(220);
          expect(key[i]?.wordContrast, `the word "${key[i]?.word}" on white`).toBeGreaterThanOrEqual(7);
        });
        // The code in the chosen plot's tab and the title are dark too. The tab fill is a light gray that no meaning rests on.
        expect(read.rects[tabStart]?.dark, "the code in the tab is dark").toBeGreaterThan(10);
        expect(read.rects[titleStart]?.dark, "the title is dark").toBeGreaterThan(50);
        expect(requests.external).toEqual([]);
        if (contrast === "standard") {
          mkdirSync(PROOF_DIR, { recursive: true });
          writeFileSync(join(PROOF_DIR, `site-map-${label}-gray-a4.png`), await grayPicture(plain, picture));
        }
      } finally {
        await plain.close();
      }
    });
  }
}

/** The picture in grayscale, as a PNG, for the proof folder. */
async function grayPicture(context: BrowserContext, picture: Buffer): Promise<Buffer> {
  const helper = await context.newPage();
  try {
    const b64 = await helper.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, img.width, img.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.round(0.2126 * (image.data[i] as number) + 0.7152 * (image.data[i + 1] as number) + 0.0722 * (image.data[i + 2] as number));
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1] as string;
    }, picture.toString("base64"));
    return Buffer.from(b64, "base64");
  } finally {
    await helper.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The two visitor files in the look of spec 07 (tasks 7.23 to 7.25, L9 and L10). The sample files of the site are opened,
// as a visitor would, at 360 by 640 and at 1920 by 1080. The values are the ones of the design.
// ---------------------------------------------------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box of the first element that matches, in the page. */
async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  });
}

const styleOf = (page: Page, selector: string, properties: readonly string[]): Promise<Record<string, string>> =>
  page.locator(selector).first().evaluate((el, props) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
  }, properties);

/** The two columns: side by side on a desktop, one under the other on a phone. The legend lies directly under the map. */
async function expectColumns(page: Page, label: string): Promise<void> {
  const find = await rectOf(page, ".col-find");
  const map = await rectOf(page, ".col-map");
  if ((page.viewportSize()?.width ?? 0) >= 1000) {
    expect(map.x, `${label}: the map column stands beside the first`).toBeGreaterThanOrEqual(find.x + find.width - 1);
    expect(Math.abs(map.y - find.y), `${label}: both columns start at the same height`).toBeLessThan(2);
  } else {
    expect(Math.abs(map.x - find.x), `${label}: one column on a phone`).toBeLessThan(2);
    expect(map.y, `${label}: the map comes after the first column`).toBeGreaterThanOrEqual(find.y + find.height - 1);
  }
  const svg = await rectOf(page, "svg.map:visible");
  const legend = await rectOf(page, ".legend");
  expect(Math.abs(legend.y - (svg.y + svg.height)), `${label}: the legend is joined to the bottom of the map`).toBeLessThan(1.5);
  expect(Math.abs(legend.x - svg.x), `${label}: the legend and the map have one left edge`).toBeLessThan(1.5);
  expect(Math.abs(legend.width - svg.width), `${label}: the legend and the map have one width`).toBeLessThan(1.5);
}

test.describe("the sample visitor files in the new look", () => {
  test("the family file: the night band with its amber line, a burial card, two columns, the chosen plot and its tab in amber, and a gray print", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    await page.goto(`/visitor/family/${FAMILY_FILE}`);
    await expect(page.locator("h1")).toHaveText("Lantern Fold");
    const band = await styleOf(page, "header.sky", ["background-color", "border-bottom-width", "border-bottom-style", "border-bottom-color"]);
    expect(band).toEqual({ "background-color": "rgb(35, 42, 92)", "border-bottom-width": "4px", "border-bottom-style": "solid", "border-bottom-color": "rgb(242, 201, 107)" });
    expect((await styleOf(page, "h1", ["font-family"]))["font-family"]).toMatch(/^Georgia,/);
    expect((await styleOf(page, "html", ["font-family"]))["font-family"]).toMatch(/^system-ui,/);
    const card = await styleOf(page, "ul.list li", ["border-top-width", "border-top-left-radius", "border-bottom-left-radius", "background-color"]);
    expect(card).toEqual({ "border-top-width": "2px", "border-top-left-radius": "16px", "border-bottom-left-radius": "2px", "background-color": "rgb(255, 254, 248)" });
    expect(await styleOf(page, ".name", ["font-size", "font-weight"])).toEqual({ "font-size": "24px", "font-weight": "700" });
    expect(await styleOf(page, ".code-tab", ["background-color", "border-top-width"])).toEqual({ "background-color": "rgb(242, 201, 107)", "border-top-width": "2px" });
    await expectColumns(page, "family file");
    // No plot is chosen at first: each is a plain outline.
    expect(await page.locator("svg.map .plotg path.arch").evaluateAll((els) => els.map((e) => getComputedStyle(e).fill))).not.toContain("rgb(242, 201, 107)");
    await page.getByRole("button", { name: "Show location" }).first().click();
    await expect(page.locator(".plotg.on:visible")).toHaveCount(1);
    expect(await styleOf(page, ".plotg.on path.arch", ["fill"])).toEqual({ fill: "rgb(242, 201, 107)" });
    expect(await styleOf(page, ".plotg.on .tab", ["fill"])).toEqual({ fill: "rgb(242, 201, 107)" });
    expect(await styleOf(page, ".legend", ["border-top-width", "border-bottom-width", "border-left-width"])).toEqual({ "border-top-width": "0px", "border-bottom-width": "2px", "border-left-width": "2px" });
    // The page is not wider than the screen, and each target is at least 44 high.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5)).toBe(true);
    for (const button of await page.locator("button:visible").all()) expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(requests.external).toEqual([]);
  });

  test("the plot seeker file: the allotment band with its leaf line, plot cards with a hatched strip, two columns, the chosen bed and its tab in sky blue", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    await page.goto(`/visitor/seeker/${SEEKER_FILE}`);
    await expect(page.locator("h1")).toHaveText("Thimble Beds");
    const band = await styleOf(page, "header.day", ["background-color", "border-bottom-width", "border-bottom-color"]);
    expect(band).toEqual({ "background-color": "rgb(207, 231, 223)", "border-bottom-width": "4px", "border-bottom-color": "rgb(47, 107, 79)" });
    expect((await styleOf(page, "html", ["font-family", "background-color"]))["background-color"]).toBe("rgb(247, 245, 232)");
    expect((await styleOf(page, "h1", ["font-family"]))["font-family"]).not.toMatch(/Georgia/);
    const card = await styleOf(page, "ul.list li", ["border-top-width", "border-top-left-radius", "background-color"]);
    expect(card).toEqual({ "border-top-width": "2px", "border-top-left-radius": "14px", "background-color": "rgb(255, 254, 246)" });
    const strip = await page.locator("ul.list li").first().evaluate((el) => {
      const s = getComputedStyle(el, "::before");
      return { height: s.height, image: s.backgroundImage.slice(0, 26) };
    });
    expect(strip).toEqual({ height: "8px", image: "repeating-linear-gradient(" });
    await expectColumns(page, "seeker file");
    await page.getByRole("button", { name: "Show location" }).first().click();
    await expect(page.locator(".plotg.on:visible")).toHaveCount(1);
    expect(await styleOf(page, ".plotg.on polygon.bed", ["fill"])).toEqual({ fill: "rgb(191, 224, 234)" });
    expect(await styleOf(page, ".plotg.on .tab", ["fill"])).toEqual({ fill: "rgb(191, 224, 234)" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5)).toBe(true);
    for (const button of await page.locator("button:visible").all()) expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(requests.external).toEqual([]);
  });

  for (const [path, heading, chosen] of [
    [`/visitor/family/${FAMILY_FILE}`, "Lantern Fold", ".plotg.on path.arch"],
    [`/visitor/seeker/${SEEKER_FILE}`, "Thimble Beds", ".plotg.on polygon.bed"],
  ] as const) {
    test(`${path.split("/")[2]} file, printed: black on white, the walk #DADADA, the chosen plot and tab #E6E6E6, a double rule under the title, and grays only in the picture and in the PDF`, async () => {
      const plain = await plainTextBrowser.newContext({ baseURL: SITE, viewport: { width: PAPERS[0].cssWidth, height: A4_HEIGHT } });
      try {
        const shown = await plain.newPage();
        const helper = await plain.newPage();
        await shown.goto(path);
        await expect(shown.locator("h1")).toHaveText(heading);
        await shown.getByRole("button", { name: "Show location" }).first().click();
        await expect(shown.locator(".plotg.on:visible")).toHaveCount(1);
        await shown.emulateMedia({ media: "print" });
        expect(await styleOf(shown, "html", ["color", "background-color"])).toEqual({ color: "rgb(0, 0, 0)", "background-color": "rgb(255, 255, 255)" });
        const title = await styleOf(shown, "h1", ["color"]);
        expect(title.color).toBe("rgb(0, 0, 0)");
        const rule = await styleOf(shown, "header", ["border-bottom-style", "border-bottom-width", "border-bottom-color", "background-color"]);
        expect(rule).toEqual({ "border-bottom-style": "double", "border-bottom-width": "3px", "border-bottom-color": "rgb(0, 0, 0)", "background-color": "rgb(255, 255, 255)" });
        expect((await styleOf(shown, ".walk", ["stroke"])).stroke).toBe("rgb(218, 218, 218)");
        expect((await styleOf(shown, chosen, ["fill"])).fill).toBe("rgb(230, 230, 230)");
        expect((await styleOf(shown, ".plotg.on .tab", ["fill"])).fill).toBe("rgb(230, 230, 230)");
        // The chosen plot is told by its double outline and its tab with the code, which are black.
        expect((await styleOf(shown, ".plotg.on .sel-inner", ["stroke"])).stroke).toBe("rgb(0, 0, 0)");
        expect((await styleOf(shown, ".plotg.on .tab-text", ["fill"])).fill).toBe("rgb(0, 0, 0)");
        const picture = await shown.screenshot({ fullPage: true });
        const colour = await colourOf(helper, picture);
        expect(colour.coloured / colour.pixels, `${path}: ${colour.coloured} of ${colour.pixels} pixels are not gray ${colour.debug}`).toBeLessThan(0.0005);
        // The file does not choose a paper, so the person who prints does. A4 is chosen here.
        const pdf = await shown.pdf({ format: "A4", printBackground: true });
        expectPaper(pdfFacts(pdf), PAPERS[0], path);
        const inPdf = pdfColours(pdf);
        expect(inPdf.colours, "the PDF sets colours").toBeGreaterThan(5);
        expect(inPdf.notGray, `${path}: colours in the PDF that are not gray`).toEqual([]);
      } finally {
        await plain.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The mends of tasks 7.23 to 7.25 (spec 07, L9.4 to L9.8 and L10.4), measured in the browser. Each visitor file is
// opened at 360, 1440 and 1920 wide and in print media at 794 wide. What is read is what stands on the screen: the
// drawing that is shown (the page holds two, and shows the one that fits its frame), the tab of the chosen plot, and
// every word of the drawing in pixels after the drawing is scaled to its frame.
//
// The expected values are the floors of the spec, typed here: a tab is 20 to 26 px high, its code is 13 to 15 px and
// bold, every word is 11 to 15 px, the bottom edge of a tab meets the top of its plot within 2 px, and a code shows
// once. They are not read back from the code.
// ---------------------------------------------------------------------------------------------------------------------

interface PxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ShownMap {
  drawings: number;
  shown: number;
  view: string | null;
  scale: number;
  words: { text: string; size: number; weight: number; tab: boolean; box: PxBox }[];
  tab: PxBox | null;
  plot: PxBox | null;
  otherPlots: PxBox[];
  walks: PxBox[];
  gate: PxBox | null;
  samples: number;
  legend: string[];
  frame: PxBox;
}

/** Read the drawing that is shown, as it stands on the screen. The plot that is chosen has class `on`. */
async function readShown(page: Page): Promise<ShownMap> {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll<SVGSVGElement>("svg.map")];
    const shown = all.filter((s) => s.getClientRects().length > 0);
    const svg = shown[0] as SVGSVGElement;
    const style = getComputedStyle(svg);
    const outer = svg.getBoundingClientRect();
    const scale = (outer.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)) / svg.viewBox.baseVal.width;
    const box = (el: Element): { x0: number; y0: number; x1: number; y1: number } => {
      const r = el.getBoundingClientRect();
      return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    };
    const visible = (el: Element): boolean => el.getClientRects().length > 0;
    const chosen = svg.querySelector(".plotg.on");
    const shape = ".arch, .bed";
    return {
      drawings: all.length,
      shown: shown.length,
      view: svg.getAttribute("data-view"),
      scale,
      words: [...svg.querySelectorAll("text")].filter(visible).map((t) => ({
        text: (t.textContent ?? "").trim(),
        size: parseFloat(getComputedStyle(t).fontSize) * scale,
        weight: Number(getComputedStyle(t).fontWeight),
        tab: t.classList.contains("tab-text"),
        box: box(t),
      })),
      tab: chosen?.querySelector(".tab") == null ? null : box(chosen.querySelector(".tab") as Element),
      plot: chosen?.querySelector(shape) == null ? null : box(chosen.querySelector(shape) as Element),
      // Every other plot: the others that can be chosen, and the plain outlines of the family file.
      otherPlots: [...[...svg.querySelectorAll(".plotg")].filter((g) => g !== chosen).map((g) => g.querySelector(shape) as Element), ...svg.querySelectorAll("polygon.outline")].map(box),
      walks: [...svg.querySelectorAll("polyline.walk")].map((w) => {
        const b = box(w);
        // A walk is drawn 12 wide. The box of its line is widened by half of that, in the scale of the drawing.
        return { x0: b.x0 - 6 * scale, y0: b.y0 - 6 * scale, x1: b.x1 + 6 * scale, y1: b.y1 + 6 * scale };
      }),
      gate: svg.querySelector("rect.gate") === null ? null : box(svg.querySelector("rect.gate") as Element),
      samples: svg.querySelectorAll("[class$='-sample']").length,
      legend: [...document.querySelectorAll(".legend li")].map((li) => (li.textContent ?? "").trim()),
      frame: box(svg),
    };
  });
}

const overlapPx = (a: PxBox, b: PxBox): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every fault of the shown drawing against the floors of the spec. Empty when it keeps them. */
function mapFaults(m: ShownMap, label: string): string[] {
  const faults: string[] = [];
  if (m.shown !== 1) faults.push(`${label}: ${m.shown} drawings are shown, not one`);
  for (const w of m.words) {
    if (w.size < 11 - 0.05 || w.size > 15 + 0.05) faults.push(`${label}: "${w.text}" is ${w.size.toFixed(2)} px`);
  }
  if (m.samples > 0) faults.push(`${label}: the drawing writes ${m.samples} sample marks under itself`);
  return faults;
}

/** The tab of the chosen plot against the floors of the spec. */
function tabFaultsOf(m: ShownMap, label: string): string[] {
  const faults: string[] = [];
  const { tab, plot } = m;
  if (tab === null || plot === null) return [`${label}: no tab or no plot is chosen`];
  const high = tab.y1 - tab.y0;
  if (high < 20 - 0.05 || high > 26 + 0.05) faults.push(`${label}: the tab is ${high.toFixed(2)} px high`);
  const text = m.words.filter((w) => w.tab);
  if (text.length !== 1) faults.push(`${label}: ${text.length} codes stand on tabs`);
  for (const w of text) {
    if (w.size < 13 - 0.05 || w.size > 15 + 0.05) faults.push(`${label}: the code on the tab is ${w.size.toFixed(2)} px`);
    if (w.weight < 700) faults.push(`${label}: the code on the tab has weight ${w.weight}`);
  }
  const onTop = Math.abs(tab.y1 - plot.y0) <= 2;
  const onBottom = Math.abs(tab.y0 - plot.y1) <= 2;
  if (!onTop && !onBottom) faults.push(`${label}: the tab touches neither edge: tab ${tab.y0.toFixed(1)} to ${tab.y1.toFixed(1)}, plot ${plot.y0.toFixed(1)} to ${plot.y1.toFixed(1)}`);
  if (Math.abs((tab.x0 + tab.x1) / 2 - (plot.x0 + plot.x1) / 2) > 1) faults.push(`${label}: the tab is not centred on its plot`);
  for (const walk of m.walks) if (overlapPx(tab, walk)) faults.push(`${label}: the tab covers the walk band`);
  if (m.gate !== null && overlapPx(tab, m.gate)) faults.push(`${label}: the tab covers the gate`);
  for (const w of m.words) if (!w.tab && overlapPx(tab, w.box)) faults.push(`${label}: the tab covers "${w.text}"`);
  for (const other of m.otherPlots) if (overlapPx(tab, other)) faults.push(`${label}: the tab covers another plot`);
  return faults;
}

/** Each code shows once among the shown parts of the drawing. */
function codeFaults(m: ShownMap, codes: readonly string[], chosen: string, label: string): string[] {
  const faults: string[] = [];
  for (const code of codes) {
    const count = m.words.filter((w) => w.text === code).length;
    if (count > 1) faults.push(`${label}: the code ${code} shows ${count} times`);
    if (code === chosen && count !== 1) faults.push(`${label}: the chosen code ${chosen} shows ${count} times`);
  }
  return faults;
}

const VISITOR_FILES = [
  { name: "family file", path: `/visitor/family/${FAMILY_FILE}`, heading: "Lantern Fold", gate: "Lantern Gate", walks: ["Yew Walk"], chosen: "Y07", codes: ["Y07"] },
  { name: "plot seeker file", path: `/visitor/seeker/${SEEKER_FILE}`, heading: "Thimble Beds", gate: "Thimble Gate", walks: ["Grass Walk"], chosen: "B03", codes: ["B03", "B05"] },
] as const;

for (const file of VISITOR_FILES) {
  test.describe(`the ${file.name}, measured`, () => {
    for (const size of [
      { width: 360, height: 640, view: "narrow" },
      { width: 1440, height: 900, view: "wide" },
      { width: 1920, height: 1080, view: "wide" },
    ] as const) {
      test(`at ${size.width} wide: one drawing at the size it was made, the tab on its plot, each code once and each name once in the legend`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === "phone", "This test sets its own widths, so it runs once, under the desktop project.");
        const label = `${file.name} at ${size.width}`;
        const requests = trackRequests(page, SITE);
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(file.path);
        await expect(page.locator("h1")).toHaveText(file.heading);
        await page.getByRole("button", { name: "Show location" }).first().click();
        await expect(page.locator(".plotg.on:visible")).toHaveCount(1);
        const m = await readShown(page);
        expect(m.drawings, `${label}: the page holds two drawings`).toBe(2);
        expect(m.view, `${label}: the drawing for this frame`).toBe(size.view);
        expect(m.scale, `${label}: the drawing is shown at the size it was made`).toBeGreaterThan(0.95);
        expect(m.scale, `${label}: the drawing is shown at the size it was made`).toBeLessThan(1.06);
        expect([...mapFaults(m, label), ...tabFaultsOf(m, label), ...codeFaults(m, file.codes, file.chosen, label)]).toEqual([]);
        // One legend. Each name is in it once, and at most once in the drawing.
        for (const name of [file.gate, ...file.walks]) {
          expect(m.legend.filter((entry) => entry === name), `${label}: ${name} in the legend`).toHaveLength(1);
          expect(m.words.filter((w) => w.text === name).length, `${label}: ${name} in the drawing`).toBeLessThanOrEqual(1);
        }
        expect(requests.external).toEqual([]);
      });
    }

    test("in print, 794 wide: the drawing at the size it was made, the tab on its plot, and the title row, columns and rule of the printed sheet", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === "phone", "This test sets its own widths, so it runs once, under the desktop project.");
      const label = `${file.name} in print`;
      await page.setViewportSize({ width: 794, height: 1123 });
      await page.goto(file.path);
      await expect(page.locator("h1")).toHaveText(file.heading);
      await page.getByRole("button", { name: "Show location" }).first().click();
      await expect(page.locator(".plotg.on:visible")).toHaveCount(1);
      await page.emulateMedia({ media: "print" });
      const m = await readShown(page);
      expect(m.view).toBe("wide");
      expect(m.scale).toBeGreaterThan(0.95);
      expect(m.scale).toBeLessThan(1.07);
      expect([...mapFaults(m, label), ...tabFaultsOf(m, label), ...codeFaults(m, file.codes, file.chosen, label)]).toEqual([]);
      for (const name of [file.gate, ...file.walks]) expect(m.legend.filter((entry) => entry === name), `${label}: ${name} in the legend`).toHaveLength(1);

      const layout = await page.evaluate(() => {
        const box = (el: Element): { x0: number; y0: number; x1: number; y1: number } => {
          const r = el.getBoundingClientRect();
          return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
        };
        const one = (selector: string): Element => {
          const found = [...document.querySelectorAll(selector)].find((el) => el.getClientRects().length > 0);
          if (found === undefined) throw new Error(`nothing shown for ${selector}`);
          return found;
        };
        /** The baseline of an element: the bottom of a zero size inline block set on its first line. */
        const baseline = (el: Element): number => {
          const probe = document.createElement("span");
          probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
          el.appendChild(probe);
          const y = probe.getBoundingClientRect().bottom;
          probe.remove();
          return y;
        };
        const title = one("h1");
        const row = one("header .in");
        const date = one("header p");
        const blocks = ["h1", "main h2", "ul.list li", "#map-heading", ".frame", ".legend"].map((s) => ({ s, ...box(one(s)) }));
        const entry = document.querySelector(".entry-a");
        const directions = document.querySelector(".entry-b");
        const legend = getComputedStyle(one(".legend"));
        return {
          title: box(title),
          row: box(row),
          date: box(date),
          dateBaseline: baseline(date),
          titleBaseline: baseline(title),
          blocks,
          entry: entry === null ? null : box(entry),
          directions: directions === null ? null : box(directions),
          entryHeading: entry === null ? null : box(entry.querySelector("h2") as Element),
          directionsHeading: directions === null ? null : box(directions.querySelector("h3") as Element),
          legendTop: { width: parseFloat(legend.borderTopWidth), style: legend.borderTopStyle },
          mapBottom: box(one("svg.map")).y1,
          legendY: box(one(".legend")).y0,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      // Every block starts at the left edge of the title.
      for (const b of layout.blocks) expect(Math.abs(b.x0 - layout.title.x0), `${label}: ${b.s} starts at the left edge of the title`).toBeLessThanOrEqual(1);
      // "As at" is on the right end of the title row, on the baseline of the title.
      expect(Math.abs(layout.date.x1 - layout.row.x1), `${label}: the date meets the right edge of the title row`).toBeLessThanOrEqual(1);
      expect(layout.date.x0, `${label}: the date is right of the title`).toBeGreaterThan(layout.title.x1);
      expect(Math.abs(layout.dateBaseline - layout.titleBaseline), `${label}: the date and the title share a baseline`).toBeLessThanOrEqual(1);
      // A rule joins the map to its legend.
      expect(layout.legendTop, `${label}: a rule between the map and its legend`).toEqual({ width: 2, style: "solid" });
      expect(Math.abs(layout.legendY - layout.mapBottom)).toBeLessThanOrEqual(1.5);
      expect(layout.sideways).toBe(false);
      if (file.name === "family file") {
        // Entrance and Directions stand in two columns that share a top.
        expect(layout.entry).not.toBeNull();
        expect(layout.directions).not.toBeNull();
        const a = layout.entry as PxBox;
        const b = layout.directions as PxBox;
        expect(b.x0, "Directions stands right of Entrance").toBeGreaterThanOrEqual(a.x1 - 1);
        expect(Math.abs(a.y0 - b.y0), "the two columns share a top").toBeLessThanOrEqual(1);
        expect(Math.abs((layout.entryHeading as PxBox).y0 - (layout.directionsHeading as PxBox).y0), "the two headings share a top").toBeLessThanOrEqual(1);
        expect(Math.abs(a.x0 - layout.title.x0), "Entrance starts at the left edge of the title").toBeLessThanOrEqual(1);
      }
    });
  });
}

test("the family file prints the whole map with each tab on its plot, each code once, and no tab over another tab, the walk band or another plot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "This test sets its own widths, so it runs once, under the desktop project.");
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.goto(`/visitor/family/${FAMILY_FILE}`);
  await expect(page.locator("h1")).toHaveText("Lantern Fold");
  await page.evaluate(() => {
    document.body.className = "all-tabs";
  });
  await page.emulateMedia({ media: "print" });
  const whole = await page.evaluate(() => {
    const svg = [...document.querySelectorAll<SVGSVGElement>("svg.map")].find((s) => s.getClientRects().length > 0) as SVGSVGElement;
    const box = (el: Element): { x0: number; y0: number; x1: number; y1: number } => {
      const r = el.getBoundingClientRect();
      return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    };
    const shown = (el: Element): boolean => el.getClientRects().length > 0;
    const style = getComputedStyle(svg);
    const scale = (svg.getBoundingClientRect().width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)) / svg.viewBox.baseVal.width;
    return {
      scale,
      tabs: [...svg.querySelectorAll(".plotg")].flatMap((g) => {
        const tab = g.querySelector(".tab");
        const text = g.querySelector(".tab-text");
        if (tab === null || text === null || !shown(tab)) return [];
        return [{ code: (text.textContent ?? "").trim(), tab: box(tab), plot: box(g.querySelector(".arch") as Element), size: parseFloat(getComputedStyle(text).fontSize) * scale }];
      }),
      walks: [...svg.querySelectorAll("polyline.walk")].map((w) => {
        const b = box(w);
        return { x0: b.x0 - 6 * scale, y0: b.y0 - 6 * scale, x1: b.x1 + 6 * scale, y1: b.y1 + 6 * scale };
      }),
    };
  });
  // The sample file approves one burial, so one plot has a tab. The unit test of the whole map holds five.
  expect(whole.tabs.map((t) => t.code), "every plot with a name has its tab, once").toEqual(["Y07"]);
  const faults: string[] = [];
  whole.tabs.forEach((t, i) => {
    const high = t.tab.y1 - t.tab.y0;
    if (high < 19.95 || high > 26.05) faults.push(`${t.code}: the tab is ${high.toFixed(2)} px high`);
    if (t.size < 12.95 || t.size > 15.05) faults.push(`${t.code}: the code is ${t.size.toFixed(2)} px`);
    for (const walk of whole.walks) if (overlapPx(t.tab, walk)) faults.push(`${t.code}: the tab covers the walk band`);
    whole.tabs.forEach((o, j) => {
      if (j !== i && overlapPx(t.tab, o.tab)) faults.push(`${t.code}: the tab covers the tab ${o.code}`);
      if (j !== i && overlapPx(t.tab, o.plot)) faults.push(`${t.code}: the tab covers the plot ${o.code}`);
    });
    if (Math.abs(t.tab.y1 - t.plot.y0) > 2 && Math.abs(t.tab.y0 - t.plot.y1) > 2) faults.push(`${t.code}: the tab touches neither edge of its plot`);
  });
  expect(faults).toEqual([]);
});

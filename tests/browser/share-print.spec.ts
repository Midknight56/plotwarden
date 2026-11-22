// Share and print, in a real browser, on the assembled site (spec 06, task 6.20, requirement Z15), at 360 by 640
// and at 1920 by 1080. It needs `npm run build:apps` and `npm run assemble:site` first.
//
// Two staff documents (the private register report of each app) and the two visitor print documents are taken
// from the registers as they hand them to the print frame, then drawn in a clean page, in print media, on A4 and
// on US Letter. Each is checked as a page: the paper size in the PDF the browser makes from it, no sideways
// overflow, black and grays only, no script, and the private words. The two visitor files are downloaded from the
// registers, opened cold from disk with the network off, searched, and printed to A4 and to Letter.
//
// What this does not show: a printed page. The browser makes a PDF from the document. No print dialog was driven
// and no paper was used.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium, expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { AVAILABILITY_CANARIES } from "../helpers/gardenCanaries";
import { CHURCH, GARDEN, openPractice, siteIdOf } from "../helpers/routes";
import { APPROVED_NAME, OTHER_OCCUPANT, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { SITE, trackFaults } from "../helpers/siteOrigin";
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
async function expectPrintPage(parent: BrowserContext, html: string, paper: Paper, label: string): Promise<{ text: string; facts: PdfFacts }> {
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
      const { text } = await expectPrintPage(context, html, paper, `garden report ${paper.name}`);
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
      const { text, facts } = await expectPrintPage(context, html, paper, `seeker print ${paper.name}`);
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

    await cold.page.emulateMedia({ media: "print" });
    for (const paper of PAPERS) {
      const facts = pdfFacts(await cold.page.pdf({ format: paper.name }));
      expectPaper(facts, paper, `family file ${paper.name}`);
      for (const secret of VISITOR_CANARIES) expect(facts.bytes.toString("latin1"), secret).not.toContain(secret);
    }
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

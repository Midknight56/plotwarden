// The worn stone beside the inscription in the practice churchyard, on the assembled site with the network off, at
// 360 by 640 and at 1920 by 1080. The picture is on the keeper's burial screen only. The committee file and the
// family file leave out the picture, its file name and the inscription.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { readExchangeFile } from "../../template/src/exchange/schema";
import { sizeOf } from "../helpers/routes";
import { SITE, expectLayout, trackFaults } from "../helpers/siteOrigin";

test.use({ baseURL: SITE });

/** Load the site once so the worker holds the shell, as a keeper's first visit would. */
async function warm(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active === null) throw new Error("no active worker");
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Open the practice churchyard, find Mirel Quillmoss with the one example button, and open the burial. */
async function openBurial(page: Page): Promise<void> {
  await page.goto("/churchyard/#/practice");
  await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
  await page.getByRole("button", { name: "Try Quillmoss", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss \u00b7 Y07" }).getByRole("link", { name: "Open burial" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
}

/** The desk of the practice register, by the same entry a keeper uses. */
async function toDesk(page: Page): Promise<void> {
  await page.goto("/churchyard/#/practice");
  await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
}

const compare = (page: Page): Locator => page.getByRole("region", { name: "Compare photo and words" });

/** The picture is on screen, loaded, and beside the reading on a wide screen and above it on a phone. */
async function expectStoneBesideReading(page: Page): Promise<void> {
  const section = compare(page);
  await expect(section).toBeVisible();
  const picture = section.getByRole("img", { name: /worn stone/i });
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const reading = section.locator("p.inscription");
  expect((await reading.innerText()).split("\n")).toEqual(["IN LOVING MEMORY", "MIREL QUILLMOSS", "OF HOLLOWMERE", "KEEPER OF THE LANTERN FOLD", "REST IN PEACE"]);
  const [p, r] = [await picture.boundingBox(), await reading.boundingBox()];
  if (p === null || r === null) throw new Error("the picture or the reading has no box");
  if (sizeOf(page) === "desktop") {
    expect(p.x + p.width, "the picture ends before the reading begins").toBeLessThanOrEqual(r.x + 1);
    expect(Math.min(p.y + p.height, r.y + r.height) - Math.max(p.y, r.y), "they share a row").toBeGreaterThan(0);
  } else {
    expect(p.y + p.height, "the picture is above the reading").toBeLessThanOrEqual(r.y + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5)).toBe(true);
}

async function download(page: Page, preview: string, button: string): Promise<string> {
  await page.getByRole("button", { name: preview, exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button, exact: true }).click()]);
  return readFileSync(await file.path(), "utf8");
}

async function reviewRules(page: Page): Promise<{ text: string; rules: string[] }> {
  await page.getByRole("link", { name: "Committee review", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
  const text = await download(page, "Preview review file", "Download review file");
  const read = readExchangeFile(new TextEncoder().encode(text));
  if (!read.ok || read.form !== "review") throw new Error(`the download is not a review file: ${JSON.stringify(read)}`);
  return { text, rules: read.packet.issues.map((i) => i.rule).sort() };
}

const PRIVATE_WORDS = ["stone-face", ".webp", "<img", "OF HOLLOWMERE", "Hollowmere", "HOLLOWMERE", "REST IN PEACE", "IN LOVING MEMORY", "KEEPER OF THE LANTERN FOLD"];

async function offlinePage(context: BrowserContext, page: Page): Promise<Page> {
  await warm(page);
  await context.setOffline(true);
  return context.newPage();
}

test.describe("the worn stone in the practice churchyard", () => {
  test("shows a loaded stone picture beside the reading with the network off, in a new register and again in one opened before", async ({ page, context }) => {
    const faults = trackFaults(page);
    const offline = await offlinePage(context, page);
    const failures: string[] = [];
    offline.on("requestfailed", (request) => failures.push(request.url()));

    await openBurial(offline);
    await expectStoneBesideReading(offline);
    await expect(offline.getByText("No stone photos.")).toHaveCount(0);
    await expectLayout(offline);

    // The register was opened before. Reload it and open the burial again, with no network.
    await offline.reload();
    await expect(offline.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await expectStoneBesideReading(offline);
    await offline.goto("/churchyard/#/practice");
    await offline.getByRole("button", { name: "Try Quillmoss", exact: true }).click();
    await offline.getByRole("listitem").filter({ hasText: "Mirel Quillmoss \u00b7 Y07" }).getByRole("link", { name: "Open burial" }).click();
    await expectStoneBesideReading(offline);
    expect(failures).toEqual([]);
    await context.setOffline(false);
    expect(faults.faults).toEqual([]);
  });

  test("shows the picture on no other burial and on no register the keeper started", async ({ page, context }) => {
    const offline = await offlinePage(context, page);
    await offline.goto("/churchyard/#/practice");
    await offline.getByLabel("Name or plot code", { exact: true }).fill("Ysolde");
    await offline.getByRole("button", { name: "Search", exact: true }).click();
    await offline.getByRole("link", { name: "Open burial" }).first().click();
    await expect(offline.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await expect(offline.getByRole("img")).toHaveCount(0);
    await expect(offline.getByText("No stone photos.")).toBeVisible();

    await offline.goto("/churchyard/#/new");
    await offline.getByLabel("Site name").fill("Offline Orchard");
    await offline.getByLabel("Local time zone").selectOption("Europe/London");
    await offline.getByRole("button", { name: "Create register" }).click();
    await expect(offline.getByRole("heading", { level: 1, name: "Offline Orchard" })).toBeVisible();
    await expect(offline.getByRole("img", { name: /worn stone/i })).toHaveCount(0);
    await context.setOffline(false);
  });

  test("leaves the picture and the inscription out of the committee file and the family file, and reviewing the reading leaves one check", async ({ page, context }) => {
    const offline = await offlinePage(context, page);
    await openBurial(offline);
    await expectStoneBesideReading(offline);
    await expect(offline.getByRole("button", { name: "Review reading", exact: true })).toBeVisible();

    await toDesk(offline);
    const before = await reviewRules(offline);
    expect(before.rules).toEqual(["placement_missing", "reading_unclear"]);
    for (const word of [...PRIVATE_WORDS, "Mirel", "Quillmoss"]) expect(before.text, word).not.toContain(word);

    await offline.goto("/churchyard/#/practice");
    await offline.getByRole("button", { name: "Try Quillmoss", exact: true }).click();
    await offline.getByRole("listitem").filter({ hasText: "Mirel Quillmoss \u00b7 Y07" }).getByRole("link", { name: "Open burial" }).click();
    await offline.getByRole("button", { name: "Review reading", exact: true }).click();
    await expect(offline.getByText("Reading checked. Saved on this device.")).toBeVisible();
    await offline.reload();
    await expect(offline.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await expect(offline.getByText("Marked for another reading.")).toHaveCount(0);
    await expectStoneBesideReading(offline);

    await toDesk(offline);
    const after = await reviewRules(offline);
    expect(after.rules).toEqual(["placement_missing"]);
    for (const word of [...PRIVATE_WORDS, "Mirel", "Quillmoss"]) expect(after.text, word).not.toContain(word);

    await toDesk(offline);
    await offline.getByRole("link", { name: "Make a family map" }).click();
    const family = await download(offline, "Preview as a visitor", "Download family copy");
    expect(family).toContain("Mirel Quillmoss");
    for (const word of PRIVATE_WORDS) expect(family, word).not.toContain(word);
    await context.setOffline(false);
  });
});

// What the browser specs of the assembled site share. Test helper. The template never imports it.
import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";
import { measureLayout } from "./measureLayout";
import { sizeOf } from "./routes";

/** The assembled site, served by `npm run preview`. */
export const SITE = "http://127.0.0.1:4174/";

/** The two sample visitor files, as the build names them. */
export const FAMILY_FILE = "family-map-2026-04-20.html";
export const SEEKER_FILE = "availability-map-2026-04-20.html";

/** Everything a page logs that a person would call a fault: a console error or warning, and a script error. */
export function trackFaults(page: Page): { faults: string[] } {
  const log = { faults: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") log.faults.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => log.faults.push(`pageerror: ${error.message}`));
  return log;
}

/** Every response that is not a success or a redirect, with its address. A missing picture shows here. */
export function trackFailures(page: Page): { failures: string[] } {
  const log = { failures: [] as string[] };
  page.on("response", (response: Response) => {
    if (response.status() >= 400) log.failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => log.failures.push(`failed ${request.url()}`));
  return log;
}

/** Every `<img>` on the page has loaded. A page with none passes. */
export async function expectNoMissingPictures(page: Page): Promise<void> {
  const broken = await page.evaluate(() => [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.currentSrc || img.src));
  expect(broken).toEqual([]);
}

/** The layout measures of the shared helper, with no exclusion. */
export async function expectLayout(page: Page): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
}

/** Save one small picture of a whole page, as proof of how it looked. Phone and desktop are both kept. */
export async function saveProof(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `docs/acceptance/layout/site/${name}-${sizeOf(page)}.jpg`, type: "jpeg", quality: 60, fullPage: true });
}

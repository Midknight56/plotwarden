// What the browser specs of the assembled site share. Test helper. The template never imports it.
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";
import { measureLayout } from "./measureLayout";
import { restPointer, sizeOf } from "./routes";

/** The assembled site, served by `npm run preview`. */
export const SITE = "http://127.0.0.1:4174/";

/**
 * The same files, served by `npm run preview:pretty`, which answers as the live host does: `x/index.html` goes to `x/`
 * and `name.html` goes to `name` with a 308, and the clean address gives the file. Started by `playwright.config.ts`.
 */
export const SITE_PRETTY = "http://127.0.0.1:4182/";

/** The two hosts that the offline checks run against. */
export const HOSTS = [
  { name: "a host that serves each file at its own address", origin: SITE },
  { name: "a host that redirects .html addresses to clean ones", origin: SITE_PRETTY },
] as const;

/** The two sample visitor files, as the build names them. */
export const FAMILY_FILE = "family-map-2026-04-20.html";
export const SEEKER_FILE = "availability-map-2026-04-20.html";

/** The two register cards of the hub. */
export type HubRegister = "churchyard" | "allotment";
const HUB_CARD: Readonly<Record<HubRegister, string>> = { churchyard: "Churchyard Register", allotment: "Allotment Register" };

/** The card of one register on the hub. Each card holds its own two buttons. */
export function hubCard(page: Page, which: HubRegister): Locator {
  return page.getByRole("article", { name: HUB_CARD[which], exact: true });
}

/** From the hub, press "Try the practice register" on one card. One press. */
export async function tryPracticeFromHub(page: Page, which: HubRegister): Promise<void> {
  await page.goto("/");
  await hubCard(page, which).getByRole("link", { name: "Try the practice register" }).click();
}

/** From the hub, press "Start your own" on one card. */
export async function startOwnFromHub(page: Page, which: HubRegister): Promise<void> {
  await page.goto("/");
  await hubCard(page, which).getByRole("link", { name: "Start your own" }).click();
}

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

/**
 * Wait until no animation or transition that has an end is still running. An animation that never ends (the band mist)
 * is left out, because it would hold the wait for ever. The Review Desk fades its screens in, and a picture taken during
 * the fade shows it washed out. Two frames first, so an animation that starts on the next frame is seen.
 */
export async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      const timing = a.effect?.getComputedTiming();
      return timing === undefined || timing.iterations === Infinity || a.playState === "finished" || a.playState === "idle";
    }),
  );
}

/** Save one small picture of a whole page, as proof of how it looked. Phone and desktop are both kept. The pointer is off every control first. */
export async function saveProof(page: Page, name: string, folder = "docs/acceptance/layout/site"): Promise<void> {
  await settleMotion(page);
  await restPointer(page);
  await page.screenshot({ path: `${folder}/${name}-${sizeOf(page)}.jpg`, type: "jpeg", quality: 60, fullPage: true });
}

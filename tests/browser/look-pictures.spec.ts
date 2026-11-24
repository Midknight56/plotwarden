// Pictures of every screen of the new look at 360, 1440 and 1920 wide (spec 07, task 7.28). The assembled site is
// opened in headless Chromium on one machine, each screen is drawn at the three widths, and a whole page picture of
// each is saved in docs/acceptance/look. A picture is taken after the fonts are loaded, after any fade has ended, and
// with the pointer off every control.
//
// The spec asks for three widths and the project list has two, so this test runs once, under the desktop project, and
// sets the width itself. What it shows: how each screen looked in that browser. It is not a comparison with the
// mockups and no person has looked at it for this test. The only check it makes is that the page is not wider than the
// screen.
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { CHURCH, GARDEN, openPractice, plotIdOf, restPointer, settle, siteIdOf, storedEvents } from "../helpers/routes";
import { FAMILY_FILE, SEEKER_FILE, SITE, settleMotion } from "../helpers/siteOrigin";

test.use({ baseURL: SITE });

const FOLDER = "docs/acceptance/look";
const WIDTHS = [
  { width: 360, height: 640 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const CHURCH_APP = { ...CHURCH, origin: `${SITE}churchyard/` };
const GARDEN_APP = { ...GARDEN, origin: `${SITE}allotments/` };

interface Screen {
  name: string;
  /** The address to open, from the origin of the site. */
  address: string;
  /** What to wait for and do once the address is open. */
  ready: (page: Page) => Promise<void>;
}

async function pictureOf(page: Page, screen: Screen): Promise<void> {
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.goto(screen.address);
    await page.reload();
    await screen.ready(page);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await settleMotion(page);
    await restPointer(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5), `${screen.name} at ${size.width} is wider than the screen`).toBe(true);
    await page.screenshot({ path: `${FOLDER}/${screen.name}-${size.width}.jpg`, type: "jpeg", quality: 60, fullPage: true });
  }
}

const registerReady = async (page: Page): Promise<void> => settle(page);
const headingReady = (name: string | RegExp) => async (page: Page): Promise<void> => {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await settle(page);
};

test("pictures of every screen at 360, 1440 and 1920 wide", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "This test sets its own three widths, so it runs once, under the desktop project.");
  test.setTimeout(900_000);
  mkdirSync(FOLDER, { recursive: true });
  await page.setViewportSize(WIDTHS[1]);

  // The registers are opened once each, to learn the IDs that the addresses need.
  await openPractice(page, CHURCH_APP);
  const churchSite = siteIdOf(page);
  const yew = plotIdOf(await storedEvents(page, churchSite), "Y07");
  await openPractice(page, GARDEN_APP);
  const gardenSite = siteIdOf(page);
  const bed = plotIdOf(await storedEvents(page, gardenSite), "B02");

  const church = (route: string): string => `${CHURCH_APP.origin}#/r/${churchSite}${route}`;
  const garden = (route: string): string => `${GARDEN_APP.origin}#/r/${gardenSite}${route}`;
  const screens: Screen[] = [
    { name: "start-page", address: SITE, ready: headingReady("Plotwarden") },
    { name: "churchyard-desk", address: church(`?plot=${yew}`), ready: registerReady },
    { name: "churchyard-site-map", address: church(`/map?plot=${yew}`), ready: registerReady },
    { name: "churchyard-plot-record", address: church(`/plot/${yew}`), ready: registerReady },
    { name: "churchyard-record-a-burial", address: church("/burial/new"), ready: registerReady },
    { name: "churchyard-committee-review", address: church("/exchange"), ready: registerReady },
    { name: "churchyard-settings", address: church("/settings"), ready: registerReady },
    { name: "churchyard-start-a-register", address: `${CHURCH_APP.origin}#/new`, ready: headingReady(/./) },
    { name: "allotment-desk", address: garden(`?plot=${bed}`), ready: registerReady },
    { name: "allotment-site-map", address: garden(`/map?plot=${bed}`), ready: registerReady },
    { name: "allotment-plot-record", address: garden(`/plot/${bed}`), ready: registerReady },
    { name: "allotment-make-an-offer", address: garden("/offer"), ready: registerReady },
    { name: "allotment-season-fees", address: garden("/payments"), ready: registerReady },
    { name: "allotment-committee-review", address: garden("/exchange"), ready: registerReady },
    { name: "allotment-settings", address: garden("/settings"), ready: registerReady },
    { name: "allotment-start-a-register", address: `${GARDEN_APP.origin}#/new`, ready: headingReady(/./) },
    {
      name: "family-map-file",
      address: `${SITE}visitor/family/${FAMILY_FILE}`,
      ready: async (p) => {
        await expect(p.locator("h1")).toHaveText("Lantern Fold");
        await p.getByRole("button", { name: "Show location" }).first().click();
        await expect(p.locator(".plotg.on:visible")).toHaveCount(1);
      },
    },
    {
      name: "plot-seeker-file",
      address: `${SITE}visitor/seeker/${SEEKER_FILE}`,
      ready: async (p) => {
        await expect(p.locator("h1")).toHaveText("Thimble Beds");
        await p.getByRole("button", { name: "Show location" }).first().click();
        await expect(p.locator(".plotg.on:visible")).toHaveCount(1);
      },
    },
    { name: "review-desk", address: `${SITE}review/`, ready: async (p) => expect(p.getByText("Bring the checks from your registers to one meeting.")).toBeVisible() },
  ];
  for (const screen of screens) await pictureOf(page, screen);
});

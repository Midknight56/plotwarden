// The map on the first screen of each register opens a plot's record, as the Site map does. A click, a tap, or Enter
// and Space on a drawn plot goes straight to that plot. A drag and a press on open ground do nothing. The keyboard
// reaches the plots with one tab stop. Back returns to the home with the search that was there.
// The list "Choose a plot" with "Open plot" does the same for a person who cannot hit a small shape, and the home layout is measured.
// Both registers, 360 by 640 and 1920 by 1080 as set by the project config.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { measureLayout } from "../helpers/measureLayout";
import { CHURCH, GARDEN, openPractice } from "../helpers/routes";
import type { AppUnderTest } from "../helpers/routes";

test.use({ hasTouch: true });

const CASES: { app: AppUnderTest; code: string; other: string; search: string }[] = [
  { app: CHURCH, code: "Y07", other: "Y02", search: "Y0" },
  { app: GARDEN, code: "B03", other: "B01", search: "B0" },
];

const plotButton = (page: Page, code: string) => page.getByRole("button", { name: new RegExp(`^Open plot ${code}\\b`) });
/** The search box of the home, found by its role inside the search form, whatever the register calls it. */
const searchBox = (page: Page) => page.getByRole("search").getByRole("textbox");
const focusedPlotId = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el !== null && el.matches('svg.sheet g[role="button"][data-plot-id]') ? (el.getAttribute("data-plot-id") ?? "") : "";
  });

/** Press Tab from the page heading until a map plot has focus, as a keyboard user does. Fails after 20 presses. */
async function tabToPlot(page: Page): Promise<string> {
  await page.evaluate(() => {
    const h = document.querySelector<HTMLElement>("main h1");
    if (h === null) throw new Error("no page heading");
    h.tabIndex = -1;
    h.focus();
  });
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const id = await focusedPlotId(page);
    if (id !== "") return id;
  }
  throw new Error("Tab did not reach a map plot in 20 presses");
}

const recordOf = (page: Page) => new URL(page.url()).hash.split("?")[0] ?? "";

async function idOf(page: Page, code: string): Promise<string> {
  const id = await plotButton(page, code).getAttribute("data-plot-id");
  if (id === null) throw new Error(`no plot ${code} on the home map`);
  return id;
}

/** The centre of a drawn plot on screen, after the map has been scrolled until it shows. */
async function centreOf(page: Page, code: string): Promise<{ x: number; y: number }> {
  const shape = plotButton(page, code).locator(".plot").first();
  await shape.scrollIntoViewIfNeeded();
  const box = await shape.boundingBox();
  if (box === null) throw new Error(`plot ${code} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

for (const { app, code, other, search } of CASES) {
  test.describe(`${app.title} home map`, () => {
    test.beforeEach(async ({ page }) => {
      await openPractice(page, app);
      await expect(page.getByRole("region", { name: "Site map" })).toBeVisible();
    });

    test("a click on a drawn plot opens its record", async ({ page }) => {
      const id = await idOf(page, code);
      const at = await centreOf(page, code);
      await page.mouse.click(at.x, at.y);
      await expect(page).toHaveURL(new RegExp(`/plot/${id}$`));
    });

    test("a tap on a drawn plot opens its record", async ({ page }) => {
      const id = await idOf(page, other);
      const at = await centreOf(page, other);
      await page.touchscreen.tap(at.x, at.y);
      await expect(page).toHaveURL(new RegExp(`/plot/${id}$`));
    });

    test("a drag that starts on a plot opens nothing", async ({ page }) => {
      const before = page.url();
      const at = await centreOf(page, code);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 40, at.y + 40, { steps: 4 });
      await page.mouse.up();
      expect(page.url()).toBe(before);
    });

    test("Tab reaches the map, an arrow key moves to another plot, and Enter opens the focused one", async ({ page }) => {
      const first = await tabToPlot(page);
      expect(await page.locator('svg.sheet g[role="button"][tabindex="0"]').count()).toBe(1);
      let moved = first;
      for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
        await page.keyboard.press(key);
        moved = await focusedPlotId(page);
        if (moved !== first) break;
      }
      expect(moved).not.toBe(first);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/plot/${moved}$`));
    });

    test("the list opens the chosen plot and the home layout passes the measurement", async ({ page }) => {
      const id = await idOf(page, other);
      const chooser = page.getByLabel("Choose a plot", { exact: true });
      await chooser.selectOption(id);
      await expect(page.getByRole("link", { name: "Open plot", exact: true })).toHaveCount(1);
      expect(await measureLayout(page)).toEqual([]);
      await page.getByRole("link", { name: "Open plot", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/plot/${id}$`));
    });

    test("the keyboard reaches one plot stop and Enter and Space open records", async ({ page }) => {
      await plotButton(page, code).focus();
      const stops = await page.locator('svg.sheet g[role="button"][tabindex="0"]').count();
      expect(stops).toBe(1);
      const id = await idOf(page, code);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/plot/${id}$`));
      await page.goBack();
      await expect(page.getByRole("region", { name: "Site map" })).toBeVisible();
      const otherId = await idOf(page, other);
      await plotButton(page, other).focus();
      await page.keyboard.press("Space");
      await expect(page).toHaveURL(new RegExp(`/plot/${otherId}$`));
    });

    test("Back returns to the home with the search kept", async ({ page }) => {
      await searchBox(page).fill(search);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const home = recordOf(page);
      await plotButton(page, code).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/plot\//);
      await page.goBack();
      expect(recordOf(page)).toBe(home);
      await expect(searchBox(page)).toHaveValue(search);
    });
  });
}

// A tap or a click on a drawn plot of the Site map opens that plot's own record at once, also when it is already the
// chosen plot. The list "Choose a plot" with "Open plot" stays as the second route, and the plots are also buttons with
// one roving tab stop: arrow keys move, Enter and Space open (both registers, 360 by 640 and 1920 by 1080, at 100 and
// 200 percent of map zoom). A drag, a tap on a path and a tap on ground between plots leave the map and the choice as
// they were. A finger that lands between small plots opens nothing. Back returns to the map with the plot and the date.
// To run against a live site, set PLOTWARDEN_CHURCH_URL and PLOTWARDEN_GARDEN_URL to the two app URLs, such as a live site's churchyard and allotments paths.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { measureLayout } from "../helpers/measureLayout";
import { CHURCH, GARDEN, openPractice, registerRoute, settle, siteIdOf, sizeOf } from "../helpers/routes";
import type { AppUnderTest } from "../helpers/routes";

test.use({ hasTouch: true });

// The field is named origin by the helpers, but it holds the whole app URL, path included.
const live = (app: AppUnderTest, name: string): AppUnderTest => ({ ...app, origin: process.env[name] ?? app.origin });
const CHURCH_UT = live(CHURCH, "PLOTWARDEN_CHURCH_URL");
const GARDEN_UT = live(GARDEN, "PLOTWARDEN_GARDEN_URL");
const CASES: { app: AppUnderTest; code: string; other: string }[] = [
  { app: CHURCH_UT, code: "Y07", other: "Y02" },
  { app: GARDEN_UT, code: "B03", other: "B01" },
];
const ZOOMS = [
  { name: "100 percent", presses: 0, words: "Zoom 100 percent" },
  { name: "200 percent", presses: 2, words: "Zoom 200 percent" },
];
const AS_AT = "2026-01-15";

async function openMap(page: Page, app: AppUnderTest, zoomPresses: number, words: string): Promise<void> {
  await openPractice(page, app);
  await registerRoute(page, siteIdOf(page), "map");
  await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
  await settle(page);
  for (let i = 0; i < zoomPresses; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText(words)).toBeVisible();
}

const chooser = (page: Page) => page.getByLabel("Choose a plot", { exact: true });

/** Everything a person can read about the choice: the field, the address, the line and the link to the record. */
async function choice(page: Page): Promise<{ value: string; shown: string; plotInAddress: string; asAt: string; date: string; record: string | null }> {
  const value = await chooser(page).inputValue();
  const region = page.getByRole("region", { name: "Selected plot" });
  const shown = value === "" ? await chooser(page).evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent ?? "") : await region.innerText();
  const hash = new URL(page.url()).hash;
  const query = new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "");
  return {
    value,
    shown,
    plotInAddress: query.get("plot") ?? "",
    asAt: query.get("asAt") ?? "",
    date: await page.getByLabel("Show the site as at", { exact: true }).inputValue(),
    record: value === "" ? null : await region.getByRole("link", { name: "Open plot" }).getAttribute("href"),
  };
}

/** The ID of a plot as the list holds it, from its code. */
async function idOf(page: Page, code: string): Promise<string> {
  const value = await chooser(page).locator("option", { hasText: new RegExp(`^${code} `) }).first().getAttribute("value");
  if (value === null || value === "") throw new Error(`no plot ${code} in the list`);
  return value;
}

/** The centre of a plot on screen, after the map has been scrolled until the plot shows. */
async function centreOf(page: Page, code: string): Promise<{ x: number; y: number }> {
  const shape = page.locator(`svg.sheet g[data-plot-id="${await idOf(page, code)}"] .plot`).first();
  await shape.scrollIntoViewIfNeeded();
  const box = await shape.boundingBox();
  if (box === null) throw new Error(`plot ${code} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function clearChoice(page: Page): Promise<void> {
  await chooser(page).selectOption({ label: "No plot chosen" });
  await expect(chooser(page)).toHaveValue("");
}

/** The plot ID of the map plot that really has focus, or "" when focus is elsewhere. */
const focusedPlotId = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el !== null && el.matches('svg.sheet g[role="button"][data-plot-id]') ? (el.getAttribute("data-plot-id") ?? "") : "";
  });

/**
 * Press Tab from the page heading until a map plot has focus. The heading is where focus lands after a page change,
 * so this is the path a keyboard user takes. Fails after 12 presses.
 */
async function tabToPlot(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = document.querySelector<HTMLElement>("main h1");
    if (h === null) throw new Error("no page heading");
    h.tabIndex = -1;
    h.focus();
  });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if ((await focusedPlotId(page)) !== "") return;
  }
  throw new Error("Tab did not reach a map plot in 12 presses");
}
/**
 * The middle of the ground between the two plots that stand side by side with the least ground between them, after the
 * map and the page are scrolled to it. The point is read again after the scroll, and it is checked: inside the sheet,
 * inside the viewport, strictly between the two plot footprints, and the top element there belongs to the same sheet.
 */
async function gapPoint(page: Page): Promise<{ x: number; y: number }> {
  const found = await page.evaluate(async () => {
    const svg = document.querySelector<SVGSVGElement>("svg.sheet");
    if (svg === null) return { error: "no sheet" };
    const shapes = [...svg.querySelectorAll<SVGGraphicsElement>(".plot")];
    const rects = () => shapes.map((e) => e.getBoundingClientRect());
    let best: { a: number; b: number; gap: number } | null = null;
    const first = rects();
    first.forEach((a, ia) => {
      first.forEach((b, ib) => {
        if (a.width === 0 || b.width === 0) return;
        const gap = b.left - a.right;
        if (gap <= 0 || Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) > 4) return;
        if (best === null || gap < best.gap) best = { a: ia, b: ib, gap };
      });
    });
    if (best === null) return { error: "no two plots side by side" };
    const pair: { a: number; b: number } = best;
    const mid = (r: DOMRect[]) => {
      const a = r[pair.a] as DOMRect;
      const b = r[pair.b] as DOMRect;
      return { a, b, x: (a.right + b.left) / 2, y: (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2 };
    };
    const holder = svg.parentElement as HTMLElement;
    const m0 = mid(first);
    holder.scrollLeft += m0.x - (holder.getBoundingClientRect().left + holder.clientWidth / 2);
    window.scrollBy(0, m0.y - window.innerHeight / 2);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const { a, b, x, y } = mid(rects());
    const s = svg.getBoundingClientRect();
    const h = holder.getBoundingClientRect();
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      inSheet: x > s.left && x < s.right && y > s.top && y < s.bottom && x > h.left && x < h.right && y > h.top && y < h.bottom,
      inViewport: x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight,
      between: x > a.right && x < b.left && y > Math.max(a.top, b.top) && y < Math.min(a.bottom, b.bottom),
      hitInSheet: hit !== null && (hit === svg || svg.contains(hit)),
      top: hit === null ? "nothing" : hit.tagName.toLowerCase(),
    };
  });
  if ("error" in found) throw new Error(`no ground between plots: ${found.error}`);
  expect(found, `ground point at ${found.x}, ${found.y} (top element ${found.top})`).toMatchObject({ inSheet: true, inViewport: true, between: true, hitInSheet: true });
  return { x: found.x, y: found.y };
}
/** Choose a plot the way a keyboard user does: focus the field and type the code. */
async function byKeyboard(page: Page, code: string): Promise<void> {
  await chooser(page).focus();
  await page.keyboard.type(code);
  await expect(chooser(page)).not.toHaveValue("");
}

for (const { app, code, other } of CASES) {
  for (const zoom of ZOOMS) {
    test.describe(`${app.title} at ${zoom.name} of map zoom`, () => {
      test.beforeEach(async ({ page }) => {
        await openMap(page, app, zoom.presses, zoom.words);
        await page.getByLabel("Show the site as at", { exact: true }).fill(AS_AT);
        await expect(page.getByRole("heading", { level: 2, name: `As at ${AS_AT}` })).toBeVisible();
      });

      test(`a tap or a click on ${code} opens its own record, also when it is already chosen, and Back returns to the map with the plot and the date`, async ({ page }) => {
        // The list route still chooses a plot and "Open plot" still opens it.
        await byKeyboard(page, code);
        const keyboard = await choice(page);
        expect(keyboard.shown).toContain(`${code} \u00b7`);
        expect(keyboard.plotInAddress).toBe(keyboard.value);
        expect(keyboard.asAt).toBe(AS_AT);
        await page.getByRole("link", { name: "Open plot", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/plot/${keyboard.value}$`));
        await page.goBack();
        await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
        await clearChoice(page);

        // A finger on a plot that is not chosen: one tap opens the record.
        const finger = await centreOf(page, code);
        await page.touchscreen.tap(finger.x, finger.y);
        await expect(page).toHaveURL(new RegExp(`/plot/${keyboard.value}$`));
        await expect(page.getByRole("heading", { level: 1, name: new RegExp(code) })).toBeVisible();

        // Back keeps the chosen plot and the date.
        await page.goBack();
        await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
        await expect(chooser(page)).toHaveValue(keyboard.value);
        expect((await choice(page)).date).toBe(AS_AT);
        expect((await choice(page)).asAt).toBe(AS_AT);

        // A mouse on the plot that is already chosen opens it too.
        const at = await centreOf(page, code);
        await page.mouse.click(at.x, at.y);
        await expect(page).toHaveURL(new RegExp(`/plot/${keyboard.value}$`));
        await expect(page.getByRole("heading", { level: 1, name: new RegExp(code) })).toBeVisible();
        await page.goBack();
        await expect(chooser(page)).toHaveValue(keyboard.value);
      });

      test(`the keyboard reaches the plots with one tab stop, arrows move, Enter opens ${code} and Space opens another plot`, async ({ page }) => {
        const stops = page.locator('svg.sheet g[role="button"][data-plot-id][tabindex="0"]');
        await expect(stops).toHaveCount(1);
        expect(await page.locator('svg.sheet g[role="button"][data-plot-id]').count()).toBeGreaterThan(3);
        const id = await idOf(page, code);
        await expect(page.locator(`svg.sheet g[role="button"][data-plot-id="${id}"]`)).toHaveAttribute("aria-label", new RegExp(`^Open plot ${code} \u00b7 `));

        // The list route: choosing the plot makes it the map's one tab stop, and its Open plot goes to that record.
        await byKeyboard(page, code);
        expect(await page.getByRole("region", { name: "Selected plot" }).getByRole("link", { name: "Open plot", exact: true }).getAttribute("href")).toMatch(new RegExp(`/plot/${id}$`));
        await expect(page.locator(`svg.sheet g[role="button"][data-plot-id="${id}"]`)).toHaveAttribute("tabindex", "0");

        // Tab from the page heading, the keyboard alone, reaches that plot. The link "Open plot list" is passed over.
        await tabToPlot(page);
        expect(await focusedPlotId(page)).toBe(id);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`/plot/${id}$`));
        await expect(page.getByRole("heading", { level: 1, name: new RegExp(code) })).toBeVisible();

        // Back: the plot is still chosen, the date holds, and Tab reaches the same plot again.
        await page.goBack();
        await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
        await expect(chooser(page)).toHaveValue(id);
        expect((await choice(page)).asAt).toBe(AS_AT);
        await expect(stops).toHaveCount(1);
        await tabToPlot(page);
        expect(await focusedPlotId(page)).toBe(id);

        // Home and End go to the first and the last plot. The arrows move to other plots. Each move hands the one tab
        // stop to the plot that has focus.
        await page.keyboard.press("Home");
        const first = await focusedPlotId(page);
        await page.keyboard.press("End");
        const last = await focusedPlotId(page);
        expect(first).not.toBe("");
        expect(last).not.toBe("");
        expect(last).not.toBe(first);
        await page.keyboard.press("Home");
        expect(await focusedPlotId(page)).toBe(first);
        const seen = new Set([first]);
        for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
          const before = await focusedPlotId(page);
          await page.keyboard.press(key);
          const after = await focusedPlotId(page);
          expect(after).not.toBe("");
          seen.add(after);
          await expect(page.locator(`svg.sheet g[role="button"][data-plot-id="${after}"]`)).toHaveAttribute("tabindex", "0");
          if (after !== before) await expect(page.locator(`svg.sheet g[role="button"][data-plot-id="${before}"]`)).toHaveAttribute("tabindex", "-1");
          await expect(stops).toHaveCount(1);
        }
        expect(seen.size).toBeGreaterThan(1);
        // Move to a plot that is not the chosen one, by arrow keys only.
        for (let i = 0; i < 6 && (await focusedPlotId(page)) === id; i++) await page.keyboard.press(i % 2 === 0 ? "ArrowRight" : "ArrowDown");
        const second = await focusedPlotId(page);
        expect(second).not.toBe("");
        expect(second).not.toBe(id);

        // One Tab leaves the map, and Shift and Tab come back to the same plot: the plots are one stop.
        await page.keyboard.press("Tab");
        expect(await focusedPlotId(page)).toBe("");
        await page.keyboard.press("Shift+Tab");
        expect(await focusedPlotId(page)).toBe(second);

        // Space opens that second plot's own record.
        const secondCode = /^Open plot (\S+) /.exec((await page.locator(`svg.sheet g[role="button"][data-plot-id="${second}"]`).getAttribute("aria-label")) ?? "")?.[1] ?? "";
        expect(secondCode).not.toBe("");
        await page.keyboard.press("Space");
        await expect(page).toHaveURL(new RegExp(`/plot/${second}$`));
        await expect(page.getByRole("heading", { level: 1, name: new RegExp(secondCode) })).toBeVisible();
      });
      test("a drag, a tap on a path and a tap on open ground keep the choice as it was", async ({ page }) => {
        await byKeyboard(page, code);
        const before = await choice(page);

        // A drag from the middle of one plot to the middle of another.
        const from = await centreOf(page, other);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 24, from.y + 6, { steps: 6 });
        await page.mouse.up();
        expect(await choice(page)).toEqual(before);
        await expect(page).not.toHaveURL(/\/plot\//);

        // A tap on the first path, at the middle of its length.
        const onPath = await page.evaluate(() => {
          const line = document.querySelector<SVGGeometryElement>("svg.sheet polyline.path");
          if (line === null) return null;
          line.scrollIntoView({ block: "center", inline: "center" });
          const point = line.getPointAtLength(line.getTotalLength() / 2);
          const m = line.getScreenCTM();
          if (m === null) return null;
          return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f };
        });
        expect(onPath).not.toBeNull();
        if (onPath !== null) {
          await page.touchscreen.tap(onPath.x, onPath.y);
          expect(await choice(page)).toEqual(before);
          await page.mouse.click(onPath.x, onPath.y);
          expect(await choice(page)).toEqual(before);
          await expect(page).not.toHaveURL(/\/plot\//);
        }

        // A tap on the open ground beyond the plots, on the north arrow's side of the sheet.
        const ground = await page.evaluate(() => {
          const svg = document.querySelector<SVGSVGElement>("svg.sheet");
          if (svg === null) return null;
          const r = svg.getBoundingClientRect();
          const shapes = [...svg.querySelectorAll(".plot, .path, .section-outline, .gate, .north, text, .tab, .leader")].map((e) => e.getBoundingClientRect());
          for (let y = r.top + 4; y < r.bottom - 4; y += 6) {
            for (let x = Math.max(r.left, 0) + 4; x < Math.min(r.right, window.innerWidth) - 4; x += 6) {
              if (y < 0 || y > window.innerHeight) continue;
              if (!shapes.some((b) => x >= b.left - 14 && x <= b.right + 14 && y >= b.top - 14 && y <= b.bottom + 14)) return { x, y };
            }
          }
          return null;
        });
        if (ground !== null) {
          await page.touchscreen.tap(ground.x, ground.y);
          expect(await choice(page)).toEqual(before);
          await expect(page).not.toHaveURL(/\/plot\//);
        }
      });

      test("a tap on ground between two plots chooses nothing, and keeps a choice that was made", async ({ page }) => {
        // The point is found again, and the map scrolled to it, right before every press: choosing from the list scrolls
        // the page, so a point found earlier could land on the list instead of the map.
        expect((await choice(page)).value).toBe("");
        const p1 = await gapPoint(page);
        await page.touchscreen.tap(p1.x, p1.y);
        expect((await choice(page)).value).toBe("");
        await expect(page).not.toHaveURL(/\/plot\//);
        const p2 = await gapPoint(page);
        await page.mouse.click(p2.x, p2.y);
        expect((await choice(page)).value).toBe("");
        await expect(page).not.toHaveURL(/\/plot\//);

        await byKeyboard(page, code);
        const before = await choice(page);
        const p3 = await gapPoint(page);
        await page.touchscreen.tap(p3.x, p3.y);
        expect(await choice(page)).toEqual(before);
        await expect(page).not.toHaveURL(/\/plot\//);
        const p4 = await gapPoint(page);
        await page.mouse.click(p4.x, p4.y);
        expect(await choice(page)).toEqual(before);
        await expect(page).not.toHaveURL(/\/plot\//);
      });
    });
  }

  test(`${app.title}: opening by tap and coming back leaves nothing wrong on the screen`, async ({ page }) => {
    await openMap(page, app, 0, "Zoom 100 percent");
    const at = await centreOf(page, code);
    await chooser(page).selectOption({ index: 1 });
    await expect(chooser(page)).not.toHaveValue("");
    await page.touchscreen.tap(at.x, at.y);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
    const violations = await measureLayout(page);
    expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5)).toBe(true);
  });
}

test.describe("a finger between small plots", () => {
  test("lands at the very edge of a plot of the churchyard: a finger picks nothing, a mouse picks the plot it is in", async ({ page }) => {
    test.skip(sizeOf(page) !== "phone", "the plots are only this close on the phone");
    await openMap(page, CHURCH_UT, 0, "Zoom 100 percent");
    // The right edge of Y01 is a few pixels from Y02. A point one pixel inside that edge is inside Y01 and near Y02.
    const ids = { a: await idOf(page, "Y01"), b: await idOf(page, "Y02") };
    const edge = await page.evaluate(({ a, b }) => {
      const rectOf = (id: string) => document.querySelector(`svg.sheet g[data-plot-id="${id}"] .plot`)?.getBoundingClientRect();
      const first = rectOf(a);
      const second = rectOf(b);
      if (first === undefined || second === undefined) return null;
      return { x: first.right - 1, y: first.top + first.height / 2, gap: second.left - first.right };
    }, ids);    expect(edge).not.toBeNull();
    if (edge === null) return;
    expect(edge.gap).toBeLessThan(11);
    await page.touchscreen.tap(edge.x, edge.y);
    await expect(chooser(page)).toHaveValue("");
    await expect(page).not.toHaveURL(/\/plot\//);
    await page.mouse.click(edge.x, edge.y);
    await expect(page).toHaveURL(new RegExp(`/plot/${ids.a}$`));
    await expect(page.getByRole("heading", { level: 1, name: /Y01/ })).toBeVisible();
  });
});

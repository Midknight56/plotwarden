// A tap or a click on a drawn plot of the Site map chooses that plot, the same as choosing it from the list
// "Choose a plot" with the keyboard (both registers, 360 by 640 and 1920 by 1080, at 100 and 200 percent of map
// zoom). A drag, a tap on a path and a tap on ground between plots leave the choice as it was. A finger that lands
// between small plots picks nothing.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { measureLayout } from "../helpers/measureLayout";
import { CHURCH, GARDEN, openPractice, registerRoute, settle, siteIdOf, sizeOf } from "../helpers/routes";
import type { AppUnderTest } from "../helpers/routes";

test.use({ hasTouch: true });

const CASES: { app: AppUnderTest; code: string; other: string }[] = [
  { app: CHURCH, code: "Y07", other: "Y02" },
  { app: GARDEN, code: "B03", other: "B01" },
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

      test(`touch, mouse and keyboard choose ${code} alike, show its state and open its record, and the date holds`, async ({ page }) => {
        await byKeyboard(page, code);
        const keyboard = await choice(page);
        expect(keyboard.shown).toContain(`${code} \u00b7`);
        expect(keyboard.plotInAddress).toBe(keyboard.value);
        expect(keyboard.asAt).toBe(AS_AT);
        await clearChoice(page);
        expect((await choice(page)).shown).toBe("No plot chosen");

        // A finger.
        const [x, y] = await centreOf(page, code).then((c) => [c.x, c.y] as const);
        await page.touchscreen.tap(x, y);
        await expect(chooser(page)).toHaveValue(keyboard.value);
        const touch = await choice(page);
        expect(touch).toEqual(keyboard);
        await clearChoice(page);

        // A mouse.
        const at = await centreOf(page, code);
        await page.mouse.click(at.x, at.y);
        await expect(chooser(page)).toHaveValue(keyboard.value);
        const mouse = await choice(page);
        expect(mouse).toEqual(keyboard);
        expect(mouse.date).toBe(AS_AT);
        expect(mouse.asAt).toBe(AS_AT);

        // The record that the choice opens is the plot's own.
        await page.getByRole("link", { name: "Open plot", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/plot/${keyboard.value}$`));
        await expect(page.getByRole("heading", { level: 1, name: new RegExp(code) })).toBeVisible();
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
        }
      });

      test("a tap on ground between two plots chooses nothing, and keeps a choice that was made", async ({ page }) => {
        // The two plots that stand side by side with the least ground between them. The map is scrolled to that ground.
        const point = await page.evaluate(async () => {
          const svg = document.querySelector<SVGSVGElement>("svg.sheet");
          if (svg === null) return null;
          const boxes = [...svg.querySelectorAll<SVGGraphicsElement>(".plot")].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
          let best: { x: number; y: number; gap: number } | null = null;
          for (const a of boxes) {
            for (const b of boxes) {
              const gap = b.left - a.right;
              if (gap <= 0 || Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) > 4) continue;
              if (best === null || gap < best.gap) best = { x: a.right + gap / 2, y: a.top + a.height / 2, gap };
            }
          }
          if (best === null) return null;
          const before = svg.getBoundingClientRect();
          const holder = svg.parentElement as HTMLElement;
          holder.scrollLeft += best.x - (holder.getBoundingClientRect().left + holder.clientWidth / 2);
          window.scrollBy(0, best.y - window.innerHeight / 2);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const after = svg.getBoundingClientRect();
          return { x: best.x + (after.left - before.left), y: best.y + (after.top - before.top), gap: best.gap };
        });
        expect(point).not.toBeNull();
        if (point === null) return;
        expect((await choice(page)).value).toBe("");
        await page.touchscreen.tap(point.x, point.y);
        expect((await choice(page)).value).toBe("");
        await page.mouse.click(point.x, point.y);
        expect((await choice(page)).value).toBe("");

        await byKeyboard(page, code);
        const before = await choice(page);
        await page.touchscreen.tap(point.x, point.y);
        expect(await choice(page)).toEqual(before);
        await page.mouse.click(point.x, point.y);
        expect(await choice(page)).toEqual(before);
      });    });
  }

  test(`${app.title}: choosing by tap leaves nothing wrong on the screen`, async ({ page }) => {
    await openMap(page, app, 0, "Zoom 100 percent");
    const at = await centreOf(page, code);
    await page.touchscreen.tap(at.x, at.y);
    await expect(chooser(page)).not.toHaveValue("");
    const violations = await measureLayout(page);
    expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5)).toBe(true);
  });
}

test.describe("a finger between small plots", () => {
  test("lands at the very edge of a plot of the churchyard: a finger picks nothing, a mouse picks the plot it is in", async ({ page }) => {
    test.skip(sizeOf(page) !== "phone", "the plots are only this close on the phone");
    await openMap(page, CHURCH, 0, "Zoom 100 percent");
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
    await page.mouse.click(edge.x, edge.y);
    await expect(chooser(page)).not.toHaveValue("");
    expect((await choice(page)).shown).toContain("Y01 \u00b7");
  });
});

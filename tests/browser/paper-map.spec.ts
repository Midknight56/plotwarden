// T03, T04 and T05 in a real browser, at 360 by 640 and at 1920 by 1080.
// Generate 200 plots and omit a corner, trace an odd section and a path with the keyboard,
// fix a crossing, pin a private plan, hide it, import a finished layout twice, reject a
// conflicting import, rename a linked code and find the old code in the list and in print.
import { expect, test } from "@playwright/test";
import { LABEL_SIZE } from "../../template/src/map/sheet";
import { codeWidth, textWidth } from "../../template/src/map/labels";
import { findLabelCollisions, focusRingContrast, measureLayout, readSheetScene, trackRequests } from "../helpers/measureLayout";
import { APPS, openPractice, plotIdOf, settle, siteIdOf, sizeOf, startOwn, storedEvents } from "../helpers/routes";
import { BOOK_GRID, fillGrid, fixturePath, generateGrid, openMapEditor, readDownload, startRegister, upload } from "../helpers/screens";
import { SITE } from "../helpers/siteOrigin";

const noViolations = async (page: import("@playwright/test").Page) => {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
};

test.describe("the map from paper", () => {
  test("generates 200 plots with a gap, shows them on the map and in the list, and prints them", async ({ page }) => {
    const requests = trackRequests(page);
    await page.goto("/");
    await expect(page.getByText("No registers on this device.")).toBeVisible();
    await noViolations(page);

    await startRegister(page, "Paper Book");
    await expect(page.getByText("Start with your map or your first record.")).toBeVisible();
    await noViolations(page);

    await openMapEditor(page);
    await fillGrid(page, { ...BOOK_GRID, skip: "10/20" });
    await page.getByRole("button", { name: "Preview plots" }).click();
    await expect(page.getByText("199 plots to add")).toBeVisible();
    await expect(page.getByText("First C001")).toBeVisible();
    await expect(page.getByText("Last C199")).toBeVisible();
    await noViolations(page);

    // Previewing again changes nothing. Applying once makes the plots once.
    await page.getByRole("button", { name: "Preview plots" }).click();
    await expect(page.getByText("199 plots to add")).toBeVisible();
    await page.getByRole("button", { name: "Apply layout" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();
    await expect(page.getByText("199 plots added.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply layout" })).toHaveCount(0);
    await noViolations(page);

    // The map, with its key directly below and the plot list one press away.
    await page.getByRole("link", { name: "Back to map" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
    const sheet = page.getByRole("img", { name: /Site map/ });
    await expect(sheet).toBeVisible();
    const key = page.getByRole("list", { name: "Map key" });
    for (const word of ["Free", "Reserved", "Taken", "Unusable", "Needs checking"]) {
      await expect(key.getByText(word, { exact: true })).toBeVisible();
    }
    const sheetBox = await sheet.boundingBox();
    const keyBox = await key.boundingBox();
    expect(sheetBox && keyBox).toBeTruthy();
    const below = (keyBox?.y ?? 0) - ((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0));
    expect(below).toBeGreaterThanOrEqual(0);
    expect(below).toBeLessThan(48);
    await expect(page.getByRole("link", { name: "Open plot list" })).toBeVisible();
    await noViolations(page);

    // No button per plot on the overview. A plot is chosen from the list.
    await page.getByLabel("Choose a plot", { exact: true }).selectOption({ label: "C010 · Paper · Needs checking" });
    const selected = page.getByRole("region", { name: "Selected plot" });
    await expect(selected).toContainText("C010 · Paper · Needs checking");
    await expect(sheet.locator("text", { hasText: "C010" })).toBeVisible();
    await noViolations(page);

    // The plot list holds the same plots, and the corner that was skipped is not there.
    await page.getByRole("link", { name: "Open plot list" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plot list" })).toBeVisible();
    await expect(page.getByText("199 plots")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "C199" }).first()).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "C200" })).toHaveCount(0);
    await noViolations(page);

    await page.getByRole("link", { name: "Free", exact: true }).click();
    await expect(page.getByText("No matches.")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByText("199 plots")).toBeVisible();
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("199 plots")).toBeVisible();

    // Show on map, then Back keeps the highlighted plot.
    await page.getByRole("listitem").filter({ hasText: "C042" }).getByRole("link", { name: "Show on map" }).click();
    await expect(page.getByRole("region", { name: "Selected plot" })).toContainText("C042");
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Plot list" })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("region", { name: "Selected plot" })).toContainText("C042");

    // Print: the controls go, the sheet, its key and the index of codes stay. Nothing says a page was printed.
    await page.getByRole("button", { name: "Print site map" }).click();
    await expect(page.getByText("Print preview is ready.")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { level: 2, name: "Plot codes" })).toBeVisible();
    await expect(page.getByText(/^As at \d{4}-\d{2}-\d{2}$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Print site map" })).toBeHidden();
    await expect(page.getByRole("img", { name: /Site map/ })).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    // The same data comes back after a reload, from this device.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
    await expect(requests.external).toEqual([]);
  });

  test("renames a linked code, finds the old code in the list, in search and in print", async ({ page }) => {
    await startRegister(page, "Paper Book");
    await generateGrid(page, { ...BOOK_GRID, rows: "2", columns: "3" });
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Plot list" }).click();
    await page.getByRole("listitem").filter({ hasText: "C005" }).getByRole("link", { name: "Plot C005" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plot C005" })).toBeVisible();
    await noViolations(page);

    // Linked history first: the plot is checked, which is an event of its own.
    await page.getByRole("button", { name: "Check plot" }).click();
    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect(page.getByText("Status changed.")).toBeVisible();
    await expect(page.getByText("Space 1 · Free")).toBeVisible();

    await page.getByLabel("New plot code").fill("N005");
    await page.getByRole("button", { name: "Rename plot" }).click();
    await expect(page.getByText("Plot renamed.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Plot N005" })).toBeVisible();
    await expect(page.getByText("Was C005")).toBeVisible();
    await noViolations(page);

    // The old code is reserved: a second plot cannot take it.
    await page.getByRole("link", { name: "Back to plot list" }).click();
    await page.getByRole("listitem").filter({ hasText: "C006" }).getByRole("link", { name: "Plot C006" }).click();
    await page.getByLabel("New plot code").fill("c005");
    await page.getByRole("button", { name: "Rename plot" }).click();
    await expect(page.getByText("Code c005 is already in Paper.")).toBeVisible();
    await expect(page.getByLabel("New plot code")).toBeFocused();

    // Search finds the plot by its old code, and the list shows the old code beside the new.
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByLabel("Name or plot code").fill("C005");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("1 found")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "N005" })).toContainText("Was C005");
    await page.getByRole("link", { name: "Plot list" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "N005" })).toContainText("Was C005");

    // And in print.
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Map", exact: true }).click();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("listitem").filter({ hasText: "N005" })).toContainText("Was C005");
    await page.emulateMedia({ media: "screen" });

    // After a reload the new code and the old one are both still there.
    await page.reload();
    await page.getByRole("link", { name: "Open plot list" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "N005" })).toContainText("Was C005");
  });

  test("traces an odd section, a path and a gate from the keyboard, and fixes a crossing", async ({ page }) => {
    await startRegister(page, "Trace Book");
    await generateGrid(page, { ...BOOK_GRID, prefix: "T", digits: "2", rows: "2", columns: "3" });
    // Plots T01 to T06 fill x 100 to 220 and y 100 to 160.
    await page.getByRole("link", { name: "Trace a section" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Trace" })).toBeVisible();

    const addPoint = async (east: number, north: number) => {
      await page.getByLabel("East", { exact: true }).fill(String(east));
      await page.getByLabel("North", { exact: true }).fill(String(north));
      await page.getByRole("button", { name: "Add point" }).click();
      await expect(page.getByText(`Last point: East ${east}, North ${north}`)).toBeVisible();
    };

    await page.getByLabel("Name", { exact: true }).fill("Odd Lawn");
    // The keyboard form says what is wrong, and puts focus on the field.
    await page.getByLabel("East", { exact: true }).fill("");
    await page.getByRole("button", { name: "Add point" }).click();
    await expect(page.getByText("Use a whole number from 0 to 10000.").first()).toBeVisible();
    await expect(page.getByLabel("East", { exact: true })).toBeFocused();

    // Two points do not close a shape.
    await addPoint(50, 50);
    await addPoint(320, 50);
    await page.getByRole("button", { name: "Close shape" }).click();
    await expect(page.getByText("Add three points to close a shape.")).toBeVisible();

    // A bow tie crosses itself. Undo takes the points back one at a time.
    await page.getByRole("button", { name: "Undo point" }).click();
    await addPoint(320, 200);
    await addPoint(320, 50);
    await addPoint(50, 200);
    await page.getByRole("button", { name: "Close shape" }).click();
    await expect(page.getByText("The outline crosses itself.")).toBeVisible();
    for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "Undo point" }).click();
    await expect(page.getByText("Last point: East 50, North 50")).toBeVisible();
    await page.getByRole("button", { name: "Undo point" }).click();
    await expect(page.getByText("No points yet.")).toBeVisible();
    // The right shape, with an odd corner, around every plot.
    for (const [e, n] of [[50, 50], [320, 50], [320, 120], [260, 200], [50, 200]] as const) await addPoint(e, n);
    await page.getByRole("button", { name: "Close shape" }).click();
    await expect(page.getByText("The shape is ready to save.")).toBeVisible();
    // Last point and Undo point sit below the drawing surface.
    const surface = await page.getByRole("img", { name: /Drawing surface/ }).boundingBox();
    const undo = await page.getByRole("button", { name: "Undo point" }).boundingBox();
    expect((undo?.y ?? 0)).toBeGreaterThan((surface?.y ?? 0) + (surface?.height ?? 0) - 1);
    await noViolations(page);
    await page.getByRole("button", { name: "Save map" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();

    // A path that crosses a plot is refused and named. Undo and move the last point, and it is saved.
    await page.getByRole("radio", { name: "Add path" }).check();
    await page.getByLabel("Name", { exact: true }).fill("Yew Walk");
    await addPoint(60, 80);
    await addPoint(110, 80);
    await addPoint(110, 170);
    await page.getByRole("button", { name: "Finish path" }).click();
    await expect(page.getByText("This path crosses T01.")).toBeVisible();
    await page.getByRole("button", { name: "Undo point" }).click();
    await addPoint(60, 170);
    await page.getByRole("button", { name: "Finish path" }).click();
    await expect(page.getByText("The path is ready to save.")).toBeVisible();
    await page.getByRole("button", { name: "Save map" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();

    // The gate has a name and one point.
    await page.getByRole("radio", { name: "Add gate" }).check();
    await page.getByLabel("Name", { exact: true }).fill("Lantern Gate");
    await addPoint(200, 40);
    await page.getByRole("button", { name: "Add gate" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();

    await page.getByRole("link", { name: "Back to map" }).click();
    const sheet = page.getByRole("img", { name: /Site map/ });
    await expect(sheet.locator("text", { hasText: "Odd Lawn" })).toBeVisible();
    await expect(sheet.locator("text", { hasText: "Yew Walk" })).toBeVisible();
    await expect(sheet.locator("text", { hasText: "Lantern Gate" })).toBeVisible();
    await noViolations(page);
  });

  test("pins a private plan, adjusts it, locks it, hides it and removes it, and no plot moves", async ({ page }) => {
    await startRegister(page, "Plan Book");
    await generateGrid(page, { ...BOOK_GRID, prefix: "T", digits: "2", rows: "2", columns: "3" });
    await page.getByRole("link", { name: "Trace a section" }).click();

    const polygons = () => page.getByRole("img", { name: /Drawing surface/ }).locator("polygon").evaluateAll((els) => els.map((e) => e.getAttribute("points")));
    const before = await polygons();
    expect(before.length).toBe(6);

    await page.getByLabel("Choose image").setInputFiles(fixturePath("tiny-page.png"));
    await expect(page.getByLabel("Scale", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /Drawing surface/ }).locator("image")).toHaveCount(1);
    await page.getByLabel("Scale", { exact: true }).fill("250");
    await page.getByLabel("Move east", { exact: true }).fill("80");
    await page.getByLabel("Move north", { exact: true }).fill("-20");
    await page.getByLabel("Turn", { exact: true }).fill("90");
    await page.getByLabel("Opacity", { exact: true }).fill("60");
    await noViolations(page);
    expect(await polygons()).toEqual(before);

    await page.getByRole("button", { name: "Lock image" }).click();
    await expect(page.getByText("Saved on this device.")).toBeVisible();
    await expect(page.getByLabel("Scale", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Unlock image" })).toBeVisible();
    expect(await polygons()).toEqual(before);

    // Hide the image: the sheet stands alone. Show it again.
    await page.getByRole("button", { name: "Hide image" }).click();
    await expect(page.getByRole("img", { name: /Drawing surface/ }).locator("image")).toHaveCount(0);
    expect(await polygons()).toEqual(before);
    await page.getByRole("button", { name: "Show image" }).click();
    await expect(page.getByRole("img", { name: /Drawing surface/ }).locator("image")).toHaveCount(1);

    // The plan never goes into the layout file.
    await page.getByRole("link", { name: "Back to map" }).click();
    await page.getByRole("link", { name: "Edit map" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download site layout" }).click()]);
    const text = await readDownload(download);
    const layout = JSON.parse(text) as { format: string; plots: unknown[] };
    expect(layout.format).toBe("plot.layout.v1");
    expect(layout.plots.length).toBe(6);
    expect(text).not.toMatch(/backdrop|blob|transform|image/i);
    expect(download.suggestedFilename()).toBe("site-layout.json");

    await page.getByRole("link", { name: "Trace a section" }).click();
    await page.getByRole("button", { name: "Remove image" }).click();
    await expect(page.getByRole("img", { name: /Drawing surface/ }).locator("image")).toHaveCount(0);
    await expect(page.getByLabel("Scale", { exact: true })).toHaveCount(0);
    expect(await polygons()).toEqual(before);
  });

  test("imports a finished layout twice, refuses a conflicting one and keeps the plots it had", async ({ page }) => {
    await startRegister(page, "Source Book");
    await generateGrid(page, { ...BOOK_GRID, prefix: "T", digits: "2", rows: "2", columns: "3" });
    await page.getByRole("link", { name: "Trace a section" }).click();
    await page.getByLabel("Name", { exact: true }).fill("North Lawn");
    for (const [e, n] of [[50, 50], [320, 50], [320, 200], [50, 200]] as const) {
      await page.getByLabel("East", { exact: true }).fill(String(e));
      await page.getByLabel("North", { exact: true }).fill(String(n));
      await page.getByRole("button", { name: "Add point" }).click();
    }
    await page.getByRole("button", { name: "Close shape" }).click();
    await page.getByRole("button", { name: "Save map" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();
    await page.getByRole("link", { name: "Back to map" }).click();
    await page.getByRole("link", { name: "Edit map" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download site layout" }).click()]);
    const file = await readDownload(download);

    // Into a new register: fresh plots, all unchecked.
    await startRegister(page, "Copy Book");
    await openMapEditor(page);
    await page.getByLabel("Choose layout file").setInputFiles(upload("site-layout.json", file, "application/json"));
    await expect(page.getByText("6 plots to add")).toBeVisible();
    await noViolations(page);
    await page.getByRole("button", { name: "Apply layout" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();
    await page.getByRole("link", { name: "Back to map" }).click();
    await page.getByRole("link", { name: "Open plot list" }).click();
    await expect(page.getByText("6 plots")).toBeVisible();
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("6 plots")).toBeVisible();

    // The same file again adds nothing.
    await page.getByRole("link", { name: "Back to map" }).click();
    await page.getByRole("link", { name: "Edit map" }).click();
    await page.getByLabel("Choose layout file").setInputFiles(upload("site-layout.json", file, "application/json"));
    await expect(page.getByText("Nothing new to add.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply layout" })).toHaveCount(0);

    // A file that moves one plot is refused whole, and names the plot.
    const changed = JSON.parse(file) as { plots: { code: string; footprint: [number, number][] }[] };
    const t02 = changed.plots.find((p) => p.code === "T02");
    if (t02 === undefined) throw new Error("no T02");
    t02.footprint = t02.footprint.map(([e, n]) => [e + 5, n] as [number, number]);
    changed.plots.push({ code: "T99", footprint: [[400, 400], [440, 400], [440, 430], [400, 430]] });
    await page.getByLabel("Choose layout file").setInputFiles(upload("site-layout.json", JSON.stringify(changed), "application/json"));
    await expect(page.getByText("This layout does not fit the map. Nothing was changed.")).toBeVisible();
    await expect(page.getByText("Plot T02 has a different shape.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply layout" })).toHaveCount(0);
    await noViolations(page);

    // Other files are not layouts.
    await page.getByLabel("Choose layout file").setInputFiles(upload("x.json", JSON.stringify({ format: "plot.layout.v2" }), "application/json"));
    await expect(page.getByText("This file needs a newer version.")).toBeVisible();
    await page.getByLabel("Choose layout file").setInputFiles(upload("x.json", JSON.stringify({ format: "plot.backup.v1" }), "application/json"));
    await expect(page.getByText("This file is not a site layout.")).toBeVisible();

    await page.getByRole("link", { name: "Back to map" }).click();
    await page.getByRole("link", { name: "Open plot list" }).click();
    await expect(page.getByText("6 plots")).toBeVisible();
  });

  test("closes a dialog with Escape and puts focus back on the button that opened it", async ({ page }) => {
    await startRegister(page, "Dialog Book");
    await generateGrid(page, { ...BOOK_GRID, rows: "2", columns: "3" });
    await page.getByRole("link", { name: "Trace a section" }).click();
    const trigger = page.getByRole("button", { name: "Rename plots" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Rename plots" });
    await expect(dialog).toBeVisible();
    await noViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await focusRingContrast(page, "button")).toBeGreaterThanOrEqual(3);
  });

  test("honours the motion and contrast settings, and keeps its layout in high contrast", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await startRegister(page, "Setting Book");
    await expect(page.locator(".mist")).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".mist")).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.getByRole("link", { name: "Settings", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.getByRole("radio", { name: "Reduce motion" }).check();
    await page.getByRole("radio", { name: "High" }).check();
    await page.getByRole("radio", { name: "Letter" }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(page.locator(".mist")).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await noViolations(page);

    // The setting is kept after a reload.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    await page.getByRole("link", { name: "Help", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    await expect(page.getByText("Records stay in this browser until you choose to export them.")).toBeVisible();
    await noViolations(page);
  });
});

// Task 18, P22: making 200 plots fits one screen and shows the result while the keeper types. Written in the run
// that made it, and not run there (the machine was busy). The lead runs it at 360 by 640 and 1920 by 1080.
test.describe("map setup shows the plots while the keeper types (P22)", () => {
  const WIDE = 1024;

  /** The width of 12 characters of body text at 16 px, read from the page, plus the padding and border of a field. */
  const numberFieldLimit = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;width:12ch;font-size:16px";
      document.body.append(probe);
      const twelve = probe.getBoundingClientRect().width;
      probe.remove();
      // 8 px and 12 px of padding, and a 2 px border on each side, as register.css sets for a field.
      return twelve + 2 * 12 + 2 * 2;
    });

  const NUMBER_FIELDS = ["First number", "Digits", "Rows", "Columns", "Plot width", "Plot height", "Start east", "Start north", "Row spacing", "Column spacing", "Rotation"];

  test("says 200 plots to add, First C001 and Last C200 as soon as 10 and 20 are typed, and saves nothing", async ({ page }) => {
    const requests = trackRequests(page);
    await startRegister(page, "Paper Book");
    await openMapEditor(page);

    // Nothing typed: a prompt, no count and no drawing.
    await expect(page.getByText("Enter rows and columns to see the plots.")).toBeVisible();
    await expect(page.getByText(/plots to add/)).toHaveCount(0);

    await page.getByLabel("Prefix", { exact: true }).fill("C");
    await page.getByLabel("Rows", { exact: true }).fill("10");
    await page.getByLabel("Columns", { exact: true }).fill("20");
    // No button was pressed, and no size or position was typed.
    await expect(page.getByText("200 plots to add")).toBeVisible();
    await expect(page.getByText("First C001")).toBeVisible();
    await expect(page.getByText("Last C200")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply layout" })).toHaveCount(0);
    await expect(page.getByText("Map saved.")).toHaveCount(0);
    await expect(page.getByText("Saved on this device.")).toHaveCount(0);

    // The small drawing marks the first and the last code.
    const drawing = page.getByRole("img", { name: "Rows of plots, with the first and the last code marked." });
    await expect(drawing).toBeVisible();
    await expect(drawing.locator("text", { hasText: "C001" })).toBeVisible();
    await expect(drawing.locator("text", { hasText: "C200" })).toBeVisible();

    // It follows each keystroke: fewer rows, a skipped place, a reversed row.
    await page.getByLabel("Rows", { exact: true }).fill("5");
    await expect(page.getByText("100 plots to add")).toBeVisible();
    await expect(page.getByText("Last C100")).toBeVisible();
    await page.getByLabel("Skip places", { exact: true }).fill("1/1");
    await expect(page.getByText("99 plots to add")).toBeVisible();
    await expect(page.getByText("First C002")).toBeVisible();
    await expect(page.getByText("1 skipped")).toBeVisible();
    await page.getByLabel("Skip places", { exact: true }).fill("5/20");
    await expect(page.getByText("First C001")).toBeVisible();
    await expect(page.getByText("Last C099")).toBeVisible();
    // A skip that cannot be read gives the prompt again, with no error written.
    await page.getByLabel("Skip places", { exact: true }).fill("9/9");
    await expect(page.getByText("Enter rows and columns to see the plots.")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByLabel("Skip places", { exact: true }).fill("");
    await page.getByLabel("Rows", { exact: true }).fill("10");
    await expect(page.getByText("200 plots to add")).toBeVisible();

    // Typing wrote nothing: the plot list of this register is still empty.
    await page.getByRole("link", { name: "Back to register" }).click();
    await expect(page.getByRole("link", { name: "Add your map" })).toBeVisible();

    // The words of the count, first and last are written once on the screen after "Preview plots" too.
    await openMapEditor(page);
    await fillGrid(page, BOOK_GRID);
    await page.getByRole("button", { name: "Preview plots" }).click();
    await expect(page.getByText("200 plots to add")).toHaveCount(1);
    await expect(page.getByText("First C001")).toHaveCount(1);
    await expect(page.getByText("Last C200")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "Review changes" })).toBeVisible();
    await expect(requests.external).toEqual([]);
  });

  test("lays the form out for the size of the screen, with four groups and the preview beside or above", async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const { width, height } = viewport as { width: number; height: number };
    await startRegister(page, "Paper Book");
    await openMapEditor(page);

    const groups = ["Name and codes", "Size", "Position", "Numbering"];
    for (const name of groups) await expect(page.getByRole("group", { name, exact: true })).toBeVisible();
    // The three choices of order sit inside the Numbering group, and its legend is not repeated.
    const numbering = page.getByRole("group", { name: "Numbering", exact: true });
    await expect(numbering.getByRole("group", { name: "Number order", exact: true })).toBeVisible();
    await expect(numbering.getByRole("group", { name: "First row is", exact: true })).toBeVisible();
    await expect(numbering.getByRole("group", { name: "First column is", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Numbering", exact: true })).toHaveCount(1);

    await page.getByLabel("Prefix", { exact: true }).fill("C");
    await page.getByLabel("Rows", { exact: true }).fill("10");
    await page.getByLabel("Columns", { exact: true }).fill("20");
    await expect(page.getByText("200 plots to add")).toBeVisible();

    const panel = page.getByRole("region", { name: "Preview", exact: true });
    await expect(panel).toBeVisible();
    const button = page.getByRole("button", { name: "Preview plots" });
    await page.evaluate(() => window.scrollTo(0, 0));
    const buttonBox = await button.boundingBox();
    const panelBox = await panel.boundingBox();
    const sizeBox = await page.getByRole("group", { name: "Size", exact: true }).boundingBox();
    const nameBox = await page.getByRole("group", { name: "Name and codes", exact: true }).boundingBox();
    expect(buttonBox && panelBox && sizeBox && nameBox).toBeTruthy();
    const b = buttonBox as NonNullable<typeof buttonBox>;
    const p = panelBox as NonNullable<typeof panelBox>;
    const s = sizeBox as NonNullable<typeof sizeBox>;
    const n = nameBox as NonNullable<typeof nameBox>;

    if (width >= WIDE) {
      // One view: with the page at its top, the whole form and its button end inside the window.
      expect(b.y + b.height, "the button ends inside the view").toBeLessThanOrEqual(height);
      for (const name of groups) {
        const g = await page.getByRole("group", { name, exact: true }).boundingBox();
        expect((g?.y ?? 0) + (g?.height ?? 0), `${name} ends inside the view`).toBeLessThanOrEqual(height);
      }
      expect(p.y + p.height, "the preview ends inside the view").toBeLessThanOrEqual(height);
      // The preview stands beside the groups, not under them, and its top is level with the first group.
      expect(p.x, "the preview is right of the Size group").toBeGreaterThanOrEqual(s.x + s.width);
      expect(Math.abs(p.y - n.y), "the preview starts level with the first group").toBeLessThanOrEqual(4);
      expect(p.y, "the preview is above the button").toBeLessThan(b.y);
      // Four named groups, each a row of short fields: the Size group holds its four fields side by side.
      const rows = await page.getByLabel("Rows", { exact: true }).boundingBox();
      const columns = await page.getByLabel("Columns", { exact: true }).boundingBox();
      expect(Math.abs((rows?.y ?? 0) - (columns?.y ?? 99))).toBeLessThanOrEqual(1);
    } else {
      // One column: the groups, then the preview, then the button.
      expect(n.y).toBeLessThan(s.y);
      expect(s.y + s.height).toBeLessThanOrEqual(p.y + 1);
      expect(p.y + p.height, "the preview is above the button").toBeLessThanOrEqual(b.y);
      expect(p.x).toBeLessThanOrEqual(s.x + 1);
    }

    // Nothing scrolls sideways, and every layout rule holds with the preview shown.
    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);
    await noViolations(page);
  });

  test("keeps every number field at most 12 characters wide", async ({ page }) => {
    await startRegister(page, "Paper Book");
    await openMapEditor(page);
    const limit = await numberFieldLimit(page);
    for (const label of NUMBER_FIELDS) {
      const box = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(box, label).not.toBeNull();
      expect(box?.width ?? 999, `${label} is ${box?.width} px wide, the limit is ${limit}`).toBeLessThanOrEqual(limit + 0.5);
      expect(box?.height ?? 0, `${label} keeps a 44 px target`).toBeGreaterThanOrEqual(44);
    }
  });

  test("keeps a preview error where it was: Preview plots still names the first invalid field and moves focus there", async ({ page }) => {
    await startRegister(page, "Paper Book");
    await openMapEditor(page);
    await page.getByLabel("Rows", { exact: true }).fill("10");
    await page.getByLabel("Columns", { exact: true }).fill("20");
    await page.getByRole("button", { name: "Preview plots" }).click();
    await expect(page.getByLabel("Section name", { exact: true })).toBeFocused();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply layout" })).toHaveCount(0);
  });
});

// ---- Map labels in the shipped font (spec 07, task 7.13, L6.5) ------------------------------------------------------
// Names and codes are 14 px, Atkinson Hyperlegible Next at weight 700. `LABEL_SIZE` in map/sheet.ts and the widths of `codeWidth`
// in map/labels.ts come from a measure of that font in a browser, and this is the check that holds them to it: every name is read at its real
// width and must fit the box that the sheet reserved for it, and no label overlaps another label, a plot, a path line,
// the code tab, the north arrow, the gate mark, an outline or the frame. At 360 wide on the phone project and 1440 wide
// on the desktop project, in both registers and on the two practice maps of the start page.

const widthOf = (page: import("@playwright/test").Page): { width: number; height: number } => (sizeOf(page) === "phone" ? { width: 360, height: 640 } : { width: 1440, height: 900 });

interface TextRead {
  text: string;
  kind: string | null;
  size: number;
  weight: string;
  family: string;
  width: number;
}

/** Every text of every sheet on the page, with the size, weight and family that the browser used and the width it drew. */
async function readTexts(page: import("@playwright/test").Page): Promise<TextRead[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<SVGTextElement>("svg.sheet text")].map((t) => {
      const svg = t.closest("svg") as SVGSVGElement;
      const scale = svg.viewBox.baseVal.width > 0 ? svg.getBoundingClientRect().width / svg.viewBox.baseVal.width : 1;
      const style = getComputedStyle(t);
      return { text: (t.textContent ?? "").trim(), kind: t.getAttribute("data-kind"), size: parseFloat(style.fontSize) * scale, weight: style.fontWeight, family: style.fontFamily, width: t.getComputedTextLength() * scale };
    }),
  );
}

function expectFit(texts: readonly TextRead[], where: string): void {
  // A phone map has no code inside its small plots, so it holds the names of the gate and the section and little more.
  expect(texts.length, `${where}: the map has text`).toBeGreaterThanOrEqual(2);
  const faults: string[] = [];
  for (const t of texts) {
    if (t.text === "") continue;
    if (Math.abs(t.size - LABEL_SIZE) > 0.01) faults.push(`"${t.text}" is ${t.size} px, not ${LABEL_SIZE}`);
    if (t.weight !== "700") faults.push(`"${t.text}" has weight ${t.weight}, not 700`);
    if (!t.family.includes("Atkinson Hyperlegible Next")) faults.push(`"${t.text}" is set in ${t.family}`);
    // The sheet boxes a code (in its plot and on its tab) from the width of each of its own characters (`codeWidth`), and a
    // name at the width of a letter in labels.ts.
    const reserved = t.kind === "plot" || t.kind === "tab" ? codeWidth(t.text, LABEL_SIZE) : textWidth(t.text, LABEL_SIZE);
    if (t.width > reserved + 0.5) faults.push(`"${t.text}" is ${t.width.toFixed(1)} px wide and its box is ${reserved.toFixed(1)} px`);
  }
  expect(faults, `${where}\n${faults.join("\n")}`).toEqual([]);
}

interface CodeBox {
  text: string;
  textBox: { x0: number; y0: number; x1: number; y1: number };
  /** The base of an arch or the peg of a bed, which holds the code. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** The shape of the plot that the code belongs to. */
  plot: { x0: number; y0: number; x1: number; y1: number };
  /** The other plots of the drawing. */
  others: { x0: number; y0: number; x1: number; y1: number }[];
  /** The dotted line of each path, in the drawing's own pixels. */
  lines: [number, number][][];
  frame: { width: number; height: number };
  /** The tab of the chosen plot and the text on it. */
  tab?: { box: { x0: number; y0: number; x1: number; y1: number }; text: string; textBox: { x0: number; y0: number; x1: number; y1: number } };
}

/** Every code on every sheet of the page, with the box that holds it and what is round it, read at its drawn size. */
async function readCodeBoxes(page: import("@playwright/test").Page): Promise<CodeBox[]> {
  return page.evaluate(() => {
    const out: CodeBox[] = [];
    for (const svg of document.querySelectorAll<SVGSVGElement>("svg.sheet")) {
      const origin = svg.getBoundingClientRect();
      if (origin.width === 0) continue;
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x0: r.left - origin.left, y0: r.top - origin.top, x1: r.right - origin.left, y1: r.bottom - origin.top };
      };
      const groups = [...svg.querySelectorAll(":scope > g")];
      const plots = groups.map((g) => ({ g, shape: g.querySelector("path.plot, polygon.plot") })).filter((p): p is { g: Element; shape: Element } => p.shape !== null);
      const lines = [...svg.querySelectorAll<SVGPolylineElement>("polyline.path-line")].map((line) =>
        (line.getAttribute("points") ?? "").trim().split(/\s+/).map((pair) => pair.split(",").map(Number) as [number, number]).filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])),
      );
      const tabRect = svg.querySelector("rect.tab");
      const tabText = svg.querySelector("text.tab-text");
      for (const { g, shape } of plots) {
        const text = g.querySelector(':scope > text[data-kind="plot"]');
        const box = g.querySelector("rect.base, rect.peg");
        if (text === null || box === null) continue;
        out.push({
          text: (text.textContent ?? "").trim(),
          textBox: rel(text),
          box: rel(box),
          plot: rel(shape),
          others: plots.filter((p) => p.shape !== shape).map((p) => rel(p.shape)),
          lines,
          frame: { width: origin.width, height: origin.height },
          ...(tabRect === null || tabText === null ? {} : { tab: { box: rel(tabRect), text: (tabText.textContent ?? "").trim(), textBox: rel(tabText) } }),
        });
      }
    }
    return out;
  });
}

// The drawing rounds each coordinate to a tenth of a pixel, so two boxes that touch may overlap by up to 0.3 px.
const overlapsBox = (a: CodeBox["box"], b: CodeBox["box"]): boolean => a.x0 < b.x1 - 0.3 && b.x0 < a.x1 - 0.3 && a.y0 < b.y1 - 0.3 && b.y0 < a.y1 - 0.3;

/**
 * Each code fits its box with padding, and its box overlaps no other code box, no other plot, no path line and not the
 * frame. `strictPlots` also holds the box off every other plot. Plots that stand edge to edge (a generated grid) have a
 * base that is 5 percent wider than the arch by design, so that check is for the maps with a gap between their plots.
 */
function expectCodeBoxes(boxes: readonly CodeBox[], where: string, options: { strictPlots: boolean }): void {
  const faults: string[] = [];
  for (const [i, b] of boxes.entries()) {
    const room = (b.textBox.x0 - b.box.x0).toFixed(1);
    if (b.textBox.x0 - b.box.x0 < 3 - 0.01 || b.box.x1 - b.textBox.x1 < 3 - 0.01) faults.push(`"${b.text}" has ${room} px of padding in its box, needs 3`);
    if (b.box.x0 < -0.01 || b.box.y0 < -0.01 || b.box.x1 > b.frame.width + 0.01 || b.box.y1 > b.frame.height + 0.01) faults.push(`the box of "${b.text}" leaves the frame`);
    for (const other of boxes.slice(i + 1)) if (overlapsBox(b.box, other.box)) faults.push(`the box of "${b.text}" overlaps the box of "${other.text}"`);
    if (options.strictPlots) for (const plot of b.others) if (overlapsBox(b.box, plot)) faults.push(`the box of "${b.text}" overlaps another plot`);
    for (const line of b.lines) {
      for (let k = 0; k + 1 < line.length; k += 1) {
        const [ax, ay] = line[k] as [number, number];
        const [bx, by] = line[k + 1] as [number, number];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let s = 0; s <= steps; s += 1) {
          const x = ax + ((bx - ax) * s) / steps;
          const y = ay + ((by - ay) * s) / steps;
          if (x > b.box.x0 && x < b.box.x1 && y > b.box.y0 && y < b.box.y1) {
            faults.push(`a path line crosses the box of "${b.text}"`);
            s = steps;
            k = line.length;
          }
        }
      }
    }
    if (b.tab !== undefined) {
      const t = b.tab;
      if (t.textBox.x0 - t.box.x0 < 3 - 0.01 || t.box.x1 - t.textBox.x1 < 3 - 0.01) faults.push(`the tab text "${t.text}" has no 3 px of padding`);
    }
  }
  expect(faults, `${where}\n${faults.join("\n")}`).toEqual([]);
}
for (const app of APPS) {
  test.describe(`${app.title}, map labels in the shipped font`, () => {
    test.use({ baseURL: app.origin });

    test("names and codes are 14 px bold in the shipped font, fit their boxes and touch nothing", async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(widthOf(page));
      const requests = trackRequests(page, app.origin);
      const siteId = await openPractice(page, app);
      const events = await storedEvents(page, siteId);
      const codes = app.key === "churchyard" ? ["Y07", "Y01", "Y12"] : ["B02", "B05", "B06"];
      const views = [
        { route: `/#/r/${siteId}/map`, what: "map, nothing chosen" },
        { route: `/#/r/${siteId}`, what: "home" },
        ...codes.map((code) => ({ route: `/#/r/${siteId}/map?plot=${plotIdOf(events, code)}`, what: `map, ${code} chosen` })),
      ];
      for (const view of views) {
        await page.goto(view.route);
        await settle(page);
        expect(await page.evaluate(() => document.fonts.check('700 14px "Atkinson Hyperlegible Next"')), `${view.what}: the shipped font is loaded`).toBe(true);
        expectFit(await readTexts(page), view.what);
        expectCodeBoxes(await readCodeBoxes(page), view.what, { strictPlots: true });
        const found = findLabelCollisions(await page.evaluate(readSheetScene));
        expect(found, `${view.what} at ${page.viewportSize()?.width}\n${JSON.stringify(found, null, 1)}`).toEqual([]);
      }
      expect(requests.external).toEqual([]);
    });
  });
}

test.describe("the practice maps of the start page, in the shipped font", () => {
  test("names are 14 px bold, fit their boxes and touch nothing", async ({ page }) => {
    await page.setViewportSize(widthOf(page));
    await page.goto(SITE);
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await page.evaluate(() => document.fonts.check('700 14px "Atkinson Hyperlegible Next"'))).toBe(true);
    const scenes = await page.evaluate(readSheetScene);
    expect(scenes.length, "both practice maps").toBe(2);
    expectFit(await readTexts(page), "start page");
    expectCodeBoxes(await readCodeBoxes(page), "start page", { strictPlots: true });
    const found = findLabelCollisions(scenes);
    expect(found, `start page at ${page.viewportSize()?.width}\n${JSON.stringify(found, null, 1)}`).toEqual([]);
  });
});

// ---- Codes of wide capitals (spec 07, task 7.19, L6.5) -------------------------------------------------------------------
// A code box is sized from the widths of its own characters, so W, M, Q and G fit as the digits do. Three rows of three plots
// each, with the codes W01 to W03, MW12 to MW14 and QQGO1 to QQGO3, in a register of the keeper's own, in both registers.
// The code of each plot is read at its drawn width and must fit its box with padding. No code box overlaps another, leaves
// the frame or crosses a path line, and no label overlaps another label, a plot, an outline or the frame. At 360 and 1440 wide.

const WIDE_GRIDS = [
  { section: "Wide", prefix: "W", first: "1", digits: "2", rows: "1", columns: "3", width: "100", height: "70", east: "100", north: "100" },
  { section: "Mixed", prefix: "MW", first: "12", digits: "2", rows: "1", columns: "3", width: "100", height: "70", east: "100", north: "200" },
  { section: "Quads", prefix: "QQGO", first: "1", digits: "1", rows: "1", columns: "3", width: "100", height: "70", east: "100", north: "300" },
] as const;

for (const app of APPS) {
  test.describe(`${app.title}, codes of wide capitals`, () => {
    test.use({ baseURL: app.origin });

    test("W01, MW12 and QQGO1 fit their boxes with padding, and touch nothing", async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(widthOf(page));
      const requests = trackRequests(page, app.origin);
      const siteId = await startOwn(page, app, "Wide Codes");
      for (const grid of WIDE_GRIDS) {
        await page.goto(`/#/r/${siteId}/map/edit`);
        await expect(page.getByRole("heading", { level: 1, name: "Map setup" })).toBeVisible();
        await fillGrid(page, grid);
        await page.getByRole("button", { name: "Preview plots" }).click();
        await page.getByRole("button", { name: "Apply layout" }).click();
        await expect(page.getByText("Map saved.")).toBeVisible();
      }
      expect(siteIdOf(page)).toBe(siteId);
      const events = await storedEvents(page, siteId);
      const wanted = ["W01", "MW12", "QQGO1"];
      const views = [
        { route: `/#/r/${siteId}/map`, what: "map, nothing chosen" },
        { route: `/#/r/${siteId}`, what: "home" },
        ...wanted.map((code) => ({ route: `/#/r/${siteId}/map?plot=${plotIdOf(events, code)}`, what: `map, ${code} chosen` })),
      ];
      for (const view of views) {
        await page.goto(view.route);
        await settle(page);
        expect(await page.evaluate(() => document.fonts.check('700 14px "Atkinson Hyperlegible Next"')), `${view.what}: the shipped font is loaded`).toBe(true);
        const texts = await readTexts(page);
        expectFit(texts, view.what);
        const boxes = await readCodeBoxes(page);
        // Every plot is wide enough for its code at these sizes, so every code of the three grids is drawn in its box.
        const drawn = boxes.map((b) => b.text);
        const chosen = view.what.match(/map, (\S+) chosen/)?.[1];
        for (const code of wanted) if (code !== chosen) expect(drawn, `${view.what}: ${code} is drawn in its plot`).toContain(code);
        expectCodeBoxes(boxes, view.what, { strictPlots: false });
        const found = findLabelCollisions(await page.evaluate(readSheetScene));
        expect(found, `${view.what} at ${page.viewportSize()?.width}\n${JSON.stringify(found, null, 1)}`).toEqual([]);
        expect((await measureLayout(page, { skipHitTest: true })).filter((v) => v.rule.startsWith("label_")), view.what).toEqual([]);
      }
      expect(requests.external).toEqual([]);
    });
  });
}

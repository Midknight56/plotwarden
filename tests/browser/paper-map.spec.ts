// T03, T04 and T05 in a real browser, at 360 by 640 and at 1920 by 1080.
// Generate 200 plots and omit a corner, trace an odd section and a path with the keyboard,
// fix a crossing, pin a private plan, hide it, import a finished layout twice, reject a
// conflicting import, rename a linked code and find the old code in the list and in print.
import { expect, test } from "@playwright/test";
import { focusRingContrast, measureLayout, trackRequests } from "../helpers/measureLayout";
import { BOOK_GRID, fillGrid, fixturePath, generateGrid, openMapEditor, readDownload, startRegister, upload } from "../helpers/screens";

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

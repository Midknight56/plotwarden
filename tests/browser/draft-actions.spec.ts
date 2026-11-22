// Review finding 5 (R9.5, R9.6, R26.7), in a real browser at 360 by 640 and at 1920 by 1080.
// Every screen that saves offers "Keep my draft" and "Open latest" when another tab saved first, and "Try again"
// and "Download recovery file" when the write fails. The words typed are kept, offered again and given back.
import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { BOOK_GRID, fillGrid, generateGrid, readDownload, startRegister } from "../helpers/screens";

const noViolations = async (page: Page) => {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
};

/** The next write of an event fails, as a full or refused disk does. */
async function failWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __add?: IDBObjectStore["add"] };
    w.__add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["add"]>) {
      if (this.name === "events") throw new Error("Disk write failed");
      return (w.__add as IDBObjectStore["add"]).apply(this, args);
    };
  });
}

async function allowWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __add?: IDBObjectStore["add"] };
    if (w.__add !== undefined) IDBObjectStore.prototype.add = w.__add;
  });
}

/** Another tab of the same register saves one record, so this tab is behind. */
async function saveInOtherTab(context: BrowserContext, page: Page, ref: string, plot: string): Promise<void> {
  const other = await context.newPage();
  const size = page.viewportSize();
  if (size !== null) await other.setViewportSize(size);
  await other.goto(page.url().replace(/\/(map\/edit|map\/trace|plot\/[^/?#]+)(\?.*)?$/, "/add/one"));
  await other.getByLabel("Name", { exact: true }).fill("Other Person");
  await other.getByLabel("Source ref").fill(ref);
  await other.getByLabel("Plot", { exact: true }).fill(plot);
  await other.getByLabel("Burial date").fill("1874");
  await other.getByRole("button", { name: "Review rows" }).click();
  await other.getByRole("button", { name: "Save 1 record" }).click();
  await expect(other.getByText("1 saved · 0 still need a plot.")).toBeVisible();
  await other.close();
}

const CHANGED = "This register changed in another tab.";
const ABORTED = "Changes are still in this tab. Download a recovery file.";

/**
 * The error inside the screen, and not the banner at the top that every screen shares. The banner arrives from the other
 * tab and the error from the refused save, in either order, so both are waited for before the error is chosen.
 */
async function staleErrorOf(page: Page) {
  const both = page.getByRole("alert").filter({ hasText: CHANGED });
  await expect(both).toHaveCount(2);
  return both.last();
}

async function readRecovery(page: Page, click: () => Promise<void>): Promise<{ format: string; rawRows: Record<string, string>[]; commands: unknown[]; mapping: Record<string, string>; text: string }> {
  const [file] = await Promise.all([page.waitForEvent("download"), click()]);
  expect(file.suggestedFilename()).toBe("register-recovery.json");
  const text = await readDownload(file);
  return { ...(JSON.parse(text) as { format: string; rawRows: Record<string, string>[]; commands: unknown[]; mapping: Record<string, string> }), text };
}

test.describe("map setup", () => {
  test("keeps the typed grid when another tab saved first, offers it again, and gives it as a file when the write fails", async ({ page, context }) => {
    const requests = trackRequests(page);
    await startRegister(page, "Paper Book");
    await generateGrid(page, BOOK_GRID);
    // The map setup screen is still open after "Map saved." A second section goes beside the first.
    const second = { ...BOOK_GRID, section: "Second", prefix: "D", east: "2000", north: "2000" };
    await fillGrid(page, second);
    await page.getByRole("button", { name: "Preview plots" }).click();
    await expect(page.getByRole("button", { name: "Apply layout" })).toBeVisible();

    // Another tab saved first: the save is refused, and the two buttons are in the screen.
    await saveInOtherTab(context, page, "R900", "C001");
    await page.getByRole("button", { name: "Apply layout" }).click();
    const mine = await staleErrorOf(page);
    await expect(mine.getByRole("button", { name: "Keep my draft" })).toBeVisible();
    await expect(mine.getByRole("button", { name: "Open latest" })).toBeVisible();
    await noViolations(page);
    await mine.getByRole("button", { name: "Keep my draft" }).click();
    await expect(page.getByText("Your draft is kept on this device.")).toBeVisible();

    // After a reload the draft is offered. Resume gives back every field.
    await page.reload();
    await expect(page.getByText("A draft of unsaved input is waiting.")).toBeVisible();
    await noViolations(page);
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByText("Draft restored.")).toBeVisible();
    await expect(page.getByLabel("Section name", { exact: true })).toHaveValue("Second");
    await expect(page.getByLabel("Prefix", { exact: true })).toHaveValue("D");
    await expect(page.getByLabel("Start east", { exact: true })).toHaveValue("2000");

    // A failed write keeps the typed fields and offers the recovery file.
    await page.getByRole("button", { name: "Preview plots" }).click();
    await failWrites(page);
    await page.getByRole("button", { name: "Apply layout" }).click();
    const failed = page.getByRole("alert").filter({ hasText: ABORTED });
    await expect(failed).toBeVisible();
    await expect(failed.getByRole("button", { name: "Try again" })).toBeVisible();
    await noViolations(page);
    const recovery = await readRecovery(page, () => failed.getByRole("button", { name: "Download recovery file" }).click());
    expect(recovery.format).toBe("plot.draft.v1");
    expect(recovery.commands).toEqual([]);
    expect(recovery.mapping["screen"]).toBe("map_edit");
    expect(recovery.rawRows[0]).toMatchObject({ section: "Second", prefix: "D", east: "2000", north: "2000" });
    expect(recovery.text).not.toContain("Paper Book");
    await expect(page.getByText("Saved on this device.")).toHaveCount(0);
    await expect(page.getByLabel("Section name", { exact: true })).toHaveValue("Second");

    // Once writes work again, the same typed fields save, and the draft is gone.
    await allowWrites(page);
    await failed.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Apply layout" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("A draft of unsaved input is waiting.")).toHaveCount(0);
    await expect(requests.external).toEqual([]);
  });
});

test.describe("trace", () => {
  test("keeps the drawn point, the name and the typed numbers, and gives them as a file when the write fails", async ({ page, context }) => {
    await startRegister(page, "Paper Book");
    await generateGrid(page, BOOK_GRID);
    await page.evaluate(() => {
      window.location.hash = window.location.hash.replace("/map/edit", "/map/trace?target=gate");
    });
    await expect(page.getByRole("heading", { level: 1, name: "Trace" })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Lantern gate");
    await page.getByLabel("East", { exact: true }).fill("120");
    await page.getByLabel("North", { exact: true }).fill("90");
    await page.getByRole("button", { name: "Add point" }).click();
    await expect(page.getByText("Last point: East 120, North 90")).toBeVisible();

    await saveInOtherTab(context, page, "R900", "C001");
    await page.getByRole("button", { name: "Add gate" }).click();
    const mine = await staleErrorOf(page);
    await expect(mine.getByRole("button", { name: "Keep my draft" })).toBeVisible();
    await expect(mine.getByRole("button", { name: "Open latest" })).toBeVisible();
    await noViolations(page);
    await mine.getByRole("button", { name: "Keep my draft" }).click();
    await expect(page.getByText("Your draft is kept on this device.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("A draft of unsaved input is waiting.")).toBeVisible();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Lantern gate");
    await expect(page.getByLabel("East", { exact: true })).toHaveValue("120");
    await expect(page.getByText("Last point: East 120, North 90")).toBeVisible();

    await failWrites(page);
    await page.getByRole("button", { name: "Add gate" }).click();
    const failed = page.getByRole("alert").filter({ hasText: ABORTED });
    await expect(failed).toBeVisible();
    const recovery = await readRecovery(page, () => failed.getByRole("button", { name: "Download recovery file" }).click());
    expect(recovery.mapping["screen"]).toBe("trace_edit");
    expect(recovery.rawRows[0]).toMatchObject({ target: "gate", name: "Lantern gate", points: "120,90" });
    await allowWrites(page);
    await failed.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Add gate" }).click();
    await expect(page.getByText("Map saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("A draft of unsaved input is waiting.")).toHaveCount(0);
  });
});

test.describe("plot details", () => {
  test("keeps a typed note when another tab saved first, and gives it as a file when the write fails", async ({ page, context }) => {
    await startRegister(page, "Paper Book");
    await generateGrid(page, BOOK_GRID);
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Plot list" }).click();
    await page.getByRole("listitem").filter({ hasText: "C002" }).getByRole("link", { name: "Plot C002" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plot C002" })).toBeVisible();
    await page.getByLabel("Note", { exact: true }).fill("Moss on the left.");

    await saveInOtherTab(context, page, "R900", "C001");
    await page.getByRole("button", { name: "Add note" }).click();
    const mine = await staleErrorOf(page);
    await expect(mine.getByRole("button", { name: "Keep my draft" })).toBeVisible();
    await expect(mine.getByRole("button", { name: "Open latest" })).toBeVisible();
    await noViolations(page);
    await mine.getByRole("button", { name: "Keep my draft" }).click();
    await expect(page.getByText("Your draft is kept on this device.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("A draft of unsaved input is waiting.")).toBeVisible();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Moss on the left.");

    await failWrites(page);
    await page.getByRole("button", { name: "Add note" }).click();
    const failed = page.getByRole("alert").filter({ hasText: ABORTED });
    await expect(failed).toBeVisible();
    await expect(failed.getByRole("button", { name: "Try again" })).toBeVisible();
    const recovery = await readRecovery(page, () => failed.getByRole("button", { name: "Download recovery file" }).click());
    expect(recovery.mapping["screen"]).toMatch(/^plot:/);
    expect(recovery.rawRows[0]).toMatchObject({ note: "Moss on the left." });
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Moss on the left.");
    await allowWrites(page);
    await failed.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Note added.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("A draft of unsaved input is waiting.")).toHaveCount(0);
  });
});

test.describe("restore", () => {
  test("keeps the chosen backup and the typed name when a restore fails, and gives the name as a file", async ({ page }) => {
    await startRegister(page, "Paper Book");
    await generateGrid(page, BOOK_GRID);
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Back up", exact: true }).click();
    const [backup] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download private backup" }).click()]);
    const backupPath = await backup.path();
    await page.getByRole("link", { name: "Restore backup" }).click();
    await page.getByLabel("Choose backup").setInputFiles(backupPath);
    await expect(page.getByRole("button", { name: "Restore as new register" })).toBeVisible();
    await failWrites(page);
    await page.getByRole("button", { name: "Restore as new register" }).click();
    const failed = page.getByRole("alert").filter({ hasText: ABORTED });
    await expect(failed).toBeVisible();
    await expect(failed.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(failed.getByRole("button", { name: "Keep my draft" })).toHaveCount(0);
    await noViolations(page);
    const recovery = await readRecovery(page, () => failed.getByRole("button", { name: "Download recovery file" }).click());
    expect(recovery.format).toBe("plot.draft.v1");
    expect(recovery.mapping["screen"]).toBe("restore");
    expect(recovery.commands).toEqual([]);
    // The backup that was chosen is still on screen, and nothing was reported as restored.
    await expect(page.getByRole("button", { name: "Restore as new register" })).toBeVisible();
    await expect(page.getByText("Restored Paper Book.")).toHaveCount(0);

    await allowWrites(page);
    await failed.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Restore as new register" }).click();
    await expect(page.getByText("Restored Paper Book.")).toBeVisible();
  });
});

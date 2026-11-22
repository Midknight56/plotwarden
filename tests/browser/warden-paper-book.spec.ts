// The 200 record paper book on the real Churchyard Register, at 360 by 640 and at 1920 by 1080 (spec 03, task 3.23,
// requirement C11). The same path as the 200 record case of `paper-entry.spec.ts`, which runs on the test app of
// `tests/host`, but here the keeper starts from the practice book that the Import screen offers.
//
// Worked totals are in `tests/fixtures/expected/hand-totals.md`, section 3. A warden makes the section Paper, 10 by 20,
// prefix C, 3 digits, imports the practice book (row 117 has no source ref), fixes row 117, imports 200, imports the
// same file again, and places R199. Then a name from the book is searched and its plot is shown on the map.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { CHURCH, sizeOf, startOwn, storedEvents } from "../helpers/routes";
import { BOOK_GRID, fixturePath, generateGrid, readDownload, upload } from "../helpers/screens";

const APP = CHURCH.origin;
test.use({ baseURL: APP });

const SHOTS = "docs/acceptance/layout/churchyard";
const GOOD = readFileSync(fixturePath("paper-200.csv"), "utf8");
const BAD = readFileSync(fixturePath("paper-200-bad.csv"), "utf8");

const noViolations = async (page: Page) => {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
};

const counts = (page: Page) => page.getByRole("list", { name: "Review import" });

const home = async (page: Page) => {
  await page.getByRole("link", { name: "Back to register" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Paper Book" })).toBeVisible();
};

async function openImport(page: Page): Promise<void> {
  const back = page.getByRole("link", { name: "Back to register" }).first();
  if ((await back.count()) > 0) await back.click();
  await page.getByRole("link", { name: "Add records" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add records" })).toBeVisible();
  await page.getByRole("link", { name: "Import spreadsheet" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import spreadsheet" })).toBeVisible();
}

/** The proof picture of the import review: the counts and the row that needs a look, as the keeper sees them. */
async function proof(page: Page, name: string): Promise<void> {
  await noViolations(page);
  // Scroll after the measure, which leaves the page at the top.
  await counts(page).evaluate((list) => list.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${SHOTS}/${name}-${sizeOf(page)}.png`, type: "png" });
}

/** Open the plot list, choose a state filter and read how many plots it holds. */
async function plotsWith(page: Page, state: "Taken" | "Needs checking", howMany: string): Promise<void> {
  await page.getByRole("link", { name: "Plot list" }).click();
  await page.getByRole("link", { name: state, exact: true }).click();
  await expect(page.getByText(howMany, { exact: true })).toBeVisible();
}

async function search(page: Page, text: string): Promise<void> {
  await page.getByLabel("Name or plot code", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test.describe("the 200 record book on the Churchyard Register", () => {
  test("makes 200 plots, refuses the bad file, imports 200, adds nothing twice, places R199 and finds a name on the map", async ({ page }) => {
    test.setTimeout(240_000);
    const requests = trackRequests(page, APP);
    const siteId = await startOwn(page, CHURCH, "Paper Book");

    // The section Paper, 10 by 20, prefix C, 3 digits: 200 plots, all still to be checked.
    await generateGrid(page, BOOK_GRID);
    await home(page);
    await page.getByRole("link", { name: "Plot list" }).click();
    await expect(page.getByText("200 plots", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("200 plots", { exact: true })).toBeVisible();
    const eventsBefore = (await storedEvents(page, siteId)).length;

    // The Import screen offers a practice book beside the column guide.
    await openImport(page);
    const guideButton = page.getByRole("button", { name: "Download column guide" });
    const practiceLink = page.getByRole("link", { name: "Download a practice book" });
    await expect(practiceLink).toBeVisible();
    // Beside the column guide: in the same row of actions.
    const together = page.locator(".actions").filter({ has: guideButton }).filter({ has: practiceLink });
    await expect(together).toHaveCount(1);
    await expect(together.getByRole("button", { name: "Download column guide" })).toHaveCount(1);
    const [practice] = await Promise.all([page.waitForEvent("download"), practiceLink.click()]);
    expect(practice.suggestedFilename()).toBe("practice-book.csv");
    const practiceText = await readDownload(practice);
    expect(practiceText).toBe(BAD);
    expect(practiceText.split("\n")).toHaveLength(202);
    await noViolations(page);

    // The downloaded file is the one the keeper tries. Its heading Name is matched to Recorded name, and the match shows.
    await page.getByLabel("Choose CSV").setInputFiles(await practice.path());
    await expect(page.getByRole("heading", { name: "Match columns" })).toBeVisible();
    await expect(page.getByLabel("Register field")).toHaveCount(6);
    const nameColumn = page.getByRole("group", { name: /Column 2/ });
    await expect(nameColumn).toContainText("Name");
    await expect(nameColumn.getByLabel("Register field")).toHaveValue("recordedName");
    await expect(nameColumn.locator("option:checked")).toHaveText("Recorded name");
    await noViolations(page);
    await page.getByRole("button", { name: "Review import" }).click();

    // 200 rows, one error, 197 ready and 2 to place later. Nothing can be imported yet.
    await expect(counts(page)).toContainText("Errors 1");
    await expect(counts(page)).toContainText("Ready 197");
    await expect(counts(page)).toContainText("Location to confirm 2");
    await expect(counts(page)).toContainText("Already in register 0");
    await expect(counts(page)).toContainText("Left out 0");
    await expect(page.getByRole("button", { name: "Import 199 records" })).toBeDisabled();
    const row117 = page.getByRole("listitem").filter({ hasText: "Row 117" });
    await expect(row117).toContainText("Check Source ref in row 117. Enter a value.");
    await row117.scrollIntoViewIfNeeded();
    await proof(page, "paper-book-error");

    // The import is cancelled. Nothing was written: not one event, no name found, every plot still to be checked.
    await page.getByRole("button", { name: "Cancel import" }).click();
    expect((await storedEvents(page, siteId)).length).toBe(eventsBefore);
    await home(page);
    await search(page, "Fernhollow");
    await expect(page.getByText("No matches for Fernhollow.")).toBeVisible();
    await page.getByRole("link", { name: "Plot list" }).click();
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("200 plots", { exact: true })).toBeVisible();

    // Row 117 is fixed by giving it its source ref. The button then reads Import 200 records.
    await openImport(page);
    await page.getByLabel("Choose CSV").setInputFiles(fixturePath("paper-200-bad.csv"));
    await page.getByRole("button", { name: "Review import" }).click();
    await page.getByRole("listitem").filter({ hasText: "Row 117" }).getByRole("button", { name: "Fix row" }).click();
    const dialog = page.getByRole("dialog", { name: "Fix row 117" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Source ref").fill("R117");
    await dialog.getByRole("button", { name: "Save row" }).click();
    await expect(dialog).toBeHidden();
    await expect(counts(page)).toContainText("Errors 0");
    await expect(counts(page)).toContainText("Ready 198");
    await expect(counts(page)).toContainText("Location to confirm 2");
    await expect(page.getByText("Nothing to fix before the import. 2 records will need a plot after it.")).toBeVisible();
    const importAll = page.getByRole("button", { name: "Import 200 records" });
    await expect(importAll).toBeEnabled();
    await proof(page, "paper-book-ready");
    await importAll.click();
    await expect(page.getByText("200 saved · 2 still need a plot.")).toBeVisible();
    await expect(page.getByText("Saved on this device.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 200 records" })).toHaveCount(0);
    const eventsAfter = (await storedEvents(page, siteId)).length;
    expect(eventsAfter).toBeGreaterThan(eventsBefore);

    // 198 plots are taken, 2 still need checking, and the 2 records with no place are listed apart from the states.
    await home(page);
    await expect(page.getByRole("link", { name: "Unplaced burials · 2" })).toBeVisible();
    await plotsWith(page, "Taken", "198 plots");
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("2 plots", { exact: true })).toBeVisible();
    await noViolations(page);

    // The same file again, in file order and with the rows reversed: nothing new, and not one event more.
    const reversed = [GOOD.split("\n")[0], ...GOOD.trimEnd().split("\n").slice(1).reverse()].join("\n") + "\n";
    for (const text of [GOOD, reversed]) {
      await openImport(page);
      await page.getByLabel("Choose CSV").setInputFiles(upload("paper-200.csv", text));
      await page.getByRole("button", { name: "Review import" }).click();
      await expect(counts(page)).toContainText("Already in register 200");
      await expect(counts(page)).toContainText("Ready 0");
      await expect(counts(page)).toContainText("Conflicts 0");
      await expect(page.getByText("There is nothing new to import.")).toBeVisible();
      await page.getByRole("button", { name: "Cancel import" }).click();
    }
    expect((await storedEvents(page, siteId)).length).toBe(eventsAfter);

    // R199 is placed on C199 by a corrected row: 199 placed, 1 unplaced, 1 plot still to be checked.
    await openImport(page);
    const placed = GOOD.replace("R199,Sorrel Larkspur,,,unknown,P20", "R199,Sorrel Larkspur,Paper,C199,unknown,P20");
    expect(placed).not.toBe(GOOD);
    await page.getByLabel("Choose CSV").setInputFiles(upload("paper-200.csv", placed));
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(counts(page)).toContainText("Conflicts 1");
    await page.getByRole("listitem").filter({ hasText: "Row 199" }).getByRole("button", { name: "Record correction" }).click();
    await expect(counts(page)).toContainText("Ready 1");
    await page.getByRole("button", { name: "Import 1 record" }).click();
    await expect(page.getByText("1 saved · 0 still need a plot.")).toBeVisible();
    await home(page);
    await expect(page.getByRole("link", { name: "Unplaced burials · 1" })).toBeVisible();
    await plotsWith(page, "Taken", "199 plots");
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("1 plot", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "C200" })).toBeVisible();

    // A name from the book shows its plot on the map: the tab with its code is drawn there only after the search.
    await home(page);
    const map = page.getByRole("region", { name: "Site map" });
    await expect(map).not.toContainText("C117");
    await search(page, "Quill Fernhollow");
    await expect(page.getByText("1 found")).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: "Quill Fernhollow · C117 · Paper" });
    await expect(card).toBeVisible();
    await expect(page.locator(".summary-line")).toContainText("C117 · Paper · Taken");
    await expect(map).toContainText("C117");
    // Every rule of the layout measure holds, with no exception. On this dense map 200 plots stand side by side, so the
    // code tab of a plot in the middle of the grid has no free place beside it. It stands outside the block, above or
    // below the plots, and a thin leader line joins it to its plot (spec 02, P19.10, task 18). Before task 18 this step
    // filtered the one rule `label_on_plot` by name, because the tab lay over its neighbours.
    const found = await measureLayout(page);
    expect(found, JSON.stringify(found, null, 1)).toEqual([]);
    // The tab and its leader are drawn: the plot is in the middle, so the leader line is there.
    await expect(map.locator("polyline.leader")).toHaveCount(1);
    await expect(map.locator("text.tab-text")).toHaveText("C117");

    // The record that was placed last is found at its new plot.
    await search(page, "Sorrel Larkspur");
    await expect(page.getByText("1 found")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Sorrel Larkspur · C199 · Paper" })).toBeVisible();
    await expect(page.locator(".summary-line")).toContainText("C199 · Paper · Taken");
    await expect(map).toContainText("C199");

    expect(requests.external).toEqual([]);
  });
});

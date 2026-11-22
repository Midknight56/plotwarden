// T06, T07, T08, T10 and T11 in a real browser, at 360 by 640 and at 1920 by 1080.
// Enter rows beside a page photo, paste cells, be interrupted, recover and validate.
// Import the 200 record book from CSV with R117 missing its source ref, import it again,
// and place R199. Back up and restore, and keep a photo with its metadata removed.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { verifyBackup } from "../../template/src/data/backup";
import { findMetadata } from "../../template/src/data/images";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { BOOK_GRID, expectSearchOutOfAddress, fixturePath, generateGrid, readDownload, startRegister, upload } from "../helpers/screens";

const noViolations = async (page: Page) => {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
};

const GOOD = readFileSync(fixturePath("paper-200.csv"), "utf8");

async function openAdd(page: Page, way: "One record" | "Fast entry" | "Import spreadsheet"): Promise<void> {
  // From an inner screen, go home first. The register home has no such link.
  const home = page.getByRole("link", { name: "Back to register" }).first();
  if ((await home.count()) > 0) await home.click();
  await page.getByRole("link", { name: "Add records" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add records" })).toBeVisible();
  await page.getByRole("link", { name: way }).click();
  await expect(page.getByRole("heading", { level: 1, name: way })).toBeVisible();
}

/** A book with its 200 plots, ready for records. */
async function bookWithPlots(page: Page): Promise<void> {
  await startRegister(page, "Paper Book");
  await generateGrid(page, BOOK_GRID);
}

const counts = (page: Page) => page.getByRole("list", { name: "Review import" });

test.describe("entering records from paper", () => {
  test("enters rows beside a page photo, pastes cells, is interrupted, recovers and validates", async ({ page }) => {
    const requests = trackRequests(page);
    await bookWithPlots(page);
    await openAdd(page, "Fast entry");
    await expect(page.getByText("Choose a page or enter records without one.")).toBeVisible();
    await noViolations(page);

    // The pinned page: photo, zoom, turn, next page.
    await page.getByLabel("Choose page photo").setInputFiles(fixturePath("tiny-page.png"));
    await expect(page.getByRole("img", { name: "Register page" })).toBeVisible();
    await expect(page.getByText("Page stays on this device.")).toBeVisible();
    await page.getByRole("button", { name: "Enlarge" }).click();
    await expect(page.getByText("125 percent")).toBeVisible();
    await page.getByRole("button", { name: "Rotate" }).click();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
    await noViolations(page);

    // Eighteen typed rows. Row 10 has a plot that is not in the book.
    const row = (n: number) => page.getByRole("group", { name: `Row ${n}` });
    for (let n = 1; n <= 18; n += 1) {
      if (n > 1) await page.getByRole("button", { name: "Add row" }).click();
      const code = n === 10 ? "C999" : `C${String(n).padStart(3, "0")}`;
      const r = row(n);
      await r.getByLabel("Source ref").fill(`R${String(n).padStart(3, "0")}`);
      await r.getByLabel("Name").fill(`Person ${String(n).padStart(2, "0")} Ashgrove`);
      await r.getByLabel("Section").fill("Paper");
      await r.getByLabel("Plot").fill(code);
      await r.getByLabel("Burial date").fill(String(1850 + n));
      await r.getByLabel("Page", { exact: true }).fill("P2");
    }
    // Enter moves down the same column.
    await row(3).getByLabel("Name").press("Enter");
    await expect(row(4).getByLabel("Name")).toBeFocused();

    // Row 19 by the aids: the plot above counted up, the section and the page repeated. A name is never repeated.
    await page.getByRole("button", { name: "Add row" }).click();
    await row(19).getByLabel("Source ref").fill("R019");
    await row(19).getByLabel("Name").fill("Person 19 Ashgrove");
    await page.getByRole("button", { name: "Fill plot sequence" }).click();
    await page.getByRole("button", { name: "Repeat section" }).click();
    await page.getByRole("button", { name: "Repeat page" }).click();
    await expect(row(19).getByLabel("Plot")).toHaveValue("C019");
    await expect(row(19).getByLabel("Section")).toHaveValue("Paper");
    await expect(row(19).getByLabel("Page", { exact: true })).toHaveValue("P2");
    await expect(row(19).getByLabel("Name")).toHaveValue("Person 19 Ashgrove");

    // Two rows pasted as a block, as a spreadsheet gives them.
    await page.getByRole("button", { name: "Add row" }).click();
    // A real paste event with the cells on its clipboard. dispatchEvent cannot carry clipboard data.
    await row(20).getByLabel("Source ref").evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text/plain", "R020\tPerson 20 Ashgrove\tPaper\tC020\t1870\tP2\nR021\tPerson 21 Ashgrove\tPaper\tC021\t1871\tP2");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(row(21).getByLabel("Name")).toHaveValue("Person 21 Ashgrove");
    await expect(row(20).getByLabel("Plot")).toHaveValue("C020");
    await expect(page.getByText("Not saved").first()).toBeVisible();
    await noViolations(page);

    // Review fails on row 10. Focus goes to its plot, and nothing is lost: every row, the page, the zoom.
    await page.getByRole("button", { name: "Review rows" }).click();
    await expect(page.getByText("Row 10 needs attention.")).toBeVisible();
    await expect(row(10).getByLabel("Plot")).toBeFocused();
    await expect(row(10).getByLabel("Plot")).toHaveValue("C999");
    await expect(row(21).getByLabel("Name")).toHaveValue("Person 21 Ashgrove");
    await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
    await expect(page.getByText("125 percent")).toBeVisible();
    await expect(page.getByRole("img", { name: "Register page" })).toBeVisible();
    await noViolations(page);

    // Interrupted: the tab is reloaded. The rows come back from the draft on this device.
    await page.reload();
    await expect(page.getByText("A draft of unsaved rows is waiting.")).toBeVisible();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByText("Draft restored. Choose the page photo again.")).toBeVisible();
    await expect(row(21).getByLabel("Name")).toHaveValue("Person 21 Ashgrove");
    await expect(row(10).getByLabel("Plot")).toHaveValue("C999");
    await expect(page.getByText("Page 2", { exact: true })).toBeVisible();

    // A recovery file holds the same rows, and restores to a preview of rows only.
    const [recovery] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download recovery file" }).click()]);
    expect(recovery.suggestedFilename()).toBe("register-recovery.json");
    const recoveryText = await readDownload(recovery);
    const draft = JSON.parse(recoveryText) as { format: string; rawRows: unknown[]; commands: unknown[] };
    expect(draft.format).toBe("plot.draft.v1");
    expect(draft.rawRows.length).toBe(21);
    expect(draft.commands).toEqual([]);
    expect(recoveryText).not.toContain("Paper Book");
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(row(1).getByLabel("Source ref")).toHaveValue("");
    await page.getByLabel("Choose recovery file").setInputFiles(upload("register-recovery.json", recoveryText, "application/json"));
    await expect(row(21).getByLabel("Name")).toHaveValue("Person 21 Ashgrove");

    // Fix the plot and save all 21 together.
    await row(10).getByLabel("Plot").fill("C010");
    await page.getByRole("button", { name: "Review rows" }).click();
    await expect(counts(page)).toContainText("Ready 21");
    await expect(counts(page)).toContainText("Errors 0");
    await noViolations(page);
    const save = page.getByRole("button", { name: "Save 21 records" });
    await save.click();
    await expect(page.getByText("21 saved · 0 still need a plot.")).toBeVisible();
    await expect(page.getByText("Saved on this device.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save 21 records" })).toHaveCount(0);

    // The records are findable, and the plots they sit on are taken.
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByLabel("Name or plot code").fill("Ashgrove");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("21 found")).toBeVisible();
    await expectSearchOutOfAddress(page, "Ashgrove");
    await page.getByRole("link", { name: "Plot list" }).click();
    await page.getByRole("link", { name: "Taken", exact: true }).click();
    await expect(page.getByText("21 plots")).toBeVisible();
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("179 plots")).toBeVisible();

    // The draft is gone once the rows are saved.
    await openAdd(page, "Fast entry");
    await expect(page.getByText("A draft of unsaved rows is waiting.")).toHaveCount(0);
    await expect(requests.external).toEqual([]);
  });

  test("enters one record, and says what is missing in the field itself", async ({ page }) => {
    await bookWithPlots(page);
    await openAdd(page, "One record");
    await noViolations(page);
    await page.getByLabel("Name", { exact: true }).fill("Mirel Quillmoss");
    await page.getByRole("button", { name: "Review rows" }).click();
    await expect(page.getByText("Enter Source ref.")).toBeVisible();
    await expect(page.getByLabel("Source ref")).toBeFocused();
    await page.getByLabel("Source ref").fill("R900");
    await page.getByLabel("Plot", { exact: true }).fill("C001");
    await page.getByLabel("Burial date").fill("03/04/26");
    await page.getByRole("button", { name: "Review rows" }).click();
    await expect(page.getByText("Use a four digit year")).toBeVisible();
    await expect(page.getByLabel("Burial date")).toBeFocused();
    await page.getByLabel("Burial date").fill("1874");
    await page.getByRole("button", { name: "Review rows" }).click();
    await expect(counts(page)).toContainText("Ready 1");
    await page.getByRole("button", { name: "Save 1 record" }).click();
    await expect(page.getByText("1 saved · 0 still need a plot.")).toBeVisible();
  });

  test("imports the 200 record book: the bad file writes nothing, the fix writes 200, the repeat writes none", async ({ page }) => {
    const requests = trackRequests(page);
    await bookWithPlots(page);
    await openAdd(page, "Import spreadsheet");

    const [guide] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download column guide" }).click()]);
    const guideText = await readDownload(guide);
    expect(guideText).toContain("Source ref");
    expect(guideText).toContain("Burial date");
    await noViolations(page);

    await page.getByLabel("Choose CSV").setInputFiles(fixturePath("paper-200-bad.csv"));
    await expect(page.getByRole("heading", { name: "Match columns" })).toBeVisible();
    await expect(page.getByLabel("Register field")).toHaveCount(6);
    await expect(page.getByLabel("Date order")).toBeVisible();
    await noViolations(page);
    await page.getByRole("button", { name: "Review import" }).click();

    // 200 rows, one error, 197 ready and 2 to place later. Nothing can be imported yet.
    await expect(counts(page)).toContainText("Errors 1");
    await expect(counts(page)).toContainText("Ready 197");
    await expect(counts(page)).toContainText("Location to confirm 2");
    await expect(counts(page)).toContainText("Already in register 0");
    await expect(counts(page)).toContainText("Left out 0");
    await expect(page.getByRole("button", { name: "Import 199 records" })).toBeDisabled();
    const card = page.getByRole("listitem").filter({ hasText: "Row 117" });
    await expect(card).toContainText("Check Source ref in row 117. Enter a value.");
    await noViolations(page);

    // The import is cancelled and nothing was written.
    await page.getByRole("button", { name: "Cancel import" }).click();
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByLabel("Name or plot code").fill("Ashgrove");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No matches for Ashgrove.")).toBeVisible();

    // Again: fix row 117 by giving it its source ref.
    await openAdd(page, "Import spreadsheet");
    await page.getByLabel("Choose CSV").setInputFiles(fixturePath("paper-200-bad.csv"));
    await page.getByRole("button", { name: "Review import" }).click();
    await page.getByRole("listitem").filter({ hasText: "Row 117" }).getByRole("button", { name: "Fix row" }).click();
    const dialog = page.getByRole("dialog", { name: "Fix row 117" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Source ref").fill("R117");
    await noViolations(page);
    await dialog.getByRole("button", { name: "Save row" }).click();
    await expect(dialog).toBeHidden();
    await expect(counts(page)).toContainText("Errors 0");
    await expect(counts(page)).toContainText("Ready 198");
    const importAll = page.getByRole("button", { name: "Import 200 records" });
    await expect(importAll).toBeEnabled();
    await importAll.click();
    await expect(page.getByText("200 saved · 2 still need a plot.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 200 records" })).toHaveCount(0);

    // The two with no place are findable and listed apart from the four states.
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await expect(page.getByRole("region", { name: "Location to confirm" })).toContainText("R199");
    await expect(page.getByRole("region", { name: "Location to confirm" })).toContainText("R200");
    await page.getByLabel("Name or plot code").fill("R199");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("1 found")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Sorrel Larkspur" })).toContainText("Location to confirm");
    await noViolations(page);

    // The same file again, in file order and with the rows reversed: nothing new, 200 unchanged.
    for (const text of [GOOD, [GOOD.split("\n")[0], ...GOOD.trimEnd().split("\n").slice(1).reverse()].join("\n") + "\n"]) {
      await openAdd(page, "Import spreadsheet");
      await page.getByLabel("Choose CSV").setInputFiles(upload("paper-200.csv", text));
      await page.getByRole("button", { name: "Review import" }).click();
      await expect(counts(page)).toContainText("Already in register 200");
      await expect(counts(page)).toContainText("Ready 0");
      await expect(counts(page)).toContainText("Conflicts 0");
      await expect(page.getByText("There is nothing new to import.")).toBeVisible();
    }

    // A changed row is a conflict. Nothing is written until the keeper chooses.
    await openAdd(page, "Import spreadsheet");
    await page.getByLabel("Choose CSV").setInputFiles(upload("paper-200.csv", GOOD.replace("Quill Fernhollow", "Quill Fernhollow Jr")));
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(counts(page)).toContainText("Already in register 199");
    await expect(counts(page)).toContainText("Conflicts 1");
    const conflict = page.getByRole("listitem").filter({ hasText: "Row 117" });
    await expect(conflict).toContainText("Quill Fernhollow Jr");
    await expect(conflict).toContainText("Quill Fernhollow");
    await expect(page.getByRole("button", { name: /^Import \d+ record/ })).toBeDisabled();
    await conflict.getByRole("button", { name: "Keep current" }).click();
    await expect(counts(page)).toContainText("Conflicts 0");
    await expect(counts(page)).toContainText("Already in register 200");
    await noViolations(page);

    // Place R199 on C199 through a corrected row: 199 placed, 1 unplaced, 1 plot still unchecked.
    await page.getByRole("button", { name: "Cancel import" }).click();
    await openAdd(page, "Import spreadsheet");
    await page.getByLabel("Choose CSV").setInputFiles(upload("paper-200.csv", GOOD.replace("R199,Sorrel Larkspur,,,unknown,P20", "R199,Sorrel Larkspur,Paper,C199,unknown,P20")));
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(counts(page)).toContainText("Conflicts 1");
    await page.getByRole("listitem").filter({ hasText: "Row 199" }).getByRole("button", { name: "Record correction" }).click();
    await expect(counts(page)).toContainText("Ready 1");
    await page.getByRole("button", { name: "Import 1 record" }).click();
    await expect(page.getByText("1 saved · 0 still need a plot.")).toBeVisible();

    await page.getByRole("link", { name: "Back to register" }).first().click();
    await expect(page.getByRole("region", { name: "Location to confirm" })).toContainText("R200");
    await expect(page.getByRole("region", { name: "Location to confirm" })).not.toContainText("R199");
    await page.getByRole("link", { name: "Plot list" }).click();
    await page.getByRole("link", { name: "Taken", exact: true }).click();
    await expect(page.getByText("199 plots")).toBeVisible();
    await page.getByRole("link", { name: "Needs checking" }).click();
    await expect(page.getByText("1 plot", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "C200" })).toBeVisible();
    await expect(requests.external).toEqual([]);
  });

  test("leaves a row out, brings it back, reads a pasted sheet and asks which date order and separator", async ({ page }) => {
    await bookWithPlots(page);
    await openAdd(page, "Import spreadsheet");

    // A pasted sheet with a plot that is not in the book.
    const sheet = "Source ref,Name,Section,Plot,Burial date,Page\nR1,Alder Ashgrove,Paper,C001,1850,P1\nR2,Brindle Ashgrove,Paper,C999,1851,P1\nR3,Cove Ashgrove,Paper,C003,03/04/2026,P1\n";
    await page.getByLabel("Paste spreadsheet").fill(sheet);
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(counts(page)).toContainText("Errors 2");
    await expect(page.getByText("Check Plot in row 2. That plot is not in this register.")).toBeVisible();
    await expect(page.getByText("Check Burial date in row 3. Choose a date order.")).toBeVisible();

    // The date order is chosen once for the whole import.
    await page.getByLabel("Date order").selectOption({ label: "Day then month" });
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(counts(page)).toContainText("Errors 1");

    // Leave the bad row out. The counts change and the rest can be imported.
    await page.getByRole("listitem").filter({ hasText: "Row 2" }).getByRole("button", { name: "Leave row out" }).click();
    await expect(counts(page)).toContainText("Left out 1");
    await expect(counts(page)).toContainText("Errors 0");
    await expect(page.getByRole("button", { name: "Import 2 records" })).toBeEnabled();
    const [leftOut] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download left out rows" }).click()]);
    const leftText = await readDownload(leftOut);
    expect(leftText).toContain("R2");
    expect(leftText).not.toContain("Brindle");
    await page.getByLabel("Show rows").selectOption({ label: "Left out" });
    await page.getByRole("listitem").filter({ hasText: "Row 2" }).getByRole("button", { name: "Restore row" }).click();
    await expect(counts(page)).toContainText("Errors 1");
    await page.getByLabel("Show rows").selectOption({ label: "Errors" });
    await page.getByRole("listitem").filter({ hasText: "Row 2" }).getByRole("button", { name: "Leave row out" }).click();
    await page.getByRole("button", { name: "Import 2 records" }).click();
    await expect(page.getByText("2 saved · 0 still need a plot.")).toBeVisible();

    // When both separators fit, the keeper is asked, with a preview of each.
    await openAdd(page, "Import spreadsheet");
    await page.getByLabel("Paste spreadsheet").fill("Name;Place, County\nAnna;Leeds, West Yorkshire\n");
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByRole("radio", { name: "Comma" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Semicolon" })).toBeVisible();
    await noViolations(page);
    await page.getByRole("radio", { name: "Semicolon" }).check();
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByText("Enter Source ref.")).toBeVisible();

    // A file that is not a CSV is said so.
    await page.getByLabel("Choose CSV").setInputFiles({ name: "a.csv", mimeType: "text/csv", buffer: Buffer.from([0x61, 0xc3, 0x28, 0x62]) });
    await expect(page.getByText("Choose a spreadsheet saved as CSV.")).toBeVisible();
  });

  // Review finding 5 (R9.5, R9.6, R26.7): the staged rows and the fixes outlive a refresh and a save from another tab.
  test("keeps a staged import and its fixes across a reload and a save from another tab", async ({ page, context }) => {
    const requests = trackRequests(page);
    await bookWithPlots(page);
    await openAdd(page, "Import spreadsheet");
    await page.getByLabel("Choose CSV").setInputFiles(fixturePath("paper-200-bad.csv"));
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(counts(page)).toContainText("Errors 1");
    await page.getByRole("listitem").filter({ hasText: "Row 117" }).getByRole("button", { name: "Fix row" }).click();
    const dialog = page.getByRole("dialog", { name: "Fix row 117" });
    await dialog.getByLabel("Source ref").fill("R117");
    await dialog.getByRole("button", { name: "Save row" }).click();
    await expect(counts(page)).toContainText("Errors 0");
    await expect(counts(page)).toContainText("Ready 198");
    await noViolations(page);

    // A recovery file holds the same rows and the fix. It holds no command and no site name.
    const [recovery] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download recovery file" }).click()]);
    expect(recovery.suggestedFilename()).toBe("register-recovery.json");
    const recoveryText = await readDownload(recovery);
    const file = JSON.parse(recoveryText) as { format: string; rawRows: unknown[]; commands: unknown[]; mapping: Record<string, string> };
    expect(file.format).toBe("plot.draft.v1");
    expect(file.rawRows).toHaveLength(200);
    expect(file.commands).toEqual([]);
    expect(file.mapping["screen"]).toBe("import");
    expect(JSON.parse(file.mapping["fix:117"] ?? "{}")).toMatchObject({ sourceRef: "R117" });
    expect(recoveryText).not.toContain("Paper Book");

    // A refresh loses nothing: the draft is offered, and resuming brings back the rows with the fix.
    await page.reload();
    await expect(page.getByText("A draft of unsaved rows is waiting.")).toBeVisible();
    await noViolations(page);
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByText("Draft restored. Check the rows, then import.")).toBeVisible();
    await expect(counts(page)).toContainText("Errors 0");
    await expect(counts(page)).toContainText("Ready 198");
    await expect(page.getByRole("button", { name: "Import 200 records" })).toBeEnabled();

    // Another tab saves one record first.
    const other = await context.newPage();
    const size = page.viewportSize();
    if (size !== null) await other.setViewportSize(size);
    await other.goto(page.url().replace("/add/import", "/add/one"));
    await other.getByLabel("Name", { exact: true }).fill("Other Person");
    await other.getByLabel("Source ref").fill("R900");
    await other.getByLabel("Plot", { exact: true }).fill("C200");
    await other.getByLabel("Burial date").fill("1874");
    await other.getByRole("button", { name: "Review rows" }).click();
    await other.getByRole("button", { name: "Save 1 record" }).click();
    await expect(other.getByText("1 saved · 0 still need a plot.")).toBeVisible();
    await other.close();

    // This tab tries to save. It is refused, and both buttons are offered inside the import screen.
    const changed = page.getByRole("alert").filter({ hasText: "This register changed in another tab." });
    await expect(changed).toHaveCount(1);
    await page.getByRole("button", { name: "Import 200 records" }).click();
    await expect(changed).toHaveCount(2);
    const mine = changed.last();
    await expect(mine.getByRole("button", { name: "Keep my draft" })).toBeVisible();
    await expect(mine.getByRole("button", { name: "Open latest" })).toBeVisible();
    await noViolations(page);
    await mine.getByRole("button", { name: "Keep my draft" }).click();
    await expect(page.getByText("Your draft is kept on this device.")).toBeVisible();
    await expect(counts(page)).toContainText("Ready 198");

    // Open latest checks the rows again against the newer register. The fix and the counts are kept, and it saves.
    await changed.first().getByRole("button", { name: "Open latest" }).click();
    await expect(counts(page)).toContainText("Errors 0");
    await expect(counts(page)).toContainText("Ready 198");
    await expect(counts(page)).toContainText("Location to confirm 2");
    const importAll = page.getByRole("button", { name: "Import 200 records" });
    await expect(importAll).toBeEnabled();
    await importAll.click();
    await expect(page.getByText("200 saved · 2 still need a plot.")).toBeVisible();

    // The draft is gone once the rows are saved.
    await page.reload();
    await expect(page.getByText("A draft of unsaved rows is waiting.")).toHaveCount(0);
    await expect(requests.external).toEqual([]);
  });
});

test.describe("keeping and restoring a register", () => {
  test("backs up with a photo whose camera notes are gone, restores as a new register and refuses wrong files", async ({ page }) => {
    const requests = trackRequests(page);
    await bookWithPlots(page);

    // A photo on a plot, with its description. The picture file has text chunks. The stored one has none.
    const original = readFileSync(fixturePath("tiny-page.png"));
    expect(findMetadata(new Uint8Array(original))).toEqual(["tEXt", "tEXt"]);
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Plot list" }).click();
    await page.getByRole("listitem").filter({ hasText: "C001" }).getByRole("link", { name: "Plot C001" }).click();
    await page.getByLabel("Choose photo").setInputFiles(fixturePath("tiny-page.png"));
    await page.getByLabel("Description", { exact: true }).fill("Stone face in the north corner");
    await page.getByRole("button", { name: "Add photo" }).click();
    await expect(page.getByText("Photo added.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Stone face in the north corner" })).toBeVisible();
    await page.getByLabel("Note", { exact: true }).fill("Moss on the left.\nCheck again in spring.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Note added.")).toBeVisible();
    await noViolations(page);

    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Back up", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Back up this register" })).toBeVisible();
    await expect(page.getByText("This file contains private records and photos.")).toBeVisible();
    await noViolations(page);
    const [backup] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download private backup" }).click()]);
    expect(backup.suggestedFilename()).toMatch(/^register-backup-\d{4}-\d{2}-\d{2}\.pkr\.zip$/);
    expect(backup.suggestedFilename()).not.toContain("Paper");
    await expect(page.getByText("Your copy is ready.")).toBeVisible();
    const backupPath = await backup.path();
    const bytes = new Uint8Array(readFileSync(backupPath));
    const verified = await verifyBackup(bytes, { kind: "paper" });
    if (!verified.ok) throw new Error(JSON.stringify(verified.error));
    expect(verified.value.blobs.length).toBe(1);
    expect(findMetadata(verified.value.blobs[0]?.bytes as Uint8Array)).toEqual([]);
    expect(verified.value.site.title).toBe("Paper Book");

    // From the library, restore it as a new register.
    await page.getByRole("link", { name: "Registers", exact: true }).first().click();
    await page.getByRole("link", { name: "Restore backup" }).click();
    await page.getByLabel("Choose backup").setInputFiles(backupPath);
    await expect(page.getByText("Site: Paper Book")).toBeVisible();
    await expect(page.getByText("1 images")).toBeVisible();
    await noViolations(page);
    await page.getByRole("button", { name: "Restore as new register" }).click();
    await expect(page.getByText("Restored Paper Book.")).toBeVisible();

    // Two registers now, with the same title. The copy has the plots, the note and the photo.
    await page.getByRole("link", { name: "Registers", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Open Paper Book" })).toHaveCount(2);
    await page.getByRole("link", { name: "Open Paper Book" }).nth(1).click();
    await page.getByRole("link", { name: "Plot list" }).click();
    await expect(page.getByText("200 plots")).toBeVisible();
    await page.getByRole("listitem").filter({ hasText: "C001" }).getByRole("link", { name: "Plot C001" }).click();
    await expect(page.getByText("Moss on the left.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Stone face in the north corner" })).toBeVisible();

    // Files that are not backups are refused with their own words, and nothing is written.
    await page.getByRole("link", { name: "Registers", exact: true }).first().click();
    await page.getByRole("link", { name: "Restore backup" }).click();
    const refuse = async (name: string, content: Uint8Array | string, words: string) => {
      await page.getByLabel("Choose backup").setInputFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(content) });
      await expect(page.getByText(words)).toBeVisible();
      await expect(page.getByRole("button", { name: "Restore as new register" })).toHaveCount(0);
    };
    await refuse("copy.html", '<html><script>{"format":"plot.family.v1"}</script></html>', "This file is a visitor copy.");
    await refuse("backup.pkr.zip", bytes.slice(0, Math.floor(bytes.length / 2)), "This backup is incomplete. Your register is safe.");
    await refuse("plan.json", '{"format":"plot.review.v1","issues":[]}', "This file is a review file, not a backup.");
    await expect(requests.external).toEqual([]);
  });

  test("restores this register only with its name, goes back to the earlier copy and warns", async ({ page }) => {
    await bookWithPlots(page);
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Back up", exact: true }).click();
    const [early] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download private backup" }).click()]);
    const earlyPath = await early.path();

    // A later change: one record.
    await openAdd(page, "One record");
    await page.getByLabel("Source ref").fill("R1");
    await page.getByLabel("Name", { exact: true }).fill("Alder Ashgrove");
    await page.getByRole("button", { name: "Review rows" }).click();
    await page.getByRole("button", { name: "Save 1 record" }).click();
    await expect(page.getByText("1 saved")).toBeVisible();

    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Back up", exact: true }).click();
    await page.getByRole("link", { name: "Restore backup" }).click();
    await page.getByLabel("Choose backup").setInputFiles(earlyPath);
    await expect(page.getByText("This register", { exact: true })).toBeVisible();
    await expect(page.getByText("This backup", { exact: true })).toBeVisible();
    await expect(page.getByText("Download a backup of this register first.")).toBeVisible();
    await noViolations(page);

    const replace = page.getByRole("button", { name: "Restore this register" });
    await expect(replace).toBeDisabled();
    await page.getByLabel("Type the site name").fill("Paper");
    await expect(replace).toBeDisabled();
    await page.getByLabel("Type the site name").fill("Paper Book");
    await replace.click();
    await expect(page.getByText("Restored Paper Book.")).toBeVisible();
    await expect(page.getByText("Old review files refer to the earlier copy.")).toBeVisible();

    // The record entered after the backup is gone from the register, as the backup said.
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByLabel("Name or plot code").fill("Ashgrove");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No matches for Ashgrove.")).toBeVisible();
  });

  test("removes exactly one register after its name is typed, and shows the unknown page", async ({ page }) => {
    await startRegister(page, "Keep Book");
    await page.getByRole("link", { name: "Registers", exact: true }).first().click();
    await startRegister(page, "Remove Book");
    await page.getByRole("link", { name: "Settings", exact: true }).first().click();
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.goto("#/r/none/settings");
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open registers" })).toBeVisible();
    await noViolations(page);
    await page.goBack();

    await page.getByRole("link", { name: "Settings", exact: true }).first().click();
    const remove = page.getByRole("button", { name: "Remove this register" });
    await expect(page.getByText("Only Remove Book will be removed.")).toBeVisible();
    await expect(remove).toBeDisabled();
    await page.getByLabel("Type the site name").fill("Remove Book");
    await noViolations(page);
    await remove.click();
    await expect(page.getByText("Register removed.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Keep Book" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Remove Book" })).toHaveCount(0);
  });
});

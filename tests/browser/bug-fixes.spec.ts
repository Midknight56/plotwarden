// Twelve faults that a reviewer proved on the live site (spec 06, task 6.34, Z23). Each test follows the reviewer's
// steps on the real screen, at 360 by 640 and at 1920 by 1080, and says what should happen. The bug numbers are the
// reviewer's. There was no bug 11. The rules that have a pure home are also tested in tests/unit: familyForm, offer,
// tenancy, storage, makeYourOwn, visitor. Only what the screen alone shows is here.
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { registerRoute, siteIdOf, storedEvents } from "../helpers/routes";
import { openMapEditor, startRegister, upload } from "../helpers/screens";

const CHURCH = "http://127.0.0.1:4176/";
const GARDEN = "http://127.0.0.1:4178/";
const MARKET = "http://127.0.0.1:4180/";
const GUIDE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "make-your-own.md"), "utf8");

async function check(page: Page, label: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, `${label}\n${JSON.stringify(violations, null, 1)}`).toEqual([]);
}

async function openFold(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Lantern Fold" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
}

async function openBeds(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Thimble Beds" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();
}

async function find(page: Page, text: string): Promise<void> {
  await page.getByLabel("Name or plot code", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

const saved = (page: Page, text: string): Promise<void> => expect(page.getByText(`${text} Saved on this device.`)).toBeVisible();

test.describe("the family map", () => {
  test.use({ baseURL: CHURCH });

  /** Open the family map from the desk of the practice register. */
  async function openFamilyMap(page: Page): Promise<void> {
    await openFold(page);
    await page.getByRole("link", { name: "Make a family map" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Family map" })).toBeVisible();
  }

  test("B1 a corrected burial stays withheld until the keeper reviews it, and a save never approves a row the keeper did not see", async ({ page }, testInfo) => {
    const requests = trackRequests(page, CHURCH);
    await openFold(page);
    await find(page, "Quillmoss");
    await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" }).getByRole("link", { name: "Open burial" }).click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Mirel Quillmoss Jr");
    await page.getByLabel("Source ref of the correction").fill("LF page 7");
    await page.getByLabel("Reason for correction").fill("The stone says Jr");
    await page.getByRole("button", { name: "Record correction" }).click();
    await saved(page, "Correction saved.");
    const approvedBefore = (await storedEvents(page, siteIdOf(page))).filter((e) => e.type === "burial_approved").length;

    // Filter to Y01, so that the corrected row is hidden, change only the gate name, and save.
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Make a family map" }).click();
    await page.getByLabel("Name or plot code", { exact: true }).fill("Y01");
    await expect(page.getByLabel(/^Include this burial: Mirel Quillmoss Jr/)).toHaveCount(0);
    await page.getByLabel("Public gate name", { exact: true }).fill("Lantern Gate North");
    await page.getByRole("button", { name: "Save public details" }).click();
    await saved(page, "Public details saved.");
    const approvals = async (): Promise<number> => (await storedEvents(page, siteIdOf(page))).filter((e) => e.type === "burial_approved").length;
    expect(await approvals(), "the save approved a row that was not on screen").toBe(approvedBefore);

    // The corrected burial is back in view, unticked, with a reason. The file holds neither name.
    await page.getByLabel("Name or plot code", { exact: true }).fill("");
    const row = page.getByLabel("Include this burial: Mirel Quillmoss Jr · Y07", { exact: true });
    await expect(row).not.toBeChecked();
    await expect(page.getByText("Review again", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    const preview = page.locator(".preview-frame");
    await expect(preview).toContainText("Y07: review again before this name is shown.");
    await expect(preview).not.toContainText("Quillmoss");
    const [first] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download family copy" }).click()]);
    const firstPath = testInfo.outputPath("first.html");
    await first.saveAs(firstPath);
    expect(readFileSync(firstPath, "utf8")).not.toContain("Quillmoss");

    // The keeper reviews that burial: ticks it, sees the new name, saves. Now the file holds the new name.
    await row.check();
    await expect(page.getByLabel("Name shown to visitors: Mirel Quillmoss Jr", { exact: true })).toHaveValue("Mirel Quillmoss Jr");
    await page.getByRole("button", { name: "Save public details" }).click();
    await saved(page, "Public details saved.");
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    await expect(preview).toContainText("Mirel Quillmoss Jr");
    expect(requests.external).toEqual([]);
  });

  test("B2 Download and Print wait for pending edits, as Preview does", async ({ page }) => {
    await openFamilyMap(page);
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    const download = page.getByRole("button", { name: "Download family copy" });
    const print = page.getByRole("button", { name: "Print family map" });
    await expect(download).toBeEnabled();
    await expect(print).toBeEnabled();

    await page.getByLabel("Include this burial: Mirel Quillmoss · Y07", { exact: true }).uncheck();
    await expect(page.getByText("Save public details first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview as a visitor" })).toBeDisabled();
    await expect(download).toBeDisabled();
    await expect(print).toBeDisabled();

    // Saved, the file waits for a new preview, and then it is the new selection.
    await page.getByRole("button", { name: "Save public details" }).click();
    await saved(page, "Public details saved.");
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    await expect(download).toBeEnabled();
    await expect(page.locator(".preview-frame")).not.toContainText("Mirel Quillmoss");
  });

  test("B7 Clear public details empties the form at once, and Save waits for a change", async ({ page }) => {
    await openFamilyMap(page);
    await expect(page.getByLabel("Public site name", { exact: true })).toHaveValue("Lantern Fold");
    await expect(page.getByLabel("Public gate name", { exact: true })).toHaveValue("Lantern Gate");
    await page.getByRole("button", { name: "Clear public details" }).click();
    await saved(page, "Public details saved.");
    await expect(page.getByLabel("Public site name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Public gate name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Public directions", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Save public details" })).toBeDisabled();
    await expect(page.getByText("Save public details first.")).toHaveCount(0);
    await check(page, "family map after clear");
    // A reload says the same as the form did.
    await page.reload();
    await expect(page.getByLabel("Public site name", { exact: true })).toHaveValue("");
  });

  test("B8 the search box and the results agree after Back", async ({ page }) => {
    await openFold(page);
    await find(page, "Quillmoss");
    await expect(page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" })).toHaveCount(1);
    await find(page, "Ysolde");
    await expect(page.getByRole("listitem").filter({ hasText: "Ysolde Fenwick · Y06" })).toHaveCount(1);
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Ysolde");
    await page.goBack();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Quillmoss");
    await expect(page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" })).toHaveCount(1);
    await expect(page.getByRole("listitem").filter({ hasText: "Ysolde Fenwick · Y06" })).toHaveCount(0);
    // Forward again, and the box follows.
    await page.goForward();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Ysolde");
    // Text that was typed and not searched stays while the search stays the same.
    await page.getByLabel("Name or plot code", { exact: true }).fill("Edd");
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Edd");
    await expect(page.getByRole("listitem").filter({ hasText: "Ysolde Fenwick · Y06" })).toHaveCount(1);
  });
});

/** Make the family file of the practice register, with Ysolde added to Mirel, and return where it was saved. */
async function familyFile(page: Page, testInfo: TestInfo): Promise<string> {
  await openFold(page);
  await page.getByRole("link", { name: "Make a family map" }).click();
  await page.getByLabel("Include this burial: Ysolde Fenwick · Y06").check();
  await page.getByRole("button", { name: "Save public details" }).click();
  await saved(page, "Public details saved.");
  await page.getByRole("button", { name: "Preview as a visitor" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download family copy" }).click()]);
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

/** Open a family file with window.print recorded, so that the page that would be printed can be read. */
async function openFile(page: Page, path: string): Promise<void> {
  await page.addInitScript(`
    window.__prints = [];
    window.print = function () {
      var items = Array.prototype.slice.call(document.querySelectorAll('#list li'));
      var none = document.getElementById('none');
      window.__prints.push({
        body: document.body.className,
        names: items.filter(function (li) { return !li.hidden; }).map(function (li) { return li.querySelector('.name').textContent; }),
        none: none ? none.hidden : true,
        marked: document.querySelectorAll('.plotg.on').length,
        query: document.getElementById('q').value
      });
    };
  `);
  await page.goto(pathToFileURL(path).href);
  await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
}

const prints = (page: Page): Promise<{ body: string; names: string[]; none: boolean; marked: number; query: string }[]> => page.evaluate("window.__prints") as never;

test.describe("the family file", () => {
  test.use({ baseURL: CHURCH });

  test("B9 Print site map prints the whole list and the map, whatever the search box holds", async ({ page, browser }, testInfo) => {
    const path = await familyFile(page, testInfo);
    const visitor = await browser.newContext({ viewport: page.viewportSize() ?? { width: 360, height: 640 } });
    const file = await visitor.newPage();
    await openFile(file, path);
    await file.getByRole("listitem").filter({ hasText: "Mirel Quillmoss" }).getByRole("button", { name: "Show location" }).click();
    await file.getByLabel("Name or plot code", { exact: true }).fill("Zzyzx");
    await expect(file.getByText("No published burial matches that search.")).toBeVisible();

    await file.getByRole("button", { name: "Print site map" }).click();
    const [printed] = await prints(file);
    expect(printed?.body).toBe("all-tabs");
    expect([...(printed?.names ?? [])].sort()).toEqual(["Mirel Quillmoss", "Ysolde Fenwick"]);
    expect(printed?.none, "the print said no burial matches").toBe(true);
    expect(printed?.marked).toBeGreaterThan(0);

    // The search box is as the visitor left it.
    await expect(file.getByLabel("Name or plot code", { exact: true })).toHaveValue("Zzyzx");
    await expect(file.getByText("No published burial matches that search.")).toBeVisible();
    await visitor.close();
  });

  test("B10 Print this location waits for a location, and prints that burial whatever the search box holds", async ({ page, browser }, testInfo) => {
    const path = await familyFile(page, testInfo);
    const visitor = await browser.newContext({ viewport: page.viewportSize() ?? { width: 360, height: 640 } });
    const file = await visitor.newPage();
    await openFile(file, path);
    const button = file.getByRole("button", { name: "Print this location" });
    await expect(button).toBeDisabled();
    await expect(file.getByText("Show a location first.")).toBeVisible();
    await expect(button).toHaveAccessibleDescription("Show a location first.");

    await file.getByRole("listitem").filter({ hasText: "Mirel Quillmoss" }).getByRole("button", { name: "Show location" }).click();
    await expect(button).toBeEnabled();
    await expect(file.getByText("Show a location first.")).toBeHidden();
    await check(file, "family file with a location");

    await file.getByLabel("Name or plot code", { exact: true }).fill("Ysolde");
    await button.click();
    const [printed] = await prints(file);
    expect(printed?.body).toBe("only-selected");
    expect(printed?.names, "the print left out the burial of the chosen location").toContain("Mirel Quillmoss");
    await expect(file.getByLabel("Name or plot code", { exact: true })).toHaveValue("Ysolde");

    // Clearing takes the location away, and the button waits again.
    await file.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(button).toBeDisabled();
    await expect(file.getByText("Show a location first.")).toBeVisible();
    await visitor.close();
  });
});

test.describe("the availability map", () => {
  test.use({ baseURL: GARDEN });

  async function openAvailability(page: Page): Promise<void> {
    await openBeds(page);
    await page.getByRole("link", { name: "Make an availability map" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Availability map" })).toBeVisible();
  }

  test("B2 Download and Print wait for pending edits, as Preview does", async ({ page }) => {
    await openAvailability(page);
    await page.getByRole("button", { name: "Preview as a visitor", exact: true }).click();
    const download = page.getByRole("button", { name: "Download availability copy" });
    const print = page.getByRole("button", { name: "Print availability map" });
    await expect(download).toBeEnabled();
    await expect(print).toBeEnabled();

    await page.getByLabel("List this plot: B05 · Shady Row", { exact: true }).uncheck();
    await expect(page.getByText("Save public details first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview as a visitor", exact: true })).toBeDisabled();
    await expect(download).toBeDisabled();
    await expect(print).toBeDisabled();

    await page.getByRole("button", { name: "Save public details" }).click();
    await saved(page, "Public details saved.");
    await page.getByRole("button", { name: "Preview as a visitor", exact: true }).click();
    await expect(download).toBeEnabled();
    await expect(page.locator(".preview-frame")).not.toContainText("B05 · Shady Row · Will appear");
  });

  test("B7 Clear public details empties the form at once, and Save waits for a change", async ({ page }) => {
    await openAvailability(page);
    await expect(page.getByLabel("Public site name", { exact: true })).toHaveValue("Thimble Beds");
    await expect(page.getByLabel("List this plot: B03 · Sunny Row", { exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Clear public details" }).click();
    await saved(page, "Public details saved.");
    await expect(page.getByLabel("Public site name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Public gate name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Visitor instructions", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("List this plot: B03 · Sunny Row", { exact: true })).not.toBeChecked();
    await expect(page.getByLabel("List this plot: B05 · Shady Row", { exact: true })).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Save public details" })).toBeDisabled();
    await check(page, "availability map after clear");
  });
});

test.describe("offers and tenancies", () => {
  test.use({ baseURL: GARDEN });

  test("B3 an offer dated before the applicant joined is refused, with a plain message and nothing saved", async ({ page }) => {
    await openBeds(page);
    await page.getByRole("link", { name: "Waiting list" }).first().click();
    await page.getByLabel("Applicant", { exact: true }).fill("Late Joiner");
    await page.getByLabel("Joined date", { exact: true }).fill("2027-01-01");
    await page.getByRole("button", { name: "Add applicant", exact: true }).click();
    await saved(page, "Late Joiner added to the waiting list.");
    const before = (await storedEvents(page, siteIdOf(page))).length;

    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Make an offer" }).first().click();
    await page.getByLabel("Offer to", { exact: true }).selectOption({ label: "Position 3 · Late Joiner" });
    await page.getByLabel("Why skip this applicant? Tavi Bramblequill", { exact: true }).fill("Late applicant first");
    await page.getByLabel("Why skip this applicant? Olin Reedwhorl", { exact: true }).fill("Late applicant first");
    await page.getByRole("button", { name: "Review offer" }).click();
    await page.getByRole("button", { name: "Record offer" }).click();
    const message = page.getByText("This applicant joined on 2027-01-01. An offer cannot come before that.");
    await expect(message.first()).toBeVisible();
    expect((await storedEvents(page, siteIdOf(page))).length).toBe(before);
    await expect(page.getByText("Tell the applicant yourself. Saved on this device.")).toHaveCount(0);
    await check(page, "offer refused");
  });

  test("B4 a tenancy that starts later is listed as starting later, with no handover action", async ({ page }) => {
    await openBeds(page);
    await page.getByRole("link", { name: "Current tenancies" }).first().click();
    await page.getByRole("link", { name: "Hand over plot: B02" }).click();
    await page.getByLabel("Handover date", { exact: true }).fill("2026-05-01");
    await page.getByLabel("New holder", { exact: true }).fill("May Holder");
    await page.getByRole("button", { name: "Review handover" }).click();
    await page.getByRole("button", { name: "Confirm handover" }).click();
    await saved(page, "B02 handed over to May Holder. The old balance stays with Ada Stonecrop.");

    await page.getByRole("link", { name: "Current tenancies" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Current tenancies" })).toBeVisible();
    // Ada is the one current holder of B02, with the one handover action for it.
    await expect(page.getByRole("link", { name: "Hand over plot: B02" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "B02 · Ada Stonecrop" })).toHaveCount(1);
    // May Holder is listed under its own heading, with the day, and nothing to do yet.
    const later = page.getByRole("region", { name: "Starts later" });
    await expect(later).toHaveCount(1);
    await expect(later.getByRole("heading", { name: "B02 · May Holder" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "B02 · May Holder" })).toHaveCount(1);
    await expect(later).toContainText("Starts 2026-05-01");
    await expect(later.getByRole("link")).toHaveCount(0);
    await expect(later.getByRole("button")).toHaveCount(0);
    await expect(later.getByText("Ada Stonecrop")).toHaveCount(0);    await check(page, "tenancies with one starting later");
  });
});

test.describe("import and saves", () => {
  test.use({ baseURL: CHURCH });

  test("B5 a changed separator reads the file again", async ({ page }) => {
    await openFold(page);
    await registerRoute(page, siteIdOf(page), "add/import");
    await expect(page.getByRole("heading", { level: 1, name: "Import spreadsheet" })).toBeVisible();
    await page.getByLabel("Paste spreadsheet", { exact: true }).fill("Source ref,Name;Plot\nLF-90,Odo Test;Y01\n");
    await page.getByRole("button", { name: "Review import" }).click();
    await page.getByLabel("Comma", { exact: true }).check();
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByText("Column 1 · Source ref", { exact: true })).toBeVisible();
    await expect(page.getByText("Column 2 · Name;Plot", { exact: true })).toBeVisible();

    await page.getByLabel("Semicolon", { exact: true }).check();
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByText("Column 1 · Source ref,Name", { exact: true })).toBeVisible();
    await expect(page.getByText("Column 2 · Plot", { exact: true })).toBeVisible();
    await expect(page.getByText("Column 2 · Name;Plot", { exact: true })).toHaveCount(0);

    // And back again, the same way.
    await page.getByLabel("Comma", { exact: true }).check();
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByText("Column 2 · Name;Plot", { exact: true })).toBeVisible();
  });

  test("B5 a file is read again with the new separator too", async ({ page }) => {
    await openFold(page);
    await registerRoute(page, siteIdOf(page), "add/import");
    await page.locator("#csv-file").setInputFiles(upload("book.csv", "Source ref,Name;Plot\nLF-90,Odo Test;Y01\n"));
    await page.getByLabel("Comma", { exact: true }).check();
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByText("Column 2 · Name;Plot", { exact: true })).toBeVisible();
    await page.getByLabel("Semicolon", { exact: true }).check();
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByText("Column 2 · Plot", { exact: true })).toBeVisible();
  });
});

test.describe("saves from one tab and from another", () => {
  test.use({ baseURL: GARDEN });

  test("B12 a save from this tab never shows the other tab warning, and a save from another tab does", async ({ page }) => {
    // Watch the page for the warning at every change, not only when it settles.
    await page.addInitScript(`
      window.__sawOtherTab = false;
      new MutationObserver(function () {
        if (document.body && document.body.textContent.indexOf('changed in another tab') > -1) window.__sawOtherTab = true;
      }).observe(document, { subtree: true, childList: true, characterData: true });
    `);
    await openBeds(page);
    await page.getByRole("link", { name: "Waiting list" }).first().click();
    for (const name of ["Pim Cartwhistle", "Rue Hobbscroft"]) {
      await page.getByLabel("Applicant", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Add applicant", exact: true }).click();
      await saved(page, `${name} added to the waiting list.`);
      await page.waitForTimeout(300);
    }
    expect(await page.evaluate("window.__sawOtherTab"), "the warning showed for this tab's own save").toBe(false);
    await expect(page.getByText("This register changed in another tab.")).toHaveCount(0);

    // Another tab saves to the same register. This tab hears of it.
    const other = await page.context().newPage();
    await other.goto(page.url());
    await expect(other.getByRole("heading", { level: 1, name: "Waiting list" })).toBeVisible();
    await other.getByLabel("Applicant", { exact: true }).fill("Lark Tinderwick");
    await other.getByRole("button", { name: "Add applicant", exact: true }).click();
    await saved(other, "Lark Tinderwick added to the waiting list.");
    await expect(other.getByText("This register changed in another tab.")).toHaveCount(0);
    await expect(page.getByText("This register changed in another tab.").first()).toBeVisible();
    await other.close();
  });
});

test.describe("the guide", () => {
  test.use({ baseURL: MARKET });

  /** The label and the value of each field that step 2 of the walk through names, in the order it names them. */
  function stepTwo(): [string, string][] {
    const line = GUIDE.split("\n").find((l) => l.startsWith("2. Choose **Add your map**"));
    if (line === undefined) throw new Error("The guide has no step 2 that starts with Choose Add your map");
    const fields = line.slice(line.indexOf("fill in"));
    return [...fields.matchAll(/(?:^|[:,]\s*|\band\s+)([A-Z][A-Za-z ]*?) `([^`]*)`/g)].map((m) => [m[1] as string, m[2] as string]);
  }

  test("B13 step 2 of the guide, followed exactly, shows Apply layout", async ({ page }) => {
    const fields = stepTwo();
    expect(fields.map(([label]) => label)).toEqual(expect.arrayContaining(["Plot width", "Plot height"]));
    await startRegister(page, "Stall Row");
    await openMapEditor(page);
    for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Preview plots" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const apply = page.getByRole("button", { name: "Apply layout" });
    await expect(apply).toBeVisible();
    await apply.click();
    await expect(page.getByText("Map saved.")).toBeVisible();
    await expect(page.getByText("4 plots added.").or(page.getByText(/plots? added/))).toBeVisible();
  });
});

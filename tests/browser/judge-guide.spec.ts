// The two minute path of docs/judge-guide.md, run click for click on the assembled site, at 360 by 640 and at
// 1920 by 1080. If a word on a screen changes, this spec fails and the guide has to change with it. The places
// and people are invented. It needs `npm run build:apps` and `npm run assemble:site` first.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { SITE, trackFaults } from "../helpers/siteOrigin";

test.use({ baseURL: SITE });

test.describe("the path in the guide", () => {
  test("Churchyard Register: find Y07, make a family map, open it from disk, and download a review file", async ({ page, browser }, testInfo) => {
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Open Churchyard Register" }).click();
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();

    await page.getByLabel("Name or plot code", { exact: true }).fill("Quillmoss");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const card = page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07 · Yew Walk" });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "Show on map" }).click();
    await expect(page.getByText("Y07").first()).toBeVisible();

    await page.getByRole("link", { name: "Make a family map" }).click();
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    await expect(page.locator(".preview-frame")).toContainText("Mirel Quillmoss");
    const [family] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download family copy" }).click()]);
    const saved = testInfo.outputPath(family.suggestedFilename());
    await family.saveAs(saved);

    const reader = await browser.newContext({ offline: true });
    const file = await reader.newPage();
    await file.goto(pathToFileURL(saved).href);
    await file.getByLabel("Name or plot code").fill("Quillmoss");
    await file.getByRole("button", { name: "Find", exact: true }).click();
    await expect(file.locator("#list li:visible")).toContainText("Mirel Quillmoss");
    await file.getByRole("button", { name: "Show location" }).first().click();
    await expect(file.locator("#selcode")).toHaveText("Y07");
    await expect(file.getByRole("button", { name: "Print this location", exact: true })).toBeVisible();
    await reader.close();

    // Back in the register: Committee review, then Download review file.
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const [review] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download review file", exact: true }).click()]);
    expect(review.suggestedFilename()).toBe("committee-review-2026-04-20.json");
    await review.saveAs(testInfo.outputPath("church-review.json"));
    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });

  test("Allotment Register: offer B03, accept it, charge 36 pounds, take 12 pounds, 24 pounds is still due", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Open Allotment Register" }).click();
    await page.getByRole("button", { name: "Open Thimble Beds" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();

    await page.getByRole("link", { name: "Make an offer" }).first().click();
    await page.getByRole("button", { name: "Review offer" }).click();
    await page.getByRole("button", { name: "Record offer" }).click();
    await expect(page.getByText("B03 reserved for Tavi Bramblequill.").first()).toBeVisible();
    await page.getByRole("button", { name: "Accept offer" }).click();
    await expect(page.getByText("Offer accepted. Tavi Bramblequill holds B03.").first()).toBeVisible();
    await page.getByRole("link", { name: "Back to register" }).first().click();

    await page.getByRole("link", { name: "Season fees" }).first().click();
    await page.getByRole("link", { name: "New season", exact: true }).click();
    await page.getByLabel("Season name", { exact: true }).fill("Season 2026");
    await page.getByLabel("Start date", { exact: true }).fill("2026-04-01");
    await page.getByLabel("End date", { exact: true }).fill("2027-04-01");
    await page.getByLabel("Due date", { exact: true }).fill("2026-06-30");
    await page.getByLabel("Standard fee", { exact: true }).fill("36.00");
    await page.getByRole("button", { name: "New season", exact: true }).click();
    await page.getByLabel("Select tenancies: B03 · Tavi Bramblequill", { exact: true }).check();
    await page.getByRole("button", { name: "Preview charges" }).click();
    await expect(page.getByRole("region", { name: "Charges to apply" })).toContainText("GBP 36.00");
    await page.getByRole("button", { name: "Apply charges" }).click();
    await expect(page.getByText("Charges applied. 1 charged.").first()).toBeVisible();

    await page.getByRole("link", { name: "Season fees" }).first().click();
    const charge = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Season 2026 · B03 · Tavi Bramblequill" }) });
    await charge.getByLabel("Amount received", { exact: true }).fill("12.00");
    await charge.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(charge.getByText("GBP 12.00 recorded. GBP 24.00 still due.")).toBeVisible();
    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });

  test("Review Desk preview: open a review file from the Churchyard Register, mark an item, and download a return slip", async ({ page }, testInfo) => {
    // Make a review file in the register, the way the first test does.
    await page.goto("/churchyard/");
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const [review] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download review file", exact: true }).click()]);
    const reviewPath = testInfo.outputPath("review.json");
    await review.saveAs(reviewPath);

    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Open Review Desk preview" }).click();
    await expect(page.getByText("Bring the checks from your registers to one meeting.")).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(reviewPath);
    await page.getByRole("button", { name: "Add register", exact: true }).click();
    await expect(page.getByText(/open checks?/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Open the first item" }).click();
    await page.getByRole("button", { name: "Mark checked" }).click();
    await expect(page.getByText("Decision saved on this device.")).toBeVisible();
    await page.getByRole("button", { name: "Return slips" }).click();
    const [slip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download return slip for Site 1" }).click()]);
    expect(slip.suggestedFilename()).toMatch(/^committee-return-\d{4}-\d{2}-\d{2}\.json$/);
    const text = readFileSync(await slip.path(), "utf8");
    // The slip holds no name and no text.
    expect(text).not.toMatch(/Quillmoss|Pellwick|Fennimore|Ashgrove/);
    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
    // The Desk fades its screens in. Measure when nothing is moving.
    await page.waitForFunction(() => document.getAnimations().length === 0);
    const violations = await measureLayout(page);
    expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
  });
});

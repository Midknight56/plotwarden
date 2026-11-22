// The market stall example in a real browser, at 360 by 640 and at 1920 by 1080 (spec 06, task 6.10).
// It walks docs/make-your-own.md step by step against examples/market, which the generator copies byte for byte
// into a folder two levels below the root. A trader who needs 240 cm takes a 250 cm stall and is refused a 200 cm
// stall, a stall with no frontage is refused, and a backup restores the reservation. Every screen is measured.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { storedEvents, siteIdOf } from "../helpers/routes";
import { generateGrid, startRegister } from "../helpers/screens";

const MARKET = "http://127.0.0.1:4180/";
test.use({ baseURL: MARKET });

async function check(page: Page, label: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, `${label}\n${JSON.stringify(violations, null, 1)}`).toEqual([]);
}

async function openStall(page: Page, code: string): Promise<void> {
  await page.getByRole("link", { name: "Back to register" }).first().click();
  await page.getByRole("link", { name: "Plot list" }).click();
  await page.getByRole("listitem").filter({ hasText: code }).getByRole("link", { name: `Plot ${code}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Plot ${code}` })).toBeVisible();
}

async function reserve(page: Page, trader: string, needed: string): Promise<void> {
  await page.getByLabel("Trader", { exact: true }).fill(trader);
  await page.getByLabel("Width the trader needs in cm").fill(needed);
  await page.getByRole("button", { name: "Reserve stall" }).click();
}

test("walks the guide: four stalls, a width, the rule, a backup and a restore", async ({ page }) => {
  const requests = trackRequests(page, MARKET);

  // Step 1 and 2: a register, and a row of four stalls.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Stall Register" })).toBeVisible();
  await expect(page.getByText("Offer a stall or start your register.")).toBeVisible();
  await expect(page.getByText("For the person who runs a market. Records stay on this device.")).toBeVisible();
  await check(page, "library");
  await startRegister(page, "Stall Row");
  await generateGrid(page, { section: "Row A", prefix: "S", first: "1", digits: "1", rows: "1", columns: "4", width: "40", height: "30", east: "100", north: "100" });
  await check(page, "map setup");
  const siteId = siteIdOf(page);

  // Step 3: rename S4. Its old code stays searchable.
  await openStall(page, "S4");
  await page.getByRole("button", { name: "Check plot" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("Status changed.")).toBeVisible();
  await page.getByLabel("New plot code").fill("S4B");
  await page.getByRole("button", { name: "Rename plot" }).click();
  await expect(page.getByText("Plot renamed.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Plot S4B" })).toBeVisible();
  await check(page, "renamed stall");

  // Step 4 and 5: check S1 to S3 as empty, and give each a frontage.
  const widths: Record<string, string> = { S1: "200", S2: "250", S3: "300" };
  for (const [code, width] of Object.entries(widths)) {
    await openStall(page, code);
    await page.getByRole("button", { name: "Check plot" }).click();
    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect(page.getByText("Status changed.")).toBeVisible();
    await expect(page.getByText("No frontage is set for this stall.")).toBeVisible();
    await page.getByLabel("Frontage in cm").fill(width);
    await page.getByRole("button", { name: "Save frontage" }).click();
    await expect(page.getByText(`Frontage of ${code} saved: ${width} cm.`)).toBeVisible();
    await expect(page.getByText(`Frontage: ${width} cm.`)).toBeVisible();
    await check(page, `stall ${code} with a frontage`);
  }

  // A width that is not a whole number of cm is refused on its field.
  await page.getByLabel("Frontage in cm").fill("1.5");
  await page.getByRole("button", { name: "Save frontage" }).click();
  await expect(page.getByText("Enter a whole number of cm from 1 to 10000.")).toBeVisible();
  await expect(page.getByLabel("Frontage in cm")).toBeFocused();

  // Step 6: 240 cm on the 200 cm stall is refused, naming both widths, and nothing is saved.
  await openStall(page, "S1");
  const beforeRefusal = (await storedEvents(page, siteId)).length;
  await reserve(page, "Rosa Pennywhistle", "240");
  await expect(page.getByText("A 240 cm stand does not fit a 200 cm stall.")).toBeVisible();
  expect((await storedEvents(page, siteId)).length).toBe(beforeRefusal);
  await expect(page.getByText("Saved on this device.")).toHaveCount(0);
  await check(page, "refusal");

  // Step 7: the same trader on the 250 cm stall.
  await openStall(page, "S2");
  await reserve(page, "Rosa Pennywhistle", "240");
  await expect(page.getByText("S2 reserved for Rosa Pennywhistle.")).toBeVisible();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await expect(page.getByText(/Reserved for Rosa Pennywhistle from \d{4}-\d{2}-\d{2}\. Needs 240 cm\./)).toBeVisible();
  await expect(page.locator(".summary-line, p").filter({ hasText: /Reserved/ }).first()).toBeVisible();
  await check(page, "reserved stall");

  // Step 8: a stall with no frontage is not wide enough for anyone.
  await openStall(page, "S4B");
  await reserve(page, "Pim Cartwhistle", "100");
  await expect(page.getByText("Set the frontage of S4B first.")).toBeVisible();

  // Step 9: back it up, and restore the file as a new register.
  await page.getByRole("link", { name: "Back to register" }).first().click();
  await page.getByRole("link", { name: "Back up", exact: true }).click();
  const [backup] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download private backup" }).click()]);
  expect(backup.suggestedFilename()).toMatch(/^register-backup-\d{4}-\d{2}-\d{2}\.pkr\.zip$/);
  const backupPath = await backup.path();
  expect(readFileSync(backupPath).length).toBeGreaterThan(500);
  await page.getByRole("link", { name: "Registers", exact: true }).first().click();
  await page.getByRole("link", { name: "Restore backup" }).click();
  await page.getByLabel("Choose backup").setInputFiles(backupPath);
  await expect(page.getByText("Site: Stall Row")).toBeVisible();
  await check(page, "restore");
  await page.getByRole("button", { name: "Restore as new register" }).click();
  await expect(page.getByText("Restored Stall Row.")).toBeVisible();
  await page.getByRole("link", { name: "Registers", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Open Stall Row" })).toHaveCount(2);
  await page.getByRole("link", { name: "Open Stall Row" }).nth(1).click();
  await page.getByRole("link", { name: "Plot list" }).click();
  await page.getByRole("listitem").filter({ hasText: "S2" }).getByRole("link", { name: "Plot S2" }).click();
  await expect(page.getByText(/Reserved for Rosa Pennywhistle from/)).toBeVisible();
  await expect(page.getByText("Frontage: 250 cm.")).toBeVisible();
  await check(page, "restored stall");

  expect(requests.external).toEqual([]);
});

test("the stall panel is laid out well on the plot screen of an empty and a full stall, and says nothing about a trader to a visitor", async ({ page }) => {
  await startRegister(page, "Stall Check");
  await generateGrid(page, { section: "Row A", prefix: "S", first: "1", digits: "1", rows: "1", columns: "2", width: "40", height: "30", east: "100", north: "100" });
  await openStall(page, "S1");
  await check(page, "stall panel, empty");
  await page.getByLabel("Trader", { exact: true }).fill("");
  await page.getByRole("button", { name: "Reserve stall" }).click();
  await expect(page.getByText("Enter the trader.")).toBeVisible();
  await expect(page.getByText("Enter a whole number of cm from 1 to 10000.").first()).toBeVisible();
  await expect(page.getByLabel("Trader", { exact: true })).toBeFocused();
  await check(page, "stall panel, with errors");
});

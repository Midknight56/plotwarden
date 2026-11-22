// The two minute path of docs/judge-guide.md, run click for click on the assembled site, at 360 by 640 and at
// 1920 by 1080. If a word on a screen changes, this spec fails and the guide has to change with it. The places
// and people are invented. It needs `npm run build:apps` and `npm run assemble:site` first.
//
// The two return tests (spec 05, X12) go one step further. They take the review file from a register, add it in the
// Desk, mark it checked there, download the slip the Desk makes, and open that slip in the register. Every word they
// click in section 3 of the guide is looked up in the guide, in order, so a step that is missing from the guide fails.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { readExchangeFile } from "../../template/src/exchange/schema";
import type { ReviewPacket } from "../../template/src/exchange/schema";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { SITE, expectLayout, saveProof, trackFaults } from "../helpers/siteOrigin";

test.use({ baseURL: SITE });

const GUIDE = readFileSync("docs/judge-guide.md", "utf8");

/**
 * One part of the guide, from `from` to `to` (or to the next level two heading). The returned function takes the
 * words a step clicks or reads, fails when the guide does not say them after the words before, and gives them back.
 */
function guidePart(from: string, to?: string): (words: string) => string {
  const start = GUIDE.indexOf(from);
  expect(start, `The guide has no part that starts "${from}".`).toBeGreaterThanOrEqual(0);
  const stop = GUIDE.indexOf(to ?? "\n## ", start + from.length);
  const part = GUIDE.slice(start, stop < 0 ? GUIDE.length : stop);
  let at = 0;
  let last = from;
  return (words: string): string => {
    const found = part.indexOf(words, at);
    expect(found, `The guide says no "${words}" after "${last}" in the part "${from}".`).toBeGreaterThanOrEqual(0);
    at = found + words.length;
    last = words;
    return words;
  };
}

/** Words of a step that the guide already carries in an earlier section. */
const plain = (words: string): string => words;

/** Section 2 of the guide: offer B03, accept it, charge 36 pounds, take 12 pounds. */
async function runAllotmentPath(page: Page): Promise<void> {
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
}

/** In a register home: Committee review, Preview review file, Download review file. Gives the saved file and what it holds. */
async function downloadReviewFile(page: Page, testInfo: TestInfo, say: (words: string) => string, saveAs: string): Promise<{ path: string; packet: ReviewPacket }> {
  await page.getByRole("link", { name: say("Committee review"), exact: true }).click();
  await page.getByRole("button", { name: say("Preview review file"), exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: say("Download review file"), exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("committee-review-2026-04-20.json");
  const path = testInfo.outputPath(saveAs);
  await file.saveAs(path);
  const read = readExchangeFile(new Uint8Array(readFileSync(path)));
  if (!read.ok || read.form !== "review") throw new Error(`the download is not a review file: ${JSON.stringify(read)}`);
  return { path, packet: read.packet };
}

/** From the hub: Open Review Desk preview, Choose file, Add register. */
async function addToDesk(page: Page, say: (words: string) => string, reviewPath: string, added: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: say("Open Review Desk preview") }).click();
  await expect(page.getByText("Bring the checks from your registers to one meeting.")).toBeVisible();
  say("Choose file");
  await page.locator('input[type="file"]').first().setInputFiles(reviewPath);
  await page.getByRole("button", { name: say("Add register"), exact: true }).click();
  await expect(page.getByText(added, { exact: true })).toBeVisible();
}

/** Return slips, then the download for one site. Gives the saved slip, read back as the Desk wrote it. */
async function downloadDeskSlip(page: Page, testInfo: TestInfo, say: (words: string) => string, site: string) {
  await page.getByRole("button", { name: say("Return slips"), exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: say(`Download return slip for ${site}`), exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("committee-return-2026-04-21.json");
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const text = readFileSync(path, "utf8");
  const body = JSON.parse(text) as { format: string; siteKey: string; lineageId: string; decisions: { issueKey: string; disposition: string; reviewedOn: string }[] };
  return { path, text, body };
}

/** In a register home: Committee review, then Open return slip with the Desk's file. */
async function openDeskSlip(page: Page, say: (words: string) => string, slipPath: string): Promise<void> {
  await page.getByRole("link", { name: say("Committee review"), exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
  await page.getByLabel(say("Open return slip"), { exact: true }).setInputFiles(slipPath);
  await expect(page.getByRole("heading", { level: 2, name: "Review returned checks" })).toBeVisible();
}

const returned = (page: Page) => page.getByRole("region", { name: "Review returned checks" });

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
    await runAllotmentPath(page);
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
    const [slip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download return slip for / }).click()]);
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

  test("Lantern Fold: a slip made by the Desk reads Ready to check, and each row opens the record that raised it", async ({ page }, testInfo) => {
    const say = guidePart("## 3. Review Desk preview", "### Thimble Beds");
    await page.clock.setFixedTime(new Date("2026-04-21T10:00:00Z"));
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);

    // The review file, as in section 1.
    await page.goto("/");
    await page.getByRole("link", { name: "Open Churchyard Register" }).click();
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
    const made = await downloadReviewFile(page, testInfo, plain, "lantern-review.json");
    expect(made.packet.issues.map((i) => i.rule).sort()).toEqual(["placement_missing", "reading_unclear"]);

    // The Desk: add the file, mark both checks, download the slip.
    await addToDesk(page, say, made.path, "Added Churchyard · Site 1. 2 open checks.");
    await page.getByRole("button", { name: say("Open the first item"), exact: true }).click();
    await page.getByRole("button", { name: say("Mark checked"), exact: true }).click();
    await expect(page.getByText("Decision saved on this device.")).toBeVisible();
    await page.getByRole("button", { name: say("Back to meeting list"), exact: true }).click();
    const second = page.getByRole("listitem").filter({ hasText: "Churchyard · Site 1 · Record 2 · Uncertain reading" });
    await second.getByRole("button", { name: say("Open item") }).click();
    await page.getByRole("button", { name: say("Mark checked"), exact: true }).click();
    await expect(page.getByText("Decision saved on this device.")).toBeVisible();
    const slip = await downloadDeskSlip(page, testInfo, say, "Churchyard · Site 1");

    // The file is the Desk's own: this register's keys, two checked decisions, no name and no text.
    expect(Object.keys(slip.body).sort()).toEqual(["decisions", "format", "lineageId", "packetAsOf", "packetRevision", "siteKey"]);
    expect(slip.body.format).toBe("plot.slip.v1");
    expect(slip.body.siteKey).toBe(made.packet.siteKey);
    expect(slip.body.lineageId).toBe(made.packet.lineageId);
    expect(slip.body.decisions.map((d) => d.issueKey).sort()).toEqual(made.packet.issues.map((i) => i.issueKey).sort());
    expect(slip.body.decisions.map((d) => [d.disposition, d.reviewedOn])).toEqual([
      ["checked", "2026-04-21"],
      ["checked", "2026-04-21"],
    ]);
    expect(slip.text).not.toMatch(/Quillmoss|Pellwick|Fennimore|Ashgrove|Lantern/);

    // Back in the register: open the slip.
    await page.goto("/");
    await page.getByRole("link", { name: say("Open Churchyard Register") }).click();
    await page.getByRole("button", { name: say("Open Lantern Fold") }).click();
    await openDeskSlip(page, say, slip.path);
    const placement = returned(page).getByRole("listitem").filter({ hasText: "Record 1 · Check the location" });
    const reading = returned(page).getByRole("listitem").filter({ hasText: "Record 2 · Read the stone again" });
    const ready = say("Ready to check");
    for (const row of [placement, reading]) {
      await expect(row).toHaveCount(1);
      await expect(row.getByText(ready, { exact: true })).toBeVisible();
    }
    await expectLayout(page);
    await saveProof(page, "desk-slip-churchyard");

    // The unplaced burial opens the list of burials with no plot.
    await placement.getByRole("link", { name: say("Open matching record"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burials with no plot" })).toBeVisible();

    // The unclear reading opens its own burial record.
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    await page.getByLabel("Open return slip", { exact: true }).setInputFiles(slip.path);
    await returned(page).getByRole("listitem").filter({ hasText: "Record 2 · Read the stone again" }).getByRole("link", { name: say("Open matching record"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await expect(page.getByText("Marked for another reading.")).toBeVisible();

    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });

  test("Thimble Beds: a slip made by the Desk reads Ready to check, and the late fee opens Season fees", async ({ page }, testInfo) => {
    const say = guidePart("### Thimble Beds");
    await page.clock.setFixedTime(new Date("2026-04-21T10:00:00Z"));
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);

    // Section 2 first, so the register is as a guide reader leaves it.
    await runAllotmentPath(page);

    // The review file.
    await page.goto("/");
    await page.getByRole("link", { name: say("Open Allotment Register") }).click();
    await page.getByRole("button", { name: say("Open Thimble Beds") }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();
    const made = await downloadReviewFile(page, testInfo, say, "thimble-review.json");
    expect(made.packet.issues.map((i) => [i.label, i.rule])).toEqual([["Record 1", "fee_late"]]);

    // The Desk: add the file, mark the check, download the slip.
    await addToDesk(page, say, made.path, "Added Allotments · Site 1. 1 open check.");
    await page.getByRole("button", { name: say("Meeting list"), exact: true }).click();
    const fee = page.getByRole("listitem").filter({ hasText: "Allotments · Site 1 · Record 1 · Due fee" });
    await fee.getByRole("button", { name: say("Open item") }).click();
    await page.getByRole("button", { name: say("Mark checked"), exact: true }).click();
    await expect(page.getByText("Decision saved on this device.")).toBeVisible();
    const slip = await downloadDeskSlip(page, testInfo, say, "Allotments · Site 1");
    expect(slip.body.siteKey).toBe(made.packet.siteKey);
    expect(slip.body.lineageId).toBe(made.packet.lineageId);
    expect(slip.body.decisions.map((d) => [d.issueKey, d.disposition, d.reviewedOn])).toEqual([[made.packet.issues[0]?.issueKey, "checked", "2026-04-21"]]);
    expect(slip.text).not.toMatch(/Stonecrop|Bramblequill|Thimble|B02|B03/);

    // Back in the register: open the slip.
    await page.goto("/");
    await page.getByRole("link", { name: say("Open Allotment Register") }).click();
    await page.getByRole("button", { name: say("Open Thimble Beds") }).click();
    await openDeskSlip(page, say, slip.path);
    const row = returned(page).getByRole("listitem").filter({ hasText: "Record 1 · Check the payment" });
    await expect(row).toHaveCount(1);
    await expect(row.getByText(say("Ready to check"), { exact: true })).toBeVisible();
    await expectLayout(page);
    await saveProof(page, "desk-slip-allotment");

    await row.getByRole("link", { name: say("Open matching record"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: say("Season fees") })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Season 2025 · B02 · Ada Stonecrop" })).toBeVisible();
    // The charge that raised the check is marked, and it is in view on the phone as well.
    await expect(page.locator('li.card[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('li.card[aria-current="true"]')).toContainText("Season 2025 · B02 · Ada Stonecrop");
    await expect(page.locator('li.card[aria-current="true"]')).toBeInViewport();
    await expectLayout(page);

    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });
});

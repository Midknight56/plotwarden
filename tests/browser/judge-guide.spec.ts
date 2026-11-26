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
import { fillGrid } from "../helpers/screens";
import { SITE, expectLayout, hubCard, saveProof, trackFaults, tryPracticeFromHub } from "../helpers/siteOrigin";

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
  await tryPracticeFromHub(page, "allotment");
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
  test("the hub says what the guide says: the job line, two buttons on each register card, and the Desk link", async ({ page }) => {
    const say = guidePart("## Open the site", "## 1. Churchyard Register");
    await page.goto("/");
    await expect(page.getByText(say("Find a burial. Offer a garden plot. Keep the history of both."), { exact: true })).toBeVisible();
    const tryWords = say("Try the practice register");
    const startWords = say("Start your own");
    for (const which of ["churchyard", "allotment"] as const) {
      await expect(hubCard(page, which).getByRole("link", { name: tryWords })).toBeVisible();
      await expect(hubCard(page, which).getByRole("link", { name: startWords })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: say("Open Review Desk preview") })).toBeVisible();
    await expect(page.getByRole("link", { name: say("See the family map") })).toBeVisible();
    await expect(page.getByRole("link", { name: say("See the plot seeker map") })).toBeVisible();
  });

  test("Churchyard Register: find Y07, make a family map, open it from disk, and download a review file", async ({ page, browser }, testInfo) => {
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    await tryPracticeFromHub(page, "churchyard");
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();

    await page.getByRole("button", { name: "Try Quillmoss", exact: true }).click();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Quillmoss");
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
    await tryPracticeFromHub(page, "churchyard");
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
    await hubCard(page, "churchyard").getByRole("link", { name: say("Try the practice register") }).click();
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

    // The unclear reading opens its own burial record. Back brings the same slip back, so the file is not picked again.
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    await expect(returned(page)).toBeVisible();
    for (const kept of [placement, reading]) {
      await expect(kept).toHaveCount(1);
      await expect(kept.getByText(ready, { exact: true })).toBeVisible();
    }
    await reading.getByRole("link", { name: say("Open matching record"), exact: true }).click();
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
    await hubCard(page, "allotment").getByRole("link", { name: say("Try the practice register") }).click();
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
    await hubCard(page, "allotment").getByRole("link", { name: say("Try the practice register") }).click();
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

  test("Churchyard Register: the 200 record book, from the practice book to a name on the map", async ({ page }) => {
    test.setTimeout(240_000);
    const say = guidePart("### The 200 record book");
    /** A label and the value typed into it, both looked up in the guide, in order. */
    const typed = (label: string, value: string): string => {
      say(label);
      return say(`\`${value}\``).slice(1, -1);
    };
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    const counts = page.getByRole("list", { name: "Review import" });
    const goTo = async (...names: string[]): Promise<void> => {
      for (const name of names) await page.getByRole("link", { name: say(name), exact: true }).first().click();
    };

    // 1. Start a register.
    await page.goto("/");
    await hubCard(page, "churchyard").getByRole("link", { name: say("Start your own") }).click();
    await page.getByLabel("Site name").fill(typed("Site name", "Paper Book"));
    await page.getByLabel("Local time zone").selectOption(typed("Local time zone", "Europe/London"));
    await page.getByRole("button", { name: say("Create register") }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Paper Book" })).toBeVisible();

    // 2. The map: 200 plots.
    await page.getByRole("link", { name: say("Add your map") }).click();
    await fillGrid(page, {
      section: typed("Section name", "Paper"),
      prefix: typed("Prefix", "C"),
      first: typed("First number", "1"),
      digits: typed("Digits", "3"),
      rows: typed("Rows", "10"),
      columns: typed("Columns", "20"),
      width: typed("Plot width", "40"),
      height: typed("Plot height", "30"),
      east: typed("Start east", "100"),
      north: typed("Start north", "100"),
    });
    await page.getByRole("button", { name: say("Preview plots") }).click();
    await page.getByRole("button", { name: say("Apply layout") }).click();
    await expect(page.getByText(say("Map saved."))).toBeVisible();
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Plot list" }).click();
    await expect(page.getByText("200 plots", { exact: true })).toBeVisible();

    // 3. The practice book.
    await goTo("Back to register", "Add records", "Import spreadsheet");
    const [practice] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: say("Download a practice book") }).click()]);
    expect(practice.suggestedFilename()).toBe(say("practice-book.csv"));
    const book = await practice.path();
    expect(readFileSync(book, "utf8")).toBe(readFileSync("tests/fixtures/paper-200-bad.csv", "utf8"));
    expect(readFileSync(book, "utf8").split("\n")[117]).toMatch(/^,/);
    say("Download column guide");
    await expect(page.getByRole("button", { name: "Download column guide" })).toBeVisible();

    // 4. Choose the file, see the match, review. Nothing is written.
    await page.getByLabel(say("Choose CSV")).setInputFiles(book);
    say("Match columns");
    await expect(page.getByRole("group", { name: /Column 2/ }).getByLabel("Register field").locator("option:checked")).toHaveText(say("Recorded name"));
    await page.getByRole("button", { name: say("Review import") }).click();
    await expect(counts).toContainText(say("Errors 1"));
    await expect(counts).toContainText(say("Ready 197"));
    await expect(counts).toContainText(say("Location to confirm 2"));
    await expect(page.getByRole("button", { name: say("Import 199 records") })).toBeDisabled();
    await expect(page.getByRole("listitem").filter({ hasText: say("Row 117") })).toContainText(say("Check Source ref in row 117. Enter a value."));
    await expectLayout(page);
    await saveProof(page, "guide-paper-book-review");

    // 5. Fix row 117 and import 200.
    const fix = async (): Promise<void> => {
      await page.getByRole("listitem").filter({ hasText: "Row 117" }).getByRole("button", { name: "Fix row" }).click();
      await page.getByRole("dialog", { name: "Fix row 117" }).getByLabel("Source ref").fill("R117");
      await page.getByRole("dialog", { name: "Fix row 117" }).getByRole("button", { name: "Save row" }).click();
      await expect(page.getByRole("dialog", { name: "Fix row 117" })).toBeHidden();
    };
    say("Fix row");
    await page.getByRole("listitem").filter({ hasText: "Row 117" }).getByRole("button", { name: "Fix row" }).click();
    await page.getByRole("dialog", { name: "Fix row 117" }).getByLabel(say("Source ref")).fill(say("`R117`").slice(1, -1));
    await page.getByRole("dialog", { name: "Fix row 117" }).getByRole("button", { name: say("Save row") }).click();
    await expect(page.getByRole("dialog", { name: "Fix row 117" })).toBeHidden();
    await page.getByRole("button", { name: say("Import 200 records") }).click();
    await expect(page.getByText(say("200 saved · 2 still need a plot."))).toBeVisible();

    // 6. The same file again adds nothing.
    await goTo("Back to register", "Add records", "Import spreadsheet");
    await page.getByLabel("Choose CSV").setInputFiles(book);
    await page.getByRole("button", { name: "Review import" }).click();
    // Row 117 has no source ref in this file either, so it is the one row that is not already there.
    await expect(counts).toContainText("Already in register 199");
    await expect(counts).toContainText("Errors 1");
    await fix();
    await expect(counts).toContainText(say("Already in register 200"));
    await expect(page.getByText(say("There is nothing new to import."))).toBeVisible();

    // 7. Place R199 from the list of burials with no plot.
    await page.getByRole("button", { name: say("Cancel import") }).click();
    await goTo("Back to register", "Unplaced burials · 2");
    const card = page.getByRole("listitem").filter({ hasText: "Sorrel Larkspur" });
    await card.getByLabel("Section", { exact: true }).selectOption({ label: typed("Section", "Paper") });
    await card.getByLabel("Plot", { exact: true }).selectOption({ label: typed("Plot", "C199 · Paper") });
    await card.getByRole("button", { name: say("Confirm placement") }).click();
    await expect(page.getByText(say("Sorrel Larkspur placed at C199."))).toBeVisible();

    // 8. The link counts one now, and a name from the book shows its plot on the map.
    await goTo("Back to register");
    await expect(page.getByRole("link", { name: say("Unplaced burials · 1") })).toBeVisible();
    await page.getByLabel("Name or plot code", { exact: true }).fill(typed("Name or plot code", "Quill Fernhollow"));
    await page.getByRole("button", { name: say("Search") }).click();
    await expect(page.getByRole("listitem").filter({ hasText: say("Quill Fernhollow · C117 · Paper") })).toBeVisible();
    await expect(page.locator(".summary-line")).toContainText(say("C117 · Paper · Taken"));
    await expect(page.getByRole("region", { name: "Site map" })).toContainText("C117");

    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });
});

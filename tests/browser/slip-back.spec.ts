// The opened return slip stays for one visit to its own register (spec 05, task 5.18, X14), in a real browser, at
// 360 by 640 and at 1920 by 1080. A keeper opens a slip once, chooses "Open matching record" on a row, goes back by
// the browser Back button or by the register's own links, and sees the same slip with every row, without choosing
// the file again. The slip never shows in another register and never survives leaving the register. Each row is
// worked out again when the slip shows, so a record edited in between shows its new state. The slips here are made
// by the shared exchange module from the downloaded file.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readExchangeFile } from "../../template/src/exchange/schema";
import type { ReviewPacket } from "../../template/src/exchange/schema";
import { buildSlip, encodeSlip } from "../../template/src/exchange/slip";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { readFileSync } from "node:fs";

const CHURCH = "http://127.0.0.1:4176/";
const GARDEN = "http://127.0.0.1:4178/";
const MIDDLE_DOT = "\u00b7";

const A = (n: number): string => `51b00000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

interface Pick {
  n: number;
  rule: string;
  disposition: "checked" | "needs_keeper";
}

/** A return slip for a downloaded packet, as an upload. */
function slipFile(packet: ReviewPacket, picks: Pick[]) {
  const built = buildSlip({
    siteKey: packet.siteKey,
    lineageId: packet.lineageId,
    packetRevision: packet.revision,
    packetAsOf: packet.asOf,
    decisions: picks.map((p) => ({
      actionId: A(p.n),
      issueKey: packet.issues.find((i) => i.rule === p.rule)?.issueKey as string,
      factVersion: 1,
      disposition: p.disposition,
      reviewedOn: "2026-04-21",
    })),
  });
  if (!built.ok) throw new Error(`slip refused: ${JSON.stringify(built.fields)}`);
  const encoded = encodeSlip(built.slip);
  if (!encoded.ok) throw new Error("slip too big");
  return { name: "committee-return-2026-04-21.json", mimeType: "application/json", buffer: Buffer.from(encoded.text, "utf8") };
}

type SlipUpload = ReturnType<typeof slipFile>;

const openSlip = (page: Page, file: SlipUpload) => page.getByLabel("Open return slip", { exact: true }).setInputFiles(file);

/** Press "Download review file" and read what the browser was given. */
async function download(page: Page): Promise<ReviewPacket> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download review file", exact: true }).click()]);
  const text = readFileSync(await file.path(), "utf8");
  const read = readExchangeFile(new TextEncoder().encode(text));
  if (!read.ok || read.form !== "review") throw new Error(`the download is not a review file: ${JSON.stringify(read)}`);
  return read.packet;
}

const returned = (page: Page) => page.getByRole("region", { name: "Review returned checks" });
const row = (page: Page, words: string) => returned(page).getByRole("listitem").filter({ hasText: words });

/** The Committee review screen is open, with its heading in focus after a move to it. */
async function expectReviewScreen(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
}

async function expectLayout(page: Page): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
}

/** The revision of every register on this device, read straight from the browser's database. */
async function revisions(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("plotwarden");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const sites = await new Promise<{ revision: number }[]>((resolve, reject) => {
      const request = db.transaction("sites").objectStore("sites").getAll();
      request.onsuccess = () => resolve(request.result as { revision: number }[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return sites.map((s) => s.revision).sort((a, b) => a - b);
  });
}

/** Everything the page keeps on the device, as text: both web stores and every table of the database. */
async function everythingStored(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("plotwarden");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const parts: string[] = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    for (const name of Array.from(db.objectStoreNames)) {
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      parts.push(JSON.stringify(rows, (_key, value: unknown) => (value instanceof Blob ? `blob:${value.size}` : value)));
    }
    db.close();
    parts.push(...(await caches.keys()));
    return parts.join("\n");
  });
}

/** Move inside the open page, as a link does, with no reload. The page keeps what it holds in memory. */
async function goInPage(page: Page, hash: string): Promise<void> {
  await page.evaluate((to) => {
    window.location.hash = to;
  }, hash);
}

test.describe("Lantern Fold", () => {
  test.use({ baseURL: CHURCH });

  /** Open the practice register from the library, export its review file, and give the slip with both rows. */
  async function openFoldWithSlip(page: Page, picks?: Pick[]): Promise<{ packet: ReviewPacket; slip: SlipUpload }> {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expectReviewScreen(page);
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const packet = await download(page);
    const slip = slipFile(
      packet,
      picks ?? [
        { n: 1, rule: "placement_missing", disposition: "checked" },
        { n: 2, rule: "reading_unclear", disposition: "needs_keeper" },
      ],
    );
    await openSlip(page, slip);
    await expect(page.getByRole("heading", { level: 2, name: "Review returned checks" })).toBeFocused();
    return { packet, slip };
  }

  const PLACEMENT = `Record 1 ${MIDDLE_DOT} Check the location`;
  const READING = `Record 2 ${MIDDLE_DOT} Read the stone again`;

  test("shows the same slip with every row after Open matching record and Back, with no second file pick", async ({ page }) => {
    test.setTimeout(180_000);
    const requests = trackRequests(page, CHURCH);
    const { slip } = await openFoldWithSlip(page);
    const afterExport = await revisions(page);

    // The first row opens its list. Browser Back brings the slip back, with both rows, and no file is chosen.
    await row(page, PLACEMENT).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burials with no plot" })).toBeVisible();
    await page.goBack();
    await expectReviewScreen(page);
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeFocused();
    await expect(returned(page)).toBeVisible();
    for (const words of [PLACEMENT, READING]) {
      await expect(row(page, words)).toHaveCount(1);
      await expect(row(page, words).getByText("Ready to check", { exact: true })).toBeVisible();
    }
    await expect(row(page, PLACEMENT)).toContainText("Checked on 2026-04-21");
    await expect(row(page, READING)).toContainText("Needs keeper on 2026-04-21");
    await expect(page.getByRole("button", { name: "Record receipt", exact: true })).toBeVisible();
    await expectLayout(page);

    // The second row opens its burial. Back brings the slip back again.
    await row(page, READING).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await page.goBack();
    await expectReviewScreen(page);
    for (const words of [PLACEMENT, READING]) await expect(row(page, words).getByText("Ready to check", { exact: true })).toBeVisible();

    // The register's own links lead back too: Back to register, then Committee review, in the same register.
    await row(page, READING).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expectReviewScreen(page);
    for (const words of [PLACEMENT, READING]) await expect(row(page, words).getByText("Ready to check", { exact: true })).toBeVisible();

    // Nothing was written by coming back, and the slip is in no store of the device.
    expect(await revisions(page)).toEqual(afterExport);
    const stored = await everythingStored(page);
    for (const needle of [A(1), A(2), "plot.slip.v1", "committee-return", slip.buffer.toString("utf8").slice(0, 40)]) expect(stored, needle).not.toContain(needle);
    expect(requests.external).toEqual([]);
  });

  test("keeps the one operation ID, so Record receipt after Back records once", async ({ page }) => {
    test.setTimeout(180_000);
    await openFoldWithSlip(page);
    await row(page, PLACEMENT).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burials with no plot" })).toBeVisible();
    await page.goBack();
    await expect(returned(page)).toBeVisible();
    await page.getByRole("button", { name: "Record receipt", exact: true }).click();
    await expect(page.getByText("Receipts recorded: 2. Saved on this device.")).toBeVisible();
    for (const words of [PLACEMENT, READING]) await expect(row(page, words).getByText("Already received", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);
  });

  test("shows no slip in another register, and none after leaving the register", async ({ page }) => {
    test.setTimeout(180_000);
    const requests = trackRequests(page, CHURCH);

    // A register of the keeper's own, made first so its address is known.
    await page.goto("/");
    await page.getByRole("link", { name: "Start a register" }).click();
    await page.getByLabel("Site name", { exact: true }).fill("Orchard Row");
    await page.getByLabel("Local time zone", { exact: true }).selectOption("Europe/London");
    await page.getByRole("button", { name: "Create register", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Orchard Row" })).toBeVisible();
    const own = new URL(page.url()).hash;
    expect(own).toMatch(/^#\/r\/[0-9a-f-]+/);

    // The practice register, with its slip open.
    await goInPage(page, "#/");
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expectReviewScreen(page);
    const foldReview = new URL(page.url()).hash;
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const packet = await download(page);
    const slip = slipFile(packet, [{ n: 1, rule: "placement_missing", disposition: "checked" }]);
    await openSlip(page, slip);
    await expect(row(page, PLACEMENT)).toHaveCount(1);

    // Moving inside the page to the other register shows nothing, not even a refusal of a slip that is not its own.
    await goInPage(page, `${own.split("?")[0]}/exchange`);
    await expectReviewScreen(page);
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    await expect(returned(page)).toHaveCount(0);
    await expect(page.getByText("This slip belongs to another register.")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);

    // And the way back to the first register does not bring its slip back either.
    await goInPage(page, foldReview);
    await expectReviewScreen(page);
    await expect(returned(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);

    // The slip can be opened again there, and leaving the register through the library clears it.
    await openSlip(page, slip);
    await expect(row(page, PLACEMENT)).toHaveCount(1);
    await goInPage(page, "#/");
    await expect(page.getByRole("button", { name: "Open Lantern Fold" })).toBeVisible();
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expectReviewScreen(page);
    await expect(returned(page)).toHaveCount(0);

    // A reload starts a new visit, so it is empty as well.
    await openSlip(page, slip);
    await expect(row(page, PLACEMENT)).toHaveCount(1);
    await page.reload();
    await expectReviewScreen(page);
    await expect(returned(page)).toHaveCount(0);
    expect(requests.external).toEqual([]);
  });

  test("works out each row again: a reading that was reviewed in between no longer reads Ready to check", async ({ page }) => {
    test.setTimeout(180_000);
    await openFoldWithSlip(page);
    await expect(row(page, READING).getByText("Ready to check", { exact: true })).toBeVisible();

    await row(page, READING).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await page.getByRole("button", { name: "Review reading", exact: true }).click();
    await expect(page.getByText("Reading checked. Saved on this device.")).toBeVisible();

    await page.goBack();
    await expectReviewScreen(page);
    await expect(returned(page)).toBeVisible();
    await expect(row(page, READING).getByText("Issue already closed", { exact: true })).toBeVisible();
    await expect(row(page, READING).getByText("Ready to check", { exact: true })).toHaveCount(0);
    await expect(row(page, PLACEMENT).getByText("Ready to check", { exact: true })).toBeVisible();
    await expectLayout(page);

    // Only the row that is ready now is recorded.
    await page.getByRole("button", { name: "Record receipt", exact: true }).click();
    await expect(page.getByText("Receipts recorded: 1. Saved on this device.")).toBeVisible();
    await expect(row(page, PLACEMENT).getByText("Already received", { exact: true })).toBeVisible();
    await expect(row(page, READING).getByText("Issue already closed", { exact: true })).toBeVisible();
  });

  test("works out each row again: words changed in between read Source has changed", async ({ page }) => {
    test.setTimeout(180_000);
    await openFoldWithSlip(page);
    await row(page, READING).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    const words = page.getByRole("textbox", { name: "Words on stone", exact: true });
    await words.fill(`${await words.inputValue()}\nAND HIS WIFE`);
    await page.getByRole("button", { name: "Save reading", exact: true }).click();
    await expect(page.getByText("Reading saved.")).toBeVisible();
    await page.goBack();
    await expectReviewScreen(page);
    await expect(row(page, READING).getByText("Source has changed", { exact: true })).toBeVisible();
    await expect(row(page, PLACEMENT).getByText("Ready to check", { exact: true })).toBeVisible();
  });
});

test.describe("Thimble Beds", () => {
  test.use({ baseURL: GARDEN });

  const FEE = `Record 1 ${MIDDLE_DOT} Check the payment`;

  async function openBedsWithSlip(page: Page): Promise<SlipUpload> {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Thimble Beds" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expectReviewScreen(page);
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const packet = await download(page);
    expect(packet.issues.map((i) => i.rule)).toEqual(["fee_late"]);
    const slip = slipFile(packet, [{ n: 1, rule: "fee_late", disposition: "checked" }]);
    await openSlip(page, slip);
    await expect(row(page, FEE).getByText("Ready to check", { exact: true })).toBeVisible();
    return slip;
  }

  test("shows the same slip after Open matching record and Back, and again after a payment, with the row worked out again", async ({ page }) => {
    test.setTimeout(180_000);
    const requests = trackRequests(page, GARDEN);
    const slip = await openBedsWithSlip(page);
    const afterExport = await revisions(page);

    await row(page, FEE).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Season fees" })).toBeVisible();
    await page.goBack();
    await expectReviewScreen(page);
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeFocused();
    await expect(returned(page)).toBeVisible();
    await expect(row(page, FEE).getByText("Ready to check", { exact: true })).toBeVisible();
    await expectLayout(page);
    expect(await revisions(page)).toEqual(afterExport);
    for (const needle of [A(1), "plot.slip.v1"]) expect(await everythingStored(page), needle).not.toContain(needle);

    // A part payment in the normal form changes the source, so the row reads that when the slip shows again.
    await row(page, FEE).getByRole("link", { name: "Open matching record", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Season fees" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Season 2025 ${MIDDLE_DOT} B02 ${MIDDLE_DOT} Ada Stonecrop` }) });
    await card.getByLabel("Amount received", { exact: true }).fill("10.00");
    await card.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(card.getByText("GBP 10.00 recorded. GBP 20.00 still due.")).toBeVisible();
    await page.goBack();
    await expectReviewScreen(page);
    await expect(row(page, FEE).getByText("Source has changed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);

    // Leaving the register clears the slip. The same file can be opened again.
    await goInPage(page, "#/");
    await page.getByRole("button", { name: "Open Thimble Beds" }).click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expectReviewScreen(page);
    await expect(returned(page)).toHaveCount(0);
    await openSlip(page, slip);
    await expect(row(page, FEE)).toHaveCount(1);
    expect(requests.external).toEqual([]);
  });
});

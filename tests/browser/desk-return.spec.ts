// The register side of the committee return, in a real browser, at 360 by 640 and at 1920 by 1080 (spec 05, task 5.12).
// A keeper opens "Committee review" in each built app, checks every typed word, previews and downloads a review file,
// reads the downloaded bytes, opens a prepared return slip and sees current, changed, closed and received rows, records
// receipts, and changes a record only through its normal form. Every state of the screen is measured for edge, gap,
// target, text and contrast. The slips here are made by the shared exchange module from the downloaded file. The Review
// Desk is built in its own repository, so no slip in this spec was made by it.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readExchangeFile } from "../../template/src/exchange/schema";
import type { ReviewPacket } from "../../template/src/exchange/schema";
import { buildSlip, encodeSlip } from "../../template/src/exchange/slip";
import { scanForCanaries } from "../../template/src/output/privacy";
import { REVIEW_CANARIES as GARDEN_CANARIES } from "../helpers/gardenCanaries";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { REVIEW_CANARIES as CHURCH_CANARIES, INSCRIPTION_WORD } from "../helpers/privacyCanaries";

const CHURCH = "http://127.0.0.1:4176/";
const GARDEN = "http://127.0.0.1:4178/";
const SHOTS = "docs/acceptance/layout/exchange";
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const sizeOf = (page: Page): string => ((page.viewportSize()?.width ?? 0) < 600 ? "phone" : "desktop");

/** Measure the whole screen, and keep a proof picture of the whole page, not only the part in view. */
async function check(page: Page, name: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/${name}-${sizeOf(page)}.png`, type: "png", fullPage: true });
}

interface StoredEvent {
  siteId: string;
  seq: number;
  type: string;
  payload: unknown;
}
interface Ledger {
  revision: number;
  siteKey: string;
  lineageId: string;
  events: StoredEvent[];
}

/** What is stored for the one register on this device, read straight from the browser's database. */
async function ledger(page: Page): Promise<Ledger> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("plotwarden");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = <T,>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const sites = await all<{ id: string; revision: number; siteKey: string; lineageId: string }>("sites");
    const events = await all<{ siteId: string; seq: number; type: string; payload: unknown }>("events");
    db.close();
    const site = sites[0] as { id: string; revision: number; siteKey: string; lineageId: string };
    return {
      revision: site.revision,
      siteKey: site.siteKey,
      lineageId: site.lineageId,
      events: events.filter((e) => e.siteId === site.id).sort((a, b) => a.seq - b.seq),
    };
  });
}

const nonReview = (events: StoredEvent[]): StoredEvent[] => events.filter((e) => !e.type.startsWith("review_"));

const A = (n: number): string => `ac700000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

interface Pick {
  n: number;
  rule: string;
  disposition: "checked" | "needs_keeper";
  factVersion?: number;
  issueKey?: string;
}

/** A return slip for a downloaded packet, as an upload. */
function slipFile(packet: ReviewPacket, picks: Pick[], over: { siteKey?: string } = {}) {
  const built = buildSlip({
    siteKey: over.siteKey ?? packet.siteKey,
    lineageId: packet.lineageId,
    packetRevision: packet.revision,
    packetAsOf: packet.asOf,
    decisions: picks.map((p) => ({
      actionId: A(p.n),
      issueKey: p.issueKey ?? (packet.issues.find((i) => i.rule === p.rule)?.issueKey as string),
      factVersion: p.factVersion ?? 1,
      disposition: p.disposition,
      reviewedOn: "2026-04-21",
    })),
  });
  if (!built.ok) throw new Error(`slip refused: ${JSON.stringify(built.fields)}`);
  const encoded = encodeSlip(built.slip);
  if (!encoded.ok) throw new Error("slip too big");
  return { name: "committee-return-2026-04-21.json", mimeType: "application/json", buffer: Buffer.from(encoded.text, "utf8") };
}

const openSlip = (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) => page.getByLabel("Open return slip", { exact: true }).setInputFiles(file);

/** Press "Download review file" and read what the browser was given. */
async function download(page: Page, button = "Download review file") {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button, exact: true }).click()]);
  const text = readFileSync(await file.path(), "utf8");
  const read = readExchangeFile(new TextEncoder().encode(text));
  if (!read.ok || read.form !== "review") throw new Error(`the download is not a review file: ${JSON.stringify(read)}`);
  return { name: file.suggestedFilename(), text, packet: read.packet };
}

/** A row of the returned checks. The preview has list items too, so the rows are looked for inside their own region. */
const row = (page: Page, words: string) => page.getByRole("region", { name: "Review returned checks" }).getByRole("listitem").filter({ hasText: words });

test.describe("Lantern Fold", () => {
  test.use({ baseURL: CHURCH });

  const FOLD_WORDS = [...CHURCH_CANARIES, "Perrin Gladwyn", "LF-H1", "LF-07A", "Lantern Fold", "Y07", "Y03", INSCRIPTION_WORD];

  async function openExchange(page: Page): Promise<string> {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    return page.url();
  }

  test("exports a review file, reads a prepared slip, and changes no record until the normal forms are used", async ({ page }) => {
    test.setTimeout(240_000);
    const requests = trackRequests(page, CHURCH);
    const exchangeUrl = await openExchange(page);
    const start = await ledger(page);

    // The form: the date and the site name come ready, each check has a label box, one main action.
    await expect(page.getByLabel("Choose a review date", { exact: true })).toHaveValue("2026-04-20");
    await expect(page.getByLabel("Site name for committee", { exact: true })).toHaveValue("Site 1");
    await expect(page.getByRole("group", { name: "Review plot labels" })).toBeVisible();
    await expect(page.getByLabel("Label for item 1", { exact: true })).toHaveValue("Record 1");
    await expect(page.getByLabel("Label for item 2", { exact: true })).toHaveValue("Record 2");
    await expect(page.getByRole("button", { name: "Preview review file", exact: true })).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);
    await expect(page.getByRole("button", { name: "Download review file" })).toHaveCount(0);
    await check(page, "church-form");

    // Preview shows the exact fields and a row for each check, and writes nothing.
    await page.getByLabel("Label for item 1", { exact: true }).fill("Lower bed");
    await page.getByLabel("Site name for committee", { exact: true }).fill("Lower churchyard");
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const preview = page.getByRole("region", { name: "Review file preview" });
    await expect(preview).toBeVisible();
    await expect(preview.getByText("2 checks in this file.")).toBeVisible();
    await expect(preview.getByText("Lower bed · Check the location · version 1")).toBeVisible();
    await expect(preview.getByText("Record 2 · Read the stone again · version 1")).toBeVisible();
    await expect(preview.getByText("Whole file: format, siteKind, siteKey, lineageId, siteAlias, revision, asOf, issues")).toBeVisible();
    await expect(preview.getByText("Each check: issueKey, subjectKey, label, rule, factVersion, action")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Review file preview" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Download review file", exact: true })).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);
    expect((await ledger(page)).events.length).toBe(start.events.length);
    await check(page, "church-preview");

    // Any change to an input takes the preview away until it is made again.
    await page.getByLabel("Label for item 2", { exact: true }).fill("Record 2 near the path");
    await expect(preview).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download review file" })).toHaveCount(0);
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    await expect(preview.getByText("Record 2 near the path · Read the stone again · version 1")).toBeVisible();

    // Download commits the keys once, then hands over the file.
    const first = await download(page);
    expect(first.name).toBe("committee-review-2026-04-20.json");
    await expect(page.getByText("Your copy is ready. Saved on this device.")).toBeVisible();
    expect(Object.keys(JSON.parse(first.text) as object).sort()).toEqual(["asOf", "format", "issues", "lineageId", "revision", "siteAlias", "siteKey", "siteKind"]);
    const packet = first.packet;
    expect(packet.siteKind).toBe("churchyard");
    expect(packet.siteAlias).toBe("Lower churchyard");
    expect(packet.asOf).toBe("2026-04-20");
    expect(packet.issues.map((i) => [i.label, i.rule, i.action, i.factVersion]).sort()).toEqual([
      ["Lower bed", "placement_missing", "check_location", 1],
      ["Record 2 near the path", "reading_unclear", "read_stone_again", 1],
    ]);
    for (const issue of packet.issues) expect(Object.keys(issue).sort()).toEqual(["action", "factVersion", "issueKey", "label", "rule", "subjectKey"]);
    expect(scanForCanaries(first.text, FOLD_WORDS)).toEqual([]);

    const exported = await ledger(page);
    expect(exported.revision).toBe(start.revision + 1);
    expect(exported.events.length).toBe(start.events.length + 1);
    expect(exported.events.at(-1)?.type).toBe("review_prepared");
    expect(packet.revision).toBe(exported.revision);
    expect(packet.siteKey).toBe(exported.siteKey);
    expect(packet.lineageId).toBe(exported.lineageId);
    await check(page, "church-done");

    // The same file again from the screen, then from a fresh load: the same bytes and no new commit.
    const again = await download(page, "Download again");
    expect(again.text).toBe(first.text);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    await expect(page.getByLabel("Site name for committee", { exact: true })).toHaveValue("Lower churchyard");
    await expect(page.getByLabel("Label for item 1", { exact: true })).toHaveValue("Lower bed");
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const second = await download(page);
    expect(second.text).toBe(first.text);
    await expect(page.getByText("Your copy is ready.", { exact: true })).toBeVisible();
    expect((await ledger(page)).revision).toBe(exported.revision);

    // A prepared slip: both rows are current.
    const slip1 = slipFile(packet, [
      { n: 1, rule: "placement_missing", disposition: "checked" },
      { n: 2, rule: "reading_unclear", disposition: "needs_keeper" },
    ]);
    await openSlip(page, slip1);
    await expect(page.getByRole("heading", { level: 2, name: "Review returned checks" })).toBeFocused();
    await expect(page.getByText("From the review file as at 2026-04-20, revision " + packet.revision + ".")).toBeVisible();
    const placement = row(page, "Lower bed · Check the location");
    const reading = row(page, "Record 2 near the path · Read the stone again");
    for (const r of [placement, reading]) {
      await expect(r).toHaveCount(1);
      await expect(r.getByText("Ready to check", { exact: true })).toBeVisible();
    }
    await expect(placement).toContainText("Checked on 2026-04-21");
    await expect(reading).toContainText("Needs keeper on 2026-04-21");
    await expect(placement.getByRole("link", { name: "Open matching record" })).toHaveAttribute("href", /\/unplaced$/);
    await expect(reading.getByRole("link", { name: "Open matching record" })).toHaveAttribute("href", /\/burial\/[0-9a-f-]+$/);
    await expect(page.getByRole("button", { name: "Record receipt", exact: true })).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);
    await expect(page.getByText("A receipt records that your committee looked. It changes no record.")).toBeVisible();
    expect((await ledger(page)).events.length).toBe(exported.events.length);
    await check(page, "church-slip-ready");

    // Record receipt writes the two receipts and nothing else. Every earlier event is as it was.
    await page.getByRole("button", { name: "Record receipt", exact: true }).click();
    await expect(page.getByText("Receipts recorded: 2. Saved on this device.")).toBeVisible();
    for (const r of [placement, reading]) await expect(r.getByText("Already received", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);
    await expect(page.getByText("Nothing new to record.")).toBeVisible();
    const received = await ledger(page);
    expect(received.revision).toBe(exported.revision + 1);
    expect(received.events.slice(0, exported.events.length)).toEqual(exported.events);
    expect(received.events.slice(exported.events.length).map((e) => e.type)).toEqual(["review_received", "review_received"]);
    expect(nonReview(received.events).length).toBe(start.events.length);
    await check(page, "church-slip-received");

    // The same slip again writes nothing.
    await openSlip(page, slip1);
    await expect(row(page, "Lower bed · Check the location").getByText("Already received", { exact: true })).toBeVisible();
    expect((await ledger(page)).events.length).toBe(received.events.length);

    // No record changed. The burial is still unplaced and the reading is still unclear.
    await reading.getByRole("link", { name: "Open matching record" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await expect(page.getByText("Marked for another reading.")).toBeVisible();
    await page.goto(exchangeUrl);
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();

    // A second slip. The reading's words are changed in the normal form, so its row says the source changed.
    const slip2 = slipFile(packet, [
      { n: 3, rule: "placement_missing", disposition: "checked" },
      { n: 4, rule: "reading_unclear", disposition: "checked" },
    ]);
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByLabel("Name or plot code", { exact: true }).fill("Quillmoss");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07 · Yew Walk" }).getByRole("link", { name: "Open burial" }).click();
    const words = page.getByRole("textbox", { name: "Words on stone", exact: true });
    await words.fill(`${await words.inputValue()}\nAND HIS WIFE`);
    await page.getByRole("button", { name: "Save reading", exact: true }).click();
    await expect(page.getByText("Reading saved.")).toBeVisible();
    await page.goto(exchangeUrl);
    await openSlip(page, slip2);
    await expect(row(page, "Record 2 near the path · Read the stone again").getByText("Source has changed", { exact: true })).toBeVisible();
    await expect(row(page, "Lower bed · Check the location").getByText("Ready to check", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record receipt", exact: true })).toBeVisible();
    await check(page, "church-slip-changed");

    // The burial is placed in the normal form. Then its row is closed and nothing is left to record.
    await row(page, "Lower bed · Check the location").getByRole("link", { name: "Open matching record" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burials with no plot" })).toBeVisible();
    await page.getByLabel("Plot", { exact: true }).selectOption({ label: "Y03 · Yew Walk" });
    await page.getByRole("button", { name: "Confirm placement", exact: true }).click();
    await expect(page.getByText(/placed at Y03/)).toBeVisible();
    await page.goto(exchangeUrl);
    await openSlip(page, slip2);
    await expect(row(page, "Lower bed · Check the location").getByText("Issue already closed", { exact: true })).toBeVisible();
    await expect(row(page, "Record 2 near the path · Read the stone again").getByText("Source has changed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);
    await expect(page.getByText("Nothing new to record.")).toBeVisible();
    await expect(row(page, "Lower bed · Check the location").getByRole("link", { name: "Open matching record" })).toHaveAttribute("href", /\/burial\/[0-9a-f-]+$/);
    await check(page, "church-slip-closed");

    // Only the two normal forms and the review events were written. The slip itself wrote nothing.
    const end = await ledger(page);
    expect(end.events.filter((e) => e.type.startsWith("review_")).map((e) => e.type)).toEqual(["review_prepared", "review_received", "review_received"]);
    const written = nonReview(end.events).slice(start.events.length).map((e) => e.type);
    expect(written[0]).toBe("reading_saved");
    expect(written).toContain("burial_placed");
    expect(written.filter((type) => !["reading_saved", "burial_placed", "claim_added"].includes(type))).toEqual([]);

    // The next export has one check, at version 2 for the reading, with the same key as before. It commits once, for the new version.
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const next = await download(page);
    expect(next.packet.issues.map((i) => [i.rule, i.factVersion])).toEqual([["reading_unclear", 2]]);
    expect(next.packet.issues[0]?.issueKey).toBe(packet.issues.find((i) => i.rule === "reading_unclear")?.issueKey);
    expect(next.packet.revision).toBe(end.revision + 1);
    expect(requests.external).toEqual([]);
  });

  test("refuses a slip for another register and files that are not slips, and changes nothing", async ({ page }) => {
    const requests = trackRequests(page, CHURCH);
    await openExchange(page);
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const made = await download(page);
    const before = await ledger(page);

    await openSlip(page, slipFile(made.packet, [{ n: 1, rule: "placement_missing", disposition: "checked" }], { siteKey: "5a5a5a5a-0000-4000-8000-0000000000aa" }));
    await expect(page.getByText("This slip belongs to another register.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Review returned checks" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);
    await check(page, "church-slip-refused");

    const input = page.getByLabel("Open return slip", { exact: true });
    await input.setInputFiles({ name: "committee-review.json", mimeType: "application/json", buffer: Buffer.from(made.text) });
    await expect(page.getByText("This file is a review file, not a return slip.")).toBeVisible();
    await input.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("hello") });
    await expect(page.getByText("This file is not a return slip.")).toBeVisible();
    await input.setInputFiles({ name: "later.json", mimeType: "application/json", buffer: Buffer.from('{"format":"plot.slip.v2"}') });
    await expect(page.getByText("This file needs a newer version.")).toBeVisible();
    await input.setInputFiles({ name: "slip.json", mimeType: "application/json", buffer: Buffer.from('{"format":"plot.slip.v1","note":"x"}') });
    await expect(page.getByText("This return slip is not valid. Nothing was changed.")).toBeVisible();
    expect((await ledger(page)).events).toEqual(before.events);
    expect(requests.external).toEqual([]);
  });

  test("checks every typed word, moves focus to the first wrong one, and writes nothing", async ({ page }) => {
    const requests = trackRequests(page, CHURCH);
    await openExchange(page);
    const start = await ledger(page);
    const alias = page.getByLabel("Site name for committee", { exact: true });
    const one = page.getByLabel("Label for item 1", { exact: true });
    const two = page.getByLabel("Label for item 2", { exact: true });
    const preview = page.getByRole("button", { name: "Preview review file", exact: true });

    await alias.fill("Lantern Fold");
    await preview.click();
    await expect(page.getByText("This holds a name, contact or reference. Use a plain word.")).toBeVisible();
    await expect(alias).toHaveAttribute("aria-invalid", "true");
    await expect(alias).toBeFocused();
    await check(page, "church-errors");

    await alias.fill("   ");
    await preview.click();
    await expect(page.getByText("Enter a word or number.")).toBeVisible();
    await expect(alias).toBeFocused();

    await alias.fill("Site 1");
    await one.fill("£5 owed");
    await two.fill("Mirel Quillmoss");
    await preview.click();
    await expect(page.getByText("This looks like an amount. Use a plain word.")).toBeVisible();
    await expect(page.getByText("This holds a name, contact or reference. Use a plain word.")).toBeVisible();
    await expect(one).toBeFocused();

    await one.fill("a@b.example");
    await two.fill("x".repeat(41));
    await preview.click();
    await expect(page.getByText("This looks like a contact. Use a plain word.")).toBeVisible();
    await expect(page.getByText("Use 40 characters or fewer.")).toBeVisible();

    await page.getByLabel("Choose a review date", { exact: true }).fill("");
    await preview.click();
    await expect(page.getByText("Use a valid date.")).toBeVisible();
    await expect(page.getByLabel("Choose a review date", { exact: true })).toBeFocused();

    expect(await page.getByRole("region", { name: "Review file preview" }).count()).toBe(0);
    expect(await page.getByRole("button", { name: "Download review file" }).count()).toBe(0);
    expect((await ledger(page)).events).toEqual(start.events);
    expect(requests.external).toEqual([]);
  });

  test("removes a preview that another tab has made out of date, and writes no file", async ({ page, context }) => {
    test.setTimeout(180_000);
    const requests = trackRequests(page, CHURCH);
    const url = await openExchange(page);
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    await expect(page.getByRole("region", { name: "Review file preview" })).toBeVisible();
    const start = await ledger(page);

    // The same register in a second tab commits a change.
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    await other.getByRole("button", { name: "Preview review file", exact: true }).click();
    const sent = await download(other);
    await other.close();
    expect((await ledger(page)).revision).toBe(start.revision + 1);

    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await page.getByRole("button", { name: "Download review file", exact: true }).click();
    await expect(page.getByText("Review public details again.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Review file preview" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download review file" })).toHaveCount(0);
    expect(downloaded).toBe(false);
    expect((await ledger(page)).events.length).toBe(start.events.length + 1);
    await check(page, "church-stale");

    // Made again from the latest revision, it is the same file the other tab made.
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const again = await download(page);
    expect(again.text).toBe(sent.text);
    expect((await ledger(page)).revision).toBe(start.revision + 1);
    expect(requests.external).toEqual([]);
  });

  test("works on a register of the keeper's own: nothing to send, then one burial with no plot", async ({ page }) => {
    test.setTimeout(180_000);
    await page.clock.setFixedTime(new Date("2026-04-20T10:00:00Z"));
    const requests = trackRequests(page, CHURCH);
    await page.goto("/");
    await page.getByRole("link", { name: "Start a register" }).click();
    await page.getByLabel("Site name", { exact: true }).fill("Orchard Row");
    await page.getByLabel("Local time zone", { exact: true }).selectOption("Europe/London");
    await page.getByRole("button", { name: "Create register", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Orchard Row" })).toBeVisible();

    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expect(page.getByText("Nothing has been recorded yet, so there is nothing to send.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview review file" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download review file" })).toHaveCount(0);
    await check(page, "church-empty");

    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Record a burial" }).first().click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Ivo Marchbanks");
    await page.getByLabel("Source ref", { exact: true }).fill("OWN-1");
    await page.getByRole("button", { name: "Save burial", exact: true }).click();
    await expect(page.getByText("Burial saved. Location to confirm.").first()).toBeVisible();

    await page.getByRole("link", { name: "Back to register" }).first().click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expect(page.getByLabel("Choose a review date", { exact: true })).toHaveValue("2026-04-20");
    await page.getByLabel("Site name for committee", { exact: true }).fill("Lower plots");
    // The register's own title and the burial's own words are refused as a label.
    await page.getByLabel("Label for item 1", { exact: true }).fill("Ivo Marchbanks");
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    await expect(page.getByText("This holds a name, contact or reference. Use a plain word.")).toBeVisible();
    await page.getByLabel("Label for item 1", { exact: true }).fill("Burial 1");
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const made = await download(page);
    expect(made.packet.issues.map((i) => [i.label, i.rule, i.factVersion])).toEqual([["Burial 1", "placement_missing", 1]]);
    expect(made.packet.siteAlias).toBe("Lower plots");
    expect(scanForCanaries(made.text, ["Ivo Marchbanks", "OWN-1", "Orchard Row"])).toEqual([]);
    expect(requests.external).toEqual([]);
  });
});

test.describe("Thimble Beds", () => {
  test.use({ baseURL: GARDEN });

  const BED_WORDS = [...GARDEN_CANARIES, "B02", "B03", "Thimble Beds", "3600", "3000", "1200", "2400", "1000"];

  test("exports the late offer and the late fee, reads a prepared slip, and changes no record until the normal forms are used", async ({ page }) => {
    test.setTimeout(240_000);
    const requests = trackRequests(page, GARDEN);
    await page.goto("/");
    await page.getByRole("button", { name: "Open Thimble Beds" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();

    // An offer on B03 with its reply date today. On the next day it is late.
    await page.getByRole("link", { name: "Make an offer" }).first().click();
    await page.getByLabel("Reply by", { exact: true }).fill("2026-04-20");
    await page.getByRole("button", { name: "Review offer" }).click();
    await page.getByRole("button", { name: "Record offer" }).click();
    await expect(page.getByText("Tell the applicant yourself. Saved on this device.").first()).toBeVisible();
    await page.getByRole("link", { name: "Back to register" }).first().click();
    const start = await ledger(page);

    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    const exchangeUrl = page.url();
    // On the reply date itself only the fee is late.
    await expect(page.getByLabel("Choose a review date", { exact: true })).toHaveValue("2026-04-20");
    await expect(page.getByLabel("Label for item 1", { exact: true })).toHaveValue("Record 1");
    await expect(page.getByLabel("Label for item 2", { exact: true })).toHaveCount(0);
    await check(page, "garden-form-one");
    await page.getByLabel("Choose a review date", { exact: true }).fill("2026-04-21");
    await expect(page.getByLabel("Label for item 2", { exact: true })).toBeVisible();
    await check(page, "garden-form");

    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    const preview = page.getByRole("region", { name: "Review file preview" });
    await expect(preview.getByText("2 checks in this file.")).toBeVisible();
    await expect(preview.getByText("Record 1 · Check the reply · version 1")).toBeVisible();
    await expect(preview.getByText("Record 2 · Check the payment · version 1")).toBeVisible();
    await check(page, "garden-preview");

    const first = await download(page);
    expect(first.name).toBe("committee-review-2026-04-21.json");
    const packet = first.packet;
    expect(packet.siteKind).toBe("allotment");
    expect(packet.asOf).toBe("2026-04-21");
    expect(packet.siteAlias).toBe("Site 1");
    expect(packet.issues.map((i) => [i.label, i.rule, i.action, i.factVersion]).sort()).toEqual([
      ["Record 1", "offer_late", "check_reply", 1],
      ["Record 2", "fee_late", "check_payment", 1],
    ]);
    expect(scanForCanaries(first.text.replace(UUID_ANYWHERE, ""), BED_WORDS)).toEqual([]);
    const exported = await ledger(page);
    expect(exported.revision).toBe(start.revision + 1);
    expect(packet.revision).toBe(exported.revision);
    expect(exported.events.at(-1)?.type).toBe("review_prepared");
    await check(page, "garden-done");

    // The slip. Both rows are current, and each has its own staff screen.
    const slip1 = slipFile(packet, [
      { n: 1, rule: "offer_late", disposition: "checked" },
      { n: 2, rule: "fee_late", disposition: "needs_keeper" },
    ]);
    await openSlip(page, slip1);
    const offer = row(page, "Record 1 · Check the reply");
    const fee = row(page, "Record 2 · Check the payment");
    for (const r of [offer, fee]) await expect(r.getByText("Ready to check", { exact: true })).toBeVisible();
    await expect(offer.getByRole("link", { name: "Open matching record" })).toHaveAttribute("href", /\/offer$/);
    await expect(fee.getByRole("link", { name: "Open matching record" })).toHaveAttribute("href", /\/payments$/);
    await check(page, "garden-slip-ready");

    await page.getByRole("button", { name: "Record receipt", exact: true }).click();
    await expect(page.getByText("Receipts recorded: 2. Saved on this device.")).toBeVisible();
    for (const r of [offer, fee]) await expect(r.getByText("Already received", { exact: true })).toBeVisible();
    const received = await ledger(page);
    expect(received.events.slice(exported.events.length).map((e) => e.type)).toEqual(["review_received", "review_received"]);
    expect(nonReview(received.events).length).toBe(start.events.length);
    await check(page, "garden-slip-received");

    // A second slip. A part payment is recorded in the normal form, then the offer is accepted in its normal form.
    const slip2 = slipFile(packet, [
      { n: 3, rule: "offer_late", disposition: "checked" },
      { n: 4, rule: "fee_late", disposition: "checked" },
    ]);
    await fee.getByRole("link", { name: "Open matching record" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Season fees" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Season 2025 · B02 · Ada Stonecrop" }) });
    await card.getByLabel("Amount received", { exact: true }).fill("10.00");
    await card.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(card.getByText("GBP 10.00 recorded. GBP 20.00 still due.")).toBeVisible();
    await page.goto(exchangeUrl);
    await openSlip(page, slip2);
    await expect(row(page, "Record 2 · Check the payment").getByText("Source has changed", { exact: true })).toBeVisible();
    await expect(row(page, "Record 1 · Check the reply").getByText("Ready to check", { exact: true })).toBeVisible();
    await check(page, "garden-slip-changed");

    await row(page, "Record 1 · Check the reply").getByRole("link", { name: "Open matching record" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Make an offer" })).toBeVisible();
    await page.getByRole("button", { name: "Accept offer", exact: true }).click();
    await expect(page.getByText(/Offer accepted\. Tavi Bramblequill holds B03\./).first()).toBeVisible();
    await page.goto(exchangeUrl);
    await openSlip(page, slip2);
    await expect(row(page, "Record 1 · Check the reply").getByText("Issue already closed", { exact: true })).toBeVisible();
    await expect(row(page, "Record 2 · Check the payment").getByText("Source has changed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record receipt" })).toHaveCount(0);
    await check(page, "garden-slip-closed");

    const end = await ledger(page);
    expect(end.events.filter((e) => e.type.startsWith("review_")).map((e) => e.type)).toEqual(["review_prepared", "review_received", "review_received"]);
    expect(requests.external).toEqual([]);
  });

  test("sends an empty file when nothing is late at the chosen date, and commits nothing", async ({ page }) => {
    const requests = trackRequests(page, GARDEN);
    await page.goto("/");
    await page.getByRole("button", { name: "Open Thimble Beds" }).click();
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    const start = await ledger(page);
    await page.getByLabel("Choose a review date", { exact: true }).fill("2025-06-30");
    await expect(page.getByText("No open checks at this date.")).toBeVisible();
    await expect(page.getByRole("group", { name: "Review plot labels" })).toHaveCount(0);
    await check(page, "garden-none");
    await page.getByRole("button", { name: "Preview review file", exact: true }).click();
    await expect(page.getByText("0 checks in this file.")).toBeVisible();
    const made = await download(page);
    expect(made.packet.issues).toEqual([]);
    expect(made.packet.revision).toBe(start.revision);
    expect((await ledger(page)).events.length).toBe(start.events.length);
    expect(requests.external).toEqual([]);
  });
});

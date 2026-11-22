// Allotment Register in a real browser, at 360 by 640 and at 1920 by 1080 (spec 04, task 4.18).
// A garden secretary opens Thimble Beds, reads the waiting list, offers the next free plot, handles a decline and an
// accept, sets up a season, records and reverses payments, hands a plot on, reads the season report, and makes the
// availability file. That file is opened in a fresh page with the network off and scanned for every private word.
// Every screen visited is measured for edge, gap, target, text and contrast, and the sheet labels for collisions.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AVAILABILITY_CANARIES, CONTACTS, NEW_HOLDER, RECEIPT_REF, TENANTS } from "../helpers/gardenCanaries";
import { measureLayout, trackRequests } from "../helpers/measureLayout";

const APP = "http://127.0.0.1:4178/";
test.use({ baseURL: APP });

const SHOTS = "docs/acceptance/layout/allotment";
const TAVI = "Tavi Bramblequill";
const OLIN = "Olin Reedwhorl";
const INSTRUCTIONS = "Ask the secretary at the hut on Saturday morning. Say the plot code.";

const sizeOf = (page: Page): string => ((page.viewportSize()?.width ?? 0) < 600 ? "phone" : "desktop");

/** Measure the screen on view, and keep one small proof picture of it. */
async function check(page: Page, name?: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
  if (name !== undefined) await page.screenshot({ path: `${SHOTS}/${name}-${sizeOf(page)}.png`, type: "png" });
}

async function openBeds(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Thimble Beds" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();
}

const backToRegister = async (page: Page): Promise<void> => {
  await page.getByRole("link", { name: "Back to register" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();
};

/** The card of one open offer, found by its heading. */
const offerCard = (page: Page, plot: string, name: string): Locator => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `${plot} for ${name}` }) });

/** Offer the next free plot to the first applicant, review it and record it. */
async function recordOffer(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Make an offer" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Make an offer" })).toBeVisible();
  await page.getByRole("button", { name: "Review offer" }).click();
  await page.getByRole("button", { name: "Record offer" }).click();
  await expect(page.getByText("Tell the applicant yourself. Saved on this device.").first()).toBeVisible();
}

/** Tavi is offered B03 and accepts it from the desk. */
async function giveB03ToTavi(page: Page): Promise<void> {
  await recordOffer(page);
  await offerCard(page, "B03", TAVI).getByRole("button", { name: "Accept offer" }).click();
  await expect(page.getByText(`Offer accepted. ${TAVI} holds B03.`).first()).toBeVisible();
  await backToRegister(page);
}

test.describe("the first view", () => {
  test("names one job, has one main action above the fold, and keeps the garden look apart from the churchyard", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Allotment Register" })).toBeVisible();
    await expect(page.getByText("Offer the next free plot or start your register.")).toBeVisible();
    await expect(page.getByText("No registers on this device.")).toBeVisible();

    const main = page.getByRole("button", { name: "Open Thimble Beds" });
    await expect(main).toBeVisible();
    await expect(main).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);
    const box = await main.boundingBox();
    expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);

    // The garden strip sits above the title and never over a word or a control. The colours are the garden's own.
    const strip = await page.evaluate(() => {
      const header = document.querySelector("header.app") as HTMLElement;
      const mist = header.querySelector(".mist") as HTMLElement;
      const brand = header.querySelector(".brand") as HTMLElement;
      return {
        mistBottom: mist.getBoundingClientRect().bottom,
        brandTop: brand.getBoundingClientRect().top,
        mistEvents: getComputedStyle(mist).pointerEvents,
        sky: getComputedStyle(header, "::before").backgroundColor,
        ink: getComputedStyle(document.documentElement).color,
        paper: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(strip.mistBottom).toBeLessThanOrEqual(strip.brandTop);
    expect(strip.mistEvents).toBe("none");
    expect(strip.sky).toBe("rgb(207, 231, 223)");
    expect(strip.ink).toBe("rgb(27, 49, 42)");
    expect(strip.paper).toBe("rgb(247, 245, 232)");
    await check(page, "library");
    expect(requests.external).toEqual([]);
  });
});

test.describe("the desk", () => {
  test("shows the next free plot and the next applicant, with one main action and a plan of beds", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openBeds(page);
    await expect(page.getByText("Offer the next free plot or start your register.")).toHaveCount(0);

    const plot = page.getByRole("region", { name: "Next free plot" });
    await expect(plot).toContainText("B03");
    await expect(plot).toContainText("B03 · Sunny Row · Free");
    const applicant = page.getByRole("region", { name: "Next applicant" });
    await expect(applicant).toContainText(TAVI);
    await expect(applicant).toContainText("Joined 2026-01-10");
    await expect(applicant).toContainText("First in order");

    const offer = page.getByRole("link", { name: "Make an offer" });
    await expect(offer).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);

    // The plan draws beds, not headstones: a footprint, a strip of hatching, and a peg behind each code.
    expect(await page.locator("svg.sheet .bed").count()).toBe(6);
    expect(await page.locator("svg.sheet .hatch").count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator("svg.sheet .peg").count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator("svg.sheet .path-line").count()).toBe(1);
    expect(await page.locator("svg.sheet path.plot").count()).toBe(0);
    await expect(page.locator("svg.sheet text", { hasText: "Grass Walk" }).first()).toBeVisible();
    await expect(page.locator("svg.sheet text", { hasText: "Main gate" })).toBeVisible();

    // The key sits directly below the plan and holds the four states with their words.
    const key = page.getByRole("list", { name: "Map key" });
    for (const word of ["Free", "Reserved", "Taken", "Unusable"]) await expect(key.getByText(word, { exact: true })).toBeVisible();
    const sheetBox = await page.getByRole("img", { name: /Site map/ }).boundingBox();
    const keyBox = await key.boundingBox();
    const gap = (keyBox?.y ?? 0) - ((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0));
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(48);

    await expect(page.getByText("2 free")).toBeVisible();
    await expect(page.getByText("3 taken")).toBeVisible();
    await expect(page.getByText("1 unusable")).toBeVisible();
    await check(page, "desk");

    // A search finds a holder and keeps the words in the address, so Back returns to them.
    await page.getByLabel("Name or plot code", { exact: true }).fill("Stonecrop");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("Holder of B02 · Ada Stonecrop")).toBeVisible();
    await page.getByRole("link", { name: "Open plot" }).first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Current tenancies" })).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Stonecrop");
    expect(requests.external).toEqual([]);
  });
});

test.describe("the waiting list", () => {
  test("keeps tied applicants in join order, refuses a second open request, and withdraws only with a reason", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openBeds(page);
    await page.getByRole("link", { name: /^Waiting list/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Waiting list" })).toBeVisible();

    // Two people joined on the same day. The join sequence, not the ID, puts Tavi first.
    const rows = page.locator("ol.cards > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(`Position 1 · ${TAVI}`);
    await expect(rows.nth(1)).toContainText(`Position 2 · ${OLIN}`);
    await expect(page.getByText(`Next eligible applicant: ${TAVI}`)).toBeVisible();
    await check(page, "waiting");

    await page.getByRole("button", { name: `View request: ${TAVI}` }).click();
    await expect(page.getByRole("heading", { level: 3, name: `Request of ${TAVI}` })).toBeVisible();
    await expect(page.getByText("tavi.bramblequill@example.invalid")).toBeVisible();
    await page.getByRole("button", { name: `View request: ${TAVI}` }).click();

    // The same person cannot have two open requests. Nothing is saved and focus goes to the choice.
    await page.getByLabel("Same person as", { exact: true }).selectOption({ label: TAVI });
    await page.getByRole("button", { name: "Add applicant", exact: true }).click();
    await expect(page.getByText("Already has an open request").first()).toBeVisible();
    await expect(page.getByLabel("Same person as", { exact: true })).toBeFocused();
    await expect(rows).toHaveCount(2);

    // A new person joins at the end of the list.
    await page.getByLabel("Same person as", { exact: true }).selectOption({ label: "A new person" });
    await page.getByLabel("Applicant", { exact: true }).fill("Wren Thistledown");
    await page.getByRole("button", { name: "Add applicant", exact: true }).click();
    await expect(page.getByText("Wren Thistledown added to the waiting list. Saved on this device.")).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText("Position 3 · Wren Thistledown");
    await expect(page.getByLabel("Applicant", { exact: true })).toHaveValue("");

    // Withdraw needs a reason. Without one nothing changes and focus goes to the reason.
    await page.getByRole("button", { name: `Withdraw request: ${OLIN}` }).click();
    await page.getByRole("button", { name: "Withdraw this request" }).click();
    const reason = page.getByLabel(`Reason: ${OLIN}`, { exact: true });
    await expect(reason).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toBeFocused();
    await expect(rows).toHaveCount(3);
    await reason.fill("Moved away");
    await page.getByRole("button", { name: "Withdraw this request" }).click();
    await expect(page.getByText("Request withdrawn. Saved on this device.")).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole("heading", { name: new RegExp(OLIN) })).toHaveCount(0);
    await page.getByRole("button", { name: "Show history" }).click();
    await expect(page.getByText(`${OLIN} · 2026-01-10 · Withdrawn on 2026-04-20. Moved away`)).toBeVisible();
    expect(requests.external).toEqual([]);
  });
});

test.describe("offers", () => {
  test("records one offer from a double press, declines it and keeps the place, offers again, and the applicant accepts", async ({ page }) => {
    test.setTimeout(180_000);
    const requests = trackRequests(page, APP);
    await openBeds(page);
    await page.getByRole("link", { name: "Make an offer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Make an offer" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Choose a free plot" })).toHaveValue(/.+/);
    await expect(page.getByLabel("Offer to", { exact: true })).toContainText(`Position 1 · ${TAVI}`);
    await page.getByLabel("Reply by", { exact: true }).fill("2026-04-30");
    await page.getByRole("button", { name: "Review offer" }).click();
    const review = page.getByRole("region", { name: "Review offer" });
    await expect(review).toContainText(`B03 reserved for ${TAVI}.`);
    await expect(review).toContainText("Offered 2026-04-20. Reply by 2026-04-30.");
    await expect(review).toContainText("Tell the applicant yourself.");
    await check(page, "offer");

    // Two presses in one task make one offer.
    await review.getByRole("button", { name: "Record offer" }).evaluate((button: HTMLElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByText(`B03 reserved for ${TAVI}. Tell the applicant yourself. Saved on this device.`).first()).toBeVisible();
    const card = offerCard(page, "B03", TAVI);
    await expect(card).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 3 }).filter({ hasText: " for " })).toHaveCount(1);
    await expect(card).toContainText("Offered 2026-04-20. Reply by 2026-04-30.");
    await expect(page.getByRole("button", { name: "Review offer" })).toBeVisible();
    await check(page, "offer-open");

    // Decline needs a choice. Without one nothing changes and focus goes to the choice.
    await card.getByRole("button", { name: "Decline offer" }).click();
    const choice = card.getByLabel("What happens to the place in the list: B03", { exact: true });
    await expect(choice).toHaveAttribute("aria-invalid", "true");
    await expect(choice).toBeFocused();
    await expect(card).toHaveCount(1);
    await choice.selectOption({ label: "Keep place" });
    await card.getByRole("button", { name: "Decline offer" }).click();
    await expect(page.getByText(`Offer declined. ${TAVI} keeps their place. Saved on this device.`).first()).toBeVisible();
    await expect(page.getByText("No open offers.")).toBeVisible();

    // The plot is free again on the same day and the applicant is still first.
    await backToRegister(page);
    await expect(page.getByRole("region", { name: "Next free plot" })).toContainText("B03");
    await expect(page.getByRole("region", { name: "Next applicant" })).toContainText(TAVI);
    await recordOffer(page);
    await offerCard(page, "B03", TAVI).getByLabel("Date the tenancy begins: B03", { exact: true }).fill("2026-04-20");
    await offerCard(page, "B03", TAVI).getByRole("button", { name: "Accept offer" }).click();
    await expect(page.getByText(`Offer accepted. ${TAVI} holds B03. Saved on this device.`).first()).toBeVisible();
    await expect(page.getByText("No open offers.")).toBeVisible();

    await backToRegister(page);
    await expect(page.getByText("1 free")).toBeVisible();
    await expect(page.getByText("4 taken")).toBeVisible();
    await expect(page.getByRole("region", { name: "Next free plot" })).toContainText("B05");
    await expect(page.getByRole("region", { name: "Next applicant" })).toContainText(OLIN);
    expect(requests.external).toEqual([]);
  });

  test("passes over the first applicant only with a reason, and keeps the applicant with an open offer in the list", async ({ page }) => {
    await openBeds(page);
    await page.getByRole("link", { name: "Make an offer" }).click();
    await page.getByLabel("Offer to", { exact: true }).selectOption({ label: `Position 2 · ${OLIN} · Joined 2026-01-10` });
    const why = page.getByLabel(`Why skip this applicant? ${TAVI}`, { exact: true });
    await expect(why).toBeVisible();
    await page.getByRole("button", { name: "Review offer" }).click();
    await expect(why).toHaveAttribute("aria-invalid", "true");
    await expect(why).toBeFocused();
    await expect(page.getByText("Say why this applicant is skipped.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Review offer" })).toHaveCount(0);
    await expect(page.getByText("No open offers.")).toBeVisible();

    await why.fill("Asked to wait until May");
    await page.getByRole("button", { name: "Review offer" }).click();
    await page.getByRole("button", { name: "Record offer" }).click();
    await expect(page.getByText(`B03 reserved for ${OLIN}. Tell the applicant yourself. Saved on this device.`).first()).toBeVisible();
    const card = offerCard(page, "B03", OLIN);
    await expect(card).toContainText("Asked to wait until May");

    // Olin keeps a place and shows an open offer. Olin cannot be withdrawn while the offer is open.
    await backToRegister(page);
    await page.getByRole("link", { name: /^Waiting list/ }).first().click();
    const rows = page.locator("ol.cards > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: OLIN })).toContainText("Offer pending");
    await expect(page.getByRole("button", { name: `Withdraw request: ${OLIN}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Withdraw request: ${TAVI}` })).toBeVisible();
  });
});

test.describe("tenancies", () => {
  test("lists each holder, and refuses a second tenancy on a plot with nothing saved", async ({ page }) => {
    await openBeds(page);
    await page.getByRole("link", { name: "Current tenancies" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Current tenancies" })).toBeVisible();
    const cards = page.locator("ul.cards > li").filter({ has: page.getByRole("heading", { level: 2 }) });
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText("B01 · Marlo Fennick");
    await expect(cards.nth(0)).toContainText("From 2024-04-01");
    await expect(cards.nth(1)).toContainText("B02 · Ada Stonecrop");
    await expect(cards.nth(1)).toContainText("GBP 30.00");
    await expect(cards.nth(2)).toContainText("B04 · Ilse Burrowby");
    await check(page, "tenancy");

    await page.getByLabel("Choose a plot", { exact: true }).selectOption({ label: "B01 · not free now" });
    await page.getByLabel("Plot holder", { exact: true }).fill("Dup Holder");
    await page.getByLabel("Tenancy begins", { exact: true }).last().fill("2026-04-20");
    await page.getByRole("button", { name: "Record a tenancy", exact: true }).click();
    await expect(page.getByText(/This plot already has a tenancy then\./)).toBeVisible();
    await expect(page.getByLabel("Plot holder", { exact: true })).toHaveValue("Dup Holder");
    await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
    await expect(cards).toHaveCount(3);
  });
});

test.describe("a season, its fees and a handover", () => {
  test("sets up a season, charges once, takes payments to nothing due, reverses one, and keeps an old balance with its holder", async ({ page }) => {
    test.setTimeout(240_000);
    const requests = trackRequests(page, APP);
    await openBeds(page);
    await giveB03ToTavi(page);

    // Season setup. The fee is whole pence, and a new season is the one to charge.
    await page.getByRole("link", { name: "Season fees" }).first().click();
    await page.getByRole("link", { name: "New season", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "New season" })).toBeVisible();
    await page.getByLabel("Season name", { exact: true }).fill("Season 2026");
    await page.getByLabel("Start date", { exact: true }).fill("2026-04-01");
    await page.getByLabel("End date", { exact: true }).fill("2027-04-01");
    await page.getByLabel("Due date", { exact: true }).fill("2026-06-30");
    await page.getByLabel("Standard fee", { exact: true }).fill("36.00");
    await check(page, "season");
    await page.getByRole("button", { name: "New season", exact: true }).click();
    await expect(page.getByText("Season saved. Saved on this device.")).toBeVisible();

    await page.getByLabel("Select tenancies: B03 · Tavi Bramblequill", { exact: true }).check();
    await page.getByRole("button", { name: "Preview charges" }).click();
    const preview = page.getByRole("region", { name: "Charges to apply" });
    await expect(preview).toContainText(`B03 · ${TAVI}: GBP 36.00`);
    await page.getByRole("button", { name: "Apply charges" }).click();
    await expect(page.getByText("Charges applied. 1 charged. Saved on this device.").first()).toBeVisible();
    // A second charge for the same tenancy and season cannot be made from here.
    await expect(page.getByText(`B03 · ${TAVI}: already charged this season.`)).toBeVisible();
    await expect(page.getByLabel("Select tenancies: B03 · Tavi Bramblequill", { exact: true })).toHaveCount(0);

    // Payments. 12.00 leaves 24.00. 24.01 is refused and the input stays. 24.00 settles it.
    await page.getByRole("link", { name: "Season fees" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Season fees" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Season 2026 · B03 · ${TAVI}` }) });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("GBP 36.00");
    await check(page, "payments");
    const amount = card.getByLabel("Amount received", { exact: true });
    await amount.fill("12.00");
    await card.getByLabel("Receipt reference", { exact: true }).fill(RECEIPT_REF);
    await card.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(card.getByText("GBP 12.00 recorded. GBP 24.00 still due.")).toBeVisible();
    await expect(card.getByRole("button", { name: /^Reverse payment:/ })).toHaveCount(1);

    await amount.fill("24.01");
    await card.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(card.getByText("Amount exceeds the balance of GBP 24.00.")).toBeVisible();
    await expect(amount).toHaveValue("24.01");
    await expect(amount).toBeFocused();
    await expect(card.getByRole("button", { name: /^Reverse payment:/ })).toHaveCount(1);
    await expect(card.locator(".facts")).toContainText("GBP 24.00");

    await amount.fill("24.00");
    await card.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(card.getByText("Paid in full.")).toBeVisible();
    await expect(card.locator(".badge")).toHaveText("Paid");
    await expect(card.locator(".facts")).toContainText("GBP 0.00");
    await expect(card.getByLabel("Amount received", { exact: true })).toHaveCount(0);

    // Reverse the last payment with a reason. The balance returns, and the same amount can be entered again.
    await card.getByRole("button", { name: "Reverse payment: 2026-04-20 · GBP 24.00" }).click();
    await card.getByLabel("Reason for the reversal: 2026-04-20 · GBP 24.00", { exact: true }).fill("Entered twice");
    await card.getByRole("button", { name: "Reverse payment", exact: true }).click();
    await expect(card.getByText("Payment reversed.").first()).toBeVisible();
    await expect(card.getByText("Reversed on 2026-04-20. Entered twice")).toBeVisible();
    await expect(card.locator(".badge")).toHaveText("Part paid");
    await card.getByLabel("Amount received", { exact: true }).fill("24.00");
    await card.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(card.getByText("Paid in full.")).toBeVisible();
    await expect(card.locator(".badge")).toHaveText("Paid");

    // The old season is still there with its own unpaid balance, now overdue.
    await page.getByRole("button", { name: "Show previous seasons" }).click();
    const old = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Season 2025 · B02 · Ada Stonecrop` }) });
    await expect(old).toHaveCount(1);
    await expect(old.locator(".badge")).toHaveText("Overdue");
    await expect(old.locator(".facts")).toContainText("GBP 30.00");
    await check(page, "payments-previous");

    // Handover on 1 May. The old balance of B02 stays with Ada. The new holder starts at nothing.
    await backToRegister(page);
    await page.getByRole("link", { name: "Current tenancies" }).first().click();
    await page.getByRole("link", { name: "Hand over plot: B02" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Hand over plot" })).toBeVisible();
    await page.getByLabel("Handover date", { exact: true }).fill("2026-05-01");
    await page.getByLabel("New holder", { exact: true }).fill(NEW_HOLDER);
    await check(page, "handover");
    await page.getByRole("button", { name: "Review handover" }).click();
    await expect(page.getByRole("region", { name: "Review handover" })).toContainText("B02 passes from Ada Stonecrop to Hale Pennywort on 2026-05-01. The old balance of GBP 30.00 stays with Ada Stonecrop.");
    await page.getByRole("button", { name: "Confirm handover" }).click();
    await expect(page.getByText("B02 handed over to Hale Pennywort. The old balance stays with Ada Stonecrop. Saved on this device.")).toBeVisible();

    // The season report as at the day after. Both seasons, the handover, the two balances kept apart.
    await page.getByRole("link", { name: "Current tenancies" }).first().click();
    await backToRegister(page);
    await page.getByRole("link", { name: "Reports" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Season report" })).toBeVisible();
    await page.getByLabel("Season", { exact: true }).selectOption({ label: "Season 2025" });
    await page.getByLabel("As at", { exact: true }).fill("2026-05-02");
    await expect(page.getByRole("heading", { level: 2, name: "Plot handovers" })).toBeVisible();
    const report = page.locator("main");
    await expect(report).toContainText("Ada Stonecrop");
    await expect(report).toContainText("Hale Pennywort");
    await expect(report).toContainText("GBP 30.00");
    await check(page, "report");
    await page.getByLabel("Season", { exact: true }).selectOption({ label: "Season 2026" });
    await expect(report).toContainText(TAVI);
    await expect(report).toContainText("GBP 36.00");
    await expect(report).not.toContainText("GBP 30.00");

    // The private print document and CSV hold names and money. They are for the secretary only.
    await page.getByRole("button", { name: "Print private report" }).click();
    const printed = await page.locator("iframe[data-print-frame]").first().getAttribute("srcdoc");
    expect(printed).toContain(TAVI);
    expect(printed).toContain("GBP 36.00");
    expect(printed).not.toContain("<script");
    await expect(page.getByText("Print preview is ready.")).toBeVisible();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download private CSV" }).click()]);
    expect(csv.suggestedFilename()).toBe("private-season-report-2026-05-02.csv");
    expect(requests.external).toEqual([]);
  });
});

test.describe("the availability map and the seeker file", () => {
  test("chooses free plots, previews, downloads, and opens the file offline with no name, amount or contact in it", async ({ page, browser }, testInfo) => {
    test.setTimeout(180_000);
    const requests = trackRequests(page, APP);
    await openBeds(page);
    await page.getByRole("link", { name: "Make an availability map" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Availability map" })).toBeVisible();
    await expect(page.getByLabel("Public site name", { exact: true })).toHaveValue("Thimble Beds");
    await expect(page.getByLabel("Public gate name", { exact: true })).toHaveValue("Thimble Gate");
    await expect(page.getByLabel("Visitor instructions", { exact: true })).toHaveValue(INSTRUCTIONS);
    await expect(page.getByLabel("List this plot: B03 · Sunny Row", { exact: true })).toBeChecked();
    await expect(page.getByLabel("List this plot: B05 · Shady Row", { exact: true })).toBeChecked();
    // Only free plots can be listed. A taken plot has no checkbox at all.
    await expect(page.getByLabel(/^List this plot: B0[1246]/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save public details" })).toBeDisabled();
    await check(page, "seeker");

    await page.getByRole("button", { name: "Preview as a visitor", exact: true }).click();
    const preview = page.locator(".preview-frame");
    await expect(preview).toContainText("B03 · Sunny Row · Will appear");
    await expect(preview).toContainText("B05 · Shady Row · Will appear");
    await expect(preview).toContainText("Left out");
    for (const secret of [...TENANTS, TAVI, OLIN]) await expect(preview).not.toContainText(secret);
    await check(page, "seeker-preview");

    // Change the choice. The old preview is stale and cannot be downloaded.
    await page.getByLabel("List this plot: B05 · Shady Row", { exact: true }).uncheck();
    await expect(page.getByText("Save public details first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview as a visitor", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Save public details" }).click();
    await expect(page.getByText("Public details saved. Saved on this device.")).toBeVisible();
    await expect(page.getByText("Review public details again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download availability copy" })).toBeDisabled();
    await page.getByRole("button", { name: "Preview as a visitor", exact: true }).click();
    await expect(preview).not.toContainText("B05 · Shady Row · Will appear");
    await expect(page.getByRole("button", { name: "Download availability copy" })).toBeEnabled();

    // The print document is its own page, built from the visitor object only.
    await page.getByRole("button", { name: "Print availability map" }).click();
    const printed = await page.locator("iframe[data-print-frame]").first().getAttribute("srcdoc");
    expect(printed).toContain("Thimble Gate");
    expect(printed).toContain("B03");
    expect(printed).not.toContain("<script");
    for (const secret of AVAILABILITY_CANARIES) expect(printed, secret).not.toContain(secret);
    await expect(page.getByText("Print preview is ready.")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download availability copy" }).click()]);
    expect(download.suggestedFilename()).toBe("availability-map-2026-04-20.html");
    await expect(page.getByText(/Your copy is ready\. Anyone you give this file to can keep it/)).toBeVisible();
    const saved = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    const bytes = readFileSync(saved, "utf8");
    for (const secret of [...AVAILABILITY_CANARIES, ...CONTACTS, "Wren", "Bramble", "Stonecrop"]) expect(bytes, secret).not.toContain(secret);
    for (const code of ["B01", "B02", "B04", "B05", "B06"]) expect(bytes, code).not.toContain(code);
    expect(requests.external).toEqual([]);

    // A fresh page, no network, no register: the seeker finds the free plot, the gate and the way to ask.
    const size = page.viewportSize() ?? { width: 360, height: 640 };
    const seeker = await browser.newContext({ viewport: size, offline: true });
    const seen: string[] = [];
    const file = await seeker.newPage();
    file.on("request", (r) => seen.push(r.url()));
    await file.goto(pathToFileURL(saved).href);
    await expect(file.getByRole("heading", { level: 1, name: "Thimble Beds" })).toBeVisible();
    await expect(file.getByText("As at 2026-04-20").first()).toBeVisible();
    await expect(file.getByRole("heading", { level: 2, name: "Available plots", exact: true })).toBeVisible();
    await expect(file.getByText(INSTRUCTIONS).first()).toBeVisible();
    await expect(file.getByText("Thimble Gate").first()).toBeVisible();
    await expect(file.getByText("Ask the secretary about this plot")).toBeVisible();
    const items = file.locator("#list li");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("B03");
    await expect(items.first()).toContainText("Sunny Row");
    // One section is listed, so there is nothing to choose between and the choice is not offered.
    await expect(file.getByLabel("Choose section", { exact: true })).toHaveCount(0);
    await file.getByRole("button", { name: "Show location" }).click();
    await expect(file.locator("#selcode")).toHaveText("B03");
    await check(file, "seeker-file");
    expect(await file.evaluate(() => document.querySelectorAll("form, img, link, iframe, input").length)).toBe(0);
    const pageText = await file.content();
    for (const secret of AVAILABILITY_CANARIES) expect(pageText, secret).not.toContain(secret);
    const block = await file.locator("#plot-availability").textContent();
    expect(block).not.toBeNull();
    expect(seen.filter((u) => !u.startsWith("file:") && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
    await seeker.close();

    // With script off the list is plain text that browser Find can reach.
    const plain = await browser.newContext({ viewport: size, javaScriptEnabled: false, offline: true });
    const noScript = await plain.newPage();
    await noScript.goto(pathToFileURL(saved).href);
    await expect(noScript.getByText("B03").first()).toBeVisible();
    await expect(noScript.getByText("Thimble Gate").first()).toBeVisible();
    await expect(noScript.getByRole("button", { name: "Show location" })).toBeHidden();
    await plain.close();
  });
});

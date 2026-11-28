// Churchyard Register in a real browser, at 360 by 640 and at 1920 by 1080 (spec 03, task 3.14).
// A warden opens Lantern Fold, finds a burial, records one from a reservation, flags an inscription, chooses what a
// family may see, downloads the family copy, and opens that file in a fresh page with the network off. The file is
// scanned for every privacy canary. Every screen visited is measured for edge, gap, target, text and contrast.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { CONTACT, INSCRIPTION_WORD, LIVING_HOLDERS, OTHER_OCCUPANT, PAGE_IMAGE_FILENAME, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { restPointer, siteIdOf, storedEvents } from "../helpers/routes";
import { expectNoNameInAddress, expectSearchOutOfAddress } from "../helpers/screens";

const APP = "http://127.0.0.1:4176/";
test.use({ baseURL: APP });

const SHOTS = "docs/acceptance/layout/churchyard";
const DIRECTIONS = "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.";

const sizeOf = (page: Page): string => ((page.viewportSize()?.width ?? 0) < 600 ? "phone" : "desktop");

/** Measure the screen on view, and keep one small proof picture of it. */
async function check(page: Page, name?: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
  if (name !== undefined) {
    await restPointer(page);
    await page.screenshot({ path: `${SHOTS}/${name}-${sizeOf(page)}.png`, type: "png" });
  }
}

async function openFold(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Lantern Fold" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
}

async function find(page: Page, text: string): Promise<void> {
  await page.getByLabel("Name or plot code", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test.describe("the first view", () => {
  test("names who it is for, has Start a register as the one main action, and keeps the sky strip clear of words", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Churchyard Register" })).toBeVisible();
    await expect(page.getByText("Find a burial or start your register.")).toBeVisible();
    await expect(page.getByText("For the volunteer who keeps a churchyard's burial records. Records stay on this device.")).toBeVisible();
    await expect(page.getByText("No registers on this device.")).toBeVisible();

    // With no register of its own, Start a register is the one main action, above the fold. The practice register is plain.
    const main = page.getByRole("link", { name: "Start a register" });
    await expect(main).toBeVisible();
    await expect(main).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);
    const box = await main.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
    const practice = page.getByRole("button", { name: "Open Lantern Fold" });
    await expect(practice).toBeVisible();
    await expect(practice).not.toHaveClass(/primary/);
    await expect(practice).toHaveClass(/quiet/);
    await expect(page.getByRole("link", { name: "Restore backup" })).toBeVisible();
    // Restart walkthrough is offered only after the walkthrough was started.
    await expect(page.getByRole("button", { name: "Restart walkthrough" })).toHaveCount(0);

    // The lantern and the mist sit in their own strip above the title, never over a word or a control.
    const strip = await page.evaluate(() => {
      const header = document.querySelector("header.app") as HTMLElement;
      const mist = header.querySelector(".mist") as HTMLElement;
      const brand = header.querySelector(".brand") as HTMLElement;
      const nav = header.querySelector("nav") as HTMLElement;
      const m = mist.getBoundingClientRect();
      return {
        mistBottom: m.bottom,
        brandShown: getComputedStyle(brand).display !== "none",
        brandTop: brand.getBoundingClientRect().top,
        navTop: nav.getBoundingClientRect().top,
        headerHeight: header.getBoundingClientRect().height,
        mistEvents: getComputedStyle(mist).pointerEvents,
        sky: getComputedStyle(header, "::before").backgroundColor,
        ink: getComputedStyle(document.documentElement).color,
        ground: getComputedStyle(document.body).backgroundColor,
        sheet: getComputedStyle(document.querySelector("main") as HTMLElement).backgroundColor,
      };
    });
    if (sizeOf(page) === "phone") {
      // A compact header: one row of menu, and the app name once, as the title of the page.
      expect(strip.brandShown).toBe(false);
      expect(strip.headerHeight).toBeLessThanOrEqual(130);
      await expect(page.getByText("Churchyard Register", { exact: true }).filter({ visible: true })).toHaveCount(1);
    } else {
      expect(strip.brandShown).toBe(true);
      expect(strip.mistBottom).toBeLessThanOrEqual(strip.brandTop);
      expect(strip.brandTop).toBeLessThan(strip.navTop);
    }
    expect(strip.mistEvents).toBe("none");
    expect(strip.sky).toBe("rgb(35, 42, 92)");
    expect(strip.ink).toBe("rgb(34, 37, 44)");
    // The page stands on the night, and the library lies on one stone sheet (spec 07, L7.6).
    expect(strip.ground).toBe("rgb(35, 42, 92)");
    expect(strip.sheet).toBe("rgb(255, 254, 248)");
    await check(page, "library");
    expect(requests.external).toEqual([]);
  });

  test("offers Restart walkthrough once the walkthrough was started, and Start a register stays plain beside the register", async ({ page }) => {
    await openFold(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Restart walkthrough" })).toBeVisible();
    // The practice register is not one of the keeper's own, so Start a register is still the one main action.
    await expect(page.getByRole("link", { name: "Start a register" })).toHaveClass(/primary/);
    expect(await page.locator(".button.primary").count()).toBe(1);
    await check(page);
  });
});

test.describe("the desk", () => {
  test("finds Quillmoss, shows the plot beside the map, and keeps the search when Back is pressed", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openFold(page);
    await expect(page.getByText("Find a burial or start your register.")).toHaveCount(0);
    await find(page, "Quillmoss");

    const card = page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07 · Yew Walk" });
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("link", { name: "Open burial" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Show on map" })).toBeVisible();
    await expect(page.locator(".summary-line")).toContainText("Y07 · Yew Walk · Taken");

    // Search, selected plot and map: side by side on a wide screen, one under the other on a phone.
    const search = await page.getByLabel("Name or plot code", { exact: true }).boundingBox();
    const map = await page.getByRole("img", { name: /Site map/ }).boundingBox();
    expect(search && map).toBeTruthy();
    if (sizeOf(page) === "desktop") expect((map?.x ?? 0) >= (search?.x ?? 0) + (search?.width ?? 0)).toBe(true);
    else expect((map?.y ?? 0) > (search?.y ?? 0) + (search?.height ?? 0)).toBe(true);

    // The key sits directly below the sheet and holds the four states with their words.
    const key = page.getByRole("list", { name: "Map key" });
    for (const word of ["Free", "Reserved", "Taken", "Unusable", "Needs checking"]) await expect(key.getByText(word, { exact: true })).toBeVisible();
    const sheetBox = await page.getByRole("img", { name: /Site map/ }).boundingBox();
    const keyBox = await key.boundingBox();
    const gap = (keyBox?.y ?? 0) - ((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0));
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(48);

    // The selected plot has a double outline and its code on a paper tab. Headstones are arches.
    expect(await page.locator("svg.sheet .plot-selected-outer").count()).toBe(1);
    expect(await page.locator("svg.sheet .plot-selected-inner").count()).toBe(1);
    expect(await page.locator("svg.sheet .tab-text").textContent()).toBe("Y07");
    expect(await page.locator("svg.sheet path.plot").count()).toBeGreaterThanOrEqual(12);
    expect(await page.locator("svg.sheet .path-line").count()).toBe(1);
    await expect(page.locator("svg.sheet text", { hasText: "Yew Walk" }).first()).toBeVisible();
    await expect(page.locator("svg.sheet text", { hasText: "Main gate" })).toBeVisible();
    await check(page, "desk");

    // Open the burial, then press Back: the search is still there.
    await card.getByRole("link", { name: "Open burial" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Quillmoss");
    await expect(card).toHaveCount(1);
    expect(requests.external).toEqual([]);
  });

  test("keeps the searched name out of the address, and Back and a reload still find it (R22.2)", async ({ page }) => {
    await openFold(page);
    const home = await page.evaluate(() => location.hash);
    await find(page, "Quillmoss");
    const card = page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07 · Yew Walk" });
    await expect(card).toHaveCount(1);
    await expectSearchOutOfAddress(page, "Quillmoss");

    // Show on map puts only the plot in the address. The search is still behind Back to results.
    await card.getByRole("link", { name: "Show on map" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Selected plot" })).toBeFocused();
    await expect(page.locator(".summary-line")).toContainText("Y07");
    await expectSearchOutOfAddress(page, "Quillmoss");
    await page.getByRole("button", { name: "Back to results" }).click();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Quillmoss");

    // A reload keeps the search, from the history entry and not from the address.
    await page.reload();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Quillmoss");
    await expect(card).toHaveCount(1);
    await expectSearchOutOfAddress(page, "Quillmoss");

    // An address that carries a search is not read as one.
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByText("Search for a name or code.")).toBeVisible();
    await page.evaluate((hash) => {
      window.location.hash = `${hash}?q=Quillmoss`;
    }, home);
    await expect(page.getByText("Search for a name or code.")).toBeVisible();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("");
  });

  test("Show on map selects the plot and moves focus to its heading, with Back to results", async ({ page }) => {
    await openFold(page);
    await find(page, "Y04");
    const first = page.getByRole("listitem").filter({ hasText: "Y04" }).first();
    await first.getByRole("link", { name: "Show on map" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Selected plot" })).toBeFocused();
    await expect(page.locator(".summary-line")).toContainText("Y04");
    await page.getByRole("button", { name: "Back to results" }).click();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Y04");
  });

  test("says when nothing matches, and clears the search", async ({ page }) => {
    await openFold(page);
    await find(page, "Zzyzx");
    await expect(page.getByText("No matches for Zzyzx.")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByText("Search for a name or code.")).toBeVisible();
  });
});

test.describe("the first search and the groups of links", () => {
  test("a practice register offers one example button, and pressing it searches and shows Mirel Quillmoss · Y07 · Yew Walk", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openFold(page);
    const example = page.getByRole("button", { name: "Try Quillmoss", exact: true });
    await expect(example).toHaveCount(1);
    await expect(example).toBeVisible();
    // The one example button, and no other button that starts with Try.
    await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(1);
    // It sits beside the search button, under the box that it fills.
    const [field, button] = [await page.getByLabel("Name or plot code", { exact: true }).boundingBox(), await example.boundingBox()];
    expect((button?.y ?? 0) > (field?.y ?? 0)).toBe(true);
    await check(page, "desk-example");

    await example.click();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toHaveValue("Quillmoss");
    const card = page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07 · Yew Walk" });
    await expect(card).toHaveCount(1);
    await expect(page.locator(".summary-line")).toContainText("Y07 · Yew Walk · Taken");
    // The name stays in the history entry and out of the address, as for a typed search.
    await expectSearchOutOfAddress(page, "Quillmoss");
    await check(page);
    expect(requests.external).toEqual([]);
  });

  test("a register the keeper started never shows the example button", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start a register" }).click();
    await page.getByLabel("Site name").fill("St Edda");
    await page.getByLabel("Local time zone").selectOption("Europe/London");
    await page.getByRole("button", { name: "Create register" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "St Edda" })).toBeVisible();
    await expect(page.getByLabel("Name or plot code", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(0);
    await expect(page.getByText("Quillmoss")).toHaveCount(0);
    await check(page, "desk-own");
  });

  test("puts the links of the desk in three named groups, Records, Share and Site, and every landmark has its own name", async ({ page }) => {
    await openFold(page);
    const groups = [
      { name: "Records", links: ["Record a burial", "Reserve a space", "Unplaced burials · 1", "Add records"] },
      { name: "Share", links: ["Make a family map", "Reports", "Committee review"] },
      { name: "Site", links: ["Map", "Plot list", "Back up"] },
    ];
    const main = page.locator("main");
    for (const group of groups) {
      const nav = main.getByRole("navigation", { name: group.name, exact: true });
      await expect(nav, group.name).toHaveCount(1);
      await expect(nav.getByRole("heading", { level: 2, name: group.name, exact: true })).toBeVisible();
      expect(await nav.getByRole("link").allInnerTexts(), group.name).toEqual(group.links);
    }
    // Nothing else on the desk is a link in a landmark of its own, and no two landmarks share a name.
    const names = await page.evaluate(() => [...document.querySelectorAll("nav")].map((n) => n.getAttribute("aria-label") ?? document.getElementById(n.getAttribute("aria-labelledby") ?? "")?.textContent ?? ""));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(["Records", "Share", "Site"]));
    await check(page, "desk-groups");
  });
});

test.describe("a burial and its stone", () => {
  test("shows the record at its precision, the inscription with its line breaks, and the history", async ({ page }) => {
    await openFold(page);
    await find(page, "Quillmoss");
    await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" }).getByRole("link", { name: "Open burial" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeVisible();
    const record = page.locator("dl").first();
    await expect(record).toContainText("2 June 1889");
    await expect(record).toContainText("LF-07A");
    await expect(record).toContainText("Yew Walk");
    const reading = await page.locator("p.inscription").first().innerText();
    expect(reading.split("\n")).toEqual(["IN LOVING MEMORY", "MIREL QUILLMOSS", "OF HOLLOWMERE", "KEEPER OF THE LANTERN FOLD", "REST IN PEACE"]);
    await expect(page.getByText("Marked for another reading.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "History of this burial" })).toBeVisible();
    await expect(page.getByText(/Burial recorded/).first()).toBeVisible();
    await check(page, "burial");
  });

  test("flags an inscription, keeps the mark after a reload, and clears it with Review reading", async ({ page }) => {
    await openFold(page);
    await find(page, "Ysolde");
    await page.getByRole("link", { name: "Open burial" }).first().click();
    await expect(page.getByText("No reading yet.")).toBeVisible();
    await page.getByRole("textbox", { name: "Words on stone" }).fill("HERE LIES\nYSOLDE\nFENWICK");
    await page.getByLabel("Unclear letters").check();
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page.getByText("Reading saved. Saved on this device.")).toBeVisible();
    await expect(page.getByText("Marked for another reading.")).toBeVisible();
    expect((await page.locator("p.inscription").first().innerText()).split("\n")).toEqual(["HERE LIES", "YSOLDE", "FENWICK"]);

    await page.reload();
    await expect(page.getByText("Marked for another reading.")).toBeVisible();
    await page.getByRole("button", { name: "Review reading" }).click();
    await expect(page.getByText("Reading checked. Saved on this device.")).toBeVisible();
    await expect(page.getByText("Marked for another reading.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review reading" })).toHaveCount(0);
  });

  test("corrects a name only with a reason and a source, and keeps the first entry in history", async ({ page }) => {
    await openFold(page);
    await find(page, "Harlan");
    await page.getByRole("link", { name: "Open burial" }).first().click();
    const form = page.getByRole("heading", { level: 2, name: "Correct an entry" });
    await expect(form).toBeVisible();
    await page.getByLabel("Recorded name", { exact: true }).fill("Harlan Mossgrove Sr");
    await page.getByRole("button", { name: "Record correction" }).click();
    // Nothing is saved without a source ref and a reason, and focus goes to the first field that needs one.
    await expect(page.getByText("Enter Source ref.")).toBeVisible();
    await expect(page.getByLabel("Source ref of the correction")).toBeFocused();
    await page.getByLabel("Source ref of the correction").fill("LF page 4");
    await page.getByLabel("Reason for correction").fill("The stone says Sr");
    await page.getByRole("button", { name: "Record correction" }).click();
    await expect(page.getByText("Correction saved. Saved on this device.")).toBeVisible();
    await expect(page.locator("dl").first()).toContainText("Harlan Mossgrove Sr");
    await expect(page.getByText(/Burial recorded/)).toBeVisible();
    await expect(page.getByText(/Burial corrected/)).toBeVisible();
  });
});

test.describe("a burial from a reservation", () => {
  test("converts the reservation once, ignores a repeat press, and refuses a taken space with nothing saved", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openFold(page);
    await page.getByRole("link", { name: "Reserve a space" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reserve a space" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: "Y11, space 1 is reserved." });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Wren Ashgrove");
    await check(page, "reserve");

    await card.getByRole("link", { name: "Record burial in this space" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Record burial in this space" })).toBeVisible();
    await expect(page.getByText("Y11, space 1 is reserved.")).toBeVisible();

    // An empty name is refused, nothing is saved, and focus goes to the name.
    await page.getByRole("button", { name: "Record burial in this space" }).click();
    await expect(page.getByText("Enter Recorded name.")).toBeVisible();
    await expect(page.getByLabel("Recorded name", { exact: true })).toBeFocused();

    await page.getByLabel("Recorded name", { exact: true }).fill("Sorrel Hartwick");
    await page.getByLabel("Exact date").check();
    await page.getByLabel("Burial date", { exact: true }).fill("2026-04-02");
    await page.getByLabel("Source ref", { exact: true }).fill("LF-20");
    await check(page, "record");
    await page.getByRole("button", { name: "Record burial in this space" }).dblclick();
    await expect(page.getByText("Burial recorded at Y11. Saved on this device.")).toBeVisible();

    // One burial, and the reservation is used. The holder is not in the burial.
    await page.getByRole("link", { name: "Back to register" }).click();
    await find(page, "Hartwick");
    await expect(page.getByText("1 found")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Sorrel Hartwick" }).first()).not.toContainText("Wren Ashgrove");
    await page.getByRole("link", { name: "Reserve a space" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Y11, space 1 is reserved." })).toContainText("Used for a burial.");

    // A burial in a taken space is refused. The register is as it was.
    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Record a burial" }).first().click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Dup Person");
    await page.getByLabel("Plot", { exact: true }).selectOption({ label: "Y01 · Yew Walk" });
    await page.getByLabel("Source ref", { exact: true }).fill("LF-21");
    await page.getByRole("button", { name: "Save burial" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This plot is already taken." })).toBeVisible();
    await expect(page.getByLabel("Recorded name", { exact: true })).toHaveValue("Dup Person");
    await page.getByRole("link", { name: "Back to register" }).click();
    await find(page, "Dup Person");
    await expect(page.getByText("No matches for Dup Person.")).toBeVisible();
    await find(page, "Y01");
    await expect(page.getByRole("listitem").filter({ hasText: "Edda Thornwick" })).toHaveCount(1);
    expect(requests.external).toEqual([]);
  });

  test("keeps a name entered without a plot as 'Location to confirm', and places it later in an exact space", async ({ page }) => {
    await openFold(page);
    await page.getByRole("link", { name: "Record a burial" }).first().click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Odo Hallowby");
    await page.getByLabel("Year only").check();
    await page.getByLabel("Burial date", { exact: true }).fill("1802");
    await page.getByLabel("Source ref", { exact: true }).fill("LF-H2");
    await page.getByRole("button", { name: "Save burial" }).click();
    await expect(page.getByText("Burial saved. Location to confirm. Saved on this device.")).toBeVisible();

    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: /Unplaced burials · 2/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Burials with no plot" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "Odo Hallowby" });
    await expect(row).toContainText("1802");
    await check(page, "unplaced");
    await row.getByLabel("Plot", { exact: true }).selectOption({ label: "Y08 · Yew Walk" });
    await row.getByRole("button", { name: "Confirm placement" }).click();
    await expect(page.getByText("Odo Hallowby placed at Y08. Saved on this device.")).toBeVisible();
  });
});

test.describe("the family map, the file and the visitor", () => {
  test("approves one name, previews, downloads, and opens the file offline with no private word in it", async ({ page, browser }, testInfo) => {
    const requests = trackRequests(page, APP);
    await openFold(page);
    await page.getByRole("link", { name: "Make a family map" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Family map" })).toBeVisible();
    await expect(page.getByLabel("Include this burial: Mirel Quillmoss · Y07")).toBeChecked();
    await expect(page.getByLabel("Include this burial: Torin Pellwick · Y07")).not.toBeChecked();
    await check(page, "family");

    // Choose a second name and its year, save, and see it in the preview.
    await page.getByLabel("Include this burial: Ysolde Fenwick · Y06").check();
    await page.getByLabel("Include year: Ysolde Fenwick").check();
    await page.getByRole("button", { name: "Save public details" }).click();
    await expect(page.getByText("Public details saved. Saved on this device.")).toBeVisible();
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    const preview = page.locator(".preview-frame");
    await expect(preview).toContainText("Mirel Quillmoss");
    await expect(preview).toContainText("Ysolde Fenwick · 1938");
    await expect(preview).toContainText("Y07: another burial in this plot is withheld.");
    await expect(preview).not.toContainText(OTHER_OCCUPANT);
    await expect(preview).toContainText("Living people: 2");
    await check(page, "family-preview");

    // Change the selection. The old preview is stale and cannot be downloaded.
    await page.getByLabel("Include this burial: Ysolde Fenwick · Y06").uncheck();
    await page.getByRole("button", { name: "Save public details" }).click();
    await expect(page.getByText("Public details saved. Saved on this device.")).toBeVisible();
    await expect(page.getByText("Review public details again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download family copy" })).toBeDisabled();
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    await expect(preview).not.toContainText("Ysolde");
    await expect(page.getByRole("button", { name: "Download family copy" })).toBeEnabled();

    // The print document is its own page, built from the visitor object only.
    await page.getByRole("button", { name: "Print family map" }).click();
    const printed = await page.locator("iframe[data-print-frame]").first().getAttribute("srcdoc");
    expect(printed).toContain("Mirel Quillmoss");
    expect(printed).toContain("Lantern Gate");
    expect(printed).not.toContain("<script");
    for (const secret of [...VISITOR_CANARIES, "LF-07A"]) expect(printed).not.toContain(secret);
    await expect(page.getByText("Print preview is ready.")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download family copy" }).click()]);
    expect(download.suggestedFilename()).toBe("family-map-2026-04-20.html");
    await expect(page.getByText(/Your copy is ready\. Anyone you give this file to can keep it/)).toBeVisible();
    const saved = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    const bytes = readFileSync(saved, "utf8");
    for (const secret of VISITOR_CANARIES) expect(bytes, secret).not.toContain(secret);
    for (const word of [OTHER_OCCUPANT, ...LIVING_HOLDERS, CONTACT, INSCRIPTION_WORD, PAGE_IMAGE_FILENAME, "LF-0", "Perrin", "Odo "]) expect(bytes, word).not.toContain(word);
    expect(requests.external).toEqual([]);

    // A fresh page, no network, no register: the visitor finds the name, the plot and the way in.
    const size = page.viewportSize() ?? { width: 360, height: 640 };
    const visitor = await browser.newContext({ viewport: size, offline: true });
    const seen: string[] = [];
    const file = await visitor.newPage();
    file.on("request", (r) => seen.push(r.url()));
    await file.goto(pathToFileURL(saved).href);
    await expect(file.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
    await expect(file.getByText("As at 2026-04-20").first()).toBeVisible();
    await expect(file.getByText(DIRECTIONS).first()).toBeVisible();
    await expect(file.getByText("Lantern Gate").first()).toBeVisible();
    await file.getByLabel("Name or plot code", { exact: true }).fill("quillmoss");
    await expect(file.getByRole("listitem").filter({ hasText: "Mirel Quillmoss" })).toBeVisible();
    await file.getByRole("button", { name: "Show location" }).click();
    await expect(file.locator(".plotg.on:visible")).toHaveCount(1);
    await expect(file.getByText("Selected plot: Y07")).toBeVisible();
    await check(file, "family-file");
    await file.getByLabel("Name or plot code", { exact: true }).fill("Torin");
    await expect(file.getByText("No published burial matches that search.")).toBeVisible();
    await file.getByRole("button", { name: "Clear" }).click();
    await expect(file.getByRole("listitem").filter({ hasText: "Mirel Quillmoss" })).toBeVisible();
    expect(await file.evaluate(() => document.querySelectorAll("form, img, link, iframe").length)).toBe(0);
    const pageText = await file.content();
    // The line to the burial agrees with the drawn map: Y07 is the first plot on the north side, by the gate.
    expect(pageText).toContain("First stone on the north side of the walk, by the gate.");
    expect(pageText).not.toContain("Seventh stone");
    for (const secret of VISITOR_CANARIES) expect(pageText, secret).not.toContain(secret);
    expect(seen.filter((u) => !u.startsWith("file:") && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
    await visitor.close();

    // With script off the list is plain text that browser Find can reach.
    const plain = await browser.newContext({ viewport: size, javaScriptEnabled: false, offline: true });
    const noScript = await plain.newPage();
    await noScript.goto(pathToFileURL(saved).href);
    await expect(noScript.getByText("Mirel Quillmoss").first()).toBeVisible();
    await expect(noScript.getByText("Y07").first()).toBeVisible();
    await expect(noScript.getByRole("button", { name: "Show location" })).toBeHidden();
    await plain.close();
  });

  test("a changed name is out of the file until the keeper approves it again", async ({ page }) => {
    await openFold(page);
    await find(page, "Quillmoss");
    await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" }).getByRole("link", { name: "Open burial" }).click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Mirel Quillmoss Jr");
    await page.getByLabel("Source ref of the correction").fill("LF page 7");
    await page.getByLabel("Reason for correction").fill("The stone says Jr");
    await page.getByRole("button", { name: "Record correction" }).click();
    await expect(page.getByText("Correction saved. Saved on this device.")).toBeVisible();

    await page.getByRole("link", { name: "Back to register" }).click();
    await page.getByRole("link", { name: "Make a family map" }).click();
    await expect(page.getByText("Review again").first()).toBeVisible();
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    await expect(page.locator(".preview-frame")).toContainText("No names selected. You can still share the site map.");
    await expect(page.locator(".preview-frame")).toContainText("review again before this name is shown");
  });

  test("says what is missing before a file is made: a register with no gate cannot make one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start a register" }).click();
    await page.getByLabel("Site name").fill("St Edda");
    await page.getByLabel("Local time zone").selectOption("Europe/London");
    await page.getByRole("button", { name: "Create register" }).click();
    await page.getByRole("link", { name: "Make a family map" }).click();
    await expect(page.getByText("Add a gate on the map first.").first()).toBeVisible();
    await page.getByRole("button", { name: "Preview as a visitor" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter the public site name." })).toBeVisible();
  });
});

test.describe("the private report", () => {
  test("counts by event date, lists the parts apart, downloads a CSV and builds a print document", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openFold(page);
    await page.getByRole("link", { name: "Reports" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Burial and reservation report" })).toBeVisible();
    await page.getByLabel("From", { exact: true }).fill("1880-01-01");
    await page.getByLabel("Through", { exact: true }).fill("1950-12-31");
    const totals = page.getByRole("list", { name: "Burial and reservation report" });
    await expect(totals).toContainText("Burials · 4");
    await expect(totals).toContainText("Date incomplete · 1");
    await expect(totals).toContainText("Reservations made · 0");
    await expect(totals).toContainText("Open spaces · 3");
    await expect(page.getByText("Through 1950-12-31")).toBeVisible();
    await expect(page.getByText(/As at 2026-04-20\. Uses current corrections\. Revision \d+\./)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Location to confirm" })).toBeVisible();
    await expect(page.getByText("Perrin Gladwyn")).toBeVisible();
    await check(page, "report");

    await page.getByLabel("From", { exact: true }).fill("2025-01-01");
    await page.getByLabel("Through", { exact: true }).fill("2025-08-31");
    await expect(totals).toContainText("Burials · 0");
    await expect(page.getByText("No events in this period.").first()).toBeVisible();

    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download private CSV" }).click()]);
    expect(csv.suggestedFilename()).toBe("private-report-2026-04-20.csv");
    const text = readFileSync(await csv.path(), "utf8");
    expect(text.startsWith("\uFEFFPart,Source ref,Name,Date,Plot,Space,Detail")).toBe(true);

    await page.getByRole("button", { name: "Print private report" }).click();
    const doc = await page.locator("iframe[data-print-frame]").first().getAttribute("srcdoc");
    expect(doc).toContain("Private register report");
    expect(doc).toContain("Through 2025-08-31");
    expect(doc).not.toContain("<script");
    expect(requests.external).toEqual([]);
  });
});

test.describe("motion, contrast and the practice register", () => {
  test("the mist drifts by default, stops for reduced motion at the device and in the app, and goes in high contrast", async ({ page, browser }) => {
    const mist = async (p: Page) =>
      p.evaluate(() => {
        const el = document.querySelector("header.app .mist") as HTMLElement;
        const s = getComputedStyle(el);
        return { name: s.animationName, display: s.display, duration: s.animationDuration };
      });
    await page.goto("/");
    const running = await mist(page);
    expect(running.name).toBe("fold-drift");
    expect(running.display).not.toBe("none");

    const size = page.viewportSize() ?? { width: 360, height: 640 };
    const calm = await browser.newContext({ viewport: size, reducedMotion: "reduce" });
    const quiet = await calm.newPage();
    await quiet.goto(APP);
    const stopped = await mist(quiet);
    expect(stopped.name === "none" || stopped.display === "none").toBe(true);
    await calm.close();

    // The app setting. Motion off and contrast high each stop the mist, and the setting wins.
    await page.getByRole("link", { name: "Settings" }).first().click();
    await page.getByLabel("Reduce motion").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    const reduced = await mist(page);
    expect(reduced.name === "none" || reduced.display === "none").toBe(true);
    await page.getByLabel("Follow device motion").check();
    await page.getByLabel("High", { exact: true }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    expect((await mist(page)).display).toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
    await check(page);
  });

  test("Lantern Fold never mixes with a register of the keeper's own, and restart touches only Lantern Fold", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start a register" }).click();
    await page.getByLabel("Site name").fill("St Edda");
    await page.getByLabel("Local time zone").selectOption("Europe/London");
    await page.getByRole("button", { name: "Create register" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "St Edda" })).toBeVisible();
    await expect(page.getByText("Start with your map or your first record.")).toBeVisible();
    await find(page, "Quillmoss");
    await expect(page.getByText("No matches for Quillmoss.")).toBeVisible();

    // A burial of the keeper's own, with no map: kept as 'Location to confirm', and counted.
    await page.getByRole("link", { name: "Record a burial" }).first().click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Wynn Aldous");
    await page.getByLabel("Source ref", { exact: true }).fill("EDDA-1");
    await page.getByRole("button", { name: "Save burial" }).click();
    await expect(page.getByText("Burial saved. Location to confirm. Saved on this device.")).toBeVisible();

    // Back in the library the own register is the only card. Lantern Fold is a practice register.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 3, name: "St Edda" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Lantern Fold" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open Lantern Fold" }).click();
    await find(page, "Wynn");
    await expect(page.getByText("No matches for Wynn.")).toBeVisible();
    await page.getByRole("link", { name: "Record a burial" }).first().click();
    await page.getByLabel("Recorded name", { exact: true }).fill("Practice Person");
    await page.getByLabel("Source ref", { exact: true }).fill("PRACTICE-1");
    await page.getByRole("button", { name: "Save burial" }).click();
    await expect(page.getByText(/Saved on this device\./)).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: "Restart walkthrough" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
    await find(page, "Practice Person");
    await expect(page.getByText("No matches for Practice Person.")).toBeVisible();
    await find(page, "Quillmoss");
    await expect(page.getByText("1 found")).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Open St Edda" }).click();
    await find(page, "Wynn");
    await expect(page.getByRole("listitem").filter({ hasText: "Wynn Aldous" })).toHaveCount(1);
  });
});

test("every map page of the keeper's own register shows the same plot a name search finds", async ({ page }) => {
  await openFold(page);
  await find(page, "Quillmoss");
  const href = await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" }).getByRole("link", { name: "Show on map" }).getAttribute("href");
  const open = await page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07" }).getByRole("link", { name: "Open burial" }).getAttribute("href");
  expect(href).toMatch(/plot=/);
  expect(open).toMatch(/burial\//);
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();

  // The map and its key come before the zoom controls, and the map is on view without scrolling far.
  const sheet = await page.locator("svg.sheet").first().boundingBox();
  const key = await page.getByRole("list", { name: "Map key" }).boundingBox();
  const zoomIn = await page.getByRole("button", { name: "Zoom in" }).boundingBox();
  expect(sheet && key && zoomIn).toBeTruthy();
  expect((key?.y ?? 0) >= (sheet?.y ?? 0) + (sheet?.height ?? 0)).toBe(true);
  // In the page the key comes before the zoom controls, on every screen. On a phone the controls are under the key. On a wide
  // screen they are in the side sheet, beside the map and its key (spec 07, L7.9).
  const keyFirst = await page.evaluate(() => {
    const keyEl = document.querySelector(".map-key") as Element;
    const zoomEl = [...document.querySelectorAll("button")].find((b) => b.textContent === "Zoom in") as Element;
    return (keyEl.compareDocumentPosition(zoomEl) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(keyFirst).toBe(true);
  if (sizeOf(page) === "phone") expect((zoomIn?.y ?? 0) >= (key?.y ?? 0) + (key?.height ?? 0)).toBe(true);
  else expect((zoomIn?.x ?? 0) >= (sheet?.x ?? 0) + (sheet?.width ?? 0)).toBe(true);
  if (sizeOf(page) === "phone") expect(sheet?.y ?? 9999).toBeLessThanOrEqual(360);
  // The plot chooser never shows a blank choice, and a zoom that cannot act is unavailable to the keyboard and the reader.
  expect(await page.getByLabel("Choose a plot", { exact: true }).evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent)).toBe("No plot chosen");
  await expect(page.getByText("Zoom 100 percent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Fit site" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("Zoom 150 percent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeEnabled();
  await page.getByRole("button", { name: "Fit site" }).click();
  await expect(page.getByText("Zoom 100 percent")).toBeVisible();
  await check(page, "map");
});

test.describe("the site as it was", () => {
  // Hand totals 1 and 4: Y07 holds a burial of 2 June 1889 and one of 1921. Y01 is of 1871, Y05 has no date, Y04 is
  // March 1902, Y06 is 1938 and Y09 is 1955. Today the practice register reads 2026-04-20 with six taken plots.
  const NAMES = ["Quillmoss", "Mirel", "Pellwick", "Torin", "Thornwick", "Edda", "Ashgrove", "Wren"];
  const Y07_TODAY = "Y07 · Yew Walk · Taken · 2 of 2 spaces used";
  const Y07_1900 = "Y07 · Yew Walk · Taken · 1 of 2 spaces used";

  test("redraws the map as at a past date, keeps today's forms, saves nothing and keeps names out of the address", async ({ page }) => {
    const requests = trackRequests(page, APP);
    await openFold(page);
    const siteId = siteIdOf(page);
    const eventsBefore = (await storedEvents(page, siteId)).length;
    await page.getByRole("link", { name: "Map", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();

    // The field starts at today. No heading and no button show for today.
    const field = page.getByLabel("Show the site as at", { exact: true });
    await expect(field).toHaveValue("2026-04-20");
    await expect(page.getByRole("heading", { level: 2, name: /^As at / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to today" })).toHaveCount(0);
    await page.getByLabel("Choose a plot", { exact: true }).selectOption({ label: Y07_TODAY });
    const selected = page.getByRole("region", { name: "Selected plot" });
    await expect(selected).toContainText(Y07_TODAY);
    const solid = page.locator("svg.sheet circle.mark.solid");
    const cross = page.locator("svg.sheet g.mark");
    await expect(solid).toHaveCount(6);
    await expect(cross).toHaveCount(1);

    // 1900-01-01: the burial of 1889 stands, the burial of 1921 does not, and Y12 was not yet unusable.
    await field.fill("1900-01-01");
    await expect(page.getByRole("heading", { level: 2, name: "As at 1900-01-01" })).toBeVisible();
    await expect(selected).toContainText(Y07_1900);
    await expect(solid).toHaveCount(3);
    await expect(cross).toHaveCount(0);
    await expect(field).toHaveValue("1900-01-01");
    await expect(page.getByRole("button", { name: "Back to today" })).toBeVisible();
    expect(page.url()).toContain("asAt=1900-01-01");
    await expectNoNameInAddress(page, NAMES);
    await check(page, "map-as-at");

    // Every link to a form or a record reads today. Nothing was saved.
    for (const name of ["Open plot", "Edit map"]) await expect(page.getByRole("link", { name, exact: true }).first()).not.toHaveAttribute("href", /asAt/);
    expect((await storedEvents(page, siteId)).length).toBe(eventsBefore);

    // A burial of a year counts from the first day of that year.
    await field.fill("1870-12-31");
    await expect(page.getByRole("heading", { level: 2, name: "As at 1870-12-31" })).toBeVisible();
    await expect(selected).toContainText("Y07 · Yew Walk · Free · 0 of 2 spaces used");
    await expect(solid).toHaveCount(1);
    await field.fill("1871-01-01");
    await expect(solid).toHaveCount(2);

    // A later day and a text that is not a date change nothing, and focus stays on the field.
    await field.fill("2026-04-21");
    await expect(page.getByText("Choose today or an earlier date.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name: "As at 1871-01-01" })).toBeVisible();
    await expect(solid).toHaveCount(2);
    await field.fill("last week");
    await field.press("Enter");
    await expect(page.getByText("Use a valid date.")).toBeVisible();
    await expect(field).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name: "As at 1871-01-01" })).toBeVisible();

    // Back returns to the earlier view date.
    await field.fill("1900-01-01");
    await expect(solid).toHaveCount(3);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 2, name: "As at 1871-01-01" })).toBeVisible();
    await expect(field).toHaveValue("1871-01-01");
    await page.goForward();
    await expect(field).toHaveValue("1900-01-01");

    // The plot list holds the same date, filters and links keep it, and a row reads as it did then.
    await page.getByRole("link", { name: "Open plot list" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plot list" })).toBeVisible();
    await expect(field).toHaveValue("1900-01-01");
    await expect(page.getByRole("heading", { level: 2, name: "As at 1900-01-01" })).toBeVisible();
    const rows = page.locator("ul.cards > li");
    await expect(rows.filter({ hasText: "Y07 · Yew Walk" })).toContainText(Y07_1900);
    await expect(rows.filter({ hasText: "Y04 · Yew Walk" })).toContainText("Y04 · Yew Walk · Free");
    await expect(rows.filter({ hasText: "Y06 · Yew Walk" })).toContainText("Y06 · Yew Walk · Free");
    await page.getByRole("link", { name: "Taken", exact: true }).click();
    await expect(page.getByText("3 plots")).toBeVisible();
    await expect(field).toHaveValue("1900-01-01");
    await check(page, "list-as-at");
    await expectNoNameInAddress(page, NAMES);

    // Show on map keeps the date and the plot. Open plot reads today.
    const y07 = rows.filter({ hasText: "Y07 · Yew Walk" });
    await expect(y07.getByRole("link", { name: /^Plot Y07/ })).not.toHaveAttribute("href", /asAt/);
    await y07.getByRole("link", { name: "Show on map" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Site map" })).toBeVisible();
    await expect(field).toHaveValue("1900-01-01");
    await expect(selected).toContainText(Y07_1900);

    // Back to today puts today in the field, takes the heading away and moves focus to the field.
    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(field).toHaveValue("2026-04-20");
    await expect(field).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name: /^As at / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to today" })).toHaveCount(0);
    await expect(selected).toContainText(Y07_TODAY);
    await expect(solid).toHaveCount(6);
    await expect(cross).toHaveCount(1);
    expect(page.url()).not.toContain("asAt");
    await expectNoNameInAddress(page, NAMES);
    expect((await storedEvents(page, siteId)).length).toBe(eventsBefore);
    expect(requests.external).toEqual([]);
  });
});

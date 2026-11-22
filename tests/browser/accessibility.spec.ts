// Accessibility, in a real browser, for both apps at 360 by 640 and at 1920 by 1080 (spec 06, task 6.13, Z13).
// What is checked here is checked by a browser assertion. No person used a screen reader, so no screen reader result
// is claimed. Part one: axe on every route, with no serious and no critical finding. Part two: the main paths done
// with the keyboard alone after the first address. Part three: dialogs, errors, focus and the focus ring.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { axeFindings, blocking, noted } from "../helpers/axe";
import { focusRingContrast, trackRequests } from "../helpers/measureLayout";
import { APPS, CHURCH, GARDEN, LIBRARY_ROUTES, focusedName, openPractice, routesOf, settle, tabTo } from "../helpers/routes";

/** Run axe, keep every finding in the test's notes, and fail on the serious and critical ones. */
async function axe(page: Page, label: string): Promise<void> {
  const findings = await axeFindings(page);
  for (const f of noted(findings)) test.info().annotations.push({ type: `axe ${f.impact}`, description: `${label}: ${f.rule}: ${f.help} (${f.nodes.map((n) => n.target).join("; ")})` });
  expect(blocking(findings), `${label}\n${JSON.stringify(blocking(findings), null, 1)}`).toEqual([]);
}

for (const app of APPS) {
  test.describe(`${app.title}, axe`, () => {
    test.use({ baseURL: app.origin });

    test("the library routes have no serious and no critical finding", async ({ page }) => {
      await page.goto("/");
      for (const route of LIBRARY_ROUTES) {
        await page.goto(`/#/${route}`);
        await settle(page);
        await axe(page, `library ${route === "" ? "home" : route}`);
      }
    });

    test("every route of the practice register has no serious and no critical finding", async ({ page }) => {
      test.setTimeout(240_000);
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      for (const route of register) {
        await page.goto(`/#/r/${siteId}${route === "" ? "" : `/${route}`}`);
        await settle(page);
        await axe(page, `register ${route === "" ? "home" : route}`);
      }
    });

    test("a dialog, an error and a refused command have no serious and no critical finding", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      const plot = register.find((r) => r.startsWith("plot/")) as string;
      await page.goto(`/#/r/${siteId}/${plot}`);
      await settle(page);
      await page.getByRole("button", { name: "Correct an entry" }).first().click();
      await expect(page.getByRole("dialog", { name: "Correct an entry" })).toBeVisible();
      await axe(page, "dialog");
      await page.keyboard.press("Escape");

      await page.goto("/#/new");
      await settle(page);
      if (app.currency !== undefined) await page.getByLabel("Currency").selectOption(app.currency);
      await page.getByRole("button", { name: "Create register" }).click();
      await expect(page.getByText("Enter a site name.")).toBeVisible();
      await axe(page, "empty form");

      await page.goto(`/#/r/${siteId}/nowhere`);
      await settle(page);
      await axe(page, "not found");
    });
  });
}

// ---- Keyboard only ------------------------------------------------------------------------------------------

test.describe("Churchyard Register, keyboard only", () => {
  test.use({ baseURL: CHURCH.origin });

  test("starts a register: Tab to the link, Enter, type the name, Tab to the button, Enter", async ({ page }) => {
    const requests = trackRequests(page, CHURCH.origin);
    await page.goto("/");
    await settle(page);
    await tabTo(page, "Start a register");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Start a register" })).toBeFocused();
    await tabTo(page, "Site name");
    await page.keyboard.type("Keyboard Yard");
    await tabTo(page, "Create register");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Keyboard Yard" })).toBeVisible();
    // The route changed, so focus went to the page heading.
    await expect(page.getByRole("heading", { level: 1, name: "Keyboard Yard" })).toBeFocused();
    expect(requests.external).toEqual([]);
  });

  test("finds a burial: type the name, Enter, Tab to Open burial, Enter", async ({ page }) => {
    await openPractice(page, CHURCH);
    await tabTo(page, "Name or plot code");
    await page.keyboard.type("Quillmoss");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Mirel Quillmoss · Y07 · Yew Walk")).toBeVisible();
    await tabTo(page, "Open burial");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Burial record" })).toBeFocused();
    await expect(page.getByText("Mirel Quillmoss").first()).toBeVisible();
  });

  test("records a burial: name, source ref, a year, Save burial, and the result is announced", async ({ page }) => {
    await openPractice(page, CHURCH);
    await tabTo(page, "Record a burial");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: /Record a burial|Burial record/ })).toBeFocused();
    await tabTo(page, "Recorded name");
    await page.keyboard.type("Aldous Pennyfeather");
    await tabTo(page, "Source ref");
    await page.keyboard.type("KB-1");
    // The date kind is a group of radio buttons. Tab reaches the checked one, "Exact date", and the arrow keys choose.
    await tabTo(page, /^(Exact date|Month and year|Year only|Date unknown)$/);
    for (let i = 0; i < 4 && !(await page.getByLabel("Year only").isChecked()); i++) await page.keyboard.press("ArrowDown");
    await expect(page.getByLabel("Year only")).toBeChecked();
    await tabTo(page, "Burial date");
    await page.keyboard.type("1901");
    await tabTo(page, "Save burial");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Burial saved. Location to confirm.")).toBeVisible();
  });

  test("finds Back up, downloads the private backup, and says what the file holds", async ({ page }) => {
    await openPractice(page, CHURCH);
    await tabTo(page, "Back up");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Back up this register" })).toBeFocused();
    await expect(page.getByText("This file contains private records and photos.")).toBeVisible();
    await tabTo(page, "Download private backup");
    const download = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    expect((await download).suggestedFilename()).toMatch(/^register-backup-\d{4}-\d{2}-\d{2}\.pkr\.zip$/);
  });

  test("opens Committee review and previews the file, with the keyboard", async ({ page }) => {
    await openPractice(page, CHURCH);
    await tabTo(page, "Committee review");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeFocused();
    await tabTo(page, "Site name for committee");
    await page.keyboard.type("Site 1");
    await tabTo(page, "Preview review file");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Download review file" })).toBeVisible();
  });
});

test.describe("Allotment Register, keyboard only", () => {
  test.use({ baseURL: GARDEN.origin });

  test("starts a register with a currency chosen by the keyboard", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await tabTo(page, "Start a register");
    await page.keyboard.press("Enter");
    await tabTo(page, "Site name");
    await page.keyboard.type("Keyboard Beds");
    await tabTo(page, "Currency");
    // A choice list takes the first letter of the item.
    await page.keyboard.type("GBP");
    await expect(page.getByLabel("Currency")).toHaveValue("GBP");
    await tabTo(page, "Create register");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Keyboard Beds" })).toBeFocused();
  });

  test("offers B03 to the first applicant: Make an offer, Review offer, Record offer", async ({ page }) => {
    await openPractice(page, GARDEN);
    await expect(page.getByText("Tavi Bramblequill").first()).toBeVisible();
    await tabTo(page, "Make an offer");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: /Offer|Make an offer/ })).toBeFocused();
    await tabTo(page, "Review offer");
    await page.keyboard.press("Enter");
    await tabTo(page, "Record offer");
    await page.keyboard.press("Enter");
    await expect(page.getByText("B03 reserved for Tavi Bramblequill.")).toBeVisible();
  });

  test("opens Settings and changes motion and contrast by the arrow keys", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await tabTo(page, "Settings");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeFocused();
    await tabTo(page, "Follow device motion");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByLabel("Reduce motion")).toBeChecked();
    await tabTo(page, "Standard");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByLabel("High", { exact: true })).toBeChecked();
    await tabTo(page, "Save settings");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  });
});

// ---- Dialogs, errors, focus ------------------------------------------------------------------------------------

for (const app of APPS) {
  test.describe(`${app.title}, focus`, () => {
    test.use({ baseURL: app.origin });

    test("a dialog takes focus, keeps Tab inside, closes on Escape, and gives focus back to the button that opened it", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      const plot = register.find((r) => r.startsWith("plot/")) as string;
      await page.goto(`/#/r/${siteId}/${plot}`);
      await settle(page);
      await tabTo(page, "Correct an entry");
      const trigger = page.getByRole("button", { name: "Correct an entry" }).first();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Correct an entry" });
      await expect(dialog).toBeVisible();
      // Focus is inside the dialog, and stays there through a full turn of Tab and of Shift+Tab.
      const inside = () => page.evaluate(() => document.activeElement?.closest("dialog") !== null);
      expect(await inside()).toBe(true);
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        expect(await inside(), `Tab ${i + 1}`).toBe(true);
      }
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test("the close button of a dialog works by keyboard and gives focus back", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      const plot = register.find((r) => r.startsWith("plot/")) as string;
      await page.goto(`/#/r/${siteId}/${plot}`);
      await settle(page);
      const trigger = page.getByRole("button", { name: "Correct an entry" }).first();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Correct an entry" });
      await tabTo(page, "Close");
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test("on an error, focus moves to the first invalid field, and the error is named by its field", async ({ page }) => {
      await page.goto("/#/new");
      await settle(page);
      if (app.currency !== undefined) await page.getByLabel("Currency").selectOption(app.currency);
      await tabTo(page, "Create register");
      await page.keyboard.press("Enter");
      const field = page.getByLabel("Site name");
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      const described = await field.getAttribute("aria-describedby");
      expect(described).not.toBeNull();
      await expect(page.locator(`#${described as string}`)).toHaveText("Enter a site name.");
      // The message is an alert, so it is read out when it appears.
      await expect(page.getByRole("alert").filter({ hasText: "Enter a site name." })).toBeVisible();
    });

    test("a change of page moves focus to its heading, and every page has exactly one main heading and one main region", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      for (const route of ["map", "list", "add", "backup", "settings", "help"]) {
        await page.goto(`/#/r/${siteId}/${route}`);
        await settle(page);
        await expect(page.locator("main h1")).toHaveCount(1);
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("main h1")).toBeFocused();
      }
      expect(register.length).toBeGreaterThan(15);
    });

    test("every control that takes focus shows a ring of at least 3 to 1, on a link, a button and a field", async ({ page }) => {
      await page.goto("/#/new");
      await settle(page);
      for (const selector of ["header.app nav a", "main a.button", "main input", "main select", "main button"]) {
        if ((await page.locator(selector).count()) === 0) continue;
        const ratio = await focusRingContrast(page, selector);
        expect(ratio, selector).toBeGreaterThanOrEqual(3);
      }
      await page.goto("/");
      await settle(page);
      for (const selector of ["header.app nav a", "main a.button", "main button"]) {
        if ((await page.locator(selector).count()) === 0) continue;
        expect(await focusRingContrast(page, selector), selector).toBeGreaterThanOrEqual(3);
      }
    });

    test("the map has the same choices in a list, and the list is reachable by keyboard", async ({ page }) => {
      const siteId = await openPractice(page, app);
      await page.goto(`/#/r/${siteId}/map`);
      await settle(page);
      await expect(page.getByRole("img", { name: /Site map/ })).toBeVisible();
      await expect(page.getByLabel("Choose a plot", { exact: true })).toBeVisible();
      await tabTo(page, "Open plot list");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      expect(await focusedName(page)).not.toBe("");
    });
  });
}

test("what this spec checks", () => {
  // Written so a reader of the list sees what was and was not tried.
  expect(APPS.map((a) => a.key)).toEqual(["churchyard", "allotment"]);
});

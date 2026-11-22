// Entry and library, in a real browser, for both apps at 360 by 640 and at 1920 by 1080 (spec 06, task 6.11, Z11).
// A keeper opens each app at its own address, starts registers, closes and reopens them, changes the settings,
// reads Help and About, restarts the practice register, and removes exactly one register. Back and refresh keep
// the page. An unknown address says "Page not found". Every screen visited is measured, and no request leaves the
// app's own address. The hub at "/" and the direct entry directories are the next task.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { APPS, openPractice, siteIdOf, startOwn, storedSites } from "../helpers/routes";
import type { AppUnderTest } from "../helpers/routes";

async function check(page: Page): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
}

/** The titles of the own registers on the library screen, as the keeper reads them. */
async function cards(page: Page): Promise<string[]> {
  const list = page.locator("ul.cards li h3");
  return (await list.allTextContents()).map((t) => t.trim());
}

async function lastReading(page: Page): Promise<string> {
  return page.evaluate(() => window.localStorage.getItem("plotwarden.settings") ?? "");
}

for (const app of APPS) {
  test.describe(`${app.title}`, () => {
    test.use({ baseURL: app.origin });

    test("opens at its own address with its title, one main action and the practice choice", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
      await expect(page.getByRole("link", { name: "Start a register" })).toHaveClass(/primary/);
      expect(await page.locator(".button.primary").count()).toBe(1);
      await expect(page.getByRole("button", { name: `Open ${app.practice}` })).toBeVisible();
      await expect(page.getByRole("link", { name: "Restore backup" })).toBeVisible();
      await expect(page.getByText("No registers on this device.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Restart walkthrough" })).toHaveCount(0);
      await check(page);
      expect(requests.external).toEqual([]);
    });

    test("starts two registers, keeps both on refresh, and Back returns to the library", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      await startOwn(page, app, "Orchard One");
      await check(page);
      await page.getByRole("link", { name: "Registers", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
      await expect.poll(() => cards(page)).toEqual(["Orchard One"]);
      await startOwn(page, app, "Orchard Two");
      await page.getByRole("link", { name: "Registers", exact: true }).click();
      await expect.poll(async () => (await cards(page)).sort()).toEqual(["Orchard One", "Orchard Two"]);
      await check(page);

      // Refresh keeps the list, and the second register's own history.
      await page.reload();
      await expect.poll(async () => (await cards(page)).sort()).toEqual(["Orchard One", "Orchard Two"]);

      // Back from the new register form returns to the library with the list as it was.
      await page.getByRole("link", { name: "Start a register" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Start a register" })).toBeVisible();
      await check(page);
      await page.goBack();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
      await expect.poll(async () => (await cards(page)).sort()).toEqual(["Orchard One", "Orchard Two"]);
      expect(requests.external).toEqual([]);
    });

    test("reopens a register from its card and shows its title", async ({ page }) => {
      await startOwn(page, app, "Orchard Three");
      await page.getByRole("link", { name: "Registers", exact: true }).click();
      await page.getByRole("link", { name: "Open Orchard Three" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Orchard Three" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Change register" })).toBeVisible();
      await check(page);
    });

    test("an empty site name is refused on the field, with focus on it, and nothing is saved", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Start a register" }).click();
      if (app.currency !== undefined) await page.getByLabel("Currency").selectOption(app.currency);
      await page.getByRole("button", { name: "Create register" }).click();
      await expect(page.getByText("Enter a site name.")).toBeVisible();
      await expect(page.getByLabel("Site name")).toBeFocused();
      await check(page);
      expect((await storedSites(page)).filter((s) => s.workspace === "own")).toEqual([]);
    });

    test("saves the settings, keeps them on refresh, writes one key with three choices, and follows them on every page", async ({ page }) => {
      await startOwn(page, app, "Orchard Settings");
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await page.getByLabel("Reduce motion").check();
      await page.getByLabel("High", { exact: true }).check();
      await page.getByLabel("Letter", { exact: true }).check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved.")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
      await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
      await check(page);

      const stored = JSON.parse(await lastReading(page)) as Record<string, string>;
      expect(stored).toEqual({ motion: "reduce", contrast: "high", paper: "Letter" });
      const keys = await page.evaluate(() => Object.keys(window.localStorage));
      expect(keys).toEqual(["plotwarden.settings"]);

      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
      await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
      await page.getByRole("link", { name: "Help", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
      await check(page);
    });

    test("reads Help and About, and each has a way back", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Help", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
      for (const topic of ["Start from paper", "Make a map", "Share a visitor copy", "Keep a backup", "Use the keyboard"]) await expect(page.getByRole("heading", { level: 2, name: topic })).toBeVisible();
      await check(page);
      await page.getByRole("link", { name: "Back to registers" }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();

      await page.getByRole("link", { name: "About", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "About Plotwarden" })).toBeVisible();
      await expect(page.getByText("Records stay in this browser until you choose to export them.")).toBeVisible();
      // The one place the invented places are named in the app.
      await expect(page.getByText("Lantern Fold and Thimble Beds are invented places.")).toBeVisible();
      await check(page);
      await page.getByRole("link", { name: "Back to registers" }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
    });

    test("restarts the practice register alone, and leaves the own registers and their history as they were", async ({ page }) => {
      await startOwn(page, app, "Orchard Own");
      const own = siteIdOf(page);
      await page.goto("/");
      await page.getByRole("button", { name: `Open ${app.practice}` }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
      const practice = siteIdOf(page);
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Restart walkthrough" })).toBeVisible();
      const before = await storedSites(page);
      const ownBefore = before.find((s) => s.id === own);

      await page.getByRole("button", { name: "Restart walkthrough" }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
      expect(page.url()).toContain("restarted=1");
      const after = await storedSites(page);
      expect(after.find((s) => s.id === practice)).toBeUndefined();
      expect(after.filter((s) => s.title === app.practice)).toHaveLength(1);
      expect(after.find((s) => s.id === own)).toEqual(ownBefore);
      expect(after).toHaveLength(before.length);

      await page.goto("/");
      await expect.poll(() => cards(page)).toEqual(["Orchard Own"]);
    });

    test("removes exactly the register that was named, after the name is typed", async ({ page }) => {
      const one = await startOwn(page, app, "Orchard Keep");
      const two = await startOwn(page, app, "Orchard Remove");
      await openPractice(page, app);
      const before = await storedSites(page);

      await page.goto(`/#/r/${two}`);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page.getByText("Only Orchard Remove will be removed.")).toBeVisible();
      const remove = page.getByRole("button", { name: "Remove this register" });
      await expect(remove).toBeDisabled();
      await check(page);
      await page.getByLabel("Type the site name").fill("Orchard");
      await expect(remove).toBeDisabled();
      await page.getByLabel("Type the site name").fill("Orchard Remove");
      await expect(remove).toBeEnabled();
      await remove.click();

      await expect(page.getByText("Register removed.")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
      await expect.poll(() => cards(page)).toEqual(["Orchard Keep"]);
      const after = await storedSites(page);
      expect(after.map((s) => s.id).sort()).toEqual(before.map((s) => s.id).filter((id) => id !== two).sort());
      expect(after.find((s) => s.id === one)).toEqual(before.find((s) => s.id === one));
      await check(page);

      // Back to the removed register's address: it is gone, and the page says so.
      await page.goto(`/#/r/${two}`);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    });

    test("says Page not found for an address that is not a page, moves focus to the heading, and Open registers works", async ({ page }) => {
      for (const hash of ["#/nowhere", "#/r", "#/r/00000000-0000-4000-8000-000000000000", "#/r/00000000-0000-4000-8000-000000000000/map", "#/settings/extra/more"]) {
        await page.goto(`/${hash}`);
        if (hash === "#/settings/extra/more") {
          // The settings page ignores trailing words and still opens.
          await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
          continue;
        }
        await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), hash).toBeVisible();
        await expect(page.getByRole("link", { name: "Open registers" })).toBeVisible();
      }
      await page.goto("/#/nowhere");
      await check(page);
      await page.getByRole("link", { name: "Open registers" }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
    });

    test("moves focus to the page heading when the page changes, and keeps it there on Back", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Help", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeFocused();
      await page.getByRole("link", { name: "About", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "About Plotwarden" })).toBeFocused();
      await page.goBack();
      await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    });
  });
}

// A reader of the file can see which apps were walked.
test("walks both apps", () => {
  const names: AppUnderTest["key"][] = APPS.map((a) => a.key);
  expect(names).toEqual(["churchyard", "allotment"]);
});

// Accessibility, in a real browser, for both apps at 360 by 640 and at 1920 by 1080 (spec 06, task 6.13, Z13).
// What is checked here is checked by a browser assertion. No person used a screen reader, so no screen reader result
// is claimed. Part one: axe on every route, with no serious and no critical finding. Part two: the main paths done
// with the keyboard alone after the first address. Part three: dialogs, errors, focus and the focus ring.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { axeFindings, blocking, noted } from "../helpers/axe";
import { focusRingContrast, trackRequests } from "../helpers/measureLayout";
import { APPS, CHURCH, GARDEN, LIBRARY_ROUTES, focusedName, openPractice, plotIdOf, routesOf, settle, siteIdOf, storedEvents, tabTo } from "../helpers/routes";
import { SITE, tryPracticeFromHub } from "../helpers/siteOrigin";

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

// ---- The heading that script focuses shows no ring (spec 07, L3) -----------------------------------------------

/** The outline of the focused element, as the browser computes it. */
async function focusedOutline(page: Page): Promise<{ tag: string; id: string; style: string; width: number; focusVisible: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const css = getComputedStyle(el);
    return { tag: el.tagName.toLowerCase(), id: el.id, style: css.outlineStyle, width: parseFloat(css.outlineWidth), focusVisible: el.matches(":focus-visible") };
  });
}

/** Press Tab until a button, a link or a field of the page body has focus, and return how it is outlined. */
async function tabToControl(page: Page): Promise<{ tag: string; id: string; style: string; width: number; focusVisible: boolean }> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const inMain = await page.evaluate(() => document.activeElement?.closest("main") !== null && document.activeElement?.matches("button, a[href], input, select, textarea") === true);
    if (inMain) return focusedOutline(page);
  }
  throw new Error("Tab did not reach a control in the page body in 40 presses");
}

test.describe("the page heading that script focuses shows no ring, and a control keeps its ring", () => {
  test.use({ baseURL: SITE });

  for (const app of APPS) {
    test(`${app.title}: opened from the start page with the mouse, the heading has focus and no outline, and a button reached with Tab has its ring`, async ({ page }) => {
      await tryPracticeFromHub(page, app.key === "churchyard" ? "churchyard" : "allotment");
      const heading = page.getByRole("heading", { level: 1, name: app.practice });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
      await expect(heading).toHaveAttribute("tabindex", "-1");
      const onHeading = await focusedOutline(page);
      expect(onHeading.tag).toBe("h1");
      expect(onHeading.style, "the heading's outline style").toBe("none");

      // A control reached with the keyboard still shows the 3 px ring, and the ring reaches 3 to 1.
      const onControl = await tabToControl(page);
      expect(onControl.focusVisible, `${onControl.tag} matches :focus-visible after Tab`).toBe(true);
      expect(onControl.style, `${onControl.tag}'s outline style`).toBe("solid");
      expect(onControl.width, `${onControl.tag}'s outline width`).toBe(3);
      expect(await focusRingContrast(page, ":focus")).toBeGreaterThanOrEqual(3);
    });
  }

  test("Churchyard Register: the Selected plot heading takes focus from a plot link and shows no outline", async ({ page }) => {
    await tryPracticeFromHub(page, "churchyard");
    await expect(page.getByRole("heading", { level: 1, name: CHURCH.practice })).toBeFocused();
    const siteId = siteIdOf(page);
    const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
    await page.evaluate(([id, plotId]) => { window.location.hash = `#/r/${id}?plot=${plotId}`; }, [siteId, plot] as const);
    const selected = page.getByRole("heading", { level: 2, name: "Selected plot" });
    await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute("tabindex", "-1");
    expect((await focusedOutline(page)).style, "the Selected plot heading's outline style").toBe("none");
  });

  test("the start page: a heading that script focuses after a link shows no outline, and a link keeps its ring", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "About", exact: true }).click();
    const heading = page.getByRole("heading", { level: 1, name: "About Plotwarden" });
    await expect(heading).toBeFocused();
    expect((await focusedOutline(page)).style, "the About heading's outline style").toBe("none");
    await page.keyboard.press("Tab");
    const link = await focusedOutline(page);
    expect(link.tag).toBe("a");
    expect(link.style).toBe("solid");
    expect(link.width).toBe(3);
  });
});

// ---- The ring on the night (spec 07, task 7.17, L3.2, L7.6) ------------------------------------------------------------
// A control that stands on the night ground or on the churchyard sky takes the amber ring #FFD27A, which is 3 to 1 or
// more on #232A5C. A control on a sheet keeps the blue ring. The allotment has no dark ground, so it keeps the blue ring
// everywhere. In high contrast there is no night, so the ring is the dark blue of that mode everywhere on the desk.

const AMBER = "rgb(255, 210, 122)";
const BLUE = "rgb(11, 79, 175)";
const HIGH_BLUE = "rgb(0, 0, 204)";

/** Tab to a control by its name, and read the ring that it has when the keyboard puts it there. */
async function ringAt(page: Page, name: string | RegExp): Promise<{ colour: string; style: string; width: string; ratio: number }> {
  await tabTo(page, name, { max: 90 });
  const read = await page.evaluate(() => {
    const el = document.activeElement as Element;
    const s = getComputedStyle(el);
    return { colour: s.outlineColor, style: s.outlineStyle, width: s.outlineWidth, visible: el.matches(":focus-visible") };
  });
  expect(read.visible, `${String(name)} matches :focus-visible after Tab`).toBe(true);
  return { colour: read.colour, style: read.style, width: read.width, ratio: await focusRingContrast(page, ":focus") };
}

test.describe("the focus ring on the night ground and on the sheets", () => {
  test.describe("Churchyard Register", () => {
    test.use({ baseURL: CHURCH.origin });

    test("is amber on the sky and the night, and blue on a sheet, and reaches 3 to 1 on each ground", async ({ page }) => {
      const siteId = await openPractice(page, CHURCH);
      const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
      await page.goto(`/#/r/${siteId}?plot=${plot}`);
      await settle(page);
      await page.mouse.click(2, 2);
      const onDark = ["Registers", "Change register", "Open plot", "Site map", "Record a burial", "Back up"];
      const onSheet = ["Name or plot code", "Search"];
      // The order of the page: the header, the heading row, the find sheet, the plot heading row, the index.
      const order = ["Registers", "Change register", "Name or plot code", "Search", "Open plot", "Site map", "Record a burial", "Back up"];
      for (const name of order) {
        const ring = await ringAt(page, name);
        expect(ring.style, `${name}: style`).toBe("solid");
        expect(ring.width, `${name}: width`).toBe("3px");
        if (onDark.includes(name)) expect(ring.colour, `${name} stands on the night`).toBe(AMBER);
        if (onSheet.includes(name)) expect(ring.colour, `${name} stands on a sheet`).toBe(BLUE);
        expect(ring.ratio, `${name}: the ring on its ground`).toBeGreaterThanOrEqual(3);
      }
    });

    test("is the dark blue of high contrast on the desk, with no night ground", async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("plotwarden.settings", JSON.stringify({ motion: "follow", contrast: "high", paper: "A4" })));
      const siteId = await openPractice(page, CHURCH);
      const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
      await page.goto(`/#/r/${siteId}?plot=${plot}`);
      await settle(page);
      await page.mouse.click(2, 2);
      for (const name of ["Change register", "Name or plot code", "Open plot", "Record a burial"]) {
        const ring = await ringAt(page, name);
        expect(ring.colour, `${name} in high contrast`).toBe(HIGH_BLUE);
        expect(ring.ratio, `${name} in high contrast`).toBeGreaterThanOrEqual(3);
      }
    });
  });

  test.describe("Allotment Register", () => {
    test.use({ baseURL: GARDEN.origin });

    test("keeps the blue ring everywhere, because its ground is light", async ({ page }) => {
      const siteId = await openPractice(page, GARDEN);
      await page.goto(`/#/r/${siteId}`);
      await settle(page);
      await page.mouse.click(2, 2);
      for (const name of ["Registers", "Change register", "Make an offer", "Name or plot code", /^Waiting list/, "Back up"]) {
        const ring = await ringAt(page, name);
        expect(ring.colour, String(name)).toBe(BLUE);
        expect(ring.ratio, String(name)).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
test("what this spec checks", () => {
  // Written so a reader of the list sees what was and was not tried.
  expect(APPS.map((a) => a.key)).toEqual(["churchyard", "allotment"]);
});

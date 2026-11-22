// Layout, in a real browser, for both apps at 360 by 640 and at 1920 by 1080 (spec 06, task 6.12, Z12).
// Every route, every dialog and every error of each app is measured in its practice register: the 16 px edge, the
// 12 px gap, the 44 by 44 px target, the 12 px text, contrast, no sideways scroll and no covered target. Nothing is
// left out to make a page pass. Then the same measures at 200 percent zoom, with long strings, and in both motion
// modes. A picture of each route is kept as proof.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { findLabelCollisions, measureLayout, readSheetScene, trackRequests } from "../helpers/measureLayout";
import { APPS, LIBRARY_ROUTES, openPractice, plotIdOf, proof, routeName, routesOf, settle, sizeOf, startOwn, storedEvents } from "../helpers/routes";
import type { AppUnderTest } from "../helpers/routes";
import { SITE, hubCard } from "../helpers/siteOrigin";

const SHOTS = "docs/acceptance/layout/routes";

async function check(page: Page, label: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, `${label}\n${JSON.stringify(violations, null, 1)}`).toEqual([]);
}

for (const app of APPS) {
  test.describe(`${app.title}`, () => {
    test.use({ baseURL: app.origin });
    const folder = `${SHOTS}/${app.key}`;

    test("every route of the library is laid out well", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      await page.goto("/");
      for (const route of LIBRARY_ROUTES) {
        await page.goto(`/#/${route}`);
        await settle(page);
        await check(page, `library route ${route}`);
        await proof(page, folder, `library-${route === "" ? "home" : route}`);
      }
      expect(requests.external).toEqual([]);
    });

    test("every route of a register is laid out well, in the practice register", async ({ page }) => {
      test.setTimeout(240_000);
      const requests = trackRequests(page, app.origin);
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      expect(register.length).toBeGreaterThanOrEqual(20);
      for (const route of register) {
        await page.goto(`/#/r/${siteId}${route === "" ? "" : `/${route}`}`);
        await settle(page);
        await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), `route ${route} was not found`).toHaveCount(0);
        await check(page, `register route ${route}`);
        await proof(page, folder, `route-${routeName(route)}`);
      }
      expect(requests.external).toEqual([]);
    });

    test("no name on the map lies on a plot: every svg text on the map and the home route is read at its real box", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      const siteId = await openPractice(page, app);
      const events = await storedEvents(page, siteId);
      const codes = app.key === "churchyard" ? ["Y07", "Y01", "Y12"] : ["B02", "B05", "B06"];
      const views = [
        { route: `/#/r/${siteId}/map`, what: "map, nothing chosen", chosen: false },
        { route: `/#/r/${siteId}`, what: "home", chosen: false },
        ...codes.map((code) => ({ route: `/#/r/${siteId}/map?plot=${plotIdOf(events, code)}`, what: `map, ${code} chosen`, chosen: true })),
      ];
      for (const view of views) {
        await page.goto(view.route);
        await settle(page);
        const scenes = await page.evaluate(readSheetScene);
        expect(scenes.length, `${view.what}: a map is drawn`).toBeGreaterThanOrEqual(1);
        for (const scene of scenes) {
          expect(scene.plots?.length ?? 0, `${view.what}: plot shapes were read`).toBeGreaterThanOrEqual(6);
          const kinds = new Set(scene.labels.map((l) => l.kind));
          expect(kinds.has("gate"), `${view.what}: the gate name was read`).toBe(true);
          expect(kinds.has("section"), `${view.what}: a section name was read`).toBe(true);
          if (view.chosen) expect(scene.tabText, `${view.what}: the tab text was read`).toBeDefined();
        }
        const onPlot = findLabelCollisions(scenes).filter((v) => v.rule === "label_on_plot");
        expect(onPlot, `${view.what}\n${JSON.stringify(onPlot, null, 1)}`).toEqual([]);
      }
      expect(requests.external).toEqual([]);
    });

    test("the map route as at a past date is laid out well, and no name on it lies on a plot", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      const siteId = await openPractice(page, app);
      const date = app.key === "churchyard" ? "1900-01-01" : "2025-03-31";
      await page.goto(`/#/r/${siteId}/map`);
      await settle(page);
      await page.getByLabel("Show the site as at", { exact: true }).fill(date);
      await expect(page.getByRole("heading", { level: 2, name: `As at ${date}` })).toBeVisible();
      await expect(page.getByRole("button", { name: "Back to today" })).toBeVisible();
      await settle(page);
      await check(page, `map as at ${date}`);
      const scenes = await page.evaluate(readSheetScene);
      expect(scenes.length).toBeGreaterThanOrEqual(1);
      const onPlot = findLabelCollisions(scenes).filter((v) => v.rule === "label_on_plot");
      expect(onPlot, JSON.stringify(onPlot, null, 1)).toEqual([]);
      await proof(page, folder, "route-map-as-at");
      expect(requests.external).toEqual([]);
    });

    test("a dialog is laid out well, and a state of an unknown address, an empty form and a refused command too", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      const plotRoute = register.find((r) => r.startsWith("plot/")) as string;

      // The dialog: correct an entry.
      await page.goto(`/#/r/${siteId}/${plotRoute}`);
      await settle(page);
      const opener = page.getByRole("button", { name: "Correct an entry" }).first();
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "Correct an entry" });
      await expect(dialog).toBeVisible();
      await check(page, "dialog");
      await proof(page, folder, "dialog-correct-an-entry");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();

      // An address that is not a page.
      await page.goto(`/#/r/${siteId}/nowhere`);
      await settle(page);
      await check(page, "unknown register route");
      await proof(page, folder, "error-not-found");

      // An empty form: the error is on the field, with focus on it.
      await page.goto("/#/new");
      await settle(page);
      if (app.currency !== undefined) await page.getByLabel("Currency").selectOption(app.currency);
      await page.getByRole("button", { name: "Create register" }).click();
      await expect(page.getByText("Enter a site name.")).toBeVisible();
      await expect(page.getByLabel("Site name")).toBeFocused();
      await check(page, "empty new register form");
      await proof(page, folder, "error-empty-site-name");

      // A refused command, from a screen of the app.
      if (app.key === "churchyard") {
        await page.goto(`/#/r/${siteId}/burial/new`);
        await settle(page);
        await page.getByRole("button", { name: "Save burial" }).click();
        await expect(page.locator("[aria-invalid='true']").first()).toBeFocused();
      } else {
        await page.goto(`/#/r/${siteId}/waiting`);
        await settle(page);
        await page.getByRole("button", { name: "Add applicant" }).click();
        await expect(page.locator("[aria-invalid='true']").first()).toBeFocused();
      }
      await check(page, "refused command");
      await proof(page, folder, "error-refused-command");
    });

    test("a register that changed in another tab says so, and the notice is laid out well", async ({ page, context }) => {
      const siteId = await openPractice(page, app);
      const events = await (await import("../helpers/routes")).storedEvents(page, siteId);
      const plot = (await routesOf(page, app, siteId)).register.find((r) => r.startsWith("plot/")) as string;
      expect(events.length).toBeGreaterThan(10);
      await page.goto(`/#/r/${siteId}/${plot}`);
      await settle(page);

      const other = await context.newPage();
      await other.goto(`${app.origin}#/r/${siteId}/${plot}`);
      await settle(other);
      await other.getByLabel("Note", { exact: true }).fill("A note made in the other tab.");
      await other.getByRole("button", { name: "Add note" }).click();
      await expect(other.getByText("Note added.")).toBeVisible();
      await other.close();

      await expect(page.getByText("This register changed in another tab.")).toBeVisible();
      await check(page, "stale notice");
      await proof(page, folder, "error-changed-in-another-tab");
    });

    test("the desk with its example search run, and the desk of a register of its own, are laid out well", async ({ page }) => {
      await openPractice(page, app);
      await settle(page);
      // The practice register shows its one example button. Press it and measure the answer on the page.
      const example = page.getByRole("button", { name: app.key === "churchyard" ? "Try Quillmoss" : /^Try B\d+$/ });
      await expect(example).toHaveCount(1);
      await check(page, "practice desk, before the example");
      await proof(page, folder, "desk-practice");
      await example.click();
      await expect(page.getByRole("heading", { level: 3, name: "Results" })).toBeVisible();
      await check(page, "practice desk, after the example");
      await proof(page, folder, "desk-practice-example");

      // A register of the keeper's own has the same groups and no example button.
      await startOwn(page, app, "Home Plot");
      await settle(page);
      await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(0);
      for (const name of ["Records", "Share", "Site"]) await expect(page.locator("main").getByRole("navigation", { name, exact: true })).toHaveCount(1);
      await check(page, "own desk");
      await proof(page, folder, "desk-own");
    });

    test("at 200 percent zoom the desk keeps every measure, with its groups and its example button", async ({ page }) => {
      await openPractice(page, app);
      const full = page.viewportSize() as { width: number; height: number };
      await page.setViewportSize({ width: full.width / 2, height: full.height / 2 });
      await page.reload();
      await settle(page);
      await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(1);
      await check(page, "200 percent, the desk with its example");
    });

    test("long strings do not break the layout: a 100 character name made of words, and one with no break at all", async ({ page }) => {
      const words = "The Parish Churchyard of Saint Aldhelm and Saint Edburga with the Old Chapel of Ease, Lower Green";
      const unbroken = "W".repeat(100);
      // Both are within the 100 character limit for a name, and the longer one uses most of it.
      expect(words.length).toBeGreaterThanOrEqual(90);
      expect(words.length).toBeLessThanOrEqual(100);
      for (const [label, title] of [["words", words], ["unbroken", unbroken]] as const) {
        await startOwn(page, app, title);
        await settle(page);
        await check(page, `home with a long name, ${label}`);
        await proof(page, folder, `long-name-${label}-home`);
        await page.goto("/");
        await settle(page);
        await check(page, `library with a long name, ${label}`);
        await proof(page, folder, `long-name-${label}-library`);
      }
      // A note of 4,000 characters, in the practice register.
      const siteId = await openPractice(page, app);
      const plot = (await routesOf(page, app, siteId)).register.find((r) => r.startsWith("plot/")) as string;
      await page.goto(`/#/r/${siteId}/${plot}`);
      await settle(page);
      const long = Array.from({ length: 400 }, (_, i) => `Reading${i}`).join(" ").slice(0, 4000);
      await page.getByLabel("Note", { exact: true }).fill(long);
      await page.getByRole("button", { name: "Add note" }).click();
      await expect(page.getByText("Note added.")).toBeVisible();
      await check(page, "a 4,000 character note");
      await proof(page, folder, "long-note");
    });

    test("at 200 percent zoom the main routes keep every measure, with no sideways scroll", async ({ page }) => {
      test.setTimeout(240_000);
      const siteId = await openPractice(page, app);
      const { register } = await routesOf(page, app, siteId);
      const full = page.viewportSize() as { width: number; height: number };
      // A zoom of 200 percent halves the width in CSS pixels. The picture is taken at twice the density.
      await page.setViewportSize({ width: full.width / 2, height: full.height / 2 });
      const wanted = ["", "map", "list", "add/one", "settings", "exchange", "help"];
      const routes = [...register.filter((r) => wanted.includes(r) || r.startsWith("plot/"))];
      expect(routes.length).toBeGreaterThanOrEqual(8);
      for (const route of routes) {
        await page.goto(`/#/r/${siteId}${route === "" ? "" : `/${route}`}`);
        await settle(page);
        await check(page, `200 percent, ${route}`);
        if (sizeOf(page) === "desktop") await proof(page, folder, `zoom200-${routeName(route)}`);
      }
      for (const route of ["", "new", "settings", "about"]) {
        await page.goto(`/#/${route}`);
        await settle(page);
        await check(page, `200 percent, library ${route}`);
      }
    });
  });
}

// ---- The hub: the first screen of the whole site -----------------------------------------------------

test.describe("the hub and its register cards", () => {
  test.use({ baseURL: SITE });

  test("is laid out well, with the job line, two cards with a drawing each, and no sideways scroll", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    await check(page, "hub");
    // Each drawing keeps its text at 12 px or more and inside its card.
    const drawings = await page.evaluate(() =>
      [...document.querySelectorAll<SVGSVGElement>("article svg.sheet")].map((svg) => {
        const card = svg.closest("article") as HTMLElement;
        const s = svg.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return { inside: s.left >= c.left && s.right <= c.right, scale: s.width / svg.viewBox.baseVal.width };
      }),
    );
    expect(drawings).toHaveLength(2);
    for (const drawing of drawings) {
      expect(drawing.inside).toBe(true);
      expect(drawing.scale).toBeGreaterThanOrEqual(0.99);
    }
    // On a phone the cards are one under the other. On a wide screen they sit side by side.
    const [church, garden] = await Promise.all([hubCard(page, "churchyard").boundingBox(), hubCard(page, "allotment").boundingBox()]);
    if (sizeOf(page) === "phone") expect((garden?.y ?? 0) > (church?.y ?? 0) + (church?.height ?? 0) - 1).toBe(true);
    else expect((garden?.x ?? 0) > (church?.x ?? 0) + (church?.width ?? 0) - 1).toBe(true);
    // The first thing a reader needs, the job and a button to press, is in the first screen.
    const firstButton = await hubCard(page, "churchyard").getByRole("link", { name: "Try the practice register" }).boundingBox();
    expect((firstButton?.y ?? 9999) + (firstButton?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
    expect(requests.external).toEqual([]);
  });

  test("keeps every measure at 200 percent zoom", async ({ page }) => {
    const full = page.viewportSize() as { width: number; height: number };
    await page.setViewportSize({ width: full.width / 2, height: full.height / 2 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    await check(page, "hub at 200 percent");
  });

  test("keeps the drawings still: nothing on the hub moves", async ({ page }) => {
    await page.goto("/");
    const moving = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationName !== "none" || getComputedStyle(el).transitionDuration.split(",").some((d) => d.trim() !== "0s")).length);
    expect(moving).toBe(0);
  });
});

// ---- Motion -----------------------------------------------------------------------------------------------

interface Reading {
  dataMotion: string | null;
  setting: string | null;
  mistDisplay: string;
  mistAnimation: string;
  animated: string[];
  transitioned: string[];
  scrollBehavior: string;
}

/** What moves on the page: every element and its two generated parts, read from the computed style. */
async function readMotion(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const mist = document.querySelector<HTMLElement>(".mist");
    const animated: string[] = [];
    const transitioned: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      for (const pseudo of [null, "::before", "::after"] as const) {
        const style = getComputedStyle(el, pseudo);
        if (style.animationName !== "none" && style.display !== "none") animated.push(`${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""}${pseudo ?? ""}`);
        if (style.transitionDuration.split(",").some((d) => d.trim() !== "0s")) transitioned.push(`${el.tagName.toLowerCase()}${pseudo ?? ""}`);
      }
    }
    return {
      dataMotion: document.documentElement.getAttribute("data-motion"),
      setting: document.documentElement.getAttribute("data-motion-setting"),
      mistDisplay: mist === null ? "none" : getComputedStyle(mist).display,
      mistAnimation: mist === null ? "none" : getComputedStyle(mist).animationName,
      animated,
      transitioned,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });
}

for (const app of APPS) {
  test.describe(`${app.title}, motion`, () => {
    test.use({ baseURL: app.origin });

    const cases: { system: "reduce" | "no-preference"; setting: "follow" | "reduce"; contrast: "standard" | "high"; resolved: "reduce" | "allow" }[] = [
      { system: "no-preference", setting: "follow", contrast: "standard", resolved: "allow" },
      { system: "reduce", setting: "follow", contrast: "standard", resolved: "reduce" },
      { system: "no-preference", setting: "reduce", contrast: "standard", resolved: "reduce" },
      { system: "reduce", setting: "reduce", contrast: "standard", resolved: "reduce" },
      { system: "no-preference", setting: "follow", contrast: "high", resolved: "allow" },
    ];

    for (const c of cases) {
      test(`system ${c.system}, app ${c.setting}, contrast ${c.contrast}: motion is ${c.resolved}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: c.system });
        await page.addInitScript((settings) => window.localStorage.setItem("plotwarden.settings", JSON.stringify(settings)), { motion: c.setting, contrast: c.contrast, paper: "A4" });
        await page.goto("/");
        await settle(page);
        const read = await readMotion(page);
        expect(read.dataMotion).toBe(c.resolved);
        expect(read.setting).toBe(c.setting);
        if (c.resolved === "reduce") {
          // Nothing animates: no mist, no animation on any element or part, no transition, no smooth scroll.
          expect(read.mistDisplay).toBe("none");
          expect(read.animated).toEqual([]);
          expect(read.transitioned).toEqual([]);
          expect(read.scrollBehavior).toBe("auto");
        } else if (c.contrast === "high") {
          // High contrast takes the decorative mist away, even when motion is allowed.
          expect(read.mistDisplay).toBe("none");
          expect(read.animated).toEqual([]);
        } else {
          // Motion is allowed: the one decoration is the mist, and nothing else moves.
          expect(read.mistDisplay).not.toBe("none");
          expect(read.mistAnimation).not.toBe("none");
          expect(read.transitioned).toEqual([]);
        }
        await check(page, `motion ${c.resolved}`);
      });
    }

    test("follows a change of the system setting at once, while the app says follow, and not while the app says reduce", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/");
      await settle(page);
      expect((await readMotion(page)).dataMotion).toBe("allow");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
      expect((await readMotion(page)).animated).toEqual([]);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(page.locator("html")).toHaveAttribute("data-motion", "allow");

      // The app setting wins: reduce stays reduce, whatever the system says.
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await page.getByLabel("Reduce motion").check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
      expect((await readMotion(page)).animated).toEqual([]);
    });
  });
}

// Print the sizes the spec ran at, so a reader of the log can see both.
test("runs at a known size", ({ page }) => {
  const size = page.viewportSize() as { width: number; height: number };
  expect([`${size.width}x${size.height}`]).toEqual([sizeOf(page) === "phone" ? "360x640" : "1920x1080"]);
});

export type { AppUnderTest };

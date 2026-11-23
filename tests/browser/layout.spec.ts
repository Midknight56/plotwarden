// Layout, in a real browser, for both apps at 360 by 640 and at 1920 by 1080 (spec 06, task 6.12, Z12).
// Every route, every dialog and every error of each app is measured in its practice register: the 16 px edge, the
// 12 px gap, the 44 by 44 px target, the 12 px text, contrast, no sideways scroll and no covered target. Nothing is
// left out to make a page pass. Then the same measures at 200 percent zoom, with long strings, and in both motion
// modes. A picture of each route is kept as proof.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { findLabelCollisions, measureLayout, readSheetScene, trackRequests } from "../helpers/measureLayout";
import { APPS, CHURCH, GARDEN, LIBRARY_ROUTES, openPractice, plotIdOf, proof, routeName, routesOf, settle, sizeOf, startOwn, storedEvents, tabTo } from "../helpers/routes";
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
  /** Every element and part that has a transition: whether it is a button, and what it changes and how long it takes. */
  transitions: { button: boolean; property: string; duration: string }[];
  scrollBehavior: string;
}

/** What moves on the page: every element and its two generated parts, read from the computed style. */
async function readMotion(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const mist = document.querySelector<HTMLElement>(".mist");
    const animated: string[] = [];
    const transitioned: string[] = [];
    const transitions: { button: boolean; property: string; duration: string }[] = [];
    for (const el of document.querySelectorAll("*")) {
      for (const pseudo of [null, "::before", "::after"] as const) {
        const style = getComputedStyle(el, pseudo);
        if (style.animationName !== "none" && style.display !== "none") animated.push(`${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""}${pseudo ?? ""}`);
        if (style.transitionDuration.split(",").some((d) => d.trim() !== "0s")) {
          transitioned.push(`${el.tagName.toLowerCase()}${pseudo ?? ""}`);
          transitions.push({ button: pseudo === null && el.classList.contains("button"), property: style.transitionProperty, duration: style.transitionDuration });
        }
      }
    }
    return {
      dataMotion: document.documentElement.getAttribute("data-motion"),
      setting: document.documentElement.getAttribute("data-motion-setting"),
      mistDisplay: mist === null ? "none" : getComputedStyle(mist).display,
      mistAnimation: mist === null ? "none" : getComputedStyle(mist).animationName,
      animated,
      transitioned,
      transitions,
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
          // High contrast takes the decorative mist away, even when motion is allowed, and runs no transition (L5.6).
          expect(read.mistDisplay).toBe("none");
          expect(read.animated).toEqual([]);
          expect(read.transitioned).toEqual([]);
        } else {
          // Motion is allowed: the one decoration is the mist. The only other thing that moves is the colour of a button,
          // its fill and its border, in 120 ms (L5.5). Nothing else has a transition.
          expect(read.mistDisplay).not.toBe("none");
          expect(read.mistAnimation).not.toBe("none");
          expect(read.transitions.length, "buttons change colour in 120 ms").toBeGreaterThan(0);
          for (const t of read.transitions) {
            expect(t.button, `a transition on something that is not a button: ${JSON.stringify(t)}`).toBe(true);
            expect(t.property).toBe("background-color, border-color");
            expect(t.duration).toBe("0.12s, 0.12s");
          }
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

// ---- Components (spec 07, L5) ----------------------------------------------------------------------------------
// The sizes of the shared components, read from the real page: a button 46 high, an index row 44, a field 48, a check
// row 44 with a 24 px box inside a 44 by 44 target, an invalid field with a 3 px solid error border and a mark, and a
// saved notice with its tick. `measureLayout` already refuses a target under 44 or two targets under 12 apart.

for (const app of APPS) {
  test.describe(`${app.title}, components`, () => {
    test.use({ baseURL: app.origin });

    test("a button is 46 high, an index row is 44 high with a chevron and 12 apart, and a field is 48 high", async ({ page }) => {
      const siteId = await openPractice(page, app);
      await page.goto(`/#/r/${siteId}`);
      await settle(page);
      const read = await page.evaluate(() => {
        const visible = (el: Element): boolean => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
        const rect = (el: Element) => el.getBoundingClientRect();
        const rows = [...document.querySelectorAll<HTMLElement>(".link-group .button")].filter(visible);
        const groupOf = (el: Element): number => [...document.querySelectorAll(".link-group ul")].indexOf(el.closest("ul") as Element);
        const primary = [...document.querySelectorAll<HTMLElement>("main .button.primary")].filter(visible)[0];
        const outlined = [...document.querySelectorAll<HTMLElement>("main .button:not(.primary):not(.quiet)")].filter((b) => visible(b) && b.closest(".link-group") === null)[0];
        const field = [...document.querySelectorAll<HTMLElement>('main input:not([type="checkbox"]):not([type="radio"])')].filter(visible)[0];
        return {
          rows: rows.map((r) => ({ group: groupOf(r), groupWidth: rect(r.closest("ul") as Element).width, top: rect(r).top, bottom: rect(r).bottom, height: rect(r).height, width: rect(r).width, chevron: getComputedStyle(r, "::after").content, border: getComputedStyle(r).borderTopWidth })),
          keyGap: ((): number => {
            const sheet = document.querySelector(".sheet-scroll");
            const key = document.querySelector(".map-key");
            return sheet === null || key === null ? Number.NaN : key.getBoundingClientRect().top - sheet.getBoundingClientRect().bottom;
          })(),
          primaryHeight: primary === undefined ? 0 : rect(primary).height,
          outlinedHeight: outlined === undefined ? 0 : rect(outlined).height,
          fieldHeight: field === undefined ? 0 : rect(field).height,
          fieldFont: field === undefined ? "" : getComputedStyle(field).fontSize,
          labelFont: ((): string => {
            const label = document.querySelector<HTMLElement>(".field label");
            return label === null ? "" : `${getComputedStyle(label).fontSize} ${getComputedStyle(label).fontWeight}`;
          })(),
        };
      });
      expect(read.rows.length, "the index rows of the desk").toBeGreaterThanOrEqual(3);
      expect(read.rows.some((row, i) => read.rows[i + 1]?.group === row.group), "a group of more than one row was measured").toBe(true);
      for (const [i, row] of read.rows.entries()) {
        expect(Math.round(row.height), `row ${i} height`).toBe(44);
        expect(Math.round(row.width), `row ${i} fills its group`).toBe(Math.round(row.groupWidth));
        expect(row.chevron, `row ${i} has a chevron`).toContain("›");
        expect(row.border).toBe("1px");
        const next = read.rows[i + 1];
        if (next !== undefined && next.group === row.group) expect(Math.round(next.top - row.bottom), `rows ${i} and ${i + 1} are 12 apart`).toBe(12);
      }
      expect(Math.abs(read.keyGap), "the key joins the map: the two frames touch").toBeLessThanOrEqual(1);
      expect(Math.round(read.primaryHeight), "the main action").toBeGreaterThanOrEqual(46);
      expect(Math.round(read.primaryHeight), "the main action").toBeLessThanOrEqual(60);
      expect(Math.round(read.outlinedHeight), "an outlined button").toBeGreaterThanOrEqual(46);
      expect(Math.round(read.fieldHeight), "a field").toBe(48);
      expect(read.fieldFont).toBe("16px");
      expect(read.labelFont).toBe("14px 700");
      await check(page, "desk components");
    });

    test("a check row is 44 high with a 24 px box in a 44 by 44 target, and the saved notice has its tick", async ({ page }) => {
      await page.goto("/#/settings");
      await settle(page);
      const checkRow = await page.evaluate(() => {
        const input = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')].find((el) => el.getBoundingClientRect().height > 0);
        if (input === undefined) return undefined;
        const row = input.closest(".check");
        const before = getComputedStyle(input, "::before");
        const r = input.getBoundingClientRect();
        return {
          rowHeight: row === null ? 0 : row.getBoundingClientRect().height,
          width: r.width,
          height: r.height,
          boxWidth: before.width,
          boxHeight: before.height,
          boxBorder: before.borderTopWidth,
          appearance: getComputedStyle(input).appearance,
        };
      });
      expect(checkRow, "a check box or a radio button on the settings screen").toBeDefined();
      expect(Math.round(checkRow?.rowHeight ?? 0)).toBe(44);
      expect([checkRow?.width, checkRow?.height]).toEqual([44, 44]);
      expect([checkRow?.boxWidth, checkRow?.boxHeight, checkRow?.boxBorder]).toEqual(["24px", "24px", "2px"]);
      expect(checkRow?.appearance).toBe("none");
      await check(page, "settings with check rows");

      await page.getByLabel("Reduce motion").check();
      await expect(page.getByLabel("Reduce motion")).toBeChecked();
      await page.getByRole("button", { name: "Save settings" }).click();
      const notice = page.locator(".notice.good");
      await expect(notice).toHaveText("Settings saved.");
      const style = await notice.evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, mark: getComputedStyle(el, "::before").width, markColour: getComputedStyle(el, "::before").backgroundColor, tick: getComputedStyle(el, "::after").transform, text: el.textContent }));
      expect(style.border).toBe("rgb(31, 91, 54)");
      expect([style.mark, style.markColour]).toEqual(["24px", "rgb(31, 91, 54)"]);
      expect(style.tick).not.toBe("none");
      expect(style.text, "the mark adds no word").toBe("Settings saved.");
    });

    test("an invalid field has a 3 px solid error border, a mark and the message, and holds focus", async ({ page }) => {
      await page.goto("/#/new");
      await settle(page);
      if (app.currency !== undefined) await page.getByLabel("Currency").selectOption(app.currency);
      await page.getByRole("button", { name: "Create register" }).click();
      const message = page.getByText("Enter a site name.");
      await expect(message).toBeVisible();
      const input = page.getByLabel("Site name");
      await expect(input).toBeFocused();
      const field = await input.evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: s.borderTopWidth, style: s.borderTopStyle, colour: s.borderTopColor, height: el.getBoundingClientRect().height };
      });
      expect(field).toEqual({ width: "3px", style: "solid", colour: "rgb(139, 26, 26)", height: 48 });
      const mark = await message.evaluate((el) => {
        const s = getComputedStyle(el, "::before");
        return { width: s.width, height: s.height, radius: s.borderTopLeftRadius, colour: s.backgroundColor, weight: getComputedStyle(el).fontWeight, ink: getComputedStyle(el).color, text: el.textContent };
      });
      expect(mark.width).toBe("20px");
      expect(mark.height).toBe("20px");
      expect(mark.radius).toBe("50%");
      expect(mark.colour).toBe("rgb(139, 26, 26)");
      expect(mark.weight).toBe("600");
      expect(mark.ink).toBe("rgb(139, 26, 26)");
      expect(mark.text, "the mark adds no word").toBe("Enter a site name.");
      await check(page, "invalid field");
    });
  });
}

// ---- The desks (spec 07, tasks 7.17 to 7.19, L7.4 to L7.7) ----------------------------------------------------------
// Three columns on both desks: the find and the job (flex 25 1 340px), the chosen plot with its map (40 1 520px) and the
// index (16 1 220px). They wrap in order on a narrow screen. `main` is 105rem wide on a desk, with its side padding.
// Sizes are read from the page, and the expected widths are worked from the flex rule, not copied from the output.

const WIDTHS: { width: number; height: number }[] = [
  { width: 360, height: 640 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

interface DeskRects {
  find: { x: number; y: number; width: number; bottom: number };
  main: { x: number; y: number; width: number; bottom: number };
  index: { x: number; y: number; width: number; bottom: number };
  columns: { width: number; gap: number };
  /** The document order of the three columns, from `compareDocumentPosition`. */
  inOrder: boolean;
  mainWidth: number;
  mainPadding: number;
  indexGroups: string[];
  outsideIndex: string[];
  scroll: { scroll: number; client: number };
}

async function readDesk(page: Page): Promise<DeskRects> {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top + window.scrollY, width: r.width, bottom: r.bottom + window.scrollY };
    };
    const desk = document.querySelector(".desk") as HTMLElement;
    const find = document.querySelector(".desk-find") as HTMLElement;
    const main = document.querySelector(".desk-main") as HTMLElement;
    const index = document.querySelector(".desk-index") as HTMLElement;
    const style = getComputedStyle(desk);
    const mainEl = document.querySelector("main") as HTMLElement;
    const mainStyle = getComputedStyle(mainEl);
    const names = (root: Element) => [...root.querySelectorAll("nav.link-group")].map((n) => (document.getElementById(n.getAttribute("aria-labelledby") ?? "")?.textContent ?? "").trim());
    return {
      find: box(".desk-find"),
      main: box(".desk-main"),
      index: box(".desk-index"),
      columns: { width: desk.getBoundingClientRect().width, gap: parseFloat(style.columnGap) },
      inOrder: Boolean(find.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(main.compareDocumentPosition(index) & Node.DOCUMENT_POSITION_FOLLOWING),
      mainWidth: mainEl.getBoundingClientRect().width,
      mainPadding: parseFloat(mainStyle.paddingLeft),
      indexGroups: names(index),
      outsideIndex: [...document.querySelectorAll("main nav.link-group")].filter((n) => !index.contains(n)).map((n) => n.id),
      scroll: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    };
  });
}

/** What `flex: 25 1 340px`, `40 1 520px` and `16 1 220px` give three columns in a row, worked from the rule. */
function expectedWidths(room: number, gap: number): [number, number, number] {
  const free = room - 2 * gap - (340 + 520 + 220);
  return [340 + (free * 25) / 81, 520 + (free * 40) / 81, 220 + (free * 16) / 81];
}

for (const app of APPS) {
  test.describe(`${app.title}, the desk in three columns`, () => {
    test.use({ baseURL: app.origin });

    test("stands in three columns that wrap in order, with no sideways scroll, at 360, 1440 and 1920 wide", async ({ page }) => {
      const siteId = await openPractice(page, app);
      for (const size of WIDTHS) {
        await page.setViewportSize(size);
        await page.goto(`/#/r/${siteId}`);
        await settle(page);
        const d = await readDesk(page);
        const label = `${app.key} at ${size.width}`;
        expect(d.scroll.scroll, `${label}: no sideways scroll`).toBeLessThanOrEqual(d.scroll.client);
        expect(d.inOrder, `${label}: the columns are in the order find, plot, index`).toBe(true);
        expect(d.indexGroups, `${label}: the index holds Records, Share and Site, in one wrapper`).toEqual(["Records", "Share", "Site"]);
        expect(d.outsideIndex, `${label}: no index group stands outside the wrapper`).toEqual([]);
        // `main` is 105rem at most (1680 px) with its side padding: 16 px at 360, 2.8 percent of the width up to 40 px.
        expect(d.mainWidth, `${label}: main`).toBeLessThanOrEqual(1680 + 0.5);
        expect(d.mainWidth, `${label}: main`).toBeCloseTo(Math.min(size.width, 1680), 0);
        expect(d.mainPadding, `${label}: side padding`).toBeCloseTo(Math.min(40, Math.max(16, size.width * 0.028)), 0);
        if (size.width === 360) {
          // Stacked: the same width, each under the one before.
          expect(Math.round(d.find.width), label).toBe(360 - 32);
          expect(Math.round(d.main.width), label).toBe(360 - 32);
          expect(Math.round(d.index.width), label).toBe(360 - 32);
          expect(d.main.y, `${label}: the plot column is under the find column`).toBeGreaterThanOrEqual(d.find.bottom - 1);
          expect(d.index.y, `${label}: the index is under the plot column`).toBeGreaterThanOrEqual(d.main.bottom - 1);
        } else {
          // Three in a row, at one top, in that order, with the widths that the flex rule gives.
          expect(Math.abs(d.find.y - d.main.y), label).toBeLessThanOrEqual(1);
          expect(Math.abs(d.main.y - d.index.y), label).toBeLessThanOrEqual(1);
          expect(d.find.x + d.find.width, label).toBeLessThanOrEqual(d.main.x + 0.5);
          expect(d.main.x + d.main.width, label).toBeLessThanOrEqual(d.index.x + 0.5);
          const [a, b, c] = expectedWidths(d.columns.width, d.columns.gap);
          expect(d.find.width, `${label}: find`).toBeCloseTo(a, 0);
          expect(d.main.width, `${label}: plot`).toBeCloseTo(b, 0);
          expect(d.index.width, `${label}: index`).toBeCloseTo(c, 0);
        }
        await check(page, `${app.key} desk at ${size.width}`);
      }
    });

    test("wraps in order at the widths between: the index drops under the first two columns", async ({ page }) => {
      const siteId = await openPractice(page, app);
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`/#/r/${siteId}`);
      await settle(page);
      const d = await readDesk(page);
      expect(d.scroll.scroll).toBeLessThanOrEqual(d.scroll.client);
      expect(Math.abs(d.find.y - d.main.y)).toBeLessThanOrEqual(1);
      expect(d.find.x + d.find.width).toBeLessThanOrEqual(d.main.x + 0.5);
      expect(d.index.y, "the index wraps under the plot column").toBeGreaterThanOrEqual(Math.max(d.find.bottom, d.main.bottom) - 1);
      await check(page, `${app.key} desk at 1024`);
    });

    test("is read and tabbed in the order of the columns", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const events = await storedEvents(page, siteId);
      const plot = plotIdOf(events, app.key === "churchyard" ? "Y07" : "B02");
      await page.goto(`/#/r/${siteId}?plot=${plot}`);
      await settle(page);
      // Start from the top of the page: a click on the empty band sets where Tab begins.
      await page.mouse.click(2, 2);
      // Each name is reached after the one before it, in the order of the columns. A wrong order does not reach it.
      const order: (string | RegExp)[] =
        app.key === "churchyard"
          ? ["Change register", "Name or plot code", "Search", "Open plot", "Site map", "Record a burial", "Back up"]
          : ["Change register", "Make an offer", "Name or plot code", "Search", /^Waiting list/, "Back up"];
      for (const name of order) await tabTo(page, name, { max: 80 });
      // The reading order is the same: the DOM order of the three columns.
      expect((await readDesk(page)).inOrder).toBe(true);
    });
    test("puts Change register in the heading row, with the title", async ({ page }) => {
      await openPractice(page, app);
      await settle(page);
      for (const size of [{ width: 1440, height: 900 }, { width: 360, height: 640 }]) {
        await page.setViewportSize(size);
        await settle(page);
        const rows = await page.evaluate(() => {
          const head = document.querySelector(".desk-head") as HTMLElement;
          const h1 = head.querySelector("h1") as HTMLElement;
          const link = head.querySelector("a.button") as HTMLElement;
          const r = (el: Element) => el.getBoundingClientRect();
          return { text: link.textContent, inside: head.contains(link), h1Mid: (r(h1).top + r(h1).bottom) / 2, linkTop: r(link).top, linkBottom: r(link).bottom, h1Top: r(h1).top, h1Bottom: r(h1).bottom, headBottom: r(head).bottom, deskTop: r(document.querySelector(".desk") as Element).top };
        });
        expect(rows.text).toBe("Change register");
        expect(rows.inside).toBe(true);
        expect(rows.headBottom, "the heading row is above the columns").toBeLessThanOrEqual(rows.deskTop + 1);
        if (size.width > 600) expect(rows.h1Mid, "on one row with the title").toBeGreaterThanOrEqual(rows.linkTop - 1);
        if (size.width > 600) expect(rows.h1Mid).toBeLessThanOrEqual(rows.linkBottom + 1);
      }
    });
  });
}

test.describe("Churchyard Register, the chosen plot", () => {
  test.use({ baseURL: CHURCH.origin });

  test("has Open plot and Site map in the Selected plot heading row", async ({ page }) => {
    const siteId = await openPractice(page, CHURCH);
    const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
    for (const size of [{ width: 1440, height: 900 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(size);
      await page.goto(`/#/r/${siteId}?plot=${plot}`);
      await settle(page);
      const row = await page.evaluate(() => {
        const heading = document.getElementById("selected-heading") as HTMLElement;
        const head = heading.parentElement as HTMLElement;
        const links = [...head.querySelectorAll("a.button")] as HTMLElement[];
        const r = (el: Element) => el.getBoundingClientRect();
        return { links: links.map((l) => l.textContent), tops: links.map((l) => r(l).top), mid: (r(heading).top + r(heading).bottom) / 2, bottoms: links.map((l) => r(l).bottom), before: heading.compareDocumentPosition(links[0] as Node) & Node.DOCUMENT_POSITION_FOLLOWING, cardAfter: Boolean(head.nextElementSibling) };
      });
      expect(row.links).toEqual(["Open plot", "Site map"]);
      expect(row.before).toBeTruthy();
      if (size.width > 600) {
        for (const [i] of row.links.entries()) {
          expect(row.mid, "on one row with the heading").toBeGreaterThanOrEqual((row.tops[i] as number) - 1);
          expect(row.mid).toBeLessThanOrEqual((row.bottoms[i] as number) + 1);
        }
      }
      await check(page, `chosen plot at ${size.width}`);
    }
  });

  test("at 1440 by 900 the map and its key end above the fold, with a plot chosen and with none", async ({ page }) => {
    const siteId = await openPractice(page, CHURCH);
    const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of [`/#/r/${siteId}`, `/#/r/${siteId}?plot=${plot}`]) {
      await page.goto(route);
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      const key = await page.getByRole("list", { name: "Map key" }).boundingBox();
      const map = await page.getByRole("region", { name: "Site map" }).boundingBox();
      expect(key, "the key is drawn").not.toBeNull();
      expect((map?.y ?? 0) + (map?.height ?? 0), `${route}: the map ends above 900`).toBeLessThanOrEqual(900);
      expect((key?.y ?? 0) + (key?.height ?? 0), `${route}: the key ends above 900`).toBeLessThanOrEqual(900);
    }
  });
});

// ---- The night ground (spec 07, task 7.16, L7.6) -----------------------------------------------------------------

/** Every visible text and the colour of what stands behind it, read from the page. `night` is the page ground. */
async function textOnGround(page: Page, root = "body"): Promise<{ text: string; colour: string; behind: string }[]> {
  return page.evaluate((rootSelector) => {
    const parse = (v: string): number[] | undefined => {
      const m = /rgba?\(([^)]+)\)/.exec(v);
      return m === null ? undefined : (m[1] as string).split(/[ ,/]+/).filter(Boolean).map(Number);
    };
    const hex = (c: number[]): string => `#${c.slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    const out: { text: string; colour: string; behind: string }[] = [];
    const walker = document.createTreeWalker(document.querySelector(rootSelector) as Element, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = (n.textContent ?? "").trim();
      if (el === null || text === "" || ["SCRIPT", "STYLE", "OPTION", "TITLE"].includes(el.tagName)) continue;
      if (el.getBoundingClientRect().width === 0 || el.closest("[aria-hidden='true']") !== null) continue;
      let behind = "#ffffff";
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const c = parse(getComputedStyle(p).backgroundColor);
        if (c !== undefined && (c[3] ?? 1) > 0.99) {
          behind = hex(c);
          break;
        }
      }
      const colour = parse(el.namespaceURI === "http://www.w3.org/2000/svg" ? getComputedStyle(el).fill : getComputedStyle(el).color);
      out.push({ text: text.slice(0, 30), colour: colour === undefined ? "?" : hex(colour), behind });
    }
    return out;
  }, root);
}

test.describe("Churchyard Register, the night ground", () => {
  test.use({ baseURL: CHURCH.origin });

  test("stands the page on the night, and only the ground's two text colours stand on it", async ({ page }) => {
    const siteId = await openPractice(page, CHURCH);
    const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
    const routes = ["", `?plot=${plot}`, "/map", "/list", "/burial/new", "/family", "/report", "/settings", "/help", "/exchange", "/backup", "/reserve", "/unplaced", "/add"];
    for (const route of routes) {
      await page.goto(`/#/r/${siteId}${route}`);
      await settle(page);
      const ground = await page.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]);
      expect(ground, `${route}: the page ground`).toEqual(["rgb(35, 42, 92)", "rgb(35, 42, 92)"]);
      const onNight = (await textOnGround(page)).filter((t) => t.behind === "#232a5c");
      for (const t of onNight) expect(["#faf5e9", "#c9cee6"], `${route}: "${t.text}" stands on the night in ${t.colour}`).toContain(t.colour);
      // Ink never stands on the night. Every ink text stands on a sheet.
      const ink = (await textOnGround(page)).filter((t) => t.colour === "#22252c");
      for (const t of ink) expect(t.behind, `${route}: "${t.text}" is ink on ${t.behind}`).not.toBe("#232a5c");
      await check(page, `night ground, ${route === "" ? "home" : route}`);
    }
    // The desk has text on the ground itself: its heading and its state line.
    await page.goto(`/#/r/${siteId}?plot=${plot}`);
    await settle(page);
    const deskNight = (await textOnGround(page)).filter((t) => t.behind === "#232a5c");
    expect(deskNight.length, "the desk has text on the night").toBeGreaterThanOrEqual(4);
    expect(deskNight.map((t) => t.text)).toContain("Lantern Fold");
  });

  test("has no night ground in high contrast: the page is white, the text black, and the sheets keep an edge", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("plotwarden.settings", JSON.stringify({ motion: "follow", contrast: "high", paper: "A4" })));
    const siteId = await openPractice(page, CHURCH);
    const plot = plotIdOf(await storedEvents(page, siteId), "Y07");
    await page.goto(`/#/r/${siteId}?plot=${plot}`);
    await settle(page);
    const read = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      colour: getComputedStyle(document.body).color,
      card: getComputedStyle(document.querySelector(".card") as Element).borderTopWidth,
    }));
    expect(read).toEqual({ html: "rgb(255, 255, 255)", body: "rgb(255, 255, 255)", colour: "rgb(0, 0, 0)", card: "2px" });
    // The header keeps its sky in high contrast. The page under it has no night ground.
    expect((await textOnGround(page, "main")).filter((t) => t.behind === "#232a5c")).toEqual([]);
    await check(page, "high contrast desk");
    await page.goto(`/#/r/${siteId}/settings`);
    await settle(page);
    await check(page, "high contrast settings");
  });
});

// ---- The allotment desk card (spec 07, task 7.19, L7.4) ---------------------------------------------------------------

test.describe("Allotment Register, the desk card", () => {
  test.use({ baseURL: GARDEN.origin });

  test("holds the next free plot, the next applicant, Make an offer and the tally in one card", async ({ page }) => {
    const siteId = await openPractice(page, GARDEN);
    for (const size of [{ width: 1440, height: 900 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(size);
      await page.goto(`/#/r/${siteId}`);
      await settle(page);
      const read = await page.evaluate(() => {
        const cards = document.querySelectorAll(".desk-card");
        const card = cards[0] as HTMLElement;
        const style = (el: Element) => getComputedStyle(el);
        const swatch = card.querySelector(".bed-swatch") as HTMLElement;
        const code = card.querySelector("p.big.code") as HTMLElement;
        const name = card.querySelector("p.big:not(.code)") as HTMLElement;
        const offer = [...card.querySelectorAll("a.button, button.button")].find((a) => a.textContent === "Make an offer") as HTMLElement;
        const tally = card.querySelector(".tally") as HTMLElement;
        const headings = [...card.querySelectorAll("h2")].map((h) => h.textContent);
        const inner = card.clientWidth - parseFloat(style(card).paddingLeft) - parseFloat(style(card).paddingRight);
        const search = [...document.querySelectorAll<HTMLElement>("main form[role='search'] .button")].find((b) => b.textContent === "Search") as HTMLElement;
        return {
          count: cards.length,
          one: [swatch, code, name, offer, tally].every((el) => el.closest(".card") === card),
          swatch: { w: swatch.offsetWidth, h: swatch.offsetHeight, bg: style(swatch).backgroundColor, hidden: swatch.getAttribute("aria-hidden"), text: swatch.textContent },
          code: { size: style(code).fontSize, weight: style(code).fontWeight, text: code.textContent },
          name: { size: style(name).fontSize, weight: style(name).fontWeight, text: name.textContent },
          offer: { w: offer.getBoundingClientRect().width, h: offer.getBoundingClientRect().height, size: style(offer).fontSize, primary: offer.classList.contains("primary"), inner },
          tally: tally.textContent,
          headings,
          primaries: [...document.querySelectorAll("main .button.primary")].map((b) => b.textContent),
          search: { primary: search.classList.contains("primary"), border: style(search).borderTopWidth, fill: style(search).backgroundColor },
          searchAfterCard: Boolean(card.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
      });
      const label = `at ${size.width}`;
      expect(read.count, label).toBe(1);
      expect(read.one, `${label}: the swatch, the code, the name, Make an offer and the tally are in one card`).toBe(true);
      expect(read.headings, label).toEqual(["Next free plot", "Next applicant"]);
      expect([read.swatch.w, read.swatch.h], `${label}: the bed swatch`).toEqual([46, 34]);
      expect(read.swatch.bg, `${label}: the swatch is the tab colour`).toBe("rgb(191, 224, 234)");
      expect(read.swatch.hidden).toBe("true");
      expect(read.swatch.text).toBe("");
      expect([read.code.size, read.code.weight], `${label}: the code`).toEqual(["34px", "700"]);
      expect([read.name.size, read.name.weight], `${label}: the name`).toEqual(["24px", "700"]);
      expect(read.code.text).toMatch(/^B\d\d$/);
      expect((read.name.text ?? "").length).toBeGreaterThan(2);
      expect(read.offer.primary).toBe(true);
      expect(read.offer.h, `${label}: Make an offer is 52 high`).toBeCloseTo(52, 0);
      expect(read.offer.w, `${label}: Make an offer fills the card`).toBeCloseTo(read.offer.inner, 0);
      expect(read.offer.size).toBe("18px");
      expect(read.tally).toMatch(/^\d+ free · \d+ reserved · \d+ taken · \d+ unusable$/);
      expect(read.primaries, `${label}: Make an offer is the one main action`).toEqual(["Make an offer"]);
      expect(read.search, `${label}: Search is an outlined button`).toEqual({ primary: false, border: "2px", fill: "rgb(255, 254, 246)" });
      expect(read.searchAfterCard, `${label}: Search comes after the card`).toBe(true);
      await check(page, `allotment desk card at ${size.width}`);
    }
  });

  test("marks the next free plot on the plan as the chosen one, until the keeper chooses another", async ({ page }) => {
    const siteId = await openPractice(page, GARDEN);
    await page.goto(`/#/r/${siteId}`);
    await settle(page);
    const next = (await page.locator(".desk-card p.big.code").textContent()) as string;
    const marked = async (): Promise<{ selected: number; tab: string | null }> =>
      page.evaluate(() => ({ selected: document.querySelectorAll("svg.sheet .plot.selected").length, tab: document.querySelector("svg.sheet .tab-text")?.textContent ?? null }));
    expect(await marked(), "the next free plot is chosen on the plan").toEqual({ selected: 1, tab: next });
    // The offer link names the same plot that the plan marks.
    const events = await storedEvents(page, siteId);
    expect(await page.getByRole("link", { name: "Make an offer" }).getAttribute("href")).toContain(`plot=${plotIdOf(events, next)}`);
    // The keeper's own choice wins.
    const other = ["B01", "B02", "B04", "B05", "B06"].find((code) => code !== next) as string;
    await page.goto(`/#/r/${siteId}?plot=${plotIdOf(events, other)}`);
    await settle(page);
    expect(await marked()).toEqual({ selected: 1, tab: other });
    await check(page, "the plan with a chosen bed");
  });
});
// Print the sizes the spec ran at, so a reader of the log can see both.
test("runs at a known size", ({ page }) => {
  const size = page.viewportSize() as { width: number; height: number };
  expect([`${size.width}x${size.height}`]).toEqual([sizeOf(page) === "phone" ? "360x640" : "1920x1080"]);
});

export type { AppUnderTest };

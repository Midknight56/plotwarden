// What the browser specs of spec 06 share: the two apps under test, how to start a register and open a
// practice register the way a person does, and how to read the local database from inside the page. Test
// helper. The template never imports it.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export interface AppUnderTest {
  /** The folder name in `docs/acceptance/layout/routes`. */
  key: "churchyard" | "allotment";
  title: string;
  origin: string;
  practice: string;
  /** A currency is asked for when a register is started. */
  currency?: string;
}

export const CHURCH: AppUnderTest = { key: "churchyard", title: "Churchyard Register", origin: "http://127.0.0.1:4176/", practice: "Lantern Fold" };
export const GARDEN: AppUnderTest = { key: "allotment", title: "Allotment Register", origin: "http://127.0.0.1:4178/", practice: "Thimble Beds", currency: "GBP" };
export const APPS: readonly AppUnderTest[] = [CHURCH, GARDEN];

export const sizeOf = (page: Page): "phone" | "desktop" => ((page.viewportSize()?.width ?? 0) < 600 ? "phone" : "desktop");

/** The ID of the open register, read from the address. */
export function siteIdOf(page: Page): string {
  const match = /#\/r\/([^/?]+)/.exec(page.url());
  if (match === null) throw new Error(`No register is open at ${page.url()}`);
  return decodeURIComponent(match[1] as string);
}

/** The route of the open register, such as `map` or `plot/abc`, from the address. */
export async function registerRoute(page: Page, siteId: string, area = ""): Promise<void> {
  // Keep the path of the app (a live site serves each app under its own path). Local apps are at "/".
  const here = new URL(page.url());
  await page.goto(`${here.origin}${here.pathname}#/r/${siteId}${area === "" ? "" : `/${area}`}`);
}

/** Open the practice register from the library of an app, as a first time visitor would. */
export async function openPractice(page: Page, app: AppUnderTest): Promise<string> {
  await page.goto(app.origin);
  await page.getByRole("button", { name: `Open ${app.practice}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
  return siteIdOf(page);
}

/** Start a register of the keeper's own, by the form, and land on its home. */
export async function startOwn(page: Page, app: AppUnderTest, title: string): Promise<string> {
  await page.goto(app.origin);
  await page.getByRole("link", { name: "Start a register" }).click();
  await page.getByLabel("Site name").fill(title);
  await page.getByLabel("Local time zone").selectOption("Europe/London");
  if (app.currency !== undefined) await page.getByLabel("Currency").selectOption(app.currency);
  await page.getByRole("button", { name: "Create register" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return siteIdOf(page);
}

export interface StoredEventRow {
  seq: number;
  type: string;
  entityIds: string[];
  payload: Record<string, unknown>;
}

/** Every stored event of a register, read from the page's own local database. Reads only. */
export async function storedEvents(page: Page, siteId: string): Promise<StoredEventRow[]> {
  return page.evaluate(
    (id) =>
      new Promise<StoredEventRow[]>((resolve, reject) => {
        const open = indexedDB.open("plotwarden");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("events").objectStore("events").index("bySite").getAll(id);
          request.onsuccess = () => {
            db.close();
            resolve((request.result as StoredEventRow[]).sort((a, b) => a.seq - b.seq));
          };
          request.onerror = () => reject(request.error);
        };
      }),
    siteId,
  );
}

/** The titles of every register in the local database, own and practice. */
export async function storedSites(page: Page): Promise<{ id: string; title: string; workspace: string; revision: number }[]> {
  return page.evaluate(
    () =>
      new Promise<{ id: string; title: string; workspace: string; revision: number }[]>((resolve, reject) => {
        const open = indexedDB.open("plotwarden");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("sites").objectStore("sites").getAll();
          request.onsuccess = () => {
            db.close();
            resolve((request.result as { id: string; title: string; workspace?: string; revision: number }[]).map((s) => ({ id: s.id, title: s.title, workspace: s.workspace ?? "own", revision: s.revision })));
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

/** The ID of a plot by its code, from the stored events. */
export function plotIdOf(events: StoredEventRow[], code: string): string {
  for (const e of events) {
    if (e.type !== "plot_added") continue;
    if ((e.payload["code"] as string | undefined) === code) return e.payload["plotId"] as string;
  }
  throw new Error(`No plot ${code}`);
}

/** The first event of a type, or an error. */
export function firstOf(events: StoredEventRow[], type: string): StoredEventRow {
  const found = events.find((e) => e.type === type);
  if (found === undefined) throw new Error(`No ${type} event`);
  return found;
}

/** Wait until the page has drawn what the address names: a heading, no "opening" notice, two frames. */
export async function settle(page: Page): Promise<void> {
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.waitForFunction(() => !/Opening register/.test(document.querySelector("main")?.textContent ?? ""));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // A colour change of 120 ms (a button that was disabled while the page loaded) is over before anything is measured.
  // An animation with no end, the band mist, is left out, because it would hold the wait for ever.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      const timing = a.effect?.getComputedTiming();
      return timing === undefined || timing.iterations === Infinity || a.playState === "finished" || a.playState === "idle";
    }),
  );
}

/** The routes of the library, the same in both apps. */
export const LIBRARY_ROUTES = ["", "new", "restore", "settings", "help", "about", "nope"] as const;

export interface RouteSet {
  /** Routes under `#/r/<site>/`, with every ID worked out from the stored events. */
  register: string[];
}

/** Every route of a practice register, with the IDs a route needs. Read from the register's own stored events. */
export async function routesOf(page: Page, app: AppUnderTest, siteId: string): Promise<RouteSet> {
  const events = await storedEvents(page, siteId);
  const shared = ["", "map", "map/edit", "map/trace", "list", "add", "add/one", "add/fast", "add/import", "exchange", "backup", "restore", "settings", "help"];
  const plot = plotIdOf(events, app.key === "churchyard" ? "Y07" : "B02");
  const withPlot = [...shared.slice(0, 5), `plot/${plot}`, ...shared.slice(5)];
  if (app.key === "churchyard") {
    const burial = firstOf(events, "burial_recorded").payload["burialId"] as string;
    return { register: [...withPlot, "burial/new", `burial/${burial}`, "reserve", "unplaced", "family", "report"] };
  }
  const tenancy = ((firstOf(events, "tenancy_started").payload["tenancy"] as { tenancyId: string }).tenancyId);
  return { register: [...withPlot, "waiting", "offer", "tenancy", `handover/${tenancy}`, "season", "payments", "seeker", "report"] };
}

/**
 * Take the pointer off every control, and wait until the colour of each has settled. After a click the pointer rests on
 * the control it pressed, and a proof picture would show that control in its hover colour as if it were its own. The
 * pointer goes to a corner of the page where no control lies, and each corner is tried in turn.
 */
export async function restPointer(page: Page): Promise<void> {
  const size = page.viewportSize() ?? { width: 360, height: 640 };
  const corners = [
    { x: 0, y: 0 },
    { x: size.width - 1, y: 0 },
    { x: size.width - 1, y: size.height - 1 },
    { x: 0, y: size.height - 1 },
  ];
  for (const corner of corners) {
    const bare = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el === null || el.closest("a, button, input, select, textarea, summary, label, [role='button'], [tabindex]") === null;
    }, corner);
    if (!bare) continue;
    await page.mouse.move(corner.x, corner.y);
    break;
  }
  // The colour change of a control is 120 ms. A picture is taken after it, and after any fade has ended.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      const timing = a.effect?.getComputedTiming();
      return timing === undefined || timing.iterations === Infinity || a.playState === "finished" || a.playState === "idle";
    }),
  );
}

/**
 * Save one small picture of a whole page, as proof of how it looked. JPEG keeps the folder small. The phone size is
 * the tight one, so every route has a phone picture. A desktop picture is kept only for the routes in `DESKTOP_PROOF`.
 * The pointer is off every control first.
 */
export async function proof(page: Page, folder: string, name: string): Promise<void> {
  if (sizeOf(page) === "desktop" && !DESKTOP_PROOF.test(name)) return;
  await restPointer(page);
  await page.screenshot({ path: `${folder}/${name}-${sizeOf(page)}.jpg`, type: "jpeg", quality: 50, fullPage: true });
}

const DESKTOP_PROOF = /^(library-home|desk-|route-(home|map|plot|add-one|exchange|settings)|dialog-|error-|long-name-words-home|zoom200-(home|map))/;

/** A name for a route that is safe in a file name: no slash, no ID. */
export function routeName(route: string): string {
  return route === "" ? "home" : route.replace(/\/[0-9a-f-]{36}$/, "").replace(/\//g, "-");
}
/** The name of the element that has focus, as a person who hears it would get it. Empty when nothing has focus. */
export async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) return "";
    const text = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
    const label = el.getAttribute("aria-label");
    if (label !== null && label !== "") return label;
    const by = el.getAttribute("aria-labelledby");
    if (by !== null) return by.split(" ").map((id) => text(document.getElementById(id))).join(" ").trim();
    if (el.id !== "") {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel !== null) return text(forLabel);
    }
    const wrapping = el.closest("label");
    if (wrapping !== null) return text(wrapping);
    if (el instanceof HTMLInputElement && ["button", "submit"].includes(el.type)) return el.value;
    return text(el);
  });
}

/** Press Tab until the element with this accessible name has focus. Fails after `max` presses. Keyboard only. */
export async function tabTo(page: Page, name: string | RegExp, options: { max?: number; back?: boolean } = {}): Promise<void> {
  const max = options.max ?? 250;
  for (let i = 0; i < max; i++) {
    const current = await focusedName(page);
    if (typeof name === "string" ? current === name : name.test(current)) return;
    await page.keyboard.press(options.back === true ? "Shift+Tab" : "Tab");
  }
  throw new Error(`Tab did not reach "${String(name)}" in ${max} presses`);
}
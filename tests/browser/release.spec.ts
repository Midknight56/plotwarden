// The release, in a real browser, on the assembled site as the static host serves it (spec 06, tasks 6.18, 6.19
// and 6.21; requirements Z4, Z10 and Z16), at 360 by 640 and at 1920 by 1080. It needs `npm run build:apps` and
// `npm run assemble:site` first.
//
// Every direct entry opens as a real page and survives a refresh. Nothing is asked of any address but the
// site's own, no request fails, no picture is missing, no page logs an error (a content policy that blocked
// something would show here), and no page asks for a login. The two registers and the Desk preview open from the
// hub and work. The sample visitor files open from the site and work under the policy the host sends. The
// service worker caches the static shell and nothing else, serves it with the network off, and says when a new
// version waits. Layout is measured on every page of the hub and of the visitor pages, and a proof picture of each
// is saved in docs/acceptance/layout/site.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { openPractice, sizeOf, storedSites } from "../helpers/routes";
import { CHURCH, GARDEN } from "../helpers/routes";
import { FAMILY_FILE, HOSTS, SEEKER_FILE, SITE, expectLayout, expectNoMissingPictures, hubCard, saveProof, startOwnFromHub, trackFailures, trackFaults, tryPracticeFromHub } from "../helpers/siteOrigin";

test.use({ baseURL: SITE });

/** Open an address and check the page is not blank, never failed, and never left the site. */
async function visit(page: Page, path: string): Promise<{ status: number; url: string }> {
  const response = await page.goto(path);
  return { status: response?.status() ?? 0, url: page.url() };
}

const ENTRIES = [
  { path: "", title: "Plotwarden", h1: "Plotwarden", proof: "hub-home" },
  { path: "churchyard/", title: "Churchyard Register", h1: "Churchyard Register", proof: "church-entry" },
  { path: "allotments/", title: "Allotment Register", h1: "Allotment Register", proof: "allotments-entry" },
  { path: "review/", title: "Plotwarden Review Desk", h1: undefined, proof: "review-entry" },
  { path: "visitor/family/", title: "Family map · Plotwarden", h1: "Family map", proof: "visitor-family-home" },
  { path: "visitor/seeker/", title: "Plot seeker map · Plotwarden", h1: "Plot seeker map", proof: "visitor-seeker-home" },
  { path: `visitor/family/${FAMILY_FILE}`, title: "Lantern Fold · Family map", h1: "Lantern Fold", proof: "visitor-family-file" },
  { path: `visitor/seeker/${SEEKER_FILE}`, title: "Thimble Beds · Available plots", h1: "Thimble Beds", proof: "visitor-seeker-file" },
] as const;

test.describe("direct entry and refresh", () => {
  for (const entry of ENTRIES) {
    test(`/${entry.path} opens as a page, refreshes to the same page, and asks for nothing outside the site`, async ({ page }) => {
      const requests = trackRequests(page, SITE);
      const failures = trackFailures(page);
      const faults = trackFaults(page);

      const first = await visit(page, `/${entry.path}`);
      expect(first.status).toBe(200);
      expect(first.url).toBe(`${SITE}${entry.path}`);
      await expect(page.locator("h1").first()).toBeVisible();
      if (entry.h1 !== undefined) await expect(page.locator("h1").first()).toHaveText(entry.h1);
      expect(await page.title()).toContain(entry.title.split(" · ")[0] as string);
      const heading = (await page.locator("h1").first().textContent()) ?? "";
      expect(heading.trim()).not.toBe("");

      await page.reload();
      await expect(page.locator("h1").first()).toHaveText(heading);
      expect(await page.locator("body").innerText()).not.toBe("");

      await expectNoMissingPictures(page);
      expect(requests.external).toEqual([]);
      expect(failures.failures).toEqual([]);
      expect(faults.faults).toEqual([]);
      // No login, no account, no payment form.
      await expect(page.locator('input[type="password"], input[autocomplete="current-password"], input[type="email"]')).toHaveCount(0);
      expect(await page.locator("body").innerText()).not.toMatch(/\b(sign in|log in|login|create an account|subscribe|checkout|pay now)\b/i);
      // The page is one version of itself at both sizes: no sideways scroll.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5)).toBe(true);
    });
  }

  test("a folder without its slash goes to the folder", async ({ page }) => {
    for (const folder of ["churchyard", "allotments", "review", "visitor/family", "visitor/seeker"]) {
      const first = await visit(page, `/${folder}`);
      expect(first.status, folder).toBe(200);
      expect(first.url).toBe(`${SITE}${folder}/`);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });

  test("an address that is not a page is the 404 page with the status 404, and it leads back", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    for (const path of ["/nowhere", "/churchyard/nope.html", "/visitor/family/nope", "/_headers", "/sw.js.map", "/review/nope/"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await expect(page.getByText("This address has no page on this site.")).toBeVisible();
    }
    await expectLayout(page);
    await saveProof(page, "hub-not-found");
    await page.getByRole("link", { name: "Back to start" }).click();
    await expect(page).toHaveURL(SITE);
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    expect(requests.external).toEqual([]);
  });

  test("the headers say one strict policy, with no outside origin, and the other protections", async ({ page }) => {
    for (const entry of ENTRIES) {
      const response = await page.goto(`/${entry.path}`);
      const headers = response?.headers() ?? {};
      const policy = headers["content-security-policy"] ?? "";
      expect(policy, entry.path).not.toBe("");
      expect(policy, entry.path).not.toMatch(/https?:|\*|unsafe-eval/);
      expect(policy.split(",").length, `${entry.path} has two policies`).toBe(1);
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("no-referrer");
      if (entry.path.startsWith("visitor/") && entry.path.endsWith(".html")) expect(policy).toContain("default-src 'none'");
      else expect(policy).toContain("script-src 'self'");
    }
  });
});

// The live host matches each `_headers` rule on the address that was asked, so the rule for `/404.html` never reaches
// the 404 page there (curl, 22 Nov 2026). The preview on port 4182 matches the same way. The page therefore holds its own
// policy in a meta tag. A policy counts when it comes from the header or from that tag, and it must refuse an inline script.
for (const host of HOSTS) {
  test.describe(`the 404 page on ${host.name}`, () => {
    test.use({ baseURL: host.origin });

    for (const path of ["/no-such-page", "/churchyard/nope.html", "/visitor/family/nope", "/_headers"]) {
      test(`${path} answers 404 with the 404 page, and the page holds a policy that refuses an inline script`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(404);
        await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
        const header = response?.headers()["content-security-policy"] ?? "";
        const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content") ?? ""));
        const policies = [header, ...meta].filter((policy) => policy !== "");
        expect(policies.length, `${path} has no content policy`).toBeGreaterThan(0);
        for (const policy of policies) expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'|https?:|\*|unsafe-eval/);
        // The browser itself says it: an inline script that is added to the page does not run, and the policy reports it.
        const outcome = await page.evaluate(
          () =>
            new Promise<{ ran: boolean; blocked: string[] }>((resolve) => {
              const blocked: string[] = [];
              document.addEventListener("securitypolicyviolation", (event) => blocked.push(event.violatedDirective));
              const script = document.createElement("script");
              script.textContent = "window.__plotwardenInline = true;";
              document.head.appendChild(script);
              setTimeout(() => resolve({ ran: (window as unknown as Record<string, unknown>)["__plotwardenInline"] === true, blocked }), 100);
            }),
        );
        expect(outcome.ran, `${path} ran an inline script`).toBe(false);
        expect(outcome.blocked.some((directive) => directive.startsWith("script-src")), `${path} reported no script-src violation: ${outcome.blocked.join(",")}`).toBe(true);
      });
    }

    test("the clean address /404 answers 200 on a host that redirects .html, and holds the policy too", async ({ page }) => {
      const response = await page.goto("/404");
      if (host.origin.endsWith(":4174/")) {
        expect(response?.status()).toBe(404);
        return;
      }
      expect(response?.status()).toBe(200);
      const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content") ?? ""));
      expect(meta.length).toBe(1);
      expect(meta[0]).toContain("script-src 'self'");
      expect(meta[0]).not.toContain("frame-ancestors");
    });
  });
}

test.describe("the hub", () => {
  test("says the job first, then what Plotwarden is, and offers each register two buttons and the Desk preview one link", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    const job = page.getByText("Find a burial. Offer a garden plot. Keep the history of both.", { exact: true });
    await expect(job).toBeVisible();
    await expect(page.getByText("Plotwarden keeps plot registers on the keeper's own device.")).toBeVisible();
    // The job line is the first paragraph, above the line about the device.
    const [jobBox, deviceBox, headingBox] = await Promise.all([
      job.boundingBox(),
      page.getByText("Plotwarden keeps plot registers on the keeper's own device.").boundingBox(),
      page.getByRole("heading", { level: 1, name: "Plotwarden" }).boundingBox(),
    ]);
    expect((jobBox?.y ?? 0) > (headingBox?.y ?? 0)).toBe(true);
    expect((jobBox?.y ?? 0) < (deviceBox?.y ?? 0)).toBe(true);

    for (const [which, folder] of [["churchyard", "churchyard/"], ["allotment", "allotments/"]] as const) {
      const card = hubCard(page, which);
      await expect(card).toBeVisible();
      await expect(card.getByRole("link", { name: "Try the practice register" })).toHaveAttribute("href", `${folder}#/practice`);
      await expect(card.getByRole("link", { name: "Start your own" })).toHaveAttribute("href", `${folder}#/new`);
      // A small drawing of the practice map, drawn by the shared sheet: inline, with its name, no picture file.
      const drawing = card.locator("svg.sheet");
      await expect(drawing).toHaveCount(1);
      await expect(drawing).toBeVisible();
      await expect(drawing).toHaveAttribute("role", "img");
      expect(await card.locator("img, image").count()).toBe(0);
    }
    await expect(page.getByRole("link", { name: "Open Churchyard Register" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Allotment Register" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Review Desk preview" })).toHaveAttribute("href", "review/");
    await expect(page.getByRole("link", { name: "See the family map" })).toHaveAttribute("href", "visitor/family/");
    await expect(page.getByRole("link", { name: "See the plot seeker map" })).toHaveAttribute("href", "visitor/seeker/");
    // One thing to press first: the practice buttons are the dark ones, and the start buttons are plain.
    expect(await page.locator("a.button:not(.secondary)").count()).toBe(2);
    await expectLayout(page);
    await saveProof(page, "hub-home");
    expect(requests.external).toEqual([]);
  });

  test("is laid out as the start page of the new look: stripe, bar, title, two doors, the Desk card and the visitor sheets (spec 07, task 7.21)", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    const own = page.viewportSize() as { width: number; height: number };
    for (const size of [own, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
      const label = `at ${size.width}`;
      const read = await page.evaluate(() => {
        const style = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo ?? null);
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
        };
        const q = <T extends Element>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T;
        const stripe = q(".stripe");
        const bar = q("header.bar");
        const brand = q(".brand");
        const main = q("main");
        const doors = [...document.querySelectorAll<HTMLElement>("li.door")];
        const arts = doors.map((d) => q(".door-art", d));
        const desk = q(".review-card");
        const pics = [...document.querySelectorAll<HTMLElement>(".sheet-pic")];
        return {
          scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
          stripe: { h: rect(stripe).h, bg: style(stripe).backgroundImage, y: rect(stripe).y, hidden: stripe.getAttribute("aria-hidden") },
          bar: { h: rect(bar).h, y: rect(bar).y, line: style(bar).borderBottomWidth, text: bar.textContent },
          brand: { image: style(brand, "::before").backgroundImage, w: style(brand, "::before").width, h: style(brand, "::before").height, content: style(brand, "::before").content },
          main: { w: rect(main).w, max: style(main).maxWidth },
          h1: { size: style(q("h1")).fontSize, family: style(q("h1")).fontFamily, weight: style(q("h1")).fontWeight },
          job: { size: style(q(".job")).fontSize, weight: style(q(".job")).fontWeight, family: style(q(".job")).fontFamily },
          lead: { size: style(q(".tagline")).fontSize },
          doors: doors.map((d, i) => ({
            kind: d.className,
            box: rect(d),
            bg: style(d).backgroundColor,
            colour: style(d).color,
            radius: style(d).borderTopLeftRadius,
            art: { h: rect(arts[i] as Element).h, aria: (arts[i] as Element).getAttribute("aria-hidden"), text: (arts[i] as Element).textContent, images: style(arts[i] as Element).backgroundImage.match(/url\(/g)?.length ?? 0 },
            h3: { size: style(q("h3", d)).fontSize, family: style(q("h3", d)).fontFamily, colour: style(q("h3", d)).color },
            buttons: [...d.querySelectorAll<HTMLElement>("a.button")].map((a) => ({ text: a.textContent, h: rect(a).h, bg: style(a).backgroundColor, colour: style(a).color, border: style(a).borderTopWidth, borderColour: style(a).borderTopColor, radius: style(a).borderTopLeftRadius })),
            map: rect(q(".practice-map", d)),
            key: d.querySelectorAll(".map-key").length,
          })),
          desk: { border: style(desk).borderTopWidth, colour: style(desk).borderTopColor, radius: style(desk).borderTopLeftRadius, tag: desk.tagName, box: rect(desk), button: (() => { const b = q<HTMLElement>("a.button", desk); return { text: b.textContent, colour: style(b).color, border: style(b).borderTopColor, h: rect(b).h }; })() },
          pics: pics.map((p) => {
            const row = p.parentElement as HTMLElement;
            const link = q<HTMLElement>("a", row);
            return { aria: p.getAttribute("aria-hidden"), text: p.textContent, box: rect(p), link: rect(link), linkText: link.textContent, tag: p.tagName };
          }),
          images: document.querySelectorAll("img, image").length,
          title: [q("h1")].map((h) => rect(h).y)[0],
        };
      });
      expect(read.scroll[0], `${label}: no sideways scroll`).toBeLessThanOrEqual(read.scroll[1] as number);
      expect(read.stripe.h, `${label}: the stripe is 6 px`).toBe(6);
      expect(read.stripe.hidden).toBe("true");
      expect(read.stripe.bg).toContain("rgb(35, 42, 92)");
      expect(read.stripe.bg).toContain("rgb(47, 107, 79)");
      expect(read.stripe.bg).toContain("rgb(43, 90, 95)");
      expect(read.bar.h, `${label}: the bar is at least 60 px`).toBeGreaterThanOrEqual(60);
      expect(read.bar.y, `${label}: the bar is under the stripe`).toBeCloseTo(6, 0);
      expect(read.bar.line).toBe("1px");
      expect(read.bar.text, `${label}: the bar holds the brand and About`).toBe("PlotwardenAbout");
      expect(read.brand.image, `${label}: the mark is beside the brand`).toContain("mark");
      expect([read.brand.w, read.brand.h]).toEqual(["28px", "28px"]);
      expect(read.brand.content).toBe('""');
      expect(read.main.w, `${label}: main is at most 105rem`).toBeLessThanOrEqual(1680);
      const vw = size.width;
      expect(read.h1.size, `${label}: the title`).toBe(`${Math.min(64, Math.max(40, 0.03 * vw + 22))}px`);
      expect(read.h1.family).toContain("Gelasio");
      expect(read.h1.weight).toBe("700");
      expect(read.job.family).toContain("Gelasio");
      expect(read.job.weight).toBe("600");
      expect(parseFloat(read.job.size), `${label}: the line`).toBeCloseTo(Math.min(28, Math.max(21, 0.01 * vw + 15)), 1);
      expect(read.lead.size).toBe("18px");
      expect(read.doors.map((d) => d.kind)).toEqual(["door church", "door garden"]);
      const [church, garden] = read.doors;
      expect(church?.bg, `${label}: the churchyard door is the night`).toBe("rgb(35, 42, 92)");
      expect(church?.colour).toBe("rgb(250, 245, 233)");
      expect(church?.art.images, "the churchyard art band holds the lantern and the margin").toBe(2);
      expect(garden?.art.images, "the allotment art band holds the margin").toBe(1);
      expect(garden?.bg).toBe("rgb(255, 254, 246)");
      expect(garden?.colour).toBe("rgb(27, 49, 42)");
      expect(garden?.radius).toBe("14px");
      for (const door of read.doors) {
        expect(door.art.aria).toBe("true");
        expect(door.art.text).toBe("");
        expect(door.art.h, `${label}: the art band`).toBeCloseTo(Math.min(112, Math.max(84, 0.07 * vw)), 0);
        expect(door.h3.size).toBe("26px");
        expect(door.key, `${label}: the small map has no key`).toBe(0);
        expect(door.buttons.map((b) => b.text)).toEqual(["Try the practice register", "Start your own"]);
        for (const b of door.buttons) expect(b.h, `${label}: ${b.text} is 48 high`).toBeGreaterThanOrEqual(48);
        expect(door.buttons[0]?.border).toBe("2px");
        expect(door.buttons[1]?.border).toBe("2px");
      }
      expect(church?.buttons[0]?.bg, "the main action of the night door is lantern amber").toBe("rgb(242, 201, 107)");
      expect(church?.buttons[0]?.colour).toBe("rgb(34, 37, 44)");
      expect(church?.buttons[1]?.bg).toBe("rgba(0, 0, 0, 0)");
      expect(church?.buttons[1]?.colour).toBe("rgb(250, 245, 233)");
      expect(church?.buttons[1]?.borderColour).toBe("rgb(250, 245, 233)");
      expect(garden?.buttons[0]?.bg, "the main action of the allotment door is leaf green").toBe("rgb(47, 107, 79)");
      expect(garden?.buttons[0]?.colour).toBe("rgb(255, 255, 255)");
      expect(garden?.buttons[1]?.bg).toBe("rgb(255, 254, 246)");
      expect(garden?.buttons[0]?.radius).toBe("10px");
      expect(church?.buttons[0]?.radius).toBe("2px");
      expect(church?.h3.family).toContain("Gelasio");
      expect(church?.h3.colour).toBe("rgb(250, 245, 233)");
      expect(garden?.h3.colour).toBe("rgb(47, 107, 79)");
      // The doors are side by side where there is room for two of 560, and one under the other where there is not.
      const wide = (size.width - 80) >= 2 * 560 + 24;
      if (wide) {
        expect((garden?.box.x ?? 0), `${label}: side by side`).toBeGreaterThan((church?.box.right ?? 0) - 1);
        expect(Math.abs((garden?.box.w ?? 0) - (church?.box.w ?? 0)), `${label}: equal width`).toBeLessThanOrEqual(1);
        expect((garden?.box.x ?? 0) - (church?.box.right ?? 0), `${label}: 24 px apart`).toBeCloseTo(24, 0);
      } else {
        expect(garden?.box.y ?? 0, `${label}: one under the other`).toBeGreaterThan((church?.box.bottom ?? 0) - 1);
      }
      expect(read.desk.tag, "the Review Desk card is not an article").toBe("SECTION");
      expect(read.desk.border).toBe("2px");
      expect(read.desk.colour).toBe("rgb(43, 90, 95)");
      expect(read.desk.radius).toBe("10px");
      expect(read.desk.button.text).toBe("Open Review Desk preview");
      expect(read.desk.button.colour).toBe("rgb(43, 90, 95)");
      expect(read.desk.box.y, `${label}: the Desk card is under the doors`).toBeGreaterThan(Math.max(church?.box.bottom ?? 0, garden?.box.bottom ?? 0) - 1);
      expect(read.pics.length).toBe(2);
      for (const pic of read.pics) {
        expect(pic.aria).toBe("true");
        expect(pic.text, "a sheet picture has no text").toBe("");
        expect([pic.box.w, pic.box.h]).toEqual([54, 70]);
        expect(pic.box.right, "the picture is beside its button").toBeLessThanOrEqual(pic.link.x);
        expect(pic.link.x - pic.box.right).toBeCloseTo(16, 0);
        expect(Math.abs(pic.box.y + pic.box.h / 2 - (pic.link.y + pic.link.h / 2)), "centred on its button").toBeLessThanOrEqual(2);
      }
      expect(read.images, `${label}: no picture file in the markup`).toBe(0);
      const violations = await measureLayout(page);
      expect(violations, `${label}\n${JSON.stringify(violations, null, 1)}`).toEqual([]);
    }
    expect(requests.external).toEqual([]);
  });

  test("keeps the start page readable in high contrast: plain white doors with a black edge, and no art band", async ({ page }) => {
    await page.emulateMedia({ contrast: "more" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    const read = await page.evaluate(() => {
      const door = document.querySelector(".door.church") as HTMLElement;
      const art = door.querySelector(".door-art") as HTMLElement;
      const style = getComputedStyle(door);
      return { bg: style.backgroundColor, colour: style.color, art: getComputedStyle(art).display };
    });
    expect(read).toEqual({ bg: "rgb(255, 255, 255)", colour: "rgb(0, 0, 0)", art: "none" });
    await expectLayout(page);
  });

  test("About is a hash route that a refresh keeps, and Back and the link return to the start", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(`${SITE}#/about`);
    await expect(page.getByRole("heading", { level: 1, name: "About Plotwarden" })).toBeFocused();
    await expect(page.getByText("Lantern Fold and Thimble Beds are invented places.")).toBeVisible();
    expect(await page.title()).toBe("About Plotwarden · Plotwarden");
    await expectLayout(page);
    await saveProof(page, "hub-about");

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "About Plotwarden" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(SITE);
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
    await page.goForward();
    await page.getByRole("link", { name: "Back to start" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeFocused();
  });

  test("an unknown hash route says Page not found, and leads back", async ({ page }) => {
    await page.goto("/#/nope");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expectLayout(page);
    await page.getByRole("link", { name: "Back to start" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
  });

  test("keeps every choice reachable by keyboard alone", async ({ page }) => {
    await page.goto("/");
    const names: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      names.push(await page.evaluate(() => (document.activeElement?.textContent ?? "").trim()));
    }
    // Eight stops, in reading order: the menu, the two registers with two buttons each, the Desk and the two sheets.
    expect(names).toEqual(["About", "Try the practice register", "Start your own", "Try the practice register", "Start your own", "Open Review Desk preview", "See the family map", "See the plot seeker map"]);
  });
});

for (const kind of [
  { path: "visitor/family/", h1: "Family map", open: "Open the family map", download: "Download the family map", file: FAMILY_FILE, proof: "visitor-family", practice: "Lantern Fold" },
  { path: "visitor/seeker/", h1: "Plot seeker map", open: "Open the plot seeker map", download: "Download the plot seeker map", file: SEEKER_FILE, proof: "visitor-seeker", practice: "Thimble Beds" },
] as const) {
  test.describe(`the ${kind.h1} page`, () => {
    test("says what the sheet is and where it came from, and measures well", async ({ page }) => {
      await page.goto(`/${kind.path}`);
      await expect(page.getByRole("heading", { level: 1, name: kind.h1 })).toBeVisible();
      await expect(page.getByText(`This copy was made from ${kind.practice}, an invented place.`)).toBeVisible();
      await expectLayout(page);
      await saveProof(page, `${kind.proof}-home`);
    });

    test("About is a hash route that a refresh keeps", async ({ page }) => {
      await page.goto(`/${kind.path}`);
      await page.getByRole("link", { name: "About this sheet" }).click();
      await expect(page).toHaveURL(`${SITE}${kind.path}#/about`);
      await expect(page.getByRole("heading", { level: 1, name: "About this sheet" })).toBeFocused();
      await expect(page.getByText("It is one file. It holds no network address, so it opens with no connection.")).toBeVisible();
      await expectLayout(page);
      await saveProof(page, `${kind.proof}-about`);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "About this sheet" })).toBeVisible();
      await page.getByRole("link", { name: "Back to the sheet" }).click();
      await expect(page.getByRole("heading", { level: 1, name: kind.h1 })).toBeVisible();
    });

    test("opens the file, and the file works under the policy that the host sends", async ({ page }) => {
      const faults = trackFaults(page);
      const requests = trackRequests(page, SITE);
      await page.goto(`/${kind.path}`);
      await page.getByRole("link", { name: kind.open }).click();
      await expect(page).toHaveURL(`${SITE}${kind.path}${kind.file}`);
      await expect(page.locator("h1")).toHaveText(kind.practice);
      await expectLayout(page);
      await saveProof(page, kind.path.includes("family") ? "visitor-family-file" : "visitor-seeker-file");
      if (kind.path.includes("family")) {
        // Search by name: the inline script runs, so the policy of the file's own was let through.
        await page.getByLabel("Name or plot code").fill("Quillmoss");
        await page.getByRole("button", { name: "Find", exact: true }).click();
        await expect(page.locator("#list li:visible")).toHaveCount(1);
        await expect(page.locator("#list li:visible")).toContainText("Mirel Quillmoss");
        await page.getByLabel("Name or plot code").fill("zzzz");
        await page.getByRole("button", { name: "Find", exact: true }).click();
        await expect(page.locator("#none")).toBeVisible();
        await page.getByRole("button", { name: "Clear" }).click();
        await page.getByRole("button", { name: "Show location" }).first().click();
        await expect(page.locator("#sel")).toBeVisible();
        await expect(page.locator("#selcode")).toHaveText("Y07");
      } else {
        await expect(page.locator("#list li")).toHaveCount(2);
        await expect(page.locator("#list")).toContainText("B03");
        await expect(page.locator("#list")).toContainText("B05");
        await page.getByRole("button", { name: "Show location" }).first().click();
        await expect(page.locator("#sel")).toBeVisible();
        await expect(page.locator("#selcode")).toHaveText(/^B0[35]$/);
        await expect(page.locator("body")).not.toContainText("Tavi Bramblequill");
      }
      expect(faults.faults).toEqual([]);
      expect(requests.external).toEqual([]);
    });

    test("downloads the same file that it opens", async ({ page }) => {
      await page.goto(`/${kind.path}`);
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: kind.download }).click()]);
      expect(download.suggestedFilename()).toBe(kind.file);
      const response = await page.request.get(`${SITE}${kind.path}${kind.file}`);
      const saved = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of saved) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).equals(await response.body())).toBe(true);
    });

    test("opens with script off, as a plain list that browser Find reads", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL: SITE });
      const page = await context.newPage();
      await page.goto(`/${kind.path}${kind.file}`);
      await expect(page.locator("#list")).toBeVisible();
      await expect(page.locator("#list li").first()).toBeVisible();
      await context.close();
    });
  });
}

test.describe("the registers and the Desk, from the hub", () => {
  for (const app of [
    { ...CHURCH, which: "churchyard", path: "churchyard/", proof: "church-entry" },
    { ...GARDEN, which: "allotment", path: "allotments/", proof: "allotments-entry" },
  ] as const) {
    test(`${app.title}: one press on the hub opens ${app.practice} with its map drawn, nothing leaves the site, and Back returns to the hub`, async ({ page }) => {
      const requests = trackRequests(page, SITE);
      const faults = trackFaults(page);
      await tryPracticeFromHub(page, app.which);
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
      const where = page.url();
      expect(where).toContain(`${SITE}${app.path}#/r/`);
      expect(where).not.toContain("practice");

      // The map is drawn on the home of the register. On a phone it sits under the search, one scroll away.
      const map = page.getByRole("img", { name: /Site map/ });
      await map.scrollIntoViewIfNeeded();
      await expect(map).toBeVisible();
      await expect(map).toBeInViewport();
      expect(await page.locator("svg.sheet .plot").count()).toBeGreaterThanOrEqual(6);
      await expect(page.getByText("No map yet")).toHaveCount(0);
      await expectLayout(page);

      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
      expect(page.url()).toBe(where);
      // The entry replaced itself, so Back is the hub and not a second opening.
      await page.goBack();
      await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
      expect(requests.external).toEqual([]);
      expect(faults.faults).toEqual([]);
    });

    test(`${app.title}: pressing Try the practice register twice gives one practice register`, async ({ page }) => {
      await tryPracticeFromHub(page, app.which);
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
      await tryPracticeFromHub(page, app.which);
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
      const sites = await storedSites(page);
      expect(sites.filter((s) => s.title === app.practice)).toHaveLength(1);
      expect(sites.filter((s) => s.workspace === "own")).toHaveLength(0);
    });

    test(`${app.title}: Start your own opens the form that starts a register, and starts no practice register`, async ({ page }) => {
      const requests = trackRequests(page, SITE);
      const faults = trackFaults(page);
      await startOwnFromHub(page, app.which);
      await expect(page).toHaveURL(`${SITE}${app.path}#/new`);
      await expect(page.getByRole("heading", { level: 1, name: "Start a register" })).toBeVisible();
      await expect(page.getByLabel("Site name")).toBeVisible();
      await expectLayout(page);
      expect(await storedSites(page)).toEqual([]);
      expect(requests.external).toEqual([]);
      expect(faults.faults).toEqual([]);
    });

    test(`${app.title}: the entry page and the practice route are laid out well`, async ({ page }) => {
      await page.goto(`/${app.path}`);
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
      await expectLayout(page);
      await saveProof(page, app.proof);
      await page.getByRole("button", { name: `Open ${app.practice}` }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.practice })).toBeVisible();
    });
  }

  test("the practice registers of the two apps are two registers on one site, and each keeps to its own", async ({ page }) => {
    await openPractice(page, { ...CHURCH, origin: `${SITE}churchyard/` });
    await page.goto(`${SITE}allotments/`);
    await expect(page.getByRole("heading", { level: 1, name: "Allotment Register" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Thimble Beds" })).toBeVisible();
    await expect(page.getByText("Lantern Fold")).toHaveCount(0);
    await page.goto(`${SITE}churchyard/`);
    await expect(page.getByText("Thimble Beds")).toHaveCount(0);
  });

  test("the churchyard finds Y07 by a name, and a family map and a review file come out of it", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    await openPractice(page, { ...CHURCH, origin: `${SITE}churchyard/` });
    await page.getByLabel("Name or plot code", { exact: true }).fill("Quillmoss");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Mirel Quillmoss · Y07 · Yew Walk" })).toBeVisible();
    expect(page.url()).not.toContain("Quillmoss");
    await page.getByRole("link", { name: "Committee review", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Committee review" })).toBeVisible();
    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });

  test("the Review Desk preview opens, shows its own words and a walkthrough, and makes no outside request", async ({ page }) => {
    const requests = trackRequests(page, SITE);
    const faults = trackFaults(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Open Review Desk preview" }).click();
    await expect(page).toHaveURL(`${SITE}review/`);
    await expect(page.getByText("Bring the checks from your registers to one meeting.")).toBeVisible();
    await expectLayout(page);
    await saveProof(page, "review-entry");
    await page.getByRole("button", { name: "Open walkthrough" }).click();
    await expect(page.getByText(/Walkthrough\. The sites here are invented/)).toBeVisible();
    expect(requests.external).toEqual([]);
    expect(faults.faults).toEqual([]);
  });
});

// The built site, as the files lie on disk.
const SITE_DIR = fileURLToPath(new URL("../../dist/site", import.meta.url));

// The Review Desk preview that the site serves (spec 07, task 7.27, L8.3 and L12). The Desk is built in its own
// repository and pinned by `release/desk-preview.lock.json`. The lock is the expected value. These two checks read the
// lock and compare it with what the site serves, and read the screen from its first frame. They do not run the Desk's
// own tests, which are in its repository.
const DESK_LOCK = JSON.parse(readFileSync(fileURLToPath(new URL("../../release/desk-preview.lock.json", import.meta.url)), "utf8")) as {
  revision: string;
  entry: string;
  files: Record<string, string>;
};

test.describe("the Review Desk preview that the site serves", () => {
  test("is the preview the lock names: each pinned file is served with its pinned hash, and the site serves no other file of the Desk", async ({ page }) => {
    expect(DESK_LOCK.revision, "the lock names a Desk commit").toMatch(/^[0-9a-f]{40}$/);
    for (const [rel, hash] of Object.entries(DESK_LOCK.files)) {
      const response = await page.request.get(`${SITE}review/${rel}`);
      expect(response.status(), rel).toBe(200);
      expect(createHash("sha256").update(await response.body()).digest("hex"), `${rel} differs from the lock`).toBe(hash);
    }
    const onDisk: string[] = [];
    const walk = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
        else onDisk.push(`${prefix}${entry.name}`);
      }
    };
    walk(join(SITE_DIR, "review"), "");
    expect(onDisk.sort(), "the files of the Desk in the built site").toEqual(Object.keys(DESK_LOCK.files).sort());
    // The page that the lock names as its entry is the page that the site opens at /review/.
    const entry = await page.request.get(`${SITE}review/`);
    expect(createHash("sha256").update(await entry.body()).digest("hex")).toBe(DESK_LOCK.files[DESK_LOCK.entry]);
  });

  test("opens at full strength from its first frame, with no animation, no transition and no opacity under one", async ({ page }) => {
    await watchFrames(page);
    await page.goto(`${SITE}review/`);
    await expect(page.getByText("Bring the checks from your registers to one meeting.")).toBeVisible();
    const frames = await readFrames(page);
    const drawn = frames.filter((f) => f.elements > 3);
    expect(drawn.length, "frames with the Desk on the page").toBeGreaterThan(10);
    expect(Math.min(...drawn.map((f) => f.opacity)), `the least opacity in any frame: ${JSON.stringify(drawn.slice(0, 6))}`).toBe(1);
    expect(Math.max(...frames.map((f) => f.animations)), "animations that run").toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  // The control: the same reading of a page that does fade in. If the reading could not see a fade, the test above
  // would pass for any Desk.
  test("the reading of the frames sees a fade when there is one", async ({ page }) => {
    await page.route(`${SITE}fade-control`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>x</title><style>@keyframes in{from{opacity:.35}to{opacity:1}}#root{animation:in 600ms ease-out both}</style><div id="root"><p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p></div>`,
      }),
    );
    await watchFrames(page);
    await page.goto(`${SITE}fade-control`);
    const frames = (await readFrames(page)).filter((f) => f.elements > 3);
    expect(Math.min(...frames.map((f) => f.opacity))).toBeLessThan(0.6);
    expect(Math.max(...frames.map((f) => f.animations))).toBeGreaterThan(0);
  });
});

interface Frame {
  opacity: number;
  animations: number;
  elements: number;
}

/**
 * From the start of the next page, read every frame for 90 frames: the least opacity of any element that holds words (the
 * opacity of an element and of everything above it, multiplied) and the number of animations that run. A fade shows as a value under 1
 * in an early frame, and a screen read at that moment looks washed out.
 */
async function watchFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: Frame[] = [];
    (window as unknown as { __frames: Frame[] }).__frames = frames;
    const sample = (): void => {
      let least = 1;
      let count = 0;
      for (const el of document.querySelectorAll("body *")) {
        // Only what shows words. The Desk has a file input laid over its Choose file button with opacity 0, on purpose.
        if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "")) continue;
        count += 1;
        let product = 1;
        for (let node: Element | null = el; node !== null; node = node.parentElement) product *= Number(getComputedStyle(node).opacity);
        least = Math.min(least, product);
      }
      frames.push({ opacity: least, animations: document.getAnimations().length, elements: count });
      if (frames.length < 90) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function readFrames(page: Page): Promise<Frame[]> {
  await page.waitForFunction(() => (window as unknown as { __frames: unknown[] }).__frames.length >= 90);
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

// The fonts of the new look (spec 07, L2). Two families, ten woff2 files, from the site's own origin.

function fontFilesOf(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) fontFilesOf(path, out);
    else if (entry.name.endsWith(".woff2")) out.push(path);
  }
  return out;
}

test.describe("the fonts of the built site", () => {
  test("each font file is in the built site once and in the offline list, and together they are under 150,000 bytes", async ({ page }) => {
    const files = fontFilesOf(SITE_DIR).filter((f) => !/[\\/]review[\\/]/.test(f));
    const names = files.map((f) => f.split(/[\\/]/).pop() as string);
    expect(files.length, `${files.length} font files: ${files.join(", ")}`).toBe(10);
    expect(new Set(names).size, "ten different names").toBe(10);
    const distinct = new Map<string, number>();
    for (const file of files) distinct.set(createHash("sha256").update(readFileSync(file)).digest("hex"), statSync(file).size);
    expect(distinct.size, "ten distinct font files").toBe(10);
    const total = [...distinct.values()].reduce((a, b) => a + b, 0);
    expect(total, `the font files together, ${total} bytes`).toBeLessThan(150_000);
    const shell = await shellOf(page, SITE);
    const listed = shell.files.filter((f) => f.endsWith(".woff2") && !f.startsWith("/review/"));
    expect(listed.length, `the offline list names ${listed.length} font files`).toBe(10);
    for (const file of files) {
      const path = `/${file.slice(SITE_DIR.length + 1).replace(/\\/g, "/")}`;
      expect(shell.files, path).toContain(path);
    }
    const licence = await page.request.get(`${SITE}font-licences.txt`);
    expect(licence.status()).toBe(200);
    expect(await licence.text()).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(shell.files).toContain("/font-licences.txt");
  });

  const PAGES = [
    { path: "", families: ["Atkinson Hyperlegible Next", "Gelasio"] },
    { path: "churchyard/", families: ["Atkinson Hyperlegible Next", "Gelasio"] },
    { path: "allotments/", families: ["Atkinson Hyperlegible Next"] },
  ] as const;
  for (const entry of PAGES) {
    test(`/${entry.path} loads its fonts from its own origin, and no other host is asked`, async ({ page }) => {
      const requests = trackRequests(page, SITE);
      const fontRequests: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "font") fontRequests.push(request.url());
      });
      await page.goto(`/${entry.path}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
      for (const family of entry.families) expect(loaded, `${family} on /${entry.path}`).toContain(family);
      if (!entry.families.includes("Gelasio" as never)) expect(loaded).not.toContain("Gelasio");
      expect(fontRequests.length).toBeGreaterThan(0);
      for (const url of fontRequests) expect(url.startsWith(SITE), url).toBe(true);
      expect(requests.external).toEqual([]);
    });
  }

  test("a page of the site names no font host in its styles", async ({ page }) => {
    for (const path of ["", "churchyard/", "allotments/", "visitor/family/"]) {
      await page.goto(`/${path}`);
      const sheets = await page.evaluate(async () => {
        const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href);
        return Promise.all(hrefs.map(async (href) => ({ href, text: await (await fetch(href)).text() })));
      });
      expect(sheets.length, path).toBeGreaterThan(0);
      for (const sheet of sheets) {
        expect(sheet.text, sheet.href).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
        expect(sheet.text, sheet.href).not.toMatch(/url\(\s*["']?https?:/);
        expect(sheet.text, sheet.href).not.toMatch(/@font-face[^}]*url\([^)]*\.(woff|ttf|otf)\b(?!2)/);
      }
    }
  });
});
/** The shell version, as the worker's own file says it, and the files that it lists. */
async function shellOf(page: Page, origin: string): Promise<{ version: string; files: string[] }> {
  const text = await (await page.request.get(`${origin}sw.js`)).text();
  const match = /^self\.__PLOTWARDEN_SHELL = (\{.*\});\n/.exec(text);
  expect(match, "the worker is stamped").not.toBeNull();
  return JSON.parse((match as RegExpExecArray)[1] as string) as { version: string; files: string[] };
}

/** Load the site once, wait for the worker to be in charge of the page, and return the page. */
async function warm(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Plotwarden" })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active === null) throw new Error("no active worker");
  });
  // The worker takes charge of a page at its next load. Reload once, then it is in charge.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

// The three checks of the cache run on each host. The live host answers a page file with a redirect to a clean
// address (`x/index.html` to `x/`, `name.html` to `name`), and a worker that refused a redirected answer never
// installed there. The second host is the preview on port 4182, which answers as the live host does.
for (const host of HOSTS) {
  test.describe(`the offline cache on ${host.name}`, () => {
    const origin = host.origin;
    test.use({ baseURL: origin });

    test("registers one worker for the whole site, caches the static shell under its version, and nothing else", async ({ page }) => {
      await warm(page);
      const shell = await shellOf(page, origin);
      expect(shell.version).toMatch(/^[0-9a-f]{16}$/);
      const state = await page.evaluate(async () => {
        const names = await caches.keys();
        const urls: Record<string, string[]> = {};
        for (const name of names) urls[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
        const registration = await navigator.serviceWorker.getRegistration();
        return { names, urls, scope: registration?.scope ?? "", script: registration?.active?.scriptURL ?? "" };
      });
      expect(state.scope).toBe(origin);
      expect(state.script).toBe(`${origin}sw.js`);
      expect(state.names).toEqual([`plotwarden-shell-${shell.version}`]);
      expect([...(state.urls[`plotwarden-shell-${shell.version}`] as string[])].sort()).toEqual([...shell.files].sort());
      // A worker with no stored shell is not a worker: every file of the shell is also a file of the site.
      for (const file of shell.files) expect((await page.request.get(`${origin}${file.slice(1)}`)).status(), file).toBe(200);
      expect(shell.files).not.toContain("/sw.js");
      expect(shell.files).not.toContain("/_headers");
    });

    test("opens every page with the network off: both registers, the Desk, the hub, the visitor pages and a visitor file", async ({ page, context }) => {
      const faults = trackFaults(page);
      await warm(page);
      await context.setOffline(true);
      const offline = await context.newPage();
      for (const [path, heading] of [
        ["/", "Plotwarden"],
        ["/churchyard/", "Churchyard Register"],
        ["/allotments/", "Allotment Register"],
        ["/visitor/family/", "Family map"],
        ["/visitor/seeker/", "Plot seeker map"],
        [`/visitor/family/${FAMILY_FILE}`, "Lantern Fold"],
        [`/visitor/seeker/${SEEKER_FILE}`, "Thimble Beds"],
      ] as const) {
        const response = await offline.goto(path);
        expect(response?.status(), path).toBe(200);
        await expect(offline.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
      }
      // The Desk preview.
      await offline.goto("/review/");
      await expect(offline.getByText("Bring the checks from your registers to one meeting.")).toBeVisible();
      // A folder with no slash.
      await offline.goto("/churchyard");
      expect(offline.url()).toBe(`${origin}churchyard/`);
      await expect(offline.getByRole("heading", { level: 1, name: "Churchyard Register" })).toBeVisible();
      // A page that is not there.
      const missing = await offline.goto("/nowhere");
      expect(missing?.status()).toBe(404);
      await expect(offline.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      // The visitor file searches with no connection.
      await offline.goto(`/visitor/family/${FAMILY_FILE}`);
      await offline.getByLabel("Name or plot code").fill("Quillmoss");
      await offline.getByRole("button", { name: "Find", exact: true }).click();
      await expect(offline.locator("#list li:visible")).toContainText("Mirel Quillmoss");
      await context.setOffline(false);
      expect(faults.faults).toEqual([]);
    });

    test("works a register with the network off, and the cache gets no record from it", async ({ page, context }) => {
      await warm(page);
      const shell = await shellOf(page, origin);
      await context.setOffline(true);
      const offline = await context.newPage();
      await offline.goto("/churchyard/");
      await offline.getByRole("link", { name: "Start a register" }).click();
      await offline.getByLabel("Site name").fill("Offline Orchard");
      await offline.getByLabel("Local time zone").selectOption("Europe/London");
      await offline.getByRole("button", { name: "Create register" }).click();
      await expect(offline.getByRole("heading", { level: 1, name: "Offline Orchard" })).toBeVisible();
      await offline.reload();
      await expect(offline.getByRole("heading", { level: 1, name: "Offline Orchard" })).toBeVisible();
      await context.setOffline(false);

      const urls = await offline.evaluate(async () => {
        const found: string[] = [];
        for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) found.push(new URL(r.url).pathname + new URL(r.url).search);
        return found;
      });
      expect(urls.sort()).toEqual([...shell.files].sort());
      for (const url of urls) expect(url).not.toMatch(/Offline|Orchard|\?|blob|backup|\.zip/i);
    });

    test("answers the clean address of a page from the cache with the network off", async ({ page, context }) => {
      await warm(page);
      await context.setOffline(true);
      const offline = await context.newPage();
      const clean = `/visitor/family/${FAMILY_FILE.replace(/\.html$/, "")}`;
      const response = await offline.goto(clean);
      expect(response?.status(), clean).toBe(200);
      expect(offline.url()).toBe(`${origin}${clean.slice(1)}`);
      await expect(offline.getByRole("heading", { level: 1, name: "Lantern Fold" })).toBeVisible();
      await context.setOffline(false);
    });
  });
}

test.describe("the offline cache", () => {
  // The update test rewrites one file on disk that both hosts serve, so it runs once, on the plain host.
  test("says when a new version waits, keeps the page on the old one, and keeps both caches until the old pages close", async ({ page }) => {
    await warm(page);
    const shell = await shellOf(page, SITE);
    const reversed = shell.version.split("").reverse().join("");
    const next = reversed === shell.version ? "ffffffffffffffff" : reversed;
    // Publish another version: the same files, and a worker that says another version. The browser does not let a
    // test intercept the worker's own update request, so the stamped file is changed on disk and put back at the end.
    const file = fileURLToPath(new URL("../../dist/site/sw.js", import.meta.url));
    const original = readFileSync(file);
    try {
      writeFileSync(file, original.toString("utf8").replace(`"version":"${shell.version}"`, `"version":"${next}"`));
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      });
      const notice = page.locator("[data-update-notice]");
      await expect(notice).toBeVisible({ timeout: 20_000 });
      await expect(notice).toHaveText("A new version is ready. Save your work before reopening.");
      await expect(notice).toHaveAttribute("role", "status");
      expect(await page.evaluate(() => document.body.firstElementChild === document.querySelector("[data-update-notice]"))).toBe(true);
      // In the flow of the page, never over a word or a control.
      expect(await notice.evaluate((el) => getComputedStyle(el).position)).toBe("static");

      const state = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { names: (await caches.keys()).sort(), waiting: registration?.waiting !== null && registration?.waiting !== undefined, controller: navigator.serviceWorker.controller?.scriptURL ?? "" };
      });
      expect(state.names).toEqual([`plotwarden-shell-${next}`, `plotwarden-shell-${shell.version}`].sort());
      expect(state.waiting).toBe(true);
      expect(state.controller).toBe(`${SITE}sw.js`);
      // The page that is open still runs, and the notice does not break the layout.
      await expectLayout(page);
    } finally {
      writeFileSync(file, original);
    }
  });
});

test.describe("layout of what the site adds, in both sizes", () => {
  test("the hub, its About page and the 404 page measure well", async ({ page }) => {
    for (const path of ["/", "/#/about", "/#/nope"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const violations = await measureLayout(page);
      expect(violations, `${path} ${JSON.stringify(violations)}`).toEqual([]);
    }
    expect(sizeOf(page)).toMatch(/phone|desktop/);
  });
});

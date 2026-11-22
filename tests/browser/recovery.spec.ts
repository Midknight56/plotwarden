// Recovery, in a real browser, for both apps at 360 by 640 and at 1920 by 1080 (spec 06, task 6.14, Z14).
// Two tabs on one register, a store that refuses a write, a cancelled import, a backup that is not whole, and a
// refresh after a save. Each case reads the stored events or the stored registers from the page's own local
// database before and after, so the saved counts are observed, not assumed. No request leaves the app's own address.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { measureLayout, trackRequests } from "../helpers/measureLayout";
import { APPS, openPractice, routesOf, settle, storedEvents, storedSites } from "../helpers/routes";
import type { AppUnderTest } from "../helpers/routes";
import { upload } from "../helpers/screens";

async function check(page: Page, label: string): Promise<void> {
  const violations = await measureLayout(page);
  expect(violations, `${label}\n${JSON.stringify(violations, null, 1)}`).toEqual([]);
}

/** The route of a plot of the practice register, where a note can be written. */
async function plotRoute(page: Page, app: AppUnderTest, siteId: string): Promise<string> {
  return (await routesOf(page, app, siteId)).register.find((r) => r.startsWith("plot/")) as string;
}

async function addNote(page: Page, text: string): Promise<void> {
  await page.getByLabel("Note", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Add note" }).click();
}

const notes = (events: { type: string }[]): number => events.filter((e) => e.type === "note_added").length;

for (const app of APPS) {
  test.describe(`${app.title}`, () => {
    test.use({ baseURL: app.origin });

    test("two tabs: the second to save wins, the first is told, and opening the latest shows the note without a copy", async ({ page, context }) => {
      const first = trackRequests(page, app.origin);
      const siteId = await openPractice(page, app);
      const route = await plotRoute(page, app, siteId);
      await page.goto(`/#/r/${siteId}/${route}`);
      await settle(page);
      const before = await storedEvents(page, siteId);

      const other = await context.newPage();
      const second = trackRequests(other, app.origin);
      await other.goto(`/#/r/${siteId}/${route}`);
      await settle(other);
      await addNote(other, "Written in the second tab.");
      await expect(other.getByText("Note added.")).toBeVisible();
      const after = await storedEvents(other, siteId);
      expect(after.length).toBe(before.length + 1);
      expect(notes(after)).toBe(notes(before) + 1);

      // The first tab says so, offers both ways out, and has saved nothing.
      await expect(page.getByText("This register changed in another tab.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Open latest" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Keep my draft" })).toBeVisible();
      await check(page, "stale notice");
      expect((await storedEvents(page, siteId)).length).toBe(after.length);

      await page.getByRole("button", { name: "Open latest" }).click();
      await expect(page.getByText("This register changed in another tab.")).toHaveCount(0);
      await expect(page.getByText("Written in the second tab.")).toBeVisible();
      expect(notes(await storedEvents(page, siteId))).toBe(notes(before) + 1);
      expect(first.external).toEqual([]);
      expect(second.external).toEqual([]);
    });

    test("two tabs: keeping a draft keeps what was typed, and a save from the stale tab is refused and writes nothing", async ({ page, context }) => {
      const siteId = await openPractice(page, app);
      const route = await plotRoute(page, app, siteId);
      await page.goto(`/#/r/${siteId}/${route}`);
      await settle(page);
      await page.getByLabel("Note", { exact: true }).fill("A note that the first tab is still typing.");

      const other = await context.newPage();
      await other.goto(`/#/r/${siteId}/${route}`);
      await settle(other);
      await addNote(other, "The other tab was quicker.");
      await expect(other.getByText("Note added.")).toBeVisible();
      const savedByOther = (await storedEvents(other, siteId)).length;

      await expect(page.getByRole("button", { name: "Keep my draft" })).toBeVisible();
      await page.getByRole("button", { name: "Keep my draft" }).click();
      await expect(page.getByLabel("Note", { exact: true })).toHaveValue("A note that the first tab is still typing.");

      // The stale tab presses Add note. The commit is refused on the revision, and nothing is written.
      await page.getByRole("button", { name: "Add note" }).click();
      await expect(page.getByText("This register changed in another tab.")).toBeVisible();
      expect((await storedEvents(page, siteId)).length).toBe(savedByOther);
      await expect(page.getByLabel("Note", { exact: true })).toHaveValue("A note that the first tab is still typing.");
      await check(page, "refused stale save");

      // Open the latest, then save the same words from the fresh state: now it is written, once.
      await page.getByRole("button", { name: "Open latest" }).click();
      await expect(page.getByText("The other tab was quicker.")).toBeVisible();
      await page.getByLabel("Note", { exact: true }).fill("A note that the first tab is still typing.");
      await page.getByRole("button", { name: "Add note" }).click();
      await expect(page.getByText("Note added.")).toBeVisible();
      expect((await storedEvents(page, siteId)).length).toBe(savedByOther + 1);
    });

    test("a full store: the page says the browser could not save, never says Saved, keeps what was typed, and a retry saves once", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      await page.addInitScript(() => {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore["add"]>) {
          if ((window as unknown as { __fullStore?: boolean }).__fullStore === true && this.name === "events") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
          return add.apply(this, args);
        };
      });
      const siteId = await openPractice(page, app);
      const route = await plotRoute(page, app, siteId);
      await page.goto(`/#/r/${siteId}/${route}`);
      await settle(page);
      const before = await storedEvents(page, siteId);

      await page.evaluate(() => ((window as unknown as { __fullStore?: boolean }).__fullStore = true));
      await page.getByLabel("Note", { exact: true }).fill("This note must not be lost.");
      await page.getByRole("button", { name: "Add note" }).click();
      await expect(page.getByText("This browser could not save the register.")).toBeVisible();
      await expect(page.getByText("Saved on this device.")).toHaveCount(0);
      await expect(page.getByText("Note added.")).toHaveCount(0);
      await expect(page.getByLabel("Note", { exact: true })).toHaveValue("This note must not be lost.");
      await expect(page.getByRole("button", { name: "Download backup" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue in this tab" })).toBeVisible();
      await check(page, "full store");

      // "Continue in this tab" puts the message away and keeps the words. Pressing again fails again, the same way.
      await page.getByRole("button", { name: "Continue in this tab" }).click();
      await expect(page.getByText("This browser could not save the register.")).toHaveCount(0);
      await expect(page.getByLabel("Note", { exact: true })).toHaveValue("This note must not be lost.");
      await page.getByRole("button", { name: "Add note" }).click();
      await expect(page.getByText("This browser could not save the register.")).toBeVisible();
      expect((await storedEvents(page, siteId)).length).toBe(before.length);

      // The saved counts are as they were, now and after a reload.
      expect((await storedEvents(page, siteId)).length).toBe(before.length);
      await page.evaluate(() => ((window as unknown as { __fullStore?: boolean }).__fullStore = false));
      await page.reload();
      await settle(page);
      expect((await storedEvents(page, siteId)).length).toBe(before.length);
      await expect(page.getByText("This note must not be lost.")).toHaveCount(0);

      // Once the store works, the same words save, once.
      await addNote(page, "This note must not be lost.");
      await expect(page.getByText("Note added.")).toBeVisible();
      expect((await storedEvents(page, siteId)).length).toBe(before.length + 1);
      expect(requests.external).toEqual([]);
    });

    test("a refused save leaves focus on a control that can try again, not on the page", async ({ page }) => {
      await page.addInitScript(() => {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore["add"]>) {
          if ((window as unknown as { __fullStore?: boolean }).__fullStore === true && this.name === "events") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
          return add.apply(this, args);
        };
      });
      const siteId = await openPractice(page, app);
      const route = await plotRoute(page, app, siteId);
      await page.goto(`/#/r/${siteId}/${route}`);
      await settle(page);
      await page.evaluate(() => ((window as unknown as { __fullStore?: boolean }).__fullStore = true));
      await page.getByLabel("Note", { exact: true }).fill("Keep focus here.");
      await page.getByRole("button", { name: "Add note" }).click();
      await expect(page.getByText("This browser could not save the register.")).toBeVisible();
      // Focus goes back to a control within a moment of the failure, and does not stay on the page.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const el = document.activeElement;
              return el === null || el === document.body ? "" : `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`;
            }),
          { message: "focus fell to the page", timeout: 3000 },
        )
        .not.toBe("");
    });

    test("a cancelled import writes nothing and leaves the register as it was", async ({ page }) => {
      const requests = trackRequests(page, app.origin);
      const siteId = await openPractice(page, app);
      const before = await storedEvents(page, siteId);
      const rows =
        app.key === "churchyard"
          ? "Source ref,Recorded name,Burial date,Page\nRC-1,Hob Marrowfen,1901,P1\nRC-2,Dilly Cobbwright,1902,P1\nRC-3,Sorrel Thatchman,1903,P2\n"
          : "Source ref,Applicant,Joined date\nWL-1,Pim Cartwhistle,2026-02-01\nWL-2,Rue Hobbscroft,2026-02-02\nWL-3,Lark Tinderwick,2026-02-03\n";
      await page.goto(`/#/r/${siteId}/add/import`);
      await settle(page);
      if (app.key === "allotment") await page.getByLabel("Choose sheet").selectOption({ label: "Waiting list" });
      await page.getByLabel("Choose CSV").setInputFiles(upload("rows.csv", rows));
      await expect(page.getByRole("heading", { name: "Match columns" })).toBeVisible();
      await page.getByRole("button", { name: "Review import" }).click();
      await expect(page.getByRole("button", { name: "Import 3 records" })).toBeEnabled();
      await check(page, "import review");
      await page.getByRole("button", { name: "Cancel import" }).click();
      await expect(page.getByRole("button", { name: "Import 3 records" })).toHaveCount(0);
      expect((await storedEvents(page, siteId)).length).toBe(before.length);
      await page.reload();
      await settle(page);
      expect((await storedEvents(page, siteId)).length).toBe(before.length);
      const names = app.key === "churchyard" ? ["Marrowfen", "Cobbwright", "Thatchman"] : ["Cartwhistle", "Hobbscroft", "Tinderwick"];
      for (const name of names) expect(JSON.stringify(await storedEvents(page, siteId))).not.toContain(name);
      expect(requests.external).toEqual([]);
    });

    test("a backup that is not whole is refused with its own words, and no register is made", async ({ page }) => {
      await page.goto("/");
      const before = await storedSites(page).catch(() => []);
      await page.getByRole("link", { name: "Restore backup" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Restore backup" })).toBeVisible();
      const refuse = async (name: string, content: Buffer, words: string) => {
        await page.getByLabel("Choose backup").setInputFiles({ name, mimeType: "application/octet-stream", buffer: content });
        await expect(page.getByText(words)).toBeVisible();
        await expect(page.getByRole("button", { name: "Restore as new register" })).toHaveCount(0);
        await check(page, words);
      };
      // The start of a zip file, and then nothing a backup holds.
      await refuse("register-backup.pkr.zip", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 7)]), "This backup is incomplete. Your register is safe.");
      await refuse("copy.html", Buffer.from('<html><script>{"format":"plot.family.v1"}</script></html>'), "This file is a visitor copy.");
      expect((await storedSites(page)).length).toBe(before.length);
      await page.getByRole("link", { name: "Back to registers" }).click();
      await expect(page.getByRole("heading", { level: 1, name: app.title })).toBeVisible();
    });

    test("a record saved before a refresh is there after it, once, and the register still opens", async ({ page }) => {
      const siteId = await openPractice(page, app);
      const route = await plotRoute(page, app, siteId);
      await page.goto(`/#/r/${siteId}/${route}`);
      await settle(page);
      const before = await storedEvents(page, siteId);
      await addNote(page, "Saved, then refreshed.");
      await expect(page.getByText("Note added.")).toBeVisible();
      await page.reload();
      await settle(page);
      await expect(page.getByText("Saved, then refreshed.")).toBeVisible();
      const after = await storedEvents(page, siteId);
      expect(after.length).toBe(before.length + 1);
      expect(notes(after)).toBe(notes(before) + 1);
      // Pressing the button twice quickly writes one note.
      await page.getByLabel("Note", { exact: true }).fill("Pressed twice.");
      await page.getByRole("button", { name: "Add note" }).dblclick();
      await expect(page.getByText("Pressed twice.").first()).toBeVisible();
      expect(notes(await storedEvents(page, siteId))).toBe(notes(before) + 2);
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Restart walkthrough" })).toBeVisible();
    });
  });
}

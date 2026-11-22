// Flows that both browser specs use, written the way a person would press them.
// Test helper. The template never imports it.
import { expect } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const fixturePath = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

export async function readDownload(download: Download): Promise<string> {
  const path = await download.path();
  return readFileSync(path, "utf8");
}

/** Open the host, start a register and land on its home. */
export async function startRegister(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Start a register" }).click();
  await page.getByLabel("Site name").fill(title);
  await page.getByLabel("Local time zone").selectOption("Europe/London");
  await page.getByRole("button", { name: "Create register" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

export interface GridInput {
  section: string;
  prefix: string;
  first: string;
  digits: string;
  rows: string;
  columns: string;
  width: string;
  height: string;
  east: string;
  north: string;
  skip?: string;
}

export const BOOK_GRID: GridInput = {
  section: "Paper",
  prefix: "C",
  first: "1",
  digits: "3",
  rows: "10",
  columns: "20",
  width: "40",
  height: "30",
  east: "100",
  north: "100",
};

/** From a register home, open the map editor. */
export async function openMapEditor(page: Page): Promise<void> {
  const start = page.getByRole("link", { name: "Add your map" });
  if (await start.count()) await start.click();
  else {
    await page.getByRole("link", { name: "Map", exact: true }).click();
    await page.getByRole("link", { name: "Edit map" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Map setup" })).toBeVisible();
}

export async function fillGrid(page: Page, grid: GridInput): Promise<void> {
  await page.getByLabel("Section name", { exact: true }).fill(grid.section);
  await page.getByLabel("Prefix", { exact: true }).fill(grid.prefix);
  await page.getByLabel("First number", { exact: true }).fill(grid.first);
  await page.getByLabel("Digits", { exact: true }).fill(grid.digits);
  await page.getByLabel("Rows", { exact: true }).fill(grid.rows);
  await page.getByLabel("Columns", { exact: true }).fill(grid.columns);
  await page.getByLabel("Plot width", { exact: true }).fill(grid.width);
  await page.getByLabel("Plot height", { exact: true }).fill(grid.height);
  await page.getByLabel("Start east", { exact: true }).fill(grid.east);
  await page.getByLabel("Start north", { exact: true }).fill(grid.north);
  await page.getByLabel("Skip places", { exact: true }).fill(grid.skip ?? "");
}

/** Generate a grid through the map editor and apply it. */
export async function generateGrid(page: Page, grid: GridInput = BOOK_GRID): Promise<void> {
  await openMapEditor(page);
  await fillGrid(page, grid);
  await page.getByRole("button", { name: "Preview plots" }).click();
  await page.getByRole("button", { name: "Apply layout" }).click();
  await expect(page.getByText("Map saved.")).toBeVisible();
}

/** Go to a register link from the register home. */
export async function goHome(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: "Back to register" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** A text file as an upload, without touching the disk. */
export function upload(name: string, text: string, mimeType = "text/csv"): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType, buffer: Buffer.from(text, "utf8") };
}

/**
 * A view date may be in the address. A name never is. No address in the session history holds any word of the given
 * names, in any encoding, and none carries a `q` parameter.
 */
export async function expectNoNameInAddress(page: Page, names: readonly string[]): Promise<void> {
  const seen = await page.evaluate(() => {
    const nav = (window as unknown as { navigation?: { entries(): { url: string | null }[] } }).navigation;
    return { href: location.href, entries: nav === undefined ? [] : nav.entries().map((e) => e.url ?? "") };
  });
  const addresses = [seen.href, page.url(), ...seen.entries];
  const words = names.flatMap((name) => name.split(/\s+/)).filter((w) => w !== "");
  for (const address of addresses) {
    const decoded = decodeURIComponent(address).toLowerCase();
    expect(/[?&]q=/.test(address), `a q parameter in ${address}`).toBe(false);
    for (const word of words) expect(decoded.includes(word.toLowerCase()), `"${word}" in the address ${address}`).toBe(false);
  }
}

/**
 * R22.2 after a search: no address in the session history holds the searched text, in any encoding, and no `q`
 * parameter. The text lives in `history.state`, so Back and a reload still find it there.
 */
export async function expectSearchOutOfAddress(page: Page, text: string): Promise<void> {
  const seen = await page.evaluate(() => {
    const nav = (window as unknown as { navigation?: { entries(): { url: string | null }[] } }).navigation;
    return { href: location.href, entries: nav === undefined ? [] : nav.entries().map((e) => e.url ?? ""), state: JSON.stringify(history.state) };
  });
  const addresses = [seen.href, page.url(), ...seen.entries];
  const words = text.split(/\s+/).filter((w) => w !== "");
  for (const address of addresses) {
    const decoded = decodeURIComponent(address).toLowerCase();
    expect(/[?&]q=/.test(address), `a q parameter in ${address}`).toBe(false);
    for (const word of words) expect(decoded.includes(word.toLowerCase()), `"${word}" in the address ${address}`).toBe(false);
  }
  expect(seen.state, "the search text is kept in history.state").toContain(text);
}

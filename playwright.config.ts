import { defineConfig } from "@playwright/test";

// Headless only, one worker, the two required sizes. No browser is installed
// by any script. The host page for the register screens is built and served
// on the loopback address with a strict port, and Playwright stops it.
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4175",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 360, height: 640 } } },
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: [
    {
      command: "npm run host:build && npm run host:preview",
      url: "http://127.0.0.1:4175/",
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run church:build && npm run church:preview",
      url: "http://127.0.0.1:4176/",
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // The market stall example, the third use. It is the source that the generator copies.
      command: "npm run market:build && npm run market:preview",
      url: "http://127.0.0.1:4180/",
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // The assembled site, as the static host serves it. It needs `npm run build:apps` and `npm run assemble:site`
      // first. Without them the server refuses to start and says so. Nothing builds it here, so no build races
      // the other servers over `dist/apps`.
      command: "npm run preview",
      url: "http://127.0.0.1:4174/",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run allot:build && npm run allot:preview",
      url: "http://127.0.0.1:4178/",
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

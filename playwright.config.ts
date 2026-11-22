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
  ],
});

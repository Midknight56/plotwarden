import { defineConfig } from "@playwright/test";

// Headless only, one worker, the two required sizes. No browser is installed
// by any script. Browser tests arrive with spec 03 and later.
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4174",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 360, height: 640 } } },
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
  ],
});

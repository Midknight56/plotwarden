import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/browser/**", "node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The build of the plot inspector: dist/inspector/server.mjs and dist/inspector/cli.mjs, each one file that
// imports only Node built in modules. The server is built first. The command line is built with `--mode cli`
// and does not empty the folder, so the two builds share it. No dev server, no preview server.
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => ({
  root: repo,
  logLevel: "warn",
  build: {
    ssr: mode === "cli" ? "tools/inspector/cli.ts" : "tools/inspector/server.ts",
    target: "node24",
    outDir: "dist/inspector",
    emptyOutDir: mode !== "cli",
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { format: "es", entryFileNames: mode === "cli" ? "cli.mjs" : "server.mjs" } },
  },
  ssr: { noExternal: true },
}));
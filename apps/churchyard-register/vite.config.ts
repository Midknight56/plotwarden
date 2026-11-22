import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Churchyard Register on its own. Dev and preview bind the loopback address
// with a strict port, so a test never reaches an unrelated app when a port is busy.
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../dist/apps/churchyard", import.meta.url)),
    emptyOutDir: true,
    // Art stays as files on the same origin. Nothing is inlined from elsewhere.
    assetsInlineLimit: 0,
  },
  server: { host: "127.0.0.1", port: 4177, strictPort: true, fs: { allow: [repo] } },
  preview: { host: "127.0.0.1", port: 4176, strictPort: true },
});

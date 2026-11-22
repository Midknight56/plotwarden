import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The market stall register on its own. Dev and preview bind the loopback address with a strict port,
// so a test never reaches an unrelated app when a port is busy.
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("dist", import.meta.url)),
    emptyOutDir: true,
  },
  server: { host: "127.0.0.1", port: 4181, strictPort: true, fs: { allow: [repo] } },
  preview: { host: "127.0.0.1", port: 4180, strictPort: true },
});
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// A small host page for the browser tests. The real app entry points come in
// the app specs. The host binds the loopback address with a strict port.
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../dist/host", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
    fs: { allow: [repo] },
  },
  preview: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
  },
});

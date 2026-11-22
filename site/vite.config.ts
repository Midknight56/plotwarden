import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The build of the hub, the two visitor pages and the service worker, into dist/apps/hub. Four kinds of entry:
// three pages that share one script, the worker (`sw.js`, no export, so it runs as a plain script) and the
// script that registers it (`sw-register.js`). The worker and the register script keep fixed names, because
// the worker must sit at the root of the site and the assembled pages name the register script. Everything else
// is hashed. The files in `public/` (`_headers`, `404.html`) are copied as they are. No server here: the
// dev and preview servers of the whole site are in the root `vite.config.ts`.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  publicDir: "public",
  build: {
    outDir: fileURLToPath(new URL("../dist/apps/hub", import.meta.url)),
    emptyOutDir: true,
    // Art stays a file on the same origin. Nothing is inlined, and nothing comes from elsewhere.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("index.html", import.meta.url)),
        "visitor/family/index": fileURLToPath(new URL("visitor/family/index.html", import.meta.url)),
        "visitor/seeker/index": fileURLToPath(new URL("visitor/seeker/index.html", import.meta.url)),
        sw: fileURLToPath(new URL("src/sw.ts", import.meta.url)),
        "sw-register": fileURLToPath(new URL("src/registerMain.ts", import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : chunk.name === "sw-register" ? "sw-register.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});

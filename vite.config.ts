import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { siteServer } from "./tools/site/siteServer.ts";

// The whole site on the loopback address, with strict ports, so a test never reaches an unrelated app when a
// port is busy. `npm run dev` (4173) serves the hub and both apps from source. `npm run preview` (4174) serves
// the assembled `dist/site` the way the static host does. `npm run preview:pretty` (4182, with the host style
// `pretty`) serves it as the live host does, with `.html` addresses redirected to clean ones. Neither builds anything: `npm run build:apps` and
// `npm run assemble:site` do. The plugin is in tools/site/siteServer.ts.
const repo = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  appType: "mpa",
  plugins: [siteServer({ repo })],
  // `vite preview` reads this folder. The plugin serves it. A build here would not empty it.
  build: { outDir: "dist/site", emptyOutDir: false },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});

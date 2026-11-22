import { defineConfig } from "vite";

// Servers bind the loopback address with a strict port, so a test never
// reaches an unrelated app when a port is busy.
export default defineConfig({
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

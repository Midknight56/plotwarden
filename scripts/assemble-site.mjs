// Compose dist/site from the app builds and a verified Desk preview.
//
//   node scripts/assemble-site.mjs [--desk <preview folder>] [--root <repo>] [--out <folder>]
//
// The Desk folder is --desk, then the environment value PLOTWARDEN_DESK_PREVIEW, then
// ../plotwarden-review-desk/dist/preview beside this checkout. The preview is checked against
// release/desk-preview.lock.json (version, revision, every file hash) before anything is written.
// The lock is never written here. See scripts/lock-desk.mjs.
//
// Exit 0 assembled. Exit 1 the preview does not match the lock. Exit 2 a missing input or a bad call.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finish, parseArgs } from "./lib/files.mjs";
import { assembleSite } from "./lib/site.mjs";

const here = dirname(fileURLToPath(import.meta.url));

finish(() => {
  const args = parseArgs(process.argv.slice(2), { desk: "value", root: "value", out: "value" });
  const root = resolve(args.root ?? join(here, ".."));
  const desk = resolve(args.desk ?? process.env.PLOTWARDEN_DESK_PREVIEW ?? join(root, "..", "plotwarden-review-desk", "dist", "preview"));
  const out = resolve(args.out ?? join(root, "dist", "site"));
  const result = assembleSite({ root, deskPreview: desk, out });
  console.log(`assemble-site: ok, ${result.files} files, ${result.bytes} bytes, shell ${result.version}`);
  return 0;
});

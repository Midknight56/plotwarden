// Stamp the service worker of a built site with its shell: the version and the list of static files.
//
//   node scripts/build-sw.mjs --site <folder>
//
// Safe to run again. Assembly does this as its last step, so this command is for a person who changed
// a file of the site by hand and wants a worker that matches.
import { resolve } from "node:path";
import { Refusal, finish, parseArgs } from "./lib/files.mjs";
import { stampWorker } from "./lib/site.mjs";

finish(() => {
  const args = parseArgs(process.argv.slice(2), { site: "value" });
  if (args.site === undefined) throw new Refusal("Say which built site to stamp: --site <folder>");
  const manifest = stampWorker(resolve(args.site));
  console.log(`build-sw: shell ${manifest.version}, ${manifest.files.length} files`);
  return 0;
});

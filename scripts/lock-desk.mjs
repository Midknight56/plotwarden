// Write release/desk-preview.lock.json from a built Desk preview. This is the one step that sets the expected
// values, and a person runs it on purpose, after reading the Desk build. Assembly and the release check only
// read the lock. A lock that exists is replaced only with --replace.
//
//   node scripts/lock-desk.mjs --desk <preview folder> [--root <repo>] [--replace]
//
// Exit 0 written. Exit 2 refused: a missing folder, no index.html, a lock already there, an unreadable revision.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCK_PATH, makeLock } from "./lib/desk.mjs";
import { Refusal, finish, parseArgs } from "./lib/files.mjs";

const here = dirname(fileURLToPath(import.meta.url));

finish(() => {
  const args = parseArgs(process.argv.slice(2), { desk: "value", root: "value", replace: "flag" });
  if (args.desk === undefined) throw new Refusal("Say which Desk preview to pin: --desk <preview folder>");
  const root = resolve(args.root ?? join(here, ".."));
  const file = join(root, LOCK_PATH);
  if (existsSync(file) && args.replace !== true) {
    throw new Refusal(`${LOCK_PATH} already exists. It is the expected value, so it is not rewritten. To replace it on purpose, add --replace.`);
  }
  const lock = makeLock(resolve(args.desk));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`lock-desk: wrote ${LOCK_PATH} for ${lock.name} ${lock.version} at ${lock.revision.slice(0, 7)}, ${Object.keys(lock.files).length} files, ${lock.bundled.length} bundled packages`);
  return 0;
});

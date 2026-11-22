// Make a new register app from the template and an example, in a folder that does not exist yet.
//
//   npm run create:app -- --kind market --out <folder> [--template <folder>]
//   node scripts/create-app.mjs --kind market --out <folder> [--template <folder>]
//
// The app is a copy of the source in examples/<kind>, with the path to the template rewritten. The script
// never writes under template/, apps/ or examples/. It refuses a path that exists, whether a file, an empty
// folder or a full one, and writes nothing then.
// Exit 0 when written. Exit 2 for a bad argument or a path it refuses. Exit 1 when a write fails.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, planFiles } from "./lib/scaffold.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error !== undefined) {
    console.error(`create-app: ${args.error}`);
    console.error("Use: npm run create:app -- --kind market --out <folder>");
    return 2;
  }
  const plan = planFiles({ repo, cwd: process.cwd(), kind: args.kind, out: args.out, template: args.template });
  if (plan.error !== undefined) {
    console.error(`create-app: ${plan.error}`);
    return 2;
  }
  // Make the parents, then the folder itself without `recursive`, so a folder that appeared meanwhile is refused.
  try {
    mkdirSync(dirname(plan.out), { recursive: true });
    mkdirSync(plan.out);
  } catch (error) {
    console.error(`create-app: I could not make ${plan.out}: ${error.code ?? "error"}. I write nothing.`);
    return 2;
  }
  try {
    for (const { rel, text } of plan.files) {
      const file = join(plan.out, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text, { encoding: "utf8", flag: "wx" });
    }
  } catch (error) {
    // Remove only the folder this run made.
    rmSync(plan.out, { recursive: true, force: true });
    console.error(`create-app: a write failed (${error.code ?? "error"}). I removed ${plan.out}.`);
    return 1;
  }
  const shown = relative(process.cwd(), plan.out) || ".";
  console.log(`Made the ${args.kind} register in ${plan.out}.`);
  console.log(`Run it:   npx vite --config ${shown}/vite.config.ts`);
  console.log(`Build it: npx vite build --config ${shown}/vite.config.ts`);
  return 0;
}

process.exitCode = main();

// Write the two sample visitor files into the hub build, where the visitor pages link to them.
//
//   node scripts/build-visitor.mjs --out <hub folder>
//
// The files come from tools/site/visitorFiles.ts, which runs the real builders of the two registers on the
// invented fixtures. The script bundles that file with Vite (a server side build to a scratch folder, no server)
// and runs it. It writes `visitor/family/<file>` and `visitor/seeker/<file>` under --out and nothing else.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { Refusal, finish, parseArgs } from "./lib/files.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

finish(async () => {
  const args = parseArgs(process.argv.slice(2), { out: "value" });
  if (args.out === undefined) throw new Refusal("Say where the hub build is: --out <hub folder>");
  const out = resolve(args.out);

  const scratch = mkdtempSync(join(tmpdir(), "plotwarden-visitor-"));
  try {
    await build({
      configFile: false,
      root: repo,
      logLevel: "warn",
      build: {
        ssr: "tools/site/visitorFiles.ts",
        target: "node24",
        outDir: scratch,
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
        rollupOptions: { output: { format: "es", entryFileNames: "visitorFiles.mjs" } },
      },
      ssr: { noExternal: true },
    });
    const { buildVisitorFiles } = await import(pathToFileURL(join(scratch, "visitorFiles.mjs")).href);
    const files = buildVisitorFiles();
    for (const [kind, file] of [
      ["family", files.family],
      ["seeker", files.seeker],
    ]) {
      const dir = join(out, "visitor", kind);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, file.fileName), file.html);
    }
    console.log(`build-visitor: wrote ${files.family.fileName} and ${files.seeker.fileName}`);
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// The pure part of scripts/create-app.mjs: read the arguments, decide the files, rewrite the path to the
// template. It reads the example source and writes nothing.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

/** Each kind of app the generator can make: the example it copies from and the exact files, in order. */
export const KINDS = {
  market: {
    example: "examples/market",
    files: [
      "fixture.json",
      "index.html",
      "package.json",
      "vite.config.ts",
      "src/Stalls.tsx",
      "src/adapter.ts",
      "src/copy.ts",
      "src/fields.ts",
      "src/main.tsx",
      "src/rules.ts",
      "src/theme.css",
      "src/types.ts",
    ],
  },
};

/** The text the example files use to reach the template, from `examples/<kind>/src`. */
export const EXAMPLE_TEMPLATE_PREFIX = "../../../template/";
const EXAMPLE_ALLOW = 'new URL("../..", import.meta.url)';

const FLAGS = new Set(["--kind", "--out", "--template"]);

/** Read `--kind`, `--out` and `--template`. Anything else is a fault, named in the message. */
export function parseArgs(argv) {
  const found = {};
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (!word.startsWith("--")) return { error: `I did not expect "${word}". Use --kind, --out and --template.` };
    if (!FLAGS.has(word)) return { error: `I do not know the flag ${word}. Use --kind, --out and --template.` };
    if (found[word] !== undefined) return { error: `The flag ${word} was given twice.` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return { error: `The flag ${word} needs a value.` };
    found[word] = value;
    i += 1;
  }
  if (found["--kind"] === undefined) return { error: "Say what to make with --kind market." };
  if (!Object.hasOwn(KINDS, found["--kind"])) return { error: `I can make these kinds: ${Object.keys(KINDS).join(", ")}. I do not know "${found["--kind"]}".` };
  if (found["--out"] === undefined) return { error: "Say where to write it with --out <folder>. The folder must not exist yet." };
  return { kind: found["--kind"], out: found["--out"], template: found["--template"] };
}

const inside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const forward = (path) => path.split(sep).join("/");

/** The deepest folder that holds both paths. Both are absolute. */
function commonFolder(a, b) {
  const left = resolve(a).split(sep);
  const right = resolve(b).split(sep);
  const same = [];
  for (let i = 0; i < Math.min(left.length, right.length) && left[i] === right[i]; i++) same.push(left[i]);
  return same.length === 0 ? parse(resolve(a)).root : same.join(sep) || sep;
}

/**
 * Work out every file to write. Returns `{ files, out }` or `{ error }`. Nothing is written and nothing is
 * created. `cwd` is where relative paths start.
 */
export function planFiles({ repo, cwd, kind, out, template }) {
  const spec = KINDS[kind];
  const target = resolve(cwd, out);
  if (existsSync(target)) return { error: `The path ${target} already exists. Choose a folder that does not exist yet. I write nothing.` };
  for (const guarded of ["template", "apps", "examples", "tests", "scripts", ".kiro"]) {
    if (inside(target, join(repo, guarded))) return { error: `The folder ${target} is inside ${guarded}. Choose a folder outside the source of this project. I write nothing.` };
  }
  const templateFolder = resolve(cwd, template ?? join(repo, "template"));
  if (!existsSync(join(templateFolder, "src", "adapter.ts"))) return { error: `The template folder ${templateFolder} has no src/adapter.ts.` };
  if (inside(target, templateFolder)) return { error: `The folder ${target} is inside the template folder. I write nothing.` };

  const toTemplate = relative(join(target, "src"), templateFolder);
  if (isAbsolute(toTemplate)) return { error: "The folder and the template must be on one drive." };
  const prefix = `${forward(toTemplate)}/`;
  const allow = relative(target, commonFolder(target, dirname(templateFolder)));
  const allowText = `new URL("${forward(allow === "" ? "." : allow)}", import.meta.url)`;

  const files = [];
  for (const rel of spec.files) {
    const source = join(repo, spec.example, rel);
    if (!existsSync(source) || !statSync(source).isFile()) return { error: `The example file ${spec.example}/${rel} is missing.` };
    let text = readFileSync(source, "utf8");
    if (text.charCodeAt(0) === 0xfeff || text.includes("\r")) return { error: `The example file ${spec.example}/${rel} has a byte order mark or a carriage return.` };
    text = text.split(EXAMPLE_TEMPLATE_PREFIX).join(prefix);
    if (rel === "vite.config.ts") text = text.split(EXAMPLE_ALLOW).join(allowText);
    files.push({ rel, text });
  }
  return { files, out: target };
}

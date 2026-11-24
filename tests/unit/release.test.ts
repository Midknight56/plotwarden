// T36: the release (spec 06, task 6.19, requirement Z10).
// The site is assembled from the app builds and a Desk preview that a lock pins by version, revision and file
// hash. A wrong digest stops assembly and writes nothing. Assembly never writes the lock. A direct route on the
// static build is a real page, not a blank one. A build holds no billing endpoint and no remote asset. Every
// shipped package has its licence in the notices, every link of the README and docs resolves, public text has
// no dash between words and no name or word that does not belong, and the proof pictures cover every route.
//
// The scripts are run as processes, on small trees made under `.local/`, so each case holds a whole tree and
// the real repository is never changed. The expected values here are worked by hand from the plan, not read
// from a script.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileBanned, loadBannedWords, scanText } from "../../scripts/lib/publicText.mjs";
import { parseHeaders, parsePolicy, policyProblems, valuesOf } from "../../scripts/lib/headers.mjs";
import { paperBookCsv } from "../../scripts/lib/paperBook.mjs";
import { buildVisitorFiles } from "../../tools/site/visitorFiles";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const scratch = join(repo, ".local", `release-test-${process.pid}`);

const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

function put(root: string, rel: string, content: string | Uint8Array): void {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const read = (root: string, rel: string): string => readFileSync(join(root, rel), "utf8");

interface Ran {
  code: number | null;
  out: string;
  err: string;
}

/** Run a script as a process. The banned words variable is cleared first, so the result does not depend on the shell that runs the test. */
function run(script: string, args: string[], timeout = 60_000, env: Record<string, string> = {}): Ran {
  const base = { ...process.env };
  delete base.PLOTWARDEN_BANNED_WORDS;
  const result = spawnSync(process.execPath, [join(repo, "scripts", script), ...args], { encoding: "utf8", cwd: repo, timeout, env: { ...base, ...env } });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function files(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else found.push(relative(root, full).replace(/\\/g, "/"));
    }
  };
  if (existsSync(root)) visit(root);
  return found.sort();
}

/** A hash of a whole folder, to see that nothing in it changed. */
const treeHash = (root: string): string => sha256(files(root).map((f) => `${f}\0${sha256(readFileSync(join(root, f)))}`).join("\n"));

let counter = 0;
const fresh = (name: string): string => {
  const dir = join(scratch, `${name}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

beforeAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

// ---- public text ---------------------------------------------------------------------------------------------

describe("T36 public text: dashes between words", () => {
  const rules = (path: string, text: string): string[] => scanText(path, text).map((f) => f.rule);

  it.each([
    ["an em dash", "Open it \u2014 then close it."],
    ["an en dash in a range", "Pages 4\u20136 are missing."],
    ["a spaced hyphen", "One - two."],
    ["a double hyphen", "One -- two."],
  ])("flags %s in a markdown page", (_name, text) => {
    expect(rules("docs/a.md", text)).toEqual(["dash"]);
  });

  it.each([
    ["a hyphen inside a word", "A read-only page, half-open until noon."],
    ["inline code", "Run `npm run x -- --desk y` first."],
    ["a fenced block", "Run:\n\n```\nnpm run x -- --desk y\na - b\n```\n"],
    ["a table rule", "| a | b |\n|---|---|\n| 1 | 2 |"],
    ["an empty table cell", "| a | b |\n|---|---|\n| - | 2 |"],
    ["a list bullet", "- one\n- two\n* three"],
    ["a minus in a number", "Down by -3 degrees."],
  ])("lets %s pass in a markdown page", (_name, text) => {
    expect(rules("docs/a.md", text)).toEqual([]);
  });

  it("reads the words of an html page and not its markup, script or style", () => {
    expect(rules("site/index.html", "<p>one \u2014 two</p>")).toEqual(["dash"]);
    expect(rules("site/index.html", "<p>one - two</p>")).toEqual(["dash"]);
    expect(rules("site/index.html", '<p class="a-b" data-x="a - b">fine</p><code>a - b</code><script>var x = a - b;</script><style>a{margin:-1px}</style>')).toEqual([]);
  });

  it("reads the strings of a copy catalog and not its code", () => {
    expect(rules("apps/x/src/copy.ts", 'export const C = { a: "Open \u2014 now" };')).toEqual(["dash"]);
    expect(rules("apps/x/src/copy.ts", 'export const n = a - b;\nexport const C = { a: "Open now" };')).toEqual([]);
    expect(rules("apps/x/src/rules.ts", "const n = a - b; // one \u2014 two")).toEqual([]);
  });

  it("reports the line", () => {
    expect(scanText("docs/a.md", "fine\nfine\nOne \u2014 two").map((f) => f.line)).toEqual([3]);
  });
});

// Invented words. The real lists live in a file outside the repository (spec 06, Z19), so no test here names a real one.
const PLACEHOLDER_LISTS = { vendor: ["Zorblax", "Flumph Labs"], other: ["Quibblewick", "Grand Wobble Cup"] };

/** Write a banned words file in a folder of its own, outside any tree that a check reads, and return its path. */
function wordsFile(lists: unknown): string {
  const file = join(fresh("words"), "words.json");
  writeFileSync(file, JSON.stringify(lists));
  return file;
}

describe("T36 public text: banned words from a file", () => {
  const banned = (): ReturnType<typeof loadBannedWords> => loadBannedWords(wordsFile(PLACEHOLDER_LISTS));
  const rules = (text: string, path = "docs/a.md"): string[] => scanText(path, text, banned()).map((f) => f.rule);

  it.each(["Zorblax", "Flumph Labs", "ZORBLAX", "zorblax", "Zorblax-9"])("flags the vendor word %s in any letter case", (word) => {
    expect(rules(`Made with ${word} today.`)).toEqual(["vendor"]);
    expect(rules(`Made with ${word.toLowerCase()} today.`, "site/src/copy.ts")).toEqual(["vendor"]);
  });

  it.each(["Quibblewick", "quibblewick", "Grand Wobble Cup"])("flags the word %s of the second list", (word) => {
    expect(rules(`See the ${word} page.`)).toEqual(["other"]);
    expect(rules(`// ${word} note`, "apps/x/src/rules.ts")).toEqual(["other"]);
  });

  it("matches a whole word only", () => {
    expect(rules("The Zorblaxian ferry and a Quibblewicker.")).toEqual([]);
    expect(rules("(Zorblax), Quibblewick.")).toEqual(["vendor", "other"]);
  });

  it("reports the line and the word", () => {
    expect(scanText("docs/a.md", "fine\nfine\nMade with Zorblax", banned())).toEqual([{ line: 3, rule: "vendor", match: "Zorblax" }]);
  });

  it("reports one finding of each list for a line", () => {
    expect(rules("Zorblax and Flumph Labs and Quibblewick and Grand Wobble Cup")).toEqual(["vendor", "other"]);
  });

  it("lets Kiro stand, and the words that the old fixed lists would have caught are not special any more", () => {
    expect(rules("Kiro wrote the specs. Kiro CLI ran the tests. Kiro Crew hosts the Desk.")).toEqual([]);
    expect(rules("Judging criteria at a glance, and the judges say.")).toEqual([]);
  });

  it("escapes a word that holds a pattern character", () => {
    const dotted = compileBanned({ vendor: ["a.b", "c+d"], other: [] });
    expect(scanText("docs/a.md", "an axb and a ccd", dotted)).toEqual([]);
    expect(scanText("docs/a.md", "an a.b and a c+d", dotted).map((f) => f.rule)).toEqual(["vendor"]);
  });

  it("takes empty lists", () => {
    expect(scanText("docs/a.md", "Zorblax Quibblewick", compileBanned({ vendor: [], other: [] }))).toEqual([]);
  });

  it("runs only the generic rules when no list is given", () => {
    expect(scanText("docs/a.md", "Made with Zorblax for Quibblewick.")).toEqual([]);
    expect(scanText("docs/a.md", "Zorblax \u2014 Quibblewick").map((f) => f.rule)).toEqual(["dash"]);
    expect(scanText("docs/a.md", "See C:/Users/someone/x").map((f) => f.rule)).toEqual(["local-path"]);
  });

  it("still runs the generic rules when a list is given", () => {
    expect(scanText("docs/a.md", "Zorblax \u2014 here", banned()).map((f) => f.rule)).toEqual(["dash", "vendor"]);
    expect(scanText("docs/a.md", "Zorblax is in C:/Users/someone/x", banned()).map((f) => f.rule)).toEqual(["vendor", "local-path"]);
  });
});

describe("T36 public text: the banned words file", () => {
  it("reads the file at a path", () => {
    const loaded = loadBannedWords(wordsFile(PLACEHOLDER_LISTS));
    expect(scanText("docs/a.md", "Zorblax", loaded)).toHaveLength(1);
    expect(scanText("docs/a.md", "Quibblewick", loaded)).toHaveLength(1);
  });

  it.each([
    ["not an object", [], /object/],
    ["null", null, /object/],
    ["an object with no list", {}, /no list/],
    ["a list that is a string", { vendor: "Zorblax", other: [] }, /"vendor"/],
    ["a list that is an object", { vendor: [], other: {} }, /"other"/],
    ["a number in a list", { vendor: [3], other: [] }, /"vendor"/],
    ["an empty word", { vendor: [], other: [""] }, /"other"/],
    ["a word of blanks", { vendor: ["  "], other: [] }, /"vendor"/],
  ])("refuses %s and names the list", (_name, lists, message) => {
    expect(() => compileBanned(lists)).toThrow(message);
  });

  it("refuses a missing file and a file that is not JSON", () => {
    const folder = fresh("words");
    expect(() => loadBannedWords(join(folder, "none.json"))).toThrow(/banned words/i);
    const broken = join(folder, "broken.json");
    writeFileSync(broken, "{ not json");
    expect(() => loadBannedWords(broken)).toThrow(/banned words/i);
  });
});

describe("T36 public text: local paths", () => {
  const rules = (text: string, path = "docs/a.md"): string[] => scanText(path, text).map((f) => f.rule);
  it.each(["D:\\Projects\\plotwarden\\README.md", "C:\\Users\\someone\\x", "/Users/someone/x", "/home/someone/x", "file:///C:/Users/someone/x", "C:/Users/someone"])("flags the local path %s", (path) => {
    expect(rules(`Look in ${path} for it.`)).toEqual(["local-path"]);
  });

  it("lets a pattern for a time, an address that a test refuses and a system path of no person stand", () => {
    // Found in a run over this repository: the source of a regular expression, and a refused address, are not paths of a person.
    expect(rules("expect(text).toMatch(/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}$/);", "tests/unit/a.test.ts")).toEqual([]);
    expect(rules("const refused = [\"file:///etc/hosts\", \"/etc/hosts\"];", "tests/unit/a.test.ts")).toEqual([]);
  });

  it("lets a relative path and a loopback address stand", () => {
    expect(rules("Look in docs/make-your-own.md and apps/churchyard-register. Open http://127.0.0.1:4174/ now.")).toEqual([]);
  });
});

// ---- the sample visitor files --------------------------------------------------------------------------------

describe("T36 the two sample visitor files", () => {
  let files: ReturnType<typeof buildVisitorFiles>;
  beforeAll(() => {
    files = buildVisitorFiles();
  });

  it("are named by their kind and date only", () => {
    expect(files.family.fileName).toBe("family-map-2026-04-20.html");
    expect(files.seeker.fileName).toBe("availability-map-2026-04-20.html");
  });

  it("are the same bytes each time", () => {
    const again = buildVisitorFiles();
    expect(again.family.html).toBe(files.family.html);
    expect(again.seeker.html).toBe(files.seeker.html);
  });

  it("show the one approved name and no private value", () => {
    expect(files.family.html).toContain("Mirel Quillmoss");
    for (const canary of ["Torin Pellwick", "Odalys Fennimore", "Wren Ashgrove", "wren.ashgrove@example.invalid", "Hollowmere", "lantern-book-page-03.webp"]) {
      expect(files.family.html).not.toContain(canary);
    }
    for (const canary of ["Tavi Bramblequill", "Olin Reedwhorl", "Marlo Fennick", "Ada Stonecrop", "Ilse Burrowby", "Hale Pennywort", "tavi.bramblequill@example.invalid", "TB-RCPT-1", "GBP"]) {
      expect(files.seeker.html).not.toContain(canary);
    }
    expect(files.seeker.html).toContain("B03");
  });
});

describe("T36 build:visitor writes the two files where the hub keeps them", () => {
  it("writes each file under its own folder, the same bytes on a second run, and nothing else", () => {
    const out = fresh("visitor");
    const first = run("build-visitor.mjs", ["--out", out], 120_000);
    expect(first.err).toBe("");
    expect(first.code).toBe(0);
    const expected = buildVisitorFiles();
    expect(files(out)).toEqual([`visitor/family/${expected.family.fileName}`, `visitor/seeker/${expected.seeker.fileName}`]);
    expect(read(out, `visitor/family/${expected.family.fileName}`)).toBe(expected.family.html);
    expect(read(out, `visitor/seeker/${expected.seeker.fileName}`)).toBe(expected.seeker.html);
    const before = treeHash(out);
    expect(run("build-visitor.mjs", ["--out", out], 120_000).code).toBe(0);
    expect(treeHash(out)).toBe(before);
  });

  it("refuses a missing --out", () => {
    const result = run("build-visitor.mjs", []);
    expect(result.code).toBe(2);
    expect(result.err).toContain("--out");
  });
});

// ---- the Desk lock and the assembly --------------------------------------------------------------------------

const REVISION = "a9b0a01df1fa17e851a0e0dbe347b1d760b9f3f1";
const OTHER_REVISION = "0123456789abcdef0123456789abcdef01234567";

const DESK_JS = `// node_modules/react/cjs/react.production.min.js
var React = 1;
// node_modules/scheduler/cjs/scheduler.production.min.js
var Scheduler = 2;
// node_modules/zod/index.js
var Zod = 3;
// src/Desk.tsx
console.log("desk");
`;

interface Desk {
  root: string;
  preview: string;
}

/** A small Desk checkout: package.json, a git head, installed packages with licences, and a built preview. */
function makeDesk(options: { version?: string; revision?: string } = {}): Desk {
  const root = fresh("desk");
  put(root, "package.json", JSON.stringify({ name: "plotwarden-review-desk", version: options.version ?? "1.0.0" }));
  put(root, ".git/HEAD", "ref: refs/heads/main\n");
  put(root, ".git/refs/heads/main", `${options.revision ?? REVISION}\n`);
  for (const [name, version, license] of [
    ["react", "18.3.1", "MIT"],
    ["scheduler", "0.23.2", "MIT"],
    ["zod", "4.6.7", "MIT"],
  ] as const) {
    put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version, license }));
  }
  const preview = join(root, "dist", "preview");
  put(preview, "index.html", '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plotwarden Review Desk</title><script type="module" crossorigin src="./assets/index-abc.js"></script></head><body><div id="root"></div></body></html>\n');
  put(preview, "assets/index-abc.js", DESK_JS);
  put(preview, "asset-manifest.json", '{"index.html":{"file":"assets/index-abc.js","isEntry":true}}\n');
  return { root, preview };
}

const REAL_HEADERS = readFileSync(join(repo, "site", "public", "_headers"), "utf8");
const REAL_404 = readFileSync(join(repo, "site", "public", "404.html"), "utf8");

const PAGE = (title: string, script: string, style = "./assets/a.css"): string =>
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${title}</title><script type="module" crossorigin src="${script}"></script><link rel="stylesheet" crossorigin href="${style}"></head><body><div id="root"></div></body></html>\n`;

let samplesMade: ReturnType<typeof buildVisitorFiles> | undefined;
/** The two real sample visitor files, built once. Their own policy is what the headers must repeat. */
const sampleVisitorFiles = (): ReturnType<typeof buildVisitorFiles> => (samplesMade ??= buildVisitorFiles());

/** A main checkout with the app builds, the hub and the two visitor files where `npm run build:apps` leaves them. */
function makeMain(): string {
  const root = fresh("main");
  const hub = "dist/apps/hub";
  put(root, `${hub}/index.html`, PAGE("Plotwarden", "./assets/hub.js"));
  put(root, `${hub}/assets/hub.js`, "console.log('hub');\n");
  put(root, `${hub}/assets/a.css`, "body{margin:0}\n");
  put(root, `${hub}/404.html`, REAL_404);
  put(root, `${hub}/_headers`, REAL_HEADERS);
  put(root, `${hub}/sw.js`, "// the worker\nself.addEventListener('fetch', function () {});\n");
  put(root, `${hub}/sw-register.js`, "console.log('register');\n");
  const samples = sampleVisitorFiles();
  for (const [kind, sample] of [
    ["family", samples.family],
    ["seeker", samples.seeker],
  ] as const) {
    put(root, `${hub}/visitor/${kind}/index.html`, PAGE(`Visitor ${kind}`, "../../assets/hub.js", "../../assets/a.css"));
    put(root, `${hub}/visitor/${kind}/${sample.fileName}`, sample.html);
  }
  put(root, "dist/apps/churchyard/index.html", PAGE("Churchyard Register", "./assets/c.js"));
  put(root, "dist/apps/churchyard/assets/c.js", "console.log('church');\n");
  put(root, "dist/apps/churchyard/assets/a.css", "body{margin:1px}\n");
  // The practice book that `npm run church:build` writes, so a build with no book is told apart from one with it.
  put(root, "dist/apps/churchyard/practice-book.csv", readFileSync(join(repo, "tests", "fixtures", "paper-200-bad.csv")));
  put(root, "dist/apps/allotments/index.html", PAGE("Allotment Register", "./assets/g.js"));
  put(root, "dist/apps/allotments/assets/g.js", "console.log('garden');\n");
  put(root, "dist/apps/allotments/assets/a.css", "body{margin:2px}\n");
  return root;
}

const lockOf = (root: string): string => join(root, "release", "desk-preview.lock.json");

describe("T36 lock:desk writes the lock from a Desk preview, by an explicit command", () => {
  it("pins the Desk name, version, revision, every file hash and the packages the preview bundles", () => {
    const desk = makeDesk();
    const root = fresh("lock");
    const result = run("lock-desk.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const lock = JSON.parse(readFileSync(lockOf(root), "utf8")) as Record<string, unknown>;
    expect(lock).toEqual({
      lock: 1,
      name: "plotwarden-review-desk",
      version: "1.0.0",
      revision: REVISION,
      entry: "index.html",
      files: {
        "asset-manifest.json": sha256(read(desk.preview, "asset-manifest.json")),
        "assets/index-abc.js": sha256(DESK_JS),
        "index.html": sha256(read(desk.preview, "index.html")),
      },
      bundled: [
        { name: "react", version: "18.3.1", license: "MIT" },
        { name: "scheduler", version: "0.23.2", license: "MIT" },
        { name: "zod", version: "4.6.7", license: "MIT" },
      ],
    });
    expect(readFileSync(lockOf(root), "utf8").endsWith("\n")).toBe(true);
    expect(readFileSync(lockOf(root), "utf8")).not.toContain("\r");
  });

  it("refuses to replace a lock unless it is told to", () => {
    const desk = makeDesk();
    const root = fresh("lock");
    expect(run("lock-desk.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    const before = readFileSync(lockOf(root), "utf8");
    put(desk.preview, "assets/index-abc.js", `${DESK_JS}// changed\n`);
    const refused = run("lock-desk.mjs", ["--desk", desk.preview, "--root", root]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("--replace");
    expect(readFileSync(lockOf(root), "utf8")).toBe(before);
    expect(run("lock-desk.mjs", ["--desk", desk.preview, "--root", root, "--replace"]).code).toBe(0);
    expect(readFileSync(lockOf(root), "utf8")).not.toBe(before);
  });

  it.each([
    ["no --desk", () => [] as string[]],
    ["a folder that is not there", () => ["--desk", join(scratch, "nowhere")]],
    ["a preview with no index.html", () => ["--desk", (() => { const d = fresh("empty"); mkdirSync(join(d, "dist", "preview"), { recursive: true }); put(d, "package.json", "{}"); return join(d, "dist", "preview"); })()]],
  ])("refuses %s, with code 2 and no lock", (_name, args) => {
    const root = fresh("lock");
    const result = run("lock-desk.mjs", [...args(), "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err).not.toBe("");
    expect(existsSync(lockOf(root))).toBe(false);
  });

  it("refuses a preview that bundles a package the Desk checkout does not have installed", () => {
    const desk = makeDesk();
    put(desk.preview, "assets/index-abc.js", `${DESK_JS}// node_modules/left-pad/index.js\n`);
    const root = fresh("lock");
    const result = run("lock-desk.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("left-pad");
    expect(existsSync(lockOf(root))).toBe(false);
  });
});

describe("T36 assemble:site", () => {
  /** A main tree with a lock made from `desk`, and the folder the assembly writes. */
  function ready(desk: Desk = makeDesk()): { root: string; desk: Desk; out: string } {
    const root = makeMain();
    expect(run("lock-desk.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    return { root, desk, out: join(root, "dist", "site") };
  }

  it("puts the hub at the root, each app in its own folder and the Desk preview at /review/", () => {
    const { root, desk, out } = ready();
    const result = run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(files(out)).toEqual(
      [
        "404.html",
        "_headers",
        "allotments/assets/a.css",
        "allotments/assets/g.js",
        "allotments/index.html",
        "assets/a.css",
        "assets/hub.js",
        "churchyard/assets/a.css",
        "churchyard/assets/c.js",
        "churchyard/index.html",
        "churchyard/practice-book.csv",
        "index.html",
        "review/asset-manifest.json",
        "review/assets/index-abc.js",
        "review/index.html",
        "sw-register.js",
        "sw.js",
        "visitor/family/family-map-2026-04-20.html",
        "visitor/family/index.html",
        "visitor/seeker/availability-map-2026-04-20.html",
        "visitor/seeker/index.html",
      ].sort(),
    );
  });

  it("copies the Desk preview byte for byte and puts the worker's script only in pages of its own", () => {
    const { root, desk, out } = ready();
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    for (const file of files(desk.preview)) expect(readFileSync(join(out, "review", file))).toEqual(readFileSync(join(desk.preview, file)));
    const tag = '<script type="module" src="/sw-register.js"></script>';
    for (const page of ["index.html", "churchyard/index.html", "allotments/index.html", "visitor/family/index.html", "visitor/seeker/index.html"]) {
      const html = read(out, page);
      expect(html.split(tag).length - 1).toBe(1);
      expect(html.indexOf(tag)).toBeLessThan(html.indexOf("</head>"));
    }
    // Not the Desk, not the 404 page, and not a visitor file, which seals itself.
    for (const page of ["review/index.html", "404.html", "visitor/family/family-map-2026-04-20.html", "visitor/seeker/availability-map-2026-04-20.html"]) {
      expect(read(out, page)).not.toContain("sw-register");
    }
  });

  it("stamps the worker with a version taken from the bytes of every file but itself and the headers", () => {
    const { root, desk, out } = ready();
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    const worker = read(out, "sw.js");
    const match = /^self\.__PLOTWARDEN_SHELL = (\{.*\});\n/.exec(worker);
    expect(match).not.toBeNull();
    const shell = JSON.parse((match as RegExpExecArray)[1] as string) as { version: string; files: string[] };
    const shellFiles = files(out).filter((f) => f !== "sw.js" && f !== "_headers");
    expect(shell.files).toEqual(shellFiles.map((f) => `/${f}`).sort());
    const expected = sha256(shell.files.map((f) => `${f}\0${sha256(readFileSync(join(out, f.slice(1))))}\n`).join("")).slice(0, 16);
    expect(shell.version).toBe(expected);
    // The rest of the worker is the built worker, unchanged.
    expect(worker.slice((match as RegExpExecArray)[0].length)).toBe(read(root, "dist/apps/hub/sw.js"));
  });

  it("gives the same bytes from the same inputs, and a new version when one file changes", () => {
    const { root, desk, out } = ready();
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    const first = treeHash(out);
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    expect(treeHash(out)).toBe(first);
    const versionOf = (): string => (JSON.parse(/^self\.__PLOTWARDEN_SHELL = (\{.*\});/.exec(read(out, "sw.js"))?.[1] ?? "{}") as { version: string }).version;
    const before = versionOf();
    put(root, "dist/apps/churchyard/assets/c.js", "console.log('church, changed');\n");
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    expect(versionOf()).not.toBe(before);
  });

  it("never writes the lock", () => {
    const { root, desk } = ready();
    const before = readFileSync(lockOf(root));
    const modified = statSync(lockOf(root)).mtimeMs;
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    expect(readFileSync(lockOf(root))).toEqual(before);
    expect(statSync(lockOf(root)).mtimeMs).toBe(modified);
  });

  it("stops with code 2 and writes nothing when there is no lock, and does not make one", () => {
    const desk = makeDesk();
    const root = makeMain();
    const result = run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("desk-preview.lock.json");
    expect(existsSync(join(root, "dist", "site"))).toBe(false);
    expect(existsSync(lockOf(root))).toBe(false);
  });

  describe("a wrong Desk preview stops it, names what differs, and leaves the folder as it was", () => {
    const cases: [string, (desk: Desk) => void, string][] = [
      ["a changed file", (d) => put(d.preview, "assets/index-abc.js", `${DESK_JS}// changed\n`), "assets/index-abc.js"],
      ["a changed page", (d) => put(d.preview, "index.html", `${read(d.preview, "index.html")}<!-- x -->`), "index.html"],
      ["a file the lock does not list", (d) => put(d.preview, "assets/extra.js", "x"), "assets/extra.js"],
      ["a file that is missing", (d) => rmSync(join(d.preview, "asset-manifest.json")), "asset-manifest.json"],
      ["another Desk version", (d) => put(d.root, "package.json", JSON.stringify({ name: "plotwarden-review-desk", version: "1.0.1" })), "version"],
      ["another Desk revision", (d) => put(d.root, ".git/refs/heads/main", `${OTHER_REVISION}\n`), "revision"],
      ["another Desk name", (d) => put(d.root, "package.json", JSON.stringify({ name: "something-else", version: "1.0.0" })), "name"],
    ];
    it.each(cases)("%s", (_name, change, mention) => {
      const { root, desk, out } = ready();
      // An earlier good assembly is already in place. A refused one must not touch it.
      expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
      const before = treeHash(out);
      change(desk);
      const result = run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]);
      expect(result.code).toBe(1);
      expect(result.err).toContain(mention);
      expect(treeHash(out)).toBe(before);
    });

    it("writes no folder at all on a first assembly that is refused", () => {
      const { root, desk, out } = ready();
      put(desk.preview, "assets/index-abc.js", `${DESK_JS}// changed\n`);
      expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(1);
      expect(existsSync(out)).toBe(false);
      expect(files(join(root, "dist")).some((f) => f.startsWith("site") || f.includes(".site-"))).toBe(false);
    });
  });

  it("stops with code 2 when an app build is missing, and writes nothing", () => {
    const { root, desk, out } = ready();
    rmSync(join(root, "dist", "apps", "allotments"), { recursive: true });
    const result = run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("allotments");
    expect(existsSync(out)).toBe(false);
  });

  it("stops with code 2 when the churchyard build has no practice book, and writes nothing", () => {
    const { root, desk, out } = ready();
    rmSync(join(root, "dist", "apps", "churchyard", "practice-book.csv"));
    const result = run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("churchyard/practice-book.csv");
    expect(existsSync(out)).toBe(false);
  });

  it("stops with code 2 when the hub has no visitor file, and writes nothing", () => {
    const { root, desk, out } = ready();
    rmSync(join(root, "dist", "apps", "hub", "visitor", "family", "family-map-2026-04-20.html"));
    const result = run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("visitor");
    expect(existsSync(out)).toBe(false);
  });

  it("reads the Desk folder from the environment when --desk is left out", () => {
    const { root, desk, out } = ready();
    const result = spawnSync(process.execPath, [join(repo, "scripts", "assemble-site.mjs"), "--root", root], {
      encoding: "utf8",
      env: { ...process.env, PLOTWARDEN_DESK_PREVIEW: desk.preview },
    });
    expect(result.status).toBe(0);
    expect(existsSync(join(out, "review", "index.html"))).toBe(true);
  });
});

// ---- the practice book -----------------------------------------------------------------------------------------

describe("T36 the practice book of the Churchyard Register", () => {
  const fixture = (name: string): string => readFileSync(join(repo, "tests", "fixtures", name), "utf8");
  // Worked by hand from the plan: R001 is the first row, R117 has no source ref, R199 and R200 have no place.
  const FIRST_ROW = "R001,Alder Ashgrove,Paper,C001,1850,P1";
  const ROW_117_BLANK = ",Quill Fernhollow,Paper,C117,1866-09,P12";
  const ROW_199 = "R199,Sorrel Larkspur,,,unknown,P20";

  it("is one source for the fixture files and the practice book", () => {
    expect(paperBookCsv(true)).toBe(fixture("paper-200-bad.csv"));
    expect(paperBookCsv(false)).toBe(fixture("paper-200.csv"));
  });

  it("has 200 rows under six headings, invented names, and no source ref in row 117 only", () => {
    const lines = paperBookCsv(true).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines).toHaveLength(201);
    expect(lines[0]).toBe("Source ref,Name,Section,Plot,Burial date,Page");
    expect(lines[1]).toBe(FIRST_ROW);
    expect(lines[117]).toBe(ROW_117_BLANK);
    expect(lines[199]).toBe(ROW_199);
    expect(lines.slice(1).filter((l) => l.startsWith(",")).length).toBe(1);
    expect(paperBookCsv(false).split("\n")[117]).toBe(`R117${ROW_117_BLANK}`);
  });

  it("is plain UTF-8 with LF line ends and no byte order mark", () => {
    const text = paperBookCsv(true);
    expect(text.includes("\r")).toBe(false);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("is written into a folder by generate-fixtures, as practice-book.csv and nothing else, and the fixtures stay as they were", () => {
    const folder = fresh("practice");
    const before = treeHash(join(repo, "tests", "fixtures"));
    const result = run("generate-fixtures.mjs", ["--practice-book", folder]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(files(folder)).toEqual(["practice-book.csv"]);
    expect(readFileSync(join(folder, "practice-book.csv"), "utf8")).toBe(fixture("paper-200-bad.csv"));
    expect(treeHash(join(repo, "tests", "fixtures"))).toBe(before);
  });

  it("is written into a folder that does not exist yet, and again with the same bytes", () => {
    const folder = join(fresh("practice"), "made", "here");
    expect(run("generate-fixtures.mjs", ["--practice-book", folder]).code).toBe(0);
    const once = readFileSync(join(folder, "practice-book.csv"));
    expect(run("generate-fixtures.mjs", ["--practice-book", folder]).code).toBe(0);
    expect(readFileSync(join(folder, "practice-book.csv"))).toEqual(once);
  });

  it("refuses --practice-book with no folder", () => {
    const result = run("generate-fixtures.mjs", ["--practice-book"]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("--practice-book");
  });
});

describe("T36 build:sw stamps one folder", () => {
  it("stamps a folder in place, once, however often it runs", () => {
    const site = fresh("sw");
    put(site, "index.html", "<html></html>");
    put(site, "a/b.js", "x");
    put(site, "sw.js", "// worker\n");
    put(site, "_headers", "/*\n  X: y\n");
    expect(run("build-sw.mjs", ["--site", site]).code).toBe(0);
    const once = read(site, "sw.js");
    const shell = JSON.parse(/^self\.__PLOTWARDEN_SHELL = (\{.*\});\n/.exec(once)?.[1] ?? "null") as { version: string; files: string[] };
    expect(shell.files).toEqual(["/a/b.js", "/index.html"]);
    expect(shell.version).toBe(sha256(`/a/b.js\0${sha256("x")}\n/index.html\0${sha256("<html></html>")}\n`).slice(0, 16));
    expect(once.endsWith("\n// worker\n")).toBe(true);
    expect(run("build-sw.mjs", ["--site", site]).code).toBe(0);
    expect(read(site, "sw.js")).toBe(once);
  });

  it("refuses a folder with no worker", () => {
    const site = fresh("sw");
    put(site, "index.html", "x");
    const result = run("build-sw.mjs", ["--site", site]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("sw.js");
  });
});

// ---- the release checks on an assembled tree -----------------------------------------------------------------

const LIBRARY = ["home", "new", "restore", "settings", "help", "about", "nope"];
const SHARED = ["home", "map", "map-edit", "map-trace", "list", "plot", "add", "add-one", "add-fast", "add-import", "exchange", "backup", "restore", "settings", "help"];
const CHURCH_MORE = ["burial-new", "burial", "reserve", "unplaced", "family", "report"];
const GARDEN_MORE = ["waiting", "offer", "tenancy", "handover", "season", "payments", "seeker", "report"];
const SITE_PROOFS = [
  "hub-home",
  "hub-about",
  "hub-not-found",
  "visitor-family-home",
  "visitor-family-about",
  "visitor-family-file",
  "visitor-seeker-home",
  "visitor-seeker-about",
  "visitor-seeker-file",
  "church-entry",
  "allotments-entry",
  "review-entry",
];

/** A picture with only what the check reads: its type and its width and height. */
function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(2048);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  return bytes;
}

function writeProofs(root: string, skip: string[] = []): string[] {
  const written: string[] = [];
  const add = (rel: string, width: number): void => {
    if (skip.includes(rel)) return;
    put(root, rel, jpeg(width, 640));
    written.push(rel);
  };
  for (const name of LIBRARY) {
    add(`docs/acceptance/layout/routes/churchyard/library-${name}-phone.jpg`, 360);
    add(`docs/acceptance/layout/routes/allotment/library-${name}-phone.jpg`, 360);
  }
  for (const name of [...SHARED, ...CHURCH_MORE]) add(`docs/acceptance/layout/routes/churchyard/route-${name}-phone.jpg`, 360);
  for (const name of [...SHARED, ...GARDEN_MORE]) add(`docs/acceptance/layout/routes/allotment/route-${name}-phone.jpg`, 360);
  for (const name of SITE_PROOFS) {
    add(`docs/acceptance/layout/site/${name}-phone.jpg`, 360);
    add(`docs/acceptance/layout/site/${name}-desktop.jpg`, 1920);
  }
  return written;
}

/** The site policy of the `/` rule, and the same without `frame-ancestors`, which a meta tag cannot set. */
const SITE_POLICY = valuesOf("/", parseHeaders(REAL_HEADERS), "Content-Security-Policy")[0] as string;
const META_POLICY = SITE_POLICY.split(";")
  .map((part) => part.trim())
  .filter((part) => part !== "" && !part.startsWith("frame-ancestors"))
  .join("; ");
const POLICY_TAG = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\s*\/?>/g;

describe("T36 the 404 page holds its own content policy", () => {
  // The live host matches each `_headers` rule on the address that was asked, so the `/404.html` rule never reaches this page there.
  it("has one meta policy, equal to the site policy without frame-ancestors", () => {
    expect(SITE_POLICY).toContain("frame-ancestors 'none'");
    const tags = [...REAL_404.matchAll(POLICY_TAG)];
    expect(tags.length).toBe(1);
    expect(tags[0]?.[1]).toBe(META_POLICY);
    expect(META_POLICY).not.toContain("frame-ancestors");
  });

  it("holds the tag in the head before any style or script, and refuses inline script", () => {
    const head = REAL_404.slice(0, REAL_404.indexOf("</head>"));
    expect(head.indexOf('http-equiv="Content-Security-Policy"')).toBeGreaterThan(-1);
    expect(head.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(head.indexOf("<style"));
    expect(REAL_404).not.toMatch(/<script/i);
    expect(parsePolicy(META_POLICY)["script-src"]).toEqual(["'self'"]);
    expect(policyProblems(META_POLICY)).toEqual([]);
  });
});

describe("T36 check:release", () => {
  /** An assembled tree that passes. Each case then breaks one thing. */
  function assembled(): { root: string; out: string; desk: Desk } {
    const desk = makeDesk();
    const root = makeMain();
    expect(run("lock-desk.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    expect(run("assemble-site.mjs", ["--desk", desk.preview, "--root", root]).code).toBe(0);
    return { root, out: join(root, "dist", "site"), desk };
  }
  const check = (root: string, part = "site"): Ran => run("check-release.mjs", ["--root", root, "--part", part]);
  /** Edit a file of the built site, then fix the worker's version so only the edit under test can fail. */
  const restamp = (out: string): void => void run("build-sw.mjs", ["--site", out]);

  it("passes an assembled site", () => {
    const { root } = assembled();
    const result = check(root);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("check-release: ok");
  });

  it("finds every direct entry as a real page: a title, a script that exists and a style that exists", () => {
    const { root, out } = assembled();
    for (const page of ["index.html", "churchyard/index.html", "allotments/index.html", "review/index.html", "visitor/family/index.html", "visitor/seeker/index.html", "404.html"]) {
      expect(existsSync(join(out, page))).toBe(true);
    }
    rmSync(join(out, "churchyard", "assets", "c.js"));
    restamp(out);
    const result = check(root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("churchyard/index.html");
    expect(result.err).toContain("missing-file");
  });

  it("fails a site that has lost the practice book of the Churchyard Register, and passes with it", () => {
    const { root, out } = assembled();
    expect(existsSync(join(out, "churchyard", "practice-book.csv"))).toBe(true);
    expect(check(root).code).toBe(0);
    rmSync(join(out, "churchyard", "practice-book.csv"));
    restamp(out);
    const result = check(root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("churchyard/practice-book.csv");
    expect(result.err).toContain("missing-file");
  });

  it("fails a page that has no title and no script", () => {
    const { root, out } = assembled();
    put(out, "allotments/index.html", "<!doctype html><html><head></head><body></body></html>");
    restamp(out);
    const result = check(root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("allotments/index.html");
    expect(result.err).toContain("blank");
  });

  describe("no billing endpoint and no remote asset", () => {
    const bad: [string, string, string, string][] = [
      ["a billing host in a script", "churchyard/assets/c.js", "fetch('https://api.stripe.com/v1/charges');", "billing"],
      ["a checkout path in a script", "allotments/assets/g.js", "fetch('/api/checkout/session');", "billing"],
      ["a payment host in a page", "index.html", '<a href="https://www.paypal.com/pay">pay</a>', "billing"],
      ["a remote script", "index.html", '<script src="https://cdn.example.net/x.js"></script>', "remote"],
      ["a remote image", "index.html", '<img src="https://images.example.net/x.png" alt="">', "remote"],
      ["a remote style", "assets/a.css", "@import url(https://fonts.example.net/f.css);", "remote"],
      ["a remote font in a style", "assets/a.css", "@font-face{src:url('//fonts.example.net/f.woff2')}", "remote"],
      ["an address that a script could fetch", "churchyard/assets/c.js", "const u = 'https://collect.example.net/e'; navigator.sendBeacon(u);", "remote"],
    ];
    it.each(bad)("fails %s", (_name, file, extra, rule) => {
      const { root, out } = assembled();
      put(out, file, `${read(out, file)}\n${extra}\n`);
      restamp(out);
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain(file);
      expect(result.err).toContain(rule);
    });

    it("lets the namespaces, the error address that a bundled React holds, a schema identifier and a comment stand", () => {
      const { root, out } = assembled();
      put(
        out,
        "churchyard/assets/c.js",
        `${read(out, "churchyard/assets/c.js")}\nvar a = "http://www.w3.org/2000/svg"; var b = "http://www.w3.org/1999/xlink"; var c = "https://reactjs.org/docs/error-decoder.html?invariant=";\nvar d = { $schema: "https://json-schema.org/draft/2020-12/schema" };\n/**\n * See https://github.com/example/project.\n */\n// https://example.net/in-a-comment\n`,
      );
      restamp(out);
      expect(check(root).code).toBe(0);
    });

    it("fails a function folder, a routes file and a worker script for the host", () => {
      for (const extra of ["functions/api.js", "_routes.json", "_worker.js", "wrangler.toml"]) {
        const { root, out } = assembled();
        put(out, extra, "x");
        restamp(out);
        const result = check(root);
        expect(result.code, extra).toBe(1);
        expect(result.err).toContain(extra);
        expect(result.err).toContain("server-code");
      }
    });
  });

  describe("the headers", () => {
    const withHeaders = (text: string): { root: string; result: Ran } => {
      const { root, out } = assembled();
      put(out, "_headers", text);
      restamp(out);
      return { root, result: check(root) };
    };

    it("pass as they are", () => {
      expect(withHeaders(REAL_HEADERS).result.code).toBe(0);
    });

    it("fail a policy that names an outside origin", () => {
      const { result } = withHeaders(REAL_HEADERS.replace("connect-src 'self'", "connect-src 'self' https://api.example.net"));
      expect(result.code).toBe(1);
      expect(result.err).toContain("csp");
    });

    it("fail a script policy that allows inline script or eval, for a page of the site", () => {
      for (const bad of ["script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-eval'", "script-src *", "script-src 'self' data:"]) {
        const { result } = withHeaders(REAL_HEADERS.replace(/\/churchyard\/\*\n {2}Content-Security-Policy: default-src 'self'; script-src 'self'/, `/churchyard/*\n  Content-Security-Policy: default-src 'self'; ${bad}`));
        expect(result.code, bad).toBe(1);
        expect(result.err).toContain("csp");
      }
    });

    it("fail a path that two policies match, because both would be enforced", () => {
      const { result } = withHeaders(`${REAL_HEADERS}\n/churchyard/index.html\n  Content-Security-Policy: default-src 'self'\n`);
      expect(result.code).toBe(1);
      expect(result.err).toContain("two policies");
    });

    it("fail a page that no policy matches", () => {
      const { result } = withHeaders(REAL_HEADERS.replace(/\/allotments\/\*\n {2}Content-Security-Policy:[^\n]*\n/, ""));
      expect(result.code).toBe(1);
      expect(result.err).toContain("allotments/index.html");
      expect(result.err).toContain("no policy");
    });

    it("fail a sample visitor file whose policy is not the one the file holds for itself", () => {
      const { result } = withHeaders(REAL_HEADERS.replace("/visitor/family/family-map-*\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'", "/visitor/family/family-map-*\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://x.example.net"));
      expect(result.code).toBe(1);
      expect(result.err).toContain("visitor");
    });

    it("fail a missing file", () => {
      const { root, out } = assembled();
      rmSync(join(out, "_headers"));
      restamp(out);
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("_headers");
    });

    describe("the 404 page's own policy", () => {
      const with404 = (edit: (html: string) => string): Ran => {
        const { root, out } = assembled();
        put(out, "404.html", edit(read(out, "404.html")));
        restamp(out);
        return check(root);
      };

      it("fails a 404 page that has no policy tag", () => {
        const result = with404((html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ""));
        expect(result.code).toBe(1);
        expect(result.err).toContain("404.html");
        expect(result.err).toContain("csp");
      });

      it("fails a 404 page whose tag is not the site policy without frame-ancestors", () => {
        for (const edit of [
          (html: string) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
          (html: string) => html.replace("connect-src 'self'", "connect-src 'self' https://api.example.net"),
          (html: string) => html.replace("object-src 'none'; ", ""),
          (html: string) => html.replace(/(content="[^"]*)"/, "$1; frame-ancestors 'none'\""),
        ]) {
          const result = with404(edit);
          expect(result.code).toBe(1);
          expect(result.err).toContain("404.html");
          expect(result.err).toContain("csp");
        }
      });
    });
  });

  describe("the worker", () => {
    it("fails a worker that was never stamped", () => {
      const { root, out } = assembled();
      put(out, "sw.js", "// no stamp\n");
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("sw.js");
    });

    it("fails a version that no longer matches the files", () => {
      const { root, out } = assembled();
      put(out, "assets/hub.js", "console.log('changed after the stamp');\n");
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("version");
    });
  });

  describe("the Desk preview", () => {
    it("fails a copy that no longer matches the lock", () => {
      const { root, out } = assembled();
      put(out, "review/assets/index-abc.js", `${DESK_JS}// changed after assembly\n`);
      restamp(out);
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("review/assets/index-abc.js");
      expect(result.err).toContain("desk-digest");
    });

    it("fails when there is no lock", () => {
      const { root } = assembled();
      rmSync(lockOf(root));
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("desk-preview.lock.json");
    });
  });

  describe("size", () => {
    it("fails more than 500 files", () => {
      const { root, out } = assembled();
      for (let i = 0; i < 500; i++) put(out, `assets/f${i}.txt`, "x");
      restamp(out);
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("500 files");
    });

    it("fails a site over 5 MiB", () => {
      const { root, out } = assembled();
      put(out, "assets/big.bin", new Uint8Array(5 * 1024 * 1024 + 1));
      restamp(out);
      const result = check(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain("5 MiB");
    });
  });

  describe("the inventory of proof pictures", () => {
    it("passes when every route has its picture at the right width", () => {
      const { root } = assembled();
      writeProofs(root);
      const result = check(root, "inventory");
      expect(result.err).toBe("");
      expect(result.code).toBe(0);
    });

    it("fails a route that has no picture, and names it", () => {
      const { root } = assembled();
      writeProofs(root, ["docs/acceptance/layout/routes/allotment/route-payments-phone.jpg"]);
      const result = check(root, "inventory");
      expect(result.code).toBe(1);
      expect(result.err).toContain("routes/allotment/route-payments-phone.jpg");
    });

    it("fails a hub or visitor route that lacks one of the two sizes", () => {
      const { root } = assembled();
      writeProofs(root, ["docs/acceptance/layout/site/visitor-seeker-home-desktop.jpg"]);
      const result = check(root, "inventory");
      expect(result.code).toBe(1);
      expect(result.err).toContain("visitor-seeker-home-desktop.jpg");
    });

    it("fails a picture that is empty, is not a picture, or has the wrong width", () => {
      const { root } = assembled();
      writeProofs(root);
      put(root, "docs/acceptance/layout/routes/churchyard/route-map-phone.jpg", "");
      put(root, "docs/acceptance/layout/routes/churchyard/route-list-phone.jpg", new Uint8Array(4096));
      put(root, "docs/acceptance/layout/site/hub-home-desktop.jpg", jpeg(1280, 640));
      const result = check(root, "inventory");
      expect(result.code).toBe(1);
      expect(result.err).toContain("route-map-phone.jpg");
      expect(result.err).toContain("route-list-phone.jpg");
      expect(result.err).toContain("hub-home-desktop.jpg");
    });

    it("fails a page of the built site that the inventory does not know, so a new route cannot go unseen", () => {
      const { root, out } = assembled();
      writeProofs(root);
      put(out, "newroute/index.html", PAGE("New", "../assets/hub.js", "../assets/a.css"));
      restamp(out);
      const result = check(root, "inventory");
      expect(result.code).toBe(1);
      expect(result.err).toContain("newroute/index.html");
      expect(result.err).toContain("no proof");
    });
  });
});

// ---- licences ---------------------------------------------------------------------------------------------------

describe("T36 check:licenses", () => {
  const NOTICES = `# Third party notices

## Runtime

| Package | Version | Licence | Use |
|---|---|---|---|
| react | 19.3.1 | MIT | Screens |
| zod | 4.6.7 | MIT | Closed schemas |

## Development and test only

| Package | Version | Licence | Use |
|---|---|---|---|
| vitest | 5.1.1 | MIT | Tests |
`;

  function tree(options: { notices?: string; lockExtra?: Record<string, unknown>; licenses?: Record<string, string | undefined> } = {}): string {
    const root = fresh("licenses");
    put(root, "package.json", JSON.stringify({ dependencies: { react: "19.3.1", zod: "4.6.7" }, devDependencies: { vitest: "5.1.1" } }));
    put(
      root,
      "package-lock.json",
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "x" },
          "node_modules/react": { version: "19.3.1" },
          "node_modules/zod": { version: "4.6.7" },
          "node_modules/vitest": { version: "5.1.1", dev: true },
          "node_modules/vitest/node_modules/tiny": { version: "1.0.0", dev: true },
          ...options.lockExtra,
        },
      }),
    );
    const licenses = { react: "MIT", zod: "MIT", vitest: "MIT", tiny: "ISC", ...options.licenses };
    for (const [name, version] of [["react", "19.3.1"], ["zod", "4.6.7"], ["vitest", "5.1.1"]] as const) {
      put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version, ...(licenses[name] === undefined ? {} : { license: licenses[name] }) }));
    }
    put(root, "node_modules/vitest/node_modules/tiny/package.json", JSON.stringify({ name: "tiny", version: "1.0.0", license: "ISC" }));
    put(root, "THIRD_PARTY_NOTICES.md", options.notices ?? NOTICES);
    return root;
  }
  const check = (root: string): Ran => run("check-licenses.mjs", ["--root", root]);

  it("passes when every shipped package has its row with its version and licence", () => {
    const result = check(tree());
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("check-licenses: ok");
  });

  it("does not ask for a development package, however deep", () => {
    expect(check(tree({ notices: NOTICES.replace("| vitest | 5.1.1 | MIT | Tests |\n", "") })).code).toBe(0);
  });

  it("fails a shipped package that has no row, and names it", () => {
    const result = check(tree({ notices: NOTICES.replace("| zod | 4.6.7 | MIT | Closed schemas |\n", "") }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("zod");
  });

  it("fails a row with another version", () => {
    const result = check(tree({ notices: NOTICES.replace("| react | 19.3.1 |", "| react | 19.3.0 |") }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("react");
    expect(result.err).toContain("19.3.1");
  });

  it("fails a row with another licence than the package says", () => {
    const result = check(tree({ notices: NOTICES.replace("| react | 19.3.1 | MIT |", "| react | 19.3.1 | Apache-2.0 |") }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("MIT");
  });

  it("fails a shipped package that states no licence", () => {
    const result = check(tree({ licenses: { zod: undefined } }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("zod");
    expect(result.err).toContain("no licence");
  });

  it("fails a shipped package that is not installed, so a licence is never guessed", () => {
    const root = tree();
    rmSync(join(root, "node_modules", "zod"), { recursive: true });
    const result = check(root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("zod");
  });

  it("also asks for the packages that the pinned Desk preview bundles", () => {
    const root = tree();
    put(root, "release/desk-preview.lock.json", JSON.stringify({ lock: 1, bundled: [{ name: "react", version: "18.3.1", license: "MIT" }, { name: "scheduler", version: "0.23.2", license: "MIT" }] }));
    const missing = check(root);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("scheduler");
    expect(missing.err).toContain("react 18.3.1");
    put(root, "THIRD_PARTY_NOTICES.md", `${NOTICES}\n## In the Review Desk preview\n\n| Package | Version | Licence | Use |\n|---|---|---|---|\n| react | 18.3.1 | MIT | Desk screens |\n| scheduler | 0.23.2 | MIT | Desk screens |\n`);
    expect(check(root).code).toBe(0);
  });
});

// The two font packages are development packages, but their files are copied into `fonts/` and ship in every build,
// so they need their rows and the licence text too (spec 07, L2.6).
describe("T36 check:licenses, fonts", () => {
  const OFL = "SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007";
  const ROWS = "| @fontsource/atkinson-hyperlegible-next | 5.3.0 | OFL-1.1 | Text font |\n| @fontsource/gelasio | 5.3.0 | OFL-1.1 | Heading font |\n";
  const notices = (rows = ROWS, licence = OFL): string => `# Third party notices\n\n## Fonts\n\n| Package | Version | Licence | Use |\n|---|---|---|---|\n${rows}\n\`\`\`\n${licence}\n\`\`\`\n`;

  function tree(options: { notices?: string; skipInstall?: string; license?: string } = {}): string {
    const root = fresh("fonts-licenses");
    put(root, "package.json", JSON.stringify({ devDependencies: {} }));
    put(root, "package-lock.json", JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "x" } } }));
    put(root, "fonts/atkinson.css", "/* fonts */\n");
    for (const name of ["@fontsource/atkinson-hyperlegible-next", "@fontsource/gelasio"]) {
      if (name !== options.skipInstall) put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version: "5.3.0", license: options.license ?? "OFL-1.1" }));
    }
    put(root, "THIRD_PARTY_NOTICES.md", options.notices ?? notices());
    return root;
  }
  const check = (root: string): Ran => run("check-licenses.mjs", ["--root", root]);

  it("passes when both font packages have their rows and the licence text is there", () => {
    const result = check(tree());
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("2 font packages");
  });

  it("fails a font package that has no row, and names it", () => {
    const result = check(tree({ notices: notices("| @fontsource/gelasio | 5.3.0 | OFL-1.1 | Heading font |\n") }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("@fontsource/atkinson-hyperlegible-next");
  });

  it("fails a row with another version or another licence than the package states", () => {
    const version = check(tree({ notices: notices(ROWS.replace("| 5.3.0 |", "| 5.2.0 |")) }));
    expect(version.code).toBe(1);
    expect(version.err).toContain("5.3.0");
    const licence = check(tree({ license: "MIT" }));
    expect(licence.code).toBe(1);
    expect(licence.err).toContain("OFL-1.1");
  });

  it("fails a font package that is not installed, so a licence is never guessed", () => {
    const result = check(tree({ skipInstall: "@fontsource/gelasio" }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("@fontsource/gelasio");
  });

  it("fails when the text of the Open Font License is not in the notices", () => {
    const result = check(tree({ notices: notices(ROWS, "no licence text here") }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("SIL Open Font License");
  });
});

// ---- links ---------------------------------------------------------------------------------------------------------

describe("T36 check:links", () => {
  function tree(readme: string, extra: Record<string, string> = {}): string {
    const root = fresh("links");
    put(root, "README.md", readme);
    put(root, "docs/guide.md", "# Guide\n\n## Two minute path\n\nText.\n");
    put(root, "apps/churchyard-register/package.json", "{}");
    put(root, "docs/acceptance/pic.jpg", "x");
    for (const [path, text] of Object.entries(extra)) put(root, path, text);
    return root;
  }
  const check = (root: string): Ran => run("check-links.mjs", ["--root", root]);

  it("passes links to files, folders, headings and pictures", () => {
    const root = tree("[a](docs/guide.md) [b](apps/churchyard-register) [c](docs/guide.md#two-minute-path) [d](./docs/guide.md) ![e](docs/acceptance/pic.jpg) [f](#top)\n\n# Top\n\n[g]: docs/guide.md\n", { "docs/other.md": "[back](../README.md)\n[sibling](guide.md)\n" });
    const result = check(root);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("check-links: ok");
  });

  it.each([
    ["a missing file", "[a](docs/nope.md)", "docs/nope.md"],
    ["a missing folder", "[a](apps/nope)", "apps/nope"],
    ["a heading that is not there", "[a](docs/guide.md#nowhere)", "#nowhere"],
    ["a heading on the same page that is not there", "[a](#nowhere)", "#nowhere"],
    ["a missing picture", "![a](docs/acceptance/nope.jpg)", "nope.jpg"],
    ["a missing reference target", "[r]: docs/nope.md\n\n[a][r]", "docs/nope.md"],
    ["an address on the web", "[a](https://example.net/page)", "https://example.net/page"],
    ["a link that leaves the repository", "[a](../outside.md)", "../outside.md"],
  ])("fails %s, with the file and line", (_name, readme, mention) => {
    const result = check(tree(readme));
    expect(result.code).toBe(1);
    expect(result.err).toContain("README.md:1");
    expect(result.err).toContain(mention);
  });

  it("reads the docs folder too", () => {
    const result = check(tree("fine", { "docs/bad.md": "line one\n[a](missing.md)\n" }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("docs/bad.md:2");
  });

  it("does not read links in code", () => {
    expect(check(tree("`[a](nope.md)`\n\n```\n[a](nope.md)\n```\n")).code).toBe(0);
  });

  it("resolves a link to a page of the site against the built site", () => {
    const root = tree("[a](/churchyard/) [b](/visitor/family/)");
    const missing = check(root);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("/churchyard/");
    put(root, "dist/site/churchyard/index.html", "x");
    put(root, "dist/site/visitor/family/index.html", "x");
    expect(check(root).code).toBe(0);
    rmSync(join(root, "dist", "site", "visitor", "family", "index.html"));
    expect(check(root).code).toBe(1);
  });
});

// ---- public text over a tree ------------------------------------------------------------------------------------

describe("T36 check:public", () => {
  const check = (root: string, env: Record<string, string> = {}): Ran => run("check-public.mjs", ["--root", root], 60_000, env);
  const withWords = (): Record<string, string> => ({ PLOTWARDEN_BANNED_WORDS: wordsFile(PLACEHOLDER_LISTS) });
  const skipLines = (out: string): string[] => out.split("\n").filter((line) => /skipped/.test(line));

  it("passes clean text and names nothing", () => {
    const root = fresh("public");
    put(root, "README.md", "# Plotwarden\n\nKiro wrote the specs.\n");
    put(root, "docs/guide.md", "Open the register, then close it.\n");
    put(root, "site/index.html", "<!doctype html><title>Plotwarden</title><p>Plot registers.</p>");
    const result = check(root, withWords());
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("check-public: ok");
    expect(skipLines(result.out)).toEqual([]);
  });

  it("fails each kind of fault with its file and line, in text and in source", () => {
    const root = fresh("public");
    put(root, "README.md", "fine\nOpen it \u2014 close it\n");
    put(root, "docs/a.md", "fine\nfine\nMade with Zorblax\n");
    put(root, "docs/b.md", "A Quibblewick entry\n");
    put(root, "docs/c.md", "See D:\\Projects\\plotwarden\\x\n");
    put(root, "apps/x/src/rules.ts", "// Flumph Labs wrote this\n");
    const result = check(root, withWords());
    expect(result.code).toBe(1);
    expect(result.err).toContain("README.md:2: dash");
    expect(result.err).toContain("docs/a.md:3: vendor: Zorblax");
    expect(result.err).toContain("docs/b.md:1: other: Quibblewick");
    expect(result.err).toContain("docs/c.md:1: local-path");
    expect(result.err).toContain("apps/x/src/rules.ts:1: vendor: Flumph Labs");
    expect(skipLines(result.out)).toEqual([]);
  });

  it("with no variable, says once that the two lists were skipped, and still runs every other check", () => {
    const clean = fresh("public");
    put(clean, "docs/a.md", "Made with Zorblax for the Quibblewick.\n");
    const skipped = check(clean);
    expect(skipped.err).toBe("");
    expect(skipped.code).toBe(0);
    expect(skipLines(skipped.out)).toHaveLength(1);
    expect(skipLines(skipped.out)[0]).toContain("banned word lists");
    expect(skipped.out).toContain("check-public: ok");

    const faulty = fresh("public");
    put(faulty, "README.md", "fine\nOpen it \u2014 close it\n");
    put(faulty, "docs/c.md", "See D:\\Projects\\plotwarden\\x\n");
    put(faulty, "docs/a.md", "Made with Zorblax\n");
    const result = check(faulty);
    expect(result.code).toBe(1);
    expect(result.err).toContain("README.md:2: dash");
    expect(result.err).toContain("docs/c.md:1: local-path");
    expect(result.err).not.toContain("vendor");
    expect(skipLines(result.out)).toHaveLength(1);
  });

  it("treats an empty variable as not set", () => {
    const root = fresh("public");
    put(root, "docs/a.md", "Made with Zorblax\n");
    const result = check(root, { PLOTWARDEN_BANNED_WORDS: "" });
    expect(result.code).toBe(0);
    expect(skipLines(result.out)).toHaveLength(1);
  });

  it("exits 2 and scans nothing when the file is missing, not JSON, or the wrong shape", () => {
    const root = fresh("public");
    put(root, "docs/a.md", "fine\n");
    const folder = fresh("words");
    const broken = join(folder, "broken.json");
    writeFileSync(broken, "{ not json");
    const wrong = wordsFile({ vendor: "Zorblax", other: [] });
    for (const file of [join(folder, "none.json"), broken, wrong]) {
      const result = check(root, { PLOTWARDEN_BANNED_WORDS: file });
      expect(result.code).toBe(2);
      expect(result.err).toMatch(/banned words/i);
      expect(result.out).not.toContain("check-public: ok");
      expect(skipLines(result.out)).toEqual([]);
    }
  });

  it("reads the built site pages too, and leaves node_modules, dist apps and the lock file alone", () => {
    const root = fresh("public");
    put(root, "dist/site/index.html", "<p>one \u2014 two</p><p>Zorblax</p>");
    put(root, "dist/apps/hub/index.html", "<p>one \u2014 two</p>");
    put(root, "node_modules/x/README.md", "Zorblax \u2014 x");
    put(root, "package-lock.json", '{"x":"Zorblax"}');
    const result = check(root, withWords());
    expect(result.code).toBe(1);
    expect(result.err).toContain("dist/site/index.html:1: dash");
    expect(result.err).toContain("dist/site/index.html:1: vendor");
    expect(result.err).not.toContain("dist/apps");
    expect(result.err).not.toContain("node_modules");
    expect(result.err).not.toContain("package-lock");
  });

  it("scans its own script and its library, which are no longer skipped", () => {
    const root = fresh("public");
    for (const rel of ["scripts/check-public.mjs", "scripts/lib/publicText.mjs"]) put(root, rel, readFileSync(join(repo, rel), "utf8"));
    const result = check(root, withWords());
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("check-public: ok, 2 files");
  });

  it("reads the words in the files that are let off the generic rules, and lets them off those rules only", () => {
    const root = fresh("public");
    put(root, "scripts/lib/publicText.mjs", "// Zorblax\n");
    put(root, "scripts/check-public.mjs", "// Quibblewick\n");
    put(root, "tests/unit/release.test.ts", 'const a = "Zorblax"; const b = "See C:/Users/someone/x";\n');
    put(root, "tests/unit/copy.test.ts", 'const b = "See C:/Users/someone/x";\n');
    const result = check(root, withWords());
    expect(result.code).toBe(1);
    expect(result.err).toContain("scripts/lib/publicText.mjs:1: vendor: Zorblax");
    expect(result.err).toContain("scripts/check-public.mjs:1: other: Quibblewick");
    expect(result.err).toContain("tests/unit/release.test.ts:1: vendor: Zorblax");
    expect(result.err).not.toContain("local-path");
  });
});

// ---- the write-up and the facts it corrects (spec 06, Z22) -----------------------------------------------------
//
// The page is read as text. Every expected value below is typed from the task and the plan, not read from the page.
// The only clock in this group is the real one: Z22.7 says no row of the log may be dated after the day the check
// runs, so a fixed clock would test nothing.

describe("T36 the write-up (Z22)", () => {
  const SECTIONS = ["Surfaces", "Custom agents", "Hooks", "Specs", "Steering", "MCP", "Property tests", "Powers"];
  const writeUpPath = join(repo, "docs", "write-up.md");
  /** The page, or an empty text when it is missing, so a missing page fails each check on its missing content. */
  const writeUp = (): string => (existsSync(writeUpPath) ? readFileSync(writeUpPath, "utf8") : "");
  const doc = (rel: string): string => readFileSync(join(repo, rel), "utf8");

  interface Section {
    title: string;
    body: string;
  }
  function sectionsOf(text: string): Section[] {
    const found: Section[] = [];
    let fence = false;
    for (const line of text.split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const heading = fence ? null : /^## (.+?)\s*$/.exec(line);
      const last = found[found.length - 1];
      if (heading !== null) found.push({ title: heading[1] ?? "", body: "" });
      else if (last !== undefined) last.body += `${line}\n`;
    }
    return found;
  }
  const paragraphsOf = (body: string): string[] => body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== "");
  const proseOf = (text: string): string => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const linksOf = (text: string): string[] => [...proseOf(text).matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1] ?? "");
  /** A log row is cited as: row "the start of its Spec and task text". */
  const rowCitationsOf = (text: string): string[] => [...proseOf(text).matchAll(/\brow "([^"]{12,})"/gi)].map((m) => m[1] ?? "");

  function anchorsOf(text: string): Set<string> {
    const seen = new Map<string, number>();
    const anchors = new Set<string>();
    for (const line of proseOf(text).split("\n")) {
      const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading === null) continue;
      const base = (heading[1] ?? "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*_~]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .trim()
        .replace(/\s/g, "-");
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      anchors.add(count === 0 ? base : `${base}-${count}`);
    }
    return anchors;
  }

  interface LogRow {
    date: string;
    tool: string;
    spec: string;
  }
  const logRows = (): LogRow[] =>
    doc("docs/kiro-log.md")
      .split("\n")
      .filter((line) => /^\| \d{4}-\d{2}-\d{2} \|/.test(line))
      .map((line) => {
        const cells = line.split("|");
        return { date: (cells[1] ?? "").trim(), tool: (cells[2] ?? "").trim(), spec: (cells[3] ?? "").trim() };
      });
  const localToday = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const section = (title: string): string => sectionsOf(writeUp()).find((s) => s.title === title)?.body ?? "";

  it("the page exists", () => {
    expect(existsSync(writeUpPath)).toBe(true);
  });

  it("has the eight headings, in this order, and no other second level heading", () => {
    expect(sectionsOf(writeUp()).map((s) => s.title)).toEqual(SECTIONS);
  });

  it.each(SECTIONS)("%s says what was done, one effect and what was not done, in that order, once each", (title) => {
    const labels = paragraphsOf(section(title))
      .map((p) => /^\*\*(Done\.|Effect\.|Not done\.)\*\*\s+\S/.exec(p)?.[1])
      .filter((label): label is string => label !== undefined);
    expect(labels).toEqual(["Done.", "Effect.", "Not done."]);
  });

  it.each(SECTIONS)("%s gives its effect with a link to a file or a row of the log", (title) => {
    const effect = paragraphsOf(section(title)).find((p) => p.startsWith("**Effect.**")) ?? "";
    expect(linksOf(effect).length + rowCitationsOf(effect).length).toBeGreaterThan(0);
  });

  it("every link resolves to a file, a folder or a heading of this repository, and none is a web address", () => {
    const links = linksOf(writeUp());
    expect(links.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const target of links) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
        bad.push(`${target}: an address on the web`);
        continue;
      }
      const [pathPart = "", fragment] = target.split("#");
      const resolved = join(repo, "docs", decodeURIComponent(pathPart));
      if (!existsSync(resolved)) {
        bad.push(`${target}: no such file or folder`);
        continue;
      }
      if (fragment !== undefined && fragment !== "" && statSync(resolved).isFile() && resolved.endsWith(".md")) {
        if (!anchorsOf(readFileSync(resolved, "utf8")).has(fragment.toLowerCase())) bad.push(`${target}: no such heading`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every row it cites is the start of the Spec and task text of a row of the log", () => {
    const cited = rowCitationsOf(writeUp());
    expect(cited.length).toBeGreaterThan(0);
    const specs = logRows().map((row) => row.spec);
    expect(cited.filter((name) => !specs.some((spec) => spec.startsWith(name)))).toEqual([]);
  });

  describe("what each section must say", () => {
    it("Surfaces: Kiro CLI built both repositories, the Review Desk runs inside Kiro Crew 0.12.2, no other surface is claimed", () => {
      const body = section("Surfaces");
      expect(body).toContain("Kiro CLI");
      expect(body).toContain("both repositories");
      expect(body).toContain("Kiro Crew 0.12.2");
      expect(body).toMatch(/IDE/);
      expect(body).toMatch(/not (?:used|tried|run)/i);
    });

    it("Custom agents: the read only reviewer found twelve, four are named with their rows, and its inspector tools were off", () => {
      const body = section("Custom agents");
      for (const profile of ["register-builder", "register-reviewer", "desk-builder"]) expect(body, profile).toContain(profile);
      expect(body).toMatch(/read only/);
      expect(body).toMatch(/twelve findings/);
      expect(body).toMatch(/inspector tools were switched off/);
      expect(body).toContain("searched name");
      expect(body).toContain("year only");
      expect(body).toContain("living people");
      expect(body).toMatch(/slip/);
      const cited = rowCitationsOf(body);
      expect(cited.some((name) => name.startsWith("07 repair: a search stays out of the address"))).toBe(true);
      expect(cited.some((name) => name.startsWith("07 repair: slip, burial overlap, private names"))).toBe(true);
    });

    it("Specs: the spec against short prompt result with its numbers, and the rows of the 07 slices", () => {
      const body = section("Specs");
      for (const text of ["22 minutes", "23 minutes", "58 tests", "54 passed", "4 failed", "asAt", "Back to today"]) expect(body, text).toContain(text);
      expect(body).toMatch(/one (?:run|feature|time)/i);
      const cited = rowCitationsOf(body);
      for (const slice of ["07-look 7.1 to 7.8", "07-look 7.9 to 7.14", "07-look 7.15 to 7.19", "07-look 7.20 to 7.22", "07-look 7.27", "07-look 7.23 to 7.29"]) {
        expect(
          cited.some((name) => name.startsWith(slice)),
          slice,
        ).toBe(true);
      }
    });
  });

  describe("the log", () => {
    it("holds no row dated after today", () => {
      const today = localToday();
      expect(logRows().filter((row) => row.date > today).map((row) => `${row.date} ${row.spec}`)).toEqual([]);
    });

    it("dates the five rows of the 07 repair on the day the work was done, 2026-11-22", () => {
      const repair = logRows().filter((row) => row.spec.startsWith("07 repair"));
      expect(repair).toHaveLength(5);
      expect(repair.map((row) => row.date)).toEqual(["2026-11-22", "2026-11-22", "2026-11-22", "2026-11-22", "2026-11-22"]);
    });

    it("leaves the rows written after midnight on 23 November with their date", () => {
      const rows = logRows();
      for (const start of ["07-look 7.27, the Review Desk", "07-look 7.23 to 7.29"]) {
        const row = rows.find((r) => r.spec.startsWith(start));
        expect(row?.date, start).toBe("2026-11-23");
      }
    });

    it("has a row, dated 2026-11-23, for the spec against short prompt run, with its numbers", () => {
      const lines = doc("docs/kiro-log.md").split("\n");
      const line = lines.find((l) => /^\| 2026-11-23 \| [^|]+\| 02-paper-and-map 2\.27 to 2\.30 against a short prompt/.test(l)) ?? "";
      expect(line).not.toBe("");
      for (const text of ["22 minutes", "23 minutes", "58 tests", "54 passed", "4 failed", "asAt", "never merged"]) expect(line, text).toContain(text);
    });
  });

  describe("the other pages", () => {
    it("the README links the write-up under Technological Implementation", () => {
      const readme = doc("README.md");
      const start = readme.indexOf("### Technological Implementation");
      expect(start).toBeGreaterThan(-1);
      const rest = readme.slice(start + 1);
      const end = rest.search(/\n### /);
      const block = end === -1 ? rest : rest.slice(0, end);
      expect(linksOf(block)).toContain("docs/write-up.md");
    });

    it("verification.md tells what was read on the live host and keeps what was not observed", () => {
      const text = doc("docs/verification.md");
      expect(text.split("\n").some((line) => line.startsWith("- **No live host"))).toBe(false);
      for (const word of ["plotwarden.pages.dev", "308", "fc0087dc2b2e0583", "Cache-Control", "default-src 'self'", "404"]) expect(text, word).toContain(word);
      expect(text).toMatch(/Not observed[^\n]*other browsers[^\n]*real phones/);
    });

    it("the judge guide gives the live address", () => {
      const text = doc("docs/judge-guide.md");
      expect(text).toContain("The live address is https://plotwarden.pages.dev.");
      expect(text).not.toContain("set by the person who publishes the site");
    });

    it("the testing row of kiro-evidence.md says how the expected totals were made", () => {
      const row = doc("docs/kiro-evidence.md").split("\n").find((line) => line.startsWith("| `testing.md` |")) ?? "";
      expect(row).toContain("worked out line by line before any code, not read from the code");
      expect(row).not.toContain("worked by hand");
    });
  });
});

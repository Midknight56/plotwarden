// The two self hosted fonts (spec 07, task 7.3, L2): Atkinson Hyperlegible Next for text and Gelasio for the
// churchyard, start page and Desk headings. Both are under the SIL Open Font License 1.1. Only woff2 files, from the
// same origin, each with font-display swap. Together under 150,000 bytes. The visitor files keep system fonts only.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeFonts, shellOf } from "../../scripts/lib/site.mjs";
import { buildVisitorFiles } from "../../tools/site/visitorFiles";

const ROOT = join(__dirname, "..", "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

const ATKINSON = { css: "fonts/atkinson.css", family: "Atkinson Hyperlegible Next", slug: "atkinson-hyperlegible-next", weights: [400, 600, 700], pkg: "@fontsource/atkinson-hyperlegible-next" };
const GELASIO = { css: "fonts/gelasio.css", family: "Gelasio", slug: "gelasio", weights: [600, 700], pkg: "@fontsource/gelasio" };
const FAMILIES = [ATKINSON, GELASIO] as const;
const SUBSETS = ["latin", "latin-ext"] as const;

const expectedFiles = (f: (typeof FAMILIES)[number]): string[] => f.weights.flatMap((w) => SUBSETS.map((s) => `${f.slug}-${s}-${w}-normal.woff2`));
const ALL_FILES = FAMILIES.flatMap(expectedFiles);

interface Face {
  family: string;
  weight: number;
  display: string;
  src: string;
  range: string;
}

function facesOf(css: string): Face[] {
  const faces: Face[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1] as string;
    const get = (prop: string): string => new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? "";
    faces.push({ family: get("font-family").replace(/["']/g, ""), weight: Number(get("font-weight")), display: get("font-display"), src: get("src"), range: get("unicode-range") });
  }
  return faces;
}

/** The code points that a `unicode-range` value covers, as [from, to] pairs. */
function rangesOf(value: string): Array<[number, number]> {
  return value.split(",").map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
    const lo = parseInt(from as string, 16);
    return [lo, to === undefined ? lo : parseInt(to, 16)];
  });
}
const covers = (ranges: Array<[number, number]>, cp: number): boolean => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

describe("the font files", () => {
  it("has one woff2 file for each family, weight and subset, and no other file", () => {
    const here = readdirSync(join(ROOT, "fonts")).filter((f) => f.endsWith(".woff2")).sort();
    expect(here).toEqual([...ALL_FILES].sort());
  });

  it("holds real woff2 files (the file starts with wOF2)", () => {
    for (const file of ALL_FILES) expect(readFileSync(join(ROOT, "fonts", file)).subarray(0, 4).toString("latin1"), file).toBe("wOF2");
  });

  it("is under 150,000 bytes together, counting each file once", () => {
    const total = ALL_FILES.reduce((sum, f) => sum + statSync(join(ROOT, "fonts", f)).size, 0);
    expect(total).toBeGreaterThan(50_000);
    expect(total).toBeLessThan(150_000);
  });
});

describe.each(FAMILIES)("$family: the @font-face rules", (family) => {
  const css = (): string => read(family.css);

  it("has one rule for each weight and subset, with swap and a woff2 file of the same folder", () => {
    const faces = facesOf(css());
    expect(faces).toHaveLength(family.weights.length * SUBSETS.length);
    for (const face of faces) {
      expect(face.family).toBe(family.family);
      expect(family.weights).toContain(face.weight);
      expect(face.display).toBe("swap");
      expect(face.src).toMatch(/^url\("\.\/[a-z0-9-]+\.woff2"\) format\("woff2"\)$/);
      const file = /url\("\.\/([^"]+)"\)/.exec(face.src)?.[1] as string;
      expect(ALL_FILES).toContain(file);
    }
    const used = faces.map((f) => /url\("\.\/([^"]+)"\)/.exec(f.src)?.[1]).sort();
    expect(used).toEqual(expectedFiles(family).sort());
  });

  it("declares a range that covers Basic Latin, Latin 1, Latin Extended A and the punctuation of the copy", () => {
    const ranges = facesOf(css()).flatMap((f) => rangesOf(f.range));
    const missing: string[] = [];
    for (let cp = 0x20; cp <= 0x7e; cp++) if (!covers(ranges, cp)) missing.push(`U+${cp.toString(16)}`);
    for (let cp = 0xa0; cp <= 0xff; cp++) if (!covers(ranges, cp)) missing.push(`U+${cp.toString(16)}`);
    for (let cp = 0x100; cp <= 0x17f; cp++) if (!covers(ranges, cp)) missing.push(`U+${cp.toString(16)}`);
    for (const ch of ["·", "’", "“", "”", "…"]) if (!covers(ranges, ch.codePointAt(0) as number)) missing.push(ch);
    expect(missing).toEqual([]);
  });

  it("names no other host and loads no other kind of file", () => {
    expect(css()).not.toMatch(/https?:|\/\/[a-z]/i);
    expect(css()).not.toMatch(/\.(woff|ttf|otf|eot)\b(?!2)/i);
    expect(css()).not.toMatch(/local\(/);
  });
});

describe("where the fonts are used", () => {
  const REGISTER = read("template/src/ui/register.css");
  const CHURCH = read("apps/churchyard-register/src/theme.css");
  const GARDEN = read("apps/allotment-register/src/theme.css");
  const SITE = read("site/src/site.css");

  it("loads Atkinson with the shared screens and Gelasio with the churchyard theme and the start page", () => {
    expect(REGISTER).toContain('@import "../../../fonts/atkinson.css";');
    expect(CHURCH).toContain('@import "../../../fonts/gelasio.css";');
    expect(SITE).toContain('@import "../../fonts/atkinson.css";');
    expect(SITE).toContain('@import "../../fonts/gelasio.css";');
  });

  it("does not load Gelasio for the allotment, which uses the text font for its headings", () => {
    expect(GARDEN).not.toContain("gelasio");
    expect(GARDEN).not.toContain("Gelasio");
    expect(REGISTER).not.toContain("gelasio");
  });

  it("sets the text stack with the system fonts behind it, and the churchyard heading stack with Georgia behind Gelasio", () => {
    expect(REGISTER).toMatch(/--font-text:\s*"Atkinson Hyperlegible Next",\s*system-ui,\s*"Segoe UI",\s*Roboto,\s*"Helvetica Neue",\s*Arial,\s*sans-serif;/);
    expect(REGISTER).toMatch(/--font-heading:\s*var\(--font-text\);/);
    expect(CHURCH).toMatch(/--font-heading:\s*"Gelasio",\s*Georgia,\s*"Times New Roman",\s*serif;/);
    expect(SITE).toMatch(/--font-heading:\s*"Gelasio",\s*Georgia,\s*"Times New Roman",\s*serif;/);
    expect(SITE).toMatch(/--font-text:\s*"Atkinson Hyperlegible Next",\s*system-ui,/);
  });

  it("uses the stacks for the page, the headings and the brand", () => {
    expect(REGISTER).toMatch(/html\s*\{[^}]*font-family:\s*var\(--font-text\)/);
    expect(REGISTER).toMatch(/h1,\s*h2,\s*h3,\s*header\.app \.brand\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    expect(SITE).toMatch(/html\s*\{[^}]*font-family:\s*var\(--font-text\)/);
    expect(SITE).toMatch(/h1,\s*h2,\s*h3,\s*\.brand\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
  });
});

describe("no stylesheet of the repository names a font host", () => {
  function cssFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git", ".local", "test-results", "playwright-report", "coverage", ".vitest"].includes(name.name)) continue;
      const path = join(dir, name.name);
      if (name.isDirectory()) cssFiles(path, out);
      else if (name.name.endsWith(".css")) out.push(path);
    }
    return out;
  }

  it("has no remote url, import or font link in any .css file", () => {
    const files = cssFiles(ROOT);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const css = readFileSync(file, "utf8");
      expect(css, file).not.toMatch(/fonts\.googleapis|fonts\.gstatic|typekit|use\.fontawesome/i);
      expect(css, file).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
      expect(css, file).not.toMatch(/@import\s+(url\()?\s*["']?(https?:)?\/\//i);
    }
  });

  it("has no font link in any page of the sites and apps", () => {
    for (const page of ["site/index.html", "site/visitor/family/index.html", "site/visitor/seeker/index.html", "apps/churchyard-register/index.html", "apps/allotment-register/index.html", "examples/market/index.html"]) {
      const html = read(page);
      expect(html, page).not.toMatch(/<link[^>]+(fonts\.|rel="preload"[^>]+font|as="font")/i);
    }
  });
});

describe("visitor files keep system fonts only", () => {
  const files = buildVisitorFiles();
  it.each([["family", files.family.html], ["seeker", files.seeker.html]] as const)("the %s file has no @font-face, no url and no font file", (_kind, html) => {
    expect(html).not.toMatch(/@font-face/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/woff2?|\.ttf|\.otf/i);
    expect(html).not.toMatch(/Atkinson|Gelasio/);
  });
  it("sets only system stacks in the file", () => {
    for (const html of [files.family.html, files.seeker.html]) {
      for (const m of html.matchAll(/font-family\s*:\s*([^;}"]+)/g)) expect(m[1]).toMatch(/system-ui|Georgia|serif|sans-serif|inherit|monospace/);
    }
  });
  it("the sources of the visitor and committee output name no font face", () => {
    for (const dir of ["template/src/output", "template/src/exchange"]) {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (!/\.tsx?$/.test(name)) continue;
        const text = readFileSync(join(ROOT, dir, name), "utf8");
        expect(text, `${dir}/${name}`).not.toMatch(/@font-face|Atkinson|Gelasio/);
      }
    }
  });
});

describe("the offline list", () => {
  it("names every font file that is in a built site, wherever the build put it", () => {
    const site = mkdtempSync(join(tmpdir(), "plotwarden-fonts-"));
    for (const dir of ["assets", "churchyard/assets", "allotments/assets"]) mkdirSync(join(site, dir), { recursive: true });
    writeFileSync(join(site, "index.html"), "<!doctype html>");
    writeFileSync(join(site, "sw.js"), "// worker");
    writeFileSync(join(site, "_headers"), "/\n");
    const placed: string[] = [];
    for (const [i, file] of ALL_FILES.entries()) {
      const dir = ["assets", "churchyard/assets", "allotments/assets"][i % 3] as string;
      writeFileSync(join(site, dir, file), readFileSync(join(ROOT, "fonts", file)));
      placed.push(`/${dir}/${file}`);
    }
    const shell = shellOf(site) as { version: string; files: string[] };
    for (const path of placed) expect(shell.files, path).toContain(path);
    expect(shell.files).not.toContain("/sw.js");
  });
});

// One copy of each font file on the whole site (spec 07, task 7.9 and design L-D3). Each build of the hub, the
// Churchyard Register and the Allotment Register carries its own copy of the files that its styles name, with the same
// hashed name and the same bytes. Assembling the site keeps the copy in the hub's `assets/`, removes the others and points
// each app's styles at that copy. The Desk preview at `review/` is copied as it is and is never touched.
describe("one copy of each font file on the built site", () => {
  const APP_FOLDERS = ["churchyard", "allotments"] as const;
  const GELASIO_FIRST = expectedFiles(GELASIO)[0] as string;
  const fontBytes = (file: string): Buffer => readFileSync(join(ROOT, "fonts", file));
  const fontCss = (files: readonly string[]): string => files.map((f) => `@font-face{font-family:"x";src:url(./${f}) format("woff2")}`).join("");

  /** A site as the three builds leave it: the hub holds all ten files, the churchyard ten, the allotments the six of Atkinson. */
  function site(options: { churchyard?: string[]; allotments?: string[]; changeOne?: boolean } = {}): string {
    const dir = mkdtempSync(join(tmpdir(), "plotwarden-onecopy-"));
    const put = (rel: string, data: string | Buffer): void => {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), data);
    };
    const atkinson = expectedFiles(ATKINSON);
    const churchyard = options.churchyard ?? ALL_FILES;
    const allotments = options.allotments ?? atkinson;
    put("index.html", "<!doctype html>");
    put("sw.js", "// worker");
    put("assets/main-HUB.css", fontCss(ALL_FILES));
    for (const f of ALL_FILES) put(`assets/${f}`, fontBytes(f));
    put("churchyard/index.html", "<!doctype html>");
    put("churchyard/assets/index-CHURCH.css", `${fontCss(churchyard)}.a{color:red}`);
    for (const f of churchyard) put(`churchyard/assets/${f}`, options.changeOne === true && f === churchyard[0] ? Buffer.from("different bytes") : fontBytes(f));
    put("allotments/index.html", "<!doctype html>");
    put("allotments/assets/index-GARDEN.css", fontCss(allotments));
    for (const f of allotments) put(`allotments/assets/${f}`, fontBytes(f));
    // The Desk preview is a pinned copy. It holds a file of its own that must stay.
    put("review/assets/desk.woff2", Buffer.from("wOF2 desk"));
    return dir;
  }

  const fontsIn = (dir: string, skip = "review/"): string[] => listAll(dir).filter((f) => f.endsWith(".woff2") && !f.startsWith(skip));
  function listAll(dir: string, rel = ""): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) out.push(...listAll(dir, next));
      else out.push(next);
    }
    return out.sort();
  }

  it("holds each of the ten font files once, all in the assets folder of the hub, under 150,000 bytes together", () => {
    const dir = site();
    expect(fontsIn(dir).length).toBe(26);
    const result = dedupeFonts(dir, APP_FOLDERS);
    expect(result.removed.length).toBe(16);
    expect(fontsIn(dir)).toEqual(ALL_FILES.map((f) => `assets/${f}`).sort());
    const total = fontsIn(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
    expect(total).toBeGreaterThan(50_000);
    expect(total).toBeLessThan(150_000);
  });

  it("points the styles of each app at the shared copy, so every font url still reaches a file with the same bytes", () => {
    const dir = site();
    dedupeFonts(dir, APP_FOLDERS);
    for (const css of ["churchyard/assets/index-CHURCH.css", "allotments/assets/index-GARDEN.css", "assets/main-HUB.css"]) {
      const text = readFileSync(join(dir, css), "utf8");
      const urls = [...text.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1] as string);
      expect(urls.length, css).toBeGreaterThan(0);
      for (const url of urls) {
        const target = join(dir, css, "..", url);
        expect(readFileSync(target), `${css} ${url}`).toEqual(fontBytes(url.split("/").pop() as string));
      }
    }
    expect(readFileSync(join(dir, "churchyard/assets/index-CHURCH.css"), "utf8")).toContain(`url(../../assets/${ALL_FILES[0]})`);
    expect(readFileSync(join(dir, "churchyard/assets/index-CHURCH.css"), "utf8")).toContain(".a{color:red}");
    expect(readFileSync(join(dir, "assets/main-HUB.css"), "utf8")).toContain(`url(./${ALL_FILES[0]})`);
  });

  it("names each font file once in the offline list", () => {
    const dir = site();
    dedupeFonts(dir, APP_FOLDERS);
    const shell = shellOf(dir) as { files: string[] };
    const listed = shell.files.filter((f) => f.endsWith(".woff2") && !f.startsWith("/review/"));
    expect(listed).toEqual(ALL_FILES.map((f) => `/assets/${f}`).sort());
  });

  it("moves a file that only an app holds to the shared folder, so it is still held once", () => {
    const dir = site({ churchyard: [...ALL_FILES] });
    rmSync(join(dir, `assets/${GELASIO_FIRST}`));
    dedupeFonts(dir, APP_FOLDERS);
    expect(fontsIn(dir)).toEqual(ALL_FILES.map((f) => `assets/${f}`).sort());
  });

  it("leaves the Desk preview as it is", () => {
    const dir = site();
    dedupeFonts(dir, APP_FOLDERS);
    expect(readFileSync(join(dir, "review/assets/desk.woff2"), "utf8")).toBe("wOF2 desk");
  });

  it("refuses two different files with one name, and removes nothing", () => {
    const dir = site({ changeOne: true });
    const before = listAll(dir);
    expect(() => dedupeFonts(dir, APP_FOLDERS)).toThrow(/same name|different/i);
    expect(listAll(dir)).toEqual(before);
  });

  it("gives the same site when it runs a second time", () => {
    const dir = site();
    dedupeFonts(dir, APP_FOLDERS);
    const once = listAll(dir).map((f) => [f, readFileSync(join(dir, f)).toString("latin1")]);
    const second = dedupeFonts(dir, APP_FOLDERS);
    expect(second.removed).toEqual([]);
    expect(listAll(dir).map((f) => [f, readFileSync(join(dir, f)).toString("latin1")])).toEqual(once);
  });

  it("does nothing to an app folder that is not there", () => {
    const dir = site();
    rmSync(join(dir, "allotments"), { recursive: true });
    expect(() => dedupeFonts(dir, APP_FOLDERS)).not.toThrow();
  });
});

describe("the notices", () => {
  const notices = read("THIRD_PARTY_NOTICES.md");
  const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version: string; license?: string; dev?: boolean }> };
  const manifest = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> };

  it.each(FAMILIES)("pins $pkg to 5.3.0 and lists it with its licence", (family) => {
    expect(manifest.devDependencies[family.pkg]).toBe("5.3.0");
    expect(lock.packages[`node_modules/${family.pkg}`]?.version).toBe("5.3.0");
    expect(notices).toMatch(new RegExp(`\\|\\s*${family.pkg.replace("/", "\\/")}\\s*\\|\\s*5\\.3\\.0\\s*\\|\\s*OFL-1\\.1\\s*\\|`));
  });

  it("holds the text of the SIL Open Font License 1.1 and each copyright line", () => {
    expect(notices).toContain("SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007");
    expect(notices).toContain("PERMISSION & CONDITIONS");
    expect(notices).toContain("Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors (https://github.com/googlefonts/atkinson-hyperlegible-next)");
    expect(notices).toContain("Copyright 2022 The Gelasio Project Authors (https://github.com/SorkinType/Gelasio)");
  });

  it("says that the fonts are copied into fonts/ and which files", () => {
    expect(notices).toContain("`fonts/`");
  });

  it("puts the same text in a file that the built site serves", () => {
    const text = read("site/public/font-licences.txt");
    expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007");
    expect(text).toContain("The Atkinson Hyperlegible Next Project Authors");
    expect(text).toContain("The Gelasio Project Authors");
    expect(text, "the release check refuses an address outside the site").not.toMatch(/https?:/);
  });
});

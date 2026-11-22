// The two host styles of the preview server (spec 06, task 6.27, requirements Z4.8 and Z16.6).
// The plain style serves each file at its own address. The pretty style answers as the live host does on
// https://plotwarden.pages.dev (seen on 22 Nov 2026): `x/index.html` goes to `x/` and `name.html` goes to `name`
// with a 308, and the clean address answers 200 with the file. The answer is built by a plain function, so this
// test starts no server. It runs on a small tree under `.local/`, and removes only that folder.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseHeaders } from "../../scripts/lib/headers.mjs";
import { answerPreview, hostStyleOf } from "../../tools/site/siteServer";
import type { HostStyle } from "../../tools/site/siteServer";

const ROOT = join(process.cwd(), ".local", `host-style-test-${process.pid}`);
const SITE_DIR = join(ROOT, "site");

const FAMILY = "/visitor/family/family-map-2026-04-20";

const FILES: Record<string, string> = {
  "index.html": "hub page",
  "404.html": "not found page",
  "churchyard/index.html": "churchyard page",
  "churchyard/assets/app.js": "console.length;",
  "visitor/family/index.html": "family landing",
  "visitor/family/family-map-2026-04-20.html": "family file",
  "sw.js": "worker",
  "_headers": "never served",
};

const HEADERS = [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "/visitor/family/family-map-*",
  "  Content-Security-Policy: default-src 'none'",
  "/404.html",
  "  Content-Security-Policy: default-src 'self'",
  "",
].join("\n");

const rules = parseHeaders(HEADERS);

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const [file, body] of Object.entries(FILES)) {
    const target = join(SITE_DIR, ...file.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, body, "utf8");
  }
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const ask = (style: HostStyle, path: string, method = "GET") => answerPreview({ siteDir: SITE_DIR, rules, style, method, url: new URL(path, "http://127.0.0.1") });
const header = (answer: { headers: [string, string][] }, name: string): string | undefined => answer.headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
const bodyOf = (answer: { body: Buffer | string }): string => answer.body.toString();

describe("T31 the host style is read from one word", () => {
  it.each([
    [undefined, "plain"],
    ["", "plain"],
    ["plain", "plain"],
    ["pretty", "pretty"],
  ] as const)("reads %j as %s", (value, style) => {
    expect(hostStyleOf(value)).toBe(style);
  });

  it.each(["Pretty", "PRETTY", " pretty", "pretty ", "clean", "1", "true"])("refuses %j and names it", (value) => {
    expect(() => hostStyleOf(value)).toThrow(JSON.stringify(value));
  });
});

describe("T31 the pretty style answers as the live host does", () => {
  it.each([
    ["/index.html", "/"],
    ["/churchyard/index.html", "/churchyard/"],
    ["/visitor/family/index.html", "/visitor/family/"],
    ["/404.html", "/404"],
    [`${FAMILY}.html`, FAMILY],
  ])("sends %s to %s with a 308", (path, to) => {
    const answer = ask("pretty", path);
    expect(answer.status).toBe(308);
    expect(header(answer, "location")).toBe(to);
    expect(bodyOf(answer)).toBe("");
  });

  it("keeps the query on a redirect", () => {
    expect(header(ask("pretty", "/churchyard/index.html?a=1"), "location")).toBe("/churchyard/?a=1");
    expect(header(ask("pretty", `${FAMILY}.html?q=Quillmoss`), "location")).toBe(`${FAMILY}?q=Quillmoss`);
  });

  it("answers the clean address with 200 and the file, with the headers of the address that was asked", () => {
    const answer = ask("pretty", FAMILY);
    expect(answer.status).toBe(200);
    expect(bodyOf(answer)).toBe("family file");
    expect(header(answer, "content-type")).toBe("text/html; charset=utf-8");
    expect(header(answer, "content-security-policy")).toBe("default-src 'none'");
    expect(header(answer, "x-content-type-options")).toBe("nosniff");
    const notFoundPage = ask("pretty", "/404");
    expect(notFoundPage.status).toBe(200);
    expect(bodyOf(notFoundPage)).toBe("not found page");
    expect(header(notFoundPage, "content-type")).toBe("text/html; charset=utf-8");
  });

  it("serves the folders as the plain style does", () => {
    for (const [path, body] of [
      ["/", "hub page"],
      ["/churchyard/", "churchyard page"],
      ["/visitor/family/", "family landing"],
    ] as const) {
      const answer = ask("pretty", path);
      expect(answer.status, path).toBe(200);
      expect(bodyOf(answer), path).toBe(body);
    }
    const folder = ask("pretty", "/churchyard");
    expect(folder.status).toBe(308);
    expect(header(folder, "location")).toBe("/churchyard/");
  });

  it("does not answer an address that is not the clean address of a page file", () => {
    for (const path of ["/churchyard/index", "/index", "/nowhere", "/nowhere.html", `${FAMILY}.htm`, "/churchyard/assets/app", "/sw", "/_headers.html", "/visitor/family/family-map-2099-01-01"]) {
      const answer = ask("pretty", path);
      expect(answer.status, path).toBe(404);
      expect(bodyOf(answer), path).toBe("not found page");
    }
  });

  it("answers a HEAD as it answers a GET", () => {
    expect(ask("pretty", `${FAMILY}.html`, "HEAD").status).toBe(308);
    expect(ask("pretty", FAMILY, "HEAD").status).toBe(200);
  });

  it("refuses a write", () => {
    expect(ask("pretty", FAMILY, "POST").status).toBe(404);
    expect(ask("pretty", `${FAMILY}.html`, "POST").status).toBe(404);
  });
});

describe("T31 the plain style stays as it was", () => {
  it("serves each file at its own address and does not know the clean address", () => {
    for (const [path, body] of [
      ["/index.html", "hub page"],
      ["/churchyard/index.html", "churchyard page"],
      ["/404.html", "not found page"],
      [`${FAMILY}.html`, "family file"],
    ] as const) {
      const answer = ask("plain", path);
      expect(answer.status, path).toBe(200);
      expect(bodyOf(answer), path).toBe(body);
    }
    expect(ask("plain", FAMILY).status).toBe(404);
    expect(ask("plain", "/404").status).toBe(404);
  });
});

describe("T31 both styles are the same for everything else", () => {
  it.each(["/", "/churchyard/", "/churchyard", "/churchyard/assets/app.js", "/visitor/family/", "/visitor/family", "/sw.js", "/_headers", "/nowhere", "/../secret", "/a%00b", "/%2e%2e/secret", "/churchyard/?x=1"])(
    "answers %s the same",
    (path) => {
      const plain = ask("plain", path);
      const pretty = ask("pretty", path);
      expect(pretty.status).toBe(plain.status);
      // The headers of an answer that is not the 404 page are the same. The 404 page is matched on the request path in the pretty
      // style, as on the live host, so its headers are told apart in the next test.
      if (plain.status !== 404) expect(pretty.headers).toEqual(plain.headers);
      expect(bodyOf(pretty)).toBe(bodyOf(plain));
    },
  );

  it("never serves the headers file as a page, and answers it with the 404 page and the status 404", () => {
    for (const style of ["plain", "pretty"] as const) {
      const hidden = ask(style, "/_headers");
      expect(hidden.status).toBe(404);
      expect(bodyOf(hidden)).toBe("not found page");
    }
  });
});

describe("T31 the 404 page gets the headers of the address that was asked, in the pretty style", () => {
  // The live host matches each rule on the address that was asked (curl, 22 Nov 2026), so the `/404.html` rule never reaches an unknown address.
  it("gives an unknown address only the rules that match that address", () => {
    for (const path of ["/nowhere", "/no-such-page", "/_headers", "/churchyard/index"]) {
      const answer = ask("pretty", path);
      expect(answer.status, path).toBe(404);
      expect(bodyOf(answer), path).toBe("not found page");
      expect(header(answer, "content-security-policy"), path).toBeUndefined();
      expect(header(answer, "x-content-type-options"), path).toBe("nosniff");
    }
  });

  it("gives an unknown address under a rule that ends in a star the policy of that rule", () => {
    const answer = ask("pretty", "/visitor/family/family-map-nope");
    expect(answer.status).toBe(404);
    expect(header(answer, "content-security-policy")).toBe("default-src 'none'");
  });

  it("keeps the headers of /404.html for the 404 page in the plain style", () => {
    for (const path of ["/nowhere", "/_headers", "/404"]) {
      const answer = ask("plain", path);
      expect(answer.status, path).toBe(404);
      expect(header(answer, "content-security-policy"), path).toBe("default-src 'self'");
      expect(header(answer, "x-content-type-options"), path).toBe("nosniff");
    }
  });
});

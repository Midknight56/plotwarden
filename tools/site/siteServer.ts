// The servers of the whole site, as a Vite plugin. Dev and preview bind 127.0.0.1 with a strict port (see the
// root vite.config.ts). Nothing here reaches the network.
//
// Dev (`npm run dev`, port 4173). The site has one address space and the source has another, so the plugin maps
// one onto the other: `/` is the hub, `/churchyard/` and `/allotments/` are the two apps, `/visitor/...` are the
// sample pages. The Review Desk preview is a separate build from a separate checkout, so `/review/` is not served
// in dev. Use `npm run preview` for the whole site.
//
// Preview (`npm run preview`, port 4174). Serves `dist/site` the way the static host does: a folder with no
// slash goes to the folder, a folder is served by its index.html, an unknown path is the 404 page with status
// 404, and each path gets the headers that `_headers` gives it (rules joined as the host joins them).
// It starts only when `dist/site` has been assembled.
//
// Pretty preview (`npm run preview:pretty`, port 4182, `PLOTWARDEN_HOST_STYLE=pretty`). The same, and also as the
// live host (https://plotwarden.pages.dev) answers a page: `x/index.html` goes to `x/` and `name.html` goes to
// `name` with a 308, and the clean address answers 200 with the file.
import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import type { Plugin } from "vite";
import { headersFor, parseHeaders } from "../../scripts/lib/headers.mjs";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

type Next = (error?: unknown) => void;
type Rules = ReturnType<typeof parseHeaders>;

/** How the preview answers. `plain` serves each file at its own address. `pretty` answers as the live host does. */
export type HostStyle = "plain" | "pretty";

/** One answer of the preview, before it is written to a socket. */
export interface Answer {
  status: number;
  headers: [string, string][];
  body: Buffer | string;
}

/** Read `PLOTWARDEN_HOST_STYLE`. Unset or empty is plain. Any word that is not one of the two stops the server. */
export function hostStyleOf(value: string | undefined): HostStyle {
  if (value === undefined || value === "" || value === "plain") return "plain";
  if (value === "pretty") return "pretty";
  throw new Error(`PLOTWARDEN_HOST_STYLE is ${JSON.stringify(value)}. Use "plain" or "pretty".`);
}

function send(req: IncomingMessage, res: ServerResponse, status: number, headers: [string, string][], body: Buffer | string): void {
  res.statusCode = status;
  for (const [name, value] of headers) res.setHeader(name, value);
  res.end(req.method === "HEAD" ? undefined : body);
}

/** The answer of the preview to one request. Reads files, writes nothing, and opens no socket. */
export function answerPreview(options: { siteDir: string; rules: Rules; style: HostStyle; method: string; url: URL }): Answer {
  const { siteDir, rules, url } = options;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = "/\0";
  }
  const headersOf = (p: string): [string, string][] => headersFor(p, rules);
  const answer = (status: number, headers: [string, string][], body: Buffer | string): Answer => ({ status, headers, body });
  const notFound = (): Answer => {
    const page = join(siteDir, "404.html");
    return answer(404, [["Content-Type", TYPES[".html"] as string], ...headersOf("/404.html")], existsSync(page) ? readFileSync(page) : "Page not found");
  };
  if (path.includes("\0") || path.split("/").includes("..") || options.method !== "GET" && options.method !== "HEAD") return notFound();

  const target = normalize(join(siteDir, ...path.split("/").filter(Boolean)));
  if (target !== siteDir && !target.startsWith(siteDir + sep)) return notFound();
  const exists = existsSync(target);
  if (options.style === "pretty") {
    // The live host sends the file address of a page to its clean address, and answers 200 at the clean address.
    // The headers of the clean address are those that `_headers` gives the address that was asked.
    if (exists && statSync(target).isFile() && path.endsWith(".html")) {
      const clean = path.endsWith("/index.html") ? path.slice(0, -"index.html".length) : path.slice(0, -".html".length);
      return answer(308, [["Location", `${clean}${url.search}`]], "");
    }
    const page = `${target}.html`;
    if (!exists && !path.endsWith("/") && !path.endsWith("/index") && existsSync(page) && statSync(page).isFile()) {
      return answer(200, [["Content-Type", TYPES[".html"] as string], ...headersOf(path)], readFileSync(page));
    }
  }
  if (exists && statSync(target).isDirectory()) {
    if (!path.endsWith("/")) return answer(308, [["Location", `${path}/${url.search}`]], "");
    const index = join(target, "index.html");
    if (!existsSync(index)) return notFound();
    return answer(200, [["Content-Type", TYPES[".html"] as string], ...headersOf(path)], readFileSync(index));
  }
  // The headers file is for the host. It is never served as a page.
  if (!exists || path === "/_headers") return notFound();
  return answer(200, [["Content-Type", TYPES[extname(target)] ?? "application/octet-stream"], ...headersOf(path)], readFileSync(target));
}

export function siteServer(options: { repo: string }): Plugin {
  const siteDir = join(options.repo, "dist", "site");
  const devMap: [RegExp, string][] = [
    [/^\/churchyard(?=\/|$)/, "/apps/churchyard-register"],
    [/^\/allotments(?=\/|$)/, "/apps/allotment-register"],
    [/^\/visitor(?=\/|$)/, "/site/visitor"],
    [/^\/src(?=\/)/, "/site/src"],
  ];

  return {
    name: "plotwarden-site-server",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const path = url.pathname;
        if (path === "/review" || path.startsWith("/review/")) return send(req, res, 404, [["Content-Type", "text/plain; charset=utf-8"]], "The Review Desk preview is built in its own repository. Use npm run preview for the whole site.");
        if (/^\/(churchyard|allotments|visitor\/family|visitor\/seeker)$/.test(path)) return send(req, res, 308, [["Location", `${path}/${url.search}`]], "");
        if (path === "/") req.url = `/site/index.html${url.search}`;
        else {
          for (const [pattern, to] of devMap) {
            if (pattern.test(path)) {
              const rest = path.replace(pattern, to);
              req.url = `${rest.endsWith("/") ? `${rest}index.html` : rest}${url.search}`;
              break;
            }
          }
        }
        next();
      });
    },
    configurePreviewServer(server) {
      if (!existsSync(join(siteDir, "index.html"))) {
        throw new Error("dist/site is not there. Run npm run build:apps, then npm run assemble:site, then npm run preview.");
      }
      const style = hostStyleOf(process.env["PLOTWARDEN_HOST_STYLE"]);
      const headersFile = join(siteDir, "_headers");
      const rules = parseHeaders(existsSync(headersFile) ? readFileSync(headersFile, "utf8") : "");
      server.middlewares.use((req: IncomingMessage, res: ServerResponse) => {
        const answer = answerPreview({ siteDir, rules, style, method: req.method ?? "GET", url: new URL(req.url ?? "/", "http://127.0.0.1") });
        send(req, res, answer.status, answer.headers, answer.body);
      });
    },
  };
}

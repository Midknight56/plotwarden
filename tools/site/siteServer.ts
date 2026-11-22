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

function send(req: IncomingMessage, res: ServerResponse, status: number, headers: [string, string][], body: Buffer | string): void {
  res.statusCode = status;
  for (const [name, value] of headers) res.setHeader(name, value);
  res.end(req.method === "HEAD" ? undefined : body);
}

export function siteServer(options: { repo: string }): Plugin {
  const siteDir = join(options.repo, "dist", "site");

  function preview(req: IncomingMessage, res: ServerResponse, rules: ReturnType<typeof parseHeaders>, url: URL): void {
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = "/\0";
    }
    const headersOf = (p: string): [string, string][] => headersFor(p, rules);
    const notFound = (): void => {
      const page = join(siteDir, "404.html");
      send(req, res, 404, [["Content-Type", TYPES[".html"] as string], ...headersOf("/404.html")], existsSync(page) ? readFileSync(page) : "Page not found");
    };
    if (path.includes("\0") || path.split("/").includes("..") || req.method !== "GET" && req.method !== "HEAD") return notFound();

    const target = normalize(join(siteDir, ...path.split("/").filter(Boolean)));
    if (target !== siteDir && !target.startsWith(siteDir + sep)) return notFound();
    const exists = existsSync(target);
    if (exists && statSync(target).isDirectory()) {
      if (!path.endsWith("/")) return send(req, res, 308, [["Location", `${path}/${url.search}`]], "");
      const index = join(target, "index.html");
      if (!existsSync(index)) return notFound();
      return send(req, res, 200, [["Content-Type", TYPES[".html"] as string], ...headersOf(path)], readFileSync(index));
    }
    // The headers file is for the host. It is never served as a page.
    if (!exists || path === "/_headers") return notFound();
    send(req, res, 200, [["Content-Type", TYPES[extname(target)] ?? "application/octet-stream"], ...headersOf(path)], readFileSync(target));
  }

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
      const headersFile = join(siteDir, "_headers");
      const rules = parseHeaders(existsSync(headersFile) ? readFileSync(headersFile, "utf8") : "");
      server.middlewares.use((req: IncomingMessage, res: ServerResponse) => {
        preview(req, res, rules, new URL(req.url ?? "/", "http://127.0.0.1"));
      });
    },
  };
}

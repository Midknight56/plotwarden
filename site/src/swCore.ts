// The logic of the service worker, apart from the worker itself, so a test can run it with in memory fakes.
// It caches the static shell and nothing else. Pure: no global, no event, no storage of its own.
//
// One version, one cache. A new version installs into a cache of its own name and waits. The old worker keeps
// answering from the old cache until every old page is closed, so the files of two versions never mix.
// After install nothing is ever added to a cache: a record, a backup or a downloaded file has no way in.

export const SHELL_PREFIX = "plotwarden-shell-";

export interface ShellManifest {
  /** 16 hex characters, taken from the bytes of every file in the shell. */
  version: string;
  /** Site paths such as `/churchyard/index.html`. */
  files: string[];
}

export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface RequestLike {
  method: string;
  url: string;
  mode?: string;
  headers: { get(name: string): string | null };
}

export type FetchLike = (request: RequestLike | string, init?: { cache?: "reload" }) => Promise<Response>;

export type Route = { kind: "file"; key: string } | { kind: "redirect"; to: string };

const NOT_SHELL = new Set(["/sw.js", "/_headers"]);

export function cacheNameFor(version: string): string {
  return `${SHELL_PREFIX}${version}`;
}

/** Check a manifest that the build wrote. A bad one is refused whole, so a worker never runs on a guess. */
export function readManifest(value: unknown): ShellManifest {
  if (typeof value !== "object" || value === null) throw new Error("The shell manifest is missing");
  const { version, files } = value as { version?: unknown; files?: unknown };
  if (typeof version !== "string" || !/^[0-9a-f]{16}$/.test(version)) throw new Error("The shell version is not 16 hex characters");
  if (!Array.isArray(files) || files.length === 0) throw new Error("The shell lists no files");
  const seen = new Set<string>();
  for (const file of files) {
    if (typeof file !== "string" || !file.startsWith("/")) throw new Error("A shell file is not a site path");
    if (/[?#\\]/.test(file) || file.split("/").includes("..") || file.includes("//")) throw new Error(`The shell file ${file} is not a plain path`);
    if (NOT_SHELL.has(file)) throw new Error(`The shell must not hold ${file}`);
    if (seen.has(file)) throw new Error(`The shell lists ${file} twice`);
    seen.add(file);
  }
  return { version, files: [...(files as string[])] };
}

/**
 * Which stored file answers a request, if any. Only a plain GET of this origin, with no query and no range,
 * for a path that the manifest lists. A fragment (`#/r/<id>`) is never sent to a host, so it is ignored.
 * Anything else goes to the network, and is never stored.
 */
export function routeFor(request: RequestLike, origin: string, manifest: ShellManifest): Route | undefined {
  if (request.method !== "GET") return undefined;
  if (request.headers.get("range") !== null) return undefined;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return undefined;
  }
  if (url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) return undefined;
  if (url.search !== "") return undefined;
  const files = new Set(manifest.files);
  const path = url.pathname;
  if (path.endsWith("/")) return files.has(`${path}index.html`) ? { kind: "file", key: `${path}index.html` } : undefined;
  if (files.has(path)) return { kind: "file", key: path };
  if (files.has(`${path}/index.html`)) return { kind: "redirect", to: `${path}/` };
  // A host that prettifies addresses sends `name.html` to `name`, so a page may be asked for by that address. The
  // clean address of an index page is its folder, never `x/index`, so a last part of `index` is left alone.
  if (!path.endsWith("/index") && files.has(`${path}.html`)) return { kind: "file", key: `${path}.html` };
  return undefined;
}

/**
 * The address a host that prettifies addresses sends a page file to: `x/` for `x/index.html`, `name` for
 * `name.html`. A file that is not a page has none.
 */
function cleanAddressOf(file: string): string | undefined {
  if (file.endsWith("/index.html")) return file.slice(0, -"index.html".length);
  if (file.endsWith(".html")) return file.slice(0, -".html".length);
  return undefined;
}

/**
 * Is a redirected answer one that the worker may keep? Only when it ends on this origin, with no query, in a 200
 * that is not opaque, at exactly the clean address of the file. Any other redirect is a fault of the build or the host.
 */
function isCleanRedirect(response: Response, file: string, origin: string): boolean {
  const clean = cleanAddressOf(file);
  if (clean === undefined || response.status !== 200 || response.type === "opaque") return false;
  let landed: URL;
  try {
    landed = new URL(response.url);
  } catch {
    return false;
  }
  return landed.origin === origin && landed.search === "" && landed.pathname === clean;
}

/** Fill a cache for one version. All of it or none of it. */
export async function install(caches: CacheStorageLike, fetchFile: FetchLike, manifest: ShellManifest, origin: string): Promise<void> {
  const name = cacheNameFor(manifest.version);
  try {
    const cache = await caches.open(name);
    for (const file of manifest.files) {
      const response = await fetchFile(file, { cache: "reload" });
      if (response.redirected) {
        if (!isCleanRedirect(response, file, origin)) throw new Error(`The shell file ${file} was sent somewhere that is not its own clean address`);
        // A browser never answers a page from a response that is marked as redirected. Keep the same bytes and
        // headers in a copy that is not.
        await cache.put(file, new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers }));
        continue;
      }
      if (response.status !== 200 || response.type === "opaque") throw new Error(`The shell file ${file} did not load as a plain 200`);
      await cache.put(file, response);
    }
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}

/** Remove the caches of every other version. A cache that is not ours is left alone. */
export async function activate(caches: CacheStorageLike, manifest: ShellManifest): Promise<void> {
  const keep = cacheNameFor(manifest.version);
  for (const name of await caches.keys()) {
    if (name.startsWith(SHELL_PREFIX) && name !== keep) await caches.delete(name);
  }
}

/**
 * Answer a request: from this version's cache when it is a file of the shell, from the network when it is not.
 * A page of this site that is not in the shell, asked for while the network is off, gets the stored 404 page
 * with the status 404. Anything the network gives is passed on and never stored.
 */
export async function respond(caches: CacheStorageLike, request: RequestLike, fetchFile: FetchLike, origin: string, manifest: ShellManifest): Promise<Response> {
  const route = routeFor(request, origin, manifest);
  if (route?.kind === "redirect") return new Response(null, { status: 308, headers: { location: route.to } });
  if (route?.kind === "file") {
    const stored = await (await caches.open(cacheNameFor(manifest.version))).match(route.key);
    if (stored !== undefined) return stored;
  }
  try {
    return await fetchFile(request);
  } catch (error) {
    const page = await notFoundFor(caches, request, origin, manifest);
    if (page !== undefined) return page;
    throw error;
  }
}

async function notFoundFor(caches: CacheStorageLike, request: RequestLike, origin: string, manifest: ShellManifest): Promise<Response | undefined> {
  if (request.mode !== "navigate" || request.method !== "GET") return undefined;
  const url = new URL(request.url);
  if (url.origin !== origin || url.search !== "") return undefined;
  const page = await (await caches.open(cacheNameFor(manifest.version))).match("/404.html");
  if (page === undefined) return undefined;
  return new Response(await page.text(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
}

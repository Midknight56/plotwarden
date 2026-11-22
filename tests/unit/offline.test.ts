// T31: the offline cache (spec 06, task 6.18, requirement Z4).
// A keeper loads an app once, goes offline and opens it again from a versioned cache of static files. Two versions
// never mix. The cache holds the static shell only: no record, no backup, no request that carried a value. A visitor
// file opens cold with the network off. The service worker logic runs here with in memory fakes. The real worker
// runs in the browser spec `tests/browser/release.spec.ts`.
import { describe, expect, it } from "vitest";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { familyWords } from "../../apps/churchyard-register/src/copy";
import { buildAvailabilityFile } from "../../apps/allotment-register/src/projection";
import { availabilityWords } from "../../apps/allotment-register/src/copy";
import { SITE_COPY } from "../../site/src/copy";
import { SHELL_PREFIX, activate, cacheNameFor, install, readManifest, respond, routeFor } from "../../site/src/swCore";
import type { CacheLike, CacheStorageLike, FetchLike, RequestLike, ShellManifest } from "../../site/src/swCore";
import { showUpdateNotice, watchForUpdate } from "../../site/src/swRegister";
import type { NoticeDocument, NoticeElement, RegistrationLike } from "../../site/src/swRegister";
import { buildAvailabilityHtml } from "../../template/src/output/availabilityHtml";
import { buildFamilyHtml } from "../../template/src/output/visitorHtml";
import { fixture } from "../../tools/inspector/fixtures";
import type { BuiltFixture } from "../../tools/inspector/fixtures";

const ORIGIN = "https://plotwarden.example";

// ---- fakes ---------------------------------------------------------------------------------------------------

class FakeCache implements CacheLike {
  readonly rows = new Map<string, { body: string; status: number; headers: [string, string][] }>();
  async match(key: string): Promise<Response | undefined> {
    const row = this.rows.get(key);
    return row === undefined ? undefined : new Response(row.body, { status: row.status, headers: row.headers });
  }
  async put(key: string, response: Response): Promise<void> {
    this.rows.set(key, { body: await response.text(), status: response.status, headers: [...response.headers.entries()] });
  }
}

class FakeCaches implements CacheStorageLike {
  readonly stores = new Map<string, FakeCache>();
  async open(name: string): Promise<CacheLike> {
    let store = this.stores.get(name);
    if (store === undefined) {
      store = new FakeCache();
      this.stores.set(name, store);
    }
    return store;
  }
  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

const FILES = ["/index.html", "/404.html", "/churchyard/index.html", "/churchyard/assets/app.js", "/allotments/index.html", "/review/index.html", "/visitor/family/index.html", "/visitor/family/family-map-2026-04-20.html", "/sw-register.js"];

const manifestOf = (version: string, files: readonly string[] = FILES): ShellManifest => ({ version, files: [...files] });

const V1 = manifestOf("0123456789abcdef");
const V2 = manifestOf("fedcba9876543210");

const requestOf = (path: string, init: { method?: string; mode?: string; range?: string; origin?: string } = {}): RequestLike => ({
  method: init.method ?? "GET",
  url: `${init.origin ?? ORIGIN}${path}`,
  mode: init.mode ?? "no-cors",
  headers: { get: (name: string) => (name.toLowerCase() === "range" ? (init.range ?? null) : null) },
});

/** A network that serves the files of one version, as text that names the version and the path. */
function networkOf(version: string, options: { missing?: string[]; offline?: boolean } = {}): { fetchFile: FetchLike; asked: string[] } {
  const asked: string[] = [];
  const fetchFile: FetchLike = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN);
    asked.push(url.pathname + url.search);
    if (options.offline === true) throw new TypeError("Failed to fetch");
    if (options.missing?.includes(url.pathname) === true) return new Response("not here", { status: 404 });
    return new Response(`${version} ${url.pathname}`, { status: 200, headers: { "content-type": "text/plain" } });
  };
  return { fetchFile, asked };
}

const text = async (response: Response): Promise<string> => response.text();

// ---- the cache -----------------------------------------------------------------------------------------------

describe("T31 cache name and manifest", () => {
  it("names the cache after the version, under one prefix", () => {
    expect(SHELL_PREFIX).toBe("plotwarden-shell-");
    expect(cacheNameFor("0123456789abcdef")).toBe("plotwarden-shell-0123456789abcdef");
  });

  it("reads a good manifest", () => {
    expect(readManifest({ version: "0123456789abcdef", files: ["/index.html", "/churchyard/index.html"] })).toEqual({
      version: "0123456789abcdef",
      files: ["/index.html", "/churchyard/index.html"],
    });
  });

  it.each([
    ["nothing", undefined],
    ["a string", "x"],
    ["no version", { files: ["/index.html"] }],
    ["a short version", { version: "abc", files: ["/index.html"] }],
    ["a version with capitals", { version: "0123456789ABCDEF", files: ["/index.html"] }],
    ["no files", { version: "0123456789abcdef", files: [] }],
    ["a file that is not a path", { version: "0123456789abcdef", files: ["index.html"] }],
    ["a file with a query", { version: "0123456789abcdef", files: ["/index.html?x=1"] }],
    ["a file with a dot dot", { version: "0123456789abcdef", files: ["/a/../index.html"] }],
    ["the worker itself", { version: "0123456789abcdef", files: ["/index.html", "/sw.js"] }],
    ["the headers file", { version: "0123456789abcdef", files: ["/index.html", "/_headers"] }],
    ["a repeated file", { version: "0123456789abcdef", files: ["/index.html", "/index.html"] }],
    ["a file that is not text", { version: "0123456789abcdef", files: [1] }],
  ])("refuses a manifest with %s", (_name, value) => {
    expect(() => readManifest(value)).toThrow();
  });
});

describe("T31 which requests the worker answers", () => {
  it("answers a page by its folder and its file", () => {
    expect(routeFor(requestOf("/", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "file", key: "/index.html" });
    expect(routeFor(requestOf("/churchyard/", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "file", key: "/churchyard/index.html" });
    expect(routeFor(requestOf("/churchyard/assets/app.js"), ORIGIN, V1)).toEqual({ kind: "file", key: "/churchyard/assets/app.js" });
    expect(routeFor(requestOf("/visitor/family/family-map-2026-04-20.html", { mode: "navigate" }), ORIGIN, V1)).toEqual({
      kind: "file",
      key: "/visitor/family/family-map-2026-04-20.html",
    });
  });

  it("answers a page by its folder even when the address carries a fragment, which is never sent to a host", () => {
    // Found in the browser: a reload of `/churchyard/#/r/<id>` showed the 404 page offline, because the worker saw the fragment.
    expect(routeFor(requestOf("/churchyard/#/r/0a1b2c", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "file", key: "/churchyard/index.html" });
    expect(routeFor(requestOf("/#/about", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "file", key: "/index.html" });
    expect(routeFor(requestOf("/churchyard#/r/0a1b2c", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "redirect", to: "/churchyard/" });
    // A fragment does not make a request that carried a query into one that did not.
    expect(routeFor(requestOf("/churchyard/?q=1#/r/0a1b2c", { mode: "navigate" }), ORIGIN, V1)).toBeUndefined();
  });

  it("sends a folder without its slash to the folder, as a static host does", () => {
    expect(routeFor(requestOf("/churchyard", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "redirect", to: "/churchyard/" });
    expect(routeFor(requestOf("/review", { mode: "navigate" }), ORIGIN, V1)).toEqual({ kind: "redirect", to: "/review/" });
  });

  it("leaves a request with a query to the network, whatever its path", () => {
    expect(routeFor(requestOf("/churchyard/?name=Quillmoss", { mode: "navigate" }), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/churchyard/assets/app.js?v=2"), ORIGIN, V1)).toBeUndefined();
  });

  it("leaves everything else to the network", () => {
    expect(routeFor(requestOf("/churchyard/", { method: "POST", mode: "navigate" }), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/churchyard/", { method: "PUT" }), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/churchyard/assets/app.js", { range: "bytes=0-10" }), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/index.html", { origin: "https://other.example" }), ORIGIN, V1)).toBeUndefined();
    expect(routeFor({ method: "GET", url: "blob:https://plotwarden.example/6f1c", headers: { get: () => null } }, ORIGIN, V1)).toBeUndefined();
    expect(routeFor({ method: "GET", url: "data:text/html,hello", headers: { get: () => null } }, ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/not-a-file.html"), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/sw.js"), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/churchyard/../sw.js"), ORIGIN, V1)).toBeUndefined();
    expect(routeFor(requestOf("/records/abc"), ORIGIN, V1)).toBeUndefined();
  });
});

describe("T31 install and activate", () => {
  it("puts every file of the shell in a cache named for the version, fetched fresh, and nothing else", async () => {
    const caches = new FakeCaches();
    const net = networkOf("v1");
    await install(caches, net.fetchFile, V1);
    expect([...caches.stores.keys()]).toEqual([cacheNameFor(V1.version)]);
    const store = caches.stores.get(cacheNameFor(V1.version)) as FakeCache;
    expect([...store.rows.keys()].sort()).toEqual([...FILES].sort());
    expect(store.rows.get("/churchyard/assets/app.js")?.body).toBe("v1 /churchyard/assets/app.js");
    expect([...net.asked].sort()).toEqual([...FILES].sort());
  });

  it("asks the network for a fresh copy, so an old copy of the browser's own cache never enters the shell", async () => {
    const seen: (string | undefined)[] = [];
    const fetchFile: FetchLike = async (request, init) => {
      seen.push(init?.cache);
      return new Response(`x ${typeof request === "string" ? request : request.url}`);
    };
    await install(new FakeCaches(), fetchFile, V1);
    expect(seen.length).toBe(FILES.length);
    expect(new Set(seen)).toEqual(new Set(["reload"]));
  });

  it("fails as a whole when one file is missing, and leaves no half made cache and the old cache as it was", async () => {
    const caches = new FakeCaches();
    await install(caches, networkOf("v1").fetchFile, V1);
    const before = JSON.stringify([...(caches.stores.get(cacheNameFor(V1.version)) as FakeCache).rows]);
    await expect(install(caches, networkOf("v2", { missing: ["/allotments/index.html"] }).fetchFile, V2)).rejects.toThrow();
    expect([...caches.stores.keys()]).toEqual([cacheNameFor(V1.version)]);
    expect(JSON.stringify([...(caches.stores.get(cacheNameFor(V1.version)) as FakeCache).rows])).toBe(before);
  });

  it("fails when the network is off at install", async () => {
    const caches = new FakeCaches();
    await expect(install(caches, networkOf("v1", { offline: true }).fetchFile, V1)).rejects.toThrow();
    expect([...caches.stores.keys()]).toEqual([]);
  });

  it("does not store a response that is not a plain success", async () => {
    const caches = new FakeCaches();
    const redirecting: FetchLike = async () => new Response("", { status: 302, headers: { location: "/elsewhere" } });
    await expect(install(caches, redirecting, V1)).rejects.toThrow();
    expect([...caches.stores.keys()]).toEqual([]);
  });

  it("activation removes the caches of other versions and keeps the current one and any cache that is not ours", async () => {
    const caches = new FakeCaches();
    await install(caches, networkOf("v1").fetchFile, V1);
    await install(caches, networkOf("v2").fetchFile, V2);
    await caches.open("someone-elses-cache");
    await activate(caches, V2);
    expect((await caches.keys()).sort()).toEqual([cacheNameFor(V2.version), "someone-elses-cache"].sort());
  });
});

describe("T31 answering a request", () => {
  async function installed(version: ShellManifest = V1, label = "v1"): Promise<FakeCaches> {
    const caches = new FakeCaches();
    await install(caches, networkOf(label).fetchFile, version);
    await activate(caches, version);
    return caches;
  }

  it("opens an app from the cache with the network off, by its folder", async () => {
    const caches = await installed();
    const offline = networkOf("down", { offline: true });
    const response = await respond(caches, requestOf("/churchyard/", { mode: "navigate" }), offline.fetchFile, ORIGIN, V1);
    expect(response.status).toBe(200);
    expect(await text(response)).toBe("v1 /churchyard/index.html");
    expect(offline.asked).toEqual([]);
  });

  it("opens the hub, the Review Desk preview and a visitor file cold, offline", async () => {
    const caches = await installed();
    const offline = networkOf("down", { offline: true });
    for (const [path, file] of [
      ["/", "/index.html"],
      ["/review/", "/review/index.html"],
      ["/visitor/family/family-map-2026-04-20.html", "/visitor/family/family-map-2026-04-20.html"],
    ] as const) {
      const response = await respond(caches, requestOf(path, { mode: "navigate" }), offline.fetchFile, ORIGIN, V1);
      expect(await text(response)).toBe(`v1 ${file}`);
    }
    expect(offline.asked).toEqual([]);
  });

  it("sends a folder without its slash to the folder, with no network", async () => {
    const caches = await installed();
    const response = await respond(caches, requestOf("/allotments", { mode: "navigate" }), networkOf("down", { offline: true }).fetchFile, ORIGIN, V1);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/allotments/");
  });

  it("serves the 404 page, with the status 404, for a page it does not hold while offline", async () => {
    const caches = await installed();
    const response = await respond(caches, requestOf("/nowhere/", { mode: "navigate" }), networkOf("down", { offline: true }).fetchFile, ORIGIN, V1);
    expect(response.status).toBe(404);
    expect(await text(response)).toBe("v1 /404.html");
  });

  it("fails a file it does not hold while offline, as the network would", async () => {
    const caches = await installed();
    await expect(respond(caches, requestOf("/nowhere.js"), networkOf("down", { offline: true }).fetchFile, ORIGIN, V1)).rejects.toThrow();
  });

  it("gives a request with a query to the network and stores nothing from it", async () => {
    const caches = await installed();
    const before = JSON.stringify([...(caches.stores.get(cacheNameFor(V1.version)) as FakeCache).rows]);
    const online = networkOf("live");
    const response = await respond(caches, requestOf("/churchyard/?q=Quillmoss", { mode: "navigate" }), online.fetchFile, ORIGIN, V1);
    expect(await text(response)).toBe("live /churchyard/");
    expect(online.asked).toEqual(["/churchyard/?q=Quillmoss"]);
    expect(JSON.stringify([...(caches.stores.get(cacheNameFor(V1.version)) as FakeCache).rows])).toBe(before);
  });

  it("gives a write to the network and stores nothing from it", async () => {
    const caches = await installed();
    const online = networkOf("live");
    const response = await respond(caches, requestOf("/churchyard/", { method: "POST", mode: "navigate" }), online.fetchFile, ORIGIN, V1);
    expect(await text(response)).toBe("live /churchyard/");
    expect([...(caches.stores.get(cacheNameFor(V1.version)) as FakeCache).rows.keys()].sort()).toEqual([...FILES].sort());
  });

  it("never adds a file to the cache after install, whatever it is asked", async () => {
    const caches = await installed();
    const online = networkOf("live");
    for (const path of ["/records/1", "/backup.zip", "/churchyard/?x=1", "/visitor/family/family-map-2099-01-01.html", "/a", "/b/", "/c.js"]) {
      await respond(caches, requestOf(path, { mode: path.endsWith("/") ? "navigate" : "no-cors" }), online.fetchFile, ORIGIN, V1);
    }
    const keys = await caches.keys();
    expect(keys).toEqual([cacheNameFor(V1.version)]);
    expect([...(caches.stores.get(keys[0] as string) as FakeCache).rows.keys()].sort()).toEqual([...FILES].sort());
  });

  it("never mixes versions: a worker of one version serves only its own files while another version waits", async () => {
    const caches = new FakeCaches();
    await install(caches, networkOf("v1").fetchFile, V1);
    await activate(caches, V1);
    // A new version installs and waits. Its cache is there, and the old worker is still the one that answers.
    await install(caches, networkOf("v2").fetchFile, V2);
    const offline = networkOf("down", { offline: true });
    for (const file of FILES) {
      const response = await respond(caches, requestOf(file), offline.fetchFile, ORIGIN, V1);
      expect(await text(response)).toBe(`v1 ${file}`);
    }
    // Then the old pages close, the new worker activates, and only the new files answer.
    await activate(caches, V2);
    expect(await caches.keys()).toEqual([cacheNameFor(V2.version)]);
    for (const file of FILES) {
      const response = await respond(caches, requestOf(file), offline.fetchFile, ORIGIN, V2);
      expect(await text(response)).toBe(`v2 ${file}`);
    }
  });

  it("holds no private value: a shell that is built only from the file list holds only those paths and bytes", async () => {
    const caches = await installed();
    const store = caches.stores.get(cacheNameFor(V1.version)) as FakeCache;
    for (const [key, row] of store.rows) {
      expect(FILES).toContain(key);
      expect(row.body).toBe(`v1 ${key}`);
      expect(row.headers.map(([name]) => name.toLowerCase())).not.toContain("set-cookie");
    }
  });
});

// ---- the page --------------------------------------------------------------------------------------------------

class FakeRegistration implements RegistrationLike {
  waiting: unknown = null;
  installing: { state: string; addEventListener(type: "statechange", listener: () => void): void } | null = null;
  private found: (() => void)[] = [];
  addEventListener(_type: "updatefound", listener: () => void): void {
    this.found.push(listener);
  }
  /** A new worker starts installing. Returns a handle to move it through its states. */
  startInstalling(): { setState(state: string): void } {
    const listeners: (() => void)[] = [];
    const worker = { state: "installing", addEventListener: (_t: "statechange", l: () => void) => void listeners.push(l) };
    this.installing = worker;
    for (const l of this.found) l();
    return {
      setState: (state: string) => {
        worker.state = state;
        for (const l of listeners) l();
      },
    };
  }
}

describe("T31 the update notice", () => {
  it("says exactly what the plan says", () => {
    expect(SITE_COPY.updateReady).toBe("A new version is ready. Save your work before reopening.");
  });

  it("tells the keeper once when a new version has installed and an old one is in charge", () => {
    const registration = new FakeRegistration();
    const told: number[] = [];
    watchForUpdate(registration, true, () => told.push(1));
    const worker = registration.startInstalling();
    worker.setState("installing");
    expect(told).toEqual([]);
    worker.setState("installed");
    expect(told).toEqual([1]);
    worker.setState("activating");
    worker.setState("activated");
    expect(told).toEqual([1]);
  });

  it("tells the keeper at once when a new version is already waiting", () => {
    const registration = new FakeRegistration();
    registration.waiting = {};
    const told: number[] = [];
    watchForUpdate(registration, true, () => told.push(1));
    expect(told).toEqual([1]);
  });

  it("says nothing the first time, when no worker was in charge yet", () => {
    const registration = new FakeRegistration();
    const told: number[] = [];
    watchForUpdate(registration, false, () => told.push(1));
    registration.startInstalling().setState("installed");
    expect(told).toEqual([]);
  });

  function fakeDocument(): { doc: NoticeDocument; inserted: NoticeElement[] } {
    const inserted: NoticeElement[] = [];
    const doc: NoticeDocument = {
      body: {
        firstChild: { marker: "first" },
        insertBefore: (node: unknown, before: unknown) => {
          expect(before).toEqual({ marker: "first" });
          inserted.unshift(node as NoticeElement);
          return node;
        },
      },
      querySelector: (selector: string) => (selector === "[data-update-notice]" && inserted.length > 0 ? inserted[0] : null),
      createElement: () => {
        const attrs: Record<string, string> = {};
        const element: NoticeElement & { attrs: Record<string, string> } = {
          attrs,
          setAttribute: (name, value) => void (attrs[name] = value),
          textContent: "",
          style: {},
        };
        return element;
      },
    };
    return { doc, inserted };
  }

  it("shows the sentence in the flow of the page, first, as a status, in plain size", () => {
    const { doc, inserted } = fakeDocument();
    showUpdateNotice(doc, SITE_COPY.updateReady);
    expect(inserted.length).toBe(1);
    const notice = inserted[0] as NoticeElement & { attrs: Record<string, string> };
    expect(notice.textContent).toBe("A new version is ready. Save your work before reopening.");
    expect(notice.attrs["role"]).toBe("status");
    expect(notice.attrs["data-update-notice"]).toBe("");
    // In the normal flow: nothing fixed, sticky or absolute, so it never covers a word or a control.
    expect(["", "static", "relative"]).toContain(notice.style["position"] ?? "");
    expect(parseInt(notice.style["fontSize"] ?? "16", 10)).toBeGreaterThanOrEqual(16);
    expect(parseInt(notice.style["padding"] ?? "16", 10)).toBeGreaterThanOrEqual(16);
  });

  it("shows it once however often it is told", () => {
    const { doc, inserted } = fakeDocument();
    showUpdateNotice(doc, SITE_COPY.updateReady);
    showUpdateNotice(doc, SITE_COPY.updateReady);
    expect(inserted.length).toBe(1);
  });
});

// ---- a visitor file, cold --------------------------------------------------------------------------------------

describe("T31 a downloaded visitor file opens cold, with the network off", () => {
  const lantern: BuiltFixture = fixture("lantern-fold");
  const thimble: BuiltFixture = fixture("thimble-beds");
  let n = 0;
  const publicId = (): string => `p${(++n).toString(16).padStart(12, "0")}`;

  const family = (): string => {
    const built = buildFamilyFile(lantern.state as never, { asOf: lantern.asOf, revision: lantern.revision, newPublicId: publicId });
    if (!built.ok) throw new Error("The family file was refused");
    return buildFamilyHtml(built.file, familyWords());
  };
  const seeker = (): string => {
    const built = buildAvailabilityFile(thimble.state as never, { asOf: thimble.asOf, revision: thimble.revision, newPublicId: publicId });
    if (!built.ok) throw new Error("The availability file was refused");
    return buildAvailabilityHtml(built.file, availabilityWords());
  };

  for (const [name, make] of [
    ["family", family],
    ["seeker", seeker],
  ] as const) {
    describe(name, () => {
      const html = make();

      it("asks for nothing: no address, no linked file, no script file, no form, no frame", () => {
        const withoutNamespace = html.replaceAll("http://www.w3.org/2000/svg", "");
        expect(withoutNamespace).not.toMatch(/https?:\/\//i);
        expect(withoutNamespace).not.toMatch(/\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
        expect(html).not.toMatch(/<link\b/i);
        expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
        expect(html).not.toMatch(/<(iframe|form|embed|object|img)\b/i);
        expect(html).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts|serviceWorker)\b/);
        expect(html).toMatch(/Content-Security-Policy" content="default-src 'none'/);
      });

      it("carries its own style and script inside the one file, and a plain list that reads with script off", () => {
        expect(html).toMatch(/<style>[\s\S]+<\/style>/);
        expect((html.match(/<script>/g) ?? []).length).toBe(1);
        const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
        expect(withoutScripts).toMatch(/<li\b[^>]*data-q=|<li\b/);
        expect(withoutScripts).toMatch(/<h1>[^<]+<\/h1>/);
      });

      it("has a search box that the inline script filters", () => {
        expect(html).toMatch(/<input id="q"|<select id="sec"/);
        expect(html).toMatch(/getElementById\('q'\)|getElementById\('sec'\)/);
      });
    });
  }

  it("lists the one approved name as plain text, so browser Find works with script off", () => {
    const html = family().replace(/<script[\s\S]*?<\/script>/g, "");
    expect(html).toContain("Mirel Quillmoss");
    expect(html).not.toContain("Torin Pellwick");
  });
});

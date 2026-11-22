// The service worker. The build adds one line before this file, `self.__PLOTWARDEN_SHELL = {...}`, with the
// version and the list of static files. The worker holds those files and nothing else (see swCore.ts).
// It has no export, so it runs as a plain script. It never calls skipWaiting or claim: a new version waits
// until the pages of the old one are closed, and the two never mix.
import { activate, install, readManifest, respond } from "./swCore";
import type { RequestLike } from "./swCore";

interface Waitable {
  waitUntil(work: Promise<unknown>): void;
}

interface FetchEventLike extends Waitable {
  request: RequestLike;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScope {
  __PLOTWARDEN_SHELL?: unknown;
  location: { origin: string };
  caches: CacheStorage;
  addEventListener(type: "install" | "activate", listener: (event: Waitable) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
}

const scope = self as unknown as WorkerScope;
const manifest = readManifest(scope.__PLOTWARDEN_SHELL);

scope.addEventListener("install", (event) => {
  event.waitUntil(install(scope.caches, (request, init) => fetch(request as RequestInfo, init), manifest));
});

scope.addEventListener("activate", (event) => {
  event.waitUntil(activate(scope.caches, manifest));
});

scope.addEventListener("fetch", (event) => {
  // A request that is not a plain GET of this site is not answered here at all, so the browser handles it.
  if (event.request.method !== "GET") return;
  event.respondWith(respond(scope.caches, event.request, (request, init) => fetch(request as RequestInfo, init), scope.location.origin, manifest));
});

// The page side of the service worker: register it, and say when a new version is ready.
// It never skips the wait, so the page and its files stay one version until the keeper reopens.
import { SITE_COPY } from "./copy";

export interface RegistrationLike {
  waiting: unknown;
  installing: { state: string; addEventListener(type: "statechange", listener: () => void): void } | null;
  addEventListener(type: "updatefound", listener: () => void): void;
}

/**
 * Call `onReady` once when a new version has installed while an older one is in charge of this page. The first
 * install, with no worker in charge yet, is not an update and says nothing.
 */
export function watchForUpdate(registration: RegistrationLike, hadController: boolean, onReady: () => void): void {
  if (!hadController) return;
  let told = false;
  const tell = (): void => {
    if (told) return;
    told = true;
    onReady();
  };
  if (registration.waiting !== null && registration.waiting !== undefined) tell();
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (worker === null) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") tell();
    });
  });
}

export interface NoticeElement {
  setAttribute(name: string, value: string): void;
  textContent: string | null;
  style: Record<string, string>;
}

export interface NoticeDocument {
  body: {
    firstChild: unknown;
    insertBefore(node: unknown, before: unknown): unknown;
  };
  querySelector(selector: string): unknown;
  createElement(tag: string): NoticeElement;
}

/**
 * Put the sentence first in the page, in the normal flow, so it never covers a word or a control. The style is
 * set through the object model, which a strict content policy allows. Shown once.
 */
export function showUpdateNotice(doc: NoticeDocument, text: string): void {
  if (doc.querySelector("[data-update-notice]") !== null) return;
  const notice = doc.createElement("p");
  notice.setAttribute("role", "status");
  notice.setAttribute("data-update-notice", "");
  notice.textContent = text;
  Object.assign(notice.style, {
    margin: "0",
    padding: "16px",
    fontSize: "16px",
    lineHeight: "1.5",
    fontFamily: "system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
    color: "#22252c",
    background: "#f6e7b4",
    borderBottom: "2px solid #22252c",
  });
  doc.body.insertBefore(notice, doc.body.firstChild);
}

interface ServiceWorkerHost {
  serviceWorker?: {
    controller: unknown;
    register(url: string, options: { scope: string }): Promise<RegistrationLike>;
  };
}

/** Register the worker from the page. Does nothing where service workers are missing. A failure is silent: the app works without it. */
export async function registerShell(host: ServiceWorkerHost, doc: NoticeDocument): Promise<void> {
  const container = host.serviceWorker;
  if (container === undefined) return;
  const hadController = container.controller !== null && container.controller !== undefined;
  try {
    const registration = await container.register("/sw.js", { scope: "/" });
    watchForUpdate(registration, hadController, () => showUpdateNotice(doc, SITE_COPY.updateReady));
  } catch {
    // The page works with no worker. There is nothing to tell the keeper.
  }
}

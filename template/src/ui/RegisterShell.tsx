// The register shell: storage, hash routes, the open register, settings and the page frame.
// It receives its adapter as an argument. Only an app entry point imports an adapter.
import "./register.css";
import "./print.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { defineRegister } from "../adapter";
import type { BaseState } from "../base";
import { localDateOf, writeTime } from "../calendar";
import { openRegisterDb } from "../data/db";
import { keySourceOfDraft, uniqueKeysFor } from "../data/importBatch";
import { commit, onRevision, readEvents, readSite } from "../data/transaction";
import type { SiteRow } from "../data/transaction";
import type { DraftEvent, StoredEvent } from "../events";
import { loadSettings, saveSettings, themeAttributes } from "../preferences";
import type { Site } from "../types";
import { BackupRestore } from "./BackupRestore";
import { Exchange } from "./Exchange";
import { FastEntry } from "./FastEntry";
import { Help } from "./Help";
import { ImportWizard } from "./ImportWizard";
import { Library, NewSite } from "./Library";
import { MapEditor } from "./MapEditor";
import { PlotDetails } from "./PlotDetails";
import { PlotList } from "./PlotList";
import { AddRecords, RecordForm } from "./RecordForm";
import { RegisterHome } from "./RegisterHome";
import { Settings as SettingsScreen } from "./Settings";
import { SiteMap } from "./SiteMap";
import { Status } from "./Status";
import { TraceEditor } from "./TraceEditor";
import { ButtonLink } from "./controls";
import { COPY, fill } from "./copy";
import { commitMessage } from "./messages";
import { RegisterContext, ShellContext, parseHash, searchOfState, useShell } from "./shellContext";
import type { AnyApp, AnyCommand, OpenRegister, RegisterApp, Route, RunOptions, RunOutcome, Settings, ShellValue } from "./shellContext";

/** Whether the system asks for less motion, kept in step while the page is open. */
function useSystemReducesMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduces, setReduces] = useState<boolean>(() => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setReduces(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduces;
}

/** The device store, or nothing when the browser blocks it. */
function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function useRoute(): { route: Route; navigate: ShellValue["navigate"] } {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash, searchOfState(window.history.state)));
  const pendingScroll = useRef<number | null>(null);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    const onPop = (event: PopStateEvent) => {
      pendingScroll.current = typeof (event.state as { scrollY?: unknown } | null)?.scrollY === "number" ? (event.state as { scrollY: number }).scrollY : 0;
      setRoute(parseHash(window.location.hash, searchOfState(event.state)));
    };
    const onHash = () => setRoute(parseHash(window.location.hash, searchOfState(window.history.state)));
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const key = `${route.path.join("/")}?${route.query.toString()}`;
  const pathKey = route.path.join("/");
  const lastPath = useRef(pathKey);
  useEffect(() => {
    window.scrollTo(0, pendingScroll.current ?? 0);
    pendingScroll.current = null;
  }, [key]);

  // A new page: focus goes to its heading. A register draws its heading only after it has loaded, so when the heading
  // is not there yet, wait for it. A change of the query alone, such as "?new=1" going away, does not end the wait.
  // Never take focus from a control the keeper has already reached.
  useEffect(() => {
    if (pathKey === lastPath.current) return undefined;
    lastPath.current = pathKey;
    const focusHeading = (force: boolean): boolean => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (heading === null) return false;
      const active = document.activeElement;
      if (force || active === null || active === document.body || active === heading || !document.querySelector("main")?.contains(active)) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      return true;
    };
    if (focusHeading(true)) return undefined;
    const main = document.getElementById("main");
    if (main === null) return undefined;
    const observer = new MutationObserver(() => {
      if (focusHeading(false)) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [pathKey]);

  const navigate = useCallback<ShellValue["navigate"]>((to, options) => {
    window.history.replaceState({ ...(window.history.state as object | null), scrollY: window.scrollY }, "");
    const search = options?.search ?? "";
    const target = `#${to}`;
    if (options?.replace === true) {
      pendingScroll.current = window.scrollY;
      window.history.replaceState({ scrollY: window.scrollY, ...(search === "" ? {} : { q: search }) }, "", target);
      setRoute(parseHash(target, search));
    } else if (search !== "") {
      // A search is kept in the history entry. The address never holds it. Setting the hash cannot carry state.
      if (window.location.hash === target && searchOfState(window.history.state) === search) return;
      window.history.pushState({ q: search }, "", target);
      setRoute(parseHash(target, search));
    } else if (window.location.hash === target) {
      // The same place. Only a search that was showing needs to go.
      if (searchOfState(window.history.state) !== "") {
        window.history.replaceState({ scrollY: window.scrollY }, "", target);
        setRoute(parseHash(target, ""));
      }
    } else {
      window.location.hash = to;
    }
  }, []);

  return { route, navigate };
}

function NotFound() {
  const { t } = useShell();
  return (
    <section className="stack">
      <h1>{t("pageNotFound")}</h1>
      <div className="actions">
        <ButtonLink href="#/" primary>
          {t("openRegisters")}
        </ButtonLink>
      </div>
    </section>
  );
}

interface Loaded {
  site: Site;
  state: BaseState;
  events: StoredEvent[];
  revision: number;
}

/** Load one register, keep it in step with each commit, and give the screens their way to change it. */
function RegisterFrame({ siteId, children }: { siteId: string; children: ReactNode }) {
  const shell = useShell();
  const { db, register, app, t } = shell;
  const [loaded, setLoaded] = useState<Loaded | "missing" | "failed" | null>(null);
  const [stale, setStale] = useState(false);
  const latest = useRef<Loaded | null>(null);

  /** A practice register is read at its own fixed date. Every other register is read today. */
  const todayFor = useCallback(
    (site: Site) => (site.workspace === "walkthrough" && app.walkthrough !== undefined ? app.walkthrough.today : localDateOf(writeTime(shell.now()), site.zone)),
    [app, shell],
  );

  const load = useCallback(async () => {
    const row = (await readSite(db, siteId)) as SiteRow | undefined;
    if (row === undefined) {
      setLoaded("missing");
      return;
    }
    if (!register.accepts(row).ok) {
      setLoaded("failed");
      return;
    }
    const events = await readEvents(db, siteId);
    const replayed = register.replay(row, events);
    if (!replayed.ok) {
      setLoaded("failed");
      return;
    }
    const { lastSeq: _lastSeq, ...site } = row;
    const next: Loaded = { site, state: replayed.value, events, revision: row.revision };
    latest.current = next;
    setLoaded(next);
    setStale(false);
  }, [db, register, siteId]);

  useEffect(() => {
    setLoaded(null);
    latest.current = null;
    void load();
  }, [load]);

  useEffect(
    () =>
      onRevision((message) => {
        if (message.siteId === siteId && latest.current !== null && message.revision > latest.current.revision) setStale(true);
      }),
    [siteId],
  );

  const runCommands = useCallback(
    async (commands: AnyCommand[], options?: RunOptions): Promise<RunOutcome> => {
      const current = latest.current;
      if (current === null) return { ok: false, code: "site_missing" };
      const on = options?.on ?? todayFor(current.site);
      let state = current.state;
      const drafts: DraftEvent[] = [];
      for (const command of commands) {
        const decided = register.run(state, command, on);
        if (!decided.ok) return { ok: false, code: decided.error.code, error: decided.error };
        for (const draft of decided.value) {
          drafts.push(draft);
          state = app.adapter.apply(state, draft.event);
        }
      }
      const sectionNames = new Map(Object.values(state.map.sections).map((s) => [s.sectionId, s.name]));
      const result = await commit(db, {
        siteId,
        expectedRevision: current.revision,
        opId: options?.opId ?? shell.newId(),
        commands,
        events: drafts,
        uniqueKeys: uniqueKeysFor(drafts.map(keySourceOfDraft), sectionNames),
        blobs: options?.blobs ?? [],
        now: shell.now,
        newId: shell.newId,
      });
      if (!result.ok) return { ok: false, code: result.error.code, commit: result.error };
      await load();
      return { ok: true, revision: result.revision, replayed: result.replayed };
    },
    [app, db, load, register, shell, siteId, todayFor],
  );

  /**
   * Run the commands, then give focus back. A button that is disabled while a save runs loses focus, so after a
   * refusal or a failed save the keeper would be left on the page. If nothing else has taken focus by then, it goes
   * back to the control that had it, when that control is still there.
   */
  const run = useCallback(
    async (commands: AnyCommand[], options?: RunOptions): Promise<RunOutcome> => {
      const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const outcome = await runCommands(commands, options);
      const restore = () => {
        const lost = document.activeElement === null || document.activeElement === document.body;
        if (trigger !== null && trigger.isConnected && lost) trigger.focus({ preventScroll: true });
      };
      window.setTimeout(restore, 0);
      window.setTimeout(restore, 150);
      return outcome;
    },
    [runCommands],
  );

  const value = useMemo<OpenRegister | null>(() => {
    if (loaded === null || loaded === "missing" || loaded === "failed") return null;
    return {
      site: loaded.site,
      state: loaded.state,
      events: loaded.events,
      revision: loaded.revision,
      today: todayFor(loaded.site),
      stale,
      run,
      reload: load,
    };
  }, [loaded, stale, run, load, shell, todayFor]);

  if (loaded === "missing") return <NotFound />;
  if (loaded === "failed") {
    return (
      <section className="stack">
        <h1>{t("siteOpenFailed")}</h1>
        <div className="actions">
          <ButtonLink href="#/">{t("openRegisters")}</ButtonLink>
        </div>
      </section>
    );
  }
  if (value === null) return <p role="status">{t("openingRegister")}</p>;
  return (
    <RegisterContext.Provider value={value}>
      {stale ? (
        <Status
          status={{ phase: "error", code: "stale_revision", text: commitMessage(t, { code: "stale_revision" }) }}
          actions={{ openLatest: () => void load(), keepDraft: () => setStale(false) }}
        />
      ) : null}
      {children}
    </RegisterContext.Provider>
  );
}

function RegisterRoutes({ route }: { route: Route }) {
  const { app } = useShell();
  const [, , area, arg] = route.path;
  switch (area) {
    case undefined:
      return app.home === undefined ? <RegisterHome /> : <app.home />;
    case "map":
      if (arg === undefined) return <SiteMap />;
      if (arg === "edit") return <MapEditor />;
      if (arg === "trace") return <TraceEditor />;
      return <NotFound />;
    case "list":
      return <PlotList />;
    case "plot":
      return arg === undefined ? <NotFound /> : <PlotDetails plotId={arg} />;
    case "add":
      if (arg === undefined) return <AddRecords />;
      if (arg === "one") return <RecordForm />;
      if (arg === "fast") return <FastEntry />;
      if (arg === "import") return <ImportWizard />;
      return <NotFound />;
    case "exchange":
      return <Exchange />;
    case "backup":
      return <BackupRestore mode="backup" />;
    case "restore":
      return <BackupRestore mode="restore" />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <Help section="help" />;
    default: {
      const Own = app.routes?.[area];
      return Own === undefined ? <NotFound /> : <Own {...(arg === undefined ? {} : { arg })} />;
    }
  }
}

function Screens() {
  const { route } = useShell();
  const [first, second] = route.path;
  switch (first) {
    case undefined:
      return <Library />;
    case "new":
      return <NewSite />;
    case "restore":
      return <BackupRestore mode="library" />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <Help section="help" />;
    case "about":
      return <Help section="about" />;
    case "r":
      return second === undefined ? (
        <NotFound />
      ) : (
        <RegisterFrame siteId={second}>
          <RegisterRoutes route={route} />
        </RegisterFrame>
      );
    default:
      return <NotFound />;
  }
}

export function RegisterShell<S extends BaseState, C extends { type: string }, E extends { type: string }>({
  app,
}: {
  app: RegisterApp<S, C, E>;
}) {
  const anyApp = app as unknown as AnyApp;
  const defined = useMemo(() => defineRegister(anyApp.adapter), [anyApp]);
  const { route, navigate } = useRoute();
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(browserStorage()));
  const systemReduces = useSystemReducesMotion();
  const [db, setDb] = useState<IDBDatabase | "opening" | { failed: string }>("opening");
  const [sitesVersion, setSitesVersion] = useState(0);
  const [newerTab, setNewerTab] = useState(false);

  const t = useCallback<ShellValue["t"]>(
    (key, values) => {
      const template = anyApp.adapter.labels[key] ?? COPY[key] ?? key;
      try {
        return fill(template, values ?? {});
      } catch {
        return template;
      }
    },
    [anyApp],
  );

  useEffect(() => {
    let closed: IDBDatabase | undefined;
    let cancelled = false;
    void openRegisterDb(anyApp.factory ?? globalThis.indexedDB, { onVersionChange: () => setNewerTab(true) }).then((opened) => {
      if (cancelled) {
        if (opened.ok) opened.value.close();
        return;
      }
      if (opened.ok) {
        closed = opened.value;
        setDb(opened.value);
      } else setDb({ failed: opened.error.code });
    });
    return () => {
      cancelled = true;
      closed?.close();
    };
  }, [anyApp]);

  // The theme: the app's ink and paper, motion and contrast. High contrast uses its own colours.
  useEffect(() => {
    const root = document.documentElement;
    const attributes = themeAttributes(settings, systemReduces);
    root.dataset["motion"] = attributes.motion;
    root.dataset["motionSetting"] = attributes.motionSetting;
    root.dataset["contrast"] = attributes.contrast;
    if (settings.contrast === "standard") {
      root.style.setProperty("--ink", anyApp.adapter.theme.ink);
      root.style.setProperty("--paper", anyApp.adapter.theme.paper);
    } else {
      root.style.removeProperty("--ink");
      root.style.removeProperty("--paper");
    }
    let page = document.getElementById("plotwarden-page");
    if (page === null) {
      page = document.createElement("style");
      page.id = "plotwarden-page";
      document.head.appendChild(page);
    }
    page.textContent = `@page { size: ${settings.paper}; margin: 12mm; }`;
  }, [settings, systemReduces, anyApp]);

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    // A refusing store is not an error: the setting still holds for this page.
    saveSettings(browserStorage(), next);
  }, []);

  const now = anyApp.now ?? (() => new Date());
  const newId = anyApp.newId ?? (() => globalThis.crypto.randomUUID());

  if (!defined.ok) return <p role="alert">{COPY["siteOpenFailed"]}</p>;

  const insideRegister = route.path[0] === "r" && route.path[1] !== undefined;
  const settingsHref = insideRegister ? `#/r/${route.path[1] as string}/settings` : "#/settings";
  const frame = (body: ReactNode) => (
    <div className="shell">
      <header className="app" {...(route.path[0] === undefined ? { "data-library": "" } : {})}>
        <div className="mist" aria-hidden="true" />
        <p className="brand">{anyApp.title}</p>
        <nav aria-label={t("mainNavigation")}>
          <ul className="actions plain">
            <li>
              <a className="button" href="#/">
                {t("navRegisters")}
              </a>
            </li>
            <li>
              <a className="button" href={settingsHref}>
                {t("navSettings")}
              </a>
            </li>
            <li>
              <a className="button" href="#/help">
                {t("navHelp")}
              </a>
            </li>
            <li>
              <a className="button" href="#/about">
                {t("navAbout")}
              </a>
            </li>
          </ul>
        </nav>
      </header>
      <main id="main">{body}</main>
    </div>
  );

  if (db === "opening") return frame(<p role="status">{t("openingRegister")}</p>);
  if (!(db instanceof IDBDatabase)) {
    return frame(
      <section className="stack">
        <h1>{t("openingRegister")}</h1>
        <p role="alert">{db.failed === "schema_too_new" ? t("schemaTooNew") : t("storageUnavailable")}</p>
      </section>,
    );
  }

  const value: ShellValue = {
    app: anyApp,
    register: defined.value,
    db,
    t,
    route,
    navigate,
    settings,
    setSettings,
    now,
    newId,
    sitesVersion,
    bumpSites: () => setSitesVersion((n) => n + 1),
  };
  return (
    <ShellContext.Provider value={value}>
      {frame(
        <>
          {newerTab ? <p className="notice error" role="alert">{t("newerTabHint")}</p> : null}
          <Screens />
        </>,
      )}
    </ShellContext.Provider>
  );
}

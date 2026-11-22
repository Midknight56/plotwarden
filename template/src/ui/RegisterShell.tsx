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
import type { Site } from "../types";
import { BackupRestore } from "./BackupRestore";
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
import { DEFAULT_SETTINGS, RegisterContext, ShellContext, parseHash, useShell } from "./shellContext";
import type { AnyApp, AnyCommand, OpenRegister, RegisterApp, Route, RunOptions, RunOutcome, Settings, ShellValue } from "./shellContext";

const SETTINGS_KEY = "plotwarden.settings";

/** The settings are three choices and no private value, so they may live in local storage. */
function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      motion: v.motion === "reduce" ? "reduce" : "follow",
      contrast: v.contrast === "high" ? "high" : "standard",
      paper: v.paper === "Letter" ? "Letter" : "A4",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function useRoute(): { route: Route; navigate: ShellValue["navigate"] } {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const pendingScroll = useRef<number | null>(null);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    const onPop = (event: PopStateEvent) => {
      pendingScroll.current = typeof (event.state as { scrollY?: unknown } | null)?.scrollY === "number" ? (event.state as { scrollY: number }).scrollY : 0;
      setRoute(parseHash(window.location.hash));
    };
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const key = `${route.path.join("/")}?${route.query.toString()}`;
  const lastPath = useRef(route.path.join("/"));
  useEffect(() => {
    window.scrollTo(0, pendingScroll.current ?? 0);
    pendingScroll.current = null;
    const path = route.path.join("/");
    if (path !== lastPath.current) {
      lastPath.current = path;
      const heading = document.querySelector<HTMLElement>("main h1");
      if (heading !== null) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }, [key, route.path]);

  const navigate = useCallback<ShellValue["navigate"]>((to, options) => {
    window.history.replaceState({ ...(window.history.state as object | null), scrollY: window.scrollY }, "");
    if (options?.replace === true) {
      pendingScroll.current = window.scrollY;
      window.history.replaceState({ scrollY: window.scrollY }, "", `#${to}`);
      setRoute(parseHash(`#${to}`));
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

  const run = useCallback(
    async (commands: AnyCommand[], options?: RunOptions): Promise<RunOutcome> => {
      const current = latest.current;
      if (current === null) return { ok: false, code: "site_missing" };
      const on = options?.on ?? localDateOf(writeTime(shell.now()), current.site.zone);
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
    [app, db, load, register, shell, siteId],
  );

  const value = useMemo<OpenRegister | null>(() => {
    if (loaded === null || loaded === "missing" || loaded === "failed") return null;
    return {
      site: loaded.site,
      state: loaded.state,
      events: loaded.events,
      revision: loaded.revision,
      today: localDateOf(writeTime(shell.now()), loaded.site.zone),
      stale,
      run,
      reload: load,
    };
  }, [loaded, stale, run, load, shell]);

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
  const [, , area, arg] = route.path;
  switch (area) {
    case undefined:
      return <RegisterHome />;
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
    case "backup":
      return <BackupRestore mode="backup" />;
    case "restore":
      return <BackupRestore mode="restore" />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <Help section="help" />;
    default:
      return <NotFound />;
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
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
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
    root.dataset["motion"] = settings.motion;
    root.dataset["contrast"] = settings.contrast;
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
  }, [settings, anyApp]);

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // The setting still holds for this page.
    }
  }, []);

  const now = anyApp.now ?? (() => new Date());
  const newId = anyApp.newId ?? (() => globalThis.crypto.randomUUID());

  if (!defined.ok) return <p role="alert">{COPY["siteOpenFailed"]}</p>;

  const insideRegister = route.path[0] === "r" && route.path[1] !== undefined;
  const settingsHref = insideRegister ? `#/r/${route.path[1] as string}/settings` : "#/settings";
  const frame = (body: ReactNode) => (
    <div className="shell">
      <header className="app">
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

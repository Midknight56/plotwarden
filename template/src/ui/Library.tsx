// The list of registers on this device, and the form that starts a new one.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { localDateOf } from "../calendar";
import { readEvents, listSites, saveNewSite } from "../data/transaction";
import { restartWalkthrough, seedWalkthrough } from "../data/seed";
import { createSite, mintId, siteLibrary } from "../site";
import type { Currency, Site } from "../types";
import { ButtonLink, Button, Notice, SelectField, TextField, focusFirstInvalid } from "./controls";
import { useShell } from "./shellContext";

interface Card {
  site: Site;
  plots: number;
  changed: string | undefined;
}

/**
 * Open or restart the practice register of the app. A second press while one is running does nothing. The library
 * button and the `#/practice` route share it, so there is one way to open a practice register.
 */
export function usePracticeRegister(): { state: "idle" | "busy" | "failed"; open(restart: boolean, options?: { replace?: boolean }): Promise<void> } {
  const { app, db, register, navigate, newId, bumpSites } = useShell();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const guard = useRef(false);

  const open = async (restart: boolean, options?: { replace?: boolean }): Promise<void> => {
    const walkthrough = app.walkthrough;
    if (walkthrough === undefined || guard.current) return;
    guard.current = true;
    setState("busy");
    const made = restart
      ? await restartWalkthrough(db, register as never, walkthrough, { newId })
      : await seedWalkthrough(db, register as never, walkthrough, { newId });
    guard.current = false;
    if (!made.ok) {
      setState("failed");
      return;
    }
    setState("idle");
    bumpSites();
    navigate(`/r/${made.value.id}${restart ? "?restarted=1" : ""}`, options?.replace === true ? { replace: true } : undefined);
  };
  return { state, open };
}

/**
 * The route `#/practice`: one press from the hub opens the practice register. It replaces its own history entry, so
 * Back returns to where the keeper came from and does not open the register a second time. The caller shows this
 * only for an app that has a practice register.
 */
export function PracticeEntry() {
  const { app, t } = useShell();
  const practice = usePracticeRegister();
  const started = useRef(false);
  const { open } = practice;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open(false, { replace: true });
  }, [open]);
  return (
    <section className="stack">
      <h1>{app.title}</h1>
      {practice.state === "failed" ? (
        <>
          <Notice tone="error">{t("storageUnavailable")}</Notice>
          <div className="actions">
            <ButtonLink href="#/" primary>
              {t("openRegisters")}
            </ButtonLink>
          </div>
        </>
      ) : (
        <p role="status">{t("openingRegister")}</p>
      )}
    </section>
  );
}

export function Library() {
  const { app, db, t, register, route, sitesVersion } = useShell();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [started, setStarted] = useState(false);
  const practice = usePracticeRegister();
  const openPractice = practice.open;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await listSites(db);
      const sites = siteLibrary(all, { kind: app.adapter.kind, workspace: "own" });
      // The practice register is offered for a restart only once it has been opened.
      const began = app.walkthrough !== undefined && all.some((s) => s.workspace === "walkthrough" && s.kind === app.adapter.kind && s.title === app.walkthrough?.siteTitle);
      const out: Card[] = [];
      for (const site of sites) {
        const events = await readEvents(db, site.id);
        const replayed = register.replay(site, events);
        const last = events[events.length - 1];
        out.push({
          site,
          plots: replayed.ok ? Object.keys(replayed.value.core.plots).length : 0,
          changed: last === undefined ? undefined : localDateOf(last.recordedAt, site.zone),
        });
      }
      if (!cancelled) {
        setCards(out);
        setStarted(began);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, db, register, sitesVersion]);

  return (
    <section className="stack">
      <h1>{app.title}</h1>
      <p>{app.adapter.labels["libraryPrompt"] ?? t("libraryPrompt")}</p>
      <p>{t("libraryWho")}</p>
      {route.query.get("removed") === "1" ? <Notice tone="good">{t("registerRemoved")}</Notice> : null}
      {practice.state === "failed" ? <Notice tone="error">{t("storageUnavailable")}</Notice> : null}
      <div className="actions">
        <ButtonLink href="#/new" primary={cards !== null && cards.length === 0}>
          {t("startRegister")}
        </ButtonLink>
        <ButtonLink href="#/restore">{t("restoreBackup")}</ButtonLink>
      </div>
      {app.walkthrough === undefined ? null : (
        <div className="stack">
          <p>{t("walkthroughNote")}</p>
          <div className="actions">
            <Button className="button quiet" onClick={() => void openPractice(false)} disabled={practice.state === "busy"}>
              {t("openWalkthrough")}
            </Button>
            {started ? (
              <Button onClick={() => void openPractice(true)} disabled={practice.state === "busy"}>
                {t("restartWalkthrough")}
              </Button>
            ) : null}
          </div>
        </div>
      )}
      <h2>{t("myRegisters")}</h2>
      {cards === null ? (
        <p role="status">{t("openingRegister")}</p>
      ) : cards.length === 0 ? (
        <p>{t("noRegisters")}</p>
      ) : (
        <ul className="cards plain">
          {cards.map(({ site, plots, changed }) => (
            <li key={site.id} className="card">
              <h3>{site.title}</h3>
              <p>
                {plots === 1 ? t("plotCountOne") : t("plotCountMany", { count: plots })} · {changed === undefined ? t("notChangedYet") : t("changedOn", { date: changed })}
              </p>
              <div className="actions">
                <ButtonLink href={`#/r/${site.id}`} primary>
                  {t("openSite", { site: site.title })}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CURRENCIES: readonly Currency[] = ["GBP", "EUR", "USD", "CAD"];

function zones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const list = supported === undefined ? [] : supported("timeZone");
  const system = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const all = new Set([...list, system, "Europe/London", "UTC"]);
  return [...all].sort();
}

export function NewSite() {
  const { app, db, t, navigate, now, bumpSites } = useShell();
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [currency, setCurrency] = useState("");
  const [errors, setErrors] = useState<{ title?: string; currency?: string; save?: string }>({});
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const options = zones();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (title.trim() === "") next.title = t("enterSiteName");
    if (app.adapter.usesCurrency === true && currency === "") next.currency = t("chooseCurrency");
    setErrors(next);
    if (next.title !== undefined || next.currency !== undefined) {
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setBusy(true);
    const made = createSite({
      id: mintId(),
      lineageId: mintId(),
      siteKey: mintId(),
      kind: app.adapter.kind,
      title,
      zone,
      createdAt: now().toISOString(),
      ...(app.adapter.usesCurrency === true ? { currency: currency as Currency } : {}),
    });
    if (!made.ok) {
      setErrors({ title: t("enterSiteName") });
      setBusy(false);
      return;
    }
    const saved = await saveNewSite(db, made.value);
    if (!saved.ok) {
      setErrors({ save: t("quota") });
      setBusy(false);
      return;
    }
    bumpSites();
    navigate(`/r/${made.value.id}?new=1`);
  };

  return (
    <section className="stack">
      <h1>{t("startRegister")}</h1>
      <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t("siteName")} value={title} onChange={setTitle} error={errors.title} autoComplete="off" />
        <SelectField label={t("localTimeZone")} value={zone} onChange={setZone} options={options.map((z) => ({ value: z, label: z }))} />
        {app.adapter.usesCurrency === true ? (
          <SelectField
            label={t("currency")}
            value={currency}
            onChange={setCurrency}
            error={errors.currency}
            options={[{ value: "", label: "" }, ...CURRENCIES.map((c) => ({ value: c, label: c }))]}
          />
        ) : null}
        {errors.save === undefined ? null : <Notice tone="error">{errors.save}</Notice>}
        <div className="actions">
          <Button primary type="submit" disabled={busy}>
            {t("createRegister")}
          </Button>
          <ButtonLink href="#/">{t("cancel")}</ButtonLink>
        </div>
      </form>
    </section>
  );
}

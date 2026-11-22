// The list of registers on this device, and the form that starts a new one.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { localDateOf } from "../calendar";
import { readEvents, listSites, saveNewSite } from "../data/transaction";
import { createSite, mintId, siteLibrary } from "../site";
import type { Currency, Site } from "../types";
import { ButtonLink, Button, Notice, SelectField, TextField, focusFirstInvalid } from "./controls";
import { useShell } from "./shellContext";

interface Card {
  site: Site;
  plots: number;
  changed: string | undefined;
}

export function Library() {
  const { app, db, t, register, route, sitesVersion } = useShell();
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sites = siteLibrary(await listSites(db), { kind: app.adapter.kind, workspace: "own" });
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
      if (!cancelled) setCards(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [app, db, register, sitesVersion]);

  return (
    <section className="stack">
      <h1>{app.title}</h1>
      <p>{app.adapter.labels["libraryPrompt"] ?? t("libraryPrompt")}</p>
      {route.query.get("removed") === "1" ? <Notice tone="good">{t("registerRemoved")}</Notice> : null}
      <div className="actions">
        <ButtonLink href="#/new" primary>
          {t("startRegister")}
        </ButtonLink>
        <ButtonLink href="#/restore">{t("restoreBackup")}</ButtonLink>
      </div>
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

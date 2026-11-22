// Settings for this device: motion, contrast and print paper. Inside a register, also its removal.
import { useContext, useState } from "react";
import { removeSite } from "../data/siteAdmin";
import { Button, ButtonLink, Notice, RadioGroup, TextField } from "./controls";
import { errorMessage } from "./messages";
import { RegisterContext, useShell } from "./shellContext";
import type { Settings as SettingsValue } from "./shellContext";

export function Settings() {
  const { t, settings, setSettings, db, navigate, bumpSites } = useShell();
  const open = useContext(RegisterContext);
  const [motion, setMotion] = useState<SettingsValue["motion"]>(settings.motion);
  const [contrast, setContrast] = useState<SettingsValue["contrast"]>(settings.contrast);
  const [paper, setPaper] = useState<SettingsValue["paper"]>(settings.paper);
  const [saved, setSaved] = useState(false);
  const [typed, setTyped] = useState("");
  const [removeError, setRemoveError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (open === null || busy) return;
    setBusy(true);
    const result = await removeSite(db, open.site.id, typed);
    setBusy(false);
    if (!result.ok) {
      setRemoveError(result.error.code === "title_mismatch" ? t("removeNeedsName") : errorMessage(t, result.error));
      return;
    }
    bumpSites();
    navigate("/?removed=1");
  };

  return (
    <section className="stack">
      <h1>{t("settingsTitle")}</h1>
      <div className="actions">
        {open === null ? (
          <ButtonLink href="#/">{t("backToRegisters")}</ButtonLink>
        ) : (
          <ButtonLink href={`#/r/${open.site.id}`}>{t("backToRegister")}</ButtonLink>
        )}
      </div>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSettings({ motion, contrast, paper });
          setSaved(true);
        }}
      >
        <h2>{t("deviceSettings")}</h2>
        <RadioGroup
          legend={t("motionLabel")}
          name="motion"
          value={motion}
          onChange={(v) => {
            setMotion(v === "reduce" ? "reduce" : "follow");
            setSaved(false);
          }}
          options={[
            { value: "follow", label: t("followDeviceMotion") },
            { value: "reduce", label: t("reduceMotion") },
          ]}
        />
        <RadioGroup
          legend={t("mapContrast")}
          name="contrast"
          value={contrast}
          onChange={(v) => {
            setContrast(v === "high" ? "high" : "standard");
            setSaved(false);
          }}
          options={[
            { value: "standard", label: t("contrastStandard") },
            { value: "high", label: t("contrastHigh") },
          ]}
        />
        <RadioGroup
          legend={t("printPaper")}
          name="paper"
          value={paper}
          onChange={(v) => {
            setPaper(v === "Letter" ? "Letter" : "A4");
            setSaved(false);
          }}
          options={[
            { value: "A4", label: t("paperA4") },
            { value: "Letter", label: t("paperLetter") },
          ]}
        />
        <div className="actions">
          <button type="submit" className="button primary">
            {t("saveSettings")}
          </button>
        </div>
        {saved ? <Notice tone="good">{t("settingsSaved")}</Notice> : null}
      </form>

      {open === null ? null : (
        <section className="stack" aria-label={t("removeHeading")}>
          <h2>{t("removeHeading")}</h2>
          <p>{t("onlySiteRemoved", { site: open.site.title })}</p>
          <p>{t("removeBackupFirst")}</p>
          <TextField
            label={t("typeSiteName")}
            value={typed}
            error={removeError}
            onChange={(v) => {
              setTyped(v);
              setRemoveError(undefined);
            }}
            autoComplete="off"
          />
          <div className="actions">
            <Button onClick={() => void remove()} disabled={busy || typed.trim() !== open.site.title}>
              {t("removeThis")}
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}

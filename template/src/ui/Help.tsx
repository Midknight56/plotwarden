// Help and About. Plain words, no account, no network.
import { ButtonLink } from "./controls";
import { RegisterContext, useShell } from "./shellContext";
import { useContext } from "react";

export function Help({ section }: { section: "help" | "about" }) {
  const { t, app } = useShell();
  const open = useContext(RegisterContext);
  const back = open === null ? <ButtonLink href="#/">{t("backToRegisters")}</ButtonLink> : <ButtonLink href={`#/r/${open.site.id}`}>{t("backToRegister")}</ButtonLink>;

  if (section === "about") {
    return (
      <section className="stack">
        <h1>{t("aboutTitle")}</h1>
        <p>{t("recordsStay")}</p>
        <p>{t("aboutInvented")}</p>
        {app.version === undefined ? null : <p>{t("releaseVersion", { version: app.version })}</p>}
        <div className="actions">{back}</div>
      </section>
    );
  }

  const topics: [string, string][] = [
    ["startFromPaper", "helpPaper"],
    ["makeAMap", "helpMap"],
    ["shareVisitorCopy", "helpShare"],
    ["keepABackup", "helpBackup"],
    ["useKeyboard", "helpKeyboard"],
  ];
  return (
    <section className="stack">
      <h1>{t("helpTitle")}</h1>
      <p>{t("recordsStay")}</p>
      <p>{t("backupVisitorNote")}</p>
      {topics.map(([title, text]) => (
        <section key={title} className="stack">
          <h2>{t(title)}</h2>
          <p>{t(text)}</p>
        </section>
      ))}
      <div className="actions">{back}</div>
    </section>
  );
}

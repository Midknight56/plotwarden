// Burials with no plot, and names that look alike. A burial is placed only by an exact space the keeper picks.
// A name match is a suggestion: the register links or separates only when the keeper chooses.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonLink, Notice } from "../../../template/src/ui/controls";
import { formatPartialDate } from "../../../template/src/ui/copy";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { LocationFields } from "./Burial";
import { plotChoices, unplacedBurials } from "./history";
import type { PlotChoice } from "./history";
import { useIntent, useChurch } from "./intent";
import { possibleMatches } from "./rules";
import type { Burial } from "./types";

function PlaceForm({ burial, plots, onDone }: { burial: Burial; plots: PlotChoice[]; onDone: (text: string) => void }) {
  const { t, newId } = useShell();
  const open = useChurch();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [where, setWhere] = useState({ plotId: "", spaceId: "" });
  const [local, setLocal] = useState<Record<string, string>>({});
  const claimId = useRef(newId());
  const errors = { ...intent.fieldErrors, ...local };
  const name = burial.nameUnknown ? t("nameUnknown") : (burial.recordedName ?? "");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    if (where.plotId === "" || where.spaceId === "") {
      setLocal({ plot: t("enterField", { field: t("plotLabel") }) });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const code = plots.find((p) => p.plotId === where.plotId)?.code ?? "";
    const done = t("placedAtCode", { name, code });
    const outcome = await intent.send([{ type: "place_burial", burialId: burial.burialId, plotId: where.plotId, spaceId: where.spaceId, claimId: claimId.current }], { done });
    // The burial leaves this list once it is placed, so the result is said by the screen, not by the row.
    if (outcome.ok) onDone(`${done} ${t("saved")}`);
  };
  return (
    <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate>
      <LocationFields plots={plots} plotId={where.plotId} spaceId={where.spaceId} onChange={setWhere} errors={errors} />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
      <div className="actions">
        <Button primary type="submit" disabled={intent.busy}>
          {t("confirmPlacement")}
        </Button>
      </div>
    </form>
  );
}

export function UnplacedScreen() {
  const { t, newId } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const plots = useMemo(() => plotChoices(open.state, open.today), [open.state, open.today]);
  const lost = unplacedBurials(open.state);
  const matches = possibleMatches(open.state);
  const intent = useIntent();
  const [placed, setPlaced] = useState<string | undefined>();
  const describe = (b: Burial | undefined): string => (b === undefined ? "" : (b.recordedName ?? t("nameUnknown")));

  return (
    <section className="stack">
      <h1>{t("burialsWithNoPlot")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>
      {placed === undefined ? null : <Notice tone="good">{placed}</Notice>}
      {lost.length === 0 ? <p>{t("noUnplaced")}</p> : null}
      <ul className="cards plain">
        {lost.map((b) => (
          <li key={b.burialId} className="card">
            <p>
              <strong>{b.recordedName ?? t("nameUnknown")}</strong>
            </p>
            <p>{[t("sourceOf", { ref: b.sourceRef }), formatPartialDate(b.date), t("locationToConfirm")].join(" · ")}</p>
            <div className="actions">
              <ButtonLink href={`${base}/burial/${b.burialId}`}>{t("openSource")}</ButtonLink>
            </div>
            <h2>{t("chooseLocation")}</h2>
            <PlaceForm burial={b} plots={plots} onDone={setPlaced} />
          </li>
        ))}
      </ul>

      <section className="stack" aria-labelledby="match-heading">
        <h2 id="match-heading">{t("possibleNameMatch")}</h2>
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }) }} />
        {matches.length === 0 ? null : (
          <ul className="cards plain">
            {matches.map(([a, b]) => {
              const first = open.state.burials[a];
              const second = open.state.burials[b];
              return (
                <li key={`${a}-${b}`} className="card">
                  <p>{t("matchPair", { first: describe(first), firstRef: first?.sourceRef ?? "", second: describe(second), secondRef: second?.sourceRef ?? "" })}</p>
                  <p>{[formatPartialDate(first?.date ?? { p: "unknown" }), formatPartialDate(second?.date ?? { p: "unknown" })].join(" · ")}</p>
                  <div className="actions">
                    <Button disabled={intent.busy} onClick={() => void intent.send([{ type: "keep_separate", burialId: a, otherBurialId: b }], { done: t("matchKeptSeparate") })}>
                      {t("keepSeparate")}
                    </Button>
                    <Button disabled={intent.busy} onClick={() => void intent.send([{ type: "link_burials", burialId: a, otherBurialId: b, personKey: newId() }], { done: t("matchLinked") })}>
                      {t("linkToPerson")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

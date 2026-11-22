// The stall panel on the plot screen: set the frontage of a stall, and reserve it for a trader.
// A repeat press while a save runs does nothing. "Saved on this device." shows only after the commit.
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, TextField, focusFirstInvalid } from "../../../template/src/ui/controls";
import { commitMessage } from "../../../template/src/ui/messages";
import { useRegister, useShell } from "../../../template/src/ui/shellContext";
import type { AnyCommand, OpenRegister, RunOutcome } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import type { StatusState } from "../../../template/src/ui/Status";
import type { MarketState } from "./types";
import { MAX_CM, MIN_CM } from "./types";

/** The open register, read as a market. The shell only opens a site of this app's kind. */
function useMarket(): Omit<OpenRegister, "state"> & { state: MarketState } {
  return useRegister() as unknown as Omit<OpenRegister, "state"> & { state: MarketState };
}

const whole = (text: string): number | undefined => (/^\d+$/.test(text.trim()) && Number(text) >= MIN_CM && Number(text) <= MAX_CM ? Number(text) : undefined);

export function StallPanel({ plotId }: { plotId: string }) {
  const { t, newId } = useShell();
  const open = useMarket();
  const plot = open.state.core.plots[plotId];
  const frontage = open.state.frontage[plotId];
  const reservations = Object.values(open.state.reservations).filter((r) => r.plotId === plotId);
  const [width, setWidth] = useState(frontage === undefined ? "" : String(frontage));
  const [trader, setTrader] = useState("");
  const [needed, setNeeded] = useState("");
  const [start, setStart] = useState(open.today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const widthForm = useRef<HTMLFormElement>(null);
  const reserveForm = useRef<HTMLFormElement>(null);
  const running = useRef(false);

  if (plot === undefined) return null;

  const send = async (commands: AnyCommand[], done: string, form: HTMLFormElement | null): Promise<RunOutcome | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setStatus({ phase: "saving" });
    const outcome = await open.run(commands);
    running.current = false;
    if (outcome.ok) {
      setStatus({ phase: "saved", text: `${done} ${t("saved")}` });
      return outcome;
    }
    // A refusal of the register has its own words in the catalog, under the name of its code.
    const text = outcome.error === undefined ? commitMessage(t, outcome.commit ?? { code: "storage_abort" }) : t(outcome.code, Object.fromEntries(Object.entries(outcome.error.detail ?? {}).map(([k, v]) => [k, String(v)])));
    setStatus({ phase: "error", code: outcome.code, text });
    window.setTimeout(() => form?.querySelector<HTMLElement>("input")?.focus(), 0);
    return outcome;
  };

  const saveWidth = async (event: FormEvent) => {
    event.preventDefault();
    const cm = whole(width);
    if (cm === undefined) {
      setErrors({ width: t("enterWidth") });
      window.setTimeout(() => focusFirstInvalid(widthForm.current), 0);
      return;
    }
    setErrors({});
    await send([{ type: "set_frontage", plotId, frontageCm: cm }], t("frontageSaved", { code: plot.code, frontage: cm }), widthForm.current);
  };

  const reserve = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const cm = whole(needed);
    if (trader.trim() === "") next["trader"] = t("enterTrader");
    if (cm === undefined) next["needed"] = t("enterWidth");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) next["start"] = t("enterDate");
    setErrors(next);
    if (Object.keys(next).length > 0 || cm === undefined) {
      window.setTimeout(() => focusFirstInvalid(reserveForm.current), 0);
      return;
    }
    const outcome = await send([{ type: "reserve_stall", reservationId: newId(), claimId: newId(), plotId, trader, neededCm: cm, start }], t("stallReserved", { code: plot.code, trader: trader.trim() }), reserveForm.current);
    if (outcome?.ok === true) {
      setTrader("");
      setNeeded("");
    }
  };

  return (
    <section className="card stack" aria-labelledby="stall-heading">
      <h2 id="stall-heading">{t("stallHeading")}</h2>
      <p>{frontage === undefined ? t("frontageNone") : t("frontageNow", { frontage })}</p>
      <form ref={widthForm} className="stack" onSubmit={(e) => void saveWidth(e)} noValidate>
        <TextField label={t("frontageLabel")} value={width} onChange={setWidth} error={errors["width"]} inputMode="numeric" autoComplete="off" />
        <div className="actions">
          <Button type="submit">{t("saveFrontage")}</Button>
        </div>
      </form>

      <h3>{t("reserveHeading")}</h3>
      {reservations.length === 0 ? <p>{t("noReservation")}</p> : null}
      {reservations.map((r) => (
        <p key={r.reservationId}>{t("reservedFor", { trader: r.trader, date: r.start, needed: r.neededCm })}</p>
      ))}
      <form ref={reserveForm} className="stack" onSubmit={(e) => void reserve(e)} noValidate>
        <TextField label={t("traderLabel")} value={trader} onChange={setTrader} error={errors["trader"]} autoComplete="off" />
        <TextField label={t("neededLabel")} value={needed} onChange={setNeeded} error={errors["needed"]} inputMode="numeric" autoComplete="off" />
        <TextField label={t("startLabel")} value={start} onChange={setStart} error={errors["start"]} autoComplete="off" />
        <div className="actions">
          <Button primary type="submit">
            {t("reserveStall")}
          </Button>
        </div>
      </form>
      <Status status={status} actions={{ openLatest: () => void open.reload(), tryAgain: () => setStatus({ phase: "idle" }) }} />
    </section>
  );
}

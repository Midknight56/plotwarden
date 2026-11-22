// The date field "Show the site as at", with the "As at {date}" heading and "Back to today" of a past view.
// It reads and shows. It saves nothing. The map and the plot list use it, and each owns what a date change does.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { LocalDate } from "../calendar";
import { Button, TextField } from "./controls";
import { readAsAt } from "./plotView";
import { useShell } from "./shellContext";

/** The heading of a past view. Today has none. The map shows it above the sheet, away from the field. */
export function AsAtHeading({ date, today }: { date: LocalDate; today: LocalDate }) {
  const { t } = useShell();
  return date < today ? <h2 className="no-print">{t("asAt", { date })}</h2> : null;
}

/**
 * `date` is the view date, today or earlier. `onChange` gets a valid date that is today or earlier and is not the
 * view date. A text that is not a date changes nothing: it marks the field and says why. While the keeper is still
 * typing, a short text shows no message. A message shows when the text has ten characters or more, when the keeper
 * leaves the field, and on Enter.
 */
export function AsAtField({
  date,
  today,
  onChange,
  withHeading = true,
}: {
  date: LocalDate;
  today: LocalDate;
  onChange(date: LocalDate): void;
  /** False when the screen writes the heading itself, with `AsAtHeading`. */
  withHeading?: boolean;
}) {
  const { t } = useShell();
  const [text, setText] = useState<string>(date);
  const [error, setError] = useState<string | undefined>();
  const box = useRef<HTMLDivElement>(null);

  // The address can change the date: Back, Forward and "Back to today". The field follows it.
  useEffect(() => {
    setText(date);
    setError(undefined);
  }, [date]);

  const read = (value: string, show: boolean) => {
    const reading = readAsAt(value, today);
    if (reading.ok) {
      setError(undefined);
      if (reading.date !== date) onChange(reading.date);
      return;
    }
    setError(show || value.trim().length >= 10 || error !== undefined ? t(reading.key) : undefined);
  };

  const past = date < today;
  const backToToday = () => {
    onChange(today);
    box.current?.querySelector("input")?.focus();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    read(text, true);
  };

  return (
    <div className="stack no-print" ref={box}>
      {withHeading ? <AsAtHeading date={date} today={today} /> : null}
      <form className="stack" onSubmit={submit} noValidate>
        <TextField
          label={t("showSiteAsAt")}
          hint={t("asAtHint")}
          value={text}
          error={error}
          autoComplete="off"
          spellCheck={false}
          onChange={(value) => {
            setText(value);
            read(value, false);
          }}
          onBlur={() => read(text, true)}
        />
      </form>
      {past ? (
        <div className="actions">
          <Button onClick={backToToday}>{t("backToToday")}</Button>
        </div>
      ) : null}
    </div>
  );
}

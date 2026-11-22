// Small form parts that every screen shares. Words come from the caller, never from here.
import { useId } from "react";
import type { ChangeEvent, InputHTMLAttributes, MouseEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldShell {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

type TextProps = FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
};

/** A label that is the accessible name of its input, with an error and a hint beside it. */
export function TextField({ label, error, hint, value, onChange, ...rest }: TextProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const described = [error !== undefined ? messageId : undefined, hint !== undefined ? `${id}-hint` : undefined].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        {...rest}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={described === "" ? undefined : described}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={messageId} className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type AreaProps = FieldShell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
};

export function TextArea({ label, error, hint, value, onChange, ...rest }: AreaProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={4}
        {...rest}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      />
      {hint === undefined ? null : <p className="hint">{hint}</p>}
      {error === undefined ? null : (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type SelectProps = FieldShell & Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
};

export function SelectField({ label, error, hint, value, onChange, options, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        {...rest}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint === undefined ? null : <p className="hint">{hint}</p>}
      {error === undefined ? null : (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type CheckProps = { label: string; checked: boolean; onChange: (checked: boolean) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "checked" | "type"
>;

/** A check box with its words beside it. The label wraps the input. */
export function CheckField({ label, checked, onChange, ...rest }: CheckProps) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

interface ChoiceProps {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}

/** One choice out of a few, as radio buttons in a group named by its legend. */
export function RadioGroup({ legend, name, value, onChange, options }: ChoiceProps) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="check">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A message with a role, so a screen reader hears it once. */
export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "good"; children: ReactNode }) {
  return (
    <p className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

/**
 * A link whose search text must not enter the address. A plain click goes by `go`, which keeps the text in the history
 * entry. A click with a modifier key, or a middle click, follows the address and carries no search.
 */
export function keepSearch(event: MouseEvent<HTMLAnchorElement>, go: () => void): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  go();
}

/**
 * A named group of links: a visible heading, and a navigation landmark that the heading names. The caller gives the
 * heading an `id` that is its own on the page, and the links as list items.
 */
export function LinkGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <nav aria-labelledby={id} className="stack link-group">
      <h2 id={id} className="group-heading">
        {title}
      </h2>
      <ul className="actions plain">{children}</ul>
    </nav>
  );
}

/** A link that looks like a button. */
export function ButtonLink({ href, children, primary, ...rest }: { href: string; children: ReactNode; primary?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a className={`button${primary === true ? " primary" : ""}`} href={href} {...rest}>
      {children}
    </a>
  );
}

export function Button({
  children,
  primary,
  ...rest
}: { children: ReactNode; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`button${primary === true ? " primary" : ""}`} {...rest}>
      {children}
    </button>
  );
}

/** Focus the first field that has an error, by its name, inside a form. */
export function focusFirstInvalid(root: HTMLElement | null): void {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  target?.focus();
}

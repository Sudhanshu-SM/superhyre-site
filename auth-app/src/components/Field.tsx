import { Warning } from "@phosphor-icons/react";
import type { InputHTMLAttributes, ReactNode } from "react";

/** One icon family across the surface (@phosphor-icons/react) at one weight,
 *  so nothing looks borrowed from a second set. */
export const ICON_WEIGHT = "bold" as const;

type Props = {
  id: string;
  label: string;
  /** Shown when there is no error. Rendered even when absent so revealing a
   *  message never shifts the button out from under the pointer. */
  help?: ReactNode;
  error?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-invalid">;

export function Field({ id, label, help, error, ...input }: Props) {
  const invalid = Boolean(error);
  const describedBy = invalid ? `${id}-error` : help ? `${id}-help` : undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-input-wrap">
        <input
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...input}
        />
      </div>

      {invalid ? (
        // role="alert" so the message is announced when it appears rather than
        // only being findable by someone who goes looking for it.
        <p className="field-error" id={`${id}-error`} role="alert">
          <Warning size={14} weight={ICON_WEIGHT} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="field-help" id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}

import { Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ICON_WEIGHT } from "./Field";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "current-password" on sign-in, "new-password" on sign-up. Getting this
   *  wrong makes password managers offer to save the wrong thing. */
  autoComplete: "current-password" | "new-password";
  help?: ReactNode;
  error?: string | null;
  disabled?: boolean;
};

/**
 * Separate from Field because the reveal toggle is not a variant of a text
 * input: it owns state, it changes the input's type, and it has to stay
 * reachable by keyboard without becoming a tab stop between the field and the
 * submit button in the wrong order.
 */
export function PasswordField({
  id, label, value, onChange, autoComplete, help, error, disabled,
}: Props) {
  const [shown, setShown] = useState(false);
  const labelId = useId();
  const invalid = Boolean(error);
  const describedBy = invalid ? `${id}-error` : help ? `${id}-help` : undefined;

  return (
    <div className="field field-has-toggle">
      <label htmlFor={id}>{label}</label>
      <div className="field-input-wrap">
        <input
          id={id}
          // Revealing swaps to type="text" rather than a CSS mask, because a
          // masked-but-still-type-password field is read out as a password by
          // screen readers even while it is visibly plain.
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          spellCheck={false}
        />
        <button
          type="button"
          className="reveal"
          // Not a label change on the same node: aria-pressed communicates the
          // toggle state, and the accessible name stays stable.
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-describedby={labelId}
          onClick={() => setShown((s) => !s)}
          disabled={disabled}
        >
          {shown
            ? <EyeSlash size={17} weight={ICON_WEIGHT} aria-hidden="true" />
            : <Eye size={17} weight={ICON_WEIGHT} aria-hidden="true" />}
        </button>
        <span id={labelId} className="sr-only">{label}</span>
      </div>

      {invalid ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          <Warning size={14} weight={ICON_WEIGHT} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="field-help" id={`${id}-help`}>{help}</p>
      )}
    </div>
  );
}

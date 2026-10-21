import type { SlowLevel } from "../slowState";
import "../errorStates.css";

/**
 * What a wait that has gone on too long says, in place (the shared face of `useSlowState`): after the soft limit one
 * calm line, with Cancel where it can be cancelled and Check again where looking again could help; after the hard
 * limit that the wait is over, with Try again. Nothing here is red, and nothing is said while the wait is young.
 */
export function SlowNote({ level, what = "This", onRetry, onCancel, retryLabel = "Try again", cancelLabel = "Cancel", soft, stuck }: {
  level: SlowLevel;
  /** The thing being waited for, as the start of a sentence: "Sending", "Your role spec". */
  what?: string;
  onRetry?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  retryLabel?: string;
  cancelLabel?: string;
  /** Replaces the soft line. */
  soft?: string;
  /** Replaces the hard line. */
  stuck?: string;
}): JSX.Element | null {
  if (level === "ok") return null;
  const hard = level === "stuck";
  return (
    <p className={`sn is-${level}`} role={hard ? "alert" : "status"}>
      <span className="sn-t">{hard ? (stuck ?? `${what} didn't finish. Nothing was changed.`) : (soft ?? "Taking longer than usual.")}</span>
      {onRetry && <button type="button" className="sn-act" onClick={onRetry}>{retryLabel}</button>}
      {onCancel && <button type="button" className="sn-act" onClick={onCancel}>{cancelLabel}</button>}
    </p>
  );
}

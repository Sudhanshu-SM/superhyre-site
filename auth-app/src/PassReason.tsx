import { useEffect, useState } from "react";
import "./roles.css";
import { Dialog } from "./ui";

/** The usual reasons, one tap each; anything else is typed. */
export const PASS_REASONS = ["Location", "Experience", "Skills", "Compensation", "Notice period", "Not interested"] as const;

/** The reason as sent: a picked reason, the typed note, or both ("Skills: no Kafka"). */
export function passReasonText(picked: string | null, note: string): string | undefined {
  const typed = note.trim();
  if (picked && typed) return `${picked}: ${typed}`;
  return picked ?? (typed || undefined);
}

/**
 * Asks why before passing on someone. Giving a reason is optional: "Pass without a reason"
 * is one click. Reasons teach the matching what to avoid.
 */
export function PassReasonDialog({ who, onPass, onClose }: {
  /** Who is being passed on, e.g. "Asha" or "3 people"; null when closed. */
  who: string | null;
  onPass: (reason: string | undefined) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (who) {
      setPicked(null);
      setNote("");
    }
  }, [who]);
  const label = `Why pass on ${who ?? "them"}?`;
  return (
    <Dialog open={who !== null} onClose={onClose} label={label} size="md">
      <form
        className="rl-dlg is-confirm"
        onSubmit={(e) => {
          e.preventDefault();
          onPass(passReasonText(picked, note));
        }}
      >
        <header className="rl-dlg-h">
          <h2 className="t-title">{label}</h2>
          <p className="t-body rl-dlg-b">Optional. It helps future searches skip people like this.</p>
        </header>
        <div className="pr-reasons" role="group" aria-label="Reasons">
          {PASS_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`ct-btn${picked === r ? " is-primary" : ""}`}
              aria-pressed={picked === r}
              onClick={() => setPicked((p) => (p === r ? null : r))}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="pr-note">
          <span className="t-label">Anything else</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="For example: wants remote only" />
        </label>
        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={() => onPass(undefined)}>Pass without a reason</button>
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn is-primary" disabled={!picked && !note.trim()}>Pass</button>
        </footer>
      </form>
    </Dialog>
  );
}

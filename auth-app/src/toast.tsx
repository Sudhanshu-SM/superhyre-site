import { Check, Info, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useProblem } from "./problems";

/**
 * The one line, bottom centre, that says what happened: a change that went through, or one that didn't.
 * Replaced rather than stacked. Mounted once, at the console's root, so a failure or a confirmation is seen
 * whichever page it came from (a page that remembered to mount its own host used to be the only one that could say).
 *
 * Two things feed it: `useToast()` (a page telling the person what it just did) and `reportProblem()` (a
 * store putting a refused change back). A problem is the one on screen while it lasts; a toast waits behind it.
 */

/* "error" is for something that didn't go through: the same calm line,
   held longer so it can be read, with an info mark instead of a tick. */
export type Tone = "done" | "error";
/* A way back from what the toast says happened ("Task deleted", with Undo beside it). Held longer, so it can be reached. */
export type ToastAction = { label: string; onClick: () => void };

let pushToast: ((m: string, tone: Tone, action?: ToastAction) => void) | null = null;

/** A sentence longer than this is read, not glimpsed (a CSV result naming the rows left out): it is held with a close button. */
export const LONG_TOAST = 90;
/** How long a long toast stays if nobody closes it, in ms. Long enough to read it and look back at the file. */
export const LONG_HOLD_MS = 15_000;
export const isLongToast = (text: string): boolean => text.length > LONG_TOAST;

/** How long a toast stays on screen: a glance, a calm error, a way back, or a long sentence. */
export function holdMs(text: string, tone: Tone, action?: ToastAction): number {
  if (isLongToast(text)) return LONG_HOLD_MS;
  return action ? 6000 : tone === "error" ? 4200 : 1800;
}

export function useToast() {
  return useCallback((m: string, tone: Tone = "done", action?: ToastAction) => pushToast?.(m, tone, action), []);
}

let dismiss: (() => void) | null = null;

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; n: number; tone: Tone; action?: ToastAction } | null>(null);
  const problem = useProblem();
  useEffect(() => {
    let n = 0;
    let t = 0;
    pushToast = (text, tone, action) => {
      n += 1;
      setMsg({ text, n, tone, ...(action ? { action } : {}) });
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), holdMs(text, tone, action));
    };
    dismiss = () => { window.clearTimeout(t); setMsg(null); };
    return () => { pushToast = null; dismiss = null; window.clearTimeout(t); };
  }, []);
  return createPortal(
    <div className="ct-toast-host" role="status" aria-live="polite">
      {problem ? (
        <div key={`p${problem.n}`} className="ct-toast" role="alert" style={{ animationDuration: "4000ms" }}>{problem.text}</div>
      ) : msg && (
        <div key={msg.n} className={`ct-toast${msg.tone === "error" ? " is-calm" : ""}${msg.action ? " has-act" : ""}${isLongToast(msg.text) ? " is-long" : ""}`}>
          {msg.tone === "error" ? <Info size={14} weight="bold" /> : <Check size={13} weight="bold" />} {msg.text}
          {msg.action && (
            <button type="button" className="ct-toast-act" onClick={() => { msg.action?.onClick(); setMsg(null); }}>
              {msg.action.label}
            </button>
          )}
          {isLongToast(msg.text) && (
            <button type="button" className="ct-toast-x" onClick={() => dismiss?.()} aria-label="Dismiss">
              <X size={12} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

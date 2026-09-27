import { Check, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

/**
 * Small shared pieces for the agent's moments: a dialog, a button that
 * reports its own outcome, and a height collapse. Each exists because three
 * or more moments needed the same behaviour and were about to write it three
 * different ways.
 */

/* ── Dialog ──────────────────────────────────────────────────────────────────
   Centred, over a scrim, kept mounted through its exit so it leaves rather
   than vanishes, returns focus to whatever opened it, and closes on Escape.
   The profile sidebar stacks above it (its z-index is higher), so a name
   clicked inside a dialog opens the profile without closing the dialog.    */

const EXIT_MS = 220;

export function Dialog({
  open, onClose, label, size = "lg", children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  size?: "md" | "lg" | "xl";
  children: ReactNode;
}): JSX.Element | null {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      if (!mounted) returnTo.current = document.activeElement;
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      (returnTo.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    }, EXIT_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && mounted) panel.current?.focus({ preventScroll: true });
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      /* The profile sidebar, when open above this, takes Escape first. */
      if (e.key === "Escape" && !document.querySelector(".ps:not(.is-leaving)")) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={`dg${leaving ? " is-leaving" : ""}`}>
      <div className="dg-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={`dg-panel is-${size}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="dg-close" aria-label="Close (Esc)" title="Close (Esc)" onClick={onClose}>
          <X size={16} weight="bold" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ── ActionButton ────────────────────────────────────────────────────────────
   idle → working → done, in place. The label cross-fades, a spinner stands in
   while working, and the button settles to a check with the result text. The
   width animates between the three labels so the row around it never jumps.
   `run` may return a promise; without one, `ms` sets how long it "works".  */

export function ActionButton({
  children, done, onRun, ms = 900, tone = "primary", className = "", disabled = false,
}: {
  children: ReactNode;
  /** What the button says once it has worked: "Posted to #hiring-backend". */
  done: ReactNode;
  onRun?: () => void;
  ms?: number;
  tone?: "primary" | "quiet";
  className?: string;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const ref = useRef<HTMLButtonElement>(null);
  const width = useRef<number | null>(null);

  /* Width FLIP: measure before the label changes, animate to the new one. */
  const morph = (next: typeof phase) => {
    const el = ref.current;
    width.current = el ? el.getBoundingClientRect().width : null;
    setPhase(next);
  };
  useEffect(() => {
    const el = ref.current;
    const from = width.current;
    width.current = null;
    if (!el || from === null) return;
    const to = el.getBoundingClientRect().width;
    if (Math.abs(to - from) < 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }, [phase]);

  const click = () => {
    if (phase !== "idle") return;
    morph("busy");
    window.setTimeout(() => {
      onRun?.();
      morph("done");
    }, ms);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`ab is-${tone} is-${phase} ${className}`}
      onClick={click}
      disabled={disabled || phase === "busy"}
      aria-live="polite"
    >
      <span className="ab-in" key={phase}>
        {phase === "busy" ? <span className="ab-spin" aria-hidden="true" /> : null}
        {phase === "done" ? <span className="ab-check" aria-hidden="true"><Check size={11} weight="bold" /></span> : null}
        {phase === "done" ? done : phase === "busy" ? "Working…" : children}
      </span>
    </button>
  );
}

/* ── Collapse ────────────────────────────────────────────────────────────────
   Animates height to and from zero with the grid-rows technique: the row
   track goes 1fr ↔ 0fr, so no height is ever measured or hard-coded.       */

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`cl${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="cl-in">{children}</div>
    </div>
  );
}

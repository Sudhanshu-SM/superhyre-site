import { Check, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { lastFailureConnect, lastFailureKind, lastFailureRetryAt, waitLabel } from "./api/client";
import type { FailureKind } from "./api/client";
import { connectName, ErrorState, kindOfLastFailure } from "./ErrorStates";
import "./ui.css";
import { Loader } from "./components/Loader";
import { openerNow, restoreFocus, trapTab } from "./components/focusTrap";

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
  /* What opened it, taken while the render that mounts it is still being made: a field inside with `autoFocus`
     takes focus during the commit, before any effect runs, and would be remembered as the opener. */
  const [openedBy] = useState<Element | null>(() => (open ? openerNow() : null));
  const returnTo = useRef<Element | null>(openedBy);
  /* Whether the last render had it open. A dialog that is mounted already open (a parent renders it only while it
     is wanted) is "mounted" from its first render, so `mounted` alone never saw it open. */
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) {
      if (!wasOpen.current) returnTo.current = openerNow();
      wasOpen.current = true;
      setMounted(true);
      setLeaving(false);
      return;
    }
    wasOpen.current = false;
    if (!mounted) return;
    setLeaving(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      restoreFocus(returnTo.current as HTMLElement | null);
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
        return;
      }
      /* Tab goes round inside the dialog; it never reaches the page behind it. */
      if (e.key === "Tab" && panel.current) trapTab(panel.current, e);
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
        {phase === "busy" ? <Loader size="sm" tone="inherit" /> : null}
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
    /* Closed content is inert as well as hidden, so Tab never lands on a
       field nobody can see. */
    <div className={`cl${open ? " is-open" : ""}`} aria-hidden={!open} {...({ inert: open ? undefined : "" } as object)}>
      <div className="cl-in">{children}</div>
    </div>
  );
}

/**
 * Whose problem it is: a dropped connection is the person's, too many requests in a minute
 * is a pause (with when it lifts), anything else is ours.
 */
export function loadFailedText(
  what: string,
  kind: FailureKind | null,
  retryAt: number | null = null,
  now = Date.now(),
  connect: string | null = null,
): string {
  /* A service that isn't connected is named, so the person knows what to do and where. */
  if (connect) return `${what} didn't load. ${connectName(connect)} isn't connected yet; an admin can connect it in Settings.`;
  if (kind === "network") return `${what} didn't load. Check your connection and try again.`;
  if (kind === "session") return `${what} didn't load. Your session has ended; sign in again.`;
  if (kind === "access") return `${what} didn't load. You don't have access to this.`;
  if (kind === "limited") {
    const when = retryAt && retryAt > now ? `in ${waitLabel(retryAt, now)}` : "in a moment";
    return `${what} didn't load: that was a lot of requests in a short time. Try again ${when}.`;
  }
  return `${what} didn't load. Something went wrong on our side; try again in a moment.`;
}

/**
 * The same, for a narrow panel: the picture and the button carry the "try again", so the words
 * say only what didn't load and, when it is the person's to fix or to wait for, why.
 */
export function loadFailedShort(what: string, kind: FailureKind | null, connect: string | null = null): string {
  if (connect) return `${what} didn't load. ${connectName(connect)} isn't connected yet.`;
  if (kind === "network") return `${what} didn't load. Check your connection.`;
  if (kind === "session") return `${what} didn't load. Your session has ended.`;
  if (kind === "access") return `${what} didn't load. You don't have access to this.`;
  if (kind === "limited") return `${what} didn't load. That was a lot of requests; wait a moment.`;
  return `${what} didn't load.`;
}

/**
 * A load that failed, said in place of the content. Without it a failed list looks
 * exactly like an empty one ("No candidates yet"), which is a wrong answer, not a
 * missing one.
 */
export function LoadFailed({ what, onRetry, compact = false }: {
  what: string;
  /** Absent when there is nothing to ask again (the caller reloads some other way). */
  onRetry?: () => void;
  /** For a narrow panel (the Agent page's side rail): the sentence and the retry, with no picture of its own. */
  compact?: boolean;
}) {
  const last = lastFailureKind();
  const connect = lastFailureConnect();
  const cls = `ui-failed${compact ? " is-compact" : ""}`;
  const size = compact ? 80 : undefined;
  const art = !compact;
  /* Asking again repeats a refusal that's about something to connect, so the way forward is the
     Connections page. A session that has ended is handled in ErrorState: "Sign in again". */
  if (connect) {
    return (
      <ErrorState
        className={cls}
        kind="connector"
        title={null}
        text={compact ? loadFailedShort(what, last, connect) : loadFailedText(what, last, null, Date.now(), connect)}
        action={{ label: "Open Connections", href: "#/settings/connections" }}
        art={art}
        {...(size ? { size } : {})}
      />
    );
  }
  return (
    <ErrorState
      className={cls}
      kind={kindOfLastFailure(last)}
      title={null}
      text={compact ? loadFailedShort(what, last) : loadFailedText(what, last, lastFailureRetryAt())}
      {...(onRetry ? { action: { label: "Try again", onClick: onRetry } } : {})}
      art={art}
      {...(size ? { size } : {})}
    />
  );
}

/**
 * The first letter of a name for an avatar, whole: an emoji (or any character outside the basic
 * plane) is one glyph, never half a surrogate pair, which prints as a replacement mark.
 */
export function firstGlyph(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  const first = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)[Symbol.iterator]().next().value?.segment
    : Array.from(t)[0];
  return (first ?? "").toUpperCase();
}

/** Up to two initials from a name ("Dev 👩🏽‍💻" is "D" and the emoji), "?" when there is none. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map(firstGlyph).join("") || "?";
}

type HistoryHost = Pick<Window, "history" | "location" | "addEventListener" | "removeEventListener">;

/** Stops listening for Back and gives the dialog's history entry up; `leaveTo` is for a link out of the dialog. */
export type BackGuard = (() => void) & {
  /**
   * Go on to `href` from the dialog. The entry the dialog added is the one the page is on, so it is
   * swapped for the destination rather than left under it: closing the dialog first would ask the
   * browser to go Back after the link had already moved the page, and it would undo the link.
   */
  leaveTo: (href: string) => void;
};

/**
 * Lets the browser's Back close an open dialog instead of leaving the page under it.
 * Opening adds a history entry; Back pops it and calls `onBack`, which can return
 * false to stay open (a draft to keep), putting the entry back. Closing any other
 * way removes the entry, so Back after that goes where it would have.
 */
export function closeOnBack(host: HistoryHost, onBack: () => boolean | void): BackGuard {
  const key = `dialog-${Math.random().toString(36).slice(2)}`;
  const push = () => host.history.pushState({ dialog: key }, "", host.location.href);
  const onTop = () => (host.history.state as { dialog?: string } | null)?.dialog === key;
  let popped = false;
  let left = false;
  const on = () => {
    // A move on to a link is not a Back: the dialog is already going, whatever the browser calls it.
    if (left) { popped = true; return; }
    if (onBack() === false) push();
    else popped = true;
  };
  push();
  host.addEventListener("popstate", on);
  const dispose = (() => {
    host.removeEventListener("popstate", on);
    if (!popped && !left && onTop()) host.history.back();
  }) as BackGuard;
  dispose.leaveTo = (href: string) => {
    if (!popped && !left && onTop()) {
      left = true;
      host.location.replace(href);
    } else {
      host.location.assign(href);
    }
  };
  return dispose;
}

/** Back closes the dialog; the returned function is how a link inside it moves on without the dialog undoing it. */
export function useBackCloses(open: boolean, onBack: () => boolean | void): (href: string) => void {
  const latest = useRef(onBack);
  latest.current = onBack;
  const guard = useRef<BackGuard | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const g = closeOnBack(window, () => latest.current());
    guard.current = g;
    return () => {
      if (guard.current === g) guard.current = null;
      g();
    };
  }, [open]);
  return useCallback((href: string) => {
    if (guard.current) guard.current.leaveTo(href);
    else window.location.assign(href);
  }, []);
}

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DayTask } from "./api/tasks";
import { useSession } from "./roleStore";
import { taskCardOf } from "./taskCard";
import "./taskHover.css";

/* Measuring has to happen before paint; on a server there is nothing to measure. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

const DELAY_MS = 350;
const WIDTH = 400;

/**
 * A task's title with a card that opens when someone rests on it (or tabs to it): the whole title, read as the things to do, and
 * who it is for, who added it, when it is due, the campaign and where it stands. The browser's plain tooltip showed the title
 * run together on one line and nothing else. The card is for reading: it takes no pointer, so it never gets in the way of the row.
 */
export function TaskTitle({ task, children, className, href, onClick, plain }: {
  task: DayTask;
  children: ReactNode;
  className: string;
  href?: string | null;
  onClick?: () => void;
  plain?: boolean;
}) {
  const session = useSession();
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), DELAY_MS);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("keydown", esc); window.removeEventListener("scroll", hide, true); };
  }, [open]);
  useBeforePaint(() => {
    if (!open || !anchor.current) { setAt(null); return; }
    const r = anchor.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left, window.innerWidth - WIDTH - 12));
    const above = r.bottom + 260 > window.innerHeight && r.top > 280;
    setAt({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  }, [open]);

  const words = taskCardOf(task, { id: session.userId ?? null, name: session.name ?? null });
  const bind = {
    ref: (el: HTMLElement | null) => { anchor.current = el; },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    "aria-describedby": open ? id : undefined,
  };
  const card = open && at && createPortal(
    <div id={id} role="tooltip" className={`th-card${at.above ? " is-above" : ""}`} style={{ left: at.left, top: at.top, width: `min(${WIDTH}px, calc(100vw - 24px))` }}>
      <p className="th-head">{words.heading}</p>
      {words.steps.length > 0 && (
        <ul className="th-steps">{words.steps.map((s, i) => <li key={`${i}-${s}`}>{s}</li>)}</ul>
      )}
      <dl className="th-rows">
        {words.rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
      {words.opens && <p className="th-opens">{words.opens}</p>}
    </div>,
    document.body,
  );
  const body = href
    ? <a className={className} href={href} {...bind} ref={bind.ref as never}>{children}</a>
    : plain
      ? <span className={className} tabIndex={0} {...bind} ref={bind.ref as never}>{children}</span>
      : <button type="button" className={className} onClick={onClick} {...bind} ref={bind.ref as never}>{children}</button>;
  return <>{body}{card}</>;
}

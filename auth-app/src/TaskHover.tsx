import {
  type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import type { DayTask } from "./api/tasks";
import { useSession } from "./roleStore";
import { taskCardOf } from "./taskCard";
import { CARD_WIDTH, type CardAt, HOVER_DELAY_MS, placeCard } from "./taskHover";
import "./taskHover.css";

/* Measuring has to happen before paint; on a server there is nothing to measure. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Whether focus came from the keyboard (a click that focuses a button inside the row is not a reason to open the card). */
const fromKeyboard = (el: EventTarget | null): boolean => {
  if (!(el instanceof Element)) return true;
  try { return el.matches(":focus-visible"); } catch { return true; }
};

/**
 * The card that opens when someone rests on any part of a task, or tabs into it: what it is to do (a title that lists things
 * read as a step to a line), who it is for, who added it, when it is due, the campaign and where it stands. The browser's plain
 * tooltip showed the title run together on one line and nothing else. The card is for reading: it takes no pointer, so it never
 * gets in the way of the row, and it opens above a dialog as well as on a page.
 *
 * It belongs to the whole row, not to one word in it: the title, the campaign, the status, the day and the space between all open it.
 * Spread `bind` on the row and draw `card` anywhere in the same component (it is drawn on the page itself, so where it is written
 * changes nothing). `disabled` keeps it shut while the row is being edited or finished.
 */
export function useTaskHover<E extends HTMLElement>(task: DayTask, disabled = false) {
  const session = useSession();
  const id = useId();
  const anchor = useRef<E | null>(null);
  const cardEl = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<CardAt | null>(null);

  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  const show = () => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (disabled) {
      window.clearTimeout(timer.current);
      setOpen(false);
    }
  }, [disabled]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    /* Only a scroll that moves the task (the page, or something holding it) closes the card; typing in a box elsewhere that scrolls does not. */
    const moved = (e: Event) => {
      const t = e.target;
      if (t === document || (t instanceof Node && anchor.current?.contains(t)) || (t instanceof Node && t.contains(anchor.current))) hide();
    };
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", hide);
    return () => { document.removeEventListener("keydown", esc); window.removeEventListener("scroll", moved, true); window.removeEventListener("resize", hide); };
  }, [open]);
  /* The card is drawn hidden first so its height can be measured, then placed, all before anything is painted. */
  useBeforePaint(() => {
    if (!open) { setAt(null); return; }
    if (!anchor.current || !cardEl.current) return;
    setAt(placeCard(anchor.current.getBoundingClientRect(), pointer.current, { height: cardEl.current.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
  }, [open]);
  /* A screen reader describes the control that has focus, not the row around it: while the card is open it is that control's description. */
  useEffect(() => {
    if (!open) return undefined;
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !anchor.current?.contains(el)) return undefined;
    const before = el.getAttribute("aria-describedby");
    el.setAttribute("aria-describedby", id);
    return () => { if (before === null) el.removeAttribute("aria-describedby"); else el.setAttribute("aria-describedby", before); };
  }, [open, id]);

  const bind = {
    ref: (el: E | null) => { anchor.current = el; },
    onMouseEnter: (e: MouseEvent) => { pointer.current = e.clientX; show(); },
    /* The card opens where the pointer is by the time it opens, not where it entered. */
    onMouseMove: (e: MouseEvent) => { if (!open) pointer.current = e.clientX; },
    onMouseLeave: () => { pointer.current = null; hide(); },
    onFocus: (e: FocusEvent<HTMLElement>) => { if (fromKeyboard(e.target)) show(); },
    /* Moving between the buttons and links inside the row is not leaving it. */
    onBlur: (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide(); },
  };
  /* Its words are made only when it opens: a long list of closed rows spends nothing on them. */
  const words = open ? taskCardOf(task, { id: session.userId ?? null, name: session.name ?? null }) : null;
  const card = open && words && createPortal(
    <div
      ref={cardEl} id={id} role="tooltip" className="th-card"
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden", width: `min(${CARD_WIDTH}px, calc(100vw - 24px))` }}
    >
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
  return { bind, card };
}

/** A task's row, with the card on all of it. */
export function TaskHover({ task, as: Tag = "li", className, style, disabled, children }: {
  task: DayTask;
  as?: "li" | "div";
  className?: string | undefined;
  style?: CSSProperties | undefined;
  disabled?: boolean | undefined;
  children: ReactNode;
}) {
  const { bind, card } = useTaskHover<HTMLElement>(task, disabled);
  return <><Tag className={className} style={style} {...bind}>{children}</Tag>{card}</>;
}

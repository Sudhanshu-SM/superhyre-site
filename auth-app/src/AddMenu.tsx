import { BookOpen, Check, FileText, ListPlus, Table } from "@phosphor-icons/react";
import { type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type AddRow, type AddScope } from "./adding";
import "./bulk.css";
import "./addMenu.css";

/**
 * "What are you adding?": the menu the paperclip opens before the file picker does. The answer travels with the file as data,
 * so nothing is guessed from its name or its contents. The same list, with a tick on the current one, is what a chip's scope
 * opens to change it (only the kinds that file can be). Rows look as the other composer menus do (icon, bold label, one line
 * of help); a row that cannot be chosen says why where its help would be.
 */

/** The layout effect where there is a page to lay out; on the server (the tests draw it so) it is a plain effect. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ICON = { candidates: Table, roles: ListPlus, job_description: FileText, read: BookOpen } as const;

/** A box above its button, kept on the screen, closed by an outside press or Escape (which returns focus to the button). */
function useAbove(anchor: RefObject<HTMLElement>, open: boolean, onClose: () => void, width: number) {
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  useBeforePaint(() => {
    if (!open || !anchor.current) { setAt(null); return; }
    const r = anchor.current.getBoundingClientRect();
    setAt({ left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), bottom: window.innerHeight - r.top + 8 });
  }, [open, anchor, width]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor.current?.focus(); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
  }, [open, anchor, onClose]);
  return { pop, at };
}

/** Arrow keys, Home and End move between the rows of a menu; the first row is focused when it opens. */
function useRoving(open: boolean, box: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const first = box.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
  }, [open, box]);
  return (e: KeyboardEvent<HTMLElement>) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  };
}

/** The rows of the menu, as they are drawn (apart from where they are put): a row that can not be chosen says why where its help would be. */
export function AddList({ rows, onPick, footer }: {
  rows: readonly AddRow[];
  onPick: (row: AddRow) => void;
  footer?: { label: string; onPick: () => void } | undefined;
}) {
  return (
    <>
      <p className="am-cap" id="am-cap">What are you adding?</p>
      <ul className="bulk-list" role="menu" aria-labelledby="am-cap">
        {rows.map((r) => {
          const Icon = ICON[r.scope];
          return (
            <li key={r.scope}>
              <button
                type="button"
                role="menuitem"
                className={`bulk-item am-item${r.disabled ? " is-off" : ""}`}
                aria-disabled={r.disabled ? true : undefined}
                data-scope={r.scope}
                onClick={() => { if (!r.disabled) onPick(r); }}
              >
                <span className="bulk-ico" aria-hidden="true"><Icon size={15} weight="bold" /></span>
                <span className="bulk-l"><b>{r.label}</b><small>{r.disabled ?? r.help}</small></span>
              </button>
            </li>
          );
        })}
      </ul>
      {footer && (
        <button type="button" role="menuitem" className="am-foot" onClick={footer.onPick}>{footer.label}</button>
      )}
    </>
  );
}

export function AddMenu({
  anchor, open, onClose, rows, onPick, footer,
}: {
  /** The paperclip: the menu opens above it and Escape returns focus to it. */
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  rows: readonly AddRow[];
  onPick: (row: AddRow) => void;
  /** A quiet row under the list ("Connect a Google Sheet"). */
  footer?: { label: string; onPick: () => void } | undefined;
}) {
  const { pop, at } = useAbove(anchor, open, onClose, 320);
  const onKey = useRoving(open && !!at, pop);
  if (!open || !at) return null;
  return createPortal(
    <div ref={pop} className="bulk-pop am-pop" style={{ left: at.left, bottom: at.bottom }} onKeyDown={onKey}>
      <AddList rows={rows} onPick={onPick} footer={footer} />
    </div>,
    document.body,
  );
}

/** The kinds a file can be, a tick on the current one. A radio list, since the file is exactly one of them. */
export function ScopeList({ options, value, onPick }: {
  options: ReadonlyArray<{ scope: AddScope; label: string }>;
  value: AddScope | undefined;
  onPick: (scope: AddScope) => void;
}) {
  return (
    <ul className="am-opts" role="menu" aria-label="What this file is">
      {options.map((o) => (
        <li key={o.scope}>
          <button type="button" role="menuitemradio" aria-checked={o.scope === value} className={`am-opt${o.scope === value ? " is-on" : ""}`} onClick={() => onPick(o.scope)}>
            <span className="am-opt-l">{o.label}</span>
            <span className="am-tick" aria-hidden="true">{o.scope === value && <Check size={14} weight="bold" />}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The list on a chip, above its caret. */
export function ScopeMenu({
  anchor, open, onClose, options, value, onPick,
}: {
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  options: ReadonlyArray<{ scope: AddScope; label: string }>;
  value: AddScope | undefined;
  onPick: (scope: AddScope) => void;
}) {
  const { pop, at } = useAbove(anchor, open, onClose, 220);
  const onKey = useRoving(open && !!at, pop);
  if (!open || !at) return null;
  return createPortal(
    <div ref={pop} className="bulk-pop am-pop am-narrow" style={{ left: at.left, bottom: at.bottom }} onKeyDown={onKey}>
      <ScopeList options={options} value={value} onPick={onPick} />
    </div>,
    document.body,
  );
}

import { Check, Database } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SOURCES, SOURCE_MODES, type SourceMode } from "./sources";
import "./sources.css";

/* Measuring has to happen before paint; on a server there is nothing to measure. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Where the next search looks for people, on the composer: a chip that says which (DB only, DB + external,
 * External only) and a small menu above it to change it. It is a control, so it always says what it is set to.
 */

/** The three choices as a list, for the chip's menu and for the docked bar's. */
export function SourcesList({ value, onPick }: { value: SourceMode; onPick: (m: SourceMode) => void }) {
  return (
    <ul className="src-list" role="menu" aria-label="Where to search">
      {SOURCE_MODES.map((m) => (
        <li key={m}>
          <button type="button" role="menuitemradio" aria-checked={m === value} title={SOURCES[m].hint} className={`src-opt${m === value ? " is-on" : ""}`} onClick={() => onPick(m)}>
            <span className="src-l">{SOURCES[m].label}</span>
            <span className="src-tick" aria-hidden="true">{m === value && <Check size={14} weight="bold" />}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SourcesChip({ value, onChange }: { value: SourceMode; onChange: (m: SourceMode) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);

  useBeforePaint(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setAt({ left: Math.max(12, Math.min(r.left, window.innerWidth - 352)), bottom: window.innerHeight - r.top + 8 });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`orc-gslot orc-ctx src-chip${open ? " is-open" : ""}`}
        data-tour="sources-slot"
        title={`Searches look in ${SOURCES[value].says}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="orc-ctx-ico" aria-hidden="true"><Database size={14} weight="bold" /></span>
        <span className="orc-chip-l">{SOURCES[value].label}</span>
      </button>
      {open && at && createPortal(
        <div ref={pop} className="src-pop" style={{ left: at.left, bottom: at.bottom }}>
          <SourcesList value={value} onPick={(m) => { setOpen(false); if (m !== value) onChange(m); }} />
        </div>,
        document.body,
      )}
    </>
  );
}

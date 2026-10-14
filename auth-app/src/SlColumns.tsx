import { Check, Columns } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { Popover } from "./Contacts";

/**
 * Which columns of the Shortlisted table are shown. The name is always there; the rest can be switched off and
 * the choice is remembered on this device. Email and Phone are on by default.
 */

export const SL_COLUMNS = [
  { id: "prof", label: "Profiles" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "status", label: "Status" },
  { id: "owner", label: "Owner" },
  { id: "added", label: "Added" },
  { id: "role", label: "Current role" },
  { id: "org", label: "Organization" },
] as const;
export type SlCol = (typeof SL_COLUMNS)[number]["id"];

const KEY = "superhyre.shortlist.hiddenColumns";

/** The hidden columns as stored: unknown ids are dropped, and a store that cannot be read is "none hidden". */
export function readHidden(raw: string | null): ReadonlySet<SlCol> {
  try {
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const known = new Set<string>(SL_COLUMNS.map((c) => c.id));
    return new Set((Array.isArray(list) ? list : []).filter((x): x is SlCol => typeof x === "string" && known.has(x)));
  } catch {
    return new Set();
  }
}

export function useSlColumns(): { hidden: ReadonlySet<SlCol>; show: (c: SlCol) => boolean; toggle: (c: SlCol) => void } {
  const [hidden, setHidden] = useState<ReadonlySet<SlCol>>(() => {
    try { return readHidden(window.localStorage.getItem(KEY)); } catch { return new Set(); }
  });
  const toggle = useCallback((c: SlCol) => {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(c)) next.delete(c); else next.add(c);
      try { window.localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* the choice holds for this visit */ }
      return next;
    });
  }, []);
  return { hidden, show: (c) => !hidden.has(c), toggle };
}

export function SlColumnsMenu({ hidden, onToggle }: { hidden: ReadonlySet<SlCol>; onToggle: (c: SlCol) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button ref={ref} type="button" className="sl-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Columns size={14} /> Columns
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={200}>
        <div className="sl-menu" role="menu">
          <p className="sl-menu-h">Show columns</p>
          {SL_COLUMNS.map((c) => {
            const on = !hidden.has(c.id);
            return (
              <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={on} className={`sl-menu-i${on ? " is-on" : ""}`} onClick={() => onToggle(c.id)}>
                <span className="sl-ell">{c.label}</span>{on && <Check size={13} weight="bold" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

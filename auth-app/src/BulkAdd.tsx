import { ListPlus, Table, FileText } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./bulk.css";

/**
 * "Add in bulk", on the composer: the two things that are added many at a time. Roles (job descriptions, a spreadsheet
 * of roles, a Google Sheet's link) become campaigns on the import card in the chat; a candidate sheet (the people a team
 * already shared, and where each stands) is brought into the campaign being worked on. The second is only offered with a
 * campaign in the chat that the person may change: a choice that cannot work is not shown. With one choice the button goes
 * straight to it.
 */

export type BulkChoice = "roles" | "candidates";

export const BULK: Record<BulkChoice, { label: string; hint: string }> = {
  roles: {
    label: "Roles into campaigns",
    hint: "Job descriptions or a Google Sheet of roles.",
  },
  candidates: {
    label: "Candidates from a sheet",
    hint: "People your team shared, each put on its stage.",
  },
};

const ICON = { roles: FileText, candidates: Table } as const;

/** The choices as a list, for the composer's chip and for the docked bar's menu. */
export function BulkList({ choices, onPick }: { choices: readonly BulkChoice[]; onPick: (c: BulkChoice) => void }) {
  return (
    <ul className="bulk-list" role="menu" aria-label="Add in bulk">
      {choices.map((c) => {
        const Icon = ICON[c];
        return (
          <li key={c}>
            <button type="button" role="menuitem" className="bulk-item" onClick={() => onPick(c)}>
              <span className="bulk-ico" aria-hidden="true"><Icon size={15} weight="bold" /></span>
              <span className="bulk-l"><b>{BULK[c].label}</b><small>{BULK[c].hint}</small></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function BulkChip({ choices, onPick }: { choices: readonly BulkChoice[]; onPick: (c: BulkChoice) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setAt({ left: Math.max(12, Math.min(r.left, window.innerWidth - 372)), bottom: window.innerHeight - r.top + 8 });
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

  if (choices.length === 0) return null;
  const pick = (c: BulkChoice) => { setOpen(false); onPick(c); };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`orc-gslot orc-ctx${open ? " is-open" : ""}`}
        data-tour="bulk-slot"
        title={choices.length === 1 ? BULK[choices[0]!].hint : "Add many roles, or a sheet of candidates, at once"}
        aria-haspopup={choices.length > 1 ? "menu" : undefined}
        aria-expanded={choices.length > 1 ? open : undefined}
        onClick={() => (choices.length === 1 ? pick(choices[0]!) : setOpen((o) => !o))}
      >
        <span className="orc-ctx-ico" aria-hidden="true"><ListPlus size={14} weight="bold" /></span>
        <span className="orc-chip-l">Add in bulk</span>
      </button>
      {open && at && createPortal(
        <div ref={pop} className="bulk-pop" style={{ left: at.left, bottom: at.bottom }}>
          <BulkList choices={choices} onPick={pick} />
        </div>,
        document.body,
      )}
    </>
  );
}

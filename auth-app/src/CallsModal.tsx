import { MagnifyingGlass, PhoneCall, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { CallFilters, CallOutcome, CallRow } from "./api/calls";
import { listCalls } from "./api/calls";
import { LIVE } from "./api/client";
import { CallLine } from "./CallLine";
import { fixtureRows } from "./callsFixtures";
import { callCount, campaignInitials, OUTCOME_FILTERS, ROW_PAGE } from "./callsView";
import { Pager } from "./components/Pager";
import { clampedOffset } from "./sectionState";
import { KlRowsGhost } from "./klGhosts";
import { Dialog } from "./ui";

/**
 * All of one campaign's calls, in a dialog: for a campaign with more calls than its card shows. Its own search
 * box and outcome filter (starting from the page's), the same line as the list, Down from the search box and Up
 * and Down between lines, Enter opens the call in the sheet. A phone gets the whole screen (the dialog's own rule).
 * It reads a numbered page at a time (the pager sits in its toolbar, with the whole count). Closing the sheet brings
 * this back where it was: the same words, the same filter, the call that was open. It is as quiet as the list: neutral chip, plain count, no colour of its own.
 */

export type ModalGroup = { id: string; name: string; client: string | null; count: number };

type Props = {
  group: ModalGroup | null;
  /** The page's date and caller filters: they hold here too. */
  filters: Pick<CallFilters, "from" | "to" | "callerId" | "outcome">;
  /** The word the page was searching for, which the box starts with (empty when it only matched the campaign's name). */
  initialQ: string;
  /** The outcome the filter starts at: the page's, or what it was when a call was opened from here. */
  initialOutcome?: CallOutcome | "" | undefined;
  /** A call to put focus back on once the lines are read (the one just closed in the sheet). */
  focusId?: string | null | undefined;
  showCaller: boolean;
  onOpen: (r: CallRow) => void;
  /** Where the box and the filter stand, so the page can bring the dialog back as it was. */
  onView?: ((v: { q: string; outcome: CallOutcome | "" }) => void) | undefined;
  onClose: () => void;
};

export function CallsModal({ group, onClose, ...rest }: Props) {
  return (
    <Dialog open={group !== null} onClose={onClose} label={group ? `All calls for ${group.name}` : "Calls"} size="md">
      {group && <ModalBody key={group.id} group={group} {...rest} />}
    </Dialog>
  );
}

function ModalBody({ group, filters, initialQ, initialOutcome, focusId, showCaller, onOpen, onView }: Omit<Props, "onClose" | "group"> & { group: ModalGroup }) {
  const [q, setQ] = useState(initialQ);
  const [outcome, setOutcome] = useState<CallOutcome | "">(initialOutcome ?? filters.outcome ?? "");
  const [dq, setDq] = useState(initialQ.trim());
  const [state, setState] = useState<{ items: CallRow[]; total: number | null; phase: "loading" | "ready" | "failed" }>({
    items: [], total: null, phase: "loading",
  });
  const asked = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDq(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => { onView?.({ q, outcome }); }, [q, outcome, onView]);

  /* The search box takes focus once the dialog has taken its own (on a phone it does not: the keyboard would cover
     the lines). When a call has just been closed, that call's line takes it instead, below. */
  useEffect(() => {
    if (focusId || window.matchMedia("(pointer: coarse)").matches) return;
    const id = window.setTimeout(() => search.current?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(id);
  }, [focusId]);

  const f: CallFilters = { ...filters, campaignId: group.id, q: dq || undefined, outcome: outcome || undefined };
  const key = JSON.stringify(f);
  /* The page belongs to the filters it was chosen in: another word or outcome is page 1 again. */
  const [paged, setPaged] = useState<{ key: string; offset: number }>({ key, offset: 0 });
  const at = paged.key === key ? paged.offset : 0;
  useEffect(() => {
    const mine = ++asked.current;
    setState((s) => ({ ...s, phase: s.items.length ? s.phase : "loading" }));
    const page = { limit: ROW_PAGE, offset: at };
    const read = LIVE ? listCalls(f, page) : Promise.resolve(fixtureRows(f, page));
    read.then(
      (got) => { if (mine === asked.current) setState({ items: got.calls, total: got.total, phase: "ready" }); },
      () => { if (mine === asked.current) setState((s) => ({ ...s, phase: s.items.length ? "ready" : "failed" })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, at]);
  /* A list that has got shorter than the page asked for goes back to its last page. */
  useEffect(() => {
    if (state.total === null) return;
    const held = clampedOffset(at, state.total, ROW_PAGE);
    if (held !== at) setPaged({ key, offset: held });
  }, [state.total, at, key]);

  // The call that was open when this was last closed gets its focus back, once its line is there.
  useEffect(() => {
    if (!focusId || focused.current || state.phase !== "ready") return;
    const el = list.current?.querySelector<HTMLElement>(`[data-kl-row="${CSS.escape(focusId)}"]`);
    if (!el) return;
    focused.current = true;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }, [focusId, state.phase, state.items]);

  /* Up and Down walk the lines, and Down from the search box goes into them; Enter (the button's own) opens the
     call. Typing and the outcome list keep their own arrows. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const t = e.target as HTMLElement;
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("[data-kl-row]") ?? [])];
    if (t.closest("select, textarea")) return;
    if (t.closest("input")) {
      if (e.key === "ArrowDown" && rows[0]) { e.preventDefault(); rows[0].focus(); rows[0].scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (!rows.length) return;
    const at = rows.indexOf(t.closest<HTMLElement>("[data-kl-row]") as HTMLElement);
    if (e.key === "ArrowUp" && at === 0) { e.preventDefault(); search.current?.focus(); return; }
    const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? (e.key === "ArrowDown" ? 0 : rows.length - 1) : at + (e.key === "ArrowDown" ? 1 : -1)))];
    e.preventDefault();
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };

  const narrowed = Boolean(dq || outcome || filters.from || filters.to || filters.callerId);
  return (
    <div className="klm" onKeyDown={onKeyDown}>
      <header className="klm-head">
        <span className="kl-gchip" aria-hidden="true">{group.id === "none" ? <PhoneCall size={16} weight="bold" /> : campaignInitials(group.name)}</span>
        <div className="klm-titles">
          <h2 className="klm-title kl-ell">{group.name}</h2>
          <p className="klm-meta">
            {group.client && <span className="kl-ell">{group.client}</span>}
            <span className="klm-count">
              {state.phase === "ready" && narrowed && state.total !== null ? `${state.total.toLocaleString("en-IN")} of ${callCount(group.count)}` : callCount(group.count)}
            </span>
          </p>
        </div>
      </header>
      <div className="klm-bar" role="search">
        <label className="kl-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these calls" aria-label="Search these calls" />
          {q && <button type="button" className="kl-search-x" onClick={() => { setQ(""); search.current?.focus(); }} aria-label="Clear search"><X size={11} weight="bold" /></button>}
        </label>
        <label className="kl-pick">
          <span className="sr-only">Outcome</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome | "")} aria-label="Outcome">
            <option value="">All outcomes</option>
            {OUTCOME_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {state.total !== null && state.total > ROW_PAGE && (
          <Pager offset={at} limit={ROW_PAGE} total={state.total} unit="calls" target=".klm-rows" onChange={(o) => setPaged({ key, offset: o })} />
        )}
      </div>
      <div className="klm-body">
        {state.phase === "loading" && state.items.length === 0 && <KlRowsGhost variant="modal" n={5} label="Loading calls" />}
        {state.phase === "failed" && <p className="t-body kl-quiet kl-pad">These calls couldn't be loaded. Close this and try again in a moment.</p>}
        {state.phase === "ready" && state.items.length === 0 && <p className="t-body kl-quiet kl-pad">{narrowed ? "No calls match." : "No calls here yet."}</p>}
        {state.items.length > 0 && (
          <ul ref={list} className="kl-rows klm-rows">
            {state.items.map((r) => (
              <li key={r.id}><CallLine r={r} on={false} showCaller={showCaller} hit={dq} onOpen={onOpen} /></li>
            ))}
          </ul>
        )}
        {state.total !== null && state.total > ROW_PAGE && (
          <Pager offset={at} limit={ROW_PAGE} total={state.total} unit="calls" target=".klm-rows" variant="foot" onChange={(o) => setPaged({ key, offset: o })} />
        )}
      </div>
    </div>
  );
}

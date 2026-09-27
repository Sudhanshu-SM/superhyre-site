import { X } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AXIS_FROM, Avatar, Career, FitMark, Verdicts } from "./CandidateBits";
import type { Candidate, Verdict } from "./sourcing";
import { CANDIDATES, CRITERIA, CRITERIA_SHORT, REASON, TOTAL_MATCHES } from "./sourcing";

/**
 * RankedMatches — the ranked list, as a dialog in the middle of the page.
 *
 * ── A LIST YOU READ DOWN, NOT ACROSS ─────────────────────────────────────────
 * Each row used to be a small document: three roles as sentences, a school,
 * and a highlighted paragraph. Twelve of those is a wall. What a recruiter
 * does here is COMPARE, so the row keeps only what compares and puts each of
 * those in a column:
 *
 *   career   every employer on one shared fourteen-year axis, so tenure and
 *            career length are read by length, not by parsing dates
 *   fit      one mark per ranking criterion, under a header that names each
 *            criterion once instead of on every row
 *   reason   the single sentence that explains the rank
 *
 * Everything else is one click away in the profile sidebar, which opens
 * BESIDE this dialog on a wide screen — the dialog slides left to make room —
 * so the list stays in view while you read a profile.
 *
 * ── TRIAGE IS THE JOB, SO IT GETS A STRIP AND THE KEYBOARD ─────────────────
 * The strip under the title is the batch at a glance: one segment per match,
 * filled as you shortlist or reject, and each segment jumps to its row. The
 * keyboard does the rest without the mouse: ↑↓ to move, Enter to open, S to
 * shortlist, X to reject.
 */

type Filter = "all" | "todo" | "shortlisted" | "rejected";

const EXIT_MS = 220;
/** Must match `--ps-w` in candidates.css: the sidebar the dialog makes room for. */
const SIDEBAR_W = 520;

export function RankedMatches({
  open, onClose, verdicts, onVerdict, activeId, onOpen,
}: {
  open: boolean;
  onClose: () => void;
  verdicts: Readonly<Record<string, Verdict>>;
  onVerdict: (id: string, v: Verdict | null) => void;
  /** The profile open beside the dialog, if any. */
  activeId: string | null;
  /** Open a profile. `ids` is the list the sidebar's arrows should walk. */
  onOpen: (id: string, ids: readonly string[]) => void;
}): JSX.Element | null {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [cursor, setCursor] = useState(0);
  const [fits, setFits] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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

  /* On `mounted` as well as `open`: on the first open the panel is not in
     the tree yet when `open` flips, and focus would stay on the button that
     opened it — where Enter means "press this button", not "open the row". */
  useEffect(() => {
    if (open && mounted) panelRef.current?.focus({ preventScroll: true });
  }, [open, mounted]);

  /* Whether the dialog and the sidebar fit side by side. When they do not,
     the sidebar overlays the dialog instead of shoving it off screen. */
  useLayoutEffect(() => {
    if (!mounted) return;
    const measure = () => {
      const w = panelRef.current?.offsetWidth ?? 860;
      setFits(w <= window.innerWidth - SIDEBAR_W - 16 - 32);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [mounted]);

  const list = CANDIDATES.filter((c) => {
    const v = verdicts[c.id];
    if (filter === "todo") return !v;
    if (filter === "all") return true;
    return v === filter;
  });
  const ids = list.map((c) => c.id);
  const at = Math.min(cursor, Math.max(0, list.length - 1));

  const counts = {
    all: CANDIDATES.length,
    todo: CANDIDATES.filter((c) => !verdicts[c.id]).length,
    shortlisted: CANDIDATES.filter((c) => verdicts[c.id] === "shortlisted").length,
    rejected: CANDIDATES.filter((c) => verdicts[c.id] === "rejected").length,
  };

  /* The cursor follows the open profile, so closing the sidebar leaves you on
     the row you were reading. */
  useEffect(() => {
    if (!activeId) return;
    const i = ids.indexOf(activeId);
    if (i >= 0) setCursor(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const reveal = useCallback((i: number) => {
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = list[at];
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
        case "j":
          e.preventDefault();
          setCursor(Math.min(at + 1, list.length - 1));
          reveal(Math.min(at + 1, list.length - 1));
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          setCursor(Math.max(at - 1, 0));
          reveal(Math.max(at - 1, 0));
          break;
        case "Enter":
          if (c && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); onOpen(c.id, ids); }
          break;
        case "s":
          if (c) onVerdict(c.id, verdicts[c.id] === "shortlisted" ? null : "shortlisted");
          break;
        case "x":
          if (c) onVerdict(c.id, verdicts[c.id] === "rejected" ? null : "rejected");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, list, at, ids, verdicts, onVerdict, onOpen, onClose, reveal]);

  if (!mounted) return null;

  const docked = !!activeId && open;

  return createPortal(
    <div className={`rm${leaving ? " is-leaving" : ""}${docked ? (fits ? " is-docked" : " is-covered") : ""}`}>
      <div className="rm-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="rm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rm-title"
        tabIndex={-1}
        style={{ ["--rm-shift" as string]: `${(SIDEBAR_W + 16) / 2}px` }}
      >
        <header className="rm-head">
          <div className="rm-head-row">
            <div>
              <h2 id="rm-title" className="rm-title">Ranked matches</h2>
              <p className="rm-sub">
                Top {CANDIDATES.length} of {TOTAL_MATCHES.toLocaleString("en-IN")} · Senior Backend Engineers
              </p>
            </div>
            <button type="button" className="rm-close" aria-label="Close (Esc)" title="Close (Esc)" onClick={onClose}>
              <X size={16} weight="bold" />
            </button>
          </div>

          <Triage
            verdicts={verdicts}
            onJump={(id) => {
              setFilter("all");
              const i = CANDIDATES.findIndex((c) => c.id === id);
              setCursor(i);
              requestAnimationFrame(() => reveal(i));
            }}
          />

          <div className="rm-filters" role="tablist" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["todo", "To review"],
                ["shortlisted", "Shortlisted"],
                ["rejected", "Rejected"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`rm-filter${filter === id ? " is-on" : ""}`}
                onClick={() => { setFilter(id); setCursor(0); }}
              >
                {label}
                <span className="rm-filter-n">{counts[id]}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="rm-cols" aria-hidden="true">
          <span className="rm-col-rank">#</span>
          <span className="rm-col-who">Candidate</span>
          <span className="rm-col-career">Career <i>{AXIS_FROM} → now</i></span>
          {CRITERIA_SHORT.map((s, i) => (
            <span key={s} className="rm-col-fit" title={CRITERIA[i]}>{s}</span>
          ))}
          <span />
        </div>

        <div className="rm-body">
          {list.length === 0 ? (
            <p className="rm-empty">{EMPTY[filter]}</p>
          ) : (
            <ul className="rm-rows" ref={listRef}>
              {list.map((c, i) => (
                <li key={c.id} style={{ animationDelay: `${Math.min(i, 10) * 24}ms` }}>
                  <Row
                    c={c}
                    rank={CANDIDATES.indexOf(c) + 1}
                    verdict={verdicts[c.id]}
                    onVerdict={(v) => onVerdict(c.id, v)}
                    active={c.id === activeId}
                    cursor={i === at}
                    onOpen={() => { setCursor(i); onOpen(c.id, ids); }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="rm-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>S</kbd> shortlist</span>
          <span><kbd>X</kbd> reject</span>
          <span className="rm-foot-right"><kbd>Esc</kbd> close</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const EMPTY: Record<Filter, string> = {
  all: "No matches.",
  todo: "Every match has a verdict. Nothing left to review.",
  shortlisted: "Nobody shortlisted yet. Press S on a row, or use the bookmark.",
  rejected: "Nobody rejected yet.",
};

/* ── the triage strip ────────────────────────────────────────────────────── */

function Triage({
  verdicts, onJump,
}: {
  verdicts: Readonly<Record<string, Verdict>>;
  onJump: (id: string) => void;
}) {
  const done = CANDIDATES.filter((c) => verdicts[c.id]).length;
  const short = CANDIDATES.filter((c) => verdicts[c.id] === "shortlisted").length;
  return (
    <div className="rm-triage">
      <div className="rm-triage-strip">
        {CANDIDATES.map((c, i) => {
          const v = verdicts[c.id];
          return (
            <button
              key={c.id}
              type="button"
              className={`rm-seg${v ? ` is-${v}` : ""}`}
              aria-label={`#${i + 1} ${c.name}${v ? `, ${v}` : ", not reviewed"}`}
              title={`#${i + 1} ${c.name}`}
              onClick={() => onJump(c.id)}
            />
          );
        })}
      </div>
      <p className="rm-triage-l">
        <b>{done}</b> of {CANDIDATES.length} reviewed
        {short > 0 && <> · <span className="rm-triage-short">{short} shortlisted</span></>}
      </p>
    </div>
  );
}

/* ── a row ───────────────────────────────────────────────────────────────── */

function Row({
  c, rank, verdict, onVerdict, active, cursor, onOpen,
}: {
  c: Candidate;
  rank: number;
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  active: boolean;
  cursor: boolean;
  onOpen: () => void;
}) {
  const now = c.jobs[0]!;
  return (
    <article
      className={`rm-row${verdict ? ` is-${verdict}` : ""}${active ? " is-active" : ""}${cursor ? " is-cursor" : ""}`}
    >
      <button type="button" className="rm-row-hit" onClick={onOpen} aria-label={`Open ${c.name}'s profile`} />
      <span className="rm-rank">{String(rank).padStart(2, "0")}</span>
      <div className="rm-who">
        <Avatar name={c.name} hue={c.hue} size={34} />
        <div className="rm-who-id">
          <p className="rm-name">
            {c.name}
            {c.openToWork && <span className="rm-otw" title="Open to work">Open</span>}
          </p>
          <p className="rm-role">{now.roles[0]!.title} · {now.org.name}</p>
        </div>
      </div>
      <div className="rm-career"><Career c={c} /></div>
      {c.meets.map((m, i) => (
        <span key={i} className="rm-fit"><FitMark met={m} label={CRITERIA[i]!} /></span>
      ))}
      <div className="rm-acts">
        <Verdicts verdict={verdict} onVerdict={onVerdict} name={c.name} icons />
      </div>
      <p className="rm-reason">{REASON[c.id]}</p>
    </article>
  );
}

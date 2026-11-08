import { useEffect, useMemo, useRef, useState } from "react";
import type { CandidateSet } from "./liveCandidate";
import { CandidateCard } from "./Sourcing";
import type { Verdict } from "./sourcing";
import "./sourcing.css";

/**
 * The campaign's Sourced page as the chat's own person cards: the same card (who, experience, education, skills, one line on
 * why), in a grid, with a tab for each pile (all, to review, shortlisted, rejected). Twenty first, then more each time the end
 * of the list comes into view. A card opens the profile beside the list, and the profile's arrows walk the pile shown.
 */

type Filter = "all" | "todo" | "shortlisted" | "rejected";

/** Cards drawn first, and how many more reaching the end adds. */
const FIRST = 20;
const STEP = 20;

const TABS: ReadonlyArray<readonly [Filter, string]> = [
  ["all", "All"],
  ["todo", "To review"],
  ["shortlisted", "Shortlisted"],
  ["rejected", "Rejected"],
];

const EMPTY: Record<Filter, string> = {
  all: "No one found yet.",
  todo: "Everyone has a decision. Nothing left to review.",
  shortlisted: "Nobody shortlisted yet.",
  rejected: "Nobody rejected yet.",
};

export function SourcedCards({
  set, verdicts: made, onVerdict, activeId, onOpen, scoring = false, onScoreRest, autoSelect = false,
}: {
  set: CandidateSet;
  verdicts: Readonly<Record<string, Verdict>>;
  onVerdict: (id: string, v: Verdict | null) => void;
  activeId: string | null;
  onOpen: (id: string, ids: readonly string[]) => void;
  /** People are being read right now: said, and nothing to press. */
  scoring?: boolean;
  onScoreRest?: (() => void) | undefined;
  /** The first person's profile opens as soon as the list is there (once per campaign). */
  autoSelect?: boolean;
}): JSX.Element {
  /* What the server says was decided, with this session's calls on top: a decided person stays in the counts. */
  const verdicts = useMemo<Readonly<Record<string, Verdict>>>(() => ({ ...(set.decisions ?? {}), ...made }), [set.decisions, made]);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(FIRST);
  const all = set.candidates;
  const list = all.filter((c) => {
    const v = verdicts[c.id];
    if (filter === "all") return true;
    if (filter === "todo") return !v;
    return v === filter;
  });
  const counts: Record<Filter, number> = {
    all: all.length,
    todo: all.filter((c) => !verdicts[c.id]).length,
    shortlisted: all.filter((c) => verdicts[c.id] === "shortlisted").length,
    rejected: all.filter((c) => verdicts[c.id] === "rejected").length,
  };
  const shown = list.slice(0, limit);
  const left = list.length - shown.length;
  const ids = list.map((c) => c.id);
  const unscored = all.filter((c) => c.scored === false).length;
  const asFound = all.filter((c) => c.scored === false && c.listedAsFound).length;

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (left <= 0) return;
    const end = endRef.current;
    if (!end || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) setLimit((n) => n + STEP);
    }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(end);
    return () => io.disconnect();
  }, [left, shown.length]);

  /* The first person beside the list, once per campaign: someone who closes the profile has chosen to read the list alone. */
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSelect || activeId || all.length === 0 || opened.current === (set.campaignId ?? "list")) return;
    opened.current = set.campaignId ?? "list";
    onOpen(all[0]!.id, all.map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, all.length]);

  return (
    <section className="spc" aria-label="People found">
      <div className="spc-bar">
        <div className="spc-tabs" role="tablist" aria-label="Show">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`spc-tab${filter === id ? " is-on" : ""}`}
              onClick={() => { setFilter(id); setLimit(FIRST); }}
            >
              {label}
              <span className="spc-tab-n">{counts[id]}</span>
            </button>
          ))}
        </div>
        {unscored > 0 && (
          <p className="spc-note" role="status">
            {scoring
              ? <><b>{unscored}</b> still to read. People move into place as each group is scored.</>
              : asFound === unscored
                ? <><b>{unscored}</b> listed in the order they were found, not scored.</>
                : <><b>{unscored}</b> not read closely yet, ordered by keywords, years and place.</>}
            {!scoring && onScoreRest && <button type="button" className="rep-opt" onClick={onScoreRest}>Score the rest</button>}
          </p>
        )}
      </div>

      {list.length === 0 ? (
        <p className="spc-empty">{EMPTY[filter]}</p>
      ) : (
        <div className="src-people spc-list">
        <ul className="src-cards">
          {shown.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i % STEP, 8) * 30}ms` }}>
              <CandidateCard
                c={c}
                verdict={verdicts[c.id]}
                onVerdict={(v) => onVerdict(c.id, v)}
                onOpen={() => onOpen(c.id, ids)}
                selected={c.id === activeId}
                {...(c.scored === false
                  ? { reason: "", criteria: [] as readonly string[], short: [] as readonly string[] }
                  : { reason: set.reasons[c.id] ?? "", criteria: set.criteria.map((x) => x.text), short: set.criteria.map((x) => x.short) })}
              />
            </li>
          ))}
        </ul>
        </div>
      )}
      {list.length > 0 && (
        <div ref={endRef} className="spc-end" aria-live="polite">
          {left > 0 ? `Loading ${Math.min(left, STEP)} more of ${left}` : list.length > FIRST ? `All ${list.length} shown` : ""}
        </div>
      )}
    </section>
  );
}

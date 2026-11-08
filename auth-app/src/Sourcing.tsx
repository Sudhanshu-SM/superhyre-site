import {
  ArrowRight, ArrowsClockwise, Briefcase, CaretDown, CaretRight, Check, CheckCircle,
  FunnelSimple, GraduationCap, LinkedinLogo, Sparkle, X,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { StageView } from "./Stages";
import { Stages } from "./Stages";
import type { Candidate, Filter, Glance, Phase, Verdict } from "./sourcing";
import { plainText } from "./displayText";
import {
  CANDIDATES, CRITERIA, FILTERS, PLAN_PHASES, PREVIEW_COUNT, REASON, RUN_PHASES, TOTAL_MATCHES,
} from "./sourcing";
import { Avatar, FitMark, FitState, Verdicts } from "./CandidateBits";
import { Loader } from "./components/Loader";
import { Shimmer } from "./components/Shimmer";
import "./sourcing.css";

/**
 * SourcingRun — what a sourcing brief looks like while the agent works it.
 *
 * The sequence is fixed and every step is visible:
 *
 *   plan      two phases, each a live line that settles into a disclosure
 *             ("Built the initial search for 3s") and the agent's paragraph
 *   confirm   the search it proposes, as filters and criteria you can change,
 *             and nothing runs until you press Run search
 *   run       two more phases, same shape as the plan
 *   results   three profiles to react to, and the way into the full list
 *
 * Each phase's duration is MEASURED from when its live line appeared to when
 * it settled, the same rule the "Thought for Ns" line follows. The hold times
 * in sourcing.ts decide how long a phase lasts; they are never printed.
 *
 * Later blocks are MOUNTED late rather than rendered transparent. A block that
 * is present but invisible still takes its height, which reads as a blank gap
 * under the paragraph while it is still being written.
 */

type Step =
  | { kind: "phase"; phase: Phase }
  | { kind: "confirm" }
  | { kind: "results" };

const SEQUENCE: readonly Step[] = [
  ...PLAN_PHASES.map((phase) => ({ kind: "phase" as const, phase })),
  { kind: "confirm" },
  ...RUN_PHASES.map((phase) => ({ kind: "phase" as const, phase })),
  { kind: "results" },
];

/* Per-word delay for a paragraph being written, and the ceiling on the whole
   paragraph so a long one does not hold the next step back. */
const WORD_MS = 14;
const WRITE_CAP = 900;

export const writeMs = (text: string): number =>
  Math.min(text.split(/\s+/).length * WORD_MS, WRITE_CAP);

/** "{n}" in a phase's copy is the live match count, so the copy tracks the filters. */
const fill = (text: string, n: number): string => text.replace(/\{n\}/g, n.toLocaleString("en-IN"));

export type SourcingRunProps = {
  /** The page decides what shortlisting means; this component only asks. */
  verdicts: Readonly<Record<string, Verdict>>;
  onVerdict: (id: string, v: Verdict | null) => void;
  onOpenProfile: (id: string) => void;
  onOpenList: () => void;
  /** Fired once, when the plan is ready: this is when the agent is deployed. */
  onPlanned: () => void;
  /** True while something is running, so the mark can show it is working. */
  onBusy: (busy: boolean) => void;
  /** The transcript grew; keep the newest part in view. */
  onGrow: () => void;
};

export function SourcingRun({
  verdicts, onVerdict, onOpenProfile, onOpenList, onPlanned, onBusy, onGrow,
}: SourcingRunProps): JSX.Element {
  const [at, setAt] = useState(0);
  const [took, setTook] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [criteria, setCriteria] = useState<readonly string[]>(CRITERIA);
  const startedAt = useRef(Date.now());
  const planned = useRef(false);

  /* Removing a filter widens the search. A fixture figure, but a consistent
     one: the card, the phases and the results header all read this. */
  const matches = Math.round(TOTAL_MATCHES * (1 + removed.length * 0.62));

  const step = SEQUENCE[at];

  /* ── ADVANCE ──
     A phase holds for its `ms`, records the time it actually took, and then
     waits for its paragraph to finish writing before the next step mounts. */
  useEffect(() => {
    if (!step || step.kind !== "phase") return;
    startedAt.current = Date.now();
    const { phase } = step;
    let next = 0;
    const hold = window.setTimeout(() => {
      setTook((t) => ({ ...t, [phase.id]: Date.now() - startedAt.current }));
      next = window.setTimeout(() => setAt((a) => a + 1), writeMs(phase.says) + 260);
    }, phase.ms);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(next);
    };
  }, [step]);

  /* The plan is ready the moment the confirm card mounts, and that is when a
     sourcing agent goes to work on the campaign. Once, even under StrictMode. */
  useEffect(() => {
    if (step?.kind === "confirm" && !planned.current) {
      planned.current = true;
      onPlanned();
    }
  }, [step, onPlanned]);

  const busy = step?.kind === "phase";
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);

  useEffect(() => { onGrow(); }, [at, took, onGrow]);

  const confirmAt = SEQUENCE.findIndex((s) => s.kind === "confirm");
  const ran = at > confirmAt;
  const track = stagesFor({ step, took, ran, matches, criteria: criteria.length, verdicts });

  return (
    <div className="src">
      <Stages goal="Shortlist senior backend engineers" {...track} />
      {SEQUENCE.slice(0, at + 1).map((s, i) => {
        if (s.kind === "phase") {
          const ms = took[s.phase.id];
          return (
            <PhaseBlock key={s.phase.id} phase={s.phase} tookMs={ms} n={matches} />
          );
        }
        if (s.kind === "confirm") {
          return (
            <SearchCard
              key="confirm"
              locked={ran}
              matches={matches}
              removed={removed}
              onRemove={(id) => setRemoved((r) => [...r, id])}
              onReset={() => { setRemoved([]); setCriteria(CRITERIA); }}
              criteria={criteria}
              onCriteria={setCriteria}
              onRun={() => { if (i === at) setAt((a) => a + 1); }}
            />
          );
        }
        return (
          <Results
            key="results"
            matches={matches}
            verdicts={verdicts}
            onVerdict={onVerdict}
            onOpenProfile={onOpenProfile}
            onOpenList={onOpenList}
          />
        );
      })}
    </div>
  );
}

/* ── stages ──────────────────────────────────────────────────────────────── */

/** Where the run stands, as the three legs of the goal. Derived, never stored. */
function stagesFor({ step, took, ran, matches, criteria, verdicts }: {
  step: Step | undefined;
  took: Readonly<Record<string, number>>;
  ran: boolean;
  matches: number;
  criteria: number;
  verdicts: Readonly<Record<string, Verdict>>;
}): { stages: StageView[]; reached: boolean; summary: string } {
  const n = matches.toLocaleString("en-IN");
  const running = step?.kind === "phase" && took[step.phase.id] == null ? step.phase : null;

  /* Searching has four parts: brief, build, the recruiter's Run, the scan. */
  const searchParts = [took.brief != null, took.build != null, ran, took.search != null];
  const searchDone = searchParts.filter(Boolean).length;
  const searching: StageView = {
    id: "search",
    progress: searchDone / 4,
    creep: running && ["brief", "build", "search"].includes(running.id) ? { to: (searchDone + 1) / 4, ms: running.ms } : undefined,
    state: took.search != null ? "done" : step?.kind === "confirm" ? "wait" : "live",
    note: took.search != null ? "Found"
      : step?.kind === "confirm" ? "Waiting for you to run it"
      : running?.id === "brief" ? "Reading your brief"
      : running?.id === "build" || took.build == null ? "Building the search"
      : `Scanning ${n} profiles`,
  };

  const matching: StageView = {
    id: "match",
    progress: took.calibrate != null ? 1 : 0,
    creep: running?.id === "calibrate" ? { to: 1, ms: running.ms } : undefined,
    state: took.calibrate != null ? "done" : took.search != null ? "live" : "todo",
    note: took.calibrate != null ? "Done"
      : took.search != null ? `Ranking on ${criteria} criteria`
      : "Rank on your criteria",
  };

  const preview = CANDIDATES.slice(0, PREVIEW_COUNT);
  const called = preview.filter((c) => verdicts[c.id]);
  const kept = called.filter((c) => verdicts[c.id] === "shortlisted").length;
  const atResults = step?.kind === "results";
  const reached = atResults && called.length === preview.length;
  const deciding: StageView = {
    id: "decide",
    progress: called.length / preview.length,
    state: reached ? "done" : atResults ? "wait" : "todo",
    /* Nothing is said until it is finished: the count is the header's, once the goal is reached. */
    note: reached ? "Done" : "",
  };

  return {
    stages: [searching, matching, deciding],
    reached,
    summary: kept ? `Goal reached · ${kept} shortlisted` : "Goal reached",
  };
}

/* ── a phase ─────────────────────────────────────────────────────────────── */

/**
 * Live, it is a spinner, a shimmering label and a ticking counter. Done, the
 * spinner becomes a check in the same box, the label goes past tense, and the
 * line becomes the trigger for what the phase turned up.
 */
export function PhaseBlock({ phase, tookMs, n }: { phase: Phase; tookMs?: number; n: number }) {
  const done = tookMs !== undefined;
  const [open, setOpen] = useState(false);
  const panel = useId();

  if (!done) {
    return (
      <div className="src-phase is-live" aria-live="polite">
        <span className="src-phase-icon" aria-hidden="true"><Loader size="sm" /></span>
        <span>{fill(phase.live, n).trim() || "Working on it"}</span>
      </div>
    );
  }

  /* The time is its own muted token, never part of the sentence. */
  const secs = `${Math.max(0.1, tookMs / 1000).toFixed(1)}s`;
  return (
    <div className="src-block">
      <button
        type="button"
        className="src-phase is-done"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="src-phase-icon" aria-hidden="true">
          <CheckCircle size={17} weight="regular" />
        </span>
        <span>{fill(phase.done, n)}</span>
        {open
          ? <CaretDown size={12} weight="bold" aria-hidden="true" />
          : <CaretRight size={12} weight="bold" aria-hidden="true" />}
        {phase.timed !== false && <span className="src-took">{secs}</span>}
      </button>
      {open && (
        <ul className="src-steps" id={panel}>
          {phase.steps.map((s) => <li key={s}>{fill(s, n)}</li>)}
        </ul>
      )}
      {phase.says && <Written text={fill(phase.says, n)} />}
    </div>
  );
}

/**
 * A paragraph that writes itself in, word by word.
 *
 * Every word is in the DOM from the first frame, each with its own delay, so
 * the paragraph's height is final immediately and nothing below it reflows
 * while it is written. CSS only: no state, no re-render per word.
 */
export function Written({ text, className = "src-para" }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <p className={className} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="src-word"
          style={{ animationDelay: `${Math.min(i * WORD_MS, WRITE_CAP)}ms` }}
        >
          {w}{i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

/* ── the proposed search ─────────────────────────────────────────────────── */

/**
 * A connected campaign's own search, in place of the demo's editable fixtures: the role spec's
 * filters and criteria, read-only (the spec is edited in the campaign, not here).
 */
export type FixedSearch = {
  filters: readonly Filter[];
  criteria: readonly string[];
  /** What the filters come from, after "I've set these Filters …". */
  basis: string;
  /** In the lede's brackets, e.g. "up to 20 people". Omitted when there is no figure to give. */
  count: string | null;
  /** A search already ran: the card is its record, with no button. */
  ran: boolean;
  ranLine: string;
  /** What the search can't do right now, in plain words. */
  note: string | null;
  /** Absent when there is nothing to run. */
  run: { label: string; busy?: boolean } | null;
  /** Opens the campaign, where the spec is edited. */
  onEdit?: () => void;
};

export function SearchCard({
  locked = false, matches = 0, removed = [], onRemove = () => {}, onReset = () => {}, criteria = CRITERIA, onCriteria = () => {}, onRun, fixed,
}: {
  locked?: boolean;
  matches?: number;
  removed?: readonly string[];
  onRemove?: (id: string) => void;
  onReset?: () => void;
  criteria?: readonly string[];
  onCriteria?: (c: readonly string[]) => void;
  onRun: () => void;
  fixed?: FixedSearch;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const isLocked = fixed ? fixed.ran : locked;
  const crit = fixed ? fixed.criteria : criteria;
  const live = (fixed?.filters ?? FILTERS).filter((f) => !removed.includes(f.id));
  const byId = (id: string): Filter | undefined => live.find((f) => f.id === id);
  const named = ["title", "location", "experience"];
  const more = live.filter((f) => !named.includes(f.id));
  const dirty = removed.length > 0 || criteria.join("|") !== CRITERIA.join("|");

  const chip = (id: string) => {
    const f = byId(id);
    return f ? <span className="src-chip">{f.value}</span> : <span className="src-chip is-any">any</span>;
  };

  const addCriterion = () => {
    const c = draft.trim();
    if (c && !criteria.includes(c)) onCriteria([...criteria, c]);
    setDraft("");
    setAdding(false);
  };

  return (
    <section className={`src-search${isLocked ? " is-locked" : ""}`} aria-label="Proposed search">
      <div className="src-panel">
        <div className="src-panel-head">
          <p className="src-panel-lede">
            I've set these
            <span className="src-kw"><FunnelSimple size={14} weight="bold" aria-hidden="true" />Filters</span>
            {fixed ? fixed.basis : "based on your brief"}
            {fixed
              ? fixed.count && <span className="src-count">({fixed.count})</span>
              : <span className="src-count">({matches.toLocaleString("en-IN")} matches)</span>}
          </p>
          {fixed ? (
            fixed.onEdit && <button type="button" className="src-link" onClick={fixed.onEdit}>Edit the requirements</button>
          ) : (
            !locked && (
              <button type="button" className="src-link" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
                {editing ? "Done" : "Edit filters"}
              </button>
            )
          )}
        </div>

        {editing && !locked && !fixed ? (
          <ul className="src-filter-list">
            {live.map((f) => (
              <li key={f.id}>
                <span className="src-filter-k">{f.label}</span>
                <span className="src-chip">{f.value}</span>
                <button
                  type="button"
                  className="src-x"
                  aria-label={`Remove ${f.label} filter`}
                  onClick={() => onRemove(f.id)}
                >
                  <X size={12} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
            {live.length === 0 && <li className="src-empty">No filters. Every profile is in scope.</li>}
          </ul>
        ) : (
          <>
            <p className="src-sentence">
              {chip("title")}
              {(!fixed || byId("location")) && <><span>in</span>{chip("location")}</>}
              {(!fixed || byId("experience")) && <><span>with</span>{chip("experience")}<span>of experience</span></>}
              {more.length > 0 && (
                <button
                  type="button"
                  className="src-chip is-more"
                  onClick={() => (fixed ? setEditing((e) => !e) : !locked && setEditing(true))}
                  disabled={!fixed && locked}
                  aria-expanded={fixed ? editing : undefined}
                >
                  {fixed && editing ? "Hide the rest" : `+${more.length} more filter${more.length > 1 ? "s" : ""}`}
                </button>
              )}
            </p>
            {fixed && editing && (
              <ul className="src-filter-list">
                {more.map((f) => (
                  <li key={f.id}>
                    <span className="src-filter-k">{f.label}</span>
                    <span className="src-chip">{f.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {(!fixed || crit.length > 0) && (
        <div className="src-panel">
          <div className="src-panel-head">
            <p className="src-panel-lede">
              Ranked by
              <span className="src-kw"><Sparkle size={14} weight="bold" aria-hidden="true" />Criteria</span>
            </p>
            {!fixed && !locked && !adding && (
              <button type="button" className="src-link" onClick={() => setAdding(true)}>Add criteria</button>
            )}
          </div>
          <ul className="src-criteria">
            {crit.map((c) => (
              <li key={c} className="src-chip is-crit">
                {c}
                {!fixed && !locked && (
                  <button
                    type="button"
                    className="src-x"
                    aria-label={`Remove ${c}`}
                    onClick={() => onCriteria(criteria.filter((x) => x !== c))}
                  >
                    <X size={11} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
            {!fixed && adding && (
              <li>
                <input
                  className="src-add"
                  autoFocus
                  value={draft}
                  placeholder="e.g. Has led a team"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={addCriterion}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCriterion();
                    if (e.key === "Escape") { setDraft(""); setAdding(false); }
                  }}
                />
              </li>
            )}
          </ul>
        </div>
      )}

      {fixed ? (
        <>
          {fixed.ran && <p className="src-ran"><Check size={13} weight="bold" aria-hidden="true" />{fixed.ranLine}</p>}
          {fixed.note && <p className="src-note">{fixed.note}</p>}
          {!fixed.ran && fixed.run && (
            <div className="src-actions">
              <button type="button" className="src-btn is-primary" onClick={onRun} disabled={fixed.run.busy}>
                {fixed.run.label}
              </button>
            </div>
          )}
        </>
      ) : locked ? (
        <p className="src-ran"><Check size={13} weight="bold" aria-hidden="true" />Search ran with {live.length} filters and {crit.length} criteria</p>
      ) : (
        <div className="src-actions">
          <button type="button" className="src-btn is-quiet" onClick={onReset} disabled={!dirty}>
            <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />Reset search
          </button>
          <button type="button" className="src-btn is-primary" onClick={onRun}>
            Run search
          </button>
        </div>
      )}
    </section>
  );
}

/* ── results ─────────────────────────────────────────────────────────────── */

/** The most fit marks a card shimmers for: the row wraps past this, and nobody needs to see a dozen bars. */
const MAX_PENDING_FITS = 5;

/** What a connected campaign's results show, in place of the demo's fixtures. */
export type ResultsData = {
  /** The few to show as cards, best first. */
  candidates: readonly Candidate[];
  /** People nobody has scored yet: their cards show no one-line read and no fit marks. */
  unscored?: ReadonlySet<string>;
  /** Scores are still arriving: an unscored card shimmers where its line and marks will be, rather than sitting bare. */
  scoring?: boolean;
  reasons: Readonly<Record<string, string>>;
  /** What the fit marks stand for, and the column heads for them. */
  criteria: readonly string[];
  short: readonly string[];
  title: string;
  /** Right of the heading: how many are shown of how many. */
  count: string;
  sub: string | null;
  /** The way into the whole list. */
  all: string;
  /** Another search, when there is one to run. */
  more?: { label: string; busy?: boolean; onClick: () => void } | null;
  /** Everyone the chat may scroll through: the first five are `candidates`, the rest load as the list is scrolled. */
  pool?: readonly Candidate[];
};

/** How many more cards reaching the end of the list adds. */
const SCROLL_STEP = 5;

export function Results({
  matches, verdicts, onVerdict, onOpenProfile, onOpenList, data, activeId = null,
}: {
  /** Whose profile is open: that card shows as selected. */
  activeId?: string | null;
  matches?: number;
  verdicts: Readonly<Record<string, Verdict>>;
  onVerdict: (id: string, v: Verdict | null) => void;
  onOpenProfile: (id: string) => void;
  onOpenList: () => void;
  data?: ResultsData;
}) {
  /* Five cards in the chat. When the search found more, the list scrolls inside itself and adds five more each time
     its end comes into view, so the chat never becomes a wall of people. */
  const pool = data ? (data.pool && data.pool.length >= data.candidates.length ? data.pool : data.candidates) : CANDIDATES.slice(0, PREVIEW_COUNT);
  const [limit, setLimit] = useState(PREVIEW_COUNT);
  /* Always a box of its own: the people scroll inside it (five first, more as it is scrolled), the chat around it stays put. */
  const scrolls = pool.length > 0;
  const shown = pool.slice(0, Math.max(limit, PREVIEW_COUNT));
  const left = pool.length - shown.length;
  const boxRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!scrolls || left <= 0) return;
    const box = boxRef.current;
    const end = endRef.current;
    if (!box || !end || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (seen) => { if (seen.some((e) => e.isIntersecting)) setLimit((n) => n + SCROLL_STEP); },
      { root: box, rootMargin: "0px 0px 320px 0px" },
    );
    io.observe(end);
    return () => io.disconnect();
  }, [scrolls, left, shown.length]);

  const sub = data ? data.sub : "Take a look and tell me what resonates — and whether seniority should factor in.";
  /* The list's own last row: another search on the left, the whole list on the right. */
  const foot = (
    <div className="src-people-foot">
      {data?.more ? (
        <button type="button" className="src-people-btn" onClick={data.more.onClick} disabled={data.more.busy}>
          {data.more.label}
        </button>
      ) : <span />}
      <button type="button" className="src-people-btn is-all" onClick={onOpenList}>
        {data ? data.all : `See all ${CANDIDATES.length} ranked profiles`}
        <ArrowRight size={13} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
  const cards = (
    <ul className="src-cards">
      {shown.map((c, i) => (
        <li key={c.id} style={{ animationDelay: `${(i % SCROLL_STEP) * 40}ms` }}>
          <CandidateCard
            c={c}
            verdict={verdicts[c.id]}
            onVerdict={(v) => onVerdict(c.id, v)}
            onOpen={() => onOpenProfile(c.id)}
            selected={c.id === activeId}
            {...(data
              ? data.unscored?.has(c.id)
                ? {
                    reason: "",
                    criteria: [] as readonly string[],
                    short: [] as readonly string[],
                    ...(data.scoring ? { pending: { fits: Math.min(data.criteria.length, MAX_PENDING_FITS) } } : {}),
                  }
                : { reason: data.reasons[c.id] ?? "", criteria: data.criteria, short: data.short }
              : {})}
          />
        </li>
      ))}
      {scrolls && (
        <li ref={endRef} className="src-scroll-end" aria-live="polite">
          {left > 0 ? `${left} more below` : pool.length > PREVIEW_COUNT ? `All ${pool.length} shown` : ""}
        </li>
      )}
    </ul>
  );
  return (
    <section className="src-results" aria-label={data ? data.title : "Profiles for your feedback"}>
      {sub && <p className="src-results-sub">{sub}</p>}
      {/* One surface: a head with what this is and how many, the people (five, more as it scrolls), and a foot. */}
      <div className="src-people">
        <div className="src-results-head">
          <h3>{data ? data.title : "Profiles for your feedback"}</h3>
          <span>{data ? data.count : `${shown.length} shown · ${(matches ?? 0).toLocaleString("en-IN")} total matches`}</span>
        </div>
        {scrolls ? <div ref={boxRef} className="src-scroll" tabIndex={0} aria-label={`${pool.length} people`}>{cards}</div> : cards}
        {foot}
      </div>
    </section>
  );
}

/** What a card shows of a career: the search's short read, or the loaded profile's own history when there is one. */
function glanceFor(c: Candidate): Glance {
  if (c.jobs.length === 0 && c.glance) return c.glance;
  const skills = Object.values(c.skills).flat();
  return {
    jobs: c.jobs.slice(0, 2).map((j) => ({ title: j.roles[0]?.title ?? "", company: j.org.name, current: j.roles[0]?.end === "Present" })),
    schools: c.schools.slice(0, 2).map((s) => ({ school: s.org.name, degree: s.degree })),
    skills,
    skillCount: skills.length,
  };
}

/** Their photo when the source has one that loads; their initials otherwise. */
function Face({ c, size }: { c: Candidate; size: number }) {
  const [broken, setBroken] = useState(false);
  if (!c.photo || broken) return <Avatar name={c.name} hue={c.hue} size={size} />;
  return (
    <img
      className="src-face"
      src={c.photo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

/**
 * A requirement as a few words a card can show whole ("Based in or willing to relocate to Bengaluru" -> "Bengaluru",
 * "4+ years of hands-on DevOps, SRE" -> "4+ yrs DevOps", "Strong working knowledge of AWS" -> "AWS"). The full sentence
 * stays in the tooltip and the profile.
 */
export function requirementLabel(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/\b(based in|relocat|located|location|living in|work from)\b/i.test(t)) {
    const places = t.match(/\b[A-Z][a-zA-Z]+(?:[ -][A-Z][a-zA-Z]+)*/g)?.filter((w) => !/^(Based|Willing|Must|Should|Open|Located)$/.test(w));
    if (places?.length) return places[places.length - 1] as string;
  }
  const range = t.match(/(\d+)\s*(?:to|-|–)\s*(\d+)\s*\+?\s*(?:years?|yrs?)/i);
  const atLeast = t.match(/(\d+)\s*(\+)?\s*(?:years?|yrs?)/i);
  const terms = (t.match(/\b(?:[A-Z][A-Za-z0-9+#./-]*|[a-z]+[A-Z][A-Za-z0-9]*)\b/g) ?? []).filter(
    (w) => !/^(Strong|Proven|Good|Deep|Solid|Hands|Experience|Knowledge|Working|Ability|Excellent|Familiarity|Must|Should|Based|In|At|Of|With|The|A|An|And|Or|Years?)$/i.test(w),
  );
  if (range || atLeast) {
    const span = range ? `${range[1]}–${range[2]} yrs` : `${atLeast?.[1]}${atLeast?.[2] ? "+" : ""} yrs`;
    const after = t.slice((range ?? atLeast)!.index! + (range ?? atLeast)![0].length);
    const what = (after.match(/\b(?:[A-Z][A-Za-z0-9+#./-]*|[a-z]+[A-Z][A-Za-z0-9]*)\b/) ?? [])[0]
      ?? after.replace(/^[^a-z]*(?:of|in|as|at|with)?\s*(?:hands-on|professional|relevant|total)?\s*/i, "").split(/[\s,;]+/)[0];
    return [span, what && !/^(experience|exp)$/i.test(what) ? what : ""].filter(Boolean).join(" ");
  }
  if (terms.length) return terms.slice(0, 2).join(" / ");
  const words = t.split(" ").filter((w) => !/^(strong|proven|good|deep|solid|experience|knowledge|working|of|in|with|the|a|an)$/i.test(w));
  return words.slice(0, 3).join(" ");
}

/** Skill chips on a card before the rest are counted. */
const CARD_SKILLS = 4;

/**
 * One person, in two columns that end level.
 *
 *   left   who they are, laid out like a profile: face, name, profile link and years; "Title @ Company"; place and
 *          signals; then labelled rows for experience and education, and a few skills
 *   right  the AI's read, always in the same sections and order so it is read the same way on every card:
 *          Fit (the result), Why (one line), Requirements (a mark and a few words each), Watch out (the one worry,
 *          when there is one), and the two decisions at the foot
 *
 * Everything else (every strength and worry, evidence, the full history) is in the profile, which the card opens.
 */
export function CandidateCard({
  c, verdict, onVerdict, onOpen, reason, criteria, short: _short, pending, selected = false,
}: {
  c: Candidate;
  /** Their profile is open beside the list. */
  selected?: boolean;
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  onOpen: () => void;
  /** A connected campaign's own one-line read and its criteria; the demo's are the defaults. */
  reason?: string;
  criteria?: readonly string[];
  short?: readonly string[];
  /** The score is on its way: soft bars stand where the read will be. */
  pending?: { fits: number };
}) {
  const g = glanceFor(c);
  const now = c.jobs[0];
  const title = now?.roles[0]?.title ?? g.jobs[0]?.title ?? "";
  const org = now?.org.name ?? (g.jobs[0]?.company || c.current.name);
  const role = title && org ? `${title} @ ${org}` : title || org || c.headline;
  const text = reason ?? REASON[c.id];
  const fit = criteria ?? CRITERIA;
  const name = plainText(c.name);
  const skills = g.skills.slice(0, CARD_SKILLS);
  const moreSkills = g.skillCount - skills.length;
  const concern = c.result?.concerns?.[0] ?? null;
  const met = fit.filter((_, i) => c.meets[i]).length;
  return (
    <article className={`src-card${verdict ? ` is-${verdict}` : ""}${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <button type="button" className="src-card-hit" onClick={onOpen} aria-label={`Open ${name}'s profile`} />

      <div className="src-card-who">
        <div className="src-card-top">
          <Face c={c} size={44} />
          <div className="src-card-id">
            <p className="src-card-name">
              <span className="src-card-name-t">{name}</span>
              {c.linkedinUrl && (
                <a
                  className="src-card-link"
                  href={c.linkedinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${name} on LinkedIn`}
                  title="LinkedIn profile"
                  onClick={(e) => e.stopPropagation()}
                >
                  <LinkedinLogo size={15} weight="fill" aria-hidden="true" />
                </a>
              )}
              {c.totalYears > 0 && <span className="src-card-tag">{c.totalYears} {c.totalYears === 1 ? "yr" : "yrs"} experience</span>}
            </p>
            {role && <p className="src-card-line">{role}</p>}
            {(c.location || c.openToWork || c.recentlyChangedJob) && (
              <p className="src-card-meta">
                {c.location && <span>{c.location}</span>}
                {c.openToWork && <span className="src-card-tag is-open">Open to work</span>}
                {c.recentlyChangedJob && <span className="src-card-tag">Changed jobs recently</span>}
              </p>
            )}
          </div>
        </div>
        {(g.jobs.length > 0 || g.schools.length > 0) && (
          <div className="src-card-facts">
            {g.jobs.length > 0 && (
              <div className="src-card-fact">
                <span className="src-card-k"><Briefcase size={15} aria-hidden="true" />Experience</span>
                <ul className="src-card-v">
                  {g.jobs.map((j, i) => (
                    <li key={`${j.title}${j.company}${i}`}>
                      {j.title && <span className="is-main">{j.title}</span>}
                      {j.title && j.company && <span className="is-sep" aria-hidden="true">|</span>}
                      {j.company && <span className="is-org">{j.company}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {g.schools.length > 0 && (
              <div className="src-card-fact">
                <span className="src-card-k"><GraduationCap size={15} aria-hidden="true" />Education</span>
                <ul className="src-card-v">
                  {g.schools.map((s, i) => (
                    <li key={`${s.school}${i}`}>
                      <span className="is-main">{s.school}</span>
                      {s.degree && <span className="is-sep" aria-hidden="true">|</span>}
                      {s.degree && <span className="is-sub">{s.degree}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {/* The last line of the profile: a few skills, and the two decisions where the eye ends. */}
        <div className="src-card-foot">
          {skills.length > 0 ? (
            <ul className="src-card-skills" aria-label="Skills">
              {skills.map((k) => <li key={k}>{k}</li>)}
              {moreSkills > 0 && <li className="is-more">+{moreSkills}</li>}
            </ul>
          ) : <span />}
          <div className="src-card-acts">
            <Verdicts verdict={verdict} onVerdict={onVerdict} name={c.name} />
          </div>
        </div>
      </div>

      <aside className="src-card-ai" aria-label="AI read">
        <div className="src-card-sec is-fit">
          <span className="src-card-sk"><Sparkle size={12} weight="fill" aria-hidden="true" />Fit</span>
          {c.result ? <FitState r={c.result} /> : <span className="src-card-none">{c.listedAsFound ? "Listed as found" : "Not scored yet"}</span>}
        </div>
        <div className="src-card-sec">
          <span className="src-card-sk">Why</span>
          {pending ? (
            <div className="src-card-reason is-pending" aria-hidden="true">
              <Shimmer className="src-shim" w="92%" h={10} r={5} />
              <Shimmer className="src-shim is-short" w="56%" h={10} r={5} />
            </div>
          ) : (
            <p className="src-card-reason">{text || "Not read closely yet."}</p>
          )}
        </div>
        {!pending && fit.length > 0 && (
          <div className="src-card-sec">
            <span className="src-card-sk">Requirements <span className="src-card-n">{met} of {fit.length}</span></span>
            <ul className="src-card-checks">
              {fit.map((label, i) => (
                <li key={`${label}${i}`} title={label}>
                  <FitMark met={!!c.meets[i]} label={label} state={c.checks?.[i]} />
                  <span>{requirementLabel(label)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {concern && (
          <div className="src-card-sec">
            <span className="src-card-sk">Watch out</span>
            <p className="src-card-concern" title={concern}>{concern}</p>
          </div>
        )}
      </aside>
    </article>
  );
}

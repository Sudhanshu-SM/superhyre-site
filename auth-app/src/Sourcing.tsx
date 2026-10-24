import {
  ArrowRight, ArrowsClockwise, CaretDown, CaretRight, Check, CheckCircle,
  FunnelSimple, Sparkle, X,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { StageView } from "./Stages";
import { Stages } from "./Stages";
import type { Candidate, Filter, Phase, Verdict } from "./sourcing";
import {
  CANDIDATES, CRITERIA, FILTERS, PLAN_PHASES, PREVIEW_COUNT, REASON, RUN_PHASES, TOTAL_MATCHES,
} from "./sourcing";
import { Avatar, Career, FitRow, Verdicts } from "./CandidateBits";
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
            fixed.onEdit && <button type="button" className="src-link" onClick={fixed.onEdit}>Edit the spec</button>
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
};

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
  const shown = data ? data.candidates : CANDIDATES.slice(0, PREVIEW_COUNT);
  const sub = data ? data.sub : "Take a look and tell me what resonates — and whether seniority should factor in.";
  const foot = (
    <>
      <button
        type="button"
        className="src-more"
        onClick={onOpenList}
        style={{ animationDelay: `${120 + shown.length * 70 + 60}ms` }}
      >
        {data ? data.all : `See all ${CANDIDATES.length} ranked profiles`}
        <ArrowRight size={14} weight="bold" aria-hidden="true" />
      </button>
      {data?.more && (
        <button type="button" className="src-btn is-quiet" onClick={data.more.onClick} disabled={data.more.busy}>
          {data.more.label}
        </button>
      )}
    </>
  );
  return (
    <section className="src-results" aria-label={data ? data.title : "Profiles for your feedback"}>
      <div className="src-results-head">
        <h3>{data ? data.title : "Profiles for your feedback"}</h3>
        <span>{data ? data.count : `${shown.length} shown · ${(matches ?? 0).toLocaleString("en-IN")} total matches`}</span>
      </div>
      {sub && <p className="src-results-sub">{sub}</p>}
      <ul className="src-cards">
        {shown.map((c, i) => (
          <li key={c.id} style={{ animationDelay: `${120 + i * 70}ms` }}>
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
      </ul>
      {data ? <div className="src-results-foot">{foot}</div> : foot}
    </section>
  );
}

/**
 * One profile in the transcript. The whole card opens the profile; the two
 * verdict buttons are the only things inside it that do something else.
 */
export function CandidateCard({
  c, verdict, onVerdict, onOpen, reason, criteria, short, pending, selected = false,
}: {
  c: Candidate;
  /** Their profile is open beside the list. */
  selected?: boolean;
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  onOpen: () => void;
  /** A connected campaign's own one-line read, its criteria and their column heads; the demo's are the defaults. */
  reason?: string;
  criteria?: readonly string[];
  short?: readonly string[];
  /** The score is on its way: soft bars stand where the line on why and `fits` marks will be. */
  pending?: { fits: number };
}) {
  /* A sourced person known only from a search result has no work history yet:
     the card then reads the headline the search gave, and drops the career strip. */
  const now = c.jobs[0];
  const role = now?.roles[0]?.title;
  const line = now && role ? `${role} · ${now.org.name}` : c.headline;
  const text = reason ?? REASON[c.id];
  const fit = criteria ?? CRITERIA;
  return (
    <article className={`src-card${verdict ? ` is-${verdict}` : ""}${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <button type="button" className="src-card-hit" onClick={onOpen} aria-label={`Open ${c.name}'s profile`} />
      <div className="src-card-top">
        <Avatar name={c.name} hue={c.hue} size={38} />
        <div className="src-card-id">
          <p className="src-card-name">{c.name}{c.openToWork && <span className="src-otw">Open to work</span>}</p>
          <p className="src-card-line">{line}</p>
          {c.location && <p className="src-card-meta">{c.location}</p>}
        </div>
      </div>
      {/* A sibling of the identity rather than inside it, so the grid can
          put it top-right when the card is wide and at the foot when it is
          narrow, instead of squeezing the name. */}
      <div className="src-card-acts">
        <Verdicts verdict={verdict} onVerdict={onVerdict} name={c.name} icons />
      </div>
      {/* One sentence of why, instead of a highlighted paragraph: the rest is
          in the profile, one click away. */}
      {pending ? (
        <div className="src-card-reason is-pending" aria-hidden="true">
          <Shimmer className="src-shim" w="min(78%, 420px)" h={10} r={5} />
          <Shimmer className="src-shim is-short" w="min(44%, 240px)" h={10} r={5} />
        </div>
      ) : text && (
        <p className="src-card-reason">
          <Sparkle size={13} weight="fill" aria-hidden="true" />
          {text}
        </p>
      )}
      <div className="src-card-foot">
        {(c.jobs.length > 0 || c.totalYears > 0) && (
          <div className="src-card-career">
            {c.totalYears > 0 && <span className="src-card-k">{c.totalYears} yrs</span>}
            {c.jobs.length > 0 && <Career c={c} />}
          </div>
        )}
        {pending && pending.fits > 0 && (
          <ul className="cb-fitrow is-pending" aria-hidden="true">
            {Array.from({ length: pending.fits }, (_, i) => (
              <li key={i}>
                <Shimmer className="src-shim is-dot" circle w={16} h={16} />
                <Shimmer className="src-shim is-word" w={[44, 58, 36][i % 3]!} h={8} r={4} />
              </li>
            ))}
          </ul>
        )}
        {fit.length > 0 && <FitRow meets={c.meets} {...(criteria ? { criteria, short: short ?? [] } : {})} />}
      </div>
    </article>
  );
}

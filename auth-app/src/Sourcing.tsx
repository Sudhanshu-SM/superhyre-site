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

  /* Removing a filter widens the pool. A fixture figure, but a consistent
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
    note: took.search != null ? `${n} profiles scanned`
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
    note: took.calibrate != null ? `${CANDIDATES.length} ranked · best ${PREVIEW_COUNT} picked`
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
    note: reached ? `${kept} shortlisted · ${preview.length - kept} passed`
      : atResults ? `${called.length} of ${preview.length} decided, your call`
      : "Your call on the best fits",
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
        <span className="src-phase-icon" aria-hidden="true"><span className="src-spin" /></span>
        <span className="src-shimmer">{fill(phase.live, n)}</span>
        <Ticker />
      </div>
    );
  }

  const secs = Math.max(1, Math.round(tookMs / 1000));
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
        <span>{fill(phase.done, n)} for {secs}s</span>
        {open
          ? <CaretDown size={12} weight="bold" aria-hidden="true" />
          : <CaretRight size={12} weight="bold" aria-hidden="true" />}
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

/** Elapsed seconds while a phase runs. Real time, not a scripted count. */
function Ticker() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => window.clearInterval(id);
  }, []);
  return <span className="src-tick">{s}s</span>;
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

function SearchCard({
  locked, matches, removed, onRemove, onReset, criteria, onCriteria, onRun,
}: {
  locked: boolean;
  matches: number;
  removed: readonly string[];
  onRemove: (id: string) => void;
  onReset: () => void;
  criteria: readonly string[];
  onCriteria: (c: readonly string[]) => void;
  onRun: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const live = FILTERS.filter((f) => !removed.includes(f.id));
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
    <section className={`src-search${locked ? " is-locked" : ""}`} aria-label="Proposed search">
      <div className="src-panel">
        <div className="src-panel-head">
          <p className="src-panel-lede">
            I've set these
            <span className="src-kw"><FunnelSimple size={14} weight="bold" aria-hidden="true" />Filters</span>
            based on your brief
            <span className="src-count">({matches.toLocaleString("en-IN")} matches)</span>
          </p>
          {!locked && (
            <button type="button" className="src-link" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              {editing ? "Done" : "Edit filters"}
            </button>
          )}
        </div>

        {editing && !locked ? (
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
          <p className="src-sentence">
            {chip("title")}<span>in</span>{chip("location")}<span>with</span>{chip("experience")}
            <span>of experience</span>
            {more.length > 0 && (
              <button
                type="button"
                className="src-chip is-more"
                onClick={() => !locked && setEditing(true)}
                disabled={locked}
              >
                +{more.length} more filter{more.length > 1 ? "s" : ""}
              </button>
            )}
          </p>
        )}
      </div>

      <div className="src-panel">
        <div className="src-panel-head">
          <p className="src-panel-lede">
            Ranked by
            <span className="src-kw"><Sparkle size={14} weight="bold" aria-hidden="true" />Criteria</span>
          </p>
          {!locked && !adding && (
            <button type="button" className="src-link" onClick={() => setAdding(true)}>Add criteria</button>
          )}
        </div>
        <ul className="src-criteria">
          {criteria.map((c) => (
            <li key={c} className="src-chip is-crit">
              {c}
              {!locked && (
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
          {adding && (
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

      {locked ? (
        <p className="src-ran"><Check size={13} weight="bold" aria-hidden="true" />Search ran with {live.length} filters and {criteria.length} criteria</p>
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

function Results({
  matches, verdicts, onVerdict, onOpenProfile, onOpenList,
}: {
  matches: number;
  verdicts: Readonly<Record<string, Verdict>>;
  onVerdict: (id: string, v: Verdict | null) => void;
  onOpenProfile: (id: string) => void;
  onOpenList: () => void;
}) {
  const shown = CANDIDATES.slice(0, PREVIEW_COUNT);
  return (
    <section className="src-results" aria-label="Profiles for your feedback">
      <div className="src-results-head">
        <h3>Profiles for your feedback</h3>
        <span>{shown.length} shown · {matches.toLocaleString("en-IN")} total matches</span>
      </div>
      <p className="src-results-sub">
        Take a look and tell me what resonates — and whether seniority should factor in.
      </p>
      <ul className="src-cards">
        {shown.map((c, i) => (
          <li key={c.id} style={{ animationDelay: `${120 + i * 70}ms` }}>
            <CandidateCard
              c={c}
              verdict={verdicts[c.id]}
              onVerdict={(v) => onVerdict(c.id, v)}
              onOpen={() => onOpenProfile(c.id)}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="src-more"
        onClick={onOpenList}
        style={{ animationDelay: `${120 + shown.length * 70 + 60}ms` }}
      >
        See all {CANDIDATES.length} ranked profiles
        <ArrowRight size={14} weight="bold" aria-hidden="true" />
      </button>
    </section>
  );
}

/**
 * One profile in the transcript. The whole card opens the profile; the two
 * verdict buttons are the only things inside it that do something else.
 */
export function CandidateCard({
  c, verdict, onVerdict, onOpen,
}: {
  c: Candidate;
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  onOpen: () => void;
}) {
  const now = c.jobs[0]!;
  return (
    <article className={`src-card${verdict ? ` is-${verdict}` : ""}`}>
      <button type="button" className="src-card-hit" onClick={onOpen} aria-label={`Open ${c.name}'s profile`} />
      <div className="src-card-top">
        <Avatar name={c.name} hue={c.hue} size={38} />
        <div className="src-card-id">
          <p className="src-card-name">{c.name}{c.openToWork && <span className="src-otw">Open to work</span>}</p>
          <p className="src-card-line">{now.roles[0]!.title} · {now.org.name}</p>
          <p className="src-card-meta">{c.location}</p>
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
      <p className="src-card-reason">
        <Sparkle size={13} weight="fill" aria-hidden="true" />
        {REASON[c.id]}
      </p>
      <div className="src-card-foot">
        <div className="src-card-career">
          <span className="src-card-k">{c.totalYears} yrs</span>
          <Career c={c} />
        </div>
        <FitRow meets={c.meets} />
      </div>
    </article>
  );
}

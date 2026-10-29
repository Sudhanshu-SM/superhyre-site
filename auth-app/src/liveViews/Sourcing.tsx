import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { MatchList, SourcingStatus, SpecRow } from "../api/agent";
import { agentApi, specApi } from "../api/agent";
import { api, messageOf } from "../api/client";
import { follow } from "../api/events";
import type { RunEvent } from "../api/events";
import { FOLLOWING_LINE, useMayChangeCampaign } from "../campaignRights";
import { campaignRow, useCampaignAgents, useCampaignRows, useCampaignsReady } from "../campaignStore";
import { applyFeed } from "../agentFeed";
import type { FeedLine } from "../agentFeed";
import { applyPhaseEvent } from "../agentPhases";
import type { PhaseLine } from "../agentPhases";
import { PhaseSummary, PhaseTimeline } from "../agentCards";
import { Clarified } from "../Clarify";
import { EmptyArt } from "../EmptyArt";
import { setFromMatches } from "../liveCandidate";
import { getSet, putSet } from "../liveCandidates";
import { useLiveChat } from "../liveChat";
import type { CampaignFacts, EventRow, Pool, RunState } from "../liveSourcing";
import {
  applyRunEvent, batchOf, buildPhase, buildingPhase, cameBack, canRun, closeVerdict, countLine, criteriaLines, eventFromRow, failedRun, filterLines, idleRun,
  isRunning, judgingDown, mergeSet, nobodyWaitingLine, poolOf, readPhase, readingPhase, resultsCopy, runLabel, runPhases, runSummary,
  liveStages, mustHaveCount, searchNote, settleRun, startingRun, unscoredIds, unscoredIn, visibleNotices,
} from "../liveSourcing";
import type { FixedSearch } from "../Sourcing";
import { PhaseBlock, Results, SearchCard, Written, writeMs } from "../Sourcing";
import { Stages } from "../Stages";
import { PREVIEW_COUNT } from "../sourcing";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import { campaignAsk, resolvedCampaignId } from "./ask";
import type { LiveViewProps } from "./types";

/**
 * The sourcing run in the live chat, drawn with the same pieces as the demo's
 * (`Sourcing.tsx`: phase blocks, the proposed search, the three best; `Stages.tsx`) and fed by
 * the campaign itself.
 *
 *   plan      two phases, read from the campaign and its approved role spec: the filters on the
 *             search card are the spec's own, so the card is read-only and sends you to the
 *             campaign to change them
 *   confirm   Run search. Nothing searches before it is pressed
 *   run       the run's real events (searching, scoring), each phase timed by the events' own
 *             times; notices and failures in plain words
 *   results   the three best from the campaign's ranked list, and the way into the whole list
 *
 * A campaign that already has people shows them straight away and offers another search. A view
 * that mounts for a turn the page has shown before (a reload, reopening the chat) shows the
 * campaign as it stands and starts nothing.
 */

/* ── which campaign ──────────────────────────────────────────────────────── */

export default function SourcingView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const ready = useCampaignsReady();
  const ask = useMemo(() => campaignAsk(card, rows, { ask: "Which campaign should I source for?" }), [card, rows]);
  /* The turn this card belongs to: how a view that comes back is told from one that just arrived. */
  const turn = useLiveChat().turns.find((t) => t.cards.includes(card));
  /* A turn the page has shown before shows the campaign as it stands and starts nothing. Decided
     once for the turn, so choosing another campaign in the question plays its plan afresh. */
  const [restored] = useState(() => cameBack(hasSeen(turn?.key ?? null), turn?.startedAt ?? null));
  useEffect(() => markSeen(turn?.key ?? null), [turn?.key]);

  if (!card.campaignId && !ready) return <p className="src-note" aria-live="polite">Opening your campaigns</p>;
  if (!card.campaignId && ready && rows.length === 0) {
    return (
      <div className="src">
        <p className="src-note">There are no campaigns to source for yet. A campaign holds the role and the search.</p>
        <div className="src-asks">
          <button type="button" className="src-btn is-primary" onClick={() => act(ctx, "Start a new campaign")}>Start a campaign</button>
        </div>
      </div>
    );
  }
  return (
    <Clarified kind="sourcing" ctx={ctx} ask={ask}>
      {(c) => {
        const id = resolvedCampaignId(card, c);
        return id ? (
          <Flow key={id} campaignId={id} campaignName={card.campaignName} ctx={c} turnKey={turn?.key ?? null} restored={restored} />
        ) : null;
      }}
    </Clarified>
  );
}

/* ── what the page remembers about a turn ────────────────────────────────── */

const SEEN = "sh.sourcing.seen";
const RUNS = "sh.sourcing.runs";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the view still works; it just won't recognise itself after a reload */
  }
}

const hasSeen = (turn: string | null): boolean => turn !== null && read<string[]>(SEEN, []).includes(turn);

function markSeen(turn: string | null): void {
  if (!turn) return;
  const seen = read<string[]>(SEEN, []);
  if (!seen.includes(turn)) write(SEEN, [...seen, turn].slice(-60));
}

const runKey = (turn: string, campaignId: string): string => `${turn}:${campaignId}`;

/* ── the campaign, as the plan reads it ──────────────────────────────────── */

/** The ranked list: people waiting for a call, and (with the server's own counts) those already decided. */
type Matches = MatchList;
type Specs = { latest: SpecRow | null; approved: SpecRow | null };

type Plan = {
  /** reading: the first phase is live; building: the second is; ready: the card is up. */
  stage: "reading" | "building" | "ready" | "blocked" | "failed";
  specs: Specs | null;
  readMs: number | undefined;
  status: SourcingStatus | null;
  matches: Matches | null;
  buildMs: number | undefined;
  error: string | null;
};

const EMPTY_PLAN: Plan = { stage: "reading", specs: null, readMs: undefined, status: null, matches: null, buildMs: undefined, error: null };

/** A phase that finishes in a blink is held long enough to be read; the time shown is what it took. */
const HOLD_MS = 450;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

const fetchMatches = (campaignId: string) => api<Matches>("GET", `/v1/campaigns/${campaignId}/matches`);

function usePlan(campaignId: string, restored: boolean, attempt: number): { plan: Plan; refresh: () => Promise<void> } {
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);

  useEffect(() => {
    let dead = false;
    setPlan(EMPTY_PLAN);
    const fail = (err: unknown) => !dead && setPlan({ ...EMPTY_PLAN, stage: "failed", error: messageOf(err) });
    const t0 = Date.now();

    void (async () => {
      try {
        if (restored) {
          const [specs, status, matches] = await Promise.all([specApi.get(campaignId), agentApi.sourcing(campaignId), fetchMatches(campaignId)]);
          if (dead) return;
          setPlan({ stage: specs.approved ? "ready" : "blocked", specs, readMs: undefined, status, matches, buildMs: undefined, error: null });
          return;
        }
        const specs = await specApi.get(campaignId);
        await wait(HOLD_MS - (Date.now() - t0));
        if (dead) return;
        const readMs = Date.now() - t0;
        if (!specs.approved) {
          setPlan({ ...EMPTY_PLAN, stage: "blocked", specs, readMs });
          return;
        }
        /* Let the paragraph about the role be read before the next phase starts. */
        const facts = factsOf(campaignId, null);
        setPlan({ ...EMPTY_PLAN, stage: "reading", specs, readMs });
        await wait(writeMs(readPhase({ campaign: facts, ...specs }).says) + 260);
        if (dead) return;
        setPlan((p) => ({ ...p, stage: "building" }));
        const t1 = Date.now();
        const [status, matches] = await Promise.all([agentApi.sourcing(campaignId), fetchMatches(campaignId)]);
        await wait(HOLD_MS - (Date.now() - t1));
        if (dead) return;
        const buildMs = Date.now() - t1;
        setPlan((p) => ({ ...p, status, matches, buildMs }));
        const pool = poolOf(status, matches.rows.length, matches.counts);
        const spec = specs.approved.spec;
        await wait(writeMs(buildPhase(spec, pool).says) + 260);
        if (dead) return;
        setPlan((p) => ({ ...p, stage: "ready" }));
      } catch (err) {
        fail(err);
      }
    })();
    return () => {
      dead = true;
    };
  }, [campaignId, restored, attempt]);

  /* After a search, the figures and the ranked list as they stand now. */
  const refresh = useCallback(async () => {
    try {
      const [status, matches] = await Promise.all([agentApi.sourcing(campaignId), fetchMatches(campaignId)]);
      setPlan((p) => ({ ...p, status, matches }));
    } catch {
      /* the list on screen stays as it was */
    }
  }, [campaignId]);

  return { plan, refresh };
}

/** What the plan says about the campaign, from the console's own list when it has it. */
function factsOf(campaignId: string, name: string | null): CampaignFacts | null {
  const row = campaignRow(campaignId);
  if (row) return { name: row.name, department: row.department, location: row.location, status: row.status };
  return name ? { name } : null;
}

/* ── the run ─────────────────────────────────────────────────────────────── */

type Action =
  | { type: "set"; state: RunState }
  | { type: "event"; event: RunEvent }
  | { type: "settle"; status: "done" | "failed" | "cancelled"; message: string | null };
const runReducer = (s: RunState, a: Action): RunState =>
  a.type === "set" ? a.state : a.type === "settle" ? settleRun(s, a.status, a.message) : applyRunEvent(s, a.event);

type StoredRun = { run: { status: string; error?: { message?: string } | null }; events: EventRow[] };

function Flow({
  campaignId, campaignName, ctx, turnKey, restored,
}: {
  campaignId: string;
  campaignName: string | null;
  ctx: MomentCtx;
  turnKey: string | null;
  restored: boolean;
}): JSX.Element {
  const [attempt, setAttempt] = useState(0);
  /* A search, an approval and a role spec are the campaign's own people's: anyone else sees what was found. */
  const may = useMayChangeCampaign(campaignId);
  const { plan, refresh } = usePlan(campaignId, restored, attempt);
  const [run, dispatch] = useReducer(runReducer, idleRun);
  /* What the run says it is doing, line by line. The same events as `run`, read for their phases. */
  const [phases, setPhases] = useState<readonly PhaseLine[]>([]);
  /* And what it is doing right now, as the lines that rise and fade under the matching line. */
  const [said, setSaid] = useState<readonly FeedLine[]>([]);
  const feed = useCallback((event: RunEvent) => {
    dispatch({ type: "event", event });
    setPhases((lines) => applyPhaseEvent(lines, event));
    setSaid((lines) => applyFeed(lines, event));
  }, []);
  const [runNo, setRunNo] = useState(0);
  const stop = useRef<(() => void) | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const follows = useCallback(
    (runId: string) => {
      stop.current?.();
      stop.current = follow({ runId }, 0, feed);
    },
    [feed],
  );

  /* A search this turn started before the page reloaded: read its events again (nothing is started). */
  useEffect(() => {
    if (!restored || !turnKey) return;
    const saved = read<Record<string, string>>(RUNS, {})[runKey(turnKey, campaignId)];
    if (saved) follows(saved);
  }, [restored, turnKey, campaignId, follows]);
  useEffect(() => () => stop.current?.(), []);

  const going = useRef(false);
  const start = useCallback(() => {
    /* One search at a time: a second press while one is starting changes nothing. */
    if (going.current) return;
    going.current = true;
    stop.current?.();
    setRunNo((n) => n + 1);
    setPhases([]);
    setSaid([]);
    dispatch({ type: "set", state: startingRun() });
    agentApi
      .findMore(campaignId)
      .then(({ runId }) => {
        if (turnKey) write(RUNS, { ...read<Record<string, string>>(RUNS, {}), [runKey(turnKey, campaignId)]: runId });
        follows(runId);
      })
      .catch((err: unknown) => dispatch({ type: "set", state: failedRun(messageOf(err)) }));
  }, [campaignId, turnKey, follows]);

  /* The stream can close just before a run's last events. While a search is in flight, ask
     the server how the run stands now and then, and take whatever the stream missed. */
  const inFlight = isRunning(run);
  const inFlightId = run.runId;
  useEffect(() => {
    if (!inFlight || !inFlightId) return;
    let dead = false;
    const check = async () => {
      try {
        const stored = await api<StoredRun>("GET", `/v1/runs/${inFlightId}`);
        if (dead) return;
        for (const row of stored.events) feed(eventFromRow(inFlightId, row));
        const s = stored.run.status;
        if (s === "done" || s === "failed" || s === "cancelled") dispatch({ type: "settle", status: s, message: stored.run.error?.message ?? null });
      } catch {
        /* the stream is still the main route; try again next time */
      }
    };
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, [inFlight, inFlightId, feed]);

  /* The search is over: the ranked list and the figures as they stand now. */
  useEffect(() => {
    if (run.status === "done") void refresh();
  }, [run.status, runNo, refresh]);

  /* Matching the campaign started somewhere else (approving the role spec ranks the people already found):
     the list is read again when it finishes, and while it runs the view says that is what is happening. */
  const matchingElsewhere = useCampaignAgents(campaignId)?.sourcing.state === "working";
  const wasMatching = useRef(false);
  useEffect(() => {
    if (wasMatching.current && !matchingElsewhere) void refresh();
    wasMatching.current = matchingElsewhere;
  }, [matchingElsewhere, refresh]);

  /* While people are being scored, the list is read again as scores land, so the rows fill in rather than
     arrive in one go at the end. A trailing read: a burst of scores is one. */
  useEffect(() => {
    if (!inFlight || run.scored === 0) return;
    const t = window.setTimeout(() => void refresh(), 1500);
    return () => window.clearTimeout(t);
  }, [inFlight, run.scored, refresh]);

  /* A draft that was never approved: approved here, then the search starts (the plan reads the spec again). */
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const approveAndStart = useCallback((specId: string) => {
    if (!specId) return;
    setApproving(true);
    setApproveError(null);
    specApi.approve(campaignId, specId).then(
      () => {
        setApproving(false);
        setAttempt((a) => a + 1);
        start();
      },
      (err: unknown) => {
        setApproving(false);
        setApproveError(messageOf(err));
      },
    );
  }, [campaignId, start]);

  const approved = plan.specs?.approved ?? null;
  const spec = approved?.spec ?? null;
  const facts = factsOf(campaignId, campaignName);

  /* The ranked list, registered where the list, the profile sheet and shortlisting read it. */
  const set = useMemo(
    () => (plan.matches && spec ? setFromMatches(campaignId, plan.matches.rows, spec, new Date(), plan.matches.decided ?? []) : null),
    [campaignId, plan.matches, spec],
  );
  useEffect(() => {
    if (set) putSet(mergeSet(getSet(campaignId), set));
  }, [set, campaignId]);

  /* One count of found and one of waiting, both the server's: a decided person leaves the second, never the first. */
  const pool: Pool | null = plan.status ? poolOf(plan.status, plan.matches?.rows.length ?? 0, plan.matches?.counts) : null;
  const running = isRunning(run);
  going.current = running;
  const rowsNow = plan.matches?.rows ?? [];
  /* The best of the people still waiting: someone the server already has a decision for is in the list, not here. */
  const best = set?.candidates.filter((c) => !set.decisions?.[c.id]).slice(0, PREVIEW_COUNT) ?? [];
  /* Whether the campaign already had people when this view first read it: the first leg of the goal is
     settled for them, and the stages say "found so far" rather than "waiting for you to run it". */
  const hadPeople = useRef<boolean | null>(null);
  if (hadPeople.current === null && pool !== null && run.status === "idle") {
    hadPeople.current = pool.found > 0 || pool.ranked > 0;
  }

  const busy = plan.stage === "reading" || plan.stage === "building" || running;
  useEffect(() => { ctxRef.current.onBusy(busy); }, [busy]);
  useEffect(() => () => ctxRef.current.onBusy(false), []);
  useEffect(() => { ctxRef.current.onGrow(); }, [plan, run, set]);

  /* ── the plan's phases ── */
  const readSettled = plan.specs !== null && (plan.readMs !== undefined || restored);
  const readIn = { campaign: facts, approved: plan.specs?.approved ?? null, latest: plan.specs?.latest ?? null };
  const buildSettled = plan.status !== null && plan.matches !== null && (plan.buildMs !== undefined || restored);

  if (plan.stage === "failed") {
    return (
      <div className="src">
        <p className="src-note is-stop">I couldn't read this campaign. {plan.error}</p>
        <div className="src-asks">
          <button type="button" className="src-btn is-primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </div>
      </div>
    );
  }

  const hasRun = run.status !== "idle" || (pool?.found ?? 0) > 0 || (pool?.ranked ?? 0) > 0;
  const fixed: FixedSearch | null = spec && pool
    ? {
        filters: filterLines(spec),
        criteria: criteriaLines(spec),
        basis: "from the approved requirements",
        count: countLine(pool),
        ran: hasRun,
        ranLine: `Searched on ${filterLines(spec).length} ${filterLines(spec).length === 1 ? "filter" : "filters"}${criteriaLines(spec).length ? ` and ${criteriaLines(spec).length} ${criteriaLines(spec).length === 1 ? "criterion" : "criteria"}` : ""} from the requirements`,
        note: searchNote(pool),
        run: may && canRun(pool) ? { label: runLabel(pool), busy: running } : null,
        ...(ctx.openCampaign ? { onEdit: () => ctx.openCampaign?.(campaignId) } : {}),
      }
    : null;

  /* A server that narrates says each phase itself; one that doesn't is read from the events it does send. */
  const legacy = phases.length === 0 ? runPhases(run) : [];
  const ended = run.status === "done" || run.status === "failed";
  /* The best people so far are shown while the rest are still being scored. */
  const showResults = plan.stage === "ready" && set !== null && best.length > 0;
  /* The search finished cleanly and there is still nobody to show for this campaign. */
  const foundNoOne = run.status === "done" && plan.stage === "ready" && best.length === 0 && (pool?.found ?? 0) === 0;
  const nobodyWaiting = plan.stage === "ready" && set !== null && best.length === 0 && !running && pool !== null && pool.found > 0 && run.status !== "failed";

  /* The owner's goal tracker: searching, matching, deciding, from the run's own counts (found, scored of N,
     the best picked) and from what has been decided, so it moves as the work does and not on a timer. */
  const track = liveStages({
    readDone: readSettled,
    buildDone: buildSettled,
    searched: hadPeople.current === true,
    run,
    found: pool?.found ?? 0,
    ranked: set?.total ?? pool?.ranked ?? 0,
    criteria: spec ? mustHaveCount(spec) : (set?.criteria.length ?? 0),
    preview: best.map((c) => c.id),
    verdicts: ctx.verdicts,
  });

  return (
    <div className="src">
      {plan.stage !== "blocked" && (
        <Stages goal={spec ? `Shortlist ${spec.title}` : `Shortlist for ${campaignName ?? facts?.name ?? "this role"}`} {...track} />
      )}
      {plan.stage === "reading" && !readSettled ? (
        <PhaseBlock key="read" phase={readingPhase()} n={0} />
      ) : (
        <PhaseBlock key="read" phase={readPhase(readIn, !restored)} tookMs={restored ? 0 : (plan.readMs ?? 0)} n={0} />
      )}

      {/* No approved spec: a draft is approved here, in one tap, and the search starts; with none, the
          sentence above takes the job description in the message box below. Nobody is sent to the campaign. */}
      {plan.stage === "blocked" && !may && <p className="src-note">{FOLLOWING_LINE}</p>}
      {plan.stage === "blocked" && may && plan.specs?.latest && (
        <div className="src-asks">
          <button type="button" className="src-btn is-primary" disabled={approving} onClick={() => approveAndStart(plan.specs?.latest?.id ?? "")}>
            {approving ? "Approving" : "Approve them and start the search"}
          </button>
          {ctx.openCampaign && (
            <button type="button" className="src-btn is-quiet" onClick={() => ctx.openCampaign?.(campaignId)}>Review them first</button>
          )}
        </div>
      )}
      {approveError && <p className="src-note is-stop" role="alert">{approveError}</p>}

      {(plan.stage === "building" || plan.stage === "ready") && spec && pool && (
        buildSettled
          ? <PhaseBlock key="build" phase={buildPhase(spec, pool, !restored)} tookMs={restored ? 0 : (plan.buildMs ?? 0)} n={0} />
          : <PhaseBlock key="build" phase={buildingPhase()} n={0} />
      )}

      {plan.stage === "ready" && fixed && (
        <SearchCard key="confirm" onRun={start} fixed={fixed} />
      )}
      {plan.stage === "ready" && fixed && !may && <p className="src-note">{FOLLOWING_LINE}</p>}

      {running && phases.length > 0 && <PhaseTimeline lines={phases} working feed={said} />}
      {!running && phases.length > 0 && <PhaseSummary lines={closeVerdict(phases, batchOf(run), run.tiers.A + run.tiers.B + run.tiers.C + run.ruledOut)} label="How the search went" />}
      {legacy.map(({ phase, tookMs }) => (
        <PhaseBlock key={`${runNo}-${phase.id}`} phase={phase} {...(tookMs !== undefined ? { tookMs } : {})} n={0} />
      ))}
      {visibleNotices(run).map((n) => (
        <p key={`${runNo}-${n}`} className="src-note">{n}</p>
      ))}
      {ended && (
        <>
          {foundNoOne && <div className="src-art"><EmptyArt name="empty-no-matches" size={180} /></div>}
          <Written key={`${runNo}-summary`} text={runSummary(run)} />
          {run.status === "failed" && may && (
            <div className="src-asks">
              <button type="button" className="src-btn is-primary" onClick={start}>Try again</button>
            </div>
          )}
        </>
      )}

      {showResults && set && (
        <Results
          key="results"
          verdicts={ctx.verdicts}
          onVerdict={ctx.onVerdict}
          onOpenProfile={(id) => ctx.openProfile(id)}
          onOpenList={() => ctx.openList(campaignId)}
          data={{
            candidates: best,
            unscored: unscoredIds(rowsNow),
            reasons: set.reasons,
            criteria: set.criteria.map((c) => c.text),
            short: set.criteria.map((c) => c.short),
            ...resultsCopy({
              shown: best.length, total: set.total, unscored: judgingDown(run) ? 0 : unscoredIn(rowsNow, PREVIEW_COUNT),
              // This search's own people when it ran here; the campaign's list is "ranked" and says so.
              ...(run.status === "done" && batchOf(run) > 0 ? { found: batchOf(run) } : {}),
            }),
            more: may && pool && canRun(pool) ? { label: `Find ${pool.nextSize} more`, busy: running, onClick: start } : null,
          }}
        />
      )}
      {nobodyWaiting && pool && (
        <>
          <p className="src-note">{nobodyWaitingLine(pool, matchingElsewhere) ?? "Everyone found so far has been shortlisted or rejected."}</p>
          {may && canRun(pool) && (
            <div className="src-asks">
              <button type="button" className="src-btn is-primary" onClick={start} disabled={running}>{`Find ${pool.nextSize} more`}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

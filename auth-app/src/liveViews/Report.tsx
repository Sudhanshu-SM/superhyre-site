import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { homeOverview } from "../api/home";
import { retryOverview, useCampaignOverview, useOverviewFailed } from "../campaignStore";
import { ServiceMark } from "../connectors";
import type { EventKind, LogEvent } from "../liveReports";
import {
  ALL, dayLabel, eventsOf, foundEvents, homeEvents, lastDays, MARKED, markerText, positionOf, rangeLabel, receiptAt, runEvents, runsReach, unfinishedRuns,
} from "../liveReports";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import { LoadFailed } from "../ui";
import { listRuns, RUN_PAGE } from "./data";
import { Reading } from "./Reading";
import { ScopeGate } from "./scope";
import type { LiveViewProps } from "./types";
import { useAsync } from "./useAsync";
import { useCampaignLog } from "./useCampaignLog";

/**
 * What the agents did, as the demo's receipt: lines that count up as the marker travels the
 * week, and the recruiter's own hand on the marker afterwards. The lines are the campaign's real
 * log and the agent's real runs; a line with nothing behind it isn't drawn, and a part of the
 * week with nothing in it says so.
 */
export default function ReportView({ card, ctx }: LiveViewProps): JSX.Element {
  return (
    <ScopeGate kind="report" card={card} ctx={ctx} all ask="Which campaign is the report for?">
      {(scope, c) => (scope === ALL ? <AllReport ctx={c} /> : <OneReport id={scope} ctx={c} />)}
    </ScopeGate>
  );
}

const WEEK = 7;

/** Local midnight of a calendar day. */
const startOf = (day: string) => new Date(`${day}T00:00:00`).getTime();

type Placed = LogEvent & { pos: number };

function OneReport({ id, ctx }: { id: string; ctx: MomentCtx }): JSX.Element {
  const days = useMemo(() => lastDays(WEEK), []);
  const ov = useCampaignOverview(id);
  const failed = useOverviewFailed(id);
  const log = useCampaignLog(id, startOf(days[0] ?? ""));
  const runs = useAsync(() => listRuns({ campaignId: id, since: startOf(days[0] ?? "") }), `runs:${id}:${days[0]}`);

  const ready = !!ov && log.covered && runs.settled;
  const placed = useMemo<Placed[]>(() => {
    if (!ov || !ready) return [];
    const all = [...eventsOf(log.items ?? []), ...foundEvents(ov.sourcedPerDay, days), ...runEvents(runs.data ?? [], days, id)];
    return all.map((e) => ({ ...e, pos: positionOf(e, days) })).filter((e) => e.pos >= 0).sort((a, b) => a.pos - b.pos);
  }, [ov, ready, log.items, runs.data, days, id]);

  if (failed) return <LoadFailed what="This campaign" onRetry={() => retryOverview(id)} />;
  const searches = placed.filter((e) => e.kind === "search").length;
  const logged = placed.filter((e) => e.kind !== "search" && e.kind !== "found").length;
  const stopped = unfinishedRuns(runs.data ?? [], days, id);
  const reaches = !runs.data || runsReach(runs.data, startOf(days[0] ?? ""), RUN_PAGE);
  return (
    <div className="src mo">
      <Reading
        ready={ready}
        live="Reading the week's runs"
        done="Read the week's runs"
        steps={ready ? [`${logged === 1 ? "1 thing" : `${logged} things`} on the campaign's log`, `${searches === 1 ? "1 search" : `${searches} searches`} by the agents`, "Finds, day by day"] : []}
        onBusy={ctx.onBusy}
        onGrow={ctx.onGrow}
      >
        <Receipt
          name={ov?.campaign.name ?? ""}
          days={days}
          events={placed}
          scrub
          searches={searches}
          note={[
            ...(runs.failed ? ["The agents' runs didn't load, so searches aren't counted."] : []),
            ...(reaches ? [] : [`The search count may be a little low: it only covers the agents' most recent work.`]),
            ...(stopped > 0 ? [`${stopped === 1 ? "1 search" : `${stopped} searches`} didn't finish this week.`] : []),
          ]}
          ctx={ctx}
          campaignId={id}
        />
      </Reading>
    </div>
  );
}

function AllReport({ ctx }: { ctx: MomentCtx }): JSX.Element {
  const days = useMemo(() => lastDays(WEEK), []);
  const home = useAsync(() => homeOverview(WEEK), "home-week");
  const runs = useAsync(() => listRuns({ since: startOf(days[0] ?? "") }), `runs:all:${days[0]}`);
  const ready = home.settled && runs.settled;

  const placed = useMemo<Placed[]>(() => {
    if (!home.data) return [];
    return [...homeEvents(home.data), ...runEvents(runs.data ?? [], days, null).map((e) => ({ ...e, pos: 0 }))];
  }, [home.data, runs.data, days]);

  if (home.failed) return <LoadFailed what="This week's figures" onRetry={home.retry} />;
  const searches = placed.filter((e) => e.kind === "search").length;
  return (
    <div className="src mo">
      <Reading
        ready={ready}
        live="Reading the week's runs"
        done="Read the week's runs"
        steps={ready ? [`${searches === 1 ? "1 search" : `${searches} searches`} by the agents`, "Finds, replies, interviews and hires across your open campaigns"] : []}
        onBusy={ctx.onBusy}
        onGrow={ctx.onGrow}
      >
        <Receipt
          name="All campaigns"
          days={days}
          events={placed}
          scrub={false}
          searches={searches}
          hide={["messages"]}
          always={["found", "reply", "interview", "hired"]}
          note={[
            ...(runs.failed ? ["The agents' runs didn't load, so searches aren't counted."] : []),
            ...(!runs.data || runsReach(runs.data, startOf(days[0] ?? ""), RUN_PAGE) ? [] : [`The search count may be a little low: it only covers the agents' most recent work.`]),
          ]}
          ctx={ctx}
          campaignId={null}
        />
      </Reading>
    </div>
  );
}

function Receipt({
  name, days, events, scrub, searches, hide = [], always = [], note, ctx, campaignId,
}: {
  name: string;
  days: readonly string[];
  events: readonly Placed[];
  /** A track to replay the week on; without one the lines show the whole period. */
  scrub: boolean;
  searches: number;
  hide?: readonly string[];
  /** Lines to show even at zero. */
  always?: readonly EventKind[];
  note: readonly string[];
  ctx: MomentCtx;
  campaignId: string | null;
}) {
  const span = days.length;
  const [at, setAt] = useState(scrub ? 0 : span);
  const replaying = useRef(false);

  /* Replays the week once on arrival: the receipt counts up as the marker travels, then hands
     the marker to the recruiter. With reduced motion it simply shows the whole week. */
  const replay = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { replaying.current = false; setAt(span); return; }
    replaying.current = true;
    const t0 = performance.now();
    const dur = 1800;
    const step = (t: number) => {
      if (!replaying.current) return;
      const k = Math.min(1, (t - t0) / dur);
      setAt(k * span);
      if (k < 1) requestAnimationFrame(step);
      else replaying.current = false;
    };
    requestAnimationFrame(step);
  }, [span]);
  useEffect(() => {
    if (scrub) replay();
    return () => { replaying.current = false; };
  }, [scrub, replay]);

  const receipt = receiptAt(events, at, always);
  const groups = receipt.groups.filter((g) => !hide.includes(g.id));
  const marked = events.filter((e) => MARKED.includes(e.kind));
  const label = dayLabel(days[Math.min(span - 1, Math.floor(at))] ?? "");

  return (
    <section className="mo-card mo-receipt" aria-label="What the agents did">
      <header className="mo-receipt-h">
        <span className="mo-role" aria-hidden="true">A</span>
        <div>
          <b>{name}</b>
          <span>{scrub ? rangeLabel(days) : `Last ${span} days`}{searches > 0 ? ` · ${searches === 1 ? "1 search" : `${searches} searches`} by the agents` : ""}</span>
        </div>
      </header>

      <div className="mo-lines">
        {groups.map((g) => (
          <Fragment key={g.id}>
            <p className="mo-grp">{g.title}</p>
            {g.lines.length === 0 && <p className="lr-plain is-quiet">{g.empty}</p>}
            {g.lines.map((l) => (
              <p key={l.id} className={`mo-line${l.hot && l.n > 0 ? " is-hot" : ""}`}>
                {l.mark && <ServiceMark id={l.mark} size={16} />}
                <span>{l.label}</span>
                <span className="mo-lead" aria-hidden="true" />
                <b>{l.n}</b>
              </p>
            ))}
          </Fragment>
        ))}
        {receipt.rate && (
          <p className="mo-total">
            <span>Reply rate</span>
            <span>{receipt.rate}</span>
          </p>
        )}
      </div>
      {note.map((n) => <p key={n} className="lr-plain is-quiet">{n}</p>)}

      {scrub && (
        <div className="mo-scrub">
          <div className="mo-scrub-track">
            {marked.map((e) => (
              <span
                key={e.key}
                className={`mo-ev is-${e.kind === "interview" || e.kind === "hired" ? "call" : e.kind}${e.pos <= at ? " is-past" : ""}`}
                style={{ left: `${(e.pos / span) * 100}%` }}
                title={markerText(e)}
              />
            ))}
            <input
              type="range"
              min={0}
              max={span * 100}
              value={Math.round(at * 100)}
              onChange={(e) => { replaying.current = false; setAt(Number(e.target.value) / 100); }}
              aria-label="Replay the week"
              aria-valuetext={label}
            />
          </div>
          <div className="mo-scrub-days" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }} aria-hidden="true">
            {days.map((d) => <span key={d}>{dayLabel(d)}</span>)}
          </div>
        </div>
      )}

      <footer className="mo-receipt-f">
        {scrub && (
          <button type="button" className="cn-link" onClick={replay}><ArrowCounterClockwise size={12} weight="bold" aria-hidden="true" />Replay the week</button>
        )}
        <span className="sp" />
        {campaignId && ctx.openCampaign && (
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.openCampaign?.(campaignId)}>Open the campaign</button>
        )}
        <button type="button" className="src-btn is-quiet mo-small" onClick={() => act(ctx, campaignId ? `Where are we losing people on ${name}?` : "Where are we losing people?")}>Find the drop-off</button>
      </footer>
    </section>
  );
}

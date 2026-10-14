import { useMemo } from "react";
import { homeOverview } from "../api/home";
import { digestOf, runsReach } from "../liveReports";
import type { Digest } from "../liveReports";
import { act } from "../moments";
import { LoadFailed } from "../ui";
import { listRuns, RUN_PAGE } from "./data";
import { Reading } from "./Reading";
import { Tick } from "./tick";
import type { LiveViewProps } from "./types";
import { useAsync } from "./useAsync";

/**
 * What happened since the recruiter last looked. The console doesn't keep a last visit, so it
 * is the last day: finds, replies, moves to interviews and hires from the home overview (for
 * everything and for each campaign), the agents' runs, and what is open for them. A campaign
 * with nothing new is named at the end rather than given a row of zeros.
 */

/** A campaign's own page of the day costs a request; this many of the most recently active is plenty. */
const CAMPAIGNS = 8;

async function loadDigest() {
  const [home, runs] = await Promise.all([homeOverview(1), listRuns({ since: Date.now() - 86_400_000 })]);
  const camps = await Promise.all(
    home.campaigns.slice(0, CAMPAIGNS).map(async (c) => ({ id: c.id, name: c.name, nextStep: c.nextStep, day: await homeOverview(1, c.id).catch(() => null) })),
  );
  return { home, runs, camps, more: Math.max(0, home.campaigns.length - CAMPAIGNS) };
}

export default function DigestView({ card, ctx }: LiveViewProps): JSX.Element {
  const load = useAsync(loadDigest, "digest");
  const digest = useMemo<Digest | null>(() => {
    if (!load.data) return null;
    const d = digestOf({ home: load.data.home, camps: load.data.camps, runs: load.data.runs });
    /* The campaign the agent named leads, whatever else moved. */
    return card.campaignId ? { ...d, rows: [...d.rows].sort((a, b) => Number(b.id === card.campaignId) - Number(a.id === card.campaignId)) } : d;
  }, [load.data, card.campaignId]);

  if (load.failed) return <LoadFailed what="The last day" onRetry={load.retry} />;
  const missed = load.data?.camps.filter((c) => !c.day).length ?? 0;
  const top = digest?.rows[0];
  const reaches = !load.data || runsReach(load.data.runs, Date.now() - 86_400_000, RUN_PAGE);
  return (
    <div className="src mo">
      <Reading
        ready={load.settled}
        live="Catching up on the last day"
        done="Caught up on the last day"
        steps={load.data ? [`${load.data.home.campaigns.length === 1 ? "1 open campaign" : `${load.data.home.campaigns.length} open campaigns`}`, "Finds, replies, interviews and hires", "What the agents ran"] : []}
        onBusy={ctx.onBusy}
        onGrow={ctx.onGrow}
      >
        {digest && (
          <>
            <p className="src-para">{digest.lead.map((s, i) => (typeof s === "string" ? s : <b key={i}>{s.b}</b>))}</p>
            {digest.rows.length > 0 && (
              <ul className="mo-digest">
                {digest.rows.map((r) => (
                  <li key={r.id}>
                    {ctx.openCampaign ? (
                      <button type="button" className="lr-link" onClick={() => ctx.openCampaign?.(r.id)}>{r.name}</button>
                    ) : (
                      <b>{r.name}</b>
                    )}
                    <span className="mo-digest-n"><Tick n={r.found} /> found</span>
                    <span className="mo-digest-n"><Tick n={r.replies} /> {r.replies === 1 ? "reply" : "replies"}</span>
                    <span className="mo-digest-note">{r.note}</span>
                  </li>
                ))}
              </ul>
            )}
            {digest.quiet.length > 0 && <p className="lr-plain is-quiet">Nothing new on {digest.quiet.join(", ")}.</p>}
            {digest.unfinished > 0 && <p className="lr-plain is-quiet">{digest.unfinished === 1 ? "1 search" : `${digest.unfinished} searches`} didn't finish in the last day.</p>}
            {!reaches && <p className="lr-plain is-quiet">The search count may be a little low: it only covers the agents' most recent work.</p>}
            {missed > 0 && <p className="lr-plain is-quiet">{missed === 1 ? "One campaign's day" : `${missed} campaigns' days`} didn't load, so {missed === 1 ? "it isn't" : "they aren't"} counted above.</p>}
            {(load.data?.more ?? 0) > 0 && <p className="lr-plain is-quiet">Showing the {CAMPAIGNS} most recently active campaigns.</p>}
            <div className="mo-acts">
              {top ? (
                <>
                  <button type="button" className="src-btn is-primary mo-small" onClick={() => act(ctx, `Show me a report for ${top.name}`)}>See what the agents did on {top.name}</button>
                  <button type="button" className="src-btn is-quiet mo-small" onClick={() => act(ctx, `Where are we losing people on ${top.name}?`)}>Find the drop-off</button>
                </>
              ) : (
                <button type="button" className="src-btn is-quiet mo-small" onClick={() => act(ctx, "What did the agents do this week?")}>See the week instead</button>
              )}
            </div>
          </>
        )}
      </Reading>
    </div>
  );
}

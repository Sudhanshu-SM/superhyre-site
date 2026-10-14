import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ServiceMark } from "./connectors";
import type { CampaignChartData, ChannelRow } from "./liveReports";
import type { ChannelStat, MomentCtx } from "./moments";
import { CARRIER, CHANNEL_LABEL, CHANNEL_STATS, act } from "./moments";
import type { CampaignKey, Scope } from "./orchestrator";
import { FLEET, SCOPED, campaignName, sourcedFor, stepsFor } from "./orchestrator";
import { Area, Funnel, Ring, Spark } from "./viz";
import "./campaign.css";
import "./liveReports.css";

/**
 * CampaignReport — a campaign in charts, inside the conversation.
 *
 * Built from the same series and the same chart components as Home, so the
 * numbers here and on Home can never disagree. Four blocks, in the order a
 * recruiter asks the questions:
 *
 *   how much     four figures with the week's change, the first with its trend
 *   how steady   sourced per day for two weeks
 *   how well     the funnel, each stage over the one it came from
 *   what works   reply rate and reply time by channel, with the finding
 *
 * "All campaigns" adds a row per campaign first, so they can be compared
 * before they are combined.
 */

export function CampaignReport({ scope, ctx }: { scope: Scope; ctx: MomentCtx }) {
  return <CampaignCharts data={fixtureCharts(scope)} ctx={ctx} />;
}

/** The demo's fixtures as the charts' data: the same figures, the same sentences. */
function fixtureCharts(scope: Scope): CampaignChartData {
  const days = sourcedFor(scope);
  const steps = stepsFor(scope);
  const keys: readonly CampaignKey[] = scope === "all" ? SCOPED : [scope];
  const channels = mergeChannels(keys);
  const sourced = days.reduce((a, d) => a + d.n, 0);
  const last7 = days.slice(7).reduce((a, d) => a + d.n, 0);
  const prev7 = days.slice(0, 7).reduce((a, d) => a + d.n, 0);
  const n = (id: string) => steps.find((s) => s.id === id)!;

  const kpis = [
    { label: "Sourced", n: sourced, sub: `${last7 - prev7 >= 0 ? "+" : ""}${last7 - prev7} vs last week`, up: last7 >= prev7, spark: days.map((d) => d.n) },
    { label: "Contacted", n: n("contacted").n, sub: `${pct(n("contacted").n, sourced)} of sourced` },
    { label: "Replied", n: n("replied").n, sub: `${pct(n("replied").n, n("contacted").n)} reply rate` },
    { label: "Interviews", n: n("interviews").n, sub: `${pct(n("interviews").n, n("contacted").n)} of people contacted` },
  ];

  const best = [...channels].filter((c) => c.sent > 0).sort((a, b) => b.replied / b.sent - a.replied / a.sent)[0]!;
  const email = channels.find((c) => c.channel === "gmail")!;
  const faster = email.medianHours && best.medianHours ? Math.round(email.medianHours / best.medianHours) : 0;

  return {
    kpis,
    ...(scope === "all"
      ? {
          byCampaign: SCOPED.map((k) => {
            const d = sourcedFor(k);
            const s = stepsFor(k);
            return {
              id: k,
              name: campaignName(k),
              meta: `${FLEET.filter((a) => a.campaignId === k).length} agents`,
              spark: d.map((x) => x.n),
              found: d.reduce((a, x) => a + x.n, 0),
              reply: { value: s.find((x) => x.id === "replied")!.n, max: s.find((x) => x.id === "contacted")!.n },
            };
          }),
        }
      : {}),
    series: [{ id: "sourced", label: "Sourced", title: "Sourced per day", note: `last 14 days · ${sourced} total`, noun: "sourced", days }],
    steps,
    works: {
      sub: "reply rate and median time to reply, by channel",
      stats: channels,
      find: `${CHANNEL_LABEL[best.channel]} gets the best reply rate at ${pct(best.replied, best.sent)}${faster > 1 ? `, and people answer about ${faster}× faster there than by email` : ""}.`,
      empty: null,
      note: null,
      acts: [
        { label: `Follow up on ${CHANNEL_LABEL[best.channel]}`, seed: `Reach out again on ${CHANNEL_LABEL[best.channel]} to everyone who hasn't replied`, primary: true },
        { label: "Find the drop-off", seed: "Where are we losing people?" },
      ],
    },
  };
}

/**
 * The charts themselves, from data: the demo hands them its fixtures, a connected console its
 * campaign's real figures. Nothing in here knows which.
 */
export function CampaignCharts({ data, ctx }: { data: CampaignChartData; ctx: MomentCtx }) {
  const [tab, setTab] = useState(0);
  const series = data.series[Math.min(tab, data.series.length - 1)];
  const { works } = data;

  return (
    <div className="cr">
      <div className="cr-kpis">
        {data.kpis.map((k, i) => (
          <div key={k.label} className="cr-kpi" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="cr-kpi-l">{k.label}</span>
            <Count n={k.n} />
            {k.sub && <span className={`cr-kpi-s${k.up === false ? " is-down" : k.up ? " is-up" : ""}`}>{k.sub}</span>}
            {k.spark && <div className="cr-kpi-spark"><Spark data={k.spark} hue="brand" w={90} h={22} /></div>}
          </div>
        ))}
      </div>

      {data.byCampaign && (
        <section className="cr-card">
          <h4>By campaign</h4>
          <ul className="cr-camps">
            {data.byCampaign.map((c) => (
              <li key={c.id}>
                <span className="cr-camp-n">
                  <b>{c.name}</b>
                  <span>{c.meta}</span>
                </span>
                {c.spark.some((v) => v > 0) && <Spark data={c.spark} hue="brand" w={120} h={26} />}
                <span className="cr-camp-v"><b>{c.found}</b> {data.foundWord ?? "sourced"}</span>
                {c.reply ? (
                  <span className="cr-camp-ring">
                    <Ring value={c.reply.value} max={c.reply.max} hue="sage" size={34} width={4} />
                    <span><b>{pct(c.reply.value, c.reply.max)}</b> reply</span>
                  </span>
                ) : (
                  <span className="cr-camp-ring"><span>No one contacted yet</span></span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {series && (
        <section className="cr-card">
          <div className="cr-card-h">
            <h4>{series.title}</h4>
            <span>{series.note}</span>
            {data.series.length > 1 && (
              <div className="lr-seg" role="group" aria-label="What to chart">
                {data.series.map((s, i) => (
                  <button key={s.id} type="button" aria-pressed={i === tab} onClick={() => setTab(i)}>{s.label}</button>
                ))}
              </div>
            )}
          </div>
          <Area data={series.days} hue="brand" accent="var(--accent-fill)" h={150} labels={5} noun={series.noun} />
        </section>
      )}

      <section className="cr-card">
        <div className="cr-card-h">
          <h4>Funnel</h4>
          <span>each stage over the one before it</span>
        </div>
        {data.funnelEmpty ? <p className="lr-plain">{data.funnelEmpty}</p> : <Funnel stages={data.steps} />}
      </section>

      <section className="cr-card">
        <div className="cr-card-h">
          <h4>What works</h4>
          <span>{works.sub}</span>
        </div>
        {works.stats.length > 0 && <Channels stats={works.stats} />}
        {works.empty && <p className="lr-plain">{works.empty}</p>}
        {works.find && (
          <p className="cr-find">
            <Sparkle size={13} weight="fill" aria-hidden="true" />
            {works.find}
          </p>
        )}
        {works.note && <p className="lr-plain is-quiet">{works.note}</p>}
        <div className="mo-acts">
          {works.acts.map((a) => (
            <button key={a.label} type="button" className={`src-btn ${a.primary ? "is-primary" : "is-quiet"} mo-small`} onClick={() => act(ctx, a.seed)}>
              {a.label}{a.primary && <ArrowRight size={13} weight="bold" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Channels({ stats }: { stats: readonly ChannelRow[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  const max = Math.max(...stats.map((s) => (s.sent ? s.replied / s.sent : 0)), 0.01);
  /* A time to reply is only drawn when the records have one for some channel. */
  const timed = stats.some((s) => s.medianHours !== null);
  return (
    <ul className={`cr-ch${timed ? "" : " is-short"}`}>
      {stats.map((s) => {
        const rate = s.sent ? s.replied / s.sent : 0;
        return (
          <li key={s.channel}>
            <span className="cr-ch-n"><ServiceMark id={CARRIER[s.channel]} size={18} />{CHANNEL_LABEL[s.channel]}</span>
            <span className="cr-ch-bar"><i style={{ transform: `scaleX(${grown ? rate / max : 0})` }} /></span>
            <span className="cr-ch-v"><b>{pct(s.replied, s.sent)}</b> · {s.replied}/{s.sent}</span>
            {timed && <span className="cr-ch-t">{s.medianHours ? `${s.medianHours}h` : "no replies"}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function mergeChannels(keys: readonly CampaignKey[]): ChannelStat[] {
  const ids = ["whatsapp", "gmail", "linkedin"] as const;
  return ids.map((ch) => {
    const rows = keys.map((k) => CHANNEL_STATS[k].find((c) => c.channel === ch)!);
    const sent = rows.reduce((a, r) => a + r.sent, 0);
    const replied = rows.reduce((a, r) => a + r.replied, 0);
    const withReplies = rows.filter((r) => r.replied);
    const medianHours = withReplies.length ? Math.round(withReplies.reduce((a, r) => a + r.medianHours, 0) / withReplies.length) : 0;
    return { channel: ch, sent, replied, medianHours };
  });
}

// A share over 100% means the base missed people who joined later (added by hand); show none.
const pct = (a: number, b: number) => (b && a <= b ? `${Math.round((a / b) * 100)}%` : "–");

function Count({ n }: { n: number }) {
  const [shown, setShown] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) { setShown(n); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      setShown(Math.round(n * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else done.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <b className="cr-kpi-n">{shown.toLocaleString("en-IN")}</b>;
}

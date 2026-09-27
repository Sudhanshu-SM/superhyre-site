import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ServiceMark } from "./connectors";
import type { ChannelStat, MomentCtx } from "./moments";
import { CARRIER, CHANNEL_LABEL, CHANNEL_STATS } from "./moments";
import type { CampaignKey, Scope } from "./orchestrator";
import { FLEET, SCOPED, campaignName, sourcedFor, stepsFor } from "./orchestrator";
import { Area, Funnel, Ring, Spark } from "./viz";
import "./campaign.css";

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
    { label: "Interviews", n: n("interviews").n, sub: `${pct(n("interviews").n, n("replied").n)} of replies` },
  ];

  const best = [...channels].filter((c) => c.sent > 0).sort((a, b) => b.replied / b.sent - a.replied / a.sent)[0]!;
  const email = channels.find((c) => c.channel === "gmail")!;
  const faster = email.medianHours && best.medianHours ? Math.round(email.medianHours / best.medianHours) : 0;

  return (
    <div className="cr">
      <div className="cr-kpis">
        {kpis.map((k, i) => (
          <div key={k.label} className="cr-kpi" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="cr-kpi-l">{k.label}</span>
            <Count n={k.n} />
            <span className={`cr-kpi-s${k.up === false ? " is-down" : k.up ? " is-up" : ""}`}>{k.sub}</span>
            {k.spark && <div className="cr-kpi-spark"><Spark data={k.spark} hue="brand" w={90} h={22} /></div>}
          </div>
        ))}
      </div>

      {scope === "all" && (
        <section className="cr-card">
          <h4>By campaign</h4>
          <ul className="cr-camps">
            {SCOPED.map((k) => {
              const d = sourcedFor(k);
              const s = stepsFor(k);
              const c = s.find((x) => x.id === "contacted")!.n;
              const r = s.find((x) => x.id === "replied")!.n;
              return (
                <li key={k}>
                  <span className="cr-camp-n">
                    <b>{campaignName(k)}</b>
                    <span>{FLEET.filter((a) => a.campaignId === k).length} agents</span>
                  </span>
                  <Spark data={d.map((x) => x.n)} hue="brand" w={120} h={26} />
                  <span className="cr-camp-v"><b>{d.reduce((a, x) => a + x.n, 0)}</b> sourced</span>
                  <span className="cr-camp-ring">
                    <Ring value={r} max={c} hue="sage" size={34} width={4} />
                    <span><b>{pct(r, c)}</b> reply</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="cr-card">
        <div className="cr-card-h">
          <h4>Sourced per day</h4>
          <span>last 14 days · {sourced} total</span>
        </div>
        <Area data={days} hue="brand" accent="var(--accent-fill)" h={150} labels={5} noun="sourced" />
      </section>

      <section className="cr-card">
        <div className="cr-card-h">
          <h4>Funnel</h4>
          <span>each stage over the one before it</span>
        </div>
        <Funnel stages={steps} />
      </section>

      <section className="cr-card">
        <div className="cr-card-h">
          <h4>What works</h4>
          <span>reply rate and median time to reply, by channel</span>
        </div>
        <Channels stats={channels} />
        <p className="cr-find">
          <Sparkle size={13} weight="fill" aria-hidden="true" />
          {CHANNEL_LABEL[best.channel]} gets the best reply rate at {pct(best.replied, best.sent)}
          {faster > 1 ? `, and people answer about ${faster}× faster there than by email` : ""}.
        </p>
        <div className="mo-acts">
          <button type="button" className="src-btn is-primary mo-small" onClick={() => ctx.seed(`Reach out again on ${CHANNEL_LABEL[best.channel]} to everyone who hasn't replied`)}>
            Follow up on {CHANNEL_LABEL[best.channel]}<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.seed("Where are we losing people?")}>
            Find the drop-off
          </button>
        </div>
      </section>
    </div>
  );
}

function Channels({ stats }: { stats: readonly ChannelStat[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  const max = Math.max(...stats.map((s) => (s.sent ? s.replied / s.sent : 0)), 0.01);
  return (
    <ul className="cr-ch">
      {stats.map((s) => {
        const rate = s.sent ? s.replied / s.sent : 0;
        return (
          <li key={s.channel}>
            <span className="cr-ch-n"><ServiceMark id={CARRIER[s.channel]} size={18} />{CHANNEL_LABEL[s.channel]}</span>
            <span className="cr-ch-bar"><i style={{ transform: `scaleX(${grown ? rate / max : 0})` }} /></span>
            <span className="cr-ch-v"><b>{pct(s.replied, s.sent)}</b> · {s.replied}/{s.sent}</span>
            <span className="cr-ch-t">{s.medianHours ? `${s.medianHours}h` : "no replies"}</span>
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

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

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

import { useLayoutEffect, useMemo, useState } from "react";
import { retryOverview, retryPipeline, useCampaignOverview, useOverviewFailed, usePipeline, usePipelineFailed, usePipelineReady } from "../campaignStore";
import { adviceFor, chainOf, reachFrom, stuckAside, stuckOf, widestDrop } from "../liveReports";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import { LoadFailed } from "../ui";
import { Reading } from "./Reading";
import { ScopeGate } from "./scope";
import type { LiveViewProps } from "./types";

/**
 * Where people drop out of a campaign, and the one thing to do about it. The bars are the
 * campaign's own funnel (everyone who got as far as each stage); the widest drop between
 * neighbours is marked; the lines under it say who is sitting where right now and for how
 * long, from the board. The advice is written from those numbers, so it changes when they do.
 */
export default function LeakView({ card, ctx }: LiveViewProps): JSX.Element {
  return (
    <ScopeGate kind="leak" card={card} ctx={ctx} ask="Which campaign should I look at?">
      {(scope, c) => <OneLeak id={scope} ctx={c} />}
    </ScopeGate>
  );
}

function OneLeak({ id, ctx }: { id: string; ctx: MomentCtx }): JSX.Element {
  const ov = useCampaignOverview(id);
  const failed = useOverviewFailed(id);
  const people = usePipeline(id);
  const boardReady = usePipelineReady(id);
  const boardFailed = usePipelineFailed(id);
  const ready = !!ov && boardReady;

  const model = useMemo(() => {
    if (!ov) return null;
    const reach = reachFrom(ov.funnel);
    const chain = chainOf(reach);
    const drop = widestDrop(chain);
    const stuck = stuckOf(people);
    return { chain, drop, stuck, advice: adviceFor(drop, stuck, ov.campaign.name, reach) };
  }, [ov, people]);

  const [grown, setGrown] = useState(false);
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (failed) return <LoadFailed what="This campaign" onRetry={() => retryOverview(id)} />;
  if (boardFailed) return <LoadFailed what="This pipeline" onRetry={() => retryPipeline(id)} />;
  const max = Math.max(1, model?.chain[0]?.n ?? 0);
  return (
    <div className="src mo">
      <Reading
        ready={ready}
        live="Counting every stage of the pipeline"
        done="Counted every stage"
        steps={model ? ["Everyone who got as far as each stage", `Where the ${people.length === 1 ? "1 person" : `${people.length} people`} on the board are now, and for how long`, model.drop ? "Found the widest stage-to-stage drop" : "Too few people at each stage to name a drop"] : []}
        onBusy={ctx.onBusy}
        onGrow={ctx.onGrow}
      >
        {model && ov && (
          <>
            <section className="mo-card" aria-label="Pipeline">
              <div className="mo-card-h"><b>{ov.campaign.name}</b><span>everyone who got this far</span></div>
              <ol className="mo-funnel">
                {model.chain.map((s) => {
                  const isLeak = model.drop?.to.id === s.id;
                  return (
                    <li key={s.id} className={isLeak ? "is-leak" : undefined}>
                      <span className="mo-funnel-l">{s.label}</span>
                      <span className="mo-funnel-bar"><i style={{ transform: `scaleX(${grown ? s.n / max : 0})` }} /></span>
                      <b>{s.n}</b>
                      {isLeak && model.drop && <span className="mo-funnel-note">only {Math.round(model.drop.kept * 100)}% of {model.drop.from.label.toLowerCase()}</span>}
                    </li>
                  );
                })}
              </ol>
              {model.stuck.length > 0 && (
                <>
                  <p className="mo-grp">Right now</p>
                  <ul className="lr-stuck">
                    {model.stuck.map((s) => {
                      const aside = stuckAside(s);
                      return (
                        <li key={s.kind}>
                          <span>{s.text}</span>
                          {aside && <span className="lr-stuck-w">{aside}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
            <p className="src-para">{model.advice.text}</p>
            {model.advice.acts.length > 0 && (
              <div className="mo-acts">
                {model.advice.acts.map((a) => (
                  <button key={a.label} type="button" className={`src-btn ${a.primary ? "is-primary" : "is-quiet"} mo-small`} onClick={() => act(ctx, a.seed)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Reading>
    </div>
  );
}

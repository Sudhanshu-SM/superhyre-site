import { useMemo } from "react";
import { getOutreachAnalytics, getProjectsAnalytics } from "../api/analytics";
import { retryOverview, useCampaignOverview, useCampaignRows, useOverviewFailed } from "../campaignStore";
import { CampaignCharts } from "../CampaignReport";
import { allCampaignCharts, ALL, eventsOf, openProjects, oneCampaignCharts } from "../liveReports";
import type { MomentCtx } from "../moments";
import { LoadFailed } from "../ui";
import { Reading } from "./Reading";
import { ScopeGate } from "./scope";
import type { LiveViewProps } from "./types";
import { useAsync } from "./useAsync";
import { useCampaignLog } from "./useCampaignLog";

/**
 * A campaign in charts: found, replies and interviews over time, the funnel and what email did,
 * for one campaign or all of them together. The charts are the demo's own (CampaignReport);
 * what they draw is the campaign's overview, its log and the workspace's analytics.
 */
export default function CampaignView({ card, ctx }: LiveViewProps): JSX.Element {
  return (
    <ScopeGate kind="campaign" card={card} ctx={ctx} all ask="Which campaign should I chart?">
      {(scope, c) => (scope === ALL ? <AllCampaigns ctx={c} /> : <OneCampaign id={scope} ctx={c} />)}
    </ScopeGate>
  );
}

/** A day more than the fortnight shown, so the first calendar day is whole whatever the hour. */
const FORTNIGHT = 15 * 86_400_000;

function OneCampaign({ id, ctx }: { id: string; ctx: MomentCtx }): JSX.Element {
  const ov = useCampaignOverview(id);
  const failed = useOverviewFailed(id);
  const since = useMemo(() => Date.now() - FORTNIGHT, []);
  const log = useCampaignLog(id, since);
  const email = useAsync(() => getOutreachAnalytics(30), "outreach-30");

  const ready = !!ov && log.covered && email.settled;
  const data = useMemo(
    () => (ov && ready ? oneCampaignCharts({ overview: ov, events: eventsOf(log.items ?? []), outreach: email.data ?? null }) : null),
    [ov, ready, log.items, email.data],
  );

  if (failed) return <LoadFailed what="This campaign" onRetry={() => retryOverview(id)} />;
  return (
    <div className="src mo">
      <Reading
        ready={ready}
        live="Pulling the last two weeks"
        done="Pulled the last 14 days"
        steps={ov ? [`${ov.found.total.toLocaleString("en-IN")} people found, ${ov.kept.total.toLocaleString("en-IN")} kept`, "Replies and interviews, day by day, from the campaign log", "Email results for the last 30 days"] : []}
        onBusy={ctx.onBusy}
        onGrow={ctx.onGrow}
      >
        <p className="src-para">{ov?.campaign.name}, last 14 days.</p>
        {data && <CampaignCharts data={data} ctx={ctx} />}
      </Reading>
    </div>
  );
}

function AllCampaigns({ ctx }: { ctx: MomentCtx }): JSX.Element {
  const projects = useAsync(getProjectsAnalytics, "projects");
  const email = useAsync(() => getOutreachAnalytics(30), "outreach-30");
  const rows = useCampaignRows();

  const ready = projects.settled && email.settled;
  const open = useMemo(() => (projects.data ? openProjects(projects.data.campaigns) : []), [projects.data]);
  const data = useMemo(() => {
    if (!projects.data || !ready) return null;
    const trends = Object.fromEntries(rows.map((r) => [r.id, r.trend]));
    return allCampaignCharts({ projects: projects.data.campaigns, trends, outreach: email.data ?? null });
  }, [projects.data, ready, rows, email.data]);

  if (projects.failed) return <LoadFailed what="Your campaigns" onRetry={projects.retry} />;
  return (
    <div className="src mo">
      <Reading
        ready={ready}
        live="Pulling every campaign"
        done={`Pulled ${open.length === 1 ? "your campaign" : `${open.length} campaigns`}`}
        steps={["Found, contacted, replied and hired, for each campaign", "Each campaign's last 14 days of finds", "Email results for the last 30 days"]}
        onBusy={ctx.onBusy}
        onGrow={ctx.onGrow}
      >
        {open.length === 0 ? (
          <p className="src-para">There are no campaigns to chart yet.</p>
        ) : (
          <>
            <p className="src-para">{open.length === 1 ? "Your one campaign, last 14 days." : `All ${open.length} campaigns, compared and then combined.`}</p>
            {data && <CampaignCharts data={data} ctx={ctx} />}
          </>
        )}
      </Reading>
    </div>
  );
}

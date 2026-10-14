import { CaretDown, Plus } from "@phosphor-icons/react";
import { useCallback } from "react";
import { LIVE } from "./api/client";
import type { CampaignRow } from "./campaignsData";
import { retryCampaigns, useCampaignRows, useCampaignsFailed, useCampaignsReady } from "./campaignStore";
import { LoadFailed } from "./ui";
import { CampaignsList, InsightsCard, TodayCard, WeekCard, startNewCampaign } from "./HomeCards";
import { ComingUpCard } from "./HomeComing";
import { browserZone } from "./schedulesView";
import { retryHome, useHomeFailed, useHomeReady } from "./homeStore";
import type { Scope } from "./orchestrator";
import { Loader } from "./components/Loader";
import { useWarmup } from "./warmup";
import { SCOPED, campaignName } from "./orchestrator";
import { useCan } from "./can";
import { useSession, visibleCampaigns } from "./roleStore";

/**
 * Home — the day's work and the market on top, the week and campaigns below.
 *
 * ── A FIXED OVERVIEW, NOT A CONFIGURABLE ONE ────────────────────────────────
 * The tile gallery is gone: no sizes, no hues, no reordering, no `localStorage`
 * layout. What Home shows is now a decision rather than a preference.
 *
 * That is a real simplification and worth naming. Configurability was solving
 * "different recruiters watch different numbers", but it cost a persisted
 * schema, a version to bump on every shape change, two popovers, a drag
 * interaction, and a resting state that had to look deliberate at three sizes
 * and seven colours. An overview that answers the same four questions for
 * everybody needs none of that, and it can be composed rather than tiled.
 *
 * ── THE COMPOSITION ────────────────────────────────────────────────────────
 * A bento sized by relevance. The top row is the day: Tasks (7 of 12
 * columns, "what should I do now") beside the Market tile (5), both stretched
 * to fill the screen. The bottom row is the context, in a shorter band of the
 * same 7 | 5 split: Your week under Tasks, Active campaigns under Market. The
 * two rows share one vertical line, which is what makes the grid read calm.
 *
 * On a desktop window the page never scrolls; a list longer than its tile
 * scrolls inside the tile instead (home.css). Below 1240px the tiles stack.
 *
 * ── THE SCOPE IS ONE PIECE OF STATE WITH TWO ENTRY POINTS ───────────────────
 * The campaign filter appears twice — once in the page header, once in the task
 * card — and both write the SAME state, which lives in Console. Not two
 * filters: two handles on one. A second, private campaign filter inside the
 * task list would put two controls on screen reading "All campaigns" and
 * "Platform SRE", each right about a different half of the page.
 *
 * Home itself holds no state at all. It receives the scope and a setter, and
 * hands both down. That is what lets the scope survive navigating to the Agent
 * and back.
 */

export function Home({
  onBrief, name, scope, onScope, onOpenCampaign, timeZone,
}: {
  /** Opens a campaign's Overview (sets it as the current campaign first). */
  onOpenCampaign: (r: CampaignRow) => void;
  /** Hands a prompt to the Agent page and navigates there. */
  onBrief: (prompt: string) => void;
  /** First name for the greeting; Console derives it and falls back. */
  name: string;
  scope: Scope;
  onScope: (s: Scope) => void;
  /** The person's own zone, as their profile has it; the browser's where it is not given. */
  timeZone?: string;
}) {
  /* Stable, so Tasks does not re-render on every Home render for a callback
     that never changes. */
  const brief = useCallback((prompt: string) => onBrief(prompt), [onBrief]);
  const canCreate = useCan("campaign.create");
  const warm = useWarmup();
  const homeReady = useHomeReady();
  const campaignsReady = useCampaignsReady();
  const ready = LIVE ? homeReady && campaignsReady : warm;
  const homeFailed = useHomeFailed();
  const campaignsFailed = useCampaignsFailed();
  const failed = homeFailed || campaignsFailed;
  /* The scope menu offers the campaigns this person can see; on fixtures, the seeded set. */
  const rows = useCampaignRows();
  const session = useSession();
  const scopes = LIVE
    ? visibleCampaigns(rows, session).filter((r) => r.status === "active").map((r) => ({ id: r.id, name: r.name }))
    : SCOPED.map((k) => ({ id: k, name: campaignName(k) }));

  return (
    <div className="orc is-solo">
      <div className={`orc-main${ready && failed ? " is-failed" : ""}`}>
        <header className="orc-page is-greet">
          {/* GREETED, NOT TITLED. "Home" labelled the route, which the sidebar
              already does — the nav item is highlighted and says Home, so the
              heading was the second telling of the least interesting fact on
              the page. A greeting spends the same pixels on something only
              this page can say. */}
          <div className="hm-greet">
            <h1 className="orc-page-h is-greet hm-hello">Hello {name}</h1>
            <p className="hm-date">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>

          <div className="orc-page-r">
            {/* Scopes the WHOLE page, which is why it sits in the page header
                rather than on one card. A filter parked inside a card looks
                like it narrows that card. */}
            <label className="tk-sel is-lg">
              <select
                className="tk-sel-i"
                value={scope}
                onChange={(e) => onScope(e.target.value as Scope)}
                aria-label="Scope the overview to one campaign"
              >
                <option value="all">All campaigns</option>
                {scopes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <CaretDown size={12} weight="bold" aria-hidden="true" />
            </label>

            {/* WIRED, and wired to the thing that actually creates a campaign.
                There is no campaigns table and no create endpoint, so the
                tempting version of this button is a modal with a name field
                that posts nowhere — a control implying a capability the
                backend does not have.

                But the product's own model already answers it: you do not fill
                in a campaign, you BRIEF the agent and the agent opens one. So
                this hands the composer a seeded prompt and navigates there,
                which is a real action with a real destination — the same move
                the task rows make with "Ask the agent". */}
            {/* One "New campaign" everywhere: same look and the same dialog as
                the Campaigns page, so the button never means two things. */}
            {/* Admins create campaigns; a recruiter does not see the button. */}
            {canCreate && (
              <button
                type="button"
                className="cg-new"
                onClick={startNewCampaign}
              >
                <span className="cg-new-ico" aria-hidden="true"><Plus size={14} weight="bold" /></span>
                <span className="cg-new-l">New campaign</span>
              </button>
            )}
          </div>
        </header>

        <div className="orc-stream" aria-busy={!ready}>
          {ready && failed ? (
            <LoadFailed what="Your day" onRetry={() => { retryHome(); retryCampaigns(); }} />
          ) : ready ? (
            <div className={`hm-bento${LIVE ? " is-three" : ""}`}>
              <TodayCard scope={scope} onOpen={brief} />
              <InsightsCard onAsk={brief} />
              <WeekCard scope={scope} />
              <CampaignsList scope={scope} onOpen={onOpenCampaign} />
              {/* What the agent has set up for later: reminders and follow-ups, the next five. Live only: it reads
                  the schedule routes, which the prototype's fixtures do not have. */}
              {LIVE && <ComingUpCard scope={scope} timeZone={timeZone ?? browserZone()} />}
            </div>
          ) : <Loader size="lg" label="Loading your home" block />}
        </div>
      </div>
    </div>
  );
}

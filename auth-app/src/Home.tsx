import { CaretDown, Plus } from "@phosphor-icons/react";
import { useCallback } from "react";
import type { CSSProperties } from "react";
import { LIVE } from "./api/client";
import type { CampaignRow } from "./campaignsData";
import { retryCampaigns, useCampaignRows, useCampaignsFailed, useCampaignsReady } from "./campaignStore";
import { LoadFailed } from "./ui";
import { CampaignsList, InsightsCard, TodayCard, WeekCard, bentoKind, bentoPlan, startNewCampaign, tileRing } from "./HomeCards";
import { ComingUpCard } from "./HomeComing";
import { browserZone } from "./schedulesView";
import { retryHome, useHomeFailed, useHomeReady } from "./homeStore";
import type { Scope } from "./orchestrator";
import { Shimmer, ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { ComingGhost } from "./ComingUp";
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
          ) : <HomeShimmer />}
        </div>
      </div>
    </div>
  );
}

/**
 * Home while it loads: the same tiles in the same places, built from the real tiles' own classes (the header, the
 * task columns and groups, the carousel and story rows, the quad, the bento of campaign tiles), with the static words
 * (a tile's name, the task columns, "Latest", the week's four labels) real and only the data shimmering.
 */
const WEEK_LABELS = ["Offers accepted", "Replies", "Moved to interview", "People found"] as const;

/* The campaigns card while it loads: the five-tile bento, as three rows of tiles. */
const SKELETON_TILES = bentoPlan(5, 3).tiles;
const SKELETON_ROW = 140;
const SKELETON_COL = 90;

function HomeShimmer(): JSX.Element {
  return (
    <ShimmerRegion label="Loading your home" className={`hm-bento${LIVE ? " is-three" : ""}`}>
      <section className="hm-card hm-today" aria-hidden="true">
        <header className="hm-th">
          <h2>My tasks</h2>
          <span className="hm-prog"><small><Shimmer h={11} w={70} lh={16} /><Shimmer h={11} w={54} lh={16} /></small><Shimmer circle w={32} h={32} /></span>
          <Shimmer circle w={32} h={32} />
        </header>
        <div className="hm-today-b hm-tl">
          <div className="hm-tl-cols">
            <span /><span>Task</span><span className="hm-tl-c-camp">Campaign</span><span className="hm-tl-c-st">Status</span><span>Due</span>
          </div>
          {([["today", "Today", 3], ["later", "Later", 3]] as const).map(([id, title, n]) => (
            <section key={id} className={`hm-tl-g is-${id}`}>
              <header className="hm-tl-gh">
                <span className="hm-tl-gt"><span>{title}</span><Shimmer h={11} w={14} /></span>
              </header>
              <ul className="hm-tl-rows">
                {Array.from({ length: n }, (_, i) => (
                  <li key={i}>
                    <Shimmer circle w={18} h={18} />
                    <Shimmer h={13} w={`${48 + ((i * 19 + (id === "later" ? 11 : 0)) % 40)}%`} />
                    <span className="hm-tl-camp"><Shimmer h={12} w="70%" /></span>
                    <span className="hm-tl-st"><Shimmer h={12} w={52} /></span>
                    <span className="hm-tl-due"><Shimmer h={12} w={66} /></span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="hm-add"><Shimmer w={14} h={14} r={4} /><Shimmer h={12} w="22%" /></div>
      </section>

      <section className="hm-card hm-ins" aria-hidden="true">
        <header className="hm-th">
          <h2>Insights</h2>
          <Shimmer circle w={32} h={32} />
        </header>
        <div className="hm-car">
          <div className="hm-car-frame">
            <div className="hm-car-track">
              <div className="hm-slide">
                <div className="hm-feat">
                  <Shimmer h="auto" r={12} style={{ alignSelf: "stretch", minHeight: 112 }} />
                  <span className="hm-feat-t">
                    <ShimmerText lines={2} h={14} gap={6} />
                    <ShimmerText lines={2} h={11} gap={6} last="70%" />
                    <span className="hm-feat-m"><Shimmer h={11} w="46%" /></span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="hm-car-prog">
            {[0, 1, 2, 3].map((k) => <Shimmer key={k} w={20} h={3} r={2} style={{ margin: "0 3px" }} />)}
          </div>
        </div>
        <h3 className="hm-feed-h">Latest</h3>
        <div className="hm-ticker is-static">
          <ul className="hm-stories">
            {[0, 1, 2, 3, 4].map((k) => (
              <li key={k}>
                <div className="hm-story">
                  <Shimmer w={44} h={44} r={10} />
                  <span className="hm-story-t">
                    <Shimmer h={13} w={`${70 + ((k * 13) % 26)}%`} />
                    <Shimmer h={11} w={`${40 + ((k * 17) % 22)}%`} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hm-card hm-week" aria-hidden="true">
        <header className="hm-th">
          <h2>Your week</h2>
          <small>Last 7 days</small>
          <Shimmer circle w={32} h={32} />
        </header>
        <div className="hm-quad">
          {WEEK_LABELS.map((label, i) => (
            <div key={label} className="hm-quad-c">
              <span className="hm-quad-l">{label}</span>
              <span className="hm-quad-v">
                <Shimmer h={26} lh={32} w={`${34 + ((i * 9) % 14)}px`} r={8} />
                <Shimmer h={11} lh={20} w={96 - i * 6} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="hm-card hm-camps" aria-hidden="true">
        <header className="hm-th">
          <h2>Active campaigns</h2>
          <Shimmer circle w={32} h={32} />
        </header>
        <ul className="hm-cl" style={{ "--rows": 3, "--rh": `${SKELETON_ROW}px` } as CSSProperties}>
          {SKELETON_TILES.map((t, k) => (
            <li key={k} className={`is-${bentoKind(t)}`} style={{ gridColumn: `${t.col} / span ${t.c}`, gridRow: `${t.row} / span ${t.r}` }}>
              <button type="button" disabled tabIndex={-1}>
                <span className="hm-cl-d"><Shimmer ring={7} w={tileRing(t, SKELETON_COL, SKELETON_ROW)} h={tileRing(t, SKELETON_COL, SKELETON_ROW)} /></span>
                <span className="hm-cl-t">
                  <Shimmer h={13} lh={20} w={`${64 + ((k * 23) % 36)}px`} />
                  <Shimmer h={11} lh={16} w={`${44 + ((k * 17) % 30)}px`} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {LIVE && (
        <section className="hm-card hm-coming" aria-hidden="true">
          <header className="hm-th"><h2>Coming up</h2></header>
          <div className="hm-coming-b"><ComingGhost compact n={4} /></div>
        </section>
      )}
    </ShimmerRegion>
  );
}

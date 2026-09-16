import { CaretDown, Plus } from "@phosphor-icons/react";
import { useCallback } from "react";
import { CampaignsCard, ProgressCard, SourcedCard } from "./Overview";
import type { Scope } from "./orchestrator";
import { SCOPED, campaignName } from "./orchestrator";
import { Tasks } from "./Tasks";

/**
 * Home — today's work on the left, the numbers on the right.
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
 * Two columns, 50/50. The task list on the left because the guidance is that
 * "the top-left is prime real estate" and this page's question is what should
 * I do now — the list answers it; the numbers are why.
 *
 * The right column is three equal cards whose combined height equals the
 * list's. They are grid rows in a stretched track rather than three cards with
 * heights of their own, so the two columns stay level by construction: no card
 * knows the list's height and none has to be told it.
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
  onBrief, name, scope, onScope,
}: {
  /** Hands a prompt to the Agent page and navigates there. */
  onBrief: (prompt: string) => void;
  /** First name for the greeting; Console derives it and falls back. */
  name: string;
  scope: Scope;
  onScope: (s: Scope) => void;
}) {
  /* Stable, so Tasks does not re-render on every Home render for a callback
     that never changes. */
  const brief = useCallback((prompt: string) => onBrief(prompt), [onBrief]);

  return (
    <div className="orc is-solo">
      <div className="orc-main">
        <header className="orc-page is-greet">
          {/* GREETED, NOT TITLED. "Home" labelled the route, which the sidebar
              already does — the nav item is highlighted and says Home, so the
              heading was the second telling of the least interesting fact on
              the page. A greeting spends the same pixels on something only
              this page can say. */}
          <h1 className="orc-page-h is-greet">Hello {name}</h1>

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
                {SCOPED.map((k) => (
                  <option key={k} value={k}>{campaignName(k)}</option>
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
            <button
              type="button"
              className="orc-new"
              onClick={() => brief("Start a new campaign. The role is ")}
            >
              <Plus size={13} weight="bold" aria-hidden="true" />
              New campaign
            </button>
          </div>
        </header>

        <div className="orc-stream">
          <div className="ov">
            <Tasks onOpen={brief} hero today scope={scope} onScope={onScope} />

            <div className="ov-stack">
              <SourcedCard scope={scope} />
              <ProgressCard scope={scope} />
              <CampaignsCard scope={scope} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

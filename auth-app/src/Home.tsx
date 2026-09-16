import { useCallback } from "react";
import { CampaignsCard, ProgressCard, SourcedCard } from "./Overview";
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
 */

export function Home({
  onBrief,
}: {
  /** Hands a prompt to the Agent page and navigates there. */
  onBrief: (prompt: string) => void;
}) {
  /* Stable, so Tasks does not re-render on every Home render for a callback
     that never changes. */
  const brief = useCallback((prompt: string) => onBrief(prompt), [onBrief]);

  return (
    <div className="orc is-solo">
      <div className="orc-main">
        <header className="orc-page">
          <h1 className="orc-page-h">Home</h1>
        </header>

        <div className="orc-stream">
          <div className="ov">
            {/* Today only. The full list lives on its own page; a dashboard
                column showing next week's work would not be today's work. */}
            <Tasks onOpen={brief} hero today />

            <div className="ov-stack">
              <SourcedCard />
              <ProgressCard />
              <CampaignsCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

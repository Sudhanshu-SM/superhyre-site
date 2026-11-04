import type { ReactNode } from "react";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { ConfigSlot } from "./Rail";
import type { RailSlot } from "./railConfig";
import { LoadFailed } from "./ui";
import { Counter } from "./viz";

/**
 * The top of the chat list, kept small: how today went (found, contacted, interviews, with the gain on yesterday beside
 * each), the daily sourcing line under it, and who the campaign belongs to (the owner and the collaborators, or the owner and the
 * team for the whole workspace). With a campaign in the chat the figures are that campaign's and it is named beside "Today";
 * otherwise they are everyone's. The rest of the set-up is in the header's "What the agent knows" and on the campaign itself.
 */

export type WeekStat = { id: string; label: string; value: number; /** What it grew by on the week before; never negative. */ gain: number };

type Props = {
  /** The campaign the chat is about, or null for everything. */
  campaign: { id: string; name: string } | null;
  week: { state: "loading" | "failed" | "ready"; stats: readonly WeekStat[] };
  onRetryWeek: () => void;
  slots: readonly RailSlot[];
  /** The daily sourcing row, drawn by the page: the first of the rows under the figures. */
  daily?: ReactNode;
};

/** The two rows the list keeps: who owns it and who else is on it. */
const PEOPLE = new Set(["Owner", "Collaborators", "Team"]);

export function RailContext({ campaign, week, onRetryWeek, slots, daily }: Props) {
  const people = slots.filter((s) => PEOPLE.has(s.key));

  return (
    <section className="hx-top" aria-label={campaign ? `${campaign.name}: today and who is on it` : "Today and who is on it, all campaigns"}>
      <div className="hx-wk">
        <p className="hx-wk-t"><span>Today</span><span className="hx-wk-c" title={campaign ? campaign.name : "All campaigns"}>{campaign ? campaign.name : "All campaigns"}</span></p>
        {week.state === "loading" ? (
          <ShimmerRegion label="Loading the week" className="hx-wk-grid">
            {[0, 1, 2].map((i) => (
              <span key={i} className="hx-wk-cell" aria-hidden="true"><Shimmer w="52%" h={22} r={6} /><Shimmer w="74%" h={11} r={5} /></span>
            ))}
          </ShimmerRegion>
        ) : week.state === "failed" ? (
          <LoadFailed compact what="Today" onRetry={onRetryWeek} />
        ) : (
          <dl className="hx-wk-grid">
            {week.stats.map((s) => (
              <div className="hx-wk-cell" key={s.id}>
                <dt className="hx-wk-l">{s.label}</dt>
                <dd className="hx-wk-fig">
                  <span className="hx-wk-n"><Counter value={s.value} /></span>
                  {s.gain > 0 && (
                    <span className="hx-wk-up">
                      <span className="sr-only">up {s.gain} on yesterday</span>
                      <span aria-hidden="true">+{s.gain}</span>
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {(daily || people.length > 0) && (
        <ul className="hx-cfg">
          {daily && <li>{daily}</li>}
          {people.map((slot) => <li key={slot.key}><ConfigSlot slot={slot} /></li>)}
        </ul>
      )}
    </section>
  );
}

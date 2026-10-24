import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { ConfigSlot } from "./Rail";
import type { RailSlot } from "./railConfig";
import { LoadFailed } from "./ui";
import { Counter } from "./viz";

/**
 * The top of the chat list, kept small: how the week went (found, replies, interviews, with the week's gain beside each) and
 * who it belongs to (the owner and the collaborators, or the owner and the team for the whole workspace). It does not name
 * the campaign: the header already does. With a campaign in the chat it is that campaign's week, otherwise everyone's. The
 * rest of the set-up is in the header's "What the agent knows" and on the campaign itself.
 */

export type WeekStat = { id: string; label: string; value: number; /** What it grew by on the week before; never negative. */ gain: number };

type Props = {
  /** The campaign the chat is about, or null for everything. */
  campaign: { id: string; name: string } | null;
  week: { state: "loading" | "failed" | "ready"; stats: readonly WeekStat[] };
  onRetryWeek: () => void;
  slots: readonly RailSlot[];
};

/** The two rows the list keeps: who owns it and who else is on it. */
const PEOPLE = new Set(["Owner", "Collaborators", "Team"]);

export function RailContext({ campaign, week, onRetryWeek, slots }: Props) {
  const people = slots.filter((s) => PEOPLE.has(s.key));

  return (
    <section className="hx-top" aria-label={campaign ? `${campaign.name}: this week and who is on it` : "This week and who is on it, all campaigns"}>
      <div className="hx-wk">
        <p className="hx-wk-t">Last 7 days{campaign ? "" : " · all campaigns"}</p>
        {week.state === "loading" ? (
          <ShimmerRegion label="Loading the week" className="hx-wk-grid">
            {[0, 1, 2].map((i) => (
              <span key={i} className="hx-wk-cell" aria-hidden="true"><Shimmer w="52%" h={22} r={6} /><Shimmer w="74%" h={11} r={5} /></span>
            ))}
          </ShimmerRegion>
        ) : week.state === "failed" ? (
          <LoadFailed compact what="The week" onRetry={onRetryWeek} />
        ) : (
          <dl className="hx-wk-grid">
            {week.stats.map((s) => (
              <div className="hx-wk-cell" key={s.id}>
                <dt className="hx-wk-l">{s.label}</dt>
                <dd className="hx-wk-fig">
                  <span className="hx-wk-n"><Counter value={s.value} /></span>
                  {s.gain > 0 && (
                    <span className="hx-wk-up">
                      <span className="sr-only">up {s.gain} on the week before</span>
                      <span aria-hidden="true">+{s.gain}</span>
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {people.length > 0 && (
        <ul className="hx-cfg">
          {people.map((slot) => <li key={slot.key}><ConfigSlot slot={slot} /></li>)}
        </ul>
      )}
    </section>
  );
}

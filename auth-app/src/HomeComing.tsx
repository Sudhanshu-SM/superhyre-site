import { useEffect, useRef } from "react";
import { List, useNow } from "./ComingUp";
import { isScoped } from "./orchestrator";
import type { Scope } from "./orchestrator";
import { useSession } from "./roleStore";
import { useMeetings } from "./meetingsStore";
import { upcoming } from "./meetingsView";
import { UPCOMING, useFeed, useSchedulesUnavailable } from "./schedulesStore";
import type { FeedQuery } from "./schedulesStore";
import "./schedules.css";

/** How many show before "Show all". */
export const COMING_UP_SHOWN = 5;

/**
 * Coming up, on Home: what the agent has set up to happen later (a reminder, a follow-up email, a weekly digest),
 * the next five, soonest first, each with its time, who it is for and a way to move it or call it off. It is the
 * same list and the same rows as the agent's own (`ComingUp.tsx`), narrowed to the campaign the page is scoped to.
 * Nothing is kept on a page of its own: the agent makes these, and asking it "what's coming up?" answers the same.
 *
 * Read again every minute while Home is open, so something going out leaves the list without a reload. A server
 * without the schedule routes has nothing to show, so the card is not drawn (Home's grid closes up around it).
 */
export function ComingUpCard({ scope, timeZone }: { scope: Scope; timeZone: string }) {
  const session = useSession();
  const now = useNow();
  const campaignId = isScoped(scope) ? scope : null;
  const query: FeedQuery = { ...UPCOMING, campaignId };
  const feed = useFeed(query, { poll: true });
  const unavailable = useSchedulesUnavailable();
  const card = useRef<HTMLElement>(null);
  /* Meetings and interviews are among the things coming up, by their time. */
  const booked = useMeetings({ campaignId, limit: 20 });
  const meetings = upcoming(booked.meetings);

  /* Opened from a link that names this card ("#/?section=coming-up"): bring it into view. */
  useEffect(() => {
    if (/[?&]section=coming-up\b/.test(window.location.hash)) card.current?.scrollIntoView({ block: "nearest" });
  }, []);

  if (unavailable && feed.phase !== "ready") return null;

  const count = feed.phase === "ready" ? `${feed.items.length + meetings.length}${feed.next ? "+" : ""}` : null;
  return (
    <section ref={card} className="hm-card hm-coming" id="coming-up" aria-labelledby="coming-up-h">
      <header className="hm-th">
        <h2 id="coming-up-h">Coming up{count && count !== "0" && <span className="hm-n">{count}</span>}</h2>
      </header>
      <div className="hm-coming-b">
        <List
          feed={feed} query={query} empty="upcoming" viewerId={session.userId ?? null} zone={timeZone} now={now}
          filtered={campaignId !== null} onClear={() => undefined} limit={COMING_UP_SHOWN} compact meetings={meetings}
        />
      </div>
    </section>
  );
}

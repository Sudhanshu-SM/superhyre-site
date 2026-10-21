import { useEffect, useState } from "react";
import { List, useNow } from "../ComingUp";
import { useSession } from "../roleStore";
import { useMeetings } from "../meetingsStore";
import { upcoming } from "../meetingsView";
import { UPCOMING, useFeed } from "../schedulesStore";
import type { FeedQuery } from "../schedulesStore";
import { browserZone } from "../schedulesView";
import type { LiveViewProps } from "./types";
import "../schedules.css";

/** How many rows show before "Show all": the chat's answer is the next few, not the whole schedule. */
const SHOWN = 6;

/**
 * What the agent has set up for later (a reminder, a follow-up email, a weekly digest), soonest first, in the
 * same list and the same rows as Home's "Coming up": each with its time, who it is for, and a way to move it or
 * call it off. Asking "what's coming up?" is answered with it, narrowed to the campaign the request named.
 */
export default function ComingUpView({ card, ctx }: LiveViewProps): JSX.Element {
  const session = useSession();
  const now = useNow();
  /* "Show everything" widens this card in place; it is not a new question to the agent, so it adds no message. */
  const [everything, setEverything] = useState(false);
  const campaignId = everything ? null : card.campaignId;
  const query: FeedQuery = { ...UPCOMING, campaignId };
  const own = useFeed(query, { poll: true });
  /* Their own reminders are theirs wherever they were set: a campaign's list has them too, once. */
  const reminders = useFeed({ ...UPCOMING, kind: "reminder", campaignId: null }, { poll: true });
  const feed = campaignId === null || reminders.phase !== "ready" || own.phase !== "ready"
    ? own
    : { ...own, items: [...own.items, ...reminders.items.filter((r) => !own.items.some((i) => i.id === r.id))] };
  /* Meetings and interviews are among what is coming up, for the campaign or for everything. */
  const booked = useMeetings({ campaignId, limit: 20 });
  const meetings = upcoming(booked.meetings);
  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [feed.phase, feed.items.length, meetings.length, everything, grow]);
  return (
    <section className="src mo lv-coming" aria-label="Coming up">
      <List
        feed={feed} query={query} empty="upcoming" viewerId={session.userId ?? null} zone={browserZone()} now={now}
        filtered={campaignId !== null} onClear={() => setEverything(true)} limit={SHOWN} meetings={meetings}
      />
    </section>
  );
}

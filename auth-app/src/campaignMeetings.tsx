import { createContext, useContext, useMemo, useState } from "react";
import { Video } from "@phosphor-icons/react";
import { MeetingRow, List, useNow } from "./ComingUp";
import { ShimmerRegion } from "./components/Shimmer";
import { ComingGhost } from "./ComingUp";
import { useMeetings } from "./meetingsStore";
import { cardLine, isInterview, shortWhen, upcoming } from "./meetingsView";
import { useSession } from "./roleStore";
import { UPCOMING, useFeed } from "./schedulesStore";
import type { FeedQuery } from "./schedulesStore";
import { browserZone } from "./schedulesView";
import "./campaignMeetings.css";

/**
 * Meetings where they matter on a campaign: a line on each person's card ("Interview Tue 3 pm"), what is booked for the
 * person in the sheet that opens, and the Overview's Coming up, which lists them among the campaign's scheduled things.
 * They are read from SuperHyre's own record (never from Google) and read again when the agent books, moves or cancels.
 */

const NONE: ReadonlyMap<string, string> = new Map();
export const MeetingLinesContext = createContext<ReadonlyMap<string, string>>(NONE);

/** Each card's next meeting as the words it carries, by the card's id, for one campaign. */
export function useMeetingLines(campaignId: string, enabled: boolean): ReadonlyMap<string, string> {
  const { meetings } = useMeetings({ campaignId }, enabled && campaignId !== "");
  return useMemo(() => {
    const byCard = new Map<string, typeof meetings[number][]>();
    for (const m of meetings) {
      if (!m.campaignCandidateId) continue;
      byCard.set(m.campaignCandidateId, [...(byCard.get(m.campaignCandidateId) ?? []), m]);
    }
    const out = new Map<string, string>();
    for (const [id, list] of byCard) {
      const line = cardLine(list);
      if (line) out.set(id, line);
    }
    return out;
  }, [meetings]);
}

/** "Interview Tue 3 pm" under a person's name on the board; nothing when no meeting is booked. */
export function MeetingNote({ id }: { id: string }): JSX.Element | null {
  const line = useContext(MeetingLinesContext).get(id);
  return line ? <p className="cw-pc-meet">{line}</p> : null;
}

/** What is booked with this person, in the sheet that opens: the time, and the way in. */
export function PersonMeetings({ id }: { id: string }): JSX.Element | null {
  const { meetings } = useMeetings({ campaignCandidateId: id });
  const next = upcoming(meetings);
  if (!next.length) return null;
  return (
    <ul className="cw-pd-meets">
      {next.map((m) => (
        <li key={m.id}>
          <span className="cw-pd-meet-t">{isInterview(m) ? "Interview" : "Meeting"} {shortWhen(m.startsAt, m.timezone)}</span>
          {m.meetUrl && (
            <a className="st-link" href={m.meetUrl} target="_blank" rel="noopener noreferrer"><Video size={13} aria-hidden="true" /> Join</a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The campaign Overview's Coming up: its scheduled emails, reminders and digests and its meetings, by time, in the
 * rows Home uses. Earlier meetings (held, or cancelled) are one click under it.
 */
export function CampaignComing({ campaignId }: { campaignId: string }): JSX.Element | null {
  const session = useSession();
  const now = useNow();
  const query: FeedQuery = { ...UPCOMING, campaignId };
  const feed = useFeed(query, { poll: false });
  const booked = useMeetings({ campaignId });
  const [earlier, setEarlier] = useState(false);
  const ahead = upcoming(booked.meetings);
  /* Nothing coming, and nothing earlier to look back at: the Overview keeps its room. */
  if (feed.phase !== "ready" || booked.phase !== "ready") return null;
  if (feed.items.length === 0 && ahead.length === 0 && !earlier) {
    return booked.meetings.length === 0 ? null : (
      <div className="cw-coming">
        <button type="button" className="st-link cw-coming-more" aria-expanded={false} onClick={() => setEarlier(true)}>Earlier meetings</button>
      </div>
    );
  }
  return (
    <section className="cw-coming" aria-labelledby="cw-coming-h">
      <h3 id="cw-coming-h" className="cw-coming-h">Coming up</h3>
      {(feed.items.length > 0 || ahead.length > 0) && (
        <List
          feed={feed} query={query} empty="upcoming" viewerId={session.userId ?? null} zone={browserZone()} now={now}
          filtered onClear={() => undefined} limit={3} compact meetings={ahead}
        />
      )}
      <button type="button" className="st-link cw-coming-more" aria-expanded={earlier} onClick={() => setEarlier((v) => !v)}>
        {earlier ? "Hide earlier meetings" : "Earlier meetings"}
      </button>
      {earlier && <EarlierMeetings campaignId={campaignId} now={now} />}
    </section>
  );
}

function EarlierMeetings({ campaignId, now }: { campaignId: string; now: number }): JSX.Element {
  const past = useMeetings({ campaignId, when: "past", limit: 10 });
  if (past.phase === "idle" || past.phase === "loading") {
    return <ShimmerRegion label="Loading earlier meetings"><ComingGhost n={2} compact /></ShimmerRegion>;
  }
  if (!past.meetings.length) return <p className="st-quiet t-body-sm">No meetings yet.</p>;
  return (
    <ul className="sc-list is-compact">
      {past.meetings.map((m) => <MeetingRow key={m.id} meeting={m} now={now} />)}
    </ul>
  );
}

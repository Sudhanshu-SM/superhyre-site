import { feedOf } from "./agentEvents";
import type { RunEvent } from "./api/events";

/**
 * What a search is doing right now, as the short lines that rise and fade under "Matching candidates to the
 * role". Pure and safe to replay: a line is added once (by its event's sequence number), so a doubled event
 * changes nothing, and a chat that is reopened mid-search rebuilds the same lines.
 *
 * A line is alive for a few seconds from when it arrived. Lines that arrive in a replay (the event's own time
 * is well in the past) are born expired: they were already said, and showing them again would be a flicker.
 */

export type FeedLine = {
  /** The event's sequence number: what makes a line the same line. */
  seq: number;
  kind: string;
  text: string;
  /** When it arrived (epoch ms); 0 for a line that came in a replay, which is never shown. */
  at: number;
};

/** How many lines are kept, and how many are on screen at once. */
export const FEED_KEEP = 40;
export const FEED_VISIBLE = 5;
/** How long a line is on screen: it fades in, drifts up and fades out over this. */
export const FEED_LIFE_MS = 6_000;
/** An event this much older than now is a replay. */
const REPLAY_MS = 10_000;

/** One feed event folded into the lines. */
export function applyFeed(lines: readonly FeedLine[], e: RunEvent, now = Date.now()): readonly FeedLine[] {
  const feed = feedOf(e);
  if (!feed) return lines;
  if (lines.some((l) => l.seq === e.seq)) return lines;
  const said = Date.parse(e.at);
  const at = Number.isFinite(said) && now - said > REPLAY_MS ? 0 : now;
  const next = [...lines, { seq: e.seq, kind: feed.kind, text: feed.text, at }];
  return next.length > FEED_KEEP ? next.slice(next.length - FEED_KEEP) : next;
}

/** The lines on screen now: the newest few that have not yet faded out, oldest first (the newest is last). */
export function visibleFeed(lines: readonly FeedLine[], now = Date.now()): readonly FeedLine[] {
  return lines.filter((l) => l.at > 0 && now - l.at < FEED_LIFE_MS).slice(-FEED_VISIBLE);
}

/** When the next line goes, so a clock need not tick faster than it must; null when nothing is on screen. */
export function nextExpiry(lines: readonly FeedLine[], now = Date.now()): number | null {
  const live = visibleFeed(lines, now);
  return live.length ? Math.min(...live.map((l) => l.at + FEED_LIFE_MS)) - now : null;
}

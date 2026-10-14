/**
 * What a recording player is doing, as a reducer, and which line of the transcript is being spoken. The
 * component owns the audio element and the clock; this says what the screen should show given what happened,
 * so play, pause, seek, speed, a link that ran out and the end of the call are tested without a browser.
 */

export const RATES = [1, 1.25, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

export type PlayerStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "failed";

export type PlayerState = {
  status: PlayerStatus;
  /** Seconds into the recording. */
  time: number;
  /** Seconds in all; 0 until the audio says (or the call's own length stands in for it). */
  duration: number;
  rate: Rate;
  /** Whether the address ran out while playing: the component asks for a new one and picks up where it was. */
  expired: boolean;
  message: string | null;
};

export const initialPlayer = (duration = 0): PlayerState => ({
  status: "idle",
  time: 0,
  duration,
  rate: 1,
  expired: false,
  message: null,
});

export type PlayerEvent =
  | { type: "open" }
  | { type: "ready"; duration: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "tick"; time: number }
  | { type: "seek"; time: number; play?: boolean }
  | { type: "ended" }
  | { type: "rate"; rate: number }
  | { type: "expired" }
  | { type: "relinked" }
  | { type: "failed"; message: string };

const clamp = (t: number, duration: number): number => {
  const top = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(top, Number.isFinite(t) ? t : 0));
};

/** The speed nearest what was asked, from the ones the player offers. */
export const rateOf = (value: number): Rate =>
  RATES.reduce<Rate>((best, r) => (Math.abs(r - value) < Math.abs(best - value) ? r : best), 1);

export function playerReducer(s: PlayerState, e: PlayerEvent): PlayerState {
  switch (e.type) {
    case "open":
      return s.status === "idle" || s.status === "failed" ? { ...s, status: "loading", message: null } : s;
    case "ready": {
      const duration = e.duration > 0 ? e.duration : s.duration;
      // Ready is where playback waits; a player that was already playing (a new address) goes on.
      const status = s.status === "loading" || s.status === "idle" ? "ready" : s.status;
      return { ...s, status, duration, time: clamp(s.time, duration), expired: false };
    }
    case "toggle":
      return playerReducer(s, { type: s.status === "playing" ? "pause" : "play" });
    case "play": {
      if (s.status === "failed") return s;
      // From the end, play starts again from the beginning.
      const time = s.status === "ended" || (s.duration > 0 && s.time >= s.duration - 0.05) ? 0 : s.time;
      return { ...s, status: "playing", time, message: null };
    }
    case "pause":
      return s.status === "playing" ? { ...s, status: "paused" } : s;
    case "tick":
      return s.status === "playing" || s.status === "paused" ? { ...s, time: clamp(e.time, s.duration) } : s;
    case "seek": {
      const time = clamp(e.time, s.duration);
      if (e.play) return { ...s, time, status: "playing" };
      // Seeking an ended call leaves it paused where it was put, not ended.
      return { ...s, time, status: s.status === "ended" ? "paused" : s.status };
    }
    case "ended":
      return { ...s, status: "ended", time: s.duration || s.time };
    case "rate":
      return { ...s, rate: rateOf(e.rate) };
    case "expired":
      return { ...s, expired: true, status: s.status === "playing" ? "paused" : s.status };
    case "relinked":
      return { ...s, expired: false };
    case "failed":
      return { ...s, status: "failed", message: e.message };
  }
}

/* ── the transcript following the playhead ── */

/**
 * The line being spoken at `time`: the last one that has started. -1 before the first line, so nothing is
 * lit until the call gets there. `starts` is in order.
 */
export function activeLine(starts: readonly number[], time: number): number {
  if (starts.length === 0 || time < (starts[0] ?? 0) - 0.05) return -1;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= time + 0.05) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** How long a manual scroll of the transcript keeps it from jumping back to the line being spoken. */
export const FOLLOW_PAUSE_MS = 4000;

/** Whether the transcript should move to the line being spoken now: not just after the person scrolled it. */
export const shouldFollow = (lastManualScrollAt: number | null, now: number): boolean =>
  lastManualScrollAt === null || now - lastManualScrollAt >= FOLLOW_PAUSE_MS;

/**
 * Where to put a transcript box's scroll so the line is a third of the way down, or null when it is already
 * comfortably in view. Inside the box only, never the page.
 */
export function followTarget(box: { scrollTop: number; clientHeight: number }, line: { offsetTop: number; offsetHeight: number }): number | null {
  const margin = 12;
  const above = line.offsetTop < box.scrollTop + margin;
  const below = line.offsetTop + line.offsetHeight > box.scrollTop + box.clientHeight - margin;
  if (!above && !below) return null;
  return Math.max(0, line.offsetTop - box.clientHeight / 3);
}

/** Where the scrubber puts the playhead for a pointer at `x` over a bar that starts at `left` and is `width` wide. */
export function seekFromPointer(x: number, left: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) return 0;
  return Math.max(0, Math.min(1, (x - left) / width)) * duration;
}

/** A link is worth using again only while it has this long left. */
export const LINK_MARGIN_MS = 30_000;
export const linkUsable = (expiresAt: number, now: number): boolean => expiresAt - now > LINK_MARGIN_MS;

import type { DailyRead, DailyWatch } from "./api/dailySearch";
import type { RailChat } from "./chatGroups";

/**
 * The "Daily sourcing" line under the figures at the top of the chat list: whether the daily search is on, and how many people it found
 * today, for the campaign the page is on or, with none, for all of them. What it says and where a press goes are decided here, from
 * what the server read (`/v1/daily-search`), so the words can be tested without drawing anything.
 */

export type DailyLine = {
  /** "On", "Paused", "Resting", "Off". */
  state: "On" | "Paused" | "Resting" | "Off";
  /** The count of people found today, when there is a search to count for. */
  today: number | null;
  /** The whole of what the row says on its right, after "Daily sourcing": "4 sourced today", "Paused · 4 sourced today", "Off". */
  value: string;
  /** Said on hover and to a screen reader: the reason a campaign is resting, or when the next morning is. */
  detail: string;
  /** What a press does: open the campaign's daily search chat, or the daily search itself. */
  goes: "chat" | "dialog";
};

/** "tomorrow 07:00", "today 07:00", "Mon 07:00": the next morning in the search's own time zone, or "" when it has none. */
export function nextLabel(iso: string | null | undefined, timezone: string, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return "";
  let zone = timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    zone = "Asia/Kolkata";
  }
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(ms);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const d = day(at);
  const word =
    d === day(now) ? "today" : d === day(now + 86_400_000) ? "tomorrow" : new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short" }).format(at);
  return `${word} ${clock}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The line for the campaign the page is on (null: all of them), or null when there is nothing to draw: the server has the daily search
 * switched off, or has not answered.
 */
export function dailyLine(read: DailyRead | null, campaign: { id: string } | null, now = Date.now()): DailyLine | null {
  if (!read || read.on !== true) return null;
  const search = read.search;
  if (!search || search.status === "off") {
    return { state: "Off", today: null, value: "Off · turn on", detail: "Turn the daily search on", goes: "dialog" };
  }
  const next = nextLabel(
    search.campaigns.map((w) => w.nextRunAt).filter((t): t is string => !!t).sort()[0],
    search.timezone,
    now,
  );
  if (campaign) {
    const watch: DailyWatch | undefined = search.campaigns.find((w) => w.campaignId === campaign.id);
    if (!watch) {
      return { state: "Off", today: null, value: "Off for this campaign", detail: "Add this campaign to the daily search", goes: "dialog" };
    }
    const when = nextLabel(watch.nextRunAt, search.timezone, now);
    const paused = search.status === "paused" || watch.state === "paused";
    const resting = !paused && !!watch.reason;
    const today = watch.today ?? 0;
    const state = paused ? "Paused" : resting ? "Resting" : "On";
    const count = today > 0 ? `${today} sourced today` : "none yet today";
    return {
      state,
      today,
      value: state === "On" ? count : `${state} · ${count}`,
      detail: resting ? (watch.reason ?? "") : when && !paused ? `Next search ${when}` : "Open this campaign's daily search chat",
      goes: "chat",
    };
  }
  const today = search.campaigns.reduce((n, w) => n + (w.today ?? 0), 0);
  const state = search.status === "paused" ? "Paused" : "On";
  const count = `${today > 0 ? today : "none"} today · ${plural(search.campaigns.length, "campaign", "campaigns")}`;
  return {
    state,
    today,
    value: state === "On" ? count : `Paused · ${count}`,
    detail: next && state === "On" ? `Next search ${next}` : "Open the daily search",
    goes: "dialog",
  };
}

/** The campaign's own daily search chat, the one a press on its line opens. */
export const dailyChatOf = (chats: readonly RailChat[] | undefined, campaignId: string): RailChat | null =>
  chats?.find((c) => c.daily && c.campaignId === campaignId) ?? null;

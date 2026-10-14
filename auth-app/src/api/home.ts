import { api } from "./client";

/**
 * Home's week across the caller's active campaigns, or one of them when Home
 * is scoped to it (server: modules/overview), and the four figures the Your
 * week tile shows.
 */

type Pair = { current: number; previous: number };

export type ApiHome = {
  days: number;
  found: Pair & { series: { day: string; count: number }[] };
  replies: Pair;
  interviews: Pair;
  offers: Pair;
  hires: Pair & { hired: number; target: number };
  tasks: { dueToday: number; upcoming: number; open: number };
  campaigns: { id: string; name: string; target: number; hired: number; nextStep: string | null }[];
};

export const homeOverview = (days = 7, campaignId?: string) =>
  api<ApiHome>("GET", `/v1/overview/home?days=${days}${campaignId ? `&campaignId=${encodeURIComponent(campaignId)}` : ""}`);

export type WeekCell = {
  key: "hires" | "replies" | "iv" | "found";
  n: number;
  label: string;
  note: string;
  /** How much it went up on the week before; only ever positive. */
  up?: number;
  spark?: number[];
};

const upBy = (p: Pair) => (p.current > p.previous ? p.current - p.previous : undefined);
const withUp = (up: number | undefined) => (up ? { up } : {});

/** The week's moves, with last week only when they grew. */
export function weekFromHome(h: ApiHome): WeekCell[] {
  return [
    { key: "hires", n: h.hires.hired, label: "Offers accepted", note: `of ${h.hires.target} planned` },
    { key: "replies", n: h.replies.current, label: "Replies", note: `in the last ${h.days} days`, ...withUp(upBy(h.replies)) },
    { key: "iv", n: h.interviews.current, label: "Moved to interview", note: `in the last ${h.days} days`, ...withUp(upBy(h.interviews)) },
    {
      key: "found", n: h.found.current, label: "People found", note: `in the last ${h.days} days`,
      ...withUp(upBy(h.found)), spark: h.found.series.map((d) => d.count),
    },
  ];
}

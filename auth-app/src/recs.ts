import type { Icon } from "@phosphor-icons/react";
import {
  Buildings, ChartBar, ClockCounterClockwise, Graph, MagnifyingGlass, PaperPlaneTilt, Plus, Robot, Sparkle, SunHorizon, TrendDown, UsersThree,
} from "@phosphor-icons/react";
import type { CampaignRow } from "./campaignsData";
import type { ModeId } from "./orchestrator";
import { FLEET, PIPELINE, sourcedFor } from "./orchestrator";
import { estimate, fromBrief } from "./filters";

/**
 * Ideas — what the landing page offers to start with.
 *
 * Every idea is grounded: it carries the observation it came from and a
 * small picture of that observation, so the recruiter judges the idea on
 * evidence rather than trusting a canned suggestion. Every prompt lands on a
 * moment the agent actually has, so picking one always leads somewhere.
 *
 * Sourcing mode offers searches, each with a live match estimate from the
 * same model the filters dialog uses. Agent mode offers the work that is
 * waiting: replies, a stopped agent, reports.
 */

export type IdeaKind = "search" | "act" | "insight";

export type Signal =
  | { type: "matches"; n: number }
  | { type: "spark"; data: readonly number[]; label: string }
  | { type: "faces"; initials: readonly string[]; label: string }
  | { type: "ring"; value: number; max: number; label: string }
  | { type: "alert"; label: string };

export type Idea = {
  id: string; kind: IdeaKind; prompt: string; because: string; Icon: Icon;
  /** The small picture of the observation. Ideas that are not drawn from a figure have none. */
  signal?: Signal;
  /** What the tile shows: the prompt, cut to read at a glance. The full
      prompt is what gets typed into the composer. */
  short?: string;
  /** The same idea in fewer words, for a row too narrow for the short form: said whole, never cut (see `fitChips`). */
  compact?: string;
};

const search = (id: string, prompt: string, because: string, Icon: Icon = MagnifyingGlass, short?: string): Idea => ({
  id, kind: "search", prompt, because, short, signal: { type: "matches", n: estimate(fromBrief(prompt)) }, Icon,
});

const SEARCHES: readonly Idea[] = [
  search("s1", "Staff backend engineers in Bangalore who have scaled Postgres, 8+ years", "Your last three searches asked for Postgres at scale", MagnifyingGlass, "Staff engineers who scaled Postgres in Bangalore"),
  search("s2", "Senior Go or Rust engineers from Series B fintechs, remote in India", "Fintech profiles replied fastest on your last campaign", MagnifyingGlass, "Go or Rust engineers from Series B fintechs"),
  search("s3", "SRE leads in Hyderabad with Kubernetes, 6+ years", "Platform SRE has no sourcing agent yet", Graph, "SRE leads in Hyderabad who run Kubernetes"),
  search("s4", "Backend engineers in Pune open to work, 4+ years, Kafka", "Open-to-work profiles in Pune rose this week", MagnifyingGlass, "Kafka engineers in Pune who are open to work"),
  search("s5", "Principal engineers who led database migrations, remote", "Two of your hires came from migration-heavy roles", MagnifyingGlass, "Principal engineers who led database migrations"),
  search("s6", "Senior engineers in Chennai with Go and Postgres, 5+ years", "Chennai is under-searched for this role", MagnifyingGlass, "Senior Go and Postgres engineers in Chennai"),
];

const waiting = FLEET.filter((a) => a.state === "waiting").length;
const stopped = FLEET.filter((a) => a.state === "error");
const replied = PIPELINE.find((s) => s.id === "replied")!.count;
const contacted = PIPELINE.find((s) => s.id === "contacted")!.count;

const ACTIONS: readonly Idea[] = [
  {
    id: "a1", Icon: PaperPlaneTilt, kind: "act", prompt: "Reach out to the shortlist on WhatsApp first", short: "Reach out to the shortlist on WhatsApp",
    because: "24 shortlisted on Senior Backend, none contacted yet",
    signal: { type: "faces", initials: ["RM", "PN", "AB", "SK"], label: "+20 more" },
  },
  {
    id: "a2", Icon: Robot, kind: "act", prompt: "How are all my agents doing?",
    because: `${waiting} waiting on you, ${stopped.length} stopped`,
    signal: { type: "alert", label: `${waiting + stopped.length} need you` },
  },
  {
    id: "a3", Icon: TrendDown, kind: "insight", prompt: "Where are we losing people?",
    because: `${replied} of ${contacted} contacted have replied`,
    signal: { type: "ring", value: replied, max: contacted, label: "reply rate" },
  },
  {
    id: "a4", Icon: ChartBar, kind: "insight", prompt: "Show me the campaign numbers for backend", short: "Chart the backend campaign",
    because: "Sourcing picked up this week",
    signal: { type: "spark", data: sourcedFor("backend-snr").map((d) => d.n), label: "sourced, 14 days" },
  },
  {
    id: "a5", Icon: UsersThree, kind: "act", prompt: "Compare Priya and Anika",
    because: "Both shortlisted, and both in two campaigns",
    signal: { type: "faces", initials: ["PN", "AB"], label: "side by side" },
  },
  {
    id: "a6", Icon: SunHorizon, kind: "insight", prompt: "Catch me up on overnight",
    because: "17 sourced and 5 replies since you last looked",
    signal: { type: "spark", data: [2, 3, 1, 4, 6, 5, 7], label: "overnight" },
  },
  {
    id: "a7", Icon: ClockCounterClockwise, kind: "act", prompt: "Anyone from past searches?",
    because: "3 people from earlier searches fit this brief",
    signal: { type: "faces", initials: ["AR", "SK", "MD"], label: "you know them" },
  },
];

export function ideasFor(mode: ModeId): readonly Idea[] {
  return mode === "sourcing" ? SEARCHES : ACTIONS;
}

/**
 * The part of a campaign's name that tells it from the campaigns shown beside it, in at most `max` characters.
 * Names that start alike ("fn3 QA Backend", "fn3 QA Designer") lose the words they share, so a chip that has to
 * be cut still shows the part that differs; a name that is still too long is cut at a word with an ellipsis.
 */
export function campaignTag(name: string, others: readonly string[], max = 22): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const peers = others.map((o) => o.trim().split(/\s+/).filter(Boolean));
  let drop = 0;
  while (
    peers.length > 0 && drop < words.length - 1
    && peers.every((p) => p[drop] !== undefined && p[drop]!.toLowerCase() === words[drop]!.toLowerCase())
  ) drop++;
  const rest = words.slice(drop).join(" ");
  if (rest.length <= max) return rest;
  const cut = rest.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at >= 6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * Ideas from the workspace's own campaigns, for real data: each one is a thing the agent
 * can do with that campaign right now, and the reason is that campaign's own numbers.
 * Nothing when there are no running campaigns; an invented suggestion is worse than none.
 *
 * A chip is short and a campaign's name can be long, so a chip leads with the campaign's tag (what tells it
 * from the others) and the verb follows; the prompt it sends still carries the full name.
 */
export function ideasFromCampaigns(
  rows: readonly CampaignRow[],
  /** Whether this person may change a campaign (`mayChangeCampaign`): "find more" is offered only where they may. */
  mayChange: (row: CampaignRow) => boolean = () => true,
): readonly Idea[] {
  // One row per campaign: the list can briefly hold a campaign twice while it refreshes,
  // and each idea's id (its React key) is per campaign.
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
  const active = unique
    .filter((r) => r.status === "active" && !r.loading)
    .sort((a, b) => b.funnel.sourced - a.funnel.sourced)
    .slice(0, 3);
  return active.flatMap((r): Idea[] => {
    const f = r.funnel;
    /* A live campaign says how far people got, as every page does (the server's one definition); the demo's
       fixtures only know where people are now. */
    const reach = r.reached;
    const shortlisted = reach ? reach.shortlisted : f.shortlisted;
    const contacted = reach ? reach.outreach : f.contacted;
    const replied = reach ? reach.replied : f.replied;
    const found = reach ? reach.found : f.sourced;
    const peers = active.filter((o) => o.id !== r.id).map((o) => o.name);
    const tag = campaignTag(r.name, peers);
    const tagShort = campaignTag(r.name, peers, 14);
    /* A search is the campaign's own to start: for one they may only follow, the tap would be refused, so it is
       not offered (the read-only ideas below stay). */
    const ideas: Idea[] = mayChange(r)
      ? [
          {
            id: `more-${r.id}`, Icon: MagnifyingGlass, kind: "search", prompt: `Find more people for ${r.name}`,
            short: `${tag}: find more people`, compact: `${tagShort}: find more`,
            because: found ? `${found} found so far, ${shortlisted} shortlisted` : "No one found yet",
            signal: { type: "spark", data: r.trend, label: "found, 14 days" },
          },
        ]
      : [];
    if (contacted > 0) {
      ideas.push({
        id: `lose-${r.id}`, Icon: TrendDown, kind: "insight", prompt: `Where are we losing people on ${r.name}?`,
        short: `${tag}: where we lose people`, compact: `${tagShort}: losing people`,
        because: `${replied} of ${contacted} contacted have replied`,
        signal: { type: "ring", value: replied, max: contacted, label: "reply rate" },
      });
    } else if (shortlisted > 0) {
      ideas.push({
        id: `sum-${r.id}`, Icon: ChartBar, kind: "insight", prompt: `Summarise the shortlist for ${r.name}`,
        short: `${tag}: summarise the shortlist`, compact: `${tagShort}: shortlist`,
        because: `${shortlisted} shortlisted, nobody contacted yet`,
        signal: { type: "alert", label: `${shortlisted} waiting` },
      });
    }
    return ideas;
  });
}

/**
 * What to offer when the workspace's own campaigns offer less than a row of three: things the
 * live agent does whatever the numbers are. Each prompt lands on something the chat handles
 * (a view it can show, or a lookup it makes), and none asserts a figure: an invented
 * observation is worse than a plain suggestion.
 *
 * Who is asking matters. Anyone who works here may start a campaign, but adding a client
 * is an admin's, so a recruiter is never offered the one thing they would be told they may
 * not do; and with no campaigns at all, "what needs my attention" has nothing to be about.
 */
export function generalIdeas(who: { canCreate: boolean; /** Adding a client is an admin's; absent means not offered. */ canAddClient?: boolean; hasCampaigns: boolean }): readonly Idea[] {
  const start: Idea = {
    id: "g-new", Icon: Plus, kind: "act", prompt: "Help me set up a new campaign", short: "Start a new campaign", compact: "New campaign",
    because: "Pick the role, the people to find and where to reach them, together",
  };
  const attention: Idea = {
    id: "g-attention", Icon: SunHorizon, kind: "insight", prompt: "What needs my attention today?", short: "What needs my attention?", compact: "Needs my attention",
    because: "Replies, approvals and stopped agents in one read",
  };
  const agents: Idea = {
    id: "g-agents", Icon: Robot, kind: "act", prompt: "How are my agents doing?", compact: "How are my agents?",
    because: "What each keep-sourcing watch is doing right now",
  };
  const find: Idea = {
    id: "g-find", Icon: MagnifyingGlass, kind: "search", prompt: "Find people for a role: ", short: "Find people for a role", compact: "Find people",
    because: "Say the role and the agent starts a search for it",
  };
  const client: Idea = {
    id: "g-client", Icon: Buildings, kind: "act", prompt: "Add a client", short: "Add a client you hire for", compact: "Add a client",
    because: "The company a campaign hires for",
  };
  const help: Idea = {
    id: "g-help", Icon: Sparkle, kind: "insight", prompt: "What can you help me with?", compact: "What can you do?",
    because: "A short tour of what the agent can look up and set up",
  };
  if (who.hasCampaigns) return who.canCreate ? [attention, agents, find, start] : [attention, agents, find];
  if (!who.canCreate) return [help];
  return who.canAddClient ? [start, client, help] : [start, help];
}

/**
 * The live landing's ideas, most relevant first: the general ones (what needs attention, how
 * the agents are doing, find people for a role), which are short and true whatever the
 * numbers are, then each running campaign's own. The row under the composer is three at a
 * time, so what leads is what is seen first; the page never opens without a way in.
 */
export function liveIdeas(
  rows: readonly CampaignRow[],
  who: {
    canCreate: boolean;
    /** Adding a client is an admin's; absent means not offered. */
    canAddClient?: boolean;
    /** The campaigns this person may change; absent means all of them. */
    mayChange?: (row: CampaignRow) => boolean;
  },
): readonly Idea[] {
  return [
    ...generalIdeas({ canCreate: who.canCreate, ...(who.canAddClient ? { canAddClient: true } : {}), hasCampaigns: rows.length > 0 }),
    ...ideasFromCampaigns(rows, who.mayChange),
  ];
}

/* ── the row of chips under the composer ─────────────────────────────────── */

/** The most chips the row shows. */
export const MAX_CHIPS = 3;
/** The narrowest a chip may be and still say what it is, in px; below this a chip is dropped rather than squeezed. */
const CHIP_FLOOR = 140;
const CHIP_GAP = 6;
/** The search button at the end of the row, and the gap before it. */
const FIND_ROOM = 32 + CHIP_GAP;

/**
 * How many chips a row `width` px wide shows, at most `max`. A chip that would be cut to
 * a few letters is worse than one fewer, so this counts how many fit at their floor; with
 * the width unknown (not measured yet) it is the most.
 */
export function chipLimit(width: number | null | undefined, max = MAX_CHIPS): number {
  if (width == null || !Number.isFinite(width)) return max;
  const fit = Math.floor((width - FIND_ROOM + CHIP_GAP) / (CHIP_FLOOR + CHIP_GAP));
  return Math.max(1, Math.min(max, fit));
}

/** What a chip says: the short form where the idea has one, and never a trailing colon. */
export function chipLabel(idea: Idea): string {
  return (idea.short ?? idea.prompt).replace(/[:\s]+$/, "");
}

/** The chip's words in fewer of them (`compact`), where the idea has them; otherwise the usual label. */
export function compactLabel(idea: Idea): string {
  return (idea.compact ?? chipLabel(idea)).replace(/[:\s]+$/, "");
}

/** A chip's padding (11px each side) and border (1px each side), in px. */
export const CHIP_PAD = 24;
/** Width of one character of a chip at 13px when the page cannot measure it: a little over the average, so a label is never cut. */
const CHAR_PX = 6.7;
/** How wide some text is, in px. */
export type Measure = (text: string) => number;
const charsAt13 = (text: string) => text.length * CHAR_PX;

/**
 * The labels a row `width` px wide shows whole. A chip is never cut mid-word: when the three chips'
 * usual labels do not fit, the same chips are said in fewer words; when even that does not fit, there are
 * fewer chips, the first ones, each whole. Three at most (the caller's `page`), one row, whatever the
 * screen. `width` unknown (nothing measured yet) is the usual labels, as `pickChips` leaves them.
 */
export function fitChips(
  page: readonly Idea[],
  width: number | null | undefined,
  measure: Measure = charsAt13,
): ReadonlyArray<{ idea: Idea; label: string }> {
  const usual = page.map((idea) => ({ idea, label: chipLabel(idea) }));
  if (width == null || !Number.isFinite(width) || usual.length === 0) return usual;
  const room = width - FIND_ROOM;
  const fits = (rows: ReadonlyArray<{ label: string }>) =>
    rows.reduce((sum, r) => sum + Math.ceil(measure(r.label)) + CHIP_PAD, 0) + CHIP_GAP * (rows.length - 1) <= room;
  for (let k = usual.length; k >= 1; k--) {
    const whole = usual.slice(0, k);
    if (fits(whole)) return whole;
    const compact = whole.map((r) => ({ idea: r.idea, label: compactLabel(r.idea) }));
    if (fits(compact)) return compact;
  }
  // Not even one fits whole: the first, in its fewest words (the row clips it with an ellipsis as the last resort).
  return [{ idea: usual[0]!.idea, label: compactLabel(usual[0]!.idea) }];
}

let visits = 0;
/**
 * A number that goes up each time the page is visited, so the chips move on by themselves:
 * the first visit shows the first three, the next the three after them, and so on.
 */
export function nextVisit(): number {
  return visits++;
}

/**
 * The chips for one visit: the ideas in order of relevance, in threes, the `visit`-th three
 * (the last of them filled from the front so a row is never short of its three), then no
 * more than fit `width`. Never more than three, and never one idea twice.
 */
export function pickChips(
  ideas: readonly Idea[],
  opts: { visit: number; width?: number | null },
): readonly Idea[] {
  const pool = [...new Map(ideas.map((i) => [i.id, i])).values()];
  if (pool.length === 0) return [];
  const visit = Number.isFinite(opts.visit) ? Math.max(0, Math.trunc(opts.visit)) : 0;
  const pages = Math.ceil(pool.length / MAX_CHIPS);
  const from = (visit % pages) * MAX_CHIPS;
  const page = pool.length <= MAX_CHIPS
    ? pool
    : [...pool.slice(from, from + MAX_CHIPS), ...pool.slice(0, Math.max(0, from + MAX_CHIPS - pool.length))].slice(0, MAX_CHIPS);
  return page.slice(0, chipLimit(opts.width));
}

export const KIND_LABEL: Record<IdeaKind, string> = {
  search: "Search",
  act: "Do",
  insight: "Understand",
};

/* ── the list under the composer ─────────────────────────────────────────── */

/** One line of the list: a sentence said whole, and what pressing it does. */
export type IdeaRow = {
  id: string;
  Icon: Icon;
  /** The sentence shown; it is also what fills the composer unless `prompt` says otherwise. */
  label: string;
  /** What goes into the composer (or is sent, if `send`). */
  prompt: string;
  /** A complete question is sent at once; an open one waits in the composer to be finished. */
  send: boolean;
};

/**
 * The three suggestions under the composer, each a full sentence, one under the other. With a campaign in
 * focus they are about it and say its name; without, they are the general ones (or, with no campaigns yet,
 * the ones that start things). Nothing here states a figure.
 */
export function ideaRows(who: {
  focusName?: string | null;
  canCreate: boolean;
  /** Adding a client is an admin's; absent means not offered. */
  canAddClient?: boolean;
  hasCampaigns: boolean;
  /** For the campaign in focus: whether this person may start a search on it. */
  mayChange?: boolean;
}): readonly IdeaRow[] {
  const name = who.focusName?.trim();
  if (name) {
    const third: IdeaRow = who.mayChange === false
      ? { id: "f-shortlist", Icon: ChartBar, label: `Summarise the shortlist for ${name} and what to do with it next`, prompt: `Summarise the shortlist for ${name}`, send: true }
      : { id: "f-more", Icon: MagnifyingGlass, label: `Find more people for ${name}: tell me what to change in the search`, prompt: `Find more people for ${name}`, send: false };
    return [
      { id: "f-attention", Icon: SunHorizon, label: `What needs my attention on ${name} today?`, prompt: `What needs my attention on ${name} today?`, send: true },
      { id: "f-doing", Icon: Robot, label: `How is ${name} doing, and who is waiting on me?`, prompt: `How is ${name} doing, and who is waiting on me?`, send: true },
      third,
    ];
  }
  if (!who.hasCampaigns) {
    const help: IdeaRow = { id: "n-help", Icon: Sparkle, label: "What can you help me with? Give me a short tour", prompt: "What can you help me with?", send: true };
    if (!who.canCreate) return [help];
    const start: IdeaRow = { id: "n-new", Icon: Plus, label: "Help me set up a new campaign: the role, who to find and where to reach them", prompt: "Help me set up a new campaign", send: true };
    const client: IdeaRow = { id: "n-client", Icon: Buildings, label: "Add a client I hire for, so campaigns can sit under it", prompt: "Add a client", send: false };
    return who.canAddClient ? [start, client, help] : [start, help];
  }
  return [
    { id: "g-attention", Icon: SunHorizon, label: "What needs my attention across my campaigns today?", prompt: "What needs my attention today?", send: true },
    { id: "g-agents", Icon: Robot, label: "How are my agents doing, and who is waiting on me?", prompt: "How are my agents doing?", send: true },
    { id: "g-find", Icon: MagnifyingGlass, label: "Find people for a role: tell me the title, location and years of experience", prompt: "Find people for a role: ", send: false },
  ];
}

import { CAMPAIGNS } from "./workspaces";

/**
 * Campaigns, as the Campaigns page lists them.
 *
 * Fixture data. The three campaigns that carry overview figures elsewhere
 * (backend-snr, platform-sre, ios-mid) use the same funnel numbers here, so
 * the page and the overview agree; the rest are filled in to the same shape.
 */

/** A campaign is on or it is closed; there is nothing in between. Its owner or an admin closes and reopens it. */
export type CampaignStatus = "active" | "closed";

export type Stage = "sourced" | "shortlisted" | "contacted" | "replied" | "interviews" | "hired";

export const STAGES: readonly { id: Stage; label: string }[] = [
  { id: "sourced", label: "Sourced" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "interviews", label: "Interviewing" },
  { id: "hired", label: "Hired" },
];

/** How far a campaign's people got (server: modules/pipeline/counts.ts). `outreach` is the people contacted. */
export type CampaignReached = {
  found: number; shortlisted: number; outreach: number; replied: number; interviewing: number; hired: number;
};
/** Conversions between neighbouring steps, whole percent; null while nobody was in the step before. */
export type CampaignRates = {
  kept: number | null; reachedOut: number | null; replied: number | null; interviewing: number | null; hired: number | null;
};

/** The kind a pipeline stage is, whatever it is called: what the board and the numbers treat it as. */
export type StageKind = "shortlisted" | "outreach" | "interviewing" | "hired" | "passed";

/** One stage of a campaign's pipeline and how many people are in it now, in pipeline order (server: the list's `stages`). */
export type CampaignStage = { id: string; name: string; kind: StageKind; color: string | null; count: number };

export type CampaignRow = {
  id: string;
  name: string;
  /** Live rows: the client it is hiring for, when it has one. */
  client?: string;
  /** Live rows: the role as its spec names it (the campaign's own name may be shorter or a nickname). */
  roleTitle?: string;
  department: string;
  location: string;
  status: CampaignStatus;
  /** Put away: an archived campaign is a closed one that the list leaves out unless the Archived tab asks for it. */
  archived?: boolean;
  owner: string;
  team: readonly string[];
  /** Live rows: the same people by user id, which is what access goes by (names can repeat). */
  ownerId?: string | null;
  teamIds?: readonly string[];
  /** Live rows: the organisation's team this campaign is on (the people above are the campaign's own), when it is on one. */
  teamId?: string | null;
  teamName?: string | null;
  /** Live rows: whether the server lets this viewer change it (an admin only the ones they own, are on or lead the team of). */
  canManage?: boolean;
  /** Live rows: "org" campaigns are open to everyone in the organisation. */
  visibility?: "team" | "org";
  /** Where people are now: each stage's headcount. */
  funnel: Readonly<Record<Stage, number>>;
  /** Live rows: how many have been hired of how many wanted (null: no target). Absent from fixtures and older servers: then the funnel's hires and `target`. */
  hires?: { count: number; target: number | null };
  /** Live rows: the same people stage by stage (custom stages included). Absent from fixtures and older servers; see stagesOf. */
  stages?: readonly CampaignStage[];
  /**
   * Live rows: how far people got, and the conversions between steps, as the server defines them
   * (the same numbers the Overview funnel and the Pipeline header say).
   */
  reached?: CampaignReached;
  rates?: CampaignRates;
  /** People sourced per day, oldest first, last 14 days. */
  trend: readonly number[];
  /** Hires this campaign is meant to make. */
  target: number;
  /** Agents currently working on it, by what they are doing. */
  agents: readonly string[];
  /** Something waiting on a person, if anything. */
  needs?: string;
  /** Of each day's newly sourced profiles, how many a recruiter kept for the
      shortlist; aligned with `trend`. Absent → no "kept" figure anywhere. */
  kept?: readonly number[];
  updatedAgo: string;
  /** ISO. Live rows only, for picking the most recent campaign. */
  updatedAt?: string;
  createdAgo: string;
  /** What the create form captured. Absent on the seeded campaigns. */
  setup?: CampaignSetup;
  /** Live data only: the overview figures (sourced, trend, replies) have not arrived yet. */
  loading?: true;
};

export type Employment = "full-time" | "contract" | "intern";
export type WorkMode = "onsite" | "hybrid" | "remote";
export type Channel = "email" | "whatsapp" | "linkedin";
export type Priority = "low" | "normal" | "high" | "urgent";
export type Visibility = "team" | "org";

/** Everything the New campaign form asks beyond name, team and location. */
export type CampaignSetup = {
  clientId?: string;
  hiringManager?: string;
  seniority?: string;
  employment?: Employment;
  workMode?: WorkMode;
  /** Days a week in the office, for hybrid. */
  officeDays?: number;
  locations?: readonly string[];
  /** ISO date, and whether it is when the hire starts or when the search closes. */
  targetDate?: string;
  dateKind?: "start" | "close";
  comp?: { currency: string; min?: number; max?: number; variable?: string; shown: boolean };
  expMin?: number;
  expMax?: number;
  mustHave?: readonly string[];
  niceToHave?: readonly string[];
  education?: string;
  notice?: string;
  dealbreakers?: string;
  jd?: string;
  intake?: string;
  channels?: readonly Channel[];
  /** "none", "generate", or the id of an existing form to reuse. */
  screening?: string;
  priority?: Priority;
  visibility?: Visibility;
  fee?: string;
  /** What the recruiter set for the campaign's searches, over its role spec (PUT /v1/campaigns/:id/filters). */
  filters?: Readonly<Record<string, readonly string[] | readonly [number, number] | string | boolean>>;
};

type Funnel = CampaignRow["funnel"];
/** Replies nobody has answered yet: everyone who replied and has not moved on
    to interviews. Pipeline's `step: "replied"` count is built from the same
    two numbers, so Home, Campaigns, the Overview and Pipeline all agree. */
export const repliesWaiting = (f: Funnel) => Math.max(0, f.replied - f.interviews);
const repliesNeed = (f: Funnel) => `${repliesWaiting(f)} ${repliesWaiting(f) === 1 ? "reply" : "replies"} waiting`;

type Base = Omit<CampaignRow, "id" | "name" | "department" | "location" | "needs"> & { needs?: string | ((f: Funnel) => string) };

const BY_ID: Readonly<Record<string, Base>> = {
  "backend-snr": {
    status: "active", owner: "Punith S", team: ["Punith S", "Arnab J", "Sudhanshu M"],
    funnel: { sourced: 214, shortlisted: 13, contacted: 33, replied: 10, interviews: 4, hired: 1 },
    trend: [3, 6, 5, 7, 6, 2, 1, 8, 10, 7, 11, 9, 2, 1], target: 3,
    kept: [1, 2, 1, 2, 2, 0, 0, 2, 3, 2, 4, 3, 0, 0],
    agents: ["Sourcing", "Outreach"], needs: repliesNeed, updatedAgo: "12m ago", createdAgo: "3w ago",
  },
  "platform-sre": {
    status: "active", owner: "Sudhanshu M", team: ["Sudhanshu M", "Riya K"],
    funnel: { sourced: 96, shortlisted: 7, contacted: 19, replied: 5, interviews: 1, hired: 0 },
    trend: [2, 3, 3, 5, 4, 1, 1, 5, 6, 4, 6, 5, 1, 0], target: 2,
    kept: [0, 1, 1, 1, 1, 0, 0, 1, 2, 1, 2, 1, 0, 0],
    agents: ["Sourcing"], updatedAgo: "1h ago", createdAgo: "2w ago",
  },
  "ios-mid": {
    status: "active", owner: "Riya K", team: ["Riya K"],
    funnel: { sourced: 58, shortlisted: 4, contacted: 9, replied: 2, interviews: 1, hired: 1 },
    trend: [1, 2, 1, 2, 2, 0, 0, 2, 3, 2, 4, 3, 1, 1], target: 2,
    kept: [0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0],
    agents: [], needs: "Quiet for 9 days, no one assigned", updatedAgo: "9d ago", createdAgo: "5w ago",
  },
  "design-lead": {
    status: "active", owner: "Arnab J", team: ["Arnab J", "Punith S"],
    funnel: { sourced: 41, shortlisted: 6, contacted: 11, replied: 6, interviews: 3, hired: 0 },
    trend: [0, 1, 2, 3, 2, 1, 0, 2, 4, 3, 3, 4, 2, 1], target: 1,
    kept: [0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0],
    agents: ["Outreach"], needs: "2 interviews to schedule", updatedAgo: "34m ago", createdAgo: "10d ago",
  },
  "gtm-ae": {
    status: "closed", owner: "Punith S", team: ["Punith S", "Riya K"],
    funnel: { sourced: 132, shortlisted: 18, contacted: 40, replied: 15, interviews: 7, hired: 2 },
    trend: [4, 3, 2, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0], target: 2,
    agents: [], updatedAgo: "3d ago", createdAgo: "2mo ago",
  },
  "ds-applied": {
    status: "active", owner: "Riya K", team: ["Riya K", "Sudhanshu M", "Arnab J"],
    funnel: { sourced: 77, shortlisted: 9, contacted: 22, replied: 8, interviews: 2, hired: 1 },
    trend: [2, 2, 4, 3, 5, 3, 2, 6, 5, 7, 6, 8, 5, 4], target: 2,
    kept: [1, 0, 1, 1, 1, 1, 0, 2, 1, 2, 1, 2, 1, 1],
    agents: ["Sourcing", "Screening"], updatedAgo: "5m ago", createdAgo: "3w ago",
  },
  "fin-controller": {
    status: "active", owner: "Sudhanshu M", team: ["Sudhanshu M"],
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], target: 1,
    agents: [], needs: "Role spec not approved", updatedAgo: "2d ago", createdAgo: "2d ago",
  },
};

export const CAMPAIGN_ROWS: readonly CampaignRow[] = CAMPAIGNS.map((c) => {
  const [department = "", location = ""] = c.role.split(" · ");
  const { needs, ...base } = BY_ID[c.id]!;
  return { id: c.id, name: c.name, department, location, ...base, needs: typeof needs === "function" ? needs(base.funnel) : needs };
});

export const STATUS_LABEL: Readonly<Record<CampaignStatus, string>> = { active: "Active", closed: "Closed" };

export const DEPARTMENTS = ["Engineering", "Design", "Data", "Product", "Go to market", "Finance", "Operations"] as const;

export const TEAM = ["Punith S", "Arnab J", "Sudhanshu M", "Riya K"] as const;

/** A new, empty campaign as the create dialog makes it. */
export function newCampaign(input: { name: string; department: string; location: string; target: number; owner: string; agent: boolean }): CampaignRow {
  const id = `c-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
  return {
    id,
    name: input.name,
    department: input.department,
    location: input.location || "Remote",
    status: "active",
    owner: input.owner,
    team: [input.owner],
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: Array.from({ length: 14 }, () => 0),
    target: input.target,
    agents: input.agent ? ["Sourcing"] : [],
    needs: input.agent ? undefined : "Role spec not approved",
    updatedAgo: "Just now",
    createdAgo: "Just now",
  };
}

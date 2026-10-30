import type { ApiSuggestion } from "./campaigns";
import { api } from "./client";

/**
 * The daily search as the API serves it (server: modules/sourcing/routes.ts and sweep-detail.ts, `/v1/daily-search`): a person's own search,
 * and for the dialog every campaign they may change with where it stands, the last mornings and the room left today.
 */

export type DailyScope = { all: true; except: string[] } | { campaignIds: string[] };
export type DailyStatus = "on" | "paused" | "off";
export type DailyRepeat = "daily" | "weekdays";

/** A campaign's place in the search: its watch, and how it is doing. */
export type DailyWatch = {
  /** The campaign's watch, for pausing or resuming that campaign alone. */
  agentId: string;
  campaignId: string;
  name: string;
  /** The watch's state: running, paused, error. A running one with a reason is resting. */
  state: string;
  reason: string | null;
  found: number;
  lastFound: number;
  nextRunAt: string | null;
};

export type DailySearch = {
  id: string;
  status: DailyStatus;
  scope: DailyScope;
  /** "07:00". */
  runAt: string;
  timezone: string;
  repeat: DailyRepeat;
  perCampaign: number;
  reserve: number;
  waitingCap: number;
  maxCampaigns: number;
  /** When a pause with an end ends by itself. */
  pausedUntil: string | null;
  campaigns: DailyWatch[];
};

export type DailyBlocked =
  | "no_requirements"
  | "needs_approval"
  | "needs_city"
  | "filled"
  | "in_other_search"
  | "has_watch";

/** One campaign in the dialog: the person may change it; it is in their search, can join it, or cannot yet (`why`). */
export type DailyRow = {
  id: string;
  name: string;
  clientName: string | null;
  /** "Pune", "Pune and Mumbai", "remote". */
  city: string | null;
  ready: boolean;
  blocked: DailyBlocked | null;
  why: string | null;
  /** The campaign's own figures, the ones its pages show (null for one that cannot be searched). */
  found: number | null;
  waiting: number | null;
  /** The person's own watch with an end on it, which moves into the daily search with it. */
  ownWatch: boolean;
  watch: DailyWatch | null;
  /** Closed or archived, and still in the search. */
  closed: boolean;
};

export type DailyMorning = { day: string; fresh: number; worth: number; campaigns: number };

export type DailyRoom = { profilesLeft: number; firstSearch: number; approvals: number };

/** What a search is set to when the person has none yet (the server's numbers, in one place). */
export type DailyDefaults = {
  runAt: string;
  repeat: DailyRepeat;
  reserve: number;
  waitingCap: number;
  /** The waiting count a resting campaign carries on at. */
  waitingResumeAt: number;
  /** New people each campaign gets in a morning when a search starts, and the most a person may set it to (the server's two settings). */
  perCampaign: number;
  /** An older server sends none: it holds 5 (`OLD_PER_CAMPAIGN_MAX`). */
  perCampaignMax?: number;
  /** What a new person costs, for what a yes spends a day, and the most campaigns one search holds. */
  creditsPerProfile: number;
  maxCampaigns: number;
};

export type DailyDetail = {
  campaigns: DailyRow[];
  mornings: DailyMorning[];
  room: DailyRoom;
  /** "36 campaigns have requirements drafted..." with the room to approve them in; empty when none are. */
  drafts: string;
  defaults: DailyDefaults;
  /** Whether the person may see and pause the searches other people have. */
  admin: boolean;
};

export type DailyRead = { on: boolean; search: DailySearch | null; detail?: DailyDetail };

/** Another person's search, for an owner or admin: counts, never the campaigns' names. */
export type OtherSearch = {
  id: string;
  owner: string;
  status: "on" | "paused";
  runAt: string;
  repeat: DailyRepeat;
  campaigns: number;
  resting: number;
  nextRunAt: string | null;
  lastBriefAt: string | null;
};

/** A change the search suggests for one of its campaigns, with the campaign's name (server: modules/sourcing/suggestion-routes.ts). */
export type DailySuggestion = ApiSuggestion & { campaign: string };

/** How the suggestions have done, in counts. `applied` includes the undone ones; `same` is the changes measured and found to make no difference; `tooEarly` is the changes whose next searches are too few to say. */
export type DailyScoreboard = {
  suggested: number;
  applied: number;
  declined: number;
  undone: number;
  better: number;
  same: number;
  worse: number;
  tooEarly: number;
};

/** `on: false`: the suggestions are off (or only being watched, and shown to nobody): there is nothing to draw. */
export type DailySuggestions = { on: boolean; waiting: DailySuggestion[]; scoreboard: DailyScoreboard | null };

/** What a save answers beyond the search: the campaigns it could not hold (ready and asked for, but past the most one search holds). */
export type DailyStarted = { held?: Array<{ id: string; name: string }> };

export type DailySave = {
  scope: DailyScope;
  mode?: "replace" | "add";
  runAt?: string;
  repeat?: DailyRepeat;
  reserve?: number;
  waitingCap?: number;
  /** New people each campaign gets in a morning (the server refuses more than its ceiling, `DailyDefaults.perCampaignMax`). */
  perCampaign?: number;
  /** A paused search stays paused, with the end of its pause: the campaigns are saved into it and it is turned on when the person says. */
  keepPaused?: boolean;
};

export const dailySearchApi = {
  /** The dialog's read: the search, and everything it shows beside it. */
  read: () => api<DailyRead>("GET", "/v1/daily-search?detail=true"),
  /** Starts the search, or changes which campaigns it holds (Save is the person's yes). */
  save: (body: DailySave) => api<{ started?: DailyStarted; search: DailySearch | null }>("PUT", "/v1/daily-search", body),
  /** The changes waiting on the search's campaigns and the scoreboard; the server answers `on: false` while they are off. */
  suggestions: () => api<DailySuggestions>("GET", "/v1/daily-search/suggestions"),
  pause: () => api<{ paused: number }>("PATCH", "/v1/daily-search", { action: "pause" }),
  resume: () => api<{ resumed: number }>("PATCH", "/v1/daily-search", { action: "resume" }),
  setClock: (body: { runAt?: string; repeat?: DailyRepeat }) =>
    api<{ search: DailySearch | null }>("PATCH", "/v1/daily-search", { action: "set_clock", ...body }),
  setRoom: (body: { reserve?: number; waitingCap?: number; perCampaign?: number }) =>
    api<{ search: DailySearch | null }>("PATCH", "/v1/daily-search", { action: "set_room", ...body }),
  /** The other people's searches (an owner or admin; anyone else is refused). */
  others: () => api<{ on: boolean; searches: OtherSearch[] }>("GET", "/v1/daily-search/all"),
  /** An admin pausing, or putting back, someone else's search. */
  steer: (id: string, action: "pause" | "resume") =>
    api<{ owner: string; paused: number; resumed: number }>("PATCH", `/v1/daily-search/${id}`, { action }),
};

import { adaptCalls, adaptCampaigns, adaptOutreach, adaptOverview, adaptPipeline, adaptRecruiters, adaptWeekly } from "./analyticsWire";
import { api } from "./client";

/** GET /v1/analytics/outreach: emails over a period, where replies come and where they stall. */
export type OutreachAnalytics = {
  days: number;
  timeZone: string;
  totals: {
    drafted: number;
    sent: number;
    replied: number;
    noReply: number;
    bounced: number;
    /** Sent, nothing logged yet. */
    awaiting: number;
    failedToSend: number;
    /** From sending to the reply being logged; null with no replies. */
    medianHoursToReply: number | null;
    /** replied / sent, 0 to 1; null when nothing was sent. */
    replyRate: number | null;
  };
  byCampaign: Array<{
    campaignId: string;
    name: string;
    drafted: number;
    sent: number;
    replied: number;
    awaiting: number;
    replyRate: number | null;
  }>;
  byTouch: Array<{ touch: "first" | "second" | "later"; sent: number; replied: number; replyRate: number | null }>;
  /** 24 hours in the viewer's time zone. */
  byHour: Array<{ hour: number; sent: number; replied: number }>;
  stalls: { draftsWaiting: number; unlogged: number };
};

/** GET /v1/analytics/usage: today against the daily limits, day by day, and (admins) by person. */
export type UsageAnalytics = {
  days: number;
  timeZone: string;
  today: Array<{ id: string; label: string; used: number; limit: number }>;
  daily: Array<{ day: string; messages: number; searches: number; specs: number; profiles: number; exports: number }>;
  people: Array<{ userId: string; name: string; messages: number; searches: number; specs: number; exports: number }> | null;
};

/** GET /v1/analytics/projects: every campaign the viewer can see, side by side. */
export type ProjectsAnalytics = {
  quietAfterDays: number;
  campaigns: Array<{
    campaignId: string;
    name: string;
    status: "active" | "closed";
    client: string | null;
    target: number;
    openedAt: string;
    closedAt: string | null;
    found: number;
    /** Everyone ever added to the pipeline. */
    shortlisted: number;
    contacted: number;
    replied: number;
    interviewed: number;
    hired: number;
    firstHireAt: string | null;
    lastActivityAt: string | null;
    daysOpen: number;
    daysToFirstHire: number | null;
    quiet: boolean;
  }>;
};

/* ── the five Analytics pages ────────────────────────────────────────────────
   The wire format is docs/analytics-api.md. Every response carries the same envelope, so a page can say
   what it is showing (and why it is empty) without guessing. */

/** What every Analytics request carries; empty values are left out of the address. */
export type AnalyticsQuery = {
  /** 7, 30 or 90; "custom" takes `from` and `to` (YYYY-MM-DD in the viewer's zone, at most 365 days). */
  period?: "7" | "30" | "90" | "custom";
  from?: string;
  to?: string;
  campaign?: string;
  client?: string;
  /** Owner or admin only: the server ignores it for a recruiter. */
  recruiter?: string;
  /** A recruiter only: "campaigns" is the totals over the campaigns they can see, with no names. */
  view?: "mine" | "campaigns";
  /** Campaigns page: active (and closed ones with activity in the period), closed, or all. */
  state?: "active" | "closed" | "all";
};

/**
 * A share of something, as the pages use it: `rate` is whole percent (0 to 100); it is null and `smallN` true when `of`
 * is under 5. The API sends a fraction and `small`; analyticsWire.ts does the translation once, at the edge.
 */
export type Ratio = { n: number; of: number; rate: number | null; smallN: boolean };
/** A median: `days` (or `hours`) is null with fewer than 3 values. */
export type Median = { days?: number | null; hours?: number | null; n: number };

export type Envelope = {
  period: { key: string; days: number; from: string; to: string; prevFrom: string; prevTo: string };
  timeZone: string;
  viewer: {
    role: "owner" | "admin" | "recruiter" | "personal";
    userId: string | null;
    seesTeam: boolean;
    canPickRecruiter: boolean;
    view: "team" | "recruiter" | "mine" | "campaigns";
    recruiterId: string | null;
  };
  /** Nothing to draw: `no_campaigns` (nothing to measure yet) or `no_activity` (nothing in this period). */
  empty: boolean;
  emptyReason: "no_campaigns" | "no_activity" | null;
};

/** GET /v1/analytics/overview */
export type OverviewAnalytics = Envelope & {
  tiles: {
    hires: { n: number; prev: number; planned: number };
    interviews: { n: number; prev: number };
    replies: { n: number; prev: number; contacted: number };
    found: { n: number; prev: number; series: Array<{ day: string; n: number }> };
  };
  funnel: {
    cohort: { from: string; to: string };
    steps: Array<{ id: string; label: string; n: number }>;
    rates: Array<Ratio & { id: string; label: string }>;
  };
  trend: { grain: "day" | "week"; points: Array<{ start: string; interviews: number; hires: number }> };
  lookAt: Array<{ kind: string; count: number; text: string; campaignId: string | null; href: string }>;
};

/** One person's period, as the Recruiters page counts it (what people did themselves, not what automation did). */
export type PersonRow = {
  userId?: string;
  name: string;
  role?: string;
  former?: boolean;
  active?: boolean;
  emails: { sent: number; replied: number; reply: Ratio };
  calls: { placed: number; connected: number; talkSeconds: number; connect: Ratio };
  moves: { shortlisted: number; interviews: number; hires: number };
  tasks: { due: number; onTime: number; overdue: number };
  load: { inProgress: number; waiting: number; campaigns: number };
  prev?: {
    emailsSent: number; replies: number; callsPlaced: number; talkSeconds: number;
    shortlisted: number; interviews: number; hires: number;
  };
};

export type WaitingPerson = {
  campaignCandidateId: string;
  candidateId: string;
  campaignId?: string;
  name: string;
  campaign: string;
  stage: string;
  step?: string | null;
  days: number;
  pastThreshold?: boolean;
  ownerName?: string | null;
  mine?: boolean;
};

/** GET /v1/analytics/recruiters: an owner or admin gets `people`; a recruiter gets `me` and, with 3+ others active, `typical`. */
export type RecruitersAnalytics = Envelope & {
  people: PersonRow[] | null;
  me: PersonRow | null;
  typical: Omit<PersonRow, "userId" | "name"> | null;
  waitingLongest: WaitingPerson[];
};

/** GET /v1/analytics/recruiters/:userId/weekly */
export type PersonWeekly = Envelope & {
  userId: string;
  name: string;
  grain: "day" | "week";
  points: Array<{ start: string; emails: number; calls: number; interviews: number }>;
  previous: Array<{ start: string; emails: number; calls: number; interviews: number }>;
};

/** An hour of the day that did best, with how many were sent or placed in it and how many were answered. */
export type BestHour = { hour: number; n: number; answered: number; answer: Ratio };

/** GET /v1/analytics/calls: calls placed from SuperHyre, so a failure here never hides the emails. */
export type CallsAnalytics = Envelope & {
  totals: {
    placed: number;
    connected: number;
    connect: Ratio;
    talkSeconds: number;
    avgSeconds: number | null;
    /** The period before; absent from an older server. */
    previous?: { placed: number; connected: number };
  };
  outcomes: Array<{ outcome: string; n: number }>;
  byCampaign: Array<{
    campaignId: string | null;
    name: string;
    placed: number;
    connected: number;
    talkSeconds: number;
    avgSeconds?: number | null;
  }>;
  /** Who placed them: an owner or admin looking at the whole team only; null for everyone else. */
  byPerson?: Array<{ userId: string; name: string; placed: number; connected: number; talkSeconds: number; avgSeconds: number | null }> | null;
  bestHour?: BestHour | null;
  records?: { withRecording: number; withSummary: number };
  daily: Array<{ day: string; placed: number; connected: number }>;
};

export type Channel = "email" | "calls" | "whatsapp";

/**
 * Outreach by channel: what the Outreach page draws. The server sends it as `channels`, `all`, `campaigns`,
 * `byPerson` and `email` next to the older email fields; for an older server the page puts the same shape
 * together from the two answers it has (`fromServer` is then false and the period before is unknown).
 */
export type OutreachHub = {
  fromServer: boolean;
  channels: {
    email: {
      sent: number;
      replied: number;
      bounced: number;
      scheduled: number;
      awaiting: number;
      reply: Ratio;
      bounce: Ratio;
      previous: { sent: number; replied: number };
    };
    calls: {
      placed: number;
      connected: number;
      talkSeconds: number;
      avgSeconds: number | null;
      connect: Ratio;
      previous: { placed: number; connected: number };
      outcomes: Array<{ outcome: string; n: number }>;
      withRecording: number;
      withSummary: number;
      bestHour: BestHour | null;
    };
    /** Magnifi, not connected yet: there are no figures, and a zero is never drawn. */
    whatsapp: { connected: boolean; sent: number; replied: number; reply: Ratio; previous: { sent: number; replied: number } };
  };
  /** Touches sent on every channel and how many were answered (a reply, a connected call, a WhatsApp reply). */
  all: { sent: number; answered: number; answer: Ratio; previous: { sent: number; answered: number } };
  campaigns: Array<{
    campaignId: string | null;
    name: string;
    email: { sent: number; replied: number; bounced: number; scheduled: number; awaiting: number; reply: Ratio };
    calls: { placed: number; connected: number; talkSeconds: number; avgSeconds: number | null; connect: Ratio };
    whatsapp: { connected: boolean; sent: number; replied: number };
    sent: number;
    answered: number;
    answer: Ratio;
  }>;
  /** An owner or admin looking at the whole team only; null for everyone else. */
  byPerson: Array<{
    userId: string;
    name: string;
    email: { sent: number; replied: number; reply: Ratio };
    calls: { placed: number; connected: number; avgSeconds: number | null; connect: Ratio };
  }> | null;
  email: { timeToFirstReply: Median; bounce: Ratio; bestHour: BestHour | null };
};

/** What GET /v1/analytics/outreach adds to the old payload. */
export type OutreachExtras = Envelope & {
  reply: Ratio;
  timeToReply: Median;
  waiting: number;
  showByHour: boolean;
  /** The channel figures from the server; null from an older one. */
  hub?: OutreachHub | null;
};

/** GET /v1/analytics/pipeline */
export type PipelineAnalytics = Envelope & {
  thresholds: { shortlisted: number; outreach: number; interviewing: number };
  stages: Array<{ id: string; stage: string; step: string | null; label: string; n: number; waiting: number }>;
  totals: { inProgress: number; waiting: number; hired: number; passed: number };
  waitingLongest: WaitingPerson[];
  velocity: Array<{ stage: string; median: Median; prev: Median }>;
  timeToHire: Median;
  timeToFirstContact: Median;
  conversion: Array<Ratio & { id: string; label: string }>;
  weakestStep: string | null;
  offers: { made: number; accepted: number; notTaken: number; acceptance: Ratio };
  sources: Array<{ source: string; label: string; added: number; interviewed: number; hired: number }>;
  forms: { views: number; applications: number; added: number; passed: number; conversion: Ratio };
  /** Null until passes carry a reason from a short list. */
  passed: Array<{ reason: string; n: number }> | null;
};

export type CampaignStats = {
  campaignId: string;
  name: string;
  status: "active" | "closed";
  clientId: string | null;
  client: string | null;
  ownerId: string | null;
  ownerName: string | null;
  target: number;
  openedAt: string;
  closedAt: string | null;
  firstHireAt: string | null;
  lastActivityAt: string | null;
  found: number;
  shortlisted: number;
  contacted: number;
  replied: number;
  interviewed: number;
  hired: number;
  progress: { hired: number; target: number; share: number };
  daysOpen: number;
  daysToFirstHire: number | null;
  daysToFill: number | null;
  quiet: boolean;
  quietDays: number | null;
  activeInPeriod: boolean;
};

/** GET /v1/analytics/campaigns */
export type CampaignsAnalytics = Envelope & {
  quietAfterDays: number;
  campaigns: CampaignStats[];
  clients: Array<{
    clientId: string;
    name: string;
    campaigns: number;
    active: number;
    hired: number;
    planned: number;
    medianDaysToFirstHire: Median;
    replied: Ratio;
  }>;
};

/** The query string for a request; empty values are left out. */
export function analyticsQs(q: AnalyticsQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const getOutreachAnalytics = (days: number) =>
  api<OutreachAnalytics>("GET", `/v1/analytics/outreach?days=${days}`);
export const getUsageAnalytics = (days: number) => api<UsageAnalytics>("GET", `/v1/analytics/usage?days=${days}`);
export const getProjectsAnalytics = () => api<ProjectsAnalytics>("GET", "/v1/analytics/projects");

/* Each answer is read from the wire format (docs/analytics-api.md) into the shapes the pages draw: see analyticsWire.ts. */
export const getOverview = (q: AnalyticsQuery) =>
  api<unknown>("GET", `/v1/analytics/overview${analyticsQs(q)}`).then(adaptOverview);
export const getRecruiters = (q: AnalyticsQuery) =>
  api<unknown>("GET", `/v1/analytics/recruiters${analyticsQs(q)}`).then(adaptRecruiters);
export const getPersonWeekly = (userId: string, q: AnalyticsQuery) =>
  api<unknown>("GET", `/v1/analytics/recruiters/${encodeURIComponent(userId)}/weekly${analyticsQs(q)}`).then(adaptWeekly);
/** The outreach payload is the old one with the envelope and the filtered extras added. */
export const getOutreach = (q: AnalyticsQuery) =>
  api<unknown>("GET", `/v1/analytics/outreach${analyticsQs(q)}`).then(adaptOutreach);
export const getCalls = (q: AnalyticsQuery) => api<unknown>("GET", `/v1/analytics/calls${analyticsQs(q)}`).then(adaptCalls);
export const getPipeline = (q: AnalyticsQuery) =>
  api<unknown>("GET", `/v1/analytics/pipeline${analyticsQs(q)}`).then(adaptPipeline);
export const getCampaignsAnalytics = (q: AnalyticsQuery) =>
  api<unknown>("GET", `/v1/analytics/campaigns${analyticsQs(q)}`).then(adaptCampaigns);

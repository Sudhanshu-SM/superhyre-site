import type {
  CallsAnalytics,
  CampaignsAnalytics,
  Envelope,
  OutreachAnalytics,
  OutreachExtras,
  OutreachHub,
  OverviewAnalytics,
  PersonRow,
  PersonWeekly,
  PipelineAnalytics,
  RecruitersAnalytics,
  Ratio,
} from "./api/analytics";
import type { Filters } from "./analyticsFilters";
import { periodDays, ymd } from "./analyticsFilters";
import { hubOf, toRatio } from "./analyticsView";

/**
 * What the Analytics pages show when the console runs without an API (design and demo work). Shaped exactly like the
 * API's answers (docs/analytics-api.md). A 7-day period or a custom range answers "nothing in this period", so the
 * quiet state of every page can be seen; everything else is one busy month.
 */

const DAY = 86_400_000;

/** `?rows=60` on the address makes every list in the fixtures that long, to see a page with a lot of data. */
function manyRows(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(new URLSearchParams(window.location.search).get("rows"));
  return Number.isFinite(n) && n > 0 ? Math.min(200, Math.round(n)) : 0;
}
/** `?empty=1`: a workspace with no campaigns at all, to see every page in its first-day state. */
function noCampaigns(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("empty") === "1";
}
const FIRST = ["Aarav", "Meera", "Kabir", "Isha", "Rohan", "Nikita", "Vihaan", "Ananya", "Dev", "Saanvi", "Arjun", "Tara"];
const LAST = ["Iyer-Venkataraman", "Pillai", "Sharma", "Kapoor", "Menon", "Banerjee", "Reddy", "Chatterjee", "Nair", "Gupta"];
const nameAt = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
const back = (n: number) => ymd(new Date(Date.now() - n * DAY));
const iso = (n: number) => new Date(Date.now() - n * DAY).toISOString();

type Role = Envelope["viewer"]["role"];

function envelope(f: Filters, role: Role, emptyReason: Envelope["emptyReason"] = null): Envelope {
  const empty = noCampaigns() ? "no_campaigns" : emptyReason;
  const days = periodDays(f.period);
  const team = role === "owner" || role === "admin";
  return {
    period: { key: String(days), days, from: back(days - 1), to: back(0), prevFrom: back(days * 2 - 1), prevTo: back(days) },
    timeZone: "Asia/Kolkata",
    viewer: {
      role,
      userId: "me",
      seesTeam: team,
      canPickRecruiter: team,
      view: team ? "team" : f.view === "campaigns" ? "campaigns" : "mine",
      recruiterId: null,
    },
    empty: empty !== null,
    emptyReason: empty,
  };
}

/** Fixtures answer "nothing in this period" for a 7-day period and for any custom range. */
const quiet = (f: Filters): boolean => noCampaigns() || f.period.kind === "custom" || (f.period.kind === "days" && f.period.days === 7);
const r = (n: number, of: number): Ratio => toRatio(n, of);

/* ── Overview ── */

export function overviewFixture(f: Filters, role: Role = "admin"): OverviewAnalytics {
  const base = envelope(f, role, quiet(f) ? "no_activity" : null);
  const zero = quiet(f);
  const days = Math.min(30, periodDays(f.period));
  const weekly = days <= 14;
  const buckets = weekly ? days : 5;
  return {
    ...base,
    tiles: zero
      ? { hires: { n: 0, prev: 0, planned: 6 }, interviews: { n: 0, prev: 0 }, replies: { n: 0, prev: 0, contacted: 0 }, found: { n: 0, prev: 0, series: [] } }
      : {
        hires: { n: 3, prev: 1, planned: 8 },
        interviews: { n: 9, prev: 6 },
        replies: { n: 14, prev: 10, contacted: 52 },
        found: { n: 71, prev: 40, series: Array.from({ length: 30 }, (_, i) => ({ day: back(29 - i), n: (i * 7) % 6 + (i > 20 ? 3 : 0) })) },
      },
    funnel: {
      cohort: { from: base.period.from, to: base.period.to },
      steps: zero
        ? ["found", "shortlisted", "contacted", "replied", "interviewing", "hired"].map((id) => ({ id, label: LABEL[id]!, n: 0 }))
        : [
          { id: "found", label: "Found", n: 80 },
          { id: "shortlisted", label: "On the shortlist", n: 41 },
          { id: "contacted", label: "Contacted", n: 30 },
          { id: "replied", label: "Replied", n: 12 },
          { id: "interviewing", label: "Interviewing", n: 7 },
          { id: "hired", label: "Hired", n: 3 },
        ],
      rates: zero
        ? []
        : [
          { id: "kept", label: "Kept after search", ...r(41, 80) },
          { id: "reachedOut", label: "Reached out to", ...r(30, 41) },
          { id: "replied", label: "Replied", ...r(12, 30) },
          { id: "interviewing", label: "Moved to interview", ...r(7, 12) },
          { id: "hired", label: "Hired", ...r(3, 7) },
        ],
    },
    trend: {
      grain: weekly ? "day" : "week",
      points: zero
        ? []
        : Array.from({ length: buckets }, (_, i) => ({
          start: back((buckets - 1 - i) * (weekly ? 1 : 7)),
          interviews: [1, 3, 2, 4, 3, 5, 2][i % 7] ?? 1,
          hires: i % 3 === 2 ? 1 : 0,
        })),
    },
    lookAt: zero
      ? []
      : [
        { kind: "quiet_campaign", count: 1, text: "1 campaign has been quiet for 7 days or more", campaignId: null, href: "#/analytics/campaigns" },
        { kind: "waiting", count: 5, text: "5 people have waited longer than usual", campaignId: null, href: "#/analytics/pipeline" },
        { kind: "unlogged_replies", count: 6, text: "6 sent emails have nothing noted after 4 days", campaignId: null, href: "#/analytics/outreach" },
      ],
  };
}

const LABEL: Record<string, string> = {
  found: "Found", shortlisted: "On the shortlist", contacted: "Contacted", replied: "Replied", interviewing: "Interviewing", hired: "Hired",
};

/* ── Recruiters ── */

function person(name: string, userId: string, k: number, over: Partial<PersonRow> = {}): PersonRow {
  const sent = Math.round(42 * k);
  const replied = Math.round(9 * k);
  const placed = Math.round(18 * k);
  const connected = Math.round(11 * k);
  return {
    userId, name, role: "recruiter", former: false, active: true,
    emails: { sent, replied, reply: r(replied, sent) },
    calls: { placed, connected, talkSeconds: Math.round(3120 * k), connect: r(connected, placed) },
    moves: { shortlisted: Math.round(20 * k), interviews: Math.round(5 * k), hires: Math.round(2 * k) },
    tasks: { due: Math.round(6 * k), onTime: Math.round(5 * k), overdue: k > 0.5 ? 1 : 0 },
    load: { inProgress: Math.round(14 * k), waiting: Math.round(3 * k), campaigns: k > 0 ? 2 : 0 },
    prev: {
      emailsSent: Math.round(30 * k), replies: Math.round(6 * k), callsPlaced: Math.round(12 * k), talkSeconds: Math.round(2000 * k),
      shortlisted: Math.round(15 * k), interviews: Math.round(3 * k), hires: Math.round(1 * k),
    },
    ...over,
  };
}

/** The nameless "team typical" row: the same figures, no name and no id. */
function typicalRow(k: number): Omit<PersonRow, "userId" | "name"> {
  const { userId: _id, name: _name, ...rest } = person("", "", k);
  return rest;
}

const TEAM: Array<[string, string, number]> = [
  ["Meera Nair", "u-meera", 1],
  ["Dev Menon", "u-dev", 0.7],
  ["Riya Kapoor", "u-riya", 1.3],
  ["Punith S", "u-punith", 0.35],
  ["Arjun Rao", "u-arjun", 0],
];

export function recruitersFixture(f: Filters, role: Role = "admin"): RecruitersAnalytics {
  const base = envelope(f, role, quiet(f) ? "no_activity" : null);
  const k = quiet(f) ? 0 : 1;
  if (role === "recruiter" || role === "personal") {
    const me = person("You", "me", 0.8 * k);
    return {
      ...base,
      people: null,
      me,
      typical: role === "recruiter" && k > 0 ? typicalRow(0.7) : null,
      waitingLongest: k === 0 ? [] : [
        ...Array.from({ length: manyRows() }, (_, i) => ({
          campaignCandidateId: `wx${i}`, candidateId: `cx${i}`, name: nameAt(i), campaign: "Senior Backend Engineers", stage: "outreach", step: "waiting", days: 50 - (i % 30),
        })),
        { campaignCandidateId: "w1", candidateId: "c1", name: "Asha Verma", campaign: "Senior Backend Engineers", stage: "outreach", step: "waiting", days: 19 },
        { campaignCandidateId: "w2", candidateId: "c2", name: "Kabir Shah", campaign: "Platform SRE", stage: "shortlisted", step: null, days: 12 },
        { campaignCandidateId: "w3", candidateId: "c3", name: "Nikhil Rao", campaign: "Senior Backend Engineers", stage: "interviewing", step: "loop", days: 9 },
      ],
    };
  }
  const extra = Array.from({ length: Math.max(0, manyRows() - TEAM.length) }, (_, i): [string, string, number] => [nameAt(i + 11), `u-x${i}`, [0.2, 0.6, 1.1, 0, 0.9][i % 5]!]);
  const roster = [...TEAM, ...extra];
  const only = f.userId ? roster.filter(([, id]) => id === f.userId) : roster;
  return {
    ...base,
    people: noCampaigns() ? [] : only.map(([name, id, m]) => person(name, id, m * k)),
    me: null,
    typical: null,
    waitingLongest: [],
  };
}

export function weeklyFixture(userId: string, f: Filters): PersonWeekly {
  const name = TEAM.find(([, id]) => id === userId)?.[0] ?? "Teammate";
  const weeks = Math.max(2, Math.min(13, Math.ceil(periodDays(f.period) / 7)));
  const make = (shift: number) =>
    Array.from({ length: weeks }, (_, i) => ({
      start: back((weeks - 1 - i) * 7 + shift),
      emails: [12, 9, 15, 7, 11, 14, 10][(i + shift) % 7]!,
      calls: [5, 3, 6, 2, 4, 5, 3][(i + shift) % 7]!,
      interviews: [2, 1, 3, 0, 1, 2, 1][(i + shift) % 7]!,
    }));
  return { ...envelope(f, "admin"), userId, name, grain: "week", points: make(0), previous: make(weeks * 7) };
}

/* ── Outreach ── */

export function outreachFixture(f: Filters, role: Role = "admin"): OutreachAnalytics & OutreachExtras {
  const base = outreachBase(f, role);
  return { ...base, hub: fixtureHub(base, callsFixture(f, role), role, quiet(f)) };
}

/** The channel figures a current server sends, made from the same fixture numbers. */
function fixtureHub(e: OutreachAnalytics & OutreachExtras, c: CallsAnalytics, role: Role, zero: boolean): OutreachHub {
  const h = hubOf({ ...e, hub: null }, c);
  if (zero) return { ...h, fromServer: true };
  const team = role === "owner" || role === "admin";
  const person = (userId: string, name: string, sent: number, replied: number, placed: number, connected: number, avg: number) => ({
    userId,
    name,
    email: { sent, replied, reply: r(replied, sent) },
    calls: { placed, connected, avgSeconds: avg, connect: r(connected, placed) },
  });
  return {
    ...h,
    fromServer: true,
    channels: {
      ...h.channels,
      email: { ...h.channels.email, scheduled: 4, previous: { sent: 46, replied: 12 } },
      calls: { ...h.channels.calls, withRecording: 11, withSummary: 7, bestHour: { hour: 11, n: 6, answered: 4, answer: r(4, 6) } },
    },
    all: { ...h.all, previous: { sent: 60, answered: 20 } },
    campaigns: h.campaigns.map((x) => ({ ...x, email: { ...x.email, scheduled: x.email.sent > 10 ? 2 : 0 } })),
    byPerson: team
      ? [
        person("u-meera", "Meera Nair", 29, 10, 9, 6, 283),
        person("u-dev", "Dev Menon", 19, 5, 7, 4, 333),
        person("u-riya", "Riya Kapoor", 10, 2, 2, 1, 90),
      ]
      : null,
    email: { ...h.email, bestHour: { hour: 9, n: 21, answered: 8, answer: r(8, 21) } },
  };
}

function outreachBase(f: Filters, role: Role): OutreachAnalytics & OutreachExtras {
  const zero = quiet(f);
  const sent = zero ? 0 : 58;
  const replied = zero ? 0 : 17;
  return {
    ...envelope(f, role, zero ? "no_activity" : null),
    days: periodDays(f.period),
    timeZone: "Asia/Kolkata",
    totals: {
      drafted: zero ? 0 : 64, sent, replied, noReply: zero ? 0 : 21, bounced: 0, awaiting: zero ? 0 : 18, failedToSend: 0,
      medianHoursToReply: zero ? null : 19, replyRate: zero ? null : replied / sent,
    },
    byCampaign: zero ? [] : [
      ...Array.from({ length: Math.max(0, manyRows() - 3) }, (_, i) => ({
        campaignId: `cx${i}`, name: `${nameAt(i)} hiring, Staff Platform Engineer and friends`, drafted: 12, sent: 10 + (i % 9), replied: i % 5, awaiting: i % 4, replyRate: (i % 5) / (10 + (i % 9)),
      })),
      { campaignId: "c1", name: "Senior Backend Engineers", drafted: 31, sent: 29, replied: 10, awaiting: 7, replyRate: 10 / 29 },
      { campaignId: "c2", name: "Platform SRE", drafted: 27, sent: 25, replied: 5, awaiting: 8, replyRate: 5 / 25 },
      { campaignId: "c3", name: "iOS Engineers", drafted: 12, sent: 4, replied: 2, awaiting: 3, replyRate: 2 / 4 },
    ],
    byTouch: zero ? [] : [
      { touch: "first", sent: 41, replied: 11, replyRate: 11 / 41 },
      { touch: "second", sent: 13, replied: 5, replyRate: 5 / 13 },
      { touch: "later", sent: 4, replied: 1, replyRate: 1 / 4 },
    ],
    byHour: Array.from({ length: 24 }, (_, hour) =>
      zero ? { hour, sent: 0, replied: 0 }
        : hour === 9 ? { hour, sent: 21, replied: 8 } : hour === 11 ? { hour, sent: 19, replied: 5 }
          : hour === 15 ? { hour, sent: 12, replied: 3 } : hour === 18 ? { hour, sent: 6, replied: 1 } : { hour, sent: 0, replied: 0 }),
    stalls: { draftsWaiting: zero ? 0 : 3, unlogged: zero ? 0 : 5 },
    reply: r(replied, sent),
    timeToReply: zero ? { hours: null, n: 0 } : { hours: 19, n: 17 },
    waiting: zero ? 0 : 6,
    showByHour: !zero,
  };
}

export function callsFixture(f: Filters, role: Role = "admin"): CallsAnalytics {
  const zero = quiet(f);
  const days = Math.min(30, periodDays(f.period));
  return {
    ...envelope(f, role, zero ? "no_activity" : null),
    totals: zero
      ? { placed: 0, connected: 0, connect: r(0, 0), talkSeconds: 0, avgSeconds: null, previous: { placed: 0, connected: 0 } }
      : { placed: 18, connected: 11, connect: r(11, 18), talkSeconds: 3120, avgSeconds: 284, previous: { placed: 14, connected: 8 } },
    outcomes: [
      { outcome: "connected", n: zero ? 0 : 11 }, { outcome: "voicemail", n: zero ? 0 : 3 }, { outcome: "no_answer", n: zero ? 0 : 3 },
      { outcome: "call_back", n: zero ? 0 : 1 }, { outcome: "not_interested", n: 0 },
    ],
    byCampaign: zero ? [] : [
      { campaignId: "c1", name: "Senior Backend Engineers", placed: 9, connected: 6, talkSeconds: 1700 },
      { campaignId: "c2", name: "Platform SRE", placed: 7, connected: 4, talkSeconds: 1330 },
      { campaignId: null, name: "No campaign", placed: 2, connected: 1, talkSeconds: 90 },
    ],
    byPerson: zero || !(role === "owner" || role === "admin")
      ? null
      : [
        { userId: "u-meera", name: "Meera Nair", placed: 9, connected: 6, talkSeconds: 1700, avgSeconds: 283 },
        { userId: "u-dev", name: "Dev Menon", placed: 7, connected: 4, talkSeconds: 1330, avgSeconds: 333 },
        { userId: "u-riya", name: "Riya Kapoor", placed: 2, connected: 1, talkSeconds: 90, avgSeconds: 90 },
      ],
    bestHour: zero ? null : { hour: 11, n: 6, answered: 4, answer: r(4, 6) },
    records: zero ? { withRecording: 0, withSummary: 0 } : { withRecording: 11, withSummary: 7 },
    daily: zero ? [] : Array.from({ length: days }, (_, i) => ({ day: back(days - 1 - i), placed: i % 4 === 0 ? 0 : (i * 3) % 4, connected: (i * 5) % 3 })),
  };
}

/* ── Pipeline ── */

export function pipelineFixture(f: Filters, role: Role = "admin"): PipelineAnalytics {
  const zero = quiet(f);
  const mine = role === "recruiter" || role === "personal";
  return {
    ...envelope(f, role, zero ? "no_activity" : null),
    thresholds: { shortlisted: 7, outreach: 7, interviewing: 14 },
    stages: zero ? [] : [
      { id: "shortlisted", stage: "shortlisted", step: null, label: "Shortlisted", n: 22, waiting: 4 },
      { id: "outreach_waiting", stage: "outreach", step: "waiting", label: "Waiting for a reply", n: 15, waiting: 6 },
      { id: "outreach_replied", stage: "outreach", step: "replied", label: "Replied", n: 5, waiting: 1 },
      { id: "interviewing_loop", stage: "interviewing", step: "loop", label: "In the interview loop", n: 6, waiting: 1 },
      { id: "interviewing_offer", stage: "interviewing", step: "offer", label: "Offer stage", n: 2, waiting: 0 },
    ],
    totals: zero ? { inProgress: 0, waiting: 0, hired: 0, passed: 0 } : { inProgress: 50, waiting: 12, hired: 9, passed: 31 },
    waitingLongest: zero ? [] : [
      ...Array.from({ length: manyRows() }, (_, i) => ({
        campaignCandidateId: `x${i}`, candidateId: `kx${i}`, name: nameAt(i), campaign: `Senior Backend Engineers ${i % 4 === 0 ? "for a very long client name indeed" : ""}`.trim(),
        stage: i % 3 === 0 ? "shortlisted" : i % 3 === 1 ? "outreach" : "interviewing", step: i % 3 === 1 ? "waiting" : i % 3 === 2 ? "loop" : null,
        days: 60 - (i % 40), pastThreshold: true, ownerName: mine ? "You" : nameAt(i + 3), mine,
      })),
      { campaignCandidateId: "a1", candidateId: "k1", name: "Asha Verma", campaign: "Senior Backend Engineers", stage: "outreach", step: "waiting", days: 19, pastThreshold: true, ownerName: mine ? "You" : "Meera Nair", mine },
      { campaignCandidateId: "a2", candidateId: "k2", name: "Kabir Shah", campaign: "Platform SRE", stage: "shortlisted", step: null, days: 12, pastThreshold: true, ownerName: mine ? null : "Dev Menon", mine: false },
      { campaignCandidateId: "a3", candidateId: "k3", name: "Nikhil Rao", campaign: "Senior Backend Engineers", stage: "interviewing", step: "loop", days: 9, pastThreshold: false, ownerName: mine ? "You" : "Riya Kapoor", mine },
      { campaignCandidateId: "a4", candidateId: "k4", name: "Sana Iyer", campaign: "iOS Engineers", stage: "outreach", step: "replied", days: 8, pastThreshold: true, ownerName: null, mine: false },
    ],
    velocity: zero ? [] : [
      { stage: "shortlisted", median: { days: 2.1, n: 30 }, prev: { days: 2.8, n: 25 } },
      { stage: "outreach", median: { days: 5.4, n: 22 }, prev: { days: 4.9, n: 18 } },
      { stage: "interviewing", median: { days: 9, n: 8 }, prev: { days: 11, n: 5 } },
    ],
    timeToHire: zero ? { days: null, n: 0 } : { days: 21, n: 7 },
    timeToFirstContact: zero ? { days: null, n: 0 } : { days: 1.5, n: 24 },
    conversion: zero ? [] : [
      { id: "kept", label: "Kept after search", ...r(41, 80) },
      { id: "reachedOut", label: "Reached out to", ...r(30, 41) },
      { id: "replied", label: "Replied", ...r(12, 30) },
      { id: "interviewing", label: "Moved to interview", ...r(7, 12) },
      { id: "hired", label: "Hired", ...r(3, 7) },
    ],
    weakestStep: zero ? null : "replied",
    offers: { made: zero ? 0 : 4, accepted: zero ? 0 : 3, notTaken: zero ? 0 : 1, acceptance: r(zero ? 0 : 3, zero ? 0 : 4) },
    sources: zero ? [] : [
      ...Array.from({ length: Math.max(0, manyRows() - 4) }, (_, i) => ({ source: `s${i}`, label: `Referral from ${nameAt(i)}`, added: 30 - (i % 25), interviewed: 3, hired: i % 4 === 0 ? 1 : 0 })),
      { source: "agent", label: "Found by the agent", added: 40, interviewed: 9, hired: 3 },
      { source: "extension", label: "Browser extension", added: 18, interviewed: 4, hired: 1 },
      { source: "form", label: "Application form", added: 11, interviewed: 2, hired: 0 },
      { source: "manual", label: "Added by hand", added: 6, interviewed: 1, hired: 0 },
    ],
    forms: zero
      ? { views: 0, applications: 0, added: 0, passed: 0, conversion: r(0, 0) }
      : { views: 120, applications: 18, added: 11, passed: 4, conversion: r(18, 120) },
    passed: null,
  };
}

/* ── Campaigns ── */

export function campaignsFixture(f: Filters, state: "active" | "closed" | "all" = "active", role: Role = "admin"): CampaignsAnalytics {
  const all: CampaignsAnalytics["campaigns"] = [
    {
      campaignId: "c1", name: "Senior Backend Engineers", status: "active", clientId: "cl1", client: "Razorpay", ownerId: "u-meera", ownerName: "Meera Nair",
      target: 5, openedAt: iso(42), closedAt: null, firstHireAt: iso(24), lastActivityAt: iso(0),
      found: 412, shortlisted: 38, contacted: 29, replied: 10, interviewed: 6, hired: 2,
      progress: { hired: 2, target: 5, share: 40 }, daysOpen: 42, daysToFirstHire: 18, daysToFill: null, quiet: false, quietDays: null, activeInPeriod: true,
    },
    {
      campaignId: "c2", name: "Platform SRE", status: "active", clientId: "cl2", client: "Zerodha", ownerId: "u-dev", ownerName: "Dev Menon",
      target: 2, openedAt: iso(21), closedAt: null, firstHireAt: null, lastActivityAt: iso(2),
      found: 233, shortlisted: 24, contacted: 19, replied: 5, interviewed: 2, hired: 0,
      progress: { hired: 0, target: 2, share: 0 }, daysOpen: 21, daysToFirstHire: null, daysToFill: null, quiet: false, quietDays: null, activeInPeriod: true,
    },
    {
      campaignId: "c3", name: "iOS Engineers", status: "active", clientId: null, client: null, ownerId: "u-riya", ownerName: "Riya Kapoor",
      target: 1, openedAt: iso(40), closedAt: null, firstHireAt: null, lastActivityAt: iso(11),
      found: 96, shortlisted: 12, contacted: 10, replied: 2, interviewed: 0, hired: 0,
      progress: { hired: 0, target: 1, share: 0 }, daysOpen: 40, daysToFirstHire: null, daysToFill: null, quiet: true, quietDays: 11, activeInPeriod: false,
    },
    {
      campaignId: "c4", name: "Data Analysts", status: "closed", clientId: "cl1", client: "Razorpay", ownerId: "u-meera", ownerName: "Meera Nair",
      target: 3, openedAt: iso(90), closedAt: iso(12), firstHireAt: iso(70), lastActivityAt: iso(12),
      found: 150, shortlisted: 30, contacted: 26, replied: 11, interviewed: 7, hired: 3,
      progress: { hired: 3, target: 3, share: 100 }, daysOpen: 78, daysToFirstHire: 20, daysToFill: 44, quiet: false, quietDays: null, activeInPeriod: true,
    },
  ];
  const more: CampaignsAnalytics["campaigns"] = Array.from({ length: Math.max(0, manyRows() - all.length) }, (_, i) => ({
    campaignId: `cx${i}`, name: `${nameAt(i)} Engineering Lead for the Southern Region (confidential)`, status: i % 7 === 6 ? "closed" : "active",
    clientId: null, client: i % 3 === 0 ? null : `Client number ${i} Limited`, ownerId: null, ownerName: nameAt(i + 5),
    target: 1 + (i % 5), openedAt: iso(10 + i), closedAt: i % 7 === 6 ? iso(3) : null, firstHireAt: null, lastActivityAt: iso(i % 15),
    found: 100 + i * 3, shortlisted: 30 + i, contacted: 20 + (i % 9), replied: 5 + (i % 4), interviewed: i % 5, hired: i % 3,
    progress: { hired: i % 3, target: 1 + (i % 5), share: 0 }, daysOpen: 10 + i, daysToFirstHire: i % 3 === 0 ? 14 : null, daysToFill: null,
    quiet: i % 6 === 0, quietDays: i % 6 === 0 ? 9 : null, activeInPeriod: true,
  }));
  const everyone = noCampaigns() ? [] : [...all, ...more];
  const rows = state === "all" ? everyone : state === "closed" ? everyone.filter((c) => c.status === "closed") : everyone.filter((c) => c.status === "active" || c.activeInPeriod);
  return {
    ...envelope(f, role, null),
    quietAfterDays: 7,
    campaigns: rows,
    clients: noCampaigns() ? [] : [
      ...Array.from({ length: Math.max(0, manyRows() - 2) }, (_, i) => ({
        clientId: `clx${i}`, name: `Client number ${i} Limited of the Greater Metropolitan Area`, campaigns: 1 + (i % 4), active: i % 3, hired: i % 5, planned: 2 + (i % 6),
        medianDaysToFirstHire: { days: i % 2 ? 21 : null, n: i % 2 ? 4 : 1 }, replied: r(i % 9, 20),
      })),
      { clientId: "cl1", name: "Razorpay", campaigns: 2, active: 1, hired: 5, planned: 8, medianDaysToFirstHire: { days: 19, n: 2 }, replied: r(21, 55) },
      { clientId: "cl2", name: "Zerodha", campaigns: 1, active: 1, hired: 0, planned: 2, medianDaysToFirstHire: { days: null, n: 0 }, replied: r(5, 19) },
    ],
  };
}

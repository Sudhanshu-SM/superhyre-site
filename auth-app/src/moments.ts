import type { CampaignKey, PipelineRole } from "./orchestrator";
import { campaignName } from "./orchestrator";
import type { Phase, Verdict } from "./sourcing";
import { CANDIDATES } from "./sourcing";
import { CAMPAIGN_ROWS } from "./campaignsData";
import type { FormView } from "./formsStore";
import { campaignById, listCampaignStubs } from "./formsStore";

/**
 * Moments — every special reply the agent can give beyond sourcing, and the
 * classifier that decides which one a brief gets.
 *
 * Frontend fixtures, like the rest of the surface. Names, campaigns and
 * counts agree with orchestrator.ts (FLEET, OVERVIEW) and sourcing.ts
 * (CANDIDATES), so a moment never contradicts a tile beside it.
 */

export type MomentKind =
  | "sourcing" | "outreach" | "status" | "assign" | "report" | "compare"
  | "schedule" | "leak" | "rediscover" | "intake" | "digest" | "campaign" | "form" | "form-status" | "reply"
  | "client" | "campaign-new";

/** Moments that walk through steps (one row per answer, keys to pick). */
export const GUIDED: ReadonlySet<MomentKind> = new Set<MomentKind>(["form", "client", "campaign-new"]);

/**
 * Which moment a brief gets. Ordered from most to least specific, because a
 * brief like "reach out to the SRE shortlist" mentions a campaign (status
 * words) and an action (outreach), and the action is what was asked.
 */
export function classify(said: string): MomentKind {
  const s = said.toLowerCase();
  /* A client to add: "add a client", "new client", "add Acme as a client".
     First, because a company's name can contain any other trigger word. */
  if (/\bnew client\b/.test(s) || /\b(add|create|onboard|register|set ?up|sign)\b[^.?!]*\bas (a |our |the )?(new )?client\b/.test(s)
    || /\b(add|create|onboard|register|set ?up)\s+(a\s+|another\s+)?(new\s+)?client\b/.test(s)) return "client";
  if (/sourc/.test(s)) return "sourcing";
  /* A form to make, not responses to read: "how are the form responses
     going" is a status question and falls through. */
  if (!/\bresponses?\b/.test(s) && (
    /\b(create|make|build|draft|set ?up|start|new|need|want|write|put together)\b[^.?!]*\b(form|questionnaire)s?\b/.test(s) ||
    /\b(screening|hiring|application) (form|questions)\b/.test(s))) return "form";
  /* Responses to a form: counts per live form, never the agents dialog. */
  if (/\bforms?\b/.test(s) && /\bresponses?\b/.test(s) && !/report|summary of|receipt/.test(s)) return "form-status";
  /* A campaign to set up, not one to chart: the verb sits right before it. */
  if (/\b(create|start|set ?up|launch|open|add|spin up|kick off|begin|make)\s+(a\s+|an\s+|another\s+)?(new\s+)?(hiring\s+)?campaign\b/.test(s)
    || /^\s*new campaign\b/.test(s)) return "campaign-new";
  if (/\bcompare\b|\bvs\.?\b|versus/.test(s)) return "compare";
  if (/schedul|\bbook\b|calendar|find a time/.test(s)) return "schedule";
  /* Questions before actions: "how is the outreach going" is about outreach,
     not a request to do more of it. */
  if (/morning|overnight|digest|catch me up|what did i miss/.test(s)) return "digest";
  if (/report|what has|what did|done (on|for|this)|receipt|summary of/.test(s)) return "report";
  if (/losing|leak|drop.?off|bottleneck/.test(s)) return "leak";
  if (/campaign|analytics|graph|chart|metrics|numbers|performance|funnel|stats/.test(s) && !/agent/.test(s)) return "campaign";
  if (/status|how (is|are|'s)|going|progress|update on/.test(s)) return "status";
  if (/assign|deploy|hand (it|this|over)|have \w+ (start|begin|run|take)|put \w+ on|start (screening|sourcing|outreach)/.test(s)) return "assign";
  if (/reach out|outreach|message (the|them|everyone)|contact (the|them)|send .*(whatsapp|email|linkedin)/.test(s)) return "outreach";
  if (/past (search|candidate|pipeline)|rediscover|silver|previous (search|candidate)|anyone from/.test(s)) return "rediscover";
  if (/intake|notes from|call notes|hiring manager said|messy brief/.test(s)) return "intake";
  return "reply";
}

/** The campaign a brief names, if any. */
export function campaignIn(said: string): CampaignKey | null {
  const s = said.toLowerCase();
  if (/\bsre\b|platform/.test(s)) return "platform-sre";
  if (/\bios\b|mobile/.test(s)) return "ios-mid";
  if (/backend|back-end/.test(s)) return "backend-snr";
  return null;
}

/** Keywords for campaigns a form request may name without its full name. */
const FORM_CAMPAIGN_WORDS: readonly [string, RegExp][] = [
  ["backend-snr", /backend|back-end/],
  ["platform-sre", /\bsre\b|platform/],
  ["ios-mid", /\bios\b|mobile/],
  ["design-lead", /design lead|design/],
  ["gtm-ae", /\bae\b|account exec|enterprise/],
  ["ds-applied", /data scien|applied data/],
  ["fin-controller", /controller|finance/],
];

/**
 * The campaign a form request names, if any: its full name first (including
 * campaigns started from chat), then a keyword. Separate from campaignIn,
 * which only knows the three campaigns the agents run on.
 */
export function formCampaignIn(said: string): string | null {
  const s = said.toLowerCase();
  const all = [...CAMPAIGN_ROWS.map((r) => r.id), ...listCampaignStubs().map((c) => c.id)];
  for (const id of all) {
    const name = campaignById(id)?.name.toLowerCase();
    if (name && s.includes(name)) return id;
  }
  for (const [id, re] of FORM_CAMPAIGN_WORDS) if (re.test(s)) return id;
  return null;
}

/** The agent role a brief names, if any. */
export function roleIn(said: string): PipelineRole | null {
  const s = said.toLowerCase();
  if (/screen/.test(s)) return "Screening";
  if (/outreach|reach|message/.test(s)) return "Outreach";
  if (/sourc/.test(s)) return "Sourcing";
  return null;
}

/** Candidates a brief names by first name, in the order they appear. */
export function candidatesIn(said: string): string[] {
  const s = said.toLowerCase();
  return CANDIDATES
    .map((c) => ({ id: c.id, at: s.indexOf(c.name.split(" ")[0]!.toLowerCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.id);
}

/* ── channels and connectors ─────────────────────────────────────────────── */

export type ChannelId = "gmail" | "whatsapp" | "linkedin";
export type ServiceId = "gmail" | "outlook" | "magnifi" | "linkedin" | "slack" | "notion";

export type ConnState = "disconnected" | "connecting" | "choosing" | "connected" | "expired" | "failed";

export type Service = {
  id: ServiceId;
  name: string;
  /** What the recruiter sees it as: "WhatsApp, through Magnifi". */
  channel: string;
  /** Single-character mark and brand fill for the logo tile. */
  mark: string;
  fill: string;
  ink: string;
  /** What the sign-in step is, in plain words. */
  signIn: string;
  /** Shown once connected, in place of the button. */
  identity: string;
  /** Services that ask a question after sign-in. */
  choices?: readonly { id: string; label: string; hint: string }[];
};

export const SERVICES: Record<ServiceId, Service> = {
  gmail: {
    id: "gmail", name: "Gmail", channel: "Email", mark: "M", fill: "#ffffff", ink: "#ea4335",
    signIn: "Waiting for Google sign-in…", identity: "punith@acme.com",
  },
  outlook: {
    id: "outlook", name: "Outlook", channel: "Email", mark: "O", fill: "#0078d4", ink: "#ffffff",
    signIn: "Waiting for Microsoft sign-in…", identity: "punith@acme.com",
  },
  magnifi: {
    id: "magnifi", name: "Magnifi", channel: "WhatsApp", mark: "W", fill: "#1fa855", ink: "#ffffff",
    signIn: "Waiting for Magnifi sign-in…", identity: "+91 80•••• 1200",
    choices: [
      { id: "+91 80•••• 1200", label: "+91 80•••• 1200", hint: "Acme Hiring · verified business" },
      { id: "+91 99•••• 0417", label: "+91 99•••• 0417", hint: "Punith's line · personal" },
    ],
  },
  linkedin: {
    id: "linkedin", name: "LinkedIn", channel: "LinkedIn", mark: "in", fill: "#0a66c2", ink: "#ffffff",
    signIn: "Checking the SuperHyre extension…", identity: "via the SuperHyre extension",
  },
  /* Where the agent posts updates and files notes. Not outreach carriers: nothing in CARRIER points here. */
  slack: {
    id: "slack", name: "Slack", channel: "Slack", mark: "S", fill: "#611f69", ink: "#ffffff",
    signIn: "Waiting for Slack sign-in…", identity: "Acme Hiring",
  },
  notion: {
    id: "notion", name: "Notion", channel: "Notion", mark: "N", fill: "#191918", ink: "#ffffff",
    signIn: "Waiting for Notion sign-in…", identity: "Hiring notes",
  },
};

/** Which service carries each outreach channel. */
export const CARRIER: Record<ChannelId, ServiceId> = {
  gmail: "gmail",
  whatsapp: "magnifi",
  linkedin: "linkedin",
};

export const CHANNEL_LABEL: Record<ChannelId, string> = {
  gmail: "Gmail",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
};

/**
 * Where the demo starts. Chosen so the first outreach run meets two
 * different connector states at once: WhatsApp never connected, and Gmail
 * connected once but since signed out.
 */
export const INITIAL_CONNECTIONS: Record<ServiceId, ConnState> = {
  gmail: "expired",
  outlook: "connected",
  magnifi: "disconnected",
  linkedin: "connected",
  slack: "disconnected",
  notion: "disconnected",
};

/** How each candidate can be reached. A missing channel has no contact on file. */
export const REACH: Readonly<Record<string, readonly ChannelId[]>> = {
  "rohan-mehta": ["whatsapp", "gmail", "linkedin"],
  "priya-nair": ["whatsapp", "gmail", "linkedin"],
  "anika-bose": ["gmail", "linkedin"],
  "vikram-iyer": ["gmail", "linkedin"],
  "sneha-kulkarni": ["whatsapp", "gmail", "linkedin"],
  "arjun-reddy": ["whatsapp", "gmail", "linkedin"],
  "kavya-sharma": ["gmail", "linkedin"],
  "rahul-verma": ["whatsapp", "linkedin"],
  "meghna-das": ["whatsapp", "gmail", "linkedin"],
  "siddharth-rao": ["gmail", "linkedin"],
  "neha-joshi": ["whatsapp", "gmail", "linkedin"],
  "aditya-menon": ["gmail", "linkedin"],
};

/** The personal line for each draft, and where in the profile it came from. */
export const HOOK: Readonly<Record<string, { line: string; from: string }>> = {
  "rohan-mehta": { line: "your zero-downtime move of Razorpay's ledger to 16 Postgres shards", from: "Staff Backend Engineer at Razorpay, 2023 – present" },
  "priya-nair": { line: "your rewrite of Swiggy's location ingest in Rust, taking p99 from 180 to 14ms", from: "Senior Software Engineer at Swiggy, 2021 – present" },
  "anika-bose": { line: "the way you run Zerodha's 60 TB order-book archive on Postgres", from: "Backend Engineer at Zerodha, 2022 – present" },
  "vikram-iyer": { line: "your consolidation of 4,000 tenant databases at Freshworks", from: "Lead Engineer at Freshworks, 2022 – present" },
  "sneha-kulkarni": { line: "partitioning CRED's hottest tables online without a maintenance window", from: "Senior Backend Engineer at CRED, 2022 – present" },
  "arjun-reddy": { line: "the Go failover orchestrator that took Jira's regional failover to 40 seconds", from: "Database Reliability Engineer at Atlassian, 2021 – present" },
  "kavya-sharma": { line: "running Postman's sync service on Postgres for 30M users", from: "Senior Software Engineer at Postman, 2022 – present" },
  "rahul-verma": { line: "thirteen years building payments backends at Paytm and Amazon", from: "Principal Engineer at Paytm, 2018 – present" },
  "meghna-das": { line: "Dunzo's dispatch services in Go on PostGIS", from: "Backend Engineer II at Dunzo, 2023 – present" },
  "siddharth-rao": { line: "your work on AlloyDB's Postgres-compatible WAL pipeline", from: "Senior Engineer at Google, 2021 – present" },
  "neha-joshi": { line: "lag-aware replica routing for Groww's portfolio reads", from: "Senior Backend Engineer at Groww, 2022 – present" },
  "aditya-menon": { line: "taking Chargebee's billing schema through a multi-region rollout", from: "Staff Engineer at Chargebee, 2020 – present" },
};

export const LINKEDIN_LIMIT = 300;

/** A draft in the channel's own shape. */
export function draftFor(id: string, channel: ChannelId): { subject?: string; body: string } {
  const c = CANDIDATES.find((x) => x.id === id)!;
  const first = c.name.split(" ")[0];
  const hook = HOOK[id]!.line;
  if (channel === "gmail") {
    return {
      subject: `${first}, a Staff Backend role at Acme`,
      body: `Hi ${first},\n\nI'm Punith, hiring for Acme's backend platform team. ${cap(hook)} is exactly the kind of work this role is about: we're moving our core ledger onto sharded Postgres this year.\n\nWould you be open to a 20-minute call next week?\n\nPunith`,
    };
  }
  if (channel === "whatsapp") {
    return { body: `Hi ${first}, I'm Punith from the backend team at Acme. ${cap(hook)} is exactly the kind of work this role is about. Open to a 20-minute chat this week?` };
  }
  return { body: `Hi ${first}, ${hook} caught my eye. I'm hiring senior backend engineers at Acme for Postgres-heavy work. Happy to share more if you're open to it.` };
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/* ── the phase scripts ───────────────────────────────────────────────────── */

export const OUTREACH_PLAN: readonly Phase[] = [
  {
    id: "o-read", live: "Reading the shortlist", done: "Read {n} shortlisted profiles", ms: 1800,
    steps: ["Pulled each profile's current role and contact details", "Checked none of them are already in a sequence"],
    says: "",
  },
  {
    id: "o-reach", live: "Checking how each person can be reached", done: "Checked how each can be reached", ms: 2000,
    steps: ["Phone numbers on file for WhatsApp", "Work or personal email found for each", "LinkedIn profiles matched for all"],
    says: "Here's how I'll reach each person. WhatsApp leads where there's a number on file, since you asked for it first, with email and LinkedIn as follow-ups two days apart.",
  },
];

export const OUTREACH_WRITE: readonly Phase[] = [
  {
    id: "o-write", live: "Writing a message for each person", done: "Wrote {n} messages", ms: 2200,
    steps: ["One personal line per person, taken from their current role", "WhatsApp drafts use the approved first-contact template", "LinkedIn notes kept under 300 characters"],
    says: "Each draft opens with one specific thing from that person's work. Review them one at a time, or approve all if they read right.",
  },
];

export const FORM_STATUS_PHASES: readonly Phase[] = [
  { id: "fs-read", live: "Counting responses", done: "Counted responses on every live form", ms: 700, steps: ["Live forms only. Drafts have no link yet."], says: "" },
];

export const STATUS_PHASES: readonly Phase[] = [
  { id: "s-check", live: "Checking in with the agents", done: "Checked in with the agents", ms: 1400, steps: ["Read each agent's latest report", "Compared against your last visit"], says: "" },
];

export const ASSIGN_PHASES: readonly Phase[] = [
  { id: "a-plan", live: "Finding the right agent", done: "Found the right agent", ms: 1200, steps: ["Matched the request to an agent role", "Checked whether that agent is free"], says: "" },
];

export const REPORT_PHASES: readonly Phase[] = [
  { id: "r-read", live: "Reading the run log", done: "Read the week's run log", ms: 1600, steps: ["18 sends across three channels", "7 replies, 1 bounce"], says: "" },
];

export const COMPARE_PHASES: readonly Phase[] = [
  { id: "c-read", live: "Reading both profiles side by side", done: "Compared the profiles", ms: 1500, steps: ["Lined up careers on one axis", "Checked each against the three ranking criteria"], says: "" },
];

export const SCHEDULE_PHASES: readonly Phase[] = [
  { id: "sc-cal", live: "Checking both calendars", done: "Checked both calendars", ms: 1600, steps: ["Sudhanshu is free Thursday and Friday mornings", "Priya said Thursday works"], says: "" },
];

export const LEAK_PHASES: readonly Phase[] = [
  { id: "l-count", live: "Counting every stage of the pipeline", done: "Counted every stage", ms: 1500, steps: ["Five stages, widest first", "Found the widest stage-to-stage drop"], says: "" },
];

export const REDISCOVER_PHASES: readonly Phase[] = [
  { id: "rd-past", live: "Searching your past pipelines", done: "Searched 3 past searches", ms: 1700, steps: ["Platform SRE, March", "Senior Backend, May", "Data Platform, July"], says: "" },
];

export const INTAKE_PHASES: readonly Phase[] = [
  { id: "i-read", live: "Reading the notes", done: "Read the notes", ms: 1500, steps: ["Found level, skills and location", "Found three things the notes leave open"], says: "" },
];

export const CAMPAIGN_PHASES: readonly Phase[] = [
  { id: "cp-pull", live: "Pulling the last two weeks", done: "Pulled 14 days of pipeline data", ms: 1400, steps: ["Sourced per day", "Every funnel stage", "Replies by channel"], says: "" },
];

export const DIGEST_PHASES: readonly Phase[] = [
  { id: "d-read", live: "Catching up on overnight runs", done: "Caught up on overnight runs", ms: 1400, steps: ["3 campaigns, 6 agents", "One stopped at 02:10"], says: "" },
];

/* ── the run receipt ─────────────────────────────────────────────────────── */

export type RunEvent = {
  day: number;
  kind: "sent" | "reply" | "bounce" | "call";
  channel?: ChannelId;
  who: string;
};

/** Outreach on Senior Backend, Mon 22 – Sat 27 Sep, in order. `day` is 0–5.x. */
export const RUN_LOG: readonly RunEvent[] = [
  { day: 0.2, kind: "sent", channel: "whatsapp", who: "Rohan Mehta" },
  { day: 0.25, kind: "sent", channel: "whatsapp", who: "Priya Nair" },
  { day: 0.3, kind: "sent", channel: "gmail", who: "Anika Bose" },
  { day: 0.4, kind: "sent", channel: "whatsapp", who: "Sneha Kulkarni" },
  { day: 0.8, kind: "sent", channel: "gmail", who: "Vikram Iyer" },
  { day: 1.0, kind: "bounce", channel: "gmail", who: "Vikram Iyer" },
  { day: 1.2, kind: "sent", channel: "whatsapp", who: "Arjun Reddy" },
  { day: 1.4, kind: "sent", channel: "gmail", who: "Kavya Sharma" },
  { day: 1.6, kind: "reply", channel: "whatsapp", who: "Priya Nair" },
  { day: 1.9, kind: "sent", channel: "whatsapp", who: "Meghna Das" },
  { day: 2.2, kind: "sent", channel: "whatsapp", who: "Neha Joshi" },
  { day: 2.4, kind: "sent", channel: "gmail", who: "Aditya Menon" },
  { day: 2.6, kind: "reply", channel: "whatsapp", who: "Sneha Kulkarni" },
  { day: 2.9, kind: "call", who: "Priya Nair" },
  { day: 3.1, kind: "sent", channel: "gmail", who: "Siddharth Rao" },
  { day: 3.3, kind: "reply", channel: "gmail", who: "Anika Bose" },
  { day: 3.5, kind: "sent", channel: "whatsapp", who: "Rahul Verma" },
  { day: 3.7, kind: "reply", channel: "whatsapp", who: "Arjun Reddy" },
  { day: 3.9, kind: "sent", channel: "linkedin", who: "Vikram Iyer" },
  { day: 4.1, kind: "sent", channel: "gmail", who: "Rohan Mehta" },
  { day: 4.3, kind: "sent", channel: "whatsapp", who: "Rohan Mehta" },
  { day: 4.5, kind: "reply", channel: "gmail", who: "Kavya Sharma" },
  { day: 4.7, kind: "call", who: "Sneha Kulkarni" },
  { day: 4.9, kind: "sent", channel: "gmail", who: "Meghna Das" },
  { day: 5.1, kind: "reply", channel: "whatsapp", who: "Neha Joshi" },
  { day: 5.4, kind: "reply", channel: "gmail", who: "Meghna Das" },
];

export const WEEK = ["Mon 22", "Tue 23", "Wed 24", "Thu 25", "Fri 26", "Sat 27"];

/* ── the rest ────────────────────────────────────────────────────────────── */

export const SLOTS = [
  { id: "thu-11", day: "Thu 2 Oct", time: "11:00 IST", note: "Best fit: both free, Priya's preferred day" },
  { id: "thu-1530", day: "Thu 2 Oct", time: "15:30 IST", note: "Both free" },
  { id: "fri-10", day: "Fri 3 Oct", time: "10:00 IST", note: "Both free, a day later" },
];

export const PAST: readonly { id: string; when: string; what: string }[] = [
  { id: "arjun-reddy", when: "Platform SRE · March", what: "Reached the final round, declined the offer over notice period" },
  { id: "sneha-kulkarni", when: "Senior Backend · May", what: "Shortlisted, moved to CRED before outreach started" },
  { id: "meghna-das", when: "Data Platform · July", what: "Strong screen, the role closed before an offer" },
];

export const INTAKE = {
  facts: ["Level · Senior or Staff", "Must have · Postgres at scale", "Nice to have · Go", "Location · India or remote", "Team · Ledger platform, 6 people"],
  open: [
    "Is Staff in scope, or only Senior? The notes say both.",
    "What is the budget band? It isn't in the notes.",
    "Does remote include candidates outside India?",
  ],
};

export const campaignLabel = (id: CampaignKey) => campaignName(id);

/* ── what every moment is handed ─────────────────────────────────────────── */


export type MomentCtx = {
  /** What the recruiter sent. */
  said: string;
  verdicts: Readonly<Record<string, Verdict>>;
  onVerdict: (id: string, v: Verdict | null) => void;
  openProfile: (id: string, ids?: readonly string[]) => void;
  /** Opens the ranked list (for a campaign, when several are in the chat). */
  openList: (campaignId?: string) => void;
  /** Deploys an agent into the live band; returns its key so it can be undone. */
  deploy: (role: PipelineRole, campaignId: CampaignKey | string) => string | null;
  undeploy: (key: string) => void;
  /** Puts a sentence in the composer. Never sends. */
  seed: (text: string) => void;
  /**
   * Sends a sentence as the person's next message, for a button that names what it does ("Ask for times",
   * "Find the drop-off"): it acts instead of leaving a draft in the composer. Where nothing can be sent (the
   * demo) it seeds. `campaignId` is the campaign the button is about, when it knows.
   */
  send?: (text: string, campaignId?: string) => void;
  onGrow: () => void;
  onBusy: (busy: boolean) => void;
  /** Answers to clarifying questions that don't rewrite the request. */
  answers?: Readonly<Record<string, string>>;
  /** Session preferences remembered from earlier answers. */
  prefs: Readonly<Record<string, string>>;
  setPref: (key: string, value: string) => void;
  /** The campaign the recruiter has open in the console, only if they picked it this session. */
  campaign?: { id: string; name: string } | null;
  /** Leaves the chat for the form builder. */
  openForm?: (campaignId: string, formId: string, view: FormView) => void;
  /** Leaves the chat for a campaign, making it the current one. */
  openCampaign?: (campaignId: string) => void;
};

/**
 * A button that names its action ("Ask for times", "Find the drop-off") does it: the words go as a message
 * where the chat can send them, and wait in the composer where it can't (the demo).
 */
export function act(ctx: Pick<MomentCtx, "seed" | "send">, text: string, campaignId?: string | null): void {
  if (ctx.send) ctx.send(text, campaignId ?? undefined);
  else ctx.seed(text);
}

/* ── campaigns a candidate is in ─────────────────────────────────────────────
   Some profiles sit in more than one campaign, and the same person ranks on
   different criteria in each. That is exactly when "compare Priya and Anika"
   is ambiguous, and the agent has to ask which campaign's criteria to use. */

export const CAMPAIGNS_OF: Readonly<Record<string, readonly CampaignKey[]>> = {
  "rohan-mehta": ["backend-snr"],
  "priya-nair": ["backend-snr", "platform-sre"],
  "anika-bose": ["backend-snr", "platform-sre"],
  "vikram-iyer": ["backend-snr"],
  "sneha-kulkarni": ["backend-snr"],
  "arjun-reddy": ["backend-snr", "platform-sre"],
  "kavya-sharma": ["backend-snr"],
  "rahul-verma": ["backend-snr"],
  "meghna-das": ["backend-snr", "ios-mid"],
  "siddharth-rao": ["backend-snr"],
  "neha-joshi": ["backend-snr"],
  "aditya-menon": ["backend-snr"],
};

/** Each campaign's ranking criteria. Backend's are the sourcing run's own. */
export const CRITERIA_FOR: Readonly<Record<CampaignKey, readonly string[]>> = {
  "backend-snr": ["Ran Postgres at scale", "Writes Go or Rust", "2+ years at a product company"],
  "platform-sre": ["Carried a production pager", "Kubernetes in production", "Postgres at scale"],
  "ios-mid": ["Shipped a Swift app", "SwiftUI in production", "Consumer product"],
};

/** Whether each person meets each campaign's criteria, index-aligned. */
export const MEETS_FOR: Readonly<Record<CampaignKey, Readonly<Record<string, readonly boolean[]>>>> = {
  "backend-snr": Object.fromEntries(CANDIDATES.map((c) => [c.id, c.meets])),
  "platform-sre": {
    "priya-nair": [true, true, true],
    "anika-bose": [false, false, true],
    "arjun-reddy": [true, true, true],
  },
  "ios-mid": { "meghna-das": [false, false, true] },
};

/** Evidence for a criterion, per person, so the comparison can say why. */
export const EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  "priya-nair": ["Owns a 22-node Postgres fleet", "Rust since 2021", "Swiggy and Myntra"],
  "anika-bose": ["60 TB archive on Postgres", "Go daily, Rust on weekends", "Zerodha, Hasura: both under 4 years"],
  "rohan-mehta": ["16-shard Citus migration", "Go at Razorpay", "Razorpay, Flipkart"],
  "sneha-kulkarni": ["Online partitioning at CRED", "Go at CRED and PhonePe", "CRED, PhonePe"],
  "arjun-reddy": ["Jira Cloud Postgres, 3 regions", "Go failover tooling", "Atlassian"],
};

export const EVIDENCE_SRE: Readonly<Record<string, readonly string[]>> = {
  "priya-nair": ["On-call for order tracking", "Runs the fleet on Kubernetes", "22-node Postgres fleet"],
  "anika-bose": ["No pager history found", "No Kubernetes in any role", "60 TB archive on Postgres"],
  "arjun-reddy": ["DBRE on-call, 3 regions", "Patroni on Kubernetes", "Jira Cloud Postgres"],
};

/* ── campaign analytics ──────────────────────────────────────────────────── */

export type ChannelStat = { channel: ChannelId; sent: number; replied: number; medianHours: number };

/** Outreach by channel, per campaign. Totals agree with each funnel's contacted/replied. */
export const CHANNEL_STATS: Readonly<Record<CampaignKey, readonly ChannelStat[]>> = {
  "backend-snr": [
    { channel: "whatsapp", sent: 17, replied: 6, medianHours: 3 },
    { channel: "gmail", sent: 13, replied: 3, medianHours: 19 },
    { channel: "linkedin", sent: 3, replied: 1, medianHours: 41 },
  ],
  "platform-sre": [
    { channel: "whatsapp", sent: 8, replied: 3, medianHours: 4 },
    { channel: "gmail", sent: 10, replied: 2, medianHours: 22 },
    { channel: "linkedin", sent: 1, replied: 0, medianHours: 0 },
  ],
  "ios-mid": [
    { channel: "whatsapp", sent: 3, replied: 1, medianHours: 5 },
    { channel: "gmail", sent: 5, replied: 1, medianHours: 26 },
    { channel: "linkedin", sent: 1, replied: 0, medianHours: 0 },
  ],
};

/* ── agent activity, for the overview's detail pane ─────────────────────── */

export type Activity = { at: string; what: string; tone?: "good" | "bad" | "ask" };

export const ACTIVITY: Readonly<Record<string, readonly Activity[]>> = {
  f1: [
    { at: "12 min ago", what: "Ranked 61 profiles against the brief" },
    { at: "40 min ago", what: "Shortlisted 3 more: Rohan, Priya, Sneha", tone: "good" },
    { at: "2 h ago", what: "Widened location to include remote India" },
    { at: "Yesterday", what: "Sourced 12 new profiles overnight", tone: "good" },
  ],
  f2: [
    { at: "12 min ago", what: "Four drafts written and waiting for your approval", tone: "ask" },
    { at: "1 h ago", what: "Priya replied on WhatsApp", tone: "good" },
    { at: "3 h ago", what: "Sent 6 follow-ups by email" },
    { at: "Yesterday", what: "Vikram's email bounced; moved him to LinkedIn", tone: "bad" },
  ],
  f3: [
    { at: "41 min ago", what: "Stopped: the mailbox hit its daily sending limit", tone: "bad" },
    { at: "1 h ago", what: "Sent 6 of 19 messages" },
    { at: "2 h ago", what: "Arjun replied on WhatsApp", tone: "good" },
  ],
  f4: [
    { at: "41 min ago", what: "Waiting for outreach to finish before screening" },
    { at: "Yesterday", what: "Read the SRE scorecard" },
  ],
  f5: [
    { at: "9 min ago", what: "Stopped: the brief has no location or seniority", tone: "bad" },
    { at: "20 min ago", what: "Tried two searches; both matched too broadly" },
  ],
  f6: [
    { at: "1 h ago", what: "Summarised 5 screening calls", tone: "good" },
    { at: "2 h ago", what: "Advanced 2 candidates to the hiring manager", tone: "good" },
  ],
};

/** When each step of each agent finished, for the vertical step timeline. */
export const STEP_TIMES: Readonly<Record<string, readonly string[]>> = {
  f1: ["Mon 09:10", "Mon 09:40"],
  f2: ["Tue 11:02"],
  f3: ["Wed 10:15", "Wed 10:40"],
  f4: [],
  f5: ["Today 01:55"],
  f6: ["Thu 14:00", "Thu 16:20", "Thu 17:05"],
};

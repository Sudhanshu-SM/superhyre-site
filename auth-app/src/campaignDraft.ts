import type { CampaignRow, CampaignSetup, Channel, Employment, Priority, Visibility, WorkMode } from "./campaignsData";
import type { Client } from "./clients";
import { primaryContact } from "./clients";
import { normaliseTeam } from "./roleStore";

/**
 * The New campaign form as data: its fields, defaults, the rules that decide
 * whether it can be saved or started, and the row it becomes.
 *
 * Pure, so the rules are tested without a browser. The form (NewCampaign.tsx)
 * and the agent's guided moment both build a draft and call `rowFromDraft`,
 * so a campaign made either way has the same shape.
 */

export const SENIORITIES = ["Intern", "Junior", "Mid", "Senior", "Staff", "Principal", "Lead", "Director"] as const;
export const EMPLOYMENT_LABEL: Readonly<Record<Employment, string>> = { "full-time": "Full-time", contract: "Contract", intern: "Internship" };
export const WORK_MODE_LABEL: Readonly<Record<WorkMode, string>> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };
export const CHANNEL_LABEL: Readonly<Record<Channel, string>> = { email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn" };
export const PRIORITY_LABEL: Readonly<Record<Priority, string>> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const VISIBILITY_LABEL: Readonly<Record<Visibility, string>> = { team: "Its team and admins", org: "Everyone in the organisation" };
/** The one line under that choice, in both forms: who sees it is one thing, who changes it another. */
export const VISIBILITY_HELP = "Its team is the people on it and the team it belongs to. A shared campaign is seen by everyone here, but only its team changes it.";
export const NOTICE_OPTIONS = ["Any", "Immediate", "Up to 30 days", "Up to 60 days", "Up to 90 days"] as const;
export const AGENTS = ["Sourcing", "Outreach", "Screening"] as const;
export type AgentName = (typeof AGENTS)[number];

export type CampaignDraft = {
  name: string;
  clientId: string;
  /** A company that is not a client yet, named instead of picking one: the server adds it with the campaign. Empty when `clientId` is set. */
  newClient: string;
  department: string;
  hiringManager: string;
  seniority: string;
  employment: Employment;
  workMode: WorkMode;
  officeDays: number;
  locations: string[];
  openings: number;
  targetDate: string;
  dateKind: "start" | "close";
  currency: string;
  /** Lakhs per annum, as typed. */
  compMin: string;
  compMax: string;
  variable: string;
  compShown: boolean;
  expMin: string;
  expMax: string;
  mustHave: string[];
  niceToHave: string[];
  education: string;
  notice: string;
  dealbreakers: string;
  jd: string;
  intake: string;
  owner: string;
  recruiters: string[];
  agents: AgentName[];
  channels: Channel[];
  screening: string;
  priority: Priority;
  visibility: Visibility;
  fee: string;
};

export function blankDraft(owner: string): CampaignDraft {
  return {
    name: "", clientId: "", newClient: "", department: "Engineering", hiringManager: "",
    seniority: "Senior", employment: "full-time", workMode: "hybrid", officeDays: 3, locations: [], openings: 1,
    targetDate: "", dateKind: "start",
    currency: "INR", compMin: "", compMax: "", variable: "", compShown: false,
    expMin: "", expMax: "", mustHave: [], niceToHave: [], education: "", notice: "Up to 60 days", dealbreakers: "",
    jd: "", intake: "",
    owner, recruiters: [], agents: ["Sourcing", "Outreach"], channels: ["email", "whatsapp", "linkedin"],
    screening: "generate", priority: "normal", visibility: "team", fee: "",
  };
}

/**
 * A recruiter's campaign is theirs alone: they own it and nobody else is on it (an admin decides who owns a
 * campaign and adds teammates later). Whatever the draft said about its owner or team, for instance a draft kept
 * from a workspace where the person was an admin, is put back.
 */
export function ownCampaign(d: CampaignDraft, me: string): CampaignDraft {
  return { ...d, owner: me, recruiters: [] };
}

/**
 * Picking a client fills what the client already says: its primary contact
 * as the hiring manager, its fee terms, and its city when no location has
 * been typed. Fields the admin already filled are left alone, except the
 * hiring manager and fee, which belong to the client that was picked.
 */
export function prefillFromClient(d: CampaignDraft, c: Client | undefined): CampaignDraft {
  if (!c) return { ...d, clientId: "", newClient: "", hiringManager: "", fee: "" };
  const p = primaryContact(c);
  return {
    ...d,
    clientId: c.id,
    newClient: "",
    hiringManager: p?.name ?? "",
    fee: c.fee && c.fee !== "To be agreed" ? c.fee : d.fee,
    locations: d.locations.length ? d.locations : c.location ? [c.location] : d.locations,
  };
}

/**
 * A company named instead of a client picked: the campaign is for it, and the server adds it (or uses the client of that
 * name) when the campaign is made. What the last client owned (its hiring manager and fee terms) goes with it.
 */
export function withNewClient(d: CampaignDraft, name: string): CampaignDraft {
  return { ...d, clientId: "", newClient: name.trim(), hiringManager: "", fee: "" };
}

/** What the draft says when no client has been picked or named: the server's own sentence for it. */
export const CLIENT_NEEDED = "Pick the client this campaign is for, or add one.";

/* ── cities, said many ways ── */

/** Each city's display name, then the other ways people say it. Matched whole, ignoring case, dots and spacing. */
const CITY_SPELLINGS: ReadonlyArray<readonly [string, ...string[]]> = [
  ["Bengaluru", "bangalore", "bengalooru", "banglore", "blr", "bengaluru urban"],
  ["Mumbai", "bombay"],
  ["Gurugram", "gurgaon"],
  ["Chennai", "madras"],
  ["Kolkata", "calcutta"],
  ["Pune", "poona"],
  ["Delhi NCR", "delhi", "new delhi", "ncr", "delhi/ncr", "national capital region"],
  ["Hyderabad", "hyd"],
  ["Noida"],
  ["Kochi", "cochin"],
  ["Thiruvananthapuram", "trivandrum"],
  ["Mysuru", "mysore"],
  ["Visakhapatnam", "vizag", "vishakhapatnam"],
  ["Vadodara", "baroda"],
  ["Ahmedabad"], ["Jaipur"], ["Coimbatore"], ["Indore"], ["Chandigarh"], ["Lucknow"], ["Nagpur"], ["Bhubaneswar"], ["Surat"], ["Bhopal"], ["Patna"],
];

const cityKey = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/[\s\-/_]+/g, " ").trim();
const CITY_OF = new Map<string, string>();
for (const [name, ...others] of CITY_SPELLINGS) for (const s of [name, ...others]) CITY_OF.set(cityKey(s), name);

/** Every spelling of a city the console knows, lower case: what "in <place>" is checked against. */
export const KNOWN_CITY_SPELLINGS: readonly string[] = [...CITY_OF.keys()];

/** The console's name for a city said in any of its spellings ("Blr" is "Bengaluru"), or null when it is not one it knows. */
export function knownCity(text: string): string | null {
  return CITY_OF.get(cityKey(text)) ?? null;
}

/**
 * A city as the console shows it: a known one under its one name, any other as it was typed (a word typed in
 * lower case gets its capitals). "" for nothing.
 */
export function canonicalCity(text: string | null | undefined): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return knownCity(t) ?? (t === t.toLowerCase() ? t.replace(/\b([a-z])/g, (c) => c.toUpperCase()) : t);
}

/* ── how many hires ── */

const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20,
};
export const COUNT_WORD_PATTERN = `\\d{1,2}|${Object.keys(COUNT_WORDS).join("|")}`;
export const MOST_OPENINGS = 99;
/** The most of a job description the server keeps on a campaign. */
export const JD_MAX_CHARS = 30_000;

/** "3", "three" or "3 hires" as a number of hires, 1 to 99; null for anything else. */
export function parseOpenings(text: string): number | null {
  const m = /^\s*(\d{1,3}|[a-z]+)\s*(?:hires?|people|openings?|positions?)?\s*$/i.exec(text);
  const w = m?.[1]?.toLowerCase();
  if (!w) return null;
  const n = /^\d+$/.test(w) ? Number(w) : COUNT_WORDS[w];
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= MOST_OPENINGS ? n : null;
}

/** A number typed in a field, or null when it is empty or not a number. */
export function num(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Adds a tag once, trimmed, case-insensitively. */
export function addTag(list: readonly string[], raw: string): string[] {
  const parts = raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const out = [...list];
  for (const p of parts) if (!out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  return out;
}

export type DraftProblems = Partial<Record<keyof CampaignDraft, string>>;

/**
 * What stops the campaign being created. A campaign is on from the moment it exists, so there is
 * one set of rules: a name, the client it is for, and whatever was typed has to make sense.
 *
 * `agents: false` where agents and channels aren't offered (real data: nothing starts them
 * yet), so a rule about a field the person can't see never blocks them.
 */
export function draftProblems(
  d: CampaignDraft,
  today = new Date(),
  opts: { agents?: boolean } = {},
): DraftProblems {
  const out: DraftProblems = {};
  if (d.name.trim().length < 2) out.name = "Name the role you're hiring for.";
  /* A campaign is always for a client: one picked, or a company named to be added with it. */
  if (!d.clientId && !d.newClient.trim()) out.clientId = CLIENT_NEEDED;
  if (!Number.isInteger(d.openings) || d.openings < 1) out.openings = "At least one opening.";
  if (d.workMode === "hybrid" && (d.officeDays < 1 || d.officeDays > 5)) out.officeDays = "Between 1 and 5 days.";

  const lo = num(d.compMin), hi = num(d.compMax);
  if (d.compMin.trim() && (lo === null || lo <= 0)) out.compMin = "Use a number in LPA, e.g. 30.";
  if (d.compMax.trim() && (hi === null || hi <= 0)) out.compMax = "Use a number in LPA, e.g. 45.";
  if (lo !== null && hi !== null && lo > hi) out.compMax = "The top of the range is below the bottom.";

  const e0 = num(d.expMin), e1 = num(d.expMax);
  if (d.expMin.trim() && (e0 === null || e0 < 0 || e0 > 40)) out.expMin = "Years, between 0 and 40.";
  if (d.expMax.trim() && (e1 === null || e1 < 0 || e1 > 40)) out.expMax = "Years, between 0 and 40.";
  if (e0 !== null && e1 !== null && e0 > e1) out.expMax = "The most is below the least.";

  if (d.targetDate) {
    const t = new Date(`${d.targetDate}T23:59:59`);
    if (Number.isNaN(t.getTime())) out.targetDate = "That isn't a date.";
    else if (t < today) out.targetDate = "Pick a date from today on.";
  }

  if (opts.agents !== false) {
    if (!d.agents.length) out.agents = "Pick at least one agent.";
    if (d.agents.includes("Outreach") && !d.channels.length) out.channels = "Outreach needs at least one channel.";
  }
  return out;
}

const lakhs = (n: number) => `${n % 1 ? n.toFixed(1) : n}`;

/** "₹30–45 LPA", "From ₹30 LPA", or "" when nothing was given. */
export function compLabel(comp: CampaignSetup["comp"]): string {
  if (!comp || (comp.min == null && comp.max == null)) return "";
  const sym = comp.currency === "INR" ? "₹" : `${comp.currency} `;
  if (comp.min != null && comp.max != null) return `${sym}${lakhs(comp.min)}–${lakhs(comp.max)} LPA`;
  return comp.min != null ? `From ${sym}${lakhs(comp.min)} LPA` : `Up to ${sym}${lakhs(comp.max!)} LPA`;
}

/** The form as a campaign row: active, with the agents it asked for. */
export function rowFromDraft(d: CampaignDraft, members: readonly string[], now = Date.now()): CampaignRow {
  const name = d.name.trim();
  const id = `c-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${now.toString(36)}`;
  // A hybrid or office draft without a place yet stays without one; it is not remote.
  const location = d.workMode === "remote" ? (d.locations.length ? `Remote, ${d.locations[0]}` : "Remote") : d.locations[0] ?? "";
  const lo = num(d.compMin), hi = num(d.compMax), e0 = num(d.expMin), e1 = num(d.expMax);
  const setup: CampaignSetup = {
    clientId: d.clientId || undefined,
    newClient: !d.clientId && d.newClient.trim() ? d.newClient.trim() : undefined,
    hiringManager: d.hiringManager || undefined,
    seniority: d.seniority || undefined,
    employment: d.employment,
    workMode: d.workMode,
    officeDays: d.workMode === "hybrid" ? d.officeDays : undefined,
    locations: d.locations,
    targetDate: d.targetDate || undefined,
    dateKind: d.targetDate ? d.dateKind : undefined,
    comp: lo !== null || hi !== null || d.variable.trim()
      ? { currency: d.currency, min: lo ?? undefined, max: hi ?? undefined, variable: d.variable.trim() || undefined, shown: d.compShown }
      : undefined,
    expMin: e0 ?? undefined,
    expMax: e1 ?? undefined,
    mustHave: d.mustHave,
    niceToHave: d.niceToHave,
    education: d.education.trim() || undefined,
    notice: d.notice || undefined,
    dealbreakers: d.dealbreakers.trim() || undefined,
    jd: d.jd.trim() || undefined,
    intake: d.intake.trim() || undefined,
    channels: d.channels,
    screening: d.screening,
    priority: d.priority,
    visibility: d.visibility,
    fee: d.fee.trim() || undefined,
  };
  return {
    id, name,
    department: d.department,
    location,
    status: "active",
    owner: d.owner,
    team: normaliseTeam(d.owner, d.recruiters, members),
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: Array.from({ length: 14 }, () => 0),
    target: d.openings,
    agents: [...d.agents],
    updatedAgo: "Just now",
    createdAgo: "Just now",
    setup,
  };
}

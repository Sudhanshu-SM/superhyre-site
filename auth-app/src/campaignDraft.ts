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
export const VISIBILITY_LABEL: Readonly<Record<Visibility, string>> = { team: "Assigned team only", org: "Everyone in the organisation" };
export const NOTICE_OPTIONS = ["Any", "Immediate", "Up to 30 days", "Up to 60 days", "Up to 90 days"] as const;
export const AGENTS = ["Sourcing", "Outreach", "Screening"] as const;
export type AgentName = (typeof AGENTS)[number];

export type CampaignDraft = {
  name: string;
  clientId: string;
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
    name: "", clientId: "", department: "Engineering", hiringManager: "",
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
 * Picking a client fills what the client already says: its primary contact
 * as the hiring manager, its fee terms, and its city when no location has
 * been typed. Fields the admin already filled are left alone, except the
 * hiring manager and fee, which belong to the client that was picked.
 */
export function prefillFromClient(d: CampaignDraft, c: Client | undefined): CampaignDraft {
  if (!c) return { ...d, clientId: "", hiringManager: "", fee: "" };
  const p = primaryContact(c);
  return {
    ...d,
    clientId: c.id,
    hiringManager: p?.name ?? "",
    fee: c.fee && c.fee !== "To be agreed" ? c.fee : d.fee,
    locations: d.locations.length ? d.locations : c.location ? [c.location] : d.locations,
  };
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
 * one set of rules: a name, and whatever was typed has to make sense.
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

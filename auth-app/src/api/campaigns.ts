import type { PipelinePerson, Source, StageId, Step } from "../campaign";
import type { CampaignRates, CampaignReached, CampaignRow, CampaignSetup, CampaignStatus, Priority, Visibility } from "../campaignsData";
import { agoLabel } from "../clients";
import type { Hue } from "../orchestrator";
import { api } from "./client";

/**
 * Campaigns, the pipeline board and the campaign overview, as the API serves
 * them (server: modules/campaigns, modules/pipeline), and the adapters that
 * turn them into the console's own shapes. Stores call these; components never
 * do.
 */

/* ── what the API returns ── */

export type ApiPerson = { id: string; name: string | null };
export type ApiStage = "shortlisted" | "outreach" | "interviewing" | "hired" | "passed";

export type ApiSetup = Omit<CampaignSetup, "clientId" | "priority" | "visibility">;

export type ApiCampaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  department: string | null;
  location: string | null;
  priority: Priority;
  visibility: Visibility;
  client: { id: string; name: string | null } | null;
  owner: ApiPerson | null;
  team: (ApiPerson & { role: "owner" | "member" })[];
  funnel: Record<ApiStage, number>;
  /** How far people got, and the step-to-step rates: one definition for every page (absent from older servers). */
  reached?: CampaignReached;
  rates?: CampaignRates;
  hired: number;
  target: number;
  agents: number;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only on a single campaign (GET /campaigns/:id and every write). */
  setup?: ApiSetup;
  /** Only on the list: the figures a row shows without loading the campaign's overview. */
  summary?: { found: number; foundThisWeek: number; sourcedPerDay: number[]; replied: number; openTasks: number };
};

export type ApiBoardRow = {
  campaignCandidateId: string;
  candidateId: string;
  personId: string;
  fullName: string;
  currentTitle: string | null;
  currentCompanyName: string | null;
  city: string | null;
  linkedinUrl: string | null;
  stage: ApiStage;
  step: Step;
  ownerId: string | null;
  source: "agent" | "extension" | "manual" | "form" | "referral" | "import";
  fit: 1 | 2 | 3 | null;
  tier: "A" | "B" | "C" | null;
  /** When they joined this campaign. */
  addedAt: string;
  yearsOfExperience: number | null;
  /** Up to six, most recently seen first. */
  skills: string[];
  daysInStage: number;
  /** Absent from older servers; then `daysInStage` (whole 24-hour periods) is used. */
  stageEnteredAt?: string;
  lastActivityAt: string;
  hasEmail: boolean;
  hasPhone: boolean;
  /** A reply was logged at some point, whatever stage they are at now. */
  replied?: boolean;
  /** On the do-not-contact list: nothing is drafted, approved or scheduled for them. Absent from older servers. */
  doNotContact?: boolean;
  /** Why they were passed, in the words given then. */
  passReason?: string | null;
};

export type ApiActivity = {
  id: string;
  subjectKind: string;
  subjectId: string;
  subjectName: string | null;
  verb: string;
  actorKind: "user" | "agent" | "system";
  actorId: string | null;
  actorName: string | null;
  data: Record<string, unknown>;
  at: string;
};

type WeekPair = { thisWeek: number; lastWeek: number };

export type ApiOverview = {
  campaign: { id: string; name: string; status: CampaignStatus };
  found: WeekPair & { total: number };
  kept: WeekPair & { total: number };
  funnel: { stage: "found" | "shortlisted" | "outreach" | "replied" | "interviewing" | "hired"; count: number; pct: number | null }[];
  repliedPct: number | null;
  hired: number;
  target: number;
  sourcedPerDay: { day: string; count: number }[];
  needsYou: { kind: string; title: string; count: number; dueAt: string | null }[];
  yourWork: { moved: WeekPair; reachedOut: WeekPair; repliesLogged: WeekPair; hires: WeekPair } | null;
  hires: { hired: { campaignCandidateId: string; candidateId: string; fullName: string; hiredAt: string }[]; offersOut: number; interviewing: number; toReview: number } | null;
  activity: ApiActivity[];
};

/** `email` is null for a recruiter looking at a teammate: addresses are an owner's and admin's to see. */
export type ApiMember = { userId: string; email: string | null; fullName: string | null; role: string; status: string };

/* ── calls ── */

export const listCampaigns = () => api<{ campaigns: ApiCampaign[] }>("GET", "/v1/campaigns").then((r) => r.campaigns);
export const getCampaign = (id: string) => api<ApiCampaign>("GET", `/v1/campaigns/${id}`);
export const campaignOverview = (id: string) => api<ApiOverview>("GET", `/v1/campaigns/${id}/overview`);
export const listMembers = () => api<{ members: ApiMember[] }>("GET", "/v1/members").then((r) => r.members);
export const whoAmI = () => api<{ user: { id: string } }>("GET", "/v1/me").then((r) => r.user.id);

export type CreateCampaignBody = {
  name: string;
  clientId: string | null;
  department: string | null;
  location: string | null;
  target: number;
  priority: Priority;
  visibility: Visibility;
  setup: ApiSetup;
  memberIds: string[];
  ownerId?: string;
};

export const createCampaign = (body: CreateCampaignBody) => api<ApiCampaign>("POST", "/v1/campaigns", body);
export const patchCampaign = (id: string, body: { clientId: string | null }) => api<ApiCampaign>("PATCH", `/v1/campaigns/${id}`, body);
export const setCampaignStatus = (id: string, status: CampaignStatus) =>
  api<ApiCampaign>("PUT", `/v1/campaigns/${id}/status`, { status });

/**
 * What the campaign's agents are doing, from the rows their work writes (server:
 * `GET /v1/campaigns/:id/agents`): the search under way, the keep-sourcing watch, the messages
 * waiting for a yes or on their way.
 */
export type ApiCampaignAgents = {
  status: CampaignStatus;
  approvedSpec: boolean;
  sourcing: {
    state: "working" | "watching" | "paused" | "idle";
    run: { id: string; found: number | null; scored: number } | null;
    /** `paused`/`reason`: the same watch, not looking, and why in the server's words ("Paused by you."). Older servers send neither. */
    watch: {
      id: string; summary: string; stop: { profiles?: number; until?: string }; found: number; nextRunAt: string | null;
      paused?: boolean; reason?: string | null;
    } | null;
    lastRunAt: string | null;
  };
  outreach: { state: "waiting" | "sending" | "idle"; waiting: number; sending: number };
};
export const campaignAgents = (id: string) => api<ApiCampaignAgents>("GET", `/v1/campaigns/${id}/agents`);
export const setCampaignMembers = (id: string, userIds: string[]) => api<ApiCampaign>("PUT", `/v1/campaigns/${id}/members`, { userIds });
export const duplicateCampaign = (id: string) => api<ApiCampaign>("POST", `/v1/campaigns/${id}/duplicate`);

export const boardRows = (id: string) =>
  api<{ candidates: ApiBoardRow[] }>("GET", `/v1/campaigns/${id}/candidates`).then((r) => r.candidates);
/** `step`: where within the stage, which is how someone is put at Replied (outreach, at the replied step). */
export const moveCandidate = (id: string, ccId: string, stage: StageId, reason?: string, step?: Step) =>
  api<ApiBoardRow>("PATCH", `/v1/campaigns/${id}/candidates/${ccId}`, {
    stage, ...(step !== undefined ? { step } : {}), ...(reason ? { reason } : {}),
  });
/** Marks where someone is within their stage; "offer" means an offer is out. */
export const setStep = (id: string, ccId: string, step: "loop" | "offer") =>
  api<ApiBoardRow>("PATCH", `/v1/campaigns/${id}/candidates/${ccId}`, { step });
export const bulkMove = (id: string, ccIds: string[], stage: StageId, reason?: string, step?: Step) =>
  api<{ moved: number; unchanged: number }>("POST", `/v1/campaigns/${id}/candidates/bulk-move`, {
    campaignCandidateIds: ccIds, stage, ...(step !== undefined ? { step } : {}), ...(reason ? { reason } : {}),
  });
/** Takes people off the board while they stay in Candidates; only those still at the shortlist stage go. */
export const unshortlist = (id: string, ccIds: string[]) =>
  api<{ removed: number }>("POST", `/v1/campaigns/${id}/candidates/unshortlist`, { campaignCandidateIds: ccIds });
/** One page of a campaign's log, newest first; `nextBefore` fetches the page after it. */
export const campaignActivityPage = (id: string, before?: string | null, limit = 100) =>
  api<{ items: ApiActivity[]; nextBefore: string | null }>(
    "GET",
    `/v1/campaigns/${id}/activity?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
  );

export const campaignActivity = (id: string, limit = 100) => campaignActivityPage(id, null, limit).then((r) => r.items);

/* ── adapters ── */

const minutesSince = (iso: string | null, now: number) =>
  iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60000)) : Number.MAX_SAFE_INTEGER;

/** "12m ago" from an ISO time, in the console's own wording. */
export const agoFrom = (iso: string, now = Date.now()) => agoLabel(minutesSince(iso, now));

const nameOf = (p: ApiPerson | null) => p?.name ?? "Unassigned";

/**
 * A campaign as the console's row. The list carries each stage's headcount and
 * a summary (found, the fortnight's sourcing, replies, open tasks); a loaded
 * overview adds what needs a person by name. A row from a single-campaign read
 * has neither until the list or the overview arrives, and says so with `loading`.
 */
export function rowFromApi(c: ApiCampaign, ov?: ApiOverview, now = Date.now()): CampaignRow {
  const owner = nameOf(c.owner);
  const team = c.team.map(nameOf);
  const need = ov?.needsYou[0];
  const sum = c.summary;
  const open = sum?.openTasks ?? 0;
  return {
    id: c.id,
    name: c.name,
    department: c.department ?? "",
    location: c.location ?? "",
    status: c.status,
    owner,
    team: team.includes(owner) ? team : [owner, ...team],
    ownerId: c.owner?.id ?? null,
    teamIds: c.team.map((p) => p.id),
    visibility: c.visibility,
    funnel: {
      sourced: ov?.found.total ?? sum?.found ?? 0,
      shortlisted: c.funnel.shortlisted,
      contacted: c.funnel.outreach + c.funnel.interviewing,
      replied: ov ? reachOf(ov).replied : (sum?.replied ?? 0),
      interviews: c.funnel.interviewing,
      hired: c.funnel.hired,
    },
    trend: ov ? ov.sourcedPerDay.map((d) => d.count) : (sum?.sourcedPerDay ?? []),
    ...(c.reached ? { reached: c.reached } : {}),
    ...(c.rates ? { rates: c.rates } : {}),
    target: c.target,
    agents: Array.from({ length: c.agents }, () => "Agent"),
    ...(need
      ? { needs: need.count > 1 ? `${need.title} (${need.count})` : need.title }
      : open
        ? { needs: `${open} open ${open === 1 ? "task" : "tasks"}` }
        : {}),
    updatedAgo: agoFrom(c.updatedAt, now),
    updatedAt: c.updatedAt,
    createdAgo: agoFrom(c.createdAt, now),
    ...(c.setup ? { setup: { ...c.setup, ...(c.client ? { clientId: c.client.id } : {}), priority: c.priority, visibility: c.visibility } } : {}),
    ...(ov || sum ? {} : { loading: true as const }),
  };
}

/** The create form's row as the API's create body. Names become member ids. */
export function createBodyFrom(row: CampaignRow, idOf: (name: string) => string | undefined): CreateCampaignBody {
  const { clientId, priority, visibility, ...setup } = row.setup ?? {};
  const ownerId = idOf(row.owner);
  const memberIds = row.team.filter((n) => n !== row.owner).map(idOf).filter((x): x is string => !!x);
  return {
    name: row.name,
    clientId: clientId ?? null,
    department: row.department || null,
    location: row.location || null,
    target: row.target,
    priority: priority ?? "normal",
    visibility: visibility ?? "team",
    setup: { ...setup, ...(setup.locations ? { locations: [...setup.locations] } : {}) },
    memberIds,
    ...(ownerId ? { ownerId } : {}),
  };
}

const SOURCE: Readonly<Record<ApiBoardRow["source"], Source>> = {
  agent: "Agent search", extension: "Extension", referral: "Referral", manual: "Added by hand", form: "Form", import: "Import",
};

/* What the card says about where they are. The board doesn't say whether a message
   went out, so being in outreach reads as that, never as "sent". */
const LAST: Readonly<Record<string, string>> = {
  shortlisted: "Shortlisted", waiting: "In outreach", replied: "Replied", loop: "Interviewing",
  offer: "Offer made", hired: "Hired", passed: "Passed",
};

const HUE_KEYS: readonly Hue[] = ["brand", "amber", "sage", "teal", "blue", "violet", "rose"];
const hueOf = (s: string): Hue => HUE_KEYS[[...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % HUE_KEYS.length] ?? "brand";

const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
/** Whole local days since a time, so "Yesterday" means the calendar day before today. */
export const calendarDaysSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.round((midnight(now) - midnight(Date.parse(iso))) / 86_400_000));

/**
 * A board row as a pipeline person. `id` is the campaign candidate, which is
 * what a move is addressed to. What the board does not carry (the profile,
 * unknown years) is left empty rather than guessed.
 */
export function personFromBoard(r: ApiBoardRow, campaignId: string, ownerName: (id: string | null) => string, now = Date.now()): PipelinePerson {
  return {
    id: r.campaignCandidateId,
    candidateId: r.candidateId,
    name: r.fullName,
    hue: hueOf(r.personId),
    title: r.currentTitle ?? "",
    company: r.currentCompanyName ?? "",
    location: r.city ?? "",
    /* Required by Contact; the pipeline never shows it. */
    seniority: "Mid",
    years: r.yearsOfExperience ?? 0,
    industry: "",
    skills: r.skills,
    linkedin: (r.linkedinUrl ?? "").replace(/^https?:\/\//, ""),
    campaign: campaignId,
    capturedBy: ownerName(r.ownerId),
    capturedAgo: calendarDaysSince(r.addedAt, now),
    profile: "basic",
    openToWork: false,
    jobs: [],
    stage: r.stage,
    step: r.step,
    ownerId: r.ownerId,
    inStage: r.stageEnteredAt ? calendarDaysSince(r.stageEnteredAt, now) : r.daysInStage,
    owner: ownerName(r.ownerId),
    source: SOURCE[r.source],
    last: LAST[r.step ?? r.stage] ?? "",
    fit: r.fit,
    reach: { email: r.hasEmail, phone: r.hasPhone },
    ...(r.replied === undefined ? {} : { replied: r.replied }),
    ...(r.doNotContact ? { doNotContact: true } : {}),
    ...(r.stage === "passed" && r.passReason ? { passReason: r.passReason } : {}),
  };
}

/** How far people got, as the Overview's funnel counts it: reaching a stage counts everyone who got that far or further. */
export function reachOf(ov: ApiOverview) {
  const n = (s: ApiOverview["funnel"][number]["stage"]) => ov.funnel.find((f) => f.stage === s)?.count ?? 0;
  return {
    found: n("found"), shortlisted: n("shortlisted"), outreach: n("outreach"), replied: n("replied"),
    interviewing: n("interviewing"), hired: n("hired"), target: Math.max(1, ov.target),
  };
}

const DEFAULT_STEP: Readonly<Record<StageId, Step>> = { shortlisted: null, outreach: "waiting", interviewing: "loop", hired: null, passed: null };

/**
 * The board after one person moved, as the store shows it before the API
 * answers: their stage and its first step, the clock reset, and at the front
 * so they land at the top of their new column.
 */
export function movedOnBoard(rows: readonly ApiBoardRow[], ccId: string, stage: StageId, step?: Step): ApiBoardRow[] {
  const hit = rows.find((r) => r.campaignCandidateId === ccId);
  if (!hit) return [...rows];
  /* Put at Replied from In outreach, the stage is the same: the clock of the stage keeps running. */
  const sameStage = hit.stage === stage;
  return [{
    ...hit, stage, step: step !== undefined ? step : DEFAULT_STEP[stage],
    ...(sameStage ? {} : { daysInStage: 0, stageEnteredAt: new Date().toISOString() }),
    ...(step === "replied" ? { replied: true } : {}),
  }, ...rows.filter((r) => r.campaignCandidateId !== ccId)];
}

/**
 * The board in the order each column shows it: whoever arrived in their stage last comes first, then by name.
 * The server sends it this way (`stage_entered_at desc`); this keeps it so for the guess before it answers and
 * for any list that arrives another way. Rows with no arrival time keep the order they came in, after the rest.
 */
export function orderBoard(rows: readonly ApiBoardRow[]): ApiBoardRow[] {
  const at = (r: ApiBoardRow) => (r.stageEnteredAt ? Date.parse(r.stageEnteredAt) || 0 : 0);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => at(b.r) - at(a.r) || (at(a.r) === 0 && at(b.r) === 0 ? a.i - b.i : a.r.fullName.localeCompare(b.r.fullName) || a.i - b.i))
    .map(({ r }) => r);
}

/** The list's per-stage headcounts after one person moved from one stage to another. */
export function shiftFunnel(c: ApiCampaign, from: StageId, to: StageId): ApiCampaign {
  /* Waiting and Replied are both In outreach: the headcounts do not move. */
  if (from === to) return c;
  const funnel = { ...c.funnel, [from]: Math.max(0, c.funnel[from] - 1), [to]: c.funnel[to] + 1 };
  return { ...c, funnel, hired: funnel.hired };
}

/** One line of a campaign's activity, in the words the Overview's log uses. */
export type LogLine = {
  id: string;
  /** Minutes ago. */
  at: number;
  who: "team" | "candidate" | "agent";
  kind: "move" | "hire" | "reply" | "agent" | "form" | "call";
  actor: string;
  verb: string;
  person?: { id: string; name: string };
  from?: string;
  to?: string;
  detail?: string;
};

const STAGE_NAME: Readonly<Record<string, string>> = {
  shortlisted: "Shortlisted", outreach: "In outreach", interviewing: "Interviewing", hired: "Hired", passed: "Passed",
};

const CAMPAIGN_VERB: Readonly<Record<string, string>> = {
  created: "created the campaign", activated: "started the campaign", resumed: "resumed the campaign",
  paused: "paused the campaign", closed: "closed the campaign", completed: "completed the campaign",
  reopened: "reopened the campaign", team_changed: "changed the team on the campaign",
  owner_changed: "changed who owns the campaign",
  updated: "edited the campaign", watch_started: "started keep-sourcing", watch_paused: "paused keep-sourcing",
  watch_resumed: "resumed keep-sourcing", watch_stopped: "stopped keep-sourcing", watch_changed: "changed keep-sourcing",
};

/** Outreach verbs on a candidate, as "<actor> <verb> <person>". */
const OUTREACH_VERB: Readonly<Record<string, string>> = {
  outreach_drafted: "drafted an email to", outreach_edited: "edited the email to",
  outreach_approved: "approved the email to", outreach_cancelled: "cancelled the email to",
};

/** What a logged outcome says, by the outcome the recruiter picked. */
const LOGGED_VERB: Readonly<Record<string, string>> = {
  replied: "logged a reply from", no_reply: "logged no reply from", bounced: "logged a bounced email to",
};

const FORM_VERB: Readonly<Record<string, string>> = {
  form_created: "created the form", form_published: "published the form", form_closed: "closed the form",
  form_deleted: "deleted the form", applicant_added: "added an applicant from", applicant_passed: "passed on an applicant from",
};

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

/**
 * An activity row as a log line, or null for the bookkeeping that is not
 * worth a line (field edits, notes on a form's draft). `personIdOf` maps a
 * candidate to the board's id, so a name in the log opens the same person.
 */
export function logLine(a: ApiActivity, me: string | null, personIdOf: (candidateId: string) => string | undefined, now = Date.now()): LogLine | null {
  const at = minutesSince(a.at, now);
  const actor = a.actorKind === "user" ? (a.actorId && a.actorId === me ? "You" : a.actorName ?? "Someone") : "Agent";
  const who: LogLine["who"] = a.actorKind === "user" ? "team" : "agent";
  const name = a.subjectName ?? "Someone";
  const pid = personIdOf(a.subjectId);
  const person = a.subjectKind === "candidate" ? { id: pid ?? a.subjectId, name } : undefined;
  const to = str(a.data.to);
  const from = str(a.data.from);
  const line = (rest: Omit<LogLine, "id" | "at">): LogLine => ({ id: a.id, at, ...rest });

  if (a.subjectKind === "candidate") {
    if (a.verb === "moved" && to) {
      return line({ who, kind: to === "hired" ? "hire" : "move", actor, verb: "moved", person, from: from ? STAGE_NAME[from] : undefined, to: STAGE_NAME[to] });
    }
    if (a.verb === "updated" && a.data.step === "replied") return line({ who: "candidate", kind: "reply", actor: name, verb: "replied" });
    if (a.verb === "updated" && a.data.step === "offer") return line({ who, kind: "move", actor, verb: "made an offer to", person });
    if (a.verb === "shortlisted") return line({ who, kind: who === "agent" ? "agent" : "move", actor, verb: "shortlisted", person, to: "Shortlisted" });
    if (a.verb === "removed") return line({ who, kind: "move", actor, verb: "removed", person, detail: "Taken off this campaign" });
    if (a.verb === "added") return line({ who, kind: "move", actor, verb: "added", person });
    if (a.verb === "outreach_sent") {
      return line({ who, kind: "move", actor, verb: a.data.followUp ? "followed up with" : "emailed", person });
    }
    if (a.verb === "outreach_failed") return line({ who, kind: "move", actor, verb: "couldn't send the email to", person });
    if (a.verb === "outreach_logged") {
      const outcome = str(a.data.outcome) ?? "replied";
      return line({ who, kind: outcome === "replied" ? "reply" : "move", actor, verb: LOGGED_VERB[outcome] ?? "logged an outcome for", person });
    }
    const outreach = OUTREACH_VERB[a.verb];
    if (outreach) return line({ who, kind: "move", actor, verb: outreach, person });
    return null;
  }
  if (a.subjectKind === "campaign") {
    if (a.verb === "spec_drafted" || a.verb === "spec_approved") {
      const v = num(a.data.version);
      return line({ who, kind: "agent", actor, verb: `${a.verb === "spec_drafted" ? "drafted" : "approved"} the role spec${v ? ` (version ${v})` : ""}` });
    }
    if (a.verb === "exported") {
      const rows = num(a.data.rowCount);
      const format = str(a.data.format);
      return line({ who, kind: "agent", actor, verb: `exported the ${a.data.kind === "pipeline" ? "pipeline" : "shortlist"}`, ...(rows !== undefined ? { detail: `${rows} ${rows === 1 ? "person" : "people"}${format ? `, ${format.toUpperCase()}` : ""}` } : {}) });
    }
    const verb = CAMPAIGN_VERB[a.verb];
    return verb ? line({ who, kind: "agent", actor, verb }) : null;
  }
  if (a.subjectKind === "form") {
    const formName = a.subjectName ?? str(a.data.name) ?? "a form";
    if (a.verb === "response_received") return line({ who: "candidate", kind: "form", actor: "Someone", verb: `applied through ${formName}` });
    const verb = FORM_VERB[a.verb];
    return verb ? line({ who, kind: "form", actor, verb: `${verb} ${formName}` }) : null;
  }
  if (a.subjectKind === "task") {
    const title = a.subjectName ?? str(a.data.title);
    const detail = title ? { detail: title } : {};
    if (a.verb === "completed") return line({ who, kind: "move", actor, verb: "finished a task", ...detail });
    if (a.verb === "created") return line({ who, kind: "move", actor, verb: "added a task", ...detail });
    if (a.verb === "dismissed") return line({ who, kind: "move", actor, verb: "dismissed a task", ...detail });
    return null;
  }
  return null;
}


import type { CardPerson, ChatCard, Match } from "./api/agent";
import { repeatWords, whenLabel } from "./schedulesView";

/**
 * What the chat's cards say, as words. Pure, so the same line reads the same in a card,
 * a search result and the profile sheet, and so it can be tested without a page.
 */

export const TIER_LABEL: Record<"A" | "B" | "C", string> = { A: "Strong fit", B: "Good fit", C: "Partial fit" };

const STAGE_LABEL: Record<string, string> = {
  shortlisted: "Shortlisted",
  outreach: "In outreach",
  /* Not a stage of its own: outreach at its replied step. Cards and menus say it as a status. */
  replied: "Replied",
  interviewing: "Interviewing",
  hired: "Hired",
  passed: "Rejected",
};

/** The status word for a person's stage and step: "Replied" for outreach at the replied step, else the stage's. */
export const statusLabel = (stage: string, step?: string | null): string =>
  stage === "outreach" && step === "replied" ? "Replied" : stageLabel(stage);
/** The stage key a control reads: "replied" for outreach at the replied step, else the stage. */
export const statusKey = (stage: string, step?: string | null): string =>
  stage === "outreach" && step === "replied" ? "replied" : stage;
/** The order a campaign's board reads in. */
export const STAGE_ORDER = ["shortlisted", "outreach", "interviewing", "hired", "passed"] as const;

export const stageLabel = (stage: string): string => STAGE_LABEL[stage] ?? stage.charAt(0).toUpperCase() + stage.slice(1);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Staff Engineer at Razorpay, Bengaluru", leaving out whatever isn't known. */
export type PersonField = "role" | "city" | "fit" | "stage";

/** The role and city of a person, or only what the person has asked to see ("no city": role alone). */
export function personLine(p: Pick<CardPerson, "title" | "company" | "city">, fields?: readonly PersonField[]): string {
  const role = fields && !fields.includes("role") ? "" : [p.title, p.company].filter(Boolean).join(" at ");
  const city = fields && !fields.includes("city") ? "" : p.city;
  return [role, city].filter(Boolean).join(", ");
}

/**
 * Whether the words already name each person and say all that would be said about them ("Give Dev Malhotra a task:
 * Review the shortlist, due Fri 23 Oct" says who it is for), so the card does not list them again under it.
 */
export function peopleSaidIn(people: ReadonlyArray<Pick<CardPerson, "name" | "title" | "company" | "city">>, said: string): boolean {
  const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const spoken = new Set(words(said));
  return people.length > 0 && people.every((p) => {
    const own = words(p.name);
    return own.length > 0 && [...own, ...words(personLine(p)).filter((w) => w !== "at")].every((w) => spoken.has(w));
  });
}

/** The muted line on the right of a person: how good a fit, or where they are on the board. */
export function personStatus(p: Pick<CardPerson, "tier" | "stage" | "daysInStage">, fields?: readonly PersonField[]): string | null {
  const fit = !fields || fields.includes("fit");
  const stage = !fields || fields.includes("stage");
  if (p.stage && stage) {
    const days = p.daysInStage;
    const where = days != null && days > 0 ? `${stageLabel(p.stage)} · ${plural(days, "day")}` : stageLabel(p.stage);
    /* How well they fit comes first, in words, wherever they are on the board. */
    return p.tier && fit ? `${TIER_LABEL[p.tier]} · ${where}` : where;
  }
  return p.tier && fit ? TIER_LABEL[p.tier] : null;
}

/** A sourced person from a search result, in the shape the cards use. */
export function personFromMatch(m: Match): CardPerson {
  return {
    personId: m.personId,
    candidateId: null,
    campaignCandidateId: null,
    name: m.fullName,
    title: m.currentTitle,
    company: m.currentCompanyName,
    city: m.city,
    years: m.yearsOfExperience,
    tier: m.tier,
    stage: null,
    daysInStage: null,
    strengths: m.judgement?.strengths ?? [],
    concerns: m.judgement?.concerns ?? [],
    linkedinUrl: m.linkedinUrl,
  };
}

/** Where people are, as a person says it after a number: "12 people on the shortlist", never "at shortlisted". */
const STAGE_PHRASE: Record<string, string> = {
  shortlisted: "on the shortlist",
  outreach: "in outreach",
  interviewing: "interviewing",
  hired: "hired",
  passed: "rejected",
  replied: "who replied",
};

/**
 * The line over a list of people. It counts the people actually shown, and says when that is
 * a part of a longer list, so the number on the card and the agent's words can't disagree.
 */
export function peopleHeading(card: Extract<ChatCard, { kind: "people" }>): string {
  const shown = card.people.length;
  const n = plural(shown, "person", "people");
  const part = card.total > shown ? ` of ${card.total}` : "";
  switch (card.source) {
    case "matches":
      return `${n}${part} worth a look`;
    case "pipeline":
      if (card.narrowedTo === "recommended") return shown === 1 ? "Who to interview next" : `${n} to interview next`;
      return card.narrowedTo
        ? `${n}${part} ${STAGE_PHRASE[card.narrowedTo] ?? `at ${stageLabel(card.narrowedTo).toLowerCase()}`}`
        : `${n}${part} on the board`;
    case "found":
      if (card.narrowedTo === "contact details") return "Contact details";
      return `${n} matching “${card.narrowedTo ?? ""}”`;
  }
}

/** Where the list came from, under its heading. */
export function peopleSubline(card: Extract<ChatCard, { kind: "people" }>): string {
  return [card.campaignName, card.source === "matches" ? card.narrowedTo : null].filter(Boolean).join(" · ");
}

/** A campaign's board as the counts in the order it reads; stages nobody is in are left out, except the first. */
export function funnel(stages: ReadonlyArray<{ stage: string; people: number }>): Array<{ stage: string; label: string; people: number }> {
  const by = new Map(stages.map((s) => [s.stage, s.people]));
  const known = STAGE_ORDER.map((stage) => ({ stage: stage as string, label: stageLabel(stage), people: by.get(stage) ?? 0 }));
  const extra = stages.filter((s) => !(STAGE_ORDER as readonly string[]).includes(s.stage)).map((s) => ({ stage: s.stage, label: stageLabel(s.stage), people: s.people }));
  return [...known, ...extra].filter((s, i) => i === 0 || s.people > 0 || s.stage === "hired");
}

/** What the campaign card says about the role spec and the search, in words a recruiter would use. */
export function specLine(card: Extract<ChatCard, { kind: "campaign" }>): string {
  if (card.spec) return `Role spec ${card.spec.version ? `v${card.spec.version} ` : ""}approved: ${card.spec.title}`;
  return card.draftWaiting ? "A role spec draft is waiting for your approval" : "No role spec yet, so nothing can be searched";
}

export function searchLine(s: NonNullable<Extract<ChatCard, { kind: "campaign" }>["sourcing"]>): string {
  const found = s.shown ? `${plural(s.shown, "person", "people")} found so far` : "Nobody found yet";
  if (s.exhausted) return `${found}. The search has no more people to show for now`;
  return `${found}. The next search looks for ${s.nextSize} more`;
}

export function campaignFacts(card: Extract<ChatCard, { kind: "campaign" }>): string {
  return [
    card.client,
    card.location,
    card.target ? `${plural(card.target, "hire")} wanted` : null,
    card.status !== "active" ? card.status : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The campaigns whose own charts (the `campaign` view) are in the same answer. The lookup card of such a campaign
 * leaves out its stage counts: the charts' funnel holds them, and a count is stated once.
 */
export function chartedCampaigns(cards: readonly ChatCard[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const c of cards) if (c.kind === "view" && c.view === "campaign" && c.campaignId) ids.add(c.campaignId);
  return ids;
}

/** Where a card's link goes: the campaign, or one of its pages. */
export const campaignHref = (campaignId: string, page: "" | "pipeline" | "shortlisted" | "forms" | "outreach" = ""): string =>
  `#/campaign${page ? `/${page}` : ""}?campaign=${campaignId}`;

export type School = { name: string; degree: string; years: string };

/** Education rows come from the shared profile in a few shapes; take what reads as a school. */
export function schoolsOf(raw: readonly unknown[]): School[] {
  const out: School[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = (...keys: string[]) => {
      for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number") return String(v);
      }
      return "";
    };
    const name = text("school", "institute", "institution", "name");
    if (!name) continue;
    const years = [text("startYear", "start_year", "start"), text("endYear", "end_year", "end")].filter(Boolean).map((y) => y.slice(0, 4));
    out.push({
      name,
      degree: [text("degree"), text("field", "fieldOfStudy", "field_of_study")].filter(Boolean).join(", "),
      years: years.join(" – "),
    });
  }
  return out;
}

/* ── approvals for Slack and Notion ──
   The agent proposes a message or a note and nothing is sent until the recruiter says yes,
   so the card has to show what would go out, not only a summary of it. */

export type OutsideAction = "slack_message" | "notion_note";

export const isOutsideAction = (action: string): action is OutsideAction =>
  action === "slack_message" || action === "notion_note";

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Slack channel ids look like C0123ABCD: a name is what a person can read. */
const SLACK_ID = /^[CGD][A-Z0-9]{8,}$/;

/** "#hiring", from a name, "#name" or {name}; nothing when all that is known is an id. */
export function channelName(channel: unknown): string | null {
  const raw = typeof channel === "string" ? channel : text((channel as { name?: unknown } | null | undefined)?.name);
  const name = raw.trim().replace(/^#/, "");
  return name && !SLACK_ID.test(name) ? `#${name}` : null;
}

/** The channel an approval will post to: the proposal carries the id it found and the name it goes by. */
const channelOf = (detail: Record<string, unknown>): string | null => channelName(detail.channelName) ?? channelName(detail.channel);

/** The card's heading, and which service's mark goes beside it. */
export function outsideHead(action: OutsideAction, detail: Record<string, unknown>): { label: string; service: "slack" | "notion" } {
  if (action === "notion_note") return { label: "Add a note in Notion", service: "notion" };
  const channel = channelOf(detail);
  return { label: channel ? `Post to ${channel}` : "Post to Slack", service: "slack" };
}

const PREVIEW_MAX = 1200;
const clip = (s: string) => (s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX).trimEnd()}…` : s);

/**
 * What would be posted or filed, as the recruiter will read it; null when the server sent none.
 * `where` is the page or database a note goes in, since a note's heading cannot say it.
 */
export function outsidePreview(
  action: OutsideAction,
  detail: Record<string, unknown>,
): { title: string | null; body: string; where: string | null } | null {
  if (action === "slack_message") {
    const body = text(detail.text);
    return body ? { title: null, body: clip(body), where: null } : null;
  }
  const title = text(detail.title);
  const body = text(detail.body);
  if (!title && !body) return null;
  const parent = text(detail.parentTitle);
  return { title: title || null, body: clip(body), where: parent ? `${parent}${detail.parentType === "database" ? " (database)" : ""}` : null };
}

/** What approving did, once it has: where it went, and a way to see it if the service said where. */
export function outsideOutcome(
  action: OutsideAction,
  detail: Record<string, unknown>,
  outcome: Record<string, unknown>,
): { text: string; link: { href: string; label: string } | null } {
  const raw = text(outcome.permalink) || text(outcome.url);
  const href = /^https:\/\//.test(raw) ? raw : null;
  if (action === "slack_message") {
    const channel = channelName(outcome.channel) ?? channelOf(detail);
    return { text: channel ? `Posted in ${channel}.` : "Posted in Slack.", link: href ? { href, label: "Open in Slack" } : null };
  }
  const title = text(detail.title);
  return { text: title ? `Saved “${title}” to Notion.` : "Added to Notion.", link: href ? { href, label: "Open in Notion" } : null };
}

/* ── approvals for what the agent wants to remember ──
   A note about a client or the whole agency isn't saved until the recruiter says yes, so the card
   shows the note itself and the words of theirs it rests on. */

export const isRememberAction = (action: string): action is "remember" => action === "remember";

/** "Remember for Acme Robotics", or "Remember for the whole agency". */
export function rememberHead(detail: Record<string, unknown>): string {
  if (detail.level === "org") return "Remember for the whole agency";
  const client = text(detail.clientName);
  return client ? `Remember for ${client}` : detail.level === "client" ? "Remember for this client" : "Remember this";
}

/** The note as it would be kept, the recruiter's own words it came from, and whether it replaces an older one. */
export function rememberPreview(detail: Record<string, unknown>): { note: string; said: string | null; replaces: boolean } | null {
  const note = text(detail.text);
  if (!note) return null;
  return { note: clip(note), said: text(detail.quote) || null, replaces: text(detail.replaces) !== "" };
}

/** What approving did: saved and in use, or saved and waiting for an admin to confirm it. */
export function rememberOutcome(outcome: Record<string, unknown>): string {
  if (outcome.remembered === false) return text(outcome.note) || "Not saved.";
  return outcome.status === "pending" ? "Saved. An admin needs to confirm it before it is used." : "Remembered.";
}

/* ── approvals for things that happen later ──
   One approval can schedule up to five things (an email, a post, a note, a task, a reminder, a
   digest). Nothing is stored until the recruiter says yes, so the card shows each one as it will
   happen: what, to whom or where, the exact words, and when, in the zone the times were worked out in. */

export const isScheduleAction = (action: string): action is "schedule" => action === "schedule";

export type ScheduleBlock = {
  /** The kind, for the icon. */
  kind: string;
  /** "Email to Asha Verma", "Post to #hiring on Slack". */
  what: string;
  /** The exact words that would go out. */
  quote: { title: string | null; body: string } | null;
  /** "Fri 17 Oct, 10:00 IST". */
  when: string;
  /** "every weekday until 31 Oct", or nothing for something that happens once. */
  repeat: string;
  /** A condition or extra the recruiter should see. */
  note: string | null;
  /** Where an email goes, shown quietly beside who it is to. */
  address?: string | null;
};

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** "#hiring" from a channel name; nothing when only an id is known. */
const hash = (name: string): string => (name ? `#${name.replace(/^#/, "")}` : "");

/**
 * The things an approval would schedule, from the action it carries, as blocks the card draws. The
 * people an approval is about come separately, in the order the emails appear; the campaign name is the
 * approval's own. An item this console can't read is left out rather than guessed at.
 */
export function scheduleBlocks(
  detail: Record<string, unknown>,
  people: ReadonlyArray<{ name: string; address?: string | null }>,
  campaignName: string | null,
  now = Date.now(),
): ScheduleBlock[] {
  const items = Array.isArray(detail.items) ? detail.items : [];
  const out: ScheduleBlock[] = [];
  let emails = 0;
  for (const raw of items) {
    const it = rec(raw);
    const kind = text(it.kind);
    const runAt = text(it.runAt);
    if (!kind || !runAt || Number.isNaN(Date.parse(runAt))) continue;
    const zone = text(it.timezone) || "UTC";
    const p = rec(it.payload);
    const repeat = (["daily", "weekdays", "weekly"] as const).find((r) => r === it.repeat) ?? "none";
    const until = text(it.until);
    const base = {
      kind,
      when: whenLabel(runAt, zone, { now, absolute: true, zone: true }),
      repeat: repeatWords({ repeat, until: until && !Number.isNaN(Date.parse(until)) ? until : null, timezone: zone, nextRunAt: null, runAt }, now),
    };
    switch (kind) {
      case "email": {
        const who = people[emails++];
        const name = who?.name ?? "a candidate";
        out.push({
          ...base, what: `Email to ${name}`, address: who?.address ?? null,
          quote: { title: text(p.subject) || null, body: clip(text(p.body)) },
          note: p.onlyIfNoReply === true ? "Only goes if they haven't replied by then." : null,
        });
        break;
      }
      case "slack_message":
        out.push({ ...base, what: `Post to ${hash(text(p.channelName)) || "Slack"}${text(p.channelName) ? " on Slack" : ""}`, quote: { title: null, body: clip(text(p.text)) }, note: null });
        break;
      case "notion_note": {
        const where = text(p.parentTitle);
        out.push({ ...base, what: where ? `Notion note in ${where}` : "Notion note", quote: { title: text(p.title) || null, body: clip(text(p.body)) }, note: null });
        break;
      }
      case "task": {
        const due = text(p.dueAt);
        out.push({
          ...base, what: `Task for ${text(p.assigneeName) || "you"}`, quote: { title: null, body: clip(text(p.title)) },
          note: due && !Number.isNaN(Date.parse(due)) ? `Due ${whenLabel(due, zone, { now, absolute: true, zone: true })}` : null,
        });
        break;
      }
      case "reminder":
        out.push({ ...base, what: "Reminder for you", quote: { title: null, body: clip(text(p.text)) }, note: null });
        break;
      case "digest": {
        const to = Array.isArray(p.to) ? p.to.map(String) : [];
        const where = [to.includes("slack") ? `Slack${hash(text(p.channelName)) ? ` ${hash(text(p.channelName))}` : ""}` : null, to.includes("app") ? "your notifications" : null]
          .filter(Boolean).join(" and ");
        out.push({
          ...base, what: `Pipeline digest for ${text(it.campaignId) && campaignName ? campaignName : "all your active campaigns"}`, quote: null,
          note: where ? `Goes to ${where}.` : null,
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

const KIND_NOUN_A: Readonly<Record<string, { one: string; many: string }>> = {
  email: { one: "an email", many: "emails" },
  slack_message: { one: "a Slack message", many: "Slack messages" },
  notion_note: { one: "a Notion note", many: "Notion notes" },
  task: { one: "a task", many: "tasks" },
  reminder: { one: "a reminder", many: "reminders" },
  digest: { one: "a digest", many: "digests" },
};

/** "Schedule an email", "Schedule 3 reminders", "Schedule 3 things". */
export function scheduleHead(blocks: ReadonlyArray<Pick<ScheduleBlock, "kind">>): string {
  const n = blocks.length;
  if (n === 0) return "Schedule this";
  const kinds = new Set(blocks.map((b) => b.kind));
  const noun = kinds.size === 1 ? KIND_NOUN_A[[...kinds][0] ?? ""] : undefined;
  if (n === 1) return `Schedule ${noun?.one ?? "something"}`;
  return noun ? `Schedule ${n} ${noun.many}` : `Schedule ${n} things`;
}

/** What approving did: how many were scheduled, and where to find them. */
export function scheduleOutcome(outcome: Record<string, unknown>): { lead: string; link: string; tail: string } {
  const n = Array.isArray(outcome.scheduled) ? outcome.scheduled.length : 1;
  if (n === 0) return { lead: "Nothing was scheduled.", link: "", tail: "" };
  return {
    lead: n === 1 ? "Scheduled. You'll find it under " : `Scheduled ${n} things. You'll find them under `,
    link: "Coming up",
    tail: " on your Home page.",
  };
}

/** What a card says when what it was about is gone or was handled elsewhere. */
export const ALREADY_HANDLED = "This was already handled.";

/** The stale-card answer, in the recruiter's words. */
export const CHANGED_AGAIN = "That changed while you were looking. Ask again.";
const STALE = /changed after it was proposed|propose it again/i;

/**
 * Why an approval failed, for the card. A card that went stale (the person, the time or the campaign
 * changed since it was proposed) says to ask again; any other refusal says what the server said.
 */
export function approvalFailure(action: string, status: number | null, message: string): string {
  if (isScheduleAction(action) && status === 409 && STALE.test(message)) return CHANGED_AGAIN;
  // What the card was about is gone, or was dealt with somewhere else: said calmly, never as "Message not found."
  if (status === 404) return ALREADY_HANDLED;
  return message;
}

/* ── where the fix is, when it is not in SuperHyre ── */

const GMAIL_API_PAGE = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";
const CALENDAR_API_PAGE = "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com";
const TASKS_API_PAGE = "https://console.cloud.google.com/apis/library/tasks.googleapis.com";
const SHEETS_API_PAGE = "https://console.cloud.google.com/apis/library/sheets.googleapis.com";

/**
 * The page that fixes a refusal when the fix is somewhere else (the Gmail API switched on in the Google
 * project): the link the server sent, or, for a card that came back with only the words it kept, the page those
 * words name. Only a web address is ever linked.
 */
export function helpLinkOf(given: unknown, message: string): string | null {
  if (typeof given === "string" && /^https:\/\/[^\s]+$/.test(given)) return given;
  if (/\bGoogle Cloud project\b/i.test(message) && /\bAPI\b/.test(message)) {
    if (/\bcalendar\b/i.test(message)) return CALENDAR_API_PAGE;
    if (/\btasks\b/i.test(message)) return TASKS_API_PAGE;
    return /\bsheets\b/i.test(message) ? SHEETS_API_PAGE : GMAIL_API_PAGE;
  }
  return null;
}

/** What the link to that page says. */
export const helpLinkLabel = (href: string): string => (/console\.(?:cloud\.)?google\.com/.test(href) ? "Open Google Cloud" : "Open the page");

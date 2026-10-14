import type { MemoryItem, MemoryType } from "./api/memory";

/**
 * What the Memory page and the rail say about the agent's notes, as words and groups. Pure, so the
 * wording and who may do what can be pinned by tests without a page.
 *
 * Nothing here says "supersede", "slot" or "trust": a note is replaced, not superseded, and where
 * it came from is said as what happened ("You told it", "Picked up from a chat").
 */

export type MemoryFilters = {
  /** `mine`: what is the recruiter's own; `campaign` and `client` narrow to the one chosen below. */
  scope: "all" | "mine" | "campaign" | "client" | "org";
  campaignId: string | null;
  clientId: string | null;
  /** Words that must all appear in a note. */
  q: string;
  /** Also list notes that were replaced by a newer one. */
  history: boolean;
};

export const NO_FILTERS: MemoryFilters = { scope: "all", campaignId: null, clientId: null, q: "", history: false };

export const isFiltered = (f: MemoryFilters): boolean => f.scope !== "all" || f.q.trim() !== "";

/** The scope choices, in the words a recruiter would use. */
export const SCOPE_CHOICES: ReadonlyArray<{ id: MemoryFilters["scope"]; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "mine", label: "Mine" },
  { id: "campaign", label: "This campaign" },
  { id: "client", label: "This client" },
  { id: "org", label: "Whole agency" },
];

/* ── the three kinds of note the page shows ── */

export const TYPE_ORDER: readonly MemoryType[] = ["facts", "ways", "happened"];

export const TYPE_TITLE: Readonly<Record<MemoryType, string>> = {
  facts: "Facts and preferences",
  ways: "How we do things",
  happened: "What happened",
};

/** One quiet line under each heading, so a section says what it is for. */
export const TYPE_HELP: Readonly<Record<MemoryType, string>> = {
  facts: "What clients want and rule out, and how each of you likes to work.",
  ways: "Patterns it noticed in your work and ways of working that proved themselves.",
  happened: "Decisions and outcomes from your campaigns, kept for a few months.",
};

export type TypeSection = { type: MemoryType; title: string; help: string; items: MemoryItem[] };

/** The notes split into the three sections, each keeping the order it came in; empty sections are not made. */
export function sectionsOf(items: readonly MemoryItem[]): TypeSection[] {
  return TYPE_ORDER.map((type) => ({
    type,
    title: TYPE_TITLE[type],
    help: TYPE_HELP[type],
    items: items.filter((i) => i.type === type),
  })).filter((s) => s.items.length > 0);
}

export const MEMORY_HREF = "#/settings/memory";

/* ── words ── */

const KIND_LABEL: Readonly<Record<string, string>> = {
  fact: "Fact",
  preference: "Preference",
  playbook: "Way of working",
  belief: "Pattern",
  episode: "What happened",
  example: "Example",
};

export const kindLabel = (kind: string): string =>
  KIND_LABEL[kind] ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Note");

/** Where a note came from, as what happened rather than a field name. */
export function sourceLabel(item: Pick<MemoryItem, "source" | "trust">): string {
  if (item.source === "recruiter") return "You told it";
  if (item.source === "import" || item.trust === "untrusted") return "From an imported document";
  if (item.source === "outcome") return "From the work it did";
  return "Picked up from a chat";
}

/**
 * "Used 3 times, last 2 days ago"; nothing for a note that has not been read yet, so the line stays short.
 * Without a last time it is just the count.
 */
export function usedLabel(n: number, lastUsedAt?: string | null, now = Date.now()): string | null {
  if (n <= 0) return null;
  const count = n === 1 ? "Used once" : `Used ${n} times`;
  const when = lastUsedAt ? sinceLabel(lastUsedAt, now) : null;
  return when ? `${count}, last ${when}` : count;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "3 months ago". */
export function sinceLabel(iso: string, now = Date.now()): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t <= 0) return null;
  const days = Math.floor((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

const DAY = 86_400_000;
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Today", "Yesterday", "8 Oct", or "8 Oct 2025" for another year. */
export function whenLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t <= 0) return "";
  const days = Math.floor((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return (new Date(t).getFullYear() === new Date(now).getFullYear() ? dayMonth : dayMonthYear).format(new Date(t));
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "1 note", "22 notes". */
export const notesLabel = (n: number): string => `${n} ${n === 1 ? "note" : "notes"}`;

/** Where a note applies, as a short phrase for places where the group heading isn't beside it. */
export function appliesTo(item: MemoryItem): string {
  switch (item.level) {
    case "org":
      return "For the whole agency";
    case "client":
      return `For ${item.clientName ?? "a client"}`;
    case "campaign":
      return `For ${item.campaignName ?? "a campaign"}${item.clientName ? ` (${item.clientName})` : ""}`;
    case "recruiter":
      return "Just for you";
    case "candidate":
      return item.personLabel ? `About ${item.personLabel}` : "About a candidate";
  }
}

/** The note's own meta line in a list: what sort of note, where from, how often used, when. */
export function metaLine(item: MemoryItem, now = Date.now()): string {
  return [
    kindLabel(item.kind),
    item.status === "superseded" ? "Replaced" : sourceLabel(item),
    usedLabel(item.usedCount, item.lastUsedAt, now),
    whenLabel(item.updatedAt, now),
  ].filter(Boolean).join(" · ");
}

/** What a sort of episode is called in a timeline of what happened. */
const EPISODE_LABEL: Readonly<Record<string, string>> = {
  pass: "Turned down",
  hire: "Hired",
  stage_move: "Moved on the board",
  shortlist: "Shortlisted",
  outreach_sent: "Outreach sent",
  outreach_outcome: "Outreach result",
  contacts: "Contact lookup",
  spec_approved: "Role spec approved",
  campaign_closed: "Campaign closed",
  campaign_reopened: "Campaign reopened",
  watch: "Keep-sourcing",
  action_done: "Approved",
  action_declined: "Declined",
  correction: "Your correction",
  session: "A chat",
};

/**
 * The meta line of something that happened, in a timeline: what sort of thing, where, who it is about
 * (a name, only when the reader may see the candidate), how often the agent used it, and when.
 */
export function happenedLine(item: MemoryItem, now = Date.now()): string {
  // Where it happened: the campaign (and its client), the client, or the whole agency; a candidate is "About".
  const where =
    item.level === "candidate"
      ? item.campaignName
        ? `For ${item.campaignName}${item.clientName ? ` (${item.clientName})` : ""}`
        : item.clientName
          ? `For ${item.clientName}`
          : null
      : appliesTo(item);
  return [
    item.episode ? (EPISODE_LABEL[item.episode] ?? kindLabel(item.kind)) : kindLabel(item.kind),
    where,
    item.about.length ? `About ${item.about.join(", ")}` : null,
    usedLabel(item.usedCount, item.lastUsedAt, now),
    whenLabel(item.at, now),
  ].filter(Boolean).join(" · ");
}

/** The meta line of a pattern the agent noticed and is waiting to have confirmed. */
export function noticedLine(item: MemoryItem): string | null {
  return item.basis && item.basis > 1 ? `Noticed across ${item.basis} pieces of work` : null;
}

/* ── who may do what ── */

/**
 * Whether the viewer may confirm, correct or forget a note. The whole agency's notes are the
 * admins'; everything else belongs to whoever can see it (the API only lists a recruiter their own
 * preferences and the clients and campaigns they work on).
 */
export const canChange = (item: Pick<MemoryItem, "level">, viewer: { manages: boolean }): boolean =>
  item.level !== "org" || viewer.manages;

/** What a person who cannot confirm a waiting note is told instead of a button. */
export function confirmHelp(item: Pick<MemoryItem, "level">, viewer: { manages: boolean }): string | null {
  return canChange(item, viewer) ? null : "Ask an admin to confirm";
}

/** Whether the note that replaced a note is still there. */
export type Replacement = "present" | "gone" | "unknown";

/**
 * What became of the note that replaced this one. The newer note can be forgotten after it replaced
 * its predecessor, and then "replaced by a newer note" would point at nothing. `known` is the ids on
 * screen, `forgotten` the ids that were forgotten while the page was open, and `complete` says the
 * list is everything there is (no search, no scope, no further page), which is the only time a note
 * that is not on screen is a note that is gone.
 */
export function replacementOf(
  item: Pick<MemoryItem, "supersededBy">,
  known: ReadonlySet<string>,
  forgotten: ReadonlySet<string>,
  complete: boolean,
): Replacement {
  const by = item.supersededBy;
  if (!by) return "unknown";
  if (forgotten.has(by)) return "gone";
  if (known.has(by)) return "present";
  return complete ? "gone" : "unknown";
}

/** What a replaced note says where its actions would be: the truth about what replaced it. */
export function replacedWords(r: Replacement): string {
  return r === "gone" ? "Its newer note was forgotten" : "Replaced by a newer note";
}

/** Only a current note can be corrected or forgotten; a replaced one is history. */
export const isLive = (item: Pick<MemoryItem, "status">): boolean => item.status === "active" || item.status === "pending";

/* ── grouping ── */

export type MemoryGroup = {
  key: string;
  kind: "org" | "client" | "campaign" | "you" | "people";
  title: string;
  /** Quiet second line: a campaign's client. */
  sub: string | null;
  items: MemoryItem[];
  /** Notes about people are many and rarely the point, so they start folded. */
  folded: boolean;
};

const KIND_RANK: Readonly<Record<string, number>> = { playbook: 0, preference: 1, fact: 2, belief: 3, example: 4, episode: 5 };
const rank = (kind: string): number => KIND_RANK[kind] ?? 6;

const byName = (a: MemoryGroup, b: MemoryGroup): number => a.title.localeCompare(b.title, "en", { sensitivity: "base" });

/**
 * The notes grouped by where they apply: the whole agency, each client, each campaign, you, then
 * people. A group with nothing in it is not made. Inside a group the lasting notes come before the
 * things that merely happened; the order the server sent is kept otherwise (newest first).
 */
export function groupMemories(items: readonly MemoryItem[]): MemoryGroup[] {
  const groups = new Map<string, MemoryGroup>();
  const add = (key: string, make: () => Omit<MemoryGroup, "key" | "items">, item: MemoryItem) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, ...make(), items: [] };
      groups.set(key, g);
    }
    g.items.push(item);
  };

  for (const item of items) {
    if (item.level === "org") {
      add("org", () => ({ kind: "org", title: "Whole agency", sub: null, folded: false }), item);
    } else if (item.level === "client") {
      add(`client:${item.clientId ?? item.clientName ?? ""}`, () => ({ kind: "client", title: item.clientName ?? "A client", sub: null, folded: false }), item);
    } else if (item.level === "campaign") {
      add(
        `campaign:${item.campaignId ?? item.campaignName ?? ""}`,
        () => ({ kind: "campaign", title: item.campaignName ?? "A campaign", sub: item.clientName, folded: false }),
        item,
      );
    } else if (item.level === "recruiter") {
      add("you", () => ({ kind: "you", title: "You", sub: null, folded: false }), item);
    } else {
      add("people", () => ({ kind: "people", title: "People", sub: null, folded: true }), item);
    }
  }

  for (const g of groups.values()) {
    g.items = g.items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => rank(a.item.kind) - rank(b.item.kind) || a.i - b.i)
      .map((x) => x.item);
  }

  const all = [...groups.values()];
  const of = (kind: MemoryGroup["kind"]) => all.filter((g) => g.kind === kind);
  return [...of("org"), ...of("client").sort(byName), ...of("campaign").sort(byName), ...of("you"), ...of("people")];
}

/* ── filters, applied on this side too ── */

/** Whether a note belongs in the list the current filters ask for (for a note that just changed). */
export function matchesFilters(item: MemoryItem, f: MemoryFilters): boolean {
  if (item.status === "pending" || item.status === "forgotten") return false;
  if (item.status === "superseded" && !f.history) return false;
  if (f.scope === "mine" && item.level !== "recruiter") return false;
  if (f.scope === "org" && item.level !== "org") return false;
  if (f.scope === "campaign" && (!f.campaignId || item.campaignId !== f.campaignId)) return false;
  if (f.scope === "client" && (!f.clientId || item.clientId !== f.clientId)) return false;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = item.text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** A note's words cut short for a sentence about it. */
export function snippet(text: string, max = 40): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

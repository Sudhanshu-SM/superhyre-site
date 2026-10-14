import { api } from "./client";

/**
 * What the agent remembers, as the API serves it (server: modules/memory, `GET /v1/memory`).
 *
 * A memory is one short note: about the whole agency, a client, a campaign, the recruiter's own
 * way of working, or something that happened with a candidate. Only active notes are ever read to
 * the agent. A note the agent proposed for the whole agency waits as "pending" until an admin
 * confirms it; a corrected note stays behind as "superseded" history.
 */

export type MemoryScope = "org" | "client" | "campaign" | "person";
export type MemoryLevel = "org" | "client" | "campaign" | "recruiter" | "candidate";
export type MemoryStatus = "active" | "pending" | "superseded" | "forgotten";
export type MemoryKind = "fact" | "preference" | "playbook" | "belief" | "episode" | "example";
export type MemorySource = "recruiter" | "distil" | "outcome" | "import";
/** The three groups the Memory page shows: facts and preferences, what happened, how we do things. */
export type MemoryType = "facts" | "happened" | "ways";

export type MemoryItem = {
  id: string;
  text: string;
  /** A string, not the union above, so a kind a newer server adds still shows. */
  kind: string;
  scope: MemoryScope;
  level: MemoryLevel;
  clientId: string | null;
  clientName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  /** "You" for the recruiter's own preference, the candidate's name for a note about one. Never contact details. */
  personLabel: string | null;
  /** Candidates the note is about, by name, for those this reader may see; never in the note's own words. */
  about: string[];
  type: MemoryType;
  /** For something that happened: what sort ("pass", "stage_move", "session"). */
  episode: string | null;
  /** For a pattern the agent noticed: how many pieces of work it rests on. */
  basis: number | null;
  status: MemoryStatus;
  trust: "user" | "agent" | "untrusted";
  source: MemorySource;
  /** The recruiter's own words the note rests on. */
  quote: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  /** When it was said, or for something that happened, when it did. */
  at: string;
  supersededBy: string | null;
  usedCount: number;
  /** When it was last read to the agent, if it was. */
  lastUsedAt: string | null;
  /** When it is dropped by itself, if it is. */
  expiresAt: string | null;
};

export type MemoryStats = {
  active: number;
  pending: number;
  /** Active notes by where they apply. */
  byScope: Record<MemoryScope, number>;
  /** The recruiter's own preferences. */
  mine?: number;
  /** Active notes by what they are. */
  byType?: Record<MemoryType, number>;
};

export type MemoryPage = { items: MemoryItem[]; nextCursor: string | null };

export type MemoryQuery = {
  /** `mine`: the recruiter's own preferences. */
  scope?: "all" | "mine" | MemoryScope;
  type?: MemoryType;
  clientId?: string;
  campaignId?: string;
  status?: "active" | "pending" | "all";
  q?: string;
  limit?: number;
  cursor?: string | null;
};

const SCOPES: readonly MemoryScope[] = ["org", "client", "campaign", "person"];
const LEVELS: readonly MemoryLevel[] = ["org", "client", "campaign", "recruiter", "candidate"];
const STATUSES: readonly MemoryStatus[] = ["active", "pending", "superseded", "forgotten"];
const TYPES: readonly MemoryType[] = ["facts", "happened", "ways"];
const TRUSTS = ["user", "agent", "untrusted"] as const;
const SOURCES: readonly MemorySource[] = ["recruiter", "distil", "outcome", "import"];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Where a level sits when the server doesn't say. */
const scopeOfLevel = (level: MemoryLevel): MemoryScope =>
  level === "recruiter" || level === "candidate" ? "person" : level;
/** The level a scope most likely means when the server sends only the scope. */
const levelOfScope = (scope: MemoryScope): MemoryLevel => (scope === "person" ? "candidate" : scope);

/**
 * One note from the API's answer, or null when it isn't one. Reads defensively: a server a little
 * older or newer than this console should drop a row it can't read, not break the page.
 */
export function memoryItemOf(raw: unknown): MemoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id);
  const text = str(o.text);
  if (!id || !text) return null;
  const sentScope = SCOPES.find((s) => s === o.scope);
  const level = LEVELS.find((l) => l === o.level) ?? (sentScope ? levelOfScope(sentScope) : undefined);
  if (!level) return null;
  const scope = sentScope ?? scopeOfLevel(level);
  const created = str(o.createdAt) ?? new Date(0).toISOString();
  return {
    id,
    text,
    kind: str(o.kind) ?? "fact",
    scope,
    level,
    clientId: str(o.clientId),
    clientName: str(o.clientName),
    campaignId: str(o.campaignId),
    campaignName: str(o.campaignName),
    personLabel: str(o.personLabel),
    about: Array.isArray(o.about) ? o.about.filter((n): n is string => typeof n === "string" && n.trim() !== "").slice(0, 5) : [],
    type: TYPES.find((t) => t === o.type) ?? typeOfKind(str(o.kind) ?? "fact"),
    episode: str(o.episode),
    basis: typeof o.basis === "number" && o.basis > 0 ? Math.floor(o.basis) : null,
    status: STATUSES.find((s) => s === o.status) ?? "active",
    trust: TRUSTS.find((t) => t === o.trust) ?? "agent",
    source: SOURCES.find((s) => s === o.source) ?? "distil",
    quote: str(o.quote),
    confidence: typeof o.confidence === "number" ? o.confidence : 0,
    createdAt: created,
    updatedAt: str(o.updatedAt) ?? created,
    at: str(o.at) ?? str(o.updatedAt) ?? created,
    supersededBy: str(o.supersededBy),
    usedCount: typeof o.usedCount === "number" && o.usedCount > 0 ? Math.floor(o.usedCount) : 0,
    lastUsedAt: str(o.lastUsedAt),
    expiresAt: str(o.expiresAt),
  };
}

/** The group a kind belongs to, when an older server does not say. */
function typeOfKind(kind: string): MemoryType {
  return kind === "episode" ? "happened" : kind === "playbook" || kind === "belief" || kind === "example" ? "ways" : "facts";
}

export function memoryPageOf(raw: unknown): MemoryPage {
  const o = (raw && typeof raw === "object" ? raw : {}) as { items?: unknown; nextCursor?: unknown };
  const items = Array.isArray(o.items) ? o.items.map(memoryItemOf).filter((i): i is MemoryItem => i !== null) : [];
  return { items, nextCursor: str(o.nextCursor) };
}

export function memoryStatsOf(raw: unknown): MemoryStats {
  const o = (raw && typeof raw === "object" ? raw : {}) as {
    active?: unknown;
    pending?: unknown;
    mine?: unknown;
    byScope?: Record<string, unknown> | null;
    byType?: Record<string, unknown> | null;
  };
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? Math.floor(v) : 0);
  const by = o.byScope ?? {};
  const type = o.byType ?? {};
  return {
    active: n(o.active),
    pending: n(o.pending),
    byScope: { org: n(by.org), client: n(by.client), campaign: n(by.campaign), person: n(by.person) },
    mine: n(o.mine),
    byType: { facts: n(type.facts), happened: n(type.happened), ways: n(type.ways) },
  };
}

function queryString(q: MemoryQuery): string {
  const p = new URLSearchParams();
  if (q.scope && q.scope !== "all") p.set("scope", q.scope);
  if (q.type) p.set("type", q.type);
  if (q.clientId) p.set("clientId", q.clientId);
  if (q.campaignId) p.set("campaignId", q.campaignId);
  if (q.status && q.status !== "active") p.set("status", q.status);
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.limit) p.set("limit", String(q.limit));
  if (q.cursor) p.set("cursor", q.cursor);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const listMemory = (q: MemoryQuery = {}): Promise<MemoryPage> =>
  api<unknown>("GET", `/v1/memory${queryString(q)}`).then(memoryPageOf);

export const memoryStats = (): Promise<MemoryStats> =>
  api<unknown>("GET", "/v1/memory/stats").then(memoryStatsOf);

/** Pending to active. Agency-wide notes need an admin; a replaced note is refused (409). */
export const confirmMemory = (id: string): Promise<MemoryItem | null> =>
  api<unknown>("POST", `/v1/memory/${encodeURIComponent(id)}/confirm`).then(memoryItemOf);

/** A soft delete: the note is no longer read at once. */
export const forgetMemory = (id: string): Promise<{ id: string; status: "forgotten" }> =>
  api<{ id: string; status: "forgotten" }>("POST", `/v1/memory/${encodeURIComponent(id)}/forget`);

/** The corrected note, new id and all; the old one stays as replaced history. */
export const correctMemory = (id: string, text: string): Promise<MemoryItem | null> =>
  api<unknown>("PATCH", `/v1/memory/${encodeURIComponent(id)}`, { text }).then(memoryItemOf);

/** The longest and shortest a corrected note may be, as the server checks them. */
export const MEMORY_TEXT = { min: 8, max: 300 } as const;

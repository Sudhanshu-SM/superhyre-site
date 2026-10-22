import type { ChatCard } from "./api/agent";

/**
 * The views the chat can show (server: packages/shared/src/views.ts; change both together).
 * Each is a piece of the console drawn in the conversation from live data, in answer to a kind
 * of request: the agent names the view, the console fetches what it needs.
 */
export const VIEW_KINDS = [
  "sourcing", "outreach", "status", "assign", "report", "compare", "schedule", "leak",
  "rediscover", "intake", "digest", "campaign", "form", "form-status", "client", "campaign-new", "campaign-import", "coming-up", "memory-doubts",
] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

export type ViewCard = Extract<ChatCard, { kind: "view" }>;

export const isViewKind = (v: string): v is ViewKind => (VIEW_KINDS as readonly string[]).includes(v);

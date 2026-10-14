import { api } from "./client";

/**
 * The do-not-contact list, as the API serves it (server: modules/suppressions, `GET /v1/suppressions`).
 *
 * Anyone listed here gets no email from any campaign, whether it is drafted, scheduled or sent by
 * hand. Any member can add someone; only an owner or admin can take someone off.
 */

export type SuppressionReason = "do_not_contact" | "unsubscribed" | "bounced" | "manual";
export type SuppressionSource = "user" | "agent" | "system";

const REASONS: readonly SuppressionReason[] = ["do_not_contact", "unsubscribed", "bounced", "manual"];
const SOURCES: readonly SuppressionSource[] = ["user", "agent", "system"];

export type Suppression = {
  id: string;
  reason: SuppressionReason;
  /** When it ends; null means until someone lifts it. */
  until: string | null;
  expired: boolean;
  source: SuppressionSource;
  /** A name, or a masked address (`a***@acme.com`). */
  label: string;
  /**
   * The whole address, for the people who may lift entries (owners and admins) and only when the server
   * sends it; everyone else is shown the masked label. An address added in this session keeps what was typed.
   */
  address?: string | null;
  note: string | null;
  createdBy: { kind: SuppressionSource; id: string | null; name: string | null };
  createdAt: string;
};

export type SuppressionPage = { items: Suppression[]; nextCursor: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const when = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
};

export function suppressionOf(raw: unknown): Suppression | null {
  const o = rec(raw);
  const id = str(o?.id);
  if (!o || !id) return null;
  const by = rec(o.createdBy);
  const source = SOURCES.find((s) => s === o.source) ?? "user";
  return {
    id,
    reason: REASONS.find((r) => r === o.reason) ?? "do_not_contact",
    until: when(o.until),
    expired: o.expired === true,
    source,
    label: str(o.label) ?? "Someone",
    address: str(o.address),
    note: str(o.note),
    createdBy: {
      kind: SOURCES.find((s) => s === by?.kind) ?? source,
      id: str(by?.id),
      name: str(by?.name),
    },
    createdAt: when(o.createdAt) ?? new Date(0).toISOString(),
  };
}

export function suppressionPageOf(raw: unknown): SuppressionPage {
  const o = rec(raw) ?? {};
  const items = Array.isArray(o.items) ? o.items.map(suppressionOf).filter((i): i is Suppression => i !== null) : [];
  return { items, nextCursor: str(o.nextCursor) };
}

export const listSuppressions = (q: { limit?: number; cursor?: string | null } = {}): Promise<SuppressionPage> => {
  const p = new URLSearchParams();
  if (q.limit) p.set("limit", String(q.limit));
  if (q.cursor) p.set("cursor", q.cursor);
  const s = p.toString();
  return api<unknown>("GET", `/v1/suppressions${s ? `?${s}` : ""}`).then(suppressionPageOf);
};

/** Someone already on the list comes back unchanged, so adding twice is harmless. */
export const addSuppression = (who: {
  candidateId?: string;
  email?: string;
  reason?: SuppressionReason;
  until?: string | null;
  note?: string;
}): Promise<Suppression | null> => api<unknown>("POST", "/v1/suppressions", who).then(suppressionOf);

/** Owner or admin only (403 otherwise). */
export const removeSuppression = (id: string): Promise<void> =>
  api<void>("DELETE", `/v1/suppressions/${encodeURIComponent(id)}`);

/** The longest note the server keeps. */
export const NOTE_MAX = 300;

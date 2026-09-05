import { z } from "zod";
import { supabase } from "./supabase";

/**
 * `public.dialer_activity()` — parsed, not cast.
 *
 * ── WHERE THE ROWS COME FROM ────────────────────────────────────────────────
 * `<tenant>.calls` is written by the dialer app (via public.dialer_upsert_call,
 * which lives in the dialer's own repo), and `<tenant>.call_queue` by the
 * extension's "add to call queue" button. Neither exists in a personal
 * workspace, which is why `tracked` is a discriminator rather than a flag:
 * "no telephony here" and "zero calls" are different facts and must not render
 * the same.
 */

/** The four groups the SQL derives from the status CHECK constraint. `status`
 *  itself stays on the row for the tooltip, but nothing branches on it. */
export const CALL_GROUPS = ["connected", "missed", "errored", "in_flight"] as const;
export type CallGroup = (typeof CALL_GROUPS)[number];

const callGroupSchema = z.enum(CALL_GROUPS);

const callRowSchema = z.object({
  call_id: z.string(),
  /** Null when the number dialled was never a candidate. calls.candidate_id is
   *  nullable on purpose (01_tenant.sql:152), so the table renders the number
   *  rather than inventing a name. */
  candidate_id: z.string().nullable().default(null),
  full_name: z.string().nullable().default(null),
  current_title: z.string().nullable().default(null),
  current_company_name: z.string().nullable().default(null),
  phone: z.string(),
  direction: z.union([z.literal("outbound"), z.literal("inbound")]),
  status: z.string(),
  group: callGroupSchema,
  /** Only ever set on a connected leg. */
  duration_seconds: z.number().nullable().default(null),
  started_at: z.string().nullable().default(null),
  outcome: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  has_recording: z.boolean().default(false),
  caller: z.string().nullable().default(null),
  mine: z.boolean().default(true),
});

const queueRowSchema = z.object({
  queue_id: z.string(),
  candidate_id: z.string(),
  full_name: z.string(),
  current_title: z.string().nullable().default(null),
  current_company_name: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  priority: z.number().default(0),
  status: z.union([z.literal("queued"), z.literal("in_progress")]),
  /** Nullable: no due date means no commitment was made, which is NOT overdue. */
  due_at: z.string().nullable().default(null),
  overdue: z.boolean().default(false),
  assignee: z.string().nullable().default(null),
  mine: z.boolean().default(true),
});

const statsSchema = z.object({
  total: z.number().default(0),
  connected: z.number().default(0),
  missed: z.number().default(0),
  errored: z.number().default(0),
  in_flight: z.number().default(0),
  inbound: z.number().default(0),
  outbound: z.number().default(0),
  talk_seconds: z.number().default(0),
  longest_seconds: z.number().default(0),
  people: z.number().default(0),
  no_candidate: z.number().default(0),
});

const queueSchema = z.union([
  z.object({ tracked: z.literal(false) }),
  z.object({
    tracked: z.literal(true),
    total: z.number().default(0),
    queued: z.number().default(0),
    in_progress: z.number().default(0),
    done: z.number().default(0),
    skipped: z.number().default(0),
    overdue: z.number().default(0),
    next: z.array(queueRowSchema).default([]),
  }),
]);

export const dialerSchema = z.object({
  scope: z.union([z.literal("solo"), z.literal("tenant")]),
  view: z.union([z.literal("mine"), z.literal("team")]),
  role: z.string().nullable().default(null),
  can_view_team: z.boolean().default(false),
  days: z.number(),
  since: z.string(),
  section: z.union([z.literal("calls"), z.literal("queue")]),
  /** False in a personal workspace: there is no telephony at all. */
  tracked: z.boolean(),
  stats: statsSchema.default({}),
  daily: z.array(z.object({
    day: z.string(),
    calls: z.number().default(0),
    connected: z.number().default(0),
  })).default([]),
  queue: queueSchema,
  calls: z.object({
    rows: z.array(callRowSchema).default([]),
    total: z.number().default(0),
    limit: z.number().default(25),
    offset: z.number().default(0),
    group: z.string().default(""),
  }),
});

export type Dialer = z.infer<typeof dialerSchema>;
export type CallRow = z.infer<typeof callRowSchema>;
export type QueueRow = z.infer<typeof queueRowSchema>;

/**
 * Connect rate.
 *
 * The denominator excludes `errored` and `in_flight` deliberately. A carrier
 * rejecting the leg is our telephony failing, not a person declining to answer,
 * and a call still ringing has no outcome yet. Mixing either in makes an
 * incident look like poor calling, which is the same mistake the reveal rate
 * avoids by excluding provider outages.
 */
export function connectRate(s: Dialer["stats"]): {
  attempts: number; hits: number; pct: number | null;
} {
  const hits = s.connected;
  const attempts = s.connected + s.missed;
  return {
    attempts,
    hits,
    pct: attempts >= MIN_CALL_N ? Math.round((hits / attempts) * 100) : null,
  };
}

/** Minimum completed attempts before a percentage replaces the raw fraction.
 *  Ours, not a standard: "50%" off two calls is a worse claim than "1 of 2". */
export const MIN_CALL_N = 10;

/**
 * Talk time as mm:ss, or null when there was none.
 *
 * Returns null rather than a dash because this is rendered INSIDE the outcome
 * label, in parentheses, and an empty pair of brackets is worse than no
 * brackets. Aircall ships this column as "In call time" rather than "Duration"
 * for a related reason: their raw duration includes ringing, and a missed call
 * has a duration of 0, so a "Duration" column reads as missing data on the
 * majority of rows.
 */
export function talk(secs: number | null): string | null {
  if (secs === null || secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The outcome label, fused with direction.
 *
 * Aircall's shipped Call History has ONE field for this, defined as "a label
 * with an icon showing the direction and outcome of the call", and the
 * vocabulary is deliberately asymmetric: inbound is answered/unanswered,
 * outbound is connected/not connected. "Missed" is only meaningful inbound.
 * Splitting direction into its own column makes the reader join two cells to
 * recover one fact.
 */
export function outcomeLabel(direction: "inbound" | "outbound", group: CallGroup): string {
  if (group === "errored") return "Failed";
  if (group === "in_flight") return "In progress";
  if (direction === "inbound") return group === "connected" ? "Answered" : "Missed";
  return group === "connected" ? "Connected" : "Not connected";
}

/** Total talk time, where hours matter more than seconds. */
export function talkTime(secs: number): string {
  if (secs <= 0) return "0m";
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export async function fetchDialer(opts: {
  days: number;
  view: "mine" | "team";
  section: "calls" | "queue";
  limit?: number;
  offset?: number;
  group?: CallGroup | "";
}): Promise<Dialer> {
  const { data, error } = await supabase.rpc("dialer_activity", {
    p: {
      days: opts.days,
      view: opts.view,
      section: opts.section,
      limit: opts.limit ?? 25,
      offset: opts.offset ?? 0,
      group: opts.group ?? "",
    },
  });
  if (error) throw error;
  return dialerSchema.parse(data);
}

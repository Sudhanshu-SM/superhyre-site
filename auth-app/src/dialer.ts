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
  /** Flags, not content. A transcript is the whole conversation in one column,
   *  so 25 of them would be hundreds of KB to draw two glyphs; the text comes
   *  from fetchCallDetail() when a row is opened. */
  has_transcript: z.boolean().default(false),
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


/* ── one call's recording and transcript ─────────────────────────────────── */

/**
 * One utterance from the dialer's transcription pipeline.
 *
 * EXACTLY three keys, and `speaker` is NOT among them. The dialer's parse.ts
 * maps Deepgram `results.utterances[]` to `{start, end, text}` and discards
 * everything else, so diarization does not exist in this data no matter what
 * the Deepgram request asked for. Rendering a speaker label here would be
 * inventing one, so the UI shows the timestamp and the words and nothing else.
 *
 * `start` and `end` are SECONDS as floats, which is what HTML5
 * `audio.currentTime` wants, so a segment can seek the player directly. (The
 * Kotlin client multiplies by 1000 only because Android MediaPlayer takes
 * milliseconds.)
 *
 * The column belongs to the DIALER's migration, not our 01_tenant.sql, so it
 * is absent on any tenant the dialer has never touched. Three distinct empty
 * states are all legitimate and all mean different things: absent/null (not
 * transcribed yet, or no such column), `[]` (transcribed, no utterances found),
 * and a null payload (no recording was ever attached).
 */
const segmentSchema = z.object({
  start: z.number().nullish(),
  end: z.number().nullish(),
  text: z.string().nullish(),
});

export const callDetailSchema = z.object({
  call_id: z.string(),
  candidate_id: z.string().nullable().default(null),
  full_name: z.string().nullable().default(null),
  current_title: z.string().nullable().default(null),
  current_company_name: z.string().nullable().default(null),
  phone: z.string(),
  direction: z.union([z.literal("outbound"), z.literal("inbound")]),
  status: z.string(),
  started_at: z.string().nullable().default(null),
  duration_seconds: z.number().nullable().default(null),
  outcome: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  caller: z.string().nullable().default(null),
  mine: z.boolean().default(true),
  /** Bucket + key, never a URL. Minting a playable link is Storage's job and
   *  needs the caller's own credentials, so a leaked payload is not a leaked
   *  recording. */
  recording_bucket: z.string().nullable().default(null),
  recording_object_key: z.string().nullable().default(null),
  transcript: z.string().nullable().default(null),
  /** Null where the dialer's migration has not run. */
  transcript_segments: z.array(segmentSchema).nullable().default(null),
});

export type CallDetail = z.infer<typeof callDetailSchema>;
export type Segment = z.infer<typeof segmentSchema>;

export async function fetchCallDetail(callId: string): Promise<CallDetail> {
  const { data, error } = await supabase.rpc("dialer_call_detail", {
    p: { call_id: callId },
  });
  if (error) throw error;
  return callDetailSchema.parse(data);
}

/**
 * A short-lived playable URL for a recording.
 *
 * The bucket is `call-recordings` and it is PRIVATE, so a signed URL is the
 * only way in. Object keys are minted server-side by the dialer as
 * `{organization_id}/{call_id}` for a tenant call, or
 * `individual/{user_id}/{call_id}` for a solo one, with no file extension.
 * Storage checks `select` before it signs, so a recruiter can only sign what
 * the bucket's own policy already lets them read.
 *
 * ── WHY THIS CAN FAIL, AND WHY THAT IS SAID OUT LOUD ────────────────────────
 * The recording columns are written by the dialer, but the Storage bucket they
 * name has to exist for anything to play. Probing this project's Storage API
 * found NO buckets provisioned at all: `/object/public/<name>/x` answers
 * `NoSuchBucket` for every candidate name. So today a player would be a dead
 * control, and the honest thing is to attempt the signed URL and report exactly
 * why it failed rather than render an <audio> element that will never load.
 *
 * 300s because a signed URL that outlives the visit is a link someone can share
 * out of the product.
 */
export type RecordingLink =
  | { ok: true; url: string }
  | { ok: false; reason: string };

export async function signRecording(
  bucket: string,
  key: string,
): Promise<RecordingLink> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, 300);
  if (error) {
    // Storage reports a missing bucket and a missing object differently, and
    // they need different answers from whoever is reading this.
    const msg = error.message || "";
    if (/bucket/i.test(msg)) {
      return { ok: false, reason: `Storage has no bucket named "${bucket}" yet, so this recording cannot be played. The dialer writes the pointer; the bucket still has to be created.` };
    }
    if (/not found|NoSuchKey/i.test(msg)) {
      return { ok: false, reason: "The recording is referenced but the file is not in Storage." };
    }
    return { ok: false, reason: msg || "Storage refused the request." };
  }
  if (!data?.signedUrl) return { ok: false, reason: "Storage returned no URL." };
  return { ok: true, url: data.signedUrl };
}

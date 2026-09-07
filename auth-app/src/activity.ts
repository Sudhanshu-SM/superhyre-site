import { z } from "zod";
import { supabase } from "./supabase";

/**
 * `public.extension_activity()` — parsed, not cast.
 *
 * Same reasoning as types.ts: this is a `returns jsonb` function whose shape
 * lives in another repo's SQL (`Superhyre-Extension/supabase/05_console.sql`).
 * A TypeScript interface would assert a contract nothing checks, and the
 * failure mode is a dashboard rendering `undefined` as a metric — a wrong
 * number shown confidently. Parsing turns a shape change into one clear error
 * at the boundary.
 *
 * Numbers are `.default(0)` where a missing key genuinely means zero, so a
 * brand-new recruiter with no activity gets a dashboard rather than a parse
 * failure. Arrays default to empty for the same reason.
 */

const revealsSchema = z.object({
  total: z.number().default(0),
  found: z.number().default(0),
  cached: z.number().default(0),
  not_found: z.number().default(0),
  /** `failed` + `needs_setup`. NOT rate_limited: the Edge Function returns that
   *  before it logs anything (reveal-phone/index.ts:99-101), so no such row
   *  ever exists. */
  errored: z.number().default(0),
  unique_profiles: z.number().default(0),
});

const quotaSchema = z.object({
  used: z.number().default(0),
  cap: z.number().default(0),
  remaining: z.number().default(0),
});

const savedSchema = z.object({
  total: z.number().default(0),
  in_window: z.number().default(0),
  with_phone: z.number().default(0),
  with_email: z.number().default(0),
  /** False in a personal workspace: public.individual_candidates has no
   *  `source` column, so these cannot be narrowed to extension-created rows
   *  and the UI must not imply that they were. */
  source_filtered: z.boolean().default(true),
});

/**
 * The follow-up worklist: saved by the extension, still at 'sourced', never
 * called.
 *
 * Tenant-only, and `tracked` is a discriminator rather than a flag because a
 * personal workspace has no <schema>.calls table at all. "No telephony here"
 * and "nothing is waiting" are different facts, and a shared shape would let
 * the UI render a 0 that actually means the former.
 */
const uncontactedSchema = z.union([
  z.object({ tracked: z.literal(false) }),
  z.object({
    tracked: z.literal(true),
    total: z.number().default(0),
    d0_2: z.number().default(0),
    d3_7: z.number().default(0),
    d8_30: z.number().default(0),
    d30p: z.number().default(0),
    oldest_days: z.number().default(0),
  }),
]);

const daySchema = z.object({
  day: z.string(),
  reveals: z.number().default(0),
});

/** Which provider produced the finds. Finds ONLY: reveal-phone attaches
 *  provider_slug on 'found' and on nothing else, so a per-provider success
 *  rate is not computable from this data and is not offered. */
const providerFindsSchema = z.object({
  slug: z.string(),
  found: z.number().default(0),
});

const stageRowSchema = z.object({
  stage: z.string(),
  n: z.number().default(0),
});

const recentSchema = z.object({
  candidate_id: z.string(),
  full_name: z.string(),
  headline: z.string().nullable().default(null),
  current_title: z.string().nullable().default(null),
  current_company_name: z.string().nullable().default(null),
  linkedin_url: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  has_phone: z.boolean().default(false),
  has_email: z.boolean().default(false),
  stage: z.string().default("sourced"),
  owner_name: z.string().nullable().default(null),
  mine: z.boolean().default(true),
  created_at: z.string(),
});

export const activitySchema = z.object({
  scope: z.union([z.literal("solo"), z.literal("tenant")]),
  view: z.union([z.literal("mine"), z.literal("team")]),
  role: z.string().nullable().default(null),
  can_view_team: z.boolean().default(false),
  days: z.number(),
  since: z.string(),
  quota: quotaSchema,
  reveals: revealsSchema,
  finds_by_provider: z.array(providerFindsSchema).default([]),
  daily: z.array(daySchema).default([]),
  saved: savedSchema,
  funnel: z.array(stageRowSchema).default([]),
  uncontacted: uncontactedSchema,
  recent: z.array(recentSchema).default([]),
});

export type Activity = z.infer<typeof activitySchema>;
export type RecentCandidate = z.infer<typeof recentSchema>;
export type StageRow = z.infer<typeof stageRowSchema>;
export type DayRow = z.infer<typeof daySchema>;

export type ActivityView = "mine" | "team";

/**
 * Minimum attempts before a percentage is shown instead of the raw fraction.
 *
 * OUR threshold, not an industry standard. The only published precedent found
 * for a minimum-sample gate is PostHog's 50-per-variant rule for experiments,
 * which is a different question; 20 is chosen here because a "50%" built on two
 * attempts is a worse lie than "1 of 2".
 */
export const MIN_RATE_N = 20;

/**
 * Contact-found rate.
 *
 * The denominator deliberately EXCLUDES `failed`, `needs_setup` and
 * `rate_limited`: those are our provider chain breaking, not a person who has
 * no phone number, and folding them in blames the candidate for our outage.
 *
 * `cached` counts in the numerator because a cache hit IS a successful find,
 * just a free one. 05_console.sql reports it separately so the saving stays
 * visible, not because it is a different kind of success.
 */
export function contactFound(r: Activity["reveals"]): {
  attempts: number; hits: number; pct: number | null;
} {
  const hits = r.found + r.cached;
  const attempts = hits + r.not_found;
  return {
    attempts,
    hits,
    pct: attempts >= MIN_RATE_N ? Math.round((hits / attempts) * 100) : null,
  };
}

/**
 * The stage vocabulary, in pipeline order.
 *
 * `<tenant>.candidates.stage` is `text NOT NULL DEFAULT 'sourced'` with **no
 * CHECK constraint** (01_tenant.sql), so the column can hold anything a future
 * writer puts there. This list is therefore a display order, not a validation:
 * `orderStages` appends unknown values rather than dropping them, because
 * silently omitting a stage would make the funnel disagree with `saved.total`.
 */
export const STAGE_ORDER = [
  "sourced", "contacted", "shortlisted", "interviewing", "offer", "hired", "rejected",
] as const;

/** Stages that mean the candidate left the pipeline, so a conversion rate does
 *  not count them as still-progressing. */
export const TERMINAL_STAGES: Record<string, true> = { hired: true, rejected: true };

export function orderStages(rows: StageRow[]): StageRow[] {
  const rank = (s: string) => {
    const i = STAGE_ORDER.indexOf(s as (typeof STAGE_ORDER)[number]);
    return i === -1 ? STAGE_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.stage) - rank(b.stage) || b.n - a.n);
}

/**
 * Calls the RPC. `days` and `view` are the only knobs; the function clamps
 * both server-side, so a hand-edited value cannot widen the window past 365
 * or read a colleague's activity.
 */
export async function fetchActivity(
  opts: { days: number; view: ActivityView; limit?: number },
): Promise<Activity> {
  const { data, error } = await supabase.rpc("extension_activity", {
    p: { days: opts.days, view: opts.view, limit: opts.limit ?? 25 },
  });
  if (error) throw error;
  return activitySchema.parse(data);
}

/**
 * What went wrong, in words a recruiter or the person deploying can act on.
 *
 * The error arrives as `unknown` from a catch, so its shape is parsed rather
 * than asserted: an inline `as { code: string }` would fabricate a shape the
 * compiler never checked and read it exactly once.
 *
 * `PGRST202` is the one code worth branching on. PostgREST returns it when the
 * function does not exist, which here means 05_console.sql has not been applied
 * to the project yet. That is a deployment step, not a bug, and saying so beats
 * a generic failure message.
 */
const rpcErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  details: z.string().nullish(),
  hint: z.string().nullish(),
});

export type ActivityFailure = {
  kind: "not-deployed" | "denied" | "unknown";
  message: string;
};

export function describeActivityError(err: unknown): ActivityFailure {
  // A ZodError means the function ran and returned a shape this build does not
  // expect, which is a version skew between the SQL and the bundle. Dumping the
  // raw issue list into the panel is unreadable and hides that.
  if (err instanceof z.ZodError) {
    const where = err.issues[0]?.path.join(".") || "the payload";
    return {
      kind: "not-deployed",
      message: `The database returned a shape this build does not expect (${where}). Re-apply Superhyre-Extension/supabase/05_console.sql, then reload.`,
    };
  }
  const parsed = rpcErrorSchema.safeParse(err);
  const code = parsed.success ? parsed.data.code : undefined;
  const message = parsed.success ? parsed.data.message : undefined;

  if (code === "PGRST202") {
    return {
      kind: "not-deployed",
      message:
        "This page reads extension_activity(), which is not in the database yet. Apply Superhyre-Extension/supabase/05_console.sql to the project, then reload.",
    };
  }
  // 42501 is the team-view gate in 05_console.sql refusing a recruiter.
  if (code === "42501") {
    return {
      kind: "denied",
      message: "Your role can only see your own activity.",
    };
  }
  return {
    kind: "unknown",
    message: message?.trim() || "Could not load your extension activity.",
  };
}

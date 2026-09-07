import { z } from "zod";

/**
 * `public.extension_bootstrap()` — parsed, not cast.
 *
 * This is RPC data: a `returns jsonb` function whose shape lives in another
 * repo's SQL (`Superhyre-Extension/supabase/04_extension.sql`). Casting it to a
 * TypeScript interface would assert a contract nothing checks, and the failure
 * mode is a blank card with `undefined` rendered into it. Parsing turns a
 * shape change into one clear error at the boundary instead.
 *
 * The union is discriminated on `allowed`, matching the SQL: a personal-email
 * account returns `{allowed:false, reason:'personal_email', email}` and nothing
 * else, so the fields below genuinely do not exist on that branch.
 */
const providerSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  credits_left: z.number().nullable(),
});

const blockedSchema = z.object({
  allowed: z.literal(false),
  reason: z.literal("personal_email"),
  email: z.string(),
});

const allowedSchema = z.object({
  allowed: z.literal(true),
  scope: z.union([z.literal("solo"), z.literal("tenant")]),
  user_id: z.string(),
  email: z.string(),
  full_name: z.string(),
  organization_id: z.string().nullable(),
  organization_name: z.string().nullable(),
  schema_name: z.string().nullable(),
  role: z.string().nullable(),
  // Defaulted rather than required: the sidebar footer feature this feeds is
  // not why someone signs in, so an absent list must not fail the whole parse.
  providers: z.array(providerSchema).default([]),
});

export const bootstrapSchema = z.union([blockedSchema, allowedSchema]);

export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type AllowedBootstrap = z.infer<typeof allowedSchema>;

/**
 * Which card is on screen.
 *
 * `checkInbox` exists because a Supabase project with "Confirm email" enabled
 * returns a user with NO session from signUp — the account is real but unusable
 * until the link is clicked. Collapsing that into `signedIn` would show someone
 * a success state for a session they do not have.
 *
 * `blocked` is its own view rather than an error banner: a personal-email
 * account is not a mistake the user can fix by retyping, so it gets an
 * explanation and a way out, not a red line under an input.
 */
export type View =
  | { v: "loading" }
  /** Ask for the work email. The only entry point. */
  | { v: "signIn" }
  /** A code has been sent and is being entered. `email` is carried so the
   *  verify call and the resend both know the address without re-reading a
   *  form the user has already moved past. */
  | { v: "code"; email: string }
  | { v: "signedIn"; bootstrap: AllowedBootstrap }
  | { v: "blocked"; email: string };

/** Per-action request state. Independent per action so a failed sign-up cannot
 *  wipe an error the Google button just produced, and vice versa. */
export type Op =
  | { s: "idle" }
  | { s: "busy" }
  /** A succeeded action that has something to say. Resending a sign-in code is
   *  the case: "sent" is the whole outcome, and without this the only way to
   *  confirm it would be an error-shaped notice or no feedback at all. */
  | { s: "done"; message: string }
  | { s: "error"; message: string };

export const IDLE: Op = { s: "idle" };
export const BUSY: Op = { s: "busy" };

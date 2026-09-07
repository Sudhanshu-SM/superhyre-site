/**
 * Supabase error -> copy a recruiter can act on.
 *
 * Pure and exported so every branch is testable without standing up auth.
 * Takes `unknown` because this is a library boundary: supabase-js rejects with
 * `AuthError`, but a dropped connection throws a `TypeError` from fetch, and a
 * misconfigured gateway can produce a plain object. Narrowing once here keeps
 * every caller from re-deriving it.
 */

/** The one message that matters most: the work-email gate.
 *
 *  `core.reject_free_email` is a Supabase "Before User Created" hook that
 *  returns HTTP 400. It fires for Google sign-in as well as password sign-up,
 *  which is why this is matched on substance rather than on which button the
 *  user pressed. We substitute our own wording instead of surfacing the
 *  server's sentence so the voice matches the rest of the surface. */
const WORK_EMAIL_COPY =
  "SuperHyre accounts need a work email. Personal addresses like gmail.com or outlook.com cannot be used.";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const candidate = error.message;
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const candidate = error.status;
    if (typeof candidate === "number") return candidate;
  }
  return null;
}

export function describeAuthError(error: unknown): string {
  const raw = messageOf(error);
  const text = raw.toLowerCase();
  const status = statusOf(error);

  // A failed fetch has no status and no useful message. Distinguish it, because
  // "check your connection" and "check your password" send someone in opposite
  // directions.
  if (error instanceof TypeError || text.includes("failed to fetch") || text.includes("networkerror")) {
    return "Could not reach SuperHyre. Check your connection and try again.";
  }

  // The work-email gate. Matched on the hook's own vocabulary plus our domain
  // wording, so it still resolves if the sentence in SQL is reworded.
  if (
    text.includes("work email") ||
    text.includes("personal account") ||
    text.includes("free email") ||
    text.includes("personal address")
  ) {
    return WORK_EMAIL_COPY;
  }

  /* ── the one-time code paths ──────────────────────────────────────────
     These are now the primary failure modes, since a code is the only way in
     besides Google. Supabase answers a wrong OR stale code with the SAME
     `otp_expired` / "Token has expired or is invalid" -- deliberately, because
     telling them apart would say whether a given code was ever real. So the
     copy has to cover both without guessing which happened. */
  if (
     text.includes("otp_expired") ||
     text.includes("token has expired") ||
     (text.includes("token") && text.includes("invalid"))
  ) {
    return "That code is wrong or has expired. Request a new one.";
  }

  if (text.includes("otp_disabled") || text.includes("signups not allowed")) {
    return "This address cannot sign in yet. Contact SuperHyre.";
  }

  /* The per-address cooldown, which is separate from the hourly cap below and
     names the wait because the server tells us how long it is. */
  if (text.includes("over_email_send_rate_limit") || text.includes("only request this after")) {
    const secs = /after (\d+) second/.exec(text)?.[1];
    return secs
      ? `A code was just sent. You can ask for another in ${secs} seconds.`
      : "A code was just sent. Wait a moment before asking for another.";
  }

  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) {
    return "Too many attempts. Wait a minute, then try again.";
  }

  // OAuth returns this in the URL when the provider is misconfigured or the
  // redirect origin is not in Supabase's allowlist. Naming the cause matters:
  // it is an operator problem, and the user retrying will not fix it.
  if (text.includes("redirect") || text.includes("invalid_grant") || text.includes("provider is not enabled")) {
    return "Google sign-in is not configured for this address. Contact SuperHyre.";
  }

  // Anything unmapped keeps the server's own sentence when there is one, rather
  // than flattening it to "Something went wrong" and destroying the only clue.
  return raw.trim() === "" ? "Something went wrong. Try again." : raw;
}

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

  if (text.includes("invalid login credentials") || text.includes("invalid_credentials")) {
    // Deliberately does not distinguish "no such account" from "wrong
    // password": that difference is an account-enumeration oracle.
    return "That email and password do not match an account.";
  }

  if (text.includes("email not confirmed") || text.includes("not_confirmed")) {
    return "This account still needs confirming. Open the link in the email we sent.";
  }

  if (text.includes("already registered") || text.includes("already been registered") || text.includes("user_already_exists")) {
    return "An account already exists for this address. Sign in instead.";
  }

  if (text.includes("password") && (text.includes("short") || text.includes("weak") || text.includes("least"))) {
    return "That password is too short. Use at least 10 characters.";
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

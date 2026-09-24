// What the Sourcing page is told when something fails.
//
// Upstream errors quote the provider's own response body verbatim, and this
// function's output is rendered straight into the page: the run log, the
// candidate cards, the CSV export, the run history. Which providers stand
// behind that page is ours to know, so only a ShownError's own words pass
// through. Everything else becomes a plain sentence, and the original goes to
// the function log, which is where we debug from.
import { ContactOutError } from "./contactout.ts";
import { DbError } from "./db.ts";
import { GatewayError } from "./gateway.ts";

/** A failure whose message is written for the recruiter and safe to show as-is. */
export class ShownError extends Error {}

export function forUser(err: unknown): string {
  if (err instanceof ShownError) return err.message;
  if (err instanceof DbError && err.status === 401) return "Your session expired. Sign in again.";
  if (err instanceof DbError && err.status === 403) return "Sourcing is only available to the SuperHyre team.";
  if (err instanceof ContactOutError) {
    return err.status === 429
      ? "The candidate search is busy. Try again in a minute."
      : "The candidate search failed. Try again in a minute.";
  }
  if (err instanceof GatewayError) return "Couldn't read the job description just now. Try again.";
  return "Something went wrong. Try again in a minute.";
}

/** Logs the real error for us and returns the sentence the recruiter sees. */
export function report(where: string, err: unknown): string {
  console.error(`sourcing-search: ${where}:`, err instanceof Error ? err.message : String(err));
  return forUser(err);
}

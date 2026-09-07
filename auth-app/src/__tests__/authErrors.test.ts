import { describe, expect, it } from "vitest";
import { describeAuthError } from "../authErrors";

/** supabase-js rejects with an AuthError carrying `message` and `status`. */
function authError(message: string, status?: number): unknown {
  const error = new Error(message);
  return status === undefined ? error : Object.assign(error, { status });
}

describe("describeAuthError", () => {
  it("recognises the work-email hook by its own wording", () => {
    // core.reject_free_email's actual sentence from 04_extension.sql.
    const message =
      "Superhyre needs a work email address — personal accounts (gmail.com, outlook.com and the like) cannot be used.";
    expect(describeAuthError(authError(message, 400))).toMatch(/work email/i);
  });

  it("still recognises the hook if the SQL sentence is reworded", () => {
    // Matched on vocabulary rather than an exact string, so a copy edit in the
    // database does not silently downgrade this to a raw passthrough.
    expect(describeAuthError(authError("personal address not permitted", 400))).toMatch(
      /work email/i,
    );
  });

  it("substitutes our own copy instead of echoing the server sentence", () => {
    const message = "Superhyre needs a work email address — personal accounts cannot be used.";
    // The em dash in the SQL must not reach the UI.
    expect(describeAuthError(authError(message, 400))).not.toContain("—");
  });


  it("separates a network failure from a credential failure", () => {
    // A TypeError is what fetch throws when the request never lands. Sending
    // someone to check their password for a dropped connection is a dead end.
    expect(describeAuthError(new TypeError("Failed to fetch"))).toMatch(/connection/i);
  });



  it("reports rate limiting from the status alone", () => {
    expect(describeAuthError(authError("Request failed", 429))).toMatch(/too many/i);
  });

  it("names OAuth misconfiguration as an operator problem", () => {
    const copy = describeAuthError("Unsupported provider: provider is not enabled");
    expect(copy).toMatch(/contact superhyre/i);
  });

  it("keeps an unmapped server sentence rather than flattening it", () => {
    // Replacing an unknown error with "Something went wrong" destroys the only
    // diagnostic the user could quote to support.
    expect(describeAuthError(authError("Database connection pool exhausted"))).toBe(
      "Database connection pool exhausted",
    );
  });

  it("falls back only when there is genuinely no message", () => {
    expect(describeAuthError({})).toMatch(/something went wrong/i);
    expect(describeAuthError(authError("   "))).toMatch(/something went wrong/i);
  });


  /* ── the one-time code paths ──
     These replace the password-era cases above. Supabase answers a WRONG code
     and a STALE code identically, so the copy has to cover both without
     implying which -- distinguishing them would reveal whether a given code
     was ever real. */
  it("covers a wrong and an expired code with one sentence", () => {
    for (const message of [
      "Token has expired or is invalid",
      "otp_expired",
      "Invalid token",
    ]) {
      const copy = describeAuthError(authError(message, 403));
      expect(copy).toMatch(/wrong or has expired/i);
      expect(copy).toMatch(/new one/i);
      // Must not name which of the two it was.
      expect(copy).not.toMatch(/never sent|does not exist|no such code/i);
    }
  });

  it("names the wait when the server gives one", () => {
    const copy = describeAuthError(
      authError("For security purposes, you can only request this after 42 seconds.", 429),
    );
    expect(copy).toContain("42 seconds");
  });

  it("sends people to Google when the server names no wait", () => {
    // No number means the project's hourly email quota, not the 60s
    // per-address cooldown. It used to say "wait a moment", which sent the
    // reader back to fail again against an hour-long window.
    const copy = describeAuthError(authError("over_email_send_rate_limit", 429));
    expect(copy).toMatch(/continue with google/i);
    expect(copy).toMatch(/hour/i);
    expect(copy).not.toMatch(/undefined|NaN/);
  });

  it("keeps the per-address cooldown distinct from the hourly cap", () => {
    // Both are 429. The cooldown can say how long; the cap cannot, so they
    // must not collapse into one message.
    const cooldown = describeAuthError(authError("you can only request this after 9 seconds.", 429));
    const cap = describeAuthError(authError("Request failed", 429));
    expect(cooldown).not.toBe(cap);
    expect(cap).toMatch(/too many/i);
  });

  it("says an address cannot sign in when signups are closed", () => {
    expect(describeAuthError(authError("Signups not allowed for this instance"))).toMatch(
      /cannot sign in yet/i,
    );
  });

  it("never leaks an em dash into any mapped sentence", () => {
    // Our own copy rule, and the DB hook message used to violate it.
    for (const message of [
      "Superhyre needs a work email address. Personal accounts cannot be used.",
      "Token has expired or is invalid",
      "over_email_send_rate_limit",
      "provider is not enabled",
    ]) {
      expect(describeAuthError(authError(message, 400))).not.toContain("\u2014");
    }
  });

  /* The two conditions that share over_email_send_rate_limit. Captured from
     production: the cooldown names seconds, the project quota does not. */
  it("names the wait for the per-address cooldown", () => {
    const out = describeAuthError({
      code: "over_email_send_rate_limit",
      message: "For security purposes, you can only request this after 42 seconds.",
      status: 429,
    });
    expect(out).toContain("42 seconds");
  });

  it("does not tell someone to wait a minute when the window is an hour", () => {
    // Verbatim production payload for the exhausted project quota.
    const out = describeAuthError({
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
      status: 429,
    });
    expect(out).not.toContain("a minute");
    expect(out).toContain("hour");
  });

  it("routes the exhausted quota to Google, which sends no email", () => {
    const out = describeAuthError({
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
      status: 429,
    });
    expect(out).toContain("Continue with Google");
  });

  it("does not blame the reader for a project-wide quota", () => {
    const out = describeAuthError({
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
      status: 429,
    });
    // "Too many attempts" reads as the reader's fault; any other user's
    // sign-in can exhaust this quota.
    expect(out).not.toContain("Too many attempts");
  });

  it("still recognises the quota with no code field, message only", () => {
    // A gateway or a plain fetch body can arrive without `code`.
    const out = describeAuthError({ message: "email rate limit exceeded" });
    expect(out).toContain("Continue with Google");
  });

  it("keeps the generic per-minute wording for non-email 429s", () => {
    const out = describeAuthError({ message: "too many requests", status: 429 });
    expect(out).toBe("Too many attempts. Wait a minute, then try again.");
  });

  it("reads the machine token off code, not out of the sentence", () => {
    // The token never appears in the message, so matching the sentence alone
    // let every email 429 fall through to the generic branch.
    const out = describeAuthError({ code: "over_email_send_rate_limit", message: "" });
    expect(out).toContain("Continue with Google");
  });
});

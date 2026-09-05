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

  it("does not distinguish a wrong password from a missing account", () => {
    // That difference is an account-enumeration oracle.
    const copy = describeAuthError(authError("Invalid login credentials", 400));
    expect(copy).toMatch(/do not match an account/i);
    expect(copy).not.toMatch(/no account|not found|does not exist/i);
  });

  it("separates a network failure from a credential failure", () => {
    // A TypeError is what fetch throws when the request never lands. Sending
    // someone to check their password for a dropped connection is a dead end.
    expect(describeAuthError(new TypeError("Failed to fetch"))).toMatch(/connection/i);
  });

  it("points an unconfirmed account at its inbox", () => {
    expect(describeAuthError(authError("Email not confirmed", 400))).toMatch(/link/i);
  });

  it("sends an existing account to sign in", () => {
    expect(describeAuthError(authError("User already registered", 422))).toMatch(/sign in/i);
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
    expect(describeAuthError(authError("Signups not allowed for this instance"))).toBe(
      "Signups not allowed for this instance",
    );
  });

  it("falls back only when there is genuinely no message", () => {
    expect(describeAuthError({})).toMatch(/something went wrong/i);
    expect(describeAuthError(authError("   "))).toMatch(/something went wrong/i);
  });

  it("reads a message from a plain object, not just an Error", () => {
    expect(describeAuthError({ message: "Invalid login credentials" })).toMatch(
      /do not match an account/i,
    );
  });
});

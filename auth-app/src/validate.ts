/**
 * Pure input rules. No React, no network — so the interesting cases are
 * testable without a browser.
 */

/**
 * Mirror of `core.free_email_domains` (Superhyre-Extension/supabase/00_shared.sql).
 *
 * THE DATABASE IS THE AUTHORITY, not this list. A Supabase "Before User
 * Created" hook (`core.reject_free_email`) rejects consumer domains with HTTP
 * 400, and it fires for Google sign-in too. This copy exists only to fail
 * *before* the round trip, because "that address will not work" is far more
 * useful under the field than after a redirect to Google and back.
 *
 * Consequence of the split worth knowing: if the table gains a domain this
 * list lacks, the signup still gets refused — just by the server, and the copy
 * in authErrors.ts covers that path. Drift makes the hint incomplete, never
 * wrong. Never invert it: do not let this list refuse a domain the server
 * would allow.
 */
export const CONSUMER_DOMAINS: readonly string[] = [
  "gmail.com", "googlemail.com", "outlook.com", "outlook.in", "hotmail.com",
  "hotmail.co.uk", "live.com", "msn.com", "yahoo.com", "yahoo.co.in",
  "yahoo.co.uk", "ymail.com", "rocketmail.com", "icloud.com", "me.com",
  "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
  "zoho.com", "zohomail.com", "gmx.com", "gmx.de", "mail.com",
  "yandex.com", "yandex.ru", "tutanota.com", "tuta.io", "fastmail.com",
  "hey.com", "rediffmail.com", "inbox.com", "mail.ru", "qq.com",
  "163.com", "126.com", "naver.com", "duck.com", "hushmail.com",
  "example.com", "test.com",
];

/** Lowercased host portion, or null when there isn't exactly one `@` with text
 *  on both sides. Matches `core.email_domain()`'s split_part behaviour. */
export function emailDomain(email: string): string | null {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !domain) return null;
  return domain;
}

/**
 * Deliberately not an RFC 5322 regex. The server and the mail provider are the
 * real validators; over-strict client regexes reject valid addresses (new TLDs,
 * tagged locals, unicode domains) which is a worse failure than accepting one
 * bad address and showing the server's answer.
 */
export function emailProblem(email: string): string | null {
  const value = email.trim();
  if (value === "") return "Enter your work email address.";

  const domain = emailDomain(value);
  if (domain === null || !domain.includes(".") || domain.endsWith(".")) {
    return "That does not look like a complete email address.";
  }
  if (CONSUMER_DOMAINS.includes(domain)) {
    return "SuperHyre needs a work email. Personal addresses cannot be used.";
  }
  return null;
}

/**
 * Supabase's own floor is 6 characters. Asking for 10 here is a deliberate
 * choice for a tool that holds candidate contact data, and it is stated up
 * front as helper text rather than sprung as an error after submit.
 *
 * Sign-in does not reuse this: telling someone their existing password is "too
 * short" at the sign-in gate is useless, and it leaks a fact about what is
 * stored. Sign-in checks presence only, inline at the call site.
 */
export const MIN_PASSWORD = 10;

export function passwordProblem(password: string): string | null {
  if (password === "") return "Choose a password.";
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  return null;
}

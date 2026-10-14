/**
 * Pure input rules. No React, no network — so the interesting cases are
 * testable without a browser.
 */

/**
 * Mirror of `core.free_email_domains` (Superhyre-Extension/supabase/00_shared.sql).
 *
 * The console no longer refuses these addresses: anyone can sign in and start in
 * their private Personal workspace, and set-up uses this list to decide which
 * "your team" question to ask (see `isPersonalAddress`). The production project's
 * Supabase "Before User Created" hook (`core.reject_free_email`) is a separate
 * switch that also guards the Chrome extension; if it still rejects consumer
 * domains the server answers 400 and the copy in authErrors.ts covers that path.
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
  if (value === "") return "Enter your email address.";

  const domain = emailDomain(value);
  if (domain === null || !domain.includes(".") || domain.endsWith(".")) {
    return "That does not look like a complete email address.";
  }
  return null;
}

/** True for a free-mail address (gmail and the like): such an address says nothing about the person's company. */
export function isPersonalAddress(email: string): boolean {
  const domain = emailDomain(email);
  return domain !== null && CONSUMER_DOMAINS.includes(domain);
}

/* MIN_PASSWORD and passwordProblem lived here and are gone. Sign-in is a
   one-time code to a work address plus Google, so there is no password to
   validate anywhere in the product -- and a rule with no caller is worse than
   no rule, because the next reader assumes something enforces it. */

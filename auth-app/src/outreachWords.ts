/**
 * The words an email's state is told in, everywhere it is told: the agent's card in the chat, an Outreach row, the
 * sheet, the filter. One file, so they cannot drift. Pure constants and two small functions; no rendering.
 */

/** An email that did not send: the word on its row, in the filter and on the agent's card. */
export const STATUS_FAILED = "Didn't send";

/** What a row says when no reason was kept with it (older and seeded rows). */
export const DIDNT_GO = "It didn't go out.";

/** Reasons older rows kept in words that are too vague to act on, and what they say now. No data is changed. */
export const LEGACY_REASONS: Readonly<Record<string, string>> = {
  "Gmail didn't allow this send.": "Gmail didn't accept this email. Reconnect Gmail and try again.",
};

/**
 * The reason an email did not send, as every screen shows it: the stored sentence without the trip to Settings
 * (Connect is on the card), an old vague one in today's words, "Bounced" for a bounce, the plain default when none.
 */
export function plainReason(error: string | null | undefined): string {
  if (error === "bounced") return "Bounced";
  const text = (error ?? "").replace(/\s*in Settings → Connections/i, "").trim();
  return LEGACY_REASONS[text] ?? (text || DIDNT_GO);
}

/**
 * An email that went out reads "Sent"; that nobody has replied is the quieter line beside it. A reply, a bounce, a
 * send that is lined up, a draft and one that did not send each read as themselves.
 */
export const EMAIL_STATE_WORDS: Readonly<Record<string, { label: string; secondary?: string }>> = {
  waiting: { label: "Sent", secondary: "Waiting for a reply" },
  replied: { label: "Replied" },
  bounced: { label: "Bounced" },
  scheduled: { label: "Scheduled" },
  draft: { label: "Draft" },
  failed: { label: STATUS_FAILED },
};

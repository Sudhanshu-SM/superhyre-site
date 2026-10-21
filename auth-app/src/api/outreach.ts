import { api } from "./client";

/**
 * Email outreach over the API. Drafts live in SuperHyre; approving one
 * schedules it from the recruiter's own Gmail at a paced time, and replies
 * are logged by hand (send-only access can't read them).
 */

export type MessageStatus = "draft" | "approved" | "scheduled" | "sending" | "sent" | "failed" | "replied_logged";

export type Message = {
  id: string;
  direction: "out" | "in";
  subject: string | null;
  body: string;
  status: MessageStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  error: string | null;
  /** What the recruiter logged after it was sent; null until then. */
  outcome: Outcome | null;
  createdAt: string;
};

export type Thread = {
  id: string;
  campaignCandidateId: string;
  stage: string;
  candidate: { id: string; name: string; title: string | null; company: string | null; primaryEmail: string | null };
  messages: Message[];
  /** Why nothing is sent to them ("Asha Verma is marked do not contact."), the server's sentence; null when they may be written to. */
  doNotContact?: string | null;
};

export type Outcome = "replied" | "no_reply" | "bounced";

export const listThreads = (campaignId: string) =>
  api<{ threads: Thread[] }>("GET", `/v1/campaigns/${campaignId}/outreach`).then((r) => r.threads);

export const createDrafts = (campaignId: string, items: readonly { campaignCandidateId: string; subject: string; body: string }[]) =>
  api<{ created: { campaignCandidateId: string; messageId: string }[]; errors: { campaignCandidateId: string; message: string }[] }>(
    "POST", `/v1/campaigns/${campaignId}/outreach/drafts`, { items },
  );

export const editMessage = (id: string, change: { subject?: string; body?: string }) =>
  api<void>("PATCH", `/v1/outreach/messages/${id}`, change);

/**
 * Approving answers with who was scheduled and who wasn't. `suppressed` appears only when someone was
 * held back because they are on the do-not-contact list (`reason` is a sentence, "Asha Verma is
 * marked do not contact."); when nobody is left the answer is a 409 saying so.
 */
export const approve = (ids: readonly string[]) =>
  api<{ scheduled: { id: string; scheduledFor: string }[]; skipped: string[]; suppressed?: { id: string; reason: string }[] }>(
    "POST", "/v1/outreach/messages/approve", { ids },
  );

export const cancel = (id: string) => api<{ status: MessageStatus }>("POST", `/v1/outreach/messages/${id}/cancel`);

/**
 * Sends a message that failed to go out, again, from the Gmail of the person who approved it. The answer is
 * the same as an approval's: when it is scheduled. A message Gmail took, or one logged as bounced, is a 409.
 */
export const retry = (id: string) =>
  api<{ scheduled: { id: string; scheduledFor: string }[]; skipped: string[] }>("POST", `/v1/outreach/messages/${id}/retry`);

export { DIDNT_GO, plainReason } from "../outreachWords";

/** Whether a failed message can be sent again here: its send failed, which is not the same as a bounce someone logged. */
export const canRetry = (m: Pick<Message, "status" | "error" | "outcome">): boolean =>
  m.status === "failed" && m.outcome !== "bounced" && m.error !== "bounced";

export const logOutcome = (id: string, outcome: Outcome, replyText?: string) =>
  api<void>("POST", `/v1/outreach/messages/${id}/log`, { outcome, ...(replyText?.trim() ? { replyText: replyText.trim() } : {}) });

/** Who is on the shortlist, for drafting to people who have no thread yet. */
export const shortlisted = (campaignId: string) =>
  api<{ candidates: { campaignCandidateId: string; fullName: string; currentTitle: string | null; hasEmail: boolean; doNotContact?: boolean }[] }>(
    "GET", `/v1/campaigns/${campaignId}/candidates?stage=shortlisted`,
  ).then((r) => r.candidates);

/* ── reading the threads ── */

export type Item = { thread: Thread; message: Message };

/** Each thread's newest outgoing message: the one there is something to do about. */
function latestOut(t: Thread): Message | undefined {
  return [...t.messages].reverse().find((m) => m.direction === "out");
}

const byStatus = (threads: readonly Thread[], status: MessageStatus): Item[] =>
  threads.flatMap((thread) => {
    const message = latestOut(thread);
    return message && message.status === status ? [{ thread, message }] : [];
  });

/** Drafts waiting for review, in the order they were written. */
export const draftsOf = (threads: readonly Thread[]) => byStatus(threads, "draft");

/** Approved and waiting for their slot (or going out right now), soonest first. */
export const scheduledOf = (threads: readonly Thread[]) =>
  [...byStatus(threads, "sending"), ...byStatus(threads, "scheduled"), ...byStatus(threads, "approved")]
    .sort((a, b) => Date.parse(a.message.scheduledFor ?? "") - Date.parse(b.message.scheduledFor ?? ""));

/** Sent, with no outcome logged yet. */
export const sentOf = (threads: readonly Thread[]) => byStatus(threads, "sent").filter((i) => !i.message.outcome);

/** Sent and logged as replied or not, newest first. Bounces are with the failures. */
export const loggedOf = (threads: readonly Thread[]) =>
  [...byStatus(threads, "sent"), ...byStatus(threads, "replied_logged")]
    .filter((i) => i.message.outcome === "replied" || i.message.outcome === "no_reply")
    .sort((a, b) => Date.parse(b.message.sentAt ?? "") - Date.parse(a.message.sentAt ?? ""));

export const OUTCOME_WORDS: Readonly<Record<Outcome, string>> = { replied: "Replied", no_reply: "No reply", bounced: "Bounced" };

export const failedOf = (threads: readonly Thread[]) => byStatus(threads, "failed");

/** One message changed, everywhere it appears. */
export function patchMessage(threads: readonly Thread[], id: string, change: Partial<Message>): Thread[] {
  return threads.map((t) => (t.messages.some((m) => m.id === id)
    ? { ...t, messages: t.messages.map((m) => (m.id === id ? { ...m, ...change } : m)) }
    : t));
}

/** What the server scheduled, written onto the threads. */
export function applyScheduled(threads: readonly Thread[], scheduled: readonly { id: string; scheduledFor: string }[]): Thread[] {
  let out = [...threads];
  for (const s of scheduled) out = patchMessage(out, s.id, { status: "scheduled", scheduledFor: s.scheduledFor });
  return out;
}

/** A first email for someone on the shortlist, for the recruiter to edit before approving. */
export function firstDraft(name: string, campaign: string): { subject: string; body: string } {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return {
    subject: `${campaign}: would you be open to a chat?`,
    body: `Hi ${first},\n\nI'm hiring for ${campaign} and your background looks like a good fit. Would you be open to a short call this week?\n\nThanks`,
  };
}

/** "Today, 14:30", "Tomorrow, 09:30" or "Mon 6 Oct, 09:30", in the viewer's time. */
export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 864e5);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

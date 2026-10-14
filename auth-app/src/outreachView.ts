import type { Item, Thread } from "./api/outreach";

/**
 * What the outreach card shows, sorted from the threads the server sent: drafts to read, what is
 * on its way, what went out, what didn't, and the people who must not be written to. Pure, so the
 * rules are pinned by tests: a person on the do-not-contact list never sits in a queue with a
 * button, and a message that is due now is not offered a Cancel.
 */

/** A message due within this long is going out now: the queue has it, and a cancel would come too late. */
export const GOING_OUT_MS = 15_000;

export type Sections = {
  drafts: Item[];
  /** Approved and waiting for its slot, soonest first. */
  scheduled: Item[];
  sent: Item[];
  failed: Item[];
  /** People who may not be written to and still have a message waiting: shown, with no actions. */
  doNotContact: Item[];
};

const latestOut = (t: Thread) => [...t.messages].reverse().find((m) => m.direction === "out");

const WAITING = new Set(["draft", "approved", "scheduled", "sending"]);

export function sectionsOf(threads: readonly Thread[], skipped: ReadonlySet<string> = new Set()): Sections {
  // Someone who may not be written to is set apart first: nothing of theirs is a draft to approve or a send to cancel.
  const listed: Item[] = [];
  const rest: Thread[] = [];
  for (const t of threads) {
    const m = latestOut(t);
    // What already went out stays in the history (a reply can still be logged); what is waiting does not.
    if (t.doNotContact && m && WAITING.has(m.status)) listed.push({ thread: t, message: m });
    else rest.push(t);
  }
  const byStatus = (status: string): Item[] =>
    rest.flatMap((thread) => {
      const message = latestOut(thread);
      return message && message.status === status ? [{ thread, message }] : [];
    });
  const time = (iso: string | null) => Date.parse(iso ?? "");
  const scheduled = [...byStatus("sending"), ...byStatus("scheduled"), ...byStatus("approved")].sort(
    (a, b) => (time(a.message.scheduledFor) || 0) - (time(b.message.scheduledFor) || 0),
  );
  const unlogged = byStatus("sent").filter((i) => !i.message.outcome);
  const logged = [...byStatus("sent"), ...byStatus("replied_logged")]
    .filter((i) => i.message.outcome === "replied" || i.message.outcome === "no_reply")
    .sort((a, b) => (time(b.message.sentAt) || 0) - (time(a.message.sentAt) || 0));
  return {
    drafts: byStatus("draft").filter((i) => !skipped.has(i.message.id)),
    scheduled,
    sent: [...unlogged, ...logged],
    failed: byStatus("failed"),
    doNotContact: listed,
  };
}

/**
 * Everyone on the do-not-contact list who is part of this run, by name, once each: those whose waiting message
 * was set apart (`held`), then the others in scope (listed by address, or never written to). The card that
 * says how many are left out names every one of them, or says only the count, never a count and some names.
 */
export function listedByName(
  held: readonly Item[],
  people: readonly { campaignCandidateId: string; fullName: string; suppressed?: boolean }[] = [],
): { id: string; name: string }[] {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  const add = (id: string, name: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, name });
  };
  for (const i of held) add(i.thread.campaignCandidateId, i.thread.candidate.name);
  for (const p of people) if (p.suppressed) add(p.campaignCandidateId, p.fullName);
  return out;
}

/** Whether a scheduled message can still be called back: not already sending, not due this moment. */
export function cancellable(m: { status: string; scheduledFor: string | null }, now = Date.now()): boolean {
  if (m.status !== "scheduled" && m.status !== "approved") return false;
  const at = Date.parse(m.scheduledFor ?? "");
  return Number.isNaN(at) || at - now > GOING_OUT_MS;
}

/** How a scheduled message reads: when it goes, or that it is going out now. */
export function goesOut(m: { status: string; scheduledFor: string | null }, now = Date.now()): "now" | "later" | "unknown" {
  if (m.status === "sending") return "now";
  const at = Date.parse(m.scheduledFor ?? "");
  if (Number.isNaN(at)) return "unknown";
  return at - now <= GOING_OUT_MS ? "now" : "later";
}

/**
 * When to look at the server again, in ms; null when nothing is on its way. A message due soon is
 * looked at just after it is due, so a card never says "Scheduled" about an email that has gone.
 */
export function nextLookMs(threads: readonly Thread[], now = Date.now()): number | null {
  let soonest: number | null = null;
  for (const t of threads) {
    const m = latestOut(t);
    if (!m || (m.status !== "scheduled" && m.status !== "approved" && m.status !== "sending")) continue;
    const at = Date.parse(m.scheduledFor ?? "");
    const wait = m.status === "sending" || Number.isNaN(at) ? 4_000 : Math.min(30_000, Math.max(4_000, at - now + 5_000));
    soonest = soonest === null ? wait : Math.min(soonest, wait);
  }
  return soonest;
}

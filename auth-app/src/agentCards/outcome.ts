import type { Suggestion } from "../api/agent";
import { campaignHref, helpLinkOf, isOutsideAction, isRememberAction, isScheduleAction, outsideOutcome, rememberOutcome, scheduleOutcome } from "../chatCards";
import { countsOf, suggestionsOf } from "../liveChat";
import type { Approval } from "../liveChat";

/**
 * What an approval says once it has been answered, as data the cards draw. Pure, so the words can be pinned
 * by tests: a card turns into its outcome in place, with the counts and the obvious next steps, and a declined
 * one says "Not done" quietly.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** What a declined approval says it did not do: the verb of the thing, so "Not sent" is never "Not done". */
export function declinedWords(action: string): string {
  if (isRememberAction(action)) return "Not saved.";
  if (isScheduleAction(action)) return "Not scheduled.";
  if (action === "send_email" || action === "send_test_email") return "Not sent.";
  if (action === "slack_message") return "Not posted.";
  if (action === "notion_note") return "Not saved.";
  if (action === "disconnect_app") return "Not disconnected.";
  return "Not now. Nothing changed.";
}

/** The one sentence an answered approval says. */
export function outcomeOf(a: Approval): string {
  if (!a.decided) return "";
  if (a.decided.decision === "decline") return declinedWords(a.action);
  const o = a.decided.outcome;
  // The server's own sentence for a change it describes; the wording below is for one that only sends numbers.
  const said = str(o.summary);
  const counts = countsOf(o.counts);
  // An email card leads with its counted line ("Sent 4 of 5 from ana@x.com."); the people it didn't reach are listed under it.
  if (settlesAsEmail(a.action) && str(o.headline)) return str(o.headline);
  if (a.action === "shortlist") return said || `Added ${String(o.added ?? counts?.added ?? 0)} to the shortlist.`;
  if (a.action === "move") return said || `Moved ${String(o.moved ?? counts?.moved ?? 0)}.`;
  // True while it runs and after it has finished: the card stays in the transcript, the people are listed under it.
  if (a.action === "find_people") return "Started the search. The people it finds are listed below.";
  // The server's one sentence ("Started keeping watch for X: every 4 hours, 5 at a time, until 10 people."):
  // it is not wrapped in a second lead that says the same thing, and ends with one full stop.
  if (a.action === "start_watch") return said ? `${said.replace(/[.\s]+$/, "")}.` : "Started keeping watch.";
  if (isOutsideAction(a.action)) return outsideOutcome(a.action, a.detail, o).text;
  if (isRememberAction(a.action)) return rememberOutcome(o);
  if (isScheduleAction(a.action)) {
    // Cancelled since (here, in Coming up, in Outreach): the server's own sentence, "Cancelled.", not "Scheduled."
    if ((counts?.cancelled ?? 0) > 0 && said) return said;
    const done = scheduleOutcome(o);
    return `${done.lead}${done.link}${done.tail}`;
  }
  // A capability the console has no wording for says what it did in the server's own words.
  return str(o.summary) || "Done.";
}

/** Where to look once an approved change has happened. */
export function afterApproval(a: Approval): { href: string; label: string; external?: boolean } | null {
  if (!a.decided || a.decided.decision !== "approve") return null;
  if (isOutsideAction(a.action)) {
    const link = outsideOutcome(a.action, a.detail, a.decided.outcome).link;
    return link ? { ...link, external: true } : null;
  }
  /* A note it keeps is the agent's own: there is no page to open for it. */
  if (isRememberAction(a.action)) return null;
  if (!a.campaignId) return null;
  if (a.action === "shortlist") return { href: campaignHref(a.campaignId, "shortlisted"), label: "Open the shortlist" };
  if (a.action === "move") return { href: campaignHref(a.campaignId, "pipeline"), label: "Open the pipeline" };
  return null;
}

/** The words for a count, in the order a person would say them. Unknown keys are left out rather than guessed at. */
const COUNT_WORDS: ReadonlyArray<[string, string]> = [
  ["added", "added"],
  ["moved", "moved"],
  ["saved", "saved"],
  ["scheduled", "scheduled"],
  ["shortlisted", "shortlisted"],
  ["passed", "passed"],
  ["alreadyThere", "already there"],
  ["alreadySaved", "already there"],
  ["skipped", "skipped"],
  ["failed", "didn't go through"],
];

/** "25 added, 3 already there": every count that is more than nothing, and the first one even when it is nothing. */
export function countsLine(counts: Record<string, number> | null): string {
  if (!counts) return "";
  const parts: string[] = [];
  for (const [key, word] of COUNT_WORDS) {
    const n = counts[key];
    if (n === undefined) continue;
    if (n > 0 || parts.length === 0) parts.push(`${n.toLocaleString("en-IN")} ${word}`);
  }
  return parts.join(", ");
}

/** People whose email did not go for the same reason, and the reason in plain words. */
export type OutcomeFailure = { names: string[]; reason: string };

/** The approvals that send email and settle as a card of their own: who it reached, who it didn't, and why. */
const EMAIL_CARDS = new Set(["send_email", "retry_failed_emails"]);
export const settlesAsEmail = (action: string): boolean => EMAIL_CARDS.has(action);

/**
 * The approvals that go out from the person's own Gmail carry the connection themselves: Connect (or Reconnect) is
 * inside the card, in the same place whether the card waits or has settled, and the turn shows no connect card of
 * its own beside it.
 */
const CARRIES_GMAIL = new Set(["send_email", "send_test_email", "retry_failed_emails"]);
export const carriesGmailConnect = (action: string): boolean => CARRIES_GMAIL.has(action);

/** The failure groups of an email answer; anything that is not names with a reason is left out. */
export function failuresOf(v: unknown): OutcomeFailure[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): OutcomeFailure[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const names = Array.isArray(o.names) ? o.names.filter((n): n is string => typeof n === "string" && n.trim() !== "") : [];
    return names.length ? [{ names, reason: str(o.reason) || "It didn't go out." }] : [];
  });
}

/** "Eli Fernandes", "Eli Fernandes and Fay Gupta", "Eli Fernandes, Fay Gupta and 2 more". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

export type Outcome = {
  /** `failed`: nothing went (or only some did), and the sentence says which and why. */
  tone: "done" | "declined" | "failed";
  /** An email card: who it did not reach and why, whether it can be tried again, and whether anything is still going out. */
  email?: {
    failures: OutcomeFailure[];
    again: boolean;
    settled: boolean;
    /** The page that fixes it when the fix is in the Google project. */
    help: string | null;
    /** Gmail has to be connected again for it to go. */
    reconnect: boolean;
    /** What else the answer says: who was shortlisted first, who has no email yet. */
    notes: string[];
  };
  /** The sentence: what happened, in words. */
  summary: string;
  /** "25 added, 3 already there"; empty when there are no counts. */
  counts: string;
  /** One click each: a page to open or something to say to the agent. */
  next: Suggestion[];
  /** The way back for a change that ran at once, as words to say to the agent; absent when there is none. */
  undo?: Suggestion | null;
};

/** An answered approval as an outcome; null while it is waiting. */
export function outcomeModel(a: Approval): Outcome | null {
  if (!a.decided) return null;
  if (a.decided.decision === "decline") return { tone: "declined", summary: outcomeOf(a), counts: "", next: [] };
  const o = a.decided.outcome;
  const counts = countsOf(o.counts) ?? numbersOf(a);
  const link = afterApproval(a);
  const said = suggestionsOf(o.next);
  const summary = outcomeOf(a);
  const undo = suggestionsOf([o.undo])[0] ?? null;
  /* Gmail refused every email that was due: said in colour, with the way forward in the next steps. */
  const refused = o.refused === true || ((counts?.failed ?? 0) > 0 && (counts?.sent ?? 0) === 0);
  const steps = fitSteps(a, counts, [...said, ...(link && !said.some((s) => s.href === link.href) ? [{ label: link.label, href: link.href }] : [])]);
  if (settlesAsEmail(a.action) && str(o.headline)) {
    // The card is the whole outcome: what is left to do is on it (Try again, Connect), and the only step beside it is
    // a page to open. A step that sends a message would add one to the chat for something this card does itself.
    const failures = failuresOf(o.failures);
    const settled = o.settled !== false;
    return {
      tone: settled && (counts?.sent ?? 0) === 0 && (counts?.failed ?? 0) > 0 ? "failed" : "done",
      summary,
      counts: "",
      next: steps.filter((s) => s.href).slice(0, 3),
      email: {
        failures,
        again: o.again === true,
        settled,
        help: helpLinkOf(o.help, ""),
        reconnect: o.reconnect === true,
        notes: [str(o.lead), str(o.extra)].filter(Boolean),
      },
    };
  }
  return {
    tone: refused ? "failed" : "done",
    ...(undo ? { undo } : {}),
    summary,
    // An email's sentence already says who it went to and who it did not: the counts would say it twice.
    counts: a.action === "send_email" || a.action === "send_test_email" ? "" : withoutRepeat(countsLine(counts), summary),
    // What the server suggests comes first; the page the change landed on is always one click away. After a
    // failure only the steps that mend it or look at it are offered, never one that carries on as if it had worked.
    next: (refused ? steps.filter((s) => MENDING.test(s.label)) : steps).slice(0, 3),
  };
}

/** The labels of steps that make sense after something did not go: fix it, try it again, or go and look. */
const MENDING = /^(?:try again|reconnect|connect|open |see |show |check)/i;

/** A next step (by its label: the words it sends can name a campaign) that assumes someone is on the board. */
const OUTREACH = /\b(?:outreach|reach out|contact|email|message)\b/i;
const SHORTLIST = /\bshortlist/i;

/**
 * The next steps that fit what was just done. People saved to Candidates are not on a board, so the way on is
 * shortlisting them or finding more, never outreach; people just shortlisted are ready for outreach and do not
 * need to be shortlisted again. A step the server sent that does not fit is left out, and one that fits and is
 * missing is added, so the chips under an answered card never describe a different change.
 */
export function fitSteps(
  a: Pick<Approval, "action" | "detail" | "campaignName"> & { campaignId?: string | null | undefined },
  counts: Record<string, number> | null,
  steps: readonly Suggestion[],
): Suggestion[] {
  const campaign = a.campaignName?.trim() || "the campaign";
  const had = (key: string): boolean => (counts === null || counts[key] === undefined ? true : counts[key]! > 0);
  const n = (key: string): number => counts?.[key] ?? 0;
  const has = (list: readonly Suggestion[], label: string) => list.some((s) => s.label.toLowerCase() === label.toLowerCase());
  const decision = typeof a.detail.decision === "string" ? a.detail.decision : "";
  const saving = a.action === "save_candidates" || (a.action === "decide_responses" && decision === "save");
  /* Someone held under the same email is left for the person to link, and that happens on the form's responses: the
     way there is always offered under it (the server's own link, which names the form, when it sent one). */
  const link = (list: readonly Suggestion[]): Suggestion | null => {
    if (a.action !== "decide_responses" || n("matchedExisting") === 0) return null;
    const sent = list.find((s) => /^open form responses$/i.test(s.label) && s.href);
    if (sent) return sent;
    return a.campaignId ? { label: "Open form responses", href: campaignHref(a.campaignId, "forms") } : null;
  };
  if (saving) {
    const kept = steps.filter((s) => !OUTREACH.test(s.label));
    if (a.action === "save_candidates") return kept;
    const open = link(kept);
    const rest = kept.filter((s) => s !== open);
    /* Shortlisting is for people who are in Candidates now (saved by this, or there already); finding more is
       for a save that added someone. A person left to be linked is neither. */
    if (!had("saved") && n("alreadyThere") === 0) return [...(open ? [open] : []), ...rest];
    const shortlist = rest.find((s) => /^shortlist them$/i.test(s.label))
      ?? { label: "Shortlist them", text: `Shortlist the people who met every must-have on the form for ${campaign}` };
    const more = had("saved")
      ? (rest.find((s) => /^find more people$/i.test(s.label)) ?? { label: "Find more people", text: `Find more people for ${campaign}` })
      : null;
    return [shortlist, ...(open ? [open] : []), ...(more ? [more] : []), ...rest.filter((s) => s !== shortlist && s !== more)];
  }
  if (a.action === "decide_responses" && decision === "add") {
    const kept = steps.filter((s) => !SHORTLIST.test(s.label));
    const open = link(kept);
    const rest = kept.filter((s) => s !== open);
    const outreach = (had("shortlisted") || n("alreadyThere") > 0) && !has(rest, "Start outreach")
      ? [{ label: "Start outreach", text: `Reach out to the shortlist for ${campaign}` }]
      : [];
    return [...outreach, ...(open ? [open] : []), ...rest];
  }
  if (a.action === "decide_responses") {
    const kept = steps.filter((s) => !OUTREACH.test(s.label) && !SHORTLIST.test(s.label));
    const open = link(kept);
    return [...(open ? [open] : []), ...kept.filter((s) => s !== open)];
  }
  /* A lookup that found no email has nothing to send to: "Send the email" and "Start outreach" are left out. */
  if (a.action === "fetch_contacts" && counts !== null && counts.emails === 0) {
    return steps.filter((s) => !OUTREACH.test(s.label) && !/^send\b/i.test(s.label));
  }
  return [...steps];
}

/** The counts line, unless the sentence above it already says every number in it ("Added 25 people" over "25 added"), or it is only zeros. */
export function withoutRepeat(counts: string, summary: string): string {
  const said = new Set(summary.match(/\d[\d,]*/g) ?? []);
  const numbers = counts.match(/\d[\d,]*/g) ?? [];
  if (numbers.length === 0) return counts;
  /* A zero is what the sentence already says in words ("nobody left", "already in Candidates"): a line of
     nothing but zeros adds nothing under a sentence, and a zero beside a number the sentence has is not news. */
  const real = numbers.filter((n) => n.replace(/[0,]/g, "") !== "");
  if (real.length === 0) return summary.trim() ? "" : counts;
  return real.every((n) => said.has(n)) ? "" : counts;
}

/** The numbers an older server puts straight on the result ({ added: 25 }), as counts. */
function numbersOf(a: Approval): Record<string, number> | null {
  if (!a.decided) return null;
  const o = a.decided.outcome;
  return countsOf({ added: o.added, moved: o.moved, alreadyThere: o.alreadyThere, skipped: o.skipped });
}

/** What an action will not do, for the actions the console knows; the server's own words win when it sends them. */
const WONT: Readonly<Record<string, string>> = {
  shortlist: "It won't contact anyone. People are only put on the shortlist.",
  move: "It won't send anyone a message. Only their place on the board changes.",
  find_people: "It won't contact anyone. People are only listed for you to decide on.",
  start_watch: "It won't contact anyone, and it stops by itself at the limit.",
  remember: "It only changes what the agent remembers. Nothing else.",
  schedule: "Nothing goes out before the time shown, and you can cancel it any time under Coming up on your Home page.",
  slack_message: "It posts once, to the channel shown. It won't change anything else.",
  notion_note: "It files this note once, where shown. It won't change anything else.",
  send_test_email: "It sends one email, to you only. It won't contact anyone else.",
  disconnect_app: "It only disconnects. Nothing already sent or posted is taken back.",
};

export function wontDo(a: Pick<Approval, "action" | "wontDo">): string[] {
  if (a.wontDo.length) return a.wontDo;
  const line = WONT[a.action];
  return line ? [line] : [];
}

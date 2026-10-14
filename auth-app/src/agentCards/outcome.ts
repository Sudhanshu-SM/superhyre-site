import type { Suggestion } from "../api/agent";
import { campaignHref, isOutsideAction, isRememberAction, isScheduleAction, outsideOutcome, rememberOutcome, scheduleOutcome } from "../chatCards";
import { countsOf, suggestionsOf } from "../liveChat";
import type { Approval } from "../liveChat";

/**
 * What an approval says once it has been answered, as data the cards draw. Pure, so the words can be pinned
 * by tests: a card turns into its outcome in place, with the counts and the obvious next steps, and a declined
 * one says "Not done" quietly.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The one sentence an answered approval says. */
export function outcomeOf(a: Approval): string {
  if (!a.decided) return "";
  if (a.decided.decision === "decline") return isRememberAction(a.action) ? "Not saved." : isScheduleAction(a.action) ? "Not scheduled." : "Not done.";
  const o = a.decided.outcome;
  // The server's own sentence for a change it describes; the wording below is for one that only sends numbers.
  const said = str(o.summary);
  const counts = countsOf(o.counts);
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
  ["alreadyThere", "already there"],
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

export type Outcome = {
  tone: "done" | "declined";
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
  return {
    tone: "done",
    ...(undo ? { undo } : {}),
    summary,
    counts: withoutRepeat(countsLine(counts), summary),
    // What the server suggests comes first; the page the change landed on is always one click away.
    next: [...said, ...(link && !said.some((s) => s.href === link.href) ? [{ label: link.label, href: link.href }] : [])].slice(0, 3),
  };
}

/** The counts line, unless the sentence above it already says every number in it ("Added 25 people" over "25 added"). */
export function withoutRepeat(counts: string, summary: string): string {
  const said = new Set(summary.match(/\d[\d,]*/g) ?? []);
  const numbers = counts.match(/\d[\d,]*/g) ?? [];
  return numbers.length > 0 && numbers.every((n) => said.has(n)) ? "" : counts;
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
};

export function wontDo(a: Pick<Approval, "action" | "wontDo">): string[] {
  if (a.wontDo.length) return a.wontDo;
  const line = WONT[a.action];
  return line ? [line] : [];
}

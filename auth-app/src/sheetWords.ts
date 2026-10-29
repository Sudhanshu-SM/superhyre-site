import type { SheetPreview, SheetSync } from "./api/campaigns";

/**
 * What the candidate-sheet dialog says about a sheet before it is read in and about what became of every row after. Kept
 * apart from the dialog so the words can be pinned: nobody is placed or rejected by a rule they were not shown, and every
 * row of the sheet that is a person is accounted for.
 */

export const STAGE_WORDS: Record<string, string> = {
  shortlisted: "shared",
  outreach: "contacted",
  interviewing: "interviewing",
  hired: "joined",
  passed: "rejected",
};

export const tally = (m: Record<string, number>): string =>
  Object.entries(m)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${STAGE_WORDS[k] ?? k}`)
    .join(", ");

const rows = (n: number): string => `${n} ${n === 1 ? "row" : "rows"}`;

/** The one that takes someone out of the process comes first. */
const ORDER = ["passed", "hired", "interviewing", "outreach", "shortlisted"] as const;

/** For each stage people will be placed on, the words in the sheet's statuses that put them there. */
export function placedLines(look: Pick<SheetPreview, "stages" | "placedBy">): string[] {
  return ORDER.flatMap((stage) => {
    const n = look.stages[stage];
    if (!n) return [];
    const shown = look.placedBy[stage] ?? [];
    const by = shown.map((w) => `${w.word} (${w.n})`).join(", ");
    // The most common words are named; what they leave out is counted, so the numbers add up.
    const rest = n - shown.reduce((sum, w) => sum + w.n, 0);
    const word = STAGE_WORDS[stage] ?? stage;
    const says = by ? `: the status says ${by}${rest > 0 ? `, and ${rest} by other words` : ""}` : "";
    return [`${word.charAt(0).toUpperCase()}${word.slice(1)}, ${n}${says}.`];
  });
}

/** Which tab was read, so a person whose people are on another one is told what to do about it. */
export function tabLine(look: Pick<SheetPreview, "tab">): string {
  return look.tab === "linked"
    ? "Reading the tab your link points at."
    : "Reading the first tab of the sheet. If your people are on another tab, open it and paste its link.";
}

/** The rows that are not people, and why. */
export function skippedLine(look: Pick<SheetPreview, "unreadable" | "noName" | "noContact">): string | null {
  if (look.unreadable <= 0) return null;
  const why = [
    look.noName ? `${look.noName} with no name` : "",
    look.noContact ? `${look.noContact} with no phone, email or LinkedIn I can read` : "",
  ].filter(Boolean);
  return `${rows(look.unreadable)} can't be added${why.length ? `: ${why.join(", ")}` : ""}.`;
}

/** How many refused rows are listed by number; the rest are counted. */
const LISTED = 5;

/** What a sync did, every person row accounted for. */
export function doneLines(done: SheetSync): string[] {
  const placed = tally(done.moved);
  const listed = done.refusals
    .slice(0, LISTED)
    .map((r) => `row ${r.row} (${r.why})`)
    .join(", ");
  const more = done.refused - Math.min(LISTED, done.refusals.length);
  return [
    `Done: ${done.added} new, ${done.alreadyHere} already here${placed ? `, ${placed}` : ""}.`,
    done.repeats > 0
      ? `${rows(done.repeats)} ${done.repeats === 1 ? "was" : "were"} the same person as a row above, so counted once.`
      : "",
    done.refused > 0
      ? `${rows(done.refused)} couldn't be added: ${listed}${more > 0 ? `, and ${more} more` : ""}.`
      : "",
    done.unreadable > 0
      ? `${rows(done.unreadable)} ${done.unreadable === 1 ? "was" : "were"} skipped (no name, or no phone, email or LinkedIn I could read).`
      : "",
    done.notMoved > 0
      ? `${done.notMoved} need your yes (a hire that takes someone off another campaign).`
      : "",
  ].filter(Boolean);
}

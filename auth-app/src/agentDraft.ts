/**
 * What the composer carries. A draft (the job description, the filters, the files, the words) belongs to ONE
 * conversation, or to the next campaign's brief; it never follows the person into another chat.
 */

/**
 * Whether the draft stays when the open conversation changes from `prev` to `next`. It stays when nothing was
 * open before (the chat is being resumed, or the first message has just made the conversation) and when it
 * is the same one; it goes when the person moves from one conversation to another or to a new one.
 */
export function keepsDraft(prev: string | null, next: string | null): boolean {
  return prev === null || prev === next;
}

export type SlotsInput<J> = {
  /** A campaign is in focus: its own job description and filters are what the slots say. */
  focused: boolean;
  campaignJd: J | null;
  campaignFilters: number;
  /** What was set for the next message (the next campaign's brief). */
  nextJd: J | null;
  nextFilters: number;
};

/** What the Job description and Filters slots show: the campaign's own when one is in focus, else the next brief's. */
export function slotsFor<J>(s: SlotsInput<J>): { jd: J | null; filters: number } {
  return s.focused ? { jd: s.campaignJd, filters: s.campaignFilters } : { jd: s.nextJd, filters: s.nextFilters };
}

/**
 * The composer's text box, counted in lines of its own leading. It was three at rest, which made the composer the largest
 * thing on the landing; two say "write a sentence", and the box grows with the text up to MAX_LINES (a brief longer than
 * that is read in the field, not in the layout).
 */
export const REST_LINES = 2;
export const MAX_LINES = 6;

/**
 * One line of the field's text, in px: `.orc-input`'s 16.5px type at 1.5 (access.css). Only the fallback for a browser that
 * gives no number (`line-height: normal`): the box reads its leading from the field, so a change of type cannot leave it
 * behind. It was written down as 22 (14.5px at 1.5) and when the type grew the box rested at 44px of a real 49.5, jumped
 * 6px as the second line wrapped, and capped a line early.
 */
export const FIELD_LINE_H = 24.75;

/** One line in px from a computed `line-height` ("24.75px"); `FIELD_LINE_H` when there is no number in it ("normal"). */
export function lineHeightPx(computed: string): number {
  const px = parseFloat(computed);
  return px > 0 ? px : FIELD_LINE_H;
}

/**
 * The text box's height in px, given one line of its leading (`lineH`) and the height its words need (`scrollH`):
 * `max` of the floor and `min` of the cap, so the clamp reads in the order it applies. The floor is REST_LINES lines
 * at rest and one once a brief has been sent; the cap is MAX_LINES, then the box scrolls. Both are whole pixels, so the
 * field rests at a whole height (130px at 24.75) and the second line wrapping does not move it by half of one.
 */
export function fieldHeight(lineH: number, scrollH: number, started: boolean): number {
  const floor = Math.round((started ? 1 : REST_LINES) * lineH);
  return Math.max(floor, Math.min(scrollH, Math.round(MAX_LINES * lineH)));
}

/**
 * Which of the two composer chips to show. A job description starts a role and filters narrow a search, so both are for the
 * NEXT message of a chat that is about no campaign, and both are there from the first blank screen (a person briefing a role
 * looks for them there). In a campaign's chat they are the campaign's standing set-up, which is in the header's "What the
 * agent knows" and on every sourcing card, so neither shows: a tick and a count repeated in each chat said something that
 * never changed. Not connected (the prototype), both always do.
 */
export function composerChips(s: { live: boolean; inCampaign: boolean }): { jd: boolean; filters: boolean } {
  const forNext = !s.live || !s.inCampaign;
  return { jd: forNext, filters: forNext };
}

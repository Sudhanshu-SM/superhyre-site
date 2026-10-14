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

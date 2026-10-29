import type { ApiSuggestion } from "./api/campaigns";

/**
 * The Sourced page's nudge to look at the changes the daily search suggests (docs/plans/daily-search.md, "Improving the search"). It
 * is said right after a person rejects someone with a reason, which is when they edit a filter by hand today. The page only says there
 * is one and sends the agent the words that put it in the chat as a card to press: nothing is changed from here.
 */

/** The words that ask the agent for the suggested changes: the morning's message says the same, so there is one way to look. */
export const SHOW_SUGGESTIONS = "Show me the changes you suggest";
export const showPhrase = (campaignName: string): string => `${SHOW_SUGGESTIONS} for ${campaignName}`;

/**
 * The same ask from a place that has no line to the agent (the Daily search popup, on the Campaigns page or in the agent's own rail):
 * it says which campaign and the console, which holds the way to the agent, puts the words in that campaign's chat and sends them. It
 * also makes it the campaign the page is on, so the message goes with its id: the agent reads the campaign from that, because the name in
 * the words alone is lost when it is short, one word in a chat for that campaign, or the same as another campaign's.
 */
export const SHOW_EVENT = "sh:show-suggestions";
export type ShowAsk = { campaignId: string; campaignName: string };
export const askToShow = (ask: ShowAsk): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ShowAsk>(SHOW_EVENT, { detail: ask }));
};

/** The one line the nudge says: what the change is and why, in counts. Null when nothing is waiting. */
export function nudgeText(waiting: readonly Pick<ApiSuggestion, "headline" | "why">[]): string | null {
  const first = waiting[0];
  if (!first) return null;
  const more = waiting.length - 1;
  return `A change to suggest: ${first.headline}. ${first.why}${more > 0 ? ` ${more} more waiting.` : ""}`;
}

/** Whether to look for a suggestion after a rejection: only one with a reason, and only for someone who may change the campaign. */
export const asksAfter = (reason: string | undefined, may: boolean): boolean => may && Boolean(reason?.trim());

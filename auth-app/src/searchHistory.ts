import { agoFrom, type ApiSearchChange, searchHistory as readHistory, undoSearchChange } from "./api/campaigns";
import { messageOf } from "./api/client";
import { ALL_FILTERS } from "./filters";
import { invalidate } from "./invalidate";
import { SOURCES, sourceModeOf } from "./sources";

/**
 * A campaign's search history: every change to where its searches look and to the filters they use, as the server keeps it
 * (modules/campaigns/search-history.ts), said in the console's own words. The server keeps the values as they were; what a
 * filter is called and how its value reads is the filters dialog's catalogue (filters.ts), so the two never say it two ways.
 */

export type SearchHistoryItem = ApiSearchChange;
export type SearchChange = { label: string; from: string; to: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** "excludeCo" for a filter the catalogue does not know: "Exclude co". */
const spaced = (key: string): string => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** One filter's value, as the filters dialog would show it: "Pune, Mumbai", "3 to 8 years", "On", or "not set". */
export function valueWords(key: string, value: unknown): string {
  if (value === undefined || value === null) return "not set";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number")) {
    const [a, b] = value as [number, number];
    const control = ALL_FILTERS.get(key)?.control;
    const range = control?.kind === "range" ? control : null;
    const min = range?.min ?? 0;
    const max = range?.max ?? 25;
    // The dialog says years "yrs"; here it is a word.
    const unit = range?.unit ? ` ${range.unit === "yrs" ? "years" : range.unit}` : key === "years" ? " years" : "";
    if (a > min && b < max) return `${a} to ${b}${unit}`;
    if (a > min) return `${a}+${unit}`;
    return b < max ? `up to ${b}${unit}` : "any";
  }
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "none";
  return String(value);
}

/** What one line of the history changed: each filter whose value is not what it was, or where searches look. */
export function changesOf(item: Pick<SearchHistoryItem, "lever" | "before" | "after">): SearchChange[] {
  if (item.lever === "sources") {
    return [
      {
        label: "Searches look in",
        from: SOURCES[sourceModeOf({ sources: item.before })].says,
        to: SOURCES[sourceModeOf({ sources: item.after })].says,
      },
    ];
  }
  const before = isObject(item.before) ? item.before : {};
  const after = isObject(item.after) ? item.after : {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map((key) => ({
      label: ALL_FILTERS.get(key)?.label ?? spaced(key),
      from: valueWords(key, before[key]),
      to: valueWords(key, after[key]),
    }));
}

/** Who made the change and when, in the console's plain words ("Ana Rao, 2h ago"). */
export const whoWhen = (item: Pick<SearchHistoryItem, "by" | "at">, now = Date.now()): string =>
  `${item.by ?? "Someone"}, ${agoFrom(item.at, now)}`;

/** Where it was made, when that was not the filters dialog; an Undo says it put something back. */
export function howMade(item: Pick<SearchHistoryItem, "via" | "undoes">): string | null {
  if (item.undoes) return "Put back";
  if (item.via === "chat") return "Asked in the chat";
  if (item.via === "details") return "With the campaign's details";
  return null;
}

/** The list for a campaign, newest first. */
export const readSearchHistory = (campaignId: string): Promise<SearchHistoryItem[]> => readHistory(campaignId);

/**
 * Puts one change back. Comes back with the list as it stands now, or with the sentence the server gave for why it could not
 * (something changed the same thing since; the person is not on the campaign). The pages that show the filters read again.
 */
export async function putBack(
  campaignId: string,
  changeId: string,
): Promise<{ items: SearchHistoryItem[] } | { problem: string }> {
  try {
    const done = await undoSearchChange(campaignId, changeId);
    invalidate(["campaign", "sourcing"], { campaignId });
    return { items: done.items };
  } catch (err) {
    return { problem: messageOf(err) };
  }
}

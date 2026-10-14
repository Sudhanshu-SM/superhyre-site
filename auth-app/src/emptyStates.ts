import type { EmptyArtName } from "./EmptyArt";

/**
 * Which picture a list shows when it has nothing to list, and how big.
 *
 * A list is empty for two different reasons and they must not look alike: nothing exists yet (the
 * page's own picture, sized for a whole page) or something exists and the search or filter hides it
 * (the magnifier, smaller, because the fix is one click away and the page is not "empty").
 */
export type ListKind = "campaigns" | "candidates" | "calls" | "clients" | "shortlist";

const NONE_YET: Record<ListKind, { name: EmptyArtName; size: number }> = {
  campaigns: { name: "empty-campaigns", size: 220 },
  candidates: { name: "empty-candidates", size: 220 },
  calls: { name: "empty-calls", size: 200 },
  clients: { name: "empty-clients", size: 200 },
  shortlist: { name: "empty-shortlist", size: 180 },
};

const NO_MATCH = { name: "empty-search", size: 160 } as const satisfies { name: EmptyArtName; size: number };

/**
 * What an empty Shortlisted table is: the shortlist has nobody ("none"), the Passed filter is on and
 * nobody has been passed on ("passed"), or something exists and the search or filters hide it ("no-match").
 */
export function shortlistEmpty(a: { total: number; passed: number; status: string | null; narrowed: boolean }): "none" | "passed" | "no-match" {
  if (a.total === 0) return "none";
  if (a.status === "passed" && a.passed === 0 && !a.narrowed) return "passed";
  return "no-match";
}

/**
 * What the connections list is: nothing is connected at all ("none"), or something that was is
 * signed out ("signed-out", with the names), or neither (null, which leaves the list as it is).
 * A service the server does not offer is not counted either way.
 */
export function connectionNotice(
  items: readonly { name: string; state: "connected" | "expired" | "missing" }[],
): { kind: "none" } | { kind: "signed-out"; names: string[] } | null {
  if (items.length === 0) return null;
  const out = items.filter((i) => i.state === "expired").map((i) => i.name);
  if (out.length) return { kind: "signed-out", names: out };
  if (items.every((i) => i.state === "missing")) return { kind: "none" };
  return null;
}

/** "Slack", "Slack and Notion", "Slack, Notion and Google". */
export function joinNames(names: readonly string[]): string {
  return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Slack is signed out", "Slack and Notion are signed out". */
export function signedOutTitle(names: readonly string[]): string {
  return `${joinNames(names)} ${names.length === 1 ? "is" : "are"} signed out`;
}

/** What the signed-out notice tells you to do: names each service, so "it" never has to be guessed. */
export function reconnectLine(names: readonly string[]): string {
  return names.length === 1
    ? `Reconnect ${names[0]} below and the agent can use it again.`
    : `Reconnect ${joinNames(names)} below and the agent can use them again.`;
}

/** Moving `person` to `to` makes them the campaign's first hire (nobody else is hired yet). */
export function isFirstHire(people: readonly { id: string; stage: string }[], person: { id: string; stage: string }, to: string): boolean {
  return to === "hired" && person.stage !== "hired" && !people.some((p) => p.stage === "hired" && p.id !== person.id);
}

/**
 * Whether a campaign's Hires card still celebrates: exactly one person is hired and they landed
 * within the last few days. Later it is just a hire, like the next one.
 */
export function celebratesFirstHire(hired: readonly { inStage: number }[], withinDays = 3): boolean {
  return hired.length === 1 && hired[0]!.inStage <= withinDays;
}

/**
 * What an empty candidates list says. Only a search or a filter that hides people is "no match";
 * a campaign with nobody on it, or a workspace with nobody saved yet, is simply empty, and says so
 * calmly with the page's own picture rather than the magnifier and "try fewer filters".
 */
export function emptyList(a: { narrowed: boolean; campaign: string | null; live: boolean }): { noMatch: boolean; head: string; text: string } {
  if (a.narrowed) return { noMatch: true, head: "No candidates match.", text: "Try fewer filters or a shorter search." };
  if (a.campaign) {
    return {
      noMatch: false,
      head: `Nobody is on ${a.campaign} yet.`,
      text: "Shortlist people from All campaigns, or ask the agent to find some.",
    };
  }
  /* Fixtures are never empty on their own: an empty list there is always a filter's doing. */
  return a.live
    ? { noMatch: false, head: "No candidates yet.", text: "Add them by hand, paste LinkedIn links or upload a CSV." }
    : { noMatch: true, head: "No candidates match.", text: "Try fewer filters or a shorter search." };
}

/**
 * What a page that isn't built yet shows: a picture and a line about what it will hold, so it
 * reads as a place that is coming rather than a broken one. The words stay honest that it isn't
 * built; the second line is the same for every page.
 */
export function comingSoon(routeId: string): { art: EmptyArtName; size: number; head: string } {
  switch (routeId) {
    case "campaign-calls": return { art: "empty-calls", size: 200, head: "Calls will live here" };
    case "support": return { art: "empty-notifications", size: 180, head: "Support is on its way" };
    default: return { art: "empty-analytics", size: 180, head: "This page is on its way" };
  }
}

export const COMING_SOON_NOTE = "We haven't built this page yet. Everything else in the console works as usual.";

export function listEmptyArt(kind: ListKind, noMatch: boolean): { name: EmptyArtName; size: number } {
  return noMatch ? NO_MATCH : NONE_YET[kind];
}

/**
 * What an empty Pipeline says. Nobody is on the board for different reasons, and the words follow the reason: no role
 * spec to search with, a spec waiting for approval, people found and waiting for a call, a search that found no one.
 * It never offers to "run a search" after one has run. Plain data in, words out, so each state is checked without a browser.
 */

/** Where the campaign's search stands, as far as the board's emptiness is concerned. */
export type SearchFacts = {
  /** None: no spec drafted. Draft: one is drafted and not approved (a search needs the approved one). */
  spec: "none" | "draft" | "approved";
  /** People the search found, whatever was decided about them since. */
  found: number;
  /** Found people nobody has shortlisted or passed on yet. */
  toReview: number;
  /** A search or a scoring going now. */
  running: boolean;
};

/** What the button does: the console maps each to a place (the agent with a prompt, or the matches). */
export type EmptyGo = "draftSpec" | "approveSpec" | "matches" | "broaden" | "brief";

export type EmptyBoardWords = {
  title: string;
  body: string;
  cta: { label: string; go: EmptyGo } | null;
};

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** `facts` null is not knowing yet (or no server): a line that is true whatever has happened. */
export function emptyBoardWords(facts: SearchFacts | null): EmptyBoardWords {
  if (!facts) {
    return {
      title: "No one here yet",
      body: "People land on this board when you shortlist them from the matches or add them from Candidates.",
      cta: { label: "Brief the agent", go: "brief" },
    };
  }
  if (facts.spec === "none") {
    return {
      title: "No requirements yet",
      body: "The requirements say who fits. Draft them first, and then the agent can look for people.",
      cta: { label: "Draft the requirements", go: "draftSpec" },
    };
  }
  if (facts.spec === "draft") {
    return {
      title: "The requirements are waiting for you",
      body: "Approve them and the agent starts looking for people.",
      cta: { label: "Review the requirements", go: "approveSpec" },
    };
  }
  if (facts.toReview > 0) {
    return {
      title: "No one shortlisted yet",
      body: `${people(facts.toReview)} found and waiting for your call. Shortlist the ones you like and they land on this board.`,
      cta: { label: "Shortlist people from the matches", go: "matches" },
    };
  }
  if (facts.running) {
    return {
      title: "Looking for people",
      body: "The agent is searching now. The ones you shortlist land on this board.",
      cta: null,
    };
  }
  if (facts.found > 0) {
    return {
      title: "No one on the board",
      body: `The ${people(facts.found)} found so far were passed on or didn't fit. Try broader filters and search again.`,
      cta: { label: "Try broader filters", go: "broaden" },
    };
  }
  return {
    title: "No one found yet",
    body: "The search didn't turn anyone up. Try broader filters and search again.",
    cta: { label: "Try broader filters", go: "broaden" },
  };
}

/** The facts from the server's reading of the search and the campaign's spec; null when either cannot be told yet. */
export function factsFrom(
  spec: { latest: unknown; approved: unknown } | null,
  sourcing: { shown: number; counts?: { found: number; toReview: number } | undefined; running?: unknown } | null,
): SearchFacts | null {
  if (!spec || !sourcing) return null;
  return {
    spec: spec.approved ? "approved" : spec.latest ? "draft" : "none",
    found: sourcing.counts?.found ?? sourcing.shown,
    toReview: sourcing.counts?.toReview ?? 0,
    running: Boolean(sourcing.running),
  };
}

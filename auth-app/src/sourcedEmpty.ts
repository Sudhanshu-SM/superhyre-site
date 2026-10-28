import type { EmptyBoardWords, SearchFacts } from "./pipelineEmpty";

/**
 * What the Sourced page says when nobody has been found. Like the empty Pipeline, the words follow the reason: no role spec to
 * search with, a spec waiting for approval, a spec approved and no search yet, a search going now, a search that found no one.
 * It never offers a first search after one has run, and a person who only follows the campaign gets the words and no button.
 * Plain data in, words out.
 */

export type SourcedGo = "draftSpec" | "approveSpec" | "find" | "broaden";
export type SourcedEmptyWords = Omit<EmptyBoardWords, "cta"> & { cta: { label: string; go: SourcedGo } | null };

/** `facts` null is not knowing yet: words that are true whatever has happened. `searched` is whether a search has ever ended. */
export function sourcedEmptyWords(facts: SearchFacts | null, searched: boolean, may: boolean): SourcedEmptyWords {
  const offer = (label: string, go: SourcedGo) => (may ? { label, go } : null);
  if (!facts) {
    return {
      title: "No one found yet",
      body: "The people the agent finds for this role land here, best fit first, for you to review.",
      cta: offer("Find people", "find"),
    };
  }
  if (facts.spec === "none") {
    return {
      title: "No role spec yet",
      body: "The role spec says who fits. Draft it first, and then the agent can look for people.",
      cta: offer("Draft the role spec", "draftSpec"),
    };
  }
  if (facts.spec === "draft") {
    return {
      title: "The role spec is waiting for approval",
      body: "Approve it and the agent starts looking for people.",
      cta: offer("Review the role spec", "approveSpec"),
    };
  }
  if (facts.running) {
    return {
      title: "Looking for people",
      body: "The agent is searching now. They show up here as each one is read.",
      cta: null,
    };
  }
  if (!searched) {
    return {
      title: "Ready to look for people",
      body: "The role spec is approved. Start a search and the people found land here, best fit first, for you to review.",
      cta: offer("Find people", "find"),
    };
  }
  return {
    title: "No one found for this search",
    body: "The search didn't turn anyone up. Broaden the filters, such as the city or the years of experience, and search again.",
    cta: offer("Try broader filters", "broaden"),
  };
}

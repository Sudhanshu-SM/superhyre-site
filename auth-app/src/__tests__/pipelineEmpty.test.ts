import { describe, expect, it } from "vitest";
import { emptyBoardWords, factsFrom, type SearchFacts } from "../pipelineEmpty";

/**
 * An empty Pipeline says why it is empty and offers the one next step for that reason. It never offers to "run a search"
 * once one has run.
 */

const facts = (over: Partial<SearchFacts> = {}): SearchFacts => ({ spec: "approved", found: 0, toReview: 0, running: false, ...over });

describe("what an empty pipeline says", () => {
  it("with no requirements: draft them", () => {
    const w = emptyBoardWords(facts({ spec: "none" }));
    expect(w.title).toBe("No requirements yet");
    expect(w.cta).toEqual({ label: "Draft the requirements", go: "draftSpec" });
  });

  it("with requirements that are not approved: look at them and approve them", () => {
    const w = emptyBoardWords(facts({ spec: "draft" }));
    expect(w.body).toMatch(/Approve them/);
    expect(w.cta).toEqual({ label: "Review the requirements", go: "approveSpec" });
  });

  it("with matches waiting: shortlist from the matches, and say how many", () => {
    const w = emptyBoardWords(facts({ found: 14, toReview: 14 }));
    expect(w.cta).toEqual({ label: "Shortlist people from the matches", go: "matches" });
    expect(w.body).toMatch(/^14 people found and waiting/);
    expect(emptyBoardWords(facts({ found: 1, toReview: 1 })).body).toMatch(/^1 person found/);
    // Waiting matches win over a search still going: there is something to do now.
    expect(emptyBoardWords(facts({ found: 5, toReview: 5, running: true })).cta?.go).toBe("matches");
  });

  it("while a search runs with nothing to review: says so, with nothing to press", () => {
    const w = emptyBoardWords(facts({ running: true }));
    expect(w.title).toBe("Looking for people");
    expect(w.cta).toBeNull();
  });

  it("when the search found no one: try broader filters", () => {
    const w = emptyBoardWords(facts());
    expect(w.title).toBe("No one found yet");
    expect(w.cta).toEqual({ label: "Try broader filters", go: "broaden" });
  });

  it("when everyone found was decided and none is on the board: try broader filters too", () => {
    const w = emptyBoardWords(facts({ found: 9 }));
    expect(w.body).toMatch(/9 people found so far/);
    expect(w.cta?.go).toBe("broaden");
  });

  it("never says to run a search after one has run, and says nothing false when it does not know yet", () => {
    for (const f of [facts({ spec: "none" }), facts({ spec: "draft" }), facts({ found: 14, toReview: 14 }), facts({ found: 9 }), facts(), facts({ running: true })]) {
      const w = emptyBoardWords(f);
      expect(`${w.title} ${w.body} ${w.cta?.label ?? ""}`).not.toMatch(/run a search|let the agent run/i);
    }
    const unknown = emptyBoardWords(null);
    expect(unknown.title).toBe("No one here yet");
    expect(unknown.cta?.go).toBe("brief");
    expect(`${unknown.body}`).not.toMatch(/search/i);
  });
});

describe("the facts it reads", () => {
  it("come from the spec and the server's reading of the search, and are unknown until both are in", () => {
    const spec = { latest: { id: "s1" }, approved: null };
    expect(factsFrom(null, { shown: 0 })).toBeNull();
    expect(factsFrom(spec, null)).toBeNull();
    expect(factsFrom({ latest: null, approved: null }, { shown: 0 })?.spec).toBe("none");
    expect(factsFrom(spec, { shown: 0 })?.spec).toBe("draft");
    expect(factsFrom({ latest: { id: "s1" }, approved: { id: "s1" } }, { shown: 0 })?.spec).toBe("approved");
    expect(factsFrom({ latest: { id: "s1" }, approved: { id: "s1" } }, { shown: 14, counts: { found: 14, toReview: 12 }, running: { runId: "r" } })).toEqual({
      spec: "approved", found: 14, toReview: 12, running: true,
    });
    // An older server sends no counts: what was shown is what was found.
    expect(factsFrom({ latest: { id: "s1" }, approved: { id: "s1" } }, { shown: 3 })).toMatchObject({ found: 3, toReview: 0 });
  });
});

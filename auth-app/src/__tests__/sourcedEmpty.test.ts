import { describe, expect, it } from "vitest";
import type { SearchFacts } from "../pipelineEmpty";
import { sourcedEmptyWords } from "../sourcedEmpty";

const facts = (over: Partial<SearchFacts>): SearchFacts => ({ spec: "approved", found: 0, toReview: 0, running: false, ...over });

describe("what the Sourced page says with nobody found", () => {
  it("follows how far the search has got, with the one button that moves it on", () => {
    expect(sourcedEmptyWords(facts({ spec: "none" }), false, true)).toMatchObject({ title: "No role spec yet", cta: { go: "draftSpec" } });
    expect(sourcedEmptyWords(facts({ spec: "draft" }), false, true)).toMatchObject({ cta: { go: "approveSpec" } });
    expect(sourcedEmptyWords(facts({}), false, true)).toMatchObject({ title: "Ready to look for people", cta: { go: "find", label: "Find people" } });
    expect(sourcedEmptyWords(facts({ running: true }), false, true)).toMatchObject({ title: "Looking for people", cta: null });
    expect(sourcedEmptyWords(facts({}), true, true)).toMatchObject({ title: "No one found for this search", cta: { go: "broaden" } });
  });

  it("never offers a first search after one has run, and says something true before the server has answered", () => {
    expect(sourcedEmptyWords(facts({}), true, true).cta?.go).not.toBe("find");
    const unknown = sourcedEmptyWords(null, false, true);
    expect(unknown.title).toBe("No one found yet");
    expect(unknown.body).not.toMatch(/search didn't|approved/i);
  });

  it("gives a person who only follows the campaign the words and no button", () => {
    for (const searched of [false, true]) {
      for (const f of [null, facts({ spec: "none" }), facts({ spec: "draft" }), facts({}), facts({ running: true })]) {
        expect(sourcedEmptyWords(f, searched, false).cta).toBeNull();
      }
    }
  });

  it("never names a provider", () => {
    for (const f of [null, facts({ spec: "none" }), facts({}), facts({ running: true })]) {
      expect(JSON.stringify(sourcedEmptyWords(f, true, true))).not.toMatch(/crust/i);
    }
  });
});

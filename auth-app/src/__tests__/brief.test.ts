import { describe, expect, it } from "vitest";
import { read, segment } from "../brief";

describe("brief.read", () => {
  it("recognises the facets in a real brief", () => {
    const m = read("Staff engineers who have scaled Postgres past 10TB, remote India");
    const byFacet = Object.fromEntries(m.map((x) => [x.facet, x.text.toLowerCase()]));
    // Plural included: the vocabulary is stored singular, the user typed
    // "engineers", and the span must cover what they actually wrote.
    expect(byFacet.seniority).toBe("staff engineers");
    expect(byFacet.skill).toBe("postgres");
    expect(byFacet.scale).toBe("10tb");
    // Two location terms match; the later one wins the key, both are present.
    expect(m.filter((x) => x.facet === "location").map((x) => x.text.toLowerCase()))
      .toEqual(["remote", "india"]);
  });

  it("prefers the longest term so one phrase makes one claim", () => {
    const m = read("Staff engineer");
    expect(m).toHaveLength(1);
    expect(m[0]!.text).toBe("Staff engineer");
  });

  it("covers a trailing plural rather than under-claiming the phrase", () => {
    expect(read("Staff engineers")[0]!.text).toBe("Staff engineers");
    expect(read("5 years")[0]!.text).toBe("5 years");
  });

  it("does not treat a plural as licence to guess at morphology", () => {
    // "engineering" is not "engineer" + s, so the term must not stretch to it.
    expect(read("Postgres engineering").some((x) => x.text === "engineering")).toBe(false);
  });

  it("never overlaps two matches", () => {
    const m = read("Senior staff engineer in Bangalore, India with Postgres and Go");
    for (let i = 1; i < m.length; i++) {
      expect(m[i]!.start).toBeGreaterThanOrEqual(m[i - 1]!.end);
    }
  });

  it("matches whole words only, so 'go' does not fire inside another word", () => {
    expect(read("Django experience").some((x) => x.text.toLowerCase() === "go")).toBe(false);
    expect(read("Go experience").some((x) => x.text.toLowerCase() === "go")).toBe(true);
  });

  it("recognises nothing in text it has no vocabulary for", () => {
    expect(read("someone lovely who vibes with the team")).toEqual([]);
  });

  it("is stable across repeated calls, so the /g patterns do not skip", () => {
    const q = "5 years and 10TB and 40 engineers";
    expect(read(q)).toEqual(read(q));
    expect(read(q).length).toBeGreaterThanOrEqual(3);
  });

  it("handles empty and whitespace input", () => {
    expect(read("")).toEqual([]);
    expect(read("   ")).toEqual([]);
  });
});

describe("brief.segment", () => {
  it("reconstructs the original text exactly", () => {
    const q = "Staff engineers who have scaled Postgres past 10TB, remote India";
    expect(segment(q).map((r) => r.text).join("")).toBe(q);
  });

  it("reconstructs text with no matches", () => {
    const q = "nothing here is known";
    expect(segment(q).map((r) => r.text).join("")).toBe(q);
    expect(segment(q).every((r) => !r.match)).toBe(true);
  });

  it("returns nothing for empty input", () => {
    expect(segment("")).toEqual([]);
  });
});

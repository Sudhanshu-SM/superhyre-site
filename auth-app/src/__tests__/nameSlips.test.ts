import { describe, expect, it } from "vitest";
import { editDistance, similarWord } from "../nameSlips";

/** The same rules as the server's (team-lookup.ts), so a task typed on Home and one given to the agent read a name alike. */
describe("names typed with a slip", () => {
  it("counts a swap of neighbours as one slip", () => {
    expect(editDistance("dev", "dve")).toBe(1);
    expect(editDistance("archi", "archie")).toBe(1);
  });
  it("fits by letters or by sound, and holds short names to the letter", () => {
    for (const [a, b] of [["dve", "dev"], ["roa", "rao"], ["archie", "archi"], ["mira", "meera"], ["shety", "shetty"], ["muller", "müller"]] as const) expect(similarWord(a, b), `${a}/${b}`).toBe(true);
    for (const [a, b] of [["dan", "dev"], ["rio", "rao"], ["al", "ali"]] as const) expect(similarWord(a, b), `${a}/${b}`).toBe(false);
  });
});

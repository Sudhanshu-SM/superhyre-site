import { describe, expect, it } from "vitest";
import { highlightRuns, slotsIn } from "../slots";

const on = (t: string) => Object.entries(slotsIn(t)).filter(([, h]) => h.on).map(([k]) => k).sort();

describe("slotsIn", () => {
  it("finds nothing in an empty brief", () => expect(on("")).toEqual([]));
  it("finds all five in a full brief", () =>
    expect(on("Senior backend engineers in Bangalore with Postgres and Go, 6+ years, from fintech startups"))
      .toEqual(["experience", "industry", "location", "role", "skills"]));
  it("finds a role on its own", () => expect(on("data scientists")).toEqual(["role"]));
  it("finds experience from years", () => expect(on("8+ years")).toEqual(["experience"]));
  it("finds a location", () => expect(on("remote in India")).toEqual(["location"]));
  it("finds an industry", () => expect(on("from Series B saas companies")).toContain("industry"));
});

describe("highlightRuns", () => {
  const hits = (t: string) => highlightRuns(t).filter((r) => r.hit).map((r) => r.text);
  it("reads titles, levels and abbreviations", () => {
    expect(hits("I want Senior Software Developer with 5 years of experience in Odisha"))
      .toEqual(["Senior Software Developer", "5 years of experience", "Odisha"]);
    expect(hits("SDE 2 or SDEs, 3-5 yrs")).toEqual(["SDE 2", "SDEs", "3-5 yrs"]);
  });
  it("forgives a typo in a long term", () =>
    expect(hits("5 years of Exoerience in Banglore")).toEqual(["5 years of Exoerience", "Banglore"]));
  it("leaves everyday words alone", () =>
    expect(hits("we will go to the rest of it, react and remove the sensor in a programme")).toEqual([]));
  it("keeps cased terms", () => expect(hits("React and Go devs in the US")).toEqual(["React", "Go devs", "US"]));
});

import { describe, expect, it } from "vitest";
import { detectBrief } from "../briefSignals";
import { ideaRows } from "../recs";

const found = (text: string) => Object.fromEntries(detectBrief(text).map((s) => [s.id, s.found]));

describe("what a brief says so far", () => {
  it("finds nothing in nothing, and the five items are always the same five", () => {
    const none = detectBrief("");
    expect(none.map((s) => s.label)).toEqual(["Location", "Job Title", "Years of Experience", "Industry", "Skills"]);
    expect(none.every((s) => s.found === null)).toBe(true);
  });

  it("finds a location, a job title, years, an industry and skills in plain words", () => {
    const f = found("Senior Go engineer in Pune with Kafka and Postgres, 5+ years, fintech");
    expect(f.location).toBe("Pune");
    expect(f.title).toMatch(/engineer/i);
    expect(f.years).toBe("5+ years");
    expect(f.industry).toBe("fintech");
    expect(f.skills).toContain("Kafka");
    expect(f.skills).toContain("Go");
  });

  it("calls a job title only when a role word is there, a place only when it is a known one", () => {
    // the owner's own sentence: a place and a title, no years, no industry, no skills
    expect(found("Find be Bangalore for Data analyst")).toMatchObject({
      location: "Bangalore", title: "analyst", years: null, industry: null, skills: null,
    });
    // "backend" alone is not a title; "Pune" alone is not a title either
    expect(found("backend in Pune").title).toBeNull();
    expect(found("Pune").title).toBeNull();
    expect(found("Pune").location).toBe("Pune");
    // not a place
    expect(found("find me somebody good with people").location).toBeNull();
    expect(found("Hello there, what can you do?")).toMatchObject({ location: null, title: null, years: null, industry: null, skills: null });
    // countries and remote
    expect(found("Product manager, remote").location).toBe("remote");
    expect(found("designer based in Germany").location).toBe("Germany");
  });

  it("reads years in the ways a person writes them", () => {
    expect(found("5 years").years).toBe("5 years");
    expect(found("5+ yrs").years).toBe("5+ years");
    expect(found("3-5 years of experience").years).toBe("3 to 5 years");
    expect(found("3 to 6 yrs").years).toBe("3 to 6 years");
    expect(found("senior engineer").years).toBeNull();
  });

  it("does not take the verb for the language", () => {
    expect(found("Go ahead and find people").skills).toBeNull();
    expect(found("we can go find them").skills).toBeNull();
    expect(found("Senior Go engineer").skills).toBe("Go");
  });

  it("reads a job description file's text the same way", () => {
    const f = found("Data Analyst, Bangalore. 3 to 5 years of experience with SQL, Python and Tableau. Healthcare analytics team.");
    expect(f).toMatchObject({ location: "Bangalore", years: "3 to 5 years", industry: "Healthcare" });
    expect(f.title).toMatch(/analyst/i);
    expect(f.skills).toMatch(/SQL/);
  });

  it("opens the filters at the group that holds each one", () => {
    expect(detectBrief("x").map((s) => s.category)).toEqual(["location", "role", "experience", "company", "skills"]);
  });
});

describe("the three suggestions under the composer", () => {
  it("are full sentences, general without a campaign and about it with one", () => {
    const general = ideaRows({ canCreate: true, hasCampaigns: true });
    expect(general).toHaveLength(3);
    expect(general.map((r) => r.label)).toEqual([
      "What needs my attention across my campaigns today?",
      "How are my agents doing, and who is waiting on me?",
      "Find people for a role: tell me the title, location and years of experience",
    ]);
    expect(general.map((r) => r.send)).toEqual([true, true, false]);
    const focus = ideaRows({ focusName: "Data Analyst", canCreate: true, hasCampaigns: true });
    expect(focus.every((r) => r.label.includes("Data Analyst"))).toBe(true);
    expect(focus[2]).toMatchObject({ send: false, prompt: "Find more people for Data Analyst" });
  });

  it("do not offer a search to someone who only follows the campaign, or a campaign to someone who cannot make one", () => {
    expect(ideaRows({ focusName: "Data Analyst", canCreate: false, hasCampaigns: true, mayChange: false })[2]?.label).toMatch(/Summarise the shortlist/);
    expect(ideaRows({ canCreate: false, hasCampaigns: false })).toHaveLength(1);
    expect(ideaRows({ canCreate: true, hasCampaigns: false })[0]?.label).toMatch(/set up a new campaign/);
  });
});

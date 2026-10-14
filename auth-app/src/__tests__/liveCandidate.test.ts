import { describe, expect, it, vi } from "vitest";
import type { Match, MatchProfile, RoleSpec } from "../api/agent";
import { candidateFromMatch, criteriaOf, jobsFrom, monthYear, reasonOf, setFromMatches, shortOf, spanLabel } from "../liveCandidate";
import { campaignOfCandidate, candidateById, clearSets, getSet, putSet, subscribe, updateCandidate } from "../liveCandidates";
import { trajectory } from "../sourcing";

const NOW = new Date("2026-10-06T00:00:00Z");

const spec: RoleSpec = {
  title: "Senior Android Engineer",
  locations: ["Bengaluru"],
  remoteOk: false,
  avoid: [],
  requirements: [
    { id: "r1", kind: "skill", text: "Kotlin in production", importance: "must", weight: 0.9, skill: "Kotlin" },
    { id: "r2", kind: "skill", text: "Jetpack Compose", importance: "nice", weight: 0.3, skill: "Jetpack Compose" },
    { id: "r3", kind: "location", text: "Based in Bengaluru", importance: "knockout", weight: 0 },
    { id: "r4", kind: "experience", text: "5+ years building consumer apps", importance: "must", weight: 0.6, minYears: 5 },
    { id: "r5", kind: "other", text: "Mentoring", importance: "nice", weight: 0.1 },
  ],
};

const match = (over: Partial<Match> = {}): Match => ({
  personId: "p1", fullName: "Asha Verma", headline: null, currentTitle: "Android Engineer", currentCompanyName: "Acko", city: "Bengaluru",
  linkedinUrl: null, profileImageUrl: null, yearsOfExperience: 6.4, source: "ours", stage: "judged", score: 0.9, tier: "A", knockedOut: null,
  judgement: {
    verdicts: [
      { requirementId: "r1", verdict: "met", evidence: "" },
      { requirementId: "r2", verdict: "partial", evidence: "" },
      { requirementId: "r4", verdict: "met", evidence: "" },
    ],
    strengths: ["Led a Compose migration", "Mentors juniors"],
    concerns: ["Short tenure"],
  },
  ...over,
});

describe("what a campaign ranks on", () => {
  it("takes the heaviest requirements first: knockouts, then musts by weight, then the rest", () => {
    expect(criteriaOf(spec).map((c) => c.id)).toEqual(["r3", "r1", "r4"]);
    expect(criteriaOf(null)).toEqual([]);
  });

  it("names a column from the skill or the first words", () => {
    expect(shortOf("Kotlin")).toBe("Kotlin");
    expect(shortOf("5+ years building consumer apps")).toBe("5+ years");
    expect(shortOf("Distributed systems engineering")).toBe("Distributed s…");
  });
});

describe("dates and spans", () => {
  it("formats a month and says how long", () => {
    expect(monthYear("2021-03-01")).toBe("Mar 2021");
    expect(monthYear(null)).toBeNull();
    expect(monthYear("nonsense")).toBeNull();
    expect(spanLabel(43)).toBe("3 yrs 7 mos");
    expect(spanLabel(12)).toBe("1 yr");
    expect(spanLabel(1)).toBe("1 mo");
    expect(spanLabel(0)).toBe("Under a month");
  });

  it("groups roles at one employer, newest first, and spans the whole stay", () => {
    const jobs = jobsFrom(
      [
        { title: "Staff Engineer", company: "Razorpay", description: "Ledger.", startDate: "2023-04-01", endDate: null, isCurrent: true },
        { title: "Senior Engineer", company: "Razorpay", description: null, startDate: "2020-08-01", endDate: "2023-04-01", isCurrent: false },
        { title: "", company: "", description: null, startDate: null, endDate: null, isCurrent: false },
        { title: "Engineer", company: "Flipkart", description: null, startDate: "2017-01-01", endDate: "2020-07-01", isCurrent: false },
      ],
      NOW,
    );
    expect(jobs.map((j) => [j.org.name, j.roles.length, j.span])).toEqual([["Razorpay", 2, "6 yrs 2 mos"], ["Flipkart", 1, "3 yrs 6 mos"]]);
    expect(jobs[0]?.roles[0]).toMatchObject({ title: "Staff Engineer", start: "Apr 2023", end: "Present", span: "3 yrs 6 mos", body: "Ledger." });
  });
});

describe("a match as a candidate", () => {
  const criteria = criteriaOf(spec);

  it("carries the fit against the campaign's criteria, in order", () => {
    const c = candidateFromMatch(match(), { criteria, now: NOW });
    expect(c.meets).toEqual([false, true, true]);
    expect(c).toMatchObject({ id: "p1", name: "Asha Verma", headline: "Android Engineer at Acko", totalYears: 6, highlights: ["Led a Compose migration", "Mentors juniors"] });
    expect(c.summary).toBe("Asha: Led a Compose migration. Mentors juniors.");
    expect(reasonOf(match())).toBe("Led a Compose migration");
    expect(reasonOf(match({ judgement: null }))).toBe("Android Engineer at Acko");
  });

  it("fills in history, schooling and skills once the profile has loaded, and the career strip can place it", () => {
    const profile: MatchProfile = {
      profile: {
        personId: "p1", fullName: "Asha Verma", headline: "Staff Engineer", summary: "Builds apps.", currentTitle: "Staff Engineer", currentCompanyName: "Acko",
        city: "Bengaluru", country: "India", locationText: null, yearsOfExperience: 6.4, linkedinUrl: null, completeness: "enriched",
        experiences: [{ title: "Staff Engineer", company: "Acko", description: null, startDate: "2022-01-01", endDate: null, isCurrent: true }],
        skills: ["Kotlin"],
      },
      education: [{ school: "IIT Bombay", degree: "B.Tech", startYear: 2014, endYear: 2018 }],
      profileImageUrl: null, stage: "judged", score: 0.9, tier: "A", judgement: null,
    };
    const c = candidateFromMatch(match(), { criteria, profile, now: NOW });
    expect(c).toMatchObject({ headline: "Staff Engineer", location: "Bengaluru, India", about: "Builds apps.", skills: { Skills: ["Kotlin"] } });
    expect(c.school.name).toBe("IIT Bombay");
    expect(c.jobs[0]?.roles[0]?.end).toBe("Present");
    expect(trajectory(c)).toHaveLength(1);
  });

  it("copes with a bare match: no jobs, no school, and the strip skips what has no dates", () => {
    const c = candidateFromMatch(match({ judgement: null, yearsOfExperience: null }), { criteria: [], now: NOW });
    expect(c).toMatchObject({ jobs: [], schools: [], summary: "", meets: [], totalYears: 0 });
    expect(trajectory({ ...c, jobs: [{ org: { name: "X", hue: "blue" }, span: "", roles: [{ title: "T", start: "", end: "Present", span: "" }] }] })).toEqual([]);
  });

  it("builds a set without the people the rules turned away", () => {
    const set = setFromMatches("c1", [match(), match({ personId: "p2", fullName: "Out Person", knockedOut: "Based in Pune" })], spec, NOW);
    expect(set).toMatchObject({ key: "c1", campaignId: "c1", total: 1 });
    expect(set.candidates.map((c) => c.id)).toEqual(["p1"]);
    expect(set.reasons).toEqual({ p1: "Led a Compose migration" });
  });
});

describe("the people the chat has shown", () => {
  it("keeps sets by campaign, finds a person in any, and lets a loaded profile replace them", () => {
    clearSets();
    const set = setFromMatches("c1", [match()], spec, NOW);
    putSet(set);
    expect(getSet("c1")?.total).toBe(1);
    expect(candidateById("p1")?.name).toBe("Asha Verma");
    expect(campaignOfCandidate("p1")).toBe("c1");
    expect(campaignOfCandidate("nobody")).toBeNull();
    updateCandidate({ ...set.candidates[0]!, about: "Full profile." });
    expect(candidateById("p1")?.about).toBe("Full profile.");
    clearSets();
    expect(candidateById("p1")).toBeUndefined();
  });
});

describe("registering the same people again", () => {
  it("does not wake anyone (a list that re-registers on every draw must not loop the console)", () => {
    clearSets();
    const woken = vi.fn();
    const stop = subscribe(woken);
    const set = setFromMatches("c1", [match()], spec, NOW);
    putSet(set);
    expect(woken).toHaveBeenCalledTimes(1);
    putSet({ ...set, candidates: [...set.candidates] });
    putSet(setFromMatches("c1", [match()], spec, NOW));
    expect(woken).toHaveBeenCalledTimes(1);
    putSet(setFromMatches("c1", [match({ fullName: "Someone Else" })], spec, NOW));
    expect(woken).toHaveBeenCalledTimes(2);
    stop();
    clearSets();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MatchProfile } from "../api/agent";
import { candidateFromCardPerson, candidateFromMatch } from "../liveCandidate";
import { matchFromProfile } from "../liveViews/compareLogic";
import { isSummaryOnly, withProfile } from "../profileLoad";

/**
 * The profile sheet shows the same person the same way wherever it was opened from: a row that only carries a summary
 * has its history, LinkedIn page and scoring panel read as soon as the sheet opens.
 */

const PERSON = "11111111-1111-4111-8111-111111111111";
const mp: MatchProfile = {
  profile: {
    personId: PERSON, fullName: "Harsh Joshi", headline: "Staff DevOps Engineer at Deloitte", summary: "Runs infrastructure at scale.",
    currentTitle: "Staff DevOps Engineer", currentCompanyName: "Deloitte", city: "Pune", country: "India", locationText: "Pune, India",
    yearsOfExperience: 13, linkedinUrl: "https://www.linkedin.com/in/harsh-joshi", completeness: "enriched",
    experiences: [
      { title: "Staff DevOps Engineer", company: "Deloitte", description: "Platform", startDate: "2020-01-01", endDate: null, isCurrent: true },
      { title: "DevOps Engineer", company: "Infosys", description: null, startDate: "2015-01-01", endDate: "2019-12-31", isCurrent: false },
    ],
    skills: ["Kubernetes", "Terraform"],
  },
  education: [{ school: "VJTI", degree: "B.Tech", startYear: 2008, endYear: 2012 }],
  profileImageUrl: null, stage: "judged", score: 0.97, tier: "A",
  judgement: { verdicts: [], strengths: ["Runs Kubernetes at scale"], concerns: [] },
};

describe("a person opened from a list, a card or a search result", () => {
  const row = candidateFromCardPerson({ personId: PERSON, candidateId: null, name: "Harsh Joshi", title: "Staff DevOps Engineer", company: "Deloitte", city: "Pune", years: 13, strengths: ["Runs Kubernetes at scale"], linkedinUrl: null })!;

  it("arrives as a summary, with no history and no LinkedIn page", () => {
    expect(isSummaryOnly(row)).toBe(true);
    expect(row.linkedinUrl).toBeUndefined();
  });

  it("gets the full profile laid over it: experience, education, skills, location, years and the LinkedIn page", () => {
    const full = candidateFromMatch({ ...matchFromProfile(PERSON, mp), fullName: "Harsh Joshi" }, { profile: mp, campaignId: "c1" });
    const merged = withProfile(row, full);
    expect(isSummaryOnly(merged)).toBe(false);
    expect(merged.jobs.map((j) => j.org.name)).toEqual(["Deloitte", "Infosys"]);
    expect(merged.schools[0]?.org.name).toBe("VJTI");
    expect(merged.skills).toEqual({ Skills: ["Kubernetes", "Terraform"] });
    expect(merged.linkedinUrl).toBe("https://www.linkedin.com/in/harsh-joshi");
    expect(merged.location).toBe("Pune, India");
    expect(merged.totalYears).toBe(13);
    // What the summary said about the fit stays.
    expect(merged.highlights).toEqual(row.highlights);
    expect(merged.name).toBe("Harsh Joshi");
  });

  it("takes the profile's scoring panel when it has one, and keeps the list's when it has none", () => {
    const withResult = { ...candidateFromMatch(matchFromProfile(PERSON, mp), { profile: mp, campaignId: "c1" }) };
    const base = { ...row, scored: false };
    const merged = withProfile(base, { ...withResult, result: { status: "scored" } as never });
    expect(merged.result).toMatchObject({ status: "scored" });
    expect(merged.scored).toBe(withResult.scored);
    const keep = withProfile({ ...base, result: { status: "insufficient_evidence" } as never }, { ...withResult, result: undefined as never });
    expect(keep.result).toMatchObject({ status: "insufficient_evidence" });
  });

  it("the sheet reads it on open, shows ghosts meanwhile, and offers LinkedIn as a labelled button and a Match tab", () => {
    const src = readFileSync(join(__dirname, "..", "ProfileSidebar.tsx"), "utf8");
    expect(src).toContain("useFullCandidate(summary, campaignId, careerTry)");
    expect(src).toContain('label="Loading the profile"');
    expect(src).toMatch(/className="ps-li"[\s\S]*LinkedIn/);
    expect(src).toContain('{ id: "match", label: "Match" }');
    expect(src).not.toContain('title="LinkedIn"');
  });
});

describe("the same sheet shows the match wherever a campaign is known", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("reads a workspace candidate's match on the campaign they are in, keyed by their person", () => {
    const load = src("profileLoad.ts");
    expect(load).toContain("detail.candidate.personId");
    expect(load).toContain("agentApi.matchProfile(cid, personId)");
    expect(load).toContain("campaignHint");
    // The board's sheet is opened with its campaign; the Candidates page's profile has its own Match section.
    expect(src("PersonSheet.tsx")).toContain("campaignId={campaignId}");
    expect(src("CampaignWorkspace.tsx")).toContain("campaignId={resolveCampaignId(ctx.campaignId)}");
    expect(src("Contacts.tsx")).toContain("<MatchSection candidateId={p.id}");
    // An override, a re-check or the history is keyed by the person, not by the candidate row.
    expect(src("MatchResult.tsx")).toContain("c.personId ?? c.id");
  });

  it("finds a person's campaign set before a chat card's set, so a search result is read from its match and not from the candidate row", async () => {
    const { putSet, setOfCandidate, campaignOfCandidate } = await import("../liveCandidates");
    const person = candidateFromCardPerson({ personId: PERSON, candidateId: null, name: "Harsh Joshi", title: null, company: null, city: null, years: null, strengths: [], linkedinUrl: null })!;
    putSet({ key: "card:abc", campaignId: "c1", candidates: [person], criteria: [], reasons: {}, total: 1 });
    putSet({ key: "c1", campaignId: "c1", candidates: [person], criteria: [], reasons: {}, total: 1 });
    expect(setOfCandidate(PERSON)?.key).toBe("c1");
    expect(campaignOfCandidate(PERSON)).toBe("c1");
    expect(src("Agent.tsx")).toContain("candidateById(profile.id)?.inWorkspace === true");
  });
});

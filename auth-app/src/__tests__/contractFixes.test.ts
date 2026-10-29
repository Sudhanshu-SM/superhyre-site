import { describe, expect, it } from "vitest";
import { editsFrom } from "../CampaignEdit";
import { blankDraft, draftProblems } from "../campaignDraft";
import type { CampaignRow } from "../campaignsData";
import { ideasFromCampaigns } from "../recs";

const fields = { name: "Data Engineer", target: "2", priority: "normal" as const, location: "Pune", visibility: "team" as const, ownerId: "u1" };

describe("editing a campaign's details", () => {
  it("sends only what changed", () => {
    expect(editsFrom(fields, { ...fields, name: " Senior Data Engineer ", target: "3" })).toEqual({
      body: { name: "Senior Data Engineer", target: 3 },
      problems: {},
    });
    expect(editsFrom(fields, fields).body).toEqual({});
    expect(editsFrom(fields, { ...fields, location: "" }).body).toEqual({ location: null });
    expect(editsFrom(fields, { ...fields, ownerId: "u2", visibility: "org" }).body).toEqual({ ownerId: "u2", visibility: "org" });
  });

  it("says what's wrong instead of sending it", () => {
    const { body, problems } = editsFrom(fields, { ...fields, name: "x", target: "0" });
    expect(body).toEqual({});
    expect(Object.keys(problems).sort()).toEqual(["name", "target"]);
  });
});

describe("landing ideas from real campaigns", () => {
  const row = (over: Partial<CampaignRow>): CampaignRow => ({
    id: "c1", name: "Data Engineer", department: "", location: "", status: "active", owner: "A", team: [],
    funnel: { sourced: 30, shortlisted: 6, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: Array.from({ length: 14 }, () => 1), target: 1, agents: [], updatedAgo: "", createdAgo: "", ...over,
  });

  it("offers each running campaign's next move, with its own numbers", () => {
    const ideas = ideasFromCampaigns([row({}), row({ id: "c2", name: "Closed one", status: "closed" })]);
    expect(ideas.map((i) => i.prompt)).toEqual(["Find more people for Data Engineer", "Summarise the shortlist for Data Engineer"]);
    expect(ideas[0]?.because).toBe("30 found so far, 6 shortlisted");
  });

  it("asks about drop-off once people were contacted, and offers nothing without campaigns", () => {
    const ideas = ideasFromCampaigns([row({ funnel: { sourced: 30, shortlisted: 6, contacted: 5, replied: 1, interviews: 0, hired: 0 } })]);
    expect(ideas[1]).toMatchObject({ prompt: "Where are we losing people on Data Engineer?", because: "1 of 5 contacted have replied" });
    expect(ideasFromCampaigns([])).toEqual([]);
  });
});

describe("starting a campaign without agents to pick", () => {
  it("doesn't ask for agents or channels where they aren't offered", () => {
    const d = { ...blankDraft("Asha"), name: "QA Lead", clientId: "cl1", workMode: "remote" as const, agents: [], channels: [] };
    expect(draftProblems(d).agents).toBeDefined();
    expect(draftProblems(d, undefined, { agents: false })).toEqual({});
  });
});

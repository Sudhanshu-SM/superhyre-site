import { describe, expect, it } from "vitest";
import { metaParts } from "../CampaignsPage";
import type { CampaignRow } from "../campaignsData";

const row = (over: Partial<CampaignRow>): CampaignRow => ({
  id: "c1", name: "Winspire TC", department: "", location: "Pune", status: "active", owner: "Ravi", team: [],
  funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: [], target: 1, agents: [],
  updatedAgo: "now", createdAgo: "now", ...over,
});

describe("what sits under a campaign's name", () => {
  it("shows the role it hires for and the company beside the name", () => {
    expect(metaParts(row({ roleTitle: "Technical Consultant", client: "Winspire" }))).toBe("Technical Consultant · Winspire · Pune");
  });
  it("does not say the role twice when it is the campaign's own name", () => {
    expect(metaParts(row({ name: "Technical Consultant", roleTitle: "technical consultant", client: "Winspire" }))).toBe("Winspire · Pune");
  });
  it("still reads without a role or a company", () => {
    expect(metaParts(row({}))).toBe("Pune");
  });
});

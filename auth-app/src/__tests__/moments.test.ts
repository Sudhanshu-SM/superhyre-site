import { describe, expect, it } from "vitest";
import { campaignIn, candidatesIn, classify, roleIn } from "../moments";

describe("classify", () => {
  const cases: Array<[string, string]> = [
    ["sourcing", "sourcing"],
    ["Reach out to the four I shortlisted. WhatsApp first if you can.", "outreach"],
    ["reach out to the shortlist", "outreach"],
    ["How is the SRE outreach going?", "status"],
    ["How are all my agents doing?", "status"],
    ["Also, have screening start phone screens for Platform SRE", "assign"],
    ["What has the outreach agent done on Backend this week?", "report"],
    ["Compare Priya and Anika", "compare"],
    ["Book Priya with Sudhanshu on Thursday", "schedule"],
    ["Where are we losing people?", "leak"],
    ["Anyone from past searches?", "rediscover"],
    ["Here are my call notes from the hiring manager", "intake"],
    ["Catch me up on overnight", "digest"],
    ["Reach out again on WhatsApp to everyone who hasn't replied", "outreach"],
    ["Draft answers to the 4 candidates waiting on me", "reply"],
  ];
  it.each(cases)("%s → %s", (said, kind) => expect(classify(said)).toBe(kind));
});

describe("extractors", () => {
  it("finds the campaign", () => {
    expect(campaignIn("how is the SRE outreach")).toBe("platform-sre");
    expect(campaignIn("backend please")).toBe("backend-snr");
    expect(campaignIn("anything")).toBeNull();
  });
  it("finds the role", () => {
    expect(roleIn("have screening start")).toBe("Screening");
    expect(roleIn("how is outreach")).toBe("Outreach");
  });
  it("finds candidates in order", () => {
    expect(candidatesIn("compare anika and priya")).toEqual(["anika-bose", "priya-nair"]);
  });
});

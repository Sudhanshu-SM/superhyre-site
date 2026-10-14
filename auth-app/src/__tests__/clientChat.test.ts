import { afterEach, describe, expect, it } from "vitest";
import { campaignBriefIn, campaignNameIn, newCampaignAnswers, parseContact, questionFor } from "../clarify";
import type { MomentCtx } from "../moments";
import { GUIDED, classify } from "../moments";
import { setSession } from "../roleStore";
import { CLIENT_SEED } from "../clients";
import { draftFromAnswers, parseRange } from "../ClientMoments";

const ctx = (answers: Record<string, string> = {}): MomentCtx => ({
  said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

afterEach(() => setSession({ role: "admin", name: "Punith S" }));

describe("classify: clients", () => {
  it.each([
    ["add a client", "client"],
    ["Add Acme Fintech as a client", "client"],
    ["new client", "client"],
    ["New client: Orbit Labs", "client"],
    ["onboard a new client", "client"],
    ["add Zeta Labs as a client for the backend campaign", "client"],
    ["the client wants Go experience", "reply"],
  ])("%s → %s", (said, kind) => expect(classify(said)).toBe(kind));

  it.each([
    ["create a campaign", "campaign-new"],
    ["Start a new campaign for Razorpay", "campaign-new"],
    ["new campaign", "campaign-new"],
    ["set up a hiring campaign called Staff Data Engineer", "campaign-new"],
    ["How is the backend campaign doing?", "campaign"],
    ["Create a screening form for the new campaign", "form"],
  ])("%s → %s", (said, kind) => expect(classify(said)).toBe(kind));

  it("treats both as guided flows", () => {
    expect(GUIDED.has("client") && GUIDED.has("campaign-new")).toBe(true);
  });
});

describe("the add-client flow", () => {
  it("asks the company's name, and nothing else: website, industry, contact and fee come later", () => {
    const ids: string[] = [];
    let a: Record<string, string> = {};
    for (let i = 0; i < 8; i++) {
      const q = questionFor("client", "add a client", ctx(a));
      if (!q) break;
      ids.push(q.id);
      const pick = q.input ? (q.id === "client-company" ? "Northwind Labs" : "") : q.options[0]!.id;
      a = { ...a, ...q.apply([pick]).answers };
    }
    expect(ids).toEqual(["client-company"]);
  });
  it("asks nothing when the message names the company", () => {
    expect(questionFor("client", "add Northwind Labs as a client", ctx())).toBeNull();
  });
  it("asks nothing for a company that is already a client", () => {
    expect(questionFor("client", "add Razorpay as a client", ctx())).toBeNull();
  });
  it("asks a recruiter nothing: the reply says only admins can", () => {
    setSession({ role: "recruiter", name: "Riya K" });
    expect(questionFor("client", "add a client", ctx())).toBeNull();
    expect(questionFor("campaign-new", "create a campaign", ctx())).toBeNull();
  });
  it("reads a name and email in either order", () => {
    expect(parseContact("Neha Kapoor, neha@acme.in")).toEqual({ name: "Neha Kapoor", email: "neha@acme.in" });
    expect(parseContact("neha@acme.in Neha")).toEqual({ name: "Neha", email: "neha@acme.in" });
    expect(parseContact("")).toEqual({ name: "", email: "" });
  });
});

describe("the new-campaign flow", () => {
  it("walks the key fields and ends", () => {
    const ids: string[] = [];
    let a: Record<string, string> = {};
    for (let i = 0; i < 14; i++) {
      const q = questionFor("campaign-new", "create a campaign", ctx(a));
      if (!q) break;
      ids.push(q.id);
      const pick = q.input ? (q.id === "nc-role" ? "Staff Data Engineer" : "") : q.options[0]!.id;
      a = { ...a, ...q.apply([pick]).answers };
    }
    expect(ids).toEqual(["nc-role", "nc-client", "nc-dept", "nc-mode", "nc-location", "nc-openings", "nc-comp", "nc-skills", "nc-agents"]);
  });
  it("takes the client from the message", () => {
    const q = questionFor("campaign-new", "start a new campaign for Razorpay", ctx({ role: "SRE" }));
    expect(q?.id).toBe("nc-dept");
    expect(campaignNameIn("start a campaign for Razorpay")).toBeNull();
    expect(campaignNameIn("set up a campaign called Staff Data Engineer")).toBe("Staff Data Engineer");
  });
  it("reads the role, the client and the city out of one sentence, not the whole sentence as the title", () => {
    const said = "create a new campaign called Data Analyst for the client Orchid Bank in Pune";
    // Orchid Bank is not one of the workspace's clients yet: said as the client, cut out of the title.
    expect(campaignBriefIn(said)).toEqual({ role: "Data Analyst", client: "Orchid Bank", city: "Pune" });
    expect(campaignNameIn(said)).toBe("Data Analyst");
    // A client we have is matched by name and by the words "for X".
    expect(campaignBriefIn("create a campaign called Data Analyst for Razorpay in Bengaluru")).toEqual({
      role: "Data Analyst", client: "Razorpay", city: "Bengaluru",
    });
    expect(campaignBriefIn("start a campaign called Staff Engineer in pune")).toEqual({
      role: "Staff Engineer", client: null, city: "Pune",
    });
    // What is only part of the role stays in it.
    expect(campaignBriefIn("make a campaign called Product Manager for Payments")).toMatchObject({
      role: "Product Manager for Payments", client: null,
    });
    expect(campaignBriefIn("set up a campaign called Lead in Data Science")).toMatchObject({
      role: "Lead in Data Science", city: null,
    });
  });
  it("pre-fills the role, the client and the city, so only what is missing is asked", () => {
    const said = "create a new campaign called Data Analyst for the client Razorpay in Pune";
    const a = newCampaignAnswers(said, {});
    expect(a).toMatchObject({ role: "Data Analyst", client: "cl-razorpay", location: "Pune" });
    const q = questionFor("campaign-new", said, ctx({}));
    // Not "What's the role?" and not "Who is it for?": the first thing left to ask is the team.
    expect(q?.id).toBe("nc-dept");
    const next = questionFor("campaign-new", said, ctx({ dept: "Engineering", mode: "hybrid" }));
    // The city was said, so the location question is skipped.
    expect(next?.id).toBe("nc-openings");
  });
  it("turns answers into a draft, prefilled from the client", () => {
    const d = draftFromAnswers({ role: "SRE", client: "cl-razorpay", dept: "Engineering", mode: "hybrid", location: "", openings: "2", comp: "30 to 45", skills: "Go, Kubernetes", agents: "Sourcing,Outreach" }, "Punith S", [...CLIENT_SEED]);
    expect(d).toMatchObject({ name: "SRE", clientId: "cl-razorpay", hiringManager: "Neha Kapoor", locations: ["Bengaluru"], openings: 2, compMin: "30", compMax: "45", mustHave: ["Go", "Kubernetes"], agents: ["Sourcing", "Outreach"] });
    expect(d.fee).toMatch(/18%/);
    expect(parseRange("40")).toEqual({ min: "40", max: "" });
  });
});

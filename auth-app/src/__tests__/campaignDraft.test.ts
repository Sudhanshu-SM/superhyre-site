import { describe, expect, it } from "vitest";
import { addTag, blankDraft, compLabel, draftProblems, prefillFromClient, rowFromDraft } from "../campaignDraft";
import { CLIENT_SEED } from "../clients";
import { TEAM } from "../campaignsData";

const today = new Date("2026-10-03T09:00:00");
const base = () => ({ ...blankDraft("Punith S"), name: "Staff SRE", locations: ["Bengaluru"] });

describe("draftProblems", () => {
  it("needs only a role to create a campaign, with no place and no agent asked for", () => {
    expect(draftProblems({ ...blankDraft("Punith S"), name: "SRE" }, today, { agents: false })).toEqual({});
    expect(draftProblems({ ...blankDraft("Punith S"), name: "SRE", locations: [] }, today, { agents: false })).toEqual({});
    expect(draftProblems(blankDraft("Punith S"), today).name).toBeTruthy();
  });
  it("asks for an agent only where agents are offered", () => {
    const p = draftProblems({ ...blankDraft("Punith S"), name: "SRE", agents: [] }, today);
    expect(Object.keys(p)).toEqual(["agents"]);
    expect(p.agents).not.toMatch(/draft/i);
  });
  it("checks ranges, dates and channels", () => {
    const p = draftProblems({ ...base(), compMin: "50", compMax: "30", expMin: "8", expMax: "3", targetDate: "2026-09-01", channels: [] }, today);
    expect(Object.keys(p).sort()).toEqual(["channels", "compMax", "expMax", "targetDate"]);
    expect(draftProblems({ ...base(), compMin: "abc" }, today).compMin).toBeTruthy();
    expect(draftProblems({ ...base(), workMode: "hybrid", officeDays: 6 }, today).officeDays).toBeTruthy();
  });
});

describe("prefillFromClient", () => {
  it("fills the hiring manager, fee and city", () => {
    const d = prefillFromClient(blankDraft("Punith S"), CLIENT_SEED.find((c) => c.id === "cl-zepto"));
    expect(d).toMatchObject({ clientId: "cl-zepto", hiringManager: "Ishita Bansal", fee: "18% of first-year CTC", locations: ["Mumbai"] });
  });
  it("keeps typed locations, and leaves the fee alone when terms aren't agreed", () => {
    const d = prefillFromClient({ ...blankDraft("Punith S"), locations: ["Pune"], fee: "12%" }, CLIENT_SEED.find((c) => c.id === "cl-groww"));
    expect(d.locations).toEqual(["Pune"]);
    expect(d.fee).toBe("12%");
  });
  it("clears client-owned fields when the client is removed", () => {
    expect(prefillFromClient({ ...base(), clientId: "x", hiringManager: "A", fee: "1%" }, undefined)).toMatchObject({ clientId: "", hiringManager: "", fee: "" });
  });
});

describe("rowFromDraft", () => {
  it("starts an active campaign with its agents and team", () => {
    const r = rowFromDraft({ ...base(), recruiters: ["Riya K", "Punith S"], openings: 2, compMin: "30", compMax: "45", mustHave: ["Go"] }, TEAM, 1);
    expect(r).toMatchObject({ status: "active", owner: "Punith S", team: ["Punith S", "Riya K"], target: 2, location: "Bengaluru", agents: ["Sourcing", "Outreach"] });
    expect(r.setup?.comp).toMatchObject({ min: 30, max: 45, currency: "INR" });
    expect(r.setup?.mustHave).toEqual(["Go"]);
  });
  it("is active the moment it exists: there is no draft to start", () => {
    const r = rowFromDraft(base(), TEAM);
    expect(r.status).toBe("active");
    expect(r.needs).toBeUndefined();
  });
});

describe("helpers", () => {
  it("adds tags once, split on commas", () => {
    expect(addTag(["Go"], "go, Rust ,  ,Kafka")).toEqual(["Go", "Rust", "Kafka"]);
  });
  it("labels pay", () => {
    expect(compLabel({ currency: "INR", min: 30, max: 45, shown: false })).toBe("₹30–45 LPA");
    expect(compLabel({ currency: "INR", min: 30, shown: false })).toBe("From ₹30 LPA");
    expect(compLabel(undefined)).toBe("");
  });
});

describe("a campaign without a place", () => {
  it("stays without one instead of turning remote", () => {
    const hybrid = rowFromDraft({ ...blankDraft("Punith S"), name: "Data Lead", workMode: "hybrid", locations: [] }, TEAM);
    expect(hybrid.location).toBe("");
    const remote = rowFromDraft({ ...blankDraft("Punith S"), name: "Data Lead", workMode: "remote", locations: [] }, TEAM);
    expect(remote.location).toBe("Remote");
  });
});

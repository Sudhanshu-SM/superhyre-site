import { describe, expect, it } from "vitest";
import { CLIENT_NEEDED, addTag, blankDraft, compLabel, draftProblems, prefillFromClient, rowFromDraft, withNewClient } from "../campaignDraft";
import { CLIENT_SEED } from "../clients";
import { TEAM } from "../campaignsData";

const today = new Date("2026-10-03T09:00:00");
/* Every campaign is for a client, so a draft that is meant to be fine has one. */
const base = () => ({ ...blankDraft("Punith S"), name: "Staff SRE", locations: ["Bengaluru"], clientId: "cl-zepto" });

describe("draftProblems", () => {
  it("needs only a role and its client to create a campaign, with no place and no agent asked for", () => {
    expect(draftProblems({ ...blankDraft("Punith S"), name: "SRE", clientId: "cl-zepto" }, today, { agents: false })).toEqual({});
    expect(draftProblems({ ...blankDraft("Punith S"), name: "SRE", clientId: "cl-zepto", locations: [] }, today, { agents: false })).toEqual({});
    expect(draftProblems(blankDraft("Punith S"), today).name).toBeTruthy();
  });
  it("needs the client the campaign is for: one picked, or a company named to be added with it (a draft with neither is stopped)", () => {
    const none = draftProblems({ ...blankDraft("Punith S"), name: "SRE" }, today, { agents: false });
    expect(none).toEqual({ clientId: CLIENT_NEEDED });
    expect(CLIENT_NEEDED).toBe("Pick the client this campaign is for, or add one.");
    expect(draftProblems({ ...blankDraft("Punith S"), name: "SRE", newClient: "Acme Fintech" }, today, { agents: false })).toEqual({});
    // Spaces are not a name.
    expect(draftProblems({ ...blankDraft("Punith S"), name: "SRE", newClient: "   " }, today, { agents: false })).toEqual({ clientId: CLIENT_NEEDED });
  });
  it("asks for an agent only where agents are offered", () => {
    const p = draftProblems({ ...base(), agents: [] }, today);
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
  it("drops a company that was only named once a client is picked instead", () => {
    const named = withNewClient(blankDraft("Punith S"), "Acme Fintech");
    expect(prefillFromClient(named, CLIENT_SEED.find((c) => c.id === "cl-zepto"))).toMatchObject({ clientId: "cl-zepto", newClient: "" });
  });
});

describe("withNewClient", () => {
  it("names the company for the campaign instead of a client, and takes the last client's contact and fee with it", () => {
    const picked = prefillFromClient(blankDraft("Punith S"), CLIENT_SEED.find((c) => c.id === "cl-zepto"));
    const named = withNewClient(picked, "  Acme Fintech ");
    expect(named).toMatchObject({ clientId: "", newClient: "Acme Fintech", hiringManager: "", fee: "" });
    expect(draftProblems({ ...named, name: "SRE" }, today, { agents: false })).toEqual({});
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
  it("carries the client it is for: the one picked, or the company named to be added with it, never both", () => {
    expect(rowFromDraft(base(), TEAM).setup).toMatchObject({ clientId: "cl-zepto" });
    expect(rowFromDraft(base(), TEAM).setup?.newClient).toBeUndefined();
    const named = rowFromDraft(withNewClient(base(), "Acme Fintech"), TEAM);
    expect(named.setup?.newClient).toBe("Acme Fintech");
    expect(named.setup?.clientId).toBeUndefined();
    // A picked client wins over a name left in the draft.
    const both = rowFromDraft({ ...base(), newClient: "Acme Fintech" }, TEAM);
    expect(both.setup?.clientId).toBe("cl-zepto");
    expect(both.setup?.newClient).toBeUndefined();
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

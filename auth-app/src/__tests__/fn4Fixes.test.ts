import { describe, expect, it } from "vitest";
import { blankDraft, prefillFromClient } from "../campaignDraft";
import type { CampaignRow } from "../campaignsData";
import { mayChangeCampaign } from "../campaignRights";
import { getClients, saveClient } from "../campaignStore";
import { NEW_CLIENT, campaignBriefIn, newCampaignAnswers, newCampaignQuestion, newClientOf } from "../clarify";
import { EMPTY_DRAFT, clientFromDraft } from "../clients";
import type { MomentCtx } from "../moments";
import { pickClient } from "../NewCampaign";
import { ideasFromCampaigns, liveIdeas } from "../recs";
import type { Session } from "../roleStore";
import { campaignDraftFor, liveCampaignAnswers } from "../liveViews/clientCampaign";

/**
 * Round 4, Y3: choosing "Add <name> as a new client" in the chat, adding a client inside the New campaign dialog,
 * and the "find more" chips an off-team recruiter is not offered.
 */

const ctx = (answers: Record<string, string> = {}): MomentCtx => ({
  said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

describe("choosing 'Add <name> as a new client' in the chat (Y3-1)", () => {
  const said = "Create a campaign called Data Analyst for the client Zorblax Studios in Pune";

  /** The questions answered one by one the way a person would: the first tile, or a typed word. */
  function answerAll(from: Record<string, string>): Record<string, string> {
    let answers = from;
    for (let guard = 0; guard < 20; guard++) {
      const q = newCampaignQuestion(said, ctx(answers));
      if (!q) return answers;
      const pick = q.input ? "" : q.options[0]!.id;
      answers = { ...answers, ...q.apply([pick]).answers };
    }
    throw new Error("the questions did not end");
  }

  it("keeps the company named from the start, so the card can name it and Create can add it", () => {
    // Not asked: the message named a company that is not a client yet, so it is the client to add.
    expect(newCampaignQuestion(said, ctx({}))?.id).not.toBe("nc-client");
    const a = newCampaignAnswers(said, {});
    expect(newClientOf(a)).toBe("Zorblax Studios");
    expect(a).toMatchObject({ role: "Data Analyst", location: "Pune", client: NEW_CLIENT, newClient: "Zorblax Studios" });
  });

  it("still names it at the end of every question, and the draft has no client of its own yet", () => {
    const final = answerAll({ client: NEW_CLIENT });
    const a = liveCampaignAnswers(said, final);
    expect(newClientOf(a)).toBe("Zorblax Studios");
    const d = campaignDraftFor(a, "Punith S", getClients().clients);
    expect(d.name).toBe("Data Analyst");
    // The company is added with the campaign, by the card's Create; the draft carries no id for it.
    expect(d.clientId).toBe("");
  });

  it("is nothing when another answer was chosen", () => {
    expect(newClientOf(newCampaignAnswers(said, { client: "cl-razorpay" }))).toBe("");
    expect(newClientOf(newCampaignAnswers(said, {}))).toBe("Zorblax Studios");
  });
});

describe("'... at <Company>' asks for the client the same way (Y3-7)", () => {
  it("takes the company after 'at' as the client, not as part of the role", () => {
    expect(campaignBriefIn("Set up a new campaign for a Backend Engineer at Zorblax Studios")).toEqual({
      role: "Backend Engineer", client: "Zorblax Studios", city: null,
    });
    expect(campaignBriefIn("Set up a campaign called Backend Engineer at Zorblax Studios in Pune")).toEqual({
      role: "Backend Engineer", client: "Zorblax Studios", city: "Pune",
    });
  });

  it("is the client to add, without being asked", () => {
    const said = "Set up a new campaign for a Backend Engineer at Zorblax Studios";
    expect(newCampaignQuestion(said, ctx({}))?.id).not.toBe("nc-client");
    expect(newCampaignAnswers(said, {})).toMatchObject({ role: "Backend Engineer", client: NEW_CLIENT, newClient: "Zorblax Studios" });
  });

  it("leaves what is only part of a role alone", () => {
    // Not capitalised, so not a company; and a city we know is a city.
    expect(campaignBriefIn("Set up a campaign called Engineer at scale")).toMatchObject({ role: "Engineer at scale", client: null });
    expect(campaignBriefIn("Set up a campaign called Analyst at Pune")).toMatchObject({ role: "Analyst", client: null, city: "Pune" });
  });
});

describe("a client added inside the New campaign dialog is the one picked (Y3-2)", () => {
  it("is found by the picker even though the dialog drew its list before the client existed", () => {
    // What the dialog held when "Add client" was pressed.
    const drawn = [...getClients().clients];
    const made = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: "Orchid Y3b Bank" }, "cl-y3b"));
    // The old lookup, in the list it had drawn: nothing, so the select fell back to asking for a client.
    expect(prefillFromClient(blankDraft("Riya"), drawn.find((c) => c.id === made.id)).clientId).toBe("");
    // The picker reads the store as it is now.
    const picked = pickClient(blankDraft("Riya"), made.id);
    expect(picked.clientId).toBe(made.id);
    // Whatever was typed into the form stays.
    expect(pickClient({ ...blankDraft("Riya"), name: "Platform Engineer Y3b" }, made.id).name).toBe("Platform Engineer Y3b");
  });

  it("clears the client for an empty pick, and leaves the draft alone for an id nobody knows", () => {
    const base = { ...blankDraft("Riya"), clientId: "cl-y3b", hiringManager: "Someone", fee: "18%" };
    expect(pickClient(base, "")).toMatchObject({ clientId: "", hiringManager: "", fee: "" });
    expect(pickClient(base, "cl-not-there")).toEqual(base);
  });
});

describe("the ideas an off-team recruiter is offered (Y3-6)", () => {
  const recruiter: Session = { role: "recruiter", standing: "recruiter", name: "Rec Two", userId: "u-rec2" };
  const row = (over: Partial<CampaignRow>): CampaignRow => ({
    id: "c", name: "Senior Data Engineer", department: "", location: "", status: "active", owner: "Owner", team: ["Owner"],
    ownerId: "u-owner", teamIds: ["u-owner"], visibility: "org",
    funnel: { sourced: 50, shortlisted: 8, contacted: 4, replied: 1, interviews: 0, hired: 0 },
    trend: Array.from({ length: 14 }, () => 1), target: 1, agents: [], updatedAgo: "", createdAgo: "", ...over,
  });
  const mine = row({ id: "mine", name: "Principal Machine Learning Engineer", ownerId: "u-rec2", teamIds: ["u-rec2"] });
  const theirs = row({ id: "theirs", name: "Senior Data Analyst" });
  const may = (r: CampaignRow) => mayChangeCampaign(recruiter, r);

  it("is 'find more' only for the campaigns they may change, and keeps the read-only ideas for all", () => {
    const ids = ideasFromCampaigns([mine, theirs], may).map((i) => i.id);
    expect(ids).toContain("more-mine");
    expect(ids).not.toContain("more-theirs");
    // Asking "where are we losing people" is a read: still offered for the one they only follow.
    expect(ids).toContain("lose-theirs");
  });

  it("holds through the live ideas, and offers everything when the rule is not given", () => {
    const prompts = liveIdeas([mine, theirs], { canCreate: false, mayChange: may }).map((i) => i.prompt);
    expect(prompts).toContain("Find more people for Principal Machine Learning Engineer");
    expect(prompts).not.toContain("Find more people for Senior Data Analyst");
    expect(ideasFromCampaigns([mine, theirs]).map((i) => i.id)).toEqual(
      expect.arrayContaining(["more-mine", "more-theirs"]),
    );
  });
});

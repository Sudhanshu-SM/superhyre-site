import { afterEach, describe, expect, it } from "vitest";
import { liveNotes } from "../agentCards/ApprovalCard";
import { deleteClient, getClients, resetClients } from "../campaignStore";
import { NEW_CLIENT, newCampaignAnswers, newCampaignQuestion, newClientOf } from "../clarify";
import { logLine } from "../api/campaigns";
import type { MomentCtx } from "../moments";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import type { RunEvent } from "../api/events";
import { failedTurnState } from "../LiveTurn";
import { draftFromAnswers } from "../ClientMoments";
import { liveCampaignAnswers } from "../liveViews/clientCampaign";
import { liveCampaignAsk } from "../liveViews/clientQuestions";

const ctx = (answers: Record<string, string> = {}): MomentCtx => ({
  said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

describe("a client the message names that is not in Clients yet (X3 D3)", () => {
  const said = "create a new campaign called Data Analyst for the client Orchid Bank in Pune";
  afterEach(() => { resetClients(); });
  /** A workspace with no client at all. */
  const noClients = () => { for (const c of getClients().clients) void deleteClient(c.id); };

  it("is kept, as a new client, and the campaign is still for it", () => {
    const a = newCampaignAnswers(said, {});
    expect(a).toMatchObject({ role: "Data Analyst", location: "Pune", newClient: "Orchid Bank", client: NEW_CLIENT });
  });

  it("stands when the person typed another company as the answer: the message's company does not take its place", () => {
    const a = newCampaignAnswers(said, { client: NEW_CLIENT, newClient: "Typed Co" });
    expect(a).toMatchObject({ client: NEW_CLIENT, newClient: "Typed Co" });
    expect(newClientOf(a)).toBe("Typed Co");
    // With no company typed, the message's is the one.
    expect(newClientOf(newCampaignAnswers(said, { client: NEW_CLIENT }))).toBe("Orchid Bank");
  });

  it("is not asked about: a company the message names that is not a client yet is added, by its name alone", () => {
    const q = newCampaignQuestion(said, ctx({}));
    expect(q?.id).toBe("nc-dept");
    expect(newClientOf(newCampaignAnswers(said, {}))).toBe("Orchid Bank");
  });

  it("is added even when there are no clients at all", () => {
    noClients();
    expect(liveCampaignAnswers(said, {}).client).toBe(NEW_CLIENT);
    const ask = liveCampaignAsk(() => ({ clients: [], rows: [] }));
    expect(ask("campaign-new", said, ctx({}))?.id).not.toBe("nc-client");
  });

  it("is asked for when nobody named one and there are no clients: the company's name is typed, never answered as no client", () => {
    noClients();
    const plain = "create a campaign called Data Analyst in Pune";
    expect(liveCampaignAnswers(plain, {}).client).toBeUndefined();
    const ask = liveCampaignAsk(() => ({ clients: [], rows: [] }));
    const q = ask("campaign-new", plain, ctx({}))!;
    expect(q.id).toBe("nc-client");
    expect(q.options).toEqual([]);
    expect(q.input?.placeholder).toBe("Company name");
    // What is typed is the company to add, by its name.
    expect(q.apply(["Orchid Bank"]).answers).toEqual({ client: NEW_CLIENT, newClient: "Orchid Bank" });
  });

  it("is added for a company that does not exist when other clients do", () => {
    const ask = liveCampaignAsk(() => ({ clients: [], rows: [] }));
    const text = "create a campaign called Data Analyst for the client Zenith Foods";
    expect(newCampaignAnswers(text, {})).toMatchObject({ client: NEW_CLIENT, newClient: "Zenith Foods" });
    expect(ask("campaign-new", text, ctx({}))?.id).not.toBe("nc-client");
  });

  it("makes a draft with no client id of its own: the company is named, and added when the campaign is created", () => {
    const d = draftFromAnswers({ role: "Data Analyst", client: NEW_CLIENT, newClient: "Orchid Bank", dept: "Data", mode: "onsite", location: "Pune", openings: "1" }, "Punith S", []);
    expect(d.clientId).toBe("");
    expect(d.newClient).toBe("Orchid Bank");
    expect(d.name).toBe("Data Analyst");
  });
});

describe("what the approval card says about Gmail (X3 S3)", () => {
  const server = ["Gmail isn't connected yet, so this won't go out until it is.", "It sends from your own address."];

  it("drops the note once Google is connected, and keeps the others", () => {
    expect(liveNotes(server, true)).toEqual(["It sends from your own address."]);
  });

  it("keeps it while Google is not connected", () => {
    expect(liveNotes(server, false)).toEqual(server);
    expect(liveNotes(["Google isn't connected yet, so this can't be made until it is."], true)).toEqual([]);
  });
});

describe("a chat turn the agent was too busy to take (X3-1)", () => {
  const now = Date.parse("2026-10-12T21:49:00.000Z");

  it("says so calmly, with the time, and offers Send again once it has passed", () => {
    const turn = { error: "The agent is busy right now, even after waiting for it.", errorCode: "unavailable", retryAt: now + 40_000 };
    expect(failedTurnState(turn, now)).toEqual({
      text: "The agent is busy right now, even after waiting for it. Try again in 40s.",
      canResend: false,
      canEdit: false,
      waitingUntil: now + 40_000,
    });
    expect(failedTurnState(turn, now + 41_000)).toMatchObject({ canResend: true, waitingUntil: null });
  });

  it("is still sendable at once when the failure named no time", () => {
    expect(failedTurnState({ error: "The agent couldn't answer this time. Try again.", errorCode: "unavailable", retryAt: null }, now).canResend).toBe(true);
  });
});

describe("people nobody could score (X1-2)", () => {
  const search = () => {
    const turn = { ...newTurn("t1", "start sourcing", 0), runId: "r1", status: "working" as const };
    const s: ChatState = { conversationId: "c1", turns: [turn], owners: { r1: "t1", s1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
    const at = (type: RunEvent["type"], payload: Record<string, unknown>, id: number): RunEvent => ({ ...payload, id, runId: "s1", seq: id, type, at: "2026-10-12T10:00:00.000Z" });
    // The search joins the turn, then says it could not score people, and what the button says.
    let state = applyEvent(s, { id: 1, runId: "r1", seq: 1, type: "plan", at: "2026-10-12T10:00:00.000Z", step: "sourcing", campaignId: "camp-1", searchRunId: "s1", size: 30 } as RunEvent);
    state = applyEvent(state, at("notice", {
      text: "The AI is busy, so these 30 people couldn't be scored just now. They're kept as found, and you can score them again.",
      rescore: { campaignId: "camp-1", people: 30, text: "Score the people found for Senior Backend Engineer again" },
    }, 2));
    return state.turns[0]?.searches[0];
  };

  it("keeps the action beside the note, so the screen can offer it", () => {
    const found = search();
    expect(found?.notices).toHaveLength(1);
    expect(found?.rescore).toEqual({ campaignId: "camp-1", people: 30, text: "Score the people found for Senior Backend Engineer again" });
  });
});

describe("a campaign handed to a new owner (X2-2)", () => {
  it("is a line in the campaign's history", () => {
    const line = logLine(
      { id: "a1", subjectKind: "campaign", subjectId: "c1", verb: "owner_changed", actorKind: "user", actorId: "u1", actorName: "Ada Admin", subjectName: "Android", data: { from: "u2", to: "u3" }, at: new Date().toISOString() } as never,
      "u9",
      () => undefined,
    );
    expect(line).toMatchObject({ actor: "Ada Admin", verb: "changed who owns the campaign" });
  });
});

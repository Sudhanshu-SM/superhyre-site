import { describe, expect, it } from "vitest";
import { liveNotes } from "../agentCards/ApprovalCard";
import { NEW_CLIENT, newCampaignAnswers, newCampaignQuestion } from "../clarify";
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

  it("is kept, as a new client, and not dropped to 'Internal hire'", () => {
    const a = newCampaignAnswers(said, {});
    expect(a).toMatchObject({ role: "Data Analyst", location: "Pune", newClient: "Orchid Bank" });
    expect(a.client).toBeUndefined();
  });

  it("is the first thing offered when the client is asked, by its name alone", () => {
    const q = newCampaignQuestion(said, ctx({}));
    expect(q?.id).toBe("nc-client");
    expect(q?.options[0]).toMatchObject({ id: NEW_CLIENT, label: "Add Orchid Bank as a new client" });
    expect(q?.options.at(-1)).toMatchObject({ id: "none", label: "No client" });
    // Choosing it is the answer, and the questions go on.
    expect(q?.apply([NEW_CLIENT]).answers).toEqual({ client: NEW_CLIENT });
    expect(newCampaignQuestion(said, ctx({ client: NEW_CLIENT }))?.id).toBe("nc-dept");
  });

  it("is asked even when there are no clients at all, with 'No client' beside it", () => {
    // Nothing to choose from is "no client" and nothing is asked: unless the message named a company.
    expect(liveCampaignAnswers(said, {}, []).client).toBeUndefined();
    expect(liveCampaignAnswers("create a campaign called Data Analyst in Pune", {}, []).client).toBe("none");
    const ask = liveCampaignAsk(() => ({ clients: [], rows: [] }));
    const q = ask("campaign-new", said, ctx({}));
    // Before this the question was skipped ("no client" was taken) and the card read "Internal hire".
    expect(q?.id).toBe("nc-client");
    expect(q?.options[0]).toMatchObject({ id: NEW_CLIENT, label: "Add Orchid Bank as a new client" });
    expect(q?.options.at(-1)?.id).toBe("none");
  });

  it("is offered for a company that does not exist when other clients do, ahead of them", () => {
    const ask = liveCampaignAsk(() => ({ clients: [], rows: [] }));
    const q = ask("campaign-new", "create a campaign called Data Analyst for the client Zenith Foods", ctx({}));
    expect(q?.id).toBe("nc-client");
    expect(q?.options[0]?.label).toBe("Add Zenith Foods as a new client");
    expect(q?.options.length).toBeGreaterThan(2);
    expect(q?.options.at(-1)?.label).toBe("No client");
  });

  it("makes a draft with no client of its own: the client is added when the campaign is created", () => {
    const d = draftFromAnswers({ role: "Data Analyst", client: NEW_CLIENT, dept: "Data", mode: "onsite", location: "Pune", openings: "1" }, "Punith S", []);
    expect(d.clientId).toBe("");
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

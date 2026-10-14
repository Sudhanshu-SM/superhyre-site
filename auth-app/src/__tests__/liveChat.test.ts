import { describe, expect, it } from "vitest";
import type { ConversationDetail } from "../api/agent";
import type { RunEvent } from "../api/events";
import { applyEvent, claim, fromDetail, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";

let nextId = 0;
/** Shaped like the server's stream: the event's own fields win over the payload's. */
const seqs: Record<string, number> = {};
const ev = (runId: string, type: RunEvent["type"], payload: Record<string, unknown> = {}, seq?: number): RunEvent => ({
  ...payload,
  id: ++nextId,
  runId,
  seq: seq ?? (seqs[runId] = (seqs[runId] ?? 0) + 1),
  type,
  at: "2026-10-04T10:00:05.000Z",
});

function chatWith(runId: string): ChatState {
  const turn = { ...newTurn("t1", "Find more people", Date.parse("2026-10-04T10:00:00.000Z")), runId, status: "working" as const };
  return { conversationId: "c1", turns: [turn], owners: { [runId]: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
}

const play = (s: ChatState, events: RunEvent[]) => events.reduce(applyEvent, s);

describe("live chat events", () => {
  it("streams words in, then settles on the final text and the time it took", () => {
    const s = play(chatWith("r1"), [
      ev("r1", "message", { delta: "Two people " }),
      ev("r1", "message", { delta: "stand out." }),
      ev("r1", "message", { text: "Two people stand out.", final: true }),
      ev("r1", "done"),
    ]);
    expect(s.turns[0]).toMatchObject({ reply: "Two people stand out.", status: "done" });
    expect(s.turns[0]?.finishedAt).toBe(Date.parse("2026-10-04T10:00:05.000Z"));
  });

  it("says a stopped turn was stopped, not that the agent couldn't answer", () => {
    const s = play(chatWith("r9"), [
      ev("r9", "error", { message: "Stopped." }),
      ev("r9", "error", { message: "The agent couldn't answer this time. Try again." }),
    ]);
    expect(s.turns[0]).toMatchObject({ status: "failed", error: "Stopped." });
  });

  it("records each tool once, from start to finish", () => {
    const s = play(chatWith("r1"), [
      ev("r1", "progress", { step: "tool", tool: "campaign_matches", status: "running" }),
      ev("r1", "progress", { step: "tool", tool: "campaign_matches", status: "done" }),
    ]);
    expect(s.turns[0]?.steps).toEqual([{ tool: "campaign_matches", status: "done" }]);
  });

  it("keeps a search's early events until the message that started it claims the run", () => {
    let s = play(chatWith("r1"), [
      ev("s1", "progress", { step: "pool", found: 12 }),
      ev("s1", "artifact", { items: [{ personId: "p1", fullName: "Asha Verma" }] }),
    ]);
    expect(s.orphans.s1).toHaveLength(2);
    s = applyEvent(s, ev("r1", "plan", { step: "sourcing", searchRunId: "s1", campaignId: "cmp", size: 20 }));
    expect(s.orphans.s1).toBeUndefined();
    expect(s.turns[0]?.searches[0]).toMatchObject({ runId: "s1", size: 20, pool: 12, status: "running" });
    expect(s.turns[0]?.searches[0]?.items?.map((p) => p.fullName)).toEqual(["Asha Verma"]);
    s = applyEvent(s, ev("s1", "done"));
    expect(s.turns[0]?.searches[0]?.status).toBe("done");
  });

  it("closes an approval with its outcome, and follows the search an approval started", () => {
    let s = applyEvent(
      chatWith("r1"),
      ev("r1", "approval", { action: { action: "find_people", campaignId: "cmp" }, summary: "Find more people for Data Engineer" }, 4),
    );
    expect(s.turns[0]?.approvals[0]).toMatchObject({ seq: 4, action: "find_people", decided: null });
    s = applyEvent(s, ev("r1", "result", { approvalSeq: 4, decision: "approve", action: "find_people", campaignId: "cmp", searchRunId: "s2", size: 10 }));
    expect(s.turns[0]?.approvals[0]?.decided?.decision).toBe("approve");
    expect(s.turns[0]?.searches.map((x) => [x.runId, x.size])).toEqual([["s2", 10]]);
  });

  it("applies each event once, however often it arrives", () => {
    const delta = ev("r1", "message", { delta: "Hi " });
    const notice = ev("r1", "notice", { text: "Crustdata isn't connected yet." });
    const s = play(chatWith("r1"), [delta, notice, delta, notice]);
    expect(s.turns[0]).toMatchObject({ reply: "Hi ", notices: ["Crustdata isn't connected yet."] });
  });

  it("shows a failed turn with the reason", () => {
    const s = applyEvent(chatWith("r1"), ev("r1", "error", { message: "The agent is at capacity right now." }));
    expect(s.turns[0]).toMatchObject({ status: "failed", error: "The agent is at capacity right now." });
  });

  it("claiming a run twice doesn't add the search twice", () => {
    const s = claim(claim(chatWith("r1"), "s1", "t1", { campaignId: "cmp", size: 5 }), "s1", "t1", { campaignId: "cmp", size: 5 });
    expect(s.turns[0]?.searches).toHaveLength(1);
  });
});

describe("reopening a chat", () => {
  it("rebuilds one turn per message the recruiter sent, ready for its events", () => {
    const detail: ConversationDetail = {
      conversation: { id: "c1", title: "Hi", focusCampaignId: null, updatedAt: "2026-10-04T10:00:00Z" },
      messages: [
        { id: "m1", seq: 1, role: "user", text: "Hi", clientId: "k1", runId: "r1", campaignIds: [], createdAt: "2026-10-04T10:00:00Z" },
        { id: "m2", seq: 2, role: "assistant", text: "Hello.", clientId: null, runId: "r1", campaignIds: [], createdAt: "2026-10-04T10:00:02Z" },
      ],
      runs: [],
      eventCursor: 9,
    };
    const s = fromDetail(detail);
    expect(s.turns.map((t) => [t.key, t.said, t.runId])).toEqual([["k1", "Hi", "r1"]]);
    expect(s.owners).toEqual({ r1: "k1" });
  });
});

describe("a person's line in search results", () => {
  it("joins what is known and never starts with a separator", async () => {
    const { metaOf } = await import("../LiveTurn");
    expect(metaOf({ currentTitle: "Staff Engineer", currentCompanyName: "PhonePe", city: "Bengaluru", tier: "B" })).toBe(
      "Staff Engineer at PhonePe, Bengaluru · Good fit",
    );
    expect(metaOf({ currentTitle: null, currentCompanyName: null, city: null, tier: "C" })).toBe("Partial fit");
  });
});

describe("the thought line", () => {
  it("says a long run in minutes, not as a number of seconds nobody counts", async () => {
    const { thoughtLabel } = await import("../LiveTurn");
    expect(thoughtLabel(2_400)).toBe("Thought for 2.4s");
    expect(thoughtLabel(48_200)).toBe("Thought for 48s");
    expect(thoughtLabel(125_000)).toBe("Thought for 2m 5s");
    expect(thoughtLabel(-5)).toBe("Thought for 0.0s");
  });
});

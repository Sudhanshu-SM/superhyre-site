import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "../api/agent";
import type { RunEvent } from "../api/events";

/**
 * A yes that does not go through leaves the card in a state a person can act on: working, then (whatever
 * happened: a refusal, a dropped connection, nothing at all) the reason in words, "Try again", and no line of the
 * run still turning. A later yes that works replaces the failure. Driven through the chat store the way the page
 * drives it: the stream brings the card, the click asks the server, the reply or its absence settles it.
 */

const { server, follows, connections } = vi.hoisted(() => ({
  server: {
    decide: async (_run: string, _seq: number, _d: "approve" | "decline"): Promise<Record<string, unknown>> => ({}),
    calls: [] as Array<{ run: string; seq: number; decision: string }>,
  },
  follows: [] as Array<{ on: (e: unknown) => void }>,
  connections: { reloaded: 0 },
}));

vi.mock("../api/agent", () => ({
  agentApi: {
    conversation: async (id: string) => ({
      conversation: { id, title: "t", campaignId: null, focusCampaignId: null, createdAt: "2026-10-15T10:00:00Z", updatedAt: "2026-10-15T10:00:00Z" },
      messages: [{ id: "m1", role: "user", text: "Send me a test email", runId: "run-1", clientId: "k1", createdAt: "2026-10-15T10:00:00Z" }],
      eventCursor: 0,
    } as unknown as ConversationDetail),
    createConversation: async () => ({ id: "c1" }),
    send: async () => ({ runId: "run-1" }),
    cancel: async () => ({}),
    findMore: async () => ({ runId: "x", size: 1 }),
    decide: (run: string, seq: number, decision: "approve" | "decline") => {
      server.calls.push({ run, seq, decision });
      return server.decide(run, seq, decision);
    },
  },
}));
vi.mock("../api/events", () => ({
  follow: (_target: unknown, _after: number, on: (e: unknown) => void) => {
    follows.push({ on });
    return () => undefined;
  },
}));
vi.mock("../connectionsStore", () => ({
  ensureConnections: async () => { connections.reloaded += 1; },
}));

const chat = await import("../liveChat");
const { ApiError } = await import("../api/client");

let n = 0;
/* As the stream brings it: a phase line keeps the id it carries (runEventOf), anything else is numbered. */
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: typeof payload.id === "string" ? payload.id : n + 1, runId: "run-1", seq: ++n, type, at: "2026-10-15T10:00:00.000Z",
});
const feed = (e: RunEvent) => follows[0]?.on(e);

/** The page's state after the stream brought a test email's card (and the line its yes would run). */
async function withCard(): Promise<{ key: string; seq: number }> {
  await chat.openChat("c1");
  feed(ev("approval", {
    action: { action: "send_test_email" },
    summary: 'Send a test email from ana@gmail.com to ana@hirewell.in: "Test email from SuperHyre"',
    campaignName: null, people: [], capability: "connections.test_email",
    emails: [{ to: "ana@hirewell.in", subject: "Test email from SuperHyre", body: "This is a test." }],
  }));
  const turn = chat.chatNow().turns[0];
  const a = turn?.approvals[0];
  if (!turn || !a) throw new Error("no card");
  return { key: turn.key, seq: a.seq };
}

const card = () => chat.chatNow().turns[0]?.approvals[0];

beforeEach(() => {
  chat.newChat();
  follows.length = 0;
  server.calls.length = 0;
  connections.reloaded = 0;
  n = 0;
});
afterEach(() => { vi.useRealTimers(); });

const SWITCHED_OFF =
  "Gmail isn't switched on for the Google project this app signs in with yet. Someone with access to that Google Cloud project has to enable the Gmail API there, then try again.";
const PAGE = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";

describe("a yes that is refused", () => {
  it("leaves 'Sending…' at once, says why with where the fix is, and stops the line the yes was running", async () => {
    const { key, seq } = await withCard();
    // The run said it was preparing the send; the refusal comes back before the stream says it failed.
    feed(ev("progress", { step: "phase", id: `approval:${seq}`, phase: "write", state: "running", label: "Preparing the test email" }));
    expect(chat.chatNow().turns[0]?.phases.map((l) => l.state)).toEqual(["running"]);

    server.decide = async () => {
      throw new ApiError(503, "unavailable", SWITCHED_OFF, { code: "unavailable", reason: "google_api_disabled", help: PAGE, message: SWITCHED_OFF });
    };
    const asked = chat.decide(key, seq, "approve");
    // Working while the request is out.
    expect(card()).toMatchObject({ deciding: true, error: null });
    await asked;

    expect(card()).toMatchObject({ deciding: false, decided: null, error: SWITCHED_OFF, help: PAGE, reason: "google_api_disabled" });
    expect(chat.chatNow().turns[0]?.phases).toEqual([
      expect.objectContaining({ id: `approval:${seq}`, state: "failed", label: SWITCHED_OFF }),
    ]);
    // Switching on an API is not a connection: nothing is read again for it.
    expect(connections.reloaded).toBe(0);
  });

  it("reads what is connected again when the refusal is about the connection", async () => {
    const { key, seq } = await withCard();
    server.decide = async () => {
      throw new ApiError(503, "unavailable", "Gmail needs to be reconnected. Connect it below, then approve again.", { connect: "gmail", reason: "google_reconnect" });
    };
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, reason: "google_reconnect" });
    expect(connections.reloaded).toBe(1);
  });

  it("says a dropped connection in words and offers the same card again", async () => {
    const { key, seq } = await withCard();
    server.decide = async () => { throw new ApiError(0, "network", "Can't reach SuperHyre. Check your connection and try again."); };
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, decided: null, error: "Can't reach SuperHyre. Check your connection and try again.", reason: "network" });
  });

  it("settles on a plain sentence for any other failure, never on working", async () => {
    const { key, seq } = await withCard();
    server.decide = async () => { throw new TypeError("x is not a function"); };
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, error: "That didn't go through. Try again." });
  });

  it("stops waiting when no answer comes at all, and says it may still have gone through", async () => {
    vi.useFakeTimers();
    const { key, seq } = await withCard();
    server.decide = () => new Promise(() => undefined);
    const asked = chat.decide(key, seq, "approve");
    expect(card()?.deciding).toBe(true);
    await vi.advanceTimersByTimeAsync(chat.DECISION_LIMIT_MS + 1);
    await asked;
    expect(card()).toMatchObject({ deciding: false, error: chat.NO_ANSWER, reason: "no_answer" });
  });

  it("asks the server once however often it is clicked, and not at all when it is already answered", async () => {
    const { key, seq } = await withCard();
    let finish: (v: Record<string, unknown>) => void = () => undefined;
    server.decide = () => new Promise((r) => { finish = r; });
    const first = chat.decide(key, seq, "approve");
    void chat.decide(key, seq, "approve");
    void chat.decide(key, seq, "decline");
    expect(server.calls).toHaveLength(1);
    finish({ approvalSeq: seq, decision: "approve", action: "send_test_email", summary: "Test email sent to ana@hirewell.in." });
    await first;
    await chat.decide(key, seq, "approve");
    expect(server.calls).toHaveLength(1);
  });
});

describe("a later yes replaces the failure", () => {
  it("settles the card on the reply itself, without waiting for the stream", async () => {
    const { key, seq } = await withCard();
    server.decide = async () => { throw new ApiError(503, "unavailable", SWITCHED_OFF, { reason: "google_api_disabled", help: PAGE }); };
    await chat.decide(key, seq, "approve");
    expect(card()?.error).toBe(SWITCHED_OFF);

    server.decide = async () => ({ approvalSeq: seq, decision: "approve", action: "send_test_email", summary: "Test email sent to ana@hirewell.in.", counts: { sent: 1 } });
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, error: null, help: null, reason: null });
    expect(card()?.decided).toMatchObject({ decision: "approve", outcome: { summary: "Test email sent to ana@hirewell.in." } });

    // The stream's own `result` arrives after: the same card, the same answer.
    feed(ev("result", { approvalSeq: seq, decision: "approve", action: "send_test_email", summary: "Test email sent to ana@hirewell.in." }));
    expect(card()?.decided?.decision).toBe("approve");
  });

  it("settles a no the same way", async () => {
    const { key, seq } = await withCard();
    server.decide = async () => ({ approvalSeq: seq, decision: "decline", declined: true, summary: "Not done." });
    await chat.decide(key, seq, "decline");
    expect(card()?.decided).toMatchObject({ decision: "decline" });
  });
});

describe("the lines of a yes that failed", () => {
  it("ends only that card's own lines that were running, and leaves every other line alone", () => {
    const lines = [
      { id: "think:1", phase: "decide", state: "running" as const, label: "Thinking it through", seq: 1 },
      { id: "approval:7", phase: "write", state: "running" as const, label: "Preparing the test email", seq: 2 },
      { id: "approval:7:draft", phase: "write", state: "running" as const, label: "Writing", seq: 3 },
      { id: "approval:8", phase: "write", state: "running" as const, label: "Posting", seq: 4 },
      { id: "approval:7:done", phase: "write", state: "done" as const, label: "Wrote", seq: 5 },
    ];
    const out = chat.failApprovalLines(lines, 7, "Gmail is busy.");
    expect(out.map((l) => [l.id, l.state])).toEqual([
      ["think:1", "running"], ["approval:7", "failed"], ["approval:7:draft", "failed"], ["approval:8", "running"], ["approval:7:done", "done"],
    ]);
    expect(out[1]?.label).toBe("Gmail is busy.");
    expect(out[2]?.label).toBe("Writing");
    // Nothing running of its own: the same lines, untouched.
    expect(chat.failApprovalLines(lines, 9, "x")).toBe(lines);
  });
});

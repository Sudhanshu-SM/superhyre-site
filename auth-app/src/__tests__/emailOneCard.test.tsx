import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "../api/agent";
import type { RunEvent } from "../api/events";
import type { Approval } from "../liveChat";

/**
 * One approval card is the whole outcome of an email. A yes settles it where it was given: how many went, who did
 * not and why in one line each, Try again on the card itself. Approving adds nothing to the chat (no message, no
 * outcome card, no second approval), Try again runs the same approval again and the same card's answer changes, and a
 * chat that is reopened replays to the same card. Driven through the chat store the way the page drives it.
 */

const { server, follows } = vi.hoisted(() => ({
  server: {
    decide: async (_run: string, _seq: number, _d: "approve" | "decline", _attempt?: number): Promise<Record<string, unknown>> => ({}),
    calls: [] as Array<{ run: string; seq: number; decision: string; attempt?: number }>,
    sent: [] as string[],
  },
  follows: [] as Array<{ on: (e: unknown) => void }>,
}));

vi.mock("../api/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/agent")>()),
  agentApi: {
    conversation: async (id: string) => ({
      conversation: { id, title: "t", campaignId: null, focusCampaignId: null, createdAt: "2026-10-15T10:00:00Z", updatedAt: "2026-10-15T10:00:00Z" },
      messages: [{ id: "m1", role: "user", text: "Email the top 3", runId: "run-1", clientId: "k1", createdAt: "2026-10-15T10:00:00Z" }],
      eventCursor: 0,
    } as unknown as ConversationDetail),
    createConversation: async () => ({ id: "c1" }),
    send: async (_id: string, body: { text: string }) => { server.sent.push(body.text); return { runId: "run-2" }; },
    cancel: async () => ({}),
    findMore: async () => ({ runId: "x", size: 1 }),
    decide: (run: string, seq: number, decision: "approve" | "decline", attempt?: number) => {
      server.calls.push({ run, seq, decision, ...(attempt === undefined ? {} : { attempt }) });
      return server.decide(run, seq, decision, attempt);
    },
  },
}));
vi.mock("../api/events", () => ({
  follow: (_target: unknown, _after: number, on: (e: unknown) => void) => {
    follows.push({ on });
    return () => undefined;
  },
}));
vi.mock("../connectionsStore", async (importOriginal) => {
  const real = await importOriginal<typeof import("../connectionsStore")>();
  return { ...real, ensureConnections: async () => undefined };
});
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message };
});

const chat = await import("../liveChat");
const { ApprovalCard } = await import("../agentCards/ApprovalCard");
const { outcomeModel } = await import("../agentCards/outcome");
const { liveNotes } = await import("../agentCards/ApprovalCard");
const store = await import("../connectionsStore");

let n = 0;
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: n + 1, runId: "run-1", seq: ++n, type, at: "2026-10-15T10:00:00.000Z",
});
const feed = (e: RunEvent) => follows[0]?.on(e);
const html = (el: JSX.Element) => renderToStaticMarkup(el);
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const CAMPAIGN = "c0000000-0000-4000-8000-000000000001";
const OUTREACH = `#/campaign/outreach?campaign=${CAMPAIGN}`;

/** What the server stores on the card's answer for an email: counted from the messages. */
const answer = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  approvalSeq: 1, decision: "approve", action: "send_email", capability: "outreach.send_email", campaignId: CAMPAIGN, attempt: 1,
  summary: "Sent 2 emails from ana@x.com: Dev, Fay. The email to Eli didn't go: Gmail rejected this message.",
  headline: "Sent 2 of 3 from ana@x.com. 1 didn't go.",
  counts: { total: 3, sent: 2, waiting: 0, failed: 1, held: 0 },
  failures: [{ names: ["Eli Fernandes"], reason: "Gmail rejected this message.", retry: true }],
  again: true, settled: true, reconnect: false, messageIds: ["m1", "m2", "m3"],
  next: [{ label: "See it in Outreach", href: OUTREACH }],
  ...over,
});

async function withCard(): Promise<{ key: string; seq: number }> {
  await chat.openChat("c1");
  feed(ev("approval", {
    action: { action: "send_email", campaignId: CAMPAIGN, messageIds: ["m1", "m2", "m3"] },
    summary: "Email Dev Menon", campaignName: "Senior Backend", people: [], capability: "outreach.send_email",
    emails: [
      { to: "Dev Menon", subject: "A role", body: "Hi Dev" }, { to: "Eli Fernandes", subject: "A role", body: "Hi Eli" },
      { to: "Fay Gupta", subject: "A role", body: "Hi Fay" },
    ],
  }));
  const turn = chat.chatNow().turns[0];
  const a = turn?.approvals[0];
  if (!turn || !a) throw new Error("no card");
  return { key: turn.key, seq: a.seq };
}
const turn = () => chat.chatNow().turns[0];
const card = () => turn()?.approvals[0];
const draw = (a: Approval) => html(<ApprovalCard turnKey="t" approval={a} turnSaid="Email the top 3" />);

beforeEach(() => {
  chat.newChat();
  follows.length = 0;
  server.calls.length = 0;
  server.sent.length = 0;
  store.resetConnections();
  n = 0;
});
afterEach(() => vi.useRealTimers());

describe("approving settles the card where it was approved", () => {
  it("turns the card into its counted answer and adds nothing to the chat", async () => {
    const { key, seq } = await withCard();
    server.decide = async () => answer({ approvalSeq: seq, counts: { total: 3, sent: 0, waiting: 3, failed: 0, held: 0 }, headline: "Sending 3 emails from ana@x.com.", failures: [], again: false, settled: false });
    await chat.decide(key, seq, "approve");
    expect(card()?.decided).toMatchObject({ decision: "approve", outcome: { counts: { waiting: 3 } } });
    // One approval, no cards of any kind, no further message: the card is the whole outcome.
    expect(turn()?.approvals).toHaveLength(1);
    expect(turn()?.cards).toEqual([]);
    expect(chat.chatNow().turns).toHaveLength(1);
    expect(server.sent).toEqual([]);
  });

  it("shows how many went, who did not and why, and Try again on the card; the only step beside it is a page to open", () => {
    const a = { ...cardOf(), decided: { decision: "approve" as const, outcome: answer() } };
    const out = draw(a);
    expect(text(out)).toContain("Sent 2 of 3 from ana@x.com. 1 didn't go.");
    expect(text(out)).toContain("Eli Fernandes Gmail rejected this message.");
    expect(out).toContain(">Try again</button>");
    // See it in Outreach is a link, not a message to the agent; nothing in the card asks the chat to do it again.
    expect(out).toContain(`href="${OUTREACH}"`);
    expect(text(out)).not.toContain("Send the failed emails again");
    expect(out).not.toContain("Connect Gmail");
    // The words are one sentence, not the long agent-facing one with every name.
    expect(text(out)).not.toContain("Sent 2 emails from ana@x.com: Dev, Fay.");
    expect(outcomeModel(a)?.next.every((s) => s.href)).toBe(true);
  });

  it("says plainly that some are still going out, and offers no Try again until something failed", () => {
    const going = { ...cardOf(), decided: { decision: "approve" as const, outcome: answer({
      headline: "Sent 1 of 3 from ana@x.com. 2 going out now.", counts: { total: 3, sent: 1, waiting: 2, failed: 0, held: 0 },
      failures: [], again: false, settled: false,
    }) } };
    const out = draw(going);
    expect(text(out)).toContain("Sent 1 of 3 from ana@x.com. 2 going out now.");
    expect(out).not.toContain("Try again");
    expect(text(out)).toContain("Sending 2 of 3, one at a time");
  });

  it("is red only when nothing went", () => {
    const none = { ...cardOf(), decided: { decision: "approve" as const, outcome: answer({
      headline: "None of the 3 went out.", counts: { total: 3, sent: 0, waiting: 0, failed: 3, held: 0 },
      failures: [{ names: ["Dev Menon", "Eli Fernandes", "Fay Gupta"], reason: "Gmail rejected this message.", retry: true }],
    }) } };
    expect(outcomeModel(none)?.tone).toBe("failed");
    expect(text(draw(none))).toContain("Dev Menon, Eli Fernandes and Fay Gupta Gmail rejected this message.");
    expect(outcomeModel({ ...cardOf(), decided: { decision: "approve", outcome: answer() } })?.tone).toBe("done");
  });
});

describe("the card that waits for the yes says the number once", () => {
  const notes = [
    "You asked for 5; 3 are ready.",
    "Left out: 2 have no email yet (Bo Nair, Cy Rao).",
    "Gmail needs to be reconnected, so this won't go out until it is.",
  ];
  it("shows what they asked for and who was left out, each line once, in the card", () => {
    const waiting: Approval = {
      ...cardOf(), notes, emails: [{ to: "Dev Menon", subject: "A role", body: "Hi Dev" }, { to: "Fay Gupta", subject: "A role", body: "Hi Fay" }, { to: "Gil Rao", subject: "A role", body: "Hi Gil" }],
    };
    const out = text(draw(waiting));
    expect(out).toContain("Send 3 emails?");
    expect(out.match(/You asked for 5; 3 are ready\./g)).toHaveLength(1);
    expect(out.match(/Left out: 2 have no email yet/g)).toHaveLength(1);
  });

  it("drops the line about Gmail once it is connected, and keeps the rest", () => {
    expect(liveNotes(notes, true)).toEqual(notes.slice(0, 2));
    expect(liveNotes(notes, false)).toEqual(notes);
  });
});

describe("Try again is the same card answering again", () => {
  it("asks for the next answer of the same approval, shows it working, and replaces the card's answer in place", async () => {
    const { key, seq } = await withCard();
    feed(ev("result", answer({ approvalSeq: seq })));
    expect(card()?.decided?.outcome).toMatchObject({ attempt: 1, again: true });

    let finish: (v: Record<string, unknown>) => void = () => undefined;
    server.decide = () => new Promise((r) => { finish = r; });
    const asked = chat.decide(key, seq, "approve");
    // Working over the answer it had; asked once, with the answer this tab was looking at.
    expect(card()).toMatchObject({ deciding: true });
    expect(card()?.decided).not.toBeNull();
    void chat.decide(key, seq, "approve");
    expect(server.calls).toEqual([{ run: "run-1", seq, decision: "approve", attempt: 1 }]);

    finish(answer({
      approvalSeq: seq, attempt: 2, headline: "Sent 2 of 3 from ana@x.com. 1 going out now.",
      counts: { total: 3, sent: 2, waiting: 1, failed: 0, held: 0 }, failures: [], again: false, settled: false,
    }));
    await asked;
    expect(card()).toMatchObject({ deciding: false, error: null });
    expect(card()?.decided?.outcome).toMatchObject({ attempt: 2, counts: { waiting: 1, failed: 0 } });
    // Still one card, still one turn, nothing said to the agent.
    expect(turn()?.approvals).toHaveLength(1);
    expect(turn()?.cards).toEqual([]);
    expect(chat.chatNow().turns).toHaveLength(1);
    expect(server.sent).toEqual([]);

    // Gmail then takes the last one: the card moves on by itself, from the stream.
    feed(ev("result", answer({
      approvalSeq: seq, attempt: 2, headline: "Sent 3 of 3 from ana@x.com.", counts: { total: 3, sent: 3, waiting: 0, failed: 0, held: 0 },
      failures: [], again: false, settled: true,
    })));
    expect(card()?.decided?.outcome).toMatchObject({ counts: { sent: 3 } });
    // An older answer arriving late does not take its place.
    feed(ev("result", answer({ approvalSeq: seq, attempt: 1 })));
    expect(card()?.decided?.outcome).toMatchObject({ attempt: 2, counts: { sent: 3 } });
    // Nothing to try again now: the press does nothing.
    await chat.decide(key, seq, "approve");
    expect(server.calls).toHaveLength(1);
  });

  it("keeps the answer it had and says why when Try again is refused", async () => {
    const { key, seq } = await withCard();
    feed(ev("result", answer({ approvalSeq: seq })));
    const { ApiError } = await import("../api/client");
    server.decide = async () => { throw new ApiError(503, "unavailable", "Gmail isn't connected yet. Connect it below, then approve again.", { connect: "gmail" }); };
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, error: "Gmail isn't connected yet. Connect it below, then approve again." });
    expect(card()?.decided?.outcome).toMatchObject({ attempt: 1, again: true });
    const out = draw(card() as Approval);
    expect(text(out)).toContain("Sent 2 of 3");
    expect(text(out)).toContain("Gmail isn't connected yet. Connect it below, then approve again.");
    expect(out).toContain(">Try again</button>");
  });
});

describe("a card that was answered elsewhere settles calmly", () => {
  it("says it was already handled, with no error and no Try again, when the yes finds it done", async () => {
    const { key, seq } = await withCard();
    const { ApiError } = await import("../api/client");
    server.decide = async () => { throw new ApiError(409, "conflict", "This was already decided."); };
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, error: null });
    expect(card()?.decided?.outcome).toMatchObject({ summary: "This was already handled.", handled: true });
    const out = draw(card() as Approval);
    expect(text(out)).toContain("This was already handled.");
    expect(out).not.toContain("Try again");
    expect(out).not.toContain("kc-problem");
  });
});

describe("a refusal that will not change settles the card", () => {
  it("says the sentence and offers no Try again for a 403", async () => {
    const { key, seq } = await withCard();
    const { ApiError } = await import("../api/client");
    server.decide = async () => { throw new ApiError(403, "forbidden", "That campaign isn't on a team you lead. Ask its team's lead or the owner to change it."); };
    await chat.decide(key, seq, "approve");
    expect(card()).toMatchObject({ deciding: false, error: null });
    expect(card()?.decided?.outcome).toMatchObject({ refused: true, summary: expect.stringContaining("isn't on a team you lead") });
    const out = draw(card() as Approval);
    expect(out).not.toContain("Try again");
    expect(text(out)).toContain("isn't on a team you lead");
  });
});

describe("a chat that is reopened shows the same card", () => {
  it("replays the approval and its answers into one card with the last answer, and no other card", async () => {
    const { seq } = await withCard();
    feed(ev("result", answer({ approvalSeq: seq, headline: "Sending 3 emails from ana@x.com.", counts: { total: 3, sent: 0, waiting: 3, failed: 0, held: 0 }, failures: [], again: false, settled: false })));
    feed(ev("result", answer({ approvalSeq: seq })));
    feed(ev("result", answer({ approvalSeq: seq, attempt: 2, headline: "Sent 3 of 3 from ana@x.com.", counts: { total: 3, sent: 3, waiting: 0, failed: 0, held: 0 }, failures: [], again: false, settled: true })));
    const live = card();

    chat.newChat();
    follows.length = 0;
    n = 0;
    await chat.openChat("c1");
    feed(ev("approval", {
      action: { action: "send_email", campaignId: CAMPAIGN, messageIds: ["m1", "m2", "m3"] }, summary: "Email Dev Menon", campaignName: "Senior Backend",
      people: [], capability: "outreach.send_email", emails: [],
    }));
    feed(ev("result", answer({ approvalSeq: 1, headline: "Sending 3 emails from ana@x.com.", counts: { total: 3, sent: 0, waiting: 3, failed: 0, held: 0 }, failures: [], again: false, settled: false })));
    feed(ev("result", answer({ approvalSeq: 1 })));
    feed(ev("result", answer({ approvalSeq: 1, attempt: 2, headline: "Sent 3 of 3 from ana@x.com.", counts: { total: 3, sent: 3, waiting: 0, failed: 0, held: 0 }, failures: [], again: false, settled: true })));
    expect(turn()?.approvals).toHaveLength(1);
    expect(turn()?.cards).toEqual([]);
    expect(card()?.decided?.outcome).toEqual(live?.decided?.outcome);
    expect(text(draw(card() as Approval))).toContain("Sent 3 of 3 from ana@x.com.");
  });
});

/** The card as it waits, before any answer. */
function cardOf(): Approval {
  return {
    seq: 1, summary: "Email Dev Menon", action: "send_email", detail: { action: "send_email", campaignId: CAMPAIGN }, campaignId: CAMPAIGN,
    campaignName: "Senior Backend", people: [], decided: null, deciding: false, error: null, notes: [], capability: "outreach.send_email",
    wontDo: [], emails: [],
  };
}

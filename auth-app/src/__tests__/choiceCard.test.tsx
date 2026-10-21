import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "../api/agent";
import type { RunEvent } from "../api/events";

/**
 * A question with fixed options is answered on its card: one heading, the options, a Continue; a value an option
 * needs is typed inside the card; the pick goes to the server as an answer and the card settles on one line, with
 * no message of the person's added. A reload brings it back settled; a question the chat has left is not asked.
 */

let feed: (e: RunEvent) => void = () => {};
vi.mock("../api/events", async (orig) => ({
  ...(await orig<typeof import("../api/events")>()),
  follow: vi.fn((_t: unknown, _a: number, on: (e: RunEvent) => void) => {
    feed = on;
    return () => {};
  }),
}));
vi.mock("../api/agent", async (orig) => {
  const m = await orig<typeof import("../api/agent")>();
  return { ...m, agentApi: { ...m.agentApi, conversation: vi.fn(), answer: vi.fn(), send: vi.fn() } };
});

import { ChoiceCard, matching, pickChoice, readyToContinue, SEARCHABLE } from "../agentCards/ChoiceCard";
import { agentApi } from "../api/agent";
import { ApiError } from "../api/client";
import { answerQuestion, chatNow, focusChat, fromDetail, newChat, onChatFocus, openChat, sendAction } from "../liveChat";
import type { Question } from "../liveChat";
import { leaveOutAsked, LiveTurnBody } from "../LiveTurn";
import { newTurn } from "../liveChat";

const CLIENTS = [
  { id: "c1", name: "Acme Fintech", text: "The client is Acme Fintech" },
  { id: "new", name: "A new client", text: "The client is {value}, who isn't in Clients yet", input: { label: "Client name", placeholder: "Company name", tag: "new" } },
  { id: "none", name: "No client", text: "No client for this one", quiet: true },
];
const question = (over: Partial<Question> = {}): Question => ({
  kind: "client", text: "Which client is this for?", choices: CLIENTS, runId: "r1", seq: 4, ...over,
});

let ids = 0;
const event = (runId: string, type: RunEvent["type"], payload: Record<string, unknown>, seq: number): RunEvent => ({
  ...payload, id: ++ids, eventId: ids, runId, seq, type, at: "2026-10-20T10:00:05.000Z",
});
const detail = (messages: ConversationDetail["messages"]): ConversationDetail => ({
  conversation: { id: "c1", title: null, focusCampaignId: null, updatedAt: "2026-10-20T10:00:00.000Z" },
  messages, runs: [], eventCursor: 0,
});
const said = (id: string, runId: string, text: string, artifact: Record<string, unknown> | null = null) => ({
  id, seq: 1, role: "user" as const, text, clientId: id, runId, campaignIds: [], artifact, createdAt: "2026-10-20T10:00:00.000Z",
});

/** A chat opened on one message whose run asked the client question. */
async function asked(): Promise<void> {
  vi.mocked(agentApi.conversation).mockResolvedValue(detail([said("m1", "r1", "Here is the JD. Start a new campaign for this")]));
  await openChat("c1");
  feed(event("r1", "question", { kind: "client", text: "Which client is this for?", choices: CLIENTS }, 4));
}

beforeEach(() => {
  newChat();
  vi.mocked(agentApi.answer).mockReset();
  vi.mocked(agentApi.send).mockReset();
});

describe("the card", () => {
  it("shows the question once, with its options and a Continue that waits for a pick", () => {
    const html = renderToStaticMarkup(<ChoiceCard question={question()} onAnswer={() => {}} />);
    expect(html.match(/Which client is this for\?/g)).toHaveLength(1);
    expect(html).toContain("Acme Fintech");
    expect(html).toContain("A new client");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
    expect(html).toMatch(/class="ch-skip"[^>]*>No client<\/button>/);
    expect(html).not.toContain("Client name");
  });

  it("lists every option, with a field to find one by name and a list that scrolls when there are many", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, name: i === 7 ? "Northwind Logistics" : `Client ${i}` }));
    const html = renderToStaticMarkup(<ChoiceCard question={question({ choices: many })} onAnswer={() => {}} />);
    expect(many.length).toBeGreaterThan(SEARCHABLE);
    for (const c of many) expect(html).toContain(c.name);
    expect(html).toContain('type="search"');
    expect(html).toContain("ch-opts is-long");
    // Few options need no field.
    expect(renderToStaticMarkup(<ChoiceCard question={question()} onAnswer={() => {}} />)).not.toContain('type="search"');
    expect(matching(many, "north log", []).map((c) => c.name)).toEqual(["Northwind Logistics"]);
    // A pick stays in view even when the words no longer fit it.
    expect(matching(many, "north", ["c1"]).map((c) => c.id)).toEqual(["c1", "c7"]);
    expect(matching(many, "", [])).toHaveLength(11);
  });

  it("is one button when there is one option and nothing to type", () => {
    const html = renderToStaticMarkup(
      <ChoiceCard question={question({ kind: "note", text: "Send them a note?", choices: [{ id: "note", name: "Send the note" }] })} onAnswer={() => {}} />,
    );
    expect(html).toContain(">Send the note</button>");
    expect(html).not.toContain("ch-opts");
    expect(html).not.toMatch(/disabled=""/);
  });

  it("settles on one line, and nothing else of it stays", () => {
    const html = renderToStaticMarkup(
      <ChoiceCard question={question({ answer: { ids: ["new"], value: "Zlice Technology PVT Limited", line: "Client: Zlice Technology PVT Limited (new)" } })} onAnswer={() => {}} />,
    );
    expect(html).toContain("Client: Zlice Technology PVT Limited (new)");
    expect(html).not.toContain("Which client is this for?");
    expect(html).not.toContain("<button");
  });

  it("is not asked once the chat has gone on, or the server said it is out of date", () => {
    for (const html of [
      renderToStaticMarkup(<ChoiceCard question={question()} closed onAnswer={() => {}} />),
      renderToStaticMarkup(<ChoiceCard question={question({ stale: true })} onAnswer={() => {}} />),
    ]) {
      expect(html).toContain("Which client is this for: skipped");
      expect(html).not.toContain("<button");
    }
  });

  it("says why an answer did not go through, and lets the same one be sent again", () => {
    const html = renderToStaticMarkup(<ChoiceCard question={question({ error: "That didn't go through." })} onAnswer={() => {}} />);
    expect(html).toContain("That didn&#x27;t go through.");
    expect(html).toContain('role="alert"');
  });

  it("needs the value an option asks for, and picks one or several as the question says", () => {
    const q = question();
    expect(readyToContinue(q, [], "")).toBe(false);
    expect(readyToContinue(q, ["c1"], "")).toBe(true);
    expect(readyToContinue(q, ["new"], "  ")).toBe(false);
    expect(readyToContinue(q, ["new"], "Zlice")).toBe(true);
    expect(pickChoice(q, ["c1"], "new")).toEqual(["new"]);
    const many = question({ multi: { min: 1, max: 2 } });
    expect(readyToContinue(many, [], "")).toBe(false);
    expect(readyToContinue(many, ["c1", "new"], "x")).toBe(true);
    expect(readyToContinue(many, ["c1", "new", "none"], "x")).toBe(false);
    expect(pickChoice(many, ["c1"], "new")).toEqual(["c1", "new"]);
    expect(pickChoice(many, ["c1", "new"], "none")).toEqual(["c1", "new"]);
    expect(pickChoice(many, ["c1", "new"], "c1")).toEqual(["new"]);
  });
});

describe("the heading is said once", () => {
  it("leaves out the agent's sentence that asks what the card asks", () => {
    const qs = [{ text: "Which client is this for?" }];
    expect(leaveOutAsked("Which client is this for?", qs)).toBe("");
    expect(leaveOutAsked("Got your notes. Which client should this be for?", qs)).toBe("Got your notes.");
    expect(leaveOutAsked("Which client is this for?\nPick one below.", qs)).toBe("Pick one below.");
    // No card, no change.
    expect(leaveOutAsked("Which client is this for?", [])).toBe("Which client is this for?");
  });

  it("shows the question only on the card when the agent said the same", () => {
    const html = renderToStaticMarkup(
      <LiveTurnBody turn={{ ...newTurn("t", "notes"), status: "done", reply: "Which client is this for?", questions: [question()] }} onAnswer={() => {}} />,
    );
    expect(html.match(/Which client is this for\?/g)).toHaveLength(1);
  });
});

describe("a question in a turn the chat has gone past", () => {
  const turn = { ...newTurn("t", "notes"), status: "done" as const, questions: [question()] };

  it("reads as answered when a later turn was started by its answer, even before its own event is read", () => {
    const later = [{ ...newTurn("a", ""), quiet: { label: "Client: Acme Fintech", answer: { runId: "r1", seq: 4, ids: ["c1"] } } }];
    const html = renderToStaticMarkup(<LiveTurnBody turn={turn} onAnswer={() => {}} later={later} />);
    expect(html).toContain("Client: Acme Fintech");
    expect(html).not.toContain("<button");
  });

  it("reads as skipped when the chat went on with something else", () => {
    const html = renderToStaticMarkup(<LiveTurnBody turn={turn} onAnswer={() => {}} later={[newTurn("b", "What campaigns do I have?")]} />);
    expect(html).toContain("Which client is this for: skipped");
    expect(html).not.toContain("<button");
  });
});

describe("answering", () => {
  it("sends the pick as an answer, settles the card, and starts a turn with no message of the person's", async () => {
    await asked();
    vi.mocked(agentApi.answer).mockResolvedValue({
      runId: "r2", repeated: false,
      answer: { ids: ["new"], value: "Zlice Technology PVT Limited", line: "Client: Zlice Technology PVT Limited (new)" },
    });
    await answerQuestion("m1", 0, ["new"], "Zlice Technology PVT Limited");

    expect(agentApi.send).not.toHaveBeenCalled();
    expect(agentApi.answer).toHaveBeenCalledWith("c1", expect.objectContaining({
      runId: "r1", seq: 4, ids: ["new"], value: "Zlice Technology PVT Limited",
    }));
    const chat = chatNow();
    expect(chat.turns[0]?.questions[0]?.answer?.line).toBe("Client: Zlice Technology PVT Limited (new)");
    // The next turn is the answer's, shown under the card with nothing said by the person.
    expect(chat.turns).toHaveLength(2);
    expect(chat.turns[1]).toMatchObject({ runId: "r2", quiet: { label: "Client: Zlice Technology PVT Limited (new)" } });
    expect(chat.owners.r2).toBe(chat.turns[1]?.key);
  });

  it("is one answer however many times it is pressed, and the stream's copy changes nothing", async () => {
    await asked();
    vi.mocked(agentApi.answer).mockResolvedValue({ runId: "r2", repeated: false, answer: { ids: ["none"], line: "Client: No client" } });
    await Promise.all([answerQuestion("m1", 0, ["none"]), answerQuestion("m1", 0, ["none"])]);
    await answerQuestion("m1", 0, ["none"]);
    expect(agentApi.answer).toHaveBeenCalledTimes(1);
    feed(event("r1", "progress", { step: "answer", questionSeq: 4, ids: ["none"], line: "Client: No client", continuedRunId: "r2" }, 5));
    expect(chatNow().turns).toHaveLength(2);
    expect(chatNow().turns[0]?.questions[0]?.answer?.line).toBe("Client: No client");
  });

  it("settles from the run's event alone when the chat is reopened", async () => {
    vi.mocked(agentApi.conversation).mockResolvedValue(detail([
      said("m1", "r1", "Here is the JD. Start a new campaign for this"),
      said("m2", "r2", "The client is Acme Fintech", { kind: "answer", runId: "r1", seq: 4, ids: ["c1"], line: "Client: Acme Fintech" }),
    ]));
    await openChat("c1");
    feed(event("r1", "question", { kind: "client", text: "Which client is this for?", choices: CLIENTS }, 4));
    feed(event("r1", "progress", { step: "answer", questionSeq: 4, ids: ["c1"], line: "Client: Acme Fintech", continuedRunId: "r2" }, 5));
    const { turns } = chatNow();
    expect(turns[0]?.questions[0]?.answer?.line).toBe("Client: Acme Fintech");
    // The answer's message is a turn with nothing said by the person; the typed one is not.
    expect(turns.map((t) => Boolean(t.quiet))).toEqual([false, true]);
    expect(turns[1]?.quiet?.answer).toEqual({ runId: "r1", seq: 4, ids: ["c1"] });
  });

  it("keeps a button's words as a turn with nothing said by the person", () => {
    const s = fromDetail(detail([said("m1", "r1", "Find more people for Robotics", { kind: "action", label: "Find more people" })]));
    expect(s.turns[0]?.quiet).toEqual({ label: "Find more people" });
  });

  it("settles as out of date when the server says the chat has moved on", async () => {
    await asked();
    vi.mocked(agentApi.answer).mockRejectedValue(new ApiError(409, "conflict", "That question is out of date.", {}));
    await answerQuestion("m1", 0, ["none"]);
    expect(chatNow().turns[0]?.questions[0]).toMatchObject({ stale: true, sending: false });
    expect(chatNow().turns).toHaveLength(1);
  });

  it("says why when it fails and sends the same answer again on a retry", async () => {
    await asked();
    vi.mocked(agentApi.answer).mockRejectedValueOnce(new ApiError(500, "internal", "Something went wrong.", {}));
    await answerQuestion("m1", 0, ["none"]);
    const failed = chatNow().turns[0]?.questions[0];
    expect(failed).toMatchObject({ sending: false, error: "Something went wrong." });
    vi.mocked(agentApi.answer).mockResolvedValue({ runId: "r2", repeated: false, answer: { ids: ["none"], line: "Client: No client" } });
    await answerQuestion("m1", 0, ["none"]);
    const [first, second] = vi.mocked(agentApi.answer).mock.calls;
    expect(second?.[1].clientId).toBe(first?.[1].clientId);
    expect(chatNow().turns[0]?.questions[0]?.answer?.line).toBe("Client: No client");
  });

  it("sends a button's words as a turn the agent reads, marked as a press", async () => {
    await asked();
    vi.mocked(agentApi.send).mockResolvedValue({ runId: "r3", message: {} as never });
    sendAction("Find more people for Robotics", "Find more people", "9b1c6a52-0000-4000-8000-000000000001");
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalled());
    expect(vi.mocked(agentApi.send).mock.calls[0]?.[1]).toMatchObject({ text: "Find more people for Robotics", quiet: "Find more people" });
    expect(chatNow().turns.at(-1)?.quiet).toEqual({ label: "Find more people" });
  });
});

describe("the chat moving to a campaign", () => {
  it("tells the page as it happens, so the panel follows without a reload, and says nothing on a reopened chat", async () => {
    await asked();
    const seen: Array<[string, string]> = [];
    const off = onChatFocus((id, name) => seen.push([id, name]));
    feed(event("r1", "focus", { campaignId: "k1", name: "Payments Engineer", text: "Now working on Payments Engineer" }, 9));
    off();
    expect(seen).toEqual([["k1", "Payments Engineer"]]);
  });

  it("is told by a card that made a campaign too, so the panel is about the new one, not the one that was open", () => {
    const seen: Array<[string, string]> = [];
    const off = onChatFocus((id, name) => seen.push([id, name]));
    focusChat("k2", "DevOps Engineer");
    off();
    expect(seen).toEqual([["k2", "DevOps Engineer"]]);
  });

  it("is not also a line in the thread", () => {
    const html = renderToStaticMarkup(<LiveTurnBody turn={{ ...newTurn("t", "notes"), status: "done", focus: "Payments Engineer", reply: "Made it." }} onAnswer={() => {}} />);
    expect(html).toContain("Made it.");
    expect(html).not.toContain("Now working on");
  });
});

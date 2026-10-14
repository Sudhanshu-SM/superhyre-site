import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "../api/agent";

/**
 * The agent chat belongs to the workspace it was opened in. When that changes (switched, approved, accepted,
 * or another tab did it) nothing of it stays: the organisation never shows the Personal chat. And "Send again"
 * sends the same turn again, in its place, about the same campaign.
 */

const { server, follows } = vi.hoisted(() => ({
  server: {
    conversation: async (_id: string): Promise<unknown> => ({}),
    createConversation: async (_c?: string): Promise<unknown> => ({ id: "c-new" }),
    send: async (_id: string, _b: { clientId: string; text: string; campaignId?: string }): Promise<unknown> => ({ runId: "r1" }),
    sends: [] as { clientId: string; text: string; campaignId?: string }[],
  },
  follows: [] as { id: string; stopped: boolean; gone: ((why: "missing" | "moved") => void) | undefined }[],
}));

vi.mock("../api/agent", () => ({
  agentApi: {
    conversation: (id: string) => server.conversation(id),
    createConversation: (c?: string) => server.createConversation(c),
    send: (id: string, b: { clientId: string; text: string; campaignId?: string }) => {
      server.sends.push(b);
      return server.send(id, b);
    },
    cancel: async () => ({}),
    findMore: async () => ({ runId: "x", size: 1 }),
    decide: async () => ({}),
  },
}));
vi.mock("../api/events", () => ({
  follow: (target: { conversationId: string }, _after: number, _on: unknown, gone?: (why: "missing" | "moved") => void) => {
    const f = { id: target.conversationId, stopped: false, gone };
    follows.push(f);
    return () => { f.stopped = true; };
  },
}));

const chat = await import("../liveChat");
const { workspaceChangedHere } = await import("../api/identity");

const detail = (id: string, said: string): ConversationDetail => ({
  conversation: { id, title: said, campaignId: null, focusCampaignId: null, createdAt: "2026-10-11T10:00:00Z", updatedAt: "2026-10-11T10:00:00Z" },
  messages: [{ id: "m1", role: "user", text: said, runId: "run-1", clientId: "k1", createdAt: "2026-10-11T10:00:00Z" }],
  eventCursor: 0,
} as unknown as ConversationDetail);

beforeEach(() => {
  chat.newChat();
  follows.length = 0;
  server.sends.length = 0;
  server.createConversation = async () => ({ id: "c-new" });
  server.send = async () => ({ runId: "r1" });
});

describe("the chat when the workspace changes", () => {
  it("leaves nothing of the Personal chat inside the organisation", async () => {
    server.conversation = async (id) => detail(id, "I'll add the job description later.");
    await chat.openChat("personal-chat");
    expect(chat.chatNow().conversationId).toBe("personal-chat");
    expect(chat.chatNow().turns).toHaveLength(1);

    workspaceChangedHere();

    expect(chat.chatNow().conversationId).toBeNull();
    expect(chat.chatNow().turns).toEqual([]);
    // Its stream is closed too: nothing keeps asking for a chat that is not in this workspace.
    expect(follows.every((f) => f.stopped)).toBe(true);
  });

  it("drops a chat that was still loading when the workspace changed", async () => {
    let arrive: (d: unknown) => void = () => {};
    server.conversation = () => new Promise((r) => { arrive = r; });
    const opening = chat.openChat("personal-chat");
    workspaceChangedHere();
    arrive(detail("personal-chat", "Old words"));
    await opening;
    expect(chat.chatNow().conversationId).toBeNull();
    expect(chat.chatNow().turns).toEqual([]);
    expect(follows).toHaveLength(0);
  });

  it("forgets a chat whose stream says it is not there, without an error when the tab is only moving", async () => {
    server.conversation = async (id) => detail(id, "Hello");
    await chat.openChat("c1");
    follows[0]?.gone?.("moved");
    expect(chat.chatNow().conversationId).toBeNull();
    expect(chat.chatNow().error).toBeNull();

    await chat.openChat("c2");
    follows[1]?.gone?.("missing");
    expect(chat.chatNow().error).toBe("That chat isn't here any more.");
  });
});

describe("sending a message again", () => {
  it("puts the same turn out again about the same campaign, not a second message", async () => {
    server.send = async () => { throw new Error("busy"); };
    const key = chat.sendMessage("Find me engineers", "camp-1");
    await vi.waitFor(() => expect(chat.chatNow().turns[0]?.status).toBe("failed"));
    expect(chat.chatNow().turns).toHaveLength(1);

    server.send = async () => ({ runId: "r2" });
    chat.resendTurn(key);
    expect(chat.chatNow().turns).toHaveLength(1);
    expect(chat.chatNow().turns[0]).toMatchObject({ key, said: "Find me engineers", status: "sending", error: null });
    await vi.waitFor(() => expect(chat.chatNow().turns[0]?.runId).toBe("r2"));

    expect(chat.chatNow().turns).toHaveLength(1);
    expect(server.sends).toHaveLength(2);
    expect(server.sends[1]).toMatchObject({ text: "Find me engineers", campaignId: "camp-1" });
    // A new send to the server: the refused one's key is not reused.
    expect(server.sends[1]?.clientId).not.toBe(server.sends[0]?.clientId);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Several messages from one Send: the files that were added, then the turn that answers the words typed with them. That turn goes
 * under a label with no message of the person's (their words are already in the chat), and the server is told it was not typed.
 */

vi.mock("../api/events", async (orig) => ({
  ...(await orig<typeof import("../api/events")>()),
  follow: vi.fn(() => () => {}),
}));
vi.mock("../api/agent", async (orig) => {
  const m = await orig<typeof import("../api/agent")>();
  return { ...m, agentApi: { ...m.agentApi, createConversation: vi.fn(), send: vi.fn(), conversation: vi.fn() } };
});

import { agentApi } from "../api/agent";
import { chatNow, newChat, sendMessages } from "../liveChat";

const CAMPAIGN = "9b1c6a52-0000-4000-8000-000000000001";

beforeEach(() => {
  newChat();
  vi.mocked(agentApi.createConversation).mockReset().mockResolvedValue({ id: "c1" } as never);
  vi.mocked(agentApi.send).mockReset().mockResolvedValue({ runId: "r1", message: {} as never });
});

describe("a Send of several messages", () => {
  it("shows the turn that answers the person's words with no message of theirs, and tells the server it was not typed", async () => {
    const adding = { id: "add-0001abcd", defaulted: false, groups: [{ scope: "candidates" as const, files: [{ name: "leads.xlsx", kind: "sheet" as const }] }] };
    sendMessages([
      { text: "email them", campaignId: CAMPAIGN, structured: { adding } },
      { text: "What I attached is on the card above. Nothing is added until I press its button. Answer only what I asked besides adding: email them", campaignId: CAMPAIGN, quiet: "Your note on what you added" },
    ]);
    const [first, second] = chatNow().turns;
    expect(first?.quiet).toBeUndefined();
    expect(second?.quiet).toEqual({ label: "Your note on what you added" });
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(2));
    const [one, two] = vi.mocked(agentApi.send).mock.calls.map((c) => c[1]);
    expect(one).toMatchObject({ text: "email them", adding });
    expect(one).not.toHaveProperty("quiet");
    expect(two).toMatchObject({ quiet: "Your note on what you added", campaignId: CAMPAIGN });
  });
});

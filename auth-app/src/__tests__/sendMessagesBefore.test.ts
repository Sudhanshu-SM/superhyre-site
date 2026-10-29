import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A message that waits for work first: a job description's file goes up by the campaign's own route, and only then does the message
 * that shows the requirements go. The turn is on screen while the file is read, says so, and says what happened if it did not go in.
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
import { ApiError } from "../api/client";
import { type Before, chatNow, newChat, resendTurn, sendMessages } from "../liveChat";

const CAMPAIGN = "9b1c6a52-0000-4000-8000-000000000001";
const adding = { id: "add-0001abcd-job_description", defaulted: true, groups: [{ scope: "job_description" as const, files: [{ name: "jd.pdf", kind: "document" as const }] }] };

/** Work the test finishes when it chooses, one promise for each time it is started. */
function work() {
  const calls: Array<{ done: () => void; fail: (e: unknown) => void }> = [];
  const run = vi.fn(
    () =>
      new Promise<void>((res, rej) => {
        calls.push({ done: res, fail: rej });
      }),
  );
  return { run, done: (n = 0) => calls[n]?.done(), fail: (e: unknown, n = 0) => calls[n]?.fail(e) };
}
const before = (run: Before["run"], then?: Before["then"]): Before => ({
  working: "Reading jd.pdf and drafting the requirements. This takes about a minute.",
  done: "Read jd.pdf",
  run,
  failure: (err) => `Couldn't save jd.pdf: ${err instanceof Error ? err.message : "?"}`,
  ...(then ? { then } : {}),
});
const turnOf = () => chatNow().turns[0]!;

beforeEach(() => {
  newChat();
  vi.mocked(agentApi.createConversation).mockReset().mockResolvedValue({ id: "c1" } as never);
  vi.mocked(agentApi.send).mockReset().mockResolvedValue({ runId: "r1", message: {} as never });
});

describe("a message that waits for its file to go up", () => {
  it("shows the turn at once with the line that says what is being read, and sends nothing until the file is in", async () => {
    const w = work();
    sendMessages([{ text: "Show the requirements", campaignId: CAMPAIGN, structured: { adding }, before: before(w.run) }]);
    expect(turnOf().phases).toMatchObject([{ id: "before", state: "running", label: "Reading jd.pdf and drafting the requirements. This takes about a minute." }]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalledTimes(1));
    expect(agentApi.createConversation).not.toHaveBeenCalled();
    expect(agentApi.send).not.toHaveBeenCalled();

    w.done();
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.send).mock.calls[0]?.[1]).toMatchObject({ text: "Show the requirements", campaignId: CAMPAIGN, adding });
    // The line is kept, finished, over the run's own.
    expect(turnOf().phases).toMatchObject([{ id: "before", state: "done", label: "Read jd.pdf" }]);
    expect(turnOf().status).toBe("working");
  });

  it("asks what follows only after the message that holds the person's own words is in, under its label, for the same campaign", async () => {
    const w = work();
    sendMessages([
      {
        text: "this replaces the old one",
        campaignId: CAMPAIGN,
        structured: { adding: { ...adding, defaulted: false } },
        before: before(w.run, { text: "Show the requirements", label: "Show the requirements", campaignId: CAMPAIGN }),
      },
    ]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalled());
    w.done();
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(2));
    const [words, ask] = vi.mocked(agentApi.send).mock.calls.map((c) => c[1]);
    expect(words).toMatchObject({ text: "this replaces the old one" });
    expect(words).not.toHaveProperty("quiet");
    expect(ask).toMatchObject({ text: "Show the requirements", quiet: "Show the requirements", campaignId: CAMPAIGN });
    // Shown with no message of the person's, as a button's words are.
    expect(chatNow().turns[1]?.quiet).toEqual({ label: "Show the requirements" });
  });

  it("sends nothing when the file did not go in, says why in the words of the failure, and does not ask for requirements that were never drafted", async () => {
    const w = work();
    sendMessages([
      { text: "words", campaignId: CAMPAIGN, before: before(w.run, { text: "Show the requirements", label: "Show the requirements" }) },
    ]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalled());
    w.fail(new Error("We couldn't read enough text from that file. Paste the JD instead."));
    await vi.waitFor(() => expect(turnOf().status).toBe("failed"));
    expect(turnOf().error).toBe("Couldn't save jd.pdf: We couldn't read enough text from that file. Paste the JD instead.");
    expect(turnOf().phases).toMatchObject([{ id: "before", state: "failed" }]);
    expect(turnOf().errorCode).toBeNull();
    expect(agentApi.send).not.toHaveBeenCalled();
    expect(chatNow().turns).toHaveLength(1);
  });

  it("keeps a limit's code and the time it lifts, so the turn says when to try again", async () => {
    const w = work();
    sendMessages([{ text: "Show the requirements", campaignId: CAMPAIGN, before: before(w.run) }]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalled());
    const retryAt = Date.now() + 120_000;
    w.fail(new ApiError(429, "rate_limited", "Too many drafts.", { retryAt }));
    await vi.waitFor(() => expect(turnOf().status).toBe("failed"));
    expect(turnOf()).toMatchObject({ errorCode: "rate_limited", retryAt });
  });

  it("sends the file again on Send again after a failure, and the message once it is in", async () => {
    const w = work();
    sendMessages([{ text: "Show the requirements", campaignId: CAMPAIGN, before: before(w.run) }]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalledTimes(1));
    w.fail(new Error("Busy."));
    await vi.waitFor(() => expect(turnOf().status).toBe("failed"));

    resendTurn(turnOf().key);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalledTimes(2));
    expect(turnOf().phases).toMatchObject([{ state: "running" }]);
    expect(turnOf().error).toBeNull();
    expect(agentApi.send).not.toHaveBeenCalled();
    w.done(1);
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(1));
  });

  it("does the work once: a message that failed to send after the file was in goes again alone, and still asks what follows", async () => {
    const w = work();
    vi.mocked(agentApi.send).mockRejectedValueOnce(new ApiError(503, "unavailable", "The agent is busy."));
    sendMessages([
      { text: "words", campaignId: CAMPAIGN, before: before(w.run, { text: "Show the requirements", label: "Show the requirements", campaignId: CAMPAIGN }) },
    ]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalled());
    w.done();
    await vi.waitFor(() => expect(turnOf().status).toBe("failed"));
    expect(agentApi.send).toHaveBeenCalledTimes(1);

    resendTurn(turnOf().key);
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(3));
    expect(w.run).toHaveBeenCalledTimes(1);
    expect(vi.mocked(agentApi.send).mock.calls[2]?.[1]).toMatchObject({ quiet: "Show the requirements" });
  });

  it("lets the parts after it go while it works only in their order: the chat is started by the first part", async () => {
    const w = work();
    sendMessages([
      { text: "Show the requirements", campaignId: CAMPAIGN, before: before(w.run) },
      { text: "Read what I attached and tell me what it says.", campaignId: CAMPAIGN },
    ]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalled());
    expect(agentApi.send).not.toHaveBeenCalled();
    w.done();
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(2));
    expect(vi.mocked(agentApi.send).mock.calls.map((c) => c[1].text)).toEqual(["Show the requirements", "Read what I attached and tell me what it says."]);
  });

  it("drops the work when the chat is left before it finishes: nothing is sent into the next chat", async () => {
    const w = work();
    sendMessages([{ text: "Show the requirements", campaignId: CAMPAIGN, before: before(w.run) }]);
    await vi.waitFor(() => expect(w.run).toHaveBeenCalled());
    newChat();
    w.done();
    await new Promise((r) => setTimeout(r, 20));
    expect(agentApi.send).not.toHaveBeenCalled();
    expect(chatNow().turns).toHaveLength(0);
  });
});

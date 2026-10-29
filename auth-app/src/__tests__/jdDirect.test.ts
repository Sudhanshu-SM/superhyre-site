import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A job description picked from the paperclip for the campaign in the chat: the file goes up by the route the job description
 * popup uses (kept, the old one stays as a version, the requirements drafted from it), and then the chat is asked to show the
 * requirements. The agent never reads the file, and no frame of a message is saved with the description.
 */

vi.mock("../api/events", async (orig) => ({
  ...(await orig<typeof import("../api/events")>()),
  follow: vi.fn(() => () => {}),
}));
vi.mock("../api/agent", async (orig) => {
  const m = await orig<typeof import("../api/agent")>();
  return { ...m, agentApi: { ...m.agentApi, createConversation: vi.fn(), send: vi.fn(), conversation: vi.fn() } };
});
vi.mock("../api/campaigns", async (orig) => {
  const m = await orig<typeof import("../api/campaigns")>();
  return { ...m, jdApi: { ...m.jdApi, upload: vi.fn() } };
});

import { outgoing, partsOf } from "../adding";
import { agentApi } from "../api/agent";
import { jdApi } from "../api/campaigns";
import { ApiError, SLOW_WRITE_MESSAGE } from "../api/client";
import type { Attachment } from "../attachments";
import { jdBefore } from "../campaignJd";
import { chatNow, newChat, sendMessages } from "../liveChat";

const CAMPAIGN = "9b1c6a52-0000-4000-8000-000000000001";
const NOW = { campaign: { id: CAMPAIGN, name: "Senior Backend" }, mayChange: true, closed: false, campaigns: [], id: "add-0001abcd" };
const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const file = new File([BYTES], "jd.pdf", { type: "application/pdf" });
const chip = (): Attachment => ({
  id: "jd", name: "jd.pdf", origin: "file", size: file.size, status: "ready", kind: "document", scope: "job_description", docKind: "job_description",
  // What reading the file for the chip gave: it is not what goes anywhere.
  text: "Senior Backend Engineer. SECRET FILE TEXT. Own the payments ledger.", file,
});
/** What picking, then pressing Send, does: the chips become messages, and the messages become turns. */
const send = (words: string) => {
  const plan = outgoing([chip()], words, NOW)!;
  sendMessages(partsOf(plan.messages, jdBefore));
  return plan;
};

beforeEach(() => {
  newChat();
  vi.mocked(agentApi.createConversation).mockReset().mockResolvedValue({ id: "c1" } as never);
  vi.mocked(agentApi.send).mockReset().mockResolvedValue({ runId: "r1", message: {} as never });
  vi.mocked(jdApi.upload).mockReset().mockResolvedValue({ id: "s1", version: 2 });
});

describe("a job description picked for the campaign", () => {
  it("is posted as the file to the campaign's own route, and only then does the chat ask to show the requirements: the agent is given neither the file nor its text", async () => {
    send("");
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(1));
    expect(jdApi.upload).toHaveBeenCalledTimes(1);
    expect(jdApi.upload).toHaveBeenCalledWith(CAMPAIGN, file, "application/pdf");
    // The file was in before the chat heard of it.
    expect(vi.mocked(jdApi.upload).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(agentApi.send).mock.invocationCallOrder[0]!);
    const body = vi.mocked(agentApi.send).mock.calls[0]![1];
    expect(body).toMatchObject({ text: "Show the requirements", campaignId: CAMPAIGN });
    expect(body.adding).toMatchObject({ defaulted: true, groups: [{ scope: "job_description", files: [{ name: "jd.pdf", kind: "document" }] }] });
    // No frame, no lead sentence, no text of the file in anything sent.
    const everything = JSON.stringify(vi.mocked(agentApi.send).mock.calls);
    expect(everything).not.toContain("[Attached");
    expect(everything).not.toContain("SECRET FILE TEXT");
    expect(everything).not.toContain("Here is the job description");
    expect(chatNow().turns).toHaveLength(1);
  });

  it("says in the chat that it is reading the file and drafting the requirements while it works", async () => {
    let finish!: () => void;
    vi.mocked(jdApi.upload).mockReturnValue(new Promise((res) => { finish = () => res({ id: "s1", version: 2 }); }));
    send("");
    await vi.waitFor(() => expect(jdApi.upload).toHaveBeenCalled());
    const turn = chatNow().turns[0]!;
    expect(turn.said).toBe("Show the requirements");
    expect(turn.structured?.adding?.groups[0]?.scope).toBe("job_description");
    expect(turn.phases.map((p) => [p.state, p.label])).toEqual([["running", "Reading jd.pdf and drafting the requirements. This takes about a minute."]]);
    expect(agentApi.send).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalled());
  });

  it("goes the same way with words typed beside it: their words are the message, and the ask for the requirements follows under its own label", async () => {
    send("this replaces the old one");
    await vi.waitFor(() => expect(agentApi.send).toHaveBeenCalledTimes(2));
    expect(jdApi.upload).toHaveBeenCalledTimes(1);
    const [words, ask] = vi.mocked(agentApi.send).mock.calls.map((c) => c[1]);
    expect(words).toMatchObject({ text: "this replaces the old one" });
    expect(words?.adding?.defaulted).toBe(false);
    expect(ask).toMatchObject({ text: "Show the requirements", quiet: "Show the requirements", campaignId: CAMPAIGN });
    expect(JSON.stringify([words, ask])).not.toContain("[Attached");
  });

  it("says what went wrong in the server's own sentence, that the description is unchanged, and sends nothing to the chat", async () => {
    vi.mocked(jdApi.upload).mockRejectedValue(new ApiError(400, "bad_request", "We couldn't read enough text from that file. Paste the JD instead."));
    send("");
    await vi.waitFor(() => expect(chatNow().turns[0]?.status).toBe("failed"));
    expect(chatNow().turns[0]?.error).toBe(
      "Couldn't save jd.pdf: We couldn't read enough text from that file. Paste the JD instead. The job description is unchanged.",
    );
    expect(agentApi.send).not.toHaveBeenCalled();
  });

  it("does not say the description is unchanged when the request ran out of time: it may have been kept", async () => {
    vi.mocked(jdApi.upload).mockRejectedValue(new ApiError(504, "timeout", SLOW_WRITE_MESSAGE, { maybeDone: true }));
    send("");
    await vi.waitFor(() => expect(chatNow().turns[0]?.status).toBe("failed"));
    expect(chatNow().turns[0]?.error).toBe(SLOW_WRITE_MESSAGE);
    expect(chatNow().turns[0]?.error).not.toMatch(/unchanged/);
  });
});

describe("a job description that may have gone in", () => {
  const unknown = "Couldn't confirm that jd.pdf was saved. It may have gone through, so check the job description before you try again.";

  it.each([
    ["the connection dropped", new ApiError(0, "network", "Can't reach SuperHyre. Check your connection and try again.")],
    ["a gateway answered with a page that is not the server's", new ApiError(502, "error", "Something went wrong.")],
    ["the server failed after it began", new ApiError(500, "internal", "Something went wrong.")],
    ["the answer could not be read", new SyntaxError("Unexpected token '<'")],
  ])("is not said to be unchanged when %s: the server has the whole file and goes on drafting from it", async (_why, err) => {
    vi.mocked(jdApi.upload).mockRejectedValue(err);
    send("");
    await vi.waitFor(() => expect(chatNow().turns[0]?.status).toBe("failed"));
    expect(chatNow().turns[0]?.error).toBe(unknown);
    expect(agentApi.send).not.toHaveBeenCalled();
  });

  it.each([
    ["it refused the file", new ApiError(400, "bad_request", "Upload the JD as a PDF, Word file, image or text.")],
    ["it was busy and did not begin", new ApiError(503, "unavailable", "The assistant is busy. Try again in a minute.")],
  ])("is said to be unchanged when the server answered, in its own words, that %s", async (_why, err) => {
    vi.mocked(jdApi.upload).mockRejectedValue(err);
    send("");
    await vi.waitFor(() => expect(chatNow().turns[0]?.status).toBe("failed"));
    expect(chatNow().turns[0]?.error).toMatch(/^Couldn't save jd\.pdf: .* The job description is unchanged\.$/);
  });
});

describe("how the composer hands a job description over", () => {
  const agent = readFileSync(new URL("../Agent.tsx", import.meta.url), "utf8");

  it("binds a job description to the campaign it is chosen for, from the menu and again when its scope is set on the chip, and tells the chips which campaign is open by its id", () => {
    expect(agent).toContain('...(chosen === "job_description" && adding?.campaign ? { onCampaign: adding.campaign } : {}),');
    expect(agent).toContain('...(scope === "job_description" && adding?.campaign ? { onCampaign: adding.campaign } : {})');
    expect(agent).toContain("campaignId: adding?.campaign?.id ?? null,");
  });

  it("keeps the file of every document chip, since a document may be chosen as the job description and goes up as the file", () => {
    expect(agent).toContain("        file: f,\n");
    expect(agent).not.toContain('...(kind === "sheet" ? { file: f } : {}),');
  });

  it("does not take a file the job description route refuses (a Markdown note, a WebP picture) as the job description, chosen, changed to, or suggested", () => {
    expect(agent).toContain('if (scope === "job_description" && x.file && jdFileRefusal(x.file)) continue;');
    expect(agent).toContain('(chosen === "job_description" ? jdFileRefusal(f) : null) ??');
    expect(agent).toContain('(scope === "job_description" && x.file ? jdFileRefusal(x.file) : null) ?? fits(');
  });
});

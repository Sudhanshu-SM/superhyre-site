import { afterEach, describe, expect, it, vi } from "vitest";
import { describeRun, rowOf } from "../AgentActivity";
import type { RunSummary } from "../AgentActivity";
import type { RunEvent } from "../api/events";
import { ApiError } from "../api/client";
import { readable } from "../api/identity";
import { applyEvent, newTurn, stalled, TURN_LIMIT_MS } from "../liveChat";
import type { ChatState } from "../liveChat";
import { resultLine } from "../LiveTurn";
import { isKnownHash } from "../nav";

const at = "2026-10-04T10:00:05.000Z";
const ev = (runId: string, seq: number, type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: seq, runId, seq, type, at,
});

describe("a chat reopened after a reload", () => {
  const chat = (): ChatState => ({
    conversationId: "c1",
    turns: [{ ...newTurn("t1", "Who did we find?"), runId: "chat-run", status: "done" }],
    owners: { "chat-run": "t1" },
    orphans: {}, applied: {}, loading: false, error: null,
  });

  it("puts a 'Find more' search back under the turn it was asked from", () => {
    const s = [
      ev("search-2", 1, "plan", { step: "sourcing", parentRunId: "chat-run", campaignId: "camp", size: 10 }),
      ev("search-2", 2, "artifact", { items: [{ personId: "p1", fullName: "Asha" }] }),
      ev("search-2", 3, "done"),
    ].reduce(applyEvent, chat());
    expect(s.turns[0]?.searches).toMatchObject([{ runId: "search-2", campaignId: "camp", size: 10, status: "done" }]);
    expect(s.turns[0]?.searches[0]?.items).toHaveLength(1);
    expect(s.orphans).toEqual({});
  });

  it("keeps a search it can't place waiting, rather than guessing", () => {
    const s = applyEvent(chat(), ev("search-3", 1, "plan", { step: "sourcing", parentRunId: "unknown", campaignId: "camp" }));
    expect(s.turns[0]?.searches).toEqual([]);
    expect(s.orphans["search-3"]).toHaveLength(1);
  });

  it("stops waiting on a turn the server has long given up on", () => {
    const t = { ...newTurn("t", "Hi", 0), status: "working" as const };
    expect(stalled(t, TURN_LIMIT_MS - 1)).toBe(false);
    expect(stalled(t, TURN_LIMIT_MS + 1)).toBe(true);
    expect(stalled({ ...t, status: "done" }, TURN_LIMIT_MS * 10)).toBe(false);
  });

  it("settles a stopped turn from its stream", () => {
    const s = applyEvent(chat(), ev("chat-run", 1, "error", { code: "cancelled", message: "Stopped." }));
    expect(s.turns[0]).toMatchObject({ status: "failed", error: "Stopped." });
  });
});

describe("search results say one consistent thing", () => {
  it("counts the people shown, and explains a difference from what was asked", () => {
    expect(resultLine(0, 20)).toBe("Nobody new matched this time.");
    expect(resultLine(20, 20)).toBe("20 people worth a look");
    expect(resultLine(1, null)).toBe("1 person worth a look");
    expect(resultLine(12, 20)).toBe("12 people worth a look, of the 20 asked for");
    expect(resultLine(29, 20)).toBe("29 people worth a look");
    // Some of them without a score yet: found, not "worth a look" (Z1-7).
    expect(resultLine(30, 30, 25)).toBe("30 people found, best fit first");
    expect(resultLine(30, 30, 30)).toBe("30 people found");
    expect(resultLine(1, null, 1)).toBe("1 person found");
  });
});

describe("agent activity", () => {
  const run = (over: Partial<RunSummary>): RunSummary => ({
    id: "r", skill: "sourcing", trigger: "action", status: "done", campaignId: "c", campaignName: "Data Engineer",
    createdAt: at, finishedAt: at, error: null, mine: true, ...over,
  });
  it("describes each run in words, with its state only when it isn't simply done", () => {
    expect(describeRun(run({}))).toEqual({ what: "Searched for people for Data Engineer", how: null });
    expect(describeRun(run({ status: "running", mine: false }))).toEqual({
      what: "Searched for people for Data Engineer (a teammate)", how: "Still working",
    });
    expect(describeRun(run({ skill: "chat", campaignName: null, status: "failed", error: { code: "x", message: "This was interrupted by a restart. Try again." } })))
      .toEqual({ what: "Couldn't answer a question yet", how: "This was interrupted by a restart. Try again." });
  });

  it("never says a failed or stopped run did the thing (R4 D17)", () => {
    const capacity = { code: "capacity", message: "The agent is at capacity right now." };
    expect(describeRun(run({ skill: "spec", campaignName: "Product Designer", status: "failed", error: capacity })))
      .toEqual({ what: "Couldn't draft requirements for Product Designer yet", how: "The agent is at capacity right now." });
    expect(describeRun(run({ skill: "spec", campaignName: null, status: "failed", error: capacity })).what).toBe("Couldn't draft requirements yet");
    expect(describeRun(run({ skill: "sourcing", campaignName: null, status: "failed" })))
      .toEqual({ what: "Couldn't search for people yet", how: "Didn't finish" });
    expect(describeRun(run({ skill: "watch", campaignName: null, status: "cancelled" })))
      .toEqual({ what: "Couldn't keep sourcing yet", how: "Stopped" });
    expect(describeRun(run({ skill: "chat", campaignName: null, status: "failed", mine: false })).what).toBe("Couldn't answer a question yet (a teammate)");
    // Finished runs read as before.
    expect(describeRun(run({ skill: "spec", status: "done" })).what).toBe("Drafted requirements for Data Engineer");
    // The row says the same, and shows the reason beneath.
    const row = rowOf(run({ skill: "spec", campaignName: "Product Designer", status: "failed", error: capacity }));
    expect(row.title).toBe("Couldn't draft requirements for Product Designer yet");
    expect(row.title).not.toMatch(/drafted/i);
    expect(row.how).toBe("The agent is at capacity right now.");
  });
});

describe("small things people noticed", () => {
  it("knows a link that goes nowhere from Home itself", () => {
    expect(isKnownHash("#/")).toBe(true);
    expect(isKnownHash("")).toBe(true);
    expect(isKnownHash("#/home")).toBe(true);
    expect(isKnownHash("#/contacts/")).toBe(true);
    expect(isKnownHash("#/no-such-page")).toBe(false);
  });

  it("doesn't capitalise an email address that opens a message", () => {
    expect(readable(new ApiError(409, "conflict", "priya@smokehire.dev is already a member"))).toBe(
      "priya@smokehire.dev is already a member.",
    );
    expect(readable(new ApiError(409, "conflict", "already decided"))).toBe("Already decided.");
  });
});

describe("requests from a tab on another workspace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("say which workspace they mean, and hand a mismatch to the page", async () => {
    vi.stubEnv("VITE_API_URL", "http://api.test");
    vi.stubEnv("VITE_DEV_API_TOKEN", "dev-token");
    vi.resetModules();
    const client = await import("../api/client");
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(new Headers(init.headers));
      return new Response(JSON.stringify({ error: { code: "conflict", message: "You switched workspace in another tab.", workspaceChanged: true } }), { status: 409 });
    });
    const mismatch = vi.fn();
    client.onWorkspaceMismatch(mismatch);
    client.setTabWorkspace("org-1");
    await expect(client.api("POST", "/v1/campaigns", { name: "x" })).rejects.toMatchObject({ status: 409 });
    expect(sent[0]?.get("x-workspace")).toBe("org-1");
    expect(mismatch).toHaveBeenCalledTimes(1);
    client.setTabWorkspace(null);
    await client.api("GET", "/v1/me").catch(() => {});
    expect(sent[1]?.get("x-workspace")).toBe("personal");
  });
});

describe("live event streams", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("../api/client");
    vi.resetModules();
  });

  it("open with a ticket for their path, never the session token, and stop at `end`", async () => {
    const asked: Array<{ path: string; body: unknown }> = [];
    vi.doMock("../api/client", () => ({
      API_URL: "http://api.test",
      api: async (_m: string, path: string, body: unknown) => {
        asked.push({ path, body });
        return { ticket: "tkt.sig", expiresAt: 0 };
      },
    }));
    const opened: FakeSource[] = [];
    class FakeSource {
      static CLOSED = 2;
      readyState = 1;
      onerror: (() => void) | null = null;
      readonly handlers: Record<string, (e: MessageEvent<string>) => void> = {};
      constructor(readonly url: string) { opened.push(this); }
      addEventListener(type: string, fn: (e: MessageEvent<string>) => void) { this.handlers[type] = fn; }
      close() { this.readyState = FakeSource.CLOSED; }
    }
    vi.stubGlobal("EventSource", FakeSource);
    const { follow } = await import("../api/events");
    const seen: RunEvent[] = [];
    follow({ runId: "run-1" }, 0, (e) => seen.push(e));
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(asked[0]).toEqual({ path: "/v1/stream-tickets", body: { path: "/v1/runs/run-1/events" } });
    expect(opened[0]?.url).toBe("http://api.test/v1/runs/run-1/events?after=0&ticket=tkt.sig");
    expect(opened[0]?.url).not.toMatch(/access_token/);
    opened[0]?.handlers.done?.({ lastEventId: "7", data: JSON.stringify({ runId: "run-1", seq: 3, at }) } as MessageEvent<string>);
    expect(seen).toMatchObject([{ id: 7, type: "done" }]);
    opened[0]?.handlers.end?.({ data: "{}" } as MessageEvent<string>);
    expect(opened[0]?.readyState).toBe(FakeSource.CLOSED);
    opened[0]?.onerror?.();
    await new Promise((r) => setTimeout(r, 10));
    expect(opened).toHaveLength(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A followed chat or run that is not there stops asking (a stale tab used to ask every two seconds for
 * ever); a dropped line backs off instead of hammering.
 */

const { calls, script } = vi.hoisted(() => ({
  calls: [] as string[],
  script: { probe: (): unknown => undefined },
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    ApiError,
    API_URL: "http://api.test",
    api: async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      if (path === "/v1/stream-tickets") return { ticket: "t" };
      const out = script.probe();
      if (out instanceof Error) throw out;
      return out;
    },
  };
});

class FakeSource {
  static last: FakeSource | null = null;
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeSource.last = this; }
  addEventListener() {}
  close() { this.readyState = FakeSource.CLOSED; }
  fail() { this.readyState = FakeSource.CLOSED; this.onerror?.(); }
}

const { follow, retryDelay, whyGone, RETRY_CAP_MS } = await import("../api/events");
const { ApiError } = await import("../api/client");

const waits: number[] = [];

beforeEach(() => {
  calls.length = 0;
  waits.length = 0;
  FakeSource.last = null;
  script.probe = () => undefined;
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => { waits.push(ms); return setTimeout(fn, 0); },
    clearTimeout,
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("following a chat's events", () => {
  it("stops for good when the chat is not there, and says so once", async () => {
    const gone = vi.fn();
    follow({ conversationId: "c1" }, 0, () => {}, gone);
    await settle();
    script.probe = () => new ApiError(404, "not_found", "Chat not found.");
    FakeSource.last?.fail();
    await settle();
    expect(gone).toHaveBeenCalledWith("missing");
    // One ticket, one probe: nothing is asked again.
    expect(calls).toEqual(["POST /v1/stream-tickets", "GET /v1/conversations/c1"]);
    await settle();
    expect(calls.length).toBe(2);
  });

  it("stops quietly when the tab's workspace changed under it", async () => {
    const gone = vi.fn();
    follow({ runId: "r1" }, 0, () => {}, gone);
    await settle();
    script.probe = () => new ApiError(409, "conflict", "Your workspace changed.", { workspaceChanged: true });
    FakeSource.last?.fail();
    await settle();
    expect(gone).toHaveBeenCalledWith("moved");
  });

  it("backs off while a dropped line stays down, then carries on", async () => {
    follow({ conversationId: "c1" }, 0, () => {});
    await settle();
    script.probe = () => new ApiError(503, "unavailable", "Down.");
    FakeSource.last?.fail();
    await settle();
    FakeSource.last?.fail();
    await settle();
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(waits[1]!).toBeGreaterThan(waits[0]!);
  });
});

describe("the wait between tries", () => {
  it("doubles from two seconds and never passes the cap", () => {
    const at = (n: number) => retryDelay(n, 0.5);
    expect(at(0)).toBe(2000);
    expect(at(1)).toBe(4000);
    expect(at(2)).toBe(8000);
    expect(at(10)).toBe(RETRY_CAP_MS);
  });

  it("tells a missing chat from a moved workspace from a bad line", () => {
    expect(whyGone(new ApiError(404, "not_found", "x"))).toBe("missing");
    expect(whyGone(new ApiError(410, "gone", "x"))).toBe("missing");
    expect(whyGone(new ApiError(409, "conflict", "x"))).toBe("moved");
    expect(whyGone(new ApiError(500, "error", "x"))).toBeNull();
    expect(whyGone(new Error("offline"))).toBeNull();
  });
});

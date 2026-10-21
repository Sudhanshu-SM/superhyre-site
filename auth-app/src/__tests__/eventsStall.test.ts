import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A followed chat or run whose line goes quiet is noticed and made again, with a fresh ticket and a growing back-off;
 * "Reconnecting…" is said only once it has been down a few seconds, and the browser's own error event is never a
 * message. Time is fake, so a minute is a moment.
 */

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a followed event line that goes quiet", () => {
  const { script, listeners, made } = vi.hoisted(() => ({
    script: { tickets: 0 },
    listeners: new Map<string, (e: unknown) => void>(),
    made: [] as Array<{ url: string; closed: boolean; onopen: (() => void) | null; onerror: (() => void) | null }>,
  }));

  vi.mock("../api/client", () => {
    class ApiError extends Error {
      constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
    }
    return {
      ApiError,
      API_URL: "http://api.test",
      api: async (_method: string, path: string) => {
        if (path === "/v1/stream-tickets") { script.tickets += 1; return { ticket: `t${script.tickets}` }; }
        return undefined;
      },
    };
  });

  class FakeSource {
    static CLOSED = 2;
    readyState = 1;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(readonly url: string) { made.push(this); listeners.clear(); }
    addEventListener(type: string, fn: (e: unknown) => void) { listeners.set(type, fn); }
    close() { this.closed = true; this.readyState = FakeSource.CLOSED; }
  }

  let events: typeof import("../api/events");
  let line: typeof import("../api/streamLine");
  beforeEach(async () => {
    vi.useFakeTimers();
    script.tickets = 0;
    made.length = 0;
    listeners.clear();
    vi.stubGlobal("EventSource", FakeSource);
    vi.stubGlobal("window", { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id) });
    events = await import("../api/events");
    line = await import("../api/streamLine");
  });
  const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it("is opened again with a fresh ticket once nothing has come for too long, and says 'reconnecting' only after a delay", async () => {
    const stop = events.follow({ conversationId: "c1" }, 0, () => {});
    await tick(10);
    expect(made).toHaveLength(1);
    expect(line.streamLine()).toBe("live");

    await tick(events.STALL_MS + 6_000);
    expect(made[0]?.closed).toBe(true);
    expect(script.tickets).toBeGreaterThanOrEqual(2);
    // Down for longer than the delay and still down: now it is said, quietly.
    await tick(events.RECONNECT_SHOW_MS + 100);
    expect(line.streamLine()).toBe("reconnecting");

    // The new line opens and speaks: the quiet line goes.
    await tick(5_000);
    expect(made.length).toBeGreaterThanOrEqual(2);
    made.at(-1)?.onopen?.();
    expect(line.streamLine()).toBe("live");
    stop();
  });

  it("counts the server's ping as proof of life, so a quiet but healthy line is left alone", async () => {
    const stop = events.follow({ conversationId: "c1" }, 0, () => {});
    await tick(10);
    for (let i = 0; i < 6; i++) {
      await tick(15_000);
      listeners.get("ping")?.({});
    }
    expect(made).toHaveLength(1);
    expect(made[0]?.closed).toBe(false);
    stop();
  });

  it("does not show 'reconnecting' for a blip that mends itself, and never reads the browser's own error as a message", async () => {
    const seen = vi.fn();
    const stop = events.follow({ conversationId: "c1" }, 0, seen);
    await tick(10);
    const source = made[0];
    source?.onerror?.();
    expect(line.streamLine()).toBe("live");
    await tick(2_000);
    source?.onopen?.();
    await tick(events.RECONNECT_SHOW_MS + 1_000);
    expect(line.streamLine()).toBe("live");
    // A native error event reaches a listener with no data: it is not an event of the run.
    listeners.get("message")?.({ data: undefined });
    listeners.get("progress")?.({ type: "error" });
    expect(seen).not.toHaveBeenCalled();
    stop();
  });

  it("stops watching when it is stopped: no timer is left behind", async () => {
    const stop = events.follow({ runId: "r1" }, 0, () => {});
    await tick(10);
    stop();
    await tick(events.STALL_MS * 3);
    expect(made).toHaveLength(1);
    expect(line.streamLine()).toBe("live");
  });
});


import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A streamed event with nothing readable in it ("undefined", an empty frame, text that is not JSON) is ignored; it
 * used to throw "undefined is not valid JSON" out of the stream's handler on a reload.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    ApiError, API_URL: "http://api.test",
    api: async (_m: string, path: string) => {
      if (path === "/v1/stream-tickets") return { ticket: "t" };
      throw new ApiError(503, "unavailable", "Down.");
    },
  };
});

class FakeSource {
  static last: FakeSource | null = null;
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private handlers = new Map<string, ((e: unknown) => void)[]>();
  constructor(readonly url: string) { FakeSource.last = this; }
  addEventListener(type: string, fn: (e: unknown) => void) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]); }
  close() { this.readyState = FakeSource.CLOSED; }
  emit(type: string, data: unknown, lastEventId = "7") { for (const fn of this.handlers.get(type) ?? []) fn({ data, lastEventId }); }
  /** What a browser fires on a dropped connection: an `error` event with no data. */
  emitNative(type = "error") { for (const fn of this.handlers.get(type) ?? []) fn({ type }); }
  fail() { this.readyState = FakeSource.CLOSED; this.onerror?.(); }
}

const { eventPayload, follow } = await import("../api/events");

const waits: number[] = [];
beforeEach(() => {
  FakeSource.last = null;
  waits.length = 0;
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal("window", { setTimeout: (fn: () => void, ms: number) => { waits.push(ms); return setTimeout(fn, 0); }, clearTimeout });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("what a streamed event carries", () => {
  it("is the object it holds, and nothing for anything else", () => {
    expect(eventPayload('{"step":"phase","id":"a"}')).toEqual({ step: "phase", id: "a" });
    expect(eventPayload(' {"a":1} ')).toEqual({ a: 1 });
    for (const bad of [undefined, null, 5, "", "   ", "undefined", "null", "not json", "{", "[1,2]", "7", '"text"', "true"]) expect(eventPayload(bad), String(bad)).toBeNull();
  });
});

describe("following events", () => {
  const settle = () => new Promise((r) => setTimeout(r, 10));

  it("never throws on an unreadable frame, passes on the readable ones, and still moves its place in the stream", async () => {
    const got: unknown[] = [];
    follow({ conversationId: "c1" }, 0, (e) => got.push(e));
    await settle();
    const es = FakeSource.last!;
    expect(() => {
      es.emit("progress", "undefined", "3");
      es.emit("message", "", "4");
      es.emit("notice", "{oops", "5");
      es.emit("message", '{"text":"hello"}', "6");
    }).not.toThrow();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: "message", text: "hello", eventId: 6 });
  });

  it("does not take the browser's own error event (a dropped connection) for a message, or for a sign the line works", async () => {
    const got: unknown[] = [];
    follow({ conversationId: "c1" }, 0, (e) => got.push(e));
    await settle();
    FakeSource.last!.fail();
    await settle();
    // the line is back, then drops again and again: native error events arrive in between
    FakeSource.last!.emitNative("error");
    FakeSource.last!.fail();
    await settle();
    FakeSource.last!.emitNative("error");
    FakeSource.last!.emitNative("error");
    FakeSource.last!.fail();
    await settle();
    expect(got).toEqual([]);
    // the waits kept growing: a native error never sent the back-off back to its start
    expect(waits.length).toBeGreaterThanOrEqual(3);
    expect(waits[1]!).toBeGreaterThan(waits[0]!);
    expect(waits[2]!).toBeGreaterThan(waits[1]!);
  });

  it("still reads an error event the server sent, which has data", async () => {
    const got: unknown[] = [];
    follow({ conversationId: "c1" }, 0, (e) => got.push(e));
    await settle();
    FakeSource.last!.emit("error", '{"message":"The run stopped."}', "9");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: "error", message: "The run stopped.", eventId: 9 });
  });
});

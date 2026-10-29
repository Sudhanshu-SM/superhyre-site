import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A phase line's own id must survive the stream. `follow()` used to set every event's `id` to the stream's
 * number, so a line was known by its phase name, two lines of one kind were one, and an approved card
 * (`approval:<seq>`) found none of its own: it said "Working" and nothing else for the whole of a draft.
 * The events here have the shape the server's event stream sends (ids `approval:<seq>:*`).
 */

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    ApiError,
    API_URL: "http://api.test",
    api: async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      return { ticket: "t" };
    },
  };
});

class FakeSource {
  static last: FakeSource | null = null;
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
  constructor(readonly url: string) { FakeSource.last = this; }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() { this.readyState = FakeSource.CLOSED; }
  /** What the server sends: an event of `type`, its stream id, and the payload as JSON. */
  send(type: string, id: number, payload: Record<string, unknown>) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(payload), lastEventId: String(id) } as MessageEvent<string>);
    }
  }
}

const { follow, runEventOf } = await import("../api/events");
const { applyPhaseEvent, approvalLines } = await import("../agentPhases");
const { eventFromRow } = await import("../liveSourcing");
import type { PhaseLine } from "../agentPhases";
import type { RunEvent } from "../api/events";

const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  calls.length = 0;
  FakeSource.last = null;
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** The approval's lines, as the server writes them while `approve_role_spec` runs. */
const STREAM: Array<[string, Record<string, unknown>]> = [
  ["approval:13", { phase: "decide", state: "running", label: "Preparing the requirements" }],
  ["approval:13:read", { phase: "understand", state: "running", label: "Reading the job description" }],
  ["approval:13:read", { phase: "understand", state: "done", label: "Read the job description" }],
  ["approval:13:draft", { phase: "write", state: "running", label: "Drafting the requirements", detail: "Customer Success Partner, 3 s" }],
  ["approval:13:draft", { phase: "write", state: "running", label: "Drafting the requirements", detail: "Customer Success Partner, 42 s" }],
  ["approval:13:draft", { phase: "write", state: "done", label: "Drafted the requirements" }],
  ["approval:13:approve", { phase: "decide", state: "done", label: "Approved version 1" }],
  ["approval:13:search", { phase: "search", state: "running", label: "Starting the search" }],
];

describe("a followed run's events", () => {
  it("keeps a phase line's own id and says where the event came in the stream", async () => {
    const seen: RunEvent[] = [];
    follow({ conversationId: "c1" }, 0, (e) => seen.push(e));
    await settle();
    const source = FakeSource.last;
    STREAM.forEach(([id, rest], i) => source?.send("progress", 100 + i, { step: "phase", id, ...rest, runId: "r1", seq: i + 1, at: "2026-10-12T10:00:00.000Z" }));
    expect(seen.map((e) => e.id)).toEqual(STREAM.map(([id]) => id));
    expect(seen.map((e) => e.eventId)).toEqual(STREAM.map((_, i) => 100 + i));

    // The card that was approved finds every line it wrote, in the order they began, and their last words.
    const lines = seen.reduce<readonly PhaseLine[]>((acc, e) => applyPhaseEvent(acc, e), []);
    const own = approvalLines(lines, 13);
    expect(own.map((l) => l.id)).toEqual(["approval:13", "approval:13:read", "approval:13:draft", "approval:13:approve", "approval:13:search"]);
    expect(own.map((l) => l.label)).toEqual([
      "Preparing the requirements", "Read the job description", "Drafted the requirements", "Approved version 1", "Starting the search",
    ]);
    expect(own.find((l) => l.id === "approval:13:draft")?.state).toBe("done");
  });

  it("falls back to the stream's number for an event with no id of its own", async () => {
    const seen: RunEvent[] = [];
    follow({ runId: "r1" }, 0, (e) => seen.push(e));
    await settle();
    FakeSource.last?.send("message", 7, { text: "Hello", runId: "r1", seq: 1, at: "2026-10-12T10:00:00.000Z" });
    expect(seen[0]).toMatchObject({ id: 7, eventId: 7, type: "message" });
  });

  it("keeps two tool calls of one kind as two lines, each under its own id", () => {
    const first = runEventOf({ step: "phase", id: "tool:1", phase: "search", state: "done", label: "Looked at the shortlist" }, 11, "progress");
    const second = runEventOf({ step: "phase", id: "tool:2", phase: "search", state: "done", label: "Looked through the people found" }, 12, "progress");
    const lines = [first, second].reduce<readonly PhaseLine[]>((acc, e) => applyPhaseEvent(acc, e), []);
    expect(lines.map((l) => l.label)).toEqual(["Looked at the shortlist", "Looked through the people found"]);
  });

  it("reads a stored run back with the same ids", () => {
    const row = { id: 55, seq: 3, type: "progress" as const, payload: { step: "phase", id: "approval:13:draft", phase: "write", label: "Drafting the requirements" }, createdAt: "2026-10-12T10:00:00.000Z" };
    expect(eventFromRow("r1", row)).toMatchObject({ id: "approval:13:draft", eventId: 55 });
    expect(eventFromRow("r1", { ...row, payload: { step: "tool" } })).toMatchObject({ id: 55, eventId: 55 });
  });
});

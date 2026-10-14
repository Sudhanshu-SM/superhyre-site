import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiNotification } from "../api/tasks";

/**
 * The bell reads again every 15 seconds while the tab is in front (an invitation or a request to join shows
 * without a reload), after writes, and from one loop only: a workspace change never leaves a second timer.
 */

const { net, said, writers } = vi.hoisted(() => ({
  net: { reads: 0, list: [] as unknown[] },
  said: [] as string[],
  writers: new Set<(method: string, path: string) => void>(),
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    LIVE: true,
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    onWrite: (fn: (method: string, path: string) => void) => { writers.add(fn); return () => writers.delete(fn); },
    setTabWorkspace: vi.fn(),
  };
});
vi.mock("../api/tasks", async (orig) => ({
  ...(await orig<typeof import("../api/tasks")>()),
  listNotifications: async () => {
    net.reads += 1;
    return { notifications: net.list as ApiNotification[], unread: net.list.length };
  },
  markNotificationsRead: async () => ({ updated: 1 }),
}));
vi.mock("../problems", () => ({ reportProblem: (t: string) => { said.push(t); } }));

const store = await import("../homeStore");
const { identityApi } = await import("../api/identity");
const { ApiError } = await import("../api/client");

const note = (id: string, over: Partial<ApiNotification> = {}): ApiNotification => ({
  id, kind: "invitation", text: "Ada invited you to join Acme as a recruiter.", link: null, subjectKind: null, subjectId: null,
  readAt: null, createdAt: "2026-10-11T10:00:00Z", open: true, ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  net.reads = 0;
  net.list = [];
  said.length = 0;
  store.resetHomeStore();
});
afterEach(() => {
  store.resetHomeStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the bell's poll", () => {
  it("reads at once, then every 15 seconds", async () => {
    store.ensureNotices();
    await vi.advanceTimersByTimeAsync(0);
    expect(net.reads).toBe(1);
    await vi.advanceTimersByTimeAsync(store.POLL_MS);
    expect(net.reads).toBe(2);
    await vi.advanceTimersByTimeAsync(store.POLL_MS);
    expect(net.reads).toBe(3);
    expect(store.POLL_MS).toBeLessThanOrEqual(15_000);
  });

  it("keeps one loop however many times the workspace changes", async () => {
    for (let i = 0; i < 5; i += 1) {
      store.ensureNotices();
      store.resetHomeStore();
    }
    store.ensureNotices();
    await vi.advanceTimersByTimeAsync(0);
    net.reads = 0;
    await vi.advanceTimersByTimeAsync(store.POLL_MS * 4);
    // One read a tick, not one per workspace the tab has been in.
    expect(net.reads).toBe(4);
    expect(store.noticeLoopRunning()).toBe(true);
    store.resetHomeStore();
    expect(store.noticeLoopRunning()).toBe(false);
    net.reads = 0;
    await vi.advanceTimersByTimeAsync(store.POLL_MS * 3);
    expect(net.reads).toBe(0);
  });

  it("reads again soon after a write, but not after marking things read", async () => {
    store.ensureNotices();
    await vi.advanceTimersByTimeAsync(0);
    net.reads = 0;
    for (const fn of writers) fn("POST", "/v1/members/invites");
    for (const fn of writers) fn("POST", "/v1/members/invites");
    await vi.advanceTimersByTimeAsync(1000);
    // A burst of writes is one read.
    expect(net.reads).toBe(1);
    for (const fn of writers) fn("POST", "/v1/notifications/read");
    await vi.advanceTimersByTimeAsync(1000);
    expect(net.reads).toBe(1);
  });

  it("shows an invitation that arrived between two reads on the next one", async () => {
    store.ensureNotices();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.noticeLoopRunning()).toBe(true);
    expect(store.noticesNow().items).toHaveLength(0);
    net.list = [note("n1")];
    await vi.advanceTimersByTimeAsync(store.POLL_MS);
    expect(store.noticesNow().items.map((n) => n.id)).toEqual(["n1"]);
    expect(store.noticesNow().unread).toBe(1);
  });
});

describe("answering an invitation or a request that is no longer there", () => {
  it("says so calmly and reads the list again, instead of leaving a dead Accept", async () => {
    vi.spyOn(identityApi, "acceptInvitation").mockRejectedValue(new ApiError(404, "not_found", "This invitation is no longer valid."));
    const before = net.reads;
    const r = await store.answerInvitation("n1", true);
    expect(r).toEqual({ ok: false });
    expect(said).toEqual(["That invitation is no longer open."]);
    await vi.advanceTimersByTimeAsync(0);
    expect(net.reads).toBeGreaterThan(before);
  });

  it("puts the line back with the reason for any other refusal", async () => {
    vi.spyOn(identityApi, "acceptInvitation").mockRejectedValue(new ApiError(403, "forbidden", "You're already in Northwind."));
    expect(await store.answerInvitation("n1", true)).toEqual({ ok: false });
    expect(said).toEqual(["That invitation wasn't accepted. You're already in Northwind."]);
  });

  it("settles a request someone else answered first, and says so", async () => {
    vi.spyOn(identityApi, "decide").mockRejectedValue(new ApiError(404, "not_found", "This request has already been dealt with."));
    expect(await store.answerRequest("n2", "r2", true)).toBe(false);
    expect(said).toEqual(["Someone else already answered that request."]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledItem } from "../api/schedules";

/**
 * The schedules store with the API connected: the lists the screen, the rail and a campaign's chat
 * view ask for, paging, and a cancel or a new time that shows at once, is replaced by the server's
 * answer, and is put back (with a line saying why) when refused. The API is a small stand-in whose
 * answers can be held back to look at the screen in between.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    /** When set, writes wait for this to be called, so the state in between can be read. */
    hold: null as null | Promise<void>,
    fail: null as null | { match: RegExp; status: number; message: string },
    calls: [] as string[],
  },
  problems: [] as string[],
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async (method: string, path: string, body?: unknown) => {
      server.calls.push(`${method} ${path}`);
      if (server.hold && method !== "GET") await server.hold;
      await Promise.resolve();
      if (server.fail && server.fail.match.test(`${method} ${path}`)) {
        const f = server.fail;
        server.fail = null;
        throw new ApiError(f.status, "error", f.message);
      }
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../schedulesStore");
const identity = await import("../api/identity");

const UP = store.UPCOMING;
const HIST = { status: "history", kind: "all", campaignId: null } as const;

let n = 0;
const make = (over: Partial<ScheduledItem> = {}): ScheduledItem => {
  const i = ++n;
  const at = new Date(Date.UTC(2026, 9, 11, 4, i)).toISOString();
  return {
    id: `s${i}`, kind: "reminder", title: `Reminder ${i}`, status: "scheduled", runAt: at, nextRunAt: at, timezone: "Asia/Kolkata", repeat: "none",
    until: null, occurrencesDone: 0, summary: `Reminder: 'Thing ${i}'`, campaign: null, candidate: null,
    createdBy: { kind: "user", id: "u1", name: "Asha" }, approvedBy: null, lastError: null, lastRunAt: null, result: null, canCancel: true, ...over,
  };
};

let upcoming: ScheduledItem[];
let history: ScheduledItem[];
let pages: Record<string, { items: ScheduledItem[]; nextCursor: string | null }>;

const url = (path: string) => new URL(`http://x${path}`);
const lastList = () => url(server.calls.filter((c) => c.startsWith("GET /v1/schedules")).map((c) => c.slice(4)).at(-1) ?? "");
const lists = () => server.calls.filter((c) => c.startsWith("GET /v1/schedules"));

beforeEach(() => {
  server.handle = base;
  n = 0;
  upcoming = [make({ id: "a1" }), make({ id: "a2" }), make({ id: "a3" })];
  history = [make({ id: "h1", status: "done", lastRunAt: "2026-10-10T08:00:00.000Z" })];
  pages = {};
  server.hold = null;
  server.fail = null;
  server.calls = [];
  problems.length = 0;
  store.resetSchedules();
});

function base(method: string, path: string, body: unknown): unknown {
  const u = url(path);
  if (method === "GET" && u.pathname === "/v1/schedules") {
    const status = u.searchParams.get("status") ?? "upcoming";
    const cursor = u.searchParams.get("cursor");
    if (cursor && pages[cursor]) return pages[cursor];
    const kind = u.searchParams.get("kind");
    const campaign = u.searchParams.get("campaignId");
    const items = (status === "history" ? history : upcoming)
      .filter((i) => !kind || i.kind === kind)
      .filter((i) => !campaign || i.campaign?.id === campaign);
    return { items, nextCursor: pages.first && !cursor ? "first" : null };
  }
  const m = /^\/v1\/schedules\/([^/]+)$/.exec(u.pathname);
  if (m) {
    const id = m[1];
    if (method === "DELETE") return undefined;
    if (method === "PATCH") {
      const old = upcoming.find((i) => i.id === id);
      const runAt = (body as { runAt: string }).runAt;
      return { ...old, runAt, nextRunAt: runAt };
    }
  }
  if (method === "POST" && u.pathname === "/v1/schedules") {
    const b = body as { kind: string; runAt: string; payload: { text?: string } };
    return make({ id: "new-1", kind: b.kind, runAt: b.runAt, nextRunAt: b.runAt, summary: `Reminder: '${b.payload.text ?? ""}'` });
  }
  return undefined;
}

const settle = () => new Promise<void>((r) => setTimeout(r, 0));
const feed = (q: typeof UP | typeof HIST) => store.schedulesNow().feeds[store.feedKey(q)];

describe("loading", () => {
  it("asks for the first page of what is coming up", async () => {
    await store.ensureFeed(UP);
    expect(feed(UP)).toMatchObject({ phase: "ready", next: null });
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(lists()).toEqual(["GET /v1/schedules?limit=50"]);
  });

  it("asks for the history, a kind and a campaign when told to", async () => {
    await store.ensureFeed(HIST);
    expect(lastList().searchParams.get("status")).toBe("history");
    await store.ensureFeed({ status: "upcoming", kind: "task", campaignId: "c1" });
    expect(lastList().searchParams.get("kind")).toBe("task");
    expect(lastList().searchParams.get("campaignId")).toBe("c1");
    expect(lastList().searchParams.has("status")).toBe(false);
  });

  it("keeps each list on its own, so the screen and the rail agree", async () => {
    await store.ensureFeed(UP);
    await store.ensureFeed(HIST);
    expect(feed(UP)?.items).toHaveLength(3);
    expect(feed(HIST)?.items.map((i) => i.id)).toEqual(["h1"]);
  });

  it("shares one request, and doesn't ask again straight away", async () => {
    await Promise.all([store.ensureFeed(UP), store.ensureFeed(UP)]);
    await store.ensureFeed(UP);
    expect(lists()).toHaveLength(1);
    await store.reloadFeed(UP);
    expect(lists()).toHaveLength(2);
  });

  it("says it couldn't load, and tries again when asked", async () => {
    server.fail = { match: /^GET \/v1\/schedules/, status: 500, message: "Something went wrong on our side." };
    await store.ensureFeed(UP);
    expect(feed(UP)).toMatchObject({ phase: "failed", items: [] });
    await store.reloadFeed(UP);
    expect(feed(UP)).toMatchObject({ phase: "ready" });
    expect(feed(UP)?.items).toHaveLength(3);
  });

  it("keeps what it had when a refresh fails", async () => {
    await store.ensureFeed(UP);
    server.fail = { match: /^GET/, status: 500, message: "x" };
    await store.reloadFeed(UP);
    expect(feed(UP)).toMatchObject({ phase: "ready" });
    expect(feed(UP)?.items).toHaveLength(3);
  });

  it("shows what is there while a refresh runs, not a blank", async () => {
    await store.ensureFeed(UP);
    const p = store.reloadFeed(UP);
    expect(feed(UP)).toMatchObject({ phase: "ready" });
    expect(feed(UP)?.items).toHaveLength(3);
    await p;
  });

  it("reads a server without the routes as couldn't load, and tells the rail to leave its row out", async () => {
    server.fail = { match: /^GET/, status: 404, message: "Not found." };
    await store.ensureFeed(UP);
    expect(feed(UP)?.phase).toBe("failed");
    expect(store.schedulesNow().unavailable).toBe(true);
  });

  it("drops a row it can't read rather than the whole page", async () => {
    server.handle = () => ({ items: [make({ id: "ok" }), { nope: true }, null], nextCursor: null });
    await store.ensureFeed(UP);
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["ok"]);
  });

  it("forgets everything when the workspace changes", async () => {
    await store.ensureFeed(UP);
    identity.workspaceChanged();
    expect(store.schedulesNow().feeds).toEqual({});
  });
});

describe("paging", () => {
  it("appends the next page without repeating anything", async () => {
    pages.first = { items: [make({ id: "a3" }), make({ id: "a4" }), make({ id: "a5" })], nextCursor: null };
    await store.ensureFeed(UP);
    expect(feed(UP)?.next).toBe("first");
    await store.loadMore(UP);
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(feed(UP)).toMatchObject({ next: null, more: "idle" });
    expect(lastList().searchParams.get("cursor")).toBe("first");
  });

  it("keeps what is shown and offers to try again when a page fails", async () => {
    pages.first = { items: [make({ id: "a9" })], nextCursor: null };
    await store.ensureFeed(UP);
    server.fail = { match: /cursor=first/, status: 500, message: "x" };
    await store.loadMore(UP);
    expect(feed(UP)).toMatchObject({ more: "failed", next: "first" });
    expect(feed(UP)?.items).toHaveLength(3);
    await store.loadMore(UP);
    expect(feed(UP)?.items).toHaveLength(4);
  });

  it("does nothing at the end of the list", async () => {
    await store.ensureFeed(UP);
    await store.loadMore(UP);
    expect(lists()).toHaveLength(1);
  });
});

describe("cancelling", () => {
  it("takes it off what is coming up at once, and lists it in the history as cancelled", async () => {
    await store.ensureFeed(UP);
    await store.ensureFeed(HIST);
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const p = store.cancelItem("a2");
    await settle();
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a1", "a3"]);
    expect(feed(HIST)?.items[0]).toMatchObject({ id: "a2", status: "cancelled", canCancel: false });
    expect(store.schedulesNow().working).toEqual(["a2"]);
    release();
    expect(await p).toEqual({ ok: true });
    expect(store.schedulesNow().working).toEqual([]);
    expect(server.calls).toContain("DELETE /v1/schedules/a2");
  });

  it("only lists it in a history that its filters would show", async () => {
    await store.ensureFeed(UP);
    await store.ensureFeed({ status: "history", kind: "task", campaignId: null });
    await store.ensureFeed({ status: "history", kind: "reminder", campaignId: null });
    await store.cancelItem("a1");
    expect(store.schedulesNow().feeds[store.feedKey({ status: "history", kind: "task", campaignId: null })]?.items).toHaveLength(0);
    expect(store.schedulesNow().feeds[store.feedKey({ status: "history", kind: "reminder", campaignId: null })]?.items.map((i) => i.id)).toEqual(["a1", "h1"]);
  });

  it("puts it back exactly where it was, with a line saying why, when refused", async () => {
    await store.ensureFeed(UP);
    await store.ensureFeed(HIST);
    server.fail = { match: /^DELETE/, status: 403, message: "Only whoever set this up can change it." };
    const r = await store.cancelItem("a2");
    expect(r).toEqual({ ok: false, message: "Only whoever set this up can change it." });
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(feed(HIST)?.items.map((i) => i.id)).toEqual(["h1"]);
    expect(problems).toEqual(['"Reminder 2" wasn\'t cancelled. Only whoever set this up can change it.']);
    expect(store.schedulesNow().working).toEqual([]);
  });

  it("looks at the lists again when it turns out to be gone or already run", async () => {
    await store.ensureFeed(UP);
    store.resetSchedules();
    await store.ensureFeed(UP);
    // Watching, as a screen on view does, so a refresh reads it again.
    server.fail = { match: /^DELETE/, status: 409, message: "This has already run." };
    const before = lists().length;
    await store.cancelItem("a1");
    await settle();
    // Nobody is watching in this test, so the list is marked as needing a look instead.
    expect(feed(UP)?.at).toBe(0);
    expect(lists().length).toBe(before);
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(problems[0]).toContain("This has already run.");
  });

  it("withdraws an email that has gone to the sender: it stays in the history, as withdrawn", async () => {
    history = [make({ id: "e1", kind: "email", status: "done", canCancel: true, lastRunAt: "2026-10-10T08:00:00.000Z", result: { delivery: "queued" } })];
    await store.ensureFeed(HIST);
    await store.cancelItem("e1");
    expect(feed(HIST)?.items[0]).toMatchObject({ id: "e1", status: "done", canCancel: false, result: { delivery: "cancelled" } });
    server.fail = { match: /^DELETE/, status: 500, message: "x" };
    store.resetSchedules();
    history = [make({ id: "e2", kind: "email", status: "done", canCancel: true, result: { delivery: "queued" } })];
    await store.ensureFeed(HIST);
    await store.cancelItem("e2");
    expect(feed(HIST)?.items[0]).toMatchObject({ id: "e2", canCancel: true, result: { delivery: "queued" } });
  });

  it("won't cancel what it doesn't know, or twice at once", async () => {
    await store.ensureFeed(UP);
    expect(await store.cancelItem("nope")).toEqual({ ok: false, message: "That has already changed." });
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const first = store.cancelItem("a1");
    await settle();
    expect(await store.cancelItem("a1")).toMatchObject({ ok: false });
    release();
    await first;
  });
});

describe("a new time", () => {
  const LATER = "2026-10-20T10:00:00.000Z";

  it("shows at once, in order, and takes the server's answer", async () => {
    await store.ensureFeed(UP);
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const p = store.rescheduleItem("a1", LATER);
    await settle();
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a2", "a3", "a1"]);
    expect(feed(UP)?.items[2]).toMatchObject({ runAt: LATER, nextRunAt: LATER });
    release();
    expect(await p).toEqual({ ok: true });
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a2", "a3", "a1"]);
    expect(server.calls).toContain("PATCH /v1/schedules/a1");
  });

  it("puts the old time back, with a line saying why, when refused", async () => {
    await store.ensureFeed(UP);
    const was = feed(UP)?.items[0];
    server.fail = { match: /^PATCH/, status: 409, message: "This has already run, so it can't be changed." };
    const r = await store.rescheduleItem("a1", LATER);
    expect(r).toMatchObject({ ok: false, message: "This has already run, so it can't be changed." });
    expect(feed(UP)?.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(feed(UP)?.items[0]).toEqual(was);
    expect(problems[0]).toBe('The new time for "Reminder 1" wasn\'t saved. This has already run, so it can\'t be changed.');
  });

  it("changes it in every list that has it", async () => {
    await store.ensureFeed(UP);
    await store.ensureFeed({ status: "upcoming", kind: "reminder", campaignId: null });
    await store.rescheduleItem("a2", LATER);
    for (const f of Object.values(store.schedulesNow().feeds)) expect(f.items.find((i) => i.id === "a2")?.nextRunAt).toBe(LATER);
  });
});

describe("looking again", () => {
  it("marks lists nobody is looking at as needing a look, and doesn't ask for them", async () => {
    await store.ensureFeed(UP);
    await store.ensureFeed(HIST);
    const before = lists().length;
    await store.refreshSchedules();
    expect(lists().length).toBe(before);
    expect(feed(UP)?.at).toBe(0);
    expect(feed(HIST)?.at).toBe(0);
    // Marked stale, so opening one asks again.
    await store.ensureFeed(UP);
    expect(lists().length).toBe(before + 1);
  });

  it("is told when an approval in chat stored something", async () => {
    await store.ensureFeed(UP);
    await store.schedulesChanged();
    expect(feed(UP)?.at).toBe(0);
  });
});

describe("watching", () => {
  const FAR = "2030-01-01T00:00:00.000Z";
  const T0 = Date.parse("2026-10-10T09:00:00Z");

  /** Fake clock; the stand-in server answers from `upcoming` as the test sets it. */
  async function watched(stop: Array<() => void>) {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    stop.push(store.watchFeed(UP));
    await vi.advanceTimersByTimeAsync(0);
    stop.push(store.startPolling());
  }
  const gets = () => lists().length;

  it("looks again every minute while something is on screen", async () => {
    const stop: Array<() => void> = [];
    upcoming = [make({ id: "a1", runAt: FAR, nextRunAt: FAR })];
    try {
      await watched(stop);
      expect(gets()).toBe(1);
      await vi.advanceTimersByTimeAsync(59_000);
      expect(gets()).toBe(1);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(gets()).toBe(2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(gets()).toBe(3);
    } finally {
      for (const s of stop) s();
      vi.useRealTimers();
    }
  });

  it("looks a little after the next thing is due, so it is seen going out", async () => {
    const stop: Array<() => void> = [];
    const due = new Date(T0 + 20_000).toISOString();
    upcoming = [make({ id: "a1", runAt: due, nextRunAt: due })];
    try {
      await watched(stop);
      expect(gets()).toBe(1);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(gets()).toBe(1);
      // It has gone: the answer no longer lists it, and the look after that is a minute away.
      upcoming = [];
      await vi.advanceTimersByTimeAsync(1_500);
      expect(gets()).toBe(2);
      expect(feed(UP)?.items).toEqual([]);
      await vi.advanceTimersByTimeAsync(58_000);
      expect(gets()).toBe(2);
      await vi.advanceTimersByTimeAsync(2_500);
      expect(gets()).toBe(3);
    } finally {
      for (const s of stop) s();
      vi.useRealTimers();
    }
  });

  it("stops looking when nothing is on screen", async () => {
    const stop: Array<() => void> = [];
    upcoming = [make({ id: "a1", runAt: FAR, nextRunAt: FAR })];
    try {
      await watched(stop);
      for (const s of stop.splice(0)) s();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(gets()).toBe(1);
    } finally {
      for (const s of stop) s();
      vi.useRealTimers();
    }
  });

  it("doesn't read a list again that nobody is looking at", async () => {
    const stop: Array<() => void> = [];
    upcoming = [make({ id: "a1", runAt: FAR, nextRunAt: FAR })];
    try {
      await watched(stop);
      await store.ensureFeed(HIST);
      expect(gets()).toBe(2);
      await vi.advanceTimersByTimeAsync(60_500);
      // Only the list on screen was asked for again.
      expect(gets()).toBe(3);
      expect(feed(HIST)?.at).toBe(0);
    } finally {
      for (const s of stop) s();
      vi.useRealTimers();
    }
  });
});

describe("what the rail says", () => {
  it("counts what is coming up and names the next one", async () => {
    await store.ensureFeed(UP);
    const s = store.upcomingSummary(feed(UP)!);
    expect(s).toMatchObject({ phase: "ready", count: 3, more: false });
    expect(s.next?.id).toBe("a1");
  });

  it("says there is more than the first page holds", async () => {
    pages.first = { items: [], nextCursor: null };
    await store.ensureFeed(UP);
    expect(store.upcomingSummary(feed(UP)!)).toMatchObject({ count: 3, more: true });
  });

  it("starts from nothing", () => {
    expect(store.upcomingSummary(store.EMPTY_FEED)).toEqual({ phase: "idle", count: 0, more: false, next: null });
  });
});

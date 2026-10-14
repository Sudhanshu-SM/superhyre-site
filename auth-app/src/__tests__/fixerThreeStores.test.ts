import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiTask } from "../api/tasks";

/**
 * The stores behind Home's tasks, Settings → Memory and Settings → Do not contact, with the API
 * connected and a small stand-in for it: a deleted task can be taken back until its delete is sent,
 * a task's words and day change at once, a forgotten note is remembered as forgotten, and an address
 * typed into the do-not-contact list is shown whole for the rest of the visit.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    fail: null as null | { match: RegExp; status: number; message: string },
    calls: [] as string[],
    bodies: [] as unknown[],
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
      server.bodies.push(body);
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

const home = await import("../homeStore");
const memory = await import("../memoryStore");
const dnc = await import("../dncStore");
const identity = await import("../api/identity");

const task = (over: Partial<ApiTask> = {}): ApiTask => ({
  id: "t1", title: "Call the first three shortlisted people", kind: "manual", status: "todo", dueAt: "2026-10-10T17:30:00.000Z",
  assigneeId: null, campaign: null, candidate: null, action: null, createdAt: "2026-10-10T08:00:00.000Z", resolvedAt: null, ...over,
});

const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe("Home's tasks", () => {
  let tasks: ApiTask[];

  beforeEach(() => {
    vi.useFakeTimers();
    tasks = [task(), task({ id: "t2", title: "Review the brief" })];
    server.fail = null;
    server.calls = [];
    server.bodies = [];
    problems.length = 0;
    server.handle = (method, path, body) => {
      const id = /^\/v1\/tasks\/([^/?]+)$/.exec(path)?.[1];
      if (method === "GET" && path.startsWith("/v1/tasks?status=open")) return { tasks };
      if (method === "GET" && path.startsWith("/v1/tasks?status=done")) return { tasks: [] };
      if (method === "GET") return { tasks: [] };
      if (method === "DELETE" && id) { tasks = tasks.filter((t) => t.id !== id); return undefined; }
      if (method === "PATCH" && id) {
        const patch = body as Partial<ApiTask>;
        tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
        return tasks.find((t) => t.id === id);
      }
      return undefined;
    };
    home.resetHomeStore();
  });
  afterEach(() => { vi.useRealTimers(); });

  async function load() {
    home.ensureTasks();
    await vi.advanceTimersByTimeAsync(0);
    await settle();
  }

  it("takes a deleted task off at once and deletes it only when the undo time has passed", async () => {
    await load();
    expect(home.tasksNow().items.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(home.removeTask("t1")).toBe(true);
    expect(home.tasksNow().items.map((t) => t.id)).toEqual(["t2"]);
    expect(server.calls).not.toContain("DELETE /v1/tasks/t1");
    await vi.advanceTimersByTimeAsync(home.UNDO_MS + 10);
    await settle();
    expect(server.calls).toContain("DELETE /v1/tasks/t1");
    expect(home.tasksNow().items.map((t) => t.id)).toEqual(["t2"]);
  });

  it("brings a task back, and never sends the delete, when it is undone in time", async () => {
    await load();
    home.removeTask("t1");
    await vi.advanceTimersByTimeAsync(2000);
    home.undoRemoveTask("t1");
    expect(home.tasksNow().items.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    await vi.advanceTimersByTimeAsync(home.UNDO_MS * 2);
    await settle();
    expect(server.calls).not.toContain("DELETE /v1/tasks/t1");
  });

  it("puts a task back with a line when its delete is refused", async () => {
    await load();
    server.fail = { match: /^DELETE/, status: 403, message: "Only whoever made it can delete this." };
    home.removeTask("t2");
    await vi.advanceTimersByTimeAsync(home.UNDO_MS + 10);
    await settle();
    expect(home.tasksNow().items.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(problems[0]).toMatch(/Review the brief.*wasn't deleted\. Only whoever made it can delete this\./);
  });

  it("changes a task's words and day at once, and the server's answer replaces the guess", async () => {
    await load();
    home.editTask("t1", { title: "Call the top three", dueAt: "2026-10-12T18:29:00.000Z" });
    const now = home.tasksNow().items.find((t) => t.id === "t1");
    expect(now).toMatchObject({ title: "Call the top three", dueAt: "2026-10-12T18:29:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(server.calls).toContain("PATCH /v1/tasks/t1");
    expect(server.bodies.at(server.calls.indexOf("PATCH /v1/tasks/t1"))).toEqual({ title: "Call the top three", dueAt: "2026-10-12T18:29:00.000Z" });
  });

  it("puts the old words back, with a line, when a change is refused", async () => {
    await load();
    server.fail = { match: /^PATCH/, status: 400, message: "Give the task a title." };
    home.editTask("t1", { title: "x" });
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(home.tasksNow().items.find((t) => t.id === "t1")?.title).toBe("Call the first three shortlisted people");
    expect(problems[0]).toMatch(/wasn't changed\. Give the task a title\./);
  });

  it("adds a task due when it was asked to be, today unless told otherwise", async () => {
    await load();
    server.handle = (method, path, body) => (method === "POST" && path === "/v1/tasks" ? { ...task({ id: "t9" }), ...(body as object) } : undefined);
    home.addTask("Send the offer", null, undefined, "2026-10-13T18:29:00.000Z");
    home.addTask("Chase references", null);
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    const posts = server.bodies.filter((_, i) => server.calls[i] === "POST /v1/tasks") as Array<{ title: string; dueAt: string }>;
    expect(posts[0]).toMatchObject({ title: "Send the offer", dueAt: "2026-10-13T18:29:00.000Z" });
    const today = new Date(posts[1]?.dueAt ?? "");
    expect([today.getHours(), today.getMinutes()]).toEqual([23, 59]);
  });
});

describe("Settings → Memory", () => {
  const note = (id: string, over: Record<string, unknown> = {}) => ({
    id, text: `A note about the agency, number ${id}`, kind: "fact", scope: "client", level: "client", clientId: "cl1", clientName: "Acme",
    campaignId: null, campaignName: null, personLabel: null, status: "active", trust: "agent", source: "distil", quote: null, confidence: 0.8,
    createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:00:00.000Z", supersededBy: null, usedCount: 0, ...over,
  });

  beforeEach(() => {
    server.fail = null;
    server.calls = [];
    server.handle = (method, path) => {
      if (method === "GET" && path.startsWith("/v1/memory/stats")) return { active: 1, pending: 0, byScope: { org: 0, client: 1, campaign: 0, person: 0 } };
      if (method === "GET") return { items: [note("new1"), note("old1", { status: "superseded", supersededBy: "new1" })], nextCursor: null };
      if (method === "POST" && /forget$/.test(path)) return { id: "new1", status: "forgotten" };
      return undefined;
    };
    memory.resetMemory();
  });

  it("remembers a note was forgotten, so the one it replaced no longer points at it", async () => {
    await memory.openMemory();
    expect(memory.memoryNow().forgotten).toEqual([]);
    const r = await memory.forgetMemory("new1");
    expect(r.ok).toBe(true);
    expect(memory.memoryNow().forgotten).toEqual(["new1"]);
    expect(memory.memoryNow().items.map((i) => i.id)).toEqual(["old1"]);
  });

  it("does not call a note forgotten when the server refused", async () => {
    await memory.openMemory();
    server.fail = { match: /forget$/, status: 403, message: "Only admins can change this." };
    const r = await memory.forgetMemory("new1");
    expect(r.ok).toBe(false);
    expect(memory.memoryNow().forgotten).toEqual([]);
  });
});

describe("Settings → Do not contact", () => {
  beforeEach(() => {
    server.fail = null;
    server.calls = [];
    server.handle = (method, path, body) => {
      if (method === "GET") return { items: [], nextCursor: null };
      if (method === "POST" && path === "/v1/suppressions") {
        return { id: "d1", reason: "do_not_contact", until: null, source: "user", label: "p***@acme.com", note: null,
          createdBy: { kind: "user", id: "u1", name: "Asha" }, createdAt: "2026-10-10T08:00:00.000Z", ...(body as object), email: undefined };
      }
      return undefined;
    };
    dnc.resetDnc();
    identity.workspaceChangedHere();
  });

  it("keeps the address that was typed, so it can be shown whole for the rest of the visit", async () => {
    await dnc.openDnc();
    const r = await dnc.addByEmail("  priya@acme.com ", "asked to stop");
    expect(r.ok).toBe(true);
    expect(dnc.dncNow().items[0]).toMatchObject({ id: "d1", label: "p***@acme.com", address: "priya@acme.com" });
  });
});

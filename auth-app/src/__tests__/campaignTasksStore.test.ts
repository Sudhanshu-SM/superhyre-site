import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The campaign's tasks behind the Overview's Tasks panel: read for one campaign (everyone's, soonest first), changed
 * in place the moment they are clicked, put back with a line when the server refuses, and read again whenever a task
 * is written anywhere (the invalidate map). The API is a small stand-in whose lists move when something is written.
 */

const { server, writes, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    calls: [] as string[],
    /** Answers held back until the test lets them go (a change that is "on its way"). */
    hold: null as null | ((m: string, p: string) => boolean),
    release: [] as Array<() => void>,
  },
  writes: new Set<(method: string, path: string) => void>(),
  problems: [] as string[],
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async (method: string, path: string, body?: unknown) => {
      server.calls.push(`${method} ${path}`);
      if (server.hold?.(method, path)) await new Promise<void>((resolve) => server.release.push(resolve));
      else await Promise.resolve();
      const out = server.handle(method, path, body);
      if (method !== "GET") for (const w of writes) w(method, path.split("?")[0] ?? path);
      return out;
    },
    onWrite: (fn: (method: string, path: string) => void) => { writes.add(fn); return () => writes.delete(fn); },
    setTabWorkspace: () => {},
  };
});
vi.mock("../problems", () => ({ reportProblem: (m: string) => { problems.push(m); } }));
/* The chat's stream is not under test: nothing is sent. */
vi.mock("../api/events", () => ({ follow: () => () => {} }));

const home = await import("../homeStore");
const inv = await import("../invalidate");
const role = await import("../roleStore");

const C1 = "c1";
const day = (n: number, hour = 12) => new Date(2026, 9, 13 + n, hour).toISOString();
type Row = {
  id: string; title: string; status: string; dueAt: string | null; assigneeId: string | null; assigneeName: string | null;
  campaignId: string | null;
};
let db: Row[];
const apiTask = (r: Row) => ({
  id: r.id, title: r.title, kind: "manual", status: r.status, dueAt: r.dueAt, assigneeId: r.assigneeId, assigneeName: r.assigneeName,
  createdById: "u1", createdByName: "Asha Rao", createdByKind: "user",
  campaign: r.campaignId ? { id: r.campaignId, name: "Staff Platform Engineer" } : null, candidate: null, action: null,
  createdAt: day(-1), resolvedAt: r.status === "done" ? day(0) : null,
});
const isOpen = (r: Row) => r.status !== "done" && r.status !== "dismissed";

let made = 0;
server.handle = (method, path, body) => {
  const [route, query = ""] = path.split("?");
  const q = new URLSearchParams(query);
  if (method === "GET" && route === "/v1/tasks") {
    const wantOpen = q.get("status") === "open";
    let list = db.filter((r) => (wantOpen ? isOpen(r) : !isOpen(r)));
    if (q.get("view") === "campaign") list = list.filter((r) => r.campaignId === q.get("campaignId"));
    else list = list.filter((r) => r.assigneeId === "u1");
    return { tasks: list.map(apiTask) };
  }
  if (method === "GET" && route === "/v1/home") return {};
  if (method === "GET" && route === "/v1/notifications") return { notifications: [], unread: 0 };
  if (method === "PATCH" && route?.startsWith("/v1/tasks/")) {
    const id = route.split("/").pop();
    const row = db.find((r) => r.id === id);
    if (!row) throw new Error("Task not found.");
    if ((body as { status?: string }).status === "done" && row.title.includes("refused")) throw new Error("Only an admin can change this task.");
    Object.assign(row, body);
    return apiTask(row);
  }
  if (method === "POST" && route === "/v1/tasks") {
    const b = body as { title: string; campaignId: string | null; dueAt: string | null; assigneeId?: string };
    const row: Row = {
      id: `made-${(made += 1)}`, title: b.title, status: "todo", dueAt: b.dueAt, assigneeId: b.assigneeId ?? "u1",
      assigneeName: b.assigneeId === "u2" ? "Meera Pillai" : "Asha Rao", campaignId: b.campaignId,
    };
    db.push(row);
    return apiTask(row);
  }
  throw new Error(`unexpected ${method} ${path}`);
};

const baseHandle = server.handle;
const settle = async () => { await vi.advanceTimersByTimeAsync(400); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 13, 12, 0, 0));
  role.setSession({ role: "admin", standing: "owner", name: "Asha Rao", userId: "u1" });
  db = [
    { id: "late", title: "Send the brief to Aarav", status: "todo", dueAt: day(-3), assigneeId: "u2", assigneeName: "Meera Pillai", campaignId: C1 },
    { id: "soon", title: "Call Kabir back", status: "todo", dueAt: day(0, 18), assigneeId: "u1", assigneeName: "Asha Rao", campaignId: C1 },
    { id: "later", title: "Check references", status: "doing", dueAt: day(4), assigneeId: "u2", assigneeName: "Meera Pillai", campaignId: C1 },
    { id: "undated", title: "Plan the loop", status: "todo", dueAt: null, assigneeId: "u1", assigneeName: "Asha Rao", campaignId: C1 },
    { id: "was", title: "Book the founders round", status: "done", dueAt: day(-2), assigneeId: "u2", assigneeName: "Meera Pillai", campaignId: C1 },
    { id: "other", title: "Another campaign's work", status: "todo", dueAt: day(1), assigneeId: "u1", assigneeName: "Asha Rao", campaignId: "c2" },
  ];
  server.handle = baseHandle;
  server.calls.length = 0;
  server.hold = null;
  server.release.length = 0;
  problems.length = 0;
  made = 0;
  home.resetHomeStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a campaign's tasks", () => {
  it("are read for that campaign alone, everyone's, pending soonest first with the undated last", async () => {
    home.ensureCampaignTasks(C1);
    await settle();
    expect(server.calls).toContain(`GET /v1/tasks?status=open&view=campaign&campaignId=${C1}`);
    expect(server.calls).toContain(`GET /v1/tasks?status=done&view=campaign&campaignId=${C1}`);
    const snap = home.campaignTasksNow(C1);
    expect(snap.ready).toBe(true);
    expect(snap.open.map((t) => t.id)).toEqual(["late", "soon", "later", "undated"]);
    expect(snap.done.map((t) => t.id)).toEqual(["was"]);
    // Asked for once, however many pages ask.
    home.ensureCampaignTasks(C1);
    await settle();
    expect(server.calls.filter((c) => c.startsWith("GET /v1/tasks?status=open&view=campaign"))).toHaveLength(1);
  });

  it("keep one order for tasks due at the same moment, whatever order the server answers in", async () => {
    db.push(
      { id: "z", title: "Zeta follow-up", status: "todo", dueAt: day(2), assigneeId: "u1", assigneeName: "Asha Rao", campaignId: C1 },
      { id: "a", title: "Alpha follow-up", status: "todo", dueAt: day(2), assigneeId: "u1", assigneeName: "Asha Rao", campaignId: C1 },
    );
    home.ensureCampaignTasks(C1);
    await settle();
    const first = home.campaignTasksNow(C1).open.map((t) => t.id);
    expect(first.indexOf("a")).toBeLessThan(first.indexOf("z"));
    db.reverse();
    home.refreshTasks();
    await settle();
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).toEqual(first);
  });

  it("say they did not arrive, and are asked for again on request", async () => {
    const was = server.handle;
    let fail = true;
    server.handle = (m, p, b) => { if (fail && p.includes("view=campaign")) throw new Error("down"); return was(m, p, b); };
    home.ensureCampaignTasks(C1);
    await settle();
    expect(home.campaignTasksNow(C1)).toMatchObject({ ready: true, failed: true, open: [] });
    fail = false;
    home.retryCampaignTasks(C1);
    await settle();
    expect(home.campaignTasksNow(C1)).toMatchObject({ ready: true, failed: false });
    expect(home.campaignTasksNow(C1).open).toHaveLength(4);
  });
});

describe("finishing a task in the panel", () => {
  it("moves it to done at once, before the server has answered, and keeps it there when it does", async () => {
    home.ensureCampaignTasks(C1);
    await settle();
    server.hold = (m) => m === "PATCH";
    home.setTaskDone("soon", true);
    // Nothing has come back yet: the screen already says done, and the count is one less.
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).toEqual(["late", "later", "undated"]);
    expect(home.campaignTasksNow(C1).done.map((t) => t.id)).toEqual(["soon", "was"]);
    server.hold = null;
    server.release.splice(0).forEach((r) => r());
    await settle();
    expect(server.calls).toContain("PATCH /v1/tasks/soon");
    expect(db.find((r) => r.id === "soon")?.status).toBe("done");
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).toEqual(["late", "later", "undated"]);
  });

  it("is not undone by a read made before it landed", async () => {
    home.ensureCampaignTasks(C1);
    await settle();
    server.hold = (m, p) => m === "PATCH" && p === "/v1/tasks/soon";
    home.setTaskDone("soon", true);
    // A tasks read comes back while the change is still on its way, and the server still has the task open.
    home.refreshTasks();
    await settle();
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).not.toContain("soon");
    expect(home.campaignTasksNow(C1).done.map((t) => t.id)).toContain("soon");
    server.hold = null;
    server.release.splice(0).forEach((r) => r());
    await settle();
    expect(home.campaignTasksNow(C1).done.map((t) => t.id)).toContain("soon");
  });

  it("is put back with a line when the server refuses", async () => {
    db.push({ id: "nope", title: "A task that is refused", status: "todo", dueAt: day(0, 20), assigneeId: "u2", assigneeName: "Meera Pillai", campaignId: C1 });
    home.ensureCampaignTasks(C1);
    await settle();
    home.setTaskDone("nope", true);
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).not.toContain("nope");
    await settle();
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).toContain("nope");
    expect(home.campaignTasksNow(C1).done.map((t) => t.id)).not.toContain("nope");
    expect(problems.join(" ")).toContain("A task that is refused");
    expect(problems.join(" ")).toContain("wasn't updated");
  });

  it("can be taken back (a done task reopens in the list)", async () => {
    home.ensureCampaignTasks(C1);
    await settle();
    home.setTaskDone("was", false);
    expect(home.campaignTasksNow(C1).open.map((t) => t.id)).toContain("was");
    await settle();
    expect(db.find((r) => r.id === "was")?.status).toBe("todo");
  });
});

describe("adding a task in the panel", () => {
  it("shows at once on its campaign, for the person it is for, then settles on the server's task", async () => {
    home.ensureCampaignTasks(C1);
    await settle();
    server.hold = (m) => m === "POST";
    home.addTask("Call the client", { id: C1, name: "Staff Platform Engineer" }, "u2", day(1, 9), "Meera Pillai");
    const stand = home.campaignTasksNow(C1).open.find((t) => t.title === "Call the client");
    expect(stand).toMatchObject({ assigneeName: "Meera Pillai", assigneeId: "u2" });
    expect(stand?.id.startsWith("t-")).toBe(true);
    server.hold = null;
    server.release.splice(0).forEach((r) => r());
    await settle();
    const made1 = home.campaignTasksNow(C1).open.filter((t) => t.title === "Call the client");
    expect(made1).toHaveLength(1);
    expect(made1[0]?.id).toBe("made-1");
    expect(server.calls).toContain("POST /v1/tasks");
  });

  it("is a task for me unless a teammate is named, due when the picker said, on that campaign", async () => {
    home.ensureCampaignTasks(C1);
    await settle();
    home.addTask("Draft the shortlist note", { id: C1, name: "Staff Platform Engineer" }, "u1", day(1, 9), "Asha Rao");
    await settle();
    const row = db.find((r) => r.title === "Draft the shortlist note");
    expect(row).toMatchObject({ assigneeId: "u1", campaignId: C1, dueAt: day(1, 9), status: "todo" });
    expect(home.tasksNow().items.map((t) => t.title)).not.toContain("Another campaign's work");
  });

  it("goes from the list again, with a line, when the server refuses it", async () => {
    const was = server.handle;
    server.handle = (m, p, b) => { if (m === "POST") throw new Error("Give the task a title."); return was(m, p, b); };
    home.ensureCampaignTasks(C1);
    await settle();
    home.addTask("Something", { id: C1, name: "Staff Platform Engineer" }, "u1", day(1, 9), "Asha Rao");
    expect(home.campaignTasksNow(C1).open.some((t) => t.title === "Something")).toBe(true);
    await settle();
    expect(home.campaignTasksNow(C1).open.some((t) => t.title === "Something")).toBe(false);
    expect(problems.join(" ")).toContain("wasn't added");
  });
});

describe("tasks written anywhere are stale for the panel", () => {
  it("names every task write as the tasks view, and nothing else, with no effect kind of its own", () => {
    for (const [method, path] of [["POST", "/v1/tasks"], ["PATCH", "/v1/tasks/t1"], ["DELETE", "/v1/tasks/t1"]] as const) {
      expect(inv.effectsOfWrite(method, path)).toEqual({ effects: [], campaignId: null, views: ["tasks"] });
    }
    expect(inv.effectsOfWrite("GET", "/v1/tasks?status=open")).toBeNull();
    expect([...inv.viewsFor({ views: ["tasks"] })]).toEqual(["tasks"]);
  });

  it("asks for a campaign's tasks again when the Overview is opened, and when the agent makes a task", () => {
    expect(inv.VIEWS_OF_ROUTE["campaign-overview"]).toContain("tasks");
    expect([...inv.viewsFor({ capability: "team.create_task" })]).toContain("tasks");
  });

  it("reads the campaign's list again after a write made outside the panel (a call's follow-up, a Home tick)", async () => {
    /* There is no page here: the console's window and document are the two things it listens on. */
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    const stop = inv.connectInvalidation();
    try {
      home.ensureCampaignTasks(C1);
      await settle();
      expect(home.campaignTasksNow(C1).open.map((t) => t.id)).not.toContain("fresh");
      // Somewhere else on the console, a task is made for this campaign: only the write says so.
      db.push({ id: "fresh", title: "Follow up after the call", status: "todo", dueAt: day(0, 17), assigneeId: "u1", assigneeName: "Asha Rao", campaignId: C1 });
      const { api } = await import("../api/client");
      await api("POST", "/v1/tasks", { title: "unused", campaignId: C1, dueAt: null });
      await settle();
      expect(home.campaignTasksNow(C1).open.map((t) => t.id)).toContain("fresh");
    } finally {
      stop();
      vi.unstubAllGlobals();
    }
  });
});

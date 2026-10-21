import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBoardRow, ApiCampaign } from "../api/campaigns";
import type { RunEvent } from "../api/events";

/**
 * "Nothing disagrees with the chat": after the agent shortlists 25 people, the board, Shortlisted, Candidates and
 * the Overview's funnel all read the server's numbers, without a reload. The API is a small stand-in whose
 * answers move when something is written.
 */

const { server, writes, stream } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    calls: [] as string[],
  },
  writes: new Set<(method: string, path: string) => void>(),
  stream: { push: (_e: unknown): void => {} },
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
      await Promise.resolve();
      server.calls.push(`${method} ${path}`);
      const out = server.handle(method, path, body);
      if (method !== "GET") for (const w of writes) w(method, path.split("?")[0] ?? path);
      return out;
    },
    onWrite: (fn: (method: string, path: string) => void) => { writes.add(fn); return () => writes.delete(fn); },
  };
});
vi.mock("../problems", () => ({ reportProblem: () => {} }));
/* The chat's stream: what the server would send, pushed by the test. */
vi.mock("../api/events", () => ({
  follow: (_target: unknown, _after: number, onEvent: (e: unknown) => void) => {
    stream.push = onEvent;
    return () => {};
  },
}));

const store = await import("../campaignStore");
const chat = await import("../liveChat");
const inv = await import("../invalidate");
const home = await import("../homeStore");

const iso = (min: number) => new Date(Date.now() - min * 60000).toISOString();

type Server = { shortlisted: number; extra: number; tasks: Array<{ id: string; title: string }>; notices: number };
let db: Server;
const camp = (): ApiCampaign => ({
  id: "c1", name: "Software Engineer", status: "active", department: null, location: null, priority: "normal", visibility: "team",
  client: null, owner: { id: "u1", name: "Asha Rao" }, team: [{ id: "u1", name: "Asha Rao", role: "owner" }],
  funnel: { shortlisted: db.shortlisted, outreach: 2, interviewing: 0, hired: 0, passed: 0 }, hired: 0, target: 5, agents: 0,
  openedAt: iso(100), closedAt: null, createdAt: iso(100), updatedAt: iso(5),
  summary: { found: 30, foundThisWeek: 30, sourcedPerDay: new Array<number>(14).fill(0), replied: 0, openTasks: 0 },
});
const person = (n: number, stage: ApiBoardRow["stage"] = "shortlisted"): ApiBoardRow => ({
  campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, fullName: `Person ${n}`, currentTitle: null,
  currentCompanyName: null, city: null, linkedinUrl: null, stage, step: null, ownerId: "u1", source: "agent", fit: 2, tier: null,
  addedAt: iso(600), yearsOfExperience: null, skills: [], daysInStage: 3, lastActivityAt: iso(60), hasEmail: false, hasPhone: false,
});

server.handle = (method, path) => {
  const route = `${method} ${path.split("?")[0]}`;
  if (route === "GET /v1/campaigns") return { campaigns: [camp()] };
  if (route === "GET /v1/me") return { user: { id: "u1" } };
  if (route === "GET /v1/members") return { members: [] };
  if (route === "GET /v1/clients") return { clients: [] };
  if (route === "GET /v1/home") return {};
  if (route === "GET /v1/tasks") {
    // The agent's writes land here, not through the console's own task actions.
    return path.includes("status=done") ? { tasks: [] } : {
      tasks: db.tasks.map((t) => ({
        id: t.id, title: t.title, kind: "manual", status: "todo", dueAt: null, assigneeId: "u1", assigneeName: "Meera",
        campaign: null, candidate: null, action: null, createdAt: iso(1), resolvedAt: null,
      })),
    };
  }
  if (route === "GET /v1/notifications") return { notifications: [], unread: db.notices };
  if (/^GET \/v1\/campaigns\/[^/]+\/overview$/.test(route)) {
    return {
      campaign: { id: "c1", name: "x", status: "active" }, found: { thisWeek: 1, lastWeek: 0, total: 30 }, kept: { thisWeek: 0, lastWeek: 0, total: 0 },
      funnel: [], repliedPct: null, hired: 0, target: 5, sourcedPerDay: [], needsYou: [], yourWork: null, hires: null, activity: [],
    };
  }
  if (/^GET \/v1\/campaigns\/[^/]+\/activity$/.test(route)) return { items: [], nextBefore: null };
  if (/^GET \/v1\/campaigns\/[^/]+\/candidates$/.test(route)) {
    return { candidates: [...Array.from({ length: db.shortlisted }, (_, i) => person(i)), person(900, "outreach"), person(901, "outreach")] };
  }
  if (route === "GET /v1/campaigns/c1") return camp();
  if (route === "GET /v1/conversations/conv1") {
    return {
      conversation: { id: "conv1", title: "Shortlist", focusCampaignId: "c1", updatedAt: iso(1) },
      messages: [{ id: "m1", seq: 1, role: "user", text: "Shortlist the rest", clientId: "t1", runId: "r1", campaignIds: ["c1"], createdAt: iso(1) }],
      runs: [], eventCursor: 5,
    };
  }
  if (method !== "GET") return { ok: true };
  throw new Error(`unexpected ${route}`);
};

const ev = (type: RunEvent["type"], payload: Record<string, unknown>, id: number): RunEvent => ({
  ...payload, id, type, runId: "r1", seq: id, at: new Date().toISOString(),
});

/* There is no page here: the console's window and document are the two things it listens on. */
let win: EventTarget;
let hidden: boolean;

beforeEach(async () => {
  vi.useFakeTimers();
  win = new EventTarget();
  hidden = false;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { get visibilityState() { return hidden ? "hidden" : "visible"; } }));
  db = { shortlisted: 3, extra: 0, tasks: [], notices: 0 };
  server.calls.length = 0;
  store.resetCampaignStore();
  chat.newChat();
  store.ensureCampaigns();
  store.ensureBoard("c1");
  await vi.advanceTimersByTimeAsync(50);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The chat open on a turn whose run is r1, with the stream live. */
async function openChat(): Promise<(e: RunEvent) => void> {
  await chat.openChat("conv1");
  await vi.advanceTimersByTimeAsync(10);
  return (e) => stream.push(e);
}

describe("after the agent shortlists 25 people", () => {
  it("shows the server's numbers on the board, Shortlisted, the funnel and the list, without a reload", async () => {
    const stop = inv.connectInvalidation();
    try {
      const send = await openChat();
      // What the page shows before: three on the shortlist.
      expect(store.pipelineNow("c1").filter((p) => p.stage === "shortlisted")).toHaveLength(3);
      expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(3);

      // The agent shortlists 25 more; the server commits, then says so on the chat's stream.
      db.shortlisted = 28;
      send(ev("progress", {
        step: "effect", capability: "pipeline.shortlist", effects: ["pipeline", "candidates", "campaign"], campaignId: "c1", summary: "Added 25", counts: { added: 25 },
      }, 11));
      await vi.advanceTimersByTimeAsync(2000);

      // The board and Shortlisted read the server's 28 (and the two already in outreach).
      const board = store.pipelineNow("c1");
      expect(board.filter((p) => p.stage === "shortlisted")).toHaveLength(28);
      expect(board).toHaveLength(30);
      // The funnel on the campaign's row, which the Overview and the list both draw.
      expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(28);
    } finally {
      stop();
    }
  });

  it("does the same from an approval's answer, on a server that sends no effect event", async () => {
    const stop = inv.connectInvalidation();
    try {
      const send = await openChat();
      db.shortlisted = 28;
      send(ev("approval", { summary: "Add 25 people", action: { action: "shortlist", campaignId: "c1" }, people: [] }, 12));
      send(ev("result", { approvalSeq: 12, decision: "approve", action: "shortlist", campaignId: "c1", added: 25 }, 13));
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.pipelineNow("c1").filter((p) => p.stage === "shortlisted")).toHaveLength(28);
      expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(28);
    } finally {
      stop();
    }
  });

  it("tells the pages that keep their own lists (Candidates, the week) once, when a burst has settled", async () => {
    const stop = inv.connectInvalidation();
    try {
      const send = await openChat();
      const heard: string[] = [];
      const off = inv.onInvalidate((effects, campaigns) => heard.push(`${[...effects].sort().join("+")}@${[...campaigns].join(",")}`));
      send(ev("progress", { step: "effect", effects: ["pipeline", "candidates"], campaignId: "c1", capability: "pipeline.shortlist", summary: "x" }, 21));
      send(ev("approval", { summary: "x", action: { action: "shortlist", campaignId: "c1" }, people: [] }, 22));
      send(ev("result", { approvalSeq: 22, decision: "approve", action: "shortlist", campaignId: "c1", added: 25 }, 23));
      expect(heard).toEqual([]);
      await vi.advanceTimersByTimeAsync(400);
      expect(heard).toEqual(["campaign+candidates+pipeline@c1"]);
      off();
    } finally {
      stop();
    }
  });

  it("does not read again for events that were already there when the chat was opened", async () => {
    const stop = inv.connectInvalidation();
    try {
      const send = await openChat();
      server.calls.length = 0;
      // The server's cursor said 5: these are the replay, not news.
      send(ev("progress", { step: "effect", effects: ["pipeline"], campaignId: "c1", capability: "x", summary: "x" }, 3));
      send(ev("progress", { step: "effect", effects: ["pipeline"], campaignId: "c1", capability: "x", summary: "x" }, 5));
      await vi.advanceTimersByTimeAsync(2000);
      expect(server.calls).toEqual([]);
      send(ev("progress", { step: "effect", effects: ["pipeline"], campaignId: "c1", capability: "x", summary: "x" }, 6));
      await vi.advanceTimersByTimeAsync(2000);
      expect(server.calls).toContain("GET /v1/campaigns/c1/candidates");
    } finally {
      stop();
    }
  });
});

describe("after the agent makes a task", () => {
  it("shows it in My tasks and moves the bell, without a reload (the effect kind says only 'team')", async () => {
    const stop = inv.connectInvalidation();
    try {
      const send = await openChat();
      // Home was opened before the agent did anything: its lists are loaded and empty.
      home.ensureTasks();
      home.ensureNotices();
      await vi.advanceTimersByTimeAsync(50);
      expect(home.tasksNow().items).toHaveLength(0);
      expect(home.noticesNow().unread).toBe(0);

      db.tasks.push({ id: "11111111-1111-4111-8111-111111111111", title: "Contact Aman about the meeting" });
      db.notices = 1;
      send(ev("progress", { step: "effect", capability: "team.create_task", effects: ["team"], summary: "Made the task" }, 31));
      await vi.advanceTimersByTimeAsync(2000);

      expect(home.tasksNow().items.map((t) => t.title)).toEqual(["Contact Aman about the meeting"]);
      expect(home.noticesNow().unread).toBe(1);
    } finally {
      stop();
    }
  });

  it("does the same when the run just ends, whatever it said it changed", async () => {
    const stop = inv.connectInvalidation();
    try {
      const send = await openChat();
      home.ensureTasks();
      await vi.advanceTimersByTimeAsync(50);
      db.tasks.push({ id: "22222222-2222-4222-8222-222222222222", title: "Call back Priya" });
      send(ev("done", {}, 41));
      await vi.advanceTimersByTimeAsync(2000);
      expect(home.tasksNow().items.map((t) => t.title)).toContain("Call back Priya");
    } finally {
      stop();
    }
  });
});

describe("what a console write leaves stale beyond the place that made it", () => {
  it("names the people who changed and the campaign, never a read", () => {
    expect(inv.effectsOfWrite("PATCH", "/v1/campaigns/c1/candidates/cc-1")).toEqual({ effects: ["candidates"], campaignId: "c1" });
    // Added to a campaign or taken off one: that board and its figures follow too.
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/candidates")).toEqual({ effects: ["candidates", "pipeline"], campaignId: "c1" });
    expect(inv.effectsOfWrite("DELETE", "/v1/campaigns/c1/candidates/cc-1")).toEqual({ effects: ["candidates", "pipeline"], campaignId: "c1" });
    // Whatever moves people on a board (the agent, a bulk move) is told to Candidates as well.
    for (const e of ["pipeline", "campaign", "sourcing"] as const) expect([...inv.viewsFor({ effects: [e] })], e).toContain("candidates");
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/candidates/bulk-move")).toEqual({ effects: ["candidates"], campaignId: "c1" });
    // Deciding matches also counts down Home's "Review N matches".
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/matches/shortlist")).toEqual({ effects: ["candidates"], campaignId: "c1", views: ["tasks"] });
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/sourcing")).toEqual({ effects: ["sourcing"], campaignId: "c1" });
    expect(inv.effectsOfWrite("POST", "/v1/candidates/import")).toEqual({ effects: ["candidates", "pipeline"], campaignId: null });
    // A call logged by hand, and one taken back, are told to the lists of calls.
    expect(inv.effectsOfWrite("POST", "/v1/calls")).toEqual({ effects: ["calls"], campaignId: null });
    expect(inv.effectsOfWrite("DELETE", "/v1/calls/c1")).toEqual({ effects: ["calls"], campaignId: null });
    expect(inv.effectsOfWrite("DELETE", "/v1/candidates/cand-1")).toEqual({ effects: ["candidates", "pipeline", "campaign"], campaignId: null });
    expect(inv.effectsOfWrite("PATCH", "/v1/candidates/cand-1")).toEqual({ effects: ["candidates"], campaignId: null });
    // Closing or reopening a campaign: its Overview activity, funnel and agents are read again (they stayed on the
    // old figures until the person left the page and came back).
    expect(inv.effectsOfWrite("PUT", "/v1/campaigns/c1/status")).toEqual({ effects: ["campaign"], campaignId: "c1" });
    expect(inv.effectsOfWrite("GET", "/v1/campaigns/c1/candidates")).toBeNull();
    // A task written anywhere (Home, the Overview's Tasks panel, a call's follow-up) leaves the lists of tasks stale; it is
    // a view of its own, with no effect kind (the server's vocabulary has no word for tasks).
    expect(inv.effectsOfWrite("PATCH", "/v1/tasks/t1")).toEqual({ effects: [], campaignId: null, views: ["tasks"] });
  });

  it("is turned into a read of the directory when the console writes", async () => {
    const stop = inv.connectInvalidation();
    try {
      const heard: string[] = [];
      const off = inv.onInvalidate((effects) => heard.push([...effects].join("+")));
      server.handle = (m, p) => (m === "GET" ? undefined : { ok: true, p });
      const { api } = await import("../api/client");
      await api("DELETE", "/v1/candidates/cand-1");
      await vi.advanceTimersByTimeAsync(400);
      expect(heard).toEqual(["candidates+pipeline+campaign"]);
      off();
    } finally {
      stop();
    }
  });
});

describe("coming back", () => {
  it("reads the boards again when the window returns after a minute, and not before", async () => {
    const stop = inv.connectInvalidation();
    try {
      const heard: string[] = [];
      const off = inv.onInvalidate((effects) => heard.push([...effects].sort().join("+")));
      // Away for ten seconds: nothing to read.
      win.dispatchEvent(new Event("blur"));
      await vi.advanceTimersByTimeAsync(10_000);
      win.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(400);
      expect(heard).toEqual([]);
      // Away for two minutes: the boards, the lists and the figures.
      win.dispatchEvent(new Event("blur"));
      await vi.advanceTimersByTimeAsync(120_000);
      win.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(400);
      expect(heard).toHaveLength(1);
      expect(heard[0]).toContain("pipeline");
      off();
    } finally {
      stop();
    }
  });
});

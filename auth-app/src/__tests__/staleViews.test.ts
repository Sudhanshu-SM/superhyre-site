import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITY_EFFECTS } from "../agentEvents";
import type { CapabilityEffect } from "../agentEvents";

/**
 * "Every effect of an agent action shows at once, with no reload": a change says what it touched (an effect kind,
 * a capability, a run that ended, a page opened again) and invalidate.ts's tables turn that into the stores to
 * read. The stores are stand-ins here that only record being asked, so each row of each table is pinned.
 */

const h = vi.hoisted(() => ({
  calls: [] as string[],
  chat: new Set<(effects: readonly string[], campaignId: string | null, capability: string | null) => void>(),
  runEnd: new Set<() => void>(),
  decisions: new Set<(campaignId: string | null) => void>(),
  writes: new Set<(method: string, path: string) => void>(),
}));

vi.mock("../api/client", () => ({
  LIVE: true,
  onWrite: (fn: (m: string, p: string) => void) => { h.writes.add(fn); return () => h.writes.delete(fn); },
}));
vi.mock("../api/agent", () => ({
  onDecision: (fn: (c: string | null) => void) => { h.decisions.add(fn); return () => h.decisions.delete(fn); },
}));
vi.mock("../api/identity", () => ({ onWorkspaceChange: () => () => {} }));
vi.mock("../campaignStore", () => ({
  refreshCampaign: (id: string) => h.calls.push(`boards:${id}`),
  refreshOpenCampaigns: () => h.calls.push("boards:open"),
  refreshCampaignsNow: () => h.calls.push("campaigns"),
  refreshClients: () => h.calls.push("clients"),
  refreshMembers: () => h.calls.push("members"),
}));
vi.mock("../connectionsStore", () => ({ reloadConnections: async () => { h.calls.push("connections"); } }));
vi.mock("../formsStore", () => ({ refreshFormCounts: async (id: string) => { h.calls.push(`forms:${id}`); } }));
vi.mock("../homeStore", () => ({
  refreshHome: () => h.calls.push("week"),
  refreshNotices: () => h.calls.push("bell"),
  refreshTasks: () => h.calls.push("tasks"),
}));
vi.mock("../liveChat", () => ({
  onChatEffects: (fn: never) => { h.chat.add(fn); return () => h.chat.delete(fn); },
  onChatRunEnd: (fn: () => void) => { h.runEnd.add(fn); return () => h.runEnd.delete(fn); },
  watchesChanged: () => h.calls.push("watches"),
}));
vi.mock("../memoryStore", () => ({
  memoryNow: () => ({ list: "idle" }),
  openMemory: async () => {},
  reloadMemoryStats: async () => { h.calls.push("memory"); },
}));
vi.mock("../schedulesStore", () => ({ schedulesChanged: async () => { h.calls.push("schedules"); } }));
vi.mock("../specDraft", () => ({ reloadSpec: async (id: string) => { h.calls.push(`specs:${id}`); } }));

const inv = await import("../invalidate");

let win: EventTarget;
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  win = new EventTarget();
  hidden = false;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { get visibilityState() { return hidden ? "hidden" : "visible"; } }));
  h.calls.length = 0;
  inv.resetFreshness();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** What was read, once the burst has settled. */
async function read(say: () => void): Promise<string[]> {
  h.calls.length = 0;
  say();
  await vi.advanceTimersByTimeAsync(500);
  return [...h.calls];
}
const same = (got: string[], want: string[]) => expect([...new Set(got)].sort()).toEqual([...want].sort());

describe("each kind of effect reads the stores that show it", () => {
  const rows: Array<[CapabilityEffect, string[]]> = [
    ["campaign", ["boards:c1", "campaigns", "week"]],
    ["pipeline", ["boards:c1", "campaigns", "week"]],
    ["candidates", ["week"]],
    ["clients", ["clients"]],
    ["team", ["members", "tasks", "bell"]],
    ["connections", ["connections"]],
    ["memory", ["memory"]],
    ["schedules", ["schedules", "tasks", "bell"]],
    ["spec", ["specs:c1", "boards:c1", "campaigns", "week"]],
    ["sourcing", ["watches", "boards:c1", "campaigns", "week"]],
    ["calls", []],
  ];

  it("has a row for every kind the server can say", () => {
    expect(rows.map(([k]) => k).sort()).toEqual([...CAPABILITY_EFFECTS].sort());
    expect(Object.keys(inv.VIEWS_OF_EFFECT).sort()).toEqual([...CAPABILITY_EFFECTS].sort());
  });

  for (const [kind, want] of rows) {
    it(`${kind}: ${want.join(", ") || "tells the pages that keep their own list"}`, async () => {
      const heard: string[][] = [];
      const off = inv.onInvalidate((effects) => heard.push([...effects]));
      const got = await read(() => inv.invalidate([kind], { campaignId: "c1" }));
      same(got, want);
      // The pages that keep their own list (Candidates, Calls) are told the kind that changed.
      if (kind === "candidates" || kind === "calls") expect(heard.flat()).toContain(kind);
      off();
    });
  }
});

describe("an agent write reads what it made, whatever its effect names", () => {
  const chat = (effects: string[], capability: string | null, campaignId: string | null = "c1") =>
    () => { for (const l of h.chat) l(effects, campaignId, capability); };

  it("a task made for Meera shows in My tasks, the week and the bell (the effect kind says only 'team')", async () => {
    const stop = inv.connectInvalidation();
    const got = await read(chat(["team"], "team.create_task", null));
    expect(got).toEqual(expect.arrayContaining(["tasks", "week", "bell", "members"]));
    stop();
  });

  it("giving a candidate an owner reads the board, the lists of work, the team and the bell", async () => {
    const stop = inv.connectInvalidation();
    const heard: string[][] = [];
    const off = inv.onInvalidate((effects) => heard.push([...effects]));
    const got = await read(chat(["pipeline", "team"], "pipeline.assign_owner"));
    expect(got).toEqual(expect.arrayContaining(["boards:c1", "tasks", "members", "bell", "campaigns", "week"]));
    expect(heard.flat()).toContain("candidates");
    off();
    stop();
  });

  it("closing or reopening a campaign reads the list, its counts, its board and the watches", async () => {
    const stop = inv.connectInvalidation();
    const got = await read(chat(["campaign", "pipeline", "sourcing"], "campaign.set_status"));
    expect(got).toEqual(expect.arrayContaining(["campaigns", "boards:c1", "week", "watches"]));
    stop();
  });

  it("setting a campaign's owner reads the work given to people", async () => {
    const stop = inv.connectInvalidation();
    const got = await read(chat(["campaign", "team"], "campaign.set_owner"));
    expect(got).toEqual(expect.arrayContaining(["tasks", "boards:c1", "campaigns", "members", "bell"]));
    stop();
  });

  it("making a campaign or a client reads the list, Home and the clients", async () => {
    const stop = inv.connectInvalidation();
    expect(await read(chat(["campaign", "spec"], "campaign.create", null))).toEqual(expect.arrayContaining(["campaigns", "week", "clients"]));
    expect(await read(chat(["clients"], "clients.create", null))).toEqual(expect.arrayContaining(["clients", "campaigns"]));
    stop();
  });

  it("inviting, removing or answering a request reads the team and the bell", async () => {
    const stop = inv.connectInvalidation();
    for (const cap of ["team.invite", "team.remove_member", "team.respond_to_request", "team.set_role"]) {
      expect(await read(chat(["team"], cap, null)), cap).toEqual(expect.arrayContaining(["members", "bell"]));
    }
    stop();
  });

  it("scheduling or cancelling an email or a reminder reads the agent's schedules, tasks and the bell", async () => {
    const stop = inv.connectInvalidation();
    for (const cap of ["schedule.create", "schedule.followup", "schedule.cancel"]) {
      expect(await read(chat(["schedules"], cap, null)), cap).toEqual(expect.arrayContaining(["schedules", "tasks", "bell"]));
    }
    stop();
  });

  it("sending an email reads the board, the counts and the bell", async () => {
    const stop = inv.connectInvalidation();
    expect(await read(chat(["pipeline", "campaign", "candidates"], "outreach.send_email"))).toEqual(
      expect.arrayContaining(["boards:c1", "campaigns", "bell", "week"]),
    );
    stop();
  });

  it("saving to Candidates, fetching contacts and erasing someone read the directory and the counts", async () => {
    const stop = inv.connectInvalidation();
    const heard: string[][] = [];
    const off = inv.onInvalidate((effects) => heard.push([...effects]));
    await read(chat(["candidates", "campaign"], "candidates.save_to_candidates"));
    expect(heard.flat()).toContain("candidates");
    expect(await read(chat(["candidates", "pipeline", "campaign", "memory"], "candidates.erase"))).toEqual(
      expect.arrayContaining(["boards:c1", "campaigns", "memory", "week"]),
    );
    off();
    stop();
  });

  it("remembering, forgetting and connecting an app read memory and connections", async () => {
    const stop = inv.connectInvalidation();
    expect(await read(chat(["memory"], "memory.remember", null))).toEqual(expect.arrayContaining(["memory"]));
    expect(await read(chat(["memory"], "memory.forget", null))).toEqual(expect.arrayContaining(["memory"]));
    expect(await read(chat(["connections"], "connections.connect", null))).toEqual(expect.arrayContaining(["connections"]));
    stop();
  });

  it("a write the console has no row for still reads Home's tasks and week, the bell and the list", async () => {
    const stop = inv.connectInvalidation();
    same(await read(chat([], "something.new", null)), ["tasks", "week", "bell", "campaigns"]);
    stop();
  });

  it("a run that ended is read the same way: a command run in code may have written", async () => {
    const stop = inv.connectInvalidation();
    const got = await read(() => { for (const l of h.runEnd) l(); });
    same(got, ["tasks", "week", "bell", "campaigns"]);
    stop();
  });
});

describe("console writes name what they leave stale beyond the place that made them", () => {
  const w = inv.effectsOfWrite;
  it("clients, the team, connections, memory, schedules and campaigns", () => {
    expect(w("POST", "/v1/campaigns")).toEqual({ effects: ["campaign"], campaignId: null });
    expect(w("PATCH", "/v1/campaigns/c1")).toEqual({ effects: ["campaign"], campaignId: "c1" });
    expect(w("POST", "/v1/clients")).toEqual({ effects: ["clients", "campaign"], campaignId: null });
    expect(w("POST", "/v1/members/invites")).toEqual({ effects: ["team"], campaignId: null });
    expect(w("POST", "/v1/invitations/i1/accept")).toEqual({ effects: ["team"], campaignId: null });
    expect(w("DELETE", "/v1/connections/google")).toEqual({ effects: ["connections"], campaignId: null });
    expect(w("POST", "/v1/connections/google/complete")).toEqual({ effects: ["connections"], campaignId: null });
    expect(w("POST", "/v1/memory/facts")).toEqual({ effects: ["memory"], campaignId: null });
    expect(w("DELETE", "/v1/schedules/s1")).toEqual({ effects: ["schedules"], campaignId: null });
    // Tasks reconcile on screen where they were changed, and every other list that shows tasks (a campaign's Tasks
    // panel on the Overview, Home) is told that they are stale: a view of its own, with no effect kind.
    expect(w("POST", "/v1/tasks")).toEqual({ effects: [], campaignId: null, views: ["tasks"] });
    expect(w("PATCH", "/v1/tasks/t1")).toEqual({ effects: [], campaignId: null, views: ["tasks"] });
    expect(w("DELETE", "/v1/tasks/t1")).toEqual({ effects: [], campaignId: null, views: ["tasks"] });
  });
});

describe("a page opened again", () => {
  it("reads what it shows, once, and not again inside 15 seconds", async () => {
    const stop = inv.connectInvalidation();
    const first = await read(() => inv.revalidateRoute("home"));
    same(first, ["tasks", "week", "bell", "campaigns"]);
    // Inside the minute's quarter: it is fresh.
    const second = await read(() => inv.revalidateRoute("home"));
    expect(second).toEqual([]);
    await vi.advanceTimersByTimeAsync(inv.FRESH_MS + 1000);
    const third = await read(() => inv.revalidateRoute("home"));
    same(third, ["tasks", "week", "bell", "campaigns"]);
    stop();
  });

  it("reads a campaign's own board when it is opened, per campaign", async () => {
    const stop = inv.connectInvalidation();
    const a = await read(() => inv.revalidateRoute("campaign-overview", "c1"));
    expect(a).toEqual(expect.arrayContaining(["boards:c1", "campaigns", "week", "specs:c1"]));
    // Another campaign is not fresh because this one was just read.
    const b = await read(() => inv.revalidateRoute("campaign-overview", "c2"));
    expect(b).toEqual(expect.arrayContaining(["boards:c2"]));
    stop();
  });

  it("reads the stale views when the window comes back, and the page that was open", async () => {
    const stop = inv.connectInvalidation();
    await read(() => inv.revalidateRoute("home"));
    // Away for 20 seconds (under the minute that reads everything): only what has gone stale, for this page.
    win.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(20_000);
    const got = await read(() => win.dispatchEvent(new Event("focus")));
    same(got, ["tasks", "week", "bell", "campaigns"]);
    // Back at once: nothing is stale.
    win.dispatchEvent(new Event("blur"));
    const again = await read(() => win.dispatchEvent(new Event("focus")));
    expect(again).toEqual([]);
    stop();
  });

  it("reads everything the console keeps after a long time away", async () => {
    const stop = inv.connectInvalidation();
    win.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(120_000);
    const got = await read(() => win.dispatchEvent(new Event("focus")));
    expect(got).toEqual(expect.arrayContaining(["tasks", "bell", "week", "campaigns", "members", "connections", "clients", "memory", "schedules"]));
    stop();
  });

  it("has a row for every page that shows a store", () => {
    for (const route of ["home", "agent", "campaigns", "clients", "settings", "campaign-overview", "campaign-candidates", "campaign-shortlisted", "campaign-forms"]) {
      expect(inv.VIEWS_OF_ROUTE[route], route).toBeDefined();
    }
  });
});

describe("the tables", () => {
  it("name only views that can be read", () => {
    const views = new Set(Object.keys(inv.READ));
    const named = new Set<string>([...inv.AMBIENT_VIEWS, ...Object.values(inv.VIEWS_OF_EFFECT).flat(), ...Object.values(inv.VIEWS_OF_CAPABILITY).flat(), ...Object.values(inv.VIEWS_OF_ROUTE).flat()]);
    for (const v of named) expect(views.has(v), v).toBe(true);
  });

  it("read nothing when nothing is stale", async () => {
    expect(await read(() => inv.invalidate([]))).toEqual([]);
    expect(await read(() => inv.invalidateViews([]))).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBoardRow, ApiCampaign } from "../api/campaigns";
import type { ApiTask } from "../api/tasks";

/**
 * The stores with the API connected: a change shows at once, the server's
 * answer replaces it, and a refusal puts it back and says why. The API is a
 * small in-memory stand-in; `fail` makes the next matching write refuse.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    fail: null as null | RegExp,
    calls: [] as string[],
  },
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
      await Promise.resolve();
      server.calls.push(`${method} ${path}`);
      if (method !== "GET" && server.fail?.test(`${method} ${path}`)) {
        server.fail = null;
        throw new ApiError(400, "bad_request", "Only an admin or the campaign's owner can close or reopen it.");
      }
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../campaignStore");
const home = await import("../homeStore");
const roles = await import("../roleStore");

const iso = (min: number) => new Date(Date.now() - min * 60000).toISOString();
let campaigns: ApiCampaign[];
let rows: ApiBoardRow[];
let tasks: ApiTask[];
let handed: ApiTask[] = [];

const camp = (id: string, over: Partial<ApiCampaign> = {}): ApiCampaign => ({
  id, name: `Campaign ${id}`, status: "active", department: null, location: null, priority: "normal", visibility: "team",
  client: null, owner: { id: "u1", name: "Asha Rao" }, team: [{ id: "u1", name: "Asha Rao", role: "owner" }],
  funnel: { shortlisted: 1, outreach: 1, interviewing: 0, hired: 0, passed: 0 }, hired: 0, target: 2, agents: 0,
  openedAt: iso(100), closedAt: null, createdAt: iso(100), updatedAt: iso(5), ...over,
});
const person = (cc: string, stage: ApiBoardRow["stage"]): ApiBoardRow => ({
  campaignCandidateId: cc, candidateId: `cand-${cc}`, personId: `p-${cc}`, fullName: `Person ${cc}`, currentTitle: null,
  currentCompanyName: null, city: null, linkedinUrl: null, stage, step: stage === "outreach" ? "waiting" : null, ownerId: "u1",
  source: "agent", fit: 2, tier: null, addedAt: iso(600), yearsOfExperience: null, skills: [], daysInStage: 3,
  lastActivityAt: iso(60), hasEmail: false, hasPhone: false,
});

beforeEach(() => {
  server.fail = null;
  problems.length = 0;
});

server.handle = (method, path, body) => {
  const route = `${method} ${path.split("?")[0]}`;
  if (route === "GET /v1/campaigns") return { campaigns };
  if (route === "GET /v1/me") return { user: { id: "u1" } };
  if (route === "GET /v1/members") return { members: [{ userId: "u1", email: "a@x.dev", fullName: "Asha Rao", role: "owner", status: "active" }, { userId: "u2", email: "v@x.dev", fullName: "Vik Shah", role: "recruiter", status: "active" }] };
  if (route === "GET /v1/clients") return { clients: [] };
  if (route === "POST /v1/campaigns") {
    const b = body as { name: string };
    const made = camp("c-new", { name: b.name });
    campaigns = [made, ...campaigns];
    return made;
  }
  let m = /^GET \/v1\/campaigns\/([^/]+)\/overview$/.exec(route);
  if (m) {
    return {
      campaign: { id: m[1], name: "x", status: "active" }, found: { thisWeek: 1, lastWeek: 0, total: 7 }, kept: { thisWeek: 1, lastWeek: 0, total: 2 },
      funnel: [], repliedPct: null, hired: 0, target: 2, sourcedPerDay: [], needsYou: [], yourWork: null, hires: null, activity: [],
    };
  }
  if (/^GET \/v1\/campaigns\/[^/]+\/activity$/.test(route)) return { items: [], nextBefore: null };
  if (/^GET \/v1\/campaigns\/[^/]+\/candidates$/.test(route)) return { candidates: rows };
  m = /^GET \/v1\/campaigns\/([^/]+)$/.exec(route);
  if (m) return campaigns.find((c) => c.id === m?.[1]);
  m = /^POST \/v1\/campaigns\/([^/]+)\/candidates\/unshortlist$/.exec(route);
  if (m) {
    const ids = (body as { campaignCandidateIds: string[] }).campaignCandidateIds;
    const gone = rows.filter((r) => ids.includes(r.campaignCandidateId) && r.stage === "shortlisted");
    rows = rows.filter((r) => !gone.includes(r));
    return { removed: gone.length };
  }
  m = /^PUT \/v1\/campaigns\/([^/]+)\/status$/.exec(route);
  if (m) {
    const c = campaigns.find((x) => x.id === m?.[1]);
    return c && { ...c, status: (body as { status: ApiCampaign["status"] }).status };
  }
  m = /^PATCH \/v1\/campaigns\/[^/]+\/candidates\/([^/]+)$/.exec(route);
  if (m) {
    const r = rows.find((x) => x.campaignCandidateId === m?.[1]);
    return r && { ...r, stage: (body as { stage: ApiBoardRow["stage"] }).stage, step: null, daysInStage: 0, fit: 3 };
  }
  if (route === "GET /v1/tasks" && path.includes("view=")) return { tasks: handed };
  if (route === "GET /v1/tasks") return { tasks: path.includes("status=done") ? [] : tasks };
  m = /^PATCH \/v1\/tasks\/([^/]+)$/.exec(route);
  if (m) {
    const b = body as { status?: ApiTask["status"]; assigneeId?: string };
    const t = [...tasks, ...handed].find((x) => x.id === m?.[1]);
    return t && { ...t, ...(b.status ? { status: b.status } : {}), ...(b.assigneeId ? { assigneeId: b.assigneeId, assigneeName: b.assigneeId === "u1" ? "Asha Rao" : "Vik Shah" } : {}) };
  }
  if (route === "POST /v1/tasks") {
    const b = body as { title: string; dueAt: string; assigneeId?: string };
    return { id: "t-real", title: b.title, kind: "manual", status: "todo", dueAt: b.dueAt, assigneeId: b.assigneeId ?? "u1", campaign: null, candidate: null, action: null, createdAt: iso(0), resolvedAt: null };
  }
  if (route === "GET /v1/overview/home") return { days: 7, found: { current: 0, previous: 0, series: [] }, replies: { current: 0, previous: 0 }, interviews: { current: 0, previous: 0 }, offers: { current: 0, previous: 0 }, hires: { current: 0, previous: 0, hired: 0, target: 0 }, tasks: { dueToday: 0, upcoming: 0, open: 0 }, campaigns: [] };
  throw new Error(`unexpected ${route}`);
};

const summary = (found: number) => ({ found, foundThisWeek: 2, sourcedPerDay: new Array<number>(14).fill(0), replied: 1, openTasks: 0 });
campaigns = [camp("c1", { summary: summary(7) }), camp("c2", { status: "closed", summary: summary(0) })];
rows = [person("a", "shortlisted"), person("b", "outreach")];
tasks = [{ id: "t1", title: "Call Asha", kind: "manual", status: "todo", dueAt: null, assigneeId: "u1", campaign: null, candidate: null, action: null, createdAt: iso(10), resolvedAt: null }];

describe("campaigns, live", () => {
  it("fills each row's figures from the list itself, without loading every overview", async () => {
    store.ensureCampaigns();
    await vi.waitFor(() => expect(store.campaignRow("c1")).toBeDefined());
    expect(store.campaignRow("c1")).toMatchObject({ funnel: { sourced: 7, replied: 1 } });
    expect(store.campaignRow("c1")?.loading).toBeUndefined();
    expect(server.calls.some((c) => c.endsWith("/overview"))).toBe(false);
  });

  it("puts a refused status change back and says why", async () => {
    server.fail = /PUT \/v1\/campaigns\/c2\/status/;
    store.setCampaignStatus("c2", "active");
    expect(store.campaignRow("c2")?.status).toBe("active");
    await vi.waitFor(() => expect(store.campaignRow("c2")?.status).toBe("closed"));
    expect(problems[0]).toMatch(/^Campaign c2 wasn't reopened\. Only an admin or the campaign's owner/);
  });

  it("keeps an accepted status change", async () => {
    store.setCampaignStatus("c1", "closed");
    expect(store.campaignRow("c1")?.status).toBe("closed");
    await new Promise((r) => setTimeout(r, 10));
    expect(store.campaignRow("c1")?.status).toBe("closed");
    expect(problems).toEqual([]);
  });

  it("shows a new campaign at once and follows it to the id the API gives it", async () => {
    const { rowFromDraft, blankDraft } = await import("../campaignDraft");
    const row = rowFromDraft({ ...blankDraft("Asha Rao"), name: "Design Lead" }, ["Asha Rao"]);
    store.addCampaignRow(row);
    expect(store.campaignRow(row.id)?.name).toBe("Design Lead");
    await vi.waitFor(() => expect(store.resolveCampaignId(row.id)).toBe("c-new"));
    expect(store.campaignRow(row.id)?.id).toBe("c-new");
  });
});

describe("the board, live", () => {
  it("moves a person at once, then takes the server's version", async () => {
    store.ensureBoard("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(2));
    store.movePerson("c1", "a", "interviewing");
    expect(store.pipelineNow("c1")[0]).toMatchObject({ id: "a", stage: "interviewing", step: "loop", inStage: 0 });
    expect(store.campaignRow("c1")?.funnel.interviews).toBe(1);
    await vi.waitFor(() => expect(store.pipelineNow("c1")[0]?.fit).toBe(3));
  });

  /* A fresh board: two shortlisted, one in outreach. */
  const freshBoard = async () => {
    rows = [person("a", "shortlisted"), person("b", "outreach"), person("c", "shortlisted")];
    store.resetCampaignStore();
    store.ensureCampaigns();
    await vi.waitFor(() => expect(store.campaignRow("c1")).toBeDefined());
    store.ensureBoard("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(3));
    // The list's own figure has settled too, so a late answer can't land in the middle of the test.
    await vi.waitFor(() => expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
  };

  it("takes people off the board at once, keeps those already contacted, and says how many went", async () => {
    await freshBoard();
    const shortlisted = store.pipelineNow("c1").filter((p) => p.stage === "shortlisted").map((p) => p.id);
    const inOutreach = store.pipelineNow("c1").filter((p) => p.stage === "outreach").map((p) => p.id);
    const before = store.campaignRow("c1")?.funnel.shortlisted ?? 0;
    const asked = store.removeFromShortlist("c1", [...shortlisted, ...inOutreach]);
    expect(store.pipelineNow("c1").some((p) => shortlisted.includes(p.id))).toBe(false);
    expect(store.pipelineNow("c1").some((p) => inOutreach.includes(p.id))).toBe(true);
    expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(Math.max(0, before - shortlisted.length));
    expect(shortlisted).toHaveLength(2);
    expect(await asked).toBe(2);
    expect(server.calls).toContain("POST /v1/campaigns/c1/candidates/unshortlist");
  });

  it("puts a refused removal back and says why", async () => {
    await freshBoard();
    const shortlisted = store.pipelineNow("c1").filter((p) => p.stage === "shortlisted").map((p) => p.id);
    server.fail = /POST .*\/unshortlist$/;
    expect(await store.removeFromShortlist("c1", shortlisted)).toBe(0);
    expect(store.pipelineNow("c1").some((p) => shortlisted.includes(p.id))).toBe(true);
    expect(problems[0]).toMatch(/weren't taken off the shortlist|wasn't taken off the shortlist/);
  });

  it("puts a refused move back where it was", async () => {
    server.fail = /PATCH .*\/candidates\/b$/;
    store.movePerson("c1", "b", "hired");
    expect(store.pipelineNow("c1").find((p) => p.id === "b")?.stage).toBe("hired");
    await vi.waitFor(() => expect(store.pipelineNow("c1").find((p) => p.id === "b")?.stage).toBe("outreach"));
    expect(store.campaignRow("c1")?.funnel.hired).toBe(0);
    expect(problems[0]).toMatch(/^Person wasn't moved\./);
  });
});

describe("tasks, live", () => {
  it("finishes a task at once, and reopens it if the API refuses", async () => {
    home.ensureTasks();
    await vi.waitFor(() => expect(home.tasksNow().ready).toBe(true));
    server.fail = /PATCH \/v1\/tasks\/t1/;
    home.setTaskDone("t1", true);
    expect(home.tasksNow().items[0]?.state).toBe("done");
    await vi.waitFor(() => expect(home.tasksNow().items[0]?.state).toBe("todo"));
    expect(problems[0]).toMatch(/^"Call Asha" wasn't updated/);
  });

  it("adds a task due today and swaps in the saved one", async () => {
    home.addTask("Send the shortlist", null);
    expect(home.tasksNow().items[0]).toMatchObject({ title: "Send the shortlist", dueInDays: 0 });
    await vi.waitFor(() => expect(home.tasksNow().items[0]?.id).toBe("t-real"));
  });
});

describe("tasks handed to teammates, live", () => {
  const given = (id: string, over: Partial<ApiTask> = {}): ApiTask => ({
    id, title: `Task ${id}`, kind: "manual", status: "todo", dueAt: null, assigneeId: "u2", assigneeName: "Vik Shah",
    createdById: "u1", createdByName: "Asha Rao", createdByKind: "user", campaign: null, candidate: null, action: null, createdAt: iso(30), resolvedAt: null, ...over,
  });

  it("lists what was handed out, leaving out the caller's own and anything finished", async () => {
    roles.setSession({ userId: "u1", name: "Asha Rao" });
    handed = [given("h1"), given("h2", { assigneeId: "u1", assigneeName: "Asha Rao" }), given("h3", { status: "done" })];
    home.assignedNow("team");
    await vi.waitFor(() => expect(home.assignedNow().ready).toBe(true));
    expect(home.assignedNow().items.map((t) => t.id)).toEqual(["h1"]);
    expect(home.assignedNow().items[0]).toMatchObject({ assigneeName: "Vik Shah", createdByName: "Asha Rao" });
  });

  it("puts a task made for a teammate in their list, not in mine, and swaps in the saved one", async () => {
    const before = home.tasksNow().items.length;
    home.addTask("Chase references", null, "u2");
    expect(home.assignedNow().items[0]).toMatchObject({ title: "Chase references" });
    expect(home.tasksNow().items.length).toBe(before);
    await vi.waitFor(() => expect(home.assignedNow().items[0]?.id).toBe("t-real"));
  });

  it("reassigns at once, hands it back to me on my list, and puts it back when refused", async () => {
    server.fail = /PATCH \/v1\/tasks\/h1/;
    home.reassignTask("h1", "u1", "Asha Rao");
    expect(home.assignedNow().items.find((t) => t.id === "h1")).toBeUndefined();
    await vi.waitFor(() => expect(home.assignedNow().items.find((t) => t.id === "h1")?.assigneeName).toBe("Vik Shah"));
    expect(problems.at(-1)).toMatch(/wasn't reassigned/);
    home.reassignTask("h1", "u1", "Asha Rao");
    await vi.waitFor(() => expect(home.tasksNow().items.some((t) => t.id === "h1")).toBe(true));
    expect(home.assignedNow().items.find((t) => t.id === "h1")).toBeUndefined();
  });
});

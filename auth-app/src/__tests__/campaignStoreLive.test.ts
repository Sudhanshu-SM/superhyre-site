import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBoardRow, ApiCampaign } from "../api/campaigns";

/**
 * The campaign store with the API connected: a refused change is put back and answers false (so no
 * success is said first), a decision made in the chat catches the counts up, and a new workspace
 * starts from nothing.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    refuse: null as null | { re: RegExp; status: number; message: string },
    hold: null as null | Promise<void>,
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
      if (method !== "GET" && server.refuse?.re.test(`${method} ${path}`)) {
        const r = server.refuse;
        server.refuse = null;
        throw new ApiError(r.status, "forbidden", r.message);
      }
      if (server.hold && method === "GET" && path === "/v1/campaigns") await server.hold;
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../campaignStore");
const { agentApi } = await import("../api/agent");

const iso = (min: number) => new Date(Date.now() - min * 60000).toISOString();
let campaigns: ApiCampaign[];

const camp = (id: string, over: Partial<ApiCampaign> = {}): ApiCampaign => ({
  id, name: `Campaign ${id}`, status: "active", department: null, location: null, priority: "normal", visibility: "team",
  client: null, owner: { id: "u1", name: "Asha Rao" }, team: [{ id: "u1", name: "Asha Rao", role: "owner" }],
  funnel: { shortlisted: 0, outreach: 0, interviewing: 0, hired: 0, passed: 0 }, hired: 0, target: 2, agents: 0,
  openedAt: iso(100), closedAt: null, createdAt: iso(100), updatedAt: iso(5),
  summary: { found: 3, foundThisWeek: 1, sourcedPerDay: new Array<number>(14).fill(0), replied: 0, openTasks: 0 }, ...over,
});
const person = (cc: string): ApiBoardRow => ({
  campaignCandidateId: cc, candidateId: `cand-${cc}`, personId: `p-${cc}`, fullName: `Person ${cc}`, currentTitle: null,
  currentCompanyName: null, city: null, linkedinUrl: null, stage: "shortlisted", step: null, ownerId: "u1",
  source: "agent", fit: 2, tier: null, addedAt: iso(600), yearsOfExperience: null, skills: [], daysInStage: 3,
  lastActivityAt: iso(60), hasEmail: false, hasPhone: false,
});

server.handle = (method, path) => {
  const route = `${method} ${path.split("?")[0]}`;
  if (route === "GET /v1/campaigns") return { campaigns };
  if (route === "GET /v1/me") return { user: { id: "u1" } };
  if (route === "GET /v1/members") return { members: [] };
  if (route === "GET /v1/clients") return { clients: [] };
  let m = /^GET \/v1\/campaigns\/([^/]+)\/overview$/.exec(route);
  if (m) {
    return {
      campaign: { id: m[1], name: "x", status: "active" }, found: { thisWeek: 1, lastWeek: 0, total: 3 }, kept: { thisWeek: 0, lastWeek: 0, total: 0 },
      funnel: [], repliedPct: null, hired: 0, target: 2, sourcedPerDay: [], needsYou: [], yourWork: null, hires: null, activity: [],
    };
  }
  if (/^GET \/v1\/campaigns\/[^/]+\/activity$/.test(route)) return { items: [], nextBefore: null };
  if (/^GET \/v1\/campaigns\/[^/]+\/candidates$/.test(route)) return { candidates: [person("a"), person("b")] };
  m = /^GET \/v1\/campaigns\/([^/]+)$/.exec(route);
  if (m) return campaigns.find((c) => c.id === m?.[1]);
  m = /^PATCH \/v1\/campaigns\/([^/]+)$/.exec(route);
  if (m) return campaigns.find((c) => c.id === m?.[1]);
  m = /^PUT \/v1\/campaigns\/([^/]+)\/status$/.exec(route);
  if (m) return campaigns.find((c) => c.id === m?.[1]);
  if (/\/matches\/shortlist$/.test(route)) {
    campaigns = campaigns.map((c) => ({ ...c, funnel: { ...c.funnel, shortlisted: 2 } }));
    return { added: 2 };
  }
  throw new Error(`unexpected ${route}`);
};

beforeEach(async () => {
  campaigns = [camp("c1"), camp("c2", { status: "closed" })];
  server.refuse = null;
  server.hold = null;
  server.calls.length = 0;
  problems.length = 0;
  store.resetCampaignStore();
  store.ensureCampaigns();
  await vi.waitFor(() => expect(store.campaignRow("c1")).toBeDefined());
});

describe("a refused change", () => {
  it("answers false and puts the client back, so success is only ever said after the server agrees", async () => {
    server.refuse = { re: /PATCH \/v1\/campaigns\/c1/, status: 403, message: "Only admins and the campaign's owner can change its client or visibility." };
    expect(await store.setCampaignClient("c1", null)).toBe(false);
    expect(problems.join(" ")).toMatch(/Only admins and the campaign's owner/);
  });

  it("answers true once the server has it", async () => {
    expect(await store.setCampaignClient("c1", null)).toBe(true);
    expect(problems).toEqual([]);
  });

  it("answers false for a status the server refuses, and the row goes back", async () => {
    server.refuse = { re: /PUT \/v1\/campaigns\/c2\/status/, status: 403, message: "Only an admin or the campaign's owner can close or reopen it." };
    expect(await store.setCampaignStatus("c2", "active")).toBe(false);
    expect(store.campaignRow("c2")?.status).toBe("closed");
    expect(await store.setCampaignStatus("c1", "closed")).toBe(true);
  });
});

describe("counts follow a decision made elsewhere", () => {
  it("reads the campaign again after a shortlist from the chat", async () => {
    vi.useFakeTimers();
    try {
      expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(0);
      server.calls.length = 0;
      await agentApi.shortlist("c1", ["p1", "p2"]);
      await vi.advanceTimersByTimeAsync(1500);
      expect(server.calls).toContain("GET /v1/campaigns/c1");
      expect(store.campaignRow("c1")?.funnel.shortlisted).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a new workspace", () => {
  it("clears what was loaded and asks again", async () => {
    store.ensureBoard("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(2));
    store.resetCampaignStore();
    expect(store.campaignRow("c1")).toBeUndefined();
    expect(store.pipelineNow("c1")).toEqual([]);
    expect(store.getClients().clients).toEqual([]);

    campaigns = [camp("n1")];
    store.ensureCampaigns();
    await vi.waitFor(() => expect(store.campaignRow("n1")).toBeDefined());
    expect(store.campaignRow("c1")).toBeUndefined();
  });

  it("drops an answer that arrives after the switch", async () => {
    store.resetCampaignStore();
    let release: () => void = () => {};
    server.hold = new Promise<void>((r) => { release = r; });
    store.ensureCampaigns();
    store.resetCampaignStore();
    server.hold = null;
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.campaignRow("c1")).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBoardRow, ApiCampaign } from "../api/campaigns";
import type { ApiClientRow } from "../api/clients";
import { blankDraft, prefillFromClient, rowFromDraft, withNewClient } from "../campaignDraft";

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
    /** Holds every write (anything but a GET) until it is released. */
    holdWrite: null as null | Promise<void>,
    calls: [] as string[],
    /** What each write was sent, in order. */
    sent: [] as Array<{ route: string; body: unknown }>,
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
      if (method !== "GET") server.sent.push({ route: `${method} ${path}`, body });
      if (server.holdWrite && method !== "GET") await server.holdWrite;
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
let clientRows: ApiClientRow[];

const clientRow = (id: string, name: string): ApiClientRow => ({
  id, name, website: null, domain: null, industry: null, location: null, status: "active", ownerId: null, ownerName: null, fee: null,
  notes: null, primaryContact: null, createdAt: iso(5000), lastActivityAt: iso(10),
});
/** The client a name comes to on the server: the one of that name, else a new one. */
const clientNamed = (name: string): ApiClientRow => {
  const there = clientRows.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (there) return there;
  const made = clientRow(`cl-new-${clientRows.length + 1}`, name);
  clientRows = [...clientRows, made];
  return made;
};

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

server.handle = (method, path, body) => {
  const route = `${method} ${path.split("?")[0]}`;
  if (route === "GET /v1/campaigns") return { campaigns };
  if (route === "GET /v1/me") return { user: { id: "u1" } };
  if (route === "GET /v1/members") return { members: [] };
  if (route === "GET /v1/clients") return { clients: clientRows };
  if (route === "POST /v1/campaigns") {
    const b = body as { name: string; clientId?: string; newClient?: string };
    const client = b.clientId ? clientRows.find((c) => c.id === b.clientId) : b.newClient ? clientNamed(b.newClient) : undefined;
    const made = camp(`made-${campaigns.length + 1}`, { name: b.name, client: client ? { id: client.id, name: client.name } : null });
    campaigns = [made, ...campaigns];
    return made;
  }
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
  if (m) {
    const b = body as { clientId?: string; newClient?: string };
    const client = b.clientId ? clientRows.find((c) => c.id === b.clientId) : b.newClient ? clientNamed(b.newClient) : undefined;
    campaigns = campaigns.map((c) => (c.id === m?.[1] && client ? { ...c, client: { id: client.id, name: client.name } } : c));
    return campaigns.find((c) => c.id === m?.[1]);
  }
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
  clientRows = [clientRow("cl1", "Acme Fintech")];
  server.refuse = null;
  server.hold = null;
  server.holdWrite = null;
  server.calls.length = 0;
  server.sent.length = 0;
  problems.length = 0;
  store.resetCampaignStore();
  store.ensureCampaigns();
  await vi.waitFor(() => expect(store.campaignRow("c1")).toBeDefined());
});

describe("a refused change", () => {
  it("answers false and puts the client back, so success is only ever said after the server agrees", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.clientById("cl1")).toBeDefined());
    server.refuse = { re: /PATCH \/v1\/campaigns\/c1/, status: 403, message: "Only admins and the campaign's owner can change its client or visibility." };
    expect(await store.setCampaignClient("c1", "cl1")).toBe(false);
    expect(problems.join(" ")).toMatch(/Only admins and the campaign's owner/);
    expect(store.campaignRow("c1")?.client).toBeUndefined();
    expect(store.getClients().clientOf["c1"]).toBeUndefined();
  });

  it("answers true once the server has it", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.clientById("cl1")).toBeDefined());
    expect(await store.setCampaignClient("c1", "cl1")).toBe(true);
    expect(problems).toEqual([]);
    expect(store.campaignRow("c1")?.client).toBe("Acme Fintech");
  });

  it("answers false for a status the server refuses, and the row goes back", async () => {
    server.refuse = { re: /PUT \/v1\/campaigns\/c2\/status/, status: 403, message: "Only an admin or the campaign's owner can close or reopen it." };
    expect(await store.setCampaignStatus("c2", "active")).toBe(false);
    expect(store.campaignRow("c2")?.status).toBe("closed");
    expect(await store.setCampaignStatus("c1", "closed")).toBe(true);
  });
});

describe("a campaign's client", () => {
  it("is set by its id: the campaign shows the client's name at once, and the server is sent the id and nothing else", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.clientById("cl1")).toBeDefined());
    const done = store.setCampaignClient("c1", "cl1");
    expect(store.campaignRow("c1")?.client).toBe("Acme Fintech");
    expect(await done).toBe(true);
    expect(server.sent.filter((x) => x.route === "PATCH /v1/campaigns/c1").map((x) => x.body)).toEqual([{ clientId: "cl1" }]);
    expect(store.getClients().clientOf["c1"]).toBe("cl1");
  });

  it("is set from a company's name: shown under that name at once, sent as the name alone, and the client the server made replaces it", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.getClients().clients.map((c) => c.id)).toContain("cl1"));
    let release: () => void = () => {};
    server.holdWrite = new Promise<void>((r) => { release = r; });
    const done = store.setCampaignClientByName("c1", "  Orbit Labs ");
    expect(store.campaignRow("c1")?.client).toBe("Orbit Labs");
    // While the server is thinking, the company is on the campaign but is not a client anyone can pick: it has no id yet.
    expect(store.getClients().clients.map((c) => c.name)).not.toContain("Orbit Labs");
    release();
    expect(await done).toBe(true);
    expect(server.sent.filter((x) => x.route === "PATCH /v1/campaigns/c1").map((x) => x.body)).toEqual([{ newClient: "Orbit Labs" }]);
    const id = store.getClients().clientOf["c1"];
    expect(id).toMatch(/^cl-new-/);
    expect(store.clientById(id!)?.name).toBe("Orbit Labs");
    expect(problems).toEqual([]);
    // The clients are read again, so the one the server made is in every list.
    await vi.waitFor(() => expect(server.calls.filter((c) => c === "GET /v1/clients")).toHaveLength(2));
  });

  it("is put back with no client, and the reason said, when the server turns a company's name down", async () => {
    server.refuse = { re: /PATCH \/v1\/campaigns\/c1/, status: 403, message: "Only admins and the campaign's owner can change its client or visibility." };
    const done = store.setCampaignClientByName("c1", "Orbit Labs");
    expect(store.campaignRow("c1")?.client).toBe("Orbit Labs");
    expect(await done).toBe(false);
    expect(store.campaignRow("c1")?.client).toBeUndefined();
    expect(store.getClients().clientOf["c1"]).toBeUndefined();
    expect(problems.join(" ")).toMatch(/The client on Campaign c1 wasn't changed\. Only admins and the campaign's owner/);
  });

  it("is not set from a blank name, and nothing is sent", async () => {
    expect(await store.setCampaignClientByName("c1", "   ")).toBe(false);
    expect(server.sent).toEqual([]);
  });

  it("cannot be named for a campaign that is still being made, and says so; a client picked for it is kept in the meantime", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.clientById("cl1")).toBeDefined());
    let release: () => void = () => {};
    server.holdWrite = new Promise<void>((r) => { release = r; });
    // Made for a company that was only named, so it has no client picked yet.
    const row = rowFromDraft(withNewClient({ ...blankDraft("Asha Rao"), name: "Platform SRE" }, "Zorblax Studios"), ["Asha Rao"], 1);
    const making = store.addCampaignRow(row);
    expect(store.getClients().clientOf[row.id]).toBeUndefined();
    expect(await store.setCampaignClientByName(row.id, "Orbit Labs")).toBe(false);
    expect(problems.join(" ")).toMatch(/still being made/);
    expect(server.sent.filter((x) => x.route.startsWith("PATCH"))).toEqual([]);
    expect(await store.setCampaignClient(row.id, "cl1")).toBe(true);
    expect(store.getClients().clientOf[row.id]).toBe("cl1");
    release();
    expect(await making).toBe(true);
  });

  it("goes with a new campaign as the client's id when one was picked, and as the company's name when one was named", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.clientById("cl1")).toBeDefined());
    const picked = rowFromDraft(prefillFromClient({ ...blankDraft("Asha Rao"), name: "Platform SRE" }, store.clientById("cl1")), ["Asha Rao"], 1);
    expect(await store.addCampaignRow(picked)).toBe(true);
    const named = rowFromDraft(withNewClient({ ...blankDraft("Asha Rao"), name: "Data Lead" }, "Orbit Labs"), ["Asha Rao"], 2);
    expect(await store.addCampaignRow(named)).toBe(true);
    const posts = server.sent.filter((x) => x.route === "POST /v1/campaigns").map((x) => x.body as Record<string, unknown>);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ name: "Platform SRE", clientId: "cl1" });
    expect(posts[0]).not.toHaveProperty("newClient");
    expect(posts[1]).toMatchObject({ name: "Data Lead", newClient: "Orbit Labs" });
    // No empty client id on the wire for the company that was named.
    expect(posts[1]).not.toHaveProperty("clientId");
    expect(store.campaignRow("made-3")?.client).toBe("Acme Fintech");
    expect(store.campaignRow("made-4")?.client).toBe("Orbit Labs");
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

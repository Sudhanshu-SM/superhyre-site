import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBoardRow, ApiCampaign } from "../api/campaigns";

/**
 * A campaign's own stages in the store, with the API connected: the board read brings the columns, a move can name
 * one, a move by kind lands in the first stage of that kind, saving the stages sends them (and where the people of a
 * removed one go) and reads the board again, and a refusal puts everything back with one line saying why.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    refuse: null as null | { re: RegExp; status: number; message: string },
    calls: [] as { route: string; body: unknown }[],
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
      await Promise.resolve();
      server.calls.push({ route: `${method} ${path}`, body });
      if (method !== "GET" && server.refuse?.re.test(`${method} ${path}`)) {
        const r = server.refuse;
        server.refuse = null;
        throw new ApiError(r.status, "forbidden", r.message);
      }
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../campaignStore");

const iso = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const stage = (id: string, name: string, kind: string, position: number, extra: Record<string, unknown> = {}) =>
  ({ id, name, kind, position, color: null, clientView: false, locked: kind === "hired" || kind === "passed", ...extra });

const STAGES = [
  stage("s", "Shortlisted", "shortlisted", 0), stage("o", "Outreach", "outreach", 1), stage("c", "Client review", "outreach", 2, { clientView: true, color: "teal" }),
  stage("i", "Interviewing", "interviewing", 3), stage("h", "Hired", "hired", 4), stage("p", "Rejected", "passed", 5),
];
const row = (cc: string, stageKind: ApiBoardRow["stage"], stageId: string): ApiBoardRow => ({
  campaignCandidateId: cc, candidateId: `cand-${cc}`, personId: `p-${cc}`, fullName: `Person ${cc}`, currentTitle: null,
  currentCompanyName: null, city: null, linkedinUrl: null, stage: stageKind, stageId, step: stageKind === "outreach" ? "waiting" : null, ownerId: "u1",
  source: "agent", fit: 2, tier: null, addedAt: iso(600), yearsOfExperience: null, skills: [], daysInStage: 3,
  lastActivityAt: iso(60), hasEmail: false, hasPhone: false,
});
const camp = (id: string, over: Partial<ApiCampaign> = {}): ApiCampaign => ({
  id, name: `Campaign ${id}`, status: "active", department: null, location: null, priority: "normal", visibility: "team",
  client: null, owner: { id: "u1", name: "Asha Rao" }, team: [{ id: "u1", name: "Asha Rao", role: "owner" }],
  funnel: { shortlisted: 1, outreach: 2, interviewing: 0, hired: 0, passed: 0 }, hired: 0, target: 2, agents: 0,
  openedAt: iso(100), closedAt: null, createdAt: iso(100), updatedAt: iso(5),
  summary: { found: 3, foundThisWeek: 1, sourcedPerDay: new Array<number>(14).fill(0), replied: 0, openTasks: 0 }, ...over,
});

let board: ApiBoardRow[];
let stages: unknown[];
let campaigns: ApiCampaign[];

server.handle = (method, path, body) => {
  const route = `${method} ${path.split("?")[0]}`;
  if (route === "GET /v1/campaigns") return { campaigns };
  if (route === "GET /v1/me") return { user: { id: "u1" } };
  if (route === "GET /v1/members") return { members: [] };
  if (route === "GET /v1/clients") return { clients: [] };
  if (/^GET \/v1\/campaigns\/[^/]+\/overview$/.test(route)) {
    return { campaign: { id: "c1", name: "x", status: "active" }, found: { thisWeek: 1, lastWeek: 0, total: 3 }, kept: { thisWeek: 0, lastWeek: 0, total: 0 }, funnel: [], repliedPct: null, hired: 0, target: 2, sourcedPerDay: [], needsYou: [], yourWork: null, hires: null, activity: [] };
  }
  if (/^GET \/v1\/campaigns\/[^/]+\/activity$/.test(route)) return { items: [], nextBefore: null };
  if (/^GET \/v1\/campaigns\/[^/]+\/candidates$/.test(route)) return { candidates: board, stages };
  let m = /^PATCH \/v1\/campaigns\/([^/]+)\/candidates\/([^/]+)$/.exec(route);
  if (m) {
    const b = body as { stageId?: string; stage?: ApiBoardRow["stage"] };
    const at = (stages as { id: string; kind: ApiBoardRow["stage"] }[]).find((s) => s.id === b.stageId);
    board = board.map((r) => (r.campaignCandidateId === m![2] ? { ...r, ...(at ? { stage: at.kind, stageId: at.id } : b.stage ? { stage: b.stage } : {}) } : r));
    return board.find((r) => r.campaignCandidateId === m![2]);
  }
  if (/^POST \/v1\/campaigns\/[^/]+\/pass-open$/.test(route)) return { passed: 2 };
  if (/^PUT \/v1\/campaigns\/[^/]+\/stages$/.test(route)) {
    const b = body as { stages: { id?: string; name: string; kind: string; color?: string | null; clientView?: boolean }[]; moveTo?: Record<string, string> };
    const made = [...b.stages.map((s, i) => stage(s.id ?? `new-${i}`, s.name, s.kind, i, { color: s.color ?? null, clientView: s.clientView === true })), STAGES[4]!, STAGES[5]!]
      .map((s, i) => ({ ...s, position: i }));
    // people of a removed stage go where they were told
    const kept = new Set(made.map((s) => s.id));
    board = board.map((r) => (r.stageId && !kept.has(r.stageId) ? { ...r, stageId: b.moveTo?.[r.stageId] ?? made[0]!.id } : r));
    stages = made;
    return { stages: made };
  }
  m = /^GET \/v1\/campaigns\/([^/]+)$/.exec(route);
  if (m) return campaigns.find((c) => c.id === m?.[1]);
  throw new Error(`unexpected ${route}`);
};

const sent = (re: RegExp) => server.calls.filter((c) => re.test(c.route));

beforeEach(async () => {
  campaigns = [camp("c1"), camp("c2", { stages: [{ id: "x1", name: "Intro call", kind: "shortlisted", color: "blue", count: 2 }, { id: "x2", name: "Hired", kind: "hired", color: null, count: 0 }, { id: "x3", name: "Rejected", kind: "passed", color: null, count: 0 }] })];
  stages = STAGES;
  board = [row("a", "outreach", "o"), row("b", "outreach", "c"), row("d", "shortlisted", "s")];
  server.refuse = null;
  server.calls.length = 0;
  problems.length = 0;
  store.resetCampaignStore();
  store.ensureCampaigns();
  await vi.waitFor(() => expect(store.campaignRow("c1")).toBeDefined());
  store.ensureBoard("c1");
  await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(3));
});

describe("the board's columns", () => {
  it("come with the board, and every card knows its column", () => {
    expect(store.stagesNow("c1").map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Client review", "Interviewing", "Hired", "Rejected"]);
    expect(store.stagesNow("c1").find((s) => s.clientView)?.id).toBe("c");
    expect(store.pipelineNow("c1").map((p) => [p.id, p.stage, p.stageId])).toEqual(expect.arrayContaining([["a", "outreach", "o"], ["b", "outreach", "c"], ["d", "shortlisted", "s"]]));
  });

  it("are the console's own five before anything says otherwise, and the list's summary once it does", () => {
    expect(store.stagesNow("unknown").map((s) => s.name)).toEqual(["Shortlisted", "In outreach", "Interviewing", "Hired", "Rejected"]);
    expect(store.stagesNow("c2").map((s) => s.name)).toEqual(["Intro call", "Hired", "Rejected"]);
    expect(store.stagesNow("c2")).toBe(store.stagesNow("c2"));
  });
});

describe("moving a card", () => {
  it("into a named column sends that column and nothing else, and the card is there at once", async () => {
    store.movePerson("c1", "a", { stageId: "c" });
    expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "outreach", stageId: "c" });
    await vi.waitFor(() => expect(sent(/^PATCH .*candidates\/a$/)).toHaveLength(1));
    expect(sent(/^PATCH .*candidates\/a$/)[0]!.body).toEqual({ stageId: "c" });
  });

  it("into a column of another kind carries the kind with it, and the step that kind starts at", async () => {
    store.movePerson("c1", "a", { stageId: "i" });
    expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "interviewing", stageId: "i", step: "loop" });
    await vi.waitFor(() => expect(sent(/^PATCH /)).toHaveLength(1));
  });

  it("by kind lands in the first stage of that kind, as the server puts it", async () => {
    store.movePerson("c1", "d", "outreach");
    expect(store.pipelineNow("c1").find((p) => p.id === "d")).toMatchObject({ stage: "outreach", stageId: "o" });
    await vi.waitFor(() => expect(sent(/^PATCH /)).toHaveLength(1));
    expect(sent(/^PATCH /)[0]!.body).toMatchObject({ stage: "outreach" });
  });

  it("to the column it is already in changes nothing and asks for nothing", () => {
    store.movePerson("c1", "a", { stageId: "o" });
    store.movePerson("c1", "b", { stageId: "c" });
    expect(sent(/^PATCH /)).toHaveLength(0);
  });

  it("is put back, with one line saying why, when the server refuses", async () => {
    server.refuse = { re: /^PATCH /, status: 403, message: "Only the people on this campaign can move its candidates." };
    store.movePerson("c1", "a", { stageId: "i" });
    await vi.waitFor(() => expect(problems).toHaveLength(1));
    expect(problems[0]).toMatch(/Person wasn't moved\. Only the people on this campaign/);
    expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "outreach", stageId: "o" });
  });

  it("keeps a client's word on the card", async () => {
    board = board.map((r) => (r.campaignCandidateId === "b" ? { ...r, clientReview: { verdict: "approved" as const, note: "Strong", reviewerName: "Dev", at: iso(5) } } : r));
    store.refreshCampaign("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1").find((p) => p.id === "b")?.clientVerdict?.verdict).toBe("approved"));
    expect(store.pipelineNow("c1").find((p) => p.id === "b")?.clientVerdict?.note).toBe("Strong");
    expect(store.pipelineNow("c1").find((p) => p.id === "a")?.clientVerdict).toBeUndefined();
  });
});

describe("saving the stages", () => {
  const rowsOf = async () => (await import("../boardStages")).rowsFrom(store.stagesNow("c1"), { s: 1, o: 1, c: 1 });

  it("sends the working stages in order with the people of a removed one told where to go, then reads the board again", async () => {
    const { removeRow, addRow } = await import("../boardStages");
    const rows = await rowsOf();
    const next = addRow(removeRow(rows, rows.find((r) => r.name === "Client review")!.key), "Offer call");
    server.calls.length = 0;
    expect(await store.saveStages("c1", next, { c: "o" })).toBe(true);
    const put = sent(/^PUT .*\/stages$/);
    expect(put).toHaveLength(1);
    expect(put[0]!.body).toEqual({
      stages: [
        { id: "s", name: "Shortlisted", kind: "shortlisted", color: null, clientView: false },
        { id: "o", name: "Outreach", kind: "outreach", color: null, clientView: false },
        { id: "i", name: "Interviewing", kind: "interviewing", color: null, clientView: false },
        { name: "Offer call", kind: "interviewing", color: null, clientView: false },
      ],
      moveTo: { c: "o" },
    });
    expect(store.stagesNow("c1").map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Interviewing", "Offer call", "Hired", "Rejected"]);
    // the board was read again, and the person who was in the removed stage is where they were sent
    expect(sent(/^GET .*\/candidates$/).length).toBeGreaterThanOrEqual(1);
    expect(store.pipelineNow("c1").find((p) => p.id === "b")?.stageId).toBe("o");
  });

  it("answers false, says why once, and leaves the board as it was when it is refused", async () => {
    const { removeRow } = await import("../boardStages");
    const rows = await rowsOf();
    server.refuse = { re: /^PUT /, status: 403, message: "Only the people on this campaign can change its stages." };
    expect(await store.saveStages("c1", removeRow(rows, rows[0]!.key))).toBe(false);
    expect(problems.join(" ")).toMatch(/The stages weren't saved\. Only the people on this campaign/);
    expect(store.stagesNow("c1").map((s) => s.name)).toContain("Shortlisted");
  });
});

describe("hired people", () => {
  it("tells the views when someone moves out of Hired (and into it), and not for any other move", async () => {
    board = [row("a", "outreach", "o"), row("h1", "hired", "h")];
    store.refreshCampaign("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(2));
    let told = 0;
    const off = store.onHiredChange(() => { told += 1; });
    store.movePerson("c1", "a", { stageId: "i" });
    await vi.waitFor(() => expect(sent(/^PATCH .*candidates\/a$/)).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(told).toBe(0);
    store.movePerson("c1", "h1", { stageId: "i" });
    await vi.waitFor(() => expect(told).toBe(1));
    store.movePerson("c1", "a", { stageId: "h" });
    await vi.waitFor(() => expect(told).toBe(2));
    off();
  });

  it("does not move a card into Hired until the server agrees, asks first when it says so, and moves nothing on a no", async () => {
    const { ApiError } = await import("../api/client");
    board = [row("a", "outreach", "o")];
    store.refreshCampaign("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(1));
    const inner = server.handle;
    server.handle = (m, p, b) => {
      const body = b as { removeFromOthers?: boolean } | undefined;
      if (m === "PATCH" && /candidates\/a$/.test(p) && !body?.removeFromOthers) {
        throw new ApiError(409, "needs_confirm_hired", "Hiring takes them off other shortlists.", { campaigns: [{ id: "x1", name: "Data Lead" }, { id: "x2", name: "Platform Lead" }] });
      }
      return inner(m, p, b);
    };
    try {
      store.movePerson("c1", "a", { stageId: "h" });
      // nothing moved on the screen while it was being asked
      expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "outreach", stageId: "o" });
      await vi.waitFor(() => expect(sent(/^PATCH .*candidates\/a$/)).toHaveLength(1));
      expect(sent(/^PATCH .*candidates\/a$/)[0]!.body).toEqual({ stageId: "h" });
      await vi.waitFor(() => expect(store.hiredAskNow()).not.toBeNull());
      expect(store.hiredAskNow()).toMatchObject({ campaignId: "c1", ccId: "a", name: "Person a", campaigns: [{ id: "x1", name: "Data Lead" }, { id: "x2", name: "Platform Lead" }] });
      expect(problems).toEqual([]);

      // a no: still where it was, nothing more sent
      store.cancelHiredAsk();
      expect(store.hiredAskNow()).toBeNull();
      expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "outreach", stageId: "o" });
      expect(sent(/^PATCH .*candidates\/a$/)).toHaveLength(1);

      // a yes: tried again with removeFromOthers, then it is real
      const landed: string[] = [];
      let told = 0;
      const off = [store.onHiredLanded((e) => landed.push(e.ccId)), store.onHiredChange(() => { told += 1; })];
      store.movePerson("c1", "a", { stageId: "h" });
      await vi.waitFor(() => expect(store.hiredAskNow()).not.toBeNull());
      store.confirmHiredAsk();
      await vi.waitFor(() => expect(landed).toEqual(["a"]));
      const patches = sent(/^PATCH .*candidates\/a$/);
      expect(patches[patches.length - 1]!.body).toEqual({ stageId: "h", removeFromOthers: true });
      expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "hired", stageId: "h" });
      expect(told).toBe(1);
      expect(store.hiredAskNow()).toBeNull();
      off.forEach((f) => f());
    } finally {
      server.handle = inner;
    }
  });

  it("says nothing and moves straight in when there is nothing to ask", async () => {
    board = [row("a", "outreach", "o")];
    store.refreshCampaign("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(1));
    const landed: string[] = [];
    const off = store.onHiredLanded((e) => landed.push(e.ccId));
    store.movePerson("c1", "a", "hired");
    await vi.waitFor(() => expect(landed).toEqual(["a"]));
    expect(store.hiredAskNow()).toBeNull();
    expect(sent(/^PATCH .*candidates\/a$/)[0]!.body).toMatchObject({ stage: "hired" });
    off();
  });

  it("passes the rest only when asked, answers how many, and says why once if it is refused", async () => {
    expect(await store.passOpenPeople("c1")).toBe(2);
    expect(sent(/^POST .*\/campaigns\/c1\/pass-open$/)).toHaveLength(1);
    server.refuse = { re: /pass-open$/, status: 403, message: "Only the people on this campaign can do that." };
    expect(await store.passOpenPeople("c1")).toBeNull();
    expect(problems.join(" ")).toMatch(/Those people weren't rejected\. Only the people on this campaign/);
  });
});

describe("hiring: whom it takes them off, and what is a first hire", () => {
  it("lists only the campaigns the person is really on, and asks nothing when they were rejected from all of them", async () => {
    const { ApiError } = await import("../api/client");
    board = [row("a", "outreach", "o")];
    store.refreshCampaign("c1");
    await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(1));
    const inner = server.handle;
    let list: unknown[] = [];
    server.handle = (m, p, b) => {
      const body = b as { removeFromOthers?: boolean } | undefined;
      if (m === "PATCH" && /candidates\/a$/.test(p) && !body?.removeFromOthers) throw new ApiError(409, "needs_confirm_hired", "Hiring takes them off other shortlists.", { campaigns: list });
      return inner(m, p, b);
    };
    try {
      list = [{ id: "x1", name: "Helix", stage: "passed" }, { id: "x2", name: "Platform Lead", stage: "outreach" }, { id: "x3", name: "Data", rejected: true }];
      store.movePerson("c1", "a", { stageId: "h" });
      await vi.waitFor(() => expect(store.hiredAskNow()).not.toBeNull());
      expect(store.hiredAskNow()!.campaigns).toEqual([{ id: "x2", name: "Platform Lead" }]);
      store.cancelHiredAsk();

      // rejected from all of them: nothing to lose, nothing to ask, and it goes through
      list = [{ id: "x1", name: "Helix", stage: "passed" }];
      const landed: string[] = [];
      const off = store.onHiredLanded((e) => landed.push(e.ccId));
      store.movePerson("c1", "a", { stageId: "h" });
      await vi.waitFor(() => expect(landed).toEqual(["a"]));
      expect(store.hiredAskNow()).toBeNull();
      const patches = sent(/^PATCH .*candidates\/a$/);
      expect(patches[patches.length - 1]!.body).toEqual({ stageId: "h", removeFromOthers: true });
      off();
    } finally {
      server.handle = inner;
    }
  });

  it("knows whether the organisation has hired before, from the other campaigns' hires", async () => {
    campaigns = [camp("c1"), camp("c2", { hires: { count: 1, target: 3 } }), camp("c3", { funnel: { shortlisted: 0, outreach: 0, interviewing: 0, hired: 0, passed: 0 } })];
    store.resetCampaignStore();
    store.ensureCampaigns();
    await vi.waitFor(() => expect(store.campaignRow("c2")).toBeDefined());
    expect(store.orgHasEarlierHire("c1")).toBe(true);
    expect(store.orgHasEarlierHire("c2")).toBe(false);
    campaigns = [camp("c1"), camp("c3")];
    store.resetCampaignStore();
    store.ensureCampaigns();
    await vi.waitFor(() => expect(store.campaignRow("c3")).toBeDefined());
    expect(store.orgHasEarlierHire("c1")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBoardRow, ApiCampaign } from "../api/campaigns";

/**
 * Replied is a status a person can be put at, in every menu that chooses one. It is not a stage of its own:
 * the board keeps it inside In outreach (outreach at its replied step) and the server counts it once, so a
 * move to Replied is a move to outreach with the replied step.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    calls: [] as Array<{ route: string; body: unknown }>,
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
      server.calls.push({ route: `${method} ${path}`, body });
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../campaignStore");
const campaign = await import("../campaign");
const { movedOnBoard, shiftFunnel } = await import("../api/campaigns");
const { stagesFrom, controlState } = await import("../shortlistControl");
const { shortlistTable, responseTable } = await import("../exportTable");

const iso = (min: number) => new Date(Date.now() - min * 60000).toISOString();
let board: ApiBoardRow[];

const camp = (id: string): ApiCampaign => ({
  id, name: `Campaign ${id}`, status: "active", department: null, location: null, priority: "normal", visibility: "team",
  client: null, owner: { id: "u1", name: "Asha Rao" }, team: [{ id: "u1", name: "Asha Rao", role: "owner" }],
  funnel: { shortlisted: 1, outreach: 1, interviewing: 0, hired: 0, passed: 0 }, hired: 0, target: 2, agents: 0,
  openedAt: iso(100), closedAt: null, createdAt: iso(100), updatedAt: iso(5),
  summary: { found: 3, foundThisWeek: 1, sourcedPerDay: new Array<number>(14).fill(0), replied: 0, openTasks: 0 },
});
const row = (cc: string, stage: ApiBoardRow["stage"], step: ApiBoardRow["step"]): ApiBoardRow => ({
  campaignCandidateId: cc, candidateId: `cand-${cc}`, personId: `p-${cc}`, fullName: `Person ${cc}`, currentTitle: null,
  currentCompanyName: null, city: null, linkedinUrl: null, stage, step, ownerId: "u1",
  source: "agent", fit: 2, tier: null, addedAt: iso(600), yearsOfExperience: null, skills: [], daysInStage: 3,
  stageEnteredAt: iso(3 * 1440), lastActivityAt: iso(60), hasEmail: false, hasPhone: false,
});

server.handle = (method, path, body) => {
  const route = `${method} ${path.split("?")[0]}`;
  if (route === "GET /v1/campaigns") return { campaigns: [camp("c1")] };
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
  if (/^GET \/v1\/campaigns\/[^/]+\/candidates$/.test(route)) return { candidates: board };
  m = /^PATCH \/v1\/campaigns\/([^/]+)\/candidates\/([^/]+)$/.exec(route);
  if (m) {
    const b = body as { stage?: ApiBoardRow["stage"]; step?: ApiBoardRow["step"] };
    const at = board.find((r) => r.campaignCandidateId === m?.[2]);
    return { ...at, ...(b.stage ? { stage: b.stage } : {}), ...(b.step !== undefined ? { step: b.step } : {}) };
  }
  m = /^POST \/v1\/campaigns\/([^/]+)\/candidates\/bulk-move$/.exec(route);
  if (m) return { moved: 2, unchanged: 0 };
  m = /^GET \/v1\/campaigns\/([^/]+)$/.exec(route);
  if (m) return camp("c1");
  throw new Error(`unexpected ${route}`);
};

beforeEach(async () => {
  board = [row("a", "shortlisted", null), row("b", "outreach", "waiting"), row("c", "outreach", "replied")];
  server.calls.length = 0;
  problems.length = 0;
  store.resetCampaignStore();
  store.ensureCampaigns();
  await vi.waitFor(() => expect(store.campaignRow("c1")).toBeDefined());
  store.ensureBoard("c1");
  await vi.waitFor(() => expect(store.pipelineNow("c1")).toHaveLength(3));
});

describe("the statuses a menu offers", () => {
  it("has Replied between In outreach and Interviewing, in one list every menu reads", () => {
    expect(campaign.STATUSES.map((s) => s.label)).toEqual([
      "Not contacted", "In outreach", "Replied", "Interviewing", "Hired", "Passed",
    ]);
  });

  it("offers the board's own menus the same, with Pass left to its own row", () => {
    expect(campaign.BOARD_STATUSES.map((s) => s.label)).toEqual(["Shortlisted", "In outreach", "Replied", "Interviewing", "Hired"]);
    expect(campaign.BOARD_STATUSES.map((s) => s.id)).toEqual(campaign.STATUSES.map((s) => s.id).filter((id) => id !== "passed" ));
  });

  it("reads outreach at its replied step as Replied, and every other person as their stage", () => {
    expect(campaign.statusIdOf({ stage: "outreach", step: "replied" })).toBe("replied");
    expect(campaign.statusIdOf({ stage: "outreach", step: "waiting" })).toBe("outreach");
    expect(campaign.statusIdOf({ stage: "interviewing", step: "offer" })).toBe("interviewing");
  });

  it("asks the server for outreach at the replied step, and says waiting when putting someone back", () => {
    expect(campaign.moveTarget("replied")).toEqual({ stage: "outreach", step: "replied" });
    expect(campaign.moveTarget("outreach")).toEqual({ stage: "outreach", step: "waiting" });
    expect(campaign.moveTarget("hired")).toEqual({ stage: "hired" });
  });

  it("moves someone who has replied back to In outreach, and does nothing when nothing would change", () => {
    expect(campaign.wouldMove({ stage: "outreach", step: "replied" }, "outreach")).toBe(true);
    expect(campaign.wouldMove({ stage: "outreach", step: "waiting" }, "replied")).toBe(true);
    expect(campaign.wouldMove({ stage: "outreach", step: "replied" }, "replied")).toBe(false);
    expect(campaign.wouldMove({ stage: "outreach", step: "waiting" }, "outreach")).toBe(false);
    expect(campaign.wouldMove({ stage: "shortlisted", step: null }, "replied")).toBe(true);
  });
});

describe("putting someone at Replied", () => {
  it("sends outreach with the replied step, shows them at Replied at once, and keeps the stage counts", async () => {
    const before = store.campaignRow("c1")?.funnel;
    store.movePerson("c1", "b", "replied");
    const now = store.pipelineNow("c1").find((p) => p.id === "b");
    expect(now).toMatchObject({ stage: "outreach", step: "replied" });
    // Waiting and Replied are both In outreach: the headcounts do not move.
    expect(store.campaignRow("c1")?.funnel).toEqual(before);
    await vi.waitFor(() => expect(server.calls.some((c) => c.route.startsWith("PATCH"))).toBe(true));
    const patch = server.calls.find((c) => c.route.startsWith("PATCH"));
    expect(patch?.route).toBe("PATCH /v1/campaigns/c1/candidates/b");
    expect(patch?.body).toEqual({ stage: "outreach", step: "replied" });
    expect(problems).toEqual([]);
  });

  it("brings someone from the shortlist straight to Replied, and counts them in In outreach", async () => {
    const before = store.campaignRow("c1")?.funnel;
    store.movePerson("c1", "a", "replied");
    expect(store.pipelineNow("c1").find((p) => p.id === "a")).toMatchObject({ stage: "outreach", step: "replied" });
    expect(store.campaignRow("c1")?.funnel.shortlisted).toBe((before?.shortlisted ?? 0) - 1);
    expect(store.campaignRow("c1")?.funnel.contacted).toBe((before?.contacted ?? 0) + 1);
    await vi.waitFor(() => expect(server.calls.some((c) => c.route.startsWith("PATCH"))).toBe(true));
    expect(server.calls.find((c) => c.route.startsWith("PATCH"))?.body).toEqual({ stage: "outreach", step: "replied" });
  });

  it("puts someone who has replied back to In outreach, saying waiting so the server does not call it unchanged", async () => {
    store.movePerson("c1", "c", "outreach");
    expect(store.pipelineNow("c1").find((p) => p.id === "c")).toMatchObject({ stage: "outreach", step: "waiting" });
    await vi.waitFor(() => expect(server.calls.some((c) => c.route.startsWith("PATCH"))).toBe(true));
    expect(server.calls.find((c) => c.route.startsWith("PATCH"))?.body).toEqual({ stage: "outreach", step: "waiting" });
  });

  it("sends nothing when they are already there", async () => {
    store.movePerson("c1", "c", "replied");
    await new Promise((r) => setTimeout(r, 10));
    expect(server.calls.filter((c) => c.route.startsWith("PATCH"))).toEqual([]);
  });

  it("moves several at once with the step", async () => {
    store.movePeople("c1", ["a", "b"], "replied");
    await vi.waitFor(() => expect(server.calls.some((c) => c.route.endsWith("/bulk-move"))).toBe(true));
    expect(server.calls.find((c) => c.route.endsWith("/bulk-move"))?.body).toMatchObject({
      campaignCandidateIds: ["a", "b"], stage: "outreach", step: "replied",
    });
  });
});

describe("where else a status is written", () => {
  it("keeps the stage's clock running when only the step changes, and resets it for a new stage", () => {
    const rows = [row("x", "outreach", "waiting"), row("y", "shortlisted", null)];
    const same = movedOnBoard(rows, "x", "outreach", "replied")[0];
    expect(same).toMatchObject({ stage: "outreach", step: "replied", daysInStage: 3, replied: true });
    const arrived = movedOnBoard(rows, "y", "outreach", "replied")[0];
    expect(arrived).toMatchObject({ stage: "outreach", step: "replied", daysInStage: 0 });
  });

  it("does not move a headcount when the stage is the same", () => {
    const c = camp("c1");
    expect(shiftFunnel(c, "outreach", "outreach")).toBe(c);
  });

  it("reads Replied in a person's control on the Candidates page", () => {
    const stages = stagesFrom(
      [{ id: "p", campaigns: [{ id: "c1", name: "Backend", stage: "outreach", step: "replied" }] }],
      {},
    );
    expect(controlState(["c1"], stages.p ?? {})).toEqual({ label: "Replied", shortlisted: [], active: true });
  });

  it("writes Replied in the Stage column of an export, and keeps In outreach for someone still waiting", () => {
    const t = shortlistTable(
      [
        { id: "1", candidateId: "a", stage: "outreach", step: "replied" },
        { id: "2", candidateId: "b", stage: "outreach", step: "waiting" },
        { id: "3", candidateId: "c", stage: "interviewing", step: "loop" },
      ],
      ["stage", "step"],
    );
    expect(t.rows.map((r) => r[0])).toEqual(["Replied", "In outreach", "Interviewing"]);
    expect(t.rows.map((r) => r[1])).toEqual(["Replied", "Waiting for a reply", "In interviews"]);
    expect(typeof responseTable).toBe("function");
  });
});

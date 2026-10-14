import { describe, expect, it, vi } from "vitest";
import type { ApiCampaign } from "../api/campaigns";

/**
 * A recruiter reads the clients of the campaigns they can see, with the industry, owner and contact the API
 * sends (the fee, notes and activity are left out for them). The console used to skip the call for a recruiter
 * and draw each client from its campaign's name alone: "Not set", "Unassigned", "No contact yet".
 */

const { server } = vi.hoisted(() => ({ server: { calls: [] as string[] } }));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    onWrite: () => () => {},
    setTabWorkspace: () => {},
    api: async (method: string, path: string) => {
      await Promise.resolve();
      const route = `${method} ${path.split("?")[0]}`;
      server.calls.push(route);
      if (route === "GET /v1/campaigns") return { campaigns: [campaign] };
      if (route === "GET /v1/members") return { members: [] };
      if (route === "GET /v1/clients") return { clients: [clientRow] };
      throw new Error(`unexpected ${route}`);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: () => {} }));

const iso = new Date().toISOString();
const campaign = {
  id: "c1", name: "Backend", status: "active", department: null, location: null, priority: "normal", visibility: "team",
  client: { id: "cl1", name: "Northwind" }, owner: { id: "u9", name: "Asha Rao" }, team: [{ id: "u9", name: "Asha Rao", role: "owner" }],
  funnel: { shortlisted: 0, outreach: 0, interviewing: 0, hired: 0, passed: 0 }, hired: 0, target: 1, agents: 0,
  openedAt: iso, closedAt: null, createdAt: iso, updatedAt: iso,
} as unknown as ApiCampaign;
const clientRow = {
  id: "cl1", name: "Northwind", website: null, domain: null, industry: "Fintech", location: "Pune", status: "active",
  ownerId: "u9", ownerName: "Asha Rao", fee: null, notes: null, createdAt: iso,
  primaryContact: { name: "Mira Das", title: "VP People", email: "mira@northwind.example", phone: null },
  contacts: [{ id: "ct1", name: "Mira Das", title: "VP People", email: "mira@northwind.example", primary: true }],
  campaigns: 1, open: 1, target: 1, hires: 0, inProcess: 0, lastActivityAt: iso,
};

const roles = await import("../roleStore");
roles.setSession({ role: "recruiter" } as never);
const store = await import("../campaignStore");

describe("a recruiter's clients", () => {
  it("are read from the API, with the industry, owner and contact it sends", async () => {
    store.ensureClients();
    await vi.waitFor(() => expect(store.clientById("cl1")?.industry).toBe("Fintech"));
    const c = store.clientById("cl1");
    expect(server.calls).toContain("GET /v1/clients");
    expect(c).toMatchObject({ name: "Northwind", industry: "Fintech", owner: "Asha Rao" });
    expect(c?.contacts?.[0]).toMatchObject({ name: "Mira Das", email: "mira@northwind.example" });
    // And the agency's own terms stay out of it.
    expect(c?.fee ?? "").toBe("");
    expect(c?.notes ?? "").toBe("");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pages that open together ask for the same lists (connections three times, campaigns twice, clients twice). An
 * identical GET asked for while one is on its way shares it; the widely-shared reads are reused for a moment; a
 * write, a workspace change or a stale view forgets them; an error is never kept.
 */

vi.mock("../supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
vi.stubEnv("VITE_API_URL", "http://api.test");
vi.stubEnv("VITE_DEV_API_TOKEN", "dev-token");

let client: typeof import("../api/client");
let seen: string[];
let answer: (path: string) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  vi.resetModules();
  seen = [];
  answer = (path) => json({ path });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = url.replace("http://api.test", "");
    seen.push(`${init?.method ?? "GET"} ${path}`);
    await new Promise((r) => setTimeout(r, 5));
    return answer(path);
  });
  client = await import("../api/client");
  client.setTabWorkspace(null);
});
afterEach(() => { vi.unstubAllGlobals(); });

/** What each page asks for as it opens: [path, how many components ask]. */
const OPENING: Record<string, ReadonlyArray<readonly [string, number]>> = {
  Home: [["/v1/campaigns", 2], ["/v1/connections", 3], ["/v1/clients", 1], ["/v1/members", 1], ["/v1/tasks", 1], ["/v1/contacts/allowance", 1]],
  Agent: [["/v1/connections", 3], ["/v1/campaigns", 2], ["/v1/contacts/allowance", 2], ["/v1/clients", 1]],
  Campaigns: [["/v1/campaigns", 3], ["/v1/clients", 2], ["/v1/members", 2], ["/v1/connections", 1]],
};

describe("opening a page", () => {
  for (const [page, asks] of Object.entries(OPENING)) {
    it(`${page}: one request per list, however many components ask`, async () => {
      const before = asks.reduce((n, [, times]) => n + times, 0);
      await Promise.all(asks.flatMap(([path, times]) => Array.from({ length: times }, () => client.api("GET", path))));
      expect(seen.length).toBe(asks.length);
      expect(seen.length).toBeLessThan(before);
      console.info(`${page}: ${before} requests before, ${seen.length} after`);
    });
  }

  it("opening Home then Agent straight after asks for each shared list once in all", async () => {
    await Promise.all(OPENING.Home!.flatMap(([p, n]) => Array.from({ length: n }, () => client.api("GET", p))));
    await Promise.all(OPENING.Agent!.flatMap(([p, n]) => Array.from({ length: n }, () => client.api("GET", p))));
    expect(seen.filter((s) => s.endsWith("/v1/connections"))).toHaveLength(1);
    expect(seen.filter((s) => s.endsWith("/v1/campaigns"))).toHaveLength(1);
  });
});

describe("what is shared and what is not", () => {
  it("shares an unlisted read only while it is on its way, never after", async () => {
    await Promise.all([client.api("GET", "/v1/tasks"), client.api("GET", "/v1/tasks")]);
    await client.api("GET", "/v1/tasks");
    expect(seen).toEqual(["GET /v1/tasks", "GET /v1/tasks"]);
  });

  it("reuses a shared read for a moment, then asks again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await client.api("GET", "/v1/clients");
    vi.setSystemTime(Date.now() + client.READ_CACHE_MS - 100);
    await client.api("GET", "/v1/clients");
    expect(seen).toHaveLength(1);
    vi.setSystemTime(Date.now() + 200);
    await client.api("GET", "/v1/clients");
    expect(seen).toHaveLength(2);
    vi.useRealTimers();
  });

  it("keeps lists with different queries apart, and each workspace apart", async () => {
    await client.api("GET", "/v1/campaigns?status=open");
    await client.api("GET", "/v1/campaigns?status=closed");
    client.setTabWorkspace("org-1");
    await client.api("GET", "/v1/campaigns?status=open");
    expect(seen).toHaveLength(3);
  });

  it("forgets everything on a write, on a workspace change and when views are said to be stale", async () => {
    await client.api("GET", "/v1/members");
    await client.api("POST", "/v1/members/invite", { email: "a@b.in" });
    await client.api("GET", "/v1/members");
    expect(seen.filter((s) => s === "GET /v1/members")).toHaveLength(2);
    client.setTabWorkspace("org-2");
    await client.api("GET", "/v1/members");
    expect(seen.filter((s) => s === "GET /v1/members")).toHaveLength(3);
    client.dropReadCache();
    await client.api("GET", "/v1/members");
    expect(seen.filter((s) => s === "GET /v1/members")).toHaveLength(4);
  });

  it("does not let a read that left before a write be kept or shared afterwards", async () => {
    const early = client.api("GET", "/v1/clients");
    await client.api("POST", "/v1/clients", { name: "Acme" });
    const late = await client.api("GET", "/v1/clients");
    await early;
    expect(late).toEqual({ path: "/v1/clients" });
    expect(seen.filter((s) => s === "GET /v1/clients")).toHaveLength(2);
    await client.api("GET", "/v1/clients");
    expect(seen.filter((s) => s === "GET /v1/clients")).toHaveLength(2);
  });

  it("never keeps an error, and every waiter hears it", async () => {
    answer = () => json({ error: { code: "unavailable", message: "Down." } }, 503);
    const both = await Promise.allSettled([client.api("GET", "/v1/connections"), client.api("GET", "/v1/connections")]);
    expect(both.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(seen).toHaveLength(1);
    answer = () => json({ ok: true });
    await expect(client.api("GET", "/v1/connections")).resolves.toEqual({ ok: true });
    expect(seen).toHaveLength(2);
  });

  it("gives each caller its own copy, so one changing its list does not change another's", async () => {
    answer = () => json({ items: [1, 2] });
    const [a, b] = await Promise.all([client.api<{ items: number[] }>("GET", "/v1/clients"), client.api<{ items: number[] }>("GET", "/v1/clients")]);
    a.items.push(3);
    expect(b.items).toEqual([1, 2]);
    expect((await client.api<{ items: number[] }>("GET", "/v1/clients")).items).toEqual([1, 2]);
  });

  it("leaves a call with its own signal or limit, and every write, alone", async () => {
    await client.api("GET", "/v1/clients", undefined, { signal: new AbortController().signal });
    await client.api("GET", "/v1/clients", undefined, { timeoutMs: 5_000 });
    await Promise.all([client.api("POST", "/v1/x", {}), client.api("POST", "/v1/x", {})]);
    expect(seen).toHaveLength(4);
  });
});

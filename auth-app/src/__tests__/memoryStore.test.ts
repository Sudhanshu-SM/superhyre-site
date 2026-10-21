import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryItem } from "../api/memory";

/**
 * The memory store with the API connected: the list the filters ask for, paging, the review queue,
 * and a confirm, a correction or a "forget" that shows at once, is replaced by the server's answer,
 * and is put back (with a line saying why) when refused. The API is a small stand-in whose answers
 * can be held back to look at the screen in between.
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    /** When set, answers wait for this to be called, so the state in between can be read. */
    hold: null as null | Promise<void>,
    fail: null as null | { match: RegExp; status: number; message: string },
    calls: [] as string[],
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
      server.calls.push(`${method} ${path}`);
      if (server.hold && method !== "GET") await server.hold;
      await Promise.resolve();
      if (server.fail && server.fail.match.test(`${method} ${path}`)) {
        const f = server.fail;
        server.fail = null;
        throw new ApiError(f.status, "error", f.message);
      }
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../memoryStore");
const identity = await import("../api/identity");

let n = 0;
const note = (over: Partial<MemoryItem> = {}): MemoryItem => ({
  id: `m${++n}`, text: `A note about the agency number ${n}`, kind: "fact", scope: "client", level: "client",
  clientId: "cl1", clientName: "Acme Robotics", campaignId: null, campaignName: null, personLabel: null,
  about: [], at: "2026-10-08T10:00:00.000Z", type: "facts", episode: null, basis: null, lastUsedAt: null, expiresAt: null, doubted: null, turnedDown: 0,
  status: "active", trust: "agent", source: "distil", quote: null, confidence: 0.8,
  createdAt: "2026-10-08T10:00:00.000Z", updatedAt: `2026-10-08T10:${String(10 + n).padStart(2, "0")}:00.000Z`, supersededBy: null, usedCount: 0, ...over,
});
const waiting = (over: Partial<MemoryItem> = {}) =>
  note({ scope: "org", level: "org", clientId: null, clientName: null, status: "pending", quote: "Always say salary range first", ...over });

let active: MemoryItem[];
let pending: MemoryItem[];
let doubted: MemoryItem[];
let pages: Record<string, { items: MemoryItem[]; nextCursor: string | null }>;

const url = (path: string) => new URL(`http://x${path}`);
const lastList = () => url(server.calls.filter((c) => c.startsWith("GET /v1/memory?") || c === "GET /v1/memory").map((c) => c.slice(4)).at(-1) ?? "");

beforeEach(() => {
  server.handle = base;
  n = 0;
  active = [note({ id: "a1" }), note({ id: "a2" }), note({ id: "a3" })];
  pending = [waiting({ id: "p1" }), waiting({ id: "p2" })];
  doubted = [note({ id: "d1", doubted: "2026-10-12T09:00:00.000Z" }), note({ id: "d2", doubted: "2026-10-12T09:05:00.000Z" })];
  pages = {};
  server.hold = null;
  server.fail = null;
  server.calls = [];
  problems.length = 0;
  store.resetMemory();
});

function base(method: string, path: string, body: unknown): unknown {
  const u = url(path);
  if (method === "GET" && u.pathname === "/v1/memory") {
    const status = u.searchParams.get("status") ?? "active";
    const cursor = u.searchParams.get("cursor");
    if (cursor && pages[cursor]) return pages[cursor];
    if (status === "pending") return { items: pending, nextCursor: null };
    // Doubted notes are active ones; the main list is asked for with the rest, and the page keeps them out of it.
    if (status === "doubted") return { items: doubted, nextCursor: null };
    const q = (u.searchParams.get("q") ?? "").toLowerCase();
    const scope = u.searchParams.get("scope") ?? "all";
    const items = [...active, ...(status === "all" ? [...pending, note({ id: "old1", status: "superseded", supersededBy: "a1" })] : [])]
      .filter((i) => scope === "all" || i.scope === scope)
      .filter((i) => i.text.toLowerCase().includes(q));
    return { items, nextCursor: pages.first ? "first" : null };
  }
  if (method === "GET" && u.pathname === "/v1/memory/stats") {
    return { active: active.length, pending: pending.length, byScope: { org: 0, client: active.length, campaign: 0, person: 0 } };
  }
  const m = /^\/v1\/memory\/([^/]+)(?:\/(confirm|forget))?$/.exec(u.pathname);
  if (m) {
    const id = m[1];
    if (method === "POST" && m[2] === "confirm") return { ...(pending.find((p) => p.id === id) ?? doubted.find((d) => d.id === id)), status: "active", doubted: null };
    if (method === "POST" && m[2] === "forget") return { id, status: "forgotten" };
    if (method === "PATCH") {
      const old = active.find((a) => a.id === id);
      return { ...old, id: "new-1", text: (body as { text: string }).text, quote: null, source: "recruiter", trust: "user" };
    }
  }
  return undefined;
}

const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe("loading", () => {
  it("asks for the active notes, the waiting ones and the counts, and keeps waiting notes out of the list", async () => {
    await store.openMemory();
    const s = store.memoryNow();
    expect(s).toMatchObject({ list: "ready", queue: "ready", statsPhase: "ready", unavailable: false });
    expect(s.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(s.pending.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(s.stats).toEqual({
      active: 3, pending: 2, byScope: { org: 0, client: 3, campaign: 0, person: 0 },
      mine: 0, byType: { facts: 0, happened: 0, ways: 0 },
    });
    expect(server.calls).toContain("GET /v1/memory?limit=50");
    expect(server.calls).toContain("GET /v1/memory?status=pending&limit=100");
  });

  it("says it couldn't load, and tries again when asked", async () => {
    server.fail = { match: /^GET \/v1\/memory\?limit=50/, status: 500, message: "Something went wrong on our side." };
    await store.openMemory();
    expect(store.memoryNow()).toMatchObject({ list: "failed", items: [], queue: "ready" });
    await store.retryMemory();
    expect(store.memoryNow()).toMatchObject({ list: "ready" });
    expect(store.memoryNow().items).toHaveLength(3);
  });

  it("reads a server without the routes as couldn't load, and tells the rail to leave its row out", async () => {
    server.fail = { match: /GET \/v1\/memory/, status: 404, message: "Not found." };
    await store.ensureMemoryStats(true);
    expect(store.memoryNow()).toMatchObject({ statsPhase: "failed", unavailable: true });
  });

  it("shares one counts request and doesn't ask again straight away", async () => {
    server.handle = (_m, p) => (p === "/v1/memory/stats" ? { active: 5, pending: 1, byScope: { org: 1, client: 1, campaign: 2, person: 1 } } : undefined);
    await Promise.all([store.ensureMemoryStats(), store.ensureMemoryStats()]);
    await store.ensureMemoryStats();
    expect(server.calls.filter((c) => c.includes("/stats"))).toHaveLength(1);
    expect(store.memoryNow().stats?.active).toBe(5);
    await store.reloadMemoryStats();
    expect(server.calls.filter((c) => c.includes("/stats"))).toHaveLength(2);
  });

  it("keeps the counts it had when a refresh fails", async () => {
    await store.ensureMemoryStats();
    server.fail = { match: /stats/, status: 500, message: "x" };
    await store.reloadMemoryStats();
    expect(store.memoryNow()).toMatchObject({ statsPhase: "ready", stats: { active: 3 } });
  });

  it("forgets everything when the workspace changes", async () => {
    await store.openMemory();
    identity.workspaceChanged();
    expect(store.memoryNow()).toMatchObject({ list: "idle", items: [], pending: [], stats: null });
  });
});

describe("the filters", () => {
  it("asks again with the words, the scope and the history switch", async () => {
    await store.openMemory();
    await store.setMemoryFilters({ q: "agency" });
    expect(lastList().searchParams.get("q")).toBe("agency");
    // "This client" is the one client chosen, at any level: the first one a note was seen for, to start.
    await store.setMemoryFilters({ scope: "client" });
    expect(store.memoryNow().filters).toMatchObject({ scope: "client", clientId: "cl1" });
    expect(lastList().searchParams.get("clientId")).toBe("cl1");
    expect(lastList().searchParams.get("scope")).toBeNull();
    expect(lastList().searchParams.get("q")).toBe("agency");
    await store.setMemoryFilters({ scope: "org" });
    expect(lastList().searchParams.get("scope")).toBe("org");
    expect(lastList().searchParams.get("clientId")).toBeNull();
    await store.setMemoryFilters({ scope: "mine" });
    expect(lastList().searchParams.get("scope")).toBe("mine");
    await store.setMemoryFilters({ scope: "all" });
    await store.setMemoryFilters({ history: true });
    expect(lastList().searchParams.get("status")).toBe("all");
    expect(store.memoryNow().items.some((i) => i.status === "superseded")).toBe(true);
    expect(store.memoryNow().items.some((i) => i.status === "pending")).toBe(false);
  });

  it("doesn't ask again for the same filters", async () => {
    await store.openMemory();
    const before = server.calls.length;
    await store.setMemoryFilters({ q: "", scope: "all" });
    expect(server.calls.length).toBe(before);
  });

  it("keeps the old list on screen while a new search loads", async () => {
    await store.openMemory();
    const p = store.setMemoryFilters({ q: "number 1" });
    expect(store.memoryNow()).toMatchObject({ list: "loading" });
    expect(store.memoryNow().items).toHaveLength(3);
    await p;
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1"]);
  });

  it("ignores an answer to a search that has been typed over", async () => {
    await store.openMemory();
    const slow = store.setMemoryFilters({ q: "number 1" });
    const fast = store.setMemoryFilters({ q: "number 2" });
    await Promise.all([slow, fast]);
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a2"]);
  });
});

describe("paging", () => {
  it("shows more from the cursor, without repeating a note", async () => {
    // The first page says there is more; the cursor's page has one new note and one already shown.
    pages.page2 = { items: [note({ id: "a3" }), note({ id: "a9" })], nextCursor: null };
    server.handle = ((inner) => (m: string, p: string, b: unknown) => {
      const u = url(p);
      if (m === "GET" && u.pathname === "/v1/memory" && !u.searchParams.get("cursor") && !u.searchParams.get("status")) return { items: active, nextCursor: "page2" };
      return inner(m, p, b);
    })(server.handle);
    await store.openMemory();
    expect(store.memoryNow().next).toBe("page2");
    await store.loadMoreMemory();
    expect(lastList().searchParams.get("cursor")).toBe("page2");
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a2", "a3", "a9"]);
    expect(store.memoryNow()).toMatchObject({ next: null, more: "idle" });
  });

  it("keeps what is shown when the next page fails, and can try again", async () => {
    const inner = server.handle;
    server.handle = (m, p, b) => {
      const u = url(p);
      if (m === "GET" && u.pathname === "/v1/memory" && !u.searchParams.get("status")) {
        return u.searchParams.get("cursor") ? { items: [note({ id: "a7" })], nextCursor: null } : { items: active, nextCursor: "c2" };
      }
      return inner(m, p, b);
    };
    await store.openMemory();
    server.fail = { match: /cursor=c2/, status: 500, message: "x" };
    await store.loadMoreMemory();
    expect(store.memoryNow()).toMatchObject({ more: "failed", next: "c2" });
    expect(store.memoryNow().items).toHaveLength(3);
    await store.loadMoreMemory();
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a2", "a3", "a7"]);
  });
});

describe("confirming a waiting note", () => {
  it("moves it from the queue to the list at once, then takes the server's answer", async () => {
    await store.openMemory();
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const done = store.confirmMemory("p1");
    expect(store.memoryNow().pending.map((i) => i.id)).toEqual(["p2"]);
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["p1", "a1", "a2", "a3"]);
    expect(store.memoryNow().items.find((i) => i.id === "p1")?.status).toBe("active");
    expect(store.memoryNow().working).toEqual(["p1"]);
    expect(store.memoryNow().stats).toMatchObject({ active: 4, pending: 1, byScope: { org: 1 } });
    release();
    expect(await done).toEqual({ ok: true });
    expect(store.memoryNow().working).toEqual([]);
    expect(problems).toEqual([]);
    expect(server.calls).toContain("POST /v1/memory/p1/confirm");
  });

  it("puts it back where it was, and says why, when refused", async () => {
    await store.openMemory();
    server.fail = { match: /confirm/, status: 403, message: "Only an owner or admin can confirm this." };
    const r = await store.confirmMemory("p1");
    expect(r).toEqual({ ok: false, message: "Only an owner or admin can confirm this." });
    expect(store.memoryNow().pending.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(store.memoryNow().stats).toMatchObject({ active: 3, pending: 2, byScope: { org: 0 } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("wasn't confirmed");
    expect(problems[0]).toContain("Only an owner or admin can confirm this.");
  });

  it("looks again when the note was replaced meanwhile (409)", async () => {
    await store.openMemory();
    server.fail = { match: /confirm/, status: 409, message: "That note was replaced." };
    const before = server.calls.length;
    await store.confirmMemory("p2");
    await settle();
    await settle();
    expect(server.calls.slice(before).filter((c) => c.startsWith("GET /v1/memory"))).not.toHaveLength(0);
    expect(problems[0]).toContain("That note was replaced.");
  });

  it("ignores a note that isn't waiting", async () => {
    await store.openMemory();
    expect((await store.confirmMemory("a1")).ok).toBe(false);
    expect(server.calls.some((c) => c.includes("/a1/confirm"))).toBe(false);
  });

  it("doesn't put a confirmed note in a list it doesn't belong in", async () => {
    await store.openMemory();
    await store.setMemoryFilters({ scope: "client" });
    await store.confirmMemory("p1");
    expect(store.memoryNow().items.map((i) => i.id)).not.toContain("p1");
    expect(store.memoryNow().pending.map((i) => i.id)).toEqual(["p2"]);
  });
});

describe("forgetting", () => {
  it("takes a note off the screen at once and out of the counts", async () => {
    await store.openMemory();
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const done = store.forgetMemory("a2");
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a3"]);
    expect(store.memoryNow().stats).toMatchObject({ active: 2, byScope: { client: 2 } });
    release();
    expect(await done).toEqual({ ok: true });
    expect(server.calls).toContain("POST /v1/memory/a2/forget");
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a3"]);
  });

  it("forgets a waiting note from the queue", async () => {
    await store.openMemory();
    await store.forgetMemory("p1");
    expect(store.memoryNow().pending.map((i) => i.id)).toEqual(["p2"]);
    expect(store.memoryNow().stats).toMatchObject({ active: 3, pending: 1 });
  });

  it("puts the note back in its place, with the counts, and says why when refused", async () => {
    await store.openMemory();
    server.fail = { match: /forget/, status: 403, message: "Only an owner or admin can do this." };
    expect((await store.forgetMemory("a2")).ok).toBe(false);
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(store.memoryNow().stats).toMatchObject({ active: 3, byScope: { client: 3 } });
    expect(problems[0]).toContain("wasn't forgotten");
    expect(problems[0]).toContain("Only an owner or admin can do this.");
  });

  it("puts back only its own note when two are forgotten together and one is refused", async () => {
    await store.openMemory();
    server.fail = { match: /a1\/forget/, status: 500, message: "x" };
    await Promise.all([store.forgetMemory("a1"), store.forgetMemory("a3")]);
    expect(store.memoryNow().items.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(store.memoryNow().stats?.active).toBe(2);
  });
});

describe("correcting", () => {
  it("shows the new words at once and the server's new note once it answers", async () => {
    await store.openMemory();
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const done = store.correctMemory("a2", "  Acme wants a budget under 45 lakh  ");
    expect(store.memoryNow().items.find((i) => i.id === "a2")?.text).toBe("Acme wants a budget under 45 lakh");
    expect(store.memoryNow().working).toEqual(["a2"]);
    release();
    expect(await done).toEqual({ ok: true });
    const ids = store.memoryNow().items.map((i) => i.id);
    expect(ids).toEqual(["a1", "new-1", "a3"]);
    expect(store.memoryNow().items[1]).toMatchObject({ source: "recruiter", trust: "user", quote: null });
    expect(server.calls).toContain("PATCH /v1/memory/a2");
  });

  it("keeps the old wording as replaced history when history is on", async () => {
    await store.openMemory();
    await store.setMemoryFilters({ history: true });
    const before = store.memoryNow().items.map((i) => i.id);
    expect(before.slice(0, 3)).toEqual(["a1", "a2", "a3"]);
    await store.correctMemory("a2", "Acme wants a budget under 45 lakh");
    const after = store.memoryNow().items;
    expect(after.map((i) => i.id).slice(0, 4)).toEqual(["a1", "new-1", "a2", "a3"]);
    expect(after[2]).toMatchObject({ status: "superseded", supersededBy: "new-1" });
  });

  it("puts the old words back and says why when the server refuses them", async () => {
    await store.openMemory();
    const was = store.memoryNow().items[1]?.text;
    server.fail = { match: /PATCH/, status: 400, message: "Contact details can't be remembered." };
    const r = await store.correctMemory("a2", "Call Priya on 98765 43210 about it");
    expect(r).toEqual({ ok: false, message: "Contact details can't be remembered." });
    expect(store.memoryNow().items[1]).toMatchObject({ id: "a2", text: was });
    expect(problems[0]).toContain("wasn't saved");
    expect(problems[0]).toContain("Contact details can't be remembered.");
    expect(store.memoryNow().working).toEqual([]);
  });

  it("doesn't change a note while another change to it is on its way", async () => {
    await store.openMemory();
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const first = store.correctMemory("a1", "First new wording of it");
    expect((await store.correctMemory("a1", "Second new wording of it")).ok).toBe(false);
    release();
    await first;
    expect(server.calls.filter((c) => c.startsWith("PATCH"))).toHaveLength(1);
  });
});

describe("notes the agent doubts (the chat's card)", () => {
  it("loads them on their own, as active notes with a doubt, and shows a ghost only until the first answer", async () => {
    expect(store.memoryNow()).toMatchObject({ doubts: "idle", doubted: [] });
    const first = store.refreshDoubts();
    expect(store.memoryNow().doubts).toBe("loading");
    await first;
    const s = store.memoryNow();
    expect(s).toMatchObject({ doubts: "ready" });
    expect(s.doubted.map((i) => i.id)).toEqual(["d1", "d2"]);
    expect(server.calls).toContain("GET /v1/memory?status=doubted&limit=100");
    // Looked at again, the notes stay on screen: no ghost, no blank.
    const again = store.refreshDoubts();
    expect(store.memoryNow()).toMatchObject({ doubts: "ready" });
    expect(store.memoryNow().doubted).toHaveLength(2);
    await again;
  });

  it("leaves the Memory page's own list alone when it was never opened", async () => {
    await store.refreshDoubts();
    const r = await store.confirmMemory("d1");
    expect(r).toEqual({ ok: true });
    expect(store.memoryNow()).toMatchObject({ list: "idle", items: [], stats: null });
  });

  it("confirming one removes it at once, leaves the counts alone, and holds its buttons until the answer", async () => {
    await store.openMemory();
    await store.refreshDoubts();
    const before = store.memoryNow().stats;
    let release: () => void = () => {};
    server.hold = new Promise<void>((r) => (release = r));
    const done = store.confirmMemory("d1");
    await settle();
    const mid = store.memoryNow();
    expect(mid.doubted.map((i) => i.id)).toEqual(["d2"]);
    expect(mid.items[0]).toMatchObject({ id: "d1", status: "active", doubted: null });
    expect(mid.stats).toEqual(before);
    expect(mid.working).toEqual(["d1"]);
    release();
    expect(await done).toEqual({ ok: true });
    expect(store.memoryNow().working).toEqual([]);
  });

  it("forgetting one removes it at once and takes one from the active count", async () => {
    await store.openMemory();
    await store.refreshDoubts();
    const r = await store.forgetMemory("d2");
    expect(r).toEqual({ ok: true });
    const s = store.memoryNow();
    expect(s.doubted.map((i) => i.id)).toEqual(["d1"]);
    expect(s.stats?.active).toBe(2);
    expect(s.forgotten).toContain("d2");
  });

  it("puts a refused confirm back where it was, with the reason", async () => {
    await store.refreshDoubts();
    server.fail = { match: /POST \/v1\/memory\/d1\/confirm/, status: 403, message: "Only admins can change what the whole agency remembers." };
    const r = await store.confirmMemory("d1");
    expect(r.ok).toBe(false);
    expect(store.memoryNow().doubted.map((i) => i.id)).toEqual(["d1", "d2"]);
    expect(problems.at(-1)).toContain("wasn't confirmed");
    expect(problems.at(-1)).toContain("Only admins");
  });

  it("puts a refused forget back where it was", async () => {
    await store.openMemory();
    await store.refreshDoubts();
    server.fail = { match: /POST \/v1\/memory\/d2\/forget/, status: 500, message: "Something went wrong on our side." };
    const r = await store.forgetMemory("d2");
    expect(r.ok).toBe(false);
    expect(store.memoryNow().doubted.map((i) => i.id)).toEqual(["d1", "d2"]);
    expect(store.memoryNow().stats?.active).toBe(3);
  });

  it("says so when the first look fails, and keeps what it showed when a later one does", async () => {
    server.fail = { match: /status=doubted/, status: 500, message: "x" };
    await store.refreshDoubts();
    expect(store.memoryNow()).toMatchObject({ doubts: "failed", doubted: [] });
    await store.refreshDoubts();
    expect(store.memoryNow()).toMatchObject({ doubts: "ready" });
    server.fail = { match: /status=doubted/, status: 500, message: "x" };
    await store.refreshDoubts();
    expect(store.memoryNow()).toMatchObject({ doubts: "ready" });
    expect(store.memoryNow().doubted).toHaveLength(2);
  });

  it("is read again with the counts when memory changes elsewhere, but only once a card has asked", async () => {
    await store.reloadMemoryStats();
    expect(server.calls.filter((c) => c.includes("status=doubted"))).toHaveLength(0);
    await store.refreshDoubts();
    await store.reloadMemoryStats();
    await settle();
    expect(server.calls.filter((c) => c.includes("status=doubted"))).toHaveLength(2);
  });

  it("starts over when the workspace changes", async () => {
    await store.refreshDoubts();
    identity.workspaceChanged();
    expect(store.memoryNow()).toMatchObject({ doubts: "idle", doubted: [] });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A draft made in the chat, with the API: made once, and found again after a reload (the chat
   replays itself) instead of made again. Against a fake server. */
const calls: { method: string; path: string }[] = [];
let reply: (method: string, path: string) => unknown = () => ({});

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong."),
    api: async (method: string, path: string) => {
      calls.push({ method, path });
      const r = reply(method, path);
      if (r instanceof Error) throw r;
      return r;
    },
  };
});

const SERVER = "11111111-1111-4111-8111-111111111111";
const view = (id: string) => ({
  id, campaignId: "k1", name: "Android screening", status: "draft", version: 0, title: null, description: null, role: null, theme: "ember",
  questions: [{ id: "s1", type: "short", title: "Hello", required: false }], publicLink: null, hasDraftChanges: true,
  createdAt: "2026-10-04T08:00:00Z", updatedAt: "2026-10-04T08:00:00Z",
});
const KEY = "k1|Create a screening form|{}";

const disk = new Map<string, string>();
const stubWindow = () => vi.stubGlobal("window", {
  setTimeout, clearTimeout,
  localStorage: { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v) },
});

async function freshStore() {
  vi.resetModules();
  stubWindow();
  return import("../formsStore");
}
const make = async () => {
  const kit = await import("../formKit");
  return () => kit.draftForm({ campaignId: "k1", family: "other" });
};
const posts = () => calls.filter((c) => c.method === "POST").length;

beforeEach(() => { disk.clear(); calls.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("a draft made in the chat, with the API", () => {
  it("is created once and remembered by the server's id", async () => {
    reply = (m, p) => (m === "POST" ? view(SERVER) : p.endsWith("/forms") ? { forms: [] } : view(SERVER));
    const store = await freshStore();
    const a = await store.ensureLiveDraft(KEY, await make());
    const b = await store.ensureLiveDraft(KEY, await make());
    expect(posts()).toBe(1);
    expect(b.id).toBe(a.id);
    expect(JSON.parse(disk.get("sh.forms.chat-drafts.v1")!)).toEqual({ [KEY]: SERVER });
  });

  it("is found again after a reload, without making another", async () => {
    reply = (m, p) => (m === "POST" ? view(SERVER) : p.endsWith("/forms") ? { forms: [] } : view(SERVER));
    const first = await freshStore();
    await first.ensureLiveDraft(KEY, await make());
    calls.length = 0;

    const again = await freshStore();
    const f = await again.ensureLiveDraft(KEY, await make());
    expect(posts()).toBe(0);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET /v1/forms/${SERVER}`]);
    expect(f.id).toBe(SERVER);
  });

  it("makes a new one when the remembered form is gone", async () => {
    reply = (m, p) => (m === "POST" ? view(SERVER) : p.endsWith("/forms") ? { forms: [] } : view(SERVER));
    const first = await freshStore();
    await first.ensureLiveDraft(KEY, await make());
    calls.length = 0;

    reply = (m) => (m === "POST" ? view("22222222-2222-4222-8222-222222222222") : new Error("not found"));
    const again = await freshStore();
    await again.ensureLiveDraft(KEY, await make());
    expect(posts()).toBe(1);
    expect(JSON.parse(disk.get("sh.forms.chat-drafts.v1")!)[KEY]).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("keeps the draft here and says so when the server refuses it", async () => {
    reply = (m) => (m === "POST" ? new Error("The server said no.") : {});
    const store = await freshStore();
    const f = await store.ensureLiveDraft(KEY, await make());
    expect(store.getForm(f.id)).not.toBeNull();
    expect(store.getFormMeta(f.id)).toMatchObject({ save: "error", error: "The server said no." });
    expect(disk.get("sh.forms.chat-drafts.v1")).toBeUndefined();
  });

  it("names a new draft so no form already on the campaign has its name", async () => {
    reply = (m, p) => {
      if (m === "POST") return view(SERVER);
      if (p.endsWith("/forms")) return { forms: [{ id: "99999999-9999-4999-8999-999999999999", status: "live", responses: 0, newApplicants: 0, publicLink: null }] };
      return { ...view("99999999-9999-4999-8999-999999999999"), name: "New role screening", status: "live" };
    };
    const store = await freshStore();
    await store.loadForms("k1");
    const f = await store.ensureLiveDraft(KEY, await make());
    expect(f.name).toBe("New role screening, second draft");
  });
});

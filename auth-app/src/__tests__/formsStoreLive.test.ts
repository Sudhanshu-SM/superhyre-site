import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/* The store's API half, against a fake server: what it sends, and how it
   puts things back when the server says no. */
const calls: { method: string; path: string; body: unknown }[] = [];
let reply: (method: string, path: string, body: unknown) => unknown = () => ({});

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong."),
    api: async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      const r = reply(method, path, body);
      if (r instanceof Error) throw r;
      return r;
    },
  };
});

const view = (questions: { id: string; type: string; title: string; required: boolean }[]) => ({
  id: "f1", campaignId: "k1", name: "Screening", status: "draft", version: 0, title: null, description: null, role: null,
  theme: "ember", questions, publicLink: null, hasDraftChanges: true, createdAt: "2026-10-04T08:00:00Z", updatedAt: "2026-10-04T08:00:00Z",
});

type Store = typeof import("../formsStore");
let store: Store;

beforeAll(async () => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  store = await import("../formsStore");
});
afterEach(() => { calls.length = 0; });

describe("formsStore with the API", () => {
  it("creates, saves the working copy with server ids, then publishes after the save", async () => {
    reply = (m) => (m === "POST" ? view([{ id: "s1", type: "short", title: "", required: false }]) : {});
    const made = await store.createForm({
      id: "local", campaign: "k1", name: "Screening", status: "draft", sent: 0, accent: "", questions: [{ id: "q1", type: "short", title: "", required: false }],
    });
    expect(made.id).toBe("f1");

    reply = (m, p) => {
      if (m === "PATCH") return view([{ id: "s1", type: "short", title: "Why us?", required: false }, { id: "s2", type: "yesno", title: "Remote?", required: true }]);
      if (p.endsWith("/publish")) return { id: "f1", status: "live", version: 1, publicLink: "http://x/#/apply/k" };
      return {};
    };
    store.updateForm("f1", (f) => ({ ...f, questions: [{ ...f.questions[0]!, title: "Why us?" }, { id: "q-new", type: "yesno", title: "Remote?", required: true }] }));
    expect(store.getFormMeta("f1").save).toBe("saving");
    await store.publishForm("f1");

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/campaigns/k1/forms", "PATCH /v1/forms/f1", "POST /v1/forms/f1/publish"]);
    const sent = calls[1]?.body as { questions: { id: string }[] };
    expect(sent.questions.map((q) => q.id)).toEqual(["s1", "q-new"]);
    expect(store.getFormMeta("f1")).toMatchObject({ status: "live", publicLink: "http://x/#/apply/k", save: "saved" });
    expect(store.getForm("f1")?.status).toBe("live");

    reply = (m) => (m === "PATCH" ? view([{ id: "s1", type: "short", title: "Why us?", required: false }, { id: "s2", type: "yesno", title: "Remote?", required: true }]) : {});
    store.updateForm("f1", (f) => ({ ...f, name: "Screening v2" }));
    await store.saveNow("f1");
    expect((calls.at(-1)?.body as { questions: { id: string }[] }).questions.map((q) => q.id)).toEqual(["s1", "s2"]);
  });

  it("publishes an unchanged form again without a save, and the version needn't move", async () => {
    reply = (_m, p) => (p.endsWith("/publish") ? { id: "f1", status: "live", version: 1, publicLink: "http://x/#/apply/k" } : {});
    await store.publishForm("f1");
    await store.publishForm("f1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/forms/f1/publish", "POST /v1/forms/f1/publish"]);
    expect(store.getFormMeta("f1")).toMatchObject({ status: "live", publicLink: "http://x/#/apply/k", hasDraftChanges: false, save: "saved" });
  });

  it("shows a decision at once and puts it back when the server refuses", async () => {
    reply = (m, p) => (p.includes("/responses") && m === "GET" ? {
      responses: [{
        id: "r1", submittedAt: "2026-10-04T11:00:00Z", durationS: 60, name: "Priya", email: "p@x.in", linkedinUrl: null, answers: {},
        mustHave: {}, flagged: false, match: "created", decision: null, isNew: true, candidate: null,
      }],
      nextCursor: null,
    } : {});
    await store.loadResponses("f1");
    expect(store.getFormMeta("f1").newApplicants).toBe(1);

    const { ApiError } = await import("../api/client");
    reply = () => new ApiError(409, "conflict", "They're already in this campaign. Move them in the pipeline instead.");
    const pending = store.decideResponse("f1", "r1", "pass");
    expect(store.getFormMeta("f1").newApplicants).toBe(0);
    expect(await pending).toBe("They're already in this campaign. Move them in the pipeline instead.");
    expect(store.getFormMeta("f1").newApplicants).toBe(1);
  });
  it("forgets what it read for the last workspace's campaigns when the workspace changes", async () => {
    reply = (m, p) => {
      if (m === "GET" && p === "/v1/campaigns/k9/forms") return { forms: [{ id: "f9", responses: 3, newApplicants: 2 }] };
      if (m === "GET" && p === "/v1/forms/f9") return { ...view([]), id: "f9", campaignId: "k9", status: "live" };
      return {};
    };
    await store.loadForms("k9");
    expect(store.getForm("f9")).not.toBeNull();
    expect(store.getFormMeta("f9").responses).toBe(3);

    const { workspaceChangedHere } = await import("../api/identity");
    workspaceChangedHere();
    expect(store.getForm("f9")).toBeNull();
    expect(store.getFormMeta("f9").responses).toBe(0);
    // Asked for again, not served from what the last workspace had.
    calls.length = 0;
    await store.loadForms("k9");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain("GET /v1/campaigns/k9/forms");
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "../api/events";

/**
 * A form the agent publishes, closes or changes from the chat: the card that was drawn earlier says so without
 * a reload. The forms store reads a campaign's forms again when the `forms` view is stale (status, link,
 * questions, counts), and the capability names the agent emits all reach that view. Against a fake server.
 */

const calls: string[] = [];
let reply: (method: string, path: string) => unknown = () => ({});

vi.mock("../api/client", async (orig) => {
  const real = await orig<typeof import("../api/client")>();
  return {
    ...real,
    LIVE: true,
    api: async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      const r = reply(method, path);
      if (r instanceof Error) throw r;
      return r;
    },
  };
});

const SERVER = "11111111-1111-4111-8111-111111111111";
const SECOND = "33333333-3333-4333-8333-333333333333";
const LINK = "https://app.superhyre.test/apply/AbCdEf123456";

type Row = { id: string; campaignId: string; name: string; status: string; publicLink: string | null; title?: string; responses?: number };
let rows: Row[];

const view = (r: Row) => ({
  id: r.id, campaignId: r.campaignId, name: r.name, status: r.status, version: r.status === "draft" ? 0 : 1, title: r.title ?? "Software Engineer",
  description: null, role: null, theme: "ember",
  questions: [{ id: `${r.id}-q1`, type: "yesno", title: "Have you worked hands-on with Go?", required: true, accept: ["Yes"] }],
  publicLink: r.publicLink, shareLink: r.publicLink, hasDraftChanges: false,
  createdAt: "2026-10-04T08:00:00Z", updatedAt: "2026-10-04T08:00:00Z",
});
const server = (m: string, p: string) => {
  if (m !== "GET") return {};
  if (p.endsWith("/forms")) {
    return { forms: rows.map((r) => ({ id: r.id, status: r.status, responses: r.responses ?? 0, newApplicants: 0, publicLink: r.publicLink })) };
  }
  const hit = rows.find((r) => p.endsWith(`/${r.id}`));
  return hit ? view(hit) : new Error("not found");
};

type Store = typeof import("../formsStore");
type Inv = typeof import("../invalidate");
let store: Store;
let inv: Inv;

beforeAll(async () => {
  store = await import("../formsStore");
  inv = await import("../invalidate");
}, 60_000);
beforeEach(() => {
  calls.length = 0;
  rows = [{ id: SERVER, campaignId: "k1", name: "Software Engineer screening", status: "draft", publicLink: null }];
  reply = server;
  vi.useFakeTimers();
  // The store keeps its save timers on `window`; there is no page here.
  vi.stubGlobal("window", globalThis);
});
afterEach(() => {
  store.forgetLoadedForms();
  inv.resetFreshness();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a form changed from outside the card", () => {
  it("shows the status and link the server now has, without a reload, and says so for the card that was drawn", async () => {
    await store.loadForms("k1");
    expect(store.getFormMeta(SERVER)).toMatchObject({ status: "draft", publicLink: null });

    // The agent publishes it (approved in the chat); the server commits.
    rows[0] = { ...rows[0]!, status: "live", publicLink: LINK, responses: 2 };
    await store.refreshFormCounts("k1");

    expect(store.getFormMeta(SERVER)).toMatchObject({ status: "live", publicLink: LINK, responses: 2 });
    expect(store.getForm(SERVER)?.status).toBe("live");
  });

  it("shows a form closed or renamed by the agent, and one the agent made", async () => {
    rows[0] = { ...rows[0]!, status: "live", publicLink: LINK };
    await store.loadForms("k1");
    rows[0] = { ...rows[0]!, status: "closed", name: "Backend Engineer screening" };
    rows.push({ id: SECOND, campaignId: "k1", name: "Second screening", status: "draft", publicLink: null });
    await store.refreshFormCounts("k1");

    expect(store.getFormMeta(SERVER).status).toBe("closed");
    expect(store.getForm(SERVER)?.name).toBe("Backend Engineer screening");
    expect(store.getForm(SECOND)?.name).toBe("Second screening");
  });

  it("leaves edits that are not saved yet alone, and takes only what was published", async () => {
    await store.loadForms("k1");
    store.updateForm(SERVER, (f) => ({ ...f, name: "My own words" }));
    rows[0] = { ...rows[0]!, status: "live", publicLink: LINK, name: "Someone else's words" };
    await store.refreshFormCounts("k1");

    expect(store.getForm(SERVER)?.name).toBe("My own words");
    expect(store.getFormMeta(SERVER)).toMatchObject({ status: "live", publicLink: LINK });
  });

  it("is told by the one refresh: the forms view reads the campaign's forms again, whichever campaign it names", async () => {
    await store.loadForms("k1");
    calls.length = 0;
    rows[0] = { ...rows[0]!, status: "live", publicLink: LINK };

    inv.READ.forms(new Set(["k1"]));
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toContain("GET /v1/campaigns/k1/forms");
    expect(store.getFormMeta(SERVER).status).toBe("live");

    // A change that names no campaign: every campaign whose forms are on screen.
    calls.length = 0;
    rows[0] = { ...rows[0]!, status: "closed" };
    inv.READ.forms(new Set([null]));
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toContain("GET /v1/campaigns/k1/forms");
    expect(store.getFormMeta(SERVER).status).toBe("closed");
  });

  it("is what a stale 'forms' view does once the burst has settled", async () => {
    await store.loadForms("k1");
    calls.length = 0;
    rows[0] = { ...rows[0]!, status: "live", publicLink: LINK };
    inv.invalidateViews(["forms"], { campaignId: "k1" });
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getFormMeta(SERVER)).toMatchObject({ status: "live", publicLink: LINK });
  });
});

describe("the names the agent emits for a form write", () => {
  const FORM_WRITES = ["forms.create", "forms.update", "forms.set_status", "forms.decide_responses"];
  const ACTIONS = ["create_form", "update_form", "set_form_status", "decide_responses"];

  it("each leaves the forms view stale, by capability and by action", () => {
    for (const c of [...FORM_WRITES, ...ACTIONS]) expect(inv.viewsFor({ capability: c }).has("forms"), c).toBe(true);
  });

  it("reach it from an effect event, and from an approval's answer, with or without a campaign", async () => {
    const { effectsOf } = await import("../liveChat");
    const ev = (payload: Record<string, unknown>): RunEvent => ({ id: 1, type: "progress", runId: "r1", seq: 1, at: new Date().toISOString(), ...payload }) as RunEvent;
    for (const capability of FORM_WRITES) {
      const e = effectsOf(ev({ step: "effect", capability, effects: ["campaign"], campaignId: "k1", summary: "Changed the form" }));
      expect(e, capability).toMatchObject({ capability, campaignId: "k1" });
      expect(inv.viewsFor({ effects: e!.effects, capability: e!.capability }).has("forms"), capability).toBe(true);
    }
    // No campaign on the event: still the forms view (every campaign on screen is read).
    const bare = effectsOf(ev({ step: "effect", capability: "forms.set_status", effects: ["campaign"], summary: "x" }));
    expect(bare).toMatchObject({ capability: "forms.set_status", campaignId: null });

    // A server that sends only the approval's result: the action names it.
    const result = effectsOf({ id: 2, type: "result", runId: "r1", seq: 2, at: "", approvalSeq: 1, decision: "approve", action: "set_form_status", campaignId: "k1" } as unknown as RunEvent);
    expect(result).toMatchObject({ capability: "set_form_status", campaignId: "k1" });
    expect(inv.viewsFor({ effects: result!.effects, capability: result!.capability }).has("forms")).toBe(true);
  });
});

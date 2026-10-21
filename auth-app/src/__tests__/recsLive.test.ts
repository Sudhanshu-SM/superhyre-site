import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "../api/agent";
import type { CampaignRow } from "../campaignsData";

/**
 * The live landing's ideas, and the way back to it. A page that opens with a heading over
 * nothing is the failure these pin: a new organisation, a recruiter on no campaigns, and
 * a chat that was left open and is reopened must all still have somewhere to begin.
 */

const { detail } = vi.hoisted(() => ({ detail: { value: null as unknown } }));
vi.mock("../api/client", () => ({
  LIVE: true, API_URL: "http://api.test", api: async () => undefined,
  messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
}));
vi.mock("../api/agent", () => ({ agentApi: { conversation: async () => detail.value } }));
vi.mock("../api/events", () => ({ follow: () => () => {} }));

const { generalIdeas, ideasFromCampaigns, liveIdeas } = await import("../recs");
const { chatNow, newChat, openChat, resumeChat } = await import("../liveChat");

const row = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: "c1", name: "Data Engineer", department: "", location: "", status: "active", owner: "A", team: [],
  funnel: { sourced: 30, shortlisted: 6, contacted: 0, replied: 0, interviews: 0, hired: 0 },
  trend: Array.from({ length: 14 }, () => 1), target: 1, agents: [], updatedAgo: "", createdAgo: "", ...over,
});
const admin = { canCreate: true, canAddClient: true };
/* A recruiter opens campaigns of their own; adding a client is an admin's. */
const recruiter = { canCreate: true };
/* Someone who may do neither (not a standing the console has today, held for the rule). */
const bystander = { canCreate: false };

describe("the general ideas", () => {
  it("offers a new organisation a way to begin, not an empty row", () => {
    const ideas = liveIdeas([], admin);
    expect(ideas.map((i) => i.prompt)).toEqual(["Help me set up a new campaign", "Add a client", "What can you help me with?"]);
  });

  it("never offers a recruiter the thing they would be refused: a client, not a campaign of their own", () => {
    for (const rows of [[], [row()], [row({ status: "closed" })]]) {
      const prompts = liveIdeas(rows, recruiter).map((i) => i.prompt);
      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts).toContain("Help me set up a new campaign");
      expect(prompts).not.toContain("Add a client");
    }
    for (const rows of [[], [row()], [row({ status: "closed" })]]) {
      const prompts = liveIdeas(rows, bystander).map((i) => i.prompt);
      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts).not.toContain("Help me set up a new campaign");
      expect(prompts).not.toContain("Add a client");
    }
  });

  it("offers a recruiter on no campaigns a way to begin their own, and a tour", () => {
    expect(liveIdeas([], recruiter).map((i) => i.prompt)).toEqual(["Help me set up a new campaign", "What can you help me with?"]);
    expect(liveIdeas([], bystander).map((i) => i.prompt)).toEqual(["What can you help me with?"]);
  });

  it("with campaigns but none running, falls back to the general set about them", () => {
    const ideas = liveIdeas([row({ status: "closed" })], admin);
    expect(ideasFromCampaigns([row({ status: "closed" })])).toEqual([]);
    expect(ideas.map((i) => i.id)).toEqual(["g-attention", "g-agents", "g-find", "g-new"]);
  });

  it("leads with the general ideas, which fit a chip and hold whatever the numbers are, and follows with the campaigns' own", () => {
    const own = ideasFromCampaigns([row()]);
    expect(own).toHaveLength(2);
    const ideas = liveIdeas([row()], admin);
    expect(ideas.slice(0, 3).map((i) => i.id)).toEqual(["g-attention", "g-agents", "g-find"]);
    expect(ideas.slice(-2)).toEqual(own);
  });

  it("keeps the general ones in front however many campaigns there are", () => {
    const rows = [row({ id: "a" }), row({ id: "b", name: "Designer" })];
    const own = ideasFromCampaigns(rows);
    expect(own.length).toBeGreaterThanOrEqual(3);
    const ideas = liveIdeas(rows, bystander);
    expect(ideas.slice(0, 3).map((i) => i.id)).toEqual(["g-attention", "g-agents", "g-find"]);
    expect(ideas.slice(3)).toEqual(own);
    // A recruiter has the same three in front, and a way to start a campaign of their own after them.
    const theirs = liveIdeas(rows, recruiter);
    expect(theirs.slice(0, 4).map((i) => i.id)).toEqual(["g-attention", "g-agents", "g-find", "g-new"]);
    expect(theirs.slice(4)).toEqual(own);
  });

  it("has unique ids and a sentence for every idea, and claims no figure", () => {
    const all = [
      ...generalIdeas({ canCreate: true, canAddClient: true, hasCampaigns: true }), ...generalIdeas({ canCreate: true, canAddClient: true, hasCampaigns: false }),
      ...generalIdeas({ canCreate: true, hasCampaigns: false }),
      ...generalIdeas({ canCreate: false, hasCampaigns: true }), ...generalIdeas({ canCreate: false, hasCampaigns: false }),
    ];
    for (const i of all) {
      expect(i.prompt.trim().length).toBeGreaterThan(0);
      expect(i.because).not.toMatch(/\d/);
      expect(i.signal).toBeUndefined();
    }
    for (const set of [liveIdeas([], admin), liveIdeas([row()], admin), liveIdeas([row()], recruiter)]) {
      expect(new Set(set.map((i) => i.id)).size).toBe(set.length);
    }
  });

  it("types the start of a search and waits for the role", () => {
    const find = generalIdeas({ canCreate: true, hasCampaigns: true }).find((i) => i.id === "g-find");
    expect(find?.prompt.endsWith(": ")).toBe(true);
    expect(find?.short).toBe("Find people for a role");
  });
});

describe("leaving a reopened chat for a new one", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    detail.value = {
      conversation: { id: "chat-1", title: "Compare Priya and Anika", focusCampaignId: null, focusCampaignName: null, updatedAt: "2026-10-09T10:00:00Z" },
      messages: [{ id: "m1", role: "user", text: "Compare Priya and Anika", createdAt: "2026-10-09T10:00:00Z", runId: null, clientId: null }],
    } as unknown as ConversationDetail;
    newChat();
  });

  it("reopens the chat this tab left, so the landing is not what a returning person sees", async () => {
    store.set("sh.agent.conversation", "chat-1");
    await resumeChat();
    expect(chatNow().conversationId).toBe("chat-1");
    expect(chatNow().turns).toHaveLength(1);
  });

  it("starts again from nothing, and does not reopen the old chat afterwards", async () => {
    store.set("sh.agent.conversation", "chat-1");
    await resumeChat();
    newChat();
    expect(chatNow()).toMatchObject({ conversationId: null, turns: [] });
    expect(store.has("sh.agent.conversation")).toBe(false);
    await resumeChat();
    expect(chatNow().turns).toEqual([]);
  });

  it("can still open an earlier chat by choice", async () => {
    await openChat("chat-1");
    expect(chatNow().turns).toHaveLength(1);
    expect(store.get("sh.agent.conversation")).toBe("chat-1");
  });
});

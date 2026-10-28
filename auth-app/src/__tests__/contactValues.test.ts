import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Shortlisted table's Email and Phone values: read from the workspace's candidate rows of the campaign, paged. */

const h = vi.hoisted(() => ({
  asked: [] as Array<{ campaignId?: string; cursor?: string | null; limit: number; stage?: string }>,
  pages: [] as Array<{ rows: Array<{ id: string; email: string | null; phone: string | null }>; nextCursor: string | null }>,
  invalidate: null as null | ((effects: ReadonlySet<string>, campaigns: ReadonlySet<string | null>) => void),
}));

vi.mock("../api/client", () => ({ LIVE: true }));
vi.mock("../api/identity", () => ({ onWorkspaceChange: () => () => {} }));
vi.mock("../campaignStore", () => ({ resolveCampaignId: (id: string) => id }));
vi.mock("../invalidate", () => ({
  onInvalidate: (fn: (e: ReadonlySet<string>, c: ReadonlySet<string | null>) => void) => { h.invalidate = fn; return () => {}; },
}));
vi.mock("../api/candidates", () => ({
  listCandidates: async (q: { campaignId?: string; cursor?: string | null; limit: number; stage?: string }) => {
    h.asked.push(q);
    return h.pages.shift() ?? { rows: [], nextCursor: null };
  },
}));

const mod = await import("../contactValues");

beforeEach(() => {
  h.asked.length = 0;
  h.pages.length = 0;
  mod.resetContactValues();
});

describe("loadContactValues", () => {
  it("reads the campaign's candidate rows, page after page, keyed by candidate", async () => {
    h.pages.push(
      { rows: [{ id: "c1", email: "asha@zlice.com", phone: null }], nextCursor: "next" },
      { rows: [{ id: "c2", email: null, phone: "+919800000001" }], nextCursor: null },
    );
    await mod.loadContactValues("camp-1");
    // Then the people hired, whom the list leaves out unless it is asked for that stage.
    expect(h.asked.map((a) => [a.campaignId, a.cursor ?? null])).toEqual([["camp-1", null], ["camp-1", "next"], ["camp-1", null]]);
    expect(h.asked.map((a) => a.stage)).toEqual([undefined, undefined, "hired"]);
  });

  it("includes the people hired, so their address is shown and not \"On file\"", async () => {
    h.pages.push(
      { rows: [{ id: "c1", email: "open@zlice.com", phone: null }], nextCursor: null },
      { rows: [{ id: "c9", email: "hired@zlice.com", phone: null }], nextCursor: null },
    );
    await mod.loadContactValues("camp-3");
    expect(h.asked.map((a) => a.stage)).toEqual([undefined, "hired"]);
  });

  it("asks once for a campaign at a time", async () => {
    h.pages.push({ rows: [], nextCursor: null });
    await Promise.all([mod.loadContactValues("camp-2"), mod.loadContactValues("camp-2")]);
    expect(h.asked).toHaveLength(2);
  });

  it("reads nothing without a campaign", async () => {
    await mod.loadContactValues("");
    expect(h.asked).toHaveLength(0);
  });
});

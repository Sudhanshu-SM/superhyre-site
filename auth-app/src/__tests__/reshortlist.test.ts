import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<[string, string, unknown]> = [];
let detailStage = "passed";
vi.mock("../api/client", () => ({
  LIVE: true,
  ApiError: class extends Error {},
  api: async (method: string, path: string, body?: unknown) => {
    calls.push([method, path, body]);
    if (method === "GET") return { campaigns: [{ id: "c1", name: "A", campaignCandidateId: "cc1", stage: detailStage }], notes: [], candidate: {} };
    if (method === "POST") return { results: [{ candidateId: "p1", added: true, campaignCandidateId: "cc2" }] };
    return {};
  },
}));
const { reshortlist } = await import("../api/candidates");

beforeEach(() => { calls.length = 0; detailStage = "passed"; });

describe("putting someone who was passed back on a campaign", () => {
  it("moves them to the shortlist, since adding them again would leave them passed", async () => {
    await reshortlist("p1", "c1");
    expect(calls.at(-1)).toEqual(["PATCH", "/v1/campaigns/c1/candidates/cc1", { stage: "shortlisted" }]);
  });

  it("leaves someone who has since moved on alone", async () => {
    detailStage = "outreach";
    await reshortlist("p1", "c1");
    expect(calls.some(([m]) => m === "PATCH")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Approve and start matching" is a request that says to start matching: the server starts it only
 * when asked, so a client that only approves is unchanged.
 */

const { server } = vi.hoisted(() => ({ server: { calls: [] as Array<{ method: string; path: string }> } }));
vi.mock("../api/client", () => ({
  LIVE: true,
  API_URL: "http://api.test",
  ApiError: class extends Error {},
  api: async (method: string, path: string) => {
    server.calls.push({ method, path });
    return { id: "s1", version: 2, matching: { kind: "rank", runId: "r1", people: 41 } };
  },
}));

const { specApi } = await import("../api/agent");

beforeEach(() => {
  server.calls.length = 0;
});

describe("approving requirements", () => {
  it("asks for matching to start when the button says it will", async () => {
    const done = await specApi.approve("c1", "s1", { match: true });
    expect(server.calls).toEqual([{ method: "POST", path: "/v1/campaigns/c1/spec/s1/approve?match=true" }]);
    expect(done.matching).toEqual({ kind: "rank", runId: "r1", people: 41 });
  });

  it("only approves when it is not asked to start anything", async () => {
    await specApi.approve("c1", "s1");
    expect(server.calls).toEqual([{ method: "POST", path: "/v1/campaigns/c1/spec/s1/approve" }]);
  });
});

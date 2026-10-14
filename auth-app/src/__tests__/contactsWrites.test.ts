import { describe, expect, it, vi } from "vitest";

/** What a contact lookup leaves stale: the board, Candidates and the figures, for the campaign it was on. */

vi.mock("../api/client", () => ({
  LIVE: true,
  API_URL: "http://api.test",
  ApiError: class extends Error {},
  messageOf: () => "",
  api: async () => undefined,
  onWrite: () => () => {},
}));
vi.mock("../problems", () => ({ reportProblem: () => {} }));

const { effectsOfWrite } = await import("../invalidate");

describe("a contact lookup is a write that leaves views stale", () => {
  it("on one campaign: its board, Candidates and its figures", () => {
    expect(effectsOfWrite("POST", "/v1/campaigns/c1/contacts")).toEqual({
      effects: ["pipeline", "candidates", "campaign"],
      campaignId: "c1",
    });
  });

  it("on several at once: every campaign this console has opened", () => {
    expect(effectsOfWrite("POST", "/v1/contacts/fetch")).toEqual({
      effects: ["pipeline", "candidates", "campaign"],
      campaignId: null,
    });
  });

  it("is not a read: asking for the status leaves nothing stale", () => {
    expect(effectsOfWrite("GET", "/v1/campaigns/c1/contacts/status")).toBeNull();
    expect(effectsOfWrite("POST", "/v1/campaigns/c1/contacts/status")).toBeNull();
  });
});

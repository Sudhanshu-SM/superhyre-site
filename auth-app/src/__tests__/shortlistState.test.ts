import { describe, expect, it } from "vitest";
import { shortlistState } from "../CampaignWorkspace";

describe("the Shortlisted page's state", () => {
  it("says it could not be read rather than drawing an empty list", () => {
    expect(shortlistState(false, false)).toBe("loading");
    expect(shortlistState(true, false)).toBe("list");
    // The API unreachable: the people never arrived, and "No one on the shortlist yet" would be a wrong answer.
    expect(shortlistState(true, true)).toBe("failed");
  });
});

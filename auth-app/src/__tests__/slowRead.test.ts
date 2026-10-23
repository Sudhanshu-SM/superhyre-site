import { describe, expect, it } from "vitest";
import { SLOW_MESSAGE, SLOW_WRITE_MESSAGE, slowFailure } from "../api/client";

describe("a request that ran out of time", () => {
  it("says nothing changed for a read that is sent as a POST (a job description, a sheet, an attachment)", () => {
    for (const path of ["/v1/campaigns/jd/read", "/v1/campaigns/jd/sheet", "/v1/attachments/read"]) {
      const err = slowFailure("POST", path, 90_000);
      expect(err.message).toBe(SLOW_MESSAGE);
      expect(err.details.maybeDone).toBeUndefined();
    }
  });

  it("still warns that a write may have gone through", () => {
    const err = slowFailure("POST", "/v1/campaigns", 30_000);
    expect(err.message).toBe(SLOW_WRITE_MESSAGE);
    expect(err.details.maybeDone).toBe(true);
  });
});

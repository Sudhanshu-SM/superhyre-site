import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { finishWithRetry, type LeanResult, onboardingApi } from "../api/onboarding";

const body = { fullName: "Arnab", organisation: null, role: { kind: "title" as const, title: "Analyst" }, jd: null, client: null };
const ids: LeanResult = {
  organisationId: null,
  campaignId: "c1",
  clientId: null,
  conversationId: "chat1",
  setupRunId: "run1",
  specRunId: null,
};
const fast = { pauseMs: 0, timeoutMs: 40 };

afterEach(() => vi.restoreAllMocks());

describe("finishing the set-up is safe to repeat", () => {
  it("returns the ids when the first attempt answers", async () => {
    const finish = vi.spyOn(onboardingApi, "finish").mockResolvedValue(ids);
    expect(await finishWithRetry(body, fast)).toEqual(ids);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("asks again when an attempt is too slow, and takes the same ids the server gives back", async () => {
    const finish = vi
      .spyOn(onboardingApi, "finish")
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(ids);
    expect(await finishWithRetry(body, fast)).toEqual(ids);
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it("asks again after a dropped connection or a server that is still busy", async () => {
    const finish = vi
      .spyOn(onboardingApi, "finish")
      .mockRejectedValueOnce(new ApiError(0, "network", "Can't reach SuperHyre."))
      .mockRejectedValueOnce(new ApiError(503, "unavailable", "Your workspace is still being set up."))
      .mockResolvedValueOnce(ids);
    expect(await finishWithRetry(body, fast)).toEqual(ids);
    expect(finish).toHaveBeenCalledTimes(3);
  });

  it("does not ask again when the server said no", async () => {
    const no = new ApiError(409, "conflict", "You're already in Quill Hire.");
    const finish = vi.spyOn(onboardingApi, "finish").mockRejectedValue(no);
    await expect(finishWithRetry(body, fast)).rejects.toBe(no);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("gives up after a few attempts, with the last thing that went wrong", async () => {
    const finish = vi.spyOn(onboardingApi, "finish").mockRejectedValue(new ApiError(0, "network", "Can't reach SuperHyre."));
    await expect(finishWithRetry(body, { ...fast, attempts: 3 })).rejects.toThrow(/Can't reach/);
    expect(finish).toHaveBeenCalledTimes(3);
  });
});

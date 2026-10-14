import { describe, expect, it } from "vitest";
import { ApiError, messageOf } from "../api/client";
import { failedTurnState } from "../LiveTurn";
import { loadFailedText } from "../ui";

describe("a limit says what happened and when it lifts", () => {
  const now = Date.parse("2026-10-05T10:00:00Z");

  it("doesn't blame the server for too many requests", () => {
    expect(loadFailedText("Your clients", "limited", now + 40_000, now)).toBe(
      "Your clients didn't load: that was a lot of requests in a short time. Try again in 40s.",
    );
    expect(loadFailedText("Your clients", "limited", null, now)).toContain("Try again in a moment.");
    expect(loadFailedText("Your clients", "server", null, now)).toContain("on our side");
  });

  it("keeps a sentence that only mentions trying again partway through", () => {
    const err = new ApiError(429, "rate_limited", "That's a lot of drafts in an hour. Edit this one, or try again a little later.", {
      retryAt: Date.now() + 16 * 60_000,
    });
    expect(messageOf(err)).toMatch(/^That's a lot of drafts in an hour\. Edit this one, or try again a little later\. Try again in 1[67] min\.$/);
    const own = new ApiError(429, "rate_limited", "Busy starting other work. Try again in a moment.", { retryAt: Date.now() + 5_000 });
    expect(messageOf(own)).toMatch(/^Busy starting other work\. Try again in [56]s\.$/);
  });

  it("counts down a chat limit and offers Send again once it lifts", () => {
    const turn = { error: "This campaign has searched a lot in the last hour", errorCode: "rate_limited", retryAt: now + 42 * 60_000 };
    expect(failedTurnState(turn, now)).toEqual({
      text: "This campaign has searched a lot in the last hour. Try again in 42 min.",
      canResend: false,
      canEdit: false,
      waitingUntil: now + 42 * 60_000,
    });
    expect(failedTurnState(turn, now + 43 * 60_000).canResend).toBe(true);
  });

  it("offers nothing that would fail the same way until a daily limit resets", () => {
    const daily = { error: "Your team has used today's searches. They reset at midnight UTC.", errorCode: "rate_limited", retryAt: null };
    expect(failedTurnState(daily, now)).toMatchObject({ canResend: false, waitingUntil: null });
    expect(failedTurnState({ error: "The agent couldn't answer this time.", errorCode: "internal", retryAt: null }, now).canResend).toBe(true);
  });

  it("puts a refused message back in the box instead of offering it again", () => {
    const long = { error: "That's too long: keep it under 8000 characters.", errorCode: "bad_request", retryAt: null };
    expect(failedTurnState(long, now)).toEqual({
      text: "That's too long: keep it under 8000 characters.",
      canResend: false,
      canEdit: true,
      waitingUntil: null,
    });
    expect(failedTurnState({ ...long, errorCode: "too_large" }, now)).toMatchObject({ canResend: false, canEdit: true });
    expect(failedTurnState({ error: "Can't reach SuperHyre.", errorCode: null, retryAt: null }, now)).toMatchObject({ canResend: true, canEdit: false });
  });
});

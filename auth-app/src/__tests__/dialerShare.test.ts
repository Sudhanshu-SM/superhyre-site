import { describe, expect, it } from "vitest";
import { shareNotice } from "../DialerPage";
import type { Dialer } from "../dialer";

/* Only the fields shareNotice reads, as in dialerEmpty.test.ts. */
function activity(waiting: number, view: "mine" | "team" = "mine"): Dialer {
  return { view, stats: { awaiting_share: waiting } } as Dialer;
}

describe("shareNotice", () => {
  it("says nothing when no call is waiting for its recording", () => {
    expect(shareNotice(activity(0), "")).toBeNull();
  });

  it("counts the waiting calls, singular and plural", () => {
    expect(shareNotice(activity(1), "")).toMatch(/^1 connected call is /);
    expect(shareNotice(activity(3), "")).toMatch(/^3 connected calls are /);
  });

  it("tells a recruiter how to add their own recordings", () => {
    const copy = shareNotice(activity(2), "");
    expect(copy).toMatch(/your phone/);
    expect(copy).toMatch(/Add recording/);
  });

  it("tells a team view the recordings are on each recruiter's phone", () => {
    const copy = shareNotice(activity(2, "team"), "");
    expect(copy).toMatch(/recruiter's phone/);
    expect(copy).not.toMatch(/your phone/);
  });

  it("stays out of the way when only unconnected calls are listed", () => {
    // Every waiting call is a connected one; under "Missed" it would count
    // rows that are not on screen.
    expect(shareNotice(activity(2), "missed")).toBeNull();
    expect(shareNotice(activity(2), "errored")).toBeNull();
    expect(shareNotice(activity(2), "connected")).not.toBeNull();
  });

  it("uses no em dash, which the copy rules ban in user-visible strings", () => {
    for (const view of ["mine", "team"] as const) {
      expect(shareNotice(activity(2, view), "")).not.toContain("—");
    }
  });
});

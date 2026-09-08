import { describe, expect, it } from "vitest";
import { emptyCalls } from "../DialerPage";
import type { Dialer } from "../dialer";

/* Only the fields emptyCalls reads. Building a whole Dialer here would assert
   the shape of twelve unrelated keys and break on every schema addition. */
function activity(over: Partial<Dialer>): Dialer {
  return { days: 30, view: "mine", can_view_team: false, ...over } as Dialer;
}

describe("emptyCalls", () => {
  it("does not offer a wider window to a recruiter who cannot widen the scope", () => {
    // The bug: a recruiter with no calls of their own was told to try a wider
    // window, which returns the same empty table however far back it reaches,
    // because the gate is ownership and not time.
    const copy = emptyCalls(activity({ view: "mine", can_view_team: false }), "");
    expect(copy).not.toMatch(/wider window/i);
  });

  it("says the scope is your own calls, so a colleague's are absent by design", () => {
    const copy = emptyCalls(activity({ view: "mine", can_view_team: false }), "");
    expect(copy).toMatch(/only calls you made/i);
    expect(copy).toMatch(/recording/i);
  });

  it("still offers a wider window to someone who can see the team", () => {
    // For an owner an empty table really can mean the window is too narrow.
    const copy = emptyCalls(activity({ view: "team", can_view_team: true }), "");
    expect(copy).toMatch(/wider window/i);
  });

  it("blames the filter, not the scope, when a group is selected", () => {
    const copy = emptyCalls(activity({ view: "mine", can_view_team: false }), "connected");
    expect(copy).toMatch(/no connected calls/i);
    expect(copy).not.toMatch(/only calls you made/i);
  });

  it("names the actual window length rather than hardcoding 30", () => {
    const copy = emptyCalls(activity({ days: 90, view: "team", can_view_team: true }), "");
    expect(copy).toContain("90 days");
  });

  it("uses no em dash, which the copy rules ban in user-visible strings", () => {
    for (const g of ["", "connected"] as const) {
      for (const team of [true, false]) {
        expect(emptyCalls(activity({ view: team ? "team" : "mine", can_view_team: team }), g))
          .not.toContain("\u2014");
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { statusLine } from "../WatchList";

const now = Date.parse("2026-10-04T10:00:00Z");

describe("watch status line", () => {
  it("says what a running watch has found and when it looks next", () => {
    expect(
      statusLine(
        { state: "running", stateReason: null, config: { stop: { profiles: 30 } }, counters: { found: 12 }, nextRunAt: "2026-10-04T12:00:00Z" },
        now,
      ),
    ).toBe("Keeping an eye out · 12 of 30 found · next check in 2 h");
  });

  it("passes on the reason a watch paused or finished, as the server wrote it", () => {
    const base = { config: { stop: {} }, counters: { found: 4 }, nextRunAt: null };
    expect(statusLine({ ...base, state: "paused", stateReason: "8 people are waiting for review." }, now)).toBe(
      "Paused: 8 people are waiting for review.",
    );
    expect(statusLine({ ...base, state: "done", stateReason: "Reached the end date." }, now)).toBe("Reached the end date.");
    expect(statusLine({ ...base, state: "paused", stateReason: "Paused by you." }, now)).toBe("Paused by you.");
    expect(
      statusLine({ ...base, state: "running", stateReason: "Couldn't score people just now; trying again shortly." }, now),
    ).toMatch(/^Couldn't score people just now; trying again shortly · /);
    expect(statusLine({ ...base, state: "paused", stateReason: null }, now)).toBe("Paused by you.");
  });
});

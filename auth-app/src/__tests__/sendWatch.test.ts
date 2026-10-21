import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOING_OUT_MS, isGoingOut, mayCancelSend, SEND_POLL_MS, watchSend } from "../sendWatch";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("watching a send", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("looks again quickly at first, then slower, and stops as soon as the email has gone", async () => {
    let sentAfter = 3;
    const looks: number[] = [];
    watchSend(() => { looks.push(Date.now()); return --sentAfter > 0; });
    const t0 = Date.now();
    await vi.advanceTimersByTimeAsync(SEND_POLL_MS[0]! - 1);
    expect(looks).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(looks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(SEND_POLL_MS[1]!);
    await vi.advanceTimersByTimeAsync(SEND_POLL_MS[2]!);
    expect(looks.map((t) => t - t0)).toEqual([1000, 2500, 4500]);
    // Gone on the third look: nothing more is asked, however long it is left.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(looks).toHaveLength(3);
  });

  it("settles a send that went in two seconds well inside the first few looks", async () => {
    const state = { status: "scheduled" };
    setTimeout(() => { state.status = "sent"; }, 2000);
    let seenAt = -1;
    const t0 = Date.now();
    watchSend(() => { if (state.status === "sent" && seenAt < 0) seenAt = Date.now() - t0; return state.status !== "sent"; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seenAt).toBeGreaterThanOrEqual(2000);
    expect(seenAt).toBeLessThanOrEqual(4500);
  });

  it("gives up after the last delay, and keeps going through a look that failed", async () => {
    const look = vi.fn(() => { throw new Error("network"); });
    watchSend(look, [100, 100, 100]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(look).toHaveBeenCalledTimes(3);
  });

  it("can be stopped, and then asks nothing more", async () => {
    const look = vi.fn(() => true);
    const stop = watchSend(look, [100, 100, 100]);
    await vi.advanceTimersByTimeAsync(100);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(look).toHaveBeenCalledTimes(1);
  });

  it("covers a couple of minutes at the most", () => {
    const total = SEND_POLL_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(60_000);
    expect(total).toBeLessThanOrEqual(150_000);
    expect(SEND_POLL_MS[0]).toBeLessThanOrEqual(1500);
  });
});

describe("what is going out, and what can still be cancelled", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");
  const iso = (ms: number) => new Date(now + ms).toISOString();

  it("is an outgoing email approved or scheduled for about now, or with no time given", () => {
    expect(isGoingOut({ direction: "out", status: "scheduled" }, iso(-5_000), now)).toBe(true);
    expect(isGoingOut({ direction: "out", status: "scheduled" }, null, now)).toBe(true);
    expect(isGoingOut({ direction: "out", status: "scheduled" }, iso(GOING_OUT_MS), now)).toBe(true);
    expect(isGoingOut({ direction: "out", status: "scheduled" }, iso(GOING_OUT_MS + 1000), now)).toBe(false);
    expect(isGoingOut({ direction: "out", status: "waiting" }, iso(-5_000), now)).toBe(false);
    expect(isGoingOut({ direction: "out", status: "failed" }, iso(-5_000), now)).toBe(false);
    expect(isGoingOut({ direction: "in", status: "scheduled" }, iso(-5_000), now)).toBe(false);
  });

  it("offers Cancel only to a send that is clearly still ahead", () => {
    expect(mayCancelSend(true, iso(3_600_000), now)).toBe(true);
    expect(mayCancelSend(true, iso(30_000), now)).toBe(true);
    expect(mayCancelSend(true, iso(2_000), now)).toBe(false);
    expect(mayCancelSend(true, iso(-1_000), now)).toBe(false);
    expect(mayCancelSend(true, null, now)).toBe(false);
    expect(mayCancelSend(false, iso(3_600_000), now)).toBe(false);
  });

  it("is wired into the sheet, its card and the list", () => {
    const sheet = src("OutreachSheet.tsx");
    expect(sheet).toContain("mayCancelSend(e.canCancel, e.scheduledFor)");
    expect(sheet).toMatch(/\{cancellable && \(/);
    expect(sheet).toContain("watchSend(async () => {");
    expect(sheet).toMatch(/invalidateViews\(\["calls", "boards", "campaigns", "week"\]\);\s*changed\.current\.onChanged\(\);/);
    expect(src("useOutreachActivity.ts")).toContain("watchSend(() => {");
    expect(src("useOutreachActivity.ts")).toContain("isGoingOut(r, r.at)");
  });
});

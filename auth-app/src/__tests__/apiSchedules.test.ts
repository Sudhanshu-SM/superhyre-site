import { describe, expect, it } from "vitest";
import { queryString, scheduleDetailOf, scheduledItemOf, schedulePageOf, scheduleRunOf } from "../api/schedules";

/**
 * Reading what `GET /v1/schedules` sends. A server a little older or newer than this console should
 * drop a row it can't read, not break the page. The shapes are the server's (modules/schedules).
 */

const raw = {
  id: "s1", kind: "email", title: "Email to Asha Verma", status: "done", runAt: "2026-10-16T04:30:00.000Z", nextRunAt: null, timezone: "Asia/Kolkata",
  repeat: "none", until: null, occurrencesDone: 1, summary: "Email to Asha Verma: 'Quick follow-up', only if they haven't replied",
  campaign: { id: "c1", name: "Android" }, candidate: { id: "p1", fullName: "Asha Verma" },
  createdBy: { kind: "agent", id: null, name: null }, approvedBy: { id: "u1", name: "Asha Rao" },
  lastError: null, lastRunAt: "2026-10-16T04:30:05.000Z", result: { messageId: "m1", delivery: "queued", scheduledFor: "2026-10-16T05:00:00.000Z" }, canCancel: true,
};

describe("one scheduled item", () => {
  it("reads everything the server sends", () => {
    expect(scheduledItemOf(raw)).toEqual({
      ...raw,
      createdBy: { kind: "agent", id: null, name: null },
    });
  });

  it("drops what isn't one", () => {
    expect(scheduledItemOf(null)).toBeNull();
    expect(scheduledItemOf("x")).toBeNull();
    expect(scheduledItemOf([])).toBeNull();
    expect(scheduledItemOf({ kind: "reminder", runAt: "2026-10-16T04:30:00Z" })).toBeNull();
    expect(scheduledItemOf({ id: "s2" })).toBeNull();
    expect(scheduledItemOf({ id: "s2", runAt: "yesterday-ish" })).toBeNull();
  });

  it("falls back for what an older or newer server leaves out or adds", () => {
    const item = scheduledItemOf({ id: "s2", runAt: "2026-10-16T04:30:00Z", status: "paused", repeat: "monthly", kind: "call" });
    expect(item).toMatchObject({
      id: "s2", kind: "call", status: "done", repeat: "none", timezone: "UTC", occurrencesDone: 0, campaign: null, candidate: null, approvedBy: null,
      lastError: null, lastRunAt: null, result: null, canCancel: false, nextRunAt: null, until: null,
      createdBy: { kind: "user", id: null, name: null },
    });
    expect(item?.summary).toBe("Something scheduled");
  });

  it("never lets a stranger cancel: only an explicit yes counts", () => {
    expect(scheduledItemOf({ id: "s3", runAt: "2026-10-16T04:30:00Z", canCancel: "yes" })?.canCancel).toBe(false);
    expect(scheduledItemOf({ id: "s3", runAt: "2026-10-16T04:30:00Z", canCancel: true })?.canCancel).toBe(true);
  });

  it("uses the next time when there is no first one", () => {
    expect(scheduledItemOf({ id: "s4", nextRunAt: "2026-10-16T04:30:00Z" })?.runAt).toBe("2026-10-16T04:30:00Z");
  });
});

describe("a page, a run and the details", () => {
  it("keeps the rows it can read and the cursor", () => {
    const page = schedulePageOf({ items: [raw, { nope: 1 }, null], nextCursor: "abc" });
    expect(page.items.map((i) => i.id)).toEqual(["s1"]);
    expect(page.nextCursor).toBe("abc");
    expect(schedulePageOf(undefined)).toEqual({ items: [], nextCursor: null });
    expect(schedulePageOf({ items: "x" })).toEqual({ items: [], nextCursor: null });
  });

  it("reads a run", () => {
    expect(scheduleRunOf({ runId: "r1", at: "2026-10-16T04:30:00Z", finishedAt: "2026-10-16T04:30:05Z", status: "skipped", message: "They replied.", result: { skipped: true } })).toEqual({
      runId: "r1", at: "2026-10-16T04:30:00Z", finishedAt: "2026-10-16T04:30:05Z", status: "skipped", message: "They replied.", result: { skipped: true },
    });
    expect(scheduleRunOf({ status: "done" })).toBeNull();
    expect(scheduleRunOf({ at: "2026-10-16T04:30:00Z", status: "weird" })?.status).toBe("done");
  });

  it("reads the details: the payload and each run", () => {
    const d = scheduleDetailOf({ ...raw, payload: { subject: "Quick follow-up", body: "Hi" }, history: [{ runId: "r1", at: "2026-10-16T04:30:00Z", status: "done" }, { nope: true }] });
    expect(d?.payload).toEqual({ subject: "Quick follow-up", body: "Hi" });
    expect(d?.history.map((h) => h.runId)).toEqual(["r1"]);
    expect(scheduleDetailOf({ id: "s9", runAt: "2026-10-16T04:30:00Z" })).toMatchObject({ payload: {}, history: [] });
    expect(scheduleDetailOf(null)).toBeNull();
  });
});

describe("asking for a list", () => {
  it("sends only what differs from the defaults", () => {
    expect(queryString({})).toBe("");
    expect(queryString({ status: "upcoming", kind: "all", campaignId: null, limit: 50 })).toBe("?limit=50");
    expect(queryString({ status: "history", kind: "task", campaignId: "c1", limit: 50, cursor: "abc" })).toBe("?status=history&campaignId=c1&kind=task&limit=50&cursor=abc");
  });
});

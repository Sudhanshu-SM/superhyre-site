import { describe, expect, it } from "vitest";
import type { ScheduledItem } from "../api/schedules";
import {
  approvedLine, byLine, byNextTime, campaignIdFromHash, canChangeTime, cancelCopy, candidateNote, comingUp, deliveryText,
  detailLines, instantFromLocal, isDue, localInput, metaLine, newLines, nextTime, pollDelay, repeatWords, retryText, runLine,
  schedulesHrefFor, skipText, soonLabel, statusText, summaryText, whenLabel, whenProblem, whoLabel, zoneName, zoneParts,
} from "../schedulesView";

/**
 * What the Scheduled screen says, as words. The clock is always given, and times are read in a named
 * zone, so none of this depends on where the tests run.
 */

const KOLKATA = "Asia/Kolkata";
/** Sat 10 Oct 2026, 14:30 in Kolkata. */
const NOW = Date.parse("2026-10-10T09:00:00Z");

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: "s1", kind: "reminder", title: "Reminder", status: "scheduled", runAt: "2026-10-11T04:30:00.000Z", nextRunAt: "2026-10-11T04:30:00.000Z",
  timezone: KOLKATA, repeat: "none", until: null, occurrencesDone: 0, summary: "Reminder: 'Call Rahul'", campaign: null, candidate: null,
  createdBy: { kind: "user", id: "u1", name: "Asha Rao" }, approvedBy: null, lastError: null, lastRunAt: null, result: null, canCancel: true, ...over,
});

describe("the calendar in a named zone", () => {
  it("reads the wall clock where the zone is, whatever zone the tests run in", () => {
    expect(zoneParts(NOW, KOLKATA)).toMatchObject({ y: 2026, m: 10, d: 10, h: 14, min: 30, weekday: 6 });
    expect(zoneParts(NOW, "America/New_York")).toMatchObject({ d: 10, h: 5, min: 0 });
  });

  it("reads a zone it doesn't know as UTC rather than failing", () => {
    expect(zoneParts(NOW, "Not/AZone")).toMatchObject({ h: 9, min: 0 });
  });

  it("names the zone briefly", () => {
    expect(zoneName(NOW, KOLKATA)).toBe("IST");
    expect(zoneName(NOW, "America/New_York")).toBe("EDT");
  });
});

describe("when something happens", () => {
  const at = (iso: string, o: Parameters<typeof whenLabel>[2] = {}) => whenLabel(iso, KOLKATA, { now: NOW, viewerTz: KOLKATA, ...o });

  it("says today and tomorrow by the zone's own calendar, not by 24 hours", () => {
    expect(at("2026-10-10T10:00:00Z")).toBe("Today, 15:30");
    expect(at("2026-10-11T04:30:00Z")).toBe("Tomorrow, 10:00");
    // 00:30 in Kolkata is tomorrow, though it is only ten hours away.
    expect(at("2026-10-10T19:00:00Z")).toBe("Tomorrow, 00:30");
    expect(at("2026-10-09T12:00:00Z")).toBe("Yesterday, 17:30");
  });

  it("gives a weekday and a date after that, and the year when it isn't this one", () => {
    expect(at("2026-10-12T04:00:00Z")).toBe("Mon 12 Oct, 09:30");
    expect(at("2027-01-04T04:00:00Z")).toBe("Mon 4 Jan 2027, 09:30");
    expect(at("2026-10-05T04:00:00Z")).toBe("Mon 5 Oct, 09:30");
  });

  it("names the zone only when it isn't the reader's own", () => {
    expect(at("2026-10-10T10:00:00Z", { viewerTz: "UTC" })).toBe("Today, 15:30 IST");
    expect(at("2026-10-10T10:00:00Z", { viewerTz: KOLKATA })).toBe("Today, 15:30");
    expect(at("2026-10-10T10:00:00Z", { zone: true })).toBe("Today, 15:30 IST");
  });

  it("gives the exact day when asked, for an approval", () => {
    expect(at("2026-10-11T04:30:00Z", { absolute: true, zone: true })).toBe("Sun 11 Oct, 10:00 IST");
  });

  it("is empty for a time that isn't one", () => {
    expect(whenLabel("soon", KOLKATA, { now: NOW })).toBe("");
  });

  it("says how soon, but only for the next hour", () => {
    expect(soonLabel("2026-10-10T09:00:30Z", NOW)).toBe("in under a minute");
    expect(soonLabel("2026-10-10T09:02:00Z", NOW)).toBe("in 2 min");
    expect(soonLabel("2026-10-10T09:59:00Z", NOW)).toBe("in 59 min");
    expect(soonLabel("2026-10-10T10:30:00Z", NOW)).toBeNull();
    expect(soonLabel("2026-10-10T08:00:00Z", NOW)).toBeNull();
  });

  it("takes the next turn of a repeat, and the first time of anything else", () => {
    expect(nextTime(item({ nextRunAt: "2026-10-12T04:00:00Z" }))).toBe("2026-10-12T04:00:00Z");
    expect(nextTime(item({ nextRunAt: null }))).toBe("2026-10-11T04:30:00.000Z");
  });

  it("knows something waiting is due", () => {
    expect(isDue(item({ nextRunAt: "2026-10-10T08:59:00Z" }), NOW)).toBe(true);
    expect(isDue(item({ nextRunAt: "2026-10-10T09:30:00Z" }), NOW)).toBe(false);
    expect(isDue(item({ status: "done", nextRunAt: "2026-10-10T08:59:00Z" }), NOW)).toBe(false);
  });
});

describe("how it repeats", () => {
  const r = (over: Partial<ScheduledItem>) => repeatWords(item({ runAt: "2026-10-12T04:00:00Z", nextRunAt: "2026-10-12T04:00:00Z", ...over }), NOW);

  it("says nothing for something that happens once", () => {
    expect(r({ repeat: "none" })).toBe("");
  });

  it("says every day, every weekday, or every weekday name", () => {
    expect(r({ repeat: "daily" })).toBe("every day");
    expect(r({ repeat: "weekdays" })).toBe("every weekday");
    expect(r({ repeat: "weekly" })).toBe("every Monday");
  });

  it("names the weekday in the item's zone, not the reader's", () => {
    // 22:00 UTC on a Sunday is already Monday in Kolkata.
    expect(r({ repeat: "weekly", nextRunAt: "2026-10-11T22:00:00Z" })).toBe("every Monday");
  });

  it("says when it stops, with the year only when it isn't this one", () => {
    expect(r({ repeat: "weekdays", until: "2026-10-31T18:29:00Z" })).toBe("every weekday until 31 Oct");
    expect(r({ repeat: "daily", until: "2027-02-01T10:00:00Z" })).toBe("every day until 1 Feb 2027");
  });
});

describe("who", () => {
  it("says You, a teammate's name, or Mind", () => {
    expect(whoLabel(item(), "u1")).toBe("You");
    expect(whoLabel(item(), "u2")).toBe("Asha Rao");
    expect(whoLabel(item({ createdBy: { kind: "user", id: "u9", name: null } }), "u1")).toBe("A teammate");
    expect(whoLabel(item({ createdBy: { kind: "agent", id: null, name: "Superhyre agent" } }), "u1")).toBe("Mind");
  });

  it("reads as a line", () => {
    expect(byLine(item(), "u1")).toBe("By you");
    expect(byLine(item(), "u2")).toBe("By Asha Rao");
    expect(byLine(item({ createdBy: { kind: "agent", id: null, name: null } }), "u1")).toBe("By Mind");
  });

  it("says who approved what Mind proposed, and nothing for what a person made", () => {
    const mind = { kind: "agent" as const, id: null, name: null };
    expect(approvedLine(item({ createdBy: mind, approvedBy: { id: "u1", name: "Asha Rao" } }), "u1")).toBe("Approved by you");
    expect(approvedLine(item({ createdBy: mind, approvedBy: { id: "u1", name: "Asha Rao" } }), "u2")).toBe("Approved by Asha Rao");
    expect(approvedLine(item({ approvedBy: { id: "u1", name: "Asha Rao" } }), "u1")).toBeNull();
    expect(approvedLine(item({ createdBy: mind }), "u1")).toBeNull();
  });
});

describe("what", () => {
  it("drops the server's repeat suffix, since the time says how it repeats", () => {
    expect(summaryText(item({ repeat: "weekdays", summary: "Pipeline digest for Android to Slack #hiring, every weekday" }))).toBe(
      "Pipeline digest for Android to Slack #hiring",
    );
    expect(summaryText(item({ repeat: "daily", summary: "Reminder: 'Stand up', every day" }))).toBe("Reminder: 'Stand up'");
    expect(summaryText(item({ repeat: "weekly", summary: "Reminder: 'Review', every week" }))).toBe("Reminder: 'Review'");
  });

  it("leaves a sentence that only happens to say it alone", () => {
    expect(summaryText(item({ repeat: "none", summary: "Reminder: 'Check every day'" }))).toBe("Reminder: 'Check every day'");
    expect(summaryText(item({ repeat: "daily", summary: "Reminder: 'Check every day on Slack'" }))).toBe("Reminder: 'Check every day on Slack'");
  });

  it("names the person only when the sentence doesn't", () => {
    expect(candidateNote(item({ candidate: { id: "c1", fullName: "Asha Verma" }, summary: "Email to Asha Verma: 'Hi'" }))).toBeNull();
    expect(candidateNote(item({ candidate: { id: "c1", fullName: "Asha Verma" }, summary: "Task 'Call' for Priya" }))).toBe("About Asha Verma");
    expect(candidateNote(item())).toBeNull();
  });

  it("puts who, the campaign and how often it has run on one line", () => {
    const row = item({ campaign: { id: "c", name: "Android" }, repeat: "daily", occurrencesDone: 3 });
    expect(metaLine(row, "u1")).toBe("By you · Android · Has run 3 times");
    expect(metaLine(item({ repeat: "daily", occurrencesDone: 1 }), "u2")).toBe("By Asha Rao · Has run once");
    expect(metaLine(item(), "u1")).toBe("By you");
  });
});

describe("how it went", () => {
  const run = (over: Partial<ScheduledItem>) => statusText(item({ status: "done", lastRunAt: "2026-10-10T08:00:00Z", ...over }), NOW, KOLKATA);

  it("says nothing for something still waiting, and that it is going out", () => {
    expect(statusText(item(), NOW)).toBeNull();
    expect(statusText(item({ status: "running" }), NOW)).toBe("Going out now");
  });

  it("says what each kind did", () => {
    expect(run({ kind: "slack_message" })).toBe("Posted");
    expect(run({ kind: "task" })).toBe("Task created");
    expect(run({ kind: "reminder" })).toBe("Reminder sent");
    expect(run({ kind: "notion_note" })).toBe("Added to Notion");
    expect(run({ kind: "digest" })).toBe("Sent");
    expect(run({ kind: "digest", repeat: "weekdays", occurrencesDone: 5 })).toBe("Sent, 5 times");
  });

  it("reads an email by what happened to it after it fired", () => {
    expect(run({ kind: "email", result: { delivery: "sent" } })).toBe("Sent");
    expect(run({ kind: "email", result: { delivery: "queued", scheduledFor: "2026-10-12T03:30:00Z" } })).toBe("Goes out Mon 12 Oct, 09:00");
    expect(run({ kind: "email", result: { delivery: "queued" } })).toBe("Waiting to go out");
    expect(run({ kind: "email", result: { delivery: "failed", deliveryError: "Gmail refused it" } })).toBe("Didn't send: Gmail refused it");
    expect(run({ kind: "email", result: { delivery: "failed" } })).toBe("Didn't send: the email was refused");
    expect(run({ kind: "email", result: { delivery: "cancelled" } })).toBe("Withdrawn before it was sent");
    expect(run({ kind: "email", result: null })).toBe("Done");
  });

  it("gives the reason it didn't go out, in the server's own words", () => {
    expect(statusText(item({ status: "failed", lastError: "Slack isn't connected." }), NOW)).toBe("Didn't go out: Slack isn't connected.");
    expect(statusText(item({ status: "failed" }), NOW)).toBe("Didn't go out: something went wrong");
  });

  it("says skipped, with the reason when there is one", () => {
    const reason = "Asha has replied, so the follow-up was not sent.";
    expect(statusText(item({ status: "skipped", result: { reason } }), NOW)).toBe(`Skipped: ${reason}`);
    expect(skipText(item({ result: null }))).toBe("Skipped");
  });

  it("says cancelled", () => {
    expect(statusText(item({ status: "cancelled" }), NOW)).toBe("Cancelled");
  });

  it("explains a delivery without a status", () => {
    expect(deliveryText(item({ result: { delivery: "sent" } }))).toBe("Sent");
    expect(deliveryText(item({ result: {} }))).toBeNull();
  });

  it("tells a waiting item that hit a snag it will try again", () => {
    expect(retryText(item({ lastError: "Slack was busy." }))).toBe("It will try again. Last time: Slack was busy.");
    expect(retryText(item())).toBeNull();
    expect(retryText(item({ status: "failed", lastError: "x" }))).toBeNull();
  });
});

describe("who may do what", () => {
  it("lets a time change only while it waits and the person may change it", () => {
    expect(canChangeTime(item())).toBe(true);
    expect(canChangeTime(item({ canCancel: false }))).toBe(false);
    expect(canChangeTime(item({ status: "done" }))).toBe(false);
    expect(canChangeTime(item({ status: "running" }))).toBe(false);
  });

  it("doesn't move a repeat that has already run", () => {
    expect(canChangeTime(item({ repeat: "daily", occurrencesDone: 0 }))).toBe(true);
    expect(canChangeTime(item({ repeat: "daily", occurrencesDone: 2 }))).toBe(false);
  });

  it("says what cancelling withdraws, before and after", () => {
    expect(cancelCopy(item({ kind: "email" }))).toEqual({
      ask: "Cancel this email? The email will not be sent.", confirm: "Cancel it", done: "Cancelled. The email will not be sent.",
    });
    expect(cancelCopy(item({ kind: "slack_message" })).ask).toBe("Cancel this Slack message? Nothing will be posted to Slack.");
    expect(cancelCopy(item({ kind: "reminder" })).ask).toBe("Cancel this reminder? You won't be reminded.");
    expect(cancelCopy(item({ kind: "task" })).ask).toBe("Cancel this task? The task will not be created.");
    expect(cancelCopy(item({ kind: "notion_note" })).ask).toBe("Cancel this Notion note? Nothing will be added to Notion.");
    expect(cancelCopy(item({ kind: "digest", repeat: "weekdays" })).ask).toBe("Cancel this digest? No more digests will be sent.");
    expect(cancelCopy(item({ kind: "reminder", repeat: "daily" })).done).toBe("Cancelled. You won't be reminded again.");
  });

  it("calls it withdrawing for an email that has already been handed to the sender", () => {
    expect(cancelCopy(item({ kind: "email", status: "done" }))).toEqual({
      ask: "Withdraw this email? The email will not be sent.", confirm: "Withdraw it", done: "Withdrawn. The email will not be sent.",
    });
  });

  it("copes with a kind a newer server adds", () => {
    expect(cancelCopy(item({ kind: "call" })).ask).toBe("Cancel this item? It will not run.");
  });
});

describe("the full text", () => {
  const d = (kind: string, payload: Record<string, unknown>) => ({ kind, payload, timezone: KOLKATA });

  it("gives an email's subject and message", () => {
    expect(detailLines(d("email", { subject: "Quick follow-up", body: "Hi Asha,\n\nStill keen?", onlyIfNoReply: true }))).toEqual([
      { label: "Subject", text: "Quick follow-up" },
      { label: "Message", text: "Hi Asha,\n\nStill keen?" },
    ]);
  });

  it("gives where a post goes and what it says", () => {
    expect(detailLines(d("slack_message", { channelName: "hiring", text: "Shortlist is ready" }))).toEqual([
      { label: "Posts to", text: "#hiring" }, { label: "Message", text: "Shortlist is ready" },
    ]);
  });

  it("gives a Notion note, a task with its due time, a reminder and a digest's destinations", () => {
    expect(detailLines(d("notion_note", { title: "Notes", parentTitle: "Hiring wiki", body: "Body" })).map((l) => l.label)).toEqual(["Title", "Goes in", "Text"]);
    expect(detailLines(d("task", { title: "Call", assigneeName: "Priya", dueAt: "2026-10-12T04:00:00Z" }), NOW, KOLKATA)).toEqual([
      { label: "Task", text: "Call" }, { label: "For", text: "Priya" }, { label: "Due", text: "Mon 12 Oct, 09:30" },
    ]);
    expect(detailLines(d("reminder", { text: "Call Rahul" }))).toEqual([{ label: "Reminder", text: "Call Rahul" }]);
    expect(detailLines(d("digest", { to: ["slack", "app"], channelName: "hiring" }))).toEqual([{ label: "Sends to", text: "Slack #hiring and your notifications" }]);
  });

  it("leaves out nothing it was sent and nothing it wasn't", () => {
    expect(detailLines(d("email", {}))).toEqual([]);
    expect(detailLines(d("call", { x: 1 }))).toEqual([]);
  });

  it("shows only what the sentence above doesn't already say", () => {
    const row = item({ summary: "Slack message to #hiring: 'Shortlist is ready'" });
    const lines = detailLines(d("slack_message", { channelName: "hiring", text: "Shortlist is ready" }));
    expect(newLines(lines, row)).toEqual([]);
    expect(newLines([{ label: "Message", text: "A much longer message than the sentence could hold" }], row)).toHaveLength(1);
  });

  it("writes what each run came to", () => {
    const base = { runId: "r", at: "2026-10-10T08:00:00Z", finishedAt: null, result: null };
    expect(runLine({ ...base, status: "done", message: null }, KOLKATA, NOW, KOLKATA)).toBe("Today, 13:30 · Done");
    expect(runLine({ ...base, status: "skipped", message: "Asha has replied." }, KOLKATA, NOW, KOLKATA)).toBe("Today, 13:30 · Skipped: Asha has replied.");
    expect(runLine({ ...base, status: "failed", message: "Slack is down." }, KOLKATA, NOW, KOLKATA)).toBe("Today, 13:30 · Didn't go out: Slack is down.");
  });
});

describe("choosing a time by hand", () => {
  it("reads a typed time in the zone it is for", () => {
    expect(instantFromLocal("2026-10-17T10:00", KOLKATA)).toBe(Date.UTC(2026, 9, 17, 4, 30));
    expect(instantFromLocal("2026-10-17T10:00", "UTC")).toBe(Date.UTC(2026, 9, 17, 10, 0));
    expect(instantFromLocal("2026-10-17T10:00", "America/New_York")).toBe(Date.UTC(2026, 9, 17, 14, 0));
  });

  it("follows the clocks going forward and back", () => {
    // New York in winter is five hours behind, in summer four.
    expect(instantFromLocal("2026-01-15T09:00", "America/New_York")).toBe(Date.UTC(2026, 0, 15, 14, 0));
    expect(instantFromLocal("2026-07-15T09:00", "America/New_York")).toBe(Date.UTC(2026, 6, 15, 13, 0));
  });

  it("refuses a time that doesn't exist, the night the clocks go forward", () => {
    expect(instantFromLocal("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(instantFromLocal("2026-03-08T03:30", "America/New_York")).toBe(Date.UTC(2026, 2, 8, 7, 30));
  });

  it("refuses what isn't a time at all", () => {
    expect(instantFromLocal("", KOLKATA)).toBeNull();
    expect(instantFromLocal("tomorrow", KOLKATA)).toBeNull();
    expect(instantFromLocal("2026-10-17", KOLKATA)).toBeNull();
  });

  it("round-trips an instant through the input's own format", () => {
    for (const tz of [KOLKATA, "UTC", "America/New_York", "Europe/London", "Australia/Sydney"]) {
      const ms = Date.UTC(2026, 9, 17, 4, 30);
      expect(instantFromLocal(localInput(ms, tz), tz)).toBe(ms);
    }
    expect(localInput(Date.UTC(2026, 9, 17, 4, 30), KOLKATA)).toBe("2026-10-17T10:00");
  });

  it("wants a time in the future and within 90 days", () => {
    expect(whenProblem(null, NOW)).toBe("Pick a day and a time.");
    expect(whenProblem(NOW - 1000, NOW)).toBe("Pick a time in the future.");
    expect(whenProblem(NOW, NOW)).toBe("Pick a time in the future.");
    expect(whenProblem(NOW + 30_000, NOW)).toBe("Pick a time at least a minute from now.");
    expect(whenProblem(NOW + 120_000, NOW)).toBeNull();
    expect(whenProblem(NOW + 90 * 86_400_000, NOW)).toBeNull();
    expect(whenProblem(NOW + 91 * 86_400_000, NOW)).toBe("That's more than 90 days away. Pick a nearer day.");
  });
});

describe("lists", () => {
  it("puts the soonest first", () => {
    const a = item({ id: "a", nextRunAt: "2026-10-12T04:00:00Z" });
    const b = item({ id: "b", nextRunAt: "2026-10-11T04:00:00Z" });
    const c = item({ id: "c", nextRunAt: null, runAt: "2026-10-13T04:00:00Z" });
    expect([a, c, b].sort(byNextTime).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("counts what is coming up", () => {
    expect(comingUp(3, false)).toBe("3 coming up");
    expect(comingUp(50, true)).toBe("50+ coming up");
  });

  it("links to the screen, and to one campaign on it", () => {
    expect(schedulesHrefFor(null)).toBe("#/?section=coming-up");
    expect(schedulesHrefFor("c 1")).toBe("#/?section=coming-up&campaignId=c%201");
    expect(campaignIdFromHash(schedulesHrefFor("c 1"))).toBe("c 1");
    // An old link to the Scheduled screen carried the same filter.
    expect(campaignIdFromHash("#/schedules?campaignId=c%201")).toBe("c 1");
    expect(campaignIdFromHash("#/?section=coming-up")).toBeNull();
  });
});

describe("when to look again", () => {
  const waiting = (due: string, over: Partial<ScheduledItem> = {}) => ({ status: "scheduled" as const, nextRunAt: due, runAt: due, ...over });

  it("looks every minute when nothing is close", () => {
    expect(pollDelay([], NOW)).toBe(60_000);
    expect(pollDelay([waiting("2026-10-11T04:30:00Z")], NOW)).toBe(60_000);
    expect(pollDelay([{ status: "done", nextRunAt: null, runAt: "2026-10-10T08:00:00Z" }], NOW)).toBe(60_000);
  });

  it("looks a little after the next thing is due, so it is seen going out", () => {
    // Due in 20 s: look at 32 s.
    expect(pollDelay([waiting("2026-10-10T09:00:20Z")], NOW)).toBe(32_000);
  });

  it("looks often while something that should have gone is still going", () => {
    expect(pollDelay([waiting("2026-10-10T08:59:00Z")], NOW)).toBe(10_000);
    expect(pollDelay([{ status: "running", nextRunAt: null, runAt: "2026-10-10T08:00:00Z" }], NOW)).toBe(10_000);
  });

  it("gives up looking often for something that has been overdue a long time", () => {
    expect(pollDelay([waiting("2026-10-10T08:00:00Z")], NOW)).toBe(60_000);
  });
});

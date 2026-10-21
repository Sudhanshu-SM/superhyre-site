import { describe, expect, it } from "vitest";
import type { RunEvent } from "../api/events";
import {
  approvalFailure, CHANGED_AGAIN, isScheduleAction, scheduleBlocks, scheduleHead, scheduleOutcome,
} from "../chatCards";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import { ACTION_LABEL, TOOL_LABEL, WORKING_LABEL } from "../agentCards/labels";
import { afterApproval, outcomeOf } from "../agentCards/outcome";
import { COMING_UP_HREF, redirectedHash, routeFromHash, settingsSectionFromHash, SETTINGS_SECTIONS } from "../nav";
import { memoryRow } from "../railConfig";

/**
 * Scheduling in the agent chat: the approval card for things that happen later, what it says once
 * approved or stale, the new tools' names in the transcript, and what the Agent page's Memory row
 * says about what is coming up. The shapes are the server's (modules/agent/actions.ts `schedule`, modules/schedules).
 */

/** Sat 10 Oct 2026, 2:30 pm in Kolkata. */
const NOW = Date.parse("2026-10-10T09:00:00Z");
const KOLKATA = "Asia/Kolkata";

const reminder = { kind: "reminder", runAt: "2026-10-11T04:30:00.000Z", timezone: KOLKATA, repeat: "none", title: "Reminder", payload: { text: "Call Rahul about the shortlist" } };
const email = {
  kind: "email", runAt: "2026-10-16T04:30:00.000Z", timezone: KOLKATA, repeat: "none", campaignCandidateId: "cc1",
  payload: { campaignCandidateId: "cc1", subject: "Quick follow-up", body: "Hi Asha,\n\nStill keen?\n\nAsha", followUp: true, onlyIfNoReply: true },
};
const slack = { kind: "slack_message", runAt: "2026-10-12T03:30:00.000Z", timezone: KOLKATA, repeat: "none", payload: { text: "Shortlist is ready", channel: "C0123ABCD", channelName: "hiring" } };
const digest = {
  kind: "digest", runAt: "2026-10-12T04:00:00.000Z", timezone: KOLKATA, repeat: "weekdays", until: "2026-10-31T18:29:00.000Z", campaignId: "ca1",
  payload: { to: ["slack", "app"], channel: "C0123ABCD", channelName: "hiring" },
};
const task = { kind: "task", runAt: "2026-10-12T04:00:00.000Z", timezone: KOLKATA, repeat: "none", payload: { title: "Chase references", assigneeName: "Priya", dueAt: "2026-10-14T12:30:00.000Z" } };
const notion = { kind: "notion_note", runAt: "2026-10-12T04:00:00.000Z", timezone: KOLKATA, repeat: "none", payload: { title: "Weekly notes", body: "Three offers out.", parentTitle: "Hiring wiki", parentType: "page" } };

const act = (...items: unknown[]) => ({ action: "schedule", items, hash: "a".repeat(64) });

describe("the approval for things that happen later", () => {
  it("knows its action", () => {
    expect(isScheduleAction("schedule")).toBe(true);
    expect(isScheduleAction("remember")).toBe(false);
  });

  it("shows one block for a reminder: what, the exact words, when", () => {
    expect(scheduleBlocks(act(reminder), [], null, NOW)).toEqual([
      { kind: "reminder", what: "Reminder for you", quote: { title: null, body: "Call Rahul about the shortlist" }, when: "Sun 11 Oct, 10 am IST", repeat: "", note: null },
    ]);
  });

  it("names the person an email is for, with its subject and message, and the condition", () => {
    const [b] = scheduleBlocks(act(email), [{ name: "Asha Verma" }], "Android", NOW);
    expect(b).toMatchObject({
      kind: "email", what: "Email to Asha Verma", when: "Fri 16 Oct, 10 am IST",
      quote: { title: "Quick follow-up", body: "Hi Asha,\n\nStill keen?\n\nAsha" },
      note: "Only goes if they haven't replied by then.",
    });
  });

  it("matches each email to the person in the order the emails come", () => {
    const blocks = scheduleBlocks(act(email, reminder, email), [{ name: "Asha Verma" }, { name: "Ravi Iyer" }], null, NOW);
    expect(blocks.map((b) => b.what)).toEqual(["Email to Asha Verma", "Reminder for you", "Email to Ravi Iyer"]);
  });

  it("says where a Slack post goes, and where a Notion note is filed", () => {
    expect(scheduleBlocks(act(slack), [], null, NOW)[0]).toMatchObject({ what: "Post to #hiring on Slack", quote: { title: null, body: "Shortlist is ready" }, when: "Mon 12 Oct, 9 am IST" });
    expect(scheduleBlocks(act(notion), [], null, NOW)[0]).toMatchObject({ what: "Notion note in Hiring wiki", quote: { title: "Weekly notes", body: "Three offers out." } });
  });

  it("says who a task is for and when it is due", () => {
    expect(scheduleBlocks(act(task), [], null, NOW)[0]).toMatchObject({
      what: "Task for Priya", quote: { title: null, body: "Chase references" }, note: "Due Wed 14 Oct, 6 pm IST",
    });
  });

  it("says how a digest repeats, and where it goes", () => {
    expect(scheduleBlocks(act(digest), [], "Android", NOW)[0]).toMatchObject({
      what: "Pipeline digest for Android", quote: null, repeat: "every weekday until 31 Oct", note: "Goes to Slack #hiring and your notifications.",
    });
    expect(scheduleBlocks(act({ ...digest, campaignId: null }), [], "Android", NOW)[0]?.what).toBe("Pipeline digest for all your active campaigns");
  });

  it("names the zone on every time, since an approval is exact", () => {
    for (const b of scheduleBlocks(act(reminder, slack, digest), [], null, NOW)) expect(b.when).toMatch(/ IST$/);
  });

  it("leaves out what it can't read rather than guessing", () => {
    expect(scheduleBlocks(act({ kind: "reminder" }, { runAt: "x" }, null, "nope", { kind: "reminder", runAt: "not a time" }), [], null, NOW)).toEqual([]);
    expect(scheduleBlocks({ action: "schedule" }, [], null, NOW)).toEqual([]);
    expect(scheduleBlocks(act({ kind: "carrier_pigeon", runAt: "2026-10-12T04:00:00Z" }), [], null, NOW)).toEqual([]);
  });

  it("clips a very long message, as the other approvals do", () => {
    const long = { ...slack, payload: { ...slack.payload, text: "x".repeat(2000) } };
    const body = scheduleBlocks(act(long), [], null, NOW)[0]?.quote?.body ?? "";
    expect(body.length).toBeLessThan(1300);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("the card's heading", () => {
  const kinds = (...k: string[]) => k.map((kind) => ({ kind }));

  it("says what one thing is", () => {
    expect(scheduleHead(kinds("email"))).toBe("Schedule an email");
    expect(scheduleHead(kinds("slack_message"))).toBe("Schedule a Slack message");
    expect(scheduleHead(kinds("notion_note"))).toBe("Schedule a Notion note");
    expect(scheduleHead(kinds("task"))).toBe("Schedule a task");
    expect(scheduleHead(kinds("reminder"))).toBe("Schedule a reminder");
    expect(scheduleHead(kinds("digest"))).toBe("Schedule a digest");
  });

  it("counts several of one kind, or of a mix", () => {
    expect(scheduleHead(kinds("email", "email", "email"))).toBe("Schedule 3 emails");
    expect(scheduleHead(kinds("reminder", "email"))).toBe("Schedule 2 things");
  });

  it("copes with nothing it can read", () => {
    expect(scheduleHead([])).toBe("Schedule this");
    expect(scheduleHead(kinds("pigeon"))).toBe("Schedule something");
  });
});

describe("what approving did", () => {
  it("says it is scheduled and where to find it", () => {
    expect(scheduleOutcome({ scheduled: [{ id: "s1" }] })).toEqual({ lead: "Scheduled. You'll find it under ", link: "Coming up", tail: " on your Home page." });
    expect(scheduleOutcome({ scheduled: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] }).lead).toBe("Scheduled 3 things. You'll find them under ");
  });

  it("copes with an answer that doesn't list them, and with none made", () => {
    expect(scheduleOutcome({}).lead).toBe("Scheduled. You'll find it under ");
    expect(scheduleOutcome({ scheduled: [] })).toEqual({ lead: "Nothing was scheduled.", link: "", tail: "" });
  });

  it("explains a stale card in the recruiter's words, and a failure as it was said", () => {
    expect(approvalFailure("schedule", 409, "This changed after it was proposed. Ask the agent to propose it again.")).toBe(CHANGED_AGAIN);
    expect(CHANGED_AGAIN).toBe("That changed while you were looking. Ask again.");
    expect(approvalFailure("schedule", 409, "Asha has 3 emails waiting already.")).toBe("Asha has 3 emails waiting already.");
    expect(approvalFailure("schedule", 400, "That time has already passed.")).toBe("That time has already passed.");
    expect(approvalFailure("shortlist", 409, "This changed after it was proposed.")).toBe("This changed after it was proposed.");
    expect(approvalFailure("schedule", null, "Can't reach SuperHyre.")).toBe("Can't reach SuperHyre.");
  });
});

describe("as the chat holds it", () => {
  let n = 0;
  const ev = (type: RunEvent["type"], payload: Record<string, unknown>): RunEvent => ({ ...payload, id: ++n, runId: "r1", seq: n, type, at: "2026-10-10T09:00:00.000Z" });
  const chat = (): ChatState => ({
    conversationId: "c1", turns: [{ ...newTurn("t1", "Remind me tomorrow at 10"), runId: "r1", status: "working" }],
    owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
  });
  const proposed = () => applyEvent(chat(), ev("approval", {
    action: act(reminder), summary: 'Remind you on Sun 11 Oct 2026, 10 am am IST: "Call Rahul about the shortlist"', campaignName: null, people: [],
  }));
  const decided = (decision: "approve" | "decline", result: Record<string, unknown> = {}) => {
    let s = proposed();
    const seq = s.turns[0]?.approvals[0]?.seq;
    s = applyEvent(s, ev("result", { approvalSeq: seq, decision, action: "schedule", ...result }));
    const a = s.turns[0]?.approvals[0];
    if (!a) throw new Error("no approval");
    return a;
  };

  it("keeps the items so the card can show them", () => {
    const a = proposed().turns[0]?.approvals[0];
    expect(a).toMatchObject({ action: "schedule", decided: null });
    expect(scheduleBlocks(a?.detail ?? {}, a?.people ?? [], a?.campaignName ?? null, NOW)).toHaveLength(1);
  });

  it("says Scheduled once approved, with where to find it", () => {
    const a = decided("approve", { scheduled: [{ id: "s1", title: "Reminder", kind: "reminder", runAt: reminder.runAt, repeat: "none" }], scheduleIds: ["s1"] });
    expect(outcomeOf(a)).toBe("Scheduled. You'll find it under Coming up on your Home page.");
    // The outcome carries its own link, so the card doesn't add a second one.
    expect(afterApproval(a)).toBeNull();
  });

  it("says nothing was scheduled when it was declined", () => {
    const a = decided("decline");
    expect(outcomeOf(a)).toBe("Not scheduled.");
    expect(afterApproval(a)).toBeNull();
  });
});

describe("the tools in the transcript", () => {
  it("has a friendly name for each new one, past and present", () => {
    for (const tool of ["list_schedules", "propose_schedule", "propose_followup", "cancel_schedule", "create_task", "do_not_contact"]) {
      expect(TOOL_LABEL[tool], tool).toBeTruthy();
      expect(WORKING_LABEL[tool], tool).toBeTruthy();
    }
    expect(WORKING_LABEL.list_schedules).toBe("Looking at what's scheduled");
    expect(WORKING_LABEL.propose_schedule).toBe("Scheduling");
    expect(WORKING_LABEL.cancel_schedule).toBe("Cancelling a scheduled item");
    expect(WORKING_LABEL.create_task).toBe("Creating a task");
    expect(WORKING_LABEL.do_not_contact).toBe("Adding to do-not-contact");
    expect(TOOL_LABEL.create_task).toBe("Created a task");
  });

  it("names no tool by its code name", () => {
    for (const label of [...Object.values(TOOL_LABEL), ...Object.values(WORKING_LABEL), ...Object.values(ACTION_LABEL)]) {
      expect(label).not.toMatch(/_|propose|schedule_/i);
    }
  });
});

describe("what is coming up, in the Agent page's Memory row", () => {
  const retry = () => {};
  const memory = { stats: { active: 38, pending: 2, byScope: { org: 0, client: 0, campaign: 0, person: 0 } }, statsPhase: "ready" as const, unavailable: false };

  it("says how many notes and how many things are coming up, linking to Memory", () => {
    expect(memoryRow({ ...memory, comingUp: { count: 3, more: false } }, retry)).toEqual({
      label: "Memory", value: "38 notes, 3 coming up", notes: [{ text: "2 to review", href: "#/settings/memory" }],
    });
  });

  it("says there is more than the first page", () => {
    expect(memoryRow({ ...memory, comingUp: { count: 50, more: true } }, retry)?.value).toBe("38 notes, 50+ coming up");
  });

  it("is just the notes when nothing is coming up, and says so when there is nothing at all", () => {
    expect(memoryRow({ ...memory, comingUp: { count: 0, more: false } }, retry)?.value).toBe("38 notes");
    expect(memoryRow({ ...memory, stats: { ...memory.stats, active: 0, pending: 0 }, comingUp: null }, retry)).toMatchObject({ value: "Nothing yet", notes: [{ text: "See what it remembers" }] });
    expect(memoryRow({ ...memory, stats: { ...memory.stats, active: 0 }, comingUp: { count: 1, more: false } }, retry)?.value).toBe("1 coming up");
  });
});

describe("Coming up is on Home, and Do not contact is no settings section", () => {
  it("sends the old Scheduled address to Coming up", () => {
    expect(redirectedHash("#/schedules")).toBe(COMING_UP_HREF);
    expect(routeFromHash("#/schedules?campaignId=c1")).toBe("home");
    expect(settingsSectionFromHash("#/schedules/")).toBeNull();
  });

  it("sends an old Do not contact address to Settings' landing page", () => {
    expect(SETTINGS_SECTIONS).not.toContain("do-not-contact");
    expect(settingsSectionFromHash("#/settings/do-not-contact")).toBeNull();
    expect(settingsSectionFromHash("#/settings/do-not-contact/")).toBeNull();
    expect(redirectedHash("#/settings/do-not-contact")).toBe("#/settings");
    expect(routeFromHash("#/settings/do-not-contact")).toBe("settings");
    expect(settingsSectionFromHash("#/settings/do-not")).toBeNull();
  });
});

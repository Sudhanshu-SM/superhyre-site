import { describe, expect, it } from "vitest";
import { clip, conversationOf, didLine, didOf, questionOf } from "../activityView";
import type { RunDetail } from "../activityView";
import { rowOf } from "../AgentActivity";
import type { RunSummary } from "../AgentActivity";
import type { RunEvent } from "../api/events";
import type { ScheduledItem } from "../api/schedules";
import { dateInput, endOfDate, endOfDayAhead } from "../api/tasks";
import { chatTitle, cutAtWord, titleFromMessage, UNTITLED } from "../chatTitle";
import type { CampaignRow } from "../campaignsData";
import { applyEvent, CHAT_LIMIT, chatLength, chatOver, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import { settledLead } from "../LiveTurn";
import { listedNames, flagSuppressed, scopeLine } from "../liveViews/outreachScope";
import { replacedWords, replacementOf } from "../memoryView";
import { buildEntries, settingsPages } from "../Palette";
import { workspaceRows } from "../railConfig";
import type { PeopleState } from "../railConfig";
import {
  canonicalZone, dayLabel, failureWords, isGmailDown, isSender, retryText, runLine, sameZone, statusText, whenLabel,
} from "../schedulesView";
import { tidySeed } from "../seedText";

/**
 * The second round of console fixes: titles that stop at a word, a message the agent will take, a
 * zone that is one zone, a Gmail failure told to the person who can fix it, what the activity page
 * says about a run, who is counted as emailable, and what a replaced note says about its successor.
 */

describe("a chat's name", () => {
  it("stops at the last whole word and never ends in a mark", () => {
    const cut = "Find me senior product designers in Bangalore who have shipped a mobile app and wo...";
    const name = chatTitle(cut);
    expect(name).toBe("Find me senior product designers in Bangalore who have shipped a mobile app and");
    expect(name).not.toMatch(/\.\.\.|…$/u);
    expect(chatTitle("Find the staff engineers who scaled Postgres in Banga…")).toBe("Find the staff engineers who scaled Postgres in");
  });

  it("leaves a name that was not cut as it is, and says New chat for none", () => {
    expect(chatTitle("Chase the six candidates waiting on a reply")).toBe("Chase the six candidates waiting on a reply");
    expect(chatTitle(null)).toBe(UNTITLED);
    expect(chatTitle("   ")).toBe(UNTITLED);
    expect(chatTitle("...")).toBe(UNTITLED);
  });

  it("names the open chat from its first message at a word, with no mark", () => {
    const said = "Which of my campaigns need attention this week, and what should I do about the two that stalled?";
    const name = titleFromMessage(said);
    expect(name.length).toBeLessThanOrEqual(60);
    expect(said.startsWith(name)).toBe(true);
    expect(said.charAt(name.length)).toBe(" ");
    expect(titleFromMessage("Short one")).toBe("Short one");
    expect(titleFromMessage("First line\nSecond line")).toBe("First line");
  });

  it("cuts a single long word where it is, since there is no word before it", () => {
    expect(cutAtWord("a".repeat(100), 20)).toBe("a".repeat(20));
  });
});

describe("how long a message may be", () => {
  it("counts the text trimmed, as the server does, and is over only past the limit", () => {
    expect(CHAT_LIMIT).toBe(8000);
    expect(chatLength("  hello  ")).toBe(5);
    expect(chatOver("a".repeat(8000))).toBe(false);
    expect(chatOver("a".repeat(8001))).toBe(true);
    expect(chatOver(` ${"a".repeat(8000)} `)).toBe(false);
  });
});

describe("what a seeded prompt leaves in the composer", () => {
  it("drops a dangling colon and keeps the space to type after", () => {
    expect(tidySeed("Finish the brief for Product Designer: ")).toBe("Finish the brief for Product Designer ");
    expect(tidySeed("Show all my tasks across campaigns")).toBe("Show all my tasks across campaigns");
    expect(tidySeed("Take this over: Draft the offer")).toBe("Take this over: Draft the offer");
    expect(tidySeed(":")).toBe(":");
  });
});

const KOLKATA = "Asia/Kolkata";
const NOW = Date.parse("2026-10-10T09:00:00Z");

describe("one zone, one name", () => {
  it("reads the browser's old names as the ones people use", () => {
    expect(canonicalZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(canonicalZone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(canonicalZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(canonicalZone("America/New_York")).toBe("America/New_York");
    expect(sameZone("Asia/Calcutta", "Asia/Kolkata")).toBe(true);
    expect(sameZone("Asia/Kolkata", "UTC")).toBe(false);
  });

  it("does not name the zone when the reader's is the same one under another spelling", () => {
    const iso = "2026-10-10T10:00:00Z";
    expect(whenLabel(iso, "Asia/Kolkata", { now: NOW, viewerTz: "Asia/Calcutta" })).toBe("Today, 3:30 pm");
    expect(whenLabel(iso, "Asia/Calcutta", { now: NOW, viewerTz: "Asia/Kolkata" })).toBe("Today, 3:30 pm");
    expect(whenLabel(iso, "Asia/Kolkata", { now: NOW, viewerTz: "UTC" })).toBe("Today, 3:30 pm IST");
  });

  it("writes a day beside its weekday one way, here and on Home", () => {
    expect(dayLabel(Date.parse("2026-10-12T04:00:00Z"), KOLKATA, NOW)).toBe("Mon 12 Oct");
    expect(dayLabel(Date.parse("2027-01-04T04:00:00Z"), KOLKATA, NOW)).toBe("Mon 4 Jan 2027");
  });
});

const sched = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: "s1", kind: "email", title: "Email", status: "failed", runAt: "2026-10-10T08:00:00.000Z", nextRunAt: null, timezone: KOLKATA,
  repeat: "none", until: null, occurrencesDone: 0, summary: "Email to Priya: Hello", campaign: null, candidate: null,
  createdBy: { kind: "user", id: "u1", name: "Asha Rao" }, approvedBy: null,
  lastError: "Connect Gmail in Settings → Connections to send.", lastRunAt: "2026-10-10T08:00:00.000Z", result: null, canCancel: true, ...over,
});

describe("a Gmail that isn't connected, told to whoever can fix it", () => {
  it("knows the failure, and who it goes out as", () => {
    expect(isGmailDown("Connect Gmail in Settings → Connections to send.")).toBe(true);
    expect(isGmailDown("The email was refused")).toBe(false);
    expect(isGmailDown(null)).toBe(false);
    expect(isSender(sched(), "u1")).toBe(true);
    expect(isSender(sched({ createdBy: { kind: "agent", id: null, name: null }, approvedBy: { id: "u2", name: "Ravi" } }), "u2")).toBe(true);
    expect(isSender(sched(), "u3")).toBe(false);
    expect(isSender(sched(), null)).toBe(false);
  });

  it("tells the sender what to do and a teammate only what happened", () => {
    expect(statusText(sched(), NOW, KOLKATA, "u1")).toBe("Didn't go out: Gmail wasn't connected.");
    expect(statusText(sched(), NOW, KOLKATA, "u3")).toBe("Didn't go out: Gmail wasn't connected for whoever sends it.");
    expect(failureWords("The email was refused", false)).toBe("The email was refused");
    expect(retryText({ status: "scheduled", lastError: "Connect Gmail in Settings → Connections to send." }, false)).toBe(
      "It will try again. Last time: Gmail wasn't connected for whoever sends it.",
    );
  });
});

describe("how an email's run reads once its message has had its own ending", () => {
  const run = { runId: "r1", at: "2026-10-10T08:00:00.000Z", finishedAt: null, status: "done" as const, message: null, result: null };
  const withdrawn = sched({ status: "cancelled", result: { delivery: "cancelled" } });

  it("tells a Gmail that wasn't connected the same way in the run's own line", () => {
    const failed = { ...run, status: "failed" as const, message: "Connect Gmail in Settings \u2192 Connections to send." };
    expect(runLine(failed, KOLKATA, NOW, KOLKATA, sched(), true, true)).toBe("Today, 1:30 pm \u00b7 Didn't go out: Gmail wasn't connected.");
    expect(runLine(failed, KOLKATA, NOW, KOLKATA, sched(), true, false)).toBe("Today, 1:30 pm \u00b7 Didn't go out: Gmail wasn't connected for whoever sends it.");
  });

  it("says withdrawn, not done, for the newest run of a withdrawn email", () => {
    expect(runLine(run, KOLKATA, NOW, KOLKATA)).toBe("Today, 1:30 pm · Done");
    expect(runLine(run, KOLKATA, NOW, KOLKATA, withdrawn, true)).toBe("Today, 1:30 pm · Withdrawn before it was sent");
    expect(runLine(run, KOLKATA, NOW, KOLKATA, withdrawn, false)).toBe("Today, 1:30 pm · Done");
    expect(runLine(run, KOLKATA, NOW, KOLKATA, sched({ status: "done", result: { delivery: "sent" } }), true)).toBe("Today, 1:30 pm · Sent");
  });
});

describe("who an outreach run is counted for", () => {
  it("reads the names on the do-not-contact list, and not a masked address", () => {
    const names = listedNames(["Asha Verma", "p***@acme.com", " Ravi Iyer ", ""]);
    expect([...names].sort()).toEqual(["asha verma", "ravi iyer"]);
  });

  it("marks the people who are on it", () => {
    const people = [{ fullName: "Asha Verma" }, { fullName: "Dev Nair" }];
    const marked = flagSuppressed(people, listedNames(["asha verma"]));
    expect(marked.map((p) => p.suppressed ?? false)).toEqual([true, false]);
  });

  it("counts what will be drafted and says who is left out", () => {
    const named = { basis: "named" as const, missing: 0, fellBack: false };
    const short = { basis: "shortlist" as const, missing: 0, fellBack: false };
    expect(scopeLine(short, 2, 1, 1)).toBe("The shortlist has 2 people. 1 can be emailed. 1 is on the do-not-contact list, so they are left out.");
    expect(scopeLine(named, 2, 2, 0)).toBe("You named 2 people. All 2 can be emailed.");
    expect(scopeLine(short, 3, 1, 2)).toBe("The shortlist has 3 people. 1 can be emailed. 2 are on the do-not-contact list, so they are left out.");
    expect(scopeLine(short, 2, 0, 2)).toBe("The shortlist has 2 people. All of them are on the do-not-contact list, so there is nothing to send.");
    expect(scopeLine(short, 1, 0, 1)).toBe("The shortlist has 1 person. They are on the do-not-contact list, so there is nothing to send.");
  });
});

describe("what a replaced note says about what replaced it", () => {
  const known = new Set(["new1"]);
  it("says it is replaced while the newer note is there", () => {
    expect(replacementOf({ supersededBy: "new1" }, known, new Set(), true)).toBe("present");
    expect(replacedWords("present")).toBe("Replaced by a newer note");
  });

  it("says the newer note was forgotten once it was, or is not in a complete list", () => {
    expect(replacementOf({ supersededBy: "new1" }, new Set(), new Set(["new1"]), false)).toBe("gone");
    expect(replacementOf({ supersededBy: "new2" }, known, new Set(), true)).toBe("gone");
    expect(replacedWords("gone")).toBe("Its newer note was forgotten");
  });

  it("does not guess when the list is only part of what there is", () => {
    expect(replacementOf({ supersededBy: "new2" }, known, new Set(), false)).toBe("unknown");
    expect(replacementOf({ supersededBy: null }, known, new Set(), true)).toBe("unknown");
    expect(replacedWords("unknown")).toBe("Replaced by a newer note");
  });
});

describe("the agent's lead-in to a card that has been answered", () => {
  const lead = "Got it. This is waiting for your approval, and once you confirm it the agency never emails on weekends.";
  const card = (decided: boolean) => ({ action: "remember", decided: decided ? { decision: "decline" as const, outcome: {} } : null });

  it("goes once the note's card is answered, because it says what the card used to be", () => {
    expect(settledLead(lead, [card(true)])).toBe("");
    expect(settledLead(lead, [card(false)])).toBe(lead);
  });

  it("keeps anything longer, or about something else", () => {
    const long = `${lead}\n\nAlso, three people replied overnight.`;
    expect(settledLead(long, [card(true)])).toBe(long);
    expect(settledLead("Here are the three best matches.", [card(true)])).toBe("Here are the three best matches.");
    expect(settledLead(lead, [])).toBe(lead);
  });
});

describe("a pointer at a card that has been answered", () => {
  const sent = (decided: boolean) => ({ action: "admin_note", decided: decided ? { decision: "approve" as const, outcome: {} } : null });

  it("goes with the waiting words, so only the result is left", () => {
    const lead = "Here's the note. Approve it below and your admins will see it in their notifications.";
    expect(settledLead(lead, [sent(true)])).toBe("");
    expect(settledLead(lead, [sent(false)])).toBe(lead);
  });

  it("keeps a pointer at something else", () => {
    expect(settledLead("Here are the three best matches.", [sent(true)])).toBe("Here are the three best matches.");
  });
});

describe("what the server says about an approval", () => {
  it("keeps the notes it sends, and none when it sends none", () => {
    const base: ChatState = {
      conversationId: "c1", owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
      turns: [{ ...newTurn("t1", "Email Priya tomorrow at 10", 0), runId: "r1", status: "working" }],
    };
    const ev = (seq: number, extra: Record<string, unknown>): RunEvent =>
      ({ ...extra, id: seq, runId: "r1", seq, type: "approval", at: "2026-10-10T10:00:00.000Z" }) as RunEvent;
    const withNote = applyEvent(base, ev(1, { action: { action: "schedule", items: [] }, summary: "x", notes: ["Gmail isn't connected, so this won't go out until you connect it in Settings."] }));
    expect(withNote.turns[0]?.approvals[0]?.notes).toEqual(["Gmail isn't connected, so this won't go out until you connect it in Settings."]);
    const without = applyEvent(base, ev(1, { action: { action: "schedule", items: [] }, summary: "x" }));
    expect(without.turns[0]?.approvals[0]?.notes).toEqual([]);
  });
});

describe("quick find", () => {
  it("reaches Calls, the workspace's and each campaign's, as the sidebar does", () => {
    const ids = buildEntries("Product Designer").map((e) => e.id);
    expect(ids).toContain("calls");
    expect(ids).toContain("campaign-calls");
    expect(ids).toContain("campaign-overview");
  });

  it("reaches the Settings pages (Members is on the Teams page now)", () => {
    expect(settingsPages(true).map((p) => p.id)).toEqual(["connections", "support"]);
    expect(settingsPages(false).map((p) => p.id)).toEqual(["connections", "support"]);
  });
});

describe("the Campaigns row", () => {
  const row = (over: Partial<CampaignRow>): CampaignRow => ({
    id: "c1", name: "Product Designer", department: "", location: "", status: "active", owner: "Me", team: ["Me"], ownerId: "u1", teamIds: ["u1"],
    visibility: "team", funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: [], target: 1, agents: [],
    updatedAgo: "", createdAgo: "", ...over,
  });
  const ready: PeopleState = { status: "ready", members: [] };
  const input = (campaigns: CampaignRow[], role: "admin" | "recruiter") => ({
    role, userId: "u1", connections: {
      status: "ready" as const, google: null, slack: null, notion: null, oauth: { slack: false, notion: false }, error: null, at: 0,
    },
    onRetryConnections: () => {}, campaigns, campaignsReady: true, people: ready, inOrg: false,
  });

  it("counts a campaign as active until it is closed: there is no draft to finish", () => {
    expect(workspaceRows(input([row({})], "admin")).find((r) => r.label === "Campaigns")?.value).toBe("1 active");
    expect(workspaceRows(input([row({ status: "active" })], "admin")).find((r) => r.label === "Campaigns")?.value).toBe("1 active");
    expect(workspaceRows(input([row({ status: "closed" })], "admin")).find((r) => r.label === "Campaigns")?.action).toMatchObject({ label: "Create a campaign" });
  });

  it("offers to create one when there is none, to an admin and to a recruiter, whose campaign is their own", () => {
    expect(workspaceRows(input([], "admin")).find((r) => r.label === "Campaigns")?.action).toMatchObject({ label: "Create a campaign" });
    expect(workspaceRows(input([], "recruiter")).find((r) => r.label === "Campaigns")?.action).toMatchObject({ label: "Create a campaign" });
  });
});

describe("what the activity page says about a run", () => {
  const detail = (events: RunDetail["events"], input: unknown = { text: "Post a summary of this week's hiring to the team channel" }): RunDetail => ({
    run: { conversationId: "conv-1", input }, events,
  });

  it("shows the first words of the question, cut at a word", () => {
    expect(questionOf(detail([]))).toBe("Post a summary of this week's hiring to the team channel");
    const long = "Which of the senior product designers we found last month are worth a second look now that the brief has changed twice?";
    const q = questionOf(detail([], { text: long })) ?? "";
    expect(q.endsWith("…")).toBe(true);
    expect(long.startsWith(q.slice(0, -1))).toBe(true);
    expect(q.length).toBeLessThanOrEqual(81);
    expect(questionOf(detail([], {}))).toBeNull();
    expect(conversationOf(detail([]))).toBe("conv-1");
    expect(clip("Short")).toBe("Short");
  });

  it("lists what was approved and what was done at once, and nothing for a declined card", () => {
    const events: RunDetail["events"] = [
      { type: "progress", seq: 1, payload: { step: "tool", tool: "list_campaigns", status: "done" } },
      { type: "approval", seq: 2, payload: { action: { action: "slack_message", channelName: "hiring", text: "Hi" }, people: [] } },
      { type: "result", seq: 3, payload: { approvalSeq: 2, decision: "approve", action: "slack_message" } },
      { type: "approval", seq: 4, payload: { action: { action: "schedule", items: [{ kind: "email", payload: {} }, { kind: "reminder", payload: {} }] }, people: [{ name: "Priya Nair" }] } },
      { type: "result", seq: 5, payload: { approvalSeq: 4, decision: "approve", action: "schedule", scheduled: [] } },
      { type: "approval", seq: 6, payload: { action: { action: "remember", text: "x", level: "org" }, people: [] } },
      { type: "result", seq: 7, payload: { approvalSeq: 6, decision: "decline", action: "remember" } },
      { type: "progress", seq: 8, payload: { step: "tool", tool: "create_task", status: "done" } },
    ];
    expect(didOf(detail(events))).toEqual(["Posted to #hiring", "Scheduled an email to Priya Nair", "Set a reminder", "Created a task"]);
    expect(didLine(didOf(detail(events)))).toBe("Posted to #hiring and 3 more things");
    expect(didLine(["Posted to #hiring", "Created a task"])).toBe("Posted to #hiring and 1 more thing");
    expect(didLine([])).toBeNull();
  });

  it("leads a row with what was done, then what was asked, and says where it opens", () => {
    const run = (over: Partial<RunSummary> = {}): RunSummary => ({
      id: "r1", skill: "chat", trigger: "chat", status: "done", campaignId: null, campaignName: null, createdAt: "2026-10-10T08:00:00Z",
      finishedAt: null, error: null, mine: true, ...over,
    });
    const words = { question: "Post a summary to the team channel", did: ["Posted to #hiring"], conversationId: "conv-1" };
    expect(rowOf(run(), words)).toEqual({
      title: "Posted to #hiring", asked: "You asked: “Post a summary to the team channel”", how: null, to: { kind: "chat", id: "conv-1" },
    });
    expect(rowOf(run(), { ...words, did: [] })).toMatchObject({ title: "“Post a summary to the team channel”", asked: null });
    expect(rowOf(run())).toMatchObject({ title: "Answered a question", to: null });
    expect(rowOf(run({ skill: "sourcing", campaignId: "c9", campaignName: "Data Engineer" }))).toMatchObject({
      title: "Searched for people for Data Engineer", to: { kind: "campaign", id: "c9" },
    });
    /* Only your own chat opens; a teammate's run is not yours to open. */
    expect(rowOf(run({ mine: false }), words).to).toBeNull();
  });

  it("reads what the server sends with the list, without asking for the run", () => {
    const r: RunSummary = {
      id: "r2", skill: "chat", trigger: "chat", status: "done", campaignId: null, campaignName: null, createdAt: "2026-10-10T08:00:00Z",
      finishedAt: null, error: null, mine: true, conversationId: "conv-2", question: "What needs my attention today?", did: [],
    };
    expect(rowOf(r)).toMatchObject({ title: "“What needs my attention today?”", to: { kind: "chat", id: "conv-2" } });
  });
});

describe("a task's day", () => {
  it("reads a date input as the end of that day, and nothing for what isn't a day", () => {
    const iso = endOfDate("2026-10-17");
    expect(iso).not.toBeNull();
    const d = new Date(iso ?? "");
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 17, 23, 59]);
    expect(endOfDate("2026-02-31")).toBeNull();
    expect(endOfDate("tomorrow")).toBeNull();
    expect(endOfDate("")).toBeNull();
  });

  it("gives the date input back for a due time, in the reader's own zone", () => {
    expect(dateInput(endOfDate("2026-10-17") ?? "")).toBe("2026-10-17");
    expect(dateInput("not a date")).toBe("");
  });

  it("puts tomorrow at the end of tomorrow", () => {
    const now = new Date(2026, 9, 10, 15, 0).getTime();
    const d = new Date(endOfDayAhead(1, now));
    expect([d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([10, 11, 23, 59]);
  });
});

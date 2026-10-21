import { describe, expect, it } from "vitest";
import type { RunEvent } from "../api/events";
import { channelName, isOutsideAction, outsideHead, outsideOutcome, outsidePreview } from "../chatCards";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";

/**
 * What an approval for a Slack message or a Notion note says. Nothing goes out until the
 * recruiter approves, so the card has to show exactly what would be posted and where; the
 * server's own words are the shapes asserted here (modules/agent/actions.ts).
 */

const slack = { action: "slack_message", channel: "C0HIRING01", channelName: "hiring", text: "Priya and Rohan both said yes to Thursday." };
const notion = {
  action: "notion_note", title: "Senior Android shortlist", body: "Three strong profiles.\n\nAsha leads on Compose.",
  parentId: "p1", parentType: "page", parentTitle: "Hiring wiki",
};

describe("the card's heading", () => {
  it("names the channel a message will go to, and says Slack when it can't", () => {
    expect(outsideHead("slack_message", slack)).toEqual({ label: "Post to #hiring", service: "slack" });
    expect(outsideHead("slack_message", { ...slack, channelName: undefined, channel: "#general" }).label).toBe("Post to #general");
    expect(outsideHead("slack_message", { ...slack, channelName: undefined, channel: "C0HIRING01" }).label).toBe("Post to Slack");
    expect(outsideHead("slack_message", { text: "x" }).label).toBe("Post to Slack");
  });

  it("says what a note is and where it will be filed", () => {
    expect(outsideHead("notion_note", notion)).toEqual({ label: "Add a note in Notion", service: "notion" });
  });

  it("reads a channel however the server names it, and never shows an id as a name", () => {
    expect(channelName("#hiring")).toBe("#hiring");
    expect(channelName("hiring")).toBe("#hiring");
    expect(channelName({ id: "C1", name: "hiring" })).toBe("#hiring");
    expect(channelName("C0HIRING01")).toBeNull();
    expect(channelName(undefined)).toBeNull();
    expect(channelName("")).toBeNull();
  });

  it("recognises exactly the two kinds", () => {
    expect(isOutsideAction("slack_message")).toBe(true);
    expect(isOutsideAction("notion_note")).toBe(true);
    for (const other of ["shortlist", "move", "find_people", "start_watch", ""]) expect(isOutsideAction(other)).toBe(false);
  });
});

describe("the preview", () => {
  it("shows the message as it will be posted", () => {
    expect(outsidePreview("slack_message", slack)).toEqual({ title: null, body: "Priya and Rohan both said yes to Thursday.", where: null });
  });

  it("shows a note's title, its text and the page or database it goes in", () => {
    expect(outsidePreview("notion_note", notion)).toEqual({
      title: "Senior Android shortlist", body: "Three strong profiles.\n\nAsha leads on Compose.", where: "Hiring wiki",
    });
    expect(outsidePreview("notion_note", { ...notion, parentType: "database" })?.where).toBe("Hiring wiki (database)");
    expect(outsidePreview("notion_note", { ...notion, parentTitle: undefined })?.where).toBeNull();
  });

  it("has nothing to show when the server sent no text, so the summary stays", () => {
    expect(outsidePreview("slack_message", { action: "slack_message" })).toBeNull();
    expect(outsidePreview("notion_note", { action: "notion_note" })).toBeNull();
  });

  it("cuts a very long message rather than let it fill the page", () => {
    const long = outsidePreview("slack_message", { text: "word ".repeat(600) });
    expect(long?.body.length).toBeLessThanOrEqual(1201);
    expect(long?.body.endsWith("…")).toBe(true);
  });
});

describe("what approving did", () => {
  it("says where a message went", () => {
    expect(outsideOutcome("slack_message", slack, { provider: "slack", posted: true, channel: "#hiring", ts: "1" })).toEqual({ text: "Posted in #hiring.", link: null });
    expect(outsideOutcome("slack_message", slack, {}).text).toBe("Posted in #hiring.");
    expect(outsideOutcome("slack_message", { text: "x" }, {}).text).toBe("Posted in Slack.");
  });

  it("links to the page that was made, and only to a real web address", () => {
    expect(outsideOutcome("notion_note", notion, { created: true, url: "https://www.notion.so/abc" })).toEqual({
      text: "Saved “Senior Android shortlist” to Notion.", link: { href: "https://www.notion.so/abc", label: "Open in Notion" },
    });
    // A note with no title in what was approved still says it was added.
    expect(outsideOutcome("notion_note", { action: "notion_note" }, {}).text).toBe("Added to Notion.");
    expect(outsideOutcome("notion_note", notion, { url: "javascript:alert(1)" }).link).toBeNull();
    expect(outsideOutcome("notion_note", notion, { url: "http://insecure.example" }).link).toBeNull();
    expect(outsideOutcome("notion_note", notion, {}).link).toBeNull();
  });
});

describe("the approval as the chat holds it", () => {
  let n = 0;
  const ev = (type: RunEvent["type"], payload: Record<string, unknown>): RunEvent => ({ ...payload, id: ++n, runId: "r1", seq: n, type, at: "2026-10-10T10:00:00.000Z" });
  const chat = (): ChatState => ({
    conversationId: "c1", turns: [{ ...newTurn("t1", "Tell the team"), runId: "r1", status: "working" }],
    owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
  });

  it("keeps what is being asked, so the card can show it", () => {
    const s = applyEvent(chat(), ev("approval", { action: slack, summary: 'Post to #hiring on Slack: "…"', campaignName: null, people: [] }));
    expect(s.turns[0]?.approvals[0]).toMatchObject({ action: "slack_message", detail: slack, campaignId: null, decided: null });
  });

  it("settles on the outcome the service reported", () => {
    let s = applyEvent(chat(), ev("approval", { action: notion, summary: "…", campaignName: null, people: [] }));
    const seq = s.turns[0]?.approvals[0]?.seq;
    s = applyEvent(s, ev("result", { approvalSeq: seq, decision: "approve", provider: "notion", created: true, url: "https://www.notion.so/x" }));
    const a = s.turns[0]?.approvals[0];
    expect(a?.decided?.decision).toBe("approve");
    expect(outsideOutcome("notion_note", a?.detail ?? {}, a?.decided?.outcome ?? {}).link?.label).toBe("Open in Notion");
  });

  it("still handles the actions it already knew", () => {
    const s = applyEvent(chat(), ev("approval", { action: { action: "find_people", campaignId: "cmp" }, summary: "Find more", campaignName: "Android", people: [] }));
    expect(s.turns[0]?.approvals[0]).toMatchObject({ action: "find_people", campaignId: "cmp", detail: { action: "find_people", campaignId: "cmp" } });
  });
});

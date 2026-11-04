import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DailyRead, DailySearch, DailyWatch } from "../api/dailySearch";
import type { RailChat } from "../chatGroups";
import { dailyChatOf, dailyLine, nextLabel } from "../railDailyView";

/* 30 October 2026, 04:00 UTC = 09:30 in Kolkata. */
const NOW = Date.parse("2026-10-30T04:00:00Z");
const IST = "Asia/Kolkata";

const watch = (campaignId: string, over: Partial<DailyWatch> = {}): DailyWatch => ({
  agentId: `agent-${campaignId}`, campaignId, name: `Campaign ${campaignId}`, state: "running", reason: null, found: 20, lastFound: 5, today: 0,
  nextRunAt: "2026-10-31T01:30:00Z", ...over,
});
const search = (campaigns: DailyWatch[], over: Partial<DailySearch> = {}): DailySearch => ({
  id: "s1", status: "on", scope: { all: true, except: [] }, runAt: "07:00", timezone: IST, repeat: "daily", perCampaign: 5, reserve: 10, waitingCap: 40,
  maxCampaigns: 20, pausedUntil: null, campaigns, ...over,
});
const read = (s: DailySearch | null, on = true): DailyRead => ({ on, search: s });

describe("when the next morning is", () => {
  it("says today, tomorrow or the weekday, with the clock in the search's own time zone", () => {
    expect(nextLabel("2026-10-30T07:00:00Z", IST, NOW)).toBe("today 12:30");
    expect(nextLabel("2026-10-31T01:30:00Z", IST, NOW)).toBe("tomorrow 07:00");
    expect(nextLabel("2026-11-02T01:30:00Z", IST, NOW)).toBe("Mon 07:00");
    // Late evening in UTC is already tomorrow in Kolkata.
    expect(nextLabel("2026-10-30T20:00:00Z", IST, NOW)).toBe("tomorrow 01:30");
  });
  it("says nothing without a time, and does not fail on a time zone it does not know", () => {
    expect(nextLabel(null, IST, NOW)).toBe("");
    expect(nextLabel("not a time", IST, NOW)).toBe("");
    expect(nextLabel("2026-10-31T01:30:00Z", "Mars/Olympus", NOW)).toBe("tomorrow 07:00");
  });
});

describe("the daily sourcing line", () => {
  const campaign = { id: "A" };

  it("is not drawn while the server has the daily search off, or before it has answered", () => {
    expect(dailyLine(null, campaign, NOW)).toBeNull();
    expect(dailyLine(read(search([watch("A")]), false), campaign, NOW)).toBeNull();
    expect(dailyLine(read(search([watch("A")]), false), null, NOW)).toBeNull();
  });

  it("says how many the search found for the campaign today, and a press goes to the campaign's daily search chat", () => {
    expect(dailyLine(read(search([watch("A", { today: 5 }), watch("B", { today: 9 })])), campaign, NOW)).toEqual({
      state: "On", today: 5, value: "5 sourced today", detail: "Next search tomorrow 07:00", goes: "chat",
    });
  });

  it("says none yet, and when the next morning is, when the search has found nobody for it today", () => {
    expect(dailyLine(read(search([watch("A", { today: 0 })])), campaign, NOW)).toMatchObject({ state: "On", today: 0, value: "none yet today", detail: "Next search tomorrow 07:00" });
    // A server older than the line sends no count: it is none, not a gap.
    expect(dailyLine(read(search([watch("A", { today: undefined })])), campaign, NOW)).toMatchObject({ today: 0 });
  });

  it("says Paused for a paused search or campaign, and Resting, with the reason, for one that is on but stepping back", () => {
    expect(dailyLine(read(search([watch("A", { today: 2 })], { status: "paused" })), campaign, NOW)).toMatchObject({ state: "Paused", today: 2, value: "Paused · 2 sourced today", goes: "chat" });
    expect(dailyLine(read(search([watch("A", { state: "paused", today: 0 })])), campaign, NOW)).toMatchObject({ state: "Paused", value: "Paused · none yet today" });
    expect(dailyLine(read(search([watch("A", { reason: "The waiting list is full" })])), campaign, NOW)).toMatchObject({
      state: "Resting", value: "Resting · none yet today", detail: "The waiting list is full",
    });
  });

  it("says Off, and offers to turn it on, for a campaign the search does not hold, with no number, and a press opens the daily search", () => {
    expect(dailyLine(read(search([watch("B", { today: 4 })])), campaign, NOW)).toEqual({
      state: "Off", today: null, value: "Off for this campaign", detail: "Add this campaign to the daily search", goes: "dialog",
    });
  });

  it("says Off for a person with no search, or one that is off, and a press opens the daily search", () => {
    for (const none of [read(null), read(search([], { status: "off" }))]) {
      for (const c of [campaign, null]) {
        expect(dailyLine(none, c, NOW)).toEqual({ state: "Off", today: null, value: "Off · turn on", detail: "Turn the daily search on", goes: "dialog" });
      }
    }
  });

  it("adds up the day for all campaigns, names how many there are, and a press opens the daily search", () => {
    const all = search([watch("A", { today: 5 }), watch("B", { today: 7 }), watch("C", { today: 0 })]);
    expect(dailyLine(read(all), null, NOW)).toEqual({ state: "On", today: 12, value: "12 today · 3 campaigns", detail: "Next search tomorrow 07:00", goes: "dialog" });
    expect(dailyLine(read(search([watch("A", { today: 0 })])), null, NOW)).toMatchObject({ today: 0, value: "none today · 1 campaign" });
    expect(dailyLine(read({ ...all, status: "paused" }), null, NOW)).toMatchObject({ state: "Paused", value: "Paused · 12 today · 3 campaigns", detail: "Open the daily search" });
  });

  it("names the soonest morning among the campaigns, not the first listed", () => {
    const all = search([watch("A", { nextRunAt: "2026-11-02T01:30:00Z" }), watch("B", { nextRunAt: "2026-10-31T01:30:00Z" })]);
    expect(dailyLine(read(all), null, NOW)?.detail).toBe("Next search tomorrow 07:00");
  });
});

describe("the campaign's daily search chat", () => {
  const chat = (id: string, over: Partial<RailChat> = {}): RailChat => ({ id, title: "Chat", campaignId: null, campaignName: "", at: 0, last: null, ...over });
  it("is the campaign's own, not another campaign's, not an ordinary chat of the campaign, and none when there is none", () => {
    const chats = [chat("1", { campaignId: "A" }), chat("2", { campaignId: "B", daily: true }), chat("3", { campaignId: "A", daily: true })];
    expect(dailyChatOf(chats, "A")?.id).toBe("3");
    expect(dailyChatOf(chats, "C")).toBeNull();
    expect(dailyChatOf(undefined, "A")).toBeNull();
  });
});

describe("the line on the page", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
  it("is drawn in the top of the list for the campaign the chat is about, reads again when something moves, and opens the chat or the daily search", () => {
    const page = read("Agent.tsx");
    expect(page).toContain("daily={<RailDaily campaign={chatCampaign ? { id: chatCampaign.id, name: chatCampaign.name } : null} chats={railList} refresh={weekAsk + live.turns.length} onOpenChat={openRailChat} />}");
    const line = read("RailDaily.tsx");
    expect(line).toContain("const press = () => (chat ? onOpenChat(chat) : setDialog(true));");
    expect(line).toContain("dailySearchApi\n      .glance()");
    // Back from another tab it reads again: a morning may have run.
    expect(line).toContain('document.addEventListener("visibilitychange", back)');
  });
  it("reads the quick endpoint, not the dialog's heavy one", () => {
    expect(read("api/dailySearch.ts")).toContain('glance: () => api<DailyRead>("GET", "/v1/daily-search")');
  });
  it("shows today's figures, from one day, with the contacted one only when the server sends it", () => {
    const page = read("Agent.tsx");
    expect(page).toContain("homeOverview(1, weekKey");
    expect(page).toContain('...(h.contacted ? [{ id: "contacted", label: "Contacted"');
  });
});

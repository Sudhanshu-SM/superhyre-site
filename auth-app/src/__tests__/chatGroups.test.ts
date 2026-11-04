import { describe, expect, it } from "vitest";
import { NESTED_SHOWN, RECENTS_BATCH, agoLabel, arrangeRail, railChatOf, searchChats, type RailChat } from "../chatGroups";
import { pinKey } from "../chatPins";

const chat = (id: string, over: Partial<RailChat> = {}): RailChat => ({
  id, title: `Chat ${id}`, campaignId: null, campaignName: "", at: 0, last: null, ...over,
});
const campaigns = [{ id: "A", name: "Senior Data Scientist" }, { id: "B", name: "Frontend Engineer" }];

describe("arranging the chat list: pinned, then one list of recents", () => {
  const chats = [
    chat("a1", { campaignId: "A", campaignName: "Senior Data Scientist", at: 300 }),
    chat("a2", { campaignId: "A", campaignName: "Senior Data Scientist", at: 100 }),
    chat("b1", { campaignId: "B", campaignName: "Frontend Engineer", at: 500 }),
    chat("g1", { at: 400 }),
    chat("g2", { at: 50 }),
  ];
  /** A row as "campaign:A" or the chat's id. */
  const keys = (list: ReadonlyArray<{ kind: string; id?: string; chat?: { id: string } }>) => list.map((r) => (r.kind === "campaign" ? `campaign:${r.id}` : r.chat?.id));

  it("shows a chat about a campaign as the campaign, once, and a chat about none as itself, all newest first", () => {
    const { pinned, recents } = arrangeRail(chats, [], campaigns);
    expect(pinned).toEqual([]);
    // Frontend (its chat at 500), the plain chat at 400, Senior Data Scientist (latest at 300, its other chat is not a row), the plain chat at 50.
    expect(keys(recents)).toEqual(["campaign:B", "g1", "campaign:A", "g2"]);
    expect(recents.map((r) => r.at)).toEqual([500, 400, 300, 50]);
  });

  it("says, for a campaign, how many chats it has and which of the person's own a pick opens", () => {
    const { recents } = arrangeRail(chats, [], campaigns);
    const a = recents.find((r) => r.kind === "campaign" && r.id === "A");
    expect(a).toMatchObject({ kind: "campaign", name: "Senior Data Scientist", chats: 2 });
    expect(a?.kind === "campaign" && a.latest?.id).toBe("a1");
  });

  it("lifts a pinned chat out of recents, and puts the most recently written pin first, not the latest pressed", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("chat", "g2"), pinKey("chat", "b1")], campaigns);
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["b1", "g2"]);
    // b1 is pinned on its own, but it still makes its campaign recent: Frontend stays in the list at 500.
    expect(keys(recents)).toEqual(["campaign:B", "g1", "campaign:A"]);
  });

  it("orders pinned campaigns by their latest chat, and one with no chats yet goes last in the order it was pinned", () => {
    const camps = [...campaigns, { id: "C", name: "Quiet" }, { id: "D", name: "Quieter" }];
    const { pinned } = arrangeRail(chats, [pinKey("campaign", "D"), pinKey("campaign", "A"), pinKey("campaign", "C"), pinKey("campaign", "B")], camps);
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["B", "A", "D", "C"]);
  });

  it("counts a campaign's chat that is pinned on its own as the campaign's activity", () => {
    const { pinned } = arrangeRail(chats, [pinKey("campaign", "A"), pinKey("campaign", "B"), pinKey("chat", "b1")], campaigns);
    // b1 (500) is B's latest and stays pinned on its own, so B is as recent as it (ties keep the order pinned), ahead of A (300).
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["B", "b1", "A"]);
  });

  it("puts a pinned campaign's chats under it, newest first, and leaves the campaign out of recents", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("campaign", "A")], campaigns);
    expect(pinned).toHaveLength(1);
    const block = pinned[0]!;
    expect(block.kind).toBe("campaign");
    if (block.kind === "campaign") {
      expect(block.name).toBe("Senior Data Scientist");
      expect(block.chats.map((c) => c.id)).toEqual(["a1", "a2"]);
    }
    // It is shown above with its chats: recents does not say it a second time.
    expect(keys(recents)).toEqual(["campaign:B", "g1", "g2"]);
  });

  it("keeps a chat pinned on its own out of its pinned campaign and out of recents", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("campaign", "A"), pinKey("chat", "a1"), pinKey("chat", "g1")], campaigns);
    const camp = pinned.find((p) => p.kind === "campaign");
    expect(camp?.kind === "campaign" && camp.chats.map((c) => c.id)).toEqual(["a2"]);
    expect(pinned.some((p) => p.kind === "chat" && p.chat.id === "a1")).toBe(true);
    expect(keys(recents)).toEqual(["campaign:B", "g2"]);
  });

  it("shows the selected campaign with its chats, whether or not it has been pinned, and not again in recents", () => {
    const sel = { id: "A", name: "Senior Data Scientist" };
    const unpinned = arrangeRail(chats, [], campaigns, sel);
    expect(unpinned.selected?.name).toBe("Senior Data Scientist");
    expect(unpinned.selected?.chats.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(keys(unpinned.recents)).toEqual(["campaign:B", "g1", "g2"]);
    // Pinned, it is in Pinned already and not drawn a second time.
    expect(arrangeRail(chats, [pinKey("campaign", "A")], campaigns, sel).selected).toBeNull();
    // A campaign with no chats of the person's is still shown, empty; nothing selected shows nothing.
    expect(arrangeRail(chats, [], campaigns, { id: "Z", name: "Sales Manager" }).selected).toMatchObject({ name: "Sales Manager", chats: [] });
    expect(arrangeRail(chats, [], campaigns).selected).toBeNull();
  });

  it("leaves a chat pinned on its own out of the selected campaign's list", () => {
    const { selected } = arrangeRail(chats, [pinKey("chat", "a1")], campaigns, { id: "A", name: "Senior Data Scientist" });
    expect(selected?.chats.map((c) => c.id)).toEqual(["a2"]);
  });

  it("leaves out a pin whose chat or campaign has gone", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("chat", "gone"), pinKey("campaign", "closed-one")], campaigns);
    expect(pinned).toEqual([]);
    expect(recents).toHaveLength(4);
  });

  it("shows a pinned campaign even before it has a chat, so there is a place to start one", () => {
    const { pinned } = arrangeRail([], [pinKey("campaign", "B")], campaigns);
    expect(pinned).toEqual([{ kind: "campaign", id: "B", name: "Frontend Engineer", chats: [] }]);
  });

  it("is empty-safe", () => {
    expect(arrangeRail([], [], [])).toEqual({ selected: null, pinned: [], recents: [] });
  });

  it("states how many show at first and how many more each press brings", () => {
    expect(RECENTS_BATCH).toBeGreaterThanOrEqual(8);
    expect(NESTED_SHOWN).toBeGreaterThanOrEqual(3);
  });
});

describe("the campaigns among the recents", () => {
  const A = { campaignId: "A", campaignName: "Senior Data Scientist" };
  const camps = [...campaigns, { id: "C", name: "Quiet" }, { id: "D", name: "Quieter" }];
  const rows = (list: ReadonlyArray<{ kind: string; id?: string; chat?: { id: string } }>) => list.map((r) => (r.kind === "campaign" ? `campaign:${r.id}` : r.chat?.id));

  it("leaves out a campaign nobody has chatted in (the Campaigns page lists them all), and one only the agent has written in", () => {
    const chats = [
      chat("a1", { ...A, at: 300 }),
      chat("b1", { campaignId: "B", campaignName: "Frontend Engineer", at: 500 }),
      chat("c-daily", { campaignId: "C", campaignName: "Quiet", at: 999, daily: true, title: "Daily search" }),
    ];
    const { recents } = arrangeRail(chats, [], camps);
    // C has a chat, but it is the agent's: C is as quiet as D, and neither is a row.
    expect(rows(recents)).toEqual(["campaign:B", "campaign:A"]);
  });

  it("carries the person's own latest chat for a pick to open: not the daily search's, not a colleague's", () => {
    const chats = [
      chat("a-theirs", { ...A, at: 900, ownerName: "Ravi Iyer" }),
      chat("a-daily", { ...A, at: 800, daily: true, title: "Daily search" }),
      chat("a-mine", { ...A, at: 300 }),
      chat("a-old", { ...A, at: 100 }),
    ];
    const [row] = arrangeRail(chats, [], [{ id: "A", name: "Senior Data Scientist" }]).recents;
    // The campaign is as recent as the colleague's chat, and a pick opens the person's own.
    expect(row).toMatchObject({ kind: "campaign", id: "A", name: "Senior Data Scientist", at: 900, chats: 4 });
    expect(row?.kind === "campaign" && row.latest?.id).toBe("a-mine");
  });

  it("has nothing to open for a campaign whose only chats are a colleague's, so a pick starts one", () => {
    const chats = [chat("a-theirs", { ...A, at: 900, ownerName: "Ravi Iyer" }), chat("a-daily", { ...A, at: 800, daily: true })];
    const row = arrangeRail(chats, [], campaigns).recents.find((r) => r.kind === "campaign" && r.id === "A");
    expect(row?.kind === "campaign" && row.latest).toBeNull();
  });

  it("keeps the chats of a campaign that is no longer running as chats of their own, and leaves a daily search chat out", () => {
    const chats = [
      chat("old", { campaignId: "gone", campaignName: "Closed One", at: 40 }),
      chat("old-daily", { campaignId: "gone", campaignName: "Closed One", at: 60, daily: true }),
      chat("g", { at: 10 }),
    ];
    expect(rows(arrangeRail(chats, [], campaigns).recents)).toEqual(["old", "g"]);
  });

  it("puts a campaign and a plain chat written at the same moment in a steady order, the campaign first", () => {
    const chats = [chat("g", { at: 300 }), chat("a1", { ...A, at: 300 })];
    expect(rows(arrangeRail(chats, [], campaigns).recents)).toEqual(["campaign:A", "g"]);
  });
});

describe("a campaign's daily search chat in the list", () => {
  const A = { campaignId: "A", campaignName: "Senior Data Scientist" };
  const chats = [
    chat("a-new", { ...A, at: 500 }),
    chat("a-daily", { ...A, at: 100, daily: true, title: "Daily search" }),
    chat("a-mid", { ...A, at: 300 }),
    chat("b-new", { campaignId: "B", campaignName: "Frontend Engineer", at: 400 }),
    chat("b-daily", { campaignId: "B", campaignName: "Frontend Engineer", at: 50, daily: true, title: "Daily search" }),
    chat("b-old", { campaignId: "B", campaignName: "Frontend Engineer", at: 20 }),
  ];

  it("is the first of the selected campaign's chats whatever the times, and the others stay newest first", () => {
    const { selected } = arrangeRail(chats, [], campaigns, { id: "A", name: "Senior Data Scientist" });
    expect(selected?.chats.map((c) => c.id)).toEqual(["a-daily", "a-new", "a-mid"]);
  });

  it("is the first of a pinned campaign's chats whatever the times, and the others stay newest first", () => {
    const { pinned } = arrangeRail(chats, [pinKey("campaign", "B")], campaigns);
    const block = pinned[0]!;
    expect(block.kind === "campaign" && block.chats.map((c) => c.id)).toEqual(["b-daily", "b-new", "b-old"]);
  });

  it("is still first, and counted among them, when the campaign has more chats than are shown under it (the rail shows the first NESTED_SHOWN)", () => {
    const many = Array.from({ length: NESTED_SHOWN + 3 }, (_, i) => chat(`n${i}`, { ...A, at: 1000 + i }));
    const { selected } = arrangeRail([...many, chats[1]!], [], campaigns, { id: "A", name: "Senior Data Scientist" });
    expect(selected?.chats[0]?.id).toBe("a-daily");
    expect(selected?.chats).toHaveLength(NESTED_SHOWN + 4);
    // The newest of the others follow it, so the rail's cut falls on the oldest, as it does without a daily chat.
    expect(selected?.chats.slice(1, NESTED_SHOWN).map((c) => c.id)).toEqual([...many].reverse().slice(0, NESTED_SHOWN - 1).map((c) => c.id));
  });

  it("is shown where it was pinned when it is pinned on its own, and not repeated under its campaign", () => {
    const { selected, pinned } = arrangeRail(chats, [pinKey("chat", "a-daily")], campaigns, { id: "A", name: "Senior Data Scientist" });
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["a-daily"]);
    expect(selected?.chats.map((c) => c.id)).toEqual(["a-new", "a-mid"]);
  });

  it("does not lift its campaign among the pinned ones: the agent writes in it every morning, and that is not the person's attention", () => {
    const morning = [
      chat("a1", { ...A, at: 100 }),
      chat("a-daily", { ...A, at: 900, daily: true, title: "Daily search" }),
      chat("b1", { campaignId: "B", campaignName: "Frontend Engineer", at: 500 }),
    ];
    const { pinned } = arrangeRail(morning, [pinKey("campaign", "A"), pinKey("campaign", "B")], campaigns);
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["B", "A"]);
    // (without its daily chat the order is the same: it is the person's own chats that order them)
    const { pinned: without } = arrangeRail(morning.filter((c) => !c.daily), [pinKey("campaign", "A"), pinKey("campaign", "B")], campaigns);
    expect(without.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["B", "A"]);
  });

  it("leaves a campaign that has only a daily chat last among the pinned, in the order it was pinned", () => {
    const only = [chat("a-daily", { ...A, at: 900, daily: true, title: "Daily search" }), chat("b1", { campaignId: "B", campaignName: "Frontend Engineer", at: 5 })];
    const { pinned } = arrangeRail(only, [pinKey("campaign", "A"), pinKey("campaign", "B")], campaigns);
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["B", "A"]);
  });

  it("is not a row of its own in recents (its campaign is), and a search finds it by its campaign", () => {
    const { recents } = arrangeRail(chats, [], campaigns);
    // The campaigns are ordered by the person's chats: A's newest is 500, B's 400, and the morning chats at 100 and 50 do not move them.
    expect(recents.map((r) => (r.kind === "campaign" ? r.id : r.chat.id))).toEqual(["A", "B"]);
    expect(searchChats(chats, "frontend").map((c) => c.id)).toContain("b-daily");
  });

  it("is a chat of the person's own that the server calls daily_search, and nobody else's, from the row the server sends", () => {
    const row = { id: "c1", title: "Daily search", focusCampaignId: "A", focusCampaignName: "Senior Data Scientist", updatedAt: "2026-10-30T07:00:00.000Z", lastMessage: "5 new people" };
    expect(railChatOf({ ...row, kind: "daily_search" }, "Daily search")).toMatchObject({
      id: "c1", title: "Daily search", campaignId: "A", campaignName: "Senior Data Scientist", at: Date.parse(row.updatedAt), last: "5 new people", daily: true,
    });
    // An ordinary chat, a server that sends no kind, and a colleague's daily chat (read like any chat of theirs) are not drawn as one.
    expect(railChatOf({ ...row, kind: null }, "A chat")).not.toHaveProperty("daily");
    expect(railChatOf(row, "A chat")).not.toHaveProperty("daily");
    const theirs = railChatOf({ ...row, kind: "daily_search", ownerName: "Ravi Iyer" }, "Daily search");
    expect(theirs).not.toHaveProperty("daily");
    expect(theirs.ownerName).toBe("Ravi Iyer");
  });
});

describe("searching the history", () => {
  const chats = [
    chat("1", { title: "Find people in Pune", campaignName: "Technical Consultant", at: 2 }),
    chat("2", { title: "Requirements", campaignName: "Frontend Engineer", last: "make it remote", at: 1 }),
  ];
  it("matches a title, a campaign name or what was last said, newest first", () => {
    expect(searchChats(chats, "pune").map((c) => c.id)).toEqual(["1"]);
    expect(searchChats(chats, "frontend").map((c) => c.id)).toEqual(["2"]);
    expect(searchChats(chats, "REMOTE").map((c) => c.id)).toEqual(["2"]);
    expect(searchChats(chats, "  ")).toEqual([]);
  });
});

describe("how long ago", () => {
  it("reads minutes, hours, yesterday, days and weeks", () => {
    const now = 1_000_000_000;
    expect(agoLabel(now - 5 * 60_000, now)).toBe("5m");
    expect(agoLabel(now - 3 * 3_600_000, now)).toBe("3h");
    expect(agoLabel(now - 30 * 3_600_000, now)).toBe("Yesterday");
    expect(agoLabel(now - 4 * 86_400_000, now)).toBe("4d");
    expect(agoLabel(now - 15 * 86_400_000, now)).toBe("2w");
  });
});

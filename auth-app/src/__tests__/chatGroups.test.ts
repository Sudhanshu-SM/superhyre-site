import { describe, expect, it } from "vitest";
import { NESTED_SHOWN, RECENTS_BATCH, agoLabel, arrangeRail, railChatOf, searchChats, type RailChat } from "../chatGroups";
import { pinKey } from "../chatPins";

const chat = (id: string, over: Partial<RailChat> = {}): RailChat => ({
  id, title: `Chat ${id}`, campaignId: null, campaignName: "", at: 0, last: null, ...over,
});
const campaigns = [{ id: "A", name: "Senior Data Scientist" }, { id: "B", name: "Frontend Engineer" }];

describe("arranging the chat list: pinned, then recents", () => {
  const chats = [
    chat("a1", { campaignId: "A", campaignName: "Senior Data Scientist", at: 300 }),
    chat("a2", { campaignId: "A", campaignName: "Senior Data Scientist", at: 100 }),
    chat("b1", { campaignId: "B", campaignName: "Frontend Engineer", at: 500 }),
    chat("g1", { at: 400 }),
    chat("g2", { at: 50 }),
  ];

  it("is all recents, newest first, when nothing is pinned", () => {
    const { pinned, recents } = arrangeRail(chats, [], campaigns);
    expect(pinned).toEqual([]);
    expect(recents.map((c) => c.id)).toEqual(["b1", "g1", "a1", "a2", "g2"]);
  });

  it("lifts a pinned chat out of recents, and puts the most recently written pin first, not the latest pressed", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("chat", "g2"), pinKey("chat", "b1")], campaigns);
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["b1", "g2"]);
    expect(recents.map((c) => c.id)).toEqual(["g1", "a1", "a2"]);
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

  it("puts a pinned campaign's chats under it, newest first, and keeps them in recents too", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("campaign", "A")], campaigns);
    expect(pinned).toHaveLength(1);
    const block = pinned[0]!;
    expect(block.kind).toBe("campaign");
    if (block.kind === "campaign") {
      expect(block.name).toBe("Senior Data Scientist");
      expect(block.chats.map((c) => c.id)).toEqual(["a1", "a2"]);
    }
    // Recents is the whole history: a campaign folded shut must not hide its chats from it.
    expect(recents.map((c) => c.id)).toEqual(["b1", "g1", "a1", "a2", "g2"]);
  });

  it("keeps a chat pinned on its own out of its pinned campaign and out of recents", () => {
    const { pinned, recents } = arrangeRail(chats, [pinKey("campaign", "A"), pinKey("chat", "a1")], campaigns);
    const camp = pinned.find((p) => p.kind === "campaign");
    expect(camp?.kind === "campaign" && camp.chats.map((c) => c.id)).toEqual(["a2"]);
    expect(pinned.some((p) => p.kind === "chat" && p.chat.id === "a1")).toBe(true);
    expect(recents.map((c) => c.id)).toEqual(["b1", "g1", "a2", "g2"]);
  });

  it("shows the selected campaign with its chats, whether or not it has been pinned", () => {
    const sel = { id: "A", name: "Senior Data Scientist" };
    const unpinned = arrangeRail(chats, [], campaigns, sel);
    expect(unpinned.selected?.name).toBe("Senior Data Scientist");
    expect(unpinned.selected?.chats.map((c) => c.id)).toEqual(["a1", "a2"]);
    // They are in Recents as well, along with the chats of no campaign.
    expect(unpinned.recents.map((c) => c.id)).toEqual(["b1", "g1", "a1", "a2", "g2"]);
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
    expect(recents).toHaveLength(5);
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

  it("is shown where it was pinned when it is pinned on its own, and not repeated under its campaign or in Recents", () => {
    const { selected, pinned, recents } = arrangeRail(chats, [pinKey("chat", "a-daily")], campaigns, { id: "A", name: "Senior Data Scientist" });
    expect(pinned.map((p) => (p.kind === "chat" ? p.chat.id : p.id))).toEqual(["a-daily"]);
    expect(selected?.chats.map((c) => c.id)).toEqual(["a-new", "a-mid"]);
    expect(recents.map((c) => c.id)).not.toContain("a-daily");
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

  it("stays in Recents, where every chat is, in its place by time, and a search finds it by its campaign", () => {
    const { recents } = arrangeRail(chats, [], campaigns, { id: "A", name: "Senior Data Scientist" });
    expect(recents.map((c) => c.id)).toEqual(["a-new", "b-new", "a-mid", "a-daily", "b-daily", "b-old"]);
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

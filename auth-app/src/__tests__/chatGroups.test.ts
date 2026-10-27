import { describe, expect, it } from "vitest";
import { NESTED_SHOWN, RECENTS_BATCH, agoLabel, arrangeRail, searchChats, type RailChat } from "../chatGroups";
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

describe("searching the history", () => {
  const chats = [
    chat("1", { title: "Find people in Pune", campaignName: "Technical Consultant", at: 2 }),
    chat("2", { title: "Role spec", campaignName: "Frontend Engineer", last: "make it remote", at: 1 }),
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

/**
 * The chat history as a person scans it: what they pinned at the top (chats, and campaigns with their own chats under
 * them), then everything else, most recent first. A chat is in exactly one place, so nothing is listed twice and nothing
 * goes missing: one that sits under a pinned campaign is not also in Recents.
 */

import { pinKey, type Pins } from "./chatPins";

export type RailChat = {
  id: string;
  title: string;
  campaignId: string | null;
  campaignName: string;
  /** Epoch ms of the last message. */
  at: number;
  /** The last thing the person said, for search. */
  last: string | null;
};

export type PinnedCampaign = { kind: "campaign"; id: string; name: string; chats: readonly RailChat[] };
export type PinnedChat = { kind: "chat"; chat: RailChat };
export type PinnedItem = PinnedCampaign | PinnedChat;

export type Arranged = { pinned: readonly PinnedItem[]; recents: readonly RailChat[] };

/** How many Recents show at first, and how many more each "View more" brings. */
export const RECENTS_BATCH = 12;
/** How many of a pinned campaign's chats show under it before "N more". */
export const NESTED_SHOWN = 4;

/**
 * What is pinned is ordered by how alive it is: the pinned chat or campaign written to most recently is first (a campaign is
 * as recent as its latest chat, in or out of Pinned), and ones with nothing to go on keep the order they were pinned in.
 */
export function arrangeRail(
  chats: readonly RailChat[],
  pins: Pins,
  campaigns: ReadonlyArray<{ id: string; name: string }>,
): Arranged {
  const sorted = [...chats].sort((a, b) => b.at - a.at);
  const pinnedChats = new Set(pins.filter((k) => k.startsWith("chat:")).map((k) => k.slice(5)));
  const latest = new Map<string, number>();
  for (const c of sorted) if (c.campaignId && !latest.has(c.campaignId)) latest.set(c.campaignId, c.at);
  const placed = new Set<string>();
  const found: Array<{ item: PinnedItem; at: number; pin: number }> = [];
  pins.forEach((key, pin) => {
    const id = key.slice(key.indexOf(":") + 1);
    if (key === pinKey("chat", id)) {
      const chat = sorted.find((c) => c.id === id);
      if (chat) { found.push({ item: { kind: "chat", chat }, at: chat.at, pin }); placed.add(chat.id); }
    } else if (key === pinKey("campaign", id)) {
      const campaign = campaigns.find((c) => c.id === id);
      if (!campaign) return;
      // A chat pinned on its own stays where it was pinned.
      const nested = sorted.filter((c) => c.campaignId === id && !pinnedChats.has(c.id));
      nested.forEach((c) => placed.add(c.id));
      found.push({ item: { kind: "campaign", id, name: campaign.name, chats: nested }, at: latest.get(id) ?? 0, pin });
    }
  });
  found.sort((a, b) => b.at - a.at || a.pin - b.pin);
  return { pinned: found.map((f) => f.item), recents: sorted.filter((c) => !placed.has(c.id)) };
}

/** The chats matching a search, in any group, by title or by what was last said. */
export function searchChats(chats: readonly RailChat[], q: string): RailChat[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return [...chats]
    .filter((c) => `${c.title} ${c.campaignName} ${c.last ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => b.at - a.at);
}

/** "5m", "3h", "Yesterday", "4d", "2w": how long ago, for a row's hover. */
export function agoLabel(at: number, now = Date.now()): string {
  const mins = Math.max(0, (now - at) / 60_000);
  return mins < 60 ? `${Math.max(1, Math.round(mins))}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : mins < 2880 ? "Yesterday" : mins < 10_080 ? `${Math.round(mins / 1440)}d` : `${Math.round(mins / 10_080)}w`;
}

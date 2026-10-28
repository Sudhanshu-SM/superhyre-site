import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEvent, fromDetail } from "../liveChat";
import type { ConversationDetail } from "../api/agent";
import type { RunEvent } from "../api/events";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

const detail = {
  conversation: { id: "c1" } as never,
  messages: [{ id: "m1", seq: 1, role: "user", text: "Who is strongest?", clientId: "k1", runId: "r1", campaignIds: [], createdAt: "2026-10-28T07:00:00Z" }],
  runs: [{ id: "r1", skill: "chat", status: "done", campaignId: null, createdAt: "2026-10-28T07:00:00Z" }],
  eventCursor: 0,
  readOnly: true,
} as unknown as ConversationDetail;

describe("somebody else's chat, read by an admin", () => {
  it("folds the events a run put on the screen into the turn they belonged to, cards and words", () => {
    const events = [
      { id: 1, eventId: 1, type: "artifact", runId: "r1", seq: 2, at: "", kind: "candidate_list", items: [] },
      { id: 2, eventId: 2, type: "message", runId: "r1", seq: 3, at: "", text: "Three are strong.", final: true },
      { id: 3, eventId: 3, type: "done", runId: "r1", seq: 4, at: "" },
    ] as unknown as RunEvent[];
    const turns = events.reduce(applyEvent, fromDetail(detail)).turns;
    expect(turns).toHaveLength(1);
    expect(turns[0]?.said).toBe("Who is strongest?");
    expect(turns[0]?.reply).toContain("Three are strong.");
    expect(turns[0]?.status).toBe("done");
  });

  it("draws the cards with the console's own turn body, and for reading only", () => {
    const src = read("SharedChat.tsx");
    expect(src).toContain("<LiveTurnBody");
    expect(src).toContain('inert: ""');
    expect(read("shared-chat.css")).toMatch(/\.shc-cards[^{]*\{[^}]*pointer-events: none/);
  });
});

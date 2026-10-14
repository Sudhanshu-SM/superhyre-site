import { describe, expect, it } from "vitest";
import { clearThread, saveMade, saveTurns, savedMade } from "../agentThread";

describe("a card's made record", () => {
  it("is kept for the turn, dropped with it, and cleared by a new chat", () => {
    clearThread();
    saveMade(3, "cmp-9");
    expect(savedMade(3)).toBe("cmp-9");
    saveTurns([{ id: 3, said: "x", mode: "agent", kind: "reply", replyIndex: 0, thoughtMs: null, startedAt: 1 }]);
    expect(savedMade(3)).toBe("cmp-9");
    saveTurns([]);
    expect(savedMade(3)).toBeNull();
    saveMade(1, "a");
    clearThread();
    expect(savedMade(1)).toBeNull();
  });
});

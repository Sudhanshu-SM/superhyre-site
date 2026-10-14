import { describe, expect, it } from "vitest";
import { clearPersonalCaches } from "../clientCache";

/** A Storage that is only a map, which is all the sweep needs. */
function fake(initial: Record<string, string>): Storage {
  const m = new Map(Object.entries(initial));
  return new Proxy({} as Storage, {
    get: (_t, p: string) => {
      if (p === "removeItem") return (k: string) => void m.delete(k);
      if (p === "getItem") return (k: string) => m.get(k) ?? null;
      return undefined;
    },
    ownKeys: () => [...m.keys()],
    getOwnPropertyDescriptor: (_t, p) => (m.has(String(p)) ? { enumerable: true, configurable: true, value: m.get(String(p)) } : undefined),
    has: (_t, p) => m.has(String(p)),
  });
}

describe("what the browser keeps for the last person", () => {
  it("is cleared, apart from an invite waiting and interface preferences", () => {
    const local = fake({ "sh.forms.v1": "{}", "sh.forms.chat-drafts.v1": "{}", "superhyre:new-campaign-draft": "{}", "superhyre.nav.railed": "1", "cw-view": "board", other: "x" });
    const session = fake({ "sh.agent.conversation": "c1", "sh.agent.thread": "t", "sh.sourcing.runs": "r", "superhyre.invite": "token", "sh-new-campaign": "1" });
    clearPersonalCaches([local, session]);
    expect(Object.keys(local).sort()).toEqual(["cw-view", "other", "superhyre.nav.railed"]);
    expect(Object.keys(session)).toEqual(["superhyre.invite"]);
  });

  it("copes with no storage at all", () => {
    expect(() => clearPersonalCaches([null])).not.toThrow();
  });
});

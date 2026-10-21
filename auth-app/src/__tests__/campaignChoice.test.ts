import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { rememberCampaign, rememberedCampaign } from "../campaignChoice";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

describe("the campaign that comes back after a refresh", () => {
  it("is the one they picked, kept for each person on their own", () => {
    rememberCampaign("u1", "camp-a");
    rememberCampaign("u2", "camp-b");
    expect(rememberedCampaign("u1")).toBe("camp-a");
    expect(rememberedCampaign("u2")).toBe("camp-b");
    expect(rememberedCampaign("u3")).toBeNull();
  });

  it("is nothing without a person or a campaign, and never throws when storage does", () => {
    rememberCampaign("", "camp-a");
    rememberCampaign("u1", "");
    expect(store.size).toBe(0);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    };
    expect(rememberedCampaign("u1")).toBeNull();
    expect(() => rememberCampaign("u1", "camp-a")).not.toThrow();
  });

  it("is read before the default, only when it is still theirs to open, and written once one is chosen", () => {
    const code = readFileSync(resolve(__dirname, "..", "Console.tsx"), "utf8");
    expect(code).toContain("const saved = rememberedCampaign(session.userId ?? \"\");");
    expect(code).toContain("x.id === saved && canOpenCampaign(x, session)");
    expect(code).toContain("const r = kept ?? defaultCampaign(");
    expect(code).toContain('if (campaignChosen && campaign.id) rememberCampaign(session.userId ?? "", campaign.id);');
  });
});

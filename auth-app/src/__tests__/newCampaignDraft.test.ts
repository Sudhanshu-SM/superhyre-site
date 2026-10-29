import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceChangedHere } from "../api/identity";
import { blankDraft, withNewClient } from "../campaignDraft";
import { draftToOffer, keepDraft, keptDraft, markDraftSwitched } from "../NewCampaign";

/**
 * A half-written campaign comes back only after a real switch of workspace, once. A dialog that was merely left
 * does not say "when you switched organisation" the next time, and a restored name is selected so typing over it
 * replaces it.
 */

const draft = { ...blankDraft("Riya"), name: "Platform Lead" };

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("offering a kept draft", () => {
  it("does not, and forgets it, when the dialog was only left", () => {
    keepDraft(draft);
    expect(draftToOffer()).toBeNull();
    // and it is gone: a later switch has nothing old to bring back
    markDraftSwitched();
    expect(draftToOffer()).toBeNull();
  });

  it("does after the workspace really changed, once", () => {
    keepDraft(draft);
    markDraftSwitched();
    expect(draftToOffer()).toMatchObject({ name: "Platform Lead", clientId: "" });
    expect(draftToOffer()).toBeNull();
  });

  it("brings back a company that was only named for the campaign, and a draft kept before one could be named has none", () => {
    keepDraft(withNewClient(draft, "Zorblax Studios"));
    expect(keptDraft()).toMatchObject({ name: "Platform Lead", clientId: "", newClient: "Zorblax Studios" });
    // As kept by an older console: no such field at all.
    const { newClient: _gone, ...older } = draft;
    window.sessionStorage.setItem("superhyre:new-campaign-draft", JSON.stringify(older));
    expect(keptDraft()).toMatchObject({ name: "Platform Lead", clientId: "", newClient: "" });
  });

  it("hears about the switch from the console's own signal", () => {
    keepDraft(draft);
    workspaceChangedHere();
    expect(draftToOffer()).toMatchObject({ name: "Platform Lead" });
  });

  it("has nothing to mark when nothing was kept, and shrugs where storage is off", () => {
    markDraftSwitched();
    expect(draftToOffer()).toBeNull();
    vi.stubGlobal("window", {});
    expect(() => markDraftSwitched()).not.toThrow();
    expect(draftToOffer()).toBeNull();
  });
});

describe("the restored name", () => {
  it("is selected, never added to, and the draft replaces the blank form instead of merging into it", () => {
    const src = readFileSync(resolve(__dirname, "../NewCampaign.tsx"), "utf8");
    expect(src).toContain("if (kept) nameRef.current?.select();");
    expect(src).toContain("const kept = draftToOffer();");
    expect(src).toContain("setD(own ? ownCampaign(start, me) : start);");
  });
});

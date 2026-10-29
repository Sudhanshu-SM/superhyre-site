import { afterEach, describe, expect, it, vi } from "vitest";
import { closeness, hitsOf } from "../api/search";
import type { SearchResults } from "../api/search";
import { blankDraft } from "../campaignDraft";
import { createdMessage, keepDraft, keptDraft } from "../NewCampaign";
import { unreachedLine } from "../Outreach";
import { loadFailedText } from "../ui";

describe("what a new campaign says once saved", () => {
  it("never claims a search started before there are requirements", () => {
    expect(createdMessage({ name: "Data Lead" })).toBe(
      "Data Lead created. Approve its requirements and the search starts.",
    );
  });
});

describe("a half-written campaign", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is kept when the dialog is torn down, offered once, and forgotten on purpose", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    const draft = { ...blankDraft("Riya"), name: "Platform Lead", clientId: "client-from-old-workspace" };
    keepDraft(draft);
    // The client belongs to the workspace it was typed in, so it doesn't come back.
    expect(keptDraft()).toMatchObject({ name: "Platform Lead", clientId: "" });
    keepDraft(null);
    expect(keptDraft()).toBeNull();
  });

  it("is simply not kept where storage is off", () => {
    vi.stubGlobal("window", {});
    expect(() => keepDraft(blankDraft("Riya"))).not.toThrow();
    expect(keptDraft()).toBeNull();
  });
});

describe("outreach counts", () => {
  it("adds up to the shortlist and says who can't be emailed", () => {
    expect(unreachedLine(3, 0)).toBe("3 on the shortlist with nothing sent yet");
    expect(unreachedLine(3, 1)).toBe("4 on the shortlist with nothing sent yet. 1 has no email, so 3 can be emailed");
  });
});

describe("a load that failed", () => {
  it("blames the connection only when the connection failed", () => {
    expect(loadFailedText("Clients", "network")).toMatch(/Check your connection/);
    expect(loadFailedText("Clients", "server")).toMatch(/on our side/);
    expect(loadFailedText("Clients", null)).not.toMatch(/connection/);
  });
});

describe("quick find", () => {
  const results: SearchResults = {
    campaigns: [{ id: "c1", name: "uiqa2 Dbl Draft", status: "active", clientName: null }],
    candidates: [],
    clients: [{ id: "k1", name: "uiqa2 Acme", status: "active", industry: null, location: null }],
    forms: [],
    tasks: [],
    conversations: [],
  };

  it("puts the closest name first, whatever its kind", () => {
    expect(closeness("uiqa2 Acme", "uiqa2 acme")).toBe(3);
    expect(closeness("uiqa2 Acme Fintech", "uiqa2 acme")).toBe(2);
    expect(closeness("uiqa2 Dbl Draft", "uiqa2 acme")).toBe(0);
    expect(hitsOf(results, "uiqa2 acme").map((h) => h.key)).toEqual(["cl-k1", "c-c1"]);
  });

  it("names the contact a client was found through", () => {
    const viaContact: SearchResults = { campaigns: [], candidates: [], forms: [], tasks: [], conversations: [],
      clients: [{ id: "k9", name: "fn3 Acme Robotics", status: "active", industry: "Robotics", location: null, contact: "Rahul Mehta" }] };
    expect(hitsOf(viaContact, "rahul@fn3acme")[0]?.group).toBe("Client, Robotics, via Rahul Mehta");
    expect(hitsOf(results, "uiqa2 acme").find((h) => h.key === "cl-k1")?.group).not.toContain("via");
  });

  it("keeps the usual kind order when nothing is closer", () => {
    expect(hitsOf(results, "zzz").map((h) => h.key)).toEqual(["c-c1", "cl-k1"]);
  });
});

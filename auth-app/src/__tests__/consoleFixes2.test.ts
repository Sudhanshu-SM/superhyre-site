import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { applyFailure, applyTitle } from "../ApplyPage";
import { comingSoon, COMING_SOON_NOTE, emptyList, joinNames, reconnectLine, signedOutTitle } from "../emptyStates";
import { actionFor, connectName, connectNeeded, errorKindOf } from "../ErrorStates";
import { scopePick } from "../nav";
import { ROUTES } from "../nav";
import { NAV } from "../nav";
import { channelsRow, intakeRow, memoryRow, workspaceRows } from "../railConfig";
import { firstGlyph, initialsOf, loadFailedShort, loadFailedText } from "../ui";

describe("the sidebar's campaign row when none is chosen", () => {
  it("never says none yet while the list is on its way or when it failed", () => {
    expect(scopePick(0, { ready: false, failed: false })).toMatchObject({ state: "loading", label: "Loading campaigns" });
    expect(scopePick(0, { ready: true, failed: true })).toMatchObject({ state: "failed", label: "Campaigns didn't load" });
    expect(scopePick(0, { ready: true, failed: false })).toMatchObject({ state: "none", label: "No campaigns yet" });
  });

  it("offers the list whenever there is one, even after a failed refresh", () => {
    expect(scopePick(3, { ready: true, failed: false }).state).toBe("pick");
    expect(scopePick(3, { ready: true, failed: true }).state).toBe("pick");
  });
});

describe("a session that has ended", () => {
  it("swaps Try again for Sign in again, which reloads", () => {
    let reloaded = 0;
    const act = actionFor("session", { label: "Try again", onClick: () => {} }, () => { reloaded += 1; });
    expect(act?.label).toBe("Sign in again");
    act?.onClick?.();
    expect(reloaded).toBe(1);
  });

  it("leaves every other action alone", () => {
    const retry = { label: "Try again", onClick: () => {} };
    expect(actionFor("server", retry)).toBe(retry);
    expect(actionFor("network", retry)).toBe(retry);
    const link = { label: "Open Connections", href: "#/settings/connections" };
    expect(actionFor("session", link)).toBe(link);
    const other = { label: "Go to Home", onClick: () => {} };
    expect(actionFor("session", other)).toBe(other);
    expect(actionFor("session", undefined)).toBeUndefined();
  });
});

describe("a service that isn't connected", () => {
  const needs = new ApiError(503, "unavailable", "Slack isn't connected yet. An admin can connect it in Settings → Connections.", {
    connect: "slack", path: "/settings/connections",
  });

  it("is a connector case, not a server fault", () => {
    expect(connectNeeded(needs)).toBe("slack");
    expect(errorKindOf(needs)).toBe("connector");
    expect(errorKindOf(new ApiError(503, "unavailable", "Down."))).toBe("server");
    expect(connectNeeded(new ApiError(503, "unavailable", "Down."))).toBeNull();
    expect(connectNeeded(new Error("x"))).toBeNull();
  });

  it("names the service the way a person says it", () => {
    expect(connectName("slack")).toBe("Slack");
    expect(connectName("sheets")).toBe("Google Sheets");
    expect(connectName("gmail")).toBe("Gmail");
    expect(connectName("hubspot")).toBe("Hubspot");
  });

  it("says which one in a failed panel, in the long and the short form", () => {
    expect(loadFailedText("Your clients", "server", null, 0, "slack")).toBe(
      "Your clients didn't load. Slack isn't connected yet; an admin can connect it in Settings.",
    );
    expect(loadFailedShort("Your watches", "server", "notion")).toBe("Your watches didn't load. Notion isn't connected yet.");
  });
});

describe("the short failure line for a narrow panel", () => {
  it("says what didn't load, and why only when it is the person's to know", () => {
    expect(loadFailedShort("The week", "server")).toBe("The week didn't load.");
    expect(loadFailedShort("The week", null)).toBe("The week didn't load.");
    expect(loadFailedShort("The week", "network")).toBe("The week didn't load. Check your connection.");
    expect(loadFailedShort("The week", "session")).toBe("The week didn't load. Your session has ended.");
    expect(loadFailedShort("The week", "access")).toContain("You don't have access");
    expect(loadFailedShort("The week", "limited")).toContain("wait a moment");
  });
});

describe("initials", () => {
  it("never splits an emoji", () => {
    expect(firstGlyph("Dev")).toBe("D");
    expect(firstGlyph("👩🏽‍💻 Dev")).toBe("👩🏽‍💻");
    expect(firstGlyph("  \u{1F469}x")).not.toContain("�");
    expect(firstGlyph("")).toBe("");
    expect(firstGlyph(null)).toBe("");
  });

  it("takes two words and falls back to a question mark", () => {
    expect(initialsOf("Asha Bose")).toBe("AB");
    expect(initialsOf("Priya Nair Kapoor")).toBe("PN");
    expect(initialsOf("Dev 👩🏽‍💻")).toBe("D👩🏽‍💻");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf(undefined)).toBe("?");
  });
});

describe("an empty candidates list", () => {
  it("is no match only when a search or filter hides people", () => {
    expect(emptyList({ narrowed: true, campaign: null, live: true })).toMatchObject({ noMatch: true, head: "No candidates match." });
    expect(emptyList({ narrowed: true, campaign: "Platform SRE", live: true }).noMatch).toBe(true);
  });

  it("says a campaign has nobody on it, calmly, with the page's own picture", () => {
    const e = emptyList({ narrowed: false, campaign: "Platform SRE", live: true });
    expect(e.noMatch).toBe(false);
    expect(e.head).toBe("Nobody is on Platform SRE yet.");
    expect(e.text).not.toMatch(/filter/i);
  });

  it("says a workspace with nobody saved yet is empty", () => {
    expect(emptyList({ narrowed: false, campaign: null, live: true })).toMatchObject({ noMatch: false, head: "No candidates yet." });
  });
});

describe("pages that are not built yet", () => {
  it("each has a picture and its own line, and the note stays honest", () => {
    expect(comingSoon("campaign-calls")).toMatchObject({ art: "empty-calls", head: "Calls will live here" });
    expect(comingSoon("support").art).not.toBe("empty-calls");
    expect(comingSoon("anything-else").head).toBe("This page is on its way");
    expect(COMING_SOON_NOTE).toMatch(/haven't built/);
  });
});

describe("naming services", () => {
  it("joins names the way a sentence does", () => {
    expect(joinNames(["Slack"])).toBe("Slack");
    expect(joinNames(["Slack", "Notion"])).toBe("Slack and Notion");
    expect(joinNames(["Slack", "Notion", "Google"])).toBe("Slack, Notion and Google");
    expect(signedOutTitle(["Slack", "Notion"])).toBe("Slack and Notion are signed out");
  });

  it("names each service to reconnect, so it is never guessed", () => {
    expect(reconnectLine(["Slack"])).toBe("Reconnect Slack below and the agent can use it again.");
    expect(reconnectLine(["Slack", "Notion"])).toBe("Reconnect Slack and Notion below and the agent can use them again.");
  });
});

describe("the pages that no longer exist", () => {
  it("has no Extension or Scheduled row, and no route behind either", () => {
    const labels = NAV.flatMap((s) => s.items).map((i) => i.label);
    expect(labels).not.toContain("Extension");
    expect(labels).not.toContain("Scheduled");
    expect(Object.keys(ROUTES)).not.toContain("integrations");
    expect(Object.keys(ROUTES)).not.toContain("schedules");
  });
});

describe("the Agent page's panels that didn't load", () => {
  it("mark a failed row so the panel names it once, with one retry", () => {
    const retry = () => {};
    expect(channelsRow({ status: "failed", google: null, slack: null, notion: null }, { role: "admin" }, retry)).toMatchObject({ failed: true, retry });
    expect(memoryRow({ stats: null, statsPhase: "failed", unavailable: false }, retry)).toMatchObject({ failed: true, retry });
    expect(intakeRow({ status: "failed" }, "#/x", retry)).toMatchObject({ failed: true, retry });
  });

  it("never reads a failed campaign list as 'Create a campaign'", () => {
    const base = {
      role: "admin" as const, connections: { status: "ready", google: null, slack: null, notion: null, oauth: { slack: false, notion: false }, error: null, at: 0 } as const,
      onRetryConnections: () => {}, campaigns: [], people: { status: "loading" } as const, inOrg: false,
    };
    const retry = () => {};
    const failed = workspaceRows({ ...base, campaignsReady: true, campaignsFailed: true, onRetryCampaigns: retry }).find((r) => r.label === "Campaigns");
    expect(failed).toMatchObject({ failed: true, retry });
    expect(failed?.action).toBeUndefined();
    const none = workspaceRows({ ...base, campaignsReady: true }).find((r) => r.label === "Campaigns");
    expect(none?.action?.label).toBe("Create a campaign");
  });
});

describe("the public form when it doesn't come", () => {
  it("puts the failure down to the connection, a pause, or us", () => {
    expect(applyFailure(new ApiError(0, "network", "x"))).toBe("network");
    expect(applyFailure(new ApiError(429, "rate_limited", "x"))).toBe("rate-limit");
    expect(applyFailure(new ApiError(500, "internal", "x"))).toBe("server");
    expect(applyFailure(new ApiError(401, "unauthenticated", "x"))).toBe("server");
    expect(applyFailure(new Error("boom"))).toBe("server");
  });

  it("titles the tab for the page, not for sign in", () => {
    expect(applyTitle({ kind: "loading" })).toBe("Apply");
    expect(applyTitle({ kind: "failed", reason: "server" })).toBe("Apply");
    expect(applyTitle({ kind: "notice", text: "closed", page: { company: "Acme" } as never })).toBe("Apply at Acme");
    expect(applyTitle({ kind: "notice", text: "gone" })).toBe("Apply");
    const form = { title: "Senior Android Engineer", name: "form" } as never;
    expect(applyTitle({ kind: "live", form, page: { company: "fn3 Talent" } as never })).toBe("Senior Android Engineer at fn3 Talent");
    expect(applyTitle({ kind: "live", form, page: { company: null } as never })).toBe("Senior Android Engineer");
  });
});

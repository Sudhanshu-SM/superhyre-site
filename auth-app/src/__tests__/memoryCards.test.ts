import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "../api/events";
import { isRememberAction, rememberHead, rememberOutcome, rememberPreview } from "../chatCards";
import { cadenceLabel, previewSummary } from "../liveAgents";
import type { Cadence } from "../liveAgents";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import { afterApproval, outcomeOf } from "../agentCards/outcome";
import { MEMORY_HREF } from "../memoryView";
import { isKnownHash, redirectedHash, routeFromHash, settingsSectionFromHash, SETTINGS_SECTIONS } from "../nav";
import { memoryRow } from "../railConfig";

/**
 * The agent's memory outside the Settings page: the approval card for a note it wants to keep, the
 * Memory row in the Agent page's rail, the Memory section's address, and the "once a week" watch.
 * The shapes are the server's (modules/agent/actions.ts `remember`, `GET /v1/memory/stats`).
 */

const forClient = {
  action: "remember", level: "client", kind: "fact", text: "Acme caps the budget at 40 lakh.",
  quote: "Acme's budget is capped at 40 lakh", campaignId: "ca1", clientId: "cl1", clientName: "Acme Robotics",
};
const forAgency = { action: "remember", level: "org", kind: "playbook", text: "Always lead with the salary range.", quote: "always lead with the salary range" };

describe("the approval for something the agent wants to remember", () => {
  it("names who it is for", () => {
    expect(isRememberAction("remember")).toBe(true);
    expect(isRememberAction("shortlist")).toBe(false);
    expect(rememberHead(forClient)).toBe("Remember for Acme Robotics");
    expect(rememberHead(forAgency)).toBe("Remember for the whole agency");
    expect(rememberHead({ ...forClient, clientName: undefined })).toBe("Remember for this client");
    expect(rememberHead({ action: "remember", level: "campaign" })).toBe("Remember this");
  });

  it("shows the note and the recruiter's own words it rests on", () => {
    expect(rememberPreview(forClient)).toEqual({ note: "Acme caps the budget at 40 lakh.", said: "Acme's budget is capped at 40 lakh", replaces: false });
    expect(rememberPreview({ ...forAgency, replaces: "m-old" })).toMatchObject({ replaces: true });
    expect(rememberPreview({ ...forAgency, quote: "  " })?.said).toBeNull();
  });

  it("shows nothing it wasn't sent", () => {
    expect(rememberPreview({ action: "remember" })).toBeNull();
    expect(rememberPreview({ action: "remember", text: "   " })).toBeNull();
  });

  it("says what approving did: kept and in use, or kept and waiting for an admin", () => {
    expect(rememberOutcome({ remembered: true, memoryId: "m1", status: "active" })).toBe("Remembered.");
    expect(rememberOutcome({ remembered: true, memoryId: "m1", status: "pending", note: "An admin will confirm." })).toBe(
      "Saved. An admin needs to confirm it before it is used.",
    );
    expect(rememberOutcome({ remembered: false, note: "Not saved: contact details can't be remembered." })).toBe("Not saved: contact details can't be remembered.");
    expect(rememberOutcome({ remembered: false })).toBe("Not saved.");
  });

  describe("as the chat holds it", () => {
    let n = 0;
    const ev = (type: RunEvent["type"], payload: Record<string, unknown>): RunEvent => ({ ...payload, id: ++n, runId: "r1", seq: n, type, at: "2026-10-10T10:00:00.000Z" });
    const chat = (): ChatState => ({
      conversationId: "c1", turns: [{ ...newTurn("t1", "Acme's budget is capped at 40 lakh"), runId: "r1", status: "working" }],
      owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
    });
    const approved = (action: Record<string, unknown>, result: Record<string, unknown>) => {
      let s = applyEvent(chat(), ev("approval", { action, summary: `Remember for Acme: "${String(action.text)}"`, campaignName: "Senior Android", people: [] }));
      const seq = s.turns[0]?.approvals[0]?.seq;
      s = applyEvent(s, ev("result", { approvalSeq: seq, decision: "approve", action: "remember", ...result }));
      const a = s.turns[0]?.approvals[0];
      if (!a) throw new Error("no approval");
      return a;
    };

    it("keeps the note so the card can show it", () => {
      const s = applyEvent(chat(), ev("approval", { action: forClient, summary: "Remember for Acme", campaignName: "Senior Android", people: [] }));
      expect(s.turns[0]?.approvals[0]).toMatchObject({ action: "remember", detail: forClient, campaignId: "ca1", decided: null });
    });

    it("reads Remembered once the note is in use, and sends nowhere: a note is the agent's own", () => {
      const a = approved(forClient, { remembered: true, memoryId: "m1", status: "active" });
      expect(outcomeOf(a)).toBe("Remembered.");
      expect(afterApproval(a)).toBeNull();
    });

    it("says an admin needs to confirm it when it is waiting", () => {
      const a = approved(forAgency, { remembered: true, memoryId: "m2", status: "pending" });
      expect(outcomeOf(a)).toBe("Saved. An admin needs to confirm it before it is used.");
    });

    it("says nothing was saved when it was declined, and links nowhere", () => {
      let s = applyEvent(chat(), ev("approval", { action: forClient, summary: "Remember", campaignName: null, people: [] }));
      const seq = s.turns[0]?.approvals[0]?.seq;
      s = applyEvent(s, ev("result", { approvalSeq: seq, decision: "decline", action: "remember" }));
      const a = s.turns[0]?.approvals[0];
      if (!a) throw new Error("no approval");
      expect(outcomeOf(a)).toBe("Not saved.");
      expect(afterApproval(a)).toBeNull();
    });
  });
});

describe("the Memory row in the Agent page's rail", () => {
  const retry = () => {};
  const stats = (active: number, pending: number) => ({ active, pending, byScope: { org: 0, client: 0, campaign: 0, person: 0 } });

  it("says how many notes, and under it what needs a look", () => {
    const row = memoryRow({ stats: stats(22, 3), statsPhase: "ready", unavailable: false }, retry);
    expect(row).toEqual({ label: "Memory", value: "22 notes", notes: [{ text: "3 to review", href: "#/settings/memory" }] });
  });

  it("links to the page even when nothing needs review, and says so for one note", () => {
    expect(memoryRow({ stats: stats(1, 0), statsPhase: "ready", unavailable: false }, retry)).toEqual({
      label: "Memory", value: "1 note", notes: [{ text: "See what it remembers", href: "#/settings/memory" }],
    });
    expect(memoryRow({ stats: stats(0, 0), statsPhase: "ready", unavailable: false }, retry)?.value).toBe("Nothing yet");
  });

  it("holds the row's height while it loads, and keeps what it knew while it refreshes", () => {
    expect(memoryRow({ stats: null, statsPhase: "loading", unavailable: false }, retry)).toEqual({ label: "Memory", pending: true, reserve: 1 });
    expect(memoryRow({ stats: null, statsPhase: "idle", unavailable: false }, retry)).toMatchObject({ pending: true });
    expect(memoryRow({ stats: stats(5, 0), statsPhase: "loading", unavailable: false }, retry)?.value).toBe("5 notes");
  });

  it("says it couldn't load and offers to try again", () => {
    const row = memoryRow({ stats: null, statsPhase: "failed", unavailable: false }, retry);
    expect(row).toMatchObject({ label: "Memory", value: "Couldn't load", retry, notes: [] });
  });

  it("leaves the row out on a server that has no memory yet", () => {
    expect(memoryRow({ stats: null, statsPhase: "failed", unavailable: true }, retry)).toBeNull();
  });
});

describe("the Memory section's address", () => {
  it("is not a Settings section any more: an old link opens Settings' landing page", () => {
    expect(SETTINGS_SECTIONS).not.toContain("memory");
    expect(settingsSectionFromHash("#/settings/memory")).toBeNull();
    expect(settingsSectionFromHash("#/settings/memory/")).toBeNull();
    expect(redirectedHash(MEMORY_HREF)).toBe("#/settings");
    expect(routeFromHash(MEMORY_HREF)).toBe("settings");
    expect(isKnownHash(MEMORY_HREF)).toBe(true);
  });

  it("sends an old link to its Coming up section to Home, where Coming up is now", () => {
    expect(redirectedHash("#/settings/memory?section=coming-up")).toBe("#/?section=coming-up");
    expect(redirectedHash("#/settings/memory?section=coming-up&campaignId=c1")).toBe("#/?section=coming-up&campaignId=c1");
    expect(routeFromHash("#/settings/memory?section=coming-up")).toBe("home");
  });

  it("is no row in the Configuration panel", () => {
    const hook = readFileSync(resolve(__dirname, "../useRailConfig.ts"), "utf8");
    expect(hook).not.toContain("memoryRow");
    expect(hook).not.toMatch(/withMemory|useMemoryStats/);
  });
});

describe("a watch that looks once a week", () => {
  it("has a label, like the others", () => {
    const all: Cadence[] = ["hourly", "every_4h", "daily", "weekly"];
    expect(all.map(cadenceLabel)).toEqual(["Every hour", "Every 4 hours", "Once a day", "Once a week"]);
  });

  it("says it in the preview, and never says undefined for a cadence it doesn't know", () => {
    const NOW = Date.UTC(2026, 9, 10, 10, 0, 0);
    expect(previewSummary({ profiles: 20 }, "weekly", NOW)).toBe("Once a week, 5 at a time, until 20 people");
    expect(cadenceLabel("fortnightly")).toBe("Regularly");
    expect(previewSummary({ profiles: 20 }, "fortnightly" as Cadence, NOW)).not.toMatch(/undefined/);
  });
});

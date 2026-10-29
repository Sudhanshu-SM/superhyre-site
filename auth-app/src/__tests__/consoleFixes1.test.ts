import { describe, expect, it } from "vitest";
import { campaignsEmpty } from "../campaignsEmpty";
import { joinParts, plainText } from "../displayText";
import { firstHireSeen, rememberFirstHire } from "../firstHireSeen";
import { shortlistTable, stageName, stepName } from "../exportTable";
import { agentsView, hireCaption } from "../OverviewPanel";
import type { PanelModel } from "../OverviewPanel";
import type { ApiCampaignAgents } from "../api/campaigns";
import { draftFailed, draftingNow, pollDelay, runInFlight } from "../specDraft";
import type { SpecRow } from "../api/agent";

describe("plainText and joinParts", () => {
  it("drops right-to-left overrides and isolates so a name reads as typed", () => {
    expect(plainText("evil‮txt.exe")).toBe("eviltxt.exe");
    expect(plainText("a⁦b⁩c‪d‬")).toBe("abcd");
    expect(plainText(null)).toBe("");
    expect(plainText("Anika Bose")).toBe("Anika Bose");
  });

  it("joins only the parts that have something, so an empty department leaves no stray separator", () => {
    expect(joinParts(["Engineering", "", "Bangalore"])).toBe("Engineering · Bangalore");
    expect(joinParts(["", ""])).toBe("");
    expect(joinParts([undefined, " Pune ", null], ", ")).toBe("Pune");
  });
});

describe("what an empty Campaigns list says", () => {
  it("calls a zero-count tab none yet: no search picture, no New campaign", () => {
    const e = campaignsEmpty({ filter: "closed", q: "", total: 6, mayCreate: true });
    expect(e.kind).toBe("none-yet");
    expect(e.message).toBe("Nothing has been closed yet.");
    expect(e.art.name).not.toBe("empty-search");
    expect(e.canCreate).toBe(false);
    expect(e.canClear).toBe(false);
  });

  it("offers Clear, not New campaign, when a name search finds nothing", () => {
    const e = campaignsEmpty({ filter: "all", q: "zzz", total: 6, mayCreate: true });
    expect(e).toMatchObject({ kind: "no-match", canCreate: false, canClear: true, art: { name: "empty-search" } });
    expect(e.message).toContain("zzz");
  });

  it("offers New campaign only where nothing exists at all", () => {
    expect(campaignsEmpty({ filter: "all", q: "", total: 0, mayCreate: true })).toMatchObject({ kind: "first", canCreate: true });
    expect(campaignsEmpty({ filter: "all", q: "", total: 0, mayCreate: false })).toMatchObject({ kind: "no-access", canCreate: false });
  });
});

describe("a draft on its way", () => {
  const spec = (createdAt: string): SpecRow => ({
    id: "s1", version: 1, spec: { title: "x", locations: [], remoteOk: false, requirements: [], avoid: [] }, jdText: null, approvedAt: null, createdAt,
  });
  const now = Date.parse("2026-10-10T10:00:00Z");

  it("is drafting while a run is in flight and no newer spec has landed", () => {
    const run = { id: "r1", status: "running", createdAt: "2026-10-10T09:59:00Z" };
    expect(draftingNow(run, null, now)).toBe(true);
    expect(draftingNow(run, spec("2026-10-10T09:00:00Z"), now)).toBe(true);
    expect(draftingNow(run, spec("2026-10-10T09:59:30Z"), now)).toBe(false);
    expect(draftingNow({ ...run, status: "done" }, null, now)).toBe(false);
    expect(draftingNow(null, null, now)).toBe(false);
  });

  it("stops waiting for a run that has been 'running' for ten minutes", () => {
    expect(draftingNow({ id: "r1", status: "queued", createdAt: "2026-10-10T09:40:00Z" }, null, now)).toBe(false);
  });

  it("knows when the last draft ended without a spec", () => {
    expect(draftFailed({ id: "r1", status: "failed", createdAt: "x" }, null)).toBe(true);
    expect(draftFailed({ id: "r1", status: "failed", createdAt: "x" }, spec("2026-10-10T09:00:00Z"))).toBe(false);
    expect(runInFlight({ id: "r1", status: "queued", createdAt: "x" })).toBe(true);
  });

  it("asks gently: quick at first, then easing off", () => {
    expect([0, 1, 2, 3, 4, 9].map(pollDelay)).toEqual([3000, 3000, 5000, 5000, 8000, 8000]);
  });
});

describe("the campaign's agents panel", () => {
  const agents = (over: Partial<ApiCampaignAgents> = {}, sourcing: Partial<ApiCampaignAgents["sourcing"]> = {}, outreach: Partial<ApiCampaignAgents["outreach"]> = {}): ApiCampaignAgents => ({
    status: "active",
    approvedSpec: true,
    sourcing: { state: "idle", run: null, watch: null, lastRunAt: null, ...sourcing },
    outreach: { state: "idle", waiting: 0, sending: 0, ...outreach },
    ...over,
  });

  it("says a search is working with what it has found and scored", () => {
    const v = agentsView(agents({}, { state: "working", run: { id: "r1", found: 20, scored: 8 } }));
    expect(v.sourcing).toEqual({ line: "Working with 20 found and 8 scored", action: null });
    expect(agentsView(agents({}, { state: "working", run: { id: "r1", found: 20, scored: 0 } })).sourcing.line).toBe("Working with 20 found");
    expect(agentsView(agents({}, { state: "working", run: { id: "r1", found: null, scored: 0 } })).sourcing.line).toBe("Working");
  });

  it("says a watch is keeping watch until its number or its date, and offers to stop it", () => {
    const watch = (stop: { profiles?: number; until?: string }, found = 0) => ({ id: "w1", summary: "", stop, found, nextRunAt: null });
    expect(agentsView(agents({}, { state: "watching", watch: watch({ profiles: 25 }, 7) })).sourcing)
      .toEqual({ line: "Keeping watch until 25 people, 7 found so far", action: { label: "Stop", id: "stop" } });
    expect(agentsView(agents({}, { state: "watching", watch: watch({ until: "2026-10-14T00:00:00Z" }) })).sourcing.line).toMatch(/^Keeping watch until 1[34] Oct$/);
  });

  it("shows a paused watch, with why, and offers to resume it, instead of saying Idle", () => {
    const watch = (reason: string | null) => ({ id: "w1", summary: "", stop: { profiles: 25 }, found: 4, nextRunAt: null, paused: true, reason });
    expect(agentsView(agents({}, { state: "paused", watch: watch("Paused by you.") })).sourcing)
      .toEqual({ line: "Keep-sourcing paused by you", action: { label: "Resume", id: "resume" } });
    expect(agentsView(agents({}, { state: "paused", watch: watch("The person who started this no longer has access to the campaign.") })).sourcing)
      .toEqual({ line: "Keep-sourcing paused. The person who started this no longer has access to the campaign.", action: { label: "Resume", id: "resume" } });
    expect(agentsView(agents({}, { state: "paused", watch: watch(null) })).sourcing.line).toBe("Keep-sourcing paused by you");
  });

  it("is idle with Find people once requirements are approved, and asks for them before that", () => {
    expect(agentsView(agents()).sourcing).toEqual({ line: "Idle", action: { label: "Find people", id: "find" } });
    expect(agentsView(agents({ approvedSpec: false })).sourcing).toEqual({ line: "Waiting for approved requirements", action: { label: "Review the requirements", id: "spec" } });
  });

  it("says what outreach is waiting for, sending, or idle, each with Review where there is something to do", () => {
    expect(agentsView(agents({}, {}, { state: "waiting", waiting: 12 })).outreach)
      .toEqual({ line: "Waiting for your approval: 12 messages", action: { label: "Review", id: "review" } });
    expect(agentsView(agents({}, {}, { state: "waiting", waiting: 1 })).outreach.line).toBe("Waiting for your approval: 1 message");
    expect(agentsView(agents({}, {}, { state: "sending", sending: 4 })).outreach).toEqual({ line: "Sending 4 messages", action: null });
    expect(agentsView(agents()).outreach).toEqual({ line: "Idle", action: { label: "Review", id: "review" } });
  });
});

describe("the hires caption", () => {
  it("says Closed with the hires so far, never a draft or a pause", () => {
    const m: PanelModel = { phase: "closed", target: 3, hired: [], offer: [], replied: [], manager: "" };
    expect(hireCaption(m)).toBe("Closed with 0 of 3");
  });
});

describe("the first hire is said once per campaign", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  };

  it("remembers it by campaign", () => {
    const store = mem();
    expect(firstHireSeen("c1", store)).toBe(false);
    rememberFirstHire("c1", store);
    expect(firstHireSeen("c1", store)).toBe(true);
    expect(firstHireSeen("c2", store)).toBe(false);
  });

  it("carries on when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(firstHireSeen("c1", blocked)).toBe(false);
    expect(() => rememberFirstHire("c1", blocked)).not.toThrow();
  });
});

describe("a spreadsheet's stage and step", () => {
  it("uses the board's words, not the API's", () => {
    expect(stageName("outreach")).toBe("In outreach");
    expect(stepName("loop")).toBe("In interviews");
    const t = shortlistTable(
      [{ id: "1", candidateId: "c", name: "Omar", stage: "outreach", step: "loop" }],
      ["name", "stage", "step"],
    );
    expect(t.rows[0]).toEqual(["Omar", "In outreach", "In interviews"]);
  });
});

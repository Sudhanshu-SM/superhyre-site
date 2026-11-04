import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A shortlist is not final. Wherever a shortlisted person is acted on (the Sourced list and its profile, the chat's
 * cards, the board and its person sheet) they can be taken off the shortlist again, or turned down outright.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, onWrite: () => () => undefined };
});

const { Verdicts } = await import("../CandidateBits");
const { takenBackNote, hiredKeptNote, undoNote, withoutDecision } = await import("../verdictUndo");
const { getSet, putSet } = await import("../liveCandidates");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const buttons = (html: string) => [...html.matchAll(/<button([^>]*)>/g)].map((m) => m[1] ?? "");

describe("the shortlist and reject buttons, connected", () => {
  it("leave both pressable for someone shortlisted: Shortlisted takes it back, Reject turns them down", () => {
    const html = renderToStaticMarkup(<Verdicts verdict="shortlisted" onVerdict={() => undefined} name="Asha Verma" />);
    const [reject, short] = buttons(html);
    expect(reject).not.toContain("disabled");
    expect(reject).toContain('aria-label="Reject Asha Verma"');
    expect(short).not.toContain("disabled");
    expect(short).toContain('aria-label="Remove from shortlist Asha Verma"');
    expect(short).toContain('aria-pressed="true"');
  });

  it("keep a rejection fixed, with shortlisting as the way back", () => {
    const html = renderToStaticMarkup(<Verdicts verdict="rejected" onVerdict={() => undefined} name="Asha Verma" />);
    const [reject, short] = buttons(html);
    expect(reject).toContain("disabled");
    expect(reject).toContain("Shortlist them to bring them back.");
    expect(short).not.toContain("disabled");
  });

  it("send null for Remove and rejected for Reject", () => {
    const bits = src("CandidateBits.tsx");
    expect(bits).toContain('onVerdict(short ? null : "shortlisted")');
    expect(bits).toContain('onVerdict(rej ? null : "rejected")');
  });
});

describe("what a shortlist taken back says", () => {
  it("says it is done and that they are still in Candidates", () => {
    expect(takenBackNote("Asha", { removed: 1, stayed: 0 })).toEqual({ text: "Asha is off the shortlist and still in Candidates.", done: true });
  });
  it("says why someone already contacted stays, and that rejecting still works", () => {
    const note = takenBackNote("Asha", { removed: 0, stayed: 1 });
    expect(note.done).toBe(false);
    expect(note.text).toContain("already been contacted");
    expect(note.text).toContain("Reject them");
  });
  it("says a hire is changed on the pipeline", () => {
    expect(hiredKeptNote("Asha")).toBe("Asha is hired, so they stay on the pipeline. Change that there.");
  });
  it("no longer says a shortlist can only be changed by moving them", () => {
    expect(undoNote("shortlisted").text).not.toContain("move them there");
  });
});

describe("the found list after a shortlist is taken back", () => {
  it("drops the person's decision, so they read as to review at once", () => {
    expect(withoutDecision({ a: "shortlisted", b: "rejected" } as Record<string, "shortlisted" | "rejected">, "a")).toEqual({ b: "rejected" });
    expect(withoutDecision(undefined, "a")).toEqual({});
  });

  it("stores a set whose only change is a decision", () => {
    const base = { key: "c-take", campaignId: "c-take", candidates: [], criteria: [], reasons: {}, total: 0 };
    putSet({ ...base, decisions: { p1: "shortlisted" } });
    expect(getSet("c-take")?.decisions).toEqual({ p1: "shortlisted" });
    putSet({ ...base, decisions: {} });
    expect(getSet("c-take")?.decisions).toEqual({});
  });

  it("calls the server to take it back, rejects a shortlisted person through the pass dialog, and undoes on failure", () => {
    const page = src("SourcedPage.tsx");
    expect(page).toContain("agentApi.unshortlist(campaignId, [id])");
    expect(page).toContain('if (v === "rejected") { setPassing(id); return; }');
    expect(page).toContain("putSet({ ...s, decisions: withoutDecision(s.decisions, id) })");
    expect(page).toContain('setVerdict(id, "shortlisted");');
    expect(src("api/agent.ts")).toContain("/matches/unshortlist");
  });
});

describe("the chat's list of people", () => {
  it("offers Remove and Reject for someone shortlisted", () => {
    const card = src("agentCards/ReadCards.tsx");
    const at = card.indexOf('verdict === "shortlisted" ? (');
    expect(at).toBeGreaterThan(0);
    const block = card.slice(at, at + 700);
    expect(block).toContain("onVerdict(p.personId as string, null)");
    expect(block).toContain('onVerdict(p.personId as string, "rejected")');
    expect(block).toContain("Remove");
    expect(block).toContain("Reject");
  });
});

describe("the board", () => {
  it("has Remove from shortlist in a card's menu and the person sheet, only at the shortlist stage", () => {
    const ws = src("CampaignWorkspace.tsx");
    expect(ws.match(/p\.stage === "shortlisted" && .*Remove from shortlist/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(ws).toContain("takeOffShortlist(p, toast)");
    expect(ws).toContain("removeFromShortlist(p.campaign, [p.id])");
  });
});

describe("what a rejection or a taken-back shortlist leaves stale", () => {
  it("reads the board again, not only the people", async () => {
    const inv = await import("../invalidate");
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/matches/reject")).toEqual({ effects: ["candidates", "pipeline"], campaignId: "c1", views: ["tasks"] });
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/matches/unshortlist")).toEqual({ effects: ["candidates", "pipeline"], campaignId: "c1", views: ["tasks"] });
    expect(inv.effectsOfWrite("POST", "/v1/campaigns/c1/matches/shortlist")).toEqual({ effects: ["candidates"], campaignId: "c1", views: ["tasks"] });
  });
});

describe("the agent chat", () => {
  it("takes a shortlist back through the server, puts it back if they were already contacted or the call fails", () => {
    const agent = src("Agent.tsx");
    const branch = agent.slice(agent.indexOf('else if (verdictsNow.current[id] === "shortlisted") {'), agent.indexOf("// Taking a pass back is not offered"));
    expect(branch).toContain("setVerdict(id, null);");
    expect(branch).toContain("agentApi.unshortlist(cid, [id])");
    expect(branch).toContain('if (!note.done) setVerdict(id, "shortlisted");');
    expect(branch).toContain('.catch(() => { setVerdict(id, "shortlisted");');
    expect(agent).toContain('import { takenBackNote, undoNote } from "./verdictUndo";');
  });
});

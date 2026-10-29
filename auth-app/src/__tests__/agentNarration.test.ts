import { describe, expect, it } from "vitest";
import { effectOf, phaseOf } from "../agentEvents";
import { applyPhase, applyPhaseEvent, closePhases, lineCount, lineNote, running, verdictOf } from "../agentPhases";
import type { PhaseLine } from "../agentPhases";
import type { ChatCard } from "../api/agent";
import type { RunEvent } from "../api/events";
import { applyEvent, claim, effectsOf, mergeItems, newTurn, searchEnded, withScored } from "../liveChat";
import type { ChatState, Search } from "../liveChat";
import { linesOf } from "../LiveTurn";

/**
 * A run says what it is doing in `progress` events with `step: "phase"`: one line per phase, in the order the
 * phases began, each moving forward only. The same events replayed, doubled or arriving late rebuild the same lines.
 */

let nextId = 0;
const seqs: Record<string, number> = {};
const ev = (runId: string, type: RunEvent["type"], payload: Record<string, unknown> = {}, seq?: number): RunEvent => ({
  ...payload, id: ++nextId, runId, seq: seq ?? (seqs[runId] = (seqs[runId] ?? 0) + 1), type, at: "2026-10-11T10:00:05.000Z",
});
const phase = (runId: string, p: Record<string, unknown>, seq?: number) => ev(runId, "progress", { step: "phase", ...p }, seq);

function chat(runId = "r1"): ChatState {
  const turn = { ...newTurn("t1", "Find me people", Date.parse("2026-10-11T10:00:00.000Z")), runId, status: "working" as const };
  return { conversationId: "c1", turns: [turn], owners: { [runId]: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
}
const play = (s: ChatState, events: RunEvent[]) => events.reduce(applyEvent, s);

describe("reading a phase event", () => {
  it("takes the vocabulary as it is sent, with the id defaulting to the phase", () => {
    const e = phase("r1", { phase: "search", state: "running", label: "Looking through our pool of candidates", detail: "Software Engineer, Remote" });
    expect(phaseOf(e)).toEqual({ step: "phase", id: "search", phase: "search", state: "running", label: "Looking through our pool of candidates", detail: "Software Engineer, Remote" });
  });

  it("is null for anything else, and never throws on a malformed one", () => {
    expect(phaseOf(ev("r1", "progress", { step: "tool", tool: "pipeline" }))).toBeNull();
    expect(phaseOf(phase("r1", { phase: "search" }))).toBeNull();
    expect(phaseOf(phase("r1", { label: "x" }))).toBeNull();
    expect(phaseOf(phase("r1", { phase: "search", label: "x", state: "weird", done: -4, total: "9" }))).toMatchObject({ state: "running" });
    expect(phaseOf(phase("r1", { phase: "search", label: "x", done: -4 }))).not.toHaveProperty("done");
  });

  it("reads an effect, dropping the views it doesn't know", () => {
    const e = ev("r1", "progress", { step: "effect", capability: "pipeline.shortlist", effects: ["pipeline", "hologram", "candidates"], campaignId: "c1", summary: "Added 25", counts: { added: 25, junk: "x" } });
    expect(effectOf(e)).toEqual({ step: "effect", capability: "pipeline.shortlist", effects: ["pipeline", "candidates"], campaignId: "c1", summary: "Added 25", counts: { added: 25 } });
    expect(effectOf(ev("r1", "progress", { step: "phase", phase: "search", label: "x" }))).toBeNull();
  });
});

describe("the lines of a run", () => {
  it("keeps one line per phase, in the order they began, and moves it from running to done in place", () => {
    const s = play(chat(), [
      phase("r1", { id: "understand", phase: "understand", state: "running", label: "Reading the requirements" }),
      phase("r1", { id: "search", phase: "search", state: "running", label: "Looking through our pool of candidates" }),
      phase("r1", { id: "understand", phase: "understand", state: "done", label: "Read the requirements" }),
      phase("r1", { id: "search", phase: "search", state: "done", label: "Got 30 candidates", found: 30 }),
    ]);
    expect(s.turns[0]?.phases.map((l) => [l.id, l.state, l.label])).toEqual([
      ["understand", "done", "Read the requirements"],
      ["search", "done", "Got 30 candidates"],
    ]);
  });

  it("ignores an event it has already shown, and one that arrives after a newer one", () => {
    const p = (state: "running" | "done", label: string) => phaseOf(phase("r", { id: "match", phase: "match", state, label }))!;
    let lines: readonly PhaseLine[] = [];
    lines = applyPhase(lines, p("running", "Matching candidates to the role"), 3);
    lines = applyPhase(lines, p("done", "Matched 30 candidates"), 7);
    const again = applyPhase(lines, p("done", "Matched 30 candidates"), 7);
    expect(again).toBe(lines);
    // A late "still running" does not bring a finished phase back.
    const late = applyPhase(lines, p("running", "Matching candidates to the role"), 5);
    expect(late).toBe(lines);
    expect(late[0]).toMatchObject({ state: "done", label: "Matched 30 candidates", seq: 7 });
  });

  it("rebuilds the same lines when the whole stream is replayed, doubled or shuffled within a phase", () => {
    const events = [
      phase("r1", { id: "search", phase: "search", state: "running", label: "Looking" }, 1),
      phase("r1", { id: "match", phase: "match", state: "running", label: "Matching", done: 0, total: 30 }, 2),
      phase("r1", { id: "match", phase: "match", state: "running", label: "Matching", done: 12, total: 30 }, 3),
      phase("r1", { id: "search", phase: "search", state: "done", label: "Got 30 candidates", found: 30 }, 4),
      phase("r1", { id: "match", phase: "match", state: "done", label: "Matched 30", done: 30, total: 30 }, 5),
    ];
    const once = events.reduce<readonly PhaseLine[]>(applyPhaseEvent, []);
    const twice = [...events, ...events].reduce<readonly PhaseLine[]>(applyPhaseEvent, []);
    const shuffled = [events[0], events[4], events[2], events[1], events[3], events[4]].reduce<readonly PhaseLine[]>((l, e) => applyPhaseEvent(l, e!), []);
    expect(twice).toEqual(once);
    // Whatever the order they arrive in, each line ends on the newest event for its phase.
    expect(shuffled.map((l) => [l.id, l.state, l.seq])).toEqual([["search", "done", 4], ["match", "done", 5]]);
    expect(once.map((l) => [l.id, l.state])).toEqual([["search", "done"], ["match", "done"]]);
  });

  it("keeps the detail the running line had when the done line brings none", () => {
    const lines = [
      phase("r", { id: "search", phase: "search", state: "running", label: "Looking", detail: "Software Engineer, Remote" }, 1),
      phase("r", { id: "search", phase: "search", state: "done", label: "Got 30 candidates", found: 30 }, 2),
    ].reduce<readonly PhaseLine[]>(applyPhaseEvent, []);
    expect(lines[0]).toMatchObject({ state: "done", detail: "Software Engineer, Remote", found: 30 });
  });

  it("closes what a finished run left running, as done, or as failed when the run failed", () => {
    const running1 = play(chat(), [phase("r1", { id: "write", phase: "write", state: "running", label: "Writing the answer" })]);
    expect(play(running1, [ev("r1", "done")]).turns[0]?.phases[0]?.state).toBe("done");
    expect(play(running1, [ev("r1", "error", { message: "The agent couldn't answer this time." })]).turns[0]?.phases[0]?.state).toBe("failed");
    expect(closePhases([], "done")).toEqual([]);
  });

  it("says counts the label doesn't already carry, and what is running now", () => {
    const l = (over: Partial<PhaseLine>): PhaseLine => ({ id: "m", phase: "match", state: "running", label: "Matching candidates to the role", seq: 1, ...over });
    expect(lineCount(l({ done: 12, total: 30 }))).toBe("12 of 30");
    expect(lineCount(l({ label: "Scoring 12 of 30", done: 12, total: 30 }))).toBeNull();
    expect(lineCount(l({ state: "done", label: "Got 30 candidates", found: 30 }))).toBeNull();
    expect(lineCount(l({ state: "done", label: "Looked through the pool", found: 30 }))).toBe("30 found");
    expect(lineNote(l({ detail: "Software Engineer", done: 12, total: 30 }))).toBe("Software Engineer · 12 of 30");
    expect(running([l({ id: "a", state: "done" }), l({ id: "b" })])?.id).toBe("b");
  });
});

describe("a working turn always has lines to show", () => {
  it("falls back to the tools it has used when a server sends no phases", () => {
    const t = { ...newTurn("t", "hi"), steps: [{ tool: "pipeline", status: "done" as const }, { tool: "campaign_matches", status: "running" as const }] };
    expect(linesOf(t).map((l) => [l.state, l.label])).toEqual([["done", "Checked the pipeline"], ["running", "Going through the people found"]]);
    expect(linesOf({ ...t, phases: [{ id: "u", phase: "understand", state: "running", label: "Reading", seq: 1 }] })).toHaveLength(1);
    expect(linesOf(newTurn("t", "hi"))).toEqual([]);
  });
});

describe("a search's own narration and rows", () => {
  const fresh = (): Search => ({
    runId: "s1", campaignId: "c1", size: 30, pool: null, fresh: null, scored: 0, items: null, notices: [], phases: [], scoredIds: [],
    status: "running", error: null,
  });
  const claim = (s: ChatState): ChatState => ({
    ...s,
    turns: s.turns.map((t) => ({ ...t, searches: [fresh()] })),
    owners: { ...s.owners, s1: "t1" },
  });
  const search = (s: ChatState): Search => s.turns[0]!.searches[0]!;
  const match = (personId: string, score: number | null) => ({ personId, fullName: personId, score, tier: null, knockedOut: null }) as never;

  it("shows the search's phases on the search, not on the chat's own turn", () => {
    const s = play(claim(chat()), [
      phase("s1", { id: "search", phase: "search", state: "running", label: "Looking through our pool of candidates" }),
      phase("s1", { id: "search", phase: "search", state: "done", label: "Got 30 candidates", found: 30 }),
      phase("s1", { id: "match", phase: "match", state: "running", label: "Matching candidates to the role", done: 0, total: 30 }),
    ]);
    expect(search(s).phases.map((l) => [l.id, l.state])).toEqual([["search", "done"], ["match", "running"]]);
    expect(s.turns[0]?.phases).toEqual([]);
  });

  it("fills rows in as people are scored, best first, once a person, and lets the whole list replace them", () => {
    let s = claim(chat());
    s = play(s, [
      ev("s1", "progress", { step: "scored", personId: "p1", stage: "judged", tier: "B", item: match("p1", 0.62) }),
      ev("s1", "progress", { step: "scored", personId: "p2", stage: "judged", tier: "A", item: match("p2", 0.91) }),
      ev("s1", "progress", { step: "scored", personId: "p1", stage: "judged", tier: "B", item: match("p1", 0.62) }, 1),
    ]);
    expect(search(s).items?.map((m) => m.personId)).toEqual(["p2", "p1"]);
    expect(search(s).scored).toBe(2);
    s = play(s, [ev("s1", "artifact", { kind: "candidate_list", partial: true, items: [match("p3", 0.7)] })]);
    expect(search(s).items?.map((m) => m.personId)).toEqual(["p3", "p2", "p1"]);
    s = play(s, [ev("s1", "artifact", { kind: "candidate_list", items: [match("p2", 0.91), match("p3", 0.7)] })]);
    expect(search(s).items?.map((m) => m.personId)).toEqual(["p2", "p3"]);
  });

  it("counts a score that brings no person, and the same one only once", () => {
    const s = play(claim(chat()), [
      ev("s1", "progress", { step: "scored", personId: "p1", stage: "judged", tier: "B" }),
      ev("s1", "progress", { step: "scored", personId: "p1", stage: "judged", tier: "B" }),
      ev("s1", "progress", { step: "scored", stage: "rules", tier: null }),
    ]);
    expect(search(s).scored).toBe(2);
    expect(search(s).items).toBeNull();
  });

  it("merges partial batches without duplicating anybody", () => {
    expect(mergeItems(null, [match("a", 1)], true).map((m) => m.personId)).toEqual(["a"]);
    expect(withScored([match("a", 0.5)], match("a", 0.9)).map((m) => m.score)).toEqual([0.9]);
  });
});

describe("cards of kinds the console is told about", () => {
  const cards = (events: RunEvent[]): ChatCard[] => play(chat(), events).turns[0]!.cards;

  it("keeps an outcome, with its counts and next steps", () => {
    const [c] = cards([ev("r1", "artifact", {
      kind: "outcome", key: "o1", summary: "Added 25 people to the shortlist of Software Engineer.", counts: { added: 25, alreadyThere: 0, junk: "x" },
      next: [{ label: "Start outreach", text: "Start outreach for the shortlist" }, { label: "Open the shortlist", href: "#/campaign/shortlisted" }, { nope: 1 }],
    })]);
    expect(c).toMatchObject({
      kind: "outcome", summary: "Added 25 people to the shortlist of Software Engineer.", counts: { added: 25, alreadyThere: 0 },
      next: [{ label: "Start outreach", text: "Start outreach for the shortlist" }, { label: "Open the shortlist", href: "#/campaign/shortlisted" }],
    });
  });

  it("keeps a connect card with the link the server made", () => {
    const [c] = cards([ev("r1", "artifact", { kind: "connect", key: "k", provider: "google", url: "https://accounts.example/auth?x=1", reason: "Needed to send email." })]);
    expect(c).toMatchObject({ kind: "connect", provider: "google", url: "https://accounts.example/auth?x=1", reason: "Needed to send email." });
    // A provider it doesn't know is not a card it can draw.
    expect(cards([ev("r1", "artifact", { kind: "connect", key: "k", provider: "carrier-pigeon" })])).toEqual([]);
  });

  it("keeps a kind from a newer server in its place, without breaking", () => {
    const list = cards([
      ev("r1", "artifact", { kind: "campaigns", key: "a", items: [] }),
      ev("r1", "artifact", { kind: "timeline", key: "b", rows: [] }),
      ev("r1", "artifact", { kind: "campaigns", key: "c", items: [] }),
    ]);
    expect(list.map((c) => c.key)).toEqual(["a", "b", "c"]);
    expect(list[1]).toEqual({ kind: "unknown", key: "b", was: "timeline" });
  });
});

describe("what a write says it changed", () => {
  it("takes it from an effect event, and from an approved action's result on a server that sends none", () => {
    expect(effectsOf(ev("r1", "progress", { step: "effect", capability: "pipeline.shortlist", effects: ["pipeline", "candidates"], campaignId: "c1", summary: "x" })))
      .toEqual({ effects: ["pipeline", "candidates"], campaignId: "c1", capability: "pipeline.shortlist" });
    expect(effectsOf(ev("r1", "result", { approvalSeq: 2, decision: "approve", action: "shortlist", campaignId: "c1", added: 25 })))
      .toEqual({ effects: ["pipeline", "campaign", "candidates"], campaignId: "c1", capability: "shortlist" });
    // The result's own capability and effects win over what the action name implies.
    expect(effectsOf(ev("r1", "result", { approvalSeq: 2, decision: "approve", action: "set_status", capability: "campaign.set_status", effects: ["campaign", "pipeline", "sourcing"], campaignId: "c1" })))
      .toEqual({ effects: ["campaign", "pipeline", "sourcing"], campaignId: "c1", capability: "campaign.set_status" });
    // A write with no effect kind (a task) is still a write: it says which one it was.
    expect(effectsOf(ev("r1", "progress", { step: "effect", capability: "team.create_task", effects: [], summary: "Made the task" })))
      .toEqual({ effects: [], campaignId: null, capability: "team.create_task" });
    expect(effectsOf(ev("r1", "result", { approvalSeq: 2, decision: "decline", action: "shortlist", campaignId: "c1" }))).toBeNull();
    // An action this build has no row for is a write all the same: read again by name, never left on old figures.
    expect(effectsOf(ev("r1", "result", { approvalSeq: 2, decision: "approve", action: "something_new" })))
      .toEqual({ effects: [], campaignId: null, capability: "something_new" });
    expect(effectsOf(ev("r1", "message", { delta: "hi" }))).toBeNull();
  });
});

describe("the outcome of a search stays in view", () => {
  const line = (id: string, phase: string, state: PhaseLine["state"], label: string, detail?: string): PhaseLine => ({
    id, phase, state, label, seq: 1, ...(detail ? { detail } : {}),
  });

  it("is the last finished 'decide' line, with what it said", () => {
    const lines = [
      line("understand", "understand", "done", "Reading the requirements"),
      line("search", "search", "done", "Got 30 candidates"),
      line("decide", "decide", "done", "Ready for your call", "3 good fits, 2 partial fits"),
    ];
    const v = verdictOf(lines);
    expect(v?.label).toBe("Ready for your call");
    expect(lineNote(v!)).toBe("3 good fits, 2 partial fits");
    expect(verdictOf(lines.slice(0, 2))).toBeUndefined();
    // Still running is not yet a call to make.
    expect(verdictOf([line("decide", "decide", "running", "Getting ready")])).toBeUndefined();
  });
});

describe("a search that ends moves the figures that count its people", () => {
  const chat = (): ChatState => {
    const turn = { ...newTurn("t1", "Find engineers"), runId: "r1", status: "working" as const };
    const base: ChatState = { conversationId: "c1", turns: [turn], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
    return claim(base, "s1", "t1", { campaignId: "camp-1", size: 20 });
  };

  it("says the board, the campaign's figures and the candidates are stale, for that campaign", () => {
    const changed = searchEnded(chat(), ev("s1", "done"));
    expect(changed?.campaignId).toBe("camp-1");
    expect(changed?.effects).toEqual(expect.arrayContaining(["sourcing", "pipeline", "campaign", "candidates"]));
  });

  it("says nothing for the chat's own run, or for an event that is not an ending", () => {
    expect(searchEnded(chat(), ev("r1", "done"))).toBeNull();
    expect(searchEnded(chat(), ev("s1", "progress", { step: "pool", found: 30 }))).toBeNull();
    expect(searchEnded(chat(), ev("unknown", "done"))).toBeNull();
  });
});

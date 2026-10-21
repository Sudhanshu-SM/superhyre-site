import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleSpec, RoleSpecCardData, SpecRow } from "../api/agent";
import { RoleSpecCardView } from "../agentCards/RoleSpecCard";
import type { CardState } from "../agentCards/RoleSpecCard";
import { SpecEditor } from "../agentCards/SpecEditor";
import { addRequirement, editText, leaveStep, moveRequirement, removeRequirement, sameSpec, specMeta, specProblem, tidy } from "../agentCards/specEdit";
import { bucketsLine, bucketsOfRows, countsLine, specView, standingLine, standingOf, statusWord } from "../agentCards/specView";
import type { Standing } from "../agentCards/specView";
import { PhaseTimeline } from "../agentCards/PhaseTimeline";
import { sourcingRun } from "../agentCards/fixtures";
import { searchFromMatches } from "../agentCards/searchFeed";
import { SearchRun } from "../liveViews/SearchRun";
import type { RunEvent } from "../api/events";
import { applyEvent, applySearch, newSearch, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";

const calls = vi.hoisted(() => ({ save: vi.fn(), approve: vi.fn(), draft: vi.fn(), sourcing: vi.fn(), send: vi.fn(), decide: vi.fn() }));
vi.mock("../api/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/agent")>()),
  specApi: { save: calls.save, approve: calls.approve, draft: calls.draft, get: vi.fn() },
  agentApi: { sourcing: calls.sourcing },
}));
vi.mock("../liveChat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../liveChat")>()),
  sendMessage: calls.send,
  decide: calls.decide,
}));

/**
 * The role spec card: the drafted spec as one card with its own Approve (no chip that sends a message, no second approval
 * card), the whole spec edited at once in a popup, and a state that comes from the server, not from the transcript.
 */

const SPEC: RoleSpec = {
  title: "Senior Product Designer",
  seniority: "Senior",
  yearsMin: 4,
  locations: ["Bengaluru"],
  remoteOk: true,
  avoid: [],
  requirements: [
    ...["Figma", "Design systems", "B2B SaaS", "User research", "Prototyping", "Accessibility", "Motion", "Writing", "Facilitation"].map((text, i) => ({
      id: `r${i + 1}`, kind: "skill" as const, text, importance: "must" as const, weight: 0.8,
    })),
    { id: "r10", kind: "skill", text: "Framer", importance: "nice", weight: 0.3 },
    { id: "r11", kind: "skill", text: "Illustration", importance: "nice", weight: 0.3 },
    { id: "r12", kind: "skill", text: "Data viz", importance: "nice", weight: 0.3 },
  ],
};
const ROW = (over: Partial<SpecRow> = {}): SpecRow => ({ id: "s1", version: 1, spec: SPEC, jdText: null, approvedAt: null, createdAt: "2026-10-20T10:00:00Z", ...over });

const CARD: RoleSpecCardData = {
  kind: "role_spec", key: "role_spec:c1", campaignId: "c1", campaignName: "Senior Product Designer", specId: "s1", version: 1,
  spec: { title: "Senior Product Designer", seniority: "Senior", locations: ["Bengaluru"], remoteOk: true, yearsMin: 4, yearsMax: null, mustCount: 9, niceCount: 3, musts: ["Figma", "Design systems", "B2B SaaS", "User research"], avoid: [] },
  approved: false, trouble: null,
};

const live = (latest: SpecRow | null, drafting = false) => ({ ready: true, latest, drafting });
const state = (over: Partial<CardState> = {}, row: SpecRow | null = ROW()): CardState => ({
  view: specView(CARD, live(row)), busy: null, problem: null, searching: false, standing: null, may: true, ...over,
});
const draw = (s: CardState, card: RoleSpecCardData = CARD) =>
  renderToStaticMarkup(<RoleSpecCardView card={card} state={s} onApprove={() => undefined} onDraft={() => undefined} onOpen={() => undefined} onScore={() => undefined} />);
const stand = (found: number, unscored = 0, running: Standing["running"] = null): Standing => standingOf({ shown: found, unscored, running });
const APPROVED = () => ROW({ approvedAt: "2026-10-20T10:01:00Z" });

beforeEach(() => { for (const f of Object.values(calls)) f.mockReset(); });

describe("the card in each state", () => {
  it("a draft shows the spec as a summary and the decision under it", () => {
    const html = draw(state());
    expect(html).toContain("Senior Product Designer");
    expect(html).toContain("Draft v1");
    expect(html).toContain("Senior · Bengaluru, Remote is fine · 4+ years");
    // The first four must-haves, then how many more; the nice-to-haves as a count.
    for (const m of ["Figma", "Design systems", "B2B SaaS", "User research"]) expect(html).toContain(`<li>${m}</li>`);
    expect(html).not.toContain("<li>Prototyping</li>");
    expect(html).toContain("+5 more");
    expect(html).toContain("3 nice-to-haves");
    expect(html).toContain("Approve and start finding people");
    expect(html).toContain("View and edit spec");
    // Not a written link, and no chip that sends a message.
    expect(html).not.toContain("lt-link");
    expect(html).not.toContain("rep-opt");
  });

  it("approving says so on the button and the status, and offers nothing else to press", () => {
    const html = draw(state({ busy: "approve" }));
    expect(html).toContain("Approving");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"|<button[^>]*aria-busy="true"[^>]*disabled=""/);
    expect(html).toContain('aria-busy="true"');
  });

  it("while it finds people the buttons step aside (the search itself is drawn under the card)", () => {
    const html = draw(state({ searching: true }, ROW({ approvedAt: "2026-10-20T10:01:00Z" })));
    expect(html).toContain("Approved");
    expect(html).toContain("9 must-haves, 3 nice-to-haves");
    expect(html).not.toContain("Approve and start finding people");
    expect(html).not.toContain("cta-row");
  });

  it("settles to approved with how many it found and a way to open the campaign", () => {
    const html = draw(state({ standing: stand(20) }, APPROVED()));
    expect(html).toContain("Approved");
    expect(html).toContain("20 people found.");
    expect(html).toContain('href="#/campaign?campaign=c1"');
    expect(html).toContain("Open campaign");
    expect(html).not.toContain("Approve and start finding people");
    // Calm: the must-have list is not repeated once it is decided.
    expect(html).not.toContain("<li>Figma</li>");
  });

  it("a search that found nobody can be started again from the card", () => {
    const html = draw(state({ standing: stand(0) }, APPROVED()));
    expect(html).toContain("Nobody found yet.");
    expect(html).toContain("Find people");
  });

  it("a failed approval says why in the card, and the button reads Try again", () => {
    const html = draw(state({ problem: "The role spec needs at least one must-have." }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("The role spec needs at least one must-have.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Approve and start finding people");
  });

  it("a draft that never came through is a card with Try again in it, and nothing to approve", () => {
    const card: RoleSpecCardData = { ...CARD, specId: null, version: null, spec: null, trouble: "The role spec didn't come through this time. The job description is saved, so you can try again." };
    const html = draw(state({ view: specView(card, live(null)) }, null), card);
    expect(html).toContain("Not drafted");
    expect(html).toContain("The job description is saved, so you can try again.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Approve and start finding people");
  });

  it("someone who only follows the campaign can read the spec but is not offered the decision", () => {
    const html = draw(state({ may: false }));
    expect(html).toContain("View spec");
    expect(html).toMatch(/rc-line">(You can follow this campaign|This campaign isn&#x27;t on a team you lead)/);
    expect(html).not.toContain("Approve and start finding people");
  });
});

describe("what the card says comes from the spec on the server", () => {
  it("is approved after a reload even though the card was made as a draft", () => {
    expect(specView(CARD, live(ROW({ approvedAt: "2026-10-20T10:01:00Z" }))).state).toBe("approved");
    expect(statusWord(specView(CARD, live(ROW({ approvedAt: "x" }))), null)).toBe("Approved");
  });

  it("is the next version, still a draft, after an edit is saved", () => {
    const v2 = specView(CARD, live(ROW({ id: "s2", version: 2, spec: { ...SPEC, title: "Lead Product Designer" } })));
    expect(v2).toMatchObject({ state: "draft", version: 2, specId: "s2", title: "Lead Product Designer" });
    expect(statusWord(v2, null)).toBe("Draft v2");
  });

  it("shows what it was made with until the server has answered, then the server's word", () => {
    expect(specView(CARD, { ready: false, latest: null, drafting: false })).toMatchObject({ state: "draft", mustCount: 9, more: 5 });
    expect(specView(CARD, live(null, true)).state).toBe("drafting");
  });

  it("says its numbers plainly", () => {
    expect(countsLine(9, 3)).toBe("9 must-haves, 3 nice-to-haves");
    expect(countsLine(1, 0)).toBe("1 must-have");
    expect(standingLine(stand(20))).toBe("20 people found.");
    expect(standingLine(stand(1))).toBe("1 person found.");
    expect(standingLine(stand(0))).toBe("Nobody found yet.");
  });
});

describe("it says the truth about the search, and about who is scored", () => {
  it("names the people who are not scored yet in one line, with all three numbers, and offers to score the rest", () => {
    const html = draw(state({ standing: stand(30, 15) }, APPROVED()));
    expect(html).toContain("30 found. 15 matched closely, 15 not scored yet.");
    expect(html).toContain("Score the rest");
    expect(html).not.toContain("30 people found.");
  });

  it("says they are not scored yet when none are, and offers to score them", () => {
    const html = draw(state({ standing: stand(30, 30) }, APPROVED()));
    expect(html).toContain("30 found. 30 not scored yet.");
    expect(html).toContain("Score them");
  });

  it("has nothing to score once everyone is read, and says only how many were found", () => {
    const html = draw(state({ standing: stand(30, 0) }, APPROVED()));
    expect(html).toContain("30 people found.");
    expect(html).not.toContain("Score the");
    expect(html).not.toContain("not scored yet");
  });

  it("keeps the three numbers one read: more people found moves all of them together", () => {
    expect(standingLine(standingOf({ shown: 40, counts: { found: 40, shortlisted: 0, passed: 0, toReview: 0, ruledOut: 0, unranked: 0 }, unscored: 25, running: null }))).toBe(
      "40 found. 15 matched closely, 25 not scored yet.",
    );
    // The server's own buckets win, in the product's words, and every line agrees with the list they came from.
    const b = { found: 30, strong: 2, good: 5, partial: 4, needsEvidence: 19, notScored: 0, ruledOut: 0 };
    expect(standingLine(standingOf({ shown: 30, unscored: 0, running: null, standing: b }))).toBe("30 found. 11 matched closely, 19 need more evidence.");
    expect(bucketsLine({ ...b, needsEvidence: 1, notScored: 2, ruledOut: 3, found: 17 })).toBe("17 found. 11 matched closely, 1 needs more evidence, 2 not scored yet, 3 ruled out.");
    const rows = [{ status: "scored", tier: "A" }, { status: "insufficient_evidence", tier: null }, { status: "not_scored_yet", tier: null }, { status: "knocked_out", tier: null }];
    expect(bucketsOfRows(rows)).toEqual({ found: 4, strong: 1, good: 0, partial: 0, needsEvidence: 1, notScored: 1, ruledOut: 1 });
    // A server that cannot say who is unscored claims nothing about it.
    expect(standingLine(standingOf({ shown: 30 }))).toBe("30 people found.");
    // More unscored than found cannot happen on screen.
    expect(standingOf({ shown: 3, unscored: 9 }).unscored).toBe(3);
  });

  it("opened while a run is still going it does not announce the end: the run is followed from its start", () => {
    const html = draw(state({ searching: true, standing: stand(30, 15, { runId: "run-1", kind: "search" }) }, APPROVED()));
    expect(html).not.toContain("people found");
    expect(html).not.toContain("not scored yet");
    expect(html).not.toContain("Open campaign");
  });

  it("a search another part of the chat started is a quiet line, not numbers that are about to change", () => {
    const html = draw(state({ standing: stand(30, 0, { runId: "run-2", kind: "search" }) }, APPROVED()));
    expect(html).toContain("Matching more people");
    expect(html).not.toContain("30 people found");
    expect(html).not.toContain("Score the");
  });

  it("while it scores the rest the button says so and the others wait", () => {
    const html = draw(state({ busy: "score", standing: stand(30, 15) }, APPROVED()));
    expect(html).toContain("Approved");
    expect(html).toMatch(/<button[^>]*aria-busy="true"[^>]*>/);
  });

  it("stands in the chat while the job description is read: the title, a quiet line and shimmer, nothing to press", () => {
    const card: RoleSpecCardData = { ...CARD, specId: null, version: null, spec: null, status: "drafting" };
    const html = draw(state({ view: specView(card, { ready: true, latest: null, drafting: false }) }, null), card);
    expect(html).toContain("Reading the job description…");
    expect(html).toContain("Drafting");
    expect(html).toContain("shm-text");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Try again");
  });

  it("a moving bar shows on work of a known size, and fills as each group lands", () => {
    const line = (done: number) => [{ id: "match", phase: "decide", state: "running" as const, label: "Matching them to the role", done, total: 30, seq: 1 }];
    const start = renderToStaticMarkup(<PhaseTimeline lines={line(0)} working />);
    expect(start).toContain("pt-bar");
    expect(start).toContain("width:6%");
    expect(renderToStaticMarkup(<PhaseTimeline lines={line(15)} working />)).toContain("width:50%");
    expect(renderToStaticMarkup(<PhaseTimeline lines={[{ ...line(30)[0]!, state: "done" as const }]} working={false} />)).not.toContain("pt-bar");
  });
});

describe("the popup", () => {
  it("asks once before edits are lost, and a second Escape goes back to them", () => {
    expect(leaveStep(false, false)).toBe("close");
    expect(leaveStep(true, false)).toBe("ask");
    expect(leaveStep(true, true)).toBe("keep");
  });

  it("names the spec by its title, as the card does", () => {
    const v = specView(CARD, live(ROW()));
    expect(v.title).toBe("Senior Product Designer");
  });
});

describe("the people it found are under the card, as the chat always drew them", () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("a search the approval started draws the stages, then the ranked cards as people are scored, from the run's own events", () => {
    const events = sourcingRun("r1", "s1").turn.map((s) => s.event).filter((e) => e.runId === "s1");
    // Midway: three people scored, the run still working.
    let search = newSearch("s1", "c1");
    for (const e of events.slice(0, events.findIndex((x) => x.type === "progress" && x.step === "scored" && x.personId === "p4"))) search = applySearch(search, e);
    expect(search.status).toBe("running");
    expect(search.items?.map((m) => m.personId)).toEqual(["p1", "p2", "p3"]);
    const midway = text(renderToStaticMarkup(<SearchRun turnKey="role_spec:c1" search={search} latest />));
    expect(midway).toContain("Asha Verma");
    expect(midway).toContain("Ravi Kumar");
    expect(midway).toContain("Finding people");
    expect(midway).toContain("3 found");
    // The end: the whole list, the stages folded into how it went, the way to a bigger list.
    let done = newSearch("s1", "c1");
    for (const e of events) done = applySearch(done, e);
    expect(done.status).toBe("done");
    const html = text(renderToStaticMarkup(<SearchRun turnKey="role_spec:c1" search={done} latest />));
    expect(html).toContain("Shortlist");
    expect(html).toContain("Asha Verma");
    expect(html).toContain("Top matches");
  });

  it("is drawn again from the campaign's ranked list when the page is reloaded, with nothing to follow", () => {
    const search = searchFromMatches("c1", { rows: sourcingRun().turn.flatMap((s) => (s.event.type === "artifact" && Array.isArray(s.event.items) ? (s.event.items as never[]) : [])) });
    expect(search).toMatchObject({ status: "done", campaignId: "c1" });
    expect(search?.items).toHaveLength(8);
    const html = text(renderToStaticMarkup(<SearchRun turnKey="role_spec:c1" search={search!} latest />));
    expect(html).toContain("Asha Verma");
    expect(html).toContain("Top matches");
    expect(searchFromMatches("c1", { rows: [] })).toBeNull();
  });

  it("the progress line has no reserved empty band before its first line arrives", () => {
    const html = renderToStaticMarkup(<PhaseTimeline lines={[{ id: "match", phase: "match", state: "running" as const, label: "Matching them to the role", done: 0, total: 30, seq: 1 }]} working feed={[]} />);
    expect(html).not.toContain("pt-feed");
    expect(html).toContain("pt-bar");
  });
});

describe("the whole spec edited at once", () => {
  it("edits a line, moves it between Must have and Nice to have, removes it and adds one, without touching the rest", () => {
    const edited = editText(SPEC, "r1", "Figma, daily");
    expect(edited.requirements[0]?.text).toBe("Figma, daily");
    expect(edited.requirements).toHaveLength(12);

    const moved = moveRequirement(SPEC, "r1", "nice");
    expect(moved.requirements.find((r) => r.id === "r1")).toMatchObject({ importance: "nice", weight: 0.3 });
    expect(moveRequirement(moved, "r1", "must").requirements.find((r) => r.id === "r1")).toMatchObject({ importance: "must", weight: 0.8 });

    expect(removeRequirement(SPEC, "r2").requirements.map((r) => r.id)).not.toContain("r2");
    const lone: RoleSpec = { ...SPEC, requirements: [SPEC.requirements[0]!] };
    expect(removeRequirement(lone, "r1").requirements).toHaveLength(1);

    const added = addRequirement(SPEC, "  Stakeholder   management ", "nice");
    expect(added.requirements.at(-1)).toMatchObject({ id: "r13", text: "Stakeholder management", importance: "nice", weight: 0.3 });
    expect(addRequirement(SPEC, " x ", "must")).toBe(SPEC);
  });

  it("knows when there is something to save, and when what was typed cannot be saved", () => {
    expect(sameSpec(SPEC, tidy({ ...SPEC, title: "  Senior Product Designer " }))).toBe(true);
    expect(sameSpec(SPEC, editText(SPEC, "r1", "Figma and Sketch"))).toBe(false);
    expect(specProblem(SPEC)).toBeNull();
    expect(specProblem(editText(SPEC, "r1", ""))).toBe("Each requirement needs a few words.");
    expect(specProblem({ ...SPEC, title: "" })).toBe("The role needs a title.");
  });

  it("describes the role in one line", () => {
    expect(specMeta({ seniority: "Senior", locations: ["Pune", "Remote"], remoteOk: false, yearsMin: 3, yearsMax: 6 })).toBe("Senior · Pune, Remote · 3 to 6 years");
    expect(specMeta({ locations: [], remoteOk: true })).toBe("Remote is fine");
  });

  it("has the role's fields and both lists on one surface, with a small move and remove on each row and no per-row select", () => {
    const html = renderToStaticMarkup(<SpecEditor spec={SPEC} onChange={() => undefined} />);
    for (const label of ["Role", "Level", "Years of experience", "Location", "Remote is fine", "Must have", "Nice to have"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="Add to Must have"');
    expect(html).toContain('aria-label="Add to Nice to have"');
    expect(html).toContain('aria-label="Move to Nice to have"');
    expect(html).toContain('aria-label="Move to Must have"');
    expect(html).toContain('aria-label="Remove Figma"');
    expect(html).toContain('placeholder="Add requirement"');
    expect(html).not.toContain("<select");
    expect(html).not.toMatch(/>Move to</);
    // Nothing on a row approves or saves just that row.
    expect(html).not.toMatch(/Approve|Save/);
  });

  it("reads, and offers nothing to change, for someone who only follows the campaign", () => {
    const html = renderToStaticMarkup(<SpecEditor spec={SPEC} onChange={() => undefined} readOnly />);
    expect(html).not.toContain("se-act");
    expect(html).not.toContain("Add requirement");
    expect(html).toContain('readonly=""');
  });
});

describe("approving is the card's own call", () => {
  it("saves the edits, approves that version and starts the search, and sends the agent no message", async () => {
    const { approveAndFind } = await import("../agentCards/specActions");
    calls.save.mockResolvedValue(ROW({ id: "s2", version: 2 }));
    calls.approve.mockResolvedValue({ ...ROW({ id: "s2", version: 2 }), matching: { kind: "search", runId: "run-9", people: 30 } });
    const out = await approveAndFind("c1", "s1", editText(SPEC, "r1", "Figma, daily"));
    expect(out).toEqual({ runId: "run-9" });
    expect(calls.save).toHaveBeenCalledWith("c1", expect.objectContaining({ requirements: expect.arrayContaining([expect.objectContaining({ text: "Figma, daily" })]) }));
    expect(calls.approve).toHaveBeenCalledWith("c1", "s2", { match: true, actionId: expect.any(String) });
    expect(calls.save.mock.invocationCallOrder[0]).toBeLessThan(calls.approve.mock.invocationCallOrder[0]!);
    expect(calls.send).not.toHaveBeenCalled();
    expect(calls.decide).not.toHaveBeenCalled();
  });

  it("approves the version on the card as it is, without saving", async () => {
    const { approveAndFind } = await import("../agentCards/specActions");
    calls.approve.mockResolvedValue({ ...ROW(), matching: { kind: "search", runId: "run-1", people: 30 } });
    await approveAndFind("c1", "s1");
    expect(calls.save).not.toHaveBeenCalled();
    expect(calls.approve).toHaveBeenCalledWith("c1", "s1", { match: true, actionId: expect.any(String) });
    expect(calls.send).not.toHaveBeenCalled();
  });

  it("a refusal comes back to the card as the server's words", async () => {
    const { approveAndFind } = await import("../agentCards/specActions");
    calls.approve.mockRejectedValue(new Error("The role spec needs at least one must-have."));
    await expect(approveAndFind("c1", "s1")).rejects.toThrow("at least one must-have");
  });
});

describe("in the chat feed", () => {
  let n = 0;
  const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({ ...payload, id: ++n, runId: "r1", seq: n, type, at: "2026-10-20T10:00:05.000Z" });
  const fresh = (): ChatState => ({
    conversationId: "c", turns: [{ ...newTurn("t1", "Start a new campaign", 0), runId: "r1", status: "working" as const }],
    owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
  });

  it("the drafted spec arrives as one card: no approval to answer and no second turn", () => {
    const s = applyEvent(fresh(), ev("artifact", { ...CARD }));
    const turn = s.turns[0]!;
    expect(turn.cards).toMatchObject([{ kind: "role_spec", key: "role_spec:c1", campaignId: "c1", version: 1, approved: false }]);
    expect(turn.approvals).toHaveLength(0);
    expect(s.turns).toHaveLength(1);
  });

  it("a newer draft replaces the card in place, and the chat is replayed with it after a reload", () => {
    const first = ev("artifact", { ...CARD });
    const second = ev("artifact", { ...CARD, specId: "s2", version: 2 });
    const s = applyEvent(applyEvent(fresh(), first), second);
    expect(s.turns[0]!.cards).toHaveLength(1);
    expect(s.turns[0]!.cards[0]).toMatchObject({ version: 2, specId: "s2" });
    // Replaying the same events into a fresh feed (reopening the chat) gives the same card.
    const replay = applyEvent(applyEvent(fresh(), first), second);
    expect(replay.turns[0]!.cards).toEqual(s.turns[0]!.cards);
  });
});

describe("nothing starts a search by itself", () => {
  const body = (src: string, from: number): string => {
    let depth = 0;
    for (let i = src.indexOf("{", from); i < src.length; i++) {
      if (src[i] === "{") depth++;
      if (src[i] === "}" && --depth === 0) return src.slice(from, i + 1);
    }
    return src.slice(from);
  };
  const STARTERS = /\b(?:approveAndFind|scoreRest|draftAgain|saveSpec|startSourcing|startRescoring)\b|specApi\.(?:approve|draft|save)|agentApi\.(?:findMore|score)\b|flow\.(?:approve|score|draft|save)\b/;

  it("opening, reloading or re-rendering a card only reads: no effect on it calls anything that starts work", () => {
    for (const file of ["RoleSpecCard.tsx", "searchFeed.ts"]) {
      const src = readFileSync(join(__dirname, "..", "agentCards", file), "utf8");
      const effects = [...src.matchAll(/useEffect\(/g)].map((m) => body(src, m.index!));
      expect(effects.length, file).toBeGreaterThan(0);
      for (const e of effects) expect(e, `${file}: ${e.slice(0, 80)}`).not.toMatch(STARTERS);
    }
  });

  it("every press carries its own id, so the same press arriving twice is one search", async () => {
    const { approveAndFind, scoreRest, pressId } = await import("../agentCards/specActions");
    expect(pressId()).not.toBe(pressId());
    calls.approve.mockResolvedValue({ ...ROW(), matching: null });
    calls.sourcing.mockResolvedValue({ shown: 3 });
    await approveAndFind("c1", "s1");
    expect(calls.approve.mock.calls[0]![2].actionId).toEqual(expect.any(String));
    const scored = vi.fn().mockResolvedValue({ runId: "r", people: 1, already: false });
    const api = await import("../api/agent");
    (api.agentApi as unknown as { score: typeof scored }).score = scored;
    await scoreRest("c1");
    expect(scored).toHaveBeenCalledWith("c1", expect.any(String));
  });

  it("a search says in the campaign's history what asked for it", async () => {
    const { activityLine } = await import("../api/campaigns").then((m) => ({ activityLine: (m as unknown as { activityLine?: unknown }).activityLine }));
    void activityLine;
    const src = readFileSync(join(__dirname, "..", "api", "campaigns.ts"), "utf8");
    expect(src).toContain('"search_started"');
    expect(src).toContain("Asked ${by}");
  });
});

describe("the spec popup on the campaign page, the funnel and the public form", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("ends in a done state with a Close, says which version is being edited, and keeps its decision in view", () => {
    const panel = src("RoleSpecPanel.tsx");
    expect(panel).toContain("onFinish={(how) => void finished(how)}");
    expect(panel).toContain("`Done. ${");
    expect(panel).toContain("Editing approved version ${latest.version}. Saving makes draft version ${latest.version + 1}.");
    expect(panel).toContain('className="rs-foot"');
    expect(src("roleSpec.css")).toMatch(/\.rs-foot \{[^}]*position: sticky/);
    expect(src("CampaignWorkspace.tsx")).toContain("onClose={() => setSpecOpen(false)}");
  });

  it("keeps the room after the last funnel bar where the overview panel narrows the row, so Hired is reachable", () => {
    expect(src("boardStages.css")).toMatch(/\.ov4-panel \.ov2-funnel\[style\*="--n"\] \{ padding-inline-end: 36px; scroll-padding-inline: 36px; \}/);
  });

  it("sets what is typed in the phone field in ink, not in the placeholder's grey", () => {
    expect(src("apply.css")).toMatch(/\.ap-input:not\(:placeholder-shown\) \{ color: var\(--ink\)/);
    expect(src("ApplyForm.tsx")).toContain('" has-value"');
  });
});

describe("no text links in the chat's cards", () => {
  const dir = join(__dirname, "..", "agentCards");
  const files = [...readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => join(dir, f)), join(__dirname, "..", "LiveTurn.tsx")];

  it("writes no sentence-style link: every way on is a button or a chip", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} writes a text link`).not.toMatch(/lt-link/);
    }
  });

  it("opens pages only through Cta, headings and list rows", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const anchors = [...src.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
      for (const a of anchors) {
        const ok = file.endsWith("Cta.tsx") || /className="lk-row"/.test(a) || /^<a href=\{campaignHref\(/.test(a);
        expect(ok, `${file}: ${a}`).toBe(true);
      }
    }
  });

  it("has none of the old link wordings", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const words of ["Read the role spec first", "Show the role spec"]) {
        expect(src, `${file}: ${words}`).not.toContain(words);
      }
    }
  });
});

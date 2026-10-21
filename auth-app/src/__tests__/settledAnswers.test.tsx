import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "../agentCards/ApprovalCard";
import { OutcomeCard } from "../agentCards/OutcomeCard";
import { fitSteps, outcomeModel, withoutRepeat } from "../agentCards/outcome";
import type { PhaseLine } from "../agentPhases";
import type { RunEvent } from "../api/events";
import type { Match } from "../api/agent";
import { tokenButton } from "../connectStates";
import { settledLead, splitByTelling } from "../LiveTurn";
import { applyEvent, newTurn } from "../liveChat";
import type { Approval, ChatState, Search } from "../liveChat";
import { closeVerdict, fitsOnly, resultsCopy, scoredLine } from "../liveSourcing";
import { LiveMomentProvider } from "../liveViews/LiveMoment";
import { SearchRun } from "../liveViews/SearchRun";
import type { MomentCtx } from "../moments";
import { covers } from "../restated";

vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));
vi.mock("../campaignRights", () => ({
  FOLLOWING_LINE: "You're following this campaign.",
  useFollowingLine: () => "You're following this campaign.",
  useMayChangeCampaign: () => true,
}));

/**
 * What the chat says once a card has been answered: it reads as the outcome (no "Needs your OK", no box), the
 * agent's stale "waiting for your approval" goes, the next steps fit what was done, and a thing is said once.
 */

let n = 0;
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: ++n, runId: "r1", seq: n, type, at: "2026-10-15T10:00:00.000Z",
});
const proposed = (action: Record<string, unknown>, extra: Record<string, unknown> = {}): ChatState => {
  const turn = { ...newTurn("t1", "everyone who has answered the form add them to candidates", 0), runId: "r1", status: "working" as const };
  const s: ChatState = { conversationId: "c1", turns: [turn], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
  return applyEvent(s, ev("approval", { summary: "Save 6 people to Candidates (Staff Platform Engineer)", action, campaignName: "Staff Platform Engineer", people: [], ...extra }));
};
const answered = (s: ChatState, result: Record<string, unknown>): Approval => {
  const seq = s.turns[0]!.approvals[0]!.seq;
  return applyEvent(s, ev("result", { approvalSeq: seq, ...result })).turns[0]!.approvals[0]!;
};
const SAVE = { action: "decide_responses", campaignId: "c1", decision: "save", responseIds: ["a", "b"] };

describe("an answered card reads as the outcome", () => {
  const done = answered(proposed(SAVE), {
    decision: "approve", action: "decide_responses", campaignId: "c1",
    summary: "Saved 5 people to Candidates. They're not on Staff Platform Engineer's board. 1 person already in Candidates under the same email, so that person was left for you to link on the form's page.",
    counts: { saved: 5, matchedExisting: 1 },
    next: [{ label: "Shortlist them", text: "Shortlist the people who met every must-have on the form for Staff Platform Engineer" }],
  });

  it("has no 'Needs your OK' header, no box, and says what was done", () => {
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={done} turnSaid="x" />);
    expect(html).not.toContain("Needs your OK");
    expect(html).not.toContain("rep-card");
    expect(html).not.toContain("rep-app");
    expect(html).toContain("Saved 5 people to Candidates.");
    expect(html).not.toMatch(/waiting for your approval/i);
    expect(html).not.toContain(">Approve</button>");
  });

  it("keeps the question as it was while it waits: the header, the box and the two buttons", () => {
    const waiting = proposed(SAVE).turns[0]!.approvals[0]!;
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={waiting} turnSaid="x" />);
    expect(html).toContain("rep-card");
    expect(html).toContain("Needs your OK");
    expect(html).toContain(">Approve</button>");
    expect(html).toContain(">Not now</button>");
  });

  it("offers the next steps that fit saving people to Candidates: shortlist them, link the one held, find more", () => {
    const o = outcomeModel(done)!;
    // One person was left to be linked, so the way to the form's responses is one of the steps.
    expect(o.next.map((s) => s.label)).toEqual(["Shortlist them", "Open form responses", "Find more people"]);
    expect(o.next[2]).toMatchObject({ text: "Find more people for Staff Platform Engineer" });
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={done} turnSaid="x" />);
    expect(html).toContain(">Shortlist them</button>");
    expect(html).toContain(">Find more people</button>");
    expect(html).toMatch(/<a class="cta" href="#\/campaign\/forms\?campaign=c1">Open form responses/);
    expect(html).not.toContain("Start outreach");
  });

  it("offers outreach, and not shortlisting again, after the shortlist", () => {
    const added = answered(proposed({ ...SAVE, decision: "add" }), {
      decision: "approve", action: "decide_responses", campaignId: "c1", summary: "Shortlisted 4 people for Staff Platform Engineer.", counts: { shortlisted: 4 },
      next: [{ label: "Shortlist them", text: "Shortlist the people who met every must-have" }],
    });
    expect(outcomeModel(added)!.next.map((s) => s.label)).toEqual(["Start outreach"]);
  });

  it("never offers outreach for people who were only saved", () => {
    const steps = fitSteps(
      { action: "decide_responses", detail: SAVE, campaignName: "X" },
      { saved: 3 },
      [{ label: "Start outreach", text: "Reach out to the shortlist for X" }],
    );
    expect(steps.map((s) => s.label)).toEqual(["Shortlist them", "Find more people"]);
    // A save that saved nobody and left nobody to link has nobody new to find more for, but they can be shortlisted.
    expect(
      fitSteps({ action: "decide_responses", detail: SAVE, campaignName: "X" }, { saved: 0, alreadyThere: 3 }, []).map((s) => s.label),
    ).toEqual(["Shortlist them"]);
    // Nobody saved, nobody there: nothing to do with them.
    expect(fitSteps({ action: "decide_responses", detail: SAVE, campaignName: "X" }, { saved: 0 }, [])).toEqual([]);
  });

  it("offers the form's responses when people were left to be linked, and shortlisting only where someone is in Candidates", () => {
    const on = { action: "decide_responses", detail: SAVE, campaignName: "Staff Platform Engineer", campaignId: "c1" };
    // Nobody was saved and one person is held under the same email: the way to link them is the step.
    const held = fitSteps(on, { saved: 0, matchedExisting: 1 }, []);
    expect(held).toEqual([{ label: "Open form responses", href: "#/campaign/forms?campaign=c1" }]);
    // Some were saved: shortlist them, the link, and finding more.
    expect(fitSteps(on, { saved: 4, matchedExisting: 2 }, []).map((s) => s.label)).toEqual(["Shortlist them", "Open form responses", "Find more people"]);
    // The server's own link (it names the form) is kept, not replaced.
    const sent = { label: "Open form responses", href: "#/campaign/forms/f1/responses?campaign=c1" };
    expect(fitSteps(on, { saved: 0, matchedExisting: 1 }, [sent])).toEqual([sent]);
    // Nobody held: no link, and the usual steps.
    expect(fitSteps(on, { saved: 3 }, []).map((s) => s.label)).toEqual(["Shortlist them", "Find more people"]);
    // Shortlisting and passing leave the same person the same way in.
    expect(fitSteps({ ...on, detail: { ...SAVE, decision: "add" } }, { shortlisted: 2, matchedExisting: 1 }, []).map((s) => s.label)).toEqual(["Start outreach", "Open form responses"]);
    expect(fitSteps({ ...on, detail: { ...SAVE, decision: "pass" } }, { passed: 1, matchedExisting: 1 }, []).map((s) => s.label)).toEqual(["Open form responses"]);
  });

  it("shows the chips under an answered card whose people were all held", () => {
    const held = answered(proposed(SAVE), {
      decision: "approve", action: "decide_responses", campaignId: "c1",
      summary: "1 person already in Candidates under the same email, phone or LinkedIn, so that person was left for you to link on the form's page.",
      counts: { saved: 0, matchedExisting: 1 },
    });
    const o = outcomeModel(held)!;
    expect(o.next).toEqual([{ label: "Open form responses", href: "#/campaign/forms?campaign=c1" }]);
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={held} turnSaid="x" />);
    expect(html).toContain("Open form responses");
    expect(html).toContain('href="#/campaign/forms?campaign=c1"');
  });

  it("leaves a declined card as one quiet line", () => {
    const no = answered(proposed(SAVE), { decision: "decline" });
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={no} turnSaid="x" />);
    expect(html).toContain("Not now. Nothing changed.");
    expect(html).not.toContain("Needs your OK");
  });

  it("does not repeat the sentence the agent already wrote above it, and keeps the steps", () => {
    const html = renderToStaticMarkup(
      <ApprovalCard turnKey="t1" approval={done} turnSaid="x" said="Done. I saved 5 people to Candidates, and they're not on Staff Platform Engineer's board. 1 person was already in Candidates under the same email, so I left that person for you to link on the form's page." />,
    );
    expect(html).not.toContain("Saved 5 people to Candidates.");
    expect(html).toContain(">Shortlist them</button>");
    // Words that say only part of it leave the card's sentence where it is.
    const part = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={done} turnSaid="x" said="Saved them." />);
    expect(part).toContain("Saved 5 people to Candidates.");
  });
});

describe("the agent's lead-in to cards that were answered", () => {
  const decided = [{ action: "decide_responses", decided: { decision: "approve" as const, outcome: {} } }];
  const waiting = [{ action: "decide_responses", decided: null }];

  it("drops 'I've proposed … waiting for your approval' once the card is answered, and keeps the rest", () => {
    expect(settledLead("I've proposed saving 6 people to Candidates for Staff Platform Engineer. It's waiting for your approval.", decided)).toBe("");
    expect(settledLead("Six people answered the form. I've proposed saving them to Candidates; approve it below.\n\nTwo missed a must-have.", decided))
      .toBe("Six people answered the form.\n\nTwo missed a must-have.");
    expect(settledLead("Version 3.5 is out. Waiting for your approval.", decided)).toBe("Version 3.5 is out.");
  });

  it("says nothing new while a card is still waiting", () => {
    const said = "I've proposed saving 6 people to Candidates. It's waiting for your approval.";
    expect(settledLead(said, waiting)).toBe(said);
    expect(settledLead(said, [...decided, ...waiting])).toBe(said);
    expect(settledLead(said, [])).toBe(said);
  });

  it("keeps an answer that is about something else", () => {
    expect(settledLead("Five people met every must-have, and one missed the notice period.", decided))
      .toBe("Five people met every must-have, and one missed the notice period.");
  });
});

describe("a number is said once", () => {
  it("leaves out a counts line that is only zeros, or says what the sentence says", () => {
    expect(withoutRepeat("0 saved", "All 3 people were already in Candidates.")).toBe("");
    expect(withoutRepeat("0 saved, 3 already there", "All 3 people were already in Candidates.")).toBe("");
    expect(withoutRepeat("0 added", "Software Engineer is active.")).toBe("");
    expect(withoutRepeat("5 saved, 2 already there", "Saved 5 people.")).toBe("5 saved, 2 already there");
    expect(withoutRepeat("0 saved", "")).toBe("0 saved");
  });

  it("shows an outcome card with its sentence once, and no line of zeros under it", () => {
    const html = renderToStaticMarkup(
      <OutcomeCard summary="All 3 people were already in Candidates." counts={{ saved: 0, alreadySaved: 3 }} next={[]} campaignId="c1" />,
    );
    expect(html).toContain("All 3 people were already in Candidates.");
    expect(html).not.toContain("0 saved");
    expect(html).not.toContain("oc-counts");
  });
});

describe("a change's sentence and the agent's are not both shown", () => {
  it("knows when the agent's words already say what a card says", () => {
    const card = "Updated G32 Data Engineer Two: target is 3.";
    expect(covers("Done. G32 Data Engineer Two now targets 3 hires.", card)).toBe(true);
    expect(covers("Set the target for G32 Data Engineer Two to 3.", card)).toBe(true);
    expect(covers("Updated, and the board will keep three open.", card)).toBe(false);
    // A different number is a different thing.
    expect(covers("G32 Data Engineer Two now targets 5 hires.", card)).toBe(false);
    expect(covers("Anything at all.", "Done.")).toBe(false);
    expect(covers("Set the search filters for Data Engineer, and the next search will use them.", "Set the search filters for Data Engineer. The next search uses them.")).toBe(true);
  });

  it("moves a change's own sentence out of the way when the agent's words say it, keeping its counts and steps", () => {
    const cards = [
      { kind: "outcome" as const, key: "o1", summary: "Updated G32 Data Engineer Two: target is 3.", counts: null, next: [], undo: null, campaignId: "c1", capability: null },
      { kind: "outcome" as const, key: "o2", summary: "Closed Android Engineer.", counts: null, next: [], undo: null, campaignId: "c2", capability: null },
    ];
    const split = splitByTelling(cards, "Done. G32 Data Engineer Two now targets 3 hires.");
    expect(split.told.map((c) => c.key)).toEqual(["o1"]);
    expect(split.before.map((c) => c.key)).toEqual(["o2"]);
    expect(splitByTelling(cards, "").told).toEqual([]);

    const quiet = renderToStaticMarkup(
      <OutcomeCard summary={cards[0]!.summary} counts={null} next={[{ label: "Find more people", text: "Find more people for G32" }]} campaignId="c1" quiet />,
    );
    expect(quiet).not.toContain("Updated G32");
    expect(quiet).toContain("Find more people");
    // Nothing left to show: nothing is drawn.
    expect(renderToStaticMarkup(<OutcomeCard summary="Closed Android Engineer." counts={null} next={[]} campaignId="c2" quiet />)).toBe("");
  });
});

describe("a token that was refused is tried again in place", () => {
  it("says Try again once the reason is on screen, and the ask before that", () => {
    expect(tokenButton("Reconnect Slack", false, null)).toBe("Reconnect Slack");
    expect(tokenButton("Reconnect Slack", false, "Slack didn't accept that token. Paste it again.")).toBe("Try again");
    expect(tokenButton("Reconnect Slack", true, "Slack didn't accept that token.")).toBe("Connecting…");
  });
});

describe("the numbers of a search are one story", () => {
  const phase = (over: Partial<PhaseLine> = {}): PhaseLine => ({
    id: "decide", phase: "decide", state: "done", label: "Ready for your call", detail: "2 good fits, 2 partial fits, 16 not scored yet", seq: 9, ...over,
  });

  it("counts this search's people, and says which pool 'ranked' is when it is a different one", () => {
    expect(resultsCopy({ shown: 3, total: 50, unscored: 0, found: 20 }).count).toBe("3 shown of 20 found · 50 ranked in the campaign");
    expect(resultsCopy({ shown: 3, total: 50, unscored: 0, found: 20 }).all).toBe("See all 50 ranked in the campaign");
    expect(resultsCopy({ shown: 3, total: 20, unscored: 0, found: 20 }).count).toBe("3 shown of 20 found");
    expect(resultsCopy({ shown: 3, total: 20, unscored: 0, found: 20 }).all).toBe("See all 20 ranked profiles");
    // Without a search of its own, the campaign's list is what there is.
    expect(resultsCopy({ shown: 3, total: 21, unscored: 0 }).count).toBe("3 shown · 21 ranked");
  });

  it("closes honestly when some people were not scored: how many, and what order the rest are in", () => {
    expect(scoredLine(20, 4)).toEqual({ label: "Scored 4 of 20", rest: "The rest are in the order of keyword match." });
    expect(scoredLine(20, 20)).toBeNull();
    expect(scoredLine(20, 0)).toBeNull();
    expect(fitsOnly("2 good fits, 2 partial fits, 16 not scored yet")).toBe("2 good fits, 2 partial fits");
    const [line] = closeVerdict([phase()], 20, 4);
    expect(line).toMatchObject({ label: "Scored 4 of 20", detail: "2 good fits, 2 partial fits. The rest are in the order of keyword match." });
    // Everyone scored, or nobody: the run's own line stands.
    expect(closeVerdict([phase()], 20, 20)[0]).toMatchObject({ label: "Ready for your call" });
    expect(closeVerdict([phase({ label: "Found 20 people, not scored yet", detail: undefined })], 20, 0)[0]).toMatchObject({ label: "Found 20 people, not scored yet" });
  });

  const person = (k: number, over: Partial<Match> = {}): Match => ({
    personId: `p${k}`, fullName: `Person ${k}`, headline: `Data Engineer ${k}`, currentTitle: "Data Engineer",
    currentCompanyName: `Company ${k}`, city: "Bengaluru", linkedinUrl: null, profileImageUrl: null, yearsOfExperience: 5,
    source: "ours", stage: "features", score: 0.5, tier: null, knockedOut: null, judgement: null, ...over,
  });
  const judged = (k: number): Match => person(k, {
    stage: "judged", score: 0.9, tier: "A",
    judgement: { verdicts: [{ requirementId: "r1", verdict: "met", evidence: "Airflow" }], strengths: ["Runs Airflow pipelines"], concerns: [] },
  });
  const ctx = (): MomentCtx => ({
    said: "x", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {}, deploy: () => null,
    undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {}, prefs: {}, setPref: () => {},
  });
  const search: Search = {
    runId: "r2", campaignId: "camp", size: 20, pool: 30, fresh: 0, scored: 2, status: "done", error: null, scoredIds: [],
    items: [judged(1), judged(2), person(3), person(4)],
    notices: ["Scoring is catching up, so 2 of the 4 people are listed by keywords, years and place for now. They're kept as found, and you can score them again."],
    rescore: { campaignId: "camp", people: 2, text: "Score the people found for Data Engineer again" },
    phases: [{ id: "decide", phase: "decide", state: "done", label: "Ready for your call", detail: "2 strong fits, 2 not scored yet", seq: 5 }],
  };

  it("draws one count and one closing line, with 'Score the rest' as the action", () => {
    const html = renderToStaticMarkup(
      <LiveMomentProvider value={ctx()}>
        <SearchRun turnKey="t1" search={search} latest onAsk={() => {}} />
      </LiveMomentProvider>,
    );
    expect(html).toContain("Top matches");
    // One closing line, the same function the role spec card uses: found, matched closely, not scored yet.
    expect(html).toContain("4 found. 2 matched closely, 2 not scored yet.");
    expect(html).not.toContain("Scored 2 of 4");
    expect(html).not.toContain("Ready for your call");
    // The catching-up note says the same thing, so it is not there as well.
    expect(html).not.toContain("Scoring is catching up");
    expect(html).toContain(">Score the rest</button>");
    expect(html).not.toContain("Score them again");
  });
});

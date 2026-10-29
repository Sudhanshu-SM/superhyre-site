import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingFeed } from "../agentCards/ThinkingFeed";
import { PhaseTimeline } from "../agentCards/PhaseTimeline";
import { applyFeed, FEED_KEEP, FEED_LIFE_MS, FEED_VISIBLE, nextExpiry, visibleFeed } from "../agentFeed";
import type { FeedLine } from "../agentFeed";
import type { Match } from "../api/agent";
import type { RunEvent } from "../api/events";
import { applyEvent, claim, newTurn } from "../liveChat";
import type { ChatState, Search } from "../liveChat";
import { LiveMomentProvider } from "../liveViews/LiveMoment";
import { liveStages, runStateOfSearch } from "../liveSourcing";
import { searchCount, searchSub, SearchRun } from "../liveViews/SearchRun";
import type { MomentCtx } from "../moments";

/**
 * The search a chat starts is drawn with the sourcing components (the cards with a fit mark and a line on
 * why, the way into the ranked list), not as a bare list; and what it is doing right now rises and fades
 * under the matching line, from the run's own `feed` events.
 */

vi.mock("../campaignRights", () => ({
  FOLLOWING_LINE: "You're following this campaign.",
  useFollowingLine: () => "You're following this campaign.",
  useMayChangeCampaign: () => true,
}));

const NOW = Date.parse("2026-10-13T10:00:00.000Z");
let seq = 0;
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}, at = NOW): RunEvent => ({
  ...payload, id: ++seq, runId: "r2", seq, type, at: new Date(at).toISOString(),
});
const feedEv = (text: string, at = NOW) => ev("progress", { step: "feed", phase: "match", kind: "read", text }, at);

afterEach(() => {
  vi.useRealTimers();
});

describe("the lines that say what the search is doing", () => {
  it("adds a line once, by its event, and keeps the newest forty", () => {
    let lines: readonly FeedLine[] = [];
    const first = feedEv("Matching must-haves: SQL, Python");
    lines = applyFeed(lines, first, NOW);
    lines = applyFeed(lines, first, NOW);
    expect(lines).toHaveLength(1);
    for (let i = 0; i < 60; i++) lines = applyFeed(lines, feedEv(`Reading person ${i}`), NOW);
    expect(lines).toHaveLength(FEED_KEEP);
    expect(lines.at(-1)?.text).toBe("Reading person 59");
  });

  it("ignores events that are not a feed line, or have no words", () => {
    const lines = applyFeed([], ev("progress", { step: "phase", id: "match", phase: "match", state: "running", label: "x" }), NOW);
    expect(lines).toEqual([]);
    expect(applyFeed([], ev("progress", { step: "feed", text: "  " }), NOW)).toEqual([]);
  });

  it("shows the newest five for about six seconds each, newest last, then lets them go", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let lines: readonly FeedLine[] = [];
    for (let i = 1; i <= 7; i++) lines = applyFeed(lines, feedEv(`Line ${i}`));
    const seen = visibleFeed(lines, Date.now());
    expect(seen.map((l) => l.text)).toEqual(["Line 3", "Line 4", "Line 5", "Line 6", "Line 7"]);
    expect(seen).toHaveLength(FEED_VISIBLE);
    // Four seconds on, a new line has arrived; the old ones are still there, drifting up.
    vi.advanceTimersByTime(4_000);
    lines = applyFeed(lines, feedEv("Line 8"));
    expect(visibleFeed(lines, Date.now()).at(-1)?.text).toBe("Line 8");
    expect(nextExpiry(lines, Date.now())).toBeGreaterThan(0);
    // Past six seconds from their arrival, the first lines are gone and only the later one is left.
    vi.advanceTimersByTime(FEED_LIFE_MS - 4_000 + 50);
    expect(visibleFeed(lines, Date.now()).map((l) => l.text)).toEqual(["Line 8"]);
    vi.advanceTimersByTime(FEED_LIFE_MS);
    expect(visibleFeed(lines, Date.now())).toEqual([]);
    expect(nextExpiry(lines, Date.now())).toBeNull();
  });

  it("does not play lines again that were said before the chat was reopened", () => {
    const old = feedEv("Reading Asha Patel, Data Engineer at PhonePe", NOW - 60_000);
    const lines = applyFeed([], old, NOW);
    expect(lines).toHaveLength(1);
    expect(visibleFeed(lines, NOW)).toEqual([]);
  });

  it("draws the lines under the matching line, newest at the bottom, with a small icon each", () => {
    let lines: readonly FeedLine[] = [];
    for (const t of ["Matching must-haves: SQL, Python", "Reading Chitra Desai, Senior Data Engineer at Nykaa", "Scoring batch 2 of 3"]) {
      lines = applyFeed(lines, feedEv(t), NOW);
    }
    const html = renderToStaticMarkup(<ThinkingFeed lines={lines} now={NOW + 500} reduced={false} />);
    expect(html).toContain("pt-feed");
    expect(html.indexOf("Matching must-haves")).toBeLessThan(html.indexOf("Reading Chitra Desai"));
    expect(html.indexOf("Reading Chitra Desai")).toBeLessThan(html.indexOf("Scoring batch 2 of 3"));
    expect((html.match(/<svg/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-hidden="true"');
  });

  it("holds still under reduced motion: the latest line only, standing", () => {
    let lines: readonly FeedLine[] = [];
    for (const t of ["Matching must-haves: SQL", "Reading Karthik Jain, Big Data Engineer at Paytm", "Strong fit: Karthik Jain"]) {
      lines = applyFeed(lines, feedEv(t), NOW);
    }
    const html = renderToStaticMarkup(<ThinkingFeed lines={lines} now={NOW + 100} reduced />);
    expect(html).toContain("is-still");
    expect(html).toContain("Strong fit: Karthik Jain");
    expect(html).not.toContain("Matching must-haves");
    expect((html.match(/pt-feed-line/g) ?? []).length).toBe(1);
  });

  it("is under the phase list only while the run works", () => {
    const lines = [{ id: "match", phase: "match", state: "running" as const, label: "Matching candidates to the role", done: 0, total: 30, seq: 1 }];
    const feed = applyFeed([], feedEv("Choosing the best 15 of 30 to read closely", Date.now()), Date.now());
    const working = renderToStaticMarkup(<PhaseTimeline lines={lines} working feed={feed} />);
    expect(working).toContain("Matching candidates to the role");
    expect(working).toContain("Choosing the best 15 of 30 to read closely");
    const done = renderToStaticMarkup(<PhaseTimeline lines={lines} working={false} feed={feed} />);
    expect(done).not.toContain("pt-feed");
  });
});

describe("a chat folds a search's feed and the searches it did not ask for", () => {
  const state = (): ChatState => ({
    conversationId: "c1",
    turns: [{ ...newTurn("t1", "Find more people", 0), runId: "r1", status: "working" }],
    owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
  });

  it("keeps a search's feed lines with the search", () => {
    let s = claim(state(), "r2", "t1", { campaignId: "camp", size: 20 });
    s = applyEvent(s, feedEv("Matching must-haves: Python, Airflow"));
    s = applyEvent(s, feedEv("Scoring batch 1 of 3"));
    const search = s.turns[0]?.searches[0] as Search;
    expect(search.feed?.map((l) => l.text)).toEqual(["Matching must-haves: Python, Airflow", "Scoring batch 1 of 3"]);
  });

  it("follows the search that approved requirements started, not only 'find people'", () => {
    const own = (e: RunEvent): RunEvent => ({ ...e, runId: "r1" });
    const s = applyEvent(state(), own(ev("result", { approvalSeq: 3, decision: "approve", action: "approve_spec", campaignId: "camp", searchRunId: "r9", size: 20 })));
    expect(s.turns[0]?.searches.map((x) => x.runId)).toEqual(["r9"]);
    // And one that names no search starts none.
    const none = applyEvent(state(), own(ev("result", { approvalSeq: 3, decision: "approve", action: "approve_spec", campaignId: "camp" })));
    expect(none.turns[0]?.searches).toEqual([]);
  });
});

const person = (n: number, over: Partial<Match> = {}): Match => ({
  personId: `p${n}`, fullName: `Person ${n}`, headline: `Data Engineer ${n}`, currentTitle: "Data Engineer",
  currentCompanyName: `Company ${n}`, city: "Bengaluru", linkedinUrl: null, profileImageUrl: null, yearsOfExperience: 5,
  source: "ours", stage: "features", score: 0.5, tier: null, knockedOut: null, judgement: null, ...over,
});
const judged = (n: number): Match => person(n, {
  stage: "judged", score: 0.9, tier: "A",
  judgement: { verdicts: [{ requirementId: "r1", verdict: "met", evidence: "Airflow" }], strengths: ["Runs Airflow pipelines at scale"], concerns: [] },
});
const search = (over: Partial<Search> = {}): Search => ({
  runId: "r2", campaignId: "camp", size: 20, pool: 30, fresh: 0, scored: 0, items: null, notices: [], phases: [],
  scoredIds: [], status: "running", error: null, ...over,
});
const ctx = (over: Partial<MomentCtx> = {}): MomentCtx => ({
  said: "Find more people", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {}, deploy: () => null,
  undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {}, prefs: {}, setPref: () => {}, ...over,
});
const draw = (s: Search, latest = true) =>
  renderToStaticMarkup(
    <LiveMomentProvider value={ctx()}>
      <SearchRun turnKey="t1" search={s} latest={latest} />
    </LiveMomentProvider>,
  );

describe("the search in the chat is the sourcing component, not a bare list", () => {
  it("shows the people the moment they are found, in the sourcing cards, with the way into the whole list", () => {
    const html = draw(search({ items: Array.from({ length: 12 }, (_, i) => person(i + 1)) }));
    // The component that was built for this: cards, a heading, the ranked list.
    expect(html).toContain("src-results");
    expect(html).toContain("src-card");
    expect(html).toContain("See all 12 ranked profiles");
    expect(html).toContain("Shortlist");
    // Three cards are the preview; the other nine are in the ranked list, not under a "Show more".
    expect((html.match(/<article class="src-card/g) ?? []).length).toBe(3);
    expect(html).not.toContain("lt-people");
    expect(html).not.toMatch(/Show \d+ more/);
    // Nobody is scored yet: said honestly, as the order they are in.
    expect(html).toContain("12 found");
    expect(html).toContain("Scoring now. People move into place as each group is read.");
    // One header over the list, and the goal card is the only place the steps are drawn.
    expect(html).not.toContain("First in the list");
    expect(html).not.toContain("people found, scoring now");
    // What is about to appear is a quiet shimmer where the line on why and the fit marks will be.
    expect(html).toContain("src-shim");
  });

  it("shimmers only the people whose score has not arrived, and only while scores are coming", () => {
    const mixed = draw(search({ items: [judged(1), person(2), person(3)] }));
    expect((mixed.match(/class="src-card-reason is-pending"/g) ?? []).length).toBe(2);
    expect(mixed).toContain("Runs Airflow pipelines at scale");
    // Over, with nobody left to catch up: a person without a score is left as they are, not made to look busy.
    expect(draw(search({ items: [person(1), person(2)], status: "done" }))).not.toContain("src-shim");
  });

  it("puts the fit and the line on why in the card as scores arrive", () => {
    const items = [judged(1), judged(2), person(3), person(4)];
    const html = draw(search({ items, status: "done" }));
    expect(html).toContain("Top matches");
    expect(html).toContain("Runs Airflow pipelines at scale");
    // A person with no score yet gets no made-up fit: they are not read as met or not met. Said once, and
    // the same count: three shown of the four this search found.
    expect(html).toContain("2 shown");
    expect(html).toContain("aren&#x27;t scored yet, so they&#x27;re in the order of keyword match");
    expect(html).not.toContain("Score them again to finish");
  });

  it("says what the run is doing under the matching line while it works, once the people are listed", () => {
    const feed = applyFeed([], feedEv("Reading Chitra Desai, Senior Data Engineer at Nykaa", Date.now()), Date.now());
    const html = draw(search({
      items: [person(1)],
      phases: [{ id: "match", phase: "match", state: "running", label: "Matching candidates to the role", done: 0, total: 30, seq: 1 }],
      feed,
    }));
    // The steps and their counts are the goal card's; under it only what the search is doing right now.
    expect(html).toContain("Sourcing progress");
    expect(html).not.toContain("Matching candidates to the role");
    expect(html).toContain("Reading Chitra Desai, Senior Data Engineer at Nykaa");
    expect(html).toContain("src-card");
  });

  it("keeps the 'Score them again' press when some people could not be scored", () => {
    const html = renderToStaticMarkup(
      <LiveMomentProvider value={ctx()}>
        <SearchRun
          turnKey="t1"
          latest
          onAsk={() => {}}
          search={search({
            status: "done", items: [person(1), person(2)],
            notices: ["Scoring is catching up, so these 2 people are listed by keywords, years and place for now. They're kept as found, and you can score them again."],
            rescore: { campaignId: "camp", people: 2, text: "Score the people found for Data Engineer again" },
          })}
        />
      </LiveMomentProvider>,
    );
    expect(html).toContain("Score them again");
    expect(html).toContain("Scoring is catching up");
  });

  it("says plainly when nobody new matched, and when the search failed", () => {
    expect(draw(search({ status: "done", items: [] }))).toContain("Nobody new matched this time.");
    expect(draw(search({ status: "failed", error: "The search stopped." }))).toContain("The search stopped.");
  });

  it("counts from what it draws, and words the line over the cards for what is true", () => {
    expect(searchCount(0, 0, true)).toBe("");
    expect(searchCount(1, 0, false)).toBe("1 person found");
    expect(searchCount(32, 10, true)).toBe("32 people found, 10 scored so far");
    expect(searchCount(32, 10, false)).toBe("32 people found, 10 scored");
    expect(searchSub({ running: false, unscored: 0, scored: 5 })).toBeNull();
    // Done with some unscored: the closing line says it, once.
    expect(searchSub({ running: false, unscored: 3, scored: 5 })).toBeNull();
  });
});

describe("the goal tracker follows the search's own counts", () => {
  it("is on the search: Searching, Matching, Deciding, with the scored of N and the best picked", () => {
    const html = draw(search({
      items: [judged(1), person(2), person(3)],
      pool: 30, scored: 4,
      phases: [{ id: "match", phase: "match", state: "running", label: "Matching candidates to the role", done: 4, total: 30, seq: 2 }],
    }));
    expect(html).toContain('aria-label="Sourcing progress"');
    expect(html).toContain("Finding people");
    expect(html).toContain("Matching");
    expect(html).toContain("Deciding");
    expect(html).toContain("Scoring 4 of 30");
  });

  it("settles when the search is over: the best picked, and the call left to the person", () => {
    const items = [judged(1), judged(2), judged(3)];
    const run = runStateOfSearch(search({ status: "done", items, pool: 3, scored: 3, phases: [{ id: "match", phase: "match", state: "done", label: "x", total: 3, seq: 1 }] }));
    expect(run.status).toBe("done");
    expect(run.people).toBe(3);
    expect(run.tiers.A).toBe(3);
    const t = liveStages({ readDone: true, buildDone: true, searched: false, run, found: 3, ranked: 3, criteria: 1, preview: ["p1", "p2", "p3"], verdicts: {} });
    expect(t.stages.map((x) => x.state)).toEqual(["done", "done", "wait"]);
    expect(t.stages[0]?.note).toBe("Found");
    expect(t.stages[1]?.note).toBe("Done");
    expect(t.stages[2]?.note).toBe("");
    // And the goal is reached when each of them has a call.
    const all = liveStages({ readDone: true, buildDone: true, searched: false, run, found: 3, ranked: 3, criteria: 1, preview: ["p1", "p2", "p3"], verdicts: { p1: "shortlisted", p2: "rejected", p3: "shortlisted" } });
    expect(all.reached).toBe(true);
    expect(all.summary).toBe("Goal reached · 2 shortlisted");
    expect(all.stages[2]?.note).toBe("Done");
  });

  it("does not claim scoring before the search has begun to score", () => {
    const run = runStateOfSearch(search({ status: "running", pool: null, scored: 0, items: null, phases: [] }));
    expect(run.scoringAt).toBeNull();
    expect(run.people).toBeNull();
    const t = liveStages({ readDone: false, buildDone: false, searched: false, run, found: 0, ranked: 0, criteria: 0, preview: [], verdicts: {} });
    expect(t.stages[0]?.state).toBe("live");
    expect(t.stages[1]?.state).toBe("todo");
  });
});

describe("the best fits are the people who were matched", () => {
  const withResult = (n: number, status: "scored" | "insufficient_evidence" | "not_scored_yet", tier: "A" | "B" | "C" | null, over: Partial<Match> = {}): Match =>
    person(n, { stage: "judged", tier, status, coverage: status === "insufficient_evidence" ? 0 : 80, score: tier ? 80 : null, requirements: [], toVerify: [], strengths: [], concerns: [], missing: [], note: null, knockout: null, override: null, policyVersion: "v2", rubricVersion: 2, evaluatedAt: null, fit: tier === "A" ? 3 : tier === "B" ? 2 : tier === "C" ? 1 : null, ...over } as Partial<Match>);

  it("leaves out someone who needs more evidence even when they come first, and says so in the one line everything shares", () => {
    const items = [withResult(1, "insufficient_evidence", null), withResult(2, "scored", "A"), withResult(3, "scored", "B"), withResult(4, "not_scored_yet", null)];
    const html = draw(search({ items, status: "done" }));
    expect(html).toContain("Top matches");
    expect(html).toContain("Person 2");
    expect(html).toContain("Person 3");
    expect(html).not.toContain("Person 1");
    expect(html).not.toContain("Person 4");
    // The same words as the role spec card: found, matched closely, needs more evidence, not scored yet.
    expect(html).toContain("4 found. 2 matched closely, 1 needs more evidence, 1 not scored yet.");
    expect(html).not.toContain("people found, 4 scored");
    expect(html).not.toContain("The best fits so far");
  });

  it("calls the action Reject and the state Rejected, on the cards of the chat as everywhere", () => {
    const html = draw(search({ items: [withResult(1, "scored", "A")], status: "done" }));
    expect(html).toContain("Reject");
    expect(html).not.toContain("Not a fit");
  });
});

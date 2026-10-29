import { describe, expect, it } from "vitest";
import type { Match, RoleSpec, SourcingStatus, SpecRow } from "../api/agent";
import type { RunEvent } from "../api/events";
import type { CandidateSet } from "../liveCandidate";
import {
  applyRunEvent, batchOf, mustHaveCount, buildPhase, eventFromRow, settleRun, buildSays, cameBack, canRun, countLine, criteriaLines, experienceLine, failedRun, filterLines, idleRun,
  isRunning, joinAnd, joinOr, judgingDown, liveStages, locationLine, mergeSet, noticeText, plural, poolOf, poolSentence, readPhase,
  readSays, readSteps, requirementCounts, resultsCopy, runLabel, runPhases, runSummary, searchNote, shortDate, startingRun, unscoredIds, unscoredIn, visibleNotices,
} from "../liveSourcing";
import { TURN_LIMIT_MS } from "../liveChat";

const spec: RoleSpec = {
  title: "Senior Android Engineer",
  seniority: "Senior",
  yearsMin: 3,
  yearsMax: 12,
  locations: ["Bengaluru"],
  remoteOk: false,
  avoid: ["Agencies"],
  requirements: [
    { id: "r1", kind: "skill", text: "Kotlin", skill: "Kotlin", weight: 0.8, importance: "must" },
    { id: "r2", kind: "skill", text: "Android", skill: "Android", weight: 0.8, importance: "must" },
    { id: "r3", kind: "skill", text: "Jetpack Compose", skill: "Jetpack Compose", weight: 0.3, importance: "nice" },
    { id: "r4", kind: "location", text: "Based in India", weight: 0, importance: "knockout" },
  ],
};

const row = (version: number, over: Partial<SpecRow> = {}): SpecRow => ({
  id: `s${version}`, version, spec, jdText: null, approvedAt: "2026-10-04T13:45:11.607Z", createdAt: "2026-10-04T13:44:57.196Z", ...over,
});

const status = (over: Partial<SourcingStatus> = {}): SourcingStatus => ({
  approvedSpec: { id: "s2", version: 2 }, shown: 0, requests: 0, nextSize: 20, exhausted: false, crustdata: true, ...over,
});

/* ── the spec as filters ── */

describe("filter lines from a spec", () => {
  it("is the spec's own title, place, years, and the requirements grouped the way the console names them", () => {
    expect(filterLines(spec)).toEqual([
      { id: "title", label: "Title", value: "Senior Android Engineer" },
      { id: "location", label: "Location", value: "Bengaluru" },
      { id: "experience", label: "Experience", value: "3 to 12 years" },
      { id: "hard", label: "Hard requirement", value: "Based in India" },
      { id: "must", label: "Must have", value: "Kotlin, Android" },
      { id: "nice", label: "Nice to have", value: "Jetpack Compose" },
      { id: "avoid", label: "Avoid", value: "Agencies" },
    ]);
  });

  it("leaves out what the spec does not set, rather than inventing a placeholder", () => {
    const bare: RoleSpec = { title: "Designer", locations: [], remoteOk: false, avoid: [], requirements: [] };
    expect(filterLines(bare)).toEqual([{ id: "title", label: "Title", value: "Designer" }]);
  });

  it("adds seniority only when the title does not already say it", () => {
    expect(filterLines({ ...spec, title: "Android Engineer" }).find((f) => f.id === "seniority")?.value).toBe("Senior");
    expect(filterLines(spec).some((f) => f.id === "seniority")).toBe(false);
  });

  it("reads places and remote the way a person would", () => {
    expect(locationLine({ ...spec, locations: ["Bengaluru", "Pune"], remoteOk: true })).toBe("Bengaluru, Pune or remote");
    expect(locationLine({ ...spec, locations: [], remoteOk: true })).toBe("Remote");
    expect(locationLine({ ...spec, locations: [], remoteOk: false })).toBeNull();
  });

  it("reads years as a minimum, a range, a ceiling, or nothing", () => {
    expect(experienceLine({ ...spec, yearsMin: 5, yearsMax: null })).toBe("5+ years");
    expect(experienceLine({ ...spec, yearsMin: 3, yearsMax: 12 })).toBe("3 to 12 years");
    expect(experienceLine({ ...spec, yearsMin: null, yearsMax: 8 })).toBe("up to 8 years");
    expect(experienceLine({ ...spec, yearsMin: 0, yearsMax: null })).toBeNull();
  });

  it("ranks on the spec's strongest requirements, three at most", () => {
    expect(criteriaLines(spec)).toEqual(["Based in India", "Kotlin", "Android"]);
  });

  it("counts what the spec asks for", () => {
    expect(requirementCounts(spec)).toBe("1 hard requirement, 2 must have, 1 nice to have");
  });
});

/* ── copy ── */

describe("copy builders", () => {
  it("joins lists in words", () => {
    expect(joinAnd(["Kotlin", "Android", "Compose"])).toBe("Kotlin, Android and Compose");
    expect(joinOr(["A", "B"])).toBe("A or B");
    expect(joinAnd([])).toBe("");
    expect(plural(1, "person", "people")).toBe("1 person");
    expect(plural(1200, "profile")).toBe("1,200 profiles");
  });

  it("dates in UTC", () => {
    expect(shortDate("2026-10-04T13:45:11.607Z")).toBe("4 Oct");
    expect(shortDate(null)).toBeNull();
    expect(shortDate("nonsense")).toBeNull();
  });

  it("says what it read from the campaign and its approved spec", () => {
    const read = { campaign: { name: "fn3 Senior Android Engineer", department: "Engineering", location: "Bengaluru" }, approved: row(2), latest: row(2) };
    expect(readSteps(read)).toEqual([
      "fn3 Senior Android Engineer: Engineering, Bengaluru",
      "Requirements version 2, approved 4 Oct",
      "4 requirements: 1 hard requirement, 2 must have, 1 nice to have",
    ]);
    const says = readSays(read);
    expect(says).toContain("This is the Senior Android Engineer role in Bengaluru.");
    expect(says).toContain("Based in India, Kotlin and Android");
    expect(says).toContain("count Jetpack Compose in a candidate's favour");
    expect(readPhase(read).done).toBe("Read the role and its requirements");
    expect(readPhase(read, false).timed).toBe(false);
  });

  it("says plainly there is no approved spec, and offers nothing to search", () => {
    const none = { campaign: { name: "fn4 Spec limit" }, approved: null, latest: null };
    expect(readSteps(none)).toEqual(["fn4 Spec limit", "No requirements yet"]);
    expect(readSays(none)).toContain("no requirements yet");
    expect(readSays(none)).toContain("nothing to search on");
    // It offers to take the description here; it does not send anyone to write one in the campaign.
    expect(readSays(none)).toContain("Paste the job description here");
    expect(readSays(none)).not.toMatch(/in the campaign|Write and approve/);
    const draft = { campaign: { name: "fn4 Spec limit" }, approved: null, latest: row(1, { approvedAt: null }) };
    expect(readSteps(draft)[1]).toBe("A draft of the requirements (version 1) is waiting for approval");
    expect(readSays(draft)).toContain("haven't been approved");
    expect(readSays(draft)).not.toMatch(/in the campaign/);
    expect(readPhase(draft).done).toBe("Read the role");
  });

  it("builds the search from the spec and describes the pool without inventing a total", () => {
    const first = poolOf(status(), 0);
    expect(poolSentence(first)).toBe("Nobody has been found for this campaign yet. The first search looks for people who fit.");
    expect(poolSentence(poolOf(status({ crustdata: false }), 0))).toBe("Nobody has been found for this campaign yet. The first search looks for people who fit.");
    const mid = poolOf(status({ shown: 30, nextSize: 10 }), 21);
    expect(poolSentence(mid)).toBe("30 people found so far, 21 of them ranked and waiting for your call. The next search looks for more.");
    const done = poolOf(status({ shown: 74, nextSize: 0, exhausted: true }), 21);
    expect(poolSentence(done)).toBe("74 people found so far, 21 of them ranked and waiting for your call.");
    expect(poolSentence(poolOf(status({ shown: 10, nextSize: 0, exhausted: true }), 0))).toBe("10 people found so far, none of them waiting for your call.");
    expect(buildSays(first)).toContain("straight from the requirements");
    expect(buildPhase(spec, first).steps.at(-1)).toBe("Ranked by: Based in India, Kotlin, Android");
    expect(buildPhase(spec, first).steps[0]).toBe("Title: Senior Android Engineer");
  });

  it("takes the found count from the ledger or the list, whichever is larger", () => {
    expect(poolOf(status({ shown: 5 }), 9).found).toBe(9);
    expect(poolOf(status({ shown: 30 }), 9).found).toBe(30);
  });

  it("offers a search only when the ledger has some left, and labels the first one differently", () => {
    expect(canRun(poolOf(status(), 0))).toBe(true);
    expect(runLabel(poolOf(status(), 0))).toBe("Run search");
    expect(runLabel(poolOf(status({ shown: 30, nextSize: 10 }), 21))).toBe("Find 10 more");
    expect(canRun(poolOf(status({ nextSize: 0, exhausted: true }), 3))).toBe(false);
    expect(countLine(poolOf(status(), 0))).toBe("up to 20 people");
    expect(countLine(poolOf(status({ crustdata: false }), 0))).toBe("up to 20 people");
    expect(countLine(poolOf(status({ nextSize: 0, exhausted: true }), 3))).toBeNull();
  });

  it("explains in words what a search cannot do right now", () => {
    expect(searchNote(poolOf(status(), 0))).toBeNull();
    expect(searchNote(poolOf(status({ crustdata: false }), 0))).toBeNull();
    expect(searchNote(poolOf(status({ nextSize: 0, exhausted: true, shown: 74 }), 21))).toBe("That's everyone I could reach for these filters for now. Change the requirements to widen the search.");
    expect(searchNote(poolOf(status({ nextSize: 0, exhausted: false }), 21))).toContain("no searches left");
  });

  it("puts the server's notices in plain words", () => {
    expect(noticeText("Couldn't score these people right now; the AI is busy. They're listed unscored and get scored on the next search.")).toBe(
      "The AI was busy, so these people are listed without scores. They'll be scored on the next search.",
    );
    expect(noticeText("Searching our own database only. Crustdata isn't connected yet.")).toBe("I looked through everyone I could reach for this role.");
    expect(noticeText("That's everyone Crustdata has for these filters for now.")).toBe("I looked through everyone I could reach for this role.");
    expect(noticeText("Today's budget for new profiles is used up. Searching our own database; new profiles resume tomorrow.")).toBe("I looked through everyone I could reach for this role.");
    expect(noticeText("Matching on titles and skills only this time; the meaning search is busy. Results may be narrower.")).toContain("reads for meaning was busy");
    expect(noticeText("Crustdata took too long")).toBe("The lookup took too long.");
  });

  it("writes the results' words from the real counts", () => {
    expect(resultsCopy({ shown: 3, total: 21, unscored: 0 })).toEqual({
      title: "The best fits so far",
      count: "3 shown · 21 ranked",
      sub: "Shortlist the ones worth reaching out to. A rejection takes a short reason.",
      all: "See all 21 ranked profiles",
    });
    expect(resultsCopy({ shown: 1, total: 1, unscored: 1 }).title).toBe("The best fit so far");
    expect(resultsCopy({ shown: 1, total: 1, unscored: 1 }).sub).toContain("aren't scored yet");
    const verdicts = { verdicts: [], strengths: [], concerns: [] };
    const rows = [{ personId: "a", judgement: verdicts }, { personId: "b", judgement: null }, { personId: "c", judgement: verdicts }, { personId: "d", judgement: null }];
    expect(unscoredIn(rows, 3)).toBe(1);
    expect([...unscoredIds(rows)]).toEqual(["b", "d"]);
  });
});

/* ── events to phases ── */

let seq = 0;
const at = (s: number) => new Date(Date.UTC(2026, 9, 6, 10, 0, s)).toISOString();
const ev = (type: RunEvent["type"], s: number, payload: Record<string, unknown> = {}, runId = "run-1"): RunEvent => ({
  id: ++seq, type, runId, seq: seq, at: at(s), ...payload,
});

const play = (events: RunEvent[], from = idleRun) => events.reduce(applyRunEvent, from);

const match = (personId: string, stage: Match["stage"] = "judged"): Match => ({
  personId, fullName: personId, headline: null, currentTitle: null, currentCompanyName: null, city: null, linkedinUrl: null,
  profileImageUrl: null, yearsOfExperience: null, source: "ours", stage, score: 0.5, tier: "B", knockedOut: null, judgement: null,
});

describe("run events to phases", () => {
  const full = () => {
    seq = 0;
    return [
      ev("plan", 0, { step: "search", batch: 1, size: 20 }),
      ev("progress", 2, { step: "pool", found: 12 }),
      ev("progress", 5, { step: "crustdata", found: 5, repeats: 2 }),
      ev("progress", 5, { step: "scoring", people: 17 }),
      ...Array.from({ length: 17 }, (_, i) => ev("progress", 6 + i * 0.2, { step: "scored", personId: `p${i}`, stage: i < 15 ? "judged" : "rules", tier: i < 3 ? "A" : i < 9 ? "B" : i < 15 ? "C" : null })),
      ev("artifact", 12, { kind: "candidate_list", items: [match("p1")], stats: { fromPool: 12, fromCrustdata: 5, repeats: 2 } }),
      ev("done", 12),
    ];
  };

  it("shows the people judged so far while the search goes on, and ends only on the whole list", () => {
    seq = 0;
    const partial = play([
      ev("plan", 0, { step: "search", batch: 1, size: 20 }),
      ev("progress", 5, { step: "scoring", people: 3 }),
      ev("progress", 6, { step: "scored", personId: "p0", stage: "judged", tier: "A" }),
      ev("artifact", 7, { kind: "candidate_list", partial: true, items: [match("p0")] }),
    ]);
    expect(partial.items?.map((i) => i.personId)).toEqual(["p0"]);
    expect(partial.status).toBe("running");
    expect(partial.endAt).toBeNull();
    const whole = applyRunEvent(partial, ev("artifact", 20, { kind: "candidate_list", items: [match("p0"), match("p1"), match("p2")] }));
    expect(whole.items).toHaveLength(3);
    expect(whole.endAt).not.toBeNull();
  });

  it("is idle until something happens, and starting once Run is pressed", () => {
    expect(runPhases(idleRun)).toEqual([]);
    expect(isRunning(idleRun)).toBe(false);
    const starting = startingRun();
    expect(isRunning(starting)).toBe(true);
    expect(runPhases(starting)[0]).toMatchObject({ tookMs: undefined, phase: { id: "search", live: "Finding people" } });
  });

  it("follows the search from finding people to scoring", () => {
    const events = full();
    const mid = play(events.slice(0, 2));
    expect(mid.status).toBe("running");
    expect(mid.size).toBe(20);
    expect(mid.pool).toBe(12);
    expect(runPhases(mid)).toHaveLength(1);
    expect(runPhases(mid)[0]?.phase.live).toBe("Finding people");
    expect(runPhases(mid)[0]?.tookMs).toBeUndefined();

    const scoring = play(events.slice(0, 4 + 5));
    const phases = runPhases(scoring);
    expect(phases.map((p) => p.phase.id)).toEqual(["search", "score"]);
    // The search settled when scoring began: 5 seconds after the first event.
    expect(phases[0]?.tookMs).toBe(5000);
    expect(phases[0]?.phase.done).toBe("Found 17 people");
    expect(phases[0]?.phase.steps).toEqual(["17 people found, 2 you had already seen"]);
    expect(phases[1]?.phase.live).toBe("Scoring 5 of 17 people");
    expect(phases[1]?.tookMs).toBeUndefined();
  });

  it("times each phase from the events' own timestamps, and says what scoring found", () => {
    const run = play(full());
    expect(run.status).toBe("done");
    expect(run.endAt).toBe(Date.UTC(2026, 9, 6, 10, 0, 12));
    const phases = runPhases(run);
    expect(phases[0]?.tookMs).toBe(5000);
    expect(phases[1]?.tookMs).toBe(7000);
    expect(phases[1]?.phase.done).toBe("Scored 17 people");
    expect(phases[1]?.phase.steps).toEqual(["3 strong fits", "6 good fits", "6 partial fits", "2 ruled out on a hard requirement"]);
    expect(run.items).toHaveLength(1);
    expect(batchOf(run)).toBe(17);
    expect(runSummary(run)).toBe("Found 17 people: 3 strong fits, 6 good fits and 6 partial fits.");
  });

  it("changes nothing when an event is replayed or doubled", () => {
    const events = full();
    const once = play(events);
    expect(play(events, once)).toEqual(once);
    expect(play([...events, events[3] as RunEvent])).toEqual(once);
  });

  it("reads a run back from its stored events, and closes it when the stream never said it ended", () => {
    seq = 0;
    const live = full();
    const stored = live.map((e) => ({ id: Number(e.id), seq: e.seq, type: e.type, payload: Object.fromEntries(Object.entries(e).filter(([k]) => !["id", "type", "runId", "seq", "at"].includes(k))), createdAt: e.at }));
    expect(play(stored.map((r) => eventFromRow("run-1", r)))).toEqual(play(live));
    // The stream delivered everything but the last two events; the stored ones fill the gap.
    const partial = play(live.slice(0, -2));
    expect(partial.status).toBe("running");
    const caught = play(stored.map((r) => eventFromRow("run-1", r)), partial);
    expect(caught.status).toBe("done");
    expect(caught.items).toHaveLength(1);
    // Nothing stored but the run is over: settle it from the server's word.
    expect(settleRun(partial, "done").status).toBe("done");
    expect(settleRun(partial, "failed", "It broke").error).toBe("It broke");
    expect(settleRun(partial, "cancelled").error).toBe("Stopped.");
    expect(settleRun(caught, "failed", "late")).toBe(caught);
  });

  it("ignores events from another run", () => {
    seq = 0;
    const run = play([ev("progress", 0, { step: "pool", found: 3 })]);
    expect(applyRunEvent(run, ev("progress", 1, { step: "pool", found: 99 }, "run-2")).pool).toBe(3);
  });

  it("handles a search that finds no one new, and says why in notices", () => {
    seq = 0;
    const run = play([
      ev("plan", 0, { step: "search", batch: 2, size: 10 }),
      ev("notice", 0, { text: "That's everyone Crustdata has for these filters for now." }),
      ev("notice", 0, { text: "That's everyone Crustdata has for these filters for now." }),
      ev("progress", 1, { step: "pool", found: 0 }),
      ev("progress", 2, { step: "scoring", people: 0 }),
      ev("artifact", 2, { kind: "candidate_list", items: [] }),
      ev("done", 2),
    ]);
    expect(run.notices).toHaveLength(1);
    expect(visibleNotices(run)).toEqual(["I looked through everyone I could reach for this role."]);
    expect(batchOf(run)).toBe(0);
    expect(runSummary(run)).toBe("Nothing new turned up for these filters this time.");
    const phases = runPhases(run);
    expect(phases).toHaveLength(1);
    expect(phases[0]?.phase.done).toBe("Searched, and found no one new");
  });

  it("says the people are listed unscored when the AI was busy", () => {
    seq = 0;
    const run = play([
      ev("progress", 0, { step: "pool", found: 3 }),
      ev("progress", 1, { step: "scoring", people: 3 }),
      ev("progress", 1, { step: "scored", personId: "a", stage: "features", tier: null }),
      ev("progress", 1, { step: "scored", personId: "b", stage: "features", tier: null }),
      ev("progress", 1, { step: "scored", personId: "c", stage: "features", tier: null }),
      ev("notice", 1, { text: "Couldn't score these people right now; the AI is busy. They're listed unscored and get scored on the next search." }),
      ev("artifact", 2, { kind: "candidate_list", items: [] }),
      ev("done", 2),
    ]);
    expect(judgingDown(run)).toBe(true);
    const score = runPhases(run)[1]?.phase;
    expect(score?.done).toBe("Listed 3 people without scores");
    expect(score?.steps).toEqual(["3 not scored yet, the AI was busy"]);
    expect(runSummary(run)).toContain("listed without scores because the AI was busy");
    // The closing paragraph says it, so the notice is not said again.
    expect(visibleNotices(run)).toEqual([]);
  });

  it("says a failure in words and does not draw the phase it cut short as finished", () => {
    seq = 0;
    const run = play([ev("plan", 0, { step: "search", size: 10 }), ev("error", 1, { message: "Crustdata took too long to answer" })]);
    expect(run.status).toBe("failed");
    expect(runPhases(run)).toEqual([]);
    expect(runSummary(run)).toBe("The search stopped before it finished. That took too long to answer. You can try again.");
    const refused = failedRun("This campaign has searched a lot in the last hour.");
    expect(runPhases(refused)).toEqual([]);
    expect(runSummary(refused)).toBe("The search didn't start. This campaign has searched a lot in the last hour. You can try again.");
  });
});

/* ── the goal's three legs ── */

describe("the must-have count", () => {
  it("counts the spec's hard requirements and must-haves, not the nice-to-haves", () => {
    const req = (id: string, importance: "knockout" | "must" | "nice") => ({ id, kind: "skill" as const, text: id, skill: id, weight: 0.5, importance });
    const s = { ...spec, requirements: [req("a", "knockout"), req("b", "must"), req("c", "must"), req("d", "nice")] };
    expect(mustHaveCount(s)).toBe(3);
    expect(mustHaveCount({ ...spec, requirements: [] })).toBe(0);
  });
});

describe("stages", () => {
  const base = { readDone: true, buildDone: true, searched: false, found: 0, ranked: 0, criteria: 3, preview: [] as string[], verdicts: {} as Record<string, "shortlisted" | "rejected"> };

  it("waits for the recruiter once the plan is built, and has not searched", () => {
    const { stages, reached } = liveStages({ ...base, run: idleRun });
    expect(stages.map((s) => s.state)).toEqual(["wait", "todo", "todo"]);
    expect(stages[0]?.note).toBe("Waiting for you to run it");
    expect(stages[1]?.note).toBe("Match on 3 must-haves");
    // Unknown count: a plain line, never "0 criteria".
    expect(liveStages({ ...base, criteria: 0, run: idleRun }).stages[1]?.note).toBe("Matching them to the role");
    expect(reached).toBe(false);
  });

  it("shows a campaign that was already searched as searched and ranked, waiting on the recruiter's call", () => {
    const { stages } = liveStages({ ...base, searched: true, found: 74, ranked: 21, preview: ["a", "b", "c"], run: idleRun });
    expect(stages.map((s) => s.state)).toEqual(["done", "done", "wait"]);
    expect(stages[0]?.note).toBe("Found");
    expect(stages[1]?.note).toBe("Done");
    // Deciding says nothing until it is finished.
    expect(stages[2]?.note).toBe("");
  });

  it("moves with the run: searching, then matching, then done", () => {
    seq = 0;
    const events = [
      ev("progress", 0, { step: "pool", found: 4 }),
      ev("progress", 1, { step: "scoring", people: 4 }),
      ev("progress", 1, { step: "scored", personId: "a", stage: "judged", tier: "A" }),
    ];
    expect(liveStages({ ...base, run: startingRun() }).stages.map((s) => s.state)).toEqual(["live", "todo", "todo"]);
    const scoring = liveStages({ ...base, run: play(events) });
    expect(scoring.stages.map((s) => s.state)).toEqual(["done", "live", "todo"]);
    expect(scoring.stages[1]?.note).toBe("Scoring 1 of 4");
    const finished = liveStages({ ...base, ranked: 4, preview: ["a", "b"], run: play([...events, ev("done", 3)]) });
    expect(finished.stages.map((s) => s.state)).toEqual(["done", "done", "wait"]);
    expect(finished.stages.map((s) => s.note)).toEqual(["Found", "Done", ""]);
  });

  it("reaches the goal when every one of the best has a call, and counts the shortlisted", () => {
    const state = liveStages({ ...base, searched: true, found: 10, ranked: 10, preview: ["a", "b", "c"], run: idleRun, verdicts: { a: "shortlisted", b: "rejected", c: "shortlisted" } });
    expect(state.reached).toBe(true);
    expect(state.summary).toBe("Goal reached · 2 shortlisted");
    // The count is the header's ("Goal reached · 2 shortlisted"), so the leg only says it is done.
    expect(state.stages[2]?.note).toBe("Done");
  });

  it("does not claim a goal when nobody is left to decide on", () => {
    const state = liveStages({ ...base, searched: true, found: 10, ranked: 0, preview: [], run: idleRun });
    expect(state.reached).toBe(false);
    expect(state.stages[2]?.note).toBe("");
  });

  it("stops the search leg and says so when the run fails", () => {
    const failed = liveStages({ ...base, run: failedRun("no") });
    expect(failed.stages[0]?.state).toBe("wait");
    expect(failed.stages[0]?.note).toBe("The search didn't finish");
  });
});

/* ── lists and restored chats ── */

describe("keeping the list", () => {
  const person = (id: string, jobs: number) => ({
    id, name: id, headline: "", location: "", hue: "blue", current: { name: "", hue: "blue" }, school: { name: "", hue: "blue" }, summary: "", highlights: [],
    meets: [], totalYears: 0, avgTenure: 0, about: "", jobs: Array.from({ length: jobs }, () => ({ org: { name: "Acme", hue: "blue" }, span: "", roles: [] })), schools: [], skills: {},
  }) as unknown as CandidateSet["candidates"][number];
  const set = (...c: CandidateSet["candidates"]): CandidateSet => ({ key: "k", campaignId: "k", candidates: c, criteria: [], reasons: {}, total: c.length });

  it("keeps a person's loaded profile when the list reloads, and takes the rest from the new list", () => {
    const merged = mergeSet(set(person("a", 2), person("b", 0)), set(person("a", 0), person("b", 0), person("c", 0)));
    expect(merged.candidates.map((c) => [c.id, c.jobs.length])).toEqual([["a", 2], ["b", 0], ["c", 0]]);
    expect(merged.total).toBe(3);
    expect(mergeSet(null, set(person("a", 0))).candidates).toHaveLength(1);
  });
});

describe("a view that comes back", () => {
  const now = 1_000_000_000_000;
  it("is one this tab has shown before, or one older than a turn can run", () => {
    expect(cameBack(true, now - 1000, now)).toBe(true);
    expect(cameBack(false, now - 5000, now)).toBe(false);
    expect(cameBack(false, now - TURN_LIMIT_MS - 1, now)).toBe(true);
    expect(cameBack(false, null, now)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { ApiActivity } from "../api/campaigns";
import type { WatchAgent, WatchRun } from "../liveAgents";
import {
  activityFrom,
  agentsNow,
  ago,
  applyAgent,
  bucketOf,
  campaignsOf,
  choiceFor,
  clock,
  doingLine,
  fleetLead,
  metricsOf,
  nextCheck,
  previewSummary,
  progressOf,
  rankAgents,
  recentAgents,
  refusalCopy,
  scopeAgents,
  startBody,
  statusQuestion,
  stepsOf,
  stopFromText,
  stoppedAt,
  stopQuestion,
  toOverviewAgent,
  visibleAgents,
  watchRuns,
} from "../liveAgents";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

const agent = (over: Partial<WatchAgent> = {}): WatchAgent => ({
  id: "a1",
  campaignId: "c1",
  campaignName: "Senior Android Engineer",
  role: "sourcing",
  state: "running",
  stateReason: null,
  summary: "Every 4 hours, 5 at a time, until 20 people",
  config: { stop: { profiles: 20 }, cadence: "every_4h" },
  counters: { found: 5 },
  startedAt: iso(60 * 24),
  lastRunAt: iso(90),
  nextRunAt: new Date(NOW + 150 * 60_000).toISOString(),
  updatedAt: iso(90),
  ...over,
});

describe("which bucket a watch is in", () => {
  it("maps the server's states onto the fleet's", () => {
    expect(bucketOf(agent())).toBe("running");
    expect(bucketOf(agent({ state: "done", stateReason: "Reached the end date." }))).toBe("done");
    expect(bucketOf(agent({ state: "stopped", stateReason: "Stopped by you." }))).toBe("ended");
    expect(bucketOf(agent({ state: "error", stateReason: "Something broke." }))).toBe("error");
    expect(bucketOf(agent({ state: "waiting" }))).toBe("waiting");
    expect(bucketOf(agent({ state: "queued" }))).toBe("queued");
  });

  it("calls a pause you made a rest, and any other pause the agent waiting on you", () => {
    expect(bucketOf(agent({ state: "paused", stateReason: "Paused by you." }))).toBe("paused");
    expect(bucketOf(agent({ state: "paused", stateReason: null }))).toBe("paused");
    expect(
      bucketOf(
        agent({
          state: "paused",
          stateReason: "8 people are waiting for review. It resumes when you get through them.",
        }),
      ),
    ).toBe("waiting");
    expect(bucketOf(agent({ state: "paused", stateReason: "No new people in the last 3 runs." }))).toBe(
      "waiting",
    );
  });
});

describe("what it is doing", () => {
  it("says it is keeping an eye out and when it looks next", () => {
    expect(doingLine(agent(), NOW)).toBe("Keeping an eye out for new people · next check in 3 h");
  });

  it("puts the server's reason on a running watch in place of the cheerful line", () => {
    const line = doingLine(agent({ stateReason: "Waiting for tomorrow's budget for new profiles." }), NOW);
    expect(line.startsWith("Waiting for tomorrow's budget for new profiles · ")).toBe(true);
    expect(line).not.toContain("Keeping an eye out");
  });

  it("passes on the reason a watch paused, finished or stopped, as written", () => {
    expect(doingLine(agent({ state: "paused", stateReason: "Paused by you." }), NOW)).toBe(
      "Paused by you. Resume it to keep looking.",
    );
    expect(doingLine(agent({ state: "paused", stateReason: "8 people are waiting for review." }), NOW)).toBe(
      "8 people are waiting for review.",
    );
    expect(doingLine(agent({ state: "done", stateReason: "Found the 20 people you asked for." }), NOW)).toBe(
      "Found the 20 people you asked for.",
    );
    expect(doingLine(agent({ state: "stopped", stateReason: "Stopped by you." }), NOW)).toBe(
      "Stopped by you.",
    );
  });

  it("words the next check by how far away it is", () => {
    expect(nextCheck(new Date(NOW + 30_000).toISOString(), NOW)).toBe("checking again shortly");
    expect(nextCheck(new Date(NOW + 12 * 60_000).toISOString(), NOW)).toBe("next check in 12 min");
    expect(nextCheck(new Date(NOW + 5 * 3_600_000).toISOString(), NOW)).toBe("next check in 5 h");
    expect(nextCheck(null, NOW)).toBeNull();
  });
});

describe("how far along it is", () => {
  it("counts people found against the number asked for", () => {
    expect(progressOf(agent({ counters: { found: 5 } }), NOW)).toBe(0.25);
    expect(progressOf(agent({ counters: { found: 25 } }), NOW)).toBe(1);
  });

  it("counts time gone against the end date when that is the stop", () => {
    const a = agent({
      config: { stop: { until: new Date(NOW + 3 * 86_400_000).toISOString() }, cadence: "daily" },
      startedAt: new Date(NOW - 3 * 86_400_000).toISOString(),
    });
    expect(progressOf(a, NOW)).toBeCloseTo(0.5, 5);
  });

  it("takes whichever stop is nearer when there are two, and is full once done", () => {
    const a = agent({
      config: {
        stop: { profiles: 20, until: new Date(NOW + 3 * 86_400_000).toISOString() },
        cadence: "daily",
      },
      counters: { found: 18 },
      startedAt: new Date(NOW - 3 * 86_400_000).toISOString(),
    });
    expect(progressOf(a, NOW)).toBe(0.9);
    // A watch that ended before its goal doesn't show a full ring.
    expect(progressOf(agent({ state: "done", counters: { found: 0 } }), NOW)).toBe(0);
  });
});

describe("its steps and counts", () => {
  it("names its own life: started, looking, then the goal", () => {
    expect(stepsOf(agent())).toEqual(["Started", "Looking for people", "Reaches 20 people"]);
    expect(stepsOf(agent({ state: "done" }))[2]).toBe("Finished");
    expect(stepsOf(agent({ state: "stopped" }))[2]).toBe("Stopped by you");
    const until = new Date("2026-10-13T00:00:00Z").toISOString();
    expect(stepsOf(agent({ config: { stop: { until }, cadence: "daily" } }))[2]).toMatch(
      /^Runs until 13 Oct/,
    );
  });

  it("counts what was found, what is left, and the searches once they are known", () => {
    expect(metricsOf(agent(), null, NOW)).toEqual([
      { label: "found", n: 5, d: 0 },
      { label: "still to find", n: 15, d: 0 },
    ]);
    expect(metricsOf(agent(), 3, NOW).at(-1)).toEqual({ label: "searches made", n: 3, d: 0 });
    expect(metricsOf(agent(), 1, NOW).at(-1)?.label).toBe("search made");
    const dated = agent({
      config: { stop: { until: new Date(NOW + 2.5 * 86_400_000).toISOString() }, cadence: "daily" },
    });
    expect(metricsOf(dated, null, NOW)[1]).toEqual({ label: "days left", n: 3, d: 0 });
  });
});

describe("a watch as one of the fleet's agents", () => {
  it("is a Sourcing agent on its campaign, running, with Pause and Stop", () => {
    const v = toOverviewAgent(agent(), null, NOW);
    expect(v).toMatchObject({
      id: "a1",
      role: "Sourcing",
      campaignName: "Senior Android Engineer",
      state: "running",
      bucket: "running",
      step: 1,
    });
    expect(v.controls?.map((c) => c.action)).toEqual(["pause", "stop"]);
    expect(v.attention).toBeUndefined();
    expect(v.progress).toBe(0.25);
    expect(v.metrics?.[0]).toEqual({ label: "found", n: 5, d: 0 });
    expect(v.times?.[0]).toBe(clock(agent().startedAt, NOW));
  });

  it("puts a pause the agent made on you, with its reason and Resume as the way forward", () => {
    const v = toOverviewAgent(
      agent({
        state: "paused",
        stateReason: "8 people are waiting for review. It resumes when you get through them.",
      }),
      null,
      NOW,
    );
    expect(v.state).toBe("waiting");
    expect(v.attention).toEqual({
      tone: "ask",
      title: "Paused, and waiting for you",
      body: "8 people are waiting for review. It resumes when you get through them.",
    });
    expect(v.controls).toEqual([
      { action: "resume", label: "Resume", primary: true },
      { action: "stop", label: "Stop" },
    ]);
  });

  it("draws a pause of your own as a quiet rest with a plain Resume", () => {
    const v = toOverviewAgent(agent({ state: "paused", stateReason: "Paused by you." }), null, NOW);
    expect(v.bucket).toBe("paused");
    expect(v.state).toBe("queued");
    expect(v.attention).toBeUndefined();
    expect(v.controls).toEqual([
      { action: "resume", label: "Resume", primary: false },
      { action: "stop", label: "Stop" },
    ]);
  });

  it("draws a stopped one as ended, a finished one as done, and gives neither controls", () => {
    const stopped = toOverviewAgent(agent({ state: "stopped", stateReason: "Stopped by you." }), null, NOW);
    expect(stopped).toMatchObject({ bucket: "ended", state: "queued", controls: [] });
    expect(stopped.step).toBe(2);
    const done = toOverviewAgent(agent({ state: "done", stateReason: "Reached the end date." }), null, NOW);
    expect(done).toMatchObject({ bucket: "done", state: "done", progress: 0.25, controls: [] });
  });

  it("carries an error as a fault in the server's words", () => {
    const v = toOverviewAgent(
      agent({ state: "error", stateReason: "The search service is down." }),
      null,
      NOW,
    );
    expect(v.state).toBe("error");
    expect(v.fault?.what).toBe("The search service is down.");
    expect(v.attention?.tone).toBe("bad");
  });

  it("adds what the server recorded once it has been read", () => {
    const v = toOverviewAgent(
      agent(),
      { activity: [{ at: "1 h ago", what: "Searched for people" }], searches: 4 },
      NOW,
    );
    expect(v.activity).toEqual([{ at: "1 h ago", what: "Searched for people" }]);
    expect(v.metrics?.at(-1)).toEqual({ label: "searches made", n: 4, d: 0 });
  });
});

describe("the strip", () => {
  const list = [
    agent({ id: "run", state: "running", startedAt: iso(300) }),
    agent({ id: "rest", state: "paused", stateReason: "Paused by you.", startedAt: iso(200) }),
    agent({
      id: "needs",
      state: "paused",
      stateReason: "No new people in the last 3 runs.",
      startedAt: iso(100),
    }),
    agent({ id: "done", state: "done", stateReason: "Reached the end date.", startedAt: iso(500) }),
    agent({ id: "newer-run", state: "running", startedAt: iso(50) }),
  ];

  it("puts those needing you first, then running, newest first, then the rest", () => {
    expect(rankAgents(list).map((a) => a.id)).toEqual(["needs", "newer-run", "run", "rest", "done"]);
  });

  it("keeps what is going, and the last thing to finish on a campaign with nothing going, if it was this week", () => {
    const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
    const finished = (id: string, campaignId: string, startedDaysAgo: number, updatedDaysAgo: number) =>
      agent({
        id,
        campaignId,
        state: "done",
        startedAt: days(startedDaysAgo),
        updatedAt: days(updatedDaysAgo),
      });
    const all = [
      agent({ id: "going", campaignId: "c1" }),
      finished("superseded", "c1", 5, 4), // c1 has one going: its history stays in the overview
      finished("older", "c2", 6, 5),
      finished("newer", "c2", 3, 2), // c2 shows only the newest
      finished("ancient", "c3", 30, 20), // too old to show
    ];
    expect(visibleAgents(all, NOW).map((a) => a.id)).toEqual(["going", "newer"]);
    // The overview keeps every agent going and everything finished this week, whichever campaign.
    expect(recentAgents(all, NOW).map((a) => a.id)).toEqual(["going", "superseded", "older", "newer"]);
    expect(visibleAgents([], NOW)).toEqual([]);
  });

  it("scopes to one campaign, or to all of them", () => {
    const two = [agent({ id: "x", campaignId: "c1" }), agent({ id: "y", campaignId: "c2" })];
    expect(scopeAgents(two, "c2").map((a) => a.id)).toEqual(["y"]);
    expect(scopeAgents(two, null)).toHaveLength(2);
    expect(campaignsOf(two.concat(agent({ id: "z", campaignId: "c2", campaignName: "Backend" })))).toEqual([
      { id: "c1", name: "Senior Android Engineer", agents: 1 },
      { id: "c2", name: "Senior Android Engineer", agents: 2 },
    ]);
  });

  it("leads with who needs you, or with the one agent's state", () => {
    const views = (xs: WatchAgent[]) => xs.map((a) => toOverviewAgent(a, null, NOW));
    expect(fleetLead(views([agent()]))).toBe(
      "Sourcing on Senior Android Engineer: running. The overview has its steps and recent activity.",
    );
    expect(
      fleetLead(
        views([
          agent({ id: "a" }),
          agent({ id: "b", state: "paused", stateReason: "No new people in the last 3 runs." }),
        ]),
      ),
    ).toBe("2 agents. 1 needs you, and it's first.");
    expect(
      fleetLead(
        views([agent({ id: "a" }), agent({ id: "b", state: "error" }), agent({ id: "c", state: "waiting" })]),
      ),
    ).toBe("3 agents. 2 need you, and they're first.");
    expect(fleetLead(views([agent({ id: "a" }), agent({ id: "b" })]))).toBe("2 agents, all running.");
    expect(fleetLead(views([agent({ id: "a" }), agent({ id: "b", state: "done" })]))).toBe(
      "2 agents. 1 running.",
    );
    expect(fleetLead(views([agent({ id: "a", state: "done" }), agent({ id: "b", state: "stopped" })]))).toBe(
      "2 agents, none running.",
    );
    expect(fleetLead([])).toBe("");
  });
});

describe("what it has been doing", () => {
  const a = agent({ startedAt: iso(600) });
  const run = (id: string, over: Partial<WatchRun> = {}): WatchRun => ({
    id,
    skill: "watch",
    status: "done",
    campaignId: "c1",
    createdAt: iso(120),
    finishedAt: iso(119),
    error: null,
    ...over,
  });
  const logRow = (verb: string, minsAgo: number, over: Partial<ApiActivity> = {}): ApiActivity => ({
    id: verb + minsAgo,
    subjectKind: "campaign",
    subjectId: "c1",
    subjectName: null,
    verb,
    actorKind: "user",
    actorId: "u1",
    actorName: "Asha Rao",
    data: {},
    at: iso(minsAgo),
    ...over,
  });

  it("takes only this campaign's watch runs from when the watch started", () => {
    const runs = [
      run("mine"),
      run("other", { campaignId: "c2" }),
      run("chat", { skill: "chat" }),
      run("before", { createdAt: iso(2000) }),
    ];
    expect(watchRuns(runs, a).map((r) => r.id)).toEqual(["mine"]);
  });

  it("says what each search found, newest first, with the log's lines among them", () => {
    const lines = activityFrom(
      a,
      [
        run("r1", { finishedAt: iso(300), createdAt: iso(301) }),
        run("r2", { finishedAt: iso(60), createdAt: iso(61) }),
        run("r3", { finishedAt: iso(20), createdAt: iso(21) }),
      ],
      { r1: { kept: 3 }, r2: { kept: 0 }, r3: null },
      [
        logRow("watch_started", 590, { data: { summary: "Every 4 hours, 5 at a time, until 20 people" } }),
        logRow("watch_paused", 200, { actorId: "u2", actorName: "Ravi Menon" }),
      ],
      "u1",
      NOW,
    );
    expect(lines.map((l) => l.what)).toEqual([
      "Searched for people",
      "Searched, and nobody new was worth a look",
      "Ravi Menon paused it",
      "Searched and found 3 people worth a look",
      "You started it: Every 4 hours, 5 at a time, until 20 people",
    ]);
    expect(lines[3]?.tone).toBe("good");
    expect(lines[0]?.at).toBe("20 min ago");
  });

  it("reports a search that failed or is still going, and ignores log lines it has no words for", () => {
    const lines = activityFrom(
      a,
      [
        run("f", {
          status: "failed",
          error: { message: "The provider timed out" },
          createdAt: iso(50),
          finishedAt: iso(49),
        }),
        run("now", { status: "running", createdAt: iso(1), finishedAt: null }),
      ],
      {},
      [
        logRow("updated", 30),
        logRow("watch_stopped", 5, { actorKind: "agent", actorId: null, actorName: null }),
      ],
      null,
      NOW,
    );
    expect(lines.map((l) => l.what)).toEqual([
      "Searching now",
      "The agent stopped it",
      "A search didn't finish: The provider timed out",
    ]);
    expect(lines[2]?.tone).toBe("bad");
  });

  it("leaves out log lines from before this watch began", () => {
    const lines = activityFrom(a, [], {}, [logRow("watch_started", 5000)], "u1", NOW);
    expect(lines).toEqual([]);
  });
});

describe("when it was stopped", () => {
  const log = (verb: string, at: string): ApiActivity => ({
    id: at,
    subjectKind: "campaign",
    subjectId: "c1",
    subjectName: null,
    verb,
    actorKind: "user",
    actorId: "u1",
    actorName: "Asha",
    data: {},
    at,
  });
  it("is the log's stop line, for a stopped agent only", () => {
    const rows = [log("watch_stopped", iso(30)), log("watch_started", iso(900))];
    expect(stoppedAt(agent({ state: "stopped" }), rows)).toBe(iso(30));
    expect(stoppedAt(agent({ state: "running" }), rows)).toBeNull();
    expect(stoppedAt(agent({ state: "stopped" }), [log("watch_stopped", iso(60 * 24 * 9))])).toBeNull();
  });
  it("is the time shown against the last step once it is known", () => {
    const v = toOverviewAgent(
      agent({ state: "stopped", updatedAt: iso(5) }),
      { activity: [], searches: 1, endedAt: iso(300) },
      NOW,
    );
    expect(v.times?.[2]).toBe(clock(iso(300), NOW));
  });
});

describe("time, in words", () => {
  it("says how long ago", () => {
    expect(ago(iso(0), NOW)).toBe("Just now");
    expect(ago(iso(12), NOW)).toBe("12 min ago");
    expect(ago(iso(180), NOW)).toBe("3 h ago");
    // By the calendar: yesterday evening is "Yesterday", the day before is a date.
    const local = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString();
    const lateOn6 = new Date(2026, 9, 6, 22, 0).getTime();
    expect(ago(local(5, 21), lateOn6)).toBe("Yesterday");
    expect(ago(local(4, 21), lateOn6)).toBe("4 Oct");
    expect(ago("", NOW)).toBe("");
  });

  it("says when, by day", () => {
    expect(clock(iso(30), NOW)).toMatch(/^Today \d\d:\d\d$/);
    expect(clock(iso(26 * 60), NOW)).toMatch(/^Yesterday \d\d:\d\d$/);
    expect(clock(iso(10 * 24 * 60), NOW)).toMatch(/^\d{1,2} \w{3,4} \d\d:\d\d$/);
    expect(clock(null, NOW)).toBe("");
  });
});

describe("when it should stop", () => {
  it("takes a number of people the recruiter already said", () => {
    expect(stopFromText("Keep looking for 25 people")).toEqual({ profiles: 25 });
    expect(stopFromText("find me 40 more candidates")).toEqual({ profiles: 40 });
    expect(stopFromText("Keep looking for 500 people")).toEqual({ profiles: 200 });
  });

  it("takes a stretch of time, spelled out or not, up to a month", () => {
    expect(stopFromText("keep sourcing for a week")).toEqual({ days: 7 });
    expect(stopFromText("Keep looking for 2 weeks")).toEqual({ days: 14 });
    expect(stopFromText("for three days please")).toEqual({ days: 3 });
    expect(stopFromText("over the next 3 months")).toEqual({ days: 30 });
  });

  it("takes both, and nothing from a request that names neither", () => {
    expect(stopFromText("20 people or for a week, whichever first")).toEqual({ profiles: 20, days: 7 });
    expect(stopFromText("Assign the agent to fn3 Senior Android Engineer")).toBeNull();
    expect(stopFromText("start sourcing for a senior engineer")).toBeNull();
  });

  it("turns a choice into the body the API takes, the date worked out when pressed", () => {
    expect(startBody({ profiles: 20 })).toEqual({ stop: { profiles: 20 } });
    const body = startBody({ days: 7 }, NOW);
    const until = Date.parse(body.stop.until ?? "");
    expect(until).toBeGreaterThan(NOW + 6.99 * 86_400_000);
    expect(until).toBeLessThan(NOW + 7 * 86_400_000);
    expect(Date.parse(startBody({ days: 90 }, NOW).stop.until ?? "") - NOW).toBeLessThan(30 * 86_400_000);
  });

  it("previews what starting will do in the server's own words", () => {
    expect(previewSummary({ profiles: 20 }, "every_4h", NOW)).toBe(
      "Every 4 hours, 5 at a time, until 20 people",
    );
    expect(previewSummary({ days: 7 }, "every_4h", NOW)).toBe("Every 4 hours, 5 at a time, until 13 Oct");
    expect(previewSummary({ profiles: 10, days: 14 }, "daily", NOW)).toBe(
      "Once a day, 5 at a time, until 10 people or until 20 Oct",
    );
  });

  it("says the server's refusal for a missing spec in plain words, and passes the rest on", () => {
    expect(refusalCopy("Approve the requirements before searching. They decide who fits.")).toEqual({
      text: "This campaign has no approved requirements yet. The agent needs them to know who fits, so approve them first.",
      needsSpec: true,
    });
    expect(refusalCopy("This campaign already has a watch. Change that one instead.")).toEqual({
      text: "This campaign already has a watch. Change that one instead.",
      needsSpec: false,
    });
  });
});

describe("the questions", () => {
  it("asks which campaign's agents, with the campaigns that have one and all of them", () => {
    const q = statusQuestion([
      { id: "c1", name: "Android", agents: 1 },
      { id: "c2", name: "Backend", agents: 2 },
    ]);
    expect(q.options.map((o) => o.label)).toEqual(["Android", "Backend", "All of them"]);
    expect(q.options.at(-1)?.meta).toBe("3 agents");
    expect(q.apply(["c2"])).toEqual({ answers: { campaignId: "c2" } });
    expect(q.apply(["all"])).toEqual({ answers: { campaignId: "all" } });
  });

  it("offers when it should stop as tiles that map back to a stop", () => {
    const q = stopQuestion("Android");
    expect(q.options.map((o) => o.label)).toEqual([
      "10 people",
      "20 people",
      "50 people",
      "For a week",
      "For 2 weeks",
    ]);
    expect(choiceFor(q.apply(["p50"]).answers?.stop)).toEqual({ profiles: 50 });
    expect(choiceFor(q.apply(["d14"]).answers?.stop)).toEqual({ days: 14 });
    expect(choiceFor("nonsense")).toBeNull();
  });
});

describe("the shared list", () => {
  it("puts an agent the server just answered with into the list, keeping the campaign's name", () => {
    applyAgent(agent({ id: "s1", campaignName: "Android" }));
    applyAgent(agent({ id: "s1", campaignName: undefined, state: "paused", stateReason: "Paused by you." }));
    const found = agentsNow().find((a) => a.id === "s1");
    expect(found?.state).toBe("paused");
    expect(found?.campaignName).toBe("Android");
    applyAgent(agent({ id: "s2", campaignName: "Backend" }));
    expect(agentsNow()[0]?.id).toBe("s2");
  });
});

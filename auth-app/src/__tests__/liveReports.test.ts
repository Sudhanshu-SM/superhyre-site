import { describe, expect, it } from "vitest";
import type { OutreachAnalytics, ProjectsAnalytics } from "../api/analytics";
import type { ApiActivity, ApiOverview } from "../api/campaigns";
import {
  addDays, adviceFor, allCampaignCharts, ALL, asksForAll, campaignKpis, chainOf, dayLabel, daysBetween, digestOf, emailWorks, eventsOf,
  foundEvents, funnelSteps, homeEvents, kindOf, lastDays, localParts, markerText, oneCampaignCharts, openProjects, perDay, plainOf,
  positionOf, rangeLabel, reachFrom, receiptAt, runEvents, shareOf, stuckAside, stuckOf, runsReach, unfinishedRuns, waitedLabel, widestDrop,
} from "../liveReports";

const UTC = "UTC";

const act = (over: Partial<ApiActivity> & { verb: string }): ApiActivity => ({
  id: "1", subjectKind: "candidate", subjectId: "c1", subjectName: "Asha Verma", actorKind: "user", actorId: "u1", actorName: "Priya", data: {}, at: "2026-10-05T10:00:00Z", ...over,
});

const overview = (over: Partial<ApiOverview> = {}): ApiOverview => ({
  campaign: { id: "k1", name: "fn3 Senior Android Engineer", status: "active" },
  found: { thisWeek: 74, lastWeek: 0, total: 74 },
  kept: { thisWeek: 21, lastWeek: 0, total: 21 },
  funnel: [
    { stage: "found", count: 74, pct: null }, { stage: "shortlisted", count: 21, pct: 28 }, { stage: "outreach", count: 5, pct: 24 },
    { stage: "replied", count: 0, pct: 0 }, { stage: "interviewing", count: 3, pct: 60 }, { stage: "hired", count: 1, pct: 33 },
  ],
  repliedPct: 0, hired: 1, target: 1,
  sourcedPerDay: ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"].map((day, i) => ({ day, count: i === 1 ? 74 : 0 })),
  needsYou: [], yourWork: null, hires: null, activity: [],
  ...over,
});

describe("calendar days", () => {
  it("names the day an instant falls on in the given zone", () => {
    expect(localParts("2026-10-05T19:06:00Z", UTC)).toEqual({ day: "2026-10-05", minutes: 19 * 60 + 6 });
    // 19:06 UTC is already the next calendar day in India.
    expect(localParts("2026-10-05T19:06:00Z", "Asia/Kolkata").day).toBe("2026-10-06");
    expect(localParts("2026-10-05T23:59:00Z", UTC).minutes).toBe(23 * 60 + 59);
    expect(localParts("2026-10-06T00:00:00Z", UTC).minutes).toBe(0);
  });

  it("moves by whole calendar days across month ends", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-09-29", "2026-10-06")).toBe(7);
  });

  it("lists the last days, oldest first, ending today", () => {
    expect(lastDays(7, Date.parse("2026-10-06T08:00:00Z"), UTC)).toEqual([
      "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06",
    ]);
  });

  it("labels days for an axis and a range for a header", () => {
    expect(dayLabel("2026-10-06")).toBe("Tue 6");
    expect(rangeLabel(lastDays(7, Date.parse("2026-10-06T08:00:00Z"), UTC))).toBe("30 Sep – 6 Oct");
    expect(rangeLabel(["2026-10-01", "2026-10-07"])).toBe("1 – 7 Oct");
    expect(rangeLabel(["2026-10-07"])).toBe("7 Oct");
    expect(rangeLabel([])).toBe("");
  });
});

describe("shares", () => {
  it("is never above the whole and never made from nothing", () => {
    expect(shareOf(5, 21)).toBe("24%");
    expect(shareOf(22, 21)).toBeNull();
    expect(shareOf(0, 0)).toBeNull();
    expect(shareOf(0, 5)).toBe("0%");
  });
});

describe("what a log line is", () => {
  it("reads the verbs the views count", () => {
    expect(kindOf({ subjectKind: "candidate", verb: "shortlisted", data: {} })).toBe("shortlisted");
    expect(kindOf({ subjectKind: "candidate", verb: "outreach_sent", data: {} })).toBe("sent");
    expect(kindOf({ subjectKind: "candidate", verb: "outreach_drafted", data: {} })).toBe("drafted");
    expect(kindOf({ subjectKind: "candidate", verb: "outreach_logged", data: { outcome: "replied" } })).toBe("reply");
    expect(kindOf({ subjectKind: "candidate", verb: "outreach_logged", data: { outcome: "bounced" } })).toBe("bounce");
    expect(kindOf({ subjectKind: "candidate", verb: "outreach_logged", data: { outcome: "no_reply" } })).toBeNull();
    expect(kindOf({ subjectKind: "candidate", verb: "moved", data: { from: "outreach", to: "interviewing", step: "loop" } })).toBe("interview");
    expect(kindOf({ subjectKind: "candidate", verb: "moved", data: { from: "interviewing", to: "hired" } })).toBe("hired");
    expect(kindOf({ subjectKind: "candidate", verb: "moved", data: { from: "shortlisted", to: "outreach", step: "waiting" } })).toBe("contacted");
    expect(kindOf({ subjectKind: "candidate", verb: "moved", data: { from: "shortlisted", to: "passed" } })).toBeNull();
    expect(kindOf({ subjectKind: "campaign", verb: "spec_drafted", data: {} })).toBe("spec");
    expect(kindOf({ subjectKind: "form", verb: "response_received", data: {} })).toBe("form");
    expect(kindOf({ subjectKind: "form", verb: "form_edited", data: {} })).toBeNull();
  });

  it("counts a logged reply once, though the log writes it twice", () => {
    const events = eventsOf([
      act({ id: "3", verb: "outreach_logged", data: { outcome: "replied" } }),
      act({ id: "2", verb: "moved", data: { from: "shortlisted", to: "outreach", step: "replied" } }),
      act({ id: "1", verb: "outreach_sent" }),
    ], UTC);
    expect(events.map((e) => e.kind).sort()).toEqual(["reply", "sent"]);
  });

  it("counts different people, and the same person on different days, separately", () => {
    const events = eventsOf([
      act({ id: "4", subjectId: "c2", verb: "moved", data: { to: "interviewing" } }),
      act({ id: "3", subjectId: "c1", verb: "moved", data: { to: "interviewing" }, at: "2026-10-04T10:00:00Z" }),
      act({ id: "2", subjectId: "c1", verb: "moved", data: { to: "interviewing" } }),
      act({ id: "1", subjectId: "c1", verb: "moved", data: { to: "interviewing" }, at: "2026-10-05T11:00:00Z" }),
    ], UTC);
    expect(events).toHaveLength(3);
  });

  it("buckets events by day, on the days given only", () => {
    const events = eventsOf([
      act({ id: "3", verb: "outreach_sent", at: "2026-10-06T09:00:00Z" }),
      act({ id: "2", verb: "outreach_sent", at: "2026-10-05T09:00:00Z" }),
      act({ id: "1", verb: "outreach_sent", at: "2026-09-01T09:00:00Z" }),
    ], UTC);
    expect(perDay(events, ["2026-10-04", "2026-10-05", "2026-10-06"], "sent")).toEqual([0, 1, 1]);
    expect(perDay(events, ["2026-10-05"], "reply")).toEqual([0]);
  });
});

describe("a campaign in charts", () => {
  it("reads the stages people reached from the overview", () => {
    expect(reachFrom(overview().funnel)).toEqual({ found: 74, shortlisted: 21, outreach: 5, replied: 0, interviewing: 3, hired: 1 });
    expect(reachFrom([])).toEqual({ found: 0, shortlisted: 0, outreach: 0, replied: 0, interviewing: 0, hired: 0 });
  });

  it("draws each funnel stage over the one before it", () => {
    const steps = funnelSteps(reachFrom(overview().funnel));
    expect(steps.map((s) => [s.id, s.n, s.of])).toEqual([["shortlisted", 21, 74], ["contacted", 5, 21], ["interviews", 3, 5], ["hired", 1, 3]]);
  });

  it("leads with a gain and never goes red", () => {
    const ov = overview();
    const [found, contacted, replied, interviews] = campaignKpis(ov, [0, 0, 0, 0], [0, 1, 0, 0]);
    expect(found).toMatchObject({ label: "Found", n: 74, sub: "74 this week", up: true });
    expect(contacted).toMatchObject({ n: 5, sub: "24% of those shortlisted" });
    expect(replied).toMatchObject({ n: 0, sub: "None logged yet" });
    expect(replied?.spark).toBeUndefined();
    expect(interviews).toMatchObject({ n: 3, sub: "60% of people contacted" });
    expect(interviews?.spark).toEqual([0, 1, 0, 0]);
    const slower = campaignKpis(overview({ found: { thisWeek: 3, lastWeek: 10, total: 80 } }), [], [])[0];
    expect(slower?.sub).toBe("3 this week");
    expect(slower?.up).toBeUndefined();
    expect(campaignKpis(overview({ found: { thisWeek: 12, lastWeek: 5, total: 80 } }), [], [])[0]).toMatchObject({ sub: "+7 vs last week", up: true });
    expect(campaignKpis(overview({ found: { thisWeek: 0, lastWeek: 5, total: 80 } }), [], [])[0]?.sub).toBe("None this week");
  });

  it("leaves out a share it can't stand behind", () => {
    const ov = overview({ funnel: [{ stage: "found", count: 3, pct: null }, { stage: "shortlisted", count: 9, pct: 300 }, { stage: "outreach", count: 0, pct: 0 }] });
    const [, contacted, replied] = campaignKpis(ov, [], []);
    expect(contacted?.sub).toBeNull();
    expect(replied?.sub).toBeNull();
  });

  it("says what email did, from the records only", () => {
    expect(emailWorks(null, null, { name: "X", days: 30 }).empty).toMatch(/didn't load/);
    const none = emailWorks({ sent: 0, replied: 0 }, null, { name: "Android", days: 30 });
    expect(none.stats).toEqual([]);
    expect(none.empty).toBe("No emails have gone out for Android in the last 30 days.");
    expect(none.note).toMatch(/WhatsApp and LinkedIn/);
    const quiet = emailWorks({ sent: 8, replied: 0 }, null, { name: "Android", days: 30 });
    expect(quiet.find).toMatch(/8 emails sent for Android, none answered yet/);
    expect(quiet.acts[0]).toMatchObject({ primary: true, seed: "Follow up with everyone on Android who hasn't replied" });
    const good = emailWorks({ sent: 8, replied: 2 }, 6.2, { name: null, days: 30 });
    expect(good.find).toBe("2 of 8 emails got a reply, 25%. Replies come about 6 hours after sending.");
    expect(good.stats[0]).toEqual({ channel: "gmail", sent: 8, replied: 2, medianHours: 6 });
    expect(good.acts.map((a) => a.label)).toEqual(["Find the drop-off"]);
  });

  it("assembles one campaign from its overview, its log and the workspace's email", () => {
    const outreach = { days: 30, totals: { sent: 9 }, byCampaign: [{ campaignId: "k1", name: "x", drafted: 3, sent: 4, replied: 1, awaiting: 3, replyRate: 0.25 }] } as unknown as OutreachAnalytics;
    const events = eventsOf([
      act({ id: "2", verb: "outreach_logged", data: { outcome: "replied" }, at: "2026-10-05T10:00:00Z" }),
      act({ id: "1", verb: "moved", subjectId: "c2", data: { to: "interviewing" }, at: "2026-10-06T10:00:00Z" }),
    ], UTC);
    const d = oneCampaignCharts({ overview: overview(), events, outreach });
    expect(d.series.map((s) => s.id)).toEqual(["found", "replies", "interviews"]);
    expect(d.series[0]?.note).toBe("last 4 days · 74 total");
    expect(d.series[1]?.days.map((p) => p.n)).toEqual([0, 0, 1, 0]);
    expect(d.series[2]?.days.map((p) => p.n)).toEqual([0, 0, 0, 1]);
    expect(d.series[0]?.days[0]?.day).toBe("Sat 3");
    expect(d.works.stats[0]).toMatchObject({ sent: 4, replied: 1 });
    expect(d.funnelEmpty).toBeUndefined();
  });

  it("says plainly there's no funnel to draw before anyone is shortlisted", () => {
    const empty = overview({ funnel: [{ stage: "found", count: 12, pct: null }, { stage: "shortlisted", count: 0, pct: 0 }] });
    expect(oneCampaignCharts({ overview: empty, events: [], outreach: null }).funnelEmpty).toMatch(/Nobody is shortlisted yet/);
  });

  it("combines open campaigns, and compares them first", () => {
    const p = (over: Partial<ProjectsAnalytics["campaigns"][number]>): ProjectsAnalytics["campaigns"][number] => ({
      campaignId: "a", name: "A", status: "active", client: null, target: 1, openedAt: "2026-10-01T00:00:00Z", closedAt: null, found: 10, shortlisted: 4, contacted: 2,
      replied: 1, interviewed: 1, hired: 0, firstHireAt: null, lastActivityAt: null, daysOpen: 5, daysToFirstHire: null, quiet: false, ...over,
    });
    const list = [p({}), p({ campaignId: "b", name: "B", found: 30, shortlisted: 6, contacted: 0, replied: 0, interviewed: 0, client: "Acme" }), p({ campaignId: "c", name: "C", status: "closed" })];
    expect(openProjects(list).map((x) => x.name)).toEqual(["A", "B"]);
    expect(openProjects([list[2] as (typeof list)[number]]).map((x) => x.name)).toEqual(["C"]);
    const d = allCampaignCharts({ projects: list, trends: { a: [1, 2, 3], b: [0, 0, 5] }, outreach: null, now: Date.parse("2026-10-06T08:00:00Z") });
    expect(d.kpis.map((k) => [k.label, k.n])).toEqual([["Found", 40], ["Contacted", 2], ["Replied", 1], ["Interviews", 1]]);
    expect(d.byCampaign?.map((c) => [c.name, c.meta, c.reply])).toEqual([["A", "Open", { value: 1, max: 2 }], ["B", "Acme", null]]);
    expect(d.series[0]?.days.map((x) => x.n)).toEqual([1, 2, 8]);
    expect(d.steps.map((s) => [s.n, s.of])).toEqual([[10, 40], [2, 10], [1, 2], [0, 1]]);
    expect(d.foundWord).toBe("found");
  });
});

describe("where people drop out", () => {
  const reach = reachFrom(overview().funnel);

  it("names the widest drop, leaving the choosing of a shortlist out", () => {
    const drop = widestDrop(chainOf(reach));
    expect(drop?.from.label).toBe("Shortlisted");
    expect(drop?.to.label).toBe("Contacted");
    expect(Math.round((drop?.kept ?? 0) * 100)).toBe(24);
    // Found to shortlisted is 28%, but it is the recruiter picking, so it never counts.
    const picky = widestDrop(chainOf({ found: 1000, shortlisted: 4, outreach: 4, replied: 0, interviewing: 4, hired: 4 }));
    expect(picky?.kept).toBe(1);
  });

  it("won't call a pattern from a handful of people", () => {
    expect(widestDrop(chainOf({ found: 40, shortlisted: 2, outreach: 1, replied: 0, interviewing: 0, hired: 0 }))).toBeNull();
    expect(widestDrop(chainOf({ found: 0, shortlisted: 0, outreach: 0, replied: 0, interviewing: 0, hired: 0 }))).toBeNull();
  });

  it("finds who is sitting where, and the one waiting longest", () => {
    const p = (name: string, stage: "shortlisted" | "outreach" | "interviewing" | "hired" | "passed", step: "waiting" | "replied" | "loop" | "offer" | null, inStage: number) => ({ name, stage, step, inStage });
    const stuck = stuckOf([
      p("Asha Verma", "outreach", "replied", 3), p("Ravi Rao", "outreach", "replied", 1), p("Meena Iyer", "outreach", "waiting", 2),
      p("Sam K", "shortlisted", null, 4), p("Jo L", "shortlisted", null, 0), p("Dev P", "interviewing", "loop", 5), p("Lee C", "interviewing", "offer", 1),
      p("Hired Hank", "hired", null, 9), p("Passed Pat", "passed", null, 9),
    ]);
    expect(stuck.map((s) => [s.kind, s.n, s.longest, s.who])).toEqual([
      ["replied", 2, 3, "Asha Verma"], ["shortlisted", 2, 4, "Sam K"], ["waiting", 1, 2, "Meena Iyer"], ["interviewing", 1, 5, "Dev P"], ["offer", 1, 1, "Lee C"],
    ]);
    expect(stuck[0]?.text).toBe("2 have replied and are waiting on you");
    expect(stuckOf([])).toEqual([]);
  });

  it("says how long in calendar days", () => {
    expect(waitedLabel(0)).toBe("since today");
    expect(waitedLabel(1)).toBe("since yesterday");
    expect(waitedLabel(3)).toBe("for 3 days");
    expect(stuckAside({ n: 1, longest: 3, who: "Asha Verma" })).toBe("Asha Verma, for 3 days");
    expect(stuckAside({ n: 4, longest: 1, who: "Asha Verma" })).toBe("Longest: Asha Verma, since yesterday");
    expect(stuckAside({ n: 4, longest: 0, who: "Asha Verma" })).toBeNull();
    // A name is said whole: "Imp" alone is not who waited, and two people can share a first name.
    expect(stuckAside({ n: 1, longest: 1, who: "Imp 64" })).toBe("Imp 64, since yesterday");
  });

  it("points to the shortlist when that is where people stall", () => {
    const stuck = stuckOf([{ name: "Sam K", stage: "shortlisted", step: null, inStage: 4 }, { name: "Jo L", stage: "shortlisted", step: null, inStage: 1 }]);
    const a = adviceFor(widestDrop(chainOf(reach)), stuck, "Android", reach);
    expect(a.text).toBe("Shortlisted to contacted is where you lose the most: 5 of 21. 2 are shortlisted and still waiting for a first message, the longest for 4 days. Reaching out to them is the fastest fix.");
    expect(a.acts).toEqual([{ label: "Reach out to the 2", seed: "Reach out to the shortlist for Android", primary: true }]);
  });

  it("answers the replies first, then the follow-up, when people drop after contact", () => {
    const r = { found: 90, shortlisted: 30, outreach: 20, replied: 6, interviewing: 3, hired: 1 };
    const stuck = stuckOf([
      { name: "Asha Verma", stage: "outreach", step: "replied", inStage: 3 }, { name: "Ravi Rao", stage: "outreach", step: "replied", inStage: 1 },
      { name: "Meena Iyer", stage: "outreach", step: "waiting", inStage: 2 }, { name: "Dev P", stage: "outreach", step: "waiting", inStage: 5 },
    ]);
    const a = adviceFor(widestDrop(chainOf(r)), stuck, "Android", r);
    expect(a.text).toBe("Contacted to interviewing is where you lose the most: 3 of 20. 2 replies are waiting on an answer from you, and Asha Verma has waited 3 days. Answering those is the fastest fix; a follow-up to the 2 who haven't replied is the next.");
    expect(a.acts.map((x) => [x.label, x.primary ?? false])).toEqual([["Answer the 2 waiting", true], ["Follow up with the 2", false]]);
    // With no replies waiting, the follow-up is the fix.
    const b = adviceFor(widestDrop(chainOf(r)), stuckOf([{ name: "Meena Iyer", stage: "outreach", step: "waiting", inStage: 2 }]), "Android", r);
    expect(b.text).toContain("1 hasn't replied yet, so a follow-up is the fastest fix");
    expect(b.acts[0]?.primary).toBe(true);
  });

  it("checks on interviews when the drop is after them", () => {
    const r = { found: 90, shortlisted: 30, outreach: 20, replied: 6, interviewing: 8, hired: 1 };
    const stuck = stuckOf([{ name: "Dev P", stage: "interviewing", step: "loop", inStage: 6 }, { name: "Lee C", stage: "interviewing", step: "offer", inStage: 1 }]);
    const a = adviceFor(widestDrop(chainOf(r)), stuck, "Android", r);
    expect(a.text).toBe("Interviewing to hired is where you lose the most: 1 of 8. 2 people are still in interviews, the longest for 6 days.");
    expect(a.acts[0]?.seed).toBe("Where do the interviews stand on Android?");
  });

  it("says so, with no verdict, before anyone is shortlisted or while there are too few", () => {
    const none = { found: 30, shortlisted: 0, outreach: 0, replied: 0, interviewing: 0, hired: 0 };
    expect(adviceFor(null, [], "Android", none).text).toMatch(/Nobody is shortlisted on Android yet/);
    const few = { found: 30, shortlisted: 2, outreach: 1, replied: 0, interviewing: 0, hired: 0 };
    expect(adviceFor(null, [], "Android", few).text).toBe("2 people are on the pipeline, too few at each step to say where people drop out yet.");
  });
});

describe("the receipt", () => {
  const days = ["2026-10-04", "2026-10-05", "2026-10-06"];
  const placed = (es: ReturnType<typeof eventsOf>) => es.map((e) => ({ ...e, pos: positionOf(e, days) })).filter((e) => e.pos >= 0);

  it("places an event on the track by day and time of day", () => {
    expect(positionOf({ day: "2026-10-05", minutes: 720 }, days)).toBe(1.5);
    expect(positionOf({ day: "2026-09-01", minutes: 0 }, days)).toBe(-1);
  });

  it("turns runs and finds into events inside the week only", () => {
    const runs = [
      { skill: "sourcing", status: "done", campaignId: "k1", createdAt: "2026-10-05T10:00:00Z" },
      { skill: "watch", status: "done", campaignId: "k2", createdAt: "2026-10-05T10:00:00Z" },
      { skill: "chat", status: "done", campaignId: "k1", createdAt: "2026-10-05T10:00:00Z" },
      { skill: "sourcing", status: "failed", campaignId: "k1", createdAt: "2026-10-05T11:00:00Z" },
      { skill: "sourcing", status: "done", campaignId: "k1", createdAt: "2026-08-05T10:00:00Z" },
    ];
    expect(runEvents(runs, days, "k1", UTC)).toHaveLength(1);
    expect(runEvents(runs, days, null, UTC)).toHaveLength(2);
    expect(unfinishedRuns(runs, days, "k1", UTC)).toBe(1);
    const found = foundEvents([{ day: "2026-10-03", count: 9 }, { day: "2026-10-05", count: 74 }, { day: "2026-10-06", count: 0 }], days);
    expect(found.map((e) => [e.day, e.n])).toEqual([["2026-10-05", 74]]);
  });

  it("knows when a full page of runs doesn't reach back far enough", () => {
    const at = (day: string) => ({ createdAt: `${day}T10:00:00Z` });
    const since = Date.parse("2026-09-30T00:00:00Z");
    expect(runsReach([at("2026-10-05"), at("2026-10-04")], since, 100)).toBe(true);
    const full = Array.from({ length: 3 }, () => at("2026-10-05"));
    expect(runsReach(full, since, 3)).toBe(false);
    expect(runsReach([...full.slice(1), at("2026-09-20")], since, 3)).toBe(true);
  });

  it("counts the lines up as the marker travels, and leaves out lines with nothing behind them", () => {
    const events = placed(eventsOf([
      act({ id: "6", verb: "outreach_logged", data: { outcome: "replied" }, at: "2026-10-06T08:00:00Z" }),
      act({ id: "5", verb: "outreach_sent", subjectId: "c2", at: "2026-10-05T09:00:00Z" }),
      act({ id: "4", verb: "outreach_sent", subjectId: "c1", at: "2026-10-04T09:00:00Z" }),
      act({ id: "3", verb: "shortlisted", subjectId: "c3", at: "2026-10-04T08:00:00Z" }),
    ], UTC));
    const start = receiptAt(events, 0);
    const lineIds = (r: ReturnType<typeof receiptAt>) => r.groups.flatMap((g) => g.lines.map((l) => l.id));
    expect(lineIds(start)).toEqual(["shortlisted", "sent", "reply"]);
    expect(start.groups.flatMap((g) => g.lines).every((l) => l.n === 0)).toBe(true);
    const mid = receiptAt(events, 1.5);
    expect(mid.groups.flatMap((g) => g.lines).map((l) => [l.id, l.n])).toEqual([["shortlisted", 1], ["sent", 2], ["reply", 0]]);
    expect(mid.rate).toBe("0 of 2 · 0%");
    const end = receiptAt(events, 3);
    expect(end.replies).toBe(1);
    expect(end.rate).toBe("1 of 2 · 50%");
    expect(end.groups.find((g) => g.id === "outcomes")?.lines.find((l) => l.id === "reply")).toMatchObject({ n: 1, hot: true });
    expect(end.groups.find((g) => g.id === "messages")?.lines[0]).toMatchObject({ mark: "gmail" });
  });

  it("says no emails were sent when some were only drafted, and no replies when some were sent", () => {
    const drafted = placed(eventsOf([act({ id: "1", verb: "outreach_drafted", at: "2026-10-05T09:00:00Z" })], UTC));
    const a = receiptAt(drafted, 3).groups.find((g) => g.id === "messages")?.lines.map((l) => [l.id, l.n]);
    expect(a).toEqual([["drafted", 1], ["sent", 0]]);
    const sent = placed(eventsOf([act({ id: "1", verb: "outreach_sent", at: "2026-10-05T09:00:00Z" })], UTC));
    expect(receiptAt(sent, 3).groups.find((g) => g.id === "outcomes")?.lines.map((l) => [l.id, l.n])).toEqual([["reply", 0]]);
  });

  it("says a quiet part of the week is quiet, and shows no rate with nothing sent", () => {
    const r = receiptAt([], 3);
    expect(r.groups.map((g) => [g.id, g.lines.length])).toEqual([["search", 0], ["messages", 0], ["outcomes", 0]]);
    expect(r.groups[1]?.empty).toBe("No emails drafted or sent in this period.");
    expect(r.rate).toBeNull();
  });

  it("takes a rolling week's totals as lines with no track", () => {
    const h = homeEvents({ found: { current: 169 }, replies: { current: 0 }, interviews: { current: 3 }, hires: { current: 1 } });
    expect(receiptAt(h, 0).groups.flatMap((g) => g.lines).map((l) => [l.id, l.n])).toEqual([["found", 169], ["interview", 3], ["hired", 1]]);
    // The home overview does count replies, so zero is a fact worth saying.
    expect(receiptAt(h, 0, ["found", "reply", "interview", "hired"]).groups.flatMap((g) => g.lines).map((l) => [l.id, l.n])).toEqual([["found", 169], ["reply", 0], ["interview", 3], ["hired", 1]]);
  });

  it("describes a marker by day and what happened", () => {
    expect(markerText({ kind: "reply", who: "Asha Verma", day: "2026-10-06" })).toBe("Tue 6 · Asha Verma replied");
    expect(markerText({ kind: "sent", who: null, day: "2026-10-06" })).toBe("Tue 6 · Emailed Someone");
  });
});

describe("what happened in the last day", () => {
  const NOW = Date.parse("2026-10-06T08:00:00Z");
  const day = (found: number, replies = 0, interviews = 0, hires = 0) => ({ found: { current: found }, replies: { current: replies }, interviews: { current: interviews }, hires: { current: hires } });
  const home = (over: { found?: number; replies?: number; interviews?: number; hires?: number; open?: number; due?: number } = {}) => ({
    ...day(over.found ?? 0, over.replies ?? 0, over.interviews ?? 0, over.hires ?? 0), tasks: { open: over.open ?? 0, dueToday: over.due ?? 0 },
  });

  it("leads with the wins, then what's open for the person", () => {
    const d = digestOf({
      home: home({ found: 65, replies: 2, interviews: 1, open: 2, due: 1 }),
      camps: [
        { id: "a", name: "Android", nextStep: "Review 1 new applicant", day: day(60, 2, 1) },
        { id: "b", name: "Backend", nextStep: null, day: day(5) },
        { id: "c", name: "Rust", nextStep: null, day: day(0) },
      ],
      runs: [],
      now: NOW,
    });
    expect(plainOf(d.lead)).toBe("In the last day: 1 moved to interviews, 2 replies, and 65 found across 2 campaigns. 2 tasks are open for you, 1 due today.");
    expect(d.rows.map((r) => [r.name, r.note])).toEqual([["Android", "1 moved to interviews · Review 1 new applicant"], ["Backend", null]]);
    expect(d.quiet).toEqual(["Rust"]);
    expect(d.nothing).toBe(false);
  });

  it("marks only the figures for bold", () => {
    const d = digestOf({ home: home({ found: 5 }), camps: [{ id: "a", name: "A", nextStep: null, day: day(5) }], runs: [], now: NOW });
    expect(d.lead).toEqual(["In the last day: ", { b: "5 found" }, "."]);
  });

  it("says plainly when nothing happened", () => {
    const d = digestOf({ home: home({ open: 1 }), camps: [{ id: "a", name: "A", nextStep: null, day: day(0) }], runs: [], now: NOW });
    expect(plainOf(d.lead)).toBe("Nothing new in the last day. 1 task is open for you.");
    expect(d.nothing).toBe(true);
    expect(d.quiet).toEqual(["A"]);
    expect(plainOf(digestOf({ home: home(), camps: [], runs: [], now: NOW }).lead)).toBe("Nothing new in the last day.");
  });

  it("counts the agents' searches in the last day, and the ones that didn't finish", () => {
    const hours = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
    const d = digestOf({
      home: home({ found: 4 }),
      camps: [{ id: "a", name: "A", nextStep: null, day: day(4) }, { id: "b", name: "B", nextStep: null, day: day(0) }],
      runs: [
        { skill: "sourcing", status: "done", campaignId: "a", createdAt: hours(3) },
        { skill: "sourcing", status: "done", campaignId: "a", createdAt: hours(30) },
        { skill: "watch", status: "failed", campaignId: "b", createdAt: hours(2) },
        { skill: "chat", status: "done", campaignId: "a", createdAt: hours(1) },
      ],
      now: NOW,
    });
    expect(d.rows.find((r) => r.id === "a")).toMatchObject({ searches: 1, note: "1 search ran" });
    expect(d.unfinished).toBe(1);
  });

  it("sorts by wins: hires, then interviews, then replies, then finds", () => {
    const d = digestOf({
      home: home({ found: 9 }),
      camps: [
        { id: "a", name: "A", nextStep: null, day: day(9) },
        { id: "b", name: "B", nextStep: null, day: day(0, 1) },
        { id: "c", name: "C", nextStep: null, day: day(0, 0, 0, 1) },
        { id: "d", name: "D", nextStep: null, day: day(0, 0, 2) },
      ],
      runs: [],
      now: NOW,
    });
    expect(d.rows.map((r) => r.name)).toEqual(["C", "D", "B", "A"]);
    expect(d.rows[0]?.note).toBe("1 hired");
  });

  it("copes with a campaign whose day didn't load", () => {
    const d = digestOf({ home: home({ found: 2 }), camps: [{ id: "a", name: "A", nextStep: "Do a thing", day: null }], runs: [], now: NOW });
    expect(d.rows).toEqual([{ id: "a", name: "A", found: 0, replies: 0, interviews: 0, hires: 0, searches: 0, note: "Do a thing" }]);
  });
});

describe("which campaigns", () => {
  it("understands a request for all of them", () => {
    expect(ALL).toBe("all");
    expect(asksForAll("How are all my campaigns doing?")).toBe(true);
    expect(asksForAll("show every campaign")).toBe(true);
    expect(asksForAll("across all campaigns")).toBe(true);
    expect(asksForAll("Show me the campaign view for fn3 Senior Android Engineer")).toBe(false);
    expect(asksForAll("what did I miss overnight")).toBe(false);
  });
});

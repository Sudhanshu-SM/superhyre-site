import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignsBody, MineBody, OutreachBody, OverviewBody, PipelineBody, TeamBody } from "../AnalyticsPages";
import { DEFAULT_FILTERS } from "../analyticsFilters";
import { lookedAfterBy, peopleTable, waitingTable } from "../analyticsView";
import {
  adaptCalls,
  adaptCampaigns,
  adaptOutreach,
  adaptOverview,
  adaptPipeline,
  adaptRecruiters,
  adaptWeekly,
  ratio,
} from "../api/analyticsWire";

/**
 * The API's answers exactly as docs/analytics-api.md shows them, read into what the pages draw and then drawn.
 * If the server's wire format and the console drift apart, this is where it shows.
 */

const f = DEFAULT_FILTERS;

const envelope = (over: Record<string, unknown> = {}) => ({
  days: 30,
  timeZone: "Asia/Kolkata",
  period: { key: "30", days: 30, from: "2026-09-14", to: "2026-10-13", prevFrom: "2026-08-15", prevTo: "2026-09-13" },
  viewer: { role: "owner", userId: "u-1", seesTeam: true, canPickRecruiter: true, view: "team", recruiterId: null },
  empty: false,
  emptyReason: null,
  ...over,
});
const rat = (n: number, of: number, rate: number | null) => {
  const small = of < 5;
  return { n, of, rate: small ? null : rate, small, smallN: small };
};

const overviewWire = {
  ...envelope(),
  tiles: {
    hires: { n: 3, prev: 1, planned: 8 },
    interviews: { n: 9, prev: 6 },
    replies: { n: 14, prev: 10, contacted: 52 },
    found: { n: 71, prev: 40, series: [{ day: "2026-10-12", n: 2 }, { day: "2026-10-13", n: 4 }] },
  },
  funnel: {
    cohort: { from: "2026-09-14", to: "2026-10-13" },
    steps: [
      { id: "found", label: "Found", n: 80 },
      { id: "shortlisted", label: "On the shortlist", n: 41 },
      { id: "contacted", label: "Contacted", n: 30 },
      { id: "replied", label: "Replied", n: 12 },
      { id: "interviewing", label: "Interviewing", n: 7 },
      { id: "hired", label: "Hired", n: 3 },
    ],
    rates: [
      { id: "kept", label: "Kept after search", ...rat(41, 80, 0.51) },
      { id: "reachedOut", label: "Reached out to", ...rat(30, 41, 0.73) },
      { id: "replied", label: "Replied", ...rat(12, 30, 0.4) },
      { id: "interviewing", label: "Moved to interview", ...rat(7, 30, 0.23) },
      { id: "hired", label: "Hired", ...rat(3, 7, 0.43) },
    ],
  },
  trend: [{ weekStart: "2026-10-05", interviews: 3, hires: 1 }, { weekStart: "2026-10-12", interviews: 0, hires: 0 }],
  trendGrain: "week",
  lookAt: [
    { kind: "quiet_campaign", count: 1, text: "1 campaign has been quiet for 7 days or more", href: "#/analytics/campaigns" },
    { kind: "overdue_tasks", count: 2, text: "2 tasks are overdue", href: "#/tasks", campaignId: "c-1" },
  ],
};

const person = (name: string, userId: string) => ({
  userId, name, role: "recruiter", former: false, active: true,
  emails: { sent: 42, replied: 9, rate: 0.21, small: false },
  calls: { placed: 18, connected: 11, talkSeconds: 3120, rate: 0.61, small: false },
  shortlisted: 20, interviews: 5, hires: 2,
  tasks: { due: 6, onTime: 5, overdue: 1 },
  load: { inProgress: 14, waiting: 3, campaigns: 2 },
  prev: {
    emails: { sent: 30, replied: 6, rate: 0.2, small: false },
    calls: { placed: 12, connected: 7, talkSeconds: 2000, rate: 0.58, small: false },
    shortlisted: 15, interviews: 3, hires: 1,
  },
});

const waitingWire = {
  campaignCandidateId: "cc-1", candidateId: "c-1", campaignId: "camp-1", name: "Asha Verma", campaign: "Backend",
  stage: "outreach", step: "waiting", days: 19, pastThreshold: true, ownerName: "Meera Nair", mine: false,
};

describe("a share from the API", () => {
  it("turns a fraction into a whole percent, and never keeps a rate for a small number", () => {
    expect(ratio({ n: 9, of: 42, rate: 0.21, small: false, smallN: false })).toEqual({ n: 9, of: 42, rate: 21, smallN: false });
    expect(ratio({ n: 1, of: 4, rate: null, small: true, smallN: true })).toEqual({ n: 1, of: 4, rate: null, smallN: true });
    // even if a rate arrived with a small count, it is a count, "1 of 4", never 25%
    expect(ratio({ n: 1, of: 4, rate: 0.25, small: false })).toMatchObject({ rate: null, smallN: true });
    // never above 100
    expect(ratio({ n: 6, of: 5, rate: 1.2, small: false }).rate).toBe(100);
  });

  it("reads either name for the small flag, and works out a missing rate from the counts", () => {
    expect(ratio({ n: 2, of: 4, small: true }).smallN).toBe(true);
    expect(ratio({ n: 2, of: 4, smallN: true }).smallN).toBe(true);
    expect(ratio({ n: 2, of: 8 }).rate).toBe(25);
    expect(ratio(undefined)).toEqual({ n: 0, of: 0, rate: null, smallN: true });
  });
});

describe("Overview from the API", () => {
  const data = adaptOverview(overviewWire);

  it("keeps the four figures, the funnel and the envelope", () => {
    expect(data.tiles.hires).toEqual({ n: 3, prev: 1, planned: 8 });
    expect(data.tiles.found.series).toHaveLength(2);
    expect(data.funnel.steps.map((s) => s.id)).toEqual(["found", "shortlisted", "contacted", "replied", "interviewing", "hired"]);
    expect(data.funnel.rates[0]).toMatchObject({ id: "kept", n: 41, of: 80, rate: 51, smallN: false });
    expect(data.viewer.role).toBe("owner");
    expect(data.period.days).toBe(30);
  });

  it("reads the trend array and its grain, and a link that names a campaign or none", () => {
    expect(data.trend).toEqual({
      grain: "week",
      points: [{ start: "2026-10-05", interviews: 3, hires: 1 }, { start: "2026-10-12", interviews: 0, hires: 0 }],
    });
    expect(data.lookAt.map((l) => l.campaignId)).toEqual([null, "c-1"]);
    expect(adaptOverview({ ...overviewWire, trendGrain: "day" }).trend.grain).toBe("day");
  });

  it("is drawn, with the figures the server counted", () => {
    const html = renderToStaticMarkup(<OverviewBody data={data} filters={f} />);
    expect(html).toContain("<dd>3</dd>");
    expect(html).toContain("of 8 planned");
    expect(html).toContain("of 52 contacted");
    expect(html).toContain("Details"); // what is worth a look is one click away, not on the page
  });

  it("reads an answer with nothing in it as empty, not as an error", () => {
    const empty = adaptOverview({ ...envelope({ empty: true, emptyReason: "no_campaigns" }) });
    expect(empty.empty).toBe(true);
    expect(empty.emptyReason).toBe("no_campaigns");
    expect(empty.funnel.steps).toEqual([]);
    expect(empty.trend.points).toEqual([]);
    expect(() => renderToStaticMarkup(<OverviewBody data={empty} filters={f} />)).not.toThrow();
  });
});

describe("Recruiters from the API", () => {
  it("reads each person's groups into the shapes the table uses, and counts under 5 as counts", () => {
    const d = adaptRecruiters({
      ...envelope(),
      people: [person("Meera Nair", "u-2"), { ...person("Dev Menon", "u-3"), emails: { sent: 4, replied: 1, rate: null, small: true } }],
      me: null,
      typical: null,
      waitingLongest: [],
    });
    const [meera, dev] = d.people ?? [];
    expect(meera).toMatchObject({
      userId: "u-2",
      name: "Meera Nair",
      emails: { sent: 42, replied: 9, reply: { n: 9, of: 42, rate: 21, smallN: false } },
      calls: { placed: 18, connected: 11, talkSeconds: 3120, connect: { rate: 61 } },
      moves: { shortlisted: 20, interviews: 5, hires: 2 },
      tasks: { due: 6, onTime: 5, overdue: 1 },
      load: { inProgress: 14, waiting: 3, campaigns: 2 },
      prev: { emailsSent: 30, replies: 6, callsPlaced: 12, talkSeconds: 2000, shortlisted: 15, interviews: 3, hires: 1 },
    });
    expect(dev?.emails.reply).toEqual({ n: 1, of: 4, rate: null, smallN: true });
    expect(d.me).toBeNull();
    const html = renderToStaticMarkup(<TeamBody data={d} filters={f} />);
    expect(html).toContain("Meera Nair");
    // a share under 5 sent is a count in the table behind View all, the drawer and the download
    const csv = peopleTable(d.people ?? []);
    expect(csv.rows.some((r) => r.includes("1 of 4"))).toBe(true);
    expect(csv.rows.some((r) => r.includes("25%"))).toBe(false);
  });

  it("gives a recruiter their own row and a team typical with no name", () => {
    const { userId: _u, name: _n, ...stats } = person("", "");
    const d = adaptRecruiters({
      ...envelope({ viewer: { role: "recruiter", userId: "u-9", seesTeam: false, canPickRecruiter: false, view: "mine", recruiterId: null } }),
      people: null,
      me: person("Aarav Shah", "u-9"),
      typical: { ...stats, emails: { sent: 20, replied: 4, rate: 0.2, small: false } },
      waitingLongest: [waitingWire],
    });
    expect(d.people).toBeNull();
    expect(d.me?.name).toBe("Aarav Shah");
    expect(d.typical).not.toBeNull();
    expect(d.typical).not.toHaveProperty("name");
    expect(d.typical).not.toHaveProperty("userId");
    expect(d.waitingLongest[0]).toMatchObject({ name: "Asha Verma", days: 19, stage: "outreach", step: "waiting" });
    const html = renderToStaticMarkup(<MineBody data={d} filters={f} standing="recruiter" />);
    expect(html).toContain("Waiting longest");
    expect(html).toMatch(/Team typical \d+/);
  });

  it("has no team typical when the server sent none", () => {
    const d = adaptRecruiters({ ...envelope(), people: null, me: person("Aarav Shah", "u-9"), typical: null, waitingLongest: [] });
    expect(d.typical).toBeNull();
  });

  it("reads a person's weeks, with the period before lined up", () => {
    const d = adaptWeekly({
      userId: "u-2", name: "Meera Nair", grain: "week",
      weeks: [{ weekStart: "2026-10-05", emails: 12, calls: 5, interviews: 2 }],
      previous: [{ weekStart: "2026-09-28", emails: 9, calls: 4, interviews: 1 }],
    });
    expect(d.points).toEqual([{ start: "2026-10-05", emails: 12, calls: 5, interviews: 2 }]);
    expect(d.previous[0]).toMatchObject({ start: "2026-09-28", emails: 9 });
    expect(d.grain).toBe("week");
  });
});

describe("Outreach by channel from the API", () => {
  const wire = {
    ...envelope(),
    totals: { drafted: 0, sent: 40, replied: 10, noReply: 0, bounced: 2, awaiting: 5, failedToSend: 0, medianHoursToReply: 8, replyRate: 0.25 },
    reply: { n: 10, of: 40, rate: 0.25, small: false, smallN: false },
    byCampaign: [], byTouch: [], byHour: [], stalls: { draftsWaiting: 0, unlogged: 0 },
    channels: {
      email: {
        sent: 40, replied: 10, bounced: 2, scheduled: 3, awaiting: 5,
        reply: { n: 10, of: 40, rate: 0.25, small: false, smallN: false },
        bounce: { n: 2, of: 40, rate: null, small: false, smallN: false },
        previous: { sent: 30, replied: 6 },
      },
      calls: {
        placed: 4, connected: 3, talkSeconds: 600, avgSeconds: 200,
        connect: { n: 3, of: 4, rate: null, small: true, smallN: true },
        previous: { placed: 2, connected: 1 },
        outcomes: [{ outcome: "connected", n: 3 }, { outcome: "voicemail", n: 1 }],
        withRecording: 2, withSummary: 1,
        bestHour: { hour: 11, placed: 5, connected: 4, connect: { n: 4, of: 5, rate: 0.8, small: false, smallN: false } },
      },
      whatsapp: { connected: false, sent: 0, replied: 0, reply: { n: 0, of: 0, rate: null, small: true, smallN: true }, previous: { sent: 0, replied: 0 } },
    },
    all: { sent: 44, answered: 13, answer: { n: 13, of: 44, rate: 0.2955, small: false, smallN: false }, previous: { sent: 32, answered: 7 } },
    byChannel: [],
    campaigns: [
      {
        campaignId: "c-1", name: "Backend",
        email: { sent: 40, replied: 10, bounced: 2, scheduled: 3, awaiting: 5, reply: { n: 10, of: 40, rate: 0.25, small: false, smallN: false } },
        calls: { placed: 0, connected: 0, talkSeconds: 0, avgSeconds: null, connect: { n: 0, of: 0, rate: null, small: true, smallN: true } },
        whatsapp: { connected: false, sent: 0, replied: 0 }, sent: 40, answered: 10,
        answer: { n: 10, of: 40, rate: 0.25, small: false, smallN: false },
      },
      {
        campaignId: null, name: "No campaign",
        email: { sent: 0, replied: 0, bounced: 0, scheduled: 0, awaiting: 0, reply: { n: 0, of: 0, rate: null, small: true, smallN: true } },
        calls: { placed: 4, connected: 3, talkSeconds: 600, avgSeconds: 200, connect: { n: 3, of: 4, rate: null, small: true, smallN: true } },
        whatsapp: { connected: false, sent: 0, replied: 0 }, sent: 4, answered: 3,
        answer: { n: 3, of: 4, rate: null, small: true, smallN: true },
      },
    ],
    byPerson: null,
    email: {
      bounce: { n: 2, of: 40, rate: 0.05, small: false, smallN: false },
      timeToFirstReply: { medianHours: 8, n: 10 },
      bestHour: { hour: 9, sent: 12, replied: 6, reply: { n: 6, of: 12, rate: 0.5, small: false, smallN: false } },
    },
  };

  it("reads the channels, the totals across them and the period before", () => {
    const hub = adaptOutreach(wire).hub!;
    expect(hub.fromServer).toBe(true);
    expect(hub.channels.email).toMatchObject({ sent: 40, replied: 10, scheduled: 3, previous: { sent: 30, replied: 6 } });
    expect(hub.channels.email.reply).toEqual({ n: 10, of: 40, rate: 25, smallN: false });
    expect(hub.channels.calls.connect).toEqual({ n: 3, of: 4, rate: null, smallN: true });
    expect(hub.channels.calls.outcomes).toEqual([{ outcome: "connected", n: 3 }, { outcome: "voicemail", n: 1 }]);
    expect(hub.channels.calls.bestHour).toMatchObject({ hour: 11, n: 5, answered: 4 });
    expect(hub.channels.whatsapp).toMatchObject({ connected: false, sent: 0, replied: 0 });
    expect(hub.all).toMatchObject({ sent: 44, answered: 13, previous: { sent: 32, answered: 7 } });
    expect(hub.all.answer.rate).toBeCloseTo(29.55, 1);
    expect(hub.email.bestHour).toMatchObject({ hour: 9, n: 12, answered: 6 });
    expect(hub.email.timeToFirstReply).toEqual({ hours: 8, n: 10 });
  });

  it("reads a row for each campaign with both channels, and calls placed outside one", () => {
    const hub = adaptOutreach(wire).hub!;
    expect(hub.campaigns.map((c) => [c.name, c.sent, c.answered])).toEqual([["Backend", 40, 10], ["No campaign", 4, 3]]);
    expect(hub.campaigns[1]).toMatchObject({ campaignId: null, calls: { placed: 4, connected: 3, avgSeconds: 200 } });
    expect(hub.byPerson).toBeNull();
  });

  it("reads people when the server sends them", () => {
    const people = [{ userId: "u-1", name: "Meera Nair", email: { sent: 3, replied: 1 }, calls: { placed: 2, connected: 1, avgSeconds: 90 } }];
    const hub = adaptOutreach({ ...wire, byPerson: people }).hub!;
    expect(hub.byPerson).toEqual([
      {
        userId: "u-1",
        name: "Meera Nair",
        email: { sent: 3, replied: 1, reply: { n: 1, of: 3, rate: null, smallN: true } },
        calls: { placed: 2, connected: 1, avgSeconds: 90, connect: { n: 1, of: 2, rate: null, smallN: true } },
      },
    ]);
  });

  it("has no hub from a server that does not send the channels, and still reads the emails", () => {
    const { channels: _c, all: _a, campaigns: _k, byPerson: _p, email: _e, byChannel: _b, ...old } = wire;
    const d = adaptOutreach(old);
    expect(d.hub).toBeNull();
    expect(d.totals.sent).toBe(40);
    expect(d.reply).toEqual({ n: 10, of: 40, rate: 25, smallN: false });
  });

  it("reads the new call fields, and leaves them out for an older server", () => {
    const calls = adaptCalls({
      ...envelope(),
      totals: { placed: 5, connected: 4, rate: 0.8, small: false, talkSeconds: 600, avgSeconds: 150, previous: { placed: 3, connected: 1 } },
      outcomes: [], daily: [],
      byCampaign: [{ campaignId: null, name: "No campaign", placed: 5, connected: 4, talkSeconds: 600, avgSeconds: 150 }],
      byPerson: [{ userId: "u-1", name: "Meera Nair", placed: 5, connected: 4, talkSeconds: 600, avgSeconds: 150 }],
      bestHour: { hour: 10, placed: 5, connected: 4, connect: { n: 4, of: 5, rate: 0.8, small: false, smallN: false } },
      records: { withRecording: 2, withSummary: 1 },
    });
    expect(calls.totals.previous).toEqual({ placed: 3, connected: 1 });
    expect(calls.byPerson?.[0]).toMatchObject({ name: "Meera Nair", placed: 5, avgSeconds: 150 });
    expect(calls.bestHour).toMatchObject({ hour: 10, n: 5, answered: 4 });
    expect(calls.records).toEqual({ withRecording: 2, withSummary: 1 });
    const oldCalls = adaptCalls({ ...envelope(), totals: { placed: 1, connected: 1, rate: null, small: true, talkSeconds: 60, avgSeconds: 60 }, outcomes: [], byCampaign: [], daily: [] });
    expect(oldCalls.totals.previous).toBeUndefined();
    expect(oldCalls.byPerson).toBeNull();
    expect(oldCalls.bestHour).toBeNull();
  });
});

describe("Outreach from the API", () => {
  const emails = {
    ...envelope(),
    totals: { drafted: 12, sent: 42, replied: 9, noReply: 20, bounced: 0, awaiting: 6, failedToSend: 0, medianHoursToReply: 6.5, replyRate: 0.21 },
    byCampaign: [{ campaignId: "camp-1", name: "Backend", drafted: 10, sent: 8, replied: 2, awaiting: 1, replyRate: 0.25, reply: rat(2, 8, 0.25) }],
    byTouch: [{ touch: "first", sent: 30, replied: 7, replyRate: 0.23 }],
    touches: [{ touch: "first", sent: 30, replied: 7, reply: rat(7, 30, 0.23) }],
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, sent: hour === 10 ? 12 : 0, replied: hour === 10 ? 3 : 0 })),
    stalls: { draftsWaiting: 2, unlogged: 6 },
    reply: rat(9, 42, 0.21),
    timeToReply: { medianHours: 6.5, n: 9 },
    waiting: 6,
    showByHour: true,
  };

  it("keeps the old fields as they were and adds the shares and the median", () => {
    const d = adaptOutreach(emails);
    expect(d.totals.sent).toBe(42);
    expect(d.byCampaign[0]?.name).toBe("Backend");
    expect(d.reply).toEqual({ n: 9, of: 42, rate: 21, smallN: false });
    expect(d.timeToReply).toEqual({ hours: 6.5, n: 9 });
    expect(d.waiting).toBe(6);
    expect(d.showByHour).toBe(true);
  });

  it("says not enough yet for a median of fewer than three, and reads small shares as counts", () => {
    const d = adaptOutreach({ ...emails, reply: rat(1, 4, null), timeToReply: { medianHours: 3, n: 2 } });
    expect(d.timeToReply.hours).toBeNull();
    expect(d.reply).toMatchObject({ n: 1, of: 4, rate: null, smallN: true });
  });

  it("still reads the old server's answer, which has none of the new fields", () => {
    const old = { days: 30, timeZone: "UTC", totals: emails.totals, byCampaign: [], byTouch: [], byHour: [], stalls: emails.stalls };
    const d = adaptOutreach(old);
    expect(d.reply).toMatchObject({ n: 9, of: 42, smallN: false });
    expect(d.reply.rate).toBeCloseTo(21.43, 1);
    expect(d.waiting).toBe(6);
    expect(d.showByHour).toBe(true);
  });

  it("is drawn", () => {
    const html = renderToStaticMarkup(<OutreachBody emails={adaptOutreach(emails)} calls={null} filters={f} />);
    expect(html).toContain("Backend");
    expect(html).toContain('<td class="is-r">25%</td>');
  });

  it("reads calls: the share of connected, the outcomes, and a row for calls with no campaign", () => {
    const d = adaptCalls({
      ...envelope(),
      totals: { placed: 18, connected: 11, rate: 0.61, small: false, talkSeconds: 3120, avgSeconds: 284 },
      outcomes: [
        { outcome: "connected", n: 11 }, { outcome: "voicemail", n: 3 }, { outcome: "no_answer", n: 3 },
        { outcome: "call_back", n: 1 }, { outcome: "not_interested", n: 0 },
      ],
      byCampaign: [
        { campaignId: "camp-1", name: "Backend", placed: 9, connected: 6, talkSeconds: 1700 },
        { campaignId: null, name: "No campaign", placed: 2, connected: 1, talkSeconds: 90 },
      ],
      daily: [{ day: "2026-10-13", placed: 2, connected: 1 }],
    });
    expect(d.totals.connect).toEqual({ n: 11, of: 18, rate: 61, smallN: false });
    expect(d.totals.avgSeconds).toBe(284);
    expect(d.byCampaign[1]).toMatchObject({ campaignId: null, name: "No campaign" });
    const html = renderToStaticMarkup(<OutreachBody emails={adaptOutreach(emails)} calls={d} filters={f} />);
    expect(html).toContain("No campaign");
  });

  it("reads no calls placed as nothing, with no average", () => {
    const d = adaptCalls({ ...envelope(), totals: { placed: 0, connected: 0, rate: null, small: true, talkSeconds: 0, avgSeconds: null }, outcomes: [], byCampaign: [], daily: [] });
    expect(d.totals.avgSeconds).toBeNull();
    expect(d.totals.connect.rate).toBeNull();
  });
});

describe("Pipeline from the API", () => {
  const wire = {
    ...envelope(),
    thresholds: { shortlisted: 7, outreach: 7, interviewing: 14 },
    stages: [
      { id: "shortlisted", stage: "shortlisted", step: null, label: "Shortlisted", n: 22, waiting: 4 },
      { id: "outreach_waiting", stage: "outreach", step: "waiting", label: "Waiting for a reply", n: 15, waiting: 6 },
    ],
    totals: { inProgress: 50, waiting: 12, hired: 9, passed: 31 },
    waitingLongest: [waitingWire],
    velocity: [
      { stage: "shortlisted", medianDays: 2.1, n: 30, prevMedianDays: 2.8 },
      { stage: "outreach", medianDays: null, n: 2, prevMedianDays: null },
    ],
    timeToHire: { medianDays: 21, n: 7 },
    timeToFirstContact: { medianDays: 1.5, n: 24 },
    conversion: [{ id: "replied", label: "Replied", ...rat(12, 30, 0.4) }],
    weakestStep: "interviewing",
    offers: { made: 4, accepted: 3, notTaken: 1, acceptance: rat(3, 4, null) },
    sources: [{ source: "agent", label: "Found by the agent", added: 40, interviewed: 9, hired: 3 }],
    forms: { views: 120, applications: 18, added: 11, passed: 4, conversion: rat(18, 120, 0.15) },
    passed: null,
  };

  it("reads medians with their counts, the earlier median, and small shares as counts", () => {
    const d = adaptPipeline(wire);
    expect(d.velocity[0]).toEqual({ stage: "shortlisted", median: { days: 2.1, n: 30 }, prev: { days: 2.8, n: 3 } });
    expect(d.velocity[1]?.median.days).toBeNull();
    expect(d.timeToHire).toEqual({ days: 21, n: 7 });
    expect(d.conversion[0]).toMatchObject({ id: "replied", rate: 40 });
    expect(d.offers.acceptance).toEqual({ n: 3, of: 4, rate: null, smallN: true });
    expect(d.forms.conversion.rate).toBe(15);
    expect(d.passed).toBeNull();
    expect(d.weakestStep).toBe("interviewing");
  });

  it("is drawn, and hides the reasons block until there is a list", () => {
    const html = renderToStaticMarkup(<PipelineBody data={adaptPipeline(wire)} filters={f} />);
    expect(html).toContain("Asha Verma");
    expect(html).not.toContain("Why people were passed");
  });
});

describe("who looks after a person who has waited", () => {
  const w = (over: Record<string, unknown>) => adaptPipeline({ waitingLongest: [{ ...waitingWire, ...over }] }).waitingLongest[0]!;

  it("names people to an owner or admin, and says Not assigned for nobody", () => {
    expect(lookedAfterBy(w({ ownerName: "Meera Nair", mine: false }), true)).toBe("Meera Nair");
    expect(lookedAfterBy(w({ ownerName: null, mine: false }), true)).toBe("Not assigned");
  });

  it("never gives a recruiter a peer's name, or a made-up 'Not assigned' for a peer's person", () => {
    expect(lookedAfterBy(w({ ownerName: "Aarav Shah", mine: true }), false)).toBe("You");
    expect(lookedAfterBy(w({ ownerName: null, mine: false }), false)).toBeNull();
    const csv = waitingTable([w({ ownerName: null, mine: false })], false).rows[0];
    expect(csv?.[4]).toBe("");
  });
});

describe("Campaigns from the API", () => {
  const wire = {
    ...envelope(),
    quietAfterDays: 7,
    campaigns: [{
      campaignId: "camp-1", name: "Backend", status: "active", clientId: "cl-1", client: "Zeta Works",
      ownerId: "u-2", ownerName: "Meera Nair", target: 5,
      openedAt: "2026-09-01T04:00:00.000Z", closedAt: null, firstHireAt: null, lastActivityAt: "2026-10-12T09:00:00.000Z",
      found: 40, shortlisted: 22, contacted: 15, replied: 6, interviewed: 4, hired: 2,
      progress: { hired: 2, target: 5, share: 0.4 },
      daysOpen: 42, daysToFirstHire: 18, daysToFill: null, quiet: false, quietDays: null, activeInPeriod: true,
    }],
    clients: [{
      clientId: "cl-1", name: "Zeta Works", campaigns: 3, active: 2, hired: 4, planned: 9,
      medianDaysToFirstHire: 17, medianDaysToFirstHireN: 3, replied: rat(9, 31, 0.29),
    }],
  };

  it("keeps each campaign and rolls clients up with a median and a share", () => {
    const d = adaptCampaigns(wire);
    expect(d.campaigns[0]).toMatchObject({ name: "Backend", client: "Zeta Works", ownerName: "Meera Nair", progress: { share: 0.4 }, daysToFill: null });
    expect(d.clients[0]).toMatchObject({ name: "Zeta Works", medianDaysToFirstHire: { days: 17, n: 3 }, replied: { n: 9, of: 31, rate: 29 } });
    expect(adaptCampaigns({ ...wire, clients: [{ ...wire.clients[0], medianDaysToFirstHire: null, medianDaysToFirstHireN: 1 }] }).clients[0]?.medianDaysToFirstHire.days).toBeNull();
  });

  it("caps progress at full when there are more hires than planned", () => {
    const over = { ...wire, campaigns: [{ ...wire.campaigns[0], hired: 7, progress: { hired: 7, target: 5, share: 1.4 } }] };
    expect(adaptCampaigns(over).campaigns[0]?.progress.share).toBe(1);
  });

  it("is drawn", () => {
    const html = renderToStaticMarkup(
      <CampaignsBody data={adaptCampaigns(wire)} filters={f} state="active" setState={() => {}} />,
    );
    expect(html).toContain("Backend");
    expect(html).toContain("Zeta Works");
  });
});

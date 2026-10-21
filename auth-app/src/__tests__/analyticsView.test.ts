import { describe, expect, it } from "vitest";
import { toCSV } from "../exportTable";
import { campaignsFixture, overviewFixture, pipelineFixture, recruitersFixture } from "../analyticsFixtures";
import { DEFAULT_FILTERS } from "../analyticsFilters";
import type { OverviewAnalytics } from "../api/analytics";
import {
  campaignKpis,
  callsByCampaignTable,
  campaignsTable,
  changeLine,
  clientsTable,
  csvName,
  daysToFillText,
  emailsByCampaignTable,
  emptyCopy,
  funnelRows,
  isIdle,
  leakLine,
  medianDays,
  mineTiles,
  biggestDrop,
  stepRate,
  outcomeBars,
  peopleTable,
  ratioDetail,
  ratioText,
  replyTime,
  sortPeople,
  sourcesTable,
  talkTime,
  toRatio,
  totalOf,
  typicalLine,
  waitingTable,
} from "../analyticsView";

const f = DEFAULT_FILTERS;

describe("a share of fewer than 5 is a count, never a percentage", () => {
  it("builds the ratio the way the API does", () => {
    expect(toRatio(1, 4)).toEqual({ n: 1, of: 4, rate: null, smallN: true });
    expect(toRatio(2, 5)).toEqual({ n: 2, of: 5, rate: 40, smallN: false });
    expect(toRatio(0, 0)).toEqual({ n: 0, of: 0, rate: null, smallN: true });
  });

  it("says 1 of 4, not 25%", () => {
    expect(ratioText(toRatio(1, 4))).toBe("1 of 4");
    expect(ratioText(toRatio(9, 42))).toBe("21%");
    expect(ratioText(toRatio(0, 0))).toBe("–");
    expect(ratioText(null)).toBe("–");
  });

  it("holds even when a share arrives with a rate attached but too few behind it", () => {
    expect(ratioText({ n: 1, of: 4, rate: 25, smallN: false })).toBe("1 of 4");
    expect(ratioText({ n: 3, of: 4, rate: 75, smallN: true })).toBe("3 of 4");
    // never above 100
    expect(ratioText({ n: 9, of: 6, rate: 150, smallN: false })).toBe("100%");
  });

  it("adds the counts beside a percentage, and nothing beside a count", () => {
    expect(ratioDetail(toRatio(9, 42))).toBe("9 of 42");
    expect(ratioDetail(toRatio(1, 4))).toBe("");
  });

  it("reads a median of fewer than 3 values as not enough yet", () => {
    expect(medianDays({ days: 6.5, n: 12 })).toBe("6.5 days");
    expect(medianDays({ days: 1, n: 3 })).toBe("1 day");
    expect(medianDays({ days: 4, n: 2 })).toBe("Not enough yet");
    expect(medianDays({ days: null, n: 0 })).toBe("Not enough yet");
    expect(replyTime({ hours: 19, n: 9 })).toBe("19 hours");
    expect(replyTime({ hours: 72, n: 9 })).toBe("3 days");
    expect(replyTime({ hours: 3, n: 1 })).toBe("Not enough yet");
  });
});

describe("words for numbers", () => {
  it("compares with the period before in a sentence", () => {
    expect(changeLine(14, 2, { days: 30 })).toBe("12 more than the 30 days before");
    expect(changeLine(3, 9, { days: 7 })).toBe("6 fewer than the 7 days before");
    expect(changeLine(4, 4, { days: 90 })).toBe("Same as the 90 days before");
    expect(changeLine(4, 1, { kind: "custom", from: "2026-09-01", to: "2026-09-30" })).toBe("3 more than the 30 days before");
  });

  it("says talk time the way a person would", () => {
    expect(talkTime(0)).toBe("–");
    expect(talkTime(40)).toBe("1 min");
    expect(talkTime(3120)).toBe("52 min");
    expect(talkTime(8100)).toBe("2 h 15 min");
  });
});

describe("empty states are calm and say what to do", () => {
  const pages = ["overview", "recruiters", "outreach", "pipeline", "campaigns"] as const;
  const reasons = ["no_campaigns", "no_activity", null] as const;

  it("never says No data, never apologises, and always has a sentence", () => {
    for (const page of pages) {
      for (const reason of reasons) {
        for (const mine of [true, false]) {
          const c = emptyCopy(page, reason, { days: 30, mine });
          const all = `${c.head} ${c.text}`;
          expect(all, `${page}/${reason}`).not.toMatch(/no data|sorry|oops|error|failed|empty/i);
          expect(c.head.length).toBeGreaterThan(3);
          expect(c.text.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("uses the spec's own sentences", () => {
    expect(emptyCopy("overview", "no_campaigns", { days: 30 }).text).toBe("Start a campaign and this page fills in as people move through it.");
    expect(emptyCopy("overview", "no_campaigns", { days: 30 }).action?.label).toBe("Start a campaign");
    expect(emptyCopy("overview", "no_activity", { days: 30 }).head).toBe("A quiet stretch");
    expect(emptyCopy("overview", "no_activity", { days: 30 }).text).toContain("Nothing moved in the last 30 days.");
    expect(emptyCopy("recruiters", "no_campaigns", { days: 30, mine: false }).head).toBe("It's just you so far");
    expect(emptyCopy("recruiters", "no_activity", { days: 30, mine: true }).text).toBe("Send an email, place a call or move someone forward and your week shows up here.");
    expect(emptyCopy("outreach", "no_activity", { days: 30 }).head).toBe("No emails sent in the last 30 days");
    expect(emptyCopy("pipeline", "no_campaigns", { days: 30 }).head).toBe("No one is in a pipeline yet");
    expect(emptyCopy("campaigns", "no_campaigns", { days: 30 }).head).toBe("No campaigns yet");
  });
});

describe("the funnel", () => {
  /** The live workspace that showed 24% beside 591 and 223: the API's rates count other populations on purpose. */
  const LIVE_LIKE: OverviewAnalytics["funnel"] = {
    cohort: { from: "2026-09-14", to: "2026-10-13" },
    steps: [
      { id: "found", label: "Found", n: 591 },
      { id: "shortlisted", label: "On the shortlist", n: 223 },
      { id: "contacted", label: "Contacted", n: 103 },
      { id: "replied", label: "Replied", n: 37 },
      { id: "interviewing", label: "Interviewing", n: 23 },
      { id: "hired", label: "Hired", n: 4 },
    ],
    rates: [
      { id: "kept", label: "Kept after search", ...toRatio(140, 591) },
      { id: "reachedOut", label: "Reached out to", ...toRatio(103, 223) },
      { id: "replied", label: "Replied", ...toRatio(37, 103) },
      { id: "interviewing", label: "Moved to interview", ...toRatio(20, 103) },
      { id: "hired", label: "Hired", ...toRatio(4, 23) },
    ],
  };

  it("gives each step its level, and the share of the step before that reached it", () => {
    const rows = funnelRows(overviewFixture(f).funnel);
    expect(rows.map((r) => r.label)).toEqual(["Found", "Shortlisted (ever)", "Contacted", "Replied", "Interviewing", "Hired"]);
    expect(rows[0]!.share).toBe(1);
    expect(rows[5]!.share).toBeCloseTo(3 / 80);
    expect(rows[0]!.fromPrev).toBeNull();
    expect(stepRate(rows[0]!)).toBe("–");
    expect(stepRate(rows[1]!)).toBe("51%"); // 41 of 80
  });

  it("prints, under every step, this count over the one before it: the two numbers the page shows", () => {
    const rows = funnelRows(LIVE_LIKE);
    expect(rows.map((r) => stepRate(r))).toEqual(["–", "38%", "46%", "36%", "62%", "17%"]);
    // the two the owner's screenshot got wrong: 223 of 591 is 38 (not 24), 23 of 37 is 62 (not 19)
    expect(stepRate(rows[1]!)).not.toBe("24%");
    expect(stepRate(rows[4]!)).not.toBe("19%");
  });

  it("agrees with its own counts for any funnel: a printed percent is round(next / previous * 100)", () => {
    const shapes = [
      [591, 223, 103, 37, 23, 4],
      [80, 41, 30, 12, 7, 3],
      [10, 9, 9, 1, 1, 0],
      [5, 5, 5, 5, 5, 5],
      [1200, 960, 17, 16, 3, 2],
      [0, 0, 0, 0, 0, 0],
      [100, 40, 60, 10, 12, 2], // a step that is bigger than the one before it: never above 100%
    ];
    const ids = ["found", "shortlisted", "contacted", "replied", "interviewing", "hired"];
    for (const counts of shapes) {
      const funnel: OverviewAnalytics["funnel"] = {
        cohort: { from: "", to: "" },
        steps: counts.map((n, i) => ({ id: ids[i]!, label: ids[i]!, n })),
        rates: [],
      };
      const rows = funnelRows(funnel);
      for (let i = 1; i < rows.length; i += 1) {
        const prev = counts[i - 1]!;
        const n = Math.min(counts[i]!, prev);
        const printed = stepRate(rows[i]!);
        if (prev === 0) expect(printed, `${counts} @${i}`).toBe("–");
        else if (prev < 5) expect(printed, `${counts} @${i}`).toBe(`${n} of ${prev}`);
        else expect(printed, `${counts} @${i}`).toBe(`${Math.round((n / prev) * 100)}%`);
      }
    }
  });

  it("keeps the API's own rate for the tooltip only where it counts a different population, with its definition", () => {
    const rows = funnelRows(LIVE_LIKE);
    // contacted: 103 of 223 either way, so there is nothing to explain
    expect(rows[2]!.cohort).toBeNull();
    // shortlisted: 140 of 591 were found AND kept; 223 includes people added another way
    expect(rows[1]!.cohort?.ratio).toMatchObject({ n: 140, of: 591 });
    expect(rows[1]!.cohort?.text).toContain("140 of 591");
    expect(rows[1]!.cohort?.text).toContain("added another way");
    // interviewing: 20 of the 103 contacted
    expect(rows[4]!.cohort?.ratio).toMatchObject({ n: 20, of: 103 });
    expect(rows[4]!.cohort?.text).toContain("contacted");
  });

  it("says a small step as a count, and names the biggest drop among steps with 5 or more behind them", () => {
    const o = overviewFixture(f);
    o.funnel.steps = o.funnel.steps.map((s) => (s.id === "hired" ? { ...s, n: 3 } : s.id === "interviewing" ? { ...s, n: 4 } : s));
    const rows = funnelRows(o.funnel);
    expect(stepRate(rows[5]!)).toBe("3 of 4");
    expect(biggestDrop(funnelRows(LIVE_LIKE))).toBe("Biggest drop: interviewing to hired.");
    expect(biggestDrop(funnelRows({ ...LIVE_LIKE, steps: LIVE_LIKE.steps.map((s) => ({ ...s, n: 2 })) }))).toBeNull();
  });
});

describe("the people table never ranks", () => {
  const people = recruitersFixture(f, "admin").people!;

  it("sorts by any column, with name as the tie-break so equal rows hold still", () => {
    const byName = sortPeople(people, "name", "asc").map((p) => p.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    const byEmails = sortPeople(people, "emails", "desc");
    expect(byEmails[0]!.emails.sent).toBeGreaterThanOrEqual(byEmails[1]!.emails.sent);
    // A person with nothing sorts to the end of a descending sort, not out of the table.
    expect(byEmails).toHaveLength(people.length);
    const a = sortPeople(people, "hires", "asc");
    const b = sortPeople([...people].reverse(), "hires", "asc");
    expect(a.map((p) => p.userId)).toEqual(b.map((p) => p.userId));
  });

  it("keeps a person with no activity, muted", () => {
    const idle = people.find((p) => isIdle(p));
    expect(idle?.name).toBe("Arjun Rao");
    expect(sortPeople(people, "name", "asc").some((p) => p.name === "Arjun Rao")).toBe(true);
  });

  it("totals what the rows say, so they reconcile", () => {
    const t = totalOf(people);
    expect(t.sent).toBe(people.reduce((n, p) => n + p.emails.sent, 0));
    expect(t.hires).toBe(people.reduce((n, p) => n + p.moves.hires, 0));
  });
});

describe("a recruiter's own tiles", () => {
  const me = recruitersFixture(f, "recruiter");

  it("compares with the period before and shows the nameless team typical when the API sent one", () => {
    const tiles = mineTiles(me.me!, me.typical);
    expect(tiles.map((t) => t.label)).toEqual(["Emails sent", "Replies", "Calls placed", "Talk time", "Moved to interview", "Hires"]);
    const emails = tiles.find((t) => t.id === "emails")!;
    expect(emails.prev).not.toBeNull();
    expect(typicalLine(emails)).toMatch(/^Team typical \d+$/);
  });

  it("shows no team typical when there is none (fewer than 3 others)", () => {
    const tiles = mineTiles(me.me!, null);
    for (const t of tiles) expect(typicalLine(t)).toBeNull();
  });

  it("is never given anyone else's name or id in the typical row", () => {
    expect(me.people).toBeNull();
    expect(me.typical).not.toBeNull();
    expect(me.typical).not.toHaveProperty("name");
    expect(me.typical).not.toHaveProperty("userId");
  });
});

describe("pipeline and campaign wording", () => {
  it("names the weakest step in words, and not when it is a small count", () => {
    const p = pipelineFixture(f);
    expect(leakLine(p)).toContain("replied");
    expect(leakLine({ ...p, weakestStep: null })).toBeNull();
    const small = { ...p, conversion: p.conversion.map((c) => (c.id === "replied" ? { ...c, ...toRatio(1, 4) } : c)) };
    expect(leakLine(small)).toBeNull();
  });

  it("lists the five call outcomes in a steady order", () => {
    expect(outcomeBars([{ outcome: "voicemail", n: 3 }, { outcome: "connected", n: 11 }]).map((o) => o.label)).toEqual([
      "Connected", "Voicemail", "No answer", "Call back", "Not interested",
    ]);
  });

  it("says days to fill, or that it is not filled yet", () => {
    const rows = campaignsFixture(f, "all").campaigns;
    expect(daysToFillText(rows.find((c) => c.campaignId === "c4")!)).toBe("44 days");
    expect(daysToFillText(rows.find((c) => c.campaignId === "c1")!)).toBe("Not filled yet");
  });
});

describe("CSV from the rows on the page", () => {
  it("is the people table, with a count where a share is small and no formula that a spreadsheet would run", () => {
    const people = recruitersFixture(f, "admin").people!.slice(0, 2);
    people[0] = { ...people[0]!, name: "=HYPERLINK(\"http://x\")", emails: { sent: 4, replied: 1, reply: toRatio(1, 4) } };
    const csv = toCSV(peopleTable(people));
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Person,Emails sent,Replies,Reply rate,Calls placed,Connected,Talk time (minutes),Added to shortlists,Moved to interview,Hires,Tasks due,Done on time,Overdue now,In progress,Waiting too long,Campaigns");
    // The leading = is guarded, and the quotes inside are doubled.
    expect(lines[1]).toMatch(/^"'=HYPERLINK\(""http:\/\/x""\)",4,1,1 of 4,/);
    expect(lines).toHaveLength(4); // header, two rows, trailing newline
  });

  it("carries the by-campaign, waiting, sources and client tables", () => {
    expect(emailsByCampaignTable([{ campaignId: "c", name: "Backend", drafted: 3, sent: 4, replied: 1, awaiting: 2, replyRate: 0.25 }]).rows[0])
      .toEqual(["Backend", 4, 1, "1 of 4", 2]);
    expect(callsByCampaignTable([{ campaignId: null, name: "No campaign", placed: 10, connected: 5, talkSeconds: 600 }]).rows[0])
      .toEqual(["No campaign", 10, 5, "50%", 10]);
    const p = pipelineFixture(f);
    expect(waitingTable(p.waitingLongest).rows[0]![0]).toBe("Asha Verma");
    expect(sourcesTable(p.sources).headers).toEqual(["Source", "Added", "Moved to interview", "Hired"]);
    const c = campaignsFixture(f, "all");
    expect(campaignsTable(c.campaigns).rows).toHaveLength(4);
    expect(clientsTable(c.clients).rows[0]![0]).toBe("Razorpay");
  });

  it("names the file by page and period", () => {
    expect(csvName("Recruiters", f)).toBe("recruiters-last-30-days.csv");
    expect(csvName("Pipeline: waiting", { period: { kind: "custom", from: "2026-09-01", to: "2026-09-30" } })).toBe("pipeline-waiting-2026-09-01-to-2026-09-30.csv");
  });
});

describe("the Campaigns figures follow the tab", () => {
  const rows = [
    { status: "active" as const, target: 3, hired: 1, quiet: true },
    { status: "active" as const, target: 2, hired: 0, quiet: false },
    { status: "closed" as const, target: 2, hired: 2, quiet: false },
  ];
  it("counts a closed campaign under Closed (2 of 2 hired), never under Active", () => {
    expect(campaignKpis(rows, "active")).toMatchObject({ first: "Active campaigns", count: 2, planned: 5, hired: 1, quiet: 1 });
    expect(campaignKpis(rows, "closed")).toMatchObject({ first: "Closed campaigns", count: 1, planned: 2, hired: 2, filled: 1, quiet: 0 });
    expect(campaignKpis(rows, "all")).toMatchObject({ first: "Campaigns", count: 3, planned: 7, hired: 3 });
  });
});

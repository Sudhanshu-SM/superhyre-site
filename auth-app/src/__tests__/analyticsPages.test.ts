import { describe, expect, it } from "vitest";
import {
  firstHireLabel,
  hourLabel,
  lastActivityLabel,
  meterOf,
  openLabel,
  OUTREACH_FIXTURE,
  percent,
  PROJECTS_FIXTURE,
  progressOf,
  replyTimeLabel,
  sendingHours,
  seriesOf,
  stallLines,
  USAGE_FIXTURE,
  usageTotals,
} from "../analytics";

const project = (over: Partial<(typeof PROJECTS_FIXTURE)["campaigns"][number]> = {}) => ({
  ...PROJECTS_FIXTURE.campaigns[0]!,
  ...over,
});

describe("outreach numbers", () => {
  it("never shows a rate above 100%, and none at all with nothing to divide by", () => {
    expect(percent(17 / 58)).toBe("29%");
    expect(percent(1.4)).toBe("100%");
    expect(percent(null)).toBeNull();
  });

  it("says reply times the way a person would", () => {
    expect(replyTimeLabel(null)).toBeNull();
    expect(replyTimeLabel(0.4)).toBe("under an hour");
    expect(replyTimeLabel(1)).toBe("1 hour");
    expect(replyTimeLabel(19)).toBe("19 hours");
    expect(replyTimeLabel(72)).toBe("3 days");
  });

  it("names what is stuck, and nothing when nothing is", () => {
    expect(stallLines({ draftsWaiting: 0, unlogged: 0 })).toEqual([]);
    expect(stallLines({ draftsWaiting: 1, unlogged: 3 })).toEqual([
      "1 draft has waited more than 2 days to be approved.",
      "3 sent emails have had nothing logged for 4 days or more.",
    ]);
  });

  it("lists only hours that had sends, with readable labels", () => {
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(9)).toBe("9 am");
    expect(hourLabel(15)).toBe("3 pm");
    const hours = sendingHours(OUTREACH_FIXTURE.byHour);
    expect(hours.map((h) => h.label)).toEqual(["9 am", "11 am", "3 pm", "6 pm"]);
    expect(hours[0]?.rate).toBeCloseTo(8 / 21);
  });
});

describe("usage numbers", () => {
  it("shows each limit as used of total, and warns only when it's nearly gone", () => {
    expect(meterOf({ id: "m", label: "Agent messages", used: 142, limit: 800 })).toMatchObject({
      text: "142 of 800",
      share: 142 / 800,
      note: null,
    });
    expect(meterOf({ id: "p", label: "Profiles", used: 330, limit: 400 }).note).toBe("70 left today");
    expect(meterOf({ id: "s", label: "Searches", used: 150, limit: 150 }).note).toBe("Used up for today");
    expect(meterOf({ id: "s", label: "Searches", used: 170, limit: 150 }).share).toBe(1);
  });

  it("totals and charts each kind of use over the period", () => {
    const daily = [
      { day: "2026-10-01", messages: 3, searches: 1, specs: 0, profiles: 20, exports: 1 },
      { day: "2026-10-02", messages: 5, searches: 2, specs: 1, profiles: 0, exports: 0 },
    ];
    expect(usageTotals(daily)).toEqual({ messages: 8, searches: 3, specs: 1, profiles: 20, exports: 1 });
    expect(seriesOf(daily, "messages")).toEqual([
      { day: "2026-10-01", n: 3 },
      { day: "2026-10-02", n: 5 },
    ]);
    expect(USAGE_FIXTURE.daily).toHaveLength(30);
  });
});

describe("project numbers", () => {
  it("reads progress left to right", () => {
    expect(progressOf(project()).map((s) => [s.label, s.n])).toEqual([
      ["Found", 412],
      ["Added", 38],
      ["Contacted", 29],
      ["Replied", 10],
      ["Interviewed", 6],
      ["Hired", 1],
    ]);
  });

  it("says how long a campaign has run and when it first hired", () => {
    expect(openLabel(project({ daysOpen: 0, openedAt: new Date().toISOString() }))).toBe("Opened today");
    expect(openLabel(project({ daysOpen: 1 }))).toBe("Open 1 day");
    expect(openLabel(project({ status: "closed", daysOpen: 30 }))).toBe("Ran 30 days");
    expect(firstHireLabel(project({ daysToFirstHire: 28 }))).toBe("First hire in 28 days");
    expect(firstHireLabel(project({ daysToFirstHire: 0 }))).toBe("First hire the day it opened");
    expect(firstHireLabel(project({ daysToFirstHire: null }))).toBeNull();
  });

  it("counts calendar days, so something 21 hours ago late yesterday is not 'today'", () => {
    const now = new Date(2026, 9, 5, 14, 0).getTime();
    const lateYesterday = new Date(2026, 9, 4, 17, 0).toISOString();
    const earlierToday = new Date(2026, 9, 5, 9, 0).toISOString();
    expect(openLabel(project({ daysOpen: 0, openedAt: lateYesterday }), now)).toBe("Opened yesterday");
    expect(openLabel(project({ daysOpen: 0, openedAt: earlierToday }), now)).toBe("Opened today");
    expect(lastActivityLabel(project({ quiet: false, lastActivityAt: lateYesterday }), 7, now)).toBe("Active yesterday");
  });

  it("calls out a quiet campaign plainly, and a busy one by when it moved", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(lastActivityLabel(project({ quiet: false, lastActivityAt: "2026-10-20T08:00:00Z" }), 7, now)).toBe(
      "Active today",
    );
    expect(lastActivityLabel(project({ quiet: false, lastActivityAt: "2026-10-19T08:00:00Z" }), 7, now)).toBe(
      "Active yesterday",
    );
    expect(lastActivityLabel(project({ quiet: true, lastActivityAt: "2026-10-09T08:00:00Z" }), 7, now)).toBe(
      "Quiet for 11 days",
    );
    expect(lastActivityLabel(project({ quiet: true, lastActivityAt: null, daysOpen: 9 }), 7, now)).toBe(
      "Nothing yet in 9 days",
    );
  });
});

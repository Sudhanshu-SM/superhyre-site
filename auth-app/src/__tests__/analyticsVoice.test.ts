import { describe, expect, it } from "vitest";
import { callsFixture, outreachFixture } from "../analyticsFixtures";
import { DEFAULT_FILTERS } from "../analyticsFilters";
import {
  againstBefore,
  bestEmailHour,
  channelCounts,
  hubOf,
  outcomesInOrder,
  parseChannel,
  shareValue,
  summaryLine,
  toRatio,
} from "../analyticsView";
import { nextSort, shapeRows } from "../analyticsKit";

describe("the one line under a page's title is plain and factual", () => {
  it("says the period, what it is about, and the figures, with no personality", () => {
    expect(summaryLine({ kind: "days", days: 30 }, "all campaigns", ["5 hires", "46 replies", "30 moved to interview"])).toBe(
      "30 days, all campaigns. 5 hires, 46 replies, 30 moved to interview.",
    );
    expect(summaryLine({ kind: "custom", from: "2026-09-14", to: "2026-10-13" }, "Staff Platform Engineer", ["146 emails"])).toBe(
      "14 Sep to 13 Oct, Staff Platform Engineer. 146 emails.",
    );
  });

  it("is only the period and the scope when there are no figures yet", () => {
    expect(summaryLine({ kind: "days", days: 7 }, "all campaigns", [])).toBe("7 days, all campaigns.");
    expect(summaryLine({ kind: "days", days: 7 }, "all campaigns", ["", ""])).toBe("7 days, all campaigns.");
  });

  it("never cheers: no exclamation, no 'on a roll'", () => {
    const line = summaryLine({ kind: "days", days: 30 }, "all campaigns", ["12 moved to interview", "2 hires"]);
    expect(line).not.toMatch(/!|roll|great|well done|along the way/i);
  });

  it("says how a figure moved in a few plain words", () => {
    expect(againstBefore(5, 1)).toBe("4 more than before");
    expect(againstBefore(1, 5)).toBe("4 fewer than before");
    expect(againstBefore(3, 3)).toBe("Same as before");
  });
});

describe("a table that sorts, and a list in a window: search and sort", () => {
  const rows = [
    { name: "Meera Pillai", n: 12 },
    { name: "Anand Sethi", n: 6 },
    { name: "Fn3 Owner", n: 7 },
    { name: "Mira Rao", n: 12 },
  ];
  type Row = (typeof rows)[number];
  const cols = [
    { id: "name", sort: (r: Row) => r.name.toLowerCase() },
    { id: "n", right: true, sort: (r: Row) => r.n },
  ];
  const text = (r: Row) => r.name;

  it("keeps every row when nothing is typed, in the order it came", () => {
    expect(shapeRows(rows, cols, "  ", null, text).map((r) => r.name)).toEqual(rows.map((r) => r.name));
  });

  it("searches case-insensitively, anywhere in the words", () => {
    expect(shapeRows(rows, cols, "MI", null, text).map((r) => r.name)).toEqual(["Mira Rao"]);
    expect(shapeRows(rows, cols, "e", null, text).map((r) => r.name)).toEqual(["Meera Pillai", "Anand Sethi", "Fn3 Owner"]);
    expect(shapeRows(rows, cols, "zzz", null, text)).toEqual([]);
  });

  it("sorts numbers as numbers and words as words, both ways", () => {
    expect(shapeRows(rows, cols, "", { col: "n", dir: "desc" }, text).map((r) => r.n)).toEqual([12, 12, 7, 6]);
    expect(shapeRows(rows, cols, "", { col: "n", dir: "asc" }, text).map((r) => r.n)).toEqual([6, 7, 12, 12]);
    expect(shapeRows(rows, cols, "", { col: "name", dir: "asc" }, text).map((r) => r.name)).toEqual(["Anand Sethi", "Fn3 Owner", "Meera Pillai", "Mira Rao"]);
  });

  it("never changes the list it was given", () => {
    const before = rows.map((r) => r.name);
    shapeRows(rows, cols, "", { col: "name", dir: "desc" }, text);
    expect(rows.map((r) => r.name)).toEqual(before);
  });

  it("starts a column the way it reads best and flips on the second press", () => {
    expect(nextSort(cols, null, "name")).toEqual({ col: "name", dir: "asc" });
    expect(nextSort(cols, null, "n")).toEqual({ col: "n", dir: "desc" });
    expect(nextSort(cols, { col: "n", dir: "desc" }, "n")).toEqual({ col: "n", dir: "asc" });
    expect(nextSort(cols, { col: "n", dir: "asc" }, "name")).toEqual({ col: "name", dir: "asc" });
  });
});

describe("Outreach by channel", () => {
  const f = DEFAULT_FILTERS;

  it("reads the channel from the address, and anything else is All", () => {
    expect(parseChannel("calls")).toBe("calls");
    expect(parseChannel("whatsapp")).toBe("whatsapp");
    expect(parseChannel("telegram")).toBe("all");
    expect(parseChannel(null)).toBe("all");
  });

  it("puts the two older answers together: touches are emails and calls, answered is replies and connected calls", () => {
    const e = { ...outreachFixture(f), hub: null };
    const hub = hubOf(e, callsFixture(f));
    expect(hub.fromServer).toBe(false);
    expect(hub.all).toMatchObject({ sent: 58 + 18, answered: 17 + 11 });
    expect(hub.all.answer).toMatchObject({ n: 28, of: 76, smallN: false });
    expect(hub.channels.whatsapp).toMatchObject({ connected: false, sent: 0, replied: 0 });
    // a row for each campaign either channel touched, and one for calls placed outside any
    const names = hub.campaigns.map((c) => c.name);
    expect(names).toContain("No campaign");
    expect(hub.campaigns.reduce((n, c) => n + c.email.sent, 0)).toBe(58);
    expect(hub.campaigns.reduce((n, c) => n + c.calls.placed, 0)).toBe(18);
    expect(hub.campaigns.every((c) => c.sent === c.email.sent + c.calls.placed)).toBe(true);
    // the period before is not known from them, and no list of people can be made
    expect(hub.channels.email.previous).toEqual({ sent: 0, replied: 0 });
    expect(hub.byPerson).toBeNull();
  });

  it("uses the server's own channels when it sends them, and shows people only to an owner or admin", () => {
    const admin = outreachFixture(f, "admin");
    expect(hubOf(admin, null)).toBe(admin.hub);
    expect(admin.hub?.fromServer).toBe(true);
    expect(admin.hub?.byPerson?.length).toBeGreaterThan(0);
    expect(outreachFixture(f, "recruiter").hub?.byPerson).toBeNull();
  });

  it("counts touches on each tab, and none for a channel that is not connected", () => {
    const hub = hubOf(outreachFixture(f), null);
    expect(channelCounts(hub)).toEqual({ all: 76, email: 58, calls: 18, whatsapp: null });
  });

  it("orders how calls ended the way they read, with a missing outcome at zero", () => {
    const rows = outcomesInOrder([{ outcome: "voicemail", n: 3 }, { outcome: "connected", n: 12 }]);
    expect(rows.map((r) => [r.label, r.n])).toEqual([
      ["Connected", 12], ["Call back", 0], ["No answer", 0], ["Voicemail", 3], ["Not interested", 0],
    ]);
  });

  it("draws a share as a bar and says the best hour only from five sent", () => {
    expect(shareValue(toRatio(17, 58))).toBe(29);
    expect(shareValue(toRatio(0, 0))).toBe(0);
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, replied: 0 }));
    expect(bestEmailHour(hours)).toBeNull();
    hours[9] = { hour: 9, sent: 4, replied: 4 }; // under five: not a best hour
    expect(bestEmailHour(hours)).toBeNull();
    hours[10] = { hour: 10, sent: 10, replied: 3 };
    hours[15] = { hour: 15, sent: 8, replied: 5 };
    expect(bestEmailHour(hours)).toMatchObject({ hour: 15, n: 8, answered: 5 });
  });
});

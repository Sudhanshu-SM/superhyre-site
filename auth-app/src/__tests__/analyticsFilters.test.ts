import { describe, expect, it } from "vitest";
import {
  clampRange,
  DEFAULT_FILTERS,
  filtersKey,
  filtersToHashQuery,
  filtersToParams,
  inclusiveDays,
  pathOfHash,
  periodDays,
  periodLabel,
  parseFilters,
  queryOfHash,
  readRemembered,
  remember,
  storageKey,
  type Filters,
} from "../analyticsFilters";

const TODAY = new Date(2026, 9, 13, 15, 0); // 13 Oct 2026, afternoon, local time

const owner = { canPickPerson: true, selfId: "u-owner", today: TODAY };
const recruiter = { canPickPerson: false, selfId: "u-me", today: TODAY };

describe("the period in the address", () => {
  it("is 30 days when the address says nothing, or says something unreadable", () => {
    expect(parseFilters("", owner).period).toEqual({ kind: "days", days: 30 });
    expect(parseFilters("days=abc", owner).period).toEqual({ kind: "days", days: 30 });
    // Only the three presets are periods: a hand-edited 45 is not one.
    expect(parseFilters("days=45", owner).period).toEqual({ kind: "days", days: 30 });
  });

  it("takes 7, 30 and 90, with or without the leading ? or #", () => {
    for (const d of [7, 30, 90]) expect(parseFilters(`days=${d}`, owner).period).toEqual({ kind: "days", days: d });
    expect(parseFilters("?days=90", owner).period).toEqual({ kind: "days", days: 90 });
    expect(parseFilters("#days=7", owner).period).toEqual({ kind: "days", days: 7 });
  });

  it("takes a custom range of up to a year, and turns anything else back to the default", () => {
    expect(parseFilters("from=2026-09-01&to=2026-09-30", owner).period).toEqual({ kind: "custom", from: "2026-09-01", to: "2026-09-30" });
    // 366 days is one too many; the end before the start is nonsense; a day that does not exist is not a day.
    expect(parseFilters("from=2025-10-12&to=2026-10-12", owner).period).toEqual({ kind: "days", days: 30 });
    expect(parseFilters("from=2026-09-30&to=2026-09-01", owner).period).toEqual({ kind: "days", days: 30 });
    expect(parseFilters("from=2026-02-30&to=2026-03-05", owner).period).toEqual({ kind: "days", days: 30 });
    // Exactly a year is allowed.
    expect(parseFilters("from=2025-10-14&to=2026-10-13", owner).period.kind).toBe("custom");
  });

  it("brings an end in the future back to today, and counts both ends", () => {
    expect(clampRange("2026-10-01", "2026-12-31", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-13" });
    expect(clampRange("2026-10-20", "2026-12-31", TODAY)).toBeNull();
    expect(inclusiveDays("2026-10-01", "2026-10-13")).toBe(13);
    expect(periodDays({ kind: "custom", from: "2026-09-01", to: "2026-09-30" })).toBe(30);
    expect(periodLabel({ kind: "days", days: 90 })).toBe("90 days");
    expect(periodLabel({ kind: "custom", from: "2026-09-01", to: "2026-09-30" })).toBe("1 Sep to 30 Sep");
  });
});

describe("who and what the filters name", () => {
  it("lets an owner or admin name a recruiter, and never lets a recruiter ask for someone else", () => {
    expect(parseFilters("userId=u-dev", owner).userId).toBe("u-dev");
    expect(parseFilters("userId=u-dev", recruiter).userId).toBeNull();
    // A recruiter's own id is the one exception: it means "me", and the server agrees.
    expect(parseFilters("userId=u-me", recruiter).userId).toBe("u-me");
  });

  it("reads the campaign and the client by the API's own names, not `campaign=` (that one opens a campaign)", () => {
    const f = parseFilters("campaignId=c1&clientId=cl1&campaign=zzz", owner);
    expect(f.campaignId).toBe("c1");
    expect(f.clientId).toBe("cl1");
    expect(filtersToHashQuery(f)).not.toMatch(/(^|&)campaign=/);
  });

  it("reads the recruiter's switch to everyone on their campaigns", () => {
    expect(parseFilters("view=campaigns", recruiter).view).toBe("campaigns");
    expect(parseFilters("view=anything", recruiter).view).toBe("mine");
  });
});

describe("filters to the address and to the API", () => {
  it("leaves the defaults out of the address, so a plain page stays a plain address", () => {
    expect(filtersToHashQuery(DEFAULT_FILTERS)).toBe("");
    expect(filtersToHashQuery({ ...DEFAULT_FILTERS, period: { kind: "days", days: 90 } })).toBe("days=90");
  });

  it("round-trips through the address", () => {
    const f: Filters = {
      period: { kind: "custom", from: "2026-09-01", to: "2026-09-30" },
      campaignId: "c1", clientId: "cl1", userId: "u-dev", view: "campaigns",
    };
    expect(parseFilters(filtersToHashQuery(f), owner)).toEqual(f);
  });

  it("asks the API with its own parameter names", () => {
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({ period: "30" });
    expect(filtersToParams({ ...DEFAULT_FILTERS, period: { kind: "days", days: 7 }, campaignId: "c1", clientId: "cl1", userId: "u1" })).toEqual({
      period: "7", campaign: "c1", client: "cl1", recruiter: "u1",
    });
    expect(filtersToParams({ ...DEFAULT_FILTERS, period: { kind: "custom", from: "2026-09-01", to: "2026-09-30" } })).toEqual({
      period: "custom", from: "2026-09-01", to: "2026-09-30",
    });
    expect(filtersToParams({ ...DEFAULT_FILTERS, view: "campaigns" })).toEqual({ period: "30", view: "campaigns" });
  });

  it("has a different key when anything that changes the answer changes", () => {
    const a = filtersKey(DEFAULT_FILTERS);
    expect(filtersKey({ ...DEFAULT_FILTERS, campaignId: "c1" })).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, period: { kind: "days", days: 7 } })).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS })).toBe(a);
  });

  it("splits a hash into its path and its query", () => {
    expect(pathOfHash("#/analytics/pipeline?days=90")).toBe("/analytics/pipeline");
    expect(queryOfHash("#/analytics/pipeline?days=90&campaignId=c1")).toBe("days=90&campaignId=c1");
    expect(queryOfHash("#/analytics")).toBe("");
  });
});

describe("remembered per person", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      m,
      store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) },
    };
  };

  it("keeps each person's own, and nothing at all for the default", () => {
    const { m, store } = memory();
    remember("u1", { ...DEFAULT_FILTERS, period: { kind: "days", days: 90 } }, store);
    remember("u2", { ...DEFAULT_FILTERS, campaignId: "c9" }, store);
    expect(readRemembered("u1", store)).toBe("days=90");
    expect(readRemembered("u2", store)).toBe("campaignId=c9");
    expect(storageKey("u1")).not.toBe(storageKey("u2"));
    // Back to the default clears it instead of storing an empty string.
    remember("u1", DEFAULT_FILTERS, store);
    expect(m.has(storageKey("u1"))).toBe(false);
    expect(readRemembered("u1", store)).toBe("");
  });

  it("lives under the prefix that is swept when a person signs out", () => {
    expect(storageKey("u1").startsWith("sh.")).toBe(true);
  });

  it("never throws when the browser refuses storage", () => {
    const angry = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(() => remember("u1", { ...DEFAULT_FILTERS, campaignId: "c" }, angry)).not.toThrow();
    expect(readRemembered("u1", angry)).toBe("");
  });
});

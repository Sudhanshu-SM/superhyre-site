import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampedOffset, forgetSection, hasDeepLink, loadSection, resetSectionState, saveSection, sectionKey, sectionScope, setSectionScope, take,
} from "../sectionState";

/** A Storage whose entries are its own keys, as a browser's is (the reset sweeps with Object.keys). */
class Fake {
  constructor(initial: Record<string, string>) { Object.assign(this, initial); }
  private get own() { return this as unknown as Record<string, string>; }
  getItem(k: string) { return Object.hasOwn(this, k) ? this.own[k] ?? null : null; }
  setItem(k: string, v: string) { this.own[k] = String(v); }
  removeItem(k: string) { delete this.own[k]; }
}
const fake = (initial: Record<string, string> = {}): Storage => new Fake(initial) as unknown as Storage;
const keys = (s: Storage) => Object.keys(s);

type Calls = { page: number; q: string; filter: "all" | "active" | "closed" };
const parse = (r: Record<string, unknown>): Calls => ({ page: take.int(r.page, 0, 0, 500), q: take.str(r.q), filter: take.oneOf(r.filter, ["all", "active", "closed"] as const, "all") });
const NONE: Calls = { page: 0, q: "", filter: "all" };

afterEach(() => { vi.unstubAllGlobals(); setSectionScope("local"); });

describe("section state: restoring", () => {
  it("gives back what was saved for a section, and only that section", () => {
    const s = fake();
    saveSection("campaigns", { page: 3, q: "design", filter: "closed" }, s);
    expect(loadSection("campaigns", parse, NONE, s)).toEqual({ page: 3, q: "design", filter: "closed" });
    expect(loadSection("outreach", parse, NONE, s)).toEqual(NONE);
  });

  it("keeps a campaign's own section apart from the page's", () => {
    const s = fake();
    saveSection("outreach", { page: 2, q: "", filter: "all" }, s);
    saveSection("outreach:c-1", { page: 5, q: "x", filter: "all" }, s);
    expect(loadSection("outreach", parse, NONE, s).page).toBe(2);
    expect(loadSection("outreach:c-1", parse, NONE, s).page).toBe(5);
  });

  it("is versioned: a shape it does not know is left alone", () => {
    const s = fake({ [sectionKey("campaigns")]: JSON.stringify({ v: 2, s: { page: 4 } }) });
    expect(loadSection("campaigns", parse, NONE, s)).toEqual(NONE);
  });

  it("forgets a single section", () => {
    const s = fake();
    saveSection("campaigns", { page: 1 }, s);
    forgetSection("campaigns", s);
    expect(loadSection("campaigns", parse, NONE, s)).toEqual(NONE);
  });
});

describe("section state: never into an impossible state", () => {
  it("ignores an unknown filter, a page out of range and the wrong type", () => {
    const s = fake({ [sectionKey("campaigns")]: JSON.stringify({ v: 1, s: { page: -4, q: 12, filter: "archived" } }) });
    expect(loadSection("campaigns", parse, NONE, s)).toEqual(NONE);
    const t = fake({ [sectionKey("campaigns")]: JSON.stringify({ v: 1, s: { page: 1.5, q: "ok", filter: "active" } }) });
    expect(loadSection("campaigns", parse, NONE, t)).toEqual({ page: 0, q: "ok", filter: "active" });
  });

  it("clamps a remembered page to the list as it is now", () => {
    expect(clampedOffset(30, 23, 10)).toBe(20);
    expect(clampedOffset(20, 10, 10)).toBe(0);
    expect(clampedOffset(10, 11, 10)).toBe(10);
    expect(clampedOffset(5, 0, 10)).toBe(0);
    expect(clampedOffset(-10, 50, 10)).toBe(0);
    expect(clampedOffset(25, 100, 10)).toBe(20);
    expect(clampedOffset(40, null, 10)).toBe(40);
    expect(clampedOffset(Number.NaN, 50, 10)).toBe(0);
  });

  it("reads lists and flags only as far as they are lists and flags", () => {
    expect(take.strs(["a", 3, "b", null])).toEqual(["a", "b"]);
    expect(take.strs("a")).toEqual([]);
    expect(take.flags({ a: true, b: "yes", c: false })).toEqual({ a: true, c: false });
    expect(take.flags([true])).toEqual({});
    expect(take.str("x".repeat(500), "", 10)).toHaveLength(10);
    expect(take.bool("true", true)).toBe(true);
  });
});

describe("section state: a corrupt or missing store", () => {
  it("falls back on text that is not JSON, JSON that is not an object, and an empty record", () => {
    for (const text of ["{nope", "null", "[1,2]", "42", JSON.stringify({ v: 1 }), JSON.stringify({ v: 1, s: [] })]) {
      expect(loadSection("campaigns", parse, NONE, fake({ [sectionKey("campaigns")]: text }))).toEqual(NONE);
    }
  });

  it("does not throw when storage refuses to read or write, or is not there", () => {
    const hostile = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("full"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(loadSection("campaigns", parse, NONE, hostile)).toEqual(NONE);
    expect(() => saveSection("campaigns", { page: 1 }, hostile)).not.toThrow();
    expect(() => forgetSection("campaigns", hostile)).not.toThrow();
    expect(loadSection("campaigns", parse, NONE, null)).toEqual(NONE);
    expect(() => saveSection("campaigns", { page: 1 }, null)).not.toThrow();
    expect(() => resetSectionState(null)).not.toThrow();
  });
});

describe("section state: organisations and sign-out", () => {
  it("never reads another workspace's section", () => {
    const s = fake();
    setSectionScope("org-a");
    saveSection("campaigns", { page: 4, q: "", filter: "all" }, s);
    expect(loadSection("campaigns", parse, NONE, s).page).toBe(4);
    setSectionScope("org-b");
    expect(loadSection("campaigns", parse, NONE, s)).toEqual(NONE);
    expect(sectionKey("campaigns", "org-b")).not.toBe(sectionKey("campaigns", "org-a"));
  });

  it("clears everything when the organisation changes, but not on the first answer at boot", () => {
    const s = fake({ "sh.other": "kept" });
    vi.stubGlobal("window", { sessionStorage: s });
    setSectionScope("org-a");
    saveSection("campaigns", { page: 2 }, s);
    saveSection("calls", { page: 1 }, s);
    s.setItem("sh.analytics.filters.org-a.me", "days=7");
    setSectionScope("org-a");
    expect(keys(s)).toHaveLength(4);
    setSectionScope("org-b");
    expect(sectionScope()).toBe("org-b");
    expect(keys(s)).toEqual(["sh.other"]);
  });

  it("is cleared by a sign-out: its keys sit under the prefix the personal-cache sweep removes", () => {
    const s = fake();
    saveSection("campaigns", { page: 2 }, s);
    expect(keys(s).every((k) => k.startsWith("sh."))).toBe(true);
    resetSectionState(s);
    expect(keys(s)).toEqual([]);
  });
});

describe("section state: links come first", () => {
  it("knows an address that asks for something of its own", () => {
    expect(hasDeepLink("#/contacts?open=1234")).toBe(true);
    expect(hasDeepLink("#/analytics/outreach?channel=email")).toBe(true);
    expect(hasDeepLink("#/campaigns")).toBe(false);
    expect(hasDeepLink("#/campaigns?")).toBe(false);
    expect(hasDeepLink("")).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterChips } from "../components/FilterChips";
import { PageBoundary } from "../consolePages";
import { readListRemembered as calls } from "../CallsPage";
import { readListRemembered } from "../OutreachPage";
import { CHANNEL_TABS, statusFilterOf, statusFiltersFor, statusForTab, tabOf } from "../outreachActivityView";
import type { ChannelTab } from "../outreachActivityView";
import { loadSection, saveSection, sectionKey } from "../sectionState";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

class Fake {
  constructor(initial: Record<string, string> = {}) { Object.assign(this, initial); }
  private get own() { return this as unknown as Record<string, string>; }
  getItem(k: string) { return Object.hasOwn(this, k) ? this.own[k] ?? null : null; }
  setItem(k: string, v: string) { this.own[k] = String(v); }
  removeItem(k: string) { delete this.own[k]; }
}
const fake = (initial: Record<string, string> = {}): Storage => new Fake(initial) as unknown as Storage;

afterEach(() => vi.unstubAllGlobals());

const TABS = CHANNEL_TABS.map((t) => t.value);
const STATUSES = ["", "replied", "waiting", "bounced", "failed", "scheduled", "draft", "connected", "voicemail", "no_answer", "call_back", "not_interested", "in_progress", "zzz"];

describe("the channel and its status, replayed", () => {
  /** What the page does: the channel is picked, a status is chosen, the section is saved and read back on a visit. */
  const visit = (tab: ChannelTab, status: string) => {
    const store = fake();
    saveSection("outreach", { tab, status, q: "", preset: "any", custom: { from: "", to: "" }, person: "", offset: 0, size: 15 }, store);
    return loadSection("outreach", readListRemembered, readListRemembered({}), store);
  };

  it("never leaves a status the channel does not have, whichever way it got there", () => {
    for (const from of TABS) for (const to of TABS) for (const status of STATUSES) {
      // Set the filter on one channel, then switch (the click): the status is kept only if the new channel has it.
      const kept = statusForTab(statusFilterOf(status, from), to);
      expect(kept === "" || statusFiltersFor(to).some((o) => o.value === kept), `${from}>${to}:${status}`).toBe(true);
      // A switch is settled in one step: doing it again changes nothing, so nothing retriggers it.
      expect(statusForTab(kept, to)).toBe(kept);
      // And a visit that saved the combination reads back as something the page can be in, the same on the next visit.
      const back = visit(to, status);
      expect(back.status === "" || statusFiltersFor(back.tab).some((o) => o.value === back.status)).toBe(true);
      expect(visit(back.tab, back.status)).toEqual(back);
    }
  });

  it("restores Waiting for a reply on Calls as no status, and keeps the channel", () => {
    expect(visit("call", "waiting")).toMatchObject({ tab: "call", status: "" });
    expect(visit("email", "waiting")).toMatchObject({ tab: "email", status: "waiting" });
    expect(visit("", "waiting")).toMatchObject({ tab: "", status: "waiting" });
  });

  it("reads the channel by any of its names", () => {
    for (const [said, tab] of [["calls", "call"], ["call", "call"], ["CALLS", "call"], ["emails", "email"], ["email", "email"], ["whatsapp", "whatsapp"], ["all", ""], ["", ""], [7, ""], [null, ""], [{}, ""]] as const) {
      expect(tabOf(said)).toBe(tab);
    }
    expect(readListRemembered({ tab: "calls", status: "voicemail" })).toMatchObject({ tab: "call", status: "voicemail" });
  });
});

describe("a saved section can never bring a page down", () => {
  const poison: unknown[] = [null, 0, "x", [], {}, { tab: {} }, { status: ["a"], tab: 5, q: { a: 1 }, preset: [], custom: "no", person: 9, offset: "3", size: -1 },
    { q: "x".repeat(10_000), offset: 1e12, size: 1e9, custom: { from: "yesterday", to: {} } }, { tab: "call", status: "waiting", offset: Number.NaN, size: Number.NaN }];

  it("reads anything as a state the page can be in", () => {
    for (const raw of poison) {
      const wrap = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      for (const read of [readListRemembered, calls]) {
        const got = read(wrap);
        expect(got.offset).toBeGreaterThanOrEqual(0);
        expect(got.q.length).toBeLessThanOrEqual(100);
        expect(Number.isFinite(got.size)).toBe(true);
      }
    }
  });

  it("forgets a section whose reader threw, so it is not there to throw again", () => {
    const store = fake();
    saveSection("outreach", { tab: "call" }, store);
    const boom = () => { throw new Error("cannot read this"); };
    expect(loadSection("outreach", boom, "fallback", store)).toBe("fallback");
    expect(store.getItem(sectionKey("outreach"))).toBeNull();
  });

  it("is forgotten when a page's boundary catches, and again when Try again is pressed", () => {
    const store = fake();
    vi.stubGlobal("window", { sessionStorage: store });
    saveSection("outreach", { tab: "call" }, store);
    saveSection("outreach:c1", { tab: "call" }, store);
    new PageBoundary({ children: null, resetKey: "calls" }).componentDidCatch();
    expect(store.getItem(sectionKey("outreach"))).toBeNull();
    expect(store.getItem(sectionKey("outreach:c1"))).toBeNull();
    expect(src("consolePages.tsx")).toMatch(/onRetry=\{\(\) => \{ resetSectionState\(\); window\.location\.reload\(\); \}\}/);
  });
});

describe("the page boundary", () => {
  const next = PageBoundary.getDerivedStateFromProps;

  it("stays failed on the page that failed, and clears when another page opens", () => {
    expect(next({ resetKey: "calls" }, { failed: true, key: "calls" })).toBeNull();
    expect(next({ resetKey: "contacts" }, { failed: true, key: "calls" })).toEqual({ failed: false, key: "contacts" });
    // Coming back to the page that failed starts it fresh, not failed.
    expect(next({ resetKey: "calls" }, { failed: false, key: "contacts" })).toEqual({ failed: false, key: "calls" });
  });

  it("is keyed by the route in the console", () => {
    expect(src("Console.tsx")).toContain("<PageBoundary resetKey={route}>");
  });
});

describe("what is narrowing the list is visible", () => {
  const html = (n: number) =>
    renderToStaticMarkup(<FilterChips chips={Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: i === 0 ? "Waiting for a reply" : `Filter ${i}`, onClear: () => undefined }))} onClearAll={() => undefined} />);

  it("shows each filter with a way to take it off, and one Clear", () => {
    const h = html(2);
    expect(h).toContain("Waiting for a reply");
    expect(h).toContain('aria-label="Remove filter: Waiting for a reply"');
    expect(h).toContain("Filter 1");
    expect(h).toContain(">Clear<");
    expect(h).toContain('role="group"');
  });

  it("draws nothing when nothing narrows the list", () => {
    expect(html(0)).toBe("");
  });

  it("is on the Outreach and Calls lists, built from the state that was restored", () => {
    for (const f of ["OutreachPage.tsx", "CallsPage.tsx"]) {
      const code = src(f);
      expect(code, f).toContain("<FilterChips chips={chips} onClearAll={clear} />");
      expect(code, f).toContain("chips.push(");
    }
    expect(src("OutreachPage.tsx")).toContain("statusFiltersFor(tab).find((o) => o.value === status)?.label");
  });

  it("does not correct the status in an effect any more: the switch does it in the same step", () => {
    const code = src("OutreachPage.tsx");
    expect(code).not.toMatch(/useEffect\(\(\) => \{ if \(status && !statusFilterOf\(status, tab\)\) setStatus\(""\);/);
    expect(code).toContain("const pickTab = (t: ChannelTab) => { setTab(t); setStatus((s) => statusForTab(s, t)); };");
    expect(code).toContain("onChange={pickTab}");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Segmented } from "../analyticsKit";
import { ChannelSwitch } from "../OutreachPage";
import {
  boxVars, GIVE_UP_MS, heightPlan, holdStep, measureActive, paneClass, reducedMotion, sameBox, SLIDE_MS, SLOW_MS, startHold,
} from "../switchHold";
import type { HoldInput, HoldOut, HoldState } from "../switchHold";
import { SwitchPane, useReducedMotion } from "../switchMotion";
import { activityKey, activitySettled } from "../useOutreachActivity";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

afterEach(() => vi.unstubAllGlobals());

/* A page's value is just a label here: what matters is which one the step hands back. */
type V = string;
const step = (prev: HoldState<V>, over: Partial<HoldInput<V>> & Pick<HoldInput<V>, "key" | "live">): HoldOut<V> =>
  holdStep(prev, { scope: "", ready: false, giveUpSeq: null, holdable: () => true, ...over });

describe("what stays on screen while the next list is read", () => {
  it("shows the page's own value when nothing is being switched", () => {
    const s = startHold<V>("A", "a", "");
    const out = step(s, { key: "a", live: "A, a little newer", ready: true });
    expect(out.value).toBe("A, a little newer");
    expect(out.holding).toBe(false);
  });

  it("keeps the previous list while the next is read, however the page's value moves meanwhile, then shows the next", () => {
    let s = startHold<V>("A: three campaigns", "a", "");
    // The tab is clicked: the page's own value is still the old list for a moment, then a loader, then the groups
    // without their rows. None of it is shown.
    for (const live of ["A: three campaigns", "loading", "B: groups, rows loading"]) {
      const out = step(s, { key: "b", live });
      expect(out.value).toBe("A: three campaigns");
      expect(out.holding).toBe(true);
      expect(out.shownKey).toBe("a");
      s = out.state;
    }
    // The rows are in: now it is the new list, once.
    const done = step(s, { key: "b", live: "B: whole", ready: true });
    expect(done.value).toBe("B: whole");
    expect(done.holding).toBe(false);
    expect(done.shownKey).toBe("b");
    // And a value that moves under the same key afterwards is shown as it is.
    expect(step(done.state, { key: "b", live: "B: one more" }).value).toBe("B: one more");
  });

  it("shows an answer that is already whole at once, with nothing held (a quick or cached read)", () => {
    const s = startHold<V>("A", "a", "");
    const out = step(s, { key: "b", live: "B", ready: true });
    expect(out.value).toBe("B");
    expect(out.holding).toBe(false);
  });

  it("does not hold a group that is opened: only a change of key is a switch", () => {
    const s = startHold<V>("A: group one open", "a", "");
    const out = step(s, { key: "a", live: "A: group two open, its rows loading", ready: false });
    expect(out.value).toBe("A: group two open, its rows loading");
    expect(out.holding).toBe(false);
  });

  it("goes back to a tab it has not left yet without showing the one it was on the way to", () => {
    let s = startHold<V>("All", "all", "");
    let out = step(s, { key: "email", live: "loading" });
    expect(out.value).toBe("All");
    s = out.state;
    out = step(s, { key: "all", live: "Email: whole" });
    // The answer for Email is not the one wanted any more; All is still what is on screen.
    expect(out.value).toBe("All");
    expect(out.holding).toBe(true);
    s = out.state;
    out = step(s, { key: "all", live: "All: whole again", ready: true });
    expect(out.value).toBe("All: whole again");
    expect(out.holding).toBe(false);
  });

  it("lets go of a switch that has not been answered for too long, and only that one", () => {
    let s = startHold<V>("A", "a", "");
    const held = step(s, { key: "b", live: "loading" });
    expect(held.value).toBe("A");
    s = held.state;
    const gaveUp = step(s, { key: "b", live: "loading", giveUpSeq: held.seq });
    expect(gaveUp.value).toBe("loading");
    expect(gaveUp.holding).toBe(false);
    // The next switch is a new one: giving up on the old one does not leak into it.
    const next = step(gaveUp.state, { key: "c", live: "loading", giveUpSeq: held.seq });
    expect(next.holding).toBe(true);
    expect(next.seq).toBe(held.seq + 1);
  });

  it("holds nothing across a different scope (another campaign's outreach is another list)", () => {
    const s = startHold<V>("campaign one", "a", "k1");
    const out = step(s, { key: "a", live: "campaign two, loading", scope: "k2" });
    expect(out.value).toBe("campaign two, loading");
    expect(out.holding).toBe(false);
  });

  it("holds nothing that cannot stand in for the next list (a failure, or a first load that never finished)", () => {
    const s = startHold<V>("failed", "a", "");
    const out = step(s, { key: "b", live: "loading", holdable: (v) => v !== "failed" });
    expect(out.value).toBe("loading");
    expect(out.holding).toBe(false);
  });

  it("says a slow switch is slow only after a moment, and gives up after longer", () => {
    expect(SLOW_MS).toBeGreaterThanOrEqual(200);
    expect(SLOW_MS).toBeLessThanOrEqual(300);
    expect(GIVE_UP_MS).toBeGreaterThan(SLOW_MS * 10);
  });
});

describe("when the answer is whole", () => {
  const rows = (phase: "loading" | "ready" | "failed", offset = 0) => ({ items: [], total: null, offset, phase });
  const key = activityKey({ channel: "email" }, undefined);

  it("is the key of the groups read, then the rows of every group that has to show some", () => {
    expect(activitySettled({ key: "", phase: "loading", rows: {} }, key, [])).toBe(false);
    // The old answer, while the new one is asked for.
    expect(activitySettled({ key: activityKey({}, undefined), phase: "ready", rows: {} }, key, [])).toBe(false);
    expect(activitySettled({ key, phase: "ready", rows: {} }, key, ["k1"])).toBe(false);
    expect(activitySettled({ key, phase: "ready", rows: { k1: rows("loading") } }, key, ["k1"])).toBe(false);
    expect(activitySettled({ key, phase: "ready", rows: { k1: rows("ready") } }, key, ["k1"])).toBe(true);
  });

  it("waits for the page asked for, on a campaign's own page: the rows of the page before are not its answer", () => {
    expect(activitySettled({ key, phase: "ready", rows: { k1: rows("ready", 0) } }, key, ["k1"], 15)).toBe(false);
    expect(activitySettled({ key, phase: "ready", rows: { k1: rows("ready", 15) } }, key, ["k1"], 15)).toBe(true);
    expect(activitySettled({ key, phase: "ready", rows: { k1: rows("ready", 0) } }, key, ["k1"])).toBe(true);
  });

  it("does not wait for a group's rows that failed (it shows its own failure), nor for a page with nothing open", () => {
    expect(activitySettled({ key, phase: "ready", rows: { k1: rows("failed") } }, key, ["k1"])).toBe(true);
    expect(activitySettled({ key, phase: "ready", rows: {} }, key, [])).toBe(true);
  });

  it("is a different key for a different channel, search, or campaign", () => {
    expect(activityKey({ channel: "call" }, undefined)).not.toBe(activityKey({ channel: "email" }, undefined));
    expect(activityKey({ q: "a" }, undefined)).not.toBe(activityKey({}, undefined));
    expect(activityKey({}, "k1")).not.toBe(activityKey({}, undefined));
    expect(activityKey({ channel: "call" }, "k1")).toBe(activityKey({ channel: "call" }, "k1"));
  });
});

describe("the sliding mark", () => {
  const el = (offsetLeft: number, offsetTop: number, offsetWidth: number, offsetHeight: number) => ({ offsetLeft, offsetTop, offsetWidth, offsetHeight });

  it("is where the active tab is, and nowhere before the tab is laid out", () => {
    const seen: string[] = [];
    const host = (found: ReturnType<typeof el> | null) => ({ querySelector: (s: string) => { seen.push(s); return found; } });
    expect(measureActive(host(el(84, 3, 96, 32)), '[aria-checked="true"]')).toEqual({ x: 84, y: 3, w: 96, h: 32 });
    expect(seen).toEqual(['[aria-checked="true"]']);
    expect(measureActive(host(null), '[aria-checked="true"]')).toBeNull();
    expect(measureActive(host(el(0, 0, 0, 0)), '[aria-checked="true"]')).toBeNull();
  });

  it("is moved with a transform and a width: four custom properties, in pixels", () => {
    expect(boxVars({ x: 84, y: 3, w: 96, h: 32 })).toEqual({ "--sw-x": "84px", "--sw-y": "3px", "--sw-w": "96px", "--sw-h": "32px" });
    expect(sameBox({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 })).toBe(true);
    expect(sameBox({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 5 })).toBe(false);
    expect(sameBox(null, null)).toBe(true);
    expect(sameBox(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });

  it("is drawn inside both controls, hidden from assistive technology, with the buttons left as they were", () => {
    const chan = renderToStaticMarkup(
      <ChannelSwitch value="email" onChange={() => undefined} counts={{ all: 12, email: 7, whatsapp: 2, call: 3, callsConnected: 1 }} />,
    );
    expect(chan).toContain('class="ko-switch sw-host"');
    expect(chan).toContain('<span class="sw-ind" aria-hidden="true"></span>');
    expect(chan.match(/role="radio"/g)?.length).toBe(4);
    expect(chan).toMatch(/aria-checked="true"[^>]*class="is-on"[^>]*>.*?Email/);
    // Nothing is measured on the server: the control is whole without the mark.
    expect(chan).not.toContain("data-sw");

    const seg = renderToStaticMarkup(
      <Segmented label="Channel" value="calls" options={[{ id: "all", name: "All" }, { id: "calls", name: "Calls", count: 3 }]} onChange={() => undefined} />,
    );
    expect(seg).toContain('class="an-seg sw-host"');
    expect(seg).toContain('<span class="sw-ind" aria-hidden="true"></span>');
    expect(seg).toContain('aria-pressed="true"');
    expect(seg).toContain('<span class="an-seg-n">3</span>');
  });
});

describe("the list that comes in", () => {
  it("comes in with a fade only once the page has switched, and never with motion off", () => {
    expect(paneClass(false, false)).toBe("sw-pane");
    expect(paneClass(true, false)).toBe("sw-pane is-enter");
    expect(paneClass(true, true)).toBe("sw-pane");
  });

  it("moves its height only when there is somewhere to go and motion is on", () => {
    expect(heightPlan(240, 410, false)).toEqual({ from: 240, to: 410 });
    expect(heightPlan(410, 240, false)).toEqual({ from: 410, to: 240 });
    expect(heightPlan(240, 410, true)).toBeNull();
    expect(heightPlan(null, 410, false)).toBeNull();
    expect(heightPlan(0, 410, false)).toBeNull();
    expect(heightPlan(300, 301, false)).toBeNull();
  });

  it("is drawn as it is the first time, with its content, and a slow switch only makes it paler", () => {
    const plain = renderToStaticMarkup(<SwitchPane k="all"><p>Rows</p></SwitchPane>);
    expect(plain).toBe('<div class="sw-box"><div class="sw-pane"><p>Rows</p></div></div>');
    const slow = renderToStaticMarkup(<SwitchPane k="all" busy><p>Rows</p></SwitchPane>);
    expect(slow).toContain('class="sw-box is-busy"');
  });

  it("is quick and small: under 250ms, a few pixels, no stagger", () => {
    expect(SLIDE_MS).toBeGreaterThanOrEqual(180);
    expect(SLIDE_MS).toBeLessThanOrEqual(220);
    const css = read("switchMotion.css");
    expect(css).toMatch(/\.sw-pane\.is-enter \{ animation: sw-in 180ms var\(--ease-out\) backwards; \}/);
    expect(css).toMatch(/from \{ opacity: 0; transform: translateY\(6px\); \}/);
    expect(css).toMatch(/transition: transform 200ms var\(--ease-out\)/);
    expect(css).not.toMatch(/animation-delay|nth-child|:nth-of-type/);
    expect(css).not.toMatch(/border-(left|inline-start)/);
  });
});

describe("with the system asking for less motion", () => {
  it("is asked of the browser each time, and false where it cannot be asked", () => {
    expect(reducedMotion()).toBe(false);
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion"), addEventListener: () => undefined }) });
    expect(reducedMotion()).toBe(true);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(reducedMotion()).toBe(false);
  });

  it("is what the pane starts from", () => {
    function Probe() {
      return <i>{String(useReducedMotion())}</i>;
    }
    expect(renderToStaticMarkup(<Probe />)).toBe("<i>false</i>");
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true, addEventListener: () => undefined }) });
    expect(renderToStaticMarkup(<Probe />)).toBe("<i>true</i>");
  });

  it("stops every movement in the stylesheets: the mark, the list's fade, the colour of the labels", () => {
    const shared = read("switchMotion.css");
    const reduce = shared.slice(shared.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toMatch(/\.sw-ind, \.sw-host\[data-sw="live"\] > \.sw-ind \{ transition: none; \}/);
    expect(reduce).toMatch(/\.sw-pane\.is-enter \{ animation: none; \}/);
    expect(reduce).toMatch(/\.sw-pane \{ transition: none; \}/);
    expect(read("outreachActivity.css")).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ko-switch button, \.ko-switch-n \{ transition: none; \}/);
    expect(read("analytics.css")).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.an-seg button, \.an-seg-n, \.an-body \{ transition: none; \}/);
  });
});

describe("where it is used", () => {
  it("is in both Outreach pages (one list), the Analytics channel tabs and its other segmented controls", () => {
    const outreach = read("OutreachPage.tsx");
    expect(outreach).toContain("useHeldView(");
    expect(outreach).toContain("<SwitchPane");
    expect(outreach).toContain("useSlide<HTMLDivElement>");
    // The tabs show the counts of the list on screen, so they do not blink to nothing while the next is read.
    expect(outreach).toMatch(/counts=\{v\.data\.phase === "ready" \? v\.data\.channels : null\}/);
    expect(outreach).toMatch(/onSummary\(v\.data\.phase === "ready" \? v\.data\.channels : null\)/);
    const analytics = read("AnalyticsPages.tsx");
    expect(analytics).toContain("<SwitchPane k={channel}>");
    expect(analytics).toContain("periodSlide");
    expect(read("analyticsKit.tsx")).toContain("useSlide<HTMLDivElement>");
  });

  it("gives each control the look of its mark through custom properties, not a second fill", () => {
    expect(read("outreachActivity.css")).toMatch(/--sw-bg: var\(--card\); --sw-shadow: 0 0 0 1px var\(--hairline\); --sw-r: 9px;/);
    expect(read("analytics.css")).toMatch(/--sw-bg: var\(--an-plane\); --sw-shadow: none; --sw-r: 8px;/);
  });
});

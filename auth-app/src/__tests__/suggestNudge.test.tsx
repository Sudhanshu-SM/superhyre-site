import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Sourced page's nudge to look at the changes the daily search suggests: one line with Show me and Not now, said right after
 * someone is rejected with a reason, only for a person who may change the campaign. Show me sends the agent the words that put the
 * change in the chat as a card; nothing is changed from the page. The server's side (the rules, the cards, Undo) is
 * server/test/search-suggestions.test.ts.
 */

type Suggestion = import("../api/campaigns").ApiSuggestion;

const net = vi.hoisted(() => ({
  reads: [] as Array<{ campaignId: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
}));

const rt = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: readonly unknown[] | undefined; cleanup?: unknown };
  const r = {
    slots: [] as Slot[],
    at: 0,
    effects: [] as Array<() => void>,
    rendering: false,
    dirty: false,
    schedule: () => {},
    useState: (initial: unknown): [unknown, (next: unknown) => void] => {
      const i = r.at++;
      if (!(i in r.slots)) r.slots[i] = { value: typeof initial === "function" ? (initial as () => unknown)() : initial };
      const s = r.slots[i]!;
      return [s.value, (next) => { s.value = typeof next === "function" ? (next as (cur: unknown) => unknown)(s.value) : next; r.schedule(); }];
    },
    useEffect: (fn: () => unknown, deps?: readonly unknown[]): void => {
      const i = r.at++;
      if (!(i in r.slots)) r.slots[i] = {};
      const s = r.slots[i]!;
      const changed = !deps || !s.deps || deps.length !== s.deps.length || deps.some((d, k) => !Object.is(d, s.deps![k]));
      if (changed) r.effects.push(() => { if (typeof s.cleanup === "function") s.cleanup(); s.cleanup = fn(); s.deps = deps; });
    },
  };
  return r;
});

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), useState: rt.useState, useEffect: rt.useEffect }));
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), LIVE: true }));
vi.mock("../api/campaigns", async (orig) => ({
  ...(await orig<typeof import("../api/campaigns")>()),
  campaignSuggestions: (campaignId: string) => new Promise((resolve, reject) => { net.reads.push({ campaignId, resolve, reject }); }),
}));

const { SuggestNudge, SuggestNudgeLine } = await import("../SuggestNudge");
const { asksAfter, nudgeText, showPhrase, SHOW_SUGGESTIONS } = await import("../suggestNudge");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const kafka: Suggestion = {
  id: "s1", campaignId: "c1", rule: "skills", lever: "filters", state: "open",
  headline: "Ask for Kafka", why: "3 of your last 3 rejections say Kafka was missing.",
};

describe("what the nudge says", () => {
  it("says the change and why in counts, and how many more wait", () => {
    expect(nudgeText([kafka])).toBe("A change to suggest: Ask for Kafka. 3 of your last 3 rejections say Kafka was missing.");
    expect(nudgeText([kafka, { ...kafka, id: "s2" }, { ...kafka, id: "s3" }])).toBe(
      "A change to suggest: Ask for Kafka. 3 of your last 3 rejections say Kafka was missing. 2 more waiting.",
    );
  });

  it("says nothing when nothing waits", () => {
    expect(nudgeText([])).toBeNull();
  });

  it("asks the agent in the words the morning's message uses, with the campaign named", () => {
    expect(SHOW_SUGGESTIONS).toBe("Show me the changes you suggest");
    expect(showPhrase("Data Engineer")).toBe("Show me the changes you suggest for Data Engineer");
  });

  it("looks only after a rejection with a reason, and only for a person who may change the campaign", () => {
    expect(asksAfter("Skills: no Kafka", true)).toBe(true);
    expect(asksAfter("Experience", true)).toBe(true);
    expect(asksAfter(undefined, true)).toBe(false);
    expect(asksAfter("   ", true)).toBe(false);
    expect(asksAfter("Skills", false)).toBe(false);
  });
});

describe("the line", () => {
  const html = renderToStaticMarkup(<SuggestNudgeLine text={nudgeText([kafka]) ?? ""} onShow={() => {}} onNotNow={() => {}} />);

  it("is the one-line Yes and Not now of the page, with Show me as the lead button", () => {
    expect(html).toContain('class="sp-similar"');
    expect(html).toContain('role="status"');
    expect(html).toContain('class="cw-btn is-primary">Show me<');
    expect(html).toContain('class="cw-btn">Not now<');
    expect(text(html)).toContain("A change to suggest: Ask for Kafka.");
  });

  it("is plain muted text and words a person says: no badge, no dot, no dash, no vendor or jargon", () => {
    expect(html).not.toMatch(/pill|badge|dot|chip/i);
    expect(text(html)).not.toMatch(/ · |—|–|…/);
    expect(text(html)).not.toMatch(/crustdata|provider|api\b|sweep|standing|playbook|tier|ledger/i);
  });
});

/* ── a tiny runtime, as searchHistory.test.tsx has: no DOM, so the hooks are run by hand ── */

type El = { type: unknown; props: Record<string, any> } | null;

function mount<P, R>(component: (props: P) => R, first: P) {
  let tree: R | undefined;
  let props = first;
  const pump = () => {
    if (rt.rendering) { rt.dirty = true; return; }
    rt.rendering = true;
    try {
      do {
        rt.dirty = false; rt.at = 0; rt.effects = [];
        tree = component(props);
        for (const run of rt.effects) run();
      } while (rt.dirty);
    } finally { rt.rendering = false; }
  };
  rt.slots = [];
  rt.schedule = pump;
  pump();
  return {
    get tree() { return tree as R; },
    set(next: P) { props = next; pump(); },
    unmount() { for (const s of rt.slots) if (s && typeof s.cleanup === "function") { s.cleanup(); s.cleanup = undefined; } },
  };
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

type Props = Parameters<typeof SuggestNudge>[0];
function nudge(over: Partial<Props> = {}) {
  const sent: Array<{ prompt?: string; send?: boolean }> = [];
  const props: Props = {
    campaignId: "c1", campaignName: "Data Engineer", asked: 0, hidden: false,
    onAgent: (prompt, opts) => { sent.push({ ...(prompt === undefined ? {} : { prompt }), ...(opts?.send === undefined ? {} : { send: opts.send }) }); },
    ...over,
  };
  const m = mount(SuggestNudge, props);
  return { sent, props, m, get el() { return m.tree as unknown as El; } };
}

beforeEach(() => { net.reads.length = 0; });

describe("the nudge, as the server answers", () => {
  it("reads nothing until someone has been rejected with a reason", async () => {
    const n = nudge({ asked: 0 });
    await settle();
    expect(net.reads).toEqual([]);
    expect(n.el).toBeNull();
    n.m.unmount();
  });

  it("reads the campaign's waiting changes on each rejection with a reason, and says the first in one line", async () => {
    const n = nudge();
    n.m.set({ ...n.props, asked: 1 });
    expect(net.reads.map((r) => r.campaignId)).toEqual(["c1"]);
    net.reads[0]!.resolve([kafka]);
    await settle();
    expect(n.el?.type).toBe(SuggestNudgeLine);
    expect(n.el?.props.text).toBe("A change to suggest: Ask for Kafka. 3 of your last 3 rejections say Kafka was missing.");
    n.m.set({ ...n.props, asked: 2 });
    expect(net.reads).toHaveLength(2);
    n.m.unmount();
  });

  it("says nothing when no change waits, or when the read fails", async () => {
    const n = nudge({ asked: 1 });
    net.reads[0]!.resolve([]);
    await settle();
    expect(n.el).toBeNull();
    n.m.set({ ...n.props, asked: 2 });
    net.reads[1]!.reject(new Error("offline"));
    await settle();
    expect(n.el).toBeNull();
    n.m.unmount();
  });

  it("keeps quiet while the other line is being said, and says nothing of a change when a later read finds none", async () => {
    const n = nudge({ asked: 1, hidden: true });
    net.reads[0]!.resolve([kafka]);
    await settle();
    expect(n.el).toBeNull();
    n.m.set({ ...n.props, hidden: false });
    expect(n.el?.type).toBe(SuggestNudgeLine);
    n.m.unmount();
  });

  it("sends the agent the words that put the change in the chat as a card, and puts the line away", async () => {
    const n = nudge({ asked: 1 });
    net.reads[0]!.resolve([kafka]);
    await settle();
    n.el?.props.onShow();
    expect(n.sent).toEqual([{ prompt: "Show me the changes you suggest for Data Engineer", send: true }]);
    expect(n.el).toBeNull();
    n.m.unmount();
  });

  it("puts the line away on Not now and sends nothing", async () => {
    const n = nudge({ asked: 1 });
    net.reads[0]!.resolve([kafka]);
    await settle();
    n.el?.props.onNotNow();
    expect(n.sent).toEqual([]);
    expect(n.el).toBeNull();
    n.m.unmount();
  });
});

describe("where it sits and what it never does", () => {
  it("is on the Sourced page for those who may change the campaign, after a rejection with a reason, beside the line about years", () => {
    const page = src("SourcedPage.tsx");
    expect(page).toContain("<SuggestNudge ");
    expect(page).toContain("{may && <SuggestNudge ");
    expect(page).toContain("asksAfter(reason, may)");
    expect(page).toContain("hidden={similar !== null}");
  });

  it("changes nothing itself: it reads the waiting changes and sends words to the agent", () => {
    const nudgeSrc = src("SuggestNudge.tsx");
    expect(nudgeSrc).not.toMatch(/setSources|setFilters|specApi|agentApi|"PUT"|"POST"|"PATCH"/);
    expect(nudgeSrc).toContain("campaignSuggestions");
    expect(nudgeSrc).toContain("onAgent(showPhrase(campaignName), { send: true })");
  });
});

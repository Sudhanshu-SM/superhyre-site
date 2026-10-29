import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";

/**
 * The search history popup the Sourced page's header opens: every change to where a campaign looks and to its filters, who and
 * when, each value before and after, and Undo for the people who may put a change back. This file pins the words the lines
 * are said in, what the popup shows and does as the server answers, and where the button sits. The server's side (the lines,
 * the same transaction, Undo putting back exactly) is test/search-history.test.ts.
 */

type Item = import("../searchHistory").SearchHistoryItem;

const net = vi.hoisted(() => ({
  reads: [] as Array<{ campaignId: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
  undos: [] as Array<{ campaignId: string; changeId: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
  toasts: [] as string[],
  invalidated: [] as unknown[][],
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
  searchHistory: (campaignId: string) => new Promise((resolve, reject) => { net.reads.push({ campaignId, resolve, reject }); }),
  undoSearchChange: (campaignId: string, changeId: string) => new Promise((resolve, reject) => { net.undos.push({ campaignId, changeId, resolve, reject }); }),
}));
vi.mock("../toast", () => ({ useToast: () => (said: string) => { net.toasts.push(said); } }));
vi.mock("../invalidate", () => ({ invalidate: (...args: unknown[]) => { net.invalidated.push(args); } }));

const { SearchHistoryFailed, SearchHistoryPanel, SearchHistoryView, SearchHistoryWait } = await import("../SearchHistory");
const { changesOf, howMade, valueWords, whoWhen } = await import("../searchHistory");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const NOW = new Date(2026, 9, 28, 12).getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const line = (over: Partial<Item> = {}): Item => ({
  id: "41", at: hoursAgo(2), by: "Ana Rao", lever: "filters", via: null, undoes: null, undone: false, canUndo: false,
  before: { cities: ["Mumbai"], years: [3, 8], must: ["Go"] },
  after: { cities: ["Pune"], years: [3, 8], must: ["Go", "Kafka"] },
  ...over,
});
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("a change, said in the filters dialog's own words", () => {
  it("names each filter that changed as the dialog does and says its value before and after, leaving out what did not change", () => {
    expect(changesOf(line())).toEqual([
      { label: "Cities", from: "Mumbai", to: "Pune" },
      { label: "Must have", from: "Go", to: "Go, Kafka" },
    ]);
  });

  it("says a filter that was not there as not set and one that was taken off as none, years as years, and a switch as On or Off", () => {
    expect(changesOf(line({ before: null, after: { cities: ["Pune"], years: [4, 25], openToWork: true } }))).toEqual([
      { label: "Cities", from: "not set", to: "Pune" },
      { label: "Total experience", from: "not set", to: "4+ years" },
      { label: "Open to work", from: "not set", to: "On" },
    ]);
    expect(changesOf(line({ before: { cities: ["Pune"], years: [3, 8] }, after: { cities: [], years: [0, 25] } }))).toEqual([
      { label: "Cities", from: "Pune", to: "none" },
      { label: "Total experience", from: "3 to 8 years", to: "any" },
    ]);
    expect(valueWords("years", [0, 6])).toBe("up to 6 years");
    expect(valueWords("openToWork", false)).toBe("Off");
  });

  it("gives a filter the dialog does not know a readable name rather than its key", () => {
    expect(changesOf(line({ before: {}, after: { someNewFilter: ["x"] } }))).toEqual([{ label: "Some new filter", from: "not set", to: "x" }]);
  });

  it("says where searches look in the words the rest of the console uses, and nothing chosen before as the usual", () => {
    expect(changesOf(line({ lever: "sources", before: null, after: "database" }))).toEqual([
      { label: "Searches look in", from: "external sources only", to: "our DB only" },
    ]);
    expect(changesOf(line({ lever: "sources", before: "database", after: "both" }))[0]).toMatchObject({ to: "our DB and external sources" });
  });

  it("says who and when in plain words, where it was made when that was not the dialog, and that an Undo put something back", () => {
    expect(whoWhen(line(), NOW)).toBe("Ana Rao, 2h ago");
    expect(whoWhen(line({ by: null }), NOW)).toBe("Someone, 2h ago");
    expect(howMade(line())).toBeNull();
    expect(howMade(line({ via: "chat" }))).toBe("Asked in the chat");
    expect(howMade(line({ via: "details" }))).toBe("With the campaign's details");
    expect(howMade(line({ undoes: "40" }))).toBe("Put back");
  });
});

describe("the popup's lines", () => {
  const view = (items: Item[], over: { problem?: string; busy?: string | null } = {}) =>
    renderToStaticMarkup(
      <SearchHistoryView items={items} problem={over.problem ?? ""} busy={over.busy ?? null} now={NOW} onUndo={() => {}} onClose={() => {}} />,
    );

  it("lists each change with who, when and what, the value before an arrow and the value after", () => {
    const html = view([line(), line({ id: "40", lever: "sources", before: "external", after: "both", via: "chat", at: hoursAgo(30) })]);
    expect(html).toContain('<h2 class="t-title">Search history</h2>');
    expect(text(html)).toContain("Ana Rao, 2h ago");
    expect(text(html)).toContain("Cities Mumbai Pune");
    expect(text(html)).toContain("Must have Go Go, Kafka");
    expect(text(html)).toContain("Asked in the chat");
    expect(html).toContain('aria-label="became"');
  });

  it("offers Undo on the lines that may be put back, says a line was put back later, and offers nothing on the rest", () => {
    const html = view([line({ id: "3", canUndo: true }), line({ id: "2", undone: true }), line({ id: "1" })]);
    expect(html.match(/>Undo</g)).toHaveLength(1);
    expect(html.match(/Put back later/g)).toHaveLength(1);
  });

  it("holds every Undo while one is on its way, and says which", () => {
    const html = view([line({ id: "3", canUndo: true }), line({ id: "2", canUndo: true })], { busy: "3" });
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Putting it back");
    expect(html.match(/aria-busy="true"/g)).toHaveLength(1);
  });

  it("says why an Undo was not done, where it is read, and says plainly when nothing has changed", () => {
    expect(view([line()], { problem: "Undo the newer change first." })).toContain('role="alert"');
    expect(text(view([]))).toContain("Nothing has changed here yet.");
  });

  it("is plain text: no badge, no dot, no dash, no ellipsis, and only the console's own type sizes", () => {
    const html = view([line({ canUndo: true }), line({ id: "2", undone: true }), line({ id: "3", via: "details" })], { problem: "Undo the newer change first." });
    expect(html).not.toMatch(/pill|badge|dot|chip/i);
    expect(text(html)).not.toMatch(/ · |—|–|…/);
    expect(src("searchHistory.css")).not.toMatch(/font-size|border-radius: *99|border-radius: *50%/);
  });
});

/* ── a tiny runtime, as jobDescriptionPanel.test.ts has: no DOM, so the hooks are run by hand ── */

type El = { type: unknown; props: Record<string, any> };

function mount<P, R>(component: (props: P) => R, first: P) {
  let tree: R | undefined;
  const pump = () => {
    if (rt.rendering) { rt.dirty = true; return; }
    rt.rendering = true;
    try {
      do {
        rt.dirty = false; rt.at = 0; rt.effects = [];
        tree = component(first);
        for (const run of rt.effects) run();
      } while (rt.dirty);
    } finally { rt.rendering = false; }
  };
  rt.slots = [];
  rt.schedule = pump;
  pump();
  return { get tree() { return tree as R; }, unmount() { for (const s of rt.slots) if (s && typeof s.cleanup === "function") { s.cleanup(); s.cleanup = undefined; } } };
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function panel() {
  const seen = { closed: 0 };
  const m = mount(SearchHistoryPanel, { campaignId: "c1", onClose: () => { seen.closed += 1; } });
  return { get closed() { return seen.closed; }, get el() { return m.tree as unknown as El; }, unmount: m.unmount };
}

beforeEach(() => { net.reads.length = 0; net.undos.length = 0; net.toasts.length = 0; net.invalidated.length = 0; });

describe("the popup, as the server answers", () => {
  it("waits with the real title while the list is read, then shows it", async () => {
    const p = panel();
    expect(p.el.type).toBe(SearchHistoryWait);
    expect(net.reads.map((r) => r.campaignId)).toEqual(["c1"]);
    net.reads[0]!.resolve([line({ canUndo: true })]);
    await settle();
    expect(p.el.type).toBe(SearchHistoryView);
    expect(p.el.props.items).toHaveLength(1);
    p.unmount();
  });

  it("says it could not be read, with a way to ask again", async () => {
    const p = panel();
    net.reads[0]!.reject(new ApiError(503, "unavailable", "Couldn't reach the server."));
    await settle();
    expect(p.el.type).toBe(SearchHistoryFailed);
    p.el.props.onRetry();
    await settle();
    expect(net.reads).toHaveLength(2);
    net.reads[1]!.resolve([]);
    await settle();
    expect(p.el.type).toBe(SearchHistoryView);
    p.unmount();
  });

  it("puts a change back on Undo: the list becomes the one the server sends, the person is told, and the pages that show the filters read again", async () => {
    const p = panel();
    net.reads[0]!.resolve([line({ id: "5", canUndo: true })]);
    await settle();
    p.el.props.onUndo(p.el.props.items[0]);
    await settle();
    expect(net.undos).toMatchObject([{ campaignId: "c1", changeId: "5" }]);
    expect(p.el.props.busy).toBe("5");
    net.undos[0]!.resolve({ lever: "filters", items: [line({ id: "6", undoes: "5" }), line({ id: "5", undone: true })] });
    await settle();
    expect(p.el.props.busy).toBeNull();
    expect(p.el.props.items.map((i: Item) => i.id)).toEqual(["6", "5"]);
    expect(net.toasts).toEqual(["Put back."]);
    expect(net.invalidated).toEqual([[["campaign", "sourcing"], { campaignId: "c1" }]]);
    p.unmount();
  });

  it("says the server's reason when a change cannot be put back, changes nothing, and reads the list again so it shows what stands", async () => {
    const p = panel();
    net.reads[0]!.resolve([line({ id: "5", canUndo: true })]);
    await settle();
    p.el.props.onUndo(p.el.props.items[0]);
    await settle();
    net.undos[0]!.reject(new ApiError(409, "conflict", "This has been changed since, so putting it back would undo more than this one change. Undo the newer change first."));
    await settle();
    expect(p.el.props.problem).toBe("This has been changed since, so putting it back would undo more than this one change. Undo the newer change first.");
    expect(p.el.props.busy).toBeNull();
    expect(net.toasts).toEqual([]);
    expect(net.invalidated).toEqual([]);
    expect(net.reads).toHaveLength(2);
    p.unmount();
  });
});

describe("where the button sits", () => {
  it("is in the Sourced page's header beside the other buttons, for a live console, and reads nothing until pressed", () => {
    const page = src("SourcedPage.tsx");
    expect(page).toMatch(/\{LIVE && <SearchHistoryButton campaignId=\{campaignId\} \/>\}/);
    expect(page.indexOf("<SearchHistoryButton")).toBeLessThan(page.indexOf("Find more people</button>"));
    const popup = src("SearchHistory.tsx");
    expect(popup).toContain(">Search history</button>");
    // The panel is the dialog's content, so it is made when the popup opens and the list is asked for then.
    expect(popup).toMatch(/<Dialog open=\{open\}[^>]*>\s*<SearchHistoryPanel/);
  });

  it("asks the server where the server's routes are", async () => {
    const real = await vi.importActual<typeof import("../api/campaigns")>("../api/campaigns");
    expect(typeof real.searchHistory).toBe("function");
    expect(src("api/campaigns.ts")).toContain('"GET", `/v1/campaigns/${id}/search-history`');
    expect(src("api/campaigns.ts")).toContain('"POST", `/v1/campaigns/${id}/search-history/${changeId}/undo`');
  });
});

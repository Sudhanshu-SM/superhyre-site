import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyDetail, DailyRow, DailyScoreboard, DailySearch, DailySuggestion, DailySuggestions, DailyWatch } from "../api/dailySearch";

/**
 * What the Daily search popup says of the changes the search suggests and of how Save went (docs/plans/daily-search.md, "Delivery and
 * explanation" and Phase 3b): a quiet list of the changes waiting across campaigns, each with a "Show me" that puts it in that
 * campaign's chat as a card, the scoreboard in two plain lines of counts, and nothing at all while the server has the suggestions off or
 * only watching. After a Save that left ready campaigns out (past the most one search holds), one plain line says how many; picking more
 * than that by hand is said as what to do, not as the server's refusal. The server's side is server/test/search-suggestions.test.ts.
 */

type Api = {
  read: () => Promise<unknown>;
  save: (body: unknown) => Promise<unknown>;
  setClock: (body: unknown) => Promise<unknown>;
  suggestions: () => Promise<DailySuggestions>;
  others: () => Promise<unknown>;
};

const net = vi.hoisted(() => ({
  saves: [] as unknown[],
  reads: 0,
  suggestionReads: 0,
  toasts: [] as string[],
  api: {} as Api,
}));

const rt = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: readonly unknown[] | undefined; cleanup?: unknown };
  const same = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
    Boolean(a && b && a.length === b.length && a.every((d, k) => Object.is(d, b[k])));
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
      if (!same(deps, s.deps)) r.effects.push(() => { if (typeof s.cleanup === "function") s.cleanup(); s.cleanup = fn(); s.deps = deps; });
    },
    useCallback: (fn: unknown, deps?: readonly unknown[]): unknown => {
      const i = r.at++;
      if (!(i in r.slots)) r.slots[i] = {};
      const s = r.slots[i]!;
      if (!same(deps, s.deps)) { s.value = fn; s.deps = deps; }
      return s.value;
    },
  };
  return r;
});

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), useState: rt.useState, useEffect: rt.useEffect, useCallback: rt.useCallback }));
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), LIVE: true }));
vi.mock("../toast", async (orig) => ({ ...(await orig<typeof import("../toast")>()), useToast: () => (said: string) => { net.toasts.push(said); } }));
vi.mock("../api/dailySearch", () => ({ dailySearchApi: net.api }));

const { DailySearchPanel, DailySearchView } = await import("../DailySearchDialog");
const { saveDraft } = await import("../dailySearchSave");
const { askToShow, SHOW_EVENT } = await import("../suggestNudge");
const view = await import("../dailySearchView");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const NOW = new Date(2026, 9, 29, 10, 0).getTime();

const DEFAULTS = { runAt: "07:00", repeat: "daily" as const, reserve: 100, waitingCap: 20, waitingResumeAt: 10, perCampaign: 5, perCampaignMax: 10, creditsPerProfile: 0.03, maxCampaigns: 60 };
const row = (over: Partial<DailyRow> = {}): DailyRow => ({
  id: "c1", name: "Data Engineer", clientName: "Acme", city: "Pune", ready: true, blocked: null, why: null,
  found: 112, waiting: 9, ownWatch: false, watch: null, closed: false, ...over,
});
const detail = (over: Partial<DailyDetail> = {}): DailyDetail => ({
  campaigns: [row({ id: "c1" }), row({ id: "c2", name: "HR Manager", clientName: "Globex", city: "Mumbai", found: 4, waiting: 2 })],
  mornings: [],
  room: { profilesLeft: 380, firstSearch: 20, approvals: 19 },
  drafts: "",
  defaults: DEFAULTS,
  admin: false,
  ...over,
});
const none: DailySearch | null = null;

const change = (over: Partial<DailySuggestion> = {}): DailySuggestion => ({
  id: "g1", campaignId: "c1", campaign: "Data Engineer", rule: "dry", lever: "filters", state: "open",
  headline: "Also look in Mumbai", why: "Nobody new in the last 3 mornings.", ...over,
});
const board = (over: Partial<DailyScoreboard> = {}): DailyScoreboard => ({
  suggested: 0, applied: 0, declined: 0, undone: 0, better: 0, same: 0, worse: 0, tooEarly: 0, ...over,
});
const on = (waiting: DailySuggestion[], scoreboard: DailyScoreboard): DailySuggestions => ({ on: true, waiting, scoreboard });

/** A search of all that holds the most it may (two, as the limit is set here) after a Save, with a third campaign that is ready and was left out. */
function fullSearch() {
  const watches = ["c1", "c2"].map((id): DailyWatch => ({ agentId: `w-${id}`, campaignId: id, name: id, state: "running", reason: null, found: 12, lastFound: 5, nextRunAt: null }));
  const s: DailySearch = { id: "s1", status: "on", scope: { all: true, except: [] }, runAt: "07:00", timezone: "Asia/Kolkata", repeat: "daily", perCampaign: 5, reserve: 100, waitingCap: 20, maxCampaigns: 2, pausedUntil: null, campaigns: watches };
  const rows = [
    row({ id: "c1", watch: watches[0] ?? null }),
    row({ id: "c2", name: "HR Manager", clientName: "Globex", city: "Mumbai", watch: watches[1] ?? null }),
    row({ id: "c3", name: "Backend Lead", clientName: "Initech", city: "Delhi" }),
  ];
  return { s, rows, defaults: { ...DEFAULTS, maxCampaigns: 2 } };
}

const noop = () => {};
const handlers = { onDraft: noop, onQuery: noop, onSwitch: noop, onRow: noop, onOther: noop, onSave: noop, onClose: noop };
function render(over: { suggestions?: DailySuggestions | null; held?: string; draft?: ReturnType<typeof view.draftOf>; detail?: DailyDetail; shows?: boolean; search?: DailySearch | null } = {}) {
  return renderToStaticMarkup(
    <DailySearchView
      search={over.search === undefined ? none : over.search}
      detail={over.detail ?? detail()}
      draft={over.draft ?? view.draftOf(none, DEFAULTS)}
      q=""
      busy=""
      problem=""
      others={[]}
      suggestions={over.suggestions ?? null}
      held={over.held ?? ""}
      now={NOW}
      {...(over.shows === false ? {} : { onShow: noop })}
      {...handlers}
    />,
  );
}

describe("the suggested changes in the popup", () => {
  it("lists each waiting change with its campaign, what it would change and why, and a Show me for it", () => {
    const html = render({ suggestions: on([change(), change({ id: "g2", campaignId: "c2", campaign: "HR Manager", headline: "Ask for Kafka", why: "3 of your last 3 rejections say Kafka was missing." })], board({ suggested: 2 })) });
    const said = text(html);
    expect(said).toContain("Suggested changes");
    expect(said).toContain("Data Engineer Also look in Mumbai Nobody new in the last 3 mornings.");
    expect(said).toContain("HR Manager Ask for Kafka 3 of your last 3 rejections say Kafka was missing.");
    expect(html.match(/>Show me<\/button>/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Show me the change suggested for Data Engineer"');
  });

  it("tells two campaigns of one name apart in the list, by client and city, in the row and in what the Show me button says, and gives a name of its own no extra line", () => {
    const twins = detail({
      campaigns: [
        row({ id: "c1", name: "Technical Consultant", clientName: "Acme", city: "Pune" }),
        row({ id: "c2", name: "Technical Consultant", clientName: "Globex", city: "Mumbai" }),
        row({ id: "c3", name: "Data Engineer", clientName: "Initech", city: "Delhi" }),
      ],
    });
    const html = render({
      detail: twins,
      suggestions: on(
        [
          change({ id: "g1", campaignId: "c1", campaign: "Technical Consultant", headline: "Also look in Mumbai" }),
          change({ id: "g2", campaignId: "c2", campaign: "Technical Consultant", headline: "Ask for Kafka", why: "3 of your last 3 rejections say Kafka was missing." }),
          change({ id: "g3", campaignId: "c3", campaign: "Data Engineer", headline: "Also look in Pune" }),
        ],
        board({ suggested: 3 }),
      ),
    });
    const said = text(html.slice(html.indexOf('aria-label="Suggested changes"')));
    expect(said).toContain("Technical Consultant Acme, Pune Also look in Mumbai");
    expect(said).toContain("Technical Consultant Globex, Mumbai Ask for Kafka");
    // (a campaign whose name is its own needs nothing more)
    expect(said).toContain("Data Engineer Also look in Pune");
    expect(html).toContain('aria-label="Show me the change suggested for Technical Consultant (Acme, Pune)"');
    expect(html).toContain('aria-label="Show me the change suggested for Technical Consultant (Globex, Mumbai)"');
    expect(html).toContain('aria-label="Show me the change suggested for Data Engineer"');
    // The same name with no client or city to say leaves nothing to add.
    expect(view.suggestionWhere("c1", [row({ id: "c1", name: "Analyst", clientName: null, city: null }), row({ id: "c2", name: "analyst " })])).toBe("");
    expect(view.suggestionWhere("c9", twins.campaigns)).toBe("");
  });

  it("says the scoreboard in two plain lines of counts, and leaves a zero out", () => {
    const html = render({ suggestions: on([], board({ suggested: 12, applied: 9, declined: 2, undone: 1, better: 4, worse: 1, tooEarly: 2 })) });
    const said = text(html);
    expect(said).toContain("Changes 12 suggested, 9 made, 2 declined, 1 undone");
    expect(said).toContain("How they did 4 better, 1 worse, 2 too early to say");
    // Nothing waiting, so no list, only the lines.
    expect(html).not.toContain(">Show me<");
    const few = text(render({ suggestions: on([], board({ suggested: 3, applied: 1, tooEarly: 1 })) }));
    expect(few).toContain("Changes 3 suggested, 1 made");
    expect(few).not.toMatch(/declined|undone|worse|better/);
    expect(few).toContain("How they did 1 too early to say");
  });

  it("gives no second line while no change has been made yet, and says so plainly when none was measured", () => {
    expect(view.scoreLines(board({ suggested: 4, declined: 4 }))).toEqual([{ label: "Changes", text: "4 suggested, 4 declined" }]);
    expect(view.scoreLines(board({ suggested: 2, applied: 2 }))[1]).toEqual({ label: "How they did", text: "Too early to say" });
  });

  it("says the changes measured as about the same, so 'How they did' is never 'too early' for changes that were measured, and the counts add up", () => {
    // The likeliest result: every change measured, none moved the numbers by enough to call.
    expect(view.scoreLines(board({ suggested: 3, applied: 3, same: 3 }))[1]).toEqual({ label: "How they did", text: "3 about the same" });
    expect(view.scoreLines(board({ suggested: 5, applied: 4, better: 1, same: 2, tooEarly: 1 }))[1]).toEqual({
      label: "How they did",
      text: "1 better, 2 about the same, 1 too early to say",
    });
    const said = text(render({ suggestions: on([], board({ suggested: 3, applied: 3, same: 3 })) }));
    expect(said).toContain("Changes 3 suggested, 3 made");
    expect(said).toContain("How they did 3 about the same");
    expect(said).not.toContain("Too early to say");
  });

  it("draws nothing while the server has the suggestions off or only watching, not even a frame or a coming-soon", () => {
    const base = text(render());
    for (const off of [
      { on: false, waiting: [], scoreboard: null },
      // The server sends nothing in a watching mode either; whatever came with it is not shown.
      { on: false, waiting: [change()], scoreboard: board({ suggested: 5 }) },
    ] as DailySuggestions[]) {
      const html = render({ suggestions: off });
      expect(text(html)).toBe(base);
      expect(html).not.toMatch(/Suggested changes|Show me|ds-score|soon/i);
    }
    expect(text(render({ suggestions: null }))).toBe(base);
  });

  it("draws nothing when the server has them on and nothing was ever suggested, rather than an empty frame", () => {
    const html = render({ suggestions: on([], board()) });
    expect(html).not.toContain("Suggested changes");
    expect(view.hasSuggestions(on([], board()))).toBe(false);
    expect(view.hasSuggestions(on([change()], board({ suggested: 1 })))).toBe(true);
    expect(view.hasSuggestions(on([], board({ suggested: 2, declined: 2 })))).toBe(true);
  });

  it("draws no dots, pills or marks, and none of the words the owner keeps out of the screen", () => {
    const html = render({ suggestions: on([change()], board({ suggested: 12, applied: 9, declined: 2, undone: 1, better: 4, worse: 1, tooEarly: 2 })) });
    expect(html).toContain('aria-label="Suggested changes"');
    const section = html.slice(html.indexOf('aria-label="Suggested changes"'));
    expect(section).toContain(">Show me<");
    expect(section).not.toMatch(/pill|badge|dot|chip|<svg/i);
    expect(text(section)).not.toMatch(/ · |—|–|…/);
    expect(text(section)).not.toMatch(/crustdata|provider|api\b|sweep|standing|playbook|tier|ledger|shadow/i);
  });
});

describe("the line after Save, and the most one search holds", () => {
  it("says how many ready campaigns the search could not hold, in one plain line, and nothing when it held them all", () => {
    expect(view.heldWords(12, 60)).toBe("12 campaigns are not in it yet: the daily limit is 60.");
    expect(view.heldWords(1, 60)).toBe("1 campaign is not in it yet: the daily limit is 60.");
    expect(view.heldWords(0, 60)).toBe("");
    const html = render({ held: view.heldWords(12, 60) });
    // In the foot beside Save, where the person is looking, not at the top of a list they may have scrolled past.
    const foot = html.slice(html.indexOf('<footer'));
    expect(foot).toContain('<span class="ds-spend" role="status">12 campaigns are not in it yet: the daily limit is 60.</span>');
    expect(render({ held: "" })).not.toContain('role="status"');
  });

  it("returns how many campaigns the save left out, from what the server answered", async () => {
    const calls = (started?: { held?: Array<{ id: string; name: string }> }) => ({
      save: vi.fn(async () => ({ search: null, ...(started ? { started } : {}) })),
      setClock: vi.fn(async () => ({ search: null })),
      setRoom: vi.fn(async () => ({ search: null })),
    });
    const draft = view.draftOf(none, DEFAULTS);
    const left = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, name: `Role ${i}` }));
    expect(await saveDraft(none, draft, [], calls({ held: left }))).toEqual({ how: "started", held: 40 });
    expect(await saveDraft(none, draft, [], calls({ held: [] }))).toEqual({ how: "started", held: 0 });
    // An answer with no list (an older server) leaves none out.
    expect(await saveDraft(none, draft, [], calls())).toEqual({ how: "started", held: 0 });
    // A change of the morning alone saves no campaigns, so it can leave none out.
    const s = { id: "s1", status: "on", scope: { campaignIds: ["c1"] }, runAt: "07:00", timezone: "Asia/Kolkata", repeat: "daily", perCampaign: 5, reserve: 100, waitingCap: 20, maxCampaigns: 8, pausedUntil: null, campaigns: [] } as DailySearch;
    expect(await saveDraft(s, { ...view.draftOf(s, DEFAULTS), runAt: "08:15" }, [], calls({ held: left }))).toEqual({ how: "saved", held: 0 });
  });

  it("tells a person who picks more than the limit by hand what to do, and holds Save back, instead of sending it to be refused", () => {
    expect(view.pickedWords(false, 72, 60)).toBe("72 campaigns: the daily limit is 60. Take 12 out to save.");
    expect(view.pickedWords(false, 61, 60)).toBe("61 campaigns: the daily limit is 60. Take 1 out to save.");
    // Up to the limit nothing changes, and a search of all is cut to it and says so (as before).
    expect(view.pickedWords(false, 60, 60)).toBe("60 campaigns");
    expect(view.pickedWords(true, 70, 60)).toBe("All open campaigns, 60 of the 70 ready ones (the most it holds)");
    expect(view.overLimit({ all: false, ids: new Set() }, 61, 60)).toBe(true);
    expect(view.overLimit({ all: false, ids: new Set() }, 60, 60)).toBe(false);
    expect(view.overLimit({ all: true, ids: new Set() }, 70, 60)).toBe(false);

    const rows = Array.from({ length: 62 }, (_, i) => row({ id: `m${i}`, name: `Role ${i}` }));
    const ids = rows.map((r) => r.id);
    const draft = { ...view.draftOf(none, DEFAULTS), sel: { all: false, ids: new Set(ids) } };
    const html = render({ detail: detail({ campaigns: rows }), draft });
    expect(text(html)).toContain("62 campaigns: the daily limit is 60. Take 2 out to save.");
    expect(html).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Start<\/button>/);
    // Sixty is saved as it is.
    const sixty = { ...draft, sel: { all: false, ids: new Set(ids.slice(0, 60)) } };
    expect(render({ detail: detail({ campaigns: rows }), draft: sixty })).toMatch(/<button type="submit" class="ct-btn is-primary">Start<\/button>/);
  });

  it("has nothing left to save once a Save has filled the search to its limit, and does not say the campaign it left out starts when you save", () => {
    const { s, rows, defaults } = fullSearch();
    const draft = view.draftOf(s, defaults);
    // Past the limit a Save only sends the same ask again, and the same campaign is held back again: that is no change.
    expect(view.changesOf(s, draft, rows, 2)).toEqual({ selection: false, clock: false, room: false, any: false });
    // With room for it the campaign is still one to save, as it was (and with no limit given, as before).
    expect(view.changesOf(s, draft, rows, 3)).toMatchObject({ selection: true, any: true });
    expect(view.changesOf(s, draft, rows)).toMatchObject({ selection: true, any: true });
    const html = render({ search: s, detail: detail({ campaigns: rows, defaults }), draft, held: view.heldWords(1, 2) });
    expect(html).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Save<\/button>/);
    expect(html).not.toContain("Starts when you save");
    expect(text(html.slice(html.indexOf("Backend Lead")))).toContain("Initech, Delhi · 112 found, 9 waiting · Over the daily limit");
  });

  it("sends a change of the morning alone as that change, not as a full save again, while the search holds the most it may", async () => {
    const { s, rows, defaults } = fullSearch();
    const draft = { ...view.draftOf(s, defaults), runAt: "08:15" };
    const calls = () => ({
      save: vi.fn(async () => ({ search: null })),
      setClock: vi.fn(async () => ({ search: null })),
      setRoom: vi.fn(async () => ({ search: null })),
    });
    const full = calls();
    expect(await saveDraft(s, draft, rows, full, 2)).toEqual({ how: "saved", held: 0 });
    expect(full.setClock).toHaveBeenCalledWith({ runAt: "08:15", repeat: "daily" });
    expect(full.save).not.toHaveBeenCalled();
    // With room for it, the same save still brings the ready campaign in.
    const room = calls();
    await saveDraft(s, draft, rows, room, 3);
    expect(room.save).toHaveBeenCalledTimes(1);
    expect(room.setClock).not.toHaveBeenCalled();
  });
});

/* ── the panel, run by hand: no DOM, so the hooks are a tiny runtime (as suggestNudge.test.tsx has) ── */

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
  return { get el() { return tree as unknown as El; } };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };

function open(suggestions: () => Promise<DailySuggestions>, save?: (body: unknown) => Promise<unknown>, read?: () => Promise<unknown>) {
  net.api.read = read ?? (async () => { net.reads += 1; return { on: true, search: null, detail: detail() }; });
  net.api.suggestions = async () => { net.suggestionReads += 1; return suggestions(); };
  net.api.others = async () => ({ on: true, searches: [] });
  net.api.save = save ?? (async (body) => { net.saves.push(body); return { search: null }; });
  const closed: string[] = [];
  const m = mount(DailySearchPanel, { onClose: () => { closed.push("closed"); } });
  return { m, closed };
}

beforeEach(() => {
  net.saves.length = 0;
  net.toasts.length = 0;
  net.reads = 0;
  net.suggestionReads = 0;
});

describe("the popup, as it opens and saves", () => {
  it("reads the suggestions once when it opens, and hands them to the popup with the way to show one", async () => {
    const got = on([change()], board({ suggested: 1 }));
    const { m } = open(async () => got);
    await settle();
    expect(net.suggestionReads).toBe(1);
    expect(m.el.type).toBe(DailySearchView);
    expect(m.el.props.suggestions).toEqual(got);
    expect(typeof m.el.props.onShow).toBe("function");
  });

  it("shows nothing and says nothing when the suggestions are off or cannot be read, and the popup is there all the same", async () => {
    for (const read of [async () => ({ on: false, waiting: [], scoreboard: null }) as DailySuggestions, async (): Promise<DailySuggestions> => { throw new Error("offline"); }]) {
      const { m } = open(read);
      await settle();
      expect(m.el.type).toBe(DailySearchView);
      const html = renderToStaticMarkup(<DailySearchView {...(m.el.props as Parameters<typeof DailySearchView>[0])} />);
      expect(html).not.toMatch(/Suggested changes|Show me|ds-score/);
      expect(m.el.props.problem).toBe("");
    }
  });

  it("puts the popup away and asks for the change to be shown in that campaign's chat when Show me is pressed", async () => {
    const { m, closed } = open(async () => on([change()], board({ suggested: 1 })));
    await settle();
    const heard: unknown[] = [];
    const listen = new EventTarget();
    vi.stubGlobal("window", listen);
    listen.addEventListener(SHOW_EVENT, (e) => heard.push((e as CustomEvent).detail));
    try {
      m.el.props.onShow(change());
    } finally {
      vi.unstubAllGlobals();
    }
    expect(closed).toEqual(["closed"]);
    expect(heard).toEqual([{ campaignId: "c1", campaignName: "Data Engineer" }]);
  });

  it("stays open after a Save that left campaigns out and says how many in one plain line, and closes after one that left none", async () => {
    const held = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, name: `Role ${i}` }));
    const left = open(async () => on([], board()), async (body) => { net.saves.push(body); return { started: { held }, search: null }; });
    await settle();
    left.m.el.props.onDraft({ ...left.m.el.props.draft, sel: view.allSet(left.m.el.props.draft.sel, true, []) });
    left.m.el.props.onSave();
    await settle();
    expect(net.saves).toHaveLength(1);
    expect(left.closed).toEqual([]);
    expect(left.m.el.props.held).toBe("40 campaigns are not in it yet: the daily limit is 60.");
    expect(net.toasts).toEqual(["Daily search started"]);
    expect(net.reads).toBeGreaterThan(1);

    const all = open(async () => on([], board()));
    await settle();
    all.m.el.props.onDraft({ ...all.m.el.props.draft, sel: view.allSet(all.m.el.props.draft.sel, true, []) });
    all.m.el.props.onSave();
    await settle();
    expect(all.closed).toEqual(["closed"]);
    expect(all.m.el.props.held).toBe("");
  });

  /** The popup after "All" was saved and the search could hold two of the three ready campaigns: it is read again as the server now has it. */
  async function afterHeldSave() {
    const { s, rows, defaults } = fullSearch();
    let saved = false;
    const first = { on: true, search: null, detail: detail({ campaigns: rows.map((r) => ({ ...r, watch: null })), defaults }) };
    const after = { on: true, search: s, detail: detail({ campaigns: rows, defaults }) };
    const o = open(
      async () => on([], board()),
      async (body) => { net.saves.push(body); saved = true; return { started: { held: [{ id: "c3", name: "Backend Lead" }] }, search: s }; },
      async () => (saved ? after : first),
    );
    await settle();
    o.m.el.props.onDraft({ ...o.m.el.props.draft, sel: view.allSet(o.m.el.props.draft.sel, true, []) });
    o.m.el.props.onSave();
    await settle();
    const shown = () => renderToStaticMarkup(<DailySearchView {...(o.m.el.props as Parameters<typeof DailySearchView>[0])} />);
    return { o, shown };
  }

  it("saves a change of the morning, after a Save that left campaigns out, as that change alone and not as the same full save again", async () => {
    const { o } = await afterHeldSave();
    const clocks: unknown[] = [];
    net.api.setClock = async (body) => { clocks.push(body); return { search: null }; };
    o.m.el.props.onDraft({ ...o.m.el.props.draft, runAt: "08:15" });
    o.m.el.props.onSave();
    await settle();
    expect(clocks).toEqual([{ runAt: "08:15", repeat: "daily" }]);
    // (the one full save is the first)
    expect(net.saves).toHaveLength(1);
    expect(o.closed).toEqual(["closed"]);
  });

  it("after a Save that left campaigns out, has nothing more to save and says Close, not Cancel, and puts the line away when the person changes the ticks", async () => {
    const { o, shown } = await afterHeldSave();
    expect(o.closed).toEqual([]);
    expect(o.m.el.props.held).toBe("1 campaign is not in it yet: the daily limit is 2.");
    // Read again as the server now has it: nothing to save, so nothing to cancel either.
    expect(shown()).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Save<\/button>/);
    expect(shown()).toContain(">Close</button>");
    expect(shown()).not.toContain(">Cancel</button>");
    // Unticking "All" and picking by hand asks for something else: the line about the last Save is not about that.
    o.m.el.props.onDraft({ ...o.m.el.props.draft, sel: view.allSet(o.m.el.props.draft.sel, false, ["c1", "c2", "c3"]) });
    expect(o.m.el.props.held).toBe("");
    expect(shown()).not.toContain("not in it yet");
    expect(shown()).toContain(">Cancel</button>");
  });
});

describe("the console's way from the popup to the agent", () => {
  it("sends the event the console listens for, with the campaign and its name, and nothing where there is no window", () => {
    const heard: unknown[] = [];
    const listen = new EventTarget();
    vi.stubGlobal("window", listen);
    listen.addEventListener(SHOW_EVENT, (e) => heard.push((e as CustomEvent).detail));
    try {
      askToShow({ campaignId: "c9", campaignName: "Backend Lead" });
      expect(heard).toEqual([{ campaignId: "c9", campaignName: "Backend Lead" }]);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(() => askToShow({ campaignId: "c9", campaignName: "Backend Lead" })).not.toThrow();
  });

  it("is heard by the console, which puts the same words the Sourced page sends in that campaign's chat and sends them", () => {
    const console_ = src("Console.tsx");
    expect(console_).toContain("window.addEventListener(SHOW_EVENT, show);");
    expect(console_).toContain("window.removeEventListener(SHOW_EVENT, show);");
    expect(console_).toContain("brief(showPhrase(campaignName), { send: true, campaignId });");
    expect(src("SuggestNudge.tsx")).toContain("onAgent(showPhrase(campaignName), { send: true })");
    expect(src("DailySearchDialog.tsx")).toContain("askToShow({ campaignId: s.campaignId, campaignName: s.campaign })");
  });

  it("follows the campaign before it sends, so the message goes with that campaign's id and not only its name in the words", () => {
    const console_ = src("Console.tsx");
    const at = console_.indexOf("const show = (e: Event)");
    expect(at).toBeGreaterThan(-1);
    const show = console_.slice(at);
    // The page follows to the campaign (as it does when the chat moves to one), then the words go: the message carries the page's campaign.
    expect(show.indexOf("focusCampaign(campaignId, campaignName);")).toBeGreaterThan(-1);
    expect(show.indexOf("focusCampaign(campaignId, campaignName);")).toBeLessThan(show.indexOf("brief(showPhrase(campaignName), { send: true, campaignId });"));
    expect(console_).toContain("}, [brief, focusCampaign]);");
    // (and it is made before the effect that uses it)
    expect(console_.indexOf("const focusCampaign = useCallback")).toBeLessThan(at);
  });

  it("reads the suggestions from the server's route for the whole search", () => {
    expect(src("api/dailySearch.ts")).toContain('"GET", "/v1/daily-search/suggestions"');
  });
});

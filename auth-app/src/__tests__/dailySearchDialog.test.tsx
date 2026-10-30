import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DailyMorning, DailyRow, DailySearch, DailyWatch, OtherSearch } from "../api/dailySearch";

/**
 * The Daily search popup (docs/plans/daily-search.md, Phase 2): which campaigns are ticked and what saving them says, where each
 * campaign stands in muted words, what the popup shows for a search that is on, paused or not there yet, what Save sends, the bell's
 * link that opens it, and the rail's one row for a whole search. The server's side (what it reads, who may pause whose) is
 * test/daily-search-dialog.test.ts there.
 */

vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), LIVE: true }));

const { DailySearchView } = await import("../DailySearchDialog");
const { saveDraft } = await import("../dailySearchSave");
const { wantsDailySearch, withoutDailySearch } = await import("../DailySearchButton");
const { DailyRailRow, statusLine } = await import("../WatchList");
const view = await import("../dailySearchView");
const { agentsView } = await import("../OverviewPanel");
const { metricsOf, progressOf, stepsOf } = await import("../liveAgents");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
/** A time on the local clock, so what is said does not depend on the machine's zone. */
const at = (day: number, h: number, mi = 0) => new Date(2026, 9, day, h, mi).toISOString();
const NOW = new Date(2026, 9, 29, 10, 0).getTime();

const watch = (over: Partial<DailyWatch> = {}): DailyWatch => ({
  agentId: "w1", campaignId: "c1", name: "Data Engineer", state: "running", reason: null, found: 12, lastFound: 5,
  nextRunAt: at(30, 7, 12), ...over,
});
const row = (over: Partial<DailyRow> = {}): DailyRow => ({
  id: "c1", name: "Data Engineer", clientName: "Acme", city: "Pune", ready: true, blocked: null, why: null,
  found: 112, waiting: 9, ownWatch: false, watch: null, closed: false, ...over,
});
const search = (over: Partial<DailySearch> = {}): DailySearch => ({
  id: "s1", status: "on", scope: { campaignIds: ["c1"] }, runAt: "07:00", timezone: "Asia/Kolkata", repeat: "daily",
  perCampaign: 5, reserve: 100, waitingCap: 20, maxCampaigns: 8, pausedUntil: null, campaigns: [watch()], ...over,
});
const DEFAULTS = { runAt: "07:00", repeat: "daily" as const, reserve: 100, waitingCap: 20, waitingResumeAt: 10, perCampaign: 5, perCampaignMax: 10, creditsPerProfile: 0.03, maxCampaigns: 60 };
const draftFor = (s: DailySearch | null) => view.draftOf(s, DEFAULTS);

describe("what is ticked", () => {
  it("reads a search that holds all as all with the few taken out, and a search of picks as the few", () => {
    const all = view.selectionOf(search({ scope: { all: true, except: ["c9"] } }));
    expect(all.all).toBe(true);
    expect(view.isPicked(all, "c1")).toBe(true);
    expect(view.isPicked(all, "c9")).toBe(false);
    const some = view.selectionOf(search({ scope: { campaignIds: ["c1", "c2"] } }));
    expect(some.all).toBe(false);
    expect(view.isPicked(some, "c2")).toBe(true);
    expect(view.isPicked(some, "c3")).toBe(false);
    // No search, or one that was turned off, starts with nothing ticked.
    expect(view.selectionOf(null)).toEqual({ all: false, ids: new Set() });
    expect(view.selectionOf(search({ status: "off" })).ids.size).toBe(0);
  });

  it("keeps what was ticked ticked, one by one, when 'All open campaigns' is unticked, and ticks everything again when it is ticked", () => {
    let sel = view.selectionOf(search({ scope: { all: true, except: ["c2"] } }));
    sel = view.allSet(sel, false, ["c1", "c2", "c3"]);
    expect(sel.all).toBe(false);
    expect([...sel.ids].sort()).toEqual(["c1", "c3"]);
    sel = view.toggled(sel, "c2");
    expect(view.isPicked(sel, "c2")).toBe(true);
    sel = view.allSet(sel, true, ["c1", "c2", "c3"]);
    expect(sel).toEqual({ all: true, ids: new Set() });
    // Taking one out of "all" is the exception the server keeps in its scope.
    expect(view.scopeOf(view.toggled(sel, "c3"))).toEqual({ all: true, except: ["c3"] });
    expect(view.scopeOf(view.selectionOf(search({ scope: { campaignIds: ["c1"] } })))).toEqual({ campaignIds: ["c1"] });
  });

  it("changes nothing until a tick, the time, the days or the room does; a search that is not there, or was turned off, is all new", () => {
    const s = search();
    const same = draftFor(s);
    expect(view.changesOf(s, same)).toEqual({ selection: false, clock: false, room: false, any: false });
    expect(view.changesOf(s, { ...same, sel: view.toggled(same.sel, "c2") })).toMatchObject({ selection: true, any: true });
    expect(view.changesOf(s, { ...same, runAt: "06:30" })).toMatchObject({ clock: true, selection: false });
    expect(view.changesOf(s, { ...same, repeat: "weekdays" })).toMatchObject({ clock: true });
    expect(view.changesOf(s, { ...same, reserve: 50 })).toMatchObject({ room: true, clock: false });
    expect(view.changesOf(s, { ...same, waitingCap: 12 })).toMatchObject({ room: true });
    expect(view.changesOf(null, draftFor(null))).toMatchObject({ any: true });
    expect(view.changesOf(search({ status: "off" }), same)).toMatchObject({ any: true });
    // With no search the popup shows what the server says a search is set to, not numbers of its own.
    expect(draftFor(null)).toMatchObject({ runAt: "07:00", repeat: "daily", reserve: 100, waitingCap: 20 });
  });

  it("carries how many new people a campaign gets a morning: the search's own, else the server's start, never above its ceiling", () => {
    expect(draftFor(null).perCampaign).toBe(5);
    expect(draftFor(search({ perCampaign: 8 })).perCampaign).toBe(8);
    // A search set higher before the server's ceiling was lowered is shown at the ceiling, and saving it brings it there.
    const lowered = view.draftOf(search({ perCampaign: 9 }), { ...DEFAULTS, perCampaignMax: 6 });
    expect(lowered.perCampaign).toBe(6);
    expect(view.changesOf(search({ perCampaign: 9 }), lowered)).toMatchObject({ room: true, any: true });
    // A change of the number alone is a change of the room, and the same number is no change.
    const s = search({ perCampaign: 5 });
    expect(view.changesOf(s, { ...draftFor(s), perCampaign: 8 })).toMatchObject({ room: true, clock: false, selection: false, any: true });
    expect(view.changesOf(s, draftFor(s))).toMatchObject({ room: false, any: false });
  });

  it("takes a whole number of people from one up to the server's ceiling, and no other", () => {
    expect(view.validPerCampaign(1, 10)).toBe(true);
    expect(view.validPerCampaign(10, 10)).toBe(true);
    for (const n of [0, 11, -1, 2.5, Number.NaN]) expect(view.validPerCampaign(n, 10)).toBe(false);
  });

  it("takes a clock time the server takes, and no other", () => {
    expect(view.validClock("7:00")).toBe("07:00");
    expect(view.validClock("07:05")).toBe("07:05");
    expect(view.validClock("24:00")).toBeNull();
    expect(view.validClock("7")).toBeNull();
    expect(view.validClock("")).toBeNull();
  });
});

describe("where a campaign stands, in words", () => {
  it("is on, resting, paused, stopped on a problem, closed, ready or blocked", () => {
    expect(view.stateOf(row({ watch: watch() }))).toBe("on");
    expect(view.stateOf(row({ watch: watch({ reason: "20 people are waiting for you." }) }))).toBe("resting");
    expect(view.stateOf(row({ watch: watch({ state: "paused" }) }))).toBe("paused");
    expect(view.stateOf(row({ watch: watch({ state: "error" }) }))).toBe("error");
    expect(view.stateOf(row({ watch: watch({ state: "paused" }), closed: true, ready: false }))).toBe("closed");
    expect(view.stateOf(row())).toBe("ready");
    expect(view.stateOf(row({ ready: false, blocked: "needs_city", why: "It needs a city, or to be marked remote." }))).toBe("blocked");
  });

  it("says where it is and how it is doing under the name, and why it rests in the server's own sentence", () => {
    const on = view.rowText(row({ watch: watch() }), { picked: true, searchStatus: "on", now: NOW });
    expect(on).toEqual({ line: "Acme, Pune · 112 found, 9 waiting · next tomorrow 7:12 am", note: null });
    const resting = view.rowText(row({ watch: watch({ reason: "20 people are waiting for you; I carry on when you get through them." }) }), { picked: true, searchStatus: "on", now: NOW });
    expect(resting.note).toBe("20 people are waiting for you; I carry on when you get through them.");
    expect(resting.line).not.toContain("next");
    const error = view.rowText(row({ watch: watch({ state: "error", reason: null }) }), { picked: true, searchStatus: "on", now: NOW });
    expect(error.note).toBe("It stopped on a problem.");
    const closed = view.rowText(row({ closed: true, ready: false, watch: watch({ state: "paused", reason: "The campaign isn't active." }) }), { picked: true, searchStatus: "on", now: NOW });
    expect(closed.note).toBe("The campaign isn't active.");
    // A campaign ticked and not in the search yet starts when saved; one with a watch of the person's own moves in.
    expect(view.rowText(row(), { picked: true, searchStatus: "on", now: NOW }).line).toContain("Starts when you save");
    expect(view.rowText(row(), { picked: false, searchStatus: "on", now: NOW }).line).not.toContain("Starts when you save");
    expect(view.rowText(row({ ownWatch: true }), { picked: false, searchStatus: "on", now: NOW }).line).toContain("Your watch on it moves in");
    expect(view.rowText(row({ found: 0, waiting: 0 }), { picked: false, searchStatus: null, now: NOW }).line).toBe("Acme, Pune · Nobody found yet");
  });

  it("does not repeat 'paused' on every campaign while the whole search is paused, but says what is its own", () => {
    const paused = row({ watch: watch({ state: "paused", reason: "The daily search is paused." }) });
    expect(view.rowText(paused, { picked: true, searchStatus: "paused", now: NOW }).note).toBeNull();
    const own = row({ watch: watch({ state: "paused", reason: "Paused by you." }) });
    expect(view.rowText(own, { picked: true, searchStatus: "on", now: NOW }).note).toBe("Paused by you.");
  });

  it("offers Pause on a campaign that is looking and Resume on one that is not, and neither while the search is paused or the campaign is closed", () => {
    expect(view.rowAction(row({ watch: watch() }), "on")).toBe("pause");
    expect(view.rowAction(row({ watch: watch({ state: "paused" }) }), "on")).toBe("resume");
    expect(view.rowAction(row({ watch: watch({ state: "error" }) }), "on")).toBe("resume");
    expect(view.rowAction(row({ watch: watch({ state: "paused" }) }), "paused")).toBeNull();
    expect(view.rowAction(row({ watch: watch(), closed: true }), "on")).toBeNull();
    expect(view.rowAction(row(), "on")).toBeNull();
  });

  it("lists the campaigns in the search first, the others that can join after, and keeps the ones that cannot be searched apart", () => {
    const rows = [
      row({ id: "a", name: "Ready A" }),
      row({ id: "b", name: "In B", watch: watch({ campaignId: "b" }) }),
      row({ id: "c", name: "Blocked C", ready: false, blocked: "needs_approval", why: "Its requirements are drafted and need approving." }),
    ];
    const { main, blocked } = view.splitRows(rows);
    expect(main.map((r) => r.id)).toEqual(["b", "a"]);
    expect(blocked.map((r) => r.id)).toEqual(["c"]);
    // The search box finds a campaign by name, client or city.
    expect(view.matches(row({ name: "Data Engineer", clientName: "Acme", city: "Pune" }), "acme")).toBe(true);
    expect(view.matches(row({ name: "Data Engineer", clientName: "Acme", city: "Pune" }), "pune")).toBe(true);
    expect(view.matches(row({ name: "Data Engineer", clientName: "Acme", city: "Pune" }), "mumbai")).toBe(false);
    expect(view.matches(row(), "  ")).toBe(true);
  });

  it("says times and days the way a person does", () => {
    expect(view.whenWords(at(29, 7, 12), NOW)).toBe("7:12 am");
    expect(view.whenWords(at(30, 7, 12), NOW)).toBe("tomorrow 7:12 am");
    expect(view.whenWords(at(31, 19, 5), NOW)).toBe("Sat 7:05 pm");
    expect(view.whenWords(at(29, 0, 5), NOW)).toBe("12:05 am");
    expect(view.whenWords(null, NOW)).toBe("");
    expect(view.runAtWords("07:00")).toBe("7:00 am");
    expect(view.runAtWords("19:30")).toBe("7:30 pm");
    expect(view.dayWords("2026-10-29", NOW)).toBe("Today");
    expect(view.dayWords("2026-10-28", NOW)).toBe("Yesterday");
    expect(view.dayWords("2026-10-26", NOW)).toBe("Mon 26 Oct");
    const m = (fresh: number, worth: number, campaigns: number): DailyMorning => ({ day: "2026-10-28", fresh, worth, campaigns });
    expect(view.morningLine(m(23, 11, 8))).toBe("23 new people, 11 worth a look, on 8 campaigns");
    expect(view.morningLine(m(1, 0, 1))).toBe("1 new person, on 1 campaign");
    expect(view.morningLine(m(0, 0, 0))).toBe("Nobody new");
  });
});

const detail = (over: Partial<import("../api/dailySearch").DailyDetail> = {}): import("../api/dailySearch").DailyDetail => ({
  campaigns: [
    row({ id: "c1", watch: watch() }),
    row({ id: "c2", name: "HR Manager", clientName: "Globex", city: "Mumbai", found: 4, waiting: 2 }),
    row({ id: "c3", name: "Backend Lead", ready: false, blocked: "needs_approval", why: "Its requirements are drafted and need approving.", found: null, waiting: null }),
    row({ id: "c4", name: "Sales Head", ready: false, blocked: "in_other_search", why: "It is in someone else's daily search.", found: null, waiting: null }),
  ],
  mornings: [
    { day: "2026-10-29", fresh: 23, worth: 11, campaigns: 8 },
    { day: "2026-10-28", fresh: 0, worth: 0, campaigns: 0 },
  ],
  room: { profilesLeft: 380, firstSearch: 20, approvals: 19 },
  drafts: "1 campaign has requirements drafted and waiting for you to approve. Approving each starts a first search of up to 20 people, and you have room for 19 today.",
  defaults: DEFAULTS,
  admin: false,
  ...over,
});
const noop = () => {};
const handlers = { onDraft: noop, onQuery: noop, onSwitch: noop, onRow: noop, onOther: noop, onSave: noop, onClose: noop };
function render(over: { search?: DailySearch | null; detail?: ReturnType<typeof detail>; q?: string; busy?: string; problem?: string; others?: OtherSearch[]; draft?: ReturnType<typeof draftFor> } = {}) {
  const s = over.search === undefined ? search() : over.search;
  return renderToStaticMarkup(
    <DailySearchView
      search={s}
      detail={over.detail ?? detail()}
      draft={over.draft ?? draftFor(s)}
      q={over.q ?? ""}
      busy={over.busy ?? ""}
      problem={over.problem ?? ""}
      others={over.others ?? []}
      now={NOW}
      {...handlers}
    />,
  );
}

describe("the number of new people on each campaign", () => {
  it("is a field beside the time and the days, bounded by the server's ceiling, and shows the search's own number", () => {
    const html = render({ search: search({ perCampaign: 8 }) });
    expect(html).toContain("New people on each campaign (up to 10)");
    expect(html).toMatch(/<input[^>]*type="number"[^>]*min="1"[^>]*max="10"[^>]*value="8"/);
    expect(html).toContain('aria-label="Each morning"');
  });

  it("says what Save would spend from the number typed, and holds Save for a number the server would turn down", () => {
    const s = search({ perCampaign: 5 });
    const typed = render({ search: s, draft: { ...draftFor(s), perCampaign: 8 } });
    expect(typed).toContain("Up to 8 new people");
    expect(typed).not.toMatch(/disabled="">Save<\/button>/);
    for (const n of [0, 11]) expect(render({ search: s, draft: { ...draftFor(s), perCampaign: n } })).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Save<\/button>/);
  });

  it("follows a lowered ceiling: the field's limit and the label say the server's number", () => {
    const html = render({ search: search({ perCampaign: 5 }), detail: detail({ defaults: { ...DEFAULTS, perCampaignMax: 6 } }) });
    expect(html).toContain("(up to 6)");
    expect(html).toMatch(/max="6"/);
  });

  it("holds to 5 when the server sends no ceiling (one from before 1.5.5), so the popup still saves", () => {
    const { perCampaignMax: _none, ...old } = DEFAULTS;
    expect(view.perCampaignMaxOf(undefined)).toBe(5);
    expect(view.perCampaignMaxOf(DEFAULTS.perCampaignMax)).toBe(10);
    expect(view.draftOf(search({ perCampaign: 5 }), old).perCampaign).toBe(5);
    const html = render({ search: search({ perCampaign: 5 }), detail: detail({ defaults: old }) });
    expect(html).toContain("(up to 5)");
    expect(html).toMatch(/max="5"/);
    // A number past what that server holds is held back, as it is for a ceiling the server names.
    const typed = render({ search: search({ perCampaign: 5 }), detail: detail({ defaults: old }), draft: { ...view.draftOf(search({ perCampaign: 5 }), old), perCampaign: 6 } });
    expect(typed).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Save<\/button>/);
    expect(view.validPerCampaign(5, view.perCampaignMaxOf(undefined))).toBe(true);
    expect(view.validPerCampaign(6, view.perCampaignMaxOf(undefined))).toBe(false);
  });
});

describe("the popup for a search that is on", () => {
  const html = render();

  it("shows the switch on with when it looks next, the morning and days, and the campaigns to tick with All on top", () => {
    expect(html).toContain("Daily search</h2>");
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain("Next look tomorrow 7:12 am.");
    expect(html).toMatch(/type="time"[^>]*value="07:00"/);
    expect(html).toContain('<option value="daily" selected="">Every day</option>');
    expect(html).toContain("Weekdays only");
    expect(html.indexOf("All open campaigns")).toBeLessThan(html.indexOf("Data Engineer"));
    // The ticked campaign is in the search; the other can join; each has its figures in muted words.
    expect(html).toContain("Acme, Pune · 112 found, 9 waiting · next tomorrow 7:12 am");
    expect(html).toContain("Globex, Mumbai · 4 found, 2 waiting");
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toMatch(/<input type="checkbox" checked=""[^>]*\/><span class="rl-pick-t"><b class="t-body-strong">Data Engineer/);
  });

  it("puts the campaigns that cannot be searched yet in a closed section with why and a link to their requirements", () => {
    expect(html).toMatch(/<details class="ds-blocked"><summary[^>]*>Can&#x27;t be searched yet/);
    expect(html).not.toMatch(/<details class="ds-blocked" open/);
    expect(html).toContain("Its requirements are drafted and need approving.");
    expect(html).toContain("It is in someone else&#x27;s daily search.");
    // The room to approve drafted campaigns in is said where they are.
    expect(html).toContain("you have room for 19 today.");
    // A link to the requirements for the campaign that needs approving; none for one that is in someone else's search.
    expect(html).toContain('<a class="hp-link ds-act" href="#/campaign?campaign=c3">Requirements</a>');
    expect(html).not.toContain("campaign=c4");
  });

  it("lists the last mornings, newest first, in words", () => {
    expect(html).toContain("Last mornings");
    expect(html.indexOf("Today")).toBeLessThan(html.indexOf("Yesterday"));
    expect(html).toContain("23 new people, 11 worth a look, on 8 campaigns");
    expect(html).toContain("Nobody new");
  });

  it("offers Pause on the campaign that is looking, and has Save wait until something changes", () => {
    expect(html).toContain('aria-label="Pause Data Engineer"');
    expect(html).not.toContain('aria-label="Resume HR Manager"');
    expect(html).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Save<\/button>/);
    expect(html).toContain('<p class="t-body-sm">1 campaign<span class="ds-spend">Up to 5 new people every morning, about 0.2 credits a day.');
    // A tick enables it.
    const d = draftFor(search());
    const ticked = render({ draft: { ...d, sel: view.toggled(d.sel, "c2") } });
    expect(ticked).toMatch(/<button type="submit" class="ct-btn is-primary">Save<\/button>/);
    expect(ticked).toContain('<p class="t-body-sm">2 campaigns<span class="ds-spend">Up to 5 new people on each campaign every morning, 10 a day in all, about 0.3 credits a day.');
    expect(ticked).toContain("Starts when you save");
  });

  it("draws no dots, pills or badges: how a campaign stands is words", () => {
    expect(html).not.toMatch(/class="[^"]*(dot|pill|badge|chip|tag)\b/);
    const css = src("dailySearch.css");
    expect(css).not.toMatch(/border-radius: *(99|50%)/);
    expect(css).not.toMatch(/font-size/);
    expect(css).not.toMatch(/\.ds-[a-z-]*(dot|pill|badge)/);
  });

  it("says why the last change did not go through, where the person is looking", () => {
    expect(render({ problem: "That's a lot of changes to the daily search in an hour. Try again a little later." })).toContain(
      'role="alert">That&#x27;s a lot of changes to the daily search in an hour. Try again a little later.',
    );
  });
});

describe("the popup in its other states", () => {
  it("gives a search box above eight campaigns and not up to eight", () => {
    const many = (n: number) => detail({ campaigns: Array.from({ length: n }, (_, i) => row({ id: `m${i}`, name: `Role ${i}` })) });
    expect(render({ search: null, detail: many(9) })).toContain('type="search"');
    expect(render({ search: null, detail: many(8) })).not.toContain('type="search"');
    expect(view.SEARCH_ABOVE).toBe(8);
    // A search that finds nothing says so.
    expect(render({ search: null, detail: many(9), q: "zzz" })).toContain("No campaign matches that.");
  });

  it("shows a paused search as Paused with the switch off, and offers no Pause or Resume on its campaigns", () => {
    const paused = search({ status: "paused", campaigns: [watch({ state: "paused", reason: "The daily search is paused." })] });
    const html = render({ search: paused, detail: detail({ campaigns: [row({ id: "c1", watch: paused.campaigns[0] ?? null }), row({ id: "c2" })] }) });
    expect(html).toContain('role="switch" aria-checked="false"');
    expect(html).toContain("Nothing is searched until you turn it on.");
    expect(html).not.toContain('aria-label="Pause ');
    expect(html).not.toContain('aria-label="Resume ');
    expect(html).not.toContain("The daily search is paused.");
    const until = render({ search: { ...paused, pausedUntil: at(31, 7, 0) }, detail: detail({ campaigns: [row({ id: "c1", watch: paused.campaigns[0] ?? null })] }) });
    expect(until).toContain("It turns on again Sat 7:00 am.");
  });

  it("shows resting campaigns with their reason and a Resume on one a person paused", () => {
    const rest = watch({ reason: "I leave 100 of each day's searches for yours, so I carry on tomorrow." });
    const own = watch({ agentId: "w2", campaignId: "c2", state: "paused", reason: "Paused by you." });
    const html = render({
      search: search({ campaigns: [rest, own] }),
      detail: detail({ campaigns: [row({ id: "c1", watch: rest }), row({ id: "c2", name: "HR Manager", watch: own })] }),
    });
    expect(html).toContain("I leave 100 of each day&#x27;s searches for yours, so I carry on tomorrow.");
    expect(html).toContain("Paused by you.");
    expect(html).toContain('aria-label="Resume HR Manager"');
    expect(html).toContain('aria-label="Pause Data Engineer"');
  });

  it("starts a search that is not there yet: no switch, Start instead of Save, and nothing to start until a campaign is picked", () => {
    const none = render({ search: null });
    expect(none).not.toContain('role="switch"');
    expect(none).toContain("Pick at least one campaign");
    expect(none).toMatch(/<button type="submit" class="ct-btn is-primary" disabled="">Start<\/button>/);
    const d = draftFor(null);
    const picked = render({ search: null, draft: { ...d, sel: view.toggled(d.sel, "c2") } });
    expect(picked).toMatch(/<button type="submit" class="ct-btn is-primary">Start<\/button>/);
    // "All open campaigns" says how many are ready now.
    expect(render({ search: null, draft: { ...d, sel: view.allSet(d.sel, true, []) } })).toContain("All open campaigns, 2 campaigns ready now");
  });

  it("lists other people's searches to an owner or admin with Pause, or Resume for one that is paused, and to nobody else", () => {
    const others: OtherSearch[] = [
      { id: "o1", owner: "Ravi Iyer", status: "on", runAt: "07:00", repeat: "daily", campaigns: 5, resting: 1, nextRunAt: at(30, 7, 0), lastBriefAt: null },
      { id: "o2", owner: "Asha Nair", status: "paused", runAt: "07:00", repeat: "daily", campaigns: 2, resting: 0, nextRunAt: null, lastBriefAt: null },
    ];
    const html = render({ detail: detail({ admin: true }), others });
    expect(html).toContain("Other people&#x27;s daily searches");
    expect(html).toContain("Ravi Iyer");
    expect(html).toContain("5 campaigns · next tomorrow 7:00 am · 1 resting");
    expect(html).toContain('aria-label="Pause Ravi Iyer&#x27;s daily search"');
    expect(html).toContain("2 campaigns · paused");
    expect(html).toContain('aria-label="Resume Asha Nair&#x27;s daily search"');
    expect(render({ detail: detail({ admin: false }), others: [] })).not.toContain("Other people");
  });
});

describe("what Save sends", () => {
  const calls = () => {
    const log: string[] = [];
    return {
      log,
      api: {
        save: vi.fn(async (b: unknown) => { log.push(`save ${JSON.stringify(b)}`); return { search: null }; }),
        pause: vi.fn(async () => { log.push("pause"); return { paused: 1 }; }),
        setClock: vi.fn(async (b: unknown) => { log.push(`clock ${JSON.stringify(b)}`); return { search: null }; }),
        setRoom: vi.fn(async (b: unknown) => { log.push(`room ${JSON.stringify(b)}`); return { search: null }; }),
      },
    };
  };

  it("starts a search with one save that carries the campaigns picked, the morning and the room", async () => {
    const c = calls();
    const d = draftFor(null);
    const out = await saveDraft(null, { ...d, sel: view.toggled(view.toggled(d.sel, "c1"), "c2"), runAt: "6:30", repeat: "weekdays" }, [], c.api);
    expect(out).toEqual({ how: "started", held: 0 });
    expect(c.log).toEqual([
      `save ${JSON.stringify({ scope: { campaignIds: ["c1", "c2"] }, mode: "replace", runAt: "06:30", repeat: "weekdays", reserve: 100, waitingCap: 20, perCampaign: 5 })}`,
    ]);
  });

  it("sends the number of people a campaign gets: with the campaigns when they change, with the room when only it does", async () => {
    const s = search();
    const c = calls();
    await saveDraft(s, { ...draftFor(s), perCampaign: 8 }, [], c.api);
    expect(c.log).toEqual([`room ${JSON.stringify({ reserve: 100, waitingCap: 20, perCampaign: 8 })}`]);
    const c2 = calls();
    const d = draftFor(s);
    await saveDraft(s, { ...d, sel: view.toggled(d.sel, "c2"), perCampaign: 7 }, [], c2.api);
    expect(JSON.parse(c2.log[0]?.replace(/^save /, "") ?? "{}")).toMatchObject({ perCampaign: 7 });
  });

  it("changes the morning alone, or the room alone, without touching which campaigns it holds", async () => {
    const s = search();
    const c = calls();
    expect(await saveDraft(s, { ...draftFor(s), runAt: "08:15" }, [], c.api)).toEqual({ how: "saved", held: 0 });
    await saveDraft(s, { ...draftFor(s), reserve: 60, waitingCap: 8 }, [], c.api);
    expect(c.log).toEqual([`clock ${JSON.stringify({ runAt: "08:15", repeat: "daily" })}`, `room ${JSON.stringify({ reserve: 60, waitingCap: 8, perCampaign: 5 })}`]);
    expect(c.api.save).not.toHaveBeenCalled();
  });

  it("keeps a paused search paused with the one save that carries the campaigns and the time, and never turns it on to pause it again", async () => {
    const s = search({ status: "paused", pausedUntil: at(31, 7, 0) });
    const c = calls();
    const d = draftFor(s);
    await saveDraft(s, { ...d, sel: view.toggled(d.sel, "c2"), runAt: "15:00" }, [], c.api);
    // One call, asked to keep it paused (the server keeps the end of its pause); the pause is not a second call.
    expect(c.log).toEqual([`save ${JSON.stringify({ scope: { campaignIds: ["c1", "c2"] }, mode: "replace", runAt: "15:00", repeat: "daily", reserve: 100, waitingCap: 20, perCampaign: 5, keepPaused: true })}`]);
    expect(c.api.pause).not.toHaveBeenCalled();
    // A search that is on is not asked to be kept paused.
    const c2 = calls();
    await saveDraft(search(), { ...draftFor(search()), sel: view.toggled(draftFor(search()).sel, "c2") }, [], c2.api);
    expect(c2.log.join()).not.toContain("keepPaused");
    expect(c2.api.pause).not.toHaveBeenCalled();
  });

  it("brings in a ready campaign that is ticked under a search of all but is not in the search yet, though the ticks themselves did not change", async () => {
    // A search of all that was said yes to for one campaign: another became ready since, and shows ticked.
    const s = search({ scope: { all: true, except: [] } });
    const rows = [row({ id: "c1", watch: watch() }), row({ id: "c2", name: "HR Manager" })];
    expect(view.changesOf(s, draftFor(s))).toMatchObject({ selection: false, any: false });
    expect(view.changesOf(s, draftFor(s), rows)).toMatchObject({ selection: true, any: true });
    // Not for one that cannot be searched, or that was taken out.
    expect(view.changesOf(s, draftFor(s), [row({ id: "c3", ready: false, blocked: "needs_city" })]).any).toBe(false);
    expect(view.changesOf(search({ scope: { all: true, except: ["c2"] } }), draftFor(search({ scope: { all: true, except: ["c2"] } })), rows).any).toBe(false);
    const c = calls();
    await saveDraft(s, draftFor(s), rows, c.api);
    expect(c.log).toEqual([`save ${JSON.stringify({ scope: { all: true, except: [] }, mode: "replace", runAt: "07:00", repeat: "daily", reserve: 100, waitingCap: 20, perCampaign: 5 })}`]);
    // The popup enables Save for it.
    expect(render({ search: s, detail: detail({ campaigns: rows }) })).toMatch(/<button type="submit" class="ct-btn is-primary">Save<\/button>/);
  });

  it("sends nothing for a time that is not a clock time", async () => {
    const c = calls();
    await expect(saveDraft(null, { ...draftFor(null), runAt: "seven" }, [], c.api)).rejects.toThrow("Say the time as a clock time");
    expect(c.log).toEqual([]);
  });
});

describe("what a yes spends, said beside Save", () => {
  const spend = { perCampaign: 5, creditsPerProfile: 0.03, reserve: 100, repeat: "daily" as const };

  it("says the people on each campaign, what that is a day in all and in credits, and what the person's own searches keep", () => {
    expect(view.spendWords(8, spend)).toBe("Up to 5 new people on each campaign every morning, 40 a day in all, about 1.2 credits a day. Your own searches keep 100 of each day's searches.");
    expect(view.spendWords(50, spend)).toBe("Up to 5 new people on each campaign every morning, 250 a day in all, about 7.5 credits a day. Your own searches keep 100 of each day's searches.");
    expect(view.spendWords(1, spend)).toBe("Up to 5 new people every morning, about 0.2 credits a day. Your own searches keep 100 of each day's searches.");
    expect(view.spendWords(20, { ...spend, repeat: "weekdays", reserve: 60 })).toContain("every weekday morning, 100 a day in all, about 3 credits a day. Your own searches keep 60 ");
    // The server's own rounding of the card's figure ("about 1.2 credits a day for 8 campaigns").
    expect(view.spendWords(8, spend)).toContain("about 1.2 credits");
  });

  it("is in the popup beside Start and Save, counted for the campaigns ticked, and follows the room the person sets", () => {
    const many = detail({ campaigns: Array.from({ length: 12 }, (_, i) => row({ id: `m${i}`, name: `Role ${i}` })) });
    const all = { ...draftFor(null), sel: view.allSet(draftFor(null).sel, true, []) };
    const html = render({ search: null, detail: many, draft: all });
    expect(html).toContain("All open campaigns, 12 campaigns ready now");
    expect(html).toContain("Up to 5 new people on each campaign every morning, 60 a day in all, about 1.8 credits a day. Your own searches keep 100 of each day&#x27;s searches.");
    expect(render({ search: null, detail: many, draft: { ...all, reserve: 40, repeat: "weekdays" } })).toContain("every weekday morning, 60 a day in all, about 1.8 credits a day. Your own searches keep 40 ");
    // Nothing is said of a spend while nothing is picked.
    expect(render({ search: null, detail: many })).not.toContain("ds-spend");
  });

  it("counts no more than the most a search holds, and says so", () => {
    expect(view.pickedWords(true, 8, 60)).toBe("All open campaigns, 8 campaigns ready now");
    expect(view.pickedWords(true, 1, 60)).toBe("All open campaigns, 1 campaign ready now");
    expect(view.pickedWords(true, 70, 60)).toBe("All open campaigns, 60 of the 70 ready ones (the most it holds)");
    expect(view.pickedWords(false, 3, 60)).toBe("3 campaigns");
    expect(view.pickedWords(false, 0, 60)).toBe("Pick at least one campaign");
    const seventy = detail({ campaigns: Array.from({ length: 70 }, (_, i) => row({ id: `m${i}`, name: `Role ${i}` })) });
    const all = { ...draftFor(null), sel: view.allSet(draftFor(null).sel, true, []) };
    const html = render({ search: null, detail: seventy, draft: all });
    expect(html).toContain("All open campaigns, 60 of the 70 ready ones (the most it holds)");
    // 60 campaigns are paid for, not 70.
    expect(html).toContain("300 a day in all, about 9 credits a day");
  });

  it("does not promise that campaigns approved later join by themselves: the search holds what it was said yes to until it is saved again", () => {
    const html = render({ search: null });
    expect(html).toContain("Every campaign that can be searched now. One whose requirements are approved later joins when you save again.");
    expect(html).not.toContain("and new ones as their requirements are approved");
    // What the server does: a search of all stops at the ready campaigns it was saved with, and a later one is brought in by Save.
    const s = search({ scope: { all: true, except: [] } });
    const later = [row({ id: "c1", watch: watch() }), row({ id: "c2", name: "HR Manager" })];
    expect(view.changesOf(s, draftFor(s), later).selection).toBe(true);
    expect(view.rowText(later[1] as DailyRow, { picked: true, searchStatus: "on", now: NOW }).line).toContain("Starts when you save");
  });

  it("says when today's room is smaller than the first looks a save sets off, and nothing when they fit or none are sent off", () => {
    const first = { perCampaign: 5, reserve: 100 };
    expect(view.firstLooksWords(8, { ...first, profilesLeft: 380 })).toBe("");
    expect(view.firstLooksWords(12, { ...first, profilesLeft: 150 })).toBe("Today has room for about 10 of the 12 first looks, and the others wait for tomorrow morning.");
    expect(view.firstLooksWords(3, { ...first, profilesLeft: 100 })).toBe("Today's room is used up, so the first looks wait for tomorrow morning.");
    expect(view.firstLooksWords(0, { ...first, profilesLeft: 0 })).toBe("");
    // Said in the popup, from the room the server read.
    const three = detail({ campaigns: [row({ id: "a" }), row({ id: "b", name: "B" }), row({ id: "c", name: "C" })], room: { profilesLeft: 110, firstSearch: 20, approvals: 5 } });
    const all = { ...draftFor(null), sel: view.allSet(draftFor(null).sel, true, []) };
    expect(render({ search: null, detail: three, draft: all })).toContain("Today has room for about 2 of the 3 first looks, and the others wait for tomorrow morning.");
    expect(render({ search: null, detail: detail({ campaigns: three.campaigns }), draft: all })).not.toContain("first looks");
  });

  it("counts the campaigns a save sends off to look: the ticked ones that are ready and not in the search, within what it holds, and none into a paused search", () => {
    const rows = [row({ id: "c1", watch: watch() }), row({ id: "c2", name: "B" }), row({ id: "c3", name: "C" }), row({ id: "c4", name: "D", ready: false, blocked: "needs_city", why: "It needs a city, or to be marked remote." })];
    const sel = view.allSet(draftFor(null).sel, true, []);
    expect(view.startingNow(null, sel, rows, 60)).toBe(2);
    expect(view.startingNow(search(), sel, rows, 60)).toBe(2);
    expect(view.startingNow(search({ status: "paused" }), sel, rows, 60)).toBe(0);
    expect(view.startingNow(search({ status: "off" }), sel, rows, 60)).toBe(2);
    expect(view.startingNow(null, view.toggled({ all: false, ids: new Set() }, "c2"), rows, 60)).toBe(1);
    expect(view.startingNow(search({ campaigns: Array.from({ length: 59 }, () => watch()) }), sel, rows, 60)).toBe(1);
  });

  it("says a campaign ticked into a paused search joins when it is saved, and starts when it is on", () => {
    const paused = search({ status: "paused" });
    const c2 = row({ id: "c2", name: "HR Manager" });
    expect(view.rowText(c2, { picked: true, searchStatus: "paused", now: NOW }).line).toContain("Joins when you save");
    expect(view.rowText(c2, { picked: true, searchStatus: "on", now: NOW }).line).toContain("Starts when you save");
    const d = draftFor(paused);
    const html = render({ search: paused, draft: { ...d, sel: view.toggled(d.sel, "c2") } });
    expect(html).toContain("Joins when you save");
    expect(html).not.toContain("Starts when you save");
    expect(html).not.toContain("first looks");
  });
});

describe("how the popup is reached", () => {
  it("opens from the bell's link and takes the ask off the address so a reload does not open it again", () => {
    // The server writes this link on its bell rows (modules/sourcing/sweep.ts DAILY_SEARCH_LINK).
    expect(wantsDailySearch("#/campaigns?daily-search=open")).toBe(true);
    expect(wantsDailySearch("#/campaigns?x=1&daily-search=open")).toBe(true);
    expect(wantsDailySearch("#/campaigns")).toBe(false);
    expect(wantsDailySearch("#/campaigns?daily-search=openish")).toBe(false);
    expect(withoutDailySearch("#/campaigns?daily-search=open")).toBe("#/campaigns");
    expect(withoutDailySearch("#/campaigns?x=1&daily-search=open")).toBe("#/campaigns?x=1");
  });

  it("is on the Campaigns page's button and on the rail's row, with the same popup", () => {
    expect(src("DailySearchButton.tsx")).toContain("<DailySearchDialog open={open} onClose={() => setOpen(false)} />");
    expect(src("DailySearchButton.tsx")).toContain('window.addEventListener("hashchange", look)');
    expect(src("WatchList.tsx")).toContain("<DailySearchDialog open={manage} onClose={() => setManage(false)} />");
    expect(src("WatchList.tsx")).toContain("onManage={() => setManage(true)}");
  });

  it("changes a campaign's pause or resume through the watch's own controls, and the popup's Save through the daily search's", () => {
    const panel = src("DailySearchDialog.tsx");
    expect(panel).toContain("await controlAgent(row.watch.agentId, action)");
    expect(panel).toContain("dailySearchApi.steer(o.id, action)");
    expect(src("api/dailySearch.ts")).toContain('"PUT", "/v1/daily-search"');
    expect(src("api/dailySearch.ts")).toContain("`/v1/daily-search/${id}`");
  });
});

describe("the rail's one row", () => {
  const standing = (i: number, over: Record<string, unknown> = {}) => ({
    id: `w${i}`, state: "running", stateReason: null, nextRunAt: at(30, 7, 12 + (i % 30)), startedBy: "u1",
    config: { standing: { sweepId: "s1" } }, ...over,
  });

  it("folds fifty watches of a daily search into one group, and leaves a watch with an end out of it", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => standing(i));
    const classic = { id: "x", state: "running", stateReason: null, nextRunAt: null, config: { stop: { profiles: 30 } } };
    const groups = view.standingGroups([...fifty, classic]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.watches).toHaveLength(50);
    expect(view.isStandingWatch(classic)).toBe(false);
    // Two searches (an admin sees a teammate's) are two groups.
    expect(view.standingGroups([standing(1), standing(2, { config: { standing: { sweepId: "s2" } } })])).toHaveLength(2);
  });

  it("says how many campaigns, when it looks next, how many rest or need a look, and when all of it is paused", () => {
    const eight = Array.from({ length: 8 }, (_, i) => standing(i, i < 2 ? { stateReason: "Resting" } : {}));
    expect(view.railLine(eight, NOW)).toBe("8 campaigns · next tomorrow 7:12 am · 2 resting");
    expect(view.railLine([standing(1, { state: "error" }), standing(2)], NOW)).toBe("2 campaigns · next tomorrow 7:14 am · 1 needs a look");
    expect(view.railLine(eight.map((w) => ({ ...w, state: "paused" })), NOW)).toBe("8 campaigns · paused");
    expect(view.railLine([standing(1)], NOW)).toBe("1 campaign · next tomorrow 7:13 am");
  });

  it("draws as Daily search with its line and Manage, as a teammate's for an admin, and with no Manage for someone who may not", () => {
    const eight = Array.from({ length: 8 }, (_, i) => standing(i));
    const mine = renderToStaticMarkup(<DailyRailRow watches={eight} mine mayManage now={NOW} onManage={noop} />);
    expect(mine).toBe(
      '<li class="wl-item"><span class="wl-name">Daily search</span><span class="wl-line">8 campaigns · next tomorrow 7:12 am</span><span class="wl-acts"><button type="button" class="lt-link">Manage</button></span></li>',
    );
    expect(renderToStaticMarkup(<DailyRailRow watches={eight} mine={false} mayManage now={NOW} onManage={noop} />)).toContain("A teammate&#x27;s daily search");
    expect(renderToStaticMarkup(<DailyRailRow watches={eight} mine={false} mayManage={false} now={NOW} onManage={noop} />)).not.toContain("Manage");
    // The rail lists them as one row and the rest as before.
    const list = src("WatchList.tsx");
    expect(list).toContain("const groups = standingGroups(watches ?? []);");
    expect(list).toContain("const own = (watches ?? []).filter((w) => !isStandingWatch(w));");
  });
});

describe("a watch with no end", () => {
  it("is read without a stop anywhere it is shown", () => {
    const base = { state: "running" as const, stateReason: null, counters: { found: 4 }, nextRunAt: null };
    expect(statusLine({ ...base, config: {} }, NOW)).toBe("Keeping an eye out · 4 found");
    expect(statusLine({ ...base, config: { stop: null } }, NOW)).toBe("Keeping an eye out · 4 found");
    expect(statusLine({ ...base, config: { stop: {} } }, NOW)).toBe("Keeping an eye out · 4 found");
    const agent = { state: "running" as const, config: { cadence: "daily" as const, standing: { sweepId: "s1", perDay: 5 } }, counters: { found: 4 }, startedAt: at(20, 7) };
    expect(stepsOf(agent)).toEqual(["Started", "Looking for people", "Looks again every morning"]);
    expect(progressOf(agent, NOW)).toBe(0);
    expect(metricsOf(agent, null, NOW)).toEqual([{ label: "found", n: 4, d: 0 }]);
    const campaignAgents = {
      sourcing: { state: "watching", run: null, lastRunAt: null, watch: { id: "w", summary: "", stop: null, found: 3, nextRunAt: null, paused: false, reason: null } },
      outreach: { state: "idle", waiting: 0, sending: 0 },
      status: "active", approvedSpec: true,
    } as unknown as Parameters<typeof agentsView>[0];
    expect(agentsView(campaignAgents).sourcing.line).toBe("Keeping watch, 3 found so far");
  });
});

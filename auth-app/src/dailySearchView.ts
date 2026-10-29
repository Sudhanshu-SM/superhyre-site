import type {
  DailyMorning,
  DailyRepeat,
  DailyRow,
  DailyScoreboard,
  DailyScope,
  DailySearch,
  DailySuggestions,
  OtherSearch,
} from "./api/dailySearch";

/**
 * The Daily search dialog and the rail's one row for it, as plain functions: which campaigns are ticked and what saving them says,
 * where each campaign stands in words, the last mornings, and how many watches fold into one line. No React, so the rules are tested
 * on their own. The words are the server's where it has them (a campaign's reason for resting is a sentence it wrote).
 */

/* ── what is ticked ── */

/**
 * `all`: every campaign that can be searched and the ones that become ready later, and `ids` is the few taken out. Otherwise `ids` is
 * the few picked. The same two shapes the server stores (`scope`).
 */
export type Selection = { all: boolean; ids: ReadonlySet<string> };

export function selectionOf(search: DailySearch | null): Selection {
  if (!search || search.status === "off") return { all: false, ids: new Set() };
  return "all" in search.scope
    ? { all: true, ids: new Set(search.scope.except) }
    : { all: false, ids: new Set(search.scope.campaignIds) };
}

export const isPicked = (sel: Selection, id: string): boolean => (sel.all ? !sel.ids.has(id) : sel.ids.has(id));

/** One campaign ticked or unticked. */
export function toggled(sel: Selection, id: string): Selection {
  const ids = new Set(sel.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { all: sel.all, ids };
}

/** "All open campaigns" ticked (nothing taken out) or unticked (what was ticked stays ticked, one by one). */
export function allSet(sel: Selection, on: boolean, pickable: readonly string[]): Selection {
  return on
    ? { all: true, ids: new Set() }
    : { all: false, ids: new Set(pickable.filter((id) => isPicked(sel, id))) };
}

export function scopeOf(sel: Selection): DailyScope {
  return sel.all ? { all: true, except: [...sel.ids] } : { campaignIds: [...sel.ids] };
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return a.all === b.all && a.ids.size === b.ids.size && [...a.ids].every((id) => b.ids.has(id));
}

/** How many campaigns are ticked, of the ones that can be. */
export const pickedCount = (sel: Selection, pickable: readonly string[]): number =>
  pickable.filter((id) => isPicked(sel, id)).length;

/* ── what is set ── */

/** What a person has typed into the dialog: the ticks, the morning and the room. */
export type Draft = {
  sel: Selection;
  /** "07:00". */
  runAt: string;
  repeat: DailyRepeat;
  reserve: number;
  waitingCap: number;
};

export type Defaults = { runAt: string; repeat: DailyRepeat; reserve: number; waitingCap: number };

export function draftOf(search: DailySearch | null, defaults: Defaults): Draft {
  const live = search && search.status !== "off" ? search : null;
  return {
    sel: selectionOf(search),
    runAt: live?.runAt ?? defaults.runAt,
    repeat: live?.repeat ?? defaults.repeat,
    reserve: live?.reserve ?? defaults.reserve,
    waitingCap: live?.waitingCap ?? defaults.waitingCap,
  };
}

/** Whether the search already holds the most campaigns one search may (`cap`): another cannot join until one is taken out. */
export const atLimit = (search: DailySearch | null, cap: number): boolean =>
  search !== null && search.status !== "off" && search.campaigns.length >= cap;

/**
 * What Save would change, against the search as it stands. A search that is not there (or was turned off) is all new. A campaign that is
 * ticked, ready and not in the search yet (a search of "all" that has stopped short of the ones that became ready since) is a change too:
 * saving is what brings it in. Not once the search holds the most it may (`cap`): a Save then leaves it out again, so there is nothing
 * to save, and a change of the morning alone is just that.
 */
export function changesOf(
  search: DailySearch | null,
  draft: Draft,
  rows: readonly DailyRow[] = [],
  cap: number = Number.POSITIVE_INFINITY,
): { selection: boolean; clock: boolean; room: boolean; any: boolean } {
  if (!search || search.status === "off") return { selection: true, clock: true, room: true, any: true };
  const joining = !atLimit(search, cap) && rows.some((r) => r.ready && !r.watch && isPicked(draft.sel, r.id));
  const selection = joining || !sameSelection(selectionOf(search), draft.sel);
  const clock = search.runAt !== draft.runAt || search.repeat !== draft.repeat;
  const room = search.reserve !== draft.reserve || search.waitingCap !== draft.waitingCap;
  return { selection, clock, room, any: selection || clock || room };
}

/** A clock time the server takes ("7:00" or "07:00"), or null. */
export const validClock = (text: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
};

/* ── what a yes spends ── */

/**
 * The count under the list. A search of "all" holds the campaigns that are ready now, and no more than `cap` of them: past that it says
 * so. (A campaign that becomes ready later is not held until the person saves again, which the "All open campaigns" row says.)
 */
export function pickedWords(all: boolean, n: number, cap: number): string {
  const count = (k: number) => `${k} ${plural(k, "campaign", "campaigns")}`;
  // Picked by hand past the most one search holds: the server would refuse it, so it is said as what to do instead.
  if (!all && n > cap) return `${count(n)}: the daily limit is ${cap}. Take ${n - cap} out to save.`;
  if (!all) return n === 0 ? "Pick at least one campaign" : count(n);
  return n > cap ? `All open campaigns, ${cap} of the ${n} ready ones (the most it holds)` : `All open campaigns, ${count(n)} ready now`;
}

/**
 * What Save spends, in the card's own words: up to `perCampaign` new people on each campaign every morning, what that is in all and in
 * credits, and what the person's own searches keep. Saving is the yes to this, so it is said beside the button.
 */
export function spendWords(
  campaigns: number,
  o: { perCampaign: number; creditsPerProfile: number; reserve: number; repeat: DailyRepeat },
): string {
  const morning = o.repeat === "weekdays" ? "weekday morning" : "morning";
  const credits = Math.round(campaigns * o.perCampaign * o.creditsPerProfile * 10) / 10;
  const each =
    campaigns === 1
      ? `Up to ${o.perCampaign} new people every ${morning}`
      : `Up to ${o.perCampaign} new people on each campaign every ${morning}, ${campaigns * o.perCampaign} a day in all`;
  return `${each}, about ${credits} ${credits === 1 ? "credit" : "credits"} a day. Your own searches keep ${o.reserve} of each day's searches.`;
}

/** Campaigns picked one by one past the most one search holds (a search of "all" is cut to it instead, and says so). */
export const overLimit = (sel: Selection, picked: number, cap: number): boolean => !sel.all && picked > cap;

/** The line after Save for the ready campaigns the search could not hold, or nothing when it held them all. */
export function heldWords(n: number, cap: number): string {
  if (n <= 0) return "";
  return `${n} ${plural(n, "campaign is", "campaigns are")} not in it yet: the daily limit is ${cap}.`;
}

/** How many campaigns Save sends off to look at once: the ticked ones that are ready and not in the search yet, within what it holds. None while it is paused. */
export function startingNow(
  search: DailySearch | null,
  sel: Selection,
  rows: readonly DailyRow[],
  cap: number,
): number {
  if (search?.status === "paused") return 0;
  const held = search && search.status !== "off" ? search.campaigns.length : 0;
  const joining = rows.filter((r) => r.ready && !r.watch && isPicked(sel, r.id)).length;
  return Math.min(joining, Math.max(0, cap - held));
}

/** What the day has room for of those first looks, when it is less than all of them (a campaign that does not fit waits for tomorrow's morning). Empty otherwise. */
export function firstLooksWords(
  starting: number,
  o: { perCampaign: number; reserve: number; profilesLeft: number },
): string {
  const fits = Math.floor(Math.max(0, o.profilesLeft - o.reserve) / o.perCampaign);
  if (starting <= fits) return "";
  return fits === 0
    ? "Today's room is used up, so the first looks wait for tomorrow morning."
    : `Today has room for about ${fits} of the ${starting} first looks, and the others wait for tomorrow morning.`;
}

/* ── where a campaign stands ── */

export type RowState = "on" | "resting" | "paused" | "error" | "closed" | "ready" | "blocked";

/** The campaign's place: in the search and looking, resting (with its reason), paused, stopped on a problem; or out of it and ready, or blocked. */
export function stateOf(row: DailyRow): RowState {
  if (row.closed) return "closed";
  const w = row.watch;
  if (w) {
    if (w.state === "error") return "error";
    if (w.state === "paused" || w.state === "waiting") return "paused";
    return w.reason ? "resting" : "on";
  }
  return row.ready ? "ready" : "blocked";
}

/** A campaign can be ticked when it is in the search or can join it. */
export const pickable = (row: DailyRow): boolean => row.watch !== null || row.ready;

/** The campaigns shown as a list to tick, and those that cannot be searched yet (shown apart, with why). In-search ones come first. */
export function splitRows(rows: readonly DailyRow[]): { main: DailyRow[]; blocked: DailyRow[] } {
  const main = rows.filter(pickable).sort((a, b) => Number(b.watch !== null) - Number(a.watch !== null));
  return { main, blocked: rows.filter((r) => !pickable(r)) };
}

/** A search box over the list: name, client or city. */
export function matches(row: DailyRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.name, row.clientName, row.city].some((v) => (v ?? "").toLowerCase().includes(needle));
}

/** The searches above this many campaigns get a box to search them. */
export const SEARCH_ABOVE = 8;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const startOfDay = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "7:12 am" for a time of day. */
export function clockWords(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "07:00" as "7:00 am". */
export function runAtWords(runAt: string): string {
  const ok = validClock(runAt);
  if (!ok) return runAt;
  const [h, mi] = ok.split(":").map(Number);
  return clockWords(new Date(2000, 0, 1, h ?? 0, mi ?? 0));
}

/** When something happens next, the way a person says it: "7:12 am" today, "tomorrow 7:12 am", "Mon 7:12 am". Empty when there is no time. */
export function whenWords(iso: string | null | undefined, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(t)) return "";
  const clock = clockWords(new Date(t));
  const days = Math.round((startOfDay(t) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return clock;
  if (days === 1) return `tomorrow ${clock}`;
  const d = new Date(t);
  return days < 7 ? `${WEEKDAYS[d.getDay()]} ${clock}` : `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock}`;
}

/** A local day ("2026-10-29") as "Today", "Yesterday" or "Tue 27 Oct". */
export function dayWords(day: string, now: number = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const ago = Math.round((startOfDay(now) - d.getTime()) / 86_400_000);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What a morning added: "23 new people, 11 worth a look, on 8 campaigns", or "Nobody new". */
export function morningLine(m: Pick<DailyMorning, "fresh" | "worth" | "campaigns">): string {
  if (m.fresh <= 0) return "Nobody new";
  const worth = m.worth > 0 ? `, ${m.worth} worth a look` : "";
  return `${m.fresh} new ${plural(m.fresh, "person", "people")}${worth}, on ${m.campaigns} ${plural(m.campaigns, "campaign", "campaigns")}`;
}

/** "112 found, 9 waiting": the campaign's own figures. Empty when they were not read. */
export function countsWords(row: Pick<DailyRow, "found" | "waiting">): string {
  if (row.found === null) return "";
  if (row.found === 0) return "Nobody found yet";
  return `${row.found} found, ${row.waiting ?? 0} waiting`;
}

/**
 * The two muted lines under a campaign's name: where it is and how it is doing, then (when there is one) why it rests or is paused.
 * Plain words, no marks: the campaign's own sentence for its reason is shown as the server wrote it.
 */
export function rowText(
  row: DailyRow,
  options: { picked: boolean; searchStatus: DailySearch["status"] | null; over?: boolean; now?: number },
): { line: string; note: string | null } {
  const state = stateOf(row);
  const where = [row.clientName, row.city].filter(Boolean).join(", ");
  const counts = countsWords(row);
  const next = state === "on" ? whenWords(row.watch?.nextRunAt, options.now) : "";
  const parts = [where, counts, next ? `next ${next}` : ""];
  // A ticked campaign that is not in the search yet starts when the person saves; into a paused search it only joins, and looks once that is on.
  // When the search holds the most it may (`over`), a save leaves it out again, and it says so.
  if ((state === "ready" || state === "blocked") && options.picked && options.searchStatus && options.searchStatus !== "off") {
    parts.push(options.over ? "Over the daily limit" : options.searchStatus === "paused" ? "Joins when you save" : "Starts when you save");
  }
  if (state === "ready" && row.ownWatch) parts.push("Your watch on it moves in");
  const reason = row.watch?.reason?.trim() ?? "";
  const note =
    state === "resting"
      ? reason
      : state === "paused"
        ? // While the whole search is paused every campaign says so in the switch above: its own reason is only worth reading when it is its own.
          options.searchStatus === "paused"
          ? null
          : reason || null
        : state === "error"
          ? reason || "It stopped on a problem."
          : state === "closed"
            ? reason || "The campaign isn't active."
            : null;
  return { line: parts.filter(Boolean).join(" · "), note };
}

/** What Pause or Resume does on a campaign's row, or nothing: not while the whole search is paused (its switch brings them all back), not on a closed one. */
export function rowAction(row: DailyRow, searchStatus: DailySearch["status"] | null): "pause" | "resume" | null {
  if (!row.watch || row.closed || searchStatus !== "on") return null;
  return row.watch.state === "running" ? "pause" : "resume";
}

/* ── what the search suggests ── */

/**
 * Whether the popup says anything of suggestions. Not while the server has them off or only watching (`on: false`: nothing is drawn, not
 * even a frame), and not before anything was ever suggested.
 */
export function hasSuggestions(s: DailySuggestions | null | undefined): s is DailySuggestions {
  return Boolean(s?.on) && ((s?.waiting.length ?? 0) > 0 || (s?.scoreboard?.suggested ?? 0) > 0);
}

/**
 * Where a suggestion's campaign is ("Acme, Pune"), for telling two campaigns of one name apart (two "Technical Consultant" roles for
 * different clients). Said only when another campaign in the list has the same name, as the agent's own questions do; the route names
 * the campaign by its name alone, and the list holds the client and city by id. Empty when it needs nothing more or says nothing.
 */
export function suggestionWhere(campaignId: string, rows: readonly DailyRow[]): string {
  const row = rows.find((r) => r.id === campaignId);
  if (!row) return "";
  const alike = (name: string) => name.trim().toLowerCase() === row.name.trim().toLowerCase();
  if (!rows.some((r) => r.id !== row.id && alike(r.name))) return "";
  return [row.clientName, row.city].filter(Boolean).join(", ");
}

/**
 * The scoreboard as two plain lines of counts, the go or no-go of the learning loop: what became of the suggestions, then how the changes
 * that were made did on the searches after. A count of nothing is left out, and the second line waits for the first change made.
 */
export function scoreLines(sb: DailyScoreboard): Array<{ label: string; text: string }> {
  const say = (parts: ReadonlyArray<readonly [number, string]>) =>
    parts.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`).join(", ");
  const lines = [
    { label: "Changes", text: say([[sb.suggested, "suggested"], [sb.applied, "made"], [sb.declined, "declined"], [sb.undone, "undone"]]) },
  ];
  if (sb.applied > 0) {
    lines.push({
      label: "How they did",
      text: say([[sb.better, "better"], [sb.same, "about the same"], [sb.worse, "worse"], [sb.tooEarly, "too early to say"]]) || "Too early to say",
    });
  }
  return lines;
}

/* ── the rail's one row ── */

type Standing = {
  id: string;
  state: string;
  stateReason: string | null;
  nextRunAt: string | null;
  startedBy?: string | null;
  /** A watch of a daily search has `standing` and an empty `stop`; one with an end has a `stop` and no `standing`. */
  config?: { standing?: { sweepId: string } | null; stop?: unknown } | null;
};

/** A watch of a daily search (its config carries `standing`). */
export const isStandingWatch = (w: Pick<Standing, "config">): boolean => Boolean(w.config?.standing);

/** The watches of daily searches, one group for each search. */
export function standingGroups<T extends Standing>(watches: readonly T[]): Array<{ sweepId: string; watches: T[] }> {
  const by = new Map<string, T[]>();
  for (const w of watches) {
    const id = w.config?.standing?.sweepId;
    if (id) by.set(id, [...(by.get(id) ?? []), w]);
  }
  return [...by].map(([sweepId, group]) => ({ sweepId, watches: group }));
}

/** "8 campaigns · next 7:12 am · 2 resting": one line for all the campaigns of a daily search. */
export function railLine(group: readonly Standing[], now: number = Date.now()): string {
  const n = group.length;
  const count = `${n} ${plural(n, "campaign", "campaigns")}`;
  const running = group.filter((w) => w.state === "running");
  if (!running.length) {
    const errors = group.filter((w) => w.state === "error").length;
    return [count, errors ? `${errors} need a look` : "paused"].join(" · ");
  }
  const times = running.flatMap((w) => (w.nextRunAt ? [Date.parse(w.nextRunAt)] : [])).filter(Number.isFinite);
  const next = times.length ? whenWords(new Date(Math.min(...times)).toISOString(), now) : "";
  const resting = running.filter((w) => w.stateReason).length;
  const errors = group.filter((w) => w.state === "error").length;
  return [
    count,
    next ? `next ${next}` : "",
    resting ? `${resting} resting` : "",
    errors ? `${errors} ${plural(errors, "needs", "need")} a look` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Another person's search in a line: "5 campaigns · next tomorrow 7:00 am", or "5 campaigns · paused". */
export function otherLine(s: Pick<OtherSearch, "status" | "campaigns" | "resting" | "nextRunAt">, now: number = Date.now()): string {
  const count = `${s.campaigns} ${plural(s.campaigns, "campaign", "campaigns")}`;
  if (s.status === "paused") return `${count} · paused`;
  const next = whenWords(s.nextRunAt, now);
  return [count, next ? `next ${next}` : "", s.resting ? `${s.resting} resting` : ""].filter(Boolean).join(" · ");
}

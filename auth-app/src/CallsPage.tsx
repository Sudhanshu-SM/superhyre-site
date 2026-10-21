import { ArrowRight, CaretRight, MagnifyingGlass, PhoneCall, X } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CallFilters, CallOutcome, CallRow } from "./api/calls";
import { CallLine, Lit } from "./CallLine";
import { CallSheet } from "./CallSheet";
import { CallsModal } from "./CallsModal";
import type { ModalGroup } from "./CallsModal";
import type { Ctx } from "./CampaignWorkspace";
import { CampaignHeader } from "./CampaignWorkspace";
import { can, type Standing, standingOf } from "./can";
import { visibleCampaigns, useSession } from "./roleStore";
import { useCampaignRows } from "./campaignStore";
import {
  arrowsStepRows, BAND_LABEL, bandOf, byCaller, callCount, callerChoices, campaignInitials, connectedPercent, connectedShare, glanceOf,
  groupKey, GROUP_ROWS, lengthLabel, OUTCOME_FILTERS, openGroups, RANGE_LABEL, rangeOf, readRemembered, seesEveryone, stepIndex,
  subtitleOf, summaryLine, whenLabel, writeRemembered,
} from "./callsView";
import type { CallerChoice, CallsTotals, RangePreset } from "./callsView";
import { FilterChips } from "./components/FilterChips";
import type { FilterChip } from "./components/FilterChips";
import { Pager } from "./components/Pager";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { hasDeepLink, loadSection, settledOffset, take } from "./sectionState";
import { PAGE_FALLBACK, PAGE_MAX, PAGE_MIN, PAGER_FOOT, usePageSize } from "./usePageSize";
import { useStuckBar } from "./useStuckBar";
import { KlGroupsGhost, KlRowsGhost, PagerSlot } from "./klGhosts";
import { EmptyArt } from "./EmptyArt";
import { listEmptyArt } from "./emptyStates";
import { LoadFailed } from "./ui";
import { useCalls, visibleRows } from "./useCalls";
import "./calls.css";

/**
 * Calls, by campaign. There are two places and they are for different people:
 *
 *   - the top-level Calls (`CallsPage`): everyone's calls, for the organisation's owner and admins and the one person
 *     of a personal workspace (`can(standing, "calls.all")`);
 *   - a campaign's own Calls (`CampaignCalls`): that campaign's calls, scoped by the server to the person's own for
 *     a recruiter, and the only place a recruiter has calls.
 *
 * Each campaign is a group that opens like a drop-down; a row is the time, who, how it went, how long and one
 * line of what it was about, and a click opens the call in a sheet on the right. The same view, with one campaign
 * fixed, is a campaign's own Calls page.
 */

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/* ═════════════════════════ the list ═════════════════════════ */

export type ToolbarProps = {
  q: string;
  onQ: (v: string) => void;
  outcome: CallOutcome | "";
  onOutcome: (v: CallOutcome | "") => void;
  preset: RangePreset;
  onPreset: (v: RangePreset) => void;
  custom: { from: string; to: string };
  onCustom: (fn: (c: { from: string; to: string }) => { from: string; to: string }) => void;
  caller: string;
  onCaller: (v: string) => void;
  callers: CallerChoice[];
  /** An owner or admin can pick a caller; nobody else is offered one. */
  showCaller: boolean;
  /** The pager, at the right end of the bar (the bar is what stays in view while the list scrolls). */
  pager?: ReactNode;
};

/** Search, outcome, dates and (for an owner or admin) caller; and the pager, when the list has more than a page. */
export function CallsToolbar(p: ToolbarProps) {
  const bar = useStuckBar<HTMLDivElement>();
  return (
    <div ref={bar} className="kl-bar" role="search">
      <label className="kl-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input
          type="search"
          value={p.q}
          onChange={(e) => p.onQ(e.target.value)}
          placeholder="Search by name, campaign, note or what was said"
          aria-label="Search calls"
        />
        {p.q && (
          <button type="button" className="kl-search-x" onClick={() => p.onQ("")} aria-label="Clear search"><X size={11} weight="bold" /></button>
        )}
      </label>
      <label className="kl-pick">
        <span className="sr-only">Outcome</span>
        <select value={p.outcome} onChange={(e) => p.onOutcome(e.target.value as CallOutcome | "")} aria-label="Outcome">
          <option value="">All outcomes</option>
          {OUTCOME_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="kl-pick">
        <span className="sr-only">Date</span>
        <select value={p.preset} onChange={(e) => p.onPreset(e.target.value as RangePreset)} aria-label="Date range">
          {(Object.keys(RANGE_LABEL) as RangePreset[]).map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
        </select>
      </label>
      {p.preset === "custom" && (
        <span className="kl-dates">
          <input type="date" value={p.custom.from} max={p.custom.to || undefined} onChange={(e) => p.onCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
          <span className="kl-quiet" aria-hidden="true">to</span>
          <input type="date" value={p.custom.to} min={p.custom.from || undefined} onChange={(e) => p.onCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
        </span>
      )}
      {p.showCaller && p.callers.length > 1 && (
        <label className="kl-pick">
          <span className="sr-only">Caller</span>
          <select value={p.caller} onChange={(e) => p.onCaller(e.target.value)} aria-label="Caller">
            {p.callers.map((c) => <option key={c.value || "all"} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      )}
      {p.pager}
    </div>
  );
}



/* Where the person left this list in this tab. A word, an outcome, a date range or a page this list cannot have falls
   back to the top; a caller nobody is among is dropped once the callers are in. */
type Remembered = { q: string; outcome: CallOutcome | ""; preset: RangePreset; custom: { from: string; to: string }; caller: string; offset: number; size: number };
const NOTHING: Remembered = { q: "", outcome: "", preset: "any", custom: { from: "", to: "" }, caller: "", offset: 0, size: PAGE_FALLBACK };
const DAY = /^\d{4}-\d\d-\d\d$/;
export function readListRemembered(r: Record<string, unknown>): Remembered {
  const custom = take.rec(r.custom);
  const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : "");
  return {
    q: take.str(r.q, "", 100),
    outcome: take.oneOf(r.outcome, ["", ...OUTCOME_FILTERS.map((o) => o.value)] as const, ""),
    preset: take.oneOf(r.preset, Object.keys(RANGE_LABEL) as RangePreset[], "any"),
    custom: { from: day(custom.from), to: day(custom.to) },
    caller: take.str(r.caller, "", 80),
    offset: take.int(r.offset, 0, 0, 100_000),
    size: take.int(r.size, PAGE_FALLBACK, PAGE_MIN, PAGE_MAX),
  };
}

function CallsList({ campaignId, standing, onTotals }: {
  campaignId?: string | undefined;
  standing: Standing;
  /** The page header's figures: how many calls, across how many campaigns, and how many of them connected. */
  onTotals?: ((t: CallsTotals | null) => void) | undefined;
}) {
  const session = useSession();
  const userId = session.userId;
  const section = campaignId ? `calls:${campaignId}` : "calls";
  const [deep] = useState(() => hasDeepLink());
  const [start] = useState<Remembered>(() => (deep ? NOTHING : loadSection(section, readListRemembered, NOTHING)));
  const [q, setQ] = useState(start.q);
  const [outcome, setOutcome] = useState<CallOutcome | "">(start.outcome);
  const [preset, setPreset] = useState<RangePreset>(start.preset);
  const [custom, setCustom] = useState<{ from: string; to: string }>(start.custom);
  const [caller, setCaller] = useState(start.caller);
  const dq = useDebounced(q.trim(), 250);

  const range = preset === "custom" ? { from: custom.from || undefined, to: custom.to || undefined } : rangeOf(preset);
  const filters: CallFilters = useMemo(
    () => ({
      q: dq || undefined,
      outcome: outcome || undefined,
      from: range.from,
      to: range.to,
      callerId: caller || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dq, outcome, range.from, range.to, caller],
  );
  const narrowed = Boolean(dq || outcome || range.from || range.to || caller);

  // Which groups are open: what this person chose before, else the most recent.
  const [remembered, setRemembered] = useState(() => readRemembered(storage(), userId));
  useEffect(() => { setRemembered(readRemembered(storage(), userId)); }, [userId]);
  const [seen, setSeen] = useState<readonly string[]>([]);

  const flat = campaignId !== undefined;
  const [openSet, setOpenSet] = useState<ReadonlySet<string>>(new Set());
  /* The page belongs to the filters it was chosen in: another word, outcome, date or caller is page 1 again. A
     campaign's own page pages its calls; the top-level list pages its campaigns. */
  const viewKey = JSON.stringify(filters);
  const [paged, setPaged] = useState<{ key: string; offset: number }>({ key: viewKey, offset: start.offset });
  const wanted = paged.key === viewKey ? paged.offset : 0;
  /* As many lines (or campaigns) as fit under the list's top; a remembered offset lands on the page that holds its first row. */
  const size = usePageSize(flat ? 59 : 80, { fallback: start.size, rowSelector: flat ? ".kl-row" : undefined, gap: 1, reserve: 40 + PAGER_FOOT });
  const data = useCalls({ campaignId, filters, open: openSet, offset: flat ? wanted : 0, pageSize: size });
  const liveGroups = useMemo(() => data.groups.filter((g) => g.count > 0), [data.groups]);
  const ownTotal = flat && data.phase === "ready" ? data.groups[0]?.count ?? 0 : null;
  const listTotal = flat ? ownTotal : data.phase === "ready" ? liveGroups.length : null;
  /* A remembered page is held inside the list only once the list's total is known: before that it is left exactly as it was. */
  const { offset, fix } = settledOffset(wanted, listTotal, size);
  useEffect(() => { if (fix !== null) setPaged({ key: viewKey, offset: fix }); }, [fix, viewKey]);
  const pageGroups = useMemo(() => (flat ? data.groups : liveGroups.slice(offset, offset + size)), [flat, data.groups, liveGroups, offset]);
  const pageKeys = useMemo(() => new Set(pageGroups.map(groupKey)), [pageGroups]);
  const opened = useMemo(() => openGroups(data.groups, remembered), [data.groups, remembered]);
  /* While searching, every group that has something to show is open, so the matches are in view; closing one
     is for this search only and is not remembered. */
  const searching = Boolean(dq) && !flat;
  const [searchShut, setSearchShut] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setSearchShut(new Set()); }, [dq]);
  const shown = useMemo(
    () => (searching ? Object.fromEntries(data.groups.map((g) => [groupKey(g), !searchShut.has(groupKey(g))])) : opened),
    [searching, data.groups, searchShut, opened],
  );
  useEffect(() => {
    // Only the campaigns on this page have their calls read.
    const next = new Set(Object.entries(shown).filter(([k, v]) => v && (flat || pageKeys.has(k))).map(([k]) => k));
    setOpenSet((cur) => (cur.size === next.size && [...next].every((k) => cur.has(k)) ? cur : next));
  }, [shown, pageKeys, flat]);
  useEffect(() => { setSeen(data.groups.map(groupKey)); }, [data.groups]);

  const toggle = (key: string) => {
    if (searching) {
      setSearchShut((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
      return;
    }
    const next = { ...remembered, ...Object.fromEntries(seen.map((k) => [k, opened[k] ?? false])), [key]: !(opened[key] ?? false) };
    setRemembered(next);
    writeRemembered(storage(), userId, next);
  };

  // The call that is open, and the keyboard.
  const [openId, setOpenId] = useState<string | null>(null);
  /* A call opened from the "all calls" dialog is not one of the lines on the page: it is kept here for the sheet. */
  const [apartRow, setApartRow] = useState<CallRow | null>(null);
  const [all, setAll] = useState<ModalGroup | null>(null);
  /* A call opened from the dialog: where the dialog was (its words and filter, the call), so closing the sheet
     brings it back there rather than dropping the person on the page. */
  const [back, setBack] = useState<{ group: ModalGroup; q: string; outcome: CallOutcome | ""; id: string } | null>(null);
  const view = useRef<{ q: string; outcome: CallOutcome | "" }>({ q: "", outcome: "" });
  const rows = useMemo(() => visibleRows(data, openSet, flat, flat ? undefined : GROUP_ROWS), [data, openSet, flat]);
  const openRow = openId ? rows.find((r) => r.id === openId) ?? (apartRow?.id === openId ? apartRow : null) : null;
  const lastOpened = useRef<CallRow | null>(null);
  if (openRow) lastOpened.current = openRow;
  const campaignRows = useCampaignRows();
  const campaigns = useMemo(
    () => visibleCampaigns(campaignRows, session).map((r) => ({ id: r.id, name: r.name })),
    [campaignRows, session],
  );

  const list = useRef<HTMLDivElement>(null);
  const focusRow = useCallback((id: string) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-kl-row="${CSS.escape(id)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      // The "all calls" dialog walks its own lines.
      if (t?.closest(".klm")) return;
      // Typing and picking from a list keep their arrow keys; the open call's sheet does not, so a call that was
      // opened (by click or Enter) can be followed by the next one without going back to a row first.
      if (!arrowsStepRows(t)) return;
      if (rows.length === 0) return;
      // A call opened from the "all calls" dialog is not one of these lines: the arrows have nowhere to step from.
      if (openId && apartRow?.id === openId && !rows.some((r) => r.id === openId)) return;
      const focused = t?.closest<HTMLElement>("[data-kl-row]")?.dataset.klRow;
      const at = rows.findIndex((r) => r.id === (focused ?? openId));
      const next = rows[stepIndex(at, e.key === "ArrowDown" ? 1 : -1, rows.length)];
      if (!next) return;
      e.preventDefault();
      // Focus stays in the sheet when the key came from there; only the row it follows is brought into view.
      if (t?.closest(".kl-sheet")) {
        list.current?.querySelector<HTMLElement>(`[data-kl-row="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
      } else {
        focusRow(next.id);
      }
      // With a call open, the sheet follows: moving down the list is reading the calls in turn.
      if (openId) setOpenId(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, openId, apartRow, focusRow]);

  const callerOptions = callerChoices(data.callers, userId);
  /* A remembered caller who has no calls here (or is not in this workspace) is not a filter to keep. */
  useEffect(() => {
    if (data.phase === "ready" && caller && data.canSeeEveryone && !data.callers.some((c) => c.id === caller)) setCaller("");
  }, [data.phase, data.canSeeEveryone, data.callers, caller]);
  useSectionSave(section, { q, outcome, preset, custom, caller, offset, size }, data.phase === "ready");
  useScrollMemory(section, data.phase === "ready", !deep);
  const everyone = data.canSeeEveryone || seesEveryone(standing);
  const showCallerCol = everyone;

  const clear = () => { setQ(""); setOutcome(""); setPreset("any"); setCustom({ from: "", to: "" }); setCaller(""); };
  /* What is narrowing the list, in the list's own words, so a filter that came back from the last visit is never invisible. */
  const chips: FilterChip[] = [];
  if (dq) chips.push({ key: "q", label: `“${dq}”`, onClear: () => setQ("") });
  if (outcome) chips.push({ key: "outcome", label: OUTCOME_FILTERS.find((o) => o.value === outcome)?.label ?? outcome, onClear: () => setOutcome("") });
  if (preset !== "any") chips.push({ key: "date", label: preset === "custom" ? [custom.from, custom.to].filter(Boolean).join(" to ") || RANGE_LABEL.custom : RANGE_LABEL[preset], onClear: () => { setPreset("any"); setCustom({ from: "", to: "" }); } });
  if (caller) chips.push({ key: "caller", label: callerOptions.find((o) => o.value === caller)?.label ?? "A teammate", onClear: () => setCaller("") });

  const own = flat ? data.groups[0] : undefined;
  const glance = glanceOf({
    total: data.total,
    connected: outcome ? (outcome === "connected" ? data.total : null) : campaignId ? data.outcomes[campaignId]?.connected ?? null : null,
    rows: (campaignId ? data.rows[campaignId]?.items : undefined) ?? [],
    lastAt: own && own.count > 0 ? own.lastAt : null,
  });
  const callers = byCaller(data.callers);
  /* The share of all the calls that connected, for the line under the title. With one outcome picked every call is
     that outcome and a rate says nothing; with a count that could not be read it is left out. */
  const connectedPct = useMemo(() => {
    const shown = data.groups.filter((g) => g.count > 0);
    return outcome ? null : connectedPercent(shown.map((g) => data.outcomes[groupKey(g)]?.connected), data.total);
  }, [data.groups, data.total, data.outcomes, outcome]);
  useEffect(() => {
    if (!onTotals) return;
    onTotals(data.phase === "ready" && data.total > 0
      ? { calls: data.total, campaigns: data.groups.filter((g) => g.campaign && g.count > 0).length, connectedPct }
      : null);
  }, [onTotals, data.phase, data.total, data.groups, connectedPct]);
  /* The recency bands: a quiet label where the groups move from today to this week to earlier (only when there
     is more than one band to tell apart). */
  const bands = new Set(pageGroups.filter((g) => g.count > 0).map((g) => bandOf(g.lastAt)));
  const showBands = !flat && bands.size > 1;
  const hit = flat ? "" : dq;

  return (
    <>
      {/* A campaign's own page opens with how its calls are going. */}
      {flat && data.phase === "ready" && (
        <section className="kl-glance" aria-label="Calls at a glance">
          <dl className="kl-stats">
            <div><dt>Calls</dt><dd>{glance.total.toLocaleString("en-IN")}</dd></div>
            <div><dt>Connected</dt><dd>{glance.connectedPct === null ? "–" : `${glance.connectedPct}%`}</dd></div>
            <div><dt>Average length</dt><dd>{glance.averageSeconds === null ? "–" : lengthLabel(glance.averageSeconds)}</dd></div>
            <div><dt>Last call</dt><dd>{glance.lastAt ? whenLabel(glance.lastAt) : "None yet"}</dd></div>
          </dl>
          {everyone && callers.length > 0 && (
            <div className="kl-bycaller">
              <h2 className="kl-bch t-label">By caller</h2>
              <ul>
                {callers.map((c) => (
                  <li key={c.id || c.name}><span className="kl-ell">{c.name}</span><b>{c.count}</b></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Nothing to search or narrow until there is a call. */}
      {(data.phase !== "ready" || data.total > 0 || narrowed) && (
        <CallsToolbar
          q={q} onQ={setQ}
          outcome={outcome} onOutcome={setOutcome}
          preset={preset} onPreset={setPreset}
          custom={custom} onCustom={setCustom}
          caller={caller} onCaller={setCaller}
          callers={callerOptions}
          showCaller={everyone && data.callers.length > 1}
          pager={listTotal !== null && listTotal > size
            ? <Pager offset={offset} limit={size} total={listTotal} unit={flat ? "calls" : "campaigns"} onChange={(o) => setPaged({ key: viewKey, offset: o })} />
            : data.phase === "loading" ? <PagerSlot /> : null}
        />
      )}
      <FilterChips chips={chips} onClearAll={clear} />

      <div ref={list} className={`kl-list${openId ? " has-open" : ""}`} data-pager-list>
        {data.phase === "loading" && (
          flat ? <KlRowsGhost variant="page" n={size} label="Loading calls" /> : <KlGroupsGhost kind="call" n={size} label="Loading calls" />
        )}
        {data.phase === "failed" && <LoadFailed what="Your calls" onRetry={data.refresh} />}
        {data.phase === "ready" && data.total === 0 && (
          <div className="kl-empty">
            <EmptyArt {...listEmptyArt("calls", narrowed)} />
            <p className="t-body-strong">{narrowed ? "No calls match." : "No calls yet."}</p>
            <p className="t-body-sm kl-quiet">
              {narrowed
                ? "Try another word, outcome or date."
                : "Calls you place from SuperHyre show up here."}
            </p>
            {narrowed && <button type="button" className="kl-btn" onClick={clear}>Clear filters</button>}
          </div>
        )}
        {data.phase === "ready" && data.total > 0 && (
          <ul className={`kl-groups${flat ? " is-flat" : ""}`}>
            {pageGroups.map((g, gi) => {
              const key = groupKey(g);
              if (g.count === 0) return null;
              const isOpen = flat || (shown[key] ?? false);
              const rowsOf = data.rows[key];
              const connected = outcome ? undefined : data.outcomes[key]?.connected;
              const share = connectedShare(connected, g.count);
              const band = bandOf(g.lastAt);
              const prev = pageGroups.slice(0, gi).reverse().find((x) => x.count > 0);
              const newBand = showBands && (!prev || bandOf(prev.lastAt) !== band);
              return (
                <Fragment key={key}>
                {/* The calls on no campaign come last whatever their date, so they take the divider without a word. */}
                {newBand && <li className="kl-band" role="presentation">{g.campaign && <span>{BAND_LABEL[band]}</span>}</li>}
                <li className={`kl-group${isOpen ? " is-open" : ""}`}>
                  {!flat && (
                    <h2 className="kl-ghead">
                      <button type="button" className="kl-gbtn" aria-expanded={isOpen} aria-controls={`kl-g-${key}`} onClick={() => toggle(key)}>
                        <span className="kl-gchip" aria-hidden="true">
                          {g.campaign ? campaignInitials(g.campaign.name) : <PhoneCall size={16} weight="bold" />}
                        </span>
                        <span className="kl-gtitle">
                          <span className="kl-gname kl-ell"><Lit text={g.campaign?.name ?? "Not on a campaign"} q={hit} /></span>
                          {g.campaign?.client && <span className="kl-gclient kl-ell"><Lit text={g.campaign.client} q={hit} /></span>}
                        </span>
                        <span className="kl-gstats">
                          <span className="kl-gcount">{callCount(g.count)}</span>
                          {/* A thin bar of how much of it connected, with the numbers on hover and focus. */}
                          <span className="kl-gbar" aria-hidden="true">
                            {share !== null && (
                              <>
                                <i style={{ width: `${share}%` }} />
                                <span className="kl-tip">{connected} of {g.count} connected</span>
                              </>
                            )}
                          </span>
                          {share !== null && <span className="sr-only">{connected} of {g.count} connected</span>}
                          <span className="kl-glast"><span className="kl-glast-w">Last call </span>{whenLabel(g.lastAt)}</span>
                        </span>
                        <CaretRight size={14} weight="bold" className="kl-caret" aria-hidden="true" />
                      </button>
                    </h2>
                  )}
                  {isOpen && (
                    <div id={`kl-g-${key}`} className="kl-gbody">
                      {!rowsOf || (rowsOf.phase === "loading" && rowsOf.items.length === 0) ? (
                        <KlRowsGhost n={Math.max(1, Math.min(g.count, flat ? size : GROUP_ROWS))} label="Loading calls" />
                      ) : rowsOf.phase === "failed" ? (
                        <LoadFailed what="These calls" compact onRetry={data.refresh} />
                      ) : rowsOf.items.length === 0 ? (
                        <p className="t-body kl-quiet kl-pad">{narrowed ? "No calls match here." : "No calls here yet."}</p>
                      ) : (
                        <>
                          <ul className="kl-rows">
                            {(flat ? rowsOf.items : rowsOf.items.slice(0, GROUP_ROWS)).map((r) => (
                              <li key={r.id}>
                                <CallLine r={r} on={r.id === openId} showCaller={showCallerCol} hit={hit} onOpen={(row) => { setApartRow(null); setBack(null); setOpenId(row.id); }} />
                              </li>
                            ))}
                          </ul>
                          {!flat && g.count > GROUP_ROWS && (
                            <div className="kl-gfoot">
                              <span className="kl-gfoot-note">Latest {GROUP_ROWS} shown</span>
                              <button
                                type="button"
                                className="kl-all"
                                onClick={() => setAll({ id: key, name: g.campaign?.name ?? "Not on a campaign", client: g.campaign?.client ?? null, count: g.count })}
                                aria-haspopup="dialog"
                              >
                                View all {g.count} calls
                                <ArrowRight size={14} weight="bold" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
      {listTotal !== null && listTotal > size && (
        <Pager offset={offset} limit={size} total={listTotal} unit={flat ? "calls" : "campaigns"} variant="foot" onChange={(o) => setPaged({ key: viewKey, offset: o })} />
      )}

      <CallsModal
        group={all}
        filters={{ from: filters.from, to: filters.to, callerId: filters.callerId, outcome: filters.outcome }}
        initialQ={back?.q ?? (all && data.byName.has(all.id) ? "" : dq)}
        initialOutcome={back ? back.outcome : outcome}
        focusId={back?.id ?? null}
        showCaller={showCallerCol}
        onView={(v) => { view.current = v; }}
        onOpen={(row) => {
          // The dialog gives way to the sheet and comes back, as it was, when the sheet is closed.
          if (all) setBack({ group: all, q: view.current.q, outcome: view.current.outcome, id: row.id });
          setApartRow(row);
          setOpenId(row.id);
          setAll(null);
        }}
        onClose={() => { setBack(null); setAll(null); }}
      />

      {openId && lastOpened.current && (
        <CallSheet
          id={openId}
          hint={rows.find((r) => r.id === openId) ?? lastOpened.current}
          campaigns={campaigns}
          onClose={() => {
            const id = openId;
            setOpenId(null);
            if (back) { setAll(back.group); return; }
            window.setTimeout(() => focusRow(id), 0);
          }}
        />
      )}
    </>
  );
}

/* ═════════════════════════ the pages ═════════════════════════ */

/** The title, the one line that says whose calls these are, and one plain line of figures for the page. */
export function CallsHead({ standing, totals }: { standing: Standing; totals?: CallsTotals | null }) {
  return (
    <header className="kl-head">
      <div className="kl-head-t">
        <h1 className="kl-h1">Calls</h1>
        <p className="kl-lede">{subtitleOf(standing)}</p>
      </div>
      {totals && <p className="kl-total">{summaryLine(totals)}</p>}
    </header>
  );
}

/**
 * Everyone's calls, by campaign: the top-level Calls page, for the organisation's owner and admins (and the one
 * person of a personal workspace). A recruiter has no such page (the console sends them to their calls on a campaign,
 * and nothing here reads anything for them), so this draws nothing for one.
 */
export function CallsPage() {
  const standing = standingOf(useSession());
  const [totals, setTotals] = useState<CallsTotals | null>(null);
  if (!can(standing, "calls.all")) return null;
  return (
    <div className="kl">
      <CallsHead standing={standing} totals={totals} />
      <CallsList standing={standing} onTotals={setTotals} />
    </div>
  );
}

/** One campaign's calls, in the campaign's own chrome. */
export function CampaignCalls({ ctx }: { ctx: Ctx }) {
  const standing = standingOf(useSession());
  return (
    <div className="cw kl kl-in-campaign">
      <CampaignHeader ctx={ctx} title="Calls" meta={subtitleOf(standing)} />
      <CallsList campaignId={ctx.campaignId} standing={standing} />
    </div>
  );
}

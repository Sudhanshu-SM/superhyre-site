import { ArrowRight, CaretRight, MagnifyingGlass, PaperPlaneTilt, PhoneCall, X } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ActivityFilters, ActivityRow, Channel } from "./api/outreachActivity";
import { listActivity } from "./api/outreachActivity";
import { logCall, removeLoggedCall } from "./api/calls";
import { LIVE, messageOf } from "./api/client";
import { addSuppression } from "./api/suppressions";
import { Lit } from "./CallLine";
import type { Ctx } from "./CampaignWorkspace";
import { CampaignHeader } from "./CampaignWorkspace";
import { can, type Standing, standingOf } from "./can";
import {
  arrowsStepRows, BAND_LABEL, campaignInitials, groupKey, GROUP_ROWS, initialsOf, openGroups, RANGE_LABEL, rangeOf, ROW_PAGE, stepIndex,
} from "./callsView";
import type { RangePreset } from "./callsView";
import { ChannelMark, channelName } from "./ChannelMark";
import { FilterChips } from "./components/FilterChips";
import type { FilterChip } from "./components/FilterChips";
import { Pager } from "./components/Pager";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { clampedOffset, hasDeepLink, loadSection, settledOffset, take } from "./sectionState";
import { PAGE_FALLBACK, PAGE_MAX, PAGE_MIN, PAGER_FOOT, usePageSize, usePageSizeChoice } from "./usePageSize";
import { useStuckBar } from "./useStuckBar";
import { KlGroupsGhost, KlRowsGhost, PagerSlot } from "./klGhosts";
import { EmptyArt } from "./EmptyArt";
import { GhostChart } from "./GhostChart";
import { OutreachSheet } from "./OutreachSheet";
import {
  bandOfActivity, byLine, CHANNEL_TABS, countWord, lastWord, lengthOf, lineOf, personChoices, personOf, readRemembered, statusFilterName, statusFiltersFor,
  STATUS_TONE, statusFilterOf, statusForTab, statusWords, summaryLine, tabOf, tabCount, WHATSAPP_WAITING, whenOf, writeRemembered,
} from "./outreachActivityView";
import type { ChannelTab } from "./outreachActivityView";
import { fixtureActivity } from "./outreachFixtures";
import { useCampaignRow } from "./campaignStore";
import { useSession } from "./roleStore";
import { toneProps } from "./statusTones";
import { invalidateViews } from "./invalidate";
import { LogCallDialog } from "./LogCallDialog";
import { bodyOf, fitsFilters, loggedLine, newKey, NO_CALLS_LINE, NO_CALLS_TITLE, pendingRow } from "./logCallView";
import type { LogCallForm, PersonPick } from "./logCallView";
import { useToast } from "./toast";
import { Dialog, LoadFailed } from "./ui";
import { SwitchPane, useHeldView, useSlide } from "./switchMotion";
import { activityKey, activitySettled, useOutreachActivity, visibleActivity } from "./useOutreachActivity";
import "./calls.css";
import "./outreachActivity.css";

/**
 * Outreach: every email, WhatsApp chat and call, by campaign, in one list. There are two places and they are for
 * different people:
 *
 *   - the top-level Outreach (`OutreachPage`): everyone's, for the organisation's owner and admins and the one person
 *     of a personal workspace (`can(standing, "calls.all")`);
 *   - a campaign's own Outreach (`CampaignOutreach`): that campaign's, scoped by the server to the person's own for a
 *     recruiter, and the only place a recruiter has it.
 *
 * Each campaign is a group that opens like a drop-down; a line is a channel mark, who, what was said, how it stands
 * and when, and a click opens that person's whole outreach in a sheet on the right.
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

/* ═════════════════════════ a line ═════════════════════════ */

export function OutreachLine({ r, on, showBy, hit, onOpen }: {
  r: ActivityRow;
  on: boolean;
  /** An owner or admin sees whose it was; a recruiter's own are all theirs. */
  showBy: boolean;
  hit: string;
  onOpen: (r: ActivityRow) => void;
}) {
  const line = lineOf(r);
  const words = statusWords(r);
  const by = showBy ? byLine(r) : r.direction === "in" ? byLine(r) : "";
  const length = lengthOf(r);
  const name = personOf(r);
  return (
    <button
      type="button"
      data-ko-row={r.id}
      className={`kl-row ko-row${on ? " is-on" : ""}`}
      aria-haspopup="dialog"
      aria-pressed={on}
      onClick={() => onOpen(r)}
    >
      <span className={`kl-av${r.candidateName ? "" : " is-number"}`} aria-hidden="true">
        {r.candidateName ? initialsOf(r.candidateName) : <ChannelMark channel={r.channel} size={14} />}
      </span>
      <span className="kl-main">
        <span className="kl-l1">
          <span className="ko-mark" role="img" aria-label={channelName(r.channel)}><ChannelMark channel={r.channel} /></span>
          <span className="kl-name kl-ell"><Lit text={name} q={hit} /></span>
          {by && <span className="kl-by is-name kl-ell"><Lit text={by} q={hit} /></span>}
        </span>
        {line && <span className="kl-sum kl-ell"><Lit text={line} q={hit} /></span>}
      </span>
      <span {...toneProps(STATUS_TONE[r.status])} className="kl-how kl-ell st">
        {words.label}
        {words.sub && <span className={`kl-how-sub${words.action ? " is-act" : ""}`}>{words.sub}</span>}
      </span>
      <span className="kl-tail">
        <span className="kl-len">{length}</span>
        <span className="kl-when">{whenOf(r.at)}</span>
        {by && <span className="kl-by is-tail kl-ell"><Lit text={by} q={hit} /></span>}
      </span>
    </button>
  );
}

/* ═════════════════════════ the toolbar ═════════════════════════ */

export type ToolbarProps = {
  q: string;
  onQ: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  preset: RangePreset;
  onPreset: (v: RangePreset) => void;
  custom: { from: string; to: string };
  onCustom: (fn: (c: { from: string; to: string }) => { from: string; to: string }) => void;
  person: string;
  onPerson: (v: string) => void;
  people: Array<{ value: string; label: string }>;
  /** An owner or admin can pick a person; nobody else is offered one. */
  showPerson: boolean;
  /** The channel being looked at: the status filter offers its words, and is "Outcome" for calls. */
  tab?: ChannelTab;
  /** What the channel lets you do (on Calls: Log a call), before the pager. */
  action?: ReactNode;
  /** The pager, at the right end of the bar (the bar is what stays in view while the list scrolls). */
  pager?: ReactNode;
};

/** Search, status, dates and (for an owner or admin) person; and the pager, when the list has more than a page. */
export function OutreachToolbar(p: ToolbarProps) {
  const bar = useStuckBar<HTMLDivElement>();
  return (
    <div ref={bar} className="kl-bar" role="search">
      <label className="kl-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input
          type="search"
          value={p.q}
          onChange={(e) => p.onQ(e.target.value)}
          placeholder="Search by name, campaign, client or what was said"
          aria-label="Search outreach"
        />
        {p.q && (
          <button type="button" className="kl-search-x" onClick={() => p.onQ("")} aria-label="Clear search"><X size={11} weight="bold" /></button>
        )}
      </label>
      <label className="kl-pick">
        <span className="sr-only">{statusFilterName(p.tab ?? "")}</span>
        <select value={p.status} onChange={(e) => p.onStatus(e.target.value)} aria-label={statusFilterName(p.tab ?? "")}>
          <option value="">{p.tab === "call" ? "All outcomes" : "All statuses"}</option>
          {statusFiltersFor(p.tab ?? "").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
      {p.showPerson && p.people.length > 1 && (
        <label className="kl-pick">
          <span className="sr-only">Person</span>
          <select value={p.person} onChange={(e) => p.onPerson(e.target.value)} aria-label="Person">
            {p.people.map((c) => <option key={c.value || "all"} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      )}
      {p.action}
      {p.pager}
    </div>
  );
}

/** The channel switch: All, Email, WhatsApp, Calls, each with how many the filters leave. */
export function ChannelSwitch({ value, onChange, counts }: {
  value: ChannelTab;
  onChange: (v: ChannelTab) => void;
  counts: Parameters<typeof tabCount>[1] | null;
}) {
  // A radio group's own keys: Left and Right move the choice (and focus) one step, around.
  const step = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const at = CHANNEL_TABS.findIndex((t) => t.value === value);
    const next = CHANNEL_TABS[(at + (e.key === "ArrowRight" ? 1 : CHANNEL_TABS.length - 1)) % CHANNEL_TABS.length];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    // `currentTarget` is gone once the handler has returned, so the group is taken now.
    const group = e.currentTarget;
    window.requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  // The fill of the active tab is a mark that slides to the next one (switchMotion.tsx).
  const slide = useSlide<HTMLDivElement>('[aria-checked="true"]');
  return (
    <div className="ko-switch sw-host" role="radiogroup" aria-label="Channel" onKeyDown={step} {...slide.host}>
      {slide.mark}
      {CHANNEL_TABS.map((t) => (
        <button
          key={t.value || "all"}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          className={value === t.value ? "is-on" : ""}
          onClick={() => onChange(t.value)}
        >
          {t.value !== "" && <ChannelMark channel={t.value as Channel} />}
          <span>{t.label}</span>
          {counts && <span className="ko-switch-n kl-num">{tabCount(t.value, counts).toLocaleString("en-IN")}</span>}
        </button>
      ))}
    </div>
  );
}

/* ═════════════════════════ all of a campaign's lines ═════════════════════════ */

export type ModalGroup = { id: string; name: string; client: string | null; count: number };

function OutreachModal({ group, filters, tab, showBy, focusId, initialQ, onView, onOpen, onClose }: {
  group: ModalGroup | null;
  filters: Omit<ActivityFilters, "campaignId" | "q">;
  tab: ChannelTab;
  showBy: boolean;
  focusId: string | null;
  initialQ: string;
  onView: (v: { q: string }) => void;
  onOpen: (r: ActivityRow) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={group !== null} onClose={onClose} label={group ? `All outreach for ${group.name}` : "Outreach"} size="md">
      {group && <ModalBody key={group.id} {...{ group, filters, tab, showBy, focusId, initialQ, onView, onOpen }} />}
    </Dialog>
  );
}

function ModalBody({ group, filters, tab, showBy, focusId, initialQ, onView, onOpen }: Omit<Parameters<typeof OutreachModal>[0], "onClose" | "group"> & { group: ModalGroup }) {
  const [q, setQ] = useState(initialQ);
  const [dq, setDq] = useState(initialQ.trim());
  const [status, setStatus] = useState(filters.status ?? "");
  const [state, setState] = useState<{ items: ActivityRow[]; total: number | null; phase: "loading" | "ready" | "failed" }>({
    items: [], total: null, phase: "loading",
  });
  const asked = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDq(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => { onView({ q }); }, [q, onView]);
  useEffect(() => {
    if (focusId || window.matchMedia("(pointer: coarse)").matches) return;
    const id = window.setTimeout(() => search.current?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(id);
  }, [focusId]);

  const f: ActivityFilters = { ...filters, campaignId: group.id, q: dq || undefined, status: statusFilterOf(status, tab) || undefined };
  const key = JSON.stringify(f);
  /* The page belongs to the filters it was chosen in: another word or status is page 1 again. */
  const [paged, setPaged] = useState<{ key: string; offset: number }>({ key, offset: 0 });
  const at = paged.key === key ? paged.offset : 0;
  useEffect(() => {
    const mine = ++asked.current;
    setState((s) => ({ ...s, phase: s.items.length ? s.phase : "loading" }));
    const page = { limit: ROW_PAGE, offset: at };
    const read = LIVE ? listActivity(f, page) : Promise.resolve(fixtureActivity(f, page));
    read.then(
      (got) => { if (mine === asked.current) setState({ items: got.rows, total: got.total, phase: "ready" }); },
      () => { if (mine === asked.current) setState((s) => ({ ...s, phase: s.items.length ? "ready" : "failed" })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, at]);
  /* A list that has got shorter than the page asked for goes back to its last page. */
  useEffect(() => {
    if (state.total === null) return;
    const held = clampedOffset(at, state.total, ROW_PAGE);
    if (held !== at) setPaged({ key, offset: held });
  }, [state.total, at, key]);

  useEffect(() => {
    if (!focusId || focused.current || state.phase !== "ready") return;
    const el = list.current?.querySelector<HTMLElement>(`[data-ko-row="${CSS.escape(focusId)}"]`);
    if (!el) return;
    focused.current = true;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }, [focusId, state.phase, state.items]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const t = e.target as HTMLElement;
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("[data-ko-row]") ?? [])];
    if (t.closest("select, textarea")) return;
    if (t.closest("input")) {
      if (e.key === "ArrowDown" && rows[0]) { e.preventDefault(); rows[0].focus(); rows[0].scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (!rows.length) return;
    const at = rows.indexOf(t.closest<HTMLElement>("[data-ko-row]") as HTMLElement);
    if (e.key === "ArrowUp" && at === 0) { e.preventDefault(); search.current?.focus(); return; }
    const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? (e.key === "ArrowDown" ? 0 : rows.length - 1) : at + (e.key === "ArrowDown" ? 1 : -1)))];
    e.preventDefault();
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };

  const narrowed = Boolean(dq || status || filters.from || filters.to || filters.person);
  return (
    <div className="klm" onKeyDown={onKeyDown}>
      <header className="klm-head">
        <span className="kl-gchip" aria-hidden="true">{group.id === "none" ? <PaperPlaneTilt size={16} weight="bold" /> : campaignInitials(group.name)}</span>
        <div className="klm-titles">
          <h2 className="klm-title kl-ell">{group.name}</h2>
          <p className="klm-meta">
            {group.client && <span className="kl-ell">{group.client}</span>}
            <span className="klm-count">
              {state.phase === "ready" && narrowed && state.total !== null ? `${state.total.toLocaleString("en-IN")} of ${countWord(group.count, tab)}` : countWord(group.count, tab)}
            </span>
          </p>
        </div>
      </header>
      <div className="klm-bar" role="search">
        <label className="kl-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these" aria-label="Search these" />
          {q && <button type="button" className="kl-search-x" onClick={() => { setQ(""); search.current?.focus(); }} aria-label="Clear search"><X size={11} weight="bold" /></button>}
        </label>
        <label className="kl-pick">
          <span className="sr-only">{statusFilterName(tab)}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={statusFilterName(tab)}>
            <option value="">{tab === "call" ? "All outcomes" : "All statuses"}</option>
            {statusFiltersFor(tab).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {state.total !== null && state.total > ROW_PAGE && (
          <Pager offset={at} limit={ROW_PAGE} total={state.total} unit="items" target=".klm-rows" onChange={(o) => setPaged({ key, offset: o })} />
        )}
      </div>
      <div className="klm-body">
        {state.phase === "loading" && state.items.length === 0 && <KlRowsGhost variant="modal" kind="outreach" n={5} label="Loading outreach" />}
        {state.phase === "failed" && <p className="t-body kl-quiet kl-pad">These couldn't be loaded. Close this and try again in a moment.</p>}
        {state.phase === "ready" && state.items.length === 0 && <p className="t-body kl-quiet kl-pad">{narrowed ? "Nothing matches." : "Nothing here yet."}</p>}
        {state.items.length > 0 && (
          <ul ref={list} className="kl-rows klm-rows">
            {state.items.map((r) => (
              <li key={r.id}><OutreachLine r={r} on={false} showBy={showBy} hit={dq} onOpen={onOpen} /></li>
            ))}
          </ul>
        )}
        {state.total !== null && state.total > ROW_PAGE && (
          <Pager offset={at} limit={ROW_PAGE} total={state.total} unit="items" target=".klm-rows" variant="foot" onChange={(o) => setPaged({ key, offset: o })} />
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════ the list ═════════════════════════ */

type Summary = ReturnType<typeof useOutreachActivity>["channels"];

/* Where the person left this list in this tab. A channel, status, date range or page this list cannot have falls back
   to the top; a person nobody is among is dropped once the people are in. */
type Remembered = { tab: ChannelTab; q: string; status: string; preset: RangePreset; custom: { from: string; to: string }; person: string; offset: number; size: number };
const NOTHING: Remembered = { tab: "", q: "", status: "", preset: "any", custom: { from: "", to: "" }, person: "", offset: 0, size: PAGE_FALLBACK };
const DAY = /^\d{4}-\d\d-\d\d$/;
export function readListRemembered(r: Record<string, unknown>): Remembered {
  const custom = take.rec(r.custom);
  const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : "");
  const tab = tabOf(r.tab);
  return {
    tab,
    q: take.str(r.q, "", 100),
    // A status this channel does not have is not one to keep.
    status: statusFilterOf(take.str(r.status, "", 40), tab),
    preset: take.oneOf(r.preset, Object.keys(RANGE_LABEL) as RangePreset[], "any"),
    custom: { from: day(custom.from), to: day(custom.to) },
    person: take.str(r.person, "", 80),
    offset: take.int(r.offset, 0, 0, 100_000),
    size: take.int(r.size, PAGE_FALLBACK, PAGE_MIN, PAGE_MAX),
  };
}

function OutreachList({ campaignId, campaignName, standing, onSummary, onAgent }: {
  campaignId?: string | undefined;
  /** A campaign's own page: what to call it where a call is logged on it. */
  campaignName?: string | undefined;
  standing: Standing;
  /** The page's one line of figures. */
  onSummary?: ((c: Summary | null) => void) | undefined;
  onAgent?: ((prompt: string) => void) | undefined;
}) {
  const session = useSession();
  const userId = session.userId;
  const section = campaignId ? `outreach:${campaignId}` : "outreach";
  const [deep] = useState(() => hasDeepLink());
  const [start] = useState<Remembered>(() => (deep ? NOTHING : loadSection(section, readListRemembered, NOTHING)));
  const [tab, setTab] = useState<ChannelTab>(start.tab);
  const [q, setQ] = useState(start.q);
  const [status, setStatus] = useState(start.status);
  const [preset, setPreset] = useState<RangePreset>(start.preset);
  const [custom, setCustom] = useState<{ from: string; to: string }>(start.custom);
  const [person, setPerson] = useState(start.person);
  const dq = useDebounced(q.trim(), 250);

  const range = preset === "custom" ? { from: custom.from || undefined, to: custom.to || undefined } : rangeOf(preset);
  const filters: ActivityFilters = useMemo(
    () => ({
      channel: tab || undefined,
      q: dq || undefined,
      status: statusFilterOf(status, tab) || undefined,
      from: range.from,
      to: range.to,
      person: person || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, dq, status, range.from, range.to, person],
  );
  const narrowed = Boolean(dq || status || range.from || range.to || person);

  // Which groups are open: what this person chose before, else the most recent.
  const [remembered, setRemembered] = useState(() => readRemembered(storage(), userId));
  useEffect(() => { setRemembered(readRemembered(storage(), userId)); }, [userId]);
  const [seen, setSeen] = useState<readonly string[]>([]);

  const flat = campaignId !== undefined;
  const [openSet, setOpenSet] = useState<ReadonlySet<string>>(new Set());
  /* The page belongs to the filters it was chosen in: another channel, word, status, date or person is page 1 again. A
     campaign's own page pages its lines; the top-level list pages its campaigns. */
  const viewKey = JSON.stringify(filters);
  const [paged, setPaged] = useState<{ key: string; offset: number }>({ key: viewKey, offset: start.offset });
  const wanted = paged.key === viewKey ? paged.offset : 0;
  /* As many lines (or campaigns) as fit under the list's top; a remembered offset lands on the page that holds its first row. */
  const autoSize = usePageSize(flat ? 59 : 80, { fallback: start.size, rowSelector: flat ? ".kl-row" : undefined, gap: 1, reserve: 40 + PAGER_FOOT });
  /* The size the window fits is "Auto"; the person may choose a fixed one that suits how many there are (25 to 1,000). */
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const { size, picker } = usePageSizeChoice("outreach", autoSize, knownTotal);
  const data = useOutreachActivity({ campaignId, filters, open: openSet, offset: flat ? wanted : 0, pageSize: size });
  const liveGroups = useMemo(() => data.groups.filter((g) => g.count > 0), [data.groups]);
  const ownTotal = flat && data.phase === "ready" ? data.groups[0]?.count ?? 0 : null;
  const listTotal = flat ? ownTotal : data.phase === "ready" ? liveGroups.length : null;
  useEffect(() => { if (listTotal !== null) setKnownTotal(listTotal); }, [listTotal]);
  /* A remembered page is held inside the list only once the list's total is known: before that it is left exactly as it was. */
  const { offset, fix } = settledOffset(wanted, listTotal, size);
  useEffect(() => {
    if (fix !== null) setPaged((cur) => (cur.key === viewKey && cur.offset === fix ? cur : { key: viewKey, offset: fix }));
  }, [fix, viewKey]);
  const pageKeys = useMemo(
    () => new Set((flat ? data.groups : liveGroups.slice(offset, offset + size)).map(groupKey)),
    [flat, data.groups, liveGroups, offset],
  );
  const opened = useMemo(() => openGroups(data.groups, remembered), [data.groups, remembered]);
  /* While searching, every group that has something to show is open, so the matches are in view; closing one is for
     this search only and is not remembered. */
  const searching = Boolean(dq) && !flat;
  const [searchShut, setSearchShut] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setSearchShut(new Set()); }, [dq]);
  const shown = useMemo(
    () => (searching ? Object.fromEntries(data.groups.map((g) => [groupKey(g), !searchShut.has(groupKey(g))])) : opened),
    [searching, data.groups, searchShut, opened],
  );
  useEffect(() => {
    // Only the campaigns on this page have their lines read.
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

  /* A switch of channel (or of any filter) keeps the list that is on screen until the next one is whole, so nothing
     goes empty and no loader shows in between. `v` is what is drawn: the held list, or the live one when nothing is
     being waited for. `data` stays the live read, and is what the open groups and the actions go by. */
  const hit = flat ? "" : dq;
  const asked = activityKey(filters, campaignId);
  const needed = flat ? [campaignId as string] : data.groups.map(groupKey).filter((k) => shown[k] && pageKeys.has(k));
  /* A page is held like a switch: the page on screen stays until the next one's lines are in. */
  const held = useHeldView(
    { data, tab, narrowed, hit, open: shown, offset, size },
    { key: `${asked}|${offset}|${size}`, scope: campaignId ?? "", ready: activitySettled(data, asked, needed, flat ? offset : undefined), holdable: (s) => s.data.phase === "ready" },
  );
  const v = held.value;
  const heldGroups = useMemo(() => v.data.groups.filter((g) => g.count > 0), [v.data.groups]);
  const pageGroups = flat ? v.data.groups : heldGroups.slice(v.offset, v.offset + v.size);
  const shownSet = useMemo(() => new Set(Object.entries(v.open).filter(([, on]) => on).map(([k]) => k)), [v.open]);

  // The line that is open, and the keyboard.
  const [openRow, setOpenRow] = useState<ActivityRow | null>(null);
  const [all, setAll] = useState<ModalGroup | null>(null);
  /* A line opened from the "view all" dialog: where the dialog was, so closing the sheet brings it back there. */
  const [back, setBack] = useState<{ group: ModalGroup; q: string; id: string } | null>(null);
  const view = useRef<{ q: string }>({ q: "" });
  const rows = useMemo(() => visibleActivity(v.data, shownSet, flat, flat ? undefined : GROUP_ROWS), [v.data, shownSet, flat]);

  const list = useRef<HTMLDivElement>(null);
  const focusRow = useCallback((id: string) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-ko-row="${CSS.escape(id)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest(".klm")) return;
      if (!arrowsStepRows(t)) return;
      if (rows.length === 0) return;
      if (openRow && !rows.some((r) => r.id === openRow.id)) return;
      const focused = t?.closest<HTMLElement>("[data-ko-row]")?.dataset.koRow;
      const at = rows.findIndex((r) => r.id === (focused ?? openRow?.id));
      const next = rows[stepIndex(at, e.key === "ArrowDown" ? 1 : -1, rows.length)];
      if (!next) return;
      e.preventDefault();
      if (t?.closest(".kl-sheet")) {
        list.current?.querySelector<HTMLElement>(`[data-ko-row="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
      } else {
        focusRow(next.id);
      }
      // With a sheet open it follows: moving down the list is reading people in turn.
      if (openRow) setOpenRow(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, openRow, focusRow]);

  /* Log a call: the form comes from the dialog; the call is on the list at once and the server is told after. A refusal takes
     it off again and says why; a "no" offers do-not-contact beside the Undo, and never does it. */
  const toast = useToast();
  const [logging, setLogging] = useState<{ person: PersonPick | null; n: number } | null>(null);
  const fixed = campaignId ? { id: campaignId, name: campaignName || data.groups[0]?.campaign?.name || "this campaign" } : null;
  const startLog = useCallback((person: PersonPick | null = null) => setLogging((cur) => ({ person, n: (cur?.n ?? 0) + 1 })), []);
  const saveLog = (f: LogCallForm) => {
    const key = newKey();
    const row = pendingRow(f, key, { id: userId ?? null, name: session.name || null }, fixed);
    setLogging(null);
    if (fitsFilters(row, filters)) data.addRow(row, fixed ? { name: fixed.name, client: null } : null);
    const said = loggedLine(f);
    const person = f.person;
    if (!LIVE) { toast(said); return; }
    logCall(bodyOf(f, key)).then(
      (done) => {
        invalidateViews(["calls"]);
        const undo = () => void removeLoggedCall(key).then(
          () => { invalidateViews(["calls"]); data.refresh(); toast("Taken back."); },
          (err: unknown) => toast(messageOf(err), "error"),
        );
        if (done.offerDoNotContact && person) {
          toast(said, "done", {
            label: "Do not contact",
            onClick: () => void addSuppression({ candidateId: person.id, reason: "do_not_contact" }).then(
              () => toast(`${person.name.split(/\s+/)[0] ?? "They"} won't be contacted.`),
              (err: unknown) => toast(messageOf(err), "error"),
            ),
          });
        } else {
          toast(said, "done", { label: "Undo", onClick: undo });
        }
      },
      (err: unknown) => {
        data.dropRow(key);
        toast(messageOf(err), "error");
      },
    );
  };
  const logButton = (
    <button type="button" className="kl-btn lc-open" onClick={() => startLog()}>
      <PhoneCall size={15} aria-hidden="true" /> Log a call
    </button>
  );

  const everyone = v.data.canSeeEveryone || standing === "owner" || standing === "admin";
  const personOptions = personChoices(v.data.people, userId);
  /* A remembered person who has nothing here (or is not in this workspace) is not a filter to keep. */
  useEffect(() => {
    // Only on an answer to the filters as they are now: the people of the list before is not the people of this one.
    if (data.phase === "ready" && data.key === asked && person && data.canSeeEveryone && !data.people.some((p) => p.id === person)) setPerson("");
  }, [data.phase, data.key, asked, data.canSeeEveryone, data.people, person]);
  useSectionSave(section, { tab, q, status, preset, custom, person, offset, size }, data.phase === "ready");
  useScrollMemory(section, data.phase === "ready", !deep);
  const clear = () => { setQ(""); setStatus(""); setPreset("any"); setCustom({ from: "", to: "" }); setPerson(""); };
  /* A channel has its own words for a status: the one chosen is kept if the new channel has it and dropped with the switch
     if not, so no state is ever left that nothing would correct. */
  const pickTab = (t: ChannelTab) => { setTab(t); setStatus((s) => statusForTab(s, t)); };
  /* What is narrowing the list, in the list's own words, so a filter that came back from the last visit is never invisible. */
  const chips: FilterChip[] = [];
  if (dq) chips.push({ key: "q", label: `“${dq}”`, onClear: () => setQ("") });
  if (status && statusFilterOf(status, tab)) chips.push({ key: "status", label: statusFiltersFor(tab).find((o) => o.value === status)?.label ?? status, onClear: () => setStatus("") });
  if (preset !== "any") chips.push({ key: "date", label: preset === "custom" ? [custom.from, custom.to].filter(Boolean).join(" to ") || RANGE_LABEL.custom : RANGE_LABEL[preset], onClear: () => { setPreset("any"); setCustom({ from: "", to: "" }); } });
  if (person) chips.push({ key: "person", label: personOptions.find((o) => o.value === person)?.label ?? "A teammate", onClear: () => setPerson("") });

  useEffect(() => {
    if (!onSummary) return;
    onSummary(v.data.phase === "ready" ? v.data.channels : null);
  }, [onSummary, v.data.phase, v.data.channels]);

  const bands = new Set(pageGroups.filter((g) => g.count > 0).map((g) => bandOfActivity(g.lastAt)));
  const showBands = !flat && bands.size > 1;
  const nothingAtAll = v.data.phase === "ready" && v.data.channels.all === 0 && !v.narrowed;
  const whatsappEmpty = v.tab === "whatsapp" && v.data.phase === "ready" && v.data.total === 0 && !v.narrowed;

  return (
    <>
      {(v.data.phase !== "ready" || !nothingAtAll || v.narrowed) && (
        <ChannelSwitch value={tab} onChange={pickTab} counts={v.data.phase === "ready" ? v.data.channels : null} />
      )}

      {(v.data.phase !== "ready" || v.data.channels.all > 0 || v.narrowed) && (
        <OutreachToolbar
          q={q} onQ={setQ}
          status={status} onStatus={setStatus}
          preset={preset} onPreset={setPreset}
          custom={custom} onCustom={setCustom}
          person={person} onPerson={setPerson}
          people={personOptions}
          showPerson={everyone && v.data.people.length > 1}
          tab={tab}
          action={tab === "call" ? logButton : undefined}
          pager={listTotal !== null && listTotal > size
            ? <Pager offset={offset} limit={size} total={listTotal} unit={flat ? "items" : "campaigns"} busy={held.holding} sizes={picker} onChange={(o) => setPaged({ key: viewKey, offset: o })} />
            : data.phase === "loading" ? <PagerSlot /> : null}
        />
      )}
      <FilterChips chips={chips} onClearAll={clear} />

      <div ref={list} className={`kl-list${openRow ? " has-open" : ""}`} data-pager-list>
        <SwitchPane k={v.tab || "all"} settle={held.shownKey} busy={held.slow}>
          {v.data.phase === "loading" && (
            flat ? <KlRowsGhost variant="page" kind="outreach" n={size} label="Loading outreach" /> : <KlGroupsGhost kind="outreach" n={size} label="Loading outreach" />
          )}
          {v.data.phase === "failed" && <LoadFailed what="Your outreach" onRetry={data.refresh} />}
          {whatsappEmpty && (
            <GhostChart kind="table" title="WhatsApp" line={v.data.whatsappConnected ? "No WhatsApp chats yet." : WHATSAPP_WAITING} />
          )}
          {v.data.phase === "ready" && v.data.total === 0 && !whatsappEmpty && (
            <div className="kl-empty">
              {v.narrowed ? <EmptyArt name="empty-search" size={160} /> : <EmptyArt name="empty-sent" size={200} />}
              <p className="t-body-strong">{v.narrowed ? "Nothing matches." : v.tab === "call" ? NO_CALLS_TITLE : "No outreach yet."}</p>
              <p className="t-body-sm kl-quiet">
                {v.narrowed
                  ? "Try another word, status or date."
                  : v.tab === "call"
                    ? NO_CALLS_LINE
                    : "Emails you send, WhatsApp chats and calls you place from SuperHyre show up here."}
              </p>
              {v.narrowed && <button type="button" className="kl-btn" onClick={clear}>Clear filters</button>}
              {!v.narrowed && (v.tab === "call" || nothingAtAll) && logButton}
            </div>
          )}
          {v.data.phase === "ready" && v.data.total > 0 && (
            <ul className={`kl-groups${flat ? " is-flat" : ""}`}>
              {pageGroups.map((g, gi) => {
                const key = groupKey(g);
                if (g.count === 0) return null;
                const isOpen = flat || (v.open[key] ?? false);
                const rowsOf = v.data.rows[key];
                const band = bandOfActivity(g.lastAt);
                const prev = pageGroups.slice(0, gi).reverse().find((x) => x.count > 0);
                const newBand = showBands && (!prev || bandOfActivity(prev.lastAt) !== band);
                return (
                  <Fragment key={key}>
                  {/* What is on no campaign comes last whatever its date, so it takes the divider without a word. */}
                  {newBand && <li className="kl-band" role="presentation">{g.campaign && <span>{BAND_LABEL[band]}</span>}</li>}
                  <li className={`kl-group${isOpen ? " is-open" : ""}`}>
                    {!flat && (
                      <h2 className="kl-ghead">
                        <button type="button" className="kl-gbtn" aria-expanded={isOpen} aria-controls={`ko-g-${key}`} onClick={() => toggle(key)}>
                          <span className="kl-gchip" aria-hidden="true">
                            {g.campaign ? campaignInitials(g.campaign.name) : <PaperPlaneTilt size={16} weight="bold" />}
                          </span>
                          <span className="kl-gtitle">
                            <span className="kl-gname kl-ell"><Lit text={g.campaign?.name ?? "Not on a campaign"} q={v.hit} /></span>
                            {g.campaign?.client && <span className="kl-gclient kl-ell"><Lit text={g.campaign.client} q={v.hit} /></span>}
                          </span>
                          <span className="ko-gstats">
                            <span className="ko-gcount">{countWord(g.count, v.tab)}</span>
                            <span className="ko-glast"><span className="kl-glast-w">{lastWord(g.lastAt).word} </span>{whenOf(g.lastAt)}</span>
                          </span>
                          <CaretRight size={14} weight="bold" className="kl-caret" aria-hidden="true" />
                        </button>
                      </h2>
                    )}
                    {isOpen && (
                      <div id={`ko-g-${key}`} className="kl-gbody">
                        {!rowsOf || (rowsOf.phase === "loading" && rowsOf.items.length === 0) ? (
                          <KlRowsGhost kind="outreach" n={Math.max(1, Math.min(g.count, flat ? size : GROUP_ROWS))} label="Loading outreach" />
                        ) : rowsOf.phase === "failed" ? (
                          <LoadFailed what="These" compact onRetry={data.refresh} />
                        ) : rowsOf.items.length === 0 ? (
                          <p className="t-body kl-quiet kl-pad">{v.narrowed ? "Nothing matches here." : "Nothing here yet."}</p>
                        ) : (
                          <>
                            <ul className="kl-rows">
                              {(flat ? rowsOf.items : rowsOf.items.slice(0, GROUP_ROWS)).map((r) => (
                                <li key={r.id}>
                                  <OutreachLine r={r} on={r.id === openRow?.id} showBy={everyone} hit={v.hit} onOpen={(row) => { setBack(null); setOpenRow(row); }} />
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
                                  View all {g.count}
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
        </SwitchPane>
      </div>
      {listTotal !== null && listTotal > size && (
        <Pager offset={offset} limit={size} total={listTotal} unit={flat ? "items" : "campaigns"} busy={held.holding} variant="foot" onChange={(o) => setPaged({ key: viewKey, offset: o })} />
      )}

      <OutreachModal
        group={all}
        filters={{ channel: filters.channel, status: filters.status, from: filters.from, to: filters.to, person: filters.person, client: filters.client }}
        tab={tab}
        initialQ={back?.q ?? dq}
        focusId={back?.id ?? null}
        showBy={everyone}
        onView={(v) => { view.current = v; }}
        onOpen={(row) => {
          // The dialog gives way to the sheet and comes back, as it was, when the sheet is closed.
          if (all) setBack({ group: all, q: view.current.q, id: row.id });
          setOpenRow(row);
          setAll(null);
        }}
        onClose={() => { setBack(null); setAll(null); }}
      />

      <LogCallDialog seed={logging} fixed={fixed} onClose={() => setLogging(null)} onSave={saveLog} />

      {openRow && (
        <OutreachSheet
          row={openRow}
          onAgent={onAgent}
          onChanged={data.refresh}
          onLogCall={(person) => startLog(person)}
          onClose={() => {
            const id = openRow.id;
            setOpenRow(null);
            if (back) { setAll(back.group); return; }
            window.setTimeout(() => focusRow(id), 0);
          }}
        />
      )}
    </>
  );
}

/* ═════════════════════════ the pages ═════════════════════════ */

/** The title and one plain muted line of figures: "412 emails, 31 WhatsApp chats, 96 calls, 38% of calls answered". */
export function OutreachHead({ counts }: { counts?: Summary | null }) {
  const line = counts ? summaryLine(counts) : "";
  return (
    <header className="kl-head">
      <div className="kl-head-t">
        <h1 className="kl-h1">Outreach</h1>
        <p className="kl-lede">{line || "Emails, WhatsApp chats and calls, by campaign."}</p>
      </div>
    </header>
  );
}

/**
 * Everyone's outreach, by campaign: the top-level Outreach page, for the organisation's owner and admins (and the one
 * person of a personal workspace). A recruiter has no such page (the console sends them to their outreach on a
 * campaign), so this draws nothing for one.
 */
export function OutreachPage({ onAgent }: { onAgent?: (prompt: string) => void }) {
  const standing = standingOf(useSession());
  const [counts, setCounts] = useState<Summary | null>(null);
  if (!can(standing, "calls.all")) return null;
  return (
    <div className="kl ko">
      <OutreachHead counts={counts} />
      <OutreachList standing={standing} onSummary={setCounts} onAgent={onAgent} />
    </div>
  );
}

/** One campaign's outreach, in the campaign's own chrome. */
export function CampaignOutreach({ ctx }: { ctx: Ctx }) {
  const standing = standingOf(useSession());
  const name = useCampaignRow(ctx.campaignId)?.name;
  const [counts, setCounts] = useState<Summary | null>(null);
  const line = counts ? summaryLine(counts) : "";
  return (
    <div className="cw kl ko kl-in-campaign">
      <CampaignHeader ctx={ctx} title="Outreach" meta={line || "Emails, WhatsApp chats and calls for this campaign."} />
      <OutreachList campaignId={ctx.campaignId} campaignName={name} standing={standing} onSummary={setCounts} onAgent={(p) => ctx.onAgent(p)} />
    </div>
  );
}

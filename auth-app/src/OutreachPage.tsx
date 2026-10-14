import { ArrowRight, CaretRight, MagnifyingGlass, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityFilters, ActivityRow, Channel } from "./api/outreachActivity";
import { listActivity } from "./api/outreachActivity";
import { LIVE } from "./api/client";
import { Lit } from "./CallLine";
import type { Ctx } from "./CampaignWorkspace";
import { CampaignHeader } from "./CampaignWorkspace";
import { can, type Standing, standingOf } from "./can";
import {
  arrowsStepRows, BAND_LABEL, campaignInitials, groupKey, GROUP_ROWS, initialsOf, openGroups, RANGE_LABEL, rangeOf, stepIndex,
} from "./callsView";
import type { RangePreset } from "./callsView";
import { ChannelMark, channelName } from "./ChannelMark";
import { Loader } from "./components/Loader";
import { EmptyArt } from "./EmptyArt";
import { GhostChart } from "./GhostChart";
import { OutreachSheet } from "./OutreachSheet";
import {
  bandOfActivity, byLine, CHANNEL_TABS, countWord, lastWord, lengthOf, lineOf, personChoices, personOf, readRemembered, STATUS_FILTERS, STATUS_LABEL,
  STATUS_TONE, statusFilterOf, summaryLine, tabCount, WHATSAPP_WAITING, whenOf, writeRemembered,
} from "./outreachActivityView";
import type { ChannelTab } from "./outreachActivityView";
import { fixtureActivity } from "./outreachFixtures";
import { useSession } from "./roleStore";
import { toneProps } from "./statusTones";
import { Dialog, LoadFailed } from "./ui";
import { useOutreachActivity, visibleActivity } from "./useOutreachActivity";
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
      <span {...toneProps(STATUS_TONE[r.status])} className="kl-how kl-ell st">{STATUS_LABEL[r.status]}</span>
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
};

/** Search, status, dates and (for an owner or admin) person. */
export function OutreachToolbar(p: ToolbarProps) {
  return (
    <div className="kl-bar" role="search">
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
        <span className="sr-only">Status</span>
        <select value={p.status} onChange={(e) => p.onStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
    window.requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div className="ko-switch" role="radiogroup" aria-label="Channel" onKeyDown={step}>
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

const PAGE = 25;
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
  const [state, setState] = useState<{ items: ActivityRow[]; next: string | null; phase: "loading" | "ready" | "failed"; more: boolean }>({
    items: [], next: null, phase: "loading", more: false,
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

  const f: ActivityFilters = { ...filters, campaignId: group.id, q: dq || undefined, status: statusFilterOf(status) || undefined };
  const key = JSON.stringify(f);
  useEffect(() => {
    const mine = ++asked.current;
    setState((s) => ({ ...s, phase: "loading" }));
    const read = LIVE ? listActivity(f, { limit: PAGE }) : Promise.resolve(fixtureActivity(f));
    read.then(
      (page) => { if (mine === asked.current) setState({ items: page.rows, next: page.nextCursor, phase: "ready", more: false }); },
      () => { if (mine === asked.current) setState((s) => ({ ...s, phase: s.items.length ? "ready" : "failed" })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!focusId || focused.current || state.phase !== "ready") return;
    const el = list.current?.querySelector<HTMLElement>(`[data-ko-row="${CSS.escape(focusId)}"]`);
    if (!el) return;
    focused.current = true;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }, [focusId, state.phase, state.items]);

  const more = useCallback(() => {
    if (!state.next || state.more) return;
    const mine = asked.current;
    setState((s) => ({ ...s, more: true }));
    listActivity(f, { limit: PAGE, cursor: state.next }).then(
      (page) => {
        if (mine !== asked.current) return;
        setState((s) => {
          const seen = new Set(s.items.map((r) => r.id));
          return { items: [...s.items, ...page.rows.filter((r) => !seen.has(r.id))], next: page.nextCursor, phase: "ready", more: false };
        });
      },
      () => { if (mine === asked.current) setState((s) => ({ ...s, more: false })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.next, state.more, key]);

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
              {state.phase === "ready" && narrowed ? `${state.items.length}${state.next ? "+" : ""} of ${countWord(group.count, tab)}` : countWord(group.count, tab)}
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
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <div className="klm-body">
        {state.phase === "loading" && state.items.length === 0 && <div className="kl-wait is-small" aria-busy="true"><Loader size="md" label="Loading" block /></div>}
        {state.phase === "failed" && <p className="t-body kl-quiet kl-pad">These couldn't be loaded. Close this and try again in a moment.</p>}
        {state.phase === "ready" && state.items.length === 0 && <p className="t-body kl-quiet kl-pad">{narrowed ? "Nothing matches." : "Nothing here yet."}</p>}
        {state.items.length > 0 && (
          <ul ref={list} className="kl-rows klm-rows">
            {state.items.map((r) => (
              <li key={r.id}><OutreachLine r={r} on={false} showBy={showBy} hit={dq} onOpen={onOpen} /></li>
            ))}
          </ul>
        )}
        {state.next && (
          <button type="button" className="kl-more klm-more" disabled={state.more} onClick={more}>
            {state.more ? <><Loader size="sm" tone="inherit" /> Loading</> : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════ the list ═════════════════════════ */

type Summary = ReturnType<typeof useOutreachActivity>["channels"];

function OutreachList({ campaignId, standing, onSummary, onAgent }: {
  campaignId?: string | undefined;
  standing: Standing;
  /** The page's one line of figures. */
  onSummary?: ((c: Summary | null) => void) | undefined;
  onAgent?: ((prompt: string) => void) | undefined;
}) {
  const session = useSession();
  const userId = session.userId;
  const [tab, setTab] = useState<ChannelTab>("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [preset, setPreset] = useState<RangePreset>("any");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [person, setPerson] = useState("");
  const dq = useDebounced(q.trim(), 250);

  const range = preset === "custom" ? { from: custom.from || undefined, to: custom.to || undefined } : rangeOf(preset);
  const filters: ActivityFilters = useMemo(
    () => ({
      channel: tab || undefined,
      q: dq || undefined,
      status: statusFilterOf(status) || undefined,
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
  const data = useOutreachActivity({ campaignId, filters, open: openSet });
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
    const next = new Set(Object.entries(shown).filter(([, v]) => v).map(([k]) => k));
    setOpenSet((cur) => (cur.size === next.size && [...next].every((k) => cur.has(k)) ? cur : next));
  }, [shown]);
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

  // The line that is open, and the keyboard.
  const [openRow, setOpenRow] = useState<ActivityRow | null>(null);
  const [all, setAll] = useState<ModalGroup | null>(null);
  /* A line opened from the "view all" dialog: where the dialog was, so closing the sheet brings it back there. */
  const [back, setBack] = useState<{ group: ModalGroup; q: string; id: string } | null>(null);
  const view = useRef<{ q: string }>({ q: "" });
  const rows = useMemo(() => visibleActivity(data, openSet, flat, flat ? undefined : GROUP_ROWS), [data, openSet, flat]);

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

  const everyone = data.canSeeEveryone || standing === "owner" || standing === "admin";
  const personOptions = personChoices(data.people, userId);
  const clear = () => { setQ(""); setStatus(""); setPreset("any"); setCustom({ from: "", to: "" }); setPerson(""); };

  useEffect(() => {
    if (!onSummary) return;
    onSummary(data.phase === "ready" ? data.channels : null);
  }, [onSummary, data.phase, data.channels]);

  const bands = new Set(data.groups.filter((g) => g.count > 0).map((g) => bandOfActivity(g.lastAt)));
  const showBands = !flat && bands.size > 1;
  const hit = flat ? "" : dq;
  const nothingAtAll = data.phase === "ready" && data.channels.all === 0 && !narrowed;
  const whatsappEmpty = tab === "whatsapp" && data.phase === "ready" && data.total === 0 && !narrowed;

  return (
    <>
      {(data.phase !== "ready" || !nothingAtAll || narrowed) && (
        <ChannelSwitch value={tab} onChange={setTab} counts={data.phase === "ready" ? data.channels : null} />
      )}

      {(data.phase !== "ready" || data.channels.all > 0 || narrowed) && (
        <OutreachToolbar
          q={q} onQ={setQ}
          status={status} onStatus={setStatus}
          preset={preset} onPreset={setPreset}
          custom={custom} onCustom={setCustom}
          person={person} onPerson={setPerson}
          people={personOptions}
          showPerson={everyone && data.people.length > 1}
        />
      )}

      <div ref={list} className={`kl-list${openRow ? " has-open" : ""}`}>
        {data.phase === "loading" && (
          <div className="kl-wait" aria-busy="true"><Loader size="lg" label="Loading outreach" block /></div>
        )}
        {data.phase === "failed" && <LoadFailed what="Your outreach" onRetry={data.refresh} />}
        {whatsappEmpty && (
          <GhostChart kind="table" title="WhatsApp" line={data.whatsappConnected ? "No WhatsApp chats yet." : WHATSAPP_WAITING} />
        )}
        {data.phase === "ready" && data.total === 0 && !whatsappEmpty && (
          <div className="kl-empty">
            {narrowed ? <EmptyArt name="empty-search" size={160} /> : <EmptyArt name="empty-sent" size={200} />}
            <p className="t-body-strong">{narrowed ? "Nothing matches." : "No outreach yet."}</p>
            <p className="t-body-sm kl-quiet">
              {narrowed
                ? "Try another word, status or date."
                : "Emails you send, WhatsApp chats and calls you place from SuperHyre show up here."}
            </p>
            {narrowed && <button type="button" className="kl-btn" onClick={clear}>Clear filters</button>}
          </div>
        )}
        {data.phase === "ready" && data.total > 0 && (
          <ul className={`kl-groups${flat ? " is-flat" : ""}`}>
            {data.groups.map((g, gi) => {
              const key = groupKey(g);
              if (g.count === 0) return null;
              const isOpen = flat || (shown[key] ?? false);
              const rowsOf = data.rows[key];
              const band = bandOfActivity(g.lastAt);
              const prev = data.groups.slice(0, gi).reverse().find((x) => x.count > 0);
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
                          <span className="kl-gname kl-ell"><Lit text={g.campaign?.name ?? "Not on a campaign"} q={hit} /></span>
                          {g.campaign?.client && <span className="kl-gclient kl-ell"><Lit text={g.campaign.client} q={hit} /></span>}
                        </span>
                        <span className="ko-gstats">
                          <span className="ko-gcount">{countWord(g.count, tab)}</span>
                          <span className="ko-glast"><span className="kl-glast-w">{lastWord(g.lastAt).word} </span>{whenOf(g.lastAt)}</span>
                        </span>
                        <CaretRight size={14} weight="bold" className="kl-caret" aria-hidden="true" />
                      </button>
                    </h2>
                  )}
                  {isOpen && (
                    <div id={`ko-g-${key}`} className="kl-gbody">
                      {!rowsOf || (rowsOf.phase === "loading" && rowsOf.items.length === 0) ? (
                        <div className="kl-wait is-small" aria-busy="true"><Loader size="md" label="Loading" block /></div>
                      ) : rowsOf.phase === "failed" ? (
                        <LoadFailed what="These" compact onRetry={data.refresh} />
                      ) : rowsOf.items.length === 0 ? (
                        <p className="t-body kl-quiet kl-pad">{narrowed ? "Nothing matches here." : "Nothing here yet."}</p>
                      ) : (
                        <>
                          <ul className="kl-rows">
                            {(flat ? rowsOf.items : rowsOf.items.slice(0, GROUP_ROWS)).map((r) => (
                              <li key={r.id}>
                                <OutreachLine r={r} on={r.id === openRow?.id} showBy={everyone} hit={hit} onOpen={(row) => { setBack(null); setOpenRow(row); }} />
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
                          {flat && rowsOf.next && (
                            <div className="kl-gfoot is-more">
                              <button type="button" className="kl-more" disabled={rowsOf.more === "loading"} onClick={() => data.loadMore(key)}>
                                {rowsOf.more === "loading" ? <><Loader size="sm" tone="inherit" /> Loading</> : rowsOf.more === "failed" ? "Couldn't load more. Try again" : "Load more"}
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

      {openRow && (
        <OutreachSheet
          row={openRow}
          onAgent={onAgent}
          onChanged={data.refresh}
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

/** The title and one plain muted line of figures: "412 emails, 31 WhatsApp chats, 96 calls, 38% answered". */
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
  const [counts, setCounts] = useState<Summary | null>(null);
  const line = counts ? summaryLine(counts) : "";
  return (
    <div className="cw kl ko kl-in-campaign">
      <CampaignHeader ctx={ctx} title="Outreach" meta={line || "Emails, WhatsApp chats and calls for this campaign."} />
      <OutreachList campaignId={ctx.campaignId} standing={standing} onSummary={setCounts} onAgent={(p) => ctx.onAgent(p)} />
    </div>
  );
}

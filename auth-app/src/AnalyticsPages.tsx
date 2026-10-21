import { loadSection, saveSection } from "./sectionState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./analytics.css";
import { HBars, type HBar } from "./AnalyticsCharts";
import {
  campaignsFixture,
  callsFixture,
  outreachFixture,
  overviewFixture,
  pipelineFixture,
  recruitersFixture,
  weeklyFixture,
} from "./analyticsFixtures";
import {
  clampRange,
  DEFAULT_FILTERS,
  filtersKey,
  filtersToHashQuery,
  filtersToParams,
  parseFilters,
  pathOfHash,
  PRESET_DAYS,
  queryOfHash,
  readRemembered,
  remember,
  shortDay,
  ymd,
  type Filters,
} from "./analyticsFilters";
import {
  Cut, DataModal, DataTable, Details, Drawer, Export, Facts, Kpis, nextSort, Panel, Segmented, shapeRows, Thin, ViewAll,
  type DetailSection, type GhostSpec, type Kpi, type ModalCol, type SortState,
} from "./analyticsKit";
import {
  activityText,
  againstBefore,
  callLength,
  campaignKpis,
  campaignsTable,
  CHANNEL_LABEL,
  CHANNEL_TABS,
  channelCounts,
  clientsTable,
  csvName,
  dayLabel,
  EMAIL_STEP_LABEL,
  emptyCopy,
  fmt,
  funnelRows,
  hourName,
  hubOf,
  medianDays,
  medianValue,
  mineTiles,
  outcomesInOrder,
  parseChannel,
  PERSON_COLUMNS,
  peopleTable,
  pipelineHasPeople,
  plural,
  ratioText,
  replyTime,
  shareValue,
  sourcesTable,
  stageText,
  summaryLine,
  talkTime,
  thresholdLine,
  WHATSAPP_LINE,
  type ChannelTab,
  toRatio,
  totalOf,
  typicalLine,
  waitingTable,
  weeklyTable,
  SMALL_N,
  type EmptyCopy,
  type PersonColumn,
} from "./analyticsView";
import {
  getCalls,
  getCampaignsAnalytics,
  getOutreach,
  getOverview,
  getPersonWeekly,
  getPipeline,
  getRecruiters,
  type AnalyticsQuery,
  type CallsAnalytics,
  type CampaignStats,
  type CampaignsAnalytics,
  type Envelope,
  type OutreachAnalytics,
  type OutreachExtras,
  type OutreachHub,
  type OverviewAnalytics,
  type PersonRow,
  type PersonWeekly,
  type PipelineAnalytics,
  type RecruitersAnalytics,
  type Ratio,
  type WaitingPerson,
} from "./api/analytics";
import { LIVE } from "./api/client";
import { standingOf } from "./can";
import { useCampaignRows, useClients, useMemberList, useTeam } from "./campaignStore";
import { ShimmerRegion } from "./components/Shimmer";
import { HBarsGhost, KpisGhost, TableGhost } from "./analyticsGhosts";
import { EmptyArt } from "./EmptyArt";
import { LoadFailed } from "./ui";
import { campaignLink, isKnownHash, NAV, ROUTES, type RouteId } from "./nav";
import { useSession } from "./roleStore";
import { SwitchPane, useSlide } from "./switchMotion";
import type { Table } from "./xlsx";

/**
 * The five Analytics pages (Overview, Recruiters, Outreach, Pipeline, Campaigns), one plain template: a title,
 * one factual line, a slim row of filters, three figures in one card, then one chart and one short table (or the
 * one table the page's first question needs). Everything else is behind "Details" or "View all".
 *
 * Each page reads its own endpoint, keeps the last numbers dimmed while it refetches, says a calm failure with
 * Try again and, where a card has nothing to draw, shows a soft ghost of it with one line on what will appear
 * (GhostChart.tsx). Without an API (fixtures) every page draws the same shapes from analyticsFixtures.ts.
 *
 * Orange is used once on a page, for the thing that matters (the hired step, the hires column). Every other mark
 * is a warm neutral, and a card has two text sizes: its title and everything else.
 */

type Role = "owner" | "admin" | "recruiter" | "personal";

/* ── filters: the address, remembered per person ─────────────────────────── */

/** The address's filters, without the Outreach channel tab that shares it. */
function filterQuery(hash: string): string {
  const p = new URLSearchParams(queryOfHash(hash));
  p.delete("channel");
  return p.toString();
}

function useFilters(route: RouteId) {
  const session = useSession();
  const standing = standingOf(session);
  const canPickPerson = standing === "owner" || standing === "admin";
  const selfId = session.userId ?? null;
  const path = ROUTES[route].path;
  const parse = useCallback((q: string) => parseFilters(q, { canPickPerson, selfId }), [canPickPerson, selfId]);
  const [filters, setState] = useState<Filters>(() => {
    const fromAddress = filterQuery(window.location.hash);
    return parse(fromAddress || readRemembered(selfId));
  });
  const live = useRef(filters);
  live.current = filters;

  const write = useCallback((f: Filters) => {
    const p = new URLSearchParams(filtersToHashQuery(f));
    /* The Outreach page's channel tab rides in the same address; changing a filter does not drop it. */
    const channel = new URLSearchParams(queryOfHash(window.location.hash)).get("channel");
    if (channel && path === ROUTES["analytics-outreach"].path) p.set("channel", channel);
    const q = p.toString();
    const target = `#${path}${q ? `?${q}` : ""}`;
    if (window.location.hash !== target) window.history.replaceState(window.history.state, "", target);
  }, [path]);

  /* What was remembered goes into the address, so a link copied from here carries it. */
  useEffect(() => {
    write(live.current);
  }, [write]);

  /* An address followed from elsewhere (a link in "Worth a look", Back) names its own filters; one with none keeps these. */
  useEffect(() => {
    const on = () => {
      if (pathOfHash(window.location.hash).replace(/\/+$/, "") !== path) return;
      const q = filterQuery(window.location.hash);
      if (!q) {
        write(live.current);
        return;
      }
      const next = parse(q);
      setState(next);
      remember(selfId, next);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [path, parse, write, selfId]);

  const set = useCallback((next: Filters) => {
    setState(next);
    write(next);
    remember(selfId, next);
  }, [write, selfId]);

  return { filters, set, standing: standing as Role, canPickPerson, selfId };
}

/* ── data ────────────────────────────────────────────────────────────────── */

type Loaded<T> = { data: T | null; failed: boolean; busy: boolean; retry: () => void };

/**
 * One request per set of filters. The last answer stays (dimmed) while the next one loads, so changing a filter
 * never blanks the page; a first load has no data and shows the loader. Late answers to an earlier question are
 * dropped. With `enabled` false nothing is asked (a person with no id of their own has no weeks to fetch).
 */
function useAnalytics<T>(load: (q: AnalyticsQuery) => Promise<T>, fixture: () => T, f: Filters, extra = "", enabled = true): Loaded<T> {
  const key = `${filtersKey(f)}|${extra}`;
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(LIVE && enabled);
  const seq = useRef(0);
  const fx = useMemo(() => (LIVE || !enabled ? null : fixture()), [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    if (!LIVE || !enabled) return;
    const id = ++seq.current;
    setFailed(false);
    setBusy(true);
    load(filtersToParams(f)).then(
      (d) => {
        if (id !== seq.current) return;
        setData(d);
        setBusy(false);
      },
      () => {
        if (id !== seq.current) return;
        setFailed(true);
        setBusy(false);
      },
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the filters (key) change
  }, [key, enabled]);
  useEffect(run, [run]);
  return { data: LIVE ? data : fx, failed: LIVE && failed, busy: LIVE && busy, retry: run };
}

/* ── the page template ───────────────────────────────────────────────────── */

type BusyPage = "overview" | "recruiters" | "mine" | "outreach" | "pipeline" | "campaigns";

/**
 * A page while its numbers load: the figures with their real labels and each card with its real title and header row,
 * in the same grid areas as the loaded page, so nothing moves when they arrive. `weeks` is the small table of one
 * person's weeks (in Details).
 */
function Busy({ page = "overview", weeks = false }: { page?: BusyPage; weeks?: boolean }): JSX.Element {
  if (weeks) {
    return <ShimmerRegion label="Loading the weeks"><TableGhost heads={["Week", ">Emails", ">Calls", ">Interviews"]} rows={4} /></ShimmerRegion>;
  }
  const label = "Loading";
  switch (page) {
    case "overview":
      return (
        <ShimmerRegion label={label}>
          <KpisGhost labels={["Hires", "Moved to interview", "Replies"]} />
          <div className="an-dash is-overview">
            <Panel area="fn" title="Where people drop"><HBarsGhost n={6} /></Panel>
            <Panel area="wk" title="By week"><TableGhost heads={["Week", ">Moved to interview", ">Hired"]} rows={5} /></Panel>
          </div>
        </ShimmerRegion>
      );
    case "recruiters":
      return (
        <ShimmerRegion label={label}>
          <KpisGhost labels={["Emails sent", "Calls placed", "Moved to interview"]} />
          <div className="an-dash is-single">
            <Panel area="pp" title="People">
              <TableGhost heads={CARD_COLUMNS.map((id) => (id === "name" ? "Person" : `>${id === "emails" ? "Emails sent" : id === "calls" ? "Calls placed" : PERSON_COLUMNS.find((c) => c.id === id)?.label ?? id}`))} rows={5} />
            </Panel>
          </div>
        </ShimmerRegion>
      );
    case "mine":
      return (
        <ShimmerRegion label={label}>
          <KpisGhost labels={["Emails sent", "Calls placed", "Moved to interview"]} />
          <div className="an-dash is-single">
            <Panel area="pp" title="Waiting longest"><TableGhost heads={["Person", "Campaign", "Step", ">Days there"]} rows={4} /></Panel>
          </div>
        </ShimmerRegion>
      );
    case "outreach":
      return (
        <ShimmerRegion label={label}>
          <div className="an-chan">
            <Segmented label="Channel" value="all" options={CHANNEL_TABS.map((id) => ({ id, name: CHANNEL_LABEL[id] }))} onChange={() => undefined} />
          </div>
          <KpisGhost labels={["Touches sent", "Answered", "Answer rate"]} />
          <div className="an-dash is-outreach">
            <Panel area="tc" title="Answer rate by channel"><HBarsGhost n={3} stack /></Panel>
            <Panel area="bc" title="By campaign"><TableGhost heads={["Campaign", ">Sent", ">Replied", ">Calls", ">Connected"]} rows={5} /></Panel>
          </div>
        </ShimmerRegion>
      );
    case "pipeline":
      return (
        <ShimmerRegion label={label}>
          <KpisGhost labels={["In progress", "Waiting longer than usual", "Time to hire"]} />
          <div className="an-dash is-pipeline">
            <Panel area="ln" title="Where people are now"><HBarsGhost n={6} /></Panel>
            <Panel area="wl" title="Waiting longest"><TableGhost heads={["Person", "Campaign", "Step", ">Days there"]} rows={5} /></Panel>
          </div>
        </ShimmerRegion>
      );
    case "campaigns":
      return (
        <ShimmerRegion label={label}>
          <KpisGhost labels={["Active campaigns", "Hired of planned", "Gone quiet"]} />
          <div className="an-dash is-single">
            <Panel area="pp" title="Campaigns"><TableGhost heads={["Campaign", "Owner", "Hired of planned", ">Replied", "Last activity"]} rows={6} /></Panel>
          </div>
        </ShimmerRegion>
      );
  }
}

type Option = { id: string; name: string };

/** A small labelled select: the label is the control's name, in the same 32 px chip. */
function Pick({ label, value, all, options, onChange, wide = false }: {
  label: string;
  value: string | null;
  all: string;
  options: readonly Option[];
  onChange: (v: string | null) => void;
  /** On a phone it takes the whole row. */
  wide?: boolean;
}) {
  return (
    <label className={`an-sel${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

/**
 * The toolbar, the same on every page: period, campaign, client and (for an owner or admin) recruiter, in one
 * compact row of 32 px controls. A recruiter on Overview and Outreach also chooses between their own work and
 * the campaigns' totals. "Clear" is there only when something other than the default is set.
 */
export function FilterBar({ filters, onChange, canPickPerson, withView }: {
  filters: Filters;
  onChange: (f: Filters) => void;
  canPickPerson: boolean;
  withView: boolean;
}) {
  const rows = useCampaignRows();
  const { clients, clientOf } = useClients();
  const members = useMemberList();
  const team = useTeam();
  const today = ymd(new Date());
  const custom = filters.period.kind === "custom";
  const [draft, setDraft] = useState({
    from: filters.period.kind === "custom" ? filters.period.from : ymd(new Date(Date.now() - 29 * 86_400_000)),
    to: filters.period.kind === "custom" ? filters.period.to : today,
  });
  const [rangeNote, setRangeNote] = useState<string | null>(null);
  useEffect(() => {
    if (filters.period.kind === "custom") setDraft({ from: filters.period.from, to: filters.period.to });
  }, [filters.period]);

  const campaigns = useMemo<Option[]>(
    () => rows
      .filter((r) => !filters.clientId || clientOf[r.id] === filters.clientId)
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, clientOf, filters.clientId],
  );
  const clientOptions = useMemo<Option[]>(
    () => clients.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  const people = useMemo<Option[]>(() => {
    if (LIVE) return members.members.map((m) => ({ id: m.userId, name: m.fullName?.trim() || m.email || "A teammate" }));
    return team.map((n) => ({ id: n, name: n }));
  }, [members.members, team]);

  const periodSlide = useSlide<HTMLDivElement>('[aria-pressed="true"]');
  const setPeriod = (days: number) => onChange({ ...filters, period: { kind: "days", days } });
  const tryRange = (from: string, to: string) => {
    setDraft({ from, to });
    const ok = clampRange(from, to);
    if (!ok) {
      setRangeNote(from && to && from <= to ? "Pick a range of up to a year." : "Pick a start day that is before the end day.");
      return;
    }
    setRangeNote(null);
    onChange({ ...filters, period: { kind: "custom", ...ok } });
  };
  const changed = filtersKey(filters) !== filtersKey(DEFAULT_FILTERS);
  const what = filters.campaignId ? (campaigns.find((c) => c.id === filters.campaignId)?.name ?? "one campaign") : "all campaigns";

  return (
    <form className="an-tool" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
      <div className="an-tool-row">
        <div className="an-seg sw-host" role="group" aria-label="Period" {...periodSlide.host}>
          {periodSlide.mark}
          {PRESET_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={filters.period.kind === "days" && filters.period.days === d}
              onClick={() => { setRangeNote(null); setPeriod(d); }}
            >
              {d} days
            </button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => tryRange(draft.from, draft.to)}>
            Custom
          </button>
        </div>
        <Pick
          wide
          label="Campaign"
          value={filters.campaignId}
          all="All campaigns"
          options={campaigns}
          onChange={(v) => onChange({ ...filters, campaignId: v })}
        />
        {clientOptions.length > 0 && (
          <Pick
            label="Client"
            value={filters.clientId}
            all="All clients"
            options={clientOptions}
            onChange={(v) => onChange({
              ...filters,
              clientId: v,
              /* A campaign that is not this client's would answer with nothing. */
              campaignId: v && filters.campaignId && clientOf[filters.campaignId] !== v ? null : filters.campaignId,
            })}
          />
        )}
        {canPickPerson && people.length > 0 && (
          <Pick
            label="Recruiter"
            value={filters.userId}
            all="Everyone"
            options={people}
            onChange={(v) => onChange({ ...filters, userId: v })}
          />
        )}
        {withView && (
          <Pick
            label="Showing"
            value={filters.view === "campaigns" ? "campaigns" : null}
            all="My work"
            options={[{ id: "campaigns", name: "Everyone on my campaigns" }]}
            onChange={(v) => onChange({ ...filters, view: v === "campaigns" ? "campaigns" : "mine" })}
          />
        )}
        {changed && (
          <button type="button" className="an-clear" onClick={() => { setRangeNote(null); onChange(DEFAULT_FILTERS); }}>
            Clear
          </button>
        )}
      </div>
      {custom && (
        <div className="an-tool-row an-range">
          <label className="an-sel">
            <span>From</span>
            <input type="date" value={draft.from} max={today} onChange={(e) => tryRange(e.target.value, draft.to)} />
          </label>
          <label className="an-sel">
            <span>To</span>
            <input type="date" value={draft.to} max={today} onChange={(e) => tryRange(draft.from, e.target.value)} />
          </label>
          {rangeNote && <p className="an-range-note" role="status">{rangeNote}</p>}
        </div>
      )}
      <span className="an-sr" role="status" aria-live="polite">
        Showing {filters.period.kind === "days" ? `${filters.period.days} days` : `${shortDay(filters.period.from)} to ${shortDay(filters.period.to)}`}, {what}.
      </span>
    </form>
  );
}

function Shell({ title, summary, bar, busy, children }: {
  title: string;
  /** One factual line: the period, what it is about, and the page's own figures. */
  summary: string;
  bar: React.ReactNode;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="con-page an-page" aria-busy={busy || undefined}>
      <header className="an-head">
        <h1 className="con-h1">{title}</h1>
        <p className="an-sum">{summary}</p>
      </header>
      {bar}
      <div className={`an-body${busy ? " is-busy" : ""}`}>{children}</div>
    </div>
  );
}

/** What a page is about, in words: one campaign, one client or all campaigns, and one person when one is picked. */
function useScope(filters: Filters): string {
  const rows = useCampaignRows();
  const { clients } = useClients();
  const members = useMemberList();
  const campaign = filters.campaignId ? rows.find((r) => r.id === filters.campaignId)?.name : null;
  const client = !campaign && filters.clientId ? clients.find((c) => c.id === filters.clientId)?.name : null;
  const member = filters.userId ? members.members.find((m) => m.userId === filters.userId) : null;
  const person = filters.userId ? (member ? member.fullName?.trim() || member.email : LIVE ? null : filters.userId) : null;
  return [campaign ?? client ?? "all campaigns", person].filter(Boolean).join(", ");
}

/** The comparison with the period before, said once, for the Details window. */
const windowLine = (p: Envelope["period"] | undefined): string | null =>
  p && p.from && p.to && p.prevFrom && p.prevTo
    ? `${shortDay(p.from)} to ${shortDay(p.to)}, against ${shortDay(p.prevFrom)} to ${shortDay(p.prevTo)}`
    : null;

const note = (...parts: Array<string | null | undefined | false>): string => parts.filter(Boolean).join(" · ");

/**
 * The page-level empty state: one calm banner above the ghost cards, instead of a strip of zeros. Same words as
 * every other empty state in the app, the picture once.
 */
export function EmptyBlock({ copy, art = true }: { copy: EmptyCopy; art?: boolean }) {
  return (
    <div className="an-banner es is-empty">
      {art && <EmptyArt name="empty-analytics" size={72} />}
      <div className="an-banner-t">
        <h2 className="es-t t-title-sm">{copy.head}</h2>
        <p className="es-p t-body">{copy.text}</p>
      </div>
      {copy.action && <a className="ct-btn es-act" href={copy.action.href}>{copy.action.label}</a>}
    </div>
  );
}

/** A quiet period with data behind it: "Show 90 days" (never a create action) until it is already 90. */
function widen(path: string, f: Filters) {
  if (f.period.kind === "days" && f.period.days >= 90) return null;
  const q = filtersToHashQuery({ ...f, period: { kind: "days", days: 90 } });
  return { label: "Show 90 days", href: `#${path}${q ? `?${q}` : ""}` };
}

const nothingIn = (f: Filters): string => `Nothing in the last ${f.period.kind === "days" ? `${f.period.days} days` : "range you picked"}.`;

/** Whether the last bucket is a week (or day) that is not over yet. */
function lastIsPartial(last: string | undefined, grain: "day" | "week", to: string): boolean {
  if (!last || !to) return false;
  if (grain === "day") return last >= to;
  const d = new Date(`${last.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return ymd(d) > to;
}

/** The rows a card shows before "View all". */
const ROWS = 6;

/* ── Overview ────────────────────────────────────────────────────────────── */

const OVERVIEW_HOW = [
  "A hire is a person at Hired now whose latest move into Hired is in the period; moved back is not a hire. Planned is the number of hires the open campaigns are aiming for.",
  "Moved to interview counts people who entered Interviewing in the period, once each. There is no interview calendar, so we never say interviews held.",
  "Replies are people with a reply noted on a sent email. The numbers are only as complete as the noting.",
  "Under each step of the funnel is the share of the step before: this step's count over that one's.",
];

export function OverviewAnalyticsPage(): JSX.Element {
  const { filters, set, standing, canPickPerson } = useFilters("analytics-overview");
  const q = useAnalytics(getOverview, () => overviewFixture(filters, standing), filters);
  const scope = useScope(filters);
  const d = q.data;
  const parts = d && !d.empty
    ? [plural(d.tiles.hires.n, "hire"), plural(d.tiles.replies.n, "reply", "replies"), `${fmt(d.tiles.interviews.n)} moved to interview`]
    : [];
  return (
    <Shell
      title="Overview"
      summary={summaryLine(filters.period, scope, parts)}
      busy={q.busy}
      bar={<FilterBar filters={filters} onChange={set} canPickPerson={canPickPerson} withView={standing === "recruiter"} />}
    >
      {q.failed ? <LoadFailed what="The overview" onRetry={q.retry} /> : !q.data ? <Busy /> : <OverviewBody data={q.data} filters={filters} />}
    </Shell>
  );
}

type WeekRow = { start: string; label: string; interviews: number; hires: number };

export function OverviewBody({ data, filters }: { data: OverviewAnalytics; filters: Filters }) {
  const [all, setAll] = useState(false);
  const days = data.period.days;
  const page = data.empty;
  const t = data.tiles;
  const rows = funnelRows(data.funnel);
  const trend = data.trend.points;
  const grain = data.trend.grain;
  const funnelEmpty = page || rows.every((r) => r.n === 0);
  const trendEmpty = page || trend.every((p) => p.interviews === 0 && p.hires === 0);
  const partial = lastIsPartial(trend[trend.length - 1]?.start, grain, data.period.to);
  /* The latest first: what a person opens the page for. */
  const weeks: WeekRow[] = [...trend].reverse().map((p, i) => ({
    start: p.start,
    label: `${grain === "week" ? "Week of " : ""}${dayLabel(p.start)}${i === 0 && partial ? " (so far)" : ""}`,
    interviews: p.interviews,
    hires: p.hires,
  }));
  const look = data.lookAt.filter((l) => l.count > 0).slice(0, 3);
  const kpis: Kpi[] = [
    { id: "hires", label: "Hires", value: fmt(t.hires.n), note: note(t.hires.planned > 0 && `of ${fmt(t.hires.planned)} planned`, againstBefore(t.hires.n, t.hires.prev)) },
    { id: "interviews", label: "Moved to interview", value: fmt(t.interviews.n), note: againstBefore(t.interviews.n, t.interviews.prev) },
    { id: "replies", label: "Replies", value: fmt(t.replies.n), note: note(t.replies.contacted > 0 && `of ${fmt(t.replies.contacted)} contacted`, againstBefore(t.replies.n, t.replies.prev)) },
  ];
  const bars: HBar[] = rows.map((r, i) => ({
    id: r.id,
    label: r.label,
    value: r.n,
    count: fmt(r.n),
    share: i === 0 || !r.fromPrev ? null : ratioText(r.fromPrev),
    accent: r.id === "hired",
    title: r.cohort ? r.cohort.text : undefined,
  }));
  const cols: Array<ModalCol<WeekRow>> = [
    { id: "start", label: grain === "week" ? "Week" : "Day", sort: (w) => w.start, cell: (w) => w.label },
    { id: "interviews", label: "Moved to interview", right: true, sort: (w) => w.interviews, cell: (w) => fmt(w.interviews) },
    { id: "hires", label: "Hired", right: true, sort: (w) => w.hires, cell: (w) => fmt(w.hires) },
  ];
  const quietFunnel: GhostSpec = page
    ? { kind: "bars", line: "Shortlist someone and the funnel fills in." }
    : { kind: "bars", line: nothingIn(filters), action: widen("/analytics", filters) };
  const quietWeeks: GhostSpec = page
    ? { kind: "table", line: "Weeks appear as people move to interview." }
    : { kind: "table", line: nothingIn(filters), action: widen("/analytics", filters) };
  return (
    <>
      {page && <EmptyBlock copy={emptyCopy("overview", data.emptyReason, { days })} />}
      {!page && <Kpis
        items={kpis}
        action={
          <Details
            window={windowLine(data.period)}
            how={OVERVIEW_HOW}
            sections={[{
              heading: "Worth a look",
              body: look.length === 0
                ? <p className="an-muted">Nothing needs a look right now.</p>
                : (
                  <ul className="an-look">
                    {look.map((l) => <li key={l.kind}><a href={isKnownHash(l.href) ? l.href : "#/"}>{l.text}</a></li>)}
                  </ul>
                ),
            }]}
          />
        }
      />}
      <div className="an-dash is-overview">
        <Panel
          area="fn"
          title="Where people drop"
          sub={`People added ${dayLabel(data.funnel.cohort.from)} to ${dayLabel(data.funnel.cohort.to)}. The percentage is the share of the step before.`}
          ghost={funnelEmpty ? quietFunnel : null}
        >
          <HBars rows={bars} label="People at each step, from found to hired" />
        </Panel>

        <Panel
          area="wk"
          title={grain === "week" ? "By week" : "By day"}
          action={
            <>
              <ViewAll count={weeks.length} shown={ROWS} onOpen={() => setAll(true)} />
              <Export table={trendEmpty ? undefined : weeklyTable(trend)} file={csvName("overview-trend", filters)} />
            </>
          }
          ghost={trendEmpty ? quietWeeks : null}
        >
          <DataTable rows={weeks.slice(0, ROWS)} cols={cols} rowKey={(w) => w.start} sort={null} label="Moved to interview and hired, by week" />
        </Panel>
      </div>

      <DataModal
        open={all}
        onClose={() => setAll(false)}
        title={grain === "week" ? "By week" : "By day"}
        rows={weeks}
        cols={cols}
        rowKey={(w) => w.start}
        searchOf={(w) => w.label}
        tableOf={() => weeklyTable(trend)}
        file={csvName("overview-trend", filters)}
        initialSort={{ col: "start", dir: "desc" }}
        placeholder="Search"
      />
    </>
  );
}

/* ── lists: who has waited longest ───────────────────────────────────────── */

const WAIT_COLS = (seesTeam: boolean, short: boolean): Array<ModalCol<WaitingPerson>> => [
  { id: "name", label: "Person", sort: (w) => w.name.toLowerCase(), cell: (w) => (w.campaignId ? <a href={campaignLink(w.campaignId, "pipeline")} title={w.name}>{w.name}</a> : <Cut text={w.name} />) },
  { id: "campaign", label: "Campaign", sort: (w) => w.campaign.toLowerCase(), cell: (w) => <Cut text={w.campaign} /> },
  { id: "stage", label: "Step", sort: (w) => stageText(w.stage, null), cell: (w) => stageText(w.stage, null) },
  { id: "days", label: "Days there", right: true, sort: (w) => w.days, cell: (w) => fmt(w.days) },
  ...(seesTeam && !short
    ? [{ id: "owner", label: "Looked after by", sort: (w: WaitingPerson) => (w.ownerName ?? "").toLowerCase(), cell: (w: WaitingPerson) => w.ownerName ?? "Not assigned" }]
    : []),
];

/** The people who have been at their step the longest: six of them, and a window for the rest. */
function WaitingList({ rows, seesTeam = true, file }: { rows: readonly WaitingPerson[]; seesTeam?: boolean; file: string }) {
  const [all, setAll] = useState(false);
  const short = WAIT_COLS(seesTeam, true);
  return (
    <>
      <DataTable rows={rows.slice(0, ROWS)} cols={short} rowKey={(w) => w.campaignCandidateId} sort={null} label="People who have waited longest" />
      <div className="an-more"><ViewAll count={rows.length} shown={ROWS} onOpen={() => setAll(true)} /></div>
      <DataModal
        open={all}
        onClose={() => setAll(false)}
        title="Waiting longest"
        sub="People who have been at their step the longest"
        rows={rows}
        cols={WAIT_COLS(seesTeam, false)}
        rowKey={(w) => w.campaignCandidateId}
        searchOf={(w) => `${w.name} ${w.campaign} ${stageText(w.stage, null)} ${w.ownerName ?? ""}`}
        tableOf={(r) => waitingTable([...r] as PipelineAnalytics["waitingLongest"], seesTeam)}
        file={file}
        initialSort={{ col: "days", dir: "desc" }}
        placeholder="Search people, campaigns, steps"
      />
    </>
  );
}

/* ── Recruiters / My work ────────────────────────────────────────────────── */

const TEAM_HOW = [
  "Reply rate is replies noted on a person's sent emails over emails they sent. Under 5 sent it is shown as a count.",
  "Connected is calls that reached a conversation; talk time adds up the connected ones.",
  "Tasks on time are tasks they finished by their due day, out of tasks due in the period. Waiting too long is people who have stayed at a step past the usual time.",
  "Moves made by automation are not counted to anyone, so these can be below the Overview.",
];
const MINE_HOW = [
  "These count what you did yourself: emails you sent, calls you placed, people you moved.",
  "Team typical is the middle of what others on your campaigns did; it only shows when at least three others had activity.",
  "Talk time adds up the calls that connected.",
];

export function RecruitersAnalyticsPage(): JSX.Element {
  const { filters, set, standing, canPickPerson } = useFilters("analytics-recruiters");
  const q = useAnalytics(getRecruiters, () => recruitersFixture(filters, standing), filters);
  const scope = useScope(filters);
  const mine = standing === "recruiter" || standing === "personal";
  const d = q.data;
  let parts: string[] = [];
  if (d && !d.empty) {
    if (mine && d.me) parts = [plural(d.me.emails.sent, "email"), plural(d.me.calls.placed, "call"), `${fmt(d.me.moves.interviews)} moved to interview`, plural(d.me.moves.hires, "hire")];
    else if (!mine) {
      const t = totalOf(d.people ?? []);
      parts = [plural(t.sent, "email"), plural(t.placed, "call"), `${fmt(t.interviews)} moved to interview`, plural(t.hires, "hire")];
    }
  }
  return (
    <Shell
      title={mine ? "My work" : "Recruiters"}
      summary={summaryLine(filters.period, scope, parts)}
      busy={q.busy}
      bar={<FilterBar filters={filters} onChange={set} canPickPerson={canPickPerson} withView={false} />}
    >
      {q.failed
        ? <LoadFailed what={mine ? "Your work" : "The team's work"} onRetry={q.retry} />
        : !q.data
          ? <Busy page={mine ? "mine" : "recruiters"} />
          : mine
            ? <MineBody data={q.data} filters={filters} standing={standing} />
            : <TeamBody data={q.data} filters={filters} />}
    </Shell>
  );
}

/** One person's weeks, asked for on its own, so a slow or failed one never holds the rest of the page. */
function useWeekly(userId: string | undefined, filters: Filters) {
  return useAnalytics<PersonWeekly>(
    (p) => getPersonWeekly(userId ?? "", p),
    () => weeklyFixture(userId ?? "", filters),
    filters,
    userId ?? "",
    !!userId,
  );
}

/** Week by week for one person, as a plain table: the latest first. */
function WeeksTable({ w }: { w: PersonWeekly }) {
  const rows = [...w.points].reverse();
  return (
    <div className="an-scroll">
      <table className="an-tbl">
        <thead>
          <tr>
            <th scope="col">{w.grain === "week" ? "Week" : "Day"}</th>
            <th scope="col" className="is-r">Emails</th>
            <th scope="col" className="is-r">Calls</th>
            <th scope="col" className="is-r">Interviews</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.start}>
              <th scope="row">{w.grain === "week" ? "Week of " : ""}{dayLabel(p.start)}</th>
              <td className="is-r">{fmt(p.emails)}</td>
              <td className="is-r">{fmt(p.calls)}</td>
              <td className="is-r">{fmt(p.interviews)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PERSON_CELL = (p: PersonRow, id: PersonColumn): string => {
  switch (id) {
    case "name": return p.name;
    case "emails": return fmt(p.emails.sent);
    case "replies": return fmt(p.emails.replied);
    case "replyRate": return ratioText(toRatio(p.emails.replied, p.emails.sent));
    case "calls": return fmt(p.calls.placed);
    case "connected": return fmt(p.calls.connected);
    case "talk": return talkTime(p.calls.talkSeconds);
    case "shortlisted": return fmt(p.moves.shortlisted);
    case "interviews": return fmt(p.moves.interviews);
    case "hires": return fmt(p.moves.hires);
    case "onTime": return p.tasks.due > 0 ? `${p.tasks.onTime} of ${p.tasks.due}` : "–";
    case "overdue": return fmt(p.tasks.overdue);
    case "inProgress": return fmt(p.load.inProgress);
    case "waiting": return fmt(p.load.waiting);
    case "campaigns": return fmt(p.load.campaigns);
  }
};

const TOTAL_CELL = (t: ReturnType<typeof totalOf>, id: PersonColumn): string => {
  switch (id) {
    case "emails": return fmt(t.sent);
    case "replies": return fmt(t.replied);
    case "calls": return fmt(t.placed);
    case "interviews": return fmt(t.interviews);
    case "hires": return fmt(t.hires);
    default: return "";
  }
};

const sortValue = (p: PersonRow, id: PersonColumn): string | number => {
  switch (id) {
    case "name": return p.name.toLowerCase();
    case "emails": return p.emails.sent;
    case "replies": return p.emails.replied;
    case "replyRate": return p.emails.sent > 0 ? p.emails.replied / p.emails.sent : -1;
    case "calls": return p.calls.placed;
    case "connected": return p.calls.connected;
    case "talk": return p.calls.talkSeconds;
    case "shortlisted": return p.moves.shortlisted;
    case "interviews": return p.moves.interviews;
    case "hires": return p.moves.hires;
    case "onTime": return p.tasks.due > 0 ? p.tasks.onTime / p.tasks.due : -1;
    case "overdue": return p.tasks.overdue;
    case "inProgress": return p.load.inProgress;
    case "waiting": return p.load.waiting;
    case "campaigns": return p.load.campaigns;
  }
};

/** What the table in the card shows; the other columns are in "View all", in a person's drawer and in the download. */
const CARD_COLUMNS: readonly PersonColumn[] = ["name", "emails", "replies", "calls", "interviews", "hires"];

/** Everything about one person, in a drawer: the numbers in groups, then their weeks. */
function PersonDrawer({ person, filters, onClose }: { person: PersonRow | null; filters: Filters; onClose: () => void }) {
  return (
    <Drawer open={person !== null} onClose={onClose} title={person?.name ?? ""} sub={person?.role === "owner" ? "Owner" : person?.role === "admin" ? "Admin" : "Recruiter"}>
      {person && <PersonBody person={person} filters={filters} />}
    </Drawer>
  );
}

function PersonBody({ person: p, filters }: { person: PersonRow; filters: Filters }) {
  const q = useWeekly(p.userId, filters);
  const groups: Array<{ label: string; ids: readonly PersonColumn[] }> = [
    { label: "Reach", ids: ["emails", "replies", "replyRate", "calls", "connected", "talk"] },
    { label: "Movement", ids: ["shortlisted", "interviews", "hires"] },
    { label: "Follow-through", ids: ["onTime", "overdue"] },
    { label: "Load now", ids: ["inProgress", "waiting", "campaigns"] },
  ];
  const label = (id: PersonColumn) => PERSON_COLUMNS.find((c) => c.id === id)?.label ?? id;
  return (
    <>
      {groups.map((g) => (
        <section key={g.label} className="and-sec">
          <h3>{g.label}</h3>
          <Facts rows={g.ids.map((id) => [label(id), PERSON_CELL(p, id)] as const)} />
        </section>
      ))}
      <section className="and-sec">
        <h3>Week by week</h3>
        {q.failed
          ? <LoadFailed what={`${p.name}'s weeks`} onRetry={q.retry} compact />
          : !q.data
            ? (p.userId ? <Busy weeks /> : <p className="an-muted">Weeks are not kept for this person.</p>)
            : <WeeksTable w={q.data} />}
      </section>
    </>
  );
}

export function TeamBody({ data, filters }: { data: RecruitersAnalytics; filters: Filters }) {
  const days = data.period.days;
  const people = data.people ?? [];
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<PersonRow | null>(null);
  const [sort, setSort] = useState<SortState>({ col: "name", dir: "asc" });

  /* The server says nothing happened in the period (or nobody is here yet): say that, once, not a strip of zeros. */
  const page = data.empty || people.length === 0;
  const total = totalOf(people);
  const prev = people.reduce(
    (a, p) => ({ emails: a.emails + (p.prev?.emailsSent ?? 0), calls: a.calls + (p.prev?.callsPlaced ?? 0), interviews: a.interviews + (p.prev?.interviews ?? 0) }),
    { emails: 0, calls: 0, interviews: 0 },
  );
  const hasPrev = people.some((p) => p.prev);
  const kpis: Kpi[] = [
    { id: "emails", label: "Emails sent", value: fmt(total.sent), note: hasPrev ? againstBefore(total.sent, prev.emails) : null },
    { id: "calls", label: "Calls placed", value: fmt(total.placed), note: hasPrev ? againstBefore(total.placed, prev.calls) : null },
    { id: "interviews", label: "Moved to interview", value: fmt(total.interviews), note: hasPrev ? againstBefore(total.interviews, prev.interviews) : null },
  ];
  const allCols: Array<ModalCol<PersonRow>> = PERSON_COLUMNS.map((c) => ({
    id: c.id,
    label: c.label,
    right: c.id !== "name",
    sort: (p) => sortValue(p, c.id),
    cell: (p) => (c.id === "name"
      ? <button type="button" className="an-name" onClick={(e) => { e.stopPropagation(); setAll(false); setOpen(p); }} title={p.name}>{p.name}</button>
      : PERSON_CELL(p, c.id)),
  }));
  const cols: Array<ModalCol<PersonRow>> = CARD_COLUMNS.map((id) => {
    const c = allCols.find((x) => x.id === id)!;
    return {
      ...c,
      label: id === "emails" ? "Emails sent" : id === "calls" ? "Calls placed" : c.label,
      cell: id === "name"
        ? (p: PersonRow) => <button type="button" className="an-name" onClick={(e) => { e.stopPropagation(); setOpen(p); }} title={p.name}>{p.name}</button>
        : id === "hires" ? (p: PersonRow) => <span className={p.moves.hires > 0 ? "an-accent" : undefined}>{fmt(p.moves.hires)}</span> : c.cell,
      total: id === "name" ? "Team total" : TOTAL_CELL(total, id),
    };
  });
  const shown = useMemo(() => shapeRows(people, cols, "", sort, (p) => p.name).slice(0, ROWS), [people, sort, cols]);
  return (
    <>
      {page && (
        <EmptyBlock copy={emptyCopy("recruiters", people.length === 0 && data.emptyReason !== "no_activity" ? "no_campaigns" : "no_activity", { days, mine: false })} />
      )}
      {!page && <Kpis
        items={kpis}
        action={<Details window={windowLine(data.period)} how={TEAM_HOW} sections={[]} />}
      />}
      <div className="an-dash is-single">
        <Panel
          area="pp"
          title="People"
          sub={people.length === 1 ? "It's just you so far. Invite your team and their work shows up side by side." : null}
          action={
            <>
              <ViewAll count={people.length} shown={ROWS} onOpen={() => setAll(true)} />
              <Export table={people.length ? peopleTable(shapeRows(people, cols, "", { col: "name", dir: "asc" }, (p) => p.name)) : undefined} file={csvName("recruiters", filters)} />
            </>
          }
          ghost={people.length === 0
            ? { kind: "table", line: "Each person's numbers show up here as they send, call and move someone forward." }
            : null}
        >
          <DataTable
            rows={shown}
            cols={cols}
            rowKey={(p) => p.userId ?? p.name}
            sort={sort}
            onSort={(id) => setSort((s) => nextSort(cols, s, id))}
            onRow={setOpen}
            label="Work by person"
          />
        </Panel>
      </div>

      <DataModal
        open={all}
        onClose={() => setAll(false)}
        title="People"
        sub={`${plural(total.sent, "email")}, ${plural(total.placed, "call")}, ${fmt(total.interviews)} moved to interview`}
        rows={people}
        cols={allCols}
        rowKey={(p) => p.userId ?? p.name}
        searchOf={(p) => p.name}
        tableOf={(r) => peopleTable(r as PersonRow[])}
        file={csvName("recruiters", filters)}
        initialSort={{ col: "name", dir: "asc" }}
        placeholder="Search people"
      />
      <PersonDrawer person={open} filters={filters} onClose={() => setOpen(null)} />
    </>
  );
}

export function MineBody({ data, filters, standing }: { data: RecruitersAnalytics; filters: Filters; standing: Role }) {
  const days = data.period.days;
  const me = data.me;
  const session = useSession();
  const page = !me || data.empty;
  const tiles = !me || page ? [] : mineTiles(me, data.typical);
  const pick = (id: string, label: string): Kpi => {
    const tile = tiles.find((t) => t.id === id);
    if (!tile) return { id, label, value: "–", note: null };
    return {
      id,
      label,
      value: tile.text,
      note: note(typicalLine(tile), tile.prev !== null && tile.id !== "talk" ? againstBefore(tile.n, tile.prev) : null),
    };
  };
  const kpis = [pick("emails", "Emails sent"), pick("calls", "Calls placed"), pick("interviews", "Moved to interview")];
  const uid = me?.userId ?? session.userId ?? undefined;
  void standing;
  return (
    <>
      {page && <EmptyBlock copy={emptyCopy("recruiters", data.emptyReason ?? "no_activity", { days, mine: true })} />}
      {!page && <Kpis
        items={kpis}
        action={
          <Details
            window={windowLine(data.period)}
            how={MINE_HOW}
            sections={page ? [] : [
              ...(tiles.length
                ? [{
                  heading: "This period",
                  body: <Facts rows={tiles.map((t) => [t.label, note(t.text, typicalLine(t))] as const)} />,
                }]
                : []),
              { heading: "Week by week", body: <MineWeeks userId={uid} filters={filters} /> },
            ]}
          />
        }
      />}
      <div className="an-dash is-single">
        <Panel
          area="pp"
          title="Waiting longest"
          ghost={page || data.waitingLongest.length === 0
            ? { kind: "table", line: "Nobody is waiting on you. People who have been at a step the longest are listed here." }
            : null}
        >
          <WaitingList rows={data.waitingLongest} file={csvName("my-waiting", filters)} />
        </Panel>
      </div>
    </>
  );
}

/** Your weeks, fetched when the Details window opens. */
function MineWeeks({ userId, filters }: { userId: string | undefined; filters: Filters }) {
  const q = useWeekly(userId, filters);
  if (q.failed) return <LoadFailed what="Your weeks" onRetry={q.retry} compact />;
  if (!q.data) return userId ? <Busy weeks /> : <p className="an-muted">Weeks are not kept yet.</p>;
  return <WeeksTable w={q.data} />;
}

/* ── Outreach ────────────────────────────────────────────────────────────── */

type OutreachData = OutreachAnalytics & Partial<OutreachExtras>;

const OUTREACH_HOW = [
  "Touches sent are emails sent, calls placed and WhatsApp messages sent. Answered is replies noted on a sent email, calls that connected and WhatsApp replies.",
  "Reply rate is replies noted over emails sent. Replies are noted by a person on the candidate, so the number is only as complete as the noting.",
  "Time to a first reply is the usual time from sending to the reply being noted. A first follow-up is the second email to a person; later follow-ups are the third and after.",
  "Connect rate is calls that reached a conversation over calls placed; talk time adds up the connected ones.",
  "Opens and clicks are not tracked. WhatsApp has no figures until it is connected.",
];

const emailsAreEmpty = (d: OutreachData) => d.totals.sent === 0 && d.totals.drafted === 0;

/** The channel tab, kept in the address next to the filters (`channel=calls`), and out of it when it is All. */
function useChannel(path: string): [ChannelTab, (c: ChannelTab) => void] {
  const read = () => parseChannel(new URLSearchParams(queryOfHash(window.location.hash)).get("channel"));
  const section = `analytics-channel:${path}`;
  /* An address that names a channel wins; otherwise the one this tab left off at. */
  const [channel, setState] = useState<ChannelTab>(() =>
    new URLSearchParams(queryOfHash(window.location.hash)).get("channel")
      ? read()
      : loadSection(section, (r) => parseChannel(typeof r.channel === "string" ? r.channel : null), "all" as ChannelTab));
  useEffect(() => {
    const on = () => {
      if (pathOfHash(window.location.hash).replace(/\/+$/, "") === path) setState(read());
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
    // biome-ignore lint/correctness/useExhaustiveDependencies: read() only reads the address
  }, [path]);
  const set = useCallback((c: ChannelTab) => {
    setState(c);
    saveSection(section, { channel: c });
    const q = new URLSearchParams(queryOfHash(window.location.hash));
    if (c === "all") q.delete("channel");
    else q.set("channel", c);
    const text = q.toString();
    const target = `#${path}${text ? `?${text}` : ""}`;
    if (window.location.hash !== target) window.history.replaceState(window.history.state, "", target);
  }, [path, section]);
  /* A channel brought back from this tab goes into the address too, so a link copied from here carries it. */
  useEffect(() => { if (channel !== "all") set(channel); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [channel, set];
}

/** The figures of the line under the title, for the channel in view. */
function outreachParts(h: OutreachHub, channel: ChannelTab): string[] {
  const e = h.channels.email;
  const c = h.channels.calls;
  if (channel === "email") return e.sent > 0 ? [plural(e.sent, "email"), plural(e.replied, "reply", "replies")] : [];
  if (channel === "calls") return c.placed > 0 ? [plural(c.placed, "call"), `${fmt(c.connected)} connected`] : [];
  if (channel === "whatsapp") return [];
  return h.all.sent > 0 ? [plural(h.all.sent, "touch", "touches"), `${fmt(h.all.answered)} answered`, `${ratioText(h.all.answer)} answer rate`] : [];
}

/** What the sidebar calls a page of the Analytics group, so the title and the sidebar never disagree. */
function navTitle(id: RouteId, fallback: string): string {
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.kind !== "group") continue;
      const child = item.children.find((c) => c.id === id);
      if (child) return child.label;
    }
  }
  return fallback;
}

export function OutreachAnalyticsPage(): JSX.Element {
  const { filters, set, standing, canPickPerson } = useFilters("analytics-outreach");
  const emails = useAnalytics<OutreachData>(getOutreach, () => outreachFixture(filters, standing), filters);
  const calls = useAnalytics<CallsAnalytics>(getCalls, () => callsFixture(filters, standing), filters);
  const [channel, setChannel] = useChannel(ROUTES["analytics-outreach"].path);
  const scope = useScope(filters);
  const e = emails.data;
  const hub = e ? hubOf(e, calls.data) : null;
  const active = hub && (hub.all.sent > 0 || (e && !emailsAreEmpty(e)));
  return (
    <Shell
      title={navTitle("analytics-outreach", "Outreach")}
      summary={summaryLine(filters.period, scope, hub && active ? outreachParts(hub, channel) : [])}
      busy={emails.busy || calls.busy}
      bar={<FilterBar filters={filters} onChange={set} canPickPerson={canPickPerson} withView={standing === "recruiter"} />}
    >
      {emails.failed
        ? <LoadFailed what="Outreach numbers" onRetry={emails.retry} />
        : !e
          ? <Busy page="outreach" />
          : (
            <OutreachBody
              emails={e}
              calls={calls.data}
              callsFailed={calls.failed}
              retryCalls={calls.retry}
              filters={filters}
              channel={channel}
              onChannel={setChannel}
            />
          )}
    </Shell>
  );
}

/** One row of the by-campaign (or by-person) table, every channel in its own columns. */
type TouchRow = {
  id: string;
  name: string;
  emails: number;
  replies: number;
  calls: number;
  connected: number;
  whatsapp: number | null;
  bounced: number;
  scheduled: number | null;
  talkSeconds: number;
  avgSeconds: number | null;
  sent: number;
  answered: number;
  answer: Ratio;
  reply: Ratio;
  connect: Ratio;
};

const campaignRows = (h: OutreachHub): TouchRow[] =>
  h.campaigns.map((c) => ({
    id: c.campaignId ?? "none",
    name: c.name,
    emails: c.email.sent,
    replies: c.email.replied,
    calls: c.calls.placed,
    connected: c.calls.connected,
    whatsapp: h.channels.whatsapp.connected ? c.whatsapp.sent : null,
    bounced: c.email.bounced,
    scheduled: h.fromServer ? c.email.scheduled : null,
    talkSeconds: c.calls.talkSeconds,
    avgSeconds: c.calls.avgSeconds,
    sent: c.sent,
    answered: c.answered,
    answer: c.answer,
    reply: c.email.reply,
    connect: c.calls.connect,
  }));

const personRows = (h: OutreachHub): TouchRow[] =>
  (h.byPerson ?? []).map((p) => {
    const sent = p.email.sent + p.calls.placed;
    const answered = p.email.replied + p.calls.connected;
    return {
      id: p.userId || p.name,
      name: p.name,
      emails: p.email.sent,
      replies: p.email.replied,
      calls: p.calls.placed,
      connected: p.calls.connected,
      whatsapp: null,
      bounced: 0,
      scheduled: null,
      talkSeconds: 0,
      avgSeconds: p.calls.avgSeconds,
      sent,
      answered,
      answer: toRatio(answered, sent),
      reply: p.email.reply,
      connect: p.calls.connect,
    };
  });

const dash = (n: number | null): string => (n === null ? "–" : fmt(n));
const lengthText = (s: number | null): string => (s ? callLength(s) : "–");

/** The table the channel in view shows: its columns, and which rows have anything to say. */
function tableFor(channel: ChannelTab, by: "campaign" | "person"): {
  cols: Array<ModalCol<TouchRow>>;
  modalCols: Array<ModalCol<TouchRow>>;
  keep: (r: TouchRow) => boolean;
} {
  const first: ModalCol<TouchRow> = { id: "name", label: by === "person" ? "Person" : "Campaign", sort: (r) => r.name.toLowerCase(), cell: (r) => <Cut text={r.name} /> };
  const num = (id: string, label: string, get: (r: TouchRow) => number | null, cell?: (r: TouchRow) => React.ReactNode): ModalCol<TouchRow> => ({
    id, label, right: true, sort: (r) => get(r) ?? -1, cell: cell ?? ((r) => dash(get(r))),
  });
  const replyRate = num("reply", "Reply rate", (r) => (r.emails > 0 ? r.replies / r.emails : -1), (r) => (r.emails > 0 ? ratioText(r.reply) : "–"));
  const connectRate = num("connect", "Connect rate", (r) => (r.calls > 0 ? r.connected / r.calls : -1), (r) => (r.calls > 0 ? ratioText(r.connect) : "–"));
  const answeredShare = num("answer", "Answered", (r) => (r.sent > 0 ? r.answered / r.sent : -1), (r) => (r.sent > 0 ? ratioText(r.answer) : "–"));
  const whatsapp = num("whatsapp", "WhatsApp", (r) => r.whatsapp);
  if (channel === "email") {
    const cols = [first, num("emails", "Sent", (r) => r.emails), num("replies", "Replied", (r) => r.replies),
      ...(by === "person" ? [replyRate] : [num("bounced", "Bounced", (r) => r.bounced), num("scheduled", "Scheduled", (r) => r.scheduled)])];
    return { cols, modalCols: [first, num("emails", "Sent", (r) => r.emails), num("replies", "Replied", (r) => r.replies), replyRate, num("bounced", "Bounced", (r) => r.bounced), num("scheduled", "Scheduled", (r) => r.scheduled)], keep: (r) => r.emails > 0 || (r.scheduled ?? 0) > 0 };
  }
  if (channel === "calls") {
    const cols = [first, num("calls", "Placed", (r) => r.calls), num("connected", "Connected", (r) => r.connected), num("avg", "Average length", (r) => r.avgSeconds, (r) => lengthText(r.avgSeconds))];
    return { cols, modalCols: [first, num("calls", "Placed", (r) => r.calls), num("connected", "Connected", (r) => r.connected), connectRate, num("talk", "Talk time", (r) => r.talkSeconds, (r) => talkTime(r.talkSeconds)), num("avg", "Average length", (r) => r.avgSeconds, (r) => lengthText(r.avgSeconds))], keep: (r) => r.calls > 0 };
  }
  const cols = [first, num("emails", "Emails", (r) => r.emails), num("replies", "Replies", (r) => r.replies), num("calls", "Calls", (r) => r.calls), num("connected", "Connected", (r) => r.connected),
    whatsapp, answeredShare];
  return { cols, modalCols: cols, keep: () => true };
}

function reachTable(rows: readonly TouchRow[], by: "campaign" | "person"): Table {
  const headers = [by === "person" ? "Person" : "Campaign", "Emails sent", "Replies", "Reply rate", "Bounced", "Scheduled", "Calls placed", "Connected", "Connect rate",
    "Talk time (minutes)", "Average call (seconds)", "WhatsApp messages", "Touches", "Answered", "Answer rate"];
  return {
    headers,
    rows: rows.map((r) => [
      r.name, r.emails, r.replies, r.emails > 0 ? ratioText(r.reply) : "", r.bounced, r.scheduled, r.calls, r.connected, r.calls > 0 ? ratioText(r.connect) : "",
      Math.round(r.talkSeconds / 60), r.avgSeconds, r.whatsapp, r.sent, r.answered, r.sent > 0 ? ratioText(r.answer) : "",
    ]),
    widths: headers.map((h) => Math.max(12, h.length + 2)),
  };
}

export function OutreachBody({ emails: data, calls, callsFailed = false, retryCalls, filters, channel = "all", onChannel = () => {} }: {
  emails: OutreachData;
  calls: CallsAnalytics | null;
  callsFailed?: boolean;
  retryCalls?: () => void;
  filters: Filters;
  channel?: ChannelTab;
  onChannel?: (c: ChannelTab) => void;
}) {
  const [all, setAll] = useState(false);
  const [by, setBy] = useState<"campaign" | "person">("campaign");
  const days = data.period?.days ?? data.days;
  const hub = hubOf(data, calls);
  const em = hub.channels.email;
  const cl = hub.channels.calls;
  const wa = hub.channels.whatsapp;
  const known = hub.fromServer;
  const counts = channelCounts(hub);
  const nothingAtAll = hub.all.sent === 0 && emailsAreEmpty(data);
  const canPerson = !!hub.byPerson && hub.byPerson.length > 0;
  const view = canPerson ? by : "campaign";

  const move = (n: number, prev: number): string | null => (known ? againstBefore(n, prev) : null);
  const was = (r: Ratio, before: Ratio): string | null =>
    known && before.of >= SMALL_N && r.of >= SMALL_N ? `was ${ratioText(before)}` : null;

  const tabs = (
    <div className="an-chan">
      <Segmented
        label="Channel"
        value={channel}
        options={CHANNEL_TABS.map((id) => ({ id, name: CHANNEL_LABEL[id], count: counts[id] }))}
        onChange={onChannel}
      />
    </div>
  );
  /* The tabs stay where they are; what is under them comes in with a short fade and the height moves to the new
     height (switchMotion.tsx), so a switch is calm and the page does not jump. */
  const wrap = (content: React.ReactNode) => (
    <>
      {tabs}
      <SwitchPane k={channel}>{content}</SwitchPane>
    </>
  );

  /* The numbers behind the page that are not the first answer, for the channel in view. */
  const emailFacts: DetailSection = {
    heading: "Email",
    body: (
      <Facts
        rows={[
          ["Time to a first reply", replyTime(hub.email.timeToFirstReply)],
          ["Bounce rate", em.sent > 0 ? ratioText(hub.email.bounce) : "–"],
          ["Best hour to send", hub.email.bestHour ? `${hourName(hub.email.bestHour.hour)}, ${ratioText(hub.email.bestHour.answer)} replied` : "Not enough yet"],
          ["Waiting for a reply", fmt(em.awaiting)],
          ...(known ? [["Scheduled to go out", fmt(em.scheduled)] as const] : []),
        ]}
      />
    ),
  };
  const callFacts: DetailSection = {
    heading: "Calls",
    body: (
      <Facts
        rows={[
          ["Talk time", talkTime(cl.talkSeconds)],
          ["Average length", lengthText(cl.avgSeconds)],
          ["Best hour to call", cl.bestHour ? `${hourName(cl.bestHour.hour)}, ${ratioText(cl.bestHour.answer)} connected` : "Not enough yet"],
          ["With a recording", fmt(cl.withRecording)],
          ["With a summary", fmt(cl.withSummary)],
        ]}
      />
    ),
  };
  const whatsappFacts: DetailSection = { heading: "WhatsApp", body: <p className="an-muted">{wa.connected ? "Connected." : WHATSAPP_LINE}</p> };
  const sections = channel === "email" ? [emailFacts] : channel === "calls" ? [callFacts] : [emailFacts, callFacts, whatsappFacts];
  const details = <Details window={windowLine(data.period)} how={OUTREACH_HOW} sections={sections} />;

  const rows = view === "person" ? personRows(hub) : campaignRows(hub);
  const t = tableFor(channel, view);
  const shown = rows.filter(t.keep);
  const file = csvName(`outreach-${channel}-by-${view}`, filters);

  const tableCard = (areaTitle: string, ghostLine: string) => (
    <Panel
      area="bc"
      title={areaTitle}
      action={
        <>
          {canPerson && (
            <Segmented label="By" value={view} options={[{ id: "campaign", name: "Campaign" }, { id: "person", name: "Person" }]} onChange={setBy} />
          )}
          <ViewAll count={shown.length} shown={ROWS} onOpen={() => setAll(true)} />
          <Export table={shown.length ? reachTable(shown, view) : undefined} file={file} />
        </>
      }
      ghost={shown.length === 0 ? { kind: "table", line: ghostLine } : null}
    >
      <DataTable rows={shown.slice(0, ROWS)} cols={t.cols} rowKey={(r) => r.id} sort={null} label={areaTitle} />
    </Panel>
  );

  const modal = (
    <DataModal
      open={all}
      onClose={() => setAll(false)}
      title={`${CHANNEL_LABEL[channel]} by ${view}`}
      rows={shown}
      cols={t.modalCols}
      rowKey={(r) => r.id}
      searchOf={(r) => r.name}
      tableOf={(r) => reachTable(r, view)}
      file={file}
      initialSort={{ col: t.modalCols[1]?.id ?? "name", dir: "desc" }}
      placeholder={`Search ${view === "person" ? "people" : "campaigns"}`}
    />
  );

  const retry = !known && callsFailed && retryCalls
    ? <p className="an-muted an-retry">Calls could not be loaded. <button type="button" className="an-link" onClick={retryCalls}>Try again</button></p>
    : null;

  /* WhatsApp: nothing to count yet, so no figures and no zeros, only where they will appear. */
  if (channel === "whatsapp") {
    return wrap(
      <div className="an-dash is-single">
        <Panel area="pp" title="WhatsApp" ghost={{ kind: "bars", line: WHATSAPP_LINE }} />
      </div>,
    );
  }

  const banner = nothingAtAll && channel === "all"
    ? <EmptyBlock copy={emptyCopy("outreach", data.emptyReason ?? "no_activity", { days })} />
    : null;

  if (channel === "email") {
    const none = em.sent === 0;
    const steps: HBar[] = data.byTouch.filter((r) => r.sent > 0).map((r) => {
      const ratio = toRatio(r.replied, r.sent);
      return { id: r.touch, label: EMAIL_STEP_LABEL[r.touch], value: shareValue(ratio), count: ratioText(ratio), note: `${fmt(r.replied)} of ${fmt(r.sent)} replied` };
    });
    const kpis: Kpi[] = [
      { id: "sent", label: "Sent", value: fmt(em.sent), note: move(em.sent, em.previous.sent) },
      { id: "replied", label: "Replied", value: fmt(em.replied), note: move(em.replied, em.previous.replied) },
      { id: "rate", label: "Reply rate", value: ratioText(em.reply), note: note(was(em.reply, toRatio(em.previous.replied, em.previous.sent)), em.awaiting > 0 && `${fmt(em.awaiting)} waiting for a reply`) },
    ];
    return wrap(
      <>
        {banner}
        {!none && <Kpis items={kpis} action={details} />}
        <div className="an-dash is-outreach">
          <Panel
            area="tc"
            title="Reply rate by step"
            ghost={none ? { kind: "bars", line: "Send a first email and its replies show up here." } : null}
            foot={em.sent > 0 && em.replied === 0 ? "No replies yet. When someone writes back and you note it, it shows up here." : null}
          >
            <HBars stack rows={steps} max={100} label="Reply rate by first email and follow-ups" />
          </Panel>
          {tableCard("By campaign", "Each campaign's emails are listed here once something is sent.")}
        </div>
        {modal}
        {retry}
      </>,
    );
  }

  if (channel === "calls") {
    const none = cl.placed === 0;
    const outcomes = outcomesInOrder(cl.outcomes);
    const bars: HBar[] = outcomes.map((o) => ({
      id: o.id,
      label: o.label,
      value: o.n,
      count: fmt(o.n),
      share: cl.placed >= SMALL_N ? ratioText(toRatio(o.n, cl.placed)) : null,
      accent: false,
    }));
    const kpis: Kpi[] = [
      { id: "placed", label: "Placed", value: fmt(cl.placed), note: move(cl.placed, cl.previous.placed) },
      { id: "connected", label: "Connected", value: fmt(cl.connected), note: move(cl.connected, cl.previous.connected) },
      {
        id: "rate", label: "Connect rate", value: ratioText(cl.connect),
        note: note(cl.talkSeconds > 0 && `Talk time ${talkTime(cl.talkSeconds)}`, cl.avgSeconds ? `Average ${callLength(cl.avgSeconds)}` : null),
      },
    ];
    return wrap(
      <>
        {banner}
        {!none && <Kpis items={kpis} action={details} />}
        <div className="an-dash is-outreach">
          <Panel
            area="tc"
            title="How calls ended"
            ghost={none ? { kind: "bars", line: "No calls yet. Place one and it shows here." } : null}
          >
            <HBars stack rows={bars} label="Calls by outcome" />
          </Panel>
          {tableCard("By campaign", "Each campaign's calls are listed here once one is placed.")}
        </div>
        {modal}
        {retry}
      </>,
    );
  }

  /* All: three figures, the answer rate of each channel, and every channel in one table. */
  const channelsBars: HBar[] = [
    { id: "email", label: "Email", value: shareValue(em.reply), count: ratioText(em.reply), note: em.sent > 0 ? `${fmt(em.replied)} of ${fmt(em.sent)} replied` : "None sent" },
    { id: "calls", label: "Calls", value: shareValue(cl.connect), count: ratioText(cl.connect), note: cl.placed > 0 ? `${fmt(cl.connected)} of ${fmt(cl.placed)} connected` : "None placed" },
    wa.connected
      ? { id: "whatsapp", label: "WhatsApp", value: shareValue(wa.reply), count: ratioText(wa.reply), note: wa.sent > 0 ? `${fmt(wa.replied)} of ${fmt(wa.sent)} replied` : "None sent" }
      : { id: "whatsapp", label: "WhatsApp", value: 0, count: "Not connected", note: null },
  ];
  const kpis: Kpi[] = [
    { id: "sent", label: "Touches sent", value: fmt(hub.all.sent), note: move(hub.all.sent, hub.all.previous.sent) },
    { id: "answered", label: "Answered", value: fmt(hub.all.answered), note: move(hub.all.answered, hub.all.previous.answered) },
    { id: "rate", label: "Answer rate", value: ratioText(hub.all.answer), note: was(hub.all.answer, toRatio(hub.all.previous.answered, hub.all.previous.sent)) },
  ];
  return wrap(
    <>
      {banner}
      {!nothingAtAll && <Kpis items={kpis} action={details} />}
      <div className="an-dash is-outreach">
        <Panel
          area="tc"
          title="Answer rate by channel"
          ghost={nothingAtAll ? { kind: "bars", line: "Send a first email or place a call and its answers show up here." } : null}
        >
          <HBars stack rows={channelsBars} max={100} label="Answer rate by channel" />
        </Panel>
        {tableCard("By campaign", "Each campaign's emails, replies and calls are listed here once something is sent.")}
      </div>
      {modal}
      {retry}
    </>,
  );
}

/* ── Pipeline ────────────────────────────────────────────────────────────── */

const PIPELINE_HOW = [
  "Where people are now counts people in progress only; hired and rejected people are left out. Waiting longer than usual is more than the days shown for that step.",
  "A step's usual time is the middle number of days between entering and leaving it, for stays that finished.",
  "Time to hire is the middle number of days from being added to a campaign to Hired, for hires in the period.",
  "The conversion between steps lives on the Overview, so each number is said once.",
];

export function PipelineAnalyticsPage(): JSX.Element {
  const { filters, set, standing, canPickPerson } = useFilters("analytics-pipeline");
  const q = useAnalytics(getPipeline, () => pipelineFixture(filters, standing), filters);
  const scope = useScope(filters);
  const d = q.data;
  const parts = d && !(d.empty && !pipelineHasPeople(d)) ? [`${fmt(d.totals.inProgress)} in progress`, `${fmt(d.totals.waiting)} waiting longer than usual`] : [];
  return (
    <Shell
      title="Pipeline"
      summary={summaryLine(filters.period, scope, parts)}
      busy={q.busy}
      bar={<FilterBar filters={filters} onChange={set} canPickPerson={canPickPerson} withView={false} />}
    >
      {q.failed ? <LoadFailed what="The pipeline" onRetry={q.retry} /> : !q.data ? <Busy page="pipeline" /> : <PipelineBody data={q.data} filters={filters} />}
    </Shell>
  );
}

export function PipelineBody({ data, filters }: { data: PipelineAnalytics; filters: Filters }) {
  const days = data.period.days;
  const hasPeople = pipelineHasPeople(data);
  const page = data.empty && !hasPeople;
  const kpis: Kpi[] = [
    { id: "progress", label: "In progress", value: fmt(data.totals.inProgress) },
    {
      id: "waiting", label: "Waiting longer than usual", value: fmt(data.totals.waiting),
      note: data.totals.inProgress > 0 ? `of ${fmt(data.totals.inProgress)} in progress` : null,
    },
    {
      id: "hire", label: "Time to hire", value: medianDays(data.timeToHire),
      note: medianValue(data.timeToHire) !== null ? `middle of ${plural(data.timeToHire.n, "hire")}` : data.timeToHire.n === 0 ? "no hires yet" : null,
    },
  ];
  const stages: HBar[] = data.stages.map((s) => ({
    id: s.id,
    label: s.label,
    value: s.n,
    count: fmt(s.n),
    note: s.waiting > 0 ? `${fmt(s.waiting)} waiting longer than usual` : null,
  }));
  const sources = [...data.sources].sort((a, b) => b.hired - a.hired || b.added - a.added);
  const forms = data.forms;
  const velocity = data.velocity.filter((v) => v.median.n > 0);
  const nothingNow = page || stages.length === 0 || data.totals.inProgress === 0;
  const passed = data.passed ?? [];
  const sections = [
    { heading: "Waiting longer than usual", body: <p className="an-muted">{thresholdLine(data.thresholds)}</p> },
    ...(velocity.length > 0
      ? [{
        heading: "Usual time at each step",
        body: <Facts rows={velocity.map((v) => [stageText(v.stage), `${medianDays(v.median)}${medianValue(v.prev) !== null ? `, was ${medianDays(v.prev)}` : ""}`] as const)} />,
      }]
      : []),
    {
      heading: "First contact and hires",
      body: (
        <Facts
          rows={[
            ["Time to first contact", medianDays(data.timeToFirstContact)],
            ["Hired in total", plural(data.totals.hired, "person", "people")],
            ["Rejected in total", fmt(data.totals.passed)],
          ]}
        />
      ),
    },
    ...(sources.length > 0
      ? [{
        heading: "Where people come from",
        body: (
          <>
            <Facts rows={sources.map((s) => [s.label, `${fmt(s.added)} added, ${fmt(s.interviewed)} moved to interview, ${fmt(s.hired)} hired`] as const)} />
            <div className="an-more"><Export table={sourcesTable(sources)} file={csvName("pipeline-sources", filters)} /></div>
          </>
        ),
      }]
      : []),
    ...(data.offers.made > 0
      ? [{
        heading: "Offers",
        body: (
          <Facts
            rows={[
              ["Made", fmt(data.offers.made)],
              ["Accepted", `${fmt(data.offers.accepted)}${data.offers.acceptance.of > 0 ? ` (${ratioText(data.offers.acceptance)} of the answers)` : ""}`],
            ]}
          />
        ),
      }]
      : []),
    ...(forms.views > 0 || forms.applications > 0
      ? [{
        heading: "Application forms",
        body: (
          <Facts
            rows={[
              ["Views", fmt(forms.views)],
              ["Applications", `${fmt(forms.applications)}${forms.conversion.of > 0 ? ` (${ratioText(forms.conversion)})` : ""}`],
              ["Added to a campaign", fmt(forms.added)],
            ]}
          />
        ),
      }]
      : []),
    ...(passed.length > 0
      ? [{ heading: "Why people were rejected", body: <Facts rows={passed.map((p) => [p.reason, fmt(p.n)] as const)} /> }]
      : []),
  ];
  return (
    <>
      {page && <EmptyBlock copy={emptyCopy("pipeline", data.emptyReason, { days })} />}
      {!page && <Kpis items={kpis} action={<Details window={windowLine(data.period)} how={PIPELINE_HOW} sections={sections} />} />}
      <div className="an-dash is-pipeline">
        <Panel
          area="ln"
          title="Where people are now"
          ghost={nothingNow ? { kind: "bars", line: "Shortlist someone and you'll see how long people wait at each step." } : null}
        >
          <HBars rows={stages} label="People at each step, and how many have waited longer than usual" />
        </Panel>

        <Panel
          area="wl"
          title="Waiting longest"
          ghost={page || data.waitingLongest.length === 0
            ? { kind: "table", line: "Nobody is waiting. People who have been at a step the longest are listed here." }
            : null}
        >
          <WaitingList rows={data.waitingLongest} seesTeam={data.viewer.seesTeam} file={csvName("pipeline-waiting", filters)} />
        </Panel>
      </div>
    </>
  );
}

/* ── Campaigns ───────────────────────────────────────────────────────────── */

const CAMPAIGNS_HOW = [
  "Active shows the campaigns that are open now and Closed the ones that were closed; All shows both.",
  "Days to fill counts from the day the campaign opened to the day hires reached the target; it is in the download.",
  "Quiet means nothing has moved in a campaign for the number of days shown.",
];

export function CampaignsAnalyticsPage(): JSX.Element {
  const { filters, set, standing, canPickPerson } = useFilters("analytics-campaigns");
  const [state, setState] = useState<"active" | "closed" | "all">("active");
  const q = useAnalytics(
    (p) => getCampaignsAnalytics({ ...p, state }),
    () => campaignsFixture(filters, state, standing),
    filters,
    state,
  );
  const scope = useScope(filters);
  const d = q.data;
  let parts: string[] = [];
  if (d) {
    const k = campaignKpis(d.campaigns, state);
    const word = state === "closed" ? "closed" : state === "all" ? "in all" : "active";
    if (k.count > 0) parts = [`${fmt(k.count)} ${word}`, k.planned > 0 ? `${fmt(k.hired)} hired of ${fmt(k.planned)} planned` : `${fmt(k.hired)} hired`, ...(state === "closed" ? [`${fmt(k.filled)} filled`] : [`${fmt(k.quiet)} quiet`])];
  }
  return (
    <Shell
      title="Campaigns"
      summary={summaryLine(filters.period, scope, parts)}
      busy={q.busy}
      bar={<FilterBar filters={filters} onChange={set} canPickPerson={canPickPerson} withView={false} />}
    >
      {q.failed
        ? <LoadFailed what="Campaigns" onRetry={q.retry} />
        : !q.data
          ? <Busy page="campaigns" />
          : <CampaignsBody data={q.data} filters={filters} state={state} setState={setState} />}
    </Shell>
  );
}

export function CampaignsBody({ data, filters, state, setState }: {
  data: CampaignsAnalytics;
  filters: Filters;
  state: "active" | "closed" | "all";
  setState: (s: "active" | "closed" | "all") => void;
}) {
  const [all, setAll] = useState(false);
  const days = data.period.days;
  const rows = data.campaigns;
  const page = rows.length === 0 && state === "active" && data.clients.length === 0;
  const k = campaignKpis(rows, state);
  const kpis: Kpi[] = [
    { id: "open", label: k.first, value: fmt(k.count) },
    { id: "hired", label: "Hired of planned", value: k.planned > 0 ? `${fmt(k.hired)} of ${fmt(k.planned)}` : fmt(k.hired) },
    state === "closed"
      ? { id: "filled", label: "Filled", value: fmt(k.filled), note: k.count > 0 ? `of ${fmt(k.count)} closed` : null }
      : { id: "quiet", label: "Gone quiet", value: fmt(k.quiet), note: k.quiet > 0 ? `nothing moved in ${data.quietAfterDays}+ days` : null },
  ];
  const cols: Array<ModalCol<CampaignStats>> = [
    {
      id: "name", label: "Campaign", sort: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <span className="an-two">
          <a href={campaignLink(c.campaignId, "overview")} title={c.name}>{c.name}</a>
          <span className="an-muted an-cut">{c.client ?? "No client"}</span>
        </span>
      ),
    },
    { id: "owner", label: "Owner", sort: (c) => (c.ownerName ?? "").toLowerCase(), cell: (c) => <Cut text={c.ownerName ?? "Not assigned"} /> },
    {
      id: "hired", label: "Hired of planned", sort: (c) => (c.target > 0 ? c.hired / c.target : c.hired),
      cell: (c) => (
        <span className="an-prog">
          <span>{c.target > 0 ? `${c.hired} of ${c.target}` : `${c.hired} hired`}</span>
          {c.target > 0 && <Thin share={c.progress.share} />}
        </span>
      ),
    },
    { id: "replied", label: "Replied", right: true, sort: (c) => c.replied, cell: (c) => fmt(c.replied) },
    { id: "last", label: "Last activity", sort: (c) => (c.lastActivityAt ? Date.parse(c.lastActivityAt) : 0), cell: (c) => <span className={c.quiet && c.status === "active" ? undefined : "an-muted"}>{activityText(c)}</span> },
  ];
  const modalCols: Array<ModalCol<CampaignStats>> = [
    ...cols.slice(0, 3),
    { id: "found", label: "Found", right: true, sort: (c) => c.found, cell: (c) => fmt(c.found) },
    { id: "contacted", label: "Contacted", right: true, sort: (c) => c.contacted, cell: (c) => fmt(c.contacted) },
    cols[3]!,
    { id: "interviewed", label: "Interviewing", right: true, sort: (c) => c.interviewed, cell: (c) => fmt(c.interviewed) },
    { id: "open", label: "Open", right: true, sort: (c) => c.daysOpen, cell: (c) => `${c.daysOpen} d` },
    cols[4]!,
  ];
  return (
    <>
      {page && <EmptyBlock copy={emptyCopy("campaigns", data.emptyReason ?? "no_campaigns", { days })} />}
      {!page && <Kpis
        items={kpis}
        action={
          <Details
            window={windowLine(data.period)}
            how={CAMPAIGNS_HOW}
            sections={data.clients.length > 0
              ? [{
                heading: "By client",
                body: (
                  <>
                    <Facts
                      rows={data.clients.map((c) => [
                        c.name,
                        `${c.active} active of ${c.campaigns}, ${c.planned > 0 ? `${c.hired} of ${c.planned} hired` : `${c.hired} hired`}, first hire ${medianDays(c.medianDaysToFirstHire).toLowerCase()}`,
                      ] as const)}
                    />
                    <div className="an-more"><Export table={clientsTable(data.clients)} file={csvName("clients", filters)} /></div>
                  </>
                ),
              }]
              : []}
          />
        }
      />}
      <div className="an-dash is-single">
        <Panel
          area="pp"
          title="Campaigns"
          action={
            <>
              <Segmented
                label="Which campaigns"
                value={state}
                options={[{ id: "active", name: "Active" }, { id: "closed", name: "Closed" }, { id: "all", name: "All" }]}
                onChange={setState}
              />
              <ViewAll count={rows.length} shown={ROWS} onOpen={() => setAll(true)} />
              <Export table={rows.length ? campaignsTable(rows) : undefined} file={csvName("campaigns", filters)} />
            </>
          }
          ghost={page || rows.length === 0
            ? {
              kind: "table",
              line: state === "closed"
                ? "No closed campaigns yet. A campaign you close is kept here with how it went."
                : "Start a campaign and its progress shows up here.",
            }
            : null}
        >
          <DataTable rows={rows.slice(0, ROWS)} cols={cols} rowKey={(c) => c.campaignId} sort={null} label="Campaigns" />
        </Panel>
      </div>

      <DataModal
        open={all}
        onClose={() => setAll(false)}
        title="Campaigns"
        sub={state === "closed" ? "Closed" : state === "all" ? "Active and closed" : "Active"}
        rows={rows}
        cols={modalCols}
        rowKey={(c) => c.campaignId}
        searchOf={(c) => `${c.name} ${c.client ?? ""} ${c.ownerName ?? ""}`}
        tableOf={(r) => campaignsTable(r)}
        file={csvName("campaigns", filters)}
        initialSort={{ col: "name", dir: "asc" }}
        placeholder="Search campaigns, clients, owners"
      />
    </>
  );
}

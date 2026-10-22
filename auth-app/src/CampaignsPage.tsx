import {
  ArrowRight, Check, DotsThree, MagnifyingGlass, Plus, SortAscending, X,
} from "@phosphor-icons/react";
import { CloseDialog } from "./CloseDialog";
import { interviewWord } from "./boardStages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignRow, CampaignStatus } from "./campaignsData";
import { STATUS_LABEL } from "./campaignsData";
import { archiveCampaign, deleteCampaign, duplicateCampaign, refreshCampaignList, resolveCampaignId, retryCampaigns, setCampaignStatus, useArchivedRows, useCampaignRows, useCampaignsFailed, useCampaignsReady } from "./campaignStore";
import { campaignsEmpty } from "./campaignsEmpty";
import type { CampaignsFilter } from "./campaignsEmpty";
import { DeleteCampaignDialog } from "./DeleteCampaignDialog";
import { joinParts, plainText } from "./displayText";
import { AssignDialog, ReopenDialog } from "./RoleBits";
import { mayChangeCampaign, mayCloseCampaign } from "./campaignRights";
import { can, standingOf, useCan } from "./can";
import { useSession, visibleCampaigns } from "./roleStore";
import { Num, Popover, useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { createdMessage, NewCampaignDialog } from "./NewCampaign";
import { Pager } from "./components/Pager";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { inKind, rejectedOf, stagesOf, totalOf } from "./stageDonut";
import { clampedOffset, hasDeepLink, loadSection, take } from "./sectionState";
import { PAGE_FALLBACK, PAGER_FOOT, usePageSize } from "./usePageSize";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { LoadFailed } from "./ui";
import { LIVE } from "./api/client";
import { NewCampaignIntake } from "./NewCampaignIntake";
import "./campaigns-page.css";

/**
 * Campaigns — every hiring campaign in the workspace, one row each.
 *
 * A row reads left to right the way a recruiter asks about a campaign: what
 * is it and does it need me, how far through the pipeline is it, is sourcing
 * still flowing, how close is it to the hires it exists to make, and who (and
 * which agents) are on it. Pressing a row opens the campaign in the agent.
 *
 * The one flourish is the goal ring: it fills to hired-of-target on arrival
 * and turns into a check when a campaign is filled. Everything else is type
 * and hairlines.
 */

/** Rows per page when the room cannot be measured: the list is sorted and filtered whole, then cut here. The page holds as many as fit the window (usePageSize). */
export const CAMPAIGNS_PER_PAGE = PAGE_FALLBACK;

type Filter = CampaignsFilter;
type Sort = "updated" | "name" | "progress";

/* What people work on first, then what is done, then everything still in the list, then what has been put away. */
const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
  { id: "archived", label: "Archived" },
];

const FILTER_IDS = FILTERS.map((f) => f.id);
const SORT_IDS: readonly Sort[] = ["updated", "name", "progress"];

/** What the page remembers for this tab: where the person left the list. */
type Remembered = { filter: Filter; q: string; sort: Sort; offset: number };
const NOTHING: Remembered = { filter: "active", q: "", sort: "updated", offset: 0 };
export const SECTION = "campaigns";
export const readRemembered = (r: Record<string, unknown>): Remembered => ({
  filter: take.oneOf(r.filter, FILTER_IDS, "active"),
  q: take.str(r.q, "", 100),
  sort: take.oneOf(r.sort, SORT_IDS, "updated"),
  offset: take.int(r.offset, 0, 0, 100_000),
});

const AGO_ORDER = (s: string): number => {
  if (s === "Just now") return 0;
  const m = s.match(/(\d+)(m|h|d|w|mo)/);
  if (!m) return 1e9;
  const n = Number(m[1]);
  return n * ({ m: 1, h: 60, d: 1440, w: 10080, mo: 43200 } as const)[m[2] as "m" | "h" | "d" | "w" | "mo"];
};

/** The rows a view shows, in order: filtered by status and search, a fresh copy first, then sorted. */
export function arrangeCampaigns(rows: readonly CampaignRow[], filter: Filter, q: string, sort: Sort, fresh?: string | null | false): CampaignRow[] {
  const needle = q.trim().toLowerCase();
  const xs = rows.filter((r) => (filter === "all" || filter === "archived" || r.status === filter)
    && (!needle || `${r.name} ${r.department} ${r.location} ${r.owner}`.toLowerCase().includes(needle)));
  const progress = (r: CampaignRow) => r.funnel.hired / Math.max(1, r.target);
  return [...xs].sort((a, b) => (a.id === fresh ? -1 : b.id === fresh ? 1 : 0)
    || (sort === "name" ? a.name.localeCompare(b.name)
      : sort === "progress" ? progress(b) - progress(a)
      : AGO_ORDER(a.updatedAgo) - AGO_ORDER(b.updatedAgo)));
}

/** The first row of the page the offset falls on, held inside the list so a shrunken list never strands the view past its end. */
export function clampOffset(offset: number, total: number, limit = CAMPAIGNS_PER_PAGE): number {
  return clampedOffset(offset, total, limit);
}

export function CampaignsPage({ onOpen }: { onOpen: (c: CampaignRow) => void }) {
  /* Live rows from the store, narrowed to the campaigns this session may see:
     all of them for an admin, only the assigned ones for a recruiter. */
  const allRows = useCampaignRows();
  const ready = useCampaignsReady();
  /* A list that failed to load is not an empty one: say so, with a way to ask again. */
  const failed = useCampaignsFailed();
  const session = useSession();
  const rows = useMemo(() => visibleCampaigns(allRows, session), [allRows, session]);
  /* Put away: not in the list the rest of the console reads, so the Archived tab asks for them. */
  const archived = useArchivedRows();
  const archivedRows = useMemo(() => visibleCampaigns(archived.rows, session), [archived.rows, session]);
  /* Anyone who works here opens a campaign; copying one is a manager's (the server's requireAdmin). */
  const mayCreate = can(standingOf(session), "campaign.create");
  const manages = can(standingOf(session), "campaign.manage");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  /* Where the person left this list in this tab (a link of its own, or a first visit, starts from the top). */
  const [start] = useState<Remembered>(() => (hasDeepLink() ? NOTHING : loadSection(SECTION, readRemembered, NOTHING)));
  const [filter, setFilter] = useState<Filter>(start.filter);
  const [q, setQ] = useState(start.q);
  const [sort, setSort] = useState<Sort>(start.sort);
  const [creating, setCreating] = useState(false);
  /* The long form: for a role with no description. A connected workspace starts from the job description instead. */
  const [manual, setManual] = useState(false);
  const [made, setFresh] = useState<string | null>(null);
  /* A campaign made here gets its real id when the API answers; follow it. */
  const fresh = made && resolveCampaignId(made);
  const toast = useToast();

  /* Figures that moved elsewhere (a shortlist made in chat) are read again when the list is opened. */
  useEffect(() => { refreshCampaignList(); }, []);

  /* Arriving from Home's "New campaign": open the same dialog here. */
  useEffect(() => {
    try {
      if (sessionStorage.getItem("sh-new-campaign")) { sessionStorage.removeItem("sh-new-campaign"); if (mayCreate) setCreating(true); }
    } catch { /* storage unavailable: the button still lands on this page */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (f: Filter) => (f === "all" ? rows.length : f === "archived" ? archivedRows.length : rows.filter((r) => r.status === f).length);
  const shown = useMemo(() => arrangeCampaigns(filter === "archived" ? archivedRows : rows, filter, q, sort, fresh), [rows, archivedRows, filter, q, sort, fresh]);

  /* The page belongs to the view it was chosen in: a different search, filter or sort (or a new copy put first) is page 1 again. */
  const viewKey = `${filter}|${sort}|${q}|${fresh || ""}`;
  const [paged, setPaged] = useState<{ key: string; offset: number }>({ key: viewKey, offset: start.offset });
  /* As many rows as fit under the list's top; a remembered offset lands on the page that holds its first row. */
  const size = usePageSize(94, { ready: ready && !(failed && allRows.length === 0), rowSelector: ".cg-row", gap: 10, reserve: 40 + PAGER_FOOT });
  const offset = clampOffset(paged.key === viewKey ? paged.offset : 0, shown.length, size);
  const pageRows = shown.slice(offset, offset + size);

  const counted = ready && !(failed && allRows.length === 0);
  useSectionSave(SECTION, { filter, q, sort, offset }, counted);
  useScrollMemory(SECTION, counted, !hasDeepLink());

  const needYou = rows.filter((r) => r.needs && r.status !== "closed").length;

  /* Said once the server has answered: a refusal puts the status back and says why. */
  const setStatus = (id: string, status: CampaignStatus, said: string, undo?: () => void, closeForms = false) => {
    void setCampaignStatus(id, status, { closeForms }).then((ok) => { if (ok) toast(said, "done", undo ? { label: "Undo", onClick: undo } : undefined); });
  };
  const confirmRow = confirm ? allRows.find((r) => r.id === confirm) : undefined;
  const reopenRow = reopening ? allRows.find((r) => r.id === reopening) : undefined;
  const deleteRow = deleting ? [...allRows, ...archived.rows].find((r) => r.id === deleting) : undefined;
  const empty = campaignsEmpty({ filter, q, total: rows.length, mayCreate });
  /* Put away or brought back, said once the server has done it, with the way back. */
  const archive = (r: CampaignRow, on: boolean) => {
    const was = plainText(r.name);
    void archiveCampaign(r.id, on).then((ok) => {
      if (ok) toast(on ? `${was} archived` : `${was} is back in the list`, "done", { label: "Undo", onClick: () => { void archiveCampaign(r.id, !on); } });
    });
  };
  /* The tab counts say nothing until the list has arrived: "All 0" over a skeleton is a wrong answer (`counted`, above). */

  return (
    <div className="cg">
      <header className="cg-head">
        <div>
          <h1 className="cg-h1">Campaigns</h1>
          {needYou > 0 && (
            <button type="button" className="cg-lede-need" onClick={() => {
              /* Land on the page that holds the first one, in the default order. */
              const at = arrangeCampaigns(rows, "all", "", "updated", fresh).findIndex((r) => r.needs && r.status !== "closed");
              setFilter("all"); setSort("updated"); setQ("");
              setPaged({ key: `all|updated||${fresh || ""}`, offset: clampOffset(Math.max(at, 0), rows.length, size) });
              window.setTimeout(() => { document.querySelector(".cg-row.has-need")?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 0);
            }}>
              <Num n={needYou} /> need you
            </button>
          )}
        </div>
        {mayCreate && (
          <button type="button" className="cg-new" onClick={() => setCreating(true)}>
            <span className="cg-new-ico" aria-hidden="true"><Plus size={14} weight="bold" /></span>
            New campaign
          </button>
        )}
      </header>

      <div className="cg-bar">
        <nav className="cg-tabs" aria-label="Status">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`cg-tab${filter === f.id ? " is-on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}{counted && <span className="cg-tab-n">{count(f.id)}</span>}
            </button>
          ))}
        </nav>
        <label className="cg-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input id="cg-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" spellCheck={false} />
          {q && <button type="button" className="cg-search-x" onClick={() => setQ("")} aria-label="Clear search"><X size={12} weight="bold" /></button>}
        </label>
        <SortMenu sort={sort} onChange={setSort} />
        {counted && shown.length > size && (
          <Pager offset={offset} limit={size} total={shown.length} unit="campaigns" onChange={(o) => setPaged({ key: viewKey, offset: o })} />
        )}
      </div>

      {!ready ? <CampaignsGhost /> : failed && allRows.length === 0 ? <LoadFailed what="Your campaigns" onRetry={retryCampaigns} /> : <ul
        className="cg-list"
        data-pager-list
        key={`${filter}-${sort}`}
        onKeyDown={(e) => {
          /* J/K or the arrows step between campaigns; Enter (on the name)
             opens one. Only when focus is already on a row's name. */
          const names = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(".cg-name")];
          const at = names.indexOf(document.activeElement as HTMLButtonElement);
          if (at < 0) return;
          const d = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          names[Math.max(0, Math.min(names.length - 1, at + d))]?.focus();
        }}
      >
        {pageRows.map((r, i) => (
          <li key={r.id} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Row
              r={r}
              fresh={r.id === fresh}
              onOpen={() => onOpen(r)}
              admin={manages}
              mayClose={mayCloseCampaign(session, r)}
              onArchive={() => archive(r, true)}
              onUnarchive={() => archive(r, false)}
              onDelete={() => setDeleting(r.id)}
              mayAssign={mayChangeCampaign(session, r)}
              onAssign={() => setAssigning(r.id)}
              onClose={() => setConfirm(r.id)}
              /* Reopening asks first, like closing; then it says what happened and offers the way out. */
              onReopen={() => setReopening(r.id)}
              onDuplicate={() => {
                const copy = duplicateCampaign(r.id);
                if (!copy) return;
                setFresh(copy.id);
                toast("Campaign duplicated");
              }}
            />
          </li>
        ))}
      </ul>}
      {ready && !(failed && allRows.length === 0) && counted && shown.length > size && (
        <Pager offset={offset} limit={size} total={shown.length} unit="campaigns" variant="foot" onChange={(o) => setPaged({ key: viewKey, offset: o })} />
      )}
      {ready && !(failed && allRows.length === 0) && !shown.length && (
        <div className="cg-empty">
          <EmptyArt {...empty.art} />
          <p className="cg-empty-h">{empty.message}</p>
          {empty.canClear && <button type="button" className="cg-btn" onClick={() => setQ("")}>Clear search</button>}
          {empty.hint && <p className="cg-empty-sub">{empty.hint}</p>}
        </div>
      )}

      {LIVE && (
        <NewCampaignIntake
          open={creating}
          onClose={() => { setCreating(false); setFilter("active"); setQ(""); }}
          onManual={() => { setCreating(false); setManual(true); }}
        />
      )}
      <NewCampaignDialog
        open={LIVE ? manual : creating}
        onClose={() => (LIVE ? setManual(false) : setCreating(false))}
        onCreated={(c, saved) => {
          setFresh(c.id);
          setFilter("all");
          setQ("");
          setCreating(false);
          setManual(false);
          // Said once the server has it; a refusal shows its own message instead.
          void saved.then((ok) => ok && toast(createdMessage(c)));
        }}
      />
      <AssignDialog row={allRows.find((r) => r.id === assigning)} open={!!assigning} onClose={() => setAssigning(null)} />
      <CloseDialog
        open={!!confirmRow}
        body={confirmRow && <><b>{confirmRow.name}</b> stops here: {confirmRow.funnel.hired} of {confirmRow.target} hired. Sourcing and outreach stop, and everyone in the pipeline stays on record. You can reopen it any time.</>}
        onClose={() => setConfirm(null)}
        onConfirm={(forms) => {
          if (!confirmRow) return;
          setStatus(confirmRow.id, "closed", `${confirmRow.name} closed`, undefined, forms);
          setConfirm(null);
        }}
      />
      <DeleteCampaignDialog
        open={!!deleteRow}
        name={deleteRow ? plainText(deleteRow.name) : ""}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleteRow) return;
          const was = plainText(deleteRow.name);
          setDeleting(null);
          void deleteCampaign(deleteRow.id).then((ok) => { if (ok) toast(`${was} deleted`); });
        }}
      />
      <ReopenDialog
        open={!!reopenRow}
        name={reopenRow ? plainText(reopenRow.name) : ""}
        onClose={() => setReopening(null)}
        onConfirm={() => {
          if (!reopenRow) return;
          const was = plainText(reopenRow.name);
          setStatus(reopenRow.id, "active", `${was} is active again`, () => setStatus(reopenRow.id, "closed", `${was} closed`));
          setReopening(null);
        }}
      />
    </div>
  );
}

/* ── a campaign ── */

function Row({ r, fresh, onOpen, admin, mayClose, mayAssign, onAssign, onClose, onReopen, onDuplicate, onArchive, onUnarchive, onDelete }: {
  r: CampaignRow;
  fresh: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  admin: boolean;
  /** The campaign's owner or an admin: the people the server lets close and reopen it. */
  mayClose: boolean;
  mayAssign: boolean;
  onAssign: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDuplicate: () => void;
}) {
  const need = r.needs && r.status !== "closed" ? r.needs : null;
  /* Stages also take people the search didn't find, so a step can outnumber the one before it: no share over 100%. */
  const pct = (a: number, b: number) => (b && a <= b ? `${Math.round((a / b) * 100)}%` : "–");
  const recent = r.trend.reduce((x, y) => x + y, 0);
  /* Each number's label swaps, on hover, for the fact behind it: how much of
     the step before it made it through, or how recent it is. */
  /* A live campaign says what every screen says (server: pipeline/counts.ts): sourced is the pool the searches found;
     "On board" is the people on the board now (rejected left out, hired included; the funnels say "Shortlisted (ever)") and in progress the ones in its working stages now, the rejected left out
     of both and said apart ("5 rejected"). A row without the server's numbers (the demo) reads its own funnel. */
  const reached = r.reached;
  const stages = stagesOf(r);
  const onBoard = totalOf(stages);
  const rejected = rejectedOf(stages);
  const rejectedNote = rejected > 0 ? `, ${rejected} rejected` : "";
  const stats: readonly [string, number, string][] = reached
    ? [
        ["Sourced", reached.found, r.loading ? "Counting" : recent ? `+${recent} in 14 days` : "No new people in 14 days"],
        ["On board", onBoard, `${pct(onBoard, reached.found)} of sourced${rejectedNote}`],
        [interviewWord(r.stages), inKind(stages, "interviewing"), `${pct(inKind(stages, "interviewing"), onBoard)} of shortlisted`],
      ]
    : [
        ["Sourced", r.funnel.sourced, r.loading ? "Counting" : recent ? `+${recent} in 14 days` : "No new people in 14 days"],
        ["On board", r.funnel.shortlisted, `${pct(r.funnel.shortlisted, r.funnel.sourced)} of sourced`],
        [interviewWord(r.stages), r.funnel.interviews, `${pct(r.funnel.interviews, r.funnel.shortlisted)} of shortlisted`],
      ];
  return (
    <article
      className={`cg-row is-${r.status}${need ? " has-need" : ""}${fresh ? " is-fresh" : ""}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, [role=menu]")) onOpen(); }}
    >
      <div className="cg-id">
        <div className="cg-id-top">
          <button type="button" className="cg-name" onClick={onOpen} title={plainText(r.name)}>
            <span className="cg-name-t">{plainText(r.name)}</span>
            <ArrowRight size={13} weight="bold" className="cg-name-go" aria-hidden="true" />
          </button>
          {/* Active is the normal state, so it carries no label; a closed campaign says so. */}
          {r.archived ? (
            <span className="cg-status is-archived">Archived</span>
          ) : r.status !== "active" && (
            <span className={`cg-status is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          )}
          {fresh && <span className="cg-newtag">New</span>}
        </div>
        <p className="cg-meta">
          {joinParts([r.department, r.location])}{joinParts([r.department, r.location]) && " · "}<span title={r.team.map(plainText).join(", ")}>{plainText(r.owner)}{r.team.length > 1 && ` +${r.team.length - 1}`}</span>
          {r.teamName && r.teamName.length <= 24 && <span className="cg-team"> · {r.teamName}</span>}
          {need && <span className="cg-need"> · {need}</span>}
        </p>
      </div>

      <dl className="cg-stats">
        {stats.map(([k, v, more]) => (
          <div key={k} className={`cg-stat${v ? "" : " is-zero"}`}>
            <dd>{r.loading && k === "Sourced" ? <span role="status" aria-busy="true"><span className="sr-only">Counting</span><Shimmer w={28} h={18} r={5} /></span> : v}</dd>
            <dt className="cg-swap"><span>{k}</span><span>{more}</span></dt>
          </div>
        ))}
      </dl>

      <Goal hired={r.hires?.count ?? r.funnel.hired} target={r.hires?.target ?? r.target} />

      <RowMenu status={r.status} archived={r.archived === true} admin={admin} mayClose={mayClose} mayAssign={mayAssign} onOpen={onOpen} onAssign={onAssign} onClose={onClose} onReopen={onReopen} onDuplicate={onDuplicate} onArchive={onArchive} onUnarchive={onUnarchive} onDelete={onDelete} />
    </article>
  );
}

/** The list while it loads: the list's and the row's own classes (name over a meta line, the three counts, the goal ring), so each row is the real row's height and columns. */
function CampaignsGhost(): JSX.Element {
  return (
    <ShimmerRegion label="Loading campaigns">
      <ul className="cg-list" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <article className="cg-row">
              <div className="cg-id">
                <div className="cg-id-top"><Shimmer h={14} lh={20} w={`${34 + ((i * 17) % 30)}%`} /></div>
                <p className="cg-meta"><Shimmer h={11} lh={16} w={`${46 + ((i * 13) % 26)}%`} /></p>
              </div>
              <dl className="cg-stats">
                {["Sourced", "On board", "Interviewing"].map((k) => (
                  <div key={k} className="cg-stat"><dd><Shimmer h={13} lh={17} w={24} r={5} /></dd><dt>{k}</dt></div>
                ))}
              </dl>
              <div className="cg-goal">
                <span className="cg-goal-ring"><Shimmer ring={3} w={26} h={26} /></span>
                <span className="cg-goal-t"><Shimmer h={12} w={38} /><Shimmer h={10} w={30} /></span>
              </div>
              <span />
            </article>
          </li>
        ))}
      </ul>
    </ShimmerRegion>
  );
}

/* Hires against target. Fills on arrival; a filled campaign's ring closes
   into a check. */
function Goal({ hired, target }: { hired: number; target: number }) {
  const k = Math.min(1, hired / Math.max(1, target));
  const done = hired >= target && target > 0;
  const left = Math.max(0, target - hired);
  const R = 10, C = 2 * Math.PI * R;
  return (
    <div className={`cg-goal${done ? " is-done" : ""}`} title={done ? `Filled: ${hired} of ${target} hired` : `${hired} of ${target} hired`}>
      <span className="cg-goal-ring" aria-hidden="true">
        <svg viewBox="0 0 26 26" width="26" height="26">
          <circle cx="13" cy="13" r={R} className="cg-goal-track" />
          <circle cx="13" cy="13" r={R} className="cg-goal-fill" style={{ strokeDasharray: C, ["--off" as string]: C * (1 - k), ["--c" as string]: C }} />
        </svg>
        {done && <Check size={11} weight="bold" className="cg-goal-ok" />}
      </span>
      <span className="cg-goal-t">
        <span className="cg-goal-v">{done ? "Filled" : <>{hired} <small>of</small> {target}</>}</span>
        <span className="cg-swap">
          <span>{done ? `${hired} hired` : "hired"}</span>
          <span>{done ? "Goal met" : `${left} to go`}</span>
        </span>
      </span>
    </div>
  );
}

function RowMenu({ status, archived, admin, mayClose, mayAssign, onOpen, onAssign, onClose, onReopen, onDuplicate, onArchive, onUnarchive, onDelete }: {
  status: CampaignStatus;
  archived: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  admin: boolean;
  mayClose: boolean;
  mayAssign: boolean;
  onOpen: () => void;
  onAssign: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  /* Giving a campaign to recruiters is about a team: Personal has none, so it isn't offered there. */
  const assigns = useCan("campaign.assign");
  const item = (label: string, fn: () => void, tone?: "danger") => (
    <button type="button" role="menuitem" className={`ct-menu-i${tone ? " is-danger" : ""}`} onClick={() => { fn(); close(); }}>
      <span className="ct-menu-t">{label}</span>
    </button>
  );
  return (
    <>
      <button ref={ref} type="button" className="cg-more" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Campaign actions">
        <DotsThree size={18} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={200}>
        <div className="ct-menu" role="menu">
          {item("Open in agent", onOpen)}
          {/* The campaign's owner or an admin; absent (not disabled) for everyone else. */}
          {mayClose && status === "active" && item("Close campaign", onClose, "danger")}
          {mayClose && status === "closed" && !archived && item("Reopen campaign", onReopen)}
          {mayClose && archived && item("Bring back", onUnarchive)}
          {mayClose && status === "closed" && !archived && item("Archive", onArchive)}
          {assigns && mayAssign && !archived && item("Assign recruiters", onAssign)}
          {admin && mayAssign && item("Duplicate", onDuplicate)}
          {/* Only a closed campaign, only by whoever may close it: the server holds the same rule. */}
          {mayClose && status === "closed" && item("Delete campaign", onDelete, "danger")}
        </div>
      </Popover>
    </>
  );
}

function SortMenu({ sort, onChange }: { sort: Sort; onChange: (s: Sort) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const opts: readonly [Sort, string][] = [["updated", "Recently updated"], ["name", "Name"], ["progress", "Closest to filled"]];
  return (
    <>
      <button ref={ref} type="button" className="cg-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SortAscending size={14} weight="bold" /> {opts.find(([k]) => k === sort)![1]}
      </button>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={210}>
        <div className="ct-menu" role="menu">
          {opts.map(([k, l]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={`ct-menu-i${sort === k ? " is-on" : ""}`} onClick={() => { onChange(k); close(); }}>
              <span className="ct-menu-box is-radio">{sort === k && <Check size={11} weight="bold" />}</span>
              <span className="ct-menu-t">{l}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

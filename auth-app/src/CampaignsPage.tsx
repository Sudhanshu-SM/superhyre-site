import {
  ArrowRight, Check, DotsThree, MagnifyingGlass, Plus, SortAscending, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignRow, CampaignStatus } from "./campaignsData";
import { STATUS_LABEL } from "./campaignsData";
import { duplicateCampaign, refreshCampaignList, resolveCampaignId, retryCampaigns, setCampaignStatus, useCampaignRows, useCampaignsFailed, useCampaignsReady } from "./campaignStore";
import { campaignsEmpty } from "./campaignsEmpty";
import { joinParts, plainText } from "./displayText";
import { AssignDialog, ConfirmDialog, ReopenDialog } from "./RoleBits";
import { can, canSetStatus, standingOf, useCan } from "./can";
import { useSession, visibleCampaigns } from "./roleStore";
import { Num, Popover, useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { createdMessage, NewCampaignDialog } from "./NewCampaign";
import { Loader } from "./components/Loader";
import { LoadFailed } from "./ui";
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

type Filter = "all" | CampaignStatus;
type Sort = "updated" | "name" | "progress";

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "closed", label: "Closed" },
];

const AGO_ORDER = (s: string): number => {
  if (s === "Just now") return 0;
  const m = s.match(/(\d+)(m|h|d|w|mo)/);
  if (!m) return 1e9;
  const n = Number(m[1]);
  return n * ({ m: 1, h: 60, d: 1440, w: 10080, mo: 43200 } as const)[m[2] as "m" | "h" | "d" | "w" | "mo"];
};

export function CampaignsPage({ onOpen }: { onOpen: (c: CampaignRow) => void }) {
  /* Live rows from the store, narrowed to the campaigns this session may see:
     all of them for an admin, only the assigned ones for a recruiter. */
  const allRows = useCampaignRows();
  const ready = useCampaignsReady();
  /* A list that failed to load is not an empty one: say so, with a way to ask again. */
  const failed = useCampaignsFailed();
  const session = useSession();
  const rows = useMemo(() => visibleCampaigns(allRows, session), [allRows, session]);
  const admin = can(standingOf(session), "campaign.create");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [creating, setCreating] = useState(false);
  const [made, setFresh] = useState<string | null>(null);
  /* A campaign made here gets its real id when the API answers; follow it. */
  const fresh = made && resolveCampaignId(made);
  const toast = useToast();

  /* Figures that moved elsewhere (a shortlist made in chat) are read again when the list is opened. */
  useEffect(() => { refreshCampaignList(); }, []);

  /* Arriving from Home's "New campaign": open the same dialog here. */
  useEffect(() => {
    try {
      if (sessionStorage.getItem("sh-new-campaign")) { sessionStorage.removeItem("sh-new-campaign"); if (admin) setCreating(true); }
    } catch { /* storage unavailable: the button still lands on this page */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (f: Filter) => (f === "all" ? rows.length : rows.filter((r) => r.status === f).length);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const xs = rows.filter((r) => (filter === "all" || r.status === filter)
      && (!needle || `${r.name} ${r.department} ${r.location} ${r.owner}`.toLowerCase().includes(needle)));
    const progress = (r: CampaignRow) => r.funnel.hired / Math.max(1, r.target);
    return [...xs].sort((a, b) => (a.id === fresh ? -1 : b.id === fresh ? 1 : 0)
      || (sort === "name" ? a.name.localeCompare(b.name)
        : sort === "progress" ? progress(b) - progress(a)
        : AGO_ORDER(a.updatedAgo) - AGO_ORDER(b.updatedAgo)));
  }, [rows, filter, q, sort, fresh]);

  const needYou = rows.filter((r) => r.needs && r.status !== "closed").length;

  /* Said once the server has answered: a refusal puts the status back and says why. */
  const setStatus = (id: string, status: CampaignStatus, said: string, undo?: () => void) => {
    void setCampaignStatus(id, status).then((ok) => { if (ok) toast(said, "done", undo ? { label: "Undo", onClick: undo } : undefined); });
  };
  const confirmRow = confirm ? allRows.find((r) => r.id === confirm) : undefined;
  const reopenRow = reopening ? allRows.find((r) => r.id === reopening) : undefined;
  const empty = campaignsEmpty({ filter, q, total: rows.length, admin });
  /* The tab counts say nothing until the list has arrived: "All 0" over a skeleton is a wrong answer. */
  const counted = ready && !(failed && allRows.length === 0);

  return (
    <div className="cg">
      <header className="cg-head">
        <div>
          <h1 className="cg-h1">Campaigns</h1>
          {needYou > 0 && (
            <button type="button" className="cg-lede-need" onClick={() => { setFilter("all"); setSort("updated"); setQ(""); document.querySelector(".cg-row.has-need")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
              <Num n={needYou} /> need you
            </button>
          )}
        </div>
        {admin && (
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
      </div>

      {!ready ? <Loader size="lg" label="Loading campaigns" block /> : failed && allRows.length === 0 ? <LoadFailed what="Your campaigns" onRetry={retryCampaigns} /> : <ul
        className="cg-list"
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
        {shown.map((r, i) => (
          <li key={r.id} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Row
              r={r}
              fresh={r.id === fresh}
              onOpen={() => onOpen(r)}
              admin={admin}
              mayClose={canSetStatus(session, r) || (!r.ownerId && r.owner === session.name)}
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
      {ready && !(failed && allRows.length === 0) && !shown.length && (
        <div className="cg-empty">
          <EmptyArt {...empty.art} />
          <p className="cg-empty-h">{empty.message}</p>
          {empty.canClear && <button type="button" className="cg-btn" onClick={() => setQ("")}>Clear search</button>}
          {empty.hint && <p className="cg-empty-sub">{empty.hint}</p>}
        </div>
      )}

      <NewCampaignDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c, saved) => {
          setFresh(c.id);
          setFilter("all");
          setQ("");
          setCreating(false);
          // Said once the server has it; a refusal shows its own message instead.
          void saved.then((ok) => ok && toast(createdMessage(c)));
        }}
      />
      <AssignDialog row={allRows.find((r) => r.id === assigning)} open={!!assigning} onClose={() => setAssigning(null)} />
      <ConfirmDialog
        open={!!confirmRow}
        title="Close this campaign?"
        body={confirmRow && <><b>{confirmRow.name}</b> stops here: {confirmRow.funnel.hired} of {confirmRow.target} hired. Sourcing and outreach stop, and everyone in the pipeline stays on record. You can reopen it any time.</>}
        confirm="Close campaign"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirmRow) return;
          setStatus(confirmRow.id, "closed", `${confirmRow.name} closed`);
          setConfirm(null);
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

function Row({ r, fresh, onOpen, admin, mayClose, onAssign, onClose, onReopen, onDuplicate }: {
  r: CampaignRow;
  fresh: boolean;
  onOpen: () => void;
  admin: boolean;
  /** The campaign's owner or an admin: the people the server lets close and reopen it. */
  mayClose: boolean;
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
  /* A live campaign says what its Overview says: how far people got, and the server's own conversions. */
  const reached = r.reached;
  const share = (n: number | null | undefined) => (typeof n === "number" ? `${n}%` : "–");
  const stats: readonly [string, number, string][] = reached
    ? [
        ["Sourced", reached.found, r.loading ? "Counting" : recent ? `+${recent} in 14 days` : "No new people in 14 days"],
        ["Shortlisted", reached.shortlisted, `${share(r.rates?.kept)} of sourced`],
        ["Interviewing", reached.interviewing, `${share(r.rates?.interviewing)} of contacted`],
      ]
    : [
        ["Sourced", r.funnel.sourced, r.loading ? "Counting" : recent ? `+${recent} in 14 days` : "No new people in 14 days"],
        ["Shortlisted", r.funnel.shortlisted, `${pct(r.funnel.shortlisted, r.funnel.sourced)} of sourced`],
        ["Interviewing", r.funnel.interviews, `${pct(r.funnel.interviews, r.funnel.shortlisted)} of shortlisted`],
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
          {r.status !== "active" && (
            <span className={`cg-status is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          )}
          {fresh && <span className="cg-newtag">New</span>}
        </div>
        <p className="cg-meta">
          {joinParts([r.department, r.location])}{joinParts([r.department, r.location]) && " · "}<span title={r.team.map(plainText).join(", ")}>{plainText(r.owner)}{r.team.length > 1 && ` +${r.team.length - 1}`}</span>
          {need && <span className="cg-need"> · {need}</span>}
        </p>
      </div>

      <dl className="cg-stats">
        {stats.map(([k, v, more]) => (
          <div key={k} className={`cg-stat${v ? "" : " is-zero"}`}>
            <dd>{r.loading && k === "Sourced" ? <span className="sh-b sh-line is-tag" aria-label="Counting" /> : v}</dd>
            <dt className="cg-swap"><span>{k}</span><span>{more}</span></dt>
          </div>
        ))}
      </dl>

      <Goal hired={r.funnel.hired} target={r.target} />

      <RowMenu status={r.status} admin={admin} mayClose={mayClose} onOpen={onOpen} onAssign={onAssign} onClose={onClose} onReopen={onReopen} onDuplicate={onDuplicate} />
    </article>
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

function RowMenu({ status, admin, mayClose, onOpen, onAssign, onClose, onReopen, onDuplicate }: {
  status: CampaignStatus;
  admin: boolean;
  mayClose: boolean;
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
          {mayClose && status === "closed" && item("Reopen campaign", onReopen)}
          {assigns && item("Assign recruiters", onAssign)}
          {admin && item("Duplicate", onDuplicate)}
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

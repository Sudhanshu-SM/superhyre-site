import {
  ArrowRight, Check, DotsThree, MagnifyingGlass, Minus, Plus, SortAscending, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignRow, CampaignStatus } from "./campaignsData";
import { CAMPAIGN_ROWS, DEPARTMENTS, STAGES, STATUS_LABEL, TEAM, newCampaign } from "./campaignsData";
import { Avatar } from "./CandidateBits";
import { Num, Popover, Toaster, useToast } from "./Contacts";
import { Dialog } from "./ui";
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
  { id: "paused", label: "Paused" },
  { id: "draft", label: "Drafts" },
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
  const [rows, setRows] = useState<readonly CampaignRow[]>(CAMPAIGN_ROWS);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const toast = useToast();

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

  const active = rows.filter((r) => r.status === "active").length;
  const needYou = rows.filter((r) => r.needs && r.status !== "closed").length;
  const hired = rows.reduce((a, r) => a + r.funnel.hired, 0);

  const setStatus = (id: string, status: CampaignStatus) => {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, status, updatedAgo: "Just now", agents: status === "active" ? (r.agents.length ? r.agents : ["Sourcing"]) : [] } : r)));
  };

  return (
    <div className="cg">
      <header className="cg-head">
        <div>
          <h1 className="cg-h1">Campaigns</h1>
          <p className="cg-lede">
            <Num n={rows.length} /> campaigns<span className="cg-dot" aria-hidden="true" />
            <Num n={active} /> active<span className="cg-dot" aria-hidden="true" />
            <Num n={hired} /> hired so far
            {needYou > 0 && (
              <>
                <span className="cg-dot" aria-hidden="true" />
                <button type="button" className="cg-lede-need" onClick={() => { setFilter("all"); setSort("updated"); setQ(""); document.querySelector(".cg-row.has-need")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
                  <Num n={needYou} /> need you
                </button>
              </>
            )}
          </p>
        </div>
        <button type="button" className="cg-new" onClick={() => setCreating(true)}>
          <span className="cg-new-ico" aria-hidden="true"><Plus size={14} weight="bold" /></span>
          New campaign
        </button>
      </header>

      <div className="cg-bar">
        <nav className="cg-tabs" aria-label="Status">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`cg-tab${filter === f.id ? " is-on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}<span className="cg-tab-n">{count(f.id)}</span>
            </button>
          ))}
        </nav>
        <label className="cg-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input id="cg-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns, teams or owners" spellCheck={false} />
          {q && <button type="button" className="cg-search-x" onClick={() => setQ("")} aria-label="Clear search"><X size={12} weight="bold" /></button>}
        </label>
        <SortMenu sort={sort} onChange={setSort} />
      </div>

      <ul className="cg-list" key={`${filter}-${sort}`}>
        {shown.map((r, i) => (
          <li key={r.id} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Row
              r={r}
              fresh={r.id === fresh}
              onOpen={() => onOpen(r)}
              onStatus={(s) => {
                setStatus(r.id, s);
                toast(s === "active" ? `${r.name} resumed` : s === "paused" ? `${r.name} paused` : `${r.name} closed`);
              }}
              onDuplicate={() => {
                const copy = { ...r, id: `${r.id}-copy-${Date.now().toString(36)}`, name: `${r.name} (copy)`, status: "draft" as const, funnel: { ...r.funnel, sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: r.trend.map(() => 0), agents: [], needs: "Brief not finished", updatedAgo: "Just now", createdAgo: "Just now" };
                setRows((cur) => [copy, ...cur]);
                setFresh(copy.id);
                toast("Duplicated as a draft");
              }}
            />
          </li>
        ))}
      </ul>
      {!shown.length && (
        <div className="cg-empty">
          <p className="cg-empty-h">{q ? `No campaign matches “${q}”.` : `No ${STATUS_LABEL[filter as CampaignStatus]?.toLowerCase() ?? ""} campaigns.`}</p>
          <button type="button" className="cg-btn" onClick={() => setCreating(true)}><Plus size={13} weight="bold" /> New campaign</button>
        </div>
      )}

      <NewCampaign
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(c) => {
          setRows((cur) => [c, ...cur]);
          setFresh(c.id);
          setFilter("all");
          setQ("");
          setCreating(false);
          toast(c.status === "active" ? `${c.name} created, sourcing has started` : `${c.name} saved as a draft`);
        }}
      />
      <Toaster />
    </div>
  );
}

/* ── a campaign ── */

function Row({ r, fresh, onOpen, onStatus, onDuplicate }: {
  r: CampaignRow;
  fresh: boolean;
  onOpen: () => void;
  onStatus: (s: CampaignStatus) => void;
  onDuplicate: () => void;
}) {
  const sourced = r.trend.reduce((a, b) => a + b, 0);
  return (
    <article
      className={`cg-row is-${r.status}${r.needs && r.status !== "closed" ? " has-need" : ""}${fresh ? " is-fresh" : ""}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, [role=menu]")) onOpen(); }}
    >
      <div className="cg-id">
        <div className="cg-id-top">
          <button type="button" className="cg-name" onClick={onOpen}>
            {r.name}
            <ArrowRight size={13} weight="bold" className="cg-name-go" aria-hidden="true" />
          </button>
          <span className={`cg-status is-${r.status}`}>
            <svg width="6" height="6" aria-hidden="true"><circle cx="3" cy="3" r="3" /></svg>
            {STATUS_LABEL[r.status]}
          </span>
          {fresh && <span className="cg-newtag">New</span>}
        </div>
        <p className="cg-meta">{r.department} · {r.location} · {r.owner} · updated {r.updatedAgo}</p>
        {r.needs && r.status !== "closed" && <p className="cg-need">{r.needs}</p>}
      </div>

      <Pipeline r={r} />

      <div className="cg-trend" title={`${sourced} sourced in the last 14 days`}>
        <Spark data={r.trend} muted={r.status !== "active"} />
        <span className="cg-trend-k"><strong>{sourced}</strong> sourced · 14d</span>
      </div>

      <Goal hired={r.funnel.hired} target={r.target} />

      <div className="cg-people">
        <span className="cg-faces">
          {r.team.slice(0, 3).map((m) => <Avatar key={m} name={m} hue="brand" size={24} />)}
        </span>
        {r.agents.length ? (
          <span className="cg-agents" title={`${r.agents.join(" and ")} agent${r.agents.length > 1 ? "s" : ""} working`}>
            <span className="cg-eq" aria-hidden="true"><i /><i /><i /></span>
            {r.agents.join(" · ")}
          </span>
        ) : (
          <span className="cg-agents is-idle">No agents</span>
        )}
      </div>

      <RowMenu status={r.status} onOpen={onOpen} onStatus={onStatus} onDuplicate={onDuplicate} />
    </article>
  );
}

/* The pipeline as six numbers, each with a hairline bar sized against the
   largest stage on a square-root scale, so late stages are visible next to
   a big sourced count. Bars grow in, left to right, on arrival. */
function Pipeline({ r }: { r: CampaignRow }) {
  const max = Math.max(1, ...STAGES.map((s) => r.funnel[s.id]));
  return (
    <ol className="cg-pipe" aria-label="Pipeline">
      {STAGES.map((s, i) => {
        const v = r.funnel[s.id];
        const prev = i ? r.funnel[STAGES[i - 1]!.id] : 0;
        const conv = i > 1 && prev ? Math.round((v / prev) * 100) : null;
        return (
          <li key={s.id} className={`cg-stage${v ? "" : " is-zero"}${s.id === "hired" && v ? " is-hired" : ""}`} title={conv !== null ? `${v} ${s.label.toLowerCase()} · ${conv}% of ${STAGES[i - 1]!.label.toLowerCase()}` : `${v} ${s.label.toLowerCase()}`}>
            <span className="cg-stage-v">{v}</span>
            <span className="cg-stage-l">{s.label}</span>
            <span className="cg-stage-bar"><span style={{ ["--w" as string]: Math.sqrt(v / max), animationDelay: `${120 + i * 60}ms` }} /></span>
          </li>
        );
      })}
    </ol>
  );
}

function Spark({ data, muted }: { data: readonly number[]; muted: boolean }) {
  const w = 104, h = 30, max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - (v / max) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  const id = useRef(`sp-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <svg className={`cg-spark${muted ? " is-muted" : ""}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path className="cg-spark-line" d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="currentColor" />
    </svg>
  );
}

/* Hires against target. Fills on arrival; a filled campaign's ring closes
   into a check. */
function Goal({ hired, target }: { hired: number; target: number }) {
  const k = Math.min(1, hired / Math.max(1, target));
  const done = hired >= target && target > 0;
  const R = 17, C = 2 * Math.PI * R;
  return (
    <div className={`cg-goal${done ? " is-done" : ""}`} title={done ? `Filled: ${hired} of ${target} hired` : `${hired} of ${target} hired`}>
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r={R} className="cg-goal-track" />
        <circle cx="22" cy="22" r={R} className="cg-goal-fill" style={{ strokeDasharray: C, ["--off" as string]: C * (1 - k), ["--c" as string]: C }} />
      </svg>
      <span className="cg-goal-in">{done ? <Check size={14} weight="bold" /> : <>{hired}<small>/{target}</small></>}</span>
      <span className="cg-goal-l">{done ? "Filled" : "hired"}</span>
    </div>
  );
}

function RowMenu({ status, onOpen, onStatus, onDuplicate }: {
  status: CampaignStatus;
  onOpen: () => void;
  onStatus: (s: CampaignStatus) => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
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
          {status === "active" && item("Pause", () => onStatus("paused"))}
          {(status === "paused" || status === "draft") && item(status === "draft" ? "Start sourcing" : "Resume", () => onStatus("active"))}
          {item("Duplicate", onDuplicate)}
          {status !== "closed" && item("Close campaign", () => onStatus("closed"), "danger")}
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

/* ── new campaign ──
   Five answers, all on one screen, and a summary line that reads back what
   will be made. The agent can start sourcing the moment it is created. */

function NewCampaign({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (c: CampaignRow) => void }) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<string>("Engineering");
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState(1);
  const [owner, setOwner] = useState<string>(TEAM[0]);
  const [agent, setAgent] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(""); setDepartment("Engineering"); setLocation(""); setTarget(1); setOwner(TEAM[0]); setAgent(true);
    const id = window.setTimeout(() => nameRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  const ok = name.trim().length > 1;
  const submit = () => {
    if (!ok) { nameRef.current?.focus(); return; }
    onCreate(newCampaign({ name: name.trim(), department, location: location.trim(), target, owner, agent }));
  };

  return (
    <Dialog open={open} onClose={onClose} label="New campaign" size="md">
      <form className="nc" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <header className="nc-head">
          <h2>New campaign</h2>
          <p>Name the role you are hiring for. You can refine the brief with the agent afterwards.</p>
        </header>

        <div className="nc-body">
          <label className="nc-field">
            <span className="nc-l">Role</span>
            <input ref={nameRef} id="nc-name" className="nc-input is-big" value={name} onChange={(e) => setName(e.target.value)} placeholder="Senior Backend Engineers" autoComplete="off" spellCheck={false} />
          </label>

          <div className="nc-field">
            <span className="nc-l">Team</span>
            <div className="nc-chips" role="radiogroup" aria-label="Team">
              {DEPARTMENTS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={department === d} className={`nc-chip${department === d ? " is-on" : ""}`} onClick={() => setDepartment(d)}>{d}</button>
              ))}
            </div>
          </div>

          <div className="nc-row">
            <label className="nc-field">
              <span className="nc-l">Location</span>
              <input id="nc-loc" className="nc-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bangalore, or Remote" autoComplete="off" />
            </label>
            <div className="nc-field">
              <span className="nc-l">Hires to make</span>
              <div className="nc-step">
                <button type="button" onClick={() => setTarget((t) => Math.max(1, t - 1))} disabled={target <= 1} aria-label="Fewer hires"><Minus size={13} weight="bold" /></button>
                <span className="nc-step-v" key={target}>{target}</span>
                <button type="button" onClick={() => setTarget((t) => Math.min(50, t + 1))} aria-label="More hires"><Plus size={13} weight="bold" /></button>
              </div>
            </div>
          </div>

          <div className="nc-field">
            <span className="nc-l">Owner</span>
            <div className="nc-chips" role="radiogroup" aria-label="Owner">
              {TEAM.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={owner === m} className={`nc-chip has-face${owner === m ? " is-on" : ""}`} onClick={() => setOwner(m)}>
                  <Avatar name={m} hue="brand" size={20} />{m}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className={`nc-agent${agent ? " is-on" : ""}`} role="switch" aria-checked={agent} onClick={() => setAgent((a) => !a)}>
            <span className="nc-agent-t">
              <strong>Start sourcing right away</strong>
              <span>A sourcing agent begins building the search as soon as the campaign exists.</span>
            </span>
            <span className="nc-switch" aria-hidden="true"><span /></span>
          </button>
        </div>

        <footer className="nc-foot">
          <p className="nc-sum">
            {ok ? <><strong>{name.trim()}</strong> · {department} · {location.trim() || "Remote"} · {target} {target === 1 ? "hire" : "hires"}</> : "Give the campaign a role to create it."}
          </p>
          <button type="button" className="cg-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="cg-new" disabled={!ok}>{agent ? "Create and start" : "Save as draft"}</button>
        </footer>
      </form>
    </Dialog>
  );
}

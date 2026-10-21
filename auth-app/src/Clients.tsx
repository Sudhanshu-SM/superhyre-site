import {
  ArrowRight, Buildings, CaretDown, CaretUp, CaretUpDown, Check, DotsThree, EnvelopeSimple, Globe,
  MagnifyingGlass, MapPin, NotePencil, Phone, Plus, UserCircle, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CampaignRow } from "./campaignsData";
import { STATUS_LABEL } from "./campaignsData";
import {
  addClientContact, addClientNote, deleteClient, ensureClientDetail, removeClientContact, resolveClientId, saveClient, setClientStatus,
  setPrimaryContact, updateClientContact,
  retryClients, useCampaignRows, useClients, useClientsFailed, useClientsReady, useTeam,
} from "./campaignStore";
import type { Client, ClientContact, ClientDraft, ClientFilter, ClientSort, ClientSortKey, ClientStatus, ClientSummary } from "./clients";
import {
  CLIENT_STATUSES, CLIENT_STATUS_LABEL, EMPTY_DRAFT, INDUSTRIES, NO_CLIENT_FILTER,
  agoLabel, agoMinutes, clientFromDraft, clientProblems, clientSummary, clientsLine, domainOf, draftOf, matchesClient, primaryContact, sortClients,
} from "./clients";
import { LIVE } from "./api/client";
import { useCan } from "./can";
import { clientFromHash } from "./nav";
import { ClientLogo } from "./ClientLogo";
import { Avatar } from "./CandidateBits";
import { Popover, useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { listEmptyArt } from "./emptyStates";
import { joinParts } from "./displayText";
import { createdMessage, NewCampaignDialog } from "./NewCampaign";
import { ConfirmDialog } from "./RoleBits";
import { Shimmer, ShimmerRegion, ShimmerTableRows } from "./components/Shimmer";
import { Pager } from "./components/Pager";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { clampedOffset, hasDeepLink, loadSection, take } from "./sectionState";
import { PAGE_FALLBACK, PAGER_FOOT, usePageSize } from "./usePageSize";
import type { ShimCell } from "./components/Shimmer";
import { DetailTitle } from "./components/DocTitle";
import { pageTitle } from "./pageTitle";
import { Dialog, LoadFailed } from "./ui";
import "./workspace.css";
import "./newcampaign.css";
import "./clients.css";

/**
 * Clients — the companies the agency hires for.
 *
 * Everyone sees the ones their own campaigns are for, read-only. Owners and admins also read the full
 * record (contacts, terms, notes, activity) and change it; a recruiter is shown none of those controls and
 * is told, calmly, who looks after them.
 *
 * The list reads like the Shortlisted table: a sticky header, sortable
 * columns, filters in menus, pagination in the footer. A client's page holds
 * the facts and terms, the campaigns run for it, the people there, and what
 * has happened lately. Every figure is read from the client's campaigns, so
 * nothing here can disagree with the Campaigns page.
 */

/** The ghost list's rows, and the page size where the room cannot be measured (usePageSize). */
const PAGE = PAGE_FALLBACK;
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "contacts", label: "Contacts" },
  { id: "activity", label: "Activity" },
] as const;
type Tab = (typeof TABS)[number]["id"];
/** What someone who may not read the full record sees: the client and its campaigns. */
const PUBLIC_TABS: readonly Tab[] = ["overview", "campaigns"];

/** Said where a control would be, for someone who may not use it. */
const ADMINS_LOOK_AFTER = "Your admins look after clients. The campaigns you are on are listed with their client.";

const first = (n: string) => n.split(" ")[0] ?? n;
const go = (path: string) => { window.location.hash = path; };

function useClientHash() {
  const [at, setAt] = useState(() => clientFromHash(window.location.hash));
  useEffect(() => {
    const on = () => setAt(clientFromHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return at;
}

export function ClientsPage({ onOpenCampaign }: { onOpenCampaign: (row: CampaignRow) => void }) {
  const at = useClientHash();
  const { clients } = useClients();
  const ready = useClientsReady();
  const failed = useClientsFailed();
  const hit = at ? clients.find((c) => c.id === resolveClientId(at.id)) : undefined;
  const details = useCan("client.details");
  const tabs = details ? TABS.map((t) => t.id) : PUBLIC_TABS;
  if (!ready) return <ClientsGhost />;
  // A failed load is never shown as "no clients yet".
  if (failed) return <div className="cw sl cli"><LoadFailed what="Your clients" onRetry={retryClients} /></div>;
  return hit
    ? <ClientDetail key={hit.id} client={hit} tab={(tabs.some((t) => t === at?.tab) ? at!.tab : "overview") as Tab} onOpenCampaign={onOpenCampaign} />
    : <ClientList missing={at ? at.id : null} />;
}

/* ═══════════════════════════════════ the list ═══════════════════════════════════ */

/** One ghost row's cells: the list's own column classes, so each tile sits where its data will. */
const CLIENT_GHOST: readonly ShimCell[] = [
  { cls: "cli-c-name", lead: 26, w: "72%" },
  { cls: "cli-c-ind", w: "70%" },
  { cls: "cli-c-loc", w: "70%" },
  { cls: "cli-c-contact", w: "62%", sub: "78%" },
  { cls: "cli-c-owner", lead: 20, round: true, w: "72%" },
  { cls: "cli-c-num", w: 18, fixed: true },
  { cls: "cli-c-num", w: 18, fixed: true },
  { cls: "cli-c-last", w: "72%" },
  { cls: "cli-c-status", w: "72%" },
];
const CLIENT_HEADS: readonly [string, string][] = [
  ["cli-c-name", "Client"], ["cli-c-ind", "Industry"], ["cli-c-loc", "Location"], ["cli-c-contact", "Primary contact"], ["cli-c-owner", "Account owner"],
  ["cli-c-num", "Open"], ["cli-c-num", "Hires"], ["cli-c-last", "Last activity"], ["cli-c-status", "Status"],
];

/** The list while it loads: the page's own header, filters and table head are real, so only the rows are tiles. */
function ClientsGhost(): JSX.Element {
  const mayManage = useCan("client.manage");
  return (
    <ShimmerRegion label="Loading clients" className="cw sl cli">
      <header className="cw-head">
        <div className="cw-head-t">
          <h1 className="cw-h1">Clients</h1>
          <p className="cw-sub"><Shimmer h={13} lh={20} w="min(360px, 70vw)" /></p>
        </div>
        {mayManage && (
          <div className="cw-head-act">
            <button type="button" className="sl-btn is-primary" disabled tabIndex={-1}><Plus size={14} weight="bold" /> Add client</button>
          </div>
        )}
      </header>
      <div className="sl-bar" aria-hidden="true">
        <label className="sl-search"><MagnifyingGlass size={15} /><input disabled tabIndex={-1} placeholder="Search by company, contact or city" aria-label="Search clients" /></label>
        {["Status", "Industry", "Account owner"].map((l) => <button key={l} type="button" className="sl-btn" disabled tabIndex={-1}>{l}<CaretDown size={11} weight="bold" /></button>)}
        <div className="sl-bar-r"><Shimmer h={12} lh={20} w={64} /></div>
      </div>
      <div className="sl-card">
        <div className="sl-scroll">
          <table className="sl-table cli-table" aria-hidden="true">
            <thead>
              <tr>{CLIENT_HEADS.map(([cls, label], i) => <th key={i} className={cls}><span className="sl-sort">{label}<CaretUpDown size={11} /></span></th>)}</tr>
            </thead>
            <tbody><ShimmerTableRows rows={PAGE} cells={CLIENT_GHOST} /></tbody>
          </table>
        </div>
      </div>
    </ShimmerRegion>
  );
}

/* Where the person left this list in this tab. A status, industry or owner that is no longer among the clients is dropped. */
const SECTION = "clients";
const SORT_KEYS: readonly ClientSortKey[] = ["name", "industry", "location", "contact", "owner", "open", "hires", "last", "status"];
type Remembered = { f: ClientFilter; sort: ClientSort; offset: number };
const NOTHING: Remembered = { f: NO_CLIENT_FILTER, sort: { key: "last", dir: 1 }, offset: 0 };
export function readRemembered(r: Record<string, unknown>, clients: readonly Client[]): Remembered {
  const f = take.rec(r.f);
  const sort = take.rec(r.sort);
  const known = (pick: (c: Client) => string | null | undefined, v: unknown): string | null => {
    const x = typeof v === "string" ? v : null;
    return x && clients.some((c) => pick(c) === x) ? x : null;
  };
  const status = take.oneOf(f.status, [...CLIENT_STATUSES, ""] as const, "");
  return {
    f: { q: take.str(f.q, "", 100), status: status || null, industry: known((c) => c.industry, f.industry), owner: known((c) => c.owner, f.owner) },
    sort: { key: take.oneOf(sort.key, SORT_KEYS, "last"), dir: sort.dir === -1 ? -1 : 1 },
    offset: take.int(r.offset, 0, 0, 100_000),
  };
}

function ClientList({ missing }: { missing: string | null }) {
  const { clients, clientOf } = useClients();
  const rows = useCampaignRows();
  const [start] = useState<Remembered>(() => (hasDeepLink() ? NOTHING : loadSection(SECTION, (r) => readRemembered(r, clients), NOTHING)));
  const [f, setF] = useState<ClientFilter>(start.f);
  const [sort, setSort] = useState<ClientSort>(start.sort);
  /* Where the page starts, as a row: a new page size lands on the page that holds that row. */
  const [wanted, setWanted] = useState(start.offset);
  const [adding, setAdding] = useState(false);
  const mayManage = useCan("client.manage");
  const toast = useToast();

  const sums = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, ClientSummary>();
    for (const c of clients) m.set(c.id, clientSummary(c, clientOf, rows, now));
    return m;
  }, [clients, clientOf, rows]);
  const sum = useCallback((c: Client) => sums.get(c.id)!, [sums]);

  const shown = useMemo(() => sortClients(clients.filter((c) => matchesClient(c, f)), sort, sum), [clients, f, sort, sum]);
  /* A different search, filter or sort is the top of a new list (not on arrival: that is where it was left). */
  const listKey = JSON.stringify([f, sort]);
  const lastList = useRef(listKey);
  useEffect(() => {
    if (lastList.current === listKey) return;
    lastList.current = listKey;
    setWanted(0);
  }, [listKey]);
  /* As many rows as fit under the table's head. */
  const size = usePageSize(56, { rowSelector: "tbody tr", reserve: 24 + 40 + PAGER_FOOT });
  const offset = clampedOffset(wanted, shown.length, size);
  const slice = shown.slice(offset, offset + size);
  useSectionSave(SECTION, { f, sort, offset }, true);
  useScrollMemory(SECTION, true, !hasDeepLink(), ".cli .sl-scroll");

  const industries = useMemo(() => [...new Set(clients.map((c) => c.industry).filter((x): x is string => !!x))].sort(), [clients]);
  const owners = useMemo(() => [...new Set(clients.map((c) => c.owner).filter((x): x is string => !!x))].sort(), [clients]);
  const active = clients.filter((c) => c.status === "active").length;
  const openAll = [...sums.values()].reduce((t, s) => t + s.open, 0);
  const filtered = !!(f.q || f.status || f.industry || f.owner);

  const sortBy = (key: ClientSortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "open" || key === "hires" ? -1 : 1 }));
  const th = (key: ClientSortKey, label: string, cls: string) => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className={`sl-sort${sort.key === key ? " is-on" : ""}`} onClick={() => sortBy(key)}>
        {label}{sort.key === key ? (sort.dir === 1 ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />) : <CaretUpDown size={11} />}
      </button>
    </th>
  );

  return (
    <div className="cw sl cli">
      <header className="cw-head">
        <div className="cw-head-t">
          <h1 className="cw-h1">Clients</h1>
          <p className="cw-sub">{clientsLine(clients.length, active, openAll)}</p>
        </div>
        {mayManage && (
          <div className="cw-head-act">
            <button type="button" className="sl-btn is-primary" onClick={() => setAdding(true)}><Plus size={14} weight="bold" /> Add client</button>
          </div>
        )}
      </header>

      {!mayManage && clients.length > 0 && <p className="cli-note t-body-sm">{ADMINS_LOOK_AFTER}</p>}
      {missing && <p className="cli-note t-body-sm">That client isn't here any more, so here is the full list.</p>}

      <div className="sl-bar">
        <label className="sl-search">
          <MagnifyingGlass size={15} />
          <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search by company, contact or city" aria-label="Search clients" />
          {f.q && <button type="button" onClick={() => setF({ ...f, q: "" })} aria-label="Clear search"><X size={11} weight="bold" /></button>}
        </label>
        <PickMenu label="Status" value={f.status} options={CLIENT_STATUSES.map((s) => ({ id: s, label: CLIENT_STATUS_LABEL[s] }))} onPick={(v) => setF({ ...f, status: v as ClientStatus | null })} />
        <PickMenu label="Industry" value={f.industry} options={industries.map((x) => ({ id: x, label: x }))} onPick={(v) => setF({ ...f, industry: v })} />
        <PickMenu label="Account owner" value={f.owner} options={owners.map((x) => ({ id: x, label: x }))} onPick={(v) => setF({ ...f, owner: v })} />
        {filtered && <button type="button" className="cw-link t-body-sm" onClick={() => setF(NO_CLIENT_FILTER)}>Clear</button>}
        <div className="sl-bar-r">
          {shown.length > size
            ? <Pager offset={offset} limit={size} total={shown.length} unit="clients" onChange={setWanted} />
            : <span className="sl-count t-body-sm">{shown.length} {shown.length === 1 ? "client" : "clients"}</span>}
        </div>
      </div>

      <div className="sl-card">
        <div className="sl-scroll" data-pager-list>
          <table className="sl-table cli-table">
            <thead>
              <tr>
                {th("name", "Client", "cli-c-name")}
                {th("industry", "Industry", "cli-c-ind")}
                {th("location", "Location", "cli-c-loc")}
                {th("contact", "Primary contact", "cli-c-contact")}
                {th("owner", "Account owner", "cli-c-owner")}
                {th("open", "Open", "cli-c-num")}
                {th("hires", "Hires", "cli-c-num")}
                {th("last", "Last activity", "cli-c-last")}
                {th("status", "Status", "cli-c-status")}
              </tr>
            </thead>
            <tbody>
              {slice.map((c) => {
                const s = sum(c);
                const p = primaryContact(c);
                return (
                  <tr key={c.id} className={c.status === "inactive" ? "is-quiet" : ""} tabIndex={0}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) go(`/clients/${c.id}`); }}
                    onKeyDown={(e) => { if (e.key === "Enter") go(`/clients/${c.id}`); }}>
                    <td className="cli-c-name">
                      <span className="cli-name"><ClientLogo client={c} size={26} /><span className="sl-ell t-body-strong" title={c.name}>{c.name}</span></span>
                    </td>
                    <td className="cli-c-ind"><span className="sl-ell">{c.industry ?? "Not set"}</span></td>
                    <td className="cli-c-loc"><span className="sl-ell">{c.location ?? "Not set"}</span></td>
                    <td className="cli-c-contact">
                      {p ? (
                        <span className="cli-person">
                          <span className="sl-ell">{p.name}</span>
                          {p.email && <a className="sl-ell cli-mail" href={`mailto:${p.email}`} title={`Email ${p.name}`}>{p.email}</a>}
                        </span>
                      ) : <span className="cli-none">No contact yet</span>}
                    </td>
                    <td className="cli-c-owner">{c.owner ? <span className="sl-owner"><Avatar name={c.owner} hue="brand" size={20} /><span className="sl-ell">{c.owner}</span></span> : <span className="cli-none">Unassigned</span>}</td>
                    <td className="cli-c-num t-num-sm">{s.open}</td>
                    <td className="cli-c-num t-num-sm">{s.hires}</td>
                    <td className="cli-c-last">{agoLabel(s.lastMin)}</td>
                    <td className="cli-c-status">{CLIENT_STATUS_LABEL[c.status ?? "active"]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && (
            <div className="sl-none">
              <EmptyArt {...listEmptyArt("clients", clients.length > 0)} />
              <p className="t-body-strong">{clients.length ? "No client matches" : "No clients yet"}</p>
              <p className="t-body-sm">
                {clients.length
                  ? "Try a different search, or clear the filters."
                  : mayManage
                    ? "Add the companies you hire for, and link their campaigns to them."
                    : "When an admin adds the companies they hire for, the ones your campaigns are for show up here."}
              </p>
              {filtered ? <button type="button" className="sl-btn" onClick={() => setF(NO_CLIENT_FILTER)}>Clear search and filters</button>
                : mayManage && <button type="button" className="sl-btn" onClick={() => setAdding(true)}><Plus size={13} weight="bold" /> Add client</button>}
            </div>
          )}
        </div>
      </div>
      {shown.length > size && <Pager offset={offset} limit={size} total={shown.length} unit="clients" variant="foot" onChange={setWanted} />}

      {mayManage && <ClientFormDialog open={adding} onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); toast(`${c.name} added`); go(`/clients/${c.id}`); }} />}
    </div>
  );
}

/** A filter as a menu: "Status", or "Status: Active" once one is picked. */
function PickMenu({ label, value, options, onPick }: { label: string; value: string | null; options: readonly { id: string; label: string }[]; onPick: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const cur = options.find((o) => o.id === value);
  return (
    <>
      <button ref={ref} type="button" className={`sl-btn${cur ? " is-set" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {cur ? <>{label}: {cur.label}</> : label}<CaretDown size={11} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={220}>
        <div className="sl-menu" role="menu">
          <button type="button" role="menuitemradio" aria-checked={!value} className={`sl-menu-i${!value ? " is-on" : ""}`} onClick={() => { onPick(null); close(); }}>
            <span className="sl-ell">Any</span>{!value && <Check size={13} weight="bold" />}
          </button>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={value === o.id} className={`sl-menu-i${value === o.id ? " is-on" : ""}`} onClick={() => { onPick(o.id); close(); }}>
              <span className="sl-ell">{o.label}</span>{value === o.id && <Check size={13} weight="bold" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/* ═══════════════════════════════════ one client ═══════════════════════════════════ */

function ClientDetail({ client: c, tab, onOpenCampaign }: { client: Client; tab: Tab; onOpenCampaign: (row: CampaignRow) => void }) {
  const { clientOf } = useClients();
  const rows = useCampaignRows();
  const s = useMemo(() => clientSummary(c, clientOf, rows), [c, clientOf, rows]);
  const [editing, setEditing] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [removing, setRemoving] = useState<ClientContact | null>(null);
  const [newCampaign, setNewCampaign] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const mayManage = useCan("client.manage");
  const mayRead = useCan("client.details");
  const mayStart = useCan("campaign.create");
  const status = c.status ?? "active";
  const domain = domainOf(c.website);
  useEffect(() => { if (mayRead) ensureClientDetail(c.id); }, [c.id, mayRead]);
  const setTab = (t: Tab) => go(t === "overview" ? `/clients/${c.id}` : `/clients/${c.id}/${t}`);

  const count: Partial<Record<Tab, number>> = { campaigns: s.campaigns.length, contacts: c.contacts?.length ?? 0 };

  return (
    <div className="cw sl cli is-detail">
      {/* The tab names the client, not just the page. */}
      <DetailTitle title={pageTitle({ route: "clients", detail: c.name })} fallback={pageTitle({ route: "clients" })} />
      <header className="cw-head cli-head">
        <div className="cw-head-t">
          <p className="cw-crumb">
            <a href="#/clients" onClick={(e) => { e.preventDefault(); go("/clients"); }}>Clients</a>
            <span aria-hidden="true">/</span>
            <span>{c.name}</span>
          </p>
          <div className="cli-id">
            <ClientLogo client={c} size={48} />
            <div className="cli-id-t">
              <h1 className="cw-h1">{c.name}</h1>
              <p className="cli-meta t-body-sm">
                {domain && <a className="cli-meta-i is-link" href={`https://${domain}`} target="_blank" rel="noreferrer"><Globe size={14} aria-hidden="true" />{domain}</a>}
                {c.industry && <span className="cli-meta-i"><Buildings size={14} aria-hidden="true" />{c.industry}</span>}
                {c.location && <span className="cli-meta-i"><MapPin size={14} aria-hidden="true" />{c.location}</span>}
                {c.owner && <span className="cli-meta-i"><UserCircle size={14} aria-hidden="true" />Looked after by {c.owner}</span>}
                <span className={`cli-meta-i cli-status is-${status}`}>{CLIENT_STATUS_LABEL[status]}</span>
              </p>
            </div>
          </div>
        </div>
        <div className="cw-head-act">
          {mayManage && <button type="button" className="sl-btn" onClick={() => setEditing(true)}><NotePencil size={14} /> Edit</button>}
          {mayManage && <button type="button" className="sl-btn" onClick={() => setContactOpen(true)}><Plus size={14} weight="bold" /> Add contact</button>}
          {mayStart && <button type="button" className="sl-btn is-primary" onClick={() => setNewCampaign(true)}><Plus size={14} weight="bold" /> New campaign</button>}
          {mayManage && <button ref={menuRef} type="button" className="sl-btn cli-more" onClick={() => setMenu((m) => !m)} aria-label="More for this client" aria-haspopup="menu" aria-expanded={menu}><DotsThree size={18} weight="bold" /></button>}
          <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
            <div className="sl-menu" role="menu">
              {status !== "inactive" && <button type="button" role="menuitem" className="sl-menu-i" onClick={() => { setMenu(false); setConfirm(true); }}><span>Mark inactive</span></button>}
              {status !== "active" && <button type="button" role="menuitem" className="sl-menu-i" onClick={() => { setMenu(false); setClientStatus(c.id, "active"); toast(`${c.name} is active`); }}><span>Mark active</span></button>}
              {status === "active" && <button type="button" role="menuitem" className="sl-menu-i" onClick={() => { setMenu(false); setClientStatus(c.id, "prospect"); toast(`${c.name} moved to prospects`); }}><span>Move back to prospect</span></button>}
              <button type="button" role="menuitem" className="sl-menu-i" onClick={() => { setMenu(false); setDeleting(true); }}><span>Delete client</span></button>
              <button type="button" role="menuitem" className="sl-menu-i" onClick={() => { setMenu(false); go("/clients"); }}><span>All clients</span></button>
            </div>
          </Popover>
        </div>
      </header>

      <nav className="cli-tabs" aria-label={`${c.name} sections`}>
        {TABS.filter((t) => mayRead || PUBLIC_TABS.includes(t.id)).map((t) => (
          <button key={t.id} type="button" className={`cli-tab${tab === t.id ? " is-on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}{count[t.id] != null && <span className="cli-tab-n">{count[t.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="sl-card cli-card">
        <div className="sl-scroll cli-scroll" key={tab}>
          {tab === "overview" ? <Overview c={c} s={s} onTab={setTab} onNewCampaign={() => setNewCampaign(true)} onAddContact={() => setContactOpen(true)} may={{ manage: mayManage, read: mayRead, start: mayStart }} />
            : tab === "campaigns" ? <Campaigns s={s} onOpen={onOpenCampaign} onNew={mayStart ? () => setNewCampaign(true) : undefined} />
            : tab === "contacts" ? <Contacts c={c} onAdd={() => setContactOpen(true)} onEdit={setEditingContact} onRemove={setRemoving}
                onPrimary={(id, name) => { setPrimaryContact(c.id, id); toast(`${name} is now the primary contact`); }} />
            : <Activity c={c} s={s} />}
        </div>
      </div>

      <ClientFormDialog open={editing} client={c} onClose={() => setEditing(false)} onSaved={(x) => { setEditing(false); toast(`${x.name} saved`); }} />
      <ContactDialog open={contactOpen} client={c} onClose={() => setContactOpen(false)} onSaved={(x) => { setContactOpen(false); toast(`${x.name} added`); if (tab !== "contacts") setTab("contacts"); }} />
      <ContactDialog open={!!editingContact} client={c} contact={editingContact ?? undefined} onClose={() => setEditingContact(null)} onSaved={(x) => { setEditingContact(null); toast(`${x.name} saved`); }} />
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name ?? "this contact"}?`}
        body={removing?.primary && (c.contacts?.length ?? 0) > 1
          ? <>They stop getting shortlists and updates. The next contact on the list becomes primary.</>
          : <>They stop getting shortlists and updates from {c.name}.</>}
        confirm="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={() => { if (removing) { removeClientContact(c.id, removing.id); toast(`${removing.name} removed`); } setRemoving(null); }}
      />
      <ConfirmDialog
        open={deleting}
        title={s.open ? `${c.name} still has open campaigns` : `Delete ${c.name}?`}
        body={s.open
          ? <>{c.name} has {s.open} open {s.open === 1 ? "campaign" : "campaigns"}. Close or finish {s.open === 1 ? "it" : "them"} before deleting, or mark {c.name} inactive to keep everything on record.</>
          : <>Its contacts, notes and history go with it.{s.campaigns.length ? <> Its finished {s.campaigns.length === 1 ? "campaign stays" : "campaigns stay"}, without a client.</> : null}</>}
        confirm={s.open ? "Mark inactive instead" : "Delete client"}
        danger={!s.open}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          if (s.open) { setConfirm(true); return; }
          void deleteClient(c.id).then((ok) => { if (ok) { toast(`${c.name} deleted`); go("/clients"); } });
        }}
      />
      <NewCampaignDialog open={newCampaign} clientId={c.id} onClose={() => setNewCampaign(false)}
        onCreated={(row, saved) => { setNewCampaign(false); setTab("campaigns"); void saved.then((ok) => ok && toast(createdMessage(row))); }} />
      <ConfirmDialog
        open={confirm}
        title={`Mark ${c.name} inactive?`}
        body={s.open
          ? <>Its {s.open} open {s.open === 1 ? "campaign keeps" : "campaigns keep"} running until you close {s.open === 1 ? "it" : "them"}. {c.name} stays on record and you can make it active again at any time.</>
          : <>{c.name} stays on record with its contacts and history. You can make it active again at any time.</>}
        confirm="Mark inactive"
        onClose={() => setConfirm(false)}
        onConfirm={() => { setClientStatus(c.id, "inactive"); setConfirm(false); toast(`${c.name} marked inactive`); }}
      />
    </div>
  );
}

/* ── overview ── */

function Overview({ c, s, onTab, onNewCampaign, onAddContact, may }: {
  c: Client; s: ClientSummary; onTab: (t: Tab) => void; onNewCampaign: () => void; onAddContact: () => void;
  may: { manage: boolean; read: boolean; start: boolean };
}) {
  const p = primaryContact(c);
  const since = c.createdAt ? new Date(`${c.createdAt}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;
  /* The header already shows the website, industry, location, owner and status that are set;
     here go the date and whatever is still missing, so nothing is said twice. */
  const facts: [string, ReactNode][] = [
    ["Client since", since ?? "Not recorded"],
    ...(c.industry ? [] : [["Industry", "Not set"] as [string, ReactNode]]),
    ...(c.location ? [] : [["Location", "Not set"] as [string, ReactNode]]),
    ...(domainOf(c.website) ? [] : [["Website", "Not set"] as [string, ReactNode]]),
    ...(c.owner ? [] : [["Account owner", "Unassigned"] as [string, ReactNode]]),
  ];
  return (
    <div className="cli-ov">
      <section className="cli-sum" aria-label="Summary">
        <button type="button" className="cli-fig" onClick={() => onTab("campaigns")}>
          <span className="t-label">Open campaigns</span>
          <b className="t-num-lg">{s.open}</b>
          <span className="t-body-sm">{s.campaigns.length > s.open ? `${s.campaigns.length - s.open} finished` : s.campaigns.length ? "None finished yet" : "None yet"}</span>
        </button>
        <div className="cli-fig">
          <span className="t-label">Hires to date</span>
          <b className="t-num-lg">{s.hires}</b>
          <span className="t-body-sm">{s.target ? `Of ${s.target} asked for` : "No openings yet"}</span>
        </div>
        <div className="cli-fig">
          <span className="t-label">People in process</span>
          <b className="t-num-lg">{s.inProcess}</b>
          <span className="t-body-sm">Shortlisted or contacted</span>
        </div>
      </section>

      <div className="cli-ov-g">
        <section className="cli-block">
          <h2 className="t-title-sm">Key facts</h2>
          <dl className="cli-facts">
            {facts.map(([k, v]) => <div key={k}><dt className="t-body-sm">{k}</dt><dd className="t-body">{v}</dd></div>)}
          </dl>
        </section>

        {may.read && (
          <section className="cli-block">
            <h2 className="t-title-sm">Terms</h2>
            <p className={`cli-fee t-body${c.fee ? "" : " is-empty"}`}>{c.fee || "No fee terms agreed yet."}</p>
            <h2 className="t-title-sm cli-gap">Notes</h2>
            <p className={`cli-notes t-body${c.notes ? "" : " is-empty"}`}>{c.notes || "Nothing noted yet. What they care about and how they like to work goes here."}</p>
          </section>
        )}

        {may.read && <section className="cli-block">
          <h2 className="t-title-sm">Primary contact</h2>
          {p ? (
            <div className="cli-pc">
              <Avatar name={p.name} hue="sage" size={36} />
              <div className="cli-pc-t">
                <p className="t-body-strong">{p.name}</p>
                {p.title && <p className="t-body-sm">{p.title}</p>}
                <p className="cli-acts">
                  {p.email && <a className="sl-btn is-sm" href={`mailto:${p.email}`}><EnvelopeSimple size={14} /> Email</a>}
                  {p.phone && <a className="sl-btn is-sm" href={`tel:${p.phone.replace(/\s+/g, "")}`}><Phone size={14} /> Call</a>}
                </p>
              </div>
            </div>
          ) : (
            <p className="t-body-sm cli-empty-line">No one yet.{may.manage && <> <button type="button" className="cw-link" onClick={onAddContact}>Add a contact</button></>}</p>
          )}
          {(c.contacts?.length ?? 0) > 1 && <button type="button" className="cw-link t-body-sm cli-gap-s" onClick={() => onTab("contacts")}>All {c.contacts!.length} contacts</button>}
          {!s.campaigns.length && (
            <div className="cli-start">
              <p className="t-body-sm">No campaigns for {c.name} yet.</p>
              {may.start && <button type="button" className="sl-btn is-sm" onClick={onNewCampaign}><Plus size={13} weight="bold" /> Start the first one</button>}
            </div>
          )}
        </section>}
        {!may.read && <p className="cli-note t-body-sm">{ADMINS_LOOK_AFTER}</p>}
      </div>
    </div>
  );
}

/* ── campaigns ── */

function Campaigns({ s, onOpen, onNew }: { s: ClientSummary; onOpen: (row: CampaignRow) => void; onNew?: (() => void) | undefined }) {
  const list = [...s.campaigns].sort((a, b) => agoMinutes(a.updatedAgo) - agoMinutes(b.updatedAgo));
  if (!list.length) {
    return (
      <div className="sl-none">
        <p className="t-body-strong">No campaigns yet</p>
        <p className="t-body-sm">{onNew ? "Start one here, or link an existing campaign from its Overview." : "Campaigns linked to this client show here."}</p>
        {onNew && <button type="button" className="sl-btn" onClick={onNew}><Plus size={13} weight="bold" /> New campaign</button>}
      </div>
    );
  }
  return (
    <table className="sl-table cli-ctable">
      <thead>
        <tr>
          <th className="cli-k-name">Campaign</th>
          <th className="cli-k-status">Status</th>
          <th className="cli-k-hired">Hired</th>
          <th className="cli-k-pipe">In process</th>
          <th className="cli-k-owner">Owner</th>
          <th className="cli-k-upd">Last update</th>
          <th className="cli-k-go" aria-label="Open" />
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }}>
            <td className="cli-k-name">
              <span className="cli-person">
                <span className="sl-ell t-body-strong">{r.name}</span>
                <span className="sl-ell cli-sub">{joinParts([r.department, r.location], ", ")}</span>
              </span>
            </td>
            <td className="cli-k-status">{STATUS_LABEL[r.status]}</td>
            <td className="cli-k-hired"><span className="t-num-sm">{r.funnel.hired}</span> of <span className="t-num-sm">{r.target}</span></td>
            <td className="cli-k-pipe t-num-sm">{r.status === "closed" ? <span aria-label="Nobody in process">Nobody</span> : r.funnel.shortlisted + r.funnel.contacted}</td>
            <td className="cli-k-owner"><span className="sl-owner"><Avatar name={r.owner} hue="brand" size={20} /><span className="sl-ell">{first(r.owner)}</span></span></td>
            <td className="cli-k-upd">{r.updatedAgo}</td>
            <td className="cli-k-go"><ArrowRight size={14} aria-hidden="true" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── contacts ── */

function Contacts({ c, onAdd, onEdit, onRemove, onPrimary }: {
  c: Client; onAdd: () => void; onEdit: (p: ClientContact) => void; onRemove: (p: ClientContact) => void; onPrimary: (id: string, name: string) => void;
}) {
  const list = c.contacts ?? [];
  if (!list.length) {
    return (
      <div className="sl-none">
        <p className="t-body-strong">No contacts at {c.name} yet</p>
        <p className="t-body-sm">Add the hiring manager first. They get shortlists and updates.</p>
        <button type="button" className="sl-btn" onClick={onAdd}><Plus size={13} weight="bold" /> Add contact</button>
      </div>
    );
  }
  return (
    <ul className="cli-people">
      {list.map((p) => (
        <li key={p.id} className={p.primary ? "is-primary" : ""}>
          <Avatar name={p.name} hue={p.primary ? "sage" : "blue"} size={36} />
          <div className="cli-people-t">
            <p className="t-body-strong">{p.name}{p.primary && <span className="cli-primary t-body-sm">Primary contact</span>}</p>
            <p className="t-body-sm">{p.title || "No title"}</p>
          </div>
          <div className="cli-people-reach t-body-sm">
            {p.email ? <span className="sl-ell">{p.email}</span> : <span className="cli-none">No email</span>}
            {p.phone ? <span className="sl-ell">{p.phone}</span> : <span className="cli-none">No phone</span>}
          </div>
          <div className="cli-acts">
            {p.email && <a className="sl-btn is-sm" href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}><EnvelopeSimple size={14} /> Email</a>}
            {p.phone && <a className="sl-btn is-sm" href={`tel:${p.phone.replace(/\s+/g, "")}`} aria-label={`Call ${p.name}`}><Phone size={14} /> Call</a>}
            {!p.primary && <button type="button" className="sl-btn is-sm is-ghost" onClick={() => onPrimary(p.id, p.name)}>Make primary</button>}
            {!pending(p) && <button type="button" className="sl-btn is-sm is-ghost" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>Edit</button>}
            {!pending(p) && <button type="button" className="sl-btn is-sm is-ghost" onClick={() => onRemove(p)} aria-label={`Remove ${p.name}`}>Remove</button>}
          </div>
        </li>
      ))}
      <li className="cli-people-add"><button type="button" className="cw-link t-body-sm" onClick={onAdd}><Plus size={12} weight="bold" /> Add another contact</button></li>
    </ul>
  );
}

/* ── activity ── */

type Item = { id: string; min: number; text: string; sub?: string; note?: boolean };

function activityFor(c: Client, s: ClientSummary, now = Date.now()): Item[] {
  const out: Item[] = [];
  for (const e of c.history ?? []) out.push({ id: e.id, min: Math.max(0, Math.round((now - e.at) / 60000)), text: e.text, note: e.note });
  for (const r of s.campaigns) {
    const upd = agoMinutes(r.updatedAgo);
    const made = agoMinutes(r.createdAgo);
    if (r.funnel.hired > 0) out.push({ id: `${r.id}-h`, min: upd, text: `${r.funnel.hired} of ${r.target} hired on ${r.name}` });
    if (r.status === "closed") out.push({ id: `${r.id}-x`, min: upd, text: `${r.name} closed` });
    else out.push({ id: `${r.id}-u`, min: upd, text: `${r.name} was last updated`, sub: r.needs ?? `${r.reached?.outreach ?? r.funnel.contacted} contacted and ${r.reached?.replied ?? r.funnel.replied} replied so far` });
    if (made !== upd) out.push({ id: `${r.id}-c`, min: made, text: `${r.name} started`, sub: joinParts([r.department, r.location], ", ") });
  }
  if (c.createdAt && !(c.history ?? []).some((e) => e.text === "Added as a client")) {
    const t = Date.parse(`${c.createdAt}T12:00:00`);
    if (Number.isFinite(t)) out.push({ id: "added", min: Math.max(0, Math.round((now - t) / 60000)), text: `${c.name} became a client` });
  }
  return out.sort((a, b) => a.min - b.min);
}

function Activity({ c, s }: { c: Client; s: ClientSummary }) {
  const [note, setNote] = useState("");
  const items = useMemo(() => activityFor(c, s), [c, s]);
  return (
    <div className="cli-act">
      <form className="cli-note-f" onSubmit={(e) => { e.preventDefault(); addClientNote(c.id, note); setNote(""); }}>
        <input className="ncx-in" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Add a note about ${c.name}`} aria-label="Add a note" maxLength={280} />
        <button type="submit" className="sl-btn" disabled={!note.trim()}>Add note</button>
      </form>
      <ol className="cli-log">
        {items.map((it) => (
          <li key={it.id} className={it.note ? "is-note" : ""}>
            <span className="cli-log-when t-body-sm">{agoLabel(it.min)}</span>
            <div className="cli-log-t">
              <p className="t-body">{it.note ? <q>{it.text}</q> : it.text}</p>
              {it.note ? <p className="t-body-sm">Note</p> : it.sub ? <p className="t-body-sm">{it.sub}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ═══════════════════════════════════ dialogs ═══════════════════════════════════ */

/** Add a client, or edit one. Shared with the campaign's client picker. */
export function ClientFormDialog({ open, onClose, onSaved, client }: { open: boolean; onClose: () => void; onSaved: (c: Client) => void; client?: Client }) {
  return (
    <Dialog open={open} onClose={onClose} label={client ? `Edit ${client.name}` : "Add a client"} size="md">
      <div className="cli-dlg">
        <header className="cli-dlg-h">
          <h2 className="t-title">{client ? `Edit ${client.name}` : "Add a client"}</h2>
          <p className="t-body-sm">{client ? "Changes show everywhere this client appears." : "The company you'll hire for. Only the name is needed now. You can fill in the rest later."}</p>
        </header>
        {open && <ClientForm client={client} onCancel={onClose} onSaved={onSaved} />}
      </div>
    </Dialog>
  );
}

export function ClientForm({ client, onCancel, onSaved, submitLabel }: { client?: Client; onCancel: () => void; onSaved: (c: Client) => void; submitLabel?: string }) {
  const { clients } = useClients();
  const team = useTeam();
  const [d, setD] = useState<ClientDraft>(() => (client ? draftOf(client) : { ...EMPTY_DRAFT }));
  const [tried, setTried] = useState(false);
  /* A field says what's wrong once you have typed in it and left it, or when you try to save: leaving an empty field
     alone says nothing. The line under a checked field is always there, so a message appearing moves nothing. */
  const [touched, setTouched] = useState<ReadonlySet<keyof ClientDraft>>(new Set());
  const problems = clientProblems(d, clients, client?.id);
  const errs: typeof problems = tried ? problems : Object.fromEntries(Object.entries(problems).filter(([k]) => touched.has(k as keyof ClientDraft)));
  const set = <K extends keyof ClientDraft>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setD((cur) => ({ ...cur, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(clientProblems(d, clients, client?.id)).length) return;
    if (!client) { onSaved(saveClient(clientFromDraft(d, `cl-${Date.now().toString(36)}`))); return; }
    /* Edit: the primary contact is updated in place; other contacts stay. */
    const made = clientFromDraft(d, client.id);
    const old = client.contacts ?? [];
    const prim = old.find((x) => x.primary);
    const typed = made.contacts?.[0];
    const contacts = typed
      ? prim ? old.map((x) => (x.id === prim.id ? { ...typed, id: prim.id } : x)) : [...old, typed]
      : old;
    onSaved(saveClient({ ...client, ...made, contacts, createdAt: client.createdAt, history: client.history }));
  };

  const F = ({ k, label, wide, children }: { k?: keyof ClientDraft; label: string; wide?: boolean; children: ReactNode }) => (
    <div className={`ncx-f${wide ? " is-wide" : ""}${k && errs[k] ? " is-bad" : ""}`}
      onBlur={k ? () => { if (String(d[k] ?? "").trim()) setTouched((t) => (t.has(k) ? t : new Set(t).add(k))); } : undefined}>
      <span className="ncx-l">{label}</span>
      {children}
      {k && <small className="ncx-err is-held" role={errs[k] ? "alert" : undefined}>{errs[k] ?? ""}</small>}
    </div>
  );

  return (
    <form className="cli-form" onSubmit={submit} noValidate>
      <div className="cli-form-b">
        <p className="cli-form-h t-label">Company</p>
        <div className="ncx-grid">
          {F({ k: "name", label: "Name", children: <input className="ncx-in" value={d.name} onChange={set("name")} placeholder="e.g. Acme Fintech" autoFocus aria-invalid={!!errs.name} /> })}
          {F({ k: "website", label: "Website", children: <input className="ncx-in" value={d.website} onChange={set("website")} placeholder="acme.in" aria-invalid={!!errs.website} /> })}
          {F({ label: "Industry", children: (
            <select className="ncx-in" value={d.industry} onChange={set("industry")}>
              <option value="">Choose</option>
              {[...new Set([...INDUSTRIES, ...(d.industry ? [d.industry] : [])])].map((x) => <option key={x}>{x}</option>)}
            </select>
          ) })}
          {F({ label: "Location", children: <input className="ncx-in" value={d.location} onChange={set("location")} placeholder="e.g. Bengaluru" /> })}
          {F({ label: "Status", children: (
            <div className="ncx-seg" role="radiogroup" aria-label="Status">
              {CLIENT_STATUSES.map((st) => <button key={st} type="button" role="radio" aria-checked={d.status === st} className={d.status === st ? "is-on" : ""} onClick={() => setD({ ...d, status: st })}>{CLIENT_STATUS_LABEL[st]}</button>)}
            </div>
          ) })}
          {F({ label: "Account owner", children: (
            <select className="ncx-in" value={d.owner} onChange={set("owner")}>
              <option value="">Unassigned</option>
              {[...new Set([...team, ...(d.owner ? [d.owner] : [])])].map((m) => <option key={m}>{m}</option>)}
            </select>
          ) })}
        </div>

        <p className="cli-form-h t-label">Primary contact</p>
        <div className="ncx-grid">
          {F({ k: "contactName", label: "Name", children: <input className="ncx-in" value={d.contactName} onChange={set("contactName")} placeholder="Full name" aria-invalid={!!errs.contactName} /> })}
          {F({ label: "Title", children: <input className="ncx-in" value={d.contactTitle} onChange={set("contactTitle")} placeholder="e.g. Head of Engineering" /> })}
          {F({ k: "contactEmail", label: "Email", children: <input className="ncx-in" type="email" value={d.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" aria-invalid={!!errs.contactEmail} /> })}
          {F({ k: "contactPhone", label: "Phone", children: <input className="ncx-in" type="tel" value={d.contactPhone} onChange={set("contactPhone")} placeholder="+91 98450 00000" aria-invalid={!!errs.contactPhone} /> })}
        </div>

        <p className="cli-form-h t-label">Terms</p>
        <div className="ncx-grid">
          {F({ label: "Fee terms", wide: true, children: <input className="ncx-in" value={d.fee} onChange={set("fee")} placeholder="e.g. 18% of first-year CTC, 60-day replacement" /> })}
          {F({ label: "Notes", wide: true, children: <textarea className="ncx-in is-area" rows={3} value={d.notes} onChange={set("notes")} placeholder="What they care about, how they like to work" /> })}
        </div>
      </div>
      <footer className="cli-form-f">
        {tried && Object.keys(errs).length > 0 ? <span className="ncx-sum-bad t-body-sm">Check the highlighted fields.</span> : <span />}
        <button type="button" className="ncx-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="ncx-btn is-primary">{submitLabel ?? (client ? "Save changes" : "Add client")}</button>
      </footer>
    </form>
  );
}

/* A contact added here has a stand-in id until the API answers; it can't be edited or removed before that. */
const pending = (p: ClientContact) => LIVE && p.id.startsWith("ct-");

function ContactDialog({ open, client, contact, onClose, onSaved }: { open: boolean; client: Client; contact?: ClientContact; onClose: () => void; onSaved: (c: ClientContact) => void }) {
  const blank = { name: "", title: "", email: "", phone: "", primary: false };
  const [v, setV] = useState(blank);
  const [tried, setTried] = useState(false);
  /* One save per opening, however fast the button is pressed. */
  const sent = useRef(false);
  useEffect(() => {
    if (!open) return;
    setV(contact ? { name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, primary: contact.primary } : { ...blank, primary: !(client.contacts?.length) });
    setTried(false);
    sent.current = false;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const errs = tried ? clientProblems({ ...EMPTY_DRAFT, name: client.name, contactName: v.name, contactEmail: v.email, contactPhone: v.phone }, [], client.id) : {};
  const nameErr = tried && !v.name.trim() ? "Add their name." : undefined;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sent.current) return;
    setTried(true);
    const p = clientProblems({ ...EMPTY_DRAFT, name: client.name, contactName: v.name, contactEmail: v.email, contactPhone: v.phone }, [], client.id);
    if (!v.name.trim() || p.contactEmail || p.contactPhone) return;
    sent.current = true;
    const fields = { name: v.name.trim(), title: v.title.trim(), email: v.email.trim(), phone: v.phone.trim() };
    if (contact) {
      updateClientContact(client.id, contact.id, fields);
      if (v.primary && !contact.primary) setPrimaryContact(client.id, contact.id);
      onSaved({ ...contact, ...fields, primary: v.primary || contact.primary });
    } else {
      onSaved(addClientContact(client.id, { ...fields, primary: v.primary }));
    }
  };
  const title = contact ? `Edit ${contact.name}` : `Add a contact at ${client.name}`;
  return (
    <Dialog open={open} onClose={onClose} label={title} size="md">
      <div className="cli-dlg">
        <header className="cli-dlg-h">
          <h2 className="t-title">{title}</h2>
          {!contact && <p className="t-body-sm">A hiring manager, a talent partner, anyone you talk to there.</p>}
        </header>
        <form className="cli-form" onSubmit={submit} noValidate>
          <div className="cli-form-b">
            <div className="ncx-grid">
              <div className={`ncx-f${nameErr ? " is-bad" : ""}`}><span className="ncx-l">Name</span><input className="ncx-in" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Full name" maxLength={200} />{nameErr && <small className="ncx-err">{nameErr}</small>}</div>
              <div className="ncx-f"><span className="ncx-l">Title</span><input className="ncx-in" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Engineering Manager" maxLength={200} /></div>
              <div className={`ncx-f${errs.contactEmail ? " is-bad" : ""}`}><span className="ncx-l">Email</span><input className="ncx-in" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="name@company.com" />{errs.contactEmail && <small className="ncx-err">{errs.contactEmail}</small>}</div>
              <div className={`ncx-f${errs.contactPhone ? " is-bad" : ""}`}><span className="ncx-l">Phone</span><input className="ncx-in" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="+91 98450 00000" />{errs.contactPhone && <small className="ncx-err">{errs.contactPhone}</small>}</div>
              {!contact?.primary && (
                <button type="button" role="switch" aria-checked={v.primary} className={`ncx-toggle${v.primary ? " is-on" : ""}`} onClick={() => setV({ ...v, primary: !v.primary })}>
                  <span className="ncx-toggle-t"><strong className="t-body-strong">Primary contact</strong><span className="t-body-sm">Shortlists and updates go to them first.</span></span>
                  <span className="ncx-switch" aria-hidden="true"><span /></span>
                </button>
              )}
            </div>
          </div>
          <footer className="cli-form-f">
            <span />
            <button type="button" className="ncx-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="ncx-btn is-primary">{contact ? "Save changes" : "Add contact"}</button>
          </footer>
        </form>
      </div>
    </Dialog>
  );
}

import {
  ArrowUpRight, ArrowsLeftRight, BookmarkSimple, Briefcase, GoogleChromeLogo, CaretDown, CaretLeft, CaretRight, Check, Copy, EnvelopeSimple,
  FunnelSimple, GraduationCap, LinkedinLogo, MagnifyingGlass, MapPin, Phone, Plus, SealCheck, SortAscending, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./CandidateBits";
import type { Contact, ContactNeed, ExpBand, Filters, Seniority, SortKey } from "./contacts";
import {
  CONTACTS, EMPTY_FILTERS, EXP_BANDS, MEMBERS, SEED_SHORTLIST, SENIORITIES, activeFilterCount, capturedLabel,
  matches, optionsFor, sortContacts, summaryOf, tenureOf,
} from "./contacts";
import { CHROME_STORE_URL } from "./config";
import { Dialog } from "./ui";
import { CAMPAIGNS } from "./workspaces";
import "./contacts.css";

/**
 * Contacts — everyone the team saved with the Chrome extension.
 *
 * A table first: who they are, how to reach them, which campaign they were
 * saved for, and a shortlist button on the right. Everything else (career,
 * education, where each field came from) is one click away in a profile
 * that opens in the middle of the screen, so opening and closing people
 * never sends the pointer to a screen edge.
 *
 * Campaign tabs scope the list the same way the extension scopes a save.
 * Filters are chips in one panel, no nested menus. Paging sits at the top,
 * next to the search, where the eye already is. Clicking an email or a
 * number copies it.
 */

const campName = (id: string) => CAMPAIGNS.find((c) => c.id === id)?.name ?? id;
const MAX_COMPARE = 3;

type Shortlists = Record<string, readonly string[]>;

export function ContactsPage() {
  const [camp, setCamp] = useState<string>("all");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [lists, setLists] = useState<Shortlists>(SEED_SHORTLIST);
  const [openId, setOpenId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const toast = useToast();

  const inCamp = useMemo(() => CONTACTS.filter((c) => camp === "all" || c.campaign === camp), [camp]);
  const rows = useMemo(() => sortContacts(inCamp.filter((c) => matches(c, filters, q)), sort), [inCamp, filters, q, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * size, at * size + size);

  useEffect(() => { setPage(0); }, [camp, q, filters, sort, size]);

  /* ── LOADING SHIMMER ──
     The table shows skeleton rows while a view is being fetched: on arrival,
     and when the campaign, page, sort, page size or filters change. Search
     is left out on purpose; it narrows what is already loaded, and a shimmer
     on every keystroke would make typing feel slow. Fixture data returns at
     once, so the wait is a short stand-in for the real request's. */
  const viewKey = `${camp}-${page}-${sort}-${size}-${JSON.stringify(filters)}`;
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  /* A search jumps back to page one, which changes the key; that is still a
     search, so it must not shimmer. */
  const lastQ = useRef(q);
  useEffect(() => {
    if (lastQ.current !== q) { lastQ.current = q; setLoading(false); return; }
    setLoading(true);
    const id = window.setTimeout(() => setLoading(false), firstLoad.current ? 700 : 420);
    firstLoad.current = false;
    return () => window.clearTimeout(id);
  }, [viewKey]);

  const toggleShortlist = useCallback((id: string, campaign: string) => {
    const on = (lists[id] ?? []).includes(campaign);
    toast(on ? `Removed from ${campName(campaign)}` : `Shortlisted for ${campName(campaign)}`);
    setLists((cur) => {
      const had = cur[id] ?? [];
      return { ...cur, [id]: on ? had.filter((x) => x !== campaign) : had.includes(campaign) ? had : [...had, campaign] };
    });
  }, [lists, toast]);

  const toggleSelect = (id: string) => {
    if (!selected.includes(id) && selected.length >= MAX_COMPARE) {
      toast(`Compare takes up to ${MAX_COMPARE}. Unselect one first.`);
      return;
    }
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of CONTACTS) m.set(c.campaign, (m.get(c.campaign) ?? 0) + 1);
    return m;
  }, []);

  const openIdx = openId ? shown.findIndex((c) => c.id === openId) : -1;
  const openContact = openId ? CONTACTS.find((c) => c.id === openId) ?? null : null;
  const step = (d: number) => {
    const i = openIdx + d;
    if (i >= 0 && i < shown.length) setOpenId(shown[i]!.id);
  };

  const people = selected.map((id) => CONTACTS.find((c) => c.id === id)!).filter(Boolean);
  const nFilters = activeFilterCount(filters);
  const withEmail = inCamp.filter((c) => c.email).length;
  const withPhone = inCamp.filter((c) => c.phone).length;
  const shortlistAll = (campaign: string) => {
    const all = selected.every((id) => (lists[id] ?? []).includes(campaign));
    setLists((cur) => {
      const next = { ...cur };
      for (const id of selected) {
        const had = next[id] ?? [];
        next[id] = all ? had.filter((x) => x !== campaign) : had.includes(campaign) ? had : [...had, campaign];
      }
      return next;
    });
    const n = selected.length;
    toast(all ? `Removed ${n} from ${campName(campaign)}` : `Shortlisted ${n === 1 ? "1 person" : `all ${n}`} for ${campName(campaign)}`);
  };
  const onCompare = () => {
    if (selected.length < 2) { toast("Tick 2 or 3 people to compare"); return; }
    setComparing(true);
  };

  return (
    <div className="ct">
      <header className="ct-head">
        <div className="ct-head-t">
          <h1 className="ct-h1">Contacts</h1>
          <p className="ct-lede">
            <Num n={inCamp.length} /> saved<span className="ct-dot" aria-hidden="true" />
            <Num n={withEmail} /> with email<span className="ct-dot" aria-hidden="true" />
            <Num n={withPhone} /> with phone
          </p>
        </div>
        <div className="ct-head-act">
          <a className="ct-ext" href={CHROME_STORE_URL} target="_blank" rel="noreferrer noopener">
            <span className="ct-ext-ico" aria-hidden="true"><GoogleChromeLogo size={18} weight="duotone" /></span>
            <span className="ct-ext-t">
              <span className="ct-ext-l">Save profiles from LinkedIn</span>
              <span className="ct-ext-v">Add the Chrome extension</span>
            </span>
            <ArrowUpRight size={14} weight="bold" className="ct-ext-go" aria-hidden="true" />
          </a>
          <CompareTray people={people} onCompare={onCompare} onRemove={(id) => setSelected((cur) => cur.filter((x) => x !== id))} />
        </div>
      </header>

      {/* Whenever anyone is ticked, wherever the page is scrolled: shortlist
          them all for one campaign, or compare them. */}
      <div className={`ct-dock${selected.length ? " is-on" : ""}`} aria-hidden={!selected.length}>
        <CompareTray people={people} onCompare={onCompare} onRemove={(id) => setSelected((cur) => cur.filter((x) => x !== id))} />
        <span className="ct-dock-sep" aria-hidden="true" />
        <ShortlistMenuButton
          label={selected.length > 1 ? `Shortlist all ${selected.length}` : "Shortlist"}
          isOn={(campaign) => selected.length > 0 && selected.every((id) => (lists[id] ?? []).includes(campaign))}
          onPick={shortlistAll}
          suggest={people[0]?.campaign}
          tabIndex={selected.length ? undefined : -1}
        />
        <button type="button" className="ct-dock-x" onClick={() => setSelected([])} aria-label="Clear selection" title="Clear selection" tabIndex={selected.length ? undefined : -1}>
          <X size={12} weight="bold" />
        </button>
      </div>

      <div className="ct-bar">
        <CampaignPicker value={camp} onChange={setCamp} counts={counts} />
        <label className="ct-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input
            id="ct-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, title, email or skill"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="ct-search-x" onClick={() => setQ("")} aria-label="Clear search">
              <X size={12} weight="bold" />
            </button>
          )}
        </label>
        <FiltersButton filters={filters} onChange={setFilters} pool={inCamp} count={nFilters} />
        <SortButton sort={sort} onChange={setSort} />
        <div className="ct-pager" aria-label="Pages">
          <span className="ct-range">
            {rows.length ? `${at * size + 1}–${Math.min(rows.length, at * size + size)}` : "0"} of {rows.length}
          </span>
          <button type="button" className="ct-icon-btn is-prev" onClick={() => setPage(at - 1)} disabled={at === 0} aria-label="Previous page">
            <CaretLeft size={14} weight="bold" />
          </button>
          <button type="button" className="ct-icon-btn is-next" onClick={() => setPage(at + 1)} disabled={at >= pages - 1} aria-label="Next page">
            <CaretRight size={14} weight="bold" />
          </button>
          <select className="ct-size" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Rows per page">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} rows</option>)}
          </select>
        </div>
      </div>

      {nFilters > 0 && <ActiveChips filters={filters} onChange={setFilters} />}

      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ct-c-check" aria-label="Select to compare" />
              <th className="ct-c-name">Name</th>
              <th className="ct-c-co">Current company</th>
              <th className="ct-c-sum">Summary</th>
              <th className="ct-c-contact">Contact info</th>
              <th className="ct-c-act"><span className="ct-sr">Shortlist</span></th>
            </tr>
          </thead>
          {loading ? (
            <tbody className="ct-skel" aria-busy="true" aria-label="Loading contacts">
              {/* Exactly as many placeholders as the page is about to show (the
                  page size, or fewer on a last page), so the table never jumps
                  from one length to another when the rows land. An empty result
                  still gets a short shimmer before its message. */}
              {Array.from({ length: shown.length || 3 }, (_, i) => <SkeletonRow key={i} i={i} />)}
            </tbody>
          ) : (
          <tbody key={`${camp}-${at}-${sort}-${size}-${nFilters}`}>
            {shown.map((c) => (
              <Row
                key={c.id}
                c={c}
                checked={selected.includes(c.id)}
                onCheck={() => toggleSelect(c.id)}
                onOpen={() => setOpenId(c.id)}
                shortlisted={lists[c.id] ?? []}
                onShortlist={(campaign) => toggleShortlist(c.id, campaign)}
                onCopy={toast}
              />
            ))}
          </tbody>
          )}
        </table>
        {!loading && shown.length > 0 && (
          <footer className="ct-foot">
            <span className="ct-foot-t">
              Showing <strong>{at * size + 1}–{Math.min(rows.length, at * size + size)}</strong> of <strong>{rows.length}</strong>
              {camp !== "all" && <> in {campName(camp)}</>}
            </span>
            <div className="ct-foot-pages" aria-label="Pages">
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} type="button" className={`ct-pg${i === at ? " is-on" : ""}`} aria-current={i === at ? "page" : undefined}
                  onClick={() => { setPage(i); document.querySelector(".ct-bar")?.scrollIntoView({ block: "nearest" }); }}>
                  {i + 1}
                </button>
              ))}
            </div>
            <button type="button" className="ct-btn ct-foot-next" disabled={at >= pages - 1}
              onClick={() => { setPage(at + 1); document.querySelector(".ct-head")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>
              Next page <CaretRight size={13} weight="bold" />
            </button>
          </footer>
        )}
        {!loading && !shown.length && (
          <div className="ct-empty">
            <p className="ct-empty-h">No contacts match.</p>
            <p>Try fewer filters or a shorter search.</p>
            {(nFilters > 0 || q) && (
              <button type="button" className="ct-btn" onClick={() => { setFilters(EMPTY_FILTERS); setQ(""); }}>Clear search and filters</button>
            )}
          </div>
        )}
      </div>

      <ProfileDialog
        c={openContact}
        onClose={() => setOpenId(null)}
        position={openIdx >= 0 ? { i: openIdx, n: shown.length } : null}
        onStep={step}
        shortlisted={openContact ? lists[openContact.id] ?? [] : []}
        onShortlist={(campaign) => openContact && toggleShortlist(openContact.id, campaign)}
        selected={openContact ? selected.includes(openContact.id) : false}
        onSelect={() => openContact && toggleSelect(openContact.id)}
        onCopy={toast}
        people={people}
        onCompare={() => { setOpenId(null); setComparing(true); }}
      />

      <CompareDialog
        open={comparing}
        people={people}
        onClose={() => setComparing(false)}
        onClear={() => { setComparing(false); setSelected([]); toast("Compare cleared"); }}
        onAdd={(id) => setSelected((cur) => (cur.includes(id) || cur.length >= MAX_COMPARE ? cur : [...cur, id]))}
        onRemove={(id) => setSelected((cur) => cur.filter((x) => x !== id))}
        lists={lists}
        onShortlist={toggleShortlist}
        onCopy={toast}
        onOpen={(id) => { setComparing(false); setOpenId(id); }}
      />
      <Toaster />
    </div>
  );
}

/* A number that counts to its new value instead of snapping. */
export function Num({ n }: { n: number }) {
  const [shown, setShown] = useState(n);
  const from = useRef(n);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 420);
      const v = Math.round(a + (n - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = n;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = n; };
  }, [n]);
  return <strong className="ct-num">{shown}</strong>;
}

/* ── compare tray ──
   Three slots in the header. Ticking a row drops that person into the next
   slot; the button wakes up once two are in. */
function CompareTray({ people, onCompare, onRemove }: { people: readonly Contact[]; onCompare: () => void; onRemove: (id: string) => void }) {
  const ready = people.length >= 2;
  return (
    <div className={`ct-tray${ready ? " is-ready" : ""}${people.length ? " has-some" : ""}`}>
      <div className="ct-tray-slots">
        {Array.from({ length: MAX_COMPARE }, (_, i) => {
          const p = people[i];
          return p ? (
            <button key={p.id} type="button" className="ct-slot is-full" onClick={() => onRemove(p.id)} title={`Remove ${p.name}`} aria-label={`Remove ${p.name} from compare`}>
              <Avatar name={p.name} hue={p.hue} size={28} />
              <span className="ct-slot-x" aria-hidden="true"><X size={9} weight="bold" /></span>
            </button>
          ) : (
            <span key={`e${i}`} className="ct-slot" aria-hidden="true" />
          );
        })}
      </div>
      <button type="button" className="ct-tray-go" onClick={onCompare} aria-disabled={!ready}>
        <ArrowsLeftRight size={14} weight="bold" />
        Compare
        <span className="ct-tray-n">{people.length}/{MAX_COMPARE}</span>
      </button>
    </div>
  );
}

/* ── campaign picker ──
   A searchable dropdown: seven campaigns today, many more later. */
function CampaignPicker({ value, onChange, counts }: { value: string; onChange: (id: string) => void; counts: Map<string, number> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); setQ(""); }, []);
  const all = [{ id: "all", name: "All campaigns", role: "Everyone saved" }, ...CAMPAIGNS.filter((c) => counts.get(c.id))];
  const list = all.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const countOf = (id: string) => (id === "all" ? total : counts.get(id) ?? 0);
  const current = all.find((c) => c.id === value) ?? all[0]!;
  useEffect(() => { setCursor(0); }, [q]);
  const pick = (id: string) => { onChange(id); close(); ref.current?.focus(); };

  return (
    <>
      <button ref={ref} type="button" className={`ct-camp${value !== "all" ? " is-set" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ct-camp-l">Campaign</span>
        <span className="ct-camp-v">{current.name}</span>
        <span className="ct-camp-n">{countOf(current.id)}</span>
        <CaretDown size={11} weight="bold" className="ct-camp-caret" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={320}>
        <div className="ct-cp">
          <label className="ct-cp-search">
            <MagnifyingGlass size={14} aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a campaign"
              aria-label="Find a campaign"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(list.length - 1, c + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
                if (e.key === "Enter" && list[cursor]) { e.preventDefault(); pick(list[cursor]!.id); }
              }}
            />
          </label>
          <div className="ct-cp-list" role="listbox" aria-label="Campaigns">
            {list.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === value}
                className={`ct-cp-i${c.id === value ? " is-on" : ""}${i === cursor ? " is-cursor" : ""}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(c.id)}
              >
                <span className="ct-cp-t">
                  <span className="ct-cp-name">{c.name}</span>
                  <span className="ct-cp-role">{c.role}</span>
                </span>
                <span className="ct-cp-n">{countOf(c.id)}</span>
                <span className="ct-cp-check">{c.id === value && <Check size={12} weight="bold" />}</span>
              </button>
            ))}
            {!list.length && <p className="ct-cp-empty">No campaign called “{q}”.</p>}
          </div>
        </div>
      </Popover>
    </>
  );
}

/* One placeholder row, shaped like the real one so nothing jumps when the
   data lands: checkbox, avatar and two lines, email, phone, location, saved
   for, and the shortlist pill. Line widths vary a little row to row so the
   block reads as content, not as a stripe pattern. */
function SkeletonRow({ i }: { i: number }) {
  const w = (base: number, spread: number) => `${base + ((i * 37) % spread)}px`;
  return (
    <tr className="ct-skel-row" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
      <td className="ct-c-check"><span className="csk csk-box" /></td>
      <td className="ct-c-name">
        <div className="ct-who">
          <span className="csk csk-circle" />
          <div className="csk-lines">
            <span className="csk csk-line" style={{ width: w(100, 50) }} />
            <span className="csk csk-line is-sub" style={{ width: w(130, 50) }} />
          </div>
        </div>
      </td>
      <td className="ct-c-co">
        <div className="ct-co"><span className="csk csk-sq" /><div className="csk-lines"><span className="csk csk-line" style={{ width: w(70, 40) }} /><span className="csk csk-line is-sub" style={{ width: w(90, 30) }} /></div></div>
      </td>
      <td className="ct-c-sum"><div className="csk-lines"><span className="csk csk-line" style={{ width: "92%" }} /><span className="csk csk-line is-sub" style={{ width: w(140, 80) }} /></div></td>
      <td className="ct-c-contact"><div className="csk-lines"><span className="csk csk-line" style={{ width: w(150, 50) }} /><span className="csk csk-line is-sub" style={{ width: w(110, 20) }} /></div></td>
      <td className="ct-c-act"><span className="csk csk-pill" /></td>
    </tr>
  );
}

/* ── row ── */

function Row({
  c, checked, onCheck, onOpen, shortlisted, onShortlist, onCopy,
}: {
  c: Contact;
  checked: boolean;
  onCheck: () => void;
  onOpen: () => void;
  shortlisted: readonly string[];
  onShortlist: (campaign: string) => void;
  onCopy: (msg: string) => void;
}) {
  const tenure = tenureOf(c);
  return (
    <tr
      className={`ct-row${checked ? " is-checked" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, a, label, select")) return;
        onOpen();
      }}
    >
      <td className="ct-c-check">
        <label className="ct-check">
          <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${c.name} to compare`} />
          <span aria-hidden="true"><Check size={11} weight="bold" /></span>
        </label>
      </td>
      <td>
        <div className="ct-who">
          <Avatar name={c.name} hue={c.hue} size={34} />
          <div className="ct-who-text">
            <button type="button" className="ct-name" onClick={onOpen}>{c.name}</button>
            <span className="ct-title">
              {c.title}<span className="ct-title-co"> · {c.company} · {c.location}</span>
            </span>
          </div>
        </div>
      </td>
      <td className="ct-c-co">
        <span className="ct-co">
          <span className="ct-co-mark" aria-hidden="true">{c.company.slice(0, 1)}</span>
          <span className="ct-co-text">
            <span className="ct-main">{c.company}<span className="ct-co-loc"> · {c.location}</span></span>
            <span className={`ct-sub${tenure.years !== null && tenure.years < 1 ? " is-new" : ""}`}>{tenure.label}</span>
          </span>
        </span>
      </td>
      <td className="ct-c-sum">
        <p className="ct-sum">
          {c.openToWork && <span className="ct-otw">Open to work</span>}
          {summaryOf(c)}
        </p>
      </td>
      <td className="ct-c-contact">
        <div className="ct-contact">
          <span className="ct-contact-l"><EnvelopeSimple size={13} aria-hidden="true" /><CopyCell kind="email" value={c.email?.value} verified={c.email?.verified} onCopy={onCopy} missing="No email yet" /></span>
          <span className="ct-contact-l"><Phone size={13} aria-hidden="true" /><CopyCell kind="phone" value={c.phone?.value} onCopy={onCopy} missing="No phone yet" /></span>
        </div>
      </td>
      <td className="ct-c-act">
        <ShortlistControl suggest={c.campaign} on={shortlisted} onPick={onShortlist} />
      </td>
    </tr>
  );
}

function CopyCell({ kind, value, verified, onCopy, missing = "Not found yet" }: { kind: "email" | "phone"; value?: string; verified?: boolean; onCopy: (m: string) => void; missing?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="ct-none">{missing}</span>;
  const copy = () => {
    void copyText(value);
    onCopy(kind === "email" ? "Email copied" : "Number copied");
    setDone(true);
    window.setTimeout(() => setDone(false), 1400);
  };
  return (
    <div className="ct-copy">
      <button type="button" className={`ct-copy-v${done ? " is-flash is-done" : ""}`} onClick={copy} title={`Copy ${value}`} aria-label={`Copy ${kind} ${value}`}>
        <span className="ct-copy-t">{value}</span>
        <span className="ct-copy-ico" aria-hidden="true">{done ? <Check size={12} weight="bold" /> : <Copy size={12} />}</span>
      </button>
      {verified && <span className="ct-copy-note" title="Verified email"><SealCheck size={13} weight="fill" /></span>}
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch { /* nothing else to try */ }
    t.remove();
  }
}

/* ── shortlist ──
   One press shortlists for the campaign the person was saved for; the caret
   picks any other campaign. Shortlisted reads as a filled, accent button that
   says for how many. */

function ShortlistControl({ suggest, on, onPick }: { suggest: string; on: readonly string[]; onPick: (campaign: string) => void }) {
  const active = on.length > 0;
  /* A small burst from the bookmark each time someone is added. Keyed, so
     every add replays it; removing plays nothing. */
  const [burst, setBurst] = useState(0);
  const was = useRef(active);
  useEffect(() => {
    if (active && !was.current) setBurst((b) => b + 1);
    was.current = active;
  }, [active]);
  return (
    <div className={`ct-sl${active ? " is-on" : ""}`}>
      {burst > 0 && (
        <span key={burst} className="ct-burst" aria-hidden="true">
          {Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 45 + 10}deg` }} />)}
        </span>
      )}
      <button
        type="button"
        className="ct-sl-main"
        onClick={() => onPick(active ? on[0]! : suggest)}
        title={active ? `Shortlisted for ${on.map(campName).join(", ")}` : `Shortlist for ${campName(suggest)}`}
      >
        <BookmarkSimple size={14} weight={active ? "fill" : "regular"} />
        <span className="ct-sl-label">{active ? "Shortlisted" : "Shortlist"}</span>
        {on.length > 1 && <span className="ct-sl-n" key={on.length}>{on.length}</span>}
      </button>
      <ShortlistMenuButton isOn={(c) => on.includes(c)} onPick={onPick} suggest={suggest} caret />
    </div>
  );
}

function ShortlistMenuButton({
  label, isOn, onPick, suggest, caret, tabIndex,
}: {
  label?: string;
  isOn: (campaign: string) => boolean;
  onPick: (campaign: string) => void;
  suggest?: string;
  caret?: boolean;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const order = suggest ? [...CAMPAIGNS].sort((a, b) => (a.id === suggest ? -1 : b.id === suggest ? 1 : 0)) : CAMPAIGNS;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={caret ? "ct-sl-caret" : "ct-btn"}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={caret ? "Shortlist for another campaign" : undefined}
        tabIndex={tabIndex}
      >
        {!caret && <BookmarkSimple size={14} />}
        {label}
        <CaretDown size={11} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={260}>
        <div className="ct-menu" role="menu">
          <p className="ct-menu-h">Shortlist for campaign</p>
          {order.map((c) => {
            const on = isOn(c.id);
            return (
              <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={on} className={`ct-menu-i${on ? " is-on" : ""}`}
                onClick={() => { onPick(c.id); setOpen(false); }}>
                <span className="ct-menu-box">{on && <Check size={11} weight="bold" />}</span>
                <span className="ct-menu-t">{c.name}</span>
                {c.id === suggest && <span className="ct-menu-tag">Saved for</span>}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

/* ── popover ──
   Portalled so the table's horizontal scroll cannot clip it; placed under
   its button, or above when there is no room below. */

export function Popover({
  anchor, open, onClose, align = "start", width, children,
}: {
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  align?: "start" | "end";
  width: number;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) { setPos(null); return; }
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const h = panel.current?.offsetHeight ?? 300;
      const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
      const left = Math.min(Math.max(8, align === "end" ? r.right - width : r.left), window.innerWidth - width - 8);
      setPos({ top: up ? r.top - 6 - h : r.bottom + 6, left, up });
    };
    place();
    const id = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    /* Close when the PAGE scrolls (the anchor moves away), but not when the
       popover's own list scrolls: a capture listener sees both, and closing
       on every scroll made a long list impossible to scroll. */
    const onScroll = (e: Event) => {
      if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", place); window.removeEventListener("scroll", onScroll, true); };
  }, [open, anchor, align, width, onClose]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor.current?.focus(); } };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panel}
      className={`ct-pop${pos?.up ? " is-up" : ""}`}
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ── filters ── */

function FiltersButton({ filters, onChange, pool, count }: { filters: Filters; onChange: (f: Filters) => void; pool: readonly Contact[]; count: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const locations = useMemo(() => optionsFor(pool, "location", 10), [pool]);
  const skills = useMemo(() => optionsFor(pool, "skills", 14), [pool]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const flip = <T,>(xs: readonly T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  return (
    <>
      <button ref={ref} type="button" className={`ct-btn${count ? " is-active" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FunnelSimple size={14} weight="bold" /> Filters{count > 0 && <span className="ct-count">{count}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={460}>
        <div className="ct-filters">
          <Group label="Seniority">
            {SENIORITIES.map((s) => (
              <Chip key={s} on={filters.seniority.includes(s)} onClick={() => set("seniority", flip<Seniority>(filters.seniority, s))}>{s}</Chip>
            ))}
          </Group>
          <Group label="Experience">
            {EXP_BANDS.map((b) => (
              <Chip key={b.id} on={filters.experience.includes(b.id)} onClick={() => set("experience", flip<ExpBand>(filters.experience, b.id))}>{b.label}</Chip>
            ))}
          </Group>
          <Group label="Location">
            {locations.map((l) => (
              <Chip key={l} on={filters.location.includes(l)} onClick={() => set("location", flip(filters.location, l))}>{l}</Chip>
            ))}
          </Group>
          <Group label="Skills" hint="has all selected">
            {skills.map((s) => (
              <Chip key={s} on={filters.skills.includes(s)} onClick={() => set("skills", flip(filters.skills, s))}>{s}</Chip>
            ))}
          </Group>
          <Group label="Contact details">
            {([["email", "Has email"], ["verified", "Verified email"], ["phone", "Has phone"]] as const).map(([id, l]) => (
              <Chip key={id} on={filters.contact.includes(id)} onClick={() => set("contact", flip<ContactNeed>(filters.contact, id))}>{l}</Chip>
            ))}
            <Chip on={filters.openToWork} onClick={() => set("openToWork", !filters.openToWork)}>Open to work</Chip>
          </Group>
          <Group label="Profile">
            {([["any", "Any"], ["full", "Full profile"], ["basic", "Saved page only"]] as const).map(([id, l]) => (
              <Chip key={id} on={filters.profile === id} onClick={() => set("profile", id)}>{l}</Chip>
            ))}
          </Group>
          <Group label="Saved">
            {([["any", "Any time"], ["7", "Last 7 days"], ["30", "Last 30 days"]] as const).map(([id, l]) => (
              <Chip key={id} on={filters.captured === id} onClick={() => set("captured", id)}>{l}</Chip>
            ))}
          </Group>
          <Group label="Saved by">
            {MEMBERS.map((m) => (
              <Chip key={m} on={filters.capturedBy.includes(m)} onClick={() => set("capturedBy", flip<string>(filters.capturedBy, m))}>{m}</Chip>
            ))}
          </Group>
          <footer className="ct-filters-foot">
            <button type="button" className="ct-link" onClick={() => onChange(EMPTY_FILTERS)} disabled={!count}>Clear all</button>
            <button type="button" className="ct-btn is-primary" onClick={close}>Done</button>
          </footer>
        </div>
      </Popover>
    </>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="ct-group">
      <legend>{label}{hint && <span className="ct-group-hint"> · {hint}</span>}</legend>
      <div className="ct-chips">{children}</div>
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`ct-chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {on && <Check size={11} weight="bold" />}{children}
    </button>
  );
}

function ActiveChips({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  const drop = <K extends keyof Filters>(k: K, v: Filters[K]) => () => onChange({ ...filters, [k]: v });
  for (const s of filters.seniority) chips.push({ key: `s-${s}`, label: s, clear: drop("seniority", filters.seniority.filter((x) => x !== s)) });
  for (const e of filters.experience) chips.push({ key: `e-${e}`, label: EXP_BANDS.find((b) => b.id === e)!.label, clear: drop("experience", filters.experience.filter((x) => x !== e)) });
  for (const l of filters.location) chips.push({ key: `l-${l}`, label: l, clear: drop("location", filters.location.filter((x) => x !== l)) });
  for (const s of filters.skills) chips.push({ key: `k-${s}`, label: s, clear: drop("skills", filters.skills.filter((x) => x !== s)) });
  const need = { email: "Has email", phone: "Has phone", verified: "Verified email" } as const;
  for (const n of filters.contact) chips.push({ key: `c-${n}`, label: need[n], clear: drop("contact", filters.contact.filter((x) => x !== n)) });
  if (filters.openToWork) chips.push({ key: "otw", label: "Open to work", clear: drop("openToWork", false) });
  if (filters.profile !== "any") chips.push({ key: "p", label: filters.profile === "full" ? "Full profile" : "Saved page only", clear: drop("profile", "any") });
  if (filters.captured !== "any") chips.push({ key: "d", label: `Last ${filters.captured} days`, clear: drop("captured", "any") });
  for (const m of filters.capturedBy) chips.push({ key: `m-${m}`, label: `Saved by ${m}`, clear: drop("capturedBy", filters.capturedBy.filter((x) => x !== m)) });
  return (
    <div className="ct-active">
      {chips.map((c) => (
        <button key={c.key} type="button" className="ct-active-chip" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
          {c.label}<X size={10} weight="bold" />
        </button>
      ))}
      <button type="button" className="ct-link" onClick={() => onChange(EMPTY_FILTERS)}>Clear all</button>
    </div>
  );
}

function SortButton({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const opts: readonly [SortKey, string][] = [["recent", "Recently saved"], ["name", "Name"], ["experience", "Most experience"]];
  return (
    <>
      <button ref={ref} type="button" className="ct-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SortAscending size={14} weight="bold" /> {opts.find(([k]) => k === sort)![1]}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={200}>
        <div className="ct-menu" role="menu">
          {opts.map(([k, l]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={`ct-menu-i${sort === k ? " is-on" : ""}`}
              onClick={() => { onChange(k); close(); }}>
              <span className="ct-menu-box is-radio">{sort === k && <Check size={11} weight="bold" />}</span>
              <span className="ct-menu-t">{l}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/* ── profile ── */

function ProfileDialog({
  c, onClose, position, onStep, shortlisted, onShortlist, selected, onSelect, onCopy, people, onCompare,
}: {
  people: readonly Contact[];
  onCompare: () => void;
  c: Contact | null;
  onClose: () => void;
  position: { i: number; n: number } | null;
  onStep: (d: number) => void;
  shortlisted: readonly string[];
  onShortlist: (campaign: string) => void;
  selected: boolean;
  onSelect: () => void;
  onCopy: (m: string) => void;
}) {
  const last = useRef<Contact | null>(null);
  if (c) last.current = c;
  const p = c ?? last.current;

  useEffect(() => {
    if (!c) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select") || document.querySelector(".ct-pop")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onStep(1); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onStep(-1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [c, onStep]);

  return (
    <Dialog open={!!c} onClose={onClose} label={p ? `${p.name}, profile` : "Profile"} size="md">
      {p && (
        <div className="cp" key={p.id}>
          <header className="cp-head">
            <Avatar name={p.name} hue={p.hue} size={56} />
            <div className="cp-id">
              <h2 className="cp-name">
                {p.name}
                {p.openToWork && <span className="cp-otw">Open to work</span>}
              </h2>
              <p className="cp-title">{p.title} at {p.company}</p>
              <p className="cp-meta">
                <span><MapPin size={13} /> {p.location}</span>
                <span><Briefcase size={13} /> {p.years} yrs · {p.seniority}</span>
                <a href={`https://${p.linkedin}`} target="_blank" rel="noreferrer"><LinkedinLogo size={13} weight="fill" /> LinkedIn</a>
              </p>
            </div>
          </header>

          <div className="cp-body">
            <section className="cp-contact">
              <ContactLine icon={<EnvelopeSimple size={15} />} label="Email" value={p.email?.value}
                note={p.email ? (p.email.verified ? <><SealCheck size={12} weight="fill" className="cp-ok" /> Verified</> : "Not verified yet") : "Still looking"}
                onCopy={onCopy} kind="email" />
              <ContactLine icon={<Phone size={15} />} label="Phone" value={p.phone?.value}
                note={p.phone ? "Mobile" : "Still looking"}
                onCopy={onCopy} kind="phone" />
            </section>

            <p className="cp-src">
              {p.profile === "full"
                ? <>Saved for {campName(p.campaign)} by {p.capturedBy}, {capturedLabel(p.capturedAgo).toLowerCase()}.</>
                : <>Saved for {campName(p.campaign)} by {p.capturedBy}, {capturedLabel(p.capturedAgo).toLowerCase()}. The full profile is still loading.</>}
            </p>

            <section className="cp-sl">
              <h3><BookmarkSimple size={14} weight={shortlisted.length ? "fill" : "regular"} /> Shortlisted for</h3>
              {shortlisted.length ? (
                <div className="cp-sl-list">
                  {shortlisted.map((id) => {
                    const camp = CAMPAIGNS.find((x) => x.id === id);
                    return (
                      <span key={id} className="cp-sl-chip">
                        <span className="cp-sl-name">{camp?.name ?? id}</span>
                        {camp && <span className="cp-sl-role">{camp.role}</span>}
                        <button type="button" className="cp-sl-x" onClick={() => onShortlist(id)} aria-label={`Remove from ${camp?.name ?? id}`} title="Remove">
                          <X size={10} weight="bold" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="cp-sl-none">Not shortlisted for any role yet.</p>
              )}
            </section>

            {p.about && <p className="cp-about">{p.about}</p>}

            <section className="cp-sec">
              <h3><Briefcase size={14} /> Experience</h3>
              <ol className="cp-jobs">
                {p.jobs.map((j, i) => (
                  <li key={i}>
                    <span className="cp-job-t">{j.title}</span>
                    <span className="cp-job-c">{j.company}</span>
                    <span className="cp-job-s">{j.span}</span>
                  </li>
                ))}
              </ol>
            </section>

            {p.school && (
              <section className="cp-sec">
                <h3><GraduationCap size={14} /> Education</h3>
                <p className="cp-school"><strong>{p.school.name}</strong> · {p.school.degree} · {p.school.years}</p>
              </section>
            )}

            <section className="cp-sec">
              <h3>Skills</h3>
              <div className="cp-skills">{p.skills.map((s) => <span key={s} className="cp-skill">{s}</span>)}</div>
            </section>
          </div>

          <footer className="cp-foot">
            <div className="cp-step">
              <button type="button" className="ct-icon-btn" onClick={() => onStep(-1)} disabled={!position || position.i === 0} aria-label="Previous contact (←)" title="Previous (←)">
                <CaretLeft size={14} weight="bold" />
              </button>
              <span>{position ? `${position.i + 1} of ${position.n}` : ""}</span>
              <button type="button" className="ct-icon-btn" onClick={() => onStep(1)} disabled={!position || position.i >= position.n - 1} aria-label="Next contact (→)" title="Next (→)">
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
            <div className={`cp-cmp${people.length >= 2 ? " is-ready" : ""}`}>
              <button type="button" className={`cp-cmp-add${selected ? " is-on" : ""}`} onClick={onSelect}
                title={selected ? "Remove from compare" : people.length >= MAX_COMPARE ? "Compare is full" : "Add to compare"}>
                <span className="cp-cmp-box">{selected && <Check size={11} weight="bold" />}</span>
                {selected ? "In compare" : "Add to compare"}
              </button>
              <span className="cp-cmp-faces" aria-hidden="true">
                {people.map((x) => <Avatar key={x.id} name={x.name} hue={x.hue} size={22} />)}
              </span>
              <button type="button" className="cp-cmp-go" onClick={onCompare} disabled={people.length < 2}
                title={people.length < 2 ? "Add one more person to compare" : `Compare ${people.length}`}>
                Compare {people.length}/{MAX_COMPARE}
              </button>
            </div>
            <ShortlistControl suggest={p.campaign} on={shortlisted} onPick={onShortlist} />
          </footer>
        </div>
      )}
    </Dialog>
  );
}

function ContactLine({ icon, label, value, note, onCopy, kind }: {
  icon: ReactNode; label: string; value?: string; note: ReactNode; onCopy: (m: string) => void; kind: "email" | "phone";
}) {
  const [done, setDone] = useState(false);
  const copy = () => {
    if (!value) return;
    void copyText(value);
    onCopy(kind === "email" ? "Email copied" : "Number copied");
    setDone(true);
    window.setTimeout(() => setDone(false), 1400);
  };
  return (
    <div className={`cp-line${value ? "" : " is-empty"}`}>
      <span className="cp-line-ico">{icon}</span>
      <div className="cp-line-text">
        <span className="cp-line-l">{label}</span>
        {value
          ? <button type="button" className="cp-line-v" onClick={copy} title="Copy">{value}</button>
          : <span className="cp-line-v is-none">Not found yet</span>}
        <span className="cp-line-n">{note}</span>
      </div>
      {value && (
        <button type="button" className={`cp-copy${done ? " is-done" : ""}`} onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} title="Copy">
          {done ? <Check size={14} weight="bold" /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
}

/* ── compare ──
   Up to three people in columns, one row per thing a recruiter weighs.
   Skills everyone shares are marked, and so is the most experienced.

   The set can change without leaving: each person has an × to drop them,
   and while there is room a fourth column offers "Add person", a search
   over every contact. Both edit the same selection the table's ticks show,
   so closing the dialog leaves the table agreeing with what was compared. */

function CompareDialog({
  open, people, onClose, onClear, onAdd, onRemove, lists, onShortlist, onCopy, onOpen,
}: {
  open: boolean;
  onClear: () => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  people: readonly Contact[];
  onClose: () => void;
  lists: Shortlists;
  onShortlist: (id: string, campaign: string) => void;
  onCopy: (m: string) => void;
  onOpen: (id: string) => void;
}) {
  const last = useRef<readonly Contact[]>(people);
  if (open) last.current = people;
  const ps = open ? people : last.current;
  const room = ps.length < MAX_COMPARE;
  const cols = ps.length + (room ? 1 : 0);
  const shared = new Set(ps[0]?.skills.filter((s) => ps.every((p) => p.skills.includes(s))) ?? []);
  const most = Math.max(...ps.map((p) => p.years));
  const lead = ps.filter((p) => p.years === most).length === 1 ? most : -1;

  const rows: { label: string; cell: (p: Contact) => ReactNode }[] = [
    { label: "Current role", cell: (p) => <><strong>{p.title}</strong><span className="cc-sub">{p.company} · {p.industry}</span></> },
    { label: "Experience", cell: (p) => <span className={p.years === lead ? "cc-lead" : undefined}>{p.years} yrs · {p.seniority}{p.years === lead && <span className="cc-tag">Most</span>}</span> },
    { label: "Location", cell: (p) => p.location },
    { label: "Previously", cell: (p) => p.jobs[1] ? <>{p.jobs[1].title}<span className="cc-sub">{p.jobs[1].company} · {p.jobs[1].span}</span></> : <span className="ct-none">Not in the saved page</span> },
    { label: "Education", cell: (p) => p.school ? <>{p.school.name}<span className="cc-sub">{p.school.degree}</span></> : <span className="ct-none">Not in the saved page</span> },
    { label: "Skills", cell: (p) => <div className="cp-skills">{p.skills.map((s) => <span key={s} className={`cp-skill${shared.has(s) ? " is-shared" : ""}`}>{s}</span>)}</div> },
    { label: "Email", cell: (p) => <CopyCell kind="email" value={p.email?.value} verified={p.email?.verified} onCopy={onCopy} /> },
    { label: "Phone", cell: (p) => <CopyCell kind="phone" value={p.phone?.value} onCopy={onCopy} /> },
    { label: "Saved for", cell: (p) => <>{campName(p.campaign)}<span className="cc-sub">{capturedLabel(p.capturedAgo)} · {p.capturedBy}</span></> },
  ];

  return (
    <Dialog open={open} onClose={onClose} label="Compare contacts" size="lg">
      <div className="cc" style={{ ["--cc-n" as string]: cols }}>
        <header className="cc-head">
          <h2>Compare</h2>
          {ps.length < 2
            ? <p>Add {ps.length ? "one more person" : "two people"} to compare side by side</p>
            : shared.size > 0 && <p><span className="cp-skill is-shared">Shared</span> skills all {ps.length} have</p>}
          <button type="button" className="ct-btn cc-clear" onClick={onClear}>
            <X size={12} weight="bold" /> Clear compare
          </button>
        </header>
        <div className="cc-scroll">
          <div className="cc-grid">
            <div className="cc-corner" />
            {ps.map((p) => (
              <div key={p.id} className="cc-person">
                <button type="button" className="cc-x" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name} from compare`} title="Remove from compare">
                  <X size={12} weight="bold" />
                </button>
                <Avatar name={p.name} hue={p.hue} size={44} />
                <button type="button" className="ct-name" onClick={() => onOpen(p.id)}>{p.name}</button>
                <span className="ct-title">{p.title}</span>
                <ShortlistControl suggest={p.campaign} on={lists[p.id] ?? []} onPick={(camp) => onShortlist(p.id, camp)} />
              </div>
            ))}
            {room && <AddSlot exclude={ps.map((p) => p.id)} near={ps[0]} onAdd={onAdd} />}
            {rows.map((r) => (
              <div key={r.label} className="cc-row">
                <div className="cc-label">{r.label}</div>
                {ps.map((p) => <div key={p.id} className="cc-cell">{r.cell(p)}</div>)}
                {room && <div className="cc-cell is-empty" aria-hidden="true"><span /></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* The open column: a dashed slot that becomes a search over every contact.
   Before anything is typed it suggests people from the same campaign as
   the first person being compared, since that is usually the comparison. */
function AddSlot({ exclude, near, onAdd }: { exclude: readonly string[]; near?: Contact; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); setQ(""); }, []);
  const list = useMemo(() => {
    const pool = CONTACTS.filter((c) => !exclude.includes(c.id));
    const needle = q.trim();
    const hits = needle ? pool.filter((c) => matches(c, EMPTY_FILTERS, needle))
      : [...pool].sort((a, b) => Number(b.campaign === near?.campaign) - Number(a.campaign === near?.campaign));
    return hits.slice(0, 8);
  }, [q, exclude, near]);
  useEffect(() => { setCursor(0); }, [q]);
  const pick = (id: string) => { onAdd(id); close(); };

  return (
    <div className="cc-person cc-add">
      <button ref={ref} type="button" className="cc-add-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="cc-add-ico" aria-hidden="true"><Plus size={16} weight="bold" /></span>
        <span className="cc-add-t">Add person</span>
        <span className="cc-add-s">Search contacts</span>
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={320}>
        <div className="ct-cp">
          <label className="ct-cp-search">
            <MagnifyingGlass size={14} aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, title, company or skill"
              aria-label="Find a person to compare"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(list.length - 1, c + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
                if (e.key === "Enter" && list[cursor]) { e.preventDefault(); pick(list[cursor]!.id); }
              }}
            />
          </label>
          <div className="ct-cp-list" role="listbox" aria-label="Contacts">
            {!q && near && <p className="cc-add-hint">From {campName(near.campaign)} first</p>}
            {list.map((c, i) => (
              <button key={c.id} type="button" role="option" aria-selected={i === cursor}
                className={`ct-cp-i cc-add-i${i === cursor ? " is-cursor" : ""}`}
                onMouseEnter={() => setCursor(i)} onClick={() => pick(c.id)}>
                <Avatar name={c.name} hue={c.hue} size={26} />
                <span className="ct-cp-t">
                  <span className="ct-cp-name">{c.name}</span>
                  <span className="ct-cp-role">{c.title} · {c.company}</span>
                </span>
                <span className="ct-cp-n">{c.years}y</span>
              </button>
            ))}
            {!list.length && <p className="ct-cp-empty">No one matches “{q}”.</p>}
          </div>
        </div>
      </Popover>
    </div>
  );
}

/* ── toast ──
   One line, bottom centre, replaced rather than stacked. */

let pushToast: ((m: string) => void) | null = null;

export function useToast() {
  return useCallback((m: string) => pushToast?.(m), []);
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    let n = 0;
    let t = 0;
    pushToast = (text) => {
      n += 1;
      setMsg({ text, n });
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 1800);
    };
    return () => { pushToast = null; window.clearTimeout(t); };
  }, []);
  return createPortal(
    <div className="ct-toast-host" role="status" aria-live="polite">
      {msg && <div key={msg.n} className="ct-toast"><Check size={13} weight="bold" /> {msg.text}</div>}
    </div>,
    document.body,
  );
}

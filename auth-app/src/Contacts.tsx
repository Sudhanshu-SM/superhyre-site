import { CapturesNudge } from "./CapturesNudge";
import { ContactEditable } from "./ContactEditable";
import { MatchSection } from "./MatchSection";
import {
  ArrowsLeftRight, BookmarkSimple, Briefcase, CaretDown, CaretLeft, CaretRight, Check, Copy, EnvelopeSimple,
  FunnelSimple, GraduationCap, LinkedinLogo, MagnifyingGlass, MapPin, NotePencil, PencilSimple, Phone, Plus, PuzzlePiece, SealCheck, SortAscending, Trash, UserPlus, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { AddCandidatesDialog } from "./AddCandidates";
import type { AddResult } from "./AddCandidates";
import type { CandidateDetail, Note } from "./api/candidates";
import * as cands from "./api/candidates";
import { LIVE, messageOf } from "./api/client";
import { memberIdOf, memberName, useCampaignRows, useCampaignsReady, useTeam } from "./campaignStore";
import { stageLabel } from "./chatCards";
import { statusProps } from "./statusTones";
import { controlState, stagesFrom, withOverlay } from "./shortlistControl";
import type { StageOverlay } from "./shortlistControl";
import { Avatar } from "./CandidateBits";
import type { Contact, ContactNeed, ExpBand, Filters, Seniority, SortKey } from "./contacts";
import {
  CONTACTS, EMPTY_FILTERS, EXP_BANDS, MEMBERS, SEED_SHORTLIST, SENIORITIES, activeFilterCount, addedLine, capturedLabel,
  experienceLabel, matches, mostYears, optionsFor, sortContacts, summaryOf, tenureOf,
} from "./contacts";
import { EmptyArt } from "./EmptyArt";
import { listEmptyArt } from "./emptyStates";
import { Dialog, firstGlyph, LoadFailed, useBackCloses } from "./ui";
import { emptyList } from "./emptyStates";
import type { Campaign } from "./workspaces";
import { CAMPAIGNS } from "./workspaces";
import { ConfirmDialog } from "./RoleBits";
import { useCan } from "./can";
import { CHROME_STORE_URL } from "./config";
import { Loader } from "./components/Loader";
import { Pager } from "./components/Pager";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { hasDeepLink, loadSection, settledOffset, take } from "./sectionState";
import { PAGE_FALLBACK, PAGE_MAX, PAGE_MIN, PAGER_FOOT, usePageSize, usePageSizeChoice } from "./usePageSize";
import { Shimmer, ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { invalidate, onInvalidate } from "./invalidate";
import { useToast } from "./toast";
import { useSession, visibleCampaigns } from "./roleStore";
import { mayChangeCampaign } from "./campaignRights";
import "./contacts.css";

/**
 * Contacts — everyone the team has saved, by hand, by import or through the agent.
 *
 * A table first: who they are, how to reach them, which campaign they were
 * saved for, and a shortlist button on the right. Everything else (career,
 * education, where each field came from) is one click away in a profile
 * that opens in the middle of the screen, so opening and closing people
 * never sends the pointer to a screen edge.
 *
 * Campaign tabs scope the list the same way a save is scoped.
 * Filters are chips in one panel, no nested menus. Paging sits at the top,
 * next to the search, where the eye already is. Clicking an email or a
 * number copies it.
 */

/* The campaigns this page offers. Fixtures, or with the API the workspace's
   own, set while the page renders so every menu and toast reads the same. */
let campaignsNow: readonly Campaign[] = CAMPAIGNS;
/* What the shortlist menus offer: campaigns this person works on that are still running. */
let pickableNow: readonly Campaign[] = CAMPAIGNS;
/* Where each person stands on each campaign they are on (campaign id to stage), so the control can leave a campaign
   they are rejected on unticked. Set on each render, like the campaigns above. */
const NO_STAGES: Readonly<Record<string, string>> = {};
let stagesNow: Readonly<Record<string, Readonly<Record<string, string>>>> = {};
const stagesOfNow = (personId: string): Readonly<Record<string, string>> => stagesNow[personId] ?? NO_STAGES;
const campName = (id: string) => campaignsNow.find((c) => c.id === id)?.name ?? id;
const MAX_COMPARE = 3;

type Shortlists = Record<string, readonly string[]>;

/* ── where the person left this list (this tab only) ──
   Everything read back is checked against what the page can be in: an unknown filter, a sort that is gone, a page
   past the cursors that were kept all fall back to the top of the list. */
const SECTION = "candidates";
const SORTS: readonly SortKey[] = ["recent", "name", "experience"];
const NEEDS = ["email", "phone", "verified"] as const;
type Remembered = { camp: string; q: string; filters: Filters; sort: SortKey; size: number; offset: number };
/** The teammate who added a person: nobody for one who applied through a form (no one added them). */
const addedByOf = (r: { ownerId: string | null; source: string | null }): string => (r.source === "form" ? "" : memberName(r.ownerId) ?? "");

const NOTHING: Remembered = { camp: "all", q: "", filters: EMPTY_FILTERS, sort: "recent", size: PAGE_FALLBACK, offset: 0 };
const listOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] => take.strs(v).filter((x): x is T => (allowed as readonly string[]).includes(x));
export function filtersFrom(v: unknown): Filters {
  const r = take.rec(v);
  return {
    seniority: listOf(r.seniority, SENIORITIES),
    experience: listOf(r.experience, EXP_BANDS.map((b) => b.id)),
    location: take.strs(r.location),
    skills: take.strs(r.skills),
    contact: listOf(r.contact, NEEDS),
    profile: take.oneOf(r.profile, ["any", "full", "basic"] as const, "any"),
    capturedBy: take.strs(r.capturedBy),
    captured: take.oneOf(r.captured, ["any", "7", "30"] as const, "any"),
    openToWork: take.bool(r.openToWork),
  };
}
export function readRemembered(r: Record<string, unknown>): Remembered {
  return {
    camp: take.str(r.camp, "all", 80) || "all",
    q: take.str(r.q, "", 200),
    filters: filtersFrom(r.filters),
    sort: take.oneOf(r.sort, SORTS, "recent"),
    // The size the page was left at: the page is kept as the row it started at, so any size lands on the page that holds it.
    size: take.int(r.size, NOTHING.size, PAGE_MIN, PAGE_MAX),
    offset: take.int(r.offset, 0, 0, 100_000),
  };
}

/* Contacts an admin deleted this session. Module state, so leaving the page
   and coming back does not bring them back; a reload does, like every other
   fixture edit in the console. */
let deletedSoFar: ReadonlySet<string> = new Set();
/* People added by hand this session, newest first, and edits made to anyone:
   module state for the same reason. */
let addedSoFar: readonly Contact[] = [];
let editsSoFar: Record<string, ContactEdit> = {};

type Profile = { detail: CandidateDetail; contact: Contact; notes: readonly Note[] };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** `failed`: the last load didn't arrive, so the page says so instead of "no candidates". */
type LiveRows = { rows: readonly cands.CandidateRow[]; next: string | null; total: number | null; loading: boolean; failed: boolean; view: string | null };

/** One page from the API. `view` names the view the rows on screen belong to. */
function useLiveRows(query: cands.ListQuery | null, reload: number, view: string): LiveRows {
  const [state, setState] = useState<LiveRows>({ rows: [], next: null, total: null, loading: LIVE, failed: false, view: null });
  const toast = useToast();
  const key = query ? cands.listPath(query) : null;
  useEffect(() => {
    if (!query) return;
    let gone = false;
    setState((s) => ({ ...s, loading: true }));
    cands.listCandidates(query).then(
      (r) => { if (!gone) setState({ rows: r.rows, next: r.nextCursor, total: r.total, loading: false, failed: false, view }); },
      (err: unknown) => {
        if (gone) return;
        setState((s) => ({ ...s, loading: false, failed: true, view }));
        toast(messageOf(err), "error");
      },
    );
    return () => { gone = true; };
    // The path is the query; the object itself is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);
  return state;
}

/** The workspace's campaigns for menus: the campaign list, plus any a candidate is on that it doesn't have yet. */
function liveCampaigns(rows: readonly { id: string; name: string; department: string; location: string }[], people: readonly cands.CandidateRow[]): Campaign[] {
  const out: Campaign[] = rows.map((r) => ({ id: r.id, name: r.name, role: [r.department, r.location].filter(Boolean).join(" · ") }));
  for (const r of people) for (const c of r.campaigns) if (!out.some((x) => x.id === c.id)) out.push({ id: c.id, name: c.name, role: "" });
  return out;
}

export function ContactsPage() {
  /* A link of its own (?open=) starts from what it says; a first visit from the top. */
  const [start] = useState<Remembered>(() => (hasDeepLink() ? NOTHING : loadSection(SECTION, readRemembered, NOTHING)));
  /* Candidates is the whole organisation's people, not one campaign's: it always opens on all of them, and a campaign
     is only a filter chosen on the page (or by a link of its own), never something carried over from the last visit. */
  const [camp, setCamp] = useState<string>("all");
  const [q, setQ] = useState(start.q);
  const [filters, setFilters] = useState<Filters>(start.filters);
  const [sort, setSort] = useState<SortKey>(start.sort);
  /* Where the page starts, as a row: held inside the list once its total is known, never before. */
  const [wanted, setWanted] = useState(start.offset);
  /* As many rows as fit under the table's top (its head and the page's foot kept clear); the size the page was left at until measured. */
  const autoSize = usePageSize(64, { fallback: start.size, reserve: 24 + 44 + PAGER_FOOT });
  /* The size the window fits is "Auto"; the person may choose a fixed one that suits how many there are (25 to 1,000). */
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const { size, picker } = usePageSizeChoice("candidates", autoSize, knownTotal);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [lists, setLists] = useState<Shortlists>(LIVE ? {} : SEED_SHORTLIST);
  /* A link from a call ("#/contacts?open=<id>") opens that person's profile. */
  const [openId, setOpenId] = useState<string | null>(() => /[?&]open=([0-9a-f-]{36})(?:&|$)/i.exec(window.location.hash)?.[1] ?? null);
  /* The same link followed while this page is open (quick find: a candidate) opens that person at once. */
  useEffect(() => {
    const read = () => {
      const id = /[?&]open=([0-9a-f-]{36})(?:&|$)/i.exec(window.location.hash)?.[1];
      if (id) setOpenId(id);
    };
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const [comparing, setComparing] = useState(false);
  /* Recruiter edits layered over the fetched profile. With the API they are
     the optimistic copy of a PATCH, kept until the next load replaces them. */
  const [edits, setEditsState] = useState<Record<string, ContactEdit>>(editsSoFar);
  const setEdits = (fn: (cur: Record<string, ContactEdit>) => Record<string, ContactEdit>) =>
    setEditsState((cur) => { editsSoFar = fn(cur); return editsSoFar; });
  const [added, setAdded] = useState<readonly Contact[]>(addedSoFar);
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  /* Rows just added, lit for a few seconds so the eye finds them. */
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const canAdd = useCan("contact.add");
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(deletedSoFar);
  const [confirmDelete, setConfirmDelete] = useState<readonly string[] | null>(null);
  const canDelete = useCan("contact.delete");
  /* Who added a person, and the filter by who: the organisation's owner and admins (the demo shows it). */
  const seeAddedBy = useCan("candidate.seeAddedBy");
  const seeAdded = !LIVE || seeAddedBy;
  const toast = useToast();

  /* ── the API's page ──
     Filters, search and sort run on the server, and so does the page: it is asked for by the row it starts at and
     answers with the whole count, so the pager can show every page number. */
  const [reload, setReload] = useState(0);
  /* Something the agent (or another page) did changed who is in the directory: read this page again. */
  useEffect(() => onInvalidate((effects) => { if (effects.has("candidates")) setReload((k) => k + 1); }), []);
  const dq = useDebounced(q, 250);
  /* The page: the row it starts at, held inside the list as the last read of it had it (not before one has arrived). */
  const lastTotal = useRef<number | null>(null);
  const pageAt = settledOffset(wanted, lastTotal.current, size);
  const query: cands.ListQuery | null = LIVE ? {
    q: dq, campaignId: camp === "all" ? undefined : camp, location: filters.location[filters.location.length - 1],
    ownerId: memberIdOf(filters.capturedBy[filters.capturedBy.length - 1] ?? ""),
    hasEmail: filters.contact.includes("email"), hasPhone: filters.contact.includes("phone"), skills: filters.skills,
    sort: sort === "name" ? "name" : "recent", limit: size, offset: pageAt.offset,
  } : null;
  const viewKey = `${camp}-${pageAt.offset}-${sort}-${size}-${JSON.stringify(filters)}`;
  const live = useLiveRows(query, reload, viewKey);
  const [details, setDetails] = useState<Readonly<Record<string, Profile>>>({});
  /* What a change made on this page says about someone, until the list read after it replaces it. */
  const [overlay, setOverlay] = useState<StageOverlay>({});
  const say = useCallback((id: string, campaign: string, stage: string | null) => setOverlay((cur) => ({ ...cur, [id]: { ...cur[id], [campaign]: stage } })), []);
  const campRows = useCampaignRows();
  const session = useSession();
  if (LIVE) {
    campaignsNow = liveCampaigns(campRows, live.rows);
    /* Only campaigns this person may change are offered (the server refuses the rest); ones the candidate is already on
       are added back per person, in the menu. */
    pickableNow = liveCampaigns(
      visibleCampaigns(campRows, session).filter((r) => r.status !== "closed" && mayChangeCampaign(session, r)),
      [],
    );
    stagesNow = withOverlay(stagesFrom(live.rows, details), overlay);
  }
  /* The list just read is the server's word: what was said by hand is put aside. */
  useEffect(() => { setOverlay({}); }, [live.rows]);
  useEffect(() => {
    if (!live.rows.length) return;
    setLists((cur) => {
      const next = { ...cur };
      for (const r of live.rows) next[r.id] = r.campaigns.map((c) => c.id);
      return next;
    });
  }, [live.rows]);

  const withEdits = useCallback((c: Contact) => (edits[c.id] ? { ...c, ...edits[c.id] } : c), [edits]);
  const ALL = useMemo(
    () => (LIVE ? live.rows.map((r) => details[r.id]?.contact ?? cands.contactFromRow(r, undefined, addedByOf(r))) : [...added, ...CONTACTS])
      .filter((c) => !deleted.has(c.id)).map(withEdits),
    [added, withEdits, deleted, live.rows, details],
  );
  /* Everyone seen on any page, so compare and the profile still know people
     after paging away from them. */
  const seen = useRef(new Map<string, Contact>());
  for (const c of ALL) seen.current.set(c.id, c);
  for (const d of Object.values(details)) if (!deleted.has(d.contact.id)) seen.current.set(d.contact.id, withEdits(d.contact));
  const know = (id: string) => (deleted.has(id) ? undefined : ALL.find((c) => c.id === id) ?? seen.current.get(id));

  const loadDetail = useCallback((id: string) => {
    cands.getCandidate(id).then(
      (d) => setDetails((cur) => ({ ...cur, [id]: { detail: d, contact: cands.contactFromDetail(d), notes: d.notes } })),
      (err) => toast(messageOf(err), "error"),
    );
  }, [toast]);
  useEffect(() => { if (LIVE && openId) loadDetail(openId); }, [openId, loadDetail]);

  const removeContacts = (ids: readonly string[]) => {
    const next = new Set(deleted);
    for (const id of ids) next.add(id);
    deletedSoFar = next;
    setDeleted(next);
    setSelected((cur) => cur.filter((id) => !next.has(id)));
    if (openId && next.has(openId)) setOpenId(null);
    toast(ids.length === 1 ? "Candidate deleted" : `${ids.length} candidates deleted`);
    if (!LIVE) return;
    void Promise.allSettled(ids.map((id) => cands.deleteCandidate(id))).then((rs) => {
      const failed = rs.flatMap((r, i) => (r.status === "rejected" ? [{ id: ids[i], reason: r.reason as unknown }] : []));
      if (failed.length) {
        setDeleted((cur) => {
          const back = new Set(cur);
          for (const f of failed) if (f.id) back.delete(f.id);
          deletedSoFar = back;
          return back;
        });
        toast(messageOf(failed[0]?.reason), "error");
      }
      setReload((k) => k + 1);
    });
  };
  const toDelete = (confirmDelete ?? []).map(know).filter((c): c is Contact => !!c);

  const inCamp = useMemo(() => (LIVE ? ALL : ALL.filter((c) => camp === "all" || c.campaign === camp)), [ALL, camp]);
  const rows = useMemo(() => (LIVE ? ALL : sortContacts(inCamp.filter((c) => matches(c, filters, q)), sort)), [ALL, inCamp, filters, q, sort]);
  const total = LIVE ? live.total : rows.length;
  useEffect(() => { if (total !== null) setKnownTotal(total); }, [total]);
  lastTotal.current = total;
  const { offset, fix } = settledOffset(wanted, total, size);
  useEffect(() => { if (fix !== null) setWanted(fix); }, [fix]);
  const shown = LIVE ? rows : rows.slice(offset, offset + size);

  /* A different campaign, search, filter or sort is the top of a new list, with nothing ticked (not on arrival: that is
     where it was left). A new page size keeps the page that holds the first row on screen, and ticks survive paging. */
  const listKey = JSON.stringify([camp, q, filters, sort]);
  const lastList = useRef(listKey);
  useEffect(() => {
    if (lastList.current === listKey) return;
    lastList.current = listKey;
    setWanted(0);
    setSelected([]);
  }, [listKey]);
  /* A remembered campaign that is not in this workspace any more is not a filter to keep. */
  const campaignsReady = useCampaignsReady();
  useEffect(() => {
    if (camp === "all") return;
    if (LIVE ? campaignsReady && !campRows.some((r) => r.id === camp) : !CAMPAIGNS.some((c) => c.id === camp)) setCamp("all");
  }, [camp, campaignsReady, campRows]);
  useSectionSave(SECTION, { camp, q, filters, sort, size, offset }, true);

  /* ── LOADING SHIMMER ──
     The table shows skeleton rows while a view is being fetched: on arrival,
     and when the campaign, page, sort, page size or filters change. Search
     is left out on purpose; it narrows what is already loaded, and a shimmer
     on every keystroke would make typing feel slow. Fixture data returns at
     once, so the wait is a short stand-in for the real request's. */
  const [waiting, setLoading] = useState(true);
  const firstLoad = useRef(true);
  /* A search jumps back to page one, which changes the key; that is still a
     search, so it must not shimmer. */
  const lastQ = useRef(q);
  useEffect(() => {
    if (LIVE) return;
    if (lastQ.current !== q) { lastQ.current = q; setLoading(false); return; }
    setLoading(true);
    const id = window.setTimeout(() => setLoading(false), firstLoad.current ? 700 : 420);
    firstLoad.current = false;
    return () => window.clearTimeout(id);
  }, [viewKey]);
  /* With the API the rows on screen stay until new ones land; only a new
     view (not a search) shimmers. */
  const loading = LIVE ? live.loading && live.view !== viewKey : waiting;

  useScrollMemory(SECTION, !loading, !hasDeepLink());

  const toggleShortlist = useCallback((id: string, campaign: string) => {
    const had = lists[id] ?? [];
    const stage = stagesOfNow(id)[campaign];
    /* Rejected there: ticking puts them back on the shortlist. On the board at any other stage: unticking takes them off it. */
    const back = had.includes(campaign) && stage === "passed";
    const on = had.includes(campaign) && !back;
    toast(on ? `Removed from ${campName(campaign)}` : back ? `Back on the shortlist for ${campName(campaign)}` : `Shortlisted for ${campName(campaign)}`);
    say(id, campaign, on ? null : "shortlisted");
    setLists((cur) => {
      const was = cur[id] ?? [];
      return { ...cur, [id]: on ? was.filter((x) => x !== campaign) : was.includes(campaign) ? was : [...was, campaign] };
    });
    if (!LIVE) return;
    (on ? cands.removeFromCampaign(id, campaign) : back ? cands.reshortlist(id, campaign) : cands.addToCampaign(campaign, [id])).then(() => {
      // The campaign's board, its counts and Home's read the change; this list reads again too.
      invalidate(["pipeline", "candidates"], { campaignId: campaign });
    }).catch((err: unknown) => {
      setLists((cur) => ({ ...cur, [id]: had }));
      say(id, campaign, on ? stage ?? "shortlisted" : back ? "passed" : null);
      toast(messageOf(err), "error");
    });
  }, [lists, toast, say]);

  const onAdded = (r: AddResult) => {
    setAdding(false);
    if (r.added.length) {
      addedSoFar = [...r.added, ...addedSoFar];
      setAdded(addedSoFar);
    }
    const patched = r.merged.filter((m) => Object.keys(m.patch).length);
    if (patched.length) {
      setEdits((cur) => {
        const next = { ...cur };
        for (const m of patched) next[m.id] = { ...next[m.id], ...m.patch };
        return next;
      });
    }
    const ids = [...r.added.map((c) => c.id), ...r.merged.map((m) => m.id), ...(r.touched ?? [])];
    if (r.campaign && !LIVE) {
      const camp = r.campaign;
      setLists((cur) => {
        const next = { ...cur };
        for (const id of ids) next[id] = (next[id] ?? []).includes(camp) ? next[id]! : [...(next[id] ?? []), camp];
        return next;
      });
    }
    const lit = new Set([...r.added.map((c) => c.id), ...patched.map((m) => m.id), ...(r.touched ?? [])]);
    if (lit.size) {
      /* Show them: everyone, newest first, from the top, search cleared. */
      setCamp("all"); setQ(""); setSort("recent"); setWanted(0);
      setFresh(lit);
      window.setTimeout(() => setFresh((cur) => (cur === lit ? new Set() : cur)), 6500);
    }
    if (LIVE) setReload((k) => k + 1);
    const onCamp = r.campaign && ids.length
      ? `. ${ids.length === 1 ? "Shortlisted" : ids.length === 2 ? "Both shortlisted" : `All ${ids.length} shortlisted`} for ${campName(r.campaign)}`
      : "";
    toast(`${r.message}${onCamp}`);
  };

  /* Ticking is for bulk actions and has no limit; compare is one of them, for two or three. */
  const toggleSelect = (id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ALL) m.set(c.campaign, (m.get(c.campaign) ?? 0) + 1);
    return m;
  }, [ALL]);

  // Back closes an open profile rather than leaving Candidates.
  useBackCloses(openId !== null, () => setOpenId(null));
  const openIdx = openId ? shown.findIndex((c) => c.id === openId) : -1;
  const openContact = openId ? know(openId) ?? null : null;
  const step = (d: number) => {
    const i = openIdx + d;
    if (i >= 0 && i < shown.length) setOpenId(shown[i]!.id);
  };

  const people = selected.map(know).filter((c): c is Contact => !!c);
  /* Compare reads careers and skills, which only the full profile has. */
  useEffect(() => {
    if (LIVE && comparing) for (const id of selected) if (!details[id]) loadDetail(id);
  }, [comparing, selected, details, loadDetail]);
  const nFilters = activeFilterCount(filters);
  /* The pager is drawn twice, in the toolbar and under the list. */
  const pagerProps = {
    offset, limit: size, unit: "candidates", onChange: setWanted, total, sizes: picker,
  };
  const liveOf = (id: string) => controlState(lists[id] ?? [], stagesOfNow(id)).live;
  const shortlistAll = (campaign: string) => {
    const all = selected.every((id) => liveOf(id).includes(campaign));
    const before = lists;
    const ids = selected;
    const rejected = all ? [] : ids.filter((id) => stagesOfNow(id)[campaign] === "passed" && (lists[id] ?? []).includes(campaign));
    const wasAt = Object.fromEntries(ids.map((id) => [id, stagesOfNow(id)[campaign] ?? null]));
    for (const id of ids) say(id, campaign, all ? null : "shortlisted");
    setLists((cur) => {
      const next = { ...cur };
      for (const id of ids) {
        const had = next[id] ?? [];
        next[id] = all ? had.filter((x) => x !== campaign) : had.includes(campaign) ? had : [...had, campaign];
      }
      return next;
    });
    const n = ids.length;
    toast(all ? `Removed ${n} from ${campName(campaign)}` : `Shortlisted ${n === 1 ? "1 person" : `all ${n}`} for ${campName(campaign)}`);
    if (!LIVE) return;
    const sent = all
      ? Promise.all(ids.map((id) => cands.removeFromCampaign(id, campaign)))
      : Promise.all([
          ...rejected.map((id) => cands.reshortlist(id, campaign)),
          ids.some((id) => !rejected.includes(id)) ? cands.addToCampaign(campaign, ids.filter((id) => !rejected.includes(id))) : null,
        ]);
    void sent.then(() => { invalidate(["pipeline", "candidates"], { campaignId: campaign }); }, () => {});
    sent.catch((err: unknown) => {
      // Only the people who weren't added go back; the rest are on the campaign.
      const undo = err instanceof cands.NotAddedError ? err.failedIds : ids;
      setLists((cur) => ({ ...cur, ...Object.fromEntries(undo.map((id) => [id, before[id] ?? []])) }));
      for (const id of undo) say(id, campaign, wasAt[id] ?? null);
      toast(messageOf(err), "error");
    });
  };
  const onCompare = () => {
    if (selected.length < 2) { toast("Tick 2 or 3 people to compare"); return; }
    if (selected.length > MAX_COMPARE) { toast(`Compare takes up to ${MAX_COMPARE}. Untick some first.`); return; }
    setComparing(true);
  };

  const saveEdit = (c: Contact, patch: ContactEdit) => {
    const prev = edits[c.id];
    setEdits((cur) => ({ ...cur, [c.id]: { ...cur[c.id], ...patch } }));
    if (!LIVE) { toast("Details saved"); return; }
    const body = cands.patchFromEdit(c, patch);
    const link = !c.linkedin && patch.linkedin ? patch.linkedin : "";
    Promise.all([
      Object.keys(body).length ? cands.updateCandidate(c.id, body) : null,
      link ? cands.addDetails(c.id, { linkedinUrl: link }) : null,
    ]).then(
      () => { toast("Details saved"); loadDetail(c.id); },
      (err: unknown) => {
        setEdits((cur) => {
          const next = { ...cur };
          if (prev) next[c.id] = prev; else delete next[c.id];
          return next;
        });
        toast(messageOf(err), "error");
      },
    );
  };

  const addNote = async (id: string, body: string): Promise<boolean> => {
    try {
      const n = await cands.addNote(id, body);
      setDetails((cur) => {
        const d = cur[id];
        return d ? { ...cur, [id]: { ...d, notes: [{ id: n.id, body: n.body, authorName: n.authorName, createdAt: n.createdAt }, ...d.notes] } } : cur;
      });
      return true;
    } catch (err) {
      toast(messageOf(err), "error");
      return false;
    }
  };

  return (
    <div className="ct">
      <header className="ct-head">
        <div className="ct-head-t">
          <h1 className="ct-h1">Candidates</h1>

        </div>
        <div className="ct-head-act">
          <a className="ct-btn ct-ext" href={CHROME_STORE_URL} target="_blank" rel="noreferrer noopener">
            <PuzzlePiece size={15} weight="bold" /> Get the extension
          </a>
          {canAdd && (
            <button type="button" className="ct-btn is-primary ct-add" onClick={() => { setAddKey((k) => k + 1); setAdding(true); }}>
              <UserPlus size={15} weight="bold" /> Add candidates
            </button>
          )}
        </div>
      </header>

      {/* Whenever anyone is ticked, wherever the page is scrolled: shortlist
          them all for one campaign, or compare them. */}
      <div className={`ct-dock${selected.length ? " is-on" : ""}`} aria-hidden={!selected.length}>
        <CompareTray people={people} onCompare={onCompare} onRemove={(id) => setSelected((cur) => cur.filter((x) => x !== id))} tabIndex={selected.length ? undefined : -1} />
        <span className="ct-dock-sep" aria-hidden="true" />
        <ShortlistMenuButton
          label={selected.length > 1 ? `Shortlist all ${selected.length}` : "Shortlist"}
          isOn={(campaign) => selected.length > 0 && selected.every((id) => liveOf(id).includes(campaign))}
          onPick={shortlistAll}
          suggest={people[0]?.campaign}
          tabIndex={selected.length ? undefined : -1}
        />
        {canDelete && (
          <button type="button" className="ct-btn ct-dock-del" onClick={() => setConfirmDelete(selected)} tabIndex={selected.length ? undefined : -1}>
            <Trash size={14} />
            {selected.length > 1 ? `Delete ${selected.length}` : "Delete"}
          </button>
        )}
        <button type="button" className="ct-dock-x" onClick={() => setSelected([])} aria-label="Clear selection" title="Clear selection" tabIndex={selected.length ? undefined : -1}>
          <X size={12} weight="bold" />
        </button>
      </div>

      <div className="ct-bar">
        <CampaignPicker value={camp} onChange={setCamp} counts={LIVE ? null : counts} />
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
        <FiltersButton filters={filters} onChange={setFilters} pool={inCamp} count={nFilters} seeAdded={seeAdded} />
        <SortButton sort={sort} onChange={setSort} />
        {shown.length > 0 && <Pager {...pagerProps} />}
      </div>

      {nFilters > 0 && <ActiveChips filters={filters} onChange={setFilters} />}

      {/* With one campaign chosen: the people saved from LinkedIn who fit it and are on its shortlist nowhere (the extension and the campaign agree).
          Keyed by the campaign, so a new choice starts a banner of its own; flush, as this page's grid already puts a gap around it. */}
      {camp !== "all" && <CapturesNudge key={camp} campaignId={camp} name={campName(camp)} flush />}

      <div className="ct-table-wrap" data-pager-list>
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ct-c-check" aria-label="Select" />
              <th className="ct-c-name">Name</th>
              <th className="ct-c-co">Current company</th>
              <th className="ct-c-sum">Summary</th>
              <th className="ct-c-contact">Contact info</th>
              <th className="ct-c-act"><span className="ct-sr">Shortlist</span></th>
            </tr>
          </thead>
          {loading ? (
            <tbody className="ct-shm">
              {Array.from({ length: Math.min(size, 8) }, (_, i) => (
                <tr key={i} className="ct-row" {...(i === 0 ? { role: "status", "aria-busy": true } : { "aria-hidden": true })}>
                  <td className="ct-c-check">{i === 0 && <span className="sr-only">Loading candidates</span>}<Shimmer w={16} h={16} r={5} /></td>
                  <td>
                    <div className="ct-who">
                      <Shimmer circle w={34} h={34} />
                      <div className="ct-who-text"><Shimmer h={13} w={`${58 + ((i * 13) % 30)}%`} /><Shimmer h={11} w={`${40 + ((i * 7) % 26)}%`} /></div>
                    </div>
                  </td>
                  <td className="ct-c-co"><span className="ct-co"><Shimmer w={28} h={28} r={7} /><span className="ct-co-text"><Shimmer h={13} w={`${50 + ((i * 11) % 34)}%`} /><Shimmer h={11} w="34%" /></span></span></td>
                  <td className="ct-c-sum"><div className="ct-who-text"><Shimmer h={12} /><Shimmer h={12} w="64%" /></div></td>
                  <td className="ct-c-contact"><div className="ct-contact"><span className="ct-contact-l"><Shimmer circle w={12} h={12} /><Shimmer h={12} w="78%" /></span><span className="ct-contact-l"><Shimmer circle w={12} h={12} /><Shimmer h={12} w="52%" /></span></div></td>
                  <td className="ct-c-act"><Shimmer h={32} w={150} r={10} /></td>
                </tr>
              ))}
            </tbody>
          ) : (
          <tbody key={`${camp}-${offset}-${sort}-${size}-${nFilters}`}>
            {shown.map((c) => (
              <Row
                key={c.id}
                showAdded={seeAdded}
                c={c}
                fresh={fresh.has(c.id)}
                checked={selected.includes(c.id)}
                onCheck={() => toggleSelect(c.id)}
                onOpen={() => setOpenId(c.id)}
                shortlisted={lists[c.id] ?? []}
                onShortlist={(campaign) => toggleShortlist(c.id, campaign)}
                onCopy={toast}
                onDelete={canDelete ? () => setConfirmDelete([c.id]) : undefined}
              />
            ))}
          </tbody>
          )}
        </table>
        {!loading && !shown.length && LIVE && live.failed && (
          <LoadFailed what="Candidates" onRetry={() => setReload((k) => k + 1)} />
        )}
        {!loading && !shown.length && !(LIVE && live.failed) && (() => {
          const empty = emptyList({ narrowed: !!q || nFilters > 0, campaign: camp === "all" ? null : campName(camp), live: LIVE });
          return (
            <div className="ct-empty">
              <EmptyArt {...listEmptyArt("candidates", empty.noMatch)} />
              <p className="ct-empty-h">{empty.head}</p>
              <p>{empty.text}</p>
              {(nFilters > 0 || q) && (
                <button type="button" className="ct-btn" onClick={() => { setFilters(EMPTY_FILTERS); setQ(""); }}>Clear search and filters</button>
              )}
            </div>
          );
        })()}
      </div>
      {shown.length > 0 && <Pager {...pagerProps} variant="foot" />}

      <ProfileDialog
        c={openContact}
        onContactSaved={() => { if (openId) loadDetail(openId); }}
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
        onSave={(patch) => { if (openContact) saveEdit(openContact, patch); }}
        onDelete={canDelete && openContact ? () => setConfirmDelete([openContact.id]) : undefined}
        notes={LIVE && openContact ? details[openContact.id]?.notes ?? null : undefined}
        onNote={(body) => (openContact ? addNote(openContact.id, body) : Promise.resolve(false))}
      />

      <ConfirmDialog
        open={toDelete.length > 0}
        title={toDelete.length === 1 ? `Delete ${toDelete[0]!.name}?` : `Delete ${toDelete.length} candidates?`}
        body={<>
          {toDelete.length === 1
            ? "They come off every campaign they are on, so a hire stops counting as one."
            : <>{toDelete.map((c) => c.name).join(", ")} are deleted. They come off every campaign they are on, so hires stop counting.</>}
          {" "}Their messages, notes, form answers and calls are deleted too, and this can&rsquo;t be undone.
        </>}
        confirm={toDelete.length === 1 ? "Delete" : `Delete ${toDelete.length}`}
        danger
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { removeContacts(toDelete.map((c) => c.id)); setConfirmDelete(null); }}
      />

      <CompareDialog
        open={comparing}
        people={people}
        onClose={() => setComparing(false)}
        onClear={() => { setComparing(false); setSelected([]); toast("Compare cleared"); }}
        onAdd={(c) => { seen.current.set(c.id, c); setSelected((cur) => (cur.includes(c.id) || cur.length >= MAX_COMPARE ? cur : [...cur, c.id])); }}
        onRemove={(id) => setSelected((cur) => cur.filter((x) => x !== id))}
        lists={lists}
        onShortlist={toggleShortlist}
        onCopy={toast}
        onOpen={(id) => { setComparing(false); setOpenId(id); }}
      />
      {canAdd && (
        <AddCandidatesDialog
          key={addKey}
          open={adding}
          onClose={() => setAdding(false)}
          existing={ALL}
          onDone={onAdded}
          onOpenPerson={(id) => setOpenId(id)}
        />
      )}
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
   Up to three faces in the selection dock; the button wakes up once two are
   in. A bigger selection is for bulk actions, so it shows as a count. */
function CompareTray({ people, onCompare, onRemove, tabIndex }: { people: readonly Contact[]; onCompare: () => void; onRemove: (id: string) => void; tabIndex?: number }) {
  const many = people.length > MAX_COMPARE;
  const ready = people.length >= 2 && !many;
  return (
    <div className={`ct-tray${ready ? " is-ready" : ""}${people.length ? " has-some" : ""}`}>
      {many ? (
        <span className="ct-tray-many t-body-sm">{people.length} selected. Compare takes up to {MAX_COMPARE}.</span>
      ) : (
        <div className="ct-tray-slots">
          {Array.from({ length: MAX_COMPARE }, (_, i) => {
            const p = people[i];
            return p ? (
              <button key={p.id} type="button" className="ct-slot is-full" onClick={() => onRemove(p.id)} title={`Remove ${p.name}`} aria-label={`Unselect ${p.name}`} tabIndex={tabIndex}>
                <Avatar name={p.name} hue={p.hue} size={28} />
                <span className="ct-slot-x" aria-hidden="true"><X size={9} weight="bold" /></span>
              </button>
            ) : (
              <span key={`e${i}`} className="ct-slot" aria-hidden="true" />
            );
          })}
        </div>
      )}
      <button type="button" className="ct-tray-go" onClick={onCompare} aria-disabled={!ready} tabIndex={tabIndex}
        title={many ? `Compare takes up to ${MAX_COMPARE}` : ready ? `Compare ${people.length}` : "Tick two or three people to compare"}>
        <ArrowsLeftRight size={14} weight="bold" />
        Compare
      </button>
    </div>
  );
}

/* ── campaign picker ──
   A searchable dropdown: seven campaigns today, many more later. Counts
   come from the fixtures; the API's list doesn't count per campaign. */
function CampaignPicker({ value, onChange, counts }: { value: string; onChange: (id: string) => void; counts: Map<string, number> | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); setQ(""); }, []);
  const all = [{ id: "all", name: "All campaigns", role: "Everyone saved" }, ...campaignsNow.filter((c) => !counts || counts.get(c.id))];
  const list = all.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0;
  const countOf = (id: string) => (!counts ? null : id === "all" ? total : counts.get(id) ?? 0);
  const current = all.find((c) => c.id === value) ?? all[0]!;
  useEffect(() => { setCursor(0); }, [q]);
  const pick = (id: string) => { onChange(id); close(); ref.current?.focus(); };

  return (
    <>
      <button ref={ref} type="button" className={`ct-camp${value !== "all" ? " is-set" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ct-camp-l">Campaign</span>
        <span className="ct-camp-v">{current.name}</span>
        {counts && <span className="ct-camp-n">{countOf(current.id)}</span>}
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
                {counts && <span className="ct-cp-n">{countOf(c.id)}</span>}
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

/* ── row ── */

function Row({
  showAdded = true,
  c, fresh = false, checked, onCheck, onOpen, shortlisted, onShortlist, onCopy, onDelete,
}: {
  /** Who added them and when, under the name: for the organisation's owner and admins. */
  showAdded?: boolean;
  c: Contact;
  /** Just added; lit once so it is easy to find. */
  fresh?: boolean;
  checked: boolean;
  onCheck: () => void;
  onOpen: () => void;
  shortlisted: readonly string[];
  onShortlist: (campaign: string) => void;
  onCopy: (msg: string) => void;
  /** Admin only; absent for a recruiter, so the control is not rendered. */
  onDelete?: () => void;
}) {
  const tenure = tenureOf(c);
  return (
    <tr
      className={`ct-row${checked ? " is-checked" : ""}${fresh ? " is-fresh" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, a, label, select")) return;
        onOpen();
      }}
    >
      <td className="ct-c-check">
        <label className="ct-check">
          <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${c.name}`} />
          <span aria-hidden="true"><Check size={11} weight="bold" /></span>
        </label>
      </td>
      <td>
        <div className="ct-who">
          <Avatar name={c.name} hue={c.hue} size={34} />
          <div className="ct-who-text">
            <button type="button" className="ct-name" onClick={onOpen} title={c.name}>{c.name}</button>
            <span className="ct-title">
              {c.title || (!c.company && !c.location ? <span className="ct-none">No title yet</span> : null)}
              {(c.company || c.location) && <span className="ct-title-co">{c.title ? " · " : ""}{[c.company, c.location].filter(Boolean).join(" · ")}</span>}
            </span>
            {/* Who added them and when: there to be found, not to be read. */}
            {showAdded && <span className="ct-added" title={new Date(Date.now() - c.capturedAgo * 864e5).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}>{addedLine(c)}</span>}
          </div>
        </div>
      </td>
      <td className="ct-c-co">
        <span className="ct-co">
          <span className="ct-co-mark" aria-hidden="true">{firstGlyph(c.company)}</span>
          <span className="ct-co-text">
            <span className="ct-main">{c.company || <span className="ct-none">Company not known yet</span>}{c.location && <span className="ct-co-loc">{c.company ? " · " : ""}{c.location}</span>}</span>
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
        {/* What is there, one line each; one calm "Not found" for someone nothing was found for. */}
        <div className="ct-contact">
          {c.email?.value && <span className="ct-contact-l"><EnvelopeSimple size={13} aria-hidden="true" /><CopyCell kind="email" value={c.email.value} verified={c.email.verified} onCopy={onCopy} /></span>}
          {c.phone?.value && <span className="ct-contact-l"><Phone size={13} aria-hidden="true" /><CopyCell kind="phone" value={c.phone.value} onCopy={onCopy} /></span>}
          {!c.email?.value && !c.phone?.value && <span className="ct-none">Not found</span>}
        </div>
      </td>
      <td className="ct-c-act">
        <span className="ct-act-in">
          <ShortlistControl suggest={c.campaign} on={shortlisted} onPick={onShortlist} stages={stagesOfNow(c.id)} />
          {onDelete && (
            <button type="button" className="ct-del" onClick={onDelete} aria-label={`Delete ${c.name}`} title="Delete">
              <Trash size={15} />
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

export function CopyCell({ kind, value, verified, onCopy, missing = "Not found yet" }: { kind: "email" | "phone"; value?: string; verified?: boolean; onCopy: (m: string) => void; missing?: string }) {
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
   says for how many. It names no stage: it only puts someone on a campaign's
   shortlist or takes them off. */

function ShortlistControl({ suggest: savedFor, on, onPick, stages = NO_STAGES }: {
  suggest: string;
  on: readonly string[];
  onPick: (campaign: string) => void;
  /** Campaign id to stage, for the campaigns in `on`; one not named here is at the first stage. */
  stages?: Readonly<Record<string, string>>;
}) {
  const { label, live, count, active } = controlState(on, stages);
  /* A campaign that has since closed is nothing to suggest. */
  const suggest = pickableNow.some((c) => c.id === savedFor) ? savedFor : "";
  /* With more than one campaign to choose from, a press asks which: the page is the whole organisation's people, and
     the campaign they were first found for is only one of the places they could go. */
  const manyCampaigns = pickableNow.length > 1;
  /* Someone added without a campaign has nothing to suggest: the main
     button opens the campaign menu instead. */
  const [menu, setMenu] = useState(false);
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
        /* On a shortlist already, a press opens the menu, so a click never takes someone off a campaign
           they are working on. On none, with one campaign to choose from it shortlists for that one; with several it asks. */
        onClick={() => (active || manyCampaigns || !suggest ? setMenu(true) : onPick(suggest))}
        title={active ? `Shortlisted for ${live.map(campName).join(", ")}` : manyCampaigns || !suggest ? "Shortlist for a campaign" : `Shortlist for ${campName(suggest)}`}
      >
        <BookmarkSimple size={14} weight={active ? "fill" : "regular"} />
        <span className="ct-sl-label">{label}</span>
        {count > 0 && <span className="ct-sl-n" key={count}>{count}</span>}
      </button>
      <ShortlistMenuButton isOn={(c) => live.includes(c)} onIds={on} rejected={(c) => stages[c] === "passed"} onPick={onPick} suggest={suggest || undefined} caret open={menu} onOpenChange={setMenu} />
    </div>
  );
}

function ShortlistMenuButton({
  label, isOn, onIds = [], rejected, onPick, suggest, caret, tabIndex, open: openProp, onOpenChange,
}: {
  /** The campaigns this person is already on: listed even when the viewer may not change them. */
  onIds?: readonly string[];
  /** Rejected on this campaign: said so, and never offered as the one it was saved for. */
  rejected?: (campaign: string) => boolean;
  /** Controlled open state, for a parent that opens the menu itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  isOn: (campaign: string) => boolean;
  onPick: (campaign: string) => void;
  suggest?: string;
  caret?: boolean;
  tabIndex?: number;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    setOpenState(next);
    onOpenChange?.(next);
  };
  const ref = useRef<HTMLButtonElement>(null);
  /* A to Z by name, always: the menu does not reorder when someone is shortlisted or the page re-reads. */
  const order = [...pickableNow, ...campaignsNow.filter((c) => onIds.includes(c.id) && !pickableNow.some((p) => p.id === c.id))].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
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
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={280}>
        <div className="ct-menu" role="menu">
          <p className="ct-menu-h">Shortlist for campaign</p>
          {order.map((c) => {
            const on = isOn(c.id);
            return (
              <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={on} className={`ct-menu-i${on ? " is-on" : ""}`}
                onClick={() => { onPick(c.id); setOpen(false); }}>
                <span className="ct-menu-box">{on && <Check size={11} weight="bold" />}</span>
                <span className="ct-menu-t is-name" title={c.name}>{c.name}</span>
                {rejected?.(c.id) ? <span className="ct-menu-tag is-quiet">Rejected</span> : c.id === suggest && <span className="ct-menu-tag">Their campaign</span>}
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
  anchor, open, onClose, align = "start", width, side = "below", children,
}: {
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  align?: "start" | "end";
  width: number;
  /** "left" opens beside the anchor, toward the page (for edge toolbars). */
  side?: "below" | "left";
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) { setPos(null); return; }
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const h = panel.current?.offsetHeight ?? 300;
      if (side === "left") {
        const top = Math.min(Math.max(12, r.top), window.innerHeight - h - 12);
        setPos({ top, left: Math.max(12, r.left - width - 8), up: false });
        return;
      }
      const below = window.innerHeight - 8 - (r.bottom + 6);
      const above = r.top - 6 - 8;
      /* Flip up when it doesn't fit below and there is more room above; if it
         fits neither way, keep it on screen (a long menu scrolls inside). */
      const up = h > below && above > below;
      const top = up ? Math.max(8, r.top - 6 - h) : Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8));
      const left = Math.min(Math.max(8, align === "end" ? r.right - width : r.left), window.innerWidth - width - 8);
      setPos({ top, left, up });
    };
    place();
    const id = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    /* Close when the PAGE scrolls (the anchor moves away), but not when the
       popover's own list scrolls: a capture listener sees both, and closing
       on every scroll made a long list impossible to scroll. A scroll only
       counts once the anchor has really moved (Firefox's scroll anchoring
       nudges the page by a pixel as the menu mounts and takes focus), and
       never in the first moments after opening. */
    const openedAt = performance.now();
    const openTop = anchor.current.getBoundingClientRect().top;
    const onScroll = (e: Event) => {
      if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return;
      if (performance.now() - openedAt < 150) { place(); return; }
      const now = anchor.current?.getBoundingClientRect().top ?? openTop;
      if (Math.abs(now - openTop) > 4) onClose();
      else place();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", place); window.removeEventListener("scroll", onScroll, true); };
  }, [open, anchor, align, width, onClose, side]);

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

function FiltersButton({ filters, onChange, pool, count, seeAdded }: { filters: Filters; onChange: (f: Filters) => void; pool: readonly Contact[]; count: number; seeAdded: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const team = useTeam();
  /* The options come from the people on screen; a filter narrows them, and the options the rest would have offered must
     not vanish with them (apply "Has phone" and Location went empty, so it could not be changed). What has been seen in this
     list stays offered until the list is left. */
  const seenOptions = useRef<{ location: Set<string>; skills: Set<string> }>({ location: new Set(), skills: new Set() });
  const locations = useMemo(() => {
    for (const l of optionsFor(pool, "location", 10)) seenOptions.current.location.add(l);
    return [...seenOptions.current.location].slice(0, 12);
  }, [pool]);
  const skills = useMemo(() => {
    for (const k of optionsFor(pool, "skills", 14)) seenOptions.current.skills.add(k);
    return [...seenOptions.current.skills].slice(0, 16);
  }, [pool]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const flip = <T,>(xs: readonly T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  return (
    <>
      <button ref={ref} type="button" className={`ct-btn${count ? " is-active" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FunnelSimple size={14} weight="bold" /> Filters{count > 0 && <span className="ct-count">{count}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={460}>
        <div className="ct-filters">
          {/* With the API, only what it can filter on: one location, skills, and whether a contact is on file. */}
          {!LIVE && (
            <>
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
            </>
          )}
          {(locations.length > 0 || filters.location.length > 0) && (
            <Group label="Location">
              {[...new Set([...filters.location, ...locations])].map((l) => (
                <Chip key={l} on={filters.location.includes(l)}
                  onClick={() => set("location", LIVE ? (filters.location.includes(l) ? [] : [l]) : flip(filters.location, l))}>{l}</Chip>
              ))}
            </Group>
          )}
          {skills.length > 0 && (
            <Group label="Skills" hint="has all selected">
              {skills.map((s) => (
                <Chip key={s} on={filters.skills.includes(s)} onClick={() => set("skills", flip(filters.skills, s))}>{s}</Chip>
              ))}
            </Group>
          )}
          <Group label="Contact details">
            {(LIVE ? [["email", "Has email"], ["phone", "Has phone"]] as const : [["email", "Has email"], ["verified", "Verified email"], ["phone", "Has phone"]] as const).map(([id, l]) => (
              <Chip key={id} on={filters.contact.includes(id)} onClick={() => set("contact", flip<ContactNeed>(filters.contact, id))}>{l}</Chip>
            ))}
            {!LIVE && <Chip on={filters.openToWork} onClick={() => set("openToWork", !filters.openToWork)}>Open to work</Chip>}
          </Group>
          {LIVE && seeAdded && team.length > 1 && (
            <Group label="Added by">
              {team.map((m) => (
                <Chip key={m} on={filters.capturedBy.includes(m)} onClick={() => set("capturedBy", filters.capturedBy.includes(m) ? [] : [m])}>{m}</Chip>
              ))}
            </Group>
          )}
          {!LIVE && (
            <>
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
            </>
          )}
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
  for (const m of filters.capturedBy) chips.push({ key: `m-${m}`, label: `Added by ${m}`, clear: drop("capturedBy", filters.capturedBy.filter((x) => x !== m)) });
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
  const opts: readonly [SortKey, string][] = LIVE
    ? [["recent", "Recently added"], ["name", "Name"]]
    : [["recent", "Recently saved"], ["name", "Name"], ["experience", "Most experience"]];
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

type ContactEdit = Partial<Omit<Contact, "id">>;

/* Where a person came from and who brought them in, in one sentence. */
function sourceLine(p: Contact): string {
  const when = capturedLabel(p.capturedAgo).toLowerCase();
  const camp = p.campaign ? ` for ${campName(p.campaign)}` : "";
  const how = p.origin === "Upload" ? "Imported in bulk" : p.origin === "Manual" ? "Added by hand"
    : p.origin === "Form" ? "Applied through a form" : p.origin === "Agent" ? "Found by the agent" : "Saved";
  const via = p.channel ? ` (${p.channel.toLowerCase()})` : "";
  const by = p.capturedBy ? ` by ${p.capturedBy}` : "";
  const owner = p.owner && p.owner !== p.capturedBy ? ` ${p.owner} owns this candidate.` : "";
  const pending = p.profile === "full" || LIVE ? "" : p.origin && p.linkedin
    ? " The full profile will be fetched once enrichment is connected."
    : p.origin ? "" : " The full profile is still loading.";
  return `${how}${via}${camp}${by}, ${when}.${owner}${pending}`;
}

function ProfileDialog({
  c, onClose, position, onStep, shortlisted, onShortlist, selected, onSelect, onCopy, people, onCompare, onSave, onDelete, notes, onNote, onContactSaved,
}: {
  /** An email or phone typed in the sheet was saved: the person is read again. */
  onContactSaved: () => void;
  onSave: (patch: ContactEdit) => void;
  /** The team's notes, with the API: null while they load, absent on fixtures. */
  notes?: readonly Note[] | null;
  onNote: (body: string) => Promise<boolean>;
  /** Admin only; absent for a recruiter. */
  onDelete?: () => void;
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
  const [editing, setEditing] = useState<false | string>(false);
  useEffect(() => { setEditing(false); }, [c?.id]);
  /* Email and phone are typed in their own lines when there is an API, so the banner only names what has no field of its own. */
  const missing = p ? [!p.email && !p.onFile?.email && "email", !p.phone && !p.onFile?.phone && "phone", !p.linkedin && "LinkedIn", !p.location && "location"].filter(Boolean) as string[] : [];
  const gaps = LIVE ? missing.filter((m) => m !== "email" && m !== "phone") : missing;

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
              {(p.title || p.company) && <p className="cp-title">{p.title && p.company ? `${p.title} at ${p.company}` : p.title || p.company}</p>}
              <p className="cp-meta">
                {p.location && <span><MapPin size={13} /> {p.location}</span>}
                {experienceLabel(p) && <span><Briefcase size={13} /> {experienceLabel(p)}</span>}
                {p.linkedin && <a href={`https://${p.linkedin}`} target="_blank" rel="noreferrer"><LinkedinLogo size={13} weight="fill" /> LinkedIn</a>}
              </p>
            </div>
            {!editing && (
              <span className="cp-head-act">
                <button type="button" className="cp-edit" onClick={() => setEditing("name")}>
                  <PencilSimple size={13} weight="bold" /> Edit
                </button>
                {onDelete && (
                  <button type="button" className="cp-edit cp-del" onClick={onDelete} aria-label={`Delete ${p.name}`} title="Delete">
                    <Trash size={14} />
                  </button>
                )}
              </span>
            )}
          </header>

          {editing ? (
            <EditForm key={p.id} p={p} focus={editing} onCancel={() => setEditing(false)} onSave={(patch) => { onSave(patch); setEditing(false); }} />
          ) : (
          <div className="cp-body">
            {gaps.length > 0 && (
              <button type="button" className="cp-missing" onClick={() => setEditing(gaps[0] === "LinkedIn" ? "linkedin" : gaps[0]!)}>
                <span><b>Missing {gaps.join(", ")}.</b> Know it? Add it here so outreach can go out.</span>
                <span className="cp-missing-go">Fill in <CaretRight size={11} weight="bold" /></span>
              </button>
            )}
            <section className="cp-contact">
              <ContactLine icon={<EnvelopeSimple size={15} />} label="Email" value={p.email?.value}
                note={p.email ? (p.email.verified ? <><SealCheck size={12} weight="fill" className="cp-ok" /> Verified</> : "Not verified yet") : LIVE ? (p.onFile?.email ? "Loading" : "Not on file") : "Still looking"}
                onCopy={onCopy} kind="email" onAdd={() => setEditing("email")} {...(LIVE ? { edit: { candidateId: p.id, onSaved: onContactSaved } } : {})} />
              <ContactLine icon={<Phone size={15} />} label="Phone" value={p.phone?.value}
                note={p.phone ? (LIVE ? "On file" : "Mobile") : LIVE ? (p.onFile?.phone ? "Loading" : "Not on file") : "Still looking"}
                onCopy={onCopy} kind="phone" onAdd={() => setEditing("phone")} {...(LIVE ? { edit: { candidateId: p.id, onSaved: onContactSaved } } : {})} />
            </section>

            <p className="cp-src">{sourceLine(p)}</p>

            <section className="cp-sl">
              <h3><BookmarkSimple size={14} weight={shortlisted.length ? "fill" : "regular"} /> {shortlisted.every((id) => (stagesOfNow(p.id)[id] ?? "shortlisted") === "shortlisted") ? "Shortlisted for" : "On these campaigns"}</h3>
              {shortlisted.length ? (
                <div className="cp-sl-list">
                  {shortlisted.map((id) => {
                    const camp = campaignsNow.find((x) => x.id === id);
                    const at = stagesOfNow(p.id)[id] ?? "shortlisted";
                    return (
                      <span key={id} className="cp-sl-chip">
                        <span className="cp-sl-name">{camp?.name ?? id}</span>
                        {at !== "shortlisted" ? <span {...statusProps(stageLabel(at))} className="cp-sl-role st">{stageLabel(at)}</span> : camp && <span className="cp-sl-role">{camp.role}</span>}
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
            {p.notes && <p className="cp-about">{p.notes}</p>}
            {notes !== undefined && <NotesSection key={p.id} notes={notes} onNote={onNote} />}

            {LIVE && <MatchSection candidateId={p.id} name={p.name} />}
            {p.jobs.length > 0 && <section className="cp-sec">
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
            </section>}

            {p.school && (
              <section className="cp-sec">
                <h3><GraduationCap size={14} /> Education</h3>
                <p className="cp-school"><strong>{p.school.name}</strong> · {p.school.degree} · {p.school.years}</p>
              </section>
            )}

            {p.skills.length > 0 && <section className="cp-sec">
              <h3>Skills</h3>
              <div className="cp-skills">{p.skills.map((s) => <span key={s} className="cp-skill">{s}</span>)}</div>
            </section>}
          </div>
          )}

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
                title={selected ? "Remove from compare" : "Add to compare"}>
                <span className="cp-cmp-box">{selected && <Check size={11} weight="bold" />}</span>
                {selected ? "In compare" : "Add to compare"}
              </button>
              <span className="cp-cmp-faces" aria-hidden="true">
                {people.slice(0, MAX_COMPARE).map((x) => <Avatar key={x.id} name={x.name} hue={x.hue} size={22} />)}
              </span>
              <button type="button" className="cp-cmp-go" onClick={onCompare} disabled={people.length < 2 || people.length > MAX_COMPARE}
                title={people.length < 2 ? "Add one more person to compare" : people.length > MAX_COMPARE ? `Compare takes up to ${MAX_COMPARE}` : `Compare ${people.length}`}>
                {people.length > MAX_COMPARE ? `${people.length} selected` : `Compare ${people.length}/${MAX_COMPARE}`}
              </button>
            </div>
            <ShortlistControl suggest={p.campaign} on={shortlisted} onPick={onShortlist} stages={stagesOfNow(p.id)} />
          </footer>
        </div>
      )}
    </Dialog>
  );
}

/* Edit the details a recruiter is most likely to know better than the
   enrichment did. Empty fields are flagged so gaps get filled, and the
   field that was clicked ("Add email") opens focused. */
function EditForm({ p, focus, onCancel, onSave }: { p: Contact; focus: string; onCancel: () => void; onSave: (patch: ContactEdit) => void }) {
  const [v, setV] = useState({
    name: p.name, title: p.title, company: p.company, location: p.location,
    email: p.email?.value ?? "", phone: p.phone?.value ?? "", linkedin: p.linkedin,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const emailOk = !v.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim());
  const fields: { k: keyof typeof v; label: string; type?: string; ph: string; wide?: boolean }[] = [
    { k: "name", label: "Full name", ph: "Full name" },
    { k: "title", label: "Title", ph: "e.g. Staff Engineer" },
    { k: "company", label: "Company", ph: "Current company" },
    { k: "location", label: "Location", ph: "City, country" },
    { k: "email", label: "Email", type: "email", ph: "name@company.com" },
    { k: "phone", label: "Phone", type: "tel", ph: "+91 98xxx xxxxx" },
    { k: "linkedin", label: "LinkedIn", ph: "linkedin.com/in/…", wide: true },
  ];
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOk || !v.name.trim()) return;
    const email = v.email.trim(), phone = v.phone.trim();
    onSave({
      name: v.name.trim(), title: v.title.trim(), company: v.company.trim(), location: v.location.trim(),
      linkedin: v.linkedin.trim().replace(/^https?:\/\//, ""),
      email: email ? (email === p.email?.value ? p.email : { value: email, source: "Manual" as const, verified: false }) : undefined,
      phone: phone ? (phone === p.phone?.value ? p.phone : { value: phone, source: "Manual" as const }) : undefined,
    });
  };
  return (
    <form className="cp-form" onSubmit={save}>
      <div className="cp-form-grid">
        {fields.map((f) => {
          const empty = !v[f.k].trim();
          return (
            <label key={f.k} className={`cp-field${f.wide ? " is-wide" : ""}${empty ? " is-empty" : ""}${f.k === "email" && !emailOk ? " is-bad" : ""}`}>
              <span>{f.label}{empty && <em>Missing</em>}</span>
              <input type={f.type ?? "text"} value={v[f.k]} onChange={set(f.k)} placeholder={f.ph} autoFocus={f.k === focus}
                readOnly={LIVE && f.k === "linkedin" && !!p.linkedin} title={LIVE && f.k === "linkedin" && p.linkedin ? "The LinkedIn link identifies them, so it stays as it is" : undefined} />
              {f.k === "email" && !emailOk && <small>That doesn't look like an email yet.</small>}
            </label>
          );
        })}
      </div>
      <p className="cp-form-note">Edits are yours: enrichment won't overwrite them. A new email shows as unverified until it checks out.</p>
      <div className="cp-form-act">
        <button type="button" className="ct-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="ct-btn is-primary" disabled={!emailOk || !v.name.trim()}>Save details</button>
      </div>
    </form>
  );
}

/* The team's notes on someone, newest first, and a box to add one. */
function NotesSection({ notes, onNote }: { notes: readonly Note[] | null; onNote: (body: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await onNote(text.trim())) setText("");
    setBusy(false);
  };
  return (
    <section className="cp-sec">
      <h3><NotePencil size={14} /> Notes</h3>
      {notes === null ? <ShimmerRegion label="Loading notes"><ShimmerText lines={2} /></ShimmerRegion> : notes.length > 0 && (
        <ul className="cp-notes">
          {notes.map((n) => (
            <li key={n.id}>
              <p className="cp-about">{n.body}</p>
              <p className="cp-src">{[n.authorName, new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })].filter(Boolean).join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="cp-note-add" onSubmit={(e) => void save(e)}>
        <textarea className="cp-note-in" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the team" aria-label="New note" maxLength={5000} />
        <button type="submit" className="ct-btn" disabled={!text.trim() || busy} aria-busy={busy || undefined}>{busy ? <><Loader size="sm" />Saving</> : "Add note"}</button>
      </form>
    </section>
  );
}

function ContactLine({ icon, label, value, note, onCopy, kind, onAdd, edit }: {
  icon: ReactNode; label: string; value?: string; note: ReactNode; onCopy: (m: string) => void; kind: "email" | "phone"; onAdd?: () => void;
  /** With the API: typed in place, the same way the board's sheet does it. */
  edit?: { candidateId: string; onSaved: () => void };
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
        {edit ? (
          <ContactEditable candidateId={edit.candidateId} kind={kind} value={value ?? null} onSaved={edit.onSaved}>
            {value ? <button type="button" className="cp-line-v" onClick={copy} title="Copy">{value}</button> : <span className="cp-line-v is-none">Not found yet</span>}
          </ContactEditable>
        ) : value
          ? <button type="button" className="cp-line-v" onClick={copy} title="Copy">{value}</button>
          : onAdd ? <button type="button" className="cp-line-add" onClick={onAdd}><Plus size={11} weight="bold" /> Add {label.toLowerCase()}</button> : <span className="cp-line-v is-none">Not found yet</span>}
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
  onAdd: (c: Contact) => void;
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
  const lead = mostYears(ps);

  const rows: { label: string; cell: (p: Contact) => ReactNode }[] = [
    { label: "Current role", cell: (p) => <><strong>{p.title}</strong><span className="cc-sub">{[p.company, p.industry].filter(Boolean).join(" · ")}</span></> },
    /* Years that are not on the profile arrive as 0: said as missing, never as "0 yrs" or a level worked out from them. */
    { label: "Experience", cell: (p) => experienceLabel(p)
      ? <span className={p.years === lead ? "cc-lead" : undefined}>{experienceLabel(p)}{p.years === lead && <span className="cc-tag">Most</span>}</span>
      : <span className="ct-none">{LIVE ? "Not on the profile" : "Not in the saved page"}</span> },
    { label: "Location", cell: (p) => p.location },
    { label: "Previously", cell: (p) => p.jobs[1] ? <>{p.jobs[1].title}<span className="cc-sub">{p.jobs[1].company} · {p.jobs[1].span}</span></> : <span className="ct-none">{LIVE ? "Not on the profile" : "Not in the saved page"}</span> },
    { label: "Education", cell: (p) => p.school ? <>{p.school.name}<span className="cc-sub">{p.school.degree}</span></> : <span className="ct-none">{LIVE ? "Not on the profile" : "Not in the saved page"}</span> },
    { label: "Skills", cell: (p) => <div className="cp-skills">{p.skills.map((s) => <span key={s} className={`cp-skill${shared.has(s) ? " is-shared" : ""}`}>{s}</span>)}</div> },
    { label: "Email", cell: (p) => <CopyCell kind="email" value={p.email?.value} verified={p.email?.verified} onCopy={onCopy} /> },
    { label: "Phone", cell: (p) => <CopyCell kind="phone" value={p.phone?.value} onCopy={onCopy} /> },
    { label: "Saved for", cell: (p) => <>{p.campaign ? campName(p.campaign) : <span className="ct-none">No campaign</span>}<span className="cc-sub">{[capturedLabel(p.capturedAgo), p.capturedBy].filter(Boolean).join(" · ")}</span></> },
  ];

  return (
    <Dialog open={open} onClose={onClose} label="Compare candidates" size="lg">
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
                <ShortlistControl suggest={p.campaign} on={lists[p.id] ?? []} onPick={(camp) => onShortlist(p.id, camp)} stages={stagesOfNow(p.id)} />
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
function AddSlot({ exclude, near, onAdd }: { exclude: readonly string[]; near?: Contact; onAdd: (c: Contact) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); setQ(""); }, []);
  /* With the API the search runs there, on the same campaign first. */
  const dq = useDebounced(q, 250);
  const [found, setFound] = useState<readonly Contact[]>([]);
  useEffect(() => {
    if (!LIVE || !open) return;
    let gone = false;
    cands.listCandidates({ q: dq, campaignId: dq.trim() ? undefined : near?.campaign || undefined, sort: "recent", limit: 12 })
      .then((r) => { if (!gone) setFound(r.rows.map((x) => cands.contactFromRow(x, undefined, addedByOf(x)))); }, () => { if (!gone) setFound([]); });
    return () => { gone = true; };
  }, [dq, open, near?.campaign]);
  const list = useMemo(() => {
    if (LIVE) return found.filter((c) => !exclude.includes(c.id)).slice(0, 8);
    const pool = CONTACTS.filter((c) => !exclude.includes(c.id));
    const needle = q.trim();
    const hits = needle ? pool.filter((c) => matches(c, EMPTY_FILTERS, needle))
      : [...pool].sort((a, b) => Number(b.campaign === near?.campaign) - Number(a.campaign === near?.campaign));
    return hits.slice(0, 8);
  }, [q, exclude, near, found]);
  useEffect(() => { setCursor(0); }, [q]);
  const pick = (c: Contact) => { onAdd(c); close(); };

  return (
    <div className="cc-person cc-add">
      <button ref={ref} type="button" className="cc-add-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="cc-add-ico" aria-hidden="true"><Plus size={16} weight="bold" /></span>
        <span className="cc-add-t">Add person</span>
        <span className="cc-add-s">Search candidates</span>
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
                const hit = list[cursor];
                if (e.key === "Enter" && hit) { e.preventDefault(); pick(hit); }
              }}
            />
          </label>
          <div className="ct-cp-list" role="listbox" aria-label="Candidates">
            {!q && near && <p className="cc-add-hint">From {campName(near.campaign)} first</p>}
            {list.map((c, i) => (
              <button key={c.id} type="button" role="option" aria-selected={i === cursor}
                className={`ct-cp-i cc-add-i${i === cursor ? " is-cursor" : ""}`}
                onMouseEnter={() => setCursor(i)} onClick={() => pick(c)}>
                <Avatar name={c.name} hue={c.hue} size={26} />
                <span className="ct-cp-t">
                  <span className="ct-cp-name">{c.name}</span>
                  <span className="ct-cp-role">{[c.title, c.company].filter(Boolean).join(" · ")}</span>
                </span>
                {c.years > 0 && <span className="ct-cp-n">{c.years}y</span>}
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
   One line, bottom centre, replaced rather than stacked. It lives in toast.tsx and is mounted once, by the
   console, so it is seen from every page; the names stay importable from here. */
export { Toaster, useToast } from "./toast";
export type { ToastAction } from "./toast";

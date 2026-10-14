import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LIVE } from "./api/client";
import { EmptyArt } from "./EmptyArt";
import { useFocusTrap } from "./components/focusTrap";
import type { Hit } from "./api/search";
import { hitsOf, quickFind } from "./api/search";
import { openChat } from "./liveChat";
import { CAMPAIGN_NAV, FOOT_NAV, navFor, navLabel, ROUTES } from "./nav";
import { standingOf } from "./can";
import type { Standing } from "./can";
import { useSession } from "./roleStore";
import type { RouteId, SettingsSection } from "./nav";


/**
 * The command palette — Notion / Linear shape, keyboard first.
 *
 * ── WHY EVERY ROW CARRIES ITS GROUP ─────────────────────────────────────────
 * Some words are two destinations in this product (Analytics → Overview and the
 * current campaign's Overview; Analytics → Pipeline and the campaign's Pipeline).
 * A flat result list would show the same word twice with no way to tell them
 * apart, so the group name travels with the row
 * rather than sitting above it as a heading — headings scroll away, and the
 * disambiguation has to survive scrolling.
 *
 * ── WHY IT LISTS EVERYTHING ON AN EMPTY QUERY ───────────────────────────────
 * A palette that starts blank reads as a search box that found nothing. Showing
 * the full set makes it legible as a navigator, which is most of what it is
 * until there is real content to search.
 */

type Entry = { id: RouteId; label: string; group: string; hint: string };

/** The Settings pages, which the sidebar reaches through one row: quick find reaches each. */
const SETTINGS_PAGES: ReadonlyArray<{ id: SettingsSection; label: string; hint: string; org?: boolean }> = [
  { id: "connections", label: "Connections", hint: "Gmail, Slack and Notion" },
  { id: "members", label: "Members", hint: "Your team and invites", org: true },
];

/** The Settings pages this person can open: Members only exists in an organisation. */
export function settingsPages(inOrg: boolean): ReadonlyArray<{ id: SettingsSection; label: string; hint: string }> {
  return SETTINGS_PAGES.filter((p) => !p.org || inOrg);
}

/* Built from the nav model rather than listed by hand, so a route added to the
   sidebar is searchable the same day — same source as the sidebar and the
   router, three consumers and one model.
   Takes the campaign name because the campaign-scoped rows are grouped under
   it, and it changes when the switcher changes it. */
export function buildEntries(campaignName: string, standing?: Standing | null): Entry[] {
  const out: Entry[] = [];
  /* Everyone's calls is not a place a recruiter has: theirs are each campaign's own Calls, listed under it below. */
  for (const section of navFor(standing)) {
    for (const item of section.items) {
      if (item.kind === "leaf") {
        out.push({ id: item.id, label: item.label, group: "Navigate", hint: ROUTES[item.id].title });
      } else {
        for (const child of item.children) {
          /* The Analytics page about people is "My work" for a recruiter; it stays findable as "Recruiters" too. */
          const label = navLabel(child.id, child.label, standing);
          out.push({ id: child.id, label, group: item.label, hint: label === child.label ? ROUTES[child.id].title : `${ROUTES[child.id].title} ${ROUTES[child.id].blurb}` });
        }
      }
    }
  }
  for (const item of CAMPAIGN_NAV) {
    out.push({ id: item.id, label: item.label, group: campaignName, hint: ROUTES[item.id].title });
  }
  for (const item of FOOT_NAV) {
    out.push({ id: item.id, label: item.label, group: "Account", hint: ROUTES[item.id].title });
  }
  return out;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: RouteId) => void;
  /** Groups the campaign-scoped rows, and changes with the switcher. */
  campaignName: string;
  /** Live: makes a campaign the current one and opens one of its pages. */
  onOpenCampaign?: (id: string, page: RouteId) => void;
  /** Live: hands the query to the agent, for anything that isn't a lookup. */
  onAsk?: (query: string) => void;
  /** Whether the workspace is an organisation, which is what gives Settings a Members page. */
  inOrg?: boolean;
};

/** A row the palette can open: a page, or something quick find found. */
type Row = { key: string; label: string; group: string; run: () => void };

/* Waits this long after the last keystroke before asking the API. */
const DEBOUNCE_MS = 120;

/**
 * What quick find found for the query, live only. Stale answers are dropped,
 * so a slow reply to "ana" never overwrites the one for "anan".
 */
function useQuickFind(open: boolean, query: string): { hits: Hit[]; failed: boolean } {
  const [found, setFound] = useState<{ q: string; hits: Hit[]; failed: boolean }>({ q: "", hits: [], failed: false });
  const q = query.trim();
  useEffect(() => {
    if (!LIVE || !open || q.length < 2) return;
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      quickFind(q, ctl.signal).then(
        (r) => setFound({ q, hits: hitsOf(r, q), failed: false }),
        () => { if (!ctl.signal.aborted) setFound({ q, hits: [], failed: true }); },
      );
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [open, q]);
  /* Until the new answer lands, the last one stays rather than the list blinking empty. */
  return q.length < 2 ? { hits: [], failed: false } : found;
}

export function Palette({ open, onClose, onNavigate, campaignName, onOpenCampaign, onAsk, inOrg = false }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const standing = standingOf(useSession());
  const entries = useMemo(() => buildEntries(campaignName, standing), [campaignName, standing]);
  const { hits, failed } = useQuickFind(open, query);

  const results = useMemo((): Row[] => {
    const q = query.trim().toLowerCase();
    const pages = (q
      /* Substring, not fuzzy. A fuzzy matcher on twenty entries mostly produces
         surprising order for no gain. Matching the group too is what makes
         typing "analytics" surface all five of its children. */
      ? entries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.group.toLowerCase().includes(q) ||
          e.hint.toLowerCase().includes(q),
      )
      : entries).map((e): Row => ({ key: e.id, label: e.label, group: e.group, run: () => onNavigate(e.id) }));
    /* Settings pages, connected only (Settings is a connected page): found by their name or "settings". */
    const settings = !LIVE ? [] : settingsPages(inOrg)
      .filter((p) => !q || `${p.label} settings ${p.hint}`.toLowerCase().includes(q))
      .map((p): Row => ({
        key: `settings-${p.id}`, label: p.label, group: "Settings",
        run: () => { window.location.hash = `/settings/${p.id}`; },
      }));
    const found = hits.map((h): Row => ({
      key: h.key, label: h.label, group: h.group,
      run: () => {
        const to = h.to;
        if (to.kind === "campaign") onOpenCampaign?.(to.id, to.page === "forms" ? "campaign-forms" : "campaign-overview");
        else if (to.kind === "client") window.location.hash = `/clients/${to.id}`;
        /* The person, and the chat, themselves: not only the page they are on. */
        else if (to.kind === "candidate") window.location.hash = `/contacts?open=${to.id}`;
        else if (to.kind === "chat") { void openChat(to.id); onNavigate("agent"); }
        else onNavigate(to.page);
      },
    }));
    const ask: Row[] = LIVE && onAsk && q.length >= 2
      ? [{ key: "ask", label: `Ask the agent: ${query.trim()}`, group: "Agent", run: () => onAsk(query.trim()) }]
      : [];
    return [...found, ...pages, ...settings, ...ask];
  }, [query, entries, hits, onNavigate, onOpenCampaign, onAsk, inOrg]);

  /* What the query matched, not counting the always-there "Ask the agent" row. */
  const matched = results.filter((r) => r.key !== "ask").length;

  /* Reset on every open, so the palette never reopens showing last time's
     query and a cursor pointing into a list that has since changed length. */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    input.current?.focus();
  }, [open]);

  /* Clamp rather than reset as the query narrows: resetting to 0 on every
     keystroke fights the arrow keys, and leaving it stale indexes past the end. */
  useEffect(() => {
    setCursor((c) => (results.length === 0 ? 0 : Math.min(c, results.length - 1)));
  }, [results.length]);

  /* Keep the highlighted row visible when arrows walk past the fold. `block:
     "nearest"` so it does not yank the list on every move. */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  /* Tab stays in the palette (the sidebar behind it is not a place to go from here). Console returns focus. */
  const palRef = useRef<HTMLDivElement>(null);
  useFocusTrap(palRef, open, { restore: false });

  if (!open) return null;

  const go = (row: Row) => {
    row.run();
    onClose();
  };

  return (
    <>
      {/* Same scrim as the mobile drawer: one dismissal vocabulary for
          everything that floats. aria-hidden because Escape and the rows are
          the accessible ways out. */}
      <div className="pal-scrim" onClick={onClose} aria-hidden="true" />

      <div className="pal" role="dialog" aria-modal="true" aria-label="Quick find" ref={palRef} tabIndex={-1}>
        <div className="pal-head">
          <MagnifyingGlass className="pal-head-ico" size={17} weight="regular" aria-hidden="true" />
          <input
            ref={input}
            className="pal-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, campaigns, candidates"
            aria-label="Search"
            aria-controls="pal-results"
            aria-activedescendant={results[cursor] ? `pal-opt-${results[cursor].key}` : undefined}
            /* Autocomplete off: the browser's own dropdown lands on top of the
               result list and swallows the arrow keys. */
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                /* Without preventDefault the caret jumps to either end of the
                   input at the same time as the cursor moves. */
                e.preventDefault();
                if (results.length === 0) return;
                const step = e.key === "ArrowDown" ? 1 : -1;
                setCursor((c) => (c + step + results.length) % results.length);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const hit = results[cursor];
                if (hit) go(hit);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <kbd className="pal-kbd">Esc</kbd>
        </div>

        {matched === 0 && (
          /* Names what was searched and what is searchable. "No results" alone
             leaves the user guessing whether the feature is broken. It stays above the
             "Ask the agent" row, which is always offered and is not a match. */
          <div className="ea-note pal-none">
            <EmptyArt name={failed ? "err-network" : "empty-search"} size={96} />
            <p className="pal-empty">
              {failed
                ? <>Search isn't reachable right now. Pages still open from here.</>
                : LIVE
                  ? <>Nothing matches <strong>{query}</strong>.</>
                  : <>Nothing matches <strong>{query}</strong>. Candidate and message search arrives with the campaign pages.</>}
            </p>
          </div>
        )}
        {results.length > 0 && (
          <ul className="pal-list" id="pal-results" role="listbox" ref={listRef}>
            {results.map((entry, i) => (
              <li
                key={entry.key}
                id={`pal-opt-${entry.key}`}
                role="option"
                aria-selected={i === cursor}
                className={`pal-opt${i === cursor ? " is-on" : ""}`}
                /* Mouse move rather than hover CSS: the highlight has to be
                   one thing, or the pointer and the arrow keys disagree about
                   which row Enter will take. */
                onMouseMove={() => setCursor(i)}
                onClick={() => go(entry)}
              >
                <span className="pal-opt-label">{entry.label}</span>
                <span className="pal-opt-group">{entry.group}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="pal-foot">
          <span><kbd className="pal-kbd">↑</kbd><kbd className="pal-kbd">↓</kbd> move</span>
          <span><kbd className="pal-kbd">↵</kbd> open</span>
        </div>
      </div>
    </>
  );
}

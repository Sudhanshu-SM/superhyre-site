import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CAMPAIGN_NAV, FOOT_NAV, NAV, ROUTES } from "./nav";
import type { RouteId } from "./nav";


/**
 * The command palette — Notion / Linear shape, keyboard first.
 *
 * ── WHY EVERY ROW CARRIES ITS GROUP ─────────────────────────────────────────
 * "Agent" is two different destinations in this product: Analytics → Agent, and
 * the current campaign's Agent. A flat result list would show the same word
 * twice with no way to tell them apart, so the group name travels with the row
 * rather than sitting above it as a heading — headings scroll away, and the
 * disambiguation has to survive scrolling.
 *
 * ── WHY IT LISTS EVERYTHING ON AN EMPTY QUERY ───────────────────────────────
 * A palette that starts blank reads as a search box that found nothing. Showing
 * the full set makes it legible as a navigator, which is most of what it is
 * until there is real content to search.
 */

type Entry = { id: RouteId; label: string; group: string; hint: string };

/* Built from the nav model rather than listed by hand, so a route added to the
   sidebar is searchable the same day — same source as the sidebar and the
   router, three consumers and one model.
   Takes the campaign name because the campaign-scoped rows are grouped under
   it, and it changes when the switcher changes it. */
function buildEntries(campaignName: string): Entry[] {
  const out: Entry[] = [];
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.kind === "leaf") {
        out.push({ id: item.id, label: item.label, group: "Navigate", hint: ROUTES[item.id].title });
      } else {
        for (const child of item.children) {
          out.push({ id: child.id, label: child.label, group: item.label, hint: ROUTES[child.id].title });
        }
      }
    }
  }
  for (const item of CAMPAIGN_NAV) {
    out.push({ id: item.id, label: item.label, group: campaignName, hint: ROUTES[item.id].title });
  }
  for (const item of FOOT_NAV) {
    out.push({ id: item.id, label: item.label, group: "Workspace", hint: ROUTES[item.id].title });
  }
  return out;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: RouteId) => void;
  /** Groups the campaign-scoped rows, and changes with the switcher. */
  campaignName: string;
};

export function Palette({ open, onClose, onNavigate, campaignName }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo(() => buildEntries(campaignName), [campaignName]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    /* Substring, not fuzzy. A fuzzy matcher on twenty entries mostly produces
       surprising order for no gain; revisit when the palette searches
       candidates and the set is thousands. Matching the group too is what makes
       typing "analytics" surface all four of its children. */
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q) ||
        e.hint.toLowerCase().includes(q),
    );
  }, [query, entries]);

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

  if (!open) return null;

  const go = (id: RouteId) => {
    onNavigate(id);
    onClose();
  };

  return (
    <>
      {/* Same scrim as the mobile drawer: one dismissal vocabulary for
          everything that floats. aria-hidden because Escape and the rows are
          the accessible ways out. */}
      <div className="pal-scrim" onClick={onClose} aria-hidden="true" />

      <div className="pal" role="dialog" aria-modal="true" aria-label="Quick find">
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
            aria-activedescendant={results[cursor] ? `pal-opt-${results[cursor].id}` : undefined}
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
                if (hit) go(hit.id);
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

        {results.length === 0 ? (
          /* Names what was searched and what is searchable. "No results" alone
             leaves the user guessing whether the feature is broken. */
          <p className="pal-empty">
            Nothing matches <strong>{query}</strong>. Candidate and message search
            arrives with the campaign pages.
          </p>
        ) : (
          <ul className="pal-list" id="pal-results" role="listbox" ref={listRef}>
            {results.map((entry, i) => (
              <li
                key={entry.id}
                id={`pal-opt-${entry.id}`}
                role="option"
                aria-selected={i === cursor}
                className={`pal-opt${i === cursor ? " is-on" : ""}`}
                /* Mouse move rather than hover CSS: the highlight has to be
                   one thing, or the pointer and the arrow keys disagree about
                   which row Enter will take. */
                onMouseMove={() => setCursor(i)}
                onClick={() => go(entry.id)}
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

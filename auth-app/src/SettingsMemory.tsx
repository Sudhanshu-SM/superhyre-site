import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { lastFailureKind } from "./api/client";
import { MEMORY_TEXT } from "./api/memory";
import type { MemoryItem } from "./api/memory";
import { useCampaignRows, useClients } from "./campaignStore";
import { ComingUp } from "./ComingUp";
import { Loader } from "./components/Loader";
import { useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { ErrorState, kindOfLastFailure } from "./ErrorStates";
import { confirmMemory, correctMemory, forgetMemory, loadMoreMemory, retryMemory, setMemoryFilters, useMemory } from "./memoryStore";
import type { MemoryState } from "./memoryStore";
import {
  appliesTo, canChange, confirmHelp, groupMemories, happenedLine, isFiltered, isLive, kindLabel, metaLine, NO_FILTERS,
  noticedLine, notesLabel, replacedWords, replacementOf, SCOPE_CHOICES, sectionsOf, whenLabel,
} from "./memoryView";
import type { MemoryFilters, MemoryGroup, Replacement, TypeSection } from "./memoryView";
import "./settingsMemory.css";

/**
 * Settings → Memory: the one place for what the agent remembers and what it has set up to happen later.
 * Notes are in three sections by what they are: facts and preferences (what clients want, how each of you
 * works), how we do things (patterns it noticed, ways of working), and what happened (decisions and
 * outcomes, newest first). What it suggested and nobody has confirmed comes first, as "Needs your
 * review"; "Coming up" is at the foot.
 *
 * Each note says where it applies, how often the agent used it and when it was last used. Anyone can
 * correct or forget what they can see; the whole agency's notes are the admins'. Narrow it to your own
 * ("Mine"), one campaign, one client or the whole agency, or search the words.
 */

const SEARCH_DELAY_MS = 300;
/** How many things that happened show before "Show more": a busy campaign has hundreds. */
const TIMELINE_SHOWN = 8;

export function SettingsMemory({ manages, timeZone }: { manages: boolean; timeZone: string }) {
  const m = useMemory();
  const filtered = isFiltered(m.filters);
  const sections = useMemo(() => sectionsOf(m.items), [m.items]);
  const queued = m.pending.length;
  /* What a replaced note was replaced by: said only while that note is there. */
  const replaced = useMemo(() => {
    const known = new Set(m.items.map((i) => i.id));
    const forgotten = new Set(m.forgotten);
    const complete = m.list === "ready" && m.next === null && !filtered;
    return (item: MemoryItem): Replacement => replacementOf(item, known, forgotten, complete);
  }, [m.items, m.forgotten, m.list, m.next, filtered]);
  /* The first answers (the list and the queue) arrive together, so the page draws once. Later
     searches keep the controls where they are instead of putting the skeleton back. */
  const answered = (m.list === "ready" || m.list === "failed") && (m.queue === "ready" || m.queue === "failed");
  const seen = useRef(false);
  if (answered) seen.current = true;

  return (
    <div className="st-sec sm">
      <div className="st-h-row">
        <h2 className="st-h t-title-sm">What the agent remembers</h2>
        <span className="sm-count t-body-sm">{m.stats ? notesLabel(m.stats.active) : ""}</span>
      </div>
      <p className="st-quiet t-body-sm">
        The agent reads these notes before it answers, so you don't have to say things twice. It never keeps contact
        details, or anything about a candidate's protected traits such as age, religion or health. A candidate is
        named only to people who can see them. You can correct any note, or have it forget one.
      </p>

      {!seen.current ? (
        <Waiting />
      ) : (
        <>
          {queued > 0 && <ReviewQueue items={m.pending} working={m.working} manages={manages} />}
          {m.queue === "failed" && queued === 0 && (
            <p className="st-err t-body-sm" role="alert">
              Couldn't check what is waiting for review.{" "}
              <button type="button" className="st-link" onClick={() => void retryMemory()}>Try again</button>
            </p>
          )}

          <Bar filters={m.filters} known={m.known} />

          {m.list === "failed" ? (
            <ErrorState kind={kindOfLastFailure(lastFailureKind())} title={null} text="Couldn't load what the agent remembers." action={{ label: "Try again", onClick: () => void retryMemory() }} />
          ) : m.items.length === 0 && m.list !== "loading" ? (
            <Empty filters={m.filters} filtered={filtered} queued={queued > 0} />
          ) : (
            <div className={`sm-groups${m.list === "loading" ? " is-busy" : ""}`} aria-busy={m.list === "loading"}>
              {sections.map((sec) => (
                <Section key={sec.type} section={sec} filtered={filtered} manages={manages} working={m.working} replaced={replaced} state={m} />
              ))}
              {/* Later pages are what happened, so their "Show more" is under that section; without one it is here. */}
              {!sections.some((sec) => sec.type === "happened") && <More state={m} />}
            </div>
          )}
        </>
      )}

      <ComingUp timeZone={timeZone} />
    </div>
  );
}

/** One of the three kinds of note: facts and ways grouped by where they apply, what happened as a timeline. */
function Section({ section, filtered, manages, working, replaced, state }: {
  section: TypeSection; filtered: boolean; manages: boolean; working: readonly string[]; replaced: (item: MemoryItem) => Replacement;
  state: MemoryState;
}) {
  const head = useId();
  /* What happened is long and newest first: a few at a time, then the rest the page has, then the next page. */
  const [visible, setVisible] = useState(TIMELINE_SHOWN);
  const timeline = section.type === "happened";
  const groups = useMemo(() => (timeline ? [] : groupMemories(section.items)), [timeline, section.items]);
  const shown = timeline && !filtered ? section.items.slice(0, visible) : section.items;
  const hidden = section.items.length - shown.length;
  return (
    <section className="sm-type" aria-labelledby={head}>
      <h3 className="st-sub t-label sm-th" id={head}>
        <span className="sm-gt">{section.title}</span>
        <span className="sm-n">{section.items.length}</span>
      </h3>
      <p className="st-quiet t-body-sm sm-help-line">{section.help}</p>
      {timeline ? (
        <>
          <ul className="sm-list">
            {shown.map((item) => (
              <Note key={item.id} item={item} timeline may={canChange(item, { manages })} busy={working.includes(item.id)} replacement={replaced(item)} />
            ))}
          </ul>
          {hidden > 0 ? (
            <button type="button" className="st-link sm-showmore" onClick={() => setVisible(visible + 16)}>
              Show {Math.min(hidden, 16)} more
            </button>
          ) : (
            <More state={state} />
          )}
        </>
      ) : (
        groups.map((g) => (
          <Group key={g.key} group={g} filtered={filtered} manages={manages} working={working} replaced={replaced}
            note={g.kind === "org" && !manages ? "Only admins can change these." : null} />
        ))
      )}
    </section>
  );
}

/* ── search, scope and history ── */

function Bar({ filters, known }: { filters: MemoryFilters; known: MemoryState["known"] }) {
  const [q, setQ] = useState(filters.q);
  const first = useRef(true);
  const id = useId();
  const rows = useCampaignRows();
  const { clients } = useClients();

  /* The words are sent a moment after typing stops; the other controls act at once. */
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = window.setTimeout(() => { void setMemoryFilters({ q: q.trim() }); }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [q]);
  /* Cleared from elsewhere ("Clear search" on an empty result). */
  useEffect(() => { if (filters.q === "") setQ((cur) => (cur.trim() === "" ? cur : "")); }, [filters.q]);

  /* Every campaign they can see, and every client with a note or on the Clients page. */
  const campaigns = useMemo(() => union(rows.map((r) => ({ id: r.id, name: r.name })), known.campaigns), [rows, known.campaigns]);
  const clientChoices = useMemo(() => union(clients.map((c) => ({ id: c.id, name: c.name })), known.clients), [clients, known.clients]);

  return (
    <div className="sm-bar" role="search">
      <input
        className="ncx-in sm-search" type="search" value={q} placeholder="Search notes" aria-label="Search notes"
        autoComplete="off" onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="ncx-in sm-scope" aria-label="Show notes" value={filters.scope}
        onChange={(e) => void setMemoryFilters({ scope: SCOPE_CHOICES.find((s) => s.id === e.target.value)?.id ?? "all" })}
      >
        {SCOPE_CHOICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      {filters.scope === "campaign" && (
        <select
          className="ncx-in sm-scope" aria-label="Campaign" value={filters.campaignId ?? ""}
          onChange={(e) => void setMemoryFilters({ campaignId: e.target.value || null })}
        >
          {campaigns.length === 0 && <option value="">No campaigns</option>}
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {filters.scope === "client" && (
        <select
          className="ncx-in sm-scope" aria-label="Client" value={filters.clientId ?? ""}
          onChange={(e) => void setMemoryFilters({ clientId: e.target.value || null })}
        >
          {clientChoices.length === 0 && <option value="">No clients</option>}
          {clientChoices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <label className="sm-check t-body-sm" htmlFor={`${id}-hist`}>
        <input
          id={`${id}-hist`} type="checkbox" checked={filters.history}
          onChange={(e) => void setMemoryFilters({ history: e.target.checked })}
        />
        Show replaced notes
      </label>
    </div>
  );
}

/** Two lists of {id, name} as one, by id, by name. */
function union(a: readonly { id: string; name: string }[], b: readonly { id: string; name: string }[]) {
  const by = new Map<string, string>();
  for (const x of [...a, ...b]) if (x.name && !by.has(x.id)) by.set(x.id, x.name);
  return [...by].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name, "en", { sensitivity: "base" }));
}

/* ── states ── */

function Waiting() {
  return <Loader size="md" label="Loading what the agent remembers" block />;
}

function Empty({ filters, filtered, queued }: { filters: MemoryFilters; filtered: boolean; queued: boolean }) {
  if (filtered) {
    const where =
      filters.scope === "mine" ? "Nothing of yours is remembered yet."
      : filters.scope === "campaign" ? "Nothing is remembered for this campaign yet."
      : filters.scope === "client" ? "Nothing is remembered for this client yet."
      : filters.scope === "org" ? "Nothing is remembered for the whole agency yet."
      : "No notes match that.";
    return (
      <div className="sm-note has-art">
        <EmptyArt name={filters.q.trim() ? "empty-search" : "empty-memory"} size={160} />
        <p className="st-quiet t-body">{filters.q.trim() ? "No notes match that." : where}</p>
        <button type="button" className="st-link" onClick={() => void setMemoryFilters({ scope: NO_FILTERS.scope, q: "" })}>
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="sm-note has-art">
      <EmptyArt name="empty-memory" size={180} />
      <p className="st-quiet t-body">
        {queued
          ? "Nothing is in use yet. Confirm the notes above and the agent starts using them."
          : "Nothing remembered yet."}
      </p>
      {!queued && (
        <p className="st-quiet t-body-sm">
          When you tell the agent how you work, such as a client's budget or how many people you like on a shortlist,
          it keeps a note here, and as your campaigns move it keeps what happened. <a className="st-link" href="#/agent">Open the agent</a>
        </p>
      )}
    </div>
  );
}

function More({ state }: { state: MemoryState }) {
  if (!state.next && state.more !== "failed") return null;
  return (
    <div className="sm-more">
      {state.more === "failed" && <span className="st-err t-body-sm" role="alert">Couldn't load more.</span>}
      <button type="button" className="ncx-btn is-sm" disabled={state.more === "loading"} onClick={() => void loadMoreMemory()}>
        {state.more === "loading" ? <><Loader size="sm" tone="inherit" />Loading</> : state.more === "failed" ? "Try again" : "Show more"}
      </button>
    </div>
  );
}

/* ── waiting for review ── */

function ReviewQueue({ items, working, manages }: { items: readonly MemoryItem[]; working: readonly string[]; manages: boolean }) {
  const toast = useToast();
  const mine = items.filter((i) => canChange(i, { manages }));
  return (
    <section className="sm-queue" aria-labelledby="sm-queue-h">
      <h3 className="st-sub t-label" id="sm-queue-h">Needs your review <span className="sm-n">{items.length}</span></h3>
      <p className="st-quiet t-body-sm">
        {mine.length
          ? "The agent suggested these, but won't use them until someone confirms."
          : "The agent suggested these. An admin needs to confirm them before it uses them."}
      </p>
      <ul className="sm-list">
        {items.map((item) => {
          const may = canChange(item, { manages });
          const busy = working.includes(item.id);
          return (
            <li className="sm-row" key={item.id}>
              <div className="sm-main">
                <p className="sm-text">{item.text}</p>
                {item.quote && <p className="sm-said t-body-sm">Said in a chat: “{item.quote}”</p>}
                <p className="sm-meta t-caption">{[appliesTo(item), kindLabel(item.kind), noticedLine(item), whenLabel(item.updatedAt)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="sm-acts">
                {may ? (
                  <>
                    <button type="button" className="ncx-btn is-sm is-primary" disabled={busy}
                      onClick={() => void confirmMemory(item.id).then((r) => { if (r.ok) toast("Confirmed"); })}>
                      Confirm
                    </button>
                    <button type="button" className="ncx-btn is-sm" disabled={busy}
                      onClick={() => void forgetMemory(item.id).then((r) => { if (r.ok) toast("Forgotten"); })}>
                      Forget
                    </button>
                  </>
                ) : (
                  <span className="sm-help t-body-sm">{confirmHelp(item, { manages })}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── the notes, by where they apply ── */

function Group({ group, filtered, manages, working, replaced, note }: {
  group: MemoryGroup; filtered: boolean; manages: boolean; working: readonly string[]; replaced: (item: MemoryItem) => Replacement; note: string | null;
}) {
  /* Notes about people start folded; a search opens them so a match is never hidden. */
  const [pref, setPref] = useState<boolean | null>(null);
  const open = pref ?? (!group.folded || filtered);
  const head = useId();
  const title = (
    <>
      <span className="sm-gt">{group.title}</span>
      {group.sub && <span className="sm-gs">{group.sub}</span>}
      <span className="sm-n">{group.items.length}</span>
    </>
  );
  return (
    <section className="sm-group" aria-labelledby={head}>
      {group.folded ? (
        <h3 className="st-sub t-label sm-gh" id={head}>
          <button type="button" className="sm-fold" aria-expanded={open} onClick={() => setPref(!open)}>
            {open ? <CaretDown size={11} weight="bold" aria-hidden="true" /> : <CaretRight size={11} weight="bold" aria-hidden="true" />}
            {title}
          </button>
        </h3>
      ) : (
        <h3 className="st-sub t-label sm-gh" id={head}>{title}</h3>
      )}
      {note && open && <p className="st-quiet t-body-sm sm-gnote">{note}</p>}
      {open && (
        <ul className="sm-list">
          {group.items.map((item) => (
            <Note key={item.id} item={item} may={canChange(item, { manages })} busy={working.includes(item.id)} replacement={replaced(item)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Note({ item, may, busy, replacement, timeline = false }: {
  item: MemoryItem; may: boolean; busy: boolean; replacement: Replacement; timeline?: boolean;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const live = isLive(item);
  const words = draft.trim().length;
  const bad = words < MEMORY_TEXT.min || words > MEMORY_TEXT.max || draft.trim() === item.text.trim();

  useEffect(() => { if (editing) area.current?.focus(); }, [editing]);

  const save = async () => {
    if (bad || busy) return;
    const text = draft.trim();
    setEditing(false);
    setError(null);
    const r = await correctMemory(item.id, text);
    if (r.ok) { toast("Corrected"); return; }
    /* Refused (a phone number in it, say): the words are still here to fix. */
    setDraft(text);
    setError(r.message);
    setEditing(true);
  };

  if (editing) {
    return (
      <li className="sm-row is-editing">
        <form className="sm-edit" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="sr-only" htmlFor={`sm-edit-${item.id}`}>Correct this note</label>
          <textarea
            ref={area} id={`sm-edit-${item.id}`} className="ncx-in is-area" rows={3} value={draft} maxLength={MEMORY_TEXT.max}
            aria-invalid={error ? true : undefined}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditing(false); setDraft(item.text); setError(null); }
              else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
            }}
          />
          <div className="sm-edit-f">
            <span className={`t-caption ${error ? "st-err" : "sm-hint"}`} role={error ? "alert" : undefined}>
              {error ?? `${MEMORY_TEXT.min} to ${MEMORY_TEXT.max} characters. The old wording is kept as history.`}
            </span>
            <button type="button" className="ncx-btn is-sm" onClick={() => { setEditing(false); setDraft(item.text); setError(null); }}>Cancel</button>
            <button type="submit" className="ncx-btn is-sm is-primary" disabled={bad || busy}>Save</button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`sm-row${item.status === "superseded" ? " is-old" : ""}${busy ? " is-busy" : ""}`}>
      <div className="sm-main">
        <p className="sm-text">{item.text}</p>
        <p className="sm-meta t-caption">{timeline ? happenedLine(item) : metaLine(item)}</p>
      </div>
      <div className="sm-acts">
        {!live ? (
          <span className="sm-help t-body-sm">{replacedWords(replacement)}</span>
        ) : !may ? null : asking ? (
          <>
            <span className="sm-help t-body-sm">{item.level === "org" ? "Forget this for the whole agency?" : "Forget this note?"}</span>
            <button type="button" className="st-link" onClick={() => setAsking(false)}>Keep</button>
            <button
              type="button" className="ncx-btn is-sm" disabled={busy} autoFocus
              onClick={() => void forgetMemory(item.id).then((r) => { if (r.ok) toast("Forgotten"); else setAsking(false); })}
            >
              Forget
            </button>
          </>
        ) : (
          <>
            {/* What happened is a record, not a statement to correct: it can only be forgotten. */}
            {!timeline && (
              <button type="button" className="st-link" disabled={busy} onClick={() => { setDraft(item.text); setError(null); setEditing(true); }}>Correct</button>
            )}
            <button type="button" className="st-link" disabled={busy} onClick={() => setAsking(true)}>Forget</button>
          </>
        )}
      </div>
    </li>
  );
}

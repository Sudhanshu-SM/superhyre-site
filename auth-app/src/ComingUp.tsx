import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import { getSchedule } from "./api/schedules";
import { lastFailureKind } from "./api/client";
import type { ScheduleDetail, ScheduledItem } from "./api/schedules";
import { useCampaignRows } from "./campaignStore";
import { Loader } from "./components/Loader";
import { EmptyArt } from "./EmptyArt";
import { HomeEmpty } from "./HomeEmpty";
import { useConnections } from "./connectionsStore";
import { useToast } from "./Contacts";
import { ErrorState, kindOfLastFailure } from "./ErrorStates";
import { COMING_UP_HREF, redirectedHash } from "./nav";
import { CONNECTIONS_HREF } from "./railConfig";
import { useSession } from "./roleStore";
import { cancelItem, loadMore, reloadFeed, rescheduleItem, useFeed, useSchedulesUnavailable, useWorking } from "./schedulesStore";
import type { Feed, FeedQuery } from "./schedulesStore";
import {
  approvedLine, campaignIdFromHash, canChangeTime, cancelCopy, deliveryText, detailLines, happenedAt, instantFromLocal,
  isDue, isGmailDown, isSender, localInput, metaLine, newLines, nextTime, repeatWords, retryText, runLine, soonLabel,
  statusText, summaryText, whenLabel, whenProblem, zoneName,
} from "./schedulesView";
import "./schedules.css";

/**
 * Coming up: what the agent has set up to happen later, on Home (`ComingUpCard`, the next five) and, whole, here. An email, a Slack message, a
 * Notion note, a task, a reminder or a digest, each with when it goes, who it goes to and where it stands, and
 * a way to move it or call it off. What already went out is one click away, with how it went.
 *
 * Both lists read again every minute while the section is open, so something going out moves from one to the
 * other without a reload. The agent makes these, and asks first; there is no form here because telling the agent
 * is how they are made.
 */

const TICK_MS = 30_000;

/** The clock, so "Today" and "in 2 min" stay true while the section is open. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const UPCOMING: FeedQuery = { status: "upcoming", kind: "all", campaignId: null };
const HISTORY: FeedQuery = { status: "history", kind: "all", campaignId: null };

export function ComingUp({ timeZone }: { timeZone: string }) {
  const session = useSession();
  const campaigns = useCampaignRows();
  const [campaignId, setCampaignId] = useState<string | null>(() => campaignIdFromHash(window.location.hash));
  const [earlier, setEarlier] = useState(false);
  const now = useNow();

  /* A link from a campaign's chat view filters to that campaign, also while this is already open. */
  useEffect(() => {
    const on = () => {
      const id = campaignIdFromHash(window.location.hash);
      if (id) setCampaignId(id);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  /* Opened from a link that names this section: bring it into view. */
  useEffect(() => {
    const at = redirectedHash(window.location.hash) ?? window.location.hash;
    if (/[?&]section=coming-up\b/.test(at)) document.getElementById("coming-up")?.scrollIntoView({ block: "start" });
  }, []);

  const upQuery: FeedQuery = { ...UPCOMING, campaignId };
  const doneQuery: FeedQuery = { ...HISTORY, campaignId };
  const up = useFeed(upQuery, { poll: true });
  const unavailable = useSchedulesUnavailable();
  const campaign = campaignId ? campaigns.find((c) => c.id === campaignId) : undefined;

  /* A server without the schedule routes has nothing to show here, and an error that cannot clear is worse. */
  if (unavailable && up.phase !== "ready") return null;

  return (
    <section className="sc" id="coming-up" aria-labelledby="coming-up-h">
      <div className="st-h-row">
        <h2 className="st-h t-title-sm" id="coming-up-h">Coming up</h2>
        <span className="sm-count t-body-sm">{up.phase === "ready" ? `${up.items.length}${up.next ? "+" : ""}` : ""}</span>
      </div>
      <p className="st-quiet t-body-sm">
        What the agent has set up to happen later. Nothing goes out unless someone said yes.
        {campaignId && (
          <>
            {" "}Showing {campaign ? `only ${campaign.name}` : "one campaign"}.{" "}
            <a className="st-link" href={COMING_UP_HREF} onClick={() => setCampaignId(null)}>Show everything</a>
          </>
        )}
      </p>

      <List
        feed={up} query={upQuery} empty="upcoming" viewerId={session.userId ?? null} zone={timeZone} now={now}
        filtered={campaignId !== null} onClear={() => setCampaignId(null)}
      />

      <button type="button" className="st-link sc-earlier" aria-expanded={earlier} onClick={() => setEarlier((v) => !v)}>
        {earlier ? "Hide what already went out" : "What already went out"}
      </button>
      {earlier && <Earlier query={doneQuery} viewerId={session.userId ?? null} zone={timeZone} now={now} filtered={campaignId !== null} onClear={() => setCampaignId(null)} />}
    </section>
  );
}

function Earlier({ query, viewerId, zone, now, filtered, onClear }: {
  query: FeedQuery; viewerId: string | null; zone: string; now: number; filtered: boolean; onClear: () => void;
}) {
  const feed = useFeed(query);
  return <List feed={feed} query={query} empty="history" viewerId={viewerId} zone={zone} now={now} filtered={filtered} onClear={onClear} />;
}

/* ── the list ── */

export function List({ feed, query, empty, filtered, viewerId, zone, now, onClear, limit, compact }: {
  feed: Feed; query: FeedQuery; empty: "upcoming" | "history"; filtered: boolean; viewerId: string | null; zone: string; now: number; onClear: () => void;
  /** Home's card: the next few, soonest first, with the rest one click away; rows stack and the empty state is a line. */
  limit?: number; compact?: boolean;
}) {
  const working = useWorking();
  const unavailable = useSchedulesUnavailable();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  if (feed.phase === "failed" || (unavailable && feed.phase !== "ready")) {
    return (
      <ErrorState kind={kindOfLastFailure(lastFailureKind())} title={null} text="Couldn't load what's coming up." action={{ label: "Try again", onClick: () => void reloadFeed(query) }} />
    );
  }
  if (feed.phase === "idle" || feed.phase === "loading") return <Loader size="md" label="Loading what's coming up" block />;
  if (feed.items.length === 0 && compact) {
    /* Home's card: the same empty shape as every other card there (picture, headline, one line, one action). */
    return (
      <HomeEmpty
        short
        art="empty-schedules"
        title={filtered ? "Nothing coming up for this campaign" : "Nothing coming up"}
        line="Ask the agent to remind you of something, or to follow up later."
      >
        <a className="st-link" href="#/agent">Ask the agent</a>
      </HomeEmpty>
    );
  }
  if (feed.items.length === 0) {
    /* Nothing coming up at all gets its picture; "nothing for this campaign" and "nothing has gone out" are one line. */
    const art = empty === "upcoming" && !filtered;
    return (
      <div className={`sc-note${art ? " has-art" : ""}`}>
        {art && <EmptyArt name="empty-schedules" size={160} />}
        <p className="st-quiet t-body">
          {filtered
            ? empty === "upcoming" ? "Nothing coming up for this campaign." : "Nothing has gone out for this campaign."
            : empty === "upcoming" ? "Nothing is coming up." : "Nothing has gone out yet."}
        </p>
        {filtered ? (
          <button type="button" className="st-link" onClick={onClear}>Show everything</button>
        ) : empty === "upcoming" ? (
          <p className="st-quiet t-body-sm">
            Ask the agent to email someone later, remind you, or send a weekly digest, and it shows up here once you approve it.{" "}
            <a className="st-link" href="#/agent">Open the agent</a>
          </p>
        ) : null}
      </div>
    );
  }

  /* Soonest first; on Home only the next few until someone asks for the rest. */
  const sorted = limit ? [...feed.items].sort((a, b) => Date.parse(nextTime(a)) - Date.parse(nextTime(b))) : feed.items;
  const folded = !!limit && !all && (sorted.length > limit);
  const shown = folded && limit ? sorted.slice(0, limit) : sorted;
  return (
    <>
      <ul className={`sc-list${compact ? " is-compact" : ""}`}>
        {shown.map((item) => (
          <Row
            key={item.id} item={item} viewerId={viewerId} zone={zone} now={now} busy={working.includes(item.id)}
            open={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)}
          />
        ))}
      </ul>
      {folded && (
        <div className="sc-more">
          <button type="button" className="st-link" onClick={() => setAll(true)}>Show all {sorted.length}{feed.next ? "+" : ""}</button>
        </div>
      )}
      {!folded && (feed.next || feed.more === "failed") && (
        <div className="sc-more">
          {feed.more === "failed" && <span className="st-err t-body-sm" role="alert">Couldn't load more.</span>}
          <button type="button" className="ncx-btn is-sm" disabled={feed.more === "loading"} onClick={() => void loadMore(query)}>
            {feed.more === "loading" ? <><Loader size="sm" tone="inherit" />Loading</> : feed.more === "failed" ? "Try again" : "Show more"}
          </button>
        </div>
      )}
    </>
  );
}

/* ── one row ── */

function Row({ item, viewerId, zone, now, busy, open, onToggle }: {
  item: ScheduledItem; viewerId: string | null; zone: string; now: number; busy: boolean; open: boolean; onToggle: () => void;
}) {
  const toast = useToast();
  const conns = useConnections();
  const [asking, setAsking] = useState(false);
  const [changing, setChanging] = useState(false);
  /* Times are named by zone only when they are not in the zone the person has set in their profile. */
  const viewerTz = zone;
  const waiting = item.status === "scheduled" || item.status === "running";
  const at = waiting ? nextTime(item) : happenedAt(item);
  /* Cancelled before it ever ran: the time is when it was due, which can still be ahead. */
  const neverRan = !waiting && !item.lastRunAt;
  const sub = [waiting ? soonLabel(at, now) : neverRan ? "was due" : null, repeatWords(item, now)].filter(Boolean).join(" · ");
  const status = statusText(item, now, viewerTz, viewerId);
  const mine = isSender(item, viewerId);
  const snag = retryText(item, mine);
  /* Only whoever it goes out as can connect their Gmail: a teammate is told what happened instead. */
  const gmailOff = conns.status === "ready" && (!conns.google || conns.google.status !== "connected");
  const connect = mine && gmailOff && (isGmailDown(item.lastError) || isGmailDown(String(item.result?.deliveryError ?? "")));
  const copy = cancelCopy(item);
  const may = item.canCancel;
  const due = isDue(item, now);

  return (
    <li className={`sc-row${busy ? " is-busy" : ""}${open ? " is-open" : ""}`}>
      <div className="sc-when">
        <span className="sc-when-t t-body-strong">{whenLabel(at, item.timezone, { now, viewerTz })}</span>
        {(sub || due) && <span className="sc-when-s t-caption">{due ? "any moment now" : sub}</span>}
      </div>

      <div className="sc-main">
        <button type="button" className="sc-what" aria-expanded={open} onClick={onToggle}>
          <span className="sc-what-t t-body">{summaryText(item)}</span>
          <CaretDown className={`sc-caret${open ? " is-open" : ""}`} size={12} weight="bold" aria-hidden="true" />
        </button>
        <p className="sc-meta t-caption">{metaLine(item, viewerId)}</p>
        {snag && <p className="sc-snag t-caption">{snag}</p>}
        {waiting && item.doNotContact && <p className="sc-snag t-caption">{item.doNotContact} This email will not be sent.</p>}
      </div>

      <div className="sc-acts">
        {status && <span className={`sc-status t-body-sm${item.status === "failed" || /^Didn't send/.test(status) ? " is-bad" : ""}`}>{status}</span>}
        {connect && <a className="st-link" href={CONNECTIONS_HREF}>Connect Gmail</a>}
        {may && !asking && !changing && (
          <>
            {canChangeTime(item) && (
              <button type="button" className="st-link" disabled={busy} onClick={() => setChanging(true)}>Change time</button>
            )}
            <button type="button" className="st-link" disabled={busy} onClick={() => setAsking(true)}>
              {item.status === "scheduled" ? "Cancel" : "Withdraw"}
            </button>
          </>
        )}
      </div>

      {asking && (
        <div className="sc-sub sc-ask">
          <span className="sc-sub-t t-body-sm" role="alert">{copy.ask}</span>
          <button type="button" className="st-link" onClick={() => setAsking(false)}>Keep</button>
          <button
            type="button" className="ncx-btn is-sm" disabled={busy} autoFocus
            onClick={() => void cancelItem(item.id).then((r) => { setAsking(false); if (r.ok) toast(copy.done); })}
          >
            {copy.confirm}
          </button>
        </div>
      )}
      {changing && <ChangeTime item={item} zone={zone} onClose={() => setChanging(false)} />}
      {open && <Detail item={item} viewerId={viewerId} zone={zone} now={now} />}
    </li>
  );
}

/** A new time for something that is waiting, read in the zone it was set up in. */
function ChangeTime({ item, zone: mine, onClose }: { item: ScheduledItem; zone: string; onClose: () => void }) {
  const toast = useToast();
  const id = useId();
  const start = useMemo(() => localInput(Date.parse(nextTime(item)), item.timezone), [item]);
  const [value, setValue] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useMemo(() => Date.now(), []);
  const ms = instantFromLocal(value, item.timezone);
  /* Read now, not when the panel opened: "a minute from now" moves while it sits there. */
  const problem = value === start ? null : whenProblem(ms, Date.now()) ?? (ms === null ? "That time doesn't exist that day." : null);
  const zone = zoneName(ms ?? Date.parse(nextTime(item)), item.timezone);

  const save = async () => {
    if (busy) return;
    /* The same time again changes nothing: say so and close, rather than leave Save looking dead. */
    if (value === start) { toast("No change"); onClose(); return; }
    if (ms === null || problem) return;
    setBusy(true);
    setError(null);
    const r = await rescheduleItem(item.id, new Date(ms).toISOString());
    setBusy(false);
    if (r.ok) { toast(`Moved to ${whenLabel(new Date(ms).toISOString(), item.timezone, { viewerTz: mine })}`); onClose(); }
    else setError(r.message);
  };

  return (
    <form className="sc-sub sc-change" onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <label className="sr-only" htmlFor={id}>New time</label>
      <input
        id={id} className="ncx-in sc-dt" type="datetime-local" value={value} autoFocus step={60}
        min={localInput(opened + 60_000, item.timezone)} max={localInput(opened + 90 * 86_400_000, item.timezone)}
        aria-invalid={problem ? true : undefined} onChange={(e) => { setValue(e.target.value); setError(null); }}
      />
      <span className="sc-tz t-caption">{zone}</span>
      <button type="button" className="st-link" onClick={onClose}>Keep</button>
      <button type="submit" className="ncx-btn is-sm is-primary" disabled={busy || !!problem || ms === null}>Save</button>
      {(problem || error) && <span className="st-err t-caption sc-sub-e" role="alert">{problem ?? error}</span>}
    </form>
  );
}

/* ── the expanded row: the full text, who said yes, how each run went ── */

function Detail({ item, viewerId, zone, now }: { item: ScheduledItem; viewerId: string | null; zone: string; now: number }) {
  const stamp = `${item.status}|${item.lastRunAt ?? ""}|${item.occurrencesDone}|${item.runAt}`;
  const [tries, setTries] = useState(0);
  const [s, setS] = useState<{ phase: "loading" | "ready" | "failed"; detail: ScheduleDetail | null }>({ phase: "loading", detail: null });

  useEffect(() => {
    let live = true;
    getSchedule(item.id).then(
      (detail) => { if (live) setS({ phase: detail ? "ready" : "failed", detail }); },
      () => { if (live) setS((cur) => ({ phase: cur.detail ? "ready" : "failed", detail: cur.detail })); },
    );
    return () => { live = false; };
  }, [item.id, stamp, tries]);

  const approved = approvedLine(item, viewerId);
  /* The right-hand column already says it when that is all there is to say. */
  const mine = isSender(item, viewerId);
  const runs = s.detail?.history ?? [];
  /* The newest run of an email already says how the email went, so a line for it is not repeated. */
  const delivery = item.kind === "email" && !runs.length && deliveryText(item, now, zone, mine) !== statusText(item, now, zone, viewerId) ? deliveryText(item, now, zone, mine) : null;
  const lines = s.detail ? newLines(detailLines(s.detail, now, zone), item) : [];
  /* Only an admin or whoever set it up can change it: said where it matters, once. */
  const locked = !item.canCancel && item.status === "scheduled";
  const nothing = lines.length === 0 && !delivery && !approved && !locked && runs.length === 0;

  return (
    <div className="sc-sub sc-detail" aria-live="polite">
      {s.phase === "loading" && <Loader size="sm" label="Loading the details" />}
      {s.phase === "failed" && (
        <p className="st-err t-body-sm" role="alert">
          Couldn't load the details. <button type="button" className="st-link" onClick={() => { setS({ phase: "loading", detail: null }); setTries((n) => n + 1); }}>Try again</button>
        </p>
      )}
      {s.phase === "ready" && (
        <>
          <dl className="sc-dl">
            {lines.map((l) => (
              <div key={l.label} className="sc-dl-r">
                <dt className="t-caption">{l.label}</dt>
                <dd className="t-body-sm">{l.text}</dd>
              </div>
            ))}
            {delivery && (
              <div className="sc-dl-r"><dt className="t-caption">Delivery</dt><dd className="t-body-sm">{delivery}</dd></div>
            )}
            {approved && (
              <div className="sc-dl-r"><dt className="t-caption">Approval</dt><dd className="t-body-sm">{approved}</dd></div>
            )}
            {locked && (
              <div className="sc-dl-r">
                <dt className="t-caption">Changes</dt>
                <dd className="t-body-sm">Only whoever set this up, whoever approved it, or an admin can change it.</dd>
              </div>
            )}
          </dl>
          {nothing && <p className="t-body-sm sc-runs-h">Nothing more to show.</p>}
          {runs.length > 0 && (
            <div className="sc-runs">
              <p className="t-caption sc-runs-h">What happened</p>
              <ul>
                {runs.slice(0, 5).map((r, n) => (
                  <li key={r.runId} className="t-body-sm">{runLine(r, item.timezone, now, zone, item, n === 0, isSender(item, viewerId))}</li>
                ))}
              </ul>
              {runs.length > 5 && <p className="t-caption sc-runs-h">and {runs.length - 5} earlier</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { ArrowDownLeft, ArrowUpRight, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Pager } from "./components/Pager";
import { describeActivityError } from "./activity";
import type { ActivityFailure } from "./activity";
import {
  CALL_GROUPS, connectRate, fetchDialer, outcomeLabel, talk, talkTime,
} from "./dialer";
import type { CallGroup, CallRow, Dialer, QueueRow } from "./dialer";

/**
 * The Dialer, as two pages off one RPC: a call log and a queue worklist.
 *
 * ── WHAT THE DATA CAN AND CANNOT SAY ────────────────────────────────────────
 * `<tenant>.calls` is written by the dialer app; `<tenant>.call_queue` by the
 * extension's queue button. Both are tenant-only, so a personal workspace gets
 * an explanation rather than an empty dashboard.
 *
 * Status comes from a CHECK constraint with six values, which the SQL groups
 * into four: connected (answered/completed), missed (no_answer), errored
 * (failed) and in_flight (initiated/ringing). The connect rate excludes
 * errored and in_flight, because a carrier fault is not a person declining and
 * a ringing call has no outcome yet.
 *
 * There is no email or InMail table anywhere in the schema, so "contacted"
 * here means called. The copy says so instead of implying full coverage.
 */

const WINDOWS = [7, 30, 90] as const;
const PAGE = 25;

type Section = "calls" | "queue";

type Load =
  | { s: "loading" }
  | { s: "ready"; data: Dialer }
  | { s: "error"; failure: ActivityFailure };

export function DialerPage({ section }: { section: Section }) {
  const [days, setDays] = useState<number>(30);
  const [view, setView] = useState<"mine" | "team">("mine");
  const [group, setGroup] = useState<CallGroup | "">("");
  const [offset, setOffset] = useState(0);
  const [load, setLoad] = useState<Load>({ s: "loading" });

  /* Any change to what is being counted resets to page 1. Staying on page 4
     while the filter shrinks the set to 12 rows shows an empty table and reads
     as a bug. */
  useEffect(() => { setOffset(0); }, [days, view, group, section]);

  useEffect(() => {
    let live = true;
    setLoad((prev) => (prev.s === "ready" ? prev : { s: "loading" }));
    fetchDialer({ days, view, section, limit: PAGE, offset, group })
      .then((data) => { if (live) setLoad({ s: "ready", data }); })
      .catch((err: unknown) => {
        if (live) setLoad({ s: "error", failure: describeActivityError(err) });
      });
    return () => { live = false; };
  }, [days, view, section, offset, group]);

  if (load.s === "loading") return <Frame section={section}><Skeleton /></Frame>;

  if (load.s === "error") {
    return (
      <Frame section={section}>
        <div className="ex-note ex-note-bad" role="alert">
          <p className="ex-note-head">
            {load.failure.kind === "not-deployed" ? "Not available yet" : "Could not load"}
          </p>
          <p className="ex-note-body">
            {load.failure.kind === "not-deployed"
              ? "This page reads dialer_activity(), which is not in the database yet. Apply Superhyre-Extension/supabase/05_console.sql to the project, then reload."
              : load.failure.message}
          </p>
        </div>
      </Frame>
    );
  }

  const d = load.data;

  /* A personal workspace has neither table. Saying so beats four zeros. */
  if (!d.tracked) {
    return (
      <Frame section={section}>
        <div className="ex-note">
          <p className="ex-note-head">The dialer is a team feature</p>
          <p className="ex-note-body">
            Calls and the call queue live in your team workspace. This account is
            a personal workspace, so there is no telephony attached to it yet.
            When a colleague signs up on your email domain, SuperHyre creates a
            shared workspace and the dialer becomes available.
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame section={section}>
      <div className="ex-controls">
        {section === "calls" && (
          <Segmented
            label="Window"
            options={WINDOWS.map((n) => ({ value: String(n), label: `${n}d` }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
          />
        )}
        {d.can_view_team && (
          <Segmented
            label="Scope"
            options={[{ value: "mine", label: "Mine" }, { value: "team", label: "Team" }]}
            value={view}
            onChange={(v) => setView(v === "team" ? "team" : "mine")}
          />
        )}
        {section === "calls" && (
          <Segmented
            label="Outcome"
            options={[
              { value: "", label: "All" },
              { value: "connected", label: "Connected" },
              { value: "missed", label: "Missed" },
              { value: "errored", label: "Failed" },
            ]}
            value={group}
            onChange={(v) => setGroup(CALL_GROUPS.includes(v as CallGroup) ? (v as CallGroup) : "")}
          />
        )}
      </div>

      {section === "calls" ? <CallsSection d={d} onPage={setOffset} group={group} />
                           : <QueueSection d={d} offset={offset} onPage={setOffset} />}
    </Frame>
  );
}

function Frame({ section, children }: { section: Section; children: React.ReactNode }) {
  return (
    <div className="con-page con-page-wide">
      <h1 className="con-h1">{section === "calls" ? "Call history" : "Call queue"}</h1>
      <p className="con-lede">
        {section === "calls"
          ? "Every call the dialer placed or received, newest first."
          : "Who is waiting to be called, in the order the dialer will work through them."}
      </p>
      {children}
    </div>
  );
}

/* ── calls ───────────────────────────────────────────────────────────── */

/* `offset` is read off the payload rather than passed in: the pager must
   describe the rows that are actually on screen, and local state can be one
   render ahead of the fetch that answered it. */
function CallsSection({ d, onPage, group }: {
  d: Dialer; onPage: (n: number) => void; group: CallGroup | "";
}) {
  const rate = connectRate(d.stats);
  const avg = d.stats.connected > 0
    ? Math.round(d.stats.talk_seconds / d.stats.connected)
    : 0;

  return (
    <>
      {/* Four tiles: volume, effectiveness, effort, and the thing that is
          wrong. Not five. */}
      <div className="ex-tiles">
        <Tile
          label={`Calls · last ${d.days}d`}
          value={d.stats.total}
          note={d.stats.inbound > 0
            ? `${fmt(d.stats.outbound)} out, ${fmt(d.stats.inbound)} in`
            : `${fmt(d.stats.people)} people reached for`}
        />
        <Tile
          label={`Connected · last ${d.days}d`}
          value={
            rate.attempts === 0 ? "none yet"
            : rate.pct === null ? `${fmt(rate.hits)} of ${fmt(rate.attempts)}`
            : `${rate.pct}%`
          }
          note={
            rate.attempts === 0 ? "no completed attempts"
            : rate.pct === null ? "too few calls for a rate"
            : `${fmt(rate.hits)} of ${fmt(rate.attempts)} answered`
          }
        />
        <Tile
          label={`Talk time · last ${d.days}d`}
          value={talkTime(d.stats.talk_seconds)}
          note={avg > 0 ? `${talkTime(avg)} average per call` : "nothing connected yet"}
        />
        {/* Errored is our telephony breaking, so it outranks a vanity total
            when it is non-zero. */}
        <Tile
          label={d.stats.errored > 0 ? "Failed to connect" : "Waiting in queue"}
          value={d.stats.errored > 0 ? d.stats.errored : (d.queue.tracked ? d.queue.total : 0)}
          note={d.stats.errored > 0
            ? "carrier rejected the call"
            : d.queue.tracked && d.queue.overdue > 0
              ? `${fmt(d.queue.overdue)} past due`
              : "nothing overdue"}
        />
      </div>

      <Trend d={d} />

      <section className="ex-sec">
        <div className="ex-sec-head">
          <h2 className="ex-sec-title">
            {group === "" ? "All calls" : `${label(group)} calls`}
            {d.calls.total > 0 && <span className="ex-sec-count">{fmt(d.calls.total)}</span>}
          </h2>
        </div>

        {d.calls.rows.length === 0 ? (
          <div className="ex-note">
            <p className="ex-note-body">
              {group === ""
                ? `No calls in the last ${d.days} days. Try a wider window.`
                : `No ${label(group).toLowerCase()} calls in the last ${d.days} days.`}
            </p>
          </div>
        ) : (
          <>
            <div className="ex-table-wrap">
              <table className="ex-table dl-table">
                <thead>
                  <tr>
                    <th scope="col">Candidate</th>
                    <th scope="col">Company</th>
                    <th scope="col">Call</th>
                    {d.view === "team" && <th scope="col">Caller</th>}
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {d.calls.rows.map((c) => <CallRowView key={c.call_id} c={c} team={d.view === "team"} />)}
                </tbody>
              </table>
            </div>
            <Pager
              offset={d.calls.offset}
              limit={d.calls.limit}
              total={d.calls.total}
              onChange={onPage}
              unit="calls"
            />
          </>
        )}
      </section>
    </>
  );
}

/*
 * Two-deep cells: name over number, company over role. Three headers carry six
 * fields, which is how the table stays inside the panel instead of becoming a
 * horizontal scroll. An absent value is an explicit "not recorded", never a
 * blank cell, because a blank reads as a loading bug.
 */
function CallRowView({ c, team }: { c: CallRow; team: boolean }) {
  return (
    <tr>
      <td className="ex-cell-name">
        {c.full_name ? (
          <>
            <span className="dl-who" title={c.full_name}>{c.full_name}</span>
            <span className="dl-role dl-phone-sub">{c.phone}</span>
          </>
        ) : (
          /* calls.candidate_id is nullable: a recruiter can dial a number that
             was never saved. The number IS the identity, so it takes the
             primary line and the absence is stated on the second. */
          <>
            <span className="dl-who dl-phone-lead">{c.phone}</span>
            <span className="dl-role">Not a saved candidate</span>
          </>
        )}
      </td>
      <td className="ex-cell-role">
        {c.current_company_name ? (
          <>
            <span className="dl-who" title={c.current_company_name}>{c.current_company_name}</span>
            {c.current_title && <span className="dl-role" title={c.current_title}>{c.current_title}</span>}
          </>
        ) : <span className="ex-dim">Not recorded</span>}
      </td>
      <td><Outcome c={c} /></td>
      {team && <td className="ex-cell-owner" title={c.caller ?? ""}>{c.mine ? "You" : c.caller ?? <span className="ex-dim">Unknown</span>}</td>}
      <td className="ex-cell-when">{relative(c.started_at)}</td>
    </tr>
  );
}

/**
 * Direction, outcome and talk time as ONE label.
 *
 * The icon carries direction, the word carries the outcome, and talk time
 * rides in parentheses because it only means anything next to the outcome that
 * produced it. Three redundant carriers (icon, word, tint) so nothing depends
 * on colour alone.
 */
function Outcome({ c }: { c: CallRow }) {
  const note = c.outcome ?? c.notes;
  const t = talk(c.duration_seconds);
  const word = outcomeLabel(c.direction, c.group);
  return (
    <span className={`dl-out dl-out-${c.group}`}
          title={note ? `${c.status}: ${note}` : c.status}>
      {c.direction === "inbound"
        ? <ArrowDownLeft size={12} weight="bold" aria-label="Inbound" />
        : <ArrowUpRight size={12} weight="bold" aria-label="Outbound" />}
      <span className="dl-out-label">{word}</span>
      {t && <span className="dl-out-talk">({t})</span>}
    </span>
  );
}

/* ── queue ───────────────────────────────────────────────────────────── */

function QueueSection({ d, offset, onPage }: {
  d: Dialer; offset: number; onPage: (n: number) => void;
}) {
  if (!d.queue.tracked) return null;
  const q = d.queue;

  if (q.total === 0) {
    return (
      <div className="ex-note">
        <p className="ex-note-head">Nothing queued</p>
        <p className="ex-note-body">
          The queue fills from the extension: open a LinkedIn profile, save the
          person, then use Add to call queue. Anything waiting appears here in
          priority order.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Three, not four. `Done` and `Skipped` as separate tiles are both 0
          until someone works the queue, and two dead tiles is padding. Merged
          into one burn-down figure, which is what a queue counter is for: how
          much of the stack has been drawn from. */}
      <div className="ex-tiles" data-n="3">
        <Tile label="Waiting" value={q.total}
              note={`${fmt(q.queued)} queued, ${fmt(q.in_progress)} in progress`} />
        <Tile label="Past due" value={q.overdue}
              note={q.overdue === 0 ? "nothing overdue" : "oldest first below"} />
        <Tile label="Worked through" value={q.done + q.skipped}
              note={q.done + q.skipped === 0
                ? "none yet"
                : `${fmt(q.done)} done, ${fmt(q.skipped)} skipped`} />
      </div>

      <section className="ex-sec">
        <div className="ex-sec-head">
          <h2 className="ex-sec-title">
            Up next<span className="ex-sec-count">{fmt(q.total)}</span>
          </h2>
          <p className="ex-sec-sub">Highest priority first, then by due date</p>
        </div>

        <div className="ex-table-wrap">
          <table className="ex-table dl-table">
            <thead>
              <tr>
                <th scope="col">Who</th>
                <th scope="col">Number</th>
                <th scope="col" className="dl-num">Priority</th>
                <th scope="col">Due</th>
                <th scope="col">State</th>
                {d.view === "team" && <th scope="col">Assigned</th>}
              </tr>
            </thead>
            <tbody>
              {q.next.map((r) => <QueueRowView key={r.queue_id} r={r} team={d.view === "team"} />)}
            </tbody>
          </table>
        </div>

        <Pager offset={offset} limit={d.calls.limit} total={q.total}
               onChange={onPage} unit="in the queue" />
      </section>
    </>
  );
}

function QueueRowView({ r, team }: { r: QueueRow; team: boolean }) {
  const role = [r.current_title, r.current_company_name].filter(Boolean).join(" at ");
  return (
    <tr className={r.overdue ? "is-overdue" : undefined}>
      <td className="ex-cell-name" title={role ? `${r.full_name} — ${role}` : r.full_name}>
        <span className="dl-who">{r.full_name}</span>
        {role && <span className="dl-role">{role}</span>}
      </td>
      <td className="dl-phone">{r.phone ?? <span className="ex-dim">no number</span>}</td>
      <td className="dl-num">{r.priority}</td>
      <td className="ex-cell-when">
        {r.due_at === null
          ? <span className="ex-dim">no date</span>
          : <span className={r.overdue ? "dl-due-late" : undefined}>
              {r.overdue && <WarningCircle size={12} weight="bold" aria-hidden="true" />}
              {relative(r.due_at)}
            </span>}
      </td>
      <td>
        <span className="ex-stage-tag">{r.status === "in_progress" ? "in progress" : "queued"}</span>
      </td>
      {team && <td className="ex-cell-owner" title={r.assignee ?? ""}>{r.mine ? "You" : r.assignee ?? <span className="ex-dim">unassigned</span>}</td>}
    </tr>
  );
}

/* ── shared parts ────────────────────────────────────────────────────── */

function Trend({ d }: { d: Dialer }) {
  if (d.daily.length < 14) return null;
  const max = d.daily.reduce((m, x) => Math.max(m, x.calls), 0);
  const active = d.daily.filter((x) => x.calls > 0).length;

  return (
    <section className="ex-sec">
      <div className="ex-sec-head">
        <h2 className="ex-sec-title">Calls per day</h2>
        <p className="ex-sec-sub">
          {active} active {active === 1 ? "day" : "days"} of {d.daily.length}
          {max > 0 ? `, busiest ${fmt(max)}` : ""}
        </p>
      </div>
      <div className="ex-bars" role="img"
           aria-label={`Calls per day over the last ${d.days} days. ${active} of ${d.daily.length} days had calls. Busiest day ${max}.`}>
        {d.daily.map((x) => (
          <span key={x.day}
                className={`ex-bar${x.calls === 0 ? " is-zero" : ""}`}
                style={{ ["--h" as string]: max > 0 ? `${Math.max((x.calls / max) * 100, x.calls > 0 ? 6 : 0)}%` : "0%" }}
                title={`${x.day}: ${x.calls} ${x.calls === 1 ? "call" : "calls"}, ${x.connected} connected`} />
        ))}
      </div>
    </section>
  );
}

function Tile({ label: l, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="ex-tile">
      <span className="ex-tile-label">{l}</span>
      <span className="ex-tile-value">{typeof value === "number" ? fmt(value) : value}</span>
      <span className="ex-tile-note">{note}</span>
    </div>
  );
}

function Segmented({ label: l, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="ex-seg" role="group" aria-label={l}>
      {options.map((o) => (
        <button key={o.value} type="button"
                className={`ex-seg-btn${o.value === value ? " is-on" : ""}`}
                aria-pressed={o.value === value}
                onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="ex-tiles" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="ex-tile" key={i}>
            <span className="ex-sk ex-sk-label" />
            <span className="ex-sk ex-sk-value" />
            <span className="ex-sk ex-sk-note" />
          </div>
        ))}
      </div>
      <div className="ex-sec" aria-hidden="true">
        <span className="ex-sk ex-sk-title" />
        <div className="ex-sk ex-sk-chart" />
      </div>
      <p className="sr-only" role="status">Loading your call activity</p>
    </>
  );
}

function label(g: CallGroup): string {
  return g === "connected" ? "Connected"
       : g === "missed" ? "No answer"
       : g === "errored" ? "Failed"
       : "In progress";
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function relative(iso: string | null): string {
  if (iso === null) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const future = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60000);
  if (mins < 1) return "just now";
  const wrap = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (mins < 60) return wrap(`${mins}m`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return wrap(`${hours}h`);
  const days = Math.floor(hours / 24);
  if (days <= 7) return wrap(`${days}d`);
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

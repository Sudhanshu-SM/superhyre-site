import {
  ArrowDownLeft, ArrowUpRight, CaretDown, FileText, SpeakerHigh, WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Pager } from "./components/Pager";
import { describeActivityError } from "./activity";
import type { ActivityFailure } from "./activity";
import {
  CALL_GROUPS, connectRate, fetchCallDetail, fetchDialer, outcomeLabel,
  signRecording, talk, talkTime,
} from "./dialer";
import type {
  CallDetail, CallGroup, CallRow, Dialer, QueueRow, RecordingLink, Segment,
} from "./dialer";

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
            <p className="ex-note-body">{emptyCalls(d, group)}</p>
          </div>
        ) : (
          <>
            <div className="ex-table-wrap">
              <table className="ex-table dl-table dl-calls">
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
                  {d.calls.rows.map((c) => (
                    <CallRowView key={c.call_id} c={c} team={d.view === "team"}
                                 cols={d.view === "team" ? 5 : 4} />
                  ))}
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
 *
 * A row with a recording or a transcript expands in place. Inline rather than a
 * modal: reading a transcript is not a task that needs protected focus, and the
 * reference rules are blunt that a modal is usually laziness. The detail is
 * fetched on open, never with the list.
 */
function CallRowView({ c, team, cols }: { c: CallRow; team: boolean; cols: number }) {
  const [open, setOpen] = useState(false);
  const hasDetail = c.has_recording || c.has_transcript;

  return (
    <>
      <tr className={open ? "is-open" : undefined}>
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
          ) : (
            /* NOT "Not recorded". This is the Company column, but on a page
               whose subject IS call recordings, and in a row that can carry a
               recording icon two cells to the right, "Not recorded" reads as
               "this call was not recorded". Verified against a real call that
               played 111s of audio while its Company cell said Not recorded. */
            <span className="ex-dim">No company</span>
          )}
        </td>
        <td>
          <Outcome c={c} />
          {/* Presence indicators, not per-row action buttons. Aircall shipped a
              play button on every row and then deleted it in favour of exactly
              this: show whether a call HAS media, and open it on demand. */}
          {hasDetail && (
            <button className="dl-media" onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-label={open ? "Hide call detail" : "Show call detail"}>
              {c.has_recording && <SpeakerHigh size={13} weight="bold" aria-label="Recording" />}
              {c.has_transcript && <FileText size={13} weight="bold" aria-label="Transcript" />}
              <CaretDown size={11} weight="bold" className={open ? "is-open" : undefined} aria-hidden="true" />
            </button>
          )}
        </td>
        {team && <td className="ex-cell-owner" title={c.caller ?? ""}>{c.mine ? "You" : c.caller ?? <span className="ex-dim">Unknown</span>}</td>}
        <td className="ex-cell-when">{relative(c.started_at)}</td>
      </tr>
      {open && (
        <tr className="dl-detail-row">
          {/* `cols` already counts the team column, so it IS the span. */}
          <td colSpan={cols}>
            <CallDetailPanel callId={c.call_id} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Fetched when the row opens, never with the list. */
function CallDetailPanel({ callId }: { callId: string }) {
  const [state, setState] = useState<
    { s: "loading" } | { s: "ready"; d: CallDetail } | { s: "error"; msg: string }
  >({ s: "loading" });
  // The player is owned here rather than inside Recording, because the
  // transcript needs to seek it.
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playable, setPlayable] = useState(false);

  useEffect(() => {
    let live = true;
    fetchCallDetail(callId)
      .then((d) => { if (live) setState({ s: "ready", d }); })
      .catch((e: unknown) => {
        if (live) setState({ s: "error", msg: describeActivityError(e).message });
      });
    return () => { live = false; };
  }, [callId]);

  if (state.s === "loading") {
    return <div className="dl-detail"><span className="ex-sk ex-sk-note" /></div>;
  }
  if (state.s === "error") {
    return <div className="dl-detail"><p className="ex-note-body">{state.msg}</p></div>;
  }

  const d = state.d;
  return (
    <div className="dl-detail">
      <Recording bucket={d.recording_bucket} objectKey={d.recording_object_key}
                 audioRef={audio} onLoaded={() => setPlayable(true)} />
      {/* Seek is offered only once a player exists. Segment `start` is seconds
          as a float, which is exactly what audio.currentTime takes. */}
      <Transcript
        segments={d.transcript_segments}
        text={d.transcript}
        onSeek={playable
          ? (secs) => {
              const el = audio.current;
              if (!el) return;
              el.currentTime = secs;
              void el.play();
            }
          : null}
      />
      {(d.outcome || d.notes) && (
        <div className="dl-detail-block">
          <span className="sh-label dl-detail-label">Outcome</span>
          <p className="dl-detail-note">{d.outcome ?? d.notes}</p>
          {d.outcome && d.notes && <p className="dl-detail-note dim">{d.notes}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The recording, if Storage will give us one.
 *
 * The pointer comes from the database; the playable URL has to come from
 * Storage and is minted on click, not on render, so opening a row does not fire
 * a signing request for audio nobody asked to hear.
 */
function Recording({ bucket, objectKey, audioRef, onLoaded }: {
  bucket: string | null;
  objectKey: string | null;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  onLoaded: () => void;
}) {
  const [link, setLink] = useState<RecordingLink | null>(null);
  const [busy, setBusy] = useState(false);

  if (!bucket || !objectKey) return null;

  return (
    <div className="dl-detail-block">
      <span className="sh-label dl-detail-label">Recording</span>
      {link === null ? (
        <>
          <button className="ex-seg-btn dl-play" disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void signRecording(bucket, objectKey)
                      .then((r) => { setLink(r); if (r.ok) onLoaded(); })
                      .finally(() => setBusy(false));
                  }}>
            <SpeakerHigh size={14} weight="bold" aria-hidden="true" />
            {busy ? "Getting link" : "Load recording"}
          </button>
        </>
      ) : link.ok ? (
        <audio ref={audioRef} className="dl-audio" controls src={link.url} preload="none" />
      ) : (
        <>
          <p className="dl-detail-note">{link.reason}</p>
          {/* The object key moved here, from beside the Load button, once
              playback started working. It was put on the idle state when the
              bucket was unreachable and the key was the only handle anyone
              had on the file. That premise is gone: the bucket exists, signing
              succeeds and audio plays, so on the happy path this was a storage
              path shown to a recruiter for no reason. It stays on the failure
              branch, where it is the one thing that makes the error reportable. */}
          <p className="dl-detail-note dim"><code>{bucket}/{objectKey}</code></p>
        </>
      )}
    </div>
  );
}

/**
 * Timestamped utterances where the dialer supplied them, flat text otherwise.
 *
 * NO speaker labels. The dialer's parse.ts keeps only {start, end, text} out of
 * Deepgram's response, so who was talking is not in this data; printing
 * "Recruiter" beside a line would be a guess dressed as a fact.
 *
 * `onSeek` is wired only when a player is actually loaded, so a timestamp is a
 * button when it can do something and plain text when it cannot.
 */
function Transcript({ segments, text, onSeek }: {
  segments: Segment[] | null;
  text: string | null;
  onSeek: ((seconds: number) => void) | null;
}) {
  if (!segments?.length && !text) return null;
  return (
    <div className="dl-detail-block">
      <span className="sh-label dl-detail-label">Transcript</span>
      {segments?.length ? (
        <ol className="dl-turns">
          {segments.map((seg, i) => (
            <li key={i} className="dl-turn">
              {typeof seg.start === "number"
                ? (onSeek
                    ? <button className="dl-turn-at is-seek" onClick={() => onSeek(seg.start as number)}
                              title="Play from here">{clock(seg.start)}</button>
                    : <span className="dl-turn-at">{clock(seg.start)}</span>)
                : <span className="dl-turn-at" />}
              <span className="dl-turn-text">{seg.text ?? ""}</span>
            </li>
          ))}
        </ol>
      ) : (
        /* Transcribed but no utterances came back, or the tenant has no
           segments column. `transcript` is not derived from the segments, so it
           can be present when they are empty. */
        <p className="dl-detail-note dl-flat">{text}</p>
      )}
    </div>
  );
}

/** Seconds into m:ss, for a transcript timestamp. */
function clock(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
          <table className="ex-table dl-table dl-queue">
            <thead>
              <tr>
                <th scope="col">Who</th>
                <th scope="col">Number</th>
                <th scope="col">Priority</th>
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
      <td className="ex-cell-name" title={role ? `${r.full_name}, ${role}` : r.full_name}>
        <span className="dl-who">{r.full_name}</span>
        {role && <span className="dl-role">{role}</span>}
      </td>
      <td className="dl-phone">{r.phone ?? <span className="ex-dim">no number</span>}</td>
      <td><Priority n={r.priority} /></td>
      <td className="ex-cell-when">
        {r.due_at === null
          ? (
              /* States a state, not an absence. "Not scheduled" is a fact
                 about the queue entry; a dash is a fact about a missing
                 column, and grey filler of that kind reads as a row that
                 failed to load. Also sidesteps the em dash our copy rules ban
                 outright. */
              <span className="dl-unset">Not scheduled</span>
            )
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

/**
 * Priority, as a word rather than the raw integer.
 *
 * `call_queue.priority` is an int with no CHECK, and the extension writes 0 by
 * default, so the column was rendering a bare "0" -- which reads as "no
 * priority recorded" when it actually means normal. Queue and issue trackers
 * all label the ordinal instead of printing it; the number stays in the title
 * attribute for anyone who needs the exact value.
 *
 * Deliberately three bands, not six: the writer only ever produces 0 today, so
 * a six-step ramp would be inventing granularity the data does not have.
 */
function Priority({ n }: { n: number }) {
  const band = n >= 4 ? "high" : n >= 1 ? "raised" : "normal";
  const label = band === "high" ? "High" : band === "raised" ? "Raised" : "Normal";
  return (
    <span className={`dl-pri dl-pri-${band}`} title={`priority ${n}`}>{label}</span>
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

/**
 * Why the calls table is empty, which is not always the time window.
 *
 * "No calls in the last 30 days. Try a wider window." was shown to every
 * empty result, including a recruiter who has never made a call while their
 * colleagues have made plenty. Widening the window cannot help them: the
 * reason is SCOPE, not time. `dialer_activity` gates a recruiter to their own
 * calls and reports that as can_view_team: false, so say so instead of
 * offering a control that will return the same empty table however far back
 * it reaches.
 *
 * A filtered group keeps its own wording: there the filter is the obvious
 * suspect and the reader picked it themselves.
 */
export function emptyCalls(d: Dialer, group: CallGroup | ""): string {
  if (group !== "") return `No ${label(group).toLowerCase()} calls in the last ${d.days} days.`;
  if (d.view === "mine" && !d.can_view_team) {
    return `No calls of your own in the last ${d.days} days. This page shows only calls you made, so a colleague's calls and their recordings will not appear here.`;
  }
  return `No calls in the last ${d.days} days. Try a wider window.`;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function relative(iso: string | null): string {
  if (iso === null) return "\u2013";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "\u2013";
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

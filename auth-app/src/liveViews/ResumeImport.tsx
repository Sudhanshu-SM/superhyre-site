import { ArrowRight, Check } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { messageOf } from "../api/client";
import { peopleSheetApi } from "../api/peopleSheet";
import { resumeApi } from "../api/resumes";
import { useMayChangeCampaign } from "../campaignRights";
import { useCampaignRows } from "../campaignStore";
import { Loader } from "../components/Loader";
import { invalidate } from "../invalidate";
import { useToast } from "../toast";
import {
  type SheetFields,
  type Tally,
  SEE_THEM,
  carryOn,
  doneLine,
  latestRead,
  leftEarlyLine,
  progressLine,
  readAgainAfter,
  seeThemHref,
  sendBatches,
  stoppedLine,
  tally,
} from "../peopleSheet";
import {
  type ResumeFacts,
  type ResumeLine,
  type ResumeReading,
  type ResumeSeed,
  buttonFor,
  canTick,
  defaultTicks,
  fieldsToSend,
  headlineOf,
  problemFiles,
  reachLine,
  requestFor,
  retryable,
  scopeLine,
  ticksAfter,
  verdictLine,
  whatTheyDo,
} from "../resumeSheet";
import "../jd-intake.css";
import "../peopleImport.css";
import "../resumeImport.css";

/**
 * Resumes attached as Candidates, in the chat: one reading of all the files at once, then a line for each person found, ticked
 * unless they cannot be added (no way to reach them, a job description, a file that did not read), with the reason under it.
 * What is shown of each person is what the file says; the contact details are the file's own and shown only to the person who
 * attached it. A person with none can be given one here, in a field on their line, and is added with it. Nothing is written
 * until the button, and the people go to the same import a sheet's do, a batch at a time, so adding twice adds nobody twice.
 */

type Phase = "reading" | "ready" | "adding" | "done" | "failed";

export type ResumeCardView = {
  phase: Phase;
  /** The files, by name, for the line over the card while the reading is not back. */
  names: readonly string[];
  reading: ResumeReading | null;
  ticked: ReadonlySet<string>;
  /** The shortlist they go on. Absent: Candidates. */
  shortlist: { id: string; name: string } | null;
  /** The campaigns they may be put on, and the one chosen (none: Candidates alone, which is always a choice too). */
  choice: { options: ReadonlyArray<{ id: string; name: string }>; value: string | null } | null;
  /** Said under the heading (following a campaign that can't be changed). */
  note: string | null;
  /** Said when the person's words named the campaign the people went to. */
  words: string | null;
  error: string | null;
  progress: { done: number; total: number } | null;
  done: { line: string; href: string; link: string } | null;
  /** Reading again after a contact was typed or a campaign changed: what is shown is about to be replaced. */
  refreshing: boolean;
  /** One part of a card that holds other files too (liveViews/PeopleImport.tsx): the card has the first line, the destination and the button, so this draws none of them. */
  embedded?: boolean;
};

export type ResumeCardActions = {
  onTick: (key: string, on: boolean) => void;
  onTyped: (key: string, contact: string) => void;
  onShortlist: (id: string | null) => void;
  onAdd: () => void;
  onRetry: () => void;
};

/** The field on a line that has no way to reach the person: type one, and the line is read again with it. */
function TypeContact({ line, busy, onTyped }: { line: ResumeLine; busy: boolean; onTyped: (key: string, contact: string) => void }): JSX.Element {
  const [draft, setDraft] = useState("");
  const id = useId();
  return (
    <form
      className="rsm-type"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onTyped(line.key, draft.trim());
      }}
    >
      <label htmlFor={id} className="sr-only">An email, a phone number or a LinkedIn link for {line.name ?? "them"}</label>
      <input
        id={id}
        className="jd-paste ji-input rsm-type-in"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Email, phone or LinkedIn link"
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
      />
      <button type="submit" className="src-btn is-quiet mo-small" disabled={busy || !draft.trim()}>Use this</button>
    </form>
  );
}

/** What is drawn: everything it needs is in `view`, so it can be tested without a page. */
export function ResumeCard({ view, on }: { view: ResumeCardView; on: ResumeCardActions }): JSX.Element {
  const { reading, phase } = view;
  const result = useRef<HTMLParagraphElement>(null);
  const problem = useRef<HTMLParagraphElement>(null);
  const was = useRef(phase);
  /* Focus goes with the work: to the line that says how adding went, once it ends. */
  useEffect(() => {
    if (was.current === "adding") (phase === "done" ? result : problem).current?.focus();
    was.current = phase;
  }, [phase]);

  const scope = view.embedded ? null : <p className="pi-scope t-body-sm">{scopeLine((reading?.files ?? view.names.map((name) => ({ name }))).slice(0, 20))}</p>;
  if (phase === "reading" && !reading) {
    const n = view.names.length;
    return <div className="pi">{scope}<p className="pi-busy t-body" role="status"><Loader size="sm" />Reading {n === 1 ? view.names[0] : `${n} resumes`}. This takes a few seconds.</p></div>;
  }
  if (!reading) {
    return (
      <div className="pi-fail">
        {scope}
        <p className="t-body" role="alert">{view.error ?? "I couldn't read those files."}</p>
        <div className="pi-row"><button type="button" className="src-btn is-quiet mo-small" onClick={on.onRetry}>Try again</button></div>
      </div>
    );
  }

  const shortlistName = view.shortlist?.name ?? null;
  const busy = phase === "adding" || view.refreshing;
  const label = buttonFor(reading, view.ticked, shortlistName);
  const problems = problemFiles(reading);
  const again = retryable(reading).length > 0;
  const addable = reading.lines.some(canTick);

  return (
    <div className="pi" aria-busy={phase === "adding" || undefined}>
      {scope}
      <h3 className="pi-h">{headlineOf(reading)}</h3>
      {view.words && <p className="pi-note t-body-sm">{view.words}</p>}
      {view.refreshing && <p className="pi-upd t-caption" role="status"><Loader size="sm" />Reading again</p>}
      {view.note && <p className="pi-note t-body-sm">{view.note}</p>}

      {problems.length > 0 && (
        <div className="pi-left" role="status">
          <p className="pi-left-h t-label">Left out</p>
          <ul>{problems.map((f) => <li key={f.id} className="t-body-sm">{f.reason}</li>)}</ul>
          {again && <button type="button" className="src-btn is-quiet mo-small rsm-again" disabled={busy} onClick={on.onRetry}>Try the others again</button>}
        </div>
      )}

      {reading.lines.length > 0 && (
        <ul className="rsm-lines" aria-label="People in the files">
          {reading.lines.map((l) => {
            const sub = `${l.key}-sub`;
            const can = canTick(l);
            const does = whatTheyDo(l);
            const verdict = verdictLine(l, shortlistName);
            const reach = reachLine(l.fields);
            return (
              <li key={l.key} className="rsm-line">
                <label className={`pi-tick${can ? "" : " rsm-off"}`}>
                  <input type="checkbox" checked={view.ticked.has(l.key) && can} disabled={!can || busy} aria-describedby={sub} onChange={(e) => on.onTick(l.key, e.target.checked)} />
                  <span className="rsm-who">
                    <b className="rsm-name">{l.name ?? l.file}</b>
                    {does && <small className="t-caption"> {does}</small>}
                  </span>
                </label>
                <div className="rsm-sub" id={sub}>
                  {reach && <p className="t-caption rsm-reach">{reach}</p>}
                  {verdict && <p className="t-caption">{verdict}</p>}
                  {l.why && <p className={`t-caption${l.state === "same" ? "" : " rsm-look"}`}>{l.why}</p>}
                  {l.state === "no-contact" && <TypeContact line={l} busy={busy} onTyped={on.onTyped} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view.choice && phase !== "done" && !view.embedded && (
        <label className="pi-pick t-body-sm">
          <span>Also put them on a campaign</span>
          <select className="pi-sel" value={view.choice.value ?? ""} disabled={busy} onChange={(e) => on.onShortlist(e.target.value || null)}>
            <option value="">No, just Candidates</option>
            {view.choice.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {view.embedded ? null : phase === "done" && view.done ? (
        <footer className="pi-foot is-done">
          <p ref={result} tabIndex={-1} className="pi-done t-body" role="status"><Check size={14} weight="bold" aria-hidden="true" />{view.done.line}</p>
          <a className="cn-link" href={view.done.href}>{view.done.link}</a>
        </footer>
      ) : (
        <footer className="pi-foot">
          {label ? (
            <button type="button" className="src-btn is-primary mo-small" disabled={busy} onClick={on.onAdd}>
              {phase === "adding" ? <><Loader size="sm" tone="inherit" />Adding</> : <>{label}<ArrowRight size={13} weight="bold" aria-hidden="true" /></>}
            </button>
          ) : (
            <p className="pi-none t-body">
              {addable ? "Tick the people to add." : reading.lines.length ? "Nobody here can be added yet. Type an email, a phone number or a LinkedIn link for them above." : "There is nobody to add. Try other files."}
            </p>
          )}
          {view.progress && (
            <div className="pi-progress" role="progressbar" aria-valuemin={0} aria-valuemax={view.progress.total} aria-valuenow={view.progress.done} aria-valuetext={progressLine(view.progress.done, view.progress.total)} aria-label="Adding">
              <span className="pi-progress-t t-body-sm">{progressLine(view.progress.done, view.progress.total)}</span>
              <span className="ji-bar" aria-hidden="true"><span style={{ width: `${Math.round((view.progress.done / Math.max(1, view.progress.total)) * 100)}%` }} /></span>
            </div>
          )}
        </footer>
      )}
      {view.error && <p ref={problem} tabIndex={-1} className="pi-err t-body-sm" role="alert">{view.error}</p>}
    </div>
  );
}

const NOBODY: Tally = { added: 0, already: 0, failed: 0 };

/* ── the resumes, read ── */

/**
 * The reading of the resumes and the ticks on the people found, for the card that adds them alone and for the part of a card that
 * adds them beside sheets. One reading of all the files at once, again when the campaign they go to changes (who is already on its
 * shortlist changes with it), when a contact is typed, and when `again` counts up (an adding stopped short, so who is left is read).
 */
export function useResumeReading(seeds: readonly ResumeSeed[], shortlistId: string | null, again = 0) {
  const [reading, setReading] = useState<ResumeReading | null>(null);
  const [phase, setPhase] = useState<"reading" | "ready" | "failed">("reading");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [readError, setReadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reads] = useState(() => latestRead());
  /* What the assistant read of each file, sent back with every later reading so a file is read once; what was typed for a line;
     and which lines the person has already seen, so their ticks stay as they left them. */
  const facts = useRef<Record<string, ResumeFacts>>({});
  const typed = useRef<Record<string, string>>({});
  const known = useRef<ReadonlySet<string>>(new Set());
  /* Lines the person has just given a contact: they are ticked when the reading comes back with them ready. */
  const fresh = useRef<Set<string>>(new Set());
  const ticks = useRef(ticked);
  ticks.current = ticked;

  /* One reading at a time: a newer one (a contact typed, a campaign changed) replaces the one before it. */
  const load = (forCampaign: string | null) => {
    const read = reads.begin();
    setReadError(null);
    setRefreshing(true);
    resumeApi.read(requestFor(seeds, { campaignId: forCampaign, read: facts.current, typed: typed.current }), read.signal).then(
      (got) => {
        if (!read.current()) return;
        facts.current = { ...facts.current, ...got.read };
        const next = known.current.size ? ticksAfter(got, ticks.current, known.current) : defaultTicks(got);
        for (const l of got.lines) if (fresh.current.has(l.key) && canTick(l)) next.add(l.key);
        fresh.current.clear();
        setTicked(next);
        known.current = new Set(got.lines.map((l) => l.key));
        setReading(got);
        setPhase((p) => (p === "reading" || p === "failed" ? "ready" : p));
        setRefreshing(false);
      },
      (e: unknown) => {
        if (!read.current()) return;
        setReadError(messageOf(e));
        setRefreshing(false);
        setPhase((p) => (p === "reading" ? "failed" : p));
      },
    );
  };
  const loadNow = useRef(load);
  loadNow.current = load;

  useEffect(() => {
    loadNow.current(shortlistId);
  }, [shortlistId, again]);

  /* Leaving the card leaves the work: no reading is waited for. */
  useEffect(() => () => reads.stop(), [reads]);

  return {
    reading,
    phase,
    ticked,
    readError,
    refreshing,
    load,
    tick: (key: string, on: boolean) => setTicked((t) => { const next = new Set(t); if (on) next.add(key); else next.delete(key); return next; }),
    type: (key: string, contact: string) => {
      typed.current = { ...typed.current, [key]: contact };
      fresh.current.add(key);
      load(shortlistId);
    },
  };
}

/** The error line under a card that shows a reading: a later reading that failed leaves the one before it, with adding held. */
const readErrorLine = (reading: ResumeReading | null, error: string | null): string | null =>
  error ? (reading ? `I couldn't read the files again, so Add stays off until I can. ${error}` : error) : null;

/** What the resumes tell the card they sit on: the people ticked (each with the file it came from), in how many files, and whether they are still being read. */
export type ResumeReport = { people: Array<{ fields: SheetFields; file: string }>; files: number; ready: boolean; busy: boolean; stale: boolean };

/**
 * The resumes as one part of a card that holds other files too: the same lines and ticks, and none of the card's own foot. What it
 * holds ticked goes up to the card (`report`), which has the one destination and the one button.
 */
export function ResumeSection({ seeds, shortlist, again, phase, report }: {
  seeds: readonly ResumeSeed[];
  shortlist: { id: string; name: string } | null;
  /** Counts up when an adding stopped short, so the files are read again for who is left. */
  again: number;
  /** The card's phase once adding has begun: the lines are held still while it goes. */
  phase: "ready" | "adding" | "done";
  report: (r: ResumeReport) => void;
}): JSX.Element {
  const r = useResumeReading(seeds, shortlist?.id ?? null, again);
  const { reading, ticked } = r;
  useEffect(() => {
    const picked = reading ? reading.lines.filter((l) => ticked.has(l.key) && canTick(l)) : [];
    report({
      people: picked.flatMap((l) => (l.fields ? [{ fields: l.fields, file: `resume:${l.fileId}` }] : [])),
      files: new Set(picked.map((l) => l.fileId)).size,
      ready: !!reading && r.phase === "ready",
      busy: r.refreshing || r.phase === "reading",
      stale: !!reading && r.readError !== null,
    });
  }, [reading, ticked, r.phase, r.refreshing, r.readError, report]);
  const view: ResumeCardView = {
    phase: phase === "ready" ? r.phase : phase,
    names: seeds.map((s) => s.name),
    reading,
    ticked,
    shortlist,
    choice: null,
    note: null,
    words: null,
    error: readErrorLine(reading, r.readError),
    progress: null,
    done: null,
    refreshing: r.refreshing,
    embedded: true,
  };
  return <ResumeCard view={view} on={{ onTick: r.tick, onTyped: r.type, onShortlist: () => undefined, onAdd: () => undefined, onRetry: () => r.load(shortlist?.id ?? null) }} />;
}

/* ── the resumes alone, from reading to done ── */

export function ResumeImport({ seeds, focusId, focusName, words = null, onDone }: {
  seeds: readonly ResumeSeed[];
  focusId: string | null;
  focusName: string | null;
  words?: { text: string; picked: string } | null;
  /** The adding came to its end: the card lets go of its files, and leaves what it said of how it went for a card drawn again. */
  onDone?: ((done: NonNullable<ResumeCardView["done"]>) => void) | undefined;
}): JSX.Element {
  const rows = useCampaignRows();
  const toast = useToast();
  const focus = focusId ? { id: focusId, name: focusName ?? "this campaign" } : null;
  const mayChange = useMayChangeCampaign(focus?.id ?? null);
  /* Where they go. Not chosen yet (undefined): the campaign the message carried, if the person may use it, else Candidates. */
  const [pick, setPick] = useState<string | null | undefined>(undefined);
  const [stage, setStage] = useState<"ready" | "adding" | "done">("ready");
  const [halt, setHalt] = useState<string | null>(null);
  const [progress, setProgress] = useState<ResumeCardView["progress"]>(null);
  const [done, setDone] = useState<ResumeCardView["done"]>(null);
  const adding = useRef<AbortController | null>(null);
  const earlier = useRef<{ for: string | null; tally: Tally } | null>(null);

  const open_ = useMemo(() => rows.filter((r) => r.status === "active" && r.canManage !== false), [rows]);
  const focusRow = focus ? rows.find((r) => r.id === focus.id) : undefined;
  const onFocus = !!focus && mayChange && focusRow?.status !== "closed";
  const focusKey = focus?.id ?? null;
  const focusLabel = focus?.name ?? "";
  const campaigns = useMemo(() => {
    const list = open_.map((r) => ({ id: r.id, name: r.name }));
    return onFocus && focusKey && !list.some((c) => c.id === focusKey) ? [{ id: focusKey, name: focusLabel }, ...list] : list;
  }, [open_, onFocus, focusKey, focusLabel]);
  const wanted = pick === undefined ? (onFocus ? focusKey : null) : pick;
  const shortlist = wanted ? (campaigns.find((c) => c.id === wanted) ?? null) : null;
  const shortlistId = shortlist?.id ?? null;

  const r = useResumeReading(seeds, shortlistId);
  const { reading, ticked, refreshing } = r;
  const phase: Phase = stage === "ready" ? r.phase : stage;

  /* Leaving the card leaves the work: no batch is sent after the one in flight. */
  useEffect(() => () => adding.current?.abort(), []);

  const add = async () => {
    // One adding at a time: the ref answers at once, before the button has been drawn off.
    if (!reading || stage === "adding" || adding.current || refreshing) return;
    const everyone = fieldsToSend(reading, ticked);
    if (!everyone.length) return;
    const stop = new AbortController();
    adding.current = stop;
    const before = earlier.current?.for === shortlistId ? earlier.current.tally : NOBODY;
    setStage("adding");
    setHalt(null);
    setProgress({ done: 0, total: everyone.length });
    const run = await sendBatches(everyone, (batch) => peopleSheetApi.send(batch, shortlistId, stop.signal), {
      signal: stop.signal,
      onProgress: (sent) => { if (!stop.signal.aborted) setProgress({ done: sent, total: everyone.length }); },
    });
    if (adding.current === stop) adding.current = null;
    if (run.parts.length) invalidate(["pipeline", "candidates", "campaign"], shortlistId ? { campaignId: shortlistId } : {});
    // The card was left, so the page says how far it got, in a line that stays; the card has nobody to tell.
    if (run.stopped) { if (run.sent) toast(leftEarlyLine(run.sent, everyone.length), "error"); return; }
    const now = carryOn(before, tally(run.parts));
    setProgress(null);
    if (run.failure) {
      earlier.current = { for: shortlistId, tally: now };
      setStage("ready");
      setHalt(stoppedLine(messageOf(run.failure.error), now));
      // Who is left is read again, so the button and the numbers are true before it goes on (not when nobody went in).
      if (readAgainAfter(run)) r.load(shortlistId);
      return;
    }
    const said = { line: doneLine(now, shortlist?.name ?? null), href: seeThemHref(shortlistId), link: SEE_THEM(shortlistId) };
    setDone(said);
    setStage("done");
    onDone?.(said);
  };

  const view: ResumeCardView = {
    phase,
    names: seeds.map((s) => s.name),
    reading,
    ticked,
    shortlist,
    choice: campaigns.length ? { options: campaigns, value: shortlistId } : null,
    note: focus && !onFocus
      ? mayChange ? `${focus.name} is closed, so I'll add them to Candidates.` : `You follow ${focus.name} but are not on it, so I'll add them to Candidates.`
      : null,
    words: words ? `Your note stays in the chat. I used it to pick ${words.picked}.` : null,
    error: [halt, readErrorLine(reading, r.readError)].filter(Boolean).join(" ") || null,
    progress,
    done,
    refreshing,
  };
  return (
    <ResumeCard
      view={view}
      on={{
        onTick: r.tick,
        onTyped: r.type,
        onShortlist: (id) => { setPick(id); setHalt(null); },
        onAdd: () => { void add(); },
        onRetry: () => r.load(shortlistId),
      }}
    />
  );
}

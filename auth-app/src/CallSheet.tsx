import { ArrowBendDownRight, ArrowLeft, ArrowUpRight, Check, Pause, Play, UploadSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CallDetail, CallRow, ChoosableOutcome, RecordingLink } from "./api/calls";
import { attachTranscript, getCall, patchCall, recordingLink, removeLoggedCall, uploadRecording, CHOOSABLE_OUTCOMES } from "./api/calls";
import { createTask } from "./api/tasks";
import { LIVE, messageOf } from "./api/client";
import { clock, decodePeaks, fakePeaks, parseTranscript, readDuration } from "./callMedia";
import {
  activeLine, followTarget, initialPlayer, linkUsable, playerReducer, RATES, seekFromPointer, shouldFollow,
} from "./callPlayer";
import { useMemberList } from "./campaignStore";
import { invalidateViews } from "./invalidate";
import {
  calledByLine, callerFirstName, candidateHref, initialsOf, lengthLabel, OUTCOME_LABEL, personOf, roleWord, segmentsFromTurns,
  sideOfLine, whenLabel,
} from "./callsView";
import { fixtureDetail } from "./callsFixtures";
import { openerNow, restoreFocus, trapTab } from "./components/focusTrap";
import { Loader } from "./components/Loader";
import { Shimmer, ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { useToast } from "./toast";
import { useBackCloses } from "./ui";

/**
 * One call, in a sheet on the right: who and when, the recording with a play button and a scrubber, what it was
 * about, the transcript following the playhead, the caller's note. Nothing here is a second copy of the list's
 * line: the list says what the call was in a sentence, the sheet says it in full.
 */

const BARS = 96;
/** Past this a recording is not downloaded just to draw its shape. */
const PEAKS_MAX_BYTES = 20 * 1024 * 1024;

export type CampaignChoice = { id: string; name: string };

type Props = {
  id: string;
  /** The row it was opened from: the sheet has a name and a time while the call is read. */
  hint: CallRow;
  campaigns: readonly CampaignChoice[];
  onClose: () => void;
  /** The page's own message to move to the call before or after this one; the sheet only says arrows work. */
  full?: boolean;
};

/* ═════════════════════════ the recording ═════════════════════════ */

function useRecording(id: string, available: boolean, knownSeconds: number | null) {
  const [state, dispatch] = useReducer(playerReducer, knownSeconds ?? 0, (s) => initialPlayer(s));
  const audio = useRef<HTMLAudioElement | null>(null);
  const link = useRef<RecordingLink | null>(null);
  const relinking = useRef(false);
  const live = useRef(state);
  live.current = state;
  const [peaks, setPeaks] = useState<number[] | null>(null);

  /** A new address for the same recording, picking up where it was. */
  const relink = useCallback(async (resumeAt: number, play: boolean) => {
    const a = audio.current;
    if (!a || relinking.current) return;
    relinking.current = true;
    try {
      const next = await recordingLink(id);
      link.current = next;
      a.src = next.url;
      a.addEventListener(
        "loadedmetadata",
        () => {
          a.currentTime = resumeAt;
          a.playbackRate = live.current.rate;
          if (play) void a.play().catch(() => dispatch({ type: "pause" }));
          dispatch({ type: "relinked" });
        },
        { once: true },
      );
      a.load();
    } catch {
      dispatch({ type: "failed", message: "This recording couldn't be played. Open the call again to try once more." });
    } finally {
      relinking.current = false;
    }
  }, [id]);

  useEffect(() => {
    if (!available || !LIVE) return;
    let gone = false;
    dispatch({ type: "open" });
    (async () => {
      try {
        const l = await recordingLink(id);
        if (gone) return;
        link.current = l;
        const a = new Audio();
        a.preload = "metadata";
        a.src = l.url;
        audio.current = a;
        a.onloadedmetadata = () => dispatch({ type: "ready", duration: Number.isFinite(a.duration) ? a.duration : 0 });
        a.onended = () => dispatch({ type: "ended" });
        a.onerror = () => {
          // The address ran out (or never worked): one new one, from where it was.
          if (link.current && !linkUsable(link.current.expiresAt, Date.now())) {
            void relink(a.currentTime || 0, live.current.status === "playing");
          } else {
            dispatch({ type: "failed", message: "This recording couldn't be played." });
          }
        };
        if (l.bytes > 0 && l.bytes <= PEAKS_MAX_BYTES) {
          fetch(l.url)
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("no audio"))))
            .then((b) => decodePeaks(b, BARS))
            .then((p) => { if (!gone && p) setPeaks(p.peaks); })
            .catch(() => { /* the bars are drawn from the id instead */ });
        }
      } catch {
        if (!gone) dispatch({ type: "failed", message: "This recording couldn't be loaded." });
      }
    })();
    return () => {
      gone = true;
      const a = audio.current;
      if (a) { a.pause(); a.onloadedmetadata = a.onended = a.onerror = null; a.removeAttribute("src"); a.load(); }
      audio.current = null;
    };
  }, [id, available, relink]);

  // The clock: the audio's own time, every frame, while it plays.
  useEffect(() => {
    if (state.status !== "playing") return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a) dispatch({ type: "tick", time: a.currentTime });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.status]);

  const play = useCallback(async (from?: number) => {
    const a = audio.current;
    if (!a) return;
    if (link.current && !linkUsable(link.current.expiresAt, Date.now())) {
      await relink(from ?? a.currentTime, true);
      dispatch({ type: "seek", time: from ?? a.currentTime, play: true });
      return;
    }
    if (from !== undefined) a.currentTime = from;
    else if (live.current.status === "ended") a.currentTime = 0;
    a.playbackRate = live.current.rate;
    try {
      await a.play();
      dispatch(from !== undefined ? { type: "seek", time: from, play: true } : { type: "play" });
    } catch {
      dispatch({ type: "pause" });
    }
  }, [relink]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (live.current.status === "playing") { a.pause(); dispatch({ type: "pause" }); } else void play();
  }, [play]);

  const seek = useCallback((time: number, andPlay = false) => {
    const a = audio.current;
    if (!a) return;
    if (andPlay) { void play(time); return; }
    a.currentTime = time;
    dispatch({ type: "seek", time });
  }, [play]);

  const setRate = useCallback((rate: number) => {
    if (audio.current) audio.current.playbackRate = rate;
    dispatch({ type: "rate", rate });
  }, []);

  return { state, peaks, toggle, seek, setRate, ready: !!audio.current };
}

function Scrubber({ id, state, peaks, onSeek }: { id: string; state: { time: number; duration: number }; peaks: number[] | null; onSeek: (t: number) => void }) {
  const bars = peaks ?? fakePeaks(id, BARS);
  const wave = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const frac = state.duration ? Math.min(1, state.time / state.duration) : 0;
  const at = (clientX: number) => {
    const r = wave.current?.getBoundingClientRect();
    return r ? seekFromPointer(clientX, r.left, r.width, state.duration) : 0;
  };
  return (
    <div
      ref={wave}
      className="kl-wave"
      role="slider"
      tabIndex={0}
      aria-label="Position in the recording"
      aria-valuemin={0}
      aria-valuemax={Math.round(state.duration)}
      aria-valuenow={Math.round(state.time)}
      aria-valuetext={`${clock(state.time)} of ${clock(state.duration)}`}
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); onSeek(at(e.clientX)); }}
      onPointerMove={(e) => { if (drag.current) onSeek(at(e.clientX)); }}
      onPointerUp={() => { drag.current = false; }}
      onPointerCancel={() => { drag.current = false; }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); onSeek(state.time + 5); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onSeek(state.time - 5); }
      }}
      style={{ ["--p" as string]: frac }}
    >
      {bars.map((h, i) => (
        <i key={i} className={(i + 0.5) / bars.length <= frac ? "is-played" : ""} style={{ height: `${Math.round(h * 100)}%` }} />
      ))}
      <span className="kl-needle" aria-hidden="true" />
    </div>
  );
}

/* ═════════════════════════ adding what is missing ═════════════════════════ */

const AUDIO_EXT = /\.(mp3|m4a|wav|webm|ogg|aac|mp4)$/i;

function AddRecording({ call, onDone }: { call: CallDetail; onDone: (c: CallDetail) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") && file.type !== "video/webm" && !AUDIO_EXT.test(file.name)) {
      setError("That isn't an audio file. Use mp3, m4a, wav, ogg or webm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = URL.createObjectURL(file);
      const seconds = await readDuration(url);
      URL.revokeObjectURL(url);
      onDone(await uploadRecording(call.id, file, seconds));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kl-add">
      <button type="button" className="kl-link" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <><Loader size="sm" tone="inherit" /> Adding the recording</> : <><UploadSimple size={14} aria-hidden="true" /> Add a recording</>}
      </button>
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p className="kl-err t-body-sm" role="alert">{error}</p>}
    </div>
  );
}

function AddTranscript({ call, onDone }: { call: CallDetail; onDone: (c: CallDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [firstIsCandidate, setFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const parsed = text.trim() ? parseTranscript(text) : null;

  const take = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(txt|vtt|srt)$/i.test(f.name)) { setError("Use a .txt, .vtt or .srt file, or paste the text."); return; }
    setError(null);
    setText(await f.text());
  };

  const save = async () => {
    if (!parsed || parsed.turns.length === 0) { setError("There are no lines in that text yet. Try \"Name: what they said\", one to a line."); return; }
    setBusy(true);
    setError(null);
    try {
      const seconds = call.recording.seconds ?? call.durationSeconds ?? 0;
      onDone(await attachTranscript(call.id, segmentsFromTurns(parsed.turns, { seconds, firstIsCandidate })));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="kl-add">
        <button type="button" className="kl-link" onClick={() => setOpen(true)}><UploadSimple size={14} aria-hidden="true" /> Add a transcript</button>
      </div>
    );
  }
  return (
    <div className="kl-form">
      <label className="kl-field">
        <span className="t-label">Paste the transcript</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"[00:04] Priya: Hi Asha, is now a good time?\n[00:09] Asha: Yes, go ahead."} />
      </label>
      <div className="kl-form-row">
        <button type="button" className="kl-link" onClick={() => file.current?.click()}>or choose a file</button>
        <input ref={file} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
        {parsed && parsed.speakers.length > 0 && (
          <label className="kl-check t-body-sm">
            <input type="checkbox" checked={firstIsCandidate} onChange={(e) => setFirst(e.target.checked)} />
            {parsed.speakers[0]} is the candidate
          </label>
        )}
      </div>
      {parsed && <p className="t-body-sm kl-quiet">{parsed.turns.length} {parsed.turns.length === 1 ? "line" : "lines"} from {parsed.speakers.length} {parsed.speakers.length === 1 ? "speaker" : "speakers"}.</p>}
      {error && <p className="kl-err t-body-sm" role="alert">{error}</p>}
      <div className="kl-form-row">
        <button type="button" className="kl-btn is-primary" disabled={busy || !parsed?.turns.length} onClick={() => void save()}>{busy ? <><Loader size="sm" tone="inherit" /> Saving</> : "Save transcript"}</button>
        <button type="button" className="kl-btn" onClick={() => { setOpen(false); setText(""); setError(null); }}>Cancel</button>
      </div>
    </div>
  );
}

/* ═════════════════════════ a call logged by hand ═════════════════════════ */

/**
 * What stands where the recording and the transcript would be, for a call somebody logged by hand: nothing was recorded,
 * and that is said once and calmly. The caller can still add either, and can take the log back while nothing is on it.
 */
export function LoggedByHand({ call, editable, onDone }: { call: CallDetail; editable: boolean; onDone: (c: CallDetail) => void }) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = call.caller.mine ? "You logged" : `${callerFirstName(call.caller)} logged`;
  const remove = async () => {
    setBusy(true);
    try {
      if (LIVE) await removeLoggedCall(call.id);
      invalidateViews(["calls"]);
      toast("Taken back.");
    } catch (err) {
      toast(messageOf(err), "error");
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <section className="kl-sec kl-norec kl-byhand" aria-label="Logged by hand">
      <h3 className="kl-sec-h">Logged by hand</h3>
      <p className="t-body kl-quiet">{who} this call, so there is no recording or transcript.</p>
      {editable && (
        <>
          <AddRecording call={call} onDone={onDone} />
          <AddTranscript call={call} onDone={onDone} />
          <div className="kl-add">
            {asking ? (
              <span className="kl-form-row">
                <span className="t-body-sm kl-quiet">Take this call out of the log?</span>
                <button type="button" className="kl-link" disabled={busy} onClick={() => void remove()}>{busy ? <><Loader size="sm" tone="inherit" /> Taking it out</> : "Yes, take it out"}</button>
                <button type="button" className="kl-link" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
              </span>
            ) : (
              <button type="button" className="kl-link" onClick={() => setAsking(true)}>Take this call back</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ═════════════════════════ the next step ═════════════════════════ */

/**
 * What the call came to, as a block of its own: an arrow, "Next step" and the action under it, and a way to make
 * it a task (the person's own, on the campaign the call was for, with the candidate's name in it).
 */
function NextStep({ text, who, campaignId, candidateId }: { text: string; who: string; campaignId: string | null; candidateId: string | null }) {
  const toast = useToast();
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const make = async () => {
    setPhase("busy");
    try {
      if (LIVE) {
        await createTask({ title: `${who}: ${text}`.slice(0, 300), campaignId, dueAt: null, candidateId });
        invalidateViews(["tasks", "week"]);
      }
      setPhase("done");
    } catch (err) {
      setPhase("idle");
      toast(messageOf(err), "error");
    }
  };
  return (
    <div className="kl-next" role="group" aria-label="Next step">
      <ArrowBendDownRight className="kl-next-i" size={20} weight="bold" aria-hidden="true" />
      <div className="kl-next-b">
        <span className="kl-next-h">Next step</span>
        <span className="kl-next-t">{text}</span>
      </div>
      {phase === "done" ? (
        <span className="kl-next-done" role="status"><Check size={14} weight="bold" aria-hidden="true" /> Added to your tasks</span>
      ) : (
        <button type="button" className="kl-next-btn" disabled={phase === "busy"} onClick={() => void make()}>
          {phase === "busy" ? <><Loader size="sm" tone="inherit" /> Adding</> : "Create task"}
        </button>
      )}
    </div>
  );
}

/* ═════════════════════════ the sheet's frame ═════════════════════════ */

const EXIT_MS = 200;

/**
 * The right-hand sheet itself: the scrim, the panel, the way back and the way out, Escape, Tab kept inside while the
 * sheet covers the page, Back closing it, and focus returned to what opened it. The call's sheet and the Outreach
 * sheet are the same thing with different bodies, so they behave the same. `children` is given `leaveTo`, the way
 * to follow a link out of the sheet (its history entry is swapped, never popped after the page has moved on).
 */
export function SheetFrame({ label, backLabel, closeLabel, onClose, footer, children }: {
  label: string;
  backLabel: string;
  closeLabel: string;
  onClose: () => void;
  /** Kept at the bottom of the panel, outside the scrolling body. */
  footer?: ReactNode;
  children: (leaveTo: (href: string) => void) => ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const returnTo = useRef<Element | null>(null);
  const [leaving, setLeaving] = useState(false);

  /* Back closes the sheet. "Open candidate" is a link out of it, so it goes through the same entry. */
  const leaveTo = useBackCloses(true, () => { onClose(); });
  useEffect(() => {
    returnTo.current = openerNow();
    panel.current?.focus({ preventScroll: true });
    document.documentElement.classList.add("kl-sheet-open");
    return () => {
      document.documentElement.classList.remove("kl-sheet-open");
      restoreFocus(returnTo.current as HTMLElement | null);
    };
  }, []);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Esc closes; Tab stays inside while the sheet covers the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "Tab" && panel.current && window.matchMedia("(max-width: 1279px)").matches) trapTab(panel.current, e);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  return createPortal(
    <div className={`kl-sheet-host${leaving ? " is-leaving" : ""}`}>
      <div className="kl-scrim" onClick={close} aria-hidden="true" />
      <aside ref={panel} className="kl-sheet" role="dialog" aria-label={label} tabIndex={-1}>
        <div className="kl-sheet-bar">
          <button type="button" className="kl-icon kl-back" onClick={close} aria-label={backLabel}><ArrowLeft size={18} /></button>
          <button type="button" className="kl-icon kl-x" onClick={close} aria-label={closeLabel}><X size={16} weight="bold" /></button>
        </div>
        <div className="kl-sheet-body">{children(leaveTo)}</div>
        {footer}
      </aside>
    </div>,
    document.body,
  );
}

/* ═════════════════════════ one call's body ═════════════════════════ */

/**
 * What the sheet says about one call, from who made it to the details: the recording with its player, the summary
 * and its next step, the transcript following the playhead, the caller's note. The Outreach sheet draws the same
 * thing inside a call's card with `bare` (no caller block and no details: the card already says who, when and how it
 * went), and `focusNote` (a number that goes up) puts the cursor in the note.
 */
export function CallBody({ id, hint, campaigns, bare = false, focusNote = 0 }: {
  id: string;
  /** The row it was opened from: the body has a name and a time while the call is read. */
  hint: CallRow;
  campaigns: readonly CampaignChoice[];
  bare?: boolean;
  focusNote?: number;
}) {
  const toast = useToast();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");

  // The call, read when it opens and while its summary is still being written.
  const reads = useRef(0);
  const read = useCallback(async () => {
    const mine = ++reads.current;
    try {
      const detail = LIVE ? await getCall(id) : fixtureDetail(id);
      if (mine !== reads.current) return null;
      if (!detail) { setPhase("failed"); return null; }
      setCall(detail);
      setPhase("ready");
      return detail;
    } catch {
      if (mine === reads.current) setPhase((p) => (p === "ready" ? p : "failed"));
      return null;
    }
  }, [id]);
  useEffect(() => {
    setCall(null);
    setPhase("loading");
    void read();
  }, [read]);
  const pending = call?.summaryState === "pending";
  useEffect(() => {
    if (!pending) return;
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      void read();
      if (n >= 6) window.clearInterval(timer);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pending, read]);

  const shown: CallRow = call ?? hint;
  const seconds = call?.recording.seconds ?? shown.durationSeconds;
  const player = useRecording(id, !!call?.recording.available, seconds);
  const { state } = player;

  // Space plays or pauses, from anywhere that is not a place to type or a control of its own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || !call?.recording.available) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || (t.closest("button, a, [role=slider]") && !t.closest("[data-kl-row]")))) return;
      e.preventDefault();
      e.stopPropagation();
      player.toggle();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [call?.recording.available, player]);

  // The transcript follows the playhead, unless somebody has just scrolled it themselves.
  const box = useRef<HTMLOListElement>(null);
  const manual = useRef<number | null>(null);
  const starts = call?.segments.map((s) => s.start) ?? [];
  const started = state.time > 0 || state.status === "playing";
  const active = started ? activeLine(starts, state.time) : -1;
  useEffect(() => {
    if (state.status !== "playing" || active < 0 || !box.current || !shouldFollow(manual.current, Date.now())) return;
    const el = box.current.children[active] as HTMLElement | undefined;
    if (!el) return;
    const to = followTarget(box.current, el);
    if (to !== null) box.current.scrollTo({ top: to, behavior: "smooth" });
  }, [active, state.status]);

  const change = async (patch: Parameters<typeof patchCall>[1]) => {
    try {
      const next = await patchCall(id, patch);
      setCall(next);
      return next;
    } catch (err) {
      toast(messageOf(err), "error");
      return null;
    }
  };

  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (call && noteFor !== call.id) { setNote(call.notes ?? ""); setNoteFor(call.id); }
  }, [call, noteFor]);
  // "Add a call note" in the Outreach sheet asks for the cursor here, once the note's box is there.
  useEffect(() => {
    if (focusNote > 0 && call?.canEdit) noteBox.current?.focus();
  }, [focusNote, call?.canEdit]);
  const saveNote = async () => {
    if (!call || note.trim() === (call.notes ?? "")) return;
    setSaving(true);
    const done = await change({ notes: note });
    setSaving(false);
    if (done) { setSaved(true); window.setTimeout(() => setSaved(false), 1800); }
  };
  const dirty = Boolean(call) && note.trim() !== (call?.notes ?? "");
  const noteState = saved ? "Saved" : dirty ? "Saves when you click away" : "";
  const { members } = useMemberList();

  const name = personOf(shown);
  const length = lengthLabel(shown.durationSeconds);
  const callerRole = roleWord(members.find((m) => m.userId === shown.caller.id)?.role);
  const editable = call?.canEdit === true;
  const hasSegments = (call?.segments.length ?? 0) > 0;
  /* A call logged by hand, with nothing added to it: one calm line stands for the recording and the transcript. */
  const bareByHand = call?.byHand === true && !call.recording.available && !hasSegments && !call.transcript;

  return (
    <>
      {/* Who made the call: the first thing under the name, as a unit of its own. */}
      {!bare && (
        <section className="kl-caller" aria-label="Who called">
          <span className="kl-avatar" aria-hidden="true">{initialsOf(shown.caller.name) === "?" && shown.caller.mine ? "Y" : initialsOf(shown.caller.name)}</span>
          <span className="kl-caller-who">
            <span className="kl-caller-name">{calledByLine(shown.caller)}</span>
            {callerRole && <span className="kl-caller-role">{callerRole}</span>}
          </span>
          <span className="kl-caller-when kl-num">
            <span>{whenLabel(shown.at)}</span>
            {length && <span>{length}</span>}
          </span>
        </section>
      )}

      {phase === "loading" && (
        <ShimmerRegion label="Opening the call">
          <section className="kl-sec kl-rec" aria-hidden="true"><h3 className="kl-sec-h">Recording</h3><Shimmer h={44} r={12} /></section>
          <section className="kl-sec" aria-hidden="true"><h3 className="kl-sec-h">Summary</h3><ShimmerText lines={3} h={12} gap={8} /></section>
          <section className="kl-sec" aria-hidden="true"><h3 className="kl-sec-h">Transcript</h3><ShimmerText lines={4} h={12} gap={10} last="44%" /></section>
        </ShimmerRegion>
      )}
      {phase === "failed" && (
        <p className="t-body kl-quiet kl-pad">This call couldn't be opened. Close it and try again in a moment.</p>
      )}

      {call && (
        <>
          {bareByHand && call ? (
            <LoggedByHand call={call} editable={editable} onDone={(c) => setCall(c)} />
          ) : call.recording.available ? (
            <section className="kl-sec kl-rec" aria-label="Recording">
              <h3 className="kl-sec-h">Recording</h3>
              <div className="kl-player">
              <button
                type="button"
                className="kl-play"
                onClick={player.toggle}
                disabled={state.status === "failed" || state.status === "loading" || state.status === "idle"}
                aria-label={state.status === "playing" ? "Pause" : "Play"}
              >
                {state.status === "loading" ? <Loader size="sm" tone="inherit" /> : state.status === "playing" ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}
              </button>
              <div className="kl-player-main">
                <Scrubber id={id} state={state} peaks={player.peaks} onSeek={(t) => player.seek(t)} />
                <div className="kl-player-meta">
                  <span className="t-caption kl-num" aria-live="off">{clock(state.time)} / {clock(state.duration || seconds || 0)}</span>
                  <span className="kl-rates" role="radiogroup" aria-label="Speed">
                    {RATES.map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={state.rate === r} className={state.rate === r ? "is-on" : ""} onClick={() => player.setRate(r)}>{r}x</button>
                    ))}
                  </span>
                </div>
                {state.status === "failed" && state.message && <p className="t-body-sm kl-err" role="alert">{state.message}</p>}
              </div>
              </div>
            </section>
          ) : (
            <section className="kl-sec kl-norec" aria-label="Recording">
              <h3 className="kl-sec-h">Recording</h3>
              <p className="t-body kl-quiet">
                {call.outcome === "no_answer" || call.outcome === "failed" ? "The call wasn't answered, so there is nothing to play." : "No recording for this call."}
              </p>
              {editable && <AddRecording call={call} onDone={(c) => { setCall(c); }} />}
            </section>
          )}

          {(call.summaryDetail || call.summaryState === "pending") && (
            <section className="kl-sec" aria-label="Summary">
              <h3 className="kl-sec-h">Summary</h3>
              {call.summaryDetail ? (
                <>
                  {call.summaryDetail.text && <p className="t-body">{call.summaryDetail.text}</p>}
                  {call.summaryDetail.points.length > 0 && (
                    <ul className="kl-points">
                      {call.summaryDetail.points.map((p, i) => <li key={i} className="t-body">{p}</li>)}
                    </ul>
                  )}
                  {call.summaryDetail.nextStep && (
                    <NextStep
                      text={call.summaryDetail.nextStep}
                      who={name}
                      campaignId={call.campaign?.id ?? null}
                      candidateId={call.candidate?.id ?? null}
                    />
                  )}
                </>
              ) : (
                <p className="t-body kl-quiet kl-writing"><Loader size="sm" /> Writing the summary</p>
              )}
            </section>
          )}

          {!bareByHand && <section className="kl-sec" aria-label="Transcript">
            <h3 className="kl-sec-h">Transcript</h3>
            {hasSegments ? (
              <ol
                ref={box}
                className="kl-tx"
                onWheel={() => { manual.current = Date.now(); }}
                onTouchMove={() => { manual.current = Date.now(); }}
              >
                {call.segments.map((s, i) => {
                  const seekable = call.recording.available;
                  return (
                    <li key={i} className={`kl-line is-${sideOfLine(s.role)}${i === active ? " is-now" : ""}`}>
                      <button
                        type="button"
                        disabled={!seekable}
                        onClick={() => { manual.current = null; player.seek(s.start, true); }}
                        aria-current={i === active ? "true" : undefined}
                      >
                        <span className="kl-line-m">
                          {s.name && <span className="kl-speaker">{s.name}</span>}
                          <span className="t-caption kl-num">{clock(s.start)}</span>
                        </span>
                        <span className="t-body kl-line-t">{s.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : call.transcript ? (
              <p className="t-body kl-plain">{call.transcript}</p>
            ) : (
              <p className="t-body kl-quiet">No transcript for this call yet.</p>
            )}
            {editable && !hasSegments && !call.transcript && <AddTranscript call={call} onDone={(c) => setCall(c)} />}
          </section>}

          <section className="kl-sec" aria-label="Your note">
            <h3 className="kl-sec-h">{call.caller.mine ? "Your note" : `${callerFirstName(call.caller)}'s note`}</h3>
            {editable ? (
              <>
                <textarea
                  ref={noteBox}
                  className="kl-note"
                  rows={3}
                  value={note}
                  maxLength={4000}
                  placeholder="What to remember about this call"
                  aria-label="Note for this call"
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => void saveNote()}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void saveNote(); }}
                />
                <p className="t-caption kl-quiet kl-saved" aria-live="polite">{saving ? <><Loader size="sm" tone="inherit" /> Saving</> : noteState}</p>
              </>
            ) : (
              <p className="t-body">{call.notes ?? <span className="kl-quiet">No note.</span>}</p>
            )}
          </section>

          {!bare && (
            <section className="kl-sec kl-details" aria-label="Details">
              <h3 className="kl-sec-h">Details</h3>
              <dl className="kl-dl">
                <dt>Called by</dt>
                <dd>{shown.caller.mine ? "You" : shown.caller.name ?? "A former teammate"}{callerRole ? <span className="kl-quiet">, {callerRole}</span> : null}</dd>
                <dt>Campaign</dt>
                <dd>
                  {editable ? (
                    <select
                      aria-label="Campaign"
                      value={call.campaign?.id ?? ""}
                      onChange={(e) => void change({ campaignId: e.target.value || null })}
                    >
                      <option value="">Not on a campaign</option>
                      {call.campaign && !campaigns.some((c) => c.id === call.campaign?.id) && (
                        <option value={call.campaign.id}>{call.campaign.name}</option>
                      )}
                      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    call.campaign ? <>{call.campaign.name}{call.campaign.client ? <span className="kl-quiet">, {call.campaign.client}</span> : null}</> : <span className="kl-quiet">Not on a campaign</span>
                  )}
                </dd>
                <dt>How it went</dt>
                <dd>
                  {editable ? (
                    <select
                      aria-label="How it went"
                      value={(CHOOSABLE_OUTCOMES as readonly string[]).includes(call.outcome) ? call.outcome : ""}
                      onChange={(e) => void change({ outcome: (e.target.value || null) as ChoosableOutcome | null })}
                    >
                      {!(CHOOSABLE_OUTCOMES as readonly string[]).includes(call.outcome) && <option value="">{OUTCOME_LABEL[call.outcome]}</option>}
                      {CHOOSABLE_OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                    </select>
                  ) : OUTCOME_LABEL[call.outcome]}
                </dd>
                <dt>Time</dt>
                <dd className="kl-num">{whenLabel(call.at)}</dd>
                <dt>Length</dt>
                <dd className="kl-num">{length || <span className="kl-quiet">Not known</span>}</dd>
                <dt>Source</dt>
                <dd>{call.direction === "inbound" ? "Inbound call" : "Outbound call"}{call.byHand ? <span className="kl-quiet">, logged by hand</span> : call.recording.available ? <span className="kl-quiet">, recorded</span> : null}</dd>
              </dl>
            </section>
          )}
        </>
      )}
    </>
  );
}

/* ═════════════════════════ the call's sheet ═════════════════════════ */

export function CallSheet({ id, hint, campaigns, onClose }: Props) {
  const name = personOf(hint);
  const sub = [hint.candidate?.title, hint.candidate?.company].filter(Boolean).join(" at ");
  return (
    <SheetFrame label={`Call with ${name}`} backLabel="Back to calls" closeLabel="Close the call" onClose={onClose}>
      {(leaveTo) => (
        <>
          <header className="kl-who-head">
            <h2 className="kl-title">{name}</h2>
            {sub && <p className="t-body kl-quiet kl-ell">{sub}</p>}
            {hint.candidate && (
              <a
                className="kl-link"
                href={candidateHref(hint.candidate.id)}
                onClick={(e) => {
                  // A new tab, a window or a copied link keeps the browser's own behaviour.
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  leaveTo(candidateHref(hint.candidate!.id));
                }}
              >
                Open candidate <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            )}
          </header>
          <CallBody id={id} hint={hint} campaigns={campaigns} />
        </>
      )}
    </SheetFrame>
  );
}

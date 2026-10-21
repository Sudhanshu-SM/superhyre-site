import { ArrowRight, Check, ArrowElbowDownRight } from "@phosphor-icons/react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { attachmentApi } from "./api/agent";
import { messageOf } from "./api/client";
import { TurnContext, saveTrail, savedTrail } from "./agentThread";
import { fileRefusal, isPlainText, typeOf } from "./attachments";
import type { ReactNode } from "react";
import type { Option, Question } from "./clarify";
import { questionFor } from "./clarify";
import type { MomentCtx, MomentKind } from "./moments";
import { GUIDED } from "./moments";
import type { Phase } from "./sourcing";
import { Staged } from "./Staged";
import "./clarify.css";

/**
 * Clarified — asks what it has to, then runs the moment with the answers.
 *
 * Questions chain: each answer rewrites the request, the request is checked
 * again, and the next question (if any) is asked. Once nothing is unclear the
 * moment mounts beneath the answered lines with the rewritten request.
 */

/** `auto` says how an answer arrived without a press: remembered from an
    earlier turn, or preset from the campaign the recruiter has open. */
type Step = { q: Question; ids: readonly string[]; labels: readonly string[]; auto: false | "remember" | "preset" };


/** What the next question is for a request; the demo's reads fixtures, a connected view gives its own. */
export type Ask = (kind: MomentKind, said: string, ctx: MomentCtx) => Question | null;

export function Clarified({
  kind, ctx, ask = questionFor, children,
}: {
  kind: MomentKind;
  ctx: MomentCtx;
  /** Overrides the demo's questions, so a connected view asks about real campaigns and people. */
  ask?: Ask;
  children: (ctx: MomentCtx) => ReactNode;
}): JSX.Element {
  const turn = useContext(TurnContext);
  /* A restored turn replays its saved answers, question by question, so the
     log comes back as it was and nothing is asked twice. */
  const [trail, setTrail] = useState<readonly Step[]>(() => (turn?.restored ? replay(kind, ctx, savedTrail(turn.id), ask) : []));
  /* What the card came back with is already saved: only a change to it is written, so a replay that could
     not rebuild every step (the campaign's role still loading) never wipes what was answered. */
  const first = useRef(trail);
  useEffect(() => {
    if (turn && trail !== first.current) saveTrail(turn.id, trail.map((s) => ({ qid: s.q.id, ids: s.ids, auto: s.auto })));
  }, [trail, turn]);
  /* Presets the recruiter turned down with Change: asked normally after that. */
  const [declined, setDeclined] = useState<ReadonlySet<string>>(() => new Set());

  /* Replay the trail over the original request. */
  const resolved = useMemo(() => {
    let said = ctx.said;
    let answers: Record<string, string> = {};
    for (const s of trail) {
      const r = s.q.apply(s.ids);
      if (r.said) said = r.said;
      if (r.answers) answers = { ...answers, ...r.answers };
    }
    return { said, answers };
    // ctx.said is fixed per turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail]);

  /* A child context: the rewritten request and answers, everything else
     delegated so live values (verdicts) stay live. */
  const child = useMemo<MomentCtx>(
    () => Object.create(ctx, {
      said: { value: resolved.said, enumerable: true },
      answers: { value: resolved.answers, enumerable: true },
    }),
    [ctx, resolved],
  );

  const pending = useMemo(() => ask(kind, resolved.said, child), [ask, kind, resolved, child]);

  /* A remembered or preset answer applies itself, and says so. */
  const auto = autoAnswer(pending, ctx.prefs, declined);

  useEffect(() => {
    if (!pending || !auto) return;
    /* Once per question: StrictMode runs this effect twice in development. */
    setTrail((t) => (t.some((s) => s.q.id === pending.id) ? t : [...t, { q: pending, ids: [auto.id], labels: [auto.label], auto: auto.how }]));
    // `auto` is derived from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, ctx.prefs, declined]);

  const willAuto = !!auto;

  useEffect(() => {
    if (pending && !willAuto) ctx.onBusy(false);
  }, [pending, willAuto, ctx]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [trail, pending, grow]);

  const answer = (q: Question, ids: readonly string[], remember: boolean) => {
    const labels = labelsFor(q, ids);
    if (remember && q.remember && ids[0]) ctx.setPref(q.remember, ids[0]);
    setTrail((t) => [...t, { q, ids, labels, auto: false }]);
  };

  const change = (i: number) => {
    const step = trail[i];
    if (step?.auto === "remember" && step.q.remember) ctx.setPref(step.q.remember, "");
    if (step?.auto === "preset") setDeclined((d) => new Set(d).add(step.q.id));
    setTrail((t) => t.slice(0, i));
  };

  /* The form flow takes no typed answers in the composer: its tiles are the
     answers, so the hint points at the keys instead. */
  const hint = (q: Question) =>
    GUIDED.has(kind) ? (q.options.length ? `Press 1–${Math.min(9, q.options.length + (q.other ? 1 : 0))} to pick` : "") : "Or type your own answer below";

  const sig = trail.map((s) => `${s.q.id}=${s.ids.join("+")}`).join("|");

  return (
    <>
      {trail.map((s, i) => (s.auto === "preset" && s.q.silent ? null : s.q.step ? (
        /* One row per step: "Campaign: [Senior Backend Engineers] Change". */
        <p key={`${s.q.id}-${i}`} className="qa-step">
          <Check size={12} weight="bold" aria-hidden="true" />
          <span className="qa-step-a">
            <span className="qa-step-q">{s.q.step}:</span>
            {s.q.input ? (
              s.labels[0]?.trim()
                ? <q className="qa-quote" title={s.labels[0]}>{s.labels[0].trim()}</q>
                : <span className="qa-quote is-skip">{s.q.input.skipped ?? "Skipped"}</span>
            ) : (
              <>
                {s.labels.map((l) => <span key={l} className="qa-chip">{l}</span>)}
                {s.auto === "preset" && <span className="qa-auto">{s.q.presetNote ?? "your current campaign"}</span>}
                {s.auto === "remember" && <span className="qa-auto">as you chose earlier</span>}
              </>
            )}
          </span>
          <button type="button" className="qa-change" onClick={() => change(i)} aria-label={`Change ${s.q.step.toLowerCase()}`}>Change</button>
        </p>
      ) : (
        <div key={`${s.q.id}-${i}`} className="qa-trail">
          <p className="qa-found"><Check size={12} weight="bold" aria-hidden="true" />{s.q.found}</p>
          <p className={`qa-done${s.q.input ? " is-quote" : s.auto === "preset" ? " is-line" : ""}`}>
            <ArrowElbowDownRight size={14} aria-hidden="true" />
            {s.q.input ? (
              /* Typed answers read as a quoted line, not a pill: one line,
                 the full text on hover, Change beside it. */
              s.labels[0]?.trim()
                ? <q className="qa-quote" title={s.labels[0]}>{s.labels[0].trim()}</q>
                : <span className="qa-quote is-skip">{s.q.input.skipped ?? "Skipped"}</span>
            ) : s.auto === "preset" ? (
              /* One sentence, so it wraps as text rather than as tiles. */
              <span className="qa-auto qa-auto-line">
                Using <span className="qa-chip">{s.labels[0]}</span>, {s.q.presetNote ?? "your current campaign"}
              </span>
            ) : (
              <>
                {s.auto ? <span className="qa-auto">Using</span> : null}
                {s.labels.map((l) => <span key={l} className="qa-chip">{l}</span>)}
                {s.auto === "remember" ? <span className="qa-auto">as you chose earlier</span> : null}
              </>
            )}
            <button type="button" className="qa-change" onClick={() => change(i)}>Change</button>
          </p>
        </div>
      )))}

      {pending && !willAuto ? (
        /* Once a stepped flow is under way, the log above already says what
           is known, so the next question arrives without a finding line that
           would only restate it. */
        pending.step && trail.some((s) => s.q.step) ? (
          <Delay key={`ask-${sig}`} ms={pending.ms ?? 350} onGrow={ctx.onGrow}>
            <QuestionCard q={pending} hint={hint(pending)} keysHint={GUIDED.has(kind)} onGrow={ctx.onGrow} onAnswer={(ids, rem) => answer(pending, ids, rem)} />
          </Delay>
        ) : (
          <Staged key={`ask-${sig}`} phases={[phaseFor(pending)]} onGrow={ctx.onGrow}>
            <QuestionCard q={pending} hint={hint(pending)} keysHint={GUIDED.has(kind)} onGrow={ctx.onGrow} onAnswer={(ids, rem) => answer(pending, ids, rem)} />
          </Staged>
        )
      ) : !pending ? (
        <MomentSlot key={sig}>{children(child)}</MomentSlot>
      ) : null}
    </>
  );
}

/**
 * The answer a question already has without being asked: one remembered from earlier in the session, or
 * preset from what the campaign says (a tile's option, or for a typed answer its text, "" being nothing to
 * add). A preset the recruiter turned down with Change is asked normally.
 */
export function autoAnswer(
  q: Question | null,
  prefs: Readonly<Record<string, string>>,
  declined: ReadonlySet<string>,
): { id: string; label: string; how: "remember" | "preset" } | null {
  if (!q) return null;
  const saved = q.remember ? prefs[q.remember] : undefined;
  const remembered = saved ? q.options.find((o) => o.id === saved) : undefined;
  if (remembered) return { id: remembered.id, label: remembered.label, how: "remember" };
  if (q.preset === undefined || declined.has(q.id)) return null;
  if (q.input) return { id: q.preset, label: q.preset, how: "preset" };
  const opt = q.preset ? q.options.find((o) => o.id === q.preset) : undefined;
  return opt ? { id: opt.id, label: opt.label, how: "preset" } : null;
}

/** What the log says for an answer: the question's own line when its ids are not words (a pasted document), else the tiles' labels. */
function labelsFor(q: Question, ids: readonly string[]): string[] {
  return q.say ? [q.say(ids)] : ids.map((id) => q.options.find((o) => o.id === id)?.label ?? id);
}

/** Rebuild a trail from saved answers: each saved step is applied only
    while it is still the question the request would ask next. */
function replay(kind: MomentKind, ctx: MomentCtx, saved: readonly { qid: string; ids: readonly string[]; auto: Step["auto"] }[], ask: Ask): Step[] {
  const out: Step[] = [];
  let said = ctx.said;
  let answers: Record<string, string> = {};
  for (const s of saved) {
    const child = Object.create(ctx, { said: { value: said, enumerable: true }, answers: { value: answers, enumerable: true } }) as MomentCtx;
    const q = ask(kind, said, child);
    if (!q || q.id !== s.qid) break;
    out.push({ q, ids: s.ids, labels: labelsFor(q, s.ids), auto: s.auto });
    const r = q.apply(s.ids);
    if (r.said) said = r.said;
    if (r.answers) answers = { ...answers, ...r.answers };
  }
  return out;
}

/** Children after a short pause, with no phase line. */
function Delay({ ms, onGrow, children }: { ms: number; onGrow?: () => void; children: ReactNode }) {
  const restored = useContext(TurnContext)?.restored ?? false;
  const [on, setOn] = useState(restored);
  useEffect(() => { const t = window.setTimeout(() => setOn(true), ms); return () => window.clearTimeout(t); }, [ms]);
  useEffect(() => { if (on) onGrow?.(); }, [on, onGrow]);
  return <>{on ? children : null}</>;
}

function MomentSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const phaseFor = (q: Question): Phase => ({
  id: `q-${q.id}`,
  live: q.reading ?? "Reading your request",
  done: q.found,
  ms: q.ms ?? 800,
  steps: [q.found],
  says: "",
  /* A finding, not work: no duration beside it. */
  timed: false,
});

/* ── the question ────────────────────────────────────────────────────────── */

function QuestionCard({
  q, hint, keysHint = false, onGrow, onAnswer,
}: {
  q: Question;
  /** The card grew (a box opened inside it): the thread makes room. */
  onGrow?: () => void;
  /** The quiet line in the footer when the answer can't be remembered. */
  hint: string;
  /** The hint is about keys: shown on hover, or once a key has been used. */
  keysHint?: boolean;
  onAnswer: (ids: readonly string[], remember: boolean) => void;
}) {
  if (q.input) return <InputCard q={q} input={q.input} onAnswer={(text) => onAnswer([text], false)} />;
  if (q.document) return <DocumentCard q={q} doc={q.document} onGrow={onGrow} onAnswer={(ids) => onAnswer(ids, false)} />;
  return <TileCard q={q} hint={hint} keysHint={keysHint} onGrow={onGrow} onAnswer={onAnswer} />;
}

/** The id of the "Other" tile: not one of a question's options, so no answer can be mistaken for it. */
const OTHER_TILE = "\u0000other";

export function TileCard({
  q, hint, keysHint, onGrow, onAnswer,
}: {
  q: Question;
  hint: string;
  keysHint: boolean;
  /** The card grew (the "Other" field opened): the thread makes room. */
  onGrow?: (() => void) | undefined;
  onAnswer: (ids: readonly string[], remember: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const found = q.filter && filter.trim()
    ? q.options.filter((o) => `${o.label} ${o.meta ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : q.options;
  /* "Other" is the last tile of the question, never one of its options: choosing it opens the field below. */
  const shown = q.other && !q.multi ? [...found, { id: OTHER_TILE, label: q.other.label ?? "Other" } as Option] : found;
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLElement>(null);
  const multi = q.multi;
  const ready = multi ? picked.length >= multi.min : false;
  /* Tiles with nothing but a name sit in one wrapping row; tiles that say more about themselves are rows. */
  const chips = !q.dense && !q.filter && !multi && shown.length <= 8 && shown.every((o) => !o.meta);
  useEffect(() => { if (typing) { field.current?.focus({ preventScroll: true }); onGrow?.(); } }, [typing, onGrow]);

  const sendTyped = () => {
    if (!q.other || chosen) return;
    const value = text.trim();
    if (!value) return;
    const wrong = q.other.check?.(value) ?? null;
    if (wrong) { setProblem(wrong); return; }
    setChosen(OTHER_TILE);
    window.setTimeout(() => onAnswer([value], remember), 380);
  };

  const pick = (id: string) => {
    if (chosen) return;
    if (id === OTHER_TILE) { setTyping(true); return; }
    setTyping(false);
    if (multi) {
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= multi.max ? p : [...p, id]));
      return;
    }
    /* Single choice: the tile fills, the rest fold away, then the answer
       lands. The pause is the length of that fold, so it reads as one move. */
    setChosen(id);
    window.setTimeout(() => onAnswer([id], remember), 420);
  };

  const submit = () => {
    if (!ready || chosen) return;
    setChosen("multi");
    window.setTimeout(() => onAnswer(picked, remember), 380);
  };

  /* Number keys answer the newest open question only. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      /* Typing fields keep their keys — except an EMPTY composer, where a
         lone digit can only mean an answer to the question on screen. The
         moment anything is typed, digits type again. A ticked checkbox
         never holds keys. */
      const emptyComposer = t?.classList.contains("orc-input") && (t as HTMLTextAreaElement).value === "";
      if (t && !emptyComposer && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const open = document.querySelectorAll(".qa.is-open");
      if (open[open.length - 1] !== ref.current) return;
      const n = Number(e.key);
      if (n >= 1 && n <= shown.length) { e.preventDefault(); pick(shown[n - 1]!.id); }
      if (e.key === "Enter" && multi && !emptyComposer) { e.preventDefault(); submit(); }
      if (e.key === "Enter" && multi && emptyComposer && ready) { e.preventDefault(); submit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section ref={ref} className={`qa${chosen ? " is-answered" : " is-open"}`} aria-label="Question">
      <div className="qa-head">
        <p className="qa-ask">{q.ask}</p>
        {q.why && <p className="qa-why">{q.why}</p>}
      </div>

      {q.filter && (
        <input
          className="qa-input qa-filter"
          type="search"
          value={filter}
          placeholder={q.filter}
          aria-label={q.filter}
          autoFocus
          disabled={!!chosen}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length === 1) { e.preventDefault(); pick(shown[0]!.id); }
          }}
        />
      )}
      <ul className={`qa-opts${chips ? " is-chips" : q.dense ? " is-dense" : shown.length > 4 ? " is-many" : ""}${q.filter ? " is-scroll" : ""}`} role={multi ? "group" : "radiogroup"} aria-label={q.ask}>
        {shown.length === 0 && <li className="qa-empty">No campaign matches “{filter.trim()}”</li>}
        {shown.map((o, i) => {
          const on = multi ? picked.includes(o.id) : chosen === o.id || (o.id === OTHER_TILE && typing);
          const out = !!chosen && (multi ? !picked.includes(o.id) : chosen !== o.id);
          return (
            <li key={o.id} className={`${on ? "is-on" : ""}${out ? " is-out" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
              <button
                type="button"
                className="qa-opt"
                role={multi ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() => pick(o.id)}
                disabled={!!chosen}
              >
                <kbd className="qa-key">{i + 1}</kbd>
                <span className="qa-opt-copy">
                  <span className="qa-opt-l">{o.label}</span>
                  {o.meta && <span className="qa-opt-m">{o.meta}</span>}
                </span>
                <span className="qa-tick" aria-hidden="true"><Check size={11} weight="bold" /></span>
              </button>
            </li>
          );
        })}
      </ul>

      {typing && q.other && (
        <div className="qa-other">
          <input
            ref={field}
            className="qa-input"
            type="text"
            value={text}
            maxLength={q.other.max ?? 80}
            placeholder={q.other.placeholder}
            aria-label={`${q.ask} ${q.other.label ?? "Other"}`}
            aria-invalid={problem ? true : undefined}
            autoComplete="off"
            inputMode={q.other.numeric ? "numeric" : undefined}
            disabled={!!chosen}
            onChange={(e) => { setProblem(null); setText(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); sendTyped(); }
              if (e.key === "Escape") { e.preventDefault(); setTyping(false); setProblem(null); }
              if (q.other?.numeric && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                e.preventDefault();
                const n = Number.parseInt(text, 10);
                setProblem(null);
                setText(String(Math.max(1, (Number.isFinite(n) ? n : 0) + (e.key === "ArrowUp" ? 1 : -1))));
              }
            }}
          />
          {problem && <p className="qa-why qa-err" role="alert">{problem}</p>}
        </div>
      )}

      {/* The number keys are on the tiles, so a foot holding only the keys
          hint would be empty padding under the last option. */}
      {(q.remember || multi || typing || (hint && !keysHint)) && <div className="qa-foot">
        {q.remember ? (
          <label className="qa-remember">
            <input type="checkbox" id={`qa-rem-${q.id}`} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Use this for the rest of the session</span>
          </label>
        ) : hint ? (
          <span className={`qa-hint${keysHint ? " is-keys" : ""}`}>{hint}</span>
        ) : <span />}
        {multi && (
          <button type="button" className="src-btn is-primary mo-small" disabled={!ready || !!chosen} onClick={submit}>
            {multi.verb} {picked.length || ""}<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        )}
        {typing && !multi && (
          <button type="button" className="src-btn is-primary mo-small" disabled={!text.trim() || !!chosen} onClick={sendTyped}>
            Continue<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>}
    </section>
  );
}

/* ── a free-text answer ──────────────────────────────────────────────────── */

/**
 * One line of text, for answers no tile can hold: a role's name, the ideal
 * hire. Enter sends, Escape lets go of the field. Focus lands here only when
 * this is the newest open question, so an older card never steals it.
 */
function InputCard({
  q, input, onAnswer,
}: {
  q: Question;
  input: NonNullable<Question["input"]>;
  onAnswer: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  /* What is wrong with the text, when the question checks it: shown under the field until it is changed. */
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = !!text.trim() || !!input.optional;
  const fid = `qa-in-${q.id}`;
  const why = `qa-why-${q.id}`;
  const bad = `qa-err-${q.id}`;

  useEffect(() => {
    const open = document.querySelectorAll(".qa.is-open");
    if (open[open.length - 1] === ref.current) field.current?.focus({ preventScroll: true });
  }, []);

  const send = (value: string) => {
    if (sent) return;
    const wrong = value.trim() ? input.check?.(value.trim()) ?? null : null;
    if (wrong) { setError(wrong); return; }
    setSent(true);
    window.setTimeout(() => onAnswer(value.trim()), 240);
  };

  return (
    <section ref={ref} className={`qa${sent ? " is-answered" : " is-open"}`} aria-label="Question">
      <div className="qa-head">
        <label className="qa-ask" htmlFor={fid}>{q.ask}</label>
        {q.why && <p className="qa-why" id={why}>{q.why}</p>}
      </div>

      <textarea
        ref={field}
        id={fid}
        className={`qa-input${(input.rows ?? 1) > 1 ? " is-area" : ""}`}
        rows={input.rows ?? 1}
        value={text}
        placeholder={input.placeholder}
        maxLength={input.max ?? 280}
        autoComplete="off"
        disabled={sent}
        inputMode={input.numeric ? "numeric" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? bad : undefined}
        onChange={(e) => {
          setError(null);
          setText(e.target.value.replace(/\n/g, " "));
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight + 2}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (text.trim()) send(text);
          }
          if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); }
        }}
      />
      {error && <p className="qa-why qa-err" id={bad} role="alert">{error}</p>}

      <div className="qa-foot is-input">
        {input.optional ? (
          <button type="button" className="src-btn is-quiet mo-small" disabled={sent} onClick={() => send("")}>Skip</button>
        ) : <span />}
        <button
          type="button"
          className="src-btn is-primary mo-small"
          disabled={!ready || sent}
          aria-describedby={q.why ? why : undefined}
          onClick={() => send(text)}
        >
          {input.verb}<ArrowRight size={13} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

/* ── a document: pasted, uploaded, or left for later ─────────────────────── */

/**
 * The job description's question: three tiles. "Paste it" opens a box in the card, "Upload a file" opens the
 * file picker (a PDF or Word file is read on the server, the way the composer's attachments are; text is read
 * here), and "I'll add it later" answers with nothing. The answer is `[text, source]`.
 */
export function DocumentCard({
  q, doc, onGrow, onAnswer,
}: {
  q: Question;
  doc: NonNullable<Question["document"]>;
  onGrow?: (() => void) | undefined;
  onAnswer: (ids: readonly string[]) => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const busy = sent || reading !== null;
  const ready = text.trim().length >= doc.min;
  useEffect(() => { onGrow?.(); }, [pasting, reading, problem, onGrow]);

  const finish = (value: string, source: string) => {
    if (sent) return;
    setSent(true);
    window.setTimeout(() => onAnswer([value.trim(), source]), 240);
  };

  const pick = (id: string) => {
    if (busy) return;
    setProblem(null);
    if (id === "paste") {
      setPasting(true);
      window.setTimeout(() => area.current?.focus({ preventScroll: true }), 0);
    } else if (id === "upload") {
      picker.current?.click();
    } else {
      setChosen(id);
      finish("", "");
    }
  };

  const take = (file: File) => {
    const why = fileRefusal(file);
    if (why) { setProblem(why); return; }
    setProblem(null);
    setReading(file.name);
    const done = (got: string) => {
      setReading(null);
      const body = got.trim();
      if (!body) { setProblem(`I couldn't find any text in ${file.name}. Paste it instead.`); return; }
      setChosen("upload");
      finish(body.slice(0, doc.max), file.name);
    };
    const failed = (err: unknown) => {
      setReading(null);
      setProblem(`I couldn't read ${file.name}: ${messageOf(err)} You can paste the text instead.`);
    };
    if (isPlainText(file)) file.text().then(done, failed);
    else attachmentApi.read(file, typeOf(file)).then((r) => done(r.text), failed);
  };

  /* Number keys pick a tile, on the newest open question only, and never while typing in a field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const emptyComposer = t?.classList.contains("orc-input") && (t as HTMLTextAreaElement).value === "";
      if (t && !emptyComposer && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const open = document.querySelectorAll(".qa.is-open");
      if (open[open.length - 1] !== ref.current) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) { e.preventDefault(); pick(q.options[n - 1]!.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section ref={ref} className={`qa${sent ? " is-answered" : " is-open"}`} aria-label="Question">
      <div className="qa-head">
        <p className="qa-ask">{q.ask}</p>
        {q.why && <p className="qa-why">{q.why}</p>}
      </div>

      <ul className="qa-opts" role="radiogroup" aria-label={q.ask}>
        {q.options.map((o, i) => {
          const on = chosen === o.id || (o.id === "paste" && pasting && !chosen);
          const out = !!chosen && chosen !== o.id;
          return (
            <li key={o.id} className={`${on ? "is-on" : ""}${out ? " is-out" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
              <button type="button" className="qa-opt" role="radio" aria-checked={on} onClick={() => pick(o.id)} disabled={busy}>
                <kbd className="qa-key">{i + 1}</kbd>
                <span className="qa-opt-copy">
                  <span className="qa-opt-l">{o.label}</span>
                  {o.meta && <span className="qa-opt-m">{o.meta}</span>}
                </span>
                <span className="qa-tick" aria-hidden="true"><Check size={11} weight="bold" /></span>
              </button>
            </li>
          );
        })}
      </ul>

      <input
        ref={picker}
        type="file"
        hidden
        accept={doc.accept}
        aria-label="Job description file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) take(file);
        }}
      />

      {pasting && !sent && (
        <>
          <textarea
            ref={area}
            className="qa-input is-area is-doc"
            rows={6}
            value={text}
            placeholder={doc.placeholder}
            maxLength={doc.max}
            aria-label={doc.placeholder}
            autoComplete="off"
            onChange={(e) => { setProblem(null); setText(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) { e.preventDefault(); finish(text, ""); }
              if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); }
            }}
          />
          <div className="qa-foot is-input">
            <span />
            <button type="button" className="src-btn is-primary mo-small" disabled={!ready} onClick={() => finish(text, "")}>
              {doc.verb}<ArrowRight size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {reading && <p className="qa-why" role="status">Reading {reading}</p>}
      {problem && <p className="qa-why qa-err" role="alert">{problem}</p>}
    </section>
  );
}

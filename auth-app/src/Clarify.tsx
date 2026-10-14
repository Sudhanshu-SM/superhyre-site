import { ArrowRight, Check, ArrowElbowDownRight } from "@phosphor-icons/react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { TurnContext, saveTrail, savedTrail } from "./agentThread";
import type { ReactNode } from "react";
import type { Question } from "./clarify";
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
  useEffect(() => {
    if (turn) saveTrail(turn.id, trail.map((s) => ({ qid: s.q.id, ids: s.ids, auto: s.auto })));
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
  const autoFor = (q: Question | null): { id: string; how: "remember" | "preset" } | null => {
    if (!q) return null;
    const saved = q.remember ? ctx.prefs[q.remember] : undefined;
    if (saved && q.options.some((o) => o.id === saved)) return { id: saved, how: "remember" };
    if (q.preset && !declined.has(q.id) && q.options.some((o) => o.id === q.preset)) return { id: q.preset, how: "preset" };
    return null;
  };
  const auto = autoFor(pending);

  useEffect(() => {
    if (!pending || !auto) return;
    const opt = pending.options.find((o) => o.id === auto.id)!;
    /* Once per question: StrictMode runs this effect twice in development. */
    setTrail((t) => (t.some((s) => s.q.id === pending.id) ? t : [...t, { q: pending, ids: [opt.id], labels: [opt.label], auto: auto.how }]));
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
    const labels = ids.map((id) => q.options.find((o) => o.id === id)?.label ?? id);
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
    GUIDED.has(kind) ? (q.options.length ? `Press 1–${Math.min(9, q.options.length)} to pick` : "") : "Or type your own answer below";

  const sig = trail.map((s) => `${s.q.id}=${s.ids.join("+")}`).join("|");

  return (
    <>
      {trail.map((s, i) => (s.q.step ? (
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
                {s.auto === "preset" && <span className="qa-auto">your current campaign</span>}
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
                Using <span className="qa-chip">{s.labels[0]}</span>, your current campaign
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
            <QuestionCard q={pending} hint={hint(pending)} keysHint={GUIDED.has(kind)} onAnswer={(ids, rem) => answer(pending, ids, rem)} />
          </Delay>
        ) : (
          <Staged key={`ask-${sig}`} phases={[phaseFor(pending)]} onGrow={ctx.onGrow}>
            <QuestionCard q={pending} hint={hint(pending)} keysHint={GUIDED.has(kind)} onAnswer={(ids, rem) => answer(pending, ids, rem)} />
          </Staged>
        )
      ) : !pending ? (
        <MomentSlot key={sig}>{children(child)}</MomentSlot>
      ) : null}
    </>
  );
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
    out.push({ q, ids: s.ids, labels: s.ids.map((id) => q.options.find((o) => o.id === id)?.label ?? id), auto: s.auto });
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
  q, hint, keysHint = false, onAnswer,
}: {
  q: Question;
  /** The quiet line in the footer when the answer can't be remembered. */
  hint: string;
  /** The hint is about keys: shown on hover, or once a key has been used. */
  keysHint?: boolean;
  onAnswer: (ids: readonly string[], remember: boolean) => void;
}) {
  if (q.input) return <InputCard q={q} input={q.input} onAnswer={(text) => onAnswer([text], false)} />;
  return <TileCard q={q} hint={hint} keysHint={keysHint} onAnswer={onAnswer} />;
}

function TileCard({
  q, hint, keysHint, onAnswer,
}: {
  q: Question;
  hint: string;
  keysHint: boolean;
  onAnswer: (ids: readonly string[], remember: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = q.filter && filter.trim()
    ? q.options.filter((o) => `${o.label} ${o.meta ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : q.options;
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const multi = q.multi;
  const ready = multi ? picked.length >= multi.min : false;

  const pick = (id: string) => {
    if (chosen) return;
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
      <ul className={`qa-opts${q.dense ? " is-dense" : q.options.length > 4 ? " is-many" : ""}${q.filter ? " is-scroll" : ""}`} role={multi ? "group" : "radiogroup"} aria-label={q.ask}>
        {shown.length === 0 && <li className="qa-empty">No campaign matches “{filter.trim()}”</li>}
        {shown.map((o, i) => {
          const on = multi ? picked.includes(o.id) : chosen === o.id;
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

      {/* The number keys are on the tiles, so a foot holding only the keys
          hint would be empty padding under the last option. */}
      {(q.remember || multi || (hint && !keysHint)) && <div className="qa-foot">
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
  const ref = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = !!text.trim() || !!input.optional;
  const fid = `qa-in-${q.id}`;
  const why = `qa-why-${q.id}`;

  useEffect(() => {
    const open = document.querySelectorAll(".qa.is-open");
    if (open[open.length - 1] === ref.current) field.current?.focus({ preventScroll: true });
  }, []);

  const send = (value: string) => {
    if (sent) return;
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
        onChange={(e) => {
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

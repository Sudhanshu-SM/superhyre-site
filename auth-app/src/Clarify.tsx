import { ArrowRight, Check, ArrowElbowDownRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Question } from "./clarify";
import { questionFor } from "./clarify";
import type { MomentCtx, MomentKind } from "./moments";
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

type Step = { q: Question; ids: readonly string[]; labels: readonly string[]; auto: boolean };

export function Clarified({
  kind, ctx, children,
}: {
  kind: MomentKind;
  ctx: MomentCtx;
  children: (ctx: MomentCtx) => ReactNode;
}): JSX.Element {
  const [trail, setTrail] = useState<readonly Step[]>([]);

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

  const pending = useMemo(() => questionFor(kind, resolved.said, child), [kind, resolved, child]);

  /* A remembered answer applies itself, and says so. */
  useEffect(() => {
    if (!pending?.remember) return;
    const saved = ctx.prefs[pending.remember];
    const opt = saved ? pending.options.find((o) => o.id === saved) : undefined;
    if (opt) setTrail((t) => [...t, { q: pending, ids: [opt.id], labels: [opt.label], auto: true }]);
  }, [pending, ctx.prefs]);

  const willAuto = !!(pending?.remember && ctx.prefs[pending.remember] &&
    pending.options.some((o) => o.id === ctx.prefs[pending.remember!]));

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
    if (step?.auto && step.q.remember) ctx.setPref(step.q.remember, "");
    setTrail((t) => t.slice(0, i));
  };

  const sig = trail.map((s) => `${s.q.id}=${s.ids.join("+")}`).join("|");

  return (
    <>
      {trail.map((s, i) => (
        <div key={`${s.q.id}-${i}`} className="qa-trail">
          <p className="qa-found"><Check size={12} weight="bold" aria-hidden="true" />{s.q.found}</p>
          <p className="qa-done">
            <ArrowElbowDownRight size={14} aria-hidden="true" />
            {s.auto ? <span className="qa-auto">Using</span> : null}
            {s.labels.map((l) => <span key={l} className="qa-chip">{l}</span>)}
            {s.auto ? <span className="qa-auto">as you chose earlier</span> : null}
            <button type="button" className="qa-change" onClick={() => change(i)}>Change</button>
          </p>
        </div>
      ))}

      {pending && !willAuto ? (
        <Staged key={`ask-${sig}`} phases={[phaseFor(pending)]} onGrow={ctx.onGrow}>
          <QuestionCard q={pending} onAnswer={(ids, rem) => answer(pending, ids, rem)} />
        </Staged>
      ) : !pending ? (
        <MomentSlot key={sig}>{children(child)}</MomentSlot>
      ) : null}
    </>
  );
}

function MomentSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const phaseFor = (q: Question): Phase => ({
  id: `q-${q.id}`,
  live: "Reading your request",
  done: q.found,
  ms: 800,
  steps: [q.found],
  says: "",
});

/* ── the question ────────────────────────────────────────────────────────── */

function QuestionCard({
  q, onAnswer,
}: {
  q: Question;
  onAnswer: (ids: readonly string[], remember: boolean) => void;
}) {
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
      if (n >= 1 && n <= q.options.length) { e.preventDefault(); pick(q.options[n - 1]!.id); }
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

      <ul className={`qa-opts${q.options.length > 4 ? " is-many" : ""}`} role={multi ? "group" : "radiogroup"} aria-label={q.ask}>
        {q.options.map((o, i) => {
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

      <div className="qa-foot">
        {q.remember ? (
          <label className="qa-remember">
            <input type="checkbox" id={`qa-rem-${q.id}`} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Use this for the rest of the session</span>
          </label>
        ) : (
          <span className="qa-hint">Or type your own answer below</span>
        )}
        {multi && (
          <button type="button" className="src-btn is-primary mo-small" disabled={!ready || !!chosen} onClick={submit}>
            {multi.verb} {picked.length || ""}<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

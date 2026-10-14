import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useRef } from "react";

/**
 * Mind's side and the person's side of a turn, written straight on the canvas: no bubbles, no boxes.
 *
 * Words are typed out left to right and their leading edge fades from a pale tint to ink, as in
 * Mutiny's set-up. The answer is a line with a cursor that draws itself under the question, the same
 * type as the question, so it reads as part of the page rather than a form field.
 */

const CHAR_MS = 24;
/** How long one character takes to settle after it starts (the fade from the tint to ink). */
const SETTLE_MS = 520;
const LINE_GAP_MS = 140;

export type Piece = { chars: { c: string; em: boolean }[] };

/** "Hi, I'm *Mind*." as words, each character knowing whether it is emphasised (so "*Mind*." stays one word). */
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let cur: Piece = { chars: [] };
  let em = false;
  for (const ch of text) {
    if (ch === "*") {
      em = !em;
    } else if (/\s/.test(ch)) {
      if (cur.chars.length) out.push(cur);
      cur = { chars: [] };
    } else cur.chars.push({ c: ch, em });
  }
  if (cur.chars.length) out.push(cur);
  return out;
}

const plain = (text: string) => text.replace(/\*/g, "");

/** How long a line takes to type, in milliseconds, so the next thing can be timed to start after it. */
export const typedMs = (text: string): number => plain(text).length * CHAR_MS + SETTLE_MS;

/** The headline: one or two lines, typed one after the other. Returns when it is all on screen via `onDone`. */
export function Head({ lines, start = 0, reduce, onDone }: { lines: string[]; start?: number; reduce: boolean; onDone?: () => void }): JSX.Element {
  const done = useRef(onDone);
  done.current = onDone;
  const self = useRef<HTMLHeadingElement>(null);
  // A new question is announced: when nothing else has focus (an answer line takes it at once), the headline does.
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) self.current?.focus({ preventScroll: true });
  }, []);
  const total = lines.reduce((t, l) => t + typedMs(l) + LINE_GAP_MS, start);
  useEffect(() => {
    if (reduce) {
      done.current?.();
      return;
    }
    const t = window.setTimeout(() => done.current?.(), total - LINE_GAP_MS);
    return () => window.clearTimeout(t);
  }, [reduce, total]);

  let at = start;
  return (
    <h1 ref={self} tabIndex={-1} className={`nx-head${reduce ? " is-still" : ""}`} aria-label={lines.map(plain).join(" ")}>
      {lines.map((line, li) => {
        const lineStart = at;
        at += typedMs(line) + LINE_GAP_MS;
        let n = 0;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are fixed for a turn
          <span key={li} className="nx-hl" aria-hidden="true">
            {pieces(line).map((p, wi) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: words are fixed for a turn
              <span key={wi} className="nx-w">
                {p.chars.map((ch, ci) => {
                  const d = lineStart + n++ * CHAR_MS;
                  // biome-ignore lint/suspicious/noArrayIndexKey: characters are fixed for a turn
                  return (
                    <span key={ci} className={`nx-ch${ch.em ? " is-em" : ""}`} style={{ "--d": `${d}ms` } as CSSProperties}>
                      {ch.c}
                    </span>
                  );
                })}
                {/* the space after a word is part of it, so a line never breaks inside one */}
                <span className="nx-sp"> </span>
              </span>
            ))}
          </span>
        );
      })}
    </h1>
  );
}

/** The quiet line under the headline. It fades up after the headline is typed. */
export function Quiet({ children, delay, reduce }: { children: ReactNode; delay: number; reduce: boolean }): JSX.Element {
  return (
    <p className={`nx-quiet${reduce ? " is-still" : ""}`} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </p>
  );
}

/** Total time the headline takes, for timing what comes after it. */
export const headMs = (lines: string[]): number => lines.reduce((t, l) => t + typedMs(l) + LINE_GAP_MS, 0) - LINE_GAP_MS;

/**
 * The answer: a line with a cursor, in the same type as the question. It draws itself in under the
 * words once they are typed. A small "Continue" appears when the answer is good to send; Enter does
 * the same.
 */
export function LineInput({
  id,
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
  ok,
  delay,
  reduce,
  problem,
  inputMode,
  autoComplete = "off",
  maxLength,
  extra,
  cta = "Continue",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (el: HTMLElement | null) => void;
  placeholder: string;
  /** What the button says when the answer can be sent. */
  cta?: string;
  /** True when what is typed can be sent. */
  ok: boolean;
  delay: number;
  reduce: boolean;
  problem?: string | null;
  inputMode?: "url" | "text";
  autoComplete?: string;
  maxLength?: number;
  /** Something small beside Continue, like "Skip for now". */
  extra?: ReactNode;
}): JSX.Element {
  const box = useRef<HTMLInputElement>(null);
  // Focus at once, though the line draws in a moment later: what a quick typist types is kept.
  useEffect(() => {
    const raf = requestAnimationFrame(() => box.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(box.current);
  };

  return (
    <form className={`nx-field${reduce ? " is-still" : ""}`} style={{ "--delay": `${delay}ms` } as CSSProperties} onSubmit={submit} noValidate>
      <label className="nx-sr" htmlFor={id}>
        {label}
      </label>
      <div className="nx-line">
        <input
          ref={box}
          id={id}
          className="nx-in"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          maxLength={maxLength}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-p` : undefined}
        />
        <span className="nx-rule" aria-hidden="true" />
      </div>
      <div className="nx-under">
        {extra}
        <span id={`${id}-p`} className="nx-problem" role={problem ? "alert" : undefined}>
          {problem}
        </span>
        <button type="submit" className={`nx-go${ok ? " is-on" : ""}`} tabIndex={ok ? 0 : -1} aria-disabled={!ok}>
          {cta} <ArrowRight size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

/**
 * A larger answer, for text that is pasted (the job description): the same open line under it, a few
 * lines tall, and Continue (or Ctrl/Cmd+Enter) when it can be sent. No box.
 */
export function AreaInput({
  id,
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
  ok,
  delay,
  reduce,
  problem,
  maxLength,
  extra,
  tryable = ok,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  ok: boolean;
  delay: number;
  reduce: boolean;
  problem?: string | null;
  maxLength?: number;
  extra?: ReactNode;
  /**
   * Continue is there to press once something is typed, even when it cannot be sent yet: pressing it then
   * says what is missing (`onSubmit` sets `problem`) and puts the cursor back in the field. It is never a
   * button that is on screen and does nothing.
   */
  tryable?: boolean;
}): JSX.Element {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => box.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
    // Back in the field, so what was said is fixed where it is said (nothing moves on when it was not enough).
    if (!ok) box.current?.focus({ preventScroll: true });
  };

  return (
    <form className={`nx-field${reduce ? " is-still" : ""}`} style={{ "--delay": `${delay}ms` } as CSSProperties} onSubmit={submit} noValidate>
      <label className="nx-sr" htmlFor={id}>
        {label}
      </label>
      <div className="nx-line">
        <textarea
          ref={box}
          id={id}
          className="nx-in nx-area"
          value={value}
          rows={5}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          spellCheck
          maxLength={maxLength}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-p` : undefined}
        />
        <span className="nx-rule" aria-hidden="true" />
      </div>
      <div className="nx-under">
        {extra}
        <span id={`${id}-p`} className="nx-problem" role={problem ? "alert" : undefined}>
          {problem}
        </span>
        <button type="submit" className={`nx-go${tryable ? " is-on" : ""}`} tabIndex={tryable ? 0 : -1} aria-disabled={!tryable}>
          Continue <ArrowRight size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

/** A plain list of choices, set as lines of text that lean in when pointed at. No pills, no boxes. */
export function Options<T extends string>({ items, delay, reduce, onPick, onEnter, onLeave }: { items: { id: T; label: string; sub?: string }[]; delay: number; reduce: boolean; onPick: (id: T, el: HTMLElement) => void; onEnter?: (id: T) => void; onLeave?: () => void }): JSX.Element {
  return (
    <ul className={`nx-opts${reduce ? " is-still" : ""}`} style={{ "--delay": `${delay}ms` } as CSSProperties} onMouseLeave={onLeave}>
      {items.map((it, i) => (
        <li key={it.id} style={{ "--i": i } as CSSProperties}>
          <button type="button" className="nx-opt" onClick={(e) => onPick(it.id, e.currentTarget)} onMouseEnter={() => onEnter?.(it.id)} onFocus={() => onEnter?.(it.id)} onBlur={onLeave}>
            <span className="nx-opt-t">{it.label}</span>
            {it.sub && <span className="nx-opt-s">{it.sub}</span>}
            <ArrowRight className="nx-opt-go" size={16} weight="bold" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A small text action under the answer. */
export function TextAction({ children, onClick, back = false }: { children: ReactNode; onClick: () => void; back?: boolean }): JSX.Element {
  return (
    <button type="button" className={`nx-act${back ? " is-back" : ""}`} onClick={onClick}>
      {back && <ArrowLeft size={13} weight="bold" aria-hidden="true" />}
      {children}
    </button>
  );
}

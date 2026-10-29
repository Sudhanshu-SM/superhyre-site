import { Check } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { Choice, Question } from "../liveChat";
import "./choiceCard.css";

/**
 * The agent's question with fixed options, as one card: the question once, the options to pick from, and a single
 * Continue. An option that needs a value (a new client's name) asks for it right here, so nothing is asked in a
 * second round trip. The pick goes to the agent as the answer to this question, and the card settles on one line.
 */

/** Whether the pick is complete: enough picked, and the value typed for an option that asks for one. */
export function readyToContinue(q: Pick<Question, "choices" | "multi">, picked: readonly string[], value: string): boolean {
  const min = q.multi?.min ?? 1;
  const max = q.multi?.max ?? 1;
  if (picked.length < min || picked.length > max) return false;
  const asking = q.choices.some((c) => picked.includes(c.id) && c.input);
  return !asking || value.trim().length > 0;
}

/** What a pick does to the ones already made: one replaces, several toggle up to the most the question takes. */
export function pickChoice(q: Pick<Question, "multi">, picked: readonly string[], id: string): string[] {
  if (!q.multi) return [id];
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  return picked.length >= q.multi.max ? [...picked] : [...picked, id];
}

/** More options than this and the card has a field to find one by name, and the list scrolls inside it. */
export const SEARCHABLE = 8;

/** The options whose name has the words typed (the ones already picked stay, so a pick never vanishes from under the person). */
export function matching(choices: readonly Choice[], find: string, picked: readonly string[]): Choice[] {
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...choices];
  return choices.filter((c) => picked.includes(c.id) || words.every((w) => c.name.toLowerCase().includes(w)));
}

export function ChoiceCard({
  question, closed = false, onAnswer,
}: {
  question: Question;
  /** The chat has moved on from this question, so it can no longer be answered. */
  closed?: boolean;
  onAnswer: (ids: string[], value?: string) => void;
}): JSX.Element {
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [find, setFind] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const sending = question.sending === true;

  const main = question.choices.filter((c) => !c.quiet);
  const outs = question.choices.filter((c) => c.quiet);
  const searchable = main.length > SEARCHABLE;
  const shown = searchable ? matching(main, find, picked) : main;
  const asking: Choice | undefined = main.find((c) => picked.includes(c.id) && c.input);
  /* One option and nothing to type: the option is the button. */
  const solo = !question.multi && main.length === 1 && !main[0]?.input && outs.length === 0 ? main[0] : undefined;

  useEffect(() => {
    if (asking) field.current?.focus({ preventScroll: true });
  }, [asking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (question.answer) {
    return <p className="ch-done" role="status"><Check size={13} weight="bold" aria-hidden="true" />{question.answer.line}</p>;
  }
  if (closed || question.stale) {
    return <p className="ch-done is-skipped">{question.text.replace(/[?\s]+$/, "")}: skipped</p>;
  }

  const go = (ids: string[], typed: string) => {
    if (sending) return;
    onAnswer(ids, ids.some((x) => question.choices.find((c) => c.id === x)?.input) ? typed.trim() : undefined);
  };
  const ready = solo ? true : readyToContinue(question, picked, value);

  return (
    <section className="ch" aria-labelledby={id}>
      <p className="rep-ask" id={id}>{question.text}</p>
      {question.note && <p className="rep-why">{question.note}</p>}
      {!solo && searchable && (
        <input
          className="ch-input ch-find"
          type="search"
          value={find}
          placeholder="Search"
          aria-label={`Search: ${question.text.replace(/[?\s]+$/, "")}`}
          autoComplete="off"
          disabled={sending}
          onChange={(e) => setFind(e.target.value)}
        />
      )}
      {!solo && (
        <ul className={`ch-opts${searchable ? " is-long" : ""}`} role={question.multi ? "group" : "radiogroup"} aria-labelledby={id}>
          {searchable && shown.length === 0 && <li className="ch-none">Nothing by that name</li>}
          {shown.map((c) => {
            const on = picked.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="rep-opt ch-opt"
                  role={question.multi ? "checkbox" : "radio"}
                  aria-checked={on}
                  disabled={sending}
                  onClick={() => setPicked((p) => pickChoice(question, p, c.id))}
                >
                  {on && <Check size={12} weight="bold" aria-hidden="true" />}
                  {c.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {asking?.input && (
        <label className="ch-field">
          <span className="ch-field-l">{asking.input.label}</span>
          <input
            ref={field}
            className="ch-input"
            type="text"
            value={value}
            maxLength={120}
            placeholder={asking.input.placeholder}
            autoComplete="off"
            disabled={sending}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && ready) { e.preventDefault(); go(picked, value); }
            }}
          />
        </label>
      )}
      <div className="ch-acts">
        <button type="button" className="rep-commit" disabled={!ready || sending} onClick={() => go(solo ? [solo.id] : picked, value)}>
          {sending ? "Continuing" : solo ? solo.name : "Continue"}
        </button>
        {outs.map((c) => (
          <button key={c.id} type="button" className={c.lead ? "ch-lead" : "ch-skip"} disabled={sending} onClick={() => go([c.id], "")}>{c.name}</button>
        ))}
      </div>
      {question.error && <p className="kc-problem" role="alert">{question.error}</p>}
    </section>
  );
}

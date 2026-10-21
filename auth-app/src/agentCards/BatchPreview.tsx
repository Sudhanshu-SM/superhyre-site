import { useState } from "react";
import { Cta } from "./Cta";

/**
 * Several emails (or scheduled things) on one card, compact: who they go to, one line each (the first three, then
 * "Show all N"); the first one in full as a sample; and "Preview each" to read the rest, one at a time. Nobody is
 * listed twice, and the card stays a few lines tall whether it holds three or ten.
 */
export type BatchItem = {
  /** Who it is to, or what it is ("Email to Dee"). */
  who: string;
  /** Where it goes, in quiet text beside the name. */
  address?: string | null | undefined;
  /** What the row says beside it when collapsed: the subject, or when it happens. */
  line?: string | null | undefined;
  title?: string | null | undefined;
  body?: string | null | undefined;
};

const FIRST = 3;

export function BatchPreview({ items, noun = "emails" }: { items: readonly BatchItem[]; noun?: string }): JSX.Element | null {
  const [all, setAll] = useState(false);
  const [each, setEach] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const sample = items[0];
  if (!sample) return null;
  const toggle = (i: number) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className="lt-batch">
      <ul className="lt-rcpt">
        {(all ? items : items.slice(0, FIRST)).map((m, i) => (
          <li key={`${m.who}${i}`}>
            <span className="lt-affected-name">{m.who}</span>
            {m.address && <span className="lt-quote-addr"> {m.address}</span>}
          </li>
        ))}
      </ul>
      {items.length > FIRST && (
        <Cta small bare aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Cta>
      )}
      <blockquote className="lt-quote">
        <span className="lt-quote-w">The first, as a sample</span>
        {sample.title && <strong className="lt-quote-t">{sample.title}</strong>}
        {sample.body && <p className="lt-mail-body">{sample.body}</p>}
      </blockquote>
      <Cta small bare aria-expanded={each} onClick={() => setEach((v) => !v)}>
        {each ? `Hide the ${noun}` : "Preview each"}
      </Cta>
      {each && (
        <ul className="lt-prev">
          {items.map((m, i) => (
            <li key={`${m.who}${i}`}>
              <Cta small bare aria-expanded={open.has(i)} onClick={() => toggle(i)}>
                {m.who}{m.line ? `: ${m.line}` : ""}
              </Cta>
              {open.has(i) && (
                <blockquote className="lt-quote">
                  {m.title && <strong className="lt-quote-t">{m.title}</strong>}
                  {m.body && <p className="lt-mail-body">{m.body}</p>}
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

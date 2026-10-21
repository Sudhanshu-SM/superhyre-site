import { useState } from "react";
import type { Suggestion } from "../api/agent";
import { sendAction } from "../liveChat";
import { Cta } from "./Cta";
import { countsLine, withoutRepeat } from "./outcome";
import type { Outcome } from "./outcome";

/**
 * What a write did: the sentence, the counts and the obvious next steps as one click each. Used on its own for a
 * change that ran at once (a card of kind `outcome`), where it is a reply like any other: plain text, with the
 * next step as a chip under it. And inside an approval card, which turns into it in place when it is answered.
 */

/** A next step: a page to open (a button that routes there), or something to say to the agent (a chip). */
export function NextSteps({ steps, campaignId }: { steps: readonly Suggestion[]; campaignId?: string | null }): JSX.Element | null {
  /* A press acts once: the turn it starts appears under the card, with no message of the person's. */
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  if (steps.length === 0) return null;
  return (
    <ul className="oc-next">
      {steps.map((s) => (
        <li key={s.label}>
          {s.href ? (
            <Cta href={s.href}>{s.label}</Cta>
          ) : (
            <button
              type="button"
              className="rep-opt"
              disabled={sent.has(s.label)}
              aria-pressed={sent.has(s.label) || undefined}
              onClick={() => { setSent((p) => new Set(p).add(s.label)); sendAction(s.text ?? s.label, s.label, campaignId ?? undefined, s.only ? { only: s.only } : undefined); }}
            >
              {s.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OutcomeBody({ outcome, campaignId, plain = false }: { outcome: Outcome; campaignId?: string | null; plain?: boolean }): JSX.Element | null {
  /* The way back sits after the next steps, as the same kind of button: asking for it is a message to the agent. */
  const steps = outcome.undo ? [...outcome.next.slice(0, 2), outcome.undo] : outcome.next;
  /* The agent's own words said it (the sentence is left to them): nothing is left to show when there are no
     counts or next steps either. */
  if (!outcome.summary && !outcome.counts && steps.length === 0) return null;
  return (
    <div className={`oc is-${outcome.tone}`} aria-live="polite">
      {/* On the canvas it is set as the agent's other words are, so the replies read alike. */}
      {outcome.summary && <p className={plain ? "rep-para" : "oc-sum"}>{outcome.summary}</p>}
      {outcome.counts && <p className="oc-counts">{outcome.counts}</p>}
      <NextSteps steps={steps} {...(campaignId !== undefined ? { campaignId } : {})} />
    </div>
  );
}

/** A change that ran without waiting for a yes, reported on its own: words on the canvas, not a box. */
export function OutcomeCard({ summary, counts, next, undo = null, campaignId, quiet = false }: {
  summary: string;
  counts: Record<string, number> | null;
  next: readonly Suggestion[];
  undo?: Suggestion | null;
  campaignId: string | null;
  /** The agent's own sentence says what this one says: its counts and next steps stay, its sentence goes. */
  quiet?: boolean;
}): JSX.Element | null {
  return (
    <OutcomeBody
      outcome={{ tone: "done", summary: quiet ? "" : summary, counts: withoutRepeat(countsLine(counts), summary), next: [...next], undo }}
      campaignId={campaignId}
      plain
    />
  );
}

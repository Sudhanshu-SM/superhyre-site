import type { Suggestion } from "../api/agent";
import { sendMessage } from "../liveChat";
import { countsLine, withoutRepeat } from "./outcome";
import type { Outcome } from "./outcome";

/**
 * What a write did: the sentence, the counts and the obvious next steps as one click each. Used on its own for a
 * change that ran at once (a card of kind `outcome`) and inside an approval card, which turns into it in place
 * when it is answered.
 */

/** A next step: a page to open, or something to say to the agent. */
export function NextSteps({ steps, campaignId }: { steps: readonly Suggestion[]; campaignId?: string | null }): JSX.Element | null {
  if (steps.length === 0) return null;
  return (
    <ul className="oc-next">
      {steps.map((s) => (
        <li key={s.label}>
          {s.href ? (
            <a className="rep-opt" href={s.href}>{s.label}</a>
          ) : (
            <button type="button" className="rep-opt" onClick={() => sendMessage(s.text ?? s.label, campaignId ?? undefined)}>{s.label}</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OutcomeBody({ outcome, campaignId }: { outcome: Outcome; campaignId?: string | null }): JSX.Element {
  /* The way back sits after the next steps, as the same kind of button: asking for it is a message to the agent. */
  const steps = outcome.undo ? [...outcome.next.slice(0, 2), outcome.undo] : outcome.next;
  return (
    <div className={`oc is-${outcome.tone}`} aria-live="polite">
      <p className="oc-sum">{outcome.summary}</p>
      {outcome.counts && <p className="oc-counts">{outcome.counts}</p>}
      <NextSteps steps={steps} {...(campaignId !== undefined ? { campaignId } : {})} />
    </div>
  );
}

/** A change that ran without waiting for a yes, reported on its own. */
export function OutcomeCard({ summary, counts, next, undo = null, campaignId }: {
  summary: string;
  counts: Record<string, number> | null;
  next: readonly Suggestion[];
  undo?: Suggestion | null;
  campaignId: string | null;
}): JSX.Element {
  return (
    <article className="rep-card lt-approval">
      <div className="lt-approval-body">
        <OutcomeBody outcome={{ tone: "done", summary, counts: withoutRepeat(countsLine(counts), summary), next: [...next], undo }} campaignId={campaignId} />
      </div>
    </article>
  );
}

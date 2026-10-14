import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import type { Match } from "./api/agent";
import { waitLabel } from "./api/client";
import { chartedCampaigns, isRememberAction, TIER_LABEL } from "./chatCards";
import { ApprovalCard, Cards, PhaseSummary, PhaseTimeline } from "./agentCards";
import { TOOL_LABEL, WORKING_LABEL } from "./agentCards/labels";
import { approvalLines } from "./agentPhases";
import type { PhaseLine } from "./agentPhases";
import { FormLinkChips } from "./FormLinkChip";
import { Prose } from "./ReplyProse";
import { vendorWords } from "./displayText";
import { askOptions, resendTurn, stalled, stopTurn, TURN_LIMIT_MS } from "./liveChat";
import type { Approval, LiveTurn as Turn, Question } from "./liveChat";
import { SearchRun } from "./liveViews/SearchRun";
import "./agentLive.css";
import "./agentCards/agentCards.css";

/**
 * One turn of a connected chat, drawn from what the server streamed for it.
 *
 * Uses the same reply vocabulary as the prototype (`rep-*`): prose on the
 * canvas, a question whose options fill the composer, a card only where there
 * is something to approve. What is new is that every number, name and step
 * here came from the run, so nothing on it needs a "not wired" caveat.
 */

/** Failures that say the message itself was refused: sending the same words again can only fail the same way. */
const REFUSED = new Set(["bad_request", "too_large", "unprocessable", "forbidden"]);

/**
 * Why a turn failed and what to do. A limit with a time says when it lifts and offers
 * "Send again" once it has; a daily limit (it resets at midnight) offers nothing that
 * would only fail the same way, and neither does a message the server refused (too long,
 * say): that one is put back in the box to change.
 */
export function failedTurnState(turn: Pick<Turn, "error" | "errorCode" | "retryAt">, now = Date.now()) {
  const limited = turn.errorCode === "rate_limited";
  /* The agent stayed busy through all the waiting (a slot, or the key's allowance for the minute): the same,
     a calm line with the time a try may work. */
  const busy = turn.errorCode === "unavailable" && turn.retryAt != null;
  const timed = limited || busy;
  const refused = turn.errorCode != null && REFUSED.has(turn.errorCode);
  const waiting = timed && turn.retryAt != null && turn.retryAt > now;
  const wait = waiting && turn.retryAt != null ? ` Try again in ${waitLabel(turn.retryAt, now)}.` : "";
  return {
    text: `${(turn.error ?? "").replace(/([^.!?])$/, "$1.")}${wait}`,
    canResend: !refused && (!timed || (turn.retryAt != null && !waiting)),
    /** The words go back in the box to be changed. */
    canEdit: refused,
    waitingUntil: waiting ? (turn.retryAt ?? null) : null,
  };
}

/**
 * The agent's lead-in to a note it proposed ("Got it. This is waiting for your approval…") says what
 * the card's state was when it was written. Once the card has been answered it is out of date, and the
 * card's own line ("Remembered.", "Not saved.") is the news; so the lead goes when it is one short
 * paragraph about waiting. Anything longer or about something else stays.
 */
export function settledLead(reply: string, approvals: ReadonlyArray<Pick<Approval, "action" | "decided">>): string {
  const cards = approvals.filter((a) => isRememberAction(a.action));
  if (!reply || cards.length === 0 || approvals.some((a) => !a.decided)) return reply;
  const text = reply.trim();
  const short = text.length <= 280 && !/\n\s*\n/.test(text);
  return short && /\b(waiting|wait|pending|approv|confirm|review)/i.test(text) ? "" : reply;
}

function FailedTurn({ turn, onEdit }: { turn: Turn; onEdit: (text: string) => void }): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  const state = failedTurnState(turn, now);
  const until = state.waitingUntil;
  useEffect(() => {
    if (!until) return;
    // Counts down in place, and offers "Send again" the moment the limit lifts.
    const t = window.setInterval(() => setNow(Date.now()), until - Date.now() > 120_000 ? 30_000 : 1_000);
    return () => window.clearInterval(t);
  }, [until]);
  return (
    <p className="lt-note" role="status">
      {state.text}
      {state.canResend && (
        <>
          {" "}
          <button type="button" className="lt-link" onClick={() => resendTurn(turn.key)}>
            Send again
          </button>
        </>
      )}
      {state.canEdit && (
        <>
          {" "}
          <button type="button" className="lt-link" onClick={() => onEdit(turn.said)}>
            Edit your message
          </button>
        </>
      )}
    </p>
  );
}

/** The clock, ticking only while a turn is working, so a lost one is noticed without a reload. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(Date.now()), Math.min(15_000, TURN_LIMIT_MS / 4));
    return () => window.clearInterval(t);
  }, [ticking]);
  return now;
}

/** The lines a working turn shows: the run's own phases, or the tools it has used where the server sends none. */
export function linesOf(turn: Pick<Turn, "phases" | "steps">): readonly PhaseLine[] {
  if (turn.phases.length) return turn.phases;
  return turn.steps.flatMap((s, i): PhaseLine[] => {
    const label = s.status === "running" ? (WORKING_LABEL[s.tool] ?? TOOL_LABEL[s.tool]) : TOOL_LABEL[s.tool];
    return label ? [{ id: `tool-${i}`, phase: "search", state: s.status, label, seq: i + 1 }] : [];
  });
}

export function LiveTurnBody({
  turn, onAnswer, onChoose,
}: {
  turn: Turn;
  /** Puts words back in the composer to edit (a failed message). */
  onAnswer: (text: string) => void;
  /** What a press on one of the agent's choices does: sends it, where the page can. Defaults to `onAnswer`. */
  onChoose?: (text: string) => void;
}): JSX.Element {
  const now = useNow(turn.status === "sending" || turn.status === "working");
  const lost = stalled(turn, now);
  const working = !lost && (turn.status === "sending" || turn.status === "working");
  const lead = settledLead(turn.reply, turn.approvals);
  const lines = linesOf(turn);
  return (
    <div className="rep">
      {turn.focus && <p className="lt-focus">Now working on {turn.focus}</p>}
      {/* While it works, what it is doing; once it has answered, how long it thought, with those lines behind it.
          How long it thought says nothing about a turn that failed: the line under it says what happened. */}
      {working
        ? <PhaseTimeline lines={lines} working onStop={turn.runId ? () => void stopTurn(turn.key) : undefined} />
        : turn.status !== "failed" && <Thought turn={turn} lines={lines} />}

      <Cards cards={turn.cards.filter((c) => c.kind !== "view")} turnSaid={turn.said} charted={chartedCampaigns(turn.cards)} />

      {/* The words stream in as they are written, under the lines that say what it is doing. */}
      {lead && <Prose text={vendorWords(lead)} />}
      {lead && <FormLinkChips text={lead} />}

      {/* A view is the answer itself: the agent's one line leads into it. */}
      <Cards cards={turn.cards.filter((c) => c.kind === "view")} turnSaid={turn.said} />

      {turn.questions.map((q, i) => (
        <Ask key={`${q.kind}${i}`} question={q} onAnswer={onChoose ?? onAnswer} />
      ))}
      {turn.approvals.map((a) => (
        <ApprovalCard key={a.seq} turnKey={turn.key} approval={a} turnSaid={turn.said} phases={approvalLines(turn.phases, a.seq)} />
      ))}
      {turn.searches.map((s, i) => (
        // Only the newest batch offers to find more; older ones would repeat the button.
        <SearchRun key={s.runId} turnKey={turn.key} search={s} latest={i === turn.searches.length - 1} onAsk={onChoose ?? onAnswer} />
      ))}
      {turn.notices.map((n) => (
        <p key={n} className="lt-note">{vendorWords(n)}</p>
      ))}
      {lost && !turn.error && (
        <p className="lt-note" role="status">
          This one stopped before it finished.{" "}
          <button type="button" className="lt-link" onClick={() => resendTurn(turn.key)}>
            Send again
          </button>
        </p>
      )}
      {turn.error && <FailedTurn turn={turn} onEdit={onAnswer} />}
    </div>
  );
}

/** "Thought for 6.2s", "Thought for 48s", "Thought for 2m 5s": measured, never rounded up to look like more. */
export function thoughtLabel(ms: number): string {
  const secs = Math.max(0, ms) / 1000;
  if (secs < 10) return `Thought for ${secs.toFixed(1)}s`;
  const whole = Math.round(secs);
  return whole < 60 ? `Thought for ${whole}s` : `Thought for ${Math.floor(whole / 60)}m ${whole % 60}s`;
}

/** The thought line, measured from send to done; opens onto what the run actually did. */
function Thought({ turn, lines }: { turn: Turn; lines: readonly PhaseLine[] }): JSX.Element | null {
  if (!turn.finishedAt) return null;
  const label = thoughtLabel(turn.finishedAt - turn.startedAt);
  const spark = <Sparkle size={13} weight="fill" aria-hidden="true" />;
  if (!lines.length) return <p className="rep-thought">{spark}{label}</p>;
  return <PhaseSummary lines={lines} label={label} lead={spark} />;
}

/** The agent's question. A press answers it (one tap), and the choices then stay as they were, no longer pressable. */
function Ask({ question, onAnswer }: { question: Question; onAnswer: (text: string) => void }): JSX.Element {
  const askId = useId();
  const options = askOptions(question);
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <>
      <p className="rep-ask" id={askId}>{question.text}</p>
      {question.note && <p className="rep-why">{question.note}</p>}
      {options.length > 0 && (
        <ul className="rep-opts" aria-labelledby={askId}>
          {options.map((o, i) => (
            <li key={`${i}:${o.label}`}>
              <button
                type="button"
                className="rep-opt"
                disabled={chosen !== null}
                aria-pressed={chosen === i}
                onClick={() => { setChosen(i); onAnswer(o.text); }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** "Staff Engineer at PhonePe, Bengaluru · Good fit", leaving out whatever isn't known. */
export function metaOf(p: Pick<Match, "currentTitle" | "currentCompanyName" | "city" | "tier">): string {
  const role = [p.currentTitle, p.currentCompanyName].filter(Boolean).join(" at ");
  const where = [role, p.city].filter(Boolean).join(", ");
  return [where, p.tier ? TIER_LABEL[p.tier] : null].filter(Boolean).join(" · ");
}

/**
 * The line over a search's results. It counts the people actually shown, and when that
 * differs from how many were asked for it says how, so the two numbers never disagree.
 */
export function resultLine(shown: number, asked: number | null, unscored = 0): string {
  if (!shown) return "Nobody new matched this time.";
  const people = `${shown} ${shown === 1 ? "person" : "people"}`;
  /* Some of them have no score yet (the number the notice and the last line say): "worth a look" would say
     they were scored. They are found, and the best fit of the scored ones is first. */
  if (unscored > 0) return unscored < shown ? `${people} found, best fit first` : `${people} found`;
  // More than asked is normal (our own database adds to a first search); only fewer needs saying.
  return asked && shown < asked ? `${people} worth a look, of the ${asked} asked for` : `${people} worth a look`;
}

import { ArrowClockwise, PencilSimple, Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useStreamLine } from "./api/streamLine";
import type { Match } from "./api/agent";
import { waitLabel } from "./api/client";
import { chartedCampaigns, isRememberAction, TIER_LABEL } from "./chatCards";
import { ApprovalCard, Cards, ChoiceCard, Cta, PhaseSummary, PhaseTimeline } from "./agentCards";
import { TOOL_LABEL, WORKING_LABEL } from "./agentCards/labels";
import { carriesGmailConnect } from "./agentCards/outcome";
import { isMeetingAction, productsNeeded, withoutMetAccess } from "./agentCards/meetingModel";
import { schedulingState } from "./connectStates";
import { useConnections } from "./connectionsStore";
import { approvalLines } from "./agentPhases";
import type { PhaseLine } from "./agentPhases";
import { FormLinkChips } from "./FormLinkChip";
import { Prose } from "./ReplyProse";
import { covers } from "./restated";
import { vendorWords } from "./displayText";
import { answerQuestion, resendTurn, sendAction, stalled, stopTurn, TURN_LIMIT_MS } from "./liveChat";
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
 * What the agent's lead-in says about a card that was waiting: "I've proposed saving 6 people to Candidates, waiting
 * for your approval", "This is waiting for your approval", "Approve it below". True when it was written, a stale
 * claim once the card has been answered.
 */
const WAITING_ON_YOU = new RegExp(
  [
    String.raw`\b(?:waiting|waits?|awaiting|pending)\b[^.!?\n]{0,24}\b(?:approval|approve|ok|yes|confirmation|confirm|go-?ahead|decision|you)\b`,
    String.raw`\b(?:needs?|awaits?)\s+your\s+(?:approval|ok|yes|confirmation|go-?ahead|decision)\b`,
    String.raw`\bfor\s+your\s+(?:approval|ok|yes|confirmation|go-?ahead)\b`,
    String.raw`\b(?:once|when|if)\s+you\s+(?:approve|confirm|say\s+yes|are\s+happy)\b`,
    String.raw`\bapprove\s+(?:it|this|them|that)\b`,
    String.raw`\b(?:i['’]ve|i\s+have|i)\s+(?:proposed|prepared|drafted|lined\s+up)\b`,
  ].join("|"),
  "i",
);

/** "Here's the note.", "Here's the change.": words that only point at a card, which has been answered since. */
const POINTS_AT_CARD = /^here(?:['’]s| is| are)\s+(?:the|a|an|your)\s+(?:note|change|draft|drafts|emails?|reminder|task|invitation|invite|proposal|plan|message)\b[^.!?]{0,30}[.:]?$/i;

/**
 * The agent's lead-in to something it proposed ("Got it. This is waiting for your approval…") says what the
 * card's state was when it was written. Once every card has been answered it is out of date, and the card's own
 * line ("Remembered.", "Saved 5 people to Candidates.", "Not saved.") is the news. A note's lead goes when it is
 * one short paragraph about waiting; for any other card the sentences that talk about waiting or about the
 * proposal go, and anything else the agent said stays.
 */
export function settledLead(reply: string, approvals: ReadonlyArray<Pick<Approval, "action" | "decided">>): string {
  if (!reply || approvals.length === 0 || approvals.some((a) => !a.decided)) return reply;
  const text = reply.trim();
  const short = text.length <= 280 && !/\n\s*\n/.test(text);
  if (approvals.some((a) => isRememberAction(a.action))) {
    return short && /\b(waiting|wait|pending|approv|confirm|review)/i.test(text) ? "" : reply;
  }
  const kept: string[] = [];
  for (const line of reply.split("\n")) {
    if (!line.trim()) {
      kept.push("");
      continue;
    }
    // Cut after a full stop that is followed by a space, so "3.5 years" stays whole.
    const left = line.split(/(?<=[.!?])\s+/).filter((s) => !WAITING_ON_YOU.test(s) && !POINTS_AT_CARD.test(s.trim())).join(" ").trim();
    if (left) kept.push(left);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The agent's words without the question a card already asks: the heading is on the card once, so a sentence that
 * is a question, or says what the heading says, is left out. Words of turns kept from before this was done on the
 * server are cleaned the same way.
 */
export function leaveOutAsked(reply: string, questions: ReadonlyArray<Pick<Question, "text">>): string {
  if (!reply || questions.length === 0) return reply;
  const kept = reply.split("\n").map((line) =>
    line.split(/(?<=[.!?])\s+/).filter((s) => !/\?["')\]]*\s*$/.test(s) && !questions.some((q) => covers(s, q.text))).join(" ").trim(),
  );
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The question settled on the answer a later turn was started by, when its own event has not been read yet (a chat just reopened). */
function answeredBy(q: Question, later: readonly Turn[]): Question {
  if (q.answer) return q;
  const by = later.find((t) => t.quiet?.answer?.runId === q.runId && t.quiet.answer.seq === q.seq);
  return by?.quiet?.answer ? { ...q, answer: { ids: by.quiet.answer.ids, line: by.quiet.label } } : q;
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
          <Cta small icon={ArrowClockwise} onClick={() => resendTurn(turn.key)}>Send again</Cta>
        </>
      )}
      {state.canEdit && (
        <>
          {" "}
          <Cta small icon={PencilSimple} onClick={() => onEdit(turn.said)}>Edit your message</Cta>
        </>
      )}
    </p>
  );
}

/** The clock, ticking only while a turn is working, so a lost one is noticed without a reload. */
function useNow(ticking: boolean, every: number = Math.min(15_000, TURN_LIMIT_MS / 4)): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(t);
  }, [ticking, every]);
  return now;
}

/** How long a turn with a card waiting must have said nothing before the row says it is waiting for the person. */
export const WAITING_QUIET_MS = 4_000;

/**
 * Whether a turn that still reads "working" is really waiting for the person: a card is open for their yes, they
 * have not answered it, and the run has said nothing for a few seconds (a run that is working keeps saying what it is
 * doing: even its thinking line is refreshed every few seconds). It is then no longer "Thinking it through": nothing is
 * running, and Stop would stop nothing.
 */
export function waitingOnPerson(
  turn: Pick<Turn, "status" | "approvals" | "touchedAt">,
  now: number,
  quietMs: number = WAITING_QUIET_MS,
): boolean {
  if (turn.status !== "working") return false;
  if (!turn.approvals.some((a) => !a.decided)) return false;
  // They have said yes to one: that is work being done, and its own lines say what.
  if (turn.approvals.some((a) => a.deciding)) return false;
  return turn.touchedAt !== undefined && now - turn.touchedAt >= quietMs;
}

/** The lines a working turn shows: the run's own phases, or the tools it has used where the server sends none. */
export function linesOf(turn: Pick<Turn, "phases" | "steps">): readonly PhaseLine[] {
  /* What an approved action is doing is said on its own card, where the yes was given: a second copy up here would
     put the run's Stop beside a send that is the card's to finish. */
  const own = turn.phases.filter((l) => !l.id.startsWith("approval:"));
  if (own.length) return own;
  if (turn.phases.length) return [];
  return turn.steps.flatMap((s, i): PhaseLine[] => {
    const label = s.status === "running" ? (WORKING_LABEL[s.tool] ?? TOOL_LABEL[s.tool]) : TOOL_LABEL[s.tool];
    return label ? [{ id: `tool-${i}`, phase: "search", state: s.status, label, seq: i + 1 }] : [];
  });
}

/**
 * The cards of a turn in two groups: those that come before the agent's words, and the changes whose own
 * sentence those words already say. Said once: the agent's sentence is the one that stays, and the change's
 * counts and next steps sit under it.
 */
export function splitByTelling(
  cards: readonly Turn["cards"][number][],
  lead: string,
): { before: Turn["cards"]; told: Turn["cards"]; quiet: ReadonlySet<string> } {
  const quiet = new Set<string>();
  if (lead.trim()) {
    for (const c of cards) if (c.kind === "outcome" && covers(lead, c.summary)) quiet.add(c.key);
  }
  return { before: cards.filter((c) => !quiet.has(c.key)), told: cards.filter((c) => quiet.has(c.key)), quiet };
}

/**
 * The connect cards of a turn that already ask for what an approval waits on, so the approval does not ask a second time.
 * A meeting or reminder waits on Calendar or Tasks, which a card for Gmail's sign-in alone does not ask for.
 */
export function connectShownFor(a: Approval, cards: readonly Turn["cards"][number][]) {
  const part = isMeetingAction(a.action) ? productsNeeded([a])[0] : null;
  return cards.flatMap((c) => (c.kind === "connect" && (!part || c.provider !== "google" || (c.products ?? []).includes(part)) ? [c.provider] : []));
}

export function LiveTurnBody({
  turn, onAnswer, later = [],
}: {
  turn: Turn;
  /** Puts words back in the composer to edit (a failed message). */
  onAnswer: (text: string) => void;
  /** The turns after this one: a question it left open can no longer be answered once the chat has gone on, and an answer given since settles its card. */
  later?: readonly Turn[];
}): JSX.Element {
  const openCard = turn.approvals.some((a) => !a.decided);
  /* The line that carries the run's words dropped and has not come back for a few seconds: said quietly, once. */
  const reconnecting = useStreamLine() === "reconnecting";
  const now = useNow(turn.status === "sending" || turn.status === "working", openCard ? 1_000 : undefined);
  const lost = stalled(turn, now);
  const working = !lost && (turn.status === "sending" || turn.status === "working");
  /* A card is open and the run has gone quiet: it is the person's turn, not the agent's. */
  const waiting = working && waitingOnPerson(turn, now);
  /* "Google Calendar needs to be connected first", once it is (or the meeting was sent), is no longer true: the card says what happened. */
  const conns = useConnections();
  const need = productsNeeded(turn.approvals);
  const accessMet = need.length > 0 && (
    turn.approvals.some((a) => isMeetingAction(a.action) && a.decided?.decision === "approve")
    || (conns.status === "ready" && schedulingState(conns, need).s === "connected")
  );
  const lead = leaveOutAsked(settledLead(accessMet ? withoutMetAccess(turn.reply) : turn.reply, turn.approvals), turn.questions);
  const lines = linesOf(turn);
  /* Said once, but only when the words are all there: a sentence still being written must not move a card. */
  const told = working ? "" : lead;
  /* An email card carries Gmail's Connect itself: a separate connect card above or beside it would say it twice, in a
     different place each time. */
  const gmailInCard = turn.approvals.some((a) => carriesGmailConnect(a.action));
  const cards = turn.cards.filter((c) => !(gmailInCard && c.kind === "connect" && c.provider === "google"));
  const { before, told: toldCards, quiet } = splitByTelling(cards.filter((c) => c.kind !== "view" && c.kind !== "role_spec"), told);
  return (
    <div className="rep">
      {/* While it works, what it is doing; once it has answered, how long it thought, with those lines behind it.
          How long it thought says nothing about a turn that failed: the line under it says what happened. */}
      {waiting
        ? <p className="rep-thought" role="status">Waiting for your OK</p>
        : working
          ? <PhaseTimeline lines={lines} working since={turn.startedAt} onStop={turn.runId ? () => void stopTurn(turn.key) : undefined} />
          : turn.status !== "failed" && <Thought turn={turn} lines={lines} />}

      {working && !waiting && reconnecting && <p className="rep-thought" role="status">Reconnecting…</p>}

      <Cards
        cards={before}
        turnSaid={turn.said}
        charted={chartedCampaigns(cards)}
        approvalOpen={turn.approvals.some((a) => !a.decided)}
      />

      {/* The words stream in as they are written, under the lines that say what it is doing. */}
      {lead && <Prose text={vendorWords(lead)} />}
      {lead && <FormLinkChips text={lead} />}

      {/* A change's own sentence, when the words above already say it: said once, and its counts and next
          steps stay, under the words. */}
      <Cards cards={toldCards} turnSaid={turn.said} quiet={quiet} />

      {/* A view is the answer itself: the agent's one line leads into it. */}
      <Cards cards={cards.filter((c) => c.kind === "view")} turnSaid={turn.said} />

      {turn.questions.map((q, i) => (
        <ChoiceCard key={`${q.kind}${i}`} question={answeredBy(q, later)} closed={later.length > 0} onAnswer={(ids, value) => void answerQuestion(turn.key, i, ids, value)} />
      ))}
      {turn.approvals.map((a) => (
        <ApprovalCard
          key={a.seq}
          turnKey={turn.key}
          approval={a}
          turnSaid={turn.said}
          said={told}
          phases={approvalLines(turn.phases, a.seq)}
          connectShown={connectShownFor(a, cards)}
        />
      ))}
      {/* A drafted role spec stands under the sentence that says the campaign was made, with its own Approve. */}
      <Cards cards={cards.filter((c) => c.kind === "role_spec")} turnSaid={turn.said} />
      {turn.searches.map((s, i) => (
        // Only the newest batch offers to find more; older ones would repeat the button.
        <SearchRun key={s.runId} turnKey={turn.key} search={s} latest={i === turn.searches.length - 1} onAsk={(text, label) => sendAction(text, label, s.campaignId)} />
      ))}
      {turn.notices.map((n) => (
        <p key={n} className="lt-note">{vendorWords(n)}</p>
      ))}
      {lost && !turn.error && (
        <p className="lt-note" role="status">
          This one stopped before it finished.{" "}
          <Cta small icon={ArrowClockwise} onClick={() => resendTurn(turn.key)}>Send again</Cta>
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
  // A line the agent said on its own (a reminder come due) was not thought about: no run, no "Thought for 0.0s".
  if (!turn.finishedAt || (!turn.runId && turn.quiet?.label === "")) return null;
  const label = thoughtLabel(turn.finishedAt - turn.startedAt);
  const spark = <Sparkle size={13} weight="fill" aria-hidden="true" />;
  if (!lines.length) return <p className="rep-thought">{spark}{label}</p>;
  return <PhaseSummary lines={lines} label={label} lead={spark} />;
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
  // More than asked is normal (a first search can add to it); only fewer needs saying.
  return asked && shown < asked ? `${people} worth a look, of the ${asked} asked for` : `${people} worth a look`;
}

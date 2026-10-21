import { useEffect } from "react";
import { ensureConnections, useConnections } from "../connectionsStore";
import { helpLinkLabel } from "../chatCards";
import { Loader } from "../components/Loader";
import { SlowNote } from "../components/SlowNote";
import { canTryAgain, countsOf, decide, refreshChat } from "../liveChat";
import { useSlowWhile } from "../slowState";
import type { Approval } from "../liveChat";
import { ConnectCard, isConnected } from "./ConnectCard";
import { Cta } from "./Cta";
import { NextSteps } from "./OutcomeCard";
import { nameList } from "./outcome";
import type { Outcome } from "./outcome";

/**
 * An approved email card, settled where it was approved. It says how many went (counted from the messages, so it
 * is what Outreach says), who it did not reach and why, in one plain line each, and, when something can be sent
 * again, the button for it right here. Try again runs the same approval again and this card's answer changes:
 * nothing is added to the chat. A connection that has to be made again is offered inside the card too.
 */
export function EmailOutcome({ turnKey, approval, outcome, campaignId }: {
  turnKey: string;
  approval: Approval;
  outcome: Outcome;
  campaignId: string | null;
}): JSX.Element | null {
  const email = outcome.email;
  const conns = useConnections();
  const reconnect = email?.reconnect === true;
  /* A send that was refused for the connection: what is connected is read again, so the Connect inside the card is
     there (and goes when it is made) rather than left to a store that has not looked since the chat opened. */
  useEffect(() => {
    if (reconnect) void ensureConnections(true).catch(() => undefined);
  }, [reconnect]);
  /* Emails go out one at a time, a few seconds to a minute apart, so a card that is still going out after a long while
     is looked at again (the line may have dropped) rather than left saying "Going out". */
  const going = Boolean(email) && !approval.deciding && email?.settled === false;
  const slow = useSlowWhile(going, { soft: 45_000, hard: 180_000 });
  if (!email) return null;
  const retrying = approval.deciding;
  const again = canTryAgain(approval);
  const connected = conns.status === "ready" && isConnected(conns, "google");
  /* Gmail has to be connected again for the failed ones to go; once it is, Try again is the way on. */
  const needsGmail = email.reconnect && conns.status === "ready" && !connected;
  const refusal = approval.error;
  const counts = countsOf(approval.decided?.outcome.counts);
  const total = counts?.total ?? 0;
  const done = (counts?.sent ?? 0) + (counts?.failed ?? 0);
  return (
    <div className={`oc is-${outcome.tone}`} aria-live="polite">
      {outcome.summary && <p className="rep-para">{outcome.summary}</p>}
      {email.notes.map((n) => <p key={n} className="lt-note">{n}</p>)}
      {email.failures.length > 0 && (
        <ul className="oc-fails">
          {email.failures.map((f) => (
            <li key={`${f.names.join()}|${f.reason}`}>
              <span className="lt-affected-name">{nameList(f.names)}</span>{" "}
              <span className="lt-affected-meta">{f.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {/* What went wrong first, then the way to mend it, then the buttons: the same order as a card that waits. */}
      {refusal && <p className="kc-problem" role="alert">{refusal}</p>}
      {email.help && !needsGmail && (
        <div className="cta-row"><Cta href={email.help}>{helpLinkLabel(email.help)}</Cta></div>
      )}
      {needsGmail && <ConnectCard provider="google" reason="Your emails go out from your own Gmail, so this is the one thing to connect." compact quiet />}
      {(again || retrying) && (
        <div className="lt-actions">
          <button type="button" className="rep-commit" disabled={retrying || needsGmail} onClick={() => void decide(turnKey, approval.seq, "approve")}>
            {retrying ? "Sending…" : "Try again"}
          </button>
          {retrying && <span className="kc-wait" role="status"><Loader size="sm" /></span>}
        </div>
      )}
      {going && (
        <span className="kc-wait" role="status">
          <Loader size="sm" />
          {total > 1 ? `Sending ${Math.min(total, done + 1)} of ${total}, one at a time` : "Going out"}
        </span>
      )}
      {going && (
        <SlowNote
          level={slow}
          soft="Taking longer than usual. Emails go out a little apart, so a few can take a minute."
          stuck="This is taking longer than it should. Check again to see where each one is; nothing is sent twice."
          retryLabel="Check again"
          onRetry={() => void refreshChat()}
        />
      )}
      <NextSteps steps={outcome.next} campaignId={campaignId} />
    </div>
  );
}

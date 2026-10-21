import { CalendarCheck, Video } from "@phosphor-icons/react";
import { useState } from "react";
import type { ConnectProvider } from "../agentEvents";
import { helpLinkLabel, helpLinkOf } from "../chatCards";
import { ConnectorLogo } from "../ConnectorLogo";
import { decide, sendAction } from "../liveChat";
import type { Approval } from "../liveChat";
import { clock, dayWords } from "../meetingsView";
import { useConnections } from "../connectionsStore";
import { schedulingState } from "../connectStates";
import { ConnectCard } from "./ConnectCard";
import { Cta } from "./Cta";
import { editOf, guestsLine, headingOf, isStaleAccess, kindOf, lengthWords, settledLine, slotLabel, whenLine, yesWords } from "./meetingModel";
import "./meetingCard.css";

/**
 * A meeting, a move, a cancellation or a reminder that waits for a yes. It shows who gets an invitation and when, in
 * the person's own time zone, a switch for the Google Meet link, and "Pick another time", which opens the free times
 * inside the card: choosing one only changes the card (nothing is said in the chat), and the yes books that one.
 * Answered, it settles in place to "Invited: Tue 21 Oct, 3:00 pm" with Add to calendar and the obvious next steps.
 */
export function MeetingCard({ turnKey, approval, connectShown = [] }: {
  turnKey: string;
  approval: Approval;
  /** The connections this turn already has a card for: the access is asked for there, not a second time here. */
  connectShown?: readonly ConnectProvider[];
}): JSX.Element {
  const kind = kindOf(approval);
  const m = approval.meeting ?? null;
  const [meet, setMeet] = useState(m?.meet ?? false);
  const [picking, setPicking] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const conns = useConnections();
  const chosen = slot !== null ? approval.slots?.[slot] ?? null : null;
  const startsAt = chosen?.startsAt ?? m?.startsAt ?? null;
  const endsAt = chosen?.endsAt ?? m?.endsAt ?? null;
  const zone = m?.timezone ?? "UTC";
  const words = yesWords(kind);

  /* Settled: the same card, as what it did. */
  const settled = settledLine(approval);
  if (settled) {
    const o = approval.decided?.outcome ?? {};
    const meeting = o.meeting && typeof o.meeting === "object" ? (o.meeting as Record<string, unknown>) : {};
    const next = Array.isArray(o.next) ? (o.next as Array<{ label?: string; text?: string; href?: string }>) : [];
    const meetUrl = typeof meeting.meetUrl === "string" ? meeting.meetUrl : null;
    const sentence = typeof o.summary === "string" ? o.summary : "";
    return (
      <article className="rep-card lt-approval mt is-settled" aria-label={settled.declined ? "Not done" : settled.lead}>
        {settled.declined ? (
          <p className="mt-declined">{settled.lead}</p>
        ) : (
          <>
            <p className="mt-done">
              {settled.when ? <><span className="mt-done-k">{settled.lead}:</span> {settled.when}</> : settled.lead}
            </p>
            {kind !== "move" && kind !== "cancel" && sentence && settled.when === null && <p className="mt-sub">{sentence}</p>}
            {meetUrl && (
              <p className="mt-sub"><Cta href={meetUrl} icon={Video} small>{meetUrl.replace("https://", "")}</Cta></p>
            )}
            {Array.isArray(o.notes) && o.notes.map((n) => typeof n === "string" && !isStaleAccess(n) ? <p key={n} className="mt-sub">{n}</p> : null)}
            {next.length > 0 && (
              <div className="cta-row">
                {next.map((n, i) => n.href
                  ? <Cta key={n.label ?? i} href={n.href} variant={i === 0 ? "primary" : "quiet"} small>{n.label ?? "Open"}</Cta>
                  : n.text ? <Cta key={n.label ?? i} small onClick={() => sendAction(n.text ?? "", n.label ?? "")}>{n.label ?? n.text}</Cta> : null)}
              </div>
            )}
          </>
        )}
      </article>
    );
  }

  /* Waiting for a yes. */
  const covered = conns.status === "ready"
    && schedulingState(conns, [kind === "reminder" && approval.detail.where === "google_tasks" ? "tasks" : "calendar"]).s === "connected";
  /* The turn's own connect card asks for the access and says why, so this card holds its yes and says nothing of its own. */
  const theirs = connectShown.includes("google");
  const missing = conns.status === "ready" && !covered;
  const needsAccess = ((approval.connect?.length ?? 0) > 0 || theirs) && missing;
  /* What was said about missing access is stale once it is there, or is said by the connect card beside it: the card restates the state, it does not remember it. */
  const said = (s: string) => isStaleAccess(s) && (covered || (theirs && missing));
  const trouble = approval.error && !said(approval.error) ? approval.error : null;
  const help = trouble ? helpLinkOf(approval.help, trouble) : null;
  const guests = m?.guests ?? [];
  const sendable = !approval.deciding && !needsAccess;

  const approve = () => void decide(turnKey, approval.seq, "approve", editOf(approval, { meet, slot }));
  const part = kind === "reminder" && approval.detail.where === "google_tasks" ? "tasks" : "calendar";

  return (
    <article className="rep-card lt-approval mt">
      <header className="rep-app">
        <span className="lt-app-mark" aria-hidden="true">
          {kind === "reminder" ? <CalendarCheck size={15} weight="fill" /> : <ConnectorLogo id="calendar" size={16} decorative />}
        </span>
        <span className="rep-app-name">{headingOf(approval)}</span>
      </header>

      {m ? (
        <div className="mt-body">
          <p className="mt-title">{m.title}</p>
          {startsAt && endsAt && (
            <p className="mt-when">
              {whenLine(startsAt, zone)}
              <span className="mt-when-meta"> · {lengthWords(Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)))}</span>
            </p>
          )}
          {m.was && kind === "move" && <p className="mt-sub">Now {whenLine(m.was.startsAt, zone)}</p>}
          {guests.length > 0 && (
            <p className="mt-who">
              <span className="mt-k">{kind === "cancel" ? "They will be told" : "Invited"}</span> {guestsLine(guests)}
            </p>
          )}
          {kind !== "move" && kind !== "cancel" && (
            <div className="mt-row">
              <button type="button" role="switch" aria-checked={meet} className={`mt-switch${meet ? " is-on" : ""}`} onClick={() => setMeet((v) => !v)} disabled={approval.deciding}>
                <span className="mt-switch-t" aria-hidden="true"><span className="mt-switch-k" /></span>
                <span className="mt-switch-l">Google Meet link</span>
              </button>
            </div>
          )}
          {m.busy && !chosen && <p className="mt-busy">You're busy then on your own calendar.</p>}
        </div>
      ) : (
        <p className="rep-para">{approval.summary}</p>
      )}

      {picking && (approval.slots?.length ?? 0) > 0 && (
        <div className="mt-slots" role="group" aria-label="Other times that are free">
          <span className="mt-k">Free on your calendar</span>
          <ul className="mt-slot-list">
            {approval.slots?.map((s, i) => (
              <li key={s.startsAt}>
                <button
                  type="button"
                  className={`mt-slot${slot === i ? " is-picked" : ""}`}
                  aria-pressed={slot === i}
                  disabled={approval.deciding}
                  onClick={() => { setSlot(i); setPicking(false); }}
                >
                  <span className="mt-slot-d">{dayWords(s.startsAt, zone)}</span> {clock(s.startsAt, zone)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {chosen && !picking && (
        <p className="mt-sub">Picked {slotLabel(chosen.startsAt, zone)}. <button type="button" className="mt-link" onClick={() => setSlot(null)}>Back to the first time</button></p>
      )}

      {approval.notes.filter((n) => !/busy then|Google Meet link is added/.test(n) && !said(n)).map((n) => <p key={n} className="lt-note">{n}</p>)}
      {trouble && <p className="kc-problem" role="alert">{trouble}</p>}
      {trouble && help && <div className="cta-row"><Cta href={help}>{helpLinkLabel(help)}</Cta></div>}
      {needsAccess && !theirs && (
        <ConnectCard provider="google" products={[part]} label={part === "tasks" ? "Google Tasks" : "Google Calendar"} reason={part === "tasks" ? "Reminders in Google Tasks need access to your Tasks." : "Invitations come from your own Google Calendar, which needs your OK first."} compact quiet />
      )}

      <div className="lt-actions">
        <button type="button" className="rep-commit" disabled={!sendable} onClick={approve}>
          {approval.deciding ? words.working : trouble ? "Try again" : words.ready}
        </button>
        {kind !== "move" && kind !== "cancel" && kind !== "reminder" && (approval.slots?.length ?? 0) > 0 && (
          <button type="button" className="rep-act" disabled={approval.deciding} onClick={() => setPicking((v) => !v)}>
            {picking ? "Keep this time" : "Pick another time"}
          </button>
        )}
        <button type="button" className="rep-act" disabled={approval.deciding} onClick={() => void decide(turnKey, approval.seq, "decline")}>
          Not now
        </button>
      </div>
    </article>
  );
}

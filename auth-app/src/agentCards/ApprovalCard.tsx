import { Bell, CalendarCheck, ChartBar, CheckSquare, EnvelopeSimple, NotionLogo, SlackLogo } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { gmailStateOf } from "../api/identity";
import { ConnectorLogo } from "../ConnectorLogo";
import { RoleSpecPanel } from "../RoleSpecPanel";
import { Dialog } from "../ui";
import {
  CHANGED_AGAIN, isOutsideAction, isRememberAction, isScheduleAction, outsideHead, outsidePreview, personLine, rememberHead, rememberPreview,
  scheduleBlocks, scheduleHead,
} from "../chatCards";
import { useConnections } from "../connectionsStore";
import { decide } from "../liveChat";
import type { Approval } from "../liveChat";
import { ConnectCard } from "./ConnectCard";
import { OutcomeBody } from "./OutcomeCard";
import { ACTION_LABEL } from "./labels";
import { outcomeModel, wontDo } from "./outcome";
import { PhaseTimeline } from "./PhaseTimeline";
import type { PhaseLine } from "../agentPhases";

/** What each outside action needs connected before it can go. */
const NEEDS: Record<"slack_message" | "notion_note", { provider: "slack" | "notion"; why: string }> = {
  slack_message: { provider: "slack", why: "It posts this message to Slack once you approve it." },
  notion_note: { provider: "notion", why: "It files this note in Notion once you approve it." },
};

/** Said under an approval of an email while Gmail isn't connected, when the server hasn't said it already. */
const GMAIL_OFF = "Gmail isn't connected, so this won't go out until you connect it.";

/**
 * The server's notes on a card were true when it was made. "Gmail isn't connected yet" is not once the person
 * has connected it (the connect card beside it says so): it goes, rather than sit beside "Google is connected".
 */
export function liveNotes(notes: readonly string[], googleConnected: boolean): string[] {
  return googleConnected ? notes.filter((n) => !/\b(?:gmail|google)\b[^.]*\bisn'?t connected\b/i.test(n)) : [...notes];
}

/** What each kind of scheduled thing looks like in an approval. */
const KIND_ICON: Record<string, Icon> = {
  email: EnvelopeSimple,
  slack_message: SlackLogo,
  notion_note: NotionLogo,
  task: CheckSquare,
  reminder: Bell,
  digest: ChartBar,
};

/** "Send this to Nandini?" for one email, "Send these 3 emails?" for more: the question the Approve answers. */
function emailHead(emails: readonly { to: string }[]): string {
  const first = emails[0]?.to.split(/\s+/)[0] ?? "them";
  return emails.length === 1 ? `Send this to ${first}?` : `Send these ${emails.length} emails?`;
}

/** How many people an approval names before it folds the rest. */
const FIRST_PEOPLE = 5;

/**
 * Something with real effects waits here for the person's yes: what will happen, who it affects, what it will
 * not do, and two buttons. Answered, the same card turns into what it did, in place: the counts, and the next
 * step as one click.
 */
export function ApprovalCard({ turnKey, approval, turnSaid, phases = [] }: {
  turnKey: string;
  approval: Approval;
  turnSaid: string;
  /** What the approved action says it is doing, line by line, while it runs: "Reading the job description", "Drafting the role spec". */
  phases?: readonly PhaseLine[];
}): JSX.Element {
  const outside = isOutsideAction(approval.action) ? approval.action : null;
  const head = outside ? outsideHead(outside, approval.detail) : null;
  const preview = outside ? outsidePreview(outside, approval.detail) : null;
  const remember = isRememberAction(approval.action);
  const note = remember ? rememberPreview(approval.detail) : null;
  const schedule = isScheduleAction(approval.action);
  const blocks = useMemo(
    () => (schedule ? scheduleBlocks(approval.detail, approval.people, approval.campaignName) : []),
    [schedule, approval.detail, approval.people, approval.campaignName],
  );
  /* A card that went stale can't be approved; asking again makes a new one. */
  const stale = schedule && approval.error === CHANGED_AGAIN;
  /* What the server wants said about this one, and, when an email would wait on a Gmail that isn't connected,
     that, with the way to connect it. It is told while the card waits and after a yes. */
  const conns = useConnections();
  const hasEmail = blocks.some((b) => b.kind === "email");
  const gmailOff = hasEmail && conns.status === "ready" && (!conns.google || gmailStateOf(conns.google) !== "connected");
  const gmailOn = conns.status === "ready" && Boolean(conns.google) && gmailStateOf(conns.google!) === "connected";
  const notes = approval.decided?.decision === "decline"
    ? []
    : [...liveNotes(approval.notes, gmailOn), ...(gmailOff && !approval.notes.some((n) => /gmail/i.test(n)) ? [GMAIL_OFF] : [])];
  const outcome = outcomeModel(approval);
  const wont = approval.decided ? [] : wontDo(approval);
  const [allPeople, setAllPeople] = useState(false);
  /* A role spec to approve is read before it is approved: the console's own spec panel opens over the chat,
     the same one the campaign's Overview opens (edit a line, approve there or here). */
  const [specOpen, setSpecOpen] = useState(false);
  const specToReview = !approval.decided && approval.action === "approve_spec" && typeof approval.detail.specId === "string"
    ? approval.campaignId
    : null;
  const people = approval.people;
  const named = allPeople ? people : people.slice(0, FIRST_PEOPLE);
  const emails = approval.emails;
  const heading =
    head?.label ?? (emails.length ? emailHead(emails) : schedule ? scheduleHead(blocks) : remember ? rememberHead(approval.detail) : ACTION_LABEL[approval.action]) ?? "Needs your OK";

  return (
    <article className="rep-card lt-approval">
      <header className="rep-app">
        {head && (
          /* The destination's own mark: a message could go to either, and the heading names a
             channel, not the app. */
          <ConnectorLogo id={head.service === "slack" ? "slack" : "notion"} size={16} decorative />
        )}
        {schedule && (
          <span className="lt-app-mark" aria-hidden="true"><CalendarCheck size={15} weight="fill" /></span>
        )}
        <span className="rep-app-name">{heading}</span>
      </header>

      {outcome ? (
        <OutcomeBody outcome={outcome} campaignId={approval.campaignId} />
      ) : (
        <>
          {/* The server's summary of a post or a note is the same words as the preview under it, so
              where the preview is there it is not said twice. */}
          {!preview && !note && blocks.length === 0 && emails.length === 0 && <p className="rep-para">{approval.summary}</p>}
          {emails.map((m, i) => (
            <blockquote key={`${m.to}${i}`} className="lt-quote">
              <span className="lt-quote-w">To {m.to}</span>
              {m.subject && <strong className="lt-quote-t">{m.subject}</strong>}
              <p className="lt-mail-body">{m.body}</p>
            </blockquote>
          ))}
          {blocks.length > 0 && (
            <ul className="lt-sched">
              {blocks.map((b, i) => {
                const Mark = KIND_ICON[b.kind] ?? CalendarCheck;
                return (
                  <li key={`${b.kind}${i}`} className="lt-sched-i">
                    <span className="lt-sched-ico" aria-hidden="true"><Mark size={16} /></span>
                    <div className="lt-sched-b">
                      <p className="lt-sched-what">{b.what}</p>
                      {b.quote && (
                        <blockquote className="lt-quote">
                          {b.quote.title && <strong className="lt-quote-t">{b.quote.title}</strong>}
                          {b.quote.body && <p>{b.quote.body}</p>}
                        </blockquote>
                      )}
                      <p className="lt-sched-when">{[b.when, b.repeat].filter(Boolean).join(" · ")}</p>
                      {b.note && <p className="lt-sched-note">{b.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {notes.map((n) => <p key={n} className="lt-note">{n}</p>)}
          {note && (
            <>
              <blockquote className="lt-quote"><p>{note.note}</p></blockquote>
              {note.said && <p className="lt-said">You said: “{note.said}”</p>}
              {note.replaces && <p className="lt-said">This replaces an older note.</p>}
            </>
          )}
          {preview && (
            <blockquote className="lt-quote">
              {preview.where && <span className="lt-quote-w">In {preview.where}</span>}
              {preview.title && <strong className="lt-quote-t">{preview.title}</strong>}
              {preview.body && <p>{preview.body}</p>}
            </blockquote>
          )}
          {people.length > 0 && !schedule && (
            <div className="ap-sec">
              <span className="ap-k">Who it is for</span>
              {people.length > 1 ? (
                <ul className="lt-affected">
                  {named.map((p, i) => (
                    <li key={`${p.name}${i}`}>
                      <span className="lt-affected-name">{p.name}</span>
                      <span className="lt-affected-meta">{personLine(p)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ap-v">{people[0]?.name}{personLine(people[0] ?? { title: null, company: null, city: null }) ? `, ${personLine(people[0] ?? { title: null, company: null, city: null })}` : ""}</p>
              )}
              {people.length > FIRST_PEOPLE && (
                <button type="button" className="lt-link ap-more" onClick={() => setAllPeople((v) => !v)}>
                  {allPeople ? "Show fewer" : `and ${people.length - FIRST_PEOPLE} more`}
                </button>
              )}
            </div>
          )}
          {wont.length > 0 && (
            <div className="ap-sec">
              <span className="ap-k">What it won't do</span>
              {wont.map((w) => <p key={w} className="ap-v">{w}</p>)}
            </div>
          )}
          {specToReview && (
            <p className="lt-review">
              <button type="button" className="lt-link" onClick={() => setSpecOpen(true)}>Read the role spec first</button>
            </p>
          )}
          {outside && <ConnectCard provider={NEEDS[outside].provider} reason={NEEDS[outside].why} turnSaid={turnSaid} compact />}
          {gmailOff && <ConnectCard provider="google" reason="Your emails go out from your own Gmail, so this is the one thing to connect." turnSaid={turnSaid} compact />}
          <div className="lt-actions">
            <button
              type="button"
              className="rep-commit"
              disabled={approval.deciding || stale}
              onClick={() => void decide(turnKey, approval.seq, "approve")}
            >
              {approval.deciding ? "Working" : "Approve"}
            </button>
            <button
              type="button"
              className="rep-act"
              disabled={approval.deciding}
              onClick={() => void decide(turnKey, approval.seq, "decline")}
            >
              Not now
            </button>
          </div>
          {/* A yes that takes a while says what it is doing, line by line, where it was given. */}
          {approval.deciding && phases.length > 0 && <PhaseTimeline lines={phases} working />}
        </>
      )}
      {approval.error && <p className="lt-note">{approval.error}</p>}
      {specToReview && (
        <Dialog open={specOpen} onClose={() => setSpecOpen(false)} label="Role spec" size="md">
          <div className="lt-spec"><RoleSpecPanel campaignId={specToReview} /></div>
        </Dialog>
      )}
    </article>
  );
}

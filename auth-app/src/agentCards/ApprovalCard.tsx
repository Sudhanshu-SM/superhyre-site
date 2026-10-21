import { Bell, CalendarCheck, CaretDown, CaretUp, ChartBar, CheckSquare, EnvelopeSimple, NotionLogo, SlackLogo } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { ConnectProvider } from "../agentEvents";
import { gmailStateOf } from "../api/identity";
import { ConnectorLogo } from "../ConnectorLogo";
import {
  CHANGED_AGAIN, helpLinkLabel, helpLinkOf, isOutsideAction, isRememberAction, isScheduleAction, outsideHead, outsidePreview, personLine, peopleSaidIn, rememberHead, rememberPreview,
  scheduleBlocks, scheduleHead,
} from "../chatCards";
import { useConnections } from "../connectionsStore";
import { SlowNote } from "../components/SlowNote";
import { DECISION_LIMIT_MS, decide } from "../liveChat";
import { useSlowWhile } from "../slowState";
import { covers } from "../restated";
import type { Approval } from "../liveChat";
import { BatchPreview } from "./BatchPreview";
import { ConnectCard, isConnected } from "./ConnectCard";
import { Cta } from "./Cta";
import { MeetingCard } from "./MeetingCard";
import { isMeetingAction } from "./meetingModel";
import { EmailOutcome } from "./EmailOutcome";
import { OutcomeBody } from "./OutcomeCard";
import { SpecButton } from "./RoleSpecCard";
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

/** The email actions that go out from the person's own Gmail, as the server names them. */
const SENDS_EMAIL = new Set(["send_email", "send_test_email"]);

/** What the button says while the yes is being carried out: the verb of what is happening. */
export function workingWord(action: string): string {
  if (SENDS_EMAIL.has(action) || action === "schedule") return "Sending…";
  if (action === "slack_message") return "Posting…";
  if (action === "notion_note") return "Saving…";
  if (action === "disconnect_app") return "Disconnecting…";
  return "Working…";
}

/** A refusal that is about a connection: it goes away once that connection is made, instead of lingering. */
const ABOUT_CONNECTION = /\b(?:isn'?t connected|needs to be reconnected|connect it below)\b/i;

/**
 * The server's notes on a card were true when it was made. "Gmail isn't connected yet" is not once the person
 * has connected it (the connect card beside it says so): it goes, rather than sit beside "Google is connected". The same for "needs to be reconnected".
 */
export function liveNotes(notes: readonly string[], googleConnected: boolean): string[] {
  return googleConnected ? notes.filter((n) => !/\b(?:gmail|google)\b[^.]*\b(?:isn'?t connected|needs to be reconnected)\b/i.test(n)) : [...notes];
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
  return emails.length === 1 ? `Send this to ${first}?` : `Send ${emails.length} emails?`;
}

/** How many people an approval names before it folds the rest. */
const FIRST_PEOPLE = 5;

/**
 * Something with real effects waits here for the person's yes: what will happen, who it affects, what it will
 * not do, and two buttons. Answered, the same card turns into what it did, in place: the counts, and the next
 * step as one click.
 */
export function ApprovalCard(props: Parameters<typeof PlainApproval>[0]): JSX.Element {
  /* A meeting, a move, a cancellation and a reminder have a card of their own (who, when, the Meet link, other times). */
  return isMeetingAction(props.approval.action)
    ? <MeetingCard turnKey={props.turnKey} approval={props.approval} connectShown={props.connectShown} />
    : <PlainApproval {...props} />;
}

function PlainApproval({ turnKey, approval, turnSaid, phases = [], connectShown = [], said = "" }: {
  turnKey: string;
  approval: Approval;
  turnSaid: string;
  /** What the agent wrote above this card: an answered card does not say again what those words already say. */
  said?: string;
  /** What the approved action says it is doing, line by line, while it runs: "Reading the job description", "Drafting the role spec". */
  phases?: readonly PhaseLine[];
  /** The connections this turn already has a card for: the approval does not put a second one beside it. */
  connectShown?: readonly ConnectProvider[];
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
  const hasEmail = blocks.some((b) => b.kind === "email") || SENDS_EMAIL.has(approval.action);
  const gmailOff = hasEmail && conns.status === "ready" && (!conns.google || gmailStateOf(conns.google) !== "connected");
  const gmailOn = conns.status === "ready" && Boolean(conns.google) && gmailStateOf(conns.google!) === "connected";
  /* The connection an answer may be blocked on, and whether it is there now. */
  const needs: ConnectProvider | null = outside ? NEEDS[outside].provider : hasEmail ? "google" : null;
  const needsOk = needs === null || (conns.status === "ready" && isConnected(conns, needs));
  /* The turn has a card for this connection: it says what to connect and holds the button, so this card says nothing of its own
     about it and waits on it. */
  const theirs = needs !== null && connectShown.includes(needs);
  const blocked = theirs && conns.status === "ready" && !needsOk;
  const allNotes = approval.decided?.decision === "decline"
    ? []
    : [...liveNotes(approval.notes, gmailOn), ...(gmailOff && !approval.notes.some((n) => /gmail/i.test(n)) ? [GMAIL_OFF] : [])]
      .filter((n) => !(theirs && ABOUT_CONNECTION.test(n)));
  const outcome = outcomeModel(approval);
  /* "Only their place on the board changes" is not said under "Hiring X also removes them from the shortlists of Y": the note is the truth. */
  const hiring = approval.action === "move" && approval.notes.some((n) => /\balso removes them from\b/i.test(n));
  const wont = approval.decided ? [] : wontDo(approval).map((w) => (hiring ? w.replace(/\s*Only their place on the board changes\./, "") : w));
  const [allPeople, setAllPeople] = useState(false);
  /* A yes that takes a while says so (its own limit ends the wait with a refusal and Try again, so no harder line here). */
  const slow = useSlowWhile(approval.deciding, { soft: 12_000, hard: DECISION_LIMIT_MS + 10_000 });
  /* A role spec that waits for this yes (a closed campaign) can be read, and edited, before it is approved. */
  const specToReview = !approval.decided && approval.action === "approve_spec" && typeof approval.detail.specId === "string"
    ? approval.campaignId
    : null;
  const people = approval.people;
  const named = allPeople ? people : people.slice(0, FIRST_PEOPLE);
  const emails = approval.emails;
  const heading =
    head?.label ??
    (approval.action === "send_test_email"
      ? "Send yourself a test email?"
      : approval.action === "disconnect_app"
        ? approval.summary
        : emails.length ? emailHead(emails) : schedule ? scheduleHead(blocks) : remember ? rememberHead(approval.detail) : ACTION_LABEL[approval.action]) ?? "Needs your OK";
  /* What went wrong, said where the card is: the refusal just now, or the one a returning card had before the
     chat was left (the run kept it as a line that did not finish). A refusal about a connection that has
     been made since is not told again. */
  const failedLine = !approval.decided && !approval.deciding ? phases.find((p) => p.state === "failed") : undefined;
  const refusal = approval.decided ? null : approval.error ?? failedLine?.label ?? null;
  const trouble = refusal && ABOUT_CONNECTION.test(refusal) && (needsOk || theirs) && needs !== null ? null : refusal;
  /* One reason at a time: once the refusal says it, the earlier "won't go out until it is connected" line is not said again. */
  const notes = trouble && ABOUT_CONNECTION.test(trouble) ? allNotes.filter((n) => !ABOUT_CONNECTION.test(n)) : allNotes;
  /* Where the fix is when it is not here (the Gmail API switched on in the Google project): a quiet link. */
  const help = trouble ? helpLinkOf(approval.help, trouble) : null;
  /* Which Gmail it goes from, said once, for an email that waits for a yes. */
  const account = conns.google?.accountEmail ?? null;
  const fromAccount = !approval.decided && hasEmail && gmailOn && account && !notes.some((n) => n.includes(account)) ? account : null;

  /* Who it is for is not listed again under a card whose own words already name them (a task given to Dev Malhotra). */
  const summaryShown = !preview && !note && blocks.length === 0 && emails.length === 0;
  const peopleSaid = peopleSaidIn(people, `${heading} ${summaryShown ? approval.summary : ""}`);

  /* Answered, it is no longer a question: no "Needs your OK" header and no box. It reads like every other
     outcome, as plain words with the next steps under them, and says what was done and nothing about waiting. */
  if (outcome) {
    /* "Gmail isn't connected yet, so emails will wait until it is" was true when it was scheduled, not once it is connected. */
    const fresh = gmailOn ? { ...outcome, summary: outcome.summary.replace(/\s*Gmail isn't connected yet, so emails will wait until it is\.?/i, "") } : outcome;
    const told = said !== "" && covers(said, fresh.summary);
    /* An email card is the whole of its outcome: who it reached, who it did not and why, and Try again on it. */
    if (outcome.email) return <EmailOutcome turnKey={turnKey} approval={approval} outcome={told ? { ...fresh, summary: "" } : fresh} campaignId={approval.campaignId} />;
    return <OutcomeBody outcome={told ? { ...fresh, summary: "" } : fresh} campaignId={approval.campaignId} plain />;
  }

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
        {!head && !schedule && SENDS_EMAIL.has(approval.action) && (
          /* An email goes out from the person's own Gmail: its mark, as Slack's and Notion's stand on theirs. */
          <ConnectorLogo id="gmail" size={16} decorative />
        )}
        <span className="rep-app-name">{heading}</span>
      </header>

      {/* The server's summary of a post or a note is the same words as the preview under it, so
          where the preview is there it is not said twice. */}
      {summaryShown && <p className="rep-para">{approval.summary}</p>}
      {emails.length === 1 && emails.map((m, i) => (
        <blockquote key={`${m.to}${i}`} className="lt-quote">
          <span className="lt-quote-w">To {m.to}{m.address && <span className="lt-quote-addr"> {m.address}</span>}</span>
          {m.subject && <strong className="lt-quote-t">{m.subject}</strong>}
          <p className="lt-mail-body">{m.body}</p>
        </blockquote>
      ))}
      {/* Several: who they go to once, the first as a sample, and the rest to read one at a time. */}
      {emails.length > 1 && (
        <BatchPreview items={emails.map((m) => ({ who: m.to, address: m.address, line: m.subject, title: m.subject, body: m.body }))} />
      )}
      {blocks.length > 2 && (
        <BatchPreview
          noun="things"
          items={blocks.map((b) => ({
            who: b.what,
            address: b.address,
            line: [b.when, b.repeat].filter(Boolean).join(" · "),
            title: b.quote?.title ?? null,
            body: b.quote?.body ?? null,
          }))}
        />
      )}
      {blocks.length > 0 && blocks.length <= 2 && (
        <ul className="lt-sched">
          {blocks.map((b, i) => {
            const Mark = KIND_ICON[b.kind] ?? CalendarCheck;
            return (
              <li key={`${b.kind}${i}`} className="lt-sched-i">
                <span className="lt-sched-ico" aria-hidden="true"><Mark size={16} /></span>
                <div className="lt-sched-b">
                  <p className="lt-sched-what">{b.what}{b.address && <span className="lt-quote-addr"> {b.address}</span>}</p>
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
      {people.length > 0 && !schedule && emails.length === 0 && !peopleSaid && (
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
            <Cta small bare icon={allPeople ? CaretUp : CaretDown} className="ap-more" onClick={() => setAllPeople((v) => !v)}>
              {allPeople ? "Show fewer" : `${people.length - FIRST_PEOPLE} more`}
            </Cta>
          )}
        </div>
      )}
      {wont.length > 0 && (
        <div className="ap-sec">
          <span className="ap-k">What it won't do</span>
          {wont.map((w) => <p key={w} className="ap-v">{w}</p>)}
        </div>
      )}
      {specToReview && <div className="cta-row"><SpecButton campaignId={specToReview} campaignName={approval.campaignName ?? "the campaign"} /></div>}
      {fromAccount && (
        <p className="lt-quote-w lt-from">From {fromAccount}</p>
      )}
      {/* What went wrong is said first and the way to mend it (Connect, the link) under it, inside this card. */}
      {trouble && <p className="kc-problem" role="alert">{trouble}</p>}
      {trouble && help && <div className="cta-row"><Cta href={help}>{helpLinkLabel(help)}</Cta></div>}
      {outside && !connectShown.includes(NEEDS[outside].provider) && (
        <ConnectCard provider={NEEDS[outside].provider} reason={NEEDS[outside].why} turnSaid={turnSaid} compact />
      )}
      {gmailOff && !connectShown.includes("google") && (
        <ConnectCard provider="google" reason="Your emails go out from your own Gmail, so this is the one thing to connect." turnSaid={turnSaid} compact quiet />
      )}
      <div className="lt-actions">
        <button
          type="button"
          className="rep-commit"
          disabled={approval.deciding || stale || blocked}
          onClick={() => void decide(turnKey, approval.seq, "approve")}
        >
          {approval.deciding ? workingWord(approval.action) : trouble && !stale ? "Try again" : "Approve"}
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
      {approval.deciding && <SlowNote level={slow} soft="Taking longer than usual. It is still working on it." />}
    </article>
  );
}

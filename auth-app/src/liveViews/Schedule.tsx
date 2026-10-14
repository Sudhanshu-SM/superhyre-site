import { CalendarBlank } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { ApiBoardRow } from "../api/campaigns";
import { boardRows } from "../api/campaigns";
import { messageOf } from "../api/client";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import { useCampaignRows } from "../campaignStore";
import { candidateFromCardPerson } from "../liveCandidate";
import { putSet } from "../liveCandidates";
import { reloadFeed, useFeed } from "../schedulesStore";
import { Loader } from "../components/Loader";
import { nextTime, schedulesHrefFor, soonLabel, summaryText, whenLabel } from "../schedulesView";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import "../moments.css";
import "../liveCompareEtc.css";
import { campaignAsk, resolvedCampaignId } from "./ask";
import { PhaseRun } from "./PhaseRun";
import { askEveryone, askForTimes, whoToSchedule } from "./scheduleLogic";
import type { LiveViewProps } from "./types";

/**
 * Interviews for a campaign, honestly. The people are the campaign's real board; there is no
 * calendar behind the console, so nothing here sees free times, holds a slot or books. What it
 * can do is real: put a message asking the person for times in the composer, for the recruiter
 * to send. (The demo's WhatsApp gate is left out: that connection isn't real either.)
 *
 * Under it, what IS scheduled for the campaign: the emails, posts, tasks and reminders set up to
 * happen later, from the same list as the Scheduled screen.
 */

export default function ScheduleView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const ask = useMemo<Ask>(() => campaignAsk(card, rows, { ask: "Which campaign are the interviews for?" }), [card, rows]);
  return (
    <div className="src mo">
      <Clarified kind="schedule" ctx={ctx} ask={ask}>
        {(c) => <Board card={card} ctx={c} />}
      </Clarified>
    </div>
  );
}

type State = { status: "loading" } | { status: "failed"; error: unknown } | { status: "ready"; rows: ApiBoardRow[] };

function Board({ card, ctx }: LiveViewProps): JSX.Element {
  const campaigns = useCampaignRows();
  const campaignId = resolvedCampaignId(card, ctx);
  const name = campaigns.find((r) => r.id === campaignId)?.name ?? card.campaignName ?? "this campaign";
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (!campaignId) return;
    let live = true;
    boardRows(campaignId).then(
      (rows) => { if (live) setState({ status: "ready", rows }); },
      (error) => { if (live) setState({ status: "failed", error }); },
    );
    return () => { live = false; };
  }, [campaignId]);

  const rows = state.status === "ready" ? state.rows : null;
  const { groups, named } = useMemo(
    () => (rows ? whoToSchedule(rows, ctx.said, [...card.candidateIds, ...card.personIds]) : { groups: [], named: false }),
    [rows, ctx.said, card.candidateIds, card.personIds],
  );
  const people = groups.flatMap((g) => g.rows);

  /* Registered so a name opens the console's profile sheet. They are on the board already: nothing to decide here. */
  useEffect(() => {
    if (!people.length) return;
    const candidates = people.flatMap((r) => {
      const c = candidateFromCardPerson({ personId: null, candidateId: r.candidateId, name: r.fullName, title: r.currentTitle, company: r.currentCompanyName, city: r.city, years: r.yearsOfExperience, strengths: [], linkedinUrl: r.linkedinUrl });
      return c ? [c] : [];
    });
    putSet({ key: `schedule:${campaignId}`, campaignId: null, candidates, criteria: [], reasons: {}, total: candidates.length });
  }, [people.length, campaignId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [state.status, grow]);

  if (state.status === "failed") return <p className="lv-note" role="alert">{messageOf(state.error)}</p>;
  const interviewing = groups.find((g) => g.stage === "interviewing")?.rows.length ?? 0;
  return (
    <PhaseRun
      id="sc-board"
      live="Looking at who's in line for interviews"
      done={named ? "Found who you asked about" : `Found ${interviewing} interviewing, ${groups.find((g) => g.stage === "shortlisted")?.rows.length ?? 0} shortlisted`}
      running={!rows}
      onGrow={ctx.onGrow}
    >
      {rows && <Card groups={groups} named={named} campaignName={name} campaignId={campaignId} ctx={ctx} />}
    </PhaseRun>
  );
}

function Card({ groups, named, campaignName, campaignId, ctx }: { groups: ReturnType<typeof whoToSchedule>["groups"]; named: boolean; campaignName: string; campaignId: string | null; ctx: MomentCtx }): JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const all = groups.flatMap((g) => g.rows);
  const ids = all.map((r) => r.candidateId);
  const interviewing = groups.find((g) => g.stage === "interviewing")?.rows ?? [];
  /* Someone on the do-not-contact list is never asked for a time, singly or in a batch. */
  const askable = interviewing.filter((r) => !r.doNotContact);
  /* Those in interviews are who needs a time; the shortlist waits behind a line unless it is all there is. */
  const folded = !named && interviewing.length > 0;
  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [showAll, grow]);

  const people = (rows: ApiBoardRow[]) => (
    <ul className="lv-people">
      {rows.map((r) => (
        <li key={r.campaignCandidateId}>
          <button type="button" className="lv-person" onClick={() => ctx.openProfile(r.candidateId, ids)}>
            <b>{r.fullName}</b>
            <span>{[[r.currentTitle, r.currentCompanyName].filter(Boolean).join(" at "), r.city].filter(Boolean).join(", ")}</span>
          </button>
          {r.doNotContact ? (
            /* Nobody writes to them from here: plain words, no button. */
            <span className="lv-note">Do not contact</span>
          ) : (
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => act(ctx, askForTimes(r.fullName, campaignName))}>
              Ask for times
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="mo-card" aria-label="Interviews">
      <div className="mo-card-h">
        <CalendarBlank size={16} aria-hidden="true" />
        <b>Interviews for {campaignName}</b>
        <span>{named ? "who you asked about" : interviewing.length ? "who's in interviews" : "who's shortlisted"}</span>
      </div>
      <p className="lv-note">
        No calendar is connected yet, so I can't see free times or hold a slot, and nothing gets booked from here. I can write to someone asking when they're free; you send it.
      </p>
      {all.length === 0 ? (
        <p className="lv-note">Nobody is interviewing or shortlisted on this campaign yet.</p>
      ) : (
        groups.map((g) => {
          if (folded && g.stage !== "interviewing" && !showAll) {
            return (
              <p key={g.stage} className="lv-note">
                {g.rows.length} {g.rows.length === 1 ? "other is" : "others are"} {g.label.toLowerCase()} and not in interviews yet.{" "}
                <button type="button" className="lt-link" onClick={() => setShowAll(true)}>Show them</button>
              </p>
            );
          }
          return (
            <div key={g.stage} className="lv-group">
              <p className="mo-grp">{g.label}</p>
              {people(g.rows)}
            </div>
          );
        })
      )}
      {campaignId && <ScheduledHere campaignId={campaignId} campaignName={campaignName} onGrow={ctx.onGrow} />}
      {askable.length > 1 && (
        <div className="mo-card-f">
          <span>One message for each, put in the composer for you to send.</span>
          <button type="button" className="src-btn is-primary mo-small" onClick={() => act(ctx, askEveryone(askable.map((r) => r.fullName), campaignName))}>
            Ask all {askable.length} interviewing
          </button>
        </div>
      )}
    </section>
  );
}

/** How many of what is scheduled for the campaign the card lists before pointing to the full screen. */
const LISTED = 4;

/**
 * What is set to happen later for this campaign. It says plainly that nothing here books an
 * interview: these are emails, posts, tasks and reminders, from the same list as the Scheduled screen.
 */
function ScheduledHere({ campaignId, campaignName, onGrow }: { campaignId: string; campaignName: string; onGrow: () => void }): JSX.Element {
  const feed = useFeed({ status: "upcoming", kind: "all", campaignId }, { poll: true });
  const grow = onGrow;
  useEffect(() => { grow(); }, [feed.phase, feed.items.length, grow]);
  const shown = feed.items.slice(0, LISTED);
  const rest = feed.items.length - shown.length;

  return (
    <div className="lv-group lv-later">
      <p className="mo-grp">Scheduled for this campaign</p>
      {feed.phase === "failed" ? (
        <p className="lv-note" role="alert">
          Couldn't load what's scheduled.{" "}
          <button type="button" className="lt-link" onClick={() => void reloadFeed({ status: "upcoming", kind: "all", campaignId })}>Try again</button>
        </p>
      ) : feed.phase !== "ready" ? (
        <p className="pt-first"><Loader size="sm" /> Looking at what's scheduled</p>
      ) : shown.length === 0 ? (
        <p className="lv-note">Nothing is scheduled for {campaignName} yet. Ask me to email someone later, or to remind you.</p>
      ) : (
        <ul className="lv-later-list">
          {shown.map((i) => (
            <li key={i.id}>
              <span className="lv-later-when">
                {whenLabel(nextTime(i), i.timezone, { viewerTz: i.timezone })}
                {soonLabel(nextTime(i)) && <small>{soonLabel(nextTime(i))}</small>}
              </span>
              <span className="lv-later-what">
                {summaryText(i)}
                {i.doNotContact && <small> · will not be sent: do not contact</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {feed.phase === "ready" && (
        <p className="lv-note">
          {rest > 0 && `${rest}${feed.next ? "+" : ""} more. `}
          <a className="lt-link" href={schedulesHrefFor(campaignId)}>{shown.length ? "See everything coming up" : "Open Coming up"}</a>
        </p>
      )}
    </div>
  );
}

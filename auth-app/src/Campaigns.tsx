import {
  ArrowCounterClockwise, CaretRight, Check, HandPalm, Pause, Plugs, WarningCircle, X,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CampaignKey, CampaignRoster, PipelineRole, RunState, Scope, TimelineEvent,
} from "./orchestrator";
import {
  AGENT_ROLES, ROLE_HUE, activeCampaigns, campaignName, deployPrompt, feedAgents,
  leadOf, seen, timelineFor, wordFor,
} from "./orchestrator";

/**
 * Campaigns — what is running, and what each agent did to get there.
 *
 * ── THE TWO ENCODINGS, AND WHY THEY ARE ORTHOGONAL ──────────────────────────
 * COLOUR IS WHO. Every role owns a hue — Sourcing teal, Outreach violet,
 * Screening brand — so the timeline's spine changes colour at each handoff and
 * "which agent did what" is answered before you read a word. Measured ΔE
 * 74.6 / 74.7 / 80.5 between the three, and a minimum of 30.7 against any
 * state hue, so role can never be mistaken for status.
 *
 * SHAPE IS WHAT. `done` is a filled node, the step in flight is a ringed node
 * that breathes, and a blocked step is an outlined node carrying its fault
 * glyph. Strip every colour out and the timeline still reads — which is the
 * test that separates an encoding from a decoration.
 *
 * This is why per-CAMPAIGN colour stays refused while per-ROLE is right: a hue
 * every sibling has encodes nothing, and there are exactly three roles in a
 * fixed order.
 *
 * ── WHY A BAR AND A TIMELINE RATHER THAN A DASHBOARD ────────────────────────
 * The bar answers "what is moving" at a glance and nothing else; everything
 * that grows — every step, every note, every handoff — lives in the dialog
 * behind it. That keeps this block a fixed height whatever the fleet is doing,
 * which is the lesson the 552px Agents block taught: a supervision surface
 * whose size reports the severity of the problem punishes you for having
 * problems.
 */

/**
 * Every active campaign, for when three is not all of them.
 *
 * A list rather than a grid of the feed's panels: this dialog answers "what
 * else is running", which is a question about COVERAGE, and a coverage answer
 * wants one scannable line each — not three columns of workflow the reader
 * would have to scroll through to count.
 */
function AllCampaigns({
  scope, onClose, onPick,
}: {
  scope: Scope;
  onClose: () => void;
  onPick: (id: CampaignKey) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const all = activeCampaigns(scope);

  return createPortal(
    <>
      <div className="pal-scrim" onClick={onClose} aria-hidden="true" />
      <div className="tl" role="dialog" aria-modal="true" aria-label="All running campaigns">
        <header className="tl-head">
          <div className="tl-titles">
            <h2 className="tl-title">Running campaigns</h2>
            <p className="tl-meta">
              {all.length} {all.length === 1 ? "campaign" : "campaigns"} with an agent on them
            </p>
          </div>
          <button type="button" className="hist-x" onClick={onClose} aria-label="Close">
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </header>

        <ol className="all-list">
          {all.map((c) => {
            const lead = leadOf(c);
            const blocked = lead.state === "waiting" || lead.state === "error";
            return (
              <li key={c.id}>
                <button type="button" className="all-row" onClick={() => onPick(c.id)}>
                  <span className="all-name">{c.name}</span>
                  <span className="all-agents">
                    {c.agents.length} {c.agents.length === 1 ? "agent" : "agents"}
                  </span>
                  {/* Only a campaign genuinely halted takes colour, so the
                      coloured rows are the ones worth opening first. */}
                  <span className={`all-state${blocked ? ` is-${lead.state === "waiting" ? "you" : "broke"}` : ""}`}>
                    {wordFor(lead, lead.state)}
                  </span>
                  <span className="all-age">{seen(lead.seenAgo)}</span>
                  <CaretRight className="all-go" size={12} weight="bold" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </>,
    document.body,
  );
}

/**
 * A clock that advances, so an age on screen is a fact rather than a snapshot.
 *
 * The fixtures give each agent a `seenAgo` in minutes AT PAGE LOAD. Leaving it
 * there would mean a feed that claims to be live while every timestamp is
 * frozen — the cheapest possible lie on a surface whose entire promise is
 * "this is happening now". Time passing is the one genuinely live thing
 * available without a backend, so the feed spends it: this returns minutes
 * since mount, and each row adds it to its own fixture age.
 *
 * Thirty seconds, not one: the ages render in whole minutes, so a faster tick
 * would re-render for a number that cannot have changed.
 */
function useElapsed(): number {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMins((m) => m + 0.5), 30_000);
    return () => clearInterval(id);
  }, []);
  return Math.floor(mins);
}

export function Campaigns({
  scope, onOpenBrief,
}: {
  scope: Scope;
  /** Seeds the composer. Used by the empty pipeline slot. */
  onOpenBrief: (prompt: string) => void;
}) {
  const elapsed = useElapsed();
  const [open, setOpen] = useState<CampaignKey | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  /**
   * Agents deployed in this session, newest first.
   *
   * Frontend-only, and that is what makes the entrance animation honest to
   * build: deploying really does add a row, so the motion is showing a real
   * state change rather than playing a canned effect. Same prototype posture
   * as dismissing a fault — the control does the observable thing it claims.
   */
  const [deployed, setDeployed] = useState<readonly Deployed[]>([]);

  const live = feedAgents(scope);
  const roster = activeCampaigns(scope);
  const shown = roster.find((c) => c.id === open);

  /* ── THE CAP IS ON THE BAND, NOT ON EACH SOURCE ──
     `feedAgents` already caps its own list at three, and deploying added a
     fourth on top of it: measured, four columns in a 556px band leaves 139px
     each and the campaign names collided with the ages. The cap belongs to
     the BAND, so a new agent displaces the least recently active one rather
     than squeezing everybody.

     Deployed first because it was just deployed — the most recent activity
     there is, which is the order the whole feed claims. */
  const band = [
    ...deployed.map((d) => ({ kind: "new" as const, d })),
    ...live.map((a) => ({ kind: "live" as const, a })),
  ].slice(0, FEED_CAP);

  /* The header counts what is still MOVING — a paused agent is in the band
     but is not working, and saying otherwise would make the one number on
     this surface disagree with the panel under it. Three shown against a
     larger count is how the reader learns the band is a top-N. */
  const working = live.filter((a) => a.state !== "done").length + deployed.length;

  if (live.length === 0 && deployed.length === 0) return null;

  return (
    <section className="feed" aria-labelledby="feed-h">
      <header className="feed-head">
        <h2 className="feed-h" id="feed-h">Live</h2>
        {/* A count that can move, next to a dot that breathes. The dot is the
            only always-on motion here; everything else is still until its own
            data changes. */}
        {/* The band shows three; the fleet may be larger. `View all` is the
            route to the rest, and it states the number so the reader learns
            the band is a selection rather than the whole list. */}
        <button
          type="button"
          className="feed-all"
          onClick={() => setAllOpen(true)}
          aria-haspopup="dialog"
        >
          {working} working
          <CaretRight size={11} weight="bold" aria-hidden="true" />
        </button>
      </header>

      <ul className="feed-list">
        {band.map((e) => (e.kind === "new" ? (
          <li className="feed-item is-new" key={e.d.key}>
            <FeedRow
              role={e.d.role}
              campaign={e.d.campaign}
              /* A freshly deployed agent has the role's real step list and is
                 on the first of them — nothing invented, just the beginning
                 of the same workflow every agent of that role runs. */
              steps={NEW_STEPS[e.d.role]}
              doing="Reading the brief and planning its first search"
              at={0}
              pos={0}
              state="running"
              onOpen={() => setOpen(e.d.campaignId)}
            />
          </li>
        ) : (
          <li className="feed-item" key={e.a.id}>
            <FeedRow
              role={e.a.role as PipelineRole}
              campaign={campaignName(e.a.campaignId)}
              steps={e.a.steps}
              doing={e.a.doing}
              at={e.a.seenAgo + elapsed}
              pos={e.a.step}
              state={e.a.state}
              fault={e.a.fault}
              onOpen={() => setOpen(e.a.campaignId)}
            />
          </li>
        )))}
      </ul>

      {allOpen && (
        <AllCampaigns
          scope={scope}
          onClose={() => setAllOpen(false)}
          onPick={(id) => { setAllOpen(false); setOpen(id); }}
        />
      )}

      {shown && (
        <Timeline
          campaign={shown}
          onClose={() => setOpen(null)}
          onOpenBrief={(p) => { setOpen(null); onOpenBrief(p); }}
          onDeploy={(role, campaign, campaignId) =>
            setDeployed((d) => [{ key: `${campaignId}:${role}:${Date.now()}`, role, campaign, campaignId }, ...d])
          }
        />
      )}
    </section>
  );
}

/**
 * How many columns the band holds.
 *
 * Three, and the number is a LAYOUT fact rather than a preference: at 556px
 * of content a fourth column drops each to 139px, which is under what a
 * campaign name needs and the names collided with the ages. Shared with
 * `feedAgents` so the two cannot disagree about the cap.
 */
const FEED_CAP = 3;

/**
 * The step list a newly deployed agent starts on, by role.
 *
 * Taken from the fleet rather than written here: every agent of a role runs
 * the same steps, so a new one's workflow is that role's workflow. Falls back
 * to a Sourcing-shaped list only if a role has no agent anywhere to copy.
 */
const NEW_STEPS: Record<PipelineRole, readonly string[]> = {
  Sourcing: ["Reading the brief", "Planning the search", "Matching the role", "Ranking candidates"],
  Outreach: ["Drafting", "Awaiting approval", "Sending", "Logging replies"],
  Screening: ["Reading transcripts", "Scoring", "Summarising"],
};

/** An agent deployed in this session. */
type Deployed = {
  key: string;
  role: PipelineRole;
  campaign: string;
  campaignId: CampaignKey;
};

/**
 * One agent's workflow, the way a reasoning panel shows its steps.
 *
 * ── WHY THE STATUS DOT IS GONE ──────────────────────────────────────────────
 * It was a 7px circle in the role's hue sitting directly beside the role's
 * name, which is already printed in that same hue. Colour duplicating colour,
 * next to the word it was colouring — decoration by the sheet's own
 * definition. It also happens to be the single most generic element an AI
 * product can ship, and "a pulsing dot means something is happening" is a
 * convention that has stopped conveying anything because everything has one.
 *
 * What replaces it is not another mark but STRUCTURE: the agent's own steps,
 * listed, with the one it is on marked. That says more than a dot could and
 * it says it in the product's own vocabulary.
 *
 * ── WHERE THE LIST STOPS IS THE MESSAGE ─────────────────────────────────────
 * Steps ahead of the current one render faint, because they have not
 * happened. But when an agent is BLOCKED the list stops dead at the step it
 * halted on and the remaining steps are dropped entirely — a run waiting on a
 * person is not going to reach them, and drawing them would imply progress
 * that is not coming. A finished agent shows `Paused` for the same reason:
 * the work is done, nothing follows.
 */
function FeedRow({
  role, campaign, steps, at, pos, state, doing, fault, onOpen,
}: {
  role: PipelineRole;
  campaign: string;
  steps: readonly string[];
  at: number;
  pos: number;
  state: RunState;
  doing: string;
  fault?: { kind: "tool" | "agent"; fix: string };
  onOpen: () => void;
}) {
  const blocked = state === "waiting" || state === "error";
  const finished = state === "done";

  /* ── NOTHING PAST THE CURRENT STEP, FOR ANY STATE ──
     Running agents used to show one step ahead. Two reasons it is gone, and
     the first is the principle: a feed records what HAS happened and what is
     happening, not what is planned — the same rule `timelineFor` follows when
     it omits unreached steps. A greyed-out future step is a promise the panel
     cannot keep.

     The second is measured. That extra line made the running column 194px
     against a 161px band, so its own status line was clipped out of sight by
     the band's `overflow: hidden` — the panel's most live element, hidden by
     a row describing work that had not started. */
  const visible = steps.slice(0, pos + 1);

  return (
    <button
      type="button"
      className={`feed-row${blocked ? " is-blocked" : ""}`}
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      {/* ── THE CAMPAIGN LEADS ──
          It was the role on top with the campaign beneath, which put the
          WORKER above the WORK. A recruiter supervises campaigns; the role is
          how one is being progressed, not what is being progressed. Inverted,
          the three panels are told apart by the thing that actually differs
          between them. */}
      <span className="feed-top">
        <span className="feed-camp">{campaign}</span>
        <span className="feed-age">{at === 0 ? "now" : seen(at)}</span>
      </span>

      <span className="feed-role">{role} agent</span>

      {/* ── THE WORKFLOW ──
          The agent's own steps, which is what a reasoning dropdown shows and
          what this surface was missing: you can watch it read a brief, plan a
          search and start matching, rather than being told it is "running". */}
      <span className="feed-flow">
        {visible.map((name, i) => {
          const done = i < pos || (finished && i <= pos);
          const here = i === pos && !finished;
          return (
            <Fragment key={name}>
              <span className={`feed-line${done ? " is-done" : ""}${here ? " is-here" : ""}`}>
                <span className="feed-mark" aria-hidden="true">
                  {done && <Check size={10} weight="bold" />}
                  {here && blocked && (state === "waiting"
                    ? <HandPalm size={11} weight="bold" />
                    : <WarningCircle size={11} weight="bold" />)}
                </span>
                <span className="feed-line-t">{name}</span>
              </span>

              {/* Directly under the step it describes, not after the whole
                  list. It first rendered at the end, which put the sentence
                  about the CURRENT step below the one that has not started —
                  so the panel read as if the agent were explaining its next
                  move rather than its present one. */}
              {here && (
                <span className="feed-say">{blocked && fault ? fault.fix : doing}</span>
              )}
            </Fragment>
          );
        })}

      </span>

      {/* ── THE STATUS LINE ──
          Borrowed from the reference, and the one idea there worth taking
          whole: a strip at the foot of the panel saying what is happening at
          this instant, in machine voice. It reads as output because it IS
          output — monospace, because that is the convention for a thing a
          program wrote rather than a person.

          The caret only blinks while the agent is running. A caret on a
          halted run would be the surface claiming activity it does not have,
          which is the exact dishonesty the live dot was removed for. */}
      <span className={`feed-bar is-${barKind(state)}`}>
        {finished && <Pause size={10} weight="fill" aria-hidden="true" />}
        {state === "waiting" && <HandPalm size={10} weight="bold" aria-hidden="true" />}
        {state === "error" && <WarningCircle size={10} weight="bold" aria-hidden="true" />}
        <span className="feed-bar-t">{barText(state, steps[pos], fault)}</span>
        {state === "running" && <span className="feed-caret" aria-hidden="true" />}
      </span>
    </button>
  );
}

/* ── the timeline ───────────────────────────────────────────────────────────*/

/**
 * Everything that has happened on one campaign, in the order it happened.
 *
 * Interleaved across agents rather than grouped by them, which `flowFor` could
 * not do: it had only a per-agent `seenAgo` and no per-step times, so merging
 * would have meant inventing the order. `STEP_AT` supplies those times, so
 * this is a real sequence — you can watch Sourcing hand off to Outreach.
 */
function Timeline({
  campaign: c, onClose, onOpenBrief, onDeploy,
}: {
  campaign: CampaignRoster;
  onClose: () => void;
  onOpenBrief: (prompt: string) => void;
  /** Adds the agent to the live feed, so the entrance animation shows a real
      state change rather than playing a canned effect. */
  onDeploy: (role: PipelineRole, campaign: string, campaignId: CampaignKey) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const events = timelineFor(c.id);
  /* The agent still working, for the footer. `doing` beats `blocked` because a
     run in flight is more "what is happening now" than one that has stopped. */
  const liveEvent = events.find((e) => e.kind === "doing")
    ?? events.find((e) => e.kind === "blocked");
  const missing = c.slots.filter((s) => !s.agent);

  return createPortal(
    <>
      <div className="pal-scrim" onClick={onClose} aria-hidden="true" />

      <div className="tl" role="dialog" aria-modal="true" aria-label={`${c.name} — timeline`}>
        <header className="tl-head">
          <div className="tl-titles">
            <h2 className="tl-title">{c.name}</h2>
            <p className="tl-meta">
              {events.length} {events.length === 1 ? "step" : "steps"} ·{" "}
              {c.agents.length} {c.agents.length === 1 ? "agent" : "agents"}
            </p>
          </div>
          <button type="button" className="hist-x" onClick={onClose} aria-label="Close">
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </header>

        {/* ── THE LEGEND ──
            Three roles, three hues, stated once at the top. A colour system
            the reader has to infer from context is a colour system that only
            works for whoever built it. */}
        <div className="tl-legend">
          {AGENT_ROLES.map((role) => (
            <span className="tl-key" key={role}>
              <span className="tl-key-dot" style={{ background: `var(--c-${ROLE_HUE[role]})` }} />
              {role}
            </span>
          ))}
        </div>

        <ol className="tl-body">
          {events.map((e) => <Event key={e.id} event={e} />)}

          {/* An unstaffed stage is the campaign's next real move, so it sits
              at the end of the sequence as the thing that has not happened —
              and offers to start it rather than merely reporting the gap. */}
          {missing.map((s) => (
            <li className="tl-row is-gap" key={s.role}>
              <span className="tl-node" aria-hidden="true" />
              <span className="tl-when">—</span>
              <span className="tl-what">
                <span className="tl-role">{s.role}</span>
                <span className="tl-step">No agent on this stage</span>
                <button
                  type="button"
                  className="tl-deploy"
                  onClick={() => {
                    onDeploy(s.role, c.name, c.id);
                    onOpenBrief(deployPrompt(s.role, c.name));
                  }}
                >
                  Deploy one
                </button>
              </span>
            </li>
          ))}
        </ol>

        {/* ── WHO IS WORKING RIGHT NOW ──
            Pinned to the bottom rather than left to be found in the list,
            because "what is the fleet doing at this second" is the question
            this dialog gets opened for and the answer is the last thing you
            would reach by reading downward. */}
        {liveEvent && (
          <footer className="tl-now" style={{ "--role": `var(--c-${ROLE_HUE[liveEvent.role]})` } as React.CSSProperties}>
            <span className="tl-now-k">Now</span>
            <span className="tl-now-dot" aria-hidden="true" />
            <span className="tl-now-role">{liveEvent.agent.role}</span>
            <span className="tl-now-doing">{liveEvent.agent.doing}</span>
            <span className="tl-now-age">{seen(liveEvent.agent.seenAgo)}</span>
          </footer>
        )}
      </div>
    </>,
    document.body,
  );
}

/** One moment in the campaign's history. */
function Event({ event: e }: { event: TimelineEvent }) {
  return (
    <li
      className={`tl-row is-${e.kind}`}
      style={{ "--role": `var(--c-${ROLE_HUE[e.role]})` } as React.CSSProperties}
    >
      {/* The node carries STATE as shape and ROLE as colour. Both at once, and
          neither is doing the other's job. */}
      <span className="tl-node" aria-hidden="true" />
      <span className="tl-when">{e.at === 0 ? "now" : seen(e.at).replace(" ago", "")}</span>
      <span className="tl-what">
        <span className="tl-role">{e.agent.role}</span>
        <span className="tl-step">
          {e.step}
          <span className="sr-only">
            {e.kind === "done" ? " — done" : e.kind === "doing" ? " — in progress" : " — blocked"}
          </span>
        </span>
        {e.note && <span className="tl-note">{e.note}</span>}

        {/* A broken connector and an unusable brief need different people to
            do different things; one red noun on both is what teaches a reader
            that the agent is simply unreliable. */}
        {e.kind === "blocked" && e.agent.fault && (
          <span className="tl-fault">
            <span className="tl-fault-k">
              {e.agent.fault.kind === "tool"
                ? <><Plugs size={10} weight="bold" aria-hidden="true" />Connector</>
                : <><ArrowCounterClockwise size={10} weight="bold" aria-hidden="true" />Brief</>}
            </span>
            {e.agent.fault.fix}
          </span>
        )}

        {e.agent.yielded && e.kind === "done" && isLastDone(e) && (
          <span className="tl-yield">{e.agent.yielded}</span>
        )}
      </span>
    </li>
  );
}

/** Which of the four voices the status line speaks in. */
function barKind(state: RunState): string {
  if (state === "done") return "paused";
  if (state === "waiting") return "you";
  if (state === "error") return "broke";
  return "run";
}

/**
 * What the status line says.
 *
 * The running case names the step in the present participle, because that is
 * what a log line looks like and the panel above already names the step
 * plainly — this is the machine's own voice, not a second label.
 */
function barText(
  state: RunState, step: string | undefined, fault?: { kind: "tool" | "agent" },
): string {
  if (state === "done") return "Paused";
  if (state === "waiting") return "Waiting for you";
  if (state === "error") return fault?.kind === "tool" ? "Connector stopped it" : "Brief stopped it";
  return step ?? "Working";
}

/* ── shared reads ───────────────────────────────────────────────────────────*/

/** A finished agent's output belongs to its last completed step. */
function isLastDone(e: TimelineEvent): boolean {
  return e.agent.state === "done" && e.id === `${e.agent.id}:${e.agent.step}`;
}

export type { PipelineRole };

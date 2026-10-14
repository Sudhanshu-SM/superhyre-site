import {
  ArrowCounterClockwise, CaretRight, Plugs, X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import "./agents.css";
import "./live.css";
import { createPortal } from "react-dom";
import type {
  CampaignKey, CampaignRoster, PipelineRole, Scope, TimelineEvent,
} from "./orchestrator";
import {
  AGENT_ROLES, ROLE_HUE, activeCampaigns, deployPrompt,
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
 * ── WHY A RAIL PANEL AND A TIMELINE RATHER THAN A DASHBOARD ─────────────────
 * The rail panel answers "what is moving" at a glance and nothing else; everything
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
 * `Date.now()`, refreshed every second while anything deployed this session
 * is still short of its last step, so the step and the counts move.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    /* Read the clock the moment it starts mattering: the stored value is from
       mount, which is earlier than an agent deployed since. */
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** How many agents the rail lists before the rest fold behind a button. */
const RAIL_SHOWN = 3;

/**
 * The agents at work, as a rail panel.
 *
 * Each row answers, top to bottom: what kind of agent and whether it is
 * running, which campaign it is on, what it is doing right now, and how far
 * along it is. Status is a word, not a coloured dot. Only a running agent
 * spends the accent, on its status word and its progress bar.
 *
 * Rows are a fixed shape whatever the agent is doing, so a step changing
 * never changes the rail's height. Only a new agent does, and the rail is
 * its own column: nothing in the conversation moves when that happens.
 */
export function Campaigns({
  scope, onOpenBrief, deployed, onDeploy,
}: {
  scope: Scope;
  /** Seeds the composer. Used by the timeline's empty pipeline slot. */
  onOpenBrief: (prompt: string) => void;
  /** Agents deployed in this session, newest first. Owned by the page,
      because sending a brief deploys one too. */
  deployed: readonly Deployed[];
  onDeploy: (role: PipelineRole, campaign: string, campaignId: CampaignKey) => void;
}) {
  const [open, setOpen] = useState<CampaignKey | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [more, setMore] = useState(false);
  const stillWorking = deployed.some((d) => !isDone(d, Date.now() - 2000));
  const now = useNow(stillWorking);
  const roster = activeCampaigns(scope);
  const shown = roster.find((c) => c.id === open);

  const running = deployed.filter((d) => !isDone(d, now)).length;
  const list = more ? deployed : deployed.slice(0, RAIL_SHOWN);
  const hidden = deployed.length - list.length;

  return (
    <section className="rail-sec rail-agents" aria-labelledby="rail-agents-h">
      <div className="rail-sec-head">
        <h2 className="rail-sec-title" id="rail-agents-h">Agents</h2>
        {deployed.length > 0 && (
          <span className="rail-ag-sum t-caption">
            {running > 0 ? `${running} running` : "All done"}
          </span>
        )}
      </div>

      {deployed.length === 0 ? (
        <p className="rail-ag-empty t-body-sm">
          None running yet. Send a brief and the agent that picks it up shows here.
        </p>
      ) : (
        <ol className="rail-ag-list">
          {list.map((d) => (
            <li key={d.key} className="rail-ag-item">
              <AgentRow d={d} now={now} onOpen={() => setOpen(d.campaignId)} />
            </li>
          ))}
        </ol>
      )}

      <div className="rail-ag-links">
        {deployed.length > RAIL_SHOWN && (
          <button type="button" className="rail-ag-link t-label" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? "Show fewer" : `Show ${hidden} more`}
          </button>
        )}
        <button type="button" className="rail-ag-link t-label" onClick={() => setAllOpen(true)} aria-haspopup="dialog">
          All running campaigns
          <CaretRight size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>

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
          onDeploy={onDeploy}
        />
      )}
    </section>
  );
}

/**
 * The step list a newly deployed agent starts on, by role.
 */
const NEW_STEPS: Record<PipelineRole, readonly string[]> = {
  Sourcing: ["Reading the brief", "Planning the search", "Matching the role", "Ranking candidates"],
  Outreach: ["Drafting", "Awaiting approval", "Sending", "Logging replies"],
  Screening: ["Reading transcripts", "Scoring", "Summarising"],
};

/**
 * What a newly deployed agent says while it is on each of `NEW_STEPS`, in the
 * same order. One line per step, so the row says WHICH step it is on.
 */
const NEW_DOING: Record<PipelineRole, readonly string[]> = {
  Sourcing: [
    "Reading the brief and planning its first search",
    "Querying the sourcing graph for matches",
    "Checking each candidate against the brief",
    "Ordering the shortlist by fit",
  ],
  Outreach: [
    "Drafting an opening message for the shortlist",
    "Holding for your go-ahead before it sends",
    "Sending to the approved list",
    "Watching the thread for replies",
  ],
  Screening: [
    "Reading the call transcript",
    "Scoring against the brief's must-haves",
    "Writing up what it found",
  ],
};

/**
 * Seconds a newly deployed agent spends on each step. Not a promise about
 * how long real work takes: slow enough to read, fast enough to see move.
 */
const STEP_SECS = 6;

/** An agent deployed in this session. */
export type Deployed = {
  key: string;
  role: PipelineRole;
  campaign: string;
  campaignId: CampaignKey;
  /** `Date.now()` at deploy — the step clock counts from here. */
  deployedAt: number;
};

/**
 * Which of a deployed agent's steps `now` falls on, clamped at both ends: the
 * clock can read a moment before `deployedAt`, and an agent that has been
 * deployed is on its first step by definition.
 */
export function newPos(d: Deployed, now: number): number {
  const cap = NEW_STEPS[d.role].length - 1;
  const elapsed = Math.floor((now - d.deployedAt) / (STEP_SECS * 1000));
  return Math.min(cap, Math.max(0, elapsed));
}

/* The one figure each role reports as it works, derived from the same clock
   as its steps so it never runs ahead of them, and what it says when done. */
const OUTPUT: Record<PipelineRole, {
  count: (sec: number) => { n: number; label: string };
  result: string;
}> = {
  Sourcing: {
    count: (t) => ({ n: Math.min(1398, Math.round(t * 58)), label: "profiles read" }),
    result: "24 shortlisted from 1,398 profiles",
  },
  Outreach: {
    count: (t) => ({ n: Math.min(4, Math.round(t / 1.5)), label: "messages drafted" }),
    result: "4 sent, now watching for replies",
  },
  Screening: {
    count: (t) => ({ n: Math.min(5, Math.round(t / 2.5)), label: "transcripts read" }),
    result: "3 screens booked for Thursday",
  },
};

function isDone(d: Deployed, now: number): boolean {
  return now - d.deployedAt >= NEW_STEPS[d.role].length * STEP_SECS * 1000;
}

function AgentRow({ d, now, onOpen }: { d: Deployed; now: number; onOpen: () => void }) {
  const steps = NEW_STEPS[d.role];
  const sec = Math.max(0, (now - d.deployedAt) / 1000);
  const done = isDone(d, now);
  const pos = newPos(d, now);
  const frac = done ? 1 : Math.min(1, sec / (steps.length * STEP_SECS));
  const c = OUTPUT[d.role].count(done ? Infinity : sec);
  const status = done ? "Done" : "Running";

  return (
    <button
      type="button"
      className={`rail-ag${done ? " is-done" : " is-running"}`}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${d.role} agent on ${d.campaign}, ${status.toLowerCase()}. Open its timeline.`}
    >
      <span className="rail-ag-top">
        <span className="rail-ag-role t-body-strong">{d.role}</span>
        <span className="rail-ag-state t-caption">{status}</span>
      </span>
      <span className="rail-ag-camp t-body-sm">{d.campaign}</span>
      <span className="rail-ag-now t-body-sm">{done ? OUTPUT[d.role].result : NEW_DOING[d.role][pos]}</span>
      <span className="rail-ag-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${frac.toFixed(3)})` }} />
      </span>
      <span className="rail-ag-meta t-caption">
        <span>{c.n.toLocaleString("en-IN")} {c.label}</span>
        <span>{done ? `${steps.length} of ${steps.length} steps` : `Step ${pos + 1} of ${steps.length}`}</span>
      </span>
    </button>
  );
}

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
function isLastDone(e: TimelineEvent): boolean {
  return e.agent.state === "done" && e.id === `${e.agent.id}:${e.agent.step}`;
}

export type { PipelineRole };

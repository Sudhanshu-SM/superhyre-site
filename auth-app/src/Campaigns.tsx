import {
  ArrowCounterClockwise, CaretRight, Check, HandPalm, Plugs, WarningCircle, X,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./agents.css";
import "./live.css";
import { createPortal } from "react-dom";
import type {
  CampaignKey, CampaignRoster, FleetAgent, PipelineRole, RunState, Scope, TimelineEvent,
} from "./orchestrator";
import {
  AGENT_ROLES, ROLE_HUE, activeCampaigns, campaignName, deployPrompt,
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

/**
 * `Date.now()`, refreshed every second while anything deployed this session
 * is still short of its last step.
 *
 * A SEPARATE clock from `useElapsed` on purpose: that one moves in half-minute
 * jumps because fixture ages render in whole minutes, and a faster tick there
 * would re-render for a number that cannot have changed. A freshly deployed
 * agent's own workflow is seconds long, so it needs a clock fine enough to
 * notice — this one, at one-second resolution.
 */
/**
 * How many columns the band's grid actually laid out.
 *
 * Read from `grid-template-columns` rather than recomputed from the width —
 * the grid has already solved `repeat(auto-fill, minmax(280px, 1fr))` against
 * the real container, and its answer counts the gaps, the padding and the
 * rounding correctly. Recomputing that arithmetic in JS would be a second
 * implementation of the same rule, free to disagree with the first the
 * moment either changes. The computed value lists every track, including the
 * empty ones, which is precisely the number of panels that would fit.
 */
function useColumns(
  ref: React.RefObject<HTMLElement>,
  mounted: boolean,
): { cols: number; track: number } {
  const [grid, setGrid] = useState({ cols: 1, track: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean);
      /* The track WIDTH comes back with the count because a departing panel
         is taken out of the grid to leave — it no longer has a track to be
         sized by, and a panel that snaps to some other width on its way out
         is not leaving, it is being replaced by something else that then
         leaves. */
      setGrid({
        cols: Math.max(1, Math.min(FEED_MAX, tracks.length)),
        track: Math.round(parseFloat(tracks[0] ?? "0")) || 0,
      });
    };
    read();
    /* The band is a page row, so its width changes with the window and with
       the sidebar collapsing — neither of which fires a resize on `window`
       alone in the sidebar's case. */
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    /* `mounted` is in the deps and `ref` alone is not enough — a ref object
       is stable for the component's whole life, so with `[ref]` this effect
       ran exactly once, on the render BEFORE the band existed, found
       `ref.current === null`, returned, and was never invited back. The band
       then showed one panel in a four-track grid for the rest of the
       session. A ref identity says nothing about whether it points at
       anything; the thing that changes is whether the list is rendered. */
  }, [ref, mounted]);
  return grid;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    /* Read the clock the moment it starts mattering. The stored value is from
       mount — page load — and waiting a full second for the first interval to
       correct it is how a just-deployed agent ended up being asked about
       using a timestamp from before it existed. */
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function Campaigns({
  scope, onOpenBrief, deployed, onDeploy, reserve = false,
}: {
  scope: Scope;
  /** Seeds the composer. Used by the empty pipeline slot. */
  onOpenBrief: (prompt: string) => void;
  /**
   * Agents deployed in this session.
   *
   * Lifted out of this component because SENDING A BRIEF deploys one too, and
   * that happens in the composer two levels up. State owned by the thing that
   * renders it, with two callers writing to it, would have been two sources
   * of truth for one list. */
  deployed: readonly Deployed[];
  onDeploy: (role: PipelineRole, campaign: string, campaignId: CampaignKey) => void;
  /** Hold the band's room while nothing is deployed. True once a
      conversation exists, so the composer docks once. */
  reserve?: boolean;
}) {
  const elapsed = useElapsed();
  const [open, setOpen] = useState<CampaignKey | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  /* Only ticking while a deployed agent could still be short of its last
     step — a still-life band (nothing deployed, or everything already at the
     end of its workflow) has nothing this clock would change, so it costs
     nothing to leave off. */
  /* The band's own grid, so the cap can be read off the layout it produced
     rather than guessed from a width. */
  const listRef = useRef<HTMLUListElement>(null);
  const { cols, track } = useColumns(listRef, deployed.length > 0);
  const stillWorking = deployed.some(
    (d) => Date.now() - d.deployedAt < (NEW_STEPS[d.role].length * STEP_SECS + 2) * 1000,
  );
  const now = useNow(stillWorking);

  /* ── THE BAND STARTS EMPTY ──
     It used to seat the three busiest fixture agents, so the page opened
     claiming three campaigns were running before the user had done anything.
     The band now shows what THIS SESSION deployed and nothing else, which
     makes it a record of your own actions rather than a permanent decoration
     — and it is the only version where "a campaign appears when you deploy
     one" is a visible event rather than a fourth item joining three.

     Everything already running is still reachable: `View all` opens the full
     roster, and the fleet board has its own route. */
  const live: readonly FleetAgent[] = [];
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
  ].slice(0, cols);

  /* ── THE DISPLACED CAMPAIGN LEAVES INSTEAD OF BEING DELETED ──
     Deploying past the cap drops the last entry from the slice above, and a
     slice is not an exit: React simply stops rendering it, so the oldest
     campaign blinked out of existence in the same frame the newest one
     began easing in. Every other departure on this page was given a fade
     once it was noticed; this was the last one still vanishing.

     The band's own key order is the reason it goes RIGHTWARD. New campaigns
     are prepended, so the oldest is the rightmost panel, and the whole row
     shifts right as the entering column opens — leaving to the right is the
     direction it was already travelling, and leaving any other way would
     fight the motion around it.

     Keys are compared rather than objects: `band` is rebuilt every render,
     so identity tells you nothing about whether an entry is the same
     campaign. */
  const keys = band.map((e) => (e.kind === "new" ? e.d.key : e.a.id));
  const cache = useRef(new Map<string, (typeof band)[number]>());
  band.forEach((e, i) => cache.current.set(keys[i]!, e));

  const [leaving, setLeaving] = useState<readonly string[]>([]);
  /* Whether the band is arriving into room that was held for it. */
  const heldRoom = useRef(false);
  const held = useRef<readonly string[] | null>(null);
  useLayoutEffect(() => {
    const before = held.current;
    held.current = keys;
    if (!before) return;
    const gone = before.filter((k) => !keys.includes(k));
    if (gone.length === 0) return;
    setLeaving((l) => [...l, ...gone]);
    const id = window.setTimeout(
      () => setLeaving((l) => l.filter((k) => !gone.includes(k))),
      FEED_LEAVE_MS,
    );
    return () => window.clearTimeout(id);
    /* Joined rather than spread: the array is new every render and only its
       CONTENTS decide whether anything actually left. */
  }, [keys.join("\u0000")]);

  /* The header counts what is still MOVING — a paused agent is in the band
     but is not working, and saying otherwise would make the one number on
     this surface disagree with the panel under it. Three shown against a
     larger count is how the reader learns the band is a top-N. */
  const working = live.filter((a) => a.state !== "done").length + deployed.length;
  const doneCount = deployed.filter((d) => isDone(d, now)).length;

  /* Nothing deployed yet is the resting state, and the honest thing to render
     for it is nothing at all — a band explaining that it is empty would take
     the same room as a band with something in it. */
  /* ── BUT ONCE A CONVERSATION EXISTS, THE ROOM IS HELD ──
     A sourcing run deploys its agent only when its plan is ready, seconds
     after the send. With nothing rendered until then, the composer docked
     against the bottom of the window, and when the band finally mounted the
     log lost 250px and the composer jumped up to meet it — two moves for one
     send. So from the first send an empty slot of the band's height holds
     the space: the composer docks once, at its final position, and the band
     later fades into room that was already its own. */
  if (deployed.length === 0) {
    if (reserve) heldRoom.current = true;
    return reserve ? <div className="feed-reserve" aria-hidden="true" /> : null;
  }

  return (
    <section className={`feed${heldRoom.current ? " is-late" : ""}`} aria-labelledby="feed-h">
      <header className="feed-head">
        <h2 className="feed-h lv-h" id="feed-h">
          <span className={`lv-pulse${working - doneCount > 0 ? " is-on" : ""}`} aria-hidden="true" />
          Live
          <span className="lv-h-n">
            {working - doneCount > 0 ? `${working - doneCount} working` : "All done"}
            {doneCount > 0 && working - doneCount > 0 ? ` · ${doneCount} done` : ""}
          </span>
        </h2>
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
          View all
          <CaretRight size={11} weight="bold" aria-hidden="true" />
        </button>
      </header>

      <ul className="feed-list" ref={listRef}>
        {band.map((e) => (e.kind === "new" ? (
          <li className="feed-item is-new" key={e.d.key}>
            <LiveCard d={e.d} now={now} onOpen={() => setOpen(e.d.campaignId)} />
          </li>
        ) : (
          <li className="feed-item" key={e.a.id}>
            <LiveCard fleet={e.a} now={now} elapsed={elapsed} onOpen={() => setOpen(e.a.campaignId)} />
          </li>
        )))}
        {/* Out of the grid and pinned to the band's right edge, so it holds
            neither a track nor a place in the order while it goes — the
            survivors close up behind it immediately, which is the motion
            that makes room for the arriving panel on the left. Its width is
            carried over from the track it just left, because a panel that
            changes size on the way out is not the same panel leaving. */}
        {leaving.map((k) => {
          const e = cache.current.get(k);
          if (!e) return null;
          return (
            <li
              className="feed-item is-gone"
              key={`gone:${k}`}
              style={track ? { width: track } : undefined}
              aria-hidden="true"
            >
              {e.kind === "new"
                ? <LiveCard d={e.d} now={now} onOpen={() => undefined} />
                : <LiveCard fleet={e.a} now={now} elapsed={elapsed} onOpen={() => undefined} />}
            </li>
          );
        })}
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
          onDeploy={onDeploy}
        />
      )}
    </section>
  );
}

/**
 * The most the band will ever seat, however wide the window gets.
 *
 * This was a flat `FEED_CAP = 3`, and three was a correct number for a
 * container that no longer exists: the feed used to live inside the 556px
 * conversation column, where a fourth panel dropped each to 139px and the
 * campaign names collided with the ages. It then moved to a full-width band
 * across the foot of the page — roughly 1420px, room for four or five — and
 * the cap did not move with it, so the band showed three panels and left a
 * third of itself empty while the header said nine were working.
 *
 * Exactly the trap this file has hit before with content-derived floors: a
 * number measured against one container is not a number, it is a
 * measurement, and it expires when the container changes. So the real count
 * is now read from the grid at runtime (`useColumns`) and this is only a
 * ceiling — past six, panels are readable but the band stops being glanceable
 * and becomes a list, which is what the `View all` dialog is for.
 */
const FEED_MAX = 6;

/**
 * How long a displaced campaign stays mounted to fade out.
 *
 * Matched to `feed-leave` in access.css, and slightly under the entering
 * column's own 480ms so the band is never briefly holding both a panel that
 * has finished arriving and one that has not finished going.
 */
const FEED_LEAVE_MS = 440;

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

/**
 * What a newly deployed agent says while it is on each of `NEW_STEPS`, in the
 * same order. One line per step, not a generic "working on it" repeated —
 * the panel's whole argument is that you can see WHICH step it is on, and a
 * caption that does not change with the step undoes that.
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
 * Seconds a newly deployed agent spends on each step before moving to the
 * next. Not a promise about how long real work takes — a pace slow enough
 * that the step you are reading is still on screen a few seconds later, and
 * fast enough that watching the band for a minute shows it actually moving,
 * which is the whole point of the panel over a frozen "running" label.
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
 * Which of a deployed agent's steps `now` falls on.
 *
 * Exported so the band and any future reader of a deployed agent's state
 * compute the same number the same way — the class of bug this file's own
 * history has hit twice already (rungs a `max()` outranked, a tiebreak that
 * read a different field than the card displayed): one function, not a sum
 * re-derived at each call site.
 */
export function newPos(d: Deployed, now: number): number {
  const cap = NEW_STEPS[d.role].length - 1;
  /* ── CLAMPED AT BOTH ENDS, AND THE LOW END IS NOT THEORETICAL ──
     `now` comes from a clock seeded when the component MOUNTED, which is page
     load — so for the first tick after a deploy it is EARLIER than
     `deployedAt` and the elapsed time is negative. `Math.floor` of a small
     negative is -1, the slice below it came out empty, and a freshly
     deployed agent rendered with zero steps for up to a second before its
     first row appeared.

     That was not just a cosmetic delay: the row popping in grew the band by
     40px a full second after the send, which shrank the page row above it
     and yanked the composer 40px upward the instant its 1000ms glide
     finished — a visible hitch at the exact moment the motion was supposed
     to settle. An agent that has been deployed is on its first step by
     definition, so the floor is 0. */
  const elapsed = Math.floor((now - d.deployedAt) / (STEP_SECS * 1000));
  return Math.min(cap, Math.max(0, elapsed));
}

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
/* ── the live card ─────────────────────────────────────────────────────────
   One agent at work. Read top to bottom it answers, in order: who is this
   and how far along (ring, role, campaign, a clock that counts up), where in
   its workflow (a track with the current step filling in real time), what
   it is doing this second, and what it has produced so far (two counters
   that tick as it works). When the last step lands the card settles: the
   ring closes, the edge turns sage, and the result replaces the counters.

   A deployed agent is paced by the clock (`STEP_SECS` per step) because
   there is no backend yet; the counters are derived from the same clock, so
   they never run ahead of the steps they belong to. */

const OUTPUT: Record<PipelineRole, {
  counters: (sec: number) => readonly { label: string; n: number }[];
  result: string;
}> = {
  Sourcing: {
    counters: (t) => [
      { label: "profiles read", n: Math.min(1398, Math.round(t * 58)) },
      { label: "matches", n: t < 12 ? 0 : Math.min(61, Math.round((t - 12) * 6)) },
    ],
    result: "24 shortlisted from 1,398 profiles",
  },
  Outreach: {
    counters: (t) => [
      { label: "drafted", n: Math.min(4, Math.round(t / 1.5)) },
      { label: "sent", n: t < 12 ? 0 : Math.min(4, Math.round((t - 12) / 1.5)) },
    ],
    result: "4 sent · watching for replies",
  },
  Screening: {
    counters: (t) => [
      { label: "transcripts", n: Math.min(5, Math.round(t / 2.5)) },
      { label: "scored", n: t < 6 ? 0 : Math.min(5, Math.round((t - 6) / 2)) },
    ],
    result: "3 screens booked for Thursday",
  },
};

function isDone(d: Deployed, now: number): boolean {
  return now - d.deployedAt >= NEW_STEPS[d.role].length * STEP_SECS * 1000;
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function LiveCard({
  d, fleet, now, elapsed = 0, onOpen,
}: {
  d?: Deployed;
  fleet?: FleetAgent;
  now: number;
  elapsed?: number;
  onOpen: () => void;
}) {
  const role = (d?.role ?? fleet!.role) as PipelineRole;
  const campaign = d?.campaign ?? campaignName(fleet!.campaignId);
  const steps = d ? NEW_STEPS[role] : fleet!.steps;
  const sec = d ? Math.max(0, (now - d.deployedAt) / 1000) : 0;
  const done = d ? isDone(d, now) : fleet!.state === "done";
  const pos = d ? newPos(d, now) : fleet!.step;
  const state: RunState = d ? (done ? "done" : "running") : fleet!.state;
  const blocked = state === "waiting" || state === "error";
  const doing = d ? NEW_DOING[role][pos]! : blocked && fleet!.fault ? fleet!.fault.fix : fleet!.doing;
  const frac = done ? 1 : (pos + (d ? Math.min(1, (sec - pos * STEP_SECS) / STEP_SECS) : 0.5)) / steps.length;
  const out = OUTPUT[role];
  const counters = d ? out.counters(sec) : [];
  const age = d ? clock(sec) : seen(fleet!.seenAgo + elapsed);

  return (
    <button type="button" className={`lv${done ? " is-done" : ""}${blocked ? ` is-${state}` : ""}`} onClick={onOpen} aria-haspopup="dialog">
      <span className="lv-top">
        <LiveRing frac={frac} state={state} letter={role[0]!} />
        <span className="lv-id">
          <b>{role} agent</b>
          <span>{campaign}</span>
        </span>
        <span className="lv-age">
          {done ? <><Check size={11} weight="bold" aria-hidden="true" />Done</> : age}
        </span>
      </span>

      <span className="lv-track" aria-label={`Step ${Math.min(pos + 1, steps.length)} of ${steps.length}: ${steps[pos]}`}>
        {steps.map((s, i) => {
          const st = done || i < pos ? "done" : i === pos ? "now" : "todo";
          return (
            <span key={s} className={`lv-seg is-${st}`} title={s}>
              {st === "now" && d && (
                /* The current step fills over its own duration, driven by
                   CSS from where it already is, so it moves every frame
                   without a re-render per frame. Keyed by step so each step
                   starts its own fill. */
                <i key={pos} style={{ animationDuration: `${STEP_SECS}s`, animationDelay: `-${Math.max(0, sec - pos * STEP_SECS).toFixed(2)}s` }} />
              )}
              {st === "now" && !d && <i className={`is-${state}`} />}
            </span>
          );
        })}
      </span>

      <span className="lv-step">
        <b>{done ? "Finished" : steps[pos]}</b>
        <span>{done ? `${steps.length} of ${steps.length}` : `${pos + 1} of ${steps.length}`}</span>
      </span>

      {done ? (
        <span className="lv-result"><span className="lv-result-mark" aria-hidden="true"><Check size={11} weight="bold" /></span>{out.result}</span>
      ) : (
        <>
          <span className="lv-now" key={doing}>
            {blocked
              ? (state === "waiting" ? <HandPalm size={12} weight="bold" aria-hidden="true" /> : <WarningCircle size={12} weight="bold" aria-hidden="true" />)
              : <span className="lv-dot" aria-hidden="true" />}
            <span className="lv-now-t">{doing}</span>
          </span>
          {counters.length > 0 && (
            <span className="lv-counts">
              {counters.map((c) => (
                <span key={c.label} className="lv-count">
                  <b key={c.n}>{c.n.toLocaleString("en-IN")}</b>
                  <span>{c.label}</span>
                </span>
              ))}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function LiveRing({ frac, state, letter }: { frac: number; state: RunState; letter: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className={`ag-ring is-${state}`} style={{ width: 34, height: 34 }} aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} className="ag-ring-track" />
        <circle cx="18" cy="18" r={r} className="ag-ring-arc" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <b>{letter}</b>
    </span>
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

import { ArrowCounterClockwise, CaretRight, Check, Plugs, Plus, Stop, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AgentFlow, CampaignKey, CampaignRoster, FleetAgent, PipelineSlot, RunState, Scope,
} from "./orchestrator";
import {
  RUN_HUE, RUN_LABEL, STRIP_CAP, campaignName, deployPrompt, flowFor, rosterFor,
  seen, wordFor,
} from "./orchestrator";
import { Dot } from "./viz";

/**
 * Fleet — the muster board. Which campaigns have agents, where each one is in
 * its own pipeline, and which need a human.
 *
 * ── WHAT WAS WRONG, AND IT WAS ONE FUNCTION ─────────────────────────────────
 * The previous pass folded six agents into three rows by describing each
 * campaign with its "lead" — `pickLead`, the highest-ranked agent. Measured
 * verdict: "too bland, AI slop." Four separate complaints, one cause, because
 * `pickLead` is a `max()`:
 *
 * • COLOUR SATURATED. Every campaign in the fixture contains a blocked agent,
 *   so the lead was blocked on 3 of 3 rows: three coloured dots, three coloured
 *   pills, a rose header — seven coloured elements, two of them the identical
 *   rose "Stopped". The old flat list was 3 loud of 6. The fold silently turned
 *   that into 3 of 3, which is the exact state §4.3 exists to forbid, and the
 *   comment claiming otherwise shipped with it.
 * • THE MARK NEVER VARIED. `steps.length` is 4 for Sourcing/Outreach and 3 for
 *   Screening — but all three leads happened to have 4 steps, so the stepper
 *   drew an identical 65px mark in every row. The variation was in the data,
 *   hidden by the pick.
 * • NOTHING MOVED. `pulse` was gated on the lead being `running`, and `waiting`
 *   (rank 0) outranks `running` (rank 2), so `f1` — the only running agent —
 *   never reached a row. `getAnimations()` on the section returned ZERO. A
 *   surface whose entire subject is work in progress was motionless.
 * • HALF THE FACTS WERE OFF SCREEN. 21 of 41. The second agent on every
 *   campaign, every `yielded` count, and `fault.kind` — the tool-vs-agent split
 *   the orchestrator argues hardest for — were all one click deep.
 *
 * And the block was 84.6% empty with 12.9% type and a single 65×3px
 * quantitative mark: 0.09% of the area, of which only the one lit segment
 * cleared the contrast floor, because the traversed segments were `--rule` at
 * 1.43:1. So "step 3 of 4" never read as a position at all.
 *
 * ── WHY A STRIP AND NOT A BETTER LIST ───────────────────────────────────────
 * THE WEDGE. A row's x-axis means *attribute* — name, mark, pill, age, caret. A
 * pipeline's x-axis means *position*. They cannot share a line. Put the
 * three-stage anatomy in a row and it gets ~87px of 772 — 11% of the width —
 * while five columns of metadata take the rest: the surface's most meaningful
 * structure handed its smallest column. That is "a table wearing a card"
 * stated precisely.
 *
 * As a strip the anatomy gets 2.65× the linear extent, the block goes 258px →
 * ~180px, and drawn footprint goes 2.5% → ~13%. Shorter *and* more drawn.
 *
 * ── WHAT THE ANATOMY BUYS ───────────────────────────────────────────────────
 * `role` is a three-stage pipeline, and every campaign is missing a different
 * stage — backend-snr the end, platform-sre the start, ios-mid the middle. All
 * three used to render `2 agents` and were structurally indistinguishable.
 * Rendering the slot whether or not it is filled is the only way to draw a gap,
 * and the gap is the most differentiating fact in the fixture. ios-mid has a
 * broken front end and a finished back end; the old row could not say so.
 *
 * ── QUIET AT REST, RESTORED ─────────────────────────────────────────────────
 * Tint is now earned by `waiting` alone, not by `waiting || error`. That is not
 * a threshold tweak: `waiting` is the agent asking permission and is the only
 * state where a human is the blocker, which is why `RUN_RANK` puts it strictly
 * ahead of `error`. An error is a fact needing a fix and it carries its own.
 * One of three campaigns is tinted instead of three, and the header states the
 * two counts separately so the rose number is one that actually varies.
 *
 * Colour count at rest: three station marks (one per campaign's most urgent
 * agent) plus one rose header number. Was seven.
 */

export function Fleet({
  scope, onBrief,
}: {
  scope: Scope;
  /** Hands a prompt to the composer. Seeds, never sends. */
  onBrief: (prompt: string) => void;
}) {
  const roster = rosterFor(scope);

  /**
   * Which campaign's flow is open, and agents resolved locally.
   *
   * Frontend-only pass, so acting on an agent updates local state rather than
   * calling anything. That is a legitimate prototype — the control does the
   * observable thing it claims — as distinct from a control that implies a
   * capability which will never arrive.
   */
  const [open, setOpen] = useState<CampaignKey | null>(null);
  const [resolved, setResolved] = useState<readonly string[]>([]);

  if (roster.length === 0) return null;

  /* ── THE CAP, AND WHY THE OVERFLOW NAMES ITS OWN URGENCY ──
     The strip is correct at three campaigns and wrong at twelve, so the cap
     makes its own precondition true rather than hoping the data stays small.
     `rosterFor` sorts by urgency, so the first three are by definition the ones
     that need attention.

     But only while at most three are blocked. Past that the cap would truncate
     blocked campaigns while the header went on counting them — the header's
     loudest number contradicting the marks beneath it, which is exactly the
     `needsHuman`-vs-live-state fault this file already fixed once. So the
     overflow states its own blocked count and the tail is never silently the
     urgent part. */
  const shownRoster = roster.slice(0, STRIP_CAP);
  const tail = roster.slice(STRIP_CAP);
  const tailBlocked = tail.reduce(
    (n, c) => n + c.agents.filter((a) => isBlocked(a, resolved)).length,
    0,
  );

  /* Counted from live state, never from the fixture — dismiss a fault and the
     header must go quiet with the marks. */
  const waiting = count(roster, resolved, "waiting");
  const stopped = count(roster, resolved, "error");
  const deployed = roster.reduce((n, c) => n + c.agents.length, 0);
  const shown = roster.find((c) => c.id === open);

  return (
    <section className="fl" aria-labelledby="fl-h">
      <header className="fl-head">
        <h2 className="fl-h" id="fl-h">Agents</h2>

        {/* ── TWO FACTS, ONE ALARM ──
            Was a single `3 need you` in rose, which collapsed "a human is the
            blocker" and "something broke" into one number — and since every
            campaign had one of either, that number never moved. Split, the rose
            number counts only the requests actually addressed to the reader,
            and it is a number that varies. `stopped` is ink, not rose: it needs
            a fix, not permission. */}
        {waiting + stopped > 0 ? (
          <p className="fl-counts">
            {waiting > 0 && (
              <span className="fl-c-loud">
                {waiting} {waiting === 1 ? "needs" : "need"} you
              </span>
            )}
            {waiting > 0 && stopped > 0 && <span className="fl-c-sep" aria-hidden="true">·</span>}
            {stopped > 0 && <span className="fl-c-quiet">{stopped} stopped</span>}
          </p>
        ) : (
          <p className="fl-counts"><span className="fl-c-quiet">{deployed} deployed</span></p>
        )}
      </header>

      {/* Regions of ONE plane, never three cards: `access.css` blames "six
          boxes inside a box" for revision 27 reading cluttered, and three
          bordered cards inside a bordered card is that fault exactly. Separated
          by gutter and by their own headings — no rules, because on the `--sub`
          plane every neutral line token is invisible anyway (`--hairline`
          1.07:1, `--rule` 1.27:1, `--rule-strong` 2.52:1) and a separator you
          cannot see is furniture you did not need. */}
      <div className="fl-strip">
        {shownRoster.map((c) => (
          <Campaign
            key={c.id}
            campaign={c}
            resolved={resolved}
            onOpen={() => setOpen(c.id)}
            onBrief={onBrief}
          />
        ))}
      </div>

      <footer className="fl-foot">
        {tail.length > 0 && (
          <p className="fl-tail">
            {tail.length} more
            {tailBlocked > 0 && <span className="fl-c-loud">, {tailBlocked} need you</span>}
          </p>
        )}
        {/* Fixtures are named as fixtures, and the note sits UNDER what it
            qualifies — the honesty-last convention. */}
        <p className="orc-fixtures">
          Fixtures against <code>agent_runs</code>. Acting on a run updates this
          view only.
        </p>
      </footer>

      {shown && (
        <Flow
          campaign={shown}
          resolved={resolved}
          onClose={() => setOpen(null)}
          onResolve={(id) => setResolved([...resolved, id])}
          onBrief={(p) => { setOpen(null); onBrief(p); }}
        />
      )}
    </section>
  );
}

/* ── one campaign ───────────────────────────────────────────────────────────*/

/**
 * A campaign as its three-stage pipeline.
 *
 * The heading is the control that opens the flow; the stations are static, and
 * an EMPTY station is its own button. They are siblings, never nested — the
 * previous row was a single `<button>`, and a control inside it would be
 * invalid markup and would break keyboard order.
 */
function Campaign({
  campaign: c, resolved, onOpen, onBrief,
}: {
  campaign: CampaignRoster;
  resolved: readonly string[];
  onOpen: () => void;
  onBrief: (prompt: string) => void;
}) {
  /* The agent the heading speaks for: most urgent, recomputed from live state
     so a dismissal is reflected. This is NOT `pickLead` returning — nothing is
     drawn on its behalf. Every agent draws its own station; this only decides
     whose sentence the heading carries. */
  const urgent = mostUrgent(c.agents, resolved);
  const state = stateOf(urgent, resolved);
  /* Tint is earned by `waiting` alone. See the header note. */
  const loud = c.agents.some((a) => stateOf(a, resolved) === "waiting");

  return (
    <article className={`fl-camp${loud ? " is-loud" : ""}`}>
      {/* Wrapped so the narrow breakpoint can set these two on one line
          without either becoming a flex child of the article. */}
      <div className="fl-camp-top">
        <button type="button" className="fl-camp-head" onClick={onOpen} aria-haspopup="dialog">
          <span className="fl-camp-name">{c.name}</span>
          <CaretRight className="fl-camp-go" size={12} weight="bold" aria-hidden="true" />
        </button>

      {/* ── THE WORD NAMES WHAT HAPPENED, NOT JUST THAT SOMETHING DID ──
          Was `Stopped` for both fault kinds. `orchestrator.ts` argues at length
          that collapsing a broken connector with an incapable agent is what
          makes people stop believing the product works — a broken integration
          reading as a stupid agent — and the roster committed that exact
          collapse while the type's own docstring forbade it. `fault.kind`
          selects the word, so the three different human actions in this fixture
          finally read as three different things. */}
      <p className="fl-camp-state">
        <span className="fl-word">{wordFor(urgent, state)}</span>
        <span className="fl-camp-age">{seen(urgent.seenAgo)}</span>
      </p>
      </div>

      <ol className="fl-track">
        {c.slots.map((slot) => (
          <Station key={slot.role} slot={slot} campaign={c} resolved={resolved} onBrief={onBrief} />
        ))}
      </ol>

      {/* `doing` replaces the stage name, which was the section's one true
          redundancy — the ladder's position already carries the stage. This is
          specific where the stage name was generic: "Stopped after 6 of 19
          sends" against "Sending". */}
      <p className="fl-camp-doing">{urgent.doing}</p>
    </article>
  );
}

/* ── one stage ──────────────────────────────────────────────────────────────*/

/**
 * One pipeline stage: an agent's progress through its own steps, or a gap.
 *
 * ── THE SPINE IS THE DATA ───────────────────────────────────────────────────
 * The first sketch had furniture connectors between stations carrying a
 * dependency edge. The edge was deferred (one instance in the fixture is not
 * enough to prove a drawing generalises), which left the connector carrying
 * nothing the station's position and label did not already say — and on the
 * `--sub` plane every neutral line token is invisible anyway.
 *
 * So the span holds the agent's STEP LADDER instead. Traversed rungs are
 * `--ink-2` (6.79:1 on `--sub`, the only neutral that clears the boundary
 * floor); untraversed rungs are left as bare plane. Every mark is data, rule 9
 * has nothing left to arbitrate, and the invisibility of what has not happened
 * yet stops being a defect: absence should be absent.
 *
 * Rungs are `1fr` inside a fixed track, so a three-step pipeline gets coarser
 * rungs than a four-step one — the mark's shape is finally a function of its
 * data rather than a constant 65px.
 */
function Station({
  slot, campaign, resolved, onBrief,
}: {
  slot: PipelineSlot;
  campaign: CampaignRoster;
  resolved: readonly string[];
  onBrief: (prompt: string) => void;
}) {
  /* ── AN EMPTY STAGE IS A CONTROL, NOT A BLANK ──
     A gap in the pipeline is actionable — this campaign has no agent doing
     this work — so the slot offers the action instead of rendering an absence
     and leaving the reader to notice it. Seeds the composer through the
     `onBrief` prop that was already threaded into this component; it is the
     section's first affordance that is not "open a dialog". */
  if (!slot.agent) {
    return (
      <li className="fl-stn is-gap">
        <button
          type="button"
          className="fl-gap"
          onClick={() => onBrief(deployPrompt(slot.role, campaign.name))}
        >
          <span className="fl-gap-ring" aria-hidden="true" />
          <span className="fl-stn-role">{slot.role}</span>
          <span className="fl-gap-cta"><Plus size={9} weight="bold" aria-hidden="true" />Deploy</span>
        </button>
      </li>
    );
  }

  const a = slot.agent;
  const state = stateOf(a, resolved);
  const hue = RUN_HUE[state];

  return (
    <li className="fl-stn">
      {/* The ladder. `role="img"` with the ordinal in words, because the
          sighted reader gets the position from the silhouette and a screen
          reader would otherwise hear N identical empty spans. The old stepper
          already carried this label — the ordinal was given to assistive tech
          and withheld from the eye. */}
      <span
        className={`fl-rungs${state === "running" ? " is-live" : ""}`}
        role="img"
        aria-label={`${a.role}, ${RUN_LABEL[state]}, step ${a.step + 1} of ${a.steps.length}`}
      >
        {a.steps.map((name, i) => (
          <span
            key={name}
            className={
              "fl-rung"
              + (i < a.step ? " is-done" : "")
              + (i === a.step && state !== "done" ? ` is-at${hue ? ` is-${hue}` : ""}` : "")
              + (state === "done" ? " is-done" : "")
            }
          />
        ))}
      </span>

      <span className="fl-stn-role">{a.role}</span>

      {/* The ordinal in figures, finally visible. Tabular so the three stations
          do not jitter against each other. */}
      <span className="fl-stn-pos">
        {state === "done" ? "done" : `${a.step + 1}/${a.steps.length}`}
      </span>

      {/* ── WHAT IT PRODUCED ──
          Rendered verbatim, and deliberately not parsed. `yielded` is a string
          ("24 shortlisted"), so splitting it into a number and a noun would
          mean regexing prose and then asserting the result is a total —
          fabrication with extra steps. Present on three of six agents; the
          empty cells are honest, not ragged.

          `--ink` where the status beside it is `--ink-2`: a result is a fact,
          and the state is a claim about a fact. The same inversion the flow
          dialog's yield chip already makes. */}
      {a.yielded && !isBlocked(a, resolved) && (
        <span className="fl-stn-yield">{a.yielded}</span>
      )}

      {/* The fault kind, as furniture rather than as a second hue — rule 9,
          furniture and data want opposite ends. It costs nothing from the
          colour budget and it is the most actionable field the roster used to
          render zero times. */}
      {a.fault && isBlocked(a, resolved) && (
        <span className="fl-stn-kind">
          {a.fault.kind === "tool"
            ? <><Plugs size={9} weight="bold" aria-hidden="true" />Connector</>
            : <><ArrowCounterClockwise size={9} weight="bold" aria-hidden="true" />Brief</>}
        </span>
      )}
    </li>
  );
}

/* ── the flow ───────────────────────────────────────────────────────────────*/

/**
 * What every agent on one campaign has done, step by step.
 *
 * A dialog for the reason the history popup is one: this content grows with the
 * campaign, and a block that can push its own neighbours down the page is not a
 * block. Reuses the scrim, the `role="dialog"` vocabulary and the close button
 * the palette established, so the app has one way to dismiss a floating thing.
 */
function Flow({
  campaign: c, resolved, onClose, onResolve, onBrief,
}: {
  campaign: CampaignRoster;
  resolved: readonly string[];
  onClose: () => void;
  onResolve: (id: string) => void;
  onBrief: (prompt: string) => void;
}) {
  /* Escape closes it. Bound on the document rather than the dialog, so it
     works before anything inside has taken focus. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flows = flowFor(c.id);
  const blocked = c.agents.filter((a) => isBlocked(a, resolved)).length;

  return createPortal(
    <>
      {/* ── MOUNTED AT THE DOCUMENT ROOT, NOT WHERE THE STATE LIVES ──
          A modal is not a sibling of the content it floats over. Rendering it
          inline put it inside a flex column whose vertical centring was built
          on `> :last-child`, so opening this dialog changed which element was
          last and shoved every panel in that column down 121px.

          The portal makes that class of bug impossible rather than fixed: no
          layout outside this component can depend on whether the dialog is
          open, because the dialog is no longer inside any of it. Matches the
          convention `Nav.tsx` already established for its switcher popover. */}
      <div className="pal-scrim" onClick={onClose} aria-hidden="true" />

      <div className="flow" role="dialog" aria-modal="true" aria-label={`${c.name} — what each agent has done`}>
        <header className="flow-head">
          <div className="flow-titles">
            <h2 className="flow-title">{c.name}</h2>
            <p className="flow-meta">
              {c.agents.length === 1 ? "1 agent" : `${c.agents.length} agents`}
              {blocked > 0 && (
                <> · <span className="flow-meta-loud">
                  {blocked} {blocked === 1 ? "needs" : "need"} you
                </span></>
              )}
            </p>
          </div>
          <button type="button" className="hist-x" onClick={onClose} aria-label="Close">
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </header>

        {/* Scrolls, because a campaign's history grows without bound — which is
            the whole reason it is not in the strip. */}
        <div className="flow-body">
          {flows.map((f) => (
            <AgentTrack
              key={f.agent.id}
              flow={f}
              resolved={resolved}
              onResolve={() => onResolve(f.agent.id)}
              onBrief={onBrief}
            />
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** One agent's steps, in order, with what it produced at each. */
function AgentTrack({
  flow: f, resolved, onResolve, onBrief,
}: {
  flow: AgentFlow;
  resolved: readonly string[];
  onResolve: () => void;
  onBrief: (prompt: string) => void;
}) {
  const a = f.agent;
  const state = stateOf(a, resolved);
  const hue = RUN_HUE[state];
  const needs = isBlocked(a, resolved);

  /* ── THE YIELD BELONGS TO THE STEP THAT PRODUCED IT ──
     It used to render after the whole list, which put "24 shortlisted"
     beneath `Ranking candidates` — a step not started. Scanned rather than
     read off `agent.step`, because a finished agent has no step in flight and
     its output belongs to its last completed one. */
  let lastReached = -1;
  f.steps.forEach((x, i) => { if (x.state !== "ahead") lastReached = i; });

  return (
    <section className="flow-agent">
      <header className="flow-agent-head">
        <span className="flow-agent-dot">
          {hue ? <Dot hue={hue} pulse={state === "running"} /> : <span className="fl-dot-off" />}
        </span>
        <h3 className="flow-agent-role">{a.role}</h3>
        <span className="fl-word">{wordFor(a, state)}</span>
        <span className="fl-camp-age">{seen(a.seenAgo)}</span>
      </header>

      {/* An ordered list because the order IS the meaning. The STATE rides on
          the list rather than each step: what colours the in-flight mark is a
          fact about the agent, not about the step — a stopped agent's current
          step is stopped, and a queued agent's is not moving at all. */}
      <ol className={`flow-steps is-${state}`}>
        {f.steps.map((s, i) => (
          <li className={`flow-step is-${s.state}`} key={s.name}>
            <span className="flow-step-mark" aria-hidden="true" />
            <span className="flow-step-name">
              {s.name}
              <span className="sr-only">
                {s.state === "done" ? " — done" : s.state === "at" ? " — in progress" : " — not started"}
              </span>
            </span>
            {s.note && <span className="flow-step-note">{s.note}</span>}
            {a.yielded && !needs && i === lastReached && (
              <span className="flow-step-yield">{a.yielded}</span>
            )}
          </li>
        ))}
      </ol>

      {needs && a.fault && (
        <div className="fl-detail">
          {/* A broken connector and an incapable agent are different facts, and
              collapsing them is what makes users stop trusting the agent at
              all: the integration's fault reads as the agent being stupid. */}
          <p className="fl-fault">
            <span className="fl-fault-k">
              {a.fault.kind === "tool"
                ? <><Plugs size={12} weight="bold" aria-hidden="true" /> Connector</>
                : <><ArrowCounterClockwise size={12} weight="bold" aria-hidden="true" /> Brief</>}
            </span>
            {a.fault.what}
          </p>

          {/* A failure state with no next step is a dead end, and dead ends are
              what break trust. Every fault carries its fix. */}
          <p className="fl-fix">{a.fault.fix}</p>

          <div className="fl-acts">
            <button
              type="button"
              className="fl-act is-primary"
              onClick={() => onBrief(
                `${a.role} on ${campaignName(a.campaignId)} stopped: ${a.fault!.what}. `,
              )}
            >
              Ask the agent
            </button>
            <button type="button" className="fl-act" onClick={onResolve}>
              <Check size={12} weight="bold" aria-hidden="true" />
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* A supervisor who can see a run going wrong and cannot halt it is
          watching, not supervising. Only on a run that is actually moving. */}
      {state === "running" && (
        <button type="button" className="fl-stop" onClick={onResolve}>
          <Stop size={11} weight="fill" aria-hidden="true" />
          Stop
        </button>
      )}
    </section>
  );
}

/* ── shared reads ───────────────────────────────────────────────────────────*/

/**
 * An agent's state, after local resolution.
 *
 * Stated once because five places need it, and a dismissed fault that only
 * goes quiet in four of them is a bug that looks like a render glitch.
 */
function stateOf(a: FleetAgent, resolved: readonly string[]): RunState {
  return resolved.includes(a.id) ? "queued" : a.state;
}

/** Halted pending a person, either by asking or by breaking. */
function isBlocked(a: FleetAgent, resolved: readonly string[]): boolean {
  const s = stateOf(a, resolved);
  return s === "waiting" || s === "error";
}

function count(
  roster: readonly CampaignRoster[], resolved: readonly string[], state: RunState,
): number {
  return roster.reduce(
    (n, c) => n + c.agents.filter((a) => stateOf(a, resolved) === state).length,
    0,
  );
}

/**
 * Whose sentence the campaign heading carries.
 *
 * Not `pickLead` under a new name: nothing is DRAWN on this agent's behalf —
 * every agent draws its own station, including the ones this ignores. It only
 * decides which `doing` line and which word the heading shows, which is a
 * choice about prose, not a fold of six facts into three.
 */
function mostUrgent(agents: readonly FleetAgent[], resolved: readonly string[]): FleetAgent {
  let best = agents[0]!;
  for (const a of agents) {
    if (RANK[stateOf(a, resolved)] < RANK[stateOf(best, resolved)]) best = a;
  }
  return best;
}

/* Local mirror of RUN_RANK's ordering for the live-state pick. Imported would
   be better; it is re-declared here only because `mostUrgent` reads resolved
   state and RUN_RANK is keyed on the fixture's. */
const RANK: Record<RunState, number> = {
  waiting: 0, error: 1, running: 2, queued: 3, done: 4,
};


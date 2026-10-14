import { ArrowCounterClockwise, Check } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentStrip, AgentsOverview } from "../AgentsOverview";
import { agentApi } from "../api/agent";
import { messageOf } from "../api/client";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import { FOLLOWING_LINE, mayChangeCampaign } from "../campaignRights";
import { campaignRow, useCampaignRows, useCampaignsReady } from "../campaignStore";
import { Loader } from "../components/Loader";
import type { StopChoice } from "../liveAgents";
import {
  applyAgent,
  choiceFor,
  controlAgent,
  previewSummary,
  refreshAgents,
  refusalCopy,
  startBody,
  startWatchOn,
  stopFromText,
  stopQuestion,
  useWatchAgents,
} from "../liveAgents";
import type { MomentCtx } from "../moments";
import { act, roleIn } from "../moments";
import { useSession } from "../roleStore";
import { campaignAsk, resolvedCampaignId } from "./ask";
import { Checked, useFleet } from "./fleetKit";
import type { LiveViewProps } from "./types";
import "../liveAgents.css";

/**
 * Putting an agent to work. The only agent the product runs today is the keep-sourcing watch:
 * it looks for new people on a schedule and stops at a number or a date. Roles with nothing
 * behind them yet (screening, outreach) are said to be unavailable, never staged.
 *
 * The recruiter presses start and it is a direct call: they are the actor. The receipt keeps
 * the demo's undo window, which stops the agent again, and the strip shows the real agent.
 */

const UNDO_MS = 8000;

/** What the server counts as a campaign already having its watch. */
const OCCUPIED = new Set(["running", "paused", "waiting"]);

export default function AssignView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const rowsReady = useCampaignsReady();
  const fleet = useWatchAgents();
  /* The role named in the request, not one that happens to be in the campaign's name. */
  const asked = roleIn(card.campaignName ? ctx.said.split(card.campaignName).join(" ") : ctx.said);
  /* A request for an agent nobody can run yet is answered as such, with the one that exists. */
  const unavailable = asked === "Screening" || asked === "Outreach" ? asked : null;
  const [instead, setInstead] = useState(false);

  const open = useMemo(() => rows.filter((r) => r.status === "active"), [rows]);
  const openNow = useRef(open);
  openNow.current = open;
  const ask = useMemo<Ask>(
    () => (kind, said, c) =>
      campaignAsk(card, openNow.current, { ask: "Which campaign should the agent work on?" })(kind, said, c),
    [card],
  );

  const ready = rowsReady && fleet.status !== "loading";
  const grow = ctx.onGrow;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the transcript follows when what is shown changes
  useEffect(() => {
    grow();
  }, [ready, unavailable, instead, grow]);

  return (
    <div className="src mo">
      <Checked
        phase={{ id: "a-plan", live: "Finding the right agent", done: "Found the right agent" }}
        ready={ready}
        steps={["Matched the request to an agent role", "Checked whether that agent is free"]}
      />
      {ready && unavailable && !instead && (
        <Unavailable role={unavailable} onInstead={() => setInstead(true)} />
      )}
      {ready &&
        (!unavailable || instead) &&
        (!card.campaignId && open.length === 0 ? (
          <p className="lt-note">
            There's no active campaign for an agent to work on. Start or reopen one first.
          </p>
        ) : (
          <Clarified kind="assign" ctx={ctx} ask={ask}>
            {(c) => <ForCampaign card={card} ctx={c} />}
          </Clarified>
        ))}
    </div>
  );
}

/* ── an agent the product can't run yet ──────────────────────────────────── */

function Unavailable({
  role,
  onInstead,
}: {
  role: "Screening" | "Outreach";
  onInstead: () => void;
}): JSX.Element {
  return (
    <section className="mo-dispatch is-na" aria-live="polite">
      <Fork go={false} />
      <div className="mo-dispatch-body">
        <p className="mo-dispatch-h">{role} agents aren't available yet</p>
        <p className="mo-dispatch-sub">
          Today an agent can keep sourcing a campaign: it looks for new people on a schedule and stops at the
          number or date you set.{" "}
          {role === "Screening"
            ? "Screening calls and scoring are still yours."
            : "Messages still go out from you."}
        </p>
        <div className="lv-acts">
          <button type="button" className="src-btn is-primary mo-small" onClick={onInstead}>
            Use the sourcing agent instead
          </button>
        </div>
      </div>
    </section>
  );
}

function Fork({ go }: { go: boolean }): JSX.Element {
  return (
    <svg className="mo-fork" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="8" cy="22" r="6" className="mo-fork-src" />
      <path d="M14 22 C24 22 24 10 34 10" className="mo-fork-idle" />
      <path d="M14 22 C24 22 24 34 34 34" className={go ? "mo-fork-go" : "mo-fork-idle"} />
      <circle cx="36" cy="10" r="5" className="mo-fork-end" />
      <circle cx="36" cy="34" r="5" className={`mo-fork-end${go ? " is-go" : ""}`} />
    </svg>
  );
}

const Chip = (): JSX.Element => (
  <span className="mo-chip">
    <span className="mo-role is-sm">S</span>Sourcing
  </span>
);

/* ── one campaign ────────────────────────────────────────────────────────── */

function ForCampaign({ card, ctx }: { card: LiveViewProps["card"]; ctx: MomentCtx }): JSX.Element {
  const id = resolvedCampaignId(card, ctx) ?? "";
  const rows = useCampaignRows();
  const fleet = useFleet({ selected: null, open: false });
  const row = rows.find((r) => r.id === id) ?? campaignRow(id);
  const name = row?.name ?? card.campaignName ?? "this campaign";
  /* A watch spends the workspace's credits: the campaign's own people set one up. */
  const mayWatch = mayChangeCampaign(useSession(), row);
  const existing = fleet.agents.find((a) => a.campaignId === id && OCCUPIED.has(a.state));
  /* From the press of Start the agent is in the list, which would read as "already has one": keep showing the receipt. */
  const [started, setStarted] = useState(false);

  /* Whether the campaign has an approved role spec, which a watch can't run without. */
  const [spec, setSpec] = useState<"loading" | "yes" | "no" | "unknown">("loading");
  useEffect(() => {
    let live = true;
    setSpec("loading");
    agentApi.sourcing(id).then(
      (s) => live && setSpec(s.approvedSpec ? "yes" : "no"),
      () => live && setSpec("unknown"),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const grow = ctx.onGrow;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the transcript follows when what is shown changes
  useEffect(() => {
    grow();
  }, [spec, existing?.id, grow]);

  if (!mayWatch && !started) return <p className="lt-note">{FOLLOWING_LINE}</p>;

  if (existing && !started) {
    const view = fleet.views.find((v) => v.id === existing.id);
    return (
      <>
        <p className="src-para">
          {name} already has its sourcing agent. A campaign has one at a time, so change that one: pause it,
          resume it or stop it from the overview.
        </p>
        {view && <FleetStrip ids={[existing.id]} ctx={ctx} />}
      </>
    );
  }

  if (row && row.status !== "active" && !started) {
    return (
      <p className="lt-note">
        {name} is closed, so the agent would stop straight away. Reopen the campaign first, then put the agent
        on it.
      </p>
    );
  }

  if (spec === "loading" && !started) {
    return (
      <Checked
        phase={{ id: "a-spec", live: `Checking ${name}'s role spec`, done: `Checked ${name}'s role spec` }}
        ready={false}
        steps={[]}
      />
    );
  }
  if (spec === "no" && !started) return <NeedsSpec name={name} ctx={ctx} />;

  return <WhenToStop id={id} name={name} ctx={ctx} onHold={setStarted} />;
}

function NeedsSpec({ name, ctx }: { name: string; ctx: MomentCtx }): JSX.Element {
  return (
    <section className="mo-dispatch is-na" aria-live="polite">
      <Fork go={false} />
      <div className="mo-dispatch-body">
        <p className="mo-dispatch-h">{name} has no approved role spec yet</p>
        <p className="mo-dispatch-sub">
          The agent needs it to know who fits. Once a spec is approved, it can start looking.
        </p>
        <div className="lv-acts">
          <button
            type="button"
            className="src-btn is-primary mo-small"
            onClick={() => act(ctx, `Write the role spec for ${name}`)}
          >
            Write the role spec
          </button>
        </div>
      </div>
    </section>
  );
}

/** Asks when it should stop, unless the recruiter already said, then offers the start. */
function WhenToStop({
  id,
  name,
  ctx,
  onHold,
}: {
  id: string;
  name: string;
  ctx: MomentCtx;
  onHold: (on: boolean) => void;
}): JSX.Element {
  const said = stopFromText(ctx.said);
  const ask = useMemo<Ask>(
    () => (_kind, _said, c) => (said || choiceFor(c.answers?.stop) ? null : stopQuestion(name)),
    [said, name],
  );
  return (
    <Clarified kind="assign" ctx={ctx} ask={ask}>
      {(c) => (
        <Dispatch
          campaignId={id}
          name={name}
          choice={said ?? choiceFor(c.answers?.stop)}
          ctx={c}
          onHold={onHold}
        />
      )}
    </Clarified>
  );
}

/* ── the receipt ─────────────────────────────────────────────────────────── */

function Dispatch({
  campaignId,
  name,
  choice,
  ctx,
  onHold,
}: {
  campaignId: string;
  name: string;
  choice: StopChoice | null;
  ctx: MomentCtx;
  /** Tells the page to keep this receipt on screen while the agent starts, and until it is refused. */
  onHold?: (on: boolean) => void;
}): JSX.Element {
  const [phase, setPhase] = useState<"ready" | "starting" | "started" | "undone">("ready");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ text: string; needsSpec: boolean } | null>(null);
  const [left, setLeft] = useState(UNDO_MS);
  const [selected, setSelected] = useState<string | null>(null);
  const [overview, setOverview] = useState(false);
  const fleet = useFleet({ selected: selected ?? agentId, open: overview });
  const agent = agentId ? fleet.agents.find((a) => a.id === agentId) : undefined;
  const view = agentId ? fleet.views.find((v) => v.id === agentId) : undefined;

  const start = useCallback(async () => {
    if (!choice || phase !== "ready") return;
    setPhase("starting");
    setProblem(null);
    onHold?.(true);
    try {
      const made = await startWatchOn(campaignId, startBody(choice));
      applyAgent({ ...made, campaignName: name });
      setSummary(made.summary);
      setAgentId(made.id);
      setPhase("started");
    } catch (err) {
      setProblem(refusalCopy(messageOf(err)));
      setPhase("ready");
      onHold?.(false);
      // A refusal because the campaign already has one: bring that one into view.
      void refreshAgents();
    }
  }, [choice, phase, campaignId, name, onHold]);

  /* The undo window. */
  useEffect(() => {
    if (phase !== "started") return;
    const t0 = Date.now();
    const timer = window.setInterval(() => {
      const l = Math.max(0, UNDO_MS - (Date.now() - t0));
      setLeft(l);
      if (l === 0) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  const undo = useCallback(async () => {
    if (!agentId) return;
    try {
      applyAgent(await controlAgent(agentId, "stop"));
      setPhase("undone");
    } catch (err) {
      setProblem({ text: messageOf(err), needsSpec: false });
    }
  }, [agentId]);

  const grow = ctx.onGrow;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the transcript follows when what is shown changes
  useEffect(() => {
    grow();
  }, [phase, problem, agent?.lastRunAt, view?.bucket, grow]);

  const looking = agent?.lastRunAt ?? null;

  return (
    <>
      <section className={`mo-dispatch${phase === "undone" ? " is-undone" : ""}`} aria-live="polite">
        <Fork go={phase === "started"} />
        <div className="mo-dispatch-body">
          {phase === "undone" ? (
            <p className="mo-dispatch-h">Undone. The agent has been stopped.</p>
          ) : phase === "started" ? (
            <>
              <p className="mo-dispatch-h">
                Assigned to <Chip /> on {name}
              </p>
              {summary && <p className="mo-dispatch-sub">{summary}.</p>}
              {left > 0 && (
                <div className="mo-undo">
                  <button type="button" className="cn-link" onClick={() => void undo()}>
                    <ArrowCounterClockwise size={12} weight="bold" aria-hidden="true" />
                    Undo
                  </button>
                  <span className="mo-undo-bar">
                    <i style={{ transform: `scaleX(${left / UNDO_MS})` }} />
                  </span>
                  <span className="mo-undo-s">{Math.ceil(left / 1000)}s</span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mo-dispatch-h">
                Put the <Chip /> agent on {name}?
              </p>
              <p className="mo-dispatch-sub">
                {choice ? `${previewSummary(choice)}.` : ""} It works in the background, and you can pause or
                stop it whenever you like.
              </p>
              <div className="lv-acts">
                <button
                  type="button"
                  className="src-btn is-primary mo-small"
                  disabled={!choice || phase === "starting"}
                  onClick={() => void start()}
                >
                  {phase === "starting" ? <><Loader size="sm" tone="inherit" />Starting</> : "Start the agent"}
                </button>
              </div>
            </>
          )}
          {problem && (
            <p className="lv-problem" role="alert">
              {problem.text}
              {problem.needsSpec && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="cn-link"
                    onClick={() => act(ctx, `Write the role spec for ${name}`)}
                  >
                    Write the role spec
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {phase === "started" && agent && agent.state === "running" && (
        <section className="mo-thread" aria-label="Sourcing progress">
          {looking ? (
            <p className="mo-thread-done">
              <Check size={13} weight="bold" aria-hidden="true" />
              First search done. {agent.counters.found} {agent.counters.found === 1 ? "person" : "people"}{" "}
              worth a look so far
            </p>
          ) : (
            <p className="src-phase" style={{ cursor: "default" }}>
              <span className="src-phase-icon" aria-hidden="true">
                <Loader size="sm" />
              </span>
              <span>Getting ready for its first search</span>
            </p>
          )}
        </section>
      )}

      {phase === "started" && view && (
        <>
          <p className="src-para">
            The sourcing agent keeps looking in the background and reports here, so carry on in the
            conversation.
          </p>
          <AgentStrip
            agents={[view]}
            onOpen={(open) => {
              setSelected(open ?? view.id);
              setOverview(true);
            }}
          />
          <AgentsOverview
            open={overview}
            onClose={() => setOverview(false)}
            agents={fleet.views}
            selected={selected ?? view.id}
            onSelect={setSelected}
            onControl={fleet.control}
            ctx={ctx}
          />
        </>
      )}
    </>
  );
}

/** The strip and overview for agents already running, with their controls. */
function FleetStrip({ ids, ctx }: { ids: readonly string[]; ctx: MomentCtx }): JSX.Element | null {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fleet = useFleet({ selected: selected ?? ids[0] ?? null, open });
  const shown = fleet.views.filter((v) => ids.includes(v.id));
  if (shown.length === 0) return null;
  return (
    <>
      <AgentStrip
        agents={shown}
        onOpen={(id) => {
          setSelected(id ?? shown[0]?.id ?? null);
          setOpen(true);
        }}
      />
      <AgentsOverview
        open={open}
        onClose={() => setOpen(false)}
        agents={fleet.views}
        selected={selected ?? shown[0]?.id ?? ""}
        onSelect={setSelected}
        onControl={fleet.control}
        ctx={ctx}
      />
    </>
  );
}

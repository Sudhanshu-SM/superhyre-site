import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { CampaignKey, FleetAgent, PipelineRole, RunState } from "./orchestrator";
import {
  FLEET, RUN_LABEL, RUN_RANK, SCOPED, campaignName, deployPrompt, fleetFor, sourcedFor, stepsFor,
} from "./orchestrator";
import "./moments.css";
import "./board.css";

/**
 * CampaignBoard — every running campaign on one screen.
 *
 * One row per campaign, one column per stage. Each cell shows its people as
 * dots and a count, and its edge says who is working it: an orange edge for
 * an agent running, amber for one waiting on you, rose for one that stopped,
 * hatching where no agent is assigned at all. When a running sourcing agent
 * finds someone, a dot pops into its cell and the counts tick, so the page
 * moves exactly as much as the work does.
 *
 * Every cell hands a sentence to the agent page: ask about the agent, deploy
 * one into a gap, or book interviews. The board reports; the agent acts.
 */

type Stage = { id: string; label: string; role: PipelineRole | null };

const STAGES: readonly Stage[] = [
  { id: "source", label: "Source", role: "Sourcing" },
  { id: "reach", label: "Reach", role: "Outreach" },
  { id: "screen", label: "Screen", role: "Screening" },
  { id: "interview", label: "Interview", role: null },
];

/** Dots drawn per cell before the rest are left to the count. */
const DOTS = 12;

type Row = {
  id: CampaignKey;
  name: string;
  counts: Record<string, number>;
  today: number;
  agents: Record<string, FleetAgent | undefined>;
};

function build(): Row[] {
  return SCOPED.map((id) => {
    const days = sourcedFor(id);
    const steps = stepsFor(id);
    const n = (k: string) => steps.find((s) => s.id === k)?.n ?? 0;
    const fleet = fleetFor(id);
    return {
      id,
      name: campaignName(id),
      counts: {
        source: days.reduce((a, d) => a + d.n, 0),
        reach: n("contacted"),
        screen: n("replied"),
        interview: n("interviews"),
      },
      today: days[days.length - 1]?.n ?? 0,
      agents: Object.fromEntries(STAGES.map((s) => [s.id, s.role ? fleet.find((a) => a.role === s.role) : undefined])),
    };
  });
}

const EDGE: Record<RunState, string> = {
  running: "is-running", waiting: "is-waiting", error: "is-error", queued: "is-queued", done: "is-done",
};

export function CampaignBoard({ onBrief }: { onBrief: (prompt: string) => void }): JSX.Element {
  const [rows, setRows] = useState<Row[]>(build);
  /* Newly arrived dots, per cell, so only they animate. */
  const [fresh, setFresh] = useState<Record<string, number>>({});

  /* ── LIVE ──
     Only a RUNNING sourcing agent adds people. Nothing else moves on its
     own: a waiting agent is waiting, a stopped one has stopped. */
  useEffect(() => {
    const live = rows.filter((r) => r.agents.source?.state === "running").map((r) => r.id);
    if (live.length === 0) return;
    const id = window.setInterval(() => {
      const pick = live[Math.floor(Math.random() * live.length)]!;
      setRows((rs) => rs.map((r) => (r.id === pick
        ? { ...r, counts: { ...r.counts, source: (r.counts.source ?? 0) + 1 }, today: r.today + 1 }
        : r)));
      setFresh((f) => ({ ...f, [`${pick}:source`]: (f[`${pick}:source`] ?? 0) + 1 }));
    }, 3600);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needs = useMemo(
    () => FLEET
      .filter((a) => a.state === "waiting" || a.state === "error")
      .sort((a, b) => RUN_RANK[a.state] - RUN_RANK[b.state]),
    [],
  );

  const ask = (a: FleetAgent) => onBrief(`How is the ${a.role.toLowerCase()} going on ${campaignName(a.campaignId)}?`);
  const total = rows.reduce((n, r) => n + r.today, 0);

  return (
    <section className="bd" aria-labelledby="bd-h">
      <header className="bd-head">
        <div>
          <h2 className="bd-h" id="bd-h">Campaigns</h2>
          <p className="bd-sub">{rows.length} running · <b>{total}</b> sourced today</p>
        </div>
        <ul className="bd-key" aria-label="Legend">
          <li><i className="is-running" />Agent working</li>
          <li><i className="is-waiting" />Needs you</li>
          <li><i className="is-error" />Stopped</li>
          <li><i className="is-gap" />No agent</li>
        </ul>
      </header>

      {needs.length > 0 && (
        <div className="bd-needs">
          <b>Needs you · {needs.length}</b>
          <ul>
            {needs.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => ask(a)} className={`bd-need ${EDGE[a.state]}`}>
                  <span className="bd-need-k">{a.role} · {campaignName(a.campaignId)}</span>
                  <span className="bd-need-v">{a.state === "error" && a.fault ? a.fault.fix : a.doing}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="src-btn is-quiet mo-small bd-order" onClick={() => ask(needs[0]!)}>
            Review in order<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="bd-scroll">
        <div className="bd-grid" role="table" aria-label="Campaigns by stage">
          <div className="bd-r is-head" role="row">
            <span role="columnheader">Campaign</span>
            {STAGES.map((s) => <span key={s.id} role="columnheader">{s.label}</span>)}
            <span role="columnheader" className="bd-today-h">Today</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="bd-r" role="row">
              <span className="bd-name" role="rowheader">
                <b>{r.name}</b>
                <span>{Object.values(r.agents).filter(Boolean).length} agents</span>
              </span>
              {STAGES.map((s) => (
                <Cell
                  key={s.id}
                  stage={s}
                  count={r.counts[s.id]!}
                  agent={r.agents[s.id]}
                  fresh={fresh[`${r.id}:${s.id}`] ?? 0}
                  onClick={() => {
                    const a = r.agents[s.id];
                    if (!s.role) onBrief(`Book interviews for the ${r.name} candidates who are ready`);
                    else if (a) ask(a);
                    else onBrief(deployPrompt(s.role, r.name));
                  }}
                />
              ))}
              <span className={`bd-today${r.today > 0 ? " is-up" : ""}`} role="cell">
                <b key={r.today}>+{r.today}</b>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cell({
  stage, count, agent, fresh, onClick,
}: {
  stage: Stage;
  count: number;
  agent?: FleetAgent;
  fresh: number;
  onClick: () => void;
}) {
  const gap = stage.role !== null && !agent;
  const cls = gap ? "is-gap" : agent ? EDGE[agent.state] : "";
  const shown = Math.min(DOTS, count);
  const label = gap
    ? `No ${stage.role!.toLowerCase()} agent. Deploy one.`
    : agent
      ? `${stage.label}: ${count}. ${agent.role} agent ${RUN_LABEL[agent.state].toLowerCase()}. ${agent.doing}.`
      : `${stage.label}: ${count}. Book interviews.`;

  return (
    <span role="cell" className="bd-cell-wrap">
      <button type="button" className={`bd-cell ${cls}`} onClick={onClick} aria-label={label} title={label}>
        {gap ? (
          <span className="bd-gap-l">No agent · <u>Deploy</u></span>
        ) : (
          <>
            <span className="bd-dots" aria-hidden="true">
              {/* The last dot is re-keyed on every arrival so it pops in
                  again; the rest hold still. */}
              {Array.from({ length: shown }, (_, i) => (
                <i
                  key={i === shown - 1 ? `new-${fresh}` : i}
                  className={i === shown - 1 && fresh > 0 ? "is-new" : undefined}
                />
              ))}
            </span>
            <b className="bd-n" key={count}>{count.toLocaleString("en-IN")}</b>
          </>
        )}
      </button>
      {agent && agent.state !== "running" && !gap && (
        <span className={`bd-state ${EDGE[agent.state]}`}>{RUN_LABEL[agent.state]}</span>
      )}
    </span>
  );
}

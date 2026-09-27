import { ArrowRight, ArrowsOutSimple, Check, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ConnectGate, useConnectors } from "./connectors";
import type { MomentCtx } from "./moments";
import { ACTIVITY, STEP_TIMES, campaignLabel } from "./moments";
import type { FleetAgent, RunState } from "./orchestrator";
import { RUN_LABEL, RUN_RANK } from "./orchestrator";
import { ActionButton, Dialog } from "./ui";
import "./agents.css";

/**
 * Agents — the fleet at a glance in the transcript, and in full in a dialog.
 *
 * ── WHY TWO VIEWS ───────────────────────────────────────────────────────────
 * Stacked cards (the previous design) gave every agent the same weight and
 * the same height, so six agents were six screens of chrome and the one that
 * needed you was found by reading. Now:
 *
 *   in the chat   one row per agent: a ring that is its progress and its
 *                 state at once, what it is doing, one number that moved,
 *                 and — only where it applies — the one thing to do
 *   the dialog    opens by itself. A health bar says how the fleet is in one
 *                 line; the list is grouped by what each agent needs from
 *                 you; the pane shows the selected agent's steps, numbers,
 *                 recent activity and its single action
 */

export type AgentView = FleetAgent & { resumed?: string };

export const METRICS: Readonly<Record<string, readonly { label: string; n: number; d: number }[]>> = {
  f1: [{ label: "sourced", n: 148, d: 12 }, { label: "shortlisted", n: 24, d: 3 }, { label: "matched today", n: 61, d: 9 }],
  f2: [{ label: "drafts ready", n: 4, d: 4 }, { label: "sent", n: 61, d: 0 }, { label: "replied", n: 17, d: 2 }],
  f3: [{ label: "sent", n: 6, d: 0 }, { label: "planned", n: 19, d: 0 }, { label: "replied", n: 2, d: 1 }],
  f4: [{ label: "waiting to screen", n: 5, d: 2 }, { label: "screened", n: 0, d: 0 }, { label: "booked", n: 0, d: 0 }],
  f5: [{ label: "sourced", n: 0, d: 0 }, { label: "searches tried", n: 2, d: 1 }, { label: "matches", n: 0, d: 0 }],
  f6: [{ label: "calls summarised", n: 5, d: 1 }, { label: "advanced", n: 2, d: 1 }, { label: "rejected", n: 3, d: 0 }],
};

const ORDER: readonly RunState[] = ["waiting", "error", "running", "queued", "done"];
const GROUP: Record<RunState, string> = {
  waiting: "Needs you", error: "Stopped", running: "Running", queued: "Queued", done: "Done",
};

/* ── the ring ────────────────────────────────────────────────────────────── */

/**
 * Progress and state in one mark: the arc is steps done of steps total, its
 * colour is the state, and the letter is the role. A running ring's head
 * breathes; nothing else about it moves.
 */
export function Ring({ agent, size = 36 }: { agent: AgentView; size?: number }) {
  const done = agent.state === "done" ? agent.steps.length : agent.step + (agent.state === "running" ? 0.5 : 0);
  const k = Math.min(1, done / agent.steps.length);
  const r = 15;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(k)); return () => cancelAnimationFrame(id); }, [k]);
  return (
    <span className={`ag-ring is-${agent.state}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} className="ag-ring-track" />
        <circle
          cx="18" cy="18" r={r}
          className="ag-ring-arc"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <b>{agent.role[0]}</b>
    </span>
  );
}

/* ── the chat strip ──────────────────────────────────────────────────────── */

export function AgentStrip({
  agents, onOpen,
}: {
  agents: readonly AgentView[];
  onOpen: (id?: string) => void;
}) {
  const counts = ORDER.map((s) => ({ s, n: agents.filter((a) => a.state === s).length })).filter((x) => x.n);
  return (
    <section className="ag-strip" aria-label="Agents">
      <header className="ag-strip-h">
        <Health counts={counts} total={agents.length} />
        <button type="button" className="src-btn is-quiet mo-small" onClick={() => onOpen()}>
          <ArrowsOutSimple size={13} weight="bold" aria-hidden="true" />Open overview
        </button>
      </header>
      <ul className="ag-rows">
        {agents.map((a, i) => {
          const m = METRICS[a.id]?.find((x) => x.d > 0) ?? METRICS[a.id]?.[0];
          return (
            <li key={a.id} style={{ animationDelay: `${i * 50}ms` }}>
              <button type="button" className={`ag-row is-${a.state}`} onClick={() => onOpen(a.id)}>
                <Ring agent={a} size={34} />
                <span className="ag-row-id">
                  <b>{a.role} · {campaignLabel(a.campaignId)}</b>
                  <span>{a.resumed ?? (a.state === "error" && a.fault ? a.fault.what : a.doing)}</span>
                </span>
                {m && (
                  <span className="ag-row-m">
                    <b>{m.n}</b>
                    <span>{m.label}</span>
                    {m.d > 0 && <i>+{m.d}</i>}
                  </span>
                )}
                <span className={`ag-pill is-${a.state}`}>{RUN_LABEL[a.state]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Health({ counts, total }: { counts: readonly { s: RunState; n: number }[]; total: number }) {
  return (
    <div className="ag-health">
      <div className="ag-health-bar" aria-hidden="true">
        {counts.map(({ s, n }) => <span key={s} className={`is-${s}`} style={{ flexGrow: n }} />)}
      </div>
      <p className="ag-health-l">
        <b>{total} agents</b>
        {counts.map(({ s, n }) => (
          <span key={s} className={`is-${s}`}><i />{n} {GROUP[s].toLowerCase()}</span>
        ))}
      </p>
    </div>
  );
}

/* ── the dialog ──────────────────────────────────────────────────────────── */

export function AgentsOverview({
  open, onClose, agents, selected, onSelect, onResume, ctx,
}: {
  open: boolean;
  onClose: () => void;
  agents: readonly AgentView[];
  selected: string;
  onSelect: (id: string) => void;
  onResume: (id: string, how: string) => void;
  ctx: MomentCtx;
}) {
  const sorted = [...agents].sort((a, b) => RUN_RANK[a.state] - RUN_RANK[b.state]);
  const counts = ORDER.map((s) => ({ s, n: agents.filter((a) => a.state === s).length })).filter((x) => x.n);
  const cur = agents.find((a) => a.id === selected) ?? sorted[0]!;
  const listRef = useRef<HTMLUListElement>(null);

  /* ↑ ↓ walk the list while the dialog is open. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      e.preventDefault();
      const i = sorted.findIndex((a) => a.id === cur.id);
      const next = sorted[Math.max(0, Math.min(sorted.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]!;
      onSelect(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sorted, cur, onSelect]);

  return (
    <Dialog open={open} onClose={onClose} label="Agents overview" size="xl">
      <div className="ao">
        <header className="ao-top">
          <div>
            <h2>Agents</h2>
            <p>{agents.length} agents across 3 campaigns</p>
          </div>
          <Health counts={counts} total={agents.length} />
        </header>

        <div className="ao-body">
          <nav className="ao-list" aria-label="Agents">
            <ul ref={listRef}>
              {ORDER.map((s) => {
                const group = sorted.filter((a) => a.state === s);
                if (!group.length) return null;
                return (
                  <li key={s} className="ao-group">
                    <p className={`ao-group-h is-${s}`}><i />{GROUP[s]}<span>{group.length}</span></p>
                    <ul>
                      {group.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className={`ao-item${a.id === cur.id ? " is-on" : ""}`}
                            aria-current={a.id === cur.id}
                            onClick={() => onSelect(a.id)}
                          >
                            <Ring agent={a} size={30} />
                            <span className="ao-item-id">
                              <b>{a.role}</b>
                              <span>{campaignLabel(a.campaignId)}</span>
                            </span>
                            <span className="ao-item-t">{a.seenAgo === 0 ? "now" : a.seenAgo < 60 ? `${a.seenAgo}m` : `${Math.round(a.seenAgo / 60)}h`}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>

          <Detail key={cur.id} agent={cur} ctx={ctx} onClose={onClose} onResume={onResume} />
        </div>
      </div>
    </Dialog>
  );
}

function Detail({
  agent, ctx, onClose, onResume,
}: {
  agent: AgentView;
  ctx: MomentCtx;
  onClose: () => void;
  onResume: (id: string, how: string) => void;
}) {
  const { state: conn } = useConnectors();
  const [fixing, setFixing] = useState(false);
  const [skipped, setSkipped] = useState<readonly "gmail"[]>([]);
  const [metrics, setMetrics] = useState(METRICS[agent.id] ?? []);
  const times = STEP_TIMES[agent.id] ?? [];
  const step = agent.state === "done" ? agent.steps.length : agent.step;

  /* A running agent's first count moves while you watch it. */
  useEffect(() => {
    if (agent.state !== "running") return;
    const id = window.setInterval(() => {
      setMetrics((m) => m.map((x, i) => (i === 0 ? { ...x, n: x.n + 1, d: x.d + 1 } : x)));
    }, 4200);
    return () => window.clearInterval(id);
  }, [agent.state]);

  const act = (() => {
    if (agent.state === "waiting") return {
      tone: "ask", title: "Waiting for you", body: agent.doing,
      button: <button type="button" className="src-btn is-primary mo-small" onClick={() => { onClose(); ctx.seed("Reach out to the shortlist"); }}>Review the drafts<ArrowRight size={13} weight="bold" aria-hidden="true" /></button>,
    };
    if (agent.state === "error" && agent.fault?.kind === "tool") return {
      tone: "bad", title: "A connected service stopped it", body: agent.fault.what,
      button: conn.gmail === "connected"
        ? <ActionButton done="Resumed on Gmail" onRun={() => onResume(agent.id, "Sending the remaining 13 from Gmail")}>Send the rest from Gmail</ActionButton>
        : <button type="button" className="src-btn is-primary mo-small" onClick={() => setFixing(true)}>Send the rest from Gmail</button>,
    };
    if (agent.state === "error" && agent.fault) return {
      tone: "bad", title: "It needs a better brief", body: agent.fault.what,
      button: <button type="button" className="src-btn is-primary mo-small" onClick={() => { onClose(); ctx.seed(`Re-run ${agent.role.toLowerCase()} for ${campaignLabel(agent.campaignId)} in Bangalore, 3 to 6 years`); }}>Add a location and re-run</button>,
    };
    return null;
  })();

  return (
    <article className="ao-detail">
      <header className="ao-d-h">
        <Ring agent={agent} size={48} />
        <div className="ao-d-id">
          <h3>{agent.role} · {campaignLabel(agent.campaignId)}</h3>
          <p>{agent.resumed ?? agent.doing}</p>
        </div>
        <span className={`ag-pill is-${agent.state}`}>{RUN_LABEL[agent.state]}</span>
      </header>

      {act && !agent.resumed && (
        <div className={`ao-act is-${act.tone}`}>
          {act.tone === "bad" && <Warning size={16} weight="fill" aria-hidden="true" />}
          <div>
            <b>{act.title}</b>
            <p>{act.body}</p>
          </div>
          {!fixing && act.button}
        </div>
      )}
      {fixing && !agent.resumed && (
        <ConnectGate
          needs={[{ service: "gmail", why: "13 of 19 messages are still to send on this run.", skipLabel: "Wait for the limit to reset", skippedNote: "The run carries on tomorrow at 09:00." }]}
          skipped={skipped}
          onSkip={(s) => setSkipped([s as "gmail"])}
          onSettled={() => { setFixing(false); if (!skipped.length) onResume(agent.id, "Sending the remaining 13 from Gmail"); }}
        />
      )}

      <dl className="ao-metrics">
        {metrics.map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd><Count n={m.n} />{m.d > 0 && <i key={m.d}>+{m.d}</i>}</dd>
          </div>
        ))}
      </dl>
      <p className="ao-since">Green is what changed since you last looked.</p>

      <div className="ao-cols">
        <section>
          <h4>Steps</h4>
          <ol className="ao-steps">
            {agent.steps.map((s, i) => {
              const st = i < step ? "done" : i === step && agent.state !== "done" ? agent.state : "todo";
              return (
                <li key={s} className={`is-${st}`}>
                  <span className="ao-step-dot" aria-hidden="true">{st === "done" ? <Check size={10} weight="bold" /> : null}</span>
                  <span className="ao-step-l">{s}</span>
                  <span className="ao-step-t">{st === "done" ? times[i] ?? "" : st === "todo" ? "" : RUN_LABEL[agent.state]}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <section>
          <h4>Recent</h4>
          <ol className="ao-feed">
            {agent.resumed && <li className="is-good"><span>just now</span>{agent.resumed}</li>}
            {(ACTIVITY[agent.id] ?? []).map((a) => (
              <li key={a.what} className={a.tone ? `is-${a.tone}` : undefined}><span>{a.at}</span>{a.what}</li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}

function Count({ n }: { n: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / (start === 0 ? 700 : 380));
      setShown(Math.round(start + (n - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = n;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <b>{shown.toLocaleString("en-IN")}</b>;
}

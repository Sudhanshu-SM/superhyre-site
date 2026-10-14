import { ArrowRight, ArrowsOutSimple, Check, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ConnectGate, useConnectors } from "./connectors";
import type { MomentCtx } from "./moments";
import { ACTIVITY, STEP_TIMES, campaignLabel } from "./moments";
import type { Activity } from "./moments";
import type { CampaignKey, FleetAgent, RunState } from "./orchestrator";
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

/**
 * Where an agent sits in the overview. The fleet's five states plus two a live agent can be in:
 * paused by the recruiter (a rest, drawn grey) and ended (finished by the recruiter, not by its goal).
 */
export type Bucket = RunState | "paused" | "ended";

/**
 * An agent as the strip and the overview draw it. The demo's `AgentView` fits as is. A connected
 * console builds these from the server's agents and supplies what the fixtures otherwise stand in
 * for: its own campaign name, counts, step times, recent activity and the controls it really has.
 */
export type OverviewAgent = Omit<AgentView, "campaignId"> & {
  campaignId: string;
  /** Names the campaign where the fixtures' lookup can't. */
  campaignName?: string;
  bucket?: Bucket;
  /** 0 to 1, when the agent counts its own progress; otherwise the ring shows steps done. */
  progress?: number;
  metrics?: readonly { label: string; n: number; d: number }[];
  times?: readonly string[];
  activity?: readonly Activity[];
  /** Why it needs a person, in its own words. */
  attention?: { tone: "ask" | "bad"; title: string; body: string };
  /** What the recruiter can do to it; the overview's `onControl` carries it out. */
  controls?: readonly { action: string; label: string; primary?: boolean }[];
};

export const METRICS: Readonly<Record<string, readonly { label: string; n: number; d: number }[]>> = {
  f1: [{ label: "sourced", n: 148, d: 12 }, { label: "shortlisted", n: 24, d: 3 }, { label: "matched today", n: 61, d: 9 }],
  f2: [{ label: "drafts ready", n: 4, d: 4 }, { label: "sent", n: 61, d: 0 }, { label: "replied", n: 17, d: 2 }],
  f3: [{ label: "sent", n: 6, d: 0 }, { label: "planned", n: 19, d: 0 }, { label: "replied", n: 2, d: 1 }],
  f4: [{ label: "waiting to screen", n: 5, d: 2 }, { label: "screened", n: 0, d: 0 }, { label: "booked", n: 0, d: 0 }],
  f5: [{ label: "sourced", n: 0, d: 0 }, { label: "searches tried", n: 2, d: 1 }, { label: "matches", n: 0, d: 0 }],
  f6: [{ label: "calls summarised", n: 5, d: 1 }, { label: "advanced", n: 2, d: 1 }, { label: "rejected", n: 3, d: 0 }],
};

const ORDER: readonly Bucket[] = ["waiting", "error", "running", "paused", "queued", "done", "ended"];
const GROUP: Record<Bucket, string> = {
  waiting: "Needs you", error: "Stopped", running: "Running", paused: "Paused", queued: "Queued", done: "Done", ended: "Ended",
};
/** A paused or ended agent is inert, so it borrows the queued colour. */
const LOOK: Record<Bucket, RunState> = {
  waiting: "waiting", error: "error", running: "running", paused: "queued", queued: "queued", done: "done", ended: "queued",
};
const bucketOf = (a: OverviewAgent): Bucket => a.bucket ?? a.state;
const rankOf = (a: OverviewAgent) => ORDER.indexOf(bucketOf(a));
const labelOf = (a: OverviewAgent) => a.campaignName ?? campaignLabel(a.campaignId as CampaignKey);

/* ── the ring ────────────────────────────────────────────────────────────── */

/**
 * Progress and state in one mark: the arc is steps done of steps total, its
 * colour is the state, and the letter is the role. A running ring's head
 * breathes; nothing else about it moves.
 */
export function Ring({ agent, size = 36 }: { agent: OverviewAgent; size?: number }) {
  const done = agent.state === "done" ? agent.steps.length : agent.step + (agent.state === "running" ? 0.5 : 0);
  /* An agent that counts its own progress shows that; a running one keeps a sliver so it reads as alive. */
  const k = agent.progress !== undefined
    ? (agent.state === "running" ? Math.max(agent.progress, 0.06) : agent.progress)
    : Math.min(1, done / agent.steps.length);
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
  agents: readonly OverviewAgent[];
  onOpen: (id?: string) => void;
}) {
  const counts = ORDER.map((s) => ({ s, n: agents.filter((a) => bucketOf(a) === s).length })).filter((x) => x.n);
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
          const ms = a.metrics ?? METRICS[a.id];
          const m = ms?.find((x) => x.d > 0) ?? ms?.[0];
          return (
            <li key={a.id} style={{ animationDelay: `${i * 50}ms` }}>
              <button type="button" className={`ag-row is-${LOOK[bucketOf(a)]}`} onClick={() => onOpen(a.id)}>
                <Ring agent={a} size={34} />
                <span className="ag-row-id">
                  <b>{a.role} · {labelOf(a)}</b>
                  <span>{a.resumed ?? (a.state === "error" && a.fault ? a.fault.what : a.doing)}</span>
                </span>
                {m && (
                  <span className="ag-row-m">
                    <b>{m.n}</b>
                    <span>{m.label}</span>
                    {m.d > 0 && <i>+{m.d}</i>}
                  </span>
                )}
                <span className={`ag-pill is-${LOOK[bucketOf(a)]}`}>{GROUP[bucketOf(a)]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Health({ counts, total }: { counts: readonly { s: Bucket; n: number }[]; total: number }) {
  return (
    <div className="ag-health">
      <div className="ag-health-bar" aria-hidden="true">
        {counts.map(({ s, n }) => <span key={s} className={`is-${LOOK[s]}`} style={{ flexGrow: n }} />)}
      </div>
      <p className="ag-health-l">
        <b>{total} {total === 1 ? "agent" : "agents"}</b>
        {counts.map(({ s, n }) => (
          <span key={s} className={`is-${LOOK[s]}`}><i />{n} {GROUP[s].toLowerCase()}</span>
        ))}
      </p>
    </div>
  );
}

/* ── the dialog ──────────────────────────────────────────────────────────── */

export function AgentsOverview({
  open, onClose, agents, selected, onSelect, onResume, onControl, ctx,
}: {
  open: boolean;
  onClose: () => void;
  agents: readonly OverviewAgent[];
  selected: string;
  onSelect: (id: string) => void;
  /** The demo's one action: resuming a stopped agent. */
  onResume?: (id: string, how: string) => void;
  /** Carries out one of an agent's `controls`; resolves to a sentence when it couldn't, null when it did. */
  onControl?: (id: string, action: string) => Promise<string | null>;
  ctx: MomentCtx;
}) {
  const sorted = [...agents].sort((a, b) => rankOf(a) - rankOf(b));
  const counts = ORDER.map((s) => ({ s, n: agents.filter((a) => bucketOf(a) === s).length })).filter((x) => x.n);
  const campaigns = new Set(agents.map((a) => a.campaignId)).size;
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
            <p>{agents.length} {agents.length === 1 ? "agent" : "agents"} across {campaigns} {campaigns === 1 ? "campaign" : "campaigns"}</p>
          </div>
          <Health counts={counts} total={agents.length} />
        </header>

        <div className="ao-body">
          <nav className="ao-list" aria-label="Agents">
            <ul ref={listRef}>
              {ORDER.map((s) => {
                const group = sorted.filter((a) => bucketOf(a) === s);
                if (!group.length) return null;
                return (
                  <li key={s} className="ao-group">
                    <p className={`ao-group-h is-${LOOK[s]}`}><i />{GROUP[s]}<span>{group.length}</span></p>
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
                              <span>{labelOf(a)}</span>
                            </span>
                            <span className="ao-item-t">{a.seenAgo === 0 ? "now" : a.seenAgo < 60 ? `${a.seenAgo}m` : a.seenAgo < 1440 ? `${Math.round(a.seenAgo / 60)}h` : `${Math.round(a.seenAgo / 1440)}d`}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>

          <Detail key={cur.id} agent={cur} ctx={ctx} onClose={onClose} onResume={onResume} onControl={onControl} />
        </div>
      </div>
    </Dialog>
  );
}

function Detail({
  agent, ctx, onClose, onResume, onControl,
}: {
  agent: OverviewAgent;
  ctx: MomentCtx;
  onClose: () => void;
  onResume?: (id: string, how: string) => void;
  onControl?: (id: string, action: string) => Promise<string | null>;
}) {
  const { state: conn } = useConnectors();
  const [fixing, setFixing] = useState(false);
  const [skipped, setSkipped] = useState<readonly "gmail"[]>([]);
  const [ticking, setTicking] = useState(METRICS[agent.id] ?? []);
  /* A connected agent brings its own counts, steps and activity, and nothing about it is staged. */
  const live = agent.controls !== undefined;
  const metrics = agent.metrics ?? ticking;
  const times = agent.times ?? STEP_TIMES[agent.id] ?? [];
  const bucket = bucketOf(agent);
  const finished = agent.state === "done" || bucket === "ended";
  const step = finished ? agent.steps.length : agent.step;

  /* A running demo agent's first count moves while you watch it. */
  useEffect(() => {
    if (agent.state !== "running" || agent.metrics) return;
    const id = window.setInterval(() => {
      setTicking((m) => m.map((x, i) => (i === 0 ? { ...x, n: x.n + 1, d: x.d + 1 } : x)));
    }, 4200);
    return () => window.clearInterval(id);
  }, [agent.state, agent.metrics]);

  const act = live ? null : (() => {
    if (agent.state === "waiting") return {
      tone: "ask", title: "Waiting for you", body: agent.doing,
      button: <button type="button" className="src-btn is-primary mo-small" onClick={() => { onClose(); ctx.seed("Reach out to the shortlist"); }}>Review the drafts<ArrowRight size={13} weight="bold" aria-hidden="true" /></button>,
    };
    if (agent.state === "error" && agent.fault?.kind === "tool") return {
      tone: "bad", title: "A connected service stopped it", body: agent.fault.what,
      button: conn.gmail === "connected"
        ? <ActionButton done="Resumed on Gmail" onRun={() => onResume?.(agent.id, "Sending the remaining 13 from Gmail")}>Send the rest from Gmail</ActionButton>
        : <button type="button" className="src-btn is-primary mo-small" onClick={() => setFixing(true)}>Send the rest from Gmail</button>,
    };
    if (agent.state === "error" && agent.fault) return {
      tone: "bad", title: "It needs a better brief", body: agent.fault.what,
      button: <button type="button" className="src-btn is-primary mo-small" onClick={() => { onClose(); ctx.seed(`Re-run ${agent.role.toLowerCase()} for ${labelOf(agent)} in Bangalore, 3 to 6 years`); }}>Add a location and re-run</button>,
    };
    return null;
  })();

  return (
    <article className="ao-detail">
      <header className="ao-d-h">
        <Ring agent={agent} size={48} />
        <div className="ao-d-id">
          <h3>{agent.role} · {labelOf(agent)}</h3>
          <p>{agent.resumed ?? agent.doing}</p>
        </div>
        <span className={`ag-pill is-${LOOK[bucket]}`}>{GROUP[bucket]}</span>
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
          onSettled={() => { setFixing(false); if (!skipped.length) onResume?.(agent.id, "Sending the remaining 13 from Gmail"); }}
        />
      )}
      {live && <Controls agent={agent} onControl={onControl} />}

      <dl className="ao-metrics">
        {metrics.map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd><Count n={m.n} />{m.d > 0 && <i key={m.d}>+{m.d}</i>}</dd>
          </div>
        ))}
      </dl>
      {(!agent.metrics || metrics.some((m) => m.d > 0)) && <p className="ao-since">Green is what changed since you last looked.</p>}

      <div className="ao-cols">
        <section>
          <h4>Steps</h4>
          <ol className="ao-steps">
            {agent.steps.map((s, i) => {
              const st = i < step ? "done" : i === step && !finished ? LOOK[bucket] : "todo";
              return (
                <li key={s} className={`is-${st}`}>
                  <span className="ao-step-dot" aria-hidden="true">{st === "done" ? <Check size={10} weight="bold" /> : null}</span>
                  <span className="ao-step-l">{s}</span>
                  <span className="ao-step-t">{st === "done" ? times[i] ?? "" : st === "todo" ? "" : GROUP[bucket]}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <section>
          <h4>Recent</h4>
          <ol className="ao-feed">
            {agent.resumed && <li className="is-good"><span>just now</span>{agent.resumed}</li>}
            {(agent.activity ?? ACTIVITY[agent.id] ?? []).map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a feed has no ids, and the same line can repeat
              <li key={`${i}-${a.what}`} className={a.tone ? `is-${a.tone}` : undefined}><span>{a.at}</span>{a.what}</li>
            ))}
            {live && !agent.activity && <li className="is-wait"><span /> Reading what it has done</li>}
            {live && agent.activity?.length === 0 && <li className="is-wait"><span /> Nothing yet. It hasn't searched since it started.</li>}
          </ol>
        </section>
      </div>
    </article>
  );
}

/* What the recruiter can do to a connected agent. The one that clears what it is waiting on
   sits in the notice; the rest are quiet. Stopping asks once, because a stopped agent is over. */
const DOING: Readonly<Record<string, string>> = { pause: "Pausing", resume: "Resuming", stop: "Stopping" };

function Controls({
  agent, onControl,
}: {
  agent: OverviewAgent;
  onControl?: (id: string, action: string) => Promise<string | null>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const controls = agent.controls ?? [];
  const attention = agent.attention;

  const run = async (action: string) => {
    if (!onControl || pending) return;
    setConfirming(false);
    setPending(action);
    setProblem(null);
    const err = await onControl(agent.id, action);
    setPending(null);
    if (err) setProblem(err);
  };

  const button = (c: NonNullable<OverviewAgent["controls"]>[number], primary: boolean) => {
    if (c.action === "stop") {
      return confirming ? (
        <span key={c.action} className="ao-ctl-ask">
          Stop it for good?
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => void run("stop")}>Stop it</button>
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => setConfirming(false)}>Keep it</button>
        </span>
      ) : (
        <button key={c.action} type="button" className="src-btn is-quiet mo-small" disabled={!!pending} onClick={() => setConfirming(true)}>
          {pending === "stop" ? `${DOING.stop}…` : c.label}
        </button>
      );
    }
    return (
      <button key={c.action} type="button" className={`src-btn mo-small ${primary ? "is-primary" : "is-quiet"}`} disabled={!!pending} onClick={() => void run(c.action)}>
        {pending === c.action ? `${DOING[c.action] ?? c.label}…` : c.label}
      </button>
    );
  };

  const main = controls.filter((c) => c.primary);
  const rest = controls.filter((c) => !c.primary);
  return (
    <>
      {attention && (
        <div className={`ao-act is-${attention.tone}`}>
          {attention.tone === "bad" && <Warning size={16} weight="fill" aria-hidden="true" />}
          <div>
            <b>{attention.title}</b>
            <p>{attention.body}</p>
          </div>
          {main.map((c) => button(c, true))}
        </div>
      )}
      {(rest.length > 0 || (!attention && main.length > 0)) && (
        <div className="ao-ctl">
          {(attention ? rest : controls).map((c) => button(c, false))}
        </div>
      )}
      {problem && <p className="ao-ctl-err" role="alert">{problem}</p>}
    </>
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

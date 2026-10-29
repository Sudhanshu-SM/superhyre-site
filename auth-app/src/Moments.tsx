import {
  ArrowCounterClockwise, ArrowRight, ArrowSquareOut, ArrowsOutSimple, CalendarBlank, Check, CheckCircle, ClipboardText,
  Eye, ShareFat, SlackLogo, Sparkle,
} from "@phosphor-icons/react";
import { FormPreviewDialog } from "./ApplyForm";
import type { Form, Question } from "./campaign";
import { answerable, missedMustHaves, mustHaveOf, mustHaves, responsesFor } from "./campaign";
import type { Family, RoleFacts } from "./formKit";
import { builtAround, draftForm, draftNameAlts, estMinutes, familyConflict, idealDomain, idealMustHaves, roleTitle, shortTitle, subLabel, tintOf, titleCase } from "./formKit";
import { addCampaignStub, campaignById, ensureDraft, getFormMeta, isRefusal, liveForms, publishForm, refreshFormCount, retryDraft, useForm, useFormMeta } from "./formsStore";
import { publishProblem } from "./api/forms";
import { messageOf } from "./api/client";
import { AgentStrip, AgentsOverview } from "./AgentsOverview";
import type { AgentView } from "./AgentsOverview";
import { CampaignReport } from "./CampaignReport";
import { Clarified } from "./Clarify";
import { criteriaFor } from "./clarify";
import { CompareDialog, verdictFor } from "./CompareDialog";
import { Loader } from "./components/Loader";
import { ActionButton } from "./ui";
import "./compare.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar, FitMark, Verdicts } from "./CandidateBits";
import { ConnectGate, ServiceMark, useConnectors } from "./connectors";
import type { MomentCtx, MomentKind } from "./moments";
import {
  ASSIGN_PHASES, CAMPAIGN_PHASES, COMPARE_PHASES, DIGEST_PHASES, FORM_STATUS_PHASES, INTAKE, INTAKE_PHASES, LEAK_PHASES, PAST,
  REDISCOVER_PHASES, REPORT_PHASES, RUN_LOG, SCHEDULE_PHASES, SLOTS, STATUS_PHASES, WEEK,
  campaignIn, campaignLabel, candidatesIn, formCampaignIn, roleIn,
} from "./moments";
import type { CampaignKey, PipelineRole, Scope } from "./orchestrator";
import { FLEET, PIPELINE, RUN_LABEL, RUN_RANK, SCOPED, campaignName } from "./orchestrator";
import { Outreach } from "./Outreach";
import { CANDIDATES } from "./sourcing";
import type { Phase } from "./sourcing";
import { Staged } from "./Staged";
import { ClientMoment, NewCampaignMoment } from "./ClientMoments";

/**
 * Moment — the reply for every brief that is not sourcing and not plain
 * prose. One dispatcher so the transcript renders any of them the same way.
 */
export function Moment({ kind, ctx }: { kind: MomentKind; ctx: MomentCtx }): JSX.Element | null {
  /* Every moment asks first when it has to; see clarify.ts. */
  return (
    <Clarified kind={kind} ctx={ctx}>
      {(c) => <Body kind={kind} ctx={c} />}
    </Clarified>
  );
}

function Body({ kind, ctx }: { kind: MomentKind; ctx: MomentCtx }): JSX.Element | null {
  switch (kind) {
    case "outreach": return <Outreach ctx={ctx} />;
    case "status": return <Status ctx={ctx} />;
    case "assign": return <Assign ctx={ctx} />;
    case "report": return <Report ctx={ctx} />;
    case "compare": return <Compare ctx={ctx} />;
    case "schedule": return <Schedule ctx={ctx} />;
    case "leak": return <Leak ctx={ctx} />;
    case "rediscover": return <Rediscover ctx={ctx} />;
    case "intake": return <Intake ctx={ctx} />;
    case "digest": return <Digest ctx={ctx} />;
    case "campaign": return <Campaign ctx={ctx} />;
    case "form": return <FormDraft ctx={ctx} />;
    case "form-status": return <FormStatus ctx={ctx} />;
    case "client": return <ClientMoment ctx={ctx} />;
    case "campaign-new": return <NewCampaignMoment ctx={ctx} />;
    default: return null;
  }
}

const first = (name: string) => name.split(" ")[0]!;
const byId = (id: string) => CANDIDATES.find((c) => c.id === id)!;

/* ════════════════════════════════ status ═══════════════════════════════════ */

/**
 * The fleet: a strip in the conversation, and the overview dialog, which
 * opens by itself once the check-in lands. Resuming an agent from the dialog
 * updates the strip too; both read the same list.
 */
function Status({ ctx }: { ctx: MomentCtx }) {
  const [agents, setAgents] = useState<AgentView[]>(() => {
    const camp = campaignIn(ctx.said);
    const role = roleIn(ctx.said);
    let list = FLEET.filter((a) => (!camp || a.campaignId === camp) && (!role || a.role === role));
    if (list.length === 0) list = FLEET.filter((a) => !camp || a.campaignId === camp);
    if (list.length === 0) list = [...FLEET];
    return [...list].sort((a, b) => RUN_RANK[a.state] - RUN_RANK[b.state]);
  });
  /* The overview always shows the whole fleet, with the asked-about agent
     selected, so the answer sits in context. */
  const [fleet, setFleet] = useState<AgentView[]>(() => [...FLEET]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(agents[0]!.id);
  const opened = useRef(false);

  const resume = useCallback((id: string, how: string) => {
    const patch = (a: AgentView): AgentView => (a.id === id ? { ...a, state: "running", resumed: how } : a);
    setAgents((xs) => xs.map(patch));
    setFleet((xs) => xs.map(patch));
  }, []);

  const auto = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    window.setTimeout(() => setOpen(true), 500);
  }, []);

  return (
    <div className="src mo">
      <Staged phases={STATUS_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <OnMount run={auto} />
        <p className="src-para">
          {agents.length === 1
            ? `${agents[0]!.role} on ${campaignLabel(agents[0]!.campaignId)}: ${RUN_LABEL[agents[0]!.state].toLowerCase()}. The overview has its steps and recent activity.`
            : `${agents.length} agents. ${agents.filter((a) => a.state === "waiting" || a.state === "error").length} need you, and they're first.`}
        </p>
        <AgentStrip agents={agents} onOpen={(id) => { if (id) setSelected(id); setOpen(true); }} />
        <AgentsOverview
          open={open}
          onClose={() => setOpen(false)}
          agents={fleet}
          selected={selected}
          onSelect={setSelected}
          onResume={resume}
          ctx={ctx}
        />
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ assign ═══════════════════════════════════ */

const UNDO_MS = 8000;

const THREAD: Record<PipelineRole, { steps: readonly string[]; result: string }> = {
  Screening: { steps: ["Reading the scorecard", "Calling the first of 5 candidates", "Scoring the calls"], result: "Booked 3 screens for Thursday and Friday" },
  Sourcing: { steps: ["Reading the brief", "Planning the search", "Ranking matches"], result: "Found 22 new matches, 4 worth a look" },
  Outreach: { steps: ["Drafting messages", "Waiting for your approval"], result: "4 drafts ready for your review" },
};

function Assign({ ctx }: { ctx: MomentCtx }) {
  /* Default: the first campaign with no agent in the named role, so an
     unqualified "start screening" fills a real gap. */
  const [{ role, camp, busy }] = useState(() => {
    const role = roleIn(ctx.said) ?? "Screening";
    const named = campaignIn(ctx.said);
    const camp: CampaignKey = named ?? SCOPED.find((c) => !FLEET.some((a) => a.campaignId === c && a.role === role)) ?? "backend-snr";
    const busy = FLEET.find((a) => a.campaignId === camp && a.role === role && a.state !== "done");
    return { role, camp, busy };
  });
  const [key, setKey] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [left, setLeft] = useState(UNDO_MS);
  const [thread, setThread] = useState(0);
  const chipRef = useRef<HTMLSpanElement>(null);
  const flown = useRef(false);

  /* ── THE CHIP FLIES TO THE RAIL, THEN THE AGENT IS DEPLOYED ──
     A clone of the chip travels from the receipt to the Agents panel in the
     rail, and the deploy lands as it arrives, so the new row there is
     visibly the thing that left the conversation. */
  const land = useCallback(() => {
    if (flown.current) return;
    flown.current = true;
    const chip = chipRef.current;
    const target = document.querySelector(".rail-ag-list, .rail-ag-empty, .rail-agents");
    const done = () => setKey(ctx.deploy(role, camp));
    if (!chip || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    const a = chip.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const ghost = chip.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
      margin: "0", zIndex: "80", pointerEvents: "none",
    });
    ghost.classList.add("is-ghost");
    document.body.appendChild(ghost);
    const dx = b.left + 24 - a.left;
    const dy = b.top + 40 - a.top;
    const anim = ghost.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.04)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0 },
      ],
      { duration: 820, easing: "cubic-bezier(0.6, 0.28, 0.44, 1)" },
    );
    anim.finished.then(() => { ghost.remove(); done(); }, () => ghost.remove());
  }, [ctx, role, camp]);

  /* The undo window. */
  useEffect(() => {
    if (!key || undone) return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const l = Math.max(0, UNDO_MS - (Date.now() - t0));
      setLeft(l);
      if (l === 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [key, undone]);

  /* The side thread advances while the conversation carries on below it. */
  useEffect(() => {
    if (!key || undone || busy) return;
    const steps = THREAD[role].steps.length;
    if (thread > steps) return;
    const id = window.setTimeout(() => setThread((t) => t + 1), thread === 0 ? 900 : 2600);
    return () => window.clearTimeout(id);
  }, [key, undone, thread, role, busy]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [key, thread, undone, grow]);

  const undo = () => {
    if (key) ctx.undeploy(key);
    setUndone(true);
  };

  const t = THREAD[role];

  return (
    <div className="src mo">
      <Staged phases={ASSIGN_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <Launch onReady={land} />
        <section className={`mo-dispatch${undone ? " is-undone" : ""}`} aria-live="polite">
          <svg className="mo-fork" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="8" cy="22" r="6" className="mo-fork-src" />
            <path d="M14 22 C24 22 24 10 34 10" className="mo-fork-idle" />
            <path d="M14 22 C24 22 24 34 34 34" className="mo-fork-go" />
            <circle cx="36" cy="10" r="5" className="mo-fork-end" />
            <circle cx="36" cy="34" r="5" className="mo-fork-end is-go" />
          </svg>
          <div className="mo-dispatch-body">
            <p className="mo-dispatch-h">
              {undone ? "Undone. Nothing was assigned." : <>Assigned to <span ref={chipRef} className="mo-chip"><span className="mo-role is-sm">{role[0]}</span>{role}</span> on {campaignLabel(camp)}</>}
            </p>
            {!undone && busy && (
              <p className="mo-dispatch-sub">
                {role} on {campaignLabel(camp)} is already {RUN_LABEL[busy.state].toLowerCase()}. This starts when that run finishes: {busy.doing.toLowerCase()}.
              </p>
            )}
            {!undone && key && left > 0 && (
              <div className="mo-undo">
                <button type="button" className="cn-link" onClick={undo}><ArrowCounterClockwise size={12} weight="bold" aria-hidden="true" />Undo</button>
                <span className="mo-undo-bar"><i style={{ transform: `scaleX(${left / UNDO_MS})` }} /></span>
                <span className="mo-undo-s">{Math.ceil(left / 1000)}s</span>
              </div>
            )}
          </div>
        </section>

        {!undone && key && !busy && (
          <div className="mo-thread" aria-label={`${role} progress`}>
            {t.steps.slice(0, Math.min(thread, t.steps.length)).map((s, i) => {
              const live = i === thread - 1 && thread <= t.steps.length;
              return (
                <p key={s} className="src-phase" style={{ cursor: "default" }}>
                  <span className="src-phase-icon" aria-hidden="true">
                    {live ? <Loader size="sm" /> : <CheckCircle size={16} />}
                  </span>
                  <span>{s}</span>
                </p>
              );
            })}
            {thread > t.steps.length && (
              <p className="mo-thread-done"><Check size={13} weight="bold" aria-hidden="true" />{t.result}</p>
            )}
          </div>
        )}

        {!undone && (
          <p className="src-para">
            The {role.toLowerCase()} agent works in the background. Its progress stays in the thread above and in the live band below, so carry on here.
          </p>
        )}
      </Staged>
    </div>
  );
}

/** Calls `onReady` once, after first paint, so the flight measures real layout. */
function Launch({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onReady, 350);
    return () => window.clearTimeout(id);
  }, [onReady]);
  return null;
}

/* ════════════════════════════════ report ═══════════════════════════════════ */

const DAYS = WEEK.length;

function Report({ ctx }: { ctx: MomentCtx }) {
  const [at, setAt] = useState(0);
  const [, setShared] = useState(false);
  const replaying = useRef(true);

  /* Replays the week once on arrival: the receipt counts up as the marker
     travels, then hands the marker to the recruiter. */
  const replay = useCallback(() => {
    replaying.current = true;
    const t0 = performance.now();
    const dur = 1800;
    const stepFn = (t: number) => {
      if (!replaying.current) return;
      const k = Math.min(1, (t - t0) / dur);
      setAt(k * DAYS);
      if (k < 1) requestAnimationFrame(stepFn);
      else replaying.current = false;
    };
    requestAnimationFrame(stepFn);
  }, []);

  const seen = RUN_LOG.filter((e) => e.day <= at);
  const sent = seen.filter((e) => e.kind === "sent");
  const by = (ch: string) => sent.filter((e) => e.channel === ch).length;
  const replies = seen.filter((e) => e.kind === "reply").length;
  const calls = seen.filter((e) => e.kind === "call").length;
  const bounces = seen.filter((e) => e.kind === "bounce");
  const { identity } = useConnectors();

  return (
    <div className="src mo">
      <Staged phases={REPORT_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <OnMount run={replay} />
        <section className="mo-card mo-receipt" aria-label="Run receipt">
          <header className="mo-receipt-h">
            <span className="mo-role" aria-hidden="true">O</span>
            <div>
              <b>Outreach · Senior Backend Engineers</b>
              <span>22 – 27 Sep · sent by the agent, every message approved by Punith S</span>
            </div>
          </header>

          <div className="mo-lines">
            <p className="mo-grp">Messages</p>
            <Line label="WhatsApp, through Magnifi" n={by("whatsapp")} mark={<ServiceMark id="magnifi" size={16} />} />
            <Line label={`Email, from ${identity.gmail}`} n={by("gmail")} mark={<ServiceMark id="gmail" size={16} />} />
            <Line label="LinkedIn notes, through the extension" n={by("linkedin")} mark={<ServiceMark id="linkedin" size={16} />} />
            <p className="mo-grp">Outcomes</p>
            <Line label="Replies" n={replies} hot />
            <Line label="Calls booked" n={calls} hot />
            <Line label={bounces.length ? `Bounced · ${bounces.map((b) => b.who).join(", ")}'s email` : "Bounced"} n={bounces.length} bad={bounces.length > 0} />
            <p className="mo-total">
              <span>Reply rate</span>
              <span>{replies} of {sent.length} · {sent.length ? Math.min(100, Math.round((replies / sent.length) * 100)) : 0}%</span>
            </p>
          </div>

          <div className="mo-scrub">
            <div className="mo-scrub-track">
              {RUN_LOG.map((e, i) => (
                <span
                  key={i}
                  className={`mo-ev is-${e.kind}${e.day <= at ? " is-past" : ""}`}
                  style={{ left: `${(e.day / DAYS) * 100}%` }}
                  title={`${WEEK[Math.floor(e.day)]} · ${e.kind === "sent" ? `Sent to ${e.who}` : e.kind === "reply" ? `${e.who} replied` : e.kind === "call" ? `Call booked with ${e.who}` : `${e.who}'s email bounced`}`}
                />
              ))}
              <input
                id="mo-scrub"
                type="range"
                min={0}
                max={DAYS * 100}
                value={Math.round(at * 100)}
                onChange={(e) => { replaying.current = false; setAt(Number(e.target.value) / 100); }}
                aria-label="Replay the week"
                aria-valuetext={WEEK[Math.min(DAYS - 1, Math.floor(at))]}
              />
            </div>
            <div className="mo-scrub-days" aria-hidden="true">{WEEK.map((d) => <span key={d}>{d}</span>)}</div>
          </div>

          <footer className="mo-receipt-f">
            <button type="button" className="cn-link" onClick={replay}><ArrowCounterClockwise size={12} weight="bold" aria-hidden="true" />Replay the week</button>
            <span className="sp" />
            <ActionButton tone="quiet" done="Posted to #hiring-backend" onRun={() => setShared(true)}>
              <SlackLogo size={14} weight="fill" aria-hidden="true" />Share with Sudhanshu
            </ActionButton>
          </footer>
        </section>
      </Staged>
    </div>
  );
}

function Line({ label, n, mark, hot = false, bad = false }: { label: string; n: number; mark?: React.ReactNode; hot?: boolean; bad?: boolean }) {
  return (
    <p className={`mo-line${hot && n > 0 ? " is-hot" : ""}${bad ? " is-bad" : ""}`}>
      {mark}
      <span>{label}</span>
      <span className="mo-lead" aria-hidden="true" />
      <b>{n}</b>
    </p>
  );
}

function OnMount({ run }: { run: () => void }) {
  useEffect(() => { run(); }, [run]);
  return null;
}

/* ════════════════════════════════ compare ══════════════════════════════════ */

/**
 * A summary card in the conversation, and the full comparison in a dialog
 * that opens by itself. The card keeps the verdict and the fit marks, so the
 * transcript still says what was decided once the dialog is closed.
 */
function Compare({ ctx }: { ctx: MomentCtx }) {
  const [{ ids, camp }] = useState(() => {
    const named = candidatesIn(ctx.said);
    const short = CANDIDATES.filter((c) => ctx.verdicts[c.id] === "shortlisted").map((c) => c.id);
    const ids = named.length >= 2 ? named.slice(0, 3) : short.length >= 2 ? short.slice(0, 3) : ["priya-nair", "anika-bose"];
    return { ids, camp: campaignIn(ctx.said) ?? "backend-snr" };
  });
  const people = ids.map(byId);
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const v = verdictFor(people, camp);
  const { criteria, meets } = criteriaFor(camp);

  const auto = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    window.setTimeout(() => setOpen(true), 500);
  }, []);

  return (
    <div className="src mo">
      <Staged phases={COMPARE_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <OnMount run={auto} />
        <section className="cs2" style={{ ["--n" as string]: people.length }} aria-label="Comparison summary">
          <div className="cs2-faces">
            {people.map((p, i) => (
              <Frag key={p.id}>
                {i > 0 && <span className="cs2-vs">vs</span>}
                <button type="button" className={`cs2-face${p === v.lead ? " is-lead" : ""}`} onClick={() => ctx.openProfile(p.id, ids)}>
                  <Avatar name={p.name} hue={p.hue} size={30} />
                  <span><b>{first(p.name)}</b><small>{p.totalYears} yrs · {p.jobs[0]!.org.name}</small></span>
                </button>
              </Frag>
            ))}
          </div>
          <div className="cs2-fit">
            {criteria.map((cr, i) => (
              <Frag key={cr}>
                <span className="cs2-k">{cr}</span>
                {people.map((p) => <span key={p.id} className="cs2-m"><FitMark met={!!(meets[p.id] ?? p.meets)[i]} label={cr} /></span>)}
              </Frag>
            ))}
          </div>
          <div className="cs2-foot">
            <span><Sparkle size={12} weight="fill" className="mo-spark" aria-hidden="true" />{v.line}</span>
            <button type="button" className="src-btn is-primary mo-small" onClick={() => setOpen(true)}>
              <ArrowsOutSimple size={13} weight="bold" aria-hidden="true" />Full comparison
            </button>
          </div>
        </section>
        <CompareDialog open={open} onClose={() => setOpen(false)} people={people} camp={camp} ctx={ctx} />
      </Staged>
    </div>
  );
}

function Frag({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* ════════════════════════════════ campaign ═════════════════════════════════ */

function Campaign({ ctx }: { ctx: MomentCtx }) {
  const [scope] = useState<Scope>(() => campaignIn(ctx.said) ?? "all");
  return (
    <div className="src mo">
      <Staged phases={CAMPAIGN_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <p className="src-para">
          {scope === "all" ? "All three campaigns, compared and then combined." : `${campaignName(scope)}, last 14 days.`}
        </p>
        <CampaignReport scope={scope} ctx={ctx} />
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ schedule ═════════════════════════════════ */

function Schedule({ ctx }: { ctx: MomentCtx }) {
  const [who] = useState(() => byId(candidatesIn(ctx.said)[0] ?? "priya-nair"));
  const [pick, setPick] = useState(SLOTS[0]!.id);
  const [stage, setStage] = useState<"pick" | "connect" | "sent">("pick");
  const [skipped, setSkipped] = useState<readonly ("magnifi")[]>([]);
  const { state } = useConnectors();
  const channel = skipped.length ? "email" : "WhatsApp";

  const send = () => {
    if (state.magnifi !== "connected" && !skipped.length) setStage("connect");
    else setStage("sent");
  };

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [stage, grow]);

  return (
    <div className="src mo">
      <Staged phases={SCHEDULE_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <section className="mo-card" aria-label="Proposed times">
          <div className="mo-card-h">
            <CalendarBlank size={16} aria-hidden="true" />
            <b>{first(who.name)} with Sudhanshu M</b>
            <span>30 min · video call</span>
          </div>
          <div className="mo-slots" role="radiogroup" aria-label="Pick the time to suggest first">
            {SLOTS.map((s) => (
              <label key={s.id} className={`mo-slot${pick === s.id ? " is-on" : ""}`}>
                <input type="radio" name={`slot-${who.id}`} checked={pick === s.id} onChange={() => setPick(s.id)} disabled={stage === "sent"} />
                <b>{s.day}</b>
                <span className="mo-slot-t">{s.time}</span>
                <span className="mo-slot-n">{s.note}</span>
              </label>
            ))}
          </div>
          {stage === "pick" && (
            <div className="mo-card-f">
              <span>{first(who.name)} gets all three, with the one you pick first. Holds go on Sudhanshu's calendar.</span>
              <button type="button" className="src-btn is-primary mo-small" onClick={send}>
                Send 3 options on {channel}<ArrowRight size={13} weight="bold" aria-hidden="true" />
              </button>
            </div>
          )}
          {stage === "sent" && (
            <p className="mo-stamp"><CheckCircle size={15} weight="fill" aria-hidden="true" />Sent to {first(who.name)} on {channel}. Three holds placed on Sudhanshu's calendar; I'll release the other two when {first(who.name)} picks.</p>
          )}
        </section>
        {stage === "connect" && (
          <ConnectGate
            needs={[{ service: "magnifi", why: `${first(who.name)} replied on WhatsApp, so the times go there.`, skipLabel: "Send by email instead", skippedNote: "The times go out by email." }]}
            skipped={skipped}
            onSkip={() => setSkipped(["magnifi"])}
            onSettled={() => setStage("sent")}
          />
        )}
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ leak ═════════════════════════════════════ */

function Leak({ ctx }: { ctx: MomentCtx }) {
  const stages = PIPELINE;
  const max = stages[0]!.count;
  /* The widest drop between neighbours, measured as the share that did not
     make it to the next stage. Shortlisting is left out of the chain: it is
     the recruiter choosing, not candidates falling away, and outreach draws
     from the whole sourced pool rather than from the shortlist. */
  const chain = stages.filter((s) => s.id !== "shortlisted");
  const pairs = chain.slice(1).map((s, i) => ({ from: chain[i]!, to: s }));
  const leak = pairs.reduce((a, b) => (b.to.count / b.from.count < a.to.count / a.from.count ? b : a));
  const kept = Math.min(100, Math.round((leak.to.count / leak.from.count) * 100));
  const [grown, setGrown] = useState(false);
  useLayoutEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);

  return (
    <div className="src mo">
      <Staged phases={LEAK_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <section className="mo-card" aria-label="Pipeline">
          <div className="mo-card-h"><b>Senior Backend Engineers</b><span>last 14 days</span></div>
          <ol className="mo-funnel">
            {stages.map((s) => {
              const isLeak = s.id === leak.to.id;
              return (
                <li key={s.id} className={isLeak ? "is-leak" : undefined}>
                  <span className="mo-funnel-l">{s.label}</span>
                  <span className="mo-funnel-bar"><i style={{ transform: `scaleX(${grown ? s.count / max : 0})` }} /></span>
                  <b>{s.count}</b>
                  {isLeak && <span className="mo-funnel-note">only {kept}% of {leak.from.label.toLowerCase()}</span>}
                </li>
              );
            })}
          </ol>
        </section>
        <p className="src-para">
          {leak.from.label} to {leak.to.label.toLowerCase()} is where you lose the most: {leak.to.count} of {leak.from.count}. Four replies are waiting on an answer from you, and Meera has waited three days. Answering those is the fastest fix; a WhatsApp follow-up to the non-responders is the next.
        </p>
        <div className="mo-acts">
          <button type="button" className="src-btn is-primary mo-small" onClick={() => ctx.seed("Draft answers to the 4 candidates waiting on me")}>Answer the 4 waiting</button>
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.seed("Reach out again on WhatsApp to everyone who hasn't replied")}>Follow up on WhatsApp</button>
        </div>
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ rediscover ═══════════════════════════════ */

function Rediscover({ ctx }: { ctx: MomentCtx }) {
  const all = PAST.map((p) => p.id);
  const allShort = all.every((id) => ctx.verdicts[id] === "shortlisted");
  return (
    <div className="src mo">
      <Staged phases={REDISCOVER_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <p className="src-para">Three people from your own past searches fit this brief. You already know them, and they know you.</p>
        <ul className="mo-past">
          {PAST.map((p, i) => {
            const c = byId(p.id);
            return (
              <li key={p.id} style={{ animationDelay: `${i * 70}ms` }}>
                <button type="button" className="mo-past-who" onClick={() => ctx.openProfile(p.id, all)}>
                  <Avatar name={c.name} hue={c.hue} size={34} />
                  <span>
                    <b>{c.name}</b>
                    <span className="mo-past-now">Now {c.headline.replace(/ at /, " · ")}</span>
                  </span>
                </button>
                <p className="mo-past-then"><span>{p.when}</span>{p.what}</p>
                <Verdicts verdict={ctx.verdicts[p.id]} onVerdict={(v) => ctx.onVerdict(p.id, v)} name={c.name} icons />
              </li>
            );
          })}
        </ul>
        {!allShort && (
          <div className="mo-acts">
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => all.forEach((id) => ctx.onVerdict(id, "shortlisted"))}>
              Shortlist all 3
            </button>
          </div>
        )}
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ intake ═══════════════════════════════════ */

function Intake({ ctx }: { ctx: MomentCtx }) {
  const [asked, setAsked] = useState<readonly number[]>([0, 1, 2]);
  const [sent, setSent] = useState(false);
  return (
    <div className="src mo">
      <Staged phases={INTAKE_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <section className="mo-card" aria-label="Intake">
          <div className="mo-card-h"><b>Intake · Senior Backend Engineers</b><span>from your call notes</span></div>
          <ul className="mo-facts">
            {INTAKE.facts.map((f) => {
              const [k, v] = f.split(" · ");
              return <li key={f}><span>{k}</span><b>{v}</b></li>;
            })}
          </ul>
          <p className="mo-grp">Open questions for Sudhanshu</p>
          <ul className="mo-qs">
            {INTAKE.open.map((q, i) => (
              <li key={q}>
                <label>
                  <input
                    type="checkbox"
                    id={`intake-q-${i}`}
                    checked={asked.includes(i)}
                    disabled={sent}
                    onChange={() => setAsked((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]))}
                  />
                  <span>{q}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mo-card-f">
            <span>{sent ? "I'll fold Sudhanshu's answers into the brief as they come in." : "Everything else is set. The search will use these once the questions are answered."}</span>
            <ActionButton done="Asked in #hiring-backend" onRun={() => setSent(true)} disabled={asked.length === 0}>
              <SlackLogo size={14} weight="fill" aria-hidden="true" />Ask {asked.length} on Slack
            </ActionButton>
          </div>
        </section>
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ digest ═══════════════════════════════════ */

function Digest({ ctx }: { ctx: MomentCtx }) {
  const [restarted, setRestarted] = useState(false);
  const rows = useMemo(() => [
    { camp: "backend-snr" as CampaignKey, sourced: 11, replies: 3, note: "4 drafts wait for you" },
    { camp: "platform-sre" as CampaignKey, sourced: 5, replies: 2, note: "Outreach stopped at the mailbox's daily limit" },
    { camp: "ios-mid" as CampaignKey, sourced: 1, replies: 0, note: restarted ? "Sourcing restarted, planning the search" : "Sourcing stopped at 02:10" },
  ], [restarted]);
  const sourced = rows.reduce((a, r) => a + r.sourced, 0);
  const replies = rows.reduce((a, r) => a + r.replies, 0);
  return (
    <div className="src mo">
      <Staged phases={DIGEST_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <p className="src-para">
          Overnight: <b>{sourced} sourced</b> across 3 campaigns, <b>{replies} replies</b>, and 2 calls booked. Two things need you.
        </p>
        <ul className="mo-digest">
          {rows.map((r) => (
            <li key={r.camp}>
              <b>{campaignLabel(r.camp)}</b>
              <span className="mo-digest-n"><Tick n={r.sourced} /> sourced</span>
              <span className="mo-digest-n"><Tick n={r.replies} /> replies</span>
              <span className={`mo-digest-note${r.camp === "ios-mid" && !restarted ? " is-bad" : ""}`}>{r.note}</span>
            </li>
          ))}
        </ul>
        <div className="mo-acts">
          {!restarted && (
            <button type="button" className="src-btn is-primary mo-small" onClick={() => setRestarted(true)}>Restart iOS sourcing</button>
          )}
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.seed("What has outreach done on backend this week?")}>See the replies</button>
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.seed("How are all my agents doing?")}>Check every agent</button>
        </div>
      </Staged>
    </div>
  );
}

/* ════════════════════════════════ form ═════════════════════════════════════ */

const DEPT_FOR: Record<Family, string> = {
  engineering: "Engineering", sales: "Go to market", design: "Design", other: "Operations",
};

const joinAnd = (xs: readonly string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** What the role said, for the line under "Read the role spec": its must-haves and the terms around them. */
const roleLine = (f: RoleFacts, source: "spec" | "setup" | "none") => {
  const bits = [
    f.musts.length ? `Must-haves: ${f.musts.map((m) => m.text).join(", ")}` : "",
    f.yearsMin ? `${f.yearsMin}+ years` : "",
    f.maxNoticeDays !== undefined ? (f.maxNoticeDays === 0 ? "Immediate joiners" : `Notice up to ${f.maxNoticeDays} days`) : "",
  ].filter(Boolean);
  return `${source === "spec" ? "Requirements" : "Campaign"}: ${bits.join(", ") || "no must-haves yet"}`;
};

/** "Yes", or the first accepted choice and how many more. `range`: a run of three or more neighbouring choices reads "Immediate to 60 days". */
const needs = (q: Question, range = false) => {
  const ok = mustHaveOf(q) ?? [];
  const opts = q.options ?? [];
  const at = ok.map((o) => opts.indexOf(o)).sort((x, y) => x - y);
  if (range && ok.length > 2 && at[0]! >= 0 && at.every((x, i) => x === at[0]! + i)) return `${opts[at[0]!]} to ${opts[at[at.length - 1]!]}`;
  return ok.length > 1 ? `${ok[0]} +${ok.length - 1}` : ok[0] ?? "";
};

/** With the API: the draft is made, and saved, before its card is drawn, from the campaign's role spec. */
export type LiveDraft = {
  form: Form;
  facts: RoleFacts | null;
  /** Where the must-haves came from. */
  source: "spec" | "setup" | "none";
};

/**
 * A screening form drafted from the answers to the form questions. The
 * draft goes into the forms store at once (as a draft: nothing is sent), so
 * the builder opens on the same form and the card here follows its edits.
 * Given `live`, the form is already made and saved, and the card says what it was drawn from.
 */
export function FormDraft({ ctx, live: given }: { ctx: MomentCtx; live?: LiveDraft }) {
  const a = ctx.answers ?? {};
  const [made] = useState(() => {
    if (given) return { form: given.form, created: null as string | null };
    const key = `${ctx.said}|${JSON.stringify(a)}`;
    let created: string | null = null;
    let campaignId: string;
    if (a.campaign === "new") {
      const name = (a.newName ?? "").trim() || "New role";
      created = name;
      /* The store memoises stubs by name, so a second render makes none. */
      campaignId = addCampaignStub({ name, department: DEPT_FOR[(a.family as Family) ?? "other"] }).id;
    } else {
      campaignId = a.campaign ?? formCampaignIn(ctx.said)!;
    }
    const roleText = a.roleText ?? (a.campaign === "new" ? a.newName : undefined);
    const fam = (a.family as Family) ?? "other";
    const campName0 = campaignById(campaignId)?.name ?? "New role";
    const base = `${roleText?.trim() ? titleCase(roleText) : roleTitle(campName0)} screening`;
    /* If the campaign already has "<Role> screening", the draft takes the
       sub-type (when the campaign name doesn't already say it), else
       "…, second draft". Never a date, never "(2)". */
    const form = ensureDraft(key, () => draftForm({
      campaignId, family: fam, sub: a.sub, roleText, ideal: a.ideal,
    }), draftNameAlts(base, fam, a.sub, campName0));
    return { form, created };
  });
  const live: Form = useForm(made.form.id) ?? made.form;

  const camp = campaignById(live.campaign);
  const campName = camp?.name ?? made.created ?? live.campaign;
  const around = builtAround(a.ideal ?? "");

  /* Counts come from the draft as it was made, so the phase lines don't
     change under the recruiter if they edit and come back. */
  const n0 = answerable(made.form).length;
  const m0 = mustHaves(made.form).length;
  const min0 = estMinutes(made.form);
  const fromLine = idealMustHaves(a.ideal ?? "", (a.family as Family) ?? "other");
  const domain = idealDomain(a.ideal ?? "");
  const clash = familyConflict(live.campaign, (a.family as Family) ?? "other");
  const phases: readonly Phase[] = useMemo(() => [
    {
      id: "f-read", live: "Thinking…", done: given?.source === "spec" ? "Read the requirements" : "Read the campaign brief", ms: 900,
      steps: [
        camp ? `${campName}: ${camp.department}, ${camp.location}` : "A new campaign, so I started from the role",
        ...(given?.facts ? [roleLine(given.facts, given.source)] : []),
        a.ideal ? `Your line: “${a.ideal}”` : given?.facts ? "" : "No line about the ideal hire, so I worked from the campaign",
      ].filter(Boolean),
      says: "",
    },
    {
      id: "f-pick", live: "Choosing questions", done: domain ? `Chose ${n0} questions, one on ${domain.label.split(" or ")[0]} as you asked` : `Chose ${n0} questions`, ms: 1100,
      steps: answerable(made.form).slice(0, 4).map((q) => q.title).concat(domain ? [domain.question] : []).filter((t, i, xs) => xs.indexOf(t) === i),
      says: "",
    },
    {
      id: "f-must", live: "Setting must-haves",
      /* Say back what the line became, so the recruiter sees it was used. */
      done: fromLine.length
        ? `Turned your line into ${fromLine.length} must-have${fromLine.length === 1 ? "" : "s"}: ${joinAnd(fromLine.map((m) => m.label))}`
        : given?.source && given.source !== "none" ? `Marked ${m0} must-haves from the ${given.source === "spec" ? "requirements" : "campaign"}` : `Marked ${m0} must-haves`,
      ms: 700,
      steps: mustHaves(made.form).map((q) => q.title),
      says: `Here's a first draft for ${campName}: ${n0} questions, about ${min0} minutes for a candidate. Must-haves flag a response for you to look at. Nobody is rejected automatically.${
        made.created ? ` I've set up ${made.created} as a draft campaign. Finish its brief whenever you're ready.` : ""}${clash ? ` ${clash}` : ""}`,
    },
    // Fixed for the turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="src mo is-formflow">
      <Staged phases={phases} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <FormCard ctx={ctx} form={live} answers={a} created={made.created} around={around} given={!!given} />
      </Staged>
    </div>
  );
}

/**
 * A form that was made earlier in the chat, as it stands now: its name, the link to send and a
 * copy of it, a preview, the way into the builder and how many have answered. Drawn when the
 * chat is left and come back to, instead of asking for the form again.
 */
export function FormMade({ ctx, form }: { ctx: MomentCtx; form: Form }) {
  useEffect(() => { ctx.onGrow(); }, [ctx]);
  return (
    <div className="src mo is-formflow">
      <FormCard ctx={ctx} form={form} answers={{}} created={null} around={null} given />
    </div>
  );
}

/**
 * The form drafted in the chat, and what can be done with it: build it, preview it, send it, read what came back.
 * A draft has one primary action, "Publish and copy link", and the link then shows in place; a live form shows its
 * link, Copy link and how many have answered. Its status, link and counts are the store's, so a form the agent
 * publishes or closes from the chat changes here without a reload.
 */
function FormCard({ ctx, form, answers: a, created, around, given }: {
  ctx: MomentCtx; form: Form; answers: Readonly<Record<string, string>>; created: string | null; around: string | null;
  /** With the API: the form is the server's, so its link and its answers are real. */
  given: boolean;
}) {
  const live: Form = useForm(form.id) ?? form;
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  /* Publishing from the card: idle, working, or why it was refused. */
  const [publish, setPublish] = useState<{ state: "idle" | "working" | "failed" | "refused"; problem?: string }>({ state: "idle" });
  const saved = useFormMeta(live.id);
  /* Its status and link, and who has answered it, are read again as the card comes up: the agent, a colleague and
     applicants all change them from outside this card. */
  useEffect(() => { if (given) void refreshFormCount(live.id); }, [given, live.id]);
  useEffect(() => { ctx.onGrow(); }, [saved.status, saved.responses, publish.state, ctx]);

  const camp = campaignById(live.campaign);
  const campName = camp?.name ?? created ?? live.campaign;
  const qs = answerable(live);
  const must = mustHaves(live);
  const rest = qs.filter((q) => !mustHaveOf(q));
  const min = estMinutes(live);
  const tint = tintOf(live);
  const also = [...new Set(rest.map(shortTitle).filter(Boolean))].slice(0, 3);
  const formName = live.name || `${live.title ?? campName} screening`;
  /* The sub-type is a fact about the form, not part of its name. */
  const sub = subLabel((a.family as Family) ?? "other", a.sub);
  const status = given ? saved.status : live.status;
  const link = given && saved.status === "live" ? saved.publicLink : null;
  const answered = given ? saved.responses : 0;
  const copyText = (text: string | null) => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }, () => {});
  };
  const copy = () => copyText(link);
  /* A form made in the chat is a draft: one click publishes it and copies the link, which then shows here. */
  /* A refusal that is for good (not on a team that may do it) settles the card: nothing to publish, nothing to retry, said once. */
  const refused = saved.refused || publish.state === "refused";
  const refusal = publish.state === "refused" ? publish.problem ?? saved.error : saved.refused ? saved.error : null;
  const canPublish = given && status === "draft" && !refused;
  const publishNow = () => {
    if (publish.state === "working") return;
    setPublish({ state: "working" });
    void publishForm(live.id).then(
      () => {
        setPublish({ state: "idle" });
        copyText(getFormMeta(live.id).publicLink);
      },
      (err: unknown) => setPublish({ state: isRefusal(err) ? "refused" : "failed", problem: publishProblem(err) ?? messageOf(err) }),
    );
  };

  return (
    <>
      <article className="mo-card mo-form" aria-label={`Form draft: ${formName}`}
        style={{ ["--mo-form-wash" as string]: tint.wash, ["--mo-form-fill" as string]: tint.fill }}>
        <header className="mo-form-h">
          <p className="mo-form-eyebrow t-caption">
            <span className="mo-form-mark" aria-hidden="true"><ClipboardText size={14} weight="bold" /></span>
            Screening form, {status === "draft" ? "draft" : status === "closed" ? "closed" : "live"}
          </p>
          <h3 className="mo-form-title t-title-sm">{formName}</h3>
          <p className="mo-form-meta t-body-sm">
            <span>For {campName}</span>
            {sub && <span>{sub}</span>}
            <span>{qs.length} questions</span>
            <span>About {min} min</span>
            {answered > 0 && <span>{answered} {answered === 1 ? "response" : "responses"}{saved.newApplicants > 0 ? `, ${saved.newApplicants} new` : ""}</span>}
          </p>
        </header>

        <div className="mo-form-b">
          <p className="mo-form-sub t-label">Must-haves</p>
          {must.length ? (
            <ul className="mo-form-must">
              {must.slice(0, 3).map((q) => (
                <li key={q.id}>
                  <CheckCircle size={15} weight="fill" aria-hidden="true" />
                  <span className="t-body">{q.title}</span>
                  <span className="mo-form-need">Must be {needs(q, given)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mo-form-none t-body-sm">No must-haves yet. You can mark any yes/no or single-choice question as one in the builder.</p>
          )}
          {must.length > 3 && <p className="mo-form-none t-body-sm">And {must.length - 3} more in the builder.</p>}
          {also.length > 0 && <p className="mo-form-also t-body-sm">Also asks about {joinAnd(also)}.</p>}
          {around && <p className="mo-form-around t-body-sm"><span>Built around:</span> {around}</p>}
        </div>

        {given && (link || status === "closed") && (
          <div className="mo-form-link">
            {link ? (
              <>
                <a className="mo-form-url t-body-sm" href={link} target="_blank" rel="noreferrer" title={link}>{link}</a>
                <button type="button" className="src-btn is-quiet mo-small" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
              </>
            ) : (
              <p className="t-body-sm">The link now says the form has closed.</p>
            )}
          </div>
        )}

        <footer className="mo-form-f">
          {refused && refusal && <p className="mo-form-none t-body-sm" role="alert">{refusal}</p>}
          {saved.save === "error" && !refused && (
            <p className="mo-form-none t-body-sm" role="alert">
              This draft isn't saved yet. {saved.error}{" "}
              <button type="button" className="lt-link" onClick={() => void retryDraft(live.id)}>Try again</button>
            </p>
          )}
          {publish.state === "failed" && !refused && (
            <p className="mo-form-none t-body-sm" role="alert">
              I couldn't publish it. {publish.problem}{" "}
              <button type="button" className="lt-link" onClick={publishNow}>Try again</button>
            </p>
          )}
          <div className="mo-acts">
            {canPublish && (
              <button type="button" className="src-btn is-primary mo-small" disabled={publish.state === "working"} aria-busy={publish.state === "working" || undefined} onClick={publishNow}>
                {publish.state === "working" ? <><Loader size="sm" tone="inherit" />Publishing</> : "Publish and copy link"}
              </button>
            )}
            <button type="button" className={`src-btn mo-small ${canPublish ? "is-quiet" : "is-primary"}`} onClick={() => ctx.openForm?.(live.campaign, live.id, "build")}>
              <ArrowSquareOut size={14} aria-hidden="true" />Open in builder
            </button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => setPreview(true)}>
              <Eye size={14} aria-hidden="true" />Preview
            </button>
            {answered > 0 && (
              <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.openForm?.(live.campaign, live.id, "responses")}>
                Open responses<ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
            {!canPublish && (
              <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.openForm?.(live.campaign, live.id, "share")}>
                <ShareFat size={14} aria-hidden="true" />Share
              </button>
            )}
          </div>
        </footer>
      </article>
      <FormPreviewDialog form={live} open={preview} onClose={() => setPreview(false)}
        link={given ? (saved.status === "live" ? saved.publicLink : null) : undefined} />
    </>
  );
}

/* ════════════════════════════════ form responses ═══════════════════════════ */

/** One form's line in the status list: its name, how it is doing, and the way into its responses. */
export type FormStatusRow = {
  id: string;
  name: string;
  /** Under the name: the campaign in the demo, the form's state with the API. */
  sub: React.ReactNode;
  /** How it is doing, in words. */
  said: React.ReactNode;
  /** The way into its responses; a form nobody can answer yet has none. */
  onOpen?: () => void;
  /** The way into its builder: every form has one, answered or not. */
  onBuild?: () => void;
  /** Under the whole line: the link to share, who answered. */
  more?: React.ReactNode;
};

/** The list the status reply is made of; the demo and the connected chat draw it the same way. */
export function FormStatusList({ rows, className }: { rows: readonly FormStatusRow[]; className?: string }) {
  return (
    <ul className={`mo-fstat${className ? ` ${className}` : ""}`}>
      {rows.map((r) => (
        <li key={r.id}>
          <span className="mo-fstat-name">
            <b>{r.name}</b>
            <span className="t-body-sm">{r.sub}</span>
          </span>
          <span className="mo-fstat-n t-body-sm">{r.said}</span>
          {r.onOpen && (
            <button type="button" className="src-btn is-quiet mo-small" onClick={r.onOpen}>
              Open responses<ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
          {r.onBuild && (
            <button type="button" className="src-btn is-quiet mo-small" onClick={r.onBuild}>
              Open the form
            </button>
          )}
          {r.more}
        </li>
      ))}
    </ul>
  );
}

/** Response counts per live form, with a way into each one's responses. */
function FormStatus({ ctx }: { ctx: MomentCtx }) {
  const [rows] = useState(() => liveForms().map((f) => {
    const all = responsesFor(f);
    return { f, n: all.length, missed: all.filter((r) => missedMustHaves(f, r.answers).length > 0).length, camp: campaignById(f.campaign)?.name ?? f.campaign };
  }).sort((x, y) => y.n - x.n));
  const total = rows.reduce((t, r) => t + r.n, 0);
  return (
    <div className="src mo">
      <Staged phases={FORM_STATUS_PHASES} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        {rows.length === 0 ? (
          <p className="src-para">No form is live yet, so there are no responses. Publish one from its builder and send it with your outreach.</p>
        ) : (
          <>
            <p className="src-para">
              {total} {total === 1 ? "response" : "responses"} across {rows.length} live {rows.length === 1 ? "form" : "forms"}.
            </p>
            <FormStatusList rows={rows.map((r) => ({
              id: r.f.id,
              name: r.f.name,
              sub: r.camp,
              said: (
                <>
                  <span className="t-num-sm">{r.n}</span> of <span className="t-num-sm">{r.f.sent}</span> answered
                  {r.missed > 0 && <>, <span className="t-num-sm">{r.missed}</span> missed a must-have</>}
                </>
              ),
              onOpen: () => ctx.openForm?.(r.f.campaign, r.f.id, "responses"),
            }))} />
          </>
        )}
      </Staged>
    </div>
  );
}

/** A number that counts up to its value when it first appears or changes. */
function Tick({ n }: { n: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(n); from.current = n; return; }
    const t0 = performance.now();
    const dur = start === 0 ? 700 : 400;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(Math.round(start + (n - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = n;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <b className="mo-num">{shown.toLocaleString("en-IN")}</b>;
}

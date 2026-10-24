import { TIER_LABEL } from "./chatCards";
import { PassReasonDialog } from "./PassReason";
import { PersonSheet } from "./PersonSheet";
import { CampaignComing, MeetingLinesContext, MeetingNote, PersonMeetings, useMeetingLines } from "./campaignMeetings";
import { useCampaignCalls } from "./campaignCalls";
import { useForms, useResponses } from "./formsStore";
import {
  ArrowRight, Briefcase, Buildings, CalendarBlank, CaretDown, CaretUp, CaretUpDown, GithubLogo, Globe, LinkedinLogo, Prohibit, SortAscending, Star, MapPin, FolderOpen, Check, ClipboardText, Clock, Columns, DotsThree, EnvelopeSimple,
  Fire, FunnelSimple, Kanban, ListChecks, MagnifyingGlass, NotePencil, PaperPlaneTilt, Phone, Plus, Rows,
  Snowflake, Sparkle, SunDim, X, UsersThree, MinusCircle,
} from "@phosphor-icons/react";
import { SheetButton } from "./SheetDialog";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BoardStage, Call, FormResponse, MoveTo, PipelinePerson, StageId, StatusId } from "./campaign";
import { ME, OUTCOME_LABEL, STAGES, STALL_DAYS, STATUSES, callsFor, durationLabel, formsFor, reachedFrom, responsesFor, statusIdOf, wouldMove } from "./campaign";
import type { ApiActivity, ApiOverview } from "./api/campaigns";
import { agoFrom, logLine, reachOf, setStep } from "./api/campaigns";
import type { ClientVerdict } from "./api/stages";
import { agentApi } from "./api/agent";
import { LIVE, messageOf } from "./api/client";
import { controlAgent } from "./liveAgents";
import { addForCandidate, allowContactAgain } from "./dncStore";
import { notContactedYet, shortlistSplit, shortlistTip } from "./shortlistWaiting";
import type { Client, Move } from "./campaignStore";
import {
  currentUserId, loadOlderActivity, refreshCampaignAgents, useCampaignAgents, movePeople, useActivityHasOlder, movePerson, resolveCampaignId, setCampaignClient, setCampaignStatus, useCampaignActivity, useCampaignOverview, useOverviewFailed, retryOverview,
  onHiredLanded, orgHasEarlierHire, pipelineNow, removeFromShortlist, retryPipeline, saveStages, stagesNow, useCampaignRow, useCampaignStages, useClients, useMoves, usePipeline, usePipelineFailed, usePipelineReady,
} from "./campaignStore";
import type { StageDef } from "./boardStages";
import type { FunnelBar } from "./boardStages";
import { columnNote, columnsOf, firstNamesOrFull, firstOfKind, funnelBars, isDefaultSet, placeLabel, pipelineStrip, stepChip, groupByStage, isStageMove, kindLabel, stageIdOf, stageNamed, stageOf, stageText, verdictLabel, verdictTone, wouldMoveToStage, workingOf } from "./boardStages";
import { startEdgeScroll } from "./boardAutoScroll";
import { StagesDialog } from "./StagesDialog";
import { ClientBar } from "./ClientBar";
import { ClosedBar, FilledBar } from "./FilledBar";
import { LooseEndsNote } from "./TiedBlock";
import { CloseDialog } from "./CloseDialog";
import { hiresOf } from "./hired";
import { AssignDialog, ConfirmDialog, ReopenDialog, YourWorkCard } from "./RoleBits";
import { mayChangeCampaign, mayCloseCampaign, useMayChangeCampaign } from "./campaignRights";
import { can, standingOf, useCan } from "./can";
import { isMe, useSession } from "./roleStore";
import imgHired from "./assets/stages/hired.png";
import imgInterviewing from "./assets/stages/interviewing.png";
import imgOutreach from "./assets/stages/outreach.png";
import imgShortlisted from "./assets/stages/shortlisted.png";
import type { CampaignRow } from "./campaignsData";
import { Avatar } from "./CandidateBits";
import { AgentsPanel, ClosedPanel, HiresCard, OvCard, dMMM, isSent } from "./OverviewPanel";
import { TasksCard, TasksGhost } from "./TasksPanel";
import { plainText } from "./displayText";
import { firstHireSeen, rememberFirstHire } from "./firstHireSeen";
import { Popover, useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { PipelineEmpty } from "./PipelineEmpty";
import { isFirstHire, listEmptyArt, shortlistEmpty } from "./emptyStates";
import { asksForStagesEditor, withoutStagesAsk } from "./nav";
import type { RouteId } from "./nav";
import type { Brief } from "./orchestrator";
import { BRIEFS } from "./orchestrator";
import { Shimmer, ShimmerRegion, ShimmerTableRows } from "./components/Shimmer";
import type { ShimCell } from "./components/Shimmer";
import { Pager } from "./components/Pager";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { clampedOffset, hasDeepLink, loadSection, take } from "./sectionState";
import { PAGER_FOOT, usePageSize, usePageSizeChoice } from "./usePageSize";
import { useWarmup } from "./warmup";
import { Dialog, LoadFailed } from "./ui";
import { ClientLogo } from "./ClientLogo";
import { RoleSpecPanel } from "./RoleSpecPanel";
import { CampaignEditDialog } from "./CampaignEdit";
import { CampaignExport } from "./FormResponses";
import { LiveOutreach } from "./Outreach";
import { ContactSideLine, ContactsMenu, ContactValueCell } from "./ContactsFetch";
import { SlColumnsMenu, useSlColumns } from "./SlColumns";
import type { SlCol } from "./SlColumns";
import { toneProps } from "./statusTones";
import { ClientForm } from "./Clients";
import { CLIENT_STATUS_LABEL } from "./clients";
import "./workspace.css";
import "./boardStages.css";

/* The Sourcing / Outreach "Agents" panel above the Overview is hidden for now (13 Oct: the owner asked for it to go).
   The panel and its data stay, so bringing it back is this one flag. */
const SHOW_AGENTS_PANEL = false;

/**
 * The campaign workspace: Overview, Pipeline, Shortlisted and Calls (Forms
 * live in CampaignForms.tsx).
 *
 * Tone is a design requirement here. A recruiter opens these pages most when
 * hiring is going badly, so they lead with what moved, phrase gaps as next
 * steps, keep colour for actions and progress, and celebrate the moments that
 * matter instead of alarming about the ones that have not happened yet.
 */

export type Ctx = { campaignId: string; go: (r: RouteId) => void; onAgent: (prompt?: string, opts?: { send?: boolean }) => void };

/* "Open the Pipeline already focused on this stage": set by one page, read
   by the next. */
let pendingStage: string | null = null;
export function openStage(stage: string, go: (r: RouteId) => void) { pendingStage = stage; go("campaign-candidates"); }

/* "Open the Shortlisted page with the outreach already showing": the Overview's agents panel asks for it. */
let pendingOutreach = false;
export function openOutreach(go: (r: RouteId) => void) { pendingOutreach = true; go("campaign-shortlisted"); }

/* Live rows, so a status set from the Campaigns page or the header
   (closed, reopened) shows here at once. */
const useRowFor = (id: string): CampaignRow | undefined => useCampaignRow(id);
const onBoard = (p: PipelinePerson) => p.stage !== "passed";

/** Whether a move would change anything: by status (a kind, Replied) or into one of the campaign's own stages. */
function wouldChange(p: PipelinePerson, to: MoveTo, stages: readonly StageDef[]): boolean {
  if (!isStageMove(to)) return wouldMove(p, to);
  const st = stageNamed(stages, to.stageId);
  return !!st && wouldMoveToStage(p, st, stages);
}

/** The line a move is told in, with the campaign's own name for the stage. */
function moveLine(first: string, to: MoveTo, stages: readonly StageDef[]): string {
  const label = isStageMove(to) ? stageNamed(stages, to.stageId)?.name : STATUSES.find((s) => s.id === to)?.label;
  return `${first} moved to ${label ?? "the new stage"}`;
}

/* ── shared header ──
   Breadcrumb, title, one quiet line of context, actions. Nothing else: the
   campaign's story sits in the page, so the header never competes with it. */

export function CampaignHeader({ ctx, title, meta, badge, children }: { ctx: Ctx; title?: string; meta?: ReactNode; badge?: ReactNode; children?: ReactNode }) {
  const row = useRowFor(ctx.campaignId);
  return (
    <header className="cw-head">
      <div className="cw-head-t">
        <p className="cw-crumb">
          <a href="#/campaigns" onClick={(e) => { e.preventDefault(); ctx.go("campaigns"); }}>Campaigns</a>
          <span aria-hidden="true">/</span>
          <span>{plainText(row?.name) || "Campaign"}</span>
        </p>
        <h1 className="cw-h1">{title ?? (plainText(row?.name) || "Campaign")}{badge}</h1>
        {meta && <p className="cw-sub">{meta}</p>}
      </div>
      {children && <div className="cw-head-act">{children}</div>}
    </header>
  );
}

/* ═══════════════════════════ overview v11: "how this search is moving" ═══════════════════════════
   One hero: a very soft funnel of columns, Found (all-time) → Shortlisted →
   In outreach → Replied → Interviewing → Hired, where Hired is the campaign's
   seats as three slots. Everything else is arranged around it: the sentence
   above, Your next moves and the client beside it, and three calm cards
   under it (nearest the finish, their words, what the agent is doing).

   Rules: counts are typeset final (no count-up); only bar reveal and opacity
   animate, settled before 700ms. Mint means hired, the offer seat, moved
   forward and done. Orange is spent twice in content: the first Next-moves
   button and "Open pipeline". No red, no down arrows, deltas only when up.
   Every figure traces to the people, the campaign row, forms or briefs. */

const firstName = (name: string) => name.split(" ")[0] ?? name;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateAgo = (days: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - days); return d; };
/** How long a running campaign has been open, counted in calendar days: a new one is "Opened today". */
export function openFor(daysAgo: number): JSX.Element {
  if (daysAgo <= 0) return <>Opened <b>today</b></>;
  if (daysAgo === 1) return <>Open since <b>yesterday</b></>;
  return <>Open <b>{daysAgo} days</b></>;
}
/** "3w ago" / "5d ago" / "2mo ago" as whole days; "Just now", minutes and hours are day 0. */
const agoDays = (s: string) => { const m = /^(\d+)\s*(mo|[hdwm])/.exec(s); if (!m) return 0; const v = +m[1]!; return m[2] === "w" ? v * 7 : m[2] === "mo" ? v * 30 : m[2] === "d" ? v : 0; };
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const quoteOf = (last: string) => last.replace(/^Replied:\s*/, "");
const byIn = (a: PipelinePerson, b: PipelinePerson) => a.inStage - b.inStage;
const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0);

/* Dev-only state previews, so every state can be checked without a backend:
   `?ovfixture=early|zero|closed|new` before the hash. Built from
   the real campaign's people, re-staged; never in a build. */
type Preview = { row: CampaignRow; people: PipelinePerson[]; live?: boolean };
function previewFor(base: CampaignRow | undefined, people: readonly PipelinePerson[]): Preview | null {
  if (!import.meta.env.DEV || !base || typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search);
  const fx = fixtureFor(base, people, q.get("ovfixture"));
  const seats = Number(q.get("ovseats"));
  return seats > 0 ? { ...seatsFor(fx ?? { row: base, people: [...people] }, seats, q.get("ovhired"), q.get("ovweek") === "1"), live: !fx } : fx;
}

/* `?ovseats=1|3|12|50` (optionally `&ovhired=N`, `&ovweek=1`): the same
   campaign with another seat count, so the Hires panel can be checked at
   every size. Hires are re-staged from the people furthest along; their
   hire dates spread over this week, last week and earlier months unless
   `ovweek=1` keeps them all in this week. Dev only. */
const SEAT_HIRES: Readonly<Record<number, number>> = { 1: 0, 3: 1, 12: 7, 50: 12 };
function seatsFor(base: Preview, seats: number, hiredParam: string | null, sameWeek: boolean): Preview {
  const want = hiredParam != null ? Math.max(0, Number(hiredParam) || 0) : SEAT_HIRES[seats] ?? Math.floor(seats / 3);
  const rank = (p: PipelinePerson) => (p.stage === "hired" ? 0 : p.stage === "interviewing" && p.step !== "offer" ? 1 : p.step === "replied" ? 2 : p.stage === "outreach" ? 3 : p.stage === "shortlisted" ? 4 : 9);
  const order = base.people.map((p, i) => ({ p, i })).filter((x) => x.p.step !== "offer" && x.p.stage !== "passed").sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i);
  const pick = new Map(order.slice(0, want).map((x, k) => [x.i, k] as const));
  const when = (k: number) => (sameWeek ? k % 7 : k < 3 ? k * 2 : k < 8 ? 7 + (k - 3) : 15 + (k - 8) * 6);
  const out = base.people.map((p, i): PipelinePerson => {
    const k = pick.get(i);
    if (k != null) return { ...p, stage: "hired", step: null, inStage: when(k), last: "Accepted the offer" };
    return p.stage === "hired" ? { ...p, stage: "interviewing", step: "loop", last: "Panel feedback in" } : p;
  });
  return { row: { ...base.row, target: seats, funnel: { ...base.row.funnel, hired: Math.min(want, pick.size) } }, people: out };
}

function fixtureFor(base: CampaignRow, people: readonly PipelinePerson[], which: string | null): Preview | null {
  const zeros = Array.from({ length: 14 }, () => 0);
  if (which === "early" || which === "new") {
    const pool = people.filter((p) => p.stage !== "passed");
    const reach = which === "early" ? 33 : 0;
    const out = pool.map((p, i): PipelinePerson => i < reach
      ? { ...p, stage: "outreach", step: "waiting", inStage: i % 2, last: i % 3 ? "Email sent" : "LinkedIn note sent" }
      : { ...p, stage: "shortlisted", step: null, inStage: 0, last: "Shortlisted by the agent" });
    return {
      row: { ...base, createdAgo: which === "new" ? "Just now" : "1d ago", trend: [...zeros.slice(2), 31, 15], kept: [...zeros.slice(2), 9, 4], funnel: { ...base.funnel, contacted: reach, replied: 0, interviews: 0, hired: 0 } },
      people: out,
    };
  }
  if (which === "zero") {
    return { row: { ...base, funnel: { ...base.funnel, hired: 0 } }, people: people.map((p) => (p.stage === "hired" ? { ...p, stage: "interviewing", step: "loop", last: "Panel feedback in" } : p)) };
  }
  if (which === "closed") {
    const out = people.map((p, i): PipelinePerson => (p.stage === "hired" || p.step === "offer" || (p.stage === "interviewing" && i % 2))
      ? { ...p, stage: "hired", step: null, inStage: 4 + (i % 9), last: "Accepted the offer" }
      : p.stage === "shortlisted" ? p : { ...p, stage: "passed", step: null });
    return { row: { ...base, status: "closed", agents: [], updatedAgo: "4d ago" }, people: out };
  }
  return null;
}

/** A person as a face: two initials on a soft tint, ringed in white. */

/** A tile header, as on Home: title, a quiet right side, a hairline that fades at both ends. */

/** A card's one foot link: quiet text, an arrow that slides on hover. */

/* ─────────────────────────────── the model ───────────────────────────────
   Every figure the page prints, from the people, the campaign row, the
   client, forms and briefs. The modules read from this and nothing else. */

type ColKey = "found" | "shortlisted" | "outreach" | "replied" | "interviewing";
type Col = { key: ColKey; label: string; n: number; h: number; hue: "lav" | "sky" | "peach"; warm: boolean; zero: boolean; broken: boolean; stage: BoardStage; tip: string[] };
type Step = { num: string; word: string; full: string };
type Phase = "closed" | "active";

const TYPICAL: readonly [number, number] = [18, 24];
const RANK: Readonly<Record<StageId, number>> = { passed: -1, shortlisted: 0, outreach: 1, interviewing: 2, hired: 3 };
const names = (ps: readonly PipelinePerson[], n = 3) => {
  /* First names, unless two of them are the same: then those two are told apart by their full names. */
  const shown = firstNamesOrFull(ps.slice(0, n).map((p) => p.name));
  return ps.length > n ? `${shown.join(", ")} and ${ps.length - n} more` : shown.join(", ");
};


function overviewModel(a: {
  row: CampaignRow | undefined; people: readonly PipelinePerson[]; moves: readonly Move[]; client?: Client;
  briefs: readonly Brief[]; responses: readonly FormResponse[];
  /** Live: the API's own counts, which know who reached each stage before moving on. */
  api?: ApiOverview;
}) {
  const { row, people, moves, client, briefs, responses, api } = a;
  const status = row?.status ?? "active";
  const counted = reachedFrom(people, row?.funnel.sourced ?? 0, row?.target ?? 1);
  const r = api ? { ...counted, ...reachOf(api) } : counted;
  const target = r.target;
  const hired = people.filter((p) => p.stage === "hired").sort(byIn);
  const offer = people.filter((p) => p.step === "offer").sort(byIn);
  const loop = people.filter((p) => p.stage === "interviewing" && p.step !== "offer").sort(byIn);
  const replied = people.filter((p) => p.step === "replied").sort(byIn);
  const waiting = people.filter((p) => p.stage === "outreach" && p.step !== "replied");
  const shortlisted = people.filter((p) => p.stage === "shortlisted").sort(byIn);
  /* Who is still to be written to: people on the do-not-contact list are shortlisted but never waiting to be contacted. */
  const { toContact, listed: heldBack } = shortlistSplit(shortlisted);
  const phase: Phase = status === "closed" ? "closed" : "active";

  /* ── the funnel columns ──
     Broken axis: Found is drawn full height as the all-time pool with a
     visible break. From Shortlisted on, heights are LINEAR to Shortlisted
     (86% of the plot), with an 8% floor so a small stage is still a column. */
  const S = r.shortlisted;
  const lin = (n: number) => (S > 0 ? Math.max(n > 0 ? 8 : 0, (n / S) * 86) : 0);
  const broken = r.found > S * 1.25;
  /* The conversions between steps are the server's (one definition, a part of its whole, never over 100); the
     demo's fixtures work them out from the people. */
  const served = (stage: string) => api?.funnel.find((f) => f.stage === stage)?.pct ?? 0;
  const within = (n: number, of: number) => (of > 0 && n <= of ? pct(n, of) : 0);
  const step = api
    ? { kept: served("shortlisted"), out: served("outreach"), rep: served("replied"), int: served("interviewing") }
    : { kept: within(S, r.found), out: within(r.outreach, S), rep: within(r.replied, r.outreach), int: within(r.interviewing, r.outreach) };
  const cols: Col[] = [
    { key: "found", label: "Found", n: r.found, h: broken ? 100 : Math.min(100, lin(r.found)), hue: "lav", warm: false, zero: !r.found, broken, stage: "shortlisted",
      tip: [`${r.found} ${plural(r.found, "profile")} found since launch`, `${sum((row?.trend ?? []).slice(-7))} found this week`] },
    { key: "shortlisted", label: "Shortlisted", n: S, h: S ? 86 : 0, hue: "lav", warm: false, zero: !S, broken: false, stage: "shortlisted",
      /* The funnel counts everyone put on the shortlist; the board's column counts who is still at that stage. */
      tip: [shortlistTip(S, toContact.length, names(toContact), heldBack.length), ...(step.kept ? [`Kept ${step.kept}% of the profiles found`] : [])] },
    { key: "outreach", label: "In outreach", n: r.outreach, h: lin(r.outreach), hue: "sky", warm: false, zero: !r.outreach, broken: false, stage: "outreach",
      tip: [
        ...(waiting.length ? [`${waiting.length} at this stage: ${names([...waiting].sort(byIn))}`] : ["Nobody is waiting on a first reply"]),
        ...(step.out ? [`Reached out to ${step.out}% of the shortlist`] : []),
      ] },
    { key: "replied", label: "Replied", n: r.replied, h: lin(r.replied), hue: "sky", warm: true, zero: !r.replied, broken: false, stage: "outreach",
      tip: [
        ...(replied.length ? [`${replied.length} at this stage: ${names(replied)}`, `${r.repliesToAnswer} waiting on your reply`] : ["Every reply has an answer"]),
        ...(step.rep ? [`${step.rep}% of the people reached replied`] : []),
      ] },
    { key: "interviewing", label: "Interviewing", n: r.interviewing, h: lin(r.interviewing), hue: "peach", warm: true, zero: !r.interviewing, broken: false, stage: "interviewing",
      tip: [
        ...(loop.length ? [`${loop.length} in interviews: ${names(loop)}`] : []),
        ...(offer.length ? [`${names(offer, 1)} has an offer`] : []),
        ...(!r.interviewing ? ["First interviews follow replies"] : []),
        ...(step.int ? [`${step.int}% of the people reached moved to interviews`] : []),
      ] },
  ];
  /* the step between two columns: the number always, the word only when the
     card is wide enough to give it room (the column tooltip says it in full) */
  const steps: (Step | null)[] = [
    step.kept && S ? { num: `${step.kept}%`, word: "kept", full: `Kept ${step.kept}% of the profiles found` } : null,
    step.out && r.outreach ? { num: `${step.out}%`, word: "reached out", full: `Reached out to ${step.out}% of the shortlist` } : null,
    step.rep && r.replied ? { num: `${step.rep}%`, word: "replied", full: `${step.rep}% of the people reached replied` } : null,
    step.int && r.interviewing ? { num: `${step.int}%`, word: "to interviews", full: `${step.int}% of the people reached moved to interviews` } : null,
  ];

  /* "Moved forward this week": people who reached interviews or beyond and
     entered that stage less than 7 days ago, plus this session's forward
     moves. Being messaged is the agent's work, not the candidate's progress,
     so outreach never counts; new replies are named in the tooltip instead.
     An approximation from days-in-stage (there are no stage timestamps), and
     the tooltip says so. */
  const fwdMoves = moves.filter((mv) => RANK[mv.to] > RANK[mv.person.stage]);
  const fwd = new Set(fwdMoves.map((mv) => mv.person.id));
  for (const p of people) if (RANK[p.stage] >= RANK.interviewing && p.inStage < 7) fwd.add(p.id);
  const moved = [...fwd].filter((id) => people.some((p) => p.id === id && p.stage !== "passed")).length;
  const newReplies = replied.filter((p) => p.inStage < 7).length;
  const sessionMoves = fwdMoves.slice(0, 3).map((mv) => `${firstName(mv.person.name)} → ${STAGES.find((s) => s.id === mv.to)?.label ?? mv.to}`);

  /* ── the status sentence: names and story, never the hero's numerals ── */
  const o = offer[0];
  let sentence: { who?: PipelinePerson; text: string } | null;
  if (phase === "closed") sentence = hired.length ? { who: hired[0], text: hired.length > 1 ? ` and ${hired.length - 1} more joined. This search is closed.` : " joined. This search is closed." } : { text: "This search is closed." };
  else if (o) sentence = { who: o, text: `${isSent(o) ? " is deciding on an offer" : "’s offer is drafted"}${loop.length ? `, and ${loop.length} more ${loop.length === 1 ? "is" : "are"} in interviews.` : "."}` };
  else if (loop[0]) sentence = { who: loop[0], text: loop.length > 1 ? ` and ${loop.length - 1} more are in interviews.` : " is in interviews." };
  else if (replied.length) sentence = replied.length === 1 ? { who: replied[0], text: " replied and wants to talk." } : { text: `${replied.length} people replied and want to talk.` };
  else if (r.waiting) sentence = { text: `Outreach is out to ${r.waiting} people. Most replies arrive within a week.` };
  else sentence = { text: toContact.length ? "Your shortlist is ready for outreach." : shortlisted.length ? "Everyone on your shortlist is on the do-not-contact list." : "The agent is building your shortlist." };

  /* the hiring manager, for "Check with {manager}" in the side panel */
  const manager = client?.manager || "";

  /* ── nearest the finish: offer, then loop, then replied; fit, then freshest ── */
  const stepRank = (p: PipelinePerson) => (p.step === "offer" ? 0 : p.stage === "interviewing" ? 1 : 2);
  const late = [...offer, ...loop, ...replied].sort((x, y) => stepRank(x) - stepRank(y) || (y.fit ?? 0) - (x.fit ?? 0) || x.inStage - y.inStage);
  const top3 = (phase === "closed" ? hired : late).slice(0, 3);
  const noteWords = new Set((client?.notes ?? "").toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !["prefers", "candidates", "experience", "with", "should", "please", "that", "from", "have", "someone", "people"].includes(w)) ?? []);
  /* why they match: the client's own words when a skill, the industry or the
     title truly contains one; otherwise their top two skills and years */
  const why = (p: PipelinePerson): { text: string; hit: boolean } => {
    const hay = [...p.skills, ...p.industry.split(/[\s,/]+/), ...p.title.split(/[\s,/]+/)].map((s) => s.toLowerCase());
    const hit = [...noteWords].find((w) => hay.includes(w));
    if (hit && client) return { text: `${hit} · matches ${client.name.split(" ")[0]}’s ask`, hit: true };
    return { text: [...p.skills.slice(0, 2), p.years ? `${p.years} yrs` : ""].filter(Boolean).join(", "), hit: false };
  };

  /* ── replies, counted exactly as the funnel counts them ── */
  const rate = api ? api.repliedPct ?? 0 : pct(r.replied, r.outreach);
  const band: "above" | "in" | "below" = rate > TYPICAL[1] ? "above" : rate >= TYPICAL[0] ? "in" : "below";
  const quotes = (() => {
    const seen = new Set<string>(), out: PipelinePerson[] = [];
    for (const p of replied) { if (!/^Replied:/.test(p.last)) continue; const q = quoteOf(p.last); if (!seen.has(q)) { seen.add(q); out.push(p); } }
    return out.slice(0, 2);
  })();

  /* ── sourcing: `trend` and `kept` are the LAST 14 DAYS, oldest first ── */
  const trend = row?.trend ?? [];
  const found = api ? api.found.thisWeek : sum(trend.slice(-7)), foundLast = api ? api.found.lastWeek : sum(trend.slice(-14, -7));
  const kept = row?.kept ?? null;
  const keptWeek = api ? api.kept.thisWeek : kept ? sum(kept.slice(-7)) : null;
  const keptLast = api ? api.kept.lastWeek : kept ? sum(kept.slice(-14, -7)) : null;
  const days = Array.from({ length: 7 }, (_, i) => {
    const back = 6 - i, d = dateAgo(back);
    return { day: WEEKDAYS[d.getDay()]!, found: trend[trend.length - 1 - back] ?? 0, kept: kept ? kept[kept.length - 1 - back] ?? 0 : null };
  });
  const openToWork = shortlisted.filter((p) => p.openToWork).length;
  const verified = shortlisted.filter((p) => p.email?.verified).length;
  const search = briefs.find((b) => b.mode === "sourcing");
  const sourcingOn = !!row?.agents.includes("Sourcing") && status === "active";

  /* ── the client: only what the data says; never "owes feedback" ── */
  const longest = [...loop].sort((x, y) => y.inStage - x.inStage)[0];
  const clientWait = longest && longest.inStage >= 5 ? longest : undefined;

  return {
    status, phase, r, target, hired, offer, loop, replied, waiting, shortlisted, cols, steps,
    moved, newReplies, sessionMoves, sentence, manager, top3, why, rate, band, quotes, answered: responses.length, step,
    found, foundLast, keptWeek, keptLast, days, openToWork, verified, search, sourcingOn, clientWait,
  };
}
type Model = ReturnType<typeof overviewModel>;

/* The side panel ("Hires") and OvCard live in OverviewPanel.tsx. */

/* a number that counts up once when it first appears (eased, ~700ms);
   reduced motion shows the final value at once */
function CountUp({ n }: { n: number }) {
  const [v, setV] = useState(() => (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? n : 0));
  useEffect(() => {
    if (v === n) return;
    let raf = 0; const t0 = performance.now(), from = v;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(from + (n - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className="ov4-num">{v}</span>;
}

/* a faint warm light that follows the pointer along a card's edge */
const spot = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

/* 14 days of sourcing as soft columns: last week muted, this week warm,
   today in the accent; the count shows above the column you point at */
function DailyBars({ data }: { data: readonly number[] }) {
  const max = Math.max(1, ...data);
  const n = data.length;
  return (
    <div className="ov4-days" role="list">
      {n >= 8 && <span className="ov4-wk" style={{ ["--x" as string]: `${((n - 7) / n) * 100}%` }} aria-hidden="true"><em>This week</em></span>}
      {data.map((v, i) => {
        const back = n - 1 - i;
        const d = dateAgo(back);
        return (
          <div key={i} role="listitem" className={`ov4-day${back === 0 ? " is-today" : back < 7 ? " is-week" : ""}`} style={{ ["--k" as string]: v / max, ["--i" as string]: i }} aria-label={`${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}: ${v} found`}>
            <span className="ov4-day-v">{v}</span>
            <span className="ov4-day-c"><i /></span>
            <span className="ov4-day-l">{back === 0 ? "Today" : back % 7 === 0 || i === 0 ? dMMM(back) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

/* the funnel: one soft column per stage of the campaign, in board order, from the people found to hired */
function FunnelBars({ m, stages, people, onStage }: { m: Model; stages: readonly StageDef[]; people: readonly PipelinePerson[]; onStage: (s: string) => void }) {
  // The share each step kept of the one before it is the model's (the server's, a part of its whole).
  const share = (n: number, what: string) => (n > 0 ? `${n}% ${what}` : "");
  const bars = funnelBars(stages, people, m.r.found, m.r);
  /* The step-to-step lines and the hover words sit on the first stage of each kind. */
  const noteOf = (b: FunnelBar) => (!b.first ? "" : b.kind === "shortlisted" ? share(m.step.kept, "kept") : b.kind === "outreach" ? share(m.step.out, "reached") : b.kind === "interviewing" ? share(m.step.int, "moved on") : "");
  const tipOf = (b: FunnelBar): readonly string[] => {
    /* The Overview's own tips speak of kinds ("in interviews"); a campaign with stages of its own hears its stage names instead. */
    const own = b.first && (b.kind === "found" || isDefaultSet(stages)) ? m.cols.find((c) => c.key === (b.kind === "found" ? "found" : b.kind))?.tip : undefined;
    if (b.kind === "hired") return [m.hired.length ? `${m.hired.length} of ${m.target} hired` : "No hires yet"];
    return own ?? [b.n ? `${b.n} ${plural(b.n, "person", "people")} in ${b.label}` : "Nobody here right now"];
  };
  const max = Math.max(1, ...bars.map((b) => b.n));
  const scroller = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scroller, bars.length);
  return (
    <div
      ref={scroller} className={`ov2-funnel${edges.left ? " has-left" : ""}${edges.right ? " has-right" : ""}`} role="list" tabIndex={0}
      aria-label="Funnel, scrolls sideways when there are many stages" style={{ ["--n" as string]: bars.length }}
    >
      {bars.map((b, i) => {
        const h = b.n ? 10 + 90 * Math.sqrt(b.n / max) : 3;
        const note = noteOf(b);
        return (
          <button
            key={b.key} type="button" role="listitem" className={`ov2-bar ${b.kind === "found" ? "is-found" : "is-stage"}`} {...(b.hue ? { "data-sc": b.hue } : {})}
            onClick={() => onStage(b.stageId ?? "shortlisted")}
            style={{ ["--h" as string]: `${h}%`, ["--i" as string]: i }}
            aria-label={`${b.label}: ${b.n}${note ? `, ${note}` : ""}`}
          >
            <span className="ov2-bar-col">
              <span className="ov2-tip" role="tooltip">{tipOf(b).slice(0, 2).map((t, k) => <span key={k}>{t}</span>)}</span>
              <span className="ov2-bar-n">{b.kind === "hired" ? <>{b.n}<span className="ov2-of">/{m.target}</span></> : b.n}</span>
              <i />
            </span>
            {b.hue ? <span className="ov2-bar-l sc" data-sc={b.hue}>{b.label}</span> : <span {...toneProps("muted")} className="ov2-bar-l st">{b.label}</span>}
            <span className="ov2-bar-s">{note || " "}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── activity: everything that happened on this search ──
   One log from what the data knows: stage changes, replies, calls, form
   answers, agent searches and this session's moves. Shown as a day-grouped
   timeline under a 14-day "rhythm" strip; each bar is one day's activity, and
   pointing at a bar lights that day in the log. */

type LogWho = "team" | "candidate" | "agent";
type LogKind = "move" | "reply" | "call" | "form" | "agent" | "hire";
type LogLink = "replies" | "forms" | "calls" | "agent" | "pipeline";
type LogItem = {
  id: string; at: number; who: LogWho; kind: LogKind; actor: string;
  verb: string; person?: { id: string; name: string }; from?: string; to?: string;
  detail?: string; quote?: string; quoteLabel?: string; link?: { label: string; to: LogLink };
};

const hashMin = (s: string) => [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5) % 600;
const briefMins = (w: string) => (/^(\d+)h$/.test(w) ? +w.slice(0, -1) * 60 : /^(\d+)d$/.test(w) ? +w.slice(0, -1) * 1440 : w === "Yesterday" ? 1440 : 7 * 1440);
const STAGE_NAME: Readonly<Record<string, string>> = { shortlisted: "Shortlisted", outreach: "In outreach", interviewing: "Interviewing", hired: "Hired", passed: "Rejected" };

/* Live: the campaign's own activity log, with a way to each person on the board. */
function logFromApi(items: readonly ApiActivity[], people: readonly PipelinePerson[]): LogItem[] {
  const byCandidate = new Map(people.map((p) => [p.candidateId, p.id]));
  return items.flatMap((a): LogItem[] => {
    const line = logLine(a, currentUserId() ?? null, (id) => byCandidate.get(id));
    return line ? [{ ...line, ...(line.person ? { link: { label: "Pipeline", to: "pipeline" } } : {}) }] : [];
  });
}

function logFor(people: readonly PipelinePerson[], moves: readonly Move[], calls: readonly Call[], responses: readonly FormResponse[], briefs: readonly Brief[]): LogItem[] {
  const out: LogItem[] = [];
  const now = Date.now();
  const you = (n: string) => (n === ME ? "You" : n);
  for (const mv of moves) {
    out.push({ id: mv.id, at: Math.max(0, Math.round((now - mv.at) / 60000)), who: "team", kind: mv.to === "hired" ? "hire" : "move", actor: "You",
      verb: "moved", person: mv.person, from: STAGE_NAME[mv.person.stage], to: STAGE_NAME[mv.to], link: { label: "Pipeline", to: "pipeline" } });
  }
  for (const p of people) {
    const at = p.inStage * 1440 + hashMin(p.id);
    if (p.stage === "hired") out.push({ id: p.id, at, who: "candidate", kind: "hire", actor: p.name, verb: "accepted the offer", detail: `${p.title} at ${p.company}`, link: { label: "Pipeline", to: "pipeline" } });
    else if (p.step === "offer") out.push({ id: p.id, at, who: "team", kind: "move", actor: you(p.owner), verb: "sent an offer to", person: p, to: "Offer out", link: { label: "Pipeline", to: "pipeline" } });
    else if (p.stage === "interviewing") out.push({ id: p.id, at, who: "team", kind: "move", actor: you(p.owner), verb: "moved", person: p, from: "In outreach", to: "Interviewing", detail: p.last });
    else if (p.step === "replied") out.push({ id: p.id, at, who: "candidate", kind: "reply", actor: p.name, verb: "replied to your outreach", quote: quoteOf(p.last), link: { label: "Open reply", to: "replies" } });
    else if (p.step === "waiting") out.push({ id: p.id, at, who: "team", kind: "move", actor: you(p.owner), verb: "reached out to", person: p, detail: p.last });
    else if (p.stage === "shortlisted" && p.source === "Agent search") out.push({ id: p.id, at, who: "agent", kind: "agent", actor: "Agent", verb: "shortlisted", person: p, to: "Shortlisted", detail: `${p.title} at ${p.company}` });
  }
  for (const c of calls) out.push({ id: c.id, at: c.at, who: "team", kind: "call", actor: you(c.by), verb: "called", person: c.person, detail: c.outcome === "connected" ? `Talked for ${durationLabel(c.duration)}` : OUTCOME_LABEL[c.outcome], quote: c.note, link: { label: "Calls", to: "calls" } });
  for (const r of responses) out.push({ id: r.id, at: r.at, who: "candidate", kind: "form", actor: r.person.name, verb: "answered the screening form", detail: `Took ${durationLabel(r.took)}${r.flagged ? ", said no to a must-have" : ""}`, link: { label: "View answers", to: "forms" } });
  for (const b of briefs) out.push({ id: b.id, at: briefMins(b.when), who: "agent", kind: "agent", actor: "Agent", verb: b.mode === "sourcing" ? "ran a search" : "worked a brief", quote: b.title, link: { label: "Run again", to: "agent" } });
  return out.sort((a, b) => a.at - b.at);
}

/* all times in India Standard Time */
const IST = "Asia/Kolkata";
const istTime = (min: number) => new Date(Date.now() - min * 60000).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
const istDay = (min: number) => new Date(Date.now() - min * 60000).toLocaleDateString("en-CA", { timeZone: IST });
const istDayLabel = (key: string) => {
  const today = istDay(0), yday = istDay(1440);
  if (key === today) return "Today";
  if (key === yday) return "Yesterday";
  return new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
};
const SHOW = 5;

function ActivityLog({ items, onPerson, onLink }: { items: readonly LogItem[]; onPerson: (id: string) => void; onLink: (to: LogLink, item: LogItem) => void }) {
  const [who, setWho] = useState<LogWho | "all">("all");
  const [day, setDay] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(new Set());
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const list = who === "all" ? items : items.filter((a) => a.who === who);
  const days14 = Array.from({ length: 14 }, (_, i) => istDay((13 - i) * 1440));
  const per = days14.map((d) => list.filter((a) => istDay(a.at) === d).length);
  const peak = Math.max(1, ...per);
  const groups = new Map<string, LogItem[]>();
  for (const a of list.slice(0, 80)) { const d = istDay(a.at); groups.set(d, [...(groups.get(d) ?? []), a]); }
  const tabs: { id: LogWho | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "team", label: "Team" }, { id: "candidate", label: "Candidates" }, { id: "agent", label: "Agent" }];
  const toggle = (set: ReadonlySet<string>, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  return (
    <div className="ov3-act">
      <div className="ov3-bar">
        <div className="ov3-tabs" role="tablist" aria-label="Filter activity">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={who === t.id} className={who === t.id ? "is-on" : ""} onClick={() => setWho(t.id)}>
              {t.label}<span>{t.id === "all" ? items.length : items.filter((a) => a.who === t.id).length}</span>
            </button>
          ))}
        </div>
        <div className="ov3-rhythm" role="group" aria-label="Activity per day, last 14 days (IST)" onMouseLeave={() => setDay(null)}>
          {per.map((n, i) => (
            <button
              key={days14[i]} type="button" className={`${i === 13 ? "is-today" : ""}${day === days14[i] ? " is-on" : ""}`}
              style={{ ["--k" as string]: n / peak, ["--i" as string]: i }} onMouseEnter={() => setDay(days14[i]!)} onFocus={() => setDay(days14[i]!)}
              title={`${istDayLabel(days14[i]!)}: ${n} ${plural(n, "event")}`} aria-label={`${istDayLabel(days14[i]!)}: ${n} ${plural(n, "event")}`}
            ><i /></button>
          ))}
        </div>
      </div>

      <div className="ov3-log" key={who}>
        {[...groups.entries()].map(([d, evs]) => {
          const all = openDays.has(d);
          const shown = all ? evs : evs.slice(0, SHOW);
          return (
            <section key={d} className={`ov3-day${day === null ? "" : day === d ? " is-lit" : " is-dim"}`}>
              <h3><span>{istDayLabel(d)}</span><i aria-hidden="true" /></h3>
              <ol>
                {shown.map((a) => {
                  const open = openIds.has(a.id);
                  return (
                    <li key={a.id} className={`is-${a.kind}${a.at < 60 ? " is-new" : ""}`}>
                      <span className="ov3-av" aria-hidden="true">{a.actor === "Agent" ? <Sparkle size={11} weight="fill" /> : a.actor[0]}</span>
                      <div className="ov3-ev">
                        <p className="ov3-line">
                          <b>{a.actor}</b> {a.verb}
                          {a.person && <> <button type="button" className="ov3-who" onClick={() => onPerson(a.person!.id)}>{a.person.name}</button></>}
                          {a.from && <> from <span className="ov3-chip">{a.from}</span></>}
                          {a.to && a.from && <> to <span className={`ov3-chip is-to is-${a.kind}`}>{a.to}</span></>}
                          {a.detail && <span className="ov3-detail">. {a.detail}</span>}
                          {a.quote && <button type="button" className="ov3-more" onClick={() => setOpenIds((s) => toggle(s, a.id))} aria-expanded={open}>{open ? "Hide" : a.quoteLabel ?? (a.kind === "agent" ? "Brief" : "Message")}<CaretDown size={10} weight="bold" /></button>}
                          {a.link && <button type="button" className="ov3-link" onClick={() => onLink(a.link!.to, a)}>{a.link.label}<ArrowRight size={10} weight="bold" /></button>}
                        </p>
                        {a.quote && open && <blockquote className="ov3-quote">{a.kind === "reply" || a.quoteLabel ? `“${a.quote}”` : a.quote}</blockquote>}
                      </div>
                      <time className="ov3-time">{istTime(a.at)}</time>
                    </li>
                  );
                })}
              </ol>
              {evs.length > SHOW && (
                <button type="button" className="ov3-fold" onClick={() => setOpenDays((s) => toggle(s, d))} aria-expanded={all}>
                  <CaretDown size={10} weight="bold" style={{ transform: all ? "rotate(180deg)" : undefined }} />
                  {all ? "Show less" : `${evs.length - SHOW} more ${plural(evs.length - SHOW, "activity", "activities")}`}
                </button>
              )}
            </section>
          );
        })}
        {!groups.size && <p className="ov2-empty">Nothing yet. Activity shows up as people move.</p>}
      </div>
    </div>
  );
}



export function CampaignOverview({ ctx }: { ctx: Ctx }) {
  const baseRow = useRowFor(ctx.campaignId);
  const session = useSession();
  const admin = can(standingOf(session), "campaign.manage");
  /* Who is on a campaign and who sees it are about a team, which Personal does not have. */
  const teamwork = can(standingOf(session), "campaign.assign");
  const [assignOpen, setAssignOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const livePeople = usePipeline(ctx.campaignId);
  const liveMoves = useMoves(ctx.campaignId);
  const ov = useCampaignOverview(ctx.campaignId);
  const ovFailed = useOverviewFailed(ctx.campaignId);
  const feed = useCampaignActivity(ctx.campaignId);
  const peopleReady = usePipelineReady(ctx.campaignId);
  const preview = useMemo(() => (LIVE ? null : previewFor(baseRow, livePeople)), [baseRow]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = preview?.row ?? baseRow;
  const people = preview?.people ?? livePeople;
  /* Forms, calls and briefs are still fixtures; live, the overview leaves them out rather than mix them in. */
  const fixture = LIVE || (!!preview && !preview.live);
  const moves = preview ? [] : liveMoves;
  const forms = formsFor(ctx.campaignId);
  /* Live, the screening form's own answers: "Screening" and "flagged screening answers" read them. */
  const liveForms = useForms(LIVE ? resolveCampaignId(ctx.campaignId) : "");
  const screening = LIVE ? (liveForms.find((f) => f.status === "live") ?? liveForms[0]) : undefined;
  const liveAnswers = useResponses(screening?.id ?? "", LIVE && !!screening);
  const responses = useMemo(
    () => (LIVE ? liveAnswers.list : forms[0] && !fixture ? responsesFor(forms[0]) : []),
    [forms, fixture, liveAnswers.list],
  );
  /* Live, the calls are the campaign's own: "Call X back" and "Calls you made" read them. */
  const liveCalls = useCampaignCalls(resolveCampaignId(ctx.campaignId), LIVE, session.name);
  const calls = useMemo(() => (LIVE ? liveCalls : fixture ? [] : callsFor(ctx.campaignId)), [ctx.campaignId, fixture, liveCalls]);
  const briefs = useMemo(() => (LIVE ? [] : BRIEFS.filter((b) => b.campaign === row?.name)), [row?.name]);
  const { clients, clientOf } = useClients();
  const client = clients.find((c) => c.id === clientOf[ctx.campaignId]);
  const [clientOpen, setClientOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const hasOlder = useActivityHasOlder(ctx.campaignId);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const polled = useCampaignAgents(ctx.campaignId);
  /* Closed or reopened here is shown at once; the panel reads the rest on its own beat. */
  const agents = polled && row ? { ...polled, status: row.status } : polled;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();
  const warm = useWarmup();
  const ready = LIVE ? !!ov && !!feed && peopleReady : warm;

  const stages = useCampaignStages(ctx.campaignId);
  const m = overviewModel({ row, people, moves, client, briefs, responses, ...(ov ? { api: ov } : {}) });
  const name = plainText(row?.name) || "this campaign";
  /* The server lets an admin or the campaign's owner change its client; the menu says the same. */
  const canClient = (admin || (LIVE ? isMe(row?.ownerId) : row?.owner === session.name)) && mayChangeCampaign(session, row);
  /* The brief, the role spec and the search are the people on the campaign's; anyone else follows it. */
  const mayChange = mayChangeCampaign(session, row);
  /* Closing and reopening are the owner's or an admin's, the server's own rule. */
  const mayClose = mayCloseCampaign(session, row);
  /* Giving a campaign to recruiters is the same: an admin whose team does not have it is not offered it. */
  const mayAssign = teamwork && mayChange;
  /* Said once the server has answered; a refusal shows its own message and puts the status back. */
  const setStatus = (to: "active" | "closed", said: string, undo?: () => void, closeForms = false) => {
    void setCampaignStatus(ctx.campaignId, to, { closeForms }).then((ok) => { if (ok) toast(said, "done", undo ? { label: "Undo", onClick: undo } : undefined); });
  };
  /* Reopening asks first, like closing; once done it says what happened and offers the way out (Undo closes it again). */
  const reopen = () => setStatus("active", `${name} is active again`, () => setStatus("closed", `${name} closed`));
  const move = useCallback((p: PipelinePerson, to: MoveTo) => {
    const stages = stagesNow(ctx.campaignId);
    if (!wouldChange(p, to, stages) || preview) return;
    movePerson(ctx.campaignId, p.id, to);
    const into = isStageMove(to) ? stageNamed(stages, to.stageId)?.kind : to;
    if (!(into === "hired" && LIVE)) toast(moveLine(firstName(p.name), to, stages));
  }, [ctx.campaignId, toast, preview]);
  const open = openId ? people.find((p) => p.id === openId) ?? null : null;

  /* What the agents panel offers. A search is asked for like the button elsewhere does; the panel then reads again. */
  const onAgentAction = (id: "find" | "spec" | "stop" | "resume" | "review") => {
    const real = resolveCampaignId(ctx.campaignId);
    if (id === "spec") { setSpecOpen(true); return; }
    if (id === "review") { openOutreach(ctx.go); return; }
    if (!LIVE) { ctx.onAgent(id === "find" ? `Find people for ${name}` : `Stop the search for ${name}`, { send: true }); return; }
    const watch = agents?.sourcing.watch;
    const done = id === "find"
      ? agentApi.findMore(real).then(() => toast("Searching now"))
      : id === "resume"
        ? watch ? controlAgent(watch.id, "resume").then(() => toast("Keeping watch again")) : Promise.resolve()
        : watch ? controlAgent(watch.id, "stop").then(() => toast("Stopped keeping watch")) : Promise.resolve();
    void done.then(() => refreshCampaignAgents(real), (err: unknown) => toast(messageOf(err)));
  };

  const day = agoDays(row?.createdAgo ?? "Just now") + 1;
  /* Under the campaign's name: the role it hires for (when the spec names it in other words) and the company it is for. */
  const roleName = row?.roleTitle && row.roleTitle.trim().toLowerCase() !== plainText(row.name).trim().toLowerCase() ? plainText(row.roleTitle) : "";
  const meta = (
    <span className="ov3-meta">
      {roleName && <span className="ov3-meta-i" title="The role this campaign is hiring for"><Briefcase size={13} aria-hidden="true" />{roleName}</span>}
      {client ? (
        <span className="ov2-client">
          {canClient
            ? <button type="button" className="ov3-meta-i is-link" onClick={() => setClientOpen(true)} aria-describedby="ov2-client-card"><Buildings size={13} aria-hidden="true" />{client.name}</button>
            : <span className="ov3-meta-i" tabIndex={0} aria-describedby="ov2-client-card"><Buildings size={13} aria-hidden="true" />{client.name}</span>}
          <span id="ov2-client-card" role="tooltip" className="ov2-client-card">
            <b>{client.name}</b>
            {client.manager && <small>{client.manager}, hiring manager</small>}
            {client.notes && <em>{client.notes}</em>}
            <span className="ov2-client-a">
              {client.email && <a href={`mailto:${client.email}`}><EnvelopeSimple size={12} aria-hidden="true" /> Email</a>}
              {client.phone && <a href={`tel:${client.phone.replace(/\s+/g, "")}`}><Phone size={12} aria-hidden="true" /> Call</a>}
              {admin && <a href={`#/clients/${client.id}`}><Buildings size={12} aria-hidden="true" /> Open client</a>}
            </span>
          </span>
        </span>
      ) : canClient ? <button type="button" className="ov3-meta-i is-link" onClick={() => setClientOpen(true)}><Plus size={12} weight="bold" aria-hidden="true" />Add the client</button> : null}
      {row?.department && <span className="ov3-meta-i"><Briefcase size={13} aria-hidden="true" />{row.department}</span>}
      {row?.location && <span className="ov3-meta-i"><MapPin size={13} aria-hidden="true" />{row.location}</span>}
      <span className={`ov3-meta-i ov3-run is-${m.phase}`}><CalendarBlank size={13} aria-hidden="true" />{m.phase === "active" ? `Active, day ${day}` : `Closed after ${day} ${day === 1 ? "day" : "days"}`}</span>
    </span>
  );
  const log = useMemo(() => (feed ? logFromApi(feed, people) : logFor(people, moves, calls, responses, briefs)), [feed, people, moves, calls, responses, briefs]);

  /* good news only: a change pill appears when the number went up */
  const upBy = (now: number, was: number) => (now > was ? `+${now - was}` : undefined);
  const trend = row?.trend ?? [];

  return (
    <div className="cw is-wide ov2">
      <CampaignHeader ctx={ctx} meta={meta}>
        {LIVE && <button type="button" className="cw-btn" onClick={() => setSpecOpen(true)}><ListChecks size={14} /> Role spec</button>}
        {LIVE && mayChange && <SheetButton campaignId={resolveCampaignId(ctx.campaignId)} name={name} />}
        {/* The one control for whether the campaign is on. */}
        {mayClose && (m.phase === "closed"
          ? <button type="button" className="cw-btn" onClick={() => setReopening(true)}>Reopen campaign</button>
          : <button type="button" className="cw-btn" onClick={() => setClosing(true)}>Close campaign</button>)}
        <button type="button" className="cw-btn is-primary" onClick={() => ctx.onAgent(`For ${name}: `)}>
          <Sparkle size={14} weight="fill" /> Ask the agent
        </button>
        <button ref={menuRef} type="button" className="cw-icon-btn" onClick={() => setMenu((x) => !x)} aria-label="Campaign options" aria-expanded={menu} title="Campaign options">
          <DotsThree size={18} weight="bold" />
        </button>
        <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={230}>
          <div className="ct-menu" role="menu">
            {LIVE && mayChange && <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setMenu(false); setEditOpen(true); }}><NotePencil size={15} /> Edit details</button>}
            {mayChange && <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setMenu(false); ctx.onAgent(`Edit the brief for ${name}: `); }}><NotePencil size={15} /> Edit brief</button>}
            {canClient && <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setMenu(false); setClientOpen(true); }}><Buildings size={15} /> {client ? "Change client" : "Add client"}</button>}
            <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setMenu(false); ctx.go("campaign-forms"); }}><ClipboardText size={15} /> Screening forms</button>
            {/* Admin only, and absent (not disabled) for a recruiter. */}
            {mayAssign && <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setMenu(false); setAssignOpen(true); }}><UsersThree size={15} /> Assign recruiters</button>}
            <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setMenu(false); ctx.go("campaigns"); }}><FolderOpen size={15} /> All campaigns</button>
          </div>
        </Popover>
      </CampaignHeader>
      <ClientDialog open={clientOpen} onClose={() => setClientOpen(false)} campaignId={ctx.campaignId} current={client} clients={clients} />
      {LIVE && (
        <CampaignEditDialog
          open={editOpen} onClose={() => setEditOpen(false)} campaignId={resolveCampaignId(ctx.campaignId)}
          canShare={teamwork || (isMe(row?.ownerId) && standingOf(session) !== "personal")} canReassign={teamwork}
          onSaved={(n) => toast(`${n} saved`)}
        />
      )}
      {/* A dialog, not a section: the overview is laid out to fit one screen. */}
      {LIVE && (
        <Dialog open={specOpen} onClose={() => setSpecOpen(false)} label="Role spec" size="md">
          <div className="ov2-spec"><RoleSpecPanel campaignId={resolveCampaignId(ctx.campaignId)} onClose={() => setSpecOpen(false)} /></div>
        </Dialog>
      )}
      {mayAssign && <AssignDialog row={baseRow} open={assignOpen} onClose={() => setAssignOpen(false)} />}
      <CloseDialog
        open={closing}
        body={<><b>{name}</b> stops here: {m.hired.length} of {m.target} hired. Sourcing and outreach stop, and everyone in the pipeline stays on record. You can reopen it any time.</>}
        onClose={() => setClosing(false)}
        onConfirm={(forms) => { setClosing(false); setStatus("closed", `${name} closed`, undefined, forms); }}
      />
      <ReopenDialog open={reopening} name={name} onClose={() => setReopening(false)} onConfirm={() => { setReopening(false); reopen(); }} />


      {ovFailed ? (
        <LoadFailed what="This overview" onRetry={() => retryOverview(ctx.campaignId)} />
      ) : !ready ? <OverviewGhost admin={session.role === "admin"} /> : (
        <div className="ov4">
          {m.phase === "closed"
            ? <ClosedPanel />
            : SHOW_AGENTS_PANEL ? <AgentsPanel agents={agents} onAction={onAgentAction} canChange={mayChange} /> : null}
          <section className="ov4-sec" aria-label="Overview" onPointerMove={spot}>
            <header className="ov4-sh">
              <div>
                <h2>Overview</h2>
              </div>
              <span className="ov2-aside">Last 14 days</span>
            </header>
            {/* What is booked and scheduled for this campaign, only when there is something: nothing is reserved for it. */}
            {LIVE && <CampaignComing campaignId={resolveCampaignId(ctx.campaignId)} />}
            <dl className="ov4-stats">
              {/* This week's movement only. Totals, the reply rate and hires are in the funnel
                  below, and a week that is the whole campaign so far says nothing new. */}
              {m.found !== m.r.found && <div data-tip={`Last week: ${m.foundLast}`}><dt>Found this week</dt><dd><CountUp n={m.found} />{upBy(m.found, m.foundLast) && <em>{upBy(m.found, m.foundLast)}</em>}</dd></div>}
              {m.keptWeek != null && m.keptWeek !== m.r.shortlisted && <div data-tip={`Last week: ${m.keptLast ?? 0}`}><dt>Kept this week</dt><dd><CountUp n={m.keptWeek} />{upBy(m.keptWeek, m.keptLast ?? 0) && <em>{upBy(m.keptWeek, m.keptLast ?? 0)}</em>}</dd></div>}
            </dl>
            <div className="ov4-panels">
              <div className="ov4-panel">
                <h3>Funnel</h3>
                <FunnelBars m={m} stages={stages} people={people} onStage={(st) => openStage(st, ctx.go)} />
              </div>
              <div className="ov4-panel">
                <h3>Sourced per day</h3>
                <DailyBars data={trend.slice(-14)} />
              </div>
            </div>
          </section>

          <div className="ov4-low">
            {/* Left: the campaign's hires (an admin) or the recruiter's own part of it, and what is still to do under it. */}
            <div className="ov4-left">
              {session.role === "admin" ? (
                <HiresCard
                  m={m} people={people} responses={responses} calls={calls}
                  onPerson={(id) => setOpenId(id)} onStage={(st) => openStage(st, ctx.go)} onForms={() => ctx.go("campaign-forms")} onCalls={() => ctx.go("campaign-calls")}
                  onPool={() => openStage("outreach", ctx.go)}
                />
              ) : (
                <YourWorkCard
                  name={session.name} people={people} calls={calls} moves={moves}
                  onStage={(st) => openStage(st, ctx.go)} onCalls={() => ctx.go("campaign-calls")} onPerson={(id) => setOpenId(id)}
                />
              )}
              <TasksCard campaignId={ctx.campaignId} onlyMine={!mayChange} />
            </div>
            <OvCard title="Activity" aside={<span className="ov2-aside">Times in IST</span>} className="ov4-act">
              <ActivityLog
                items={log} onPerson={(id) => setOpenId(id)}
                onLink={(to, it) => (to === "replies" ? openStage("outreach", ctx.go) : to === "forms" ? ctx.go("campaign-forms") : to === "calls" ? ctx.go("campaign-calls") : to === "agent" ? ctx.onAgent(it.quote) : ctx.go("campaign-candidates"))}
              />
              {LIVE && hasOlder && (
                <button type="button" className="ov3-fold" disabled={loadingOlder} onClick={() => {
                  setLoadingOlder(true);
                  loadOlderActivity(ctx.campaignId).then(() => setLoadingOlder(false), () => { setLoadingOlder(false); toast("Older activity didn't load. Try again."); });
                }}>
                  {loadingOlder ? "Loading older activity…" : "Show older"}
                </button>
              )}
            </OvCard>
          </div>
        </div>
      )}
      <PersonDialog person={open} onClose={() => setOpenId(null)} onMove={move} campaignId={resolveCampaignId(ctx.campaignId)} locked={!mayChange} />
    </div>
  );
}

/**
 * The Overview while it loads, in the real cards' own classes: the section with its heading and the week's figures,
 * the funnel and the days beside each other as columns, then the hires (or the person's own work) and tasks over the
 * activity log. A card's name and a column's label are real words; only the numbers and rows shimmer.
 */
function OverviewGhost({ admin }: { admin: boolean }): JSX.Element {
  const funnel = [100, 74, 52, 34, 18];
  const days = [30, 52, 40, 66, 48, 22, 18, 58, 72, 44, 60, 36, 80, 54];
  return (
    <ShimmerRegion label="Loading the campaign" className="ov4">
      <section className="ov4-sec" aria-hidden="true">
        <header className="ov4-sh">
          <div><h2>Overview</h2></div>
          <span className="ov2-aside">Last 14 days</span>
        </header>
        <dl className="ov4-stats">
          {[0, 1].map((i) => (
            <div key={i}><dt><Shimmer h={11} lh={20} w={96 - i * 14} /></dt><dd><Shimmer h={24} lh={32} w={46} r={8} /></dd></div>
          ))}
        </dl>
        <div className="ov4-panels">
          <div className="ov4-panel">
            <h3>Funnel</h3>
            <div className="ov2-funnel" style={{ "--n": funnel.length } as React.CSSProperties}>
              {funnel.map((h, i) => (
                <div key={i} className="ov2-bar">
                  <span className="ov2-bar-col"><Shimmer h={`${h}%`} r="9px 9px 4px 4px" /></span>
                  <Shimmer h={12} lh={16} w="70%" />
                  <Shimmer h={10} lh={16} w="46%" />
                </div>
              ))}
            </div>
          </div>
          <div className="ov4-panel">
            <h3>Sourced per day</h3>
            <div className="ov4-days">
              {days.map((h, i) => (
                <div key={i} className="ov4-day">
                  <span className="ov4-day-c"><Shimmer h={`${h}%`} r="5px 5px 3px 3px" /></span>
                  <span className="ov4-day-l" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="ov4-low" aria-hidden="true">
        <div className="ov4-left">
          <OvCard title={admin ? "Hires" : "Your work on this campaign"} className="hp">
            <div className="hp-body">
              <section className="pb hp-hires">
                <Shimmer h={10} r={5} style={{ margin: "4px 0 10px" }} />
                <p className="hp-cap"><Shimmer h={11} lh={20} w="52%" /></p>
                <ul>
                  {[0, 1, 2].map((i) => (
                    <li key={i}>
                      <div className="pr">
                        <span className="pr-lead"><Shimmer circle w={28} h={28} /></span>
                        <span className="pr-t"><Shimmer h={13} lh={20} w={`${58 - i * 8}%`} /><Shimmer h={11} lh={20} w={`${40 + i * 6}%`} /></span>
                        <Shimmer h={12} w={40} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </OvCard>
          <OvCard title="Tasks" className="tp">
            <div className="tp-body">
              <TasksGhost />
            </div>
          </OvCard>
        </div>
        <OvCard title="Activity" aside={<span className="ov2-aside">Times in IST</span>} className="ov4-act">
          <div className="ov3-act">
            <div className="ov3-bar">
              <div className="ov3-tabs">
                {["All", "Team", "Candidates", "Agent"].map((t, i) => (
                  <button key={t} type="button" disabled tabIndex={-1} className={i === 0 ? "is-on" : ""}>{t}<span><Shimmer h={10} w={12} /></span></button>
                ))}
              </div>
              <div className="ov3-rhythm">
                {days.map((h, i) => <span key={i} className="shm-col"><Shimmer h={`${h}%`} r={2} /></span>)}
              </div>
            </div>
            <div className="ov3-log">
              {[3, 2].map((n, d) => (
                <section key={d} className="ov3-day">
                  <h3><Shimmer h={11} w={64} /><i /></h3>
                  <ol>
                    {Array.from({ length: n }, (_, i) => (
                      <li key={i}>
                        <Shimmer circle w={24} h={24} />
                        <div className="ov3-ev"><p className="ov3-line"><Shimmer h={13} lh={20} w={`${56 + ((i * 17 + d * 9) % 34)}%`} /></p></div>
                        <Shimmer h={11} lh={20} w={44} />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </OvCard>
      </div>
    </ShimmerRegion>
  );
}

/* ── client: who this campaign hires for ── */

function ClientDialog({ open, onClose, campaignId, current, clients }: { open: boolean; onClose: () => void; campaignId: string; current?: Client; clients: readonly Client[] }) {
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [q, setQ] = useState("");
  const toast = useToast();
  /* A client is added by an admin; the owner of a campaign who is a recruiter picks from the ones they can see. */
  const mayAdd = useCan("client.manage");
  useEffect(() => { if (open) { setMode(clients.length || !mayAdd ? "pick" : "new"); setQ(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Said once the server has answered: a refusal puts the client back and says why. */
  const pick = (c: Client) => { void setCampaignClient(campaignId, c.id).then((ok) => { if (ok) toast(`${c.name} is now the client`); }); onClose(); };
  /* Active first, then prospects, then inactive; the current one leads. */
  const order = { active: 0, prospect: 1, inactive: 2 } as const;
  const needle = q.trim().toLowerCase();
  const list = [...clients]
    .filter((c) => !needle || `${c.name} ${c.industry ?? ""} ${c.location ?? ""} ${c.manager}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.id === current?.id ? -1 : b.id === current?.id ? 1 : order[a.status ?? "active"] - order[b.status ?? "active"] || a.name.localeCompare(b.name)));
  return (
    <Dialog open={open} onClose={onClose} label="Client" size="md">
      {/* Not ".cl": that name is ui.tsx's Collapse, which starts at opacity 0. */}
      <div className="cl-dlg">
        <header className="cl-h">
          <h2>{current ? "Change client" : "Add a client"}</h2>
          <p>The company this campaign is hiring for. Their hiring manager gets updates and shortlists.</p>
        </header>
        <div className="cl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "pick"} className={mode === "pick" ? "is-on" : ""} onClick={() => setMode("pick")} disabled={!clients.length}>Existing client</button>
          {mayAdd && <button type="button" role="tab" aria-selected={mode === "new"} className={mode === "new" ? "is-on" : ""} onClick={() => setMode("new")}><Plus size={12} weight="bold" /> New client</button>}
        </div>
        {mode === "pick" ? (
          <>
            {clients.length > 5 && (
              <label className="sl-search cl-search">
                <MagnifyingGlass size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" autoFocus />
              </label>
            )}
            <ul className="cl-list">
              {list.map((c) => (
                <li key={c.id}>
                  <button type="button" className={c.id === current?.id ? "is-on" : ""} onClick={() => pick(c)}>
                    <ClientLogo client={c} size={36} />
                    <span className="cl-t">
                      <strong>{c.name}{c.status && c.status !== "active" && <span className="cl-st"> {CLIENT_STATUS_LABEL[c.status].toLowerCase()}</span>}</strong>
                      <small>{[c.industry, c.location].filter(Boolean).join(", ") || "No details yet"}{c.manager ? `. ${c.manager}` : ""}</small>
                    </span>
                    {c.id === current?.id ? <span className="cl-cur"><Check size={12} weight="bold" /> Current</span> : <ArrowRight size={14} weight="bold" className="cl-go" />}
                  </button>
                </li>
              ))}
              {!list.length && <li className="cl-none t-body-sm">{clients.length ? <>No client matches “{q.trim()}”.</> : "There are no clients to choose from yet. An admin adds clients."}</li>}
              {current && (
                <li><button type="button" className="cl-remove" onClick={() => { void setCampaignClient(campaignId, null).then((ok) => { if (ok) toast("Client removed"); }); onClose(); }}>Remove client from this campaign</button></li>
              )}
            </ul>
          </>
        ) : (
          <div className="cl-new">
            <ClientForm onCancel={onClose} onSaved={pick} submitLabel="Add and link" />
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ── pipeline ── */

type View = "board" | "table";

const STAGE_IMG: Readonly<Record<BoardStage, string>> = {
  shortlisted: imgShortlisted, outreach: imgOutreach, interviewing: imgInterviewing, hired: imgHired,
};

/* What landing in a stage feels like: a different small moment for each. */
const ARRIVAL: Readonly<Record<string, (first: string) => string>> = {
  /* Moving someone here sends nothing; the words say where they are, not what is happening. */
  outreach: (f) => `${f} moved to outreach`,
  replied: (f) => `${f} has replied`,
  interviewing: (f) => `${f} is interviewing`,
  hired: (f) => `${f} is hired`,
};

/* Where the person left this campaign's board in this tab: the search, the filters and the column looked at alone. A
   link that names a column (the Overview's funnel) starts from that; an owner, source or column that is not on the
   board now is dropped once the board is in. */
type BoardRemembered = { q: string; owner: string | null; source: string | null; stalled: boolean; focus: string | null };
const BOARD_NOTHING: BoardRemembered = { q: "", owner: null, source: null, stalled: false, focus: null };
export function readBoardRemembered(r: Record<string, unknown>): BoardRemembered {
  return {
    q: take.str(r.q, "", 100), owner: take.str(r.owner, "", 120) || null, source: take.str(r.source, "", 120) || null,
    stalled: take.bool(r.stalled), focus: take.str(r.focus, "", 120) || null,
  };
}

export function CampaignCandidates({ ctx }: { ctx: Ctx }) {
  const row = useRowFor(ctx.campaignId);
  const people = usePipeline(ctx.campaignId);
  /* "Interview Tue 3 pm" on each person's card: one read for the campaign, not one per card. */
  const meetingLines = useMeetingLines(resolveCampaignId(ctx.campaignId), LIVE);
  const ready = usePipelineReady(ctx.campaignId);
  const failed = usePipelineFailed(ctx.campaignId);
  const live = people.filter(onBoard);
  /* The campaign's own columns, and how many people are in each (everyone on the board, searched for or not). */
  const stages = useCampaignStages(ctx.campaignId);
  const mayChange = useMayChangeCampaign(ctx.campaignId);
  /* A closed campaign's board is read-only: nothing is dragged, added, moved or sent from it until it is reopened. */
  const closed = row?.status === "closed";
  /* Seeing a campaign is reading it: the board, the table and a person's sheet change only for who may change it (the server's `canManage`). */
  const locked = closed || !mayChange;
  const [stagesOpen, setStagesOpen] = useState(false);
  /* A link that asks for the Stages editor (the agent's "Open Stages" button) opens it once, for who may change the stages. */
  useEffect(() => {
    if (!mayChange) return;
    const open = () => {
      if (!asksForStagesEditor(window.location.hash)) return;
      setStagesOpen(true);
      history.replaceState(null, "", withoutStagesAsk(window.location.hash));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [mayChange]);
  const counts = useMemo(() => {
    const by = groupByStage(people.filter(onBoard), stages);
    return Object.fromEntries([...by].map(([id, list]) => [id, list.length]));
  }, [people, stages]);
  const [view, setView] = useState<View>(() => (localStore("cw-view") as View) ?? "board");
  const section = `board:${resolveCampaignId(ctx.campaignId)}`;
  const [deep] = useState(() => !!pendingStage || hasDeepLink());
  const [start] = useState<BoardRemembered>(() => (deep ? BOARD_NOTHING : loadSection(section, readBoardRemembered, BOARD_NOTHING)));
  const [q, setQ] = useState(start.q);
  const [owner, setOwner] = useState<string | null>(start.owner);
  const [source, setSource] = useState<string | null>(start.source);
  const [onlyStalled, setOnlyStalled] = useState(start.stalled);
  useEffect(() => {
    if (!ready) return;
    if (owner && !live.some((p) => p.owner === owner)) setOwner(null);
    if (source && !live.some((p) => p.source === source)) setSource(null);
  }, [ready, live, owner, source]);
  useSectionSave(section, { q, owner, source, stalled: onlyStalled, focus: null }, ready);
  useScrollMemory(section, ready, !deep);
  useEffect(() => { pendingStage = null; }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const [passedOpen, setPassedOpen] = useState(false);
  const [firstHire, setFirstHire] = useState<PipelinePerson | null>(null);
  const toast = useToast();

  /* Someone really was hired here (the server said yes): the card celebrates, once, and the first hire is a milestone. */
  useEffect(() => onHiredLanded(({ campaignId, ccId }) => {
    const cid = resolveCampaignId(ctx.campaignId);
    if (campaignId !== cid) return;
    const now = pipelineNow(ctx.campaignId);
    const hired = now.find((x) => x.id === ccId);
    if (!hired) return;
    setBurst(ccId);
    window.setTimeout(() => setBurst(null), 1400);
    /* The person's sheet hands over first: the dialog would otherwise open behind its scrim, out of reach. */
    /* The first hire is the organisation's: with a hire anywhere before, it is a quiet line (the toast), not a celebration. */
    if (!now.some((q) => q.stage === "hired" && q.id !== ccId) && !orgHasEarlierHire(cid) && !firstHireSeen(cid)) { rememberFirstHire(cid); setOpenId(null); setFirstHire(hired); }
  }), [ctx.campaignId]);

  useEffect(() => { try { localStorage.setItem("cw-view", view); } catch { /* per-viewer convenience only */ } }, [view]);

  const shown = useMemo(() => live.filter((p) => {
    if (owner && p.owner !== owner) return false;
    if (source && p.source !== source) return false;
    if (onlyStalled && !(p.inStage >= STALL_DAYS && p.stage !== "hired")) return false;
    if (q.trim()) {
      const hay = `${p.name} ${p.title} ${p.company} ${p.skills.join(" ")}`.toLowerCase();
      if (!q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }), [live, owner, source, onlyStalled, q]);

  /* Passing asks why first (optional); every other move happens at once. */
  const [passing, setPassing] = useState<PipelinePerson | null>(null);
  const move = useCallback((p: PipelinePerson, to: MoveTo, reason?: string, asked = false) => {
    const all = stagesNow(ctx.campaignId);
    if (!wouldChange(p, to, all)) return 0;
    const target = isStageMove(to) ? stageNamed(all, to.stageId) : undefined;
    const kind: StatusId = target ? target.kind : (to as StatusId);
    if (kind === "passed" && LIVE && !asked) {
      setPassing(p);
      return 0;
    }
    /* Into Hired the server decides (it may ask first): nothing is celebrated here, the store tells us when it is true. */
    if (kind === "hired" && LIVE) { movePerson(ctx.campaignId, p.id, to, reason); return 0; }
    const firstEver = isFirstHire(people, p, kind);
    movePerson(ctx.campaignId, p.id, to, reason);
    const first = p.name.split(" ")[0]!;
    /* Into one of the campaign's own stages the line uses its name; by status it uses the console's words. */
    const say = target ? (f: string) => `${f} moved to ${target.name}` : ARRIVAL[kind];
    if (kind !== "hired") toast(kind === "passed" ? `Rejected ${first}. You can bring them back any time.` : say ? say(first) : `${first} moved to ${STATUSES.find((s) => s.id === kind)?.label}`);
    if (kind === "hired") {
      setBurst(p.id);
      window.setTimeout(() => setBurst(null), 1400);
      /* The campaign's first hire is a milestone, said once in a dialog (once per campaign, even if
         they are moved back and hired again); every later one is a toast. */
      const cid = resolveCampaignId(ctx.campaignId);
      if (firstEver && !orgHasEarlierHire(cid) && !firstHireSeen(cid)) { rememberFirstHire(cid); setOpenId(null); setFirstHire(p); } else toast(`${first} is hired`);
    }
    return 0;
  }, [ctx.campaignId, toast, people]);

  const offer = useCallback((p: PipelinePerson) => {
    const first = p.name.split(" ")[0]!;
    const next = p.step === "offer" ? "loop" : "offer";
    setStep(resolveCampaignId(ctx.campaignId), p.id, next).then(
      () => {
        retryPipeline(ctx.campaignId);
        toast(next === "offer" ? `Offer out to ${first}.` : `Offer for ${first} withdrawn.`);
      },
      () => toast(`That didn't save for ${first}. Try again.`),
    );
  }, [ctx.campaignId, toast]);

  const owners = [...new Set(live.map((p) => p.owner))];
  const sources = [...new Set(live.map((p) => p.source))];
  const open = openId ? people.find((p) => p.id === openId) ?? null : null;
  const nFilters = [owner, source, onlyStalled || null].filter(Boolean).length;
  const narrowed = !!q.trim() || nFilters > 0;
  const hiredAll = live.filter((p) => p.stage === "hired").length;
  const clearAll = () => { setQ(""); setOwner(null); setSource(null); setOnlyStalled(false); };

  return (
    <div className="cw is-wide pl">
      <CampaignHeader ctx={ctx} title="Pipeline">
        {mayChange && <button type="button" className="cw-btn" onClick={() => setStagesOpen(true)}><Kanban size={14} /> Stages</button>}
        {LIVE && row && <CampaignExport campaignId={resolveCampaignId(ctx.campaignId)} campaignName={row.name} kind="pipeline" />}
      </CampaignHeader>
      {/* Counts from a failed load would read as real zeros; the error below says what happened. */}
      {!failed && <PipelineStats people={people} stages={stages} hires={hiresOf(row, people)} onPassed={() => setPassedOpen(true)} />}
      {!failed && ready && <FilledBar campaignId={ctx.campaignId} people={people} />}
      {!failed && ready && <ClosedBar campaignId={ctx.campaignId} />}

      <div className="pl-bar">
        <div className="cw-seg" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-on" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board"><Columns size={15} /></button>
          <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-on" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table"><Rows size={15} /></button>
        </div>
        <label className="pl-search">
          <MagnifyingGlass size={14} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search the pipeline" spellCheck={false} />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X size={11} weight="bold" /></button>}
        </label>
        <FilterMenu
          count={nFilters}
          owners={owners} owner={owner} onOwner={setOwner}
          sources={sources} source={source} onSource={setSource}
          stalled={onlyStalled} onStalled={setOnlyStalled}
          onClear={() => { setOwner(null); setSource(null); setOnlyStalled(false); }}
        />
      </div>
      {!failed && ready && <ClientBar campaignId={ctx.campaignId} stages={stages} people={live} mayChange={mayChange && !closed} />}

      {!ready ? (view === "board" ? <BoardGhost stages={stages} /> : <TableGhost />) : failed ? (
        <LoadFailed what="This pipeline" onRetry={() => retryPipeline(ctx.campaignId)} />
      ) : live.length === 0 ? (
        <PipelineEmpty campaignId={resolveCampaignId(ctx.campaignId)} name={row?.name ?? "this campaign"} onAgent={ctx.onAgent} />
      ) : !shown.length && narrowed ? (
        /* A search or a filter that hides everyone is not an empty pipeline: say so, and the way back. */
        <div className="cw-empty pl-nomatch">
          <EmptyArt name="empty-search" size={160} />
          <h2>{q.trim() ? `No one matches “${plainText(q.trim())}”` : "No one matches these filters"}</h2>
          <p>{hiredAll ? `${hiredAll} ${hiredAll === 1 ? "person is" : "people are"} hired, and ${live.length} on the board in all.` : `${live.length} ${live.length === 1 ? "person is" : "people are"} on the board in all.`}</p>
          <button type="button" className="cw-btn is-primary" onClick={clearAll}>{q.trim() && nFilters ? "Clear search and filters" : q.trim() ? "Clear search" : "Clear filters"}</button>
        </div>
      ) : view === "board" ? (
        <OfferContext.Provider value={LIVE ? offer : null}>
          <MeetingLinesContext.Provider value={meetingLines}>
            <Board readOnly={locked} people={shown} stages={stages} onMove={move} onOpen={setOpenId} burst={burst} onAdd={() => ctx.go("contacts")} narrowed={narrowed} hiredAll={hiredAll} />
          </MeetingLinesContext.Provider>
        </OfferContext.Provider>
      ) : (
        <OfferContext.Provider value={LIVE ? offer : null}>
          <MeetingLinesContext.Provider value={meetingLines}>
            <Table readOnly={locked} people={shown} stages={stages} onOpen={setOpenId} onMove={move} />
          </MeetingLinesContext.Provider>
        </OfferContext.Provider>
      )}


      <PassedDialog open={passedOpen} onClose={() => setPassedOpen(false)} people={people.filter((p) => p.stage === "passed")} onBack={(p) => { const first = workingOf(stages)[0]; move(p, first ? { stageId: first.id } : "shortlisted"); }} />
      <FirstHireDialog person={firstHire} onClose={() => setFirstHire(null)} />
      <PersonDialog person={open} onClose={() => setOpenId(null)} onMove={(p, to) => move(p, to)} campaignId={resolveCampaignId(ctx.campaignId)} locked={locked} />
      {mayChange && (
        <StagesDialog
          open={stagesOpen} onClose={() => setStagesOpen(false)} stages={stages} counts={counts}
          onSave={(rows, moveTo) => saveStages(ctx.campaignId, rows, moveTo).then((ok) => { if (ok) toast("Stages saved"); return ok; })}
        />
      )}
      <PassReasonDialog
        who={passing ? passing.name.split(" ")[0]! : null}
        note={<LooseEndsNote on={!!passing} campaignId={ctx.campaignId} ccIds={passing ? [passing.id] : []} to="passed" />}
        onClose={() => setPassing(null)}
        onPass={(reason) => { const p = passing; setPassing(null); if (p) move(p, "passed", reason, true); }}
      />
    </div>
  );
}

/* The strip over the board: one slim bar, a segment per stage, and one quiet line. */
function PipelineStats({ people, stages, hires, onPassed }: { people: readonly PipelinePerson[]; stages: readonly StageDef[]; hires: { count: number; target: number | null }; onPassed: () => void }) {
  /* A slim bar, one segment per stage in its colour, and one quiet line. A stage's name and count show on hover or focus. */
  const { segments, inPipeline, passed, line } = pipelineStrip(stages, people, hires);
  return (
    <section className="pl-journey" aria-label="Pipeline at a glance">
      <div className={`pl-jtrack${inPipeline === 0 ? " is-empty" : ""}`} role="list">
        {segments.map((g, i) => (
          <span
            key={g.id} role="listitem" tabIndex={0} data-sc={g.hue} className={`pl-jseg${g.n === 0 ? " is-none" : ""}`}
            style={{ flexGrow: g.n, animationDelay: `${i * 60}ms` }} aria-label={`${g.name}: ${g.n}`}
          >
            <span className="pl-jtip" role="tooltip"><span className="sc" data-sc={g.hue}>{g.name}</span> {g.n}</span>
          </span>
        ))}
      </div>
      <p className="pl-jline t-body-sm">
        {line}
        {passed > 0 && <> · <button type="button" className="cw-link" onClick={onPassed} title="See the people you rejected">{passed} rejected</button></>}
      </p>
    </section>
  );
}

function FilterMenu({ count, owners, owner, onOwner, sources, source, onSource, stalled, onStalled, onClear }: {
  count: number; owners: readonly string[]; owner: string | null; onOwner: (v: string | null) => void;
  sources: readonly string[]; source: string | null; onSource: (v: string | null) => void;
  stalled: boolean; onStalled: (v: boolean) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const opt = (on: boolean, label: string, fn: () => void) => (
    <button key={label} type="button" className={`pl-fopt${on ? " is-on" : ""}`} onClick={fn} aria-pressed={on}>{on && <Check size={11} weight="bold" />}{label}</button>
  );
  return (
    <>
      <button ref={ref} type="button" className={`pl-filter${count ? " is-on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FunnelSimple size={14} weight="bold" /> Filter{count > 0 && <span className="pl-filter-n">{count}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={300}>
        <div className="pl-fpanel">
          <p className="pl-fh">Owner</p>
          <div className="pl-fopts">{owners.map((o) => opt(owner === o, o, () => onOwner(owner === o ? null : o)))}</div>
          <p className="pl-fh">Source</p>
          <div className="pl-fopts">{sources.map((o) => opt(source === o, o, () => onSource(source === o ? null : o)))}</div>
          <p className="pl-fh">Attention</p>
          <div className="pl-fopts">{opt(stalled, "Could use a nudge", () => onStalled(!stalled))}</div>
          <footer className="pl-ffoot">
            <button type="button" className="cw-link" onClick={onClear} disabled={!count}>Clear</button>
            <button type="button" className="cw-btn is-primary is-quiet" onClick={close}>Done</button>
          </footer>
        </div>
      </Popover>
    </>
  );
}

/** The campaign's first hire: one calm dialog with the picture, and then back to the work. */
function FirstHireDialog({ person, onClose }: { person: PipelinePerson | null; onClose: () => void }) {
  const last = useRef<PipelinePerson | null>(null);
  if (person) last.current = person;
  const first = (person ?? last.current)?.name.split(" ")[0] ?? "";
  return (
    <Dialog open={!!person} onClose={onClose} label="Your first hire" size="md">
      <div className="pl-first">
        <EmptyArt name="moment-first-hire" size={160} />
        <h2>{first} is your first hire</h2>
        <p>They are hired and on the Hired list. Well done.</p>
        <button type="button" className="cw-btn is-primary" onClick={onClose}>Done</button>
      </div>
    </Dialog>
  );
}

function PassedDialog({ open, onClose, people, onBack }: { open: boolean; onClose: () => void; people: readonly PipelinePerson[]; onBack: (p: PipelinePerson) => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="People you rejected" size="md">
      <div className={`pl-pass${people.length ? "" : " is-none"}`}>
        {!people.length && <EmptyArt name="empty-passed" size={180} />}
        <header>
          <h2>Rejected</h2>
          <p>{people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} you decided not to move forward with. Bring anyone back to the shortlist if things change.` : "No one yet. People you reject are kept here."}</p>
        </header>
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <Avatar name={p.name} hue={p.hue} size={32} />
              <span className="pl-pass-t">
                <strong>{plainText(p.name)}</strong>
                <small>{[p.company, p.title].filter(Boolean).join(" · ")}</small>
                {p.passReason && <small>{plainText(p.passReason)}</small>}
              </span>
              <span className="pl-pass-r">{p.last}</span>
              <button type="button" className="cw-btn is-quiet" onClick={() => onBack(p)}>Bring back</button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

function localStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/* The board. Dragging is hand-built rather than the browser's drag-and-drop,
   whose washed-out ghost made the in-between state look broken. Here the
   card you pick up lifts off and follows the pointer, leaning into the
   direction of travel like a held object; the column under it opens a
   landing slot and its icon hops; on release the card lands with a small
   squash-and-bounce, or springs back home if it was dropped nowhere. A
   full-width bin under the board takes anyone you reject, at any stage. */

type Drag = {
  p: PipelinePerson;
  x: number; y: number; offX: number; offY: number; w: number;
  homeX: number; homeY: number;
  tilt: number;
  /** The stage under the card (its id), the bin, or nothing. */
  over: string | "trash" | null;
  phase: "move" | "drop" | "home" | "trash";
};

/** The most columns the board shows at once; the rest scroll sideways. */
const COLUMNS_SHOWN = 5;

function Board({ readOnly = false, people, stages, onMove, onOpen, burst, onAdd, narrowed = false, hiredAll = 0 }: {
  people: readonly PipelinePerson[];
  /** A closed campaign: people can be opened but not dragged, moved or added. */
  readOnly?: boolean;
  /** The campaign's stages: the working ones, then Hired and Rejected. */
  stages: readonly StageDef[];
  onMove: (p: PipelinePerson, to: MoveTo) => number;
  onOpen: (id: string) => void;
  burst: string | null;
  onAdd: () => void;
  /** A search or a filter is hiding people: an empty column says so instead of "nobody". */
  narrowed?: boolean;
  /** Everyone hired on the campaign, shown or not. */
  hiredAll?: number;
}) {
  const [arrived, setArrived] = useState<{ id: string; stage: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [gulp, setGulp] = useState(0);
  const dragRef = useRef<Drag | null>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const columns = columnsOf(stages);
  /* Every stage of the campaign is a column, each a normal width (boardStages.css); the room left over stays empty. */
  const shownCols = columns;
  const by = useMemo(() => groupByStage(people, stages), [people, stages]);
  /* Add people sits on the first stage that counts as the shortlist. */
  const addAt = (firstOfKind(columns, "shortlisted") ?? columns[0])?.id;
  const edges = useScrollEdges(colsRef, shownCols.length);

  const land = (p: PipelinePerson, to: MoveTo) => {
    const at = isStageMove(to) ? stageNamed(stages, to.stageId) : undefined;
    if (isStageMove(to) ? !at || !wouldMoveToStage(p, at, stages) : !wouldMove(p, to)) return;
    onMove(p, to);
    const kind = at ? at.kind : (to as StatusId);
    /* Into Hired the card moves only once the server says so, so it does not arrive here. */
    if (kind !== "passed" && !(kind === "hired" && LIVE)) {
      setArrived({ id: p.id, stage: kind });
      window.setTimeout(() => setArrived((a) => (a?.id === p.id ? null : a)), 1400);
    }
  };

  const set = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  const begin = (p: PipelinePerson, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a")) return;
    if (readOnly) { onOpen(p.id); return; }
    /* Without this the browser may start selecting text or dragging an image or link on
       the card before our 5px threshold, and then never reports the move: the drag was
       lost, most often the first one on a fresh page. Opening still works: a press that
       never moves is handled as a click on release below. */
    e.preventDefault();
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    let lastX = sx;
    /* Where the pointer is, for the edge scroll; null once it has left the window. */
    let at: { x: number; y: number } | null = { x: sx, y: sy };
    let stopScroll: (() => void) | null = null;

    const overAt = (x: number, y: number): Drag["over"] =>
      (document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop as Drag["over"]) ?? null;

    const moveH = (ev: PointerEvent) => {
      at = { x: ev.clientX, y: ev.clientY };
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        started = true;
        document.body.classList.add("is-dragging-card");
        set({ p, x: ev.clientX, y: ev.clientY, offX: sx - r.left, offY: sy - r.top, w: r.width, homeX: r.left, homeY: r.top, tilt: 0, over: null, phase: "move" });
        /* Holding the card near the side of the board scrolls it that way, faster the nearer the edge. */
        const scroller = colsRef.current;
        if (scroller) {
          stopScroll = startEdgeScroll({
            box: () => scroller.getBoundingClientRect(),
            pointer: () => at,
            position: () => ({ left: scroller.scrollLeft, max: scroller.scrollWidth - scroller.clientWidth }),
            scrollTo: (left) => { scroller.scrollLeft = left; },
            /* The board moved under a pointer that did not: what is under it has changed. */
            moved: () => { const d = dragRef.current; if (d && at && d.phase === "move") set({ ...d, over: overAt(at.x, at.y) }); },
            frames: { request: (cb) => window.requestAnimationFrame(cb), cancel: (id) => window.cancelAnimationFrame(id) },
          });
        }
      }
      const d = dragRef.current!;
      const vx = ev.clientX - lastX;
      lastX = ev.clientX;
      const tilt = Math.max(-9, Math.min(9, d.tilt * 0.7 + vx * 0.9));
      set({ ...d, x: ev.clientX, y: ev.clientY, tilt, over: overAt(ev.clientX, ev.clientY) });
    };
    /* Everything a drag listens to, and the edge scroll, let go in one place. */
    const cleanup = () => {
      window.removeEventListener("pointermove", moveH);
      window.removeEventListener("pointerup", upH);
      window.removeEventListener("pointercancel", cancelH);
      window.removeEventListener("keydown", keyH);
      window.removeEventListener("blur", leaveH);
      document.documentElement.removeEventListener("pointerleave", leaveH);
      document.body.classList.remove("is-dragging-card");
      stopScroll?.();
      stopScroll = null;
    };
    /* The pointer left the window: the board stops scrolling until it is back. */
    const leaveH = () => { at = null; };
    /* The browser took the pointer away (a scroll, a system gesture): put the card back. */
    const cancelH = () => { cleanup(); set(null); };
    /* Escape lets go of the card where it was picked up: it glides home, nothing moves. */
    const keyH = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      cleanup();
      const d = dragRef.current;
      if (!started || !d) return;
      ev.stopPropagation();
      set({ ...d, phase: "home", tilt: 0, over: null, x: d.homeX + d.offX, y: d.homeY + d.offY });
      window.setTimeout(() => set(null), 340);
    };
    const upH = () => {
      cleanup();
      const d = dragRef.current;
      if (!started || !d) { onOpen(p.id); return; }
      if (d.over === "trash") {
        const can = document.querySelector<HTMLElement>(".pl-bin-can")?.getBoundingClientRect();
        set({ ...d, phase: "trash", tilt: 0, ...(can ? { x: can.left + can.width / 2 + d.offX - d.w / 2, y: can.top + can.height / 2 } : {}) });
        setGulp((g) => g + 1);
        window.setTimeout(() => { land(p, "passed"); set(null); }, 380);
      } else if (d.over && d.over !== stageIdOf(p, stages)) {
        /* Fly into the landing slot, then commit: the card settles exactly
           where it will live, at the top of the column. */
        const slot = document.querySelector<HTMLElement>(`.cw-col[data-drop="${d.over}"] .pl-slot`);
        const r2 = slot?.getBoundingClientRect();
        set({ ...d, phase: "drop", tilt: 0, ...(r2 ? { x: r2.left + d.offX, y: r2.top + d.offY } : {}) });
        window.setTimeout(() => { land(p, { stageId: d.over as string }); set(null); }, 230);
      } else {
        set({ ...d, phase: "home", tilt: 0, x: d.homeX + d.offX, y: d.homeY + d.offY });
        window.setTimeout(() => set(null), 340);
      }
    };
    window.addEventListener("pointermove", moveH);
    window.addEventListener("pointerup", upH);
    window.addEventListener("pointercancel", cancelH);
    window.addEventListener("keydown", keyH);
    window.addEventListener("blur", leaveH);
    document.documentElement.addEventListener("pointerleave", leaveH);
  };

  return (
    <div className={`cw-board${drag ? " is-dragging" : ""}${readOnly ? " is-readonly" : ""}`}>
      <div
        ref={colsRef}
        className={`cw-cols${edges.left ? " has-left" : ""}${edges.right ? " has-right" : ""}`}
      >
        {shownCols.map((s) => {
          const all = by.get(s.id) ?? [];
          const list = all;
          const isOver = drag?.over === s.id && stageIdOf(drag.p, stages) !== s.id;
          const sub = columnNote(s, all, hiredAll);
          return (
            <section
              key={s.id} data-drop={s.id} data-sc={stageText(s, columns.indexOf(s))["data-sc"]}
              className={`cw-col is-${s.kind}${isOver ? " is-over" : ""}`} aria-label={`${s.name}, ${all.length}`}
            >
              <header className="pl-col-h">
                <div className="pl-col-t">
                  <strong><span {...stageText(s, columns.indexOf(s))}>{s.name}</span><span className="pl-col-n" key={all.length}>{all.length}</span></strong>
                  <small>{sub}</small>
                </div>
                <img className="pl-col-img" src={STAGE_IMG[s.kind as BoardStage]} alt="" width={22} height={22} />
              </header>
              {s.id === addAt && !readOnly && (
                <button type="button" className="cw-col-add" onClick={onAdd}><Plus size={12} weight="bold" /> Add people</button>
              )}
              <ScrollList>
                {isOver && <li className="pl-slot" aria-hidden="true" />}
                {list.map((p) => (
                  <li key={p.id}>
                    <Card
                      p={p} stages={stages} readOnly={readOnly} onPointerDown={(e) => begin(p, e)} onOpen={() => onOpen(p.id)}
                      onMove={(to) => land(p, to)} celebrate={burst === p.id} arrived={arrived?.id === p.id ? arrived.stage : null} lifted={drag?.p.id === p.id}
                    />
                  </li>
                ))}
                {!all.length && !isOver && (s.kind === "hired"
                  ? (hiredAll > 0
                    ? <li className="cw-col-empty">No hires match this search</li>
                    : <li className="cw-col-empty has-art"><EmptyArt name="empty-hires" size={96} />Your first hire will land here</li>)
                  : <li className="cw-col-empty">{narrowed ? "No one here matches" : "Nobody here right now"}</li>)}
              </ScrollList>
            </section>
          );
        })}
      </div>

      <div data-drop="trash" className={`pl-bin${drag?.over === "trash" ? " is-over" : ""}${drag ? " is-ready" : ""}`} key={`bin-${gulp}`} data-gulp={gulp > 0 ? "1" : undefined}>
        <span className="pl-bin-can" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <g className="pl-bin-lid"><path d="M4 7h16" /><path d="M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" /></g>
            <path d="M6 7l1 12.2c.1.9.8 1.8 1.8 1.8h6.4c1 0 1.7-.9 1.8-1.8L18 7" /><path d="M10 11v6M14 11v6" />
          </svg>
        </span>
        <span className="pl-bin-t">{drag?.over === "trash" ? `Let go to reject ${plainText(drag.p.name.split(" ")[0])}` : drag ? "Drop here to reject" : "Drag a card here to reject, from any stage"}</span>
      </div>

      {drag && createPortal(
        <div
          className={`pl-ghost is-${drag.phase}`}
          style={{ width: drag.w, transform: `translate(${drag.x - drag.offX}px, ${drag.y - drag.offY}px) rotate(${drag.tilt}deg)` }}
          aria-hidden="true"
        >
          <CardBody p={drag.p} />
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Whether the board has more columns off its left or right edge, so a soft fade can say so. */
function useScrollEdges(ref: React.RefObject<HTMLElement>, count: number): { left: boolean; right: boolean } {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    read();
    /* Bars grow in and fonts settle after the first read: the ends are read again once they have, and whenever the row is resized. */
    const later = window.setTimeout(read, 900);
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    watch?.observe(el);
    el.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => { window.clearTimeout(later); watch?.disconnect(); el.removeEventListener("scroll", read); window.removeEventListener("resize", read); };
  }, [ref, count]);
  return edges;
}

/* A column's list: always a scroller, sized to reach the bottom of the
   window (leaving room for the bin), with soft fades at whichever edge
   still hides cards. The board fills the screen and never grows past it. */
const BIN_ROOM = 104;
function ScrollList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });
  const [h, setH] = useState<number | null>(null);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ top: el.scrollTop > 2, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 2 });
  }, []);
  const size = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + (el.closest(".con-main")?.scrollTop ?? 0);
    setH(Math.max(280, window.innerHeight - top - BIN_ROOM));
  }, []);
  useEffect(() => { size(); window.addEventListener("resize", size); return () => window.removeEventListener("resize", size); }, [size]);
  useEffect(() => { measure(); }, [measure, children, h]);
  return (
    <ul ref={ref} onScroll={measure} style={h ? { maxHeight: h } : undefined} className={`cw-cards is-scroll${edge.top ? " fade-top" : ""}${edge.bottom ? " fade-bottom" : ""}`}>
      {children}
    </ul>
  );
}

/* How strong a match, as temperature: a quick, friendly read. */
const HEAT: Readonly<Record<1 | 2 | 3, { icon: ReactNode; label: string }>> = {
  3: { icon: <Fire size={14} weight="fill" />, label: TIER_LABEL.A },
  2: { icon: <SunDim size={14} weight="fill" />, label: TIER_LABEL.B },
  1: { icon: <Snowflake size={14} weight="bold" />, label: TIER_LABEL.C },
};

const FIT_OF_TONE = { strong: 3, good: 2, partial: 1 } as const;

/**
 * How a person matches the role, for the Match column and the card: the server's one resolved state (the same words the person's
 * sheet says), and the stored fit only from an older server. A result without a tier ("Not scored yet", "Needs more evidence")
 * is plain muted words with no heat mark.
 */
function matchOf(p: PipelinePerson): { fit: 1 | 2 | 3 | null; label: string; note: string | null } | null {
  if (p.display) {
    const fit = p.display.tone in FIT_OF_TONE ? FIT_OF_TONE[p.display.tone as keyof typeof FIT_OF_TONE] : null;
    return { fit, label: p.display.label, note: p.display.note };
  }
  return p.fit ? { fit: p.fit, label: HEAT[p.fit].label, note: null } : null;
}

/** Plain muted words, never a pill: this person is on the do-not-contact list, so nothing is sent to them. */
const listed = (p: PipelinePerson) => (p.doNotContact ? <span className="cw-muted">Do not contact</span> : null);


function CardBody({ p, menu }: { p: PipelinePerson; menu?: ReactNode }) {
  const stalled = p.inStage >= STALL_DAYS && p.stage !== "hired" && p.stage !== "shortlisted";
  const match = matchOf(p);
  const heat = match?.fit ? HEAT[match.fit] : null;
  const chip = stepChip(p);
  return (
    <>
      <div className="cw-pc-top">
        <span className="cw-pc-name">{plainText(p.name)}</span>
        {heat && match && <span className={`cw-heat is-${match.fit}`} title={[match.label, match.note].filter(Boolean).join(". ")} aria-label={match.label}>{heat.icon}</span>}
        {menu}
      </div>
      <p className="cw-pc-sub">{[p.company, p.title].filter(Boolean).join(" · ")}</p>
      <MeetingNote id={p.id} />
      <div className="cw-pc-meta">
        {chip && <span className={`cw-step is-${chip.tone}`}>{chip.text}</span>}
        {p.clientVerdict && <span {...toneProps(verdictTone(p.clientVerdict.verdict))} className="cw-step st">{verdictLabel(p.clientVerdict.verdict)}</span>}
        {listed(p)}
        <span className={`cw-pc-time${stalled ? " is-nudge" : ""}`} title={stalled ? "Could use a nudge" : "Time in this stage"}>
          {p.inStage === 0 ? "Today" : `${p.inStage}d`}
        </span>
      </div>
    </>
  );
}

function Card({ p, stages, readOnly = false, onPointerDown, onOpen, onMove, celebrate, arrived, lifted }: {
  p: PipelinePerson;
  stages: readonly StageDef[];
  readOnly?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onOpen: () => void;
  onMove: (to: MoveTo) => void;
  celebrate: boolean;
  arrived?: string | null;
  lifted?: boolean;
}) {
  return (
    <article
      className={`cw-pcard${celebrate ? " is-celebrate" : ""}${arrived ? ` is-arrived to-${arrived}` : ""}${lifted ? " is-lifted" : ""}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen(); }}
      tabIndex={0}
      aria-label={`${p.name}, ${p.company}. Press Enter to open.`}
    >
      {(celebrate || arrived === "hired") && (
        <span className="pl-rain" aria-hidden="true">
          {Array.from({ length: 26 }, (_, i) => (
            <i key={i} style={{ ["--x" as string]: `${(i * 41) % 100}%`, ["--d" as string]: `${(i % 7) * 70}ms`, ["--r" as string]: `${(i % 2 ? 1 : -1) * (180 + (i * 53) % 360)}deg`, ["--s" as string]: `${0.7 + ((i * 17) % 6) / 10}` }} />
          ))}
        </span>
      )}
      {arrived === "outreach" && <span className="pl-plane" aria-hidden="true"><PaperPlaneTilt size={16} weight="fill" /></span>}
      {arrived === "interviewing" && (
        <span className="pl-talk" aria-hidden="true">
          <span className="pl-bub is-a"><i /><i /><i /></span>
          <span className="pl-bub is-b"><i /><i /><i /></span>
        </span>
      )}
      <CardBody p={p} menu={readOnly ? undefined : <MoveMenu p={p} stages={stages} onMove={onMove} />} />
    </article>
  );
}

/** Marks or clears an offer for someone in interviews; null where there is no backend to keep it. */
const OfferContext = createContext<((p: PipelinePerson) => void) | null>(null);

/**
 * The places a person can be moved: the campaign's own columns by name, with Replied under the first one that counts
 * as outreach (it is a step within it, not a column), and Pass. Choosing a column moves them exactly there.
 */
function StageChoices({ p, stages, onMove, item }: {
  p: PipelinePerson;
  stages: readonly StageDef[];
  onMove: (to: MoveTo) => void;
  item: (a: { key: string; label: string; on: boolean; run: () => void }) => ReactNode;
}) {
  const columns = columnsOf(stages);
  const here = stageIdOf(p, stages);
  const replied = statusIdOf(p) === "replied";
  const repliedAt = firstOfKind(columns, "outreach")?.id;
  return (
    <>
      {columns.map((c) => (
        <Fragment key={c.id}>
          {item({
            key: c.id, label: c.name, on: here === c.id && !(c.id === repliedAt && replied),
            /* Back to the outreach stage from Replied is a step back within it, not a change of column. */
            run: () => (c.id === repliedAt && replied ? onMove("outreach") : onMove({ stageId: c.id })),
          })}
          {c.id === repliedAt && item({ key: "replied", label: "Replied", on: replied, run: () => onMove("replied") })}
        </Fragment>
      ))}
    </>
  );
}

function MoveMenu({ p, stages, onMove }: { p: PipelinePerson; stages: readonly StageDef[]; onMove: (to: MoveTo) => void }) {
  const offer = useContext(OfferContext);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const toast = useToast();
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  /* Connected, a person who is in the workspace can be put on the do-not-contact list from here (the agent does it
     too, when asked), and an owner or admin can take them off it again. */
  const candidateId = LIVE ? p?.candidateId : undefined;
  const mayAllowAgain = useCan("contact.allowAgain");
  const listed = !!p?.doNotContact;
  return (
    <>
      <button ref={ref} type="button" className="cw-more" onClick={() => setOpen((o) => !o)} aria-label="Move to stage" aria-expanded={open}>
        <DotsThree size={16} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={200}>
        <div className="ct-menu" role="menu">
          <p className="ct-menu-h">Move to</p>
          <StageChoices
            p={p} stages={stages} onMove={onMove}
            item={(a) => (
              <button key={a.key} type="button" role="menuitemradio" aria-checked={a.on} className={`ct-menu-i${a.on ? " is-on" : ""}`} onClick={() => { a.run(); close(); }}>
                <span className="ct-menu-box is-radio">{a.on && <Check size={11} weight="bold" />}</span><span className="ct-menu-t">{a.label}</span>
              </button>
            )}
          />
          {/* One wording per thing: a campaign with an "Offer" stage of its own moves people there; the step item is for those without. */}
          {offer && p?.stage === "interviewing" && !stages.some((st) => /offer/i.test(st.name)) && (
            <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { offer(p); close(); }}>
              <span className="ct-menu-box is-radio" /><span className="ct-menu-t">{p.step === "offer" ? "Offer withdrawn" : "Offer made"}</span>
            </button>
          )}
          <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { onMove("passed"); close(); }}>
            <span className="ct-menu-box is-radio" /><span className="ct-menu-t">Reject</span>
          </button>
          {candidateId && (!listed || mayAllowAgain) && (
            <button type="button" role="menuitem" className="ct-menu-i ct-menu-quiet" onClick={() => { setAsking(true); close(); }}>
              <span className="ct-menu-box is-radio" /><span className="ct-menu-t">{listed ? "Allow contact again" : "Do not contact"}</span>
            </button>
          )}
        </div>
      </Popover>
      {asking && candidateId && p && (
        /* The dialog is drawn elsewhere but still belongs to the card in React's tree: what happens
           in it must not start a drag or open the profile. */
        <span style={{ display: "contents" }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open
          title={listed ? `Email ${p.name} again?` : `Never email ${p.name}?`}
          body={listed
            ? <>Emails from any campaign can go to {p.name} again.</>
            : <>No email from any campaign will go to {p.name}, including ones already drafted or set up for later. Anyone can add someone; only an admin can take them off again.</>}
          confirm={listed ? "Allow contact" : "Do not contact"}
          danger={!listed}
          onClose={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            if (listed) {
              void allowContactAgain(p.name).then((r) => toast(r.ok ? `${p.name} can be written to again` : r.message, r.ok ? "done" : "error"));
              return;
            }
            void addForCandidate(candidateId).then((r) => toast(r.ok ? `${p.name} is on the do-not-contact list` : r.message, r.ok ? "done" : "error"));
          }}
        />
        </span>
      )}
    </>
  );
}

function Table({ readOnly = false, people, stages, onOpen, onMove }: {
  readOnly?: boolean;
  people: readonly PipelinePerson[];
  stages: readonly StageDef[];
  onOpen: (id: string) => void;
  onMove: (p: PipelinePerson, to: MoveTo) => void;
}) {
  const columns = columnsOf(stages);
  const list = people;
  /* Furthest along first, then whoever arrived last. */
  const place = (p: PipelinePerson) => columns.findIndex((c) => c.id === stageIdOf(p, stages));
  const sorted = [...list].sort((a, b) => place(b) - place(a) || a.inStage - b.inStage);
  return (
    <div className="cw-table-wrap">
      <table className="cw-table">
        <thead>
          <tr><th>Name</th><th>Stage</th><th>In stage</th><th>Match</th><th>Owner</th><th>Source</th><th>Latest</th><th aria-label="Move" /></tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const stalled = p.inStage >= STALL_DAYS && p.stage !== "hired" && p.stage !== "shortlisted";
            const chip = stepChip(p);
            const at = stageOf(p, stages);
            return (
              <tr key={p.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onOpen(p.id); }}>
                <td><span className="cw-who"><Avatar name={p.name} hue={p.hue} size={28} /><span><strong>{plainText(p.name)}</strong><small>{[p.company, p.title].filter(Boolean).join(" · ")}</small><MeetingNote id={p.id} /></span></span></td>
                <td><span {...stageText(at ?? { kind: p.stage, color: null }, at ? stages.indexOf(at) : undefined)} className={`sc cw-stage is-${p.stage}`}>{at?.name ?? kindLabel(p.stage)}</span>{chip && <span className={`cw-step is-${chip.tone}`}>{chip.text}</span>}{p.clientVerdict && <span {...toneProps(verdictTone(p.clientVerdict.verdict))} className="cw-step st">{verdictLabel(p.clientVerdict.verdict)}</span>}{p.doNotContact && " "}{listed(p)}</td>
                <td><span className={`cw-pc-time${stalled ? " is-nudge" : ""}`}><Clock size={12} />{p.inStage === 0 ? "Today" : `${p.inStage}d`}</span></td>
                <td title={matchOf(p)?.note ?? undefined}>{(() => { const m = matchOf(p); return m && (m.fit ? <span className={`cw-heat is-${m.fit}`}>{HEAT[m.fit].icon}<em>{m.label}</em></span> : <span className="cw-muted">{m.label}</span>); })()}</td>
                <td>{p.owner}</td>
                <td>{p.source}</td>
                <td className="cw-muted">{p.last}</td>
                <td>{!readOnly && <MoveMenu p={p} stages={stages} onMove={(to) => onMove(p, to)} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!sorted.length && <p className="cw-calm cw-pad">No one matches these filters.</p>}
    </div>
  );
}

/** The board while it loads: the campaign's own columns (their names are known), each with a few card ghosts in the real card's classes. */
function BoardGhost({ stages }: { stages: readonly StageDef[] }): JSX.Element {
  const columns = columnsOf(stages);
  const shown = columns.slice(0, COLUMNS_SHOWN);
  const cards = [3, 2, 3, 2, 2];
  return (
    <ShimmerRegion label="Loading people" className="cw-board">
      <div className="cw-cols" aria-hidden="true">
        {shown.map((s, c) => (
          <section key={s.id} className={`cw-col is-${s.kind}`} data-sc={stageText(s, columns.indexOf(s))["data-sc"]}>
            <header className="pl-col-h">
              <span className="pl-col-t">
                <strong><span {...stageText(s, columns.indexOf(s))}>{s.name}</span><Shimmer h={18} w={26} r={99} /></strong>
                <small><Shimmer h={10} lh={14} w={64} /></small>
              </span>
              <Shimmer circle w={22} h={22} />
            </header>
            <ul className="cw-cards">
              {Array.from({ length: shown.length === 1 ? 6 : cards[c % cards.length]! }, (_, i) => (
                <li key={i}>
                  <article className="cw-pcard" style={{ animation: "none" }}>
                    <div className="cw-pc-top"><Shimmer h={13} lh={17} w={`${52 + ((i * 17 + c * 11) % 30)}%`} /><Shimmer circle w={14} h={14} /></div>
                    <p className="cw-pc-sub"><Shimmer h={11} lh={16} w={`${60 + ((i * 13 + c * 7) % 30)}%`} /></p>
                    <div className="cw-pc-meta"><Shimmer h={10} w={52} /><Shimmer h={10} w={22} /></div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ShimmerRegion>
  );
}

/** The table view while it loads: its own header row, then rows of a person, a stage, the time, the match, owner, source and latest. */
function TableGhost(): JSX.Element {
  return (
    <ShimmerRegion label="Loading people">
      <div className="cw-table-wrap" aria-hidden="true">
        <table className="cw-table">
          <thead>
            <tr><th>Name</th><th>Stage</th><th>In stage</th><th>Match</th><th>Owner</th><th>Source</th><th>Latest</th><th aria-label="Move" /></tr>
          </thead>
          <tbody>
            <ShimmerTableRows rows={7} cells={[{ lead: 28, round: true, w: "62%", sub: "76%" }, { w: 72 }, { w: 40 }, { w: 64 }, { w: "70%" }, { w: "64%" }, { w: "58%" }, { box: [24, 24] }]} />
          </tbody>
        </table>
      </div>
    </ShimmerRegion>
  );
}

/** Where a person is, and the way to move them: a row of the campaign's stages and Pass. */
function StagePick({ p, onMove, locked = false }: { p: PipelinePerson; onMove: (p: PipelinePerson, to: MoveTo) => void; locked?: boolean }) {
  const stages = useCampaignStages(p.campaign);
  return (
    <section>
      <h3>Stage</h3>
      <div className={`cw-stagepick${locked ? " is-off" : ""}`} role="radiogroup" aria-label="Stage" aria-disabled={locked || undefined}>
        <StageChoices
          p={p} stages={stages} onMove={(to) => onMove(p, to)}
          item={(a) => <button key={a.key} type="button" role="radio" aria-checked={a.on} className={a.on ? "is-on" : ""} onClick={a.run} disabled={locked} aria-disabled={locked || undefined}>{a.label}</button>}
        />
        <button type="button" className={`is-pass${p.stage === "passed" ? " is-on" : ""}`} onClick={() => onMove(p, "passed")} disabled={locked} aria-disabled={locked || undefined}>{p.stage === "passed" ? "Rejected" : "Reject"}</button>
      </div>
    </section>
  );
}

/** What the client said about a person, with their note and name, as plain coloured words. */
function ClientWord({ v }: { v: ClientVerdict }) {
  return (
    <section>
      <h3>Client</h3>
      <p>
        <span {...toneProps(verdictTone(v.verdict))}>{verdictLabel(v.verdict)}</span>
        <span className="cw-muted">{[v.reviewerName, agoFrom(v.at)].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
      </p>
      {v.note && <p className="cw-quote">{plainText(v.note)}</p>}
    </section>
  );
}

export function PersonDialog({ person, onClose, onMove, campaignId = null, locked = false }: { person: PipelinePerson | null; onClose: () => void; onMove: (p: PipelinePerson, to: MoveTo) => void; campaignId?: string | null; locked?: boolean }) {
  const last = useRef<PipelinePerson | null>(null);
  if (person) last.current = person;
  const p = person ?? last.current;
  /* A person who is a candidate in the workspace opens in the console's own profile sheet, the one the chat and the
     ranked list open people in; the board only adds the person's stage to it. */
  if (LIVE && person?.candidateId) {
    return (
      <PersonSheet
        person={person} onClose={onClose} campaignId={campaignId}
        extra={<div className="cw-pd-stage"><StagePick p={person} onMove={onMove} locked={locked} />{person.clientVerdict && <ClientWord v={person.clientVerdict} />}<PersonMeetings id={person.id} /></div>}
      />
    );
  }
  return (
    <Dialog open={!!person} onClose={onClose} label={p ? p.name : "Candidate"} size="md">
      {p && (
        <div className="cw-pd">
          <header className="cw-pd-head">
            <Avatar name={p.name} hue={p.hue} size={52} />
            <div>
              <h2>{plainText(p.name)}</h2>
              <p>{[[p.title, p.company].filter(Boolean).join(" at "), p.location].filter(Boolean).join(" · ")}</p>
              <p className="cw-muted">{[p.years ? `${p.years} yrs` : "", `via ${p.source}`, `owned by ${p.owner}`, matchOf(p)?.label ?? ""].filter(Boolean).join(" · ")}</p>
            </div>
          </header>
          <div className="cw-pd-body">
            <StagePick p={p} onMove={onMove} locked={locked} />
            {p.clientVerdict && <ClientWord v={p.clientVerdict} />}
            <section>
              <h3>Latest</h3>
              <p>{p.last} · {p.inStage === 0 ? "today" : p.inStage === 1 ? "yesterday" : `${p.inStage} days ago`}</p>
            </section>
            <section>
              <h3>Contact</h3>
              <p className="cf-line"><span className="cf-k">Email</span><ContactSideLine campaignId={p.campaign} kind="email" ccId={p.id} name={p.name} value={p.email?.value} reach={p.reach?.email} /></p>
              <p className="cf-line"><span className="cf-k">Phone</span><ContactSideLine campaignId={p.campaign} kind="phone" ccId={p.id} name={p.name} value={p.phone?.value} reach={p.reach?.phone} /></p>
            </section>
            {p.skills.length > 0 && (
              <section>
                <h3>Skills</h3>
                <div className="cp-skills">{p.skills.map((s) => <span key={s} className="cp-skill">{s}</span>)}</div>
              </section>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ── shortlisted: a dense table of everyone this campaign has picked ──
   One row per person, newest first. Status is plain text with a caret that
   moves them between stages; ticked rows get Reach out and Pass. The table
   scrolls inside its card, so the page itself never does on a desktop. */

/* Replied sits between In outreach and Interviewing, here and in every menu that chooses a status. */
const STATUS_OPTIONS: readonly { id: StatusId; label: string }[] = STATUSES;

const STATUS_ORDER: Readonly<Record<StatusId, number>> = { shortlisted: 0, outreach: 1, replied: 2, interviewing: 3, hired: 4, passed: 5 };

/* A company's mark is its first letter on a plain tile. No icon is fetched: every company a candidate has worked
   at would otherwise be sent to a third party just to draw a table, and the ones it doesn't know come back broken. */
function OrgLogo({ company }: { company: string }) {
  return (
    <span className="sl-logo" aria-hidden="true">
      <b>{company.trim().charAt(0).toUpperCase() || "?"}</b>
    </span>
  );
}

const HUE_KEYS = ["brand", "amber", "sage", "teal", "blue", "violet", "rose"] as const;
const hueOf = (s: string) => HUE_KEYS[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 3) % HUE_KEYS.length]!;

type ProfileLink = { key: string; label: string; href: string; icon: ReactNode };
/** LinkedIn always; email and phone when enriched; GitHub for technical roles
    and a portfolio for designers, when the profile listed one. */
function profileLinks(p: PipelinePerson): ProfileLink[] {
  const out: ProfileLink[] = p.linkedin ? [{ key: "in", label: "LinkedIn", href: `https://${p.linkedin}`, icon: <LinkedinLogo size={15} /> }] : [];
  if (p.email) out.push({ key: "mail", label: p.email.value, href: `mailto:${p.email.value}`, icon: <EnvelopeSimple size={15} /> });
  if (p.phone) out.push({ key: "tel", label: p.phone.value, href: `tel:${p.phone.value.replace(/\s/g, "")}`, icon: <Phone size={15} /> });
  const [first = "", last = ""] = p.name.toLowerCase().split(" ");
  const h = [...p.id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5);
  if (p.campaign === "design-lead") { if (h % 3) out.push({ key: "web", label: `${first}${last}.design`, href: `https://${first}${last}.design`, icon: <Globe size={15} /> }); }
  else if (/backend|sre|ios|ds-/.test(p.campaign) && h % 3 !== 0) out.push({ key: "gh", label: `github.com/${first}${last[0] ?? ""}`, href: `https://github.com/${first}${last[0] ?? ""}`, icon: <GithubLogo size={15} /> });
  return out;
}

function addedLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dateAgo(days).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type SlSort = { key: "added" | "name" | "fit" | "status" | "owner" | "role" | "org"; dir: 1 | -1 };
const SL_SORTS: readonly { label: string; sort: SlSort }[] = [
  { label: "Newest first", sort: { key: "added", dir: 1 } },
  { label: "Oldest first", sort: { key: "added", dir: -1 } },
  { label: "Name, A to Z", sort: { key: "name", dir: 1 } },
  { label: "Best fit first", sort: { key: "fit", dir: -1 } },
];
const starred = new Set<string>();

type SlFilter = { owner: string | null; source: string | null; email: boolean; open: boolean; status: StatusId | null };
const NO_FILTER: SlFilter = { owner: null, source: null, email: false, open: false, status: null };

/* Where the person left this campaign's shortlist in this tab. Anything that is not a sort, a status or a page this
   list can have falls back to the top; an owner or source nobody on the list has is dropped once the people are in. */
const SL_STATUSES: readonly StatusId[] = ["shortlisted", "outreach", "replied", "interviewing", "hired", "passed"];
const SL_KEYS: readonly SlSort["key"][] = ["added", "name", "fit", "status", "owner", "role", "org"];
type SlRemembered = { q: string; sort: SlSort; f: SlFilter; offset: number };
const SL_NOTHING: SlRemembered = { q: "", sort: SL_SORTS[0]!.sort, f: NO_FILTER, offset: 0 };
export function readShortlistRemembered(r: Record<string, unknown>): SlRemembered {
  const sort = take.rec(r.sort);
  const f = take.rec(r.f);
  const status = take.oneOf(f.status, [...SL_STATUSES, ""] as const, "");
  return {
    q: take.str(r.q, "", 100),
    sort: { key: take.oneOf(sort.key, SL_KEYS, SL_NOTHING.sort.key), dir: sort.dir === -1 ? -1 : 1 },
    f: {
      owner: take.str(f.owner, "", 120) || null, source: take.str(f.source, "", 120) || null,
      email: take.bool(f.email), open: take.bool(f.open), status: status || null,
    },
    offset: take.int(r.offset, 0, 0, 100_000),
  };
}

/**
 * What the Shortlisted page shows for the state of its people: a list that could not be read is never drawn as an
 * empty one ("No one on the shortlist yet" about a campaign with sixteen).
 */
export function shortlistState(ready: boolean, failed: boolean): "loading" | "failed" | "list" {
  if (!ready) return "loading";
  return failed ? "failed" : "list";
}

/** The shortlist's columns as ghost cells: the table's own classes, for the columns this person has switched on. */
const SL_GHOST: Readonly<Record<SlCol, ShimCell>> = {
  prof: { cls: "sl-c-prof", w: 54, fixed: true },
  email: { cls: "sl-c-email", w: "74%" },
  phone: { cls: "sl-c-phone", w: "62%" },
  status: { cls: "sl-c-status", w: "56%" },
  owner: { cls: "sl-c-owner", lead: 20, round: true, w: "64%" },
  added: { cls: "sl-c-added", w: "60%" },
  role: { cls: "sl-c-role", w: "80%" },
  org: { cls: "sl-c-org", lead: 20, w: "64%" },
};
const SL_ORDER: readonly SlCol[] = ["prof", "email", "phone", "status", "owner", "added", "role", "org"];
const shortlistGhost = (show: (c: SlCol) => boolean): ShimCell[] => [
  { cls: "sl-c-check", box: [15, 15] },
  { cls: "sl-c-name", lead: 15, w: "74%" },
  ...SL_ORDER.filter(show).map((c) => SL_GHOST[c]),
];

export function CampaignShortlisted({ ctx }: { ctx: Ctx }) {
  /* "You" goes by user id with real data; fixtures have only names. */
  const mine = (p: PipelinePerson) => (LIVE ? isMe(p.ownerId) : p.owner === ME);
  const row = useRowFor(ctx.campaignId);
  /* The same answer as the Pipeline page: the people on the campaign (and, for an admin, its team's lead) change the shortlist; anyone else reads it. */
  const mayChange = useMayChangeCampaign(ctx.campaignId);
  const everyone = usePipeline(ctx.campaignId);
  const ready = usePipelineReady(ctx.campaignId);
  /* A shortlist that could not be read is not an empty one: it says so, with a way to try again. */
  const failed = usePipelineFailed(ctx.campaignId);
  const state = shortlistState(ready, failed);
  const section = `shortlist:${resolveCampaignId(ctx.campaignId)}`;
  const [start] = useState<SlRemembered>(() => (hasDeepLink() ? SL_NOTHING : loadSection(section, readShortlistRemembered, SL_NOTHING)));
  const [q, setQ] = useState(start.q);
  const [sort, setSort] = useState<SlSort>(start.sort);
  const [f, setF] = useState<SlFilter>(start.f);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  /* Where the page starts, as a row: a new page size lands on the page that holds that row. */
  const [wanted, setWanted] = useState(start.offset);
  const [stars, setStars] = useState<ReadonlySet<string>>(() => new Set(starred));
  const [openId, setOpenId] = useState<string | null>(null);
  /* Asked for from the Overview's agents panel ("Review"): the outreach is already open. */
  const [outreachOpen, setOutreachOpen] = useState(() => { const asked = pendingOutreach; pendingOutreach = false; return asked && LIVE; });
  const toast = useToast();

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = everyone.filter((p) =>
      (f.status ? statusIdOf(p) === f.status : p.stage !== "passed")
      && (!f.owner || p.owner === f.owner)
      && (!f.source || p.source === f.source)
      && (!f.email || !!p.email || !!p.reach?.email)
      && (!f.open || p.openToWork)
      && (!needle || p.name.toLowerCase().includes(needle) || p.company.toLowerCase().includes(needle) || p.title.toLowerCase().includes(needle) || p.skills.some((s) => s.toLowerCase().includes(needle))));
    const val = (p: PipelinePerson): string | number => {
      switch (sort.key) {
        case "added": return p.capturedAgo;
        case "name": return p.name;
        case "fit": return matchOf(p)?.fit ?? 0;
        case "status": return STATUS_ORDER[statusIdOf(p)];
        case "owner": return p.owner;
        case "role": return p.title;
        case "org": return p.company;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c * sort.dir || a.name.localeCompare(b.name);
    });
  }, [everyone, f, needle, sort]);

  /* As many rows as fit under the table's head. */
  const autoSize = usePageSize(56, { rowSelector: ".sl-table tbody tr", reserve: 24 + 40 + PAGER_FOOT });
  /* The size the window fits is "Auto"; the person may choose a fixed one that suits how many there are (25 to 1,000). */
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const { size, picker } = usePageSizeChoice("shortlisted", autoSize, knownTotal);
  const offset = clampedOffset(wanted, rows.length, size);
  const shown = rows.slice(offset, offset + size);
  useEffect(() => { setKnownTotal(rows.length); }, [rows.length]);
  /* A different search, filter or sort is the top of a new list (not on arrival: that is where it was left). */
  const listKey = JSON.stringify([needle, f, sort]);
  const lastList = useRef(listKey);
  useEffect(() => {
    if (lastList.current === listKey) return;
    lastList.current = listKey;
    setWanted(0);
  }, [listKey]);
  /* A remembered owner or source that nobody on this shortlist has is not a filter to keep. */
  useEffect(() => {
    if (!ready || (!f.owner && !f.source)) return;
    const owner = f.owner && everyone.some((p) => p.owner === f.owner) ? f.owner : null;
    const source = f.source && everyone.some((p) => p.source === f.source) ? f.source : null;
    if (owner !== f.owner || source !== f.source) setF((cur) => ({ ...cur, owner, source }));
  }, [ready, everyone, f.owner, f.source]);
  useSectionSave(section, { q, sort, f, offset }, ready);
  useScrollMemory(section, ready, !hasDeepLink(), ".sl .sl-scroll");

  const ids = shown.map((p) => p.id);
  const allOn = ids.length > 0 && ids.every((id) => picked.has(id));
  const someOn = ids.some((id) => picked.has(id));
  const head = useRef<HTMLInputElement>(null);
  useEffect(() => { if (head.current) head.current.indeterminate = someOn && !allOn; }, [someOn, allOn]);
  const pickedList = everyone.filter((p) => picked.has(p.id));

  const toggle = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const star = (id: string) => setStars((cur) => {
    const n = new Set(cur);
    if (n.has(id)) { n.delete(id); starred.delete(id); } else { n.add(id); starred.add(id); }
    return n;
  });
  /* Who is about to be passed on: asked why first (optional). */
  const [passing, setPassing] = useState<readonly PipelinePerson[] | null>(null);
  const [firstHire, setFirstHire] = useState<PipelinePerson | null>(null);
  const move = (p: PipelinePerson, to: MoveTo) => {
    const all = stagesNow(ctx.campaignId);
    if (!wouldChange(p, to, all)) return;
    const target = isStageMove(to) ? stageNamed(all, to.stageId) : undefined;
    const s: StatusId = target ? target.kind : (to as StatusId);
    if (s === "passed" && LIVE) { setPassing([p]); return; }
    if (s === "hired" && LIVE) { movePerson(ctx.campaignId, p.id, to); return; }
    const firstEver = isFirstHire(everyone, p, s);
    movePerson(ctx.campaignId, p.id, to);
    const cid = resolveCampaignId(ctx.campaignId);
    if (firstEver && !orgHasEarlierHire(cid) && !firstHireSeen(cid)) { rememberFirstHire(cid); setFirstHire(p); }
    else toast(`${firstName(p.name)} moved to ${target ? target.name : STATUS_OPTIONS.find((o) => o.id === s)?.label.toLowerCase()}`);
  };
  const reach = () => {
    const ready = pickedList.filter((p) => p.stage === "shortlisted");
    movePeople(ctx.campaignId, ready.map((p) => p.id), "outreach");
    const skipped = pickedList.length - ready.length;
    setPicked(new Set());
    toast(ready.length
      ? `${ready.length} ${plural(ready.length, "person", "people")} moved to outreach${skipped ? `. ${skipped} already contacted, left as they were` : ""}`
      : "Everyone you picked has already been contacted");
  };
  /* Off the board, still in Candidates; only people not yet contacted can be taken off. */
  const takeOff = () => {
    const list = pickedList.filter((p) => p.stage === "shortlisted");
    const skipped = pickedList.length - list.length;
    setPicked(new Set());
    if (!list.length) { toast("Everyone you picked has already been contacted"); return; }
    void removeFromShortlist(ctx.campaignId, list.map((p) => p.id)).then((n) => {
      if (n > 0) toast(`${n} ${plural(n, "person", "people")} taken off the shortlist, still in Candidates${skipped ? `. ${skipped} already contacted, left as they were` : ""}`);
    });
  };
  const passNow = (list: readonly PipelinePerson[] = pickedList, reason?: string) => {
    movePeople(ctx.campaignId, list.map((p) => p.id), "passed", reason);
    setPicked(new Set());
    toast(list.length === 1 ? `Rejected ${firstName(list[0]!.name)}` : `Rejected ${list.length} ${plural(list.length, "person", "people")}`);
  };
  const askWhy = () => (LIVE ? setPassing(pickedList) : passNow());
  /* Passing someone already hired undoes a hire: worth one question first. */
  const [confirmHired, setConfirmHired] = useState(false);
  const hiredPicked = pickedList.filter((p) => p.stage === "hired");
  const pass = () => (hiredPicked.length ? setConfirmHired(true) : askWhy());
  const sortBy = (key: SlSort["key"]) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "added" || key === "fit" ? (key === "fit" ? -1 : 1) : 1 }));

  /* Not contacted yet means someone who can be: people on the do-not-contact list are never waiting. */
  const fresh = notContactedYet(everyone);
  const onList = everyone.filter((p) => p.stage !== "passed").length;
  const open = openId ? everyone.find((p) => p.id === openId) ?? null : null;
  const filterCount = (f.owner ? 1 : 0) + (f.source ? 1 : 0) + (f.email ? 1 : 0) + (f.open ? 1 : 0) + (f.status ? 1 : 0);
  const slEmpty = shortlistEmpty({ total: everyone.length, passed: everyone.filter((p) => p.stage === "passed").length, status: f.status, narrowed: !!(needle || f.owner || f.source || f.email || f.open) });

  const cols = useSlColumns();
  const th = (key: SlSort["key"], label: string, cls: string) => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className={`sl-sort${sort.key === key ? " is-on" : ""}`} onClick={() => sortBy(key)}>
        {label}{sort.key === key ? (sort.dir === 1 ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />) : <CaretUpDown size={11} />}
      </button>
    </th>
  );

  return (
    <div className="cw sl">
      <CampaignHeader ctx={ctx} title="Shortlisted" meta={failed ? undefined : `${fresh} not contacted yet, ${onList} on the shortlist now`}>
        {LIVE && row && (
          <>
            {mayChange && <button type="button" className="cw-btn" onClick={() => setOutreachOpen(true)}><PaperPlaneTilt size={14} /> Outreach</button>}
            <CampaignExport campaignId={resolveCampaignId(ctx.campaignId)} campaignName={row.name} kind="shortlist" />
          </>
        )}
      </CampaignHeader>
      {LIVE && row && (
        <Dialog open={outreachOpen} onClose={() => setOutreachOpen(false)} label={`Outreach for ${row.name}`} size="md">
          <div className="sl-out">
            <h2 className="t-title">Outreach</h2>
            <LiveOutreach campaign={{ id: resolveCampaignId(ctx.campaignId), name: row.name }} />
          </div>
        </Dialog>
      )}

      {!failed && (
        <div className="sl-bar">
          <label className="sl-search">
            <MagnifyingGlass size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, company or skill" aria-label="Search by name, company or skill" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X size={11} weight="bold" /></button>}
          </label>
          <SlSortMenu sort={sort} onSort={setSort} />
          <SlFilterMenu people={everyone} f={f} onF={setF} count={filterCount} />
          <SlColumnsMenu hidden={cols.hidden} onToggle={cols.toggle} />
          <div className="sl-bar-r">
            {rows.length > size && <Pager offset={offset} limit={size} total={rows.length} unit="people" sizes={picker} onChange={setWanted} />}
            {mayChange && <ContactsMenu campaignId={ctx.campaignId} everyone={rows.map((p) => p.id)} picked={picked} narrowed={!!needle || filterCount > 0} />}
            {mayChange && picked.size > 0 ? (
              <>
                <span className="sl-count t-body-sm">{picked.size} selected</span>
                <button type="button" className="cw-link t-body-sm" onClick={() => setPicked(new Set())}>Clear</button>
                <button type="button" className="sl-btn" onClick={takeOff} title="Take off the shortlist. They stay in Candidates."><MinusCircle size={14} /> Remove</button>
                <button type="button" className="sl-btn" onClick={pass}><Prohibit size={14} /> Reject</button>
                <button type="button" className="sl-btn is-primary" onClick={reach}><PaperPlaneTilt size={14} weight="fill" /> Reach out</button>
              </>
            ) : rows.length > size ? null : (
              <span className="sl-count t-body-sm">{rows.length} {plural(rows.length, "person", "people")}</span>
            )}
          </div>
        </div>
      )}

      {state === "failed" ? (
        <LoadFailed what="This shortlist" onRetry={() => retryPipeline(ctx.campaignId)} />
      ) : <div className="sl-card">
        <div className="sl-scroll" data-pager-list>
          <table className="sl-table">
            <thead>
              <tr>
                <th className="sl-c-check">{mayChange && <input ref={head} type="checkbox" checked={allOn} onChange={() => setPicked((cur) => { const n = new Set(cur); ids.forEach((id) => (allOn ? n.delete(id) : n.add(id))); return n; })} aria-label="Select everyone on this page" />}</th>
                {th("name", "Full name", "sl-c-name")}
                {cols.show("prof") && <th className="sl-c-prof">Profiles</th>}
                {cols.show("email") && <th className="sl-c-email">Email</th>}
                {cols.show("phone") && <th className="sl-c-phone">Phone</th>}
                {cols.show("status") && th("status", "Status", "sl-c-status")}
                {cols.show("owner") && th("owner", "Owner", "sl-c-owner")}
                {cols.show("added") && th("added", "Added", "sl-c-added")}
                {cols.show("role") && th("role", "Current role", "sl-c-role")}
                {cols.show("org") && th("org", "Organization", "sl-c-org")}
              </tr>
            </thead>
            <tbody>
              {state === "loading" ? <ShimmerTableRows rows={9} label="Loading people" cells={shortlistGhost(cols.show)} /> : shown.map((p) => {
                const on = picked.has(p.id);
                const links = profileLinks(p);
                return (
                  <tr key={p.id} className={on ? "is-on" : ""} onClick={(e) => {
                    if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest("button, a, input, label")) return;
                    setOpenId(p.id);
                  }}>
                    <td className="sl-c-check">{mayChange && <input type="checkbox" checked={on} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />}</td>
                    <td className="sl-c-name">
                      <span className="sl-name">
                        <button type="button" className={`sl-star${stars.has(p.id) ? " is-on" : ""}`} onClick={() => star(p.id)} aria-pressed={stars.has(p.id)} aria-label={stars.has(p.id) ? `Unstar ${p.name}` : `Star ${p.name}`}>
                          <Star size={15} weight={stars.has(p.id) ? "fill" : "regular"} />
                        </button>
                        <span className="sl-who">
                          <span className="sl-ell t-body-strong" title={p.name}>{p.name}</span>
                          {p.doNotContact && <span className="sl-dnc cw-muted t-caption">Do not contact</span>}
                        </span>
                      </span>
                    </td>
                    {cols.show("prof") && <td className="sl-c-prof"><SlProfiles links={links} /></td>}
                    {cols.show("email") && <td className="sl-c-email"><ContactValueCell campaignId={ctx.campaignId} id={p.id} candidateId={p.candidateId} name={p.name} kind="email" reach={p.reach} value={p.email?.value} /></td>}
                    {cols.show("phone") && <td className="sl-c-phone"><ContactValueCell campaignId={ctx.campaignId} id={p.id} candidateId={p.candidateId} name={p.name} kind="phone" reach={p.reach} value={p.phone?.value} /></td>}
                    {cols.show("status") && <td className="sl-c-status"><SlStatus p={p} may={mayChange} onMove={(to) => move(p, to)} /></td>}
                    {cols.show("owner") && <td className="sl-c-owner"><span className="sl-owner"><Avatar name={p.owner} hue={hueOf(p.owner)} size={20} /><span className="sl-ell" title={p.owner}>{mine(p) ? "You" : firstName(p.owner)}</span></span></td>}
                    {cols.show("added") && <td className="sl-c-added"><span title={dateAgo(p.capturedAgo).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}>{addedLabel(p.capturedAgo)}</span></td>}
                    {cols.show("role") && <td className="sl-c-role"><span className="sl-ell" title={p.title}>{p.title}</span></td>}
                    {cols.show("org") && <td className="sl-c-org"><span className="sl-org"><OrgLogo company={p.company} /><span className="sl-ell" title={p.company}>{p.company}</span></span></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {state !== "loading" && !rows.length && (
            <div className="sl-none">
              {slEmpty === "passed" ? <EmptyArt name="empty-passed" size={180} /> : <EmptyArt {...listEmptyArt("shortlist", slEmpty === "no-match")} />}
              <p className="t-body-strong">{slEmpty === "passed" ? "No one rejected yet" : everyone.length ? "No one matches" : "No one on the shortlist yet"}</p>
              <p className="t-body-sm">{slEmpty === "passed" ? "People you reject are kept here, and you can bring them back any time." : everyone.length ? "Try a different search, or clear the filters." : "Shortlist people from Candidates or the agent's results and they appear here."}</p>
              {(needle || filterCount > 0) && <button type="button" className="sl-btn" onClick={() => { setQ(""); setF(NO_FILTER); }}>Clear search and filters</button>}
            </div>
          )}
        </div>
      </div>}
      {state !== "failed" && rows.length > size && <Pager offset={offset} limit={size} total={rows.length} unit="people" variant="foot" onChange={setWanted} />}

      <PersonDialog person={open} onClose={() => setOpenId(null)} onMove={(p, s) => move(p, s)} campaignId={resolveCampaignId(ctx.campaignId)} locked={!mayChange} />
      <ConfirmDialog
        open={confirmHired}
        title={hiredPicked.length === 1 ? `Reject ${hiredPicked[0]?.name ?? "this person"}?` : `Reject ${hiredPicked.length} hired people?`}
        body="Rejecting takes hired people off the hired list. The rest you picked are rejected too."
        confirm="Reject anyway"
        danger
        onClose={() => setConfirmHired(false)}
        onConfirm={() => { setConfirmHired(false); askWhy(); }}
      />
      <FirstHireDialog person={firstHire} onClose={() => setFirstHire(null)} />
      <PassReasonDialog
        who={passing ? (passing.length === 1 ? firstName(passing[0]!.name) : `${passing.length} people`) : null}
        note={<LooseEndsNote on={!!passing} campaignId={ctx.campaignId} ccIds={(passing ?? []).map((q) => q.id)} to="passed" />}
        onClose={() => setPassing(null)}
        onPass={(reason) => { const list = passing ?? []; setPassing(null); passNow(list, reason); }}
      />
    </div>
  );
}

function SlProfiles({ links }: { links: readonly ProfileLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const MAX = links.length > 3 ? 2 : 3;
  const more = links.slice(MAX);
  return (
    <span className="sl-prof">
      {links.slice(0, MAX).map((l) => (
        <a key={l.key} href={l.href} target={l.key === "in" || l.key === "gh" || l.key === "web" ? "_blank" : undefined} rel="noreferrer" className="sl-prof-i" title={l.label} aria-label={l.label}>{l.icon}</a>
      ))}
      {more.length > 0 && (
        <>
          <button ref={ref} type="button" className="sl-prof-more" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${more.length} more`}>+{more.length}</button>
          <Popover anchor={ref} open={open} onClose={close} width={240}>
            <div className="sl-menu">
              {more.map((l) => (
                <a key={l.key} href={l.href} target="_blank" rel="noreferrer" className="sl-menu-i" onClick={close}>{l.icon}<span className="sl-ell">{l.label}</span></a>
              ))}
            </div>
          </Popover>
        </>
      )}
    </span>
  );
}

function SlStatus({ p, onMove, may = true }: { p: PipelinePerson; onMove: (to: MoveTo) => void; may?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  /* Every stage of the campaign is on offer, by its own name; moving is by stage, and Hired asks first like anywhere. */
  const stages = useCampaignStages(p.campaign);
  const label = placeLabel(p, stages);
  const at = stageOf(p, stages);
  const tone = stageText(at ?? { kind: p.stage, color: null }, at ? columnsOf(stages).indexOf(at) : undefined);
  /* Someone who only follows the campaign reads where each person is; the word is there, the menu is not. */
  if (!may) return <span {...tone} className={`sl-status ${tone.className}`}><span className="sl-ell">{label}</span></span>;
  return (
    <>
      <button ref={ref} type="button" {...tone} className={`sl-status ${tone.className}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Status: ${label}. Change`}>
        <span className="sl-ell">{label}</span><CaretDown size={11} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={200}>
        <div className="sl-menu" role="menu">
          <p className="sl-menu-h">Move to</p>
          <StageChoices
            p={p} stages={stages} onMove={onMove}
            item={(a) => (
              <button key={a.key} type="button" role="menuitemradio" aria-checked={a.on} className={`sl-menu-i${a.on ? " is-on" : ""}`} onClick={() => { a.run(); close(); }}>
                <span className="sl-ell">{a.label}</span>{a.on && <Check size={13} weight="bold" />}
              </button>
            )}
          />
          <button type="button" role="menuitemradio" aria-checked={p.stage === "passed"} className={`sl-menu-i${p.stage === "passed" ? " is-on" : ""}`} onClick={() => { onMove("passed"); close(); }}>
            <span className="sl-ell">Rejected</span>{p.stage === "passed" && <Check size={13} weight="bold" />}
          </button>
        </div>
      </Popover>
    </>
  );
}

function SlSortMenu({ sort, onSort }: { sort: SlSort; onSort: (s: SlSort) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const cur = SL_SORTS.find((s) => s.sort.key === sort.key && s.sort.dir === sort.dir);
  const colName: Readonly<Record<SlSort["key"], string>> = { added: "Added", name: "Name", fit: "Fit", status: "Status", owner: "Owner", role: "Role", org: "Organization" };
  return (
    <>
      <button ref={ref} type="button" className="sl-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <SortAscending size={14} /> {cur?.label ?? `${colName[sort.key]}, ${sort.dir === 1 ? "ascending" : "descending"}`}<CaretDown size={11} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={200}>
        <div className="sl-menu" role="menu">
          <p className="sl-menu-h">Sort by</p>
          {SL_SORTS.map((s) => {
            const on = s === cur;
            return (
              <button key={s.label} type="button" role="menuitemradio" aria-checked={on} className={`sl-menu-i${on ? " is-on" : ""}`} onClick={() => { onSort(s.sort); close(); }}>
                <span className="sl-ell">{s.label}</span>{on && <Check size={13} weight="bold" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

function SlFilterMenu({ people, f, onF, count }: { people: readonly PipelinePerson[]; f: SlFilter; onF: (f: SlFilter) => void; count: number }) {
  /* The owner names offered here are the signed-in person's when any of their people carry their id. */
  const myName = LIVE ? people.find((p) => isMe(p.ownerId))?.owner : ME;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const owners = [...new Set(people.map((p) => p.owner))].sort();
  const sources = [...new Set(people.map((p) => p.source))].sort();
  const opt = (on: boolean, label: string, fn: () => void) => (
    <button key={label} type="button" className={`sl-fopt${on ? " is-on" : ""}`} onClick={fn} aria-pressed={on}>{on && <Check size={12} weight="bold" />}{label}</button>
  );
  return (
    <>
      <button ref={ref} type="button" className={`sl-btn${count ? " is-set" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FunnelSimple size={14} /> Filter{count > 0 && <span className="sl-btn-n">{count}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={320}>
        <div className="sl-fpanel">
          <p className="sl-fh">Owner</p>
          <div className="sl-fopts">{owners.map((o) => opt(f.owner === o, o === myName ? "You" : o, () => onF({ ...f, owner: f.owner === o ? null : o })))}</div>
          <p className="sl-fh">Source</p>
          <div className="sl-fopts">{sources.map((o) => opt(f.source === o, o, () => onF({ ...f, source: f.source === o ? null : o })))}</div>
          <p className="sl-fh">Contact and intent</p>
          <div className="sl-fopts">
            {opt(f.email, "Has email", () => onF({ ...f, email: !f.email }))}
            {/* Whether someone is open to work is not something the live board knows: offering the filter there
                only empties the table. */}
            {!LIVE && opt(f.open, "Open to work", () => onF({ ...f, open: !f.open }))}
          </div>
          <p className="sl-fh">Status</p>
          <div className="sl-fopts">{STATUS_OPTIONS.map((s) => opt(f.status === s.id, s.label, () => onF({ ...f, status: f.status === s.id ? null : s.id })))}</div>
          <footer className="sl-ffoot">
            <button type="button" className="cw-link t-body-sm" onClick={() => onF(NO_FILTER)} disabled={!count}>Clear all</button>
            <button type="button" className="sl-btn is-primary" onClick={close}>Done</button>
          </footer>
        </div>
      </Popover>
    </>
  );
}

/* ── outreach (a campaign's emails, WhatsApp chats and calls): OutreachPage.tsx ── */

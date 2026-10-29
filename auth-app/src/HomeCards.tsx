import { TaskHover } from "./TaskHover";
import { TaskTitle } from "./TaskTitle";
import {
  ArrowRight, ArrowUpRight, CaretDown, CaretLeft, CaretRight, Lightbulb, PencilSimple, Plus, Pulse, Sparkle, Trash,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LIVE } from "./api/client";
import { EmptyArt } from "./EmptyArt";
import { HomeEmpty } from "./HomeEmpty";
import type { WeekCell } from "./api/home";
import { weekFromHome } from "./api/home";
import type { DayTask } from "./api/tasks";
import { dateInput, dayHeading, dayProgress, endOfDate, endOfDayAhead, endOfToday } from "./api/tasks";
import type { CampaignRow, CampaignStage } from "./campaignsData";
import { CAMPAIGN_ROWS } from "./campaignsData";
import { memberIdOf, memberName, useCampaignRows, useTeam } from "./campaignStore";
import { dueFromText, memberInText } from "./taskText";
import { addTask, editTask, reassignTask, removeTask, setTaskDone, undoRemoveTask, useAssignedTasks, useHomeOverview, useMyTasks } from "./homeStore";
import { Num, useToast } from "./Contacts";
import { dayLabel } from "./schedulesView";
import { initialsOf } from "./ui";
import { StageDonut, StagePop } from "./StageDonut";
import type { StageHue } from "./stageDonut";
import { filledLine, isEmpty, peopleLine, stageHue, stageVar, stagesLine, stagesOf, startLine, waitsOnRequirements } from "./stageDonut";
import { useCan } from "./can";
import { isMe, useSession, visibleCampaigns } from "./roleStore";
import type { Scope } from "./orchestrator";
import type { TaskItem } from "./orchestrator";
import { SCOPED, TASKS, campaignName, isScoped, sourcedFor, stepsFor } from "./orchestrator";
import "./home.css";

/**
 * Home's tiles, in the same bento language as a campaign's Overview: white
 * tiles on a white canvas, a warm hairline, Space Grotesk titles.
 *
 * Tone: the page leads with what went right, frames campaigns by what they
 * need next, and turns the market into opportunities rather than numbers to
 * worry about. Nothing here is red; amber means "could use you", green is
 * kept for wins.
 */

const rowsFor = (scope: Scope): readonly CampaignRow[] =>
  CAMPAIGN_ROWS.filter((r) => (isScoped(scope) ? r.id === scope : r.status !== "closed"));

/* The one way a new campaign starts from Home: the header's button and the empty card's are this. */
export function startNewCampaign() {
  try { sessionStorage.setItem("sh-new-campaign", "1"); } catch { /* falls back to just navigating */ }
  window.location.hash = "#/campaigns";
}

/* The ↗ that opens a tile's full view. Two arrows in a clipped circle: on
   hover the resting one leaves to the top-right while its twin arrives from
   the bottom-left, so the button answers "where does this go" by moving that
   way. */
function GoArrow() {
  return (
    <span className="hm-go-i" aria-hidden="true">
      <ArrowUpRight size={14} weight="regular" />
      <ArrowUpRight size={14} weight="regular" />
    </span>
  );
}

/* One header for every Home tile: title, optional count and note, and the ↗.
   The note sits right, before the ↗, the way `.bx-sub` does on Overview. */
function TileHead({ title, sub, href, count, label }: { title: string; sub?: string; href?: string; count?: number; label?: string }) {
  return (
    <header className="hm-th">
      <h2>{title}{count != null && <span className="hm-n">{count}</span>}</h2>
      {sub && <small>{sub}</small>}
      {href && <a className="hm-th-go" href={href} aria-label={label ?? `Open ${title}`}><GoArrow /></a>}
    </header>
  );
}

/* ── your week: four numbers, each with the context that makes it true ──
   No invented "vs last week" figures: only People found has real history, so
   only it gets a comparison (when it went up) and a small line of its last
   fortnight. Each quarter carries a soft hue of its own in a tiny dot. */

/* The four soft stage hues, used only to tell things apart (a campaign, a
   kind of number), never to signal state. */
const HUES = ["#a596e8", "#78b4ee", "#f3a172", "#7cc191"] as const;
const hueFor = (campaignId: string) => {
  const at = SCOPED.indexOf(campaignId as never);
  return HUES[(at >= 0 ? at : [...campaignId].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)) % HUES.length]!;
};

/* A small line under "People found": the last fourteen days, the latest
   point marked. Real history, the only number on Home that has one. */
function Spark({ data }: { data: readonly number[] }) {
  const W = 64, H = 22, P = 2;
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), span = Math.max(1, max - min);
  const pts = data.map((v, i) => [P + (i * (W - 2 * P)) / (data.length - 1), H - P - ((v - min) / span) * (H - 2 * P)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg className="hm-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={`${d} L${lx.toFixed(1)} ${H} L${P} ${H} Z`} className="hm-spark-a" />
      <path d={d} className="hm-spark-l" />
      <circle cx={lx} cy={ly} r="2.2" className="hm-spark-d" />
    </svg>
  );
}

const CELL_HUE: Readonly<Record<WeekCell["key"], string>> = { hires: HUES[3], replies: HUES[1], iv: HUES[0], found: HUES[2] };

export function WeekCard({ scope }: { scope: Scope }) {
  const home = useHomeOverview(LIVE && isScoped(scope) ? scope : undefined);
  if (LIVE) {
    const cells = home ? weekFromHome(home) : [];
    /* Nothing yet to count (a new workspace, or a quiet week) is one calm card, not four zeros. */
    const quiet = !!home && cells.every((c) => c.n === 0);
    return <WeekTile cells={cells.map((c) => ({ ...c, hue: CELL_HUE[c.key] }))} quiet={quiet} />;
  }
  return <FixtureWeek scope={scope} />;
}

function FixtureWeek({ scope }: { scope: Scope }) {
  const src = sourcedFor(scope);
  const found = src.slice(-7).reduce((a, d) => a + d.n, 0);
  const foundPrev = src.slice(-14, -7).reduce((a, d) => a + d.n, 0);
  const [, contacted, replied, interviews] = stepsFor(scope);
  const rows = rowsFor(scope);
  const hires = rows.reduce((a, r) => a + r.funnel.hired, 0);
  const planned = rows.reduce((a, r) => a + r.target, 0);
  const r = replied?.n ?? 0, iv = interviews?.n ?? 0;
  const up = found - foundPrev;
  const cells = [
    { key: "hires", n: hires, label: "Offers accepted", note: `of ${planned} planned`, hue: HUES[3] },
    { key: "replies", n: r, label: "Replies", note: `from ${contacted?.n ?? 0} contacted`, hue: HUES[1] },
    { key: "iv", n: iv, label: "Moved to interview", note: `from ${r} ${r === 1 ? "reply" : "replies"}`, hue: HUES[0] },
    { key: "found", n: found, label: "People found", note: "in the last 7 days", up, hue: HUES[2], spark: src.slice(-14).map((d) => d.n) },
  ];
  return <WeekTile cells={cells} />;
}

function WeekTile({ cells, quiet = false }: { cells: readonly { key: string; n: number; label: string; note: string; hue: string; up?: number; spark?: readonly number[] }[]; quiet?: boolean }) {
  return (
    <section className="hm-card hm-week">
      <TileHead title="Your week" sub="Last 7 days" href="#/analytics?days=7" label="Open the analytics overview" />
      {quiet ? (
        <HomeEmpty short art="empty-analytics" title="A quiet week so far" line="Replies, interviews and hires show up here as the agent works.">
          <a className="st-link" href="#/agent">Ask the agent</a>
        </HomeEmpty>
      ) : (
      <div className="hm-quad">
        {cells.map((c, i) => (
          <div key={c.key} className="hm-quad-c" style={{ animationDelay: `${120 + i * 40}ms`, ["--hue" as string]: c.hue }}>
            <span className="hm-quad-l">{c.label}</span>
            <span className="hm-quad-v">
              <strong><Num n={c.n} /></strong>
              {c.up && c.up > 0 ? <small><em className="hm-up">+{c.up}</em> vs last week</small> : <small>{c.note}</small>}
              {c.spark && <Spark data={c.spark} />}
            </span>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

/* ── tasks: one thing up next, the rest a quiet checklist ──
   The next task is the tile's hero: a warm card with the one thing you would
   do with it, done in a click. Everything else is a checklist with each
   campaign's hue and a calm day chip. Finishing something is rewarded in
   small, real ways: the check draws in, a few sparks leave the ring, the row
   washes green and slides out, the header ring moves forward and its line
   changes ("Good start", "Halfway there", "Last one", "Day cleared"). */

/* The one "give this to the agent" control on Home. */

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Live answer to a media query (false where matchMedia is missing). */
function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, [q]);
  return on;
}

/* Sets `is-more` on a scroll box while content continues below its fold, so
   the box fades at its foot only when there is something to scroll to. */
function useMoreBelow(box: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => el.classList.toggle("is-more", el.scrollHeight > el.clientHeight + el.scrollTop + 4);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(check);
    mo?.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => { ro.disconnect(); mo?.disconnect(); el.removeEventListener("scroll", check); };
  }, [box]);
}

/* The day's ring: the count done sits inside it, and it glows green for a
   moment when it moves. */
function Ring({ k, n, pop }: { k: number; n: number; pop?: boolean }) {
  const R = 13, C = 2 * Math.PI * R;
  return (
    <span className={`hm-ring${pop ? " is-pop" : ""}${k >= 1 ? " is-full" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <circle cx="16" cy="16" r={R} className="hm-ring-t" />
        <circle cx="16" cy="16" r={R} className="hm-ring-f" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - k) }} />
      </svg>
      <b>{n}</b>
    </span>
  );
}

/* A few sparks leave the check as it fills: six short strokes, once. */
function Burst() {
  return <span className="hm-burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((k) => <i key={k} style={{ ["--a" as string]: `${k * 60 + 15}deg` }} />)}</span>;
}

const CHECK = <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 6.3 5 8.6l4.4-5" /></svg>;

/* tasks the agent can take over */
const AGENT_CAN = /draft|shortlist|send|review|approve/i;

/* "Today", "Tomorrow", then a calm date; older work is "Carried over" */
function dueLabel(d: number | null): string {
  if (d === null) return "No date";
  if (d < 0) return "Carried over";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  const t = new Date(); t.setDate(t.getDate() + d);
  /* The same "Mon 12 Oct" the Scheduled screen uses. */
  return dayLabel(t.getTime());
}

/** A due time in words: "today", "tomorrow", or the day ("Mon 26 Oct"). */
function dueWords(iso: string): string {
  const day = dateInput(iso);
  if (day === dateInput(endOfToday())) return "today";
  if (day === dateInput(endOfDayAhead(1))) return "tomorrow";
  return dayLabel(Date.parse(iso));
}

/** A title short enough to read in a toast; a longer one is cut at a word. */
const short = (title: string): string => (title.length > 36 ? `${title.slice(0, 36).replace(/\s+\S*$/, "")}…` : title);

const fromFixture = (t: TaskItem): DayTask => ({ id: t.id, title: t.title, state: t.state, campaignId: t.campaignId, campaign: campaignName(t.campaignId), dueInDays: t.dueInDays });
/* undated work sorts after everything with a date */
const dueOrder = (d: number | null) => d ?? Number.MAX_SAFE_INTEGER;

export function TodayCard({ scope, onOpen }: { scope: Scope; onOpen: (prompt: string) => void }) {
  const liveTasks = useMyTasks();
  const rows = useCampaignRows();
  const session = useSession();
  /* My tasks are the ones assigned to me, and only those: what I gave to others is listed apart, and never counted here. */
  const mineOnly = (t: DayTask) => !LIVE || !t.assigneeId || !session.userId || t.assigneeId === session.userId;
  const base = (LIVE ? liveTasks.items : TASKS.map(fromFixture)).filter((t) => mineOnly(t) && (!isScoped(scope) || t.campaignId === scope));
  const [added, setAdded] = useState<DayTask[]>([]);
  const mine = [...added, ...base];
  const [fixtureDone, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(base.filter((t) => t.state === "done").map((t) => [t.id, true])));
  const done: Record<string, boolean> = LIVE ? Object.fromEntries(base.map((t) => [t.id, t.state === "done"])) : fixtureDone;
  const [leaving, setLeaving] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /* What was just added, for the quiet follow-up that offers a day and an owner (the words may already have said them). */
  const [follow, setFollow] = useState<{ n: number; id: string | null; title: string; dueAt: string; who: string | null } | null>(null);
  const followSeq = useRef(0);
  const followRef = useRef<HTMLDivElement>(null);
  /* The task being changed in place, and the toast that offers a deleted one back. */
  const [editing, setEditing] = useState<string | null>(null);
  const toast = useToast();
  /* Who a new task is for: yourself unless you pick a teammate. */
  const team = useTeam();
  /* A recruiter hands work to themselves only; the picker and the reassign menu are an admin's. */
  const mayAssign = useCan("task.assignOthers");
  const others = mayAssign ? team.filter((n) => n !== session.name) : [];
  /* What I handed to teammates; for an admin, what everyone has, so they can see who was given what. */
  const admin = session.role === "admin";
  const handed = useAssignedTasks(admin ? "team" : "assigned");
  const assignedRows = (LIVE ? handed.items : [])
    .filter((t) => !isScoped(scope) || t.campaignId === scope)
    .slice()
    .sort((a, b) => dueOrder(a.dueInDays) - dueOrder(b.dueInDays));
  const addRef = useRef<HTMLTextAreaElement>(null);
  /* A task needs nothing but its words: the day and the teammate are read from them when they are there. */
  const said = useMemo(
    () => ({ due: dueFromText(draft), who: others.length ? memberInText(draft, others) : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, others.join("|")],
  );
  /* The box grows with what is typed (up to a few lines) and shrinks back when it is cleared. */
  useLayoutEffect(() => {
    const el = addRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);
  /* The follow-up goes away by itself unless the person is in it. */
  useEffect(() => {
    if (!follow) return undefined;
    const t = window.setTimeout(() => {
      if (followRef.current?.contains(document.activeElement)) return;
      setFollow((f) => (f && f.n === follow.n ? null : f));
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [follow]);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set(["done"]));
  /* Nothing handed to the team yet: the group stays a quiet line until someone opens it. */
  const [handedOpen, setHandedOpen] = useState(false);
  /* Opened at the foot of a list that scrolls, the group's picture and line would sit below the fold:
     bring them into view. */
  useEffect(() => {
    if (!handedOpen) return;
    const t = window.setTimeout(() => card.current?.querySelector(".hm-tl-none")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }), 60);
    return () => window.clearTimeout(t);
  }, [handedOpen]);
  /* overdue first, then today, then ahead; blocked work waits at the end of its day */
  const open = mine.filter((t) => !done[t.id]).sort((a, b) => dueOrder(a.dueInDays) - dueOrder(b.dueInDays) || Number(a.state === "blocked") - Number(b.state === "blocked"));
  const next = open.find((t) => t.state !== "blocked") ?? open[0];
  const rest = open.filter((t) => t !== next);
  /* The day, in plain facts: what was finished today, out of what was due today or is late and what was finished. */
  const day = dayProgress(mine);
  const finished = day.finished;
  const handedEmpty = LIVE && handed.ready && assignedRows.length === 0 && others.length > 0 && open.length > 0;
  /* the reward beat: the ring pops and the header says so, briefly */
  const [cheer, setCheer] = useState<{ left: number; n: number } | null>(null);
  const cheerT = useRef(0);
  useEffect(() => () => { window.clearTimeout(cheerT.current); }, []);
  const card = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useMoreBelow(body);
  const complete = (id: string) => {
    if (leaving) return;
    setLeaving(id);
    const left = open.length - 1;
    /* the finished row or card unmounts, so focus would fall to <body>:
       keep keyboard users in the list, on the row that took its place */
    const had = !!card.current?.contains(document.activeElement);
    const row = rest.findIndex((t) => t.id === id);
    window.setTimeout(() => {
      if (LIVE) setTaskDone(id, true); else setDone((d) => ({ ...d, [id]: true }));
      setLeaving(null);
      /* the words are the reward, not the motion: they show either way */
      setCheer((c) => ({ left, n: (c?.n ?? 0) + 1 }));
      window.clearTimeout(cheerT.current);
      cheerT.current = window.setTimeout(() => setCheer(null), 1800);
      if (had) {
        requestAnimationFrame(() => {
          const el = card.current;
          if (!el) return;
          const checks = [...el.querySelectorAll<HTMLElement>(".hm-today-b .hm-list .hm-check")];
          const to = (row >= 0 ? checks[row] ?? checks[row - 1] : undefined)
            ?? el.querySelector<HTMLElement>(".hm-next-done") ?? checks[0] ?? el.querySelector<HTMLElement>(".hm-done-h, .hm-add textarea");
          to?.focus({ preventScroll: true });
        });
      }
    }, reducedMotion() ? 120 : 520);
  };
  const undo = (id: string) => (LIVE ? setTaskDone(id, false) : setDone((d) => ({ ...d, [id]: false })));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.replace(/\s+/g, " ").trim();
    if (!title) return;
    const dueAt = said.due?.dueAt ?? endOfToday();
    const who = said.who;
    if (LIVE) {
      const row = isScoped(scope) ? rows.find((r) => r.id === scope) : undefined;
      const n = ++followSeq.current;
      setFollow({ n, id: null, title, dueAt, who });
      addTask(title, row ? { id: row.id, name: row.name } : null, who ? memberIdOf(who) : undefined, dueAt, who ?? undefined)
        .then((id) => setFollow((f) => (f && f.n === n ? (id ? { ...f, id } : null) : f)));
    } else {
      const camp = isScoped(scope) ? scope : "backend-snr";
      const ahead = Math.max(0, Math.round((Date.parse(dueAt) - Date.now()) / 86_400_000));
      setAdded((a) => [{ id: `u-${Date.now()}`, title, state: "todo", campaignId: camp, campaign: campaignName(camp), dueInDays: ahead }, ...a]);
    }
    setDraft("");
  };
  /* The follow-up changes the task just added: its day, or who it is for. */
  const followDay = (day: string) => {
    const at = endOfDate(day);
    if (!follow?.id || !at) return;
    editTask(follow.id, { dueAt: at });
    setFollow({ ...follow, dueAt: at });
  };
  const followWho = (name: string) => {
    if (!follow?.id || !name) return;
    const id = memberIdOf(name);
    if (!id) return;
    reassignTask(follow.id, id, name);
    setFollow({ ...follow, who: name === session.name ? null : name });
  };
  /* Deleting is quiet and can be taken back: the task leaves the list and a toast offers it again. */
  const remove = (t: DayTask) => {
    if (!removeTask(t.id)) return;
    toast(`Deleted “${short(t.title)}”`, "done", { label: "Undo", onClick: () => undoRemoveTask(t.id) });
  };
  const k = day.total ? Math.min(1, day.finished / day.total) : 0;
  const groups = [
    { id: "today", title: "Today", items: open.filter((t) => t.dueInDays !== null && t.dueInDays <= 0) },
    { id: "later", title: "Later", items: open.filter((t) => t.dueInDays === null || t.dueInDays > 0) },
    { id: "assigned", title: admin ? "Team tasks" : "Assigned to others", items: assignedRows },
    { id: "done", title: "Done", items: mine.filter((t) => done[t.id]) },
  ];
  /* The team's tasks arrive on their own request: until they do, "all clear" would be a guess. */
  const waiting = LIVE && !handed.ready;
  /* With nothing of mine at all there is no progress to report, so the header says nothing
     (no "0 of 0 done" and a ring on zero) and the body says it once: all clear. */
  const hasDay = day.total > 0;
  return (
    <section ref={card} className="hm-card hm-today">
      <header className="hm-th">
        <h2>My tasks</h2>
        {hasDay && (
          <span className={`hm-prog${cheer ? " is-cheer" : ""}${k >= 1 ? " is-full" : ""}`}>
            <small aria-live="polite"><b>{dayHeading(day)}</b></small>
            <Ring key={cheer?.n ?? 0} k={k} n={finished} pop={!!cheer && !reducedMotion()} />
          </span>
        )}
        <button type="button" className="hm-th-go" onClick={() => onOpen("Show all my tasks across campaigns")} aria-label="Open all tasks with the agent"><GoArrow /></button>
      </header>

      <div ref={body} className="hm-today-b hm-tl" aria-busy={waiting || undefined}>
        {open.length === 0 && assignedRows.length === 0 && !waiting && (
          /* The header already says "All done for today" when there were tasks and they are done: the headline does not say it again. */
          <HomeEmpty
            art="empty-tasks"
            title={hasDay ? "Enjoy the quiet" : "All clear for today"}
            line={hasDay ? "New tasks will land here." : "Enjoy the quiet. New tasks will land here."}
          >
            <button type="button" className="st-link" onClick={() => onOpen("What needs my attention across my campaigns today?")}>Ask the agent</button>
          </HomeEmpty>
        )}
        {(open.length > 0 || assignedRows.length > 0) && (
          <div className="hm-tl-cols" aria-hidden="true">
            <span />
            <span>Task</span>
            <span className="hm-tl-c-camp">Campaign</span>
            <span className="hm-tl-c-st">Status</span>
            <span>Due</span>
          </div>
        )}
        {groups.map((g) => {
          const none = g.id === "assigned" && g.items.length === 0;
          const closed = none ? !handedOpen : folded.has(g.id);
          return (g.items.length > 0 || (none && handedEmpty)) && (
          <section key={g.id} className={`hm-tl-g is-${g.id}`}>
            <header className="hm-tl-gh">
              <button type="button" className="hm-tl-gt" aria-expanded={!closed} onClick={() => (none ? setHandedOpen((o) => !o) : setFolded((f) => { const n = new Set(f); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; }))}>
                <i className="hm-tl-dot" aria-hidden="true" />
                <span>{g.title}</span>
                <em>{g.items.length}</em>
                <CaretDown className="hm-tl-caret" size={11} weight="bold" aria-hidden="true" />
              </button>
              {g.id !== "done" && (
                <button type="button" className="hm-tl-add" onClick={() => addRef.current?.focus()} aria-label={`Add a task to ${g.title}`} title="Add a task"><Plus size={12} weight="bold" /></button>
              )}
            </header>
            {none && !closed && (
              <div className="hm-tl-none">
                <EmptyArt name="empty-tasks-delegated" size={88} />
                <p>You haven't handed anything to your team yet.</p>
              </div>
            )}
            {!none && !closed && g.id === "assigned" && (
              <ul className="hm-tl-rows is-assigned">
                {g.items.map((t) => {
                  const st = t.state === "blocked" ? { l: "Waiting", c: "is-wait" } : t.state === "doing" ? { l: "In progress", c: "is-doing" } : { l: "To do", c: "is-todo" };
                  const mayMove = admin || isMe(t.createdById);
                  return (
                    <TaskHover key={t.id} task={t} style={{ ["--hue" as string]: t.campaignId ? hueFor(t.campaignId) : undefined }}>
                      <span className="hm-tl-av" aria-hidden="true">{initialsOf(t.assigneeName)}</span>
                      {t.open
                        ? <TaskTitle className="hm-tl-t" href={t.open}>{t.title}</TaskTitle>
                        : <TaskTitle className="hm-tl-t is-plain" plain>{t.title}</TaskTitle>}
                      <span className="hm-tl-camp">
                        <b className="hm-tl-who">{t.assigneeName ?? "A teammate"}</b>
                        <small className="hm-tl-for">{[t.campaign, admin && t.createdByName && !isMe(t.createdById) ? `by ${t.createdByName}` : null].filter(Boolean).join(" · ")}</small>
                      </span>
                      <span className={`hm-tl-st ${st.c}`}>{st.l}</span>
                      <span className={`hm-tl-due${t.dueInDays !== null && t.dueInDays < 0 ? " is-carried" : ""}`}>
                        {dueLabel(t.dueInDays)}
                        {mayMove && mayAssign && team.length > 1 && (
                          <select className="hm-tl-reassign" value="" onChange={(e) => { const id = memberIdOf(e.target.value); if (id) reassignTask(t.id, id, e.target.value); }} aria-label={`Reassign "${t.title}"`} title="Reassign">
                            <option value="">Reassign</option>
                            {team.filter((n) => n !== t.assigneeName).map((n) => <option key={n} value={n}>To {n}</option>)}
                          </select>
                        )}
                      </span>
                    </TaskHover>
                  );
                })}
              </ul>
            )}
            {!closed && g.id !== "assigned" && (
              <ul className="hm-tl-rows">
                {g.items.map((t) => {
                  const isDone = !!done[t.id];
                  const st = isDone ? { l: "Done", c: "is-done" } : t.state === "blocked" ? { l: "Waiting", c: "is-wait" } : t.state === "doing" ? { l: "In progress", c: "is-doing" } : { l: "To do", c: "is-todo" };
                  return (
                    <TaskHover key={t.id} task={t} disabled={editing === t.id || leaving === t.id} className={`${leaving === t.id ? "is-leaving" : ""}${isDone ? " is-done" : ""}`} style={{ ["--hue" as string]: t.campaignId ? hueFor(t.campaignId) : undefined }}>
                      {isDone
                        ? <button type="button" className="hm-check is-on" onClick={() => undo(t.id)} aria-label={`Mark "${t.title}" as not done`}>{CHECK}</button>
                        : <button type="button" className="hm-check" onClick={() => complete(t.id)} aria-label={`Mark "${t.title}" as done`}>{CHECK}{leaving === t.id && <Burst />}</button>}
                      {t.open
                        ? <TaskTitle className="hm-tl-t" href={t.open}>{t.title}</TaskTitle>
                        : <TaskTitle className="hm-tl-t" onClick={() => onOpen(t.title)}>{t.title}</TaskTitle>}
                      <span className="hm-tl-camp">
                        {t.campaign && <i aria-hidden="true" />}{t.campaign ?? "No campaign"}
                        {t.assigneeId && !isMe(t.assigneeId) && <small className="hm-tl-for"> · for {memberName(t.assigneeId) ?? "a teammate"}</small>}
                      </span>
                      <span className={`hm-tl-st ${st.c}`}>
                        {st.l}
                        {t.progress && !isDone && t.progress.done > 0 && <small className="hm-tl-n">{t.progress.done}/{t.progress.total}</small>}
                      </span>
                      <span className={`hm-tl-due${t.dueInDays !== null && t.dueInDays < 0 && !isDone ? " is-carried" : ""}`}>
                        {isDone ? "" : dueLabel(t.dueInDays)}
                        {!isDone && AGENT_CAN.test(t.title) && (
                          <button type="button" className="hm-tl-hand" onClick={() => onOpen(`Take this over: ${t.title}`)} aria-label={`Hand "${t.title}" to the agent`} title="Hand to agent"><Sparkle size={12} weight="fill" /></button>
                        )}
                        {LIVE && t.removable && !isDone && (
                          <button type="button" className="hm-tl-hand" onClick={() => setEditing(t.id)} aria-label={`Edit "${t.title}"`} title="Edit task"><PencilSimple size={12} /></button>
                        )}
                        {LIVE && t.removable && (
                          <button type="button" className="hm-tl-hand" onClick={() => remove(t)} aria-label={`Delete "${t.title}"`} title="Delete task"><Trash size={12} /></button>
                        )}
                      </span>
                      {editing === t.id && <EditTask task={t} onClose={() => setEditing(null)} />}
                    </TaskHover>
                  );
                })}
              </ul>
            )}
          </section>
          );
        })}
      </div>

      <form className="hm-add" onSubmit={add}>
        <Plus size={14} weight="bold" />
        <textarea
          ref={addRef} rows={2} value={draft} maxLength={300} aria-label="Add a task"
          placeholder="Add a task. Say the day or a teammate in it, like “Dev to send the BD list by Monday”"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            /* Enter adds the task; Shift+Enter is a new line. */
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
          }}
        />
        <button type="submit" className={`hm-add-go${draft.trim() ? " is-on" : ""}`} aria-label="Add task" title="Add task (Enter)">↵</button>
        {(said.due || said.who) && draft.trim() && (
          <p className="hm-add-hint">{[said.due ? `Due ${dueWords(said.due.dueAt)}` : "", said.who ? `for ${said.who}` : ""].filter(Boolean).join(" · ")}</p>
        )}
      </form>
      {follow && (
        <div className="hm-follow" ref={followRef} role="status">
          <span className="hm-follow-t">Added “{short(follow.title)}” · due {dueWords(follow.dueAt)} · {follow.who ? `for ${follow.who}` : "for you"}</span>
          <label className="hm-follow-f">
            <span>Day</span>
            <input type="date" value={dateInput(follow.dueAt)} min={dateInput(endOfToday())} disabled={!follow.id} onChange={(e) => followDay(e.target.value)} aria-label="Change the day" />
          </label>
          {(others.length > 0 || follow.who) && (
            <label className="hm-follow-f">
              <span>For</span>
              <select value="" disabled={!follow.id} onChange={(e) => followWho(e.target.value)} aria-label="Change who it is for">
                <option value="">{follow.who ?? "Me"}</option>
                {[...(follow.who ? [session.name] : []), ...others.filter((n) => n !== follow.who)].map((n) => <option key={n} value={n}>{n === session.name ? "Me" : n}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="hm-follow-x" onClick={() => setFollow(null)} aria-label="Done">Done</button>
        </div>
      )}
    </section>
  );
}

/** A task's words and day, changed in place: small and quiet, saved with Enter, left with Escape. */
function EditTask({ task, onClose }: { task: DayTask; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [day, setDay] = useState(task.dueAt ? dateInput(task.dueAt) : "");
  const first = dateInput(task.dueAt ?? "");
  const words = title.trim();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!words) return;
    const patch: { title?: string; dueAt?: string | null } = {};
    if (words !== task.title) patch.title = words;
    if (day !== first) patch.dueAt = day ? endOfDate(day) : null;
    if (patch.dueAt === null && day) return;
    if (Object.keys(patch).length) editTask(task.id, patch);
    onClose();
  };
  return (
    <form className="hm-tl-edit" onSubmit={save} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} aria-label="Task" autoFocus />
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Due date" />
      <button type="button" className="hm-tl-edit-x" onClick={onClose}>Cancel</button>
      <button type="submit" className="hm-tl-edit-ok" disabled={!words}>Save</button>
    </form>
  );
}

/* ── active campaigns: a bento of tiles ──
   The five latest campaigns (latestFirst) are tiles of a six-column bento, the most recent in the biggest tile with a
   warm wash. How many there are decides the shapes (bentoPlan: one whole-card tile, two halves, a pinwheel of
   five...), and the size of each tile decides what it says (tileRows): the ring and the name always, then in order
   the slim hires bar, the progress rows (one per funnel step reached: found, shortlisted, contacted, replied,
   interviewing, a bar as long as its share of the most), the hires in
   words, what waits on a person, the client, when it last moved. A small tile drops the last ones first and never
   clips; a big one has room for all of them and a big ring. Each fact is said once per tile. Resting on a tile (or
   tabbing to it, or tapping its ring on a touch screen) opens the card of stage counts. A campaign nobody is in yet
   is a faint ring with a gentle 0 and one quiet line under its name (startLine); when all of them are like that, one
   calm hint under the grid says what starts them. The rest fold into one quiet "+N more" line that opens the
   Campaigns page, so nothing hides behind a scroll. */

/** Six columns (two to a half, three to a third), this far apart (home.css), a tile's padding, and the space between its ring and its words. */
const COLS = 6;
const GAP = 12;
const PAD = 14;
const SPACE = 6;
/** The most tiles the card shows: the rest are "+N more". */
export const MAX_TILES = 5;
/** The least a row of tiles is tall (a mini tile holds a ring, a two-line name, a line and a bar), and where the card is not fitted to one screen (stacked below 1241px, short windows) how tall: it grows with the page. */
const MIN_ROW = 140;
const STACKED_ROW = 150;
/** The "+N more / View all" line under the tiles, and the gap above it. */
const MORE = 52;

/** One tile: the grid line it starts at, and how many columns and rows it spans (1-based, as CSS counts them). */
export type BentoTile = { col: number; row: number; c: number; r: number };
export type BentoPlan = { tiles: BentoTile[]; rows: number; hidden: number };
type Spec = readonly (readonly [number, number, number, number])[];

/* Where the tiles go, for each number of campaigns, in recency order: the first is the biggest. Every plan fills its grid
   exactly (six columns, three rows or two), with no gap and no overlap. [column, row, columns, rows]. */
const PLAN_3: Readonly<Record<number, Spec>> = {
  1: [[1, 1, 6, 3]],
  2: [[1, 1, 3, 3], [4, 1, 3, 3]],
  3: [[3, 2, 4, 2], [1, 1, 2, 3], [3, 1, 4, 1]],
  4: [[3, 2, 4, 2], [1, 1, 2, 3], [3, 1, 2, 1], [5, 1, 2, 1]],
  5: [[3, 2, 4, 2], [1, 1, 2, 2], [3, 1, 2, 1], [5, 1, 2, 1], [1, 3, 2, 1]],
};
const PLAN_2: Readonly<Record<number, Spec>> = {
  1: [[1, 1, 6, 2]],
  2: [[1, 1, 3, 2], [4, 1, 3, 2]],
  3: [[1, 1, 4, 2], [5, 1, 2, 1], [5, 2, 2, 1]],
  4: [[3, 1, 4, 1], [1, 1, 2, 2], [3, 2, 2, 1], [5, 2, 2, 1]],
  5: [[1, 1, 4, 1], [5, 1, 2, 1], [1, 2, 2, 1], [3, 2, 2, 1], [5, 2, 2, 1]],
};

/**
 * Where `count` campaigns' tiles go in a bento of `rowsFit` rows (3 or 2): their places in recency order, how many rows
 * the grid has, and how many campaigns are left out ("+N more", beyond MAX_TILES). Nothing for no campaigns.
 */
export function bentoPlan(count: number, rowsFit: 2 | 3): BentoPlan {
  const n = Math.max(0, Math.floor(count));
  const shown = Math.min(n, MAX_TILES);
  const spec = (rowsFit === 2 ? PLAN_2 : PLAN_3)[shown] ?? [];
  return { tiles: spec.map(([col, row, c, r]) => ({ col, row, c, r })), rows: shown ? rowsFit : 0, hidden: n - shown };
}

/**
 * How many rows of tiles the card has room for in `room` px (the list's own height): three when each of them can be at
 * least MIN_ROW tall (with the "+N more" line under them when some are left out), else two. Three where the card is
 * not fitted to one screen (`room` null): it grows with the page.
 */
export function bentoRowsFit(count: number, room: number | null): 2 | 3 {
  if (room == null) return 3;
  return room - (count > MAX_TILES ? MORE : 0) >= 3 * MIN_ROW + 2 * GAP ? 3 : 2;
}

/** The campaigns, the one that moved last first. Rows without a date keep their order, after the ones with one. */
export function latestFirst<T extends { updatedAt?: string }>(rows: readonly T[]): T[] {
  const at = (r: T) => (r.updatedAt ? Date.parse(r.updatedAt) : NaN);
  const dated = rows.filter((r) => !Number.isNaN(at(r))).sort((a, b) => at(b) - at(a));
  return [...dated, ...rows.filter((r) => Number.isNaN(at(r)))];
}

export type BentoKind = "hero" | "tall" | "wide" | "mini";
/** A tile's kind by its shape: hero (half the card or more, two rows or more), tall (a narrow column), wide (a strip), mini. */
export function bentoKind(t: BentoTile): BentoKind {
  return t.c >= 3 && t.r >= 2 ? "hero" : t.r >= 2 ? "tall" : t.c >= 3 ? "wide" : "mini";
}

/* How large the ring is drawn in each kind of tile (the least, and the most). */
const RING: Readonly<Record<BentoKind, readonly [number, number]>> = { mini: [44, 60], wide: [56, 80], tall: [64, 120], hero: [88, 200] };
/* What a tile's rows take, in px: the name (two lines, the hero's in the title type), a line (a caption and its gap), the slim bar and the space above it, the first row of the pipeline (with the space above it) and each one after. */
const NAME_H: Readonly<Record<BentoKind, number>> = { mini: 32, wide: 32, tall: 32, hero: 48 };
const LINE = 18;
const BAR = 10;
const PIPE_FIRST = 28;
const PIPE_ROW = 20;
const MAX_PIPE = 6;
/* A big tile hangs its words in three groups, 8px apart: the name and client, the progress rows, and the hires bar with what waits and when it moved. The first row of the last group pays for that gap. */
const BAR_RICH = 6;
const GROUP_GAP = 8;
/* The most a progress row grows when the tile has height to spare, the least room a text column beside the ring needs. */
const MAX_EXTRA = 18;
const TEXT_BESIDE = 230;

/** What a campaign has to say, as far as the room it gets matters: nobody in it yet, how many progress rows it has (funnel steps or stages), a hires target, how long its "needs" line is (0: none), a client, a last-moved phrase. */
export type TileHave = { empty: boolean; stages: number; bar: boolean; need: number; client: boolean; updated: boolean };
export const FULL_HAVE: TileHave = { empty: false, stages: MAX_PIPE, bar: true, need: 30, client: true, updated: true };

/** What a tile shows, and how large its ring is. `caption` is the one quiet line (the tile's headline when the progress rows are not there), `pipe` how many progress rows. */
export type TileShow = {
  ring: number; beside: boolean; caption: boolean; bar: boolean; pipe: number; hires: boolean; need: boolean; client: boolean; updated: boolean;
  /** The px the rows take (the name included, the spare height spent on the progress rows too) and the px the tile has for them (beside the ring, or under it with the ring's own height and gap taken off). */
  used: number; room: number;
  /** The height the progress rows grow by when the tile has more than it needs (each row, px), and the slim bars' thickness then. */
  extra: number; barPx: number;
  /** The px the tile's content spans, the ring included when it is above the rows. */
  filled: number;
};

/**
 * What a tile of this shape and size has room to say, from its pixel size (a column is `colW` wide, a row `rowH` tall)
 * and what its campaign has to say (`have`). Rows are taken in order of importance while they fit: the name and the ring
 * (always), the slim hires bar, the pipeline's first two stages, the hires in words, the third stage, what waits on a
 * person, the fourth, the client, the fifth, when it last moved. A small tile ends up with the first few and never
 * clips; whatever room is left grows the ring up to its kind's most. A tile for a strip or the whole card puts the ring
 * beside the rows, not above them.
 */
export function tileRows(t: BentoTile, colW: number, rowH: number, have: TileHave): TileShow {
  const kind = bentoKind(t);
  const w = t.c * colW + (t.c - 1) * GAP - 2 * PAD;
  const h = t.r * rowH + (t.r - 1) * GAP - 2 * PAD;
  const beside = kind === "wide" || t.c === COLS;
  const [lo, hi] = RING[kind];
  const rich = kind === "hero" || kind === "tall";
  let free = h - NAME_H[kind] - (beside ? 0 : SPACE + lo);
  const free0 = free;
  /* The first row that does not fit closes the list: a lower one never shows without the ones above it. */
  let closed = false;
  const take = (cost: number, ok = true): boolean => {
    if (!ok || closed) return false;
    if (cost <= free) { free -= cost; return true; }
    closed = true;
    return false;
  };
  const needLines = Math.min(2, Math.ceil((have.need * 6.4) / Math.max(1, w)));
  const show = { caption: false, bar: false, pipe: 0, hires: false, need: false, client: false, updated: false };
  if (!rich) {
    // A strip or a small tile: one line (what waits on a person, else where its people are or what it has made), the bar, and for the strip the client.
    if (kind === "wide") {
      show.bar = take(BAR, have.bar);
      show.caption = take(LINE);
      show.client = take(LINE, have.client);
    } else {
      show.caption = take(LINE);
      show.bar = take(BAR, have.bar);
    }
  } else if (have.empty) {
    show.caption = take(LINE);
    show.client = take(LINE, have.client);
  } else {
    // A big tile: the progress rows between the name and the hires, what waits and when it moved (three groups, GROUP_GAP apart).
    let bottom = false;
    const low = (cost: number, ok = true): boolean => {
      if (!ok) return false;
      if (!take(cost + (bottom ? 0 : GROUP_GAP))) return false;
      bottom = true;
      return true;
    };
    show.bar = low(BAR_RICH, have.bar);
    const row = (k: number) => {
      if (have.stages >= k && show.pipe === k - 1 && take(k === 1 ? PIPE_FIRST : PIPE_ROW)) show.pipe = k;
    };
    row(1); row(2);
    show.hires = low(LINE, have.bar);
    row(3);
    show.need = low(2 + 16 * needLines, have.need > 0);
    row(4);
    show.client = take(LINE, have.client);
    row(5);
    row(MAX_PIPE);
    show.updated = low(LINE, have.updated && kind === "hero");
    // Not even one stage fitted (or the people are all hired and the bar says it): say where they are in a line instead.
    if (show.pipe === 0 && (have.stages > 0 || !have.bar) && LINE <= free) { free -= LINE; show.caption = true; }
  }
  // Room left over goes to the ring first (up to its kind's most), then to the progress rows, which grow taller with thicker bars.
  const ring = beside
    ? Math.max(lo, Math.min(hi, h, Math.max(Math.floor(w * 0.4), w - 18 - TEXT_BESIDE)))
    : Math.max(lo, Math.min(hi, w, lo + free));
  const spare = beside ? free : free - (ring - lo);
  const extra = rich && show.pipe > 0 ? Math.max(0, Math.min(MAX_EXTRA, Math.floor((spare - 4) / show.pipe))) : 0;
  const barPx = extra >= 12 ? 8 : extra >= 6 ? 6 : 4;
  const used = NAME_H[kind] + free0 - free + extra * show.pipe + (show.bar ? barPx - 4 : 0);
  return { ring, beside, ...show, used, room: h - (beside ? 0 : SPACE + ring), extra, barPx, filled: (beside ? 0 : SPACE + ring) + used };
}

/** How large the ring is in `t` when its campaign has everything to say: as large as the tile allows, within its kind's range. */
export const tileRing = (t: BentoTile, colW: number, rowH: number): number => tileRows(t, colW, rowH, FULL_HAVE).ring;

type Fit = { rows: 2 | 3; colW: number; rowH: number };
const FIT: Fit = { rows: 3, colW: 90, rowH: STACKED_ROW };

/* How many rows of tiles fit the card on a one-screen desktop (3 where it grows with the page), and how large a column
   and a row are, for the tiles. Measured again whenever the card is resized. */
function useFit(list: React.RefObject<HTMLUListElement | null>, n: number): Fit {
  const [fit, setFit] = useState<Fit>(FIT);
  useEffect(() => {
    const ul = list.current;
    if (!ul || typeof ResizeObserver === "undefined" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(min-width: 1241px) and (min-height: 680px)");
    const measure = () => {
      const cs = getComputedStyle(ul);
      const inner = ul.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const colW = Math.max(0, Math.floor((inner - (COLS - 1) * GAP) / COLS));
      const room = mq.matches ? ul.clientHeight : null;
      const rows = bentoRowsFit(n, room);
      const plan = bentoPlan(n, rows);
      const rowH = room == null ? STACKED_ROW : Math.max(96, Math.floor((room - (plan.hidden ? MORE : 0) - (plan.rows - 1) * GAP) / Math.max(1, plan.rows)));
      setFit((f) => (f.rows === rows && f.colW === colW && f.rowH === rowH ? f : { rows, colW, rowH }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    mq.addEventListener?.("change", measure);
    measure();
    return () => { ro.disconnect(); mq.removeEventListener?.("change", measure); };
  }, [list, n]);
  return fit;
}

/** How long a mouse rests on a tile before its card opens, so skimming down the list stays still. */
const REST_MS = 140;

/** One row of a tile's progress: a funnel step or a stage, its people, its colour (null: the quiet ink), and how soon it goes when the tile is short (0 stays longest). */
export type ProgressRow = { id: string; name: string; count: number; hue: StageHue | null; keep: number };
const FUNNEL = [
  { id: "found", name: "Found", kind: null },
  { id: "shortlisted", name: "Shortlisted", kind: "shortlisted" },
  { id: "outreach", name: "Contacted", kind: "outreach" },
  { id: "replied", name: "Replied", kind: "outreach" },
  { id: "interviewing", name: "Interviewing", kind: "interviewing" },
  { id: "hired", name: "Hired", kind: "hired" },
] as const;

/** The rows of a tile's progress, in the order they are drawn, and the count its bars are measured against (the most of any). */
export function progressRows(r: Pick<CampaignRow, "reached">, stages: readonly CampaignStage[], empty: boolean, hiresBar: boolean): { pipe: ProgressRow[]; pipeMax: number } {
  if (empty) return { pipe: [], pipeMax: 1 };
  if (r.reached) {
    const reached = r.reached;
    const steps = FUNNEL.filter((f) => !(hiresBar && f.id === "hired")).map((f) => ({ ...f, count: reached[f.id] }));
    const last = steps.reduce((at, x, i) => (x.count > 0 ? i : at), 0);
    const pipe = steps
      .map((x, i) => ({ id: x.id, name: x.name, count: x.count, hue: x.kind ? stageHue({ kind: x.kind, color: null }) : null, keep: i === last ? 0 : i === 0 ? 1 : 2 + i }))
      .filter((x, i) => i === 0 || x.count > 0);
    return { pipe, pipeMax: Math.max(1, ...pipe.map((x) => x.count)) };
  }
  const have = stages.map((s, k) => ({ s, k })).filter(({ s }) => s.count > 0 && s.kind !== "passed" && !(hiresBar && s.kind === "hired"));
  const order = [...have].sort((a, b) => b.s.count - a.s.count).map((x) => x.s.id);
  return {
    pipe: have.map(({ s, k }) => ({ id: s.id, name: s.name, count: s.count, hue: stageHue(s, k), keep: order.indexOf(s.id) })),
    pipeMax: Math.max(1, ...have.map(({ s }) => s.count)),
  };
}

/** The rows that fit `n`: the ones that stay longest, in the order they are drawn. */
const topRows = (pipe: readonly ProgressRow[], n: number): ProgressRow[] =>
  pipe.length <= n ? [...pipe] : [...pipe].sort((a, b) => a.keep - b.keep).slice(0, n).sort((a, b) => pipe.indexOf(a) - pipe.indexOf(b));

/** What a campaign says about itself, once: its stages, whether anyone is in it, how far its hires are, the line under its name. */
export function factsOf(r: CampaignRow) {
  const stages = stagesOf(r);
  /* Nobody yet: no card to open (the line under the name says it), just the faint ring. */
  const empty = isEmpty(stages);
  const h = r.hires ?? { count: r.funnel.hired, target: r.target };
  /* A campaign whose hires reached its target says so ("Filled · 2 hired"), as its row on Campaigns does. */
  const filled = empty ? null : filledLine(h);
  /* A ring with people in it always says where they are ("1 shortlisted"): a number alone is a puzzle. */
  const caption = empty ? startLine(r) : filled ?? peopleLine(stages);
  /* What waits on a person leads a tile's line, in the brand's text colour; an empty campaign's own line already says a missing spec. */
  const need = r.needs && !(empty && waitsOnRequirements(r.needs)) ? r.needs : null;
  /* How far its hires are: a slim bar and its words. No target, no bar. */
  const prog = empty || !h.target ? null : { pct: Math.min(1, h.count / h.target), text: filled ?? `${h.count} of ${h.target} hired` };
  /* How far people got, one row per funnel step reached (found, shortlisted, contacted, replied, interviewing, in the colour of
     its kind; the hires bar has the hired when it is there). A row without the server's numbers (fixtures, an older server)
     is each stage with people in it, in the colour its ring arc has. `keep` ranks which rows stay when there is little room:
     the last step reached, Found, then the rest in order. */
  const { pipe, pipeMax } = progressRows(r, stages, empty, !!prog);
  const updated = r.updatedAgo ? `Updated ${r.updatedAgo.charAt(0).toLowerCase()}${r.updatedAgo.slice(1)}` : null;
  return { stages, empty, filled, caption, client: r.client ?? null, need, line: need ?? caption, prog, pipe, pipeMax, updated };
}

/** What a campaign has to say, for tileRows. */
export const haveOf = (f: ReturnType<typeof factsOf>): TileHave => ({
  empty: f.empty, stages: f.pipe.length, bar: !!f.prog, need: f.need?.length ?? 0, client: !!f.client, updated: !!f.updated,
});

const barStyle = (m: string, w: number, d: number) => ({ "--m": m, "--w": w, "--d": `${d}ms` }) as React.CSSProperties;

export function CampaignItem({ r, i, tile, show, onOpen }: {
  r: CampaignRow; i: number; tile: BentoTile; show: TileShow; onOpen: (r: CampaignRow) => void;
}) {
  const { stages, empty, caption, client, need, line, prog, pipe, pipeMax, updated } = factsOf(r);
  const kind = bentoKind(tile);
  const rich = kind === "hero" || kind === "tall";
  const rows = topRows(pipe, show.pipe);
  const delay = 240 + i * 40;
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLButtonElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pointer = useRef("mouse");
  const rest = (on: boolean) => {
    window.clearTimeout(timer.current);
    if (on && !empty) timer.current = window.setTimeout(() => setOpen(true), REST_MS);
    else setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  /* While the card is up it goes away on Escape, on scrolling or resizing (it is fixed to where the tile was), and
     on a touch outside the tile. */
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const away = (e: PointerEvent) => { if (!row.current?.contains(e.target as Node)) close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);
  /* A mouse opens it by resting on the tile, a keyboard by landing on it. A finger has no resting: its first tap on
     the ring opens the card instead of the campaign, and the next tap (or a tap on the name) opens the campaign. */
  const tapRing = (e: React.MouseEvent) => {
    if (empty || pointer.current !== "touch" || open) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  /* The headline line: a small tile and a strip say what waits on a person, else their hires or where their people are; a big one's rows say the rest. */
  const headline = rich ? line : need ?? (kind === "wide" && prog ? prog.text : caption);
  const hasLow = !empty && (show.hires || show.bar) || (show.need && !!need && !(show.caption && !empty)) || (show.updated && !!updated);
  const hiresBar = prog && show.bar && <i className="hm-cl-bar" aria-hidden="true" style={barStyle("var(--stage-green)", prog.pct, delay + 120)} />;
  return (
    <li
      className={`is-${kind}${tile.c === COLS ? " is-full" : tile.c === 3 && tile.r >= 2 ? " is-half" : ""}${i === 0 ? " is-first" : ""}`}
      style={{ gridColumn: `${tile.col} / span ${tile.c}`, gridRow: `${tile.row} / span ${tile.r}`, animationDelay: `${160 + i * 40}ms` }}
    >
      <button
        ref={row} type="button" onClick={() => onOpen(r)}
        aria-label={`${r.name}${client ? `, ${client}` : ""}, ${empty ? caption : `${prog ? `${prog.text}, ` : ""}${stagesLine(stages)}`}`}
        onPointerDown={(e) => { pointer.current = e.pointerType; }}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") rest(true); }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") rest(false); }}
        onFocus={(e) => { if (!empty && e.currentTarget.matches(":focus-visible")) setOpen(true); }}
        onBlur={() => rest(false)}
      >
        <span ref={ring} className="hm-cl-d" onClick={tapRing}><StageDonut stages={stages} size={show.ring} delay={delay} /></span>
        <span className="hm-cl-t" style={rich ? ({ "--x": `${show.extra}px`, "--bh": `${show.barPx}px` } as React.CSSProperties) : undefined}>
          {/* A big tile hangs its words in three groups (the name, the progress rows, the hires and what waits), so they fill the tile. */}
          <span className={rich ? "hm-cl-top" : "hm-cl-g"}>
            <strong>{r.name}</strong>
            {client && show.client && <small className="hm-cl-c">{client}</small>}
            {show.caption && headline && (
              <small><span className={need ? "hm-cl-need" : undefined} title={need ?? undefined}>{headline}</span></small>
            )}
          </span>
          {rich && rows.length > 0 && (
            <span className="hm-cl-pp">
              {rows.map((x, n) => (
                <span key={x.id} className="hm-cl-pr">
                  {x.hue ? <span className="sd-name" data-hue={x.hue}>{x.name}</span> : <span className="hm-cl-pn">{x.name}</span>}
                  <i className="hm-cl-bar" aria-hidden="true" style={barStyle(x.hue ? stageVar(x.hue) : "color-mix(in srgb, var(--ink) 28%, transparent)", x.count / pipeMax, delay + 80 + n * 60)} />
                  <b>{x.count}</b>
                </span>
              ))}
            </span>
          )}
          {rich ? (
            (hasLow) && (
              <span className="hm-cl-bot">
                {!empty && (show.hires || show.bar) && (
                  <span className="hm-cl-h">
                    {prog && show.hires && <small>{prog.text}</small>}
                    {hiresBar}
                  </span>
                )}
                {show.need && need && !(show.caption && !empty) && <small className="hm-cl-need" title={need}>{need}</small>}
                {show.updated && updated && <small className="hm-cl-u">{updated}</small>}
              </span>
            )
          ) : hiresBar}
        </span>
      </button>
      {open && <StagePop stages={stages} anchor={ring} heading={client ?? undefined} />}
    </li>
  );
}

export function CampaignsList({ scope, onOpen }: { scope: Scope; onOpen: (r: CampaignRow) => void }) {
  /* Live rows (so a campaign closed or completed today leaves the list), and
     for a recruiter only the campaigns they are on. Only running campaigns: a paused
     one isn't active, and listing it here would say it was. */
  const live = useCampaignRows();
  const session = useSession();
  const rows = latestFirst(visibleCampaigns(live, session).filter((r) => (isScoped(scope) ? r.id === scope : r.status === "active")));
  const ref = useRef<HTMLUListElement>(null);
  const fit = useFit(ref, rows.length);
  const plan = bentoPlan(rows.length, fit.rows);
  const shown = rows.slice(0, plan.tiles.length);
  const hidden = plan.hidden;
  /* Every campaign is still waiting for its first people (none found yet): one calm line says what starts them. */
  const allEmpty = rows.length > 0 && rows.every((r) => isEmpty(stagesOf(r)) && r.funnel.sourced === 0);
  const mayCreate = useCan("campaign.create");
  return (
    <section className="hm-card hm-camps">
      <TileHead title="Active campaigns" count={rows.length} href="#/campaigns" label="Open all campaigns" />
      {!rows.length ? (
        isScoped(scope) ? (
          <HomeEmpty art="empty-campaigns" title="Nothing active here" line="This campaign isn't active right now. Pick another above, or open them all.">
            <a className="st-link" href="#/campaigns">Open campaigns</a>
          </HomeEmpty>
        ) : mayCreate ? (
          <HomeEmpty art="empty-campaigns" title="Start your first campaign" line="Tell the agent who you're hiring for and it starts looking right away.">
            <button type="button" className="cg-new" onClick={startNewCampaign}>
              <span className="cg-new-ico" aria-hidden="true"><Plus size={14} weight="bold" /></span>
              <span className="cg-new-l">New campaign</span>
            </button>
            <a className="st-link" href="#/agent">Ask the agent</a>
          </HomeEmpty>
        ) : (
          <HomeEmpty art="empty-campaigns" title="No active campaigns yet" line="The campaigns you're on show up here once they are active.">
            <a className="st-link" href="#/agent">Ask the agent</a>
          </HomeEmpty>
        )
      ) : (
      <>
      <ul ref={ref} className="hm-cl" style={{ "--rows": plan.rows, "--rh": `${fit.rowH}px` } as React.CSSProperties}>
        {shown.map((r, i) => {
          const tile = plan.tiles[i]!;
          return <CampaignItem key={r.id} r={r} i={i} tile={tile} show={tileRows(tile, fit.colW, fit.rowH, haveOf(factsOf(r)))} onOpen={onOpen} />;
        })}
        {hidden > 0 && (
          <li className="hm-cl-more"><a href="#/campaigns">+{hidden} more<span>View all</span></a></li>
        )}
      </ul>
      {allEmpty && (
        <div className="hm-cl-hint">
          <p>Approve requirements and the agent starts finding people</p>
          {rows.length === 1
            ? <button type="button" className="st-link" onClick={() => onOpen(rows[0]!)}>Open {rows[0]!.name}</button>
            : <a className="st-link" href="#/agent">Ask the agent</a>}
        </div>
      )}
      </>
      )}
    </section>
  );
}

/* ── insights: one feed ──
   The big stories at the top, then a gently drifting feed where news is
   interleaved with short "Did you know?" facts and signals from the agent:
   where companies hire from, who is likely to move, what changed this week.
   Fixtures until a news source and the agent's market model are wired. */

type News = { kind: "news"; id: string; company: string; title: string; summary: string; source: string; when: string; read: number };
type Fact = { kind: "fact" | "signal"; id: string; company: string; text: string; ask: string };
type Item = News | Fact;

const NEWS: readonly News[] = [
  { kind: "news", id: "n2", company: "Postman", title: "Postman raises Series E, plans to hire 60 engineers", summary: "Bangalore engineering grows through 2026, led by AI tooling.", source: "Economic Times", when: "2h ago", read: 4 },
  { kind: "news", id: "n1", company: "Flipkart", title: "Flipkart restructures its payments org ahead of IPO", summary: "Super.money and the payments gateway teams merge into one.", source: "Inc42", when: "4h ago", read: 3 },
  { kind: "news", id: "n8", company: "Apple", title: "Apple expands its Hyderabad engineering campus", summary: "New floors for maps and services teams.", source: "Mint", when: "Yesterday", read: 3 },
  { kind: "news", id: "n3", company: "Swiggy", title: "Swiggy opens 25 SRE roles in Bangalore", summary: "Instamart growth drives an infra build-out.", source: "Moneycontrol", when: "Yesterday", read: 2 },
  { kind: "news", id: "n5", company: "Groww", title: "Groww closes a $250M round and doubles its platform team", summary: "Senior backend hiring through 2026.", source: "YourStory", when: "2d ago", read: 4 },
  { kind: "news", id: "n6", company: "Meesho", title: "Meesho is hiring 40 data engineers for its ads platform", summary: "Ads is now a major revenue line.", source: "Inc42", when: "3d ago", read: 3 },
  { kind: "news", id: "n9", company: "Zomato", title: "Zomato folds its Hyperpure tech team into Blinkit", summary: "Supply-chain engineering moves under Blinkit.", source: "Entrackr", when: "3d ago", read: 3 },
  { kind: "news", id: "n10", company: "CRED", title: "CRED opens a new engineering hub in Pune", summary: "The hub will house payments and lending teams.", source: "Mint", when: "4d ago", read: 2 },
];

/* The big stories rotate in the carousel at the top; everything else feeds
   the drifting list below, so nothing appears twice. */
const BIG: readonly News[] = [
  NEWS[0]!,
  NEWS[1]!,
  { ...NEWS[2]!, summary: "New floors for maps and services, and iOS hiring into 2027." },
  { ...NEWS[4]!, summary: "The money goes into brokerage infra and senior backend hiring." },
];

const FACTS: readonly Fact[] = [
  { kind: "fact", id: "f1", company: "Infosys", text: "Infosys and Cognizant hire heavily from Odisha colleges like ITER and KIIT.", ask: "Find backend engineers who studied at ITER or KIIT and now work at Infosys or Cognizant" },
  { kind: "signal", id: "s1", company: "Razorpay", text: "6 Razorpay engineers you track updated their profiles this week.", ask: "Show the Razorpay engineers who updated their profiles this week" },
  { kind: "fact", id: "f2", company: "Zerodha", text: "Most Zerodha engineers came from Bangalore's tier-2 colleges, not the IITs.", ask: "Find backend engineers from Bangalore tier-2 colleges similar to Zerodha's team" },
  { kind: "signal", id: "s2", company: "Apple", text: "Apple's hiring surge means senior iOS candidates will see counter-offers.", ask: "Prioritise iOS candidates likely to be approached by Apple" },
  { kind: "fact", id: "f3", company: "PhonePe", text: "PhonePe engineers reply 2.4× faster on WhatsApp than on email.", ask: "Switch outreach to WhatsApp first for PhonePe candidates" },
];

/* Story, story, fact: a fact never sits next to another fact. */
const FEED: readonly Item[] = NEWS.filter((n) => !BIG.some((b) => b.id === n.id)).flatMap((n, i) => (FACTS[i] ? [n, FACTS[i]!] : [n]));

/* A company's mark is its first letter on a plain tile: no icon is fetched from a third party to draw a story. */
function Logo({ company, size = 44, radius }: { company: string; size?: number; radius?: number }) {
  return (
    <span className="hm-logo" style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.26) }} aria-hidden="true">
      <b style={{ fontSize: Math.round(size * 0.36) }}>{company.trim().charAt(0).toUpperCase() || "?"}</b>
    </span>
  );
}

const newsUrl = (n: News) => `https://news.google.com/search?q=${encodeURIComponent(n.title)}&hl=en-IN&gl=IN`;
/* Stand-in photography until the news source sends its own images: a stable
   photo per story, so the same story always shows the same picture. */
const photo = (id: string, w: number, h: number) => `https://picsum.photos/seed/sh-${id}/${w}/${h}`;

/* A story's photo with the company's mark as a small badge on its corner. */
function Photo({ n, w, h, badge, className }: { n: News; w: number; h: number; badge: number; className: string }) {
  return (
    <span className={className}>
      <img src={photo(n.id, w, h)} alt="" width={w} height={h} loading="lazy" decoding="async" draggable={false} />
      <span className="hm-badge"><Logo company={n.company} size={badge} radius={Math.round(badge * 0.3)} /></span>
    </span>
  );
}

/* The feed drifts at a constant 16px a second, whatever its length, and
   eases to a stop rather than snapping when you point at it or tab into it.
   It holds still for a moment first, so the first view is a whole list. It
   only drifts where there is a pointer that can hover and room to drift: on
   phones and touch screens, and with reduced motion, it is a plain list. */
const DRIFT = 16;
const DRIFT_DELAY = 2500;
const STATIC_FEED = "(max-width: 760px), (hover: none), (prefers-reduced-motion: reduce)";
/* phones and touch tablets (where the feed is part of the page, not a scroll
   box) show the first few items and a quiet link to the rest */
const PHONE = "(max-width: 760px), (max-width: 1240px) and (hover: none)";
const PHONE_FEED = 5;

function useDrift(box: React.RefObject<HTMLDivElement | null>, list: React.RefObject<HTMLUListElement | null>, n: number, on: boolean) {
  useEffect(() => {
    const el = box.current, ul = list.current;
    if (!on || !el || !ul || typeof requestAnimationFrame !== "function") return;
    let y = 0, v = 0, target = 0, last = 0, raf = 0, started = false;
    const loopLen = () => (ul.children[n] as HTMLElement | undefined)?.offsetTop ?? 0;
    const paint = () => { ul.style.transform = `translate3d(0, ${-y.toFixed(2)}px, 0)`; };
    const tick = (t: number) => {
      /* not laid out (hidden): hold still, measure nothing */
      if (!el.offsetHeight) { last = 0; raf = requestAnimationFrame(tick); return; }
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      v += (target - v) * Math.min(1, dt * 7);
      const loop = loopLen();
      y += v * dt;
      if (loop > 0 && y >= loop) y -= loop;
      paint();
      raf = requestAnimationFrame(tick);
    };
    const hold = () => { target = 0; };
    /* a story you tab to is brought fully into view, clear of both fades */
    const reveal = (e: FocusEvent) => {
      target = 0; v = 0;
      el.scrollTop = 0;
      const li = (e.target as HTMLElement).closest("li");
      if (!li) return;
      const loop = loopLen();
      const top = li.offsetTop - 30, bottom = li.offsetTop + li.offsetHeight + 50 - el.clientHeight;
      if (li.offsetTop - y < 30) y = top;
      else if (bottom > y) y = bottom;
      if (loop > 0) y = ((y % loop) + loop) % loop;
      paint();
    };
    const go = () => {
      target = started && !document.hidden && !el.matches(":hover") && !el.contains(document.activeElement) ? DRIFT : 0;
    };
    const out = () => window.setTimeout(go, 0);
    const start = window.setTimeout(() => { started = true; go(); }, DRIFT_DELAY);
    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", go);
    el.addEventListener("focusin", reveal);
    el.addEventListener("focusout", out);
    document.addEventListener("visibilitychange", go);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(start);
      ul.style.transform = "";
      el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", go);
      el.removeEventListener("focusin", reveal);
      el.removeEventListener("focusout", out);
      document.removeEventListener("visibilitychange", go);
    };
  }, [box, list, n, on]);
}

/* ── the big stories: a deck ──
   Three stories are stacked like cards: the front one in full, the next two
   peeking out beneath it, each a little smaller and fainter. When a story
   leaves it slides off to the side; the one behind pops forward and a new
   one rises into the back. Going back brings the previous story in from the
   side. Drag or swipe the front card sideways to flick it away. Arrows, the
   segments and ← → move it too. It advances itself every 6.5s while nobody
   is pointing at, focusing or dragging it. */

const SLIDE_MS = 6500;
const PEEK = 3;

function Carousel({ items }: { items: readonly News[] }) {
  const n = items.length;
  const [i, setI] = useState(0);
  /* the card that just left, and which way it went, so it can play its exit */
  const [out, setOut] = useState<{ k: number; dir: 1 | -1; key: number } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; id: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const deck = useRef<HTMLDivElement>(null);
  const outT = useRef(0);
  const paused = hover || focus || hidden || dx !== 0;
  const reduce = useMedia("(prefers-reduced-motion: reduce)");
  const auto = !reduce && n > 1;
  useEffect(() => {
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); window.clearTimeout(outT.current); };
  }, []);
  const go = (to: number, d: 1 | -1 = to > i ? 1 : -1) => {
    const next = ((to % n) + n) % n;
    if (next === i) return;
    /* forward: the front card is thrown aside, then rejoins at the back.
       backward: it simply steps back into the deck as the new one arrives. */
    setOut(d === 1 ? { k: i, dir: d, key: Date.now() } : null);
    window.clearTimeout(outT.current);
    if (d === 1) outT.current = window.setTimeout(() => setOut(null), 480);
    setDir(d);
    setI(next);
    if (deck.current?.contains(document.activeElement)) {
      requestAnimationFrame(() => deck.current?.querySelector<HTMLElement>(".is-front .hm-feat")?.focus({ preventScroll: true }));
    }
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) dragged.current = true;
    if (Math.abs(dx) > 70) go(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    setDx(0);
  };
  return (
    <div
      className={`hm-car${paused ? " is-paused" : ""}`}
      role="region" aria-roledescription="carousel" aria-label="Top stories"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)}
      onFocus={(e) => setFocus(e.target.matches(":focus-visible"))} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false); }}
      onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1, 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1, -1); } }}
    >
      <div ref={deck} className={`hm-deck${dx ? " is-drag" : ""}`} aria-live={paused ? "polite" : "off"}>
        {items.map((s, k) => {
          const d = (k - i + n) % n;
          const leaving = out?.k === k && d !== 0;
          const cls = d === 0 ? `is-front${dir === -1 ? " from-left" : " from-back"}` : leaving ? "is-out" : d < PEEK ? `is-peek is-d${d}` : "is-gone";
          return (
            <div
              key={s.id} className={`hm-dcard ${cls}`}
              role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}`} aria-hidden={d !== 0 || undefined}
              style={d === 0 && dx ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)`, transition: "none" } : undefined}
              onPointerDown={d === 0 ? (e) => { dragged.current = false; if (e.button !== 0) return; drag.current = { x: e.clientX, id: e.pointerId, moved: false }; } : undefined}
              onPointerMove={d === 0 ? (e) => {
                const g = drag.current;
                if (!g) return;
                const x = e.clientX - g.x;
                if (!g.moved && Math.abs(x) > 6) { g.moved = true; (e.currentTarget as HTMLElement).setPointerCapture?.(g.id); }
                if (g.moved) setDx(x);
              } : undefined}
              onPointerUp={d === 0 ? end : undefined} onPointerCancel={d === 0 ? end : undefined}
              onClickCapture={d === 0 ? (e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } } : undefined}
            >
              <a className="hm-feat" href={newsUrl(s)} target="_blank" rel="noreferrer noopener" tabIndex={d === 0 ? undefined : -1} draggable={false}>
                <Photo n={s} w={640} h={420} badge={28} className="hm-feat-media" />
                <span className="hm-feat-t">
                  <strong>{s.title}</strong>
                  <span className="hm-feat-s">{s.summary}</span>
                  <span className="hm-feat-m"><span>{s.source}, {s.when}<span className="hm-feat-read">, {s.read} min read</span></span></span>
                </span>
                <ArrowUpRight className="hm-feat-go" size={14} weight="bold" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          );
        })}
      </div>
      <span className="hm-car-btns">
        <button type="button" onClick={() => go(i - 1, -1)} aria-label="Previous story"><CaretLeft size={11} weight="bold" /></button>
        <button type="button" onClick={() => go(i + 1, 1)} aria-label="Next story"><CaretRight size={11} weight="bold" /></button>
      </span>
      <div className="hm-car-prog">
        {items.map((s, k) => (
          <button
            key={s.id} type="button" aria-label={`Story ${k + 1} of ${n}`} aria-current={k === i ? "true" : undefined}
            className={k < i ? "is-past" : k === i ? "is-on" : ""} onClick={() => go(k)}
          >
            {k === i && (auto
              ? <i key={i} style={{ animationDuration: `${SLIDE_MS}ms` }} onAnimationEnd={() => go(i + 1, 1)} />
              : <i className="is-full" />)}
          </button>
        ))}
      </div>
    </div>
  );
}

const MORE_NEWS = "https://news.google.com/search?q=India%20tech%20hiring&hl=en-IN&gl=IN";

/* The sample stories are for the fixtures. The live console has no news source, and a tile that only says
   so forever is a placeholder, so it has no tile: Home is three (Home.tsx, `is-three`). */
export function InsightsCard({ onAsk }: { onAsk: (prompt: string) => void }) {
  return LIVE ? null : <FixtureInsights onAsk={onAsk} />;
}

function FixtureInsights({ onAsk }: { onAsk: (prompt: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /* static: one copy of the feed in the page flow (or a plain scroll box);
     drifting: the feed twice, so the loop is seamless */
  const still = useMedia(STATIC_FEED);
  const phone = useMedia(PHONE);
  useDrift(box, list, FEED.length, !still);
  const items = still ? (phone ? FEED.slice(0, PHONE_FEED) : FEED) : [...FEED, ...FEED];
  const row = (x: Item, i: number) => {
    const ghost = i >= FEED.length;
    if (x.kind === "news") {
      return (
        <li key={`${x.id}-${i}`} aria-hidden={ghost || undefined}>
          <a className="hm-story" href={newsUrl(x)} target="_blank" rel="noreferrer noopener" tabIndex={ghost ? -1 : undefined}>
            <Photo n={x} w={160} h={160} badge={18} className="hm-thumb" />
            <span className="hm-story-t">
              <strong>{x.title}</strong>
              <span className="hm-story-m">{x.company}, {x.source}, {x.when}</span>
            </span>
            <ArrowUpRight className="hm-story-go" size={14} weight="bold" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      );
    }
    return (
      <li key={`${x.id}-${i}`} aria-hidden={ghost || undefined}>
        <button type="button" className={`hm-fact is-${x.kind}`} onClick={() => onAsk(x.ask)} tabIndex={ghost ? -1 : undefined}>
          <span className="hm-fact-i" aria-hidden="true">{x.kind === "fact" ? <Lightbulb size={18} weight="duotone" /> : <Pulse size={18} weight="bold" />}</span>
          <span className="hm-fact-t">
            <span className="hm-fact-k">{x.kind === "fact" ? "Did you know" : "Signal"}</span>
            <span className="hm-fact-x">{x.text}</span>
          </span>
          <ArrowRight className="hm-fact-go" size={13} weight="bold" aria-hidden="true" />
        </button>
      </li>
    );
  };
  return (
    <section className="hm-card hm-ins">
      <header className="hm-th">
        <h2><i className="hm-live" aria-hidden="true" />Insights</h2>
        <a className="hm-th-go" href={MORE_NEWS} target="_blank" rel="noreferrer noopener" aria-label="More hiring news, opens in a new tab"><GoArrow /></a>
      </header>

      <Carousel items={BIG} />

      <h3 className="hm-feed-h">Latest</h3>
      <div ref={box} className={`hm-ticker${still ? " is-static" : ""}`}>
        <ul ref={list} className="hm-stories">
          {items.map(row)}
        </ul>
        {still && phone && FEED.length > PHONE_FEED && (
          <a className="hm-feed-more" href={MORE_NEWS} target="_blank" rel="noreferrer noopener">
            More news <ArrowUpRight size={12} weight="bold" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </section>
  );
}

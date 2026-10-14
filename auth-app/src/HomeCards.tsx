import {
  ArrowRight, ArrowUpRight, CaretDown, CaretLeft, CaretRight, Lightbulb, PencilSimple, Plus, Pulse, Sparkle, Trash,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { LIVE } from "./api/client";
import { EmptyArt } from "./EmptyArt";
import { HomeEmpty } from "./HomeEmpty";
import type { WeekCell } from "./api/home";
import { weekFromHome } from "./api/home";
import type { DayTask } from "./api/tasks";
import { dateInput, endOfDate, endOfDayAhead, endOfToday } from "./api/tasks";
import type { CampaignRow } from "./campaignsData";
import { CAMPAIGN_ROWS } from "./campaignsData";
import { memberIdOf, memberName, useCampaignRows, useTeam } from "./campaignStore";
import { addTask, editTask, reassignTask, removeTask, setTaskDone, undoRemoveTask, useAssignedTasks, useHomeOverview, useMyTasks } from "./homeStore";
import { Num, useToast } from "./Contacts";
import { dayLabel } from "./schedulesView";
import { initialsOf } from "./ui";
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
    { key: "iv", n: iv, label: "Moved to interview", note: `from ${r} replies`, hue: HUES[0] },
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

/* What the header says about the day, by how much of it is done. */
function dayLine(finished: number, total: number): string {
  const left = total - finished;
  if (!total || left === 0) return "Day cleared";
  if (left === 1) return "Last one";
  if (finished === 0) return "Fresh start";
  return finished / total >= 0.5 ? "Halfway there" : "Good start";
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

/** A title short enough to read in a toast; a longer one is cut at a word. */
const short = (title: string): string => (title.length > 36 ? `${title.slice(0, 36).replace(/\s+\S*$/, "")}…` : title);

const fromFixture = (t: TaskItem): DayTask => ({ id: t.id, title: t.title, state: t.state, campaignId: t.campaignId, campaign: campaignName(t.campaignId), dueInDays: t.dueInDays });
/* undated work sorts after everything with a date */
const dueOrder = (d: number | null) => d ?? Number.MAX_SAFE_INTEGER;

export function TodayCard({ scope, onOpen }: { scope: Scope; onOpen: (prompt: string) => void }) {
  const liveTasks = useMyTasks();
  const rows = useCampaignRows();
  const base = (LIVE ? liveTasks.items : TASKS.map(fromFixture)).filter((t) => !isScoped(scope) || t.campaignId === scope);
  const [added, setAdded] = useState<DayTask[]>([]);
  const mine = [...added, ...base];
  const [fixtureDone, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(base.filter((t) => t.state === "done").map((t) => [t.id, true])));
  const done: Record<string, boolean> = LIVE ? Object.fromEntries(base.map((t) => [t.id, t.state === "done"])) : fixtureDone;
  const [leaving, setLeaving] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /* When a new task is due: today unless said otherwise; "date" opens a day to pick. */
  const [dueChoice, setDueChoice] = useState<"today" | "tomorrow" | "date">("today");
  const [dueDate, setDueDate] = useState("");
  /* The task being changed in place, and the toast that offers a deleted one back. */
  const [editing, setEditing] = useState<string | null>(null);
  const toast = useToast();
  /* Who a new task is for: yourself unless you pick a teammate. */
  const team = useTeam();
  const session = useSession();
  /* A recruiter hands work to themselves only; the picker and the reassign menu are an admin's. */
  const mayAssign = useCan("task.assignOthers");
  const others = mayAssign ? team.filter((n) => n !== session.name) : [];
  const [forWhom, setForWhom] = useState("");
  /* What I handed to teammates; for an admin, what everyone has, so they can see who was given what. */
  const admin = session.role === "admin";
  const handed = useAssignedTasks(admin ? "team" : "assigned");
  const assignedRows = (LIVE ? handed.items : [])
    .filter((t) => !isScoped(scope) || t.campaignId === scope)
    .slice()
    .sort((a, b) => dueOrder(a.dueInDays) - dueOrder(b.dueInDays));
  const addRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
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
  const finished = mine.length - open.length;
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
            ?? el.querySelector<HTMLElement>(".hm-next-done") ?? checks[0] ?? el.querySelector<HTMLElement>(".hm-done-h, .hm-add input");
          to?.focus({ preventScroll: true });
        });
      }
    }, reducedMotion() ? 120 : 520);
  };
  const undo = (id: string) => (LIVE ? setTaskDone(id, false) : setDone((d) => ({ ...d, [id]: false })));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    /* "Pick a date" with no date picked is a question, not a task: the day input is where the caret goes. */
    const picked = dueChoice === "date" ? endOfDate(dueDate) : null;
    if (dueChoice === "date" && !picked) { dateRef.current?.focus(); return; }
    const dueAt = dueChoice === "date" ? picked : dueChoice === "tomorrow" ? endOfDayAhead(1) : endOfToday();
    if (LIVE) {
      const row = isScoped(scope) ? rows.find((r) => r.id === scope) : undefined;
      addTask(title, row ? { id: row.id, name: row.name } : null, forWhom ? memberIdOf(forWhom) : undefined, dueAt);
    } else {
      const camp = isScoped(scope) ? scope : "backend-snr";
      const ahead = dueChoice === "tomorrow" ? 1 : dueChoice === "date" && dueAt ? Math.round((Date.parse(dueAt) - Date.now()) / 86_400_000) : 0;
      setAdded((a) => [{ id: `u-${Date.now()}`, title, state: "todo", campaignId: camp, campaign: campaignName(camp), dueInDays: ahead }, ...a]);
    }
    setDraft("");
    setDueChoice("today");
    setDueDate("");
  };
  /* Deleting is quiet and can be taken back: the task leaves the list and a toast offers it again. */
  const remove = (t: DayTask) => {
    if (!removeTask(t.id)) return;
    toast(`Deleted “${short(t.title)}”`, "done", { label: "Undo", onClick: () => undoRemoveTask(t.id) });
  };
  const k = finished / Math.max(1, mine.length);
  const groups = [
    { id: "today", title: "Today", items: open.filter((t) => t.dueInDays !== null && t.dueInDays <= 0) },
    { id: "later", title: "Later", items: open.filter((t) => t.dueInDays === null || t.dueInDays > 0) },
    { id: "assigned", title: admin ? "Team tasks" : "Assigned to others", items: assignedRows },
    { id: "done", title: "Done", items: mine.filter((t) => done[t.id]) },
  ];
  const line = dayLine(finished, mine.length);
  /* The team's tasks arrive on their own request: until they do, "all clear" would be a guess. */
  const waiting = LIVE && !handed.ready;
  /* With nothing of mine at all there is no progress to report, so the header says nothing
     (no "0 of 0 done" and a ring on zero) and the body says it once: all clear. */
  const hasDay = mine.length > 0;
  return (
    <section ref={card} className="hm-card hm-today">
      <header className="hm-th">
        <h2>My tasks</h2>
        {hasDay && (
          <span className={`hm-prog${cheer ? " is-cheer" : ""}${k >= 1 ? " is-full" : ""}`}>
            <small aria-live="polite">
              <b>{cheer ? (cheer.left > 0 ? "Nice." : "Day cleared") : line}</b>
              <span>{cheer ? (cheer.left > 0 ? `${cheer.left} left` : "All done") : `${finished} of ${mine.length} done`}</span>
            </small>
            <Ring key={cheer?.n ?? 0} k={k} n={finished} pop={!!cheer && !reducedMotion()} />
          </span>
        )}
        <button type="button" className="hm-th-go" onClick={() => onOpen("Show all my tasks across campaigns")} aria-label="Open all tasks with the agent"><GoArrow /></button>
      </header>

      <div ref={body} className="hm-today-b hm-tl" aria-busy={waiting || undefined}>
        {open.length === 0 && assignedRows.length === 0 && !waiting && (
          /* The header already says "Day cleared" when there were tasks and they are done: the headline does not say it again. */
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
                    <li key={t.id} style={{ ["--hue" as string]: t.campaignId ? hueFor(t.campaignId) : undefined }}>
                      <span className="hm-tl-av" aria-hidden="true">{initialsOf(t.assigneeName)}</span>
                      {t.open
                        ? <a className="hm-tl-t" href={t.open} title={`Open: ${t.title}`}>{t.title}</a>
                        : <span className="hm-tl-t is-plain" title={t.title}>{t.title}</span>}
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
                    </li>
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
                    <li key={t.id} className={`${leaving === t.id ? "is-leaving" : ""}${isDone ? " is-done" : ""}`} style={{ ["--hue" as string]: t.campaignId ? hueFor(t.campaignId) : undefined }}>
                      {isDone
                        ? <button type="button" className="hm-check is-on" onClick={() => undo(t.id)} aria-label={`Mark "${t.title}" as not done`}>{CHECK}</button>
                        : <button type="button" className="hm-check" onClick={() => complete(t.id)} aria-label={`Mark "${t.title}" as done`}>{CHECK}{leaving === t.id && <Burst />}</button>}
                      {t.open
                        ? <a className="hm-tl-t" href={t.open} title={`Open: ${t.title}`}>{t.title}</a>
                        : <button type="button" className="hm-tl-t" onClick={() => onOpen(t.title)} title={t.title}>{t.title}</button>}
                      <span className="hm-tl-camp">
                        {t.campaign && <i aria-hidden="true" />}{t.campaign ?? "No campaign"}
                        {t.assigneeId && !isMe(t.assigneeId) && <small className="hm-tl-for"> · for {memberName(t.assigneeId) ?? "a teammate"}</small>}
                      </span>
                      <span className={`hm-tl-st ${st.c}`}>{st.l}</span>
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
                    </li>
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
        <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task" aria-label="Add a task" maxLength={300} />
        {LIVE && others.length > 0 && (
          <select className="hm-add-for" value={forWhom} onChange={(e) => setForWhom(e.target.value)} aria-label="Who the task is for">
            <option value="">For me</option>
            {others.map((n) => <option key={n} value={n}>For {n}</option>)}
          </select>
        )}
        <select className="hm-add-for" value={dueChoice} onChange={(e) => setDueChoice(e.target.value as "today" | "tomorrow" | "date")} aria-label="When the task is due" title="When the task is due">
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="date">Pick a date</option>
        </select>
        {dueChoice === "date" && (
          <input
            ref={dateRef} className="hm-add-date" type="date" value={dueDate} min={dateInput(endOfToday())}
            onChange={(e) => setDueDate(e.target.value)} aria-label="Due date"
          />
        )}
        <kbd className={draft.trim() ? "is-on" : ""} aria-hidden="true">↵</kbd>
      </form>
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

/* ── active campaigns: a name, one quiet line, hires in words ──
   Each row reads left to right: which campaign, what is next for it, and
   "1 of 3 hired" in plain words on the right edge, with a slim bar of the
   way to goal beside it. The small dot says what
   kind of next: green when something good is waiting (replies, interviews,
   activity right now), amber only when the campaign genuinely needs a person
   (no owner, an unfinished brief), grey otherwise. Rows are a fixed 46px;
   whatever does not fit the tile folds into one quiet "+N more" line that
   opens the Campaigns page, so nothing ever hides behind a scroll. */

const ROW = 58;
const MORE = 44;
/** The card shows at least this many rows (when there are that many) and at most MAX: the rest fold into "+N more". */
export const MIN_CAMPAIGN_ROWS = 4;
export const MAX_CAMPAIGN_ROWS = 10;
/** Where the card is not fitted to one screen (stacked below 1241px, short windows): it grows with the page. */
const STACKED_CAMPAIGN_ROWS = 6;

/**
 * How many rows the card shows in `room` px (the list's own height): as many as fit with the "+N more" line
 * under them when some are left out, so the unused band is always less than one row, and never fewer than
 * MIN_CAMPAIGN_ROWS or more than MAX_CAMPAIGN_ROWS.
 */
export function campaignRowsFit(count: number, room: number): number {
  const fits = count * ROW <= room ? count : Math.floor((room - MORE) / ROW);
  return Math.min(count, Math.max(MIN_CAMPAIGN_ROWS, Math.min(MAX_CAMPAIGN_ROWS, fits)));
}

/* The data says what is missing; Home says what is next, and how it feels. */
function nextStep(needs: string): { text: string; tone: "good" | "you" | "" } {
  if (/no one assigned|paused/i.test(needs)) return { text: "Ready for an owner", tone: "you" };
  if (/brief not finished/i.test(needs)) return { text: "Brief almost done", tone: "you" };
  const m = needs.match(/^(\d+) (replies|interviews?)\b/i);
  if (m) return { text: /repl/i.test(m[2]!) ? `${m[1]} new replies` : `${m[1]} ${Number(m[1]) === 1 ? "interview" : "interviews"} to book`, tone: "good" };
  return { text: needs, tone: "" };
}

/* How many 58px rows fit the tile on a one-screen desktop (4 to 10); null elsewhere
   (the tile grows with the page). The list is measured again whenever the card is resized. */
function useFit(list: React.RefObject<HTMLUListElement | null>, n: number) {
  const [fit, setFit] = useState<number | null>(null);
  useEffect(() => {
    const ul = list.current;
    if (!ul || typeof ResizeObserver === "undefined" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(min-width: 1241px) and (min-height: 680px)");
    const measure = () => {
      if (!mq.matches) { setFit(null); return; }
      setFit(campaignRowsFit(n, ul.clientHeight));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    mq.addEventListener?.("change", measure);
    measure();
    return () => { ro.disconnect(); mq.removeEventListener?.("change", measure); };
  }, [list, n]);
  return fit;
}

export function CampaignsList({ scope, onOpen }: { scope: Scope; onOpen: (r: CampaignRow) => void }) {
  const rank = (r: CampaignRow) => (r.needs ? (nextStep(r.needs).tone === "you" ? 0 : 1) : 2);
  /* Live rows (so a campaign closed or completed today leaves the list), and
     for a recruiter only the campaigns they are on. Only running campaigns: a paused
     one isn't active, and listing it here would say it was. */
  const live = useCampaignRows();
  const session = useSession();
  const rows = visibleCampaigns(live, session)
    .filter((r) => (isScoped(scope) ? r.id === scope : r.status === "active"))
    .sort((a, b) => rank(a) - rank(b));
  const ref = useRef<HTMLUListElement>(null);
  const fit = useFit(ref, rows.length);
  const shown = rows.slice(0, fit == null ? STACKED_CAMPAIGN_ROWS : Math.min(MAX_CAMPAIGN_ROWS, fit));
  const hidden = rows.length - shown.length;
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
      <ul ref={ref} className="hm-cl">
        {shown.map((r, i) => {
          const fresh = r.updatedAgo.endsWith("m ago") || r.updatedAgo === "Just now";
          const next = r.needs ? nextStep(r.needs) : null;
          return (
            <li key={r.id} style={{ animationDelay: `${160 + i * 40}ms` }}>
              <button type="button" onClick={() => onOpen(r)} aria-label={`${r.name}, ${r.funnel.hired} of ${r.target} hired${next ? `, ${next.text}` : ""}`}>
                <span className="hm-cl-t">
                  <strong>{r.name}</strong>
                  {next ? <small className={next.tone ? `is-${next.tone}` : ""}><span>{next.text}</span></small>
                    : fresh ? <small className="is-good"><span>Active now</span></small>
                    : <small><span>Updated {r.updatedAgo}</span></small>}
                </span>
                <span className="hm-cl-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (r.funnel.hired / Math.max(1, r.target)) * 100)}%` }} /></span>
                <span className="hm-cl-n"><b>{r.funnel.hired}</b> of {r.target} hired</span>
                <ArrowRight className="hm-cl-go" size={14} weight="bold" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="hm-cl-more"><a href="#/campaigns">+{hidden} more<span>View all</span></a></li>
        )}
      </ul>
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

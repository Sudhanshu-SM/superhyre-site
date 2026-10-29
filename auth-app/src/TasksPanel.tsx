import { Plus } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { LIVE } from "./api/client";
import type { DayTask } from "./api/tasks";
import { memberIdOf, resolveCampaignId, useCampaignRow, useTeam } from "./campaignStore";
import {
  PANEL_ROWS, dueFromInput, dueText, inScope, mayChange, openLine, tomorrowNine,
} from "./campaignTasks";
import type { Scope } from "./campaignTasks";
import { useCan } from "./can";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { plainText } from "./displayText";
import { EmptyArt } from "./EmptyArt";
import { addTask, retryCampaignTasks, setTaskDone, useCampaignTasks } from "./homeStore";
import { OvCard } from "./OverviewPanel";
import { TASKS, campaignName } from "./orchestrator";
import { isMe, useSession } from "./roleStore";
import { useToast } from "./toast";
import { TaskHover } from "./TaskHover";
import { Dialog, LoadFailed, initialsOf } from "./ui";

/**
 * The campaign Overview's "Tasks" panel: what is still to do on this campaign.
 *
 * Pending tasks, soonest first, the first five of them: a box to finish each in place, the words, who it is for
 * ("You", or a teammate's initials) and the day, which is plain text (amber on the day, red-brown once it has
 * passed). The header says how many are open and opens the whole list (pending and done, everyone's or mine).
 * Under the list one line adds a task: its words first, and the day and the person appear as it is typed.
 *
 * Whose tasks are listed is the server's rule, not this panel's: a recruiter gets their own and the tasks of the
 * campaigns they are on. What a person may change is the server's rule too (`mayChange` mirrors it), so a box is
 * never offered for a task that would be refused.
 *
 * Voice: calm and short. Nothing pending is good news ("Nothing pending. Nice."), never an empty apology.
 */

/** A title short enough for a toast; a longer one is cut at a word. */
const short = (title: string): string => (title.length > 36 ? `${title.slice(0, 36).replace(/\s+\S*$/, "")}…` : title);

const CHECK = (
  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.6 6.3 5 8.6l4.4-5" /></svg>
);

/* ── the prototype's tasks: a campaign's fixtures, finished in place ── */

function fixtureTasks(campaignId: string): DayTask[] {
  return TASKS.filter((t) => t.campaignId === campaignId).map((t) => ({
    id: t.id, title: t.title, state: t.state, campaignId: t.campaignId, campaign: campaignName(t.campaignId),
    dueInDays: t.dueInDays,
    dueAt: new Date(Date.now() + t.dueInDays * 86_400_000).toISOString(),
    assigneeId: null, assigneeName: null, createdById: null, createdByName: null,
  }));
}

/* ── one row, in the panel and in the full list ── */

function Who({ t }: { t: DayTask }) {
  if (!t.assigneeId) return <span className="tp-who" />;
  if (isMe(t.assigneeId)) return <span className="tp-who t-body-sm">You</span>;
  const name = t.assigneeName ?? "A teammate";
  return (
    <span className="tp-who">
      <span className="tp-av t-caption" role="img" aria-label={`For ${name}`}>{initialsOf(name)}</span>
    </span>
  );
}

/** The task list while it loads: the list's and the row's own classes (check, title, who, due), so the rows are the real rows'. */
export function TasksGhost({ n = 3, label }: { n?: number; label?: string }) {
  const list = (
    <ul className="tp-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="tp-row">
          <Shimmer circle w={18} h={18} />
          <span className="tp-t t-body"><Shimmer h={13} lh={20} w={`${46 + ((i * 19) % 40)}%`} /></span>
          <span className="tp-who"><Shimmer circle w={24} h={24} /></span>
          <span className="tp-due t-body-sm"><Shimmer h={12} lh={20} w={72} /></span>
        </li>
      ))}
    </ul>
  );
  return label ? <ShimmerRegion label={label}>{list}</ShimmerRegion> : list;
}

function TaskRow({ t, done, allowed, onToggle }: { t: DayTask; done: boolean; allowed: boolean; onToggle: (t: DayTask) => void }) {
  const due = dueText(t);
  return (
    <TaskHover task={t} className={`tp-row${done ? " is-done" : ""}`}>
      <button
        type="button" className={`tp-check${done ? " is-on" : ""}`} disabled={!allowed} onClick={() => onToggle(t)}
        aria-label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
        title={allowed ? undefined : "Only the person it is for, or an admin, can change this"}
      >
        {CHECK}
      </button>
      {t.open && !done
        ? <a className="tp-t t-body" href={t.open}>{t.title}</a>
        : <span className="tp-t t-body">{t.title}</span>}
      <Who t={t} />
      <span className={`tp-due t-body-sm${due.tone && !done ? ` is-${due.tone}` : ""}`}>
        {done ? "" : due.text}
      </span>
    </TaskHover>
  );
}

/* ── the data: the store when connected, the fixtures' tasks in place of it otherwise ── */

function useTasksOf(campaignId: string, name: string) {
  const real = resolveCampaignId(campaignId);
  const live = useCampaignTasks(real);
  const toast = useToast();
  const [finished, setFinished] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<readonly DayTask[]>([]);

  const base = LIVE ? [] : [...added, ...fixtureTasks(campaignId)].sort((a, b) => (a.dueInDays ?? 1e9) - (b.dueInDays ?? 1e9));
  const open = LIVE ? live.open : base.filter((t) => t.state !== "done" && !finished.has(t.id));
  const done = LIVE ? live.done : base.filter((t) => t.state === "done" || finished.has(t.id));

  const toggle = (t: DayTask, on: boolean) => {
    if (LIVE) setTaskDone(t.id, on);
    else setFinished((s) => { const n = new Set(s); if (on) n.add(t.id); else n.delete(t.id); return n; });
  };
  const complete = (t: DayTask) => {
    toggle(t, true);
    toast(`${short(t.title)} is done`, "done", { label: "Undo", onClick: () => toggle(t, false) });
  };
  const reopen = (t: DayTask) => toggle(t, false);
  const create = (title: string, dueAt: string | null, forId: string | undefined, forName: string) => {
    if (LIVE) { addTask(title, { id: real, name }, forId, dueAt, forName); return; }
    setAdded((a) => [{
      id: `u-${Date.now()}`, title, state: "todo", campaignId, campaign: campaignName(campaignId),
      dueInDays: dueAt ? Math.round((Date.parse(dueAt) - Date.now()) / 86_400_000) : null, dueAt,
      assigneeId: forId ?? null, assigneeName: forName, createdById: null, createdByName: null,
    }, ...a]);
  };
  return {
    real, open, done, create, complete, reopen,
    ready: !LIVE || live.ready, failed: LIVE && live.failed,
    retry: () => retryCampaignTasks(real),
  };
}

/* ── the card ── */

export function TasksCard({ campaignId, onlyMine = false }: {
  campaignId: string;
  /** Someone who follows the campaign without being on it: their own tasks here, not the team's. */
  onlyMine?: boolean;
}) {
  const row = useCampaignRow(campaignId);
  const session = useSession();
  /* The server's `isAdmin`: owners, admins and a personal workspace's person may change anyone's task. */
  const mayManage = useCan("campaign.manage");
  const mayAssign = useCan("task.assignOthers");
  const team = useTeam();
  const name = plainText(row?.name) || campaignName(campaignId) || "this campaign";
  const data = useTasksOf(campaignId, name);
  const who = { mayManage, myId: session.userId };
  /* An admin is on every campaign; a recruiter who only follows one sees their own tasks on it. */
  const everyone = !onlyMine || mayManage;
  const openAll = everyone ? data.open : inScope(data.open, "mine", who.myId);
  const doneAll = everyone ? data.done : inScope(data.done, "mine", who.myId);

  const [allOpen, setAllOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState(() => tomorrowNine());
  const [forWhom, setForWhom] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const others = mayAssign ? team.filter((n) => n !== session.name) : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) { titleRef.current?.focus(); return; }
    /* A task is for yourself unless an admin picks a teammate. */
    const forId = forWhom ? memberIdOf(forWhom) : session.userId;
    data.create(title, dueFromInput(due), forId, forWhom || session.name);
    setDraft("");
    setDue(tomorrowNine());
    setForWhom("");
  };

  const shown = openAll.slice(0, PANEL_ROWS);
  const anyTask = openAll.length + doneAll.length > 0;
  const aside = (
    <span className="tp-aside">
      {data.ready && openLine(openAll.length) && <span className="ov2-aside t-body-sm">{openLine(openAll.length)}</span>}
      {data.ready && anyTask && <button type="button" className="hp-link" onClick={() => setAllOpen(true)}>View all</button>}
    </span>
  );

  return (
    <OvCard title="Tasks" className="tp" aside={aside}>
      <div className="tp-body">
        {!data.ready ? (
          <TasksGhost label="Loading tasks" />
        ) : data.failed ? (
          <LoadFailed what="This campaign's tasks" compact onRetry={data.retry} />
        ) : shown.length === 0 ? (
          <div className="tp-none">
            <EmptyArt name="empty-tasks" size={72} />
            <p className="t-body">Nothing pending. Nice.</p>
          </div>
        ) : (
          <ul className="tp-list">
            {shown.map((t) => <TaskRow key={t.id} t={t} done={false} allowed={mayChange(t, who)} onToggle={data.complete} />)}
          </ul>
        )}

        <form ref={formRef} className={`tp-add${draft.trim() ? " has-draft" : ""}`} onSubmit={submit}>
          <span className="tp-add-line">
            <Plus size={14} weight="bold" aria-hidden="true" />
            <input
              ref={titleRef} className="t-body" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300}
              placeholder="Add a task" aria-label="Add a task"
              /* The day and the person appear under the line: keep them in view when the card is at the window's foot. */
              onFocus={() => requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: "nearest" }))}
            />
          </span>
          <span className="tp-add-opts">
            <input
              className="tp-when t-body-sm" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)}
              aria-label="Due"
            />
            {others.length > 0 && (
              <select className="tp-for t-body-sm" value={forWhom} onChange={(e) => setForWhom(e.target.value)} aria-label="Who it is for">
                <option value="">For you</option>
                {others.map((n) => <option key={n} value={n}>For {n}</option>)}
              </select>
            )}
            <button type="submit" className="ov2-btn is-main" disabled={!draft.trim()}>Add</button>
          </span>
        </form>
      </div>

      {allOpen && (
        <AllTasks
          name={name} open={openAll} done={doneAll} who={who} canFilter={everyone}
          onFinish={data.complete} onReopen={data.reopen} onClose={() => setAllOpen(false)}
        />
      )}
    </OvCard>
  );
}

/* ── the whole list: pending and done, everyone's or mine ── */

function AllTasks({ name, open: allOpen, done: allDone, who, canFilter, onFinish, onReopen, onClose }: {
  name: string;
  open: readonly DayTask[];
  done: readonly DayTask[];
  who: { mayManage: boolean; myId: string | undefined };
  /** Whether there is anyone else's work to filter out: a follower sees only their own. */
  canFilter: boolean;
  onFinish: (t: DayTask) => void;
  onReopen: (t: DayTask) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("everyone");
  const open = inScope(allOpen, scope, who.myId);
  const done = inScope(allDone, scope, who.myId);
  const tabs: Array<{ id: Scope; label: string; n: number }> = [
    { id: "everyone", label: "Everyone", n: allOpen.length },
    { id: "mine", label: "Mine", n: inScope(allOpen, "mine", who.myId).length },
  ];
  return (
    <Dialog open onClose={onClose} label={`Tasks on ${name}`} size="md">
      <div className="tp-all">
        <header className="tp-all-h">
          <h2 className="t-title-sm">Tasks</h2>
          <p className="t-body-sm">{name}</p>
          {canFilter && (
            <div className="ov3-tabs" role="tablist" aria-label="Whose tasks">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={scope === t.id} className={scope === t.id ? "is-on" : ""} onClick={() => setScope(t.id)}>
                  {t.label}<span>{t.n}</span>
                </button>
              ))}
            </div>
          )}
        </header>
        <section className="tp-all-s" aria-label="Pending">
          <h3 className="t-label">Pending</h3>
          {open.length ? (
            <ul className="tp-list">
              {open.map((t) => <TaskRow key={t.id} t={t} done={false} allowed={mayChange(t, who)} onToggle={onFinish} />)}
            </ul>
          ) : <p className="tp-all-none t-body-sm">Nothing pending. Nice.</p>}
        </section>
        {done.length > 0 && (
          <section className="tp-all-s" aria-label="Done">
            <h3 className="t-label">Done</h3>
            <ul className="tp-list">
              {done.map((t) => <TaskRow key={t.id} t={t} done allowed={mayChange(t, who)} onToggle={onReopen} />)}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}

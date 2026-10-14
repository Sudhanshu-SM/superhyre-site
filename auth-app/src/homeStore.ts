import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ApiError, LIVE, messageOf, onWrite, setTabWorkspace } from "./api/client";
import { identityApi, onWorkspaceChange } from "./api/identity";
import { settleRequest, withoutNotice } from "./membership";
import { getSession, isMe } from "./roleStore";
import { resolveCampaignId } from "./campaignStore";
import type { ApiHome } from "./api/home";
import { homeOverview } from "./api/home";
import type { ApiNotification, ApiTask, DayTask } from "./api/tasks";
import * as tasksApi from "./api/tasks";
import { pollWhileVisible } from "./livePoll";
import { reportProblem } from "./problems";

/**
 * Live state for Home and the bell: my tasks, the week's figures and my
 * notifications. Only used when the API is connected; on fixtures Home keeps
 * its own seeded tasks and figures.
 *
 * Tasks change on screen at once and the API's answer replaces the guess;
 * a refused change is put back with a short line saying why.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (ensure: () => void) => (l: Listener) => {
  ensure();
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/* ── tasks ── */

let open: readonly ApiTask[] = [];
let done: readonly ApiTask[] = [];
let tasksState: "idle" | "loading" | "ready" | "failed" = "idle";
type TaskSnap = { items: readonly DayTask[]; ready: boolean };
let taskSnap: TaskSnap = { items: [], ready: false };

function rebuildTasks() {
  const now = Date.now();
  taskSnap = { items: [...open, ...done].map((t) => tasksApi.dayTask(t, now)), ready: tasksState === "ready" || tasksState === "failed" };
  emit();
}

export function ensureTasks() {
  if (!LIVE || tasksState !== "idle") return;
  tasksState = "loading";
  Promise.all([tasksApi.listTasks("open"), tasksApi.listTasks("done")]).then(([o, d]) => {
    open = o;
    done = d;
    tasksState = "ready";
    rebuildTasks();
  }, () => {
    /* Home says so itself (`useHomeFailed`, with Try again); a line over every other page would be noise. */
    tasksState = "failed";
    rebuildTasks();
  });
}

/** A task made here and not confirmed by the server yet: its id is a stand-in until the answer arrives. */
const isStandIn = (t: ApiTask) => t.id.startsWith("t-");

/**
 * My tasks, and the ones I handed out, read again quietly: the agent made, moved or finished some, so a list
 * opened before it did stays right without a reload. What is on screen stays until the server's lists replace
 * it; a task being typed or being deleted (Undo still on offer) is kept as it is.
 */
export function refreshTasks() {
  if (!LIVE) return;
  if (tasksState === "ready" || tasksState === "failed") {
    Promise.all([tasksApi.listTasks("open"), tasksApi.listTasks("done")]).then(([o, d]) => {
      /* A task whose change is on its way keeps what the screen shows: the read may have been made before it landed. */
      open = [...open.filter((t) => isStandIn(t) || busy.has(t.id)), ...o.filter((t) => !leaving.has(t.id) && !busy.has(t.id))];
      done = [...done.filter((t) => busy.has(t.id)), ...d.filter((t) => !leaving.has(t.id) && !busy.has(t.id))];
      tasksState = "ready";
      rebuildTasks();
    }, () => { /* the lists on screen stay; the next read tries again */ });
  }
  /* The campaigns whose tasks a page is showing (the Overview's panel) are read again with them. */
  for (const [id, c] of camps) if (c.state !== "loading") loadCamp(id, true);
  const view = assignedView;
  if (view && (assignedState === "ready" || assignedState === "failed")) {
    tasksApi.listTasks("open", view).then((list) => {
      if (assignedView !== view) return;
      assigned = [...assigned.filter(isStandIn), ...list.filter((t) => !leaving.has(t.id))];
      assignedState = "ready";
      rebuildAssigned();
    }, () => {});
  }
}

/* ── tasks I handed to others (everyone's, for an admin) ── */

let assigned: readonly ApiTask[] = [];
let assignedView: tasksApi.TaskView | null = null;
let assignedState: "idle" | "loading" | "ready" | "failed" = "idle";
type AssignedSnap = { items: readonly DayTask[]; ready: boolean };
let assignedSnap: AssignedSnap = { items: [], ready: false };

function rebuildAssigned() {
  const now = Date.now();
  assignedSnap = {
    items: assigned.filter((t) => !closed(t) && !isMe(t.assigneeId)).map((t) => tasksApi.dayTask(t, now)),
    ready: assignedState === "ready" || assignedState === "failed",
  };
  emit();
}

function loadAssigned(view: tasksApi.TaskView) {
  assignedView = view;
  assignedState = "loading";
  tasksApi.listTasks("open", view).then((list) => {
    if (assignedView !== view) return;
    assigned = list;
    assignedState = "ready";
    rebuildAssigned();
  }, (err: unknown) => {
    if (assignedView !== view) return;
    assignedState = "failed";
    rebuildAssigned();
    reportProblem(`The tasks you assigned didn't load. ${messageOf(err)}`);
  });
}

/**
 * The open tasks I gave to teammates: for an admin, everyone's, so they can see who has what.
 * Mine are left out (they are in My tasks). Loaded once per view and kept in step with changes here.
 */
export function useAssignedTasks(view: "assigned" | "team"): AssignedSnap {
  return useSyncExternalStore(
    subscribe(() => { if (LIVE && (assignedView !== view || assignedState === "idle")) loadAssigned(view); }),
    () => assignedSnap,
  );
}

/** The handed-out tasks right now, outside React (and starts loading the view, like the hook does). */
export function assignedNow(view?: "assigned" | "team"): AssignedSnap {
  if (view && LIVE && (assignedView !== view || assignedState === "idle")) loadAssigned(view);
  return assignedSnap;
}

/** Gives an assigned task to someone else, at once on screen, and puts it back with a line if refused. */
export function reassignTask(id: string, assigneeId: string, assigneeName: string) {
  const t = assigned.find((x) => x.id === id);
  if (!t) return;
  assigned = assigned.map((x) => (x.id === id ? { ...x, assigneeId, assigneeName } : x));
  rebuildAssigned();
  tasksApi.reassignTask(id, assigneeId).then((saved) => {
    assigned = assigned.map((x) => (x.id === id ? saved : x));
    rebuildAssigned();
    /* given back to me: it belongs in My tasks now */
    if (isMe(saved.assigneeId)) { place(saved); rebuildTasks(); }
    refreshHome();
  }, (err: unknown) => {
    assigned = assigned.map((x) => (x.id === id ? t : x));
    rebuildAssigned();
    reportProblem(`"${t.title}" wasn't reassigned. ${messageOf(err)}`);
  });
}

/* ── a campaign's tasks (the Overview's Tasks panel) ──
   Everyone's tasks on one campaign, for whoever may see it: the server decides who that is. Loaded when a page
   asks, kept in step with every change made here (a task finished on Home leaves the panel at once, one added in
   the panel shows on Home), and read again with the rest whenever tasks are stale. */

type CampLists = { open: readonly ApiTask[]; done: readonly ApiTask[]; state: "loading" | "ready" | "failed" };
export type CampaignTasks = { open: readonly DayTask[]; done: readonly DayTask[]; ready: boolean; failed: boolean };

const camps = new Map<string, CampLists>();
const campSnaps = new Map<string, CampaignTasks>();
const NO_CAMPAIGN_TASKS: CampaignTasks = { open: [], done: [], ready: false, failed: false };
/** Tasks with a change on its way to the server: a read that was made before it landed must not undo it on screen. */
const busy = new Set<string>();

/**
 * Soonest first, undated last. Two tasks due at the same moment keep one order from one read to the next (newest
 * first, then by their words): the server leaves ties to chance, and a list that swaps two rows every time it is
 * read again looks like something moved.
 */
function byDue(list: readonly ApiTask[]): ApiTask[] {
  const at = (t: ApiTask) => (t.dueAt ? Date.parse(t.dueAt) : Number.POSITIVE_INFINITY);
  const made = (t: ApiTask) => Date.parse(t.createdAt) || 0;
  return [...list].sort((a, b) => {
    if (at(a) !== at(b)) return at(a) < at(b) ? -1 : 1;
    if (made(a) !== made(b)) return made(a) > made(b) ? -1 : 1;
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}

function rebuildCamp(id: string) {
  const c = camps.get(id);
  if (!c) return;
  const now = Date.now();
  campSnaps.set(id, {
    open: byDue(c.open).map((t) => tasksApi.dayTask(t, now)),
    done: c.done.map((t) => tasksApi.dayTask(t, now)),
    ready: c.state !== "loading",
    failed: c.state === "failed",
  });
  emit();
}

function loadCamp(id: string, quiet: boolean) {
  const was = camps.get(id);
  if (!quiet && was) { camps.set(id, { ...was, state: "loading" }); rebuildCamp(id); }
  Promise.all([tasksApi.listCampaignTasks(id, "open"), tasksApi.listCampaignTasks(id, "done")]).then(([o, d]) => {
    const here = camps.get(id);
    if (!here) return; // the workspace changed while this was on its way
    const keep = (list: readonly ApiTask[]) => list.filter((t) => busy.has(t.id) || isStandIn(t));
    const fresh = (list: readonly ApiTask[]) => list.filter((t) => !busy.has(t.id) && !leaving.has(t.id));
    camps.set(id, { open: [...keep(here.open), ...fresh(o)], done: [...keep(here.done), ...fresh(d)], state: "ready" });
    rebuildCamp(id);
  }, () => {
    const here = camps.get(id);
    /* A list that could not be read again stays as it was; one that never arrived says so (with Try again). */
    if (here && here.state === "loading") { camps.set(id, { ...here, state: "failed" }); rebuildCamp(id); }
  });
}

/** Starts reading a campaign's tasks (once). Called when a page asks for them. */
export function ensureCampaignTasks(id: string) {
  if (!LIVE || camps.has(id)) return;
  camps.set(id, { open: [], done: [], state: "loading" });
  loadCamp(id, true);
}

/** Asks again for a campaign's tasks after a read that did not arrive. */
export function retryCampaignTasks(id: string) {
  if (camps.get(id)?.state === "failed") loadCamp(id, false);
}

/** A campaign's tasks, pending soonest first and done newest first. Connected only; `ready` once they have arrived. */
export function useCampaignTasks(campaignId: string): CampaignTasks {
  const sub = useMemo(() => subscribe(() => ensureCampaignTasks(campaignId)), [campaignId]);
  const read = () => campSnaps.get(campaignId) ?? NO_CAMPAIGN_TASKS;
  /* The same value when drawn to a string (a test, or anything that draws without a browser). */
  const snap = useSyncExternalStore(sub, read, read);
  /* After the workspace changed the store was emptied under a page that stayed mounted: ask again. */
  useEffect(() => { ensureCampaignTasks(campaignId); });
  return snap;
}

/** A campaign's tasks right now, outside React (tests). */
export const campaignTasksNow = (campaignId: string): CampaignTasks => campSnaps.get(campaignId) ?? NO_CAMPAIGN_TASKS;

/** A task wherever the console holds it: mine, handed out, or on a campaign's list. */
function heldTask(id: string): ApiTask | undefined {
  const mine = [...open, ...done, ...assigned].find((x) => x.id === id);
  if (mine) return mine;
  for (const c of camps.values()) {
    const t = [...c.open, ...c.done].find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}

/** Puts a task in the right half (pending or done) of one campaign's list. */
function putInCamp(cid: string, t: ApiTask) {
  const c = camps.get(cid);
  if (!c) return;
  const open = c.open.filter((x) => x.id !== t.id);
  const done = c.done.filter((x) => x.id !== t.id);
  camps.set(cid, closed(t) ? { ...c, open, done: [t, ...done] } : { ...c, open: [t, ...open], done });
  rebuildCamp(cid);
}

/** A task on a campaign shows in that campaign's list, if a page has asked for it. */
const intoCamp = (t: ApiTask) => { if (t.campaign) putInCamp(t.campaign.id, t); };

/** Takes a task out of every campaign list (a delete, or a stand-in being replaced). */
function outOfCamps(id: string) {
  for (const [cid, c] of camps) {
    if (![...c.open, ...c.done].some((x) => x.id === id)) continue;
    camps.set(cid, { ...c, open: c.open.filter((x) => x.id !== id), done: c.done.filter((x) => x.id !== id) });
    rebuildCamp(cid);
  }
}

/**
 * A task as it is now, in every list that holds it: mine, the ones I handed out, and its campaign's. Finishing or
 * reopening moves it between the pending and done halves of each.
 */
function settle(next: ApiTask) {
  if ([...open, ...done].some((x) => x.id === next.id)) { place(next); rebuildTasks(); }
  if (assigned.some((x) => x.id === next.id)) {
    assigned = closed(next) ? assigned.filter((x) => x.id !== next.id) : assigned.map((x) => (x.id === next.id ? next : x));
    rebuildAssigned();
  }
  for (const [cid, c] of camps) if ([...c.open, ...c.done].some((x) => x.id === next.id)) putInCamp(cid, next);
}

/** My tasks right now, outside React. */
export const tasksNow = (): TaskSnap => taskSnap;

/** My tasks, open then done, as Home lists them. */
export function useMyTasks(): TaskSnap {
  return useSyncExternalStore(subscribe(ensureTasks), () => taskSnap);
}

const closed = (t: ApiTask) => t.status === "done" || t.status === "dismissed";

/* Puts a task in the open or done list by its status, newest first. */
function place(t: ApiTask) {
  open = open.filter((x) => x.id !== t.id);
  done = done.filter((x) => x.id !== t.id);
  if (closed(t)) done = [t, ...done]; else open = [t, ...open];
}

/** Done, or back to do. */
export function setTaskDone(id: string, on: boolean) {
  /* Mine, or one a campaign's panel shows (a teammate's, when the server lets this person change it). */
  const t = heldTask(id);
  if (!t) return;
  const status = on ? "done" : "todo";
  settle({ ...t, status, resolvedAt: on ? new Date().toISOString() : null });
  busy.add(id);
  tasksApi.setTaskStatus(id, status).then((saved) => { busy.delete(id); settle(saved); refreshHome(); }, (err: unknown) => {
    busy.delete(id);
    settle(t);
    reportProblem(`"${t.title}" wasn't updated. ${messageOf(err)}`);
  });
}

/** How long a deleted task can still be brought back; the toast that offers it lasts as long. */
export const UNDO_MS = 6000;

/** Tasks taken off the list whose delete has not gone to the server yet: Undo is still on offer. */
const leaving = new Map<string, { task: ApiTask; timer: ReturnType<typeof setTimeout> }>();

function commitRemoval(id: string) {
  const gone = leaving.get(id);
  if (!gone) return;
  leaving.delete(id);
  tasksApi.deleteTask(id).then(refreshHome, (err: unknown) => {
    place(gone.task);
    intoCamp(gone.task);
    rebuildTasks();
    reportProblem(`"${gone.task.title}" wasn't deleted. ${messageOf(err)}`);
  });
}

/**
 * Takes a task someone typed off the list (the server lets its maker or an admin delete it). It goes
 * from the screen at once and is deleted once `UNDO_MS` has passed without an undo.
 */
export function removeTask(id: string): boolean {
  const t = [...open, ...done].find((x) => x.id === id);
  if (!t || leaving.has(id)) return false;
  open = open.filter((x) => x.id !== id);
  done = done.filter((x) => x.id !== id);
  outOfCamps(id);
  rebuildTasks();
  leaving.set(id, { task: t, timer: setTimeout(() => commitRemoval(id), UNDO_MS) });
  return true;
}

/** Brings back a task that was taken off and not yet deleted. */
export function undoRemoveTask(id: string) {
  const gone = leaving.get(id);
  if (!gone) return;
  clearTimeout(gone.timer);
  leaving.delete(id);
  place(gone.task);
  intoCamp(gone.task);
  rebuildTasks();
}

/**
 * Changes a task's words or its day. It shows at once; the API's answer replaces the guess, and a
 * refused change is put back with a line saying why.
 */
export function editTask(id: string, patch: { title?: string; dueAt?: string | null }) {
  const t = heldTask(id);
  if (!t) return;
  const swap = (next: ApiTask) => {
    open = open.map((x) => (x.id === id ? next : x));
    done = done.map((x) => (x.id === id ? next : x));
    assigned = assigned.map((x) => (x.id === id ? next : x));
    for (const [cid, c] of camps) {
      if (![...c.open, ...c.done].some((x) => x.id === id)) continue;
      camps.set(cid, { ...c, open: c.open.map((x) => (x.id === id ? next : x)), done: c.done.map((x) => (x.id === id ? next : x)) });
      rebuildCamp(cid);
    }
    rebuildTasks();
    rebuildAssigned();
  };
  swap({ ...t, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}) });
  busy.add(id);
  tasksApi.updateTask(id, patch).then((saved) => { busy.delete(id); swap(saved); refreshHome(); }, (err: unknown) => {
    busy.delete(id);
    swap(t);
    reportProblem(`"${t.title}" wasn't changed. ${messageOf(err)}`);
  });
}

/** A task typed on Home: due when it says (today unless told otherwise), on the campaign Home is scoped to if any. */
export function addTask(
  title: string,
  campaign: { id: string; name: string } | null,
  assigneeId?: string,
  due?: string | null,
  /** Who it is for, by name, so the stand-in already reads right (the answer replaces it). */
  assigneeName?: string,
) {
  const dueAt = due === undefined ? tasksApi.endOfToday() : due;
  const temp: ApiTask = {
    id: `t-${Date.now().toString(36)}`, title, kind: "manual", status: "todo", dueAt, assigneeId: assigneeId ?? null,
    assigneeName: assigneeName ?? null, createdById: getSession().userId ?? null, createdByKind: "user",
    campaign, candidate: null, action: null, createdAt: new Date().toISOString(), resolvedAt: null,
  };
  /* A task for someone else is theirs, not mine: it joins the list of what I handed out. */
  const forOther = !!assigneeId && !isMe(assigneeId);
  if (forOther) { assigned = [temp, ...assigned]; rebuildAssigned(); } else { open = [temp, ...open]; rebuildTasks(); }
  /* On a campaign it shows in that campaign's own list (the Overview's panel) at once, whoever it is for. */
  intoCamp(temp);
  tasksApi.createTask({ title, campaignId: campaign?.id ?? null, dueAt, ...(assigneeId ? { assigneeId } : {}) }).then((made) => {
    if (forOther) { assigned = assigned.map((x) => (x.id === temp.id ? made : x)); rebuildAssigned(); }
    else { open = open.map((x) => (x.id === temp.id ? made : x)); rebuildTasks(); }
    outOfCamps(temp.id);
    intoCamp(made);
    refreshHome();
  }, (err: unknown) => {
    if (forOther) { assigned = assigned.filter((x) => x.id !== temp.id); rebuildAssigned(); }
    else { open = open.filter((x) => x.id !== temp.id); rebuildTasks(); }
    outOfCamps(temp.id);
    const named = title.length > 40 ? `${title.slice(0, 40).trimEnd()}…` : title;
    reportProblem(`"${named}" wasn't added. ${messageOf(err)}`);
  });
}

/* ── the week ── */

/* Keyed by campaign id, "" for every active campaign. */
const homes = new Map<string, ApiHome>();
const homeState = new Map<string, "loading" | "ready" | "failed">();

function ensureHome(campaignId = "") {
  if (!LIVE || homeState.has(campaignId)) return;
  homeState.set(campaignId, "loading");
  loadHome(campaignId);
}

function loadHome(campaignId: string) {
  homeOverview(7, campaignId || undefined).then((h) => { homes.set(campaignId, h); homeState.set(campaignId, "ready"); emit(); }, () => {
    /* A figure that could not be read again stays as it was; Home says so when it never had them. */
    if (!homes.has(campaignId)) homeState.set(campaignId, "failed");
    emit();
  });
}

/** The week and its figures again, quietly (the agent or another page changed what they count). */
export function refreshHome() {
  for (const id of homeState.keys()) loadHome(id);
}

/** The week across my active campaigns, or one of them; undefined until it arrives. */
export function useHomeOverview(campaignId?: string): ApiHome | undefined {
  const id = campaignId ? resolveCampaignId(campaignId) : "";
  return useSyncExternalStore(subscribe(() => ensureHome(id)), () => homes.get(id));
}

/** Whether Home has what it needs to draw. Always true on fixtures. */
export function useHomeReady(): boolean {
  return useSyncExternalStore(subscribe(() => { ensureHome(); ensureTasks(); }), () => {
    const home = homeState.get("");
    return !LIVE || ((home === "ready" || home === "failed") && (tasksState === "ready" || tasksState === "failed"));
  });
}

/** Whether Home's tasks or figures failed to load: it says so rather than "all clear". */
export function useHomeFailed(): boolean {
  return useSyncExternalStore(subscribe(() => { ensureHome(); ensureTasks(); }), () => LIVE && (homeState.get("") === "failed" || tasksState === "failed"));
}

/** The bell again now (the agent or a teammate changed what is addressed to me), if anything is watching it. */
export function refreshNotices() {
  if (!LIVE || noticeState === "idle") return;
  loadNotices();
}

export function retryHome() {
  if (tasksState === "failed") { tasksState = "idle"; ensureTasks(); }
  for (const [id, s] of homeState) if (s === "failed") { homeState.set(id, "loading"); loadHome(id); }
  emit();
}

/* ── notifications ── */

let notices: readonly ApiNotification[] = [];
let unread = 0;
let noticeState: "idle" | "loading" | "ready" = "idle";
/** `failed`: the last check didn't get through, so an empty list is not "all caught up". */
type NoticeSnap = { items: readonly ApiNotification[]; unread: number; ready: boolean; failed: boolean };
let noticeFailed = false;
let noticeSnap: NoticeSnap = { items: [], unread: 0, ready: false, failed: false };

/**
 * How often the bell checks while the tab is in front. An invitation or a request to join is something
 * someone is waiting on, so it shows within about this long without a reload; there is no push yet.
 */
export const POLL_MS = 15_000;
/** A write is followed by a check this soon (a burst of writes is one check). */
const AFTER_WRITE_MS = 800;

let noticeEpoch = 0;
let noticeInflight = false;
let noticeAgain = false;
let noticeWatchers = 0;
/** The one poll loop: its timer and the listeners that wake it. */
let stopNoticeLoop: (() => void) | null = null;

function rebuildNotices() {
  noticeSnap = { items: notices, unread, ready: noticeState === "ready", failed: noticeFailed };
  emit();
}

function loadNotices() {
  if (noticeInflight) { noticeAgain = true; return; }
  noticeInflight = true;
  const at = noticeEpoch;
  const settle = () => {
    if (at !== noticeEpoch) return;
    noticeInflight = false;
    if (noticeAgain) { noticeAgain = false; loadNotices(); }
  };
  tasksApi.listNotifications().then((r) => {
    if (at !== noticeEpoch) return;
    notices = r.notifications;
    unread = r.unread;
    noticeState = "ready";
    noticeFailed = false;
    rebuildNotices();
  }, () => {
    if (at !== noticeEpoch) return;
    noticeState = "ready";
    noticeFailed = true;
    rebuildNotices();
  }).then(settle, settle);
}

/**
 * The bell's single poll loop: every `POLL_MS` while the tab is visible, at once when the tab comes back
 * or is focused, and shortly after any write (an answer, an invite, a role change shows without waiting).
 * Starting it again replaces the old one, so a workspace change can never leave a second timer behind.
 */
function startNoticeLoop(): void {
  stopNoticeLoop?.();
  const stopPolling = pollWhileVisible(loadNotices, POLL_MS);
  let soon: ReturnType<typeof setTimeout> | null = null;
  const unwrite = onWrite((_method, path) => {
    if (path === "/v1/notifications/read" || soon !== null) return;
    soon = setTimeout(() => {
      soon = null;
      if (typeof document === "undefined" || !document.hidden) loadNotices();
    }, AFTER_WRITE_MS);
  });
  stopNoticeLoop = () => {
    stopPolling();
    if (soon !== null) clearTimeout(soon);
    unwrite();
    stopNoticeLoop = null;
  };
}

/** Starts reading the bell (once) and keeps it current. Called when anything starts watching it. */
export function ensureNotices() {
  if (!LIVE || noticeState !== "idle") return;
  noticeState = "loading";
  loadNotices();
  startNoticeLoop();
}

/** The bell's list right now, outside React (tests). */
export const noticesNow = (): NoticeSnap => noticeSnap;

/** Whether a poll loop is running (for tests). */
export const noticeLoopRunning = (): boolean => stopNoticeLoop !== null;

export function useNotifications(): NoticeSnap {
  return useSyncExternalStore(
    (l) => {
      noticeWatchers += 1;
      const off = subscribe(ensureNotices)(l);
      return () => { noticeWatchers -= 1; off(); };
    },
    () => noticeSnap,
  );
}

export function markAllRead() {
  const was = { notices, unread };
  if (!was.unread) return;
  const at = new Date().toISOString();
  notices = notices.map((n) => (n.readAt ? n : { ...n, readAt: at }));
  unread = 0;
  rebuildNotices();
  tasksApi.markNotificationsRead({ all: true }).then(() => {}, (err: unknown) => {
    notices = was.notices;
    unread = was.unread;
    rebuildNotices();
    reportProblem(`Couldn't mark these as read. ${messageOf(err)}`);
  });
}

export function markRead(id: string) {
  const was = { notices, unread };
  const at = new Date().toISOString();
  notices = notices.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: at } : n));
  unread = Math.max(0, unread - 1);
  rebuildNotices();
  tasksApi.markNotificationsRead({ ids: [id] }).then(() => {}, () => {
    notices = was.notices;
    unread = was.unread;
    rebuildNotices();
  });
}

/* ── answering from the bell ── */

/** What happens to the bell's list and count when `id` is answered; undone if the call is refused. */
function answering(id: string, change: (items: readonly ApiNotification[]) => ApiNotification[]): () => void {
  const was = { notices, unread };
  const mine = notices.find((n) => n.id === id);
  notices = change(notices);
  if (mine && !mine.readAt) unread = Math.max(0, unread - 1);
  rebuildNotices();
  return () => { notices = was.notices; unread = was.unread; rebuildNotices(); };
}

/** The invitation or request is not there to answer any more: withdrawn, run out, or answered elsewhere. */
export function isNoLongerThere(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 410);
}

/**
 * Accepts or declines an invitation from the bell. It leaves the list at once and comes back, with the reason,
 * if the API refuses. One that is no longer there stays gone (the list is read again) and says so calmly.
 * Accepting resolves with the organisation joined: the caller switches the console to it.
 */
export async function answerInvitation(
  id: string,
  accept: boolean,
): Promise<{ ok: true; organisationId: string | null } | { ok: false }> {
  const undo = answering(id, (items) => withoutNotice(items, id));
  try {
    if (accept) {
      const { organisationId } = await identityApi.acceptInvitation(id);
      // They are in it now: what the console asks next is for that workspace, not the one it is still drawn for.
      setTabWorkspace(organisationId);
      return { ok: true, organisationId };
    }
    await identityApi.declineInvitation(id);
    return { ok: true, organisationId: null };
  } catch (err) {
    if (isNoLongerThere(err)) {
      loadNotices();
      reportProblem("That invitation is no longer open.");
      return { ok: false };
    }
    undo();
    reportProblem(`${accept ? "That invitation wasn't accepted" : "That invitation wasn't declined"}. ${messageOf(err)}`);
    return { ok: false };
  }
}

/** Approves (as a recruiter; the role is changed in Members) or declines a request to join, from the bell. */
export async function answerRequest(noticeId: string, requestId: string, approve: boolean): Promise<boolean> {
  const undo = answering(noticeId, (items) => settleRequest(items, noticeId));
  try {
    await identityApi.decide(requestId, { approve, role: "recruiter" });
    loadNotices();
    return true;
  } catch (err) {
    if (isNoLongerThere(err)) {
      // Someone else answered it first: it stays as a quiet line, and the list is read again for how it went.
      loadNotices();
      reportProblem("Someone else already answered that request.");
      return false;
    }
    undo();
    reportProblem(`${approve ? "They weren't approved" : "The request wasn't declined"}. ${messageOf(err)}`);
    return false;
  }
}

/* ── lifecycle ── */

/** Test-only, and when the workspace changes: nothing carries over from the last one. */
export function resetHomeStore(): void {
  for (const g of leaving.values()) clearTimeout(g.timer);
  leaving.clear();
  busy.clear();
  camps.clear();
  campSnaps.clear();
  open = [];
  done = [];
  tasksState = "idle";
  taskSnap = { items: [], ready: false };
  assigned = [];
  assignedView = null;
  assignedState = "idle";
  assignedSnap = { items: [], ready: false };
  homes.clear();
  homeState.clear();
  notices = [];
  unread = 0;
  noticeState = "idle";
  noticeFailed = false;
  noticeEpoch += 1;
  noticeInflight = false;
  noticeAgain = false;
  stopNoticeLoop?.();
  noticeSnap = { items: [], unread: 0, ready: false, failed: false };
  emit();
  // Still being watched (the bell is on screen): carry on with the new workspace's, in one loop.
  if (noticeWatchers > 0) ensureNotices();
}
onWorkspaceChange(resetHomeStore);

import { useSyncExternalStore } from "react";
import type { Bucket, OverviewAgent } from "./AgentsOverview";
import type { ApiActivity } from "./api/campaigns";
import { campaignActivity } from "./api/campaigns";
import { api, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import type { Question } from "./clarify";
import { watchesChanged } from "./liveChat";
import type { Activity } from "./moments";
import type { RunState } from "./orchestrator";

/**
 * The agents the console can show are the server's keep-sourcing watches (an agent row with a
 * schedule) and the runs behind them. This maps a watch onto the shape the owner's fleet
 * components draw (`OverviewAgent`), and holds the one list the Status and Assign views share.
 *
 * Nothing here is invented: a watch's state and reason are the server's words, its counter is the
 * number of people it kept, its steps are its own life (started, looking, finished), and its
 * recent activity is the runs it made and the log lines the server wrote.
 */

/* ── what the API sends (server: modules/sourcing/watch.ts, `GET /v1/agents`) ── */

export type Cadence = "hourly" | "every_4h" | "daily" | "weekly";
export type WatchStop = { profiles?: number; until?: string };
export type WatchStatus = "queued" | "running" | "waiting" | "paused" | "done" | "stopped" | "error";

export type WatchAgent = {
  id: string;
  campaignId: string;
  /** Present on the list; the answer to a start or a change doesn't carry it. */
  campaignName?: string;
  role: string;
  state: WatchStatus;
  stateReason: string | null;
  summary: string;
  config: { stop: WatchStop; cadence: Cadence };
  counters: { found: number; emptyRuns?: number };
  startedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt?: string;
};

export type WatchAction = "pause" | "resume" | "stop";

export const listAgents = (): Promise<WatchAgent[]> =>
  api<{ agents: WatchAgent[] }>("GET", "/v1/agents").then((r) => r.agents);

export const startWatchOn = (
  campaignId: string,
  body: { stop: WatchStop; cadence?: Cadence },
): Promise<WatchAgent> =>
  api<WatchAgent>("POST", `/v1/campaigns/${campaignId}/watch`, body).then((a) => {
    watchesChanged();
    return a;
  });

export const controlAgent = (id: string, action: WatchAction): Promise<WatchAgent> =>
  api<WatchAgent>("PATCH", `/v1/agents/${id}`, { action }).then((a) => {
    watchesChanged();
    return a;
  });

/* ── time, in the console's words ─────────────────────────────────────────── */

const MIN = 60_000;
const DAY = 86_400_000;

const minutesSince = (iso: string | null | undefined, now: number): number | null => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / MIN)) : null;
};

/** "Just now", "12 min ago", "3 h ago", "Yesterday", then the date. */
export function ago(iso: string, now = Date.now()): string {
  const mins = minutesSince(iso, now);
  if (mins === null) return "";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  if (Math.round((midnight(now) - midnight(Date.parse(iso))) / DAY) === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Today 14:08", "Yesterday 09:10", "4 Oct 14:08". */
export function clock(iso: string | null | undefined, now = Date.now()): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Today ${time}`;
  if (same(d, new Date(now - DAY))) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${time}`;
}

/** "next check in 12 min", from the time the server says it looks again. */
export function nextCheck(nextRunAt: string | null, now = Date.now()): string | null {
  const t = nextRunAt ? Date.parse(nextRunAt) : Number.NaN;
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((t - now) / MIN);
  if (mins <= 1) return "checking again shortly";
  if (mins < 60) return `next check in ${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `next check in ${hours} h` : `next check in ${Math.round(hours / 24)} days`;
}

/* ── a watch as one of the fleet's agents ─────────────────────────────────── */

/** A pause the recruiter made is a rest; any other pause is the agent waiting on a person. */
const pausedByYou = (reason: string | null): boolean =>
  !reason?.trim() || /^paused by you/i.test(reason.trim());

export function bucketOf(a: Pick<WatchAgent, "state" | "stateReason">): Bucket {
  switch (a.state) {
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "waiting":
      return "waiting";
    case "error":
      return "error";
    case "done":
      return "done";
    case "stopped":
      return "ended";
    case "paused":
      return pausedByYou(a.stateReason) ? "paused" : "waiting";
  }
}

/** The colour family each bucket borrows from the fleet's five states. */
export const LOOK: Readonly<Record<Bucket, RunState>> = {
  waiting: "waiting",
  error: "error",
  running: "running",
  paused: "queued",
  queued: "queued",
  done: "done",
  ended: "queued",
};

export const WORD: Readonly<Record<Bucket, string>> = {
  waiting: "Needs you",
  error: "Stopped",
  running: "Running",
  paused: "Paused",
  queued: "Queued",
  done: "Done",
  ended: "Ended",
};

/** Most in need of a person first. */
export const BUCKET_RANK: Readonly<Record<Bucket, number>> = {
  waiting: 0,
  error: 1,
  running: 2,
  paused: 3,
  queued: 4,
  done: 5,
  ended: 6,
};

const isEnded = (a: Pick<WatchAgent, "state">) => a.state === "done" || a.state === "stopped";

const SINCE_ENDED_DAYS = 7;

const endedLately = (a: WatchAgent, now: number): boolean => {
  const t = Date.parse(a.updatedAt ?? a.lastRunAt ?? a.startedAt);
  return !Number.isFinite(t) || now - t <= SINCE_ENDED_DAYS * DAY;
};

/** What the overview lists: every agent still going, and the ones that finished in the last week. */
export const recentAgents = (list: readonly WatchAgent[], now = Date.now()): WatchAgent[] =>
  list.filter((a) => !isEnded(a) || endedLately(a, now));

/**
 * What the strip shows: every agent still going, and for a campaign with none going, the last
 * one that finished if that was in the last week. Older history stays in the overview.
 */
export function visibleAgents(list: readonly WatchAgent[], now = Date.now()): WatchAgent[] {
  const going = new Set(list.filter((a) => !isEnded(a)).map((a) => a.campaignId));
  const last = new Map<string, WatchAgent>();
  for (const a of list) {
    if (!isEnded(a) || going.has(a.campaignId) || !endedLately(a, now)) continue;
    const prev = last.get(a.campaignId);
    if (!prev || Date.parse(a.startedAt) > Date.parse(prev.startedAt)) last.set(a.campaignId, a);
  }
  return list.filter((a) => (isEnded(a) ? last.get(a.campaignId) === a : true));
}

/** Those needing attention first, then running, then the rest; newest first inside a group. */
export function rankAgents<T extends Pick<WatchAgent, "state" | "stateReason" | "startedAt">>(
  list: readonly T[],
): T[] {
  return [...list].sort(
    (a, b) =>
      BUCKET_RANK[bucketOf(a)] - BUCKET_RANK[bucketOf(b)] ||
      Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}

/** The agents on one campaign, or all of them (`null`). */
export const scopeAgents = <T extends Pick<WatchAgent, "campaignId">>(
  list: readonly T[],
  campaignId: string | null,
): T[] => (campaignId ? list.filter((a) => a.campaignId === campaignId) : [...list]);

export const roleName = (role: string): string =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : "Sourcing";

/** What it is doing, in one line, in the server's words where it gave a reason. */
export function doingLine(
  a: Pick<WatchAgent, "state" | "stateReason" | "nextRunAt">,
  now = Date.now(),
): string {
  const reason = a.stateReason?.trim() || null;
  switch (bucketOf(a)) {
    case "running": {
      // A reason on a running watch is why it is waiting (scoring was down, today's budget is
      // used); it replaces the cheerful line, which would read as if all were well.
      const why = reason?.replace(/\.$/, "") ?? "Keeping an eye out for new people";
      return [why, nextCheck(a.nextRunAt, now)].filter(Boolean).join(" · ");
    }
    case "paused":
      return "Paused by you. Resume it to keep looking.";
    case "waiting":
      return reason ?? "Waiting for you";
    case "error":
      return reason ?? "It stopped on a problem";
    case "done":
      return reason ?? "Finished";
    case "ended":
      return reason ?? "Stopped by you.";
    case "queued":
      return "About to start";
  }
}

/** How far along it is, from what the watch itself is counting: people found, or days gone. */
export function progressOf(
  a: Pick<WatchAgent, "config" | "counters" | "startedAt">,
  now = Date.now(),
): number {
  const { profiles, until } = a.config.stop;
  const parts: number[] = [];
  if (profiles) parts.push(a.counters.found / profiles);
  const start = Date.parse(a.startedAt);
  const end = until ? Date.parse(until) : Number.NaN;
  if (Number.isFinite(end) && Number.isFinite(start) && end > start)
    parts.push((now - start) / (end - start));
  return Math.max(0, Math.min(1, parts.length ? Math.max(...parts) : 0));
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Its own life, in three steps: it started, it looks, it ends. */
export function stepsOf(a: Pick<WatchAgent, "state" | "config">): string[] {
  const { profiles, until } = a.config.stop;
  const goal =
    a.state === "done"
      ? "Finished"
      : a.state === "stopped"
        ? "Stopped by you"
        : profiles && until
          ? `Reaches ${profiles} people or ${dayMonth(until)}`
          : profiles
            ? `Reaches ${profiles} people`
            : until
              ? `Runs until ${dayMonth(until)}`
              : "Finishes";
  return ["Started", "Looking for people", goal];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Three counts the server keeps or that follow from them. `searches` arrives once the runs are read. */
export function metricsOf(
  a: Pick<WatchAgent, "config" | "counters">,
  searches: number | null,
  now = Date.now(),
) {
  const found = a.counters.found;
  const { profiles, until } = a.config.stop;
  const out = [{ label: "found", n: found, d: 0 }];
  if (profiles) out.push({ label: "still to find", n: Math.max(0, profiles - found), d: 0 });
  else if (until) {
    const days = Math.max(0, Math.ceil((Date.parse(until) - now) / DAY));
    out.push({ label: plural(days, "day left", "days left"), n: days, d: 0 });
  }
  if (searches !== null)
    out.push({ label: plural(searches, "search made", "searches made"), n: searches, d: 0 });
  return out;
}

export type Recent = { activity: Activity[]; searches: number; endedAt?: string | null };

/** An agent in the shape the fleet's strip and overview draw. */
export function toOverviewAgent(
  a: WatchAgent,
  recent: Recent | null = null,
  now = Date.now(),
): OverviewAgent {
  const bucket = bucketOf(a);
  const ended = isEnded(a);
  const reason = a.stateReason?.trim() || null;
  const last = minutesSince(
    ended ? (a.updatedAt ?? a.lastRunAt ?? a.startedAt) : (a.lastRunAt ?? a.startedAt),
    now,
  );
  const attention =
    bucket === "waiting"
      ? {
          tone: "ask" as const,
          title: a.state === "paused" ? "Paused, and waiting for you" : "Waiting for you",
          body: reason ?? "It needs a decision before it carries on.",
        }
      : bucket === "error"
        ? { tone: "bad" as const, title: "It stopped on a problem", body: reason ?? "Something went wrong." }
        : undefined;
  const controls: OverviewAgent["controls"] =
    a.state === "running"
      ? [
          { action: "pause", label: "Pause" },
          { action: "stop", label: "Stop" },
        ]
      : a.state === "paused" || a.state === "waiting" || a.state === "error"
        ? [
            { action: "resume", label: "Resume", primary: !!attention },
            { action: "stop", label: "Stop" },
          ]
        : a.state === "queued"
          ? [{ action: "stop", label: "Stop" }]
          : [];
  return {
    id: a.id,
    campaignId: a.campaignId,
    campaignName: a.campaignName ?? "a campaign",
    role: roleName(a.role),
    state: LOOK[bucket],
    bucket,
    step: ended ? 2 : 1,
    steps: stepsOf(a),
    doing: doingLine(a, now),
    seenAgo: last ?? 0,
    progress: progressOf(a, now),
    metrics: metricsOf(a, recent ? recent.searches : null, now),
    times: [
      clock(a.startedAt, now),
      clock(a.lastRunAt, now),
      ended ? clock(recent?.endedAt ?? a.updatedAt, now) : "",
    ],
    ...(recent ? { activity: recent.activity } : {}),
    ...(attention ? { attention } : {}),
    ...(bucket === "error"
      ? {
          fault: {
            kind: "agent" as const,
            what: reason ?? "Something went wrong.",
            fix: "Resume it, or stop it and start again",
          },
        }
      : {}),
    controls,
  };
}

/** One line over the strip. */
export function fleetLead(
  agents: readonly Pick<OverviewAgent, "role" | "campaignName" | "bucket">[],
): string {
  const first = agents[0];
  if (!first) return "";
  const bucket = (a: Pick<OverviewAgent, "bucket">) => a.bucket ?? "running";
  if (agents.length === 1) {
    return `${first.role} on ${first.campaignName}: ${WORD[bucket(first)].toLowerCase()}. The overview has its steps and recent activity.`;
  }
  const needs = agents.filter((a) => bucket(a) === "waiting" || bucket(a) === "error").length;
  if (needs > 0)
    return `${agents.length} agents. ${needs} ${plural(needs, "needs", "need")} you, and ${plural(needs, "it's", "they're")} first.`;
  const running = agents.filter((a) => bucket(a) === "running").length;
  if (running === agents.length) return `${agents.length} agents, all running.`;
  return running === 0
    ? `${agents.length} agents, none running.`
    : `${agents.length} agents. ${running} running.`;
}

/** The campaigns that have an agent among `list`, with how many each. */
export function campaignsOf(
  list: readonly Pick<WatchAgent, "campaignId" | "campaignName">[],
): { id: string; name: string; agents: number }[] {
  const out = new Map<string, { id: string; name: string; agents: number }>();
  for (const a of list) {
    const row = out.get(a.campaignId) ?? {
      id: a.campaignId,
      name: a.campaignName ?? "a campaign",
      agents: 0,
    };
    row.agents++;
    out.set(a.campaignId, row);
  }
  return [...out.values()];
}

/* ── what the agent has been doing, from its runs and the campaign's log ──── */

export type WatchRun = {
  id: string;
  skill: string;
  status: string;
  campaignId: string | null;
  createdAt: string;
  finishedAt: string | null;
  error: { message: string } | null;
};
export type RunOutput = { kept?: number } | null;

/** The runs a watch made: this campaign's `watch` runs from the time it started. */
export function watchRuns(
  runs: readonly WatchRun[],
  a: Pick<WatchAgent, "campaignId" | "startedAt">,
): WatchRun[] {
  const since = Date.parse(a.startedAt) - 5_000;
  return runs.filter(
    (r) => r.skill === "watch" && r.campaignId === a.campaignId && Date.parse(r.createdAt) >= since,
  );
}

const LOG_VERB: Readonly<Record<string, string>> = {
  watch_started: "started it",
  watch_paused: "paused it",
  watch_resumed: "resumed it",
  watch_stopped: "stopped it",
  watch_changed: "changed its settings",
};

/** Run and log lines for one watch, newest first. */
export function activityFrom(
  a: Pick<WatchAgent, "campaignId" | "startedAt">,
  runs: readonly WatchRun[],
  outputs: Readonly<Record<string, RunOutput>>,
  log: readonly ApiActivity[],
  me: string | null,
  now = Date.now(),
): Activity[] {
  const rows: { t: number; line: Activity }[] = [];
  const since = Date.parse(a.startedAt) - 5_000;

  for (const r of watchRuns(runs, a)) {
    const at = r.finishedAt ?? r.createdAt;
    const kept = outputs[r.id]?.kept;
    let line: Activity;
    if (r.status === "done") {
      line =
        typeof kept === "number"
          ? {
              at: ago(at, now),
              what:
                kept > 0
                  ? `Searched and found ${kept} ${plural(kept, "person", "people")} worth a look`
                  : "Searched, and nobody new was worth a look",
              ...(kept > 0 ? { tone: "good" as const } : {}),
            }
          : { at: ago(at, now), what: "Searched for people" };
    } else if (r.status === "failed") {
      line = {
        at: ago(at, now),
        what: `A search didn't finish: ${r.error?.message ?? "it hit an error"}`,
        tone: "bad",
      };
    } else if (r.status === "cancelled") {
      line = { at: ago(at, now), what: "A search was stopped" };
    } else {
      line = { at: ago(at, now), what: "Searching now" };
    }
    rows.push({ t: Date.parse(at), line });
  }

  for (const e of log) {
    const verb = LOG_VERB[e.verb];
    const t = Date.parse(e.at);
    if (!verb || e.subjectKind !== "campaign" || !Number.isFinite(t) || t < since) continue;
    const who =
      e.actorKind === "user"
        ? e.actorId && e.actorId === me
          ? "You"
          : (e.actorName ?? "Someone")
        : "The agent";
    const summary = typeof e.data.summary === "string" && e.data.summary ? `: ${e.data.summary}` : "";
    rows.push({
      t,
      line: {
        at: ago(e.at, now),
        what: `${who} ${verb}${e.verb === "watch_started" || e.verb === "watch_changed" ? summary : ""}`,
      },
    });
  }

  return rows
    .sort((x, y) => y.t - x.t)
    .slice(0, 7)
    .map((r) => r.line);
}

/** When the recruiter stopped it, from the campaign's log, which the agent's own row doesn't keep. */
export function stoppedAt(
  a: Pick<WatchAgent, "state" | "startedAt">,
  log: readonly ApiActivity[],
): string | null {
  if (a.state !== "stopped") return null;
  const since = Date.parse(a.startedAt) - 5_000;
  const hit = log.find(
    (e) => e.verb === "watch_stopped" && e.subjectKind === "campaign" && Date.parse(e.at) >= since,
  );
  return hit?.at ?? null;
}

let meCache: Promise<string | null> | null = null;
const whoAmI = (): Promise<string | null> => {
  meCache ??= api<{ user: { id: string } }>("GET", "/v1/me").then(
    (r) => r.user.id,
    () => null,
  );
  return meCache;
};

/** Reads what the server recorded about one watch: its runs, what each kept, the campaign's log. */
export async function recentWork(a: WatchAgent, now = Date.now()): Promise<Recent> {
  const [runs, log, me] = await Promise.all([
    api<{ runs: WatchRun[] }>("GET", "/v1/runs?limit=100").then(
      (r) => r.runs,
      () => [] as WatchRun[],
    ),
    campaignActivity(a.campaignId, 40).catch(() => [] as ApiActivity[]),
    whoAmI(),
  ]);
  const mine = watchRuns(runs, a);
  const outputs: Record<string, RunOutput> = {};
  await Promise.all(
    mine.slice(0, 4).map(async (r) => {
      outputs[r.id] = await api<{ run: { output: RunOutput } }>("GET", `/v1/runs/${r.id}`).then(
        (d) => d.run.output,
        () => null,
      );
    }),
  );
  return {
    activity: activityFrom(a, runs, outputs, log, me, now),
    searches: mine.length,
    endedAt: stoppedAt(a, log),
  };
}

/* ── the list every view shares ───────────────────────────────────────────── */

type Snap = { status: "loading" | "ready" | "failed"; agents: readonly WatchAgent[]; error: string | null };

let snap: Snap = { status: "loading", agents: [], error: null };
const listeners = new Set<() => void>();
let timer: number | null = null;
let inflight: Promise<void> | null = null;
const REFRESH_MS = 20_000;

const publish = (next: Snap) => {
  snap = next;
  for (const l of listeners) l();
};

/** Reads the list again. Two views asking at once share one request. */
export function refreshAgents(): Promise<void> {
  inflight ??= listAgents()
    .then(
      (agents) => publish({ status: "ready", agents, error: null }),
      (err: unknown) =>
        publish({
          status: snap.status === "ready" ? "ready" : "failed",
          agents: snap.agents,
          error: messageOf(err),
        }),
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/* The watches are the workspace's: the other one's are not shown while the new ones load. */
onWorkspaceChange(() => {
  inflight = null;
  publish({ status: "loading", agents: [], error: null });
});

/** An agent the server just answered with (a start, a pause), put straight into the list. */
export function applyAgent(next: WatchAgent): void {
  const old = snap.agents.find((a) => a.id === next.id);
  const merged: WatchAgent = { ...next, campaignName: next.campaignName ?? old?.campaignName };
  const agents = old ? snap.agents.map((a) => (a.id === next.id ? merged : a)) : [merged, ...snap.agents];
  publish({ status: "ready", agents, error: null });
}

export const agentsNow = (): readonly WatchAgent[] => snap.agents;

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (listeners.size === 1) {
    void refreshAgents();
    timer = window.setInterval(() => void refreshAgents(), REFRESH_MS);
  } else if (snap.status === "failed") {
    void refreshAgents();
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/** The workspace's agents, refreshed while anything is showing them. */
export function useWatchAgents(): Snap & { reload: () => void } {
  const s = useSyncExternalStore(subscribe, () => snap);
  return { ...s, reload: () => void refreshAgents() };
}

/* ── choosing when it stops ───────────────────────────────────────────────── */

export const WATCH_LIMITS = { maxProfiles: 200, maxDays: 30, perRun: 5 } as const;

/** What the recruiter picks: a number of people, or how many days. */
export type StopChoice = { profiles?: number; days?: number };

const CADENCE_LABEL: Readonly<Record<Cadence, string>> = {
  hourly: "Every hour",
  every_4h: "Every 4 hours",
  daily: "Once a day",
  weekly: "Once a week",
};

/** How often a watch looks, in words. A cadence a newer server adds still reads as something, never as "undefined". */
export function cadenceLabel(cadence: string): string {
  return CADENCE_LABEL[cadence as Cadence] ?? "Regularly";
}

export const STOP_OPTIONS: readonly { id: string; label: string; choice: StopChoice }[] = [
  { id: "p10", label: "10 people", choice: { profiles: 10 } },
  { id: "p20", label: "20 people", choice: { profiles: 20 } },
  { id: "p50", label: "50 people", choice: { profiles: 50 } },
  { id: "d7", label: "For a week", choice: { days: 7 } },
  { id: "d14", label: "For 2 weeks", choice: { days: 14 } },
];

export const choiceFor = (id: string | undefined): StopChoice | null =>
  STOP_OPTIONS.find((o) => o.id === id)?.choice ?? null;

const WORD_NUMBER: Readonly<Record<string, number>> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * A number of people or a stretch of time the recruiter already said ("keep looking for 25
 * people", "for two weeks"), so the question isn't asked twice. At most a month, as the server allows.
 */
export function stopFromText(said: string): StopChoice | null {
  const s = said.toLowerCase();
  const out: StopChoice = {};
  const people = /\b(\d{1,3})\s+(?:more\s+|new\s+)?(?:people|candidates|profiles|prospects)\b/.exec(s);
  if (people) out.profiles = Math.min(WATCH_LIMITS.maxProfiles, Math.max(1, Number(people[1])));
  const span =
    /\b(?:for|over|next|until)\s+(?:the\s+next\s+)?(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(day|week|month)s?\b/.exec(
      s,
    );
  if (span) {
    const word = span[1] ?? "";
    const n = /^\d/.test(word) ? Number(word) : (WORD_NUMBER[word] ?? 1);
    const unit = span[2] === "day" ? 1 : span[2] === "week" ? 7 : 30;
    out.days = Math.min(WATCH_LIMITS.maxDays, Math.max(1, n * unit));
  }
  return out.profiles !== undefined || out.days !== undefined ? out : null;
}

/** The body the API wants. The end date is worked out when the recruiter presses start. */
export function startBody(choice: StopChoice, now = Date.now()): { stop: WatchStop } {
  const stop: WatchStop = {};
  if (choice.profiles !== undefined) stop.profiles = choice.profiles;
  // A minute short of the limit, so a month still counts as a month by the time it arrives.
  if (choice.days !== undefined)
    stop.until = new Date(now + Math.min(choice.days, WATCH_LIMITS.maxDays) * DAY - MIN).toISOString();
  return { stop };
}

/** What starting will do, in the words the server's own summary uses ("Every 4 hours, 5 at a time, until 20 people"). */
export function previewSummary(choice: StopChoice, cadence: Cadence = "every_4h", now = Date.now()): string {
  const { stop } = startBody(choice, now);
  const parts: string[] = [];
  if (stop.profiles !== undefined) parts.push(`until ${stop.profiles} people`);
  if (stop.until) parts.push(`until ${dayMonth(stop.until)}`);
  return `${cadenceLabel(cadence)}, ${WATCH_LIMITS.perRun} at a time, ${parts.join(" or ")}`;
}

/** The server's refusals, said so a recruiter knows what to do next. */
export function refusalCopy(message: string): { text: string; needsSpec: boolean } {
  if (/approve the role spec/i.test(message)) {
    return {
      text: "This campaign has no approved role spec yet. The agent needs it to know who fits, so approve one first.",
      needsSpec: true,
    };
  }
  return { text: message, needsSpec: false };
}

/* ── the questions, with live options ─────────────────────────────────────── */

/** "Which campaign's agents?" The campaigns that have one, and "all of them". */
export function statusQuestion(campaigns: readonly { id: string; name: string; agents: number }[]): Question {
  const total = campaigns.reduce((n, c) => n + c.agents, 0);
  return {
    id: "campaign",
    found: `Agents are on ${campaigns.length} campaigns`,
    ask: "Which campaign's agents do you want to see?",
    options: [
      ...campaigns.map((c) => ({
        id: c.id,
        label: c.name,
        meta: `${c.agents} ${plural(c.agents, "agent", "agents")}`,
      })),
      { id: "all", label: "All of them", meta: `${total} agents` },
    ],
    dense: true,
    step: "Campaign",
    apply: ([id]) => ({ answers: { campaignId: id ?? "" } }),
  };
}

/** "When should it stop?" Tiles for how many people or how long. */
export function stopQuestion(campaignName: string): Question {
  return {
    id: "stop",
    found: `Sourcing on ${campaignName} has no end point yet`,
    ask: "When should it stop looking?",
    why: `It looks every 4 hours and keeps ${WATCH_LIMITS.perRun} at a time, so it never runs on without you.`,
    options: STOP_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    step: "Stops",
    apply: ([id]) => ({ answers: { stop: id ?? "" } }),
  };
}

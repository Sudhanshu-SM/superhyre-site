import { onDecision } from "./api/agent";
import { LIVE, onWrite } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { refreshCampaign, refreshCampaignsNow, refreshClients, refreshMembers, refreshOpenCampaigns } from "./campaignStore";
import { reloadConnections } from "./connectionsStore";
import { refreshFormCounts } from "./formsStore";
import { refreshHome, refreshNotices, refreshTasks } from "./homeStore";
import { onChatEffects, onChatRunEnd, watchesChanged } from "./liveChat";
import { memoryNow, openMemory, reloadMemoryStats } from "./memoryStore";
import { schedulesChanged } from "./schedulesStore";
import { reloadSpec } from "./specDraft";
import type { CapabilityEffect } from "./agentEvents";

/**
 * One way to say "this changed, read it again".
 *
 * Every write that is not made by the person's own click lands here with the views it left stale: an `effect`
 * event from the chat, an approval that was answered, a page that is looked at again after a while. The
 * refresh is quiet: what is on screen stays until the server's numbers replace it, so the board, Shortlisted,
 * Candidates, the Overview funnel and the Agent page's counts always read the same figures as the chat.
 *
 * A console button that writes already reconciles the place it wrote to (the move shows at once, then the
 * server's answer replaces it). What it cannot know is who else shows the same people, so `effectsOfWrite`
 * names only that.
 */

/* ── the views, and how each is read again ──────────────────────────────────────────────────────────────
   One table names every store the console keeps. A change says what it touched (an effect kind, a capability, a
   page that is looked at again) and the tables below turn that into the views to read; nothing else in the
   console decides what is stale. */

/** What the console shows, each with one way to be read again. */
export type View =
  /** Home: my tasks, and the ones I handed out. */
  | "tasks"
  /** Home's and the Agent page's week: the figures. */
  | "week"
  /** The bell: its list and its badge. */
  | "bell"
  /** The sidebar's campaign list, the Campaigns page and the counts on their rows. */
  | "campaigns"
  /** Each opened campaign's board: Pipeline, Shortlisted, the Overview's funnel and log. */
  | "boards"
  | "clients"
  /** The team: Settings > Members, and who a campaign can be given to. */
  | "members"
  | "connections"
  | "memory"
  | "schedules"
  /** A campaign's role spec. */
  | "specs"
  /** The agent rail's watches. */
  | "watches"
  /** A campaign's forms: their response counts. */
  | "forms"
  /** Pages that keep their own lists (Candidates, Calls) are told through `onInvalidate`; these two are for them. */
  | "candidates"
  | "calls";

/** The campaigns a change is about: the ones named, or every one that has been opened. */
function eachCampaign(ids: ReadonlySet<string | null>, fn: (id: string) => void): void {
  if (ids.has(null)) refreshOpenCampaigns();
  for (const id of ids) if (id !== null) fn(id);
}

type Campaigns = ReadonlySet<string | null>;

/** How each view is read again. The one place a store is named. */
export const READ: Readonly<Record<View, (campaigns: Campaigns) => void>> = {
  tasks: () => refreshTasks(),
  week: () => refreshHome(),
  bell: () => refreshNotices(),
  campaigns: () => refreshCampaignsNow(),
  boards: (c) => eachCampaign(c, refreshCampaign),
  clients: () => refreshClients(),
  members: () => refreshMembers(),
  connections: () => void reloadConnections(),
  memory: () => {
    void reloadMemoryStats();
    if (memoryNow().list !== "idle") void openMemory();
  },
  schedules: () => void schedulesChanged(),
  specs: (c) => eachCampaign(c, (id) => void reloadSpec(id)),
  watches: () => watchesChanged(),
  forms: (c) => eachCampaign(c, (id) => void refreshFormCounts(id)),
  // Told to the pages through onInvalidate (see EFFECT_OF_VIEW): nothing to read here.
  candidates: () => {},
  calls: () => {},
};

/** The effect a page that keeps its own list listens for, for a view that is only ever told to it. */
const EFFECT_OF_VIEW: Partial<Record<View, CapabilityEffect>> = { candidates: "candidates", calls: "calls" };

/** What each kind of effect (the server's vocabulary) leaves stale. */
export const VIEWS_OF_EFFECT: Readonly<Record<CapabilityEffect, readonly View[]>> = {
  campaign: ["boards", "campaigns", "week"],
  pipeline: ["boards", "campaigns", "week"],
  candidates: ["week", "candidates"],
  clients: ["clients"],
  // People and who has what: members, the work given to them, and what is addressed to them.
  team: ["members", "tasks", "bell"],
  connections: ["connections"],
  memory: ["memory"],
  schedules: ["schedules", "tasks", "bell"],
  spec: ["specs", "boards", "campaigns", "week"],
  sourcing: ["watches", "boards", "campaigns", "week"],
  calls: ["calls"],
};

/**
 * What a capability (or an approved action) leaves stale beyond its effect kinds: the server's vocabulary has no
 * word for tasks, an owner or the bell, so these say it by name. Keyed by the capability's id as an `effect` or
 * `result` event gives it, and by the action's name where only that is known.
 */
export const VIEWS_OF_CAPABILITY: Readonly<Record<string, readonly View[]>> = {
  // Tasks
  "team.create_task": ["tasks", "week", "bell"],
  create_tasks: ["tasks", "week", "bell"],
  // Who has what
  "pipeline.assign_owner": ["tasks", "boards", "campaigns", "members", "bell", "candidates"],
  assign_owner: ["tasks", "boards", "campaigns", "members", "bell", "candidates"],
  "campaign.set_owner": ["tasks", "boards", "campaigns", "members", "bell", "week"],
  set_campaign_owner: ["tasks", "boards", "campaigns", "members", "bell", "week"],
  "campaign.team": ["tasks", "boards", "campaigns", "members", "bell"],
  campaign_team: ["tasks", "boards", "campaigns", "members", "bell"],
  // Closing, reopening and making campaigns
  "campaign.set_status": ["campaigns", "boards", "week", "watches"],
  set_status: ["campaigns", "boards", "week", "watches"],
  "campaign.create": ["campaigns", "week", "clients"],
  create_campaign: ["campaigns", "week", "clients"],
  "campaign.duplicate": ["campaigns", "week"],
  "campaign.update": ["campaigns", "boards", "clients"],
  update_campaign: ["campaigns", "boards", "clients"],
  // Clients
  "clients.create": ["clients", "campaigns"],
  "clients.update": ["clients", "campaigns", "boards"],
  create_client: ["clients", "campaigns"],
  update_client: ["clients", "campaigns", "boards"],
  // The team
  "team.invite": ["members", "bell"],
  "team.set_role": ["members", "bell", "campaigns"],
  "team.respond_to_request": ["members", "bell", "campaigns"],
  "team.remove_member": ["members", "bell", "campaigns", "boards", "tasks", "candidates"],
  "team.note_for_admins": ["bell"],
  // Email and people
  "outreach.send_email": ["boards", "campaigns", "week", "bell", "candidates"],
  "outreach.cancel": ["boards", "campaigns"],
  "candidates.save_to_candidates": ["candidates", "campaigns", "week"],
  "candidates.add_note": ["candidates", "boards"],
  "candidates.erase": ["candidates", "boards", "campaigns", "week", "memory"],
  "sourcing.fetch_contacts": ["candidates", "boards", "campaigns"],
  // Schedules, memory and connections
  "schedule.create": ["schedules", "tasks", "bell"],
  "schedule.followup": ["schedules", "tasks", "bell"],
  "schedule.cancel": ["schedules", "tasks", "bell"],
  "memory.remember": ["memory"],
  "memory.forget": ["memory"],
  "connections.connect": ["connections"],
  "connections.disconnect": ["connections", "memory"],
  "connections.notion_default": ["connections"],
};

/**
 * Whatever an agent write touches is read again in these as well, whether or not its effect names them: the
 * work it made or moved on Home, the week's figures, what is addressed to the person, the campaign counts. Four
 * small reads, batched with the rest; a write the console has no row for is never left on old figures.
 */
export const AMBIENT_VIEWS: readonly View[] = ["tasks", "week", "bell", "campaigns"];

/** The views one change leaves stale: the tables above, in one place. */
export function viewsFor(change: { effects?: readonly CapabilityEffect[]; capability?: string | null; views?: readonly View[]; ambient?: boolean }): Set<View> {
  const out = new Set<View>(change.views ?? []);
  for (const e of change.effects ?? []) for (const v of VIEWS_OF_EFFECT[e] ?? []) out.add(v);
  for (const v of (change.capability ? VIEWS_OF_CAPABILITY[change.capability] : undefined) ?? []) out.add(v);
  if (change.ambient) for (const v of AMBIENT_VIEWS) out.add(v);
  return out;
}

/* ── freshness ─────────────────────────────────────────────────────────────────────────────────────────── */

/** A view read this recently is not read again just because a page was opened or the window came back. */
export const FRESH_MS = 15_000;

const readAt = new Map<string, number>();
/** Views kept per campaign are stamped per campaign. */
const BY_CAMPAIGN: ReadonlySet<View> = new Set<View>(["boards", "specs", "forms"]);
const stampKey = (v: View, campaignId: string | null) => (BY_CAMPAIGN.has(v) && campaignId ? `${v}:${campaignId}` : v);

function stamp(views: ReadonlySet<View>, campaigns: Campaigns, now: number): void {
  for (const v of views) {
    readAt.set(v, now);
    if (BY_CAMPAIGN.has(v)) for (const id of campaigns) if (id !== null) readAt.set(stampKey(v, id), now);
  }
}

/** Forgets what was read when (tests, and a different workspace: nothing of the last one is fresh). */
export function resetFreshness(): void {
  readAt.clear();
}
onWorkspaceChange(resetFreshness);

/* ── saying it ─────────────────────────────────────────────────────────────────────────────────────────── */

export type InvalidateOptions = {
  /** The campaign the change was about; without one, every campaign this console has opened is read again. */
  campaignId?: string | null | undefined;
  /** The capability (or approved action) that made the change, when it is known. */
  capability?: string | null | undefined;
  /** Views to read in addition to what the effects and the capability say. */
  views?: readonly View[] | undefined;
  /** An agent write: the ambient views are read too. */
  ambient?: boolean | undefined;
};

type Listener = (effects: ReadonlySet<CapabilityEffect>, campaignIds: ReadonlySet<string | null>) => void;
const listeners = new Set<Listener>();

/**
 * For a page that keeps its own list in its own state (Candidates, the Agent page's week): told once a burst of
 * changes has settled, with what changed.
 */
export function onInvalidate(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A burst of changes (a replayed chat, three writes in a row) is one read, not one each. */
const SETTLE_MS = 120;

let pendingEffects = new Set<CapabilityEffect>();
let pendingViews = new Set<View>();
let pendingCampaigns = new Set<string | null>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Says these views are stale. Read again a moment later, together with anything else said in that moment. */
export function invalidate(effects: readonly CapabilityEffect[], opts: InvalidateOptions = {}): void {
  if (!LIVE) return;
  const views = viewsFor({ effects, capability: opts.capability ?? null, views: opts.views ?? [], ambient: opts.ambient ?? false });
  if (effects.length === 0 && views.size === 0) return;
  for (const e of effects) pendingEffects.add(e);
  for (const v of views) pendingViews.add(v);
  pendingCampaigns.add(opts.campaignId ?? null);
  if (timer === null) timer = setTimeout(flushInvalidations, SETTLE_MS);
}

/** Says these views are stale, by name (a page looked at again, a run that ended). */
export function invalidateViews(views: readonly View[], opts: Pick<InvalidateOptions, "campaignId"> = {}): void {
  invalidate([], { views, campaignId: opts.campaignId ?? null });
}

/** Reads what is stale now instead of in a moment. */
export function flushInvalidations(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const views = pendingViews;
  const campaigns = pendingCampaigns;
  const effects = pendingEffects;
  pendingViews = new Set();
  pendingCampaigns = new Set();
  pendingEffects = new Set();
  if (views.size === 0 && effects.size === 0) return;
  // The pages that keep their own lists hear the effect kinds, and the ones a view stands for.
  const told = new Set<CapabilityEffect>(effects);
  for (const v of views) {
    const e = EFFECT_OF_VIEW[v];
    if (e) told.add(e);
  }
  stamp(views, campaigns, Date.now());
  for (const v of views) READ[v](campaigns);
  for (const l of listeners) l(told, campaigns);
}

/* ── writes the console makes itself ── */

const ID = "[^/]+";
const WRITES: ReadonlyArray<{ method?: string; re: RegExp; effects: readonly CapabilityEffect[]; campaign?: number; views?: readonly View[] }> = [
  // People moved, shortlisted or passed: the campaign's own pages reconcile; who else shows them is told here.
  { re: new RegExp(`^/v1/campaigns/(${ID})/candidates(/.*)?$`), effects: ["candidates"], campaign: 1 },
  { re: new RegExp(`^/v1/campaigns/(${ID})/matches/(shortlist|reject|save)$`), effects: ["candidates"], campaign: 1 },
  // Closed or reopened: the Overview's activity, funnel and agents, the list's row and Home's counts all follow.
  { method: "PUT", re: new RegExp(`^/v1/campaigns/(${ID})/status$`), effects: ["campaign"], campaign: 1 },
  // A search or a watch started: the rail's watches and the campaign's figures follow.
  { re: new RegExp(`^/v1/campaigns/(${ID})/(sourcing|watch)$`), effects: ["sourcing"], campaign: 1 },
  // Contact details fetched: the people now carry an email or a phone, so the board, Candidates and the figures follow.
  { method: "POST", re: new RegExp(`^/v1/campaigns/(${ID})/contacts$`), effects: ["pipeline", "candidates", "campaign"], campaign: 1 },
  // The same for several campaigns at once: every campaign this console has opened is read again.
  { method: "POST", re: /^\/v1\/contacts\/fetch$/, effects: ["pipeline", "candidates", "campaign"] },
  // The directory itself: people added or imported land on a board; one deleted leaves every board it was on.
  { method: "POST", re: /^\/v1\/candidates(\/import)?$/, effects: ["candidates", "pipeline"] },
  { method: "DELETE", re: /^\/v1\/candidates\/[^/]+$/, effects: ["candidates", "pipeline", "campaign"] },
  { re: /^\/v1\/candidates(\/.*)?$/, effects: ["candidates"] },
  // A call's note, outcome, campaign, transcript or recording: the Calls page (and a campaign's) read their lists again.
  { re: /^\/v1\/calls\/[^/]+(\/.*)?$/, effects: ["calls"] },
  // A campaign made, renamed or removed: the list, the counts and Home's week follow.
  { method: "POST", re: /^\/v1\/campaigns$/, effects: ["campaign"] },
  { method: "PATCH", re: new RegExp(`^/v1/campaigns/(${ID})$`), effects: ["campaign"], campaign: 1 },
  { method: "DELETE", re: new RegExp(`^/v1/campaigns/(${ID})$`), effects: ["campaign"], campaign: 1 },
  // Clients, the team, connections, memory and schedules: whoever else shows them reads them again.
  { re: /^\/v1\/clients(\/.*)?$/, effects: ["clients", "campaign"] },
  { re: /^\/v1\/(members|invitations|organisation)(\/.*)?$/, effects: ["team"] },
  { re: /^\/v1\/connections(\/.*)?$/, effects: ["connections"] },
  { re: /^\/v1\/memory(\/.*)?$/, effects: ["memory"] },
  { re: /^\/v1\/schedules(\/.*)?$/, effects: ["schedules"] },
  // A task made, finished, changed or deleted, wherever it was done (Home, the Overview's Tasks panel, a call's follow-up):
  // every list that shows tasks reads them again, a campaign's panel included. There is no effect kind for tasks.
  { re: /^\/v1\/tasks(\/.*)?$/, effects: [], views: ["tasks"] },
];

/** The views a successful write leaves stale beyond the place that made it; null when it leaves none. */
export function effectsOfWrite(
  method: string,
  path: string,
): { effects: readonly CapabilityEffect[]; campaignId: string | null; views?: readonly View[] } | null {
  if (method === "GET") return null;
  for (const w of WRITES) {
    if (w.method && w.method !== method) continue;
    const m = w.re.exec(path);
    if (m) return { effects: w.effects, campaignId: w.campaign ? (m[w.campaign] ?? null) : null, ...(w.views ? { views: w.views } : {}) };
  }
  return null;
}

/* ── coming back, and pages looked at again ── */

/** A page left alone this long is read again, in full, when it is looked at. */
export const STALE_AFTER_MS = 60_000;

/** The views a returning person may find moved, after a long time away: everything the console keeps. */
const WHEN_BACK: readonly CapabilityEffect[] = ["pipeline", "campaign", "candidates", "clients", "memory", "schedules"];
const WHEN_BACK_VIEWS: readonly View[] = ["tasks", "bell", "week", "campaigns", "members", "connections"];

/** What the sidebar shows on every page. */
const SIDEBAR_VIEWS: readonly View[] = ["campaigns", "bell"];

/**
 * What each page shows from the stores, so a page opened before a change never shows the old figures. A page that
 * keeps its own list reads it when it opens, so it is not here. `campaign-*` pages are about one campaign.
 */
export const VIEWS_OF_ROUTE: Readonly<Record<string, readonly View[]>> = {
  home: ["tasks", "week", "bell", "campaigns"],
  agent: ["week", "campaigns", "watches", "schedules", "memory"],
  campaigns: ["campaigns", "boards"],
  contacts: ["campaigns"],
  calls: [],
  clients: ["clients", "campaigns"],
  "campaign-overview": ["boards", "campaigns", "week", "specs", "tasks"],
  "campaign-candidates": ["boards", "campaigns", "members"],
  "campaign-shortlisted": ["boards", "campaigns"],
  "campaign-forms": ["forms", "boards"],
  "campaign-calls": ["boards"],
  settings: ["members", "connections", "memory", "schedules", "clients"],
  "analytics-outreach": ["campaigns"],
  "analytics-projects": ["campaigns", "boards"],
};

let here: { route: string; campaignId: string | null } | null = null;

/**
 * A page was opened (or the window came back to it): what it shows from the stores is read again unless it was
 * read in the last `FRESH_MS`. What is cached shows at once; the server's numbers replace it quietly.
 */
export function revalidateRoute(route: string, campaignId: string | null = null, now = Date.now()): void {
  if (!LIVE) return;
  here = { route, campaignId };
  const wanted = [...(VIEWS_OF_ROUTE[route] ?? []), ...SIDEBAR_VIEWS];
  const stale = new Set<View>();
  for (const v of wanted) {
    if (now - (readAt.get(stampKey(v, campaignId)) ?? 0) >= FRESH_MS) stale.add(v);
  }
  if (stale.size) invalidate([], { views: [...stale], campaignId });
}

/**
 * Wires the one refresh to what tells it: the chat's `effect` and `result` events, a run that ended, an approval
 * answered, a console write, and the window coming back. Returns the way to undo it.
 */
export function connectInvalidation(): () => void {
  let hiddenAt: number | null = null;
  const back = () => {
    const away = hiddenAt;
    hiddenAt = null;
    if (away !== null && Date.now() - away >= STALE_AFTER_MS) invalidate(WHEN_BACK, { views: WHEN_BACK_VIEWS });
    else if (here) revalidateRoute(here.route, here.campaignId);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else back();
  };
  const onBlur = () => { hiddenAt ??= Date.now(); };
  const stops = [
    // An agent write: its effects, its capability, and the ambient views (the work it made, the week, the bell).
    onChatEffects((effects, campaignId, capability) => invalidate(effects, { campaignId, capability, ambient: true })),
    // A run that ended may have written along the way (a command run in code, a task made).
    onChatRunEnd(() => invalidateViews(AMBIENT_VIEWS)),
    onDecision((campaignId) => invalidate(["candidates"], { campaignId })),
    onWrite((method, path) => {
      const w = effectsOfWrite(method, path);
      if (w) invalidate(w.effects, { campaignId: w.campaignId, ...(w.views ? { views: w.views } : {}) });
    }),
  ];
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", back);
  return () => {
    for (const stop of stops) stop();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", back);
    here = null;
  };
}

/** A page of campaign work was opened: what is cached is shown, and the server's numbers replace it quietly. */
export function revalidateCampaign(campaignId: string | null): void {
  invalidate(["pipeline", "campaign"], { campaignId });
}

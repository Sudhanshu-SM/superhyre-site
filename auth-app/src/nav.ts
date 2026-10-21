import {
  Buildings, UsersThree, ChartLineUp, ClipboardText, Gear, House,
  Folders, FunnelSimple, Lifebuoy, PaperPlaneTilt, Robot, SquaresFour, Star, UsersFour,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Standing } from "./can";

/**
 * The navigation model — one source of truth for the sidebar, the router and
 * the page headings.
 *
 * ── TWO LEVELS OF NAVIGATION, AND WHY THEY ARE SEPARATE ─────────────────────
 * `NAV` is the product: the places that exist whatever you are working on.
 * `CAMPAIGN_NAV` is the working context: the places that only mean anything
 * once a campaign is selected, which is why they sit under the campaign's name
 * rather than in the main list. Flattening the two would put "Shortlisted" at
 * the same level as "Contacts", and those are not the same kind of thing —
 * one is scoped to a campaign, the other is the whole workspace.
 *
 * `SUPPORT` is its own constant rather than a third section: it is the only
 * row that sits below the nav proper, pinned above the profile, and giving it
 * a section would imply siblings it does not have.
 */

/** What the page of every email, WhatsApp chat and call is called, in the sidebar, quick find, the tab and any tour step. */
export const OUTREACH_LABEL = "Outreach";

export type RouteId =
  | "home"
  | "agent"
  | "campaigns"
  | "contacts"
  | "calls"
  | "clients"
  | "analytics-overview"
  | "analytics-recruiters"
  | "analytics-outreach"
  | "analytics-pipeline"
  | "analytics-campaigns"
  | "campaign-overview"
  | "campaign-candidates"
  | "campaign-forms"
  | "campaign-calls"
  | "campaign-shortlisted"
  | "settings"
  | "teams"
  | "support";

export type Route = {
  id: RouteId;
  /** Hash path without the `#`. Hash routing because GitHub Pages cannot
   *  rewrite: `/access/contacts` would 404 on refresh, `#/contacts` cannot. */
  path: string;
  /** Heading shown on the page. Longer than the nav label where the nav is
   *  abbreviated for width. */
  title: string;
  /** The table(s) this page will read. Stated in the empty state so it names a
   *  real destination instead of a vague "coming soon". */
  backing: string;
  /** What the page will do, in one sentence, present tense. */
  blurb: string;
};

export const ROUTES: Record<RouteId, Route> = {
  home: {
    id: "home", path: "/", title: "Home",
    backing: "",
    blurb: "",
  },
  /* ── THE AGENT IS PRODUCT-LEVEL, NOT CAMPAIGN-LEVEL ──
     It used to live under the current campaign, which framed it as one of that
     campaign's tabs. But the agent is the thing you brief about ANY campaign —
     it holds the conversation, the briefs you have run and the channels it can
     speak on, none of which are properties of one req. Nesting it made the
     product's primary working surface a detail of a sub-page. */
  agent: {
    id: "agent", path: "/agent", title: "Agent",
    backing: "agent_conversations, agent_runs",
    blurb: "Brief the agent, and everything it has run for you.",
  },
  campaigns: {
    id: "campaigns", path: "/campaigns", title: "Campaigns",
    backing: "campaigns",
    blurb: "Every outreach campaign in your account, with the roles it is hiring for and how far through it is.",
  },
  contacts: {
    id: "contacts", path: "/contacts", title: "Candidates",
    backing: "people, person_identifiers",
    blurb: "Everyone you have a contact record for, whichever campaign first found them.",
  },
  /* Outreach: every email, WhatsApp chat and call, by campaign; an owner or admin sees everyone's. The route id stays
     "calls" (the page grew out of Calls); the address and the name are Outreach, and "#/calls" still lands here. The
     campaign's own Outreach page is the same view with that campaign fixed. */
  calls: {
    id: "calls", path: "/outreach", title: OUTREACH_LABEL,
    backing: "outreach_messages, calls",
    blurb: "Every email, WhatsApp chat and call, by campaign, with the whole conversation one click away.",
  },
  /* The companies the agency hires for. Everyone sees the ones their own campaigns are for, read-only; managing
     them (and their terms) is for owners and admins, which the page says where it matters. */
  clients: {
    id: "clients", path: "/clients", title: "Clients",
    backing: "clients, client_contacts",
    blurb: "The companies you hire for, the people you talk to there and the campaigns you run for them.",
  },
  /* The five Analytics pages. Each answers one question; the first is where "#/analytics" lands. */
  "analytics-overview": {
    id: "analytics-overview", path: "/analytics", title: "Overview",
    backing: "stage_moves, outreach_messages, campaigns",
    blurb: "How hiring is going: hires, replies, where people drop, and what needs a look.",
  },
  "analytics-recruiters": {
    id: "analytics-recruiters", path: "/analytics/recruiters", title: "Recruiters",
    backing: "stage_moves, outreach_messages, calls, tasks",
    blurb: "What each person did in the period and what came of it. Recruiters see their own work.",
  },
  "analytics-outreach": {
    id: "analytics-outreach", path: "/analytics/outreach", title: "Outreach",
    backing: "outreach_messages, calls",
    blurb: "Whether emails and calls are getting answers, and which follow-up earns them.",
  },
  "analytics-pipeline": {
    id: "analytics-pipeline", path: "/analytics/pipeline", title: "Pipeline",
    backing: "campaign_candidates, stage_moves",
    blurb: "Where people wait, how fast they move and where they come from.",
  },
  "analytics-campaigns": {
    id: "analytics-campaigns", path: "/analytics/campaigns", title: "Campaigns",
    backing: "campaigns, clients",
    blurb: "Every campaign and client side by side, so the slow or quiet one is easy to see.",
  },
  /* ── campaign scope ── */
  /* The campaign itself. The sidebar's campaign row links here, so the name is
     a destination like every other row rather than a caption sitting above
     them. */
  "campaign-overview": {
    id: "campaign-overview", path: "/campaign", title: "Campaign",
    backing: "campaigns, org_candidates",
    blurb: "This campaign at a glance: the roles it is filling, who is in the pipeline and what the agent is working on.",
  },
  "campaign-candidates": {
    id: "campaign-candidates", path: "/campaign/pipeline", title: "Pipeline",
    backing: "org_candidates",
    blurb: "Everyone in this campaign's pipeline, with the stage and notes that stay private to your organisation.",
  },
  "campaign-forms": {
    id: "campaign-forms", path: "/campaign/forms", title: "Forms & responses",
    backing: "forms, form_responses",
    blurb: "The screening questions sent to candidates in this campaign, and what came back.",
  },
  "campaign-calls": {
    id: "campaign-calls", path: "/campaign/outreach", title: OUTREACH_LABEL,
    backing: "outreach_messages, calls",
    blurb: "Every email, WhatsApp chat and call for this campaign, with the whole conversation one click away.",
  },
  "campaign-shortlisted": {
    id: "campaign-shortlisted", path: "/campaign/shortlisted", title: "Shortlisted",
    backing: "org_candidates",
    blurb: "The candidates you have moved forward in this campaign, ready for a decision.",
  },

  settings: {
    id: "settings", path: "/settings", title: "Settings",
    backing: "organizations, org_members",
    blurb: "Your account, the people in it and their roles.",
  },
  /* The teams, who is on them and the campaigns they work, and everyone in the organisation (Members used to be a
     Settings page). Owners and admins only: a recruiter has no such page, and a link to it says so calmly. */
  teams: {
    id: "teams", path: "/teams", title: "Teams",
    backing: "teams, team_members",
    blurb: "The teams, who leads and is on each, and the campaigns they work.",
  },
  support: {
    id: "support", path: "/support", title: "Support",
    backing: "",
    blurb: "Reach the SuperHyre team, and the answers to the questions that come up most.",
  },
};

/** A single destination. */
export type NavLeaf = { kind: "leaf"; id: RouteId; label: string; Icon: Icon };
/** A destination that owns children, collapsible. `id` is the group's own key
 *  for open/closed state, not a route — clicking the row toggles rather than
 *  navigates, because the group itself has no page. */
export type NavGroup = {
  kind: "group"; id: string; label: string; Icon: Icon;
  children: { id: RouteId; label: string }[];
};
export type NavItem = NavLeaf | NavGroup;
export type NavSection = { id: string; label?: string; items: NavItem[] };

/** The product-level nav. Analytics is the one group: five questions (how is hiring going, what is each person
 *  doing, are emails getting answers, where do people wait, how is each campaign going), one page each.
 *  Usage and Agent activity are no longer in the console's navigation (their old links redirect to Overview). */
export const NAV: NavSection[] = [
  {
    id: "main",
    items: [
      { kind: "leaf", id: "home", label: "Home", Icon: House },
      /* Second, directly under Home. The agent is where the work is done, so
         it sits at the top of the list rather than among the places you go to
         look something up. */
      { kind: "leaf", id: "agent", label: "Agent", Icon: Robot },
      { kind: "leaf", id: "campaigns", label: "Campaigns", Icon: Folders },
      { kind: "leaf", id: "contacts", label: "Candidates", Icon: UsersThree },
      /* The work lists together: campaigns, the people on them, the emails, chats and calls made to them. */
      { kind: "leaf", id: "calls", label: OUTREACH_LABEL, Icon: PaperPlaneTilt },
      { kind: "leaf", id: "clients", label: "Clients", Icon: Buildings },
      {
        kind: "group", id: "analytics", label: "Analytics", Icon: ChartLineUp,
        children: [
          { id: "analytics-overview", label: "Overview" },
          { id: "analytics-recruiters", label: "Recruiters" },
          /* Not "Outreach": the page of every email and call has that name, and the two sit one above the other. */
          { id: "analytics-outreach", label: "Outreach results" },
          { id: "analytics-pipeline", label: "Pipeline" },
          { id: "analytics-campaigns", label: "Campaigns" },
        ],
      },
    ],
  },
];

/**
 * Who is kept from everyone's calls (the top-level Calls). The table is `can(standing, "calls.all")` in can.ts: the
 * organisation's owner and admins and a personal workspace's one person have it, a recruiter does not. Written as the
 * one standing left out so this file stays free of the session store; a test holds the two together.
 */
const WITHOUT_ALL_CALLS: readonly Standing[] = ["recruiter"];

/**
 * The product-level nav for this person. Everyone's calls is for the organisation's owner and admins (and a
 * personal workspace's one person): a recruiter's calls are each campaign's own Calls page, under the campaign.
 * With no standing known (a test, the first paint) nothing is taken away; the page and the server decide.
 */
export function navFor(standing: Standing | null | undefined): NavSection[] {
  if (!standing || !WITHOUT_ALL_CALLS.includes(standing)) return NAV;
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !(item.kind === "leaf" && item.id === "calls")),
  }));
}

/** Whether this person has a page at this route (only everyone's calls is kept from some people). */
export function routeAllowed(id: RouteId, standing: Standing | null | undefined): boolean {
  if (id === "teams") return hasTeams(standing);
  return id !== "calls" || !standing || !WITHOUT_ALL_CALLS.includes(standing);
}

/**
 * Where a link to everyone's calls goes for a person who has no such page: their calls on a campaign (the one the
 * link names, else the one they are on), or Home when there is none. Null when the link can stay as it is.
 * Old bookmarks and notifications carry "#/calls"; this is what turns them into something that works.
 */
export function hashForStanding(hash: string, standing: Standing | null | undefined, campaignId: string | null): string | null {
  const id = routeFromHash(hash);
  /* Teams is not sent anywhere: a recruiter who follows a link to it is told, calmly, that it isn't theirs. */
  if (id === "teams" || routeAllowed(id, standing)) return null;
  const named = campaignFromHash(hash) ?? campaignId;
  return named ? `#/campaign/outreach?campaign=${encodeURIComponent(named)}` : "#/";
}

/** The campaign-scoped nav, rendered under the current campaign's name.
 *  Flat by design: these are six peers, and nesting inside an already-nested
 *  block is where a sidebar starts to feel like a filesystem. */
export const CAMPAIGN_NAV: NavLeaf[] = [
  /* The campaign's name row opens its Overview, which also holds where people
     come from and recent searches; the pages below are the working views. */
  { kind: "leaf", id: "campaign-overview", label: "Overview", Icon: SquaresFour },
  { kind: "leaf", id: "campaign-candidates", label: "Pipeline", Icon: FunnelSimple },
  { kind: "leaf", id: "campaign-forms", label: "Forms & responses", Icon: ClipboardText },
  { kind: "leaf", id: "campaign-calls", label: OUTREACH_LABEL, Icon: PaperPlaneTilt },
  { kind: "leaf", id: "campaign-shortlisted", label: "Shortlisted", Icon: Star },
];

/** Pinned below the nav, above the account. The two rows that are about the
 *  workspace itself rather than the hiring in it, so they sit together and
 *  outside the scrollable body — Settings first, because it is the one people
 *  reach for; Support last, because it is where you go when the rest failed. */
export const FOOT_NAV: NavLeaf[] = [
  /* Teams sits with Settings and Support: it is about the workspace's people, not the hiring in it. */
  { kind: "leaf", id: "teams", label: "Teams", Icon: UsersFour },
  { kind: "leaf", id: "settings", label: "Settings", Icon: Gear },
  { kind: "leaf", id: "support", label: "Support", Icon: Lifebuoy },
];

/**
 * Who has a Teams page: the organisation's owner and admins (`can(standing, "teams.manage")` in can.ts; a test holds
 * the two together). With no standing known (a test, the first paint) nothing is taken away; the page and the
 * server decide.
 */
const WITH_TEAMS: readonly Standing[] = ["owner", "admin"];
const hasTeams = (standing: Standing | null | undefined): boolean => !standing || WITH_TEAMS.includes(standing);

/** The rows pinned below the nav for this person: Teams only for an owner or admin. */
export function footNavFor(standing: Standing | null | undefined): NavLeaf[] {
  return FOOT_NAV.filter((item) => item.id !== "teams" || hasTeams(standing));
}

/**
 * What the sidebar's campaign row says when none is chosen. "No campaigns yet" is an answer only
 * once the list has arrived: while it loads the row says so, and when the load failed it says that
 * (the row then offers a retry), so a dropped request never reads as an empty workspace.
 */
export function scopePick(count: number, load: { ready: boolean; failed: boolean }): { state: "pick" | "none" | "loading" | "failed"; label: string } {
  if (count > 0) return { state: "pick", label: "Select a campaign" };
  if (load.failed) return { state: "failed", label: "Campaigns didn't load" };
  if (!load.ready) return { state: "loading", label: "Loading campaigns" };
  return { state: "none", label: "No campaigns yet" };
}

/**
 * What the sidebar and quick find call a page. Recruiters and the owner of a personal workspace have no team to
 * compare, so the page about people is their own: "My work" rather than "Recruiters".
 */
export const MY_WORK = "My work";
export function navLabel(id: RouteId, label: string, standing: Standing | null | undefined): string {
  return id === "analytics-recruiters" && (standing === "recruiter" || standing === "personal") ? MY_WORK : label;
}

/** Which group holds a route, so opening a child route opens its group. */
export const GROUP_OF: Partial<Record<RouteId, string>> = (() => {
  const out: Partial<Record<RouteId, string>> = {};
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.kind !== "group") continue;
      for (const child of item.children) out[child.id] = item.id;
    }
  }
  return out;
})();

/* Static, string-keyed, built once from ROUTES and never mutated — a Record,
   not a Map. Object.create(null) so a route path could never collide with
   something inherited from Object.prototype. */
const BY_PATH: Record<string, RouteId> = Object.assign(
  Object.create(null) as Record<string, RouteId>,
  ...Object.values(ROUTES).map((r) => ({ [r.path]: r.id })),
  // Typed or bookmarked by people who expect Home to have a name.
  { "/home": "home" },
);

/** Where the agent's upcoming scheduled things are: Coming up, on Home. */
export const COMING_UP_HREF = "#/?section=coming-up";

/**
 * Pages that no longer exist, and where a link to one goes now. Old notifications, chat cards and bookmarks
 * still carry them: what was scheduled is Coming up on Home, the agent's memory and the do-not-contact list are
 * not Settings pages (the agent keeps the first and is asked about the second), and the extension has no page of its own.
 */
export function redirectedHash(hash: string): string | null {
  const m = /^#?(\/[^?]*?)\/*(?:\?(.*))?$/.exec(hash);
  const path = m?.[1];
  const query = m?.[2];
  // What was scheduled is Coming up on Home, wherever the old link hung it (top level, Settings, a campaign).
  if (path && /^(?:\/settings|\/campaign)?\/schedul(?:es|ed)$/.test(path)) return query ? `${COMING_UP_HREF}&${query}` : COMING_UP_HREF;
  // Candidates is the name in the sidebar, the page is /contacts: a typed or old /candidates link lands on it.
  if (path === "/candidates") return query ? `#/contacts?${query}` : "#/contacts";
  // Members moved out of Settings to the Teams page (its Everyone tab), with the invitations and requests that were on it.
  if (path === "/settings/members") return "#/teams";
  // Settings' Memory held Coming up; a link to that section goes to Home, any other Memory link to Settings' landing page.
  if (path === "/settings/memory") return query && /(?:^|&)section=coming-up\b/.test(query) ? `#/?${query}` : "#/settings";
  // The do-not-contact list is not a Settings page: the agent manages it ("don't contact Asha"), as does a candidate's menu.
  if (path === "/settings/do-not-contact" || path === "/settings/dnc") return "#/settings";
  // Integrations are Connections now, and the extension has no page: Settings' Profile is the nearest place that exists.
  if (path === "/settings/integrations") return query ? `#/settings/connections?${query}` : "#/settings/connections";
  if (path === "/settings/extension") return "#/settings";
  if (path === "/integrations" || path === "/extension") return "#/";
  // Usage and Agent activity are out of the navigation: a link to either opens the Analytics overview, and the
  // old Projects page is Campaigns now (its filters, which were never in the address, have nothing to carry).
  if (path === "/analytics/usage" || path === "/analytics/agent") return "#/analytics";
  if (path === "/analytics/overview") return query ? `#/analytics?${query}` : "#/analytics";
  if (path === "/analytics/projects") return query ? `#/analytics/campaigns?${query}` : "#/analytics/campaigns";
  // Calls became Outreach (emails, WhatsApp chats and calls in one place): old bookmarks, notifications and chat cards
  // for the page and for a campaign's own Calls open it, with whatever they carried.
  if (path === "/calls") return query ? `#/outreach?${query}` : "#/outreach";
  // There is no dialer page: calls are placed with the Chrome extension and kept under Outreach, so an old link to one lands there.
  if (path === "/dialer" || path?.startsWith("/dialer/")) return "#/outreach";
  if (path === "/campaign/calls") return query ? `#/campaign/outreach?${query}` : "#/campaign/outreach";
  return null;
}

/**
 * Reads the current route from `location.hash`.
 *
 * Unknown hashes fall back to home rather than rendering nothing, because the
 * hash is user-editable and a typo should not produce a blank console.
 */
export function routeFromHash(hash: string): RouteId {
  hash = redirectedHash(hash) ?? hash;
  const raw = hash.replace(/^#/, "") || "/";
  /* A trailing slash is the same page: browsers, pasted links and the odd
     copy-paste all add one, and "#/contacts/" landing on Home reads as a
     broken link. Stripped only when something is left afterwards — doing it
     unconditionally turns "/" into "" and loses the home route, which is a
     regression the suite pins in its own test. */
  /* A settings section carries its own query; everywhere else "?campaign=<id>" only picks the
     campaign (see `campaignLink`) and isn't part of the page. */
  if (settingsSectionFromHash(hash)) return "settings";
  const bare = raw.replace(/\?.*$/, "") || "/";
  const path = bare.length > 1 ? bare.replace(/\/+$/, "") || "/" : bare;
  /* A form inside Forms & responses: "#/campaign/forms/<id>/<tab>". */
  if (/^\/campaign\/forms\/[^/]+(\/[a-z]+)?$/.test(path)) return "campaign-forms";
  /* One client: "#/clients/<id>" or "#/clients/<id>/<tab>". */
  if (/^\/clients\/[^/]+(\/[a-z]+)?$/.test(path)) return "clients";
  return BY_PATH[path] ?? "home";
}

/** Whether a link names a real page; an unknown one still opens Home, but says so. */
export function isKnownHash(hash: string): boolean {
  if (redirectedHash(hash)) return true;
  const raw = hash.replace(/^#/, "").replace(/\?.*$/, "") || "/";
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") || "/" : raw;
  return path === "/" || path === "/home" || routeFromHash(hash) !== "home" || /^\/invite\//.test(path);
}

export const SETTINGS_SECTIONS = ["profile", "organisation", "connections"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The section a "#/settings/<section>" hash names, if any. */
export function settingsSectionFromHash(hash: string): SettingsSection | null {
  const m = /^#?\/settings\/([a-z-]+)\/?(?:\?.*)?$/.exec(redirectedHash(hash) ?? hash);
  const id = m?.[1];
  return SETTINGS_SECTIONS.find((x) => x === id) ?? null;
}

/** The client and tab a "#/clients/<id>/<tab>" hash names, if any. */
export function clientFromHash(hash: string): { id: string; tab: string | null } | null {
  const m = /^#?\/clients\/([^/]+)(?:\/([a-z]+))?\/?$/.exec(hash);
  return m ? { id: decodeURIComponent(m[1]!), tab: m[2] ?? null } : null;
}

/**
 * Links into one campaign, the format the server uses in notifications and task actions:
 * "#/campaign/<section>?campaign=<id>", or "#/campaign/forms/<formId>/<tab>?campaign=<id>".
 * Opening one selects that campaign, then shows the page.
 */
export type CampaignSection = "overview" | "pipeline" | "shortlisted" | "forms";

export function campaignLink(
  campaignId: string,
  section: CampaignSection = "overview",
  form?: { id: string; tab: "build" | "preview" | "responses" | "share" },
): string {
  const page = form
    ? `/campaign/forms/${encodeURIComponent(form.id)}/${form.tab}`
    : section === "overview"
      ? "/campaign"
      : `/campaign/${section}`;
  return `#${page}?campaign=${encodeURIComponent(campaignId)}`;
}

/** The campaign a link selects, if it names one. */
/** A link that opens the board with its Stages editor already open ("...&stages=1"). */
export const asksForStagesEditor = (hash: string): boolean => /[?&]stages=1(?:&|$)/.test(hash);

/** The same address without that ask, so the editor opens once and not again on a reload or a back button. */
export const withoutStagesAsk = (hash: string): string => hash.replace(/([?&])stages=1(?:&|$)/, "$1").replace(/[?&]$/, "");

export function campaignFromHash(hash: string): string | null {
  const m = /[?&]campaign=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * Where to look after the workspace changed under an open page. A campaign belongs to the workspace it was
 * made in, so a link that names one (`?campaign=`) or a page of one means nothing in the new workspace: the
 * address drops it (the same page without the campaign, or the list of campaigns). Every other page is as
 * good in the new workspace as it was in the old. Null when the address can stay.
 */
export function hashAfterWorkspaceChange(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  if (/^\/campaign(\/|$)/.test(path)) return "#/campaigns";
  if (q >= 0 && campaignFromHash(raw)) {
    const rest = raw.slice(q + 1).split("&").filter((p) => !p.startsWith("campaign="));
    return `#${path || "/"}${rest.length ? `?${rest.join("&")}` : ""}`;
  }
  return null;
}

/** The `show=` a link carries (a task that opens the Agent on a card), and the same link without it. */
export function showFromHash(hash: string): string | null {
  const m = /[?&]show=([a-z-]+)/.exec(hash);
  return m ? m[1]! : null;
}

export function withoutShow(hash: string): string {
  return hash.replace(/([?&])show=[a-z-]+&?/, "$1").replace(/[?&]$/, "");
}

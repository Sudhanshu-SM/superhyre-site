import {
  AddressBook, ChartLineUp, ChatCircleDots, ClipboardText, Gear, House,
  Folders, Lifebuoy, Phone, PuzzlePiece, Robot, Star, Users,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

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

export type RouteId =
  | "home"
  | "campaigns"
  | "contacts"
  | "analytics-outreach"
  | "analytics-usage"
  | "analytics-projects"
  | "analytics-agent"
  | "integrations"
  | "campaign-overview"
  | "campaign-agent"
  | "campaign-searches"
  | "campaign-candidates"
  | "campaign-forms"
  | "campaign-calls"
  | "campaign-shortlisted"
  | "settings"
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
  campaigns: {
    id: "campaigns", path: "/campaigns", title: "Campaigns",
    backing: "campaigns",
    blurb: "Every outreach campaign in this workspace, with the roles it is hiring for and how far through it is.",
  },
  contacts: {
    id: "contacts", path: "/contacts", title: "Contacts",
    backing: "people, person_identifiers",
    blurb: "Everyone this workspace has a contact record for, whichever campaign first found them.",
  },
  "analytics-outreach": {
    id: "analytics-outreach", path: "/analytics/outreach", title: "Outreach analytics",
    backing: "outreach_queue, bot_sessions",
    blurb: "Messages sent, replies received and where conversations stall, per campaign and per channel.",
  },
  "analytics-usage": {
    id: "analytics-usage", path: "/analytics/usage", title: "Usage",
    backing: "reveal_events, providers",
    blurb: "What this workspace is spending: reveals, provider credits and the per-user daily caps.",
  },
  "analytics-projects": {
    id: "analytics-projects", path: "/analytics/projects", title: "Projects",
    backing: "campaigns, org_candidates",
    blurb: "Throughput across projects, so a campaign that has gone quiet is visible next to one that has not.",
  },
  "analytics-agent": {
    id: "analytics-agent", path: "/analytics/agent", title: "Agent analytics",
    backing: "bot_sessions, agent_runs",
    blurb: "How the agent is performing: searches run, candidates surfaced and where a human had to step in.",
  },
  integrations: {
    id: "integrations", path: "/integrations", title: "Integrations",
    backing: "extension_installs, extension_captures",
    blurb: "Which browsers are signed in to the Contact Finder, and what they have captured.",
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
  "campaign-agent": {
    id: "campaign-agent", path: "/campaign/agent", title: "Agent",
    backing: "agent_runs",
    blurb: "The agent working this campaign: what it is doing now and what it has queued.",
  },
  "campaign-searches": {
    id: "campaign-searches", path: "/campaign/searches", title: "Searches",
    backing: "agent_conversations",
    blurb: "Every conversation with the agent for this campaign, so a search you ran last week is still there.",
  },
  "campaign-candidates": {
    id: "campaign-candidates", path: "/campaign/candidates", title: "Candidates",
    backing: "org_candidates",
    blurb: "Everyone in this campaign's pipeline, with the stage and notes that stay private to your workspace.",
  },
  "campaign-forms": {
    id: "campaign-forms", path: "/campaign/forms", title: "Forms & responses",
    backing: "forms, form_responses",
    blurb: "The screening questions sent to candidates in this campaign, and what came back.",
  },
  "campaign-calls": {
    id: "campaign-calls", path: "/campaign/calls", title: "Calls",
    backing: "dialer_calls",
    blurb: "Every call placed for this campaign, with outcome, duration and which device made it.",
  },
  "campaign-shortlisted": {
    id: "campaign-shortlisted", path: "/campaign/shortlisted", title: "Shortlisted",
    backing: "org_candidates",
    blurb: "The candidates you have moved forward in this campaign, ready for a decision.",
  },

  settings: {
    id: "settings", path: "/settings", title: "Settings",
    backing: "organizations, org_members",
    blurb: "Your workspace, the people in it and their roles.",
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

/** The product-level nav. Analytics is the one group: four related views that
 *  would otherwise add four permanent rows to a sidebar meant to read slim. */
export const NAV: NavSection[] = [
  {
    id: "main",
    items: [
      { kind: "leaf", id: "home", label: "Home", Icon: House },
      { kind: "leaf", id: "campaigns", label: "Campaigns", Icon: Folders },
      { kind: "leaf", id: "contacts", label: "Contacts", Icon: AddressBook },
      {
        kind: "group", id: "analytics", label: "Analytics", Icon: ChartLineUp,
        children: [
          { id: "analytics-outreach", label: "Outreach" },
          { id: "analytics-usage", label: "Usage" },
          { id: "analytics-projects", label: "Projects" },
          { id: "analytics-agent", label: "Agent" },
        ],
      },
      { kind: "leaf", id: "integrations", label: "Integrations", Icon: PuzzlePiece },
    ],
  },
];

/** The campaign-scoped nav, rendered under the current campaign's name.
 *  Flat by design: these are six peers, and nesting inside an already-nested
 *  block is where a sidebar starts to feel like a filesystem. */
export const CAMPAIGN_NAV: NavLeaf[] = [
  { kind: "leaf", id: "campaign-agent", label: "Agent", Icon: Robot },
  { kind: "leaf", id: "campaign-searches", label: "Searches", Icon: ChatCircleDots },
  { kind: "leaf", id: "campaign-candidates", label: "Candidates", Icon: Users },
  { kind: "leaf", id: "campaign-forms", label: "Forms & responses", Icon: ClipboardText },
  { kind: "leaf", id: "campaign-calls", label: "Calls", Icon: Phone },
  { kind: "leaf", id: "campaign-shortlisted", label: "Shortlisted", Icon: Star },
];

/** Pinned below the nav, above the account. The two rows that are about the
 *  workspace itself rather than the hiring in it, so they sit together and
 *  outside the scrollable body — Settings first, because it is the one people
 *  reach for; Support last, because it is where you go when the rest failed. */
export const FOOT_NAV: NavLeaf[] = [
  { kind: "leaf", id: "settings", label: "Settings", Icon: Gear },
  { kind: "leaf", id: "support", label: "Support", Icon: Lifebuoy },
];

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
);

/**
 * Reads the current route from `location.hash`.
 *
 * Unknown hashes fall back to home rather than rendering nothing, because the
 * hash is user-editable and a typo should not produce a blank console.
 */
export function routeFromHash(hash: string): RouteId {
  const raw = hash.replace(/^#/, "") || "/";
  /* A trailing slash is the same page: browsers, pasted links and the odd
     copy-paste all add one, and "#/contacts/" landing on Home reads as a
     broken link. Stripped only when something is left afterwards — doing it
     unconditionally turns "/" into "" and loses the home route, which is a
     regression the suite pins in its own test. */
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") || "/" : raw;
  return BY_PATH[path] ?? "home";
}

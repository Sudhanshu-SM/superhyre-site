import {
  AddressBook, Buildings, Gauge, Gear, MagnifyingGlass, Phone,
  PuzzlePiece, Tag, Users,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

/**
 * The navigation model — one source of truth for the sidebar, the router and
 * the page headings, so a route cannot exist in the nav but not the switch (a
 * dead link) or the reverse (an unreachable page).
 *
 * ── EVERY DESTINATION IS BACKED BY A REAL TABLE ─────────────────────────────
 * These are not invented product areas. Each one names a table that already
 * exists in the migrations, which is what keeps the nav honest while the pages
 * are still empty:
 *
 *   001_hybrid_user_tenant.sql  organizations, memberships   -> Settings
 *   002_motherdata.sql          people, companies, skills    -> Database section
 *   003_org_candidates.sql      org_candidates               -> Candidates
 *   004_chrome_extension.sql    extension_installs/captures  -> Extension
 *   005_dialer.sql              dialer_queue, dialer_calls   -> Dialer
 *
 * A page with no table behind it does not belong here yet.
 */

export type RouteId =
  | "home"
  | "candidates"
  | "sourcing"
  | "dialer-queue"
  | "dialer-calls"
  | "people"
  | "companies"
  | "skills"
  | "extension"
  | "settings";

export type Route = {
  id: RouteId;
  /** Hash path without the `#`. Hash routing because GitHub Pages cannot
   *  rewrite: `/access/candidates` would 404 on refresh, `#/candidates` cannot. */
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
    id: "home", path: "/", title: "Overview",
    backing: "",
    blurb: "",
  },
  candidates: {
    id: "candidates", path: "/candidates", title: "Candidates",
    backing: "org_candidates",
    blurb: "Everyone your team has saved, with the pipeline stage and notes that stay private to your workspace.",
  },
  sourcing: {
    id: "sourcing", path: "/sourcing", title: "Sourcing",
    backing: "core.sourcing_runs, core.sourcing_candidates",
    blurb: "Paste a JD, get ContactOut candidates. Claude turns it into search filters, and anything already delivered for that JD is never shown again.",
  },
  "dialer-queue": {
    id: "dialer-queue", path: "/dialer/queue", title: "Call queue",
    backing: "dialer_queue, dialer_contacts",
    blurb: "The list of people waiting to be called, in the order the dialer will work through them.",
  },
  "dialer-calls": {
    id: "dialer-calls", path: "/dialer/calls", title: "Call history",
    backing: "dialer_calls",
    blurb: "Every call placed from the dialer, with outcome, duration and which device made it.",
  },
  people: {
    id: "people", path: "/people", title: "People",
    backing: "people, person_identifiers",
    blurb: "The shared person records the whole SuperHyre platform reads from. Contact details here are common to every workspace.",
  },
  companies: {
    id: "companies", path: "/companies", title: "Companies",
    backing: "companies, company_identifiers",
    blurb: "The shared company records that person experiences resolve against.",
  },
  skills: {
    id: "skills", path: "/skills", title: "Skills",
    backing: "skills, person_skills",
    blurb: "The controlled skill vocabulary that sourcing filters on, so a search for one spelling finds all of them.",
  },
  extension: {
    id: "extension", path: "/extension", title: "Extension",
    backing: "extension_installs, extension_captures",
    blurb: "Which browsers are signed in to the Contact Finder, and what they have captured.",
  },
  settings: {
    id: "settings", path: "/settings", title: "Settings",
    backing: "organizations, memberships",
    blurb: "Your workspace, the people in it and their roles.",
  },
};

/** A single destination. */
export type NavLeaf = { kind: "leaf"; id: RouteId; label: string; Icon: Icon };
/** A destination that owns children, collapsible like the reference design.
 *  `id` is the group's own key for open/closed state, not a route — clicking
 *  the row toggles rather than navigates, because the group itself has no page. */
export type NavGroup = {
  kind: "group"; id: string; label: string; Icon: Icon;
  children: { id: RouteId; label: string }[];
};
export type NavItem = NavLeaf | NavGroup;
/** `label` absent renders the section with a divider and no heading, matching
 *  the reference's unlabelled first and last groups. */
export type NavSection = { id: string; label?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    id: "work",
    items: [
      { kind: "leaf", id: "home", label: "Overview", Icon: Gauge },
      { kind: "leaf", id: "candidates", label: "Candidates", Icon: Users },
      { kind: "leaf", id: "sourcing", label: "Sourcing", Icon: MagnifyingGlass },
      {
        kind: "group", id: "dialer", label: "Dialer", Icon: Phone,
        children: [
          { id: "dialer-queue", label: "Queue" },
          { id: "dialer-calls", label: "History" },
        ],
      },
    ],
  },
  {
    /* The shared motherdata layer is genuinely a separate concern from your own
       pipeline — these tables are common to every workspace — so it earns the
       labelled section rather than being flattened in with the work above. */
    id: "database", label: "Database",
    items: [
      { kind: "leaf", id: "people", label: "People", Icon: AddressBook },
      { kind: "leaf", id: "companies", label: "Companies", Icon: Buildings },
      { kind: "leaf", id: "skills", label: "Skills", Icon: Tag },
    ],
  },
  {
    id: "system",
    items: [
      { kind: "leaf", id: "extension", label: "Extension", Icon: PuzzlePiece },
      { kind: "leaf", id: "settings", label: "Settings", Icon: Gear },
    ],
  },
];

/** Which group holds a route, so opening a child route opens its group. */
export const GROUP_OF: Partial<Record<RouteId, string>> = (() => {
  const map: Partial<Record<RouteId, string>> = {};
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.kind !== "group") continue;
      for (const child of item.children) map[child.id] = item.id;
    }
  }
  return map;
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
 * Anything unrecognised resolves to `home` rather than throwing or rendering
 * blank, because the hash is user-editable: a stale bookmark or a typo must
 * land somewhere real. Trailing slashes are tolerated for the same reason.
 */
export function routeFromHash(hash: string): RouteId {
  const raw = hash.replace(/^#/, "") || "/";
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
  return BY_PATH[path] ?? "home";
}

/**
 * Scope: organisations and workspaces.
 *
 * ── THESE ARE NOT THE SAME THING ────────────────────────────────────────────
 * An earlier version of this file conflated them — it used the organisation's
 * name as the workspace's name and described the organisation as a kind of
 * workspace. Wrong, and wrong in a way that would have shaped the UI around a
 * model the database does not have.
 *
 *   ORGANISATION is the TENANT. One row in `core.organizations`, one
 *   `tenant_<slug>` schema, the boundary every row-level security policy is
 *   written against. It is who the account belongs to, a person resolves to
 *   exactly one, and you do not switch it from a sidebar.
 *
 *   WORKSPACE is the SCOPE you work in, inside that boundary, at one of two
 *   levels:
 *     user  — your own, private to you. The `public` schema, which
 *             `extension_bootstrap()` reports as `scope: "solo"`.
 *     org   — shared across the tenant, reported as `scope: "tenant"`.
 *
 * So the sidebar's switcher switches WORKSPACES, grouped under the organisation
 * they belong to, and the tenant identity itself sits in the account row at the
 * foot — which is the honest place for it: it is who you are, not what you are
 * currently looking at.
 *
 * ── PLACEHOLDER, AND LABELLED AS ONE ────────────────────────────────────────
 * `extension_bootstrap()` returns one organisation and one schema, because the
 * database resolves a person to a single tenant by email domain. There is no
 * membership table, so there is no workspace-switching API: the org-level rows
 * below carry `switchable: false`, which is what stops someone wiring a click
 * to a no-op and shipping a menu that silently does nothing.
 *
 * Switching a workspace would change which schema is read. That is why these
 * stay disabled while the campaign switcher really does switch — re-scoping a
 * campaign label is a true statement about UI state, and nothing downstream of
 * it claims real data.
 */

/** The scope you operate in, inside the tenant. Never the tenant itself. */
export type Workspace = {
  id: string;
  name: string;
  /** `user` is private to you; `org` is shared across the organisation. The
   *  switcher groups by this, which is the whole reason it is carried. */
  level: "user" | "org";
  /** Shown under the name in the menu — what distinguishes this one. */
  hint: string;
  /** False until a membership table and a switching API exist. */
  switchable: boolean;
};

/**
 * The workspaces available to an account.
 *
 * Org-level rows only exist when there IS an organisation: a solo account is
 * its own tenant of one, so offering it scopes "shared across the
 * organisation" would describe a boundary it is not inside.
 */
export function workspacesFor(displayName: string, organizationName: string | null): Workspace[] {
  const first = displayName.trim().split(/\s+/)[0] ?? displayName;
  const own: Workspace = {
    id: "user",
    name: `${first}'s workspace`,
    level: "user",
    hint: "Private to you",
    switchable: true,
  };

  const org = organizationName?.trim();
  if (!org) return [own];

  /* Fixtures — see the module note. Named for the way a recruiting org
     actually divides shared work, rather than "Workspace 1..3". */
  return [
    own,
    { id: "all", name: "All hiring", level: "org", hint: "Every team", switchable: false },
    { id: "tech", name: "Engineering", level: "org", hint: "Technical roles", switchable: false },
    { id: "cxo", name: "Leadership", level: "org", hint: "Executive searches", switchable: false },
  ];
}

/** Which workspace the sidebar opens in: your own, always. It is the only one
 *  `extension_bootstrap()` actually grants. */
export function currentWorkspace(displayName: string, organizationName: string | null): Workspace {
  const list = workspacesFor(displayName, organizationName);
  /* [0] is the user-level workspace by construction above. Written as a find
     rather than an index because with noUncheckedIndexedAccess an index read is
     `Workspace | undefined`, and the fallback keeps this total. */
  return list.find((w) => w.level === "user") ?? {
    id: "user", name: `${displayName}'s workspace`, level: "user",
    hint: "Private to you", switchable: true,
  };
}

/**
 * The campaign the sidebar is scoped to.
 *
 * A fixture too: there is no `campaigns` table yet. One object rather than a
 * bare string so the shape is already right when it becomes a row.
 */
export type Campaign = { id: string; name: string; role: string };

/**
 * The campaigns the switcher offers.
 *
 * Unlike the workspaces above these are NOT disabled — selecting one really
 * re-scopes the sidebar, because every page below it is already an honest
 * placeholder naming the table it will read. Switching the label is a true
 * statement about UI state; it is not pretending to load data that does not
 * exist.
 */
export const CAMPAIGNS: readonly Campaign[] = [
  { id: "backend-snr", name: "Senior Backend Engineers", role: "Engineering · Bangalore" },
  { id: "platform-sre", name: "Platform SRE", role: "Engineering · Remote" },
  { id: "ios-mid", name: "iOS Engineers", role: "Engineering · Bangalore" },
  { id: "design-lead", name: "Design Lead", role: "Design · Bangalore" },
  { id: "gtm-ae", name: "Enterprise AE", role: "Go to market · Mumbai" },
  { id: "ds-applied", name: "Applied Data Scientists", role: "Data · Remote" },
  { id: "fin-controller", name: "Financial Controller", role: "Finance · Bangalore" },
];

/** What the sidebar is scoped to on first load.
 *
 *  Written out rather than `CAMPAIGNS[0]`: with noUncheckedIndexedAccess an
 *  index read is `Campaign | undefined`, and a non-null assertion here would be
 *  a lie the moment someone empties the array. Duplicating one row keeps the
 *  default total. */
export const CURRENT_CAMPAIGN: Campaign = {
  id: "backend-snr", name: "Senior Backend Engineers", role: "Engineering · Bangalore",
};

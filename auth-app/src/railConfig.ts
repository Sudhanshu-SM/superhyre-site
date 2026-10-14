import { GoogleLogo, NotionLogo, SlackLogo } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ApiMember } from "./api/campaigns";
import type { OrgConnection } from "./api/identity";
import type { MemoryStats } from "./api/memory";
import type { CampaignRow } from "./campaignsData";
import type { ConnectionsState } from "./connectionsStore";
import { MEMORY_HREF, notesLabel } from "./memoryView";
import { campaignLink, ROUTES } from "./nav";
import type { Channel } from "./orchestrator";
import { can, standingOf } from "./can";
import type { Standing } from "./can";
import type { Role } from "./roleStore";

/**
 * What the Agent page's Configuration panel says when it is drawn from the workspace's
 * own data rather than from the prototype's fixtures.
 *
 * Every function here is pure: the page gathers the stores (campaign, connections,
 * members, forms) and hands their current values in, so the panel's wording can be
 * pinned by tests without a DOM.
 *
 * The panel's one rule carries over from the prototype and is kept: a field that is set
 * is text; a field that is not set puts the ACTION that would set it in the value
 * position, and the action goes somewhere real. Where nothing can set a field (there is
 * no ATS integration, and a campaign's department is chosen when it is created) the row
 * is left out instead of promising an action that does not exist.
 */

export type ConfigNote = { text: string; href?: string; onClick?: () => void };

export type ConfigRow = {
  label: string;
  /** Configured. A fact, in --ink. */
  value?: string;
  /**
   * Not configured. The reference's best idea: the value position holds the
   * ACTION that would fill it, in --ink-2, rather than a blank or a dash.
   *
   * `href` is mandatory and that is the honesty constraint — an affordance
   * that reads as a control has to go somewhere. Both of these point at real
   * routes the hash router honours, so the row takes you to the page where the
   * field would be set even though nothing here can set it inline.
   */
  action?: { label: string; href: string };
  /** Not configured, and set from here: the same place for the action, but it opens a dialog rather than a page. */
  act?: { label: string; onClick: () => void };
  /**
   * Brand marks rendered before the value.
   *
   * Only the CONNECTED channels appear, which is what makes the marks need no
   * on/off encoding of their own — every logo present is a logo that works.
   * Dimming the disconnected ones instead would have put the state in an
   * opacity, and an opacity low enough to read as "off" is an opacity below
   * the contrast floor for a glyph that still means something.
   *
   * The `2 of 4` stays beside them, because the marks can only say what IS
   * connected and the row's real question is whether anything is missing.
   */
  marks?: readonly Channel[];
  /** Lines under the value: what is missing and where to fix it, or who to ask. */
  notes?: readonly ConfigNote[];
  /** The services the first note offers to connect, drawn as small marks before its words (nothing is connected yet). */
  offer?: readonly IntegrationId[];
  /** Still arriving: a quiet placeholder where the value goes. */
  pending?: boolean;
  /** How many note lines a pending row holds the room for, so it doesn't change height on arrival. */
  reserve?: number;
  /** The value couldn't be read; offers to ask again. */
  retry?: () => void;
  /** The value couldn't be read. The panel names the row in one "didn't load" block with a retry, not in the row. */
  failed?: boolean;
};

export const CONNECTIONS_HREF = "#/settings/connections";

/* ── channels: what the agent can speak and write through ── */

export type IntegrationId = "google" | "slack" | "notion";

export type Integration = {
  id: IntegrationId;
  name: string;
  Icon: Icon;
  brand: string;
  /** The same mark on the dark theme's card (see Channel.brandDark). */
  brandDark: string;
  state: "connected" | "expired" | "missing";
  /** Shown on the mark's tooltip once connected. */
  detail: string;
};

/*  Brand colours as data, the way the prototype's channels carry theirs. Slack and Notion
    are the same hexes that were measured on the white panel (11.00:1 and 17.59:1); Google's
    blue clears the 3:1 floor for a meaningful glyph. */
const BRAND: Readonly<Record<IntegrationId, { name: string; Icon: Icon; brand: string; brandDark: string }>> = {
  google: { name: "Google", Icon: GoogleLogo, brand: "#4285f4", brandDark: "#6ea1f7" },
  // Slack's aubergine and Notion's black are invisible on a near-black card (1.7:1, 1.1:1): each states a lighter
  // value for the dark theme (3:1 or better there, pinned in rail.test.ts) and the rail picks by theme.
  slack: { name: "Slack", Icon: SlackLogo, brand: "#611f69", brandDark: "#c993d1" },
  notion: { name: "Notion", Icon: NotionLogo, brand: "#191919", brandDark: "#ececec" },
};

const named = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" · ");

/** The integrations this server offers, in the order the panel lists them, with how each stands. */
export function integrationsOf(c: Pick<ConnectionsState, "google" | "slack" | "notion">): Integration[] {
  const out: Integration[] = [];
  const g = c.google;
  if (g?.available) {
    const state: Integration["state"] = g.status === "disconnected" ? "missing"
      : g.status === "connected" && g.products.includes("gmail") ? "connected" : "expired";
    const does = g.products.map((p) => (p === "gmail" ? "Gmail" : "Sheets")).join(" and ");
    out.push({ id: "google", ...BRAND.google, state, detail: named(does, g.accountEmail) });
  }
  for (const id of ["slack", "notion"] as const) {
    const conn = c[id];
    out.push({
      id, ...BRAND[id],
      state: !conn ? "missing" : conn.status === "connected" ? "connected" : "expired",
      detail: named(conn?.workspaceName ?? conn?.accountName, id === "slack" ? slackHome(conn) : null),
    });
  }
  return out;
}

/** "posts to #hiring", once an admin has chosen where Slack messages go. */
function slackHome(conn: OrgConnection | null): string | null {
  const channel = (conn?.settings.defaultChannel as { name?: unknown } | undefined)?.name;
  return typeof channel === "string" && channel ? `posts to #${channel.replace(/^#/, "")}` : null;
}

const list = (names: readonly string[]): string =>
  names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** "Connect Slack and Notion", "Reconnect Google", or "Reconnect Google, connect Notion". */
export function fixPhrase(items: readonly Integration[], lead = true): string {
  const again = items.filter((i) => i.state === "expired").map((i) => i.name);
  const first = items.filter((i) => i.state === "missing").map((i) => i.name);
  const cap = (s: string) => (lead ? s : s.toLowerCase());
  return [
    again.length ? `${cap("Reconnect")} ${list(again)}` : null,
    first.length ? `${again.length ? "connect" : cap("Connect")} ${list(first)}` : null,
  ].filter(Boolean).join(", ");
}

/**
 * The Channels row: the connected integrations as brand marks, how many of them there
 * are, and under that what is missing and who can fix it.
 *
 * Google is the person's own, so they can always connect it. Slack and Notion are the
 * organisation's, which only an owner or admin can connect: anyone else is told to ask
 * rather than handed a link to a page where the button would not work for them.
 *
 * The second line is always there, saying "Manage connections" when nothing is missing,
 * so the row is the same height while it loads, when it fails and once it has arrived.
 */
export function channelsRow(
  c: Pick<ConnectionsState, "status" | "google" | "slack" | "notion">,
  viewer: { role: Role; standing?: Standing },
  retry: () => void,
): ConfigRow {
  if (c.status === "idle" || c.status === "loading") return { label: "Channels", pending: true, reserve: 1 };
  if (c.status === "failed") return { label: "Channels", value: "Couldn't load", retry, notes: [], failed: true };

  const items = integrationsOf(c);
  const manages = can(standingOf(viewer), "connections.manage");
  const on = items.filter((i) => i.state === "connected");
  const missing = items.filter((i) => i.state !== "connected");
  const mine = missing.filter((i) => i.id === "google" || manages);
  const others = missing.filter((i) => i.id !== "google" && !manages);

  const notes: ConfigNote[] = [];
  if (mine.length) notes.push({ text: fixPhrase(mine), href: CONNECTIONS_HREF });
  if (others.length) notes.push({ text: `Ask an admin to ${fixPhrase(others, false)}` });
  if (!notes.length) notes.push({ text: manages ? "Manage connections" : "See connections", href: CONNECTIONS_HREF });

  return {
    label: "Channels",
    value: on.length ? `${on.length} of ${items.length}` : "None connected",
    ...(on.length
      ? { marks: on.map((i): Channel => ({ id: i.id, name: i.name, Icon: i.Icon, brand: i.brand, brandDark: i.brandDark, connected: true, detail: i.detail })) }
      : mine.length ? { offer: mine.map((i) => i.id) } : {}),
    notes,
  };
}

/**
 * The Memory row: how many notes the agent keeps and how many things it has coming up, and under
 * that what needs a look. NOT part of the Configuration panel any more (what the agent remembers is its own
 * business, and what it has coming up is on Home); the row stays here, dormant, with its tests. `null` when the
 * server has no memory yet.
 *
 * Like Channels it always has the one second line, so the row is the same height while it loads, when
 * it fails and once it has arrived.
 */
export function memoryRow(
  m: {
    stats: MemoryStats | null;
    statsPhase: "idle" | "loading" | "ready" | "failed";
    unavailable: boolean;
    /** What is scheduled to happen later; absent while it hasn't arrived or the server has no schedules. */
    comingUp?: { count: number; more: boolean } | null;
  },
  retry: () => void,
): ConfigRow | null {
  if (m.unavailable) return null;
  if (m.stats && (m.statsPhase === "ready" || m.statsPhase === "loading")) {
    const { active, pending } = m.stats;
    const later = m.comingUp && m.comingUp.count > 0 ? comingUpLabel(m.comingUp.count, m.comingUp.more) : null;
    const value = [active > 0 ? notesLabel(active) : null, later].filter(Boolean).join(", ") || "Nothing yet";
    return {
      label: "Memory",
      value,
      notes: [{ text: pending > 0 ? `${pending} to review` : "See what it remembers", href: MEMORY_HREF }],
    };
  }
  if (m.statsPhase === "failed") return { label: "Memory", value: "Couldn't load", retry, notes: [], failed: true };
  return { label: "Memory", pending: true, reserve: 1 };
}

/** "3 coming up", "50+ coming up". */
const comingUpLabel = (count: number, more: boolean): string => `${count}${more ? "+" : ""} coming up`;

/* ── people ── */

type Viewer = { role: Role; userId?: string | undefined; standing?: Standing | undefined };

const isYou = (id: string | null | undefined, v: Viewer) => !!id && !!v.userId && id === v.userId;

/** "You, Priya N +2": at most two names, the viewer first. */
export function namesLine(people: ReadonlyArray<{ name: string; you: boolean }>): string {
  const sorted = [...people].sort((a, b) => Number(b.you) - Number(a.you));
  const shown = sorted.slice(0, 2).map((p) => (p.you ? "You" : p.name));
  const more = sorted.length - shown.length;
  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
}

const UNASSIGNED = "Unassigned";

/**
 * The people on a campaign other than its owner. Live rows carry names and ids side by
 * side, but the names can include the owner up front when the server's team list left them
 * out, so ids line up with the END of the names.
 */
export function collaboratorsOf(row: CampaignRow, v: Viewer): Array<{ name: string; you: boolean }> {
  const ids = row.teamIds;
  if (!ids) return row.team.filter((n) => n !== row.owner).map((name) => ({ name, you: false }));
  const offset = row.team.length - ids.length;
  return ids
    .map((id, i) => ({ id, name: row.team[offset + i] ?? "" }))
    .filter((p) => p.id !== row.ownerId && p.name)
    .map((p) => ({ name: p.name, you: isYou(p.id, v) }));
}

/** A campaign's intake: the forms people apply or answer through. */
export type IntakeState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; forms: ReadonlyArray<{ name: string; status: "live" | "draft" }> };

/**
 * The rows for one campaign. `inOrg` is false in Personal, which is one person's alone: who else is on it and
 * who can see it are not questions there, so those two rows are left out (absent means an organisation).
 */
export function campaignRows(
  row: CampaignRow,
  v: Viewer & {
    connections: ConnectionsState;
    onRetryConnections: () => void;
    intake: IntakeState;
    onRetryIntake?: () => void;
    inOrg?: boolean;
    /** The campaign's job description and search filters, with what opens each. Absent where they are not shown. */
    search?: SearchState;
  },
): ConfigRow[] {
  const manages = can(standingOf(v), "campaign.assign");
  const overview = campaignLink(row.id);
  const forms = campaignLink(row.id, "forms");
  const rows: ConfigRow[] = [];

  const ownerless = !row.ownerId && (!row.owner || row.owner === UNASSIGNED);
  rows.push(
    !ownerless
      ? { label: "Owner", value: isYou(row.ownerId, v) ? "You" : row.owner }
      : manages
        ? { label: "Owner", action: { label: "Set an owner", href: overview } }
        : { label: "Owner", value: "Nobody yet" },
  );

  if (v.inOrg !== false) {
    const others = collaboratorsOf(row, v);
    rows.push(
      others.length
        ? { label: "Collaborators", value: namesLine(others) }
        : manages
          ? { label: "Collaborators", action: { label: "Add collaborators", href: overview } }
          : { label: "Collaborators", value: "Just the owner" },
    );

    rows.push({ label: "Visibility", value: row.visibility === "org" ? "Everyone in the org" : "Team and admins" });
  }
  if (row.department) rows.push({ label: "Department", value: row.department });
  if (v.search) rows.push(...searchRows(v.search));
  rows.push(channelsRow(v.connections, v, v.onRetryConnections));
  rows.push(intakeRow(v.intake, forms, v.onRetryIntake));
  return rows;
}

/** What the Configuration panel needs to say about the campaign's job description and search filters. */
export type SearchState = {
  /** Whether the campaign has a job description on it (read, or saved to be). `null` while that is still arriving. */
  jd: boolean | null;
  /** The filters in a few words ("Pune, 4 to 8 years, 2 more"), or null when none narrow the search. */
  filters: string | null;
  /** Following a campaign is not being on it: its description and filters can be read, not changed. */
  mayChange: boolean;
  onJd: () => void;
  onFilters: () => void;
  /** Described for the campaign that is started next (no campaign in focus), not for one that is open. */
  forNext?: boolean;
};

/**
 * The job description and the filters. Set, each says so and offers the one next step (Replace or Edit, or
 * View for someone who only follows the campaign); unset, the value position holds the action that sets it
 * (or, for someone who cannot, the plain fact).
 */
export function searchRows(s: SearchState): ConfigRow[] {
  const jd: ConfigRow =
    s.jd === null
      ? { label: "Job description", pending: true }
      : s.jd
        ? { label: "Job description", value: s.forNext ? "Ready for the next campaign" : "Added", notes: [{ text: s.mayChange ? "Replace" : "View", onClick: s.onJd }] }
        : s.mayChange
          ? { label: "Job description", act: { label: s.forNext ? "Add one for the next campaign" : "Add job description", onClick: s.onJd } }
          : { label: "Job description", value: "None yet" };
  const filters: ConfigRow = s.filters
    ? { label: "Filters", value: s.filters, notes: [{ text: s.mayChange ? "Edit" : "View", onClick: s.onFilters }] }
    : s.mayChange
      ? { label: "Filters", act: { label: s.forNext ? "Set up for the next campaign" : "Set up filters", onClick: s.onFilters } }
      : { label: "Filters", value: "None set" };
  return [jd, filters];
}

export function intakeRow(intake: IntakeState, formsHref: string, retry?: () => void): ConfigRow {
  if (intake.status === "loading") return { label: "Intake", pending: true };
  if (intake.status === "failed") return { label: "Intake", value: "Couldn't load", failed: true, ...(retry ? { retry } : {}) };
  const live = intake.forms.filter((f) => f.status === "live");
  if (live.length) return { label: "Intake", value: live.length > 1 ? `${live[0]?.name} +${live.length - 1}` : (live[0]?.name ?? "") };
  if (intake.forms.length) return { label: "Intake", action: { label: "Publish the form", href: formsHref } };
  return { label: "Intake", action: { label: "Create an intake form", href: formsHref } };
}

/* ── the workspace, when no campaign is chosen ── */

export type PeopleState = { status: "loading" } | { status: "failed" } | { status: "ready"; members: readonly ApiMember[] };

const memberName = (m: Pick<ApiMember, "fullName" | "email">) => m.fullName?.trim() || m.email || "A teammate";

const RUNNING: ReadonlySet<string> = new Set(["active", "draft"]);

export function workspaceRows(
  v: Viewer & {
    connections: ConnectionsState;
    onRetryConnections: () => void;
    campaigns: readonly CampaignRow[];
    campaignsReady: boolean;
    /** The campaign list didn't load, which is not the same as there being none. */
    campaignsFailed?: boolean;
    onRetryCampaigns?: () => void;
    people: PeopleState;
    /** An organisation, where there is a team to invite people to; a personal workspace has none. */
    inOrg: boolean;
    /** The job description and filters for the campaign started next, as prompts that open the same dialogs. */
    search?: SearchState;
  },
): ConfigRow[] {
  const manages = can(standingOf(v), "member.invite");
  const rows: ConfigRow[] = [];

  if (v.people.status === "ready") {
    const active = v.people.members.filter((m) => m.status === "active");
    const owner = active.find((m) => m.role === "owner");
    if (owner) rows.push({ label: "Owner", value: isYou(owner.userId, v) ? "You" : memberName(owner) });
    /* An empty list is a list that didn't load (there is always at least the person asking),
       and a panel that said the team was empty on that evidence would be wrong. */
    if (v.inOrg && active.length) {
      const team = active.filter((m) => m !== owner).map((m) => ({ name: memberName(m), you: isYou(m.userId, v) }));
      rows.push(
        team.length
          ? { label: "Team", value: namesLine(team) }
          : manages
            ? { label: "Team", action: { label: "Invite people", href: "#/settings/members" } }
            : { label: "Team", value: "Just the owner" },
      );
    }
  } else if (v.people.status === "loading") {
    rows.push({ label: "Owner", pending: true });
    if (v.inOrg) rows.push({ label: "Team", pending: true });
  }

  /* A campaign is active until it is closed: a draft left over from before counts as active, there is none to finish. */
  const running = v.campaigns.filter((r) => RUNNING.has(r.status)).length;
  const mayCreate = can(standingOf(v), "campaign.create");
  rows.push(
    v.campaignsFailed
      ? { label: "Campaigns", value: "Couldn't load", failed: true, ...(v.onRetryCampaigns ? { retry: v.onRetryCampaigns } : {}) }
      : !v.campaignsReady
      ? { label: "Campaigns", pending: true }
      : running
        ? { label: "Campaigns", value: `${running} active` }
        : mayCreate
          ? { label: "Campaigns", action: { label: "Create a campaign", href: `#${ROUTES.campaigns.path}` } }
          : { label: "Campaigns", value: "None yet" },
  );
  if (v.search) rows.push(...searchRows({ ...v.search, forNext: true }));
  rows.push(channelsRow(v.connections, v, v.onRetryConnections));
  return rows;
}

/* ── the fixed panel ──
   The Configuration panel draws the same rows, in the same order, at the same heights, whatever is set, whatever is
   still arriving and whichever scope it is about, so nothing above or below it moves when a field is added, a read
   comes back or the campaign in focus changes. A row that has no data yet holds its place with a quiet value; every
   row is one target that goes somewhere (a page, or a dialog) and says so in its name. */

/** Where a row goes when it is clicked: a page, or what it opens. */
export type RailGo = { href: string } | { onClick: () => void };

export type RailLayout = "campaign" | "workspace";

/** The rows, in order, for a campaign and for the workspace (no campaign in focus). Seven each. */
export const CAMPAIGN_SLOTS = ["Owner", "Collaborators", "Visibility", "Job description", "Filters", "Channels", "Intake"] as const;
export const WORKSPACE_SLOTS = ["Owner", "Team", "Campaigns", "Job description", "Filters", "Channels", "Intake"] as const;

export type RailSlot = {
  key: string;
  label: string;
  /** The value, or what a click does when nothing is set, or "Not set": always one line. */
  value: string;
  /** Muted: nothing is set here (or it could not be read). */
  empty: boolean;
  /** Still arriving: a skeleton bar holds the value's place. */
  loading: boolean;
  /** The Channels row's brand marks (the connected ones). */
  marks?: readonly Channel[];
  /** The services the note offers to connect, as small marks before it (nothing is connected yet). */
  offer?: readonly IntegrationId[];
  /** The second line of a two-line row (Channels): what is missing, or where to manage it. */
  note?: string;
  /** Two lines tall: the Channels row, always. */
  twoLine: boolean;
  go: RailGo;
  /** The row's whole name for assistive technology: "Channels, 2 of 3. Reconnect Slack." */
  name: string;
};

export const NOT_SET = "Not set";

const DEFAULT_HREF: Readonly<Record<string, string>> = {
  Owner: "#/settings/members",
  Team: "#/settings/members",
  Collaborators: "#/campaigns",
  Visibility: "#/campaigns",
  Campaigns: "#/campaigns",
  Intake: "#/campaigns",
  Channels: CONNECTIONS_HREF,
};

/** What a row says when there is no row for it at all (not asked for in this workspace, or nothing to say). */
function absent(label: string, layout: RailLayout, inOrg: boolean): { value: string; empty: boolean } {
  if ((label === "Collaborators" || label === "Team") && !inOrg) return { value: "Just you", empty: false };
  if (label === "Visibility" && !inOrg) return { value: "Only you", empty: false };
  if (label === "Intake" && layout === "workspace") return { value: "Set on each campaign", empty: true };
  return { value: NOT_SET, empty: true };
}

/**
 * The panel's rows as the fixed list it always draws. `rows` is what the workspace's data says (campaignRows or
 * workspaceRows, or the fixtures); `go` says where each row goes when the data cannot (a dialog, say). A row that
 * could not be read goes to its retry.
 */
export function railSlots(
  layout: RailLayout,
  rows: readonly ConfigRow[],
  ctx: { inOrg: boolean; go?: Readonly<Partial<Record<string, RailGo>>> },
): RailSlot[] {
  const labels = layout === "campaign" ? CAMPAIGN_SLOTS : WORKSPACE_SLOTS;
  return labels.map((label): RailSlot => {
    const r = rows.find((x) => x.label === label);
    const twoLine = label === "Channels";
    const fallbackGo: RailGo = { href: DEFAULT_HREF[label] ?? "#/agent" };
    if (!r) {
      const a = absent(label, layout, ctx.inOrg);
      return { key: label, label, value: a.value, empty: a.empty, loading: false, twoLine, go: ctx.go?.[label] ?? fallbackGo, name: `${label}, ${a.value}` };
    }
    const failed = r.failed === true;
    const loading = r.pending === true;
    const note = twoLine ? r.notes?.[0]?.text : undefined;
    const value = failed ? "Couldn't load. Try again" : (r.value ?? r.act?.label ?? r.action?.label ?? NOT_SET);
    const empty = failed || r.value === undefined;
    const own = r.notes?.find((n) => n.onClick || n.href);
    const fromRow: RailGo | undefined = r.act ? { onClick: r.act.onClick }
      : r.action ? { href: r.action.href }
      : own?.onClick ? { onClick: own.onClick }
      : own?.href ? { href: own.href }
      : undefined;
    const go: RailGo = failed && r.retry ? { onClick: r.retry } : (ctx.go?.[label] ?? fromRow ?? fallbackGo);
    return {
      key: label, label, value, empty, loading, twoLine, go,
      ...(r.marks && !failed ? { marks: r.marks } : {}),
      ...(r.offer?.length && !failed ? { offer: r.offer } : {}),
      ...(note ? { note } : {}),
      name: loading ? `${label}, loading` : `${label}, ${value}${note ? `. ${note}` : ""}`,
    };
  });
}

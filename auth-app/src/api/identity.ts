import { api, ApiError } from "./client";
import type { AllowedBootstrap } from "../types";

/** Shapes from the API's identity and connections modules (server/src/modules/{identity,connections}). */

export type OrgRole = "owner" | "admin" | "recruiter";

export type Scope = {
  userId: string;
  kind: "personal" | "org";
  organizationId: string | null;
  schema: string;
  role: OrgRole | null;
};

/** Whether people on the organisation's own email domain join at once ("domain_direct") or are asked for. */
export type JoinPolicy = "domain_direct" | "approval";

export type Workspace = {
  kind: "personal" | "org";
  organizationId: string | null;
  name: string;
  logoUrl: string | null;
  role: OrgRole | null;
  active: boolean;
  /** Organisations only. `domain` is null for one made from a personal address: nobody can join it by domain. */
  joinPolicy?: JoinPolicy;
  domain?: string | null;
};

export type Onboarding = {
  email: string;
  domain: string | null;
  personalEmail: boolean;
  canCreateOrganisation: boolean;
  organisation: {
    id: string;
    name: string;
    logoUrl: string | null;
    members: number;
    ownerName: string | null;
    /** They were taken out of it: it isn't offered back to them as their team. */
    removed?: boolean;
  } | null;
  membership: "member" | "pending" | "none";
  /** The organisation they already belong to; one per person. */
  memberOf: string | null;
  /** They chose to carry on in their personal workspace. */
  staysPersonal: boolean;
};

export type Me = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    timeZone: string;
    emailSignature: string | null;
  };
  scope: Scope;
  workspaces: Workspace[];
  onboarding: Onboarding;
};

export type Settings = { fullName?: string; timeZone?: string; emailSignature?: string | null };

export type Member = {
  userId: string;
  /** A recruiter is given only their own: a teammate's address is an owner's and admin's to see (null). */
  email: string | null;
  fullName: string | null;
  /** Their picture, when they have one on the web. */
  avatarUrl?: string | null;
  role: OrgRole;
  status: string;
  joinedAt: string;
  campaigns: number;
};
export type JoinRequest = { id: string; userId: string; email: string; fullName: string | null; requestedAt: string };
/**
 * Where an invitation stands (the server's invite-state.ts): sent and delivered are the email's progress, bounced is an
 * address that refused it, not_sent means no email went (the link is how they join), accepted and expired are over.
 */
export type InviteState = "accepted" | "expired" | "bounced" | "delivered" | "sent" | "not_sent";
export type Invite = {
  id: string;
  email: string;
  role: "admin" | "recruiter";
  createdAt: string;
  expiresAt: string;
  state: InviteState;
  acceptedAt?: string | null;
  /** When the email was handed over; null when none was. */
  emailedAt?: string | null;
  /** Why no email went, when the server knows. */
  emailError?: string | null;
};
/** What an invite link leads to. An unknown token carries only `valid: false`. */
export type InvitePreview = {
  valid: boolean;
  organisationName?: string;
  logoUrl?: string | null;
  role?: "admin" | "recruiter";
  /** Only the invited person is given the address; anyone else holding the link gets `emailHint` ("y***@gmail.com"). */
  email?: string | null;
  emailHint?: string | null;
  forYou?: boolean;
  expiresAt?: string;
};
export type Members = { members: Member[]; requests: JoinRequest[]; invites: Invite[] };

/** Their own saved people and calls that are not in the organisation yet, and whether they have already copied them. */
export type PersonalImportOffer = {
  candidates: number;
  calls: number;
  imported: boolean;
  organisationName: string | null;
  /** People the organisation already holds (a count, nothing about them): left out of what would be copied. */
  skipped?: number;
};

/** An invitation addressed to this person's verified email, from `GET /v1/invitations`. */
export type Invitation = {
  id: string;
  organisationId: string;
  organisationName: string;
  logoUrl: string | null;
  inviterName: string | null;
  role: "admin" | "recruiter";
  createdAt: string;
  expiresAt: string;
};

export type GoogleProduct = "gmail" | "sheets" | "calendar" | "tasks";
/**
 * Where each part of Google stands, as the server reads it (it calls nothing to say it): on; allowed in Google but
 * not given to SuperHyre yet (`needs_access`); switched off for the Google project this app signs in with
 * (`api_disabled`, with the page to switch it on in `help`); or the sign-in itself needs making again.
 */
export type GoogleProductState = {
  product: GoogleProduct;
  label: string;
  state: "on" | "needs_access" | "api_disabled" | "reconnect";
  message?: string;
  help?: string;
};
export type GoogleConnection = {
  available: boolean;
  reason?: string;
  status: "connected" | "expired" | "failed" | "revoked" | "disconnected";
  accountEmail: string | null;
  scopes: string[];
  products: GoogleProduct[];
  /** Absent from a server that predates Calendar and Tasks. */
  productStates?: GoogleProductState[];
  connectedAt: string | null;
};

/**
 * Slack and Notion belong to the organisation, not to a person: an owner or admin connects
 * them once and the agent acts through them for everyone. Any member can read the status.
 */
export type OrgProvider = "slack" | "notion";
export type OrgConnection = {
  provider: OrgProvider;
  status: "connected" | "expired" | "error";
  accountName: string | null;
  workspaceName: string | null;
  connectedBy: { id: string; name: string | null } | null;
  connectedAt: string;
  lastUsedAt: string | null;
  lastError: string | null;
  scopes: string[];
  settings: Record<string, unknown>;
};
/** Where the agent posts by default (Slack) and where it files notes (Notion). */
export type SlackChannel = {
  id: string;
  name: string;
  /** The server says `isPrivate`; `private` is read too, in case an older shape turns up. */
  isPrivate?: boolean;
  private?: boolean;
  /** Whether the Slack app has been added to the channel. It never joins one itself. */
  isMember?: boolean;
};
export type NotionTarget = { type: "page" | "database"; id: string; title: string; url?: string | null };

/**
 * `slack`, `notion` and `providers` are optional on purpose: a server that predates them
 * answers with Google alone, and that is read as "not connected", never as a failure.
 */
export type Connections = {
  google: GoogleConnection;
  slack?: OrgConnection | null;
  notion?: OrgConnection | null;
  providers?: Partial<Record<OrgProvider, { oauth: boolean }>>;
};

export const identityApi = {
  me: () => api<Me>("GET", "/v1/me"),
  updateSettings: (patch: Settings) => api<void>("PATCH", "/v1/me/settings", patch),
  setActiveWorkspace: (organizationId: string | null) =>
    api<Record<string, unknown>>("POST", "/v1/workspace/active", { organizationId }),
  createOrganisation: (input: { name: string; logoUrl: string | null }) =>
    api<{ organisationId: string; schema: string }>("POST", "/v1/organisations", input),
  requestToJoin: () =>
    api<{ requestId: string; organisationId: string }>("POST", "/v1/organisations/join-requests", {}),
  updateOrganisation: (patch: { name?: string; logoUrl?: string | null; joinPolicy?: JoinPolicy }) =>
    api<void>("PATCH", "/v1/organisation", patch),
  /** The logo as a small picture (a data URL from logoImage.ts); owners and admins. Answers with the address it is served from. */
  setOrganisationLogo: (image: string) => api<{ logoUrl: string }>("PUT", "/v1/organisation/logo", { image }),
  removeOrganisationLogo: () => api<void>("DELETE", "/v1/organisation/logo"),
  leaveOrganisation: () => api<void>("POST", "/v1/organisation/leave", {}),
  /** What they could copy from their own space (Personal, the extension) into the organisation. Nothing is copied on joining. */
  personalImportOffer: () => api<PersonalImportOffer>("GET", "/v1/organisation/import-personal"),
  importPersonal: () => api<{ candidates: number; calls: number; organisationId: string; skipped?: number }>("POST", "/v1/organisation/import-personal", {}),
  invitations: () => api<{ invitations: Invitation[]; memberOf: string | null; memberOfRole?: OrgRole | null }>("GET", "/v1/invitations"),
  acceptInvitation: (id: string, fullName?: string) =>
    api<{ organisationId: string; role: OrgRole }>("POST", `/v1/invitations/${encodeURIComponent(id)}/accept`, fullName ? { fullName } : {}),
  declineInvitation: (id: string) => api<void>("POST", `/v1/invitations/${encodeURIComponent(id)}/decline`, {}),
  members: () => api<Members>("GET", "/v1/members"),
  /** `notify: false` makes a fresh link without emailing it (for "Copy link"). */
  invite: (input: { email: string; role: "admin" | "recruiter"; notify?: boolean }) =>
    api<{ inviteId: string; email: string; link: string; emailed?: boolean; emailError?: string }>("POST", "/v1/members/invites", input),
  revokeInvite: (id: string) => api<void>("DELETE", `/v1/members/invites/${id}`),
  decide: (id: string, input: { approve: boolean; role: "admin" | "recruiter" }) =>
    api<{ requestId: string; approved: boolean }>("POST", `/v1/members/requests/${id}/decision`, input),
  setRole: (userId: string, role: "admin" | "recruiter") =>
    api<void>("PATCH", `/v1/members/${userId}/role`, { role }),
  removeMember: (userId: string, reassignTo: string) =>
    api<{ recordsMoved: number }>("DELETE", `/v1/members/${userId}`, { reassignTo }),
  transferOwnership: (userId: string) => api<void>("POST", `/v1/members/${userId}/ownership`, {}),
  previewInvite: (token: string) => api<InvitePreview>("POST", "/v1/invites/preview", { token }),
  acceptInvite: (token: string, fullName?: string) =>
    api<{ organisationId: string; role: string }>("POST", "/v1/invites/accept", { token, ...(fullName ? { fullName } : {}) }),
  stayPersonal: () => api<void>("POST", "/v1/onboarding/personal"),
  connections: () => api<Connections>("GET", "/v1/connections"),
  startGoogle: (products: GoogleProduct[]) =>
    api<{ url: string }>("POST", "/v1/connections/google/start", { products }),
  completeGoogle: (code: string, state: string) =>
    api<Connections & { missing: GoogleProduct[] }>("POST", "/v1/connections/google/complete", { code, state }),
  /** Asks Google whether each part the person allowed really works; answers with the connections as they are now. */
  checkGoogle: (force = false) => api<Connections>("POST", "/v1/connections/google/check", force ? { force: true } : {}),
  disconnectGoogle: () => api<void>("DELETE", "/v1/connections/google"),
  /* Slack and Notion: a pasted token always works; OAuth is offered where the server has it. */
  connectWithToken: (provider: OrgProvider, token: string) =>
    api<OrgConnection>("POST", `/v1/connections/${provider}/token`, { token }),
  startProvider: (provider: OrgProvider) => api<{ url: string }>("POST", `/v1/connections/${provider}/start`, {}),
  completeProvider: (provider: OrgProvider, code: string, state: string) =>
    api<unknown>("POST", `/v1/connections/${provider}/complete`, { code, state }),
  disconnectProvider: (provider: OrgProvider) => api<void>("DELETE", `/v1/connections/${provider}`),
  slackChannels: () => api<{ channels: SlackChannel[]; more?: boolean }>("GET", "/v1/connections/slack/channels"),
  setSlackChannel: (defaultChannel: { id: string; name: string }) =>
    api<unknown>("PUT", "/v1/connections/slack/settings", { defaultChannel }),
  notionTargets: (query: string) =>
    api<{ targets: NotionTarget[] }>("GET", `/v1/connections/notion/targets?query=${encodeURIComponent(query)}`),
  setNotionParent: (defaultParent: Pick<NotionTarget, "type" | "id" | "title">) =>
    api<unknown>("PUT", "/v1/connections/notion/settings", { defaultParent }),
};

/* ── adapters ────────────────────────────────────────────────────────────── */

export function displayNameOf(me: Me): string {
  return me.user.fullName?.trim() || me.user.email.split("@")[0] || "Signed in";
}

export function activeOrg(me: Me): Workspace | null {
  return me.workspaces.find((w) => w.kind === "org" && w.active) ?? null;
}

/** /v1/me in the shape the console was built around (`extension_bootstrap()`). */
export function toBootstrap(me: Me): AllowedBootstrap {
  const org = activeOrg(me);
  return {
    allowed: true,
    scope: org ? "tenant" : "solo",
    user_id: me.user.id,
    email: me.user.email,
    full_name: me.user.fullName ?? "",
    organization_id: org?.organizationId ?? null,
    organization_name: org?.name ?? null,
    schema_name: me.scope.schema,
    role: me.scope.role,
    providers: [],
  };
}

/** The pending join request, if any, for the workspace switcher. */
export function pendingOrgName(me: Me): string | null {
  const o = me.onboarding;
  return o.membership === "pending" && o.organisation ? o.organisation.name : null;
}

/** An invite link's token: `#/invite/<token>`. */
export function inviteTokenFrom(hash: string): string | null {
  const m = /^#?\/invite\/([A-Za-z0-9_-]{16,128})\/?$/.exec(hash);
  return m?.[1] ?? null;
}

/**
 * What the Google consent flow handed back in `#/settings/connections?google=…`.
 * `complete` still has to be finished by the API as the signed-in user.
 */
export type GoogleReturn =
  | { kind: "complete"; code: string; state: string }
  | { kind: "error"; reason: string };

export function googleReturnFrom(hash: string): GoogleReturn | null {
  const q = hash.indexOf("?");
  if (q < 0) return null;
  const params = new URLSearchParams(hash.slice(q + 1));
  const result = params.get("google");
  if (result === "complete") {
    const code = params.get("code");
    const state = params.get("state");
    return code && state ? { kind: "complete", code, state } : { kind: "error", reason: "invalid" };
  }
  if (result === "error") return { kind: "error", reason: params.get("reason") ?? "google" };
  return null;
}

const GOOGLE_REASONS: Readonly<Record<string, string>> = {
  denied: "Google sign-in was cancelled. Nothing was connected.",
  expired: "That Google sign-in took too long. Connect again.",
  unavailable: "Google sign-in isn't set up on this server yet.",
};

export function googleReasonText(reason: string): string {
  return GOOGLE_REASONS[reason] ?? "Google couldn't be connected. Try again.";
}

/**
 * What Slack's or Notion's sign-in handed back, in the same shape Google's does:
 * `#/settings/connections?slack=complete&code=…&state=…` (or `?notion=error&reason=…`).
 */
export type ProviderReturn =
  | { provider: OrgProvider; kind: "complete"; code: string; state: string }
  | { provider: OrgProvider; kind: "error"; reason: string };

export const ORG_PROVIDERS: readonly OrgProvider[] = ["slack", "notion"];
export const PROVIDER_NAME: Readonly<Record<OrgProvider, string>> = { slack: "Slack", notion: "Notion" };

export function providerReturnFrom(hash: string): ProviderReturn | null {
  const q = hash.indexOf("?");
  if (q < 0) return null;
  const params = new URLSearchParams(hash.slice(q + 1));
  for (const provider of ORG_PROVIDERS) {
    const result = params.get(provider);
    if (result === "complete") {
      const code = params.get("code");
      const state = params.get("state");
      return code && state ? { provider, kind: "complete", code, state } : { provider, kind: "error", reason: "invalid" };
    }
    if (result === "error") return { provider, kind: "error", reason: params.get("reason") ?? provider };
  }
  return null;
}

export function providerReasonText(provider: OrgProvider, reason: string): string {
  const name = PROVIDER_NAME[provider];
  if (reason === "denied") return `${name} sign-in was cancelled. Nothing was connected.`;
  if (reason === "expired") return `That ${name} sign-in took too long. Connect again.`;
  if (reason === "unavailable") return `${name} sign-in isn't set up on this server yet. Paste a token instead.`;
  return `${name} couldn't be connected. Try again.`;
}

/**
 * A connection as the console reads it from the API, tolerant of an older server: anything
 * that isn't a connection with a known status is no connection at all.
 */
export function orgConnectionOf(raw: unknown, provider: OrgProvider): OrgConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<OrgConnection>;
  if (c.status !== "connected" && c.status !== "expired" && c.status !== "error") return null;
  return {
    provider,
    status: c.status,
    accountName: c.accountName ?? null,
    workspaceName: c.workspaceName ?? null,
    connectedBy: c.connectedBy ?? null,
    connectedAt: c.connectedAt ?? "",
    lastUsedAt: c.lastUsedAt ?? null,
    lastError: c.lastError ?? null,
    scopes: Array.isArray(c.scopes) ? c.scopes : [],
    settings: c.settings && typeof c.settings === "object" ? c.settings : {},
  };
}

/** Which products a connection still lacks, in words, or null when it has them all. */
export function missingProductsText(missing: readonly GoogleProduct[]): string | null {
  if (missing.length === 0) return null;
  const names = missing.map((p) =>
    p === "gmail" ? "sending from Gmail" : p === "sheets" ? "Google Sheets" : p === "calendar" ? "Google Calendar" : "Google Tasks",
  );
  return `Google didn't allow ${names.join(" or ")}. Connect again and leave every box ticked.`;
}

/**
 * The API's message, made readable. Messages raised in SQL arrive lower-case
 * and without a full stop; one names roles in a way nobody should read.
 */
export function readable(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  if (err.code === "forbidden" && /needs one of/.test(err.message)) {
    return /admin/.test(err.message) ? "Only admins can do this." : "Only the owner can do this.";
  }
  const issues = err.details.issues;
  if (err.code === "bad_request" && Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { path?: unknown };
    if (first.path === "email") return "Enter a full email address.";
    if (first.path === "name") return "Use 2 to 80 characters for the name.";
    if (first.path === "logoUrl") return "The logo needs to be a full web address, starting with https://.";
  }
  const text = err.message.trim();
  if (!text) return "Something went wrong. Try again.";
  // Capitalised for a sentence, unless it opens with an address ("priya@acme.dev is already a member").
  const sentence = /^\S+@\S+/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/* ── workspace changes ───────────────────────────────────────────────────── */

const workspaceListeners = new Set<() => void>();

/**
 * Called after the active workspace changes (switching, creating an
 * organisation, accepting an invite), so stores holding workspace data can
 * drop it and load again.
 */
export function onWorkspaceChange(fn: () => void): () => void {
  workspaceListeners.add(fn);
  return () => workspaceListeners.delete(fn);
}

/** Other tabs of this browser hear about a switch too, so none keeps showing the old workspace. */
const channel: BroadcastChannel | null =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("superhyre.workspace");

export function workspaceChanged(): void {
  for (const fn of workspaceListeners) fn();
  channel?.postMessage("changed");
}

/** This tab found out (from the account it just loaded) that its workspace is not the one it was showing. */
export function workspaceChangedHere(): void {
  for (const fn of workspaceListeners) fn();
}

/** Runs when another tab switched workspace, joined or created an organisation. */
export function onOtherTabWorkspaceChange(fn: () => void): () => void {
  if (!channel) return () => {};
  const listener = () => fn();
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}

/* ── an invite, before accepting it ──────────────────────────────────────── */

export type InviteView =
  | { s: "invalid"; organisation: string | null }
  | { s: "elsewhere"; sentTo: string; organisation: string }
  | { s: "taken"; memberOf: string; organisation: string }
  | { s: "ready"; organisation: string; role: "admin" | "recruiter" };

/**
 * "a***@gmail.com": enough to know which address to sign in with, not enough to learn whose it is. An invite
 * link names its address only to the person it was sent to; anyone else holding the link sees it like this.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "another address";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** What the invite card says, from the preview and the organisation they may already be in. */
export function inviteView(p: InvitePreview, memberOf: string | null): InviteView {
  const organisation = p.organisationName ?? null;
  if (!p.valid || !organisation) return { s: "invalid", organisation };
  // The address itself is only ever the invitee's; anyone else is given a hint, and an older server's full address is masked.
  if (!p.forYou) return { s: "elsewhere", sentTo: p.emailHint ?? (p.email ? maskEmail(p.email) : "another address"), organisation };
  if (memberOf && memberOf !== organisation) return { s: "taken", memberOf, organisation };
  return { s: "ready", organisation, role: p.role ?? "recruiter" };
}

/* ── an invite link opened before signing in ─────────────────────────────── */

const INVITE_KEY = "superhyre.invite";

/** Sign-in leaves this URL (Google returns to the page without its hash), so the token waits here. */
export function rememberInvite(token: string): void {
  try { window.sessionStorage.setItem(INVITE_KEY, token); } catch { /* the link still works if opened again */ }
}

export function takeInvite(): string | null {
  try {
    const token = window.sessionStorage.getItem(INVITE_KEY);
    window.sessionStorage.removeItem(INVITE_KEY);
    return token;
  } catch {
    return null;
  }
}

/* ── the members list, changed before the API answers ────────────────────── */

export const nameOf = (m: { fullName: string | null; email: string | null }): string =>
  m.fullName?.trim() || m.email || "A teammate";

export function changeRole(d: Members, userId: string, role: "admin" | "recruiter"): Members {
  return { ...d, members: d.members.map((m) => (m.userId === userId && m.role !== "owner" ? { ...m, role } : m)) };
}

export function dropMember(d: Members, userId: string): Members {
  return { ...d, members: d.members.filter((m) => m.userId !== userId) };
}

export function dropInvite(d: Members, inviteId: string): Members {
  return { ...d, invites: d.invites.filter((i) => i.id !== inviteId) };
}

export function declineRequest(d: Members, requestId: string): Members {
  return { ...d, requests: d.requests.filter((r) => r.id !== requestId) };
}

export function approveRequest(d: Members, r: JoinRequest, role: "admin" | "recruiter", now = new Date()): Members {
  const joined: Member = {
    userId: r.userId, email: r.email, fullName: r.fullName, role, status: "active", joinedAt: now.toISOString(), campaigns: 0,
  };
  return { ...declineRequest(d, r.id), members: [...d.members.filter((m) => m.userId !== r.userId), joined] };
}

/** The owner hands on ownership and stays as an admin. */
export function handOwnership(d: Members, from: string, to: string): Members {
  return {
    ...d,
    members: d.members.map((m) => (m.userId === to ? { ...m, role: "owner" } : m.userId === from ? { ...m, role: "admin" } : m)),
  };
}

/** The agent's connect cards' state for Gmail, from the Google connection. */
export function gmailStateOf(g: GoogleConnection): "connected" | "expired" | "disconnected" {
  if (g.status === "connected") return g.products.includes("gmail") ? "connected" : "expired";
  return g.status === "disconnected" ? "disconnected" : "expired";
}

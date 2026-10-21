import { useSyncExternalStore } from "react";
import { LIVE } from "./api/client";
import { ME } from "./campaign";
import { TEAM } from "./campaignsData";
import type { Standing } from "./can";

/**
 * Who is using the console, and what they may do.
 *
 * Two roles. An ADMIN manages the organisation's recruiting: creates
 * campaigns, assigns recruiters to them, closes or completes them and
 * deletes contacts. A RECRUITER opens campaigns of their own (theirs alone
 * until an admin adds teammates), sees the campaigns they are on and does
 * the day-to-day work there (shortlist, reach out, move stages, calls,
 * forms). `can()` in can.ts is the table of who may do what.
 *
 * Fixtures: no backend. The session is kept in sessionStorage
 * so a reload keeps the role being demoed; it is per tab and never leaves the
 * browser. The org members are TEAM.
 *
 * Connected to the API: the session comes from the active workspace (see
 * `sessionForScope`) and is set by App after `/v1/me`; nothing is stored.
 */

export type Role = "admin" | "recruiter";
/**
 * `userId` is set when connected to the API; access and "you" go by it, never by name. `standing` is the finer
 * truth behind `role` (owner, admin, recruiter, or the owner of a personal workspace); `can()` reads it.
 */
export type Session = { role: Role; name: string; userId?: string; standing?: Standing };

export const ROLE_LABEL: Readonly<Record<Role, string>> = { admin: "Admin", recruiter: "Recruiter" };

/** A campaign as assignment sees it. Live rows also carry ids and visibility. */
export type Assignable = {
  id: string;
  owner: string;
  team: readonly string[];
  ownerId?: string | null;
  teamIds?: readonly string[];
  visibility?: "team" | "org";
  /** Live rows: the server's own answer to "may this viewer change it" (an admin only on their teams' campaigns and their own). */
  canManage?: boolean;
};

/**
 * Whether a person is on a campaign: its owner or anyone on its team. Given a session with
 * a user id and a row with ids, it goes by id: two people can share a name, and a name can
 * be shown as a full name, an email or its first part depending on where it came from.
 */
export function isAssigned(row: Assignable, who: string | Pick<Session, "name" | "userId">): boolean {
  const person = typeof who === "string" ? { name: who } : who;
  if (person.userId && (row.ownerId !== undefined || row.teamIds)) {
    return row.ownerId === person.userId || (row.teamIds ?? []).includes(person.userId);
  }
  return row.owner === person.name || row.team.includes(person.name);
}

/** Whether a session may see a campaign: admins all; recruiters theirs and org-wide ones. */
function mayView(row: Assignable, s: Session): boolean {
  return s.role === "admin" || row.visibility === "org" || isAssigned(row, s);
}

/**
 * The campaigns a session may see, in input order. Connected to the API the list is already
 * what the person may see (the server decides), so it is kept as is; on fixtures the role
 * decides here.
 */
export function visibleCampaigns<T extends Assignable>(rows: readonly T[], s: Session): T[] {
  return LIVE ? [...rows] : rows.filter((r) => mayView(r, s));
}

/** Whether a session may open a campaign at all. Live: anything the server listed. */
export function canOpenCampaign(row: Assignable | undefined, s: Session): boolean {
  return !row || LIVE || mayView(row, s);
}

/** Whether a user id is the signed-in person: for "You" labels and "Mine" filters. */
export function isMe(userId: string | null | undefined, s: Session = getSession()): boolean {
  return !!userId && !!s.userId && userId === s.userId;
}

/** The signed-in person's id, as a hook; undefined on fixtures and before `/v1/me`. */
export function useMyId(): string | undefined {
  return useSession().userId;
}

/** A team with the owner first, de-duplicated, members only. Assigning keeps
    the owner on the campaign: removing the owner is a different decision. */
export function normaliseTeam(owner: string, picked: readonly string[], members: readonly string[] = TEAM): string[] {
  const set = new Set(picked.filter((m) => members.includes(m)));
  set.delete(owner);
  return [owner, ...members.filter((m) => set.has(m))];
}

/**
 * The console role for a workspace. Owners and admins manage; a recruiter works. In a personal workspace
 * everything is the person's own, so they get the admin controls over it. An organisation seat with no role is
 * the least a person can be, as it is on the server.
 */
export function sessionForScope(
  scope: { kind: "personal" | "org"; role: string | null },
  name: string,
  userId?: string,
): Session {
  const standing: Standing =
    scope.kind === "personal" ? "personal" : scope.role === "owner" || scope.role === "admin" ? scope.role : "recruiter";
  return {
    role: standing === "recruiter" ? "recruiter" : "admin",
    standing,
    name,
    ...(userId ? { userId } : {}),
  };
}

/* ── the session ── */

const KEY = "sh-session";
/* The fixture console demos as one of its seeded people; connected, nobody until `/v1/me`. */
export const DEFAULT_SESSION: Session = LIVE ? { role: "admin", name: "" } : { role: "admin", name: ME };

function parse(raw: string | null): Session {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    if (v && (v.role === "admin" || v.role === "recruiter") && typeof v.name === "string" && (TEAM as readonly string[]).includes(v.name)) {
      return { role: v.role, name: v.name };
    }
  } catch { /* a bad value falls back to the default */ }
  return DEFAULT_SESSION;
}

let session: Session = (() => {
  if (LIVE) return DEFAULT_SESSION;
  try { return parse(typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(KEY)); } catch { return DEFAULT_SESSION; }
})();
const listeners = new Set<() => void>();

export function getSession(): Session { return session; }

export function setSession(next: Partial<Session>) {
  const merged = { ...session, ...next };
  /* A role set on its own (the demo's switch) is no longer the standing it was derived from. */
  if (next.role && next.standing === undefined) delete merged.standing;
  if (merged.role === session.role && merged.name === session.name && merged.userId === session.userId && merged.standing === session.standing) return;
  session = merged;
  if (!LIVE) {
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch { /* demo still works without storage */ }
  }
  for (const l of listeners) l();
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getSession,
    /* The same value when rendered to a string (a test, or anything that draws without a browser). */
    getSession,
  );
}

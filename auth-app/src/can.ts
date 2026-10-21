import { useSession } from "./roleStore";
import type { Session } from "./roleStore";

/**
 * Who may do what, in one table.
 *
 * Mirrors the server (`isAdmin` / `requireAdmin` in modules/pipeline, `requireOrgRole`, the `public.*` member
 * functions) and docs/workspaces-and-orgs.md section 2. The console uses it to hide or explain a control; the server
 * still refuses what it must, so a disagreement here is a missing button, never a hole.
 *
 * A personal workspace is its owner's alone: they may do everything in it, and there is no team, so nothing that is
 * about other people applies. Add a capability by adding a line: the key says what, the list says who.
 */

export type Standing = "personal" | "owner" | "admin" | "recruiter";

const EVERYONE = ["personal", "owner", "admin", "recruiter"] as const;
/** What the server's `isAdmin` lets through: the owner of a personal workspace, and an organisation's owner or admin. */
const MANAGERS = ["personal", "owner", "admin"] as const;
/** Things about a team, which only an organisation has. */
const TEAM_MANAGERS = ["owner", "admin"] as const;
const OWNER = ["owner"] as const;

export const CAPABILITIES = {
  /* campaigns */
  "campaign.seeAll": MANAGERS,
  /* Anyone who works in the workspace opens campaigns (the server's `mayCreateCampaign`). A recruiter's is theirs
     alone: they own it and are the only one on it. Who owns it, who is on it, who else sees it and adding a client
     for it stay a manager's (`campaign.assign`, `client.manage`). */
  "campaign.create": EVERYONE,
  /* The campaign's own admin controls: team, client, visibility, finishing it. */
  "campaign.manage": MANAGERS,
  /* Who owns a campaign, who is on it, who it is for and who sees it. */
  "campaign.assign": TEAM_MANAGERS,
  /* Closing and reopening: an admin, or the campaign's own owner (see `canSetStatus`). */
  "campaign.close": MANAGERS,
  "campaign.complete": MANAGERS,
  "campaign.work": EVERYONE,
  /* people */
  "contact.add": EVERYONE,
  "contact.delete": MANAGERS,
  /* Taking someone off the do-not-contact list: nobody else decides that they may be written to again. */
  "contact.allowAgain": MANAGERS,
  /* Clients: everyone sees the ones their campaigns are for; only managers read the full record or change it. */
  "client.view": EVERYONE,
  "client.details": MANAGERS,
  "client.manage": MANAGERS,
  /* Everyone's calls on one page (the top-level Calls): the organisation's owner and admins, and the one person of a
     personal workspace. A recruiter has no such page: their calls are each campaign's own Calls page (the server
     already sends them only their own). */
  "calls.all": MANAGERS,
  /* Tasks: a recruiter hands work to themselves only. */
  "task.assignOthers": TEAM_MANAGERS,
  /* Slack, Notion and where messages go belong to the organisation. */
  "connections.manage": MANAGERS,
  /* The team: invitations, requests, roles, removal, the organisation itself. */
  "member.invite": TEAM_MANAGERS,
  "member.decideRequests": TEAM_MANAGERS,
  "member.setRole": TEAM_MANAGERS,
  /* Taking someone out of the organisation is the owner's alone; an admin takes people off the teams they lead. */
  "member.remove": OWNER,
  /* The Teams page: who sees it at all (nav.ts holds the same two standings; a test keeps them together). */
  "teams.manage": TEAM_MANAGERS,
  /* Making and deleting a team. An admin changes the people and campaigns of the teams they lead. */
  "teams.create": OWNER,
  "org.settings": TEAM_MANAGERS,
  "org.transferOwnership": OWNER,
  /* The owner has to hand the organisation on first. */
  "org.leave": ["admin", "recruiter"],
} as const satisfies Record<string, readonly Standing[]>;

export type Capability = keyof typeof CAPABILITIES;

/** Whether someone in this standing may do this. A fixture's plain "admin" or "recruiter" is a standing too. */
export function can(standing: Standing, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Standing[]).includes(standing);
}

/** The standing a session carries: the exact one when known, else what its two-way role says. */
export const standingOf = (s: Pick<Session, "role" | "standing">): Standing => s.standing ?? s.role;

/** `can` for the signed-in person, as a hook. */
export function useCan(capability: Capability): boolean {
  return can(standingOf(useSession()), capability);
}

/**
 * Closing or reopening one campaign: a manager, or the person who owns that campaign. The server's rule
 * (`setCampaignStatus`), which `campaign.close` alone cannot say.
 */
export function canSetStatus(s: Pick<Session, "role" | "standing" | "userId">, campaign: { ownerId?: string | null }): boolean {
  return can(standingOf(s), "campaign.close") || (!!s.userId && campaign.ownerId === s.userId);
}


/**
 * Managing people, down to the role: who may invite, approve, change or remove whom. `member.*` above says who manages
 * at all; this is the table behind the buttons (the server's `core.org_may`, mirrored as data in identity/roles.ts).
 * An admin deals with recruiters only (and does not remove anyone from the organisation: that is the owner's, and an
 * admin takes people off the teams they lead); the owner with admins and recruiters; nobody touches the owner.
 */
export type Assignable = "admin" | "recruiter";
export type PeopleAction = "invite" | "approve" | "setRole" | "remove";

const PEOPLE: Readonly<Record<PeopleAction, Partial<Record<Standing, readonly Assignable[]>>>> = {
  invite: { owner: ["admin", "recruiter"], admin: ["recruiter"] },
  approve: { owner: ["admin", "recruiter"], admin: ["recruiter"] },
  /* `setRole`: the roles of the people whose role may be changed, which may be changed to either of the owner's two;
     an admin's own list is recruiters, who cannot be moved anywhere an admin may put them. */
  setRole: { owner: ["admin", "recruiter"], admin: ["recruiter"] },
  remove: { owner: ["admin", "recruiter"] },
};

/** The roles this standing may invite as, approve as, or (for change and remove) act on. */
export function peopleRoles(standing: Standing, action: PeopleAction): readonly Assignable[] {
  return PEOPLE[action][standing] ?? [];
}

/**
 * What a person in `standing` may do to someone who is `target` now: the new roles they may give them, and whether
 * they may remove or hand ownership to them. `self` is the viewer, who is only ever left alone.
 */
export function actionsOn(
  standing: Standing,
  target: { role: "owner" | Assignable; self?: boolean },
): { roles: readonly Assignable[]; remove: boolean; makeOwner: boolean } {
  if (target.self || target.role === "owner") return { roles: [], remove: false, makeOwner: false };
  const mine = peopleRoles(standing, "setRole");
  const onThem = mine.includes(target.role);
  return {
    /* Only the roles they may hand out and that differ from the one they hold. An admin has nothing to offer a
       recruiter (only the owner makes an admin), so the control is not drawn. */
    roles: onThem && standing === "owner" ? (["admin", "recruiter"] as const).filter((r) => r !== target.role) : [],
    remove: peopleRoles(standing, "remove").includes(target.role),
    makeOwner: can(standing, "org.transferOwnership"),
  };
}

/** The one calm line a disabled control gives instead of just being dead. */
export const ASK_AN_ADMIN = "Ask an admin to do this.";

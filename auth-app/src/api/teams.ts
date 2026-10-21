import { api } from "./client";
import type { Invite, JoinRequest, Member, OrgRole } from "./identity";

/** Shapes from the API's teams module (server/src/modules/teams). */

export type TeamPerson = { userId: string; name: string | null; role: "lead" | "member" };
export type TeamCampaign = { id: string; name: string; status: string };

export type Team = {
  id: string;
  name: string;
  createdAt: string;
  leads: TeamPerson[];
  /** Everyone on the team, leads first. */
  members: TeamPerson[];
  memberCount: number;
  campaigns: TeamCampaign[];
  campaignCount: number;
  /** Whether the viewer may change this team's people and campaigns: the owner always, an admin their own. */
  canManage: boolean;
};

/** Someone in the organisation, with the teams they are on. A member as Members listed them, plus `teams`. */
export type Person = Member & { teams: Array<{ id: string; name: string; lead: boolean }> };

export type People = { people: Person[]; requests: JoinRequest[]; invites: Invite[] };

/** What taking a person out did: out of the organisation (the owner), or off the teams an admin leads. */
export type Removed =
  | { scope: "organisation"; removed: string; reassignedTo: string; recordsMoved: number }
  | { scope: "team"; teams: Array<{ id: string; name: string }> };

export const teamsApi = {
  list: () => api<{ teams: Team[] }>("GET", "/v1/teams"),
  people: () => api<People>("GET", "/v1/teams/people"),
  create: (name: string, leadUserIds: string[] = []) => api<Team>("POST", "/v1/teams", { name, leadUserIds }),
  rename: (id: string, name: string) => api<Team>("PATCH", `/v1/teams/${id}`, { name }),
  remove: (id: string) => api<void>("DELETE", `/v1/teams/${id}`),
  members: (id: string, change: { add?: string[]; remove?: string[]; lead?: string[] }) =>
    api<Team>("PUT", `/v1/teams/${id}/members`, change),
  campaigns: (id: string, change: { add?: string[]; remove?: string[] }) =>
    api<Team>("PUT", `/v1/teams/${id}/campaigns`, change),
  removePerson: (userId: string, reassignTo?: string) =>
    api<Removed>("POST", `/v1/members/${userId}/remove`, reassignTo ? { reassignTo } : {}),
};

export type { OrgRole };

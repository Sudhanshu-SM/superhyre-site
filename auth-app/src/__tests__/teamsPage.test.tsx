import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Person, Team } from "../api/teams";
import type { Me, OrgRole } from "../api/identity";
import type { LiveAccount } from "../Console";
import { mayChangeCampaign, mayCloseCampaign } from "../campaignRights";
import type { Session } from "../roleStore";
import { actionsOn, peopleRoles } from "../can";

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async () => new Promise(() => {}),
    onWrite: () => () => {},
    setTabWorkspace: () => {},
  };
});
vi.mock("../problems", () => ({ reportProblem: () => {} }));

const T = await import("../Teams");
const { removeForGoodLine, takeOffLine } = await import("../TeamsPeople");

const account = (role: OrgRole | null): LiveAccount => ({
  me: {
    user: { id: "u1", email: "a@x.in", fullName: "A", avatarUrl: null, timeZone: "Asia/Kolkata", emailSignature: null },
    scope: { userId: "u1", kind: role ? "org" : "personal", organizationId: role ? "o1" : null, schema: "x", role },
    workspaces: role
      ? [{ kind: "org", organizationId: "o1", name: "Northwind", logoUrl: null, role, active: true }]
      : [{ kind: "personal", organizationId: null, name: "Personal", logoUrl: null, role: null, active: true }],
    onboarding: {} as Me["onboarding"],
  },
  reload: async () => {},
  switchWorkspace: async () => {},
});

const team = (over: Partial<Team> = {}): Team => ({
  id: "t1", name: "Tech hiring", createdAt: "2026-10-01T00:00:00Z",
  leads: [{ userId: "u-ada", name: "Ada Admin", role: "lead" }],
  members: [{ userId: "u-ada", name: "Ada Admin", role: "lead" }, { userId: "u-ravi", name: "Ravi K", role: "member" }],
  memberCount: 2, campaigns: [{ id: "c1", name: "Backend", status: "active" }], campaignCount: 1, canManage: true, ...over,
});
const person = (userId: string, fullName: string, role: OrgRole, status = "active"): Person => ({
  userId, fullName, email: `${userId}@x.in`, role, status, joinedAt: "2026-09-01T00:00:00Z", campaigns: 0, teams: [],
});

describe("the Teams page by role", () => {
  it("says a recruiter's link isn't a page they have, calmly, with the way back", () => {
    const html = renderToStaticMarkup(<T.TeamsPage account={account("recruiter")} />);
    expect(html).toContain("That page isn&#x27;t here");
    expect(html).toContain('href="#/"');
    expect(html).not.toContain("New team");
  });

  it("says the same in Personal, which has no teams", () => {
    expect(renderToStaticMarkup(<T.TeamsPage account={account(null)} />)).toContain("That page isn&#x27;t here");
  });

  it("holds its place with ghosts shaped like the page while the teams load, for an owner and an admin", () => {
    for (const role of ["owner", "admin"] as const) {
      const html = renderToStaticMarkup(<T.TeamsPage account={account(role)} />);
      expect(html, role).toContain("Loading the teams");
      expect(html, role).toContain('aria-busy="true"');
      expect(html, role).toContain("<h1");
      expect(html, role).not.toContain("That page isn&#x27;t here");
    }
  });
});

describe("the words and lists", () => {
  it("never makes an empty page sad", () => {
    expect(T.TEAMS_EMPTY).toBe("Create your first team to group recruiters and their campaigns");
    expect(T.TEAMS_EMPTY_ADMIN).not.toMatch(/no teams|nothing|empty|sorry/i);
    expect(T.NO_TEAM_PICKED).toMatch(/^Pick a team/);
  });

  it("describes a team in one line, with its lead", () => {
    expect(T.teamLine(team())).toBe("Led by Ada Admin. 2 people, 1 campaign.");
    expect(T.teamLine(team({ leads: [], memberCount: 0, campaignCount: 3 }))).toBe("No lead yet. 0 people, 3 campaigns.");
  });

  it("finds a team by its name or its lead", () => {
    const teams = [team(), team({ id: "t2", name: "Sales hiring", leads: [{ userId: "u-bo", name: "Bo Boss", role: "lead" }] })];
    expect(T.matchTeams(teams, "sales").map((t) => t.id)).toEqual(["t2"]);
    expect(T.matchTeams(teams, "ADA").map((t) => t.id)).toEqual(["t1"]);
    expect(T.matchTeams(teams, "  ").length).toBe(2);
  });

  it("offers to add active people who are not on the team yet, by name", () => {
    const people = [person("u-ada", "Ada Admin", "admin"), person("u-meera", "Meera S", "recruiter"), person("u-gone", "Gone G", "recruiter", "disabled"), person("u-zed", "Zed Z", "recruiter")];
    expect(T.personOptions(people, team(), "").map((o) => o.name)).toEqual(["Meera S", "Zed Z"]);
    expect(T.personOptions(people, team(), "mee").map((o) => [o.name, o.hint])).toEqual([["Meera S", "Recruiter"]]);
  });

  it("offers only the campaigns the viewer may change, not already on the team", () => {
    const rows = [
      { id: "c1", name: "Backend", teamId: "t1", status: "active", canManage: true },
      { id: "c2", name: "Frontend", teamId: null, status: "active", canManage: true },
      { id: "c3", name: "Sales AE", teamId: "t9", teamName: "Sales hiring", status: "active", canManage: true },
      { id: "c4", name: "Not mine", teamId: "t9", teamName: "Sales hiring", status: "active", canManage: false },
    ];
    expect(T.campaignOptions(rows, team(), "").map((o) => [o.name, o.hint])).toEqual([["Frontend", "No team"], ["Sales AE", "On Sales hiring"]]);
  });
});

describe("what the pickers and the name check say", () => {
  it("says about campaigns what it says about campaigns, not about people", () => {
    expect(T.NOTHING_TO_ADD.campaigns).toMatch(/campaign/);
    expect(T.NOTHING_TO_ADD.campaigns).not.toMatch(/everyone/i);
    expect(T.NOTHING_TO_ADD.people).toMatch(/Everyone/);
  });

  it("finds a taken team name whatever its case, and repeats the name as it was typed", () => {
    const teams = [{ name: "Sourcing" }, { name: "Tech hiring" }];
    expect(T.hasTeamNamed(teams, "sourcing")).toBe(true);
    expect(T.hasTeamNamed(teams, "  TECH hiring ")).toBe(true);
    expect(T.hasTeamNamed(teams, "Design")).toBe(false);
    expect(T.nameTaken(" sourcing ")).toBe("There's already a team called sourcing. Pick another name.");
  });
});

describe("removing a person says what it means", () => {
  it("tells the owner it is for good, and what is left alone", () => {
    const line = removeForGoodLine("Ravi K", "Northwind");
    expect(line).toMatch(/removed from Northwind for good/);
    expect(line).toMatch(/Their Personal/);
    expect(line).toMatch(/any other organisation/);
  });

  it("tells an admin it is only the team", () => {
    expect(takeOffLine("Northwind")).toMatch(/stay in Northwind/);
  });

  it("gives only the owner a Remove from the organisation, and never for the owner or themselves", () => {
    expect(peopleRoles("owner", "remove")).toEqual(["admin", "recruiter"]);
    expect(peopleRoles("admin", "remove")).toEqual([]);
    expect(actionsOn("owner", { role: "admin" }).remove).toBe(true);
    expect(actionsOn("admin", { role: "recruiter" }).remove).toBe(false);
    expect(actionsOn("owner", { role: "owner" }).remove).toBe(false);
    expect(actionsOn("owner", { role: "recruiter", self: true }).remove).toBe(false);
  });
});

describe("whether a campaign can be closed or reopened", () => {
  const admin: Session = { role: "admin", standing: "admin", name: "Ada", userId: "u-ada" };
  const owner: Session = { role: "admin", standing: "owner", name: "Asha", userId: "u-asha" };
  const row = { id: "c", owner: "Ana", ownerId: "u-ana", team: ["Ana"] };
  it("is not offered to an admin whose team does not have the campaign", () => {
    expect(mayCloseCampaign(admin, { ...row, canManage: false })).toBe(false);
    expect(mayCloseCampaign(admin, { ...row, canManage: true })).toBe(true);
    expect(mayCloseCampaign(owner, { ...row, canManage: true })).toBe(true);
  });
});

describe("whether a campaign can be changed", () => {
  const admin: Session = { role: "admin", standing: "admin", name: "Ada", userId: "u-ada" };
  const row = { id: "c", owner: "Ana", team: ["Ana"] };
  it("goes by the server's answer when it gave one, an admin otherwise", () => {
    expect(mayChangeCampaign(admin, { ...row, canManage: false })).toBe(false);
    expect(mayChangeCampaign(admin, { ...row, canManage: true })).toBe(true);
    expect(mayChangeCampaign(admin, row)).toBe(true);
    expect(mayChangeCampaign({ ...admin, role: "recruiter", standing: "recruiter" }, { ...row, ownerId: "u-ana", teamIds: ["u-ana"] })).toBe(false);
  });
});

describe("the empty Teams page", () => {
  it("keeps its picture on the same left edge as its words", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../teams.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.tm-empty \.ea \{ margin-inline: 0; \}/);
  });
});

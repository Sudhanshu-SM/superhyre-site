import { describe, expect, it, vi } from "vitest";
import type { ApiMember } from "../api/campaigns";
import type { GoogleConnection, OrgConnection } from "../api/identity";
import type { CampaignRow } from "../campaignsData";
import type { ConnectionsState } from "../connectionsStore";
import { ROUTES, settingsSectionFromHash } from "../nav";
import {
  campaignRows, channelsRow, collaboratorsOf, CONNECTIONS_HREF, fixPhrase, integrationsOf, intakeRow, namesLine, workspaceRows,
} from "../railConfig";
import type { ConfigRow, IntakeState } from "../railConfig";
import type { Role } from "../roleStore";

/**
 * The Agent page's Configuration panel when it is drawn from the workspace's own data.
 * These pin the panel's wording and its one rule: a set field is text, an unset one is the
 * action that sets it and goes somewhere real, and where nothing can set it the row is left out.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const ASHA = "22222222-2222-4222-8222-222222222222";
const RAVI = "33333333-3333-4333-8333-333333333333";
const PRIYA = "44444444-4444-4444-8444-444444444444";

const google = (over: Partial<GoogleConnection> = {}): GoogleConnection => ({
  available: true, status: "connected", accountEmail: "me@acme.dev", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-01T00:00:00Z", ...over,
});
const org = (provider: "slack" | "notion", over: Partial<OrgConnection> = {}): OrgConnection => ({
  provider, status: "connected", accountName: "bot", workspaceName: "Acme", connectedBy: { id: ASHA, name: "Asha" },
  connectedAt: "2026-10-09T00:00:00Z", lastUsedAt: null, lastError: null, scopes: [], settings: {}, ...over,
});
const conns = (over: Partial<ConnectionsState> = {}): ConnectionsState => ({
  status: "ready", google: google(), slack: org("slack"), notion: org("notion"), oauth: { slack: false, notion: false }, error: null, at: 0, ...over,
});
const disconnected = google({ status: "disconnected", accountEmail: null, products: [], connectedAt: null });

const row = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: "c1", name: "Senior Android", department: "Engineering", location: "", status: "active", owner: "Asha Rao", team: ["Asha Rao"],
  ownerId: ASHA, teamIds: [ASHA], visibility: "team",
  funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: [], target: 1, agents: [],
  updatedAgo: "", createdAgo: "", ...over,
});

const admin: { role: Role; userId: string } = { role: "admin", userId: ME };
const recruiter: { role: Role; userId: string } = { role: "recruiter", userId: ME };
const noop = () => {};
const find = (rows: readonly ConfigRow[], label: string) => rows.find((r) => r.label === label);

/** Every place an action may point: a real page, or a settings section the page opens. */
function reachable(href: string): boolean {
  const pages = new Set(Object.values(ROUTES).map((r) => `#${r.path}`));
  const path = href.split("?")[0] ?? href;
  return pages.has(path) || settingsSectionFromHash(href) !== null;
}

describe("the channels row", () => {
  it("draws only the connected services as marks, and counts what is missing", () => {
    const r = channelsRow(conns({ slack: null }), admin, noop);
    expect(r.marks?.map((m) => m.id)).toEqual(["google", "notion"]);
    expect(r.marks?.every((m) => m.connected)).toBe(true);
    expect(r.value).toBe("2 of 3");
    expect(r.notes).toEqual([{ text: "Connect Slack", href: CONNECTIONS_HREF }]);
  });

  it("with nothing connected has no marks, says so, and names all that can be connected", () => {
    const r = channelsRow(conns({ google: disconnected, slack: null, notion: null }), admin, noop);
    expect(r.marks).toBeUndefined();
    expect(r.value).toBe("None connected");
    expect(r.notes).toEqual([{ text: "Connect Google, Slack and Notion", href: CONNECTIONS_HREF }]);
  });

  it("tells someone who can't connect Slack or Notion to ask an admin, but still offers their own Google", () => {
    const r = channelsRow(conns({ google: disconnected, slack: null, notion: org("notion") }), recruiter, noop);
    expect(r.notes).toEqual([
      { text: "Connect Google", href: CONNECTIONS_HREF },
      { text: "Ask an admin to connect Slack" },
    ]);
    const onlyOrg = channelsRow(conns({ slack: null, notion: null }), recruiter, noop);
    expect(onlyOrg.notes).toEqual([{ text: "Ask an admin to connect Slack and Notion" }]);
    expect(onlyOrg.notes?.every((n) => n.href === undefined)).toBe(true);
  });

  it("asks to reconnect, not connect, what has signed out", () => {
    const r = channelsRow(conns({ slack: org("slack", { status: "expired" }), notion: null }), admin, noop);
    expect(r.marks?.map((m) => m.id)).toEqual(["google"]);
    expect(r.notes?.[0]?.text).toBe("Reconnect Slack, connect Notion");
    const asked = channelsRow(conns({ slack: org("slack", { status: "error" }) }), recruiter, noop);
    expect(asked.notes?.[0]?.text).toBe("Ask an admin to reconnect Slack");
  });

  it("counts Google as working only with Gmail, since sending is what it is for", () => {
    const sheetsOnly = channelsRow(conns({ google: google({ products: ["sheets"] }) }), admin, noop);
    expect(sheetsOnly.marks?.map((m) => m.id)).toEqual(["slack", "notion"]);
    expect(sheetsOnly.notes?.[0]?.text).toBe("Reconnect Google");
    expect(channelsRow(conns({ google: google({ status: "expired" }) }), admin, noop).notes?.[0]?.text).toBe("Reconnect Google");
  });

  it("leaves Google out where the server can't offer it", () => {
    const r = channelsRow(conns({ google: google({ available: false, status: "disconnected" }) }), admin, noop);
    expect(r.value).toBe("2 of 2");
  });

  it("always has a second line, so the row is one height whether loading, failed or whole", () => {
    expect(channelsRow(conns(), admin, noop).notes).toEqual([{ text: "Manage connections", href: CONNECTIONS_HREF }]);
    expect(channelsRow(conns(), recruiter, noop).notes).toEqual([{ text: "See connections", href: CONNECTIONS_HREF }]);
    const loading = channelsRow(conns({ status: "loading" }), admin, noop);
    expect(loading).toMatchObject({ pending: true, reserve: 1 });
    const retry = vi.fn();
    const failed = channelsRow(conns({ status: "failed" }), admin, retry);
    expect(failed.value).toBe("Couldn't load");
    failed.retry?.();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("reads a server that only knows Google as Slack and Notion not connected", () => {
    const old = integrationsOf({ google: google(), slack: null, notion: null });
    expect(old.map((i) => [i.id, i.state])).toEqual([["google", "connected"], ["slack", "missing"], ["notion", "missing"]]);
  });

  it("puts where Slack posts into its mark's tooltip", () => {
    const [, slack] = integrationsOf({ google: google(), slack: org("slack", { settings: { defaultChannel: { id: "C1", name: "hiring" } } }), notion: null });
    expect(slack?.detail).toBe("Acme · posts to #hiring");
  });

  it("phrases a fix for one, two or three services", () => {
    const all = integrationsOf({ google: disconnected, slack: null, notion: null });
    expect(fixPhrase(all.slice(0, 1))).toBe("Connect Google");
    expect(fixPhrase(all.slice(1))).toBe("Connect Slack and Notion");
    expect(fixPhrase(all)).toBe("Connect Google, Slack and Notion");
    expect(fixPhrase(all.slice(1), false)).toBe("connect Slack and Notion");
  });
});

describe("a campaign's panel", () => {
  const live: IntakeState = { status: "ready", forms: [{ name: "Android screening", status: "live" }] };
  const rows = (r: CampaignRow, v = admin, intake: IntakeState = live, c = conns()) =>
    campaignRows(r, { ...v, connections: c, onRetryConnections: noop, intake });

  it("leaves out who else is on it and who can see it in Personal, which is one person's alone", () => {
    const personal = campaignRows(row({ visibility: "team", ownerId: ME, owner: "Me" }), {
      ...admin, connections: conns(), onRetryConnections: noop, intake: live, inOrg: false,
    });
    expect(find(personal, "Collaborators")).toBeUndefined();
    expect(find(personal, "Visibility")).toBeUndefined();
    expect(find(personal, "Owner")?.value).toBe("You");
    expect(find(personal, "Intake")).toBeDefined();
    // An organisation keeps them.
    const org = campaignRows(row(), { ...admin, connections: conns(), onRetryConnections: noop, intake: live, inOrg: true });
    expect(find(org, "Collaborators")).toBeDefined();
    expect(find(org, "Visibility")?.value).toBe("Its team and admins");
  });

  it("names the owner, or says You when it is the person looking", () => {
    expect(find(rows(row()), "Owner")?.value).toBe("Asha Rao");
    expect(find(rows(row({ ownerId: ME, owner: "Me Myself" })), "Owner")?.value).toBe("You");
  });

  it("offers an admin the action to set a missing owner, and tells a recruiter plainly", () => {
    const orphan = row({ owner: "Unassigned", ownerId: null });
    expect(find(rows(orphan), "Owner")?.action).toMatchObject({ label: "Set an owner" });
    expect(find(rows(orphan, recruiter), "Owner")).toMatchObject({ value: "Nobody yet" });
    expect(find(rows(orphan, recruiter), "Owner")?.action).toBeUndefined();
  });

  it("lists collaborators with the viewer first and no more than two names", () => {
    const team = row({ team: ["Asha Rao", "Ravi K", "Priya N", "Me Myself"], teamIds: [ASHA, RAVI, PRIYA, ME] });
    expect(find(rows(team), "Collaborators")?.value).toBe("You, Ravi K +1");
    expect(find(rows(row({ team: ["Asha Rao", "Ravi K"], teamIds: [ASHA, RAVI] })), "Collaborators")?.value).toBe("Ravi K");
  });

  it("lines names up with ids when the owner was put at the front of a team that left them out", () => {
    // The server's team list omitted the owner; the console prepended the name, not the id.
    const r = row({ team: ["Asha Rao", "Ravi K"], teamIds: [RAVI] });
    expect(collaboratorsOf(r, admin)).toEqual([{ name: "Ravi K", you: false }]);
  });

  it("with no collaborators offers an admin to add some, and tells a recruiter it is just the owner", () => {
    expect(find(rows(row()), "Collaborators")?.action).toMatchObject({ label: "Add collaborators" });
    expect(find(rows(row(), recruiter), "Collaborators")).toMatchObject({ value: "Just the owner" });
  });

  it("states who can see it", () => {
    expect(find(rows(row()), "Visibility")?.value).toBe("Its team and admins");
    expect(find(rows(row({ visibility: "org" })), "Visibility")?.value).toBe("Everyone in the org");
  });

  it("leaves the department out when none was set: nothing can set it afterwards", () => {
    expect(find(rows(row()), "Department")?.value).toBe("Engineering");
    expect(find(rows(row({ department: "" })), "Department")).toBeUndefined();
  });

  it("has no ATS row: there is no ATS to link", () => {
    expect(find(rows(row()), "ATS job")).toBeUndefined();
  });

  it("includes the channels row, from the same connections", () => {
    expect(find(rows(row(), admin, live, conns({ slack: null })), "Channels")?.value).toBe("2 of 3");
  });

  it("reads intake from the campaign's forms", () => {
    const href = "#/campaign/forms?campaign=c1";
    expect(intakeRow({ status: "ready", forms: [{ name: "Android screening", status: "live" }] }, href)).toEqual({ label: "Intake", value: "Android screening" });
    expect(intakeRow({ status: "ready", forms: [{ name: "A", status: "live" }, { name: "B", status: "live" }] }, href).value).toBe("A +1");
    expect(intakeRow({ status: "ready", forms: [{ name: "Draft", status: "draft" }] }, href).action).toEqual({ label: "Publish the form", href });
    expect(intakeRow({ status: "ready", forms: [] }, href).action).toEqual({ label: "Create an intake form", href });
    expect(intakeRow({ status: "loading" }, href).pending).toBe(true);
    expect(intakeRow({ status: "failed" }, href).value).toBe("Couldn't load");
  });

  it("gives every row a value, an action or a placeholder, and points every action somewhere real", () => {
    const every = [
      rows(row()), rows(row({ owner: "Unassigned", ownerId: null, department: "" }), admin, { status: "ready", forms: [] }, conns({ slack: null, google: disconnected })),
    ].flat();
    for (const r of every) {
      expect(r.value !== undefined || r.action !== undefined || r.pending === true, r.label).toBe(true);
      if (r.action) expect(reachable(r.action.href), `${r.label} -> ${r.action.href}`).toBe(true);
      for (const n of r.notes ?? []) if (n.href) expect(reachable(n.href), n.text).toBe(true);
    }
    const labels = every.slice(0, rows(row()).length).map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("the workspace's panel, when no campaign was chosen", () => {
  const member = (userId: string, fullName: string | null, role: string, status = "active"): ApiMember => ({ userId, email: `${userId.slice(0, 2)}@acme.dev`, fullName, role, status });
  const ready = (members: ApiMember[]) => ({ status: "ready" as const, members });
  const input = (over: Partial<Parameters<typeof workspaceRows>[0]> = {}): Parameters<typeof workspaceRows>[0] => ({
    ...admin, connections: conns(), onRetryConnections: noop, campaignsReady: true,
    campaigns: [row({ team: ["Asha Rao", "Ravi K"], teamIds: [ASHA, RAVI] }), row({ id: "c2", status: "closed" })],
    people: ready([member(ASHA, "Asha Rao", "owner"), member(RAVI, "Ravi K", "recruiter")]), inOrg: true, ...over,
  });

  it("shows the owner, the team, how many campaigns are running and the channels", () => {
    const rows = workspaceRows(input());
    expect(rows.map((r) => r.label)).toEqual(["Owner", "Team", "Campaigns", "Channels"]);
    expect(find(rows, "Owner")?.value).toBe("Asha Rao");
    expect(find(rows, "Team")?.value).toBe("Ravi K");
    expect(find(rows, "Campaigns")?.value).toBe("1 active");
  });

  it("says You when the person looking owns it, and puts them first in the team", () => {
    const rows = workspaceRows(input({
      campaigns: [row({ owner: "Me Myself", ownerId: ME, team: ["Me Myself", "Asha Rao", "Ravi K"], teamIds: [ME, ASHA, RAVI] })],
      people: ready([member(ME, "Me Myself", "owner"), member(ASHA, "Asha Rao", "admin"), member(RAVI, "Ravi K", "recruiter")]),
    }));
    expect(find(rows, "Owner")?.value).toBe("You");
    expect(find(rows, "Team")?.value).toBe("Asha Rao, Ravi K");
  });

  it("offers an admin to invite people to an empty team when there is a campaign, and to create a first campaign when there is none", () => {
    const rows = workspaceRows(input({ campaigns: [row({ owner: "Me", ownerId: ME, team: ["Me"], teamIds: [ME] })], people: ready([member(ME, "Me", "owner")]) }));
    expect(find(rows, "Team")?.action).toEqual({ label: "Invite people", href: "#/teams" });
    const first = workspaceRows(input({ campaigns: [], people: ready([member(ME, "Me", "owner")]) }));
    expect(find(first, "Campaigns")?.action).toMatchObject({ label: "Create a campaign" });
    for (const r of [...rows, ...first]) if (r.action) expect(reachable(r.action.href), r.label).toBe(true);
  });

  it("says nothing of an owner or a team before there is a campaign: a calm panel that points at the first one", () => {
    for (const who of [{}, recruiter]) {
      const rows = workspaceRows(input({ ...who, campaigns: [], people: ready([member(ASHA, "Asha Rao", "owner"), member(RAVI, "Ravi K", "recruiter")]) }));
      expect(rows.map((r) => r.label)).toEqual(["Campaigns", "Channels"]);
      expect(find(rows, "Owner")).toBeUndefined();
      expect(find(rows, "Team")).toBeUndefined();
    }
  });

  it("gives a recruiter plain words where an admin would have an action, and a way to start a campaign of their own", () => {
    const rows = workspaceRows(input({ ...recruiter, campaigns: [row()], people: ready([member(ASHA, "Asha Rao", "owner")]) }));
    expect(find(rows, "Team")).toMatchObject({ value: "Just the owner" });
    // Anyone who works here opens campaigns, so the first one is theirs to start; the team is an admin's to invite.
    const first = workspaceRows(input({ ...recruiter, campaigns: [], people: ready([member(ASHA, "Asha Rao", "owner")]) }));
    expect(find(first, "Campaigns")?.action).toMatchObject({ label: "Create a campaign" });
    expect(rows.filter((r) => r.label !== "Campaigns").every((r) => r.action === undefined)).toBe(true);
  });

  it("holds the shape while campaigns and people load", () => {
    const rows = workspaceRows(input({ campaignsReady: false, campaigns: [], people: { status: "loading" } }));
    expect(rows.map((r) => [r.label, r.pending === true])).toEqual([["Owner", true], ["Team", true], ["Campaigns", true], ["Channels", false]]);
  });

  it("has no team in a personal workspace, and says nothing when the member list is empty", () => {
    expect(workspaceRows(input({ inOrg: false })).map((r) => r.label)).toEqual(["Owner", "Campaigns", "Channels"]);
    const none = workspaceRows(input({ people: ready([]) }));
    expect(none.map((r) => r.label)).toEqual(["Campaigns", "Channels"]);
  });

  it("lists only the people on the campaigns the viewer can see, not everyone in the organisation", () => {
    const rows = workspaceRows(input({
      ...recruiter,
      campaigns: [row({ owner: "Asha Rao", ownerId: ASHA, team: ["Asha Rao", "Ravi K"], teamIds: [ASHA, RAVI] })],
      people: ready([member(ASHA, "Asha Rao", "owner"), member(RAVI, "Ravi K", "recruiter"), member(PRIYA, "Priya N", "recruiter"), member("55555555-5555-4555-8555-555555555555", "Nisha D", "recruiter")]),
    }));
    expect(find(rows, "Team")?.value).toBe("Ravi K");
  });

  it("ignores people who were removed", () => {
    const rows = workspaceRows(input({ campaigns: [row()], people: ready([member(ASHA, "Asha Rao", "owner"), member(RAVI, "Ravi K", "recruiter", "disabled")]) }));
    expect(find(rows, "Team")).toMatchObject({ action: { label: "Invite people" } });
  });
});

describe("names", () => {
  it("puts you first and counts the rest", () => {
    expect(namesLine([{ name: "A", you: false }, { name: "B", you: true }, { name: "C", you: false }])).toBe("You, A +1");
    expect(namesLine([{ name: "A", you: false }])).toBe("A");
  });
});

describe("an intake read that did not come back", () => {
  it("is asked for again a little later each time, a few times, before it is left to Try again", async () => {
    const { INTAKE_RETRIES, intakeRetryDelay } = await import("../useRailConfig");
    expect(INTAKE_RETRIES).toBeGreaterThanOrEqual(3);
    const waits = Array.from({ length: INTAKE_RETRIES }, (_, i) => intakeRetryDelay(i));
    expect(waits[0]).toBeLessThanOrEqual(5000);
    expect(waits).toEqual([...waits].sort((a, b) => a - b));
    expect(new Set(waits).size).toBe(waits.length);
  });
});

describe("the campaign the chat moves to", () => {
  it("is found by its id: two campaigns with one title are two campaigns, each with its own people", async () => {
    const { campaignInFocus, campaignRows } = await import("../railConfig");
    const rows = [
      { id: "c1", name: "DevOps Engineer", department: "Engineering", location: "Pune", team: ["Priya", "Meera Iyer"], teamIds: ["u1", "u2"], ownerId: "u1", owner: "Priya" },
      { id: "c2", name: "DevOps Engineer", department: "Engineering", location: "Pune", team: ["Priya"], teamIds: ["u1"], ownerId: "u1", owner: "Priya" },
    ];
    expect(campaignInFocus("c2", "DevOps Engineer", rows)).toEqual({ id: "c2", name: "DevOps Engineer", role: "Engineering · Pune" });
    // Not yet in the list: named by the chat's own words, and found by id once it is.
    expect(campaignInFocus("c3", "Platform Engineer", rows)).toEqual({ id: "c3", name: "Platform Engineer", role: "" });
    const people = (id: string) => {
      const row = rows.find((r) => r.id === id) as never;
      const found = campaignRows(row, {
        userId: "u9", role: "admin", name: "Ada", connections: { status: "ready", google: null, slack: null, notion: null } as never,
        onRetryConnections: () => {}, intake: { status: "ready", forms: [] }, inOrg: true,
      } as never);
      return found.find((r) => r.label === "Collaborators");
    };
    expect(people("c1")).toMatchObject({ value: expect.stringContaining("Meera Iyer") });
    expect(people("c2")).not.toMatchObject({ value: expect.stringContaining("Meera Iyer") });
  });
});

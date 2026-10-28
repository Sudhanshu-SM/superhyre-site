import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, canSetStatus, standingOf } from "../can";
import type { Capability, Standing } from "../can";

/**
 * Who may do what: one row per line of docs/workspaces-and-orgs.md section 2, for each way of standing in a
 * workspace. A personal workspace is its owner's alone: everything is theirs, and nothing about a team applies.
 */

const STANDINGS: readonly Standing[] = ["personal", "owner", "admin", "recruiter"];

/** [capability, personal, owner, admin, recruiter] */
const MATRIX: ReadonlyArray<readonly [Capability, boolean, boolean, boolean, boolean]> = [
  // See every campaign, candidate and client
  ["campaign.seeAll", true, true, true, false],
  // Create and edit clients (a recruiter reads the ones their campaigns are for)
  ["client.manage", true, true, true, false],
  ["client.details", true, true, true, false],
  ["client.view", true, true, true, true],
  // Everyone's calls on one page: the owner, admins and a personal workspace's person; a recruiter has each campaign's own
  ["calls.all", true, true, true, false],
  // Assign tasks and campaigns to others (to themselves only, for a recruiter; nobody to assign to in Personal)
  // Everyone else's chats with the agent, read only: the organisation's owner and admins (nobody else in a team; nobody to read in Personal)
  ["chat.seeAll", false, true, true, false],
  ["task.assignOthers", false, true, true, false],
  ["campaign.assign", false, true, true, false],
  // Invite people, answer requests, change a role; removing a member from the organisation is the owner's alone
  ["member.invite", false, true, true, false],
  ["member.decideRequests", false, true, true, false],
  ["member.setRole", false, true, true, false],
  ["member.remove", false, true, false, false],
  // The Teams page is for the owner and admins; making and deleting a team is the owner's
  ["teams.manage", false, true, true, false],
  ["teams.create", false, true, false, false],
  // Organisation name, logo, join policy
  ["org.settings", false, true, true, false],
  // Transfer ownership: the owner alone
  ["org.transferOwnership", false, true, false, false],
  // Leave the organisation: the owner has to hand it on first
  ["org.leave", false, false, true, true],
  // Anyone who works here opens a campaign; a recruiter's is theirs alone (owner, alone on it)
  ["campaign.create", true, true, true, true],
  // What the server's isAdmin lets through
  ["campaign.manage", true, true, true, false],
  ["contact.delete", true, true, true, false],
  // Who added a candidate, and the filter by who: an organisation's owner and admins (a personal workspace has one person)
  ["candidate.seeAddedBy", false, true, true, false],
  // Taking someone off the do-not-contact list: the server's requireAdmin
  ["contact.allowAgain", true, true, true, false],
  ["connections.manage", true, true, true, false],
  // Day-to-day work is for everyone
  ["campaign.work", true, true, true, true],
  ["contact.add", true, true, true, true],
];

describe("can(standing, capability)", () => {
  it.each(MATRIX)("%s", (capability, personal, owner, admin, recruiter) => {
    expect({
      personal: can("personal", capability),
      owner: can("owner", capability),
      admin: can("admin", capability),
      recruiter: can("recruiter", capability),
    }).toEqual({ personal, owner, admin, recruiter });
  });

  it("is written down for every capability, and the table above names each one", () => {
    expect(MATRIX.map((r) => r[0]).sort()).toEqual((Object.keys(CAPABILITIES) as Capability[]).filter((c) => c !== "campaign.close" && c !== "campaign.complete").sort());
    for (const c of Object.keys(CAPABILITIES) as Capability[]) {
      for (const s of CAPABILITIES[c]) expect(STANDINGS, `${c} names ${s}`).toContain(s);
    }
  });

  it("treats the demo's plain admin and recruiter as standings of their own", () => {
    expect(can("admin", "client.manage")).toBe(true);
    expect(can("recruiter", "client.manage")).toBe(false);
  });
});

describe("a session's standing", () => {
  it("is the exact one when known, and the two-way role when not", () => {
    expect(standingOf({ role: "admin", standing: "owner" })).toBe("owner");
    expect(standingOf({ role: "admin" })).toBe("admin");
    expect(standingOf({ role: "recruiter" })).toBe("recruiter");
  });
});

describe("closing or reopening one campaign", () => {
  it("is for a manager, or for the person who owns that campaign", () => {
    expect(canSetStatus({ role: "admin", standing: "admin", userId: "u1" }, { ownerId: "u2" })).toBe(true);
    expect(canSetStatus({ role: "recruiter", standing: "recruiter", userId: "u1" }, { ownerId: "u1" })).toBe(true);
    expect(canSetStatus({ role: "recruiter", standing: "recruiter", userId: "u1" }, { ownerId: "u2" })).toBe(false);
    expect(canSetStatus({ role: "recruiter", standing: "recruiter" }, { ownerId: null })).toBe(false);
  });
});

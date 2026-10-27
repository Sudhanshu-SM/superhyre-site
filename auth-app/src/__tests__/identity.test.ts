import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import {
  approveRequest, changeRole, declineRequest, dropInvite, dropMember, gmailStateOf, googleReturnFrom,
  handOwnership, inviteTokenFrom, inviteView, maskEmail, missingProductsText, pendingOrgName,
  readable, toBootstrap,
} from "../api/identity";
import type { GoogleConnection, Me, Members } from "../api/identity";
import { routeFromHash, settingsSectionFromHash } from "../nav";
import { sessionForScope } from "../roleStore";

/** The identity adapters: /v1/me into what the console reads, the onboarding
 *  step, the OAuth return, readable errors and the members list changes. */

const ORG = "b5539815-ecb0-43d7-9eb4-c1aa59eb1928";

function me(over: Partial<Me> = {}, onboarding: Partial<Me["onboarding"]> = {}): Me {
  return {
    user: { id: "u1", email: "asha@quillhire.dev", fullName: "Asha Menon", avatarUrl: null, timeZone: "Asia/Kolkata", emailSignature: null },
    scope: { userId: "u1", kind: "personal", organizationId: null, schema: "personal", role: null },
    workspaces: [{ kind: "personal", organizationId: null, name: "Personal", logoUrl: null, role: null, active: true }],
    onboarding: {
      email: "asha@quillhire.dev", domain: "quillhire.dev", personalEmail: false, canCreateOrganisation: true,
      organisation: null, membership: "none", memberOf: null, staysPersonal: false, ...onboarding,
    },
    ...over,
  };
}

const inOrg = me({
  scope: { userId: "u1", kind: "org", organizationId: ORG, schema: "tenant_quillhire", role: "owner" },
  workspaces: [
    { kind: "personal", organizationId: null, name: "Personal", logoUrl: null, role: null, active: false },
    { kind: "org", organizationId: ORG, name: "Quill Hire", logoUrl: null, role: "owner", active: true },
  ],
}, { canCreateOrganisation: false, membership: "member" });

const quill = { id: ORG, name: "Quill Hire", logoUrl: null, members: 3, ownerName: "Asha Menon" };

describe("toBootstrap", () => {
  it("reads a personal workspace as solo", () => {
    const b = toBootstrap(me());
    expect(b).toMatchObject({ allowed: true, scope: "solo", organization_id: null, organization_name: null, schema_name: "personal" });
  });
  it("reads the active organisation as the tenant", () => {
    expect(toBootstrap(inOrg)).toMatchObject({ scope: "tenant", organization_id: ORG, organization_name: "Quill Hire", role: "owner" });
  });
  it("keeps an empty name empty, for the console's own fallback", () => {
    expect(toBootstrap(me({ user: { ...me().user, fullName: null } })).full_name).toBe("");
  });
});

describe("sessionForScope", () => {
  it("gives owners, admins and a personal workspace the admin controls", () => {
    expect(sessionForScope({ kind: "org", role: "owner" }, "A").role).toBe("admin");
    expect(sessionForScope({ kind: "org", role: "admin" }, "A").role).toBe("admin");
    expect(sessionForScope({ kind: "personal", role: null }, "A").role).toBe("admin");
  });
  it("keeps a recruiter a recruiter, with their own name", () => {
    expect(sessionForScope({ kind: "org", role: "recruiter" }, "Ravi Kumar")).toEqual({ role: "recruiter", standing: "recruiter", name: "Ravi Kumar" });
  });
  it("tells owner, admin, recruiter and a personal workspace apart, and gives a seat with no role the least", () => {
    expect(sessionForScope({ kind: "org", role: "owner" }, "A").standing).toBe("owner");
    expect(sessionForScope({ kind: "org", role: "admin" }, "A").standing).toBe("admin");
    expect(sessionForScope({ kind: "personal", role: null }, "A").standing).toBe("personal");
    expect(sessionForScope({ kind: "org", role: null }, "A")).toMatchObject({ role: "recruiter", standing: "recruiter" });
  });
});

describe("pendingOrgName", () => {
  it("names the organisation a request is waiting on", () => {
    expect(pendingOrgName(me({}, { organisation: quill, membership: "pending" }))).toBe("Quill Hire");
    expect(pendingOrgName(me({}, { organisation: quill }))).toBeNull();
  });
});

describe("inviteView", () => {
  const preview = { valid: true, organisationName: "Quill Hire", logoUrl: null, role: "admin" as const, email: "asha@quillhire.dev", forYou: true, expiresAt: "2026-10-11T00:00:00Z" };
  it("names the organisation and the role", () => {
    expect(inviteView(preview, null)).toEqual({ s: "ready", organisation: "Quill Hire", role: "admin" });
  });
  it("says when an invite is spent, or unknown", () => {
    expect(inviteView({ ...preview, valid: false }, null)).toEqual({ s: "invalid", organisation: "Quill Hire" });
    expect(inviteView({ valid: false }, null)).toEqual({ s: "invalid", organisation: null });
  });
  it("says when it was sent to another address, without spelling that address out to someone it is not for", () => {
    expect(inviteView({ ...preview, forYou: false, email: "sam@quillhire.dev" }, null)).toEqual({ s: "elsewhere", sentTo: "s***@quillhire.dev", organisation: "Quill Hire" });
    // The server gives anyone but the invitee a hint instead of the address, and the page shows that.
    expect(inviteView({ ...preview, forYou: false, email: null, emailHint: "y***@gmail.com" }, null)).toMatchObject({ s: "elsewhere", sentTo: "y***@gmail.com" });
    expect(inviteView({ ...preview, forYou: false, email: null }, null)).toMatchObject({ s: "elsewhere", sentTo: "another address" });
  });
  it("masks an address down to its first letter and its domain", () => {
    expect(maskEmail("sam.rao@gmail.com")).toBe("s***@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("no-at-sign")).toBe("another address");
    expect(maskEmail("@x.io")).toBe("another address");
  });
  it("says when they already belong to another organisation", () => {
    expect(inviteView(preview, "Northwind Talent")).toEqual({ s: "taken", memberOf: "Northwind Talent", organisation: "Quill Hire" });
    expect(inviteView(preview, "Quill Hire").s).toBe("ready");
  });
});

describe("links", () => {
  it("reads an invite token", () => {
    expect(inviteTokenFrom("#/invite/0e66f9601345b96171afd1f7867f04aca51cde6f0916d6ad")).toBe("0e66f9601345b96171afd1f7867f04aca51cde6f0916d6ad");
    expect(inviteTokenFrom("#/invite/short")).toBeNull();
    expect(inviteTokenFrom("#/settings")).toBeNull();
  });
  it("reads Google's return", () => {
    expect(googleReturnFrom("#/settings/connections?google=complete&code=4%2F0Ab&state=x.y")).toEqual({ kind: "complete", code: "4/0Ab", state: "x.y" });
    expect(googleReturnFrom("#/settings/connections?google=error&reason=denied")).toEqual({ kind: "error", reason: "denied" });
    expect(googleReturnFrom("#/settings/connections?google=complete&code=c")).toEqual({ kind: "error", reason: "invalid" });
    expect(googleReturnFrom("#/settings/connections")).toBeNull();
  });
  it("routes settings sections, with or without a query", () => {
    expect(settingsSectionFromHash("#/settings/connections?google=complete&code=c&state=s")).toBe("connections");
    // Members moved to the Teams page: the old address is redirected there, so it names no Settings section.
    expect(settingsSectionFromHash("#/settings/members/")).toBeNull();
    expect(settingsSectionFromHash("#/settings/nope")).toBeNull();
    expect(routeFromHash("#/settings/connections?google=error&reason=denied")).toBe("settings");
    expect(routeFromHash("#/settings")).toBe("settings");
  });
  it("says which Google products are missing", () => {
    expect(missingProductsText([])).toBeNull();
    expect(missingProductsText(["sheets"])).toContain("Google Sheets");
  });
});

describe("gmailStateOf", () => {
  const g = (over: Partial<GoogleConnection>): GoogleConnection => ({
    available: true, status: "connected", accountEmail: "a@b.dev", scopes: [], products: ["gmail", "sheets"], connectedAt: null, ...over,
  });
  it("maps the connection to the connect card's states", () => {
    expect(gmailStateOf(g({}))).toBe("connected");
    expect(gmailStateOf(g({ products: ["sheets"] }))).toBe("expired");
    expect(gmailStateOf(g({ status: "revoked" }))).toBe("expired");
    expect(gmailStateOf(g({ status: "disconnected", products: [] }))).toBe("disconnected");
  });
});

describe("readable", () => {
  it("turns a raised SQL message into a sentence", () => {
    expect(readable(new ApiError(404, "not_found", "this invite is no longer valid"))).toBe("This invite is no longer valid.");
    expect(readable(new ApiError(409, "conflict", "Already done."))).toBe("Already done.");
  });
  it("says who may do it instead of listing roles", () => {
    expect(readable(new ApiError(403, "forbidden", "this needs one of: owner, admin"))).toBe("Only admins can do this.");
    expect(readable(new ApiError(403, "forbidden", "this needs one of: owner"))).toBe("Only the owner can do this.");
  });
  it("names the field a request failed on", () => {
    const err = new ApiError(400, "bad_request", "Some fields need fixing.", { issues: [{ path: "email", message: "Invalid email address" }] });
    expect(readable(err)).toBe("Enter a full email address.");
  });
  it("has something to say for anything else", () => {
    expect(readable(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});

describe("members list changes", () => {
  const mira = { id: "r1", userId: "u3", email: "mira@q.dev", fullName: "Mira", requestedAt: "2026-10-03T00:00:00Z" };
  const base: Members = {
    members: [
      { userId: "u1", email: "asha@q.dev", fullName: "Asha", role: "owner", status: "active", joinedAt: "2026-10-01T00:00:00Z", campaigns: 2 },
      { userId: "u2", email: "ravi@q.dev", fullName: null, role: "recruiter", status: "active", joinedAt: "2026-10-02T00:00:00Z", campaigns: 0 },
    ],
    requests: [mira],
    invites: [{ id: "i1", email: "x@q.dev", role: "recruiter", createdAt: "2026-10-03T00:00:00Z", expiresAt: "2026-10-10T00:00:00Z", state: "sent" }],
  };

  it("changes a role, but never the owner's", () => {
    expect(changeRole(base, "u2", "admin").members[1]?.role).toBe("admin");
    expect(changeRole(base, "u1", "recruiter").members[0]?.role).toBe("owner");
  });
  it("approves a request into the list with the chosen role", () => {
    const next = approveRequest(base, mira, "admin", new Date("2026-10-04T00:00:00Z"));
    expect(next.requests).toEqual([]);
    expect(next.members.at(-1)).toMatchObject({ userId: "u3", role: "admin", campaigns: 0, joinedAt: "2026-10-04T00:00:00.000Z" });
  });
  it("declines, removes and cancels without touching the rest", () => {
    expect(declineRequest(base, "r1").requests).toEqual([]);
    expect(dropMember(base, "u2").members.map((m) => m.userId)).toEqual(["u1"]);
    expect(dropInvite(base, "i1").invites).toEqual([]);
    expect(dropInvite(base, "i1").members).toBe(base.members);
  });
  it("hands ownership on and keeps the old owner as an admin", () => {
    const next = handOwnership(base, "u1", "u2");
    expect(next.members.map((m) => m.role)).toEqual(["admin", "owner"]);
  });
});

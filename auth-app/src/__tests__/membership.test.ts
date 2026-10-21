import { afterEach, describe, expect, it, vi } from "vitest";
import { actionsOn, peopleRoles } from "../can";
import type { Standing } from "../can";
import { identityApi } from "../api/identity";
import { answerInvitation, answerRequest, resetHomeStore } from "../homeStore";
import {
  askOf, groupByRole, importedLine, importOfferLine, isolationLine, joinOfferButton, joinOfferLine, joinPolicyLabel,
  leaveFirstLine, noticeLine, noticeOutcome, ownerLeaveLine, requestSentLine, ROLE_LABEL, ROLE_LINE, settleRequest, withoutNotice, workspaceHint,
} from "../membership";

/**
 * The people side of an organisation: grouping, who may do what to whom (the same table as the server's
 * core.org_may and identity/roles.ts), the words for a workspace, and the bell's invitations and requests.
 */

const member = (userId: string, role: "owner" | "admin" | "recruiter", joinedAt: string) => ({
  userId, email: `${userId}@acme.dev`, fullName: userId, role, status: "active", joinedAt, campaigns: 0,
});

describe("members by role", () => {
  it("reads owner, admins, recruiters, each by when they joined, and leaves out empty groups", () => {
    const groups = groupByRole([
      member("r2", "recruiter", "2026-03-01T00:00:00Z"),
      member("a1", "admin", "2026-02-01T00:00:00Z"),
      member("o", "owner", "2026-01-01T00:00:00Z"),
      member("r1", "recruiter", "2026-02-15T00:00:00Z"),
    ]);
    expect(groups.map((g) => [g.role, g.people.map((p) => p.userId)])).toEqual([
      ["owner", ["o"]],
      ["admin", ["a1"]],
      ["recruiter", ["r1", "r2"]],
    ]);
    expect(groupByRole([member("o", "owner", "2026-01-01T00:00:00Z")]).map((g) => g.role)).toEqual(["owner"]);
  });

  it("has a line for every role, in plain words", () => {
    for (const r of ["owner", "admin", "recruiter"] as const) {
      expect(ROLE_LINE[r].length).toBeGreaterThan(20);
      expect(ROLE_LABEL[r]).toMatch(/^[A-Z][a-z]+$/);
    }
  });
});

describe("what a person may do to another", () => {
  const stand = (s: Standing) => s;

  it("lets an owner invite and approve as admin or recruiter, and an admin only as recruiter", () => {
    expect(peopleRoles(stand("owner"), "invite")).toEqual(["admin", "recruiter"]);
    expect(peopleRoles(stand("admin"), "invite")).toEqual(["recruiter"]);
    expect(peopleRoles(stand("owner"), "approve")).toEqual(["admin", "recruiter"]);
    expect(peopleRoles(stand("admin"), "approve")).toEqual(["recruiter"]);
    expect(peopleRoles(stand("recruiter"), "invite")).toEqual([]);
    expect(peopleRoles(stand("personal"), "remove")).toEqual([]);
  });

  it("gives an owner a role change, ownership and removal on an admin or a recruiter", () => {
    expect(actionsOn("owner", { role: "recruiter" })).toEqual({ roles: ["admin"], remove: true, makeOwner: true });
    expect(actionsOn("owner", { role: "admin" })).toEqual({ roles: ["recruiter"], remove: true, makeOwner: true });
  });

  it("gives an admin no removal from the organisation (they take people off the teams they lead), and the owner both", () => {
    expect(actionsOn("admin", { role: "recruiter" })).toEqual({ roles: [], remove: false, makeOwner: false });
    expect(actionsOn("owner", { role: "recruiter" })).toMatchObject({ remove: true });
    expect(actionsOn("admin", { role: "admin" })).toEqual({ roles: [], remove: false, makeOwner: false });
  });

  it("leaves the owner and oneself alone, and a recruiter without a menu", () => {
    for (const s of ["owner", "admin", "recruiter"] as const) {
      expect(actionsOn(s, { role: "owner" })).toEqual({ roles: [], remove: false, makeOwner: false });
      expect(actionsOn(s, { role: "recruiter", self: true })).toEqual({ roles: [], remove: false, makeOwner: false });
    }
    expect(actionsOn("recruiter", { role: "recruiter" })).toEqual({ roles: [], remove: false, makeOwner: false });
  });
});

describe("the words for a workspace", () => {
  it("says Personal is only theirs, and an organisation is visible by role", () => {
    expect(isolationLine({ kind: "personal", name: "Personal" })).toBe("Personal. Only you can see this.");
    expect(isolationLine({ kind: "org", name: "Acme" })).toBe("Acme. Visible to the people in Acme, by role.");
    expect(workspaceHint({ kind: "personal", role: null })).toBe("Only you");
    expect(workspaceHint({ kind: "org", role: "admin" })).toBe("Admin");
    expect(workspaceHint({ kind: "org", role: null })).toBe("Member");
  });

  it("names the domain in the join policy", () => {
    expect(joinPolicyLabel("acme.com")).toBe("People with an @acme.com email can join without approval");
    expect(joinPolicyLabel(null)).toBe("People can join without approval");
  });
});

describe("what a bell line asks", () => {
  const invitation = {
    id: "i1", organisationId: "o1", organisationName: "Acme", logoUrl: null, inviterName: "Ada", role: "recruiter" as const,
    expiresAt: "2026-10-20T00:00:00Z", blockedBy: null,
  };

  it("asks an invitation to be answered, an open request to be decided, an answer to be opened", () => {
    expect(askOf({ kind: "invitation", open: true, invitation, organisationId: "o1" })).toBe("answer-invitation");
    expect(askOf({ kind: "join_request", open: true })).toBe("decide-request");
    expect(askOf({ kind: "join_request", open: false })).toBeNull();
    expect(askOf({ kind: "request_answered", organisationId: "o1" })).toBe("open-organisation");
    expect(askOf({ kind: "role_changed" })).toBeNull();
    expect(askOf({ kind: "removed", organisationId: "o1" })).toBeNull();
  });

  it("drops an answered line, and settles a decided request without losing its place", () => {
    const items = [
      { id: "a", readAt: null, open: true },
      { id: "b", readAt: null, open: true },
    ];
    expect(withoutNotice(items, "a").map((n) => n.id)).toEqual(["b"]);
    const settled = settleRequest(items, "b", new Date("2026-10-11T10:00:00Z"));
    expect(settled.map((n) => n.id)).toEqual(["a", "b"]);
    expect(settled[1]).toEqual({ id: "b", readAt: "2026-10-11T10:00:00.000Z", open: false });
    expect(settled[0]).toEqual(items[0]);
  });
});

describe("answering from the bell", () => {
  afterEach(() => { vi.restoreAllMocks(); resetHomeStore(); });

  it("accepts an invitation and says which organisation they are in", async () => {
    const accept = vi.spyOn(identityApi, "acceptInvitation").mockResolvedValue({ organisationId: "o1", role: "recruiter" });
    const done = await answerInvitation("i1", true);
    expect(accept).toHaveBeenCalledWith("i1");
    expect(done).toEqual({ ok: true, organisationId: "o1" });
  });

  it("declines one without switching anything", async () => {
    const decline = vi.spyOn(identityApi, "declineInvitation").mockResolvedValue(undefined);
    expect(await answerInvitation("i1", false)).toEqual({ ok: true, organisationId: null });
    expect(decline).toHaveBeenCalledWith("i1");
  });

  it("puts the line back and says so when the invitation is refused", async () => {
    vi.spyOn(identityApi, "acceptInvitation").mockRejectedValue(new Error("no"));
    expect(await answerInvitation("i1", true)).toEqual({ ok: false });
  });

  it("approves a request as a recruiter, and reports a refusal", async () => {
    const decide = vi.spyOn(identityApi, "decide").mockResolvedValue({ requestId: "r1", approved: true });
    expect(await answerRequest("n1", "r1", true)).toBe(true);
    expect(decide).toHaveBeenCalledWith("r1", { approve: true, role: "recruiter" });
    decide.mockRejectedValueOnce(new Error("no"));
    expect(await answerRequest("n1", "r1", false)).toBe(false);
  });
});

describe("copying their own space into the organisation", () => {
  const offer = { candidates: 12, calls: 3, imported: false, organisationName: "Acme" };

  it("offers it once, in one calm line, in their words", () => {
    expect(importOfferLine(offer, "Acme", false)).toBe(
      "You have 12 candidates saved in Personal. Copy them into Acme? Personal keeps its own copy.",
    );
    expect(importOfferLine({ ...offer, candidates: 1 }, "Acme", false)).toBe(
      "You have 1 candidate saved in Personal. Copy it into Acme? Personal keeps its own copy.",
    );
  });

  it("offers nothing when there is nothing, when they copied, or when they said not now", () => {
    expect(importOfferLine(null, "Acme", false)).toBeNull();
    expect(importOfferLine({ ...offer, candidates: 0 }, "Acme", false)).toBeNull();
    expect(importOfferLine({ ...offer, imported: true }, "Acme", false)).toBeNull();
    expect(importOfferLine(offer, "Acme", true)).toBeNull();
  });

  it("says what was copied", () => {
    expect(importedLine(12, "Acme")).toBe("Copied 12 candidates into Acme.");
    expect(importedLine(1, "Acme")).toBe("Copied 1 candidate into Acme.");
    expect(importedLine(0, "Acme")).toBe("Nothing new to copy into Acme.");
  });
});

describe("what a bell line says once it has been answered", () => {
  it("tells an answered request in the past, so someone who is in is not described as waiting", () => {
    const text = "t2.gus@gmail.com wants to join T2 Hire.";
    expect(noticeLine({ kind: "join_request", open: true, text })).toBe(text);
    expect(noticeLine({ kind: "join_request", open: false, text })).toBe("t2.gus@gmail.com asked to join T2 Hire.");
    expect(noticeLine({ kind: "invitation", open: false, text })).toBe(text);
  });
});

describe("how an answered request ended", () => {
  it("says approved or declined, and by whom, only once it has been answered", () => {
    const base = { kind: "join_request", open: false } as const;
    expect(noticeOutcome({ ...base, outcome: "approved", decidedByName: "Rohan Mehta" })).toEqual({ text: "Approved by Rohan", tone: "hired" });
    expect(noticeOutcome({ ...base, outcome: "declined", decidedByName: null })).toEqual({ text: "Declined", tone: "passed" });
    expect(noticeOutcome({ ...base, open: true, outcome: null })).toBeNull();
    expect(noticeOutcome({ kind: "invitation", open: false, outcome: "approved" })).toBeNull();
  });

  it("settles the line with the answer at once, so the bell never reads as still waiting", () => {
    const items = [{ id: "a", readAt: null, open: true }];
    const [done] = settleRequest(items, "a", new Date("2026-10-11T10:00:00Z"), { outcome: "approved", by: "you" });
    expect(done).toMatchObject({ open: false, outcome: "approved", decidedByName: "you" });
  });
});

describe("an invitation they cannot take up yet", () => {
  it("says plainly what to do first, and for an owner that ownership goes first", () => {
    expect(leaveFirstLine("Northwind", "Acme", "recruiter")).toBe("You're in Northwind. Leave it first to join Acme.");
    expect(leaveFirstLine("Northwind", "Acme", null)).toBe("You're in Northwind. Leave it first to join Acme.");
    expect(leaveFirstLine("Northwind", "Acme", "owner")).toBe(
      "You own Northwind. Invite someone and make them its owner, then leave it, before joining another organisation.",
    );
  });
});

describe("asking to join the organisation on their address, from Settings", () => {
  it("offers a direct join or a request, by what the server says, and says Personal stays theirs", () => {
    expect(joinOfferButton("Acme", "direct")).toBe("Join Acme");
    expect(joinOfferButton("Acme", "request")).toBe("Ask to join Acme");
    expect(joinOfferLine("Acme", "request")).toMatch(/^Acme is already on SuperHyre\. Ask to join/);
    expect(joinOfferLine("Acme", "direct")).toMatch(/Join your team there/);
    expect(joinOfferLine("Acme", "request")).toMatch(/Personal stays yours/);
    expect(requestSentLine("Acme")).toMatch(/An admin at Acme has to approve it/);
  });
});

describe("how many were already there when people are copied in", () => {
  const offer = { candidates: 12, calls: 3, imported: false, organisationName: "Acme" };
  it("says so in the same line, with a count and nothing about who", () => {
    expect(importedLine(9, "Acme", 3)).toBe("Copied 9 candidates into Acme. 3 were already in Acme.");
    expect(importedLine(1, "Acme", 1)).toBe("Copied 1 candidate into Acme. 1 was already in Acme.");
    expect(importedLine(0, "Acme", 4)).toBe("Nothing new to copy into Acme. 4 were already in Acme.");
    expect(importedLine(9, "Acme", 0)).toBe("Copied 9 candidates into Acme.");
    expect(importOfferLine({ ...offer, skipped: 2 }, "Acme", false)).toMatch(/Personal keeps its own copy\. 2 were already in Acme\.$/);
  });
});

describe("what an owner is told about leaving", () => {
  it("says someone else has to own it first, and with nobody else there that starts with an invitation", () => {
    expect(ownerLeaveLine("Acme", 2)).toBe("You own Acme. To leave it, make someone else the owner first.");
    expect(ownerLeaveLine("Acme", 0)).toBe("You own Acme. To leave it, invite someone and make them the owner first.");
  });
});

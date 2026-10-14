import { describe, expect, it } from "vitest";
import { nameOf } from "../api/identity";
import { labelMembers } from "../campaignStore";
import { addressLine, requestLine } from "../SettingsMembers";

/**
 * Members, for a recruiter and for an admin. A recruiter is given names and roles, not teammates'
 * addresses (the agent follows the same rule), and nobody is shown the same address twice.
 */

describe("a teammate's name and address", () => {
  it("reads a name, or 'A teammate' when a recruiter is given neither a name nor an address", () => {
    expect(nameOf({ fullName: "Pia Peer", email: null })).toBe("Pia Peer");
    expect(nameOf({ fullName: null, email: null })).toBe("A teammate");
    expect(nameOf({ fullName: "  ", email: "pia@acme.io" })).toBe("pia@acme.io");
  });

  it("shows the address under a name, once, and not at all when the address is the name or is not given", () => {
    expect(addressLine({ fullName: "Pia Peer", email: "pia@acme.io" })).toBe("pia@acme.io");
    // No name: the address is already the title; it is not said a second time under itself.
    expect(addressLine({ fullName: null, email: "x2.nn1@x2-co.io" })).toBeNull();
    expect(addressLine({ fullName: "", email: "x2.nn1@x2-co.io" })).toBeNull();
    // A recruiter looking at a teammate: nothing to show.
    expect(addressLine({ fullName: "Pia Peer", email: null })).toBeNull();
  });

  it("labels teammates for a picker without an address, and still tells two of one name apart for an admin", () => {
    expect(
      labelMembers([
        { userId: "u1", fullName: "Pia Peer", email: null },
        { userId: "u2", fullName: null, email: null },
      ]),
    ).toEqual([
      { userId: "u1", label: "Pia Peer" },
      { userId: "u2", label: "A teammate" },
    ]);
    expect(
      labelMembers([
        { userId: "u1", fullName: "Sam Rao", email: "sam@a.io" },
        { userId: "u2", fullName: "Sam Rao", email: "sam@b.io" },
      ]).map((m) => m.label),
    ).toEqual(["Sam Rao (sam@a.io)", "Sam Rao (sam@b.io)"]);
  });
});

describe("someone asking to join", () => {
  const asked = "2026-10-12T09:00:00.000Z";
  it("is named by the name they gave, with the address beside it", () => {
    expect(requestLine({ fullName: "Uma Four", email: "x1.ui4@x1-a1-co.io", requestedAt: asked })).toMatch(
      /^x1\.ui4@x1-a1-co\.io, asked /,
    );
  });

  it("says plainly when they gave no name, instead of an address and a date alone", () => {
    const line = requestLine({ fullName: null, email: "x1.ui4@x1-a1-co.io", requestedAt: asked });
    expect(line).toMatch(/^asked .+\. No name on their account yet$/);
    expect(line).not.toContain("x1.ui4@");
  });
});

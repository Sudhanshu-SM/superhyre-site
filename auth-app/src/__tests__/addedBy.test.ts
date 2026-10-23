import { describe, expect, it } from "vitest";
import { type CandidateRow, contactFromRow, listPath } from "../api/candidates";
import { addedLine } from "../contacts";

const row = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  id: "c1", fullName: "Meera Das", headline: null, currentTitle: null, currentCompanyName: null, city: null, country: null,
  yearsOfExperience: null, linkedinUrl: null, source: "manual", ownerId: "u1", hasEmail: false, hasPhone: false, email: null,
  phone: null, completeness: "basic", campaigns: [], createdAt: "2026-10-20T10:00:00Z", ...over,
});
const NOW = Date.parse("2026-10-23T10:00:00Z");

describe("who added a person, and when", () => {
  it("says who and how long ago, quietly", () => {
    const c = contactFromRow(row(), NOW, "Ravi");
    expect(addedLine(c)).toBe("Added by Ravi · 3d ago");
  });

  it("says Today and Yesterday in words", () => {
    expect(addedLine(contactFromRow(row({ createdAt: "2026-10-23T08:00:00Z" }), NOW, "Ravi"))).toBe("Added by Ravi · today");
    expect(addedLine(contactFromRow(row({ createdAt: "2026-10-22T08:00:00Z" }), NOW, "Ravi"))).toBe("Added by Ravi · yesterday");
  });

  it("does not say a teammate added someone who applied through a form", () => {
    expect(addedLine(contactFromRow(row({ source: "form" }), NOW, ""))).toBe("Applied via form · 3d ago");
  });

  it("names the agent or the extension when no teammate is known, and says nothing false otherwise", () => {
    expect(addedLine(contactFromRow(row({ source: "agent" }), NOW))).toBe("Added by the agent · 3d ago");
    expect(addedLine(contactFromRow(row({ source: "extension" }), NOW))).toBe("Added by the extension · 3d ago");
    expect(addedLine(contactFromRow(row({ source: "manual" }), NOW))).toBe("Added 3d ago");
  });
});

describe("filtering by who added them", () => {
  it("sends the teammate's id as the API's owner filter, and only when one is chosen", () => {
    expect(listPath({ sort: "recent", limit: 20, ownerId: "u-7" })).toContain("ownerId=u-7");
    expect(listPath({ sort: "recent", limit: 20 })).not.toContain("ownerId");
  });
});

describe("the options a filter offers", () => {
  it("never offers a blank place or skill", async () => {
    const { optionsFor } = await import("../contacts");
    const people = [{ location: "", skills: [] }, { location: "Pune", skills: ["Go", ""] }, { location: "Pune", skills: ["Go"] }] as never;
    expect(optionsFor(people, "location")).toEqual(["Pune"]);
    expect(optionsFor(people, "skills")).toEqual(["Go"]);
  });
});

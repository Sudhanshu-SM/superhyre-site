import { describe, expect, it } from "vitest";
import { afterMismatch, ApiError } from "../api/client";
import { matchNote, responseFromServer, type ServerResponse } from "../api/forms";
import { personFromBoard } from "../api/campaigns";
import { passReasonText } from "../PassReason";

describe("being removed from an organisation", () => {
  it("says so and leaves for Personal", () => {
    const removed = new ApiError(403, "forbidden", "You're no longer a member of Acme", {
      removed: true,
      workspaceChanged: true,
    });
    expect(afterMismatch(removed)).toEqual({
      notice: "You're no longer a member of Acme. You're in Personal now.",
      leaveOrg: true,
    });
  });

  it("only follows another tab's switch otherwise", () => {
    const switched = new ApiError(409, "conflict", "Workspace changed.", { workspaceChanged: true });
    expect(afterMismatch(switched)).toEqual({
      notice: "Something changed. Updating.",
      leaveOrg: false,
    });
  });
});

describe("an applicant who might already be a candidate", () => {
  const base: ServerResponse = {
    id: "r1", submittedAt: "2026-10-04T10:00:00.000Z", durationS: 60, name: "Karthik Bose",
    email: "karthik@example.org", linkedinUrl: null, answers: {}, mustHave: {}, flagged: false,
    match: "none", decision: null, isNew: true, candidate: null,
  };

  it("carries the possible match without linking it", () => {
    const { meta } = responseFromServer(
      { ...base, possibleMatch: { candidateId: "c1", name: "Karthik Bose", campaignCandidateId: "cc1" } },
      "f1",
    );
    expect(meta.possibleMatch).toEqual({ candidateId: "c1", name: "Karthik Bose", campaignCandidateId: "cc1" });
    expect(meta.stage).toBeNull();
    expect(responseFromServer(base, "f1").meta.possibleMatch).toBeNull();
  });

  it("says who and whether they're already on this campaign", () => {
    expect(matchNote({ candidateId: "c1", name: "Karthik Bose", campaignCandidateId: "cc1" })).toBe(
      "Looks like Karthik Bose, already in your candidates and on this campaign. Same email.",
    );
    expect(matchNote({ candidateId: "c1", name: "Karthik Bose", campaignCandidateId: null })).toBe(
      "Looks like Karthik Bose, already in your candidates. Same email.",
    );
  });
});

describe("why someone was rejected", () => {
  it("sends the picked reason, the note, both, or nothing", () => {
    expect(passReasonText("Skills", "")).toBe("Skills");
    expect(passReasonText(null, " wants remote only ")).toBe("wants remote only");
    expect(passReasonText("Location", "Pune only")).toBe("Location: Pune only");
    expect(passReasonText(null, "  ")).toBeUndefined();
  });
});

describe("the pipeline card", () => {
  it("says someone is in outreach, never that a message was sent", () => {
    const row = {
      campaignCandidateId: "cc1", candidateId: "c1", personId: "p1", fullName: "Kavya Iyer",
      currentTitle: null, currentCompanyName: null, city: null, linkedinUrl: null,
      stage: "outreach" as const, step: "waiting" as const, ownerId: null, source: "manual" as const, fit: null, tier: null,
      addedAt: "2026-10-01T00:00:00.000Z", yearsOfExperience: null, skills: [] as string[], daysInStage: 1,
      lastActivityAt: "2026-10-01T00:00:00.000Z", hasEmail: false, hasPhone: false,
    };
    expect(personFromBoard(row, "camp", () => "Asha").last).toBe("In outreach");
  });
});

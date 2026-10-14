import { describe, expect, it } from "vitest";
import type { FormView, ServerResponse } from "../api/forms";
import { bodyFromForm, formFromView, matchIds, publishProblem, responseFromServer } from "../api/forms";
import { ApiError } from "../api/client";

const view: FormView = {
  id: "f1", campaignId: "k1", name: "Backend screening", status: "closed", version: 2, title: "Senior Backend Engineer",
  description: null, role: null, theme: "sage", publicLink: "http://x/#/apply/key", hasDraftChanges: false,
  createdAt: "2026-10-04T08:00:00Z", updatedAt: "2026-10-04T09:00:00Z",
  questions: [
    { id: "s1", type: "choice", title: "Notice?", required: true, options: ["Immediate", "30 days"], mapsTo: "notice_days" },
    { id: "s2", type: "yesno", title: "Bangalore?", required: true, accept: ["Yes"] },
  ],
};

describe("formFromView", () => {
  it("drops field mappings and folds closed into draft", () => {
    const f = formFromView(view);
    expect(f.status).toBe("draft");
    /* The cover colour is gone: whatever an older form stored, the page is the brand orange. */
    expect(f.theme).toBe("ember");
    expect(f.questions[0]).toEqual({ id: "s1", type: "choice", title: "Notice?", required: true, options: ["Immediate", "30 days"] });
    expect(f.description).toBeUndefined();
  });
});

describe("bodyFromForm", () => {
  it("sends server ids, keeps mappings and drops blank options", () => {
    const f = formFromView(view);
    const local = { ...f, questions: [...f.questions, { id: "q-new", type: "choice" as const, title: "Mode", required: false, options: ["Remote", " "], knockout: "Remote" }] };
    const body = bodyFromForm(local, new Map([["q-new", "s3"]]), new Map([["s1", "notice_days"]]));
    expect(body.questions).toEqual([
      { id: "s1", type: "choice", title: "Notice?", required: true, options: ["Immediate", "30 days"], mapsTo: "notice_days" },
      { id: "s2", type: "yesno", title: "Bangalore?", required: true, accept: ["Yes"] },
      { id: "s3", type: "choice", title: "Mode", required: false, options: ["Remote"], knockout: "Remote" },
    ]);
    // The page settings go along on every save; an older view without them reads as the defaults.
    expect(body.settings).toEqual({
      title: "Senior Backend Engineer", description: "",
      closesOn: null, successMessage: null, closedMessage: null, promise: null,
    });
    expect(body.role).toBeNull();
  });
});

describe("matchIds", () => {
  it("pairs local and server ids by position", () => {
    const local = [{ id: "a", type: "short" as const, title: "", required: false }, { id: "b", type: "yesno" as const, title: "", required: false }];
    const server = [{ id: "s-a", type: "short" as const, title: "", required: false }, { id: "s-b", type: "yesno" as const, title: "", required: false }];
    expect([...matchIds(local, server)]).toEqual([["a", "s-a"], ["b", "s-b"]]);
    expect(matchIds(local, server.slice(1)).size).toBe(0);
  });
});

describe("responseFromServer", () => {
  const base: ServerResponse = {
    id: "r1", submittedAt: "2026-10-04T11:00:00Z", durationS: null, name: "Priya N", email: "priya@x.in", linkedinUrl: null,
    answers: { s2: "No" }, mustHave: { s2: "missed" }, flagged: true, match: "created", decision: null, isNew: true, candidate: null,
  };
  it("names a new applicant from what they typed", () => {
    const { response, meta } = responseFromServer(base, "f1", Date.parse("2026-10-04T12:00:00Z"));
    expect(response.person).toMatchObject({ id: "applicant-r1", name: "Priya N", title: "" });
    expect(response.at).toBe(60);
    expect(Number.isNaN(response.took)).toBe(true);
    expect(meta).toEqual({ decision: null, stage: null, isNew: true, possibleMatch: null });
  });
  it("uses the matched candidate and their stage on this campaign", () => {
    const { response, meta } = responseFromServer({
      ...base, durationS: 95, isNew: false, decision: "added",
      candidate: { id: "c1", campaignCandidateId: "cc1", fullName: "Priya Nair", currentTitle: "SRE", currentCompanyName: "Acme", stage: "shortlisted" },
    }, "f1");
    expect(response.person).toMatchObject({ id: "c1", name: "Priya Nair", company: "Acme" });
    expect(response.took).toBe(95);
    expect(meta.stage).toBe("shortlisted");
  });
});

describe("publishProblem", () => {
  it("reads the first problem the API listed", () => {
    const err = new ApiError(400, "bad_request", "This form isn't ready to publish yet.", { problems: [{ questionId: null, message: "Add at least one question." }] });
    expect(publishProblem(err)).toBe("Add at least one question.");
    expect(publishProblem(new ApiError(500, "internal", "x"))).toBeNull();
  });
});

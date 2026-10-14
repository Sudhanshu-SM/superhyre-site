import { describe, expect, it } from "vitest";
import { controlState, stagesFrom } from "../shortlistControl";

describe("the Candidates page's shortlist control", () => {
  const row = (id: string, campaigns: Array<{ id: string; name: string; stage: string }>) => ({ id, campaigns });

  it("says Passed for someone who was passed, not Shortlisted", () => {
    const stages = stagesFrom([row("p1", [{ id: "c1", name: "Backend", stage: "passed" }])], {});
    expect(controlState(["c1"], stages.p1 ?? {})).toEqual({ label: "Passed", shortlisted: [], active: true });
  });

  it("says where someone is when they are past the shortlist, and Shortlisted only at the first stage", () => {
    const stages = stagesFrom(
      [
        row("a", [{ id: "c1", name: "A", stage: "outreach" }]),
        row("b", [{ id: "c1", name: "A", stage: "interviewing" }]),
        row("c", [{ id: "c1", name: "A", stage: "shortlisted" }]),
      ],
      {},
    );
    expect(controlState(["c1"], stages.a ?? {}).label).toBe("In outreach");
    expect(controlState(["c1"], stages.b ?? {}).label).toBe("Interviewing");
    expect(controlState(["c1"], stages.c ?? {})).toMatchObject({ label: "Shortlisted", shortlisted: ["c1"] });
  });

  it("is Shortlisted when they are on one campaign at the first stage and passed on another", () => {
    const stages = stagesFrom(
      [
        row("p", [
          { id: "c1", name: "A", stage: "passed" },
          { id: "c2", name: "B", stage: "shortlisted" },
        ]),
      ],
      {},
    );
    expect(controlState(["c1", "c2"], stages.p ?? {})).toMatchObject({ label: "Shortlisted", shortlisted: ["c2"] });
  });

  it("treats a campaign it has no stage for (a change just made on the page) as the first stage", () => {
    expect(controlState(["new"], {})).toMatchObject({ label: "Shortlisted", shortlisted: ["new"] });
    expect(controlState([], {})).toEqual({ label: "Shortlist", shortlisted: [], active: false });
  });

  it("takes the stage from an opened profile over the row", () => {
    const stages = stagesFrom([row("p", [{ id: "c1", name: "A", stage: "shortlisted" }])], {
      p: { detail: { campaigns: [{ id: "c1", name: "A", campaignCandidateId: "x", stage: "passed" }] } },
    });
    expect(stages.p).toEqual({ c1: "passed" });
  });
});

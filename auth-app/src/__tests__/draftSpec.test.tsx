import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JdStep, onDraftPress, onJdGiven, specCardFor } from "../liveViews/DraftSpec";
import { jdQuestion } from "../clarify";

/**
 * "Draft the role spec" on a campaign's card is an action: with a job description on the campaign the draft starts
 * at once and the role spec card appears in place, reading it; without one the job description is asked for on the
 * card (paste, upload, or draft from the set-up) and the draft starts from what is given, or from the campaign's years and
 * must-haves when nothing is. Nothing is sent to the agent.
 */

describe("Draft the requirements", () => {
  it("drafts at once from the job description the campaign has, and asks for one on the card when it has none", () => {
    expect(onDraftPress(true, "idle")).toBe("draft");
    expect(onDraftPress(false, "idle")).toBe("ask");
    expect(onDraftPress(false, "failed")).toBe("ask");
    // A second press while it is being read is the same draft.
    expect(onDraftPress(true, "going")).toBe("wait");
  });

  it("drafts from what is given on the card, and from the set-up when nothing is: never back to the same card", () => {
    expect(onJdGiven("Own production reliability. Kubernetes, Go, Terraform and Postgres at scale.")).toBe("draft");
    expect(onJdGiven("")).toBe("setup");
    expect(onJdGiven("   ")).toBe("setup");
  });

  it("asks for the job description inline: paste, upload, or draft from what was told", () => {
    const html = renderToStaticMarkup(<JdStep name="Senior Backend Engineer" onAnswer={() => {}} />);
    expect(html).toContain("Do you have the job description for Senior Backend Engineer?");
    for (const tile of ["Paste it", "Upload a file", "Draft from what you told me"]) expect(html).toContain(tile);
    expect(html).not.toContain("I&#x27;ll add it later");
    expect(jdQuestion("x").document).toMatchObject({ min: 40 });
  });

  it("stands the requirements card in place, reading the job description, and says how it stopped", () => {
    expect(specCardFor("c1", "Senior Backend Engineer", true)).toMatchObject({ key: "role_spec:c1", status: "drafting", spec: null, trouble: null });
    expect(specCardFor("c1", "Senior Backend Engineer", false, "That job description was too short.")).toMatchObject({
      status: "ready", trouble: "That job description was too short.",
    });
  });
});

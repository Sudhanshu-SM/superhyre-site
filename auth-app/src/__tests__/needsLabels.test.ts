import { describe, expect, it } from "vitest";
import { CAMPAIGN_ROWS } from "../campaignsData";
import { factsOf } from "../HomeCards";
import { refusalCopy } from "../liveAgents";
import { startLine, waitsOnRequirements } from "../stageDonut";

/**
 * What a campaign waits on (`needs`) is the title of its first open task, and a title can carry a campaign's name or
 * any words a person typed. Whether it means "the requirements are not approved" is told by the app's own labels only,
 * from their start, and the server's refusal for a search without approved requirements is told by what it is about, not
 * by how its sentence begins (the sentence is still being polished).
 */

const none = { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 };
/** A campaign with nobody on its board. */
const empty = CAMPAIGN_ROWS.find((r) => r.id === "fin-controller")!;

describe("which need is the requirements", () => {
  it("is each label the app uses for it: the server's task (also as it was saved before, with a count), and the console's own", () => {
    for (const label of [
      "Approve the requirements",
      "Approve the requirements (2)",
      "Approve the role spec",
      "approve the role spec",
      "Requirements not approved",
      "Brief not finished",
    ]) {
      expect(waitsOnRequirements(label), label).toBe(true);
    }
  });

  it("is not another task whose title carries a campaign's name or the same words somewhere else", () => {
    for (const title of [
      "Review 3 new applicants (Customer Support Specialist)",
      "Review 3 new applicants (Requirements Engineer)",
      "Review 12 matches",
      "Reply to Prospect Inc",
      "Brief the client on Friday",
      "2 interviews to schedule",
      "2 open tasks",
      "",
      undefined,
    ]) {
      expect(waitsOnRequirements(title), String(title)).toBe(false);
    }
  });

  it("says 'Needs requirements' under an empty campaign for the label, and keeps saying how far it got for a title that only holds a name", () => {
    expect(startLine({ needs: "Approve the requirements", agents: [], funnel: none })).toBe("Needs requirements");
    expect(startLine({ needs: "Approve the role spec", agents: [], funnel: none })).toBe("Needs requirements");
    const applicants = "Review 3 new applicants (Customer Support Specialist)";
    expect(startLine({ needs: applicants, agents: [], funnel: none })).toBe("Ready to start");
    expect(startLine({ needs: applicants, agents: ["Agent"], funnel: none })).toBe("Finding people");
    expect(startLine({ needs: applicants, agents: [], funnel: { ...none, sourced: 4 } })).toBe("4 found, none shortlisted");
  });

  it("leaves the real need on an empty campaign's tile, and hides only the requirements one (the line under the name says it)", () => {
    const applicants = "Review 3 new applicants (Customer Support Specialist)";
    const shown = factsOf({ ...empty, needs: applicants });
    expect(shown.need).toBe(applicants);
    expect(shown.line).toBe(applicants);
    const waiting = factsOf({ ...empty, needs: "Approve the requirements" });
    expect(waiting.need).toBeNull();
    expect(waiting.caption).toBe("Needs requirements");
    expect(waiting.line).toBe("Needs requirements");
  });
});

describe("the server's refusal for a search without approved requirements", () => {
  const TEXT =
    "This campaign has no approved requirements yet. The agent needs them to know who fits, so approve them first.";

  it("is said in plain words, however the sentence is worded or begins", () => {
    for (const said of [
      "Approve the requirements before searching. They decide who fits.",
      "Approve the role spec before searching.",
      "Approve its requirements before searching.",
      "The requirements must be approved before searching.",
      "Please approve the role spec first.",
    ]) {
      expect(refusalCopy(said), said).toEqual({ text: TEXT, needsSpec: true });
    }
  });

  it("passes any other refusal on as it is said", () => {
    for (const said of [
      "This campaign already has a watch. Change that one instead.",
      "This campaign is closed. Reopen it to make changes.",
      "Only the people on this campaign can change it. Ask its owner or the team lead to add you.",
    ]) {
      expect(refusalCopy(said), said).toEqual({ text: said, needsSpec: false });
    }
  });
});

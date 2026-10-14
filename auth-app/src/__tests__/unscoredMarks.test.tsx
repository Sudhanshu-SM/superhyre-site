import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Match } from "../api/agent";
import { FitMark, FitRow } from "../CandidateBits";
import { candidateFromMatch } from "../liveCandidate";

/**
 * People the model has not judged have no verdicts: their marks are empty circles on screen, and the words behind
 * them read "Does not meet: 5+ years in data engineering" for every criterion, a judgement nobody made (r5 F11).
 */

const ranked = (over: Partial<Match> = {}): Match => ({
  personId: "p1", fullName: "Gina Mehta", headline: null, currentTitle: "Data Engineer", currentCompanyName: "Acko", city: "Pune",
  linkedinUrl: null, profileImageUrl: null, yearsOfExperience: 4, source: "ours", stage: "features", score: 0.62, tier: null,
  knockedOut: null, judgement: null, ...over,
});
const criteria = [
  { id: "r1", text: "5+ years in data engineering", short: "5+ yrs", kind: "experience", importance: "must" },
] as never;

describe("a person ranked on features but not judged", () => {
  it("is not scored, even though the ranking gave them a score", () => {
    expect(candidateFromMatch(ranked(), { criteria }).scored).toBe(false);
  });

  it("is scored once there is a judgement", () => {
    const judged = ranked({ stage: "judged", judgement: { verdicts: [{ requirementId: "r1", verdict: "met", evidence: "" }], strengths: [], concerns: [] } });
    expect(candidateFromMatch(judged, { criteria }).scored).toBe(true);
  });

  it("says 'Not scored yet' behind every mark and in the row's label, never 'Does not meet'", () => {
    const c = candidateFromMatch(ranked(), { criteria });
    const html = renderToStaticMarkup(<FitRow meets={c.meets} unscored={c.scored === false} criteria={["5+ years in data engineering"]} short={["5+ yrs"]} />);
    expect(html).toContain("Not scored yet");
    expect(html).not.toMatch(/Does not meet|Meets/);
  });

  it("keeps 'Does not meet' for someone who was judged and missed", () => {
    expect(renderToStaticMarkup(<FitMark met={false} label="5+ years" />)).toContain("Does not meet: 5+ years");
    expect(renderToStaticMarkup(<FitMark met={false} label="5+ years" unscored />)).not.toContain("Does not meet");
  });
});

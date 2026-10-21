import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Match, MatchFit } from "../api/agent";
import { FitMark, FitRow, FitState } from "../CandidateBits";
import { candidateFromMatch, reasonOf, setFromMatches } from "../liveCandidate";
import { compareVerdict } from "../liveViews/compareLogic";
import { auditLine, MatchResult, withResult } from "../MatchResult";
import { coverageLine, provenanceLine, reasonLine, resultOf, stateLabel, stateTone } from "../matchResult";

/**
 * What the server concluded, as words and marks. The console shows the server's fit, coverage, status and verdicts; it
 * never counts, ranks or tiers on its own, says "not scored yet" and "needs more evidence" without saying anything about
 * the person, and shows no number for a result that is not a valid fit.
 */

const fit = (over: Partial<MatchFit> = {}): MatchFit => ({
  score: 82,
  coverage: 80,
  status: "scored",
  fit: 3,
  toVerify: [],
  requirements: [
    { id: "r1", text: "Kotlin in production", importance: "must", weight: 0.9, verdict: "met", evidence: "Built Kotlin apps at Acko", rationale: "Shipped Kotlin", contribution: 0.9 },
    { id: "r2", text: "Jetpack Compose", importance: "nice", weight: 0.3, verdict: "unknown", evidence: "", rationale: "", contribution: null },
  ],
  strengths: ["Led a Compose migration"],
  concerns: [],
  missing: ["Jetpack Compose"],
  note: null,
  knockout: null,
  override: null,
  policyVersion: "v2",
  rubricVersion: 3,
  evaluatedAt: "2026-10-12T08:50:00.000Z",
  ...over,
});

const match = (over: Partial<Match> = {}): Match => ({
  personId: "p1", fullName: "Asha Verma", headline: null, currentTitle: "Android Engineer", currentCompanyName: "Acko", city: "Bengaluru",
  linkedinUrl: null, profileImageUrl: null, yearsOfExperience: 6, source: "ours", stage: "judged", tier: "A", knockedOut: null,
  judgement: { verdicts: [{ requirementId: "r1", verdict: "met", evidence: "Built Kotlin apps at Acko" }], strengths: ["Led a Compose migration"], concerns: [] },
  ...fit(),
  ...over,
});

describe("the words for a result", () => {
  it("shows the tier and the score for a valid fit, and only then a number", () => {
    expect(stateLabel({ status: "scored", tier: "A", score: 82 })).toBe("Strong fit · 82");
    expect(stateLabel({ status: "scored", tier: "B", score: 61.4, coverage: 100 })).toBe("Good fit · 61");
    // When only part of the role could be checked the word stands alone and the line under it says what the number covers.
    expect(stateLabel({ status: "scored", tier: "B", score: 100, coverage: 56 })).toBe("Good fit");
  });

  it("says 'Needs more evidence' and 'Not scored yet' plainly, never a number", () => {
    expect(stateLabel({ status: "insufficient_evidence", tier: null, score: null })).toBe("Needs more evidence");
    expect(stateLabel({ status: "not_scored_yet", tier: null, score: null })).toBe("Not scored yet");
    expect(stateLabel({ status: "knocked_out", tier: null, score: null })).toBe("Ruled out");
  });

  it("shows the tier a recruiter set, even where the system had too little evidence", () => {
    expect(stateLabel({ status: "insufficient_evidence", tier: "B", score: null })).toBe("Good fit");
  });

  it("writes each state in a text colour, never a marker: A green, B ink, thin evidence amber, not scored muted", () => {
    expect(stateTone({ status: "scored", tier: "A" })).toBe("hired");
    expect(stateTone({ status: "scored", tier: "B" })).toBe("ink");
    expect(stateTone({ status: "insufficient_evidence", tier: null })).toBe("interviewing");
    expect(stateTone({ status: "not_scored_yet", tier: null })).toBe("muted");
    const html = renderToStaticMarkup(<FitState r={resultOf(match({ tier: "B", coverage: 100 }))!} />);
    expect(html).toContain("Good fit · 82");
    expect(html).toContain('data-st="ink"');
    expect(html).not.toMatch(/dot|pill|badge/);
  });

  it("says how much of the role was checked, and nothing for someone who was not read", () => {
    expect(coverageLine({ status: "scored", coverage: 56, score: 100 })).toBe("100 on the 56% we could check");
    expect(coverageLine({ status: "scored", coverage: 79.6 })).toBe("Checked 80% of what the role asks");
    expect(coverageLine({ status: "scored", coverage: 100, score: 90 })).toBeNull();
    expect(coverageLine({ status: "insufficient_evidence", coverage: 35 })).toBe("35% of what the role asks could be checked");
    expect(coverageLine({ status: "not_scored_yet", coverage: null })).toBeNull();
    expect(coverageLine({ status: "knocked_out", coverage: null })).toBeNull();
  });

  it("explains the line under a name without ever calling anyone unsuitable for being unscored", () => {
    const r = (o: Partial<MatchFit>) => resultOf(match({ tier: null, ...o }));
    expect(reasonLine(r({ status: "not_scored_yet", score: null }), "x")).toMatch(/says nothing about them/);
    expect(reasonLine(r({ status: "insufficient_evidence", score: null, toVerify: [{ requirementId: "r1", text: "Kotlin in production" }, { requirementId: "r2", text: "Compose" }] }), "x"))
      .toBe("Too little on the profile to say yet. Still to check: Kotlin in production and 1 more.");
    expect(reasonLine(r({ status: "scored", tier: "A" } as never), "fallback")).toBe("Led a Compose migration");
    expect(reasonLine(null, "Android Engineer at Acko")).toBe("Android Engineer at Acko");
    const overridden = resultOf(match({ override: { by: "Olivia Owner", reason: "Spoke on the phone", at: "2026-10-12T09:00:00Z", from: "A", to: "B" }, tier: "B" }))!;
    expect(reasonLine(overridden, "x")).toBe("Tier set by Olivia: Spoke on the phone");
  });

  it("reads an older server's match, which has no status, as no result at all", () => {
    expect(resultOf({ tier: "A", score: 0.9 } as never)).toBeNull();
    expect(reasonOf({ ...match(), status: undefined as never, judgement: { verdicts: [], strengths: ["Solid Go"], concerns: [] } })).toBe("Solid Go");
  });

  it("gives the provenance of a result in one line", () => {
    expect(provenanceLine(fit())).toMatch(/^Role spec v3 · scored .* · scoring v2$/);
  });
});

describe("marks for criteria the profile could not settle", () => {
  it("shows an unknown as 'Can't tell yet', not as a miss; a partial as 'Partly'", () => {
    expect(renderToStaticMarkup(<FitMark met={false} label="Compose" state="unknown" />)).toContain("Can&#x27;t tell yet: Compose");
    expect(renderToStaticMarkup(<FitMark met={false} label="Compose" state="unknown" />)).not.toContain("Does not meet");
    expect(renderToStaticMarkup(<FitMark met={false} label="Compose" state="partial" />)).toContain("Partly: Compose");
    expect(renderToStaticMarkup(<FitMark met={false} label="Compose" state="not_met" />)).toContain("Does not meet: Compose");
    const row = renderToStaticMarkup(<FitRow meets={[true, false]} checks={["met", "unknown"]} criteria={["Kotlin", "Compose"]} short={["Kotlin", "Compose"]} />);
    expect(row).toContain("1 can&#x27;t be told yet");
  });
});

describe("a candidate made from the server's match", () => {
  const criteria = [{ id: "r1", text: "Kotlin in production", short: "Kotlin" }, { id: "r2", text: "Jetpack Compose", short: "Compose" }];

  it("carries the result, takes marks from the requirement verdicts, and counts a thin result as read", () => {
    const c = candidateFromMatch(match(), { criteria, campaignId: "camp1" });
    expect(c.result).toMatchObject({ status: "scored", score: 82, coverage: 80, tier: "A" });
    expect(c.checks).toEqual(["met", "unknown"]);
    expect(c.meets).toEqual([true, false]);
    expect(c.scored).toBe(true);
    expect(c.resultCampaignId).toBe("camp1");
    const thin = candidateFromMatch(match({ status: "insufficient_evidence", score: null, tier: null }), { criteria });
    expect(thin.scored).toBe(true);
    const notYet = candidateFromMatch(match({ status: "not_scored_yet", score: null, tier: null, stage: "features", judgement: null, requirements: [] }), { criteria });
    expect(notYet.scored).toBe(false);
  });

  it("keeps the old behaviour for a match without a status", () => {
    const c = candidateFromMatch({ ...match(), status: undefined as never }, { criteria });
    expect(c.result).toBeUndefined();
    expect(c.checks).toBeUndefined();
    expect(c.scored).toBe(true);
  });

  it("leaves out someone ruled out, but lists someone whose ruling-out a recruiter overrode", () => {
    const set = setFromMatches("camp1", [match(), match({ personId: "p2", knockedOut: "Based in Pune, outside Bengaluru.", status: "knocked_out" }), match({ personId: "p3", knockedOut: null, status: "not_scored_yet" })], undefined);
    expect(set.candidates.map((c) => c.id)).toEqual(["p1", "p3"]);
  });

  it("takes the result a recruiter's change returns", () => {
    const c = candidateFromMatch(match(), { criteria });
    const changed = withResult(c, { ...fit(), tier: "B", fit: 2, override: { by: "Olivia Owner", reason: "Spoke on the phone", at: "2026-10-12T09:00:00Z", from: "A", to: "B" } });
    expect(changed.result?.tier).toBe("B");
    expect(changed.result?.override?.reason).toBe("Spoke on the phone");
    expect(changed.result?.requirements).toHaveLength(2);
  });
});

describe("the result in the profile sheet", () => {
  const c = (over: Partial<Match> = {}) => candidateFromMatch(match(over), { criteria: [], campaignId: "camp1" });

  it("shows the fit, the coverage, each requirement's verdict with its quote, and where the result came from", () => {
    const html = renderToStaticMarkup(<MatchResult c={c()} />);
    expect(html).toContain("Strong fit");
    expect(html).toContain("82 on the 80% we could check");
    expect(html).toContain("Some requirements couldn&#x27;t be checked from the profile yet.");
    expect(html).toContain("Kotlin in production");
    expect(html).toContain("Met");
    expect(html).toContain("Built Kotlin apps at Acko");
    expect(html).toContain("not checked yet");
    // No jargon about how the figure was added up.
    expect(html).not.toMatch(/counted|contribution|left out of the score/i);
    expect(html).toContain("Role spec v3");
    expect(html).toContain("Change this result");
  });

  it("lists the must-haves still to check without marking anyone down", () => {
    const html = renderToStaticMarkup(<MatchResult c={c({ status: "insufficient_evidence", score: null, tier: null, coverage: 35, toVerify: [{ requirementId: "r1", text: "Kotlin in production" }], note: "Only 35% of the requirements could be checked." })} />);
    expect(html).toContain("Needs more evidence");
    expect(html).toContain("35% of what the role asks could be checked");
    expect(html).toContain("Still to check");
    expect(html).toContain("Only 35% of the requirements could be checked.");
    // The server's own sentence is the one explanation: the generic line is not said beside it.
    expect(html).not.toContain("couldn&#x27;t be checked from the profile yet");
    expect(html).toContain("Look for more on their profile");
    expect(html).not.toMatch(/\b35\b[^%]*score/);
  });

  it("says each requirement once: a must-have still to check is not listed again against the role", () => {
    const requirements = [
      { id: "r1", text: "Kotlin in production", importance: "must" as const, weight: 0.9, verdict: "unknown" as const, evidence: "", rationale: "", contribution: null },
      { id: "r2", text: "Android SDK internals", importance: "must" as const, weight: 0.8, verdict: "unknown" as const, evidence: "", rationale: "", contribution: null },
    ];
    const toVerify = [{ requirementId: "r1", text: "Kotlin in production" }, { requirementId: "r2", text: "Android SDK internals" }];
    const none = renderToStaticMarkup(<MatchResult c={c({ status: "insufficient_evidence", score: null, tier: null, coverage: 21.3, toVerify, requirements, note: "Only 21.3% of the requirements could be checked (at least 50% is needed for a tier)." })} />);
    expect(none.match(/Kotlin in production/g)).toHaveLength(1);
    expect(none.match(/Android SDK internals/g)).toHaveLength(1);
    expect(none).toContain("Still to check");
    expect(none).not.toContain("Against the role");
    expect(none).not.toContain("not checked yet");
    // Coverage is the header's, with one sentence under it: the server's, not the generic line as well.
    expect(none).toContain("21% of what the role asks could be checked");
    expect(none).toContain("at least 50% is needed for a tier");
    expect(none).not.toContain("couldn&#x27;t be checked from the profile yet");

    // Only what is not already listed stays under "Against the role".
    const some = renderToStaticMarkup(<MatchResult c={c({
      status: "insufficient_evidence", score: null, tier: null, coverage: 40, toVerify: [toVerify[0]!], note: null,
      requirements: [requirements[0]!, { ...requirements[1]!, verdict: "met" as const, evidence: "Wrote the SDK's build layer", contribution: 0.8 }],
    })} />);
    expect(some.match(/Kotlin in production/g)).toHaveLength(1);
    expect(some).toContain("Against the role");
    expect(some).toContain("Wrote the SDK&#x27;s build layer");
    expect(some.match(/couldn&#x27;t be checked from the profile yet/g)).toHaveLength(1);
  });

  it("says a person was not read yet in words that carry no verdict", () => {
    const html = renderToStaticMarkup(<MatchResult c={c({ status: "not_scored_yet", score: null, tier: null, requirements: [] })} />);
    expect(html).toContain("Not scored yet");
    expect(html).toContain("That says nothing about how well they fit.");
    expect(html).not.toContain("Strong fit");
  });

  it("shows a ruling-out with its reason, rule and the profile's words, and a recruiter's override of it", () => {
    const knockout = { reason: "Based in Pune, outside Bengaluru.", rule: "location", evidence: "Location: Pune, India", at: "2026-10-12T08:50:00Z", override: { by: "Olivia Owner", reason: "Willing to relocate", at: "2026-10-12T09:00:00Z" } };
    const html = renderToStaticMarkup(<MatchResult c={c({ status: "knocked_out", score: null, tier: null, knockedOut: "Based in Pune, outside Bengaluru.", knockout, requirements: [] })} />);
    expect(html).toContain("Why they were ruled out");
    expect(html).toContain("Based in Pune, outside Bengaluru.");
    expect(html).toContain("Location: Pune, India");
    expect(html).toContain("Overridden by Olivia Owner: Willing to relocate");
  });

  it("shows a recruiter's own call beside what the system said", () => {
    const html = renderToStaticMarkup(<MatchResult c={c({ tier: "B", override: { by: "Olivia Owner", reason: "Spoke on the phone", at: "2026-10-12T09:00:00Z", from: "A", to: "B" } })} />);
    expect(html).toContain("Olivia Owner");
    expect(html).toContain("set this to Good fit (the system said Strong fit)");
    expect(html).toContain("Spoke on the phone");
  });

  it("shows what an earlier version of the role found, with a quiet note, until they are scored again", () => {
    const earlier = { label: "Good fit", tone: "good" as const, note: "From an earlier version of the role. Not scored on this one yet." };
    const view = c({ status: "not_scored_yet", score: null, tier: null, coverage: null, requirements: [], display: earlier });
    const html = renderToStaticMarkup(<MatchResult c={view} />);
    expect(html).toContain("Good fit");
    expect(html).toContain("From an earlier version of the role.");
    expect(html).not.toContain("Not scored yet");
    expect(renderToStaticMarkup(<FitState r={view.result!} />)).toContain("Good fit");
    // "Not scored yet" is only for no result at all.
    const none = c({ status: "not_scored_yet", score: null, tier: null, coverage: null, requirements: [], display: { label: "Not scored yet", tone: "not_scored", note: null } });
    expect(renderToStaticMarkup(<FitState r={none.result!} />)).toContain("Not scored yet");
  });

  it("says a call from an earlier version of the role still applies, and when the system's result has moved since", () => {
    const html = renderToStaticMarkup(<MatchResult c={c({ tier: "B", override: { by: "Olivia Owner", reason: "Spoke on the phone", at: "2026-10-12T09:00:00Z", from: "A", to: "B", carriedFrom: 2, systemChanged: true } })} />);
    expect(html).toContain("Override from v2 still applies.");
    expect(html).toContain("The system&#x27;s result has changed since");
    expect(html).toContain("Change this result");
  });

  it("offers no actions to a result that has no campaign to act on", () => {
    const html = renderToStaticMarkup(<MatchResult c={{ ...c(), resultCampaignId: undefined as never }} />);
    expect(html).not.toContain("Change this result");
  });

  it("reads the history in a teammate's words", () => {
    const entry = (over: object) => ({ id: "1", specVersion: 1, kind: "scored" as const, fromTier: null, toTier: null, reason: null, by: null, byName: null, snapshot: {}, at: "2026-10-12T09:00:00Z", ...over });
    expect(auditLine(entry({ snapshot: { status: "scored", tier: "A", score: 82 } }))).toBe("Scored by the system: Strong fit (82)");
    expect(auditLine(entry({ snapshot: { status: "insufficient_evidence" } }))).toBe("Read by the system: needs more evidence");
    expect(auditLine(entry({ kind: "override", byName: "Olivia Owner", fromTier: "A", toTier: "C" }))).toBe("Olivia Owner set Partial fit, replacing Strong fit");
    expect(auditLine(entry({ kind: "override_cleared", byName: "Olivia Owner" }))).toBe("Olivia Owner went back to the system's result");
  });
});

describe("comparing people from the server's results", () => {
  const rated = (id: string, name: string) => ({ id, name, totalYears: 6, avgTenure: 2 });
  const view = (over: Partial<MatchFit> & { tier: "A" | "B" | "C" | null }) => resultOf({ ...fit(), ...over } as never)!;
  const source = (results: Record<string, ReturnType<typeof view>>) => ({ name: "Android", criteria: ["Kotlin"], meets: {}, evidence: {}, results });

  it("leads by the tier in force and then the score, and says who has no result to compare", () => {
    const v = compareVerdict(
      [rated("a", "Asha Verma"), rated("b", "Ravi Rao"), rated("c", "Meera Das")],
      source({ a: view({ tier: "A", score: 90 }), b: view({ tier: "B", score: 70 }), c: view({ tier: null, status: "insufficient_evidence", score: null }) }),
    );
    expect(v.leadId).toBe("a");
    expect(v.line).toContain("Asha Verma: Strong fit leads.");
    expect(v.line).toContain("Meera Das needs more evidence.");
  });

  it("names no lead when fewer than two people have a result, or when they are level", () => {
    expect(compareVerdict([rated("a", "Asha Verma"), rated("b", "Ravi Rao")], source({ a: view({ tier: "A", score: 90 }), b: view({ tier: null, status: "not_scored_yet", score: null }) })).leadId).toBeNull();
    const level = compareVerdict([rated("a", "Asha Verma"), rated("b", "Ravi Rao")], source({ a: view({ tier: "A", score: 90 }), b: view({ tier: "A", score: 90 }) }));
    expect(level.leadId).toBeNull();
    expect(level.line).toContain("are level on the result");
  });
});

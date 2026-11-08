import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Match, MatchFit } from "../api/agent";
import { verdictParts } from "../CompareDialog";
import { candidateFromMatch, glanceOf } from "../liveCandidate";
import { MatchResult } from "../MatchResult";
import { CandidateCard, requirementLabel, Results } from "../Sourcing";

/**
 * The person card in the chat reads like a short profile (who, where they work and worked, where they studied, a few
 * skills, one line on why), the chat shows five and scrolls through the rest, and the AI's read is short: a checklist
 * with the evidence a press away, the key points capped, and a comparison that leads with one sentence.
 */

const fit = (over: Partial<MatchFit> = {}): MatchFit => ({
  score: 82, coverage: 100, status: "scored", fit: 3, toVerify: [],
  requirements: [
    { id: "r1", text: "Kotlin in production", importance: "must", weight: 0.9, verdict: "met", evidence: "Built Kotlin apps at Acko", rationale: "Shipped Kotlin", contribution: 0.9 },
    { id: "r2", text: "Jetpack Compose", importance: "nice", weight: 0.3, verdict: "not_met", evidence: "", rationale: "", contribution: null },
  ],
  strengths: ["Led a Compose migration", "Ships weekly", "Mentors juniors"],
  concerns: ["Short stints"],
  missing: [],
  note: null, knockout: null, override: null, policyVersion: "v2", rubricVersion: 3, evaluatedAt: "2026-10-12T08:50:00.000Z",
  ...over,
});

const match = (n: number, over: Partial<Match> = {}): Match => ({
  personId: `p${n}`, fullName: `Person ${n}`, headline: null, currentTitle: "Android Engineer", currentCompanyName: "Acko", city: "Bengaluru",
  linkedinUrl: "https://www.linkedin.com/in/someone", profileImageUrl: null, yearsOfExperience: 6, source: "ours", stage: "judged", tier: "A",
  knockedOut: null, judgement: null,
  glance: {
    jobs: [{ title: "Android Engineer", company: "Acko", current: true }, { title: "SDE 1", company: "Swiggy", current: false }],
    schools: [{ school: "IIT Bombay", degree: "B.Tech", field: "Computer Science" }],
    skills: ["Kotlin", "Compose", "Coroutines", "Gradle", "Room"],
    skillCount: 17,
  },
  openToWork: true,
  ...fit(),
  ...over,
});

const noop = () => {};

describe("the person card in the chat", () => {
  it("lays the profile out on the left and the AI's read on the right, in fixed sections", () => {
    const c = candidateFromMatch(match(1, { concerns: ["Short stints at two startups"] }), { campaignId: "camp1" });
    const html = renderToStaticMarkup(<CandidateCard c={c} onVerdict={noop} onOpen={noop} reason="Kotlin at scale" criteria={["Based in or willing to relocate to Bengaluru", "Kotlin in production"]} short={[]} />);
    // left: the profile
    expect(html).toContain("6 yrs experience");
    expect(html).toContain("Android Engineer @ Acko");
    expect(html).toContain("Open to work");
    expect(html).toContain("Experience");
    expect(html).toContain("SDE 1");
    expect(html).toContain("Swiggy");
    expect(html).toContain("Education");
    expect(html).toContain("IIT Bombay");
    expect(html).toContain("B.Tech, Computer Science");
    expect(html).toContain("+13");
    expect(html).toContain("on LinkedIn");
    // right: Fit, Why, Requirements, Watch out, in that order, then the decisions in words
    const at = (t: string) => html.indexOf(t);
    expect(at(">Fit<")).toBeLessThan(at(">Why<"));
    expect(at(">Why<")).toBeLessThan(at("Requirements"));
    expect(at("Requirements")).toBeLessThan(at(">Watch out<"));
    expect(html).toContain("Kotlin at scale");
    expect(html).toContain("Short stints at two startups");
    expect(html).toContain('title="Based in or willing to relocate to Bengaluru"');
    expect(html).toContain(">Shortlist<");
    expect(html).toContain(">Reject<");
    // The rest of the judge's points are in the profile, not on the card.
    expect(html).not.toContain("Led a Compose migration");
  });

  it("leaves out what the profile does not have, instead of drawing empty rows", () => {
    const c = candidateFromMatch(match(1, { glance: { jobs: [], schools: [], skills: [], skillCount: 0 }, linkedinUrl: null, concerns: [] }), {});
    const html = renderToStaticMarkup(<CandidateCard c={c} onVerdict={noop} onOpen={noop} reason="" criteria={[]} short={[]} />);
    expect(html).not.toContain("Education");
    expect(html).not.toContain("src-card-skills");
    expect(html).not.toContain("on LinkedIn");
    expect(html).not.toContain("Watch out");
  });

  it("names each requirement in a few whole words", () => {
    expect(requirementLabel("Based in or willing to relocate to Bengaluru")).toBe("Bengaluru");
    expect(requirementLabel("4+ years of hands-on DevOps, SRE or platform engineering")).toBe("4+ yrs DevOps");
    expect(requirementLabel("Strong working knowledge of AWS infrastructure")).toBe("AWS");
    expect(requirementLabel("Kotlin in production")).toBe("Kotlin");
    expect(requirementLabel("cold calling")).toBe("cold calling");
    expect(requirementLabel("5 to 8 years of backend engineering experience")).toBe("5–8 yrs backend");
    expect(requirementLabel("3-5 years experience")).toBe("3–5 yrs");
  });

  it("cleans the server's read: empty names dropped, a degree and its field said once", () => {
    expect(glanceOf({ jobs: [{ title: " ", company: null, current: false }], schools: [{ school: "NIT", degree: null, field: "ECE" }], skills: ["", "Go"], skillCount: 1 }))
      .toEqual({ jobs: [], schools: [{ school: "NIT", degree: "ECE" }], skills: ["Go"], skillCount: 1 });
  });

  it("shows five in a box of its own that loads the rest as it is scrolled, with a way to view all", () => {
    const people = Array.from({ length: 12 }, (_, i) => candidateFromMatch(match(i + 1), {}));
    const data = { candidates: people.slice(0, 5), pool: people, reasons: {}, criteria: [], short: [], title: "Top matches", count: "", sub: null, all: "See all" };
    const html = renderToStaticMarkup(<Results verdicts={{}} onVerdict={noop} onOpenProfile={noop} onOpenList={noop} data={data} />);
    expect((html.match(/<article class="src-card/g) ?? []).length).toBe(5);
    expect(html).toContain("src-scroll");
    expect(html).toContain("7 more below");
    const few = renderToStaticMarkup(<Results verdicts={{}} onVerdict={noop} onOpenProfile={noop} onOpenList={noop} data={{ ...data, pool: people.slice(0, 4), candidates: people.slice(0, 4) }} />);
    expect(few).toContain("src-scroll");
    expect(few).not.toContain("more below");
    expect(html).toContain("See all");
  });
});

describe("the AI's read, kept short", () => {
  it("lists each requirement on one line with its verdict, the quote a press away, and caps the key points", () => {
    const c = candidateFromMatch(match(1), { campaignId: "camp1" });
    const html = renderToStaticMarkup(<MatchResult c={c} />);
    expect(html).toContain("1 of 2 met");
    expect(html).toContain("Must have");
    // The quote is in the page for whoever opens it, folded until then.
    expect(html).toMatch(/<div class="mr-req-d" hidden="">/);
    expect(html).toContain("Built Kotlin apps at Acko");
    expect(html).toContain("Led a Compose migration");
    expect(html).not.toContain("Mentors juniors");
    expect(html).toContain("1 more");
  });

  it("leads a comparison with one sentence and puts the rest as short points", () => {
    expect(verdictParts("Asha meets 3 of 3 criteria with 6 years. Meera misses Kotlin; Ravi misses Compose."))
      .toEqual({ head: "Asha meets 3 of 3 criteria with 6 years.", points: ["Meera misses Kotlin", "Ravi misses Compose"] });
    expect(verdictParts("Level on everything.")).toEqual({ head: "Level on everything.", points: [] });
  });
});

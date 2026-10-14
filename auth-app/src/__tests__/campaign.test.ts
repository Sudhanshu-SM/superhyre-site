import { describe, expect, it } from "vitest";
import { ME, STAGES, callsFor, formsFor, funnelReached, pipelineFor, responsesFor } from "../campaign";
import { CAMPAIGN_ROWS } from "../campaignsData";

describe("campaign pipeline", () => {
  it("columns add up to the campaign's own funnel", () => {
    const row = CAMPAIGN_ROWS.find((r) => r.id === "backend-snr")!;
    const people = pipelineFor("backend-snr");
    const n = (s: string) => people.filter((p) => p.stage === s).length;
    expect(n("shortlisted")).toBe(row.funnel.shortlisted);
    expect(n("hired")).toBe(row.funnel.hired);
    expect(n("interviewing")).toBe(row.funnel.interviews);
  });
  it("is stable across loads and unique per person", () => {
    const a = pipelineFor("platform-sre").map((p) => p.name);
    expect(pipelineFor("platform-sre").map((p) => p.name)).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });
  it("pins the backend-snr funnel and its people, so engine or load-order drift fails here", () => {
    const f = funnelReached("backend-snr");
    expect([f.found, f.shortlisted, f.outreach, f.replied, f.interviewing, f.hired, f.target]).toEqual([214, 57, 44, 11, 5, 1, 3]);
    expect([f.passed, f.waiting, f.repliesToAnswer, f.offerOut]).toEqual([10, 23, 6, 1]);
    const people = pipelineFor("backend-snr");
    expect(people.find((p) => p.step === "offer")?.name).toBe("Ritika Banerjee");
    expect(people.find((p) => p.stage === "hired")?.name).toBe("Aarav Hegde");
  });
  it("a draft campaign starts empty", () => {
    expect(pipelineFor("fin-controller")).toHaveLength(0);
    expect(formsFor("fin-controller")).toHaveLength(0);
  });
  it("every person sits in a known stage", () => {
    const ids: string[] = [...STAGES.map((s) => s.id), "passed"];
    expect(pipelineFor("backend-snr").every((p) => ids.includes(p.stage))).toBe(true);
  });
});

describe("forms and calls", () => {
  it("flags a response exactly when a knockout answer is given", () => {
    const form = formsFor("backend-snr")[0]!;
    const knock = form.questions.filter((q) => q.knockout);
    for (const r of responsesFor(form)) {
      const hit = knock.some((q) => r.answers[q.id] === q.knockout);
      expect(r.flagged).toBe(hit);
    }
  });
  it("an unsent form has no responses", () => {
    const form = formsFor("backend-snr")[0]!;
    expect(responsesFor({ ...form, id: `${form.id}-unsent`, sent: 0 })).toEqual([]);
  });
  it("calls belong to people in the campaign and include the signed-in recruiter's", () => {
    const calls = callsFor("backend-snr");
    const ids = new Set(pipelineFor("backend-snr").map((p) => p.id));
    expect(calls.every((c) => ids.has(c.person.id))).toBe(true);
    expect(calls.some((c) => c.by === ME)).toBe(true);
  });
});

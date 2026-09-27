import { describe, expect, it } from "vitest";
import { questionFor } from "../clarify";
import type { MomentCtx } from "../moments";
import { classify } from "../moments";

const ctx = (verdicts: Record<string, "shortlisted" | "rejected"> = {}): MomentCtx => ({
  said: "", verdicts, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {},
});

describe("classify, round two", () => {
  it.each([
    ["Show me the campaign numbers", "campaign"],
    ["How is the backend campaign doing?", "campaign"],
    ["How are all my agents doing?", "status"],
    ["Deploy a screening agent on Senior Backend Engineers that books calls", "assign"],
  ])("%s → %s", (said, kind) => expect(classify(said)).toBe(kind));
});

describe("questionFor", () => {
  it("asks which campaign when both people are in two", () => {
    const q = questionFor("compare", "Compare Priya and Anika", ctx());
    expect(q?.id).toBe("compare-campaign");
    expect(q?.options.map((o) => o.id)).toEqual(["backend-snr", "platform-sre"]);
    expect(q?.apply(["platform-sre"]).said).toMatch(/Platform SRE/);
  });
  it("does not ask when the campaign is named", () => {
    expect(questionFor("compare", "Compare Priya and Anika for platform SRE", ctx())).toBeNull();
  });
  it("does not ask when only one campaign is shared", () => {
    expect(questionFor("compare", "Compare Priya and Rohan", ctx())).toBeNull();
  });
  it("asks who, as a multi-pick, when nobody is named or shortlisted", () => {
    const q = questionFor("compare", "compare candidates", ctx());
    expect(q?.id).toBe("compare-who");
    expect(q?.multi?.min).toBe(2);
  });
  it("uses the shortlist instead of asking who", () => {
    const q = questionFor("compare", "compare them", ctx({ "rohan-mehta": "shortlisted", "sneha-kulkarni": "shortlisted" }));
    expect(q).toBeNull();
  });
  it("asks which outreach agent, with an all option", () => {
    const q = questionFor("status", "How is outreach going?", ctx());
    expect(q?.options.at(-1)?.id).toBe("all");
    expect(questionFor("status", q!.apply(["all"]).said!, ctx())).toBeNull();
  });
  it("asks who to reach when nothing is shortlisted, and not otherwise", () => {
    expect(questionFor("outreach", "reach out", ctx())?.id).toBe("outreach-who");
    expect(questionFor("outreach", "reach out", ctx({ "priya-nair": "shortlisted" }))).toBeNull();
  });
  it("offers remembering only where an answer generalises", () => {
    expect(questionFor("compare", "Compare Priya and Anika", ctx())?.remember).toBe("compare.campaign");
    expect(questionFor("outreach", "reach out", ctx())?.remember).toBeUndefined();
  });
});

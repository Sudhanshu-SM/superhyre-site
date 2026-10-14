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

describe("the form flow", () => {
  const withAnswers = (answers: Record<string, string>, campaign?: { id: string; name: string }) =>
    ({ ...ctx(), answers, campaign: campaign ?? null });

  it("asks which campaign first when none is named", () => {
    const said = "make a screening form";
    expect(classify(said)).toBe("form");
    const q = questionFor("form", said, ctx());
    expect(q?.id).toBe("form-campaign");
    expect(q?.preset).toBeUndefined();
    expect(q?.options.at(-1)?.id).toBe("new");
    expect(q?.options.some((o) => o.id === "gtm-ae")).toBe(false);
  });

  it("then asks the role kind, the sub-type and the ideal hire", () => {
    const said = "make a screening form";
    const a: Record<string, string> = { campaign: "backend-snr" };
    const q1 = questionFor("form", said, withAnswers(a));
    expect(q1?.id).toBe("form-family");
    expect(q1?.options[0]?.id).toBe("engineering");
    Object.assign(a, q1!.apply(["engineering"]).answers);
    const q2 = questionFor("form", said, withAnswers(a));
    expect(q2?.id).toBe("form-sub");
    Object.assign(a, q2!.apply(["backend"]).answers);
    const q3 = questionFor("form", said, withAnswers(a));
    expect(q3?.id).toBe("form-ideal");
    expect(q3?.input?.optional).toBe(true);
    expect(q3?.options).toEqual([]);
    Object.assign(a, q3!.apply([""]).answers);
    expect(questionFor("form", said, withAnswers(a))).toBeNull();
  });

  it("presets the campaign the recruiter has open", () => {
    const q = questionFor("form", "make a screening form", withAnswers({}, { id: "design-lead", name: "Design Lead" }));
    expect(q?.id).toBe("form-campaign");
    expect(q?.preset).toBe("design-lead");
    expect(q?.options[0]?.id).toBe("design-lead");
    expect(q?.options[0]?.meta).toMatch(/^Current, /);
  });

  it("skips the campaign question when the message names one", () => {
    expect(questionFor("form", "make a form for Platform SRE", ctx())?.id).toBe("form-family");
  });

  it("asks for the role in words, never the sub-type, for something else", () => {
    const said = "make a screening form";
    const q = questionFor("form", said, withAnswers({ campaign: "backend-snr", family: "other" }));
    expect(q?.id).toBe("form-role");
    expect(q?.input).toBeDefined();
    const next = questionFor("form", said, withAnswers({ campaign: "backend-snr", family: "other", roleText: "Firmware engineer" }));
    expect(next?.id).toBe("form-ideal");
  });

  it("asks a new campaign's name before anything else", () => {
    const q = questionFor("form", "make a screening form", withAnswers({ campaign: "new" }));
    expect(q?.id).toBe("form-new-name");
    expect(q?.apply(["Staff Data Engineer"]).answers).toEqual({ newName: "Staff Data Engineer" });
  });
});

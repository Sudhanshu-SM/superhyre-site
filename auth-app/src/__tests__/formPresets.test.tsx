import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TurnContext, clearThread, saveTrail } from "../agentThread";
import type { Question } from "../clarify";
import { Clarified, autoAnswer } from "../Clarify";
import { inferFamily, inferSub } from "../formKit";
import type { RoleFacts } from "../formKit";
import type { RoleRead } from "../liveViews/roleFacts";
import type { MomentCtx } from "../moments";

/**
 * The form flow, for a campaign that already says what it is: the kind of role, the stack and the
 * ideal hire are answered from what the campaign holds and shown as a line that can be changed, never
 * asked. Only what the campaign leaves open is a question.
 */

const roles = new Map<string, RoleRead>();
vi.mock("../liveViews/roleFacts", () => ({
  warmRole: () => {},
  peekRole: (id: string): RoleRead => roles.get(id) ?? { state: "loading" },
  useRole: (id: string | null): RoleRead => (id ? roles.get(id) ?? { state: "loading" } : { state: "loading" }),
  useRoleVersion: () => 0,
}));

const { formAsk, tuneQuestion } = await import("../liveViews/formAsk");

const facts = (over: Partial<RoleFacts> = {}): RoleFacts => ({
  title: "Software Engineer", musts: [{ text: "Go", skill: true }, { text: "Postgres", skill: true }], nice: [], ...over,
});
const ready = (f: RoleFacts | null, source: "spec" | "setup" | "none" = "spec"): RoleRead => ({ state: "ready", facts: f, source });
const row = (id: string, name: string, department: string) => ({ id, name, department, location: "Bengaluru", status: "active" as const });

const ctx = (answers: Record<string, string> = {}): MomentCtx => ({
  said: "Create a screening form", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {}, prefs: {}, setPref: () => {}, answers,
});

beforeEach(() => { roles.clear(); clearThread(); });

describe("what a campaign's name and department say about the role", () => {
  it("reads the kind of role from the department, and from the title when the department says nothing", () => {
    expect(inferFamily("Engineering", "Account Executive")).toBe("engineering");
    expect(inferFamily("Go to market", "Whatever")).toBe("sales");
    expect(inferFamily("Operations", "Software Engineer")).toBe("engineering");
    expect(inferFamily(undefined, "Senior Account Executive")).toBe("sales");
    expect(inferFamily("Product", "Product Designer")).toBe("design");
    // Not technical, sales or design: the generic role, which is an answer, not a question.
    expect(inferFamily("Operations", "Office Manager")).toBe("other");
    expect(inferFamily("Operations")).toBe("other");
    // Nothing at all to go on.
    expect(inferFamily(undefined)).toBeNull();
    expect(inferFamily("Skunkworks", "")).toBeNull();
  });

  it("places the departments and titles a recruiter actually has, not only Engineering, Data, Design and Go to market", () => {
    // Technical departments, by name.
    for (const dept of ["Analytics", "Business Intelligence", "BI", "Data Science", "IT", "Technology", "DevOps", "Platform", "Security", "QA", "Mobile", "ML", "Data & Analytics"]) {
      expect(inferFamily(dept), dept).toBe("engineering");
    }
    // Sales and the neighbours of sales.
    for (const dept of ["Sales", "Revenue", "Customer Success", "Business Development", "Partnerships", "Account Management"]) {
      expect(inferFamily(dept), dept).toBe("sales");
    }
    expect(inferFamily("Creative")).toBe("design");
    // Everything else the business has is the generic role.
    for (const dept of ["Marketing", "HR", "People", "Finance", "Legal", "Operations", "Customer Support", "Admin"]) {
      expect(inferFamily(dept), dept).toBe("other");
    }
    // A department that holds every kind of role says nothing; the title does.
    expect(inferFamily("Product", "Product Manager")).toBe("other");
    expect(inferFamily("Product", "Staff Engineer")).toBe("engineering");
    expect(inferFamily("Marketing", "Data Analyst")).toBe("engineering");
    expect(inferFamily("Marketing", "Content Marketing Manager")).toBe("other");
  });

  it("reads titles with no department behind them", () => {
    const want: Array<[string, string]> = [
      ["Data Analyst", "engineering"], ["BI Analyst", "engineering"], ["Analytics Engineer", "engineering"], ["Machine Learning Engineer", "engineering"],
      ["ML Engineer", "engineering"], ["DevOps Engineer", "engineering"], ["Site Reliability Engineer", "engineering"], ["QA Engineer", "engineering"],
      ["Security Engineer", "engineering"], ["Mobile Developer", "engineering"], ["Robotics Engineer", "engineering"], ["Cloud Operations Engineer", "engineering"],
      ["Account Executive", "sales"], ["Inside Sales Representative", "sales"], ["Customer Success Manager", "sales"], ["Solutions Engineer", "sales"],
      ["Sales Development Representative", "sales"], ["Partnerships Lead", "sales"],
      ["Product Designer", "design"], ["UX Researcher", "design"], ["Brand Designer", "design"],
      ["Product Manager, Data Platform", "other"], ["Marketing Manager", "other"], ["HR Business Partner", "other"], ["Financial Analyst", "other"],
      ["Legal Counsel", "other"], ["Customer Support Engineer", "other"], ["Operations Manager", "other"], ["Technical Recruiter", "other"],
      ["Data Entry Operator", "other"], ["Technical Program Manager", "other"],
    ];
    for (const [title, family] of want) expect(inferFamily(undefined, title), title).toBe(family);
    expect(inferFamily(undefined, "Wizard of Whimsy")).toBeNull();
  });

  it("reads the stack from the title, and says nothing when the title names none", () => {
    expect(inferSub("engineering", "Senior Backend Engineer")).toBe("backend");
    expect(inferSub("engineering", "Frontend Developer")).toBe("frontend");
    expect(inferSub("engineering", "Full Stack Engineer")).toBe("fullstack");
    expect(inferSub("engineering", "Software Engineer")).toBe("fullstack");
    expect(inferSub("engineering", "Android Engineer")).toBe("other");
    expect(inferSub("engineering", "Staff Engineer")).toBeNull();
    expect(inferSub("sales", "Account Executive")).toBe("ae");
    expect(inferSub("design", "Brand Designer")).toBe("brand");
    expect(inferSub("other", "Software Engineer")).toBeNull();
  });

  it("presets a stack only when a title clearly names it: a plain 'software engineer' is full-stack, a qualified one is not", () => {
    expect(inferSub("engineering", "Senior Software Engineer II")).toBe("fullstack");
    expect(inferSub("engineering", "SDE 2")).toBe("fullstack");
    expect(inferSub("engineering", "Robotics Software Engineer")).toBe("other");
    expect(inferSub("engineering", "Robotics Engineer")).toBe("other");
    expect(inferSub("engineering", "Software Engineer, Payments")).toBeNull();
    expect(inferSub("engineering", "Software Engineer (Python)")).toBeNull();
    expect(inferSub("engineering", "Data Analyst")).toBe("other");
    expect(inferSub("engineering", "Security Engineer")).toBe("other");
    expect(inferSub("engineering", "Cloud Engineer")).toBe("backend");
  });

  it("reads each title on its own: a named stack beats a plain 'software engineer', and two named stacks cancel", () => {
    // The spec's title says "Software Engineer"; the campaign's name is the more specific.
    expect(inferSub("engineering", "Software Engineer", "Robotics Engineer")).toBe("other");
    expect(inferSub("engineering", "Software Engineer", "Senior Backend Engineer")).toBe("backend");
    expect(inferSub("engineering", "Frontend Engineer", "Backend Engineer")).toBeNull();
    expect(inferSub("engineering", "Software Engineer", "Staff Engineer")).toBe("fullstack");
  });
});

describe("the form questions for a campaign that says what it is", () => {
  const rows = [row("se", "Software Engineer", "Engineering"), row("ops", "Office Manager", "Operations")];
  const said = "Create a screening form";

  it("answers the kind of role, the stack and the ideal hire from the campaign, and asks nothing more", () => {
    roles.set("se", ready(facts()));
    const ask = formAsk({ campaignId: "se" }, rows);

    const family = ask("form", said, ctx())!;
    expect(family).toMatchObject({ id: "form-family", preset: "engineering", presetNote: "from the campaign" });
    const stack = ask("form", said, ctx({ family: "engineering" }))!;
    expect(stack).toMatchObject({ id: "form-sub", preset: "fullstack", presetNote: "from the role" });
    const ideal = ask("form", said, ctx({ family: "engineering", sub: "fullstack" }))!;
    expect(ideal).toMatchObject({ id: "form-ideal", preset: "" });
    expect(ideal.input?.skipped).toBe("Using the requirements' must-haves");
    expect(ideal.why).toContain("Go and Postgres");
    expect(ask("form", said, ctx({ family: "engineering", sub: "fullstack", ideal: "" }))).toBeNull();
  });

  it("never asks the kind of role of a campaign that has a title: the generic role, named from the campaign", () => {
    roles.set("ops", ready(null, "none"));
    const ask = formAsk({ campaignId: "ops" }, rows);
    expect(ask("form", said, ctx())).toMatchObject({ id: "form-family", preset: "other", presetNote: "from the campaign" });
    // The next question is the role's name, answered from the campaign too; it is a line to change, not a question.
    expect(ask("form", said, ctx({ family: "other" }))).toMatchObject({ id: "form-role", preset: "Office Manager", presetNote: "from the campaign" });
    // Nothing the campaign says places "Skunkworks", and it still is not asked.
    roles.set("sk", ready(facts({ title: "Wizard of Whimsy", musts: [] }), "none"));
    const odd = formAsk({ campaignId: "sk" }, [row("sk", "Wizard of Whimsy", "Skunkworks")]);
    expect(odd("form", said, ctx())).toMatchObject({ id: "form-family", preset: "other" });
    expect(odd("form", said, ctx({ family: "other" }))).toMatchObject({ id: "form-ideal" });
  });

  it("places a Data Analyst campaign in Analytics as data engineering work, with no kind-of-role question", () => {
    roles.set("da", ready(facts({ title: "Data Analyst", musts: [{ text: "SQL", skill: true }] }), "spec"));
    const ask = formAsk({ campaignId: "da" }, [row("da", "Data Analyst", "Analytics")]);
    expect(ask("form", said, ctx())).toMatchObject({ id: "form-family", preset: "engineering", presetNote: "from the campaign" });
    // A data analyst's stack is "something else", named by the title; the role's name comes from the spec, so no question.
    expect(ask("form", said, ctx({ family: "engineering" }))).toMatchObject({ id: "form-sub", preset: "other", presetNote: "from the role" });
    expect(ask("form", said, ctx({ family: "engineering", sub: "other" }))).toMatchObject({ id: "form-ideal", preset: "" });
  });

  it("does not preset a stack the title doesn't support: a robotics role is not 'Full-stack, from the role'", () => {
    // The spec's own title is the plain one; the campaign is named for what it is.
    roles.set("rb", ready(facts({ title: "Software Engineer", musts: [] }), "none"));
    const robotics = formAsk({ campaignId: "rb" }, [row("rb", "Robotics Engineer", "Engineering")]);
    const stack = robotics("form", said, ctx({ family: "engineering" }))!;
    expect(stack.id).toBe("form-sub");
    expect(stack.preset).not.toBe("fullstack");
    // And a title that names nothing is asked normally, never guessed.
    roles.set("pay", ready(facts({ title: "Software Engineer, Payments", musts: [] }), "none"));
    const payments = formAsk({ campaignId: "pay" }, [row("pay", "Software Engineer, Payments", "Engineering")]);
    const asked = payments("form", said, ctx({ family: "engineering" }))!;
    expect(asked.id).toBe("form-sub");
    expect(asked.preset).toBeUndefined();
  });

  it("asks the stack when the title doesn't name it, and the ideal hire when the campaign has no must-haves", () => {
    roles.set("staff", ready(facts({ title: "Staff Engineer", musts: [] }), "none"));
    const ask = formAsk({ campaignId: "staff" }, [row("staff", "Staff Engineer", "Engineering")]);
    expect(ask("form", said, ctx())).toMatchObject({ id: "form-family", preset: "engineering" });
    const stack = ask("form", said, ctx({ family: "engineering" }))!;
    expect(stack.id).toBe("form-sub");
    expect(stack.preset).toBeUndefined();
    const ideal = ask("form", said, ctx({ family: "engineering", sub: "backend" }))!;
    expect(ideal.id).toBe("form-ideal");
    expect(ideal.preset).toBeUndefined();
  });

  it("says where the must-haves came from when it is the campaign's own", () => {
    const q = { id: "form-ideal", found: "x", ask: "y", options: [], input: { placeholder: "", verb: "Go", optional: true }, apply: () => ({}) } as Question;
    const tuned = tuneQuestion(q, facts(), "Software Engineer", { source: "setup" });
    expect(tuned.input?.skipped).toBe("Using the campaign's must-haves");
    expect(tuned.presetNote).toBe("from the campaign");
  });

  it("names the role from the campaign instead of asking for it when it is something else", () => {
    const q = { id: "form-role", found: "x", ask: "y", options: [], input: { placeholder: "", verb: "Go" }, apply: () => ({}) } as Question;
    expect(tuneQuestion(q, null, "Senior Support Leads")).toMatchObject({ preset: "Senior Support Lead", presetNote: "from the campaign" });
  });

  it("asks nothing while the role is still being read: the draft says it is reading the spec", () => {
    expect(formAsk({ campaignId: "se" }, rows)("form", said, ctx())).toBeNull();
  });
});

describe("an answer that needs no asking", () => {
  const tiles: Question = {
    id: "form-family", found: "", ask: "", apply: () => ({}), preset: "sales",
    options: [{ id: "engineering", label: "Engineering" }, { id: "sales", label: "Sales / GTM" }],
  };
  const typed: Question = {
    id: "form-ideal", found: "", ask: "", options: [], preset: "", apply: () => ({}), input: { placeholder: "", verb: "Go", optional: true },
  };

  it("takes a tile's preset by its option, and a typed answer's preset as its text, empty included", () => {
    expect(autoAnswer(tiles, {}, new Set())).toEqual({ id: "sales", label: "Sales / GTM", how: "preset" });
    expect(autoAnswer(typed, {}, new Set())).toEqual({ id: "", label: "", how: "preset" });
  });

  it("asks normally once the recruiter has changed it, and never presets an option that isn't there", () => {
    expect(autoAnswer(tiles, {}, new Set(["form-family"]))).toBeNull();
    expect(autoAnswer(typed, {}, new Set(["form-ideal"]))).toBeNull();
    expect(autoAnswer({ ...tiles, preset: "design" }, {}, new Set())).toBeNull();
    expect(autoAnswer(null, {}, new Set())).toBeNull();
  });

  it("prefers what was remembered earlier in the session", () => {
    expect(autoAnswer({ ...tiles, remember: "form.family" }, { "form.family": "engineering" }, new Set())).toMatchObject({ id: "engineering", how: "remember" });
  });
});

describe("a card that comes back after the form was answered", () => {
  const rows = [row("se", "Software Engineer", "Engineering"), row("staff", "Staff Engineer", "Engineering")];
  const render = (campaignId: string, saved: Parameters<typeof saveTrail>[1]) => {
    const turn = { id: `turn-1#view:form:${campaignId}:`, restored: true };
    saveTrail(turn.id, saved);
    const ask = formAsk({ campaignId }, rows);
    return renderToStaticMarkup(
      <TurnContext.Provider value={turn}>
        <Clarified kind="form" ctx={ctx()} ask={ask}>{() => <p>THE FORM</p>}</Clarified>
      </TurnContext.Provider>,
    );
  };

  it("replays every answer, says where each came from, and goes straight on to the form", () => {
    roles.set("se", ready(facts()));
    const html = render("se", [
      { qid: "form-family", ids: ["engineering"], auto: "preset" },
      { qid: "form-sub", ids: ["fullstack"], auto: "preset" },
      { qid: "form-ideal", ids: [""], auto: "preset" },
    ]);
    expect(html).toContain("Kind of role");
    expect(html).toContain("Engineering");
    expect(html).toContain("from the campaign");
    expect(html).toContain("Full-stack");
    expect(html).toContain("Using the requirements&#x27; must-haves");
    expect(html).toContain("THE FORM");
    expect(html).not.toContain("What kind of role is it?");
    expect(html).not.toContain("Which part of the stack?");
  });

  it("asks only what was still open, never what was answered", () => {
    roles.set("staff", ready(facts({ title: "Staff Engineer", musts: [] }), "none"));
    const html = render("staff", [{ qid: "form-family", ids: ["engineering"], auto: "preset" }]);
    expect(html).toContain("Kind of role");
    expect(html).toContain("Which part of the stack?");
    expect(html).not.toContain("What kind of role is it?");
    expect(html).not.toContain("THE FORM");
  });
});

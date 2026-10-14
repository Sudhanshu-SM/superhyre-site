import { describe, expect, it } from "vitest";
import type { ApiBoardRow } from "../api/campaigns";
import type { Thread } from "../api/outreach";
import { mustHaveOf, mustHaves } from "../campaign";
import type { Form } from "../campaign";
import type { RoleFacts } from "../formKit";
import { draftForm, noticeAccepted, noticeDays, roleFactsFrom } from "../formKit";
import { tuneQuestion } from "../liveViews/formAsk";
import {
  answeredLine, defaultOpen, inView, orderForms, responseLine, shortDate, stageWords, standingOf, stateLine, totalsLine,
} from "../liveViews/formStatus";
import { composeFirstEmail, namesLine, scopeLine, scopeOf, threadsInScope, unreachedOf } from "../liveViews/outreachScope";
import type { Question } from "../clarify";

/* ── outreach: who a run is for ── */

const row = (id: string, stage: ApiBoardRow["stage"], over: Partial<ApiBoardRow> = {}): ApiBoardRow => ({
  campaignCandidateId: `cc-${id}`, candidateId: `c-${id}`, personId: `p-${id}`, fullName: `Person ${id}`, currentTitle: "Android Engineer",
  currentCompanyName: "PhonePe", city: "Bengaluru", linkedinUrl: null, stage, step: null, ownerId: null, source: "agent", fit: null, tier: null,
  addedAt: "2026-10-01T00:00:00Z", yearsOfExperience: 4, skills: [], daysInStage: 1, lastActivityAt: "2026-10-01T00:00:00Z", hasEmail: true,
  hasPhone: false, ...over,
});

const board = [
  row("a", "shortlisted"), row("b", "shortlisted", { hasEmail: false }), row("c", "outreach"), row("d", "interviewing"),
  row("e", "passed"), row("f", "hired"),
];

describe("who an outreach run is for", () => {
  it("is the shortlist, and those already in outreach, when the agent named nobody", () => {
    const s = scopeOf(board);
    expect(s.basis).toBe("shortlist");
    expect(s.people.map((p) => p.candidateId)).toEqual(["c-a", "c-b", "c-c"]);
    expect(s).toMatchObject({ missing: 0, fellBack: false });
  });

  it("is the people the agent named, by candidate or by person id, never someone passed on", () => {
    const s = scopeOf(board, { candidateIds: ["c-a"], personIds: ["p-d", "p-e"] });
    expect(s.basis).toBe("named");
    expect(s.people.map((p) => p.candidateId)).toEqual(["c-a", "c-d"]);
    /* The passed person was named and is on the campaign, but is not written to: counted as left out. */
    expect(s.missing).toBe(1);
  });

  it("counts named people who are not on the campaign, and falls back to the shortlist when none are", () => {
    const some = scopeOf(board, { candidateIds: ["c-a", "c-zzz"], personIds: [] });
    expect(some).toMatchObject({ basis: "named", missing: 1, fellBack: false });
    const none = scopeOf(board, { candidateIds: ["c-zzz"], personIds: [] });
    expect(none).toMatchObject({ basis: "shortlist", missing: 1, fellBack: true });
    expect(none.people).toHaveLength(3);
  });

  it("keeps only the threads of people in scope", () => {
    const t = (cc: string): Thread => ({ id: `t-${cc}`, campaignCandidateId: cc, stage: "shortlisted", candidate: { id: "x", name: "X", title: null, company: null, primaryEmail: null }, messages: [] });
    const s = scopeOf(board);
    expect(threadsInScope([t("cc-a"), t("cc-e"), t("cc-c")], s.people).map((x) => x.campaignCandidateId)).toEqual(["cc-a", "cc-c"]);
  });

  it("splits who can be written to from who has no email, leaving out anyone who already has a thread", () => {
    const s = scopeOf(board);
    const split = unreachedOf(s.people, [{ campaignCandidateId: "cc-a" }]);
    expect(split.withEmail.map((p) => p.candidateId)).toEqual(["c-c"]);
    expect(split.withoutEmail.map((p) => p.candidateId)).toEqual(["c-b"]);
  });

  it("says who it is for with the good news first", () => {
    const base = { basis: "shortlist" as const, missing: 0, fellBack: false };
    expect(scopeLine(base, 13, 2)).toBe("The shortlist has 13 people. 2 can be emailed.");
    expect(scopeLine(base, 4, 4)).toBe("The shortlist has 4 people. All 4 can be emailed.");
    expect(scopeLine(base, 1, 1)).toBe("The shortlist has 1 person. They can be emailed.");
    expect(scopeLine(base, 11, 0)).toBe("The shortlist has 11 people. None has an email on file yet, so there is nothing to send.");
    expect(scopeLine(base, 0, 0)).toBe("Nobody is on the shortlist yet, so there is nobody to write to.");
    expect(scopeLine({ basis: "named", missing: 1, fellBack: false }, 2, 2)).toBe("You named 2 people. All 2 can be emailed. One person you named isn't on this campaign, so I left them out.");
    expect(scopeLine({ basis: "shortlist", missing: 2, fellBack: true }, 3, 1)).toContain("I couldn't find the people you named");
  });

  it("names the first few and counts the rest", () => {
    expect(namesLine(["A", "B", "C", "D", "E"])).toEqual({ shown: ["A", "B", "C"], more: 2 });
    expect(namesLine(["A"])).toEqual({ shown: ["A"], more: 0 });
  });

  it("writes a first email from what is on file, and nothing invented", () => {
    const withRole = composeFirstEmail({ fullName: "Karthik Bose", currentTitle: "Android Engineer", currentCompanyName: "PhonePe" }, "Senior Android Engineer");
    expect(withRole.subject).toBe("Senior Android Engineer: would you be open to a chat?");
    expect(withRole.body).toContain("Hi Karthik,");
    expect(withRole.body).toContain("your work as Android Engineer at PhonePe");
    const bare = composeFirstEmail({ fullName: "Asha", currentTitle: null, currentCompanyName: null }, "Backend");
    expect(bare.body).toContain("your background looks like a good fit");
    expect(bare.body).not.toContain("your work");
    expect(composeFirstEmail({ fullName: "Asha Rao", currentTitle: null, currentCompanyName: "InMobi" }, "Backend").body).toContain("your work at InMobi");
  });
});

/* ── form: a draft from the role spec ── */

const spec = {
  title: "Senior Android Engineer", yearsMin: 3, locations: ["Bengaluru"], remoteOk: false,
  requirements: [
    { text: "Kotlin", importance: "must" as const, kind: "skill" },
    { text: "Android", importance: "must" as const, kind: "skill" },
    { text: "Jetpack Compose", importance: "nice" as const, kind: "skill" },
  ],
};
const setup = { notice: "Up to 60 days", workMode: "hybrid", officeDays: 3, locations: ["Bengaluru"], mustHave: ["Kotlin", "Android"], niceToHave: ["Jetpack Compose"], expMin: 3 };

describe("role facts", () => {
  it("takes must-haves and nice-to-haves from the spec, and the terms from the setup", () => {
    expect(roleFactsFrom(spec, setup)).toEqual({
      title: "Senior Android Engineer", yearsMin: 3,
      musts: [{ text: "Kotlin", skill: true }, { text: "Android", skill: true }],
      nice: ["Jetpack Compose"], city: "Bengaluru", daysInOffice: 3, maxNoticeDays: 60,
    });
  });

  it("falls back to the campaign's own must-haves when there is no spec", () => {
    const f = roleFactsFrom(null, setup)!;
    expect(f.musts.map((m) => m.text)).toEqual(["Kotlin", "Android"]);
    expect(f.nice).toEqual(["Jetpack Compose"]);
    expect(f.title).toBeUndefined();
  });

  it("keeps at most four must-haves, once each, and marks the ones that are not skills", () => {
    const f = roleFactsFrom({
      requirements: ["Go", "go", "Postgres", "Kafka", "Redis", "gRPC"].map((text) => ({ text, importance: "must" as const })).concat([{ text: "B.Tech", importance: "knockout" as const, kind: "education" } as never]),
    })!;
    expect(f.musts.map((m) => m.text)).toEqual(["Go", "Postgres", "Kafka", "Redis"]);
    const e = roleFactsFrom({ requirements: [{ text: "A degree in computer science", importance: "must", kind: "education" }] })!;
    expect(e.musts).toEqual([{ text: "A degree in computer science", skill: false }]);
  });

  it("is null when the role says nothing a form could screen on", () => {
    expect(roleFactsFrom(null, null)).toBeNull();
    expect(roleFactsFrom({ requirements: [] }, { notice: "Any" })).toBeNull();
  });

  it("reads the notice period the campaign accepts", () => {
    expect(noticeDays("Up to 60 days")).toBe(60);
    expect(noticeDays("Immediate")).toBe(0);
    expect(noticeDays("Any")).toBeUndefined();
    expect(noticeDays(undefined)).toBeUndefined();
    expect(noticeAccepted(60)).toEqual(["Immediate", "15 days", "30 days", "60 days"]);
    expect(noticeAccepted(0)).toEqual(["Immediate"]);
  });
});

const facts = roleFactsFrom(spec, setup) as RoleFacts;
const titles = (f: Form) => f.questions.map((q) => q.title);

describe("a form drafted from the role spec", () => {
  const f = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "other", roleText: facts.title, facts });

  it("asks each must-have as a yes or no, and marks it must-have", () => {
    const kotlin = f.questions.find((q) => q.title === "Have you worked hands-on with Kotlin?");
    expect(kotlin).toMatchObject({ type: "yesno", required: true, accept: ["Yes"] });
    expect(titles(f)).toContain("Have you worked hands-on with Android?");
    expect(mustHaveOf(kotlin as never)).toEqual(["Yes"]);
  });

  it("turns the minimum years and the longest notice into must-haves on the questions that ask", () => {
    const years = f.questions.find((q) => q.type === "number")!;
    expect(years.atLeast).toBe(3);
    expect(mustHaveOf(years)).toEqual(["3+ years"]);
    const notice = f.questions.find((q) => q.title === "What's your notice period?")!;
    expect(notice.accept).toEqual(["Immediate", "15 days", "30 days", "60 days"]);
  });

  it("asks where the role sits, in the role's own terms, and keeps it a must-have", () => {
    const loc = f.questions.find((q) => q.title === "Can you work from Bengaluru 3 days a week?");
    expect(loc?.accept).toEqual(["Yes"]);
    expect(f.role?.location).toBe("Bengaluru · 3 days in office");
  });

  it("offers the role's tools in the tools question, and names them on the page", () => {
    const tools = f.questions.find((q) => q.type === "multi")!;
    expect(tools.options).toEqual(["Kotlin", "Android", "Jetpack Compose"]);
    expect(f.role?.requirements).toContain("3+ years of senior android engineer experience");
    expect(f.role?.requirements).toContain("Hands-on with Kotlin and Android");
  });

  it("is titled for the role the spec names, not the campaign's name", () => {
    expect(f.title).toBe("Senior Android Engineer");
    expect(f.name).toBe("Senior Android Engineer screening");
  });

  it("drops work authorisation as a must-have once the role gives something to screen on", () => {
    const auth = f.questions.find((q) => /authorised/.test(q.title))!;
    expect(auth.accept).toBeUndefined();
    const bare = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "other", ideal: "" });
    expect(bare.questions.find((q) => /authorised/.test(q.title))!.accept).toEqual(["Yes"]);
  });

  it("does not ask what the ideal-hire line already asked", () => {
    const g = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "other", ideal: "Kotlin at scale", facts });
    const ts = titles(g);
    expect(ts.filter((t) => /Kotlin/.test(t))).toHaveLength(1);
    expect(ts).toContain("Have you worked hands-on with Android?");
  });

  it("ends up with each of them as a must-have the recruiter can see, in the order they are asked", () => {
    expect(mustHaves(f).map((q) => q.title)).toEqual([
      "How many years have you been shipping software as a senior android engineer?",
      "What's your notice period?",
      "Have you worked hands-on with Kotlin?",
      "Have you worked hands-on with Android?",
      "Can you work from Bengaluru 3 days a week?",
    ]);
  });

  it("is the same form as before when there are no facts", () => {
    const a = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend", ideal: "5+ years Go" });
    const b = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend", ideal: "5+ years Go", facts: null });
    expect(titles(b)).toEqual(titles(a));
    expect(b.questions.map((q) => q.accept)).toEqual(a.questions.map((q) => q.accept));
    expect(b.role?.requirements).toEqual(a.role?.requirements);
  });

  it("says in the ideal-hire question that the spec's must-haves will be used", () => {
    const q = { id: "form-ideal", found: "x", ask: "y", why: "old", options: [], apply: () => ({}) } as Question;
    expect(tuneQuestion(q, facts, "fn3 Senior Android Engineer")).toMatchObject({
      found: "For fn3 Senior Android Engineer",
      why: "The role spec already has Kotlin and Android as must-haves, and I'll use them. Add a line to refine it, or skip.",
    });
    expect(tuneQuestion(q, null)).toBe(q);
    expect(tuneQuestion({ ...q, id: "form-family" } as Question, facts)).toMatchObject({ id: "form-family", why: "old" });
  });
});

/* ── form status: what to say ── */

describe("form status copy", () => {
  it("says where a form stands in plain words", () => {
    expect(stateLine("live", "2026-12-31")).toBe("Live, takes applications until 31 Dec");
    expect(stateLine("live", null)).toBe("Live");
    expect(stateLine("draft")).toBe("A draft, not published yet");
    expect(stateLine("closed", "2026-12-31")).toBe("Closed to new applications");
    expect(shortDate("2026-01-05")).toBe("5 Jan");
    expect(shortDate("nope")).toBe("");
  });

  it("leads with who met every must-have", () => {
    const c = { hasMust: true, waiting: 0 };
    expect(answeredLine({ ...c, total: 0, met: 0, missed: 0 })).toBe("No answers yet");
    expect(answeredLine({ ...c, total: 1, met: 1, missed: 0 })).toBe("1 answered, and they met every must-have");
    expect(answeredLine({ ...c, total: 2, met: 2, missed: 0 })).toBe("2 answered, both met every must-have");
    expect(answeredLine({ ...c, total: 5, met: 5, missed: 0 })).toBe("5 answered, all met every must-have");
    expect(answeredLine({ ...c, total: 3, met: 2, missed: 1 })).toBe("3 answered, 2 met every must-have, 1 missed one");
    expect(answeredLine({ ...c, total: 3, met: 1, missed: 2 })).toBe("3 answered, 1 met every must-have, 2 missed some");
    expect(answeredLine({ ...c, total: 2, met: 0, missed: 2 })).toBe("2 answered, none met every must-have");
    expect(answeredLine({ ...c, total: 2, met: 1, missed: 1, waiting: 1 })).toBe("2 answered, 1 met every must-have, 1 missed one, 1 waiting for your call");
  });

  it("claims nothing about must-haves a form doesn't have", () => {
    expect(answeredLine({ total: 4, met: 4, missed: 0, waiting: 0, hasMust: false })).toBe("4 answered");
    expect(answeredLine({ total: 4, met: 4, missed: 0, waiting: 2, hasMust: false })).toBe("4 answered, 2 waiting for your call");
  });

  it("adds forms up only when several have answers", () => {
    expect(totalsLine([{ total: 3, met: 2, hasMust: true }])).toBeNull();
    expect(totalsLine([{ total: 3, met: 2, hasMust: true }, { total: 0, met: 0, hasMust: true }])).toBeNull();
    expect(totalsLine([{ total: 3, met: 2, hasMust: true }, { total: 2, met: 1, hasMust: true }])).toBe("5 answered across 2 forms, 3 met every must-have.");
    expect(totalsLine([{ total: 3, met: 3, hasMust: false }, { total: 2, met: 2, hasMust: false }])).toBe("5 answered across 2 forms.");
    expect(totalsLine([{ total: 3, met: 2, hasMust: true }, { total: 0, met: 0, hasMust: false }, { total: 1, met: 0, hasMust: true }])).toBe("4 answered across 2 forms, 2 met every must-have.");
    expect(totalsLine([{ total: 0, met: 0, hasMust: true }, { total: 0, met: 0, hasMust: true }])).toBeNull();
  });

  it("says what a response did on the must-haves", () => {
    const form = { questions: [
      { id: "q1", type: "yesno", title: "Have you worked hands-on with Kotlin?", required: true, accept: ["Yes"] },
      { id: "q2", type: "choice", title: "What's your notice period?", required: true, options: ["Immediate", "90 days"], accept: ["Immediate"] },
    ] } as Pick<Form, "questions">;
    expect(responseLine({ answers: { q1: "Yes" }, flagged: false }, form, true)).toBe("Met every must-have");
    expect(responseLine({ answers: { q1: "No", q2: "90 days" }, flagged: true }, form, true)).toBe("Missed Kotlin and notice period");
    expect(responseLine({ answers: {}, flagged: true }, form, true)).toBe("Missed a must-have");
    expect(responseLine({ answers: {}, flagged: false }, form, false)).toBe("Answered");
  });

  it("puts the people waiting for a call first, and counts the rest", () => {
    const metas: Record<string, { decision: "added" | "passed" | null; stage: string | null }> = {
      a: { decision: null, stage: "shortlisted" }, b: { decision: null, stage: null }, c: { decision: "passed", stage: null }, d: { decision: null, stage: null },
    };
    const rows = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(standingOf(metas.a)).toBe("on-board");
    expect(standingOf(metas.b)).toBe("waiting");
    expect(standingOf(metas.c)).toBe("passed");
    expect(standingOf(undefined)).toBe("waiting");
    expect(inView(rows, (id) => metas[id], 3)).toEqual({ shown: [{ id: "b" }, { id: "d" }, { id: "a" }], hidden: 1 });
    expect(stageWords("shortlisted")).toBe("On the shortlist");
    expect(stageWords("outreach")).toBe("In outreach");
  });

  it("lists live forms first, then drafts, then closed, and opens the one with people waiting", () => {
    const facts = new Map<string, { status: "draft" | "live" | "closed"; answered: number; waiting: number }>([
      ["closed1", { status: "closed", answered: 9, waiting: 0 }], ["draft1", { status: "draft", answered: 0, waiting: 0 }],
      ["live1", { status: "live", answered: 1, waiting: 0 }], ["live2", { status: "live", answered: 3, waiting: 2 }],
    ]);
    const forms = [...facts.keys()].map((id) => ({ id }));
    const ordered = orderForms(forms, (f) => facts.get(f.id)!);
    expect(ordered.map((f) => f.id)).toEqual(["live2", "live1", "draft1", "closed1"]);
    expect(defaultOpen(ordered, (f) => facts.get(f.id)!)).toBe("live2");
    expect(defaultOpen([{ id: "x" }, { id: "y" }], (f) => ({ answered: f.id === "y" ? 2 : 0, waiting: 0 }))).toBe("y");
    expect(defaultOpen([{ id: "x" }], () => ({ answered: 0, waiting: 0 }))).toBeNull();
  });
});

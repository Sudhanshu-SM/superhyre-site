import { describe, expect, it } from "vitest";
import type { PeopleSheet } from "../peopleSheet";
import {
  type ResumeFile,
  type ResumeLine,
  type ResumeReading,
  buttonFor,
  canTick,
  defaultTicks,
  fieldsToSend,
  headlineOf,
  problemFiles,
  reachLine,
  requestFor,
  resumeHeadline,
  resumeSeedOf,
  retryable,
  scopeLine,
  ticksAfter,
  verdictLine,
  whatTheyDo,
} from "../resumeSheet";

/** Resumes as people: which lines are ticked, what the button adds and says, what is sent to be read, and what is said of a line. All pure. */

const line = (key: string, over: Partial<ResumeLine> = {}): ResumeLine => ({
  key,
  fileId: key.split(":")[0] ?? key,
  file: `${key.split(":")[0]}.pdf`,
  state: "ready",
  why: null,
  verdict: "new",
  picture: false,
  name: `Person ${key}`,
  title: null,
  company: null,
  fields: { fullName: `Person ${key}`, email: `${key.replace(":", "")}@example.com` },
  ...over,
});
const file = (id: string, over: Partial<ResumeFile> = {}): ResumeFile => ({ id, name: `${id}.pdf`, state: "read", reason: null, people: 1, ...over });
const sheet = { kind: "people", tabs: [], tab: null, headerRow: null, columns: [], needsCheck: false, counts: {}, leftOutBy: {}, leftOut: [], hidden: { rows: 0, columns: 0, included: false }, rows: [] } as unknown as PeopleSheet;
const reading = (lines: ResumeLine[], files: ResumeFile[] = [file("a"), file("b")]): ResumeReading => ({ sheet, files, lines, read: {} });

const MIXED = reading([
  line("a:0"),
  line("a:1", { verdict: "here" }),
  line("b:0", { state: "check", why: "check it" }),
  line("c:0", { state: "no-contact", verdict: null, fields: { fullName: "No Contact" } }),
  line("d:0", { verdict: "already" }),
  line("e:0", { state: "same", verdict: null }),
  line("f:0", { state: "no-name", verdict: null, name: null, fields: null }),
  line("g:0", { state: "invalid", verdict: null }),
]);

describe("which lines are ticked", () => {
  it("is every line that can be added, except the ones to look at first", () => {
    expect([...defaultTicks(MIXED)]).toEqual(["a:0", "a:1"]);
  });

  it("cannot tick a person with no way to reach them, one already where they would go, one joined to another, or one the import would turn away", () => {
    expect(MIXED.lines.filter(canTick).map((l) => l.key)).toEqual(["a:0", "a:1", "b:0"]);
  });

  it("keeps the person's own ticks across a new reading, ticks a line that has just become ready, and drops one that can no longer be added", () => {
    const before = new Set(["a:0", "b:0"]);
    const known = new Set(MIXED.lines.map((l) => l.key));
    const next = reading([
      line("a:0"),
      line("a:1", { verdict: "here" }),
      line("b:0", { state: "check" }),
      line("c:0", { fields: { fullName: "No Contact", email: "typed@example.com" } }),
      line("d:0", { verdict: "already" }),
    ]);
    // a:1 was unticked by the person and stays so; b:0 was ticked after a look and stays so; c:0 is a line they had seen unticked
    // (the card ticks it itself when the contact they typed for it is what made it ready).
    expect([...ticksAfter(next, before, known)].sort()).toEqual(["a:0", "b:0"]);
    // A line the person has not seen before is ticked when it is ready, and one to look at first is not.
    expect([...ticksAfter(next, before, new Set(["a:0"]))].sort()).toEqual(["a:0", "a:1", "c:0"]);
    // Nothing that can no longer be added stays ticked.
    expect([...ticksAfter(reading([line("a:0", { verdict: "already" })]), new Set(["a:0"]), new Set(["a:0"]))]).toEqual([]);
  });
});

describe("what the button adds", () => {
  it("is the ticked lines that can be added, in order, as the import takes them", () => {
    const ticked = new Set(["a:1", "a:0", "b:0", "c:0", "d:0"]);
    expect(fieldsToSend(MIXED, ticked).map((f) => f.fullName)).toEqual(["Person a:0", "Person a:1", "Person b:0"]);
    expect(fieldsToSend(MIXED, new Set())).toEqual([]);
  });

  it("says how many, and where they go", () => {
    const ticked = new Set(["a:0", "a:1"]);
    expect(buttonFor(MIXED, ticked, null)).toBe("Add 2 to Candidates");
    expect(buttonFor(MIXED, ticked, "Backend")).toBe("Add 2 to the Backend shortlist");
    expect(buttonFor(MIXED, new Set(["a:0"]), null)).toBe("Add 1 to Candidates");
    expect(buttonFor(MIXED, new Set(), null)).toBeNull();
  });
});

describe("what is sent to be read", () => {
  const seeds = [
    { id: "a", name: "a.pdf", text: "Priya Nair", picture: false },
    { id: "b", name: "b.jpg", text: "RAVI", picture: true },
  ];

  it("is each file's text, a picture said to be one, the campaign when there is one, and what was read before", () => {
    const facts = { list: false, people: [{ name: "Priya Nair" }] };
    expect(requestFor(seeds, { campaignId: "c-1", read: { a: facts }, typed: {} })).toEqual({
      files: [
        { id: "a", name: "a.pdf", text: "Priya Nair", read: facts },
        { id: "b", name: "b.jpg", text: "RAVI", picture: true },
      ],
      campaignId: "c-1",
    });
  });

  it("says which files the person kept as resumes, and only those", () => {
    const chip = { id: "k", name: "k.pdf", origin: "file" as const, size: 5, status: "ready" as const, text: "Anil Menon", picture: true, kept: true };
    expect(resumeSeedOf(chip)).toEqual({ id: "k", name: "k.pdf", text: "Anil Menon", picture: true, kept: true });
    expect("kept" in resumeSeedOf({ id: "p", name: "p.pdf", origin: "file", size: 5, status: "ready", text: "Priya Nair" })).toBe(false);
    expect(requestFor([resumeSeedOf(chip), ...seeds], { campaignId: null, read: {}, typed: {} }).files).toEqual([
      { id: "k", name: "k.pdf", text: "Anil Menon", picture: true, kept: true },
      { id: "a", name: "a.pdf", text: "Priya Nair" },
      { id: "b", name: "b.jpg", text: "RAVI", picture: true },
    ]);
  });

  it("carries only what the person really typed, trimmed, and no campaign for Candidates alone", () => {
    const body = requestFor(seeds, { campaignId: null, read: {}, typed: { "a:0": "  priya@example.com ", "b:0": "   " } });
    expect(body.typed).toEqual([{ key: "a:0", contact: "priya@example.com" }]);
    expect("campaignId" in body).toBe(false);
    expect("typed" in requestFor(seeds, { campaignId: null, read: {}, typed: {} })).toBe(false);
  });
});

describe("what the card says", () => {
  it("says what is added from the files, and that nothing else in them is", () => {
    expect(scopeLine([{ name: "priya.pdf" }])).toBe("Adding people from priya.pdf. Nothing else in it is added.");
    expect(scopeLine([{ name: "a.pdf" }, { name: "b.pdf" }, { name: "c.pdf" }])).toBe("Adding people from 3 files. Nothing else in them is added.");
  });

  it("counts the people and the files, and says so when there is nobody", () => {
    expect(headlineOf(reading([line("a:0"), line("b:0")], [file("a"), file("b"), file("c")]))).toBe("I found 2 people in 3 files");
    expect(headlineOf(reading([line("a:0")], [file("a")]))).toBe("I found 1 person in 1 file");
    expect(headlineOf(reading([], [file("a")]))).toBe("I couldn't find anyone to add in a.pdf");
    expect(headlineOf(reading([], [file("a"), file("b")]))).toBe("I couldn't find anyone to add in these files");
  });

  it("says what a person does as the resume did, and how to reach them in their own file's words", () => {
    expect(whatTheyDo({ title: "Backend Engineer", company: "Acme" })).toBe("Backend Engineer at Acme");
    expect(whatTheyDo({ title: "Backend Engineer", company: null })).toBe("Backend Engineer");
    expect(whatTheyDo({ title: null, company: "Acme" })).toBe("Acme");
    expect(whatTheyDo({ title: null, company: null })).toBe("");
    expect(reachLine({ email: "p@x.com", phone: "+919845012345", linkedinUrl: "https://www.linkedin.com/in/priya-nair" })).toBe("p@x.com  ·  +919845012345  ·  linkedin.com/in/priya-nair");
    expect(reachLine(null)).toBe("");
  });

  it("says whether someone is new, or already here and where they go", () => {
    expect(verdictLine(line("a:0"), null)).toBe("New to your candidates");
    expect(verdictLine(line("a:0", { verdict: "here" }), "Backend")).toBe("Already in your candidates. Goes on the Backend shortlist.");
    expect(verdictLine(line("a:0", { verdict: "here" }), null)).toBe("Already in your candidates.");
    expect(verdictLine(line("a:0", { verdict: "already" }), "Backend")).toBe("Already in your candidates and on the Backend shortlist.");
    expect(verdictLine(line("a:0", { state: "same" }), null)).toBe("");
    expect(verdictLine(line("a:0", { verdict: null }), null)).toBe("");
  });

  it("lists the files that were not read as people, and which of them can be tried again", () => {
    const r = reading([], [
      file("a"),
      file("b", { state: "failed", reason: "I couldn't read that file just now. Try again in a moment.", people: 0 }),
      file("c", { state: "job-description", reason: "c.pdf reads like a job description, not a resume.", people: 0 }),
      file("d", { reason: "I couldn't find a person in d.pdf.", people: 0 }),
    ]);
    expect(problemFiles(r).map((f) => f.id)).toEqual(["b", "c", "d"]);
    expect(retryable(r)).toEqual(["b"]);
  });
});

describe("the name on a chip", () => {
  it("is the name at the top of a resume, set in ordinary capitals", () => {
    expect(resumeHeadline("Priya Nair\nBackend Engineer\npriya@x.com")).toBe("Priya Nair");
    expect(resumeHeadline("RAVI KUMAR\nSenior Developer")).toBe("Ravi Kumar");
    expect(resumeHeadline("Dr. Meera Joshi-Rao\nProduct")).toBe("Dr. Meera Joshi-Rao");
  });

  it("skips a heading and a blank line, and says nothing when the first real line is not a name", () => {
    expect(resumeHeadline("\n  \nCurriculum Vitae\nPage 1\nPriya Nair")).toBe("Priya Nair");
    expect(resumeHeadline("Résumé\nAsha Verma")).toBe("Asha Verma");
    expect(resumeHeadline("priya.nair@example.com\nPriya Nair")).toBeNull();
    expect(resumeHeadline("Senior Backend Engineer, Pune")).toBeNull();
    expect(resumeHeadline("Resume of a very experienced engineer who has built many things")).toBeNull();
    expect(resumeHeadline("")).toBeNull();
  });
});

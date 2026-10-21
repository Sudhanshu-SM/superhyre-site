import { describe, expect, it } from "vitest";
import type { Invitation, OrgMatch } from "../api/onboarding";
import { finishedFrom, landingPlace, needsSetup } from "../setup/lean/gate";
import { padBeat, padRows } from "../setup/lean/Pad";
import {
  type Answers,
  answerText,
  AWAKE,
  beatsFor,
  CHAPTER_OF,
  CHAPTERS,
  checkJd,
  clientLabel,
  companyProblem,
  createLabel,
  EMPTY,
  FIELD,
  finishBody,
  firstBeatOf,
  firstName,
  foundClientOf,
  fromSaved,
  initialsOf,
  isBareUrl,
  JD_FILE_ACCEPT,
  jdFileProblem,
  JD_MAX,
  nameFromDomain,
  nameProblem,
  nextBeat,
  parseRole,
  POSE,
  POWERS,
  progressOf,
  reachable,
  readyWords,
  roleProblem,
  ROLE_LATER,
  roleSkipped,
  roleText,
  settle,
  teamWords,
  toSaved,
  validCompany,
  validName,
  words,
} from "../setup/lean/steps";
import { resolveTeam, type TeamContext } from "../setup/lean/Team";
import { pieces, typedMs } from "../setup/lean/Voice";

const JD = "We're hiring a Senior Backend Engineer to own our Node.js services and mentor two engineers. 5+ years, remote in India.";
const forClient: Answers = {
  ...EMPTY,
  name: "Arnab Jay",
  team: { kind: "create", name: "Northstar Talent" },
  role: { kind: "title", title: "Data Engineer" },
  jd: JD,
  forClient: true,
  client: "Acme",
};

describe("the order of the beats", () => {
  it("asks name, team, role, job description, client, powers, then makes it: no workspace name, no site, no sender", () => {
    expect(beatsFor(EMPTY)).toEqual(["name", "team", "role", "jd", "client", "powers", "finish"]);
    expect(beatsFor(forClient)).toEqual(beatsFor(EMPTY));
  });

  it("starts by asking what to call the person, then about their team", () => {
    expect(beatsFor(EMPTY)[0]).toBe("name");
    expect(nextBeat("name", EMPTY)).toBe("team");
    expect(nextBeat("team", EMPTY)).toBe("role");
    expect(nextBeat("role", EMPTY)).toBe("jd");
    expect(nextBeat("jd", EMPTY)).toBe("client");
    expect(nextBeat("client", EMPTY)).toBe("powers");
    expect(nextBeat("finish", EMPTY)).toBe("finish");
  });

  it("puts each beat under a chapter, and a finished chapter takes you to its first beat", () => {
    expect(CHAPTERS.map((c) => c.title)).toEqual(["About you", "First role", "Your powers"]);
    expect(CHAPTER_OF.team).toBe("you");
    expect(CHAPTER_OF.jd).toBe("role");
    expect(CHAPTER_OF.finish).toBe("powers");
    expect(firstBeatOf("you")).toBe("name");
    expect(firstBeatOf("role")).toBe("role");
  });

  it("measures how far along, for the hills", () => {
    expect(progressOf("name", EMPTY)).toBe(0);
    expect(progressOf("finish", EMPTY)).toBe(1);
    expect(progressOf("jd", EMPTY)).toBeCloseTo(0.5);
  });

  it("forgets the client when the role is for the person's own company", () => {
    expect(settle({ ...forClient, forClient: false })).toMatchObject({ client: null });
    expect(settle(forClient).client).toBe("Acme");
  });
});

describe("what counts as a role, a job description and a company", () => {
  it("takes a job title, and nothing that is a link", () => {
    expect(parseRole("  Senior   Full Stack Engineer ")).toEqual({ kind: "title", title: "Senior Full Stack Engineer" });
    expect(roleText({ kind: "title", title: "Data Analyst" })).toBe("Data Analyst");
    expect(roleText(null)).toBeNull();
    for (const v of ["https://acme.com/careers/senior-engineer", "www.acme.com/jobs/1", "acme.com/jobs/123", "a", "x".repeat(81)]) {
      expect(parseRole(v), v).toBeNull();
    }
    expect(roleProblem("https://acme.com/jobs/1")).toMatch(/link/);
    expect(roleProblem("a")).toMatch(/job title/);
  });

  it("says a bare link is a link, in any spelling", () => {
    for (const v of ["https://jobs.lever.co/acme/123", "http://acme.com", "www.acme.com", "acme.com/careers/backend", "  https://x.io/a?b=1  "]) {
      expect(isBareUrl(v), v).toBe(true);
    }
    for (const v of ["Senior engineer at acme.com, remote", "We use Node.js and Postgres", "acme.com"]) {
      expect(isBareUrl(v), v).toBe(false);
    }
  });

  it("takes a pasted description as text, and turns a link or a scrap back gently", () => {
    expect(checkJd(`  ${JD}  `)).toEqual({ ok: true, text: JD });
    expect(checkJd("")).toMatchObject({ ok: false });
    const link = checkJd("https://boards.greenhouse.io/acme/jobs/4012345");
    expect(link).toMatchObject({ ok: false });
    expect((link as { problem: string }).problem).toMatch(/can't open links.*Paste the text/);
    expect(checkJd("Backend dev")).toMatchObject({ ok: false });
  });

  it("takes a PDF, Word or text file for the description, and says why not for anything else", () => {
    expect(JD_FILE_ACCEPT).toBe(".pdf,.docx,.txt,.md");
    for (const name of ["jd.pdf", "role.DOCX", "notes.txt", "jd.md"]) {
      expect(jdFileProblem({ name, type: "", size: 2048 }), name).toBeNull();
    }
    expect(jdFileProblem({ name: "jd.docx", type: "", size: 0 })).toMatch(/empty/);
    expect(jdFileProblem({ name: "jd.pdf", type: "application/pdf", size: 11 * 1024 * 1024 })).toMatch(/over 10 MB/);
    expect(jdFileProblem({ name: "jd.doc", type: "application/msword", size: 2048 })).toMatch(/\.docx or PDF/);
    expect(jdFileProblem({ name: "scan.png", type: "image/png", size: 2048 })).toMatch(/PDF, Word \(\.docx\) or text/);
  });

  it("takes only a name for a client or an organisation: no address", () => {
    expect(validCompany("  Acme   Corp ")).toBe("Acme Corp");
    expect(validCompany("A")).toBeNull();
    expect(validCompany("x".repeat(81))).toBeNull();
    expect(validCompany("https://acme.com")).toBeNull();
    expect(companyProblem("https://acme.com", "client")).toMatch(/Just the company's name/);
    expect(companyProblem("", "client")).toMatch(/client's company name/);
    expect(companyProblem("", "organisation")).toMatch(/company or agency/);
  });

  it("trims and bounds a name, and starts a team name from a domain", () => {
    expect(validName("  Arnab   Jay ")).toBe("Arnab Jay");
    expect(validName("   ")).toBeNull();
    expect(firstName("Arnab Jay")).toBe("Arnab");
    expect(initialsOf("northstar talent")).toBe("NT");
    expect(nameFromDomain("acme-hire.co.in")).toBe("Acme Hire");
    expect(nameFromDomain(null)).toBe("");
  });
});

describe("the words", () => {
  it("asks the name first, then greets by it", () => {
    expect(words("name", EMPTY).head).toEqual(["Hi, I'm *Mind*.", "What should I call you?"]);
    expect(AWAKE("Arnab Jay")).toEqual(["Nice to meet you, *Arnab*."]);
    expect(AWAKE("")).toEqual(["Nice to meet you."]);
    // The story just said "Nice to meet you": the team question does not greet again.
    expect(words("team", { ...EMPTY, name: "Arnab Jay" }).head).toEqual(["Let me see if your *team* is here."]);
    for (const k of ["ask", "create", "loading"] as const) expect(teamWords(k, { ...EMPTY, name: "Arnab Jay" }, "Acme").head.join(" ")).not.toMatch(/meet you/i);
    expect(clientLabel(EMPTY)).toBe("your client");
  });

  it("asks for the job description right after the role, and says when sourcing starts", () => {
    expect(words("role", EMPTY).head).toEqual(["Which role should we start with?"]);
    expect(words("jd", EMPTY).head).toEqual(["Paste the *job description*."]);
    expect(words("jd", EMPTY).quiet).toBe("Mind reads it and drafts the role spec. You approve it before anything starts.");
  });

  it("asks about a client by name only, and says so", () => {
    expect(words("client", forClient).head[0]).toBe("Is *Data Engineer* for a client?");
    const ask = words("client", forClient, { askingClient: true });
    expect(ask.head[0]).toBe("Who is *Data Engineer* for?");
    expect(ask.quiet).toMatch(/company name/);
  });

  it("when the job description names the client, offers it to confirm instead of asking blank", () => {
    const named = { ...forClient, forClient: null, client: null, jd: "Senior Data Engineer\nClient: Tessellate Analytics\nPune, hybrid. 6+ years of Spark." };
    expect(foundClientOf(named)).toBe("Tessellate Analytics");
    const found = words("client", named, { foundClient: "Tessellate Analytics" });
    expect(found.head).toEqual(["The client is *Tessellate Analytics*.", "Right?"]);
    expect(found.quiet).toMatch(/job description/);
    // Changing it asks for the name, as before.
    expect(words("client", named, { foundClient: "Tessellate Analytics", askingClient: true }).head[0]).toBe("Who is *Data Engineer* for?");
    // Nothing named, nothing offered: the usual question.
    expect(foundClientOf({ ...named, jd: JD })).toBeNull();
    expect(words("client", named, { foundClient: null }).head[0]).toBe("Is *Data Engineer* for a client?");
    // Their own organisation is not their client, and a skipped description or role offers nothing.
    expect(foundClientOf({ ...named, jd: "Client: Northstar Talent Pvt Ltd" })).toBeNull();
    expect(foundClientOf({ ...named, jd: null })).toBeNull();
    expect(foundClientOf({ ...named, role: ROLE_LATER })).toBeNull();
    expect(foundClientOf({ ...named, team: null, jd: "Hiring for Orbit Staffing" }, "Orbit Staffing")).toBeNull();
  });

  it("asks the personal address for an organisation, and a work address whether this is for a team or just them", () => {
    const a = { ...EMPTY, name: "Arnab Jay" };
    expect(teamWords("ask", a, "").head.at(-1)).toBe("Which *organisation* do you work with?");
    // The question stands on its own: no explaining line under it.
    expect(teamWords("ask", a, "").quiet).toBeNull();
    expect(teamWords("create", a, "Acme").head.at(-1)).toBe("Is this for *Acme*, or just you?");
    expect(teamWords("create", a, "").head.at(-1)).toMatch(/team/);
    expect(teamWords("create", a, "Acme").quiet).toMatch(/Personal, which only you can see/);
  });

  it("states the role the person holds, truthfully, when they made an organisation", () => {
    const w = readyWords(forClient);
    expect(w.head[0]).toBe("You're set, *Arnab*.");
    expect(w.quiet).toBe("You're the owner of Northstar Talent. You can invite your team, assign work and see every campaign.");
  });

  it("says Personal is private when no organisation was made, and what Mind does next", () => {
    const solo: Answers = { ...forClient, team: { kind: "personal" } };
    expect(readyWords(solo).quiet).toMatch(/Personal is yours alone/);
    expect(readyWords(solo).quiet).toMatch(/reading the job description and drafting your first role spec for you to approve/);
    expect(readyWords({ ...solo, jd: null }).quiet).toMatch(/ask for the job description/);
    // Asked to join and carrying on: not an admin of anything yet.
    expect(readyWords({ ...forClient, team: { kind: "asked", name: "Northstar Talent" } }).quiet).not.toMatch(/admin/);
  });

  it("never asks for a workspace's name, and never mentions reading a site or a link to one", () => {
    const beats = ["name", "team", "role", "jd", "client", "powers", "finish"] as const;
    const all = [
      ...beats.flatMap((b) => [...words(b, forClient).head, words(b, forClient).quiet ?? ""]),
      ...beats.flatMap((b) => [...words(b, forClient, { askingClient: true, hasJd: true }).head, words(b, forClient, { askingClient: true, hasJd: true }).quiet ?? ""]),
      ...(["ask", "create", "loading"] as const).flatMap((k) => [...teamWords(k, forClient, "Acme").head, teamWords(k, forClient, "Acme").quiet ?? ""]),
      ...readyWords(forClient).head,
      readyWords(forClient).quiet ?? "",
    ].join(" ");
    expect(all).not.toMatch(/workspace called|name your workspace|your workspace's name|What's your workspace/i);
    expect(all).not.toMatch(/website|linkedin|scrap|crawl|read your (site|website)|research/i);
  });

  it("keeps a short line for each answer, including a skip", () => {
    expect(answerText("name", forClient)).toBe("Arnab Jay");
    expect(answerText("team", forClient)).toBe("Northstar Talent");
    expect(answerText("team", { ...forClient, team: { kind: "personal" } })).toBe("Just me");
    expect(answerText("role", forClient)).toBe("Data Engineer");
    expect(answerText("jd", forClient)).toBe("Job description added");
    expect(answerText("jd", { ...forClient, jd: null })).toBeNull();
    expect(answerText("client", forClient)).toBe("Acme");
    expect(answerText("client", { ...EMPTY, forClient: false })).toBe("My own company");
    expect(answerText("powers", forClient)).toBeNull();
  });
});

describe("the six powers", () => {
  it("are all there, each with a name and one line, in order", () => {
    expect(POWERS.map((p) => p.title)).toEqual(["Mind", "Reach", "Voice", "Forms", "Insight", "Memory"]);
    for (const p of POWERS) expect(p.line.length).toBeGreaterThan(10);
  });
});

describe("who she is and what the sky does at each beat", () => {
  it("opens looking at the star, keeps her notes on the tablet through the questions, and checks her watch for the powers", () => {
    expect(POSE.name).toBe("idle");
    for (const b of ["team", "role", "jd", "client"] as const) expect(POSE[b]).toBe("tablet");
    expect(POSE.powers).toBe("watch");
  });

  it("deepens the sky as the story goes on, never back", () => {
    const order = beatsFor(EMPTY).map((b) => FIELD[b]);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });
});

describe("how Mind's words are typed", () => {
  it("keeps punctuation next to an emphasised word, so a line never shows 'Mind .'", () => {
    const w = pieces("Hi, I'm *Mind*.").map((p) => p.chars.map((c) => c.c).join(""));
    expect(w).toEqual(["Hi,", "I'm", "Mind."]);
    expect(pieces("Hi, I'm *Mind*.")[2]?.chars.map((c) => c.em)).toEqual([true, true, true, true, false]);
  });

  it("breaks only between words and takes longer for longer lines", () => {
    expect(pieces("What should I call you?").length).toBe(5);
    expect(typedMs("What should I call you?")).toBeGreaterThan(typedMs("Hello"));
  });
});

describe("her pad", () => {
  const base = { ...EMPTY, name: "Arnab Jay" };

  it("is written on from the team question to the client, and only then", () => {
    expect(padBeat("name")).toBe(false);
    for (const b of ["team", "role", "jd", "client"] as const) expect(padBeat(b), b).toBe(true);
    expect(padBeat("powers")).toBe(false);
    expect(padBeat("finish")).toBe(false);
  });

  it("starts with the name alone: Personal has no line, so there is no organisation row", () => {
    expect(padRows("team", base, {}).map((r) => [r.key, r.value, r.live])).toEqual([["name", "Arnab Jay", false]]);
    const solo = { ...base, team: { kind: "personal" as const } };
    expect(padRows("role", solo, {}).some((r) => r.key === "organisation")).toBe(false);
  });

  it("shows the organisation as it is typed, then once it is chosen or asked for", () => {
    expect(padRows("team", base, { organisation: "Northstar" }).at(-1)).toMatchObject({ key: "organisation", label: "Organisation", value: "Northstar", live: true });
    const made = { ...base, team: { kind: "create" as const, name: "Northstar Talent" } };
    expect(padRows("role", made, {}).map((r) => [r.key, r.live])).toEqual([["name", false], ["organisation", false], ["role", true]]);
    const asked = { ...base, team: { kind: "asked" as const, name: "Northstar Talent" } };
    expect(padRows("role", asked, {}).find((r) => r.key === "organisation")).toMatchObject({ value: "Northstar Talent", note: "Asked to join" });
  });

  it("previews a role the person is pointing at", () => {
    const a = { ...base, team: { kind: "personal" as const } };
    expect(padRows("role", a, { role: "Data Analyst" }).at(-1)).toMatchObject({ key: "role", value: "Data Analyst", live: true });
  });

  it("notes that a job description is there, by its length, and leaves a skipped one out", () => {
    const a = { ...base, team: { kind: "personal" as const }, role: { kind: "title" as const, title: "Data Analyst" } };
    expect(padRows("jd", a, {}).at(-1)).toMatchObject({ key: "jd", value: "", live: true });
    // What is typed shows as soon as it can be a description; a link or a scrap is not one.
    expect(padRows("jd", a, { jd: "one two three" }).at(-1)).toMatchObject({ key: "jd", value: "", live: true });
    expect(padRows("jd", a, { jd: "https://jobs.lever.co/acme/1" }).at(-1)).toMatchObject({ key: "jd", value: "" });
    expect(padRows("jd", a, { jd: JD }).at(-1)).toMatchObject({ key: "jd", value: "Added", note: "20 words" });
    expect(padRows("client", { ...a, jd: JD }, {}).find((r) => r.key === "jd")).toMatchObject({ value: "Added" });
    expect(padRows("client", { ...a, jd: null }, {}).some((r) => r.key === "jd")).toBe(false);
  });

  it("lists the client by name, and only when the role is for one", () => {
    const a: Answers = { ...base, team: { kind: "personal" }, role: { kind: "title", title: "Data Analyst" } };
    expect(padRows("client", a, {}).some((r) => r.key === "client")).toBe(false);
    expect(padRows("client", { ...a, forClient: true }, { client: "Acme" }).at(-1)).toMatchObject({ key: "client", label: "For", value: "Acme", live: true });
    expect(padRows("client", { ...a, forClient: true, client: "Acme" }, {}).at(-1)).toMatchObject({ key: "client", value: "Acme", live: false });
    expect(padRows("client", { ...a, forClient: false }, {}).some((r) => r.key === "client")).toBe(false);
  });

  it("is empty before the name and after the questions", () => {
    expect(padRows("name", base, {})).toEqual([]);
    expect(padRows("powers", base, {})).toEqual([]);
    expect(padRows("finish", base, {})).toEqual([]);
  });
});

describe("keeping the set-up between visits", () => {
  it("round-trips what was answered and where the person was", () => {
    const back = fromSaved(JSON.parse(JSON.stringify(toSaved("powers", forClient, true))));
    expect(back).toEqual({ beat: "powers", answers: forClient, opened: true });
  });

  it("starts fresh when nothing useful was kept, or the shape is unknown", () => {
    expect(fromSaved(undefined)).toBeNull();
    expect(fromSaved("nope")).toBeNull();
    expect(fromSaved({ beat: "role" })).toBeNull();
  });

  it("ignores junk in a saved answer instead of trusting it", () => {
    const back = fromSaved({ beat: "client", name: "Arnab", team: { kind: "ftp" }, role: { kind: "title", title: "Analyst" }, forClient: "yes", jd: 7 });
    expect(back?.answers.team).toBeNull();
    expect(back?.answers.forClient).toBeNull();
    expect(back?.answers.jd).toBeNull();
    expect(back?.answers.role).toEqual({ kind: "title", title: "Analyst" });
  });

  it("reads what an earlier build kept: a workspace name is not an organisation, a site is dropped, a client link becomes a name", () => {
    const back = fromSaved({
      beat: "company",
      name: "Arnab",
      workspace: "Northstar",
      company: { kind: "website", value: "northstar.com", label: "Northstar" },
      role: { kind: "link", url: "https://jobs.acme.com/1", label: "Engineer" },
      forClient: true,
      client: { kind: "website", value: "acme.com", label: "Acme" },
      sender: "client",
    });
    expect(back?.answers).toMatchObject({ name: "Arnab", team: null, role: null, client: "Acme" });
    // The old "company link" beat is gone, and so is a team they never chose: back to asking about it.
    expect(back?.beat).toBe("team");
    expect(fromSaved({ beat: "workspace", name: "Arnab" })?.beat).toBe("team");
  });

  it("never lands on a beat whose earlier answers are missing", () => {
    const named = { ...EMPTY, name: "A" };
    expect(reachable("role", named)).toBe("team");
    expect(reachable("client", { ...named, team: { kind: "personal" } })).toBe("role");
    expect(reachable("jd", { ...named, team: { kind: "personal" }, role: { kind: "title", title: "Analyst" } })).toBe("jd");
    expect(reachable("finish", { ...EMPTY, name: "A" })).toBe("team");
    expect(reachable("finish", forClient)).toBe("finish");
    expect(reachable("name", forClient)).toBe("name");
  });

  it("resumes at the beat that was reached, and does not replay the opening once a name is given", () => {
    const back = fromSaved({ beat: "role", name: "Arnab", team: { kind: "personal" } });
    expect(back).toMatchObject({ beat: "role", opened: true });
    expect(fromSaved({ beat: "team", name: "Arnab" })?.opened).toBe(true);
  });

  it("builds what the server is told: the organisation only when one is to be made, the client by name", () => {
    expect(finishBody(forClient)).toEqual({ fullName: "Arnab Jay", organisation: "Northstar Talent", role: forClient.role, jd: JD, client: "Acme" });
    expect(finishBody({ ...forClient, team: { kind: "personal" } })).toMatchObject({ organisation: null });
    expect(finishBody({ ...forClient, team: { kind: "asked", name: "Northstar Talent" } })).toMatchObject({ organisation: null });
    expect(finishBody({ ...forClient, forClient: false })).toMatchObject({ client: null });
    expect(finishBody({ ...forClient, jd: null })).toMatchObject({ jd: null });
    expect(finishBody({ ...forClient, role: null })).toBeNull();
    expect(finishBody({ ...forClient, team: null })).toBeNull();
    // Nothing in what is sent can be a link, a site or a sender.
    expect(Object.keys(finishBody(forClient) ?? {}).sort()).toEqual(["client", "fullName", "jd", "organisation", "role"]);
  });
});

describe("your team", () => {
  const work: TeamContext = { personalEmail: false, domain: "acme-hire.co.in", pending: null };
  const personal: TeamContext = { personalEmail: true, domain: null, pending: null };
  const acme: OrgMatch = { id: "o1", name: "Acme Hire", joinMode: "direct" };
  const invitation = (id: string): Invitation => ({ id, organisationName: "Acme Hire", inviterName: "Asha", role: "recruiter", createdAt: "", expiresAt: "" });
  const none = { team: null } as const;

  it("waits for what is known before saying anything", () => {
    expect(resolveTeam(null, 0, work, none)).toEqual({ v: "loading" });
  });

  it("shows an invitation first, one at a time, then what follows", () => {
    const data = { invitations: [invitation("i1"), invitation("i2")], domain: acme };
    expect(resolveTeam(data, 0, work, none)).toMatchObject({ v: "invitation", item: { id: "i1" }, more: 1 });
    expect(resolveTeam(data, 1, work, none)).toMatchObject({ v: "invitation", item: { id: "i2" }, more: 0 });
    expect(resolveTeam(data, 2, work, none)).toMatchObject({ v: "match", via: "domain" });
  });

  it("offers the organisation on a work address's domain, as a join", () => {
    expect(resolveTeam({ invitations: [], domain: acme }, 0, work, none)).toEqual({ v: "match", org: acme, via: "domain" });
  });

  it("offers to create one, named from the domain, when none uses it", () => {
    expect(resolveTeam({ invitations: [], domain: null }, 0, work, none)).toEqual({ v: "create", name: "Acme Hire" });
  });

  it("asks a personal address which organisation it works with, and never looks for a domain", () => {
    expect(resolveTeam({ invitations: [], domain: null }, 0, personal, none)).toEqual({ v: "ask" });
  });

  it("carries on in Personal while a request is waiting, whether it was made now or before", () => {
    expect(resolveTeam({ invitations: [], domain: acme }, 0, { ...work, pending: "Acme Hire" }, none)).toEqual({ v: "sent", name: "Acme Hire" });
    expect(resolveTeam({ invitations: [], domain: acme }, 0, work, { team: { kind: "asked", name: "Acme Hire" } })).toEqual({ v: "sent", name: "Acme Hire" });
  });
});

describe("carrying on without a first role", () => {
  const later: Answers = { ...EMPTY, name: "Arnab Jay", team: { kind: "create", name: "Northstar Talent" }, role: ROLE_LATER };

  it("is an answer of its own, with no title", () => {
    expect(ROLE_LATER).toEqual({ kind: "later" });
    expect(roleSkipped(later)).toBe(true);
    expect(roleSkipped(forClient)).toBe(false);
    expect(roleSkipped(EMPTY)).toBe(false);
    expect(roleText(ROLE_LATER)).toBeNull();
  });

  it("leaves out the description and the client, which belong to a role", () => {
    expect(beatsFor(later)).toEqual(["name", "team", "role", "powers", "finish"]);
    expect(nextBeat("role", later)).toBe("powers");
    expect(nextBeat("team", later)).toBe("role");
    expect(progressOf("powers", later)).toBeCloseTo(0.75);
    // A role that is not skipped keeps every beat.
    expect(beatsFor(forClient)).toEqual(["name", "team", "role", "jd", "client", "powers", "finish"]);
  });

  it("forgets a description and a client given before the role was skipped", () => {
    expect(settle({ ...forClient, role: ROLE_LATER })).toMatchObject({ role: { kind: "later" }, jd: null, forClient: null, client: null });
  });

  it("tells the server there is no role, so it makes no campaign", () => {
    expect(finishBody(later)).toEqual({ fullName: "Arnab Jay", organisation: "Northstar Talent", role: null, jd: null, client: null });
    expect(finishBody({ ...later, team: { kind: "personal" } })).toMatchObject({ organisation: null, role: null });
    // Anything left over from before is not sent.
    expect(finishBody({ ...forClient, role: ROLE_LATER })).toMatchObject({ role: null, jd: null, client: null });
    // The person and their team are still needed.
    expect(finishBody({ ...later, team: null })).toBeNull();
    // A title is sent as it was.
    expect(finishBody(forClient)).toMatchObject({ role: { kind: "title", title: "Data Engineer" }, jd: JD, client: "Acme" });
  });

  it("is kept between visits, and resumes past the beats it skips", () => {
    const saved = toSaved("powers", later, true);
    expect(saved.role).toEqual({ kind: "later" });
    const back = fromSaved(JSON.parse(JSON.stringify(saved)));
    expect(back?.answers.role).toEqual({ kind: "later" });
    expect(back?.beat).toBe("powers");
    // A beat that does not exist without a role lands on the next one that does.
    expect(reachable("jd", later)).toBe("powers");
    expect(reachable("client", later)).toBe("powers");
    expect(fromSaved({ ...saved, beat: "jd" })?.beat).toBe("powers");
    // The finish needs the same answers as it always did.
    expect(reachable("finish", later)).toBe("finish");
    expect(reachable("finish", { ...later, team: null })).toBe("team");
  });

  it("says what is being set up, and never a campaign that was not made", () => {
    const head = (a: Answers) => words("finish", a).head.join(" ");
    expect(head(later)).toBe("Setting up *Northstar Talent*.");
    expect(head({ ...later, team: { kind: "personal" } })).toBe("Setting up *Personal*.");
    expect(head(forClient)).toMatch(/first campaign/);
    for (const a of [later, { ...later, team: { kind: "personal" } as const }]) {
      const ready = readyWords(a);
      expect(`${ready.head.join(" ")} ${ready.quiet}`).not.toMatch(/campaign|job description|search/i);
      expect(ready.quiet).toMatch(/whenever you're ready/);
    }
    expect(readyWords({ ...later, team: { kind: "personal" } }).quiet).toMatch(/Personal is yours alone/);
    expect(readyWords(later).quiet).toMatch(/owner of Northstar Talent/);
  });

  it("opens the console on Home when there is no campaign, and on its chat when there is", () => {
    expect(finishedFrom({ campaignId: null, conversationId: null, organisationId: "o1" })).toEqual({ hash: "#/", conversationId: null, organisationId: "o1" });
    expect(finishedFrom({ campaignId: "c1", conversationId: "t1", organisationId: null })).toEqual({ hash: "#/agent?campaign=c1", conversationId: "t1", organisationId: null });
  });

  it("has nothing on her pad for a role that is not there", () => {
    expect(padRows("powers", later, {})).toEqual([]);
    expect(padRows("team", later, {}).map((r) => r.key)).toEqual(["name", "organisation"]);
  });
});

describe("who is walked through set-up", () => {
  const ORG = "b5539815-ecb0-43d7-9eb4-c1aa59eb1928";
  type Ws = Parameters<typeof needsSetup>[0]["workspaces"][number];
  const personalWs: Ws = { kind: "personal", organizationId: null, name: "Personal", logoUrl: null, role: null, active: true };
  const orgWs = (role: "owner" | "admin" | "recruiter"): Ws => ({ kind: "org", organizationId: ORG, name: "Quill Hire", logoUrl: null, role, active: false });
  const me = (workspaces: Ws[] = [personalWs], onboarding: Partial<{ memberOf: string | null; staysPersonal: boolean }> = {}) =>
    ({
      workspaces,
      scope: { userId: "u", kind: "personal" as const, organizationId: null, schema: "personal", role: null },
      onboarding: { memberOf: null, staysPersonal: false, ...onboarding },
    }) as Parameters<typeof needsSetup>[0];
  const setup = (over: Record<string, unknown> = {}) =>
    ({ setup: { step: "company", version: 1, answers: {}, domain: null, organizationId: null, completedAt: null, ...over } }) as Parameters<typeof needsSetup>[1];

  it("walks a new person through it, on a work address or a personal one", () => {
    expect(needsSetup(me(), { setup: null }, false)).toBe(true);
    expect(needsSetup(me(), setup(), false)).toBe(true);
  });

  it("does not, once it is done, or when they chose Personal, or when their account could not be read", () => {
    expect(needsSetup(me(), setup({ completedAt: "2026-10-11T00:00:00Z" }), false)).toBe(false);
    expect(needsSetup(me(), setup({ step: "done" }), false)).toBe(false);
    expect(needsSetup(me([personalWs], { staysPersonal: true }), setup(), false)).toBe(false);
    expect(needsSetup(me(), null, false)).toBe(false);
    expect(needsSetup(me(), setup(), true)).toBe(false);
  });

  it("does not, for someone who is in an organisation (joined, invited or approved)", () => {
    expect(needsSetup(me([personalWs, orgWs("recruiter")]), setup(), false)).toBe(false);
    expect(needsSetup(me([personalWs, orgWs("admin")]), { setup: null }, false)).toBe(false);
    expect(needsSetup(me([personalWs], { memberOf: "Quill Hire" }), setup(), false)).toBe(false);
  });

  it("finishes it for the owner of an organisation this set-up made, if it did not finish", () => {
    expect(needsSetup(me([personalWs, orgWs("owner")]), setup({ organizationId: ORG }), false)).toBe(true);
    expect(needsSetup(me([personalWs, orgWs("owner")]), setup({ organizationId: ORG, completedAt: "2026-10-11T00:00:00Z" }), false)).toBe(false);
    expect(needsSetup(me([personalWs, orgWs("recruiter")]), setup({ organizationId: ORG }), false)).toBe(false);
  });
});

describe("where the console opens when the set-up ends", () => {
  it("opens the campaign's chat when it is in the workspace they are in, and Home when it is not", () => {
    // Made in Personal, still in Personal: the chat.
    expect(landingPlace({ organisationId: null }, null)).toBe("campaign");
    // An organisation was made and is the one they are in: the chat.
    expect(landingPlace({ organisationId: "org-1" }, "org-1")).toBe("campaign");
    // An approval landed while they were answering: they are in the organisation now, the campaign is in Personal.
    expect(landingPlace({ organisationId: null }, "org-9")).toBe("home");
    // The account could not be read: keep the link rather than lose the first campaign.
    expect(landingPlace({ organisationId: "org-1" }, undefined)).toBe("campaign");
  });
});

describe("what the set-up says about a name that cannot be taken", () => {
  it("says why, with the count, for a name or an organisation that is too long or too short", () => {
    expect(companyProblem("A", "organisation")).toBe("Use at least 2 characters.");
    expect(companyProblem("x".repeat(150), "organisation")).toBe("That's 150 characters. Keep it under 80.");
    expect(companyProblem("", "organisation")).toMatch(/company or agency/);
    expect(nameProblem("x".repeat(130))).toBe("That's 130 characters. Keep your name under 120.");
    expect(nameProblem("")).toBe("Tell me what to call you.");
  });

  it("keeps a long job description whole or says it is too long: nothing is cut without a word", () => {
    const ok = "x ".repeat(JD_MAX / 2);
    expect(checkJd(ok)).toMatchObject({ ok: true });
    const longer = `${"word ".repeat(10_500)}`;
    const r = checkJd(longer);
    expect(r.ok).toBe(false);
    expect((r as { problem: string }).problem).toMatch(/That's 52,499 characters, and the limit is 30,000/);
    // And what is accepted is what was given.
    const fits = `${"a ".repeat(9_000)}`.trim();
    expect((checkJd(fits) as { text: string }).text).toBe(fits);
  });
});

describe("the button that makes the organisation", () => {
  it("says which one, trimmed to fit, and never 'team'", () => {
    expect(createLabel("Acme")).toBe("Create Acme");
    expect(createLabel("  Acme   Hire ")).toBe("Create Acme Hire");
    expect(createLabel(null)).toBe("Create");
    expect(createLabel("The Very Long Name Of A Recruitment Agency Ltd")).toMatch(/^Create The Very Long Name Of A.*…$/);
    expect(createLabel("Acme")).not.toMatch(/team/i);
  });
});

describe("words a person reads in the set-up", () => {
  it("never calls Personal or an organisation a workspace, and never says 'team space'", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const dir = resolve(__dirname, "../setup/lean");
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    for (const f of ["steps.ts", "LeanSetup.tsx", "SideScreens.tsx", "SetupProgress.tsx", "Team.tsx"]) {
      const text = strip(readFileSync(resolve(dir, f), "utf8"));
      // A string literal or a JSX text node that says it. (An identifier like `workspaces` is not copy.)
      const said = [
        ...[...text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2] ?? ""),
        ...[...text.matchAll(/>([^<>{}=;]{3,})</g)].map((m) => m[1] ?? ""),
      ];
      for (const line of said) {
        expect(line, `${f}: ${line}`).not.toMatch(/\bworkspace\b/i);
        expect(line, `${f}: ${line}`).not.toMatch(/team space/i);
      }
    }
  });
});

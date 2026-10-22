import { describe, expect, it } from "vitest";
import {
  type Answers, type AskContext, type JdFacts, asksFor, clientSaid, draftFromIntake, factLine, isSheetFile, parseCities, parseComp,
  parseExperience, problemsOf,
} from "../jdIntake";

/**
 * A role made from its job description: what the description states is not asked again, what it does not is asked one
 * thing at a time (each skippable, and an answer can stand for the rest of a batch), and what is typed is read the way
 * a recruiter writes it.
 */

const facts = (over: Partial<JdFacts> = {}): JdFacts => ({
  title: "Backend Engineer", client: null, department: null, seniority: null, employment: null, workMode: null, locations: [],
  openings: null, expMin: null, expMax: null, comp: null, notice: null, mustHave: [], niceToHave: [], education: null, ...over,
});
const everything = (over: Partial<JdFacts> = {}): JdFacts =>
  facts({
    client: "Winspire", workMode: "hybrid", locations: ["Bengaluru"], expMin: 4, expMax: 8, notice: "Up to 30 days",
    comp: { currency: "INR", min: 20, max: 30 }, mustHave: ["Go"], ...over,
  });
const ctx = (over: Partial<AskContext> = {}): AskContext => ({
  clients: [{ id: "c1", name: "Winspire Technologies Pvt Ltd" }, { id: "c2", name: "Acme" }], mayAddClient: true, defaults: {}, cities: [], ...over,
});
const keys = (f: JdFacts, a: Answers = {}, c: AskContext = ctx()) => asksFor(f, a, c).map((x) => x.key);

describe("what is asked", () => {
  it("is nothing when the description says it all, and its client is one the workspace has", () => {
    expect(keys(everything())).toEqual([]);
  });

  it("is only what the description did not state, in a fixed order", () => {
    expect(keys(facts({ client: "Winspire" }))).toEqual(["workMode", "locations", "experience", "notice", "comp"]);
    expect(keys(everything({ locations: [], notice: null }))).toEqual(["locations", "notice"]);
  });

  it("does not ask where when the role is remote, whether the description or an answer says so", () => {
    expect(keys(everything({ workMode: "remote", locations: [] }))).toEqual([]);
    expect(keys(everything({ workMode: null, locations: [] }), { workMode: "remote" })).toEqual([]);
    expect(keys(everything({ workMode: null, locations: [] }), { workMode: "onsite" })).toEqual(["locations"]);
  });

  it("does not ask what an answer, or an answer meant for the whole batch, already gave", () => {
    const f = facts({ client: "Winspire" });
    expect(keys(f, { workMode: "hybrid", locations: ["Pune"], exp: { min: 3, max: 6 }, notice: "Immediate", comp: { min: 1, max: 2 } })).toEqual([]);
    expect(keys(f, {}, ctx({ defaults: { workMode: "hybrid", locations: ["Pune"] } }))).toEqual(["experience", "notice", "comp"]);
    // An answer of its own is not undone by the batch's.
    expect(keys(f, { workMode: "remote" }, ctx({ defaults: { workMode: "hybrid", locations: ["Pune"] } }))).toEqual(["experience", "notice", "comp"]);
  });

  it("asks for the client only when there is one to choose, or the description names one that is not there", () => {
    expect(keys(facts({ ...everything(), client: null }))).toEqual(["client"]);
    expect(keys(facts({ ...everything(), client: null }), {}, ctx({ clients: [] }))).toEqual([]);
    expect(keys(everything({ client: "Brand New Co" }))).toEqual(["client"]);
    expect(keys(everything({ client: "Brand New Co" }), {}, ctx({ clients: [] }))).toEqual(["client"]);
    expect(keys(everything({ client: null }), { clientId: "none" })).toEqual([]);
    expect(keys(everything({ client: "Brand New Co" }), { newClient: "Brand New Co" })).toEqual([]);
  });

  it("offers adding the client named only to someone who may add one, and always no client", () => {
    const named = everything({ client: "Brand New Co" });
    const admin = asksFor(named, {}, ctx())[0];
    expect(admin?.text).toBe("Brand New Co isn't one of your clients yet.");
    expect(admin?.options.map((o) => o.id)).toEqual(["new", "client:c1", "client:c2", "none"]);
    const recruiter = asksFor(named, {}, ctx({ mayAddClient: false }))[0];
    expect(recruiter?.options.map((o) => o.id)).toEqual(["client:c1", "client:c2", "none"]);
  });

  it("matches a client by the name the description uses, however the company is written", () => {
    expect(clientSaid("Winspire", ctx().clients)).toMatchObject({ kind: "match", id: "c1" });
    expect(clientSaid("Brand New Co", ctx().clients)).toEqual({ kind: "named", name: "Brand New Co" });
    expect(clientSaid(null, ctx().clients)).toEqual({ kind: "none" });
    expect(clientSaid("  ", ctx().clients)).toEqual({ kind: "none" });
  });

  it("does not ask again what was skipped, for this role or for the batch", () => {
    const f = facts({ client: "Winspire" });
    expect(keys(f, { skipped: ["workMode", "locations"] })).toEqual(["experience", "notice", "comp"]);
    expect(keys(f, {}, ctx({ defaults: { skipped: ["notice", "comp"] } }))).toEqual(["workMode", "locations", "experience"]);
    expect(keys(f, { skipped: ["notice"] }, ctx({ defaults: { skipped: ["comp"] } }))).toEqual(["workMode", "locations", "experience"]);
  });

  it("offers the cities already given in the batch, and a box for a new one", () => {
    const ask = asksFor(everything({ locations: [] }), {}, ctx({ cities: ["Pune", "Mumbai"] }))[0];
    expect(ask?.key).toBe("locations");
    expect(ask?.options.map((o) => o.label)).toEqual(["Pune", "Mumbai"]);
    expect(ask?.input?.placeholder).toBeTruthy();
  });
});

describe("what is typed", () => {
  it("reads experience the way it is written", () => {
    expect(parseExperience("4-7")).toEqual({ min: 4, max: 7 });
    expect(parseExperience("4 to 7 years")).toEqual({ min: 4, max: 7 });
    expect(parseExperience("7–4")).toEqual({ min: 4, max: 7 });
    expect(parseExperience("5+")).toEqual({ min: 5, max: null });
    expect(parseExperience("at least 5 yrs")).toEqual({ min: 5, max: null });
    expect(parseExperience("up to 3")).toEqual({ min: null, max: 3 });
    expect(parseExperience("6")).toEqual({ min: 6, max: 6 });
    expect(parseExperience("lots")).toBeNull();
    expect(parseExperience("")).toBeNull();
    expect(parseExperience("2-90")).toBeNull();
  });

  it("reads pay in lakhs, with the signs people put on it", () => {
    expect(parseComp("20-30")).toEqual({ min: 20, max: 30 });
    expect(parseComp("₹20–30 LPA")).toEqual({ min: 20, max: 30 });
    expect(parseComp("18 lakhs")).toEqual({ min: 18, max: 18 });
    expect(parseComp("up to 25 LPA")).toEqual({ min: null, max: 25 });
    expect(parseComp("12.5-18.5")).toEqual({ min: 12.5, max: 18.5 });
    expect(parseComp("0")).toBeNull();
    expect(parseComp("good")).toBeNull();
  });

  it("splits places however they are listed", () => {
    expect(parseCities("Bengaluru, Pune & Delhi NCR")).toEqual(["Bengaluru", "Pune", "Delhi NCR"]);
    expect(parseCities("Mumbai and Thane / Navi Mumbai")).toEqual(["Mumbai", "Thane", "Navi Mumbai"]);
    expect(parseCities("  ")).toEqual([]);
    expect(parseCities("a,b,c,d,e,f,g")).toHaveLength(5);
  });
});

describe("the campaign made from it", () => {
  const make = (f: JdFacts, answers: Answers = {}, defaults: Answers = {}, clientId = "") =>
    draftFromIntake({ facts: f, jd: "The description.", answers, defaults, owner: "Asha", clientId });

  it("takes everything the description stated, and creates no screening form unasked", () => {
    const d = make(everything({ department: "Engineering", seniority: "Senior", openings: 2, niceToHave: ["Kafka"], education: "B.Tech" }), {}, {}, "c1");
    expect(d).toMatchObject({
      name: "Backend Engineer", clientId: "c1", department: "Engineering", seniority: "Senior", workMode: "hybrid", locations: ["Bengaluru"],
      openings: 2, expMin: "4", expMax: "8", compMin: "20", compMax: "30", currency: "INR", notice: "Up to 30 days", education: "B.Tech",
      mustHave: ["Go"], niceToHave: ["Kafka"], jd: "The description.", screening: "none", owner: "Asha", recruiters: [],
    });
    expect(problemsOf(d)).toEqual([]);
  });

  it("puts the answers over what was not stated, and an answer of its own over the batch's", () => {
    const d = make(facts({ client: null }), { workMode: "remote", exp: { min: 5, max: null }, comp: { min: 18, max: 25 }, notice: "Immediate" }, { workMode: "onsite", locations: ["Pune"] });
    expect(d).toMatchObject({ workMode: "remote", expMin: "5", expMax: "", compMin: "18", compMax: "25", notice: "Immediate", locations: ["Pune"] });
  });

  it("leaves a skipped answer blank rather than inventing one", () => {
    const d = make(facts());
    expect(d).toMatchObject({ expMin: "", expMax: "", compMin: "", compMax: "", notice: "", locations: [], department: "", seniority: "" });
  });

  it("says in words what would stop it being created", () => {
    expect(problemsOf(make(facts({ title: "x" })))).not.toEqual([]);
  });

  it("is said as one line of what was found, with the answers in it", () => {
    expect(factLine(everything({ seniority: "Senior" }))).toBe("Winspire · Senior · Bengaluru · Hybrid · 4–8 yrs · ₹20–30 LPA · Up to 30 days");
    expect(factLine(everything({ title: "QA Lead", seniority: "Lead" }))).toBe("Winspire · Bengaluru · Hybrid · 4–8 yrs · ₹20–30 LPA · Up to 30 days");
    expect(factLine(facts(), { workMode: "remote", exp: { min: 5, max: null } }, "Acme")).toBe("Acme · Remote · 5+ yrs");
  });
});

describe("which files are sheets", () => {
  it("are the Excel and comma-separated ones, by name or by type", () => {
    expect(isSheetFile({ name: "roles.xlsx", type: "" })).toBe(true);
    expect(isSheetFile({ name: "roles.CSV", type: "" })).toBe(true);
    expect(isSheetFile({ name: "x", type: "text/csv" })).toBe(true);
    expect(isSheetFile({ name: "jd.pdf", type: "application/pdf" })).toBe(false);
    expect(isSheetFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
  });
});

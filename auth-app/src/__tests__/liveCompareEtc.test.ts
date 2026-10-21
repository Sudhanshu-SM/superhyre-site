import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Match, MatchProfile, RoleSpec } from "../api/agent";
import type { ApiBoardRow } from "../api/campaigns";
import {
  buildSource, chooseCampaign, compareVerdict, entryFromBoard, entryFromCandidate, entryFromMatch, evidenceLine, explicitIds, fitOf, matchFromProfile,
  mergeEntries, nameMentions, optionOf, plan, poolRank, resolveNames, sharedCampaigns, whoOptions,
} from "../liveViews/compareLogic";
import type { CompareSource, Entry } from "../liveViews/compareLogic";
import { enough, factsOf, groupsOf, missingOf, notesIn, questionsMessage } from "../liveViews/intakeLogic";
import { factsOf as pastFactsOf, happenedLine, nowLine, queryFromSaid, splitPast } from "../liveViews/rediscoverLogic";
import { askEveryone, askForTimes, whoToSchedule } from "../liveViews/scheduleLogic";

import { CompareDialog } from "../CompareDialog";
import { CRITERIA_FOR } from "../moments";
import { CANDIDATES } from "../sourcing";

/* The dialog portals into the document; here it only needs to render its contents. */
vi.mock("../ui", async (original) => ({ ...(await original<object>()), Dialog: ({ children }: { children: unknown }) => children }));

/* ── fixtures ───────────────────────────────────────────────────────────── */

const people: Entry[] = [
  { id: "a", personId: "a", candidateId: "ca", name: "Asha Sharma", title: "Android Engineer", company: "Flipkart", campaigns: ["c1", "c2"], stages: { c1: "shortlisted" }, tier: "B" },
  { id: "d", personId: "d", candidateId: "cd", name: "Deepa Rao", title: "Android Engineer", company: "PhonePe", campaigns: ["c1", "c2"], stages: { c1: "interviewing" }, tier: "A" },
  { id: "p1", personId: "p1", candidateId: "cp1", name: "Priya Krishnan", title: "iOS Engineer", company: "Dream11", campaigns: ["c1"], stages: { c1: "shortlisted" }, tier: null },
  { id: "p2", personId: "p2", candidateId: null, name: "Priya Kulkarni", title: "Android Engineer", company: "Meesho", campaigns: ["c1"], stages: {}, tier: "C" },
  { id: "k", personId: "k", candidateId: "ck", name: "Kavya Rao", title: null, company: null, campaigns: ["c1"], stages: { c1: "passed" }, tier: null },
];

const verdict = (requirementId: string, v: "met" | "partial" | "not_met" | "unknown", evidence = "") => ({ requirementId, verdict: v, evidence });
const criteria = [
  { id: "r1", text: "Kotlin", short: "Kotlin" },
  { id: "r2", text: "Android", short: "Android" },
  { id: "r3", text: "Jetpack Compose", short: "Compose" },
];

/* ── who a request names ────────────────────────────────────────────────── */

describe("names in a request", () => {
  it("takes the people the request lines up, and leaves the campaign out", () => {
    expect(nameMentions("Compare Asha Sharma and Ravi for fn3 Senior Android Engineer")).toEqual(["Asha Sharma", "Ravi"]);
    expect(nameMentions("compare asha vs ravi")).toEqual(["asha", "ravi"]);
    expect(nameMentions("Please compare Asha, Ravi and Meera?")).toEqual(["Asha", "Ravi", "Meera"]);
  });

  it("finds no names where the request names nobody", () => {
    expect(nameMentions("Compare two candidates for fn3 Senior Android Engineer")).toEqual([]);
    expect(nameMentions("compare them side by side")).toEqual([]);
    expect(nameMentions("Compare the shortlist")).toEqual([]);
  });

  it("matches a first name, a last name or the whole name to one person", () => {
    expect(resolveNames("Compare Asha and Deepa", people).ids).toEqual(["a", "d"]);
    expect(resolveNames("compare Rao and Sharma", people).ambiguous).toEqual([{ phrase: "Rao", ids: ["d", "k"] }]);
    expect(resolveNames("Compare Deepa Rao and Asha Sharma", people).ids).toEqual(["d", "a"]);
  });

  it("asks which person when a name fits two, and keeps the others", () => {
    const r = resolveNames("Compare Priya and Asha", people);
    expect(r.ids).toEqual(["a"]);
    expect(r.ambiguous).toEqual([{ phrase: "Priya", ids: ["p1", "p2"] }]);
  });

  it("prefers the exact full name over a partial one", () => {
    const pool = [...people, { ...people[0]!, id: "x", name: "Asha" }];
    expect(resolveNames("compare Asha and Deepa", pool).ids).toEqual(["x", "d"]);
  });

  it("reports names nobody here answers to, for a search of the whole workspace", () => {
    expect(resolveNames("Compare Asha Sharma and Zubin Mehta", people)).toMatchObject({ ids: ["a"], unresolved: ["Zubin Mehta"] });
  });

  it("does not read the campaign's words as a person's name", () => {
    const pool: Entry[] = [{ ...people[0]!, id: "m", name: "fn3 Meera Applicant" }];
    expect(resolveNames("Compare two candidates for fn3 Senior Android Engineer", pool).ids).toEqual([]);
  });

  it("still finds first or last names said without the usual words around them", () => {
    expect(resolveNames("which is better, Asha or Deepa", people).ids).toEqual(["a", "d"]);
  });

  it("does not add people who only share a surname with one already named", () => {
    expect(resolveNames("Compare Deepa Rao and Zubin", people)).toMatchObject({ ids: ["d"], unresolved: ["Zubin"] });
  });
});

describe("the people a card names", () => {
  it("keeps ids the pool knows, whether they are people or candidates, once each", () => {
    expect(explicitIds({ personIds: ["a", "zz"], candidateIds: ["cd", "ca"] }, people)).toEqual(["a", "d"]);
  });
});

/* ── which campaign's criteria ──────────────────────────────────────────── */

describe("which campaign to compare on", () => {
  it("is the campaigns everyone is in", () => {
    expect(sharedCampaigns([["c1", "c2"], ["c2", "c1", "c3"]])).toEqual(["c1", "c2"]);
    expect(sharedCampaigns([["c1"], ["c2"]])).toEqual([]);
    expect(sharedCampaigns([])).toEqual([]);
  });

  it("uses the named campaign when they are in it, the one they share otherwise, and asks when there are several", () => {
    expect(chooseCampaign({ named: "c1", shared: ["c1", "c2"] })).toEqual({ kind: "use", id: "c1" });
    expect(chooseCampaign({ named: null, shared: ["c2"] })).toEqual({ kind: "use", id: "c2" });
    expect(chooseCampaign({ named: null, shared: ["c1", "c2"] })).toEqual({ kind: "ask", options: ["c1", "c2"] });
    expect(chooseCampaign({ named: "c9", shared: ["c1", "c2"] })).toEqual({ kind: "ask", options: ["c1", "c2"] });
    expect(chooseCampaign({ named: null, shared: [] })).toEqual({ kind: "none" });
    expect(chooseCampaign({ named: "c1", shared: [] })).toEqual({ kind: "use", id: "c1" });
    expect(chooseCampaign({ named: null, shared: ["c1", "c2"], answered: "c2" })).toEqual({ kind: "use", id: "c2" });
  });
});

describe("what a comparison still needs", () => {
  const base = { card: { campaignId: null as string | null, ids: [] as string[] }, picked: [] as string[], answeredCampaign: null, pool: people };

  it("asks who when the request names nobody, and who else when it names one", () => {
    expect(plan({ ...base, said: "Compare two candidates" })).toMatchObject({ need: "who", ids: [] });
    expect(plan({ ...base, said: "Compare Asha with someone" })).toMatchObject({ need: "who", ids: ["a"] });
  });

  it("asks which one first when a name fits two people, and takes the answer", () => {
    expect(plan({ ...base, said: "Compare Priya and Asha" })).toMatchObject({ need: "which", ids: ["a"] });
    expect(plan({ ...base, said: "Compare Priya and Asha", picked: ["p2"] })).toMatchObject({ need: null, ids: ["a", "p2"], campaign: { kind: "use", id: "c1" } });
  });

  it("asks which campaign only when they share more than one and none was named", () => {
    expect(plan({ ...base, said: "Compare Asha and Deepa" })).toMatchObject({ need: "campaign", campaign: { kind: "ask", options: ["c1", "c2"] } });
    expect(plan({ ...base, said: "Compare Asha and Deepa", card: { campaignId: "c1", ids: [] } })).toMatchObject({ need: null, campaign: { kind: "use", id: "c1" } });
    expect(plan({ ...base, said: "Compare Asha and Deepa", answeredCampaign: "c2" })).toMatchObject({ need: null, campaign: { kind: "use", id: "c2" } });
  });

  it("is ready with two people from the card alone, and never more than four", () => {
    expect(plan({ ...base, said: "compare", card: { campaignId: "c1", ids: ["a", "d"] } })).toMatchObject({ need: null, ids: ["a", "d"] });
    expect(plan({ ...base, said: "compare", card: { campaignId: "c1", ids: ["a", "d", "p1", "p2", "k"] } }).ids).toHaveLength(4);
  });
});

describe("the people on offer", () => {
  it("reads a board row, a match and a workspace candidate as the same kind of entry", () => {
    const row = { personId: "pp", candidateId: "cc", fullName: "Asha Sharma", currentTitle: "Dev", currentCompanyName: "Acme", stage: "interviewing", tier: "A" } as ApiBoardRow;
    expect(entryFromBoard(row, "c1")).toMatchObject({ id: "pp", candidateId: "cc", campaigns: ["c1"], stages: { c1: "interviewing" }, tier: "A" });
    expect(entryFromMatch({ personId: "pm", fullName: "R", currentTitle: null, currentCompanyName: null, tier: "B" } as Match, "c1")).toMatchObject({ id: "pm", candidateId: null, tier: "B" });
    expect(entryFromCandidate({ id: "cx", personId: "px", fullName: "Z", currentTitle: null, currentCompanyName: null, campaigns: [{ id: "c1", stage: "passed" }, { id: "c2", stage: "hired" }] }))
      .toMatchObject({ id: "px", candidateId: "cx", campaigns: ["c1", "c2"], stages: { c1: "passed", c2: "hired" } });
  });

  it("joins the same person seen on a board and in the matches", () => {
    const board = [entryFromBoard({ personId: "pp", candidateId: "cc", fullName: "A", currentTitle: null, currentCompanyName: null, stage: "shortlisted", tier: null } as ApiBoardRow, "c1")];
    const found = entryFromCandidate({ id: "cc", personId: "pp", fullName: "A", currentTitle: null, currentCompanyName: null, campaigns: [{ id: "c2", stage: "passed" }] });
    const merged = mergeEntries(board, [found, entryFromMatch({ personId: "q", fullName: "B", currentTitle: null, currentCompanyName: null, tier: null } as Match, "c1")]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ campaigns: ["c1", "c2"], stages: { c1: "shortlisted", c2: "passed" } });
  });

  it("offers the shortlist first, then the rest of the board, then sourced people by fit", () => {
    expect(poolRank(people[0]!, "c1")).toBeLessThan(poolRank(people[1]!, "c1"));
    expect(poolRank(people[1]!, "c1")).toBeLessThan(poolRank(people[3]!, "c1"));
    const options = whoOptions(people, "c1", ["a"]);
    expect(options.map((o) => o.id)).toEqual(["p1", "d", "p2"]);
    expect(options.find((o) => o.id === "d")?.meta).toBe("Android Engineer at PhonePe · Interviewing");
  });

  it("says where someone stands elsewhere when they aren't on this campaign's board", () => {
    expect(optionOf(people[1]!, "c9", { c1: "Android" }).meta).toBe("Android Engineer at PhonePe · Interviewing in Android");
    expect(optionOf(people[3]!, "c1").meta).toBe("Android Engineer at Meesho");
  });
});

/* ── the judge's read ───────────────────────────────────────────────────── */

describe("fit from the judge's verdicts", () => {
  const judgement = {
    verdicts: [verdict("r1", "met", "Kotlin since 2019"), verdict("r2", "partial", "Android in a side project"), verdict("r3", "unknown")],
    strengths: [],
    concerns: [],
  };

  it("meets a criterion only when the judge found it met, with the judge's evidence beside it", () => {
    expect(fitOf(judgement, criteria)).toEqual({
      meets: [true, false, false],
      evidence: ["Kotlin since 2019", "Partly: Android in a side project", "Not clear from the profile"],
    });
  });

  it("says nothing for someone nobody judged", () => {
    expect(fitOf(null, criteria)).toBeNull();
    expect(fitOf(undefined, criteria)).toBeNull();
  });

  it("words each kind of verdict, and a criterion the judge never saw", () => {
    expect(evidenceLine(verdict("r1", "met"))).toBe("Yes");
    expect(evidenceLine(verdict("r1", "not_met"))).toBe("Not found");
    expect(evidenceLine(verdict("r1", "partial"))).toBe("Partly");
    expect(evidenceLine(undefined)).toBe("Not judged");
    expect(evidenceLine(verdict("r1", "met", `${"x".repeat(200)}`)).length).toBeLessThanOrEqual(140);
  });

  it("builds a source with only the judged people's fit, and where the others stand", () => {
    const s = buildSource({
      name: "Android",
      criteria,
      people: [{ id: "a", judgement, status: "Shortlisted" }, { id: "b", judgement: null, status: null }, { id: "c", judgement: null, status: "Interviewing" }],
    });
    expect(s.criteria).toEqual(["Kotlin", "Android", "Jetpack Compose"]);
    expect(Object.keys(s.meets)).toEqual(["a"]);
    expect(s.status).toEqual({ a: "Shortlisted", c: "Interviewing" });
  });

  it("turns a profile into the match the candidate surfaces read", () => {
    const mp = {
      profile: { personId: "px", fullName: "Asha", headline: "h", currentTitle: "Dev", currentCompanyName: "Acme", city: "Pune", yearsOfExperience: 6, linkedinUrl: null, experiences: [], skills: [] },
      education: [], profileImageUrl: null, stage: null, score: 0.8, tier: "A", judgement: null,
    } as unknown as MatchProfile;
    expect(matchFromProfile("px", mp)).toMatchObject({ personId: "px", fullName: "Asha", stage: "judged", tier: "A", knockedOut: null, judgement: null });
  });
});

describe("the line that says who leads", () => {
  const rated = (id: string, name: string, totalYears: number, avgTenure = 2) => ({ id, name, totalYears, avgTenure });
  const source = (meets: Record<string, boolean[]>): CompareSource => ({ name: "Android", criteria: ["Kotlin", "Android", "Compose"], meets, evidence: {} });

  it("leads with who meets more criteria, then years, and says what the others miss", () => {
    const v = compareVerdict(
      [rated("a", "Asha Sharma", 7), rated("b", "Ravi Rao", 9)],
      source({ a: [true, true, true], b: [true, false, true] }),
    );
    expect(v.leadId).toBe("a");
    expect(v.line).toBe("Asha Sharma meets 3 of 3 Android criteria with 7 years and 2 years average tenure. Ravi Rao misses Android.");
  });

  it("breaks a tie on criteria with years, and says the other meets the same", () => {
    const v = compareVerdict([rated("a", "Asha Sharma", 7), rated("b", "Ravi Rao", 4)], source({ a: [true, true, false], b: [true, true, false] }));
    expect(v.leadId).toBe("a");
    expect(v.line).toContain("Ravi Rao meets the same criteria with 4 years");
  });

  it("names no pick when they are level on everything", () => {
    const v = compareVerdict([rated("a", "Asha Sharma", 7), rated("b", "Ravi Rao", 7)], source({ a: [true, true, false], b: [true, true, false] }));
    expect(v.leadId).toBeNull();
    expect(v.line).toBe("Asha Sharma and Ravi Rao are level: each meets 2 of 3 Android criteria with 7 years.");
  });

  it("does not rank someone nobody judged, and says so", () => {
    const v = compareVerdict([rated("a", "Asha Sharma", 7), rated("b", "Ravi Rao", 20)], source({ a: [true, false, false] }));
    expect(v.leadId).toBeNull();
    expect(v.line).toContain("Asha Sharma meets 1 of 3 Android criteria");
    expect(v.line).toContain("Ravi Rao hasn't been judged on these criteria yet.");
  });

  it("goes on experience alone, with no pick, when nobody was judged", () => {
    const v = compareVerdict([rated("a", "Asha Sharma", 7, 3), rated("b", "Ravi Rao", 4)], source({}));
    expect(v.leadId).toBeNull();
    expect(v.line).toBe("None of them has been judged on the Android criteria yet, so this is on experience alone. Asha Sharma has the most at 7 years, 3 years average tenure; Ravi Rao has 4 years.");
  });

  it("says when they share no campaign", () => {
    const v = compareVerdict([rated("a", "Asha Sharma", 3), rated("b", "Ravi Rao", 3)], { name: "", criteria: [], meets: {}, evidence: {} });
    expect(v.line).toBe("They aren't on a campaign together, so this is on experience alone. They are level at 3 years.");
    expect(compareVerdict([rated("a", "Asha Sharma", 1)], null).line).toContain("1 year");
  });
});

/* ── intake ─────────────────────────────────────────────────────────────── */

const spec = (over: Partial<RoleSpec> = {}): RoleSpec => ({
  title: "Senior Backend Engineer",
  seniority: "senior",
  yearsMin: 5,
  yearsMax: 9,
  locations: ["Pune"],
  remoteOk: false,
  avoid: [],
  requirements: [
    { id: "r1", kind: "skill", text: "Postgres at scale", importance: "must", weight: 0.9 },
    { id: "r2", kind: "skill", text: "Go", importance: "nice", weight: 0.3 },
    { id: "r3", kind: "location", text: "Based in Pune", importance: "knockout", weight: 1 },
    { id: "r4", kind: "skill", text: "Kafka", importance: "must", weight: 0.5 },
  ],
  ...over,
});

describe("call notes", () => {
  const notes = "We need a senior backend engineer with Postgres at scale, five to nine years, Go is a plus. Pune based, hybrid.";

  it("takes the notes after the request's lead-in", () => {
    expect(notesIn(`Notes from the call with the hiring manager: ${notes}`)).toBe(notes);
    expect(notesIn(`Intake notes: ${notes}`)).toBe(notes);
  });

  it("takes a long pasted brief whole, and nothing from a request that only asks for them", () => {
    const brief = `${notes} ${notes} ${notes}`;
    expect(notesIn(brief)).toBe(brief);
    expect(notesIn(`Hiring manager said we need Go\n${brief}`)).toBe(`Hiring manager said we need Go\n${brief}`);
    expect(notesIn("Notes from the call with the hiring manager for fn3 Senior Android Engineer")).toBeNull();
    expect(notesIn("Notes from the call: Go and Postgres")).toBeNull();
  });

  it("is enough only when the API can draft from it", () => {
    expect(enough("short")).toBe(false);
    expect(enough(notes)).toBe(true);
  });
});

describe("a drafted role, read back", () => {
  it("lists what it understood about the role", () => {
    expect(factsOf(spec())).toEqual([
      { label: "Level", value: "Senior" },
      { label: "Experience", value: "5 to 9 years" },
      { label: "Location", value: "Pune" },
    ]);
    expect(factsOf(spec({ seniority: null, yearsMin: 4, yearsMax: null, locations: [], remoteOk: true }))).toEqual([
      { label: "Experience", value: "4+ years" },
      { label: "Location", value: "Remote" },
    ]);
    expect(factsOf(spec({ locations: ["Pune"], remoteOk: true })).at(-1)).toEqual({ label: "Location", value: "Pune or remote" });
  });

  it("groups requirements by how much they matter, heaviest first, and leaves empty groups out", () => {
    const g = groupsOf(spec({ avoid: ["Agency recruiters"] }));
    expect(g.map((x) => x.id)).toEqual(["knockout", "must", "nice", "avoid"]);
    expect(g.find((x) => x.id === "must")?.items).toEqual(["Postgres at scale", "Kafka"]);
    expect(groupsOf(spec({ requirements: [spec().requirements[1]!] })).map((x) => x.id)).toEqual(["nice"]);
  });

  it("names what the notes leave open", () => {
    const open = missingOf(spec({ seniority: null, yearsMin: null, yearsMax: null, locations: [], remoteOk: false }), "Backend, Postgres, Kafka.");
    expect(open.map((o) => o.ask)).toEqual([
      "How senior should they be?",
      "How many years of experience should they have?",
      "Where should they be based, or is remote fine?",
      "What's the budget?",
    ]);
  });

  it("does not ask about what the notes say", () => {
    expect(missingOf(spec(), "Budget is 30 to 40 lakhs.")).toEqual([]);
    expect(missingOf(spec({ remoteOk: true }), "CTC 35 LPA").map((o) => o.ask)).toEqual(["Does remote include people outside Pune?"]);
    expect(missingOf(spec({ requirements: [spec().requirements[1]!] }), "CTC 35 LPA").map((o) => o.ask)).toEqual(["What must they be able to do?"]);
  });

  it("writes the questions into a message for the composer, never sent", () => {
    expect(questionsMessage("Backend", ["What's the budget?", "Is remote fine?"])).toBe(
      "Write a short message to the hiring manager for Backend, asking:\n- What's the budget?\n- Is remote fine?",
    );
  });
});

/* ── rediscover ─────────────────────────────────────────────────────────── */

const row = (id: string, name: string, campaigns: { id: string; name: string; stage: string }[], over: Record<string, unknown> = {}) => ({
  id, fullName: name, currentTitle: "Android Engineer", currentCompanyName: "Acko", city: "Pune", yearsOfExperience: 5, linkedinUrl: null, campaigns, ...over,
});

describe("what to look for", () => {
  it("is what the request asks for, without the asking", () => {
    expect(queryFromSaid("Anyone from past searches for Kotlin?")).toBe("Kotlin");
    expect(queryFromSaid("Anyone from past searches for Kotlin for fn4 Backend Engineer?", "fn4 Backend Engineer")).toBe("Kotlin");
    expect(queryFromSaid("Do we have anyone who knows Jetpack Compose from earlier searches")).toBe("Jetpack Compose");
    expect(queryFromSaid("rediscover silver medalists")).toBeNull();
    expect(queryFromSaid("Anyone from past searches?")).toBeNull();
  });
});

describe("people found in the workspace", () => {
  const found = [
    row("never", "Nia", []),
    row("passed", "Pia", [{ id: "old", name: "Android, March", stage: "passed" }]),
    row("final", "Fay", [{ id: "old", name: "Android, March", stage: "interviewing" }, { id: "older", name: "iOS", stage: "shortlisted" }]),
    row("hired", "Hal", [{ id: "old", name: "Android, March", stage: "hired" }]),
    row("here", "Ivy", [{ id: "now", name: "Backend", stage: "shortlisted" }]),
    row("final", "Fay again", []),
  ];

  it("puts those who got furthest first, people never on a search last, and those already on the campaign apart", () => {
    const { fresh, here } = splitPast(found, "now");
    expect(fresh.map((p) => p.id)).toEqual(["final", "passed", "hired", "never"]);
    expect(here.map((p) => p.id)).toEqual(["here"]);
    expect(here[0]?.here).toBe("shortlisted");
  });

  it("lists the earlier campaigns, furthest first, never the one being filled", () => {
    const fay = splitPast(found, "older").here.find((p) => p.id === "final");
    expect(fay?.before.map((b) => b.stage)).toEqual(["interviewing"]);
    expect(splitPast(found, null).fresh.find((p) => p.id === "final")?.before.map((b) => b.stage)).toEqual(["interviewing", "shortlisted"]);
  });

  it("says where they are now and what happened", () => {
    expect(nowLine({ title: "Android Engineer", company: "Acko", city: "Pune" })).toBe("Now Android Engineer · Acko");
    expect(nowLine({ title: null, company: null, city: "Pune" })).toBe("Based in Pune");
    expect(happenedLine("interviewing")).toBe("Got as far as interviews.");
    expect(happenedLine("passed", "Skills")).toBe("Was rejected (skills).");
    expect(happenedLine("passed")).toBe("Was rejected.");
  });

  it("reads when each stage began and the latest reason someone was passed on", () => {
    const f = pastFactsOf({
      campaigns: [{ id: "old", stageEnteredAt: "2026-03-14T10:00:00Z" }, { id: "older", addedAt: "2025-11-02T10:00:00Z" }],
      activity: [
        { verb: "moved", campaignId: "old", data: { to: "passed", reason: "Experience" } },
        { verb: "moved", campaignId: "old", data: { to: "passed", reason: "Skills" } },
        { verb: "updated", campaignId: "old", data: {} },
      ],
    });
    expect(f.when).toEqual({ old: "Mar 2026", older: "Nov 2025" });
    expect(f.reason).toEqual({ old: "Experience" });
  });
});

/* ── schedule ───────────────────────────────────────────────────────────── */

const board = (stage: string, name: string, over: Partial<ApiBoardRow> = {}) =>
  ({ campaignCandidateId: `cc-${name}`, candidateId: `c-${name}`, personId: `p-${name}`, fullName: name, stage, ...over }) as ApiBoardRow;

describe("who to schedule", () => {
  const rows = [board("interviewing", "Pooja Banerjee"), board("shortlisted", "Deepa Rao"), board("outreach", "Kavya Rao"), board("passed", "Arjun Verma"), board("interviewing", "Karthik Rao")];

  it("is those in interviews, then the shortlist, from the real board", () => {
    const { groups, named } = whoToSchedule(rows, "Schedule interviews for fn3 Senior Android Engineer");
    expect(named).toBe(false);
    expect(groups.map((g) => [g.stage, g.rows.map((r) => r.fullName)])).toEqual([
      ["interviewing", ["Pooja Banerjee", "Karthik Rao"]],
      ["shortlisted", ["Deepa Rao"]],
    ]);
  });

  it("is only the people named, wherever they stand", () => {
    const { groups, named } = whoToSchedule(rows, "Schedule an interview with Kavya Rao");
    expect(named).toBe(true);
    expect(groups.map((g) => [g.stage, g.rows.map((r) => r.fullName)])).toEqual([["outreach", ["Kavya Rao"]]]);
    expect(whoToSchedule(rows, "schedule them", ["c-Arjun Verma"]).groups[0]?.rows[0]?.fullName).toBe("Arjun Verma");
  });

  it("is nobody when no one is in line", () => {
    expect(whoToSchedule([board("outreach", "Kavya Rao")], "Schedule interviews").groups).toEqual([]);
  });

  it("asks for times by putting a message in the composer, nothing more", () => {
    expect(askForTimes("Pooja Banerjee", "Android")).toBe("Write a short message to Pooja asking which times this week or next suit them for an interview for Android.");
    expect(askEveryone(["Pooja Banerjee", "Karthik Rao"], "Android")).toBe("Write a short message for each of Pooja, Karthik asking which times this week or next suit them for an interview for Android.");
  });
});

/* ── the dialog itself ──────────────────────────────────────────────────── */

describe("the comparison dialog", () => {
  const ctx = { said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {}, deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {}, prefs: {}, setPref: () => {} } as never;
  const render = (props: object) => renderToStaticMarkup(createElement(CompareDialog as never, { open: true, onClose: () => {}, ctx, ...props }));
  const two = [CANDIDATES[0]!, CANDIDATES[1]!];

  it("still compares on the demo's own criteria when no workspace source is given", () => {
    const html = render({ people: two, camp: "backend-snr" });
    for (const c of CRITERIA_FOR["backend-snr"]) expect(html).toContain(c);
    expect(html).toContain("Open to work");
    expect(html).toContain("Public code");
  });

  it("compares on the campaign's real criteria, leaves someone nobody judged without a fit, and drops what a search never read", () => {
    const [a, b] = two;
    const source: CompareSource = {
      name: "Senior Android Engineer",
      criteria: ["Kotlin", "Compose"],
      meets: { [a!.id]: [true, false] },
      evidence: { [a!.id]: ["Kotlin since 2019", "Not found"] },
      status: { [b!.id]: "Interviewing" },
    };
    const html = render({ people: two, source });
    expect(html).toContain("Fit for Senior Android Engineer");
    expect(html).toContain("Kotlin since 2019");
    expect(html).toContain("Not judged");
    expect(html).toContain("Interviewing");
    expect(html).not.toContain("Open to work");
    expect(html).not.toContain("Public code");
    expect(html).not.toContain(CRITERIA_FOR["backend-snr"][0]!);
  });

  it("leaves the fit section out when nobody was judged", () => {
    const html = render({ people: two, source: { name: "", criteria: [], meets: {}, evidence: {} } });
    expect(html).not.toContain("Fit for");
    expect(html).toContain("Profiles side by side");
  });
});

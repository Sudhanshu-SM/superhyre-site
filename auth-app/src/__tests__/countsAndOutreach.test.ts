import { describe, expect, it } from "vitest";
import type { MatchCounts, SourcingStatus } from "../api/agent";
import type { Message, Thread } from "../api/outreach";
import type { PipelinePerson } from "../campaign";
import { setFromMatches } from "../liveCandidate";
import { stuckOf } from "../liveReports";
import { nobodyWaitingLine, poolOf, poolSentence } from "../liveSourcing";
import { scopeLine, scopeOf } from "../liveViews/outreachScope";
import { cancellable, goesOut, GOING_OUT_MS, listedByName, nextLookMs, sectionsOf } from "../outreachView";
import { pipelineNumbers, repliedTile, shownConversion } from "../pipelineNumbers";

/**
 * The numbers a person reads are the server's one definition, and a person who may not be written to
 * never sits in a queue with a button. These pin what the console does with what the server says.
 */

const NOW = Date.parse("2026-10-12T10:00:00Z");

describe("the Pipeline header says what every page says", () => {
  const person = (id: string, stage: PipelinePerson["stage"], over: Partial<PipelinePerson> = {}) =>
    ({ id, stage, step: null, ...over }) as PipelinePerson;
  // Eight cards on the board: passed people who were never written to, and a hire that skipped outreach.
  const board = [
    person("a", "outreach", { step: "replied", replied: true }),
    person("b", "outreach", { step: "waiting" }),
    person("c", "hired"),
    person("d", "passed"),
    person("e", "passed"),
    person("f", "shortlisted"),
    person("g", "shortlisted"),
    person("h", "interviewing", { step: "loop", replied: true }),
  ];
  const reach = { found: 50, shortlisted: 8, outreach: 3, replied: 2, interviewing: 1, hired: 1 };
  const rates = { kept: 16, reachedOut: 38, replied: 67, interviewing: 33, hired: 100 };

  it("reads contacted and replied from the server, not from the cards on the board", () => {
    const n = pipelineNumbers(board, reach, rates);
    expect(n).toMatchObject({ contacted: 3, replied: 2, repliedPct: 67 });
    expect(n.conv).toEqual({ outreach: 38, interviewing: 33, hired: 100 });
  });

  it("does not move when someone who was never written to is passed", () => {
    const before = pipelineNumbers(board, reach, rates);
    // One more shortlisted card is passed: the board changes, the people contacted do not.
    const after = pipelineNumbers(board.map((p) => (p.id === "f" ? person("f", "passed") : p)), reach, rates);
    expect(after).toEqual(before);
  });

  it("says a dash, not '0% · 0 of 0', when nobody was contacted, as the Overview does", () => {
    const none = pipelineNumbers([person("a", "shortlisted")], { found: 9, shortlisted: 1, outreach: 0, replied: 0, interviewing: 0, hired: 0 }, {
      kept: 11, reachedOut: 0, replied: null, interviewing: null, hired: null,
    });
    expect(repliedTile(none)).toEqual({ figure: "–", sub: "Nobody contacted yet" });
    expect(repliedTile({ contacted: 5, replied: 2, repliedPct: 40 })).toEqual({ figure: "40%", sub: "2 of 5" });
    // Contacted, nobody replied: a real 0%.
    expect(repliedTile({ contacted: 3, replied: 0, repliedPct: 0 })).toEqual({ figure: "0%", sub: "0 of 3" });
  });

  it("leaves '0%' off a stage people reached without the step before it", () => {
    // One person was added straight to interviewing: "Interviewing 1" with "0%" under it reads as a bug.
    expect(shownConversion(0, 1)).toBeNull();
    expect(shownConversion(0, 0)).toBe(0);
    expect(shownConversion(33, 1)).toBe(33);
    expect(shownConversion(null, 4)).toBeNull();
  });

  it("works from the people only when the server has sent nothing (the demo's fixtures)", () => {
    const n = pipelineNumbers(board);
    expect(n.contacted).toBe(6);
    expect(n.replied).toBe(2);
  });
});

describe("found people stay found", () => {
  const status = (over: Partial<SourcingStatus> = {}): SourcingStatus => ({
    approvedSpec: { id: "s", version: 1 }, shown: 58, requests: 1, nextSize: 10, exhausted: false, crustdata: true, ...over,
  });
  const counts = (over: Partial<MatchCounts> = {}): MatchCounts => ({ found: 50, shortlisted: 0, passed: 0, toReview: 40, ruledOut: 10, unranked: 0, ...over });

  it("uses the server's found, not the ledger's, and does not shrink when people are decided", () => {
    const before = poolOf(status(), 40, counts());
    const after = poolOf(status(), 37, counts({ shortlisted: 2, passed: 1, toReview: 37 }));
    expect(before.found).toBe(50);
    expect(after.found).toBe(50);
    // Ranked is everyone the list holds, decided included; waiting is what is left to review.
    expect(before.ranked).toBe(40);
    expect(after.ranked).toBe(40);
    expect(before.waiting).toBe(40);
    expect(after.waiting).toBe(37);
    expect(poolSentence(after)).toBe("50 people found so far, 37 of them ranked and waiting for your call. The next search looks through our own database, then asks our data provider for more.");
  });

  it("keeps the old reading for a server that sends no counts", () => {
    const p = poolOf(status({ shown: 5 }), 9);
    expect(p).toMatchObject({ found: 9, ranked: 9, waiting: 9 });
  });

  it("says why nobody is waiting, truthfully", () => {
    const all = poolOf(status(), 0, counts({ found: 5, shortlisted: 3, passed: 2, toReview: 0, ruledOut: 0 }));
    expect(nobodyWaitingLine(all)).toBe("Everyone found so far has been shortlisted or passed.");
    // The spec changed: people were found and never decided, they are just not ranked yet.
    const changed = poolOf(status(), 0, counts({ found: 58, shortlisted: 11, passed: 6, toReview: 0, ruledOut: 0, unranked: 41 }));
    expect(nobodyWaitingLine(changed)).toBe("41 people found earlier have not been ranked on the latest role spec yet. The next search ranks them.");
    expect(nobodyWaitingLine(changed)).not.toMatch(/shortlisted or passed/);
    expect(nobodyWaitingLine(changed, true)).toBe("Matching 41 people to the role now.");
    const out = poolOf(status(), 0, counts({ found: 10, shortlisted: 2, passed: 0, toReview: 0, ruledOut: 8 }));
    expect(nobodyWaitingLine(out)).toBe("Everyone else found, 8, do not meet a hard requirement.");
    expect(nobodyWaitingLine(poolOf(status(), 3, counts({ toReview: 3 })))).toBeNull();
  });

  it("keeps decided people in the ranked list, marked, so its counts do not drop to zero", () => {
    const m = (id: string, decision: "shortlisted" | "passed" | null = null) => ({
      personId: id, fullName: `Person ${id}`, headline: null, currentTitle: null, currentCompanyName: null, city: null, linkedinUrl: null,
      profileImageUrl: null, yearsOfExperience: null, source: "ours", stage: "judged" as const, score: 0.7, tier: "B" as const, knockedOut: null,
      judgement: null, decision,
    });
    const set = setFromMatches("c1", [m("a"), m("b")], null, new Date(NOW), [m("c", "shortlisted"), m("d", "passed")]);
    expect(set.total).toBe(4);
    expect(set.candidates.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(set.decisions).toEqual({ c: "shortlisted", d: "rejected" });
  });
});

describe("the outreach card", () => {
  const msg = (id: string, status: Message["status"], over: Partial<Message> = {}): Message => ({
    id, direction: "out", subject: "Hi", body: "Hello", status, scheduledFor: null, sentAt: null, error: null, outcome: null,
    createdAt: "2026-10-12T08:00:00Z", ...over,
  });
  const thread = (id: string, messages: Message[], doNotContact: string | null = null): Thread => ({
    id, campaignCandidateId: `cc-${id}`, stage: "shortlisted",
    candidate: { id: `c-${id}`, name: `Person ${id}`, title: null, company: null, primaryEmail: `${id}@x.in` }, messages, doNotContact,
  });

  it("sets a listed person apart: no draft to approve, no Approve all, no queue", () => {
    const threads = [
      thread("a", [msg("a1", "draft")]),
      thread("b", [msg("b1", "draft")], "Person b is marked do not contact."),
      thread("c", [msg("c1", "draft")], "Person c is marked do not contact."),
      thread("d", [msg("d1", "scheduled", { scheduledFor: new Date(NOW + 3_600_000).toISOString() })], "Person d is marked do not contact."),
    ];
    const s = sectionsOf(threads);
    expect(s.drafts.map((i) => i.message.id)).toEqual(["a1"]);
    expect(s.scheduled).toEqual([]);
    expect(s.doNotContact.map((i) => i.thread.candidate.name)).toEqual(["Person b", "Person c", "Person d"]);
  });

  it("names every person it counts as on the do-not-contact list, not only the one with a message waiting", () => {
    // Three are left out: b has a draft that was set apart; c was listed by address and d was never written to.
    const threads = [thread("a", [msg("a1", "draft")]), thread("b", [msg("b1", "draft")], "Person b is marked do not contact.")];
    const people = [
      { campaignCandidateId: "cc-a", fullName: "Person a" },
      { campaignCandidateId: "cc-b", fullName: "Person b", suppressed: true },
      { campaignCandidateId: "cc-c", fullName: "Person c", suppressed: true },
      { campaignCandidateId: "cc-d", fullName: "Person d", suppressed: true },
    ];
    const named = listedByName(sectionsOf(threads).doNotContact, people);
    expect(named.map((p) => p.name)).toEqual(["Person b", "Person c", "Person d"]);
    // The sentence above the card counts the same three, so the card never counts more than it names.
    const line = scopeLine({ basis: "shortlist", missing: 0, fellBack: false }, 4, 1, named.length);
    expect(line).toContain("3 are on the do-not-contact list, so they are left out.");
    expect(named).toHaveLength(3);
    // Without a run's people (the campaign page), the held ones are named as they were.
    expect(listedByName(sectionsOf(threads).doNotContact).map((p) => p.name)).toEqual(["Person b"]);
  });

  it("keeps what already went out to someone later listed in the history", () => {
    const threads = [thread("e", [msg("e1", "sent", { sentAt: "2026-10-11T09:00:00Z" })], "Person e is marked do not contact.")];
    const s = sectionsOf(threads);
    expect(s.sent.map((i) => i.message.id)).toEqual(["e1"]);
    expect(s.doNotContact).toEqual([]);
  });

  it("offers Cancel only to a message that can still be called back", () => {
    const later = { status: "scheduled", scheduledFor: new Date(NOW + 10 * 60_000).toISOString() };
    const due = { status: "scheduled", scheduledFor: new Date(NOW + GOING_OUT_MS - 1000).toISOString() };
    expect(cancellable(later, NOW)).toBe(true);
    expect(cancellable(due, NOW)).toBe(false);
    expect(cancellable({ status: "sending", scheduledFor: null }, NOW)).toBe(false);
    expect(cancellable({ status: "sent", scheduledFor: null }, NOW)).toBe(false);
    expect(goesOut(due, NOW)).toBe("now");
    expect(goesOut(later, NOW)).toBe("later");
  });

  it("looks again just after a message is due, and not at all when nothing is on its way", () => {
    const soon = thread("f", [msg("f1", "scheduled", { scheduledFor: new Date(NOW + 20_000).toISOString() })]);
    const far = thread("g", [msg("g1", "scheduled", { scheduledFor: new Date(NOW + 3_600_000).toISOString() })]);
    expect(nextLookMs([soon], NOW)).toBe(25_000);
    expect(nextLookMs([far], NOW)).toBe(30_000);
    expect(nextLookMs([soon, far], NOW)).toBe(25_000);
    expect(nextLookMs([thread("h", [msg("h1", "sent")]), thread("i", [msg("i1", "draft")])], NOW)).toBeNull();
  });
});

describe("who an outreach run is for", () => {
  it("marks people the server says are on the do-not-contact list, so the count leaves them out", () => {
    const row = (id: string, doNotContact: boolean) =>
      ({
        campaignCandidateId: `cc-${id}`, candidateId: `c-${id}`, personId: `p-${id}`, fullName: `Person ${id}`, currentTitle: null,
        currentCompanyName: null, city: null, linkedinUrl: null, stage: "shortlisted", step: null, ownerId: null, source: "agent",
        fit: null, tier: null, addedAt: "2026-10-01T00:00:00Z", yearsOfExperience: null, skills: [], daysInStage: 0,
        lastActivityAt: "2026-10-01T00:00:00Z", hasEmail: true, hasPhone: false, doNotContact,
      }) as Parameters<typeof scopeOf>[0][number];
    const scope = scopeOf([row("a", false), row("b", true), row("c", true)]);
    expect(scope.people.filter((p) => p.suppressed).map((p) => p.fullName)).toEqual(["Person b", "Person c"]);
    expect(scope.people.filter((p) => p.hasEmail && !p.suppressed)).toHaveLength(1);
  });
});

describe("who is left to reach out to", () => {
  it("leaves out someone on the do-not-contact list: no follow-up or answer is offered for them", () => {
    const p = (name: string, stage: "shortlisted" | "outreach", step: "waiting" | "replied" | null, doNotContact = false) => ({
      name, stage, step, inStage: 3, ...(doNotContact ? { doNotContact: true as const } : {}),
    });
    const stuck = stuckOf([
      p("Ana Rao", "outreach", "waiting"),
      p("Listed One", "outreach", "waiting", true),
      p("Listed Two", "outreach", "replied", true),
      p("Fresh Pick", "shortlisted", null),
      p("Listed Three", "shortlisted", null, true),
    ]);
    expect(stuck.map((s) => [s.kind, s.n])).toEqual([["shortlisted", 1], ["waiting", 1]]);
  });
});

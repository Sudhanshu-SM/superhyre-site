import { describe, expect, it } from "vitest";
import type { CardPerson, ChatCard } from "../api/agent";
import type { RunEvent } from "../api/events";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import { campaignFacts, campaignHref, funnel, peopleHeading, peopleSubline, personLine, personStatus, searchLine, specLine } from "../chatCards";

const person = (p: Partial<CardPerson> = {}): CardPerson => ({
  personId: "p1", candidateId: null, campaignCandidateId: null, name: "Asha Verma", title: "Staff Engineer", company: "Razorpay",
  city: "Bengaluru", years: 9, tier: "A", stage: null, daysInStage: null, strengths: ["Led a ledger migration"], concerns: ["Short tenure"],
  linkedinUrl: "https://www.linkedin.com/in/asha", ...p,
});

let seq = 0;
const ev = (type: RunEvent["type"], payload: Record<string, unknown>): RunEvent => ({
  ...payload, id: ++seq, runId: "r1", seq, type, at: "2026-10-05T10:00:05.000Z",
});
const chat = (): ChatState => ({
  conversationId: "c1",
  turns: [{ ...newTurn("t1", "who fits?", 0), runId: "r1", status: "working" }],
  owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
});

const peopleCard = (over: Partial<Extract<ChatCard, { kind: "people" }>> = {}): Extract<ChatCard, { kind: "people" }> => ({
  kind: "people", key: "matches:c:all", source: "matches", campaignId: "c", campaignName: "Android Engineer", narrowedTo: null, total: 1, people: [person()], ...over,
});

describe("cards in a chat turn", () => {
  it("collects what the agent looked up, in order", () => {
    const s = [
      ev("artifact", { ...peopleCard() }),
      ev("artifact", { kind: "campaigns", key: "campaigns", items: [{ id: "c", name: "Android Engineer", status: "active", client: null }] }),
    ].reduce(applyEvent, chat());
    expect(s.turns[0]?.cards.map((c) => c.kind)).toEqual(["people", "campaigns"]);
  });

  it("replaces a card when the same thing is looked up again, keeping its place", () => {
    const s = [
      ev("artifact", { ...peopleCard() }),
      ev("artifact", { kind: "campaigns", key: "campaigns", items: [] }),
      ev("artifact", { ...peopleCard({ total: 3, people: [person(), person({ personId: "p2", name: "Ravi Kumar" })] }) }),
    ].reduce(applyEvent, chat());
    const cards = s.turns[0]?.cards ?? [];
    expect(cards.map((c) => c.key)).toEqual(["matches:c:all", "campaigns"]);
    expect((cards[0] as Extract<ChatCard, { kind: "people" }>).people).toHaveLength(2);
  });

  it("ignores a replayed event, and keeps a card kind it doesn't know without breaking", () => {
    const first = ev("artifact", { ...peopleCard() });
    let s = applyEvent(chat(), first);
    s = applyEvent(s, first);
    // A kind from a newer server is kept, in order, and drawn as nothing.
    s = applyEvent(s, ev("artifact", { kind: "hologram", key: "h" }));
    // A card with no key can't be told from another, so it is dropped.
    s = applyEvent(s, ev("artifact", { kind: "people", people: [] }));
    expect(s.turns[0]?.cards.map((c) => c.kind)).toEqual(["people", "unknown"]);
  });

  it("keeps who an approval is about", () => {
    const s = applyEvent(
      chat(),
      ev("approval", {
        action: { action: "shortlist", campaignId: "c" },
        summary: "Shortlist Asha Verma and Ravi Kumar for Android Engineer",
        campaignName: "Android Engineer",
        people: [{ name: "Asha Verma", title: "Staff Engineer", company: "Razorpay", city: null }, { name: "Ravi Kumar", title: null, company: null, city: null }],
      }),
    );
    expect(s.turns[0]?.approvals[0]).toMatchObject({ campaignName: "Android Engineer", people: [{ name: "Asha Verma" }, { name: "Ravi Kumar" }] });
  });

  it("copes with an approval from a server that doesn't send people yet", () => {
    const s = applyEvent(chat(), ev("approval", { action: { action: "find_people", campaignId: "c" }, summary: "Find more people" }));
    expect(s.turns[0]?.approvals[0]).toMatchObject({ people: [], campaignName: null });
  });
});

describe("what the cards say", () => {
  it("describes a person from what is known, leaving the rest out", () => {
    expect(personLine({ title: "Staff Engineer", company: "Razorpay", city: "Bengaluru" })).toBe("Staff Engineer at Razorpay, Bengaluru");
    expect(personLine({ title: null, company: "Razorpay", city: null })).toBe("Razorpay");
    expect(personLine({ title: null, company: null, city: null })).toBe("");
  });

  it("says how good a fit, or where on the board and for how long", () => {
    expect(personStatus({ tier: "B", stage: null, daysInStage: null })).toBe("Good fit");
    expect(personStatus({ tier: null, stage: "interviewing", daysInStage: 3 })).toBe("Interviewing · 3 days");
    expect(personStatus({ tier: "A", stage: "outreach", daysInStage: 1 })).toBe("Strong fit · In outreach · 1 day");
    expect(personStatus({ tier: null, stage: "hired", daysInStage: 0 })).toBe("Hired");
    expect(personStatus({ tier: null, stage: null, daysInStage: null })).toBeNull();
  });

  it("counts only the people shown, and says when that's part of a longer list", () => {
    expect(peopleHeading(peopleCard())).toBe("1 person worth a look");
    expect(peopleHeading(peopleCard({ total: 12, people: [person(), person({ personId: "p2" })] }))).toBe("2 people of 12 worth a look");
    expect(peopleHeading(peopleCard({ source: "pipeline", narrowedTo: "interviewing" }))).toBe("1 person interviewing");
    expect(peopleHeading(peopleCard({ source: "pipeline", narrowedTo: "recommended" }))).toBe("Who to interview next");
    expect(peopleHeading(peopleCard({ source: "pipeline", narrowedTo: "shortlisted" }))).toBe("1 person on the shortlist");
    expect(peopleHeading(peopleCard({ source: "pipeline", narrowedTo: "outreach" }))).toBe("1 person in outreach");
    expect(peopleHeading(peopleCard({ source: "pipeline", narrowedTo: null }))).toBe("1 person on the board");
    expect(peopleHeading(peopleCard({ source: "found", narrowedTo: "priya" }))).toBe("1 person matching “priya”");
    expect(peopleSubline(peopleCard({ narrowedTo: "Tier A" }))).toBe("Android Engineer · Tier A");
  });

  it("lays a campaign's board out in reading order and drops stages nobody is in, except hired", () => {
    expect(funnel([{ stage: "passed", people: 2 }, { stage: "outreach", people: 4 }])).toEqual([
      { stage: "shortlisted", label: "Shortlisted", people: 0 },
      { stage: "outreach", label: "In outreach", people: 4 },
      { stage: "hired", label: "Hired", people: 0 },
      { stage: "passed", label: "Rejected", people: 2 },
    ]);
    // Hired always shows: it is what the whole campaign is for.
    expect(funnel([]).map((s) => s.stage)).toEqual(["shortlisted", "hired"]);
  });

  it("states the spec and the search plainly", () => {
    const base = {
      kind: "campaign" as const, key: "k", campaignId: "c", name: "Android Engineer", status: "active", client: "Acme", target: 2, location: "Bengaluru",
      stages: [], spec: { title: "Senior Android Engineer", version: 2 }, draftWaiting: false, sourcing: { shown: 42, exhausted: false, nextSize: 5 }, watches: [],
    };
    expect(specLine(base)).toBe("Requirements v2 approved: Senior Android Engineer");
    expect(specLine({ ...base, spec: null, draftWaiting: true })).toBe("A requirements draft is waiting for your approval");
    expect(specLine({ ...base, spec: null })).toBe("No requirements yet, so nothing can be searched");
    expect(searchLine(base.sourcing)).toBe("42 people found so far. The next search looks for 5 more");
    expect(searchLine({ shown: 0, exhausted: true, nextSize: 0 })).toBe("Nobody found yet. That is everyone the search can reach for now");
    expect(campaignFacts(base)).toBe("Acme · Bengaluru · 2 hires wanted");
    expect(campaignFacts({ ...base, client: null, location: null, target: 1, status: "closed" })).toBe("1 hire wanted · closed");
  });

  it("links to the campaign and its pages", () => {
    expect(campaignHref("abc")).toBe("#/campaign?campaign=abc");
    expect(campaignHref("abc", "shortlisted")).toBe("#/campaign/shortlisted?campaign=abc");
  });
});

describe("what a person shows on a card of people", () => {
  const p = { title: "Platform Lead", company: "Acme", city: "Pune", tier: "A" as const, stage: "shortlisted", daysInStage: 3 };

  it("is all of it unless the person's notes say less", () => {
    expect(personLine(p)).toBe("Platform Lead at Acme, Pune");
    expect(personStatus(p)).toBe("Strong fit · Shortlisted · 3 days");
  });

  it("drops the city, the fit label, the stage or everything but the name", () => {
    expect(personLine(p, ["role", "fit", "stage"])).toBe("Platform Lead at Acme");
    expect(personStatus(p, ["role", "city", "stage"])).toBe("Shortlisted · 3 days");
    expect(personStatus(p, ["role", "city", "fit"])).toBe("Strong fit");
    expect(personStatus(p, ["role", "city"])).toBeNull();
    expect(personLine(p, [])).toBe("");
    expect(personStatus(p, [])).toBeNull();
  });
});

it("heads a card of contact details as what it is", () => {
  expect(peopleHeading(peopleCard({ source: "found", narrowedTo: "contact details" }))).toBe("Contact details");
});

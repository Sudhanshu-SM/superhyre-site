import { describe, expect, it } from "vitest";
import { memoryItemOf, memoryPageOf, memoryStatsOf } from "../api/memory";
import type { MemoryItem } from "../api/memory";
import {
  appliesTo, canChange, confirmHelp, groupMemories, happenedLine, isFiltered, isLive, kindLabel, matchesFilters, metaLine,
  NO_FILTERS, noticedLine, notesLabel, sectionsOf, SCOPE_CHOICES, sinceLabel, snippet, sourceLabel, TYPE_TITLE, usedLabel,
  whenLabel,
} from "../memoryView";

/**
 * The Memory page's words and groups: where each note sits, what it says about where it came from,
 * and who may change it. Pure, so none of it needs a page.
 */

let n = 0;
const note = (over: Partial<MemoryItem> = {}): MemoryItem => ({
  id: `m${++n}`, text: "Acme wants a budget under 40 lakh", kind: "fact", scope: "client", level: "client",
  clientId: "cl1", clientName: "Acme Robotics", campaignId: null, campaignName: null, personLabel: null,
  about: [], at: "2026-10-08T10:00:00.000Z", type: "facts", episode: null, basis: null, lastUsedAt: null, expiresAt: null,
  status: "active", trust: "agent", source: "distil", quote: null, confidence: 0.8,
  createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:00:00.000Z", supersededBy: null, usedCount: 0, ...over,
});
const org = (over: Partial<MemoryItem> = {}) => note({ scope: "org", level: "org", clientId: null, clientName: null, ...over });
const camp = (over: Partial<MemoryItem> = {}) => note({ scope: "campaign", level: "campaign", campaignId: "ca1", campaignName: "Senior Android", ...over });
const mine = (over: Partial<MemoryItem> = {}) => note({ scope: "person", level: "recruiter", clientId: null, clientName: null, personLabel: "You", kind: "preference", ...over });
const about = (over: Partial<MemoryItem> = {}) => note({ scope: "person", level: "candidate", personLabel: "Diya Thomas", kind: "episode", ...over });

describe("grouping the notes by where they apply", () => {
  it("puts the agency first, then clients, campaigns, you and people", () => {
    const groups = groupMemories([about(), mine(), camp(), note(), org()]);
    expect(groups.map((g) => g.kind)).toEqual(["org", "client", "campaign", "you", "people"]);
    expect(groups.map((g) => g.title)).toEqual(["Whole agency", "Acme Robotics", "Senior Android", "You", "People"]);
  });

  it("makes no group for a place with nothing in it", () => {
    expect(groupMemories([])).toEqual([]);
    expect(groupMemories([mine()]).map((g) => g.kind)).toEqual(["you"]);
  });

  it("sorts clients and campaigns by name and keeps one group per client or campaign", () => {
    const groups = groupMemories([
      note({ clientId: "b", clientName: "Zeta" }), note({ clientId: "a", clientName: "alpha" }), note({ clientId: "b", clientName: "Zeta" }),
      camp({ campaignId: "c2", campaignName: "Backend" }), camp({ campaignId: "c1", campaignName: "Android" }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["alpha", "Zeta", "Android", "Backend"]);
    expect(groups.find((g) => g.title === "Zeta")?.items).toHaveLength(2);
  });

  it("names a campaign's client under it", () => {
    expect(groupMemories([camp({ clientName: "Acme Robotics" })])[0]?.sub).toBe("Acme Robotics");
    expect(groupMemories([camp({ clientName: null })])[0]?.sub).toBeNull();
  });

  it("folds the notes about people and nothing else", () => {
    const groups = groupMemories([about(), mine(), note(), org(), camp()]);
    expect(groups.filter((g) => g.folded).map((g) => g.kind)).toEqual(["people"]);
  });

  it("puts lasting notes before what merely happened, keeping the server's order otherwise", () => {
    const g = groupMemories([
      camp({ id: "e1", kind: "episode" }), camp({ id: "f1", kind: "fact" }), camp({ id: "x1", kind: "example" }),
      camp({ id: "e2", kind: "episode" }), camp({ id: "p1", kind: "playbook" }), camp({ id: "f2", kind: "fact" }),
    ])[0];
    expect(g?.items.map((i) => i.id)).toEqual(["p1", "f1", "f2", "x1", "e1", "e2"]);
  });
});

describe("what a note says about itself", () => {
  it("says the kind in plain words, and an unknown one as it is", () => {
    expect(kindLabel("playbook")).toBe("Way of working");
    expect(kindLabel("belief")).toBe("Pattern");
    expect(kindLabel("episode")).toBe("What happened");
    expect(kindLabel("hunch")).toBe("Hunch");
    expect(kindLabel("")).toBe("Note");
  });

  it("says where it came from as what happened", () => {
    expect(sourceLabel({ source: "recruiter", trust: "user" })).toBe("You told it");
    expect(sourceLabel({ source: "distil", trust: "agent" })).toBe("Picked up from a chat");
    expect(sourceLabel({ source: "outcome", trust: "agent" })).toBe("From the work it did");
    expect(sourceLabel({ source: "import", trust: "untrusted" })).toBe("From an imported document");
    expect(sourceLabel({ source: "distil", trust: "untrusted" })).toBe("From an imported document");
  });

  it("counts uses, and says nothing for a note nobody has read yet", () => {
    expect(usedLabel(0)).toBeNull();
    expect(usedLabel(1)).toBe("Used once");
    expect(usedLabel(3)).toBe("Used 3 times");
    expect(notesLabel(1)).toBe("1 note");
    expect(notesLabel(22)).toBe("22 notes");
  });

  it("dates a note the way a person would", () => {
    const now = new Date(2026, 9, 10, 15, 0).getTime();
    expect(whenLabel(new Date(2026, 9, 10, 1, 0).toISOString(), now)).toBe("Today");
    expect(whenLabel(new Date(2026, 9, 9, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(whenLabel(new Date(2026, 9, 4, 9, 0).toISOString(), now)).toBe("4 Oct");
    expect(whenLabel(new Date(2025, 11, 25, 9, 0).toISOString(), now)).toBe("25 Dec 2025");
    expect(whenLabel("nonsense", now)).toBe("");
  });

  it("joins the meta line and leaves out what isn't known", () => {
    const now = new Date(2026, 9, 10, 15, 0).getTime();
    const base = note({ kind: "preference", source: "recruiter", trust: "user", usedCount: 3, updatedAt: new Date(2026, 9, 4, 9, 0).toISOString() });
    expect(metaLine(base, now)).toBe("Preference · You told it · Used 3 times · 4 Oct");
    expect(metaLine({ ...base, usedCount: 0 }, now)).toBe("Preference · You told it · 4 Oct");
    expect(metaLine({ ...base, status: "superseded" }, now)).toBe("Preference · Replaced · Used 3 times · 4 Oct");
  });

  it("says who a note is for, without contact details", () => {
    expect(appliesTo(org())).toBe("For the whole agency");
    expect(appliesTo(note())).toBe("For Acme Robotics");
    expect(appliesTo(camp({ clientName: "Acme Robotics" }))).toBe("For Senior Android (Acme Robotics)");
    expect(appliesTo(camp({ clientName: null }))).toBe("For Senior Android");
    expect(appliesTo(mine())).toBe("Just for you");
    expect(appliesTo(about())).toBe("About Diya Thomas");
    expect(appliesTo(about({ personLabel: null }))).toBe("About a candidate");
  });

  it("never uses the word supersede", () => {
    const words = [kindLabel("belief"), metaLine(note({ status: "superseded" })), sourceLabel({ source: "distil", trust: "agent" })].join(" ");
    expect(words).not.toMatch(/supersed/i);
  });

  it("cuts a long note short for a sentence about it", () => {
    expect(snippet("short")).toBe("short");
    expect(snippet("a  b\nc".repeat(30), 20)).toHaveLength(21);
  });
});

describe("who may change a note", () => {
  it("leaves the whole agency's notes to admins and everyone else's to whoever sees them", () => {
    expect(canChange(org(), { manages: true })).toBe(true);
    expect(canChange(org(), { manages: false })).toBe(false);
    for (const n of [note(), camp(), mine(), about()]) expect(canChange(n, { manages: false })).toBe(true);
  });

  it("tells a recruiter to ask an admin rather than showing a button that would fail", () => {
    expect(confirmHelp(org(), { manages: false })).toBe("Ask an admin to confirm");
    expect(confirmHelp(org(), { manages: true })).toBeNull();
    expect(confirmHelp(note(), { manages: false })).toBeNull();
  });

  it("treats only active and waiting notes as current", () => {
    expect(isLive(note({ status: "active" }))).toBe(true);
    expect(isLive(note({ status: "pending" }))).toBe(true);
    expect(isLive(note({ status: "superseded" }))).toBe(false);
  });
});

describe("the filters", () => {
  it("knows when a search or a scope is on, and ignores the history switch", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, history: true })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, q: " " })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, q: "budget" })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, scope: "client", clientId: "cl1" })).toBe(true);
  });

  it("decides whether a note that just changed belongs in the list on screen", () => {
    expect(matchesFilters(note(), NO_FILTERS)).toBe(true);
    expect(matchesFilters(note({ status: "pending" }), NO_FILTERS)).toBe(false);
    expect(matchesFilters(note({ status: "superseded" }), NO_FILTERS)).toBe(false);
    expect(matchesFilters(note({ status: "superseded" }), { ...NO_FILTERS, history: true })).toBe(true);
    expect(matchesFilters(note(), { ...NO_FILTERS, scope: "org" })).toBe(false);
    // "This client" and "this campaign" are the one chosen, whatever level the note is at.
    expect(matchesFilters(note(), { ...NO_FILTERS, scope: "client", clientId: "cl1" })).toBe(true);
    expect(matchesFilters(note(), { ...NO_FILTERS, scope: "client", clientId: "cl2" })).toBe(false);
    expect(matchesFilters(note(), { ...NO_FILTERS, scope: "client" })).toBe(false);
    expect(matchesFilters(camp(), { ...NO_FILTERS, scope: "campaign", campaignId: "ca1" })).toBe(true);
    expect(matchesFilters(camp(), { ...NO_FILTERS, scope: "campaign", campaignId: "ca2" })).toBe(false);
    expect(matchesFilters(mine(), { ...NO_FILTERS, scope: "mine" })).toBe(true);
    expect(matchesFilters(note(), { ...NO_FILTERS, scope: "mine" })).toBe(false);
    expect(matchesFilters(note({ text: "Budget under 40 lakh" }), { ...NO_FILTERS, q: "LAKH budget" })).toBe(true);
    expect(matchesFilters(note({ text: "Budget under 40 lakh" }), { ...NO_FILTERS, q: "budget crore" })).toBe(false);
  });
});

describe("reading the API's answer", () => {
  it("keeps a whole note whole", () => {
    const raw = { ...note({ quote: "Acme is capped at 40 lakh", usedCount: 4 }) };
    expect(memoryItemOf(raw)).toEqual(raw);
  });

  it("fills what an older or newer server leaves out, and drops what isn't a note", () => {
    expect(memoryItemOf({ id: "a", text: "Prefers short lists", level: "recruiter" })).toMatchObject({
      scope: "person", level: "recruiter", kind: "fact", status: "active", trust: "agent", source: "distil", quote: null, usedCount: 0,
    });
    expect(memoryItemOf({ id: "a", text: "x", scope: "person" })).toMatchObject({ level: "candidate" });
    for (const junk of [null, "x", 3, {}, { id: "a" }, { id: "a", text: "t" }, { text: "t", level: "org" }]) expect(memoryItemOf(junk)).toBeNull();
  });

  it("reads a page, skipping rows it cannot read, and the counts with zeros for the rest", () => {
    expect(memoryPageOf({ items: [note({ id: "ok" }), { nope: 1 }], nextCursor: "c2" })).toMatchObject({ items: [{ id: "ok" }], nextCursor: "c2" });
    expect(memoryPageOf(null)).toEqual({ items: [], nextCursor: null });
    expect(memoryStatsOf({ active: 22, pending: 2, byScope: { org: 1, campaign: 19 } })).toEqual({
      active: 22, pending: 2, byScope: { org: 1, client: 0, campaign: 19, person: 0 }, mine: 0, byType: { facts: 0, happened: 0, ways: 0 },
    });
    expect(memoryStatsOf({ active: 3, pending: 0, mine: 1, byType: { facts: 2, happened: 1 } })).toMatchObject({
      mine: 1, byType: { facts: 2, happened: 1, ways: 0 },
    });
    expect(memoryStatsOf(undefined)).toEqual({
      active: 0, pending: 0, byScope: { org: 0, client: 0, campaign: 0, person: 0 }, mine: 0, byType: { facts: 0, happened: 0, ways: 0 },
    });
  });
});


describe("the three sections of the page", () => {
  it("splits the notes by what they are, in the page's order, and makes no empty section", () => {
    const sections = sectionsOf([
      note({ id: "e", kind: "episode", type: "happened" }),
      note({ id: "f", kind: "fact", type: "facts" }),
      note({ id: "b", kind: "belief", type: "ways" }),
      note({ id: "p", kind: "preference", type: "facts" }),
    ]);
    expect(sections.map((x) => x.title)).toEqual(["Facts and preferences", "How we do things", "What happened"]);
    expect(sections.map((x) => x.items.map((i) => i.id))).toEqual([["f", "p"], ["b"], ["e"]]);
    expect(sectionsOf([note({ type: "facts" })]).map((x) => x.type)).toEqual(["facts"]);
    expect(sectionsOf([])).toEqual([]);
    expect(TYPE_TITLE.happened).toBe("What happened");
  });

  it("offers the scopes a recruiter would ask for, in their own words", () => {
    expect(SCOPE_CHOICES.map((c) => c.label)).toEqual([
      "Everything", "Mine", "This campaign", "This client", "Whole agency",
    ]);
  });
});

describe("how often and when a note was used", () => {
  // Local noon on 12 Oct, so "today" and "yesterday" mean the same in any time zone.
  const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour).toISOString();
  const now = new Date(2026, 9, 12, 12).getTime();
  it("says when it was last used in days, weeks and months", () => {
    expect(sinceLabel(at(10, 12, 8), now)).toBe("today");
    expect(sinceLabel(at(10, 11, 23), now)).toBe("yesterday");
    expect(sinceLabel(at(10, 9), now)).toBe("3 days ago");
    expect(sinceLabel(at(9, 20), now)).toBe("3 weeks ago");
    expect(sinceLabel(at(6, 1), now)).toBe("4 months ago");
    expect(sinceLabel("not a date", now)).toBeNull();
  });

  it("joins the count and the last time, and stays short for a note nobody has used", () => {
    expect(usedLabel(0, at(10, 12, 8), now)).toBeNull();
    expect(usedLabel(1, at(10, 12, 8), now)).toBe("Used once, last today");
    expect(usedLabel(12, at(10, 9), now)).toBe("Used 12 times, last 3 days ago");
    expect(usedLabel(3, null, now)).toBe("Used 3 times");
  });

  it("puts what sort of thing happened, where, who it was about and when on one line", () => {
    const line = happenedLine(
      note({
        kind: "episode", type: "happened", episode: "pass", level: "candidate", clientName: "Acme Robotics",
        campaignName: "Data Engineer", about: ["Diya Thomas"], usedCount: 2, lastUsedAt: at(10, 11), at: at(10, 4),
      }),
      now,
    );
    expect(line).toBe(
      "Turned down · For Data Engineer (Acme Robotics) · About Diya Thomas · Used 2 times, last yesterday · 4 Oct",
    );
    expect(happenedLine(note({ kind: "episode", type: "happened", episode: "session", level: "recruiter", at: at(10, 12, 9) }), now)).toBe(
      "A chat · Just for you · Today",
    );
  });

  it("says how much work a suggested pattern rests on, only when it is more than one thing", () => {
    expect(noticedLine(note({ basis: 4 }))).toBe("Noticed across 4 pieces of work");
    expect(noticedLine(note({ basis: 1 }))).toBeNull();
    expect(noticedLine(note({ basis: null }))).toBeNull();
  });
});

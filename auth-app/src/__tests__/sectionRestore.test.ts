import { describe, expect, it } from "vitest";
import { readRemembered as campaigns } from "../CampaignsPage";
import { readBoardRemembered, readShortlistRemembered } from "../CampaignWorkspace";
import { readListRemembered as calls } from "../CallsPage";
import { readRemembered as clients } from "../Clients";
import { filtersFrom, readRemembered as contacts } from "../Contacts";
import { EMPTY_FILTERS } from "../contacts";
import { readResponsesRemembered } from "../FormResponses";
import { readListRemembered as outreach } from "../OutreachPage";

/** What each section accepts back from a tab's memory: anything it cannot be in becomes the default. */

describe("restoring a section", () => {
  it("campaigns: filter, search, sort and the row the page started at", () => {
    expect(campaigns({ filter: "closed", q: "design", sort: "name", offset: 20 })).toEqual({ filter: "closed", q: "design", sort: "name", offset: 20 });
    expect(campaigns({ filter: "archived", q: 4, sort: "colour", offset: -1 })).toEqual({ filter: "all", q: "", sort: "updated", offset: 0 });
    expect(campaigns({})).toEqual({ filter: "all", q: "", sort: "updated", offset: 0 });
  });

  it("candidates: filters are checked one by one, and the page is the row it started at", () => {
    expect(filtersFrom({ seniority: ["Senior", "Wizard"], experience: ["3-6", "99"], contact: ["email", "fax"], profile: "x", captured: "30", openToWork: "yes", skills: ["go", 3] }))
      .toEqual({ ...EMPTY_FILTERS, seniority: ["Senior"], experience: ["3-6"], contact: ["email"], captured: "30", skills: ["go"] });
    expect(filtersFrom("junk")).toEqual(EMPTY_FILTERS);
    const r = contacts({ camp: "c1", q: "ada", sort: "name", size: 18, offset: 36 });
    expect(r).toEqual({ camp: "c1", q: "ada", filters: EMPTY_FILTERS, sort: "name", size: 18, offset: 36 });
    expect(contacts({ sort: "random", size: 7, offset: -4 })).toMatchObject({ sort: "recent", size: 15, offset: 0 });
    expect(contacts({ camp: 5, offset: "9" })).toMatchObject({ camp: "all", offset: 0 });
  });

  it("clients: a status that is not one, a sort that is gone, and an owner nobody is", () => {
    const list = [{ id: "a", industry: "Fintech", owner: "Ann" }] as unknown as Parameters<typeof clients>[1];
    expect(clients({ f: { q: "x", status: "active", industry: "Fintech", owner: "Ann" }, sort: { key: "name", dir: -1 }, offset: 24 }, list))
      .toEqual({ f: { q: "x", status: "active", industry: "Fintech", owner: "Ann" }, sort: { key: "name", dir: -1 }, offset: 24 });
    expect(clients({ f: { status: "deleted", industry: "Mining", owner: "Zed" }, sort: { key: "colour", dir: 9 }, offset: 1.5 }, list))
      .toEqual({ f: { q: "", status: null, industry: null, owner: null }, sort: { key: "last", dir: 1 }, offset: 0 });
  });

  it("calls and outreach: channel, outcome or status, dates and page", () => {
    expect(calls({ q: "a", outcome: "connected", preset: "7d", custom: { from: "2026-10-01", to: "2026-10-09" }, caller: "u1", offset: 15, size: 12 }))
      .toEqual({ q: "a", outcome: "connected", preset: "7d", custom: { from: "2026-10-01", to: "2026-10-09" }, caller: "u1", offset: 15, size: 12 });
    expect(calls({ outcome: "exploded", preset: "yesterday", custom: { from: "tomorrow", to: 3 }, offset: "5" }))
      .toEqual({ q: "", outcome: "", preset: "any", custom: { from: "", to: "" }, caller: "", offset: 0, size: 15 });
    expect(outreach({ tab: "whatsapp", status: "replied", preset: "30d", offset: 30 })).toMatchObject({ tab: "whatsapp", status: "replied", preset: "30d", offset: 30 });
    expect(outreach({ tab: "carrier-pigeon", status: "lost", preset: "never" })).toMatchObject({ tab: "", status: "", preset: "any", offset: 0 });
  });

  it("the shortlist and the board: sorts, statuses and the column looked at alone", () => {
    expect(readShortlistRemembered({ q: "x", sort: { key: "name", dir: -1 }, f: { status: "hired", email: true, owner: "Ann" }, offset: 25 }))
      .toMatchObject({ q: "x", sort: { key: "name", dir: -1 }, f: { status: "hired", email: true, owner: "Ann", source: null, open: false }, offset: 25 });
    expect(readShortlistRemembered({ sort: { key: "x", dir: 0 }, f: { status: "gone" }, offset: -3 }))
      .toMatchObject({ sort: { key: "added", dir: 1 }, f: { status: null }, offset: 0 });
    expect(readBoardRemembered({ q: "go", owner: "Ann", stalled: true, focus: "interviewing" })).toEqual({ q: "go", owner: "Ann", source: null, stalled: true, focus: "interviewing" });
    expect(readBoardRemembered({ owner: 3, stalled: "yes", focus: 9 })).toEqual({ q: "", owner: null, source: null, stalled: false, focus: null });
  });

  it("responses: a question this form does not have is not a filter to keep", () => {
    const form = { questions: [{ id: "q1" }] } as unknown as Parameters<typeof readResponsesRemembered>[1];
    expect(readResponsesRemembered({ view: "table", answer: { qid: "q1", value: "yes" }, search: "a", onlyNew: true, must: "missed" }, form))
      .toEqual({ view: "table", answer: { qid: "q1", value: "yes" }, search: "a", onlyNew: true, must: "missed" });
    expect(readResponsesRemembered({ view: "cards", answer: { qid: "q9", value: "yes" }, must: "maybe" }, form))
      .toEqual({ view: "summary", answer: null, search: "", onlyNew: false, must: "all" });
  });
});

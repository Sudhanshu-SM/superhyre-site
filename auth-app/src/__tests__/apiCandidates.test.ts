import { describe, expect, it } from "vitest";
import type { CandidateDetail, CandidateRow, ImportResult } from "../api/candidates";
import { contactFromDetail, contactFromRow, fieldsFromDraft, importMessage, listPath, mergeImport, patchFromEdit } from "../api/candidates";
import { EMPTY_CANDIDATE } from "../candidateImport";

const NOW = Date.parse("2026-10-04T12:00:00Z");

const row = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  id: "c1", fullName: "Asha Verma", headline: null, currentTitle: "Senior Backend Engineer", currentCompanyName: "Acme",
  city: "Bangalore", country: "India", yearsOfExperience: 7, linkedinUrl: "https://www.linkedin.com/in/asha-verma",
  source: "import", ownerId: "u1", hasEmail: true, hasPhone: false, email: null, phone: null, completeness: "basic",
  campaigns: [{ id: "k1", name: "Backend", stage: "shortlisted" }], createdAt: "2026-10-01T09:00:00Z", ...over,
});

describe("contactFromRow", () => {
  it("reads a list row as a contact, without contact values", () => {
    const c = contactFromRow(row(), NOW);
    expect(c).toMatchObject({
      id: "c1", name: "Asha Verma", title: "Senior Backend Engineer", company: "Acme", location: "Bangalore, India",
      years: 7, seniority: "Senior", linkedin: "linkedin.com/in/asha-verma", campaign: "k1", capturedAgo: 3,
      profile: "basic", origin: "Upload", onFile: { email: true, phone: false },
    });
    expect(c.email).toBeUndefined();
    expect(c.jobs).toEqual([{ title: "Senior Backend Engineer", company: "Acme", span: "Present" }]);
  });

  it("carries the workspace's own email and phone, to show and copy", () => {
    const c = contactFromRow(row({ email: "asha@acme.in", hasPhone: true, phone: "+919845012345" }), NOW);
    expect(c.email).toEqual({ value: "asha@acme.in", source: "Manual", verified: false });
    expect(c.phone).toEqual({ value: "+919845012345", source: "Manual" });
  });

  it("falls back to the headline, and marks a referral", () => {
    const c = contactFromRow(row({ currentTitle: null, headline: "Builds payments", source: "referral", campaigns: [], completeness: "enriched" }), NOW);
    expect(c.title).toBe("Builds payments");
    expect(c.origin).toBe("Manual");
    expect(c.channel).toBe("Referral");
    expect(c.campaign).toBe("");
    expect(c.profile).toBe("full");
  });
});

describe("contactFromDetail", () => {
  const detail: CandidateDetail = {
    candidate: {
      id: "c1", fullName: "Asha Verma", headline: null, currentTitle: "Staff Engineer", currentCompanyName: "Acme",
      linkedinUrl: null, city: null, country: null, yearsOfExperience: null, source: "manual", about: null,
      primaryEmail: null, email2: null, email3: null, workEmail: "asha@acme.in", primaryPhone: "+919845012345",
      phone2: null, phone3: null, createdAt: "2026-10-04T08:00:00Z",
    },
    profile: {
      summary: "Ten years on ledgers.", locationText: "Pune, India", skills: ["Go", "Postgres"], completeness: "enriched",
      experiences: [
        { company: "Acme", title: "Staff Engineer", startDate: "2022-04-01", endDate: null, isCurrent: true },
        { company: "Beta", title: "Engineer", startDate: "2018-01-01", endDate: "2022-03-01", isCurrent: false },
      ],
      education: [{ school: "IIT Bombay", degree: "B.Tech", field: "CS", startYear: 2010, endYear: 2014 }],
    },
    campaigns: [{ id: "k1", name: "Backend", campaignCandidateId: "cc1", stage: "outreach" }],
    notes: [],
  };

  it("takes contacts from the workspace row and the career from the profile", () => {
    const c = contactFromDetail(detail, NOW);
    expect(c.email).toEqual({ value: "asha@acme.in", source: "Manual", verified: false });
    expect(c.phone?.value).toBe("+919845012345");
    expect(c.location).toBe("Pune, India");
    expect(c.jobs).toEqual([
      { title: "Staff Engineer", company: "Acme", span: "2022 – Present" },
      { title: "Engineer", company: "Beta", span: "2018 – 2022" },
    ]);
    expect(c.school).toEqual({ name: "IIT Bombay", degree: "B.Tech, CS", years: "2010 – 2014" });
    expect(c.skills).toEqual(["Go", "Postgres"]);
    expect(c.about).toBe("Ten years on ledgers.");
    expect(c.onFile).toEqual({ email: true, phone: true });
  });
});

describe("listPath", () => {
  it("sends only the filters in use", () => {
    expect(listPath({ q: "  sen back ", sort: "recent", limit: 20 })).toBe("/v1/candidates?q=sen+back&sort=recent&limit=20");
    expect(listPath({ campaignId: "k1", location: "Pune", hasEmail: true, skills: ["Go", "Rust"], sort: "name", cursor: "abc", limit: 50 }))
      .toBe("/v1/candidates?campaignId=k1&location=Pune&hasEmail=true&skills=Go%2CRust&sort=name&cursor=abc&limit=50");
  });

  it("asks for a numbered page by the row it starts at, and leaves the first page's offset out", () => {
    expect(listPath({ sort: "recent", limit: 11, offset: 22 })).toBe("/v1/candidates?sort=recent&limit=11&offset=22");
    expect(listPath({ sort: "recent", limit: 11, offset: 0 })).toBe("/v1/candidates?sort=recent&limit=11");
  });
});

describe("fieldsFromDraft", () => {
  it("leaves out blank cells", () => {
    expect(fieldsFromDraft({ ...EMPTY_CANDIDATE, name: " Asha ", email: "a@b.in", years: "6", skills: ["Go"] }))
      .toEqual({ fullName: "Asha", email: "a@b.in", yearsOfExperience: "6", skills: ["Go"] });
  });
});

describe("mergeImport", () => {
  const part = (over: Partial<ImportResult>): ImportResult => ({ created: 0, updated: 0, skipped: 0, errors: [], rows: [], ...over });

  it("adds up chunks and points row numbers back at the file", () => {
    const s = mergeImport([
      part({ created: 1, skipped: 1, rows: [{ row: 2, kind: "new", candidateId: "a" }, { row: 3, kind: "duplicate", candidateId: "b", changed: [] }] }),
      part({ updated: 1, errors: [{ row: 2, reasons: ["No name"] }], rows: [{ row: 3, kind: "duplicate", candidateId: "c", changed: ["email"] }] }),
    ], 500);
    expect(s).toEqual({ created: 1, updated: 1, skipped: 1, errors: [{ row: 502, reasons: ["No name"] }], touched: ["a", "c"] });
  });

  it("says what happened in one line", () => {
    expect(importMessage({ created: 12, updated: 3, skipped: 2, errors: [{ row: 4, reasons: [] }], touched: [] }))
      .toBe("12 candidates added and 3 updated. 2 already here, left as they were. 1 row left out");
    expect(importMessage({ created: 1, updated: 0, skipped: 0, errors: [], touched: [] })).toBe("1 candidate added");
  });
});

describe("patchFromEdit", () => {
  const before = contactFromRow(row(), NOW);
  it("sends only what changed, splitting the location", () => {
    expect(patchFromEdit(before, { name: "Asha Verma", title: "Staff Engineer", company: "Acme", location: "Pune, Maharashtra, India" }))
      .toEqual({ currentTitle: "Staff Engineer", city: "Pune", country: "India" });
  });
  it("clears a contact that was emptied, and sets a new one", () => {
    const withEmail = { ...before, email: { value: "a@acme.in", source: "Manual" as const, verified: false } };
    expect(patchFromEdit(withEmail, { email: undefined, phone: { value: "98450 12345", source: "Manual" } }))
      .toEqual({ primaryEmail: null, primaryPhone: "98450 12345" });
  });
});

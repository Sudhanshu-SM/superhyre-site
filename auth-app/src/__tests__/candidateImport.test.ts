import { describe, expect, it } from "vitest";
import {
  EMPTY_CANDIDATE, MAX_LINKS, autoMap, buildIndex, candidateProblems, classifyLinks, classifyRows, contactFromDraft,
  detectDelimiter, findExisting, identifiersOf, mergeDraft, nameFromSlug, normaliseEmail, normaliseLinkedIn,
  looksBinary, normalisePhone, parseCsv, parseYears, rowProblems, rowToDraft, seniorityFrom, splitSkills, tally, TEMPLATE_CSV,
} from "../candidateImport";
import type { CandidateDraft, Known } from "../candidateImport";
import { CONTACTS } from "../contacts";

const draft = (d: Partial<CandidateDraft>): CandidateDraft => ({ ...EMPTY_CANDIDATE, ...d });

describe("LinkedIn URL normalisation", () => {
  it("reduces every spelling of one profile to the same slug", () => {
    const forms = [
      "https://www.linkedin.com/in/Rohan-Sharma-4821/",
      "http://linkedin.com/in/rohan-sharma-4821",
      "linkedin.com/in/rohan-sharma-4821?utm_source=share&utm_medium=member_desktop",
      "  www.linkedin.com/in/rohan-sharma-4821/#about ",
      "https://in.linkedin.com/in/rohan-sharma-4821",
      "https://m.linkedin.com/in/rohan-sharma-4821//",
      "<https://www.linkedin.com/in/rohan-sharma-4821>",
    ];
    for (const f of forms) expect(normaliseLinkedIn(f)).toEqual({ ok: true, slug: "rohan-sharma-4821", url: "linkedin.com/in/rohan-sharma-4821" });
  });

  it("decodes percent-encoded names", () => {
    const r = normaliseLinkedIn("https://www.linkedin.com/in/j%C3%B6rg-m%C3%BCller");
    expect(r.ok && r.slug).toBe("jörg-müller");
  });

  it("refuses anything that is not a /in/<slug> profile, with a reason", () => {
    const bad = [
      "",
      "https://github.com/rohan",
      "https://www.linkedin.com/company/razorpay/",
      "https://www.linkedin.com/posts/rohan_activity-123",
      "https://www.linkedin.com/pub/rohan-sharma/1/2/3",
      "https://www.linkedin.com/in/",
      "https://www.linkedin.com/in/rohan-sharma-4821/details/experience/",
      "linkedin.com/in/ro",
      "linkedin.com/in/rohan$sharma",
      "notlinkedin.com/in/rohan-sharma",
    ];
    for (const b of bad) {
      const r = normaliseLinkedIn(b);
      expect(r.ok, b).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(3);
    }
  });

  it("names a person from the slug, dropping LinkedIn's numbers", () => {
    expect(nameFromSlug("aarav-sharma-4821")).toBe("Aarav Sharma");
    expect(nameFromSlug("priya-nair-b7a91c2")).toBe("Priya Nair");
    expect(nameFromSlug("kavya_menon")).toBe("Kavya Menon");
    expect(nameFromSlug("jdoe")).toBe("Jdoe");
    expect(nameFromSlug("12345678")).toBe("12345678");
  });
});

describe("email and phone normalisation", () => {
  it("lowercases and trims email, and refuses what is not one", () => {
    expect(normaliseEmail("  Rohan.Sharma@Razorpay.COM ")).toBe("rohan.sharma@razorpay.com");
    expect(normaliseEmail("mailto:a@b.in")).toBe("a@b.in");
    for (const b of ["", "rohan", "rohan@", "@x.com", "a@b", "a b@c.com", "a@b.", "a@@b.com"]) expect(normaliseEmail(b), b).toBeNull();
  });

  it("brings every Indian mobile spelling to +91 and ten digits", () => {
    const forms = ["+91 98450 12345", "+91-98450-12345", "+91 (98450) 12345", "098450 12345", "9845012345", "98450 12345", "91 98450 12345", "0091 98450 12345", "+91 0 98450 12345", "+91.98450.12345"];
    for (const f of forms) expect(normalisePhone(f), f).toBe("+919845012345");
  });

  it("keeps other country codes and refuses junk", () => {
    expect(normalisePhone("+1 (415) 555-0134")).toBe("+14155550134");
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalisePhone("080 2345 6789")).toBe("+918023456789");
    for (const b of ["", "12345", "call me", "98450-12345 ext 4", "+1234567890123456"]) expect(normalisePhone(b), b).toBeNull();
  });
});

describe("dedupe", () => {
  const people: Known[] = [
    { id: "a", name: "Rohan Sharma", linkedin: "linkedin.com/in/rohan-sharma-4821", email: { value: "rohan@razorpay.com" }, phone: { value: "+91 98450 12345" } },
    { id: "b", name: "Meera Iyer", linkedin: "linkedin.com/in/meera-iyer", email: { value: "Meera.Iyer@Gmail.com" } },
  ];
  const index = buildIndex(people);

  it("finds a person by any identifier, however it was written", () => {
    expect(findExisting(index, { linkedin: "https://www.linkedin.com/in/ROHAN-sharma-4821/?trk=x" })).toMatchObject({ person: { id: "a" }, by: "linkedin" });
    expect(findExisting(index, { email: " meera.iyer@gmail.com" })).toMatchObject({ person: { id: "b" }, by: "email" });
    expect(findExisting(index, { phone: "09845012345" })).toMatchObject({ person: { id: "a" }, by: "phone", value: "+919845012345" });
    expect(findExisting(index, { linkedin: "linkedin.com/in/someone-else", email: "new@x.in", phone: "9000000000" })).toBeNull();
  });

  it("checks LinkedIn first, then email, then phone", () => {
    const hit = findExisting(index, { linkedin: "linkedin.com/in/meera-iyer", email: "rohan@razorpay.com" });
    expect(hit).toMatchObject({ person: { id: "b" }, by: "linkedin" });
    expect(identifiersOf({ phone: "9845012345", email: "a@b.in", linkedin: "linkedin.com/in/abc" }).map(([k]) => k)).toEqual(["linkedin", "email", "phone"]);
  });

  it("ignores identifiers that are not valid", () => {
    expect(identifiersOf({ linkedin: "github.com/x", email: "nope", phone: "12" })).toEqual([]);
  });

  it("indexes the real fixtures without collisions on LinkedIn", () => {
    const idx = buildIndex(CONTACTS);
    for (const c of CONTACTS.slice(0, 10)) expect(findExisting(idx, { linkedin: `https://www.${c.linkedin}/` })?.person.id).toBe(c.id);
  });
});

describe("pasted links", () => {
  const index = buildIndex([{ id: "a", name: "Rohan Sharma", linkedin: "linkedin.com/in/rohan-sharma-4821" }]);

  it("splits by line, comma or space and says what each one is", () => {
    const text = [
      "https://www.linkedin.com/in/rohan-sharma-4821/",
      "linkedin.com/in/kavya-menon-77, https://linkedin.com/in/arjun-rao",
      "",
      "https://www.linkedin.com/company/acme",
      "https://linkedin.com/in/Kavya-Menon-77?x=1",
    ].join("\n");
    const v = classifyLinks(text, index);
    expect(v.map((x) => x.kind)).toEqual(["existing", "new", "new", "invalid", "repeat"]);
    expect(v[0]).toMatchObject({ match: { name: "Rohan Sharma" } });
    expect(v[1]).toMatchObject({ name: "Kavya Menon", url: "linkedin.com/in/kavya-menon-77" });
    expect(v[4]).toMatchObject({ first: 2 });
  });

  it("keeps a line of plain words as one entry to fix", () => {
    const v = classifyLinks("not a link\n\n  linkedin.com/in/arjun-rao  ", index);
    expect(v.map((x) => x.kind)).toEqual(["invalid", "new"]);
    expect(v[0]).toMatchObject({ raw: "not a link", reason: "Not a LinkedIn link" });
  });

  it("stops at the limit and marks the rest", () => {
    const text = Array.from({ length: MAX_LINKS + 3 }, (_, i) => `linkedin.com/in/person-${i}-x`).join("\n");
    const v = classifyLinks(text, index);
    expect(v.filter((x) => x.kind === "new")).toHaveLength(MAX_LINKS);
    expect(v.filter((x) => x.kind === "over")).toHaveLength(3);
  });
});

describe("the one-person form", () => {
  it("needs only a name, and checks the rest when given", () => {
    expect(candidateProblems(draft({ name: "Asha Verma" }))).toEqual({});
    expect(Object.keys(candidateProblems(draft({})))).toEqual(["name"]);
    const p = candidateProblems(draft({ name: "Asha", email: "asha@", phone: "123", linkedin: "github.com/asha", years: "lots" }));
    expect(Object.keys(p).sort()).toEqual(["email", "linkedin", "phone", "years"]);
  });

  it("reads years the way people type them", () => {
    expect(parseYears("6")).toBe(6);
    // A half year is kept (it used to be rounded up to 7 here, and to 7 again on the server).
    expect(parseYears("6.5 yrs")).toBe(6.5);
    expect(parseYears("4.5")).toBe(4.5);
    expect(parseYears("3.54")).toBe(3.5);
    expect(parseYears("6+")).toBe(6);
    expect(parseYears("12 years")).toBe(12);
    expect(parseYears("")).toBeNull();
    expect(parseYears("six")).toBeNull();
    expect(parseYears("99")).toBeNull();
  });

  it("splits skills and drops repeats", () => {
    expect(splitSkills("Go, Kafka; postgres | go\nRedis")).toEqual(["Go", "Kafka", "postgres", "Redis"]);
  });

  it("guesses seniority from the title, then the years", () => {
    expect(seniorityFrom("Head of Data", 4)).toBe("Director");
    expect(seniorityFrom("Sr. Backend Engineer", 2)).toBe("Senior");
    expect(seniorityFrom("Engineer", 7)).toBe("Senior");
    // No title word and no years is no level, not "Mid": an unknown number of years is not zero (R4 D15).
    expect(seniorityFrom("", 0)).toBeNull();
    expect(seniorityFrom("Engineer", null)).toBeNull();
    expect(seniorityFrom("Engineer", 4)).toBe("Mid");
  });

  it("makes a basic, manual contact owned by whoever added it", () => {
    const c = contactFromDraft(draft({ name: "  Asha  Verma ", email: "Asha@Acme.in", phone: "98450 12345", linkedin: "https://www.linkedin.com/in/asha-verma/", title: "Staff Engineer", years: "9", skills: ["Go"] }), {
      id: "mn-1", by: "Riya K", origin: "Manual", campaign: "ds-applied", channel: "Referral",
    });
    expect(c).toMatchObject({
      name: "Asha Verma", profile: "basic", origin: "Manual", channel: "Referral", capturedBy: "Riya K", owner: "Riya K", capturedAgo: 0,
      linkedin: "linkedin.com/in/asha-verma", email: { value: "asha@acme.in", source: "Manual", verified: false },
      phone: { value: "98450 12345", source: "Manual" }, seniority: "Staff", years: 9, campaign: "ds-applied",
    });
  });
});

describe("merging into an existing candidate", () => {
  const base = contactFromDraft(draft({ name: "Rohan Sharma", email: "rohan@razorpay.com", title: "SDE 2", skills: ["Go"] }), { id: "a", by: "Arnab J", origin: "Manual" });

  it("writes only non-empty fields that differ, and adds to skills", () => {
    const m = mergeDraft(base, draft({ name: "R Sharma", email: "ROHAN@razorpay.com", phone: "+91 98450 12345", title: "Senior Engineer", skills: ["go", "Kafka"], notes: "Met at GopherCon" }));
    expect(m.changed).toEqual(["phone", "title", "skills", "notes"]);
    expect(m.patch.name).toBeUndefined();
    expect(m.patch.email).toBeUndefined();
    expect(m.patch.skills).toEqual(["Go", "Kafka"]);
    expect(m.patch.jobs?.[0]).toMatchObject({ title: "Senior Engineer" });
  });

  it("is a no-op when nothing new was given", () => {
    expect(mergeDraft(base, draft({ name: "Rohan Sharma", email: "rohan@razorpay.com" }))).toEqual({ patch: {}, changed: [] });
  });
});

describe("CSV parsing", () => {
  it("handles quotes, commas and line breaks inside quotes, and doubled quotes", () => {
    const csv = 'Name,Skills,Notes\n"Sharma, Rohan","Go, Kafka","Said ""call after 6""\nprefers WhatsApp"\nMeera Iyer,Figma,\n';
    expect(parseCsv(csv)).toEqual([
      ["Name", "Skills", "Notes"],
      ["Sharma, Rohan", "Go, Kafka", 'Said "call after 6"\nprefers WhatsApp'],
      ["Meera Iyer", "Figma", ""],
    ]);
  });

  it("drops a byte-order mark and accepts CRLF, skipping blank rows", () => {
    const csv = "﻿Name,Email\r\nAsha,asha@x.in\r\n\r\n,\r\nRavi,ravi@x.in";
    const rows = parseCsv(csv);
    expect(rows[0]![0]).toBe("Name");
    expect(rows).toHaveLength(3);
  });

  it("detects semicolon and tab files", () => {
    expect(detectDelimiter("Name;Email;Phone\nA;b@c.in;1")).toBe(";");
    expect(detectDelimiter("Name\tEmail\nA\tb")).toBe("\t");
    expect(detectDelimiter('"Name; full",Email\nA,b')).toBe(",");
    expect(parseCsv("Name;Email\nAsha;asha@x.in")).toEqual([["Name", "Email"], ["Asha", "asha@x.in"]]);
  });

  it("parses its own template", () => {
    const [head, row] = parseCsv(TEMPLATE_CSV);
    expect(autoMap(head!)).toEqual(["name", "email", "phone", "linkedin", "title", "company", "location", "years", "skills"]);
    expect(rowToDraft(row!, autoMap(head!)).skills).toEqual(["Go", "Postgres", "Kafka"]);
  });
});

describe("header auto-mapping", () => {
  it("maps the usual names, whatever the case and punctuation", () => {
    expect(autoMap(["Full Name", "E-mail", "Mobile No.", "LinkedIn URL", "Designation", "Organisation", "City", "Years of Experience", "Key Skills"]))
      .toEqual(["name", "email", "phone", "linkedin", "title", "company", "location", "years", "skills"]);
    expect(autoMap(["name", "email", "phone", "linkedin", "title", "company", "location", "experience", "skills"]))
      .toEqual(["name", "email", "phone", "linkedin", "title", "company", "location", "years", "skills"]);
  });

  it("falls back to looser hints, and never maps a field twice", () => {
    expect(autoMap(["Candidate's LinkedIn profile", "Personal email id", "Primary mobile", "Email 2"])).toEqual(["linkedin", "email", "phone", null]);
    expect(autoMap(["Total exp (yrs)", "Notes"])).toEqual(["years", null]);
  });

  it("does not take a first, last or company name for the full name", () => {
    expect(autoMap(["First name", "Last name", "Company name"])).toEqual([null, null, "company"]);
  });
});

describe("classifying rows", () => {
  const index = buildIndex([{ id: "a", name: "Rohan Sharma", linkedin: "linkedin.com/in/rohan-sharma-4821", email: { value: "rohan@razorpay.com" }, phone: { value: "+91 98450 12345" } }]);
  const map = autoMap(["Name", "Email", "Phone", "LinkedIn"]);
  const rows = [
    ["Asha Verma", "asha@acme.in", "", ""],
    ["R. Sharma", "", "098450 12345", ""],
    ["", "nobody@x.in", "", ""],
    ["Kiran", "kiran@", "12", ""],
    ["Asha V", "ASHA@acme.in", "", ""],
    ["Rohan", "", "", "https://www.linkedin.com/in/rohan-sharma-4821/"],
    ["Dev Patel", "", "", "linkedin.com/company/acme"],
  ];
  const v = classifyRows(rows.map((r) => rowToDraft(r, map)), index);

  it("sorts each row and reports the spreadsheet row number", () => {
    expect(v.map((x) => x.kind)).toEqual(["new", "duplicate", "error", "error", "repeat", "duplicate", "error"]);
    expect(v.map((x) => x.row)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it("says which key matched", () => {
    expect(v[1]).toMatchObject({ by: "phone", match: { name: "Rohan Sharma" } });
    expect(v[4]).toMatchObject({ by: "email", first: 2 });
    expect(v[5]).toMatchObject({ by: "linkedin" });
  });

  it("gives a reason for every error", () => {
    expect(v[2]).toMatchObject({ reasons: ["No name"] });
    expect(v[3]).toMatchObject({ reasons: ["Email doesn't look right", "Phone needs 8 to 15 digits"] });
    expect((v[6] as { reasons: string[] }).reasons[0]).toMatch(/^LinkedIn: not a profile/);
    expect(rowProblems(draft({ name: "A" }))).toEqual(["Name is too short"]);
  });

  it("tallies new, duplicates and errors", () => {
    expect(tally(v)).toEqual({ fresh: 1, duplicates: 3, errors: 3 });
  });
});

describe("files that aren't text", () => {
  it("tells a spreadsheet or image renamed to .csv from a real CSV", () => {
    expect(looksBinary("PK\u0003\u0004\u0000\u0000rest of a zip")).toBe(true);
    expect(looksBinary("���JFIF��\u0001\u0002" + "x".repeat(20))).toBe(true);
    expect(looksBinary("Name,Email\nZoë Ångström,zoe@example.com\n")).toBe(false);
    expect(looksBinary("")).toBe(false);
  });
});

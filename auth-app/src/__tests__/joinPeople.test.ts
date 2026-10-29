import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fillFrom, joinPeople } from "../joinPeople";
import type { SheetFields } from "../peopleSheet";
import { placingOf, totalsLine } from "../peopleSheet";

/**
 * People in more than one file on a card count once. The rule is the import's own: samePerson.ts is the server's file, byte for byte,
 * so what the card joins is what the import would have called the same person.
 */

const here = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const SERVER = resolve(__dirname, "..", "..", "..", "..", "superhyre-platform", "server", "src", "modules", "candidates", "same-person.ts");

type Row = { fields: SheetFields; file: string };
const row = (file: string, fields: SheetFields): Row => ({ file, fields });

describe("the rule the card joins people by", () => {
  it("is the server's same-person file, byte for byte, and imports nothing so that it can be", () => {
    expect(here("samePerson.ts")).toBe(readFileSync(SERVER, "utf8"));
    expect(here("samePerson.ts")).not.toMatch(/^\s*import\b/m);
  });

  it("is taken from that file and not written again here", () => {
    const src = here("joinPeople.ts");
    expect(src).toContain('from "./samePerson"');
    for (const own of ["function namesCompatible", "const ROLE_WORDS", "MAX_NAMES_PER_CONTACT ="]) expect(src).not.toContain(own);
  });
});

describe("the same person in two files", () => {
  it("is one when a sheet and a resume have the same LinkedIn address, however it is written, and the rows joined are counted", () => {
    const out = joinPeople([
      row("resume:a", { fullName: "Priya Nair", linkedinUrl: "https://www.linkedin.com/in/priya-nair/", title: "Backend Engineer" }),
      row("sheet:1", { fullName: "Priya N", linkedinUrl: "linkedin.com/in/Priya-Nair?utm=x", company: "Acme" }),
      row("sheet:1", { fullName: "Ravi Kumar", email: "ravi@example.com" }),
    ]);
    expect(out.people).toHaveLength(2);
    expect(out.joined).toBe(1);
  });

  it("is one when two sheets share an email and the names can be one name, and two when they are a family at one address", () => {
    const same = joinPeople([
      row("sheet:1", { fullName: "Asha Verma", email: "asha@example.com" }),
      row("sheet:2", { fullName: "A. Verma", email: "ASHA@example.com" }),
    ]);
    expect(same.people).toHaveLength(1);
    expect(same.joined).toBe(1);
    const family = joinPeople([
      row("sheet:1", { fullName: "Asha Verma", phone: "+919845012345" }),
      row("sheet:2", { fullName: "Ravi Verma", phone: "+919845012345" }),
    ]);
    expect(family.people).toHaveLength(2);
    expect(family.joined).toBe(0);
  });

  it("is two when they share a number but have different LinkedIn addresses: an address says who someone is", () => {
    const out = joinPeople([
      row("sheet:1", { fullName: "Asha Verma", phone: "+919845012345", linkedinUrl: "https://www.linkedin.com/in/asha-verma" }),
      row("sheet:2", { fullName: "Asha Verma", phone: "+919845012345", linkedinUrl: "https://www.linkedin.com/in/asha-verma-pune" }),
    ]);
    expect(out.people).toHaveLength(2);
  });

  it("is two when what they share is a company's mailbox, a line with an extension, or an address on too many different names", () => {
    const mailbox = joinPeople([
      row("sheet:1", { fullName: "Asha Verma", email: "hr@acme.com" }),
      row("sheet:2", { fullName: "Asha Verma", email: "hr@acme.com" }),
    ]);
    expect(mailbox.people).toHaveLength(2);
    const line = joinPeople([
      row("sheet:1", { fullName: "Asha Verma", phone: "+912240001234", linePhones: ["+912240001234"] }),
      row("sheet:2", { fullName: "Asha Verma", phone: "+912240001234", linePhones: ["+912240001234"] }),
    ]);
    expect(line.people).toHaveLength(2);
    // Four different names on one address is an agency's, not a person's: a fifth row whose name could be one of theirs is not joined to it.
    const names = ["Asha Verma", "Ravi Kumar", "Neha Rao", "Dev Patel", "A. Verma"];
    const crowd = joinPeople(names.map((n, i) => row(`sheet:${i}`, { fullName: n, email: "front.desk@agency.com" })));
    expect(crowd.people).toHaveLength(5);
    expect(crowd.joined).toBe(0);
    // The same address on three names is still a person's own: the same fifth row joins.
    const few = joinPeople(["Asha Verma", "Ravi Kumar", "A. Verma"].map((n, i) => row(`sheet:${i}`, { fullName: n, email: "front.desk@agency.com" })));
    expect(few.people).toHaveLength(2);
  });

  it("never joins two rows of one file: a file's own readings have already joined what is the same person inside it", () => {
    const out = joinPeople([
      row("sheet:1", { fullName: "Asha Verma", email: "asha@example.com" }),
      row("sheet:1", { fullName: "Asha Verma", email: "asha@example.com" }),
    ]);
    expect(out.people).toHaveLength(2);
    expect(out.joined).toBe(0);
  });

  it("keeps the first file's words where the two differ and fills what it leaves blank, with the order the files were given in", () => {
    const out = joinPeople([
      row("resume:a", { fullName: "A. Verma", email: "asha@example.com", title: "Backend Engineer", skills: ["Go"] }),
      row("sheet:1", { fullName: "Asha Verma", email: "asha@example.com", title: "Developer", company: "Acme", phone: "+919845012345", skills: ["go", "Postgres"] }),
    ]);
    expect(out.people).toHaveLength(1);
    expect(out.people[0]?.fields).toEqual({
      fullName: "Asha Verma",
      email: "asha@example.com",
      title: "Backend Engineer",
      company: "Acme",
      phone: "+919845012345",
      skills: ["Go", "Postgres"],
    });
    expect(out.people[0]?.file).toBe("resume:a");
  });

  it("keeps what a sheet says of a person (their status) on the row that stays, and names nobody it cannot tell apart", () => {
    const out = joinPeople([
      { fields: { fullName: "Asha Verma", email: "asha@example.com" }, file: "sheet:1", status: "Replied" },
      { fields: { fullName: "No Contact" }, file: "sheet:1" },
      { fields: { fullName: "No Contact" }, file: "sheet:2" },
    ]);
    expect(out.people.map((p) => p.status)).toEqual(["Replied", undefined, undefined]);
    expect(out.joined).toBe(0);
  });

  it("is what the totals line says, in plain words", () => {
    expect(totalsLine(212, 3, 0)).toBe("212 people from 3 files.");
    expect(totalsLine(212, 3, 18)).toBe("212 people from 3 files. 18 rows joined, because the same person is in more than one file.");
    expect(totalsLine(1, 2, 1)).toBe("1 person from 2 files. 1 row joined, because the same person is in more than one file.");
  });
});

describe("filling a person from another file", () => {
  it("takes only what is blank, and a whole name for a name that is only initials", () => {
    expect(fillFrom({ fullName: "A. Verma", title: "" }, { fullName: "Asha Verma", title: "Lead", location: "Pune" })).toEqual({ fullName: "Asha Verma", title: "Lead", location: "Pune" });
    expect(fillFrom({ fullName: "Asha Verma", location: "Pune" }, { fullName: "A. Verma", location: "Delhi" })).toEqual({ fullName: "Asha Verma", location: "Pune" });
  });

  it("keeps a second address or number from the later file beside the first's, as the reading's own merge of two rows does, each once however it is written", () => {
    const out = fillFrom(
      { fullName: "Asha Verma", email: "old@example.com", phone: "+919845012345", morePhones: ["+919845012346"] },
      { fullName: "Asha Verma", email: "NEW@example.com", moreEmails: ["old@EXAMPLE.com"], phone: "+91 98450 12345", morePhones: ["+919845012347", "+919845012346"] },
    );
    expect(out.email).toBe("old@example.com");
    expect(out.moreEmails).toEqual(["NEW@example.com"]);
    expect(out.phone).toBe("+919845012345");
    expect(out.morePhones).toEqual(["+919845012346", "+919845012347"]);
  });

  it("keeps the first file's work address, and a different one from the later file as another way to reach them; a line with an extension stays a line", () => {
    const out = fillFrom(
      { fullName: "Asha Verma", email: "asha@example.com", workEmail: "asha@acme.com", phone: "+912240001234", linePhones: ["+912240001234"] },
      { fullName: "Asha Verma", workEmail: "a.verma@globex.com", phone: "+919845012345", linePhones: ["+919845012345", "+911111111111"] },
    );
    expect(out.workEmail).toBe("asha@acme.com");
    expect(out.moreEmails).toEqual(["a.verma@globex.com"]);
    expect(out.morePhones).toEqual(["+919845012345"]);
    // The line of the first stays one, the later file's number that is a line stays one, and a line that is no number of theirs is not kept.
    expect(out.linePhones).toEqual(["+912240001234", "+919845012345"]);
  });

  it("takes no more than the import takes beside the first address or number, and leaves no empty list where there is nothing more", () => {
    const later = { fullName: "Asha Verma", moreEmails: Array.from({ length: 12 }, (_, i) => `e${i}@example.com`), morePhones: Array.from({ length: 12 }, (_, i) => `+9198450123${String(i).padStart(2, "0")}`) };
    const out = fillFrom({ fullName: "Asha Verma", email: "asha@example.com", phone: "+919845012345" }, later);
    expect(out.moreEmails).toHaveLength(8);
    expect(out.morePhones).toHaveLength(8);
    const same = fillFrom({ fullName: "Asha Verma", email: "asha@example.com" }, { fullName: "Asha Verma", email: "ASHA@example.com" });
    expect("moreEmails" in same).toBe(false);
    expect("morePhones" in same).toBe(false);
    expect("linePhones" in same).toBe(false);
  });

  it("keeps the later file's notes the first lacks, line by line, and does not say a line twice", () => {
    const out = fillFrom({ fullName: "Asha Verma", notes: "Source: Naukri\nNotice: 30 days" }, { fullName: "Asha Verma", notes: "Notice: 30 days\nFrom resume: asha.pdf. Education: BTech" });
    expect(out.notes).toBe("Source: Naukri\nNotice: 30 days\nFrom resume: asha.pdf. Education: BTech");
    // Nothing new in the later notes: the first's stand exactly as they were.
    expect(fillFrom({ fullName: "Asha Verma", notes: "  Source: Naukri  " }, { fullName: "Asha Verma", notes: "Source: Naukri" }).notes).toBe("  Source: Naukri  ");
    // Never more than a note may hold.
    const long = fillFrom({ fullName: "Asha Verma", notes: "a".repeat(4000) }, { fullName: "Asha Verma", notes: "b".repeat(4000) });
    expect(long.notes?.length).toBe(4800);
  });
});

describe("what two files say of one person", () => {
  const asha = { fullName: "Asha Verma", email: "asha@example.com" };

  it("is kept from the later file when the first says nothing: a resume first, and the tracker's word for her after it", () => {
    const out = joinPeople([
      { fields: asha, file: "resume:a" },
      { fields: asha, file: "sheet:1", status: "Rejected" },
    ]);
    expect(out.people).toHaveLength(1);
    expect(out.joined).toBe(1);
    expect(out.people[0]?.status).toBe("Rejected");
    expect("alsoSaid" in (out.people[0] ?? {})).toBe(false);
    expect(out.people[0]?.file).toBe("resume:a");
  });

  it("is the first status said, then each other that differs in the order the files came, each once whatever its capitals or spaces", () => {
    const out = joinPeople([
      { fields: asha, file: "sheet:1", status: "Replied", alsoSaid: ["Contacted"] },
      { fields: asha, file: "sheet:2", status: "replied", alsoSaid: ["Interviewing", "contacted"] },
      { fields: asha, file: "sheet:3", status: "  Interviewing ", alsoSaid: [] },
    ]);
    expect(out.people).toHaveLength(1);
    expect(out.joined).toBe(2);
    expect(out.people[0]?.status).toBe("Replied");
    expect(out.people[0]?.alsoSaid).toEqual(["Contacted", "Interviewing"]);
  });

  it("is nothing when no file says anything, and the first row's own when only it does", () => {
    const none = joinPeople([{ fields: asha, file: "sheet:1" }, { fields: asha, file: "sheet:2" }]);
    expect("status" in (none.people[0] ?? {})).toBe(false);
    expect("alsoSaid" in (none.people[0] ?? {})).toBe(false);
    const only = joinPeople([{ fields: asha, file: "sheet:1", status: "Joined" }, { fields: asha, file: "sheet:2" }]);
    expect(only.people[0]?.status).toBe("Joined");
  });

  it("is what the card counts and names when it offers to move people: a person once, by every file that says something of them, and not by rows that will never move", () => {
    const words = [
      { text: "Replied", n: 1, want: { stage: "outreach", step: "replied" } as const, word: "replied" },
      { text: "Rejected", n: 1, want: { stage: "passed" } as const, word: "rejected" },
    ];
    const joined = joinPeople([
      { fields: asha, file: "resume:a" },
      { fields: asha, file: "sheet:1", status: "Replied" },
      { fields: asha, file: "sheet:2", status: "Rejected" },
      { fields: { fullName: "Ravi Kumar", email: "ravi@example.com" }, file: "sheet:1", status: "Replied" },
    ]);
    expect(joined.people).toHaveLength(2);
    const placing = placingOf([{ rows: joined.people, statusWords: words }], {});
    // She is named once, for the rejection her second sheet says, and counted once for each word of hers; he is not named.
    expect(placing?.reject).toEqual(["Asha Verma"]);
    expect(placing?.hire).toEqual([]);
    expect(placing?.rejectWords).toEqual([{ text: "Rejected", n: 1 }]);
    expect(placing?.words.map((w) => [w.text, w.n])).toEqual([["Replied", 2]]);
    expect(placing?.unplaced).toBe(0);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactEditable } from "../ContactEditable";
import { contactPatch, contactProblem, emailProblem, phoneProblem } from "../contactEdit";

/**
 * A candidate with no email can have one typed in where the sheet shows it; nothing about it needs a lookup first.
 */

describe("what can be typed", () => {
  it("says calmly what is wrong with an email or a number, and lets a cleared field through to clear it", () => {
    expect(emailProblem("dev@example.in")).toBeNull();
    expect(emailProblem("dev@")).toBe("That doesn't look like an email yet.");
    expect(emailProblem(" ")).toBe("Type an email address.");
    expect(phoneProblem("+91 98450 12345")).toBeNull();
    expect(phoneProblem("98450 12345")).toBeNull();
    expect(phoneProblem("12")).toMatch(/Check the number/);
    expect(phoneProblem("call me")).toMatch(/Check the number/);
    expect(contactProblem("email", "")).toBeNull();
    expect(contactProblem("phone", "abc")).toMatch(/Check the number/);
  });

  it("sends the contact the existing candidate update takes, and null to clear it", () => {
    expect(contactPatch("email", " dev@example.in ")).toEqual({ primaryEmail: "dev@example.in" });
    expect(contactPatch("phone", "98450 12345")).toEqual({ primaryPhone: "98450 12345" });
    expect(contactPatch("email", "")).toEqual({ primaryEmail: null });
  });
});

describe("the sheet's contact lines", () => {
  const line = (value: string | null) =>
    renderToStaticMarkup(
      <ContactEditable candidateId="c1" kind="email" value={value} onSaved={() => undefined}>
        <span>{value ?? "Not found yet"}</span>
      </ContactEditable>,
    );

  it("says Not found yet with a quiet Add email beside it when there is none", () => {
    const html = line(null);
    expect(html).toContain("Not found yet");
    expect(html).toContain("Add email");
    expect(html).toContain('aria-label="Add email"');
    expect(html).not.toContain("<input");
  });

  it("shows what is on file with an Edit beside it", () => {
    const html = line("dev@example.in");
    expect(html).toContain("dev@example.in");
    expect(html).toContain(">Edit<");
    expect(html).not.toContain("Add email");
  });

  it("is wired into the sheet, with the lookup kept and the empty location row gone", () => {
    const sheet = readFileSync(join(__dirname, "..", "ProfileSidebar.tsx"), "utf8");
    expect(sheet).toContain('<ContactEditable candidateId={row.candidate.id} kind="email"');
    expect(sheet).toContain('<ContactEditable candidateId={row.candidate.id} kind="phone"');
    expect(sheet).toContain('none="Not found yet" lookLabel="Look up"');
    expect(sheet).toContain("{c.location && <span><MapPin");
    expect(sheet).toContain("{(c.location || c.openToWork) && (");
  });
});

describe("cards that show a person follow what was written about them", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("the chat reads who was decided again when people are written about, and so does a search's list", () => {
    const agent = read("Agent.tsx");
    expect(agent).toMatch(/onInvalidate\(\(effects, campaigns\) => \{\s*if \(!LIVE \|\| !\(effects\.has\("pipeline"\) \|\| effects\.has\("candidates"\)\)\) return;/);
    expect(agent).toContain("readDecisions(cid)");
    const run = read("liveViews/SearchRun.tsx");
    expect(run).toContain("onInvalidate");
    expect(run).toContain("}, [search.status, search.campaignId, wrote]);");
  });
});

describe("one way to type a contact, in every sheet", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("is a compact field with Save and Cancel on its own row and our own words, never the browser's bubble", () => {
    const src = read("ContactEditable.tsx");
    expect(src).toContain("noValidate");
    expect(src).toContain('type="text"');
    expect(src).toContain('className="ce-row"');
    expect(read("contactsFetch.css")).toMatch(/\.ce-row \{ display: flex; flex-wrap: wrap;/);
    expect(read("contactsFetch.css")).toMatch(/\.ce-in \{\s*flex: 1 1 200px; min-width: 200px;/);
  });

  it("is the Candidates sheet's email and phone too, and its banner names only what has no field of its own", () => {
    const sheet = read("Contacts.tsx");
    expect(sheet).toContain("<ContactEditable candidateId={edit.candidateId}");
    expect(sheet).toContain('const gaps = LIVE ? missing.filter((m) => m !== "email" && m !== "phone") : missing;');
    expect(sheet).toContain("{gaps.length > 0 && (");
    expect(sheet).toContain("onContactSaved={() => { if (openId) loadDetail(openId); }}");
  });
});

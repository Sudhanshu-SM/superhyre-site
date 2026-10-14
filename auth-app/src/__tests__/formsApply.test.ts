import { describe, expect, it } from "vitest";
import { bodyFromForm, formFromView, matchNote, pageFromPublic, type FormView } from "../api/forms";
import { lookVars, mixHex, possessive, resolveAnswers } from "../ApplyForm";
import { arrivalFrom, referrerDomain } from "../ApplyPage";
import type { Question } from "../campaign";
import { normalisePhone } from "../candidateImport";
import { linkFor } from "../CampaignForms";
import { displayPhone, normalizePhone, PHONE_CASES, parsePhone, phoneProblemText, tidyPhone } from "../phone";

describe("phone numbers, the same way the server and database read them", () => {
  it.each(PHONE_CASES)("%s → %s", (typed, stored) => {
    expect(normalizePhone(typed)).toBe(stored);
    expect(normalisePhone(typed)).toBe(stored);
  });

  it("says what's wrong, and reads back the way people write them", () => {
    const short = parsePhone("98450 1234");
    expect(short.ok ? null : phoneProblemText(short.problem)).toBe("Indian numbers have 10 digits.");
    expect(displayPhone("+919845012345")).toBe("+91 98450 12345");
    expect(displayPhone("+14155550100")).toBe("+14155550100");
    expect(tidyPhone("9845012345")).toBe("98450 12345");
    expect(tidyPhone("+91 98450-12345")).toBe("+91 98450 12345");
    expect(tidyPhone("nope")).toBe("nope");
  });
});

describe("answers of their own", () => {
  const qs: Question[] = [
    { id: "c", type: "choice", title: "Mode", required: true, options: ["Remote", "Hybrid"], allowOther: true },
    { id: "m", type: "multi", title: "Tools", required: false, options: ["Spark"], allowOther: true },
    { id: "d", type: "dropdown", title: "City", required: false, options: ["Pune"], allowOther: true },
    { id: "l", type: "link", title: "GitHub", required: false },
  ];

  it("sends what they wrote for Other, and links with their scheme", () => {
    const out = resolveAnswers(
      qs,
      { c: "", m: ["Spark"], d: "", l: "github.com/me" },
      { c: { on: true, text: "  Four days   in office " }, m: { on: true, text: "Airflow" }, d: { on: false, text: "Chennai" } },
    );
    expect(out).toEqual({ c: "Four days in office", m: ["Spark", "Airflow"], d: "", l: "https://github.com/me" });
  });
});

describe("the hiring team's look", () => {
  it("uses their colour and fonts, with readable text on and around it", () => {
    const dark = lookVars({ theme: undefined }, {
      logoUrl: null, primary: "#1d4ed8", onPrimary: "#ffffff", palette: [], fontDisplay: "Fraunces", fontBody: "Inter", tone: "plain",
    }) as Record<string, string>;
    expect(dark).toMatchObject({ "--fm-fill": "#1d4ed8", "--fm-on-fill": "#ffffff", "--fm-text": "#1d4ed8", "--ap-font-display": '"Fraunces", var(--word)' });
    const light = lookVars({ theme: undefined }, {
      logoUrl: null, primary: "#fde047", onPrimary: "#1c1917", palette: [], fontDisplay: "Inter", fontBody: "Inter", tone: "plain",
    }) as Record<string, string>;
    expect(light["--fm-text"]).not.toBe("#fde047");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("names the team the way people write it", () => {
    expect(possessive("Acme")).toBe("Acme's");
    expect(possessive("fn3 Talent Partners")).toBe("fn3 Talent Partners'");
  });

  it("falls back to the brand orange without a team brand, whatever theme an older form stored", () => {
    expect(lookVars({ theme: "sage" }, null)).toMatchObject({ "--fm-fill": "#cc4d17" });
    expect(lookVars({ theme: "slate" }, null)).toMatchObject({ "--fm-fill": "#cc4d17" });
  });
});

describe("where applicants came from", () => {
  it("reads ?src= and UTM tags after the hash, and keeps only another site's domain", () => {
    expect(arrivalFrom("#/apply/KEY123?src=LinkedIn&utm_campaign=diwali")).toEqual({ src: "linkedin", utm: { campaign: "diwali" } });
    expect(arrivalFrom("#/apply/KEY123", "?utm_source=newsletter")).toEqual({ utm: { source: "newsletter" } });
    expect(referrerDomain("https://www.linkedin.com/feed/", "app.superhyre.com")).toBe("linkedin.com");
    expect(referrerDomain("https://app.superhyre.com/#/campaign", "app.superhyre.com")).toBeUndefined();
    expect(referrerDomain("", "app.superhyre.com")).toBeUndefined();
  });

  it("copies a link per channel that the page can read back", () => {
    const link = linkFor("https://app.superhyre.com/#/apply/KEY123", "whatsapp");
    expect(link).toBe("https://app.superhyre.com/#/apply/KEY123?src=whatsapp");
    expect(arrivalFrom(link.slice(link.indexOf("#")))).toEqual({ src: "whatsapp" });
  });
});

describe("the form and its page settings over the API", () => {
  const view: FormView = {
    id: "f1", campaignId: "c1", name: "Screen", status: "live", version: 2, title: "Data Engineer", description: null, role: null, theme: "ember",
    settings: { autoAddQualified: false, closesOn: "2026-11-30", successMessage: "Thanks!", closedMessage: null, promise: "We reply within 3 days." },
    questions: [{ id: "s1", type: "choice", title: "Mode", required: true, options: ["Remote", "Hybrid"], allowOther: true }],
    publicLink: null, hasDraftChanges: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  };

  it("round-trips the page settings and the Other answer", () => {
    const f = formFromView(view);
    expect(f.page).toEqual({ closesOn: "2026-11-30", successMessage: "Thanks!", closedMessage: null, promise: "We reply within 3 days." });
    const body = bodyFromForm(f, new Map(), new Map());
    expect(body.settings).toMatchObject({ closesOn: "2026-11-30", successMessage: "Thanks!", promise: "We reply within 3 days." });
    expect(body.questions[0]).toMatchObject({ allowOther: true });
  });

  it("reads an older public form as having no brand and no trust line", () => {
    expect(pageFromPublic({ status: "live", version: 1, title: "T", description: null, role: null, theme: null, questions: [] })).toEqual({
      company: null, brand: null, promise: null, closesOn: null, successMessage: null, applied: null,
    });
  });
});

describe("what a possible match says", () => {
  const m = { candidateId: "c", name: "Ravi", campaignCandidateId: null };
  it("names the reason", () => {
    expect(matchNote({ ...m, by: "linkedin" })).toBe("Looks like Ravi, already in your candidates. Same LinkedIn profile.");
    expect(matchNote({ ...m, by: "phone" })).toBe("Looks like Ravi, already in your candidates. Same phone number.");
    expect(matchNote({ ...m, by: "person" })).toBe("This is Ravi, already in your candidates.");
    expect(matchNote({ ...m, by: "email", proven: true })).toBe("Ravi's email, confirmed by the applicant. Ravi is already in your candidates.");
    expect(matchNote(m)).toBe("Looks like Ravi, already in your candidates. Same email.");
  });
});

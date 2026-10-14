import { describe, expect, it } from "vitest";
import { formsFor, missedMustHaves, mustHaveOf, mustHaves } from "../campaign";
import type { Question } from "../campaign";
import { TINTS, draftForm, estMinutes, idealMustHaves, parseIdeal, roleTitle, shortTitle, withArticle } from "../formKit";

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };

describe("formKit", () => {
  it("every tint fill carries white text at 4.5:1", () => {
    for (const t of Object.values(TINTS)) expect(contrast(t.fill, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("tertiary ink stays legible on every tint background", () => {
    for (const t of Object.values(TINTS)) expect(contrast("#776d66", t.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("drafts a backend form from one line", () => {
    const f = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend", ideal: "5+ years Go and Postgres, Bangalore 3 days a week" });
    const m = f.questions.find((q) => q.type === "multi")!;
    expect(m.options!.slice(0, 2)).toEqual(["Go", "Postgres"]);
    expect(m.options!.length).toBeLessThanOrEqual(7);
    expect(f.questions.some((q) => q.title === "Can you work from Bangalore 3 days a week?")).toBe(true);
    /* Go and Postgres from the line, plus the place the line names. */
    expect(mustHaves(f).map((q) => q.title)).toEqual([
      "Have you run Go in production?", "Have you run Postgres in production?", "Can you work from Bangalore 3 days a week?",
    ]);
    expect(f.sent).toBe(0);
    expect(f.status).toBe("draft");
    expect(f.title).toBe("Senior Backend Engineer");
    expect(f.role!.requirements[0]).toBe("5+ years of backend experience");
    expect(estMinutes(f)).toBe(4);
  });
  it("always has two must-haves, falling back to the campaign location", () => {
    for (const family of ["engineering", "sales", "design", "other"] as const) {
      const f = draftForm({ campaignId: "platform-sre", family, ideal: "" });
      expect(mustHaves(f)).toHaveLength(2);
      expect(f.questions.some((q) => /remotely/.test(q.title))).toBe(true);
    }
  });
  it("turns the ideal-hire line into must-haves", () => {
    const f = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend", ideal: "Someone who has run Postgres at scale and owned on-call for payments" });
    expect(mustHaves(f).map((q) => q.title)).toEqual([
      "Have you run Postgres in production at scale?", "Have you been on an on-call rota for a production system?",
    ]);
    expect(idealMustHaves("Someone who has run Postgres at scale and owned on-call for payments", "engineering").map((m) => m.label)).toEqual(["Postgres at scale", "on-call"]);
  });
  it("names a scale question for the chat, and cuts long titles at a word", () => {
    expect(shortTitle({ id: "s", type: "scale", title: "How well does this role match what you want next?", required: false })).toBe("role fit");
    const t = shortTitle({ id: "x", type: "choice", title: "Typical deal size you've closed in the last two years", required: true });
    expect(t).not.toMatch(/…/);
    expect(t.charAt(0)).toBe("t");
  });
  it("parses the ideal line", () => {
    expect(parseIdeal("three days in Bengaluru, remote ok")).toMatchObject({ city: "Bangalore", daysInOffice: 3, remote: true });
    expect(roleTitle("Design Lead")).toBe("Design Lead");
    expect(roleTitle("iOS Engineers")).toBe("iOS Engineer");
  });
  it("reads a legacy knockout as a must-have", () => {
    const q = formsFor("backend-snr")[0]!.questions.find((x) => x.knockout === "No")!;
    expect(mustHaveOf(q)).toEqual(["Yes"]);
  });
  it("flags a choice answer outside accept, and never a skipped one", () => {
    const q: Question = { id: "c", type: "choice", title: "Notice", required: true, options: ["Immediate", "90 days"], accept: ["Immediate"] };
    expect(missedMustHaves({ questions: [q] }, { c: "90 days" })).toHaveLength(1);
    expect(missedMustHaves({ questions: [q] }, { c: "Immediate" })).toHaveLength(0);
    expect(missedMustHaves({ questions: [q] }, {})).toHaveLength(0);
  });
});

describe("draft copy", () => {
  it("picks a or an from the role", () => {
    expect(withArticle("Applied Data Scientist")).toBe("an Applied Data Scientist");
    expect(withArticle("Senior Backend Engineer")).toBe("a Senior Backend Engineer");
  });
  it("names the form after the single role and reads a Data campaign as data work", () => {
    const f = draftForm({ campaignId: "ds-applied", family: "engineering", sub: "backend" });
    expect(f.name).toBe("Applied Data Scientist screening");
    expect(f.description).toMatch(/^We're hiring an Applied Data Scientist/);
    expect(f.description).not.toMatch(/on-call/);
  });
  it("turns a domain in the ideal-hire line into a question and a requirement", () => {
    const f = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend", ideal: "Someone who has owned payments services at scale" });
    expect(f.questions.some((q) => /payments/i.test(q.title))).toBe(true);
    expect(f.role?.requirements.some((r) => /payments/i.test(r))).toBe(true);
  });
});

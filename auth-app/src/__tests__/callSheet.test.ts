import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calledByLine, initialsOf, roleWord, sideOfLine } from "../callsView";

/** The call's sheet: who called is a unit of its own, and every section is a titled panel of its own. */

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("who called", () => {
  it("says it as 'Called by <Name>', and 'Called by You' for the viewer's own calls", () => {
    expect(calledByLine({ name: "Meera Pillai", mine: false })).toBe("Called by Meera Pillai");
    expect(calledByLine({ name: "Olivia Owner", mine: true })).toBe("Called by You");
    expect(calledByLine({ name: null, mine: false })).toBe("Called by a former teammate");
  });

  it("makes initials for the chip, and the role in words", () => {
    expect(initialsOf("Meera Pillai")).toBe("MP");
    expect(initialsOf("Anand")).toBe("A");
    expect(initialsOf("  priya   k  sharma ")).toBe("PS");
    expect(initialsOf(null)).toBe("?");
    expect(roleWord("admin")).toBe("Admin");
    expect(roleWord("recruiter")).toBe("Recruiter");
    expect(roleWord("something-new")).toBe("");
    expect(roleWord(undefined)).toBe("");
  });

  it("puts a caller row under the name, with the time and length beside it, in a soft panel", () => {
    const sheet = src("CallSheet.tsx");
    // Under the candidate's name and role: the header is the sheet's own and its body (CallBody, drawn right after it)
    // starts with the caller row, before any section.
    expect(sheet.indexOf("<CallBody id={id} hint={hint} campaigns={campaigns} />")).toBeGreaterThan(sheet.indexOf('<h2 className="kl-title">'));
    expect(sheet.indexOf('aria-label="Who called"')).toBeLessThan(sheet.indexOf('aria-label="Recording"'));
    expect(sheet.indexOf("{!bare && (\n        <section className=\"kl-caller\"")).toBeGreaterThan(-1);
    expect(sheet).toContain("calledByLine(shown.caller)");
    expect(sheet).toContain('className="kl-caller-when kl-num"');
    // The header no longer carries a "Called by" sentence of its own.
    expect(sheet).not.toMatch(/Called by \{callerName\}/);
    const css = src("calls.css");
    expect(css).toMatch(/\.kl-caller \{[^}]*border-radius: 12px; background: var\(--sub\);/);
    expect(css).toMatch(/\.kl-avatar \{[^}]*width: 32px; height: 32px;/);
    expect(css).toMatch(/\.kl-caller-name \{ font: 500 15px\//);
  });
});

describe("the sections", () => {
  const sheet = src("CallSheet.tsx");
  const css = src("calls.css");

  it("come in order: recording, summary, transcript, note, details", () => {
    const at = ["Recording", "Summary", "Transcript", "Your note", "Details"].map((l) => sheet.indexOf(`aria-label="${l}"`));
    expect(at.every((n) => n > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("are titled panels 16px apart, with 12px under the title", () => {
    expect(css).toMatch(/\.kl-sec \{ display: grid; gap: 12px; align-content: start; padding: 18px 20px; border: 1px solid var\(--hairline\); border-radius: 12px; background: var\(--sub\);/);
    expect(css).toMatch(/\.kl-sheet-body \{[^}]*padding: 0 22px 32px;[^}]*gap: 16px; \}/);
  });

  it("have headings in the brand's accent text, 15px at 600, over a short orange rule; the data under them is regular", () => {
    // The heading says what the section is in the colour of the product (the accent text token, 4.5:1 on the panel in
    // both themes), with a 24px by 2px orange rule under it: it cannot be taken for the data below it.
    expect(css).toMatch(/\.kl-sec-h \{ margin: 0; font: 600 15px\/1\.3 var\(--ui\); letter-spacing: -0\.006em; text-transform: none; color: var\(--accent-text\); \}/);
    expect(css).toMatch(/\.kl-sec-h::after \{ content: ""; display: block; width: 24px; height: 2px;[^}]*background: var\(--accent-fill\); \}/);
    expect(css).toMatch(/\.kl-sec \.t-body \{ font-size: 15px; line-height: 1\.55; font-weight: 400; color: var\(--ink\); \}/);
    for (const label of ["Recording", "Summary", "Transcript"]) expect(sheet).toContain(`<h3 className="kl-sec-h">${label}</h3>`);
    expect(sheet).toContain('<h3 className="kl-sec-h">Details</h3>');
    expect(sheet).toContain('className="kl-sec-h"');
  });

  it("show the key points with small orange markers", () => {
    expect(css).toMatch(/\.kl-points li::before \{[^}]*width: 6px; height: 6px;[^}]*background: var\(--accent-fill\);/);
    expect(sheet).toContain('<ul className="kl-points">');
  });

  it("show the next step as a callout: tinted, edged in orange, an arrow, its label, the action, and a task button", () => {
    expect(sheet).toContain('<span className="kl-next-h">Next step</span>');
    expect(sheet).toContain('<span className="kl-next-t">{text}</span>');
    expect(sheet).toContain("<ArrowBendDownRight");
    expect(sheet).toContain("Create task");
    // A tinted block with a faint border all round: no bar on its left.
    expect(css).toMatch(/\.kl-next \{[^}]*border: 1px solid color-mix\(in srgb, var\(--accent-fill\) 16%, var\(--card\)\); border-radius: 10px;\s*background: color-mix\(in srgb, var\(--accent-fill\) 7%, var\(--card\)\);/);
    expect(css).not.toMatch(/\.kl-next \{[^}]*border-left/);
    expect(css).toMatch(/\.kl-next-h \{ font: 600 13px\/1\.3 var\(--ui\); color: var\(--accent-text\); \}/);
  });

  it("make the task through the tasks API, for the person's own list, with the candidate's name and campaign, once", () => {
    expect(sheet).toContain('import { createTask } from "./api/tasks";');
    expect(sheet).toContain("createTask({ title: `${who}: ${text}`.slice(0, 300), campaignId, dueAt: null, candidateId })");
    expect(sheet).toContain('invalidateViews(["tasks", "week"])');
    // After it is made the button is gone and the sheet says so; a failure says why and leaves the button.
    expect(sheet).toContain("Added to your tasks");
    expect(sheet).toContain('toast(messageOf(err), "error")');
    // The summary hands the callout the candidate and the campaign the call was on.
    expect(sheet).toContain("candidateId={call.candidate?.id ?? null}");
    expect(sheet).toContain("campaignId={call.campaign?.id ?? null}");
  });

  it("bound the transcript at 320px, tint the two sides apart and keep the times quiet", () => {
    expect(css).toMatch(/\.kl-tx \{[^}]*max-height: 320px;/);
    expect(css).toMatch(/\.kl-line\.is-caller \.kl-speaker \{ color: var\(--accent-text\); \}/);
    expect(css).toMatch(/\.kl-line\.is-candidate \.kl-speaker \{ color: color-mix\(/);
    // The line that is playing is a ring all round, not a bar on its edge.
    expect(css).toMatch(/\.kl-line\.is-now > button \{ background: var\(--card\); box-shadow: inset 0 0 0 1px/);
    expect(sheet).toContain("`kl-line is-${sideOfLine(s.role)}");
    expect(sideOfLine("caller")).toBe("caller");
    expect(sideOfLine("candidate")).toBe("candidate");
    expect(sideOfLine(null)).toBe("other");
  });

  it("say where the note stands, and list the details in two columns, for everyone", () => {
    expect(sheet).toContain('"Saves when you click away"');
    expect(sheet).toContain('<Loader size="sm" tone="inherit" /> Saving</>');
    expect(sheet).toContain('<dl className="kl-dl">');
    for (const label of ["Called by", "Campaign", "How it went", "Time", "Length", "Source"]) expect(sheet).toContain(`<dt>${label}</dt>`);
    expect(css).toMatch(/\.kl-dl \{ display: grid; grid-template-columns: 112px minmax\(0, 1fr\);/);
    // Not only for people who can edit: the section is there for a call someone else made.
    expect(sheet).not.toMatch(/\{editable && \(\s*<section className="kl-sec kl-details"/);
  });
});

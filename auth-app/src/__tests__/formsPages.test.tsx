import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Form, Question } from "../campaign";

/**
 * A form in pages, like Google Forms: a section divider starts a page, the applicant sees one page at a time with
 * Back and Next, each page is checked before Next, and a section can end the form.
 */

vi.mock("../api/client", () => ({
  LIVE: true, API_URL: "http://api.test", api: async () => undefined,
  messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
}));

const { ApplyForm, pageProblems } = await import("../ApplyForm");
const { pagesOf, reachablePages, reachableQuestions, sectionTitles } = await import("../formPages");
const { responseTable } = await import("../exportTable");

const q = (id: string, title: string, over: Partial<Question> = {}): Question => ({ id, type: "short", title, required: false, ...over });
const sec = (id: string, title: string, over: Partial<Question> = {}): Question => ({ id, type: "section", title, required: false, ...over });

const questions: Question[] = [
  q("q1", "Opening question", { required: true }),
  sec("s1", "About your work", { help: "Two minutes." }),
  q("q2", "Work question", { required: true }),
  q("q3", "Tools", { type: "multi", options: ["SQL", "Python"] }),
  sec("s2", "Last bits"),
  q("q4", "Anything else", { type: "long" }),
];
const form = (qs: Question[] = questions): Form => ({
  id: "f1", campaign: "c1", name: "Data Analyst form", status: "live", sent: 0, accent: "#cc4d17",
  title: "Data Analyst", description: "", questions: qs,
});
const who = { name: "Pia", email: "pia@example.com", phone: "9845012345", linkedin: "" };

describe("pages of a form", () => {
  it("starts a page at each section, with the questions before the first as page one", () => {
    const pages = pagesOf(questions);
    expect(pages.map((p) => [p.section?.title ?? null, p.items.map((x) => x.id)])).toEqual([
      [null, ["q1"]],
      ["About your work", ["q2", "q3"]],
      ["Last bits", ["q4"]],
    ]);
  });

  it("is one page without sections, and when the form opens with a section the contact details sit on it", () => {
    expect(pagesOf([q("a", "A"), q("b", "B")])).toHaveLength(1);
    expect(pagesOf([])).toHaveLength(1);
    const opens = pagesOf([sec("s", "First"), q("a", "A"), sec("t", "Second"), q("b", "B")]);
    expect(opens.map((p) => p.section?.title)).toEqual(["First", "Second"]);
  });

  it("ends at a section set to submit: the pages after it are not reachable", () => {
    const qs = [q("a", "A"), sec("s1", "One", { after: "submit" }), q("b", "B"), sec("s2", "Two"), q("c", "C")];
    expect(reachablePages(pagesOf(qs))).toHaveLength(2);
    expect(reachableQuestions(qs).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("names the section each question is under", () => {
    const names = sectionTitles(questions);
    expect(names.get("q1")).toBeUndefined();
    expect(names.get("q3")).toBe("About your work");
    expect(names.get("q4")).toBe("Last bits");
  });

  it("heads an export's columns with the section they sit under, in question order", () => {
    const t = responseTable(form(), [], new Map());
    const heads = t.headers.slice(t.headers.indexOf("Time taken") + 1, -1);
    expect(heads).toEqual(["Opening question", "About your work: Work question", "About your work: Tools", "Last bits: Anything else"]);
  });
});

describe("checking a page before Next", () => {
  const pages = pagesOf(questions);

  it("page one checks the contact details and its own questions, and nothing from the pages after", () => {
    const e = pageProblems(pages, { name: "", email: "nope", phone: "12", linkedin: "" }, {}, {}, 0);
    expect(Object.keys(e).sort()).toEqual(["email", "name", "phone", "q1"]);
    expect(e.email).toBe("That email doesn't look right");
    expect(e.q1).toBe("This one's required");
  });

  it("a later page checks only its own required answers, and keeps what was answered on the way back", () => {
    expect(pageProblems(pages, who, { q1: "hello" }, {}, 1)).toEqual({ q2: "This one's required" });
    expect(pageProblems(pages, who, { q1: "hello", q2: "ok" }, {}, 1)).toEqual({});
    // The whole form, as the last page's Send checks it: the missing answer on an earlier page is found too.
    expect(Object.keys(pageProblems(pages, who, { q2: "ok" }, {}))).toEqual(["q1"]);
  });

  it("checks formats on the page they are on", () => {
    const qs = [q("a", "Profile", { type: "link" }), sec("s", "Next"), q("b", "Portfolio", { type: "link", required: true })];
    const p = pagesOf(qs);
    expect(pageProblems(p, who, { a: "not a link" }, {}, 0).a).toMatch(/doesn't look like a link/);
    expect(pageProblems(p, who, { a: "github.com/you" }, {}, 0)).toEqual({});
    expect(pageProblems(p, who, { a: "github.com/you" }, {}, 1)).toEqual({ b: "This one's required" });
  });
});

describe("the page an applicant sees", () => {
  const html = renderToStaticMarkup(<ApplyForm form={form()} mode="preview" />);

  it("is the first page, with Next, a progress line and a thin bar, and not yet Send", () => {
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain("width:33.3");
    expect(html).toContain(">Next<");
    expect(html).not.toContain("Send application");
    expect(html).not.toContain("Back</button>");
    expect(html).toContain("Opening question");
    expect(html).toContain("Full name");
  });

  it("does not draw the pages after it", () => {
    expect(html).not.toContain("Work question");
    expect(html).not.toContain("About your work");
    expect(html).not.toContain("Anything else");
  });

  it("counts only the pages that can be reached", () => {
    const ends = [...questions];
    ends[4] = sec("s2", "Last bits", { after: "submit" });
    ends[1] = sec("s1", "About your work", { after: "submit" });
    expect(renderToStaticMarkup(<ApplyForm form={form(ends)} mode="preview" />)).toContain("Page 1 of 2");
  });

  it("is one page, as before, without sections", () => {
    const one = renderToStaticMarkup(<ApplyForm form={form([q("a", "Only question")])} mode="preview" />);
    expect(one).toContain("Send application");
    expect(one).not.toContain("Page 1 of");
    expect(one).not.toContain('role="progressbar"');
    expect(one).not.toContain(">Next<");
  });
});

describe("blocks: one question, one card, on the page tint", () => {
  const css = readFileSync(resolve(__dirname, "..", "apply.css"), "utf8");
  const forms = readFileSync(resolve(__dirname, "..", "forms.css"), "utf8");
  const rule = (src: string, sel: string) => new RegExp(`${sel.replace(/[.[\]+>()]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? "";
  const px = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(css)?.[1]);

  it("draws the contact details as one block, then every question as its own, each in its own card", () => {
    const html = renderToStaticMarkup(<ApplyForm form={form()} mode="preview" />);
    const blocks = [...html.matchAll(/class="ap-block( [^"]*)?"/g)].map((m) => (m[1] ?? "").trim());
    // The contact block, and the one question on page one. (Page two's are not drawn until Next.)
    expect(blocks).toEqual(["ap-who-block", ""]);
    expect(html).toContain('class="ap-block ap-who-block"');
    expect(html.indexOf("Full name")).toBeGreaterThan(html.indexOf('class="ap-block ap-who-block"'));
    expect(html.indexOf("Opening question")).toBeGreaterThan(html.indexOf("LinkedIn profile"));
    const flat = renderToStaticMarkup(<ApplyForm form={form([q("a", "First"), q("b", "Second"), q("c", "Third")])} mode="preview" />);
    expect([...flat.matchAll(/class="ap-block( [^"]*)?"/g)]).toHaveLength(4);
  });

  it("gives a section title a block of its own, ahead of the questions it holds", () => {
    const html = renderToStaticMarkup(<ApplyForm form={form([sec("s", "Your work", { help: "Tell us." }), q("a", "First"), q("b", "Second")])} mode="preview" />);
    const at = html.indexOf('class="ap-block is-section"');
    expect(at).toBeGreaterThan(-1);
    expect(html.indexOf("Your work")).toBeGreaterThan(at);
    expect(html.indexOf("First")).toBeGreaterThan(html.indexOf("Your work"));
    expect(html.indexOf("Second")).toBeGreaterThan(html.indexOf("First"));
  });

  it("defines the field gap (6px), the stack gap (24px) and the block gap (16px) once", () => {
    expect(px("--ap-field-gap")).toBe(6);
    expect(px("--ap-stack-gap")).toBe(24);
    expect(px("--ap-block-gap")).toBe(16);
    expect(css).not.toContain("--ap-q-gap");
  });

  it("is a soft panel: white, a 1px subtle border, a 12px corner, 20 to 24px inside, no heavy shadow", () => {
    const block = rule(css, ".ap-lead,\n.ap-block,\n.ap-sheet-notice");
    expect(block).toMatch(/border:\s*1px solid var\(--ap-block-line\)/);
    expect(block).toMatch(/border-radius:\s*12px/);
    expect(block).toMatch(/background:\s*#fff/);
    expect(block).toMatch(/box-shadow:\s*0 1px 2px/);
    expect(rule(css, ".ap-block")).toMatch(/padding:\s*20px var\(--ap-pad\) 22px/);
  });

  it("takes a border in the brand colour and a faint ring all round while it is being filled in, and red when it needs a look (no one-sided bar)", () => {
    expect(rule(css, ".ap-block:focus-within")).toMatch(/border-color:\s*var\(--ap-band\)/);
    expect(rule(css, ".ap-block:focus-within")).toMatch(/box-shadow:\s*0 0 0 2px color-mix/);
    expect(rule(css, ".ap-block:has(.ap-err)")).toMatch(/border-color:\s*var\(--c-rose-fill\)/);
    expect(rule(css, ".ap-block:has(.ap-err)")).toMatch(/box-shadow:\s*0 0 0 2px color-mix/);
    expect(rule(css, ".ap-block:focus-within")).not.toMatch(/inset/);
  });

  it("puts the label 6px over its line, the line 6px over help or an error", () => {
    expect(rule(css, ".ap-ctl, .ap-scale")).toMatch(/margin-top:\s*var\(--ap-field-gap\)/);
    expect(rule(css, ".ap-err")).toMatch(/margin:\s*var\(--ap-field-gap\) 0 0/);
    expect(rule(css, ".ap-help-under")).toMatch(/margin-top:\s*var\(--ap-field-gap\)/);
  });

  it("is 24px from the band to the intro, 12px from a title to its description, 24px from the contact title to its first field", () => {
    expect(rule(css, ".ap-head > .ap-band")).toMatch(/margin-bottom:\s*24px/);
    expect(rule(css, ".ap-form-h p")).toMatch(/margin:\s*12px 0 0/);
    expect(rule(css, ".ap-section-h p")).toMatch(/margin:\s*12px 0 0/);
    expect(rule(css, ".ap-form-h")).toMatch(/margin-bottom:\s*24px/);
  });

  it("sets rows of choices 12px apart, 10px under the question, and the button row 32px under the last block", () => {
    expect(css).toMatch(/\.ap-opts \{ display: grid; gap: 12px; \}/);
    expect(css).toMatch(/\.ap-opts \{ margin-top: 10px; \}/);
    expect(rule(css, ".ap-submit-row")).toMatch(/margin-top:\s*32px/);
  });

  it("runs the blocks full width on a phone, 12px from either edge, and uses the same stack gap in the builder's card", () => {
    expect(css).toMatch(/@media \(max-width: 480px\) \{\s*\.ap \{ padding: 0 12px 24px; \}/);
    expect(rule(forms, ".fm-locked .ap-who")).toMatch(/gap:\s*var\(--ap-stack-gap\)/);
    expect(rule(forms, ".fm-mock.is-locked")).toMatch(/margin-top:\s*var\(--ap-field-gap\)/);
  });
});

describe("the page, from its stylesheet", () => {
  const css = readFileSync(resolve(__dirname, "..", "apply.css"), "utf8");
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("draws a field as a single underline that goes orange on focus, with no box", () => {
    const input = rule(".ap-input");
    expect(input).toMatch(/border:\s*0;/);
    expect(input).toMatch(/border-bottom:\s*1px solid/);
    expect(input).toMatch(/background:\s*transparent/);
    expect(rule(".ap-input:focus")).toMatch(/border-bottom-color:\s*var\(--ap-band\)/);
    expect(rule(".ap-input:focus")).toMatch(/box-shadow:\s*0 1px 0 0 var\(--ap-band\)/);
    expect(css).toMatch(/\.ap-field:focus-within > \.ap-label \{ color: var\(--ap-band\); \}/);
  });

  it("keeps choices as plain rows with no tint or edge", () => {
    expect(rule(".ap-opt")).toMatch(/background:\s*transparent/);
    expect(rule(".ap-opt")).toMatch(/border:\s*0/);
  });

  it("sizes the form's title 36px (28px on a phone) over 20px section titles", () => {
    expect(rule(".ap-band .ap-h1")).toMatch(/font-size:\s*var\(--fs-36\)/);
    expect(css).toMatch(/\.ap-band \.ap-h1 \{ font-size: var\(--fs-28\)/);
    expect(rule(".ap-form-h h2")).toMatch(/--type-title/);
  });
});

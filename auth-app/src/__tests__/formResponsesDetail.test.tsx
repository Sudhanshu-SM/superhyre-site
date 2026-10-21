import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResponseMeta } from "../api/forms";
import type { Form, Question } from "../campaign";
import { Decide, ResponseAnswers } from "../FormResponses";

/**
 * One response, read one by one: the question legible, the answer under it, the must-have result in
 * words beside it, the call on the person beside their name and a way to keep them in Candidates.
 */

const SRC = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(SRC, file), "utf8");

const questions: Question[] = [
  { id: "q1", type: "yesno", title: "Have you worked hands-on with Go?", required: true, accept: ["Yes"] } as Question,
  { id: "q2", type: "short", title: "What are you proudest of shipping?", required: false } as Question,
  { id: "q3", type: "yesno", title: "Can you work from Bengaluru?", required: true, accept: ["Yes"] } as Question,
];
const form = { id: "f1", campaign: "k1", name: "Screening", questions } as unknown as Form;

describe("the answers", () => {
  it("puts the question first and the answer straight under it, in the page's own body type", () => {
    const html = renderToStaticMarkup(<ResponseAnswers form={form} answers={{ q1: "Yes", q2: "A payments ledger", q3: "Yes" }} />);
    const at = (s: string) => html.indexOf(s);
    expect(html).toContain('<p class="fm-answers-q">Have you worked hands-on with Go?</p>');
    expect(at("Have you worked hands-on with Go?")).toBeLessThan(at('<span class="fm-answers-v">Yes</span>'));
    expect(html).toContain('<span class="fm-answers-v">A payments ledger</span>');
    expect(read("forms.css")).toMatch(/\.fm-answers-q \{[^}]*font: var\(--type-body-strong\)[^}]*color: var\(--ink\)/);
    expect(read("forms.css")).toMatch(/\.fm-answers-a \{[^}]*font: var\(--type-body-lg\)/);
  });

  it("says Met in colour beside a must-have that was met, and what it had to be beside one that was missed", () => {
    const html = renderToStaticMarkup(<ResponseAnswers form={form} answers={{ q1: "No", q2: "A ledger", q3: "Yes" }} />);
    expect(html).toContain('<span class="fm-chip is-amber">Must-have was Yes</span>');
    expect(html).toContain('<span class="fm-chip is-sage">Met</span>');
    // The missed row is the tinted one; the others are not.
    expect(html.match(/class="is-missed"/g)).toHaveLength(1);
    expect(html.indexOf('class="is-missed"')).toBeLessThan(html.indexOf("Must-have was Yes"));
  });

  it("says nothing of a must-have that was skipped, and says Skipped for the answer", () => {
    const html = renderToStaticMarkup(<ResponseAnswers form={form} answers={{ q2: "x" }} />);
    expect(html).not.toContain("Must-have was");
    expect(html).not.toContain(">Met<");
    expect(html).toContain("Skipped");
  });

  it("keeps the panel to a readable width, with no question in small grey type", () => {
    const css = read("forms.css");
    const panel = /\.fm-detail \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(Number(/max-width: (\d+)px/.exec(panel)?.[1])).toBeLessThanOrEqual(760);
    expect(css).not.toMatch(/\.fm-answers-q \{[^}]*(type-label|type-caption|ink-3)/);
  });
});

describe("the call on the person", () => {
  const noop = () => {};
  const meta = (over: Partial<ResponseMeta> = {}): ResponseMeta => ({ decision: null, stage: null, isNew: true, possibleMatch: null, ...over });
  const html = (props: Partial<Parameters<typeof Decide>[0]> = {}) =>
    renderToStaticMarkup(<Decide meta={meta()} name="Mira" inCandidates={false} onDecide={noop} onSave={noop} {...props} />);

  it("is shortlist, pass, and then a quiet add to candidates", () => {
    const out = html();
    const order = ["Add to shortlist", "Reject", "Add to candidates"].map((t) => out.indexOf(t));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(out).toMatch(/is-primary[^>]*>Add to shortlist/);
    expect(out).toMatch(/is-quiet[^>]*>Add to candidates/);
  });

  it("says they are in the candidates once they are, instead of offering to add them", () => {
    const out = html({ inCandidates: true });
    expect(out).toContain("In your candidates");
    expect(out).not.toContain("Add to candidates");
    expect(out).toContain("Add to shortlist");
  });

  it("shows only where they stand once they are on the board", () => {
    const out = html({ meta: meta({ stage: "shortlisted", decision: "added" }) });
    expect(out).toContain("Shortlisted");
    expect(out).not.toContain("Add to candidates");
    expect(out).not.toContain("Reject");
  });

  it("leaves a likely match to be linked, and does not offer to add them as someone new to the candidates", () => {
    const out = html({ meta: meta({ possibleMatch: { candidateId: "c9", name: "Mira Rao", campaignCandidateId: null, by: "email" } }) });
    expect(out).toContain("Link to Mira Rao");
    expect(out).toContain("Add as a new person");
    expect(out).not.toContain("Add to candidates");
  });

  it("is in the person's header beside the pager, and no longer in a bar under the answers", () => {
    const src = read("FormResponses.tsx");
    expect(src).not.toContain("fm-detail-f");
    expect(src).toMatch(/<div className="fm-detail-side">[\s\S]*fm-pager[\s\S]*<div className="fm-detail-acts">[\s\S]*<Decide/);
    expect(src.indexOf("<ResponseAnswers")).toBeGreaterThan(src.indexOf('className="fm-detail-acts"'));
    expect(read("forms.css")).not.toContain("fm-detail-f");
  });
});

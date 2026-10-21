import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StageDef } from "../boardStages";
import { stagesFrom } from "../boardStages";
import { StagesForm } from "../StagesDialog";

/** The stage editor as it first opens: every stage a line, the controls that matter on it, Hired and Rejected locked at the end. */

const def = (id: string, name: string, kind: StageDef["kind"], position: number, extra: Partial<StageDef> = {}): StageDef =>
  ({ id, name, kind, position, color: null, clientView: false, locked: kind === "hired" || kind === "passed", ...extra });

const STANDARD = stagesFrom([def("s", "Shortlisted", "shortlisted", 0), def("o", "Outreach", "outreach", 1), def("i", "Interviewing", "interviewing", 2), def("h", "Hired", "hired", 3), def("p", "Rejected", "passed", 4)]);
const WITH_CLIENT = stagesFrom([
  def("s", "Shortlisted", "shortlisted", 0), def("o", "Outreach", "outreach", 1), def("c", "Client review", "interviewing", 2, { clientView: true, color: "teal" }),
  def("i", "Interviewing", "interviewing", 3), def("h", "Hired", "hired", 4), def("p", "Rejected", "passed", 5),
]);

const render = (stages: readonly StageDef[], extra: { title?: string; save?: string } = {}) =>
  renderToStaticMarkup(<StagesForm stages={stages} counts={{ s: 2, o: 1 }} onSave={() => Promise.resolve(true)} onClose={() => {}} {...extra} />);

describe("the stage editor", () => {
  it("says what it is for in plain words and names the two stages it never changes", () => {
    const html = render(STANDARD);
    expect(html).toContain(">Stages<");
    expect(html).toContain("Hired and Rejected always stay at the end.");
    // Hired and Rejected are two quiet locked rows with a small lock, and say nothing more
    expect(html.match(/sg-row is-locked/g)).toHaveLength(2);
    expect(html).not.toContain("Always last");
  });

  it("has a line for each working stage with its name, its colour and the client's eye", () => {
    const html = render(WITH_CLIENT);
    for (const n of ["Shortlisted", "Outreach", "Client review", "Interviewing"]) expect(html).toContain(`value="${n}"`);
    expect(html).toContain('aria-label="Colour of Client review: Teal"');
    // the first stage is always violet and not for changing; the rest can be coloured
    expect(html).toContain("Colour of Shortlisted: Violet, always the first stage");
    expect(html).toContain('aria-label="Colour of Outreach: Default"');
    expect(html).toContain('aria-label="Show Shortlisted to the client"');
    // only the client's stage has the eye on
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Show Client review to the client"|aria-label="Show Client review to the client"[^>]*aria-pressed="true"/);
    expect(html).toContain("Your client sees the people in <b>Client review</b>");
    expect(render(STANDARD)).toContain("The eye shows one stage to your client.");
  });

  it("never shows what a stage counts as: no kind words, no select", () => {
    for (const html of [render(STANDARD), render(WITH_CLIENT)]) {
      expect(html).not.toMatch(/Counts as|counts as|<select|<option|Shortlist<|Interview<|Always last/);
      expect(html).not.toContain("It has people in it");
    }
  });

  it("offers to move a stage up or down, never off either end", () => {
    const html = render(STANDARD);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move Shortlisted up"|<button[^>]*aria-label="Move Shortlisted up"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move Interviewing down"|<button[^>]*aria-label="Move Interviewing down"[^>]*disabled=""/);
    expect(html).toContain('aria-label="Move Outreach up"');
    expect(html).not.toMatch(/aria-label="Move Outreach up"[^>]*disabled=""/);
  });

  it("offers the two presets and shows the one the stages are", () => {
    const standard = render(STANDARD);
    expect(standard).toMatch(/role="radio" aria-checked="true"[^>]*>Standard</);
    expect(standard).toMatch(/aria-checked="false"[^>]*>With client review</);
    const client = render(WITH_CLIENT);
    expect(client).toMatch(/aria-checked="true"[^>]*>With client review</);
  });

  it("has nothing to save until something changes, and can say what saving it means where it is used", () => {
    const html = render(STANDARD, { title: "Pipeline stages", save: "Use these stages" });
    expect(html).toContain("Pipeline stages");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Use these stages</);
  });

  it("offers to add a stage while there is room", () => {
    expect(render(STANDARD)).toContain("Add a stage");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Children, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StageColor, StageDef } from "../boardStages";
import { stagesFrom } from "../boardStages";
import { PICKABLE_HUES } from "../stageDonut";
import { ColourSwatches, StagesForm } from "../StagesDialog";

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

describe("the colour picker", () => {
  const NAMES = ["Blue", "Sky", "Indigo", "Violet", "Plum", "Pink", "Rose", "Red", "Orange", "Amber", "Yellow", "Lime", "Green", "Mint", "Teal", "Brown"];
  const html = (value: StageColor | null) => renderToStaticMarkup(<ColourSwatches value={value} onPick={() => {}} />);
  const swatches = (out: string) => [...out.matchAll(/<button type="button" role="option" aria-selected="(true|false)" class="(sg-sw[^"]*)" title="([^"]+)" aria-label="([^"]+)" style="--sg-c:var\(--stage-([a-z]+)\)"><\/button>/g)]
    .map((m) => ({ selected: m[1] === "true", cls: m[2]!, title: m[3]!, label: m[4]!, hue: m[5]! }));

  it("offers sixteen swatches, in the order of the grid, each named for a screen reader and on hover and drawn in its own colour, and no grey", () => {
    const out = html(null);
    const list = swatches(out);
    expect(list).toHaveLength(16);
    expect(list.map((x) => x.label)).toEqual(NAMES);
    expect(list.map((x) => x.title)).toEqual(NAMES);
    expect(list.map((x) => x.hue)).toEqual([...PICKABLE_HUES]);
    expect(list.map((x) => x.label.toLowerCase())).toEqual(list.map((x) => x.hue));
    expect(out).not.toContain("Slate");
    expect(out).toContain('role="listbox" aria-label="Colour"');
  });

  it("offers Default after the swatches, as a seventeenth choice that says the stage takes its kind's colour", () => {
    const out = html(null);
    expect((out.match(/role="option"/g) ?? []).length).toBe(17);
    expect((out.match(/class="sg-auto/g) ?? []).length).toBe(1);
    expect(out.lastIndexOf("sg-auto")).toBeGreaterThan(out.lastIndexOf('class="sg-sw'));
    expect(out).toMatch(/<button type="button" role="option" aria-selected="true" class="sg-auto t-body-sm is-on">Default<\/button>/);
  });

  it("rings the chosen colour and no other, and rings Default only when no colour is chosen", () => {
    expect(swatches(html(null)).filter((x) => x.selected)).toEqual([]);
    const teal = html("teal");
    expect(swatches(teal).filter((x) => x.selected).map((x) => [x.label, x.cls])).toEqual([["Teal", "sg-sw is-on"]]);
    expect(teal).toMatch(/aria-selected="false" class="sg-auto t-body-sm">Default</);
    // One of the nine added later is ringed the same way.
    expect(swatches(html("brown")).filter((x) => x.selected).map((x) => x.label)).toEqual(["Brown"]);
  });

  it("says which colour was pressed: the key of the swatch, and null for Default", () => {
    const picked = vi.fn();
    const tree = ColourSwatches({ value: null, onPick: picked }) as ReactElement<{ children: unknown }>;
    const buttons = Children.toArray(tree.props.children as never) as Array<ReactElement<{ title?: string; onClick: () => void }>>;
    expect(buttons).toHaveLength(17);
    for (const b of buttons.filter((x) => x.props.title)) b.props.onClick();
    expect(picked.mock.calls.map((c) => c[0])).toEqual([...PICKABLE_HUES]);
    buttons.find((x) => !x.props.title)!.props.onClick();
    expect(picked).toHaveBeenLastCalledWith(null);
  });

  it("lays them out four to a row, in a popover wide enough for each to be a real target", () => {
    const css = readFileSync(resolve(__dirname, "..", "stagesDialog.css"), "utf8");
    const dialog = readFileSync(resolve(__dirname, "..", "StagesDialog.tsx"), "utf8");
    expect(css).toMatch(/\.sg-swatches \{[^}]*display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.sg-auto \{ grid-column: 1 \/ -1;/);
    const gap = Number(/\.sg-swatches \{[^}]*gap: (\d+)px/.exec(css)?.[1]);
    const pad = Number(/\.sg-swatches \{[^}]*padding: (\d+)px/.exec(css)?.[1]);
    const width = Number(/<Popover anchor=\{ref\} open=\{open\} onClose=\{\(\) => setOpen\(false\)\} width=\{(\d+)\}>/.exec(dialog)?.[1]);
    // The popover's width, less its border and padding and the three gaps, shared by four swatches.
    const swatch = (width - 2 - 2 * pad - 3 * gap) / 4;
    expect(swatch).toBeGreaterThanOrEqual(32);
    expect(css).toMatch(/\.sg-sw \{[^}]*width: 100%; aspect-ratio: 1;[^}]*border-radius: 50%;/);
    // The chosen one is ringed (a shape, not only a colour), with a gap of its own that stays inside the grid's gap.
    expect(css).toMatch(/\.sg-sw\.is-on \{[^}]*0 0 0 2px var\(--card, #fff\), 0 0 0 4px var\(--ink\)/);
    expect(gap).toBeGreaterThanOrEqual(2 * 4);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/**
 * What was broken at 390 and 768 (T5 C7), pinned at the rule that broke it: a measured defect can come back as a
 * one-line edit to a stylesheet, and nothing but a browser sees it, so the rules are read here.
 */
describe("narrow screens", () => {
  it("gives a pipeline stage on a phone a real width, not a minimum of zero that four stages shared", () => {
    const w = css("workspace.css");
    expect(w).not.toMatch(/grid-auto-columns:\s*minmax\(0,\s*78%\)/);
    expect(w).toMatch(/@media \(max-width: 900px\) \{[^}]*\.cw-cols \{ grid-auto-columns: 78%;/);
    // A tablet has room for all four, side by side, with nothing hidden to the side.
    expect(w).toMatch(/@media \(min-width: 560px\) and \(max-width: 900px\) \{[^}]*\.cw-cols \{ grid-auto-columns: minmax\(0, 1fr\);/);
  });

  it("lets a person's name in a stage take two lines before it is cut", () => {
    expect(css("workspace.css")).toMatch(/\.cw-pc-name \{ display: -webkit-box; -webkit-line-clamp: 2;/);
  });

  it("drops the shortlisted table's secondary columns on a phone instead of squeezing the name to nothing", () => {
    expect(css("workspace.css")).toMatch(/@media \(max-width: 640px\) \{\s*\.sl-c-prof, \.sl-c-added, \.sl-c-org \{ display: none; \}\s*\.sl-c-name \{ width: auto; \}/);
  });

  it("gives the name and organisation the room the hidden role and owner columns left, at tablet width", () => {
    expect(css("workspace.css")).toMatch(/\.sl-c-role, \.sl-c-owner \{ display: none; \}[\s\S]{0,260}\.sl-c-name \{ width: 30%; \}\s*\.sl-c-org \{ width: 16%; \}/);
  });

  it("makes room beside the shortlist control for the delete button, so it is not cut by the table's edge", () => {
    const c = css("contacts.css");
    expect(c).toMatch(/\.ct-table \.ct-c-act \{ width: 236px;/);
    // Each narrower step still holds control + 4px + 32px button + the cell's padding.
    expect(c).toMatch(/\.ct-table \.ct-c-act \{ width: 214px; \}/);
    expect(c).toMatch(/\.ct-table \.ct-c-act \{ width: 204px; \}/);
  });

  it("gives a task on Home the whole line for its title on a phone, two lines before it is cut", () => {
    const h = css("home.css");
    expect(h).toMatch(/@container \(max-width: 480px\) \{\s*\.hm-tl-cols \{ display: none; \}/);
    expect(h).toMatch(/\.hm-tl-rows:not\(\.is-assigned\) \.hm-tl-t \{[^}]*-webkit-line-clamp: 2;/);
  });

  it("keeps the quick find inside the screen and drops the keyboard hints it has no use for there", () => {
    const a = css("access.css");
    expect(a).toMatch(/width: min\(560px, calc\(100vw - 32px\)\);/);
    expect(a).toMatch(/@media \(max-width: 560px\) \{[\s\S]{0,400}\.pal-kbd, \.pal-foot \{ display: none; \}/);
  });

  it("fits the three Add candidates tabs on one row on a phone, with the extension link under them", () => {
    const a = css("addCandidates.css");
    expect(a).toMatch(/\.ca-tab-full \{ display: none; \}\s*\.ca-tab-short \{ display: inline; \}/);
    expect(a).not.toMatch(/\.ca-tabs \{[^}]*overflow-x: auto/);
  });
});

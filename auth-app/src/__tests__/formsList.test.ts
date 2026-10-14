import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The campaign's forms list: the page's full width, one grid for the header and every row, 76px rows with 24px
 * of padding, the name taking about 40%, and a layout that stacks on a phone. Read from the stylesheet and the
 * component, since a browser alone would see the rest.
 */

const css = readFileSync(resolve(__dirname, "..", "forms.css"), "utf8");
const tsx = readFileSync(resolve(__dirname, "..", "CampaignForms.tsx"), "utf8");
const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]+>():]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

describe("the forms list", () => {
  it("uses the page's full width, not a narrow column", () => {
    const index = rule(".fm-index");
    expect(index).toMatch(/width:\s*100%/);
    expect(index).not.toMatch(/max-width/);
  });

  it("is one grid: the name about 40%, four equal figures, then the actions, in the header and in every row", () => {
    expect(rule(".fm-index")).toMatch(/--fm-cols:\s*minmax\(0, 4\.2fr\) repeat\(4, minmax\(0, 1fr\)\) 196px/);
    expect(rule(".fm-list-h")).toMatch(/grid-template-columns:\s*var\(--fm-cols\)/);
    expect(rule(".fm-li")).toMatch(/grid-template-columns:\s*var\(--fm-cols\)/);
    expect(rule(".fm-list-h")).toMatch(/padding:\s*12px 24px/);
  });

  it("makes a row 76px tall with 24px of padding, a soft separator and a hover wash", () => {
    const row = rule(".fm-li");
    expect(row).toMatch(/min-height:\s*76px/);
    expect(row).toMatch(/padding:\s*14px 24px/);
    expect(row).toMatch(/border-bottom:\s*1px solid var\(--hairline\)/);
    expect(rule(".fm-li:hover")).toMatch(/background:/);
  });

  it("sets the name 16px/500, the line under it 13px, and the status as plain text, not a badge", () => {
    expect(rule(".fm-row")).toMatch(/font:\s*500 var\(--fs-16\)/);
    expect(rule(".fm-row-t small")).toMatch(/--type-body-sm/);
    const status = rule(".fm-status");
    expect(status).not.toMatch(/background|border|border-radius/);
    expect(tsx).toContain('<span className="fm-status">');
  });

  it("puts the copy link and the arrow 12px apart in an actions column, and the agent strip 16px under the list", () => {
    expect(rule(".fm-li-actions")).toMatch(/gap:\s*12px/);
    expect(rule(".fm-index")).toMatch(/gap:\s*16px/);
    expect(rule(".fm-agent-row")).toMatch(/padding:\s*18px 20px/);
  });

  it("keeps the name, two key figures and the actions under 760px, and stacks the figures on a phone", () => {
    expect(css).toMatch(/@media \(max-width: 760px\) \{\s*\.fm-index \{ --fm-cols: minmax\(0, 1fr\) 72px 72px 64px; \}\s*\.fm-c-m, \.fm-c-u \{ display: none; \}/);
    expect(css).toMatch(/@media \(max-width: 520px\) \{\s*\.fm-list-h \{ display: none; \}/);
  });
});

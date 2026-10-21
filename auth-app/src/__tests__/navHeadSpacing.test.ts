import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sidebar's head, as the owner asked for it (13 Oct, "need some more spacing here"): a logo row 60px tall with
 * 8px under it, the organisation switcher 52px tall with 12 to 14px around it, Quick find and the bell on a 42px
 * row with 20px before Home, and 4px more between the organisation's chip and its name. Rows stay 34px, the
 * collapsed rail keeps its old head, and in a short window only the gap above the campaign tree gives.
 */
const css = readFileSync(resolve(__dirname, "..", "access.css"), "utf8");

/** The body of the first rule written for exactly this selector at the start of a line. */
function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${esc} \\{([^}]*)\\}`, "m").exec(css);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1]!;
}
const px = (body: string, prop: string): number => {
  const m = new RegExp(`(?:^|[\\s;])${prop}:\\s*(-?[\\d.]+)px`).exec(body);
  if (!m) throw new Error(`no ${prop} in ${body.slice(0, 60)}`);
  return Number(m[1]);
};

describe("the sidebar's head", () => {
  it("is a 60px logo row with 8px under it", () => {
    const head = rule(".nav-head");
    expect(px(head, "height")).toBe(60);
    expect(px(head, "margin-bottom")).toBe(8);
  });

  it("holds a 52px organisation switcher, 12px under the logo row's gap (8 + 4) and 14px above Quick find", () => {
    expect(px(rule(".nav-ws-trigger"), "min-height")).toBe(52);
    expect(rule(".nav-ws-block")).toMatch(/padding:\s*4px var\(--nav-pad\) 14px;/);
  });

  it("puts the chip 14px from the organisation's name, still centred on the icon axis", () => {
    expect(rule(".nav-ws-chip")).toMatch(/margin:\s*0 14px 0 calc\(\(var\(--nav-icon-box\) - 28px\) \/ 2\);/);
  });

  it("is a 42px Quick find and bell row, with 20px (18 and the section's 2) before Home", () => {
    expect(px(rule(".nav-find"), "height")).toBe(42);
    const bell = rule(".nav-bell");
    expect(px(bell, "width")).toBe(42);
    expect(px(bell, "height")).toBe(42);
    expect(rule(".nav-tools")).toMatch(/padding:\s*0 var\(--nav-pad\) 18px;/);
    expect(rule(".nav-body")).toMatch(/padding:\s*0 0 14px;/);
    expect(rule(".nav-sec")).toMatch(/padding:\s*2px var\(--nav-pad\);/);
  });

  it("keeps the unread count inside the row's top edge, clear of Quick find's border", () => {
    const badge = rule(".nav-bell-badge");
    expect(px(badge, "top")).toBeGreaterThanOrEqual(0);
    // Centred on the glyph's own top-right corner, inside the bell's circle: the bell and its count read as one
    // centred object, and the pill is a whole bell (42) and a gap (10) away.
    expect(px(badge, "right")).toBeGreaterThanOrEqual(0);
    expect(px(badge, "right")).toBeLessThanOrEqual(6);
  });

  it("leaves the navigation rows at 34px", () => {
    expect(css).toMatch(/--nav-row-h:\s*34px;/);
  });

  it("does not shrink the head in a short window: only the gap above the campaign tree gives", () => {
    const short = /@media \(min-width: 1024px\) and \(max-height: 640px\) \{([^]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(short).toContain(".nav-me-org { display: none; }");
    expect(short).not.toMatch(/\.nav-head|\.nav-ws|\.nav-tools|\.nav-find|\.nav-bell/);
    expect(css).toMatch(/@media \(min-width: 1024px\) and \(max-height: 800px\) \{\s*\.nav-campaign \{ margin-top: 6px; \}\s*\}/);
  });

  it("leaves the collapsed rail's head as it was", () => {
    const rail = /\/\* The collapsed rail keeps its compact head[^]*?\n\}/.exec(css)?.[0] ?? "";
    expect(rail).toContain(".nav.is-railed .nav-head { height: 48px; padding-top: 0; margin-bottom: 0; }");
    expect(rail).toContain(".nav.is-railed .nav-ws-block { padding-top: 0; padding-bottom: 8px; }");
    expect(rail).toContain(".nav.is-railed .nav-ws-trigger { min-height: 0; }");
    expect(rail).toContain(".nav.is-railed .nav-tools { padding-bottom: 12px; }");
    expect(rail).toContain(".nav.is-railed .nav-find { height: 34px; }");
    expect(rail).toContain(".nav.is-railed .nav-body { padding-top: 0; }");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/**
 * What was broken at 390 and 768 (T5 C7), pinned at the rule that broke it: a measured defect can come back as a
 * one-line edit to a stylesheet, and nothing but a browser sees it, so the rules are read here.
 */
describe("narrow screens", () => {
  it("gives a pipeline stage a real width at every size, never a minimum of zero that four stages shared", () => {
    const w = css("workspace.css");
    expect(w).not.toMatch(/grid-auto-columns:\s*minmax\(0,\s*78%\)/);
    expect(w).toMatch(/@media \(max-width: 900px\) \{[^}]*\.cw-cols \{ grid-auto-columns: max\(240px, 78%\);/);
    // A tablet scrolls the stages sideways at 240px each; it does not squeeze four of them into 40px (words broke mid-word).
    expect(w).toMatch(/@media \(min-width: 560px\) and \(max-width: 900px\) \{[^}]*\.cw-cols \{ grid-auto-columns: minmax\(240px, 1fr\);/);
    expect(w).not.toMatch(/@media \(min-width: 560px\) and \(max-width: 900px\) \{[^}]*grid-auto-columns: minmax\(0, 1fr\)/);
    // The board's own rule has the last word, with no width gate: 240px to 340px on a laptop, a tablet and a phone.
    const b = css("boardStages.css");
    expect(b).toMatch(/\.cw-board \.cw-cols \{\s*grid-auto-columns: clamp\(240px, calc\(\(100% - 4 \* 14px\) \/ 5\), 340px\);/);
    expect(b).toMatch(/@media \(max-width: 560px\) \{\s*\.cw-board \.cw-cols \{ grid-auto-columns: max\(240px, 78%\); \}/);
  });

  it("breaks a card's words only between words: anywhere is for a long token, and a name or a title wraps normally", () => {
    expect(css("workspace.css")).toMatch(/\.cw-pc-name \{[^}]*overflow-wrap: break-word;/);
    expect(css("boardStages.css")).toMatch(/\.pl-col-t strong \{[^}]*overflow-wrap: break-word;/);
    expect(css("boardStages.css")).toMatch(/\.ov2-bar\[data-sc\] \.ov2-bar-l \{[^}]*overflow-wrap: break-word;/);
    expect(css("workspace.css")).not.toMatch(/\.cw-pc-name \{[^}]*overflow-wrap: anywhere/);
  });

  it("lets a person's name in a stage take two lines before it is cut", () => {
    expect(css("workspace.css")).toMatch(/\.cw-pc-name \{ display: -webkit-box; -webkit-line-clamp: 2;/);
  });

  it("gives the shortlisted table's name 240px of its own and drops the other columns by the table's room, not the window's", () => {
    const w = css("workspace.css");
    expect(w).toMatch(/\.sl-c-name \{ width: 240px; \}/);
    expect(w).toMatch(/\.sl-scroll \{[^}]*container: slist \/ inline-size;/);
    // Least useful first: role, then owner and contact, then added, then profiles; the name is never on the list.
    expect(w).toMatch(/@container slist \(max-width: 1000px\) \{ \.sl-c-role \{ display: none; \} \}/);
    expect(w).toMatch(/@container slist \(max-width: 900px\) \{ \.sl-c-owner, \.sl-c-email, \.sl-c-phone \{ display: none; \} \}/);
    expect(w).toMatch(/@container slist \(max-width: 780px\) \{ \.sl-c-added \{ display: none; \} \}/);
    expect(w).toMatch(/@container slist \(max-width: 700px\) \{ \.sl-c-prof \{ display: none; \} \}/);
    expect(w).not.toMatch(/\.sl-c-name \{ width: 16%; \}/);
    // What is left at the narrowest table (check, name, status, organisation) fits above the card width.
    expect(38 + 240 + 150 + 124).toBeLessThanOrEqual(660);
  });

  it("turns the shortlisted table into cards under 660px of table: the name and status on a line, the organisation under it", () => {
    const w = css("workspace.css");
    const cards = w.slice(w.indexOf("@container slist (max-width: 660px) {"));
    expect(cards).toMatch(/\.sl-table, \.sl-table thead, \.sl-table tbody \{ display: block; \}/);
    expect(cards).toMatch(/grid-template-areas: "ck nm st" "ck og og";/);
    expect(cards).toMatch(/\.sl-table td:is\(\.sl-c-prof, \.sl-c-owner, \.sl-c-added, \.sl-c-role, \.sl-c-email, \.sl-c-phone\) \{ display: none; \}/);
    // Tokens only, so the card is the same in the dark theme.
    expect(cards.slice(0, cards.indexOf("\n}\n"))).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("makes room beside the shortlist control for the delete button, so it is not cut by the table's edge", () => {
    const c = css("contacts.css");
    expect(c).toMatch(/\.ct-table \.ct-c-act \{ width: 236px;/);
    // Each narrower step still holds control + 4px + 32px button + the cell's padding.
    expect(c).toMatch(/\.ct-table \.ct-c-act \{ width: 228px; \}/);
    expect(c).toMatch(/\.ct-table \.ct-c-act \{ width: 220px; \}/);
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

/**
 * The console at laptop (1024-1279), tablet (768-1023) and phone (375-767) widths. A real browser found the breaks;
 * what a stylesheet can pin is pinned here, at the rule.
 */
describe("laptop, tablet and phone", () => {
  it("makes the sidebar a drawer below 1024px: the CSS and the script name the same breakpoint", () => {
    const a = css("access.css");
    const bp = Number(/--nav-bp:\s*(\d+)px;/.exec(a)![1]);
    expect(bp).toBe(1024);
    expect(readFileSync(resolve(__dirname, "..", "Console.tsx"), "utf8")).toContain(`const NAV_BP = ${bp};`);
    expect(a).toContain(`@media (max-width: ${bp - 1}px) {\n  .con { grid-template-columns: minmax(0, 1fr); }`);
    expect(a).toMatch(new RegExp(`@media \\(min-width: ${bp}px\\) \\{\\n  \\.con-bar \\{ display: none; \\}`));
    // Nothing is left on the old step, where the sidebar and the drawer would both be drawn at 900 to 1023.
    expect(a).not.toMatch(/@media \(max-width: 899px\)/);
    expect(a).not.toMatch(/@media \(min-width: 900px\)/);
    expect(css("agentHero.css")).toMatch(/@media \(max-width: 1023px\) \{\s*\.orc \{ --land-y: 62px; \}/);
  });

  it("keeps the Candidates name at 180px or more at every width the table is a table, and a card below that", () => {
    const c = css("contacts.css");
    const pct = (sel: string, from = 0) => {
      const m = new RegExp(`\\.ct-table \\.ct-c-${sel} \\{ width: (\\d+)%; \\}`).exec(c.slice(from));
      return Number(m![1]) / 100;
    };
    const act = (from: number) => Number(/\.ct-table \.ct-c-act \{ width: (\d+)px;/.exec(c.slice(from))![1]);
    const at = (q: string) => c.indexOf(q);
    const base = c.indexOf(".ct-table { table-layout: fixed; }");
    const q1240 = at("@container (max-width: 1240px) {\n  /* Narrower: the company");
    const q900 = at("@container (max-width: 900px) {\n  .ct-table .ct-c-sum { display: none; }");
    const q760 = at("@container (max-width: 760px) {\n  .ct-table { min-width: 0; }");
    // the widest narrow step first: the company column is drawn only above 1240px of table
    expect(1241 - 44 - 236 - 1241 * (pct("co", base) + pct("sum", base) + pct("contact", base))).toBeGreaterThanOrEqual(180);
    expect(901 - 44 - act(q1240) - 901 * (pct("sum", q1240) + pct("contact", q1240))).toBeGreaterThanOrEqual(180);
    expect(761 - 44 - act(q1240) - 761 * pct("contact", q900)).toBeGreaterThanOrEqual(180);
    expect(661 - 44 - act(q760) - 661 * pct("contact", q760)).toBeGreaterThanOrEqual(180);
    // under 660px there is no table: a card per person, the contact under the name, truncated
    const cards = c.slice(c.indexOf("@container (max-width: 660px) {"));
    expect(cards).toMatch(/\.ct-table \.ct-row \{\s*display: grid; grid-template-columns: 44px minmax\(0, 1fr\) auto; grid-template-areas: "ck who act" "ck ct ct";/);
    expect(cards.slice(0, cards.indexOf("\n}\n"))).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("drops the forms list's must-haves and updated columns below 1280px, so the headers stop running into each other", () => {
    const f = css("forms.css");
    expect(f).toMatch(/\.fm-list-h > span \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    expect(f).toMatch(/@media \(max-width: 1279px\) \{\s*\.fm-index \{ --fm-cols: minmax\(0, 1fr\) 96px 104px 196px; \}\s*\.fm-c-m, \.fm-c-u \{ display: none; \}/);
    // The phone's own list (after it in the file) still wins at 760px.
    expect(f.indexOf("@media (max-width: 1279px)")).toBeLessThan(f.indexOf("@media (max-width: 760px)"));
  });

  it("gives the Overview funnel a height of its own where the cards stack, and lets its rows set the height on a phone", () => {
    const b = css("boardStages.css");
    expect(b).toMatch(/@container ovsec \(max-width: 800px\) \{\s*\.ov4-panel \.ov2-funnel\[style\*="--n"\] \{ height: 224px; \}/);
    // A tablet in the drawer's widths stacks the two cards too (the 1360px split after the 980px rule had kept them side by side).
    expect(b).toMatch(/@media \(min-width: 681px\) and \(max-width: 1023px\) \{\s*\.ov4-panels \{ grid-template-columns: minmax\(0, 1fr\); row-gap: 14px; \}/);
    // The phone's rows (last, at the same weight as the two above) set their own height.
    expect(b).toMatch(/@media \(max-width: 680px\) \{\s*\.ov4-panel \.ov2-funnel, \.ov4-panel \.ov2-funnel\[style\*="--n"\] \{ height: auto; min-height: 0; overflow: visible; \}/);
    expect(b.indexOf("@media (max-width: 680px) {\n  .ov4-panel .ov2-funnel,")).toBeGreaterThan(b.indexOf("@container ovsec (max-width: 800px)"));
    expect(b).toMatch(/\.ov2-bar-s \{ max-width: 100%; overflow: hidden; text-overflow: ellipsis; \}/);
    // the container the query names exists
    expect(css("workspace.css")).toContain(".ov4-sec { container: ovsec / inline-size; }");
  });

  it("stacks the Home tiles in one column up to 1100px, and puts Home's title on the page's own column", () => {
    expect(css("home.css")).toMatch(/@media \(max-width: 1100px\) \{\s*\.hm-bento \{ grid-template-columns: minmax\(0, 1fr\); gap: 14px; \}\s*\.hm-bento > \* \{ grid-column: auto !important; \}/);
    const a = css("access.css");
    expect(a).toContain("html .con-main > :is(.ct, .cg, .kl, .cw, .an-page) { width: 100%; max-width: var(--page-max); margin-inline: auto; }");
    expect(a).toMatch(/html \.con-main \.orc-main:has\(\.hm-bento\) > :is\(\.orc-page, \.orc-stream\),[^{]*\{\s*box-sizing: border-box; width: 100%; max-width: calc\(var\(--page-max\) \+ 2 \* var\(--hm-x, 0px\)\); margin-inline: auto;/);
    // The Overview has no gutter of its own on top of the console's, so its title is on the same left edge too.
    expect(a).toContain("html .con-main > .cw.ov2 { padding-inline: 0; }");
    // Support is in the same column, its fields held to a reading measure inside it.
    expect(a).toContain("html .con-main > .con-page.sp { max-width: var(--page-max); margin-inline: auto; }");
  });

  it("draws the log-a-call note in the input face, and Close campaign as the same secondary button in the banner as on the Overview", () => {
    const l = css("logCall.css");
    expect(l).toMatch(/\.lc textarea \{[^}]*font-family: var\(--ui\);/);
    expect(l).not.toMatch(/\.lc textarea \{[^}]*font-family: inherit/);
    expect(css("boardStages.css")).toMatch(/\.pl-filled \.cw-btn\.is-quiet, \.pl-client-a \.cw-btn\.is-quiet \{ height: 36px; padding: 0 14px; font: var\(--type-body-strong\);/);
    // Both places use the one button class, not a danger or a primary look.
    expect(readFileSync(resolve(__dirname, "..", "FilledBar.tsx"), "utf8")).toMatch(/className="cw-btn is-quiet" onClick=\{\(\) => setAsking\("close"\)\}>Close campaign</);
    expect(readFileSync(resolve(__dirname, "..", "CampaignWorkspace.tsx"), "utf8")).toMatch(/className="cw-btn" onClick=\{\(\) => setClosing\(true\)\}>Close campaign</);
  });

  it("keeps the agent's counts table, its New chat control, forms copy, the pager and campaign names whole on a small screen", () => {
    const t = css("agentCards/countsCard.css");
    expect(t).toContain("overflow-wrap: break-word;");
    expect(t).not.toMatch(/\.ctt \.ctt-name a \{[^}]*anywhere/);
    expect(t).toMatch(/@media \(max-width: 560px\) \{\s*\.ctt \{ display: block; max-width: 100%; overflow-x: auto;/);
    expect(t).toMatch(/\.ctt th\.ctt-name \{ position: sticky; left: 0;[^}]*min-width: 150px;[^}]*background: var\(--page\);/);
    expect(t).toMatch(/\.ctt \.ctt-n \{ min-width: 64px; white-space: nowrap; \}/);
    const a = css("access.css");
    expect(a).toMatch(/@media \(max-width: 560px\) \{\s*\.orc-newchat \{ width: 32px; height: 32px;[^}]*\}\s*\.orc-newchat-l \{ position: absolute;/);
    expect(readFileSync(resolve(__dirname, "..", "Agent.tsx"), "utf8")).toContain('<span className="orc-newchat-l">New chat</span>');
    // The pager is never wider than its row: its controls wrap onto a second line rather than being clipped.
    expect(a).toMatch(/\.pager \{[^}]*max-width: 100%;/);
    expect(a).toMatch(/\.pager-nav \{[^}]*flex-wrap: wrap;[^}]*max-width: 100%;/);
    const f = css("forms.css");
    expect(f).toMatch(/@media \(max-width: 520px\) \{\s*\.fm-row \{ white-space: normal;[^}]*-webkit-line-clamp: 2;/);
    expect(f).toMatch(/\.fm-row-t small \{ flex-wrap: wrap; white-space: normal;/);
    expect(css("campaigns-page.css")).toMatch(/@container \(min-width: 521px\) and \(max-width: 1000px\) \{\s*\.cg-row \{ gap: 20px;[^}]*\}\s*\.cg-stats \{ grid-template-columns: repeat\(3, 80px\); \}[\s\S]*-webkit-line-clamp: 2; white-space: normal;/);
  });

  it("lets up to eight Overview bars shrink to fit at 1200px and over, and scrolls only with nine or more", () => {
    const b = css("boardStages.css");
    expect(b).toMatch(/@media \(min-width: 1200px\) \{\s*\.ov4-panel \.ov2-funnel\[style\*="--n"\] \{ grid-template-columns: repeat\(var\(--n\), minmax\(56px, 1fr\)\); gap: 6px;/);
    expect(b).toMatch(/\.ov2-funnel\[style\*="--n: 9"\], \.ov4-panel \.ov2-funnel\[style\*="--n: 1"\] \{ grid-template-columns: repeat\(var\(--n\), minmax\(88px, 1fr\)\);/);
    // Eight bars of 56px and seven 6px gaps fit the narrowest card the desktop layout gives them (about 500px at 1200).
    expect(8 * 56 + 7 * 6).toBeLessThanOrEqual(500);
  });

  it("thins the chart's date labels to one per 60px of its own width, and lets the idea chips give way instead of overlapping", () => {
    const v = readFileSync(resolve(__dirname, "..", "viz.tsx"), "utf8");
    expect(v).toContain("Math.max(2, Math.min(labels, Math.floor((width - GX) / 60) + 1))");
    expect(v).toContain("new ResizeObserver(");
    expect(v).toMatch(/Array\.from\(\{ length: shown \}/);
    expect(css("recs.css")).toMatch(/\.orc \.orc-chip \{[^}]*flex: 0 1 auto;/);
    expect(css("composer.css")).toMatch(/@media \(max-width: 520px\) \{\s*\.orc \.orc-composer \.orc-composer-row \{ flex-wrap: wrap;/);
  });
});

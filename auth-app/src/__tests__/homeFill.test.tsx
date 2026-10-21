import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeEmpty } from "../HomeEmpty";

/**
 * Home's cards: the campaigns bento fills its card (three rows of tiles, or two in a short card, with "+N more / View
 * all" under them), Coming up has room to read, and an empty card is one shape everywhere (picture, headline, one
 * line, one action) centred in the card's free space.
 */

const css = readFileSync(join(__dirname, "..", "home.css"), "utf8");

describe("the active campaigns bento fills its card", () => {
  it("is six equal columns and rows that are as tall as the card gives them, with the +N more line across all of them under the tiles", () => {
    expect(css).toMatch(/\.hm-cl \{[^}]*display: grid; grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); grid-template-rows: repeat\(var\(--rows, 3\), var\(--rh, 150px\)\);/);
    expect(css).toMatch(/\.hm-cl li\.hm-cl-more \{ animation: none; grid-column: 1 \/ -1; grid-row: calc\(var\(--rows, 3\) \+ 1\); \}/);
    expect(css).toMatch(/\.hm-cl \{[^}]*gap: 12px;/);
  });

  it("starts under the title, says one calm line when every campaign is empty, and keeps the entry animation off for reduced motion", () => {
    expect(css).toMatch(/\.hm-cl-hint \{[^}]*align-items: center;[^}]*text-align: center;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.hm-card, \.hm-quad-c, \.hm-cl li, \.hm-cl-bar::after, \.hm-cl-hint,/);
    const code = readFileSync(join(__dirname, "..", "HomeCards.tsx"), "utf8");
    expect(code).toContain("Approve a role spec and the agent starts finding people");
    expect(code).toContain("rows.every((r) => isEmpty(stagesOf(r)) && r.funnel.sourced === 0)");
    expect(code).toContain("Open {rows[0]!.name}");
    expect(code).toContain("Ask the agent</a>}");
  });

  it("gives the campaigns half of the live console's top row, and the week and Coming up the same split below it", () => {
    expect(css).toContain(".hm-bento.is-three .hm-today { grid-column: 1 / span 6; }");
    expect(css).toContain(".hm-bento.is-three .hm-camps { grid-column: 7 / span 6; grid-row: 1; }");
    expect(css).toContain(".hm-bento.is-three:has(> .hm-coming) .hm-week { grid-column: 1 / span 6; }");
    expect(css).toContain(".hm-bento.is-three:has(> .hm-coming) .hm-coming { grid-column: 7 / span 6; grid-row: 2; }");
  });
});

describe("Coming up has room to read", () => {
  const block = css.slice(css.indexOf("coming up, v2"));

  it("has 24px above the title, 16px under it, and rows of 64px with 12px above and below", () => {
    expect(block).toMatch(/\.hm-coming > \.hm-th \{ padding: 24px var\(--hm-tx\) 16px; \}/);
    expect(block).toMatch(/\.sc-row \{ min-height: 64px; padding: 12px 0; align-items: center;/);
  });

  it("centres the time and its two actions on one line, with a hairline in the Calls list's tint", () => {
    expect(block).toMatch(/\.sc-when, \.hm-coming-b \.sc-list\.is-compact \.sc-acts \{ align-self: center; \}/);
    expect(block).toMatch(/--kl-line: color-mix\(in srgb, var\(--accent-fill\) 14%, transparent\)/);
    expect(block).toMatch(/border-bottom: 1px solid var\(--kl-line\)/);
  });

  it("never sits flush with the top of the window when it is scrolled to", () => {
    expect(block).toMatch(/scroll-margin-top: 24px/);
  });
});

describe("an empty Home card", () => {
  it("is a picture, a headline, one line and the actions, in one block", () => {
    const html = renderToStaticMarkup(
      <HomeEmpty art="empty-campaigns" title="Start your first campaign" line="Tell the agent who you're hiring for.">
        <button type="button">New campaign</button>
        <a href="#/agent">Ask the agent</a>
      </HomeEmpty>,
    );
    expect(html).toContain('class="hm-es"');
    expect(html).toMatch(/<img[^>]*width="120"[^>]*height="120"/);
    expect(html).toContain("Start your first campaign");
    expect(html).toContain("Tell the agent who you&#x27;re hiring for.");
    expect(html).toContain("New campaign");
    expect(html).toContain("Ask the agent");
  });

  it("takes a smaller picture beside the words in a short card", () => {
    const html = renderToStaticMarkup(<HomeEmpty short art="empty-schedules" title="Nothing coming up" />);
    expect(html).toContain("hm-es is-short");
    expect(html).toMatch(/<img[^>]*width="72"/);
  });

  it("is centred both ways in the card's free space, with no edge bar", () => {
    const m = /\.hm-es \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(m).toMatch(/flex: 1/);
    expect(m).toMatch(/align-items: center/);
    expect(m).toMatch(/justify-content: center/);
    expect(m).toMatch(/text-align: center/);
    expect(m).not.toMatch(/border-left|border-inline-start/);
  });

  it("is what each empty card on Home uses", () => {
    const code = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
    const cards = code("HomeCards.tsx");
    expect(cards).toMatch(/<HomeEmpty art="empty-campaigns" title="Start your first campaign"/);
    expect(cards).toContain("New campaign");
    expect(cards).toMatch(/art="empty-tasks"/);
    expect(cards).toMatch(/art="empty-analytics" title="A quiet week so far"/);
    expect(code("ComingUp.tsx")).toMatch(/art="empty-schedules"/);
    // The card's primary action is the header button's own: one function.
    expect(cards).toMatch(/onClick=\{startNewCampaign\}/);
    expect(code("Home.tsx")).toMatch(/onClick=\{startNewCampaign\}/);
  });
});

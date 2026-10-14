import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeEmpty } from "../HomeEmpty";
import { MAX_CAMPAIGN_ROWS, MIN_CAMPAIGN_ROWS, campaignRowsFit } from "../HomeCards";

/**
 * Home's cards: the campaigns list fills its card (as many 58px rows as fit, 4 to 10, with "+N more / View all"
 * pinned under them), Coming up has room to read, and an empty card is one shape everywhere (picture, headline,
 * one line, one action) centred in the card's free space.
 */

const css = readFileSync(join(__dirname, "..", "home.css"), "utf8");
const ROW = 58;
const MORE = 44;

describe("the active campaigns list fills its card", () => {
  it("shows every campaign when they all fit", () => {
    expect(campaignRowsFit(5, 5 * ROW)).toBe(5);
    expect(campaignRowsFit(7, 600)).toBe(7);
  });

  it("shows as many as fit with room kept for the +N more line, so the band left over is never a row", () => {
    for (const count of [11, 14, 30]) {
      for (let room = 200; room <= 900; room += 7) {
        const shown = campaignRowsFit(count, room);
        expect(shown).toBeGreaterThanOrEqual(MIN_CAMPAIGN_ROWS);
        expect(shown).toBeLessThanOrEqual(MAX_CAMPAIGN_ROWS);
        const used = shown * ROW + MORE;
        const wanted = Math.min(MAX_CAMPAIGN_ROWS, Math.max(MIN_CAMPAIGN_ROWS, Math.floor((room - MORE) / ROW)));
        expect(shown).toBe(wanted);
        // Unless the card is taller than ten rows, what is left over is less than one row.
        if (wanted < MAX_CAMPAIGN_ROWS && wanted > MIN_CAMPAIGN_ROWS) expect(room - used).toBeLessThan(ROW);
      }
    }
  });

  it("never shows more than there are, and never fewer than four when there are that many", () => {
    expect(campaignRowsFit(2, 1000)).toBe(2);
    expect(campaignRowsFit(30, 100)).toBe(MIN_CAMPAIGN_ROWS);
    expect(campaignRowsFit(30, 5000)).toBe(MAX_CAMPAIGN_ROWS);
    expect(campaignRowsFit(0, 500)).toBe(0);
  });

  it("pins +N more / View all to the bottom of the card", () => {
    expect(css).toMatch(/\.hm-camps \.hm-cl \{ display: flex; flex-direction: column; \}/);
    expect(css).toMatch(/\.hm-camps \.hm-cl > \.hm-cl-more \{ margin-top: auto; \}/);
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

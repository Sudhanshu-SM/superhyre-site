import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pager, pageItems } from "../components/Pager";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("the pager's numbers", () => {
  it("shows every page up to seven", () => {
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("jumps to the ends and keeps the neighbours, with an ellipsis for what is left out", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, "gap-end", 20]);
    expect(pageItems(10, 20)).toEqual([1, "gap-start", 9, 10, 11, "gap-end", 20]);
    expect(pageItems(20, 20)).toEqual([1, "gap-start", 17, 18, 19, 20]);
  });

  it("shows the page instead of an ellipsis that would hide only one", () => {
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, "gap-end", 20]);
    expect(pageItems(17, 20)).toEqual([1, "gap-start", 16, 17, 18, 19, 20]);
  });
});

describe("the pager", () => {
  const html = (p: Partial<Parameters<typeof Pager>[0]> = {}) =>
    renderToStaticMarkup(<Pager offset={10} limit={10} total={54} unit="campaigns" onChange={() => undefined} {...p} />);

  it("says where you are, steps and jumps, with labels a screen reader can use", () => {
    const h = html();
    expect(h).toContain("11–20 of 54");
    expect(h).toContain('role="status"');
    expect(h).toContain('aria-live="polite"');
    expect(h).toContain('aria-label="Campaigns, pages"');
    expect(h).toContain('aria-label="Previous page"');
    expect(h).toContain('aria-label="Next page"');
    expect(h).toContain('aria-label="Page 6"');
    expect(h).toMatch(/aria-label="Page 2"[^>]*aria-current="page"/);
  });

  it("is disabled at the ends instead of vanishing", () => {
    expect(html({ offset: 0 })).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Previous page"/);
    expect(html({ offset: 50 })).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Next page"/);
  });

  it("keeps the count on a single page and drops the controls, and draws nothing for an empty list", () => {
    const one = html({ offset: 0, total: 8 });
    expect(one).toContain("1–8 of 8");
    expect(one).not.toContain("Next page");
    expect(html({ total: 0 })).toBe("");
  });

  it("does not invent a last page when the total is not known", () => {
    const h = html({ offset: 20, total: null, more: true, count: 10 });
    expect(h).toContain("21–30");
    expect(h).not.toContain(" of ");
    expect(h).toContain('aria-label="Page 4"');
    expect(h).not.toContain('aria-label="Page 5"');
    expect(html({ offset: 0, total: null, more: false })).toBe("");
  });
});

describe("the pager, easier to use", () => {
  const html = (p: Partial<Parameters<typeof Pager>[0]> = {}) =>
    renderToStaticMarkup(<Pager offset={20} limit={10} total={200} unit="campaigns" onChange={() => undefined} {...p} />);

  it("labels Previous and Next with words as well as icons, and jumps to the first and last page", () => {
    const h = html();
    expect(h).toMatch(/aria-label="Previous page"[^>]*>[^]*?<span class="pager-w">Previous<\/span>/);
    expect(h).toMatch(/<span class="pager-w">Next<\/span>[^]*?aria-label="Next page"|aria-label="Next page"[^>]*><span class="pager-w">Next<\/span>/);
    expect(h).toContain('aria-label="First page"');
    expect(h).toContain('aria-label="Last page"');
    expect(html({ offset: 0 })).toMatch(/<button[^>]*disabled=""[^>]*aria-label="First page"/);
    expect(html({ offset: 190 })).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Last page"/);
  });

  it("takes a page number to go to once there are more than seven pages, and not before", () => {
    const h = html();
    expect(h).toContain("Go to page");
    expect(h).toContain('type="number"');
    expect(h).toContain('max="20"');
    expect(html({ total: 70 })).not.toContain("Go to page");
    expect(html({ offset: 20, total: null, more: true, count: 10 })).not.toContain("Go to page");
    expect(html({ offset: 20, total: null, more: true, count: 10 })).not.toContain("Last page");
  });

  it("is drawn under the list too, with the whole range written out, and is not read out twice", () => {
    const bar = html();
    const foot = html({ variant: "foot" });
    expect(foot).toContain("pager-foot");
    expect(foot).toContain("Showing </span>21–30 of 200");
    expect(foot).not.toContain("<span class=\"sr-only\">Showing </span>");
    expect(foot).not.toContain('role="status"');
    expect(bar).toContain('role="status"');
    expect(bar).toContain("pager-bar");
    expect(foot).toContain('aria-label="Campaigns, pages, bottom of the list"');
    expect(foot).toMatch(/aria-label="Page 3"[^>]*aria-current="page"/);
  });

  it("makes the ellipsis a button that jumps half-way across the pages it hides", () => {
    const h = html({ offset: 20 });
    expect(h).toMatch(/<button[^>]*class="pager-pg pager-gap"[^>]*aria-label="Pages 5 to 19, go to page 12"/);
    expect(h).not.toContain('class="pager-gap" aria-hidden');
    const mid = html({ offset: 90 });
    expect(mid).toContain('aria-label="Pages 2 to 8, go to page 5"');
    expect(mid).toContain('aria-label="Pages 12 to 19, go to page 16"');
  });

  it("always names the last page and the total once the total is known", () => {
    const h = html({ offset: 0 });
    expect(h).toContain('aria-label="Page 20"');
    expect(h).toContain("Page 1 of 20");
    expect(h).toContain("of 200");
  });

  it("is hidden under the list only when everything fits one page", () => {
    expect(html({ variant: "foot", offset: 0, total: 8 })).toBe("");
    expect(html({ variant: "foot", offset: 0, total: 10 })).toBe("");
    expect(html({ variant: "foot", offset: 0, total: 11 })).toContain("pager-foot");
    expect(html({ variant: "foot", offset: 0, total: null, more: false })).toBe("");
  });
});

describe("one control, at the top and the bottom, everywhere", () => {
  it("sits in each list's toolbar and the lists name themselves for the scroll to top", () => {
    expect(src("CampaignsPage.tsx")).toMatch(/<SortMenu[^]*?<Pager[^]*?<\/div>\s*\{!ready/);
    expect(src("CampaignsPage.tsx")).toContain("data-pager-list");
    expect(src("Contacts.tsx")).toMatch(/<SortButton[^]*?<Pager/);
    expect(src("Contacts.tsx")).toContain("data-pager-list");
    expect(src("Clients.tsx")).toMatch(/className="sl-bar-r"[^]*?<Pager/);
    expect(src("CampaignWorkspace.tsx")).toMatch(/className="sl-bar-r"[^]*?<Pager/);
    expect(src("CallsPage.tsx")).toContain("pager={");
    expect(src("OutreachPage.tsx")).toContain("pager={");
  });

  it("is drawn again under every paged list and its View all dialog", () => {
    for (const f of ["CampaignsPage.tsx", "Contacts.tsx", "Clients.tsx", "CampaignWorkspace.tsx", "CallsPage.tsx", "OutreachPage.tsx", "DialerPage.tsx"]) {
      expect(src(f), f).toContain('variant="foot"');
    }
    expect(src("CallsModal.tsx")).toContain('variant="foot"');
    expect(src("OutreachPage.tsx").match(/variant="foot"/g)?.length).toBe(2);
    expect(src("Contacts.tsx")).toMatch(/<Pager \{\.\.\.pagerProps\} variant="foot" \/>/);
  });

  it("leaves no older bottom controls behind", () => {
    for (const f of ["CampaignsPage.tsx", "Contacts.tsx", "Clients.tsx", "CampaignWorkspace.tsx", "CallsPage.tsx", "OutreachPage.tsx", "CallsModal.tsx"]) {
      const code = src(f);
      expect(code, f).not.toContain("sl-pager");
      expect(code, f).not.toContain("ct-foot-pages");
      expect(code, f).not.toContain("Load more");
    }
  });

  it("keeps room for the bottom pager when it sizes a page", () => {
    for (const f of ["CampaignsPage.tsx", "Contacts.tsx", "Clients.tsx", "CampaignWorkspace.tsx", "CallsPage.tsx", "OutreachPage.tsx"]) {
      expect(src(f), f).toContain("PAGER_FOOT");
    }
  });

  it("has hit areas of 36px or more and a visible focus ring", () => {
    const css = src("access.css");
    const pager = css.slice(css.indexOf("/* ── pager ──"), css.indexOf("/* ── call detail: recording and transcript ──"));
    expect(pager).toMatch(/\.pager-btn,\s*\.pager-pg \{[^}]*min-width: 36px;\s*height: 36px;/);
    expect(pager).toMatch(/\.pager-goto-in \{[^}]*height: 36px;/);
    expect(pager).toContain("outline: 2px solid var(--focus)");
    expect(pager).toContain(".pager-pg.is-on { background: var(--ink)");
  });

  it("keeps the bar in view while the list scrolls: sticky, on the page's own ground, no shadow", () => {
    expect(src("calls.css")).toMatch(/\.kl > \.kl-bar \{ position: sticky; top: 10px; z-index: 4; padding: 6px 0 8px; background: var\(--page\); box-shadow: 0 -10px 0 var\(--page\); \}/);
    expect(src("campaigns-page.css")).toMatch(/\.cg-bar \{\s*position: sticky;/);
    expect(src("contacts.css")).toMatch(/\.ct-bar \{\s*position: sticky;/);
    const pager = src("access.css").slice(src("access.css").indexOf("/* ── pager ──"), src("access.css").indexOf("/* ── call detail: recording and transcript ──"));
    expect(pager).not.toContain("box-shadow");
    expect(pager).toContain("[data-pager-list] { scroll-margin-top: 76px; }");
  });
});

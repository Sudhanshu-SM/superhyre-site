import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignRow } from "../campaignsData";

/**
 * The row under the Agent's composer: at most three ideas on one line and the search of past chats at its end.
 * The helpers decide what is shown (which three, how many fit); the markup test pins what a person gets;
 * the stylesheet and source reads pin the two things a browser alone would see (the row never wraps, and the
 * composer's resting height is the window's, not the rail's).
 */

const { rows, ready } = vi.hoisted(() => ({ rows: { value: [] as unknown[] }, ready: { value: true } }));
vi.mock("../api/client", () => ({
  LIVE: true, API_URL: "http://api.test", api: async () => undefined,
  messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
}));
vi.mock("../campaignStore", () => ({ useCampaignRows: () => rows.value, useCampaignsReady: () => ready.value }));
vi.mock("../can", () => ({ useCan: () => true }));

const { MAX_CHIPS, chipLabel, chipLimit, generalIdeas, ideasFromCampaigns, liveIdeas, nextVisit, pickChips } = await import("../recs");
const { IdeaChips } = await import("../Recs");

const row = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: "c1", name: "Data Engineer", department: "", location: "", status: "active", owner: "A", team: [],
  funnel: { sourced: 30, shortlisted: 6, contacted: 4, replied: 1, interviews: 0, hired: 0 },
  trend: Array.from({ length: 14 }, () => 1), target: 1, agents: [], updatedAgo: "", createdAgo: "", ...over,
});
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("how many chips a row holds", () => {
  it("is three on a wide row and when the width is not known yet", () => {
    expect(MAX_CHIPS).toBe(3);
    expect(chipLimit(null)).toBe(3);
    expect(chipLimit(undefined)).toBe(3);
    expect(chipLimit(580)).toBe(3);
    expect(chipLimit(596)).toBe(3);
    expect(chipLimit(1200)).toBe(3);
  });

  it("is two on a phone and one on a very narrow row, never none", () => {
    // 390 wide: the composer is 348 across.
    expect(chipLimit(348)).toBe(2);
    expect(chipLimit(328)).toBe(2);
    expect(chipLimit(300)).toBe(1);
    expect(chipLimit(120)).toBe(1);
    expect(chipLimit(0)).toBe(1);
    expect(chipLimit(Number.NaN)).toBe(3);
  });

  it("drops a chip exactly when it could no longer keep its floor, and never goes past three", () => {
    // Three chips at 140 with two gaps of 6 and the search button's 32 + 6.
    expect(chipLimit(470)).toBe(3);
    expect(chipLimit(469)).toBe(2);
    expect(chipLimit(10_000)).toBe(3);
    expect(chipLimit(10_000, 2)).toBe(2);
  });
});

describe("which chips a visit shows", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id })) as unknown as Parameters<typeof pickChips>[0];

  it("shows at most three, in order of relevance, on the first visit", () => {
    expect(ids(pickChips(pool, { visit: 0 }))).toEqual(["a", "b", "c"]);
    for (let v = 0; v < 12; v++) expect(pickChips(pool, { visit: v }).length).toBeLessThanOrEqual(3);
  });

  it("moves on by three each visit, and the last three are filled from the front so the row is never short", () => {
    expect(ids(pickChips(pool, { visit: 1 }))).toEqual(["d", "e", "f"]);
    expect(ids(pickChips(pool, { visit: 2 }))).toEqual(["g", "h", "a"]);
    // And round again.
    expect(ids(pickChips(pool, { visit: 3 }))).toEqual(["a", "b", "c"]);
  });

  it("never shows one idea twice in a row, and tolerates a repeated id in what it is given", () => {
    for (let v = 0; v < 6; v++) {
      const got = ids(pickChips(pool, { visit: v }));
      expect(new Set(got).size).toBe(got.length);
    }
    const twice = [...pool, ...pool];
    expect(ids(pickChips(twice, { visit: 0 }))).toEqual(["a", "b", "c"]);
  });

  it("shows the first of the three that fit when the row is narrow: two on a phone, one when tighter", () => {
    expect(ids(pickChips(pool, { visit: 0, width: 348 }))).toEqual(["a", "b"]);
    expect(ids(pickChips(pool, { visit: 1, width: 348 }))).toEqual(["d", "e"]);
    expect(ids(pickChips(pool, { visit: 0, width: 250 }))).toEqual(["a"]);
    expect(ids(pickChips(pool, { visit: 0, width: 596 }))).toEqual(["a", "b", "c"]);
  });

  it("returns what there is when there are fewer than three, and nothing for nothing", () => {
    expect(ids(pickChips((pool as unknown as { id: string }[]).slice(0, 2) as never, { visit: 5 }))).toEqual(["a", "b"]);
    expect(pickChips([], { visit: 0 })).toEqual([]);
  });

  it("treats a bad visit as the first", () => {
    expect(ids(pickChips(pool, { visit: Number.NaN }))).toEqual(["a", "b", "c"]);
    expect(ids(pickChips(pool, { visit: -4 }))).toEqual(["a", "b", "c"]);
  });

  it("goes up by itself on each visit", () => {
    const a = nextVisit();
    const b = nextVisit();
    expect(b).toBe(a + 1);
  });
});

describe("what the chips say", () => {
  it("leads, for someone with campaigns, with attention, then the agents, then finding people", () => {
    const ideas = liveIdeas([row()], { canCreate: true });
    const first = pickChips(ideas, { visit: 0 });
    expect(first.map(chipLabel)).toEqual(["What needs my attention?", "How are my agents doing?", "Find people for a role"]);
  });

  it("uses the short form where there is one and never ends on a colon", () => {
    const find = generalIdeas({ canCreate: true, hasCampaigns: true }).find((i) => i.id === "g-find")!;
    expect(find.prompt.endsWith(": ")).toBe(true);
    expect(chipLabel(find)).toBe("Find people for a role");
    expect(chipLabel({ ...find, short: undefined })).toBe("Find people for a role");
  });

  it("carries the campaigns' own ideas to later visits, so the row rotates through them", () => {
    const rows2 = [row({ id: "a", name: "Designer" }), row({ id: "b", name: "Writer" })];
    const ideas = liveIdeas(rows2, { canCreate: false });
    const own = ideasFromCampaigns(rows2);
    const later = [...Array(6).keys()].flatMap((v) => ids(pickChips(ideas, { visit: v })));
    for (const o of own) expect(later).toContain(o.id);
  });
});

describe("the row, as it is drawn", () => {
  beforeEach(() => {
    rows.value = [row()];
    ready.value = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const draw = (visit = 0) =>
    renderToStaticMarkup(<IdeaChips mode="sourcing" visit={visit} onPick={() => {}} onPreview={() => {}} onFind={() => {}} />);

  it("is three buttons and a search button, with an accessible name and a tooltip, and no refresh control", () => {
    const html = draw();
    expect(html.match(/class="orc-chip"/g)).toHaveLength(3);
    expect(html).toContain("What needs my attention?");
    expect(html).toContain("How are my agents doing?");
    expect(html).toContain("Find people for a role");
    expect(html).toContain('class="orc-find"');
    expect(html).toContain('aria-label="Search chats"');
    expect(html).toContain('title="Search chats (/)"');
    expect(html).not.toMatch(/Other ideas|rc-more|rc-card/);
  });

  it("puts the search last, so it is the right end of the row", () => {
    const html = draw();
    expect(html.lastIndexOf("orc-find")).toBeGreaterThan(html.lastIndexOf("orc-chip"));
  });

  it("holds only the search button until the campaigns have arrived, rather than flashing general ideas", () => {
    ready.value = false;
    const html = draw();
    expect(html).not.toContain('class="orc-chip"');
    expect(html).toContain('class="orc-find"');
  });

  it("shows the next three on the next visit", () => {
    const first = draw(0);
    const next = draw(1);
    expect(next).not.toBe(first);
    expect(next).toContain("Start a new campaign");
  });
});

describe("what a browser alone would see", () => {
  it("keeps the chips on one line: no wrap, cut with an ellipsis, and the row's width is its container's", () => {
    const css = src("recs.css");
    expect(css).toMatch(/\.orc \.orc-chips \{[^}]*flex-wrap: nowrap;/);
    expect(css).toMatch(/\.orc \.orc-chips \{[^}]*contain: inline-size;/);
    expect(css).toMatch(/\.orc \.orc-chip-t \{[^}]*text-overflow: ellipsis;/);
    // The search button is pushed to the end whatever the chips take.
    expect(css).toMatch(/\.orc \.orc-find \{[^}]*margin-left: auto;/);
  });

  it("is no longer a stack of cards above the composer, and has no control to shuffle them", () => {
    expect(src("Recs.tsx")).not.toMatch(/Other ideas|ArrowsClockwise/);
    expect(src("recs.css")).not.toMatch(/\.rc-card|\.rc-cards|\.rc-more/);
    const agent = src("Agent.tsx");
    expect(agent).not.toMatch(/<Recs\b/);
    expect(agent).toMatch(/<IdeaChips\b/);
  });

  it("seats the composer from the window, not from the rail's Configuration panel", () => {
    const hero = src("agentHero.css");
    // About 40% of the window's height, in the top third on a phone.
    expect(hero).toMatch(/--land-at: min\(40dvh, 440px\);/);
    expect(hero).toMatch(/@media \(max-width: 640px\) \{\s*\.orc \{ --land-at: 34dvh; \}/);
    expect(hero).toMatch(/\.orc \.orc-stream:not\(\.is-live\) \.orc-log \{\s*min-height: max\(/);
    const agent = src("Agent.tsx");
    expect(agent).not.toMatch(/--land-push|landPush/);
    // Two lines at rest, six at most, then it scrolls.
    expect(agent).toMatch(/const REST_LINES = 2;/);
    expect(agent).toMatch(/const MAX_LINES = 6;/);
  });
});

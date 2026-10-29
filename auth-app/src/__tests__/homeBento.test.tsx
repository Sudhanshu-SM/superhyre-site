import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_ROWS } from "../campaignsData";
import type { CampaignRow } from "../campaignsData";
import { CampaignItem, FULL_HAVE, MAX_TILES, bentoKind, bentoPlan, bentoRowsFit, factsOf, haveOf, latestFirst, progressRows, tileRing, tileRows } from "../HomeCards";
import type { BentoKind, BentoTile, TileHave, TileShow } from "../HomeCards";

/**
 * Home's Active campaigns card is a bento of at most five tiles in six columns: where each tile goes (bentoPlan), how
 * many rows the card has room for (bentoRowsFit), which campaigns (latestFirst), what each tile has room to say
 * (tileRows, from its pixel size) and how it says it.
 */

const ROWS = [2, 3] as const;
const area = (t: BentoTile) => t.c * t.r;
const fits = (t: BentoTile, rows: number) => t.col >= 1 && t.row >= 1 && t.c >= 1 && t.r >= 1 && t.col + t.c - 1 <= 6 && t.row + t.r - 1 <= rows;
const cellsOf = (t: BentoTile) => {
  const out: string[] = [];
  for (let x = t.col; x < t.col + t.c; x++) for (let y = t.row; y < t.row + t.r; y++) out.push(`${x}.${y}`);
  return out;
};

describe("where the tiles go", () => {
  it("keeps every tile inside the six columns and the rows, with no overlap and no gap, for 0 to 8 campaigns, and shows at most five", () => {
    expect(MAX_TILES).toBe(5);
    for (const rows of ROWS) {
      for (let n = 0; n <= 8; n++) {
        const plan = bentoPlan(n, rows);
        expect(plan.tiles.length).toBe(Math.min(n, 5));
        expect(plan.hidden).toBe(Math.max(0, n - 5));
        expect(plan.rows).toBe(n === 0 ? 0 : rows);
        for (const t of plan.tiles) expect(fits(t, rows)).toBe(true);
        const cells = plan.tiles.flatMap(cellsOf);
        expect(new Set(cells).size).toBe(cells.length);
        // The tiles make a whole grid: nothing is left empty in the card.
        expect(cells.length).toBe(n === 0 ? 0 : 6 * rows);
      }
    }
  });

  it("puts the latest campaign on the biggest tile, and never makes a later one bigger", () => {
    for (const rows of ROWS) {
      for (let n = 1; n <= 5; n++) {
        const tiles = bentoPlan(n, rows).tiles;
        for (const t of tiles.slice(1)) expect(area(tiles[0]!)).toBeGreaterThanOrEqual(area(t));
      }
    }
  });

  it("is one whole-card tile for one campaign, two equal halves for two, and the pinwheel for five", () => {
    expect(bentoPlan(1, 3).tiles).toEqual([{ col: 1, row: 1, c: 6, r: 3 }]);
    expect(bentoPlan(1, 2).tiles).toEqual([{ col: 1, row: 1, c: 6, r: 2 }]);
    expect(bentoPlan(2, 3).tiles).toEqual([{ col: 1, row: 1, c: 3, r: 3 }, { col: 4, row: 1, c: 3, r: 3 }]);
    expect(bentoPlan(2, 2).tiles).toEqual([{ col: 1, row: 1, c: 3, r: 2 }, { col: 4, row: 1, c: 3, r: 2 }]);
    expect(bentoPlan(5, 3)).toEqual({
      tiles: [
        { col: 3, row: 2, c: 4, r: 2 },
        { col: 1, row: 1, c: 2, r: 2 },
        { col: 3, row: 1, c: 2, r: 1 },
        { col: 5, row: 1, c: 2, r: 1 },
        { col: 1, row: 3, c: 2, r: 1 },
      ],
      rows: 3,
      hidden: 0,
    });
    expect(bentoPlan(12, 3)).toMatchObject({ rows: 3, hidden: 7 });
    expect(bentoPlan(6, 2)).toMatchObject({ rows: 2, hidden: 1 });
    expect(bentoPlan(-3, 3)).toEqual({ tiles: [], rows: 0, hidden: 0 });
  });

  it("calls each tile by its shape: hero (half the card or more), tall, wide, mini", () => {
    const kinds = (n: number, rows: 2 | 3): BentoKind[] => bentoPlan(n, rows).tiles.map(bentoKind);
    expect(kinds(1, 3)).toEqual(["hero"]);
    expect(kinds(2, 3)).toEqual(["hero", "hero"]);
    expect(kinds(3, 3)).toEqual(["hero", "tall", "wide"]);
    expect(kinds(4, 3)).toEqual(["hero", "tall", "mini", "mini"]);
    expect(kinds(5, 3)).toEqual(["hero", "tall", "mini", "mini", "mini"]);
    expect(kinds(3, 2)).toEqual(["hero", "mini", "mini"]);
    expect(kinds(4, 2)).toEqual(["wide", "tall", "mini", "mini"]);
    expect(kinds(5, 2)).toEqual(["wide", "mini", "mini", "mini", "mini"]);
  });
});

describe("how many rows the card has room for", () => {
  it("is three rows where the card grows with the page, and three where each can be 140px tall", () => {
    expect(bentoRowsFit(5, null)).toBe(3);
    expect(bentoRowsFit(30, null)).toBe(3);
    expect(bentoRowsFit(5, 3 * 140 + 2 * 12)).toBe(3);
    expect(bentoRowsFit(5, 3 * 140 + 2 * 12 - 1)).toBe(2);
    expect(bentoRowsFit(2, 700)).toBe(3);
  });

  it("keeps room for the +N more line when more than five are waiting", () => {
    expect(bentoRowsFit(5, 3 * 140 + 2 * 12)).toBe(3);
    expect(bentoRowsFit(6, 3 * 140 + 2 * 12)).toBe(2);
    expect(bentoRowsFit(6, 3 * 140 + 2 * 12 + 52)).toBe(3);
  });
});

describe("the latest campaigns first", () => {
  it("orders by when each last moved, newest first, and keeps the order of rows without a date, after the dated ones", () => {
    const row = (id: string, updatedAt?: string) => ({ id, updatedAt });
    const out = latestFirst([row("a", "2026-10-01T10:00:00Z"), row("x"), row("b", "2026-10-20T08:00:00Z"), row("y", "not a date"), row("c", "2026-10-05T00:00:00Z")]);
    expect(out.map((r) => r.id)).toEqual(["b", "c", "a", "x", "y"]);
    expect(latestFirst([row("p"), row("q")]).map((r) => r.id)).toEqual(["p", "q"]);
    expect(latestFirst([])).toEqual([]);
  });

  it("is what the card is made from: no longer the ones waiting on a person first", () => {
    const code = readFileSync(join(__dirname, "..", "HomeCards.tsx"), "utf8");
    expect(code).toContain("latestFirst(visibleCampaigns(live, session)");
    expect(code).not.toContain("rankOf");
  });
});

/** Every plan, in both families, at the widths and heights a card may have. */
const SIZES = { colW: [70, 90, 110, 140], rowH: [140, 150, 170, 220, 260] };
const HAVES: TileHave[] = [
  FULL_HAVE,
  { empty: false, stages: 3, bar: true, need: 0, client: false, updated: true },
  { empty: false, stages: 2, bar: false, need: 18, client: true, updated: true },
  { empty: true, stages: 0, bar: false, need: 0, client: true, updated: false },
];
const eachTile = (fn: (t: BentoTile, kind: BentoKind, colW: number, rowH: number, have: TileHave, rows: 2 | 3, n: number) => void) => {
  for (const rows of ROWS) for (let n = 1; n <= 5; n++) for (const t of bentoPlan(n, rows).tiles)
    for (const colW of SIZES.colW) for (const rowH of SIZES.rowH) for (const have of HAVES) fn(t, bentoKind(t), colW, rowH, have, rows, n);
};
const contentRows = (s: TileShow) => [s.caption, s.bar, s.hires, s.need, s.client, s.updated].filter(Boolean).length + s.pipe;
const RANGE: Record<BentoKind, [number, number]> = { mini: [44, 60], wide: [56, 80], tall: [64, 120], hero: [88, 200] };

describe("what a tile has room to say", () => {
  it("never overflows: the rows and the ring always fit the tile, and the ring stays within its kind's range", () => {
    eachTile((t, kind, colW, rowH, have) => {
      const s = tileRows(t, colW, rowH, have);
      expect(s.used).toBeLessThanOrEqual(s.room);
      expect(s.ring).toBeGreaterThanOrEqual(RANGE[kind][0]);
      expect(s.ring).toBeLessThanOrEqual(RANGE[kind][1]);
      expect(s.pipe).toBeLessThanOrEqual(Math.min(6, have.stages));
    });
  });

  it("drops the least important rows first: a lower row never shows without the ones above it", () => {
    eachTile((t, kind, colW, rowH, have) => {
      if (have.empty || (kind !== "hero" && kind !== "tall")) return;
      const s = tileRows(t, colW, rowH, have);
      // The rows this campaign has, in the order of importance, each with whether the tile shows it.
      const order: [boolean, boolean][] = [
        [have.bar, s.bar], [have.stages >= 1, s.pipe >= 1], [have.stages >= 2, s.pipe >= 2], [have.bar, s.hires], [have.stages >= 3, s.pipe >= 3],
        [have.need > 0, s.need], [have.stages >= 4, s.pipe >= 4], [have.client, s.client], [have.stages >= 5, s.pipe >= 5], [have.stages >= 6, s.pipe >= 6], [have.updated && kind === "hero", s.updated],
      ];
      const shown = order.filter(([has]) => has).map(([, on]) => on);
      const firstMissing = shown.indexOf(false);
      if (firstMissing >= 0) expect(shown.slice(firstMissing).some(Boolean)).toBe(false);
    });
  });

  it("makes a big tile feel full: the whole card, a half and the hero always say at least three things, with a ring of at least 88px", () => {
    eachTile((t, kind, colW, rowH, have) => {
      if (kind !== "hero" || have.empty) return;
      const s = tileRows(t, colW, rowH, have);
      expect(contentRows(s)).toBeGreaterThanOrEqual(3);
      expect(s.ring).toBeGreaterThanOrEqual(88);
    });
  });

  it("gives a small tile a line and the slim bar, and a strip a bar, a line and its client, whenever a row is at least 140px", () => {
    eachTile((t, kind, colW, rowH, have) => {
      const s = tileRows(t, colW, rowH, have);
      if (kind === "mini") { expect(s.caption).toBe(true); expect(s.bar).toBe(have.bar); expect(s.pipe).toBe(0); }
      if (kind === "wide") { expect(s.caption).toBe(true); expect(s.bar).toBe(have.bar); expect(s.client).toBe(have.client); }
    });
  });

  it("shows everything, and a big ring, in a big tile; and drops the last rows in a short one", () => {
    const half = bentoPlan(2, 3).tiles[0]!;
    const big = tileRows(half, 90, 150, FULL_HAVE);
    expect(big).toMatchObject({ caption: false, bar: true, pipe: 6, hires: true, need: true, client: true, updated: true });
    expect(big.ring).toBe(178);
    const hero = bentoPlan(5, 3).tiles[0]!;
    const short = tileRows(hero, 70, 140, FULL_HAVE);
    expect(short).toMatchObject({ bar: true, hires: true, need: true, client: false, updated: false });
    expect(short.pipe).toBeGreaterThanOrEqual(2);
    expect(short.pipe).toBeLessThan(6);
    // The whole card puts the ring beside the rows; an empty campaign has one line and its client.
    const whole = bentoPlan(1, 3).tiles[0]!;
    expect(tileRows(whole, 90, 150, FULL_HAVE)).toMatchObject({ beside: true, ring: 200, pipe: 6, updated: true });
    expect(tileRows(hero, 90, 150, HAVES[3]!)).toMatchObject({ caption: true, bar: false, pipe: 0, client: true });
  });

  it("spends the height a big tile has to spare: the rows grow taller with thicker bars, so the words fill 70% or more of the tile", () => {
    // About 500 by 380 for the whole card and 250 by 380 for a half, in the two-row family; a column is (width - 5 gaps) / 6.
    const full = bentoPlan(1, 2).tiles[0]!;
    const half = bentoPlan(2, 2).tiles[0]!;
    const inner = (t: BentoTile, rowH: number) => t.r * rowH + (t.r - 1) * 12 - 28;
    const a = tileRows(full, (500 - 60) / 6, 184, FULL_HAVE);
    expect(a.ring).toBe(200);
    expect(a.extra).toBeGreaterThan(0);
    expect(a.barPx).toBeGreaterThan(4);
    expect(a.filled).toBeGreaterThanOrEqual(0.7 * inner(full, 184));
    expect(a.used).toBeLessThanOrEqual(a.room);
    const b = tileRows(half, (250 - 24) / 3 + 0, 184, FULL_HAVE);
    expect(b.filled).toBeGreaterThanOrEqual(0.7 * inner(half, 184));
    expect(b.filled).toBeLessThanOrEqual(inner(half, 184));
    // Whatever the height, a big tile never claims more than it has and a short one adds nothing.
    eachTile((t, kind, colW, rowH, have) => {
      if (kind !== "hero" && kind !== "tall") return;
      const s = tileRows(t, colW, rowH, have);
      expect(s.filled).toBeLessThanOrEqual(t.r * rowH + (t.r - 1) * 12 - 28);
      expect(s.extra).toBeLessThanOrEqual(18);
      if (s.pipe === 0) expect(s.extra).toBe(0);
    });
    const tight = tileRows(bentoPlan(5, 3).tiles[0]!, 70, 140, FULL_HAVE);
    expect(tight.extra).toBe(0);
    expect(tight.barPx).toBe(4);
  });

  it("grows the ring with the room it has, within its kind, and tileRing is the ring of a tile with everything to say", () => {
    const mini = bentoPlan(5, 3).tiles[2]!;
    const hero = bentoPlan(5, 3).tiles[0]!;
    expect(tileRing(mini, 90, 140)).toBeLessThanOrEqual(46);
    expect(tileRing(mini, 90, 220)).toBeGreaterThan(46);
    expect(tileRing(mini, 90, 400)).toBe(60);
    expect(tileRing(hero, 90, 260)).toBeGreaterThan(tileRing(hero, 90, 140));
    expect(tileRing(hero, 90, 140)).toBeGreaterThanOrEqual(88);
  });
});

describe("how a tile says it", () => {
  const byId = (id: string): CampaignRow => CAMPAIGN_ROWS.find((r) => r.id === id)!;
  const PLAN5 = bentoPlan(5, 3).tiles;
  const html = (r: CampaignRow, tile: BentoTile, i = 0, rowH = 150, colW = 90, show?: TileShow) =>
    renderToStaticMarkup(<CampaignItem r={r} i={i} tile={tile} show={show ?? tileRows(tile, colW, rowH, haveOf(factsOf(r)))} onOpen={() => {}} />);
  const names = (out: string) => [...out.matchAll(/class="sd-name" data-hue="(\w+)">([^<]*)</g)].map((m) => `${m[1]}:${m[2]}`);

  it("places the tile on its grid lines, by kind, and marks the first (latest) one as the highlighted tile", () => {
    const first = html(byId("backend-snr"), PLAN5[0]!, 0);
    expect(first).toContain("grid-column:3 / span 4");
    expect(first).toContain("grid-row:2 / span 2");
    expect(first).toMatch(/<li class="is-hero is-first"/);
    expect(html(byId("backend-snr"), PLAN5[2]!, 1)).toMatch(/<li class="is-mini"/);
    expect(html(byId("backend-snr"), PLAN5[1]!, 2)).toMatch(/<li class="is-tall"/);
    expect(html(byId("backend-snr"), bentoPlan(1, 3).tiles[0]!, 0)).toMatch(/<li class="is-hero is-full is-first"/);
    expect(html(byId("backend-snr"), bentoPlan(2, 3).tiles[1]!, 1)).toMatch(/<li class="is-hero is-half"/);
    expect(html(byId("backend-snr"), bentoPlan(3, 3).tiles[2]!, 2)).toMatch(/<li class="is-wide"/);
  });

  it("gives the one campaign the whole card: a progress row per stage in its colour (the fixtures have no funnel numbers), a bar as long as its share, the hires in words and a bar, what waits on a person, when it moved", () => {
    const out = html(byId("backend-snr"), bentoPlan(1, 3).tiles[0]!);
    expect(out).toContain('class="hm-cl-pp"');
    // Shortlisted, in outreach and interviewing, in pipeline order; the hired are the hires bar's, not a fourth row.
    expect(names(out)).toEqual(["violet:Shortlisted", "blue:In outreach", "amber:Interviewing"]);
    expect(out).toMatch(/<b>13<\/b>/);
    expect(out).toMatch(/<b>29<\/b>/);
    // The fullest stage's bar is the whole track; the others are shorter.
    expect(out).toMatch(/--m:var\(--stage-blue\);--w:1;/);
    expect(out).toMatch(/--m:var\(--stage-violet\);--w:0\.4/);
    expect(out).toContain("<small>1 of 3 hired</small>");
    expect(out).toMatch(/--m:var\(--stage-green\);--w:0\.33/);
    expect(out).toContain('class="hm-cl-need"');
    expect(out).toContain("Updated 12m ago");
    // The caption the rows replace is not said again, and the bars are for the eyes only.
    expect(out).not.toContain("29 in outreach");
    expect(out.match(/<i class="hm-cl-bar" aria-hidden="true"/g)?.length).toBe(4);
    expect(out).toMatch(/aria-label="Senior Backend Engineers, 1 of 3 hired, 47 people:/);
  });

  it("gives each of two campaigns half the card, with the pipeline in the middle and the hires at the foot", () => {
    const half = bentoPlan(2, 3).tiles[1]!;
    const out = html(byId("platform-sre"), half, 1);
    expect(out).toMatch(/<li class="is-hero is-half"/);
    expect(names(out).map((x) => x.split(":")[1])).toEqual(["Shortlisted", "In outreach", "Interviewing"]);
    expect(out.indexOf("hm-cl-pp")).toBeLessThan(out.indexOf("hm-cl-h"));
    expect(out).toContain("<small>0 of 2 hired</small>");
  });

  it("shows only the stages that fit, the ones with the most people, in their order", () => {
    const hero = PLAN5[0]!;
    const show = { ...tileRows(hero, 90, 150, haveOf(factsOf(byId("backend-snr")))), pipe: 2 };
    expect(names(html(byId("backend-snr"), hero, 0, 150, 90, show))).toEqual(["violet:Shortlisted", "blue:In outreach"]);
    expect(names(html(byId("backend-snr"), hero, 0, 150, 90, { ...show, pipe: 0 }))).toEqual([]);
  });

  it("shows what waits on a person in a small tile, in the brand's text colour, instead of the people line, and a slim bar", () => {
    const out = html(byId("design-lead"), PLAN5[2]!, 1);
    expect(out).toContain('<span class="hm-cl-need" title="2 interviews to schedule">2 interviews to schedule</span>');
    expect(out).not.toContain("hm-cl-pp");
    expect(out).not.toMatch(/<span>[^<]*(shortlisted|in outreach)/);
    expect(out).toContain("Design Lead");
    expect(out.match(/<i class="hm-cl-bar"/g)?.length).toBe(1);
    expect(out).toMatch(/--m:var\(--stage-green\);--w:0;/);
  });

  it("says where the people are, once, in a small tile when nothing waits on a person", () => {
    const out = html(byId("platform-sre"), PLAN5[2]!, 1);
    expect(out).toContain("<span>18 in outreach</span>");
    expect(out).not.toContain("hm-cl-need");
    expect(out).not.toContain("hm-cl-c");
  });

  it("gives a strip the ring beside its name, its client and its hires, and the tall tile the pipeline", () => {
    const row: CampaignRow = { ...byId("platform-sre"), client: "Acme Cloud", hires: { count: 1, target: 3 } };
    const strip = html(row, bentoPlan(3, 3).tiles[2]!, 2);
    expect(strip).toContain('<small class="hm-cl-c">Acme Cloud</small>');
    expect(strip).toContain("<span>1 of 3 hired</span>");
    expect(strip).not.toContain("hm-cl-pp");
    const tall = html(row, PLAN5[1]!, 1, 190);
    expect(tall).toContain('<small class="hm-cl-c">Acme Cloud</small>');
    expect(tall).toContain("hm-cl-pp");
    expect(tall).toContain("<small>1 of 3 hired</small>");
  });

  it("says Filled once when every place is filled, with the bar full and the hired not a row of their own", () => {
    const row: CampaignRow = { ...byId("platform-sre"), needs: undefined, hires: { count: 2, target: 2 } };
    const out = html(row, PLAN5[1]!, 1, 190);
    expect(out.match(/<small>Filled · 2 hired<\/small>/g)?.length).toBe(1);
    expect(out).not.toContain("of 2 hired");
    expect(out).toMatch(/--m:var\(--stage-green\);--w:1;/);
  });

  it("keeps the dotted ring and one quiet line for a campaign nobody is in yet: no bars, no rows", () => {
    const row = byId("fin-controller");
    const whole = bentoPlan(1, 3).tiles[0]!;
    const out = html(row, whole, 0);
    expect(out).toContain("Needs requirements");
    expect(out).not.toContain("hm-cl-bar");
    expect(out).not.toContain("hm-cl-pp");
    expect(out).toContain("data-empty");
    expect(out).toContain("sd is-lg");
    // The one line is not said twice (the status that says it is the spec).
    expect(out.match(/>[^<]*requirements[^<]*</gi)?.length).toBe(1);
    // A small ring shows the 0.
    expect(html(row, PLAN5[2]!, 1)).toMatch(/<b class="sd-n is-zero"[^>]*>0<\/b>/);
  });
});

describe("the funnel on a big tile", () => {
  const base = CAMPAIGN_ROWS.find((r) => r.id === "platform-sre")!;
  const withFunnel = (reached: NonNullable<CampaignRow["reached"]>, over: Partial<CampaignRow> = {}): CampaignRow => ({ ...base, needs: undefined, reached, ...over });
  const REACHED = { found: 40, shortlisted: 12, outreach: 9, replied: 4, interviewing: 2, hired: 1 };
  const rowsOf = (r: CampaignRow) => { const f = factsOf(r); return progressRows(r, f.stages, f.empty, !!f.prog); };
  const html = (r: CampaignRow, tile: BentoTile, show?: TileShow) =>
    renderToStaticMarkup(<CampaignItem r={r} i={0} tile={tile} show={show ?? tileRows(tile, 90, 150, haveOf(factsOf(r)))} onOpen={() => {}} />);
  const labels = (out: string) => [...out.matchAll(/class="(?:sd-name" data-hue="(\w+)|hm-cl-pn)">([^<]*)</g)].map((m) => `${m[1] ?? "muted"}:${m[2]}`);

  it("is each step the people reached: Found in the quiet ink, the others in their kind's colour, the longest bar the most", () => {
    const { pipe, pipeMax } = rowsOf(withFunnel(REACHED, { hires: undefined, target: 0 }));
    expect(pipe.map((x) => `${x.name}:${x.count}:${x.hue}`)).toEqual([
      "Found:40:null", "Shortlisted:12:violet", "Contacted:9:blue", "Replied:4:blue", "Interviewing:2:amber", "Hired:1:green",
    ]);
    expect(pipeMax).toBe(40);
  });

  it("shows a step only once someone reached it, always keeps Found, and leaves the Hired to the hires bar when there is one", () => {
    const some = rowsOf(withFunnel({ found: 7, shortlisted: 3, outreach: 0, replied: 0, interviewing: 0, hired: 0 }, { hires: undefined, target: 0 }));
    expect(some.pipe.map((x) => x.name)).toEqual(["Found", "Shortlisted"]);
    expect(rowsOf(withFunnel({ ...REACHED, found: 0 })).pipe[0]).toMatchObject({ name: "Found", count: 0 });
    expect(rowsOf(withFunnel(REACHED, { hires: { count: 1, target: 3 } })).pipe.map((x) => x.name)).toEqual(["Found", "Shortlisted", "Contacted", "Replied", "Interviewing"]);
    // The bars are measured against the most, whichever step that is.
    expect(rowsOf(withFunnel({ found: 0, shortlisted: 9, outreach: 3, replied: 0, interviewing: 0, hired: 0 }, { hires: undefined, target: 0 })).pipeMax).toBe(9);
  });

  it("keeps the last step reached, then Found, then the rest in order, when the tile is short", () => {
    const r = withFunnel(REACHED, { hires: { count: 1, target: 3 } });
    const pick = (n: number) => {
      const hero = bentoPlan(5, 3).tiles[0]!;
      const out = html(r, hero, { ...tileRows(hero, 90, 150, haveOf(factsOf(r))), pipe: n });
      return labels(out).map((x) => x.split(":")[1]);
    };
    expect(pick(2)).toEqual(["Found", "Interviewing"]);
    expect(pick(3)).toEqual(["Found", "Shortlisted", "Interviewing"]);
    expect(pick(5)).toEqual(["Found", "Shortlisted", "Contacted", "Replied", "Interviewing"]);
  });

  it("gives a filled campaign's half at least four rows, with the Filled line once and no Hired row", () => {
    const filled = withFunnel(REACHED, { hires: { count: 1, target: 1 } });
    const half = bentoPlan(2, 3).tiles[0]!;
    const show = tileRows(half, 90, 150, haveOf(factsOf(filled)));
    expect(show.pipe).toBeGreaterThanOrEqual(4);
    const out = html(filled, half);
    expect(labels(out).length).toBeGreaterThanOrEqual(4);
    expect(labels(out)).toContain("muted:Found");
    expect(labels(out)).toContain("blue:Replied");
    expect(labels(out).join(" ")).not.toContain("Hired");
    expect(out.match(/<small>Filled · 1 hired<\/small>/g)?.length).toBe(1);
    expect(out).toMatch(/hm-cl-pn">Found<\/span><i class="hm-cl-bar" aria-hidden="true" style="--m:color-mix\(in srgb, var\(--ink\) 28%, transparent\);--w:1;/);
  });

  it("falls back to the stages with people in them when the server sent no funnel, and says nothing for an empty campaign", () => {
    const f = factsOf(base);
    expect(progressRows(base, f.stages, f.empty, !!f.prog).pipe.map((x) => x.name)).toEqual(["Shortlisted", "In outreach", "Interviewing"]);
    const none = CAMPAIGN_ROWS.find((r) => r.id === "fin-controller")!;
    expect(progressRows({ reached: REACHED }, factsOf(none).stages, true, false).pipe).toEqual([]);
  });
});

describe("the tile's stylesheet", () => {
  const css = readFileSync(join(__dirname, "..", "home.css"), "utf8");
  const block = css.slice(css.indexOf("active campaigns: a bento of tiles"), css.indexOf(".hm-cl-more { display: flex"));

  it("draws the bars on the stage track, the fills in the stage's own colour, growing in from the left and not at all for reduced motion", () => {
    expect(block).toMatch(/\.hm-cl-bar \{[^}]*background: var\(--stage-track\)/);
    expect(block).toMatch(/\.hm-cl-bar::after \{[^}]*background: var\(--m\);[^}]*animation: hm-cl-grow/);
    expect(block).toContain("@keyframes hm-cl-grow { from { transform: scaleX(0); } }");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.hm-card, \.hm-quad-c, \.hm-cl li, \.hm-cl-bar::after,/);
  });

  it("spreads a big tile's three groups over its height, and lets the rows grow with the room the tile gives them", () => {
    expect(block).toMatch(/\.hm-cl li\.is-hero \.hm-cl-t, \.hm-cl li\.is-tall \.hm-cl-t \{[^}]*align-self: stretch;[^}]*justify-content: space-between;/);
    expect(block).toMatch(/\.hm-cl-pp \{[^}]*grid-auto-rows: calc\(16px \+ var\(--x, 0px\)\)/);
    expect(block).toMatch(/\.hm-cl-bar \{[^}]*height: var\(--bh, 4px\)/);
  });

  it("puts the ring beside the words in a strip and in the whole card, and writes no dot, pill or edge bar", () => {
    expect(block).toMatch(/\.hm-cl li\.is-wide button, \.hm-cl li\.is-full button \{ flex-direction: row;/);
    expect(block).not.toMatch(/::before|border-left|border-radius: 999px/);
    expect(block).not.toMatch(/font: [0-9]/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiCampaign } from "../api/campaigns";
import { rowFromApi, shiftFunnel, stagesFromApi } from "../api/campaigns";
import { CAMPAIGN_ROWS } from "../campaignsData";
import type { CampaignStage } from "../campaignsData";
import { StageDonut } from "../StageDonut";
import { GAP_PX, LEAST_PX, PICKABLE_HUES, STAGE_HUES, arcsOf, defaultStages, filledLine, inKind, inProgressOf, isEmpty, peopleLine, rejectedOf, ringWidth, shortCount, stageHue, stageMuted, stageVar, stagesLine, stagesOf, startLine, totalOf, unitPx } from "../stageDonut";
import { parseColor } from "../theme/darkColors";

/**
 * Home's Active campaigns rows are a name and a ring: how a campaign's people are spread across its pipeline
 * stages, coloured per stage, the words in a card that opens on hover, focus or a tap. These cover what the ring
 * draws and says, the tolerant reading of `stages`, the default five when the server sent none, and the colours.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const st = (id: string, kind: CampaignStage["kind"], count: number, color: string | null = null, name = id): CampaignStage => ({ id, name, kind, color, count });
const FIVE = [st("s", "shortlisted", 3, null, "Shortlisted"), st("o", "outreach", 0, null, "In outreach"), st("i", "interviewing", 1, null, "Interviewing"), st("h", "hired", 1, null, "Hired"), st("p", "passed", 0, null, "Rejected")];

describe("the colour of a stage", () => {
  it("is the palette key it carries, else its kind's: violet, blue, amber, green, a soft rose for passed", () => {
    expect(stageHue({ kind: "outreach", color: "violet" })).toBe("violet");
    expect(stageHue({ kind: "interviewing", color: " Teal " })).toBe("teal");
    expect(stageHue({ kind: "shortlisted", color: null })).toBe("violet");
    expect(stageHue({ kind: "outreach", color: null })).toBe("blue");
    expect(stageHue({ kind: "interviewing", color: null })).toBe("amber");
    expect(stageHue({ kind: "hired", color: null })).toBe("green");
    expect(stageHue({ kind: "passed", color: null })).toBe("rose");
    expect(stageMuted({ kind: "passed" })).toBe(true);
    expect(stageMuted({ kind: "shortlisted" })).toBe(false);
  });

  it("falls back to the kind's colour for a key this build does not know, and keeps hired green whatever it is told", () => {
    expect(stageHue({ kind: "outreach", color: "chartreuse" })).toBe("blue");
    expect(stageHue({ kind: "outreach", color: "#ff0000" })).toBe("blue");
    expect(stageHue({ kind: "hired", color: "rose" })).toBe("green");
  });

  it("makes the first stage of a campaign always violet, and Hired green and Passed rose whatever they were given", () => {
    for (const color of [null, "teal", "amber", "slate", "rose"]) {
      expect(stageHue({ kind: "outreach", color }, 0), String(color)).toBe("violet");
      expect(stageHue({ kind: "interviewing", color }, 0)).toBe("violet");
    }
    expect(stageHue({ kind: "outreach", color: "teal" }, 1)).toBe("teal");
    expect(stageHue({ kind: "outreach", color: null }, 2)).toBe("blue");
    expect(stageHue({ kind: "passed", color: "teal" }, 5)).toBe("rose");
    expect(stageHue({ kind: "hired", color: "rose" }, 4)).toBe("green");
  });

  it("never draws grey: an old slate is blue, and slate is not on offer", () => {
    expect(stageHue({ kind: "outreach", color: "slate" }, 1)).toBe("blue");
    expect(stageHue({ kind: "shortlisted", color: "slate" })).toBe("blue");
    expect(PICKABLE_HUES).toEqual(["blue", "teal", "green", "amber", "orange", "rose", "violet"]);
    for (const kind of ["shortlisted", "outreach", "interviewing", "hired", "passed"] as const) expect(stageHue({ kind, color: null }, 3)).not.toBe("slate");
    expect(src("stageDonut.css")).not.toMatch(/\.sd-name\[data-muted\][^}]*ink-3/);
  });

  it("maps every palette key to its own --stage-<key> tokens, defined for light and for dark, with no colour written in the stylesheet", () => {
    const light = src("access.css");
    const dark = src("theme/theme.css");
    const css = src("stageDonut.css");
    expect(STAGE_HUES).toEqual(["slate", "blue", "teal", "green", "amber", "orange", "rose", "violet"]);
    for (const hue of STAGE_HUES) {
      expect(css).toContain(`.sd-arc[data-hue="${hue}"], .sd-name[data-hue="${hue}"] { --sd-mark: var(--stage-${hue}); --sd-text: var(--stage-${hue}-text); }`);
      for (const part of ["", "-text", "-soft", "-line"]) {
        expect(light, `light ${hue}${part}`).toMatch(new RegExp(`--stage-${hue}${part}:\\s*(#|rgba)`));
        expect(dark, `dark ${hue}${part}`).toMatch(new RegExp(`--stage-${hue}${part}:\\s*(#|rgba)`));
      }
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(css).toContain(".sd-track { stroke: var(--stage-track); }");
    expect(stageVar("blue")).toBe("var(--stage-blue)");
    expect(stageVar("rose", "text")).toBe("var(--stage-rose-text)");
  });

  it("keeps slate legible: the mark over 3:1 and the text over 4.5:1 on the card, in both themes", () => {
    const lum = (hex: string) => {
      const c = parseColor(hex)!;
      const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
    const get = (css: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)![1]!;
    const light = src("access.css");
    const dark = src("theme/theme.css");
    expect(ratio(get(light, "--stage-slate"), "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(ratio(get(dark, "--stage-slate"), "#171717")).toBeGreaterThanOrEqual(3);
    expect(ratio(get(light, "--stage-slate-text"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(get(dark, "--stage-slate-text"), "#171717")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the stages of a campaign", () => {
  it("are the server's when it sent them, in its order", () => {
    const stages = [st("a", "shortlisted", 2), st("b", "outreach", 5)];
    expect(stagesOf({ stages, funnel: CAMPAIGN_ROWS[0]!.funnel })).toBe(stages);
  });

  it("are the default five drawn from the headcounts when it sent none (fixtures, an older server)", () => {
    const f = { sourced: 214, shortlisted: 13, contacted: 33, replied: 10, interviews: 4, hired: 1 };
    expect(stagesOf({ funnel: f }).map((s) => [s.kind, s.count])).toEqual([["shortlisted", 13], ["outreach", 29], ["interviewing", 4], ["hired", 1], ["passed", 0]]);
    expect(stagesOf({ stages: [], funnel: f })).toEqual(defaultStages(f));
    // Every fixture campaign gets a ring, and the one with nobody in it gets the calm one.
    for (const r of CAMPAIGN_ROWS) expect(stagesOf(r)).toHaveLength(5);
    expect(totalOf(stagesOf(CAMPAIGN_ROWS.find((r) => r.id === "fin-controller")!))).toBe(0);
  });

  it("are read tolerantly from the API: a bad stage is dropped, a count is a whole number from zero, nothing usable is none", () => {
    expect(stagesFromApi(undefined)).toBeUndefined();
    expect(stagesFromApi("nope")).toBeUndefined();
    expect(stagesFromApi([])).toBeUndefined();
    expect(stagesFromApi([{ id: "x", name: "  ", kind: "hired", color: null, count: 1 }, null, 4, { id: "y", name: "Y", kind: "weird", count: 1 }])).toBeUndefined();
    expect(stagesFromApi([
      { id: "a", name: " Phone screen ", kind: "interviewing", color: "teal", count: 2.4 },
      { id: "b", name: "Hired", kind: "hired", color: "", count: -3 },
      { id: "c", name: "Offer", kind: "outreach", count: "7" },
    ])).toEqual([
      { id: "a", name: "Phone screen", kind: "interviewing", color: "teal", count: 2 },
      { id: "b", name: "Hired", kind: "hired", color: null, count: 0 },
      { id: "c", name: "Offer", kind: "outreach", color: null, count: 0 },
    ]);
  });

  const camp = (over: Partial<ApiCampaign> = {}): ApiCampaign => ({
    id: "c1", name: "Backend Engineer", status: "active", department: null, location: null, priority: "normal", visibility: "team",
    client: { id: "k1", name: "Zlice" }, owner: null, team: [], funnel: { shortlisted: 2, outreach: 3, interviewing: 1, hired: 1, passed: 4 },
    hired: 1, target: 2, agents: 0, openedAt: null, closedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
    summary: { found: 9, foundThisWeek: 1, sourcedPerDay: [], replied: 0, openTasks: 0 }, ...over,
  });

  it("reach the console's row with the client's name, and are left off a row whose server sent none", () => {
    const stages = [{ id: "a", name: "Shortlisted", kind: "shortlisted" as const, color: null, count: 2 }];
    const row = rowFromApi(camp({ stages }));
    expect(row.stages).toEqual(stages);
    expect(row.client).toBe("Zlice");
    const bare = rowFromApi(camp({ client: null }));
    expect("stages" in bare).toBe(false);
    expect("client" in bare).toBe(false);
  });

  it("move with a person: one out of the first stage of that kind with someone in it, one into the first of the other", () => {
    const stages = [
      { id: "a", name: "Shortlisted", kind: "shortlisted" as const, color: null, count: 2 },
      { id: "b", name: "Phone screen", kind: "interviewing" as const, color: null, count: 0 },
      { id: "c", name: "Onsite", kind: "interviewing" as const, color: null, count: 3 },
    ];
    const moved = shiftFunnel(camp({ stages }), "interviewing", "shortlisted");
    expect(moved.stages!.map((s) => s.count)).toEqual([3, 0, 2]);
    expect(shiftFunnel(camp(), "interviewing", "shortlisted").stages).toBeUndefined();
  });
});

describe("the ring", () => {
  it("makes one arc per stage that has someone in it, in order, gaps between neighbours, the whole ring for one", () => {
    for (const size of [40, 104]) {
      const gap = GAP_PX / unitPx(size);
      const arcs = arcsOf(FIVE, size);
      expect(arcs.map((a) => a.id)).toEqual(["s", "i", "h"]);
      expect(arcs.map((a) => a.hue)).toEqual(["violet", "amber", "green"]);
      // 3 of 5, 1 of 5, 1 of 5: shares of 60, 20, 20 less a gap, each starting half a gap in.
      expect(arcs[0]!.start).toBeCloseTo(gap / 2);
      expect(arcs[0]!.len).toBeCloseTo(60 - gap);
      expect(arcs[1]!.start).toBeCloseTo(60 + gap / 2);
      expect(arcs[2]!.start).toBeCloseTo(80 + gap / 2);
      for (const a of arcs) expect(a.start + a.len).toBeLessThanOrEqual(100);
    }
    expect(arcsOf([st("h", "hired", 4)], 104)).toEqual([{ id: "h", start: 0, len: 100, hue: "green", muted: false }]);
    expect(arcsOf([st("s", "shortlisted", 0)])).toEqual([]);
  });

  it("keeps the gap and the ring's thickness the same in pixels on a small ring and a large one, and the large one slim", () => {
    // A path unit is a hundredth of the ring: bigger on a bigger ring, so the same gap is fewer of them.
    expect(unitPx(104) / unitPx(40)).toBeCloseTo(104 / 40);
    expect(GAP_PX / unitPx(104)).toBeLessThan(GAP_PX / unitPx(40));
    expect(ringWidth(104) * (104 / 40)).toBeCloseTo(104 * 0.085);
    expect(ringWidth(104) * (104 / 40)).toBeLessThan(10);
    expect(ringWidth(20) * (20 / 40)).toBeCloseTo(4);
  });

  it("shows a small share at least a sliver, and leaves the rejected out of the ring and its total", () => {
    const five = [st("s", "shortlisted", 500), st("h", "hired", 1), st("p", "passed", 40)];
    const arcs = arcsOf(five, 104);
    expect(arcs).toHaveLength(2);
    expect(arcs[1]!.len).toBeGreaterThanOrEqual(LEAST_PX / unitPx(104) - 1e-9);
    expect(totalOf(five)).toBe(501);
    expect(rejectedOf(five)).toBe(40);
    // Everyone rejected: no ring to draw, nobody on the board.
    expect(arcsOf([st("s", "shortlisted", 0), st("p", "passed", 5)], 104)).toEqual([]);
    expect(isEmpty([st("s", "shortlisted", 0), st("p", "passed", 5)])).toBe(true);
  });

  it("counts the board apart from the rejected: in progress, a kind, and a filled campaign", () => {
    const board = [st("s", "shortlisted", 1), st("t", "interviewing", 1), st("t2", "interviewing", 2), st("h", "hired", 2), st("p", "passed", 5)];
    expect([totalOf(board), inProgressOf(board), inKind(board, "interviewing"), rejectedOf(board)]).toEqual([6, 4, 3, 5]);
    expect(stagesLine(board)).toBe("6 people: 1 s, 1 t, 2 t2, 2 h; 5 rejected");
    expect(stagesLine([st("s", "shortlisted", 0), st("p", "passed", 2)])).toBe("No one on the board; 2 rejected");
    expect(filledLine({ count: 2, target: 2 })).toBe("Filled · 2 hired");
    expect(filledLine({ count: 3, target: 2 })).toBe("Filled · 3 hired");
    expect(filledLine({ count: 1, target: 2 })).toBeNull();
    expect(filledLine({ count: 2, target: null })).toBeNull();
    expect(filledLine(undefined)).toBeNull();
  });

  it("is one picture with one sentence: the total, then each stage that has someone", () => {
    expect(stagesLine(FIVE)).toBe("5 people: 3 Shortlisted, 1 Interviewing, 1 Hired");
    expect(stagesLine([st("s", "shortlisted", 1, null, "Shortlisted")])).toBe("1 person: 1 Shortlisted");
    expect(stagesLine(defaultStages({ sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }))).toBe("No one yet");
  });

  it("says its total in a few characters", () => {
    expect([0, 7, 214, 999, 1000, 1234, 9949, 12000].map(shortCount)).toEqual(["0", "7", "214", "999", "1k", "1.2k", "9.9k", "12k"]);
  });

  it("renders as an image with that sentence, an arc per stage in its colour, and the total in the middle", () => {
    const html = renderToStaticMarkup(<StageDonut stages={FIVE} size={104} />);
    expect(html).toContain('class="sd is-lg"');
    expect(html).toContain("--sd:104px");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="5 people: 3 Shortlisted, 1 Interviewing, 1 Hired"');
    expect((html.match(/class="sd-arc"/g) ?? []).length).toBe(3);
    expect(html).toContain('data-hue="violet"');
    expect(html).toContain('data-hue="amber"');
    expect(html).toContain('data-hue="green"');
    expect(html).toContain('<b class="sd-n"');
    expect(html).toContain(">5</b>");
    expect(html).toContain('<svg viewBox="0 0 40 40" aria-hidden="true"');
  });

  it("is a dotted ring with the brand's spark in it when nobody is in the campaign yet, and a gentle 0 when it is small", () => {
    const html = renderToStaticMarkup(<StageDonut stages={defaultStages(CAMPAIGN_ROWS.find((r) => r.id === "fin-controller")!.funnel)} size={104} />);
    expect(html).toContain('aria-label="No one yet"');
    expect(html).toContain('data-empty=""');
    expect(html).toContain('class="sd-track"');
    expect(html).not.toContain("sd-arc");
    expect(html).toContain('<b class="sd-n is-zero"');
    expect(html).toContain("<svg");
    expect(html).not.toContain(">0</b>");
    const small = renderToStaticMarkup(<StageDonut stages={defaultStages(CAMPAIGN_ROWS.find((r) => r.id === "fin-controller")!.funnel)} size={40} />);
    expect(small).toContain(">0</b>");
    expect(src("stageDonut.css")).toContain(".sd-n.is-zero { color: var(--ink-3); }");
    expect(src("stageDonut.css")).toContain(".sd.is-lg[data-empty] .sd-track { stroke-dasharray: 0.1 2.4;");
  });

  it("says how far an empty pipeline has got: needs a role spec, N found but none shortlisted, finding people, ready to start", () => {
    const none = { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 };
    expect(startLine({ needs: "Role spec not approved", agents: [], funnel: none })).toBe("Needs a role spec");
    expect(startLine({ needs: "Brief not finished", agents: ["Agent"], funnel: { ...none, sourced: 5 } })).toBe("Needs a role spec");
    // An approved spec with people found: say how many, whether or not a search is still running.
    expect(startLine({ needs: undefined, agents: [], funnel: { ...none, sourced: 30 } })).toBe("30 found, none shortlisted");
    expect(startLine({ needs: "2 open tasks", agents: ["Agent"], funnel: { ...none, sourced: 30 } })).toBe("30 found, none shortlisted");
    expect(startLine({ needs: undefined, agents: ["Sourcing"], funnel: none })).toBe("Finding people");
    expect(startLine({ needs: "2 open tasks", agents: ["Agent"], funnel: none })).toBe("Finding people");
    expect(startLine({ needs: undefined, agents: [], funnel: none })).toBe("Ready to start");
    expect(isEmpty(defaultStages(CAMPAIGN_ROWS.find((r) => r.id === "fin-controller")!.funnel))).toBe(true);
    expect(isEmpty(FIVE)).toBe(false);
    // The passed stage reads as Rejected, everywhere the ring says it.
    expect(defaultStages(CAMPAIGN_ROWS[0]!.funnel).at(-1)!.name).toBe("Rejected");
  });

  it("always says where the people are under a ring that has some: a number never stands alone", () => {
    expect(peopleLine([st("s", "shortlisted", 1, null, "Shortlisted"), st("p", "passed", 0)])).toBe("1 shortlisted");
    expect(peopleLine([st("s", "shortlisted", 0), st("o", "outreach", 4, null, "In outreach")])).toBe("4 in outreach");
    expect(peopleLine([st("s", "shortlisted", 3), st("i", "interviewing", 1)])).toBe("3 shortlisted");
    // Of equal stages, the one furthest along speaks.
    expect(peopleLine([st("s", "shortlisted", 2), st("o", "outreach", 2)])).toBe("2 in outreach");
    expect(peopleLine([st("h", "hired", 1)])).toBe("1 hired");
    // The rejected are not on the board, so they are not what the line says; nobody on it, no line.
    expect(peopleLine([st("s", "shortlisted", 0), st("p", "passed", 5, null, "Rejected")])).toBeNull();
    expect(peopleLine([])).toBeNull();
    for (const stages of [FIVE, defaultStages({ sourced: 9, shortlisted: 1, contacted: 0, replied: 0, interviews: 0, hired: 0 })])
      if (!isEmpty(stages)) expect(peopleLine(stages)).toMatch(/^\d+ \S/);
  });
});

describe("the stylesheet and the row", () => {
  const css = src("stageDonut.css");
  const code = src("HomeCards.tsx");

  it("draws the arcs in gently and not at all for someone who asked for less motion", () => {
    expect(css).toMatch(/\.sd-arc \{[^}]*animation: sd-grow 760ms var\(--ease-out\) backwards/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.sd-arc, \.sd-n, \.sd-pop \{ animation: none; \}/);
  });

  it("uses the console's type tokens and its popover shadow, and writes no colour of its own", () => {
    expect(css).toContain("font: var(--type-caption)");
    expect(css).toContain("font: var(--type-body-sm)");
    expect(css).toContain("box-shadow: var(--shadow-pop)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/rgba?\(/);
  });

  it("makes each tile a ring in the top left with the name under it: no bar, no status line, no dots", () => {
    const row = code.slice(code.indexOf("function CampaignItem"), code.indexOf("export function CampaignsList"));
    expect(row).toContain("<StageDonut");
    expect(row).toContain("size={show.ring}");
    expect(row.indexOf("<StageDonut")).toBeLessThan(row.indexOf("<strong>{r.name}</strong>"));
    expect(code).toContain("const caption = empty ? startLine(r) : filled ?? peopleLine(stages);");
    expect(code).toContain("filledLine(");
    // An empty ring opens no card: its caption says it.
    expect(row).toContain("if (on && !empty)");
    expect(row).toContain("if (!empty && e.currentTarget.matches");
    expect(row).not.toMatch(/ of \{r\.target\} hired|hm-cl-go|Active now/);
    expect(code).not.toMatch(/Ready for an owner|Brief almost done|new replies/);
    // The client, if there is one, is the card's heading.
    expect(row).toContain("heading={client ?? undefined}");
  });

  it("is a tile on a soft gradient, the name clamped to two lines, a faint lift on the ring and a soft shadow", () => {
    const home = src("home.css");
    expect(home).toMatch(/\.hm-cl button \{[^}]*flex-direction: column; align-items: flex-start; justify-content: space-between;/);
    expect(home).toMatch(/\.hm-cl button \{[^}]*border-radius: 18px; background: linear-gradient\(180deg, #fff 0, #f1ebe6 100%\);[^}]*text-align: left;/);
    expect(home).toContain("-webkit-line-clamp: 2");
    expect(home).toMatch(/\.hm-cl button:hover, \.hm-cl button:focus-visible \{[^}]*box-shadow:/);
    expect(home).toContain(".hm-cl button:hover .hm-cl-d, .hm-cl button:focus-visible .hm-cl-d { transform: translateY(-2px); }");
    // Under reduced motion the ring stays where it is.
    expect(home).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.hm-cl button:hover \.hm-cl-d, \.hm-cl button:focus-visible \.hm-cl-d \{ transform: none; \}/);
  });

  it("opens the card on a resting mouse, on keyboard focus, and on the first tap of the ring on a touch screen", () => {
    const row = code.slice(code.indexOf("function CampaignItem"), code.indexOf("export function CampaignsList"));
    expect(row).toContain('onPointerEnter={(e) => { if (e.pointerType !== "touch") rest(true); }}');
    expect(row).toContain('matches(":focus-visible")');
    expect(row).toContain('pointer.current !== "touch" || open');
    expect(row).toContain("e.stopPropagation()");
    expect(row).toMatch(/e\.key === "Escape"/);
  });
});

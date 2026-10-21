import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PICKABLE_HUES, STAGE_HUES, stageVar } from "../stageDonut";
import type { StageHue } from "../stageDonut";

/**
 * The stage palette (--stage-<key>, access.css for light, theme/theme.css for dark), measured from the stylesheets
 * themselves: each key's mark is 3:1 or more on the card, its text 4.5:1 or more on every surface a stage word lands on
 * and on its own soft wash, the stages that sit side by side in a donut can be told apart (with normal sight and with
 * red-green colour blindness), the marks are calm (low chroma, lighter in dark), and nothing that draws a stage writes
 * a colour of its own. One palette, two themes, no hex anywhere else.
 */

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

type RGBA = [number, number, number, number];
const parse = (v: string): RGBA => {
  const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (hex) { const n = parseInt(hex[1]!, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
  const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/i.exec(v.trim());
  if (!m) throw new Error(`not a colour: ${v}`);
  return [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]];
};
/** `over` laid on `under`, as a colour. */
const lay = (over: RGBA, under: RGBA, alpha = 1): RGBA => {
  const a = over[3] * alpha;
  return [0, 1, 2].map((i) => over[i]! * a + under[i]! * (1 - a)).concat(1) as RGBA;
};
const toLin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGBA) => 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);
const ratio = (a: RGBA, b: RGBA) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

const oklabOf = (lin: number[]): [number, number, number] => {
  const l = Math.cbrt(0.4122214708 * lin[0]! + 0.5363325363 * lin[1]! + 0.0514459929 * lin[2]!);
  const m = Math.cbrt(0.2119034982 * lin[0]! + 0.6806995451 * lin[1]! + 0.1073969566 * lin[2]!);
  const s = Math.cbrt(0.0883024619 * lin[0]! + 0.2817188376 * lin[1]! + 0.6299787005 * lin[2]!);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
} as const;
const linOf = (c: RGBA, kind?: keyof typeof MACHADO): number[] => {
  const l = [toLin(c[0]), toLin(c[1]), toLin(c[2])];
  return kind ? MACHADO[kind].map((row) => Math.max(0, Math.min(1, row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!))) : l;
};
/** The distance between two colours in OKLab, times 100: how far apart they look, with or without a kind of colour blindness. */
const delta = (a: RGBA, b: RGBA, kind?: keyof typeof MACHADO): number => {
  const x = oklabOf(linOf(a, kind));
  const y = oklabOf(linOf(b, kind));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const lch = (c: RGBA): { L: number; C: number; h: number } => {
  const [L, a, b] = oklabOf(linOf(c));
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
};

/** The `--name: value;` declarations of the first block that follows `opener`. */
const tokens = (css: string, opener: string): Record<string, string> => {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`no ${opener}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("\n}", at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]!] = m[2]!.trim();
  return out;
};
const THEMES = {
  light: tokens(read("access.css"), ":root {"),
  dark: tokens(read("theme/theme.css"), 'html:root[data-theme="dark"] {'),
} as const;
/** The surfaces a stage word or mark lands on: the card, a hovered row, a chosen row, a plane inside a card, the page. */
const SURFACES = {
  light: ["#ffffff", "#fcfaf8", "#fff7f1", "#f3f2f0", "#f6ece1"].map(parse),
  dark: ["#171717", "#1f1f1f", "#262626", "#0f0f0f"].map(parse),
} as const;
const CARD = { light: parse("#ffffff"), dark: parse("#171717") } as const;

const PARTS = ["", "-text", "-soft", "-line"] as const;
const tok = (theme: "light" | "dark", hue: StageHue, part: (typeof PARTS)[number] = ""): RGBA => parse(THEMES[theme][`--stage-${hue}${part}`] ?? "");
const mark = (theme: "light" | "dark", hue: StageHue) => tok(theme, hue);
const soft = (theme: "light" | "dark", hue: StageHue, under: RGBA = CARD[theme]) => lay(tok(theme, hue, "-soft"), under);

/** The default order of a donut (shortlisted, outreach, interviewing, hired, passed), and back to the start. */
const DEFAULT_RING: readonly StageHue[] = ["violet", "blue", "amber", "green", "rose", "violet"];
/** The order the palette is offered in, a gentle run from violet round to rose. */
const RUN: readonly StageHue[] = ["violet", "blue", "teal", "green", "amber", "orange", "rose"];
const HUE_RANGE: Readonly<Record<StageHue, readonly [number, number]>> = {
  violet: [285, 315], blue: [235, 260], teal: [188, 210], green: [140, 160], amber: [75, 95], orange: [45, 65], rose: [0, 20], slate: [230, 280],
};

describe("the stage palette is defined for both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`gives every key a mark, a text, a soft wash and a line in ${theme}, and the ring a track`, () => {
      for (const hue of STAGE_HUES) for (const part of PARTS) expect(() => tok(theme, hue, part), `${theme} ${hue}${part}`).not.toThrow();
      expect(() => parse(THEMES[theme]["--stage-track"] ?? ""), `${theme} track`).not.toThrow();
    });
  }

  it("names the tokens in one place: stageVar", () => {
    for (const hue of STAGE_HUES) {
      expect(stageVar(hue)).toBe(`var(--stage-${hue})`);
      for (const part of ["text", "soft", "line"] as const) expect(stageVar(hue, part)).toBe(`var(--stage-${hue}-${part})`);
    }
  });

  it("is a different set in dark: lighter and a little softer than light, never the same colours", () => {
    for (const hue of STAGE_HUES) {
      expect(THEMES.dark[`--stage-${hue}`], hue).not.toBe(THEMES.light[`--stage-${hue}`]);
      expect(lch(mark("dark", hue)).L, `${hue} is lighter in dark`).toBeGreaterThan(lch(mark("light", hue)).L);
      expect(lch(mark("dark", hue)).C, `${hue} is not louder in dark`).toBeLessThanOrEqual(lch(mark("light", hue)).C + 0.005);
    }
  });
});

describe("the marks (arcs, bars, swatches)", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`are 3:1 or more on the ${theme} card`, () => {
      for (const hue of STAGE_HUES) expect(ratio(mark(theme, hue), CARD[theme]), `${theme} ${hue}`).toBeGreaterThanOrEqual(3);
    });

    it(`are calm in ${theme}: low chroma, in their own hue, none of them the brand orange`, () => {
      const ceiling = theme === "light" ? 0.125 : 0.105;
      for (const hue of PICKABLE_HUES) {
        const { C, h } = lch(mark(theme, hue));
        expect(C, `${theme} ${hue} chroma`).toBeLessThanOrEqual(ceiling);
        expect(C, `${theme} ${hue} is not grey`).toBeGreaterThanOrEqual(0.07);
        expect(h, `${theme} ${hue} hue`).toBeGreaterThanOrEqual(HUE_RANGE[hue][0]);
        expect(h, `${theme} ${hue} hue`).toBeLessThanOrEqual(HUE_RANGE[hue][1]);
        // The brand orange (#ea5a1e) is about 0.21 chroma: orange is for actions, the stages stay well under it.
        expect(C, `${theme} ${hue} vs the brand`).toBeLessThan(lch(parse("#ea5a1e")).C * 0.65);
      }
      expect(lch(mark(theme, "slate")).C, `${theme} slate is a neutral`).toBeLessThan(0.04);
    });

    it(`are told apart where stages sit side by side in ${theme}: the default ring, and any two of the palette`, () => {
      const normal = theme === "light" ? 12 : 10;
      for (let i = 0; i < DEFAULT_RING.length - 1; i++) {
        const [a, b] = [mark(theme, DEFAULT_RING[i]!), mark(theme, DEFAULT_RING[i + 1]!)];
        const pair = `${theme} ${DEFAULT_RING[i]} next to ${DEFAULT_RING[i + 1]}`;
        expect(delta(a, b), pair).toBeGreaterThanOrEqual(normal);
        expect(delta(a, b, "protan"), `${pair} (protan)`).toBeGreaterThanOrEqual(5.5);
        expect(delta(a, b, "deutan"), `${pair} (deutan)`).toBeGreaterThanOrEqual(5.5);
      }
      for (let i = 0; i < RUN.length - 1; i++) {
        expect(delta(mark(theme, RUN[i]!), mark(theme, RUN[i + 1]!)), `${theme} ${RUN[i]} next to ${RUN[i + 1]}`).toBeGreaterThanOrEqual(7);
      }
      for (const a of PICKABLE_HUES) for (const b of PICKABLE_HUES) {
        if (a < b) expect(delta(mark(theme, a), mark(theme, b)), `${theme} ${a} and ${b}`).toBeGreaterThanOrEqual(7);
      }
    });
  }

  it("keeps the passed arc, drawn quietly, over 3:1 on the card in both themes", () => {
    const css = read("stageDonut.css");
    const opacity = +/\.sd-arc\[data-muted\] \{ opacity: ([\d.]+); \}/.exec(css)![1]!;
    expect(opacity).toBeLessThan(1);
    for (const theme of ["light", "dark"] as const) {
      expect(ratio(lay(mark(theme, "rose"), CARD[theme], opacity), CARD[theme]), theme).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the ring's track a faint step off the card, under the arcs", () => {
    for (const theme of ["light", "dark"] as const) {
      const track = parse(THEMES[theme]["--stage-track"]!);
      expect(ratio(track, CARD[theme]), theme).toBeGreaterThan(1.05);
      expect(ratio(track, CARD[theme]), theme).toBeLessThan(1.6);
      for (const hue of STAGE_HUES) expect(ratio(mark(theme, hue), track), `${theme} ${hue} on the track`).toBeGreaterThanOrEqual(2.5);
    }
  });
});

describe("the text (a stage's name)", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`is 4.5:1 or more in ${theme} on every surface it lands on and on its own soft wash`, () => {
      for (const hue of STAGE_HUES) {
        const text = tok(theme, hue, "-text");
        for (const surface of SURFACES[theme]) {
          expect(ratio(text, surface), `${theme} ${hue} on ${surface.slice(0, 3)}`).toBeGreaterThanOrEqual(4.5);
          expect(ratio(text, soft(theme, hue, surface)), `${theme} ${hue} on its soft over ${surface.slice(0, 3)}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`has a soft wash and a line that stay quiet in ${theme}: the wash under 1.6:1 of the card, the line between the wash and the mark`, () => {
      for (const hue of STAGE_HUES) {
        const wash = soft(theme, hue);
        const line = lay(tok(theme, hue, "-line"), CARD[theme]);
        expect(ratio(wash, CARD[theme]), `${theme} ${hue} soft`).toBeLessThan(1.6);
        expect(ratio(line, CARD[theme]), `${theme} ${hue} line`).toBeGreaterThan(ratio(wash, CARD[theme]));
        expect(ratio(line, CARD[theme]), `${theme} ${hue} line`).toBeLessThan(ratio(mark(theme, hue), CARD[theme]));
      }
    });
  }

  it("is the colour of the status words that are also stages, in both themes", () => {
    const css = read("statusTones.css");
    expect(css).toContain("--st-outreach: var(--stage-blue-text);");
    expect(css).toContain("--st-replied: var(--stage-teal-text);");
    expect(css).toContain("--st-interviewing: var(--stage-amber-text);");
    expect(css).toContain("--st-hired: var(--stage-green-text);");
    expect(css).toContain("--st-passed: var(--stage-rose-text);");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe("everything that draws a stage reads the tokens", () => {
  const RAW = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
  /** Comments out, and a var()'s fallback (`var(--card, #fff)`) out, so what is left is what a rule says. */
  const bare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/var\((--[a-z0-9-]+),\s*[^)]*\)/gi, "var($1)");
  const rulesOf = (css: string, match: RegExp) => bare(css).split("\n").filter((l) => match.test(l));

  it("writes no colour of its own in the donut, the name colours or the status tones", () => {
    for (const f of ["stageDonut.css", "stageHues.css", "statusTones.css"]) expect(bare(read(f)), f).not.toMatch(RAW);
  });

  it("writes no colour of its own in a rule for a stage's column, strip segment or funnel bar", () => {
    const lines = rulesOf(read("boardStages.css"), /data-sc=|--stage/);
    expect(lines.length).toBeGreaterThanOrEqual(21);
    for (const l of lines) expect(l, l).not.toMatch(RAW);
    for (const hue of PICKABLE_HUES) {
      const css = read("boardStages.css");
      expect(css).toContain(`.cw-board .cw-col[data-sc="${hue}"] { --stage: var(--stage-${hue}); --stage-soft: var(--stage-${hue}-soft); --stage-mid: var(--stage-${hue}-line); --stage-ink: var(--stage-${hue}-text); }`);
      expect(css).toContain(`.pl-jseg[data-sc="${hue}"] { background: var(--stage-${hue}); }`);
      expect(css).toContain(`html .ov2-bar[data-sc="${hue}"] .ov2-bar-col i { background: var(--stage-${hue}); box-shadow: none; }`);
      expect(read("stageHues.css")).toContain(`html .sc[data-sc="${hue}"] { color: var(--stage-${hue}-text); }`);
    }
  });

  it("writes no colour of its own in the kind-coloured columns, funnel bar or strip of the workspace", () => {
    const lines = rulesOf(read("workspace.css"), /\.cw-col\.is-(shortlisted|outreach|interviewing|hired)\s*\{|\.ov2-bar-col i \{|\.pl-jseg|\.cw-stage\.is-/);
    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const l of lines) expect(l, l).not.toMatch(RAW);
  });

  it("writes no colour in the stage code: the hue names and the tokens' names, never a hex", () => {
    for (const f of ["stageDonut.ts", "boardStages.ts", "StagesDialog.tsx", "StageDonut.tsx"]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(/i);
    }
  });

  it("has the dark theme's own bars gone: no hex funnel or strip overrides are left in theme.css", () => {
    const dark = read("theme/theme.css");
    expect(dark).not.toMatch(/\.ov2-bar(\.is-\w+)? \.ov2-bar-col i|\.pl-jseg\.is-/);
  });
});

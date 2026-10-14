import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseColor } from "../theme/darkColors";

/**
 * The colour pairs that carry words, read from the stylesheets themselves (not copied here), against the 4.5:1
 * floor, in both themes. White on the brand orange (#ea5a1e) is 3.51:1: the primary button's fill is the
 * darkened --accent-fill, one token for every filled action, and these pins keep it, its hover, its resting
 * "can't press yet" state, the brand as text and the set-up's own ink above the floor.
 */

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const tokens = (css: string, opener: string): Record<string, string> => {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`no ${opener}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("\n}", at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]!] = m[2]!.trim();
  return out;
};

const lum = (hex: string): number => {
  const c = parseColor(hex);
  if (!c) throw new Error(`not a colour: ${hex}`);
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const light = tokens(read("access.css"), ":root {");
const dark = tokens(read("theme/theme.css"), 'html:root[data-theme="dark"] {');
const lean = tokens(read("setup/lean/lean.css"), ".lx {");
/** A token's value in a theme, following one `var(--x)` hop into the light set. */
const val = (theme: Record<string, string>, name: string): string => {
  const raw = theme[name] ?? light[name];
  if (!raw) throw new Error(`${name} is not defined`);
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  return m ? val(theme, m[1]!) : raw;
};

const FLOOR = 4.5;

describe("light theme", () => {
  const WHITE = "#ffffff";
  it("keeps white on the primary button's fill, and on its hover, at the floor", () => {
    expect(ratio(val(light, "--btn-ink"), val(light, "--btn-fill"))).toBeGreaterThanOrEqual(FLOOR);
    expect(ratio(val(light, "--btn-ink"), val(light, "--btn-fill-hover"))).toBeGreaterThanOrEqual(FLOOR);
  });

  it("is one orange button: the fill is the solved --accent-fill, and the bright accent is never the fill", () => {
    expect(light["--btn-fill"]).toBe("var(--accent-fill)");
    expect(ratio(WHITE, val(light, "--accent"))).toBeLessThan(FLOOR); // 3.51:1: why it is not a button
    expect(ratio(WHITE, val(light, "--btn-fill"))).toBeGreaterThanOrEqual(FLOOR);
  });

  it("keeps a button that cannot be pressed yet readable on its quiet fill", () => {
    expect(ratio(val(light, "--btn-off-ink"), val(light, "--btn-off-fill"))).toBeGreaterThanOrEqual(FLOOR);
  });

  it("keeps the brand as text, and the three greys, readable on the page and on a tint", () => {
    expect(ratio(val(light, "--accent-text"), WHITE)).toBeGreaterThanOrEqual(FLOOR);
    expect(ratio(val(light, "--accent-text"), val(light, "--accent-tint"))).toBeGreaterThanOrEqual(FLOOR);
    for (const t of ["--ink", "--ink-2", "--ink-3"]) expect(ratio(val(light, t), WHITE), t).toBeGreaterThanOrEqual(FLOOR);
  });
});

describe("dark theme", () => {
  const CARD = () => val(dark, "--card");
  it("keeps white on the primary button's fill, and its hover, at the floor", () => {
    expect(ratio(val(dark, "--btn-ink"), val(dark, "--btn-fill"))).toBeGreaterThanOrEqual(FLOOR);
    expect(ratio(val(dark, "--btn-ink"), val(dark, "--btn-fill-hover"))).toBeGreaterThanOrEqual(FLOOR);
  });

  it("makes a button that cannot be pressed a quiet grey that is still readable (never a rust brown)", () => {
    const off = val(dark, "--btn-off-fill");
    expect(ratio(val(dark, "--btn-off-ink"), off)).toBeGreaterThanOrEqual(FLOOR);
    const c = parseColor(off)!;
    expect(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)).toBeLessThan(6); // neutral
  });

  it("keeps the brand as text and the greys readable on the card", () => {
    expect(ratio(val(dark, "--accent-text"), CARD())).toBeGreaterThanOrEqual(FLOOR);
    for (const t of ["--ink", "--ink-2", "--ink-3"]) expect(ratio(val(dark, t), CARD()), t).toBeGreaterThanOrEqual(FLOOR);
  });
});

describe("the set-up and the sign-in (peach, light in both themes)", () => {
  // The darkest peach any text sits on, and the sky.
  const PEACH = "#f6cfbb";
  it("keeps the call to action, the links and the placeholders at the floor", () => {
    const css = read("setup/lean/lean.css");
    // The CTA wears the one button fill, flat: a gradient put its label at 3.72:1.
    expect(css).toMatch(/\.nx-cta \{[^}]*background: var\(--btn-fill\);[^}]*color: var\(--btn-ink\);/s);
    expect(ratio(val(light, "--btn-ink"), val(light, "--btn-fill"))).toBeGreaterThanOrEqual(FLOOR);
    for (const t of ["--lx-link", "--lx-mute", "--lx-alert", "--ink-3"]) {
      expect(ratio(val(lean, t), "#fff4ec"), `${t} on the sky`).toBeGreaterThanOrEqual(FLOOR);
      expect(ratio(val(lean, t), PEACH), `${t} on peach`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it("keeps the sign-in's button on the same fill, and its placeholder on the ink-2 grey", () => {
    const css = read("access.css");
    expect(css).toMatch(/\.btn-solid[^{]*\{[^}]*background: var\(--btn-fill\)/s);
    expect(css).toMatch(/\.field input::placeholder \{ color: var\(--ink-2\); \}/);
    expect(ratio(val(light, "--ink-2"), "#ffffff")).toBeGreaterThanOrEqual(FLOOR);
  });
});

describe("the muted greys of the console's text", () => {
  it("no longer spends the faint literals that were under the floor on text", () => {
    const faint = ["#8d847d", "#b9b1aa", "#a39890", "#9a918a", "#a39a93", "#968d86", "#d6ccc3", "#c9c1ba"];
    for (const f of ["workspace.css", "campaigns-page.css", "home.css", "contacts.css", "bars.css", "stages.css", "newcampaign.css", "addCandidates.css", "forms.css"]) {
      const css = read(f);
      for (const hex of faint) {
        const used = new RegExp(`(?<![-\\w])color:\\s*${hex}\\b`, "i").test(css);
        expect(used, `${f} has color: ${hex}`).toBe(false);
      }
    }
  });
});

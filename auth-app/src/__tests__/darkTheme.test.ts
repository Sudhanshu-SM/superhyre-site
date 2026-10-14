import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { CHOICES, readChoice, resolveTheme } from "../theme";
import { darkColor, darkValue, isStateName, parseColor, roleOf, toCss, toOklch } from "../theme/darkColors";
import type { Role } from "../theme/darkColors";
import { postcssDark } from "../theme/postcssDark";

/**
 * The dark theme is written out of the light stylesheets by rule (src/theme). These pin the rules that matter to
 * the people using it: nothing turns brown, text stays readable on what it sits on, a hovered or selected row is
 * lighter than the card, and the sidebar, buttons and washes keep their jobs.
 */

const CARD = "#171717";

const hexOf = (value: string): string => {
  const c = parseColor(value);
  if (!c) throw new Error(`not a colour: ${value}`);
  return toCss(c);
};
const lum = (hex: string): number => {
  const c = parseColor(hex)!;
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const dark = (role: Role, css: string, opts = {}): string => darkValue(role, css, opts);
const chroma = (hex: string): number => toOklch(parseColor(hex)!).C;

describe("surfaces", () => {
  it("makes the white card the dark card, and the grounds beside it deeper", () => {
    expect(dark("surface", "#ffffff")).toBe(CARD);
    // The page's own ground, and the near-white cream the sidebar and Shortlisted used.
    for (const ground of ["#f7f7f5", "#f6f5f4", "#fbfbfa"]) expect(lum(dark("surface", ground)), ground).toBeLessThan(lum(CARD));
  });

  it("never turns a warm cream or a peach wash into a brown: surfaces are neutral", () => {
    for (const warm of ["#fffcfa", "#fdfaf7", "#fbf8f5", "#fdeae2", "#fff7f1", "#f9ede7", "#f4efea", "#ece5de", "#fbe7d7"]) {
      expect(chroma(dark("surface", warm)), warm).toBeLessThan(0.01);
    }
  });

  it("puts each step darker in the light theme a step lighter here: a plane in a card, a hover, a press", () => {
    const steps = ["#ffffff", "#f3f2f0", "#edeae6", "#e2ded9"].map((c) => lum(dark("surface", c)));
    expect(steps[1]!).toBeGreaterThan(steps[0]!);
    expect(steps[2]!).toBeGreaterThan(steps[1]!);
    expect(steps[3]!).toBeGreaterThan(steps[2]!);
  });

  it("lifts a hovered or selected wash above the card, whatever tint it was", () => {
    for (const wash of ["#fcfbfa", "#fff7f1", "#f8f6f4", "#fdeae2"]) {
      const on = dark("surface", wash, { state: true });
      expect(lum(on), wash).toBeGreaterThan(lum(CARD));
      expect(chroma(on), wash).toBeLessThan(0.01);
    }
  });

  it("keeps a coloured category wash in its hue, quietly, and leaves a brand fill alone", () => {
    const green = dark("surface", "#ebf9e7");
    expect(chroma(green)).toBeGreaterThan(0.01);
    expect(lum(green)).toBeLessThan(0.05);
    expect(dark("surface", "#ea5a1e")).toBe("#ea5a1e");
    expect(dark("surface", "#cc4d17")).toBe("#cc4d17");
  });

  it("turns a faint pastel glow into a whisper of light, not a colour", () => {
    expect(dark("surface", "rgba(243, 161, 114, 0.11)")).toBe("rgba(255, 255, 255, 0.055)");
  });

  it("keeps a veil dark, and a dark fill that carries white text visible", () => {
    expect(dark("surface", "rgba(26, 22, 20, 0.3)", { veil: true })).toMatch(/^rgba\(0, 0, 0, 0\.5\d*\)$/);
    expect(lum(dark("surface", "#1f1a17", { lightText: true }))).toBeGreaterThan(lum("#1f1a17"));
    // The same dark with nothing written on it is a mark, and a mark is light on a dark page.
    expect(lum(dark("surface", "#312a23"))).toBeGreaterThan(lum(CARD));
  });
});

describe("text", () => {
  it("is light, in three steps that stay apart, and readable on the card", () => {
    const ink = dark("text", "#312a23");
    const ink2 = dark("text", "#5c524b");
    const ink3 = dark("text", "#776d66");
    expect(ratio(ink, CARD)).toBeGreaterThan(12);
    expect(ratio(ink2, CARD)).toBeGreaterThan(7);
    expect(ratio(ink3, CARD)).toBeGreaterThan(4.5);
    expect(lum(ink)).toBeGreaterThan(lum(ink2));
    expect(lum(ink2)).toBeGreaterThan(lum(ink3));
    for (const c of [ink, ink2, ink3]) expect(chroma(c)).toBeLessThan(0.02);
  });

  it("keeps the brand as text legible on dark, in its own hue", () => {
    const accent = dark("text", "#b24c20");
    expect(ratio(accent, CARD)).toBeGreaterThan(4.5);
    expect(chroma(accent)).toBeGreaterThan(0.08);
  });

  it("leaves white text white: it sits on a fill that stays a fill", () => {
    expect(dark("text", "#ffffff")).toBe("#ffffff");
  });

  it("does not let faint text fall below a readable grey", () => {
    expect(ratio(dark("text", "#c9c4bf"), CARD)).toBeGreaterThan(4.2);
  });
});

describe("lines and shadows", () => {
  it("keeps a hairline faint and an edge findable, as neutral greys", () => {
    const hair = dark("line", "#ece9e7");
    const edge = dark("line", "#e2ded9");
    expect(ratio(hair, CARD)).toBeGreaterThan(1.1);
    expect(ratio(hair, CARD)).toBeLessThan(1.6);
    expect(lum(edge)).toBeGreaterThan(lum(hair));
    expect(chroma(hair)).toBeLessThan(0.01);
  });

  it("keeps a control's own border near its 3:1 on the dark card", () => {
    expect(ratio(dark("line", "#9a9a9a"), CARD)).toBeGreaterThan(3);
  });

  it("makes a shadow black, and a light ring a line", () => {
    expect(dark("shadow", "0 1px 2px rgba(58, 35, 23, 0.14)")).toMatch(/rgba\(0, 0, 0, 0\.2\d*\)/);
    expect(dark("shadow", "0 0 0 1px #e6e1dc")).toMatch(/^0 0 0 1px #[0-9a-f]{6}$/);
    expect(lum(hexOf(dark("shadow", "0 0 0 1px #e6e1dc").replace("0 0 0 1px ", "")))).toBeLessThan(0.1);
  });
});

describe("what a property's colours are for", () => {
  it("reads the role from the property", () => {
    expect(roleOf("color")).toBe("text");
    expect(roleOf("background-color")).toBe("surface");
    expect(roleOf("border-bottom-color")).toBe("line");
    expect(roleOf("outline")).toBe("line");
    expect(roleOf("box-shadow")).toBe("shadow");
    expect(roleOf("width")).toBeNull();
    expect(roleOf("--ink")).toBeNull();
  });

  it("knows a hovered or selected rule from a resting one", () => {
    expect(isStateName(".sl-table tbody tr:hover")).toBe(true);
    expect(isStateName(".nav-row.is-active")).toBe(true);
    expect(isStateName('[aria-pressed="true"]')).toBe(true);
    expect(isStateName(".sl-table tbody tr")).toBe(false);
  });

  it("maps every colour in a gradient and leaves the rest of the value", () => {
    const out = darkValue("surface", "linear-gradient(180deg, #ffffff, #f7f7f5 420px)");
    expect(out).toMatch(/^linear-gradient\(180deg, #[0-9a-f]{6}, #[0-9a-f]{6} 420px\)$/);
    expect(out).not.toContain("#ffffff");
  });
});

describe("the stylesheet pass", () => {
  const run = async (css: string, from = "/src/x.css"): Promise<string> =>
    (await postcss([postcssDark()]).process(css, { from })).css;
  const SCOPE = ":where(:root[data-theme=\"dark\"])";

  it("writes a dark twin straight after a rule that spends a literal colour, at the same weight", async () => {
    const out = await run(".card { background: #ffffff; color: #312a23; padding: 8px }");
    expect(out).toContain(".card { background: #ffffff; color: #312a23; padding: 8px }");
    expect(out).toContain(`${SCOPE} .card`);
    expect(out).toMatch(/\.card \{[^}]*padding: 8px[^}]*\}\s*:where\(:root\[data-theme="dark"\]\) \.card \{[^}]*background: #171717/);
    // Only what is colour is repeated.
    expect(out.split(`${SCOPE} .card`)[1]).not.toContain("padding");
  });

  it("leaves a rule alone when its colour comes from a token, and carries media queries over", async () => {
    const out = await run(".a { color: var(--ink) } @media (min-width: 900px) { .b { border-color: #ece9e7 } }");
    expect(out).not.toContain(`${SCOPE} .a`);
    expect(out).toMatch(/@media \(min-width: 900px\) \{[\s\S]*\.b \{[\s\S]*\}[\s\S]*:where\(:root\[data-theme="dark"\]\) \.b/);
  });

  it("turns a rule over where a token that goes light carries white text", async () => {
    const out = await run(".chip.is-on { background: var(--ink); color: #fff }");
    expect(out).toMatch(/\.chip\.is-on \{[^}]*color: #111111/);
  });

  it("keeps a scrim dark, lifts a hover, and does not touch keyframes", async () => {
    const out = await run(".pal-scrim { background: rgba(26, 22, 20, 0.3) } .row:hover { background: #fcfbfa } @keyframes k { to { background: #ffffff } }");
    expect(out).toMatch(/pal-scrim \{[^}]*background: rgba\(0, 0, 0, 0\.\d+\)/);
    expect(out).toMatch(/\.row:hover \{[^}]*background: #[0-9a-f]{6}/);
    expect(out.match(/@keyframes k/g)).toHaveLength(1);
    expect(out).not.toContain(`${SCOPE} to`);
  });

  it("leaves the set-up as it is, and themes the candidate's form only inside the form builder", async () => {
    const out = await run(".x { background: #fff }", "/src/setup/lean/lean.css");
    expect(out).toBe(".x { background: #fff }");
    // The page itself, and the preview of it, stay light: the rule only reaches the builder's canvas.
    const form = await run(".ap-input { background: #fff }", "/src/apply.css");
    expect(form).toContain(`${SCOPE} :where(.fm-canvas-wrap:not(.is-preview)) .ap-input`);
    expect(form.startsWith(".ap-input { background: #fff }")).toBe(true);
    // Its own tokens are written by hand (theme.css), not guessed from their names.
    expect(await run(".fm, .ap { --fm-field-line: #ddd6cf }", "/src/apply.css")).toBe(".fm, .ap { --fm-field-line: #ddd6cf }");
  });

  it("keeps a coloured fill that carries white text coloured, and a plain dark one visible", async () => {
    const danger = await run(".btn.rl-danger { background: #b4442a; color: #fff }");
    expect(danger.split(SCOPE)[1] ?? "").not.toContain("background");
    const plain = await run(".tip { background: #1f1a17; color: #fff }");
    expect(plain.split(SCOPE)[1]).toContain("background");
  });

  it("scopes a root-level token rule to the root itself", async () => {
    const out = await run(":root { --hm-edge: #ece5de }");
    expect(out).toContain(':root[data-theme="dark"] {');
  });
});

describe("the choice", () => {
  it("is the device's unless the person chose", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("reads what was kept, and falls back to the device's when it is missing or odd", () => {
    expect(readChoice({ getItem: () => "dark" })).toBe("dark");
    expect(readChoice({ getItem: () => "sepia" })).toBe("system");
    expect(readChoice({ getItem: () => null })).toBe("system");
    expect(readChoice({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
    expect(readChoice(null)).toBe("system");
  });

  it("offers three, in plain words", () => {
    expect(CHOICES.map((c) => c.label)).toEqual(["System", "Light", "Dark"]);
  });
});

describe("the stage of every colour in the table is exercised by the same function the build uses", () => {
  it("returns a colour for every role without throwing on an odd one", () => {
    for (const role of ["text", "surface", "line", "shadow"] as const) {
      for (const c of ["#000", "#fff", "#fff0", "rgba(1,2,3,0)", "rgb(10 20 30 / 50%)"]) {
        const parsed = parseColor(c)!;
        expect(() => darkColor(parsed, role)).not.toThrow();
      }
    }
  });
});

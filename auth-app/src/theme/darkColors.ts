/**
 * Light colours, as they are written in the stylesheets, to their dark-theme counterparts.
 *
 * The console's stylesheets are written for a white page and spend most of their colour as literals (about two
 * thousand of them). Rather than a second copy of every rule, the build reads each light colour and writes
 * what it becomes in the dark theme (see postcssDark.ts), using the rules below. The rules are the whole
 * design of the dark theme beyond its tokens (theme.css):
 *
 *   - Neutral, always. A warm cream becomes a neutral grey, not a brown: orange is an accent, never a surface.
 *   - Surfaces climb as they rise: the page is the deepest, a card sits above it, a hovered row above that.
 *   - Text is inverted and kept in steps, so ink, secondary and tertiary stay three distinct greys.
 *   - Lines keep their weight: a hairline is faint, an edge is findable, a control's border stays 3:1.
 *   - Mid-tones (brand orange, status fills) are kept: they carry white text and are the accent.
 *
 * Pure, so the numbers can be pinned by tests.
 */

export type Rgba = { r: number; g: number; b: number; a: number };
export type Role = "text" | "surface" | "line" | "shadow";

/* ── parsing and writing ── */

const NAMED: Readonly<Record<string, string>> = { white: "#ffffff", black: "#000000", transparent: "rgba(0,0,0,0)" };

const clamp = (n: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, n));

export function parseColor(input: string): Rgba | null {
  const s = (NAMED[input.trim().toLowerCase()] ?? input).trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map((c) => parseInt(c + c, 16));
      return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: clamp(+m[1]!, 0, 255), g: clamp(+m[2]!, 0, 255), b: clamp(+m[3]!, 0, 255), a: clamp(alpha) };
  }
  return null;
}

const hex2 = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");

export function toCss(c: Rgba): string {
  if (c.a >= 0.999) return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(3)})`;
}

/* ── OKLCH ── */

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number): number => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export type Lch = { L: number; C: number; h: number };

export function toOklch(c: Rgba): Lch {
  const r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

export function fromOklch({ L, C, h }: Lch, a = 1): Rgba {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  };
}

/** A grey at an OKLab lightness, keeping the alpha. */
const grey = (L: number, a: number): Rgba => fromOklch({ L, C: 0, h: 0 }, a);

/** Piecewise-linear lookup in a table sorted by descending input. */
function ramp(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x >= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x >= x1) return y1 + ((x - x1) / (x0 - x1)) * (y0 - y1);
  }
  return table[table.length - 1]![1];
}

/* ── the rules ── */

/**
 * Light surface lightness -> dark surface lightness. White is a card (#171717), the near-white grounds are
 * the page behind it (#0f0f0f to #131313), and each step darker in the light theme (a plane inside a card, a
 * hovered row, a pressed one) is a step lighter here.
 */
const SURFACE: ReadonlyArray<readonly [number, number]> = [
  [1.0, 0.205], [0.992, 0.2], [0.982, 0.178], [0.972, 0.17], [0.962, 0.225], [0.95, 0.25],
  [0.93, 0.275], [0.9, 0.305], [0.85, 0.345], [0.8, 0.385],
];

/** Light line lightness -> dark line lightness: faint stays faint, an edge stays findable. */
const LINE: ReadonlyArray<readonly [number, number]> = [
  [1.0, 0.22], [0.96, 0.27], [0.93, 0.3], [0.89, 0.345], [0.85, 0.385], [0.8, 0.43],
];

/** The hue band of the brand's orange and the browns and creams around it. */
const warm = (h: number): boolean => h >= 15 && h <= 95;

export function darkText(c: Rgba): Rgba {
  const { L, C, h } = toOklch(c);
  // White-ish text sits on a fill (a button, a badge) that stays a fill: it stays white.
  if (L >= 0.8 || c.a === 0) return c;
  // Never dimmer than a tertiary grey: faint text on white is faint on black too, but it stays readable.
  const L2 = clamp(0.97 - (L - 0.25) * 0.8, 0.62, 0.96);
  const C2 = C > 0.08 ? C * 0.92 : C * 0.3;
  return fromOklch({ L: L2, C: C2, h }, c.a);
}

export function darkSurface(c: Rgba, opts: { lightText?: boolean; veil?: boolean; state?: boolean } = {}): Rgba {
  if (c.a === 0) return c;
  const { L, C, h } = toOklch(c);
  // A veil over the page (a scrim behind a dialog) stays a veil: darker, and a little more of it.
  if (opts.veil && L < 0.5) return { r: 0, g: 0, b: 0, a: clamp(c.a * 1.5 + 0.12, 0, 0.75) };
  // A translucent pastel glow (a wash of peach or lavender behind a page) is a whisper of light, not a colour.
  if (c.a < 0.35 && C >= 0.04 && L >= 0.55) return { r: 255, g: 255, b: 255, a: +(Math.min(c.a * 0.5, 0.06)).toFixed(3) };
  if (L >= 0.8) {
    // A tinted wash that is not the brand's own family keeps its hue, quietly.
    if (C >= 0.02 && !warm(h)) return fromOklch({ L: 0.27, C: Math.min(C * 0.6, 0.05), h }, c.a);
    // A hovered, selected or current row is a wash over the surface it sits on: one step lighter than that surface.
    if (opts.state && L >= 0.88) return grey(0.265, c.a);
    return grey(ramp(SURFACE, L), c.a);
  }
  if (L >= 0.55) return c;
  // A coloured fill that carries white text (a danger button, a status fill) is the accent family: it stays what it is.
  if (opts.lightText && C >= 0.06 && c.a >= 0.9) return c;
  // A dark ink-like fill. With white text on it, it is a button or a tip: lifted off the page so it can be seen.
  if (opts.lightText) return fromOklch({ L: Math.max(L, 0.32), C: Math.min(C, 0.02), h }, c.a);
  // A translucent dark wash (a hover, a veil) becomes a light one: a light overlay is how a dark theme shows hover.
  if (c.a < 0.6) return { r: 255, g: 255, b: 255, a: clamp(c.a * 1.5, 0, 0.2) };
  // A dark mark with no text on it (a bar, a track, a dot): the light mark it is on a dark page.
  return fromOklch({ L: 0.92 - L * 0.4, C: Math.min(C, 0.03), h }, c.a);
}

export function darkLine(c: Rgba): Rgba {
  if (c.a === 0) return c;
  const { L, C, h } = toOklch(c);
  if (L >= 0.8) return grey(ramp(LINE, L), c.a);
  if (L >= 0.45) {
    // A control's own edge (3:1 on white): a little quieter on a dark ground, never gone.
    if (C >= 0.08) return fromOklch({ L: Math.max(L, 0.55), C: C * 0.8, h }, c.a);
    return fromOklch({ L: 0.5 + (L - 0.45) * 0.55, C: C * 0.3, h }, c.a);
  }
  return fromOklch({ L: 0.9 - L * 0.5, C: C * 0.3, h }, c.a);
}

export function darkShadow(c: Rgba): Rgba {
  const { L } = toOklch(c);
  // A light "shadow" is a ring or a highlight: it is a line.
  if (L >= 0.6 && c.a >= 0.5) return darkLine(c);
  return { r: 0, g: 0, b: 0, a: clamp(c.a * 1.7 + 0.04, 0, 0.7) };
}

export function darkColor(c: Rgba, role: Role, opts: { lightText?: boolean; veil?: boolean; state?: boolean } = {}): Rgba {
  switch (role) {
    case "text": return darkText(c);
    case "surface": return darkSurface(c, opts);
    case "line": return darkLine(c);
    case "shadow": return darkShadow(c);
  }
}

/* ── properties and values ── */

/** What a declaration's colours are for; null when it has none the theme owns. */
export function roleOf(prop: string): Role | null {
  const p = prop.toLowerCase();
  if (p.startsWith("--")) return null;
  if (p === "color" || p === "caret-color" || p === "fill" || p === "stroke" || p === "-webkit-text-fill-color"
    || p === "text-decoration-color" || p === "column-rule-color") return "text";
  if (p === "background" || p === "background-color" || p === "background-image") return "surface";
  if (p === "box-shadow" || p === "text-shadow") return "shadow";
  if (p.startsWith("border") || p.startsWith("outline")) return "line";
  return null;
}

/** Whether a name or selector is about a state a surface is in (hovered, selected, current), not the surface itself. */
export const isStateName = (s: string): boolean =>
  /:hover|:focus|:active|\.is-(?:on|active|selected|current|open|hover|picked)|\[aria-(?:selected|current|pressed|expanded|checked)|--[a-z0-9-]*(?:hover|-on\b|selected|active|current)/i.test(s);

/** A custom property's role, guessed from its name: `--hm-edge` is a line, `--mint-ink` is text. */
export function roleOfCustom(name: string): Role {
  if (/(line|edge|border|rule|ring|stroke)/.test(name)) return "line";
  if (/(ink|text|tx|fg|label)/.test(name)) return "text";
  if (/(shadow)/.test(name)) return "shadow";
  return "surface";
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

/** Every colour literal in a value, replaced by what it becomes in the dark theme. */
export function darkValue(role: Role, value: string, opts: { lightText?: boolean; veil?: boolean; state?: boolean } = {}): string {
  return value.replace(COLOR, (lit) => {
    const c = parseColor(lit);
    return c ? toCss(darkColor(c, role, opts)) : lit;
  });
}

/** Whether a colour is the light text that sits on a dark fill. */
export function isLightText(value: string): boolean {
  const c = parseColor(value.replace(/\s*!important\s*$/i, ""));
  return !!c && c.a > 0.5 && toOklch(c).L >= 0.9;
}

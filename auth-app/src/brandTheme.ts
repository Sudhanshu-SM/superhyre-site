import type { BrandTheme } from "./api/onboarding";

/**
 * The console's half of the brand contract (the server's is packages/shared/src/brand.ts in
 * the platform repo; keep the two in step). Colour maths for the "Adjust" panel, and loading
 * the open fonts a theme names.
 */
export const OPEN_FONTS = [
  "Inter", "DM Sans", "Manrope", "Plus Jakarta Sans", "Work Sans", "IBM Plex Sans", "Outfit", "Sora",
  "Space Grotesk", "Poppins", "Montserrat", "Nunito Sans", "Source Serif 4", "Fraunces", "Lora",
  "Playfair Display", "Libre Baskerville", "Merriweather",
] as const;
const SERIF = new Set(["Source Serif 4", "Fraunces", "Lora", "Playfair Display", "Libre Baskerville", "Merriweather"]);
export const isSerif = (font: string) => SERIF.has(font);

export const DEFAULT_BRAND: BrandTheme = {
  logoUrl: null,
  primary: "#cc4d17",
  onPrimary: "#ffffff",
  palette: ["#cc4d17", "#312a23", "#f6ece1"],
  fontDisplay: "Fraunces",
  fontBody: "Inter",
  tone: "plain",
  source: "default",
  adjustedFrom: null,
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = (rgb: readonly number[]) =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour made safe for white text (WCAG AA), keeping its hue; light colours take dark text. */
export function readablePrimary(hex: string): { primary: string; onPrimary: string; adjustedFrom: string | null } {
  if (contrast(hex, "#ffffff") >= 4.5) return { primary: hex, onPrimary: "#ffffff", adjustedFrom: null };
  if (luminance(hex) > 0.6 && contrast(hex, "#1c1917") >= 4.5) return { primary: hex, onPrimary: "#1c1917", adjustedFrom: null };
  let rgb = rgbOf(hex);
  for (let i = 0; i < 40; i++) {
    rgb = [rgb[0] * 0.95, rgb[1] * 0.95, rgb[2] * 0.95];
    const next = hexOf(rgb);
    if (contrast(next, "#ffffff") >= 4.5) return { primary: next, onPrimary: "#ffffff", adjustedFrom: hex };
  }
  return { primary: "#312a23", onPrimary: "#ffffff", adjustedFrom: hex };
}

/** A theme with a new main colour, readable and saying so if it had to be darkened. */
export function withPrimary(theme: BrandTheme, hex: string): BrandTheme {
  const safe = readablePrimary(hex);
  return { ...theme, ...safe, source: "manual" };
}

const loaded = new Set<string>();
/** Loads open fonts from Google Fonts once each, so a preview can show the theme's type. */
export function loadFonts(...fonts: string[]): void {
  if (typeof document === "undefined") return;
  const wanted = fonts.filter((f) => f && !loaded.has(f) && (OPEN_FONTS as readonly string[]).includes(f));
  if (!wanted.length) return;
  for (const f of wanted) loaded.add(f);
  const families = wanted.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

/** CSS variables for anything drawn in a theme's look. */
export function themeVars(theme: BrandTheme): Record<string, string> {
  return {
    "--b-primary": theme.primary,
    "--b-on-primary": theme.onPrimary,
    "--b-display": `"${theme.fontDisplay}", ${isSerif(theme.fontDisplay) ? "Georgia, serif" : "system-ui, sans-serif"}`,
    "--b-body": `"${theme.fontBody}", ${isSerif(theme.fontBody) ? "Georgia, serif" : "system-ui, sans-serif"}`,
  };
}

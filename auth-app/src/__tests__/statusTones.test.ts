import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAGES } from "../campaign";
import { STATUS_TONE, STATUS_TONES, statusProps, toneOfLabel } from "../statusTones";
import type { StatusTone } from "../statusTones";

/** Every status word has a colour of its own, and every colour reads at 4.5:1 or better in both themes. */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const tones = read("statusTones.css");
const access = read("access.css");
const dark = read("theme/theme.css");

const luminance = (hex: string): number => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** `--name: value;` out of a block of CSS. */
const declared = (css: string, name: string): string | undefined => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
const lightBlock = /:root \{([^}]*)\}/.exec(tones)?.[1] ?? "";
const darkBlock = /html:root\[data-theme="dark"\] \{([^}]*)\}/.exec(tones)?.[1] ?? "";
const darkTokens = /html:root\[data-theme="dark"\] \{([^}]*)\}/.exec(dark)?.[1] ?? "";

/** The colour of a tone in a theme, following var() to the console's own token. */
function colourOf(tone: StatusTone, theme: "light" | "dark"): string {
  const own = (theme === "dark" ? declared(darkBlock, `--st-${tone}`) : undefined) ?? declared(lightBlock, `--st-${tone}`);
  const v = own ?? "";
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v)?.[1];
  const hex = ref ? (theme === "dark" ? declared(darkTokens, ref) : declared(access, ref)) : v;
  return (hex ?? "").split(/\s/)[0] ?? "";
}

/** The surfaces a status is drawn on: the table's card, a hovered row, a chosen row, a plane inside a card. */
const SURFACES = {
  light: ["#ffffff", "#fcfaf8", "#fff7f1", "#f3f2f0"],
  dark: ["#171717", "#1f1f1f", "#262626"],
} as const;

describe("the status vocabulary", () => {
  const WORDS = [
    "Not contacted", "Shortlisted", "In outreach", "Contacted", "Replied", "Interviewing", "Offer out", "Hired", "Passed",
    "Not interested", "Do not contact", "Found", "Saved",
  ];

  it("gives every status word a tone, including every stage the board has", () => {
    for (const w of [...WORDS, ...STAGES.map((s) => s.label)]) expect(STATUS_TONE[w], w).toBeDefined();
    for (const w of WORDS) expect(STATUS_TONES).toContain(STATUS_TONE[w]);
  });

  it("colours as the owner asked", () => {
    expect(toneOfLabel("Not contacted")).toBe("muted");
    expect(toneOfLabel("Found")).toBe("muted");
    expect(toneOfLabel("Saved")).toBe("muted");
    expect(toneOfLabel("Shortlisted")).toBe("ink");
    expect(toneOfLabel("In outreach")).toBe("outreach");
    expect(toneOfLabel("Replied")).toBe("replied");
    expect(toneOfLabel("Interviewing")).toBe("interviewing");
    expect(toneOfLabel("Hired")).toBe("hired");
    for (const w of ["Passed", "Not interested", "Do not contact"]) expect(toneOfLabel(w)).toBe("passed");
    // A word this build does not know is plain ink; a status with no word at all too.
    expect(toneOfLabel("Something new")).toBe("ink");
    expect(toneOfLabel(null)).toBe("ink");
  });

  it("gives an element its class and its tone", () => {
    expect(statusProps("Replied")).toEqual({ className: "st", "data-st": "replied" });
  });

  it("keeps different statuses apart: no two of the coloured tones share a colour", () => {
    for (const theme of ["light", "dark"] as const) {
      const coloured = (["outreach", "replied", "interviewing", "hired", "passed"] as const).map((t) => colourOf(t, theme).toLowerCase());
      expect(new Set(coloured).size, theme).toBe(coloured.length);
    }
  });
});

describe("contrast", () => {
  for (const tone of STATUS_TONES) {
    for (const theme of ["light", "dark"] as const) {
      it(`${tone} reads at 4.5:1 or better on the ${theme} surfaces`, () => {
        const colour = colourOf(tone, theme);
        expect(colour, `${tone} ${theme}`).toMatch(/^#[0-9a-f]{6}$/i);
        for (const surface of SURFACES[theme]) {
          expect(contrast(colour, surface), `${tone} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it("has a CSS rule for every tone, Hired heavier, and the dropdown's chevron at 60 percent", () => {
    for (const tone of STATUS_TONES) expect(tones).toContain(`html .st[data-st="${tone}"] { color: var(--st-${tone});`);
    expect(tones).toMatch(/html \.st\[data-st="hired"\] \{ color: var\(--st-hired\); font-weight: 600; \}/);
    expect(tones).toMatch(/html \.sl-status\.st svg \{ color: color-mix\(in srgb, currentColor 60%, transparent\); \}/);
    // Text only: nothing here draws a background, a dot or a pill.
    expect(tones).not.toMatch(/background|border|::before|::after/);
  });

  it("is used where a status is shown", () => {
    const ws = read("CampaignWorkspace.tsx");
    expect(ws).toContain('{...statusProps(statusOf(p))} className="sl-status st"');
    expect(ws).toContain("<span {...statusProps(s.label)}>{s.label}</span>");
    expect(read("ProfileSidebar.tsx")).toContain('{...statusProps("Not contacted")}');
    expect(read("Contacts.tsx")).toContain("{...statusProps(stageLabel(at))}");
  });
});

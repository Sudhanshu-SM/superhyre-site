import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A primary button that is working ("Saving") keeps its orange fill and its ring, in light and dark, with the
 * pointer over it too (the pointer is still on Save when it is pressed). It was turning pale grey under white
 * text (1.22:1) because four pages had their own `.is-primary:disabled:hover { background: var(--btn-off-fill) }`
 * that did not know about busy. The neutral "cannot be pressed yet" fill belongs to ui.css alone, one block that
 * says "not busy"; no page may paint the neutral fill on a primary button without that exclusion.
 */

const SRC = resolve(__dirname, "..");
const stylesheets = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : stylesheets(path);
    return name.endsWith(".css") ? [path] : [];
  });

type Rule = { selector: string; body: string };
/** The innermost rules of a stylesheet (media blocks unwrapped), comments removed. */
export function rulesOf(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
}

const KEEPS_BUSY = /\.is-busy|\[aria-busy|:has\(\s*>\s*\.ldr/;
/** Rules that paint the neutral fill on a primary button that is disabled, with no exclusion for one that is working. */
export function neutralOnBusy(css: string): string[] {
  return rulesOf(css)
    .filter((r) => /\.is-primary|\.is-main|\.cg-new|\.orc-new/.test(r.selector))
    .filter((r) => /:disabled/.test(r.selector))
    .filter((r) => /background(-color)?\s*:\s*var\(--btn-off-fill/.test(r.body))
    .filter((r) => r.selector.split(",").some((s) => /:disabled/.test(s) && !KEEPS_BUSY.test(s)))
    .map((r) => r.selector.replace(/\s+/g, " "));
}

describe("the neutral fill of a primary button that cannot be pressed", () => {
  it("is painted by ui.css's one block, never by a rule that would also catch a busy button", () => {
    const offenders = stylesheets(SRC).flatMap((file) =>
      neutralOnBusy(readFileSync(file, "utf8")).map((selector) => `${file.slice(SRC.length + 1)}: ${selector}`),
    );
    expect(offenders).toEqual([]);
  });

  it("would catch the rule that turned a hovered 'Saving' button grey", () => {
    const old = ".st .ncx-btn.is-primary:disabled:hover { background: var(--btn-off-fill); }";
    expect(neutralOnBusy(old)).toEqual([".st .ncx-btn.is-primary:disabled:hover"]);
    // ui.css's own block names busy, so it is not one of them.
    const fine =
      ':is(.ab.is-primary):disabled:not(.is-busy):not([aria-busy="true"]):not(:has(> .ldr)) { background: var(--btn-off-fill) !important; }';
    expect(neutralOnBusy(fine)).toEqual([]);
  });

  it("is declared in ui.css for every primary class the console uses, busy excluded", () => {
    const ui = readFileSync(join(SRC, "ui.css"), "utf8");
    const block = rulesOf(ui).find(
      (r) => /\.ncx-btn\.is-primary/.test(r.selector) && /background:\s*var\(--btn-off-fill\)/.test(r.body),
    );
    expect(block?.selector).toMatch(/:not\(\.is-busy\)/);
    expect(block?.selector).toMatch(/\[aria-busy="true"\]/);
    expect(block?.selector).toMatch(/:has\(> \.ldr\)/);
  });
});

describe("the sign-in's primary button", () => {
  const css = readFileSync(join(SRC, "access.css"), "utf8");

  it("keeps its fill at full strength while it works, and is neutral (not a faded orange) while it cannot be pressed", () => {
    const rules = rulesOf(css).filter((r) => /\.btn-solid:disabled/.test(r.selector));
    const working = rules.find((r) => /aria-busy="true"/.test(r.selector) && !/:not\(\[aria-busy/.test(r.selector));
    const idle = rules.find((r) => /:not\(\[aria-busy="true"\]\)/.test(r.selector));
    expect(working?.body).toMatch(/opacity:\s*1/);
    expect(idle?.body).toMatch(/opacity:\s*1/);
    expect(idle?.body).toMatch(/background:\s*var\(--btn-off-fill\)/);
    // The generic disabled rule that faded every button stays for the outline one (the Google button).
    expect(css).toMatch(/\.btn:disabled \{ cursor: not-allowed; opacity: 0\.55; \}/);
  });
});


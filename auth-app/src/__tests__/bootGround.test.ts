import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cold load, light, signed in before: html was white from the first byte, but the console's stylesheet paints
 * <body> sand (`body { background: var(--page) }`, the sign-in's ground) as soon as it arrives, so one frame of cream
 * (246,236,225) showed between the boot loader and the session check. The body has to share the html's ground.
 */

const read = (f: string) => readFileSync(resolve(__dirname, "..", "..", f), "utf8");

describe("the first paint never shows the sign-in's sand to someone who has signed in", () => {
  const html = read("index.html");
  const css = read("src/access.css");

  it("paints the body white too, in the page before any stylesheet, for a stored session", () => {
    expect(html).toContain('html[data-surface="app"] body { background: #ffffff; }');
    // It outranks the stylesheet's plain `body` rule by specificity, and the dark theme still comes later.
    expect(html.indexOf('html[data-surface="app"] body')).toBeLessThan(html.indexOf('html[data-theme="dark"] { background: #171717'));
  });

  it("says the same in the stylesheet, next to the .boot ground it pairs with", () => {
    expect(css).toContain('html[data-surface="app"]:not([data-theme="dark"]) body { background: #ffffff; }');
    expect(css.indexOf('html[data-surface="app"]:not([data-theme="dark"]) body')).toBeGreaterThan(
      css.indexOf('html[data-surface="app"]:not([data-theme="dark"]) .boot'),
    );
  });

  it("is still sand for a browser with no stored session (the sign-in's own ground)", () => {
    expect(html).toContain("html { background: #f6ece1; }");
    expect(css).toMatch(/\nbody \{[^}]*background: var\(--page\);/);
  });
});

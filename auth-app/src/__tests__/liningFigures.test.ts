import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postcssLining } from "../theme/postcssLining";

/**
 * "T1" drew as "Tı": Fanwood Text's figures are old-style, and a 1 is a small-cap I. Every rule that picks the
 * serif or the pixel face gets lining figures at build time (the `font` shorthand resets the longhand, so a
 * root-level rule could not do it).
 */
const run = async (css: string) => (await postcss([postcssLining()]).process(css, { from: undefined })).css;

describe("lining figures", () => {
  it("adds lining-nums after a font shorthand that picks the serif, so the shorthand cannot reset it", async () => {
    const out = await run(".h { font: 400 24px/1.2 var(--serif); color: red; }");
    expect(out).toMatch(/font: 400 24px\/1\.2 var\(--serif\);[\s\S]*font-variant-numeric: lining-nums/);
    // After the shorthand, not before it.
    expect(out.indexOf("font-variant-numeric")).toBeGreaterThan(out.indexOf("font:"));
  });

  it("covers the pixel face and a plain font-family, and leaves other faces alone", async () => {
    expect(await run(".a { font-family: var(--pixel); }")).toContain("lining-nums");
    expect(await run('.b { font-family: "Fanwood Text", serif; }')).toContain("lining-nums");
    expect(await run(".c { font: 500 13px/1 var(--ui); }")).not.toContain("lining-nums");
  });

  it("keeps a tabular figure tabular, and does not repeat itself", async () => {
    const out = await run(".t { font: 400 20px var(--serif); font-variant-numeric: tabular-nums; }");
    expect(out).toContain("font-variant-numeric: lining-nums tabular-nums");
    expect(out.match(/font-variant-numeric/g)).toHaveLength(1);
    const again = await run(out);
    expect(again.match(/font-variant-numeric/g)).toHaveLength(1);
  });

  it("is in the build", () => {
    const cfg = readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf8");
    expect(cfg).toContain("postcssLining()");
  });
});

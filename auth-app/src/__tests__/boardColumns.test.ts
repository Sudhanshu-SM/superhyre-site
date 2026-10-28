import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "boardStages.css"), "utf8");

/** Four columns fill the row, fewer never grow past that, five fill it too and never get narrower, more scroll. */
describe("how wide the board's columns are", () => {
  it("sizes a column between the width of five across and the width of four across", () => {
    expect(css).toContain("--col-min: max(240px, calc((100% - 4 * var(--gap)) / 5));");
    expect(css).toContain("--col-max: max(var(--col-min), calc((100% - 3 * var(--gap)) / 4));");
    expect(css).toContain("grid-auto-columns: minmax(var(--col-min), var(--col-max));");
  });

  it("no longer fixes a column at a fifth of the row, capped at 340px", () => {
    expect(css).not.toContain("clamp(240px, calc((100% - 4 * 14px) / 5), 340px)");
  });
});

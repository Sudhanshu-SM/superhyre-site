import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = (name: string) => readFileSync(resolve(__dirname, "..", name), "utf8");

describe("one page column", () => {
  it("gives every console page the same width and the same centring, so titles share a left edge", () => {
    const access = css("access.css");
    expect(access).toMatch(/--page-max:\s*1360px/);
    expect(access).toMatch(/html \.con-main > :is\(\.ct, \.cg, \.kl, \.cw, \.an-page\)\s*\{[^}]*max-width:\s*var\(--page-max\)[^}]*margin-inline:\s*auto/);
  });

  it("says an empty Analytics page once: the banner speaks and the cards under it stay quiet", () => {
    expect(css("analytics.css")).toMatch(/\.an-banner ~ \.an-dash \.gh \.gh-l\s*\{\s*display:\s*none/);
  });
});

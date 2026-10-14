import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GhostChart, smoothPath, steppedPath, type GhostKind } from "../GhostChart";

const KINDS: GhostKind[] = ["funnel", "bars", "trend", "columns", "heat", "donut", "table"];

describe("the ghost of a chart", () => {
  it("draws every kind: a decorative picture, the chart's name, one calm line, and a link when there is one", () => {
    for (const kind of KINDS) {
      const html = renderToStaticMarkup(
        <GhostChart kind={kind} title="Conversion funnel" line="Add people to a campaign to see how they move through each step." action={{ label: "Open campaigns", href: "#/campaigns" }} />,
      );
      expect(html, kind).toContain(`data-ghost="${kind}"`);
      // the picture is for the eye only: hidden from a screen reader, nothing in it to read
      expect(html, kind).toContain('<svg viewBox="0 0 480 168" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">');
      expect(html, kind).not.toContain("<text");
      expect(html, kind).toContain('<b class="gh-t">Conversion funnel</b>');
      expect(html, kind).toContain('<span class="gh-l">Add people to a campaign to see how they move through each step.</span>');
      expect(html, kind).toContain('<a class="gh-a" href="#/campaigns">Open campaigns</a>');
      // it fades out through a mask, so it dissolves into the card in both themes
      expect(html, kind).toContain("<mask");
    }
  });

  it("has no link when there is no action, and a shorter drawing when asked", () => {
    const html = renderToStaticMarkup(<GhostChart kind="table" title="People" line="It's just you so far." compact />);
    expect(html).not.toContain("gh-a");
    expect(html).toContain("is-compact");
  });

  it("draws the same picture every time, from fixed values", () => {
    const a = renderToStaticMarkup(<GhostChart kind="trend" title="t" line="l" />).replace(/:r[0-9a-z]+:|[A-Za-z0-9_-]*-[fm]\b/g, "id");
    const b = renderToStaticMarkup(<GhostChart kind="trend" title="t" line="l" />).replace(/:r[0-9a-z]+:|[A-Za-z0-9_-]*-[fm]\b/g, "id");
    expect(a).toBe(b);
  });

  it("is themed in the stylesheet by variables, a light variant and a dark one, never a white block", () => {
    const css = readFileSync(resolve(__dirname, "..", "ghost.css"), "utf8");
    expect(css).toContain("--an-ghost-fill: #f8e6df");
    expect(css).toContain('html:root[data-theme="dark"] .gh');
    expect(css).toContain("--an-ghost-fill: rgba(255, 255, 255, 0.08)");
    // the pale tint is the only literal in the light variant; the shapes themselves read the variables
    expect(css).not.toMatch(/fill:\s*#fff\b/i);
    expect(css).not.toMatch(/background:\s*#fff\b/i);
  });
});

describe("the shapes' geometry", () => {
  it("steps down in plateaus with rounded shoulders, closed to the floor", () => {
    const { line, area } = steppedPath([20, 60, 100], 300, 150, 10);
    expect(line.startsWith("M0,20 L90,20 C100,20 100,60 110,60")).toBe(true);
    expect(area.startsWith("M0,150 L0,20")).toBe(true);
    expect(area.endsWith("L300,150 Z")).toBe(true);
  });

  it("smooths a line through its points and can be held inside a range", () => {
    const d = smoothPath([[0, 10], [50, 90], [100, 10]], [0, 100]);
    expect(d.startsWith("M0,10 C")).toBe(true);
    const ys = [...d.matchAll(/,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
    expect(smoothPath([])).toBe("");
  });
});

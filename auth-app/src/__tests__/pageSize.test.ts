import { describe, expect, it } from "vitest";
import { fitRows, PAGE_FALLBACK } from "../usePageSize";
import { clampedOffset } from "../sectionState";

describe("page size", () => {
  it("fits as many rows as the room allows, between 10 and 30", () => {
    expect(fitRows(940, 94)).toBe(10);
    expect(fitRows(1500, 60)).toBe(25);
    expect(fitRows(5000, 60)).toBe(30);
    expect(fitRows(300, 94)).toBe(10);
  });

  it("is 15 where it cannot be measured", () => {
    for (const bad of [Number.NaN, 0, -20, Infinity]) expect(fitRows(bad, 60)).toBe(PAGE_FALLBACK);
    expect(fitRows(800, 0)).toBe(PAGE_FALLBACK);
    expect(fitRows(800, Number.NaN)).toBe(PAGE_FALLBACK);
  });

  it("lands a remembered row offset on the page that holds its first row when the size changes", () => {
    // Left on rows 30-44 (size 15); now 20 fit: row 30 is on the page starting at 20.
    expect(clampedOffset(30, 100, 20)).toBe(20);
    // Left on rows 20-29 (size 10); now 25 fit: row 20 is on the first page.
    expect(clampedOffset(20, 100, 25)).toBe(0);
    // A bigger window and a shorter list: never past the last page.
    expect(clampedOffset(90, 40, 30)).toBe(30);
  });
});

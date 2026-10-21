import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("Candidates pages by number, with the whole count", () => {
  const page = src("Contacts.tsx");

  it("asks the API for the page by its first row and takes the total, not cursors", () => {
    expect(page).toContain("limit: size, offset: pageAt.offset");
    expect(page).toContain("total: r.total");
    expect(page).not.toContain("setCursors");
    expect(page).not.toContain("cursor: cursors");
    expect(src("api/candidates.ts")).toContain("total: number | null");
  });

  it("gives the pager the total, so it shows every page number, the ellipsis and Go to page", () => {
    expect(page).toContain("onChange: setWanted, total,");
    expect(page).not.toContain("more: LIVE");
  });

  it("holds a remembered page inside the list only once the total is known", () => {
    expect(page).toContain("settledOffset(wanted, total, size)");
    expect(page).toContain("settledOffset(wanted, lastTotal.current, size)");
    expect(page).toMatch(/useSectionSave\(SECTION, \{[^}]*size, offset \}/);
  });

  it("keeps the ticks while paging, and clears them when the list itself changes", () => {
    const reset = page.slice(page.indexOf("const listKey = JSON.stringify([camp, q, filters, sort]);"));
    expect(reset.slice(0, 400)).toContain("setSelected([]);");
    expect(reset.slice(0, 400)).toContain("setWanted(0);");
    // A page change is only a new offset: nothing there touches the selection.
    expect(page).toContain("onChange: setWanted");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "..", "Nav.tsx"), "utf8");

describe("the campaign switcher popover", () => {
  it("does not close when its own list scrolls: only the page moving away from its trigger closes it", () => {
    // The capture listener hears every scroll on the page, the popover's own list included.
    expect(src).toMatch(/const onScroll = \(e: Event\) => \{\s*if \(popRef\.current\?\.contains\(e\.target as Node\)\) return;\s*onClose\(\);/);
    expect(src).toContain('window.addEventListener("scroll", onScroll, true)');
    expect(src).not.toContain('window.addEventListener("scroll", onClose, true)');
  });

  it("is kept on the page: pushed up when its trigger is low, and no taller than the room left", () => {
    expect(src).toContain("window.innerHeight - 12 - MIN_ROOM");
    expect(src).toMatch(/maxHeight: Math\.min\(448, window\.innerHeight \* 0\.7, pos\.room\)/);
  });
});

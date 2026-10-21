import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findKey, isMac } from "../platform";
import { TOUR_STEPS } from "../tour/tourSteps";

/** Quick find is called by the key this computer has: ⌘K on a Mac, Ctrl K elsewhere, on the button and in the tour. */
describe("the quick find key", () => {
  it("is ⌘K on a Mac, iPhone or iPad and Ctrl K on Linux and Windows", () => {
    expect(findKey({ platform: "MacIntel" })).toBe("⌘K");
    expect(findKey({ userAgentData: { platform: "macOS" } })).toBe("⌘K");
    expect(findKey({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe("⌘K");
    expect(findKey({ platform: "Linux x86_64" })).toBe("Ctrl K");
    expect(findKey({ platform: "Win32" })).toBe("Ctrl K");
    expect(findKey({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe("Ctrl K");
    expect(findKey(undefined)).toBe(isMac() ? "⌘K" : "Ctrl K");
  });

  it("is said the same way on the button and in the tour", () => {
    const nav = readFileSync(resolve(__dirname, "../Nav.tsx"), "utf8");
    expect(nav).toContain('<kbd className="nav-find-kbd nav-fade" aria-hidden="true">{findKey()}</kbd>');
    expect(nav).not.toContain(">⌘K</kbd>");
    const step = TOUR_STEPS.find((s) => s.id === "quick-find")!;
    expect(step.text).toBe(`Jump to any page or campaign, or ask the agent, from anywhere with ${findKey()}.`);
  });
});

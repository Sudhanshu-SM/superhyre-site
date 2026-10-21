import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The classes the meeting cards own are theirs alone. A card that reuses a name another page styles (the free-times
 * card once shared `.sl` with the Shortlisted page and was stretched to the window's height) looks right in markup
 * tests and wrong on screen, so this reads the stylesheets.
 */

const SRC = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "__tests__" || e.name === "node_modules" ? [] : walk(join(dir, e.name))) : e.name.endsWith(".css") ? [join(dir, e.name)] : [],
  );
const OWN = ["agentCards/meetingCard.css", "campaignMeetings.css", "settingsGoogle.css"].map((f) => join(SRC, f));
const classesOf = (css: string) => new Set([...css.replace(/\/\*[^]*?\*\//g, "").matchAll(/\.([a-z][\w-]*)/gi)].map((m) => m[1] ?? ""));

describe("the meeting stylesheets", () => {
  const others = walk(SRC).filter((f) => !OWN.includes(f)).map((f) => [f, readFileSync(f, "utf8").replace(/\/\*[^]*?\*\//g, "")] as const);
  for (const file of OWN) {
    it(`${file.slice(SRC.length + 1)} only styles classes no other stylesheet styles`, () => {
      const mine = [...classesOf(readFileSync(file, "utf8"))].filter((c) => /^(mt|fs|gw|cw-coming|cw-pc-meet|cw-pd-meet)/.test(c));
      expect(mine.length).toBeGreaterThan(0);
      const clash = mine.filter((c) => others.some(([, css]) => new RegExp(`\\.${c}(?![\\w-])`).test(css)));
      expect(clash).toEqual([]);
    });
  }

  it("keeps the cards' own boxes: padded by the approval card's rule, never a page layout", () => {
    const css = readFileSync(join(SRC, "agentCards/meetingCard.css"), "utf8");
    expect(css).not.toMatch(/100dvh|100vh/);
    for (const file of ["agentCards/SlotsCard.tsx", "agentCards/MeetingCard.tsx"]) {
      expect(readFileSync(join(SRC, file), "utf8"), file).toContain("rep-card lt-approval");
    }
  });
});

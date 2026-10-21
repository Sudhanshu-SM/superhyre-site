import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { vendorWords } from "../displayText";
import { buildSays, noticeText, poolSentence, searchNote } from "../liveSourcing";
import type { Pool } from "../liveSourcing";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/** Where people come from is not on screen: no database, pool, provider, vendor or profile budget. */
const SOURCE = /crustdata|salesql|apollo|contactout|data provider|own database|our pool|new profile|budget/i;

describe("the data vendor's name stays out of what a person reads", () => {
  it("writes 'the lookup', and starts a sentence with 'The'", () => {
    expect(vendorWords("Couldn't get every contact detail. Crustdata contact lookup failed."))
      .toBe("Couldn't get every contact detail. The lookup contact lookup failed.");
    expect(vendorWords("Crustdata isn't connected yet.")).toBe("The lookup isn't connected yet.");
    expect(vendorWords("I asked Crustdata for more.")).toBe("I asked the lookup for more.");
    expect(vendorWords("Crustdata's list ran out.")).toBe("The lookup's list ran out.");
    expect(vendorWords("Nothing to say here.")).toBe("Nothing to say here.");
  });

  it("is applied to the server's notices, and the search copy never names it", () => {
    expect(noticeText("Couldn't get every contact detail. Crustdata contact lookup failed.")).not.toMatch(/crustdata/i);
    expect(noticeText("Crustdata isn't connected yet.")).not.toMatch(/crustdata/i);
    expect(noticeText("That's everyone Crustdata has.")).not.toMatch(/crustdata/i);
    const pool: Pool = { found: 0, ranked: 0, waiting: 0, decided: 0, ruledOut: 0, unranked: 0, nextSize: 25, exhausted: false, crustdata: true };
    for (const p of [pool, { ...pool, crustdata: false }, { ...pool, found: 40, ranked: 10, waiting: 10 }]) {
      expect(`${poolSentence(p)} ${searchNote(p) ?? ""} ${buildSays(p)}`).not.toMatch(SOURCE);
    }
    // The old notices, whatever they said about the source, read as the one plain line.
    for (const old of [
      "Our data provider isn't connected yet, so I searched our own database only.",
      "That's everyone our data provider has for these filters for now.",
      "Today's budget for new profiles is used up. Searching our own database; new profiles resume tomorrow.",
    ]) expect(noticeText(old)).toBe("I looked through everyone I could reach for this role.");
  });

  it("is applied where the chat draws the agent's words and notices", () => {
    const turn = src("LiveTurn.tsx");
    expect(turn).toContain("vendorWords(lead)");
    // The turn's own notices, here; a search's notices, where the search is drawn (liveViews/SearchRun.tsx).
    expect(turn.match(/vendorWords\(n\)/g)).toHaveLength(1);
    expect(src("liveViews/SearchRun.tsx").match(/vendorWords\(n\)/g)).toHaveLength(1);
  });
});

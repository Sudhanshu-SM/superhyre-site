import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planGlides } from "../useFlip";

const at = (entries: Array<[string, number]>) => new Map(entries);

describe("what the chat list does when its rows change", () => {
  it("glides a row that moved the way it moved, and leaves one that stayed alone", () => {
    const keys = ["a", "b", "c"];
    const before = at([["a", 0], ["b", 40], ["c", 80]]);
    const now = at([["a", 40], ["b", 0], ["c", 80]]);
    expect(planGlides(keys, before, now)).toEqual([
      { key: "a", kind: "move", dy: -40 },
      { key: "b", kind: "move", dy: 40 },
    ]);
  });

  it("brings a new row in, one after another, and never later than the thirteenth", () => {
    const keys = Array.from({ length: 16 }, (_, i) => `n${i}`);
    const out = planGlides(keys, at([]), at(keys.map((k, i) => [k, i * 40])));
    expect(out.map((g) => (g.kind === "in" ? g.nth : -1))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12, 12]);
  });

  it("does not move a section: its rows glide on their own, so none is carried twice as far", () => {
    const keys = ["sec:pinned", "p1", "p2"];
    const before = at([["sec:pinned", 100], ["p1", 100], ["p2", 140]]);
    const now = at([["sec:pinned", 360], ["p1", 360], ["p2", 400]]);
    const out = planGlides(keys, before, now);
    expect(out.map((g) => g.key)).toEqual(["p1", "p2"]);
    expect(out).toEqual([
      { key: "p1", kind: "move", dy: -260 },
      { key: "p2", kind: "move", dy: -260 },
    ]);
  });

  it("leaves a key alone that two elements hold (a chat in its campaign and in Recents), rather than sending each to the other's place", () => {
    const keys = ["x", "y", "x"];
    const before = at([["x", 400], ["y", 40]]);
    const now = at([["x", 900], ["y", 40]]);
    expect(planGlides(keys, before, now)).toEqual([]);
  });

  it("carries a row inside a card that moves only the distance it moves beyond the card", () => {
    const keys = ["campaign:A", "A:1", "A:2"];
    const before = at([["campaign:A", 200], ["A:1", 240], ["A:2", 280]]);
    // The card goes up 80; its first row goes up 80 too, its second 120.
    const now = at([["campaign:A", 120], ["A:1", 160], ["A:2", 160]]);
    const parent = new Map<string, string | null>([["campaign:A", null], ["A:1", "campaign:A"], ["A:2", "campaign:A"]]);
    expect(planGlides(keys, before, now, parent)).toEqual([
      { key: "campaign:A", kind: "move", dy: 80 },
      { key: "A:2", kind: "move", dy: 40 },
    ]);
  });

  it("does not glide the rows of a card that slides in: the card's own slide carries them", () => {
    const keys = ["campaign:B", "B:1", "B:2"];
    const parent = new Map<string, string | null>([["campaign:B", null], ["B:1", "campaign:B"], ["B:2", "campaign:B"]]);
    const out = planGlides(keys, at([]), at([["campaign:B", 0], ["B:1", 40], ["B:2", 80]]), parent);
    expect(out).toEqual([{ key: "campaign:B", kind: "in", nth: 0 }]);
  });

  it("carries on from where a glide that was still running had got to, when the list changes again", () => {
    // The row was still 30px below its place when the list changed again and its place moved 50px up the page.
    const out = planGlides(["a"], at([["a", 200]]), at([["a", 150]]), new Map(), at([["a", 30]]));
    expect(out).toEqual([{ key: "a", kind: "move", dy: 80 }]);
  });

  it("ignores a shift of a pixel or less", () => {
    expect(planGlides(["a"], at([["a", 10]]), at([["a", 10.8]]))).toEqual([]);
  });
});

describe("the chat list's rows", () => {
  const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

  it("are followed by the layout alone: the signature counts the rows and their order, not how many Recents fit", () => {
    const rail = source("ChatRail.tsx");
    expect(rail).toContain("arranged.recents.map((c) => c.id).join(\",\")}~${more}");
    expect(rail).not.toContain("recents.map((c) => c.id).join(\",\")}`;");
  });

  it("give a chat that sits under a campaign and in Recents a key for each place", () => {
    const rail = source("ChatRail.tsx");
    expect(rail).toContain("data-flip={`${item.id}:${c.id}`}");
  });
});

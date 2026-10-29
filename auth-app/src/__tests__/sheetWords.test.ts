import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SheetPreview, SheetSync } from "../api/campaigns";
import { doneLines, placedLines, skippedLine, tabLine } from "../sheetWords";

/**
 * The candidate-sheet dialog says, before the sheet is read in, which words in the statuses will place people where and
 * which tab it reads, and after, what became of every row of people: nobody is rejected by a rule they were not shown, and
 * no row goes missing without a word.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

const look = (over: Partial<SheetPreview> = {}): SheetPreview => ({
  rows: 50,
  people: 50,
  unreadable: 0,
  noName: 0,
  noContact: 0,
  stages: {},
  placedBy: {},
  noStatus: 0,
  read: [{ field: "name", heading: "Name" }],
  left: [],
  tab: "linked",
  ...over,
});

const sync = (over: Partial<SheetSync> = {}): SheetSync => ({
  people: 50,
  added: 50,
  alreadyHere: 0,
  repeats: 0,
  refused: 0,
  refusals: [],
  unreadable: 0,
  moved: {},
  notMoved: 0,
  ...over,
});

describe("which words place people where", () => {
  it("lists the rejections first, each with the words in the statuses that put people there", () => {
    expect(
      placedLines(
        look({
          stages: { outreach: 20, passed: 8, shortlisted: 22 },
          placedBy: {
            outreach: [{ word: "no response", n: 20 }],
            passed: [
              { word: "rejected", n: 6 },
              { word: "not interested", n: 2 },
            ],
            shortlisted: [{ word: "shared", n: 22 }],
          },
        }),
      ),
    ).toEqual([
      "Rejected, 8: the status says rejected (6), not interested (2).",
      "Contacted, 20: the status says no response (20).",
      "Shared, 22: the status says shared (22).",
    ]);
  });

  it("counts what the named words leave out, so the numbers add up to the stage", () => {
    expect(
      placedLines(
        look({
          stages: { passed: 6 },
          placedBy: {
            passed: [
              { word: "rejected", n: 2 },
              { word: "declined", n: 1 },
              { word: "not interested", n: 1 },
            ],
          },
        }),
      ),
    ).toEqual(["Rejected, 6: the status says rejected (2), declined (1), not interested (1), and 2 by other words."]);
  });

  it("says nothing for a stage nobody is placed on", () => {
    expect(placedLines(look())).toEqual([]);
  });
});

describe("which tab", () => {
  it("says the first tab is read, and what to do when the people are on another, unless the link names one", () => {
    expect(tabLine(look({ tab: "first" }))).toBe(
      "Reading the first tab of the sheet. If your people are on another tab, open it and paste its link.",
    );
    expect(tabLine(look({ tab: "linked" }))).toBe("Reading the tab your link points at.");
  });
});

describe("the rows that are not people", () => {
  it("are counted with why, and not mentioned when there are none", () => {
    expect(skippedLine(look())).toBeNull();
    expect(skippedLine(look({ unreadable: 3, noName: 1, noContact: 2 }))).toBe(
      "3 rows can't be added: 1 with no name, 2 with no phone, email or LinkedIn I can read.",
    );
    expect(skippedLine(look({ unreadable: 1, noName: 1 }))).toBe("1 row can't be added: 1 with no name.");
  });
});

describe("what a sync did", () => {
  it("says what was added and placed, and nothing else when every row went in", () => {
    expect(doneLines(sync({ added: 22, alreadyHere: 3, moved: { outreach: 8, passed: 11 }, people: 25 }))).toEqual([
      "Done: 22 new, 3 already here, 8 contacted, 11 rejected.",
    ]);
  });

  it("accounts for the repeats, the refused rows by their number in the sheet, and the rows that were not people", () => {
    const lines = doneLines(
      sync({
        people: 50,
        added: 22,
        repeats: 2,
        refused: 26,
        refusals: [
          { row: 6, why: "Name is too short" },
          { row: 9, why: "Name is too short" },
        ],
        unreadable: 3,
        notMoved: 1,
      }),
    );
    expect(lines).toEqual([
      "Done: 22 new, 0 already here.",
      "2 rows were the same person as a row above, so counted once.",
      "26 rows couldn't be added: row 6 (Name is too short), row 9 (Name is too short), and 24 more.",
      "3 rows were skipped (no name, or no phone, email or LinkedIn I could read).",
      "1 need your yes (a hire that takes someone off another campaign).",
    ]);
  });

  it("lists at most five refused rows by number and counts the rest", () => {
    const refusals = Array.from({ length: 8 }, (_, i) => ({ row: i + 2, why: "Name is too short" }));
    const line = doneLines(sync({ refused: 8, refusals })).find((l) => l.includes("couldn't be added")) ?? "";
    expect(line).toBe(
      "8 rows couldn't be added: row 2 (Name is too short), row 3 (Name is too short), row 4 (Name is too short), row 5 (Name is too short), row 6 (Name is too short), and 3 more.",
    );
  });

  it("follows the console's voice: no dots between parts, no dashes, no ellipsis", () => {
    const all = [
      ...doneLines(sync({ repeats: 1, refused: 1, refusals: [{ row: 4, why: "Name is too short" }], unreadable: 1, notMoved: 1 })),
      ...placedLines(look({ stages: { passed: 1 }, placedBy: { passed: [{ word: "rejected", n: 1 }] } })),
      tabLine(look({ tab: "first" })),
      skippedLine(look({ unreadable: 1, noName: 1 })) ?? "",
    ];
    for (const line of all) expect(line).not.toMatch(/ · |—|–|…/);
  });
});

describe("the dialog", () => {
  it("shows the words that place people and the tab before the yes, asks whether to place by status, and sends it", () => {
    const dialog = src("SheetDialog.tsx");
    expect(dialog).toContain("placedLines(look)");
    expect(dialog).toContain("tabLine(look)");
    expect(dialog).toContain("Put each person on the stage their status says");
    expect(dialog).toContain("sheetApi.sync(campaignId, link, place ? {} : { place: false })");
    // The whole account of a sync is drawn, not just the first line.
    expect(dialog).toContain("doneLines(done)");
  });

  it("scrolls between its heading and its buttons, so what is read never pushes the buttons out of the dialog", () => {
    const dialog = src("SheetDialog.tsx");
    expect(dialog.indexOf('<div className="sd-body">')).toBeGreaterThan(dialog.indexOf("</header>"));
    expect(dialog.indexOf('<div className="sd-body">')).toBeLessThan(dialog.indexOf('<footer className="rl-dlg-f">'));
    expect(src("candidates.css")).toMatch(/\.sd-body \{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto/);
  });

  it("takes an unticked box away with the preview it was for, so Sync now never places nobody by an old untick", () => {
    const dialog = src("SheetDialog.tsx");
    expect(dialog).toContain("setUrl(e.target.value); setLook(null); setPlace(true);");
    expect(dialog).toContain('setDone(r); setLook(null); setPlace(true); setUrl("");');
  });

  it("asks whether to place by status right under the tally it changes, before the long lines", () => {
    const dialog = src("SheetDialog.tsx");
    expect(dialog.indexOf("Put each person on the stage their status says")).toBeLessThan(dialog.indexOf("tabLine(look)"));
    expect(dialog).toContain("everyone starts as shared and no one is moved");
  });
});

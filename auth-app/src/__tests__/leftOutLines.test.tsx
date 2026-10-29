import { describe, expect, it } from "vitest";

import { leftOutLines } from "../JdIntake";

describe("what a sheet left out", () => {
  it("is said by sheet and row, with the reason", () => {
    expect(leftOutLines([
      { from: "roles.csv", row: 3, why: "repeat" },
      { from: "roles.csv", row: 5, why: "too-little" },
      { from: "The Google Sheet", row: 52, why: "over-limit" },
    ])).toEqual([
      "roles.csv: row 3 repeats an earlier row; row 5 has too little to go on.",
      "The Google Sheet: row 52 is past the first fifty.",
    ]);
  });
  it("says a row the workbook hides (a filter left it out) was not read, as the reason and not as a blank", () => {
    expect(leftOutLines([
      { from: "roles.xlsx", row: 3, why: "hidden" },
      { from: "roles.xlsx", row: 5, why: "hidden" },
    ])).toEqual(["roles.xlsx: row 3 is hidden in the sheet; row 5 is hidden in the sheet."]);
  });
  it("names five rows and counts the rest", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ from: "big.csv", row: 10 + i, why: "repeat" as const }));
    expect(leftOutLines(rows)[0]).toBe("big.csv: row 10 repeats an earlier row; row 11 repeats an earlier row; row 12 repeats an earlier row; row 13 repeats an earlier row; row 14 repeats an earlier row, and 3 more.");
  });
  it("says nothing when nothing was left out", () => {
    expect(leftOutLines([])).toEqual([]);
  });
});

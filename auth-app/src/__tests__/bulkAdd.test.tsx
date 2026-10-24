import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BULK, BulkChip, BulkList } from "../BulkAdd";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const noop = () => {};

describe("Add in bulk, on the composer", () => {
  it("says what each choice does, in words a person would use", () => {
    expect(BULK.roles.label).toBe("Roles into campaigns");
    expect(BULK.roles.hint).toMatch(/Google Sheet/);
    expect(BULK.candidates.label).toBe("Candidates from a sheet");
    expect(BULK.candidates.hint).toMatch(/stage/);
  });

  it("lists the choices it is given and no others", () => {
    const one = renderToStaticMarkup(<BulkList choices={["roles"]} onPick={noop} />);
    expect(one).toContain("Roles into campaigns");
    expect(one).not.toContain("Candidates from a sheet");
    const both = renderToStaticMarkup(<BulkList choices={["roles", "candidates"]} onPick={noop} />);
    expect(both).toContain("Candidates from a sheet");
  });

  it("is one chip, named for what it does, and draws nothing when there is nothing to add", () => {
    const chip = renderToStaticMarkup(<BulkChip choices={["roles"]} onPick={noop} />);
    expect(chip).toContain("Add in bulk");
    expect(renderToStaticMarkup(<BulkChip choices={[]} onPick={noop} />)).toBe("");
  });

  it("offers a candidate sheet only with a campaign in the chat that the person may change", () => {
    const agent = src("Agent.tsx");
    expect(agent).toContain('(LIVE ? ["roles", ...(focused && mayChange ? (["candidates"] as const) : [])] : [])');
    expect(agent).toContain("{focused && mayChange && <SheetDialog");
  });

  it("hands roles to the import card as a batch, one description being a batch of one", () => {
    const agent = src("Agent.tsx");
    expect(agent).toContain('onApply={(jd) => { setBulkRolesOpen(false); sendBulk({ texts: [{ label: jd.name, jd: jd.text }] }); }}');
    expect(agent).toContain('sendMessage("Add roles in bulk", undefined)');
  });
});

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
  it("names five rows and counts the rest", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ from: "big.csv", row: 10 + i, why: "repeat" as const }));
    expect(leftOutLines(rows)[0]).toBe("big.csv: row 10 repeats an earlier row; row 11 repeats an earlier row; row 12 repeats an earlier row; row 13 repeats an earlier row; row 14 repeats an earlier row, and 3 more.");
  });
  it("says nothing when nothing was left out", () => {
    expect(leftOutLines([])).toEqual([]);
  });
});

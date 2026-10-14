import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { movedOnBoard, orderBoard } from "../api/campaigns";
import type { ApiBoardRow } from "../api/campaigns";

const row = (id: string, fullName: string, stageEnteredAt?: string, stage: ApiBoardRow["stage"] = "shortlisted"): ApiBoardRow =>
  ({ campaignCandidateId: id, fullName, stage, step: null, daysInStage: 0, ...(stageEnteredAt ? { stageEnteredAt } : {}) }) as unknown as ApiBoardRow;

describe("who is at the top of a column", () => {
  it("is whoever arrived there last, then by name", () => {
    const out = orderBoard([
      row("a", "Ravi Gupta", "2026-10-01T09:00:00Z"),
      row("b", "Aarav Reddy", "2026-10-13T09:00:00Z"),
      row("c", "Neel Saxena", "2026-10-12T09:00:00Z"),
      row("d", "Varun Hegde", "2026-10-13T09:00:00Z"),
    ]);
    expect(out.map((r) => r.fullName)).toEqual(["Aarav Reddy", "Varun Hegde", "Neel Saxena", "Ravi Gupta"]);
  });

  it("puts someone who was just moved or added first, and keeps rows with no arrival time in the order they came", () => {
    const rows = [row("x", "Old One"), row("y", "Old Two"), row("z", "Newest", "2026-10-12T10:00:00Z")];
    expect(orderBoard(rows).map((r) => r.campaignCandidateId)).toEqual(["z", "x", "y"]);
    // the guess before the server answers: moved to the front with the clock reset
    const moved = movedOnBoard(orderBoard(rows), "y", "outreach");
    expect(orderBoard(moved)[0]?.campaignCandidateId).toBe("y");
    // and the same order after a reload (the server's own `stage_entered_at desc, id`)
    expect(orderBoard([...moved].reverse())[0]?.campaignCandidateId).toBe("y");
  });
});

describe("where the cards sit in a column", () => {
  const css = readFileSync(resolve(__dirname, "../workspace.css"), "utf8");
  it("start at the top, under the header and Add people, whatever the neighbouring columns are", () => {
    // the last word on a column: no explicit rows that a third child (Add people) could push the list out of
    expect(css.slice(css.lastIndexOf(".cw-col {"))).toMatch(/\.cw-col \{ grid-template-rows: none; grid-auto-rows: max-content; align-content: start; \}/);
    expect(css).toMatch(/\.cw-cards \{ display: grid; align-content: start;/);
  });
});

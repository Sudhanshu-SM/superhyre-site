import { describe, expect, it } from "vitest";
import { dayHeading, dayProgress } from "../api/tasks";

/** Home's My tasks header: plain facts about today's tasks, counted from the person's own and nothing else. */

const NOW = Date.parse("2026-10-21T10:00:00");
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const done = (days = 0) => ({ state: "done" as const, dueInDays: 0, resolvedAt: at(days) });
const open = (dueInDays: number | null) => ({ state: "todo" as const, dueInDays, resolvedAt: null });

describe("the day's progress", () => {
  it("is what was finished today out of what is due today or late, and what was finished", () => {
    const day = dayProgress([done(), done(), done(), open(0), open(-2), open(3), open(null)], NOW);
    expect(day).toEqual({ finished: 3, total: 5 });
    expect(dayHeading(day)).toBe("3 of 5 done today");
  });

  it("says all done once nothing due is left, and says nothing at all with no day to report", () => {
    expect(dayHeading(dayProgress([done(), done(), open(5)], NOW))).toBe("All done for today");
    // Four finished on earlier days and nothing due: no "4 of 4 done" and no "Day cleared".
    expect(dayProgress([done(-1), done(-3), done(-1), done(-9)], NOW)).toEqual({ finished: 0, total: 0 });
    expect(dayHeading(dayProgress([done(-1)], NOW))).toBe("");
    expect(dayHeading(dayProgress([], NOW))).toBe("");
  });

  it("counts one task as one: no 'Last one' and no 'Fresh start'", () => {
    expect(dayHeading(dayProgress([open(0)], NOW))).toBe("0 of 1 done today");
    expect(dayHeading(dayProgress([open(-1), done()], NOW))).toBe("1 of 2 done today");
  });

  it("holds a fixture's finished task, which has no finish time, as done today", () => {
    expect(dayProgress([{ state: "done", dueInDays: 0 }, open(0)], NOW)).toEqual({ finished: 1, total: 2 });
  });
});

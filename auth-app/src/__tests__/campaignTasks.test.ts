import { describe, expect, it } from "vitest";
import type { ApiTask } from "../api/tasks";
import { dayTask } from "../api/tasks";
import {
  PANEL_ROWS, dueFromInput, dueText, inScope, mayChange, openLine, tomorrowNine,
} from "../campaignTasks";

/**
 * What the Overview's Tasks panel says about a task: the due day as plain words (amber on the day, red-brown once
 * it has passed), a new task's default day (tomorrow at nine), and who may change what (the server's own rule).
 */

/** Noon on a fixed local day, so "today" is the same everywhere the test runs. */
const NOW = new Date(2026, 9, 13, 12, 0, 0, 0).getTime();
const at = (days: number, hour = 18): string => new Date(2026, 9, 13 + days, hour, 0, 0, 0).toISOString();

const task = (over: Partial<ApiTask> = {}): ApiTask => ({
  id: "t1", title: "Call Kabir back", kind: "manual", status: "todo", dueAt: at(0), assigneeId: "u1", assigneeName: "Asha Rao",
  createdById: "u2", createdByName: "Meera Pillai", createdByKind: "user",
  campaign: { id: "c1", name: "Staff Platform Engineer" }, candidate: null, action: null, createdAt: at(-1), resolvedAt: null,
  ...over,
});

describe("the due day", () => {
  it("is amber text on the day itself, with the exact time on hover", () => {
    const d = dueText(dayTask(task({ dueAt: at(0, 18) }), NOW), NOW);
    expect(d.text).toBe("Today");
    expect(d.tone).toBe("today");
    expect(d.title).toMatch(/^Today, 6 pm/);
  });

  it("is plain for tomorrow and for a later day, written the way Scheduled writes it", () => {
    expect(dueText(dayTask(task({ dueAt: at(1) }), NOW), NOW)).toMatchObject({ text: "Tomorrow", tone: "" });
    const later = dueText(dayTask(task({ dueAt: at(3) }), NOW), NOW);
    expect(later.text).toBe("Fri 16 Oct");
    expect(later.tone).toBe("");
  });

  it("names a task that is past its day by the date it was due, in red-brown, and says nothing more", () => {
    const d = dueText(dayTask(task({ dueAt: at(-8) }), NOW), NOW);
    expect(d.text).toBe("Overdue 5 Oct");
    expect(d.tone).toBe("late");
    expect(d.text).not.toMatch(/days? ago|—|·/);
  });

  it("is a plain 'No date' for a task with none", () => {
    expect(dueText(dayTask(task({ dueAt: null }), NOW), NOW)).toEqual({ text: "No date", tone: "", title: "" });
  });
});

describe("a new task's day", () => {
  it("defaults to tomorrow at nine, in the browser's own zone, across a month's end", () => {
    expect(tomorrowNine(NOW)).toBe("2026-10-14T09:00");
    expect(tomorrowNine(new Date(2026, 9, 31, 22, 30).getTime())).toBe("2026-11-01T09:00");
  });

  it("reads the picker's value back as the instant the API wants, and nothing from a blank or a bad value", () => {
    expect(dueFromInput("2026-10-14T09:00")).toBe(new Date(2026, 9, 14, 9, 0, 0, 0).toISOString());
    expect(dueFromInput(tomorrowNine(NOW))).toBe(new Date(2026, 9, 14, 9, 0, 0, 0).toISOString());
    expect(dueFromInput("")).toBeNull();
    expect(dueFromInput("2026-02-30T09:00")).toBeNull();
    expect(dueFromInput("tomorrow")).toBeNull();
  });
});

describe("who may finish a task", () => {
  const t = dayTask(task(), NOW);

  it("is an admin, the person it is for, or whoever made it: the server's rule, so no box is offered for a refusal", () => {
    expect(mayChange(t, { mayManage: true, myId: "u9" })).toBe(true);
    expect(mayChange(t, { mayManage: false, myId: "u1" })).toBe(true);
    expect(mayChange(t, { mayManage: false, myId: "u2" })).toBe(true);
    expect(mayChange(t, { mayManage: false, myId: "u9" })).toBe(false);
    expect(mayChange(t, { mayManage: false, myId: undefined })).toBe(false);
  });

  it("filters everyone's tasks down to mine without losing the order", () => {
    const list = [
      dayTask(task({ id: "a", assigneeId: "u1" }), NOW),
      dayTask(task({ id: "b", assigneeId: "u2" }), NOW),
      dayTask(task({ id: "c", assigneeId: "u1" }), NOW),
    ];
    expect(inScope(list, "everyone", "u1").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(inScope(list, "mine", "u1").map((x) => x.id)).toEqual(["a", "c"]);
    expect(inScope(list, "mine", undefined)).toEqual([]);
  });
});

describe("the header", () => {
  it("counts what is open and says nothing when nothing is", () => {
    expect(openLine(3)).toBe("3 open");
    expect(openLine(1)).toBe("1 open");
    expect(openLine(0)).toBe("");
  });

  it("lists five before 'View all'", () => {
    expect(PANEL_ROWS).toBe(5);
  });
});

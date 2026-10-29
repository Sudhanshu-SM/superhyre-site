import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DayTask } from "../api/tasks";
import { TaskHover } from "../TaskHover";
import { TaskTitle } from "../TaskTitle";
import { dueLine } from "../taskCard";
import { CARD_WIDTH, HOVER_DELAY_MS, placeCard } from "../taskHover";

/**
 * The card on a task opens from any part of the task, not from one word of it. The browser is where hovering is proved;
 * these pin the rules it follows (where the card goes, when it opens) and that every list of tasks draws its rows through it.
 */

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const task: DayTask = { id: "t1", title: "Check the assignment", state: "todo", campaignId: "c1", campaign: "Sales Manager", dueInDays: 1, dueAt: null, assigneeId: null, assigneeName: null, createdById: null, createdByName: null };
const view = { width: 1440, height: 900 };

describe("where the card on a task opens", () => {
  const card = { height: 240 };

  it("is under the task, its left edge just before the pointer", () => {
    expect(placeCard({ left: 300, top: 200, bottom: 240 }, 700, card, view)).toEqual({ left: 676, top: 248 });
  });

  it("stays inside the window on the right and on a narrow one", () => {
    expect(placeCard({ left: 300, top: 200, bottom: 240 }, 1430, card, view).left).toBe(view.width - CARD_WIDTH - 12);
    expect(placeCard({ left: 0, top: 200, bottom: 240 }, 5, card, view).left).toBe(12);
    expect(placeCard({ left: 0, top: 200, bottom: 240 }, 100, card, { width: 320, height: 900 }).left).toBe(12);
  });

  it("lines up with the task's left edge when there is no pointer (it was tabbed to)", () => {
    expect(placeCard({ left: 300, top: 200, bottom: 240 }, null, card, view).left).toBe(300);
  });

  it("opens over the task when the card, as tall as it really is, does not fit below and does fit above", () => {
    // A tall card (a title that lists three steps) from a row near the foot of the window: 740 + 8 + 340 is past 888.
    expect(placeCard({ left: 300, top: 700, bottom: 740 }, 400, { height: 340 }, view)).toMatchObject({ top: 352 });
    // The same row with a short card still fits below.
    expect(placeCard({ left: 300, top: 700, bottom: 740 }, 400, { height: 120 }, view)).toMatchObject({ top: 748 });
  });

  it("is held inside the window when it fits neither below nor above, and never clipped at the foot", () => {
    const tiny = { width: 1440, height: 320 };
    expect(placeCard({ left: 300, top: 100, bottom: 140 }, 400, { height: 300 }, tiny)).toEqual({ left: 376, top: 12 });
    const out = placeCard({ left: 300, top: 600, bottom: 640 }, 400, { height: 340 }, { width: 1440, height: 700 });
    expect(out.top + 340).toBeLessThanOrEqual(700 - 12);
    expect(out.top).toBeGreaterThanOrEqual(12);
  });

  it("waits a moment, so a pointer crossing a list opens nothing", () => {
    expect(HOVER_DELAY_MS).toBeGreaterThanOrEqual(250);
    expect(HOVER_DELAY_MS).toBeLessThanOrEqual(500);
  });
});

describe("the row that carries the card", () => {
  it("is the row itself, drawn as the list item or the block it is given, with its children and no card until someone rests on it", () => {
    const li = renderToStaticMarkup(<ul><TaskHover task={task} className="tp-row"><span>words</span></TaskHover></ul>);
    expect(li).toBe('<ul><li class="tp-row"><span>words</span></li></ul>');
    expect(renderToStaticMarkup(<TaskHover task={task} as="div" className="r">x</TaskHover>)).toBe('<div class="r">x</div>');
    expect(li).not.toContain("th-card");
    expect(li).not.toContain("aria-describedby");
  });

  it("draws the title as a link, a button or plain words a keyboard can reach, with no card of its own", () => {
    expect(renderToStaticMarkup(<TaskTitle className="t" href="#/x">Do it</TaskTitle>)).toBe('<a class="t" href="#/x">Do it</a>');
    expect(renderToStaticMarkup(<TaskTitle className="t" plain>Do it</TaskTitle>)).toBe('<span class="t" tabindex="0">Do it</span>');
    expect(renderToStaticMarkup(<TaskTitle className="t" onClick={() => {}}>Do it</TaskTitle>)).toBe('<button type="button" class="t">Do it</button>');
    expect(src("TaskTitle.tsx")).not.toMatch(/onMouseEnter|createPortal/);
  });
});

describe("every list of tasks draws its rows through it", () => {
  it("Home's two lists and the campaign Overview's tasks (and its list of all of them) open it from the whole row", () => {
    const home = src("HomeCards.tsx");
    expect(home.match(/<TaskHover\b/g)?.length).toBe(2);
    expect(home).not.toMatch(/<TaskTitle task=/);
    expect(home).toMatch(/<TaskHover key=\{t\.id\} task=\{t\} disabled=\{editing === t\.id \|\| leaving === t\.id\}/);
    const panel = src("TasksPanel.tsx");
    expect(panel).toMatch(/<TaskHover task=\{t\} className=\{`tp-row/);
    expect(panel.match(/<TaskRow\b/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves no browser tooltip on a row that says the same thing as the card", () => {
    const panel = src("TasksPanel.tsx");
    expect(panel).not.toMatch(/title=\{t\.title\}/);
    expect(panel).not.toMatch(/title=\{due\.title\}/);
    expect(panel).not.toMatch(/title=\{name\}/);
    expect(src("HomeCards.tsx")).not.toMatch(/title: `\$\{t\.progress\.done\} of/);
  });

  it("opens above a dialog as well as on a page, on the scale's own tier", () => {
    expect(src("taskHover.css")).toMatch(/\.th-card \{[^}]*z-index: calc\(var\(--z-dialog\) \+ 1\)/);
    expect(src("TaskHover.tsx")).toContain("createPortal");
    expect(src("taskHover.css")).toContain("pointer-events: none");
  });

  it("measures the card before placing it, hides while it does, and describes the focused control rather than the row", () => {
    const hook = src("TaskHover.tsx");
    expect(hook).toContain("cardEl.current.offsetHeight");
    expect(hook).toContain('visibility: at ? "visible" : "hidden"');
    expect(hook).toContain('setAttribute("aria-describedby", id)');
    // Only the keyboard opens it by focus (a click that focuses a button inside the row does not), and only a scroll that moves the row closes it.
    expect(hook).toContain(':focus-visible');
    expect(hook).toMatch(/const moved = \(e: Event\)/);
    // Its words are made when it opens, not for every closed row on every render.
    expect(hook).toMatch(/const words = open \? taskCardOf\(/);
  });

  it("shuts the card while a task is being edited or finished", () => {
    expect(src("HomeCards.tsx")).toMatch(/disabled=\{editing === t\.id/);
  });
});

describe("the due line on the card", () => {
  const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

  it("says the day and the time of day, and how late it is once the day has passed", () => {
    expect(dueLine({ dueAt: at(2), dueInDays: 2 })).toMatch(/, \d{1,2}(:\d\d)? (am|pm)$/);
    expect(dueLine({ dueAt: at(-3), dueInDays: -3 })).toMatch(/^Overdue by 3 days \(.+, \d{1,2}(:\d\d)? (am|pm)\)$/);
  });

  it("is the day in words when the server gave no time, and nothing when there is no date", () => {
    expect(dueLine({ dueAt: null, dueInDays: 0 })).toBe("Today");
    expect(dueLine({ dueAt: null, dueInDays: null })).toBeNull();
  });

  it("says only the day for a task made with a day and no time (kept at the end of it), never 11:59 pm", () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(23, 59, 0, 0);
    expect(dueLine({ dueAt: d.toISOString(), dueInDays: 2 })).not.toMatch(/\b(am|pm)\b/);
  });

  it("does not call a finished task late: the day it was due and nothing about the days since", () => {
    const line = dueLine({ dueAt: at(-3), dueInDays: -3, state: "done" });
    expect(line).not.toMatch(/overdue/i);
    expect(line).toMatch(/\d/);
    expect(dueLine({ dueAt: null, dueInDays: -3, state: "done" })).toBeNull();
  });
});

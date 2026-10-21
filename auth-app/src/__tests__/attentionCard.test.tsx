import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttentionCard, tasksLine } from "../agentCards/AttentionCard";
import { Cards } from "../agentCards/ReadCards";
import type { RunEvent } from "../api/events";
import { applyEvent, newTurn } from "../liveChat";
import { asksForStagesEditor, withoutStagesAsk } from "../nav";
import type { ChatState } from "../liveChat";

/** What needs the person across their campaigns: a row each with one fact and one quiet button, never prose. */

const ITEMS = [
  { campaignId: "c1", campaign: "Senior Backend", group: "overdue" as const, line: "Call Asha", cta: { label: "Open", href: "#/campaign?campaign=c1" } },
  { campaignId: "c1", campaign: "Senior Backend", group: "waiting" as const, line: "1 email didn't send", cta: { label: "Open Outreach", href: "#/campaign/outreach?campaign=c1" } },
  { campaignId: "c2", campaign: "Data Analyst", group: "waiting" as const, line: "30 found, 5 to review", cta: { label: "Review matches", text: "Show the sourcing for Data Analyst" } },
  { campaignId: null, campaign: "Your tasks", group: "soon" as const, line: "Prepare the pitch", cta: { label: "Open", href: "#/" } },
];
const TASKS = { open: 4, overdue: 1, today: 0, later: 3 };

describe("the plate card", () => {
  it("states Home's task figures plainly, then a row per item grouped by when, each with a quiet button", () => {
    const html = renderToStaticMarkup(<AttentionCard items={ITEMS} tasks={TASKS} />);
    expect(html).toContain("Your plate");
    expect(html).toContain("4 open tasks: 1 overdue, 3 later");
    // Each group is named once, above its first row.
    expect(html.match(/class="at-group">([^<]+)</g)?.map((m) => m.replace(/.*>/, "").replace("<", ""))).toEqual(["Overdue", "Waiting on you", "This week"]);
    for (const text of ["Senior Backend", "Call Asha", "1 email didn&#x27;t send", "Data Analyst", "30 found, 5 to review", "Your tasks"]) expect(html).toContain(text);
    expect((html.match(/class="at-row"/g) ?? []).length).toBe(4);
    // A page of the console is a link; something the agent already does is a button that sends no message of the person's.
    expect(html).toMatch(/<a class="cta is-sm" href="#\/campaign\/outreach\?campaign=c1">Open Outreach/);
    expect(html).toMatch(/<button type="button" class="cta is-sm">Review matches/);
  });

  it("says the task figures for a single task, how many more there were, and plainly when the plate is clear", () => {
    expect(tasksLine({ open: 1, overdue: 0, today: 1, later: 0 })).toBe("1 open task: 1 due today");
    expect(tasksLine({ open: 0, overdue: 0, today: 0, later: 0 })).toBe("");
    expect(renderToStaticMarkup(<AttentionCard items={ITEMS} more={3} />)).toContain("and 3 more");
    expect(renderToStaticMarkup(<AttentionCard items={[]} tasks={{ open: 0, overdue: 0, today: 0, later: 0 }} />)).toContain("Nothing is on your plate right now.");
  });

  it("arrives as an artifact of the run and is drawn with the cards", () => {
    const state: ChatState = {
      conversationId: "c", turns: [{ ...newTurn("t", "what's on my plate", 0), runId: "r1", status: "working" }],
      owners: { r1: "t" }, orphans: {}, applied: {}, loading: false, error: null,
    };
    const event: RunEvent = { id: 1, runId: "r1", seq: 1, type: "artifact", at: "2026-10-21T10:00:00.000Z", kind: "attention", key: "attention", tasks: TASKS, items: ITEMS, more: 0 };
    const next = applyEvent(state, event);
    const card = next.turns[0]?.cards[0];
    expect(card).toMatchObject({ kind: "attention", more: 0, tasks: TASKS });
    expect(card?.kind === "attention" ? card.items.map((i) => i.group) : []).toEqual(["overdue", "waiting", "waiting", "soon"]);
    expect(renderToStaticMarkup(<Cards cards={next.turns[0]?.cards ?? []} />)).toContain("Your plate");
  });
});

describe("the button after a how-to", () => {
  const state: ChatState = {
    conversationId: "c", turns: [{ ...newTurn("t", "how do I add a custom stage", 0), runId: "r1", status: "working" }],
    owners: { r1: "t" }, orphans: {}, applied: {}, loading: false, error: null,
  };

  it("arrives as a link card and is drawn as one quiet button to the page", () => {
    const event: RunEvent = { id: 1, runId: "r1", seq: 1, type: "artifact", at: "2026-10-21T10:00:00.000Z", kind: "link", key: "link:stages:c1", label: "Open Stages", href: "#/campaign/pipeline?campaign=c1&stages=1" };
    const cards = applyEvent(state, event).turns[0]?.cards ?? [];
    expect(cards).toMatchObject([{ kind: "link", label: "Open Stages" }]);
    expect(renderToStaticMarkup(<Cards cards={cards} />)).toMatch(/<a class="cta" href="#\/campaign\/pipeline\?campaign=c1&amp;stages=1">Open Stages/);
  });

  it("opens the board's Stages editor from the address once, and then forgets the ask", () => {
    const hash = "#/campaign/pipeline?campaign=c1&stages=1";
    expect(asksForStagesEditor(hash)).toBe(true);
    expect(asksForStagesEditor("#/campaign/pipeline?campaign=c1")).toBe(false);
    expect(withoutStagesAsk(hash)).toBe("#/campaign/pipeline?campaign=c1");
    expect(withoutStagesAsk("#/campaign/pipeline?stages=1&campaign=c1")).toBe("#/campaign/pipeline?campaign=c1");
    expect(asksForStagesEditor(withoutStagesAsk(hash))).toBe(false);
  });
});

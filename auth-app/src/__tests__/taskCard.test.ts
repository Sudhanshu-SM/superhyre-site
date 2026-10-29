import { describe, expect, it } from "vitest";
import { dueWords, stepsOf, taskCardOf } from "../taskCard";

const base = { state: "todo" as const, campaign: null, assigneeName: null, createdByName: null, createdById: null, dueAt: null, dueInDays: null, progress: null, open: null, kind: "manual" as const, candidateName: null, removable: true };

describe("what the card on a task says", () => {
  it("reads a title that lists things as a heading and its steps, one to a line", () => {
    const t = stepsOf("@Archi Hayaran TA  - check about assignment for yogarajan - Send 2 proposals for Revspot B2c from harsmeet company - Close meghraj and tanishq discussions, set up call with meghraj if interested");
    expect(t.heading).toBe("@Archi Hayaran TA");
    expect(t.steps).toEqual([
      "check about assignment for yogarajan",
      "Send 2 proposals for Revspot B2c from harsmeet company",
      "Close meghraj and tanishq discussions, set up call with meghraj if interested",
    ]);
  });

  it("keeps an ordinary title whole, and a title with one dash is not a list", () => {
    expect(stepsOf("Approve the requirements")).toEqual({ heading: "Approve the requirements", steps: [] });
    expect(stepsOf("Contact Aman - before Friday")).toEqual({ heading: "Contact Aman - before Friday", steps: [] });
  });

  it("says when it is due in words, and nothing when it has no date", () => {
    expect(dueWords({ dueAt: null, dueInDays: null })).toBeNull();
    expect(dueWords({ dueAt: null, dueInDays: 0 })).toBe("Today");
    expect(dueWords({ dueAt: null, dueInDays: 1 })).toBe("Tomorrow");
    expect(dueWords({ dueAt: null, dueInDays: -1 })).toBe("Overdue by 1 day");
    expect(dueWords({ dueAt: null, dueInDays: -3 })).toBe("Overdue by 3 days");
  });

  it("gives the facts a person asks of a task, and leaves out what is not known", () => {
    const you = { id: "u1", name: "Punith Reddy" };
    const card = taskCardOf({ ...base, title: "Approve the requirements", campaign: "Sales Manager", assigneeName: "Archi Hayaran", createdByName: "Punith Reddy", createdById: "u1", dueInDays: 0 }, you);
    expect(card.rows).toEqual([["For", "Archi Hayaran"], ["Due", "Today"], ["Campaign", "Sales Manager"], ["Status", "To do"]]);
    expect(card.opens).toBeNull();
    const agent = taskCardOf({ ...base, title: "Review matches", kind: "agent", assigneeName: "Punith Reddy", open: "#/campaign/sourced", progress: { done: 3, total: 72, what: "reviewed" } }, you);
    expect(agent.rows).toEqual([["For", "You"], ["Added by", "The agent"], ["Due", "No date"], ["Status", "To do"], ["Progress", "3 of 72 reviewed"]]);
    expect(agent.opens).toMatch(/open/i);
  });
});

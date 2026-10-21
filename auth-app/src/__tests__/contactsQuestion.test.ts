import { describe, expect, it } from "vitest";
import type { RunEvent } from "../api/events";
import { applyEvent, newTurn, questionChoices } from "../liveChat";
import type { ChatState } from "../liveChat";

/**
 * The agent's question about which campaign to fetch contact details for. Its choices carry the exact words the
 * agent reads, so "All campaigns" needs no guessing and no campaign has to be spelled back into a sentence.
 */

const ev = (payload: Record<string, unknown>): RunEvent => ({
  ...payload, id: 1, type: "question", runId: "r1", seq: 1, at: "2026-10-12T10:00:05.000Z",
});
const chat = (): ChatState => ({
  conversationId: "c1",
  turns: [{ ...newTurn("t1", "Get contact details for the shortlisted candidates", 0), runId: "r1", status: "working" as const }],
  owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
});

const SCOPE = {
  type: "question",
  kind: "contacts_scope",
  text: "For all campaigns or a particular one?",
  choices: [
    { id: "c1", name: "Software Engineer (6 people)", text: "Get contact details for the shortlisted candidates of Software Engineer" },
    { id: "c2", name: "Data Analyst (3 people)", text: "Get contact details for the shortlisted candidates of Data Analyst" },
    { id: "all", name: "All campaigns (9 people)", text: "Get contact details for the shortlisted candidates of all campaigns" },
  ],
};

describe("a question whose choices carry their own words", () => {
  it("keeps each choice's text when the event is read", () => {
    const s = applyEvent(chat(), ev(SCOPE));
    const q = s.turns[0]?.questions[0];
    expect(q).toMatchObject({ kind: "contacts_scope", text: "For all campaigns or a particular one?" });
    expect(q?.choices).toEqual([
      { id: "c1", name: "Software Engineer (6 people)", text: "Get contact details for the shortlisted candidates of Software Engineer" },
      { id: "c2", name: "Data Analyst (3 people)", text: "Get contact details for the shortlisted candidates of Data Analyst" },
      { id: "all", name: "All campaigns (9 people)", text: "Get contact details for the shortlisted candidates of all campaigns" },
    ]);
  });

  it("keeps where the question was asked, so an answer finds it", () => {
    const q = applyEvent(chat(), ev(SCOPE)).turns[0]?.questions[0];
    expect(q).toMatchObject({ runId: "r1", seq: 1 });
  });

  it("drops a choice with no name and a text that is not text", () => {
    expect(questionChoices([{ id: "a", name: "A", text: 7 }, { id: "b" }, null, "x", { name: "C", text: "  " }])).toEqual([
      { id: "a", name: "A" },
      { id: "C", name: "C" },
    ]);
    expect(questionChoices(undefined)).toEqual([]);
  });
});

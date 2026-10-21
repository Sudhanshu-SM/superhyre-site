import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "../api/events";
import type { Message } from "../api/outreach";
import type { ChatState } from "../liveChat";

/**
 * The emails the agent drafts for a person to look over (the server's `drafts` card): each one in full, an Edit while it
 * is still a draft, what it says once it is not, the way on to Outreach, and that it arrives from the run's stream and is
 * drawn among the turn's other cards instead of as nothing.
 */

const { DraftsCardBody, draftsHeading, draftsSubline, mergeLive, rowsOf, statusWord } = await import("../agentCards/DraftsCard");
const { Cards } = await import("../agentCards/ReadCards");
const { applyEvent, draftEmailsOf, newTurn } = await import("../liveChat");

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const emails = [
  { messageId: "m1", to: "Nandini Rao", subject: "Senior Backend at Acme", body: "Hi Nandini,\n\nWe are hiring.\n\nThanks" },
  { messageId: "m2", to: "Arjun Mehta", subject: "", body: "Hi Arjun,\nA quick note." },
];
const card = { campaignId: CAMPAIGN, campaignName: "Senior Backend" };
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const noop = () => {};
const body = (rows = rowsOf({ emails }), editing: Parameters<typeof DraftsCardBody>[0]["editing"] = null, c: Parameters<typeof DraftsCardBody>[0]["card"] = card) =>
  renderToStaticMarkup(<DraftsCardBody card={c} rows={rows} editing={editing} onEdit={noop} onChange={noop} onSave={noop} onCancel={noop} />);

describe("what the card says", () => {
  it("counts the emails and says that nothing has been sent", () => {
    expect(draftsHeading(1)).toBe("1 email to look over");
    expect(draftsHeading(3)).toBe("3 emails to look over");
    const said = text(body());
    expect(said).toContain("2 emails to look over");
    expect(said).toContain("Senior Backend · Nothing has been sent");
  });

  it("shows each email in full, to whom, with its subject and its words kept as written", () => {
    const markup = body();
    const said = text(markup);
    expect(said).toContain("To Nandini Rao");
    expect(said).toContain("Senior Backend at Acme");
    expect(said).toContain("Hi Nandini, We are hiring. Thanks");
    expect(said).toContain("To Arjun Mehta");
    expect(markup).toContain("lt-mail-body");
    // Two emails, two Edit buttons.
    expect(markup.match(/>Edit</g)).toHaveLength(2);
  });

  it("opens Outreach for the campaign, as a way on rather than a sentence", () => {
    const markup = body();
    expect(markup).toContain(`href="#/campaign/outreach?campaign=${CAMPAIGN}"`);
    expect(text(markup)).toContain("Open Outreach");
    expect(text(body(rowsOf({ emails }), null, { campaignId: null, campaignName: null }))).not.toContain("Open Outreach");
  });
});

describe("editing", () => {
  it("swaps the email for its subject and message fields, with Save and Cancel", () => {
    const markup = body(rowsOf({ emails }), { id: "m1", subject: "Senior Backend at Acme", body: "Hi Nandini", saving: false, problem: null });
    expect(markup).toContain("<textarea");
    expect(markup).toContain('value="Senior Backend at Acme"');
    expect(text(markup)).toContain("Save");
    expect(text(markup)).toContain("Cancel");
    // The other email stays as it was written.
    expect(text(markup)).toContain("To Arjun Mehta");
    expect(markup.match(/>Edit</g)).toHaveLength(1);
  });

  it("disables the fields while saving, and says why a save was refused", () => {
    const saving = body(rowsOf({ emails }), { id: "m1", subject: "S", body: "B", saving: true, problem: null });
    expect(saving).toContain("disabled");
    expect(text(saving)).toContain("Saving");
    const refused = body(rowsOf({ emails }), { id: "m1", subject: "S", body: "B", saving: false, problem: "This email has already gone out." });
    expect(refused).toContain('role="alert"');
    expect(text(refused)).toContain("This email has already gone out.");
  });

  it("will not save an empty message", () => {
    const markup = body(rowsOf({ emails }), { id: "m1", subject: "S", body: "   ", saving: false, problem: null });
    expect(markup).toMatch(/<button[^>]*class="rep-commit"[^>]*disabled/);
  });
});

describe("after the messages are read again", () => {
  const message = (over: Partial<Message>): Message => ({
    id: "m1", direction: "out", subject: "New subject", body: "New words", status: "draft", scheduledFor: null, sentAt: null, error: null, outcome: null, createdAt: "2026-10-20T10:00:00.000Z", ...over,
  });

  it("takes the words as they stand now", () => {
    const rows = mergeLive(rowsOf({ emails }), [message({})]);
    expect(rows[0]).toMatchObject({ subject: "New subject", body: "New words", status: "draft" });
    // A message not found is left as written.
    expect(rows[1]).toMatchObject({ subject: "", body: "Hi Arjun,\nA quick note.", status: "draft" });
  });

  it("says where an email that is no longer a draft stands, as plain text and with no Edit", () => {
    expect(statusWord("draft")).toBeNull();
    expect(statusWord("scheduled")).toBe("Scheduled");
    expect(statusWord("approved")).toBe("Going out");
    expect(statusWord("sending")).toBe("Going out");
    expect(statusWord("sent")).toBe("Sent");
    expect(statusWord("failed")).toBe("Didn't send");

    const rows = mergeLive(rowsOf({ emails }), [message({ status: "sent" }), message({ id: "m2", status: "scheduled", subject: null, body: "Hi Arjun" })]);
    const markup = body(rows);
    const said = text(markup);
    expect(said).toContain("Sent");
    expect(said).toContain("Scheduled");
    expect(markup).not.toContain(">Edit<");
    // Something has gone, so the card no longer says nothing has.
    expect(draftsSubline(card, rows)).toBe("Senior Backend");
    expect(said).not.toContain("Nothing has been sent");
  });
});

describe("arriving from the run", () => {
  const event = (over: Record<string, unknown>): RunEvent =>
    ({ seq: 1, runId: "r1", type: "artifact", at: "2026-10-20T10:00:00.000Z", ...over }) as unknown as RunEvent;
  const start = (): ChatState => {
    const turn = { ...newTurn("t1", "draft emails for the top two", 0), runId: "r1", status: "working" as const };
    return { conversationId: "c1", turns: [turn], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
  };
  const wire = { kind: "drafts", key: `drafts:${CAMPAIGN}:r1`, campaignId: CAMPAIGN, campaignName: "Senior Backend", emails };

  it("is kept as a card of the turn, not dropped as a kind nobody knows", () => {
    const next = applyEvent(start(), event(wire));
    const cards = next.turns[0]!.cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "drafts", campaignId: CAMPAIGN, campaignName: "Senior Backend" });
    expect((cards[0] as { emails: unknown[] }).emails).toHaveLength(2);
  });

  it("is drawn in the turn's cards with its emails", () => {
    const next = applyEvent(start(), event(wire));
    const said = text(renderToStaticMarkup(<Cards cards={next.turns[0]!.cards} />));
    expect(said).toContain("2 emails to look over");
    expect(said).toContain("To Nandini Rao");
  });

  it("keeps only emails that have their message and words", () => {
    expect(draftEmailsOf([{ messageId: "m1", to: "A", subject: "S", body: "B" }, { to: "B", body: "x" }, { messageId: "m3", to: "C", body: "" }, null, "x"])).toEqual([
      { messageId: "m1", to: "A", subject: "S", body: "B" },
    ]);
    expect(draftEmailsOf(undefined)).toEqual([]);
    const next = applyEvent(start(), event({ ...wire, emails: [] }));
    expect(next.turns[0]!.cards).toHaveLength(0);
  });

  it("replaces the first when the same drafts are looked up again", () => {
    const first = applyEvent(start(), event(wire));
    const again = applyEvent(first, event({ ...wire, seq: 2, emails: [emails[0]] }));
    expect(again.turns[0]!.cards).toHaveLength(1);
    expect((again.turns[0]!.cards[0] as { emails: unknown[] }).emails).toHaveLength(1);
  });
});

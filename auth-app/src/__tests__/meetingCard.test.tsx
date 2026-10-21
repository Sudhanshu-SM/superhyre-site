import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "../api/events";
import type { Connections, GoogleConnection } from "../api/identity";
import type { Approval, ChatState } from "../liveChat";

/**
 * A meeting that waits for a yes, in every state: who is invited and when (in the person's zone), the Meet switch, the
 * other times inside the card, the Google trouble with its link, the access to add, and what it settles to.
 */

const { server } = vi.hoisted(() => ({ server: { reply: null as unknown } }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => server.reply };
});
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));

const store = await import("../connectionsStore");
const { ApprovalCard } = await import("../agentCards/ApprovalCard");
const { SlotsCard, bookText } = await import("../agentCards/SlotsCard");
const model = await import("../agentCards/meetingModel");
const { applyEvent, newTurn, meetingOf, slotsOf } = await import("../liveChat");
const { EmailNeededCard } = await import("../agentCards/EmailNeededCard");
const { LiveTurnBody, connectShownFor } = await import("../LiveTurn");

const GOOGLE: GoogleConnection = {
  available: true, status: "connected", accountEmail: "ana@hirewell.in", scopes: [], products: ["gmail", "sheets", "calendar", "tasks"], connectedAt: "2026-10-21T00:00:00Z",
};
async function serverSays(google: Partial<GoogleConnection>): Promise<void> {
  server.reply = { google: { ...GOOGLE, ...google }, slack: null, notion: null, providers: {} } satisfies Connections;
  await store.reloadConnections();
}
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

let nextId = 0;
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: ++nextId, runId: "r1", seq: ++nextId, type, at: "2026-10-21T10:00:05.000Z",
});
const MEETING = {
  kind: "interview", title: "Interview: Asha Verma", startsAt: "2026-10-23T09:30:00.000Z", endsAt: "2026-10-23T10:15:00.000Z",
  timezone: "Asia/Kolkata", durationMinutes: 45, meet: true, guests: [{ name: "Asha Verma", role: "candidate" }, { name: "Ravi Iyer", role: "team" }], busy: false,
};
const SLOTS = [
  { startsAt: "2026-10-23T05:30:00.000Z", endsAt: "2026-10-23T06:15:00.000Z", when: "Fri 23 Oct 2026, 11:00 am IST" },
  { startsAt: "2026-10-26T04:30:00.000Z", endsAt: "2026-10-26T05:15:00.000Z", when: "Mon 26 Oct 2026, 10:00 am IST" },
];
function waiting(extra: Record<string, unknown> = {}, action: Record<string, unknown> = { action: "meeting" }): ChatState {
  const turn = { ...newTurn("t1", "Book Asha", 0), runId: "r1", status: "working" as const };
  const s: ChatState = { conversationId: "c1", turns: [turn], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
  return applyEvent(s, ev("approval", {
    summary: 'Invite Asha Verma, Ravi Iyer to "Interview: Asha Verma"', action, campaignName: "Senior Backend", people: [],
    capability: "meetings.interview", meeting: MEETING, slots: SLOTS, notes: [], ...extra,
  }));
}
const approval = (s: ChatState): Approval => s.turns[0]!.approvals[0]!;
const answered = (s: ChatState, result: Record<string, unknown>): Approval =>
  applyEvent(s, ev("result", { approvalSeq: approval(s).seq, ...result })).turns[0]!.approvals[0]!;
const draw = (a: Approval) => renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={a} turnSaid="Book Asha" />);

beforeEach(async () => { await serverSays({}); });

describe("what the server sends for a meeting", () => {
  it("is read into a draft with its guests, zone and other times, and nothing else", () => {
    const a = approval(waiting());
    expect(a.meeting).toMatchObject({ kind: "interview", title: "Interview: Asha Verma", timezone: "Asia/Kolkata", durationMinutes: 45, meet: true, busy: false });
    expect(a.meeting?.guests).toEqual([{ name: "Asha Verma", role: "candidate" }, { name: "Ravi Iyer", role: "team" }]);
    expect(a.slots).toHaveLength(2);
    expect(meetingOf({ title: "x" })).toBeNull();
    expect(slotsOf([{ startsAt: "never", endsAt: "x" }, { startsAt: SLOTS[0]!.startsAt, endsAt: SLOTS[0]!.endsAt }])).toHaveLength(1);
  });
});

describe("waiting for the yes", () => {
  it("asks about the person, says when in their zone, who is invited, and offers the Meet link", () => {
    const t = text(draw(approval(waiting())));
    expect(t).toContain("Invite Asha to an interview?");
    expect(t).toContain("Interview: Asha Verma");
    expect(t).toContain("Fri 23 Oct, 3:00 pm IST");
    expect(t).toContain("45 min");
    expect(t).toContain("Asha Verma (candidate), Ravi Iyer");
    expect(t).toContain("Google Meet link");
    expect(draw(approval(waiting()))).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(t).toContain("Send invite");
    expect(t).toContain("Pick another time");
    expect(t).toContain("Not now");
  });

  it("starts with the Meet switch off for an ordinary meeting, and has no switch for a move or a cancellation", () => {
    const off = approval(waiting({ meeting: { ...MEETING, kind: "meeting", meet: false } }));
    expect(draw(off)).toMatch(/aria-checked="false"/);
    const move = approval(waiting({ meeting: { ...MEETING, was: { startsAt: "2026-10-22T09:30:00.000Z", endsAt: "2026-10-22T10:00:00.000Z" } } }, { action: "meeting_move" }));
    expect(text(draw(move))).toContain("Move this meeting?");
    expect(text(draw(move))).toContain("Now Thu 22 Oct, 3:00 pm IST");
    expect(text(draw(move))).toContain("Move it");
    expect(draw(move)).not.toContain('role="switch"');
    const cancel = approval(waiting({ meeting: { ...MEETING, cancel: true } }, { action: "meeting_cancel" }));
    expect(text(draw(cancel))).toContain("Cancel this meeting?");
    expect(text(draw(cancel))).toContain("They will be told Asha Verma (candidate), Ravi Iyer");
    expect(text(draw(cancel))).toContain("Cancel meeting");
    expect(text(draw(cancel))).not.toContain("Pick another time");
  });

  it("says in colour that the person is busy then", () => {
    const t = text(draw(approval(waiting({ meeting: { ...MEETING, busy: true } }))));
    expect(t).toContain("You're busy then on your own calendar.");
  });

  it("has no other times to pick when the card carries none", () => {
    const t = text(draw(approval(waiting({ slots: [] }))));
    expect(t).not.toContain("Pick another time");
  });

  it("says what the yes is doing while it works", () => {
    const a = { ...approval(waiting()), deciding: true };
    expect(text(draw(a))).toContain("Sending…");
    expect(text(draw({ ...approval(waiting({}, { action: "meeting_cancel" })), deciding: true }))).toContain("Cancelling…");
  });

  it("asks for Calendar access inside the card when it isn't allowed yet, and never a Gmail one", async () => {
    await serverSays({ products: ["gmail", "sheets"] });
    const markup = draw(approval(waiting({ connect: ["google"], notes: ["Google Calendar access isn't added yet, so this can't be sent until it is."] })));
    const t = text(markup);
    expect(t).toContain("Add Calendar access");
    expect(t).not.toContain("Connect Gmail");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Send invite<\/button>/);
  });

  it("leaves the asking to the turn's own connect card, saying nothing of its own and holding the yes with its words unchanged", async () => {
    await serverSays({ status: "expired" });
    const a: Approval = {
      ...approval(waiting({ connect: ["google"], notes: ["Google Calendar access isn't added yet, so this can't be sent until it is."] })),
      error: "Google Calendar needs to be reconnected, so nothing was changed.",
    };
    const own = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={a} turnSaid="Book Asha" />);
    expect(text(own)).toContain("Reconnect Google Calendar");
    const shown = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={a} turnSaid="Book Asha" connectShown={["google"]} />);
    expect(text(shown)).not.toContain("Reconnect");
    expect(text(shown)).not.toContain("until it is");
    expect(text(shown)).not.toContain("needs to be reconnected");
    expect(shown).toMatch(/<button[^>]*disabled=""[^>]*>Send invite<\/button>/);
    // With the access there it is free again.
    await serverSays({});
    expect(renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={a} turnSaid="Book Asha" connectShown={["google"]} />)).not.toMatch(/<button[^>]*disabled=""[^>]*>Send invite<\/button>/);
  });

  it("counts a Google connect card as asking for a meeting's access only when it asks for Calendar or Tasks", () => {
    const card = (products: Array<"gmail" | "calendar" | "tasks">) =>
      ({ kind: "connect", key: "k", provider: "google", url: null, mode: null, field: null, reason: null, retryText: null, waiting: true, label: null, products }) as never;
    const meeting = approval(waiting());
    expect(connectShownFor(meeting, [card(["calendar"])])).toEqual(["google"]);
    expect(connectShownFor(meeting, [card(["gmail"])])).toEqual([]);
    expect(connectShownFor(meeting, [card(["tasks"])])).toEqual([]);
    expect(connectShownFor({ ...meeting, action: "reminder", detail: { where: "google_tasks" } }, [card(["tasks"])])).toEqual(["google"]);
    // An email approval counts any card for the same connection.
    expect(connectShownFor({ ...meeting, action: "send_email" }, [card([])])).toEqual(["google"]);
  });

  it("does not ask for access that is already there", async () => {
    const t = text(draw(approval(waiting({ connect: ["google"] }))));
    expect(t).not.toContain("Add Calendar access");
  });

  it("says what Google said, plainly, with the page to fix it, and offers Try again", () => {
    const failed: Approval = {
      ...approval(waiting()),
      error: "Google Calendar isn't switched on for the Google project this app signs in with yet. Someone with access to that Google Cloud project has to enable the Google Calendar API there, then try again.",
      help: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    };
    const markup = draw(failed);
    expect(text(markup)).toContain("isn't switched on for the Google project");
    expect(markup).toContain('href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"');
    expect(text(markup)).toContain("Open Google Cloud");
    expect(text(markup)).toContain("Try again");
  });
});

describe("what the yes sends", () => {
  it("is the place of a chosen time and the Meet link only when it was changed", () => {
    const a = approval(waiting());
    expect(model.editOf(a, { meet: true, slot: null })).toEqual({});
    expect(model.editOf(a, { meet: false, slot: null })).toEqual({ meet: false });
    expect(model.editOf(a, { meet: true, slot: 1 })).toEqual({ slot: 1 });
    expect(model.editOf(a, { meet: false, slot: 0 })).toEqual({ slot: 0, meet: false });
    const move = approval(waiting({}, { action: "meeting_move" }));
    expect(model.editOf(move, { meet: false, slot: 1 })).toEqual({});
  });
});

describe("once the access the card waited for is there", () => {
  const NOTE = "Google Calendar access isn't added yet, so this can't be sent until it is.";

  it("drops the note that says it is missing, and the connect card, and lets the yes go", async () => {
    await serverSays({ products: ["gmail", "sheets"] });
    const before = draw(approval(waiting({ connect: ["google"], notes: [NOTE] })));
    expect(text(before)).toContain("access isn't added yet");
    await serverSays({});
    const after = draw(approval(waiting({ connect: ["google"], notes: [NOTE, "You're free then."] })));
    expect(text(after)).not.toContain("isn't added yet");
    expect(text(after)).not.toContain("Add Calendar access");
    expect(text(after)).toContain("You're free then.");
    expect(after).not.toMatch(/<button[^>]*disabled=""[^>]*>Send invite<\/button>/);
  });

  it("drops the refusal that said the connection had lapsed, and offers the yes, not Try again", async () => {
    const lapsed: Approval = { ...approval(waiting()), error: "Google Calendar needs to be reconnected, so nothing was changed." };
    await serverSays({ status: "expired" });
    expect(text(draw(lapsed))).toContain("needs to be reconnected");
    await serverSays({});
    const t = text(draw(lapsed));
    expect(t).not.toContain("needs to be reconnected");
    expect(t).toContain("Send invite");
    expect(t).not.toContain("Try again");
  });

  it("leaves a different trouble where it is", async () => {
    const other: Approval = { ...approval(waiting()), error: "Google Calendar is not answering. Try again in a minute." };
    expect(text(draw(other))).toContain("is not answering");
  });

  it("says nothing stale under 'Invited' once it went", () => {
    const a = answered(waiting(), {
      decision: "approve", action: "meeting", summary: "Invited 2 people.",
      meeting: { id: "m1", startsAt: "2026-10-23T09:30:00.000Z", timezone: "Asia/Kolkata" },
      notes: [NOTE, "Ravi has no email, so he was not invited."],
    });
    const t = text(draw(a));
    expect(t).toContain("Invited: Fri 23 Oct, 3:00 pm IST");
    expect(t).not.toContain("isn't added yet");
    expect(t).toContain("Ravi has no email");
  });

  it("takes the agent's sentence about connecting first out of its words, and no other", () => {
    const said = "Google Calendar needs to be connected first. I found Friday at 3 pm. Gmail needs to be connected before the email goes.";
    expect(model.withoutMetAccess(said)).toBe("I found Friday at 3 pm. Gmail needs to be connected before the email goes.");
    expect(model.withoutMetAccess("Reconnect Google first, then I can book it.\nFriday at 3 pm is free.")).toBe("Friday at 3 pm is free.");
    expect(model.withoutMetAccess("Booked for Friday.")).toBe("Booked for Friday.");
  });

  it("works out which part of Google the turn's cards need", () => {
    expect(model.productsNeeded([{ action: "meeting", detail: {} }, { action: "email", detail: {} }])).toEqual(["calendar"]);
    expect(model.productsNeeded([{ action: "reminder", detail: { where: "google_tasks" } }])).toEqual(["tasks"]);
    expect(model.productsNeeded([{ action: "schedule", detail: {} }])).toEqual([]);
  });

  it("is not said above the card once the connection is there, or the card was answered", async () => {
    const reply = "Google Calendar needs to be connected first. Here is the invitation.";
    const waitingState = waiting({ connect: ["google"], notes: [NOTE] }).turns[0]!;
    const show = (turn: typeof waitingState) =>
      text(renderToStaticMarkup(<LiveTurnBody turn={{ ...turn, status: "done", reply }} onAnswer={() => {}} />));
    await serverSays({ products: ["gmail", "sheets"] });
    expect(show(waitingState)).toContain("needs to be connected first");
    await serverSays({});
    expect(show(waitingState)).not.toContain("needs to be connected first");
    expect(show(waitingState)).toContain("Here is the invitation.");
    const sent = answered(waiting(), { decision: "approve", action: "meeting", summary: "Invited 2 people.", meeting: { id: "m1", startsAt: "2026-10-23T09:30:00.000Z", timezone: "Asia/Kolkata" } });
    await serverSays({ products: ["gmail", "sheets"] });
    expect(show({ ...waitingState, approvals: [sent] })).not.toContain("needs to be connected first");
  });
});

describe("settled", () => {
  it("is 'Invited: Fri 23 Oct, 3:00 pm', with the Meet link, Add to calendar and the next steps as buttons", () => {
    const a = answered(waiting(), {
      decision: "approve", action: "meeting", summary: "Invited 2 people.",
      meeting: { id: "m1", startsAt: "2026-10-23T09:30:00.000Z", timezone: "Asia/Kolkata", meetUrl: "https://meet.google.com/abc-defg-hij", eventUrl: "https://calendar.example/e1" },
      next: [
        { label: "Open in Google Calendar", href: "https://calendar.example/e1" },
        { label: "Move to Interviewing", text: "Move Asha Verma to Interviewing" },
        { label: "Add a note", text: "Add a note to Asha Verma: interview on Fri 23 Oct" },
      ],
    });
    const markup = draw(a);
    const t = text(markup);
    expect(t).toContain("Invited: Fri 23 Oct, 3:00 pm IST");
    expect(t).not.toContain("Send invite");
    expect(t).not.toContain("Pick another time");
    expect(t).toContain("meet.google.com/abc-defg-hij");
    expect(markup).toContain('href="https://calendar.example/e1"');
    expect(t).toContain("Open in Google Calendar");
    expect(t).not.toContain("Add to calendar");
    expect(t).toContain("Move to Interviewing");
    expect(t).toContain("Add a note");
  });

  it("says Moved and Cancelled for those, and a quiet 'Not sent.' when declined", () => {
    const moved = answered(waiting({}, { action: "meeting_move" }), { decision: "approve", action: "meeting_move", meeting: { startsAt: "2026-10-26T04:30:00.000Z", timezone: "Asia/Kolkata" } });
    expect(text(draw(moved))).toContain("Moved to: Mon 26 Oct, 10:00 am IST");
    const cancelled = answered(waiting({}, { action: "meeting_cancel" }), { decision: "approve", action: "meeting_cancel", meeting: { startsAt: "2026-10-23T09:30:00.000Z", timezone: "Asia/Kolkata", cancelled: true } });
    expect(text(draw(cancelled))).toContain("Cancelled: Fri 23 Oct, 3:00 pm IST");
    expect(text(draw(answered(waiting(), { decision: "decline" })))).toBe("Not sent.");
    expect(text(draw(answered(waiting({}, { action: "meeting_cancel" }), { decision: "decline" })))).toBe("Not cancelled.");
  });

  it("is the time the person picked, not the one first proposed", () => {
    const a = answered(waiting(), { decision: "approve", action: "meeting", meeting: { startsAt: SLOTS[1]!.startsAt, timezone: "Asia/Kolkata" } });
    expect(text(draw(a))).toContain("Invited: Mon 26 Oct, 10:00 am IST");
  });
});

describe("a reminder", () => {
  it("is asked about plainly and settles to a line, with its links", () => {
    const reminder = { action: "reminder", where: "google_tasks" };
    const a = approval(waiting({ meeting: undefined, slots: undefined, summary: 'Remind you Fri 23 Oct 2026, 9:00 am IST: "Check references" (in your Google Tasks)', notes: ["Google Tasks keeps the day, not the time of day."] }, reminder));
    const t = text(draw(a));
    expect(t).toContain("Set this reminder?");
    expect(t).toContain('Remind you Fri 23 Oct 2026, 9:00 am IST: "Check references" (in your Google Tasks)');
    expect(t).toContain("Google Tasks keeps the day, not the time of day.");
    expect(t).toContain("Set reminder");
    const done = answered(waiting({ meeting: undefined }, reminder), { decision: "approve", action: "reminder", summary: "I'll remind you.", next: [{ label: "Open Google Tasks", href: "https://tasks.example/t1" }] });
    expect(text(draw(done))).toContain("Reminder set");
    expect(draw(done)).toContain('href="https://tasks.example/t1"');
  });
});

describe("the wording", () => {
  it("measures a meeting in the words a person uses", () => {
    expect(model.lengthWords(30)).toBe("30 min");
    expect(model.lengthWords(60)).toBe("1 hr");
    expect(model.lengthWords(75)).toBe("1 hr 15 min");
    expect(model.zoneName("2026-10-23T09:30:00.000Z", "Asia/Kolkata")).toBe("IST");
    expect(model.guestsLine([{ name: "Asha", role: "candidate" }, { name: "Meera", role: "other" }])).toBe("Asha (candidate), Meera");
    expect(model.slotLabel("2026-10-26T04:30:00.000Z", "Asia/Kolkata")).toBe("Mon 26 Oct, 10 am");
  });
});

describe("free times", () => {
  const card = {
    kind: "slots" as const, key: "slots:a", timezone: "Asia/Kolkata", durationMinutes: 30, forName: "Asha Verma", campaignId: "c1", campaignCandidateId: "cc1",
    slots: [
      { startsAt: "2026-10-23T05:30:00.000Z", endsAt: "2026-10-23T06:00:00.000Z", when: "Fri 23 Oct 2026, 11:00 am IST" },
      { startsAt: "2026-10-23T08:30:00.000Z", endsAt: "2026-10-23T09:00:00.000Z", when: "Fri 23 Oct 2026, 2:00 pm IST" },
      { startsAt: "2026-10-26T04:30:00.000Z", endsAt: "2026-10-26T05:00:00.000Z", when: "Mon 26 Oct 2026, 10:00 am IST" },
    ],
    assumed: ["start of the working day", "working days"],
  };

  it("groups the times by day, with who they are for, and says the hours were the usual ones", () => {
    const markup = renderToStaticMarkup(<SlotsCard card={card} />);
    const t = text(markup);
    expect(t).toContain("Free times for Asha Verma");
    expect(t).toContain("30 min each");
    expect(t).toContain("Fri 23 Oct 11 am 2 pm");
    expect(t).toContain("Mon 26 Oct 10 am");
    expect(t).toContain("These use the usual working hours. Tell me yours and I'll remember them.");
  });

  it("says nothing about hours when they were all stated", () => {
    expect(text(renderToStaticMarkup(<SlotsCard card={{ ...card, assumed: ["time between meetings"] }} />))).not.toContain("usual working hours");
  });

  it("asks the agent to book the time picked, with the instant spelled out", () => {
    expect(bookText(card, card.slots[0]!.startsAt, card.slots[0]!.when)).toBe(
      "Book the interview with Asha Verma on Fri 23 Oct 2026, 11:00 am IST (2026-10-23T05:30:00.000Z)",
    );
    expect(bookText({ forName: null }, card.slots[0]!.startsAt, "Fri 23 Oct 2026, 11:00 am IST")).toContain("Book the meeting on");
  });
});

describe("someone with no email", () => {
  const card = { kind: "need_email" as const, key: "need_email:cc1", campaignCandidateId: "cc1", candidateId: "c1", campaignId: "camp1", name: "Lakshmi Bansal" };

  it("says so plainly and offers both ways on, and names no tool", () => {
    const markup = renderToStaticMarkup(<EmailNeededCard card={card} />);
    const t = text(markup);
    expect(t).toContain("Lakshmi has no email yet");
    expect(t).toContain("An invitation needs an address. Look it up, or add it yourself.");
    expect(t).toContain("Look up email");
    expect(t).toContain("Add email");
    expect(t).not.toMatch(/\b[a-z]+_[a-z]+\b/);
    // The field appears when asked for, not before.
    expect(markup).not.toContain("<input");
  });

  it("checks an address before it is saved, in plain words", () => {
    expect(model.candidateEmailProblem("")).toBe("Enter their email address.");
    expect(model.candidateEmailProblem("lakshmi")).toBe("That doesn't look like an email yet.");
    expect(model.candidateEmailProblem("lakshmi@")).toBe("That doesn't look like an email yet.");
    expect(model.candidateEmailProblem("a b@c.in")).toBe("That doesn't look like an email yet.");
    expect(model.candidateEmailProblem(" lakshmi@gmail.com ")).toBeNull();
    expect(model.candidateEmailProblem("lakshmi.b@acme.co.in")).toBeNull();
  });

  it("is read from the server's card, and dropped without the ids it needs", () => {
    const s = applyEvent(
      { conversationId: "c", turns: [{ ...newTurn("t1", "x", 0), runId: "r1", status: "working" as const }], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null },
      ev("artifact", { kind: "need_email", key: "k", campaignCandidateId: "cc1", candidateId: "c1", campaignId: "camp1", name: "Lakshmi Bansal" }),
    );
    expect(s.turns[0]?.cards).toEqual([card.kind === "need_email" ? { ...card, key: "k" } : card]);
    const none = applyEvent(s, ev("artifact", { kind: "need_email", key: "k2", name: "x" }));
    expect(none.turns[0]?.cards).toHaveLength(1);
  });
});

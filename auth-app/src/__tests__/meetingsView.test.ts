import { describe, expect, it } from "vitest";
import { meetingOf } from "../api/meetings";
import type { Meeting } from "../api/meetings";
import { cardLine, clock, dayWords, fullWhen, isInterview, shortWhen, upcoming, withWhom } from "../meetingsView";

/** How a meeting reads on the page: the time in the organiser's own zone, short when it is soon. */

const IST = "Asia/Kolkata";
const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: "m1", campaignId: "c1", campaignName: "Senior Backend", campaignCandidateId: "cc1", candidateName: "Asha Verma", organizerName: "Ana Rao",
  mine: true, title: "Interview: Asha Verma", startsAt: "2026-10-21T09:30:00.000Z", endsAt: "2026-10-21T10:15:00.000Z", timezone: IST,
  meetUrl: "https://meet.google.com/abc-defg-hij", eventUrl: "https://calendar.example/e", status: "scheduled", attendees: [], ...over,
});
/** Monday 19 Oct 2026, 9 am in India. */
const NOW = Date.parse("2026-10-19T03:30:00.000Z");

describe("a time in the organiser's zone", () => {
  it("is said the way a person says it", () => {
    expect(clock("2026-10-21T09:30:00.000Z", IST)).toBe("3 pm");
    expect(clock("2026-10-21T10:00:00.000Z", IST)).toBe("3:30 pm");
    expect(dayWords("2026-10-21T09:30:00.000Z", IST)).toBe("Wed 21 Oct");
    expect(fullWhen("2026-10-21T09:30:00.000Z", IST)).toBe("Wed 21 Oct, 3:00 pm IST");
  });

  it("follows the zone, across a day and across the clocks changing", () => {
    // 3 pm in India is 5:30 am in New York in summer time, the day before 'Wed' there is still Wed.
    expect(fullWhen("2026-10-21T09:30:00.000Z", "America/New_York")).toBe("Wed 21 Oct, 5:30 am GMT-4");
    expect(fullWhen("2026-11-02T09:30:00.000Z", "America/New_York")).toBe("Mon 2 Nov, 4:30 am GMT-5");
    expect(fullWhen("2026-10-20T20:00:00.000Z", IST)).toBe("Wed 21 Oct, 1:30 am IST");
  });
});

describe("short when", () => {
  it("says today and tomorrow, the weekday within the week, and the date after that", () => {
    expect(shortWhen("2026-10-19T09:30:00.000Z", IST, NOW)).toBe("Today, 3 pm");
    expect(shortWhen("2026-10-20T09:30:00.000Z", IST, NOW)).toBe("Tomorrow, 3 pm");
    expect(shortWhen("2026-10-21T09:30:00.000Z", IST, NOW)).toBe("Wed 3 pm");
    expect(shortWhen("2026-10-27T09:30:00.000Z", IST, NOW)).toBe("Tue 27 Oct, 3 pm");
  });

  it("counts days in the meeting's own zone, not the viewer's", () => {
    // 11 pm in New York on the 19th is already the 20th in India.
    expect(shortWhen("2026-10-20T03:00:00.000Z", "America/New_York", Date.parse("2026-10-19T12:00:00.000Z"))).toBe("Today, 11 pm");
  });
});

describe("the line on a person's card", () => {
  it("names the next meeting, soonest first, and says interview only for an interview", () => {
    const later = meeting({ id: "m2", startsAt: "2026-10-23T09:30:00.000Z", endsAt: "2026-10-23T10:00:00.000Z" });
    expect(cardLine([later, meeting()], NOW)).toBe("Interview Wed 3 pm");
    expect(cardLine([meeting({ title: "Call about the offer" })], NOW)).toBe("Meeting Wed 3 pm");
    expect(cardLine([meeting({ startsAt: "2026-10-19T09:30:00.000Z", endsAt: "2026-10-19T10:00:00.000Z" })], NOW)).toBe("Interview today 3 pm");
    expect(cardLine([meeting({ startsAt: "2026-10-20T09:30:00.000Z", endsAt: "2026-10-20T10:00:00.000Z" })], NOW)).toBe("Interview tomorrow 3 pm");
  });

  it("says nothing for a cancelled meeting or one that is over", () => {
    expect(cardLine([meeting({ status: "cancelled" })], NOW)).toBeNull();
    expect(cardLine([meeting()], Date.parse("2026-10-22T00:00:00.000Z"))).toBeNull();
    expect(cardLine([], NOW)).toBeNull();
    expect(upcoming([meeting({ status: "cancelled" }), meeting({ id: "m3" })], NOW).map((m) => m.id)).toEqual(["m3"]);
  });

  it("tells an interview by its title and names who it is with", () => {
    expect(isInterview(meeting())).toBe(true);
    expect(isInterview(meeting({ title: "Panel with the client" }))).toBe(false);
    expect(withWhom(meeting())).toBe("Asha Verma");
    expect(withWhom(meeting({ candidateName: null, attendees: [{ name: "Meera", email: null, kind: "other" }] }))).toBe("Meera");
    expect(withWhom(meeting({ candidateName: null }))).toBeNull();
  });
});

describe("a meeting from the server", () => {
  it("is read with what a page needs and nothing it can't use", () => {
    const m = meetingOf({
      id: "m1", title: "Panel", startsAt: "2026-10-21T09:30:00.000Z", endsAt: "2026-10-21T10:00:00.000Z", timezone: IST, mine: true, status: "scheduled",
      attendees: [{ name: "Asha", email: "asha@example.com", kind: "candidate" }, { name: null, email: null, kind: "mystery" }, "junk"],
      secretField: "x",
    });
    expect(m).toMatchObject({ id: "m1", mine: true, attendees: [{ name: "Asha", email: "asha@example.com", kind: "candidate" }, { name: null, email: null, kind: "other" }] });
    expect(m).not.toHaveProperty("secretField");
  });

  it("is dropped when it has no id or a time that isn't one", () => {
    expect(meetingOf({ title: "x" })).toBeNull();
    expect(meetingOf({ id: "m", startsAt: "soon", endsAt: "later" })).toBeNull();
    expect(meetingOf(null)).toBeNull();
  });
});

describe("the campaign's log", () => {
  const NOW_MS = Date.parse("2026-10-19T12:00:00Z");
  const ago = (min: number) => new Date(NOW_MS - min * 60000).toISOString();
  const row = (over: Record<string, unknown>) => ({
    id: "1", subjectKind: "candidate", subjectId: "cand1", subjectName: "Asha Verma", verb: "meeting_scheduled",
    actorKind: "user", actorId: "u1", actorName: "Ana Rao", data: {}, at: ago(5), ...over,
  }) as never;
  it("says an interview was set up with the person, a meeting moved, and one cancelled", async () => {
    const { logLine } = await import("../api/campaigns");
    const says = (a: never) => {
      const l = logLine(a, "u9", (id) => (id === "cand1" ? "cc1" : undefined), NOW_MS);
      return l ? [l.actor, l.verb, l.person?.name].filter(Boolean).join(" ") : null;
    };
    expect(says(row({ data: { kind: "interview" } }))).toBe("Ana Rao scheduled an interview with Asha Verma");
    expect(says(row({ data: { kind: "meeting" } }))).toBe("Ana Rao scheduled a meeting with Asha Verma");
    expect(says(row({ subjectKind: "campaign", verb: "meeting_moved" }))).toBe("Ana Rao moved a meeting");
    expect(says(row({ subjectKind: "campaign", verb: "meeting_cancelled" }))).toBe("Ana Rao cancelled a meeting");
  });
});

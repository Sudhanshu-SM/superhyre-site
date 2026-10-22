import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type CalendarEvent, calendarEventOf } from "../api/calendar";
import type { ScheduledItem } from "../api/schedules";
import { List } from "../ComingUp";
import { dateWhen } from "../meetingsView";
import type { Feed } from "../schedulesStore";
import { UPCOMING } from "../schedulesStore";

/**
 * The person's own Google Calendar events are on Coming up among the agent's reminders and the meetings it booked,
 * by their time, said in the person's own zone.
 */

const NOW = Date.parse("2026-10-10T09:00:00Z"); // 2:30 pm in Kolkata
const ZONE = "Asia/Kolkata";
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1", title: "Dentist", startsAt: at(3), endsAt: at(4), allDay: false, location: null, meetUrl: null, eventUrl: null, guests: 0, ...over,
});
const reminder = (hours: number): ScheduledItem => ({
  id: `s${hours}`, kind: "reminder", title: `Reminder ${hours}`, status: "scheduled", runAt: at(hours), nextRunAt: at(hours),
  timezone: ZONE, repeat: "none", until: null, occurrencesDone: 0, summary: `Reminder: 'Call person ${hours}'`, campaign: null,
  candidate: null, createdBy: { kind: "user", id: "u1", name: "Asha Rao" }, approvedBy: null, lastError: null, lastRunAt: null,
  result: null, canCancel: true,
});
const feed = (items: ScheduledItem[]): Feed => ({ phase: "ready", items, next: null, more: "idle", at: NOW });

const render = (items: ScheduledItem[], calendar: CalendarEvent[]) =>
  renderToStaticMarkup(
    <List feed={feed(items)} query={UPCOMING} empty="upcoming" filtered={false} viewerId="u1" zone={ZONE} now={NOW}
      onClear={() => undefined} limit={5} compact calendar={calendar} />,
  );

describe("Google Calendar events on Coming up", () => {
  it("are rows of their own, marked as the person's calendar, with where and how many", () => {
    const html = render([], [event({ location: "Clinic, Indiranagar", guests: 2 })]);
    expect(html).toContain("Dentist");
    expect(html).toContain("Your calendar · Clinic, Indiranagar · 2 guests");
    expect(html).toContain('class="sc-row is-calendar"');
    expect(html).not.toContain("Nothing coming up");
  });

  it("are among the reminders by their time", () => {
    const html = render([reminder(1), reminder(6)], [event({ startsAt: at(3), endsAt: at(4) })]);
    expect(html.indexOf("person 1&#x27;")).toBeLessThan(html.indexOf("Dentist"));
    expect(html.indexOf("Dentist")).toBeLessThan(html.indexOf("person 6&#x27;"));
  });

  it("say Join for a video call and give a way to the event in Google Calendar", () => {
    const html = render([], [event({ meetUrl: "https://meet.google.com/abc", eventUrl: "https://calendar.google.com/e/1" })]);
    expect(html).toContain('href="https://meet.google.com/abc"');
    expect(html).toContain(">Join<");
    expect(html).toContain('href="https://calendar.google.com/e/1"');
  });

  it("read as all day, by date, when they have no time", () => {
    const html = render([], [event({ title: "Diwali", allDay: true, startsAt: "2026-10-11", endsAt: "2026-10-12" })]);
    expect(html).toContain("Tomorrow");
    expect(html).toContain("All day");
  });

  it("put an all-day event first among its day's", () => {
    const html = render([reminder(1)], [event({ title: "Offsite", allDay: true, startsAt: "2026-10-10", endsAt: "2026-10-11" })]);
    expect(html.indexOf("Offsite")).toBeLessThan(html.indexOf("person 1&#x27;"));
  });
});

describe("a day without a time", () => {
  it("is said as a list says a day", () => {
    expect(dateWhen("2026-10-10", ZONE, NOW)).toBe("Today");
    expect(dateWhen("2026-10-11", ZONE, NOW)).toBe("Tomorrow");
    expect(dateWhen("2026-10-14", ZONE, NOW)).toBe("Wed");
    expect(dateWhen("2026-10-25", ZONE, NOW)).toBe("Sun 25 Oct");
  });
});

describe("an event from the server", () => {
  it("is read when it has an id and a start, and left out when it has not", () => {
    expect(calendarEventOf({ id: "a", title: " ", startsAt: at(1), endsAt: at(2), allDay: false, guests: 3 })).toMatchObject({
      id: "a", title: "Busy", guests: 3, allDay: false,
    });
    expect(calendarEventOf({ title: "x", startsAt: at(1), endsAt: at(2) })).toBeNull();
    expect(calendarEventOf({ id: "a", startsAt: "not a time", endsAt: at(2) })).toBeNull();
    expect(calendarEventOf(null)).toBeNull();
  });
});

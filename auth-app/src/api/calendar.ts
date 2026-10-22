import { api } from "./client";

/**
 * What is coming up on the signed-in person's own Google Calendar (server: `GET /v1/calendar/events`). Theirs alone,
 * read from Google when asked and not kept; what SuperHyre booked is left out, it comes from the meetings record.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  /** An instant, or a date (`2026-10-25`) for an all-day event. */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  meetUrl: string | null;
  eventUrl: string | null;
  guests: number;
};

export type CalendarAnswer = {
  /** False when the person has not linked Google Calendar (or the link has lapsed): there is nothing to show yet. */
  connected: boolean;
  events: CalendarEvent[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** One event from the server, or null when it lacks what a row needs. */
export function calendarEventOf(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const startsAt = str(r.startsAt);
  const endsAt = str(r.endsAt);
  if (!id || !startsAt || !endsAt || Number.isNaN(Date.parse(startsAt))) return null;
  return {
    id,
    title: str(r.title) ?? "Busy",
    startsAt,
    endsAt,
    allDay: r.allDay === true,
    location: str(r.location),
    meetUrl: str(r.meetUrl),
    eventUrl: str(r.eventUrl),
    guests: typeof r.guests === "number" && r.guests > 0 ? Math.floor(r.guests) : 0,
  };
}

export const calendarApi = {
  events: async (days = 14, limit = 20): Promise<CalendarAnswer> => {
    const body = await api<{ connected?: unknown; events?: unknown }>(
      "GET",
      `/v1/calendar/events?days=${days}&limit=${limit}`,
    );
    return {
      connected: body.connected === true,
      events: (Array.isArray(body.events) ? body.events : []).flatMap((e) => {
        const event = calendarEventOf(e);
        return event ? [event] : [];
      }),
    };
  },
};

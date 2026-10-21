import { api } from "./client";

/**
 * Meetings and interviews the agent put on the person's Google Calendar, as the API serves them from SuperHyre's own
 * record (server: modules/meetings, `GET /v1/meetings`). Nothing here asks Google.
 */

export type MeetingStatus = "scheduled" | "cancelled" | "done" | "failed";

export type Meeting = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  campaignCandidateId: string | null;
  candidateName: string | null;
  organizerName: string | null;
  /** The signed-in person set it up. */
  mine: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  /** The organiser's own zone: the time reads in it. */
  timezone: string;
  meetUrl: string | null;
  eventUrl: string | null;
  status: MeetingStatus;
  /** An address is only there for the person who set it up. */
  attendees: Array<{ name: string | null; email: string | null; kind: "candidate" | "team" | "other" }>;
};

export type MeetingQuery = {
  campaignId?: string | null;
  campaignCandidateId?: string | null;
  when?: "upcoming" | "past" | "all";
  limit?: number;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const KINDS = ["candidate", "team", "other"] as const;

/** One meeting from the server, or null when it lacks what a page needs to show it. */
export function meetingOf(raw: unknown): Meeting | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const startsAt = str(r.startsAt);
  const endsAt = str(r.endsAt);
  if (!id || !startsAt || !endsAt || Number.isNaN(Date.parse(startsAt))) return null;
  const status = (["scheduled", "cancelled", "done", "failed"] as const).find((s) => s === r.status) ?? "scheduled";
  const attendees = Array.isArray(r.attendees) ? r.attendees : [];
  return {
    id,
    campaignId: str(r.campaignId),
    campaignName: str(r.campaignName),
    campaignCandidateId: str(r.campaignCandidateId),
    candidateName: str(r.candidateName),
    organizerName: str(r.organizerName),
    mine: r.mine === true,
    title: str(r.title) ?? "Meeting",
    startsAt,
    endsAt,
    timezone: str(r.timezone) ?? "UTC",
    meetUrl: str(r.meetUrl),
    eventUrl: str(r.eventUrl),
    status,
    attendees: attendees.flatMap((a) => {
      if (!a || typeof a !== "object") return [];
      const o = a as Record<string, unknown>;
      const kind = KINDS.find((k) => k === o.kind) ?? "other";
      return [{ name: str(o.name), email: str(o.email), kind }];
    }),
  };
}

export const meetingsApi = {
  list: async (q: MeetingQuery = {}): Promise<Meeting[]> => {
    const params = new URLSearchParams();
    if (q.campaignId) params.set("campaignId", q.campaignId);
    if (q.campaignCandidateId) params.set("campaignCandidateId", q.campaignCandidateId);
    if (q.when) params.set("when", q.when);
    if (q.limit) params.set("limit", String(q.limit));
    const body = await api<{ meetings?: unknown }>("GET", `/v1/meetings${params.size ? `?${params.toString()}` : ""}`);
    return (Array.isArray(body.meetings) ? body.meetings : []).flatMap((m) => {
      const meeting = meetingOf(m);
      return meeting ? [meeting] : [];
    });
  },
};

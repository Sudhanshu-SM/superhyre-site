import { describe, expect, it } from "vitest";
import type { Message, Thread } from "../api/outreach";
import { applyScheduled, draftsOf, firstDraft, loggedOf, scheduledOf, sentOf, whenLabel } from "../api/outreach";

const msg = (id: string, status: Message["status"], over: Partial<Message> = {}): Message => ({
  id, direction: "out", subject: "Hi", body: "Hello", status, scheduledFor: null, sentAt: null, error: null, outcome: null, createdAt: "2026-10-04T08:00:00Z", ...over,
});
const thread = (id: string, messages: Message[]): Thread => ({
  id, campaignCandidateId: `cc-${id}`, stage: "shortlisted",
  candidate: { id: `c-${id}`, name: `Person ${id}`, title: null, company: null, primaryEmail: `${id}@x.in` }, messages,
});

describe("reading threads", () => {
  const threads = [
    thread("a", [msg("a1", "draft")]),
    thread("b", [msg("b1", "sent"), msg("b2", "scheduled", { scheduledFor: "2026-10-05T04:00:00Z" })]),
    thread("c", [msg("c1", "scheduled", { scheduledFor: "2026-10-04T10:00:00Z" })]),
    thread("d", [msg("d1", "sent"), { ...msg("d2", "replied_logged"), direction: "in" }]),
  ];
  it("looks at each thread's newest outgoing message", () => {
    expect(draftsOf(threads).map((i) => i.message.id)).toEqual(["a1"]);
    expect(scheduledOf(threads).map((i) => i.message.id)).toEqual(["c1", "b2"]);
    expect(sentOf(threads).map((i) => i.message.id)).toEqual(["d1"]);
  });
  it("keeps a logged outcome out of the waiting list after a reload", () => {
    const logged = [
      thread("e", [msg("e1", "sent", { outcome: "no_reply", sentAt: "2026-10-01T09:00:00Z" })]),
      thread("f", [msg("f1", "replied_logged", { outcome: "replied", sentAt: "2026-10-02T09:00:00Z" })]),
      thread("g", [msg("g1", "failed", { outcome: "bounced", error: "bounced" })]),
      thread("h", [msg("h1", "sent")]),
    ];
    expect(sentOf(logged).map((i) => i.message.id)).toEqual(["h1"]);
    expect(loggedOf(logged).map((i) => i.message.id)).toEqual(["f1", "e1"]);
  });
  it("writes the server's send times onto the drafts it scheduled", () => {
    const next = applyScheduled(threads, [{ id: "a1", scheduledFor: "2026-10-04T09:00:00Z" }]);
    expect(draftsOf(next)).toEqual([]);
    expect(scheduledOf(next)[0]?.message).toMatchObject({ id: "a1", status: "scheduled" });
    expect(threads[0]?.messages[0]?.status).toBe("draft");
  });
});

describe("firstDraft", () => {
  it("greets by first name and names the campaign", () => {
    const d = firstDraft("Asha Verma", "Backend Engineers");
    expect(d.subject).toBe("Backend Engineers: would you be open to a chat?");
    expect(d.body.startsWith("Hi Asha,")).toBe(true);
  });
});

describe("whenLabel", () => {
  const now = new Date(2026, 9, 4, 10, 0);
  it("says today and tomorrow in words", () => {
    expect(whenLabel(new Date(2026, 9, 4, 14, 30).toISOString(), now)).toBe("Today, 14:30");
    expect(whenLabel(new Date(2026, 9, 5, 9, 30).toISOString(), now)).toBe("Tomorrow, 09:30");
    expect(whenLabel(new Date(2026, 9, 8, 9, 30).toISOString(), now)).toMatch(/^Thu,? 8 Oct, 09:30$/);
  });
});

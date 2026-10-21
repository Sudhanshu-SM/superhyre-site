import { describe, expect, it } from "vitest";
import type { ApiActivity } from "../api/campaigns";
import { logLine } from "../api/campaigns";

/**
 * The campaign's activity says what the client did and what the team did about the client's page, in plain
 * sentences, and names a move into a column by the campaign's own word for it.
 */

const NOW = Date.parse("2026-10-19T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
const act = (over: Partial<ApiActivity>): ApiActivity => ({
  id: "1", subjectKind: "candidate", subjectId: "cand1", subjectName: "Priya Nair", verb: "moved",
  actorKind: "user", actorId: "u1", actorName: "Asha Rao", data: {}, at: ago(30), ...over,
});
const ids = (id: string) => (id === "cand1" ? "cc1" : undefined);
const say = (over: Partial<ApiActivity>) => {
  const l = logLine(act(over), "u9", ids, NOW);
  return l ? [l.actor, l.verb, l.person?.name].filter(Boolean).join(" ") : null;
};

describe("the client's answers", () => {
  it("read as 'Your client approved Priya' and 'Your client passed Rahul', never as the agent", () => {
    expect(say({ verb: "client_approved", actorKind: "system", actorId: null, actorName: null, data: { verdict: "approved" } })).toBe("Your client approved Priya Nair");
    expect(say({ verb: "client_declined", subjectName: "Rahul Shah", actorKind: "system", actorId: null, actorName: null, data: { verdict: "declined" } })).toBe("Your client rejected Rahul Shah");
  });

  it("name the person who answered when they gave a name, carry their note folded under the line, and link to the person", () => {
    const l = logLine(act({ verb: "client_approved", actorKind: "system", actorId: null, actorName: null, data: { note: "Strong on payments.", reviewerName: "Dev" } }), "u9", ids, NOW);
    expect(l).toMatchObject({ who: "team", kind: "reply", actor: "Dev", verb: "approved", detail: "From your client", quote: "Strong on payments.", quoteLabel: "Note", person: { id: "cc1", name: "Priya Nair" } });
    const bare = logLine(act({ verb: "client_declined", actorKind: "system", actorId: null, actorName: null, data: { note: null, reviewerName: null } }), "u9", ids, NOW)!;
    expect(bare.detail).toBeUndefined();
    expect(bare.quote).toBeUndefined();
  });
});

describe("the client link and the stages", () => {
  const campaign = (verb: string, data: Record<string, unknown> = {}): Partial<ApiActivity> => ({ subjectKind: "campaign", subjectId: "camp1", subjectName: null, verb, data });

  it("say what the team did, in calm words", () => {
    expect(say(campaign("client_link_created"))).toBe("Asha Rao turned on the client link");
    expect(say(campaign("client_link_renewed"))).toBe("Asha Rao made a new client link");
    expect(say(campaign("client_link_off"))).toBe("Asha Rao turned off the client link");
    expect(say(campaign("stages_changed"))).toBe("Asha Rao changed the stages");
  });

  it("name the signed-in person You, and list the stages a change left", () => {
    const l = logLine(act(campaign("stages_changed", { stages: ["Shortlisted", "Outreach", "Client review", "Interviewing"], changes: ['add "Client review"'] })), "u1", ids, NOW)!;
    expect(l).toMatchObject({ actor: "You", verb: "changed the stages", who: "team", detail: "Now Shortlisted · Outreach · Client review · Interviewing" });
  });
});

describe("a move into one of the campaign's own columns", () => {
  it("says the column's own name when the server carries it, and the kind's word when it does not", () => {
    const named = logLine(act({ data: { from: "outreach", to: "outreach", fromStage: "Outreach", toStage: "Client review" } }), "u9", ids, NOW)!;
    expect(named).toMatchObject({ verb: "moved", from: "Outreach", to: "Client review" });
    const plain = logLine(act({ data: { from: "outreach", to: "interviewing" } }), "u9", ids, NOW)!;
    expect(plain).toMatchObject({ from: "In outreach", to: "Interviewing" });
  });
});

describe("a call logged by hand", () => {
  it("reads as 'Asha logged a call with Priya', with how it went under it, and links to the person", () => {
    const l = logLine(act({ verb: "call_logged", data: { callId: "k1", outcome: "no_answer" } }), "u9", ids, NOW)!;
    expect(l).toMatchObject({ who: "team", kind: "call", actor: "Asha Rao", verb: "logged a call with", detail: "No answer", person: { id: "cc1", name: "Priya Nair" } });
    expect(logLine(act({ verb: "call_logged", data: { outcome: "voicemail" } }), "u1", ids, NOW)).toMatchObject({ actor: "You", detail: "Voicemail" });
  });
});

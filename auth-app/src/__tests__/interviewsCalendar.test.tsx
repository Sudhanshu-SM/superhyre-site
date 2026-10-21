import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connections, GoogleConnection } from "../api/identity";

/**
 * The Interviews view knows whether Google Calendar is connected: connected, each person has "Find a time" (their
 * free times, asked for in code) and nothing says there is no calendar; not connected, it is the honest fallback with
 * "Ask for times" and a way to connect. A time picked on the free-times card is a structured booking, not words.
 */

const { server, sent } = vi.hoisted(() => ({ server: { reply: null as unknown }, sent: [] as unknown[][] }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => server.reply };
});
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));
vi.mock("../liveChat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../liveChat")>()),
  sendAction: (...args: unknown[]) => { sent.push(args); return "k"; },
}));

vi.mock("../schedulesStore", () => ({
  useFeed: () => ({ phase: "ready", items: [], next: null, more: "idle", at: 0 }),
  reloadFeed: async () => undefined,
}));

const store = await import("../connectionsStore");
const { Card } = await import("../liveViews/Schedule");
const { pick, bookText } = await import("../agentCards/SlotsCard");

const GOOGLE: GoogleConnection = {
  available: true, status: "connected", accountEmail: "ana@hirewell.in", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-21T00:00:00Z",
};
async function serverSays(google: Partial<GoogleConnection>): Promise<void> {
  server.reply = { google: { ...GOOGLE, ...google }, slack: null, notion: null, providers: {} } satisfies Connections;
  await store.reloadConnections();
}
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const row = (name: string, extra: Record<string, unknown> = {}) => ({
  campaignCandidateId: `cc-${name}`, candidateId: `c-${name}`, fullName: name, currentTitle: "Engineer", currentCompanyName: "Acme", city: "Pune", doNotContact: false, ...extra,
});
const groups = [{ stage: "interviewing", label: "Interviewing", rows: [row("Lakshmi Bansal"), row("Noor Khan", { doNotContact: true })] }] as never;
const ctx = { onGrow: () => undefined, openProfile: () => undefined, send: () => undefined } as never;
const draw = () => renderToStaticMarkup(<Card groups={groups} named={false} campaignName="Senior Backend" campaignId="camp1" ctx={ctx} />);

beforeEach(() => { sent.length = 0; });

describe("with Google Calendar connected", () => {
  beforeEach(async () => { await serverSays({ products: ["gmail", "sheets", "calendar", "tasks"] }); });

  it("offers Find a time for each person who can be written to, and no email fallback", () => {
    const t = text(draw());
    expect(t).toContain("Your Google Calendar is connected.");
    expect(t).toContain("Find a time");
    expect(t).not.toContain("Ask for times");
    expect(t).not.toContain("No calendar is connected yet");
    expect(t).not.toContain("Ask all");
    // Someone on the do-not-contact list gets neither.
    expect((draw().match(/>Find a time<\/button>/g) ?? []).length).toBe(1);
    expect(t).toContain("Do not contact");
  });
});

describe("without it", () => {
  it("keeps the honest fallback, with the way to connect", async () => {
    await serverSays({});
    const t = text(draw());
    expect(t).toContain("No calendar is connected yet");
    expect(t).toContain("Ask for times");
    expect(t).toContain("Connect Google Calendar");
    expect(t).not.toContain("Find a time");
  });

  it("is the same when Google isn't connected at all", async () => {
    await serverSays({ status: "disconnected", products: [], accountEmail: null });
    expect(text(draw())).toContain("No calendar is connected yet");
  });
});

describe("a time picked on the free-times card", () => {
  const card = {
    kind: "slots" as const, key: "slots:a", timezone: "Asia/Kolkata", durationMinutes: 45, forName: "Lakshmi Bansal", campaignId: "camp1", campaignCandidateId: "cc-Lakshmi",
    slots: [], assumed: [],
  };
  const slot = { startsAt: "2026-10-22T08:30:00.000Z", endsAt: "2026-10-22T09:15:00.000Z", when: "Thu 22 Oct 2026, 2:00 pm IST" };

  it("is sent as a booking for that person and exactly that time, with the words only for the log", () => {
    pick(card, slot);
    expect(sent).toHaveLength(1);
    const [words, label, campaignId, structured] = sent[0] ?? [];
    expect(words).toBe(bookText(card, slot.startsAt, slot.when));
    expect(label).toBe("Book Thu 22 Oct, 2 pm");
    expect(campaignId).toBe("camp1");
    expect(structured).toEqual({ book: { campaignCandidateId: "cc-Lakshmi", startsAt: slot.startsAt, endsAt: slot.endsAt } });
  });

  it("is only words when no person is named, for the agent to ask who it is for", () => {
    pick({ ...card, campaignCandidateId: null, forName: null }, slot);
    expect(sent[0]?.[3]).toBeUndefined();
  });
});

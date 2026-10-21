import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connections, GoogleConnection } from "../api/identity";
import type { Approval, LiveTurn } from "../liveChat";

/**
 * A failed send is one card in one layout: what went wrong, then Connect (or the link to the Google project), then
 * the buttons, all inside the card, whether the card waits for a yes or has settled with something that did not
 * send. The turn shows no connect card of its own beside it, and the words are the ones Outreach keeps on the row.
 */

const { server } = vi.hoisted(() => ({ server: { reply: null as unknown } }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => { await Promise.resolve(); return server.reply; }, messageOf: (e: Error) => e.message };
});

const store = await import("../connectionsStore");
const { ApprovalCard } = await import("../agentCards/ApprovalCard");
const { LiveTurnBody } = await import("../LiveTurn");
const { newTurn } = await import("../liveChat");
const { STATUS_FILTERS, STATUS_LABEL } = await import("../outreachActivityView");

const GOOGLE: GoogleConnection = {
  available: true, status: "expired", accountEmail: "ana@gmail.com", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-15T09:00:00Z",
};
async function serverSays(c: Partial<Connections>): Promise<void> {
  server.reply = { google: GOOGLE, slack: null, notion: null, providers: {}, ...c };
  await store.reloadConnections();
}
const html = (el: JSX.Element) => renderToStaticMarkup(el);
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const RECONNECT = "Gmail needs to be reconnected, so this email didn't go out.";
const email = (over: Partial<Approval> = {}): Approval => ({
  seq: 3, summary: "Email Dev", action: "send_email", detail: { action: "send_email", campaignId: "c1" }, campaignId: "c1", campaignName: "Senior Backend",
  people: [], decided: null, deciding: false, error: null, notes: [], capability: "outreach.send_email", wontDo: [],
  emails: [{ to: "Dev Menon", subject: "A role", body: "Hi Dev" }], ...over,
});
const card = (a: Approval) => html(<ApprovalCard turnKey="t" approval={a} turnSaid="Email Dev" />);
const settled = (): Approval => email({
  decided: { decision: "approve", outcome: {
    action: "send_email", attempt: 1, headline: "Sent 2 of 3 from ana@x.com. 1 didn't send.", counts: { total: 3, sent: 2, waiting: 0, failed: 1, held: 0 },
    failures: [{ names: ["Eli Fernandes"], reason: "Reconnect Gmail to send.", retry: true }], again: true, settled: true, reconnect: true, next: [],
  } },
});

beforeEach(() => store.resetConnections());

/** The order of the parts of a card's markup: where each one sits. */
const at = (out: string, needle: string): number => out.indexOf(needle);

describe("a failed send holds its Connect inside the card", () => {
  it("shows the reason, then Reconnect Gmail, then the buttons, when the card waits for a yes", async () => {
    await serverSays({});
    const out = card(email({ error: RECONNECT }));
    expect(text(out)).toContain(RECONNECT);
    expect(text(out)).not.toMatch(/\bbelow\b/);
    expect(out).toContain('aria-label="Reconnect Google"');
    expect(at(out, RECONNECT.slice(0, 12))).toBeLessThan(at(out, 'aria-label="Reconnect Google"'));
    expect(at(out, 'aria-label="Reconnect Google"')).toBeLessThan(at(out, ">Try again</button>"));
    expect(out).toContain(">Not now</button>");
  });

  it("shows the same parts in the same order when the card has settled with one that did not send", async () => {
    await serverSays({});
    const out = card(settled());
    expect(text(out)).toContain("Sent 2 of 3 from ana@x.com. 1 didn't send.");
    expect(text(out)).toContain("Eli Fernandes Reconnect Gmail to send.");
    expect(out).toContain('aria-label="Reconnect Google"');
    expect(at(out, "Eli Fernandes")).toBeLessThan(at(out, 'aria-label="Reconnect Google"'));
    expect(at(out, 'aria-label="Reconnect Google"')).toBeLessThan(at(out, ">Try again</button>"));
  });

  it("asks for no connect card of its own: a turn with one beside an email card shows it only inside the card", async () => {
    await serverSays({});
    const connect = { kind: "connect" as const, key: "connect:google", provider: "google" as const, url: null, mode: "oauth" as const, field: null, reason: "Connect Gmail", retryText: null, waiting: true };
    const turn: LiveTurn = { ...newTurn("t", "Email the top 3", Date.now() - 20_000), runId: "r1", status: "done", finishedAt: Date.now(), cards: [connect], approvals: [email({ error: RECONNECT })] };
    const out = html(<LiveTurnBody turn={turn} onAnswer={() => undefined} />);
    // One Reconnect, and it is inside the approval card.
    expect(out.match(/aria-label="Reconnect Google"/g)).toHaveLength(1);
    const inside = out.slice(at(out, "lt-approval"));
    expect(inside).toContain('aria-label="Reconnect Google"');
    // Without the email card the connect card is the answer, as before.
    const alone = html(<LiveTurnBody turn={{ ...turn, approvals: [] }} onAnswer={() => undefined} />);
    expect(alone).toContain('aria-label="Reconnect Google"');
  });
});

describe("the words are the row's words", () => {
  it("says Didn't send in the card, the Outreach row's status and the filter that finds those rows", () => {
    expect(STATUS_LABEL.failed).toBe("Didn't send");
    expect(STATUS_FILTERS.find((s) => s.value === "failed")?.label).toBe("Didn't send");
    expect(text(card(settled()))).toContain("1 didn't send.");
  });
});

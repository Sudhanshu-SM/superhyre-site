import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connections, GoogleConnection } from "../api/identity";
import type { Approval } from "../liveChat";

/**
 * The small things that made a failed or finished email card read badly: one reason and one primary button, the
 * name apart from the reason, the address beside who it goes to, a cancelled schedule saying Cancelled, a card whose
 * messages are gone saying it was already handled, an old vague reason in today's words, and the way back from Google.
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
const { outcomeModel } = await import("../agentCards/outcome");
const { approvalFailure, ALREADY_HANDLED } = await import("../chatCards");
const words = await import("../outreachWords");
const back = await import("../connectReturn");
const { suggestionsOf } = await import("../liveChat");

const GOOGLE: GoogleConnection = { available: true, status: "expired", accountEmail: "ana@gmail.com", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-15T09:00:00Z" };
async function serverSays(c: Partial<Connections>): Promise<void> {
  server.reply = { google: GOOGLE, slack: null, notion: null, providers: {}, ...c };
  await store.reloadConnections();
}
const html = (el: JSX.Element) => renderToStaticMarkup(el);
const text = (m: string) => m.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const email = (over: Partial<Approval> = {}): Approval => ({
  seq: 3, summary: "Email Dev", action: "send_email", detail: { action: "send_email", campaignId: "c1" }, campaignId: "c1", campaignName: "Senior Backend",
  people: [], decided: null, deciding: false, error: null, notes: [], capability: "outreach.send_email", wontDo: [],
  emails: [{ to: "Dev Menon", address: "dev@example.com", subject: "A role", body: "Hi Dev" }], ...over,
});
const card = (a: Approval) => html(<ApprovalCard turnKey="t" approval={a} turnSaid="x" />);
const count = (s: string, needle: string) => s.split(needle).length - 1;

beforeEach(() => store.resetConnections());

describe("eight emails are a compact card", () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ to: `Person${i} Name`, address: `p${i}@example.com`, subject: `Subject ${i}`, body: `Body ${i} words` }));
  it("says Send 8 emails?, lists who once (three, then Show all 8), shows the first as a sample, and Preview each", () => {
    const out = card(email({ emails: eight, people: eight.map((e) => ({ name: e.to, title: null, company: null, city: null })) }));
    const t = text(out);
    expect(t).toContain("Send 8 emails?");
    expect(t).not.toContain("Who it is for");
    expect(t).toContain("Show all 8");
    expect(t).toContain("Preview each");
    for (const i of [0, 1, 2]) expect(count(t, `Person${i} Name`)).toBe(1);
    expect(t).not.toContain("Person5 Name");
    // The first is the sample, in full; the others are not read until asked for.
    expect(t).toContain("Body 0 words");
    expect(t).not.toContain("Body 3 words");
    expect(t).toContain("p0@example.com");
    // Short enough to be a card, not a page: no email is repeated in full.
    expect(out.length).toBeLessThan(6000);
  });
});

describe("a failed card has one reason and one primary button", () => {
  it("says the refusal once, offers Reconnect as the quiet button, and Try again as the only primary one", async () => {
    await serverSays({});
    const refused = "Gmail needs to be reconnected, so this email didn't go out.";
    const out = card(email({ error: refused, notes: ["Gmail needs to be reconnected, so this won't go out until it is."] }));
    expect(count(text(out), "reconnected")).toBe(1);
    expect(count(out, "rep-commit")).toBe(1);
    expect(out).toContain('class="rep-act">Reconnect Google</button>');
    expect(out).toContain(">Try again</button>");
    expect(text(out)).not.toContain("Google signed this account out");
  });

  it("keeps the name apart from the reason, on their own lines, on a card that settled", async () => {
    await serverSays({});
    const a = email({ decided: { decision: "approve", outcome: {
      action: "send_email", attempt: 1, headline: "Sent 1 of 2 from ana@x.com. 1 didn't send.", counts: { total: 2, sent: 1, waiting: 0, failed: 1, held: 0 },
      failures: [{ names: ["Zz QA Self"], reason: "Gmail didn't accept this email. Reconnect Gmail and try again.", retry: true }], again: true, settled: true, reconnect: true, next: [],
    } } });
    const out = card(a);
    expect(out).toMatch(/<li><span class="lt-affected-name">Zz QA Self<\/span> <span class="lt-affected-meta">Gmail didn&#x27;t accept this email/);
    expect(count(out, "rep-commit")).toBe(1);
  });
});

describe("the address is beside who it goes to", () => {
  it("shows it in quiet text on an email waiting for a yes", () => {
    const out = card(email());
    expect(out).toMatch(/To Dev Menon<span class="lt-quote-addr"> dev@example.com<\/span>/);
  });
});

describe("a card that was cancelled or whose messages are gone", () => {
  it("says Cancelled, not Scheduled, once its schedule is cancelled", () => {
    const a: Approval = { ...email({ action: "schedule", detail: { action: "schedule", items: [] }, emails: [] }), decided: { decision: "approve", outcome: {
      action: "schedule", summary: "Cancelled.", counts: { scheduled: 0, cancelled: 1 }, scheduled: [{ id: "s1" }], scheduleIds: ["s1"], cancelled: true,
    } } };
    expect(outcomeModel(a)?.summary).toBe("Cancelled.");
    const partly: Approval = { ...a, decided: { decision: "approve", outcome: { action: "schedule", summary: "Scheduled 1 of 2; 1 cancelled.", counts: { scheduled: 1, cancelled: 1 }, scheduled: [{}, {}] } } };
    expect(outcomeModel(partly)?.summary).toBe("Scheduled 1 of 2; 1 cancelled.");
  });

  it("says it was already handled instead of 'Message not found.'", () => {
    expect(approvalFailure("send_email", 404, "Message not found.")).toBe(ALREADY_HANDLED);
    expect(ALREADY_HANDLED).toBe("This was already handled.");
    expect(approvalFailure("send_email", 503, "Gmail isn't connected, so this email didn't go out.")).toContain("Gmail isn't connected");
  });

  it("drops 'emails will wait until it is connected' from a schedule that was made, once Gmail is connected", async () => {
    await serverSays({ google: { ...GOOGLE, status: "connected" } });
    const a: Approval = { ...email({ action: "schedule", detail: { action: "schedule", items: [] }, emails: [] }), decided: { decision: "approve", outcome: {
      action: "schedule", summary: "Scheduled 1 item, 1 email among them. Gmail isn't connected yet, so emails will wait until it is.", scheduled: [{}],
    } } };
    expect(text(card(a))).not.toContain("will wait until it is");
  });
});

describe("old reasons and new words", () => {
  it("reads a vague old reason in today's words, with no data changed", () => {
    expect(words.plainReason("Gmail didn't allow this send.")).toBe("Gmail didn't accept this email. Reconnect Gmail and try again.");
    expect(words.plainReason("Reconnect Gmail in Settings → Connections to send.")).toBe("Reconnect Gmail to send.");
    expect(words.plainReason("bounced")).toBe("Bounced");
    expect(words.plainReason("  ")).toBe(words.DIDNT_GO);
  });

  it("reads a sent email as Sent, with waiting for a reply beside it, and a failed one as Didn't send", () => {
    expect(words.EMAIL_STATE_WORDS.waiting).toEqual({ label: "Sent", secondary: "Waiting for a reply" });
    expect(words.EMAIL_STATE_WORDS.failed?.label).toBe("Didn't send");
  });
});

describe("a follow-up button carries the people it is about", () => {
  it("keeps the ids the server named, as data, and drops a malformed set", () => {
    const only = { campaignId: "c0000000-0000-4000-8000-000000000001", campaignCandidateIds: ["a", "b"] };
    expect(suggestionsOf([{ label: "Start outreach", text: "Reach out to those 2", only }])).toEqual([{ label: "Start outreach", text: "Reach out to those 2", only }]);
    expect(suggestionsOf([{ label: "Start outreach", text: "x", only: { campaignId: "c", campaignCandidateIds: [] } }])).toEqual([{ label: "Start outreach", text: "x" }]);
  });
});

describe("coming back from Google", () => {
  it("remembers the page the person left from, once, and never the connections page", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { hash: "#/agent" },
      sessionStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) },
    });
    back.rememberReturn();
    expect(back.takeReturn()).toBe("#/agent");
    expect(back.takeReturn()).toBeNull();
    back.rememberReturn("#/settings/connections?google=complete");
    expect(back.takeReturn()).toBeNull();
    vi.unstubAllGlobals();
  });
});

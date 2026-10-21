import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "../api/events";
import type { Connections, GoogleConnection, OrgConnection } from "../api/identity";
import type { PhaseLine } from "../agentPhases";
import type { Approval, ChatState } from "../liveChat";

/**
 * Every state of the cards the agent puts in front of someone who is connecting Gmail, Slack or Notion, or
 * sending, posting and disconnecting through them: what will happen, working, done, did not go (the plain reason
 * and the way forward), declined, and needs reconnecting. Each is read from what the server last said, so a card
 * that comes back after the chat was left shows what is true now, not the state it was first drawn in.
 */

const { server, rights } = vi.hoisted(() => ({
  server: { reply: null as unknown, fail: false },
  rights: { manage: true },
}));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true, API_URL: "http://api.test", ApiError,
    api: async () => {
      await Promise.resolve();
      if (server.fail) throw new ApiError(500, "internal", "Something went wrong on our side.");
      return server.reply;
    },
  };
});
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => rights.manage }));

const store = await import("../connectionsStore");
const { ConnectCard, askedNow, isConnected, startedRecently, STARTED } = await import("../agentCards/ConnectCard");
const { ApprovalCard, workingWord } = await import("../agentCards/ApprovalCard");
const { declinedWords, outcomeModel, wontDo } = await import("../agentCards/outcome");
const { OutcomeBody } = await import("../agentCards/OutcomeCard");
const { connectState, connectTitle, TESTS } = await import("../connectStates");
const { applyEvent, newTurn } = await import("../liveChat");
const flow = await import("../connectFlow");
const { TurnContext } = await import("../agentThread");

const GOOGLE: GoogleConnection = {
  available: true, status: "connected", accountEmail: "ana@gmail.com", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-15T09:00:00Z",
};
const slack = (over: Partial<OrgConnection> = {}): OrgConnection => ({
  provider: "slack", status: "connected", accountName: "superhyre", workspaceName: "Acme Hiring",
  connectedBy: { id: "u1", name: "Priya Nair" }, connectedAt: "2026-10-09T10:00:00Z", lastUsedAt: null, lastError: null,
  scopes: [], settings: {}, ...over,
});
const notion = (over: Partial<OrgConnection> = {}): OrgConnection => slack({ provider: "notion", workspaceName: "Acme Wiki", ...over });

/** The store holds what the server said, as it would after the page asked. */
async function serverSays(c: Partial<Connections>): Promise<void> {
  server.reply = { google: GOOGLE, slack: null, notion: null, providers: {}, ...c };
  await store.reloadConnections();
}
const html = (el: JSX.Element) => renderToStaticMarkup(el);
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

beforeEach(() => {
  server.reply = null;
  server.fail = false;
  rights.manage = true;
  store.resetConnections();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/* ── where a connection stands ── */

describe("where a connection stands", () => {
  const ready = (over: Partial<ReturnType<typeof store.connectionsNow>> = {}) =>
    ({ ...store.fromApi({ google: { ...GOOGLE, status: "disconnected", accountEmail: null, products: [] } } as Connections), ...over });

  it("says nothing either way until the first answer arrives, and says when it can't get one", () => {
    const idle = { ...ready(), status: "idle" as const, google: null };
    expect(connectState("google", idle, true)).toEqual({ s: "checking" });
    expect(connectState("slack", { ...idle, status: "loading" }, true)).toEqual({ s: "checking" });
    expect(connectState("slack", { ...idle, status: "failed" }, true)).toEqual({ s: "unknown" });
    // What it knew before a failed refresh still stands.
    expect(connectState("slack", { ...idle, status: "failed", slack: slack() }, true)).toMatchObject({ s: "connected" });
    // Not connected to a server at all (the prototype), nothing will answer: not connected.
    expect(connectState("slack", idle, false)).toEqual({ s: "disconnected" });
  });

  it("reads Google by the account it is connected as, and by what has to be done when it is not working", () => {
    expect(connectState("google", ready({ google: GOOGLE }), true)).toEqual({ s: "connected", as: "ana@gmail.com" });
    expect(connectState("google", ready(), true)).toEqual({ s: "disconnected" });
    expect(connectState("google", ready({ google: { ...GOOGLE, status: "expired" } }), true)).toMatchObject({ s: "reconnect", why: expect.stringMatching(/signed this account out/) });
    expect(connectState("google", ready({ google: { ...GOOGLE, status: "revoked" } }), true)).toMatchObject({ s: "reconnect", why: expect.stringMatching(/removed in Google/) });
    // Connected, but Google was not allowed to send: email still can't go, and the card says what to do.
    expect(connectState("google", ready({ google: { ...GOOGLE, products: ["sheets"] } }), true)).toMatchObject({ s: "reconnect", why: expect.stringMatching(/leave every box ticked/) });
    expect(connectState("google", ready({ google: { ...GOOGLE, available: false, reason: "Google sign-in isn't set up on this server yet." } }), true))
      .toEqual({ s: "unavailable", why: "Google sign-in isn't set up on this server yet." });
  });

  it("reads Slack and Notion by their workspace, and says why one that stopped working needs reconnecting", () => {
    expect(connectState("slack", ready({ slack: slack() }), true)).toEqual({ s: "connected", as: "Acme Hiring" });
    expect(connectState("notion", ready({ notion: notion({ workspaceName: null, accountName: "bot" }) }), true)).toEqual({ s: "connected", as: "bot" });
    expect(connectState("slack", ready(), true)).toEqual({ s: "disconnected" });
    expect(connectState("slack", ready({ slack: slack({ status: "expired" }) }), true))
      .toEqual({ s: "reconnect", why: "Slack signed this connection out. Reconnect to keep posting." });
    expect(connectState("notion", ready({ notion: notion({ status: "error", lastError: "Notion says the integration was removed." }) }), true))
      .toEqual({ s: "reconnect", why: "Notion says the integration was removed. Reconnect to keep saving notes." });
  });

  it("titles each state in plain words, and does not write Google's name beside its wordmark", () => {
    expect(connectTitle("google", { s: "connected", as: "ana@gmail.com" })).toBe("Connected as ana@gmail.com");
    expect(connectTitle("google", { s: "disconnected" })).toBe("Not connected");
    expect(connectTitle("google", { s: "reconnect", why: "x" })).toBe("Needs to be reconnected");
    expect(connectTitle("slack", { s: "connected", as: "Acme Hiring" })).toBe("Connected to Acme Hiring");
    expect(connectTitle("slack", { s: "connected", as: null })).toBe("Slack is connected");
    expect(connectTitle("slack", { s: "disconnected" })).toBe("Slack isn't connected");
    expect(connectTitle("notion", { s: "reconnect", why: "x" })).toBe("Notion needs to be reconnected");
    expect(connectTitle("slack", { s: "checking" })).toBe("Checking…");
  });

  it("offers a test for Gmail and Slack, and none for Notion", () => {
    expect(TESTS.google).toEqual([{ label: "Send me a test email", text: "Send me a test email" }]);
    expect(TESTS.slack).toEqual([{ label: "Post a test message", text: "Post a test message to Slack" }]);
    expect(TESTS.notion).toEqual([]);
  });
});

/* ── the connect card ── */

describe("the connect card", () => {
  it("says it is checking, with nothing to press, until the server has answered", () => {
    const out = html(<ConnectCard provider="slack" mode="token" />);
    expect(text(out)).toContain("Checking…");
    expect(out).not.toContain("<button");
    expect(out).not.toContain("<input");
  });

  it("says it could not check, with a way to try again", async () => {
    server.fail = true;
    await store.reloadConnections();
    const out = html(<ConnectCard provider="slack" mode="token" />);
    expect(text(out)).toContain("Couldn't check what's connected");
    expect(out).toContain(">Try again</button>");
  });

  it("is, when idle, what connecting is for and the one button, with Google's name in its wordmark", async () => {
    await serverSays({ google: { ...GOOGLE, status: "disconnected", accountEmail: null, products: [] } });
    const out = html(<ConnectCard provider="google" mode="oauth" url="https://accounts.example.test/auth" reason="Connect Gmail so emails can go out from you." />);
    expect(out).toContain('aria-label="Google Workspace"');
    expect(text(out)).toContain("Not connected Connect Gmail so emails can go out from you. Connect Google");
    expect(out).toContain(">Connect Google</button>");
    expect(out).not.toMatch(/type="password"/);
  });

  it("is Connected as the account, with the test as a quiet chip, once Gmail is connected", async () => {
    await serverSays({});
    const out = html(<ConnectCard provider="google" mode="oauth" url="https://x.test/auth" waiting={false} />);
    expect(text(out)).toContain("Connected as ana@gmail.com");
    expect(out).toContain('<button type="button" class="rep-opt">Send me a test email</button>');
    // Nothing is waiting, so there is nothing to carry on with, and nothing to connect.
    expect(out).not.toContain("Carry on");
    expect(out).not.toContain("Connect Google");
    expect(isConnected(store.connectionsNow(), "google")).toBe(true);
  });

  it("offers the email test only after a connection made for email, not for Calendar or Tasks, and not while an approval waits", async () => {
    const both: GoogleConnection["products"] = ["gmail", "sheets", "calendar", "tasks"];
    await serverSays({ google: { ...GOOGLE, products: both } });
    const calendar = html(<ConnectCard provider="google" mode="oauth" products={["calendar"]} label="Google Calendar" waiting={false} />);
    expect(text(calendar)).toContain("Google Calendar is on");
    expect(calendar).not.toContain("Send me a test email");
    expect(html(<ConnectCard provider="google" mode="oauth" products={["tasks"]} label="Google Tasks" waiting={false} />)).not.toContain("Send me a test email");
    // Said in words alone, by an older server that sent no products.
    expect(html(<ConnectCard provider="google" mode="oauth" reason="Invitations come from your own Google Calendar." waiting={false} />)).not.toContain("Send me a test email");
    // For Gmail it is the next step, unless an approval of the turn is waiting: its Approve is.
    expect(html(<ConnectCard provider="google" mode="oauth" waiting={false} />)).toContain("Send me a test email");
    expect(html(<ConnectCard provider="google" mode="oauth" waiting={false} approvalOpen />)).not.toContain("Send me a test email");
  });

  it("says Slack is connected to its workspace and offers one test message; Notion offers none", async () => {
    await serverSays({ slack: slack(), notion: notion() });
    const s = html(<ConnectCard provider="slack" mode="token" waiting={false} />);
    expect(text(s)).toContain("Connected to Acme Hiring");
    expect(s).toContain(">Post a test message</button>");
    const n = html(<ConnectCard provider="notion" mode="token" waiting={false} />);
    expect(text(n)).toContain("Connected to Acme Wiki");
    expect(n).not.toContain("rep-opt");
  });

  it("offers to carry on only where something was waiting on it and nothing else is carrying it on", async () => {
    await serverSays({ slack: slack() });
    /* A card from an earlier visit is read as the store has it; a live one is not trusted until the store is read again. */
    const back = (el: JSX.Element) => html(<TurnContext.Provider value={{ id: "t1", restored: true }}>{el}</TurnContext.Provider>);
    const waiting = back(<ConnectCard provider="slack" mode="token" waiting turnSaid="Tell the team on Slack that interviews start Monday" />);
    expect(waiting).toContain(">Carry on</button>");
    expect(html(<ConnectCard provider="slack" mode="token" waiting={false} turnSaid="connect slack" />)).not.toContain("Carry on");
    // An approval of the same turn is still waiting for its yes: it goes ahead by itself, and a second ask would repeat it.
    expect(back(<ConnectCard provider="slack" mode="token" waiting turnSaid="email Ana" approvalOpen />)).not.toContain("Carry on");
    // Nothing to send again.
    expect(back(<ConnectCard provider="slack" mode="token" waiting />)).not.toContain("Carry on");
  });

  it("reads the connections again when the server asks for one, and shows a connection this window still has as on as needing mending until then", async () => {
    await serverSays({ slack: slack() });
    const live = html(<ConnectCard provider="slack" mode="token" waiting turnSaid="Tell the team on Slack" />);
    expect(text(live)).toContain("Slack needs to be reconnected");
    expect(text(live)).toContain("Reconnect Slack");
    expect(live).not.toContain("Carry on");

    // The connections are read again only for a card the server asked for in a live turn.
    expect(askedNow({ compact: false, waiting: true, restored: false })).toBe(true);
    expect(askedNow({ compact: false, waiting: false, restored: false })).toBe(false);
    expect(askedNow({ compact: true, waiting: true, restored: false })).toBe(false);
    expect(askedNow({ compact: false, waiting: true, restored: true })).toBe(false);
    // Once the store has been read since the card appeared, the card shows what the server said.
    server.reply = { google: GOOGLE, slack: slack({ status: "expired" }), notion: null, providers: {} };
    await store.reloadConnections();
    expect(text(html(<ConnectCard provider="slack" mode="token" waiting turnSaid="x" />))).toContain("Slack signed this connection out. Reconnect to keep posting.");
  });

  it("asks for a signed-out connection to be reconnected, in the card, with the reason", async () => {
    await serverSays({ slack: slack({ status: "expired" }) });
    const out = html(<ConnectCard provider="slack" mode="token" reason="Connect Slack so I can post to your team." />);
    expect(text(out)).toContain("Slack needs to be reconnected");
    expect(text(out)).toContain("Slack signed this connection out. Reconnect to keep posting.");
    expect(out).toContain("Reconnect Slack</button>");
    expect(out).toMatch(/<input[^>]*type="password"/);
    expect(out).not.toMatch(/Settings/);

    await serverSays({ google: { ...GOOGLE, status: "expired" } });
    const g = html(<ConnectCard provider="google" mode="oauth" url="https://x.test/auth" />);
    expect(text(g)).toContain("Needs to be reconnected");
    expect(g).toContain("Reconnect Google</button>");
  });

  it("puts one short line on where the token is found, in the card, for Slack and for Notion", async () => {
    await serverSays({});
    const s = html(<ConnectCard provider="slack" mode="token" />);
    expect(text(s)).toContain("Bot User OAuth Token");
    expect(text(s)).toContain("Copy it from your Slack app's OAuth & Permissions page. It starts with xoxb-.");
    expect(s).toMatch(/placeholder="xoxb-…"/);
    const n = html(<ConnectCard provider="notion" mode="token" />);
    expect(text(n)).toContain("Integration secret");
    expect(text(n)).toContain("Copy it from your Notion integration's Configuration tab.");
    // The server's own words win where it sends them.
    const server_ = html(<ConnectCard provider="slack" mode="token" field={{ label: "Slack bot token", help: "Starts with xoxb-." }} />);
    expect(text(server_)).toContain("Slack bot token");
    expect(text(server_)).toContain("Starts with xoxb-.");
  });

  it("tells someone who may not connect it who can, and offers nothing that would fail", async () => {
    rights.manage = false;
    await serverSays({ google: { ...GOOGLE, status: "disconnected", accountEmail: null, products: [] } });
    const out = html(<ConnectCard provider="slack" mode="token" />);
    expect(text(out)).toContain("Ask an admin to connect Slack. It belongs to the organisation.");
    expect(out).not.toContain("<input");
    expect(out).not.toContain("Connect Slack</button>");
    // Google is their own, whoever they are.
    const g = html(<ConnectCard provider="google" mode="oauth" url="https://x.test/auth" />);
    expect(g).toContain("Connect Google</button>");
  });

  it("says Google can't be connected on a server that has no sign-in for it, with no button that would fail", async () => {
    await serverSays({ google: { ...GOOGLE, available: false, reason: "Google sign-in isn't set up on this server yet.", status: "disconnected", products: [] } });
    const out = html(<ConnectCard provider="google" mode="oauth" url={null} />);
    expect(text(out)).toContain("Not available yet Google sign-in isn't set up on this server yet.");
    expect(out).not.toContain("<button");
  });

  it("inside an approval says nothing when the connection was there all along, and never writes a trip to Settings", async () => {
    await serverSays({ slack: slack() });
    expect(html(<ConnectCard provider="slack" mode="token" compact />)).toBe("");
    await serverSays({ slack: slack({ status: "expired" }) });
    const out = html(<ConnectCard provider="slack" mode="token" compact />);
    expect(out).toContain("is-compact");
    expect(out).not.toMatch(/Settings/);
  });

  it("carries a request on only if the connection was begun in the last quarter of an hour", () => {
    expect(startedRecently(`${STARTED}${Date.now() - 60_000}`)).toBe(true);
    expect(startedRecently(`${STARTED}${Date.now() - 3 * 3_600_000}`)).toBe(false);
    expect(startedRecently("carried")).toBe(false);
    expect(startedRecently(null)).toBe(false);
  });
});

/* ── the card reads what the server says about it ── */

describe("a connect card as the stream brings it", () => {
  let n = 0;
  const ev = (type: RunEvent["type"], payload: Record<string, unknown>): RunEvent => ({ ...payload, id: ++n, runId: "r1", seq: n, type, at: "2026-10-15T10:00:00.000Z" });
  const chat = (): ChatState => ({
    conversationId: "c1", turns: [{ ...newTurn("t1", "Tell the team on Slack"), runId: "r1", status: "working" as const }],
    owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
  });
  const cardWith = (extra: Record<string, unknown>) =>
    applyEvent(chat(), ev("artifact", { kind: "connect", key: "connect:slack", provider: "slack", mode: "token", url: null, reason: "x", ...extra })).turns[0]!.cards[0];

  it("knows a connection asked for on its own from one that holds something up", () => {
    expect(cardWith({ waiting: false })).toMatchObject({ kind: "connect", waiting: false });
    expect(cardWith({ waiting: true })).toMatchObject({ waiting: true });
    // A server that predates it says nothing, which is read as waiting, as before.
    expect(cardWith({})).toMatchObject({ waiting: true });
  });
});

/* ── approvals: what will happen, working, done, did not go, declined ── */

describe("approvals of sending, posting and disconnecting", () => {
  let n = 100;
  const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({ ...payload, id: ++n, runId: "r2", seq: n, type, at: "2026-10-15T10:00:00.000Z" });
  const base = (): ChatState => ({
    conversationId: "c1", turns: [{ ...newTurn("t2", "Send me a test email", 0), runId: "r2", status: "working" as const }],
    owners: { r2: "t2" }, orphans: {}, applied: {}, loading: false, error: null,
  });
  const proposed = (action: Record<string, unknown>, extra: Record<string, unknown> = {}): ChatState =>
    applyEvent(base(), ev("approval", { summary: "x", action, campaignName: null, people: [], ...extra }));
  const card = (a: Approval, extra: { phases?: PhaseLine[]; connectShown?: Array<"google" | "slack" | "notion"> } = {}) =>
    html(<ApprovalCard turnKey="t2" approval={a} turnSaid="x" {...extra} />);
  const first = (s: ChatState) => s.turns[0]!.approvals[0]!;
  const settle = (s: ChatState, result: Record<string, unknown>) =>
    applyEvent(s, ev("result", { approvalSeq: first(s).seq, ...result }));

  const TEST_EMAIL = {
    action: { action: "send_test_email" },
    summary: 'Send a test email from ana@gmail.com to ana@hirewell.in: "Test email from SuperHyre"',
    emails: [{ to: "ana@hirewell.in", subject: "Test email from SuperHyre", body: "This is a test email from SuperHyre." }],
    notes: [] as string[],
  };

  it("keeps a connect card out of an approval until it is known there is something to connect", () => {
    // Not asked yet: nothing is claimed, and nothing flashes "Checking" inside a card that is about something else.
    const s = proposed({ action: "slack_message", channelName: "hiring", text: "Hello" });
    expect(text(card(first(s)))).not.toContain("Checking");
    expect(html(<ConnectCard provider="slack" mode="token" compact />)).toBe("");
  });

  it("says what will happen: a test email to themselves, from which Gmail, with Approve and Not now", async () => {
    await serverSays({});
    const s = proposed(TEST_EMAIL.action, TEST_EMAIL);
    const out = card(first(s));
    expect(out).toContain("Send yourself a test email?");
    expect(out).toContain("To ana@hirewell.in");
    expect(out).toContain("Test email from SuperHyre");
    expect(text(out)).toContain("From ana@gmail.com");
    expect(text(out)).toContain("It sends one email, to you only. It won't contact anyone else.");
    expect(out).toContain(">Approve</button>");
    expect(out).toContain(">Not now</button>");
  });

  it("names the Gmail once: where the server's own note already does, the card does not say it again", async () => {
    await serverSays({});
    const s = proposed({ action: "send_email", campaignId: "c1" }, {
      emails: [{ to: "Ana Rao", subject: "Hello", body: "Hi Ana" }],
      notes: ["It goes out from ana@gmail.com when you approve, and shows in Outreach."],
    });
    const out = text(card(first(s)));
    expect(out.match(/ana@gmail\.com/g)).toHaveLength(1);
  });

  it("says what it is doing, in the verb of the thing, while the yes is carried out", () => {
    const s = proposed(TEST_EMAIL.action, TEST_EMAIL);
    const working = { ...first(s), deciding: true };
    expect(card(working)).toContain("Sending…</button>");
    expect(workingWord("send_email")).toBe("Sending…");
    expect(workingWord("slack_message")).toBe("Posting…");
    expect(workingWord("notion_note")).toBe("Saving…");
    expect(workingWord("disconnect_app")).toBe("Disconnecting…");
    expect(workingWord("shortlist")).toBe("Working…");
  });

  it("is done with the sentence the server says: who it went to and from where", () => {
    const done = first(settle(proposed(TEST_EMAIL.action, TEST_EMAIL), {
      decision: "approve", action: "send_test_email", summary: "Test email sent to ana@hirewell.in.", to: "ana@hirewell.in", from: "ana@gmail.com", counts: { sent: 1 },
    }));
    expect(outcomeModel(done)).toMatchObject({ tone: "done", summary: "Test email sent to ana@hirewell.in.", counts: "" });
    const out = card(done);
    expect(text(out)).toContain("Test email sent to ana@hirewell.in.");
    expect(out).not.toContain("Approve");
  });

  it("says a sent email as sent, with a count for several, and with no second line of counts", () => {
    const one = first(settle(proposed({ action: "send_email", campaignId: "c1" }), {
      decision: "approve", action: "send_email", summary: "Sent to Ana Rao from me@gmail.com.", counts: { sent: 1 },
    }));
    expect(outcomeModel(one)).toMatchObject({ tone: "done", summary: "Sent to Ana Rao from me@gmail.com.", counts: "" });
    const many = first(settle(proposed({ action: "send_email", campaignId: "c1" }), {
      decision: "approve", action: "send_email", summary: "Sent 3 emails from me@gmail.com: Ana, Ben, Cara.", counts: { sent: 3 },
    }));
    expect(outcomeModel(many)?.summary).toBe("Sent 3 emails from me@gmail.com: Ana, Ben, Cara.");
  });

  it("says plainly when Gmail did not take an email, in colour, and offers the way forward", () => {
    const refused = first(settle(proposed({ action: "send_email", campaignId: "c1" }), {
      decision: "approve", action: "send_email",
      summary: "The email to Ana Rao didn't go: Reconnect Gmail to send.", counts: { sent: 0, failed: 1 },
      next: [{ label: "Reconnect Gmail", text: "Connect Gmail" }],
    }));
    const o = outcomeModel(refused)!;
    expect(o.tone).toBe("failed");
    expect(o.next).toEqual([{ label: "Reconnect Gmail", text: "Connect Gmail" }]);
    const out = html(<OutcomeBody outcome={o} />);
    expect(out).toContain("oc is-failed");
    expect(out).toContain(">Reconnect Gmail</button>");
    // Some went and one did not: the sentence says which, and it is not "failed".
    const some = first(settle(proposed({ action: "send_email", campaignId: "c1" }), {
      decision: "approve", action: "send_email", summary: "Sent to Ana Rao from me@gmail.com. The email to Ben didn't go.", counts: { sent: 1, failed: 1 },
    }));
    expect(outcomeModel(some)?.tone).toBe("done");
  });

  it("says where a post went and what was saved, in the words of the thing", () => {
    const post = first(settle(proposed({ action: "slack_message", channelName: "hiring", text: "Interviews start Monday." }), {
      decision: "approve", action: "slack_message", provider: "slack", posted: true, channel: "#hiring",
    }));
    expect(outcomeModel(post)?.summary).toBe("Posted in #hiring.");
    const note = first(settle(proposed({ action: "notion_note", title: "Panel notes", body: "x", parentTitle: "Hiring wiki" }), {
      decision: "approve", action: "notion_note", provider: "notion", created: true, url: "https://www.notion.so/abc",
    }));
    expect(outcomeModel(note)?.summary).toBe("Saved “Panel notes” to Notion.");
    expect(outcomeModel(note)?.next).toEqual([{ label: "Open in Notion", href: "https://www.notion.so/abc" }]);
  });

  it("says a disconnect as it happened, and offers to connect again", () => {
    const gone = first(settle(proposed({ action: "disconnect_app", provider: "google" }, { summary: "Disconnect Gmail" }), {
      decision: "approve", action: "disconnect_app", summary: "Disconnected Gmail (ana@gmail.com).", counts: { disconnected: 1 },
      next: [{ label: "Connect Gmail again", text: "Connect Gmail" }],
    }));
    expect(outcomeModel(gone)).toMatchObject({ tone: "done", summary: "Disconnected Gmail (ana@gmail.com).", next: [{ label: "Connect Gmail again" }] });
  });

  it("says a no in the verb of the thing: not sent, not posted, not saved, not disconnected", () => {
    for (const [action, said] of [
      ["send_email", "Not sent."], ["send_test_email", "Not sent."], ["slack_message", "Not posted."],
      ["notion_note", "Not saved."], ["disconnect_app", "Not disconnected."], ["shortlist", "Not now. Nothing changed."],
    ] as const) {
      expect(declinedWords(action), action).toBe(said);
      const declined = first(settle(proposed({ action }), { decision: "decline", declined: true }));
      expect(outcomeModel(declined), action).toEqual({ tone: "declined", summary: said, counts: "", next: [] });
    }
  });

  it("says what each new action will not do", () => {
    expect(wontDo({ action: "send_test_email", wontDo: [] })).toEqual(["It sends one email, to you only. It won't contact anyone else."]);
    expect(wontDo({ action: "disconnect_app", wontDo: [] })).toEqual(["It only disconnects. Nothing already sent or posted is taken back."]);
  });

  it("says it did not go, with the reason and a Try again, where the card is", () => {
    const s = proposed({ action: "slack_message", channelName: "hiring", text: "Hello" });
    const failed = { ...first(s), error: "The SuperHyre app isn't in #hiring yet, so it can't post there. Add it first, then try again." };
    const out = card(failed);
    expect(out).toContain('class="kc-problem"');
    expect(text(out)).toContain("The SuperHyre app isn't in #hiring yet");
    expect(out).toContain(">Try again</button>");
    expect(out).not.toContain(">Approve</button>");
  });

  it("brings back the reason a returning card had, from the line the run kept, and not once it has gone through", () => {
    const s = proposed({ action: "send_test_email" }, TEST_EMAIL);
    const seq = first(s).seq;
    const kept: PhaseLine[] = [{ id: `approval:${seq}`, phase: "write", state: "failed", label: "Gmail is busy right now. Try again in a moment.", seq: 9 }];
    const back = card(first(s), { phases: kept });
    expect(text(back)).toContain("Gmail is busy right now. Try again in a moment.");
    expect(back).toContain(">Try again</button>");
    // Once it has gone through, the old failure is not told again.
    const done = first(settle(s, { decision: "approve", action: "send_test_email", summary: "Test email sent to ana@hirewell.in." }));
    expect(card(done, { phases: kept })).not.toContain("Gmail is busy");
  });

  it("settles on what happened when the chat is opened again: the replayed events give the same card, not the first state", () => {
    const events: RunEvent[] = [
      ev("approval", { summary: "Post", action: { action: "slack_message", channelName: "hiring", text: "Interviews start Monday." }, campaignName: null, people: [] }),
    ];
    events.push(ev("result", { approvalSeq: events[0]!.seq, decision: "approve", action: "slack_message", provider: "slack", posted: true, channel: "#hiring" }));
    const replay = (list: RunEvent[]) => list.reduce(applyEvent, base());
    const once = replay(events);
    // Played again (a reconnect replays from the start) it is the same, and still settled.
    const twice = events.reduce(applyEvent, once);
    for (const s of [once, twice]) {
      const a = first(s);
      expect(a.decided?.decision).toBe("approve");
      const out = card(a);
      expect(text(out)).toContain("Posted in #hiring.");
      expect(out).not.toContain(">Approve</button>");
      expect(out).not.toContain(">Not now</button>");
    }
  });

  it("does not put a second connect card beside an approval whose turn already has one", async () => {
    await serverSays({ slack: slack({ status: "expired" }) });
    const s = proposed({ action: "slack_message", channelName: "hiring", text: "Hello" });
    const alone = card(first(s));
    expect(alone).toContain("Reconnect Slack</button>");
    const shown = card(first(s), { connectShown: ["slack"] });
    expect(shown).not.toContain("Reconnect Slack</button>");
  });

  it("waits on the turn's connect card: no refusal or note of its own about the connection, and Approve held with its words unchanged", async () => {
    await serverSays({ slack: slack({ status: "expired" }) });
    const s = proposed({ action: "slack_message", channelName: "hiring", text: "Hello" }, { notes: ["Slack needs to be reconnected, so this can't be posted until it is."] });
    const refused = { ...first(s), error: "Slack needs to be reconnected. Connect it below, then approve again.", help: "https://api.slack.com/apps" };
    const shown = card(refused, { connectShown: ["slack"] });
    expect(shown).not.toContain("Reconnect Slack");
    expect(shown).not.toContain("Connect it below");
    expect(shown).not.toContain("needs to be reconnected");
    expect(shown).toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/);
    // Without a card of the turn's own, the approval carries the connection itself and the yes is not held.
    const alone = card(first(s));
    expect(alone).toContain("Reconnect Slack</button>");
    expect(alone).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/);
    // Once it is connected the yes is free.
    await serverSays({ slack: slack() });
    expect(card(first(s), { connectShown: ["slack"] })).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/);
  });

  it("does not repeat a refusal about a connection once the connection has been made", async () => {
    await serverSays({ slack: slack() });
    const s = proposed({ action: "slack_message", channelName: "hiring", text: "Hello" });
    const refused = { ...first(s), error: "Slack needs to be reconnected. Connect it below, then approve again." };
    expect(card(refused, { connectShown: ["slack"] })).not.toContain("Connect it below");
    // And a refusal about anything else is still told.
    expect(card({ ...refused, error: "Slack says that message is too long. Shorten it." }, { connectShown: ["slack"] })).toContain("too long");
  });
});

/* ── the window a connect card opens ── */

describe("the sign-in window", () => {
  it("knows it is the window a connect card opened, and closes itself once it is done", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const win = { name: "sh-connect", opener: {}, close, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) };
    vi.stubGlobal("window", win);
    expect(flow.isConnectWindow()).toBe(true);
    flow.closeConnectWindow(500);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(close).toHaveBeenCalledTimes(1);
    // A window the person opened themselves is left alone.
    vi.stubGlobal("window", { ...win, name: "" });
    expect(flow.isConnectWindow()).toBe(false);
    vi.stubGlobal("window", { ...win, opener: null });
    expect(flow.isConnectWindow()).toBe(false);
  });
});

describe("a connection made in another window", () => {
  it("is read at once by the chat's store when the sign-in window says it is done", async () => {
    await serverSays({});
    expect(store.connectionsNow().slack).toBeNull();
    server.reply = { google: GOOGLE, slack: slack(), notion: null, providers: {} };
    const other = new BroadcastChannel("superhyre.connections");
    other.postMessage("changed");
    await vi.waitFor(() => expect(store.connectionsNow().slack?.status).toBe("connected"));
    other.close();
  });
});

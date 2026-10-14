import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Connections, GoogleConnection, OrgConnection } from "../api/identity";

/**
 * Slack and Notion on the console's side: what the API's answer becomes (and what an older
 * server's does), the connection store the rail, Settings and the chat read together, and
 * the paste-a-token form as the state machine it is.
 */

const { server } = vi.hoisted(() => ({
  server: { reply: null as unknown, fail: false, calls: 0 },
}));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true, API_URL: "http://api.test", ApiError,
    api: async () => {
      server.calls += 1;
      await Promise.resolve();
      if (server.fail) throw new ApiError(500, "internal", "Something went wrong on our side.");
      return server.reply;
    },
  };
});

const identity = await import("../api/identity");
const store = await import("../connectionsStore");
const flow = await import("../connectFlow");
const connectors = await import("../connectors");
const { SERVICES, INITIAL_CONNECTIONS } = await import("../moments");
const { ApiError } = await import("../api/client");

const GOOGLE: GoogleConnection = { available: true, status: "disconnected", accountEmail: null, scopes: [], products: [], connectedAt: null };
const slack = (over: Partial<OrgConnection> = {}): OrgConnection => ({
  provider: "slack", status: "connected", accountName: "superhyre", workspaceName: "Acme Hiring",
  connectedBy: { id: "u1", name: "Priya Nair" }, connectedAt: "2026-10-09T10:00:00Z", lastUsedAt: null, lastError: null,
  scopes: ["chat:write"], settings: {}, ...over,
});

beforeEach(() => {
  server.reply = null;
  server.fail = false;
  server.calls = 0;
  store.resetConnections();
});

describe("what the connections answer becomes", () => {
  it("reads a server that predates Slack and Notion as not connected, not as a failure", () => {
    const s = store.fromApi({ google: GOOGLE } as Connections);
    expect(s).toMatchObject({ status: "ready", slack: null, notion: null, oauth: { slack: false, notion: false } });
  });

  it("keeps a real connection whole, and which providers can sign in", () => {
    const s = store.fromApi({ google: GOOGLE, slack: slack(), notion: null, providers: { slack: { oauth: true }, notion: { oauth: false } } });
    expect(s.slack).toMatchObject({ provider: "slack", status: "connected", workspaceName: "Acme Hiring" });
    expect(s.oauth).toEqual({ slack: true, notion: false });
  });

  it("treats anything that isn't a connection as none", () => {
    for (const junk of [undefined, null, "yes", 7, {}, { status: "disconnected" }, { status: 3 }]) {
      expect(identity.orgConnectionOf(junk, "slack")).toBeNull();
    }
    expect(identity.orgConnectionOf({ status: "expired" }, "notion")).toMatchObject({ provider: "notion", status: "expired", scopes: [], settings: {} });
  });
});

describe("the connection store", () => {
  it("loads once and shares the answer", async () => {
    server.reply = { google: GOOGLE, slack: slack(), notion: null, providers: {} };
    await Promise.all([store.ensureConnections(), store.ensureConnections()]);
    await store.ensureConnections();
    expect(server.calls).toBe(1);
    expect(store.connectionsNow()).toMatchObject({ status: "ready", slack: { workspaceName: "Acme Hiring" }, notion: null });
  });

  it("says it couldn't load, keeps nothing, and tries again when asked", async () => {
    server.fail = true;
    await store.ensureConnections();
    expect(store.connectionsNow()).toMatchObject({ status: "failed", slack: null, error: "Couldn't check what's connected." });
    server.fail = false;
    server.reply = { google: GOOGLE, slack: null, notion: null };
    await store.reloadConnections();
    expect(store.connectionsNow().status).toBe("ready");
  });

  it("keeps what it knew when a refresh fails", async () => {
    server.reply = { google: GOOGLE, slack: slack(), notion: null };
    await store.ensureConnections();
    server.fail = true;
    await store.reloadConnections();
    expect(store.connectionsNow()).toMatchObject({ status: "ready", slack: { status: "connected" } });
  });

  it("shows a change at once, and forgets everything when the workspace changes", async () => {
    server.reply = { google: GOOGLE, slack: null, notion: null };
    await store.ensureConnections();
    store.applyOrgConnection("slack", slack());
    expect(store.connectionsNow().slack?.workspaceName).toBe("Acme Hiring");
    store.applyOrgConnection("slack", null);
    expect(store.connectionsNow().slack).toBeNull();
    store.applyOrgConnection("slack", slack());
    identity.workspaceChanged();
    expect(store.connectionsNow()).toMatchObject({ status: "idle", slack: null });
  });
});

describe("connecting with a pasted token", () => {
  const { tokenFlow, TOKEN_CLOSED } = flow;

  it("opens, checks, and closes on success", () => {
    let s = tokenFlow(TOKEN_CLOSED, { t: "open" });
    expect(s).toEqual({ s: "entering", error: null });
    s = tokenFlow(s, { t: "submit" });
    expect(s).toEqual({ s: "checking" });
    expect(tokenFlow(s, { t: "connected" })).toEqual(TOKEN_CLOSED);
  });

  it("goes back to the field with the server's reason when the token is refused", () => {
    const s = tokenFlow(tokenFlow(tokenFlow(TOKEN_CLOSED, { t: "open" }), { t: "submit" }), { t: "failed", message: "Slack said invalid_auth." });
    expect(s).toEqual({ s: "entering", error: "Slack said invalid_auth." });
    // and the next try starts clean
    expect(tokenFlow(s, { t: "submit" })).toEqual({ s: "checking" });
  });

  it("lets go of a form that was cancelled, but not one that is being checked", () => {
    const open = tokenFlow(TOKEN_CLOSED, { t: "open" });
    expect(tokenFlow(open, { t: "cancel" })).toEqual(TOKEN_CLOSED);
    const checking = tokenFlow(open, { t: "submit" });
    expect(tokenFlow(checking, { t: "cancel" })).toEqual(checking);
    expect(tokenFlow(checking, { t: "open" })).toEqual(checking);
  });

  it("ignores answers it didn't ask for", () => {
    expect(tokenFlow(TOKEN_CLOSED, { t: "connected" })).toEqual(TOKEN_CLOSED);
    expect(tokenFlow(TOKEN_CLOSED, { t: "failed", message: "x" })).toEqual(TOKEN_CLOSED);
  });

  it("refuses an empty paste before anything is sent, and leaves the shape of a token to the server", () => {
    expect(flow.tokenProblem("slack", "   ")).toBe("Paste the Slack token first.");
    expect(flow.tokenProblem("notion", "")).toBe("Paste the Notion token first.");
    expect(flow.tokenProblem("slack", "xoxb-1")).toBeNull();
    expect(flow.tokenProblem("notion", "anything the server may judge")).toBeNull();
  });

  it("says where a token comes from, for each", () => {
    expect(flow.TOKEN_HELP.slack.placeholder).toMatch(/^xoxb-/);
    expect(flow.TOKEN_HELP.slack.steps).toMatch(/chat:write/);
    expect(flow.TOKEN_HELP.notion.steps).toMatch(/share/i);
    for (const p of ["slack", "notion"] as const) expect(flow.TOKEN_HELP[p].link.href).toMatch(/^https:\/\//);
  });

  it("shows the server's own reason for a refusal, the way the other settings do", () => {
    const refused = new ApiError(400, "bad_request", "that doesn't look like a Slack bot token");
    expect(identity.readable(refused)).toBe("That doesn't look like a Slack bot token.");
    expect(identity.readable(new ApiError(403, "forbidden", "needs one of owner, admin"))).toBe("Only admins can do this.");
  });
});

describe("what a connection says about itself", () => {
  it("says who connected it, to what, and when it was last used", () => {
    expect(flow.connectionLine("slack", slack(), { ago: "2h ago" })).toBe("Connected to Acme Hiring by Priya Nair · used 2h ago");
    expect(flow.connectionLine("slack", slack(), { ago: "Just now" })).toBe("Connected to Acme Hiring by Priya Nair · used just now");
    expect(flow.connectionLine("slack", slack(), { byYou: true })).toBe("Connected to Acme Hiring by you");
    expect(flow.connectionLine("notion", slack({ workspaceName: null, accountName: null, connectedBy: null }))).toBe("Connected");
  });

  it("asks to reconnect once signed out, and shows why when it is not working", () => {
    expect(flow.connectionLine("slack", slack({ status: "expired" }))).toBe("Signed out. Reconnect to keep posting.");
    expect(flow.connectionLine("notion", slack({ status: "expired" }))).toBe("Signed out. Reconnect to keep saving notes.");
    expect(flow.connectionLine("slack", slack({ status: "error", lastError: "Slack said the token was revoked." }))).toBe(
      "Not working: Slack said the token was revoked. Reconnect to keep posting.",
    );
    expect(flow.connectionLine("slack", null)).toBe("Not connected");
  });

  it("reads the chosen channel and parent, and nothing it can't use", () => {
    expect(flow.chosenIn(slack({ settings: { defaultChannel: { id: "C1", name: "hiring" } } })).channel).toEqual({ id: "C1", name: "hiring" });
    expect(flow.chosenIn(slack({ settings: { defaultChannel: { id: 4 } } })).channel).toBeNull();
    expect(flow.chosenIn(slack({ settings: { defaultParent: { type: "database", id: "d1", title: "Notes" } } })).parent)
      .toEqual({ type: "database", id: "d1", title: "Notes" });
    expect(flow.chosenIn(slack({ settings: { defaultParent: { type: "folder", id: "x" } } })).parent).toBeNull();
    expect(flow.chosenIn(null)).toEqual({ channel: null, parent: null });
  });

  it("labels channels as the server describes them, including the ones the app hasn't been added to", () => {
    expect(flow.channelLabel({ name: "hiring", isPrivate: false, isMember: true })).toBe("#hiring");
    expect(flow.channelLabel({ name: "leadership", isPrivate: true, isMember: true })).toBe("#leadership (private)");
    expect(flow.channelLabel({ name: "random", isPrivate: false, isMember: false })).toBe("#random (add the app first)");
    expect(flow.channelLabel({ name: "#old", private: true })).toBe("#old (private)");
  });

  it("changes a setting without touching the rest", () => {
    const c = flow.withSetting(slack({ settings: { keep: 1 } }), "defaultChannel", { id: "C1", name: "hiring" });
    expect(c.settings).toEqual({ keep: 1, defaultChannel: { id: "C1", name: "hiring" } });
  });
});

describe("signing in with Slack or Notion", () => {
  it("reads the page the provider sent the browser back to", () => {
    expect(identity.providerReturnFrom("#/settings/connections?slack=complete&code=abc&state=x.y")).toEqual({ provider: "slack", kind: "complete", code: "abc", state: "x.y" });
    expect(identity.providerReturnFrom("#/settings/connections?notion=error&reason=denied")).toEqual({ provider: "notion", kind: "error", reason: "denied" });
    expect(identity.providerReturnFrom("#/settings/connections?slack=complete&code=abc")).toEqual({ provider: "slack", kind: "error", reason: "invalid" });
    expect(identity.providerReturnFrom("#/settings/connections?google=complete&code=a&state=b")).toBeNull();
    expect(identity.providerReturnFrom("#/settings/connections")).toBeNull();
  });

  it("leaves Google's return exactly as it was", () => {
    expect(identity.googleReturnFrom("#/settings/connections?slack=complete&code=abc&state=x")).toBeNull();
    expect(identity.googleReturnFrom("#/settings/connections?google=complete&code=4%2F0Ab&state=x.y")).toEqual({ kind: "complete", code: "4/0Ab", state: "x.y" });
  });

  it("says why it didn't work in plain words", () => {
    expect(identity.providerReasonText("slack", "denied")).toBe("Slack sign-in was cancelled. Nothing was connected.");
    expect(identity.providerReasonText("notion", "expired")).toMatch(/took too long/);
    expect(identity.providerReasonText("slack", "unavailable")).toMatch(/Paste a token/);
    expect(identity.providerReasonText("notion", "slack")).toBe("Notion couldn't be connected. Try again.");
  });
});

describe("the connect card in the chat", () => {
  it("knows Slack and Notion, and starts them disconnected", () => {
    expect(SERVICES.slack).toMatchObject({ name: "Slack", channel: "Slack" });
    expect(SERVICES.notion).toMatchObject({ name: "Notion", channel: "Notion" });
    expect(INITIAL_CONNECTIONS.slack).toBe("disconnected");
    expect(INITIAL_CONNECTIONS.notion).toBe("disconnected");
  });

  it("reads the organisation's connection as the card's state", () => {
    expect(connectors.orgState(null)).toBe("disconnected");
    expect(connectors.orgState(slack())).toBe("connected");
    expect(connectors.orgState(slack({ status: "expired" }))).toBe("expired");
    expect(connectors.orgState(slack({ status: "error" }))).toBe("expired");
  });

  it("connects Slack and Notion in Settings, not on the spot", () => {
    expect(connectors.IN_SETTINGS).toEqual(["slack", "notion"]);
  });
});

import { LIVE } from "./api/client";
import { gmailStateOf } from "./api/identity";
import type { ConnectProvider } from "./agentEvents";
import type { ConnectionsState } from "./connectionsStore";

/**
 * Where a connection stands, as the words a connect card says: one place, so the chat's card, the approval
 * beside it and a card returning from an earlier visit all read the same, and so the wording can be pinned.
 *
 * Pure: it is read from the shared connections store (the server's answer), never from what a card was
 * showing when it was made, which is why a card that comes back shows what is true now.
 */

export type ConnectState =
  /** The first answer has not arrived: nothing is claimed either way. */
  | { s: "checking" }
  /** The answer could not be fetched. */
  | { s: "unknown" }
  /** This server cannot sign in to the provider at all (Google is not set up here). */
  | { s: "unavailable"; why: string }
  | { s: "disconnected" }
  /** It was connected and stopped working: signed out, revoked, or missing what it needs. */
  | { s: "reconnect"; why: string }
  | { s: "connected"; as: string | null };

export const PROVIDER_LABEL: Readonly<Record<ConnectProvider, string>> = {
  google: "Google", slack: "Slack", notion: "Notion",
};

/** The first sentence of an error, without its full stop, for putting after a colon. */
const gist = (s: string | null | undefined): string => (s ?? "").trim().replace(/[.!?]+$/, "");

export function connectState(provider: ConnectProvider, c: ConnectionsState, live: boolean = LIVE): ConnectState {
  /* Not connected to a server (the prototype, a preview) nothing will ever answer: nothing is connected. */
  const known = !live || c.status === "ready" || (provider === "google" ? c.google !== null : c[provider] !== null);
  if (!known) return c.status === "failed" ? { s: "unknown" } : { s: "checking" };

  if (provider === "google") {
    const g = c.google;
    if (!g) return { s: "disconnected" };
    if (!g.available) return { s: "unavailable", why: g.reason ?? "Google sign-in isn't set up on this server yet." };
    const state = gmailStateOf(g);
    if (state === "connected") return { s: "connected", as: g.accountEmail };
    if (state === "disconnected") return { s: "disconnected" };
    if (g.status === "revoked") return { s: "reconnect", why: "Access was removed in Google. Connect again to use it." };
    if (g.status === "connected") {
      return { s: "reconnect", why: "Google didn't allow sending from Gmail. Connect again and leave every box ticked." };
    }
    return { s: "reconnect", why: "Google signed this account out, so emails can't go yet. Reconnect to keep sending." };
  }

  const conn = c[provider];
  if (!conn) return { s: "disconnected" };
  if (conn.status === "connected") return { s: "connected", as: conn.workspaceName ?? conn.accountName };
  const doing = provider === "slack" ? "posting" : "saving notes";
  if (conn.status === "expired") {
    return { s: "reconnect", why: `${PROVIDER_LABEL[provider]} signed this connection out. Reconnect to keep ${doing}.` };
  }
  const why = gist(conn.lastError);
  return {
    s: "reconnect",
    why: why ? `${why}. Reconnect to keep ${doing}.` : `${PROVIDER_LABEL[provider]} isn't working right now. Reconnect to keep ${doing}.`,
  };
}

/**
 * What a connection reads as when the server has just asked for it while this window still has it as on: the window's
 * knowledge is older than the failure, so the card says the connection needs mending until the store is read again.
 */
export function askedFor(provider: ConnectProvider, state: ConnectState, scheduling = false): ConnectState {
  if (state.s !== "connected") return state;
  return {
    s: "reconnect",
    why: scheduling
      ? "Google signed this account out, so meetings can't be scheduled yet. Reconnect to carry on."
      : `${PROVIDER_LABEL[provider]} signed this connection out. Reconnect to carry on.`,
  };
}

/** The parts of Google that are for scheduling: asking for them adds access to a sign-in that already exists. */
export type SchedulingProduct = "calendar" | "tasks";

/** "Add Calendar access", "Add Tasks access" or "Add Calendar & Tasks access": the one button's words. */
export const addAccessLabel = (products: readonly SchedulingProduct[]): string =>
  products.length > 1 ? "Add Calendar & Tasks access" : products[0] === "tasks" ? "Add Tasks access" : "Add Calendar access";

/**
 * Where Calendar and/or Tasks stands for a sign-in: on when every part asked for is allowed; otherwise the person
 * is asked to add it (they are signed in, just not for this), or to reconnect when the sign-in itself ran out.
 */
export function schedulingState(c: ConnectionsState, products: readonly SchedulingProduct[], live: boolean = LIVE): ConnectState {
  const base = connectState("google", c, live);
  const g = c.google;
  if (!g || base.s === "checking" || base.s === "unknown" || base.s === "unavailable") return base;
  if (g.status === "connected") {
    if (products.every((p) => g.products.includes(p))) return { s: "connected", as: g.accountEmail };
    return { s: "disconnected" };
  }
  if (g.status === "disconnected") return { s: "disconnected" };
  return { s: "reconnect", why: "Google signed this account out, so meetings can't be scheduled yet. Reconnect to carry on." };
}

/**
 * What the token form's button says. A refused token is the person's to fix, so the same button, once the reason
 * is on screen, says "Try again" instead of repeating the first ask ("Reconnect Slack", "Connect Notion").
 */
export function tokenButton(ask: string, checking: boolean, problem: string | null): string {
  if (checking) return "Connecting…";
  return problem ? "Try again" : ask;
}

/** What the card's heading says. Google's name is in its wordmark, so it is not written again. */
export function connectTitle(provider: ConnectProvider, state: ConnectState): string {
  const name = PROVIDER_LABEL[provider];
  const own = provider === "google";
  switch (state.s) {
    case "checking": return "Checking…";
    case "unknown": return "Couldn't check what's connected";
    case "unavailable": return own ? "Not available yet" : `${name} isn't available yet`;
    case "disconnected": return own ? "Not connected" : `${name} isn't connected`;
    case "reconnect": return own ? "Needs to be reconnected" : `${name} needs to be reconnected`;
    case "connected":
      if (own) return state.as ? `Connected as ${state.as}` : "Connected";
      return state.as ? `Connected to ${state.as}` : `${name} is connected`;
  }
}

/** The quiet next steps a connection offers once it is made: a test, as one tap. Notion has none. */
export const TESTS: Readonly<Record<ConnectProvider, ReadonlyArray<{ label: string; text: string }>>> = {
  google: [{ label: "Send me a test email", text: "Send me a test email" }],
  slack: [{ label: "Post a test message", text: "Post a test message to Slack" }],
  notion: [],
};

/** The words in the token field's help when the server sent none: one line, where to find it. */
export const TOKEN_WHERE: Readonly<Record<"slack" | "notion", { label: string; help: string }>> = {
  slack: {
    label: "Bot User OAuth Token",
    help: "Copy it from your Slack app's OAuth & Permissions page. It starts with xoxb-.",
  },
  notion: {
    label: "Integration secret",
    help: "Copy it from your Notion integration's Configuration tab.",
  },
};

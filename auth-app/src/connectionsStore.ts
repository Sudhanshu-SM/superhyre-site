import { useEffect, useSyncExternalStore } from "react";
import { LIVE } from "./api/client";
import { identityApi, onWorkspaceChange, orgConnectionOf } from "./api/identity";
import type { Connections, GoogleConnection, OrgConnection, OrgProvider } from "./api/identity";

/**
 * What the workspace is connected to, as live state: the person's Google account and the
 * organisation's Slack and Notion.
 *
 * One store because four places read it and must agree: the Agent page's channels, the
 * agent chat's connect cards, an approval waiting on a service, and Settings, whose
 * connect and disconnect write here so the rest moves at once instead of on a reload.
 *
 * A server that predates Slack and Notion answers with Google alone. That reads as "not
 * connected", not as a failure; a failed request is the only thing that reads as one.
 */

export type ConnectionsState = {
  /** "idle" until something asks; "failed" keeps whatever was known before. */
  status: "idle" | "loading" | "ready" | "failed";
  google: GoogleConnection | null;
  slack: OrgConnection | null;
  notion: OrgConnection | null;
  /** Whether the server can sign in to the provider, beyond a pasted token. */
  oauth: Readonly<Record<OrgProvider, boolean>>;
  error: string | null;
  /** When the last good answer arrived (ms), so a page doesn't ask again within a moment. */
  at: number;
};

const EMPTY: ConnectionsState = {
  status: "idle", google: null, slack: null, notion: null, oauth: { slack: false, notion: false }, error: null, at: 0,
};

let state: ConnectionsState = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: ConnectionsState): void {
  state = next;
  for (const l of listeners) l();
}

/** The API's answer as store state; whatever a server doesn't send is "not connected". */
export function fromApi(c: Connections, at = Date.now()): ConnectionsState {
  return {
    status: "ready",
    google: c.google ?? null,
    slack: orgConnectionOf(c.slack, "slack"),
    notion: orgConnectionOf(c.notion, "notion"),
    oauth: { slack: c.providers?.slack?.oauth === true, notion: c.providers?.notion?.oauth === true },
    error: null,
    at,
  };
}

const FRESH_MS = 20_000;

/** Loads once, then again only when the answer has gone stale or `force` says so. */
export function ensureConnections(force = false): Promise<void> {
  if (!LIVE) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && state.status === "ready" && Date.now() - state.at < FRESH_MS) return Promise.resolve();
  // Keeps what is on screen while it refreshes: a refresh is not a blank.
  if (state.status !== "ready") set({ ...state, status: "loading", error: null });
  inflight = identityApi.connections()
    .then((c) => set(fromApi(c)))
    .catch(() => set({ ...state, status: state.status === "ready" ? "ready" : "failed", error: "Couldn't check what's connected." }))
    .finally(() => { inflight = null; });
  return inflight;
}

export const reloadConnections = (): Promise<void> => ensureConnections(true);

/** After connecting or changing one provider: the answer replaces the guess at once. */
export function applyOrgConnection(provider: OrgProvider, connection: OrgConnection | null): void {
  set({ ...state, status: "ready", [provider]: connection, error: null, at: Date.now() });
}

/** Test-only, and when the workspace changes: nothing carries over from the last one. */
export function resetConnections(): void {
  inflight = null;
  set(EMPTY);
}
onWorkspaceChange(resetConnections);

export function useConnections(): ConnectionsState {
  useEffect(() => { void ensureConnections(); }, []);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
    // Rendered on the server (a test, or a card drawn to markup): the same snapshot.
    () => state,
  );
}

/** Outside React, for the chat's connect cards. */
export const connectionsNow = (): ConnectionsState => state;

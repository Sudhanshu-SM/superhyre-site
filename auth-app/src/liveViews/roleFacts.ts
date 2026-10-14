import { useSyncExternalStore } from "react";
import { specApi } from "../api/agent";
import { onWorkspaceChange } from "../api/identity";
import { getCampaign } from "../api/campaigns";
import type { RoleFacts } from "../formKit";
import { roleFactsFrom } from "../formKit";

/**
 * What a campaign's role spec and setup say, read once per campaign and kept for the session, so
 * the form questions and the draft that follows both start from the same facts. Only an approved
 * spec counts (a draft one is the agent's guess); without one the campaign's own must-haves
 * stand in, and a campaign with neither starts from its name alone, as a draft always did.
 */

export type RoleRead =
  | { state: "loading" }
  | {
      state: "ready";
      facts: RoleFacts | null;
      /** Where the facts came from, for the line that says so. */
      source: "spec" | "setup" | "none";
    };

const reads = new Map<string, RoleRead>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; for (const l of listeners) l(); };

const LOADING: RoleRead = { state: "loading" };

/** Starts reading a campaign's role if nobody has. Safe to call from a render: it only ever starts one read. */
export function warmRole(campaignId: string): void {
  if (reads.has(campaignId)) return;
  reads.set(campaignId, LOADING);
  void Promise.all([
    specApi.get(campaignId).catch(() => null),
    getCampaign(campaignId).catch(() => null),
  ]).then(([spec, campaign]) => {
    const row = spec?.approved ?? null;
    const facts = roleFactsFrom(row?.spec ?? null, campaign?.setup ?? null);
    const fromSpec = !!row?.spec.requirements.length;
    reads.set(campaignId, {
      state: "ready",
      facts,
      source: !facts ? "none" : fromSpec ? "spec" : "setup",
    });
    emit();
  });
}

/** What has been read so far, without waiting. */
export function peekRole(campaignId: string): RoleRead {
  return reads.get(campaignId) ?? LOADING;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The campaign's role, reading it if needed; re-renders when it arrives. */
export function useRole(campaignId: string | null): RoleRead {
  useSyncExternalStore(subscribe, () => version);
  if (!campaignId) return LOADING;
  warmRole(campaignId);
  return peekRole(campaignId);
}

/** Re-renders when any role arrives, for a view that builds questions from them. */
export function useRoleVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** For tests, and when the workspace changes: the last one's campaigns are not this one's. */
export function resetRoles(): void { reads.clear(); version = 0; }
onWorkspaceChange(resetRoles);

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { listCandidates } from "./api/candidates";
import { LIVE } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { resolveCampaignId } from "./campaignStore";
import { onInvalidate } from "./invalidate";

/**
 * The email and phone values of the people on one campaign, for a table that shows them (the Shortlisted table's
 * "Email" and "Phone" columns). They come from the workspace's own candidate rows, the one place a value is
 * kept: the API sends them to people who may see them and as null to everyone else, so nothing is masked or
 * unmasked here. Read once when the table opens and again whenever people or their details changed.
 */

export type ContactValue = { email: string | null; phone: string | null };
type Values = ReadonlyMap<string, ContactValue>;

const EMPTY: Values = new Map();
const values = new Map<string, Values>();
const ready = new Set<string>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Five pages of a hundred: a shortlist is far smaller, and a runaway list never keeps the table waiting. */
const PAGE = 100;
const MAX_PAGES = 5;

async function read(campaignId: string): Promise<void> {
  const next = new Map<string, ContactValue>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { rows, nextCursor }: Awaited<ReturnType<typeof listCandidates>> = await listCandidates({ campaignId, sort: "recent", cursor, limit: PAGE });
    for (const r of rows) next.set(r.id, { email: r.email, phone: r.phone });
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  values.set(campaignId, next);
  ready.add(campaignId);
  emit();
}

/** Reads them (or again). Quiet: what is on screen stays until the new values replace it. */
export function loadContactValues(campaignId: string): Promise<void> {
  if (!LIVE || !campaignId) return Promise.resolve();
  const id = resolveCampaignId(campaignId);
  const have = loading.get(id);
  if (have) return have;
  const run = read(id).catch(() => {
    // Nothing to show is "On file", never an error line over a table of people.
    ready.add(id);
    emit();
  }).finally(() => { loading.delete(id); });
  loading.set(id, run);
  return run;
}

/** Details changed (fetched, typed in, a person added or removed): the campaigns being shown read them again. */
const watching = new Map<string, number>();
onInvalidate((effects, campaigns) => {
  if (!effects.has("candidates") && !effects.has("pipeline")) return;
  for (const id of watching.keys()) {
    if (campaigns.has(null) || campaigns.has(id)) void loadContactValues(id);
  }
});
onWorkspaceChange(() => { values.clear(); ready.clear(); loading.clear(); emit(); });

/** The values for a campaign's people by candidate id, and whether they have arrived. */
export function useContactValues(campaignId: string | null | undefined): { values: Values; ready: boolean } {
  const id = campaignId ? resolveCampaignId(campaignId) : null;
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const map = useSyncExternalStore(subscribe, () => (id ? values.get(id) ?? EMPTY : EMPTY), () => EMPTY);
  const done = useSyncExternalStore(subscribe, () => (id ? ready.has(id) : false), () => false);
  useEffect(() => {
    if (!id || !LIVE) return;
    watching.set(id, (watching.get(id) ?? 0) + 1);
    if (!ready.has(id)) void loadContactValues(id);
    return () => {
      const n = (watching.get(id) ?? 1) - 1;
      if (n <= 0) watching.delete(id); else watching.set(id, n);
    };
  }, [id]);
  return { values: map, ready: done };
}

/** Tests: forget everything. */
export function resetContactValues(): void {
  values.clear();
  ready.clear();
  loading.clear();
  watching.clear();
}

import { useEffect, useState } from "react";
import type { MatchList } from "../api/agent";
import { api, LIVE } from "../api/client";
import { follow } from "../api/events";
import { applySearch, newSearch } from "../liveChat";
import type { Search } from "../liveChat";

/**
 * The people a role spec card shows under itself, drawn by the same list the chat's searches use (`SearchRun`): the
 * stages while a search works, the ranked cards as people are scored, the same actions on each. A search is a `Search`
 * state, built here from a run's events (live), or from the campaign's ranked list (after a reload, or a run long over).
 */

/** A run followed from its first event, so a card opened while it still works rebuilds all of it and carries on. */
export function useRunSearch(runId: string | null, campaignId: string, stamp = ""): Search | null {
  const [search, setSearch] = useState<Search | null>(null);
  useEffect(() => {
    if (!runId) { setSearch(null); return; }
    let s = newSearch(runId, campaignId);
    setSearch(s);
    return follow({ runId }, 0, (e) => { s = applySearch(s, e); setSearch(s); });
  }, [runId, campaignId]);
  /* Once it is over, scores that come in late (the model answers after the run ended) are read in as the numbers move. */
  const over = search !== null && search.status !== "running";
  useEffect(() => {
    if (!over || !runId || !LIVE) return;
    let live = true;
    api<MatchList>("GET", `/v1/campaigns/${campaignId}/matches`).then(
      (m) => live && setSearch((s) => (s && s.runId === runId ? { ...s, items: [...m.rows] } : s)),
      () => {},
    );
    return () => { live = false; };
  }, [over, runId, campaignId, stamp]);
  return search;
}

/** The campaign's ranked list as a finished search: who is waiting for a call, with their scores as they stand. */
export function searchFromMatches(campaignId: string, list: Pick<MatchList, "rows">): Search | null {
  if (list.rows.length === 0) return null;
  return {
    runId: `found:${campaignId}`, campaignId, size: null, pool: null, fresh: null,
    scored: list.rows.filter((m) => m.judgement !== null).length,
    items: [...list.rows], notices: [], phases: [], scoredIds: [], status: "done", error: null,
  };
}

/** The ranked list read again whenever `stamp` changes (the numbers moved, so some people were scored). */
export function useFoundSearch(campaignId: string, on: boolean, stamp: string): Search | null {
  const [search, setSearch] = useState<Search | null>(null);
  useEffect(() => {
    if (!on) { setSearch(null); return; }
    let live = true;
    api<MatchList>("GET", `/v1/campaigns/${campaignId}/matches`).then((m) => live && setSearch(searchFromMatches(campaignId, m)), () => {});
    return () => { live = false; };
  }, [campaignId, on, stamp]);
  return search;
}

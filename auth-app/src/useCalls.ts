import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallFilters, CallGroup, CallGroups, CallRow } from "./api/calls";
import { callGroups, listCalls } from "./api/calls";
import type { OutcomeCounts } from "./callsView";
import { LIVE } from "./api/client";
import { fixtureGroups, fixtureRows } from "./callsFixtures";
import { groupKey, mergeNamed, orderGroups } from "./callsView";
import { onInvalidate } from "./invalidate";

/**
 * The calls the page shows: the groups (a campaign each, with how many calls and the last), and the rows of
 * the groups that are open, a page at a time. One read of the groups says who is on the page and how many
 * calls each campaign has; a group's rows are read when it opens. Everything quiet: what is on screen stays
 * until the server's answer replaces it, and the model's summaries that are still being written are asked
 * for again a few times.
 */

export type GroupRows = {
  items: CallRow[];
  next: string | null;
  phase: "loading" | "ready" | "failed";
  more: "idle" | "loading" | "failed";
};

export type CallsData = {
  phase: "loading" | "ready" | "failed";
  groups: CallGroup[];
  callers: CallGroups["callers"];
  canSeeEveryone: boolean;
  total: number;
  rows: Readonly<Record<string, GroupRows>>;
  /** Groups shown because the search matched the campaign's or client's name: their rows are read without the word. */
  byName: ReadonlySet<string>;
  /** Per group, how many connected (for the thin bar); empty when one outcome is picked or the count could not be read. */
  outcomes: Readonly<Record<string, OutcomeCounts>>;
};

const PAGE = 25;
/** A campaign's own page reads it all in one go up to this many, and pages by it after. */
const OWN_PAGE = 50;
/** A summary that is still being written is asked for again after this, up to MAX_POLLS times. */
const POLL_MS = 5000;
const MAX_POLLS = 6;

const empty: CallsData = { phase: "loading", groups: [], callers: [], canSeeEveryone: false, total: 0, rows: {}, byName: new Set(), outcomes: {} };

const readGroups = (f: CallFilters): Promise<CallGroups> => (LIVE ? callGroups(f) : Promise.resolve(fixtureGroups(f)));

export function useCalls(options: {
  /** One campaign's calls, as the campaign's own page shows them; every campaign's otherwise. */
  campaignId?: string | undefined;
  filters: CallFilters;
  /** The groups to read rows for: the open ones. */
  open: ReadonlySet<string>;
}) {
  const { campaignId, filters, open } = options;
  const [data, setData] = useState<CallsData>(empty);
  // Counts what has been asked: a change of filters or an invalidation is a new view; answers for an old one are dropped.
  const [view, setView] = useState(0);
  const latest = useRef(0);
  /* The view the rows are asked for: an answer for an older view is dropped. (Not `latest`, which the groups'
     read bumps each time it runs: a development build runs every effect twice, and that dropped the rows.) */
  const viewNow = useRef(0);
  viewNow.current = view;
  const polls = useRef(0);
  const filterKey = JSON.stringify([filters, campaignId ?? null]);

  // A new set of filters is a new list: what was on screen is not an answer to it any more.
  const lastFilter = useRef(filterKey);
  useEffect(() => {
    if (lastFilter.current === filterKey) return;
    lastFilter.current = filterKey;
    polls.current = 0;
    setData((d) => ({ ...d, phase: "loading", rows: {} }));
    setView((v) => v + 1);
  }, [filterKey]);

  const refresh = useCallback(() => {
    setView((v) => v + 1);
  }, []);

  // Anything that changed a call (a note, an outcome, the agent) says so through invalidate().
  useEffect(
    () =>
      onInvalidate((effects) => {
        if (effects.has("calls")) {
          polls.current = 0;
          refresh();
        }
      }),
    [refresh],
  );

  // The groups.
  useEffect(() => {
    const mine = ++latest.current;
    // The word may name a campaign or its client (a search is for people, notes and words said, and for where
    // they were): the same filters without the word say which campaigns have calls at all.
    const word = filters.q?.trim();
    const byWord = word && !campaignId ? readGroups({ ...filters, q: undefined }) : Promise.resolve<CallGroups | null>(null);
    // The thin bar of each campaign: how many of its calls connected (only when no outcome is picked: every call
    // in the groups is that one then).
    const connectedRead = filters.outcome
      ? Promise.resolve<CallGroups | null>(null)
      : readGroups({ ...filters, outcome: "connected" }).catch(() => null);
    // The groups ignore the campaign filter; the callers do not, so a campaign's page names its own callers.
    const read = Promise.all([
      readGroups(campaignId ? { ...filters, campaignId } : filters),
      byWord.catch(() => null),
      connectedRead,
    ]);
    read.then(
      ([g, all, connected]) => {
        if (mine !== latest.current) return;
        // A campaign's own page is one group, whether or not it has calls yet.
        const own = campaignId ? g.groups.find((x) => groupKey(x) === campaignId) : undefined;
        const { groups: found, byName } = mergeNamed(g.groups, all?.groups ?? null, word ?? "");
        const groups = campaignId
          ? [{ campaign: { id: campaignId, name: own?.campaign?.name ?? "", client: own?.campaign?.client ?? null }, count: own?.count ?? 0, lastAt: own?.lastAt ?? new Date(0).toISOString() }]
          : orderGroups(found);
        // A count that could not be read leaves the bars off rather than showing none connected.
        const outcomes: Record<string, OutcomeCounts> = {};
        if (!filters.outcome && connected) {
          for (const x of groups) {
            const key = groupKey(x);
            outcomes[key] = { connected: connected.groups.find((y) => groupKey(y) === key)?.count ?? 0 };
          }
        }
        setData((d) => ({
          ...d,
          phase: "ready",
          groups,
          callers: g.callers,
          canSeeEveryone: g.canSeeEveryone,
          total: groups.reduce((n, x) => n + x.count, 0),
          byName,
          outcomes,
        }));
      },
      () => {
        if (mine === latest.current) setData((d) => ({ ...d, phase: d.groups.length ? d.phase : "failed" }));
      },
    );
    // `view` is the trigger: a change of filters bumps it (above), so the filters are read in their new state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // The rows of every open group, read again when the view changes.
  const loadedFor = useRef<Record<string, number>>({});
  const keys = useMemo(() => {
    if (campaignId) return [campaignId];
    return data.groups.map(groupKey).filter((k) => open.has(k));
  }, [campaignId, data.groups, open]);
  useEffect(() => {
    for (const key of keys) {
      if (loadedFor.current[key] === view) continue;
      loadedFor.current[key] = view;
      const mine = view;
      setData((d) => (d.rows[key] ? d : { ...d, rows: { ...d.rows, [key]: { items: [], next: null, phase: "loading", more: "idle" } } }));
      const f: CallFilters = { ...filters, campaignId: key, ...(data.byName.has(key) ? { q: undefined } : {}) };
      const read = LIVE ? listCalls(f, { limit: campaignId ? OWN_PAGE : PAGE }) : Promise.resolve(fixtureRows(f));
      read.then(
        (page) => {
          if (mine !== viewNow.current) return;
          setData((d) => ({ ...d, rows: { ...d.rows, [key]: { items: page.calls, next: page.nextCursor, phase: "ready", more: "idle" } } }));
        },
        () => {
          if (mine !== viewNow.current) return;
          setData((d) => {
            const kept = d.rows[key];
            return { ...d, rows: { ...d.rows, [key]: kept && kept.items.length ? kept : { items: [], next: null, phase: "failed", more: "idle" } } };
          });
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, view]);

  // Summaries still being written: look again a few times.
  const waiting = useMemo(
    () => Object.values(data.rows).some((g) => g.items.some((r) => r.summaryState === "pending")),
    [data.rows],
  );
  useEffect(() => {
    if (!waiting || polls.current >= MAX_POLLS) return;
    const id = window.setTimeout(() => {
      polls.current += 1;
      refresh();
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [waiting, data.rows, refresh]);

  const loadMore = useCallback(
    (key: string) => {
      const cur = data.rows[key];
      if (!cur?.next || cur.more === "loading") return;
      setData((d) => ({ ...d, rows: { ...d.rows, [key]: { ...cur, more: "loading" } } }));
      const f: CallFilters = { ...filters, campaignId: key, ...(data.byName.has(key) ? { q: undefined } : {}) };
      const mine = viewNow.current;
      listCalls(f, { limit: campaignId ? OWN_PAGE : PAGE, cursor: cur.next }).then(
        (page) => {
          if (mine !== viewNow.current) return;
          setData((d) => {
            const have = d.rows[key];
            if (!have) return d;
            const seen = new Set(have.items.map((r) => r.id));
            return {
              ...d,
              rows: { ...d.rows, [key]: { ...have, items: [...have.items, ...page.calls.filter((r) => !seen.has(r.id))], next: page.nextCursor, more: "idle" } },
            };
          });
        },
        () => {
          if (mine !== viewNow.current) return;
          setData((d) => (d.rows[key] ? { ...d, rows: { ...d.rows, [key]: { ...(d.rows[key] as GroupRows), more: "failed" } } } : d));
        },
      );
    },
    [data.rows, data.byName, filters],
  );

  return { ...data, refresh, loadMore };
}

/** Every row on the page, in the order the page shows them: the groups as listed, each group's rows as read. */
export function visibleRows(data: Pick<CallsData, "groups" | "rows">, open: ReadonlySet<string>, flat: boolean, cap?: number): CallRow[] {
  const out: CallRow[] = [];
  for (const g of data.groups) {
    const key = groupKey(g);
    if (!flat && !open.has(key)) continue;
    const items = data.rows[key]?.items ?? [];
    out.push(...(cap === undefined ? items : items.slice(0, cap)));
  }
  return out;
}


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityFilters, ActivityGroup, ActivityGroups, ActivityRow, ChannelCounts } from "./api/outreachActivity";
import { activityGroups, listActivity } from "./api/outreachActivity";
import { LIVE } from "./api/client";
import { groupKey, orderGroups } from "./callsView";
import { onInvalidate } from "./invalidate";
import { fixtureActivity, fixtureGroups } from "./outreachFixtures";

/**
 * The activity the Outreach page shows: the groups (a campaign each, with how many things and the last), the
 * channel counts for the switch, and the rows of the groups that are open, a page at a time. One read of the groups
 * says who is on the page and how many each campaign has; a group's rows are read when it opens. Everything quiet:
 * what is on screen stays until the server's answer replaces it, and a change made anywhere (a call's note, an
 * approval, the agent) reads it again.
 */

export type GroupRows = {
  items: ActivityRow[];
  next: string | null;
  phase: "loading" | "ready" | "failed";
  more: "idle" | "loading" | "failed";
};

export type ActivityData = {
  phase: "loading" | "ready" | "failed";
  groups: ActivityGroup[];
  channels: ChannelCounts;
  people: ActivityGroups["people"];
  canSeeEveryone: boolean;
  whatsappConnected: boolean;
  total: number;
  rows: Readonly<Record<string, GroupRows>>;
};

const PAGE = 25;
/** A campaign's own page reads up to this many at once and pages by it after. */
const OWN_PAGE = 50;

const NO_COUNTS: ChannelCounts = { all: 0, email: 0, whatsapp: 0, call: 0, callsConnected: 0 };
const empty: ActivityData = {
  phase: "loading", groups: [], channels: NO_COUNTS, people: [], canSeeEveryone: false, whatsappConnected: false, total: 0, rows: {},
};

const readGroups = (f: ActivityFilters): Promise<ActivityGroups> => (LIVE ? activityGroups(f) : Promise.resolve(fixtureGroups(f)));
const readRows = (f: ActivityFilters, page: { limit: number; cursor?: string | null }) =>
  LIVE ? listActivity(f, page) : Promise.resolve(fixtureActivity(f));

/** What a change anywhere may have moved: a call, an email's approval or send, the pipeline, a campaign. */
const MOVES = ["calls", "pipeline", "campaign", "candidates"] as const;

export function useOutreachActivity(options: {
  /** One campaign's outreach, as the campaign's own page shows it; every campaign's otherwise. */
  campaignId?: string | undefined;
  filters: ActivityFilters;
  /** The groups to read rows for: the open ones. */
  open: ReadonlySet<string>;
}) {
  const { campaignId, filters, open } = options;
  const [data, setData] = useState<ActivityData>(empty);
  const [view, setView] = useState(0);
  const latest = useRef(0);
  const viewNow = useRef(0);
  viewNow.current = view;
  const filterKey = JSON.stringify([filters, campaignId ?? null]);

  // A new set of filters is a new list: what was on screen is not an answer to it any more.
  const lastFilter = useRef(filterKey);
  useEffect(() => {
    if (lastFilter.current === filterKey) return;
    lastFilter.current = filterKey;
    setData((d) => ({ ...d, phase: "loading", rows: {} }));
    setView((v) => v + 1);
  }, [filterKey]);

  const refresh = useCallback(() => setView((v) => v + 1), []);

  useEffect(
    () => onInvalidate((effects) => { if (MOVES.some((m) => effects.has(m))) refresh(); }),
    [refresh],
  );

  // The groups and the counts.
  useEffect(() => {
    const mine = ++latest.current;
    readGroups(campaignId ? { ...filters, campaignId } : filters).then(
      (g) => {
        if (mine !== latest.current) return;
        const own = campaignId ? g.groups.find((x) => groupKey(x) === campaignId) : undefined;
        // A campaign's own page is one group, whether or not it has anything yet.
        const groups = campaignId
          ? [{
              campaign: { id: campaignId, name: own?.campaign?.name ?? "", client: own?.campaign?.client ?? null },
              count: own?.count ?? 0,
              lastAt: own?.lastAt ?? new Date(0).toISOString(),
            }]
          : orderGroups(g.groups);
        setData((d) => ({
          ...d,
          phase: "ready",
          groups,
          channels: g.channels,
          people: g.people,
          canSeeEveryone: g.canSeeEveryone,
          whatsappConnected: g.whatsapp.connected,
          total: groups.reduce((n, x) => n + x.count, 0),
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
      readRows({ ...filters, campaignId: key }, { limit: campaignId ? OWN_PAGE : PAGE }).then(
        (page) => {
          if (mine !== viewNow.current) return;
          setData((d) => ({ ...d, rows: { ...d.rows, [key]: { items: page.rows, next: page.nextCursor, phase: "ready", more: "idle" } } }));
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

  const loadMore = useCallback(
    (key: string) => {
      const cur = data.rows[key];
      if (!cur?.next || cur.more === "loading") return;
      setData((d) => ({ ...d, rows: { ...d.rows, [key]: { ...cur, more: "loading" } } }));
      const mine = viewNow.current;
      listActivity({ ...filters, campaignId: key }, { limit: campaignId ? OWN_PAGE : PAGE, cursor: cur.next }).then(
        (page) => {
          if (mine !== viewNow.current) return;
          setData((d) => {
            const have = d.rows[key];
            if (!have) return d;
            const seen = new Set(have.items.map((r) => r.id));
            return {
              ...d,
              rows: { ...d.rows, [key]: { ...have, items: [...have.items, ...page.rows.filter((r) => !seen.has(r.id))], next: page.nextCursor, more: "idle" } },
            };
          });
        },
        () => {
          if (mine !== viewNow.current) return;
          setData((d) => (d.rows[key] ? { ...d, rows: { ...d.rows, [key]: { ...(d.rows[key] as GroupRows), more: "failed" } } } : d));
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.rows, filterKey],
  );

  return { ...data, refresh, loadMore };
}

/** Every row on the page, in the order the page shows them: the groups as listed, each group's rows as read. */
export function visibleActivity(data: Pick<ActivityData, "groups" | "rows">, open: ReadonlySet<string>, flat: boolean, cap?: number): ActivityRow[] {
  const out: ActivityRow[] = [];
  for (const g of data.groups) {
    const key = groupKey(g);
    if (!flat && !open.has(key)) continue;
    const items = data.rows[key]?.items ?? [];
    out.push(...(cap === undefined ? items : items.slice(0, cap)));
  }
  return out;
}

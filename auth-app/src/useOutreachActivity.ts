import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityFilters, ActivityGroup, ActivityGroups, ActivityRow, ChannelCounts } from "./api/outreachActivity";
import { activityGroups, listActivity } from "./api/outreachActivity";
import { LIVE } from "./api/client";
import { groupKey, GROUP_ROWS, orderGroups, ROW_PAGE } from "./callsView";
import { onInvalidate } from "./invalidate";
import { isGoingOut, watchSend } from "./sendWatch";
import { fixtureActivity, fixtureGroups } from "./outreachFixtures";

/**
 * The activity the Outreach page shows: the groups (a campaign each, with how many things and the last), the
 * channel counts for the switch, and the rows of the groups that are open (the latest few of each, and a campaign's own
 * page a numbered page at a time). One read of the groups says who is on the page and how many each campaign has; a
 * group's rows are read when it opens. Everything quiet:
 * what is on screen stays until the server's answer replaces it, and a change made anywhere (a call's note, an
 * approval, the agent) reads it again.
 */

export type GroupRows = {
  items: ActivityRow[];
  /** The whole count under the filters, from the same read as the rows; null until it is read. */
  total: number | null;
  /** Where in the list these rows start: the page they answer. */
  offset: number;
  phase: "loading" | "ready" | "failed";
};

export type ActivityData = {
  phase: "loading" | "ready" | "failed";
  /** The filters (`activityKey`) these groups were read for: what is here answers that list and no other. */
  key: string;
  groups: ActivityGroup[];
  channels: ChannelCounts;
  people: ActivityGroups["people"];
  canSeeEveryone: boolean;
  whatsappConnected: boolean;
  total: number;
  rows: Readonly<Record<string, GroupRows>>;
};

const NO_COUNTS: ChannelCounts = { all: 0, email: 0, whatsapp: 0, call: 0, callsConnected: 0 };
const empty: ActivityData = {
  phase: "loading", key: "", groups: [], channels: NO_COUNTS, people: [], canSeeEveryone: false, whatsappConnected: false, total: 0, rows: {},
};

const readGroups = (f: ActivityFilters): Promise<ActivityGroups> => (LIVE ? activityGroups(f) : Promise.resolve(fixtureGroups(f)));
const readRows = (f: ActivityFilters, page: { limit: number; offset: number }) =>
  LIVE ? listActivity(f, page) : Promise.resolve(fixtureActivity(f, page));

/** Which list the page is asking for: the filters and the campaign, in one string. */
export const activityKey = (filters: ActivityFilters, campaignId?: string | undefined): string => JSON.stringify([filters, campaignId ?? null]);

/**
 * Whether the answer to `key` is whole: the groups were read for it, and so were the rows of every group that has to
 * show some (`needed`). Until then the page keeps what it had on screen (switchHold.ts) instead of a loader.
 */
export function activitySettled(
  d: Pick<ActivityData, "key" | "phase" | "rows">,
  key: string,
  needed: readonly string[],
  /** A campaign's own page: the rows have to be the page asked for, not the one before it. */
  offset?: number,
): boolean {
  if (d.key !== key || d.phase !== "ready") return false;
  return needed.every((k) => {
    const r = d.rows[k];
    return r !== undefined && r.phase !== "loading" && (offset === undefined || r.offset === offset);
  });
}

/** What a change anywhere may have moved: a call, an email's approval or send, the pipeline, a campaign. */
const MOVES = ["calls", "pipeline", "campaign", "candidates"] as const;

export function useOutreachActivity(options: {
  /** One campaign's outreach, as the campaign's own page shows it; every campaign's otherwise. */
  campaignId?: string | undefined;
  filters: ActivityFilters;
  /** The groups to read rows for: the open ones. */
  open: ReadonlySet<string>;
  /** A campaign's own page: where in its list the page starts (a multiple of ROW_PAGE). */
  offset?: number;
  /** A campaign's own page: how many rows a page holds (ROW_PAGE unless the window says otherwise). */
  pageSize?: number;
}) {
  const { campaignId, filters, open } = options;
  const offset = campaignId ? options.offset ?? 0 : 0;
  const pageSize = options.pageSize ?? ROW_PAGE;
  const [data, setData] = useState<ActivityData>(empty);
  const [view, setView] = useState(0);
  const latest = useRef(0);
  const viewNow = useRef(0);
  viewNow.current = view;
  const filterKey = activityKey(filters, campaignId);

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

  /* An email on its way out (approved, retried) is read again quickly until it has gone or failed, so its row says so
     without a reload; one set up for later is left alone. */
  const going = Object.values(data.rows).some((g) => g.items.some((r) => r.channel === "email" && isGoingOut(r, r.at)));
  const goingNow = useRef(going);
  goingNow.current = going;
  useEffect(() => {
    if (!LIVE || !going) return;
    return watchSend(() => {
      refresh();
      return goingNow.current;
    });
  }, [going, refresh]);

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
          key: filterKey,
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

  // The rows of every open group, read again when the view or the page changes.
  const loadedFor = useRef<Record<string, string>>({});
  const asked = useRef<Record<string, number>>({});
  const tickets = useRef(0);
  const keys = useMemo(() => {
    if (campaignId) return [campaignId];
    return data.groups.map(groupKey).filter((k) => open.has(k));
  }, [campaignId, data.groups, open]);
  useEffect(() => {
    for (const key of keys) {
      const stamp = `${view}|${offset}|${pageSize}`;
      if (loadedFor.current[key] === stamp) continue;
      loadedFor.current[key] = stamp;
      const mine = view;
      const ticket = (asked.current[key] = ++tickets.current);
      setData((d) => (d.rows[key] ? d : { ...d, rows: { ...d.rows, [key]: { items: [], total: null, offset, phase: "loading" } } }));
      readRows({ ...filters, campaignId: key }, { limit: campaignId ? pageSize : GROUP_ROWS, offset }).then(
        (page) => {
          if (mine !== viewNow.current || ticket !== asked.current[key]) return;
          setData((d) => ({ ...d, rows: { ...d.rows, [key]: { items: page.rows, total: page.total, offset, phase: "ready" } } }));
        },
        () => {
          if (mine !== viewNow.current || ticket !== asked.current[key]) return;
          setData((d) => {
            const kept = d.rows[key];
            return { ...d, rows: { ...d.rows, [key]: kept && kept.items.length ? kept : { items: [], total: null, offset, phase: "failed" } } };
          });
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, view, offset, pageSize]);

  /**
   * A call just logged by hand, on the list at once (see `withCall`); the next read replaces it with what the server
   * holds, and `dropRow` takes it out again if the server refused.
   */
  const addRow = useCallback(
    (row: ActivityRow, campaign: { name: string; client: string | null } | null) =>
      setData((d) => withCall(d, row, campaign, { campaignId, pageSize })),
    [campaignId, pageSize],
  );
  const dropRow = useCallback((id: string) => setData((d) => withoutCall(d, id)), []);

  return { ...data, refresh, addRow, dropRow };
}

/**
 * The list with a call just logged by hand in it: its campaign's count and last time, the channel counts, and its line
 * at the top of that campaign's rows when they are on screen (the first page only). A campaign's own page holds that
 * campaign's lines and no other's.
 */
export function withCall(
  d: ActivityData,
  row: ActivityRow,
  campaign: { name: string; client: string | null } | null,
  at: { campaignId?: string | undefined; pageSize: number },
): ActivityData {
  if (at.campaignId && row.campaignId !== at.campaignId) return d;
  const key = row.campaignId ?? "none";
  const known = d.groups.some((g) => groupKey(g) === key);
  const groups = known
    ? d.groups.map((g) => (groupKey(g) === key ? { ...g, count: g.count + 1, lastAt: g.lastAt > row.at ? g.lastAt : row.at } : g))
    : orderGroups([
        ...d.groups,
        {
          campaign: row.campaignId ? { id: row.campaignId, name: campaign?.name ?? row.campaignName ?? "A campaign", client: campaign?.client ?? null } : null,
          count: 1,
          lastAt: row.at,
        },
      ]);
  const there = d.rows[key];
  const rows =
    there && there.offset === 0 && !there.items.some((r) => r.id === row.id)
      ? {
          ...d.rows,
          [key]: {
            ...there,
            items: [row, ...there.items].slice(0, at.campaignId ? at.pageSize : Math.max(there.items.length, GROUP_ROWS)),
            total: (there.total ?? there.items.length) + 1,
          },
        }
      : d.rows;
  return {
    ...d,
    groups,
    rows,
    total: d.total + 1,
    channels: {
      ...d.channels,
      all: d.channels.all + 1,
      call: d.channels.call + 1,
      callsConnected: d.channels.callsConnected + (row.status === "connected" ? 1 : 0),
    },
  };
}

/** The list without a call that was shown before the server answered and was refused. */
export function withoutCall(d: ActivityData, id: string): ActivityData {
  let gone: ActivityRow | null = null;
  const rows = Object.fromEntries(
    Object.entries(d.rows).map(([k, g]) => {
      const hit = g.items.find((r) => r.id === id);
      if (!hit) return [k, g];
      gone = hit;
      return [k, { ...g, items: g.items.filter((r) => r.id !== id), total: g.total === null ? null : Math.max(0, g.total - 1) }];
    }),
  );
  const removed = gone as ActivityRow | null;
  if (!removed) return d;
  const key = removed.campaignId ?? "none";
  return {
    ...d,
    rows,
    total: Math.max(0, d.total - 1),
    groups: d.groups.map((g) => (groupKey(g) === key ? { ...g, count: Math.max(0, g.count - 1) } : g)),
    channels: {
      ...d.channels,
      all: Math.max(0, d.channels.all - 1),
      call: Math.max(0, d.channels.call - 1),
      callsConnected: Math.max(0, d.channels.callsConnected - (removed.status === "connected" ? 1 : 0)),
    },
  };
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

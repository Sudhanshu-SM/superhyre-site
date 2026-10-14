import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OverviewAgent } from "../AgentsOverview";
import { messageOf } from "../api/client";
import type { ViewCard } from "../chatViews";
import type { Recent, WatchAction, WatchAgent } from "../liveAgents";
import {
  applyAgent,
  controlAgent,
  rankAgents,
  recentAgents,
  recentWork,
  toOverviewAgent,
  useWatchAgents,
  visibleAgents,
} from "../liveAgents";
import { useLiveChat } from "../liveChat";
import { PhaseBlock } from "../Sourcing";
import type { Phase } from "../sourcing";

/**
 * What the Status and Assign views share: the agents as the fleet components draw them, what the
 * server recorded about the one being looked at, and the controls that act on the real watch.
 */

/** Ticks so "12 min ago" and "next check in 2 h" keep up while a view stays on screen. */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Whether this card arrived in the turn that is on screen now, not in a chat opened from history. */
export function useFresh(card: Pick<ViewCard, "key">, said: string): boolean {
  const chat = useLiveChat();
  const [fresh] = useState(() => {
    const turn = chat.turns.find((t) => t.said === said && t.cards.some((c) => c.key === card.key));
    return !!turn && Date.now() - turn.startedAt < 3 * 60_000;
  });
  return fresh;
}

const keyOf = (a: WatchAgent) =>
  `${a.state}|${a.stateReason ?? ""}|${a.lastRunAt ?? ""}|${a.counters.found}|${a.updatedAt ?? ""}`;

export function useFleet(opts: { selected: string | null; open: boolean }) {
  const { status, agents, error, reload } = useWatchAgents();
  const now = useNow();
  const [recent, setRecent] = useState<Readonly<Record<string, { key: string; data: Recent }>>>({});

  /* What the server recorded about the agent being looked at, read when it is opened and again
     whenever the agent has moved (it searched, was paused, was stopped). */
  const target = opts.open && opts.selected ? agents.find((a) => a.id === opts.selected) : undefined;
  const targetNow = useRef(target);
  targetNow.current = target;
  const targetId = target?.id ?? null;
  const targetKey = target ? keyOf(target) : null;
  useEffect(() => {
    const t = targetNow.current;
    if (!t || !targetId || !targetKey) return;
    let live = true;
    const keep = (data: Recent) => live && setRecent((r) => ({ ...r, [targetId]: { key: targetKey, data } }));
    void recentWork(t).then(keep, () => keep({ activity: [], searches: 0 }));
    return () => {
      live = false;
    };
  }, [targetId, targetKey]);

  /* The overview lists what is going and what finished lately; the strip, fewer. */
  const views = useMemo<OverviewAgent[]>(
    () =>
      rankAgents(recentAgents(agents, now)).map((a) => toOverviewAgent(a, recent[a.id]?.data ?? null, now)),
    [agents, recent, now],
  );
  const stripIds = useMemo(() => new Set(visibleAgents(agents, now).map((a) => a.id)), [agents, now]);

  /** Pause, resume or stop the real agent. Resolves to the server's sentence when it refused. */
  const control = useCallback(async (id: string, action: string): Promise<string | null> => {
    try {
      applyAgent(await controlAgent(id, action as WatchAction));
      return null;
    } catch (err) {
      return messageOf(err);
    }
  }, []);

  return { status, error, reload, agents, views, stripIds, control };
}

/**
 * The phase line a view opens with: live while the data is on its way, settled with how long
 * it really took once it lands.
 */
export function Checked({
  phase,
  ready,
  steps,
}: {
  phase: Omit<Phase, "ms" | "says" | "steps">;
  ready: boolean;
  steps: readonly string[];
}): JSX.Element {
  const started = useRef(Date.now());
  const [took, setTook] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (ready) setTook((t) => t ?? Date.now() - started.current);
  }, [ready]);
  return <PhaseBlock phase={{ ...phase, ms: 0, says: "", steps }} tookMs={took} n={0} />;
}

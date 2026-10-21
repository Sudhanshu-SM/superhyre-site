import { useEffect, useRef, useState } from "react";

/**
 * Every wait on the screen has a limit. After the soft one a calm "Taking longer than usual" line appears, with
 * Try again or Cancel where there is something to do; after the hard one the wait is over and it says so, with a way
 * on. Nothing spins for ever and nothing turns red.
 *
 *   const slow = useSlowWhile(approval.deciding, { soft: 12_000, hard: 90_000 });
 *   <SlowNote level={slow} onRetry={...} onCancel={...} />
 */
export type SlowLevel = "ok" | "slow" | "stuck";
export type SlowLimits = { soft?: number; hard?: number };

/** Defaults: a line after 15 seconds, over after a minute. Anything with its own rhythm says so. */
export const SLOW_SOFT_MS = 15_000;
export const SLOW_HARD_MS = 60_000;

/** Where a wait that began at `startedAt` stands at `now` (null: nothing is being waited for). */
export function slowLevel(startedAt: number | null | undefined, now: number, limits: SlowLimits = {}): SlowLevel {
  if (startedAt === null || startedAt === undefined) return "ok";
  const waited = now - startedAt;
  if (waited >= (limits.hard ?? SLOW_HARD_MS)) return "stuck";
  return waited >= (limits.soft ?? SLOW_SOFT_MS) ? "slow" : "ok";
}

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
const real: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

/**
 * Calls `onLevel` when the wait crosses each limit (and once at the start with where it already is), and stops when
 * the returned function is called. Two timers at most: nothing ticks, so nothing re-renders every second.
 */
export function watchSlow(
  startedAt: number,
  limits: SlowLimits,
  onLevel: (level: SlowLevel) => void,
  now: () => number = Date.now,
  timers: Timers = real,
): () => void {
  const soft = limits.soft ?? SLOW_SOFT_MS;
  const hard = limits.hard ?? SLOW_HARD_MS;
  const ids: unknown[] = [];
  onLevel(slowLevel(startedAt, now(), limits));
  const waited = now() - startedAt;
  if (waited < soft) ids.push(timers.set(() => onLevel("slow"), soft - waited));
  if (waited < hard) ids.push(timers.set(() => onLevel("stuck"), hard - waited));
  return () => { for (const id of ids) timers.clear(id); };
}

/** The level of a wait that began at `startedAt` (null: none), moving as it crosses the limits. */
export function useSlowState(startedAt: number | null | undefined, limits: SlowLimits = {}): SlowLevel {
  const [level, setLevel] = useState<SlowLevel>(() => slowLevel(startedAt, Date.now(), limits));
  const soft = limits.soft;
  const hard = limits.hard;
  useEffect(() => {
    if (startedAt === null || startedAt === undefined) { setLevel("ok"); return undefined; }
    return watchSlow(startedAt, { ...(soft !== undefined ? { soft } : {}), ...(hard !== undefined ? { hard } : {}) }, setLevel);
  }, [startedAt, soft, hard]);
  return level;
}

/** The same for a wait with no start time of its own: it starts when `active` becomes true and ends when it stops. */
export function useSlowWhile(active: boolean, limits: SlowLimits = {}): SlowLevel {
  const since = useRef<number | null>(null);
  if (active && since.current === null) since.current = Date.now();
  if (!active) since.current = null;
  return useSlowState(active ? since.current : null, limits);
}

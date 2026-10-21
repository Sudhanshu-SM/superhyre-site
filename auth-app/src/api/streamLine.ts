import { useSyncExternalStore } from "react";

/**
 * Whether the line that carries a chat's and a run's events is up. It says "reconnecting" only for a stream that
 * has been down for a while (the delay lives in `follow`); a blip that mends itself is never shown. Several
 * streams may be followed at once: it is reconnecting while any of them is.
 */
export type StreamLine = "live" | "reconnecting";

const down = new Set<symbol>();
const listeners = new Set<() => void>();
let line: StreamLine = "live";

/** Marks one followed stream as down (`true`) or up (`false`). */
export function setStreamDown(id: symbol, isDown: boolean): void {
  if (isDown) down.add(id);
  else down.delete(id);
  const next: StreamLine = down.size > 0 ? "reconnecting" : "live";
  if (next === line) return;
  line = next;
  for (const l of listeners) l();
}

export const streamLine = (): StreamLine => line;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** For a quiet "Reconnecting…" beside whatever is waiting on the stream. */
export function useStreamLine(): StreamLine {
  return useSyncExternalStore(subscribe, streamLine, streamLine);
}

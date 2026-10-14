import { useSyncExternalStore } from "react";
import { workspaceSettling } from "./api/client";

/**
 * When a change the screen already shows is refused by the API, the store
 * puts it back and says so here, in one short line. Separate from the toast,
 * which always carries a check mark and means "done".
 *
 * One line at a time, drawn by the console's one `Toaster` (toast.tsx), so a failure is seen
 * whichever page it came from. The same line twice is one line, and nothing is said about requests that
 * only failed because the person's workspace changed under them (the tab reloads into the new one).
 */

export type Problem = { text: string; n: number };

let current: Problem | null = null;
let n = 0;
let timer = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function reportProblem(text: string) {
  if (workspaceSettling()) return;
  if (current && current.text === text) return;
  n += 1;
  current = { text, n };
  emit();
  if (typeof window === "undefined") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { current = null; emit(); }, 4000);
}

/** The line on screen now, outside React (tests). */
export const problemNow = (): Problem | null => current;

export function useProblem(): Problem | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}

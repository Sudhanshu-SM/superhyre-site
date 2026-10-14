import { lazy } from "react";

/**
 * The console is a file of its own: someone who is only signing in does not download it, and the sign-in
 * form is not held up by it. A returning person's browser starts fetching it the moment the app starts, in
 * parallel with finding out who they are (see `prefetchConsole`), so it is usually there by the time it is asked for.
 */
export const loadConsole = () => import("./Console");

export const Console = lazy(() => loadConsole().then((m) => ({ default: m.Console })));

/** Supabase keeps its session under `sb-<project>-auth-token`: its presence says "someone has signed in here". */
export function hasStoredSession(storage: Pick<Storage, "length" | "key"> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) return true;
    }
  } catch { /* storage that throws is a private window: nothing is remembered */ }
  return false;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let started = false;

/** Starts fetching the console now, once. Failing quietly: the real request, when it comes, reports its own. */
export function prefetchConsole(): void {
  if (started) return;
  started = true;
  void loadConsole().catch(() => { started = false; });
}
